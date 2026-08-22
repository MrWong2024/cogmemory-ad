import 'reflect-metadata';

import { createHash } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
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
import { PresentationAssetsService } from '../src/modules/scales/services/presentation-assets.service';
// prettier-ignore
import { User, type UserDocument } from '../src/modules/users/schemas/user.schema';

type Command = 'prepare' | 'verify-prepared' | 'verify-post' | 'cleanup';
type Profile = 'full' | 'recovery';

type Descriptor = {
  schemaVersion: 1;
  batch: 'WP10-F2';
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
    scaleInstanceBaselineHash: string;
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

type Workflows = {
  execution: AssessmentExecutionService;
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

type ExistingMmseCatalogReference = {
  scaleDefinitionId: string;
  scaleVersionId: string;
  scaleVersion: string;
};

function fail(code: string, message: string): never {
  throw new FixtureError(code, message);
}

function required(name: string, minimum = 1): string {
  const value = process.env[name];
  if (!value || value.length < minimum) {
    fail('WP10_F2_ENV_INVALID', `${name} is invalid`);
  }
  return value;
}

function parseProfile(): Profile {
  const profile = process.env.WP10_F2_PROFILE;
  if (profile !== 'full' && profile !== 'recovery') {
    fail('WP10_F2_PROFILE_INVALID', 'WP10_F2_PROFILE is not supported');
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
      'WP10_F2_COMMAND_INVALID',
      'Use prepare, verify-prepared, verify-post, or cleanup',
    );
  }
  if (command === 'cleanup' && process.env.WP10_F2_CONFIRM_CLEANUP !== '1') {
    fail(
      'WP10_F2_CLEANUP_CONFIRMATION_REQUIRED',
      'cleanup requires WP10_F2_CONFIRM_CLEANUP=1',
    );
  }
  return command;
}

function accountName(namespace: string): string {
  return `wp10f2-${namespace}-doctor`;
}

function subjectCode(namespace: string): string {
  return `WP10F2-${namespace.toUpperCase()}`;
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

function instanceFacts(instance: ScaleInstanceDocument): unknown {
  return {
    id: instance._id.toString(),
    status: instance.status,
    startedAt: instance.startedAt ?? null,
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
    fail(
      'WP10_F2_RUNTIME_GATE_FAILED',
      'Fixture runtime is not Browser isolated',
    );
  }
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
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
      'WP10_F2_RUNTIME_UNSAFE',
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
      'WP10_F2_RUNTIME_UNAVAILABLE',
      'Safe runtime descriptor is unavailable',
    );
  }
  const descriptor = value as Partial<Descriptor>;
  const scenario = descriptor.scenario;
  if (
    descriptor.schemaVersion !== 1 ||
    descriptor.batch !== 'WP10-F2' ||
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
    !/^[a-f\d]{64}$/i.test(scenario.scaleInstanceBaselineHash)
  ) {
    fail('WP10_F2_RUNTIME_INVALID', 'Safe runtime descriptor is invalid');
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
  const counts = await Promise.all([
    models.users.countDocuments({ accountName: accountName(namespace) }),
    models.patients.countDocuments({ subjectCode: subjectCode(namespace) }),
    models.visits.countDocuments({ visitCode: visitCode(namespace) }),
  ]);
  if (counts.some((count) => count !== 0)) {
    fail('WP10_F2_NAMESPACE_EXISTS', 'The exact namespace is already in use');
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
    version.version !== '1.0'
  ) {
    fail(
      'WP10_F2_MMSE_CATALOG_UNAVAILABLE',
      'The shared Browser MMSE catalog is unavailable',
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
    displayName: 'WP-10 F2 测试医生',
    staffCode: `WP10F2-${input.namespace}-doctor`,
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
    displayName: 'WP-10 F2 脱敏受试者',
    sourceType: 'research',
    sex: 'unknown',
    birthDate: null,
    educationYears: 12,
    handedness: 'unknown',
    status: 'active',
    tags: ['wp10-f2', 'synthetic'],
    notes: 'Synthetic WP-10 F2 browser fixture only',
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
    notes: 'Synthetic WP-10 F2 browser fixture visit',
    metadata: null,
  });
  const catalog = await resolveExistingMmseCatalog(input.models);
  const executionPlan = input.workflows.execution.buildScaleExecutionPlan({
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
    await input.workflows.execution.createScaleExecutionFromPlan(executionPlan);
  const instance = await input.models.instances.findById(
    initialized.scaleInstance.id,
  );
  const items = await input.models.items
    .find({ scaleInstanceId: initialized.scaleInstance.id })
    .sort({ itemOrder: 1 })
    .exec();
  if (!instance || items.length < 1) {
    fail('WP10_F2_SKELETON_MISSING', 'MMSE fixture skeleton was not created');
  }
  const descriptor: Descriptor = {
    schemaVersion: 1,
    batch: 'WP10-F2',
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
      scaleInstanceBaselineHash: hash(instanceFacts(instance)),
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
    fail('WP10_F2_NAMESPACE_MISMATCH', 'Runtime namespace mismatch');
  }
  assertDescriptorSafety(input.descriptor, input.password);
  const { scenario } = input.descriptor;
  const user = await input.models.users
    .findOne({ accountName: input.descriptor.accounts.staff.loginIdentifier })
    .select('+passwordHash');
  const [
    patient,
    visit,
    instance,
    items,
    administrationCount,
    mediaCount,
    authCount,
  ] = await Promise.all([
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
    input.models.authSessions.countDocuments({ userId: user?._id }),
  ]);
  const passwordValid =
    user &&
    (await input.auth.verifyPassword(input.password, user.passwordHash));
  const scaleVersion = instance
    ? await input.models.items.db.collection('scale_versions').findOne({
        _id: instance.scaleVersionId,
      })
    : null;
  const scaleVersionRecord = scaleVersion as Record<string, unknown> | null;
  const stepValue = scaleVersionRecord?.patientAdministrationSteps;
  const steps: unknown[] = Array.isArray(stepValue) ? stepValue : [];
  let packageAssets = 0;
  try {
    const packageKey = scaleVersionRecord?.presentationPackageKey;
    if (typeof packageKey === 'string') {
      packageAssets = (
        await input.workflows.presentationAssets.validatePackage(packageKey)
      ).assets.length;
    }
  } catch {
    packageAssets = 0;
  }
  const checks: Record<string, boolean> = {
    staff: Boolean(user && passwordValid && user.roles.join() === 'doctor'),
    patient: patient?.status === 'active',
    visit: visit?.status === 'in_progress',
    instance: Boolean(
      instance &&
      instance.scaleCode === 'mmse' &&
      instance.scaleVersion === '1.0' &&
      instance.administrationMode === 'supervised_patient_input' &&
      hash(instanceFacts(instance)) === scenario.scaleInstanceBaselineHash,
    ),
    items:
      items.length === scenario.itemCount &&
      hash(itemFacts(items)) === scenario.itemBaselineHash,
    steps:
      steps.length === 19 &&
      steps.every(
        (step, index) =>
          typeof step === 'object' &&
          step !== null &&
          'order' in step &&
          (step as Record<string, unknown>).order === index + 1,
      ),
    assets: packageAssets === 22,
    noSession: administrationCount === 0,
    noMedia: mediaCount === 0,
    noAuth: authCount === 0,
  };
  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failed.length > 0) {
    fail(
      'WP10_F2_PREPARED_INVALID',
      `Prepared checks failed: ${failed.join(',')}`,
    );
  }
  return {
    profile: input.descriptor.profile,
    itemCount: items.length,
    patientAdministrationStepCount: steps.length,
    presentationAssetCount: packageAssets,
    patientAdministrationCount: administrationCount,
    mediaEvidenceCount: mediaCount,
  };
}

function sameIds(left: Types.ObjectId[], right: Types.ObjectId[]): boolean {
  return (
    left.length === right.length &&
    left.map(String).sort().join(',') === right.map(String).sort().join(',')
  );
}

async function assertPost(input: {
  descriptor: Descriptor;
  profile: Profile;
  namespace: string;
  password: string;
  models: Models;
}): Promise<Record<string, unknown>> {
  if (input.descriptor.namespace !== input.namespace) {
    fail('WP10_F2_NAMESPACE_MISMATCH', 'Runtime namespace mismatch');
  }
  assertDescriptorSafety(input.descriptor, input.password);
  const { scenario } = input.descriptor;
  const [
    instance,
    items,
    administrations,
    media,
    scoreCount,
    domainCount,
    reportCount,
  ] = await Promise.all([
    input.models.instances.findById(scenario.scaleInstanceId),
    input.models.items
      .find({ scaleInstanceId: scenario.scaleInstanceId })
      .sort({ itemOrder: 1 })
      .exec(),
    input.models.administrations
      .find({ scaleInstanceId: scenario.scaleInstanceId })
      .select('+entryCodeHash +sessionTokenHash')
      .exec(),
    input.models.media
      .find({ scaleInstanceId: scenario.scaleInstanceId })
      .exec(),
    input.models.items.db.collection('score_results').countDocuments({
      scaleInstanceId: new Types.ObjectId(scenario.scaleInstanceId),
    }),
    input.models.items.db
      .collection('cognitive_domain_results')
      .countDocuments({
        scaleInstanceId: new Types.ObjectId(scenario.scaleInstanceId),
      }),
    input.models.items.db.collection('clinical_reports').countDocuments({
      patientId: new Types.ObjectId(scenario.patientId),
      assessmentVisitId: new Types.ObjectId(scenario.visitId),
    }),
  ]);
  if (
    !instance ||
    hash(instanceFacts(instance)) !== scenario.scaleInstanceBaselineHash ||
    items.length !== scenario.itemCount ||
    hash(itemFacts(items)) !== scenario.itemBaselineHash ||
    administrations.length !== 1 ||
    scoreCount + domainCount + reportCount !== 0
  ) {
    fail('WP10_F2_POST_BOUNDARY_INVALID', 'Post boundary facts are invalid');
  }
  const administration = administrations[0];
  const references = administration.stepEvidenceRefs;
  const referencedIds = references.map(
    (reference) => reference.mediaEvidenceId,
  );
  const mediaIds = media.map((evidence) => evidence._id);
  const objectKeys = media.map((evidence) => evidence.storage?.objectKey ?? '');
  const evidenceConsistent = media.every((evidence) => {
    const context = evidence.patientAdministrationContext;
    const reference = references.find(
      (candidate) =>
        candidate.mediaEvidenceId.toString() === evidence._id.toString(),
    );
    return Boolean(
      context &&
      reference &&
      context.sessionId.toString() === administration._id.toString() &&
      context.stepKey === reference.stepKey &&
      context.stepRun === reference.stepRun &&
      evidence.evidenceType === reference.evidenceType &&
      evidence.status === 'attached' &&
      evidence.storageStatus === 'stored' &&
      evidence.storage?.storageDriver === 'fake' &&
      evidence.storage.objectKey &&
      !evidence.storage.originalFilename &&
      evidence.operatorSnapshot === null,
    );
  });
  if (
    !sameIds(referencedIds, mediaIds) ||
    !evidenceConsistent ||
    objectKeys.some((key) => !key) ||
    new Set(objectKeys).size !== objectKeys.length
  ) {
    fail(
      'WP10_F2_EVIDENCE_INVALID',
      'Evidence ownership or fake storage facts are invalid',
    );
  }

  if (input.profile === 'full') {
    const validCaptures = administration.stepCaptures.filter(
      (capture) => !capture.invalidatedAt,
    );
    const ordersCovered = new Set(
      validCaptures.map((capture) => capture.stepKey),
    );
    const replay = administration.playbackFacts.find(
      (fact) =>
        fact.stepKey === 'mmse-immediate-recall' &&
        fact.assetKey === 'mmse-immediate-recall-stimulus',
    );
    const evidenceCounts = media.reduce<Record<string, number>>(
      (counts, evidence) => {
        counts[evidence.evidenceType] =
          (counts[evidence.evidenceType] ?? 0) + 1;
        return counts;
      },
      {},
    );
    const actions = administration.controlEvents.map((event) => event.action);
    if (
      administration.status !== 'completed' ||
      administration.currentStepKey !== 'mmse-drawing' ||
      administration.entryCodeHash ||
      administration.sessionTokenHash ||
      validCaptures.length !== 19 ||
      ordersCovered.size !== 19 ||
      administration.stepCaptures.length !== 19 ||
      actions.includes('staff_takeover') ||
      actions.includes('step_redo') ||
      replay?.playCount !== 1 ||
      replay.remainingAuthorizedReplays !== 0 ||
      replay.technicalReplayAuthorizations.length !== 0 ||
      media.length !== 17 ||
      evidenceCounts.audio !== 15 ||
      evidenceCounts.handwriting !== 1 ||
      evidenceCounts.photo !== 1
    ) {
      fail('WP10_F2_FULL_POST_INVALID', 'Full profile post facts are invalid');
    }
    return {
      profile: input.profile,
      status: administration.status,
      revision: administration.revision,
      validStepCaptureCount: validCaptures.length,
      invalidatedStepCaptureCount:
        administration.stepCaptures.length - validCaptures.length,
      mediaEvidenceCount: media.length,
      evidenceCounts,
      stimulusPlayCount: replay.playCount,
      technicalReplayAuthorizationCount:
        replay.technicalReplayAuthorizations.length,
      itemFacts: 'unchanged',
      scaleInstanceFacts: 'unchanged',
      downstreamResultCount: 0,
      fakeStorageReferences: 'one_per_media_evidence',
    };
  }

  const currentStepKey = 'mmse-orientation-year';
  const currentStepRun = 1;
  const currentStepReferences = references.filter(
    (reference) =>
      reference.stepKey === currentStepKey &&
      reference.stepRun === currentStepRun,
  );
  const currentStepMedia = media.filter((evidence) => {
    const context = evidence.patientAdministrationContext;
    return (
      context?.sessionId.toString() === administration._id.toString() &&
      context.stepKey === currentStepKey &&
      context.stepRun === currentStepRun
    );
  });
  const currentStepCaptures = administration.stepCaptures.filter(
    (capture) => capture.stepKey === currentStepKey,
  );
  const currentStepCompleted = currentStepCaptures.some(
    (capture) => capture.stepRun === currentStepRun && !capture.invalidatedAt,
  );
  const duplicateMediaEvidenceCount = Math.max(0, currentStepMedia.length - 1);
  if (
    administration.status !== 'active' ||
    administration.currentStepKey !== currentStepKey ||
    references.length !== 1 ||
    currentStepReferences.length !== 1 ||
    currentStepReferences[0].evidenceType !== 'audio' ||
    media.length !== 1 ||
    currentStepMedia.length !== 1 ||
    currentStepMedia[0].evidenceType !== 'audio' ||
    currentStepMedia[0]._id.toString() !==
      currentStepReferences[0].mediaEvidenceId.toString() ||
    duplicateMediaEvidenceCount !== 0 ||
    currentStepCaptures.length !== 0 ||
    currentStepCompleted
  ) {
    fail(
      'WP10_F2_RECOVERY_POST_INVALID',
      'Recovery profile post facts are invalid',
    );
  }
  return {
    profile: input.profile,
    status: administration.status,
    currentStepKey: administration.currentStepKey,
    mediaEvidenceCount: media.length,
    duplicateMediaEvidenceCount,
    currentStepEvidenceCount: currentStepReferences.length,
    currentStepCompleted,
    itemFacts: 'unchanged',
    scaleInstanceFacts: 'unchanged',
    downstreamResultCount: 0,
    fakeStorageReferences: 'one_per_media_evidence',
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
  ]);
  const residualCount = residuals.reduce((sum, value) => sum + value, 0);
  if (residualCount !== 0) {
    fail('WP10_F2_CLEANUP_INCOMPLETE', 'Namespace cleanup left records');
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
      code: known ? error.code : 'WP10_F2_FIXTURE_OPERATION_FAILED',
      message: known
        ? error.message
        : 'WP-10 F2 fixture operation failed without exposing internal details',
    }),
  );
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    const profile = parseProfile();
    const command = parseCommand();
    const namespace = required('WP10_F2_NAMESPACE');
    if (!/^[a-z0-9][a-z0-9-]{2,19}$/.test(namespace)) {
      fail('WP10_F2_NAMESPACE_INVALID', 'Namespace format is invalid');
    }
    const path = required('WP10_F2_RUNTIME_PATH');
    const password =
      command === 'cleanup' ? '' : required('WP10_F2_FIXTURE_PASSWORD', 16);
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
      execution: app.get(AssessmentExecutionService),
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
          error.code !== 'WP10_F2_RUNTIME_UNAVAILABLE'
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
      result = {
        ok: true,
        command,
        profile,
        namespace,
        actualDatabaseName: DB,
        reused,
        prepared: await assertPrepared({
          descriptor,
          namespace,
          password,
          models,
          auth: app.get(AuthService),
          workflows,
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
