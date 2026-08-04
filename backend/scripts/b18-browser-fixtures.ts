import 'reflect-metadata';

import { createHash } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
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
import { AssessmentScaleWorkflowService } from '../src/modules/assessments/services/assessment-scale-workflow.service';
import { ItemResponseDraftService } from '../src/modules/assessments/services/item-response-draft.service';
import { ScaleInstanceSubmissionService } from '../src/modules/assessments/services/scale-instance-submission.service';
// prettier-ignore
import { Session, type SessionDocument } from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
import type { AuthenticatedUserContext } from '../src/modules/auth/types/auth-user-context.type';
// prettier-ignore
import { CognitiveDomainResult, type CognitiveDomainResultDocument } from '../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
// prettier-ignore
import { MediaEvidence, type MediaEvidenceDocument } from '../src/modules/media/schemas/media-evidence.schema';
import { MediaEvidenceWorkflowService } from '../src/modules/media/services/media-evidence-workflow.service';
import type { UploadedMemoryFile } from '../src/modules/media/types/uploaded-memory-file.types';
// prettier-ignore
import { Patient, type PatientDocument } from '../src/modules/patients/schemas/patient.schema';
// prettier-ignore
import { ClinicalReport, type ClinicalReportDocument } from '../src/modules/reports/schemas/clinical-report.schema';
// prettier-ignore
import { ScoreResult, type ScoreResultDocument } from '../src/modules/scoring/schemas/score-result.schema';
import { ScaleCatalogService } from '../src/modules/scales/services/scale-catalog.service';
// prettier-ignore
import { User, type UserDocument } from '../src/modules/users/schemas/user.schema';

type Command = 'prepare' | 'verify' | 'cleanup';
type Profile =
  | 'B18-P1-autosave-reload'
  | 'B18-P2-conflict-lifecycle'
  | 'B18-P3-network-reconciliation'
  | 'B18-P4-group-switch'
  | 'B18-P5-media-generation'
  | 'B18-P6-realtime-timing';
type Phase =
  | 'prepared'
  | 'u01-post-autosave'
  | 'u02-post-conflict-lifecycle'
  | 'u03-post-network-reconciliation'
  | 'u04-post-group-switch'
  | 'u05-post-media-generation'
  | 'u06-post-realtime-timing';
type ScenarioKey =
  | 'autosave-reload'
  | 'conflict-server'
  | 'conflict-local'
  | 'lifecycle-close'
  | 'offline-recovery'
  | 'response-loss'
  | 'group-switch-valid-flush'
  | 'group-switch-invalid-preserve'
  | 'media-upload-response-race'
  | 'media-void-reupload-response-race'
  | 'system-timer-lifecycle'
  | 'external-timing-reset';

type PreparedSummary = {
  targetRevision: number;
  targetStatus: string;
  instanceStatus: string;
  totalItemCount: number;
  answeredItemCount: number;
  secondaryRevision: number | null;
  secondaryStatus: string | null;
  targetProtectedFactsHash: string;
  secondaryProtectedFactsHash: string | null;
  targetStateHash: string;
  secondaryStateHash: string | null;
  itemAnswerFactsHash: string;
  nonTargetItemAnswerFactsHash: string;
  resourceCountsHash: string;
  targetMediaCount: number;
  targetAttachedMediaCount: number;
  targetVoidedMediaCount: number;
};

type ScenarioDescriptor = {
  patientId: string;
  visitId: string;
  scaleInstanceId: string;
  navigationPath: string;
  scaleCode: string;
  itemCode: string;
  crfCode: string | null;
  groupCode: string | null;
  secondaryItemCode: string | null;
  secondaryGroupCode: string | null;
  prepared: PreparedSummary;
};

type Descriptor = {
  schemaVersion: 1;
  batch: 'B18';
  profile: Profile;
  namespace: string;
  accounts: Record<'doctor' | 'nurse', { loginIdentifier: string }>;
  scenarios: Partial<Record<ScenarioKey, ScenarioDescriptor>>;
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

type Workflows = {
  scaleCatalog: ScaleCatalogService;
  scaleWorkflow: AssessmentScaleWorkflowService;
  itemDraft: ItemResponseDraftService;
  submission: ScaleInstanceSubmissionService;
  mediaWorkflow: MediaEvidenceWorkflowService;
};

type ScenarioRoot = {
  patientId: Types.ObjectId;
  visitId: Types.ObjectId;
  scaleInstanceId: Types.ObjectId;
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
const P1 = 'B18-P1-autosave-reload' as const;
const P2 = 'B18-P2-conflict-lifecycle' as const;
const P3 = 'B18-P3-network-reconciliation' as const;
const P4 = 'B18-P4-group-switch' as const;
const P5 = 'B18-P5-media-generation' as const;
const P6 = 'B18-P6-realtime-timing' as const;
const PROFILE_KEYS: Record<Profile, readonly ScenarioKey[]> = {
  [P1]: ['autosave-reload'],
  [P2]: ['conflict-server', 'conflict-local', 'lifecycle-close'],
  [P3]: ['offline-recovery', 'response-loss'],
  [P4]: ['group-switch-valid-flush', 'group-switch-invalid-preserve'],
  [P5]: ['media-upload-response-race', 'media-void-reupload-response-race'],
  [P6]: ['system-timer-lifecycle', 'external-timing-reset'],
};
const PROFILE_PREFIX: Record<
  Profile,
  'B18_U01' | 'B18_U02' | 'B18_U03' | 'B18_U04' | 'B18_U05' | 'B18_U06'
> = {
  [P1]: 'B18_U01',
  [P2]: 'B18_U02',
  [P3]: 'B18_U03',
  [P4]: 'B18_U04',
  [P5]: 'B18_U05',
  [P6]: 'B18_U06',
};
const FINAL_TEXT: Record<ScenarioKey, string | null> = {
  'autosave-reload': 'B18 U01 autosave trailing version B',
  'conflict-server': 'B18 U02 doctor server version',
  'conflict-local': 'B18 U02 nurse local version',
  'lifecycle-close': null,
  'offline-recovery': 'B18 U03 offline recovered version',
  'response-loss': 'B18 U03 committed response loss version',
  'group-switch-valid-flush': 'B18 U04 group A version',
  'group-switch-invalid-preserve': null,
  'media-upload-response-race': 'B18 U05 upload race answer',
  'media-void-reupload-response-race': 'B18 U05 void reupload race answer',
  'system-timer-lifecycle': null,
  'external-timing-reset': null,
};
const SECONDARY_FINAL_TEXT: Partial<Record<ScenarioKey, string>> = {
  'group-switch-valid-flush': 'B18 U04 group B version',
};
const GROUP_SWITCH_MISSING_REASON = 'B18 U04 synthetic missing reason';
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const BASE_DATE = new Date('2026-08-04T00:00:00.000Z');

function fail(code: string, message: string): never {
  throw new FixtureError(code, message);
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function required(name: string, minimum = 1): string {
  const value = process.env[name];
  if (!value || value.length < minimum) {
    fail(`B18_${name}_INVALID`, `${name} is invalid`);
  }
  return value;
}

function parseProfile(): Profile {
  const value = process.env.B18_PROFILE;
  if (
    value !== P1 &&
    value !== P2 &&
    value !== P3 &&
    value !== P4 &&
    value !== P5 &&
    value !== P6
  ) {
    fail(
      'B18_PROFILE_INVALID',
      'B18_PROFILE must be an exact supported profile',
    );
  }
  return value;
}

function parseCommand(
  profile: Profile,
  confirmationName: string,
): { command: Command; phase?: Phase } {
  const [command, phase, extra] = process.argv.slice(2);
  if (!['prepare', 'verify', 'cleanup'].includes(command) || extra) {
    fail(
      'B18_COMMAND_INVALID',
      'Use prepare, verify prepared|profile-post-phase, or cleanup',
    );
  }
  const postPhase: Record<Profile, Phase> = {
    [P1]: 'u01-post-autosave',
    [P2]: 'u02-post-conflict-lifecycle',
    [P3]: 'u03-post-network-reconciliation',
    [P4]: 'u04-post-group-switch',
    [P5]: 'u05-post-media-generation',
    [P6]: 'u06-post-realtime-timing',
  };
  if (
    command === 'verify' &&
    phase !== 'prepared' &&
    phase !== postPhase[profile]
  ) {
    fail('B18_PHASE_INVALID', 'verify phase does not belong to this profile');
  }
  if (command !== 'verify' && phase) {
    fail('B18_ARGUMENT_INVALID', 'Unexpected fixture argument');
  }
  if (command === 'cleanup' && process.env[confirmationName] !== '1') {
    fail('B18_CLEANUP_CONFIRMATION_REQUIRED', 'cleanup requires confirmation');
  }
  return { command: command as Command, phase: phase as Phase | undefined };
}

function environment(profile: Profile) {
  const prefix = PROFILE_PREFIX[profile];
  return {
    namespace: `${prefix}_NAMESPACE`,
    runtimePath: `${prefix}_RUNTIME_PATH`,
    fixturePassword: `${prefix}_FIXTURE_PASSWORD`,
    cleanupConfirmation: `${prefix}_CONFIRM_CLEANUP`,
  } as const;
}

function accountNames(namespace: string) {
  return {
    doctor: `b18fx-${namespace}-doctor`,
    nurse: `b18fx-${namespace}-nurse`,
  } as const;
}

function subjectCode(namespace: string, ordinal: number): string {
  return `B18-${namespace.toUpperCase()}-${String(ordinal).padStart(2, '0')}`;
}

function visitCode(namespace: string, ordinal: number): string {
  return `${subjectCode(namespace, ordinal)}-VISIT`;
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

function memoryFile(buffer: Buffer): UploadedMemoryFile {
  return {
    fieldname: 'file',
    originalname: 'synthetic-photo',
    encoding: '7bit',
    mimetype: 'image/png',
    size: buffer.length,
    buffer,
  };
}

function scenarioScaleCode(key: ScenarioKey): 'mmse' | 'moca' {
  return key === 'system-timer-lifecycle' || key === 'external-timing-reset'
    ? 'moca'
    : 'mmse';
}

function asObject(document: unknown): Record<string, unknown> {
  return (document as { toObject(): unknown }).toObject() as Record<
    string,
    unknown
  >;
}

function targetProtectedFacts(
  item: ItemResponseDocument,
  key: ScenarioKey,
): unknown {
  const value = asObject(item);
  const mutableKeys = [
    '__v',
    'createdAt',
    'updatedAt',
    'draftRevision',
    'draftSavedAt',
    'responseText',
    'status',
    'submissionWriteBarrier',
  ];
  if (key === 'group-switch-invalid-preserve') {
    mutableKeys.push('isMissing', 'missingReason');
  }
  if (
    key === 'media-upload-response-race' ||
    key === 'media-void-reupload-response-race'
  ) {
    mutableKeys.push('evidenceRefs');
  }
  if (key === 'system-timer-lifecycle' || key === 'external-timing-reset') {
    mutableKeys.push('timing');
  }
  for (const mutableKey of mutableKeys) {
    delete value[mutableKey];
  }
  return value;
}

function targetStateFacts(item: ItemResponseDocument): unknown {
  return {
    responseText: item.responseText ?? null,
    draftRevision: item.draftRevision,
    draftSavedAt: item.draftSavedAt ?? null,
    status: item.status,
  };
}

function answerFacts(item: ItemResponseDocument): unknown {
  return {
    id: item._id,
    rawResponse: item.rawResponse ?? null,
    structuredResponse: item.structuredResponse ?? null,
    responseText: item.responseText ?? null,
    responseSummary: item.responseSummary ?? null,
    isMissing: item.isMissing,
    missingReason: item.missingReason ?? null,
    score: item.score ?? null,
    stepResults: item.stepResults,
    promptResponses: item.promptResponses,
    timing: item.timing ?? null,
    evidenceRefs: item.evidenceRefs,
    operatorNote: item.operatorNote ?? null,
    draftRevision: item.draftRevision,
    draftSavedAt: item.draftSavedAt ?? null,
    status: item.status,
  };
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
    fail('B18_RUNTIME_GATE_FAILED', 'Fixture runtime is not Browser isolated');
  }
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
    'structuredResponse',
    'responseText',
    'operatorNote',
    'submissionWriteBarrier',
    'objectKey',
    'cookie',
    'session',
    'token',
  ];
  if (
    forbidden.some(
      (value) =>
        value && serialized.toLowerCase().includes(value.toLowerCase()),
    )
  ) {
    fail('B18_RUNTIME_UNSAFE', 'Runtime descriptor contains a forbidden value');
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
    fail('B18_RUNTIME_UNAVAILABLE', 'Safe runtime descriptor is unavailable');
  }
  if (!value || typeof value !== 'object') {
    fail('B18_RUNTIME_INVALID', 'Safe runtime descriptor is invalid');
  }
  const descriptor = value as Partial<Descriptor>;
  if (
    descriptor.schemaVersion !== 1 ||
    descriptor.batch !== 'B18' ||
    descriptor.profile !== profile ||
    typeof descriptor.namespace !== 'string' ||
    !descriptor.accounts ||
    !descriptor.scenarios
  ) {
    fail('B18_RUNTIME_INVALID', 'Safe runtime descriptor is invalid');
  }
  const keys = Object.keys(descriptor.scenarios).sort();
  if (keys.join(',') !== [...PROFILE_KEYS[profile]].sort().join(',')) {
    fail('B18_RUNTIME_INVALID', 'Runtime scenario set is invalid');
  }
  for (const scenario of Object.values(descriptor.scenarios)) {
    if (
      !scenario ||
      !isObjectId(scenario.patientId) ||
      !isObjectId(scenario.visitId) ||
      !isObjectId(scenario.scaleInstanceId) ||
      !/^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}\/scale-instances\/[a-f\d]{24}$/i.test(
        scenario.navigationPath,
      ) ||
      (scenario.scaleCode !== 'mmse' && scenario.scaleCode !== 'moca') ||
      !scenario.itemCode ||
      !scenario.prepared ||
      (scenario.groupCode !== null && typeof scenario.groupCode !== 'string') ||
      (scenario.secondaryItemCode !== null &&
        typeof scenario.secondaryItemCode !== 'string') ||
      (scenario.secondaryGroupCode !== null &&
        typeof scenario.secondaryGroupCode !== 'string')
    ) {
      fail('B18_RUNTIME_INVALID', 'Runtime scenario is invalid');
    }
    if (
      (profile === P6 && scenario.scaleCode !== 'moca') ||
      (profile !== P6 && scenario.scaleCode !== 'mmse')
    ) {
      fail('B18_RUNTIME_INVALID', 'Runtime scenario scale is invalid');
    }
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

async function createUsers(
  namespace: string,
  password: string,
  models: Models,
  auth: AuthService,
) {
  const names = accountNames(namespace);
  const hashes = await Promise.all([
    auth.hashPassword(password),
    auth.hashPassword(password),
  ]);
  const created = await Promise.all(
    (['doctor', 'nurse'] as const).map((role, index) =>
      models.users.create({
        accountName: names[role],
        displayName: role === 'doctor' ? 'B18 测试医生' : 'B18 测试护士',
        staffCode: `B18FX-${namespace}-${role}`,
        passwordHash: hashes[index],
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

async function assertUnused(
  namespace: string,
  profile: Profile,
  models: Models,
): Promise<void> {
  const names = accountNames(namespace);
  const count = PROFILE_KEYS[profile].length;
  const subjects = Array.from({ length: count }, (_, index) =>
    subjectCode(namespace, index + 1),
  );
  const visits = Array.from({ length: count }, (_, index) =>
    visitCode(namespace, index + 1),
  );
  const [userCount, patientCount, visitCount] = await Promise.all([
    models.users.countDocuments({ accountName: { $in: Object.values(names) } }),
    models.patients.countDocuments({ subjectCode: { $in: subjects } }),
    models.visits.countDocuments({ visitCode: { $in: visits } }),
  ]);
  if (userCount + patientCount + visitCount !== 0) {
    fail('B18_NAMESPACE_EXISTS', 'The exact B18 namespace is already in use');
  }
}

async function createRoot(input: {
  namespace: string;
  ordinal: number;
  scaleCode: 'mmse' | 'moca';
  actor: AuthenticatedUserContext;
  models: Models;
  workflows: Workflows;
}): Promise<ScenarioRoot> {
  const subject = subjectCode(input.namespace, input.ordinal);
  const patient = await input.models.patients.create({
    subjectCode: subject,
    displayName: `B18 脱敏受试者 ${input.ordinal}`,
    sourceType: 'research',
    sex: 'unknown',
    birthDate: null,
    educationYears: 12,
    handedness: 'unknown',
    status: 'active',
    tags: ['batch-b18', 'synthetic'],
    notes: 'Synthetic B18 browser fixture only',
    externalRefs: null,
    metadata: null,
  });
  const assessmentDate = new Date(
    BASE_DATE.getTime() + input.ordinal * 24 * 60 * 60 * 1000,
  );
  const visit = await input.models.visits.create({
    patientId: patient._id,
    subjectCode: subject,
    visitCode: visitCode(input.namespace, input.ordinal),
    visitType: input.ordinal === 1 ? 'baseline' : 'follow_up',
    status: 'in_progress',
    assessmentDate,
    startedAt: assessmentDate,
    completedAt: null,
    lockedAt: null,
    voidedAt: null,
    operatorSnapshot: null,
    clinicalContext: null,
    notes: 'Synthetic B18 browser fixture Visit',
    metadata: null,
  });
  const response = await input.workflows.scaleWorkflow.initializeScaleInstance(
    patient._id.toString(),
    visit._id.toString(),
    {
      scaleCode: input.scaleCode,
      administrationMode: 'clinician_administered',
    },
    {
      operatorId: input.actor.id,
      operatorName: input.actor.displayName,
      operatorRole: 'doctor',
    },
  );
  return {
    patientId: patient._id,
    visitId: visit._id,
    scaleInstanceId: new Types.ObjectId(response.scaleInstance.id),
  };
}

async function makeReady(
  root: ScenarioRoot,
  models: Models,
  itemDraft: ItemResponseDraftService,
): Promise<void> {
  const items = await models.items
    .find({ scaleInstanceId: root.scaleInstanceId })
    .sort({ itemOrder: 1 })
    .exec();
  if (items.length === 0)
    fail('B18_READY_ITEMS_MISSING', 'Ready fixture has no items');

  for (const [index, item] of items.entries()) {
    if (index === 0) {
      const saved = await itemDraft.saveDraft(
        root.patientId.toString(),
        root.visitId.toString(),
        root.scaleInstanceId.toString(),
        item._id.toString(),
        {
          expectedRevision: item.draftRevision,
          rawResponse: false,
          operatorNote: 'B18 readiness fixture note',
          markAsAnswered: true,
        },
      );
      if (item.stepResults.length > 0) {
        await itemDraft.saveDraft(
          root.patientId.toString(),
          root.visitId.toString(),
          root.scaleInstanceId.toString(),
          item._id.toString(),
          {
            expectedRevision: saved.itemResponse.draftRevision,
            stepResponses: item.stepResults.map((step) => ({
              stepCode: step.stepCode,
              actualValue: 0,
            })),
          },
        );
      }
    } else {
      await itemDraft.saveDraft(
        root.patientId.toString(),
        root.visitId.toString(),
        root.scaleInstanceId.toString(),
        item._id.toString(),
        {
          expectedRevision: item.draftRevision,
          isMissing: true,
          missingReason: 'B18 synthetic readiness prerequisite',
          markAsAnswered: true,
        },
      );
    }
  }

  const readiness = await models.instances.findById(root.scaleInstanceId);
  if (!readiness || readiness.status === 'completed') {
    fail('B18_READY_INSTANCE_INVALID', 'Ready fixture instance is invalid');
  }
}

function findScenarioTargets(
  items: ItemResponseDocument[],
  key: ScenarioKey,
): { target: ItemResponseDocument; secondary: ItemResponseDocument | null } {
  let target: ItemResponseDocument | undefined = items[0];
  if (
    key === 'media-upload-response-race' ||
    key === 'media-void-reupload-response-race'
  ) {
    target = items.find((item) =>
      item.evidenceRefs.some((reference) => reference.evidenceType === 'photo'),
    );
  } else if (
    key === 'system-timer-lifecycle' ||
    key === 'external-timing-reset'
  ) {
    target = items.find(
      (item) => item.itemConfigSnapshot?.requiresTimer === true,
    );
  }
  if (!target) {
    fail('B18_SCENARIO_TARGET_MISSING', 'Scenario target item is missing');
  }
  const secondary = key.startsWith('group-switch-')
    ? (items.find(
        (item) =>
          item._id.toString() !== target._id.toString() &&
          item.groupCode !== target.groupCode,
      ) ?? null)
    : null;
  if (key.startsWith('group-switch-') && !secondary) {
    fail(
      'B18_SCENARIO_SECONDARY_MISSING',
      'Group-switch secondary item is missing',
    );
  }
  return { target, secondary };
}

async function uploadPreparedPhoto(input: {
  root: ScenarioRoot;
  item: ItemResponseDocument;
  actor: AuthenticatedUserContext;
  mediaWorkflow: MediaEvidenceWorkflowService;
}): Promise<void> {
  await input.mediaWorkflow.uploadEvidence(
    {
      patientId: input.root.patientId.toString(),
      visitId: input.root.visitId.toString(),
      scaleInstanceId: input.root.scaleInstanceId.toString(),
      itemResponseId: input.item._id.toString(),
    },
    {
      evidenceType: 'photo',
      captureMode: 'photo_upload',
      imageWidth: 1,
      imageHeight: 1,
    },
    { file: [memoryFile(VALID_PNG)] },
    input.actor,
  );
}

async function snapshotScenario(
  root: ScenarioRoot,
  key: ScenarioKey,
  models: Models,
): Promise<ScenarioDescriptor> {
  const [instance, items, scores, domains, media, reports] = await Promise.all([
    models.instances.findById(root.scaleInstanceId),
    models.items
      .find({ scaleInstanceId: root.scaleInstanceId })
      .sort({ itemOrder: 1 })
      .exec(),
    models.scores.countDocuments({ scaleInstanceId: root.scaleInstanceId }),
    models.domains.countDocuments({ scaleInstanceId: root.scaleInstanceId }),
    models.media.find({ scaleInstanceId: root.scaleInstanceId }).exec(),
    models.reports.countDocuments({ scaleInstanceId: root.scaleInstanceId }),
  ]);
  if (!instance || items.length === 0) {
    fail('B18_SCENARIO_MISSING', 'Prepared B18 scenario is incomplete');
  }
  const { target, secondary } = findScenarioTargets(items, key);
  const answeredItemCount = items.filter((item) =>
    ['answered', 'scored', 'locked'].includes(item.status),
  ).length;
  const targetMedia = media.filter(
    (entry) => entry.itemResponseId.toString() === target._id.toString(),
  );
  const excludedIds = new Set(
    [target, secondary]
      .filter((item): item is ItemResponseDocument => item !== null)
      .map((item) => item._id.toString()),
  );
  return {
    patientId: root.patientId.toString(),
    visitId: root.visitId.toString(),
    scaleInstanceId: root.scaleInstanceId.toString(),
    navigationPath: `/patients/${root.patientId.toString()}/visits/${root.visitId.toString()}/scale-instances/${root.scaleInstanceId.toString()}`,
    scaleCode: instance.scaleCode,
    itemCode: target.itemCode,
    crfCode: target.crfCode ?? null,
    groupCode: target.groupCode ?? null,
    secondaryItemCode: secondary?.itemCode ?? null,
    secondaryGroupCode: secondary?.groupCode ?? null,
    prepared: {
      targetRevision: target.draftRevision,
      targetStatus: target.status,
      instanceStatus: instance.status,
      totalItemCount: items.length,
      answeredItemCount,
      secondaryRevision: secondary?.draftRevision ?? null,
      secondaryStatus: secondary?.status ?? null,
      targetProtectedFactsHash: hash(targetProtectedFacts(target, key)),
      secondaryProtectedFactsHash: secondary
        ? hash(targetProtectedFacts(secondary, key))
        : null,
      targetStateHash: hash(targetStateFacts(target)),
      secondaryStateHash: secondary ? hash(targetStateFacts(secondary)) : null,
      itemAnswerFactsHash: hash(items.map(answerFacts)),
      nonTargetItemAnswerFactsHash: hash(
        items
          .filter((item) => !excludedIds.has(item._id.toString()))
          .map(answerFacts),
      ),
      resourceCountsHash: hash({
        scores,
        domains,
        media: media.length,
        reports,
      }),
      targetMediaCount: targetMedia.length,
      targetAttachedMediaCount: targetMedia.filter(
        (entry) => entry.status === 'attached',
      ).length,
      targetVoidedMediaCount: targetMedia.filter(
        (entry) => entry.status === 'voided',
      ).length,
    },
  };
}

async function assertPreparedScenario(
  scenario: ScenarioDescriptor,
  key: ScenarioKey,
  models: Models,
  submission: ScaleInstanceSubmissionService,
): Promise<void> {
  const root = {
    patientId: new Types.ObjectId(scenario.patientId),
    visitId: new Types.ObjectId(scenario.visitId),
    scaleInstanceId: new Types.ObjectId(scenario.scaleInstanceId),
  };
  const current = await snapshotScenario(root, key, models);
  if (hash(current.prepared) !== hash(scenario.prepared)) {
    fail('B18_PREPARED_FACTS_CHANGED', 'Prepared B18 facts changed');
  }
  if (key === 'lifecycle-close') {
    const readiness = await submission.getSubmissionReadiness(
      scenario.patientId,
      scenario.visitId,
      scenario.scaleInstanceId,
    );
    if (
      !readiness.ready ||
      !readiness.canSubmitNow ||
      readiness.blockingIssues.length !== 0
    ) {
      fail('B18_READINESS_INVALID', 'Lifecycle fixture is not truly ready');
    }
  }
}

async function assertPostScenario(
  scenario: ScenarioDescriptor,
  key: ScenarioKey,
  models: Models,
): Promise<Record<string, unknown>> {
  const [instance, items, scores, domains, media, reports] = await Promise.all([
    models.instances.findById(scenario.scaleInstanceId),
    models.items
      .find({ scaleInstanceId: scenario.scaleInstanceId })
      .sort({ itemOrder: 1 })
      .exec(),
    models.scores.countDocuments({ scaleInstanceId: scenario.scaleInstanceId }),
    models.domains.countDocuments({
      scaleInstanceId: scenario.scaleInstanceId,
    }),
    models.media
      .find({ scaleInstanceId: scenario.scaleInstanceId })
      .sort({ createdAt: 1 })
      .exec(),
    models.reports.countDocuments({
      scaleInstanceId: scenario.scaleInstanceId,
    }),
  ]);
  const actualTarget = items.find(
    (item) => item.itemCode === scenario.itemCode,
  );
  const actualSecondary = scenario.secondaryItemCode
    ? items.find((item) => item.itemCode === scenario.secondaryItemCode)
    : null;
  if (
    !instance ||
    !actualTarget ||
    items.length !== scenario.prepared.totalItemCount
  ) {
    fail('B18_POST_ROOT_INVALID', 'Post-Browser root facts are invalid');
  }
  if (
    hash(targetProtectedFacts(actualTarget, key)) !==
    scenario.prepared.targetProtectedFactsHash
  ) {
    fail('B18_PROTECTED_FACTS_CHANGED', 'Protected target facts changed');
  }
  if (
    scenario.secondaryItemCode &&
    (!actualSecondary ||
      hash(targetProtectedFacts(actualSecondary, key)) !==
        scenario.prepared.secondaryProtectedFactsHash)
  ) {
    fail('B18_PROTECTED_FACTS_CHANGED', 'Protected secondary facts changed');
  }
  if (scores + domains + reports !== 0) {
    fail(
      'B18_ADJACENT_OUTPUT_CREATED',
      'Scoring, domain, or report facts were created',
    );
  }
  const excludedIds = new Set<string>([
    actualTarget._id.toString(),
    ...(actualSecondary ? [actualSecondary._id.toString()] : []),
  ]);
  if (
    hash(
      items
        .filter((item) => !excludedIds.has(item._id.toString()))
        .map(answerFacts),
    ) !== scenario.prepared.nonTargetItemAnswerFactsHash
  ) {
    fail('B18_ADJACENT_ITEM_CHANGED', 'An adjacent item changed unexpectedly');
  }

  if (key === 'lifecycle-close') {
    const metadata = instance.metadata ?? {};
    const submission = metadata.submission as
      | Record<string, unknown>
      | undefined;
    const submittedBy = submission?.submittedBy;
    const unchanged =
      hash(targetStateFacts(actualTarget)) ===
      scenario.prepared.targetStateHash;
    if (
      instance.status !== 'completed' ||
      !instance.completedAt ||
      !unchanged ||
      !submission ||
      typeof submission.submissionId !== 'string' ||
      !(submittedBy instanceof Types.ObjectId || isObjectId(submittedBy)) ||
      submission.submittedByRole !== 'doctor'
    ) {
      fail('B18_LIFECYCLE_POST_INVALID', 'Lifecycle close facts are invalid');
    }
    return {
      instanceStatus: 'completed',
      targetState: 'unchanged',
      submissionAuditCount: 1,
      submissionActorRole: 'doctor',
      scoreCount: scores,
      domainCount: domains,
      reportCount: reports,
      mediaCount: media.length,
    };
  }

  if (instance.status === 'completed' || instance.completedAt) {
    fail('B18_INSTANCE_CLOSED', 'A draft scenario closed its instance');
  }

  if (key === 'group-switch-valid-flush') {
    if (
      !actualSecondary ||
      actualTarget.draftRevision !== scenario.prepared.targetRevision + 1 ||
      actualSecondary.draftRevision !==
        (scenario.prepared.secondaryRevision ?? -1) + 1 ||
      actualTarget.responseText !== FINAL_TEXT[key] ||
      actualSecondary.responseText !== SECONDARY_FINAL_TEXT[key] ||
      !actualTarget.draftSavedAt ||
      !actualSecondary.draftSavedAt ||
      media.length !== scenario.prepared.targetMediaCount
    ) {
      fail(
        'B18_GROUP_SWITCH_POST_INVALID',
        'Valid group-switch facts are invalid',
      );
    }
    return {
      targetRevisionDelta: 1,
      secondaryRevisionDelta: 1,
      independentItemPatchCount: 2,
      instanceStatus: instance.status,
      protectedFacts: 'matched',
      adjacentItemFacts: 'matched',
    };
  }

  if (key === 'group-switch-invalid-preserve') {
    if (
      actualTarget.draftRevision !== scenario.prepared.targetRevision + 1 ||
      actualTarget.isMissing !== true ||
      actualTarget.missingReason !== GROUP_SWITCH_MISSING_REASON ||
      (actualTarget.responseText ?? null) !== null ||
      !actualTarget.draftSavedAt ||
      !actualSecondary ||
      hash(targetStateFacts(actualSecondary)) !==
        scenario.prepared.secondaryStateHash ||
      media.length !== scenario.prepared.targetMediaCount
    ) {
      fail(
        'B18_GROUP_SWITCH_POST_INVALID',
        'Invalid group-switch recovery facts are invalid',
      );
    }
    return {
      targetRevisionDelta: 1,
      invalidSwitchPatchCount: 0,
      recoveredSwitchPatchCount: 1,
      missingState: 'persisted',
      instanceStatus: instance.status,
      protectedFacts: 'matched',
      adjacentItemFacts: 'matched',
    };
  }

  const targetMedia = media.filter(
    (entry) => entry.itemResponseId.toString() === actualTarget._id.toString(),
  );
  const attachedMedia = targetMedia.filter(
    (entry) => entry.status === 'attached',
  );
  const voidedMedia = targetMedia.filter((entry) => entry.status === 'voided');
  const photoReference = actualTarget.evidenceRefs.find(
    (reference) => reference.evidenceType === 'photo',
  );
  const activeMediaId = attachedMedia[0]?._id.toString() ?? null;
  const referenceMediaId = photoReference?.mediaEvidenceId?.toString() ?? null;

  if (
    key === 'media-upload-response-race' ||
    key === 'media-void-reupload-response-race'
  ) {
    const expectedMediaCount =
      key === 'media-upload-response-race'
        ? scenario.prepared.targetMediaCount + 1
        : scenario.prepared.targetMediaCount + 1;
    const expectedVoidedCount = key === 'media-upload-response-race' ? 0 : 1;
    if (
      actualTarget.draftRevision !== scenario.prepared.targetRevision + 1 ||
      actualTarget.responseText !== FINAL_TEXT[key] ||
      !actualTarget.draftSavedAt ||
      targetMedia.length !== expectedMediaCount ||
      attachedMedia.length !== 1 ||
      voidedMedia.length !== expectedVoidedCount ||
      photoReference?.status !== 'attached' ||
      referenceMediaId !== activeMediaId
    ) {
      fail(
        'B18_MEDIA_POST_INVALID',
        'Media generation merge facts are invalid',
      );
    }
    return {
      revisionDelta: 1,
      mediaCountDelta: 1,
      attachedMediaCount: 1,
      voidedMediaCount: expectedVoidedCount,
      photoReference: 'attached_to_active_media',
      draftSavedAt: 'present',
      instanceStatus: instance.status,
      protectedFacts: 'matched',
      adjacentItemFacts: 'matched',
    };
  }

  if (key === 'system-timer-lifecycle') {
    const timing = actualTarget.timing;
    if (
      actualTarget.draftRevision !== scenario.prepared.targetRevision + 5 ||
      !actualTarget.draftSavedAt ||
      timing?.timerState !== 'completed' ||
      timing.timerSource !== 'system' ||
      !timing.startedAt ||
      !timing.completedAt ||
      timing.lastResumedAt ||
      (timing.durationMs ?? 0) < 15_000 ||
      media.length !== 0
    ) {
      fail(
        'B18_TIMER_POST_INVALID',
        'System timer lifecycle facts are invalid',
      );
    }
    return {
      revisionDelta: 5,
      timerState: 'completed',
      timerSource: 'system',
      durationCheckpoint: 'at_least_15_seconds',
      instanceStatus: instance.status,
      protectedFacts: 'matched',
      adjacentItemFacts: 'matched',
    };
  }

  if (key === 'external-timing-reset') {
    const timing = actualTarget.timing;
    if (
      actualTarget.draftRevision !== scenario.prepared.targetRevision + 5 ||
      !actualTarget.draftSavedAt ||
      timing?.timerState !== 'completed' ||
      timing.timerSource !== 'imported' ||
      timing.lastResumedAt ||
      timing.durationMs !== 0 ||
      media.length !== 0
    ) {
      fail('B18_TIMER_POST_INVALID', 'External timing reset facts are invalid');
    }
    return {
      revisionDelta: 5,
      finalTimerState: 'completed',
      finalTimerSource: 'imported',
      resetCount: 2,
      instanceStatus: instance.status,
      protectedFacts: 'matched',
      adjacentItemFacts: 'matched',
    };
  }

  const delta = key === 'autosave-reload' || key === 'conflict-local' ? 2 : 1;
  const expectedText = FINAL_TEXT[key];
  if (
    actualTarget.draftRevision !== scenario.prepared.targetRevision + delta ||
    hash(actualTarget.responseText ?? null) !== hash(expectedText) ||
    !actualTarget.draftSavedAt ||
    instance.completedAt ||
    media.length !== 0
  ) {
    fail('B18_POST_SAVE_INVALID', 'Post-Browser save facts are invalid');
  }
  return {
    revisionDelta: delta,
    finalDraftHash: hash(actualTarget.responseText ?? null),
    draftSavedAt: 'present',
    instanceStatus: instance.status,
    scoreCount: scores,
    domainCount: domains,
    reportCount: reports,
    mediaCount: media.length,
    protectedFacts: 'matched',
  };
}

async function prepare(input: {
  profile: Profile;
  namespace: string;
  password: string;
  path: string;
  models: Models;
  workflows: Workflows;
  auth: AuthService;
}) {
  await readFile(input.path, 'utf8').then(
    () => fail('B18_RUNTIME_EXISTS', 'Use an unused runtime descriptor path'),
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    },
  );
  await assertUnused(input.namespace, input.profile, input.models);
  try {
    const users = await createUsers(
      input.namespace,
      input.password,
      input.models,
      input.auth,
    );
    const doctor = actor(users.doctor);
    const scaleCode = input.profile === P6 ? 'moca' : 'mmse';
    await input.workflows.scaleCatalog.ensureSeedScaleVersionMaterialized(
      scaleCode,
    );
    const scenarios: Partial<Record<ScenarioKey, ScenarioDescriptor>> = {};
    for (const [index, key] of PROFILE_KEYS[input.profile].entries()) {
      const root = await createRoot({
        namespace: input.namespace,
        ordinal: index + 1,
        scaleCode: scenarioScaleCode(key),
        actor: doctor,
        models: input.models,
        workflows: input.workflows,
      });
      if (key === 'lifecycle-close') {
        await makeReady(root, input.models, input.workflows.itemDraft);
      }
      if (key === 'media-void-reupload-response-race') {
        const items = await input.models.items
          .find({ scaleInstanceId: root.scaleInstanceId })
          .sort({ itemOrder: 1 })
          .exec();
        const { target } = findScenarioTargets(items, key);
        await uploadPreparedPhoto({
          root,
          item: target,
          actor: doctor,
          mediaWorkflow: input.workflows.mediaWorkflow,
        });
      }
      scenarios[key] = await snapshotScenario(root, key, input.models);
    }
    const descriptor: Descriptor = {
      schemaVersion: 1,
      batch: 'B18',
      profile: input.profile,
      namespace: input.namespace,
      accounts: {
        doctor: { loginIdentifier: users.doctor.accountName },
        nurse: { loginIdentifier: users.nurse.accountName },
      },
      scenarios,
    };
    for (const key of PROFILE_KEYS[input.profile]) {
      await assertPreparedScenario(
        descriptor.scenarios[key]!,
        key,
        input.models,
        input.workflows.submission,
      );
    }
    await writeDescriptor(input.path, descriptor, input.password);
    return {
      ok: true,
      command: 'prepare',
      profile: input.profile,
      databasePurpose: 'browser_acceptance',
      actualDatabaseName: DB,
      namespace: input.namespace,
      accountRoles: { doctor: 'doctor', nurse: 'nurse' },
      scenarioCount: PROFILE_KEYS[input.profile].length,
      runtimeDescriptor: 'written_with_safe_ids_hashes_and_counts_only',
    };
  } catch (error: unknown) {
    await cleanup(
      input.namespace,
      input.profile,
      input.path,
      input.models,
    ).catch(() => undefined);
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
  workflows: Workflows;
  auth: AuthService;
}) {
  const descriptor = await readDescriptor(input.path, input.profile);
  assertDescriptorSafety(descriptor, input.password);
  if (descriptor.namespace !== input.namespace) {
    fail('B18_NAMESPACE_MISMATCH', 'Runtime namespace mismatch');
  }
  const users = await input.models.users
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
    !(await input.auth.verifyPassword(
      input.password,
      doctor?.passwordHash ?? '',
    )) ||
    !(await input.auth.verifyPassword(
      input.password,
      nurse?.passwordHash ?? '',
    ))
  ) {
    fail('B18_ACCOUNTS_INVALID', 'Doctor or nurse account contract failed');
  }
  const scenarioResults: Partial<Record<ScenarioKey, unknown>> = {};
  for (const key of PROFILE_KEYS[input.profile]) {
    const scenario = descriptor.scenarios[key]!;
    if (input.phase === 'prepared') {
      await assertPreparedScenario(
        scenario,
        key,
        input.models,
        input.workflows.submission,
      );
      scenarioResults[key] = {
        revision: scenario.prepared.targetRevision,
        instanceStatus: scenario.prepared.instanceStatus,
        itemCount: scenario.prepared.totalItemCount,
        protectedFacts: 'matched',
      };
    } else {
      scenarioResults[key] = await assertPostScenario(
        scenario,
        key,
        input.models,
      );
    }
  }
  return {
    ok: true,
    command: 'verify',
    profile: input.profile,
    phase: input.phase,
    databasePurpose: 'browser_acceptance',
    actualDatabaseName: DB,
    namespace: input.namespace,
    accountRoles: { doctor: 'doctor', nurse: 'nurse' },
    scenarios: scenarioResults,
  };
}

async function cleanup(
  namespace: string,
  profile: Profile,
  path: string,
  models: Models,
) {
  const names = accountNames(namespace);
  const count = PROFILE_KEYS[profile].length;
  const subjects = Array.from({ length: count }, (_, index) =>
    subjectCode(namespace, index + 1),
  );
  const visitCodes = Array.from({ length: count }, (_, index) =>
    visitCode(namespace, index + 1),
  );
  const [users, patients, visits] = await Promise.all([
    models.users.find({ accountName: { $in: Object.values(names) } }),
    models.patients.find({ subjectCode: { $in: subjects } }),
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
  const reportIds = reports.map((entry) => entry._id);
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
    models.users.countDocuments({ accountName: { $in: Object.values(names) } }),
    models.sessions.countDocuments({ userId: { $in: userIds } }),
    models.patients.countDocuments({ subjectCode: { $in: subjects } }),
    models.visits.countDocuments({ visitCode: { $in: visitCodes } }),
    models.instances.countDocuments(owned),
    models.items.countDocuments(owned),
    models.media.countDocuments(owned),
    models.scores.countDocuments(owned),
    models.domains.countDocuments(owned),
    models.reports.countDocuments(owned),
  ]);
  const residualCount = residuals.reduce((sum, value) => sum + value, 0);
  if (residualCount !== 0) {
    fail('B18_CLEANUP_INCOMPLETE', 'Namespace cleanup left records');
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

function modelRegistry(app: INestApplicationContext): Models {
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
      code: known ? error.code : 'B18_FIXTURE_OPERATION_FAILED',
      message: known
        ? error.message
        : 'B18 fixture operation failed without exposing internal details',
    }),
  );
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    const profile = parseProfile();
    const env = environment(profile);
    const parsed = parseCommand(profile, env.cleanupConfirmation);
    const namespace = required(env.namespace);
    if (!/^[a-z0-9][a-z0-9-]{2,19}$/.test(namespace)) {
      fail('B18_NAMESPACE_INVALID', 'Namespace format is invalid');
    }
    const path = required(env.runtimePath);
    const password =
      parsed.command === 'cleanup' ? '' : required(env.fixturePassword, 16);
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
      itemDraft: app.get(ItemResponseDraftService),
      submission: app.get(ScaleInstanceSubmissionService),
      mediaWorkflow: app.get(MediaEvidenceWorkflowService),
    };
    const result =
      parsed.command === 'prepare'
        ? await prepare({
            profile,
            namespace,
            password,
            path,
            models,
            workflows,
            auth: app.get(AuthService),
          })
        : parsed.command === 'verify'
          ? await verify({
              profile,
              phase: parsed.phase!,
              namespace,
              password,
              path,
              models,
              workflows,
              auth: app.get(AuthService),
            })
          : await cleanup(namespace, profile, path, models);
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
