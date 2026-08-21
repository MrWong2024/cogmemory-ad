import 'reflect-metadata';

import { createHash } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve } from 'node:path';
import type { INestApplicationContext, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Connection, type Model } from 'mongoose';
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
import { PatientAdministrationSession, type PatientAdministrationSessionDocument } from '../src/modules/assessments/schemas/patient-administration-session.schema';
// prettier-ignore
import { ScaleInstance, type ScaleInstanceDocument } from '../src/modules/assessments/schemas/scale-instance.schema';
import { AssessmentExecutionService } from '../src/modules/assessments/services/assessment-execution.service';
// prettier-ignore
import { Session, type SessionDocument } from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
// prettier-ignore
import { MediaEvidence, type MediaEvidenceDocument } from '../src/modules/media/schemas/media-evidence.schema';
// prettier-ignore
import { Patient, type PatientDocument } from '../src/modules/patients/schemas/patient.schema';
// prettier-ignore
import { User, type UserDocument } from '../src/modules/users/schemas/user.schema';

type Command = 'prepare' | 'verify-prepared' | 'verify-post' | 'cleanup';
type Profile = 'same-device' | 'cross-device';

type Descriptor = {
  schemaVersion: 1;
  batch: 'patient-administration-handoff';
  profile: Profile;
  namespace: string;
  accounts: { staff: { loginIdentifier: string } };
  scenario: {
    patientId: string;
    visitId: string;
    scaleInstanceId: string;
    navigationPath: string;
    itemCount: number;
    itemBaselineHash: string;
    scaleInstanceProtectedBaselineHash: string;
  };
};

type Models = {
  users: Model<UserDocument>;
  authSessions: Model<SessionDocument>;
  patients: Model<PatientDocument>;
  visits: Model<AssessmentVisitDocument>;
  instances: Model<ScaleInstanceDocument>;
  items: Model<ItemResponseDocument>;
  administrations: Model<PatientAdministrationSessionDocument>;
  media: Model<MediaEvidenceDocument>;
};

type ExistingMmseCatalogReference = {
  scaleDefinitionId: string;
  scaleVersionId: string;
  scaleVersion: string;
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
const SYNTHETIC_PASSWORD = '12345678';
const BASE_DATE = new Date('2026-08-22T00:00:00.000Z');

function fail(code: string, message: string): never {
  throw new FixtureError(code, message);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) fail('HANDOFF_ENV_INVALID', `${name} is invalid`);
  return value;
}

function parseProfile(): Profile {
  const value = process.env.PATIENT_ADMIN_HANDOFF_PROFILE;
  if (value !== 'same-device' && value !== 'cross-device') {
    fail('HANDOFF_PROFILE_INVALID', 'Profile is not supported');
  }
  return value;
}

function parseCommand(): Command {
  const [command, extra] = process.argv.slice(2);
  if (
    (command !== 'prepare' &&
      command !== 'verify-prepared' &&
      command !== 'verify-post' &&
      command !== 'cleanup') ||
    extra
  ) {
    fail(
      'HANDOFF_COMMAND_INVALID',
      'Use prepare, verify-prepared, verify-post, or cleanup',
    );
  }
  if (
    command === 'cleanup' &&
    process.env.PATIENT_ADMIN_HANDOFF_CONFIRM_CLEANUP !== '1'
  ) {
    fail(
      'HANDOFF_CLEANUP_CONFIRMATION_REQUIRED',
      'Cleanup requires explicit confirmation',
    );
  }
  return command;
}

function parseRuntimePath(): string {
  const path = resolve(required('PATIENT_ADMIN_HANDOFF_RUNTIME_PATH'));
  const root = resolve(
    process.cwd(),
    '..',
    '.local',
    'deliverables',
    'patient-administration-handoff',
  );
  const child = relative(root, path);
  if (!child || child.startsWith('..') || isAbsolute(child)) {
    fail(
      'HANDOFF_RUNTIME_PATH_INVALID',
      'Runtime descriptor must stay inside the profile deliverables directory',
    );
  }
  return path;
}

function accountName(namespace: string): string {
  return `pah-${namespace}-doctor`;
}

function subjectCode(namespace: string): string {
  return `PAH-${namespace.toUpperCase()}`;
}

function visitCode(namespace: string): string {
  return `${subjectCode(namespace)}-VISIT`;
}

function operator(user: UserDocument) {
  return {
    operatorId: user._id,
    operatorName: user.displayName,
    operatorRole: 'doctor' as const,
  };
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function itemFacts(items: ItemResponseDocument[]): unknown {
  return items
    .sort((left, right) => left.itemOrder - right.itemOrder)
    .map((item) => ({
      id: item._id.toString(),
      itemCode: item.itemCode,
      status: item.status,
      draftRevision: item.draftRevision,
      responseText: item.responseText ?? null,
      rawResponse: item.rawResponse ?? null,
      structuredResponse: item.structuredResponse ?? null,
      evidenceRefs: item.evidenceRefs,
      timing: item.timing ?? null,
    }));
}

function scaleInstanceProtectedFacts(instance: ScaleInstanceDocument): unknown {
  return {
    id: instance._id.toString(),
    completedAt: instance.completedAt ?? null,
    lockedAt: instance.lockedAt ?? null,
    voidedAt: instance.voidedAt ?? null,
    durationMs: instance.durationMs ?? null,
    progress: instance.progress ?? null,
    qualityControlSummary: instance.qualityControlSummary ?? null,
    submissionWriteBarrier: instance.submissionWriteBarrier ?? null,
    metadata: instance.metadata ?? null,
  };
}

function assertRuntime(config: ConfigService, connection: Connection): void {
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.COGMEMORY_DATABASE_PURPOSE !== 'browser_acceptance' ||
    connection.name !== DB ||
    config.get<string>('app.env') !== 'test' ||
    config.get<string>('storage.driver') !== 'fake' ||
    config.get<string>('asr.provider') !== 'stub' ||
    config.get<string>('llm.provider') !== 'stub' ||
    config.get<string>('smsAuth.provider') !== 'stub' ||
    config.get<boolean>('session.cookieSecure') !== false
  ) {
    fail('HANDOFF_RUNTIME_GATE_FAILED', 'Fixture runtime is not isolated');
  }
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

function assertDescriptorSafety(descriptor: Descriptor): void {
  const serialized = JSON.stringify(descriptor).toLowerCase();
  const forbidden = [
    SYNTHETIC_PASSWORD,
    'mongodb://',
    'mongodb+srv://',
    'passwordhash',
    'cookie',
    'token',
    'entrycode',
  ];
  if (forbidden.some((value) => serialized.includes(value))) {
    fail(
      'HANDOFF_RUNTIME_UNSAFE',
      'Runtime descriptor contains a forbidden value',
    );
  }
}

async function readDescriptor(
  path: string,
  profile: Profile,
): Promise<Descriptor> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    fail(
      'HANDOFF_RUNTIME_UNAVAILABLE',
      'Safe runtime descriptor is unavailable',
    );
  }
  const descriptor = value as Partial<Descriptor>;
  const scenario = descriptor.scenario;
  if (
    descriptor.schemaVersion !== 1 ||
    descriptor.batch !== 'patient-administration-handoff' ||
    descriptor.profile !== profile ||
    typeof descriptor.namespace !== 'string' ||
    typeof descriptor.accounts?.staff.loginIdentifier !== 'string' ||
    !scenario ||
    !isObjectId(scenario.patientId) ||
    !isObjectId(scenario.visitId) ||
    !isObjectId(scenario.scaleInstanceId) ||
    scenario.navigationPath !==
      `/patients/${scenario.patientId}/visits/${scenario.visitId}/scale-instances/${scenario.scaleInstanceId}` ||
    !Number.isSafeInteger(scenario.itemCount) ||
    scenario.itemCount < 1 ||
    !/^[a-f\d]{64}$/i.test(scenario.itemBaselineHash) ||
    !/^[a-f\d]{64}$/i.test(scenario.scaleInstanceProtectedBaselineHash)
  ) {
    fail('HANDOFF_RUNTIME_INVALID', 'Safe runtime descriptor is invalid');
  }
  assertDescriptorSafety(descriptor as Descriptor);
  return descriptor as Descriptor;
}

async function writeDescriptor(
  path: string,
  descriptor: Descriptor,
): Promise<void> {
  assertDescriptorSafety(descriptor);
  await writeFile(path, `${JSON.stringify(descriptor, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
}

async function assertUnused(namespace: string, models: Models): Promise<void> {
  const counts = await Promise.all([
    models.users.countDocuments({ accountName: accountName(namespace) }),
    models.patients.countDocuments({ subjectCode: subjectCode(namespace) }),
    models.visits.countDocuments({ visitCode: visitCode(namespace) }),
  ]);
  if (counts.some((count) => count !== 0)) {
    fail('HANDOFF_NAMESPACE_EXISTS', 'The exact namespace is already in use');
  }
}

async function resolveExistingMmseCatalog(
  models: Models,
): Promise<ExistingMmseCatalogReference> {
  const [definitionValue, versionValue] = await Promise.all([
    models.items.db.collection('scale_definitions').findOne({ code: 'mmse' }),
    models.items.db
      .collection('scale_versions')
      .findOne({ scaleCode: 'mmse', version: '1.0' }),
  ]);
  const definition = definitionValue as {
    _id?: unknown;
    status?: unknown;
  } | null;
  const version = versionValue as {
    _id?: unknown;
    scaleDefinitionId?: unknown;
    status?: unknown;
    scaleCode?: unknown;
    version?: unknown;
    patientAdministrationSteps?: unknown;
    presentationPackageKey?: unknown;
  } | null;
  if (
    !definition ||
    !(definition._id instanceof Types.ObjectId) ||
    definition.status !== 'active' ||
    !version ||
    !(version._id instanceof Types.ObjectId) ||
    !(version.scaleDefinitionId instanceof Types.ObjectId) ||
    !version.scaleDefinitionId.equals(definition._id) ||
    version.status !== 'active' ||
    version.scaleCode !== 'mmse' ||
    version.version !== '1.0' ||
    !Array.isArray(version.patientAdministrationSteps) ||
    version.patientAdministrationSteps.length < 1 ||
    typeof version.presentationPackageKey !== 'string' ||
    !version.presentationPackageKey
  ) {
    fail(
      'HANDOFF_MMSE_CATALOG_UNAVAILABLE',
      'The shared active MMSE 1.0 catalog is unavailable',
    );
  }
  return {
    scaleDefinitionId: definition._id.toString(),
    scaleVersionId: version._id.toString(),
    scaleVersion: version.version,
  };
}

async function createFixture(input: {
  profile: Profile;
  namespace: string;
  path: string;
  models: Models;
  execution: AssessmentExecutionService;
  auth: AuthService;
}): Promise<Descriptor> {
  const catalog = await resolveExistingMmseCatalog(input.models);
  const passwordHash = await input.auth.hashPassword(SYNTHETIC_PASSWORD);
  const user = await input.models.users.create({
    accountName: accountName(input.namespace),
    displayName: '患者施测交接测试医生',
    staffCode: `PAH-${input.namespace}-doctor`,
    passwordHash,
    passwordChangedAt: BASE_DATE,
    roles: ['doctor'],
    permissions: [],
    userType: 'doctor',
    status: 'active',
    failedLoginCount: 0,
    lockedUntil: null,
    metadata: null,
  });
  const patient = await input.models.patients.create({
    subjectCode: subjectCode(input.namespace),
    displayName: '患者施测交接脱敏受试者',
    sourceType: 'research',
    sex: 'unknown',
    birthDate: null,
    educationYears: 12,
    handedness: 'unknown',
    status: 'active',
    tags: ['patient-administration-handoff', 'synthetic'],
    notes: 'Synthetic patient administration handoff browser fixture only',
    externalRefs: null,
    metadata: null,
  });
  const visit = await input.models.visits.create({
    patientId: patient._id,
    subjectCode: patient.subjectCode,
    visitCode: visitCode(input.namespace),
    visitType: 'baseline',
    status: 'in_progress',
    assessmentDate: BASE_DATE,
    startedAt: BASE_DATE,
    completedAt: null,
    lockedAt: null,
    voidedAt: null,
    operatorSnapshot: null,
    clinicalContext: null,
    notes: 'Synthetic patient administration handoff browser fixture visit',
    metadata: null,
  });
  const executionPlan = input.execution.buildScaleExecutionPlan({
    patientId: patient._id,
    assessmentVisitId: visit._id,
    subjectCode: patient.subjectCode,
    scaleDefinitionId: catalog.scaleDefinitionId,
    scaleVersionId: catalog.scaleVersionId,
    scaleCode: 'mmse',
    scaleVersion: catalog.scaleVersion,
    instanceCode: `INST-${visit._id.toString().toUpperCase()}-MMSE-1`,
    instanceNo: 1,
    administrationMode: 'supervised_patient_input',
    operatorSnapshot: operator(user),
    startedAt: null,
    metadata: null,
  });
  const initialized =
    await input.execution.createScaleExecutionFromPlan(executionPlan);
  const instance = await input.models.instances.findById(
    initialized.scaleInstance.id,
  );
  const items = await input.models.items
    .find({ scaleInstanceId: initialized.scaleInstance.id })
    .sort({ itemOrder: 1 })
    .exec();
  if (!instance || items.length < 1) {
    fail('HANDOFF_SKELETON_MISSING', 'MMSE fixture skeleton was not created');
  }
  const descriptor: Descriptor = {
    schemaVersion: 1,
    batch: 'patient-administration-handoff',
    profile: input.profile,
    namespace: input.namespace,
    accounts: { staff: { loginIdentifier: user.accountName } },
    scenario: {
      patientId: patient._id.toString(),
      visitId: visit._id.toString(),
      scaleInstanceId: instance._id.toString(),
      navigationPath: `/patients/${patient._id.toString()}/visits/${visit._id.toString()}/scale-instances/${instance._id.toString()}`,
      itemCount: items.length,
      itemBaselineHash: hash(itemFacts(items)),
      scaleInstanceProtectedBaselineHash: hash(
        scaleInstanceProtectedFacts(instance),
      ),
    },
  };
  await writeDescriptor(input.path, descriptor);
  return descriptor;
}

async function assertPrepared(input: {
  descriptor: Descriptor;
  namespace: string;
  models: Models;
  auth: AuthService;
}): Promise<Record<string, unknown>> {
  if (input.descriptor.namespace !== input.namespace) {
    fail('HANDOFF_NAMESPACE_MISMATCH', 'Runtime namespace mismatch');
  }
  const { scenario } = input.descriptor;
  const user = await input.models.users
    .findOne({ accountName: input.descriptor.accounts.staff.loginIdentifier })
    .select('+passwordHash');
  const catalog = await resolveExistingMmseCatalog(input.models);
  const [patient, visit, instance, items, administrationCount, mediaCount] =
    await Promise.all([
      input.models.patients.findById(scenario.patientId),
      input.models.visits.findById(scenario.visitId),
      input.models.instances.findById(scenario.scaleInstanceId),
      input.models.items
        .find({ scaleInstanceId: scenario.scaleInstanceId })
        .sort({ itemOrder: 1 })
        .exec(),
      input.models.administrations.countDocuments({
        scaleInstanceId: scenario.scaleInstanceId,
      }),
      input.models.media.countDocuments({
        scaleInstanceId: scenario.scaleInstanceId,
      }),
    ]);
  const authCount = user
    ? await input.models.authSessions.countDocuments({ userId: user._id })
    : -1;
  const passwordValid = Boolean(
    user &&
    (await input.auth.verifyPassword(SYNTHETIC_PASSWORD, user.passwordHash)),
  );
  const downstreamCount = await countDownstream(
    input.models,
    scenario.patientId,
    scenario.visitId,
    scenario.scaleInstanceId,
  );
  const checks: Record<string, boolean> = {
    staff: Boolean(
      user &&
      passwordValid &&
      user.status === 'active' &&
      user.roles.includes('doctor'),
    ),
    patient: patient?.status === 'active',
    visit: visit?.status === 'in_progress',
    instance: Boolean(
      instance &&
      instance.status === 'draft' &&
      !instance.startedAt &&
      instance.scaleCode === 'mmse' &&
      instance.scaleVersion === '1.0' &&
      instance.scaleDefinitionId.toString() === catalog.scaleDefinitionId &&
      instance.scaleVersionId.toString() === catalog.scaleVersionId &&
      instance.administrationMode === 'supervised_patient_input' &&
      hash(scaleInstanceProtectedFacts(instance)) ===
        scenario.scaleInstanceProtectedBaselineHash,
    ),
    items:
      items.length === scenario.itemCount &&
      hash(itemFacts(items)) === scenario.itemBaselineHash,
    noAdministration: administrationCount === 0,
    noAuth: authCount === 0,
    noEvidence: mediaCount === 0,
    noDownstream: downstreamCount === 0,
  };
  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failed.length > 0) {
    fail(
      'HANDOFF_PREPARED_INVALID',
      `Prepared checks failed: ${failed.join(',')}`,
    );
  }
  return {
    profile: input.descriptor.profile,
    sharedCatalog: 'active_mmse_1_0_read_only',
    syntheticStaffLogin: 'available',
    scaleExecution: 'draft_and_available',
    itemCount: items.length,
    patientAdministrationCount: 0,
    authSessionCount: 0,
    mediaEvidenceCount: 0,
    downstreamResultCount: 0,
  };
}

async function countDownstream(
  models: Models,
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
): Promise<number> {
  const [scores, domains, reports] = await Promise.all([
    models.items.db.collection('score_results').countDocuments({
      scaleInstanceId: new Types.ObjectId(scaleInstanceId),
    }),
    models.items.db.collection('cognitive_domain_results').countDocuments({
      scaleInstanceId: new Types.ObjectId(scaleInstanceId),
    }),
    models.items.db.collection('clinical_reports').countDocuments({
      patientId: new Types.ObjectId(patientId),
      assessmentVisitId: new Types.ObjectId(visitId),
    }),
  ]);
  return scores + domains + reports;
}

function actionCount(
  administration: PatientAdministrationSessionDocument,
  action: string,
): number {
  return administration.controlEvents.filter((event) => event.action === action)
    .length;
}

async function assertPost(input: {
  descriptor: Descriptor;
  profile: Profile;
  namespace: string;
  models: Models;
}): Promise<Record<string, unknown>> {
  if (input.descriptor.namespace !== input.namespace) {
    fail('HANDOFF_NAMESPACE_MISMATCH', 'Runtime namespace mismatch');
  }
  const { scenario } = input.descriptor;
  const user = await input.models.users.findOne({
    accountName: input.descriptor.accounts.staff.loginIdentifier,
  });
  const [instance, items, administrations, media, downstreamCount] =
    await Promise.all([
      input.models.instances.findById(scenario.scaleInstanceId),
      input.models.items
        .find({ scaleInstanceId: scenario.scaleInstanceId })
        .sort({ itemOrder: 1 })
        .exec(),
      input.models.administrations
        .find({ scaleInstanceId: scenario.scaleInstanceId })
        .select('+entryCodeHash +sessionTokenHash')
        .exec(),
      input.models.media.find({ scaleInstanceId: scenario.scaleInstanceId }),
      countDownstream(
        input.models,
        scenario.patientId,
        scenario.visitId,
        scenario.scaleInstanceId,
      ),
    ]);
  const authSessions = user
    ? await input.models.authSessions.find({ userId: user._id })
    : [];
  if (
    !instance ||
    hash(scaleInstanceProtectedFacts(instance)) !==
      scenario.scaleInstanceProtectedBaselineHash ||
    items.length !== scenario.itemCount ||
    hash(itemFacts(items)) !== scenario.itemBaselineHash ||
    administrations.length !== 1 ||
    media.length !== 0 ||
    downstreamCount !== 0
  ) {
    fail('HANDOFF_POST_BOUNDARY_INVALID', 'Post boundary facts are invalid');
  }
  const administration = administrations[0];
  if (
    administration.stepCaptures.length !== 0 ||
    administration.stepEvidenceRefs.length !== 0
  ) {
    fail('HANDOFF_STEP_SIDE_EFFECT', 'Formal step side effects were created');
  }
  if (input.profile === 'same-device') {
    const valid =
      administration.deviceMode === 'same_device' &&
      administration.status === 'active' &&
      Boolean(administration.preparationConfirmedAt) &&
      Boolean(administration.startedAt) &&
      Boolean(administration.sessionTokenHash) &&
      !administration.entryCodeHash &&
      !administration.entryCodeExpiresAt &&
      actionCount(administration, 'preparation_confirmed') === 1 &&
      actionCount(administration, 'same_device_handoff') === 1 &&
      instance.status === 'in_progress' &&
      Boolean(instance.startedAt) &&
      authSessions.length === 1 &&
      authSessions[0].status === 'revoked' &&
      Boolean(authSessions[0].revokedAt);
    if (!valid) {
      fail(
        'HANDOFF_SAME_DEVICE_POST_INVALID',
        'Same-device post facts are invalid',
      );
    }
    return {
      profile: input.profile,
      deviceMode: administration.deviceMode,
      status: administration.status,
      requiredActionsPresent: true,
      credentialState: 'patient_only',
      staffAuthSession: 'revoked',
      itemFacts: 'unchanged',
      formalStepSideEffects: 0,
      mediaEvidenceCount: 0,
      downstreamResultCount: 0,
    };
  }
  const valid =
    administration.deviceMode === 'cross_device' &&
    administration.status === 'prepared' &&
    !administration.preparationConfirmedAt &&
    !administration.startedAt &&
    Boolean(administration.entryCodeHash) &&
    Boolean(administration.entryCodeExpiresAt) &&
    !administration.sessionTokenHash &&
    actionCount(administration, 'entry_redeemed') === 1 &&
    actionCount(administration, 'device_reissued') === 1 &&
    instance.status === 'draft' &&
    !instance.startedAt &&
    authSessions.length === 1 &&
    authSessions[0].status === 'active' &&
    !authSessions[0].revokedAt;
  if (!valid) {
    fail(
      'HANDOFF_CROSS_DEVICE_POST_INVALID',
      'Cross-device post facts are invalid',
    );
  }
  return {
    profile: input.profile,
    deviceMode: administration.deviceMode,
    status: administration.status,
    requiredActionsPresent: true,
    credentialState: 'fresh_entry_only',
    staffAuthSession: 'active',
    itemFacts: 'unchanged',
    formalStepSideEffects: 0,
    mediaEvidenceCount: 0,
    downstreamResultCount: 0,
  };
}

async function cleanup(
  namespace: string,
  profile: Profile,
  path: string,
  models: Models,
): Promise<Record<string, unknown>> {
  const [users, patients, visits] = await Promise.all([
    models.users
      .find({ accountName: accountName(namespace) })
      .select({ _id: 1 }),
    models.patients
      .find({ subjectCode: subjectCode(namespace) })
      .select({ _id: 1 }),
    models.visits.find({ visitCode: visitCode(namespace) }).select({ _id: 1 }),
  ]);
  const userIds = users.map((entry) => entry._id);
  const patientIds = patients.map((entry) => entry._id);
  const visitIds = visits.map((entry) => entry._id);
  const instances = await models.instances
    .find({
      patientId: { $in: patientIds },
      assessmentVisitId: { $in: visitIds },
    })
    .select({ _id: 1 });
  const instanceIds = instances.map((entry) => entry._id);
  const db = models.items.db;
  const deleted = {
    clinicalReports: (
      await db.collection('clinical_reports').deleteMany({
        patientId: { $in: patientIds },
        assessmentVisitId: { $in: visitIds },
      })
    ).deletedCount,
    cognitiveDomainResults: (
      await db.collection('cognitive_domain_results').deleteMany({
        scaleInstanceId: { $in: instanceIds },
      })
    ).deletedCount,
    scoreResults: (
      await db.collection('score_results').deleteMany({
        scaleInstanceId: { $in: instanceIds },
      })
    ).deletedCount,
    mediaEvidence: (
      await models.media.deleteMany({ scaleInstanceId: { $in: instanceIds } })
    ).deletedCount,
    patientAdministrationSessions: (
      await models.administrations.deleteMany({
        scaleInstanceId: { $in: instanceIds },
      })
    ).deletedCount,
    authSessions: (
      await models.authSessions.deleteMany({ userId: { $in: userIds } })
    ).deletedCount,
    items: (
      await models.items.deleteMany({ scaleInstanceId: { $in: instanceIds } })
    ).deletedCount,
    instances: (
      await models.instances.deleteMany({ _id: { $in: instanceIds } })
    ).deletedCount,
    visits: (await models.visits.deleteMany({ _id: { $in: visitIds } }))
      .deletedCount,
    patients: (await models.patients.deleteMany({ _id: { $in: patientIds } }))
      .deletedCount,
    users: (await models.users.deleteMany({ _id: { $in: userIds } }))
      .deletedCount,
  };
  const residuals = await Promise.all([
    models.users.countDocuments({ accountName: accountName(namespace) }),
    models.authSessions.countDocuments({ userId: { $in: userIds } }),
    models.patients.countDocuments({ subjectCode: subjectCode(namespace) }),
    models.visits.countDocuments({ visitCode: visitCode(namespace) }),
    models.instances.countDocuments({ _id: { $in: instanceIds } }),
    models.items.countDocuments({ scaleInstanceId: { $in: instanceIds } }),
    models.administrations.countDocuments({
      scaleInstanceId: { $in: instanceIds },
    }),
    models.media.countDocuments({ scaleInstanceId: { $in: instanceIds } }),
    db.collection('score_results').countDocuments({
      scaleInstanceId: { $in: instanceIds },
    }),
    db.collection('cognitive_domain_results').countDocuments({
      scaleInstanceId: { $in: instanceIds },
    }),
    db.collection('clinical_reports').countDocuments({
      patientId: { $in: patientIds },
      assessmentVisitId: { $in: visitIds },
    }),
  ]);
  const residualCount = residuals.reduce((sum, value) => sum + value, 0);
  if (residualCount !== 0) {
    fail('HANDOFF_CLEANUP_INCOMPLETE', 'Namespace cleanup left records');
  }
  await unlink(path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  });
  return {
    ok: true,
    command: 'cleanup',
    profile,
    namespace,
    actualDatabaseName: DB,
    deleted,
    residualCount,
    runtimeDescriptor: 'absent',
  };
}

function modelRegistry(app: INestApplicationContext): Models {
  return {
    users: app.get(getModelToken(User.name)),
    authSessions: app.get(getModelToken(Session.name)),
    patients: app.get(getModelToken(Patient.name)),
    visits: app.get(getModelToken(AssessmentVisit.name)),
    instances: app.get(getModelToken(ScaleInstance.name)),
    items: app.get(getModelToken(ItemResponse.name)),
    administrations: app.get(getModelToken(PatientAdministrationSession.name)),
    media: app.get(getModelToken(MediaEvidence.name)),
  };
}

function safeError(error: unknown): void {
  const known =
    error instanceof DatabaseGateError || error instanceof FixtureError;
  console.error(
    JSON.stringify({
      ok: false,
      code: known ? error.code : 'HANDOFF_FIXTURE_OPERATION_FAILED',
      message: known
        ? error.message
        : 'Handoff fixture operation failed without exposing internal details',
    }),
  );
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    const profile = parseProfile();
    const command = parseCommand();
    const namespace = required('PATIENT_ADMIN_HANDOFF_NAMESPACE');
    if (!/^[a-z0-9][a-z0-9-]{2,23}$/.test(namespace)) {
      fail('HANDOFF_NAMESPACE_INVALID', 'Namespace format is invalid');
    }
    const path = parseRuntimePath();
    assertBrowserAcceptancePreImportEnvironment({
      nodeEnv: process.env.NODE_ENV,
      purpose: process.env.COGMEMORY_DATABASE_PURPOSE,
      mongoUri: process.env.MONGO_URI,
    });
    const [{ NestFactory }, mongooseModule] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/mongoose'),
    ]);
    const loadModule = createRequire(__filename);
    const { AppModule } = loadModule('../src/app.module') as AppModuleExport;
    app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: false,
    });
    connection = app.get<Connection>(mongooseModule.getConnectionToken());
    await assertBrowserFixtureDatabaseAccess(connection);
    assertRuntime(app.get(ConfigService), connection);
    const models = modelRegistry(app);
    let result: Record<string, unknown>;
    if (command === 'cleanup') {
      result = await cleanup(namespace, profile, path, models);
    } else if (command === 'prepare') {
      let descriptor: Descriptor;
      try {
        await readFile(path, 'utf8');
        fail('HANDOFF_RUNTIME_EXISTS', 'Prepare requires a fresh runtime path');
      } catch (error: unknown) {
        if (
          error instanceof FixtureError ||
          (error as NodeJS.ErrnoException).code !== 'ENOENT'
        ) {
          throw error;
        }
      }
      await assertUnused(namespace, models);
      try {
        descriptor = await createFixture({
          profile,
          namespace,
          path,
          models,
          execution: app.get(AssessmentExecutionService),
          auth: app.get(AuthService),
        });
      } catch (error: unknown) {
        await cleanup(namespace, profile, path, models).catch(() => undefined);
        throw error;
      }
      result = {
        ok: true,
        command,
        profile,
        namespace,
        actualDatabaseName: DB,
        prepared: await assertPrepared({
          descriptor,
          namespace,
          models,
          auth: app.get(AuthService),
        }),
        runtimeDescriptor: 'safe_route_ids_account_and_baseline_hashes_only',
      };
    } else {
      const descriptor = await readDescriptor(path, profile);
      result =
        command === 'verify-prepared'
          ? {
              ok: true,
              command,
              profile,
              namespace,
              actualDatabaseName: DB,
              prepared: await assertPrepared({
                descriptor,
                namespace,
                models,
                auth: app.get(AuthService),
              }),
            }
          : {
              ok: true,
              command,
              profile,
              namespace,
              actualDatabaseName: DB,
              post: await assertPost({
                descriptor,
                profile,
                namespace,
                models,
              }),
            };
    }
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
