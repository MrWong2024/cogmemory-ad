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
import { ClinicalReportSourceFreezeWorkflowService } from '../src/modules/reports/services/clinical-report-source-freeze-workflow.service';
import { ReportsService } from '../src/modules/reports/services/reports.service';
// prettier-ignore
import { ScoreResult, type ScoreResultDocument } from '../src/modules/scoring/schemas/score-result.schema';
// prettier-ignore
import { User, type UserDocument } from '../src/modules/users/schemas/user.schema';

type Command = 'prepare' | 'verify' | 'cleanup';
type Phase = 'prepared' | 'post-browser';
type Key = 'archive-ready' | 'archive-completed';
type Root = { patientId: string; visitId: string; reportId: string };
type PreparedBaseline = {
  status: 'confirmed' | 'archived';
  reportBusinessFactsHash: string;
  patientVisitFactsHash: string;
  sourceFactsHash: string;
  sourceIdsHash: string;
  lockFactsHash: string;
  sourceFreezeFactsHash: string;
  archiveFactsHash: string | null;
  confirmationFactsHash: string;
  auditLogRefsHash: string;
  independentA24AuditLogCount: 0;
};
type Scenario = Root & {
  navigationPath: string;
  preparedBaseline: PreparedBaseline;
};
type Descriptor = {
  schemaVersion: 1;
  batch: 'B14';
  profile: 'B14-P1-entry-readonly';
  namespace: string;
  accounts: Record<'doctor' | 'nurse', { loginIdentifier: string }>;
  scenarios: Record<Key, Scenario>;
};
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
const PROFILE = 'B14-P1-entry-readonly' as const;
const KEYS: readonly Key[] = ['archive-ready', 'archive-completed'];
const MARKER = 'B14-U01 synthetic readable report marker.';
const CONFIRMATION_NOTE = 'B14 脱敏确认说明';
const LOCK_NOTE = 'B14 脱敏锁定说明';
const FREEZE_NOTE = 'B14 脱敏来源冻结说明';
const ARCHIVE_NOTE = 'B14 脱敏归档说明';

function fail(code: string, message: string): never {
  throw new FixtureError(code, message);
}

function required(name: string, minimum = 1): string {
  const value = process.env[name];
  if (!value || value.length < minimum) {
    fail(`B14_${name}_INVALID`, `${name} is invalid`);
  }
  return value;
}

function parseCommand(): { command: Command; phase?: Phase } {
  const [command, phase, extra] = process.argv.slice(2);
  if (!['prepare', 'verify', 'cleanup'].includes(command) || extra) {
    fail(
      'B14_COMMAND_INVALID',
      'Use prepare, verify prepared|post-browser, or cleanup',
    );
  }
  if (command === 'verify' && !['prepared', 'post-browser'].includes(phase)) {
    fail('B14_PHASE_INVALID', 'verify requires prepared or post-browser');
  }
  if (command !== 'verify' && phase) {
    fail('B14_ARGUMENT_INVALID', 'Unexpected fixture argument');
  }
  if (command === 'cleanup' && process.env.B14_U01_CONFIRM_CLEANUP !== '1') {
    fail(
      'B14_CLEANUP_CONFIRMATION_REQUIRED',
      'cleanup requires explicit confirmation',
    );
  }
  return { command: command as Command, phase: phase as Phase | undefined };
}

function names(namespace: string) {
  const upper = namespace.toUpperCase();
  return {
    accounts: [
      `b14fx-${namespace}-doctor`,
      `b14fx-${namespace}-nurse`,
    ] as const,
    subjects: [1, 2].map((ordinal) => `B14-${upper}-0${ordinal}`),
    visits: [1, 2].map((ordinal) => `B14-${upper}-0${ordinal}-VISIT`),
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

async function readDescriptor(path: string): Promise<Descriptor> {
  let value: Partial<Descriptor>;
  try {
    value = JSON.parse(await readFile(path, 'utf8')) as Partial<Descriptor>;
  } catch {
    fail('B14_RUNTIME_UNAVAILABLE', 'Safe runtime descriptor is unavailable');
  }
  if (
    value.schemaVersion !== 1 ||
    value.batch !== 'B14' ||
    value.profile !== PROFILE ||
    !value.namespace ||
    !value.accounts ||
    !value.scenarios
  ) {
    fail('B14_RUNTIME_INVALID', 'Safe runtime descriptor is invalid');
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
    'metadata',
    'cookie',
    'session',
  ];
  if (forbidden.some((value) => value && serialized.includes(value))) {
    fail('B14_RUNTIME_UNSAFE', 'Runtime descriptor contains a forbidden value');
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
      'B14_RUNTIME_GATE_FAILED',
      'Fixture runtime is not the isolated Browser environment',
    );
  }
}

async function assertUnused(namespace: string, models: Models): Promise<void> {
  const fixtureNames = names(namespace);
  const [users, patients, visits] = await Promise.all([
    models.users.countDocuments({
      accountName: { $in: fixtureNames.accounts },
    }),
    models.patients.countDocuments({
      subjectCode: { $in: fixtureNames.subjects },
    }),
    models.visits.countDocuments({
      visitCode: { $in: fixtureNames.visits },
    }),
  ]);
  if (users + patients + visits !== 0) {
    fail('B14_NAMESPACE_EXISTS', 'The exact B14 namespace is already in use');
  }
}

async function createUsers(
  namespace: string,
  password: string,
  models: Models,
  auth: AuthService,
) {
  const accountNames = names(namespace).accounts;
  const passwordHashes = await Promise.all(
    accountNames.map(() => auth.hashPassword(password)),
  );
  const created = await Promise.all(
    (['doctor', 'nurse'] as const).map((role, index) =>
      models.users.create({
        accountName: accountNames[index],
        displayName: role === 'doctor' ? 'B14 测试医生' : 'B14 测试护士',
        staffCode: `B14FX-${namespace}-${role}`,
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
  ordinal: number;
  models: Models;
  doctor: AuthenticatedUserContext;
}): Promise<Root> {
  const { namespace, ordinal, models, doctor } = input;
  const fixtureNames = names(namespace);
  const subjectCode = fixtureNames.subjects[ordinal - 1];
  const suffix = `${namespace.toUpperCase()}-0${ordinal}`;
  const assessmentDate = new Date('2026-08-01T01:00:00.000Z');
  const completedAt = new Date('2026-08-01T02:00:00.000Z');
  const confirmedAt = new Date('2026-08-01T02:30:00.000Z');
  const doctorId = new Types.ObjectId(doctor.id);
  const scoreMetrics = { scoreValue: 1, maxScore: 1, minScore: 0 };
  const scoreOrigin = {
    scoreStatus: 'manual_scored',
    scoreSource: 'operator',
  } as const;
  const unlocked = { lockedAt: null, voidedAt: null };
  const patient = await models.patients.create({
    subjectCode,
    displayName: `B14 脱敏受试者 ${ordinal}`,
    sourceType: 'clinical',
    sex: 'unknown',
    handedness: 'unknown',
    status: 'active',
    tags: [],
  });
  const visit = await models.visits.create({
    patientId: patient._id,
    subjectCode,
    visitCode: fixtureNames.visits[ordinal - 1],
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
    subjectCode,
    scaleDefinitionId,
    scaleVersionId,
    scaleCode: 'moca',
    scaleVersion: '1.0',
  };
  const instance = await models.instances.create({
    assessmentVisitId: visit._id,
    patientId: patient._id,
    subjectCode,
    scaleDefinitionId,
    scaleVersionId,
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: `B14-${suffix}-INST`,
    instanceNo: 1,
    status: 'completed',
    administrationMode: 'clinician_administered',
    completedAt,
    ...unlocked,
    versionTrace: {
      crfVersion: 'b14-crf-1.0',
      scoringRuleVersion: 'b14-score-1.0',
      fieldEncodingVersion: 'b14-field-1.0',
      sourceDocument: 'b14-deidentified-source',
    },
  });
  const item = await models.items.create({
    ...sourceIds,
    scaleInstanceId: instance._id,
    instanceCode: instance.instanceCode,
    itemCode: `moca.b14.fixture.item.${ordinal}`,
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
    scoreResultCode: `B14-${suffix}-SCR`,
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
    domainResultCode: `B14-${suffix}-CDR`,
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
    subjectCode,
    reportCode: `B14-${suffix}-RPT`,
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
      operatorName: doctor.displayName,
      operatorRole: 'doctor',
      clinicalContext: null,
    },
    scaleTraces: [
      {
        scaleInstanceId: instance._id,
        scaleCode: 'moca',
        scaleVersion: '1.0',
        crfVersion: 'b14-crf-1.0',
        scoringRuleVersion: 'b14-score-1.0',
        fieldEncodingVersion: 'b14-field-1.0',
        domainMappingVersion: 'a19-item-domain-codes-1.0',
        sourceDocument: 'b14-deidentified-source',
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
      scoreSummary: 'B14 safe score summary',
      domainSummary: 'B14 safe domain summary',
      evidenceSummary: 'B14 safe evidence summary',
      trendSummary: 'B14 safe trend summary',
      recommendationText: 'B14 safe recommendation',
      doctorOpinion: 'B14 safe doctor opinion',
      limitations: 'B14 safe limitations',
    },
    aiDraft: { status: 'not_requested', doctorEdited: false },
    confirmation: {
      confirmedAt,
      confirmedBy: doctorId,
      confirmedByName: doctor.displayName,
      confirmedByRole: 'doctor',
      confirmationNote: CONFIRMATION_NOTE,
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
        submittedAt: new Date('2026-08-01T02:15:00.000Z'),
        submittedBy: doctor.id,
        submittedByName: doctor.displayName,
        submittedByRole: 'doctor',
        submissionNote: 'B14 脱敏提交说明',
      },
      a21Confirmation: {
        version: 1,
        confirmationId: randomUUID(),
        confirmedAt,
        confirmedBy: doctor.id,
        confirmedByName: doctor.displayName,
        confirmedByRole: 'doctor',
        confirmationNote: CONFIRMATION_NOTE,
      },
    },
  });
  return {
    patientId: patient.id,
    visitId: visit.id,
    reportId: report.id,
  };
}

async function runA22A23A24(input: {
  root: Root;
  archived: boolean;
  doctor: AuthenticatedUserContext;
  reports: ReportsService;
  lock: ClinicalReportLockWorkflowService;
  freeze: ClinicalReportSourceFreezeWorkflowService;
  archive: ClinicalReportArchiveWorkflowService;
}): Promise<void> {
  const { root, archived, doctor, reports, lock, freeze, archive } = input;
  let report = await reports.findReportByOwnership({
    reportId: root.reportId,
    patientId: root.patientId,
    assessmentVisitId: root.visitId,
  });
  if (!report?.updatedAt) {
    fail('B14_A22_PREREQUISITE_MISSING', 'Report cannot enter A22');
  }
  const lockResult = await lock.lockClinicalReport(
    root.patientId,
    root.visitId,
    root.reportId,
    doctor,
    {
      confirm: true,
      lockNote: LOCK_NOTE,
      expectedUpdatedAt: report.updatedAt.toISOString(),
    },
  );
  if (lockResult.lockReceipt.alreadyLocked || !lockResult.report.lockedAt) {
    fail('B14_A22_FAILED', 'Production A22 workflow did not lock once');
  }
  report = await reports.findReportByOwnership({
    reportId: root.reportId,
    patientId: root.patientId,
    assessmentVisitId: root.visitId,
  });
  if (!report?.updatedAt) {
    fail('B14_A23_PREREQUISITE_MISSING', 'Report cannot enter A23');
  }
  const freezeResult = await freeze.freezeClinicalReportSources(
    root.patientId,
    root.visitId,
    root.reportId,
    doctor,
    {
      confirm: true,
      freezeNote: FREEZE_NOTE,
      expectedUpdatedAt: report.updatedAt.toISOString(),
    },
  );
  if (
    freezeResult.sourceFreezeReceipt.alreadyFrozen ||
    freezeResult.sourceFreezeReceipt.resumedExisting ||
    freezeResult.report.sourceFreeze?.state !== 'completed'
  ) {
    fail('B14_A23_FAILED', 'Production A23 workflow did not freeze once');
  }
  if (!archived) return;
  report = await reports.findReportByOwnership({
    reportId: root.reportId,
    patientId: root.patientId,
    assessmentVisitId: root.visitId,
  });
  if (!report?.updatedAt) {
    fail('B14_A24_PREREQUISITE_MISSING', 'Report cannot enter A24');
  }
  const archiveResult = await archive.archiveClinicalReport(
    root.patientId,
    root.visitId,
    root.reportId,
    doctor,
    {
      confirm: true,
      archiveNote: ARCHIVE_NOTE,
      expectedUpdatedAt: report.updatedAt.toISOString(),
    },
  );
  if (
    archiveResult.archiveReceipt.alreadyArchived ||
    archiveResult.report.status !== 'archived'
  ) {
    fail('B14_A24_FAILED', 'Production A24 workflow did not archive once');
  }
}

async function loadFacts(root: Root, models: Models) {
  const ownership = {
    patientId: new Types.ObjectId(root.patientId),
    assessmentVisitId: new Types.ObjectId(root.visitId),
  };
  const [report, patient, visit, instances, items, scores, domains, media] =
    await Promise.all([
      models.reports.findById(root.reportId),
      models.patients.findById(root.patientId),
      models.visits.findById(root.visitId),
      models.instances.find(ownership).sort({ _id: 1 }),
      models.items.find(ownership).sort({ _id: 1 }),
      models.scores.find(ownership).sort({ _id: 1 }),
      models.domains.find(ownership).sort({ _id: 1 }),
      models.media.find(ownership).sort({ _id: 1 }),
    ]);
  if (!report || !patient || !visit) {
    fail('B14_FACTS_MISSING', 'Fixture business facts are missing');
  }
  const reportFacts = documentFacts(report);
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
  const independentA24AuditLogCount = await models.reports.db
    .collection('audit_logs')
    .countDocuments({
      $or: [
        { reportId: report._id },
        { clinicalReportId: report._id },
        { resourceId: report._id },
      ],
    });
  return {
    report,
    patient,
    visit,
    instances,
    items,
    scores,
    domains,
    media,
    baseline: {
      status: report.status as 'confirmed' | 'archived',
      reportBusinessFactsHash: hash(reportFacts),
      patientVisitFactsHash: hash([
        documentFacts(patient),
        documentFacts(visit),
      ]),
      sourceFactsHash: hash(sourceFacts),
      sourceIdsHash: hash(sourceIds),
      lockFactsHash: hash({
        lockedAt: report.lockedAt,
        lockedBy: report.lockedBy,
        a22Lock: (reportFacts.metadata as Record<string, unknown>).a22Lock,
      }),
      sourceFreezeFactsHash: hash(
        (reportFacts.metadata as Record<string, unknown>).a23SourceFreeze,
      ),
      archiveFactsHash: report.archivedAt
        ? hash({
            archivedAt: report.archivedAt,
            archivedBy: report.archivedBy,
            a24Archive: (reportFacts.metadata as Record<string, unknown>)
              .a24Archive,
          })
        : null,
      confirmationFactsHash: hash({
        confirmation: report.confirmation,
        a21Confirmation: (reportFacts.metadata as Record<string, unknown>)
          .a21Confirmation,
      }),
      auditLogRefsHash: hash(report.auditLogRefs),
      independentA24AuditLogCount,
    },
  };
}

async function snapshot(root: Root, models: Models): Promise<Scenario> {
  const facts = await loadFacts(root, models);
  if (facts.baseline.independentA24AuditLogCount !== 0) {
    fail('B14_A24_AUDIT_LOG_PRESENT', 'Expected no independent A24 AuditLog');
  }
  return {
    ...root,
    navigationPath: `/patients/${root.patientId}/visits/${root.visitId}`,
    preparedBaseline: {
      ...facts.baseline,
      independentA24AuditLogCount: 0,
    },
  };
}

function sameIds(expected: readonly string[], actual: readonly string[]) {
  return [...expected].sort().join(',') === [...actual].sort().join(',');
}

async function assertScenario(
  key: Key,
  scenario: Scenario,
  reports: ReportsService,
  models: Models,
): Promise<void> {
  const report = await reports.findReportByOwnership({
    reportId: scenario.reportId,
    patientId: scenario.patientId,
    assessmentVisitId: scenario.visitId,
  });
  if (!report) fail('B14_SCENARIO_MISSING', `${key} is missing`);
  const facts = await loadFacts(scenario, models);
  const lock = resolveExistingClinicalReportLock(report);
  const freeze = resolveExistingSourceFreeze(report);
  const archive = resolveExistingClinicalReportArchive(report);
  const metadata = report.metadata as Record<string, unknown>;
  const a21 = metadata.a21Confirmation as Record<string, unknown>;
  const a22 = metadata.a22Lock as Record<string, unknown>;
  const a23 = metadata.a23SourceFreeze as Record<string, unknown>;
  const actualScope = buildClinicalReportSourceFreezeScope(
    report,
    facts.items.map((item) => item.id),
  );
  const actualCounts = buildClinicalReportSourceFreezeCounts(actualScope);
  const expectedStatus = key === 'archive-ready' ? 'confirmed' : 'archived';
  const confirmationSafe = Boolean(
    report.confirmation?.confirmedAt &&
    report.confirmation.confirmedBy &&
    report.confirmation.confirmedByName &&
    report.confirmation.confirmedByRole === 'doctor' &&
    report.confirmation.confirmationNote === CONFIRMATION_NOTE &&
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
    lock.lockNote === LOCK_NOTE &&
    a22.version === 1 &&
    a22.lockId === lock.lockId,
  );
  const freezeSafe = Boolean(
    freeze?.state === 'completed' &&
    freeze.completedAt &&
    freeze.completedBy &&
    freeze.completedByName &&
    freeze.completedByRole === 'doctor' &&
    freeze.freezeNote === FREEZE_NOTE &&
    freeze.completedBy === freeze.startedBy &&
    freeze.completedCounts &&
    freeze.newlyFrozenCounts &&
    hash(freeze.scope) === hash(actualScope) &&
    hash(freeze.expectedCounts) === hash(actualCounts) &&
    hash(freeze.completedCounts) === hash(actualCounts) &&
    freeze.previouslyFrozenCounts.totalSourceCount === 0 &&
    a23.version === 1 &&
    a23.state === 'completed' &&
    a23.freezeId === freeze.freezeId,
  );
  const frozenAt = freeze?.sourceLockedAt.toISOString();
  const sourceSafe = Boolean(
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
  const common = Boolean(
    report.status === expectedStatus &&
    report.reportType === 'cognitive_assessment' &&
    report.reportVersion === 1 &&
    report.source === 'mixed' &&
    report.qualityStatus === 'passed' &&
    report.narrative?.chiefSummary === MARKER &&
    report.scaleTraces.length === 1 &&
    report.scoreSnapshots.length === 1 &&
    report.domainSnapshots.length === 1 &&
    report.evidenceSnapshots.length === 0 &&
    report.correctionRecords.length === 0 &&
    report.voidedAt === null &&
    report.auditLogRefs.length === 0 &&
    facts.patient.id === scenario.patientId &&
    facts.visit.id === scenario.visitId &&
    facts.visit.patientId.toString() === scenario.patientId,
  );
  const archiveSafe =
    key === 'archive-ready'
      ? report.archivedAt === null &&
        report.archivedBy === null &&
        archive === null &&
        metadata.a24Archive === undefined
      : Boolean(
          report.archivedAt &&
          report.archivedBy &&
          archive?.archiveId &&
          archive.archiveNote === ARCHIVE_NOTE &&
          archive.archivedAt.getTime() === report.archivedAt.getTime() &&
          archive.archivedBy.operatorId === report.archivedBy &&
          archive.archivedBy.operatorRole === 'doctor' &&
          archive.sourceFreezeId === freeze?.freezeId &&
          archive.sourceFreezeCompletedAt?.getTime() ===
            freeze?.completedAt?.getTime() &&
          (metadata.a24Archive as Record<string, unknown>).version === 1,
        );
  if (
    !common ||
    !confirmationSafe ||
    !lockSafe ||
    !freezeSafe ||
    !sourceSafe ||
    !archiveSafe ||
    facts.baseline.independentA24AuditLogCount !== 0 ||
    JSON.stringify(facts.baseline) !== JSON.stringify(scenario.preparedBaseline)
  ) {
    fail('B14_SCENARIO_INVALID', `${key} or its baseline is invalid`);
  }
}

async function assertNamespace(
  namespace: string,
  models: Models,
): Promise<void> {
  const fixtureNames = names(namespace);
  const [users, patients, visits] = await Promise.all([
    models.users.find({ accountName: { $in: fixtureNames.accounts } }),
    models.patients.find({ subjectCode: { $in: fixtureNames.subjects } }),
    models.visits.find({ visitCode: { $in: fixtureNames.visits } }),
  ]);
  const patientIds = patients.map((patient) => patient._id);
  const visitIds = visits.map((visit) => visit._id);
  const ownership = {
    patientId: { $in: patientIds },
    assessmentVisitId: { $in: visitIds },
  };
  const counts = await Promise.all([
    models.reports.countDocuments(ownership),
    models.instances.countDocuments(ownership),
    models.items.countDocuments(ownership),
    models.scores.countDocuments(ownership),
    models.domains.countDocuments(ownership),
    models.media.countDocuments(ownership),
  ]);
  if (
    users.length !== 2 ||
    patients.length !== 2 ||
    visits.length !== 2 ||
    counts.join(',') !== '2,2,2,2,2,0' ||
    visits.some(
      (visit) =>
        !patientIds.some((patientId) => patientId.equals(visit.patientId)),
    )
  ) {
    fail(
      'B14_NAMESPACE_OWNERSHIP_INVALID',
      'B14 namespace ownership is invalid',
    );
  }
}

async function cleanup(namespace: string, path: string, models: Models) {
  const fixtureNames = names(namespace);
  const [users, patients, visits] = await Promise.all([
    models.users.find({ accountName: { $in: fixtureNames.accounts } }),
    models.patients.find({ subjectCode: { $in: fixtureNames.subjects } }),
    models.visits.find({ visitCode: { $in: fixtureNames.visits } }),
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
    models.users.countDocuments({
      accountName: { $in: fixtureNames.accounts },
    }),
    models.patients.countDocuments({
      subjectCode: { $in: fixtureNames.subjects },
    }),
    models.visits.countDocuments({
      visitCode: { $in: fixtureNames.visits },
    }),
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
    fail('B14_CLEANUP_INCOMPLETE', 'Namespace cleanup left records');
  }
  await unlink(path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  });
  return {
    ok: true,
    command: 'cleanup',
    databasePurpose: 'browser_acceptance',
    actualDatabaseName: DB,
    namespace,
    deleted,
    residualCount,
    runtimeDescriptor: 'absent',
  };
}

async function prepare(input: {
  namespace: string;
  password: string;
  path: string;
  models: Models;
  auth: AuthService;
  reports: ReportsService;
  lock: ClinicalReportLockWorkflowService;
  freeze: ClinicalReportSourceFreezeWorkflowService;
  archive: ClinicalReportArchiveWorkflowService;
}) {
  const {
    namespace,
    password,
    path,
    models,
    auth,
    reports,
    lock,
    freeze,
    archive,
  } = input;
  await readFile(path, 'utf8').then(
    () => fail('B14_RUNTIME_EXISTS', 'Use an unused runtime descriptor path'),
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    },
  );
  await assertUnused(namespace, models);
  try {
    const users = await createUsers(namespace, password, models, auth);
    const doctor = actor(users.doctor);
    const readyRoot = await createConfirmedChain({
      namespace,
      ordinal: 1,
      models,
      doctor,
    });
    const completedRoot = await createConfirmedChain({
      namespace,
      ordinal: 2,
      models,
      doctor,
    });
    await runA22A23A24({
      root: readyRoot,
      archived: false,
      doctor,
      reports,
      lock,
      freeze,
      archive,
    });
    await runA22A23A24({
      root: completedRoot,
      archived: true,
      doctor,
      reports,
      lock,
      freeze,
      archive,
    });
    const scenarios = {
      'archive-ready': await snapshot(readyRoot, models),
      'archive-completed': await snapshot(completedRoot, models),
    } satisfies Record<Key, Scenario>;
    const descriptor: Descriptor = {
      schemaVersion: 1,
      batch: 'B14',
      profile: PROFILE,
      namespace,
      accounts: {
        doctor: { loginIdentifier: users.doctor.accountName },
        nurse: { loginIdentifier: users.nurse.accountName },
      },
      scenarios,
    };
    await writeDescriptor(path, descriptor, password);
    await assertNamespace(namespace, models);
    for (const key of KEYS) {
      await assertScenario(key, scenarios[key], reports, models);
    }
    return {
      ok: true,
      command: 'prepare',
      databasePurpose: 'browser_acceptance',
      actualDatabaseName: DB,
      namespace,
      accounts: { doctor: 'prepared', nurse: 'prepared' },
      scenarios: {
        archiveReady: 'production_a22_a23',
        archiveCompleted: 'production_a22_a23_a24',
      },
      runtimeDescriptor: 'written_without_secrets_or_internal_scope',
    };
  } catch (error: unknown) {
    await cleanup(namespace, path, models).catch(() => undefined);
    throw error;
  }
}

async function verify(input: {
  phase: Phase;
  namespace: string;
  password: string;
  path: string;
  models: Models;
  auth: AuthService;
  reports: ReportsService;
}) {
  const { phase, namespace, password, path, models, auth, reports } = input;
  const descriptor = await readDescriptor(path);
  assertDescriptorSafety(descriptor, password);
  if (descriptor.namespace !== namespace) {
    fail('B14_NAMESPACE_MISMATCH', 'Runtime namespace mismatch');
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
    fail('B14_ACCOUNTS_INVALID', 'Doctor or nurse account contract failed');
  }
  await assertNamespace(namespace, models);
  for (const key of KEYS) {
    await assertScenario(key, descriptor.scenarios[key], reports, models);
  }
  return {
    ok: true,
    command: 'verify',
    phase,
    databasePurpose: 'browser_acceptance',
    actualDatabaseName: DB,
    namespace,
    accountRoles: { doctor: 'doctor', nurse: 'nurse' },
    scenarios: {
      archiveReady: 'unchanged',
      archiveCompleted: 'unchanged',
    },
    businessBaseline:
      'report_patient_visit_sources_metadata_snapshots_audit_boundaries_matched',
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
      code: known ? error.code : 'B14_FIXTURE_OPERATION_FAILED',
      message: known
        ? error.message
        : 'B14 fixture operation failed without exposing internal details',
    }),
  );
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    const parsed = parseCommand();
    const namespace = required('B14_U01_NAMESPACE');
    if (!/^[a-z0-9][a-z0-9-]{2,19}$/.test(namespace)) {
      fail('B14_NAMESPACE_INVALID', 'Namespace format is invalid');
    }
    const path = required('B14_U01_RUNTIME_PATH');
    const password =
      parsed.command === 'cleanup'
        ? ''
        : required('B14_U01_FIXTURE_PASSWORD', 16);
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
            namespace,
            password,
            path,
            models: registry,
            auth: app.get(AuthService),
            reports: app.get(ReportsService),
            lock: app.get(ClinicalReportLockWorkflowService),
            freeze: app.get(ClinicalReportSourceFreezeWorkflowService),
            archive: app.get(ClinicalReportArchiveWorkflowService),
          })
        : parsed.command === 'verify'
          ? await verify({
              phase: parsed.phase!,
              namespace,
              password,
              path,
              models: registry,
              auth: app.get(AuthService),
              reports: app.get(ReportsService),
            })
          : await cleanup(namespace, path, registry);
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
