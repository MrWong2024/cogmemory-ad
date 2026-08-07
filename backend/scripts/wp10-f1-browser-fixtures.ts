import 'reflect-metadata';

import { createHash } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { INestApplicationContext, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
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
import { AssessmentScaleWorkflowService } from '../src/modules/assessments/services/assessment-scale-workflow.service';
// prettier-ignore
import { Session, type SessionDocument } from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
import type { AuthenticatedUserContext } from '../src/modules/auth/types/auth-user-context.type';
// prettier-ignore
import { Patient, type PatientDocument } from '../src/modules/patients/schemas/patient.schema';
import { ScaleCatalogService } from '../src/modules/scales/services/scale-catalog.service';
import { PresentationAssetsService } from '../src/modules/scales/services/presentation-assets.service';
// prettier-ignore
import { User, type UserDocument } from '../src/modules/users/schemas/user.schema';

type Command = 'prepare' | 'verify-prepared' | 'verify-post' | 'cleanup';
type Profile = 'F1-P1-same-device' | 'F1-P2-cross-device';

type Descriptor = {
  schemaVersion: 1;
  batch: 'WP10-F1';
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
  };
};

type Models = {
  users: Model<UserDocument>;
  authSessions: Model<SessionDocument>;
  patients: Model<PatientDocument>;
  visits: Model<AssessmentVisitDocument>;
  instances: Model<ScaleInstanceDocument>;
  items: Model<ItemResponseDocument>;
  patientAdministrationSessions: Model<PatientAdministrationSessionDocument>;
};

type Workflows = {
  scaleCatalog: ScaleCatalogService;
  scaleWorkflow: AssessmentScaleWorkflowService;
  presentationAssets: PresentationAssetsService;
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
const BASE_DATE = new Date('2026-08-07T00:00:00.000Z');

function fail(code: string, message: string): never {
  throw new FixtureError(code, message);
}

function required(name: string, minimum = 1): string {
  const value = process.env[name];
  if (!value || value.length < minimum) {
    fail('WP10_F1_ENV_INVALID', `${name} is invalid`);
  }
  return value;
}

function parseProfile(): Profile {
  const profile = process.env.WP10_F1_PROFILE;
  if (profile !== 'F1-P1-same-device' && profile !== 'F1-P2-cross-device') {
    fail('WP10_F1_PROFILE_INVALID', 'WP10_F1_PROFILE is not supported');
  }
  return profile;
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
      'WP10_F1_COMMAND_INVALID',
      'Use prepare, verify-prepared, verify-post, or cleanup',
    );
  }
  if (command === 'cleanup' && process.env.WP10_F1_CONFIRM_CLEANUP !== '1') {
    fail(
      'WP10_F1_CLEANUP_CONFIRMATION_REQUIRED',
      'cleanup requires WP10_F1_CONFIRM_CLEANUP=1',
    );
  }
  return command;
}

function accountName(namespace: string): string {
  return `wp10f1-${namespace}-doctor`;
}

function subjectCode(namespace: string): string {
  return `WP10F1-${namespace.toUpperCase()}`;
}

function visitCode(namespace: string): string {
  return `${subjectCode(namespace)}-VISIT`;
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
      'WP10_F1_RUNTIME_GATE_FAILED',
      'Fixture runtime is not Browser isolated',
    );
  }
}

function assertDescriptorSafety(
  descriptor: Descriptor,
  password: string,
): void {
  const serialized = JSON.stringify(descriptor).toLowerCase();
  const forbidden = [
    password.toLowerCase(),
    'mongodb://',
    'mongodb+srv://',
    'passwordhash',
    'cookie',
    'token',
    'entrycode',
  ];
  if (forbidden.some((value) => value && serialized.includes(value))) {
    fail(
      'WP10_F1_RUNTIME_UNSAFE',
      'Runtime descriptor contains a forbidden value',
    );
  }
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
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
      'WP10_F1_RUNTIME_UNAVAILABLE',
      'Safe runtime descriptor is unavailable',
    );
  }
  const descriptor = value as Partial<Descriptor>;
  const scenario = descriptor.scenario;
  if (
    descriptor.schemaVersion !== 1 ||
    descriptor.batch !== 'WP10-F1' ||
    descriptor.profile !== profile ||
    typeof descriptor.namespace !== 'string' ||
    typeof descriptor.accounts?.staff.loginIdentifier !== 'string' ||
    !scenario ||
    !isObjectId(scenario.patientId) ||
    !isObjectId(scenario.visitId) ||
    !isObjectId(scenario.scaleInstanceId) ||
    !/^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}\/scale-instances\/[a-f\d]{24}$/i.test(
      scenario.navigationPath,
    ) ||
    !Number.isSafeInteger(scenario.itemCount) ||
    scenario.itemCount < 1 ||
    !/^[a-f\d]{64}$/i.test(scenario.itemBaselineHash)
  ) {
    fail('WP10_F1_RUNTIME_INVALID', 'Safe runtime descriptor is invalid');
  }
  return descriptor as Descriptor;
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

async function assertUnused(namespace: string, models: Models): Promise<void> {
  const [users, patients, visits] = await Promise.all([
    models.users.countDocuments({ accountName: accountName(namespace) }),
    models.patients.countDocuments({ subjectCode: subjectCode(namespace) }),
    models.visits.countDocuments({ visitCode: visitCode(namespace) }),
  ]);
  if (users + patients + visits !== 0) {
    fail('WP10_F1_NAMESPACE_EXISTS', 'The exact namespace is already in use');
  }
}

async function createFixture(input: {
  profile: Profile;
  namespace: string;
  password: string;
  path: string;
  models: Models;
  workflows: Workflows;
  auth: AuthService;
}): Promise<Descriptor> {
  await assertUnused(input.namespace, input.models);
  const passwordHash = await input.auth.hashPassword(input.password);
  const user = await input.models.users.create({
    accountName: accountName(input.namespace),
    displayName: 'WP-10 F1 测试医生',
    staffCode: `WP10F1-${input.namespace}-doctor`,
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
    displayName: 'WP-10 F1 脱敏受试者',
    sourceType: 'research',
    sex: 'unknown',
    birthDate: null,
    educationYears: 12,
    handedness: 'unknown',
    status: 'active',
    tags: ['wp10-f1', 'synthetic'],
    notes: 'Synthetic WP-10 F1 browser fixture only',
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
    notes: 'Synthetic WP-10 F1 browser fixture visit',
    metadata: null,
  });
  await input.workflows.scaleCatalog.ensureSeedScaleVersionMaterialized('mmse');
  const response = await input.workflows.scaleWorkflow.initializeScaleInstance(
    patient._id.toString(),
    visit._id.toString(),
    {
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      administrationMode: 'supervised_patient_input',
    },
    {
      operatorId: actor(user).id,
      operatorName: user.displayName,
      operatorRole: 'doctor',
    },
  );
  const scaleInstanceId = response.scaleInstance.id;
  const items = await input.models.items
    .find({ scaleInstanceId })
    .sort({ itemOrder: 1 })
    .exec();
  if (items.length < 1) {
    fail('WP10_F1_ITEM_SKELETON_MISSING', 'MMSE item skeleton was not created');
  }
  const descriptor: Descriptor = {
    schemaVersion: 1,
    batch: 'WP10-F1',
    profile: input.profile,
    namespace: input.namespace,
    accounts: { staff: { loginIdentifier: user.accountName } },
    scenario: {
      patientId: patient._id.toString(),
      visitId: visit._id.toString(),
      scaleInstanceId,
      navigationPath: `/patients/${patient._id.toString()}/visits/${visit._id.toString()}/scale-instances/${scaleInstanceId}`,
      itemCount: items.length,
      itemBaselineHash: hash(itemFacts(items)),
    },
  };
  await writeDescriptor(input.path, descriptor, input.password);
  return descriptor;
}

async function assertPrepared(input: {
  descriptor: Descriptor;
  namespace: string;
  password: string;
  models: Models;
  auth: AuthService;
  workflows: Workflows;
}): Promise<Record<string, unknown>> {
  if (input.descriptor.namespace !== input.namespace) {
    fail('WP10_F1_NAMESPACE_MISMATCH', 'Runtime namespace mismatch');
  }
  assertDescriptorSafety(input.descriptor, input.password);
  const { scenario } = input.descriptor;
  const user = await input.models.users
    .findOne({ accountName: input.descriptor.accounts.staff.loginIdentifier })
    .select('+passwordHash');
  const [patient, visit, instance, items, administrationCount, authCount] =
    await Promise.all([
      input.models.patients.findById(scenario.patientId),
      input.models.visits.findById(scenario.visitId),
      input.models.instances.findById(scenario.scaleInstanceId),
      input.models.items
        .find({ scaleInstanceId: scenario.scaleInstanceId })
        .sort({ itemOrder: 1 })
        .exec(),
      input.models.patientAdministrationSessions.countDocuments({
        scaleInstanceId: scenario.scaleInstanceId,
      }),
      input.models.authSessions.countDocuments({
        userId: user?._id,
      }),
    ]);
  const passwordValid =
    user &&
    (await input.auth.verifyPassword(input.password, user.passwordHash));
  const scaleVersion = instance
    ? await input.models.items.db.collection('scale_versions').findOne({
        _id: instance.scaleVersionId,
      })
    : null;
  const patientAdministrationStepCount = Array.isArray(
    scaleVersion?.patientAdministrationSteps,
  )
    ? scaleVersion.patientAdministrationSteps.length
    : 0;
  const presentationPackageConfigured =
    typeof scaleVersion?.presentationPackageKey === 'string' &&
    scaleVersion.presentationPackageKey.trim().length > 0;
  let packageValidated = false;
  let stepShapeValid = false;
  let stepAssetLinksValid = false;
  const stepAssetMismatchKinds = new Set<string>();
  if (presentationPackageConfigured) {
    try {
      const verifiedPackage =
        await input.workflows.presentationAssets.validatePackage(
          scaleVersion.presentationPackageKey as string,
        );
      packageValidated = true;
      const steps = Array.isArray(scaleVersion?.patientAdministrationSteps)
        ? (scaleVersion.patientAdministrationSteps as Array<
            Record<string, unknown>
          >)
        : [];
      const keys = new Set<string>();
      const orders = new Set<number>();
      stepShapeValid =
        steps.length > 0 &&
        steps.every((step, index) => {
          const stepKey = step.stepKey;
          const order = step.order;
          const valid =
            typeof stepKey === 'string' &&
            stepKey.trim().length > 0 &&
            Number.isSafeInteger(order) &&
            order === index + 1 &&
            !keys.has(stepKey) &&
            !orders.has(order);
          if (typeof stepKey === 'string') keys.add(stepKey);
          if (typeof order === 'number') orders.add(order);
          return valid;
        });
      stepAssetLinksValid = steps.every((step) => {
        const stepKey = step.stepKey;
        const assetKeys = Array.isArray(step.assetKeys) ? step.assetKeys : [];
        return assetKeys.every((assetKey) => {
          if (typeof assetKey !== 'string' || typeof stepKey !== 'string') {
            return false;
          }
          const matches = verifiedPackage.assets.filter(
            (asset) => asset.assetKey === assetKey,
          );
          const asset = matches[0];
          if (matches.length !== 1 || !asset) {
            stepAssetMismatchKinds.add('missing_or_duplicate');
            return false;
          }
          if (asset.stepKey !== stepKey) {
            stepAssetMismatchKinds.add('step_key');
            return false;
          }
          if (asset.kind === 'image' && asset.role !== undefined) {
            stepAssetMismatchKinds.add('image_role');
            return false;
          }
          if (
            asset.kind === 'audio' &&
            asset.role !== 'guidance' &&
            asset.role !== 'stimulus'
          ) {
            stepAssetMismatchKinds.add('audio_role');
            return false;
          }
          return Boolean(matches.length === 1 && asset.stepKey === stepKey);
        });
      });
    } catch {
      packageValidated = false;
    }
  }
  const checks: Record<string, boolean> = {
    staff: Boolean(user),
    password: Boolean(passwordValid),
    role: user?.roles.join() === 'doctor',
    patient: patient?.status === 'active',
    visit: visit?.status === 'in_progress',
    scaleCode: instance?.scaleCode === 'mmse',
    scaleVersion: instance?.scaleVersion === '1.0',
    administrationMode:
      instance?.administrationMode === 'supervised_patient_input',
    instanceStatus:
      instance?.status === 'draft' || instance?.status === 'in_progress',
    itemCount: items.length === scenario.itemCount,
    itemBaseline: hash(itemFacts(items)) === scenario.itemBaselineHash,
    patientAdministrationAbsent: administrationCount === 0,
    staffAuthAbsent: authCount === 0,
    patientAdministrationSteps: patientAdministrationStepCount > 0,
    presentationPackage: presentationPackageConfigured,
    packageValidated,
    stepShape: stepShapeValid,
    stepAssetLinks: stepAssetLinksValid,
  };
  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (stepAssetMismatchKinds.size > 0) {
    failedChecks.push(
      `stepAssetMismatch:${[...stepAssetMismatchKinds].sort().join('+')}`,
    );
  }
  if (failedChecks.length > 0) {
    fail(
      'WP10_F1_PREPARED_INVALID',
      `Prepared fixture checks failed: ${failedChecks.join(',')}`,
    );
  }
  if (!patient || !visit || !instance) {
    fail('WP10_F1_PREPARED_INVALID', 'Prepared fixture roots are unavailable');
  }
  return {
    accountRole: 'doctor',
    patientStatus: patient.status,
    visitStatus: visit.status,
    scaleCode: instance.scaleCode,
    scaleVersion: instance.scaleVersion,
    administrationMode: instance.administrationMode,
    instanceStatus: instance.status,
    itemCount: items.length,
    patientAdministrationCount: administrationCount,
    patientAdministrationStepCount,
    presentationPackageConfigured,
  };
}

async function assertPost(input: {
  descriptor: Descriptor;
  profile: Profile;
  namespace: string;
  password: string;
  models: Models;
}): Promise<Record<string, unknown>> {
  if (input.descriptor.namespace !== input.namespace) {
    fail('WP10_F1_NAMESPACE_MISMATCH', 'Runtime namespace mismatch');
  }
  assertDescriptorSafety(input.descriptor, input.password);
  const { scenario } = input.descriptor;
  const [items, administrations, user] = await Promise.all([
    input.models.items
      .find({ scaleInstanceId: scenario.scaleInstanceId })
      .sort({ itemOrder: 1 })
      .exec(),
    input.models.patientAdministrationSessions
      .find({ scaleInstanceId: scenario.scaleInstanceId })
      .select('+entryCodeHash +sessionTokenHash')
      .exec(),
    input.models.users.findOne({
      accountName: input.descriptor.accounts.staff.loginIdentifier,
    }),
  ]);
  if (
    !user ||
    items.length !== scenario.itemCount ||
    hash(itemFacts(items)) !== scenario.itemBaselineHash ||
    administrations.length !== 1
  ) {
    fail(
      'WP10_F1_POST_BOUNDARY_INVALID',
      'Post fixture boundary facts are invalid',
    );
  }
  const administration = administrations[0];
  const actions = administration.controlEvents.map((event) => event.action);
  const itemBoundary = {
    itemCount: items.length,
    itemFacts: 'unchanged',
    stepCaptureCount: administration.stepCaptures.length,
    playbackFactCount: administration.playbackFacts.length,
    evidenceReferenceCount: administration.stepEvidenceRefs.length,
  };
  if (
    administration.stepCaptures.length !== 0 ||
    administration.playbackFacts.length !== 0 ||
    administration.stepEvidenceRefs.length !== 0
  ) {
    fail(
      'WP10_F1_F2_F3_BOUNDARY_INVALID',
      'F2 or F3 facts were unexpectedly created',
    );
  }

  if (input.profile === 'F1-P1-same-device') {
    const expected = ['preparation_confirmed', 'same_device_handoff'];
    if (
      administration.status !== 'active' ||
      administration.revision !== 2 ||
      actions.join(',') !== expected.join(',') ||
      !administration.preparationConfirmedAt ||
      !administration.startedAt ||
      !administration.sessionTokenHash ||
      administration.entryCodeHash
    ) {
      fail('WP10_F1_P1_POST_INVALID', 'Same-device post facts are invalid');
    }
    const staffAuthSessions = await input.models.authSessions
      .find({ userId: user._id })
      .select({ status: 1, revokedAt: 1 })
      .exec();
    const activeStaffAuthCount = staffAuthSessions.filter(
      (session) => session.status === 'active',
    ).length;
    const revokedStaffAuthCount = staffAuthSessions.filter(
      (session) => session.status === 'revoked' && session.revokedAt,
    ).length;
    if (
      staffAuthSessions.length !== 1 ||
      activeStaffAuthCount !== 0 ||
      revokedStaffAuthCount !== 1
    ) {
      fail(
        'WP10_F1_P1_STAFF_AUTH_REMAINED',
        'Staff auth session was not revoked',
      );
    }
    return {
      profile: input.profile,
      status: administration.status,
      revision: administration.revision,
      controlEvents: actions,
      activeStaffAuthSessionCount: activeStaffAuthCount,
      revokedStaffAuthSessionCount: revokedStaffAuthCount,
      credentialState: 'patient_only',
      ...itemBoundary,
    };
  }

  const expected = [
    'entry_redeemed',
    'preparation_confirmed',
    'paused',
    'resumed',
    'device_reissued',
    'entry_redeemed',
    'resumed',
    'terminated',
  ];
  if (
    administration.status !== 'terminated' ||
    administration.revision !== 8 ||
    actions.join(',') !== expected.join(',') ||
    !administration.preparationConfirmedAt ||
    !administration.startedAt ||
    !administration.terminatedAt ||
    administration.sessionTokenHash ||
    administration.entryCodeHash ||
    administration.impactFactorCodes.slice().sort().join(',') !==
      ['device_network', 'environment'].sort().join(',')
  ) {
    fail('WP10_F1_P2_POST_INVALID', 'Cross-device post facts are invalid');
  }
  return {
    profile: input.profile,
    status: administration.status,
    revision: administration.revision,
    controlEvents: actions,
    credentialState: 'cleared',
    impactFactorCodes: administration.impactFactorCodes.slice().sort(),
    ...itemBoundary,
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
  const deleted = {
    patientAdministrationSessions: (
      await models.patientAdministrationSessions.deleteMany({
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
    models.patientAdministrationSessions.countDocuments({
      scaleInstanceId: { $in: instanceIds },
    }),
  ]);
  const residualCount = residuals.reduce((sum, value) => sum + value, 0);
  if (residualCount !== 0) {
    fail('WP10_F1_CLEANUP_INCOMPLETE', 'Namespace cleanup left records');
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
    patientAdministrationSessions: app.get(
      getModelToken(PatientAdministrationSession.name),
    ),
  };
}

function safeError(error: unknown): void {
  const known =
    error instanceof DatabaseGateError || error instanceof FixtureError;
  console.error(
    JSON.stringify({
      ok: false,
      code: known ? error.code : 'WP10_F1_FIXTURE_OPERATION_FAILED',
      message: known
        ? error.message
        : 'WP-10 F1 fixture operation failed without exposing internal details',
    }),
  );
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    const profile = parseProfile();
    const command = parseCommand();
    const namespace = required('WP10_F1_NAMESPACE');
    if (!/^[a-z0-9][a-z0-9-]{2,19}$/.test(namespace)) {
      fail('WP10_F1_NAMESPACE_INVALID', 'Namespace format is invalid');
    }
    const path = required('WP10_F1_RUNTIME_PATH');
    const password =
      command === 'cleanup' ? '' : required('WP10_F1_FIXTURE_PASSWORD', 16);
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
    const workflows: Workflows = {
      scaleCatalog: app.get(ScaleCatalogService),
      scaleWorkflow: app.get(AssessmentScaleWorkflowService),
      presentationAssets: app.get(PresentationAssetsService),
    };

    let result: Record<string, unknown>;
    if (command === 'cleanup') {
      result = await cleanup(namespace, profile, path, models);
    } else if (command === 'prepare') {
      let descriptor: Descriptor;
      let reused = false;
      try {
        descriptor = await readDescriptor(path, profile);
        reused = true;
      } catch (error: unknown) {
        if (
          !(error instanceof FixtureError) ||
          error.code !== 'WP10_F1_RUNTIME_UNAVAILABLE'
        ) {
          throw error;
        }
        try {
          descriptor = await createFixture({
            profile,
            namespace,
            password,
            path,
            models,
            workflows,
            auth: app.get(AuthService),
          });
        } catch (createError: unknown) {
          await cleanup(namespace, profile, path, models).catch(
            () => undefined,
          );
          throw createError;
        }
      }
      const prepared = await assertPrepared({
        descriptor,
        namespace,
        password,
        models,
        auth: app.get(AuthService),
        workflows,
      });
      result = {
        ok: true,
        command,
        profile,
        namespace,
        actualDatabaseName: DB,
        reused,
        prepared,
        runtimeDescriptor: 'safe_route_ids_account_and_item_hash_only',
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
                password,
                models,
                auth: app.get(AuthService),
                workflows,
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
                password,
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
