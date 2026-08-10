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
import { ScaleInstanceSubmissionService } from '../src/modules/assessments/services/scale-instance-submission.service';
// prettier-ignore
import { Session, type SessionDocument } from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
// prettier-ignore
import { MediaEvidence, type MediaEvidenceDocument } from '../src/modules/media/schemas/media-evidence.schema';
import { PatientAdministrationReviewService } from '../src/modules/media/services/patient-administration-review.service';
// prettier-ignore
import { Patient, type PatientDocument } from '../src/modules/patients/schemas/patient.schema';
import { MMSE_SCALE_VERSION_SEED } from '../src/modules/scales/seeds/mmse.seed';
// prettier-ignore
import { User, type UserDocument } from '../src/modules/users/schemas/user.schema';

type Command =
  | 'prepare'
  | 'replace'
  | 'verify-prepared'
  | 'verify-post'
  | 'cleanup';

type Descriptor = {
  schemaVersion: 1;
  batch: 'WP10-F3';
  namespace: string;
  accounts: { staff: { loginIdentifier: string } };
  scenario: {
    patientId: string;
    visitId: string;
    scaleInstanceId: string;
    navigationPath: string;
    itemCount: number;
    stepCount: number;
    readingItemResponseId: string;
    adoptionItemResponseId: string;
    audioEvidenceId: string;
    adoptionEvidenceId: string;
    sessionBaselineHash: string;
    mediaWithoutTranscriptionBaselineHash: string;
    unchangedItemsBaselineHash: string;
    adoptionAnswerBaselineHash: string;
    readingEvidenceBaselineHash: string;
    instanceStableBaselineHash: string;
    outsideNamespaceBaselineHash: string;
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
  review: PatientAdministrationReviewService;
  submission: ScaleInstanceSubmissionService;
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
const BASE_DATE = new Date('2026-08-10T01:00:00.000Z');
const READING_ITEM_CODE = 'mmse.language.reading_command';
const ADOPTION_ITEM_CODE = 'mmse.visuospatial.copy_drawing';
const WRITING_ITEM_CODE = 'mmse.language.writing_sentence';

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
    fail('WP10_F3_ENV_INVALID', `${name} is invalid`);
  }
  return value;
}

function parseCommand(): Command {
  const [command, extra] = process.argv.slice(2);
  if (
    (command !== 'prepare' &&
      command !== 'replace' &&
      command !== 'verify-prepared' &&
      command !== 'verify-post' &&
      command !== 'cleanup') ||
    extra
  ) {
    fail(
      'WP10_F3_COMMAND_INVALID',
      'Use prepare, replace, verify-prepared, verify-post, or cleanup',
    );
  }
  if (command === 'cleanup' && process.env.WP10_F3_CONFIRM_CLEANUP !== '1') {
    fail(
      'WP10_F3_CLEANUP_CONFIRMATION_REQUIRED',
      'cleanup requires WP10_F3_CONFIRM_CLEANUP=1',
    );
  }
  if (command === 'replace' && process.env.WP10_F3_CONFIRM_REPLACE !== '1') {
    fail(
      'WP10_F3_REPLACE_CONFIRMATION_REQUIRED',
      'replace requires WP10_F3_CONFIRM_REPLACE=1',
    );
  }
  return command;
}

function accountName(namespace: string): string {
  return `wp10f3-${namespace}-doctor`;
}

function subjectCode(namespace: string): string {
  return `WP10F3-${namespace.toUpperCase()}`;
}

function visitCode(namespace: string): string {
  return `${subjectCode(namespace)}-VISIT`;
}

function ownedScaleVersion(namespace: string): string {
  return `wp10-f3-${namespace}`;
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

function normalizedObjectId(value: Types.ObjectId | null | undefined) {
  return value ? value.toString() : null;
}

function normalizedDate(value: Date | null | undefined) {
  return value instanceof Date ? value.toISOString() : null;
}

function normalizedEvidenceRefs(item: ItemResponseDocument) {
  return item.evidenceRefs.map((reference) => ({
    evidenceType: reference.evidenceType,
    mediaEvidenceId: normalizedObjectId(reference.mediaEvidenceId),
    status: reference.status,
    note: reference.note ?? null,
  }));
}

function answerFacts(item: ItemResponseDocument) {
  return {
    id: item._id.toString(),
    itemCode: item.itemCode,
    status: item.status,
    answerSource: item.answerSource,
    draftRevision: item.draftRevision,
    draftSavedAt: normalizedDate(item.draftSavedAt),
    rawResponse: item.rawResponse ?? null,
    structuredResponse: item.structuredResponse ?? null,
    responseText: item.responseText ?? null,
    isMissing: item.isMissing,
    missingReason: item.missingReason ?? null,
    stepResults: item.stepResults.map((step) => ({
      stepCode: step.stepCode,
      actualValue: step.actualValue ?? null,
      note: step.note ?? null,
    })),
    promptResponses: item.promptResponses.map((prompt) => ({
      promptType: prompt.promptType,
      responseAfterPrompt: prompt.responseAfterPrompt ?? null,
      note: prompt.note ?? null,
    })),
    timing: item.timing ?? null,
    operatorNote: item.operatorNote ?? null,
    // A16 fences every item as an expected submission lifecycle effect; it is
    // not part of the answer facts used to attribute F3/adoption mutations.
    submissionWriteBarrier: null,
    lockedAt: normalizedDate(item.lockedAt),
    voidedAt: normalizedDate(item.voidedAt),
  };
}

function itemFacts(item: ItemResponseDocument) {
  return { ...answerFacts(item), evidenceRefs: normalizedEvidenceRefs(item) };
}

function sessionFacts(session: PatientAdministrationSessionDocument) {
  return {
    id: session._id.toString(),
    scaleInstanceId: session.scaleInstanceId.toString(),
    status: session.status,
    currentStepKey: session.currentStepKey,
    revision: session.revision,
    expiresAt: normalizedDate(session.expiresAt),
    preparationConfirmedAt: normalizedDate(session.preparationConfirmedAt),
    preparationConfirmedBy: session.preparationConfirmedBy ?? null,
    impactFactorCodes: [...session.impactFactorCodes],
    impactFactorNote: session.impactFactorNote ?? null,
    createdBy: session.createdBy,
    startedAt: normalizedDate(session.startedAt),
    pausedAt: normalizedDate(session.pausedAt),
    completedAt: normalizedDate(session.completedAt),
    terminatedAt: normalizedDate(session.terminatedAt),
    expiredAt: normalizedDate(session.expiredAt),
    controlEvents: session.controlEvents,
    stepCaptures: session.stepCaptures,
    playbackFacts: session.playbackFacts,
    stepEvidenceRefs: session.stepEvidenceRefs,
  };
}

function mediaWithoutTranscriptionFacts(evidences: MediaEvidenceDocument[]) {
  return [...evidences]
    .sort((left, right) => left.evidenceCode.localeCompare(right.evidenceCode))
    .map((evidence) => ({
      id: evidence._id.toString(),
      patientId: evidence.patientId.toString(),
      assessmentVisitId: evidence.assessmentVisitId.toString(),
      scaleInstanceId: evidence.scaleInstanceId.toString(),
      itemResponseId: evidence.itemResponseId.toString(),
      itemCode: evidence.itemCode,
      evidenceCode: evidence.evidenceCode,
      evidenceType: evidence.evidenceType,
      captureMode: evidence.captureMode,
      status: evidence.status,
      storageStatus: evidence.storageStatus,
      storage: evidence.storage ?? null,
      patientAdministrationContext:
        evidence.patientAdministrationContext ?? null,
      audioMetadata: evidence.audioMetadata ?? null,
      imageMetadata: evidence.imageMetadata ?? null,
      handwritingTrace: evidence.handwritingTrace ?? null,
      captureContext: evidence.captureContext ?? null,
      operatorSnapshot: evidence.operatorSnapshot ?? null,
      qualityStatus: evidence.qualityStatus,
      lockedAt: normalizedDate(evidence.lockedAt),
      voidedAt: normalizedDate(evidence.voidedAt),
      deletedAt: normalizedDate(evidence.deletedAt),
    }));
}

function instanceStableFacts(instance: ScaleInstanceDocument) {
  return {
    id: instance._id.toString(),
    patientId: instance.patientId.toString(),
    assessmentVisitId: instance.assessmentVisitId.toString(),
    scaleDefinitionId: instance.scaleDefinitionId.toString(),
    scaleVersionId: instance.scaleVersionId.toString(),
    scaleCode: instance.scaleCode,
    scaleVersion: instance.scaleVersion,
    instanceCode: instance.instanceCode,
    instanceNo: instance.instanceNo,
    administrationMode: instance.administrationMode,
    startedAt: normalizedDate(instance.startedAt),
    lockedAt: normalizedDate(instance.lockedAt),
    voidedAt: normalizedDate(instance.voidedAt),
    operatorSnapshot: instance.operatorSnapshot ?? null,
    notes: instance.notes ?? null,
  };
}

async function outsideNamespaceHash(
  models: Models,
  ids: {
    userId: Types.ObjectId;
    patientId: Types.ObjectId;
    visitId: Types.ObjectId;
    scaleInstanceId: Types.ObjectId;
    scaleVersionId: Types.ObjectId;
  },
): Promise<string> {
  const db = models.items.db;
  const stamps = async (
    collectionName: string,
    filter: Record<string, unknown>,
  ) =>
    db
      .collection(collectionName)
      .find(filter, { projection: { _id: 1, updatedAt: 1 } })
      .sort({ _id: 1 })
      .map((value) => ({
        id: value._id.toString(),
        updatedAt:
          value.updatedAt instanceof Date
            ? value.updatedAt.toISOString()
            : null,
      }))
      .toArray();
  return hash({
    users: await stamps('users', { _id: { $ne: ids.userId } }),
    authSessions: await stamps('sessions', { userId: { $ne: ids.userId } }),
    patients: await stamps('patients', { _id: { $ne: ids.patientId } }),
    visits: await stamps('assessment_visits', { _id: { $ne: ids.visitId } }),
    instances: await stamps('scale_instances', {
      _id: { $ne: ids.scaleInstanceId },
    }),
    items: await stamps('item_responses', {
      scaleInstanceId: { $ne: ids.scaleInstanceId },
    }),
    administrations: await stamps('patient_administration_sessions', {
      scaleInstanceId: { $ne: ids.scaleInstanceId },
    }),
    media: await stamps('media_evidences', {
      scaleInstanceId: { $ne: ids.scaleInstanceId },
    }),
    scores: await stamps('score_results', {
      scaleInstanceId: { $ne: ids.scaleInstanceId },
    }),
    domains: await stamps('cognitive_domain_results', {
      scaleInstanceId: { $ne: ids.scaleInstanceId },
    }),
    reports: await stamps('clinical_reports', {
      assessmentVisitId: { $ne: ids.visitId },
    }),
    scaleDefinitions: await stamps('scale_definitions', {}),
    scaleVersions: await stamps('scale_versions', {
      _id: { $ne: ids.scaleVersionId },
    }),
  });
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
      'WP10_F3_RUNTIME_GATE_FAILED',
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
    'objectkey',
  ];
  if (forbidden.some((value) => value && serialized.includes(value))) {
    fail(
      'WP10_F3_RUNTIME_UNSAFE',
      'Runtime descriptor contains a forbidden value',
    );
  }
}

async function readDescriptor(path: string): Promise<Descriptor> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    fail(
      'WP10_F3_RUNTIME_UNAVAILABLE',
      'Safe runtime descriptor is unavailable',
    );
  }
  const descriptor = value as Partial<Descriptor>;
  const scenario = descriptor.scenario;
  const hashes = scenario
    ? [
        scenario.sessionBaselineHash,
        scenario.mediaWithoutTranscriptionBaselineHash,
        scenario.unchangedItemsBaselineHash,
        scenario.adoptionAnswerBaselineHash,
        scenario.readingEvidenceBaselineHash,
        scenario.instanceStableBaselineHash,
        scenario.outsideNamespaceBaselineHash,
      ]
    : [];
  if (
    descriptor.schemaVersion !== 1 ||
    descriptor.batch !== 'WP10-F3' ||
    typeof descriptor.namespace !== 'string' ||
    typeof descriptor.accounts?.staff.loginIdentifier !== 'string' ||
    !scenario ||
    ![
      scenario.patientId,
      scenario.visitId,
      scenario.scaleInstanceId,
      scenario.readingItemResponseId,
      scenario.adoptionItemResponseId,
      scenario.audioEvidenceId,
      scenario.adoptionEvidenceId,
    ].every(isObjectId) ||
    scenario.navigationPath !==
      `/patients/${scenario.patientId}/visits/${scenario.visitId}/scale-instances/${scenario.scaleInstanceId}` ||
    scenario.itemCount !== 11 ||
    scenario.stepCount !== 19 ||
    hashes.length !== 7 ||
    !hashes.every((entry) => /^[a-f\d]{64}$/i.test(entry))
  ) {
    fail('WP10_F3_RUNTIME_INVALID', 'Safe runtime descriptor is invalid');
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
    models.items.db.collection('scale_versions').countDocuments({
      scaleCode: 'mmse',
      version: ownedScaleVersion(namespace),
    }),
  ]);
  if (counts.some((count) => count !== 0)) {
    fail('WP10_F3_NAMESPACE_EXISTS', 'The exact namespace is already in use');
  }
}

async function createOwnedMmseCatalog(
  namespace: string,
  models: Models,
): Promise<ExistingMmseCatalogReference> {
  const definitionValue = await models.items.db
    .collection('scale_definitions')
    .findOne({ code: 'mmse' });
  const definition = definitionValue as {
    _id?: unknown;
    status?: unknown;
  } | null;
  if (
    !definition ||
    !(definition._id instanceof Types.ObjectId) ||
    definition.status !== 'active'
  ) {
    fail(
      'WP10_F3_MMSE_CATALOG_UNAVAILABLE',
      'The shared Browser MMSE definition is unavailable',
    );
  }

  const scaleVersionId = new Types.ObjectId();
  const scaleVersion = ownedScaleVersion(namespace);
  await models.items.db.collection('scale_versions').insertOne({
    ...MMSE_SCALE_VERSION_SEED,
    _id: scaleVersionId,
    scaleDefinitionId: definition._id,
    version: scaleVersion,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
  });

  return {
    scaleDefinitionId: definition._id.toString(),
    scaleVersionId: scaleVersionId.toString(),
    scaleVersion,
  };
}

async function createFixture(input: {
  namespace: string;
  password: string;
  path: string;
  models: Models;
  workflows: Workflows;
  auth: AuthService;
}): Promise<Descriptor> {
  let phase = 'namespace_check';
  try {
    await assertUnused(input.namespace, input.models);
    phase = 'staff_account';
    const passwordHash = await input.auth.hashPassword(input.password);
    const user = await input.models.users.create({
      accountName: accountName(input.namespace),
      displayName: 'WP-10 F3 测试医生',
      staffCode: `WP10F3-${input.namespace}-doctor`,
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
    phase = 'patient';
    const patient = await input.models.patients.create({
      subjectCode: subjectCode(input.namespace),
      displayName: 'WP-10 F3 脱敏受试者',
      sourceType: 'research',
      sex: 'unknown',
      birthDate: null,
      educationYears: 12,
      handedness: 'unknown',
      status: 'active',
      tags: ['wp10-f3', 'synthetic'],
      notes: 'Synthetic WP-10 F3 browser fixture only',
      externalRefs: null,
      metadata: null,
    });
    phase = 'visit';
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
      operatorSnapshot: operator(user),
      clinicalContext: null,
      notes: 'Synthetic WP-10 F3 browser fixture visit',
      metadata: null,
    });
    phase = 'mmse_catalog_create';
    const catalog = await createOwnedMmseCatalog(input.namespace, input.models);
    phase = 'mmse_initialize';
    const executionPlan = input.workflows.execution.buildScaleExecutionPlan({
      patientId: patient._id,
      assessmentVisitId: visit._id,
      subjectCode: patient.subjectCode,
      scaleDefinitionId: catalog.scaleDefinitionId,
      scaleVersionId: catalog.scaleVersionId,
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      instanceCode: `INST-${visit._id.toString().toUpperCase()}-MMSE-1`,
      instanceNo: 1,
      administrationMode: 'supervised_patient_input',
      operatorSnapshot: operator(user),
      startedAt: null,
      metadata: null,
    });
    executionPlan.scaleInstanceDraft.scaleVersion = catalog.scaleVersion;
    for (const draft of executionPlan.itemResponseDrafts) {
      draft.scaleVersion = catalog.scaleVersion;
      draft.versionTrace.scaleVersion = catalog.scaleVersion;
    }
    const initialized =
      await input.workflows.execution.createScaleExecutionFromPlan(
        executionPlan,
      );
    phase = 'mmse_load_skeleton';
    const instance = await input.models.instances.findById(
      initialized.scaleInstance.id,
    );
    const items = await input.models.items
      .find({ scaleInstanceId: initialized.scaleInstance.id })
      .sort({ itemOrder: 1 })
      .exec();
    if (!instance || items.length !== 11) {
      fail('WP10_F3_SKELETON_INVALID', 'MMSE fixture skeleton is invalid');
    }
    phase = 'mmse_load_steps';
    const scaleVersion = await input.models.items.db
      .collection('scale_versions')
      .findOne({ _id: instance.scaleVersionId });
    const stepValue: unknown = scaleVersion?.patientAdministrationSteps;
    const steps = Array.isArray(stepValue)
      ? (stepValue as Array<{
          stepKey: string;
          order: number;
          itemCode: string;
          responseMode: string;
        }>)
      : [];
    if (
      steps.length !== 19 ||
      steps.some((step, index) => step.order !== index + 1)
    ) {
      fail('WP10_F3_STEPS_INVALID', 'MMSE patient steps are invalid');
    }

    phase = 'item_drafts';
    const draftTime = new Date(BASE_DATE.getTime() + 60_000);
    for (const item of items) {
      const isReading = item.itemCode === READING_ITEM_CODE;
      const isWriting = item.itemCode === WRITING_ITEM_CODE;
      const isAdoption = item.itemCode === ADOPTION_ITEM_CODE;
      item.status = isReading ? 'in_progress' : 'answered';
      item.answerSource = 'clinician_recorded';
      item.draftRevision = isReading ? 2 : 3;
      item.draftSavedAt = draftTime;
      item.rawResponse = isReading ? null : `synthetic-${item.itemCode}`;
      item.structuredResponse = null;
      item.responseText = isReading ? undefined : '脱敏复核草稿';
      item.isMissing = isWriting;
      item.missingReason = isWriting ? '合成夹具：书写项无法完成' : undefined;
      item.stepResults.forEach((step) => {
        step.actualValue = isReading ? null : true;
      });
      item.timing = {
        timerState: 'completed',
        startedAt: draftTime,
        lastResumedAt: null,
        completedAt: new Date(draftTime.getTime() + 1_000),
        durationMs: 1_000,
        timerSource: 'manual',
      };
      item.evidenceRefs.forEach((reference) => {
        reference.mediaEvidenceId = null;
        reference.status =
          isAdoption && reference.evidenceType === 'photo'
            ? 'pending'
            : 'not_required';
        reference.note = undefined;
      });
      await item.save();
    }
    instance.status = 'in_progress';
    instance.startedAt = BASE_DATE;
    instance.completedAt = null;
    instance.durationMs = null;
    instance.operatorSnapshot = operator(user);
    instance.progress = {
      totalItemCount: items.length,
      answeredItemCount: items.length - 1,
      source: 'live',
    };
    instance.submissionWriteBarrier = null;
    instance.metadata = {};
    await instance.save();

    phase = 'patient_session';
    const administration = await input.models.administrations.create({
      scaleInstanceId: instance._id,
      status: 'completed',
      currentStepKey: steps[steps.length - 1].stepKey,
      revision: 41,
      expiresAt: new Date(BASE_DATE.getTime() + 2 * 60 * 60 * 1000),
      preparationConfirmedAt: BASE_DATE,
      preparationConfirmedBy: operator(user),
      impactFactorCodes: ['sensory', 'device_network'],
      impactFactorNote: '脱敏夹具：现场听力与设备网络因素已记录',
      createdBy: operator(user),
      startedAt: new Date(BASE_DATE.getTime() + 5_000),
      completedAt: new Date(BASE_DATE.getTime() + 25 * 60_000),
      controlEvents: [],
      stepCaptures: steps.map((step) => ({
        stepKey: step.stepKey,
        stepRun: 1,
        capturedBy: 'patient',
        capturedAt: new Date(BASE_DATE.getTime() + step.order * 30_000),
      })),
      playbackFacts: [],
      stepEvidenceRefs: [],
    });

    const itemByCode = new Map(items.map((item) => [item.itemCode, item]));
    const evidenceRefs: Array<{
      stepKey: string;
      stepRun: number;
      evidenceType: 'audio' | 'photo' | 'handwriting';
      mediaEvidenceId: Types.ObjectId;
      uploadedAt: Date;
    }> = [];
    const evidences: MediaEvidenceDocument[] = [];
    phase = 'patient_media';
    for (const step of steps) {
      const evidenceType =
        step.responseMode === 'speech'
          ? ('audio' as const)
          : step.responseMode === 'writing'
            ? ('handwriting' as const)
            : step.responseMode === 'drawing'
              ? ('photo' as const)
              : null;
      if (!evidenceType) continue;
      const item = itemByCode.get(step.itemCode);
      if (!item) {
        fail(
          'WP10_F3_ITEM_MAPPING_INVALID',
          'Patient step item mapping is invalid',
        );
      }
      const uploadedAt = new Date(
        BASE_DATE.getTime() + step.order * 30_000 + 5_000,
      );
      const extension = evidenceType === 'audio' ? 'webm' : 'png';
      const mimeType = evidenceType === 'audio' ? 'audio/webm' : 'image/png';
      const captureMode =
        evidenceType === 'audio'
          ? ('browser_audio_recording' as const)
          : evidenceType === 'handwriting'
            ? ('tablet_handwriting' as const)
            : ('photo_upload' as const);
      const evidence = await input.models.media.create({
        patientId: patient._id,
        assessmentVisitId: visit._id,
        scaleInstanceId: instance._id,
        itemResponseId: item._id,
        subjectCode: patient.subjectCode,
        scaleDefinitionId: instance.scaleDefinitionId,
        scaleVersionId: instance.scaleVersionId,
        scaleCode: instance.scaleCode,
        scaleVersion: instance.scaleVersion,
        instanceCode: instance.instanceCode,
        itemCode: item.itemCode,
        evidenceCode: `WP10F3-${input.namespace}-${step.order}-${evidenceType}`,
        evidenceType,
        captureMode,
        status: 'attached',
        storageStatus: 'stored',
        crfCode: item.crfCode,
        groupCode: item.groupCode,
        itemTitle: item.itemTitle,
        responseType: item.responseType,
        countsTowardTotal: item.countsTowardTotal,
        cognitiveDomainCodes: [...item.cognitiveDomainCodes],
        itemSnapshot: null,
        versionTrace: null,
        storage: {
          storageDriver: 'fake',
          bucket: 'cogmemory-ad-browser-test',
          objectKey: `wp10-f3/${input.namespace}/${step.stepKey}/run-1.${extension}`,
          mimeType,
          fileExtension: extension,
          sizeBytes: evidenceType === 'audio' ? 256 : 128,
          storedAt: uploadedAt,
        },
        imageMetadata:
          evidenceType === 'audio'
            ? null
            : {
                width: 640,
                height: 480,
                orientation: 'landscape',
                pageNo: null,
                isColor: true,
                capturedAt: uploadedAt,
              },
        handwritingTrace:
          evidenceType === 'handwriting'
            ? {
                hasTrajectory: false,
                trajectoryFormat: 'unknown',
                strokeCount: null,
                durationMs: null,
                canvasWidth: 640,
                canvasHeight: 480,
                inputTool: 'finger',
              }
            : null,
        captureContext: {
          capturedAt: uploadedAt,
          uploadedAt,
          sourceApp: 'patient_administration',
        },
        operatorSnapshot: null,
        patientAdministrationContext: {
          sessionId: administration._id,
          stepKey: step.stepKey,
          stepRun: 1,
        },
        audioMetadata: evidenceType === 'audio' ? { durationMs: 3_000 } : null,
        qualityStatus: 'unchecked',
        qualityHints: null,
        metadata: null,
        lockedAt: null,
        voidedAt: null,
        deletedAt: null,
      });
      evidences.push(evidence);
      evidenceRefs.push({
        stepKey: step.stepKey,
        stepRun: 1,
        evidenceType,
        mediaEvidenceId: evidence._id,
        uploadedAt,
      });
    }
    administration.stepEvidenceRefs = evidenceRefs;
    await administration.save();

    phase = 'baseline_descriptor';
    const freshItems = await input.models.items
      .find({ scaleInstanceId: instance._id })
      .sort({ itemOrder: 1 })
      .exec();
    const readingItem = freshItems.find(
      (item) => item.itemCode === READING_ITEM_CODE,
    );
    const adoptionItem = freshItems.find(
      (item) => item.itemCode === ADOPTION_ITEM_CODE,
    );
    const audioEvidence = evidences.find(
      (evidence) => evidence.evidenceType === 'audio',
    );
    const adoptionEvidence = evidences.find(
      (evidence) =>
        evidence.itemCode === ADOPTION_ITEM_CODE &&
        evidence.evidenceType === 'photo',
    );
    if (!readingItem || !adoptionItem || !audioEvidence || !adoptionEvidence) {
      fail('WP10_F3_TARGETS_INVALID', 'Fixture targets are invalid');
    }
    const outsideHash = await outsideNamespaceHash(input.models, {
      userId: user._id,
      patientId: patient._id,
      visitId: visit._id,
      scaleInstanceId: instance._id,
      scaleVersionId: instance.scaleVersionId,
    });
    const descriptor: Descriptor = {
      schemaVersion: 1,
      batch: 'WP10-F3',
      namespace: input.namespace,
      accounts: { staff: { loginIdentifier: user.accountName } },
      scenario: {
        patientId: patient._id.toString(),
        visitId: visit._id.toString(),
        scaleInstanceId: instance._id.toString(),
        navigationPath: `/patients/${patient._id.toString()}/visits/${visit._id.toString()}/scale-instances/${instance._id.toString()}`,
        itemCount: freshItems.length,
        stepCount: steps.length,
        readingItemResponseId: readingItem._id.toString(),
        adoptionItemResponseId: adoptionItem._id.toString(),
        audioEvidenceId: audioEvidence._id.toString(),
        adoptionEvidenceId: adoptionEvidence._id.toString(),
        sessionBaselineHash: hash(sessionFacts(administration)),
        mediaWithoutTranscriptionBaselineHash: hash(
          mediaWithoutTranscriptionFacts(evidences),
        ),
        unchangedItemsBaselineHash: hash(
          freshItems
            .filter(
              (item) =>
                item._id.toString() !== readingItem._id.toString() &&
                item._id.toString() !== adoptionItem._id.toString(),
            )
            .map(itemFacts),
        ),
        adoptionAnswerBaselineHash: hash(answerFacts(adoptionItem)),
        readingEvidenceBaselineHash: hash(normalizedEvidenceRefs(readingItem)),
        instanceStableBaselineHash: hash(instanceStableFacts(instance)),
        outsideNamespaceBaselineHash: outsideHash,
      },
    };
    await writeDescriptor(input.path, descriptor, input.password);
    return descriptor;
  } catch (error: unknown) {
    if (error instanceof FixtureError) throw error;
    const response =
      typeof error === 'object' && error !== null && 'response' in error
        ? error.response
        : null;
    const backendCode =
      typeof response === 'object' &&
      response !== null &&
      'code' in response &&
      typeof response.code === 'string' &&
      /^[A-Z0-9_]{1,80}$/.test(response.code)
        ? response.code
        : 'UNKNOWN';
    fail(
      `WP10_F3_CREATE_${phase.toUpperCase()}_${backendCode}`,
      `Fixture creation failed during ${phase}`,
    );
  }
}

async function loadOwned(input: { descriptor: Descriptor; models: Models }) {
  const { scenario } = input.descriptor;
  const [user, patient, visit, instance, items, administrations, media] =
    await Promise.all([
      input.models.users
        .findOne({
          accountName: input.descriptor.accounts.staff.loginIdentifier,
        })
        .select('+passwordHash'),
      input.models.patients.findById(scenario.patientId),
      input.models.visits.findById(scenario.visitId),
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
        .sort({ evidenceCode: 1 })
        .exec(),
    ]);
  return { user, patient, visit, instance, items, administrations, media };
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
    fail('WP10_F3_NAMESPACE_MISMATCH', 'Runtime namespace mismatch');
  }
  assertDescriptorSafety(input.descriptor, input.password);
  const owned = await loadOwned(input);
  const passwordValid =
    owned.user &&
    (await input.auth.verifyPassword(input.password, owned.user.passwordHash));
  const administration = owned.administrations[0];
  const reading = owned.items.find(
    (item) =>
      item._id.toString() === input.descriptor.scenario.readingItemResponseId,
  );
  const adoption = owned.items.find(
    (item) =>
      item._id.toString() === input.descriptor.scenario.adoptionItemResponseId,
  );
  if (
    !owned.user ||
    !owned.patient ||
    !owned.visit ||
    !owned.instance ||
    !administration ||
    !reading ||
    !adoption
  ) {
    fail('WP10_F3_PREPARED_MISSING', 'Prepared fixture facts are missing');
  }
  const review = await input.workflows.review.getReview({
    patientId: owned.patient._id.toString(),
    visitId: owned.visit._id.toString(),
    scaleInstanceId: owned.instance._id.toString(),
  });
  const readiness = await input.workflows.submission.getSubmissionReadiness(
    owned.patient._id.toString(),
    owned.visit._id.toString(),
    owned.instance._id.toString(),
  );
  const checks: Record<string, boolean> = {
    staff: Boolean(passwordValid && owned.user.roles.join() === 'doctor'),
    patient: owned.patient.status === 'active',
    visit: owned.visit.status === 'in_progress',
    instance:
      owned.instance.status === 'in_progress' &&
      owned.instance.scaleCode === 'mmse' &&
      owned.instance.administrationMode === 'supervised_patient_input' &&
      hash(instanceStableFacts(owned.instance)) ===
        input.descriptor.scenario.instanceStableBaselineHash,
    items:
      owned.items.length === 11 &&
      hash(
        owned.items
          .filter(
            (item) =>
              item._id.toString() !== reading._id.toString() &&
              item._id.toString() !== adoption._id.toString(),
          )
          .map(itemFacts),
      ) === input.descriptor.scenario.unchangedItemsBaselineHash,
    reading:
      reading.itemCode === READING_ITEM_CODE &&
      reading.status === 'in_progress' &&
      reading.draftRevision === 2 &&
      hash(normalizedEvidenceRefs(reading)) ===
        input.descriptor.scenario.readingEvidenceBaselineHash,
    adoption:
      adoption.itemCode === ADOPTION_ITEM_CODE &&
      hash(answerFacts(adoption)) ===
        input.descriptor.scenario.adoptionAnswerBaselineHash &&
      adoption.evidenceRefs.some(
        (reference) =>
          reference.evidenceType === 'photo' &&
          reference.status === 'pending' &&
          !reference.mediaEvidenceId,
      ),
    administration:
      owned.administrations.length === 1 &&
      administration.status === 'completed' &&
      administration.stepCaptures.length === 19 &&
      administration.stepCaptures.every(
        (capture) => !capture.staffObservation && !capture.invalidatedAt,
      ) &&
      hash(sessionFacts(administration)) ===
        input.descriptor.scenario.sessionBaselineHash,
    media:
      owned.media.length === 17 &&
      hash(mediaWithoutTranscriptionFacts(owned.media)) ===
        input.descriptor.scenario.mediaWithoutTranscriptionBaselineHash &&
      owned.media.every((evidence) => !evidence.transcription),
    review:
      review.session.status === 'completed' &&
      review.items.reduce((count, item) => count + item.steps.length, 0) ===
        19 &&
      review.items.some((item) =>
        item.steps.some(
          (step) =>
            step.stepKey === 'mmse-reading-command' &&
            step.responseMode === 'staff_observation',
        ),
      ),
    readiness:
      !readiness.ready &&
      !readiness.canSubmitNow &&
      readiness.blockingIssues.some(
        (issue) =>
          issue.code === 'ITEM_NOT_COMPLETED' &&
          issue.itemResponseId === reading._id.toString(),
      ) &&
      readiness.blockingIssues.some(
        (issue) =>
          issue.code === 'ITEM_REQUIRED_MEDIA_MISSING' &&
          issue.itemResponseId === adoption._id.toString(),
      ),
  };
  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failed.length > 0) {
    fail(
      'WP10_F3_PREPARED_INVALID',
      `Prepared checks failed: ${failed.join(',')}`,
    );
  }
  return {
    itemCount: owned.items.length,
    patientAdministrationStepCount: administration.stepCaptures.length,
    mediaEvidenceCount: owned.media.length,
    reviewItemCount: review.items.length,
    readinessBlockingIssueCount: readiness.blockingIssues.length,
    expectedBlockingTargets: 'reading_answer_and_photo_adoption',
  };
}

async function assertPost(input: {
  descriptor: Descriptor;
  namespace: string;
  password: string;
  models: Models;
}): Promise<Record<string, unknown>> {
  if (input.descriptor.namespace !== input.namespace) {
    fail('WP10_F3_NAMESPACE_MISMATCH', 'Runtime namespace mismatch');
  }
  assertDescriptorSafety(input.descriptor, input.password);
  const owned = await loadOwned(input);
  const { scenario } = input.descriptor;
  const administration = owned.administrations[0];
  const reading = owned.items.find(
    (item) => item._id.toString() === scenario.readingItemResponseId,
  );
  const adoption = owned.items.find(
    (item) => item._id.toString() === scenario.adoptionItemResponseId,
  );
  const transcribed = owned.media.find(
    (evidence) => evidence._id.toString() === scenario.audioEvidenceId,
  );
  const adopted = owned.media.find(
    (evidence) => evidence._id.toString() === scenario.adoptionEvidenceId,
  );
  if (
    !owned.user ||
    !owned.patient ||
    !owned.visit ||
    !owned.instance ||
    !administration ||
    !reading ||
    !adoption ||
    !transcribed ||
    !adopted
  ) {
    fail('WP10_F3_POST_MISSING', 'Post fixture facts are missing');
  }
  const [scoreCount, domainCount, reportCount, outsideHash] = await Promise.all(
    [
      input.models.items.db.collection('score_results').countDocuments({
        scaleInstanceId: owned.instance._id,
      }),
      input.models.items.db
        .collection('cognitive_domain_results')
        .countDocuments({
          scaleInstanceId: owned.instance._id,
        }),
      input.models.items.db.collection('clinical_reports').countDocuments({
        assessmentVisitId: owned.visit._id,
      }),
      outsideNamespaceHash(input.models, {
        userId: owned.user._id,
        patientId: owned.patient._id,
        visitId: owned.visit._id,
        scaleInstanceId: owned.instance._id,
        scaleVersionId: owned.instance.scaleVersionId,
      }),
    ],
  );
  const unchangedItems = owned.items.filter(
    (item) =>
      item._id.toString() !== reading._id.toString() &&
      item._id.toString() !== adoption._id.toString(),
  );
  const adoptedReference = adoption.evidenceRefs.find(
    (reference) => reference.evidenceType === 'photo',
  );
  const transcription = transcribed.transcription;
  const nonTargetTranscriptions = owned.media.filter(
    (evidence) =>
      evidence._id.toString() !== scenario.audioEvidenceId &&
      Boolean(evidence.transcription),
  );
  const checks: Record<string, boolean> = {
    ownership:
      owned.patient.subjectCode === subjectCode(input.namespace) &&
      owned.visit.visitCode === visitCode(input.namespace),
    administration:
      owned.administrations.length === 1 &&
      hash(sessionFacts(administration)) === scenario.sessionBaselineHash,
    mediaIdentity:
      owned.media.length === 17 &&
      hash(mediaWithoutTranscriptionFacts(owned.media)) ===
        scenario.mediaWithoutTranscriptionBaselineHash,
    transcription:
      transcription?.status === 'succeeded' &&
      transcription.text === '测试转写候选' &&
      transcription.provider === 'stub' &&
      Boolean(transcription.requestedAt && transcription.completedAt) &&
      nonTargetTranscriptions.length === 0,
    adoptionEvidence:
      adopted.status === 'attached' &&
      adopted.storageStatus === 'stored' &&
      adopted.patientAdministrationContext?.sessionId.toString() ===
        administration._id.toString(),
    adoptionItem:
      hash(answerFacts(adoption)) === scenario.adoptionAnswerBaselineHash &&
      adoptedReference?.status === 'attached' &&
      adoptedReference.mediaEvidenceId?.toString() ===
        scenario.adoptionEvidenceId,
    readingItemIdentity: reading.itemCode === READING_ITEM_CODE,
    readingItemStatus: reading.status === 'answered',
    readingItemRevision: reading.draftRevision === 3,
    readingItemRawResponse: reading.rawResponse === true,
    readingItemMissingState: !reading.isMissing,
    readingItemEvidence:
      hash(normalizedEvidenceRefs(reading)) ===
      scenario.readingEvidenceBaselineHash,
    unchangedItems:
      hash(unchangedItems.map(itemFacts)) ===
      scenario.unchangedItemsBaselineHash,
    instance:
      hash(instanceStableFacts(owned.instance)) ===
        scenario.instanceStableBaselineHash &&
      owned.instance.status === 'completed' &&
      Boolean(owned.instance.completedAt) &&
      owned.instance.progress?.totalItemCount === 11 &&
      owned.instance.progress?.answeredItemCount === 11 &&
      owned.instance.progress?.source === 'submission' &&
      Boolean(
        (owned.instance.metadata as Record<string, unknown> | null)?.submission,
      ) &&
      owned.instance.submissionWriteBarrier?.state === 'completed',
    downstream: scoreCount + domainCount + reportCount === 0,
    outsideNamespace: outsideHash === scenario.outsideNamespaceBaselineHash,
  };
  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failed.length > 0) {
    fail('WP10_F3_POST_INVALID', `Post checks failed: ${failed.join(',')}`);
  }
  return {
    scaleInstanceStatus: owned.instance.status,
    itemCount: owned.items.length,
    sessionFacts: 'unchanged',
    mediaEvidenceCount: owned.media.length,
    newMediaEvidenceCount: 0,
    transcriptionChangedEvidenceCount: 1,
    adoptedEvidenceReference: 'same_patient_media_evidence_id',
    adoptionAnswerStatusRevision: 'unchanged',
    readingItemA14Change: 'raw_true_answered_revision_plus_one',
    unchangedOtherItems: unchangedItems.length,
    downstreamResultCount: 0,
    outsideNamespaceFacts: 'unchanged',
  };
}

async function cleanup(
  namespace: string,
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
  const ownedScaleVersionFilter = {
    scaleCode: 'mmse',
    version: ownedScaleVersion(namespace),
  };
  const deleted = {
    clinicalReports: (
      await db.collection('clinical_reports').deleteMany({
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
    scaleVersions: (
      await db.collection('scale_versions').deleteMany(ownedScaleVersionFilter)
    ).deletedCount,
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
      assessmentVisitId: { $in: visitIds },
    }),
    db.collection('scale_versions').countDocuments(ownedScaleVersionFilter),
  ]);
  const residualCount = residuals.reduce((sum, value) => sum + value, 0);
  if (residualCount !== 0) {
    fail('WP10_F3_CLEANUP_INCOMPLETE', 'Namespace cleanup left records');
  }
  await unlink(path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  });
  return {
    ok: true,
    command: 'cleanup',
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
      code: known ? error.code : 'WP10_F3_FIXTURE_OPERATION_FAILED',
      message: known
        ? error.message
        : 'WP-10 F3 fixture operation failed without exposing internal details',
    }),
  );
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    const command = parseCommand();
    const namespace = required('WP10_F3_NAMESPACE');
    if (!/^[a-z0-9][a-z0-9-]{2,19}$/.test(namespace)) {
      fail('WP10_F3_NAMESPACE_INVALID', 'Namespace format is invalid');
    }
    const path = required('WP10_F3_RUNTIME_PATH');
    const password =
      command === 'cleanup' ? '' : required('WP10_F3_FIXTURE_PASSWORD', 16);
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
      review: app.get(PatientAdministrationReviewService),
      submission: app.get(ScaleInstanceSubmissionService),
    };
    let result: Record<string, unknown>;
    if (command === 'cleanup') {
      result = await cleanup(namespace, path, models);
    } else if (command === 'replace') {
      await cleanup(namespace, path, models);
      const descriptor = await createFixture({
        namespace,
        password,
        path,
        models,
        workflows,
        auth: app.get(AuthService),
      });
      result = {
        ok: true,
        command,
        namespace,
        actualDatabaseName: DB,
        replaced: true,
        prepared: await assertPrepared({
          descriptor,
          namespace,
          password,
          models,
          auth: app.get(AuthService),
          workflows,
        }),
        runtimeDescriptor: 'safe_route_ids_targets_and_baseline_hashes_only',
      };
    } else if (command === 'prepare') {
      let descriptor: Descriptor;
      let reused = false;
      try {
        descriptor = await readDescriptor(path);
        reused = true;
      } catch (error: unknown) {
        if (
          !(error instanceof FixtureError) ||
          error.code !== 'WP10_F3_RUNTIME_UNAVAILABLE'
        ) {
          throw error;
        }
        try {
          descriptor = await createFixture({
            namespace,
            password,
            path,
            models,
            workflows,
            auth: app.get(AuthService),
          });
        } catch (createError: unknown) {
          await cleanup(namespace, path, models).catch(() => undefined);
          throw createError;
        }
      }
      result = {
        ok: true,
        command,
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
        runtimeDescriptor: 'safe_route_ids_targets_and_baseline_hashes_only',
      };
    } else {
      const descriptor = await readDescriptor(path);
      result =
        command === 'verify-prepared'
          ? {
              ok: true,
              command,
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
              namespace,
              actualDatabaseName: DB,
              post: await assertPost({
                descriptor,
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
