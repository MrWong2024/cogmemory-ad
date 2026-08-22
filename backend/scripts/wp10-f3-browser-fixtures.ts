import 'reflect-metadata';

import { createHash } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
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
  schemaVersion: 2;
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
    adoptionAnswerBaselineHash: string;
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

type CanonicalPatientAdministrationStep = {
  stepKey: string;
  order: number;
  itemCode: string;
  responseMode: string;
};

type SharedMmseCatalogReference = {
  scaleDefinitionId: string;
  scaleVersionId: string;
  scaleVersion: '1.0';
  patientAdministrationSteps: CanonicalPatientAdministrationStep[];
};

type StoredMmseDefinition = {
  _id?: unknown;
  code?: unknown;
  status?: unknown;
  currentVersionId?: unknown;
};

type StoredMmseVersion = Record<string, unknown> & {
  _id?: unknown;
  scaleDefinitionId?: unknown;
  scaleCode?: unknown;
  version?: unknown;
  status?: unknown;
  patientAdministrationSteps?: unknown;
};

const MMSE_CATALOG_BUSINESS_FIELDS = [
  'scaleCode',
  'version',
  'displayVersion',
  'status',
  'crfVersion',
  'scoringRuleVersion',
  'fieldEncodingVersion',
  'sourceDocument',
  'groups',
  'items',
  'totalScoreRange',
  'qualityControlRules',
  'reportingRules',
  'researchExportMappings',
  'presentationPackageKey',
  'patientAdministrationSteps',
] as const;

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

function formalAnswerFacts(item: ItemResponseDocument) {
  return {
    status: item.status,
    answerSource: item.answerSource,
    rawResponse: item.rawResponse ?? null,
    structuredResponse: item.structuredResponse ?? null,
    responseText: item.responseText ?? null,
    isMissing: item.isMissing,
    missingReason: item.missingReason ?? null,
    stepResults: item.stepResults.map((step) => ({
      stepCode: step.stepCode,
      actualValue: step.actualValue ?? null,
      isCorrect: step.isCorrect ?? null,
      scoreValue: step.scoreValue ?? null,
      note: step.note ?? null,
    })),
    promptResponses: item.promptResponses.map((prompt) => ({
      promptType: prompt.promptType,
      responseAfterPrompt: prompt.responseAfterPrompt ?? null,
      isCorrect: prompt.isCorrect ?? null,
      note: prompt.note ?? null,
    })),
    operatorNote: item.operatorNote ?? null,
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
  if (
    descriptor.schemaVersion !== 2 ||
    descriptor.batch !== 'WP10-F3' ||
    typeof descriptor.namespace !== 'string' ||
    !/^[a-z0-9][a-z0-9-]{2,19}$/.test(descriptor.namespace) ||
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
    !Number.isSafeInteger(scenario.itemCount) ||
    scenario.itemCount < 1 ||
    !Number.isSafeInteger(scenario.stepCount) ||
    scenario.stepCount < 1 ||
    !/^[a-f\d]{64}$/i.test(scenario.adoptionAnswerBaselineHash)
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
  ]);
  if (counts.some((count) => count !== 0)) {
    fail('WP10_F3_NAMESPACE_EXISTS', 'The exact namespace is already in use');
  }
}

function mmseBusinessPayload(
  version: StoredMmseVersion,
): Record<string, unknown> {
  return Object.fromEntries(
    MMSE_CATALOG_BUSINESS_FIELDS.map((field) => [field, version[field]]),
  );
}

function trackedMmseBusinessPayload(): Record<string, unknown> {
  const seed = MMSE_SCALE_VERSION_SEED as unknown as Record<string, unknown>;
  return Object.fromEntries(
    MMSE_CATALOG_BUSINESS_FIELDS.map((field) => [field, seed[field]]),
  );
}

function isCanonicalStep(
  value: unknown,
  index: number,
): value is CanonicalPatientAdministrationStep {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const step = value as Record<string, unknown>;
  return (
    typeof step.stepKey === 'string' &&
    Boolean(step.stepKey.trim()) &&
    step.order === index + 1 &&
    typeof step.itemCode === 'string' &&
    Boolean(step.itemCode.trim()) &&
    typeof step.responseMode === 'string' &&
    Boolean(step.responseMode.trim())
  );
}

async function resolveSharedMmseCatalog(
  models: Models,
): Promise<SharedMmseCatalogReference> {
  const [definitions, versions] = await Promise.all([
    models.items.db
      .collection('scale_definitions')
      .find({ code: 'mmse' })
      .limit(2)
      .toArray(),
    models.items.db
      .collection('scale_versions')
      .find({ scaleCode: 'mmse', version: '1.0' })
      .limit(2)
      .toArray(),
  ]);
  const definition = definitions[0] as StoredMmseDefinition | undefined;
  const version = versions[0] as StoredMmseVersion | undefined;
  if (
    definitions.length !== 1 ||
    versions.length !== 1 ||
    !definition ||
    !(definition._id instanceof Types.ObjectId) ||
    !version ||
    !(version._id instanceof Types.ObjectId) ||
    !(version.scaleDefinitionId instanceof Types.ObjectId)
  ) {
    fail(
      'WP10_F3_MMSE_CATALOG_UNAVAILABLE',
      'The shared Browser MMSE catalog is unavailable',
    );
  }
  const steps = version.patientAdministrationSteps;
  if (
    definition.code !== 'mmse' ||
    definition.status !== 'active' ||
    !(definition.currentVersionId instanceof Types.ObjectId) ||
    !definition.currentVersionId.equals(version._id) ||
    !version.scaleDefinitionId.equals(definition._id) ||
    version.scaleCode !== 'mmse' ||
    version.version !== '1.0' ||
    version.status !== 'active' ||
    !isDeepStrictEqual(
      mmseBusinessPayload(version),
      trackedMmseBusinessPayload(),
    ) ||
    !Array.isArray(steps) ||
    steps.length < 1 ||
    !steps.every(isCanonicalStep)
  ) {
    fail(
      'WP10_F3_MMSE_CATALOG_DRIFT',
      'The shared Browser MMSE catalog differs from the tracked MMSE seed',
    );
  }

  return {
    scaleDefinitionId: definition._id.toString(),
    scaleVersionId: version._id.toString(),
    scaleVersion: '1.0',
    patientAdministrationSteps: steps,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildRepresentativeStructuredResponse(
  item: ItemResponseDocument,
): Record<string, unknown> | null {
  if (!isPlainRecord(item.itemConfigSnapshot)) {
    return null;
  }
  const scoringRule = item.itemConfigSnapshot.scoringRule;
  const scoreRange = item.itemConfigSnapshot.scoreRange;
  if (!isPlainRecord(scoringRule)) {
    return null;
  }

  if (scoringRule.mode === 'structured_manual') {
    const configured = Array.isArray(scoringRule.subItems)
      ? scoringRule.subItems
      : Array.isArray(scoringRule.words)
        ? scoringRule.words
        : [];
    const subItems: Record<string, { responseText: string; isCorrect: true }> =
      {};
    for (const value of configured) {
      if (!isPlainRecord(value) || typeof value.code !== 'string') {
        fail(
          'WP10_F3_SKELETON_INVALID',
          'MMSE structured item configuration is invalid',
        );
      }
      const reference =
        typeof value.expected === 'string'
          ? value.expected
          : typeof value.text === 'string'
            ? value.text
            : value.code;
      subItems[value.code] = { responseText: reference, isCorrect: true };
    }
    if (Object.keys(subItems).length < 1) {
      fail(
        'WP10_F3_SKELETON_INVALID',
        'MMSE structured item configuration is empty',
      );
    }
    return { subItems };
  }

  const binaryModes = new Set([
    'manual_exact_match',
    'manual_observation',
    'manual_drawing_review',
  ]);
  if (
    typeof scoringRule.mode === 'string' &&
    binaryModes.has(scoringRule.mode) &&
    isPlainRecord(scoreRange) &&
    scoreRange.min === 0 &&
    scoreRange.max === 1 &&
    scoreRange.step === 1
  ) {
    return { binaryManualDecision: { isCorrect: true } };
  }

  return null;
}

async function createFixture(input: {
  namespace: string;
  password: string;
  path: string;
  models: Models;
  workflows: Workflows;
  auth: AuthService;
}): Promise<Descriptor> {
  let phase = 'mmse_catalog_resolve';
  try {
    const catalog = await resolveSharedMmseCatalog(input.models);
    phase = 'namespace_check';
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
    const steps = catalog.patientAdministrationSteps;

    phase = 'item_drafts';
    const draftTime = new Date(BASE_DATE.getTime() + 60_000);
    for (const item of items) {
      const isReading = item.itemCode === READING_ITEM_CODE;
      const isWriting = item.itemCode === WRITING_ITEM_CODE;
      const isAdoption = item.itemCode === ADOPTION_ITEM_CODE;
      item.status = isReading ? 'in_progress' : 'answered';
      item.answerSource = 'clinician_recorded';
      item.draftSavedAt = draftTime;
      item.rawResponse = isReading || isWriting ? null : true;
      item.structuredResponse = isWriting
        ? null
        : buildRepresentativeStructuredResponse(item);
      item.responseText = isWriting ? undefined : '脱敏代表性正式作答草稿';
      item.isMissing = isWriting;
      item.missingReason = isWriting ? '合成夹具：书写项无法完成' : undefined;
      item.stepResults.forEach((step) => {
        step.actualValue = isReading || isWriting ? null : true;
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
      deviceMode: 'same_device',
      currentStepKey: steps[steps.length - 1].stepKey,
      revision: 0,
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

    const readingItem = items.find(
      (item) => item.itemCode === READING_ITEM_CODE,
    );
    const adoptionItem = items.find(
      (item) => item.itemCode === ADOPTION_ITEM_CODE,
    );
    const readingSteps = steps.filter(
      (step) => step.itemCode === READING_ITEM_CODE,
    );
    const adoptionSteps = steps.filter(
      (step) => step.itemCode === ADOPTION_ITEM_CODE,
    );
    if (
      !readingItem ||
      !adoptionItem ||
      readingSteps.length !== 1 ||
      adoptionSteps.length !== 1
    ) {
      fail('WP10_F3_TARGETS_INVALID', 'Fixture targets are invalid');
    }
    const evidenceRefs: Array<{
      stepKey: string;
      stepRun: number;
      evidenceType: 'audio' | 'photo';
      mediaEvidenceId: Types.ObjectId;
      uploadedAt: Date;
    }> = [];
    const evidences: MediaEvidenceDocument[] = [];
    phase = 'patient_media';
    const representativeTargets = [
      {
        step: readingSteps[0],
        item: readingItem,
        evidenceType: 'audio' as const,
        captureMode: 'browser_audio_recording' as const,
        extension: 'webm',
        mimeType: 'audio/webm',
        sizeBytes: 256,
      },
      {
        step: adoptionSteps[0],
        item: adoptionItem,
        evidenceType: 'photo' as const,
        captureMode: 'photo_upload' as const,
        extension: 'png',
        mimeType: 'image/png',
        sizeBytes: 128,
      },
    ];
    for (const target of representativeTargets) {
      const { step, item, evidenceType } = target;
      const uploadedAt = new Date(
        BASE_DATE.getTime() + step.order * 30_000 + 5_000,
      );
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
        evidenceCode: `WP10F3-${input.namespace}-${evidenceType}`,
        evidenceType,
        captureMode: target.captureMode,
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
          objectKey: `wp10-f3/${input.namespace}/${step.stepKey}/run-1.${target.extension}`,
          mimeType: target.mimeType,
          fileExtension: target.extension,
          sizeBytes: target.sizeBytes,
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
        handwritingTrace: null,
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
    const freshReadingItem = freshItems.find(
      (item) => item.itemCode === READING_ITEM_CODE,
    );
    const freshAdoptionItem = freshItems.find(
      (item) => item.itemCode === ADOPTION_ITEM_CODE,
    );
    const audioEvidence = evidences.find(
      (evidence) =>
        evidence.itemCode === READING_ITEM_CODE &&
        evidence.evidenceType === 'audio',
    );
    const adoptionEvidence = evidences.find(
      (evidence) =>
        evidence.itemCode === ADOPTION_ITEM_CODE &&
        evidence.evidenceType === 'photo',
    );
    if (
      !freshReadingItem ||
      !freshAdoptionItem ||
      !audioEvidence ||
      !adoptionEvidence
    ) {
      fail('WP10_F3_TARGETS_INVALID', 'Fixture targets are invalid');
    }
    const descriptor: Descriptor = {
      schemaVersion: 2,
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
        readingItemResponseId: freshReadingItem._id.toString(),
        adoptionItemResponseId: freshAdoptionItem._id.toString(),
        audioEvidenceId: audioEvidence._id.toString(),
        adoptionEvidenceId: adoptionEvidence._id.toString(),
        adoptionAnswerBaselineHash: hash(formalAnswerFacts(freshAdoptionItem)),
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
  const catalog = await resolveSharedMmseCatalog(input.models);
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
  const audio = owned.media.find(
    (evidence) =>
      evidence._id.toString() === input.descriptor.scenario.audioEvidenceId,
  );
  const photo = owned.media.find(
    (evidence) =>
      evidence._id.toString() === input.descriptor.scenario.adoptionEvidenceId,
  );
  if (
    !owned.user ||
    !owned.patient ||
    !owned.visit ||
    !owned.instance ||
    !administration ||
    !reading ||
    !adoption ||
    !audio ||
    !photo
  ) {
    fail('WP10_F3_PREPARED_MISSING', 'Prepared fixture facts are missing');
  }
  const [review, readiness, scoreCount, domainCount, reportCount] =
    await Promise.all([
      input.workflows.review.getReview({
        patientId: owned.patient._id.toString(),
        visitId: owned.visit._id.toString(),
        scaleInstanceId: owned.instance._id.toString(),
      }),
      input.workflows.submission.getSubmissionReadiness(
        owned.patient._id.toString(),
        owned.visit._id.toString(),
        owned.instance._id.toString(),
      ),
      input.models.items.db.collection('score_results').countDocuments({
        scaleInstanceId: owned.instance._id,
      }),
      input.models.items.db
        .collection('cognitive_domain_results')
        .countDocuments({ scaleInstanceId: owned.instance._id }),
      input.models.items.db.collection('clinical_reports').countDocuments({
        assessmentVisitId: owned.visit._id,
      }),
    ]);
  const reviewReading = review.items.find(
    (item) => item.itemCode === READING_ITEM_CODE,
  );
  const reviewAdoption = review.items.find(
    (item) => item.itemCode === ADOPTION_ITEM_CODE,
  );
  const reviewAudioIds =
    reviewReading?.steps.flatMap((step) =>
      step.runs.flatMap((run) =>
        run.evidence
          .filter((evidence) => evidence.evidenceType === 'audio')
          .map((evidence) => evidence.mediaEvidenceId),
      ),
    ) ?? [];
  const reviewPhotoIds =
    reviewAdoption?.steps.flatMap((step) =>
      step.runs.flatMap((run) =>
        run.evidence
          .filter((evidence) => evidence.evidenceType === 'photo')
          .map((evidence) => evidence.mediaEvidenceId),
      ),
    ) ?? [];
  const reviewAudioRun =
    reviewReading?.steps
      .flatMap((step) => step.runs)
      .find((run) =>
        run.evidence.some(
          (evidence) => evidence.mediaEvidenceId === audio._id.toString(),
        ),
      ) ?? null;
  const reviewAdoptionRun =
    reviewAdoption?.steps
      .flatMap((step) => step.runs)
      .find((run) =>
        run.evidence.some(
          (evidence) => evidence.mediaEvidenceId === photo._id.toString(),
        ),
      ) ?? null;
  const finalCanonicalStep =
    catalog.patientAdministrationSteps[
      catalog.patientAdministrationSteps.length - 1
    ];
  const checks: Record<string, boolean> = {
    staff: Boolean(passwordValid && owned.user.roles.join() === 'doctor'),
    patient: owned.patient.status === 'active',
    visit: owned.visit.status === 'in_progress',
    instance:
      owned.instance.status === 'in_progress' &&
      owned.instance.scaleCode === 'mmse' &&
      owned.instance.scaleVersion === '1.0' &&
      owned.instance.scaleDefinitionId.toString() ===
        catalog.scaleDefinitionId &&
      owned.instance.scaleVersionId.toString() === catalog.scaleVersionId &&
      owned.instance.administrationMode === 'supervised_patient_input',
    reading:
      reading.itemCode === READING_ITEM_CODE &&
      reading.status !== 'answered' &&
      reading.rawResponse == null,
    adoption:
      adoption.itemCode === ADOPTION_ITEM_CODE &&
      adoption.status === 'answered' &&
      hash(formalAnswerFacts(adoption)) ===
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
      Boolean(administration.completedAt) &&
      administration.currentStepKey === finalCanonicalStep.stepKey,
    media:
      owned.media.length === 2 &&
      audio.itemCode === READING_ITEM_CODE &&
      audio.itemResponseId.equals(reading._id) &&
      audio.evidenceType === 'audio' &&
      audio.status === 'attached' &&
      audio.storageStatus === 'stored' &&
      audio.patientAdministrationContext?.sessionId.equals(
        administration._id,
      ) === true &&
      !audio.transcription &&
      photo.itemCode === ADOPTION_ITEM_CODE &&
      photo.itemResponseId.equals(adoption._id) &&
      photo.evidenceType === 'photo' &&
      photo.status === 'attached' &&
      photo.storageStatus === 'stored' &&
      photo.patientAdministrationContext?.sessionId.equals(
        administration._id,
      ) === true &&
      !photo.transcription,
    review:
      review.session.status === 'completed' &&
      reviewReading?.itemResponseId === reading._id.toString() &&
      reviewAdoption?.itemResponseId === adoption._id.toString() &&
      reviewAudioIds.includes(audio._id.toString()) &&
      reviewPhotoIds.includes(photo._id.toString()),
    audioCompletedSession:
      administration.status === 'completed' &&
      review.session.status === 'completed',
    audioValidCapture:
      Boolean(reviewAudioRun?.capture) &&
      reviewAudioRun?.capture?.invalidatedAt === null,
    audioAttachedStored:
      audio.evidenceType === 'audio' &&
      audio.status === 'attached' &&
      audio.storageStatus === 'stored',
    audioTranscriptionRequestable:
      !audio.transcription ||
      !['succeeded', 'processing'].includes(audio.transcription.status),
    audioReviewProjection:
      reviewAudioRun?.evidence.some(
        (evidence) => evidence.mediaEvidenceId === audio._id.toString(),
      ) === true,
    adoptionCompletedSession:
      administration.status === 'completed' &&
      review.session.status === 'completed',
    adoptionValidCapture:
      Boolean(reviewAdoptionRun?.capture) &&
      reviewAdoptionRun?.capture?.invalidatedAt === null,
    adoptionImageEvidence: ['photo', 'handwriting'].includes(
      photo.evidenceType,
    ),
    adoptionAttachedStored:
      photo.status === 'attached' && photo.storageStatus === 'stored',
    adoptionRequirementPending: adoption.evidenceRefs.some(
      (reference) =>
        reference.evidenceType === photo.evidenceType &&
        reference.status === 'pending' &&
        !reference.mediaEvidenceId,
    ),
    adoptionReviewProjection:
      reviewAdoptionRun?.evidence.some(
        (evidence) => evidence.mediaEvidenceId === photo._id.toString(),
      ) === true,
    readiness: !readiness.ready && !readiness.canSubmitNow,
    downstream: scoreCount + domainCount + reportCount === 0,
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
    sharedMmseCanonical: 'active_current_1.0_matches_tracked_seed',
    itemCount: owned.items.length,
    patientAdministrationStepCount: administration.stepCaptures.length,
    completedPatientAdministrationCount: owned.administrations.length,
    representativeMediaEvidenceCount: owned.media.length,
    representativeTargets: 'reading_audio_and_drawing_photo',
    audioActionPrerequisites:
      'completed_valid_capture_attached_stored_transcription_requestable_projected',
    transcription: 'not_requested',
    adoptionActionPrerequisites:
      'completed_valid_capture_image_attached_stored_pending_projected',
    photoAdoption: 'pending',
    readingFormalAnswer: 'not_completed',
    readiness: 'not_ready',
    reviewItemCount: review.items.length,
    downstreamResultCount: 0,
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
  const catalog = await resolveSharedMmseCatalog(input.models);
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
  const [scoreCount, domainCount, reportCount] = await Promise.all([
    input.models.items.db.collection('score_results').countDocuments({
      scaleInstanceId: owned.instance._id,
    }),
    input.models.items.db
      .collection('cognitive_domain_results')
      .countDocuments({ scaleInstanceId: owned.instance._id }),
    input.models.items.db.collection('clinical_reports').countDocuments({
      assessmentVisitId: owned.visit._id,
    }),
  ]);
  const adoptedReference = adoption.evidenceRefs.find(
    (reference) => reference.evidenceType === 'photo',
  );
  const transcription = transcribed.transcription;
  const nonTargetTranscriptions = owned.media.filter(
    (evidence) =>
      evidence._id.toString() !== scenario.audioEvidenceId &&
      Boolean(evidence.transcription),
  );
  const expectedMediaIds = [
    scenario.audioEvidenceId,
    scenario.adoptionEvidenceId,
  ].sort();
  const actualMediaIds = owned.media
    .map((evidence) => evidence._id.toString())
    .sort();
  const finalCanonicalStep =
    catalog.patientAdministrationSteps[
      catalog.patientAdministrationSteps.length - 1
    ];
  const parentBarrier = owned.instance.submissionWriteBarrier;
  const checks: Record<string, boolean> = {
    ownership:
      owned.patient.subjectCode === subjectCode(input.namespace) &&
      owned.visit.visitCode === visitCode(input.namespace),
    administration:
      owned.administrations.length === 1 &&
      administration.status === 'completed' &&
      Boolean(administration.completedAt) &&
      administration.currentStepKey === finalCanonicalStep.stepKey,
    canonical:
      owned.instance.scaleCode === 'mmse' &&
      owned.instance.scaleVersion === '1.0' &&
      owned.instance.scaleDefinitionId.toString() ===
        catalog.scaleDefinitionId &&
      owned.instance.scaleVersionId.toString() === catalog.scaleVersionId,
    mediaIdentity: isDeepStrictEqual(actualMediaIds, expectedMediaIds),
    transcription:
      transcription?.status === 'succeeded' &&
      typeof transcription.text === 'string' &&
      Boolean(transcription.text.trim()) &&
      transcription.requestedAt instanceof Date &&
      transcription.completedAt instanceof Date &&
      nonTargetTranscriptions.length === 0,
    adoptionEvidence:
      adopted.status === 'attached' &&
      adopted.storageStatus === 'stored' &&
      !adopted.transcription &&
      adopted.patientAdministrationContext?.sessionId.toString() ===
        administration._id.toString(),
    adoptionItem:
      hash(formalAnswerFacts(adoption)) ===
        scenario.adoptionAnswerBaselineHash &&
      adoptedReference?.status === 'attached' &&
      adoptedReference.mediaEvidenceId?.toString() ===
        scenario.adoptionEvidenceId,
    readingItem:
      reading.itemCode === READING_ITEM_CODE &&
      reading.status === 'answered' &&
      reading.rawResponse === true &&
      !reading.isMissing,
    instance:
      owned.instance.status === 'completed' &&
      Boolean(owned.instance.completedAt) &&
      owned.instance.progress?.totalItemCount === owned.items.length &&
      owned.instance.progress?.answeredItemCount ===
        owned.instance.progress.totalItemCount &&
      owned.instance.progress?.source === 'submission' &&
      parentBarrier?.state === 'completed',
    submittedItems:
      Boolean(parentBarrier) &&
      owned.items.every(
        (item) =>
          (item.status === 'answered' || item.status === 'scored') &&
          item.submissionWriteBarrier?.version === parentBarrier?.version &&
          item.submissionWriteBarrier?.barrierId === parentBarrier?.barrierId &&
          item.submissionWriteBarrier?.startedAt instanceof Date,
      ),
    downstream: scoreCount + domainCount + reportCount === 0,
  };
  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failed.length > 0) {
    fail('WP10_F3_POST_INVALID', `Post checks failed: ${failed.join(',')}`);
  }
  return {
    sharedMmseCanonical: 'active_current_1.0_matches_tracked_seed',
    scaleInstanceStatus: owned.instance.status,
    itemCount: owned.items.length,
    patientAdministrationSession: 'completed_at_canonical_final_step',
    mediaEvidenceCount: owned.media.length,
    newMediaEvidenceCount: 0,
    transcription: 'target_succeeded_with_nonempty_candidate',
    adoptedEvidenceReference: 'same_patient_media_evidence_id',
    adoptionFormalAnswer: 'unchanged',
    readingItemA14: 'raw_true_answered',
    submissionBarrier: 'completed',
    downstreamResultCount: 0,
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
  ]);
  const residualCount = residuals.reduce((sum, value) => sum + value, 0);
  if (residualCount !== 0) {
    fail('WP10_F3_CLEANUP_INCOMPLETE', 'Namespace cleanup left records');
  }
  await resolveSharedMmseCatalog(models);
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
    sharedMmseCanonical: 'valid_after_cleanup',
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
        runtimeDescriptor:
          'safe_route_ids_targets_and_adoption_answer_baseline_only',
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
        runtimeDescriptor:
          'safe_route_ids_targets_and_adoption_answer_baseline_only',
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
