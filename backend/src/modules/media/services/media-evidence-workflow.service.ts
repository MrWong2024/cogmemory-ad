import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import { PatientsService } from '../../patients/services/patients.service';
import {
  AssessmentsService,
  type AssessmentVisitSummary,
  type ItemResponseSummary,
  type ScaleInstanceSummary,
} from '../../assessments/services/assessments.service';
import type { PatientSummary } from '../../patients/services/patients.service';
import {
  DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
  STORAGE_SERVICE,
} from '../../storage/storage.constants';
import { StorageConfigService } from '../../storage/storage-config.service';
import type {
  StorageService,
  UploadedFileResult,
} from '../../storage/storage.interface';
import type { MediaEvidenceAccessQueryDto } from '../dto/media-evidence-access-query.dto';
import type { MediaEvidenceItemParamDto } from '../dto/media-evidence-item-param.dto';
import type { MediaEvidenceParamDto } from '../dto/media-evidence-param.dto';
import type { UploadMediaEvidenceDto } from '../dto/upload-media-evidence.dto';
import type { VoidMediaEvidenceDto } from '../dto/void-media-evidence.dto';
import {
  HandwritingTrajectoryValidationError,
  validateHandwritingTrajectoryJson,
  type ValidatedHandwritingTrajectory,
} from '../lib/handwriting-trajectory-json';
import {
  MediaFileValidationError,
  validatePrimaryMediaFile,
  type ValidatedPrimaryMediaFile,
} from '../lib/media-file-validation';
import type {
  MediaEvidenceMetadata,
  MediaOperatorRole,
} from '../schemas/media-evidence.schema';
import type {
  MediaEvidenceAccessUrlResponse,
  MediaEvidenceListResponse,
  UploadMediaEvidenceResponse,
  VoidMediaEvidenceResponse,
} from '../types/media-evidence-response.types';
import type {
  MediaEvidenceUploadedFiles,
  UploadedMemoryFile,
} from '../types/uploaded-memory-file.types';
import { toMediaEvidenceResponse } from './media-evidence-public.mapper';
import {
  MediaEvidenceService,
  type CreateMediaEvidenceInput,
  type MediaEvidenceOwnership,
  type MediaEvidenceSummary,
} from './media-evidence.service';

const EDITABLE_STATUSES = new Set(['draft', 'in_progress']);
const EDITABLE_ITEM_RESPONSE_STATUSES = new Set([
  'not_started',
  'in_progress',
  'answered',
]);
const OPERATOR_ROLE_PRIORITY: MediaOperatorRole[] = [
  'doctor',
  'nurse',
  'research_assistant',
  'admin',
];

type MediaEvidenceOwnershipChain = {
  patient: PatientSummary;
  visit: AssessmentVisitSummary;
  scaleInstance: ScaleInstanceSummary;
  itemResponse: ItemResponseSummary;
  ownership: MediaEvidenceOwnership;
};

@Injectable()
export class MediaEvidenceWorkflowService {
  private readonly logger = new Logger(MediaEvidenceWorkflowService.name);

  constructor(
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly mediaEvidenceService: MediaEvidenceService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageService,
    private readonly storageConfigService: StorageConfigService,
  ) {}

  async listEvidence(
    params: MediaEvidenceItemParamDto,
  ): Promise<MediaEvidenceListResponse> {
    const chain = await this.requireOwnershipChain(params);
    const items = await this.mediaEvidenceService.listEvidenceByItemOwnership(
      chain.ownership,
    );

    return { items: items.map(toMediaEvidenceResponse) };
  }

  async uploadEvidence(
    params: MediaEvidenceItemParamDto,
    input: UploadMediaEvidenceDto,
    files: MediaEvidenceUploadedFiles | undefined,
    currentUser: AuthenticatedUserContext | undefined,
  ): Promise<UploadMediaEvidenceResponse> {
    const user = this.requireCurrentUser(currentUser);
    const chain = await this.requireOwnershipChain(params);
    this.assertEditableChain(chain);
    this.assertCaptureMode(input);
    this.assertEvidenceRequirement(chain.itemResponse, input.evidenceType);

    const activeEvidence =
      await this.mediaEvidenceService.findActiveEvidenceByItemAndType(
        chain.ownership,
        input.evidenceType,
      );

    if (activeEvidence) {
      this.throwAlreadyAttached();
    }

    const primaryFile = files?.file?.[0];

    if (!primaryFile) {
      throw new BadRequestException({
        code: 'MEDIA_PRIMARY_FILE_REQUIRED',
        message: 'A primary media file is required',
      });
    }

    const trajectoryFile = files?.trajectory?.[0];

    if (input.evidenceType === 'photo' && trajectoryFile) {
      throw new BadRequestException({
        code: 'MEDIA_TRAJECTORY_INVALID',
        message: 'Photo evidence cannot include a handwriting trajectory',
      });
    }

    if (!trajectoryFile && input.trajectoryFormat) {
      throw new BadRequestException({
        code: 'MEDIA_TRAJECTORY_INVALID',
        message: 'A trajectory format requires a trajectory file',
      });
    }

    const primary = this.validatePrimaryFile(primaryFile);
    const trajectory = trajectoryFile
      ? this.validateTrajectoryFile(trajectoryFile)
      : null;
    const objectPrefix = this.requireSafeObjectPrefix();
    const evidenceCode = this.createEvidenceCode();
    const primaryObjectKey = this.createPrimaryObjectKey(
      objectPrefix,
      params,
      primary.fileExtension,
    );
    const trajectoryObjectKey = trajectory
      ? this.createTrajectoryObjectKey(objectPrefix, params)
      : null;
    const uploadedObjectKeys: string[] = [];
    let primaryUpload: UploadedFileResult;

    try {
      primaryUpload = await this.storageService.uploadFile({
        objectKey: primaryObjectKey,
        buffer: primary.sanitizedBuffer,
        sizeBytes: primary.sizeBytes,
        mimeType: primary.detectedMimeType,
      });
      uploadedObjectKeys.push(primaryObjectKey);
    } catch {
      throw this.storageUnavailable();
    }

    if (trajectory && trajectoryObjectKey) {
      try {
        await this.storageService.uploadFile({
          objectKey: trajectoryObjectKey,
          buffer: trajectory.normalizedBuffer,
          sizeBytes: trajectory.sizeBytes,
          mimeType: 'application/json',
        });
        uploadedObjectKeys.push(trajectoryObjectKey);
      } catch {
        await this.cleanupStorage(uploadedObjectKeys, evidenceCode);
        throw this.storageUnavailable();
      }
    }

    const now = new Date();
    const createInput = this.buildCreateInput({
      chain,
      input,
      user,
      primary,
      primaryUpload,
      trajectory,
      trajectoryObjectKey,
      evidenceCode,
      objectPrefix,
      now,
    });
    let evidence: MediaEvidenceSummary;

    try {
      evidence = await this.mediaEvidenceService.createEvidence(createInput);
    } catch {
      await this.cleanupStorage(uploadedObjectKeys, evidenceCode);
      throw new InternalServerErrorException({
        code: 'MEDIA_EVIDENCE_CREATE_FAILED',
        message: 'Media evidence could not be created',
      });
    }

    let attachedItemResponse: ItemResponseSummary | null;

    try {
      attachedItemResponse =
        await this.assessmentsService.attachItemEvidenceReference(
          params.patientId,
          params.visitId,
          params.scaleInstanceId,
          params.itemResponseId,
          input.evidenceType,
          evidence.id,
        );
    } catch {
      await this.cleanupCreatedEvidence(
        evidence.id,
        uploadedObjectKeys,
        evidenceCode,
      );
      throw new InternalServerErrorException({
        code: 'MEDIA_EVIDENCE_ATTACH_FAILED',
        message: 'Media evidence reference could not be attached',
      });
    }

    if (!attachedItemResponse) {
      await this.cleanupCreatedEvidence(
        evidence.id,
        uploadedObjectKeys,
        evidenceCode,
      );
      this.throwAlreadyAttached();
    }

    return {
      mediaEvidence: toMediaEvidenceResponse(evidence),
      evidenceRequirement: {
        evidenceType: input.evidenceType,
        status: 'attached',
        attached: true,
      },
    };
  }

  async createAccessUrl(
    params: MediaEvidenceParamDto,
    query: MediaEvidenceAccessQueryDto,
  ): Promise<MediaEvidenceAccessUrlResponse> {
    const chain = await this.requireOwnershipChain(params);
    const evidence = await this.requireEvidence(
      chain.ownership,
      params.mediaEvidenceId,
    );

    if (
      !['attached', 'locked'].includes(evidence.status) ||
      evidence.storageStatus !== 'stored' ||
      !evidence.storage?.objectKey
    ) {
      throw new ConflictException({
        code: 'MEDIA_EVIDENCE_NOT_ACCESSIBLE',
        message: 'Media evidence is not accessible',
      });
    }

    let objectKey = evidence.storage.objectKey;

    if (query.asset === 'trajectory') {
      if (
        !evidence.handwritingTrace?.hasTrajectory ||
        !evidence.handwritingTrace.trajectoryObjectKey
      ) {
        throw new NotFoundException({
          code: 'MEDIA_TRAJECTORY_NOT_FOUND',
          message: 'Media trajectory was not found',
        });
      }

      objectKey = evidence.handwritingTrace.trajectoryObjectKey;
    }

    try {
      const signedUrl = await this.storageService.getSignedUrl(objectKey, {
        expiresInSeconds: DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
      });

      return {
        asset: query.asset,
        url: signedUrl.url,
        expiresAt: signedUrl.expiresAt,
      };
    } catch {
      throw this.storageUnavailable();
    }
  }

  async voidEvidence(
    params: MediaEvidenceParamDto,
    input: VoidMediaEvidenceDto,
    currentUser: AuthenticatedUserContext | undefined,
  ): Promise<VoidMediaEvidenceResponse> {
    const user = this.requireCurrentUser(currentUser);
    const chain = await this.requireOwnershipChain(params);
    this.assertEditableChain(chain);
    const evidence = await this.requireEvidence(
      chain.ownership,
      params.mediaEvidenceId,
    );

    if (evidence.status !== 'attached') {
      throw new ConflictException({
        code: 'MEDIA_EVIDENCE_NOT_VOIDABLE',
        message: 'Media evidence cannot be voided',
      });
    }

    const evidenceType = this.toPublicEvidenceType(evidence.evidenceType);

    const matchingReference = chain.itemResponse.evidenceRefs.find(
      (reference) =>
        reference.evidenceType === evidenceType &&
        reference.mediaEvidenceId === evidence.id &&
        reference.status === 'attached',
    );

    if (!matchingReference) {
      throw new ConflictException({
        code: 'MEDIA_EVIDENCE_NOT_VOIDABLE',
        message: 'Media evidence cannot be voided',
      });
    }

    let cleared: ItemResponseSummary | null;

    try {
      cleared = await this.assessmentsService.clearItemEvidenceReference(
        params.patientId,
        params.visitId,
        params.scaleInstanceId,
        params.itemResponseId,
        evidenceType,
        evidence.id,
      );
    } catch {
      throw new InternalServerErrorException({
        code: 'MEDIA_EVIDENCE_VOID_FAILED',
        message: 'Media evidence could not be voided',
      });
    }

    if (!cleared) {
      throw new ConflictException({
        code: 'MEDIA_EVIDENCE_NOT_VOIDABLE',
        message: 'Media evidence cannot be voided',
      });
    }

    const voidedAt = new Date();
    const metadata: MediaEvidenceMetadata = {
      voidReason: input.reason,
      voidedBy: user.id,
      voidedAt: voidedAt.toISOString(),
    };
    let voidedEvidence: MediaEvidenceSummary | null = null;

    try {
      voidedEvidence = await this.mediaEvidenceService.markEvidenceVoided(
        chain.ownership,
        evidence.id,
        voidedAt,
        metadata,
      );
    } catch {
      voidedEvidence = null;
    }

    if (!voidedEvidence) {
      await this.restoreClearedReference(chain, evidence);
      throw new InternalServerErrorException({
        code: 'MEDIA_EVIDENCE_VOID_FAILED',
        message: 'Media evidence could not be voided',
      });
    }

    return {
      mediaEvidence: toMediaEvidenceResponse(voidedEvidence),
      evidenceRequirement: {
        evidenceType,
        status: 'pending',
        attached: false,
      },
    };
  }

  private async requireOwnershipChain(
    params: MediaEvidenceItemParamDto,
  ): Promise<MediaEvidenceOwnershipChain> {
    const patient = await this.patientsService.findPatientById(
      params.patientId,
    );

    if (!patient) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
      });
    }

    const visit = await this.assessmentsService.findVisitByPatientAndId(
      params.patientId,
      params.visitId,
    );

    if (!visit) {
      throw new NotFoundException({
        code: 'VISIT_NOT_FOUND',
        message: 'Assessment visit not found',
      });
    }

    const scaleInstance =
      await this.assessmentsService.findScaleInstanceByPatientVisitAndId(
        params.patientId,
        params.visitId,
        params.scaleInstanceId,
      );

    if (!scaleInstance) {
      throw new NotFoundException({
        code: 'SCALE_INSTANCE_NOT_FOUND',
        message: 'Scale instance not found',
      });
    }

    const itemResponse =
      await this.assessmentsService.findItemResponseByOwnership(
        params.patientId,
        params.visitId,
        params.scaleInstanceId,
        params.itemResponseId,
      );

    if (!itemResponse) {
      throw new NotFoundException({
        code: 'ITEM_RESPONSE_NOT_FOUND',
        message: 'Item response not found',
      });
    }

    return {
      patient,
      visit,
      scaleInstance,
      itemResponse,
      ownership: {
        patientId: params.patientId,
        assessmentVisitId: params.visitId,
        scaleInstanceId: params.scaleInstanceId,
        itemResponseId: params.itemResponseId,
      },
    };
  }

  private assertEditableChain(chain: MediaEvidenceOwnershipChain): void {
    if (chain.patient.status !== 'active') {
      throw new ConflictException({
        code: 'PATIENT_NOT_ACTIVE',
        message: 'Patient is not active',
      });
    }

    if (!EDITABLE_STATUSES.has(chain.visit.status)) {
      throw new ConflictException({
        code: 'VISIT_NOT_EDITABLE',
        message: 'Assessment visit is not editable',
      });
    }

    if (!EDITABLE_STATUSES.has(chain.scaleInstance.status)) {
      throw new ConflictException({
        code: 'SCALE_INSTANCE_NOT_EDITABLE',
        message: 'Scale instance is not editable',
      });
    }

    if (!EDITABLE_ITEM_RESPONSE_STATUSES.has(chain.itemResponse.status)) {
      throw new ConflictException({
        code: 'ITEM_RESPONSE_NOT_EDITABLE',
        message: 'Item response is not editable',
      });
    }
  }

  private assertCaptureMode(input: UploadMediaEvidenceDto): void {
    const valid =
      (input.evidenceType === 'photo' &&
        ['photo_upload', 'paper_scan'].includes(input.captureMode)) ||
      (input.evidenceType === 'handwriting' &&
        input.captureMode === 'tablet_handwriting');

    if (!valid) {
      throw new BadRequestException({
        code: 'MEDIA_CAPTURE_MODE_INVALID',
        message: 'Media capture mode is invalid',
      });
    }
  }

  private assertEvidenceRequirement(
    itemResponse: ItemResponseSummary,
    evidenceType: 'photo' | 'handwriting',
  ): void {
    const reference = itemResponse.evidenceRefs.find(
      (item) => item.evidenceType === evidenceType,
    );

    if (!reference || reference.status === 'not_required') {
      throw new ConflictException({
        code: 'ITEM_EVIDENCE_TYPE_NOT_REQUIRED',
        message: 'Item evidence type is not required',
      });
    }

    if (
      reference.mediaEvidenceId !== null ||
      ['attached', 'locked'].includes(reference.status)
    ) {
      this.throwAlreadyAttached();
    }
  }

  private validatePrimaryFile(
    file: UploadedMemoryFile,
  ): ValidatedPrimaryMediaFile {
    try {
      return validatePrimaryMediaFile(file);
    } catch (error: unknown) {
      if (error instanceof MediaFileValidationError) {
        const body = { code: error.code, message: error.message };

        if (error.statusCode === 413) {
          throw new PayloadTooLargeException(body);
        }

        throw new BadRequestException(body);
      }

      throw error;
    }
  }

  private validateTrajectoryFile(
    file: UploadedMemoryFile,
  ): ValidatedHandwritingTrajectory {
    try {
      return validateHandwritingTrajectoryJson(file);
    } catch (error: unknown) {
      if (error instanceof HandwritingTrajectoryValidationError) {
        throw new BadRequestException({
          code: error.code,
          message: error.message,
        });
      }

      throw error;
    }
  }

  private requireSafeObjectPrefix(): string {
    const prefix = this.storageConfigService
      .getObjectPrefix()
      .trim()
      .replace(/^\/+|\/+$/g, '');

    if (!prefix || prefix.includes('..') || prefix.includes('\\')) {
      throw this.storageUnavailable();
    }

    return prefix;
  }

  private createEvidenceCode(): string {
    return `EVD-${randomUUID().replace(/-/g, '').toUpperCase()}`;
  }

  private createPrimaryObjectKey(
    prefix: string,
    params: MediaEvidenceItemParamDto,
    fileExtension: string,
  ): string {
    return `${this.createObjectDirectory(prefix, params)}/${randomUUID()}.${fileExtension}`;
  }

  private createTrajectoryObjectKey(
    prefix: string,
    params: MediaEvidenceItemParamDto,
  ): string {
    return `${this.createObjectDirectory(prefix, params)}/${randomUUID()}.trajectory.json`;
  }

  private createObjectDirectory(
    prefix: string,
    params: MediaEvidenceItemParamDto,
  ): string {
    return [
      prefix,
      'clinical-evidence',
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      params.itemResponseId,
    ].join('/');
  }

  private buildCreateInput(args: {
    chain: MediaEvidenceOwnershipChain;
    input: UploadMediaEvidenceDto;
    user: AuthenticatedUserContext;
    primary: ValidatedPrimaryMediaFile;
    primaryUpload: {
      objectKey: string;
      bucket: string;
      sizeBytes: number;
      mimeType: string;
    };
    trajectory: ValidatedHandwritingTrajectory | null;
    trajectoryObjectKey: string | null;
    evidenceCode: string;
    objectPrefix: string;
    now: Date;
  }): CreateMediaEvidenceInput {
    const capturedAt = args.input.capturedAt
      ? new Date(args.input.capturedAt)
      : null;
    const item = args.chain.itemResponse;

    return {
      patientId: new Types.ObjectId(args.chain.patient.id),
      assessmentVisitId: new Types.ObjectId(args.chain.visit.id),
      scaleInstanceId: new Types.ObjectId(args.chain.scaleInstance.id),
      itemResponseId: new Types.ObjectId(item.id),
      subjectCode: args.chain.patient.subjectCode,
      scaleDefinitionId: new Types.ObjectId(item.scaleDefinitionId),
      scaleVersionId: new Types.ObjectId(item.scaleVersionId),
      scaleCode: item.scaleCode,
      scaleVersion: item.scaleVersion,
      instanceCode: item.instanceCode,
      itemCode: item.itemCode,
      evidenceCode: args.evidenceCode,
      evidenceType: args.input.evidenceType,
      captureMode: args.input.captureMode,
      status: 'attached',
      storageStatus: 'stored',
      crfCode: item.crfCode,
      groupCode: item.groupCode,
      itemTitle: item.itemTitle,
      responseType: item.responseType,
      countsTowardTotal: item.countsTowardTotal,
      cognitiveDomainCodes: [...item.cognitiveDomainCodes],
      itemSnapshot: {
        itemCode: item.itemCode,
        crfCode: item.crfCode,
        groupCode: item.groupCode,
        itemTitle: item.itemTitle,
        responseType: item.responseType,
        evidenceType: args.input.evidenceType,
      },
      versionTrace: item.versionTrace
        ? {
            scaleVersion: item.versionTrace.scaleVersion,
            crfVersion: item.versionTrace.crfVersion,
            scoringRuleVersion: item.versionTrace.scoringRuleVersion,
            fieldEncodingVersion: item.versionTrace.fieldEncodingVersion,
            sourceDocument: item.versionTrace.sourceDocument,
          }
        : null,
      storage: {
        storageDriver: this.storageService.driver,
        bucket: args.primaryUpload.bucket,
        objectKey: args.primaryUpload.objectKey,
        objectPrefix: args.objectPrefix,
        publicUrl: undefined,
        mimeType: args.primary.detectedMimeType,
        fileExtension: args.primary.fileExtension,
        sizeBytes: args.primary.sizeBytes,
        checksum: args.primary.checksum,
        checksumAlgorithm: args.primary.checksumAlgorithm,
        originalFilename: undefined,
        storedAt: args.now,
      },
      imageMetadata: {
        width: args.input.imageWidth ?? null,
        height: args.input.imageHeight ?? null,
        orientation: args.input.orientation,
        pageNo: args.input.pageNo ?? null,
        isColor: args.input.isColor ?? null,
        capturedAt,
      },
      handwritingTrace:
        args.input.evidenceType === 'handwriting'
          ? {
              hasTrajectory: args.trajectory !== null,
              trajectoryObjectKey: args.trajectoryObjectKey ?? undefined,
              trajectoryFormat: args.trajectory
                ? (args.input.trajectoryFormat ?? 'json')
                : 'unknown',
              strokeCount: args.input.strokeCount ?? null,
              durationMs: args.input.trajectoryDurationMs ?? null,
              canvasWidth: args.input.canvasWidth ?? null,
              canvasHeight: args.input.canvasHeight ?? null,
              deviceType: args.input.deviceType,
              inputTool: args.input.inputTool ?? 'unknown',
            }
          : null,
      captureContext: {
        capturedAt,
        uploadedAt: args.now,
        sourceDevice: args.input.sourceDevice,
        sourceApp: args.input.sourceApp,
        captureNote: args.input.captureNote,
      },
      operatorSnapshot: {
        operatorId: new Types.ObjectId(args.user.id),
        operatorName: args.user.displayName,
        operatorRole: this.resolveOperatorRole(args.user),
      },
      qualityStatus: 'unchecked',
      qualityHints: null,
      operatorNote: args.input.operatorNote,
      description: args.input.description,
      metadata: null,
      lockedAt: null,
      voidedAt: null,
      deletedAt: null,
    };
  }

  private async requireEvidence(
    ownership: MediaEvidenceOwnership,
    mediaEvidenceId: string,
  ): Promise<MediaEvidenceSummary> {
    const evidence = await this.mediaEvidenceService.findEvidenceByOwnership(
      ownership,
      mediaEvidenceId,
    );

    if (!evidence) {
      throw new NotFoundException({
        code: 'MEDIA_EVIDENCE_NOT_FOUND',
        message: 'Media evidence not found',
      });
    }

    return evidence;
  }

  private async cleanupCreatedEvidence(
    mediaEvidenceId: string,
    objectKeys: string[],
    evidenceCode: string,
  ): Promise<void> {
    let evidenceDeleted = false;

    try {
      evidenceDeleted =
        await this.mediaEvidenceService.deleteEvidenceForCompensation(
          mediaEvidenceId,
        );
    } catch {
      evidenceDeleted = false;
    }

    await this.cleanupStorage(objectKeys, evidenceCode, evidenceDeleted);
  }

  private async cleanupStorage(
    objectKeys: string[],
    evidenceCode: string,
    previousCompensationSucceeded = true,
  ): Promise<void> {
    let compensationSucceeded = previousCompensationSucceeded;

    for (const objectKey of objectKeys) {
      try {
        await this.storageService.deleteObject(objectKey);
      } catch {
        compensationSucceeded = false;
      }
    }

    this.logger.warn(
      `Media evidence compensation completed; evidenceCode=${evidenceCode}; driver=${this.storageService.driver}; succeeded=${String(compensationSucceeded)}`,
    );
  }

  private async restoreClearedReference(
    chain: MediaEvidenceOwnershipChain,
    evidence: MediaEvidenceSummary,
  ): Promise<void> {
    let restored = false;
    const evidenceType = this.toPublicEvidenceType(evidence.evidenceType);

    try {
      restored = Boolean(
        await this.assessmentsService.restoreItemEvidenceReference(
          chain.patient.id,
          chain.visit.id,
          chain.scaleInstance.id,
          chain.itemResponse.id,
          evidenceType,
          evidence.id,
        ),
      );
    } catch {
      restored = false;
    }

    this.logger.warn(
      `Media evidence void compensation completed; evidenceCode=${evidence.evidenceCode}; driver=${this.storageService.driver}; succeeded=${String(restored)}`,
    );
  }

  private resolveOperatorRole(
    user: AuthenticatedUserContext,
  ): MediaOperatorRole {
    return (
      OPERATOR_ROLE_PRIORITY.find((role) => user.roles.includes(role)) ??
      'unknown'
    );
  }

  private requireCurrentUser(
    currentUser: AuthenticatedUserContext | undefined,
  ): AuthenticatedUserContext {
    if (!currentUser) {
      throw new UnauthorizedException();
    }

    return currentUser;
  }

  private throwAlreadyAttached(): never {
    throw new ConflictException({
      code: 'MEDIA_EVIDENCE_ALREADY_ATTACHED',
      message: 'Media evidence is already attached',
    });
  }

  private storageUnavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'MEDIA_STORAGE_UNAVAILABLE',
      message: 'Media storage is unavailable',
    });
  }

  private toPublicEvidenceType(
    evidenceType: MediaEvidenceSummary['evidenceType'],
  ): 'photo' | 'handwriting' {
    if (evidenceType === 'photo' || evidenceType === 'handwriting') {
      return evidenceType;
    }

    throw new HttpException(
      {
        code: 'MEDIA_EVIDENCE_NOT_VOIDABLE',
        message: 'Media evidence cannot be voided',
      },
      HttpStatus.CONFLICT,
    );
  }
}
