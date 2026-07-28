import type { INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink } from 'fs/promises';
import type { Connection, Model } from 'mongoose';
import { tmpdir } from 'os';
import path from 'path';
import request from 'supertest';
import { parseB11Command } from '../scripts/b11-browser-fixtures';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import {
  AssessmentVisit,
  type AssessmentVisitDocument,
} from '../src/modules/assessments/schemas/assessment-visit.schema';
import {
  ScaleInstance,
  type ScaleInstanceDocument,
} from '../src/modules/assessments/schemas/scale-instance.schema';
import {
  Patient,
  type PatientDocument,
} from '../src/modules/patients/schemas/patient.schema';
import {
  ClinicalReport,
  type ClinicalReportDocument,
} from '../src/modules/reports/schemas/clinical-report.schema';
import {
  Session,
  type SessionDocument,
} from '../src/modules/auth/schemas/session.schema';
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
  User,
  type UserDocument,
} from '../src/modules/users/schemas/user.schema';
import {
  B11_AUDIT_IDS,
  B11_AUDIT_MATRIX,
  accountNameFor,
  assertB11Contract,
  assertB11StageTarget,
  auditMatrixFor,
  routeFor,
  scenariosFor,
  subjectCodeFor,
  validateB11Namespace,
} from './support/b11-browser-fixtures/fixture-contract';
import { assertB11SafeManifest } from './support/b11-browser-fixtures/fixture-manifest';
import {
  createB11BrowserFixtureManager,
  isB11ProtectedCanonicalScaleVersion,
  type B11BrowserFixtureManager,
} from './support/b11-browser-fixtures/b11-browser-fixtures';
import {
  assertB11RuntimeDescriptor,
  removeB11RuntimeDescriptor,
  validateB11RuntimeOutputName,
  writeB11RuntimeDescriptor,
} from './support/b11-browser-fixtures/runtime-descriptor';
import {
  B11FixtureError,
  B11_ROLES,
  type B11Profile,
  type B11RuntimeDescriptor,
} from './support/b11-browser-fixtures/fixture-types';
import { requireInitialized } from './support/e2e-initialization';

jest.setTimeout(600000);

const CORE_NAMESPACE = 'b11c-e2e-contract';
const RESILIENCE_NAMESPACE = 'b11r-e2e-contract';

type SupertestApp = NonNullable<Parameters<typeof request.agent>[0]>;

function expectFixtureCode(action: () => void, code: string): void {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(B11FixtureError);
    if (error instanceof B11FixtureError) expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected fixture error ${code}`);
}

function withoutTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutTimestamps);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'createdAt' && key !== 'updatedAt')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, withoutTimestamps(entry)]),
  );
}

describe('B11 profile-scoped browser fixture support (e2e)', () => {
  let app: INestApplication;
  let server: SupertestApp;
  let connection: Connection;
  let manager: B11BrowserFixtureManager;
  let patientModel: Model<PatientDocument>;
  let visitModel: Model<AssessmentVisitDocument>;
  let instanceModel: Model<ScaleInstanceDocument>;
  let reportModel: Model<ClinicalReportDocument>;
  let sessionModel: Model<SessionDocument>;
  let userModel: Model<UserDocument>;
  let definitionModel: Model<ScaleDefinitionDocument>;
  let versionModel: Model<ScaleVersionDocument>;
  let scaleCatalog: ScaleCatalogService;
  let testPassword: string;
  let prepared = false;

  async function canonicalSeedSnapshot(): Promise<string> {
    const [definitions, versions] = await Promise.all([
      definitionModel
        .find({ code: { $in: ['mmse', 'moca'] } })
        .sort({ code: 1, _id: 1 })
        .lean()
        .exec(),
      versionModel
        .find({ scaleCode: { $in: ['mmse', 'moca'] }, status: 'active' })
        .sort({ scaleCode: 1, version: 1, _id: 1 })
        .lean()
        .exec(),
    ]);
    return JSON.stringify(
      withoutTimestamps({
        definitions,
        versions: versions.filter(isB11ProtectedCanonicalScaleVersion),
      }),
    );
  }

  async function reportFor(
    profile: B11Profile,
    namespace: string,
    scenarioKey: string,
    routeKey: string,
  ): Promise<ClinicalReportDocument> {
    const patient = await patientModel
      .findOne({
        subjectCode: subjectCodeFor(profile, namespace, scenarioKey, routeKey),
      })
      .exec();
    const report = patient
      ? await reportModel.findOne({ patientId: patient._id }).exec()
      : null;
    if (!report) throw new Error(`Missing report ${scenarioKey}/${routeKey}`);
    return report;
  }

  async function stageCore() {
    return manager.stage({
      profile: 'core-workflow',
      namespace: CORE_NAMESPACE,
      password: testPassword,
      scenarioKey: 'confirmation',
      routeKey: 'confirmation-conflict',
      transition: 'confirmation-conflict-touch',
      role: 'doctor',
    });
  }

  async function stageResilience() {
    return manager.stage({
      profile: 'resilience-security',
      namespace: RESILIENCE_NAMESPACE,
      password: testPassword,
      scenarioKey: 'authorization',
      routeKey: 'forbidden-confirm',
      transition: 'forbidden-confirm-role',
      role: 'doctor',
    });
  }

  async function simulateProduct(
    scenarioKey: string,
    routeKey: string,
  ): Promise<void> {
    await manager.simulateProductMutationForE2e({
      profile: 'core-workflow',
      namespace: CORE_NAMESPACE,
      password: testPassword,
      scenarioKey,
      routeKey,
    });
  }

  async function expectCoreStageFailure(): Promise<void> {
    await expect(stageCore()).rejects.toBeInstanceOf(B11FixtureError);
  }

  async function mutateReportForStageFailure(
    report: ClinicalReportDocument,
    update: Record<string, unknown>,
  ): Promise<void> {
    const original = await reportModel.collection.findOne({ _id: report._id });
    if (!original) throw new Error('Missing raw Stage drift report');
    try {
      const result = await reportModel.collection.updateOne(
        { _id: report._id },
        update,
      );
      expect(result.matchedCount).toBe(1);
      await expectCoreStageFailure();
    } finally {
      await reportModel.collection.replaceOne({ _id: report._id }, original);
    }
  }

  async function mutateReportForPostBrowserFailure(
    report: ClinicalReportDocument,
    update: Record<string, unknown>,
  ): Promise<void> {
    const original = await reportModel.collection.findOne({ _id: report._id });
    if (!original) throw new Error('Missing raw post-browser drift report');
    try {
      await reportModel.collection.updateOne({ _id: report._id }, update);
      await expect(
        manager.verify(
          'core-workflow',
          CORE_NAMESPACE,
          testPassword,
          'post-browser',
        ),
      ).rejects.toBeInstanceOf(B11FixtureError);
    } finally {
      await reportModel.collection.replaceOne({ _id: report._id }, original);
    }
  }

  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      process.env.COGMEMORY_DATABASE_PURPOSE !== 'standard_test'
    ) {
      throw new Error('B11 fixture E2E requires standard_test isolation');
    }
    testPassword = `B11-${randomUUID()}-Aa1!`;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = requireInitialized<SupertestApp>(
      app.getHttpServer() as SupertestApp | undefined,
      'HTTP server',
    );
    connection = app.get<Connection>(getConnectionToken());
    manager = createB11BrowserFixtureManager(app);
    patientModel = app.get(getModelToken(Patient.name));
    visitModel = app.get(getModelToken(AssessmentVisit.name));
    instanceModel = app.get(getModelToken(ScaleInstance.name));
    reportModel = app.get(getModelToken(ClinicalReport.name));
    sessionModel = app.get(getModelToken(Session.name));
    userModel = app.get(getModelToken(User.name));
    definitionModel = app.get(getModelToken(ScaleDefinition.name));
    versionModel = app.get(getModelToken(ScaleVersion.name));
    scaleCatalog = app.get(ScaleCatalogService);
    await manager.cleanup('core-workflow', CORE_NAMESPACE);
    await manager.cleanup('resilience-security', RESILIENCE_NAMESPACE);
    for (const scaleCode of ['mmse', 'moca'] as const) {
      await scaleCatalog.ensureSeedScaleVersionMaterialized(scaleCode);
    }
  });

  afterAll(async () => {
    if (manager) {
      await manager.cleanup('core-workflow', CORE_NAMESPACE);
      await manager.cleanup('resilience-security', RESILIENCE_NAMESPACE);
    }
    if (app) await app.close();
    if (connection?.readyState) await connection.close();
  });

  it('enforces the ordered 70-ID, 58/11/1 profile split, unique primary owners, and 29 fixed Browser routes', () => {
    expect(() => assertB11Contract()).not.toThrow();
    expect(B11_AUDIT_IDS).toHaveLength(70);
    expect(B11_AUDIT_MATRIX.map(({ auditId }) => auditId)).toEqual(
      B11_AUDIT_IDS,
    );
    expect(auditMatrixFor('core-workflow')).toHaveLength(58);
    expect(auditMatrixFor('resilience-security')).toHaveLength(11);
    expect(
      B11_AUDIT_MATRIX.filter(({ ownerType }) => ownerType === 'static_gate'),
    ).toEqual([
      expect.objectContaining({
        auditId: 'B11-70',
        profile: 'static-gate',
        routeKey: null,
      }),
    ]);
    const browserEntries = B11_AUDIT_MATRIX.filter(
      ({ ownerType }) => ownerType === 'browser_route',
    );
    expect(browserEntries).toHaveLength(69);
    expect(new Set(browserEntries.map(({ auditId }) => auditId)).size).toBe(69);
    expect(
      scenariosFor('core-workflow').flatMap(({ routes }) => routes),
    ).toHaveLength(20);
    expect(
      scenariosFor('resilience-security').flatMap(({ routes }) => routes),
    ).toHaveLength(9);
    expect(
      scenariosFor('core-workflow')
        .flatMap(({ routes }) => routes)
        .every(({ automaticWriteRetry }) => automaticWriteRetry === false),
    ).toBe(true);
  });

  it('rejects arbitrary CLI values, wrong profile namespaces, unsafe output names, and non-allowlisted Stage extensions', () => {
    expectFixtureCode(
      () => validateB11Namespace('core-workflow', RESILIENCE_NAMESPACE),
      'B11_FIXTURE_NAMESPACE_INVALID',
    );
    expectFixtureCode(
      () => validateB11RuntimeOutputName('../runtime.json'),
      'B11_FIXTURE_RUNTIME_OUTPUT_NAME_INVALID',
    );
    expectFixtureCode(
      () =>
        assertB11StageTarget({
          profile: 'core-workflow',
          scenarioKey: 'submission',
          routeKey: 'submission-conflict',
          transition: 'confirmation-conflict-touch',
          role: 'doctor',
        }),
      'B11_FIXTURE_STAGE_TARGET_NOT_ALLOWED',
    );
    expectFixtureCode(
      () =>
        parseB11Command([
          'prepare',
          '--profile',
          'core-workflow',
          '--namespace',
          CORE_NAMESPACE,
          '--patient-id',
          '000000000000000000000000',
        ]),
      'B11_FIXTURE_ARGUMENT_INVALID',
    );
    expectFixtureCode(
      () =>
        parseB11Command([
          'prepare',
          '--profile',
          'core-workflow',
          '--namespace',
          CORE_NAMESPACE,
          '--password',
          'not-accepted',
        ]),
      'B11_FIXTURE_ARGUMENT_INVALID',
    );
  });

  it('prepares both independent profiles with five exact roles, legal state matrices, exact roots, and safe manifests', async () => {
    const seedBefore = await canonicalSeedSnapshot();
    const core = await manager.prepare(
      'core-workflow',
      CORE_NAMESPACE,
      testPassword,
    );
    const resilience = await manager.prepare(
      'resilience-security',
      RESILIENCE_NAMESPACE,
      testPassword,
    );
    prepared = true;
    expect(core.roles.map(({ role }) => role)).toEqual(B11_ROLES);
    expect(resilience.roles.map(({ role }) => role)).toEqual(B11_ROLES);
    expect(core.auditIdCount).toBe(58);
    expect(core.scenarioCount).toBe(5);
    expect(core.routeCount).toBe(20);
    expect(core.resourceCounts).toEqual({
      users: 5,
      patients: 20,
      visits: 20,
      scaleInstances: 20,
      clinicalReports: 20,
      fixtureMarkers: 20,
    });
    expect(resilience.auditIdCount).toBe(11);
    expect(resilience.scenarioCount).toBe(4);
    expect(resilience.routeCount).toBe(9);
    expect(resilience.resourceCounts).toEqual({
      users: 5,
      patients: 9,
      visits: 9,
      scaleInstances: 9,
      clinicalReports: 9,
      fixtureMarkers: 9,
    });
    expect(() => assertB11SafeManifest(core)).not.toThrow();
    expect(() => assertB11SafeManifest(resilience)).not.toThrow();
    const safeText = JSON.stringify([core, resilience]);
    expect(safeText).not.toMatch(
      /passwordHash|cookie|session|mongodb|navigationPath|patientId|visitId|reportId|metadata|doctorOpinion|recommendationText/,
    );
    expect(await canonicalSeedSnapshot()).toBe(seedBefore);
    const reports = await reportModel
      .find({ 'metadata.b11FixtureOwnership.namespace': CORE_NAMESPACE })
      .exec();
    const states = new Map<string, number>();
    for (const report of reports) {
      const marker = report.metadata?.b11FixtureOwnership as
        | Record<string, unknown>
        | undefined;
      const state = String(marker?.preparedState);
      states.set(state, (states.get(state) ?? 0) + 1);
    }
    expect(states).toEqual(
      new Map([
        ['system_draft', 3],
        ['mixed_draft', 6],
        ['audit_limit_draft', 1],
        ['pending_confirmation', 6],
        ['confirmed', 1],
        ['archived', 1],
        ['corrected', 1],
        ['voided', 1],
      ]),
    );
    const auditLimit = await reportFor(
      'core-workflow',
      CORE_NAMESPACE,
      'edit-concurrency',
      'edit-audit-limit',
    );
    const editMetadata = auditLimit.metadata?.a21Edits as
      | { events?: unknown[] }
      | undefined;
    expect(editMetadata?.events).toHaveLength(200);
    expect(
      new Set(
        reports.map(({ assessmentVisitId }) => assessmentVisitId.toString()),
      ).size,
    ).toBe(20);
  });

  it('keeps prepared verification read-only, rejects wrong passwords, and refuses post-browser before required writes', async () => {
    const before = await reportModel
      .find({ 'metadata.b11FixtureOwnership.namespace': CORE_NAMESPACE })
      .sort({ reportCode: 1 })
      .lean()
      .exec();
    await expect(
      manager.verify(
        'core-workflow',
        CORE_NAMESPACE,
        `${testPassword}-wrong`,
        'prepared',
      ),
    ).rejects.toBeInstanceOf(B11FixtureError);
    await expect(
      manager.verify(
        'core-workflow',
        CORE_NAMESPACE,
        testPassword,
        'post-browser',
      ),
    ).rejects.toBeInstanceOf(B11FixtureError);
    await manager.verify(
      'core-workflow',
      CORE_NAMESPACE,
      testPassword,
      'prepared',
    );
    const after = await reportModel
      .find({ 'metadata.b11FixtureOwnership.namespace': CORE_NAMESPACE })
      .sort({ reportCode: 1 })
      .lean()
      .exec();
    expect(after).toEqual(before);
  });

  it('resolves only fixed runtime fields and enforces atomic basename, traversal, existing-target, and symlink safety', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'b11-runtime-'));
    try {
      const descriptor = await manager.resolveRuntimeDescriptor({
        profile: 'core-workflow',
        namespace: CORE_NAMESPACE,
        password: testPassword,
        scenarioKey: 'edit-concurrency',
        routeKey: 'edit-conflict-continue',
        role: 'doctor',
      });
      expect(() => assertB11RuntimeDescriptor(descriptor)).not.toThrow();
      expect(Object.keys(descriptor).sort()).toEqual([
        'batch',
        'loginIdentifier',
        'navigationPath',
        'primaryRole',
        'profile',
        'routeKey',
        'scenarioKey',
        'secondaryLoginIdentifier',
        'secondaryRole',
        'version',
      ]);
      await writeB11RuntimeDescriptor(
        descriptor,
        'b11-runtime-contract.json',
        runtimeRoot,
      );
      const written = JSON.parse(
        await readFile(
          path.join(runtimeRoot, 'b11-runtime-contract.json'),
          'utf8',
        ),
      ) as B11RuntimeDescriptor;
      expect(written).toEqual(descriptor);
      await expect(
        writeB11RuntimeDescriptor(
          descriptor,
          'b11-runtime-contract.json',
          runtimeRoot,
        ),
      ).rejects.toMatchObject({ code: 'B11_FIXTURE_RUNTIME_TARGET_EXISTS' });
      expect(
        await removeB11RuntimeDescriptor(
          'b11-runtime-contract.json',
          runtimeRoot,
        ),
      ).toBe(true);
      expect(
        await removeB11RuntimeDescriptor(
          'b11-runtime-contract.json',
          runtimeRoot,
        ),
      ).toBe(false);
      const realDirectory = path.join(runtimeRoot, 'real-directory');
      const linkedDirectory = path.join(runtimeRoot, 'linked-directory');
      await mkdir(realDirectory);
      await symlink(realDirectory, linkedDirectory, 'junction');
      await expect(
        writeB11RuntimeDescriptor(
          descriptor,
          'b11-runtime-link.json',
          linkedDirectory,
        ),
      ).rejects.toMatchObject({ code: 'B11_FIXTURE_RUNTIME_DIRECTORY_UNSAFE' });
      expect((await lstat(linkedDirectory)).isSymbolicLink()).toBe(true);
    } finally {
      await rm(runtimeRoot, { recursive: true, force: true });
    }
  });

  it('allows only the two exact idempotent Stages and makes prepared verification reject Stage drift', async () => {
    const coreFirst = await stageCore();
    const stagedCoreReport = await reportFor(
      'core-workflow',
      CORE_NAMESPACE,
      'confirmation',
      'confirmation-conflict',
    );
    const coreAfterFirst = await reportModel.collection.findOne({
      _id: stagedCoreReport._id,
    });
    const coreSecond = await stageCore();
    expect(coreFirst.alreadyStaged).toBe(false);
    expect(coreFirst.preStageProgressVerified).toBe(true);
    expect(coreSecond.alreadyStaged).toBe(true);
    expect(coreSecond.preStageProgressVerified).toBe(true);
    expect(
      await reportModel.collection.findOne({ _id: stagedCoreReport._id }),
    ).toEqual(coreAfterFirst);
    await expect(
      manager.verify('core-workflow', CORE_NAMESPACE, testPassword, 'prepared'),
    ).rejects.toBeInstanceOf(B11FixtureError);
    await manager.replace('core-workflow', CORE_NAMESPACE, testPassword);

    const resilienceFirst = await stageResilience();
    const stagedDoctor = await userModel.collection.findOne({
      accountName: accountNameFor(
        'resilience-security',
        RESILIENCE_NAMESPACE,
        'doctor',
      ),
    });
    const resilienceSecond = await stageResilience();
    expect(resilienceFirst.alreadyStaged).toBe(false);
    expect(resilienceFirst.preStageProgressVerified).toBe(true);
    expect(resilienceSecond.alreadyStaged).toBe(true);
    expect(resilienceSecond.preStageProgressVerified).toBe(true);
    expect(
      await userModel.collection.findOne({
        accountName: accountNameFor(
          'resilience-security',
          RESILIENCE_NAMESPACE,
          'doctor',
        ),
      }),
    ).toEqual(stagedDoctor);
    await expect(
      manager.verify(
        'resilience-security',
        RESILIENCE_NAMESPACE,
        testPassword,
        'prepared',
      ),
    ).rejects.toBeInstanceOf(B11FixtureError);
    await manager.replace(
      'resilience-security',
      RESILIENCE_NAMESPACE,
      testPassword,
    );
  });

  it('accepts exact prior edit, mixed edit-submit-confirm, and complete core product progress before confirmation Stage', async () => {
    await simulateProduct('edit-basics', 'edit-success');
    await expect(stageCore()).resolves.toMatchObject({
      alreadyStaged: false,
      preStageProgressVerified: true,
    });
    await manager.replace('core-workflow', CORE_NAMESPACE, testPassword);

    for (const [scenarioKey, routeKey] of [
      ['edit-basics', 'edit-success'],
      ['submission', 'submission-success'],
      ['confirmation', 'confirmation-doctor-success'],
    ] as const) {
      await simulateProduct(scenarioKey, routeKey);
    }
    await expect(stageCore()).resolves.toMatchObject({
      alreadyStaged: false,
      preStageProgressVerified: true,
    });
    await manager.replace('core-workflow', CORE_NAMESPACE, testPassword);

    for (const scenario of scenariosFor('core-workflow')) {
      for (const routeValue of scenario.routes) {
        if (routeValue.expectedProductMutationClass === 'none') continue;
        await simulateProduct(scenario.scenarioKey, routeValue.key);
      }
    }
    const first = await stageCore();
    const target = await reportFor(
      'core-workflow',
      CORE_NAMESPACE,
      'confirmation',
      'confirmation-conflict',
    );
    const afterFirst = await reportModel.collection.findOne({
      _id: target._id,
    });
    const second = await stageCore();
    expect(first).toMatchObject({
      alreadyStaged: false,
      preStageProgressVerified: true,
    });
    expect(second).toMatchObject({
      alreadyStaged: true,
      preStageProgressVerified: true,
    });
    expect(await reportModel.collection.findOne({ _id: target._id })).toEqual(
      afterFirst,
    );
    await expect(
      manager.verify(
        'core-workflow',
        CORE_NAMESPACE,
        testPassword,
        'post-browser',
      ),
    ).resolves.toMatchObject({ phase: 'post-browser' });
    await manager.replace('core-workflow', CORE_NAMESPACE, testPassword);
  });

  it('rejects partial product progress, audit drift, Stage drift, role drift, source-root drift, seed drift, and cross-profile pollution before Stage', async () => {
    const editSuccess = await reportFor(
      'core-workflow',
      CORE_NAMESPACE,
      'edit-basics',
      'edit-success',
    );
    const submissionSuccess = await reportFor(
      'core-workflow',
      CORE_NAMESPACE,
      'submission',
      'submission-success',
    );
    const confirmationVisibility = await reportFor(
      'core-workflow',
      CORE_NAMESPACE,
      'confirmation',
      'confirmation-role-visibility',
    );
    const confirmationConflict = await reportFor(
      'core-workflow',
      CORE_NAMESPACE,
      'confirmation',
      'confirmation-conflict',
    );
    const confirmedBaseline = await reportFor(
      'core-workflow',
      CORE_NAMESPACE,
      'final-readonly',
      'confirmed-readonly',
    );
    const confirmationMetadata = confirmedBaseline.metadata?.a21Confirmation;
    if (!confirmationMetadata || !confirmedBaseline.confirmation) {
      throw new Error('Missing fixed confirmed Stage drift source');
    }

    await mutateReportForStageFailure(editSuccess, {
      $set: {
        'narrative.doctorOpinion': 'B11 partial edit drift with no meaning.',
      },
    });

    const editEvents = [1, 2].map((ordinal) => ({
      eventId: `b11-extra-edit-${ordinal}`,
      editedAt: new Date(`2026-07-28T03:00:0${ordinal}.000Z`),
      editedBy: confirmedBaseline._id.toString(),
      editedByName: 'B11 synthetic doctor',
      editedByRole: 'doctor',
      changedFields: ['doctorOpinion'],
      previousValues: { doctorOpinion: `before-${ordinal}` },
      nextValues: { doctorOpinion: `after-${ordinal}` },
      editNote: `B11 synthetic extra edit ${ordinal}`,
    }));
    await mutateReportForStageFailure(editSuccess, {
      $set: {
        'metadata.a21Edits': {
          version: 1,
          events: editEvents,
          lastEditedAt: editEvents[1]?.editedAt,
          lastEditedBy: confirmedBaseline._id.toString(),
        },
        'narrative.doctorOpinion': 'B11 extra edit drift with no meaning.',
        source: 'mixed',
      },
    });

    await mutateReportForStageFailure(submissionSuccess, {
      $set: { status: 'pending_confirmation' },
      $unset: { 'metadata.a21Submission': '' },
    });

    await mutateReportForStageFailure(confirmationVisibility, {
      $set: {
        status: 'confirmed',
        confirmation: confirmedBaseline.confirmation,
        'metadata.a21Confirmation': confirmationMetadata,
      },
    });

    await mutateReportForStageFailure(confirmationConflict, {
      $set: {
        status: 'confirmed',
        confirmation: confirmedBaseline.confirmation,
        'metadata.a21Confirmation': confirmationMetadata,
      },
    });
    await mutateReportForStageFailure(confirmationConflict, {
      $set: { status: 'draft' },
    });
    await mutateReportForStageFailure(confirmationConflict, {
      $set: {
        'metadata.b11FixtureStage': {
          version: 1,
          profile: 'core-workflow',
          namespace: CORE_NAMESPACE,
          scenarioKey: 'confirmation',
          routeKey: 'confirmation-conflict',
          transition: 'wrong-transition',
        },
      },
    });
    await mutateReportForStageFailure(editSuccess, {
      $set: {
        'metadata.b11FixtureStage': {
          version: 1,
          profile: 'core-workflow',
          namespace: CORE_NAMESPACE,
          scenarioKey: 'edit-basics',
          routeKey: 'edit-success',
          transition: 'confirmation-conflict-touch',
        },
      },
    });

    const nurse = await userModel.collection.findOne({
      accountName: accountNameFor('core-workflow', CORE_NAMESPACE, 'nurse'),
    });
    if (!nurse) throw new Error('Missing nurse Stage drift target');
    try {
      await userModel.collection.updateOne(
        { _id: nurse._id },
        { $set: { roles: ['admin'], userType: 'admin' } },
      );
      await expectCoreStageFailure();
    } finally {
      await userModel.collection.replaceOne({ _id: nurse._id }, nurse);
    }

    const patient = await patientModel.findById(editSuccess.patientId).exec();
    const visit = await visitModel
      .findById(editSuccess.assessmentVisitId)
      .exec();
    const instance = await instanceModel
      .findById(editSuccess.primaryScaleInstanceIds[0])
      .exec();
    if (!patient || !visit || !instance) {
      throw new Error('Missing Stage source-root drift target');
    }
    const rawPatient = await patientModel.collection.findOne({
      _id: patient._id,
    });
    const rawVisit = await visitModel.collection.findOne({ _id: visit._id });
    const rawInstance = await instanceModel.collection.findOne({
      _id: instance._id,
    });
    if (!rawPatient || !rawVisit || !rawInstance) {
      throw new Error('Missing raw Stage source-root drift target');
    }
    try {
      await patientModel.collection.updateOne(
        { _id: patient._id },
        { $set: { displayName: 'B11 unexpected patient drift' } },
      );
      await expectCoreStageFailure();
    } finally {
      await patientModel.collection.replaceOne(
        { _id: patient._id },
        rawPatient,
      );
    }
    try {
      await visitModel.collection.updateOne(
        { _id: visit._id },
        { $set: { visitCode: `${visit.visitCode}-DRIFT` } },
      );
      await expectCoreStageFailure();
    } finally {
      await visitModel.collection.replaceOne({ _id: visit._id }, rawVisit);
    }
    try {
      await instanceModel.collection.updateOne(
        { _id: instance._id },
        { $set: { status: 'in_progress' } },
      );
      await expectCoreStageFailure();
    } finally {
      await instanceModel.collection.replaceOne(
        { _id: instance._id },
        rawInstance,
      );
    }

    await mutateReportForStageFailure(editSuccess, {
      $set: {
        'narrative.chiefSummary': 'B11 unexpected system narrative drift',
      },
    });
    await mutateReportForStageFailure(editSuccess, {
      $set: {
        'patientSnapshot.displayName': 'B11 unexpected snapshot drift',
      },
    });

    const protectedVersion = await versionModel.collection.findOne({
      status: 'active',
      scaleCode: { $in: ['mmse', 'moca'] },
    });
    if (!protectedVersion) throw new Error('Missing protected seed version');
    try {
      await versionModel.collection.updateOne(
        { _id: protectedVersion._id },
        { $set: { displayVersion: 'B11 unexpected Stage seed drift' } },
      );
      await expectCoreStageFailure();
    } finally {
      await versionModel.collection.replaceOne(
        { _id: protectedVersion._id },
        protectedVersion,
      );
    }

    for (const update of [
      { $set: { 'metadata.b11Fixture.profile': 'resilience-security' } },
      { $set: { 'metadata.b11Fixture.namespace': 'b11r-cross-stage' } },
    ]) {
      try {
        await patientModel.collection.updateOne({ _id: patient._id }, update);
        await expectCoreStageFailure();
      } finally {
        await patientModel.collection.replaceOne(
          { _id: patient._id },
          rawPatient,
        );
      }
    }

    await expect(
      manager.verify('core-workflow', CORE_NAMESPACE, testPassword, 'prepared'),
    ).resolves.toMatchObject({ phase: 'prepared' });
  });

  it('rejects forbidden-role Stage marker and target-role drift while non-target resilience routes remain prepared', async () => {
    const doctor = await userModel.collection.findOne({
      accountName: accountNameFor(
        'resilience-security',
        RESILIENCE_NAMESPACE,
        'doctor',
      ),
    });
    if (!doctor) throw new Error('Missing resilience doctor drift target');
    try {
      await userModel.collection.updateOne(
        { _id: doctor._id },
        {
          $set: {
            roles: ['nurse'],
            userType: 'nurse',
            'metadata.b11FixtureStage': {
              version: 1,
              profile: 'resilience-security',
              namespace: RESILIENCE_NAMESPACE,
              scenarioKey: 'authorization',
              routeKey: 'forbidden-confirm',
              transition: 'wrong-transition',
            },
          },
        },
      );
      await expect(stageResilience()).rejects.toBeInstanceOf(B11FixtureError);
    } finally {
      await userModel.collection.replaceOne({ _id: doctor._id }, doctor);
    }
    await expect(stageResilience()).resolves.toMatchObject({
      alreadyStaged: false,
      preStageProgressVerified: true,
    });
    await manager.replace(
      'resilience-security',
      RESILIENCE_NAMESPACE,
      testPassword,
    );
  });

  it('accepts every legal mutation class after controlled verifier simulation', async () => {
    await manager.simulatePostBrowserForE2e(
      'core-workflow',
      CORE_NAMESPACE,
      testPassword,
    );
    await manager.simulatePostBrowserForE2e(
      'resilience-security',
      RESILIENCE_NAMESPACE,
      testPassword,
    );
    const [core, resilience] = await Promise.all([
      manager.verify(
        'core-workflow',
        CORE_NAMESPACE,
        testPassword,
        'post-browser',
      ),
      manager.verify(
        'resilience-security',
        RESILIENCE_NAMESPACE,
        testPassword,
        'post-browser',
      ),
    ]);
    expect(core.phase).toBe('post-browser');
    expect(resilience.phase).toBe('post-browser');
  });

  it('rejects extra A21 audits, A22-A25 drift, and cross-namespace ownership drift without repair', async () => {
    const targets = [
      await reportFor(
        'core-workflow',
        CORE_NAMESPACE,
        'edit-basics',
        'edit-success',
      ),
      await reportFor(
        'core-workflow',
        CORE_NAMESPACE,
        'final-readonly',
        'confirmed-readonly',
      ),
      await reportFor(
        'resilience-security',
        RESILIENCE_NAMESPACE,
        'client-boundary',
        'storage-and-refresh',
      ),
    ];
    const mutations: Array<{
      report: ClinicalReportDocument;
      profile: B11Profile;
      namespace: string;
      update: Record<string, unknown>;
    }> = [
      {
        report: targets[0],
        profile: 'core-workflow',
        namespace: CORE_NAMESPACE,
        update: {
          $push: {
            'metadata.a21Edits.events': {
              eventId: 'b11-extra-edit',
              editedAt: new Date('2026-07-28T03:00:00.000Z'),
              editedBy: targets[0]._id.toString(),
              editedByName: 'B11 synthetic actor',
              editedByRole: 'doctor',
              changedFields: ['doctorOpinion'],
              previousValues: { doctorOpinion: 'before' },
              nextValues: { doctorOpinion: 'after' },
              editNote: 'B11 synthetic extra edit note',
            },
          },
        },
      },
      {
        report: targets[1],
        profile: 'core-workflow',
        namespace: CORE_NAMESPACE,
        update: {
          $set: {
            'metadata.a22Lock': {
              version: 1,
              fixtureDrift: true,
            },
          },
        },
      },
      {
        report: targets[2],
        profile: 'resilience-security',
        namespace: RESILIENCE_NAMESPACE,
        update: {
          $set: {
            'metadata.b11FixtureOwnership.namespace': 'b11r-cross-drift',
          },
        },
      },
    ];
    for (const mutation of mutations) {
      const original = await reportModel.collection.findOne({
        _id: mutation.report._id,
      });
      if (!original) throw new Error('Missing mutation target');
      try {
        await reportModel.collection.updateOne(
          { _id: mutation.report._id },
          mutation.update,
        );
        await expect(
          manager.verify(
            mutation.profile,
            mutation.namespace,
            testPassword,
            'post-browser',
          ),
        ).rejects.toBeInstanceOf(B11FixtureError);
      } finally {
        await reportModel.collection.replaceOne(
          { _id: original._id },
          original,
        );
      }
    }

    const submission = await reportFor(
      'core-workflow',
      CORE_NAMESPACE,
      'submission',
      'submission-success',
    );
    await mutateReportForPostBrowserFailure(submission, {
      $unset: { 'metadata.a21Submission': '' },
    });

    const confirmation = await reportFor(
      'core-workflow',
      CORE_NAMESPACE,
      'confirmation',
      'confirmation-doctor-success',
    );
    await mutateReportForPostBrowserFailure(confirmation, {
      $set: { source: 'system_draft' },
    });

    await mutateReportForPostBrowserFailure(targets[0], {
      $unset: { 'metadata.a21Edits': '' },
    });

    const zeroMutationConfirmation = await reportFor(
      'core-workflow',
      CORE_NAMESPACE,
      'confirmation',
      'confirmation-role-visibility',
    );
    await mutateReportForPostBrowserFailure(zeroMutationConfirmation, {
      $set: {
        status: 'confirmed',
        confirmation: confirmation.confirmation,
        'metadata.a21Confirmation': confirmation.metadata?.a21Confirmation,
      },
    });

    await expect(
      manager.verify(
        'core-workflow',
        CORE_NAMESPACE,
        testPassword,
        'post-browser',
      ),
    ).resolves.toMatchObject({ phase: 'post-browser' });
  });

  it('removes linked Sessions, all namespace roots and descriptors, preserves canonical seed, and makes cleanup idempotent', async () => {
    expect(prepared).toBe(true);
    const seedBefore = await canonicalSeedSnapshot();
    const agent = request.agent(server);
    await agent
      .post('/auth/login')
      .send({
        accountName: accountNameFor('core-workflow', CORE_NAMESPACE, 'doctor'),
        password: testPassword,
      })
      .expect(201);
    const coreDoctor = await connection.collection('users').findOne({
      accountName: accountNameFor('core-workflow', CORE_NAMESPACE, 'doctor'),
    });
    expect(coreDoctor).not.toBeNull();
    expect(
      await sessionModel.countDocuments({ userId: coreDoctor?._id }),
    ).toBeGreaterThan(0);
    const coreFirst = await manager.cleanup('core-workflow', CORE_NAMESPACE);
    const coreSecond = await manager.cleanup('core-workflow', CORE_NAMESPACE);
    const resilienceFirst = await manager.cleanup(
      'resilience-security',
      RESILIENCE_NAMESPACE,
    );
    const resilienceSecond = await manager.cleanup(
      'resilience-security',
      RESILIENCE_NAMESPACE,
    );
    expect(coreFirst).toMatchObject({ residualCount: 0, matched: true });
    expect(coreSecond).toMatchObject({ residualCount: 0, matched: false });
    expect(resilienceFirst).toMatchObject({
      residualCount: 0,
      matched: true,
    });
    expect(resilienceSecond).toMatchObject({
      residualCount: 0,
      matched: false,
    });
    expect(await canonicalSeedSnapshot()).toBe(seedBefore);
    expect(
      await patientModel.countDocuments({
        'metadata.b11Fixture.namespace': {
          $in: [CORE_NAMESPACE, RESILIENCE_NAMESPACE],
        },
      }),
    ).toBe(0);
    expect(
      await visitModel.countDocuments({
        subjectCode: { $regex: /^B11[CR]-B11[CR]E2ECONTRACT/ },
      }),
    ).toBe(0);
    expect(
      await instanceModel.countDocuments({
        'metadata.b11Fixture.namespace': {
          $in: [CORE_NAMESPACE, RESILIENCE_NAMESPACE],
        },
      }),
    ).toBe(0);
    expect(
      await reportModel.countDocuments({
        'metadata.b11FixtureOwnership.namespace': {
          $in: [CORE_NAMESPACE, RESILIENCE_NAMESPACE],
        },
      }),
    ).toBe(0);
    prepared = false;
  });

  it('keeps route lookup strict and mutation classes explicit for every Browser route', () => {
    const mutationClasses = new Set<string>();
    for (const profile of ['core-workflow', 'resilience-security'] as const) {
      for (const scenario of scenariosFor(profile)) {
        for (const routeValue of scenario.routes) {
          expect(routeFor(profile, scenario.scenarioKey, routeValue.key)).toBe(
            routeValue,
          );
          mutationClasses.add(routeValue.expectedProductMutationClass);
          mutationClasses.add(routeValue.expectedFixtureOwnedMutationClass);
        }
      }
    }
    expect(mutationClasses).toEqual(
      new Set([
        'none',
        'edit_once',
        'edit_twice_after_conflict_continue',
        'secondary_edit_only',
        'submit_once',
        'secondary_submit_only',
        'confirm_once',
        'secondary_confirm_only',
        'fixture_confirmation_conflict_touch_only',
        'fixture_forbidden_role_only',
      ]),
    );
  });
});
