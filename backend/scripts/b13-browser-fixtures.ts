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
import { Session, type SessionDocument } from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
import type { AuthenticatedUserContext } from '../src/modules/auth/types/auth-user-context.type';
// prettier-ignore
import { AssessmentVisit, type AssessmentVisitDocument } from '../src/modules/assessments/schemas/assessment-visit.schema';
// prettier-ignore
import { ItemResponse, type ItemResponseDocument } from '../src/modules/assessments/schemas/item-response.schema';
// prettier-ignore
import { ScaleInstance, type ScaleInstanceDocument } from '../src/modules/assessments/schemas/scale-instance.schema';
// prettier-ignore
import { CognitiveDomainResult, type CognitiveDomainResultDocument } from '../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
// prettier-ignore
import { MediaEvidence, type MediaEvidenceDocument } from '../src/modules/media/schemas/media-evidence.schema';
// prettier-ignore
import { Patient, type PatientDocument } from '../src/modules/patients/schemas/patient.schema';
import {
  buildClinicalReportSourceFreezeCounts,
  buildClinicalReportSourceFreezeScope,
  buildSourceFreezeStartMetadata,
  evaluateClinicalReportSourceFreezeReadiness,
  resolveExistingSourceFreeze,
} from '../src/modules/reports/lib/clinical-report-source-freeze';
// prettier-ignore
import { ClinicalReport, type ClinicalReportDocument } from '../src/modules/reports/schemas/clinical-report.schema';
import { ClinicalReportLockWorkflowService } from '../src/modules/reports/services/clinical-report-lock-workflow.service';
import { ClinicalReportSourceFreezeWorkflowService } from '../src/modules/reports/services/clinical-report-source-freeze-workflow.service';
import { ReportsService } from '../src/modules/reports/services/reports.service';
import type { ClinicalReportSourceFreezeMetadata } from '../src/modules/reports/types/clinical-report-source-freeze.types';
// prettier-ignore
import { ScoreResult, type ScoreResultDocument } from '../src/modules/scoring/schemas/score-result.schema';
// prettier-ignore
import { User, type UserDocument } from '../src/modules/users/schemas/user.schema';

type Command = 'prepare' | 'verify' | 'cleanup';
type Phase = 'prepared' | 'post-browser' | 'u02-post-freeze';
// prettier-ignore
type Key = 'source-freeze-null' | 'source-freeze-in-progress' | 'source-freeze-completed';
type Root = { patientId: string; visitId: string; reportId: string };
// prettier-ignore
type Baseline = Root & {
  navigationPath: string; preparedBaseline: {
    updatedAt: string; sourceFreezeState: 'in_progress' | 'completed' | null;
    freezeIdHash: string | null; freezeNoteHash: string | null; countsHash: string | null;
    status: string; lockedAt: string; archivedAt: null;
    reportProtectedFactsHash: string; sourceImmutableFactsHash: string;
    patientVisitProtectedStateHash: string; auditLogRefsHash: string;
  };
};
// prettier-ignore
type Descriptor = {
  schemaVersion: 1; batch: 'B13'; profile: 'B13-P1-entry-persisted-states'; namespace: string;
  accounts: Record<'doctor' | 'nurse', { loginIdentifier: string }>;
  scenarios: Record<Key, Baseline>;
};
// prettier-ignore
type Models = {
  users: Model<UserDocument>; sessions: Model<SessionDocument>;
  patients: Model<PatientDocument>; visits: Model<AssessmentVisitDocument>;
  instances: Model<ScaleInstanceDocument>; items: Model<ItemResponseDocument>;
  scores: Model<ScoreResultDocument>; domains: Model<CognitiveDomainResultDocument>;
  media: Model<MediaEvidenceDocument>; reports: Model<ClinicalReportDocument>;
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
const PROFILE = 'B13-P1-entry-persisted-states' as const;
const MARKER = 'B13-U01 synthetic readable report marker.';
const IN_PROGRESS_NOTE = 'B13 U01 脱敏未完成来源冻结说明';
const COMPLETED_NOTE = 'B13 U01 脱敏已完成来源冻结说明';
const U02_NOTE = 'B13 U02 脱敏首次来源冻结说明';
const KEYS: readonly Key[] = [
  'source-freeze-null',
  'source-freeze-in-progress',
  'source-freeze-completed',
];

function fail(code: string, message: string): never {
  throw new FixtureError(code, message);
}

function required(name: string, minimum = 1): string {
  const value = process.env[name];
  if (!value || value.length < minimum)
    fail(`B13_${name}_INVALID`, `${name} is invalid`);
  return value;
}

function parseCommand(): { command: Command; phase?: Phase } {
  const [command, phase, extra] = process.argv.slice(2);
  if (!['prepare', 'verify', 'cleanup'].includes(command) || extra) {
    fail(
      'B13_COMMAND_INVALID',
      'Use prepare, verify prepared|post-browser|u02-post-freeze, or cleanup',
    );
  }
  if (
    command === 'verify' &&
    !['prepared', 'post-browser', 'u02-post-freeze'].includes(phase)
  ) {
    fail(
      'B13_PHASE_INVALID',
      'verify requires prepared, post-browser, or u02-post-freeze',
    );
  }
  if (command !== 'verify' && phase)
    fail('B13_ARGUMENT_INVALID', 'Unexpected fixture argument');
  if (command === 'cleanup' && process.env.B13_U01_CONFIRM_CLEANUP !== '1') {
    fail(
      'B13_CLEANUP_CONFIRMATION_REQUIRED',
      'cleanup requires explicit confirmation',
    );
  }
  return { command: command as Command, phase: phase as Phase | undefined };
}

function names(namespace: string) {
  const upper = namespace.toUpperCase();
  return {
    accounts: [
      `b13fx-${namespace}-doctor`,
      `b13fx-${namespace}-nurse`,
    ] as const,
    subjects: [1, 2, 3].map((n) => `B13-${upper}-0${n}`),
    visits: [1, 2, 3].map((n) => `B13-${upper}-0${n}-VISIT`),
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

function countHash(freeze: ClinicalReportSourceFreezeMetadata): string {
  return hash({
    expected: freeze.expectedCounts,
    completed: freeze.completedCounts ?? null,
    newlyFrozen: freeze.newlyFrozenCounts ?? null,
    previouslyFrozen: freeze.previouslyFrozenCounts,
  });
}

function documentFacts(
  document: unknown,
  omitted: readonly string[] = [],
): Record<string, unknown> {
  const value = (document as { toObject(): unknown }).toObject() as Record<
    string,
    unknown
  >;
  for (const key of omitted) delete value[key];
  return value;
}

async function protectedFacts(root: Root, models: Models) {
  const ownership = {
    patientId: new Types.ObjectId(root.patientId),
    assessmentVisitId: new Types.ObjectId(root.visitId),
  };
  // prettier-ignore
  const [report, patient, visit, instances, items, scores, domains, media] = await Promise.all([
    models.reports.findById(root.reportId), models.patients.findById(root.patientId), models.visits.findById(root.visitId),
    models.instances.find(ownership).sort({ _id: 1 }), models.items.find(ownership).sort({ _id: 1 }),
    models.scores.find(ownership).sort({ _id: 1 }), models.domains.find(ownership).sort({ _id: 1 }), models.media.find(ownership).sort({ _id: 1 }),
  ]);
  if (!report || !patient || !visit)
    fail('B13_PROTECTED_FACTS_MISSING', 'Protected fixture facts are missing');
  const reportFacts = documentFacts(report, [
    '__v',
    'updatedAt',
    'auditLogRefs',
  ]);
  if (reportFacts.metadata && typeof reportFacts.metadata === 'object') {
    reportFacts.metadata = {
      ...(reportFacts.metadata as Record<string, unknown>),
    };
    delete (reportFacts.metadata as Record<string, unknown>).a23SourceFreeze;
  }
  const immutableSourceFacts = [instances, items, scores, domains, media].map(
    (documents) =>
      documents.map((document) =>
        documentFacts(document, ['__v', 'status', 'lockedAt', 'updatedAt']),
      ),
  );
  return {
    reportProtectedFactsHash: hash(reportFacts),
    sourceImmutableFactsHash: hash(immutableSourceFacts),
    patientVisitProtectedStateHash: hash([
      documentFacts(patient, ['__v']),
      documentFacts(visit, ['__v']),
    ]),
    auditLogRefsHash: hash(report.auditLogRefs),
  };
}

async function readDescriptor(path: string): Promise<Descriptor> {
  let value: Partial<Descriptor>;
  try {
    value = JSON.parse(await readFile(path, 'utf8')) as Partial<Descriptor>;
  } catch {
    fail('B13_RUNTIME_UNAVAILABLE', 'Safe runtime descriptor is unavailable');
  }
  if (
    value.schemaVersion !== 1 ||
    value.batch !== 'B13' ||
    value.profile !== PROFILE ||
    !value.namespace ||
    !value.accounts ||
    !value.scenarios
  ) {
    fail('B13_RUNTIME_INVALID', 'Safe runtime descriptor is invalid');
  }
  return value as Descriptor;
}

async function writeDescriptor(path: string, value: Descriptor): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
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
      'B13_RUNTIME_GATE_FAILED',
      'Fixture runtime is not the isolated Browser environment',
    );
  }
}

async function assertUnused(namespace: string, models: Models): Promise<void> {
  const ids = names(namespace);
  const [users, patients, visits] = await Promise.all([
    models.users.find({ accountName: { $in: ids.accounts } }),
    models.patients.find({ subjectCode: { $in: ids.subjects } }),
    models.visits.find({ visitCode: { $in: ids.visits } }),
  ]);
  if (users.length + patients.length + visits.length !== 0) {
    fail('B13_NAMESPACE_EXISTS', 'The exact B13 namespace is already in use');
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
  // prettier-ignore
  const created = await Promise.all(
    (['doctor', 'nurse'] as const).map((role, index) =>
      models.users.create({
        accountName: accountNames[index], displayName: role === 'doctor' ? 'B13 测试医生' : 'B13 测试护士',
        staffCode: `B13FX-${namespace}-${role}`, passwordHash: passwordHashes[index],
        passwordChangedAt: new Date(), roles: [role], permissions: [], userType: role,
        status: 'active', failedLoginCount: 0, lockedUntil: null, metadata: null,
      }),
    ),
  );
  return { doctor: created[0], nurse: created[1] };
}

async function createLockedChain(input: {
  namespace: string;
  ordinal: number;
  models: Models;
  doctor: AuthenticatedUserContext;
  reports: ReportsService;
  lock: ClinicalReportLockWorkflowService;
}): Promise<Root> {
  const { namespace, ordinal, models, doctor, reports, lock } = input;
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
  // Schema-complete synthetic rows stay compact to preserve the single-file gate.
  // prettier-ignore
  const patient: PatientDocument = await models.patients.create({
    subjectCode, displayName: `B13 脱敏受试者 ${ordinal}`, sourceType: 'clinical',
    sex: 'unknown', handedness: 'unknown', status: 'active', tags: [],
  });
  // prettier-ignore
  const visit: AssessmentVisitDocument = await models.visits.create({
    patientId: patient._id, subjectCode, visitCode: fixtureNames.visits[ordinal - 1],
    visitType: 'baseline', status: 'completed', assessmentDate, startedAt: assessmentDate,
    completedAt, lockedAt: null, voidedAt: null,
    operatorSnapshot: { operatorId: doctorId, operatorName: doctor.displayName, operatorRole: 'doctor' },
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
  // prettier-ignore
  const instance: ScaleInstanceDocument = await models.instances.create({
    assessmentVisitId: visit._id, patientId: patient._id, subjectCode,
    scaleDefinitionId, scaleVersionId, scaleCode: 'moca', scaleVersion: '1.0',
    instanceCode: `B13-${suffix}-INST`, instanceNo: 1, status: 'completed',
    administrationMode: 'clinician_administered', completedAt, ...unlocked,
    versionTrace: { crfVersion: 'b13-crf-1.0', scoringRuleVersion: 'b13-score-1.0',
      fieldEncodingVersion: 'b13-field-1.0', sourceDocument: 'b13-deidentified-source' },
  });
  // prettier-ignore
  const item: ItemResponseDocument = await models.items.create({
    ...sourceIds, scaleInstanceId: instance._id, instanceCode: instance.instanceCode,
    itemCode: `moca.b13.fixture.item.${ordinal}`, itemOrder: 1, responseType: 'text',
    countsTowardTotal: true, cognitiveDomainCodes: ['memory'], itemConfigSnapshot: null,
    versionTrace: { scaleVersion: '1.0' }, status: 'answered',
    answerSource: 'clinician_recorded', rawResponse: 'de-identified fixture response',
    structuredResponse: null, isMissing: false, ...unlocked,
    score: { ...scoreMetrics, ...scoreOrigin, scoredAt: confirmedAt, scoredBy: doctorId },
  });
  // prettier-ignore
  const score: ScoreResultDocument = await models.scores.create({
    ...sourceIds, scaleInstanceId: instance._id, instanceCode: instance.instanceCode,
    scoreResultCode: `B13-${suffix}-SCR`, runNo: 1, status: 'confirmed',
    scoringSource: 'manual', scoringMode: 'manual_summary', versionTrace: { scaleVersion: '1.0' },
    totalScore: { ...scoreMetrics, scorePercent: 100, scoredItemCount: 1,
      totalItemCount: 1, unscoredItemCount: 0, missingItemCount: 0, needsReviewItemCount: 0 },
    itemScores: [{ itemResponseId: item._id, itemCode: item.itemCode, itemOrder: 1,
      responseType: 'text', countsTowardTotal: true, includedInTotal: true,
      ...scoreMetrics, ...scoreOrigin, isMissing: false, cognitiveDomainCodes: ['memory'] }],
    computation: { computedAt: confirmedAt, computedBy: doctorId,
      inputItemCount: 1, includedItemCount: 1, excludedItemCount: 0, warningCount: 0 },
    review: { reviewStatus: 'reviewed', reviewedAt: confirmedAt,
      reviewerId: doctorId, reviewerName: doctor.displayName },
    qualityStatus: 'passed', confirmedAt, ...unlocked,
  });
  // prettier-ignore
  const domain: CognitiveDomainResultDocument = await models.domains.create({
    ...sourceIds, scaleInstanceId: instance._id, scoreResultId: score._id,
    instanceCode: instance.instanceCode, domainResultCode: `B13-${suffix}-CDR`,
    runNo: 1, status: 'computed', mappingSource: 'scale_config',
    mappingMode: 'item_domain_codes', versionTrace: { scaleVersion: '1.0' },
    domainScores: [{ domainCode: 'memory', ...scoreMetrics, scorePercent: 100,
      itemCount: 1, scoredItemCount: 1, unscoredItemCount: 0, missingItemCount: 0,
      needsReviewItemCount: 0, excludedItemCount: 0 }],
    itemContributions: [{ itemResponseId: item._id, scoreResultId: score._id,
      itemCode: item.itemCode, itemOrder: 1, domainCode: 'memory', weight: 1,
      countsTowardDomain: true, scoreValue: 1, maxScore: 1,
      weightedScore: 1, weightedMaxScore: 1, ...scoreOrigin, isMissing: false }],
    mappingSnapshot: { mappingVersion: 'a19-item-domain-codes-1.0',
      mappingSource: 'scale_config', domainCodes: ['memory'], mappingRules: null },
    computation: { computedAt: confirmedAt, computedBy: doctorId, inputItemCount: 1,
      contributionCount: 1, domainCount: 1, includedContributionCount: 1,
      excludedContributionCount: 0, warningCount: 0 },
    review: { reviewStatus: 'not_required' }, qualityStatus: 'unchecked', ...unlocked,
  });
  // prettier-ignore
  const report: ClinicalReportDocument = await models.reports.create({
    patientId: patient._id, assessmentVisitId: visit._id,
    primaryScaleInstanceIds: [instance._id], scoreResultIds: [score._id],
    cognitiveDomainResultIds: [domain._id], mediaEvidenceIds: [], subjectCode,
    reportCode: `B13-${suffix}-RPT`, reportType: 'cognitive_assessment',
    status: 'confirmed', reportVersion: 1, source: 'mixed',
    patientSnapshot: { subjectCode, displayName: patient.displayName, sex: 'unknown',
      birthDate: null, educationYears: null },
    visitSnapshot: { visitCode: visit.visitCode, visitType: 'baseline', assessmentDate,
      operatorName: doctor.displayName, operatorRole: 'doctor', clinicalContext: null },
    scaleTraces: [{ scaleInstanceId: instance._id, scaleCode: 'moca', scaleVersion: '1.0',
      crfVersion: 'b13-crf-1.0', scoringRuleVersion: 'b13-score-1.0',
      fieldEncodingVersion: 'b13-field-1.0', domainMappingVersion: 'a19-item-domain-codes-1.0',
      sourceDocument: 'b13-deidentified-source' }],
    scoreSnapshots: [{ scoreResultId: score._id, scaleCode: 'moca', scaleVersion: '1.0',
      totalScoreValue: 1, totalMaxScore: 1, totalMinScore: 0, scorePercent: 100,
      scoreStatus: 'confirmed', qualityStatus: 'passed', scoreDetails: null }],
    domainSnapshots: [{ cognitiveDomainResultId: domain._id, scaleCode: 'moca',
      domainCode: 'memory', scoreValue: 1, maxScore: 1, scorePercent: 100,
      weightedScore: 1, weightedMaxScore: 1, itemCount: 1, needsReviewItemCount: 0 }],
    evidenceSnapshots: [],
    narrative: { chiefSummary: MARKER, scoreSummary: 'B13 safe score summary',
      domainSummary: 'B13 safe domain summary', evidenceSummary: 'B13 safe evidence summary',
      trendSummary: 'B13 safe trend summary', recommendationText: 'B13 safe recommendation',
      doctorOpinion: 'B13 safe doctor opinion', limitations: 'B13 safe limitations' },
    aiDraft: { status: 'not_requested', doctorEdited: false },
    confirmation: { confirmedAt, confirmedBy: doctorId, confirmedByName: doctor.displayName,
      confirmedByRole: 'doctor', confirmationNote: 'B13 de-identified confirmation note' },
    lockedAt: null, lockedBy: null, archivedAt: null, archivedBy: null,
    correctionRecords: [], voidedAt: null, voidedBy: null, auditLogRefs: [],
    qualityStatus: 'passed', qualityHints: null,
    metadata: {
      a20Generation: { version: 1, generationId: randomUUID(), generatedAt: completedAt,
        generatedBy: doctor.id, generatedByName: doctor.displayName,
        generatedByRole: 'doctor', engineVersion: 'a20-clinical-report-draft-1.0',
        reportScope: 'explicit_primary_scale_instances',
        primaryScaleInstanceIds: [instance._id.toString()], scoreResultIds: [score._id.toString()],
        cognitiveDomainResultIds: [domain._id.toString()], mediaEvidenceCount: 0, aiUsed: false },
      a21Submission: { version: 1, submissionId: randomUUID(),
        submittedAt: new Date('2026-08-01T02:15:00.000Z'), submittedBy: doctor.id,
        submittedByName: doctor.displayName, submittedByRole: 'doctor',
        submissionNote: 'B13 de-identified submission note' },
      a21Confirmation: { version: 1, confirmationId: randomUUID(), confirmedAt,
        confirmedBy: doctor.id, confirmedByName: doctor.displayName,
        confirmedByRole: 'doctor', confirmationNote: 'B13 de-identified confirmation note' },
    },
  });
  const root = {
    patientId: patient.id,
    visitId: visit.id,
    reportId: report.id,
  };
  const current = await reports.findReportByOwnership({
    reportId: root.reportId,
    patientId: root.patientId,
    assessmentVisitId: root.visitId,
  });
  if (!current?.updatedAt)
    fail('B13_A22_PREREQUISITE_MISSING', 'Report cannot enter A22');
  await lock.lockClinicalReport(
    root.patientId,
    root.visitId,
    root.reportId,
    doctor,
    {
      confirm: true,
      lockNote: `B13 U01 production A22 lock ${ordinal}`,
      expectedUpdatedAt: current.updatedAt.toISOString(),
    },
  );
  return root;
}

async function startInProgress(
  root: Root,
  models: Models,
  doctor: AuthenticatedUserContext,
  reports: ReportsService,
) {
  const report = await reports.findReportByOwnership({
    reportId: root.reportId,
    patientId: root.patientId,
    assessmentVisitId: root.visitId,
  });
  if (!report?.updatedAt)
    fail('B13_A23_START_PREREQUISITE_MISSING', 'A23 start report is missing');
  evaluateClinicalReportSourceFreezeReadiness({
    report,
    expectedUpdatedAt: report.updatedAt,
  });
  const items = await models.items.find({
    scaleInstanceId: { $in: report.primaryScaleInstanceIds },
  });
  const scope = buildClinicalReportSourceFreezeScope(
    report,
    items.map((item) => item.id),
  );
  const empty = buildClinicalReportSourceFreezeCounts({
    scaleInstanceIds: [],
    itemResponseIds: [],
    scoreResultIds: [],
    cognitiveDomainResultIds: [],
    mediaEvidenceIds: [],
  });
  const startedAt = new Date();
  const start = buildSourceFreezeStartMetadata({
    report,
    freezeId: randomUUID(),
    startedAt,
    sourceLockedAt: startedAt,
    actor: {
      operatorId: doctor.id,
      operatorName: doctor.displayName,
      operatorRole: 'doctor',
    },
    freezeNote: IN_PROGRESS_NOTE,
    scope,
    previouslyFrozenCounts: empty,
  });
  const started = await reports.startSourceFreezeIfUnmodified({
    reportId: root.reportId,
    patientId: root.patientId,
    assessmentVisitId: root.visitId,
    reportVersion: report.reportVersion,
    expectedUpdatedAt: report.updatedAt,
    metadata: start.metadata,
  });
  if (
    !started ||
    resolveExistingSourceFreeze(started)?.state !== 'in_progress'
  ) {
    fail(
      'B13_A23_START_FAILED',
      'Production A23 atomic start did not persist in_progress',
    );
  }
}

async function completeFreeze(
  root: Root,
  doctor: AuthenticatedUserContext,
  reports: ReportsService,
  workflow: ClinicalReportSourceFreezeWorkflowService,
) {
  const report = await reports.findReportByOwnership({
    reportId: root.reportId,
    patientId: root.patientId,
    assessmentVisitId: root.visitId,
  });
  if (!report?.updatedAt)
    fail('B13_A23_COMPLETE_PREREQUISITE_MISSING', 'A23 report is missing');
  const result = await workflow.freezeClinicalReportSources(
    root.patientId,
    root.visitId,
    root.reportId,
    doctor,
    {
      confirm: true,
      freezeNote: COMPLETED_NOTE,
      expectedUpdatedAt: report.updatedAt.toISOString(),
    },
  );
  if (
    result.report.sourceFreeze?.state !== 'completed' ||
    result.sourceFreezeReceipt.alreadyFrozen ||
    result.sourceFreezeReceipt.resumedExisting
  ) {
    fail(
      'B13_A23_COMPLETE_FAILED',
      'Production A23 workflow did not complete the first freeze',
    );
  }
}

async function snapshot(
  root: Root,
  reports: ReportsService,
  models: Models,
): Promise<Baseline> {
  const report = await reports.findReportByOwnership({
    reportId: root.reportId,
    patientId: root.patientId,
    assessmentVisitId: root.visitId,
  });
  if (!report?.updatedAt || !report.lockedAt)
    fail('B13_BASELINE_MISSING', 'Report baseline is missing');
  const freeze = resolveExistingSourceFreeze(report);
  return {
    ...root,
    navigationPath: `/patients/${root.patientId}/visits/${root.visitId}`,
    preparedBaseline: {
      updatedAt: report.updatedAt.toISOString(),
      sourceFreezeState: freeze?.state ?? null,
      freezeIdHash: freeze ? hash(freeze.freezeId) : null,
      freezeNoteHash: freeze ? hash(freeze.freezeNote) : null,
      countsHash: freeze ? countHash(freeze) : null,
      status: report.status,
      lockedAt: report.lockedAt.toISOString(),
      archivedAt: null,
      ...(await protectedFacts(root, models)),
    },
  };
}

async function assertScenario(
  key: Key,
  baseline: Baseline,
  reports: ReportsService,
  models: Models,
) {
  const report = await reports.findReportByOwnership({
    reportId: baseline.reportId,
    patientId: baseline.patientId,
    assessmentVisitId: baseline.visitId,
  });
  if (!report) fail('B13_SCENARIO_MISSING', `${key} is missing`);
  const freeze = resolveExistingSourceFreeze(report);
  const expected =
    key === 'source-freeze-null'
      ? null
      : key === 'source-freeze-in-progress'
        ? 'in_progress'
        : 'completed';
  const common =
    report.status === 'confirmed' &&
    report.source === 'mixed' &&
    report.qualityStatus === 'passed' &&
    report.confirmation !== null &&
    report.lockedAt !== null &&
    report.archivedAt === null &&
    report.voidedAt === null &&
    report.correctionRecords.length === 0 &&
    report.narrative?.chiefSummary === MARKER &&
    (freeze?.state ?? null) === expected;
  const state =
    expected === null
      ? freeze === null
      : Boolean(
          freeze &&
          freeze.startedBy === report.lockedBy &&
          freeze.startedByName === report.confirmation?.confirmedByName &&
          freeze.startedByRole === 'doctor' &&
          freeze.expectedCounts.totalSourceCount === 4 &&
          freeze.previouslyFrozenCounts.totalSourceCount === 0 &&
          (expected === 'in_progress'
            ? freeze.freezeNote === IN_PROGRESS_NOTE &&
              !freeze.completedAt &&
              !freeze.completedCounts
            : freeze.freezeNote === COMPLETED_NOTE &&
              freeze.completedBy === freeze.startedBy &&
              freeze.completedByName === freeze.startedByName &&
              freeze.completedByRole === 'doctor' &&
              freeze.completedCounts?.totalSourceCount === 4 &&
              freeze.newlyFrozenCounts?.totalSourceCount === 4),
        );
  const ownership = {
    patientId: new Types.ObjectId(baseline.patientId),
    assessmentVisitId: new Types.ObjectId(baseline.visitId),
  };
  // prettier-ignore
  const [instances, items, scores, domains, media] = await Promise.all([
    models.instances.find(ownership), models.items.find(ownership), models.scores.find(ownership),
    models.domains.find(ownership), models.media.find(ownership),
  ]);
  const frozenAt =
    expected === 'completed' && freeze
      ? freeze.sourceLockedAt.toISOString()
      : null;
  // prettier-ignore
  const sourceState =
    instances.length === 1 && items.length === 1 && scores.length === 1 && domains.length === 1 && media.length === 0 &&
    instances[0].status === (frozenAt ? 'locked' : 'completed') &&
    items[0].status === (frozenAt ? 'locked' : 'answered') && scores[0].status === (frozenAt ? 'locked' : 'confirmed') && domains[0].status === 'computed' &&
    [...instances, ...items, ...scores, ...domains]
      .map((item) => item.lockedAt?.toISOString() ?? null)
      .every((value) => value === frozenAt);
  const current = await snapshot(baseline, reports, models);
  if (
    !common ||
    !state ||
    !sourceState ||
    JSON.stringify(current.preparedBaseline) !==
      JSON.stringify(baseline.preparedBaseline)
  ) {
    fail('B13_SCENARIO_INVALID', `${key} or its protected baseline changed`);
  }
}

async function assertU02PostFreeze(
  baseline: Baseline,
  doctor: UserDocument,
  reports: ReportsService,
  models: Models,
) {
  const report = await reports.findReportByOwnership({
    reportId: baseline.reportId,
    patientId: baseline.patientId,
    assessmentVisitId: baseline.visitId,
  });
  const internal = await models.reports.findById(baseline.reportId);
  if (!report?.updatedAt || !internal || !report.lockedAt)
    fail('B13_U02_REPORT_MISSING', 'U02 target report is missing');
  const freeze = resolveExistingSourceFreeze(report);
  const ownership = {
    patientId: new Types.ObjectId(baseline.patientId),
    assessmentVisitId: new Types.ObjectId(baseline.visitId),
  };
  // prettier-ignore
  const [instances, items, scores, domains, media, auditLogs] = await Promise.all([
    models.instances.find(ownership).sort({ _id: 1 }), models.items.find(ownership).sort({ _id: 1 }),
    models.scores.find(ownership).sort({ _id: 1 }), models.domains.find(ownership).sort({ _id: 1 }),
    models.media.find(ownership).sort({ _id: 1 }),
    models.reports.db.collection('audit_logs').countDocuments({ $or: [
      { reportId: internal._id }, { clinicalReportId: internal._id }, { resourceId: internal._id },
    ] }),
  ]);
  const actualScope = buildClinicalReportSourceFreezeScope(
    report,
    items.map((item) => item.id),
  );
  const actualCounts = buildClinicalReportSourceFreezeCounts(actualScope);
  const lockedAt = freeze?.sourceLockedAt.toISOString();
  const allLockedAt = [...instances, ...items, ...scores, ...domains, ...media]
    .map((item) => item.lockedAt?.toISOString())
    .every((value) => value === lockedAt);
  // prettier-ignore
  const sourceState = instances.length === 1 && items.length === 1 && scores.length === 1 && domains.length === 1 && media.length === 0 &&
    instances[0].status === 'locked' && items[0].status === 'locked' && scores[0].status === 'locked' &&
    domains[0].status === 'computed' && allLockedAt;
  const countsSafe = Boolean(
    freeze &&
    hash(freeze.scope) === hash(actualScope) &&
    hash(freeze.expectedCounts) === hash(actualCounts) &&
    hash(freeze.completedCounts) === hash(actualCounts) &&
    hash(freeze.newlyFrozenCounts) === hash(actualCounts) &&
    freeze.previouslyFrozenCounts.totalSourceCount === 0,
  );
  const metadataOccurrences = (
    JSON.stringify(internal.metadata).match(/"a23SourceFreeze"/g) ?? []
  ).length;
  const currentFacts = await protectedFacts(baseline, models);
  // prettier-ignore
  const protectedFactsMatch = (['reportProtectedFactsHash', 'sourceImmutableFactsHash',
    'patientVisitProtectedStateHash', 'auditLogRefsHash'] as const)
    .every((key) => currentFacts[key] === baseline.preparedBaseline[key]);
  // prettier-ignore
  const reportState = Boolean(
    freeze?.state === 'completed' && freeze.freezeId && freeze.completedAt && freeze.sourceLockedAt &&
      freeze.freezeNote === U02_NOTE && freeze.startedBy === doctor.id && freeze.completedBy === doctor.id &&
      freeze.startedByRole === 'doctor' && freeze.completedByRole === 'doctor' &&
      report.status === 'confirmed' && report.source === 'mixed' && report.qualityStatus === 'passed' &&
      report.lockedAt.toISOString() === baseline.preparedBaseline.lockedAt &&
      report.archivedAt === null && report.voidedAt === null && report.correctionRecords.length === 0 &&
      report.narrative?.chiefSummary === MARKER &&
      report.updatedAt.toISOString() > baseline.preparedBaseline.updatedAt,
  );
  if (
    !reportState ||
    !sourceState ||
    !countsSafe ||
    !protectedFactsMatch ||
    metadataOccurrences !== 1 ||
    auditLogs !== 0
  ) {
    fail(
      'B13_U02_POST_FREEZE_INVALID',
      'U02 completed fact or protected boundary is invalid',
    );
  }
}

async function cleanup(namespace: string, path: string, models: Models) {
  const ids = names(namespace);
  const [users, patients, visits] = await Promise.all([
    models.users.find({ accountName: { $in: ids.accounts } }),
    models.patients.find({ subjectCode: { $in: ids.subjects } }),
    models.visits.find({ visitCode: { $in: ids.visits } }),
  ]);
  const userIds = users.map((entry) => entry._id);
  const patientIds = patients.map((entry) => entry._id);
  const visitIds = visits.map((entry) => entry._id);
  // prettier-ignore
  const owned = { $or: [{ patientId: { $in: patientIds } }, { assessmentVisitId: { $in: visitIds } }] };
  // prettier-ignore
  const deleted = {
    sessions: (await models.sessions.deleteMany({ userId: { $in: userIds } })).deletedCount,
    reports: (await models.reports.deleteMany(owned)).deletedCount,
    domains: (await models.domains.deleteMany(owned)).deletedCount,
    scores: (await models.scores.deleteMany(owned)).deletedCount,
    media: (await models.media.deleteMany(owned)).deletedCount,
    items: (await models.items.deleteMany(owned)).deletedCount,
    instances: (await models.instances.deleteMany(owned)).deletedCount,
    visits: (await models.visits.deleteMany({ _id: { $in: visitIds } })).deletedCount,
    patients: (await models.patients.deleteMany({ _id: { $in: patientIds } })).deletedCount,
    users: (await models.users.deleteMany({ _id: { $in: userIds } })).deletedCount,
  };
  // prettier-ignore
  const residuals = await Promise.all([
    models.users.countDocuments({ accountName: { $in: ids.accounts } }),
    models.patients.countDocuments({ subjectCode: { $in: ids.subjects } }),
    models.visits.countDocuments({ visitCode: { $in: ids.visits } }),
    models.sessions.countDocuments({ userId: { $in: userIds } }),
    models.reports.countDocuments(owned), models.domains.countDocuments(owned),
    models.scores.countDocuments(owned), models.media.countDocuments(owned),
    models.items.countDocuments(owned), models.instances.countDocuments(owned),
  ]);
  const residualCount = residuals.reduce((sum, count) => sum + count, 0);
  if (residualCount)
    fail('B13_CLEANUP_INCOMPLETE', 'Namespace cleanup left records');
  await unlink(path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  });
  // prettier-ignore
  return { ok: true, command: 'cleanup', databasePurpose: 'browser_acceptance',
    actualDatabaseName: DB, namespace, deleted, residualCount, runtimeDescriptor: 'absent' };
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
}) {
  const { namespace, password, path, models, auth, reports, lock, freeze } =
    input;
  await readFile(path, 'utf8').then(
    () => fail('B13_RUNTIME_EXISTS', 'Use an unused runtime descriptor path'),
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    },
  );
  await assertUnused(namespace, models);
  try {
    const users = await createUsers(namespace, password, models, auth);
    const doctor = actor(users.doctor);
    const roots = {} as Record<Key, Root>;
    for (const [index, key] of KEYS.entries()) {
      roots[key] = await createLockedChain({
        namespace,
        ordinal: index + 1,
        models,
        doctor,
        reports,
        lock,
      });
    }
    await startInProgress(
      roots['source-freeze-in-progress'],
      models,
      doctor,
      reports,
    );
    await completeFreeze(
      roots['source-freeze-completed'],
      doctor,
      reports,
      freeze,
    );
    const scenarios = {} as Record<Key, Baseline>;
    for (const key of KEYS)
      scenarios[key] = await snapshot(roots[key], reports, models);
    // prettier-ignore
    const descriptor: Descriptor = { schemaVersion: 1, batch: 'B13', profile: PROFILE,
      namespace, accounts: { doctor: { loginIdentifier: users.doctor.accountName },
        nurse: { loginIdentifier: users.nurse.accountName } }, scenarios };
    await writeDescriptor(path, descriptor);
    for (const key of KEYS)
      await assertScenario(key, scenarios[key], reports, models);
    // prettier-ignore
    return { ok: true, command: 'prepare', databasePurpose: 'browser_acceptance',
      actualDatabaseName: DB, namespace, accounts: { doctor: 'prepared', nurse: 'prepared' },
      scenarios: { sourceFreezeNull: 'production_a22',
        sourceFreezeInProgress: 'production_a23_builder_atomic_start',
        sourceFreezeCompleted: 'production_a23_workflow' },
      runtimeDescriptor: 'written_without_secrets' };
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
  if (descriptor.namespace !== namespace)
    fail('B13_NAMESPACE_MISMATCH', 'Runtime namespace mismatch');
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
    fail('B13_ACCOUNTS_INVALID', 'Doctor or nurse account contract failed');
  }
  if (phase === 'u02-post-freeze') {
    await assertU02PostFreeze(
      descriptor.scenarios['source-freeze-null'],
      doctor,
      reports,
      models,
    );
    for (const key of KEYS.slice(1))
      await assertScenario(key, descriptor.scenarios[key], reports, models);
  } else {
    for (const key of KEYS)
      await assertScenario(key, descriptor.scenarios[key], reports, models);
  }
  // prettier-ignore
  return { ok: true, command: 'verify', phase, databasePurpose: 'browser_acceptance',
    actualDatabaseName: DB, namespace, accountRoles: { doctor: 'doctor', nurse: 'nurse' },
    scenarios: { sourceFreezeNull: phase === 'u02-post-freeze' ? 'completed_once' : 'unchanged', sourceFreezeInProgress: 'unchanged',
      sourceFreezeCompleted: 'unchanged' },
    protectedBaselines: 'report_sources_patient_visit_audit_refs_matched' };
}

function models(app: INestApplicationContext): Models {
  // prettier-ignore
  return {
    users: app.get(getModelToken(User.name)), sessions: app.get(getModelToken(Session.name)),
    patients: app.get(getModelToken(Patient.name)), visits: app.get(getModelToken(AssessmentVisit.name)),
    instances: app.get(getModelToken(ScaleInstance.name)), items: app.get(getModelToken(ItemResponse.name)),
    scores: app.get(getModelToken(ScoreResult.name)), domains: app.get(getModelToken(CognitiveDomainResult.name)),
    media: app.get(getModelToken(MediaEvidence.name)), reports: app.get(getModelToken(ClinicalReport.name)),
  };
}

function safeError(error: unknown): void {
  const known =
    error instanceof DatabaseGateError || error instanceof FixtureError;
  console.error(
    JSON.stringify({
      ok: false,
      code: known ? error.code : 'B13_FIXTURE_OPERATION_FAILED',
      message: known
        ? error.message
        : 'B13 fixture operation failed without exposing internal details',
    }),
  );
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    const parsed = parseCommand();
    const namespace = required('B13_U01_NAMESPACE');
    if (!/^[a-z0-9][a-z0-9-]{2,19}$/.test(namespace))
      fail('B13_NAMESPACE_INVALID', 'Namespace format is invalid');
    const path = required('B13_U01_RUNTIME_PATH');
    const password =
      parsed.command === 'cleanup'
        ? ''
        : required('B13_U01_FIXTURE_PASSWORD', 16);
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
    if (app)
      await app.close().catch(() => {
        process.exitCode = 1;
      });
    if (connection?.readyState)
      await connection.close().catch(() => {
        process.exitCode = 1;
      });
  }
}

void run();
