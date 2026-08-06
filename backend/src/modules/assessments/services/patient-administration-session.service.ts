import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { AuthService } from '../../auth/services/auth.service';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import { PatientsService } from '../../patients/services/patients.service';
import type {
  PatientAdministrationStepConfigSummary,
  ScaleVersionSummary,
} from '../../scales/services/scales.service';
import {
  PresentationAssetsService,
  type OpenedPresentationAsset,
  type VerifiedPresentationAsset,
  type VerifiedPresentationAssetPackage,
} from '../../scales/services/presentation-assets.service';
import { ScalesService } from '../../scales/services/scales.service';
import { normalizeScaleInstanceSubmissionWriteBarrier } from '../lib/scale-instance-submission-write-barrier';
import {
  PATIENT_ADMINISTRATION_ENTRY_CODE_LENGTH,
  PATIENT_ADMINISTRATION_ENTRY_CODE_RETRY_LIMIT,
  PATIENT_ADMINISTRATION_ENTRY_CODE_TTL_MS,
  PATIENT_ADMINISTRATION_ENTRY_RATE_LIMIT_MAX_FAILURES,
  PATIENT_ADMINISTRATION_ENTRY_RATE_LIMIT_WINDOW_MS,
  PATIENT_ADMINISTRATION_EVIDENCE_TYPES,
  PATIENT_ADMINISTRATION_OPEN_STATUSES,
  PATIENT_ADMINISTRATION_SESSION_TTL_MS,
} from '../patient-administration.constants';
import type {
  PatientAdministrationControlEventAction,
  PatientAdministrationEvidenceType,
  PatientAdministrationImpactFactorCode,
  PatientAdministrationOpenStatus,
} from '../patient-administration.constants';
import type { AssessmentOperatorSnapshot } from '../schemas/assessment-visit.schema';
import {
  PatientAdministrationPlaybackFact,
  PatientAdministrationSession,
  PatientAdministrationStepEvidenceRef,
  PatientAdministrationStepCapture,
  type PatientAdministrationSessionDocument,
} from '../schemas/patient-administration-session.schema';
import {
  ScaleInstance,
  type ScaleInstanceDocument,
} from '../schemas/scale-instance.schema';
import type {
  AssessmentVisitSummary,
  ScaleInstanceSummary,
} from './assessments.service';
import { AssessmentsService } from './assessments.service';
import type {
  PatientAdministrationCredentialResponse,
  PatientAdministrationCurrentResponse,
  AttachPatientAdministrationEvidenceInput,
  PatientAdministrationEvidenceUploadContext,
  PatientAdministrationEntryCodeResponse,
  PatientAdministrationOpenedAsset,
  PatientAdministrationOperatorResponse,
  PatientAdministrationPlayedAudio,
  PatientAdministrationRequestContext,
  PatientAdministrationSessionSummaryResponse,
} from '../types/patient-administration-response.types';

const EDITABLE_STATUSES = new Set(['draft', 'in_progress']);

type EntryRateLimitState = {
  windowStartedAt: number;
  failedAttempts: number;
};

type MongoDuplicateKeyError = {
  code: number;
  keyPattern?: Record<string, unknown>;
};

type ScaleInstanceIdentityLean = {
  _id: Types.ObjectId;
  patientId: Types.ObjectId;
  assessmentVisitId: Types.ObjectId;
};

type AdministrationBusinessContext = {
  visit: AssessmentVisitSummary;
  scaleInstance: ScaleInstanceSummary;
  scaleVersion: ScaleVersionSummary;
  orderedSteps: PatientAdministrationStepConfigSummary[];
  currentStep: PatientAdministrationStepConfigSummary;
  presentationPackage: VerifiedPresentationAssetPackage;
};

export type PatientAdministrationCredentialIssue = {
  rawToken: string;
  expiresAt: Date;
  response: PatientAdministrationCredentialResponse;
};

export type PatientAdministrationStaffCredentialIssue = {
  rawToken: string;
  expiresAt: Date;
  response: PatientAdministrationSessionSummaryResponse;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMongoDuplicateKeyError(
  error: unknown,
): error is MongoDuplicateKeyError {
  return isRecord(error) && error.code === 11000;
}

@Injectable()
export class PatientAdministrationSessionService {
  private readonly entryRateLimits = new Map<string, EntryRateLimitState>();

  constructor(
    @InjectModel(PatientAdministrationSession.name)
    private readonly patientAdministrationSessionModel: Model<PatientAdministrationSessionDocument>,
    @InjectModel(ScaleInstance.name)
    private readonly scaleInstanceModel: Model<ScaleInstanceDocument>,
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly scalesService: ScalesService,
    private readonly presentationAssetsService: PresentationAssetsService,
    private readonly authService: AuthService,
  ) {}

  buildOperatorSnapshot(
    currentUser: AuthenticatedUserContext | undefined,
  ): AssessmentOperatorSnapshot {
    if (!currentUser) {
      throw new UnauthorizedException();
    }

    const operatorRole = (
      ['doctor', 'nurse', 'research_assistant', 'admin'] as const
    ).find((role) => currentUser.roles.includes(role));

    return {
      operatorId: new Types.ObjectId(currentUser.id),
      operatorName:
        currentUser.displayName.trim() || currentUser.accountName.trim(),
      operatorRole: operatorRole ?? 'unknown',
    };
  }

  buildEntryClientKey(
    ipAddress: string | undefined,
    userAgent: string | undefined,
  ): string {
    return this.authService.hashSessionToken(
      `${ipAddress?.trim() ?? ''}\n${userAgent?.trim() ?? ''}`,
    );
  }

  async createSession(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    operatorSnapshot: AssessmentOperatorSnapshot,
  ): Promise<PatientAdministrationEntryCodeResponse> {
    const business = await this.requireBusinessContinuation(
      patientId,
      visitId,
      scaleInstanceId,
      undefined,
      true,
    );
    const now = new Date();
    await this.expireOpenSessionForScaleInstance(
      business.scaleInstance.id,
      now,
    );

    const openSession = await this.findOpenSessionByScaleInstance(
      business.scaleInstance.id,
    );
    if (openSession) {
      this.throwSessionConflict();
    }

    const expiresAt = new Date(
      now.getTime() + PATIENT_ADMINISTRATION_SESSION_TTL_MS,
    );
    const entryCodeExpiresAt = new Date(
      Math.min(
        now.getTime() + PATIENT_ADMINISTRATION_ENTRY_CODE_TTL_MS,
        expiresAt.getTime(),
      ),
    );

    for (
      let attempt = 0;
      attempt < PATIENT_ADMINISTRATION_ENTRY_CODE_RETRY_LIMIT;
      attempt += 1
    ) {
      const entryCode = this.generateEntryCode();

      try {
        const session = await this.patientAdministrationSessionModel.create({
          scaleInstanceId: new Types.ObjectId(business.scaleInstance.id),
          status: 'prepared',
          currentStepKey: business.orderedSteps[0].stepKey,
          revision: 0,
          expiresAt,
          entryCodeHash: this.authService.hashSessionToken(entryCode),
          entryCodeExpiresAt,
          impactFactorCodes: [],
          createdBy: operatorSnapshot,
          controlEvents: [],
        });

        return {
          ...this.toSessionSummary(session),
          entryCode,
          entryCodeExpiresAt,
        };
      } catch (error: unknown) {
        if (!isMongoDuplicateKeyError(error)) {
          throw error;
        }

        if (error.keyPattern?.entryCodeHash === 1) {
          continue;
        }

        this.throwSessionConflict();
      }
    }

    this.throwSessionConflict();
  }

  async getLatestSession(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    await this.requireRouteOwnership(patientId, visitId, scaleInstanceId);
    const session =
      await this.findLatestSessionByScaleInstance(scaleInstanceId);

    if (!session) {
      this.throwSessionNotFound();
    }

    const current = await this.expireIfNeeded(session, new Date());
    return this.toSessionSummary(current);
  }

  async validateSameDeviceHandoff(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    expectedRevision: number,
  ): Promise<void> {
    await this.requireMutableSession(
      patientId,
      visitId,
      scaleInstanceId,
      expectedRevision,
      ['prepared', 'paused'],
      true,
    );
  }

  async issueSameDeviceCredential(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    expectedRevision: number,
    operatorSnapshot: AssessmentOperatorSnapshot,
  ): Promise<PatientAdministrationStaffCredentialIssue> {
    const session = await this.requireMutableSession(
      patientId,
      visitId,
      scaleInstanceId,
      expectedRevision,
      ['prepared', 'paused'],
      true,
    );
    const rawToken = this.authService.generateSessionToken();
    const now = new Date();
    const updated = await this.patientAdministrationSessionModel
      .findOneAndUpdate(
        {
          _id: session._id,
          scaleInstanceId: session.scaleInstanceId,
          status: { $in: ['prepared', 'paused'] },
          revision: expectedRevision,
          expiresAt: { $gt: now },
        },
        {
          $set: {
            sessionTokenHash: this.authService.hashSessionToken(rawToken),
          },
          $unset: { entryCodeHash: 1, entryCodeExpiresAt: 1 },
          $inc: { revision: 1 },
          $push: {
            controlEvents: this.buildControlEvent(
              'same_device_handoff',
              now,
              operatorSnapshot,
            ),
          },
        },
        { returnDocument: 'after' },
      )
      .select('+entryCodeHash +sessionTokenHash')
      .exec();

    if (!updated) {
      await this.throwAfterAtomicMiss(scaleInstanceId);
      throw new Error('Unreachable atomic miss');
    }

    return {
      rawToken,
      expiresAt: updated.expiresAt,
      response: this.toSessionSummary(updated),
    };
  }

  async confirmPreparation(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    expectedRevision: number,
    impactFactorCodes: PatientAdministrationImpactFactorCode[],
    impactFactorNote: string | undefined,
    operatorSnapshot: AssessmentOperatorSnapshot,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    const session = await this.requireMutableSession(
      patientId,
      visitId,
      scaleInstanceId,
      expectedRevision,
      ['prepared'],
      true,
    );
    if (session.preparationConfirmedAt || !session.sessionTokenHash) {
      this.throwSessionConflict();
    }
    const now = new Date();
    const setValues: Record<string, unknown> = {
      preparationConfirmedAt: now,
      preparationConfirmedBy: operatorSnapshot,
      impactFactorCodes: [...impactFactorCodes],
      status: 'active',
      startedAt: session.startedAt ?? now,
    };
    if (impactFactorNote !== undefined) {
      setValues.impactFactorNote = impactFactorNote;
    }

    const updated = await this.patientAdministrationSessionModel
      .findOneAndUpdate(
        {
          _id: session._id,
          scaleInstanceId: session.scaleInstanceId,
          status: 'prepared',
          revision: expectedRevision,
          expiresAt: { $gt: now },
          sessionTokenHash: { $exists: true },
          preparationConfirmedAt: { $exists: false },
        },
        {
          $set: setValues,
          ...(impactFactorNote === undefined
            ? { $unset: { impactFactorNote: 1 } }
            : {}),
          $inc: { revision: 1 },
          $push: {
            controlEvents: this.buildControlEvent(
              'preparation_confirmed',
              now,
              operatorSnapshot,
            ),
          },
        },
        { returnDocument: 'after' },
      )
      .select('+entryCodeHash +sessionTokenHash')
      .exec();

    if (!updated) {
      await this.throwAfterAtomicMiss(scaleInstanceId);
      throw new Error('Unreachable atomic miss');
    }

    return this.toSessionSummary(updated);
  }

  async pauseSession(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    expectedRevision: number,
    reason: string | undefined,
    operatorSnapshot: AssessmentOperatorSnapshot,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    const session = await this.requireMutableSession(
      patientId,
      visitId,
      scaleInstanceId,
      expectedRevision,
      ['active'],
      false,
    );
    const now = new Date();
    const updated = await this.patientAdministrationSessionModel
      .findOneAndUpdate(
        {
          _id: session._id,
          scaleInstanceId: session.scaleInstanceId,
          status: 'active',
          revision: expectedRevision,
          expiresAt: { $gt: now },
        },
        {
          $set: { status: 'paused', pausedAt: now },
          $inc: { revision: 1 },
          $push: {
            controlEvents: this.buildControlEvent(
              'paused',
              now,
              operatorSnapshot,
              reason,
            ),
          },
        },
        { returnDocument: 'after' },
      )
      .select('+entryCodeHash +sessionTokenHash')
      .exec();

    if (!updated) {
      await this.throwAfterAtomicMiss(scaleInstanceId);
      throw new Error('Unreachable atomic miss');
    }
    return this.toSessionSummary(updated);
  }

  async resumeSession(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    expectedRevision: number,
    reason: string | undefined,
    operatorSnapshot: AssessmentOperatorSnapshot,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    const session = await this.requireMutableSession(
      patientId,
      visitId,
      scaleInstanceId,
      expectedRevision,
      ['paused'],
      true,
    );
    if (!session.preparationConfirmedAt || !session.sessionTokenHash) {
      this.throwSessionConflict();
    }
    const now = new Date();
    const updated = await this.patientAdministrationSessionModel
      .findOneAndUpdate(
        {
          _id: session._id,
          scaleInstanceId: session.scaleInstanceId,
          status: 'paused',
          revision: expectedRevision,
          expiresAt: { $gt: now },
          sessionTokenHash: { $exists: true },
          preparationConfirmedAt: { $exists: true },
        },
        {
          $set: { status: 'active' },
          $unset: { pausedAt: 1 },
          $inc: { revision: 1 },
          $push: {
            controlEvents: this.buildControlEvent(
              'resumed',
              now,
              operatorSnapshot,
              reason,
            ),
          },
        },
        { returnDocument: 'after' },
      )
      .select('+entryCodeHash +sessionTokenHash')
      .exec();

    if (!updated) {
      await this.throwAfterAtomicMiss(scaleInstanceId);
      throw new Error('Unreachable atomic miss');
    }
    return this.toSessionSummary(updated);
  }

  async reissueEntryCode(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    expectedRevision: number,
    reason: string,
    operatorSnapshot: AssessmentOperatorSnapshot,
  ): Promise<PatientAdministrationEntryCodeResponse> {
    const session = await this.requireMutableSession(
      patientId,
      visitId,
      scaleInstanceId,
      expectedRevision,
      ['prepared', 'active', 'paused'],
      true,
    );
    const now = new Date();
    const entryCodeExpiresAt = new Date(
      Math.min(
        now.getTime() + PATIENT_ADMINISTRATION_ENTRY_CODE_TTL_MS,
        session.expiresAt.getTime(),
      ),
    );

    for (
      let attempt = 0;
      attempt < PATIENT_ADMINISTRATION_ENTRY_CODE_RETRY_LIMIT;
      attempt += 1
    ) {
      const entryCode = this.generateEntryCode();

      try {
        const updated = await this.patientAdministrationSessionModel
          .findOneAndUpdate(
            {
              _id: session._id,
              scaleInstanceId: session.scaleInstanceId,
              status: { $in: ['prepared', 'active', 'paused'] },
              revision: expectedRevision,
              expiresAt: { $gt: now },
            },
            {
              $set: {
                status: session.status === 'prepared' ? 'prepared' : 'paused',
                entryCodeHash: this.authService.hashSessionToken(entryCode),
                entryCodeExpiresAt,
                ...(session.status === 'prepared' ? {} : { pausedAt: now }),
              },
              $unset: { sessionTokenHash: 1 },
              $inc: { revision: 1 },
              $push: {
                controlEvents: this.buildControlEvent(
                  'device_reissued',
                  now,
                  operatorSnapshot,
                  reason,
                ),
              },
            },
            { returnDocument: 'after' },
          )
          .select('+entryCodeHash +sessionTokenHash')
          .exec();

        if (!updated) {
          await this.throwAfterAtomicMiss(scaleInstanceId);
          throw new Error('Unreachable atomic miss');
        }

        return {
          ...this.toSessionSummary(updated),
          entryCode,
          entryCodeExpiresAt,
        };
      } catch (error: unknown) {
        if (
          isMongoDuplicateKeyError(error) &&
          error.keyPattern?.entryCodeHash === 1
        ) {
          continue;
        }
        throw error;
      }
    }

    this.throwSessionConflict();
  }

  async terminateSession(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    expectedRevision: number,
    reason: string,
    operatorSnapshot: AssessmentOperatorSnapshot,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    const session = await this.requireMutableSession(
      patientId,
      visitId,
      scaleInstanceId,
      expectedRevision,
      ['prepared', 'active', 'paused'],
      false,
    );
    const now = new Date();
    const updated = await this.patientAdministrationSessionModel
      .findOneAndUpdate(
        {
          _id: session._id,
          scaleInstanceId: session.scaleInstanceId,
          status: { $in: PATIENT_ADMINISTRATION_OPEN_STATUSES },
          revision: expectedRevision,
          expiresAt: { $gt: now },
        },
        {
          $set: { status: 'terminated', terminatedAt: now },
          $unset: {
            entryCodeHash: 1,
            entryCodeExpiresAt: 1,
            sessionTokenHash: 1,
          },
          $inc: { revision: 1 },
          $push: {
            controlEvents: this.buildControlEvent(
              'terminated',
              now,
              operatorSnapshot,
              reason,
            ),
          },
        },
        { returnDocument: 'after' },
      )
      .select('+entryCodeHash +sessionTokenHash')
      .exec();

    if (!updated) {
      await this.throwAfterAtomicMiss(scaleInstanceId);
      throw new Error('Unreachable atomic miss');
    }
    return this.toSessionSummary(updated);
  }

  async redeemEntryCode(
    entryCode: string,
    clientKey: string,
  ): Promise<PatientAdministrationCredentialIssue> {
    const now = new Date();
    this.assertEntryAttemptAllowed(clientKey, now);
    const entryCodeHash = this.authService.hashSessionToken(entryCode);
    const session = await this.patientAdministrationSessionModel
      .findOne({ entryCodeHash })
      .select('+entryCodeHash +sessionTokenHash')
      .exec();

    if (!session) {
      this.recordFailedEntryAttempt(clientKey, now);
      this.throwEntryInvalid();
    }

    const current = await this.expireIfNeeded(session, now);
    if (current.status !== 'prepared' && current.status !== 'paused') {
      this.recordFailedEntryAttempt(clientKey, now);
      this.throwEntryInvalid();
    }
    if (
      !current.entryCodeHash ||
      !current.entryCodeExpiresAt ||
      current.entryCodeExpiresAt.getTime() <= now.getTime() ||
      current.expiresAt.getTime() <= now.getTime() ||
      current.sessionTokenHash
    ) {
      this.recordFailedEntryAttempt(clientKey, now);
      this.throwEntryInvalid();
    }

    try {
      await this.requireBusinessContinuationForSession(current);
    } catch {
      await this.invalidateForBusinessChange(current, now);
      this.recordFailedEntryAttempt(clientKey, now);
      this.throwEntryInvalid();
    }

    const rawToken = this.authService.generateSessionToken();
    const updated = await this.patientAdministrationSessionModel
      .findOneAndUpdate(
        {
          _id: current._id,
          entryCodeHash,
          entryCodeExpiresAt: { $gt: now },
          expiresAt: { $gt: now },
          status: { $in: ['prepared', 'paused'] },
          sessionTokenHash: { $exists: false },
          revision: current.revision,
        },
        {
          $set: {
            sessionTokenHash: this.authService.hashSessionToken(rawToken),
          },
          $unset: { entryCodeHash: 1, entryCodeExpiresAt: 1 },
          $inc: { revision: 1 },
          $push: {
            controlEvents: this.buildControlEvent('entry_redeemed', now),
          },
        },
        { returnDocument: 'after' },
      )
      .select('+entryCodeHash +sessionTokenHash')
      .exec();

    if (!updated) {
      this.recordFailedEntryAttempt(clientKey, now);
      this.throwEntryInvalid();
    }

    this.entryRateLimits.delete(clientKey);
    return this.toCredentialIssue(updated, rawToken);
  }

  async validatePatientCredential(
    rawToken: string,
  ): Promise<PatientAdministrationRequestContext | null> {
    const sessionTokenHash = this.authService.hashSessionToken(rawToken.trim());
    const session = await this.patientAdministrationSessionModel
      .findOne({
        sessionTokenHash,
        status: { $in: PATIENT_ADMINISTRATION_OPEN_STATUSES },
      })
      .select('+sessionTokenHash')
      .exec();

    if (!session) {
      return null;
    }

    const now = new Date();
    const current = await this.expireIfNeeded(session, now);
    if (
      !PATIENT_ADMINISTRATION_OPEN_STATUSES.includes(
        current.status as PatientAdministrationOpenStatus,
      ) ||
      current.sessionTokenHash !== sessionTokenHash
    ) {
      return null;
    }

    try {
      await this.requireBusinessContinuationForSession(current);
    } catch {
      await this.invalidateForBusinessChange(current, now);
      return null;
    }

    return {
      sessionId: current._id.toString(),
      sessionTokenHash,
      revision: current.revision,
    };
  }

  async getCurrent(
    context: PatientAdministrationRequestContext,
  ): Promise<PatientAdministrationCurrentResponse> {
    const session = await this.patientAdministrationSessionModel
      .findOne({
        _id: new Types.ObjectId(context.sessionId),
        sessionTokenHash: context.sessionTokenHash,
        status: { $in: PATIENT_ADMINISTRATION_OPEN_STATUSES },
      })
      .select('+sessionTokenHash')
      .exec();

    if (!session) {
      throw new UnauthorizedException();
    }

    const now = new Date();
    const current = await this.expireIfNeeded(session, now);
    if (
      !PATIENT_ADMINISTRATION_OPEN_STATUSES.includes(
        current.status as PatientAdministrationOpenStatus,
      ) ||
      current.sessionTokenHash !== context.sessionTokenHash
    ) {
      throw new UnauthorizedException();
    }

    let business: AdministrationBusinessContext;
    try {
      business = await this.requireBusinessContinuationForSession(current);
    } catch {
      await this.invalidateForBusinessChange(current, now);
      throw new UnauthorizedException();
    }

    return this.toCurrentResponse(current, business);
  }

  async prepareCurrentEvidenceUpload(
    context: PatientAdministrationRequestContext,
    expectedRevision: number,
    evidenceType: PatientAdministrationEvidenceType,
  ): Promise<PatientAdministrationEvidenceUploadContext> {
    if (
      !Types.ObjectId.isValid(context.sessionId) ||
      !PATIENT_ADMINISTRATION_EVIDENCE_TYPES.includes(evidenceType)
    ) {
      throw new UnauthorizedException();
    }

    const session = await this.patientAdministrationSessionModel
      .findOne({
        _id: new Types.ObjectId(context.sessionId),
        sessionTokenHash: context.sessionTokenHash,
      })
      .select('+sessionTokenHash')
      .exec();
    if (!session) {
      throw new UnauthorizedException();
    }

    const current = await this.expireIfNeeded(session, new Date());
    if (
      current.status !== 'active' ||
      current.sessionTokenHash !== context.sessionTokenHash ||
      current.revision !== context.revision ||
      current.revision !== expectedRevision
    ) {
      this.throwSessionConflict();
    }

    const business = await this.requireBusinessContinuationForSession(current);
    this.assertEvidenceTypeAllowed(
      business.currentStep.responseMode,
      evidenceType,
    );
    const stepRun = this.getCurrentStepRun(current, current.currentStepKey);
    this.assertNoEquivalentStepEvidence(
      current.stepEvidenceRefs ?? [],
      current.currentStepKey,
      stepRun,
      business.currentStep.responseMode,
    );

    return {
      sessionId: current._id.toString(),
      sessionTokenHash: context.sessionTokenHash,
      scaleInstanceId: business.scaleInstance.id,
      patientId: business.scaleInstance.patientId,
      assessmentVisitId: business.scaleInstance.assessmentVisitId,
      subjectCode: business.scaleInstance.subjectCode,
      scaleDefinitionId: business.scaleInstance.scaleDefinitionId,
      scaleVersionId: business.scaleInstance.scaleVersionId,
      scaleCode: business.scaleInstance.scaleCode,
      scaleVersion: business.scaleInstance.scaleVersion,
      instanceCode: business.scaleInstance.instanceCode,
      currentStepKey: current.currentStepKey,
      stepRun,
      itemCode: business.currentStep.itemCode,
      responseMode: business.currentStep.responseMode,
      expectedRevision,
    };
  }

  async attachCurrentStepEvidence(
    input: AttachPatientAdministrationEvidenceInput,
  ): Promise<number> {
    const { uploadContext } = input;
    if (
      !Types.ObjectId.isValid(uploadContext.sessionId) ||
      !Types.ObjectId.isValid(input.mediaEvidenceId)
    ) {
      this.throwSessionConflict();
    }
    this.assertEvidenceTypeAllowed(
      uploadContext.responseMode,
      input.evidenceType,
    );

    const equivalentTypes =
      uploadContext.responseMode === 'speech'
        ? ['audio']
        : ['photo', 'handwriting'];
    const updated = await this.patientAdministrationSessionModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(uploadContext.sessionId),
          sessionTokenHash: uploadContext.sessionTokenHash,
          status: 'active',
          currentStepKey: uploadContext.currentStepKey,
          revision: uploadContext.expectedRevision,
          expiresAt: { $gt: input.uploadedAt },
          stepEvidenceRefs: {
            $not: {
              $elemMatch: {
                stepKey: uploadContext.currentStepKey,
                stepRun: uploadContext.stepRun,
                evidenceType: { $in: equivalentTypes },
              },
            },
          },
        },
        {
          $push: {
            stepEvidenceRefs: {
              stepKey: uploadContext.currentStepKey,
              stepRun: uploadContext.stepRun,
              evidenceType: input.evidenceType,
              mediaEvidenceId: new Types.ObjectId(input.mediaEvidenceId),
              uploadedAt: input.uploadedAt,
            },
          },
          $inc: { revision: 1 },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .select('+sessionTokenHash')
      .exec();
    if (!updated) {
      return this.throwAfterPatientAtomicMiss({
        sessionId: uploadContext.sessionId,
        sessionTokenHash: uploadContext.sessionTokenHash,
        revision: uploadContext.expectedRevision,
      });
    }
    return updated.revision;
  }

  async completePatientStep(
    context: PatientAdministrationRequestContext,
    expectedRevision: number,
  ): Promise<PatientAdministrationCurrentResponse> {
    const { session, business } = await this.requireActivePatientContext(
      context,
      expectedRevision,
    );
    if (business.currentStep.advanceBy !== 'patient') {
      this.throwStepConflict();
    }
    this.assertCurrentStepAudioPlayed(session, business);
    this.assertCurrentStepEvidencePresent(session, business);

    const updated = await this.completeCurrentStep(
      session,
      business,
      expectedRevision,
      'patient',
      undefined,
      undefined,
      context.sessionTokenHash,
    );
    return this.toCurrentResponse(
      updated,
      this.businessForSessionStep(business, updated.currentStepKey),
    );
  }

  async completeStaffStep(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    expectedRevision: number,
    staffObservation: string,
    operatorSnapshot: AssessmentOperatorSnapshot,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    const session = await this.requireMutableSession(
      patientId,
      visitId,
      scaleInstanceId,
      expectedRevision,
      ['active'],
      true,
    );
    const business = await this.requireBusinessContinuation(
      patientId,
      visitId,
      scaleInstanceId,
      session.currentStepKey,
    );
    if (business.currentStep.advanceBy !== 'staff') {
      this.throwStepConflict();
    }
    this.assertCurrentStepAudioPlayed(session, business);
    this.assertCurrentStepEvidencePresent(session, business);

    return this.toSessionSummary(
      await this.completeCurrentStep(
        session,
        business,
        expectedRevision,
        'staff',
        staffObservation,
        operatorSnapshot,
      ),
    );
  }

  async takeOverCurrentStep(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    expectedRevision: number,
    reason: string,
    staffObservation: string,
    operatorSnapshot: AssessmentOperatorSnapshot,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    const session = await this.requireMutableSession(
      patientId,
      visitId,
      scaleInstanceId,
      expectedRevision,
      ['paused'],
      true,
    );
    const business = await this.requireBusinessContinuation(
      patientId,
      visitId,
      scaleInstanceId,
      session.currentStepKey,
    );
    if (business.currentStep.advanceBy !== 'patient') {
      this.throwStepConflict();
    }

    const now = new Date();
    const stepRun = this.getCurrentStepRun(session, session.currentStepKey);
    const stepCaptures = this.copyStepCaptures(session);
    this.assertNoActiveStepCapture(stepCaptures, session.currentStepKey);
    stepCaptures.push({
      stepKey: session.currentStepKey,
      stepRun,
      capturedBy: 'staff',
      staffObservation,
      operatorSnapshot,
      capturedAt: now,
    });
    const nextStep = this.getNextStep(business);
    const updated = await this.patientAdministrationSessionModel
      .findOneAndUpdate(
        {
          _id: session._id,
          scaleInstanceId: session.scaleInstanceId,
          status: 'paused',
          currentStepKey: session.currentStepKey,
          revision: expectedRevision,
          expiresAt: { $gt: now },
        },
        {
          $set: {
            stepCaptures,
            currentStepKey: nextStep?.stepKey ?? session.currentStepKey,
            ...(nextStep ? {} : { status: 'completed', completedAt: now }),
          },
          ...(nextStep
            ? {}
            : {
                $unset: {
                  entryCodeHash: 1,
                  entryCodeExpiresAt: 1,
                  sessionTokenHash: 1,
                },
              }),
          $inc: { revision: 1 },
          $push: {
            controlEvents: this.buildControlEvent(
              'staff_takeover',
              now,
              operatorSnapshot,
              reason,
            ),
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    if (!updated) {
      await this.throwAfterAtomicMiss(scaleInstanceId);
      throw new Error('Unreachable atomic miss');
    }
    return this.toSessionSummary(updated);
  }

  async redoLastStep(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    expectedRevision: number,
    reason: string,
    operatorSnapshot: AssessmentOperatorSnapshot,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    const session = await this.requireMutableSession(
      patientId,
      visitId,
      scaleInstanceId,
      expectedRevision,
      ['paused'],
      true,
    );
    const business = await this.requireBusinessContinuation(
      patientId,
      visitId,
      scaleInstanceId,
      session.currentStepKey,
    );
    const currentIndex = business.orderedSteps.findIndex(
      (step) => step.stepKey === session.currentStepKey,
    );
    if (currentIndex <= 0) {
      this.throwStepConflict();
    }
    const previousStep = business.orderedSteps[currentIndex - 1];
    const stepCaptures = this.copyStepCaptures(session);
    const activeCaptureIndexes = stepCaptures
      .map((capture, index) => ({ capture, index }))
      .filter(
        ({ capture }) =>
          capture.stepKey === previousStep.stepKey && !capture.invalidatedAt,
      )
      .map(({ index }) => index);
    if (activeCaptureIndexes.length !== 1) {
      this.throwStepConflict();
    }

    const now = new Date();
    const captureIndex = activeCaptureIndexes[0];
    stepCaptures[captureIndex] = {
      ...stepCaptures[captureIndex],
      invalidatedAt: now,
      invalidatedReason: reason,
    };
    const updated = await this.patientAdministrationSessionModel
      .findOneAndUpdate(
        {
          _id: session._id,
          scaleInstanceId: session.scaleInstanceId,
          status: 'paused',
          currentStepKey: session.currentStepKey,
          revision: expectedRevision,
          expiresAt: { $gt: now },
        },
        {
          $set: {
            currentStepKey: previousStep.stepKey,
            stepCaptures,
          },
          $inc: { revision: 1 },
          $push: {
            controlEvents: this.buildControlEvent(
              'step_redo',
              now,
              operatorSnapshot,
              reason,
            ),
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    if (!updated) {
      await this.throwAfterAtomicMiss(scaleInstanceId);
      throw new Error('Unreachable atomic miss');
    }
    return this.toSessionSummary(updated);
  }

  async authorizeTechnicalReplay(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    assetKey: string,
    expectedRevision: number,
    reason: string,
    operatorSnapshot: AssessmentOperatorSnapshot,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    const session = await this.requireMutableSession(
      patientId,
      visitId,
      scaleInstanceId,
      expectedRevision,
      ['paused'],
      true,
    );
    const business = await this.requireBusinessContinuation(
      patientId,
      visitId,
      scaleInstanceId,
      session.currentStepKey,
    );
    const asset = this.requireCurrentAsset(business, assetKey, 'audio');
    if (asset.role !== 'stimulus') {
      this.throwAssetNotAllowed();
    }

    const stepRun = this.getCurrentStepRun(session, session.currentStepKey);
    const playbackFacts = this.copyPlaybackFacts(session);
    const factIndex = this.findPlaybackFactIndex(
      playbackFacts,
      session.currentStepKey,
      stepRun,
      assetKey,
    );
    if (factIndex < 0 || playbackFacts[factIndex].playCount < 1) {
      this.throwAssetNotAllowed();
    }
    if (playbackFacts[factIndex].remainingAuthorizedReplays !== 0) {
      this.throwSessionConflict();
    }

    const now = new Date();
    const fact = playbackFacts[factIndex];
    playbackFacts[factIndex] = {
      ...fact,
      remainingAuthorizedReplays: 1,
      technicalReplayAuthorizations: [
        ...fact.technicalReplayAuthorizations,
        { authorizedAt: now, authorizedBy: operatorSnapshot, reason },
      ],
    };
    const updated = await this.patientAdministrationSessionModel
      .findOneAndUpdate(
        {
          _id: session._id,
          scaleInstanceId: session.scaleInstanceId,
          status: 'paused',
          currentStepKey: session.currentStepKey,
          revision: expectedRevision,
          expiresAt: { $gt: now },
        },
        { $set: { playbackFacts }, $inc: { revision: 1 } },
        { returnDocument: 'after', runValidators: true },
      )
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    if (!updated) {
      await this.throwAfterAtomicMiss(scaleInstanceId);
      throw new Error('Unreachable atomic miss');
    }
    return this.toSessionSummary(updated);
  }

  async openCurrentImage(
    context: PatientAdministrationRequestContext,
    assetKey: string,
  ): Promise<PatientAdministrationOpenedAsset> {
    const { session, business } = await this.requireActivePatientContext(
      context,
      context.revision,
    );
    const asset = this.requireCurrentAsset(business, assetKey, 'image');
    const opened = await this.presentationAssetsService.openAsset(
      business.scaleVersion.presentationPackageKey as string,
      asset.assetKey,
    );
    if (opened.kind !== 'image' || opened.mimeType !== asset.mimeType) {
      this.destroyOpenedAsset(opened);
      this.throwPackageInvalid();
    }

    const finalSession = await this.patientAdministrationSessionModel
      .findOne({
        _id: session._id,
        scaleInstanceId: session.scaleInstanceId,
        sessionTokenHash: context.sessionTokenHash,
        status: 'active',
        currentStepKey: session.currentStepKey,
        revision: session.revision,
        expiresAt: { $gt: new Date() },
      })
      .select('+sessionTokenHash')
      .exec();
    if (!finalSession) {
      this.destroyOpenedAsset(opened);
      this.throwSessionConflict();
    }
    return opened;
  }

  async playCurrentAudio(
    context: PatientAdministrationRequestContext,
    assetKey: string,
    expectedRevision: number,
  ): Promise<PatientAdministrationPlayedAudio> {
    const { session, business } = await this.requireActivePatientContext(
      context,
      expectedRevision,
    );
    const asset = this.requireCurrentAsset(business, assetKey, 'audio');
    if (asset.role !== 'guidance' && asset.role !== 'stimulus') {
      this.throwAssetNotAllowed();
    }

    const stepRun = this.getCurrentStepRun(session, session.currentStepKey);
    const playbackFacts = this.copyPlaybackFacts(session);
    this.assertPriorAudioPlayed(business, playbackFacts, stepRun, assetKey);
    let factIndex = this.findPlaybackFactIndex(
      playbackFacts,
      session.currentStepKey,
      stepRun,
      assetKey,
    );
    if (factIndex < 0) {
      playbackFacts.push({
        stepKey: session.currentStepKey,
        stepRun,
        assetKey,
        playCount: 0,
        remainingAuthorizedReplays: 0,
        technicalReplayAuthorizations: [],
      });
      factIndex = playbackFacts.length - 1;
    }
    const currentFact = playbackFacts[factIndex];
    if (
      asset.role === 'stimulus' &&
      currentFact.playCount > 0 &&
      currentFact.remainingAuthorizedReplays < 1
    ) {
      this.throwAssetNotAllowed();
    }

    const opened = await this.presentationAssetsService.openAsset(
      business.scaleVersion.presentationPackageKey as string,
      assetKey,
    );
    if (opened.kind !== 'audio' || opened.mimeType !== asset.mimeType) {
      this.destroyOpenedAsset(opened);
      this.throwPackageInvalid();
    }

    const now = new Date();
    playbackFacts[factIndex] = {
      ...currentFact,
      playCount: currentFact.playCount + 1,
      remainingAuthorizedReplays:
        asset.role === 'stimulus' && currentFact.playCount > 0
          ? currentFact.remainingAuthorizedReplays - 1
          : currentFact.remainingAuthorizedReplays,
      lastPlayedAt: now,
    };
    const updated = await this.patientAdministrationSessionModel
      .findOneAndUpdate(
        {
          _id: session._id,
          scaleInstanceId: session.scaleInstanceId,
          sessionTokenHash: context.sessionTokenHash,
          status: 'active',
          currentStepKey: session.currentStepKey,
          revision: expectedRevision,
          expiresAt: { $gt: now },
        },
        { $set: { playbackFacts }, $inc: { revision: 1 } },
        { returnDocument: 'after', runValidators: true },
      )
      .select('+sessionTokenHash')
      .exec();
    if (!updated) {
      this.destroyOpenedAsset(opened);
      await this.throwAfterPatientAtomicMiss(context);
      throw new Error('Unreachable patient atomic miss');
    }
    return { asset: opened, revision: updated.revision };
  }

  private async requireActivePatientContext(
    context: PatientAdministrationRequestContext,
    expectedRevision: number,
  ): Promise<{
    session: PatientAdministrationSessionDocument;
    business: AdministrationBusinessContext;
  }> {
    const session = await this.patientAdministrationSessionModel
      .findOne({
        _id: new Types.ObjectId(context.sessionId),
        sessionTokenHash: context.sessionTokenHash,
      })
      .select('+sessionTokenHash')
      .exec();
    if (!session) {
      throw new UnauthorizedException();
    }

    const current = await this.expireIfNeeded(session, new Date());
    if (
      current.status !== 'active' ||
      current.sessionTokenHash !== context.sessionTokenHash ||
      current.revision !== context.revision ||
      current.revision !== expectedRevision
    ) {
      this.throwSessionConflict();
    }
    return {
      session: current,
      business: await this.requireBusinessContinuationForSession(current),
    };
  }

  private async completeCurrentStep(
    session: PatientAdministrationSessionDocument,
    business: AdministrationBusinessContext,
    expectedRevision: number,
    capturedBy: 'patient' | 'staff',
    staffObservation?: string,
    operatorSnapshot?: AssessmentOperatorSnapshot,
    sessionTokenHash?: string,
  ): Promise<PatientAdministrationSessionDocument> {
    if (
      (capturedBy === 'staff' && !operatorSnapshot) ||
      (capturedBy === 'patient' && operatorSnapshot)
    ) {
      this.throwStepConflict();
    }

    const stepCaptures = this.copyStepCaptures(session);
    this.assertNoActiveStepCapture(stepCaptures, session.currentStepKey);
    const now = new Date();
    stepCaptures.push({
      stepKey: session.currentStepKey,
      stepRun: this.getCurrentStepRun(session, session.currentStepKey),
      capturedBy,
      ...(staffObservation ? { staffObservation } : {}),
      ...(operatorSnapshot ? { operatorSnapshot } : {}),
      capturedAt: now,
    });
    const nextStep = this.getNextStep(business);
    const setValues: Record<string, unknown> = {
      stepCaptures,
      currentStepKey: nextStep?.stepKey ?? session.currentStepKey,
    };
    if (!nextStep) {
      setValues.status = 'completed';
      setValues.completedAt = now;
    }

    const updated = await this.patientAdministrationSessionModel
      .findOneAndUpdate(
        {
          _id: session._id,
          scaleInstanceId: session.scaleInstanceId,
          status: 'active',
          currentStepKey: session.currentStepKey,
          revision: expectedRevision,
          expiresAt: { $gt: now },
          ...(sessionTokenHash ? { sessionTokenHash } : {}),
        },
        {
          $set: setValues,
          ...(!nextStep
            ? {
                $unset: {
                  entryCodeHash: 1,
                  entryCodeExpiresAt: 1,
                  sessionTokenHash: 1,
                },
              }
            : {}),
          $inc: { revision: 1 },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    if (!updated) {
      if (sessionTokenHash) {
        await this.throwAfterPatientAtomicMiss({
          sessionId: session._id.toString(),
          sessionTokenHash,
          revision: expectedRevision,
        });
      }
      await this.throwAfterAtomicMiss(session.scaleInstanceId.toString());
      throw new Error('Unreachable atomic miss');
    }
    return updated;
  }

  private toCurrentResponse(
    session: PatientAdministrationSessionDocument,
    business: AdministrationBusinessContext,
  ): PatientAdministrationCurrentResponse {
    return {
      status: session.status,
      revision: session.revision,
      expiresAt: session.expiresAt,
      currentStep:
        session.status === 'active'
          ? {
              stepKey: business.currentStep.stepKey,
              order: business.currentStep.order,
              patientText: business.currentStep.patientText,
              responseMode: business.currentStep.responseMode,
              advanceBy: business.currentStep.advanceBy,
              assets: this.getStepAssets(business).map((asset) => ({
                assetKey: asset.assetKey,
                kind: asset.kind,
                role:
                  asset.kind === 'audio' &&
                  (asset.role === 'guidance' || asset.role === 'stimulus')
                    ? asset.role
                    : null,
                mimeType: asset.mimeType,
              })),
            }
          : null,
    };
  }

  private businessForSessionStep(
    business: AdministrationBusinessContext,
    stepKey: string,
  ): AdministrationBusinessContext {
    const currentStep = business.orderedSteps.find(
      (step) => step.stepKey === stepKey,
    );
    if (!currentStep) {
      this.throwStepConfigurationInvalid();
    }
    return { ...business, currentStep };
  }

  private getNextStep(
    business: AdministrationBusinessContext,
  ): PatientAdministrationStepConfigSummary | undefined {
    const currentIndex = business.orderedSteps.findIndex(
      (step) => step.stepKey === business.currentStep.stepKey,
    );
    if (currentIndex < 0) {
      this.throwStepConfigurationInvalid();
    }
    return business.orderedSteps[currentIndex + 1];
  }

  private getStepAssets(
    business: AdministrationBusinessContext,
  ): VerifiedPresentationAsset[] {
    return this.resolveStepAssets(
      business.presentationPackage,
      business.currentStep,
    );
  }

  private resolveStepAssets(
    presentationPackage: VerifiedPresentationAssetPackage,
    step: PatientAdministrationStepConfigSummary,
  ): VerifiedPresentationAsset[] {
    return step.assetKeys.map((assetKey) => {
      const matches = presentationPackage.assets.filter(
        (asset) => asset.assetKey === assetKey,
      );
      if (matches.length !== 1 || matches[0].stepKey !== step.stepKey) {
        this.throwStepConfigurationInvalid();
      }
      const asset = matches[0];
      if (
        (asset.kind === 'image' && asset.role !== undefined) ||
        (asset.kind === 'audio' &&
          asset.role !== 'guidance' &&
          asset.role !== 'stimulus')
      ) {
        this.throwStepConfigurationInvalid();
      }
      return asset;
    });
  }

  private requireCurrentAsset(
    business: AdministrationBusinessContext,
    assetKey: string,
    kind: 'audio' | 'image',
  ): VerifiedPresentationAsset {
    if (!business.currentStep.assetKeys.includes(assetKey)) {
      this.throwAssetNotAllowed();
    }
    const asset = this.getStepAssets(business).find(
      (candidate) => candidate.assetKey === assetKey,
    );
    if (!asset || asset.kind !== kind) {
      this.throwAssetNotAllowed();
    }
    return asset;
  }

  private getCurrentStepRun(
    session: PatientAdministrationSessionDocument,
    stepKey: string,
  ): number {
    const invalidatedCount = (session.stepCaptures ?? []).filter(
      (capture) => capture.stepKey === stepKey && capture.invalidatedAt,
    ).length;
    const stepRun = invalidatedCount + 1;
    if (!Number.isSafeInteger(stepRun) || stepRun < 1) {
      this.throwStepConflict();
    }
    return stepRun;
  }

  private copyStepCaptures(
    session: PatientAdministrationSessionDocument,
  ): PatientAdministrationStepCapture[] {
    return (session.stepCaptures ?? []).map((capture) => ({
      stepKey: capture.stepKey,
      stepRun: capture.stepRun,
      capturedBy: capture.capturedBy,
      ...(capture.staffObservation
        ? { staffObservation: capture.staffObservation }
        : {}),
      ...(capture.operatorSnapshot
        ? { operatorSnapshot: capture.operatorSnapshot }
        : {}),
      capturedAt: capture.capturedAt,
      ...(capture.invalidatedAt
        ? { invalidatedAt: capture.invalidatedAt }
        : {}),
      ...(capture.invalidatedReason
        ? { invalidatedReason: capture.invalidatedReason }
        : {}),
    }));
  }

  private copyPlaybackFacts(
    session: PatientAdministrationSessionDocument,
  ): PatientAdministrationPlaybackFact[] {
    return (session.playbackFacts ?? []).map((fact) => ({
      stepKey: fact.stepKey,
      stepRun: fact.stepRun,
      assetKey: fact.assetKey,
      playCount: fact.playCount,
      remainingAuthorizedReplays: fact.remainingAuthorizedReplays,
      ...(fact.lastPlayedAt ? { lastPlayedAt: fact.lastPlayedAt } : {}),
      technicalReplayAuthorizations: (
        fact.technicalReplayAuthorizations ?? []
      ).map((authorization) => ({
        authorizedAt: authorization.authorizedAt,
        authorizedBy: authorization.authorizedBy,
        reason: authorization.reason,
      })),
    }));
  }

  private assertEvidenceTypeAllowed(
    responseMode: PatientAdministrationStepConfigSummary['responseMode'],
    evidenceType: PatientAdministrationEvidenceType,
  ): void {
    const allowed =
      (responseMode === 'speech' && evidenceType === 'audio') ||
      ((responseMode === 'writing' || responseMode === 'drawing') &&
        (evidenceType === 'photo' || evidenceType === 'handwriting'));
    if (!allowed) {
      throw new ForbiddenException({
        code: 'PATIENT_ADMINISTRATION_EVIDENCE_NOT_ALLOWED',
        message: 'Evidence is not allowed for the current step',
      });
    }
  }

  private assertNoEquivalentStepEvidence(
    evidenceRefs: PatientAdministrationStepEvidenceRef[],
    stepKey: string,
    stepRun: number,
    responseMode: PatientAdministrationStepConfigSummary['responseMode'],
  ): void {
    const matches = evidenceRefs.filter(
      (reference) =>
        reference.stepKey === stepKey &&
        reference.stepRun === stepRun &&
        (responseMode === 'speech'
          ? reference.evidenceType === 'audio'
          : reference.evidenceType === 'photo' ||
            reference.evidenceType === 'handwriting'),
    );
    if (matches.length > 0) {
      this.throwSessionConflict();
    }
  }

  private assertCurrentStepEvidencePresent(
    session: PatientAdministrationSessionDocument,
    business: AdministrationBusinessContext,
  ): void {
    if (business.currentStep.responseMode === 'staff_observation') {
      return;
    }

    const stepRun = this.getCurrentStepRun(session, session.currentStepKey);
    const matches = (session.stepEvidenceRefs ?? []).filter(
      (reference) =>
        reference.stepKey === session.currentStepKey &&
        reference.stepRun === stepRun &&
        (business.currentStep.responseMode === 'speech'
          ? reference.evidenceType === 'audio'
          : reference.evidenceType === 'photo' ||
            reference.evidenceType === 'handwriting'),
    );
    if (matches.length !== 1) {
      this.throwStepConflict();
    }
  }

  private assertNoActiveStepCapture(
    captures: PatientAdministrationStepCapture[],
    stepKey: string,
  ): void {
    if (
      captures.some(
        (capture) => capture.stepKey === stepKey && !capture.invalidatedAt,
      )
    ) {
      this.throwStepConflict();
    }
  }

  private findPlaybackFactIndex(
    playbackFacts: PatientAdministrationPlaybackFact[],
    stepKey: string,
    stepRun: number,
    assetKey: string,
  ): number {
    const matches = playbackFacts
      .map((fact, index) => ({ fact, index }))
      .filter(
        ({ fact }) =>
          fact.stepKey === stepKey &&
          fact.stepRun === stepRun &&
          fact.assetKey === assetKey,
      );
    if (matches.length > 1) {
      this.throwStepConflict();
    }
    return matches[0]?.index ?? -1;
  }

  private assertCurrentStepAudioPlayed(
    session: PatientAdministrationSessionDocument,
    business: AdministrationBusinessContext,
  ): void {
    const stepRun = this.getCurrentStepRun(session, session.currentStepKey);
    const playbackFacts = this.copyPlaybackFacts(session);
    for (const asset of this.getStepAssets(business)) {
      if (asset.kind !== 'audio') {
        continue;
      }
      const factIndex = this.findPlaybackFactIndex(
        playbackFacts,
        session.currentStepKey,
        stepRun,
        asset.assetKey,
      );
      if (factIndex < 0 || playbackFacts[factIndex].playCount < 1) {
        this.throwStepConflict();
      }
    }
  }

  private assertPriorAudioPlayed(
    business: AdministrationBusinessContext,
    playbackFacts: PatientAdministrationPlaybackFact[],
    stepRun: number,
    assetKey: string,
  ): void {
    for (const asset of this.getStepAssets(business)) {
      if (asset.assetKey === assetKey) {
        return;
      }
      if (asset.kind !== 'audio') {
        continue;
      }
      const factIndex = this.findPlaybackFactIndex(
        playbackFacts,
        business.currentStep.stepKey,
        stepRun,
        asset.assetKey,
      );
      if (factIndex < 0 || playbackFacts[factIndex].playCount < 1) {
        this.throwAssetNotAllowed();
      }
    }
    this.throwAssetNotAllowed();
  }

  private destroyOpenedAsset(asset: OpenedPresentationAsset): void {
    try {
      asset.stream.destroy();
    } catch {
      // The authorization failure remains authoritative even if close fails.
    }
  }

  private async throwAfterPatientAtomicMiss(
    context: PatientAdministrationRequestContext,
  ): Promise<never> {
    const current = await this.patientAdministrationSessionModel
      .findById(new Types.ObjectId(context.sessionId))
      .select('+sessionTokenHash')
      .exec();
    if (!current || current.sessionTokenHash !== context.sessionTokenHash) {
      throw new UnauthorizedException();
    }
    await this.expireIfNeeded(current, new Date());
    this.throwSessionConflict();
  }

  private async requireMutableSession(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    expectedRevision: number,
    allowedStatuses: readonly PatientAdministrationOpenStatus[],
    requireContinuation: boolean,
  ): Promise<PatientAdministrationSessionDocument> {
    await this.requireRouteOwnership(patientId, visitId, scaleInstanceId);
    const session =
      await this.findLatestSessionByScaleInstance(scaleInstanceId);
    if (!session) {
      this.throwSessionNotFound();
    }

    const current = await this.expireIfNeeded(session, new Date());
    if (
      current.revision !== expectedRevision ||
      !allowedStatuses.includes(
        current.status as PatientAdministrationOpenStatus,
      )
    ) {
      this.throwSessionConflict();
    }

    if (requireContinuation) {
      await this.requireBusinessContinuation(
        patientId,
        visitId,
        scaleInstanceId,
        current.currentStepKey,
      );
    }
    return current;
  }

  private async requireRouteOwnership(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
  ): Promise<{
    visit: AssessmentVisitSummary;
    scaleInstance: ScaleInstanceSummary;
  }> {
    const patient = await this.patientsService.findPatientById(patientId);
    if (!patient) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
      });
    }

    const visit = await this.assessmentsService.findVisitByPatientAndId(
      patientId,
      visitId,
    );
    if (!visit) {
      throw new NotFoundException({
        code: 'VISIT_NOT_FOUND',
        message: 'Assessment visit not found',
      });
    }

    const scaleInstance =
      await this.assessmentsService.findScaleInstanceByPatientVisitAndId(
        patientId,
        visitId,
        scaleInstanceId,
      );
    if (!scaleInstance) {
      throw new NotFoundException({
        code: 'SCALE_INSTANCE_NOT_FOUND',
        message: 'Scale instance not found',
      });
    }

    return { visit, scaleInstance };
  }

  private async requireBusinessContinuation(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    currentStepKey?: string,
    validateAllStepAssets = false,
  ): Promise<AdministrationBusinessContext> {
    const patient = await this.patientsService.findPatientById(patientId);
    if (!patient) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
      });
    }
    if (patient.status !== 'active') {
      throw new ConflictException({
        code: 'PATIENT_NOT_ACTIVE',
        message: 'Patient is not active',
      });
    }

    const { visit, scaleInstance } = await this.requireRouteOwnership(
      patientId,
      visitId,
      scaleInstanceId,
    );
    if (!EDITABLE_STATUSES.has(visit.status)) {
      throw new ConflictException({
        code: 'VISIT_NOT_EDITABLE',
        message: 'Assessment visit is not editable',
      });
    }
    if (
      !EDITABLE_STATUSES.has(scaleInstance.status) ||
      scaleInstance.lockedAt ||
      scaleInstance.voidedAt ||
      normalizeScaleInstanceSubmissionWriteBarrier(
        scaleInstance.submissionWriteBarrier,
      ).kind !== 'open' ||
      scaleInstance.administrationMode !== 'supervised_patient_input'
    ) {
      throw new ConflictException({
        code: 'SCALE_INSTANCE_NOT_EDITABLE',
        message: 'Scale instance is not editable',
      });
    }

    const scaleVersion =
      await this.scalesService.findVersionByScaleCodeAndVersion(
        scaleInstance.scaleCode,
        scaleInstance.scaleVersion,
      );
    if (
      !scaleVersion ||
      scaleVersion.id !== scaleInstance.scaleVersionId ||
      scaleVersion.scaleDefinitionId !== scaleInstance.scaleDefinitionId
    ) {
      this.throwStepConfigurationInvalid();
    }

    const orderedSteps = this.validateAndOrderSteps(
      scaleVersion.patientAdministrationSteps,
    );
    const resolvedStepKey = currentStepKey ?? orderedSteps[0].stepKey;
    const currentStep = orderedSteps.find(
      (step) => step.stepKey === resolvedStepKey,
    );
    if (!currentStep) {
      this.throwStepConfigurationInvalid();
    }
    if (!scaleVersion.presentationPackageKey?.trim()) {
      this.throwPackageInvalid();
    }

    const verifiedPackage =
      await this.presentationAssetsService.validatePackage(
        scaleVersion.presentationPackageKey,
      );
    if (
      verifiedPackage.manifest.scaleCode !== scaleVersion.scaleCode ||
      verifiedPackage.manifest.scaleVersion !== scaleVersion.version
    ) {
      this.throwPackageInvalid();
    }
    const stepsToValidate = validateAllStepAssets
      ? orderedSteps
      : [currentStep];
    for (const step of stepsToValidate) {
      this.resolveStepAssets(verifiedPackage, step);
    }

    return {
      visit,
      scaleInstance,
      scaleVersion,
      orderedSteps,
      currentStep,
      presentationPackage: verifiedPackage,
    };
  }

  private async requireBusinessContinuationForSession(
    session: PatientAdministrationSessionDocument,
  ): Promise<AdministrationBusinessContext> {
    const identity = await this.scaleInstanceModel
      .findOne({ _id: session.scaleInstanceId })
      .select({ _id: 1, patientId: 1, assessmentVisitId: 1 })
      .lean<ScaleInstanceIdentityLean | null>()
      .exec();
    if (!identity) {
      throw new NotFoundException({
        code: 'SCALE_INSTANCE_NOT_FOUND',
        message: 'Scale instance not found',
      });
    }

    return this.requireBusinessContinuation(
      identity.patientId.toString(),
      identity.assessmentVisitId.toString(),
      identity._id.toString(),
      session.currentStepKey,
    );
  }

  private validateAndOrderSteps(
    steps: PatientAdministrationStepConfigSummary[] | undefined,
  ): PatientAdministrationStepConfigSummary[] {
    if (!steps?.length) {
      this.throwStepConfigurationInvalid();
    }

    const stepKeys = new Set<string>();
    const orders = new Set<number>();
    for (const step of steps) {
      if (
        !step.stepKey.trim() ||
        !Number.isSafeInteger(step.order) ||
        step.order < 0 ||
        stepKeys.has(step.stepKey) ||
        orders.has(step.order)
      ) {
        this.throwStepConfigurationInvalid();
      }
      stepKeys.add(step.stepKey);
      orders.add(step.order);
    }

    const orderedSteps = [...steps].sort(
      (left, right) => left.order - right.order,
    );
    if (orderedSteps.some((step, index) => step.order !== index + 1)) {
      this.throwStepConfigurationInvalid();
    }
    return orderedSteps;
  }

  private async findLatestSessionByScaleInstance(
    scaleInstanceId: string,
  ): Promise<PatientAdministrationSessionDocument | null> {
    return this.patientAdministrationSessionModel
      .findOne({ scaleInstanceId: new Types.ObjectId(scaleInstanceId) })
      .sort({ createdAt: -1, _id: -1 })
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
  }

  private async findOpenSessionByScaleInstance(
    scaleInstanceId: string,
  ): Promise<PatientAdministrationSessionDocument | null> {
    return this.patientAdministrationSessionModel
      .findOne({
        scaleInstanceId: new Types.ObjectId(scaleInstanceId),
        status: { $in: PATIENT_ADMINISTRATION_OPEN_STATUSES },
      })
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
  }

  private async expireOpenSessionForScaleInstance(
    scaleInstanceId: string,
    now: Date,
  ): Promise<void> {
    const session = await this.patientAdministrationSessionModel
      .findOne({
        scaleInstanceId: new Types.ObjectId(scaleInstanceId),
        status: { $in: PATIENT_ADMINISTRATION_OPEN_STATUSES },
        expiresAt: { $lte: now },
      })
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    if (session) {
      await this.expireIfNeeded(session, now);
    }
  }

  private async expireIfNeeded(
    session: PatientAdministrationSessionDocument,
    now: Date,
  ): Promise<PatientAdministrationSessionDocument> {
    if (
      !PATIENT_ADMINISTRATION_OPEN_STATUSES.includes(
        session.status as PatientAdministrationOpenStatus,
      ) ||
      session.expiresAt.getTime() > now.getTime()
    ) {
      return session;
    }

    const expired = await this.patientAdministrationSessionModel
      .findOneAndUpdate(
        {
          _id: session._id,
          status: session.status,
          revision: session.revision,
          expiresAt: { $lte: now },
        },
        {
          $set: { status: 'expired', expiredAt: now },
          $unset: {
            entryCodeHash: 1,
            entryCodeExpiresAt: 1,
            sessionTokenHash: 1,
          },
          $inc: { revision: 1 },
          $push: {
            controlEvents: this.buildControlEvent('expired', now),
          },
        },
        { returnDocument: 'after' },
      )
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    if (expired) {
      return expired;
    }

    const current = await this.patientAdministrationSessionModel
      .findById(session._id)
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    return current ?? session;
  }

  private async invalidateForBusinessChange(
    session: PatientAdministrationSessionDocument,
    now: Date,
  ): Promise<void> {
    await this.patientAdministrationSessionModel
      .updateOne(
        {
          _id: session._id,
          status: { $in: PATIENT_ADMINISTRATION_OPEN_STATUSES },
          revision: session.revision,
        },
        {
          $set: { status: 'terminated', terminatedAt: now },
          $unset: {
            entryCodeHash: 1,
            entryCodeExpiresAt: 1,
            sessionTokenHash: 1,
          },
          $inc: { revision: 1 },
          $push: {
            controlEvents: this.buildControlEvent(
              'terminated',
              now,
              undefined,
              'Underlying assessment is no longer eligible',
            ),
          },
        },
      )
      .exec();
  }

  private buildControlEvent(
    action: PatientAdministrationControlEventAction,
    occurredAt: Date,
    operatorSnapshot?: AssessmentOperatorSnapshot,
    reason?: string,
  ): Record<string, unknown> {
    return {
      action,
      occurredAt,
      ...(operatorSnapshot ? { operatorSnapshot } : {}),
      ...(reason ? { reason } : {}),
    };
  }

  private toSessionSummary(
    session: PatientAdministrationSessionDocument,
  ): PatientAdministrationSessionSummaryResponse {
    return {
      id: session._id.toString(),
      status: session.status,
      currentStepKey: session.currentStepKey,
      revision: session.revision,
      expiresAt: session.expiresAt,
      entryCodeExpiresAt: session.entryCodeExpiresAt ?? null,
      hasPatientCredential: Boolean(session.sessionTokenHash),
      preparationConfirmedAt: session.preparationConfirmedAt ?? null,
      preparationConfirmedBy: session.preparationConfirmedBy
        ? this.toOperatorResponse(session.preparationConfirmedBy)
        : null,
      impactFactorCodes: [...(session.impactFactorCodes ?? [])],
      impactFactorNote: session.impactFactorNote,
      createdBy: this.toOperatorResponse(session.createdBy),
      startedAt: session.startedAt ?? null,
      pausedAt: session.pausedAt ?? null,
      completedAt: session.completedAt ?? null,
      terminatedAt: session.terminatedAt ?? null,
      expiredAt: session.expiredAt ?? null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private toOperatorResponse(
    operator: AssessmentOperatorSnapshot,
  ): PatientAdministrationOperatorResponse {
    return {
      operatorId: operator.operatorId?.toString() ?? null,
      operatorName: operator.operatorName,
      operatorRole: operator.operatorRole,
    };
  }

  private toCredentialIssue(
    session: PatientAdministrationSessionDocument,
    rawToken: string,
  ): PatientAdministrationCredentialIssue {
    return {
      rawToken,
      expiresAt: session.expiresAt,
      response: {
        status: session.status,
        revision: session.revision,
        expiresAt: session.expiresAt,
      },
    };
  }

  private generateEntryCode(): string {
    const upperBound = 10 ** PATIENT_ADMINISTRATION_ENTRY_CODE_LENGTH;
    return randomInt(0, upperBound)
      .toString()
      .padStart(PATIENT_ADMINISTRATION_ENTRY_CODE_LENGTH, '0');
  }

  private assertEntryAttemptAllowed(clientKey: string, now: Date): void {
    this.cleanupEntryRateLimits(now);
    const state = this.entryRateLimits.get(clientKey);
    if (
      !state ||
      state.failedAttempts <
        PATIENT_ADMINISTRATION_ENTRY_RATE_LIMIT_MAX_FAILURES
    ) {
      return;
    }

    const remainingMs =
      state.windowStartedAt +
      PATIENT_ADMINISTRATION_ENTRY_RATE_LIMIT_WINDOW_MS -
      now.getTime();
    throw new HttpException(
      {
        code: 'PATIENT_ADMINISTRATION_ENTRY_INVALID',
        message: 'Patient administration entry is invalid',
        remainingSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private recordFailedEntryAttempt(clientKey: string, now: Date): void {
    const state = this.entryRateLimits.get(clientKey);
    if (
      !state ||
      state.windowStartedAt +
        PATIENT_ADMINISTRATION_ENTRY_RATE_LIMIT_WINDOW_MS <=
        now.getTime()
    ) {
      this.entryRateLimits.set(clientKey, {
        windowStartedAt: now.getTime(),
        failedAttempts: 1,
      });
      return;
    }
    state.failedAttempts += 1;
  }

  private cleanupEntryRateLimits(now: Date): void {
    for (const [clientKey, state] of this.entryRateLimits.entries()) {
      if (
        state.windowStartedAt +
          PATIENT_ADMINISTRATION_ENTRY_RATE_LIMIT_WINDOW_MS <=
        now.getTime()
      ) {
        this.entryRateLimits.delete(clientKey);
      }
    }
  }

  private async throwAfterAtomicMiss(scaleInstanceId: string): Promise<never> {
    const current =
      await this.findLatestSessionByScaleInstance(scaleInstanceId);
    if (!current) {
      this.throwSessionNotFound();
    }
    await this.expireIfNeeded(current, new Date());
    this.throwSessionConflict();
  }

  private throwSessionNotFound(): never {
    throw new NotFoundException({
      code: 'PATIENT_ADMINISTRATION_SESSION_NOT_FOUND',
      message: 'Patient administration session was not found',
    });
  }

  private throwSessionConflict(): never {
    throw new ConflictException({
      code: 'PATIENT_ADMINISTRATION_SESSION_CONFLICT',
      message: 'Patient administration session is not in the required state',
    });
  }

  private throwEntryInvalid(): never {
    throw new UnauthorizedException({
      code: 'PATIENT_ADMINISTRATION_ENTRY_INVALID',
      message: 'Patient administration entry is invalid',
    });
  }

  private throwStepConfigurationInvalid(): never {
    throw new InternalServerErrorException({
      code: 'PATIENT_ADMINISTRATION_STEP_INVALID',
      message: 'Patient administration step configuration is invalid',
    });
  }

  private throwStepConflict(): never {
    throw new ConflictException({
      code: 'PATIENT_ADMINISTRATION_STEP_INVALID',
      message: 'Patient administration step is not valid for this operation',
    });
  }

  private throwAssetNotAllowed(): never {
    throw new ForbiddenException({
      code: 'PATIENT_ADMINISTRATION_ASSET_NOT_ALLOWED',
      message: 'Patient administration asset is not allowed',
    });
  }

  private throwPackageInvalid(): never {
    throw new InternalServerErrorException({
      code: 'PRESENTATION_ASSET_PACKAGE_INVALID',
      message: 'Presentation asset package is invalid',
    });
  }
}
