import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { readFile, rm, stat } from 'fs/promises';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import type { AuthenticatedUserContext } from '../../../src/modules/auth/types/auth-user-context.type';
import {
  Session,
  type SessionDocument,
} from '../../../src/modules/auth/schemas/session.schema';
import { AuthService } from '../../../src/modules/auth/services/auth.service';
import { AssessmentVisit } from '../../../src/modules/assessments/schemas/assessment-visit.schema';
import {
  ItemResponse,
  type ItemResponseDocument,
} from '../../../src/modules/assessments/schemas/item-response.schema';
import { ScaleInstance } from '../../../src/modules/assessments/schemas/scale-instance.schema';
import { AssessmentScaleWorkflowService } from '../../../src/modules/assessments/services/assessment-scale-workflow.service';
import { ItemResponseDraftService } from '../../../src/modules/assessments/services/item-response-draft.service';
import { ScaleInstanceSubmissionService } from '../../../src/modules/assessments/services/scale-instance-submission.service';
import {
  CognitiveDomainResult,
  type CognitiveDomainResultDocument,
} from '../../../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
import { MediaEvidence } from '../../../src/modules/media/schemas/media-evidence.schema';
import { MediaEvidenceWorkflowService } from '../../../src/modules/media/services/media-evidence-workflow.service';
import type { UploadedMemoryFile } from '../../../src/modules/media/types/uploaded-memory-file.types';
import { Patient } from '../../../src/modules/patients/schemas/patient.schema';
import {
  ClinicalReport,
  type ClinicalReportDocument,
} from '../../../src/modules/reports/schemas/clinical-report.schema';
import {
  ScaleDefinition,
  type ScaleDefinitionDocument,
} from '../../../src/modules/scales/schemas/scale-definition.schema';
import {
  ScaleVersion,
  type ScaleVersionDocument,
} from '../../../src/modules/scales/schemas/scale-version.schema';
import { ScaleCatalogService } from '../../../src/modules/scales/services/scale-catalog.service';
import {
  ScoreResult,
  type ScoreResultDocument,
} from '../../../src/modules/scoring/schemas/score-result.schema';
import {
  User,
  type UserDocument,
} from '../../../src/modules/users/schemas/user.schema';
import {
  B456_BUSINESS_SCENARIOS,
  B456_ROLES,
  B456FixtureError,
  accountNameFor,
  assertB456Contract,
  assertB456RuntimeEnvironment,
  assertB456SafeManifest,
  displayNameFor,
  executionClassForAuditIds,
  requireB456FixturePassword,
  scenarioSubjectCodeFor,
  scenarioVisitCodeFor,
  validateB456Namespace,
  type B456BusinessScenarioKey,
  type B456FileInputKey,
  type B456Role,
  type B456SafeCleanupSummary,
  type B456SafeManifest,
  type B456SafeRoleManifest,
  type B456SafeScenarioManifest,
  type B456ScenarioDefinition,
} from './fixture-contract';
import {
  B456_IMAGE_FILE_EXPECTATIONS,
  B456_MEDIA_FILE_LIMIT_BYTES,
  B456_OVERSIZED_SOURCE_DIMENSIONS,
  B456_PHOTO_MAX_LONG_EDGE,
  B456ScenarioBuilder,
  b456FilePathsFor,
  b456TempDirectoryFor,
  inspectB456ImageFixture,
  otherOwnerSubjectCodeFor,
  ownedSubjectCodesFor,
  type B456FixtureModels,
  type B456FixtureWorkflows,
  type B456ScenarioRoot,
} from './scenario-builders';

type B456Models = B456FixtureModels & {
  users: Model<UserDocument>;
  sessions: Model<SessionDocument>;
  scoreResults: Model<ScoreResultDocument>;
  cognitiveDomainResults: Model<CognitiveDomainResultDocument>;
  reports: Model<ClinicalReportDocument>;
  scaleDefinitions: Model<ScaleDefinitionDocument>;
  scaleVersions: Model<ScaleVersionDocument>;
};

type TimestampRow = { _id: Types.ObjectId; updatedAt?: Date };
type IdRow = { _id: Types.ObjectId };

const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const VALID_TRAJECTORY = Buffer.from(
  JSON.stringify({
    strokes: [
      [
        { x: 1, y: 2, t: 0 },
        { x: 3, y: 4, t: 16 },
      ],
    ],
  }),
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function scenarioFailure(
  scenarioKey: B456BusinessScenarioKey,
  safeMessage: string,
): B456FixtureError {
  return new B456FixtureError(
    'B456_FIXTURE_SCENARIO_INVALID',
    safeMessage,
    scenarioKey,
  );
}

function memoryFile(
  fieldname: 'file' | 'trajectory',
  buffer: Buffer,
  mimetype: string,
): UploadedMemoryFile {
  return {
    fieldname,
    originalname: `synthetic-${fieldname}`,
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export class B456BrowserFixtureManager {
  constructor(
    private readonly databaseName: string,
    private readonly models: B456Models,
    private readonly authService: AuthService,
    private readonly workflows: B456FixtureWorkflows,
  ) {}

  async prepare(
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B456SafeManifest> {
    const namespace = validateB456Namespace(rawNamespace);
    const password = requireB456FixturePassword(rawPassword);
    assertB456Contract();
    await this.assertNamespaceUnused(namespace);
    try {
      const users = await this.createUsers(namespace, password);
      const doctor = users.get('doctor');
      if (!doctor) {
        throw new B456FixtureError(
          'B456_FIXTURE_ACCOUNT_CREATION_FAILED',
          'The doctor fixture account was not created',
        );
      }
      await new B456ScenarioBuilder(
        namespace,
        this.models,
        this.workflows,
      ).buildAll(toActor(doctor));
      return this.verifyInternal(namespace, password, 'prepared');
    } catch (error: unknown) {
      try {
        await this.cleanup(namespace);
      } catch {
        // The original safe error remains authoritative; cleanup is retryable.
      }
      throw error;
    }
  }

  async verify(
    rawNamespace: string,
    rawPassword: string | undefined,
    phase: 'prepared' | 'post-browser',
  ): Promise<B456SafeManifest> {
    return this.verifyInternal(
      validateB456Namespace(rawNamespace),
      requireB456FixturePassword(rawPassword),
      phase,
    );
  }

  async replace(
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B456SafeManifest> {
    const namespace = validateB456Namespace(rawNamespace);
    const password = requireB456FixturePassword(rawPassword);
    await this.cleanup(namespace);
    return this.prepare(namespace, password);
  }

  async cleanup(rawNamespace: string): Promise<B456SafeCleanupSummary> {
    const namespace = validateB456Namespace(rawNamespace);
    await this.restoreAllTransitions(namespace);
    const accountNames = B456_ROLES.map((role) =>
      accountNameFor(namespace, role),
    );
    const subjectCodes = ownedSubjectCodesFor(namespace);
    await this.assertNoUnexpectedRoots(namespace, accountNames, subjectCodes);
    const [users, patients] = await Promise.all([
      this.models.users
        .find({ accountName: { $in: accountNames } })
        .select({ _id: 1 })
        .lean<IdRow[]>()
        .exec(),
      this.models.patients
        .find({ subjectCode: { $in: subjectCodes } })
        .select({ _id: 1 })
        .lean<IdRow[]>()
        .exec(),
    ]);
    const userIds = users.map(({ _id }) => _id);
    const patientIds = patients.map(({ _id }) => _id);
    const visits = patientIds.length
      ? await this.models.visits
          .find({ patientId: { $in: patientIds } })
          .select({ _id: 1 })
          .lean<IdRow[]>()
          .exec()
      : [];
    const visitIds = visits.map(({ _id }) => _id);
    if (userIds.length) {
      await this.models.sessions
        .deleteMany({ userId: { $in: userIds } })
        .exec();
    }
    if (patientIds.length || visitIds.length) {
      const ownership = this.ownershipFilter(patientIds, visitIds);
      await this.models.reports.deleteMany(ownership).exec();
      await this.models.cognitiveDomainResults.deleteMany(ownership).exec();
      await this.models.scoreResults.deleteMany(ownership).exec();
      await this.models.mediaEvidence.deleteMany(ownership).exec();
      await this.models.itemResponses.deleteMany(ownership).exec();
      await this.models.scaleInstances.deleteMany(ownership).exec();
    }
    if (visitIds.length) {
      await this.models.visits.deleteMany({ _id: { $in: visitIds } }).exec();
    }
    if (patientIds.length) {
      await this.models.patients
        .deleteMany({ _id: { $in: patientIds } })
        .exec();
    }
    if (userIds.length) {
      await this.models.users.deleteMany({ _id: { $in: userIds } }).exec();
    }
    await rm(b456TempDirectoryFor(namespace), { recursive: true, force: true });
    const residualCount = await this.countResiduals(
      namespace,
      accountNames,
      subjectCodes,
      userIds,
      patientIds,
      visitIds,
    );
    if (residualCount !== 0) {
      throw new B456FixtureError(
        'B456_FIXTURE_CLEANUP_INCOMPLETE',
        'Fixture cleanup left namespace-owned records or temporary files behind',
      );
    }
    const result: B456SafeCleanupSummary = {
      namespace,
      databaseName: this.databaseName,
      expectedSummary: `residualCount=0; matched=${
        users.length + patients.length + visits.length > 0
      }`,
    };
    assertB456SafeManifest(result);
    return result;
  }

  async simulateBrowserResultsForE2e(rawNamespace: string): Promise<void> {
    const namespace = validateB456Namespace(rawNamespace);
    const doctor = await this.models.users
      .findOne({ accountName: accountNameFor(namespace, 'doctor') })
      .exec();
    if (!doctor) {
      throw new B456FixtureError(
        'B456_FIXTURE_NAMESPACE_MISSING',
        'Browser result simulation requires a prepared namespace',
      );
    }
    const actor = toActor(doctor);
    await this.simulateB4Results(namespace);
    await this.simulateB5Results(namespace, actor);
    await this.simulateB6Results(namespace, actor);
  }

  private async verifyInternal(
    namespace: string,
    password: string,
    phase: 'prepared' | 'post-browser',
  ): Promise<B456SafeManifest> {
    assertB456Contract();
    const before = await this.readOnlySnapshot(namespace);
    const roles = await this.verifyUsers(namespace, password);
    await this.verifyTemporaryFiles(namespace);
    await this.verifyFixtureData(namespace, phase);
    await this.assertNoTransitionResidue(namespace);
    const scenarios: B456SafeScenarioManifest[] = [
      {
        scenarioKey: 'roles',
        auditIds: [],
        executionClass: 'fixture-required',
        route: '/login',
        expectedPage: 'login',
        expectedStatus: 200,
        expectedBusinessCode: null,
        testInput: null,
        fileInputs: null,
        faultMode: 'none',
        transitionMode: 'none',
        expectedSummary:
          'Five synthetic accounts cover four permitted clinical roles and one forbidden system role',
      },
    ];
    for (const definition of B456_BUSINESS_SCENARIOS) {
      scenarios.push(await this.buildSafeScenario(namespace, definition));
    }
    const after = await this.readOnlySnapshot(namespace);
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      throw new B456FixtureError(
        'B456_FIXTURE_VERIFY_MUTATED_DATA',
        'Verify must not create sessions, change identifiers or timestamps, or repair fixture data',
      );
    }
    const manifest: B456SafeManifest = {
      namespace,
      databaseName: this.databaseName,
      roles,
      scenarios,
      expectedSummary:
        `phase=${phase}; roles=5; scenarioKeys=32; businessScenarios=31; ` +
        'auditIds=135; browserDirect=15; fixtureRequired=120',
    };
    assertB456SafeManifest(manifest);
    return manifest;
  }

  private async createUsers(
    namespace: string,
    password: string,
  ): Promise<Map<B456Role, UserDocument>> {
    const result = new Map<B456Role, UserDocument>();
    for (const role of B456_ROLES) {
      const user = await this.models.users.create({
        accountName: accountNameFor(namespace, role),
        displayName: displayNameFor(role),
        staffCode: `B456FX-${namespace}-${role}`,
        passwordHash: await this.authService.hashPassword(password),
        passwordChangedAt: new Date(),
        roles: [role],
        permissions: [],
        userType: role,
        status: 'active',
        failedLoginCount: 0,
        lockedUntil: null,
        metadata: null,
      });
      result.set(role, user);
    }
    return result;
  }

  private async verifyUsers(
    namespace: string,
    password: string,
  ): Promise<B456SafeRoleManifest[]> {
    const roles: B456SafeRoleManifest[] = [];
    for (const role of B456_ROLES) {
      const user = await this.models.users
        .findOne({ accountName: accountNameFor(namespace, role) })
        .select('+passwordHash')
        .exec();
      if (
        !user ||
        user.status !== 'active' ||
        user.userType !== role ||
        user.roles.length !== 1 ||
        user.roles[0] !== role ||
        !(await this.authService.verifyPassword(password, user.passwordHash))
      ) {
        throw new B456FixtureError(
          'B456_FIXTURE_ACCOUNT_INVALID',
          `Fixture account for role ${role} is missing or invalid`,
        );
      }
      roles.push({
        role,
        loginIdentifier: user.accountName,
        displayName: user.displayName,
      });
    }
    return roles;
  }

  private async verifyTemporaryFiles(namespace: string): Promise<void> {
    const paths = b456FilePathsFor(namespace);
    const entries = await Promise.all(
      Object.entries(paths).map(
        async ([key, path]) => [key, await stat(path)] as const,
      ),
    );
    const sizes = Object.fromEntries(
      entries.map(([key, value]) => [key, value.size]),
    );
    const [
      jpeg,
      png,
      webp,
      oversized,
      wrongMime,
      invalidImage,
      trajectory,
      oversizedTrajectory,
    ] = await Promise.all([
      readFile(paths.jpeg),
      readFile(paths.png),
      readFile(paths.webp),
      readFile(paths.oversized),
      readFile(paths.wrongMime),
      readFile(paths.invalidImage),
      readFile(paths.trajectoryValid),
      readFile(paths.trajectoryOversized),
    ]);
    let trajectoryValue: unknown;
    let oversizedTrajectoryValue: unknown;
    try {
      trajectoryValue = JSON.parse(trajectory.toString('utf8')) as unknown;
      oversizedTrajectoryValue = JSON.parse(
        oversizedTrajectory.toString('utf8'),
      ) as unknown;
    } catch {
      throw new B456FixtureError(
        'B456_FIXTURE_FILE_INVALID',
        'Temporary trajectory fixture is not valid JSON',
      );
    }
    const decoded = {
      jpeg: inspectB456ImageFixture(jpeg),
      png: inspectB456ImageFixture(png),
      webp: inspectB456ImageFixture(webp),
      oversized: inspectB456ImageFixture(oversized),
      wrongMime: inspectB456ImageFixture(wrongMime),
      invalidImage: inspectB456ImageFixture(invalidImage),
    };
    const wrongMimeExpectation = B456_IMAGE_FILE_EXPECTATIONS.wrongMime;
    const wrongMimeActuallyMismatched =
      wrongMimeExpectation.declaredMime !==
      `image/${wrongMimeExpectation.encoding}`;
    if (
      entries.length !== 9 ||
      decoded.jpeg?.encoding !== B456_IMAGE_FILE_EXPECTATIONS.jpeg.encoding ||
      decoded.png?.encoding !== B456_IMAGE_FILE_EXPECTATIONS.png.encoding ||
      decoded.webp?.encoding !== B456_IMAGE_FILE_EXPECTATIONS.webp.encoding ||
      decoded.wrongMime?.encoding !== wrongMimeExpectation.encoding ||
      !wrongMimeActuallyMismatched ||
      decoded.invalidImage !== null ||
      decoded.oversized?.encoding !==
        B456_IMAGE_FILE_EXPECTATIONS.oversized.encoding ||
      decoded.oversized.width !== B456_OVERSIZED_SOURCE_DIMENSIONS.width ||
      decoded.oversized.height !== B456_OVERSIZED_SOURCE_DIMENSIONS.height ||
      Math.max(decoded.oversized.width, decoded.oversized.height) <=
        B456_PHOTO_MAX_LONG_EDGE ||
      sizes.oversized <= B456_MEDIA_FILE_LIMIT_BYTES ||
      sizes.trajectoryOversized <= 2 * 1024 * 1024 ||
      typeof trajectoryValue !== 'object' ||
      trajectoryValue === null ||
      typeof oversizedTrajectoryValue !== 'object' ||
      oversizedTrajectoryValue === null
    ) {
      throw new B456FixtureError(
        'B456_FIXTURE_FILE_INVALID',
        'Temporary Browser upload files do not match the fixed file contract',
      );
    }
  }

  private async verifyFixtureData(
    namespace: string,
    phase: 'prepared' | 'post-browser',
  ): Promise<void> {
    const patients = await this.models.patients
      .find({ subjectCode: { $in: ownedSubjectCodesFor(namespace) } })
      .exec();
    if (patients.length !== 32) {
      throw new B456FixtureError(
        'B456_FIXTURE_ROOT_MATRIX_INVALID',
        'The 31 business roots and one ownership root are incomplete',
      );
    }
    for (const definition of B456_BUSINESS_SCENARIOS) {
      const root = await this.requireRoot(namespace, definition.scenarioKey);
      const itemCount = await this.models.itemResponses.countDocuments({
        scaleInstanceId: root.scaleInstanceId,
      });
      const expectedItemCount = definition.scaleCode === 'mmse' ? 11 : 16;
      if (itemCount !== expectedItemCount) {
        throw scenarioFailure(
          definition.scenarioKey,
          'The real seeded item skeleton count is invalid',
        );
      }
    }
    await this.verifyB4Data(namespace, phase);
    await this.verifyB5Data(namespace, phase);
    await this.verifyB6Data(namespace, phase);
  }

  private async verifyB4Data(
    namespace: string,
    phase: 'prepared' | 'post-browser',
  ): Promise<void> {
    const load = await this.requireRoot(namespace, 'scale_execution_load');
    const loadCodes = await this.models.scaleInstances
      .find({ assessmentVisitId: load.visitId })
      .distinct('scaleCode');
    if (!loadCodes.includes('mmse') || !loadCodes.includes('moca')) {
      throw scenarioFailure(
        'scale_execution_load',
        'Editable MMSE and MoCA instances are required',
      );
    }
    const input = await this.requireRoot(
      namespace,
      'scale_execution_input_types',
    );
    const responseTypes = await this.models.itemResponses
      .find({ scaleInstanceId: input.scaleInstanceId })
      .distinct('responseType');
    for (const required of [
      'boolean',
      'number',
      'text',
      'single_choice',
      'multi_choice',
    ] as const) {
      if (!responseTypes.includes(required)) {
        throw scenarioFailure(
          'scale_execution_input_types',
          'The fixed input-type matrix is incomplete',
        );
      }
    }
    const serial = await this.requireRoot(namespace, 'scale_execution_serial7');
    const serialItem = await this.requireItem(
      serial,
      'mmse.attention.serial_sevens',
    );
    const delayed = await this.requireRoot(
      namespace,
      'scale_execution_delayed_recall',
    );
    const delayedItem = await this.requireItem(
      delayed,
      'moca.memory.delayed_recall',
    );
    const timing = await this.requireRoot(namespace, 'scale_execution_timing');
    const timedItem = await this.models.itemResponses
      .findOne({
        scaleInstanceId: timing.scaleInstanceId,
        'itemConfigSnapshot.requiresTimer': true,
      })
      .exec();
    if (
      serialItem.stepResults.length === 0 ||
      delayedItem.promptResponses.length === 0 ||
      !timedItem
    ) {
      throw new B456FixtureError(
        'B456_FIXTURE_B4_MATRIX_INVALID',
        'Serial-seven, delayed-recall, or timing targets are missing',
      );
    }
    const error = await this.requireRoot(
      namespace,
      'scale_execution_error_matrix',
    );
    const errorStatuses = await this.models.itemResponses
      .find({ scaleInstanceId: error.scaleInstanceId })
      .distinct('status');
    const visitStatuses = await this.models.visits
      .find({ patientId: error.patientId })
      .distinct('status');
    const instanceStatuses = await this.models.scaleInstances
      .find({ patientId: error.patientId })
      .distinct('status');
    if (
      !errorStatuses.includes('scored') ||
      !errorStatuses.includes('locked') ||
      !errorStatuses.includes('voided') ||
      !visitStatuses.includes('completed') ||
      !visitStatuses.includes('locked') ||
      !visitStatuses.includes('voided') ||
      !instanceStatuses.includes('locked') ||
      !instanceStatuses.includes('voided')
    ) {
      throw scenarioFailure(
        'scale_execution_error_matrix',
        'The read-only state matrix is incomplete',
      );
    }
    const staleCount = await this.models.itemResponses.countDocuments({
      scaleInstanceId: error.scaleInstanceId,
      updatedAt: { $lte: new Date('2020-01-01T00:00:00.000Z') },
    });
    if (staleCount !== 1) {
      throw scenarioFailure(
        'scale_execution_error_matrix',
        'The stale timestamp target is missing',
      );
    }
    if (phase === 'prepared') {
      for (const key of [
        'scale_execution_serial7',
        'scale_execution_delayed_recall',
        'scale_execution_missing_reason',
        'scale_execution_timing',
        'scale_execution_save_progress',
      ] as const) {
        const root = await this.requireRoot(namespace, key);
        const changed = await this.models.itemResponses.countDocuments({
          scaleInstanceId: root.scaleInstanceId,
          status: { $ne: 'not_started' },
        });
        if (changed !== 0)
          throw scenarioFailure(
            key,
            'Prepared Browser write target is not clean',
          );
      }
      return;
    }
    if (
      !serialItem.stepResults.some(
        (step) => step.actualValue !== null && step.actualValue !== undefined,
      ) ||
      !delayedItem.promptResponses.some(
        (prompt) =>
          prompt.responseAfterPrompt !== null &&
          prompt.responseAfterPrompt !== undefined,
      )
    ) {
      throw new B456FixtureError(
        'B456_FIXTURE_POST_BROWSER_B4_INVALID',
        'Serial-seven or delayed-recall Browser draft persistence is missing',
      );
    }
    const missing = await this.requireRoot(
      namespace,
      'scale_execution_missing_reason',
    );
    const timedReloaded = await this.models.itemResponses
      .findById(timedItem._id)
      .exec();
    const missingCount = await this.models.itemResponses.countDocuments({
      scaleInstanceId: missing.scaleInstanceId,
      isMissing: true,
      missingReason: { $type: 'string', $ne: '' },
    });
    const progress = await this.requireRoot(
      namespace,
      'scale_execution_save_progress',
    );
    const progressCount = await this.models.itemResponses.countDocuments({
      scaleInstanceId: progress.scaleInstanceId,
      status: { $in: ['in_progress', 'answered'] },
    });
    if (
      missingCount < 1 ||
      !timedReloaded?.timing?.durationMs ||
      progressCount < 1
    ) {
      throw new B456FixtureError(
        'B456_FIXTURE_POST_BROWSER_B4_INVALID',
        'Missing reason, timing, or progress persistence is incomplete',
      );
    }
  }

  private async verifyB5Data(
    namespace: string,
    phase: 'prepared' | 'post-browser',
  ): Promise<void> {
    const requirement = await this.requireRoot(
      namespace,
      'media_requirement_matrix',
    );
    const statuses = await this.models.mediaEvidence
      .find({ patientId: requirement.patientId })
      .distinct('status');
    for (const required of [
      'pending',
      'attached',
      'locked',
      'voided',
    ] as const) {
      if (!statuses.includes(required)) {
        throw scenarioFailure(
          'media_requirement_matrix',
          'The media lifecycle matrix is incomplete',
        );
      }
    }
    const preview = await this.requireRoot(namespace, 'media_preview_url');
    if (
      (await this.models.mediaEvidence.countDocuments({
        scaleInstanceId: preview.scaleInstanceId,
        status: 'attached',
        storageStatus: 'stored',
      })) !== 1
    ) {
      throw scenarioFailure(
        'media_preview_url',
        'The preview evidence target is invalid',
      );
    }
    const readOnly = await this.requireRoot(
      namespace,
      'media_read_only_matrix',
    );
    if (
      (await this.models.itemResponses.countDocuments({
        scaleInstanceId: readOnly.scaleInstanceId,
        status: 'scored',
      })) !== 1
    ) {
      throw scenarioFailure(
        'media_read_only_matrix',
        'The read-only ItemResponse target is invalid',
      );
    }
    const inactive = await this.requireRoot(namespace, 'media_error_matrix');
    if (
      (await this.models.patients.findById(inactive.patientId).exec())
        ?.status !== 'inactive'
    ) {
      throw scenarioFailure(
        'media_error_matrix',
        'The inactive Patient target is missing',
      );
    }
    const reservedKeys = [
      'media_upload_photo_scan',
      'handwriting_mouse_canvas',
      'handwriting_trajectory',
      'submission_dirty_upload_stale',
      'media_concurrency_boundary',
    ] as const;
    if (phase === 'prepared') {
      for (const key of reservedKeys) {
        const root = await this.requireRoot(namespace, key);
        if (
          (await this.models.mediaEvidence.countDocuments({
            scaleInstanceId: root.scaleInstanceId,
          })) !== 0
        ) {
          throw scenarioFailure(
            key,
            'Prepared media write target is not clean',
          );
        }
      }
      return;
    }
    const upload = await this.requireRoot(namespace, 'media_upload_photo_scan');
    const captureModes = await this.models.mediaEvidence
      .find({ scaleInstanceId: upload.scaleInstanceId, status: 'attached' })
      .distinct('captureMode');
    const voidRoot = await this.requireRoot(namespace, 'media_void_reupload');
    const voidStatuses = await this.models.mediaEvidence
      .find({ scaleInstanceId: voidRoot.scaleInstanceId })
      .distinct('status');
    const handwriting = await this.requireRoot(
      namespace,
      'handwriting_mouse_canvas',
    );
    const trajectory = await this.requireRoot(
      namespace,
      'handwriting_trajectory',
    );
    const handwritingCount = await this.models.mediaEvidence.countDocuments({
      scaleInstanceId: handwriting.scaleInstanceId,
      evidenceType: 'handwriting',
      status: 'attached',
      'handwritingTrace.inputTool': 'mouse',
    });
    const trajectoryCount = await this.models.mediaEvidence.countDocuments({
      scaleInstanceId: trajectory.scaleInstanceId,
      evidenceType: 'handwriting',
      status: 'attached',
      'handwritingTrace.hasTrajectory': true,
    });
    if (
      !captureModes.includes('photo_upload') ||
      !captureModes.includes('paper_scan') ||
      !voidStatuses.includes('voided') ||
      !voidStatuses.includes('attached') ||
      handwritingCount !== 1 ||
      trajectoryCount !== 1
    ) {
      throw new B456FixtureError(
        'B456_FIXTURE_POST_BROWSER_B5_INVALID',
        'Media upload, void/re-upload, handwriting, or trajectory persistence is incomplete',
      );
    }
  }

  private async verifyB6Data(
    namespace: string,
    phase: 'prepared' | 'post-browser',
  ): Promise<void> {
    const readiness = await this.requireRoot(
      namespace,
      'submission_readiness_matrix',
    );
    const blocking = await this.workflows.submission.getSubmissionReadiness(
      readiness.patientId.toString(),
      readiness.visitId.toString(),
      readiness.scaleInstanceId.toString(),
    );
    const readyVisit = await this.models.visits
      .findOne({
        visitCode: scenarioVisitCodeFor(namespace, readiness.ordinal, 'READY'),
      })
      .exec();
    const readyInstance = readyVisit
      ? await this.models.scaleInstances
          .findOne({ assessmentVisitId: readyVisit._id })
          .exec()
      : null;
    if (!readyVisit || !readyInstance) {
      throw scenarioFailure(
        'submission_readiness_matrix',
        'The ready companion is missing',
      );
    }
    const ready = await this.workflows.submission.getSubmissionReadiness(
      readiness.patientId.toString(),
      readyVisit._id.toString(),
      readyInstance._id.toString(),
    );
    if (
      blocking.ready ||
      blocking.blockingIssues.length === 0 ||
      !ready.ready ||
      !ready.canSubmitNow
    ) {
      throw scenarioFailure(
        'submission_readiness_matrix',
        'The real readiness matrix is invalid',
      );
    }
    const completedPrepared = await this.requireRoot(
      namespace,
      'submission_post_submit_read_only',
    );
    if (
      (
        await this.models.scaleInstances
          .findById(completedPrepared.scaleInstanceId)
          .exec()
      )?.status !== 'completed'
    ) {
      throw scenarioFailure(
        'submission_post_submit_read_only',
        'The completed read-only target is missing',
      );
    }
    const submitKeys = [
      'submission_ready_confirm',
      'submission_idempotency_concurrency',
      'submission_network_final_state',
    ] as const;
    for (const key of submitKeys) {
      const root = await this.requireRoot(namespace, key);
      const instance = await this.models.scaleInstances
        .findById(root.scaleInstanceId)
        .exec();
      if (phase === 'prepared') {
        const state = await this.workflows.submission.getSubmissionReadiness(
          root.patientId.toString(),
          root.visitId.toString(),
          root.scaleInstanceId.toString(),
        );
        if (
          instance?.status !== 'draft' ||
          !state.ready ||
          !state.canSubmitNow
        ) {
          throw scenarioFailure(
            key,
            'Prepared final-submission target is not ready and clean',
          );
        }
      } else if (instance?.status !== 'completed') {
        throw scenarioFailure(key, 'Browser final submission did not persist');
      }
    }
    if (phase === 'post-browser') {
      for (const key of [
        ...submitKeys,
        'submission_post_submit_read_only',
      ] as const) {
        const root = await this.requireRoot(namespace, key);
        const instance = await this.models.scaleInstances
          .findById(root.scaleInstanceId)
          .exec();
        const submission = instance?.metadata?.submission;
        if (typeof submission !== 'object' || submission === null) {
          throw scenarioFailure(
            key,
            'Exactly one stored submission audit is required',
          );
        }
        const downstream = await Promise.all([
          this.models.scoreResults.countDocuments({
            scaleInstanceId: root.scaleInstanceId,
          }),
          this.models.cognitiveDomainResults.countDocuments({
            scaleInstanceId: root.scaleInstanceId,
          }),
          this.models.reports.countDocuments({
            scaleInstanceId: root.scaleInstanceId,
          }),
        ]);
        if (downstream.some((count) => count !== 0)) {
          throw scenarioFailure(
            key,
            'Final submission created forbidden downstream side effects',
          );
        }
      }
    }
    const authz = await this.requireRoot(
      namespace,
      'submission_authz_error_matrix',
    );
    const authzInstance = await this.models.scaleInstances
      .findById(authz.scaleInstanceId)
      .exec();
    if (
      (await this.models.patients.findById(authz.patientId).exec())?.status !==
        'inactive' ||
      authzInstance?.status !== 'draft'
    ) {
      throw scenarioFailure(
        'submission_authz_error_matrix',
        'Submission error targets were mutated',
      );
    }
  }

  private async buildSafeScenario(
    namespace: string,
    definition: B456ScenarioDefinition,
  ): Promise<B456SafeScenarioManifest> {
    const paths = b456FilePathsFor(namespace);
    const fileInputs = definition.fileInputKeys.length
      ? (Object.fromEntries(
          definition.fileInputKeys.map((key) => [key, paths[key]]),
        ) as Partial<Record<B456FileInputKey, string>>)
      : null;
    return {
      scenarioKey: definition.scenarioKey,
      auditIds: definition.auditIds,
      executionClass: executionClassForAuditIds(definition.auditIds),
      route: await this.resolveRoute(namespace, definition),
      expectedPage: definition.expectedPage,
      expectedStatus: definition.expectedStatus,
      expectedBusinessCode: definition.expectedBusinessCode,
      testInput: this.testInputFor(definition.scenarioKey),
      fileInputs,
      faultMode: definition.faultMode,
      transitionMode: definition.transitionMode,
      expectedSummary: definition.expectedSummary,
    };
  }

  private async resolveRoute(
    namespace: string,
    definition: B456ScenarioDefinition,
  ): Promise<string> {
    const root = await this.requireRoot(namespace, definition.scenarioKey);
    if (definition.scenarioKey === 'scale_execution_error_matrix') {
      const otherPatient = await this.models.patients
        .findOne({ subjectCode: otherOwnerSubjectCodeFor(namespace) })
        .exec();
      const otherVisit = await this.models.visits
        .findOne({
          visitCode: scenarioVisitCodeFor(
            namespace,
            definition.ordinal,
            'OTHER',
          ),
        })
        .exec();
      const otherInstance = otherVisit
        ? await this.models.scaleInstances
            .findOne({ assessmentVisitId: otherVisit._id })
            .exec()
        : null;
      if (!otherPatient || !otherVisit || !otherInstance) {
        throw scenarioFailure(
          definition.scenarioKey,
          'Ownership route target is missing',
        );
      }
      return `/patients/${root.patientId.toString()}/visits/${root.visitId.toString()}/scale-instances/${otherInstance._id.toString()}`;
    }
    return `/patients/${root.patientId.toString()}/visits/${root.visitId.toString()}/scale-instances/${root.scaleInstanceId.toString()}`;
  }

  private testInputFor(
    key: B456BusinessScenarioKey,
  ): Readonly<
    Record<string, string | number | boolean | readonly string[]>
  > | null {
    switch (key) {
      case 'scale_execution_input_types':
        return {
          editorTypes: [
            'boolean',
            'number',
            'text',
            'single_choice',
            'multi_choice',
          ],
        };
      case 'scale_execution_serial7':
        return {
          operation: 'update-existing-step-slot',
          scoringInspection: false,
        };
      case 'scale_execution_delayed_recall':
        return {
          operation: 'update-existing-prompt-slot',
          scoringInspection: false,
        };
      case 'scale_execution_save_progress':
        return { operation: 'save-refresh-progress', minimumPersistedItems: 1 };
      case 'media_upload_photo_scan':
        return {
          captureModes: ['photo_upload', 'paper_scan'],
          minimumUploads: 2,
        };
      case 'media_void_reupload':
        return { operation: 'void-then-upload', minimumReasonLength: 3 };
      case 'handwriting_mouse_canvas':
        return { inputTool: 'mouse', canvasWidth: 1200, canvasHeight: 800 };
      case 'handwriting_trajectory':
        return { trajectoryFormat: 'strokes', maximumPoints: 8000 };
      case 'submission_ready_confirm':
      case 'submission_idempotency_concurrency':
      case 'submission_network_final_state':
        return { confirm: true, automaticRetry: false };
      default:
        return null;
    }
  }

  private async simulateB4Results(namespace: string): Promise<void> {
    const serial = await this.requireRoot(namespace, 'scale_execution_serial7');
    const serialItem = await this.requireItem(
      serial,
      'mmse.attention.serial_sevens',
    );
    const step = serialItem.stepResults[0];
    if (!step)
      throw scenarioFailure(serial.scenarioKey, 'Serial step is missing');
    await this.workflows.itemDraft.saveDraft(
      serial.patientId.toString(),
      serial.visitId.toString(),
      serial.scaleInstanceId.toString(),
      serialItem._id.toString(),
      { stepResponses: [{ stepCode: step.stepCode, actualValue: 0 }] },
    );
    const delayed = await this.requireRoot(
      namespace,
      'scale_execution_delayed_recall',
    );
    const delayedItem = await this.requireItem(
      delayed,
      'moca.memory.delayed_recall',
    );
    const prompt = delayedItem.promptResponses[0];
    if (!prompt)
      throw scenarioFailure(delayed.scenarioKey, 'Prompt slot is missing');
    await this.workflows.itemDraft.saveDraft(
      delayed.patientId.toString(),
      delayed.visitId.toString(),
      delayed.scaleInstanceId.toString(),
      delayedItem._id.toString(),
      {
        promptResponses: [
          {
            promptType: prompt.promptType,
            order: prompt.order,
            responseAfterPrompt: false,
          },
        ],
      },
    );
    const missing = await this.requireRoot(
      namespace,
      'scale_execution_missing_reason',
    );
    const missingItem = await this.firstItem(missing);
    await this.workflows.itemDraft.saveDraft(
      missing.patientId.toString(),
      missing.visitId.toString(),
      missing.scaleInstanceId.toString(),
      missingItem._id.toString(),
      {
        isMissing: true,
        missingReason: 'Synthetic missing reason',
        markAsAnswered: true,
      },
    );
    const timing = await this.requireRoot(namespace, 'scale_execution_timing');
    const timingItem = await this.models.itemResponses
      .findOne({
        scaleInstanceId: timing.scaleInstanceId,
        'itemConfigSnapshot.requiresTimer': true,
      })
      .exec();
    if (!timingItem)
      throw scenarioFailure(timing.scenarioKey, 'Timed item is missing');
    await this.workflows.itemDraft.saveDraft(
      timing.patientId.toString(),
      timing.visitId.toString(),
      timing.scaleInstanceId.toString(),
      timingItem._id.toString(),
      {
        rawResponse: false,
        timing: {
          startedAt: '2026-07-20T08:00:00.000Z',
          completedAt: '2026-07-20T08:00:01.000Z',
          durationMs: 1000,
          timerSource: 'manual',
        },
        markAsAnswered: true,
      },
    );
    const progress = await this.requireRoot(
      namespace,
      'scale_execution_save_progress',
    );
    const progressItem = await this.firstItem(progress);
    await this.workflows.itemDraft.saveDraft(
      progress.patientId.toString(),
      progress.visitId.toString(),
      progress.scaleInstanceId.toString(),
      progressItem._id.toString(),
      {
        rawResponse: false,
        operatorNote: 'Synthetic saved draft',
        markAsAnswered: true,
      },
    );
  }

  private async simulateB5Results(
    namespace: string,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    const upload = await this.requireRoot(namespace, 'media_upload_photo_scan');
    const uploadItems = await this.eligibleItems(upload, 'photo');
    if (uploadItems.length < 2)
      throw scenarioFailure(upload.scenarioKey, 'Upload targets are missing');
    await this.uploadEvidence(
      upload,
      uploadItems[0],
      actor,
      'photo',
      'photo_upload',
    );
    await this.uploadEvidence(
      upload,
      uploadItems[1],
      actor,
      'photo',
      'paper_scan',
    );

    const voidRoot = await this.requireRoot(namespace, 'media_void_reupload');
    const attached = await this.models.mediaEvidence
      .findOne({
        scaleInstanceId: voidRoot.scaleInstanceId,
        status: 'attached',
      })
      .exec();
    if (!attached)
      throw scenarioFailure(voidRoot.scenarioKey, 'Void target is missing');
    await this.workflows.mediaWorkflow.voidEvidence(
      {
        ...this.mediaParams(voidRoot, attached.itemResponseId),
        mediaEvidenceId: attached._id.toString(),
      },
      { reason: 'Synthetic Browser replacement' },
      actor,
    );
    const voidItem = await this.models.itemResponses
      .findById(attached.itemResponseId)
      .exec();
    if (!voidItem)
      throw scenarioFailure(
        voidRoot.scenarioKey,
        'Replacement item is missing',
      );
    await this.uploadEvidence(
      voidRoot,
      voidItem,
      actor,
      'photo',
      'photo_upload',
    );

    const handwriting = await this.requireRoot(
      namespace,
      'handwriting_mouse_canvas',
    );
    await this.uploadEvidence(
      handwriting,
      (await this.eligibleItems(handwriting, 'handwriting'))[0],
      actor,
      'handwriting',
      'tablet_handwriting',
      true,
    );
    const trajectory = await this.requireRoot(
      namespace,
      'handwriting_trajectory',
    );
    await this.uploadEvidence(
      trajectory,
      (await this.eligibleItems(trajectory, 'handwriting'))[0],
      actor,
      'handwriting',
      'tablet_handwriting',
      true,
    );
    const dirty = await this.requireRoot(
      namespace,
      'submission_dirty_upload_stale',
    );
    const dirtyItem = await this.firstItem(dirty);
    await this.workflows.itemDraft.saveDraft(
      dirty.patientId.toString(),
      dirty.visitId.toString(),
      dirty.scaleInstanceId.toString(),
      dirtyItem._id.toString(),
      { rawResponse: false, operatorNote: 'Synthetic dirty write' },
    );
    const dirtyMediaItem = (await this.eligibleItems(dirty, 'photo'))[0];
    await this.uploadEvidence(
      dirty,
      dirtyMediaItem,
      actor,
      'photo',
      'photo_upload',
    );
    const concurrency = await this.requireRoot(
      namespace,
      'media_concurrency_boundary',
    );
    await this.uploadEvidence(
      concurrency,
      (await this.eligibleItems(concurrency, 'photo'))[0],
      actor,
      'photo',
      'photo_upload',
    );
  }

  private async simulateB6Results(
    namespace: string,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    for (const key of [
      'submission_ready_confirm',
      'submission_idempotency_concurrency',
      'submission_network_final_state',
    ] as const) {
      const root = await this.requireRoot(namespace, key);
      await this.workflows.submission.submitScaleInstance(
        root.patientId.toString(),
        root.visitId.toString(),
        root.scaleInstanceId.toString(),
        actor,
        { confirm: true },
      );
      if (key === 'submission_idempotency_concurrency') {
        await this.workflows.submission.submitScaleInstance(
          root.patientId.toString(),
          root.visitId.toString(),
          root.scaleInstanceId.toString(),
          actor,
          { confirm: true },
        );
      }
    }
  }

  private async uploadEvidence(
    root: B456ScenarioRoot,
    item: ItemResponseDocument | undefined,
    actor: AuthenticatedUserContext,
    type: 'photo' | 'handwriting',
    captureMode: 'photo_upload' | 'paper_scan' | 'tablet_handwriting',
    trajectory = false,
  ): Promise<string> {
    if (!item)
      throw scenarioFailure(root.scenarioKey, 'Media upload item is missing');
    const response = await this.workflows.mediaWorkflow.uploadEvidence(
      this.mediaParams(root, item._id),
      type === 'photo'
        ? {
            evidenceType: 'photo',
            captureMode,
            imageWidth: 1,
            imageHeight: 1,
            ...(captureMode === 'paper_scan' ? { pageNo: 1 } : {}),
          }
        : {
            evidenceType: 'handwriting',
            captureMode: 'tablet_handwriting',
            trajectoryFormat: trajectory ? 'strokes' : undefined,
            strokeCount: trajectory ? 1 : undefined,
            canvasWidth: 1200,
            canvasHeight: 800,
            inputTool: 'mouse',
          },
      {
        file: [memoryFile('file', VALID_PNG, 'image/png')],
        ...(trajectory
          ? {
              trajectory: [
                memoryFile('trajectory', VALID_TRAJECTORY, 'application/json'),
              ],
            }
          : {}),
      },
      actor,
    );
    return response.mediaEvidence.id;
  }

  private mediaParams(root: B456ScenarioRoot, itemResponseId: Types.ObjectId) {
    return {
      patientId: root.patientId.toString(),
      visitId: root.visitId.toString(),
      scaleInstanceId: root.scaleInstanceId.toString(),
      itemResponseId: itemResponseId.toString(),
    };
  }

  private async eligibleItems(
    root: B456ScenarioRoot,
    type: 'photo' | 'handwriting',
  ): Promise<ItemResponseDocument[]> {
    return this.models.itemResponses
      .find({
        scaleInstanceId: root.scaleInstanceId,
        evidenceRefs: { $elemMatch: { evidenceType: type } },
      })
      .sort({ itemOrder: 1 })
      .exec();
  }

  private async firstItem(
    root: B456ScenarioRoot,
  ): Promise<ItemResponseDocument> {
    const item = await this.models.itemResponses
      .findOne({ scaleInstanceId: root.scaleInstanceId })
      .sort({ itemOrder: 1 })
      .exec();
    if (!item)
      throw scenarioFailure(root.scenarioKey, 'ItemResponse target is missing');
    return item;
  }

  private async requireItem(
    root: B456ScenarioRoot,
    itemCode: string,
  ): Promise<ItemResponseDocument> {
    const item = await this.models.itemResponses
      .findOne({ scaleInstanceId: root.scaleInstanceId, itemCode })
      .exec();
    if (!item)
      throw scenarioFailure(
        root.scenarioKey,
        'Required seeded item is missing',
      );
    return item;
  }

  private async requireRoot(
    namespace: string,
    key: B456BusinessScenarioKey,
  ): Promise<B456ScenarioRoot> {
    const definition = B456_BUSINESS_SCENARIOS.find(
      (entry) => entry.scenarioKey === key,
    );
    if (!definition) {
      throw new B456FixtureError(
        'B456_FIXTURE_CONTRACT_INVALID',
        'Scenario definition is missing',
      );
    }
    const subjectCode = scenarioSubjectCodeFor(namespace, definition.ordinal);
    const visitCode = scenarioVisitCodeFor(namespace, definition.ordinal);
    const patient = await this.models.patients.findOne({ subjectCode }).exec();
    const visit = await this.models.visits.findOne({ visitCode }).exec();
    const instance = visit
      ? await this.models.scaleInstances
          .findOne({
            assessmentVisitId: visit._id,
            scaleCode: definition.scaleCode,
          })
          .exec()
      : null;
    if (
      !patient ||
      !visit ||
      !instance ||
      !visit.patientId.equals(patient._id)
    ) {
      throw scenarioFailure(
        key,
        'Scenario root is missing or has invalid ownership',
      );
    }
    return {
      scenarioKey: key,
      ordinal: definition.ordinal,
      patientId: patient._id,
      visitId: visit._id,
      scaleInstanceId: instance._id,
      subjectCode,
      visitCode,
      scaleCode: definition.scaleCode,
    };
  }

  private async restoreAllTransitions(namespace: string): Promise<void> {
    const residue = await this.countTransitionResidue(namespace);
    if (residue !== 0) {
      throw new B456FixtureError(
        'B456_FIXTURE_TRANSITION_STATE_INVALID',
        'No B4-B6 transition is defined; cleanup refused unexpected transition residue',
      );
    }
  }

  private async assertNoTransitionResidue(namespace: string): Promise<void> {
    if ((await this.countTransitionResidue(namespace)) !== 0) {
      throw new B456FixtureError(
        'B456_FIXTURE_TRANSITION_REMAINS_ARMED',
        'Prepared verification requires no fixture transition residue',
      );
    }
  }

  private async countTransitionResidue(namespace: string): Promise<number> {
    const prefix = `b456fx-transition:${namespace}`;
    const counts = await Promise.all([
      this.models.sessions.countDocuments({
        'metadata.b456FixtureTransition.namespace': namespace,
      }),
      this.models.patients.countDocuments({
        'metadata.b456FixtureTransition.namespace': namespace,
      }),
      this.models.visits.countDocuments({
        'metadata.b456FixtureTransition.namespace': namespace,
      }),
      this.models.scaleInstances.countDocuments({
        'metadata.b456FixtureTransition.namespace': namespace,
      }),
      this.models.itemResponses.countDocuments({
        'metadata.b456FixtureTransition.namespace': namespace,
      }),
      this.models.mediaEvidence.countDocuments({
        'metadata.b456FixtureTransition.namespace': namespace,
      }),
      this.models.scaleDefinitions.countDocuments({
        tags: new RegExp(`^${escapeRegExp(prefix)}`),
      }),
    ]);
    return counts.reduce((sum, count) => sum + count, 0);
  }

  private async readOnlySnapshot(
    namespace: string,
  ): Promise<Record<string, unknown>> {
    const accountNames = B456_ROLES.map((role) =>
      accountNameFor(namespace, role),
    );
    const subjectCodes = ownedSubjectCodesFor(namespace);
    const [users, patients, definitions, versions] = await Promise.all([
      this.models.users
        .find({ accountName: { $in: accountNames } })
        .select({ _id: 1, updatedAt: 1 })
        .sort({ _id: 1 })
        .lean<TimestampRow[]>()
        .exec(),
      this.models.patients
        .find({ subjectCode: { $in: subjectCodes } })
        .select({ _id: 1, updatedAt: 1 })
        .sort({ _id: 1 })
        .lean<TimestampRow[]>()
        .exec(),
      this.models.scaleDefinitions
        .find({ code: { $in: ['mmse', 'moca'] } })
        .select({ _id: 1, updatedAt: 1 })
        .sort({ _id: 1 })
        .lean<TimestampRow[]>()
        .exec(),
      this.models.scaleVersions
        .find({ scaleCode: { $in: ['mmse', 'moca'] } })
        .select({ _id: 1, updatedAt: 1 })
        .sort({ _id: 1 })
        .lean<TimestampRow[]>()
        .exec(),
    ]);
    const patientIds = patients.map(({ _id }) => _id);
    const visits = await this.models.visits
      .find({ patientId: { $in: patientIds } })
      .select({ _id: 1, updatedAt: 1 })
      .sort({ _id: 1 })
      .lean<TimestampRow[]>()
      .exec();
    const visitIds = visits.map(({ _id }) => _id);
    const ownership = this.ownershipFilter(patientIds, visitIds);
    const [instances, items, evidence, scores, domains, reports, sessions] =
      await Promise.all([
        this.models.scaleInstances
          .find(ownership)
          .select({ _id: 1, updatedAt: 1 })
          .sort({ _id: 1 })
          .lean<TimestampRow[]>()
          .exec(),
        this.models.itemResponses
          .find(ownership)
          .select({ _id: 1, updatedAt: 1 })
          .sort({ _id: 1 })
          .lean<TimestampRow[]>()
          .exec(),
        this.models.mediaEvidence
          .find(ownership)
          .select({ _id: 1, updatedAt: 1 })
          .sort({ _id: 1 })
          .lean<TimestampRow[]>()
          .exec(),
        this.models.scoreResults
          .find(ownership)
          .select({ _id: 1, updatedAt: 1 })
          .sort({ _id: 1 })
          .lean<TimestampRow[]>()
          .exec(),
        this.models.cognitiveDomainResults
          .find(ownership)
          .select({ _id: 1, updatedAt: 1 })
          .sort({ _id: 1 })
          .lean<TimestampRow[]>()
          .exec(),
        this.models.reports
          .find(ownership)
          .select({ _id: 1, updatedAt: 1 })
          .sort({ _id: 1 })
          .lean<TimestampRow[]>()
          .exec(),
        this.models.sessions.countDocuments({
          userId: { $in: users.map(({ _id }) => _id) },
        }),
      ]);
    const normalize = (rows: TimestampRow[]) =>
      rows.map(({ _id, updatedAt }) => ({
        key: _id.toString(),
        updatedAt: updatedAt?.toISOString() ?? null,
      }));
    return {
      users: normalize(users),
      patients: normalize(patients),
      visits: normalize(visits),
      instances: normalize(instances),
      items: normalize(items),
      evidence: normalize(evidence),
      scores: normalize(scores),
      domains: normalize(domains),
      reports: normalize(reports),
      definitions: normalize(definitions),
      versions: normalize(versions),
      sessions,
    };
  }

  private ownershipFilter(
    patientIds: Types.ObjectId[],
    visitIds: Types.ObjectId[],
  ) {
    return {
      $or: [
        ...(patientIds.length ? [{ patientId: { $in: patientIds } }] : []),
        ...(visitIds.length ? [{ assessmentVisitId: { $in: visitIds } }] : []),
      ],
    };
  }

  private async assertNamespaceUnused(namespace: string): Promise<void> {
    const [users, patients, temp] = await Promise.all([
      this.models.users.countDocuments({
        accountName: {
          $in: B456_ROLES.map((role) => accountNameFor(namespace, role)),
        },
      }),
      this.models.patients.countDocuments({
        subjectCode: { $in: ownedSubjectCodesFor(namespace) },
      }),
      pathExists(b456TempDirectoryFor(namespace)),
    ]);
    if (users !== 0 || patients !== 0 || temp) {
      throw new B456FixtureError(
        'B456_FIXTURE_NAMESPACE_EXISTS',
        'The namespace exists or contains partial residue; use explicit replace',
      );
    }
  }

  private async assertNoUnexpectedRoots(
    namespace: string,
    accountNames: string[],
    subjectCodes: string[],
  ): Promise<void> {
    const [users, patients] = await Promise.all([
      this.models.users
        .find({
          accountName: new RegExp(`^b456fx-${escapeRegExp(namespace)}-`),
        })
        .select({ accountName: 1 })
        .lean<{ accountName: string }[]>()
        .exec(),
      this.models.patients
        .find({
          subjectCode: new RegExp(
            `^B456-${escapeRegExp(namespace.toUpperCase())}-`,
          ),
        })
        .select({ subjectCode: 1 })
        .lean<{ subjectCode: string }[]>()
        .exec(),
    ]);
    if (
      users.some(({ accountName }) => !accountNames.includes(accountName)) ||
      patients.some(({ subjectCode }) => !subjectCodes.includes(subjectCode))
    ) {
      throw new B456FixtureError(
        'B456_FIXTURE_NAMESPACE_OWNERSHIP_UNSAFE',
        'Namespace root ownership is ambiguous; cleanup was refused',
      );
    }
  }

  private async countResiduals(
    namespace: string,
    accountNames: string[],
    subjectCodes: string[],
    userIds: Types.ObjectId[],
    patientIds: Types.ObjectId[],
    visitIds: Types.ObjectId[],
  ): Promise<number> {
    const ownership = this.ownershipFilter(patientIds, visitIds);
    const counts = await Promise.all([
      this.models.users.countDocuments({ accountName: { $in: accountNames } }),
      this.models.patients.countDocuments({
        subjectCode: { $in: subjectCodes },
      }),
      this.models.visits.countDocuments({ _id: { $in: visitIds } }),
      this.models.sessions.countDocuments({ userId: { $in: userIds } }),
      this.countTransitionResidue(namespace),
      ...(patientIds.length || visitIds.length
        ? [
            this.models.reports.countDocuments(ownership),
            this.models.cognitiveDomainResults.countDocuments(ownership),
            this.models.scoreResults.countDocuments(ownership),
            this.models.mediaEvidence.countDocuments(ownership),
            this.models.itemResponses.countDocuments(ownership),
            this.models.scaleInstances.countDocuments(ownership),
          ]
        : []),
      pathExists(b456TempDirectoryFor(namespace)).then((exists) =>
        exists ? 1 : 0,
      ),
    ]);
    return counts.reduce((sum, count) => sum + count, 0);
  }
}

export function createB456BrowserFixtureManager(
  app: INestApplicationContext,
): B456BrowserFixtureManager {
  const config = app.get(ConfigService);
  const connection = app.get<Connection>(getConnectionToken());
  assertB456RuntimeEnvironment({
    nodeEnv: process.env.NODE_ENV,
    appEnv: config.get<string>('app.env'),
    databaseName: connection.name,
    storageDriver: config.get<string>('storage.driver'),
    llmProvider: config.get<string>('llm.provider'),
    smsProvider: config.get<string>('smsAuth.provider'),
    sessionCookieSecure: config.get<boolean>('session.cookieSecure'),
  });
  const models: B456Models = {
    users: app.get(getModelToken(User.name)),
    sessions: app.get(getModelToken(Session.name)),
    patients: app.get(getModelToken(Patient.name)),
    visits: app.get(getModelToken(AssessmentVisit.name)),
    scaleInstances: app.get(getModelToken(ScaleInstance.name)),
    itemResponses: app.get(getModelToken(ItemResponse.name)),
    mediaEvidence: app.get(getModelToken(MediaEvidence.name)),
    scoreResults: app.get(getModelToken(ScoreResult.name)),
    cognitiveDomainResults: app.get(getModelToken(CognitiveDomainResult.name)),
    reports: app.get(getModelToken(ClinicalReport.name)),
    scaleDefinitions: app.get(getModelToken(ScaleDefinition.name)),
    scaleVersions: app.get(getModelToken(ScaleVersion.name)),
  };
  const workflows: B456FixtureWorkflows = {
    scaleCatalog: app.get(ScaleCatalogService),
    scaleWorkflow: app.get(AssessmentScaleWorkflowService),
    itemDraft: app.get(ItemResponseDraftService),
    mediaWorkflow: app.get(MediaEvidenceWorkflowService),
    submission: app.get(ScaleInstanceSubmissionService),
  };
  return new B456BrowserFixtureManager(
    connection.name,
    models,
    app.get(AuthService),
    workflows,
  );
}
