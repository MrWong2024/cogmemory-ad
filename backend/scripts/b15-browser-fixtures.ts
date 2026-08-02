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
// prettier-ignore
import { AssessmentVisit, type AssessmentVisitDocument } from '../src/modules/assessments/schemas/assessment-visit.schema';
// prettier-ignore
import { ItemResponse, type ItemResponseDocument } from '../src/modules/assessments/schemas/item-response.schema';
// prettier-ignore
import { ScaleInstance, type ScaleInstanceDocument } from '../src/modules/assessments/schemas/scale-instance.schema';
// prettier-ignore
import { Session, type SessionDocument } from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
import type { AuthenticatedUserContext } from '../src/modules/auth/types/auth-user-context.type';
// prettier-ignore
import { CognitiveDomainResult, type CognitiveDomainResultDocument } from '../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
// prettier-ignore
import { MediaEvidence, type MediaEvidenceDocument } from '../src/modules/media/schemas/media-evidence.schema';
// prettier-ignore
import { Patient, type PatientDocument } from '../src/modules/patients/schemas/patient.schema';
import { resolveExistingClinicalReportArchive } from '../src/modules/reports/lib/clinical-report-archive';
import {
  buildClinicalReportCorrectionPlan,
  buildClinicalReportCorrectionStartMetadata,
  evaluateClinicalReportCorrectionReadiness,
  resolveClinicalReportReplacementLineage,
  resolveExistingClinicalReportCorrection,
  validateClinicalReportReplacement,
} from '../src/modules/reports/lib/clinical-report-correction';
import { resolveExistingClinicalReportLock } from '../src/modules/reports/lib/clinical-report-lock';
import {
  buildClinicalReportSourceFreezeCounts,
  buildClinicalReportSourceFreezeScope,
  resolveExistingSourceFreeze,
} from '../src/modules/reports/lib/clinical-report-source-freeze';
// prettier-ignore
import { ClinicalReport, type ClinicalReportDocument } from '../src/modules/reports/schemas/clinical-report.schema';
import { ClinicalReportArchiveWorkflowService } from '../src/modules/reports/services/clinical-report-archive-workflow.service';
import { ClinicalReportLockWorkflowService } from '../src/modules/reports/services/clinical-report-lock-workflow.service';
import { ClinicalReportPublicMapper } from '../src/modules/reports/services/clinical-report-public.mapper';
import { ClinicalReportSourceFreezeWorkflowService } from '../src/modules/reports/services/clinical-report-source-freeze-workflow.service';
import { ReportsService } from '../src/modules/reports/services/reports.service';
// prettier-ignore
import { ScoreResult, type ScoreResultDocument } from '../src/modules/scoring/schemas/score-result.schema';
// prettier-ignore
import { User, type UserDocument } from '../src/modules/users/schemas/user.schema';

type Command = 'prepare' | 'verify' | 'cleanup';
type Profile = 'B15-P1-first-correction' | 'B15-P2-recovery-uncertain-result';
type Phase = 'prepared' | 'u01-post-correction' | 'u02-post-recovery';
type Root = { patientId: string; visitId: string; sourceReportId: string };
type PreparedBaseline = {
  preparedUpdatedAt: string;
  reportIdentityHash: string;
  protectedReportFactsHash: string;
  confirmationHash: string;
  lockHash: string;
  sourceFreezeHash: string;
  archiveHash: string;
  narrativeHash: string;
  aiDraftHash: string;
  scaleTracesHash: string;
  scoreSnapshotsHash: string;
  domainSnapshotsHash: string;
  evidenceSnapshotsHash: string;
  sourceIdsHash: string;
  auditLogRefsHash: string;
  protectedMetadataHash: string;
  patientHash: string;
  visitHash: string;
  sourceFactsHash: string;
  fakeStorageFactsHash: string;
  independentA25AuditLogCount: 0;
  correctionIdHash?: string;
  startedFactsHash?: string;
  persistedTextHash?: string;
  correctionPlanHash?: string;
};
type Scenario = Root & {
  navigationPath: string;
  preparedBaseline: PreparedBaseline;
};
type BaseDescriptor = {
  schemaVersion: 1;
  batch: 'B15';
  namespace: string;
  accounts: Record<'doctor' | 'nurse', { loginIdentifier: string }>;
};
type P1Descriptor = BaseDescriptor & {
  profile: 'B15-P1-first-correction';
  scenarios: Record<'first-correction-ready', Scenario>;
};
type P2Descriptor = BaseDescriptor & {
  profile: 'B15-P2-recovery-uncertain-result';
  scenarios: Record<
    'correction-in-progress' | 'correction-network-uncertain',
    Scenario
  >;
};
type Descriptor = P1Descriptor | P2Descriptor;
type Models = {
  users: Model<UserDocument>;
  sessions: Model<SessionDocument>;
  patients: Model<PatientDocument>;
  visits: Model<AssessmentVisitDocument>;
  instances: Model<ScaleInstanceDocument>;
  items: Model<ItemResponseDocument>;
  scores: Model<ScoreResultDocument>;
  domains: Model<CognitiveDomainResultDocument>;
  media: Model<MediaEvidenceDocument>;
  reports: Model<ClinicalReportDocument>;
};
type AppModuleExport = { AppModule: Type<unknown> };

class FixtureError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FixtureError';
  }
}

const DB = 'cogmemory_ad_browser_test';
const P1_PROFILE = 'B15-P1-first-correction' as const;
const P2_PROFILE = 'B15-P2-recovery-uncertain-result' as const;
const P1_SCENARIO = 'first-correction-ready' as const;
const P2_IN_PROGRESS_SCENARIO = 'correction-in-progress' as const;
const P2_UNCERTAIN_SCENARIO = 'correction-network-uncertain' as const;
const U01_SOURCE_MARKER = 'B15-U01 synthetic first correction source marker.';
const U01_CORRECTION_REASON = 'B15 U01 脱敏首次更正原因';
const U01_CHANGE_SUMMARY = 'B15 U01 脱敏首次更正摘要';
const U02_PERSISTED_SOURCE_MARKER =
  'B15-U02 synthetic persisted correction source marker.';
const U02_UNCERTAIN_SOURCE_MARKER =
  'B15-U02 synthetic uncertain correction source marker.';
const U02_PERSISTED_REASON = 'B15 U02 脱敏恢复更正原因';
const U02_PERSISTED_SUMMARY = 'B15 U02 脱敏恢复更正摘要';

type ScenarioSeed = {
  ordinal: 1 | 2;
  marker: string;
  displayLabel: 'U01' | 'U02';
  confirmationNote: string;
  submissionNote: string;
  lockNote: string;
  freezeNote: string;
  archiveNote: string;
};

const U01_SEED: ScenarioSeed = {
  ordinal: 1,
  marker: U01_SOURCE_MARKER,
  displayLabel: 'U01',
  confirmationNote: 'B15-U01 脱敏确认说明',
  submissionNote: 'B15-U01 脱敏提交说明',
  lockNote: 'B15-U01 脱敏锁定说明',
  freezeNote: 'B15-U01 脱敏来源冻结说明',
  archiveNote: 'B15-U01 脱敏归档说明',
};

const U02_PERSISTED_SEED: ScenarioSeed = {
  ordinal: 1,
  marker: U02_PERSISTED_SOURCE_MARKER,
  displayLabel: 'U02',
  confirmationNote: 'B15-U02 脱敏恢复场景确认说明',
  submissionNote: 'B15-U02 脱敏恢复场景提交说明',
  lockNote: 'B15-U02 脱敏恢复场景锁定说明',
  freezeNote: 'B15-U02 脱敏恢复场景来源冻结说明',
  archiveNote: 'B15-U02 脱敏恢复场景归档说明',
};

const U02_UNCERTAIN_SEED: ScenarioSeed = {
  ordinal: 2,
  marker: U02_UNCERTAIN_SOURCE_MARKER,
  displayLabel: 'U02',
  confirmationNote: 'B15-U02 脱敏网络场景确认说明',
  submissionNote: 'B15-U02 脱敏网络场景提交说明',
  lockNote: 'B15-U02 脱敏网络场景锁定说明',
  freezeNote: 'B15-U02 脱敏网络场景来源冻结说明',
  archiveNote: 'B15-U02 脱敏网络场景归档说明',
};

function fail(code: string, message: string): never {
  throw new FixtureError(code, message);
}

function required(name: string, minimum = 1): string {
  const value = process.env[name];
  if (!value || value.length < minimum) {
    fail(`B15_${name}_INVALID`, `${name} is invalid`);
  }
  return value;
}

function parseProfile(): Profile {
  const value = process.env.B15_PROFILE ?? P1_PROFILE;
  if (value !== P1_PROFILE && value !== P2_PROFILE) {
    fail(
      'B15_PROFILE_INVALID',
      'B15_PROFILE must be a supported exact B15 profile',
    );
  }
  return value;
}

function profileEnvironment(profile: Profile) {
  const prefix = profile === P1_PROFILE ? 'B15_U01' : 'B15_U02';
  return {
    namespace: `${prefix}_NAMESPACE`,
    runtimePath: `${prefix}_RUNTIME_PATH`,
    fixturePassword: `${prefix}_FIXTURE_PASSWORD`,
    cleanupConfirmation: `${prefix}_CONFIRM_CLEANUP`,
  } as const;
}

function parseCommand(
  profile: Profile,
  cleanupConfirmationName: string,
): { command: Command; phase?: Phase } {
  const [command, phase, extra] = process.argv.slice(2);
  if (!['prepare', 'verify', 'cleanup'].includes(command) || extra) {
    fail(
      'B15_COMMAND_INVALID',
      'Use prepare, verify prepared|profile-post-phase, or cleanup',
    );
  }
  const allowedPhases: Phase[] =
    profile === P1_PROFILE
      ? ['prepared', 'u01-post-correction']
      : ['prepared', 'u02-post-recovery'];
  if (command === 'verify' && !allowedPhases.includes(phase as Phase)) {
    fail(
      'B15_PHASE_INVALID',
      'verify phase does not belong to the selected B15 profile',
    );
  }
  if (command !== 'verify' && phase) {
    fail('B15_ARGUMENT_INVALID', 'Unexpected fixture argument');
  }
  if (command === 'cleanup' && process.env[cleanupConfirmationName] !== '1') {
    fail(
      'B15_CLEANUP_CONFIRMATION_REQUIRED',
      'cleanup requires explicit confirmation',
    );
  }
  return { command: command as Command, phase: phase as Phase | undefined };
}

function fixtureNames(namespace: string) {
  const upper = namespace.toUpperCase();
  return {
    accounts: [
      `b15fx-${namespace}-doctor`,
      `b15fx-${namespace}-nurse`,
    ] as const,
    subjects: [`B15-${upper}-01`, `B15-${upper}-02`] as const,
    visits: [`B15-${upper}-01-VISIT`, `B15-${upper}-02-VISIT`] as const,
  };
}

function scenarioNames(namespace: string, ordinal: 1 | 2) {
  const names = fixtureNames(namespace);
  return {
    subjectCode: names.subjects[ordinal - 1],
    visitCode: names.visits[ordinal - 1],
  };
}

function actor(user: UserDocument): AuthenticatedUserContext {
  return {
    id: user._id.toString(),
    accountName: user.accountName,
    displayName: user.displayName,
    roles: [...user.roles],
    permissions: [...user.permissions],
    userType: user.userType,
  };
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function documentFacts(document: unknown): Record<string, unknown> {
  const facts = (document as { toObject(): unknown }).toObject() as Record<
    string,
    unknown
  >;
  delete facts.__v;
  return facts;
}

function sameIds(expected: readonly string[], actual: readonly string[]) {
  return [...expected].sort().join(',') === [...actual].sort().join(',');
}

function assertRuntime(config: ConfigService, connection: Connection): void {
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.COGMEMORY_DATABASE_PURPOSE !== 'browser_acceptance' ||
    connection.name !== DB ||
    config.get<string>('app.env') !== 'test' ||
    config.get<string>('storage.driver') !== 'fake' ||
    config.get<string>('llm.provider') !== 'stub' ||
    config.get<string>('smsAuth.provider') !== 'stub' ||
    config.get<boolean>('session.cookieSecure') !== false
  ) {
    fail(
      'B15_RUNTIME_GATE_FAILED',
      'Fixture runtime is not the isolated Browser environment',
    );
  }
}

async function readDescriptor(
  path: string,
  profile: Profile,
): Promise<Descriptor> {
  let value: Partial<Descriptor>;
  try {
    value = JSON.parse(await readFile(path, 'utf8')) as Partial<Descriptor>;
  } catch {
    fail('B15_RUNTIME_UNAVAILABLE', 'Safe runtime descriptor is unavailable');
  }
  if (
    value.schemaVersion !== 1 ||
    value.batch !== 'B15' ||
    value.profile !== profile ||
    !value.namespace ||
    !value.accounts ||
    !value.scenarios
  ) {
    fail('B15_RUNTIME_INVALID', 'Safe runtime descriptor is invalid');
  }
  const scenarioKeys = Object.keys(value.scenarios).sort();
  const expectedScenarioKeys =
    profile === P1_PROFILE
      ? [P1_SCENARIO]
      : [P2_IN_PROGRESS_SCENARIO, P2_UNCERTAIN_SCENARIO].sort();
  if (scenarioKeys.join(',') !== expectedScenarioKeys.join(',')) {
    fail('B15_RUNTIME_INVALID', 'Safe runtime scenario set is invalid');
  }
  return value as Descriptor;
}

function assertDescriptorSafety(
  descriptor: Descriptor,
  password: string,
): void {
  const serialized = JSON.stringify(descriptor);
  const forbidden = [
    password,
    'mongodb://',
    'mongodb+srv://',
    'passwordHash',
    'rawResponse',
    'sourceDocument',
    '"metadata"',
    '"scope"',
    '"correctionId"',
    U02_PERSISTED_REASON,
    U02_PERSISTED_SUMMARY,
    'cookie',
    'session',
  ];
  if (forbidden.some((value) => value && serialized.includes(value))) {
    fail('B15_RUNTIME_UNSAFE', 'Runtime descriptor contains a forbidden value');
  }
}

async function writeDescriptor(
  path: string,
  descriptor: Descriptor,
  password: string,
): Promise<void> {
  assertDescriptorSafety(descriptor, password);
  await writeFile(path, `${JSON.stringify(descriptor, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
}

async function assertUnused(
  namespace: string,
  profile: Profile,
  models: Models,
): Promise<void> {
  const names = fixtureNames(namespace);
  const scenarioCount = profile === P1_PROFILE ? 1 : 2;
  const [users, patients, visits] = await Promise.all([
    models.users.countDocuments({ accountName: { $in: names.accounts } }),
    models.patients.countDocuments({
      subjectCode: { $in: names.subjects.slice(0, scenarioCount) },
    }),
    models.visits.countDocuments({
      visitCode: { $in: names.visits.slice(0, scenarioCount) },
    }),
  ]);
  if (users + patients + visits !== 0) {
    fail('B15_NAMESPACE_EXISTS', 'The exact B15 namespace is already in use');
  }
}

async function createUsers(
  namespace: string,
  profile: Profile,
  password: string,
  models: Models,
  auth: AuthService,
) {
  const names = fixtureNames(namespace);
  const passwordHashes = await Promise.all([
    auth.hashPassword(password),
    auth.hashPassword(password),
  ]);
  const created = await Promise.all(
    (['doctor', 'nurse'] as const).map((role, index) =>
      models.users.create({
        accountName: names.accounts[index],
        displayName:
          role === 'doctor'
            ? profile === P1_PROFILE
              ? 'B15 U01 测试医生'
              : 'B15 U02 测试医生'
            : profile === P1_PROFILE
              ? 'B15 U01 测试护士'
              : 'B15 U02 测试护士',
        staffCode: `B15FX-${namespace}-${role}`,
        passwordHash: passwordHashes[index],
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
  return { doctor: created[0], nurse: created[1] };
}

async function createConfirmedChain(input: {
  namespace: string;
  models: Models;
  doctor: AuthenticatedUserContext;
  seed: ScenarioSeed;
}): Promise<Root> {
  const { namespace, models, doctor, seed } = input;
  const names = scenarioNames(namespace, seed.ordinal);
  const assessmentDate = new Date('2026-08-03T01:00:00.000Z');
  const completedAt = new Date('2026-08-03T02:00:00.000Z');
  const confirmedAt = new Date('2026-08-03T02:30:00.000Z');
  const doctorId = new Types.ObjectId(doctor.id);
  const scoreMetrics = { scoreValue: 1, maxScore: 1, minScore: 0 };
  const scoreOrigin = {
    scoreStatus: 'manual_scored',
    scoreSource: 'operator',
  } as const;
  const unlocked = { lockedAt: null, voidedAt: null };
  const patient = await models.patients.create({
    subjectCode: names.subjectCode,
    displayName: `B15 ${seed.displayLabel} 脱敏受试者 ${seed.ordinal}`,
    sourceType: 'clinical',
    sex: 'unknown',
    handedness: 'unknown',
    status: 'active',
    tags: [],
  });
  const visit = await models.visits.create({
    patientId: patient._id,
    subjectCode: names.subjectCode,
    visitCode: names.visitCode,
    visitType: 'baseline',
    status: 'completed',
    assessmentDate,
    startedAt: assessmentDate,
    completedAt,
    lockedAt: null,
    voidedAt: null,
    operatorSnapshot: {
      operatorId: doctorId,
      operatorName: doctor.displayName,
      operatorRole: 'doctor',
    },
  });
  const scaleDefinitionId = new Types.ObjectId();
  const scaleVersionId = new Types.ObjectId();
  const sourceIds = {
    patientId: patient._id,
    assessmentVisitId: visit._id,
    subjectCode: names.subjectCode,
    scaleDefinitionId,
    scaleVersionId,
    scaleCode: 'moca',
    scaleVersion: '1.0',
  };
  const instance = await models.instances.create({
    assessmentVisitId: visit._id,
    patientId: patient._id,
    subjectCode: names.subjectCode,
    scaleDefinitionId,
    scaleVersionId,
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: `B15-${namespace.toUpperCase()}-0${seed.ordinal}-INST`,
    instanceNo: 1,
    status: 'completed',
    administrationMode: 'clinician_administered',
    completedAt,
    ...unlocked,
    versionTrace: {
      crfVersion: `b15-${seed.displayLabel.toLowerCase()}-crf-1.0`,
      scoringRuleVersion: `b15-${seed.displayLabel.toLowerCase()}-score-1.0`,
      fieldEncodingVersion: `b15-${seed.displayLabel.toLowerCase()}-field-1.0`,
      sourceDocument: `b15-${seed.displayLabel.toLowerCase()}-deidentified-source`,
    },
  });
  const item = await models.items.create({
    ...sourceIds,
    scaleInstanceId: instance._id,
    instanceCode: instance.instanceCode,
    itemCode: `moca.b15.${seed.displayLabel.toLowerCase()}.fixture.item.${seed.ordinal}`,
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
    ...unlocked,
    score: {
      ...scoreMetrics,
      ...scoreOrigin,
      scoredAt: confirmedAt,
      scoredBy: doctorId,
    },
  });
  const score = await models.scores.create({
    ...sourceIds,
    scaleInstanceId: instance._id,
    instanceCode: instance.instanceCode,
    scoreResultCode: `B15-${namespace.toUpperCase()}-0${seed.ordinal}-SCR`,
    runNo: 1,
    status: 'confirmed',
    scoringSource: 'manual',
    scoringMode: 'manual_summary',
    versionTrace: { scaleVersion: '1.0' },
    totalScore: {
      ...scoreMetrics,
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
        ...scoreMetrics,
        ...scoreOrigin,
        isMissing: false,
        cognitiveDomainCodes: ['memory'],
      },
    ],
    computation: {
      computedAt: confirmedAt,
      computedBy: doctorId,
      inputItemCount: 1,
      includedItemCount: 1,
      excludedItemCount: 0,
      warningCount: 0,
    },
    review: {
      reviewStatus: 'reviewed',
      reviewedAt: confirmedAt,
      reviewerId: doctorId,
      reviewerName: doctor.displayName,
    },
    qualityStatus: 'passed',
    confirmedAt,
    ...unlocked,
  });
  const domain = await models.domains.create({
    ...sourceIds,
    scaleInstanceId: instance._id,
    scoreResultId: score._id,
    instanceCode: instance.instanceCode,
    domainResultCode: `B15-${namespace.toUpperCase()}-0${seed.ordinal}-CDR`,
    runNo: 1,
    status: 'computed',
    mappingSource: 'scale_config',
    mappingMode: 'item_domain_codes',
    versionTrace: { scaleVersion: '1.0' },
    domainScores: [
      {
        domainCode: 'memory',
        ...scoreMetrics,
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
        ...scoreOrigin,
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
      computedBy: doctorId,
      inputItemCount: 1,
      contributionCount: 1,
      domainCount: 1,
      includedContributionCount: 1,
      excludedContributionCount: 0,
      warningCount: 0,
    },
    review: { reviewStatus: 'not_required' },
    qualityStatus: 'unchecked',
    ...unlocked,
  });
  const report = await models.reports.create({
    patientId: patient._id,
    assessmentVisitId: visit._id,
    primaryScaleInstanceIds: [instance._id],
    scoreResultIds: [score._id],
    cognitiveDomainResultIds: [domain._id],
    mediaEvidenceIds: [],
    subjectCode: names.subjectCode,
    reportCode: `B15-${namespace.toUpperCase()}-0${seed.ordinal}-RPT`,
    reportType: 'cognitive_assessment',
    status: 'confirmed',
    reportVersion: 1,
    source: 'mixed',
    patientSnapshot: {
      subjectCode: names.subjectCode,
      displayName: patient.displayName,
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
    },
    visitSnapshot: {
      visitCode: visit.visitCode,
      visitType: 'baseline',
      assessmentDate,
      operatorName: doctor.displayName,
      operatorRole: 'doctor',
      clinicalContext: null,
    },
    scaleTraces: [
      {
        scaleInstanceId: instance._id,
        scaleCode: 'moca',
        scaleVersion: '1.0',
        crfVersion: `b15-${seed.displayLabel.toLowerCase()}-crf-1.0`,
        scoringRuleVersion: `b15-${seed.displayLabel.toLowerCase()}-score-1.0`,
        fieldEncodingVersion: `b15-${seed.displayLabel.toLowerCase()}-field-1.0`,
        domainMappingVersion: 'a19-item-domain-codes-1.0',
        sourceDocument: `b15-${seed.displayLabel.toLowerCase()}-deidentified-source`,
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
      chiefSummary: seed.marker,
      scoreSummary: `B15 ${seed.displayLabel} safe score summary ${seed.ordinal}`,
      domainSummary: `B15 ${seed.displayLabel} safe domain summary ${seed.ordinal}`,
      evidenceSummary: `B15 ${seed.displayLabel} safe evidence summary ${seed.ordinal}`,
      trendSummary: `B15 ${seed.displayLabel} safe trend summary ${seed.ordinal}`,
      recommendationText: `B15 ${seed.displayLabel} safe recommendation ${seed.ordinal}`,
      doctorOpinion: `B15 ${seed.displayLabel} safe doctor opinion ${seed.ordinal}`,
      limitations: `B15 ${seed.displayLabel} safe limitations ${seed.ordinal}`,
    },
    aiDraft: { status: 'not_requested', doctorEdited: false },
    confirmation: {
      confirmedAt,
      confirmedBy: doctorId,
      confirmedByName: doctor.displayName,
      confirmedByRole: 'doctor',
      confirmationNote: seed.confirmationNote,
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
        generatedBy: doctor.id,
        generatedByName: doctor.displayName,
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
        submittedAt: new Date('2026-08-03T02:15:00.000Z'),
        submittedBy: doctor.id,
        submittedByName: doctor.displayName,
        submittedByRole: 'doctor',
        submissionNote: seed.submissionNote,
      },
      a21Confirmation: {
        version: 1,
        confirmationId: randomUUID(),
        confirmedAt,
        confirmedBy: doctor.id,
        confirmedByName: doctor.displayName,
        confirmedByRole: 'doctor',
        confirmationNote: seed.confirmationNote,
      },
    },
  });
  return {
    patientId: patient.id,
    visitId: visit.id,
    sourceReportId: report.id,
  };
}

async function runA22A23A24(input: {
  root: Root;
  doctor: AuthenticatedUserContext;
  seed: ScenarioSeed;
  reports: ReportsService;
  lock: ClinicalReportLockWorkflowService;
  freeze: ClinicalReportSourceFreezeWorkflowService;
  archive: ClinicalReportArchiveWorkflowService;
}): Promise<void> {
  const { root, doctor, seed, reports, lock, freeze, archive } = input;
  let report = await reports.findReportByOwnership({
    reportId: root.sourceReportId,
    patientId: root.patientId,
    assessmentVisitId: root.visitId,
  });
  if (!report?.updatedAt) {
    fail('B15_A22_PREREQUISITE_MISSING', 'Report cannot enter A22');
  }
  const lockResult = await lock.lockClinicalReport(
    root.patientId,
    root.visitId,
    root.sourceReportId,
    doctor,
    {
      confirm: true,
      lockNote: seed.lockNote,
      expectedUpdatedAt: report.updatedAt.toISOString(),
    },
  );
  if (lockResult.lockReceipt.alreadyLocked || !lockResult.report.lockedAt) {
    fail('B15_A22_FAILED', 'Production A22 workflow did not lock once');
  }
  report = await reports.findReportByOwnership({
    reportId: root.sourceReportId,
    patientId: root.patientId,
    assessmentVisitId: root.visitId,
  });
  if (!report?.updatedAt) {
    fail('B15_A23_PREREQUISITE_MISSING', 'Report cannot enter A23');
  }
  const freezeResult = await freeze.freezeClinicalReportSources(
    root.patientId,
    root.visitId,
    root.sourceReportId,
    doctor,
    {
      confirm: true,
      freezeNote: seed.freezeNote,
      expectedUpdatedAt: report.updatedAt.toISOString(),
    },
  );
  if (
    freezeResult.sourceFreezeReceipt.alreadyFrozen ||
    freezeResult.sourceFreezeReceipt.resumedExisting ||
    freezeResult.report.sourceFreeze?.state !== 'completed'
  ) {
    fail('B15_A23_FAILED', 'Production A23 workflow did not freeze once');
  }
  report = await reports.findReportByOwnership({
    reportId: root.sourceReportId,
    patientId: root.patientId,
    assessmentVisitId: root.visitId,
  });
  if (!report?.updatedAt) {
    fail('B15_A24_PREREQUISITE_MISSING', 'Report cannot enter A24');
  }
  const archiveResult = await archive.archiveClinicalReport(
    root.patientId,
    root.visitId,
    root.sourceReportId,
    doctor,
    {
      confirm: true,
      archiveNote: seed.archiveNote,
      expectedUpdatedAt: report.updatedAt.toISOString(),
    },
  );
  if (
    archiveResult.archiveReceipt.alreadyArchived ||
    archiveResult.report.status !== 'archived'
  ) {
    fail('B15_A24_FAILED', 'Production A24 workflow did not archive once');
  }
}

async function startRecoverableCorrection(input: {
  root: Root;
  doctor: AuthenticatedUserContext;
  reports: ReportsService;
}): Promise<void> {
  const { root, doctor, reports } = input;
  const source = await reports.findReportByOwnership({
    reportId: root.sourceReportId,
    patientId: root.patientId,
    assessmentVisitId: root.visitId,
  });
  const latest = await reports.findLatestReportByVisitId(root.visitId);
  if (!source?.updatedAt || !latest || latest.id !== source.id) {
    fail(
      'B15_U02_A25_PREREQUISITE_MISSING',
      'Recoverable correction source is not the latest report',
    );
  }
  const expectedUpdatedAt = source.updatedAt;
  evaluateClinicalReportCorrectionReadiness({
    sourceReport: source,
    latestReport: latest,
    expectedUpdatedAt,
  });
  const existingV2 = await reports.listReportsByVisitTypeVersion(
    root.visitId,
    source.reportType,
    2,
  );
  if (existingV2.length !== 0) {
    fail(
      'B15_U02_A25_VERSION_EXISTS',
      'Recoverable correction source already contains V2',
    );
  }
  const plan = buildClinicalReportCorrectionPlan({
    sourceReport: source,
    correctionId: randomUUID(),
    startedAt: new Date(),
    actor: {
      operatorId: doctor.id,
      operatorName: doctor.displayName,
      operatorRole: 'doctor',
    },
    correctionReason: U02_PERSISTED_REASON,
    changeSummary: U02_PERSISTED_SUMMARY,
  });
  const metadata = buildClinicalReportCorrectionStartMetadata({
    sourceReport: source,
    plan,
  });
  const started = await reports.startCorrectionIfUnmodified({
    reportId: source.id,
    patientId: root.patientId,
    assessmentVisitId: root.visitId,
    reportVersion: source.reportVersion,
    reportCode: source.reportCode,
    expectedUpdatedAt,
    metadata,
  });
  const resolution = started
    ? resolveExistingClinicalReportCorrection(started)
    : null;
  if (
    !started ||
    started.status !== 'archived' ||
    started.correctionRecords.length !== 0 ||
    !resolution ||
    resolution.completed ||
    resolution.audit.state !== 'in_progress' ||
    !resolution.audit.correctionId ||
    resolution.audit.correctionNo !== 1 ||
    resolution.audit.startedBy !== doctor.id ||
    resolution.audit.startedByRole !== 'doctor' ||
    !resolution.audit.startedAt ||
    resolution.audit.correctionReason !== U02_PERSISTED_REASON ||
    resolution.audit.changeSummary !== U02_PERSISTED_SUMMARY ||
    resolution.audit.previousReportCode !== source.reportCode ||
    resolution.audit.previousReportVersion !== 1 ||
    resolution.audit.replacementReportVersion !== 2 ||
    resolution.audit.replacementReportId !== undefined ||
    resolution.audit.completedAt !== undefined ||
    resolution.audit.completedBy !== undefined
  ) {
    fail(
      'B15_U02_A25_START_INVALID',
      'Production A25 start contract did not persist a recoverable correction',
    );
  }
}

async function loadFacts(root: Root, models: Models) {
  const ownership = {
    patientId: new Types.ObjectId(root.patientId),
    assessmentVisitId: new Types.ObjectId(root.visitId),
  };
  const [source, patient, visit, instances, items, scores, domains, media] =
    await Promise.all([
      models.reports.findById(root.sourceReportId),
      models.patients.findById(root.patientId),
      models.visits.findById(root.visitId),
      models.instances.find(ownership).sort({ _id: 1 }),
      models.items.find(ownership).sort({ _id: 1 }),
      models.scores.find(ownership).sort({ _id: 1 }),
      models.domains.find(ownership).sort({ _id: 1 }),
      models.media.find(ownership).sort({ _id: 1 }),
    ]);
  if (!source || !patient || !visit) {
    fail('B15_FACTS_MISSING', 'Fixture business facts are missing');
  }
  const updatedAt: unknown = source.get('updatedAt');
  if (!(updatedAt instanceof Date)) {
    fail('B15_REPORT_TIMESTAMP_MISSING', 'Fixture report timestamp is missing');
  }
  const reportFacts = documentFacts(source);
  const metadata =
    reportFacts.metadata && typeof reportFacts.metadata === 'object'
      ? (reportFacts.metadata as Record<string, unknown>)
      : {};
  const protectedMetadata = { ...metadata };
  delete protectedMetadata.a25Correction;
  const protectedReportFacts: Record<string, unknown> = {
    ...reportFacts,
    metadata: protectedMetadata,
  };
  for (const key of ['status', 'updatedAt', 'correctionRecords']) {
    delete protectedReportFacts[key];
  }
  const sourceFacts = [
    instances.map(documentFacts),
    items.map(documentFacts),
    scores.map(documentFacts),
    domains.map(documentFacts),
    media.map(documentFacts),
  ];
  const sourceIds = [
    instances.map((document) => document.id),
    items.map((document) => document.id),
    scores.map((document) => document.id),
    domains.map((document) => document.id),
    media.map((document) => document.id),
  ];
  const relatedReportIds = (
    await models.reports
      .find(ownership)
      .select({ _id: 1 })
      .sort({ reportVersion: 1 })
  ).map((report) => report._id);
  const independentA25AuditLogCount = await models.reports.db
    .collection('audit_logs')
    .countDocuments({
      $or: [
        { reportId: { $in: relatedReportIds } },
        { clinicalReportId: { $in: relatedReportIds } },
        { resourceId: { $in: relatedReportIds } },
      ],
    });
  return {
    source,
    patient,
    visit,
    instances,
    items,
    scores,
    domains,
    media,
    metadata,
    protectedMetadata,
    baseline: {
      preparedUpdatedAt: updatedAt.toISOString(),
      reportIdentityHash: hash({
        id: source.id,
        patientId: source.patientId,
        assessmentVisitId: source.assessmentVisitId,
        reportType: source.reportType,
        reportVersion: source.reportVersion,
        reportCode: source.reportCode,
      }),
      protectedReportFactsHash: hash(protectedReportFacts),
      confirmationHash: hash({
        confirmation: source.confirmation,
        a21Confirmation: metadata.a21Confirmation,
      }),
      lockHash: hash({
        lockedAt: source.lockedAt,
        lockedBy: source.lockedBy,
        a22Lock: metadata.a22Lock,
      }),
      sourceFreezeHash: hash(metadata.a23SourceFreeze),
      archiveHash: hash({
        archivedAt: source.archivedAt,
        archivedBy: source.archivedBy,
        a24Archive: metadata.a24Archive,
      }),
      narrativeHash: hash(source.narrative),
      aiDraftHash: hash(source.aiDraft),
      scaleTracesHash: hash(source.scaleTraces),
      scoreSnapshotsHash: hash(source.scoreSnapshots),
      domainSnapshotsHash: hash(source.domainSnapshots),
      evidenceSnapshotsHash: hash(source.evidenceSnapshots),
      sourceIdsHash: hash(sourceIds),
      auditLogRefsHash: hash(source.auditLogRefs),
      protectedMetadataHash: hash(protectedMetadata),
      patientHash: hash(documentFacts(patient)),
      visitHash: hash(documentFacts(visit)),
      sourceFactsHash: hash(sourceFacts),
      fakeStorageFactsHash: hash({
        driver: 'fake',
        mediaEvidenceFacts: media.map(documentFacts),
      }),
      independentA25AuditLogCount,
    },
  };
}

async function snapshot(
  root: Root,
  models: Models,
  reports: ReportsService,
): Promise<Scenario> {
  const facts = await loadFacts(root, models);
  if (facts.baseline.independentA25AuditLogCount !== 0) {
    fail('B15_A25_AUDIT_LOG_PRESENT', 'Expected no independent A25 AuditLog');
  }
  const source = await reports.findReportByOwnership({
    reportId: root.sourceReportId,
    patientId: root.patientId,
    assessmentVisitId: root.visitId,
  });
  if (!source) {
    fail('B15_SNAPSHOT_SOURCE_MISSING', 'Snapshot source report is missing');
  }
  const correction = resolveExistingClinicalReportCorrection(source);
  const correctionBaseline =
    correction?.audit.state === 'in_progress'
      ? {
          correctionIdHash: hash(correction.audit.correctionId),
          startedFactsHash: hash({
            startedAt: correction.audit.startedAt,
            startedBy: correction.audit.startedBy,
            startedByName: correction.audit.startedByName,
            startedByRole: correction.audit.startedByRole,
          }),
          persistedTextHash: hash({
            correctionReason: correction.audit.correctionReason,
            changeSummary: correction.audit.changeSummary,
          }),
          correctionPlanHash: hash({
            correctionNo: correction.audit.correctionNo,
            previousReportCode: correction.audit.previousReportCode,
            previousReportVersion: correction.audit.previousReportVersion,
            replacementReportCode: correction.audit.replacementReportCode,
            replacementReportVersion: correction.audit.replacementReportVersion,
            sourceArchiveId: correction.audit.sourceArchiveId,
            sourceArchivedAt: correction.audit.sourceArchivedAt,
            sourceFreezeId: correction.audit.sourceFreezeId,
            sourceFreezeCompletedAt: correction.audit.sourceFreezeCompletedAt,
          }),
        }
      : {};
  return {
    ...root,
    navigationPath: `/patients/${root.patientId}/visits/${root.visitId}`,
    preparedBaseline: {
      ...facts.baseline,
      independentA25AuditLogCount: 0,
      ...correctionBaseline,
    },
  };
}

async function assertNamespace(
  namespace: string,
  profile: Profile,
  models: Models,
): Promise<void> {
  const names = fixtureNames(namespace);
  const scenarioCount = profile === P1_PROFILE ? 1 : 2;
  const subjectCodes = names.subjects.slice(0, scenarioCount);
  const visitCodes = names.visits.slice(0, scenarioCount);
  const [users, patients, visits] = await Promise.all([
    models.users.find({ accountName: { $in: names.accounts } }),
    models.patients.find({ subjectCode: { $in: subjectCodes } }),
    models.visits.find({ visitCode: { $in: visitCodes } }),
  ]);
  if (
    users.length !== 2 ||
    patients.length !== scenarioCount ||
    visits.length !== scenarioCount
  ) {
    fail('B15_NAMESPACE_OWNERSHIP_INVALID', 'B15 root ownership is invalid');
  }
  for (const visit of visits) {
    const patient = patients.find((candidate) =>
      candidate._id.equals(visit.patientId),
    );
    if (!patient || patient.subjectCode !== visit.subjectCode) {
      fail('B15_NAMESPACE_OWNERSHIP_INVALID', 'B15 root ownership is invalid');
    }
    const ownership = {
      patientId: patient._id,
      assessmentVisitId: visit._id,
    };
    const [reports, instances, items, scores, domains, media] =
      await Promise.all([
        models.reports.countDocuments(ownership),
        models.instances.countDocuments(ownership),
        models.items.countDocuments(ownership),
        models.scores.countDocuments(ownership),
        models.domains.countDocuments(ownership),
        models.media.countDocuments(ownership),
      ]);
    if (
      ![1, 2].includes(reports) ||
      [instances, items, scores, domains, media].join(',') !== '1,1,1,1,0'
    ) {
      fail(
        'B15_NAMESPACE_OWNERSHIP_INVALID',
        'B15 business ownership is invalid',
      );
    }
  }
}

async function assertPrepared(input: {
  scenario: Scenario;
  seed: ScenarioSeed;
  correctionState: 'none' | 'in_progress';
  doctorId: string;
  reports: ReportsService;
  publicMapper: ClinicalReportPublicMapper;
  models: Models;
}): Promise<void> {
  const {
    scenario,
    seed,
    correctionState,
    doctorId,
    reports,
    publicMapper,
    models,
  } = input;
  const report = await reports.findReportByOwnership({
    reportId: scenario.sourceReportId,
    patientId: scenario.patientId,
    assessmentVisitId: scenario.visitId,
  });
  const latest = await reports.findLatestReportByVisitId(scenario.visitId);
  if (!report || !latest || latest.id !== report.id) {
    fail('B15_PREPARED_REPORT_MISSING', 'Prepared source is not latest');
  }
  const facts = await loadFacts(scenario, models);
  const lock = resolveExistingClinicalReportLock(report);
  const freeze = resolveExistingSourceFreeze(report);
  const archive = resolveExistingClinicalReportArchive(report);
  const correction = resolveExistingClinicalReportCorrection(report);
  const lineage = resolveClinicalReportReplacementLineage(report);
  const publicReport = publicMapper.toPublicReport(report);
  const metadata = report.metadata as Record<string, unknown>;
  const a21 = metadata.a21Confirmation as Record<string, unknown>;
  const a22 = metadata.a22Lock as Record<string, unknown>;
  const a23 = metadata.a23SourceFreeze as Record<string, unknown>;
  const a24 = metadata.a24Archive as Record<string, unknown>;
  const actualScope = buildClinicalReportSourceFreezeScope(
    report,
    facts.items.map((item) => item.id),
  );
  const actualCounts = buildClinicalReportSourceFreezeCounts(actualScope);
  const reportFilter = {
    patientId: new Types.ObjectId(scenario.patientId),
    assessmentVisitId: new Types.ObjectId(scenario.visitId),
    reportType: 'cognitive_assessment',
  } as const;
  const [reportCount, v1Count, v2Count, v3Count, otherVersionCount] =
    await Promise.all([
      models.reports.countDocuments(reportFilter),
      models.reports.countDocuments({ ...reportFilter, reportVersion: 1 }),
      models.reports.countDocuments({ ...reportFilter, reportVersion: 2 }),
      models.reports.countDocuments({ ...reportFilter, reportVersion: 3 }),
      models.reports.countDocuments({
        ...reportFilter,
        reportVersion: { $nin: [1, 2, 3] },
      }),
    ]);
  const confirmationSafe = Boolean(
    report.confirmation?.confirmedAt &&
    report.confirmation.confirmedBy &&
    report.confirmation.confirmedByName &&
    report.confirmation.confirmedByRole === 'doctor' &&
    report.confirmation.confirmationNote === seed.confirmationNote &&
    a21.version === 1 &&
    a21.confirmedBy === report.confirmation.confirmedBy &&
    (a21.confirmedAt as Date).getTime() ===
      report.confirmation.confirmedAt.getTime(),
  );
  const lockSafe = Boolean(
    lock?.lockId &&
    report.lockedAt &&
    report.lockedBy &&
    lock.lockedAt.getTime() === report.lockedAt.getTime() &&
    lock.lockedBy.operatorId === report.lockedBy &&
    lock.lockedBy.operatorRole === 'doctor' &&
    lock.lockNote === seed.lockNote &&
    a22.version === 1 &&
    a22.lockId === lock.lockId,
  );
  const freezeSafe = Boolean(
    freeze?.state === 'completed' &&
    freeze.completedAt &&
    freeze.completedBy &&
    freeze.completedByRole === 'doctor' &&
    freeze.freezeNote === seed.freezeNote &&
    hash(freeze.scope) === hash(actualScope) &&
    hash(freeze.expectedCounts) === hash(actualCounts) &&
    hash(freeze.completedCounts) === hash(actualCounts) &&
    freeze.previouslyFrozenCounts.totalSourceCount === 0 &&
    a23.version === 1 &&
    a23.state === 'completed' &&
    a23.freezeId === freeze.freezeId,
  );
  const archiveSafe = Boolean(
    archive?.archiveId &&
    report.archivedAt &&
    report.archivedBy &&
    archive.archiveNote === seed.archiveNote &&
    archive.archivedAt.getTime() === report.archivedAt.getTime() &&
    archive.archivedBy.operatorId === report.archivedBy &&
    archive.archivedBy.operatorRole === 'doctor' &&
    archive.sourceFreezeId === freeze?.freezeId &&
    archive.sourceFreezeCompletedAt?.getTime() ===
      freeze?.completedAt?.getTime() &&
    a24.version === 1 &&
    a24.archiveId === archive.archiveId,
  );
  const frozenAt = freeze?.sourceLockedAt.toISOString();
  const sourcesSafe = Boolean(
    facts.instances.length === 1 &&
    facts.items.length === 1 &&
    facts.scores.length === 1 &&
    facts.domains.length === 1 &&
    facts.media.length === 0 &&
    facts.instances[0].status === 'locked' &&
    facts.items[0].status === 'locked' &&
    facts.scores[0].status === 'locked' &&
    facts.domains[0].status === 'computed' &&
    [...facts.instances, ...facts.items, ...facts.scores, ...facts.domains]
      .map((source) => source.lockedAt?.toISOString())
      .every((lockedAt) => lockedAt === frozenAt) &&
    sameIds(report.primaryScaleInstanceIds, [facts.instances[0].id]) &&
    sameIds(report.scoreResultIds, [facts.scores[0].id]) &&
    sameIds(report.cognitiveDomainResultIds, [facts.domains[0].id]) &&
    report.mediaEvidenceIds.length === 0,
  );
  const correctionSafe =
    correctionState === 'none'
      ? correction === null &&
        publicReport.correction === null &&
        metadata.a25Correction === undefined &&
        scenario.preparedBaseline.correctionIdHash === undefined &&
        scenario.preparedBaseline.startedFactsHash === undefined &&
        scenario.preparedBaseline.persistedTextHash === undefined &&
        scenario.preparedBaseline.correctionPlanHash === undefined
      : Boolean(
          correction &&
          !correction.completed &&
          correction.audit.state === 'in_progress' &&
          correction.audit.correctionNo === 1 &&
          correction.audit.startedBy === doctorId &&
          correction.audit.startedByRole === 'doctor' &&
          correction.audit.startedAt &&
          correction.audit.correctionReason === U02_PERSISTED_REASON &&
          correction.audit.changeSummary === U02_PERSISTED_SUMMARY &&
          correction.audit.previousReportCode === report.reportCode &&
          correction.audit.previousReportVersion === 1 &&
          correction.audit.replacementReportVersion === 2 &&
          correction.audit.replacementReportId === undefined &&
          correction.audit.completedAt === undefined &&
          correction.audit.completedBy === undefined &&
          hash(correction.audit.correctionId) ===
            scenario.preparedBaseline.correctionIdHash &&
          hash({
            startedAt: correction.audit.startedAt,
            startedBy: correction.audit.startedBy,
            startedByName: correction.audit.startedByName,
            startedByRole: correction.audit.startedByRole,
          }) === scenario.preparedBaseline.startedFactsHash &&
          hash({
            correctionReason: correction.audit.correctionReason,
            changeSummary: correction.audit.changeSummary,
          }) === scenario.preparedBaseline.persistedTextHash &&
          hash({
            correctionNo: correction.audit.correctionNo,
            previousReportCode: correction.audit.previousReportCode,
            previousReportVersion: correction.audit.previousReportVersion,
            replacementReportCode: correction.audit.replacementReportCode,
            replacementReportVersion: correction.audit.replacementReportVersion,
            sourceArchiveId: correction.audit.sourceArchiveId,
            sourceArchivedAt: correction.audit.sourceArchivedAt,
            sourceFreezeId: correction.audit.sourceFreezeId,
            sourceFreezeCompletedAt: correction.audit.sourceFreezeCompletedAt,
          }) === scenario.preparedBaseline.correctionPlanHash &&
          publicReport.correction?.state === 'in_progress' &&
          publicReport.correction.correctionNo === 1 &&
          publicReport.correction.replacementReportId === null,
        );
  if (
    report.status !== 'archived' ||
    report.reportVersion !== 1 ||
    report.reportType !== 'cognitive_assessment' ||
    report.source !== 'mixed' ||
    report.qualityStatus !== 'passed' ||
    publicReport.isFinal !== true ||
    report.narrative?.chiefSummary !== seed.marker ||
    !correctionSafe ||
    lineage !== null ||
    publicReport.replacementOf !== null ||
    report.correctionRecords.length !== 0 ||
    report.voidedAt !== null ||
    !confirmationSafe ||
    !lockSafe ||
    !freezeSafe ||
    !archiveSafe ||
    !sourcesSafe ||
    reportCount !== 1 ||
    v1Count !== 1 ||
    v2Count !== 0 ||
    v3Count !== 0 ||
    otherVersionCount !== 0 ||
    facts.baseline.independentA25AuditLogCount !== 0 ||
    !Object.entries(facts.baseline).every(
      ([key, value]) =>
        JSON.stringify(value) ===
        JSON.stringify(
          scenario.preparedBaseline[key as keyof PreparedBaseline],
        ),
    )
  ) {
    fail('B15_PREPARED_INVALID', 'Prepared correction source is invalid');
  }
}

async function assertPostCorrection(input: {
  scenario: Scenario;
  doctor: UserDocument;
  expectedReason: string;
  expectedSummary: string;
  requirePersistedStart: boolean;
  evidenceLabel: 'U01' | 'U02';
  reports: ReportsService;
  publicMapper: ClinicalReportPublicMapper;
  models: Models;
}) {
  const {
    scenario,
    doctor,
    expectedReason,
    expectedSummary,
    requirePersistedStart,
    evidenceLabel,
    reports,
    publicMapper,
    models,
  } = input;
  const reportFilter = {
    patientId: new Types.ObjectId(scenario.patientId),
    assessmentVisitId: new Types.ObjectId(scenario.visitId),
    reportType: 'cognitive_assessment',
  } as const;
  const reportDocuments = await models.reports
    .find(reportFilter)
    .sort({ reportVersion: 1, createdAt: 1 });
  if (reportDocuments.length !== 2) {
    fail(
      `B15_${evidenceLabel}_REPORT_COUNT_INVALID`,
      'Post-correction report count is invalid',
    );
  }
  const sourceDocument = reportDocuments.find(
    (report) => report.reportVersion === 1,
  );
  const replacementDocument = reportDocuments.find(
    (report) => report.reportVersion === 2,
  );
  if (!sourceDocument || !replacementDocument) {
    fail(
      `B15_${evidenceLabel}_VERSION_MISSING`,
      'Post-correction V1 or V2 is missing',
    );
  }
  const source = await reports.findReportByOwnership({
    reportId: sourceDocument.id,
    patientId: scenario.patientId,
    assessmentVisitId: scenario.visitId,
  });
  const replacement = await reports.findReportByOwnership({
    reportId: replacementDocument.id,
    patientId: scenario.patientId,
    assessmentVisitId: scenario.visitId,
  });
  const latest = await reports.findLatestReportByVisitId(scenario.visitId);
  if (!source || !replacement || !latest || latest.id !== replacement.id) {
    fail(
      `B15_${evidenceLabel}_LATEST_INVALID`,
      'Post-correction latest replacement is invalid',
    );
  }
  const facts = await loadFacts(scenario, models);
  const resolution = resolveExistingClinicalReportCorrection(source);
  if (!resolution?.completed || resolution.audit.state !== 'completed') {
    fail(
      `B15_${evidenceLabel}_A25_INCOMPLETE`,
      'Post-correction completed A25 audit is missing',
    );
  }
  const audit = resolution.audit;
  const lineage = resolveClinicalReportReplacementLineage(replacement);
  if (!lineage) {
    fail(
      `B15_${evidenceLabel}_LINEAGE_INVALID`,
      'Post-correction replacement lineage is missing',
    );
  }
  validateClinicalReportReplacement({
    sourceReport: source,
    replacementReport: replacement,
    audit,
  });
  const sourcePublic = publicMapper.toPublicReport(source);
  const replacementPublic = publicMapper.toPublicReport(replacement);
  const publicCorrection = sourcePublic.correction;
  const publicLineage = replacementPublic.replacementOf;
  const correctionRecord = sourceDocument.correctionRecords[0];
  const sourceMetadata = source.metadata as Record<string, unknown>;
  const replacementMetadata = replacement.metadata as Record<string, unknown>;
  const sourceMetadataKeys = Object.keys(sourceMetadata).sort();
  const expectedSourceMetadataKeys = [
    'a20Generation',
    'a21Confirmation',
    'a21Submission',
    'a22Lock',
    'a23SourceFreeze',
    'a24Archive',
    'a25Correction',
  ].sort();
  const replacementMetadataKeys = Object.keys(replacementMetadata).sort();
  const protectedKeys = [
    'reportIdentityHash',
    'protectedReportFactsHash',
    'confirmationHash',
    'lockHash',
    'sourceFreezeHash',
    'archiveHash',
    'narrativeHash',
    'aiDraftHash',
    'scaleTracesHash',
    'scoreSnapshotsHash',
    'domainSnapshotsHash',
    'evidenceSnapshotsHash',
    'sourceIdsHash',
    'auditLogRefsHash',
    'protectedMetadataHash',
    'patientHash',
    'visitHash',
    'sourceFactsHash',
    'fakeStorageFactsHash',
  ] as const;
  const protectedFactsMatch = protectedKeys.every(
    (key) => facts.baseline[key] === scenario.preparedBaseline[key],
  );
  const updatedAt: unknown = sourceDocument.get('updatedAt');
  const sourceArchive = resolveExistingClinicalReportArchive(source);
  const sourceFreeze = resolveExistingSourceFreeze(source);
  const sourceLock = resolveExistingClinicalReportLock(source);
  const replacementArchive = resolveExistingClinicalReportArchive(replacement);
  const replacementFreeze = resolveExistingSourceFreeze(replacement);
  const [v1Count, v2Count, v3Count, otherVersionCount, completedA25Count] =
    await Promise.all([
      models.reports.countDocuments({ ...reportFilter, reportVersion: 1 }),
      models.reports.countDocuments({ ...reportFilter, reportVersion: 2 }),
      models.reports.countDocuments({ ...reportFilter, reportVersion: 3 }),
      models.reports.countDocuments({
        ...reportFilter,
        reportVersion: { $nin: [1, 2, 3] },
      }),
      models.reports.countDocuments({
        ...reportFilter,
        'metadata.a25Correction.state': 'completed',
      }),
    ]);
  const replacementForSourceCount = await models.reports.countDocuments({
    ...reportFilter,
    'metadata.a25CorrectionReplacement.previousReportId': source.id,
  });
  const correctionIdDocumentCount = await models.reports.countDocuments({
    ...reportFilter,
    $or: [
      { 'metadata.a25Correction.correctionId': audit.correctionId },
      {
        'metadata.a25CorrectionReplacement.correctionId': audit.correctionId,
      },
    ],
  });
  const sourceFactsSafe = Boolean(
    source.id === scenario.sourceReportId &&
    source.status === 'corrected' &&
    source.reportVersion === 1 &&
    source.reportType === 'cognitive_assessment' &&
    source.source === 'mixed' &&
    source.qualityStatus === 'passed' &&
    sourcePublic.isFinal === true &&
    sourceDocument.correctionRecords.length === 1 &&
    sourceDocument.voidedAt === null &&
    sourceDocument.voidedBy === null &&
    updatedAt instanceof Date &&
    updatedAt.getTime() >
      new Date(scenario.preparedBaseline.preparedUpdatedAt).getTime() &&
    protectedFactsMatch &&
    sourceMetadataKeys.join(',') === expectedSourceMetadataKeys.join(','),
  );
  const auditSafe = Boolean(
    audit.correctionId &&
    audit.correctionNo === 1 &&
    audit.correctionReason === expectedReason &&
    audit.changeSummary === expectedSummary &&
    audit.startedBy === doctor.id &&
    audit.startedByRole === 'doctor' &&
    audit.completedBy === doctor.id &&
    audit.completedByRole === 'doctor' &&
    audit.startedAt &&
    audit.completedAt &&
    audit.previousReportCode === source.reportCode &&
    audit.previousReportVersion === 1 &&
    audit.replacementReportId === replacement.id &&
    audit.replacementReportCode === replacement.reportCode &&
    audit.replacementReportVersion === 2 &&
    audit.sourceArchiveId === sourceArchive?.archiveId &&
    audit.sourceArchivedAt.getTime() === source.archivedAt?.getTime() &&
    audit.sourceFreezeId === sourceFreeze?.freezeId &&
    audit.sourceFreezeCompletedAt.getTime() ===
      sourceFreeze?.completedAt?.getTime(),
  );
  const correctionRecordSafe = Boolean(
    correctionRecord &&
    correctionRecord.correctionNo === 1 &&
    correctionRecord.correctedAt?.getTime() === audit.completedAt?.getTime() &&
    correctionRecord.correctedBy?.toString() === doctor.id &&
    correctionRecord.correctedByName === doctor.displayName &&
    correctionRecord.reason === expectedReason &&
    correctionRecord.changeSummary === expectedSummary &&
    correctionRecord.previousReportCode === source.reportCode &&
    correctionRecord.replacementReportCode === replacement.reportCode &&
    correctionRecord.auditLogId === null,
  );
  const replacementResetSafe = Boolean(
    replacement.reportVersion === 2 &&
    replacement.status === 'draft' &&
    replacement.source === 'mixed' &&
    replacement.qualityStatus === 'needs_review' &&
    replacementPublic.isFinal === false &&
    replacement.confirmation === null &&
    replacement.lockedAt === null &&
    replacement.lockedBy === null &&
    resolveExistingClinicalReportLock(replacement) === null &&
    replacementFreeze === null &&
    replacement.archivedAt === null &&
    replacement.archivedBy === null &&
    replacementArchive === null &&
    resolveExistingClinicalReportCorrection(replacement) === null &&
    replacement.correctionRecords.length === 0 &&
    replacement.voidedAt === null &&
    replacement.voidedBy === null &&
    replacement.auditLogRefs.length === 0 &&
    replacementMetadataKeys.join(',') ===
      ['a20Generation', 'a25CorrectionReplacement'].sort().join(',') &&
    replacementMetadata.a22Lock === undefined &&
    replacementMetadata.a23SourceFreeze === undefined &&
    replacementMetadata.a24Archive === undefined &&
    replacementMetadata.a25Correction === undefined &&
    replacement.aiDraft?.status === 'not_requested',
  );
  const lineageSafe = Boolean(
    lineage.correctionId === audit.correctionId &&
    lineage.correctionNo === 1 &&
    lineage.previousReportId === source.id &&
    lineage.previousReportCode === source.reportCode &&
    lineage.previousReportVersion === 1 &&
    lineage.replacementReportCode === replacement.reportCode &&
    lineage.replacementReportVersion === 2 &&
    lineage.createdBy === doctor.id &&
    lineage.createdByRole === 'doctor' &&
    lineage.correctionReason === expectedReason &&
    lineage.changeSummary === expectedSummary &&
    lineage.sourceArchiveId === audit.sourceArchiveId &&
    lineage.sourceArchivedAt.getTime() === audit.sourceArchivedAt.getTime() &&
    lineage.sourceFreezeId === audit.sourceFreezeId &&
    lineage.sourceFreezeCompletedAt.getTime() ===
      audit.sourceFreezeCompletedAt.getTime(),
  );
  const publicSurfaceSafe = Boolean(
    publicCorrection &&
    publicLineage &&
    publicCorrection.correctionNo === 1 &&
    publicCorrection.correctionReason === expectedReason &&
    publicCorrection.changeSummary === expectedSummary &&
    publicLineage.correctionNo === 1 &&
    publicLineage.previousReportId === source.id &&
    publicLineage.correctionReason === expectedReason &&
    publicLineage.changeSummary === expectedSummary &&
    !Object.hasOwn(sourcePublic, 'metadata') &&
    !Object.hasOwn(sourcePublic, 'correctionRecords') &&
    !Object.hasOwn(replacementPublic, 'metadata') &&
    !Object.hasOwn(replacementPublic, 'correctionRecords'),
  );
  const versionSafe = Boolean(
    reportDocuments.length === 2 &&
    v1Count === 1 &&
    v2Count === 1 &&
    v3Count === 0 &&
    otherVersionCount === 0 &&
    completedA25Count === 1 &&
    replacementForSourceCount === 1 &&
    correctionIdDocumentCount === 2 &&
    sourceDocument.correctionRecords.length === 1,
  );
  const persistedStartSafe =
    !requirePersistedStart ||
    Boolean(
      hash(audit.correctionId) === scenario.preparedBaseline.correctionIdHash &&
      hash({
        startedAt: audit.startedAt,
        startedBy: audit.startedBy,
        startedByName: audit.startedByName,
        startedByRole: audit.startedByRole,
      }) === scenario.preparedBaseline.startedFactsHash &&
      hash({
        correctionReason: audit.correctionReason,
        changeSummary: audit.changeSummary,
      }) === scenario.preparedBaseline.persistedTextHash &&
      hash({
        correctionNo: audit.correctionNo,
        previousReportCode: audit.previousReportCode,
        previousReportVersion: audit.previousReportVersion,
        replacementReportCode: audit.replacementReportCode,
        replacementReportVersion: audit.replacementReportVersion,
        sourceArchiveId: audit.sourceArchiveId,
        sourceArchivedAt: audit.sourceArchivedAt,
        sourceFreezeId: audit.sourceFreezeId,
        sourceFreezeCompletedAt: audit.sourceFreezeCompletedAt,
      }) === scenario.preparedBaseline.correctionPlanHash,
    );
  if (
    !sourceFactsSafe ||
    !auditSafe ||
    !correctionRecordSafe ||
    !replacementResetSafe ||
    !lineageSafe ||
    !publicSurfaceSafe ||
    !versionSafe ||
    !persistedStartSafe ||
    !sourceLock?.lockId ||
    facts.baseline.independentA25AuditLogCount !== 0
  ) {
    fail(
      `B15_${evidenceLabel}_POST_CORRECTION_INVALID`,
      'Post-correction facts or protected boundary are invalid',
    );
  }
  return {
    completedA25Count: 1,
    correctionRecordCount: 1,
    reportCount: 2,
    v1Count: 1,
    v2Count: 1,
    v3Count: 0,
    branchCount: 0,
    sourceProtectedFacts: 'unchanged_except_formal_a25_fields',
    replacementLifecycle: 'formal_copy_reset_contract_matched',
    patientVisitSourcesStorage: 'unchanged',
    independentA25AuditLogCount: 0,
    ...(requirePersistedStart
      ? {
          persistedCorrectionIdHash: 'matched',
          persistedStartedFactsHash: 'matched',
          persistedTextHash: 'matched',
          persistedPlanHash: 'matched',
        }
      : {}),
  } as const;
}

async function cleanup(
  namespace: string,
  profile: Profile,
  path: string,
  models: Models,
) {
  const names = fixtureNames(namespace);
  const scenarioCount = profile === P1_PROFILE ? 1 : 2;
  const subjectCodes = names.subjects.slice(0, scenarioCount);
  const visitCodes = names.visits.slice(0, scenarioCount);
  const [users, patients, visits] = await Promise.all([
    models.users.find({ accountName: { $in: names.accounts } }),
    models.patients.find({ subjectCode: { $in: subjectCodes } }),
    models.visits.find({ visitCode: { $in: visitCodes } }),
  ]);
  const userIds = users.map((entry) => entry._id);
  const patientIds = patients.map((entry) => entry._id);
  const visitIds = visits.map((entry) => entry._id);
  const owned = {
    $or: [
      { patientId: { $in: patientIds } },
      { assessmentVisitId: { $in: visitIds } },
    ],
  };
  const reports = await models.reports.find(owned).select({ _id: 1 });
  const reportIds = reports.map((report) => report._id);
  const deleted = {
    sessions: (await models.sessions.deleteMany({ userId: { $in: userIds } }))
      .deletedCount,
    auditLogs: (
      await models.reports.db.collection('audit_logs').deleteMany({
        $or: [
          { reportId: { $in: reportIds } },
          { clinicalReportId: { $in: reportIds } },
          { resourceId: { $in: reportIds } },
        ],
      })
    ).deletedCount,
    reports: (await models.reports.deleteMany(owned)).deletedCount,
    domains: (await models.domains.deleteMany(owned)).deletedCount,
    scores: (await models.scores.deleteMany(owned)).deletedCount,
    media: (await models.media.deleteMany(owned)).deletedCount,
    items: (await models.items.deleteMany(owned)).deletedCount,
    instances: (await models.instances.deleteMany(owned)).deletedCount,
    visits: (await models.visits.deleteMany({ _id: { $in: visitIds } }))
      .deletedCount,
    patients: (await models.patients.deleteMany({ _id: { $in: patientIds } }))
      .deletedCount,
    users: (await models.users.deleteMany({ _id: { $in: userIds } }))
      .deletedCount,
  };
  const residuals = await Promise.all([
    models.users.countDocuments({ accountName: { $in: names.accounts } }),
    models.patients.countDocuments({ subjectCode: { $in: subjectCodes } }),
    models.visits.countDocuments({ visitCode: { $in: visitCodes } }),
    models.sessions.countDocuments({ userId: { $in: userIds } }),
    models.reports.countDocuments(owned),
    models.domains.countDocuments(owned),
    models.scores.countDocuments(owned),
    models.media.countDocuments(owned),
    models.items.countDocuments(owned),
    models.instances.countDocuments(owned),
    models.reports.db.collection('audit_logs').countDocuments({
      $or: [
        { reportId: { $in: reportIds } },
        { clinicalReportId: { $in: reportIds } },
        { resourceId: { $in: reportIds } },
      ],
    }),
  ]);
  const residualCount = residuals.reduce((sum, count) => sum + count, 0);
  if (residualCount !== 0) {
    fail('B15_CLEANUP_INCOMPLETE', 'Namespace cleanup left records');
  }
  await unlink(path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  });
  return {
    ok: true,
    command: 'cleanup',
    profile,
    databasePurpose: 'browser_acceptance',
    actualDatabaseName: DB,
    namespace,
    deleted,
    residualCount,
    runtimeDescriptor: 'absent',
  };
}

async function prepare(input: {
  profile: Profile;
  namespace: string;
  password: string;
  path: string;
  models: Models;
  auth: AuthService;
  reports: ReportsService;
  publicMapper: ClinicalReportPublicMapper;
  lock: ClinicalReportLockWorkflowService;
  freeze: ClinicalReportSourceFreezeWorkflowService;
  archive: ClinicalReportArchiveWorkflowService;
}) {
  const {
    profile,
    namespace,
    password,
    path,
    models,
    auth,
    reports,
    publicMapper,
    lock,
    freeze,
    archive,
  } = input;
  await readFile(path, 'utf8').then(
    () => fail('B15_RUNTIME_EXISTS', 'Use an unused runtime descriptor path'),
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    },
  );
  await assertUnused(namespace, profile, models);
  try {
    const users = await createUsers(namespace, profile, password, models, auth);
    const doctor = actor(users.doctor);
    const accounts = {
      doctor: { loginIdentifier: users.doctor.accountName },
      nurse: { loginIdentifier: users.nurse.accountName },
    };
    let descriptor: Descriptor;
    if (profile === P1_PROFILE) {
      const root = await createConfirmedChain({
        namespace,
        models,
        doctor,
        seed: U01_SEED,
      });
      await runA22A23A24({
        root,
        doctor,
        seed: U01_SEED,
        reports,
        lock,
        freeze,
        archive,
      });
      const scenario = await snapshot(root, models, reports);
      descriptor = {
        schemaVersion: 1,
        batch: 'B15',
        profile,
        namespace,
        accounts,
        scenarios: { [P1_SCENARIO]: scenario },
      };
      await assertPrepared({
        scenario,
        seed: U01_SEED,
        correctionState: 'none',
        doctorId: doctor.id,
        reports,
        publicMapper,
        models,
      });
    } else {
      const inProgressRoot = await createConfirmedChain({
        namespace,
        models,
        doctor,
        seed: U02_PERSISTED_SEED,
      });
      await runA22A23A24({
        root: inProgressRoot,
        doctor,
        seed: U02_PERSISTED_SEED,
        reports,
        lock,
        freeze,
        archive,
      });
      await startRecoverableCorrection({
        root: inProgressRoot,
        doctor,
        reports,
      });
      const uncertainRoot = await createConfirmedChain({
        namespace,
        models,
        doctor,
        seed: U02_UNCERTAIN_SEED,
      });
      await runA22A23A24({
        root: uncertainRoot,
        doctor,
        seed: U02_UNCERTAIN_SEED,
        reports,
        lock,
        freeze,
        archive,
      });
      const inProgressScenario = await snapshot(
        inProgressRoot,
        models,
        reports,
      );
      const uncertainScenario = await snapshot(uncertainRoot, models, reports);
      descriptor = {
        schemaVersion: 1,
        batch: 'B15',
        profile,
        namespace,
        accounts,
        scenarios: {
          [P2_IN_PROGRESS_SCENARIO]: inProgressScenario,
          [P2_UNCERTAIN_SCENARIO]: uncertainScenario,
        },
      };
      await assertPrepared({
        scenario: inProgressScenario,
        seed: U02_PERSISTED_SEED,
        correctionState: 'in_progress',
        doctorId: doctor.id,
        reports,
        publicMapper,
        models,
      });
      await assertPrepared({
        scenario: uncertainScenario,
        seed: U02_UNCERTAIN_SEED,
        correctionState: 'none',
        doctorId: doctor.id,
        reports,
        publicMapper,
        models,
      });
    }
    await writeDescriptor(path, descriptor, password);
    await assertNamespace(namespace, profile, models);
    return {
      ok: true,
      command: 'prepare',
      profile,
      databasePurpose: 'browser_acceptance',
      actualDatabaseName: DB,
      namespace,
      accounts: { doctor: 'prepared', nurse: 'prepared' },
      scenarios: {
        ...(profile === P1_PROFILE
          ? { firstCorrectionReady: 'production_a22_a23_a24' }
          : {
              correctionInProgress: 'production_a22_a23_a24_and_a25_plan_start',
              correctionNetworkUncertain: 'production_a22_a23_a24',
            }),
      },
      runtimeDescriptor: 'written_with_safe_hashes_and_counts_only',
    };
  } catch (error: unknown) {
    await cleanup(namespace, profile, path, models).catch(() => undefined);
    throw error;
  }
}

async function verify(input: {
  profile: Profile;
  phase: Phase;
  namespace: string;
  password: string;
  path: string;
  models: Models;
  auth: AuthService;
  reports: ReportsService;
  publicMapper: ClinicalReportPublicMapper;
}) {
  const {
    profile,
    phase,
    namespace,
    password,
    path,
    models,
    auth,
    reports,
    publicMapper,
  } = input;
  const descriptor = await readDescriptor(path, profile);
  assertDescriptorSafety(descriptor, password);
  if (descriptor.namespace !== namespace) {
    fail('B15_NAMESPACE_MISMATCH', 'Runtime namespace mismatch');
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
    .select('+passwordHash');
  const byName = new Map(users.map((user) => [user.accountName, user]));
  const doctor = byName.get(descriptor.accounts.doctor.loginIdentifier);
  const nurse = byName.get(descriptor.accounts.nurse.loginIdentifier);
  if (
    users.length !== 2 ||
    doctor?.roles.join() !== 'doctor' ||
    nurse?.roles.join() !== 'nurse' ||
    !(await auth.verifyPassword(password, doctor?.passwordHash ?? '')) ||
    !(await auth.verifyPassword(password, nurse?.passwordHash ?? ''))
  ) {
    fail('B15_ACCOUNTS_INVALID', 'Doctor or nurse account contract failed');
  }
  if (!doctor) {
    fail('B15_DOCTOR_MISSING', 'Fixture doctor is missing');
  }
  await assertNamespace(namespace, profile, models);
  let scenarioResult: Record<string, unknown>;
  if (descriptor.profile === P1_PROFILE) {
    const scenario = descriptor.scenarios[P1_SCENARIO];
    scenarioResult =
      phase === 'prepared'
        ? await assertPrepared({
            scenario,
            seed: U01_SEED,
            correctionState: 'none',
            doctorId: doctor.id,
            reports,
            publicMapper,
            models,
          }).then(() => ({
            firstCorrectionReady: 'unique_archived_v1_latest',
            v2Count: 0,
            v3Count: 0,
            completedA25Count: 0,
          }))
        : await assertPostCorrection({
            scenario,
            doctor,
            expectedReason: U01_CORRECTION_REASON,
            expectedSummary: U01_CHANGE_SUMMARY,
            requirePersistedStart: false,
            evidenceLabel: 'U01',
            reports,
            publicMapper,
            models,
          });
  } else {
    const inProgress = descriptor.scenarios[P2_IN_PROGRESS_SCENARIO];
    const uncertain = descriptor.scenarios[P2_UNCERTAIN_SCENARIO];
    if (
      inProgress.patientId === uncertain.patientId ||
      inProgress.visitId === uncertain.visitId ||
      inProgress.sourceReportId === uncertain.sourceReportId
    ) {
      fail(
        'B15_U02_SCENARIO_ISOLATION_INVALID',
        'U02 scenarios do not have independent ownership',
      );
    }
    if (phase === 'prepared') {
      await assertPrepared({
        scenario: inProgress,
        seed: U02_PERSISTED_SEED,
        correctionState: 'in_progress',
        doctorId: doctor.id,
        reports,
        publicMapper,
        models,
      });
      await assertPrepared({
        scenario: uncertain,
        seed: U02_UNCERTAIN_SEED,
        correctionState: 'none',
        doctorId: doctor.id,
        reports,
        publicMapper,
        models,
      });
      scenarioResult = {
        correctionInProgress:
          'unique_archived_v1_latest_with_persisted_a25_start',
        correctionNetworkUncertain:
          'unique_archived_v1_latest_without_correction',
        v2Count: 0,
        v3Count: 0,
        branchCount: 0,
        independentA25AuditLogCount: 0,
      };
    } else {
      const recovered = await assertPostCorrection({
        scenario: inProgress,
        doctor,
        expectedReason: U02_PERSISTED_REASON,
        expectedSummary: U02_PERSISTED_SUMMARY,
        requirePersistedStart: true,
        evidenceLabel: 'U02',
        reports,
        publicMapper,
        models,
      });
      await assertPrepared({
        scenario: uncertain,
        seed: U02_UNCERTAIN_SEED,
        correctionState: 'none',
        doctorId: doctor.id,
        reports,
        publicMapper,
        models,
      });
      scenarioResult = {
        correctionInProgress: recovered,
        correctionNetworkUncertain: {
          status: 'archived',
          correction: null,
          v2Count: 0,
          v3Count: 0,
          branchCount: 0,
          businessBaseline: 'unchanged',
          patientVisitSourcesStorage: 'unchanged',
          independentA25AuditLogCount: 0,
        },
        crossScenarioOwnership: 'isolated',
      };
    }
  }
  return {
    ok: true,
    command: 'verify',
    profile,
    phase,
    databasePurpose: 'browser_acceptance',
    actualDatabaseName: DB,
    namespace,
    accountRoles: { doctor: 'doctor', nurse: 'nurse' },
    scenario: scenarioResult,
    businessBaseline:
      'report_patient_visit_sources_snapshots_metadata_storage_audit_boundaries_matched',
  };
}

function models(app: INestApplicationContext): Models {
  return {
    users: app.get(getModelToken(User.name)),
    sessions: app.get(getModelToken(Session.name)),
    patients: app.get(getModelToken(Patient.name)),
    visits: app.get(getModelToken(AssessmentVisit.name)),
    instances: app.get(getModelToken(ScaleInstance.name)),
    items: app.get(getModelToken(ItemResponse.name)),
    scores: app.get(getModelToken(ScoreResult.name)),
    domains: app.get(getModelToken(CognitiveDomainResult.name)),
    media: app.get(getModelToken(MediaEvidence.name)),
    reports: app.get(getModelToken(ClinicalReport.name)),
  };
}

function safeError(error: unknown): void {
  const known =
    error instanceof DatabaseGateError || error instanceof FixtureError;
  console.error(
    JSON.stringify({
      ok: false,
      code: known ? error.code : 'B15_FIXTURE_OPERATION_FAILED',
      message: known
        ? error.message
        : 'B15 fixture operation failed without exposing internal details',
    }),
  );
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    const profile = parseProfile();
    const environment = profileEnvironment(profile);
    const parsed = parseCommand(profile, environment.cleanupConfirmation);
    const namespace = required(environment.namespace);
    if (!/^[a-z0-9][a-z0-9-]{2,19}$/.test(namespace)) {
      fail('B15_NAMESPACE_INVALID', 'Namespace format is invalid');
    }
    const path = required(environment.runtimePath);
    const password =
      parsed.command === 'cleanup'
        ? ''
        : required(environment.fixturePassword, 16);
    assertBrowserAcceptancePreImportEnvironment({
      nodeEnv: process.env.NODE_ENV,
      purpose: process.env.COGMEMORY_DATABASE_PURPOSE,
      mongoUri: process.env.MONGO_URI,
    });
    const [{ NestFactory }, mongooseModule] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/mongoose'),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as AppModuleExport;
    app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: false,
    });
    connection = app.get<Connection>(mongooseModule.getConnectionToken());
    await assertBrowserFixtureDatabaseAccess(connection);
    assertRuntime(app.get(ConfigService), connection);
    const registry = models(app);
    const result =
      parsed.command === 'prepare'
        ? await prepare({
            profile,
            namespace,
            password,
            path,
            models: registry,
            auth: app.get(AuthService),
            reports: app.get(ReportsService),
            publicMapper: app.get(ClinicalReportPublicMapper),
            lock: app.get(ClinicalReportLockWorkflowService),
            freeze: app.get(ClinicalReportSourceFreezeWorkflowService),
            archive: app.get(ClinicalReportArchiveWorkflowService),
          })
        : parsed.command === 'verify'
          ? await verify({
              profile,
              phase: parsed.phase!,
              namespace,
              password,
              path,
              models: registry,
              auth: app.get(AuthService),
              reports: app.get(ReportsService),
              publicMapper: app.get(ClinicalReportPublicMapper),
            })
          : await cleanup(namespace, profile, path, registry);
    console.log(JSON.stringify(result, null, 2));
  } catch (error: unknown) {
    process.exitCode = 1;
    safeError(error);
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
    const readyState = Number(connection?.readyState ?? 0);
    if (readyState !== 0) process.exitCode = 1;
    console.log(
      JSON.stringify({ fixtureConnectionClosed: readyState === 0, readyState }),
    );
  }
}

void run();
