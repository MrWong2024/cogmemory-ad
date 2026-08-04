import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplicationContext, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import {
  AssessmentVisit,
  type AssessmentVisitDocument,
  type AssessmentOperatorRole,
  type AssessmentStatus,
  type AssessmentVisitType,
} from '../src/modules/assessments/schemas/assessment-visit.schema';
import {
  ItemResponse,
  type ItemResponseDocument,
} from '../src/modules/assessments/schemas/item-response.schema';
import {
  ScaleInstance,
  type ScaleInstanceDocument,
} from '../src/modules/assessments/schemas/scale-instance.schema';
import { AssessmentExecutionService } from '../src/modules/assessments/services/assessment-execution.service';
import {
  Session,
  type SessionDocument,
} from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
import type { AuthenticatedUserContext } from '../src/modules/auth/types/auth-user-context.type';
import {
  CognitiveDomainResult,
  type CognitiveDomainResultDocument,
} from '../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
import { ClinicalHistoryQueryService } from '../src/modules/clinical-history/services/clinical-history-query.service';
import {
  Patient,
  type PatientDocument,
} from '../src/modules/patients/schemas/patient.schema';
import {
  ClinicalReport,
  type ClinicalReportDocument,
  type ClinicalReportStatus,
} from '../src/modules/reports/schemas/clinical-report.schema';
import { ClinicalReportArchiveWorkflowService } from '../src/modules/reports/services/clinical-report-archive-workflow.service';
import { ClinicalReportLockWorkflowService } from '../src/modules/reports/services/clinical-report-lock-workflow.service';
import { ClinicalReportSourceFreezeWorkflowService } from '../src/modules/reports/services/clinical-report-source-freeze-workflow.service';
import { ReportsService } from '../src/modules/reports/services/reports.service';
import {
  ScaleDefinition,
  type ScaleDefinitionDocument,
} from '../src/modules/scales/schemas/scale-definition.schema';
import {
  ScaleVersion,
  type ScaleVersionDocument,
} from '../src/modules/scales/schemas/scale-version.schema';
import { ScaleCatalogService } from '../src/modules/scales/services/scale-catalog.service';
import {
  ScoreResult,
  type ScoreResultDocument,
  type ScoreResultStatus,
} from '../src/modules/scoring/schemas/score-result.schema';
import {
  User,
  type UserDocument,
  type UserType,
} from '../src/modules/users/schemas/user.schema';

type AppModuleExport = { AppModule: Type<unknown> };

type Models = {
  users: Model<UserDocument>;
  sessions: Model<SessionDocument>;
  patients: Model<PatientDocument>;
  visits: Model<AssessmentVisitDocument>;
  instances: Model<ScaleInstanceDocument>;
  items: Model<ItemResponseDocument>;
  scores: Model<ScoreResultDocument>;
  domains: Model<CognitiveDomainResultDocument>;
  reports: Model<ClinicalReportDocument>;
  scaleDefinitions: Model<ScaleDefinitionDocument>;
  scaleVersions: Model<ScaleVersionDocument>;
};

type Services = {
  auth: AuthService;
  scaleCatalog: ScaleCatalogService;
  assessmentExecution: AssessmentExecutionService;
  reports: ReportsService;
  reportLock: ClinicalReportLockWorkflowService;
  sourceFreeze: ClinicalReportSourceFreezeWorkflowService;
  reportArchive: ClinicalReportArchiveWorkflowService;
  clinicalHistory: ClinicalHistoryQueryService;
};

type AccountSeed = {
  accountName: string;
  displayName: string;
  role: string;
  userType: Exclude<UserType, 'system'>;
  staffCode: string;
};

type ScaleReference = {
  definitionId: Types.ObjectId;
  versionId: Types.ObjectId;
  code: 'mmse' | 'moca';
  name: string;
  version: string;
  totalMinScore: number;
  totalMaxScore: number;
  trace: {
    scaleVersion: string;
    crfVersion: string;
    scoringRuleVersion: string;
    fieldEncodingVersion: string;
    sourceDocument: string;
  };
};

type ExecutionBundle = {
  patient: PatientDocument;
  visit: AssessmentVisitDocument;
  instance: ScaleInstanceDocument;
  items: ItemResponseDocument[];
  scale: ScaleReference;
};

type OwnedIds = {
  userIds: Types.ObjectId[];
  patientIds: Types.ObjectId[];
  visitIds: Types.ObjectId[];
  instanceIds: Types.ObjectId[];
  reportIds: Types.ObjectId[];
};

type NonDemoCounts = Record<
  | 'users'
  | 'sessions'
  | 'patients'
  | 'visits'
  | 'instances'
  | 'items'
  | 'scores'
  | 'domains'
  | 'reports'
  | 'mediaEvidence'
  | 'auditLogs',
  number
>;

class DemoSeedError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DemoSeedError';
  }
}

const DEVELOPMENT_DATABASE = 'cogmemory_ad_dev';
const PRODUCTION_DATABASE = 'cogmemory_ad';
const DEMO_SEED_OWNER = 'DEMO-01';
const DEFAULT_PASSWORD = 'demo123';
const MEDIA_COLLECTION = 'media_evidences';
const AUDIT_COLLECTION = 'audit_logs';
const BASE_DATE = new Date('2026-07-01T01:00:00.000Z');

const ACCOUNT_SEEDS: readonly AccountSeed[] = [
  {
    accountName: 'admin1',
    displayName: '演示管理员一',
    role: 'admin',
    userType: 'admin',
    staffCode: 'DEMO-ADMIN-1',
  },
  {
    accountName: 'admin2',
    displayName: '演示管理员二',
    role: 'admin',
    userType: 'admin',
    staffCode: 'DEMO-ADMIN-2',
  },
  {
    accountName: 'doctor1',
    displayName: '演示医生一',
    role: 'doctor',
    userType: 'doctor',
    staffCode: 'DEMO-DOCTOR-1',
  },
  {
    accountName: 'doctor2',
    displayName: '演示医生二',
    role: 'doctor',
    userType: 'doctor',
    staffCode: 'DEMO-DOCTOR-2',
  },
  {
    accountName: 'nurse1',
    displayName: '演示护士一',
    role: 'nurse',
    userType: 'nurse',
    staffCode: 'DEMO-NURSE-1',
  },
  {
    accountName: 'nurse2',
    displayName: '演示护士二',
    role: 'nurse',
    userType: 'nurse',
    staffCode: 'DEMO-NURSE-2',
  },
  {
    accountName: 'research1',
    displayName: '演示研究员一',
    role: 'research_assistant',
    userType: 'research_assistant',
    staffCode: 'DEMO-RESEARCH-1',
  },
  {
    accountName: 'research2',
    displayName: '演示研究员二',
    role: 'research_assistant',
    userType: 'research_assistant',
    staffCode: 'DEMO-RESEARCH-2',
  },
] as const;

const ACCOUNT_NAMES = ACCOUNT_SEEDS.map((account) => account.accountName);
const SUBJECT_CODES = Array.from(
  { length: 8 },
  (_, index) => `DEMO-${String(index + 1).padStart(3, '0')}`,
);

function fail(code: string, message: string): never {
  throw new DemoSeedError(code, message);
}

function addMinutes(value: Date, minutes: number): Date {
  return new Date(value.getTime() + minutes * 60_000);
}

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
}

function idsEqual(left: unknown, right: Types.ObjectId): boolean {
  return left instanceof Types.ObjectId && left.equals(right);
}

function assertPreImportGate(): string {
  if (process.env.DEMO_SEED_CONFIRM !== 'YES') {
    fail('DEMO_SEED_CONFIRMATION_REQUIRED', 'DEMO_SEED_CONFIRM must equal YES');
  }
  if (process.argv.slice(2).length !== 0) {
    fail('DEMO_SEED_ARGUMENTS_NOT_ALLOWED', 'seed:demo accepts no arguments');
  }
  if (process.env.NODE_ENV === 'test') {
    fail(
      'DEMO_SEED_TEST_ENVIRONMENT_FORBIDDEN',
      'seed:demo must not load a test environment',
    );
  }
  if (
    process.env.NODE_ENV !== undefined &&
    process.env.NODE_ENV !== 'development' &&
    process.env.NODE_ENV !== 'production'
  ) {
    fail(
      'DEMO_SEED_ENVIRONMENT_INVALID',
      'NODE_ENV must be development or production',
    );
  }
  const password = process.env.DEMO_ACCOUNT_PASSWORD ?? DEFAULT_PASSWORD;
  if (!password || password.length > 256) {
    fail(
      'DEMO_ACCOUNT_PASSWORD_INVALID',
      'DEMO_ACCOUNT_PASSWORD must contain between 1 and 256 characters',
    );
  }
  return password;
}

function assertConnectedDatabase(
  connection: Connection,
  config: ConfigService,
): 'development' | 'production' {
  const databaseName = connection.name;
  const appEnvironment = config.get<string>('app.env');
  if (
    databaseName === DEVELOPMENT_DATABASE &&
    appEnvironment === 'development'
  ) {
    return 'development';
  }
  if (databaseName === PRODUCTION_DATABASE && appEnvironment === 'production') {
    if (process.env.DEMO_SEED_ALLOW_PRODUCTION !== 'YES') {
      fail(
        'DEMO_SEED_PRODUCTION_CONFIRMATION_REQUIRED',
        'Production demo seed requires DEMO_SEED_ALLOW_PRODUCTION=YES',
      );
    }
    return 'production';
  }
  fail(
    'DEMO_SEED_DATABASE_FORBIDDEN',
    `Connected database is not allowed: ${databaseName || '<unknown>'}`,
  );
}

function getModels(app: INestApplicationContext): Models {
  return {
    users: app.get(getModelToken(User.name)),
    sessions: app.get(getModelToken(Session.name)),
    patients: app.get(getModelToken(Patient.name)),
    visits: app.get(getModelToken(AssessmentVisit.name)),
    instances: app.get(getModelToken(ScaleInstance.name)),
    items: app.get(getModelToken(ItemResponse.name)),
    scores: app.get(getModelToken(ScoreResult.name)),
    domains: app.get(getModelToken(CognitiveDomainResult.name)),
    reports: app.get(getModelToken(ClinicalReport.name)),
    scaleDefinitions: app.get(getModelToken(ScaleDefinition.name)),
    scaleVersions: app.get(getModelToken(ScaleVersion.name)),
  };
}

function getServices(app: INestApplicationContext): Services {
  return {
    auth: app.get(AuthService),
    scaleCatalog: app.get(ScaleCatalogService),
    assessmentExecution: app.get(AssessmentExecutionService),
    reports: app.get(ReportsService),
    reportLock: app.get(ClinicalReportLockWorkflowService),
    sourceFreeze: app.get(ClinicalReportSourceFreezeWorkflowService),
    reportArchive: app.get(ClinicalReportArchiveWorkflowService),
    clinicalHistory: app.get(ClinicalHistoryQueryService),
  };
}

async function resolveOwnedIds(models: Models): Promise<OwnedIds> {
  const [users, patients] = await Promise.all([
    models.users.find({ accountName: { $in: ACCOUNT_NAMES } }).select('_id'),
    models.patients.find({ subjectCode: { $in: SUBJECT_CODES } }).select('_id'),
  ]);
  const userIds = users.map((user) => user._id);
  const patientIds = patients.map((patient) => patient._id);
  const visits = await models.visits
    .find({ patientId: { $in: patientIds } })
    .select('_id');
  const visitIds = visits.map((visit) => visit._id);
  const instances = await models.instances
    .find({
      $or: [
        { patientId: { $in: patientIds } },
        { assessmentVisitId: { $in: visitIds } },
      ],
    })
    .select('_id');
  const instanceIds = instances.map((instance) => instance._id);
  const reports = await models.reports
    .find({
      $or: [
        { patientId: { $in: patientIds } },
        { assessmentVisitId: { $in: visitIds } },
      ],
    })
    .select('_id');
  return {
    userIds,
    patientIds,
    visitIds,
    instanceIds,
    reportIds: reports.map((report) => report._id),
  };
}

function derivedOwnershipFilter(owned: OwnedIds) {
  return {
    $or: [
      { patientId: { $in: owned.patientIds } },
      { assessmentVisitId: { $in: owned.visitIds } },
      { scaleInstanceId: { $in: owned.instanceIds } },
    ],
  };
}

function reportAuditFilter(owned: OwnedIds) {
  return {
    $or: [
      { reportId: { $in: owned.reportIds } },
      { clinicalReportId: { $in: owned.reportIds } },
      { resourceId: { $in: owned.reportIds } },
    ],
  };
}

async function snapshotNonDemoCounts(
  models: Models,
  connection: Connection,
  owned: OwnedIds,
): Promise<NonDemoCounts> {
  const derived = derivedOwnershipFilter(owned);
  const [
    totalUsers,
    ownedUsers,
    totalSessions,
    ownedSessions,
    totalPatients,
    ownedPatients,
    totalVisits,
    ownedVisits,
    totalInstances,
    ownedInstances,
    totalItems,
    ownedItems,
    totalScores,
    ownedScores,
    totalDomains,
    ownedDomains,
    totalReports,
    ownedReports,
    totalMedia,
    ownedMedia,
    totalAuditLogs,
    ownedAuditLogs,
  ] = await Promise.all([
    models.users.countDocuments({}),
    models.users.countDocuments({ accountName: { $in: ACCOUNT_NAMES } }),
    models.sessions.countDocuments({}),
    models.sessions.countDocuments({ userId: { $in: owned.userIds } }),
    models.patients.countDocuments({}),
    models.patients.countDocuments({ subjectCode: { $in: SUBJECT_CODES } }),
    models.visits.countDocuments({}),
    models.visits.countDocuments({ patientId: { $in: owned.patientIds } }),
    models.instances.countDocuments({}),
    models.instances.countDocuments(derived),
    models.items.countDocuments({}),
    models.items.countDocuments(derived),
    models.scores.countDocuments({}),
    models.scores.countDocuments(derived),
    models.domains.countDocuments({}),
    models.domains.countDocuments(derived),
    models.reports.countDocuments({}),
    models.reports.countDocuments(derived),
    connection.collection(MEDIA_COLLECTION).countDocuments({}),
    connection.collection(MEDIA_COLLECTION).countDocuments(derived),
    connection.collection(AUDIT_COLLECTION).countDocuments({}),
    connection
      .collection(AUDIT_COLLECTION)
      .countDocuments(reportAuditFilter(owned)),
  ]);
  return {
    users: totalUsers - ownedUsers,
    sessions: totalSessions - ownedSessions,
    patients: totalPatients - ownedPatients,
    visits: totalVisits - ownedVisits,
    instances: totalInstances - ownedInstances,
    items: totalItems - ownedItems,
    scores: totalScores - ownedScores,
    domains: totalDomains - ownedDomains,
    reports: totalReports - ownedReports,
    mediaEvidence: totalMedia - ownedMedia,
    auditLogs: totalAuditLogs - ownedAuditLogs,
  };
}

async function cleanupOwnedData(
  models: Models,
  connection: Connection,
  owned: OwnedIds,
) {
  const derived = derivedOwnershipFilter(owned);
  const deleted = {
    sessions: (
      await models.sessions.deleteMany({ userId: { $in: owned.userIds } })
    ).deletedCount,
    auditLogs: (
      await connection
        .collection(AUDIT_COLLECTION)
        .deleteMany(reportAuditFilter(owned))
    ).deletedCount,
    reports: (await models.reports.deleteMany(derived)).deletedCount,
    domains: (await models.domains.deleteMany(derived)).deletedCount,
    scores: (await models.scores.deleteMany(derived)).deletedCount,
    mediaEvidence: (
      await connection.collection(MEDIA_COLLECTION).deleteMany(derived)
    ).deletedCount,
    itemResponses: (await models.items.deleteMany(derived)).deletedCount,
    scaleInstances: (await models.instances.deleteMany(derived)).deletedCount,
    visits: (await models.visits.deleteMany({ _id: { $in: owned.visitIds } }))
      .deletedCount,
    patients: (
      await models.patients.deleteMany({ _id: { $in: owned.patientIds } })
    ).deletedCount,
    users: (await models.users.deleteMany({ _id: { $in: owned.userIds } }))
      .deletedCount,
  };
  const residuals = await Promise.all([
    models.users.countDocuments({ accountName: { $in: ACCOUNT_NAMES } }),
    models.patients.countDocuments({ subjectCode: { $in: SUBJECT_CODES } }),
    models.sessions.countDocuments({ userId: { $in: owned.userIds } }),
    models.visits.countDocuments({ _id: { $in: owned.visitIds } }),
    models.instances.countDocuments(derived),
    models.items.countDocuments(derived),
    models.scores.countDocuments(derived),
    models.domains.countDocuments(derived),
    models.reports.countDocuments(derived),
    connection.collection(MEDIA_COLLECTION).countDocuments(derived),
    connection
      .collection(AUDIT_COLLECTION)
      .countDocuments(reportAuditFilter(owned)),
  ]);
  if (residuals.some((count) => count !== 0)) {
    fail(
      'DEMO_SEED_CLEANUP_INCOMPLETE',
      'Owned demo namespace cleanup left residual records',
    );
  }
  return deleted;
}

async function materializeScale(
  code: 'mmse' | 'moca',
  models: Models,
  services: Services,
): Promise<ScaleReference> {
  const reference =
    await services.scaleCatalog.ensureSeedScaleVersionMaterialized(code);
  const [definition, version] = await Promise.all([
    models.scaleDefinitions.findById(reference.scaleDefinitionId),
    models.scaleVersions.findById(reference.scaleVersionId),
  ]);
  if (!definition || !version) {
    fail(
      'DEMO_SEED_SCALE_MATERIALIZATION_FAILED',
      `Materialized scale could not be loaded: ${code}`,
    );
  }
  const crfVersion = version.crfVersion?.trim();
  const scoringRuleVersion = version.scoringRuleVersion?.trim();
  const fieldEncodingVersion = version.fieldEncodingVersion?.trim();
  const sourceDocument = version.sourceDocument?.trim();
  if (
    definition.status !== 'active' ||
    version.status !== 'active' ||
    !crfVersion ||
    !scoringRuleVersion ||
    !fieldEncodingVersion ||
    !sourceDocument
  ) {
    fail(
      'DEMO_SEED_SCALE_CATALOG_INVALID',
      `Scale catalog is incomplete: ${code}`,
    );
  }
  return {
    definitionId: definition._id,
    versionId: version._id,
    code,
    name: definition.shortName ?? definition.name,
    version: version.version,
    totalMinScore: version.totalScoreRange.min,
    totalMaxScore: version.totalScoreRange.max,
    trace: {
      scaleVersion: version.version,
      crfVersion,
      scoringRuleVersion,
      fieldEncodingVersion,
      sourceDocument,
    },
  };
}

async function createAccounts(
  password: string,
  models: Models,
  auth: AuthService,
): Promise<Map<string, UserDocument>> {
  const created = new Map<string, UserDocument>();
  for (const seed of ACCOUNT_SEEDS) {
    const passwordHash = await auth.hashPassword(password);
    const user = await models.users.create({
      accountName: seed.accountName,
      displayName: seed.displayName,
      staffCode: seed.staffCode,
      passwordHash,
      passwordChangedAt: BASE_DATE,
      roles: [seed.role],
      permissions: [],
      userType: seed.userType,
      status: 'active',
      department: '客户演示',
      organization: '智忆评虚构演示机构',
      lastLoginAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
      metadata: {
        demoSeed: { owner: DEMO_SEED_OWNER, account: seed.accountName },
      },
    });
    created.set(seed.accountName, user);
  }
  return created;
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

function requireAssessmentActorRole(
  actor: AuthenticatedUserContext,
): Exclude<AssessmentOperatorRole, 'unknown'> {
  const role = ['doctor', 'nurse', 'research_assistant', 'admin'].find(
    (candidate) => actor.roles.includes(candidate),
  );
  if (
    role !== 'doctor' &&
    role !== 'nurse' &&
    role !== 'research_assistant' &&
    role !== 'admin'
  ) {
    fail('DEMO_SEED_ACTOR_ROLE_INVALID', 'Demo actor role is invalid');
  }
  return role;
}

function requireReportConfirmationRole(
  actor: AuthenticatedUserContext,
): 'doctor' | 'admin' {
  const role = requireAssessmentActorRole(actor);
  if (role !== 'doctor' && role !== 'admin') {
    fail(
      'DEMO_SEED_REPORT_ACTOR_ROLE_INVALID',
      'Demo report actor must be a doctor or admin',
    );
  }
  return role;
}

async function createPatients(
  models: Models,
): Promise<Map<string, PatientDocument>> {
  const patients = new Map<string, PatientDocument>();
  for (let index = 0; index < SUBJECT_CODES.length; index += 1) {
    const subjectCode = SUBJECT_CODES[index];
    const patient = await models.patients.create({
      subjectCode,
      displayName: `演示患者${String(index + 1).padStart(2, '0')}`,
      sourceType: 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'active',
      tags: ['DEMO', '虚构演示数据'],
      notes: `DEMO-01 虚构客户演示场景 ${index + 1}`,
      externalRefs: null,
      metadata: {
        demoSeed: { owner: DEMO_SEED_OWNER, scenario: subjectCode },
      },
    });
    patients.set(subjectCode, patient);
  }
  return patients;
}

async function createVisit(input: {
  models: Models;
  patient: PatientDocument;
  ordinal: number;
  visitType: AssessmentVisitType;
  status: AssessmentStatus;
  assessmentDate: Date;
  actor: AuthenticatedUserContext;
}): Promise<AssessmentVisitDocument> {
  const startedAt = input.status === 'draft' ? null : input.assessmentDate;
  const completedAt = ['completed', 'locked'].includes(input.status)
    ? addMinutes(input.assessmentDate, 45)
    : null;
  return input.models.visits.create({
    patientId: input.patient._id,
    subjectCode: input.patient.subjectCode,
    visitCode: `${input.patient.subjectCode}-V${String(input.ordinal).padStart(2, '0')}`,
    visitType: input.visitType,
    status: input.status,
    assessmentDate: input.assessmentDate,
    startedAt,
    completedAt,
    lockedAt: null,
    voidedAt: null,
    operatorSnapshot: {
      operatorId: toObjectId(input.actor.id),
      operatorName: input.actor.displayName,
      operatorRole: requireAssessmentActorRole(input.actor),
    },
    clinicalContext: {
      purpose: '虚构客户演示',
      scenario: input.patient.subjectCode,
    },
    notes: 'DEMO-01 虚构演示访视',
    metadata: {
      demoSeed: {
        owner: DEMO_SEED_OWNER,
        scenario: input.patient.subjectCode,
      },
    },
  });
}

async function createExecution(input: {
  models: Models;
  service: AssessmentExecutionService;
  patient: PatientDocument;
  visit: AssessmentVisitDocument;
  scale: ScaleReference;
  actor: AuthenticatedUserContext;
  startedAt: Date;
}): Promise<ExecutionBundle> {
  const result = await input.service.createScaleExecutionFromSeed({
    patientId: input.patient._id,
    assessmentVisitId: input.visit._id,
    subjectCode: input.patient.subjectCode,
    scaleDefinitionId: input.scale.definitionId,
    scaleVersionId: input.scale.versionId,
    scaleCode: input.scale.code,
    scaleVersion: input.scale.version,
    instanceCode: `${input.visit.visitCode}-${input.scale.code.toUpperCase()}-01`,
    instanceNo: 1,
    administrationMode: 'clinician_administered',
    operatorSnapshot: {
      operatorId: input.actor.id,
      operatorName: input.actor.displayName,
      operatorRole: requireAssessmentActorRole(input.actor),
    },
    startedAt: input.startedAt,
    metadata: {
      demoSeed: {
        owner: DEMO_SEED_OWNER,
        scenario: input.patient.subjectCode,
      },
    },
  });
  const instance = await input.models.instances.findById(
    result.scaleInstance.id,
  );
  const items = await input.models.items
    .find({ scaleInstanceId: toObjectId(result.scaleInstance.id) })
    .sort({ itemOrder: 1 });
  if (!instance || items.length !== result.createdItemResponseCount) {
    fail(
      'DEMO_SEED_EXECUTION_CREATION_FAILED',
      `Scale execution is incomplete: ${input.patient.subjectCode}`,
    );
  }
  return {
    patient: input.patient,
    visit: input.visit,
    instance,
    items,
    scale: input.scale,
  };
}

function demoRawResponse(item: ItemResponseDocument, ordinal: number) {
  if (item.responseType === 'boolean') {
    return true;
  }
  if (item.responseType === 'number') {
    return ordinal;
  }
  if (
    item.responseType === 'multi_choice' ||
    item.responseType === 'multi_step_calculation'
  ) {
    return [`demo-option-${ordinal}`];
  }
  return `虚构演示作答 ${ordinal}`;
}

async function setPartialAnswers(
  bundle: ExecutionBundle,
  itemCodes: readonly string[],
): Promise<void> {
  const savedAt = addMinutes(bundle.visit.assessmentDate, 15);
  for (let index = 0; index < itemCodes.length; index += 1) {
    const item = bundle.items.find(
      (candidate) => candidate.itemCode === itemCodes[index],
    );
    if (!item) {
      fail(
        'DEMO_SEED_PARTIAL_ITEM_MISSING',
        `Partial item is missing: ${itemCodes[index]}`,
      );
    }
    item.status = 'answered';
    item.draftRevision = index + 1;
    item.draftSavedAt = addMinutes(savedAt, index);
    item.rawResponse = demoRawResponse(item, index + 1);
    item.structuredResponse = {
      demo: true,
      ordinal: index + 1,
    };
    item.responseText = `虚构演示作答 ${index + 1}`;
    item.responseSummary = '已自动保存的虚构演示作答';
    item.isMissing = false;
    item.operatorNote = 'DEMO-01 部分作答，可继续施测';
    await item.save();
  }
  bundle.instance.status = 'in_progress';
  bundle.instance.startedAt = bundle.visit.assessmentDate;
  bundle.instance.progress = {
    totalItemCount: bundle.items.length,
    answeredItemCount: itemCodes.length,
  };
  await bundle.instance.save();
}

function requiresMediaEvidence(item: ItemResponseDocument): boolean {
  return (
    ['drawing', 'photo_upload', 'handwriting'].includes(item.responseType) ||
    item.evidenceRefs.some((evidence) =>
      ['photo', 'handwriting'].includes(evidence.evidenceType),
    )
  );
}

async function completeExecution(
  bundle: ExecutionBundle,
  actor: AuthenticatedUserContext,
  targetTotal: number,
): Promise<void> {
  if (
    targetTotal < bundle.scale.totalMinScore ||
    targetTotal > bundle.scale.totalMaxScore
  ) {
    fail(
      'DEMO_SEED_SCORE_TARGET_INVALID',
      `Target score is outside the scale range: ${bundle.patient.subjectCode}`,
    );
  }
  let remaining = targetTotal;
  const completedAt = addMinutes(bundle.visit.assessmentDate, 45);
  for (let index = 0; index < bundle.items.length; index += 1) {
    const item = bundle.items[index];
    const maxScore = item.score?.maxScore ?? 0;
    const minScore = item.score?.minScore ?? 0;
    const mediaRequired = requiresMediaEvidence(item);
    const scoreValue =
      item.countsTowardTotal && !mediaRequired
        ? Math.min(maxScore, Math.max(minScore, remaining))
        : 0;
    if (item.countsTowardTotal) {
      remaining -= scoreValue;
    }
    item.status = 'scored';
    item.draftRevision = 1;
    item.draftSavedAt = addMinutes(bundle.visit.assessmentDate, 10 + index);
    item.rawResponse = mediaRequired ? null : demoRawResponse(item, index + 1);
    item.structuredResponse = mediaRequired
      ? null
      : { demo: true, ordinal: index + 1 };
    item.responseText = mediaRequired ? undefined : `虚构演示作答 ${index + 1}`;
    item.responseSummary = mediaRequired
      ? '演示数据未创建媒体证据'
      : '虚构演示完整作答';
    item.isMissing = mediaRequired;
    item.missingReason = mediaRequired
      ? 'DEMO-01 不创建真实 Storage / OSS 对象'
      : undefined;
    item.score = {
      scoreValue,
      maxScore,
      minScore,
      scoreStatus: 'manual_scored',
      scoreSource: 'operator',
      scoredAt: completedAt,
      scoredBy: toObjectId(actor.id),
      scoringNote: 'DEMO-01 虚构演示评分',
    };
    item.stepResults.forEach((step) => {
      step.actualValue = step.expectedValue ?? `demo-step-${step.order}`;
      step.isCorrect = true;
      step.scoreValue = scoreValue > 0 ? 1 : 0;
    });
    if (item.timing) {
      item.timing.timerState = 'completed';
      item.timing.startedAt = addMinutes(bundle.visit.assessmentDate, 5);
      item.timing.lastResumedAt = null;
      item.timing.completedAt = completedAt;
      item.timing.durationMs = 60_000 + index * 1_000;
      item.timing.timerSource = 'manual';
    }
    item.operatorNote = 'DEMO-01 虚构演示完整作答';
    await item.save();
  }
  if (remaining !== 0) {
    fail(
      'DEMO_SEED_SCORE_DISTRIBUTION_FAILED',
      `Target score could not be distributed: ${bundle.patient.subjectCode}`,
    );
  }
  bundle.instance.status = 'completed';
  bundle.instance.startedAt = bundle.visit.assessmentDate;
  bundle.instance.completedAt = completedAt;
  bundle.instance.durationMs = 45 * 60_000;
  bundle.instance.progress = {
    totalItemCount: bundle.items.length,
    answeredItemCount: bundle.items.length,
  };
  bundle.instance.qualityControlSummary = {
    status: 'passed',
    mediaEvidenceCreated: false,
  };
  await bundle.instance.save();
}

function scorePercent(value: number, min: number, max: number): number {
  return Number((((value - min) / (max - min)) * 100).toFixed(2));
}

async function createScore(input: {
  models: Models;
  bundle: ExecutionBundle;
  actor: AuthenticatedUserContext;
  code: string;
  targetTotal: number;
  status: Extract<ScoreResultStatus, 'needs_review' | 'confirmed'>;
}): Promise<ScoreResultDocument> {
  const needsReview = input.status === 'needs_review';
  if (needsReview) {
    const reviewItem = input.bundle.items.find(
      (item) => item.countsTowardTotal && !item.isMissing,
    );
    if (!reviewItem?.score) {
      fail(
        'DEMO_SEED_REVIEW_ITEM_MISSING',
        'Pending review scenario has no reviewable item',
      );
    }
    reviewItem.score.scoreStatus = 'needs_review';
    await reviewItem.save();
  }
  const groupMap = new Map<
    string,
    { scoreValue: number; maxScore: number; itemCount: number }
  >();
  for (const item of input.bundle.items) {
    const groupCode = item.groupCode ?? 'ungrouped';
    const current = groupMap.get(groupCode) ?? {
      scoreValue: 0,
      maxScore: 0,
      itemCount: 0,
    };
    if (item.countsTowardTotal) {
      current.scoreValue += item.score?.scoreValue ?? 0;
      current.maxScore += item.score?.maxScore ?? 0;
      current.itemCount += 1;
    }
    groupMap.set(groupCode, current);
  }
  const confirmedAt = needsReview
    ? null
    : addMinutes(input.bundle.visit.assessmentDate, 55);
  return input.models.scores.create({
    patientId: input.bundle.patient._id,
    assessmentVisitId: input.bundle.visit._id,
    scaleInstanceId: input.bundle.instance._id,
    subjectCode: input.bundle.patient.subjectCode,
    scaleDefinitionId: input.bundle.scale.definitionId,
    scaleVersionId: input.bundle.scale.versionId,
    scaleCode: input.bundle.scale.code,
    scaleVersion: input.bundle.scale.version,
    instanceCode: input.bundle.instance.instanceCode,
    scoreResultCode: input.code,
    runNo: 1,
    status: input.status,
    scoringSource: 'manual',
    scoringMode: 'manual_summary',
    versionTrace: { ...input.bundle.scale.trace },
    totalScore: {
      scoreValue: input.targetTotal,
      maxScore: input.bundle.scale.totalMaxScore,
      minScore: input.bundle.scale.totalMinScore,
      scorePercent: scorePercent(
        input.targetTotal,
        input.bundle.scale.totalMinScore,
        input.bundle.scale.totalMaxScore,
      ),
      scoredItemCount: input.bundle.items.length,
      totalItemCount: input.bundle.items.length,
      unscoredItemCount: 0,
      missingItemCount: input.bundle.items.filter((item) => item.isMissing)
        .length,
      needsReviewItemCount: needsReview ? 1 : 0,
    },
    itemScores: input.bundle.items.map((item) => ({
      itemResponseId: item._id,
      itemCode: item.itemCode,
      crfCode: item.crfCode,
      groupCode: item.groupCode,
      itemTitle: item.itemTitle,
      itemOrder: item.itemOrder,
      responseType: item.responseType,
      countsTowardTotal: item.countsTowardTotal,
      includedInTotal: item.countsTowardTotal,
      scoreValue: item.score?.scoreValue ?? 0,
      maxScore: item.score?.maxScore ?? 0,
      minScore: item.score?.minScore ?? 0,
      scoreStatus: item.score?.scoreStatus ?? 'not_scored',
      scoreSource: item.score?.scoreSource ?? 'none',
      isMissing: item.isMissing,
      cognitiveDomainCodes: [...item.cognitiveDomainCodes],
      note: 'DEMO-01 虚构演示题目评分',
    })),
    groupScores: [...groupMap.entries()].map(([groupCode, value]) => ({
      groupCode,
      groupTitle: groupCode,
      scoreValue: value.scoreValue,
      maxScore: value.maxScore,
      minScore: 0,
      scoredItemCount: value.itemCount,
      totalItemCount: value.itemCount,
    })),
    computation: {
      computedAt: addMinutes(input.bundle.visit.assessmentDate, 50),
      computedBy: toObjectId(input.actor.id),
      ruleSetCode: 'demo-manual-summary',
      ruleSetVersion: '1.0',
      engineVersion: 'demo-seed-v1',
      inputItemCount: input.bundle.items.length,
      includedItemCount: input.bundle.items.filter(
        (item) => item.countsTowardTotal,
      ).length,
      excludedItemCount: input.bundle.items.filter(
        (item) => !item.countsTowardTotal,
      ).length,
      warningCount: needsReview ? 1 : 0,
      notes: 'DEMO-01 虚构演示评分计算',
    },
    review: needsReview
      ? {
          reviewStatus: 'pending',
          reviewedAt: null,
          reviewerId: null,
          reviewNote: '供客户体验人工复核流程',
        }
      : {
          reviewStatus: 'reviewed',
          reviewedAt: confirmedAt,
          reviewerId: toObjectId(input.actor.id),
          reviewerName: input.actor.displayName,
          reviewNote: 'DEMO-01 虚构演示确认评分',
        },
    qualityStatus: needsReview ? 'needs_review' : 'passed',
    qualityHints: needsReview ? { pendingReviewItemCount: 1 } : null,
    operatorNote: needsReview
      ? '供客户体验评分复核及确认'
      : 'DEMO-01 虚构演示确认评分',
    metadata: {
      demoSeed: {
        owner: DEMO_SEED_OWNER,
        scenario: input.bundle.patient.subjectCode,
      },
    },
    confirmedAt,
    lockedAt: null,
    voidedAt: null,
  });
}

async function createDomainResult(input: {
  models: Models;
  bundle: ExecutionBundle;
  score: ScoreResultDocument;
  actor: AuthenticatedUserContext;
  code: string;
}): Promise<CognitiveDomainResultDocument> {
  const domainMap = new Map<
    string,
    {
      scoreValue: number;
      maxScore: number;
      itemCount: number;
      contributions: Array<{
        item: ItemResponseDocument;
        scoreValue: number;
        maxScore: number;
      }>;
    }
  >();
  for (const item of input.bundle.items) {
    for (const domainCode of item.cognitiveDomainCodes) {
      const current = domainMap.get(domainCode) ?? {
        scoreValue: 0,
        maxScore: 0,
        itemCount: 0,
        contributions: [],
      };
      const itemScore = item.score?.scoreValue ?? 0;
      const itemMax = item.score?.maxScore ?? 0;
      current.scoreValue += itemScore;
      current.maxScore += itemMax;
      current.itemCount += 1;
      current.contributions.push({
        item,
        scoreValue: itemScore,
        maxScore: itemMax,
      });
      domainMap.set(domainCode, current);
    }
  }
  if (domainMap.size === 0) {
    fail(
      'DEMO_SEED_DOMAIN_SOURCE_MISSING',
      `Scale has no cognitive domain mapping: ${input.bundle.scale.code}`,
    );
  }
  const mappingVersion = 'demo-item-domain-codes-v1';
  const computedAt = addMinutes(input.bundle.visit.assessmentDate, 60);
  return input.models.domains.create({
    patientId: input.bundle.patient._id,
    assessmentVisitId: input.bundle.visit._id,
    scaleInstanceId: input.bundle.instance._id,
    scoreResultId: input.score._id,
    subjectCode: input.bundle.patient.subjectCode,
    scaleDefinitionId: input.bundle.scale.definitionId,
    scaleVersionId: input.bundle.scale.versionId,
    scaleCode: input.bundle.scale.code,
    scaleVersion: input.bundle.scale.version,
    instanceCode: input.bundle.instance.instanceCode,
    domainResultCode: input.code,
    runNo: 1,
    status: 'computed',
    mappingSource: 'scale_config',
    mappingMode: 'item_domain_codes',
    versionTrace: {
      ...input.bundle.scale.trace,
      domainMappingVersion: mappingVersion,
    },
    domainScores: [...domainMap.entries()].map(([domainCode, value]) => ({
      domainCode,
      domainTitle: domainCode,
      scoreValue: value.scoreValue,
      maxScore: value.maxScore,
      minScore: 0,
      scorePercent:
        value.maxScore > 0
          ? Number(((value.scoreValue / value.maxScore) * 100).toFixed(2))
          : 0,
      weightedScore: value.scoreValue,
      weightedMaxScore: value.maxScore,
      itemCount: value.itemCount,
      scoredItemCount: value.itemCount,
      unscoredItemCount: 0,
      missingItemCount: value.contributions.filter(
        (contribution) => contribution.item.isMissing,
      ).length,
      needsReviewItemCount: 0,
      excludedItemCount: 0,
      note: 'DEMO-01 虚构演示认知域结果',
    })),
    itemContributions: [...domainMap.entries()].flatMap(([domainCode, value]) =>
      value.contributions.map((contribution) => ({
        itemResponseId: contribution.item._id,
        scoreResultId: input.score._id,
        itemCode: contribution.item.itemCode,
        crfCode: contribution.item.crfCode,
        groupCode: contribution.item.groupCode,
        itemTitle: contribution.item.itemTitle,
        itemOrder: contribution.item.itemOrder,
        domainCode,
        domainTitle: domainCode,
        weight: 1,
        countsTowardDomain: true,
        scoreValue: contribution.scoreValue,
        maxScore: contribution.maxScore,
        weightedScore: contribution.scoreValue,
        weightedMaxScore: contribution.maxScore,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        isMissing: contribution.item.isMissing,
        note: 'DEMO-01 虚构演示认知域贡献',
      })),
    ),
    mappingSnapshot: {
      mappingVersion,
      mappingSource: 'scale_config',
      domainCodes: [...domainMap.keys()],
      mappingRules: null,
      notes: '使用当前量表题目 cognitiveDomainCodes',
    },
    computation: {
      computedAt,
      computedBy: toObjectId(input.actor.id),
      ruleSetCode: 'demo-item-domain-codes',
      ruleSetVersion: mappingVersion,
      engineVersion: 'demo-seed-v1',
      inputItemCount: input.bundle.items.length,
      contributionCount: [...domainMap.values()].reduce(
        (sum, value) => sum + value.contributions.length,
        0,
      ),
      domainCount: domainMap.size,
      includedContributionCount: [...domainMap.values()].reduce(
        (sum, value) => sum + value.contributions.length,
        0,
      ),
      excludedContributionCount: 0,
      warningCount: 0,
      notes: 'DEMO-01 虚构演示认知域计算',
    },
    review: { reviewStatus: 'not_required' },
    qualityStatus: 'passed',
    qualityHints: null,
    operatorNote: 'DEMO-01 虚构演示认知域结果',
    metadata: {
      demoSeed: {
        owner: DEMO_SEED_OWNER,
        scenario: input.bundle.patient.subjectCode,
      },
    },
    confirmedAt: null,
    lockedAt: null,
    voidedAt: null,
  });
}

async function createReport(input: {
  models: Models;
  bundle: ExecutionBundle;
  score: ScoreResultDocument;
  domain: CognitiveDomainResultDocument;
  actor: AuthenticatedUserContext;
  code: string;
  status: Extract<ClinicalReportStatus, 'draft' | 'confirmed'>;
  generatedAt: Date;
}): Promise<ClinicalReportDocument> {
  const reportActorRole = requireReportConfirmationRole(input.actor);
  const confirmedAt =
    input.status === 'confirmed' ? addMinutes(input.generatedAt, 15) : null;
  const generationMetadata = {
    version: 1,
    generationId: randomUUID(),
    generatedAt: input.generatedAt,
    generatedBy: input.actor.id,
    generatedByName: input.actor.displayName,
    generatedByRole: reportActorRole,
    engineVersion: 'demo-seed-v1',
    reportScope: 'explicit_primary_scale_instances',
    primaryScaleInstanceIds: [input.bundle.instance._id.toString()],
    scoreResultIds: [input.score._id.toString()],
    cognitiveDomainResultIds: [input.domain._id.toString()],
    mediaEvidenceCount: 0,
    aiUsed: false,
  };
  const confirmationMetadata = confirmedAt
    ? {
        a21Submission: {
          version: 1,
          submissionId: randomUUID(),
          submittedAt: addMinutes(input.generatedAt, 10),
          submittedBy: input.actor.id,
          submittedByName: input.actor.displayName,
          submittedByRole: reportActorRole,
          submissionNote: 'DEMO-01 虚构演示报告提交',
        },
        a21Confirmation: {
          version: 1,
          confirmationId: randomUUID(),
          confirmedAt,
          confirmedBy: input.actor.id,
          confirmedByName: input.actor.displayName,
          confirmedByRole: reportActorRole,
          confirmationNote: 'DEMO-01 虚构演示报告确认',
        },
      }
    : {};
  return input.models.reports.create({
    patientId: input.bundle.patient._id,
    assessmentVisitId: input.bundle.visit._id,
    primaryScaleInstanceIds: [input.bundle.instance._id],
    scoreResultIds: [input.score._id],
    cognitiveDomainResultIds: [input.domain._id],
    mediaEvidenceIds: [],
    subjectCode: input.bundle.patient.subjectCode,
    reportCode: input.code,
    reportNo: input.code,
    reportType: 'cognitive_assessment',
    status: input.status,
    reportVersion: 1,
    source: 'mixed',
    patientSnapshot: {
      subjectCode: input.bundle.patient.subjectCode,
      displayName: input.bundle.patient.displayName,
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
    },
    visitSnapshot: {
      visitCode: input.bundle.visit.visitCode,
      visitType: input.bundle.visit.visitType,
      assessmentDate: input.bundle.visit.assessmentDate,
      operatorName: input.actor.displayName,
      operatorRole: reportActorRole,
      clinicalContext: input.bundle.visit.clinicalContext,
    },
    scaleTraces: [
      {
        scaleInstanceId: input.bundle.instance._id,
        scaleCode: input.bundle.scale.code,
        scaleVersion: input.bundle.scale.version,
        crfVersion: input.bundle.scale.trace.crfVersion,
        scoringRuleVersion: input.bundle.scale.trace.scoringRuleVersion,
        fieldEncodingVersion: input.bundle.scale.trace.fieldEncodingVersion,
        domainMappingVersion: 'demo-item-domain-codes-v1',
        sourceDocument: input.bundle.scale.trace.sourceDocument,
      },
    ],
    scoreSnapshots: [
      {
        scoreResultId: input.score._id,
        scaleCode: input.bundle.scale.code,
        scaleName: input.bundle.scale.name,
        scaleVersion: input.bundle.scale.version,
        totalScoreValue: input.score.totalScore?.scoreValue,
        totalMaxScore: input.score.totalScore?.maxScore,
        totalMinScore: input.score.totalScore?.minScore,
        scorePercent: input.score.totalScore?.scorePercent,
        scoreStatus: input.score.status,
        qualityStatus: input.score.qualityStatus,
        summary: 'DEMO-01 虚构演示量表评分摘要',
        scoreDetails: null,
      },
    ],
    domainSnapshots: input.domain.domainScores.map((domainScore) => ({
      cognitiveDomainResultId: input.domain._id,
      scaleCode: input.bundle.scale.code,
      domainCode: domainScore.domainCode,
      domainTitle: domainScore.domainTitle,
      scoreValue: domainScore.scoreValue,
      maxScore: domainScore.maxScore,
      scorePercent: domainScore.scorePercent,
      weightedScore: domainScore.weightedScore,
      weightedMaxScore: domainScore.weightedMaxScore,
      itemCount: domainScore.itemCount,
      needsReviewItemCount: domainScore.needsReviewItemCount,
      summary: 'DEMO-01 虚构演示认知域摘要',
    })),
    evidenceSnapshots: [],
    narrative: {
      chiefSummary: `${input.bundle.patient.displayName}的虚构演示认知评估报告。`,
      scoreSummary: '本报告评分仅用于客户演示，不用于诊断。',
      domainSummary: '认知域结果为虚构演示数据。',
      evidenceSummary: '未创建媒体证据或 Storage / OSS 对象。',
      trendSummary: '历史趋势仅用于演示页面能力。',
      recommendationText: '请在演示中编辑此建议内容。',
      doctorOpinion: '演示医生意见，可在页面中继续编辑并提交。',
      limitations: '全部患者、作答、评分和报告均为明显标识的虚构演示数据。',
    },
    aiDraft: { status: 'not_requested', doctorEdited: false },
    confirmation: confirmedAt
      ? {
          confirmedAt,
          confirmedBy: toObjectId(input.actor.id),
          confirmedByName: input.actor.displayName,
          confirmedByRole: reportActorRole,
          confirmationNote: 'DEMO-01 虚构演示报告确认',
          signatureText: input.actor.displayName,
        }
      : null,
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
    operatorNote: 'DEMO-01 虚构客户演示报告',
    metadata: {
      demoSeed: {
        owner: DEMO_SEED_OWNER,
        scenario: input.bundle.patient.subjectCode,
      },
      a20Generation: generationMetadata,
      ...confirmationMetadata,
    },
  });
}

async function finalizeReport(input: {
  report: ClinicalReportDocument;
  bundle: ExecutionBundle;
  actor: AuthenticatedUserContext;
  services: Services;
}): Promise<void> {
  let current = await input.services.reports.findReportByOwnership({
    reportId: input.report._id.toString(),
    patientId: input.bundle.patient._id.toString(),
    assessmentVisitId: input.bundle.visit._id.toString(),
  });
  if (!current?.updatedAt) {
    fail(
      'DEMO_SEED_REPORT_LOCK_PREREQUISITE_MISSING',
      'Report cannot be locked',
    );
  }
  await input.services.reportLock.lockClinicalReport(
    input.bundle.patient._id.toString(),
    input.bundle.visit._id.toString(),
    input.report._id.toString(),
    input.actor,
    {
      confirm: true,
      lockNote: 'DEMO-01 虚构演示报告锁定',
      expectedUpdatedAt: current.updatedAt.toISOString(),
    },
  );
  current = await input.services.reports.findReportByOwnership({
    reportId: input.report._id.toString(),
    patientId: input.bundle.patient._id.toString(),
    assessmentVisitId: input.bundle.visit._id.toString(),
  });
  if (!current?.updatedAt) {
    fail(
      'DEMO_SEED_SOURCE_FREEZE_PREREQUISITE_MISSING',
      'Report sources cannot be frozen',
    );
  }
  await input.services.sourceFreeze.freezeClinicalReportSources(
    input.bundle.patient._id.toString(),
    input.bundle.visit._id.toString(),
    input.report._id.toString(),
    input.actor,
    {
      confirm: true,
      freezeNote: 'DEMO-01 虚构演示报告来源冻结',
      expectedUpdatedAt: current.updatedAt.toISOString(),
    },
  );
  current = await input.services.reports.findReportByOwnership({
    reportId: input.report._id.toString(),
    patientId: input.bundle.patient._id.toString(),
    assessmentVisitId: input.bundle.visit._id.toString(),
  });
  if (!current?.updatedAt) {
    fail(
      'DEMO_SEED_REPORT_ARCHIVE_PREREQUISITE_MISSING',
      'Report cannot be archived',
    );
  }
  await input.services.reportArchive.archiveClinicalReport(
    input.bundle.patient._id.toString(),
    input.bundle.visit._id.toString(),
    input.report._id.toString(),
    input.actor,
    {
      confirm: true,
      archiveNote: 'DEMO-01 虚构演示报告归档',
      expectedUpdatedAt: current.updatedAt.toISOString(),
    },
  );
}

function requiredEntry<T>(map: Map<string, T>, key: string): T {
  const value = map.get(key);
  if (!value) {
    fail('DEMO_SEED_INTERNAL_REFERENCE_MISSING', `Missing demo entry: ${key}`);
  }
  return value;
}

async function createScenarios(input: {
  models: Models;
  services: Services;
  patients: Map<string, PatientDocument>;
  accounts: Map<string, UserDocument>;
  scales: Record<'mmse' | 'moca', ScaleReference>;
}): Promise<void> {
  const doctor1 = toActor(requiredEntry(input.accounts, 'doctor1'));
  const doctor2 = toActor(requiredEntry(input.accounts, 'doctor2'));
  const nurse1 = toActor(requiredEntry(input.accounts, 'nurse1'));
  const research1 = toActor(requiredEntry(input.accounts, 'research1'));

  await createVisit({
    models: input.models,
    patient: requiredEntry(input.patients, 'DEMO-002'),
    ordinal: 1,
    visitType: 'baseline',
    status: 'draft',
    assessmentDate: new Date('2026-07-02T01:00:00.000Z'),
    actor: doctor1,
  });

  const visit3 = await createVisit({
    models: input.models,
    patient: requiredEntry(input.patients, 'DEMO-003'),
    ordinal: 1,
    visitType: 'baseline',
    status: 'in_progress',
    assessmentDate: new Date('2026-07-03T01:00:00.000Z'),
    actor: nurse1,
  });
  const execution3 = await createExecution({
    models: input.models,
    service: input.services.assessmentExecution,
    patient: requiredEntry(input.patients, 'DEMO-003'),
    visit: visit3,
    scale: input.scales.mmse,
    actor: nurse1,
    startedAt: visit3.assessmentDate,
  });
  await setPartialAnswers(execution3, [
    'mmse.language.repetition',
    'mmse.language.reading_command',
    'mmse.orientation.time',
  ]);

  const visit4 = await createVisit({
    models: input.models,
    patient: requiredEntry(input.patients, 'DEMO-004'),
    ordinal: 1,
    visitType: 'baseline',
    status: 'in_progress',
    assessmentDate: new Date('2026-07-04T01:00:00.000Z'),
    actor: research1,
  });
  const execution4 = await createExecution({
    models: input.models,
    service: input.services.assessmentExecution,
    patient: requiredEntry(input.patients, 'DEMO-004'),
    visit: visit4,
    scale: input.scales.moca,
    actor: research1,
    startedAt: visit4.assessmentDate,
  });
  await setPartialAnswers(execution4, [
    'moca.attention.digit_span_forward',
    'moca.attention.digit_span_backward',
    'moca.abstraction.train_bicycle',
  ]);

  const visit5 = await createVisit({
    models: input.models,
    patient: requiredEntry(input.patients, 'DEMO-005'),
    ordinal: 1,
    visitType: 'baseline',
    status: 'completed',
    assessmentDate: new Date('2026-07-05T01:00:00.000Z'),
    actor: doctor1,
  });
  const execution5 = await createExecution({
    models: input.models,
    service: input.services.assessmentExecution,
    patient: requiredEntry(input.patients, 'DEMO-005'),
    visit: visit5,
    scale: input.scales.mmse,
    actor: doctor1,
    startedAt: visit5.assessmentDate,
  });
  await completeExecution(execution5, doctor1, 21);
  await createScore({
    models: input.models,
    bundle: execution5,
    actor: doctor1,
    code: 'DEMO-005-SCORE-01',
    targetTotal: 21,
    status: 'needs_review',
  });

  const visit6 = await createVisit({
    models: input.models,
    patient: requiredEntry(input.patients, 'DEMO-006'),
    ordinal: 1,
    visitType: 'baseline',
    status: 'completed',
    assessmentDate: new Date('2026-07-06T01:00:00.000Z'),
    actor: doctor1,
  });
  const execution6 = await createExecution({
    models: input.models,
    service: input.services.assessmentExecution,
    patient: requiredEntry(input.patients, 'DEMO-006'),
    visit: visit6,
    scale: input.scales.moca,
    actor: doctor1,
    startedAt: visit6.assessmentDate,
  });
  await completeExecution(execution6, doctor1, 23);
  const score6 = await createScore({
    models: input.models,
    bundle: execution6,
    actor: doctor1,
    code: 'DEMO-006-SCORE-01',
    targetTotal: 23,
    status: 'confirmed',
  });
  const domain6 = await createDomainResult({
    models: input.models,
    bundle: execution6,
    score: score6,
    actor: doctor1,
    code: 'DEMO-006-DOMAIN-01',
  });
  await createReport({
    models: input.models,
    bundle: execution6,
    score: score6,
    domain: domain6,
    actor: doctor1,
    code: 'DEMO-006-REPORT-01',
    status: 'draft',
    generatedAt: addMinutes(visit6.assessmentDate, 65),
  });

  const visit7 = await createVisit({
    models: input.models,
    patient: requiredEntry(input.patients, 'DEMO-007'),
    ordinal: 1,
    visitType: 'baseline',
    status: 'completed',
    assessmentDate: new Date('2026-07-07T01:00:00.000Z'),
    actor: doctor1,
  });
  const execution7 = await createExecution({
    models: input.models,
    service: input.services.assessmentExecution,
    patient: requiredEntry(input.patients, 'DEMO-007'),
    visit: visit7,
    scale: input.scales.mmse,
    actor: doctor1,
    startedAt: visit7.assessmentDate,
  });
  await completeExecution(execution7, doctor1, 25);
  const score7 = await createScore({
    models: input.models,
    bundle: execution7,
    actor: doctor1,
    code: 'DEMO-007-SCORE-01',
    targetTotal: 25,
    status: 'confirmed',
  });
  const domain7 = await createDomainResult({
    models: input.models,
    bundle: execution7,
    score: score7,
    actor: doctor1,
    code: 'DEMO-007-DOMAIN-01',
  });
  const report7 = await createReport({
    models: input.models,
    bundle: execution7,
    score: score7,
    domain: domain7,
    actor: doctor1,
    code: 'DEMO-007-REPORT-01',
    status: 'confirmed',
    generatedAt: addMinutes(visit7.assessmentDate, 65),
  });
  await finalizeReport({
    report: report7,
    bundle: execution7,
    actor: doctor1,
    services: input.services,
  });

  const patient8 = requiredEntry(input.patients, 'DEMO-008');
  const trendDates = [
    new Date('2025-12-15T01:00:00.000Z'),
    new Date('2026-03-15T01:00:00.000Z'),
    new Date('2026-07-15T01:00:00.000Z'),
  ];
  const trendScores = [18, 21, 24];
  for (let index = 0; index < trendDates.length; index += 1) {
    const visit = await createVisit({
      models: input.models,
      patient: patient8,
      ordinal: index + 1,
      visitType: index === 0 ? 'baseline' : 'follow_up',
      status: 'completed',
      assessmentDate: trendDates[index],
      actor: doctor2,
    });
    const execution = await createExecution({
      models: input.models,
      service: input.services.assessmentExecution,
      patient: patient8,
      visit,
      scale: input.scales.mmse,
      actor: doctor2,
      startedAt: visit.assessmentDate,
    });
    await completeExecution(execution, doctor2, trendScores[index]);
    const score = await createScore({
      models: input.models,
      bundle: execution,
      actor: doctor2,
      code: `DEMO-008-SCORE-${String(index + 1).padStart(2, '0')}`,
      targetTotal: trendScores[index],
      status: 'confirmed',
    });
    const domain = await createDomainResult({
      models: input.models,
      bundle: execution,
      score,
      actor: doctor2,
      code: `DEMO-008-DOMAIN-${String(index + 1).padStart(2, '0')}`,
    });
    await createReport({
      models: input.models,
      bundle: execution,
      score,
      domain,
      actor: doctor2,
      code: `DEMO-008-REPORT-${String(index + 1).padStart(2, '0')}`,
      status: 'confirmed',
      generatedAt: addMinutes(visit.assessmentDate, 65),
    });
  }
}

function duplicateValues(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}

async function verifySeed(input: {
  models: Models;
  connection: Connection;
  services: Services;
  password: string;
  actualDatabaseName: string;
  cleanup: Record<string, number>;
  nonDemoBefore: NonDemoCounts;
}) {
  const accounts = await input.models.users
    .find({ accountName: { $in: ACCOUNT_NAMES } })
    .select('+passwordHash')
    .sort({ accountName: 1 });
  const patients = await input.models.patients
    .find({ subjectCode: { $in: SUBJECT_CODES } })
    .sort({ subjectCode: 1 });
  const patientIds = patients.map((patient) => patient._id);
  const visits = await input.models.visits
    .find({ patientId: { $in: patientIds } })
    .sort({ assessmentDate: 1 });
  const visitIds = visits.map((visit) => visit._id);
  const instances = await input.models.instances
    .find({ patientId: { $in: patientIds } })
    .sort({ instanceCode: 1 });
  const instanceIds = instances.map((instance) => instance._id);
  const [items, scores, domains, reports] = await Promise.all([
    input.models.items.find({ patientId: { $in: patientIds } }),
    input.models.scores.find({ patientId: { $in: patientIds } }),
    input.models.domains.find({ patientId: { $in: patientIds } }),
    input.models.reports.find({ patientId: { $in: patientIds } }),
  ]);
  const reportIds = reports.map((report) => report._id);
  const owned: OwnedIds = {
    userIds: accounts.map((account) => account._id),
    patientIds,
    visitIds,
    instanceIds,
    reportIds,
  };
  const nonDemoAfter = await snapshotNonDemoCounts(
    input.models,
    input.connection,
    owned,
  );
  const nonDemoDataStable = Object.keys(input.nonDemoBefore).every(
    (key) =>
      input.nonDemoBefore[key as keyof NonDemoCounts] ===
      nonDemoAfter[key as keyof NonDemoCounts],
  );
  const passwordChecks = await Promise.all(
    accounts.map((account) =>
      input.services.auth.verifyPassword(input.password, account.passwordHash),
    ),
  );
  const accountContractValid = ACCOUNT_SEEDS.every((seed) => {
    const account = accounts.find(
      (candidate) => candidate.accountName === seed.accountName,
    );
    return Boolean(
      account &&
      account.displayName === seed.displayName &&
      account.userType === seed.userType &&
      account.status === 'active' &&
      account.roles.length === 1 &&
      account.roles[0] === seed.role &&
      account.permissions.length === 0,
    );
  });
  const patientIdSet = new Set(patientIds.map((id) => id.toString()));
  const visitIdSet = new Set(visitIds.map((id) => id.toString()));
  const instanceIdSet = new Set(instanceIds.map((id) => id.toString()));
  const scoreIdSet = new Set(scores.map((score) => score._id.toString()));
  const domainIdSet = new Set(domains.map((domain) => domain._id.toString()));
  const definitionIds = new Set(
    (
      await input.models.scaleDefinitions
        .find({ code: { $in: ['mmse', 'moca'] } })
        .select('_id')
    ).map((definition) => definition._id.toString()),
  );
  const versionIds = new Set(
    (
      await input.models.scaleVersions
        .find({ scaleCode: { $in: ['mmse', 'moca'] } })
        .select('_id')
    ).map((version) => version._id.toString()),
  );
  let orphanReferenceCount = 0;
  visits.forEach((visit) => {
    if (!patientIdSet.has(visit.patientId.toString()))
      orphanReferenceCount += 1;
  });
  instances.forEach((instance) => {
    if (
      !patientIdSet.has(instance.patientId.toString()) ||
      !visitIdSet.has(instance.assessmentVisitId.toString()) ||
      !definitionIds.has(instance.scaleDefinitionId.toString()) ||
      !versionIds.has(instance.scaleVersionId.toString())
    ) {
      orphanReferenceCount += 1;
    }
  });
  items.forEach((item) => {
    if (
      !patientIdSet.has(item.patientId.toString()) ||
      !visitIdSet.has(item.assessmentVisitId.toString()) ||
      !instanceIdSet.has(item.scaleInstanceId.toString())
    ) {
      orphanReferenceCount += 1;
    }
  });
  scores.forEach((score) => {
    if (
      !patientIdSet.has(score.patientId.toString()) ||
      !visitIdSet.has(score.assessmentVisitId.toString()) ||
      !instanceIdSet.has(score.scaleInstanceId.toString())
    ) {
      orphanReferenceCount += 1;
    }
  });
  domains.forEach((domain) => {
    if (
      !patientIdSet.has(domain.patientId.toString()) ||
      !visitIdSet.has(domain.assessmentVisitId.toString()) ||
      !instanceIdSet.has(domain.scaleInstanceId.toString()) ||
      !scoreIdSet.has(domain.scoreResultId.toString())
    ) {
      orphanReferenceCount += 1;
    }
  });
  reports.forEach((report) => {
    const invalid =
      !patientIdSet.has(report.patientId.toString()) ||
      !visitIdSet.has(report.assessmentVisitId.toString()) ||
      report.primaryScaleInstanceIds.some(
        (id) => !instanceIdSet.has(id.toString()),
      ) ||
      report.scoreResultIds.some((id) => !scoreIdSet.has(id.toString())) ||
      report.cognitiveDomainResultIds.some(
        (id) => !domainIdSet.has(id.toString()),
      );
    if (invalid) orphanReferenceCount += 1;
  });
  const trend = await input.services.clinicalHistory.getPatientFollowUpTrend(
    requiredEntry(
      new Map(patients.map((patient) => [patient.subjectCode, patient])),
      'DEMO-008',
    )._id.toString(),
    { scaleCode: 'mmse', maxPoints: 50 },
  );
  const scenarios = patients.map((patient) => {
    const scenarioVisits = visits.filter((visit) =>
      idsEqual(visit.patientId, patient._id),
    );
    const scenarioInstances = instances.filter((instance) =>
      idsEqual(instance.patientId, patient._id),
    );
    const scenarioInstanceIds = new Set(
      scenarioInstances.map((instance) => instance._id.toString()),
    );
    const scenarioScores = scores.filter((score) =>
      idsEqual(score.patientId, patient._id),
    );
    const scenarioDomains = domains.filter((domain) =>
      idsEqual(domain.patientId, patient._id),
    );
    const scenarioReports = reports.filter((report) =>
      idsEqual(report.patientId, patient._id),
    );
    return {
      subjectCode: patient.subjectCode,
      displayName: patient.displayName,
      counts: {
        visits: scenarioVisits.length,
        scaleInstances: scenarioInstances.length,
        itemResponses: items.filter((item) =>
          scenarioInstanceIds.has(item.scaleInstanceId.toString()),
        ).length,
        scoreResults: scenarioScores.length,
        cognitiveDomainResults: scenarioDomains.length,
        reports: scenarioReports.length,
        trendPoints:
          patient.subjectCode === 'DEMO-008' ? trend.range.pointCount : 0,
      },
      states: {
        visits: scenarioVisits.map((visit) => visit.status),
        scaleInstances: scenarioInstances.map((instance) => instance.status),
        scoreResults: scenarioScores.map((score) => score.status),
        cognitiveDomains: scenarioDomains.map((domain) => domain.status),
        reports: scenarioReports.map((report) => report.status),
      },
    };
  });
  const duplicateSubjectCodes = duplicateValues(
    patients.map((patient) => patient.subjectCode),
  );
  const duplicateAccountNames = duplicateValues(
    accounts.map((account) => account.accountName),
  );
  const mediaEvidenceCount = await input.connection
    .collection(MEDIA_COLLECTION)
    .countDocuments(derivedOwnershipFilter(owned));
  const sessionCount = await input.models.sessions.countDocuments({
    userId: { $in: owned.userIds },
  });
  const valid =
    accounts.length === 8 &&
    patients.length === 8 &&
    accountContractValid &&
    passwordChecks.every(Boolean) &&
    duplicateSubjectCodes.length === 0 &&
    duplicateAccountNames.length === 0 &&
    orphanReferenceCount === 0 &&
    trend.range.pointCount === 3 &&
    trend.points.every((point) => point.dataStatus === 'available') &&
    mediaEvidenceCount === 0 &&
    sessionCount === 0 &&
    nonDemoDataStable;
  if (!valid) {
    fail('DEMO_SEED_SELF_CHECK_FAILED', 'Demo seed terminal self-check failed');
  }
  return {
    ok: true,
    seedOwner: DEMO_SEED_OWNER,
    actualDatabaseName: input.actualDatabaseName,
    databaseGate: 'exact_match',
    cleanup: input.cleanup,
    totals: {
      accounts: accounts.length,
      sessions: sessionCount,
      patients: patients.length,
      visits: visits.length,
      scaleInstances: instances.length,
      itemResponses: items.length,
      scoreResults: scores.length,
      cognitiveDomainResults: domains.length,
      reports: reports.length,
      mediaEvidence: mediaEvidenceCount,
      trendPoints: trend.range.pointCount,
    },
    accounts: accounts.map((account, index) => ({
      accountName: account.accountName,
      displayName: account.displayName,
      roles: [...account.roles],
      userType: account.userType,
      status: account.status,
      permissions: [...account.permissions],
      passwordVerified: passwordChecks[index],
    })),
    scenarios,
    integrity: {
      duplicateSubjectCodes,
      duplicateAccountNames,
      orphanReferenceCount,
      passwordVerification: `${passwordChecks.filter(Boolean).length}/8`,
      nonDemoDataStable,
      productionDatabaseAccessed:
        input.actualDatabaseName === PRODUCTION_DATABASE,
      standardTestDatabaseAccessed: false,
      browserTestDatabaseAccessed: false,
      storageObjectsCreated: 0,
    },
  };
}

function writeSafeError(error: unknown): void {
  const known = error instanceof DemoSeedError;
  console.error(
    JSON.stringify({
      ok: false,
      code: known ? error.code : 'DEMO_SEED_OPERATION_FAILED',
      message: known
        ? error.message
        : 'Demo seed failed without exposing configuration or credentials',
    }),
  );
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    const password = assertPreImportGate();
    const [{ NestFactory }, mongooseModule] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/mongoose'),
    ]);
    // Application configuration is deliberately loaded only after the process gate.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as AppModuleExport;
    app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: false,
    });
    connection = app.get<Connection>(mongooseModule.getConnectionToken());
    assertConnectedDatabase(connection, app.get(ConfigService));
    const models = getModels(app);
    const services = getServices(app);
    const existingOwned = await resolveOwnedIds(models);
    const nonDemoBefore = await snapshotNonDemoCounts(
      models,
      connection,
      existingOwned,
    );
    const cleanup = await cleanupOwnedData(models, connection, existingOwned);
    const [mmse, moca] = await Promise.all([
      materializeScale('mmse', models, services),
      materializeScale('moca', models, services),
    ]);
    const accounts = await createAccounts(password, models, services.auth);
    const patients = await createPatients(models);
    await createScenarios({
      models,
      services,
      patients,
      accounts,
      scales: { mmse, moca },
    });
    const summary = await verifySeed({
      models,
      connection,
      services,
      password,
      actualDatabaseName: connection.name,
      cleanup,
      nonDemoBefore,
    });
    console.log(JSON.stringify(summary, null, 2));
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
    const readyState = Number(connection?.readyState ?? 0);
    if (readyState !== 0) process.exitCode = 1;
    console.log(
      JSON.stringify({
        demoSeedConnectionClosed: readyState === 0,
        readyState,
      }),
    );
  }
}

void run();
