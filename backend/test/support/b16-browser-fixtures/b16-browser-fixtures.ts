import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import type { AuthenticatedUserContext } from '../../../src/modules/auth/types/auth-user-context.type';
import {
  Session,
  type SessionDocument,
} from '../../../src/modules/auth/schemas/session.schema';
import { AuthService } from '../../../src/modules/auth/services/auth.service';
import {
  AssessmentVisit,
  type AssessmentVisitDocument,
} from '../../../src/modules/assessments/schemas/assessment-visit.schema';
import {
  ItemResponse,
  type ItemResponseDocument,
} from '../../../src/modules/assessments/schemas/item-response.schema';
import {
  ScaleInstance,
  type ScaleInstanceDocument,
} from '../../../src/modules/assessments/schemas/scale-instance.schema';
import {
  CognitiveDomainResult,
  type CognitiveDomainResultDocument,
} from '../../../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
import {
  MediaEvidence,
  type MediaEvidenceDocument,
} from '../../../src/modules/media/schemas/media-evidence.schema';
import {
  Patient,
  type PatientDocument,
} from '../../../src/modules/patients/schemas/patient.schema';
import {
  ClinicalReport,
  type ClinicalReportDocument,
} from '../../../src/modules/reports/schemas/clinical-report.schema';
import { resolveExistingClinicalReportArchive } from '../../../src/modules/reports/lib/clinical-report-archive';
import {
  resolveClinicalReportReplacementLineage,
  resolveExistingClinicalReportCorrection,
} from '../../../src/modules/reports/lib/clinical-report-correction';
import { resolveExistingClinicalReportLock } from '../../../src/modules/reports/lib/clinical-report-lock';
import {
  buildClinicalReportSourceFreezeCounts,
  buildClinicalReportSourceFreezeScope,
  buildSourceFreezeStartMetadata,
  evaluateClinicalReportSourceFreezeReadiness,
  resolveExistingSourceFreeze,
} from '../../../src/modules/reports/lib/clinical-report-source-freeze';
import {
  readClinicalReportConfirmation,
  readClinicalReportSubmission,
} from '../../../src/modules/reports/lib/clinical-report-review';
import { ClinicalReportArchiveWorkflowService } from '../../../src/modules/reports/services/clinical-report-archive-workflow.service';
import { ClinicalReportCorrectionWorkflowService } from '../../../src/modules/reports/services/clinical-report-correction-workflow.service';
import { ClinicalReportLockWorkflowService } from '../../../src/modules/reports/services/clinical-report-lock-workflow.service';
import { ClinicalReportPublicMapper } from '../../../src/modules/reports/services/clinical-report-public.mapper';
import { ClinicalReportReviewWorkflowService } from '../../../src/modules/reports/services/clinical-report-review-workflow.service';
import { ClinicalReportSourceFreezeWorkflowService } from '../../../src/modules/reports/services/clinical-report-source-freeze-workflow.service';
import {
  ReportsService,
  type ClinicalReportSummary,
} from '../../../src/modules/reports/services/reports.service';
import {
  ScoreResult,
  type ScoreResultDocument,
} from '../../../src/modules/scoring/schemas/score-result.schema';
import {
  User,
  type UserDocument,
} from '../../../src/modules/users/schemas/user.schema';
import {
  B16_BUSINESS_SCENARIOS,
  B16_ROLES,
  B16FixtureError,
  accountNameFor,
  assertB16RuntimeEnvironment,
  assertB16SafeManifest,
  baseReportCodeFor,
  displayNameFor,
  requireB16FixturePassword,
  subjectCodeFor,
  validateB16Namespace,
  visitCodeFor,
  type B16BusinessScenarioDefinition,
  type B16BusinessScenarioKey,
  type B16Role,
  type B16SafeAggregateCounts,
  type B16SafeCleanupSummary,
  type B16SafeManifest,
  type B16SafeRoleManifest,
  type B16SafeScenarioManifest,
} from './fixture-contract';

type B16Models = {
  users: Model<UserDocument>;
  sessions: Model<SessionDocument>;
  patients: Model<PatientDocument>;
  visits: Model<AssessmentVisitDocument>;
  scaleInstances: Model<ScaleInstanceDocument>;
  itemResponses: Model<ItemResponseDocument>;
  mediaEvidence: Model<MediaEvidenceDocument>;
  scoreResults: Model<ScoreResultDocument>;
  cognitiveDomainResults: Model<CognitiveDomainResultDocument>;
  reports: Model<ClinicalReportDocument>;
};

type B16Workflows = {
  review: ClinicalReportReviewWorkflowService;
  lock: ClinicalReportLockWorkflowService;
  freeze: ClinicalReportSourceFreezeWorkflowService;
  archive: ClinicalReportArchiveWorkflowService;
  correction: ClinicalReportCorrectionWorkflowService;
};

type ScenarioRoot = {
  patientId: string;
  visitId: string;
  currentReport: ClinicalReportSummary;
};

type RootIdentifiers = {
  accountNames: string[];
  subjectCodes: string[];
  visitCodes: string[];
};

type ResidualCounts = {
  users: number;
  patients: number;
  visits: number;
  sessions: number;
  reports: number;
  cognitiveDomainResults: number;
  scoreResults: number;
  mediaEvidence: number;
  itemResponses: number;
  scaleInstances: number;
};

const SOURCE_COUNTS = {
  scaleInstanceCount: 1,
  itemResponseCount: 1,
  scoreResultCount: 1,
  cognitiveDomainResultCount: 1,
  mediaEvidenceCount: 1,
  totalSourceCount: 5,
} as const;

function requiredDate(
  value: Date | null,
  scenarioKey: B16BusinessScenarioKey,
): Date {
  if (!value) {
    throw scenarioFailure(scenarioKey, 'Required report timestamp is missing');
  }
  return value;
}

function scenarioFailure(
  scenarioKey: B16BusinessScenarioKey,
  safeMessage: string,
): B16FixtureError {
  return new B16FixtureError(
    'B16_FIXTURE_SCENARIO_INVALID',
    safeMessage,
    scenarioKey,
  );
}

function expectedReportVersion(
  definition: B16BusinessScenarioDefinition,
): number {
  return definition.target.startsWith('v2_') ? 2 : 1;
}

function expectedIdentifiers(namespace: string): RootIdentifiers {
  return {
    accountNames: B16_ROLES.map((role) => accountNameFor(namespace, role)),
    subjectCodes: B16_BUSINESS_SCENARIOS.map((definition) =>
      subjectCodeFor(namespace, definition.ordinal),
    ),
    visitCodes: B16_BUSINESS_SCENARIOS.map((definition) =>
      visitCodeFor(namespace, definition.ordinal),
    ),
  };
}

function toActor(user: UserDocument): AuthenticatedUserContext {
  return {
    id: user._id.toString(),
    accountName: user.accountName,
    displayName: user.displayName,
    roles: [...user.roles],
    permissions: [...user.permissions],
    userType: user.userType,
  };
}

function reportTimestamp(
  report: ClinicalReportSummary,
  scenarioKey: B16BusinessScenarioKey,
): string {
  return requiredDate(report.updatedAt, scenarioKey).toISOString();
}

function safeStatus(
  report: ClinicalReportSummary,
  patientStatus: string,
  visitStatus: string,
  lineageStatus: 'not_applicable' | 'valid' | 'intentionally_invalid',
): string {
  const freeze = resolveExistingSourceFreeze(report);
  const parts = [
    `report:${report.status}`,
    `locked:${report.lockedAt ? 'yes' : 'no'}`,
    `freeze:${freeze?.state ?? 'not_started'}`,
    `patient:${patientStatus}`,
    `visit:${visitStatus}`,
    `lineage:${lineageStatus}`,
  ];
  return parts.join(';');
}

function aggregateCounts(
  report: ClinicalReportSummary,
): B16SafeAggregateCounts {
  const freeze = resolveExistingSourceFreeze(report);
  if (!freeze) {
    return {
      expectedSourceCount: SOURCE_COUNTS.totalSourceCount,
      completedSourceCount: null,
      newlyFrozenSourceCount: null,
      previouslyFrozenSourceCount:
        report.reportVersion > 1 ? SOURCE_COUNTS.totalSourceCount : 0,
    };
  }
  return {
    expectedSourceCount: freeze.expectedCounts.totalSourceCount,
    completedSourceCount: freeze.completedCounts?.totalSourceCount ?? null,
    newlyFrozenSourceCount: freeze.newlyFrozenCounts?.totalSourceCount ?? null,
    previouslyFrozenSourceCount: freeze.previouslyFrozenCounts.totalSourceCount,
  };
}

function shouldExposeAggregateCounts(
  definition: B16BusinessScenarioDefinition,
): boolean {
  return (
    definition.target === 'v1_archived' ||
    definition.target === 'v2_ready_freeze' ||
    definition.target === 'v2_freeze_in_progress' ||
    definition.target === 'v2_ready_archive' ||
    definition.target === 'v2_archived'
  );
}

export class B16BrowserFixtureManager {
  constructor(
    private readonly databaseName: string,
    private readonly models: B16Models,
    private readonly authService: AuthService,
    private readonly reportsService: ReportsService,
    private readonly publicMapper: ClinicalReportPublicMapper,
    private readonly workflows: B16Workflows,
  ) {}

  async prepare(
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B16SafeManifest> {
    const namespace = validateB16Namespace(rawNamespace);
    const password = requireB16FixturePassword(rawPassword);
    await this.assertNamespaceUnused(namespace);
    let started = false;
    try {
      started = true;
      const users = await this.createUsers(namespace, password);
      const doctor = users.get('doctor');
      if (!doctor) {
        throw new B16FixtureError(
          'B16_FIXTURE_ACCOUNT_CREATION_FAILED',
          'The doctor fixture account was not created',
        );
      }
      const actor = toActor(doctor);
      for (const definition of B16_BUSINESS_SCENARIOS) {
        await this.createScenario(namespace, definition, actor);
      }
      return await this.verifyInternal(namespace, password, 'created');
    } catch (error: unknown) {
      if (started) {
        try {
          await this.cleanup(namespace);
        } catch {
          // Preserve the original safe failure. A later explicit cleanup can retry.
        }
      }
      throw error;
    }
  }

  async verify(
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B16SafeManifest> {
    const namespace = validateB16Namespace(rawNamespace);
    const password = requireB16FixturePassword(rawPassword);
    return this.verifyInternal(namespace, password, 'verified');
  }

  async replace(
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B16SafeManifest> {
    const namespace = validateB16Namespace(rawNamespace);
    const password = requireB16FixturePassword(rawPassword);
    await this.cleanup(namespace);
    return this.prepare(namespace, password);
  }

  async cleanup(rawNamespace: string): Promise<B16SafeCleanupSummary> {
    const namespace = validateB16Namespace(rawNamespace);
    const identifiers = expectedIdentifiers(namespace);
    const users = await this.models.users
      .find({ accountName: { $in: identifiers.accountNames } })
      .exec();
    const patients = await this.models.patients
      .find({ subjectCode: { $in: identifiers.subjectCodes } })
      .exec();
    const visits = await this.models.visits
      .find({ visitCode: { $in: identifiers.visitCodes } })
      .exec();

    await this.assertNoUnexpectedNamespaceRoots(
      namespace,
      identifiers,
      patients,
      visits,
    );

    const userIds = users.map((user) => user._id);
    const patientIds = patients.map((patient) => patient._id);
    const visitIds = visits.map((visit) => visit._id);
    const matched = userIds.length + patientIds.length + visitIds.length > 0;

    const deleted = {
      sessions: 0,
      reports: 0,
      cognitiveDomainResults: 0,
      scoreResults: 0,
      mediaEvidence: 0,
      itemResponses: 0,
      scaleInstances: 0,
      visits: 0,
      patients: 0,
      users: 0,
    };

    if (userIds.length > 0) {
      deleted.sessions = (
        await this.models.sessions
          .deleteMany({ userId: { $in: userIds } })
          .exec()
      ).deletedCount;
    }

    const ownershipFilter = this.buildOwnershipFilter(patientIds, visitIds);
    if (ownershipFilter) {
      deleted.reports = (
        await this.models.reports.deleteMany(ownershipFilter).exec()
      ).deletedCount;
      deleted.cognitiveDomainResults = (
        await this.models.cognitiveDomainResults
          .deleteMany(ownershipFilter)
          .exec()
      ).deletedCount;
      deleted.scoreResults = (
        await this.models.scoreResults.deleteMany(ownershipFilter).exec()
      ).deletedCount;
      deleted.mediaEvidence = (
        await this.models.mediaEvidence.deleteMany(ownershipFilter).exec()
      ).deletedCount;
      deleted.itemResponses = (
        await this.models.itemResponses.deleteMany(ownershipFilter).exec()
      ).deletedCount;
      deleted.scaleInstances = (
        await this.models.scaleInstances.deleteMany(ownershipFilter).exec()
      ).deletedCount;
    }
    if (visitIds.length > 0) {
      deleted.visits = (
        await this.models.visits.deleteMany({ _id: { $in: visitIds } }).exec()
      ).deletedCount;
    }
    if (patientIds.length > 0) {
      deleted.patients = (
        await this.models.patients
          .deleteMany({ _id: { $in: patientIds } })
          .exec()
      ).deletedCount;
    }
    if (userIds.length > 0) {
      deleted.users = (
        await this.models.users.deleteMany({ _id: { $in: userIds } }).exec()
      ).deletedCount;
    }

    const residuals = await this.countResiduals(
      identifiers,
      userIds,
      patientIds,
      visitIds,
    );
    const residualCount = Object.values(residuals).reduce(
      (total, count) => total + count,
      0,
    );
    if (residualCount !== 0) {
      const safeCounts = Object.entries(residuals)
        .filter(([, count]) => count > 0)
        .map(([collection, count]) => `${collection}:${count}`)
        .join(',');
      throw new B16FixtureError(
        'B16_FIXTURE_CLEANUP_INCOMPLETE',
        `Fixture cleanup left namespace-owned records behind (${safeCounts})`,
      );
    }
    const result: B16SafeCleanupSummary = {
      namespace,
      databaseName: this.databaseName,
      action: 'cleaned',
      matched,
      deleted,
      residualCount,
    };
    assertB16SafeManifest(result);
    return result;
  }

  private async assertNamespaceUnused(namespace: string): Promise<void> {
    const identifiers = expectedIdentifiers(namespace);
    const [userCount, patientCount, visitCount] = await Promise.all([
      this.models.users.countDocuments({
        accountName: { $in: identifiers.accountNames },
      }),
      this.models.patients.countDocuments({
        subjectCode: { $in: identifiers.subjectCodes },
      }),
      this.models.visits.countDocuments({
        visitCode: { $in: identifiers.visitCodes },
      }),
    ]);
    if (userCount + patientCount + visitCount > 0) {
      throw new B16FixtureError(
        'B16_FIXTURE_NAMESPACE_EXISTS',
        'The namespace already has fixture records; run verify, explicit cleanup, or confirmed replace',
      );
    }
    await this.assertNoUnexpectedNamespaceRoots(namespace, identifiers, [], []);
  }

  private async assertNoUnexpectedNamespaceRoots(
    namespace: string,
    identifiers: RootIdentifiers,
    knownPatients: PatientDocument[],
    knownVisits: AssessmentVisitDocument[],
  ): Promise<void> {
    const upper = namespace.toUpperCase();
    const [prefixedUsers, prefixedPatients, prefixedVisits] = await Promise.all(
      [
        this.models.users
          .find({ accountName: { $regex: `^b16fx-${namespace}-` } })
          .exec(),
        this.models.patients
          .find({ subjectCode: { $regex: `^B16-${upper}-` } })
          .exec(),
        this.models.visits
          .find({ visitCode: { $regex: `^B16-${upper}-` } })
          .exec(),
      ],
    );
    const accountSet = new Set(identifiers.accountNames);
    const subjectSet = new Set(identifiers.subjectCodes);
    const visitSet = new Set(identifiers.visitCodes);
    if (
      prefixedUsers.some((user) => !accountSet.has(user.accountName)) ||
      prefixedPatients.some(
        (patient) => !subjectSet.has(patient.subjectCode),
      ) ||
      prefixedVisits.some((visit) => !visitSet.has(visit.visitCode))
    ) {
      throw new B16FixtureError(
        'B16_FIXTURE_NAMESPACE_SCOPE_UNSAFE',
        'Namespace preflight found an unexpected root record; no fixture data was changed',
      );
    }
    const patientByCode = new Map(
      [...knownPatients, ...prefixedPatients].map((patient) => [
        patient.subjectCode,
        patient._id.toString(),
      ]),
    );
    for (const visit of [...knownVisits, ...prefixedVisits]) {
      const subjectCode = visit.visitCode.replace(/-VISIT$/, '');
      const patientId = patientByCode.get(subjectCode);
      if (patientId && patientId !== visit.patientId.toString()) {
        throw new B16FixtureError(
          'B16_FIXTURE_NAMESPACE_SCOPE_UNSAFE',
          'Namespace preflight found inconsistent root ownership; no fixture data was changed',
        );
      }
    }
  }

  private buildOwnershipFilter(
    patientIds: Types.ObjectId[],
    visitIds: Types.ObjectId[],
  ): { $or: Array<Record<string, unknown>> } | null {
    const clauses: Array<Record<string, unknown>> = [];
    if (patientIds.length > 0) {
      clauses.push({ patientId: { $in: patientIds } });
    }
    if (visitIds.length > 0) {
      clauses.push({ assessmentVisitId: { $in: visitIds } });
    }
    return clauses.length > 0 ? { $or: clauses } : null;
  }

  private async countResiduals(
    identifiers: RootIdentifiers,
    userIds: Types.ObjectId[],
    patientIds: Types.ObjectId[],
    visitIds: Types.ObjectId[],
  ): Promise<ResidualCounts> {
    const ownershipFilter = this.buildOwnershipFilter(patientIds, visitIds);
    const counts = await Promise.all([
      this.models.users.countDocuments({
        accountName: { $in: identifiers.accountNames },
      }),
      this.models.patients.countDocuments({
        subjectCode: { $in: identifiers.subjectCodes },
      }),
      this.models.visits.countDocuments({
        visitCode: { $in: identifiers.visitCodes },
      }),
      userIds.length > 0
        ? this.models.sessions.countDocuments({ userId: { $in: userIds } })
        : Promise.resolve(0),
      ownershipFilter
        ? this.models.reports.countDocuments(ownershipFilter)
        : Promise.resolve(0),
      ownershipFilter
        ? this.models.cognitiveDomainResults.countDocuments(ownershipFilter)
        : Promise.resolve(0),
      ownershipFilter
        ? this.models.scoreResults.countDocuments(ownershipFilter)
        : Promise.resolve(0),
      ownershipFilter
        ? this.models.mediaEvidence.countDocuments(ownershipFilter)
        : Promise.resolve(0),
      ownershipFilter
        ? this.models.itemResponses.countDocuments(ownershipFilter)
        : Promise.resolve(0),
      ownershipFilter
        ? this.models.scaleInstances.countDocuments(ownershipFilter)
        : Promise.resolve(0),
    ]);
    return {
      users: counts[0],
      patients: counts[1],
      visits: counts[2],
      sessions: counts[3],
      reports: counts[4],
      cognitiveDomainResults: counts[5],
      scoreResults: counts[6],
      mediaEvidence: counts[7],
      itemResponses: counts[8],
      scaleInstances: counts[9],
    };
  }

  private async createUsers(
    namespace: string,
    password: string,
  ): Promise<Map<B16Role, UserDocument>> {
    const users = new Map<B16Role, UserDocument>();
    for (const role of B16_ROLES) {
      const passwordHash = await this.authService.hashPassword(password);
      const user = await this.models.users.create({
        accountName: accountNameFor(namespace, role),
        displayName: displayNameFor(role),
        staffCode: `B16FX-${namespace}-${role}`,
        passwordHash,
        passwordChangedAt: new Date(),
        roles: [role],
        permissions: [],
        userType: role,
        status: 'active',
        failedLoginCount: 0,
        lockedUntil: null,
        metadata: null,
      });
      users.set(role, user);
    }
    return users;
  }

  private async createScenario(
    namespace: string,
    definition: B16BusinessScenarioDefinition,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    let root = await this.createConfirmedV1(namespace, definition, actor);
    if (definition.target !== 'v1_ready_lock') {
      root = await this.lockFreezeArchive(root, actor, definition.scenarioKey);
    }
    if (definition.target.startsWith('v2_')) {
      root = await this.createConfirmedReplacement(
        root,
        actor,
        definition.scenarioKey,
      );
      if (
        definition.target === 'v2_ready_freeze' ||
        definition.target === 'v2_freeze_in_progress' ||
        definition.target === 'v2_ready_archive' ||
        definition.target === 'v2_archived'
      ) {
        root = await this.lockReport(root, actor, definition.scenarioKey);
      }
      if (
        definition.target === 'v2_ready_archive' ||
        definition.target === 'v2_archived'
      ) {
        root = await this.freezeSources(root, actor, definition.scenarioKey);
      }
      if (definition.target === 'v2_archived') {
        root = await this.archiveReport(root, actor, definition.scenarioKey);
      }
      if (definition.target === 'v2_freeze_in_progress') {
        root = await this.startRecoverableFreeze(
          root,
          actor,
          definition.scenarioKey,
        );
      }
    }
    if (definition.patientStatus === 'inactive') {
      await this.models.patients
        .updateOne(
          { _id: new Types.ObjectId(root.patientId) },
          { $set: { status: 'inactive' } },
        )
        .exec();
    }
    if (definition.visitStatus === 'locked') {
      await this.models.visits
        .updateOne(
          { _id: new Types.ObjectId(root.visitId) },
          { $set: { status: 'locked', lockedAt: new Date(), voidedAt: null } },
        )
        .exec();
    }
    if (definition.visitStatus === 'voided') {
      await this.models.visits
        .updateOne(
          { _id: new Types.ObjectId(root.visitId) },
          { $set: { status: 'voided', lockedAt: null, voidedAt: new Date() } },
        )
        .exec();
    }
    if (definition.lineageInvalid) {
      await this.breakInternalLineage(root, definition.scenarioKey);
    }
  }

  private async createConfirmedV1(
    namespace: string,
    definition: B16BusinessScenarioDefinition,
    actor: AuthenticatedUserContext,
  ): Promise<ScenarioRoot> {
    const suffix = `${namespace.toUpperCase()}-${definition.ordinal
      .toString()
      .padStart(2, '0')}`;
    const subjectCode = subjectCodeFor(namespace, definition.ordinal);
    const patient = await this.models.patients.create({
      subjectCode,
      displayName: `B16 脱敏受试者 ${definition.ordinal}`,
      sourceType: 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'active',
      tags: [],
      externalRefs: null,
      metadata: null,
    });
    const assessmentDate = new Date('2026-07-18T01:00:00.000Z');
    const completedAt = new Date('2026-07-18T02:00:00.000Z');
    const confirmedAt = new Date('2026-07-18T02:30:00.000Z');
    const visit = await this.models.visits.create({
      patientId: patient._id,
      subjectCode,
      visitCode: visitCodeFor(namespace, definition.ordinal),
      visitType: 'baseline',
      status: 'completed',
      assessmentDate,
      startedAt: assessmentDate,
      completedAt,
      lockedAt: null,
      voidedAt: null,
      operatorSnapshot: {
        operatorId: new Types.ObjectId(actor.id),
        operatorName: actor.displayName,
        operatorRole: 'doctor',
      },
      clinicalContext: null,
      metadata: null,
    });
    const scaleDefinitionId = new Types.ObjectId();
    const scaleVersionId = new Types.ObjectId();
    const instance = await this.models.scaleInstances.create({
      assessmentVisitId: visit._id,
      patientId: patient._id,
      subjectCode,
      scaleDefinitionId,
      scaleVersionId,
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode: `B16-${suffix}-INST`,
      instanceNo: 1,
      status: 'completed',
      administrationMode: 'clinician_administered',
      versionTrace: {
        crfVersion: 'b16-crf-1.0',
        scoringRuleVersion: 'b16-score-1.0',
        fieldEncodingVersion: 'b16-field-1.0',
        sourceDocument: 'b16-deidentified-source',
      },
      completedAt,
      lockedAt: null,
      voidedAt: null,
      metadata: { submission: { submissionId: `b16-${suffix}` } },
    });
    const item = await this.models.itemResponses.create({
      assessmentVisitId: visit._id,
      scaleInstanceId: instance._id,
      patientId: patient._id,
      subjectCode,
      scaleDefinitionId,
      scaleVersionId,
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode: instance.instanceCode,
      itemCode: 'moca.b16.fixture.item',
      itemOrder: 1,
      responseType: 'text',
      countsTowardTotal: true,
      cognitiveDomainCodes: ['memory'],
      itemConfigSnapshot: null,
      versionTrace: { scaleVersion: '1.0' },
      status: 'answered',
      answerSource: 'clinician_recorded',
      rawResponse: 'de-identified fixture response',
      structuredResponse: null,
      isMissing: false,
      score: {
        scoreValue: 1,
        maxScore: 1,
        minScore: 0,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        scoredAt: confirmedAt,
        scoredBy: new Types.ObjectId(actor.id),
      },
      stepResults: [],
      promptResponses: [],
      evidenceRefs: [],
      lockedAt: null,
      voidedAt: null,
    });
    const storageObjectKey = `cogmemory_ad/b16/${namespace}/${definition.ordinal}/evidence.png`;
    const evidence = await this.models.mediaEvidence.create({
      patientId: patient._id,
      assessmentVisitId: visit._id,
      scaleInstanceId: instance._id,
      itemResponseId: item._id,
      subjectCode,
      scaleDefinitionId,
      scaleVersionId,
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode: instance.instanceCode,
      itemCode: item.itemCode,
      evidenceCode: `B16-${suffix}-EVD`,
      evidenceType: 'photo',
      captureMode: 'photo_upload',
      status: 'attached',
      storageStatus: 'stored',
      countsTowardTotal: true,
      cognitiveDomainCodes: ['memory'],
      itemSnapshot: { itemCode: item.itemCode },
      versionTrace: { scaleVersion: '1.0' },
      storage: {
        storageDriver: 'fake',
        bucket: 'b16-test-bucket',
        objectKey: storageObjectKey,
        objectPrefix: `cogmemory_ad/b16/${namespace}/${definition.ordinal}`,
        mimeType: 'image/png',
        fileExtension: 'png',
        sizeBytes: 128,
        checksum: `b16-checksum-${suffix}`,
        checksumAlgorithm: 'sha256',
        storedAt: assessmentDate,
      },
      qualityStatus: 'acceptable',
      lockedAt: null,
      voidedAt: null,
      deletedAt: null,
    });
    const score = await this.models.scoreResults.create({
      patientId: patient._id,
      assessmentVisitId: visit._id,
      scaleInstanceId: instance._id,
      subjectCode,
      scaleDefinitionId,
      scaleVersionId,
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode: instance.instanceCode,
      scoreResultCode: `B16-${suffix}-SCR`,
      runNo: 1,
      status: 'confirmed',
      scoringSource: 'manual',
      scoringMode: 'manual_summary',
      versionTrace: { scaleVersion: '1.0' },
      totalScore: {
        scoreValue: 1,
        maxScore: 1,
        minScore: 0,
        scorePercent: 100,
        scoredItemCount: 1,
        totalItemCount: 1,
        unscoredItemCount: 0,
        missingItemCount: 0,
        needsReviewItemCount: 0,
      },
      itemScores: [
        {
          itemResponseId: item._id,
          itemCode: item.itemCode,
          itemOrder: 1,
          responseType: 'text',
          countsTowardTotal: true,
          includedInTotal: true,
          scoreValue: 1,
          maxScore: 1,
          minScore: 0,
          scoreStatus: 'manual_scored',
          scoreSource: 'operator',
          isMissing: false,
          cognitiveDomainCodes: ['memory'],
        },
      ],
      groupScores: [],
      computation: {
        computedAt: confirmedAt,
        computedBy: new Types.ObjectId(actor.id),
        inputItemCount: 1,
        includedItemCount: 1,
        excludedItemCount: 0,
        warningCount: 0,
      },
      review: {
        reviewStatus: 'reviewed',
        reviewedAt: confirmedAt,
        reviewerId: new Types.ObjectId(actor.id),
        reviewerName: actor.displayName,
      },
      qualityStatus: 'passed',
      confirmedAt,
      lockedAt: null,
      voidedAt: null,
    });
    const domain = await this.models.cognitiveDomainResults.create({
      patientId: patient._id,
      assessmentVisitId: visit._id,
      scaleInstanceId: instance._id,
      scoreResultId: score._id,
      subjectCode,
      scaleDefinitionId,
      scaleVersionId,
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode: instance.instanceCode,
      domainResultCode: `B16-${suffix}-CDR`,
      runNo: 1,
      status: 'computed',
      mappingSource: 'scale_config',
      mappingMode: 'item_domain_codes',
      versionTrace: { scaleVersion: '1.0' },
      domainScores: [
        {
          domainCode: 'memory',
          scoreValue: 1,
          maxScore: 1,
          minScore: 0,
          scorePercent: 100,
          itemCount: 1,
          scoredItemCount: 1,
          unscoredItemCount: 0,
          missingItemCount: 0,
          needsReviewItemCount: 0,
          excludedItemCount: 0,
        },
      ],
      itemContributions: [
        {
          itemResponseId: item._id,
          scoreResultId: score._id,
          itemCode: item.itemCode,
          itemOrder: 1,
          domainCode: 'memory',
          weight: 1,
          countsTowardDomain: true,
          scoreValue: 1,
          maxScore: 1,
          weightedScore: 1,
          weightedMaxScore: 1,
          scoreStatus: 'manual_scored',
          scoreSource: 'operator',
          isMissing: false,
        },
      ],
      mappingSnapshot: {
        mappingVersion: 'a19-item-domain-codes-1.0',
        mappingSource: 'scale_config',
        domainCodes: ['memory'],
        mappingRules: null,
      },
      computation: {
        computedAt: confirmedAt,
        computedBy: new Types.ObjectId(actor.id),
        inputItemCount: 1,
        contributionCount: 1,
        domainCount: 1,
        includedContributionCount: 1,
        excludedContributionCount: 0,
        warningCount: 0,
      },
      review: { reviewStatus: 'not_required' },
      qualityStatus: 'unchecked',
      lockedAt: null,
      voidedAt: null,
    });
    const report = await this.models.reports.create({
      patientId: patient._id,
      assessmentVisitId: visit._id,
      primaryScaleInstanceIds: [instance._id],
      scoreResultIds: [score._id],
      cognitiveDomainResultIds: [domain._id],
      mediaEvidenceIds: [evidence._id],
      subjectCode,
      reportCode: baseReportCodeFor(namespace, definition.ordinal),
      reportType: 'cognitive_assessment',
      status: 'confirmed',
      reportVersion: 1,
      source: 'mixed',
      patientSnapshot: {
        subjectCode,
        displayName: patient.displayName,
        sex: 'unknown',
        birthDate: null,
        educationYears: null,
      },
      visitSnapshot: {
        visitCode: visit.visitCode,
        visitType: 'baseline',
        assessmentDate,
        operatorName: actor.displayName,
        operatorRole: 'doctor',
        clinicalContext: null,
      },
      scaleTraces: [
        {
          scaleInstanceId: instance._id,
          scaleCode: 'moca',
          scaleVersion: '1.0',
          crfVersion: 'b16-crf-1.0',
          scoringRuleVersion: 'b16-score-1.0',
          fieldEncodingVersion: 'b16-field-1.0',
          domainMappingVersion: 'a19-item-domain-codes-1.0',
          sourceDocument: 'b16-deidentified-source',
        },
      ],
      scoreSnapshots: [
        {
          scoreResultId: score._id,
          scaleCode: 'moca',
          scaleVersion: '1.0',
          totalScoreValue: 1,
          totalMaxScore: 1,
          totalMinScore: 0,
          scorePercent: 100,
          scoreStatus: 'confirmed',
          qualityStatus: 'passed',
          scoreDetails: null,
        },
      ],
      domainSnapshots: [
        {
          cognitiveDomainResultId: domain._id,
          scaleCode: 'moca',
          domainCode: 'memory',
          scoreValue: 1,
          maxScore: 1,
          scorePercent: 100,
          weightedScore: 1,
          weightedMaxScore: 1,
          itemCount: 1,
          needsReviewItemCount: 0,
        },
      ],
      evidenceSnapshots: [
        {
          mediaEvidenceId: evidence._id,
          itemResponseId: item._id,
          scaleCode: 'moca',
          itemCode: item.itemCode,
          evidenceType: 'photo',
          captureMode: 'photo_upload',
          qualityStatus: 'passed',
          storageObjectKey,
        },
      ],
      narrative: {
        chiefSummary: 'B16 de-identified chief summary',
        scoreSummary: 'B16 de-identified score summary',
        domainSummary: 'B16 de-identified domain summary',
        evidenceSummary: 'B16 de-identified evidence summary',
        trendSummary: 'B16 de-identified trend summary',
        recommendationText: 'B16 de-identified recommendation',
        doctorOpinion: 'B16 de-identified doctor opinion',
        limitations: 'B16 de-identified limitations',
      },
      aiDraft: { status: 'not_requested', doctorEdited: false },
      confirmation: {
        confirmedAt,
        confirmedBy: new Types.ObjectId(actor.id),
        confirmedByName: actor.displayName,
        confirmedByRole: 'doctor',
        confirmationNote: 'B16 de-identified confirmation note',
      },
      lockedAt: null,
      lockedBy: null,
      archivedAt: null,
      archivedBy: null,
      correctionRecords: [],
      voidedAt: null,
      voidedBy: null,
      auditLogRefs: [],
      qualityStatus: 'passed',
      qualityHints: null,
      metadata: {
        a20Generation: {
          version: 1,
          generationId: randomUUID(),
          generatedAt: completedAt,
          generatedBy: actor.id,
          generatedByName: actor.displayName,
          generatedByRole: 'doctor',
          engineVersion: 'a20-clinical-report-draft-1.0',
          reportScope: 'explicit_primary_scale_instances',
          primaryScaleInstanceIds: [instance._id.toString()],
          scoreResultIds: [score._id.toString()],
          cognitiveDomainResultIds: [domain._id.toString()],
          mediaEvidenceCount: 1,
          aiUsed: false,
        },
        a21Submission: {
          version: 1,
          submissionId: randomUUID(),
          submittedAt: new Date('2026-07-18T02:15:00.000Z'),
          submittedBy: actor.id,
          submittedByName: actor.displayName,
          submittedByRole: 'doctor',
          submissionNote: 'B16 de-identified submission note',
        },
        a21Confirmation: {
          version: 1,
          confirmationId: randomUUID(),
          confirmedAt,
          confirmedBy: actor.id,
          confirmedByName: actor.displayName,
          confirmedByRole: 'doctor',
          confirmationNote: 'B16 de-identified confirmation note',
        },
      },
    });
    const summary = await this.reportsService.findReportByOwnership({
      reportId: report._id.toString(),
      patientId: patient._id.toString(),
      assessmentVisitId: visit._id.toString(),
    });
    if (!summary) {
      throw scenarioFailure(
        definition.scenarioKey,
        'Created V1 could not be reloaded',
      );
    }
    return {
      patientId: patient._id.toString(),
      visitId: visit._id.toString(),
      currentReport: summary,
    };
  }

  private async lockFreezeArchive(
    root: ScenarioRoot,
    actor: AuthenticatedUserContext,
    scenarioKey: B16BusinessScenarioKey,
  ): Promise<ScenarioRoot> {
    const locked = await this.lockReport(root, actor, scenarioKey);
    const frozen = await this.freezeSources(locked, actor, scenarioKey);
    return this.archiveReport(frozen, actor, scenarioKey);
  }

  private async lockReport(
    root: ScenarioRoot,
    actor: AuthenticatedUserContext,
    scenarioKey: B16BusinessScenarioKey,
  ): Promise<ScenarioRoot> {
    await this.workflows.lock.lockClinicalReport(
      root.patientId,
      root.visitId,
      root.currentReport.id,
      actor,
      {
        confirm: true,
        lockNote: `B16 ${scenarioKey} controlled lock`,
        expectedUpdatedAt: reportTimestamp(root.currentReport, scenarioKey),
      },
    );
    return this.reloadRoot(root, scenarioKey);
  }

  private async freezeSources(
    root: ScenarioRoot,
    actor: AuthenticatedUserContext,
    scenarioKey: B16BusinessScenarioKey,
  ): Promise<ScenarioRoot> {
    await this.workflows.freeze.freezeClinicalReportSources(
      root.patientId,
      root.visitId,
      root.currentReport.id,
      actor,
      {
        confirm: true,
        freezeNote: `B16 ${scenarioKey} controlled source freeze`,
        expectedUpdatedAt: reportTimestamp(root.currentReport, scenarioKey),
      },
    );
    return this.reloadRoot(root, scenarioKey);
  }

  private async archiveReport(
    root: ScenarioRoot,
    actor: AuthenticatedUserContext,
    scenarioKey: B16BusinessScenarioKey,
  ): Promise<ScenarioRoot> {
    await this.workflows.archive.archiveClinicalReport(
      root.patientId,
      root.visitId,
      root.currentReport.id,
      actor,
      {
        confirm: true,
        archiveNote: `B16 ${scenarioKey} controlled archive`,
        expectedUpdatedAt: reportTimestamp(root.currentReport, scenarioKey),
      },
    );
    return this.reloadRoot(root, scenarioKey);
  }

  private async createConfirmedReplacement(
    root: ScenarioRoot,
    actor: AuthenticatedUserContext,
    scenarioKey: B16BusinessScenarioKey,
  ): Promise<ScenarioRoot> {
    await this.workflows.correction.createClinicalReportCorrection(
      root.patientId,
      root.visitId,
      root.currentReport.id,
      actor,
      {
        confirm: true,
        correctionReason: `B16 ${scenarioKey} de-identified correction reason`,
        changeSummary: `B16 ${scenarioKey} de-identified change summary`,
        expectedUpdatedAt: reportTimestamp(root.currentReport, scenarioKey),
      },
    );
    let replacement = await this.reportsService.findLatestReportByVisitId(
      root.visitId,
    );
    if (
      !replacement ||
      replacement.reportVersion !== root.currentReport.reportVersion + 1
    ) {
      throw scenarioFailure(
        scenarioKey,
        'Replacement version was not created continuously',
      );
    }
    await this.workflows.review.updateDraft(
      root.patientId,
      root.visitId,
      replacement.id,
      actor,
      {
        doctorOpinion: `B16 ${scenarioKey} reviewed doctor opinion`,
        recommendationText: `B16 ${scenarioKey} reviewed recommendation`,
        editNote: `B16 ${scenarioKey} controlled A21 edit`,
        expectedUpdatedAt: reportTimestamp(replacement, scenarioKey),
      },
    );
    replacement = await this.requireReport(root, replacement.id, scenarioKey);
    await this.workflows.review.submitForConfirmation(
      root.patientId,
      root.visitId,
      replacement.id,
      actor,
      {
        confirm: true,
        submissionNote: `B16 ${scenarioKey} controlled A21 submission`,
        expectedUpdatedAt: reportTimestamp(replacement, scenarioKey),
      },
    );
    replacement = await this.requireReport(root, replacement.id, scenarioKey);
    await this.workflows.review.confirmReport(
      root.patientId,
      root.visitId,
      replacement.id,
      actor,
      {
        confirm: true,
        confirmationNote: `B16 ${scenarioKey} controlled A21 confirmation`,
        expectedUpdatedAt: reportTimestamp(replacement, scenarioKey),
      },
    );
    replacement = await this.requireReport(root, replacement.id, scenarioKey);
    return { ...root, currentReport: replacement };
  }

  private async startRecoverableFreeze(
    root: ScenarioRoot,
    actor: AuthenticatedUserContext,
    scenarioKey: B16BusinessScenarioKey,
  ): Promise<ScenarioRoot> {
    const itemResponses = await this.models.itemResponses
      .find({
        patientId: new Types.ObjectId(root.patientId),
        assessmentVisitId: new Types.ObjectId(root.visitId),
        scaleInstanceId: {
          $in: root.currentReport.primaryScaleInstanceIds.map(
            (id) => new Types.ObjectId(id),
          ),
        },
      })
      .exec();
    const scope = buildClinicalReportSourceFreezeScope(
      root.currentReport,
      itemResponses.map((item) => item._id.toString()),
    );
    const expectedCounts = buildClinicalReportSourceFreezeCounts(scope);
    if (expectedCounts.totalSourceCount !== SOURCE_COUNTS.totalSourceCount) {
      throw scenarioFailure(
        scenarioKey,
        'Recoverable freeze scope is incomplete',
      );
    }
    evaluateClinicalReportSourceFreezeReadiness({
      report: root.currentReport,
      expectedUpdatedAt: requiredDate(
        root.currentReport.updatedAt,
        scenarioKey,
      ),
    });
    const now = new Date();
    const start = buildSourceFreezeStartMetadata({
      report: root.currentReport,
      freezeId: randomUUID(),
      startedAt: now,
      sourceLockedAt: now,
      actor: {
        operatorId: actor.id,
        operatorName: actor.displayName,
        operatorRole: 'doctor',
      },
      freezeNote: `B16 ${scenarioKey} recoverable source freeze`,
      scope,
      previouslyFrozenCounts: { ...SOURCE_COUNTS },
    });
    const started = await this.reportsService.startSourceFreezeIfUnmodified({
      reportId: root.currentReport.id,
      patientId: root.patientId,
      assessmentVisitId: root.visitId,
      reportVersion: root.currentReport.reportVersion,
      expectedUpdatedAt: requiredDate(
        root.currentReport.updatedAt,
        scenarioKey,
      ),
      metadata: start.metadata,
    });
    if (!started) {
      throw scenarioFailure(
        scenarioKey,
        'Recoverable freeze receipt was not persisted',
      );
    }
    return { ...root, currentReport: started };
  }

  private async breakInternalLineage(
    root: ScenarioRoot,
    scenarioKey: B16BusinessScenarioKey,
  ): Promise<void> {
    const lineage = resolveClinicalReportReplacementLineage(root.currentReport);
    if (!lineage) {
      throw scenarioFailure(
        scenarioKey,
        'Replacement public lineage was unavailable',
      );
    }
    const result = await this.models.reports
      .updateOne(
        {
          _id: new Types.ObjectId(lineage.previousReportId),
          patientId: new Types.ObjectId(root.patientId),
          assessmentVisitId: new Types.ObjectId(root.visitId),
          status: 'corrected',
        },
        {
          $set: {
            'metadata.a25Correction.replacementReportId':
              new Types.ObjectId().toString(),
          },
        },
      )
      .exec();
    if (result.modifiedCount !== 1) {
      throw scenarioFailure(
        scenarioKey,
        'Internal lineage fault was not isolated',
      );
    }
  }

  private async reloadRoot(
    root: ScenarioRoot,
    scenarioKey: B16BusinessScenarioKey,
  ): Promise<ScenarioRoot> {
    const currentReport = await this.requireReport(
      root,
      root.currentReport.id,
      scenarioKey,
    );
    return { ...root, currentReport };
  }

  private async requireReport(
    root: Pick<ScenarioRoot, 'patientId' | 'visitId'>,
    reportId: string,
    scenarioKey: B16BusinessScenarioKey,
  ): Promise<ClinicalReportSummary> {
    const report = await this.reportsService.findReportByOwnership({
      reportId,
      patientId: root.patientId,
      assessmentVisitId: root.visitId,
    });
    if (!report) {
      throw scenarioFailure(
        scenarioKey,
        'Scenario report could not be reloaded',
      );
    }
    return report;
  }

  private async verifyInternal(
    namespace: string,
    password: string,
    action: 'created' | 'verified',
  ): Promise<B16SafeManifest> {
    const roles = await this.verifyUsers(namespace, password);
    const scenarios: B16SafeScenarioManifest[] = [
      {
        scenarioKey: 'roles',
        purpose:
          'Four isolated role accounts for the browser permission matrix',
        route: '/login',
        reportCode: null,
        reportVersion: null,
        currentStatus: 'accounts:active;credentials:verified',
        suggestedRole: 'doctor',
        expectedStartingStage: 'login',
      },
    ];
    for (const definition of B16_BUSINESS_SCENARIOS) {
      scenarios.push(await this.verifyScenario(namespace, definition));
    }
    const manifest: B16SafeManifest = {
      namespace,
      databaseName: this.databaseName,
      roles,
      scenarios,
      summary: {
        action,
        roleCount: roles.length,
        scenarioCount: scenarios.length,
        businessScenarioCount: B16_BUSINESS_SCENARIOS.length,
      },
    };
    assertB16SafeManifest(manifest);
    return manifest;
  }

  private async verifyUsers(
    namespace: string,
    password: string,
  ): Promise<B16SafeRoleManifest[]> {
    const accountNames = B16_ROLES.map((role) =>
      accountNameFor(namespace, role),
    );
    const users = await this.models.users
      .find({ accountName: { $in: accountNames } })
      .select('+passwordHash')
      .exec();
    if (users.length !== B16_ROLES.length) {
      throw new B16FixtureError(
        'B16_FIXTURE_ACCOUNTS_INCOMPLETE',
        'Fixture role accounts are missing or duplicated',
        'roles',
      );
    }
    const result: B16SafeRoleManifest[] = [];
    for (const role of B16_ROLES) {
      const accountName = accountNameFor(namespace, role);
      const matches = users.filter((user) => user.accountName === accountName);
      const user = matches[0];
      if (
        matches.length !== 1 ||
        !user ||
        user.status !== 'active' ||
        user.userType !== role ||
        user.roles.length !== 1 ||
        user.roles[0] !== role ||
        user.displayName !== displayNameFor(role) ||
        !user.passwordHash ||
        !(await this.authService.verifyPassword(password, user.passwordHash))
      ) {
        throw new B16FixtureError(
          'B16_FIXTURE_ACCOUNT_INVALID',
          `Fixture account validation failed for role ${role}`,
          'roles',
        );
      }
      result.push({
        role,
        loginIdentifier: accountName,
        displayName: user.displayName,
      });
    }
    return result;
  }

  private async verifyScenario(
    namespace: string,
    definition: B16BusinessScenarioDefinition,
  ): Promise<B16SafeScenarioManifest> {
    try {
      const patients = await this.models.patients
        .find({ subjectCode: subjectCodeFor(namespace, definition.ordinal) })
        .exec();
      if (patients.length !== 1) {
        throw scenarioFailure(
          definition.scenarioKey,
          'Scenario patient root is missing or duplicated',
        );
      }
      const patient = patients[0];
      const visits = await this.models.visits
        .find({
          patientId: patient._id,
          visitCode: visitCodeFor(namespace, definition.ordinal),
        })
        .exec();
      if (visits.length !== 1) {
        throw scenarioFailure(
          definition.scenarioKey,
          'Scenario visit root is missing or duplicated',
        );
      }
      const visit = visits[0];
      const reportDocuments = await this.models.reports
        .find({ patientId: patient._id, assessmentVisitId: visit._id })
        .sort({ reportVersion: 1 })
        .exec();
      const version = expectedReportVersion(definition);
      if (reportDocuments.length !== version) {
        throw scenarioFailure(
          definition.scenarioKey,
          'Scenario report chain length is invalid',
        );
      }
      const reports: ClinicalReportSummary[] = [];
      for (const reportDocument of reportDocuments) {
        const report = await this.reportsService.findReportByOwnership({
          reportId: reportDocument._id.toString(),
          patientId: patient._id.toString(),
          assessmentVisitId: visit._id.toString(),
        });
        if (!report) {
          throw scenarioFailure(
            definition.scenarioKey,
            'Scenario report ownership is inconsistent',
          );
        }
        reports.push(report);
      }
      reports.sort((left, right) => left.reportVersion - right.reportVersion);
      reports.forEach((report, index) => {
        if (report.reportVersion !== index + 1) {
          throw scenarioFailure(
            definition.scenarioKey,
            'Report versions are not continuous safe integers',
          );
        }
      });
      const current = reports[reports.length - 1];
      if (
        current.patientId !== patient._id.toString() ||
        current.assessmentVisitId !== visit._id.toString() ||
        current.source !== 'mixed' ||
        current.qualityStatus !== 'passed' ||
        !readClinicalReportSubmission(current.metadata) ||
        !readClinicalReportConfirmation(current.metadata)
      ) {
        throw scenarioFailure(
          definition.scenarioKey,
          'Current report does not retain its A20/A21 eligibility facts',
        );
      }
      if (current.reportVersion === 1) {
        if (resolveClinicalReportReplacementLineage(current) !== null) {
          throw scenarioFailure(
            definition.scenarioKey,
            'V1 unexpectedly contains replacement lineage',
          );
        }
      } else {
        const source = reports[reports.length - 2];
        if (
          source.status !== 'corrected' ||
          source.correctionRecords.length !== 1 ||
          !resolveExistingClinicalReportCorrection(source)?.completed
        ) {
          throw scenarioFailure(
            definition.scenarioKey,
            'A25 source-side completed correction facts are incomplete',
          );
        }
        await this.verifySharedFrozenSources(
          current,
          source,
          definition.scenarioKey,
        );
      }

      const lineageValid =
        await this.reportsService.hasValidReplacementLifecycleLineage(current);
      if (definition.lineageInvalid) {
        if (lineageValid || !this.publicReplacementSummaryIsSafe(current)) {
          throw scenarioFailure(
            definition.scenarioKey,
            'Lineage-invalid scenario does not preserve the required public/internal split',
          );
        }
      } else if (!lineageValid) {
        throw scenarioFailure(
          definition.scenarioKey,
          'A26 replacement lineage validation failed',
        );
      }

      this.verifyTargetState(current, definition);
      if (
        definition.patientStatus &&
        patient.status !== definition.patientStatus
      ) {
        throw scenarioFailure(
          definition.scenarioKey,
          'Historical patient status is incorrect',
        );
      }
      if (!definition.patientStatus && patient.status !== 'active') {
        throw scenarioFailure(
          definition.scenarioKey,
          'Scenario patient must remain active',
        );
      }
      if (definition.visitStatus && visit.status !== definition.visitStatus) {
        throw scenarioFailure(
          definition.scenarioKey,
          'Historical visit status is incorrect',
        );
      }
      if (!definition.visitStatus && visit.status !== 'completed') {
        throw scenarioFailure(
          definition.scenarioKey,
          'Scenario visit must remain completed',
        );
      }

      const lineageStatus =
        current.reportVersion === 1
          ? 'not_applicable'
          : definition.lineageInvalid
            ? 'intentionally_invalid'
            : 'valid';
      const manifest: B16SafeScenarioManifest = {
        scenarioKey: definition.scenarioKey,
        purpose: definition.purpose,
        route: `/patients/${patient._id.toString()}/visits/${visit._id.toString()}`,
        reportCode: current.reportCode,
        reportVersion: current.reportVersion,
        currentStatus: safeStatus(
          current,
          patient.status,
          visit.status,
          lineageStatus,
        ),
        suggestedRole: definition.suggestedRole,
        expectedStartingStage: definition.expectedStartingStage,
        ...(shouldExposeAggregateCounts(definition)
          ? { expectedAggregateCounts: aggregateCounts(current) }
          : {}),
      };
      return manifest;
    } catch (error: unknown) {
      if (error instanceof B16FixtureError) {
        throw error;
      }
      throw scenarioFailure(
        definition.scenarioKey,
        'Scenario contains malformed lifecycle facts',
      );
    }
  }

  private verifyTargetState(
    report: ClinicalReportSummary,
    definition: B16BusinessScenarioDefinition,
  ): void {
    const lock = resolveExistingClinicalReportLock(report);
    const freeze = resolveExistingSourceFreeze(report);
    const archive = resolveExistingClinicalReportArchive(report);
    const fail = (message: string) => {
      throw scenarioFailure(definition.scenarioKey, message);
    };
    if (
      definition.target === 'v1_ready_lock' ||
      definition.target === 'v2_ready_lock'
    ) {
      if (
        report.status !== 'confirmed' ||
        report.lockedAt !== null ||
        lock !== null ||
        freeze !== null ||
        archive !== null
      ) {
        fail('Ready-lock report contains unexpected later lifecycle facts');
      }
      return;
    }
    if (definition.target === 'v2_ready_freeze') {
      if (
        report.status !== 'confirmed' ||
        !report.lockedAt ||
        !lock?.lockId ||
        freeze !== null ||
        archive !== null
      ) {
        fail('Ready-freeze report does not have exactly the A22 prerequisite');
      }
      return;
    }
    if (definition.target === 'v2_freeze_in_progress') {
      if (
        report.status !== 'confirmed' ||
        !report.lockedAt ||
        !lock?.lockId ||
        !freeze ||
        freeze.state !== 'in_progress' ||
        freeze.expectedCounts.totalSourceCount !==
          SOURCE_COUNTS.totalSourceCount ||
        freeze.previouslyFrozenCounts.totalSourceCount !==
          SOURCE_COUNTS.totalSourceCount ||
        !freeze.freezeNote ||
        archive !== null
      ) {
        fail('Recoverable A23 receipt is incomplete');
      }
      return;
    }
    if (definition.target === 'v2_ready_archive') {
      if (
        report.status !== 'confirmed' ||
        !report.lockedAt ||
        !lock?.lockId ||
        !freeze ||
        freeze.state !== 'completed' ||
        freeze.completedCounts?.totalSourceCount !==
          SOURCE_COUNTS.totalSourceCount ||
        freeze.previouslyFrozenCounts.totalSourceCount !==
          SOURCE_COUNTS.totalSourceCount ||
        freeze.newlyFrozenCounts?.totalSourceCount !== 0 ||
        archive !== null
      ) {
        fail('Ready-archive report does not have complete A22/A23 facts');
      }
      return;
    }
    if (
      definition.target === 'v1_archived' ||
      definition.target === 'v2_archived'
    ) {
      const expectedPreviouslyFrozen =
        report.reportVersion === 1 ? 0 : SOURCE_COUNTS.totalSourceCount;
      const expectedNewlyFrozen =
        report.reportVersion === 1 ? SOURCE_COUNTS.totalSourceCount : 0;
      if (
        report.status !== 'archived' ||
        !report.lockedAt ||
        !lock?.lockId ||
        !freeze ||
        freeze.state !== 'completed' ||
        freeze.completedCounts?.totalSourceCount !==
          SOURCE_COUNTS.totalSourceCount ||
        freeze.previouslyFrozenCounts.totalSourceCount !==
          expectedPreviouslyFrozen ||
        freeze.newlyFrozenCounts?.totalSourceCount !== expectedNewlyFrozen ||
        !archive?.archiveId ||
        archive.sourceFreezeId !== freeze.freezeId
      ) {
        fail('Archived report does not have complete A22/A23/A24 facts');
      }
    }
  }

  private publicReplacementSummaryIsSafe(
    report: ClinicalReportSummary,
  ): boolean {
    const publicReport = this.publicMapper.toPublicReport(report);
    const lineage = publicReport.replacementOf;
    return Boolean(
      lineage &&
      Types.ObjectId.isValid(lineage.previousReportId) &&
      lineage.previousReportCode.trim() &&
      lineage.replacementReportCode.trim() &&
      Number.isSafeInteger(lineage.previousReportVersion) &&
      Number.isSafeInteger(lineage.replacementReportVersion) &&
      lineage.replacementReportVersion === lineage.previousReportVersion + 1 &&
      lineage.correctionNo === lineage.replacementReportVersion - 1 &&
      report.reportCode === lineage.replacementReportCode &&
      report.reportVersion === lineage.replacementReportVersion,
    );
  }

  private async verifySharedFrozenSources(
    current: ClinicalReportSummary,
    previous: ClinicalReportSummary,
    scenarioKey: B16BusinessScenarioKey,
  ): Promise<void> {
    const previousFreeze = resolveExistingSourceFreeze(previous);
    if (!previousFreeze || previousFreeze.state !== 'completed') {
      throw scenarioFailure(
        scenarioKey,
        'Previous report source freeze is incomplete',
      );
    }
    if (
      current.primaryScaleInstanceIds.join(',') !==
        previous.primaryScaleInstanceIds.join(',') ||
      current.scoreResultIds.join(',') !== previous.scoreResultIds.join(',') ||
      current.cognitiveDomainResultIds.join(',') !==
        previous.cognitiveDomainResultIds.join(',') ||
      current.mediaEvidenceIds.join(',') !== previous.mediaEvidenceIds.join(',')
    ) {
      throw scenarioFailure(
        scenarioKey,
        'Replacement does not share the exact source snapshot',
      );
    }
    const itemIds = previousFreeze.scope.itemResponseIds.map(
      (id) => new Types.ObjectId(id),
    );
    const [instances, items, scores, domains, evidence] = await Promise.all([
      this.models.scaleInstances
        .find({ _id: { $in: current.primaryScaleInstanceIds } })
        .exec(),
      this.models.itemResponses.find({ _id: { $in: itemIds } }).exec(),
      this.models.scoreResults
        .find({ _id: { $in: current.scoreResultIds } })
        .exec(),
      this.models.cognitiveDomainResults
        .find({ _id: { $in: current.cognitiveDomainResultIds } })
        .exec(),
      this.models.mediaEvidence
        .find({ _id: { $in: current.mediaEvidenceIds } })
        .exec(),
    ]);
    const lockedDates = [
      ...instances.map((entry) => entry.lockedAt),
      ...items.map((entry) => entry.lockedAt),
      ...scores.map((entry) => entry.lockedAt),
      ...domains.map((entry) => entry.lockedAt),
      ...evidence.map((entry) => entry.lockedAt),
    ];
    if (
      lockedDates.length !== SOURCE_COUNTS.totalSourceCount ||
      lockedDates.some(
        (date) =>
          !date || date.getTime() > previousFreeze.sourceLockedAt.getTime(),
      )
    ) {
      throw scenarioFailure(
        scenarioKey,
        'Shared source irreversible lock facts were rewritten or lost',
      );
    }
  }
}

export function createB16BrowserFixtureManager(
  app: INestApplicationContext,
): B16BrowserFixtureManager {
  const config = app.get(ConfigService);
  const connection = app.get<Connection>(getConnectionToken());
  const databaseName = connection.name;
  assertB16RuntimeEnvironment({
    nodeEnv: process.env.NODE_ENV,
    appEnv: config.get<string>('app.env'),
    databaseName,
    storageDriver: config.get<string>('storage.driver'),
    llmProvider: config.get<string>('llm.provider'),
    smsProvider: config.get<string>('smsAuth.provider'),
    sessionCookieSecure: config.get<boolean>('session.cookieSecure'),
  });
  const models: B16Models = {
    users: app.get<Model<UserDocument>>(getModelToken(User.name)),
    sessions: app.get<Model<SessionDocument>>(getModelToken(Session.name)),
    patients: app.get<Model<PatientDocument>>(getModelToken(Patient.name)),
    visits: app.get<Model<AssessmentVisitDocument>>(
      getModelToken(AssessmentVisit.name),
    ),
    scaleInstances: app.get<Model<ScaleInstanceDocument>>(
      getModelToken(ScaleInstance.name),
    ),
    itemResponses: app.get<Model<ItemResponseDocument>>(
      getModelToken(ItemResponse.name),
    ),
    mediaEvidence: app.get<Model<MediaEvidenceDocument>>(
      getModelToken(MediaEvidence.name),
    ),
    scoreResults: app.get<Model<ScoreResultDocument>>(
      getModelToken(ScoreResult.name),
    ),
    cognitiveDomainResults: app.get<Model<CognitiveDomainResultDocument>>(
      getModelToken(CognitiveDomainResult.name),
    ),
    reports: app.get<Model<ClinicalReportDocument>>(
      getModelToken(ClinicalReport.name),
    ),
  };
  return new B16BrowserFixtureManager(
    databaseName,
    models,
    app.get(AuthService),
    app.get(ReportsService),
    app.get(ClinicalReportPublicMapper),
    {
      review: app.get(ClinicalReportReviewWorkflowService),
      lock: app.get(ClinicalReportLockWorkflowService),
      freeze: app.get(ClinicalReportSourceFreezeWorkflowService),
      archive: app.get(ClinicalReportArchiveWorkflowService),
      correction: app.get(ClinicalReportCorrectionWorkflowService),
    },
  );
}
