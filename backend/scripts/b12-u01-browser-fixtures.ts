import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import type { INestApplicationContext, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import {
  DatabaseGateError,
  assertBrowserAcceptancePreImportEnvironment,
  assertBrowserFixtureDatabaseAccess,
} from '../src/config/database-purpose';
import type { AuthenticatedUserContext } from '../src/modules/auth/types/auth-user-context.type';
import {
  Session,
  type SessionDocument,
} from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
import {
  AssessmentVisit,
  type AssessmentVisitDocument,
} from '../src/modules/assessments/schemas/assessment-visit.schema';
import {
  ItemResponse,
  type ItemResponseDocument,
} from '../src/modules/assessments/schemas/item-response.schema';
import {
  ScaleInstance,
  type ScaleInstanceDocument,
} from '../src/modules/assessments/schemas/scale-instance.schema';
import {
  CognitiveDomainResult,
  type CognitiveDomainResultDocument,
} from '../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
import {
  Patient,
  type PatientDocument,
} from '../src/modules/patients/schemas/patient.schema';
import {
  ClinicalReport,
  type ClinicalReportDocument,
} from '../src/modules/reports/schemas/clinical-report.schema';
import { resolveExistingClinicalReportArchive } from '../src/modules/reports/lib/clinical-report-archive';
import { resolveExistingClinicalReportLock } from '../src/modules/reports/lib/clinical-report-lock';
import { resolveExistingSourceFreeze } from '../src/modules/reports/lib/clinical-report-source-freeze';
import { ClinicalReportLockWorkflowService } from '../src/modules/reports/services/clinical-report-lock-workflow.service';
import { ClinicalReportPublicMapper } from '../src/modules/reports/services/clinical-report-public.mapper';
import { ReportsService } from '../src/modules/reports/services/reports.service';
import {
  ScoreResult,
  type ScoreResultDocument,
} from '../src/modules/scoring/schemas/score-result.schema';
import {
  User,
  type UserDocument,
} from '../src/modules/users/schemas/user.schema';

type Command = 'prepare' | 'verify' | 'cleanup';
type VerifyPhase = 'prepared' | 'post-browser' | 'u02-post-lock';
type ScenarioKey = 'unlocked-confirmed' | 'locked-confirmed';
type AppModuleExport = { AppModule: Type<unknown> };

type Models = {
  users: Model<UserDocument>;
  sessions: Model<SessionDocument>;
  patients: Model<PatientDocument>;
  visits: Model<AssessmentVisitDocument>;
  scaleInstances: Model<ScaleInstanceDocument>;
  itemResponses: Model<ItemResponseDocument>;
  scoreResults: Model<ScoreResultDocument>;
  cognitiveDomainResults: Model<CognitiveDomainResultDocument>;
  reports: Model<ClinicalReportDocument>;
};

type ScenarioRoot = {
  patientId: string;
  visitId: string;
  reportId: string;
};

type ScenarioBaseline = ScenarioRoot & {
  navigationPath: string;
  updatedAt: string;
  reportHash: string;
  lockProtectedReportHash: string;
  sourceHash: string;
};

type RuntimeDescriptor = {
  schemaVersion: 1;
  batch: 'B12';
  profile: 'B12-P1-user-entry-readonly';
  namespace: string;
  accounts: {
    doctor: { loginIdentifier: string };
    nurse: { loginIdentifier: string };
  };
  scenarios: Record<ScenarioKey, ScenarioBaseline>;
};

type Identifiers = {
  accountNames: [string, string];
  subjectCodes: [string, string];
  visitCodes: [string, string];
};

class FixtureError extends Error {
  constructor(
    readonly code: string,
    safeMessage: string,
  ) {
    super(safeMessage);
    this.name = 'FixtureError';
  }
}

const DATABASE_NAME = 'cogmemory_ad_browser_test';
const SCENARIO_KEYS: readonly ScenarioKey[] = [
  'unlocked-confirmed',
  'locked-confirmed',
];
const MARKER = 'B12-U01 synthetic readable report marker.';
const U02_LOCK_NOTE = 'B12 U02 脱敏首次锁定说明';

function requireNamespace(value: string | undefined): string {
  const namespace = value ?? 'b12u01';
  if (!/^[a-z0-9][a-z0-9-]{2,31}$/.test(namespace)) {
    throw new FixtureError(
      'B12_U01_NAMESPACE_INVALID',
      'B12_U01_NAMESPACE must be 3-32 lowercase letters, digits, or hyphens',
    );
  }
  return namespace;
}

function requirePassword(value: string | undefined): string {
  if (!value || value.length < 16) {
    throw new FixtureError(
      'B12_U01_PASSWORD_INVALID',
      'The fixture password must be injected through B12_U01_FIXTURE_PASSWORD and contain at least 16 characters',
    );
  }
  return value;
}

function requireRuntimePath(value: string | undefined): string {
  if (!value) {
    throw new FixtureError(
      'B12_U01_RUNTIME_PATH_REQUIRED',
      'B12_U01_RUNTIME_PATH is required',
    );
  }
  return value;
}

function parseCommand(argv: string[]): {
  command: Command;
  phase?: VerifyPhase;
} {
  const command = argv[0];
  if (command !== 'prepare' && command !== 'verify' && command !== 'cleanup') {
    throw new FixtureError(
      'B12_U01_COMMAND_INVALID',
      'Command must be prepare, verify, or cleanup',
    );
  }
  if (command === 'verify') {
    const phase = argv[1];
    if (
      phase !== 'prepared' &&
      phase !== 'post-browser' &&
      phase !== 'u02-post-lock'
    ) {
      throw new FixtureError(
        'B12_U01_VERIFY_PHASE_INVALID',
        'verify requires prepared, post-browser, or u02-post-lock',
      );
    }
    if (argv.length !== 2) {
      throw new FixtureError(
        'B12_U01_ARGUMENT_INVALID',
        'Unexpected fixture argument',
      );
    }
    return { command, phase };
  }
  if (argv.length !== 1) {
    throw new FixtureError(
      'B12_U01_ARGUMENT_INVALID',
      'Unexpected fixture argument; secrets are accepted only through the process environment',
    );
  }
  if (command === 'cleanup' && process.env.B12_U01_CONFIRM_CLEANUP !== '1') {
    throw new FixtureError(
      'B12_U01_CLEANUP_CONFIRMATION_REQUIRED',
      'cleanup requires B12_U01_CONFIRM_CLEANUP=1',
    );
  }
  return { command };
}

function identifiers(namespace: string): Identifiers {
  const upper = namespace.toUpperCase();
  return {
    accountNames: [`b12fx-${namespace}-doctor`, `b12fx-${namespace}-nurse`],
    subjectCodes: [`B12-${upper}-01`, `B12-${upper}-02`],
    visitCodes: [`B12-${upper}-01-VISIT`, `B12-${upper}-02-VISIT`],
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

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Types.ObjectId) return value.toString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== '__v')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function hash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function plain(document: { toObject(): unknown }): unknown {
  return document.toObject();
}

function lockProtectedReportHash(document: { toObject(): unknown }): string {
  const report = plain(document) as Record<string, unknown>;
  const metadata = report.metadata;
  const protectedMetadata =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? Object.fromEntries(
          Object.entries(metadata as Record<string, unknown>).filter(
            ([key]) => key !== 'a22Lock',
          ),
        )
      : metadata;
  return hash({
    ...Object.fromEntries(
      Object.entries(report).filter(
        ([key]) => !['lockedAt', 'lockedBy', 'updatedAt'].includes(key),
      ),
    ),
    metadata: protectedMetadata,
  });
}

async function readDescriptor(runtimePath: string): Promise<RuntimeDescriptor> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(runtimePath, 'utf8')) as unknown;
  } catch {
    throw new FixtureError(
      'B12_U01_RUNTIME_UNAVAILABLE',
      'The safe runtime descriptor is unavailable',
    );
  }
  const candidate = parsed as Partial<RuntimeDescriptor>;
  if (
    candidate.schemaVersion !== 1 ||
    candidate.batch !== 'B12' ||
    candidate.profile !== 'B12-P1-user-entry-readonly' ||
    !candidate.namespace ||
    !candidate.accounts ||
    !candidate.scenarios
  ) {
    throw new FixtureError(
      'B12_U01_RUNTIME_INVALID',
      'The safe runtime descriptor does not satisfy the B12-U01 contract',
    );
  }
  return candidate as RuntimeDescriptor;
}

async function writeDescriptor(
  runtimePath: string,
  descriptor: RuntimeDescriptor,
): Promise<void> {
  await writeFile(runtimePath, `${JSON.stringify(descriptor, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
}

function assertRuntime(config: ConfigService, connection: Connection): void {
  const valid =
    process.env.NODE_ENV === 'test' &&
    process.env.COGMEMORY_DATABASE_PURPOSE === 'browser_acceptance' &&
    connection.name === DATABASE_NAME &&
    config.get<string>('app.env') === 'test' &&
    config.get<string>('storage.driver') === 'fake' &&
    config.get<string>('llm.provider') === 'stub' &&
    config.get<string>('smsAuth.provider') === 'stub' &&
    config.get<boolean>('session.cookieSecure') === false;
  if (!valid) {
    throw new FixtureError(
      'B12_U01_RUNTIME_GATE_FAILED',
      'The fixture runtime is not the isolated Browser acceptance environment',
    );
  }
}

async function assertNamespaceUnused(
  namespace: string,
  models: Models,
): Promise<void> {
  const expected = identifiers(namespace);
  const upper = namespace.toUpperCase();
  const [users, patients, visits] = await Promise.all([
    models.users.find({ accountName: { $regex: `^b12fx-${namespace}-` } }),
    models.patients.find({ subjectCode: { $regex: `^B12-${upper}-` } }),
    models.visits.find({ visitCode: { $regex: `^B12-${upper}-` } }),
  ]);
  const exact =
    users.every((entry) => expected.accountNames.includes(entry.accountName)) &&
    patients.every((entry) =>
      expected.subjectCodes.includes(entry.subjectCode),
    ) &&
    visits.every((entry) => expected.visitCodes.includes(entry.visitCode));
  if (!exact) {
    throw new FixtureError(
      'B12_U01_NAMESPACE_SCOPE_UNSAFE',
      'Namespace preflight found an unexpected root record',
    );
  }
  if (users.length + patients.length + visits.length > 0) {
    throw new FixtureError(
      'B12_U01_NAMESPACE_EXISTS',
      'The namespace already contains fixture roots; verify or clean it explicitly',
    );
  }
}

async function createUsers(
  namespace: string,
  password: string,
  models: Models,
  authService: AuthService,
): Promise<{ doctor: UserDocument; nurse: UserDocument }> {
  const names = identifiers(namespace).accountNames;
  const [doctor, nurse] = await Promise.all(
    (['doctor', 'nurse'] as const).map(async (role, index) =>
      models.users.create({
        accountName: names[index],
        displayName: role === 'doctor' ? 'B12 测试医生' : 'B12 测试护士',
        staffCode: `B12FX-${namespace}-${role}`,
        passwordHash: await authService.hashPassword(password),
        passwordChangedAt: new Date(),
        roles: [role],
        permissions: [],
        userType: role,
        status: 'active',
        failedLoginCount: 0,
        lockedUntil: null,
        metadata: null,
      }),
    ),
  );
  return { doctor, nurse };
}

async function createScenario(
  namespace: string,
  ordinal: 1 | 2,
  models: Models,
  actor: AuthenticatedUserContext,
): Promise<ScenarioRoot> {
  const expected = identifiers(namespace);
  const suffix = `${namespace.toUpperCase()}-0${ordinal}`;
  const subjectCode = expected.subjectCodes[ordinal - 1];
  const assessmentDate = new Date('2026-07-24T01:00:00.000Z');
  const completedAt = new Date('2026-07-24T02:00:00.000Z');
  const confirmedAt = new Date('2026-07-24T02:30:00.000Z');
  const patient = await models.patients.create({
    subjectCode,
    displayName: `B12 脱敏受试者 ${ordinal}`,
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
  const visit = await models.visits.create({
    patientId: patient._id,
    subjectCode,
    visitCode: expected.visitCodes[ordinal - 1],
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
  const instance = await models.scaleInstances.create({
    assessmentVisitId: visit._id,
    patientId: patient._id,
    subjectCode,
    scaleDefinitionId,
    scaleVersionId,
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: `B12-${suffix}-INST`,
    instanceNo: 1,
    status: 'completed',
    administrationMode: 'clinician_administered',
    versionTrace: {
      crfVersion: 'b12-crf-1.0',
      scoringRuleVersion: 'b12-score-1.0',
      fieldEncodingVersion: 'b12-field-1.0',
      sourceDocument: 'b12-deidentified-source',
    },
    completedAt,
    lockedAt: null,
    voidedAt: null,
    metadata: { submission: { submissionId: `b12-${suffix}` } },
  });
  const item = await models.itemResponses.create({
    assessmentVisitId: visit._id,
    scaleInstanceId: instance._id,
    patientId: patient._id,
    subjectCode,
    scaleDefinitionId,
    scaleVersionId,
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: instance.instanceCode,
    itemCode: 'moca.b12.fixture.item',
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
  const score = await models.scoreResults.create({
    patientId: patient._id,
    assessmentVisitId: visit._id,
    scaleInstanceId: instance._id,
    subjectCode,
    scaleDefinitionId,
    scaleVersionId,
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: instance.instanceCode,
    scoreResultCode: `B12-${suffix}-SCR`,
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
  const domain = await models.cognitiveDomainResults.create({
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
    domainResultCode: `B12-${suffix}-CDR`,
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
  const report = await models.reports.create({
    patientId: patient._id,
    assessmentVisitId: visit._id,
    primaryScaleInstanceIds: [instance._id],
    scoreResultIds: [score._id],
    cognitiveDomainResultIds: [domain._id],
    mediaEvidenceIds: [],
    subjectCode,
    reportCode: `B12-${suffix}-RPT`,
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
        crfVersion: 'b12-crf-1.0',
        scoringRuleVersion: 'b12-score-1.0',
        fieldEncodingVersion: 'b12-field-1.0',
        domainMappingVersion: 'a19-item-domain-codes-1.0',
        sourceDocument: 'b12-deidentified-source',
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
    evidenceSnapshots: [],
    narrative: {
      chiefSummary: MARKER,
      scoreSummary: 'B12 de-identified score summary',
      domainSummary: 'B12 de-identified domain summary',
      evidenceSummary: 'B12 de-identified evidence summary',
      trendSummary: 'B12 de-identified trend summary',
      recommendationText: 'B12 de-identified recommendation',
      doctorOpinion: 'B12 de-identified doctor opinion',
      limitations: 'B12 de-identified limitations',
    },
    aiDraft: { status: 'not_requested', doctorEdited: false },
    confirmation: {
      confirmedAt,
      confirmedBy: new Types.ObjectId(actor.id),
      confirmedByName: actor.displayName,
      confirmedByRole: 'doctor',
      confirmationNote: 'B12 de-identified confirmation note',
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
        mediaEvidenceCount: 0,
        aiUsed: false,
      },
      a21Submission: {
        version: 1,
        submissionId: randomUUID(),
        submittedAt: new Date('2026-07-24T02:15:00.000Z'),
        submittedBy: actor.id,
        submittedByName: actor.displayName,
        submittedByRole: 'doctor',
        submissionNote: 'B12 de-identified submission note',
      },
      a21Confirmation: {
        version: 1,
        confirmationId: randomUUID(),
        confirmedAt,
        confirmedBy: actor.id,
        confirmedByName: actor.displayName,
        confirmedByRole: 'doctor',
        confirmationNote: 'B12 de-identified confirmation note',
      },
    },
  });
  return {
    patientId: patient._id.toString(),
    visitId: visit._id.toString(),
    reportId: report._id.toString(),
  };
}

async function computeBaseline(
  root: ScenarioRoot,
  models: Models,
): Promise<ScenarioBaseline> {
  const report = await models.reports.findById(root.reportId).exec();
  if (!report) {
    throw new FixtureError(
      'B12_U01_REPORT_MISSING',
      'A fixture report could not be reloaded',
    );
  }
  const reportObject = plain(report) as { updatedAt?: unknown };
  if (!(reportObject.updatedAt instanceof Date)) {
    throw new FixtureError(
      'B12_U01_UPDATED_AT_MISSING',
      'A fixture report is missing its server updatedAt timestamp',
    );
  }
  const [instances, items, scores, domains] = await Promise.all([
    models.scaleInstances
      .find({ _id: { $in: report.primaryScaleInstanceIds } })
      .exec(),
    models.itemResponses
      .find({ scaleInstanceId: { $in: report.primaryScaleInstanceIds } })
      .exec(),
    models.scoreResults.find({ _id: { $in: report.scoreResultIds } }).exec(),
    models.cognitiveDomainResults
      .find({ _id: { $in: report.cognitiveDomainResultIds } })
      .exec(),
  ]);
  return {
    ...root,
    navigationPath: `/patients/${root.patientId}/visits/${root.visitId}`,
    updatedAt: reportObject.updatedAt.toISOString(),
    reportHash: hash(plain(report)),
    lockProtectedReportHash: lockProtectedReportHash(report),
    sourceHash: hash({
      instances: instances.map(plain),
      items: items.map(plain),
      scores: scores.map(plain),
      domains: domains.map(plain),
    }),
  };
}

async function assertU02PostLock(
  baseline: ScenarioBaseline,
  doctor: UserDocument,
  models: Models,
  reportsService: ReportsService,
  publicMapper: ClinicalReportPublicMapper,
): Promise<void> {
  const report = await reportsService.findReportByOwnership({
    reportId: baseline.reportId,
    patientId: baseline.patientId,
    assessmentVisitId: baseline.visitId,
  });
  const raw = await models.reports.findById(baseline.reportId).exec();
  if (!report || !raw) {
    throw new FixtureError(
      'B12_U02_REPORT_MISSING',
      'The U02 target report is missing',
    );
  }
  const lock = resolveExistingClinicalReportLock(report);
  const freeze = resolveExistingSourceFreeze(report);
  const archive = resolveExistingClinicalReportArchive(report);
  const publicReport = publicMapper.toPublicReport(report);
  const current = await computeBaseline(baseline, models);
  const baselineUpdatedAt = new Date(baseline.updatedAt);
  const rawObject = plain(raw) as {
    metadata?: unknown;
    narrative?: { chiefSummary?: unknown } | null;
  };
  const metadata = rawObject.metadata;
  const a22NamespaceCount =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? Object.keys(metadata).filter((key) => key === 'a22Lock').length
      : 0;
  const valid = Boolean(
    report.status === 'confirmed' &&
    report.lockedAt &&
    raw.lockedAt &&
    raw.lockedBy?.toString() === doctor._id.toString() &&
    lock?.lockId &&
    lock.lockedBy.operatorId === doctor._id.toString() &&
    lock.lockedBy.operatorRole === 'doctor' &&
    lock.lockNote === U02_LOCK_NOTE &&
    publicReport.status === 'confirmed' &&
    publicReport.lockedAt &&
    publicReport.lock?.lockId &&
    publicReport.lock.lockedBy?.operatorId === doctor._id.toString() &&
    publicReport.lock.lockedBy?.operatorRole === 'doctor' &&
    publicReport.lock.lockNote === U02_LOCK_NOTE &&
    freeze === null &&
    publicReport.sourceFreeze === null &&
    archive === null &&
    raw.archivedAt === null &&
    raw.voidedAt === null &&
    raw.correctionRecords.length === 0 &&
    raw.auditLogRefs.length === 0 &&
    a22NamespaceCount === 1 &&
    report.updatedAt &&
    report.updatedAt.getTime() > baselineUpdatedAt.getTime() &&
    current.reportHash !== baseline.reportHash &&
    current.lockProtectedReportHash === baseline.lockProtectedReportHash &&
    current.sourceHash === baseline.sourceHash &&
    rawObject.narrative?.chiefSummary === MARKER,
  );
  if (!valid) {
    throw new FixtureError(
      'B12_U02_POST_LOCK_INVALID',
      'The U02 lock facts or protected baselines do not satisfy the post-lock contract',
    );
  }
}

async function assertScenario(
  key: ScenarioKey,
  baseline: ScenarioBaseline,
  models: Models,
  reportsService: ReportsService,
  publicMapper: ClinicalReportPublicMapper,
): Promise<void> {
  const report = await reportsService.findReportByOwnership({
    reportId: baseline.reportId,
    patientId: baseline.patientId,
    assessmentVisitId: baseline.visitId,
  });
  const raw = await models.reports.findById(baseline.reportId).exec();
  if (!report || !raw) {
    throw new FixtureError(
      'B12_U01_SCENARIO_MISSING',
      `The ${key} scenario is missing`,
    );
  }
  const lock = resolveExistingClinicalReportLock(report);
  const freeze = resolveExistingSourceFreeze(report);
  const archive = resolveExistingClinicalReportArchive(report);
  const publicReport = publicMapper.toPublicReport(report);
  const baseValid =
    report.status === 'confirmed' &&
    report.source === 'mixed' &&
    report.qualityStatus === 'passed' &&
    publicReport.isFinal === true &&
    report.confirmation !== null &&
    report.reportVersion === 1 &&
    freeze === null &&
    archive === null &&
    raw.archivedAt === null &&
    raw.voidedAt === null;
  const lifecycleValid =
    key === 'unlocked-confirmed'
      ? report.lockedAt === null && lock === null && raw.lockedBy === null
      : Boolean(report.lockedAt && lock !== null && raw.lockedBy);
  if (!baseValid || !lifecycleValid) {
    throw new FixtureError(
      'B12_U01_SCENARIO_INVALID',
      `The ${key} scenario does not satisfy the U01 lifecycle contract`,
    );
  }
  const current = await computeBaseline(baseline, models);
  if (
    current.updatedAt !== baseline.updatedAt ||
    current.reportHash !== baseline.reportHash ||
    current.sourceHash !== baseline.sourceHash
  ) {
    throw new FixtureError(
      'B12_U01_BASELINE_CHANGED',
      `The ${key} protected report or source baseline changed`,
    );
  }
}

async function prepare(
  namespace: string,
  password: string,
  runtimePath: string,
  models: Models,
  authService: AuthService,
  reportsService: ReportsService,
  publicMapper: ClinicalReportPublicMapper,
  lockWorkflow: ClinicalReportLockWorkflowService,
): Promise<unknown> {
  await assertNamespaceUnused(namespace, models);
  let started = false;
  try {
    started = true;
    const users = await createUsers(namespace, password, models, authService);
    const actor = toActor(users.doctor);
    const unlocked = await createScenario(namespace, 1, models, actor);
    const locked = await createScenario(namespace, 2, models, actor);
    const lockedReport = await reportsService.findReportByOwnership({
      reportId: locked.reportId,
      patientId: locked.patientId,
      assessmentVisitId: locked.visitId,
    });
    if (!lockedReport?.updatedAt) {
      throw new FixtureError(
        'B12_U01_LOCK_PREREQUISITE_MISSING',
        'The locked scenario could not enter the production A22 workflow',
      );
    }
    await lockWorkflow.lockClinicalReport(
      locked.patientId,
      locked.visitId,
      locked.reportId,
      actor,
      {
        confirm: true,
        lockNote: 'B12 U01 controlled production workflow lock',
        expectedUpdatedAt: lockedReport.updatedAt.toISOString(),
      },
    );
    const descriptor: RuntimeDescriptor = {
      schemaVersion: 1,
      batch: 'B12',
      profile: 'B12-P1-user-entry-readonly',
      namespace,
      accounts: {
        doctor: { loginIdentifier: users.doctor.accountName },
        nurse: { loginIdentifier: users.nurse.accountName },
      },
      scenarios: {
        'unlocked-confirmed': await computeBaseline(unlocked, models),
        'locked-confirmed': await computeBaseline(locked, models),
      },
    };
    await writeDescriptor(runtimePath, descriptor);
    for (const key of SCENARIO_KEYS) {
      await assertScenario(
        key,
        descriptor.scenarios[key],
        models,
        reportsService,
        publicMapper,
      );
    }
    return {
      ok: true,
      command: 'prepare',
      databasePurpose: 'browser_acceptance',
      actualDatabaseName: DATABASE_NAME,
      namespace,
      scenarios: {
        unlockedConfirmed: 'prepared',
        lockedConfirmed: 'prepared_via_production_a22',
      },
      accounts: { doctor: 'prepared', nurse: 'prepared' },
      runtimeDescriptor: 'written_without_secrets',
    };
  } catch (error: unknown) {
    if (started) {
      await cleanup(namespace, runtimePath, models).catch(() => undefined);
    }
    throw error;
  }
}

async function verify(
  phase: VerifyPhase,
  namespace: string,
  password: string,
  runtimePath: string,
  models: Models,
  authService: AuthService,
  reportsService: ReportsService,
  publicMapper: ClinicalReportPublicMapper,
): Promise<unknown> {
  const descriptor = await readDescriptor(runtimePath);
  if (descriptor.namespace !== namespace) {
    throw new FixtureError(
      'B12_U01_NAMESPACE_MISMATCH',
      'The runtime descriptor namespace does not match the fixture process',
    );
  }
  const users = await models.users
    .find({
      accountName: {
        $in: [
          descriptor.accounts.doctor.loginIdentifier,
          descriptor.accounts.nurse.loginIdentifier,
        ],
      },
    })
    .select('+passwordHash')
    .exec();
  const byName = new Map(users.map((entry) => [entry.accountName, entry]));
  const doctor = byName.get(descriptor.accounts.doctor.loginIdentifier);
  const nurse = byName.get(descriptor.accounts.nurse.loginIdentifier);
  if (
    users.length !== 2 ||
    doctor?.roles.join(',') !== 'doctor' ||
    nurse?.roles.join(',') !== 'nurse' ||
    !(await authService.verifyPassword(password, doctor?.passwordHash ?? '')) ||
    !(await authService.verifyPassword(password, nurse?.passwordHash ?? ''))
  ) {
    throw new FixtureError(
      'B12_U01_ACCOUNTS_INVALID',
      'The doctor and nurse fixture accounts do not satisfy the role contract',
    );
  }
  if (phase === 'u02-post-lock') {
    await assertU02PostLock(
      descriptor.scenarios['unlocked-confirmed'],
      doctor,
      models,
      reportsService,
      publicMapper,
    );
    await assertScenario(
      'locked-confirmed',
      descriptor.scenarios['locked-confirmed'],
      models,
      reportsService,
      publicMapper,
    );
  } else {
    for (const key of SCENARIO_KEYS) {
      await assertScenario(
        key,
        descriptor.scenarios[key],
        models,
        reportsService,
        publicMapper,
      );
    }
  }
  return {
    ok: true,
    command: 'verify',
    phase,
    databasePurpose: 'browser_acceptance',
    actualDatabaseName: DATABASE_NAME,
    namespace,
    accountRoles: { doctor: 'doctor', nurse: 'nurse' },
    scenarios:
      phase === 'u02-post-lock'
        ? {
            unlockedConfirmed: 'first_lock_verified',
            lockedConfirmed: 'unchanged_locked_not_archived',
          }
        : {
            unlockedConfirmed: 'unchanged_and_eligible',
            lockedConfirmed: 'unchanged_locked_not_archived',
          },
    protectedBaselines:
      phase === 'u02-post-lock'
        ? 'report_and_sources_matched_excluding_a22_lock'
        : 'matched',
    ...(phase === 'u02-post-lock'
      ? {
          lockFacts: {
            uniqueA22Namespace: true,
            independentAuditLogRefsAdded: 0,
            sourceFreeze: 'absent',
            archive: 'absent',
            correctionRecordsAdded: 0,
          },
        }
      : {}),
  };
}

async function countResiduals(
  expected: Identifiers,
  models: Models,
  userIds: Types.ObjectId[],
  patientIds: Types.ObjectId[],
  visitIds: Types.ObjectId[],
): Promise<Record<string, number>> {
  const ownership = {
    $or: [
      { patientId: { $in: patientIds } },
      { assessmentVisitId: { $in: visitIds } },
    ],
  };
  const [
    users,
    patients,
    visits,
    sessions,
    reports,
    domains,
    scores,
    items,
    instances,
  ] = await Promise.all([
    models.users.countDocuments({
      accountName: { $in: expected.accountNames },
    }),
    models.patients.countDocuments({
      subjectCode: { $in: expected.subjectCodes },
    }),
    models.visits.countDocuments({ visitCode: { $in: expected.visitCodes } }),
    models.sessions.countDocuments({ userId: { $in: userIds } }),
    models.reports.countDocuments(ownership),
    models.cognitiveDomainResults.countDocuments(ownership),
    models.scoreResults.countDocuments(ownership),
    models.itemResponses.countDocuments(ownership),
    models.scaleInstances.countDocuments(ownership),
  ]);
  return {
    users,
    patients,
    visits,
    sessions,
    reports,
    domains,
    scores,
    items,
    instances,
  };
}

async function cleanup(
  namespace: string,
  runtimePath: string,
  models: Models,
): Promise<unknown> {
  const expected = identifiers(namespace);
  const upper = namespace.toUpperCase();
  const [prefixedUsers, prefixedPatients, prefixedVisits] = await Promise.all([
    models.users.find({ accountName: { $regex: `^b12fx-${namespace}-` } }),
    models.patients.find({ subjectCode: { $regex: `^B12-${upper}-` } }),
    models.visits.find({ visitCode: { $regex: `^B12-${upper}-` } }),
  ]);
  if (
    prefixedUsers.some(
      (entry) => !expected.accountNames.includes(entry.accountName),
    ) ||
    prefixedPatients.some(
      (entry) => !expected.subjectCodes.includes(entry.subjectCode),
    ) ||
    prefixedVisits.some(
      (entry) => !expected.visitCodes.includes(entry.visitCode),
    )
  ) {
    throw new FixtureError(
      'B12_U01_CLEANUP_SCOPE_UNSAFE',
      'Cleanup found unexpected namespace roots and changed nothing',
    );
  }
  const userIds = prefixedUsers.map((entry) => entry._id);
  const patientIds = prefixedPatients.map((entry) => entry._id);
  const visitIds = prefixedVisits.map((entry) => entry._id);
  const ownership = {
    $or: [
      { patientId: { $in: patientIds } },
      { assessmentVisitId: { $in: visitIds } },
    ],
  };
  const deleted = {
    sessions: (await models.sessions.deleteMany({ userId: { $in: userIds } }))
      .deletedCount,
    reports: (await models.reports.deleteMany(ownership)).deletedCount,
    cognitiveDomainResults: (
      await models.cognitiveDomainResults.deleteMany(ownership)
    ).deletedCount,
    scoreResults: (await models.scoreResults.deleteMany(ownership))
      .deletedCount,
    itemResponses: (await models.itemResponses.deleteMany(ownership))
      .deletedCount,
    scaleInstances: (await models.scaleInstances.deleteMany(ownership))
      .deletedCount,
    visits: (await models.visits.deleteMany({ _id: { $in: visitIds } }))
      .deletedCount,
    patients: (await models.patients.deleteMany({ _id: { $in: patientIds } }))
      .deletedCount,
    users: (await models.users.deleteMany({ _id: { $in: userIds } }))
      .deletedCount,
  };
  const residuals = await countResiduals(
    expected,
    models,
    userIds,
    patientIds,
    visitIds,
  );
  const residualCount = Object.values(residuals).reduce(
    (total, value) => total + value,
    0,
  );
  if (residualCount !== 0) {
    throw new FixtureError(
      'B12_U01_CLEANUP_INCOMPLETE',
      'Fixture cleanup left namespace-owned records behind',
    );
  }
  await unlink(runtimePath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  });
  return {
    ok: true,
    command: 'cleanup',
    databasePurpose: 'browser_acceptance',
    actualDatabaseName: DATABASE_NAME,
    namespace,
    matched: userIds.length + patientIds.length + visitIds.length > 0,
    deleted,
    residualCount,
    runtimeDescriptor: 'absent',
  };
}

function createModels(app: INestApplicationContext): Models {
  return {
    users: app.get(getModelToken(User.name)),
    sessions: app.get(getModelToken(Session.name)),
    patients: app.get(getModelToken(Patient.name)),
    visits: app.get(getModelToken(AssessmentVisit.name)),
    scaleInstances: app.get(getModelToken(ScaleInstance.name)),
    itemResponses: app.get(getModelToken(ItemResponse.name)),
    scoreResults: app.get(getModelToken(ScoreResult.name)),
    cognitiveDomainResults: app.get(getModelToken(CognitiveDomainResult.name)),
    reports: app.get(getModelToken(ClinicalReport.name)),
  };
}

function writeSafeError(error: unknown): void {
  if (error instanceof DatabaseGateError || error instanceof FixtureError) {
    console.error(
      JSON.stringify({ ok: false, code: error.code, message: error.message }),
    );
    return;
  }
  console.error(
    JSON.stringify({
      ok: false,
      code: 'B12_U01_FIXTURE_OPERATION_FAILED',
      message:
        'B12-U01 fixture operation failed without exposing internal details',
    }),
  );
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    const parsed = parseCommand(process.argv.slice(2));
    const namespace = requireNamespace(process.env.B12_U01_NAMESPACE);
    const runtimePath = requireRuntimePath(process.env.B12_U01_RUNTIME_PATH);
    const password =
      parsed.command === 'cleanup'
        ? undefined
        : requirePassword(process.env.B12_U01_FIXTURE_PASSWORD);
    assertBrowserAcceptancePreImportEnvironment({
      nodeEnv: process.env.NODE_ENV,
      purpose: process.env.COGMEMORY_DATABASE_PURPOSE,
      mongoUri: process.env.MONGO_URI,
    });
    const [{ NestFactory }, mongooseModule] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/mongoose'),
    ]);
    // Application modules are loaded only after the process database gate.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as AppModuleExport;
    app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: false,
    });
    connection = app.get<Connection>(mongooseModule.getConnectionToken());
    await assertBrowserFixtureDatabaseAccess(connection);
    assertRuntime(app.get(ConfigService), connection);
    const models = createModels(app);
    const result =
      parsed.command === 'prepare'
        ? await prepare(
            namespace,
            password!,
            runtimePath,
            models,
            app.get(AuthService),
            app.get(ReportsService),
            app.get(ClinicalReportPublicMapper),
            app.get(ClinicalReportLockWorkflowService),
          )
        : parsed.command === 'verify'
          ? await verify(
              parsed.phase!,
              namespace,
              password!,
              runtimePath,
              models,
              app.get(AuthService),
              app.get(ReportsService),
              app.get(ClinicalReportPublicMapper),
            )
          : await cleanup(namespace, runtimePath, models);
    console.log(JSON.stringify(result, null, 2));
  } catch (error: unknown) {
    process.exitCode = 1;
    writeSafeError(error);
  } finally {
    if (app) {
      await app.close().catch(() => {
        process.exitCode = 1;
      });
    }
    if (connection?.readyState) {
      await connection.close().catch(() => {
        process.exitCode = 1;
      });
    }
  }
}

void run();
