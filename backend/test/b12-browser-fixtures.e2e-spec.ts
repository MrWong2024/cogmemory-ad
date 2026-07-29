import type { INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink } from 'fs/promises';
import type { Connection, Model } from 'mongoose';
import { tmpdir } from 'os';
import path from 'path';
import request from 'supertest';
import { parseB12Command } from '../scripts/b12-browser-fixtures';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import {
  Session,
  type SessionDocument,
} from '../src/modules/auth/schemas/session.schema';
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
  B12_AUDIT_IDS,
  B12_AUDIT_MATRIX,
  accountNameFor,
  assertB12Contract,
  assertB12StageTarget,
  auditMatrixFor,
  reportStateCountsFor,
  routeFor,
  routesFor,
  scenariosFor,
  subjectCodeFor,
  validateB12Namespace,
} from './support/b12-browser-fixtures/fixture-contract';
import { assertB12SafeManifest } from './support/b12-browser-fixtures/fixture-manifest';
import {
  createB12BrowserFixtureManager,
  isB12ProtectedCanonicalScaleVersion,
  type B12BrowserFixtureManager,
} from './support/b12-browser-fixtures/b12-browser-fixtures';
import {
  assertB12RuntimeDescriptor,
  removeB12RuntimeDescriptor,
  validateB12RuntimeOutputName,
  writeB12RuntimeDescriptor,
} from './support/b12-browser-fixtures/runtime-descriptor';
import {
  B12_ROLES,
  B12FixtureError,
  type B12Profile,
  type B12RuntimeDescriptor,
} from './support/b12-browser-fixtures/fixture-types';
import { requireInitialized } from './support/e2e-initialization';

jest.setTimeout(600000);

const CORE_NAMESPACE = 'b12c-e2e-contract';
const RESILIENCE_NAMESPACE = 'b12r-e2e-contract';

type SupertestApp = NonNullable<Parameters<typeof request.agent>[0]>;

function expectFixtureCode(action: () => void, code: string): void {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(B12FixtureError);
    if (error instanceof B12FixtureError) expect(error.code).toBe(code);
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

describe('B12 report-lock browser fixture support (e2e)', () => {
  let app: INestApplication;
  let server: SupertestApp;
  let connection: Connection;
  let manager: B12BrowserFixtureManager;
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
        versions: versions.filter(isB12ProtectedCanonicalScaleVersion),
      }),
    );
  }

  async function reportFor(
    profile: B12Profile,
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

  async function stage(input: {
    profile: B12Profile;
    namespace: string;
    scenarioKey: string;
    routeKey: string;
    transition: string;
  }) {
    return manager.stage({
      ...input,
      password: testPassword,
      role: 'doctor',
    });
  }

  async function withRawReportMutation(
    report: ClinicalReportDocument,
    update: Record<string, unknown>,
    verify: () => Promise<unknown>,
  ): Promise<void> {
    const original = await reportModel.collection.findOne({ _id: report._id });
    if (!original) throw new Error('Missing raw B12 report');
    try {
      await reportModel.collection.updateOne({ _id: report._id }, update);
      await expect(verify()).rejects.toBeInstanceOf(B12FixtureError);
    } finally {
      await reportModel.collection.replaceOne({ _id: report._id }, original);
    }
  }

  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      process.env.COGMEMORY_DATABASE_PURPOSE !== 'standard_test'
    ) {
      throw new Error('B12 fixture E2E requires standard_test isolation');
    }
    testPassword = `B12-${randomUUID()}-Aa1!`;
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
    manager = createB12BrowserFixtureManager(app);
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

  it('enforces the ordered 88-ID, 62/23/3 split, unique owners, and 22+11 fixed Browser routes', () => {
    expect(() => assertB12Contract()).not.toThrow();
    expect(B12_AUDIT_IDS).toHaveLength(88);
    expect(B12_AUDIT_MATRIX.map(({ auditId }) => auditId)).toEqual(
      B12_AUDIT_IDS,
    );
    expect(new Set(B12_AUDIT_IDS).size).toBe(88);
    expect(auditMatrixFor('core-workflow')).toHaveLength(62);
    expect(auditMatrixFor('resilience-security')).toHaveLength(23);
    expect(auditMatrixFor('static-gate')).toHaveLength(3);
    expect(
      B12_AUDIT_MATRIX.filter(({ ownerType }) => ownerType === 'browser_route'),
    ).toHaveLength(85);
    expect(
      B12_AUDIT_MATRIX.filter(({ ownerType }) => ownerType === 'static_gate'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ auditId: 'B12-86', routeKey: null }),
        expect.objectContaining({ auditId: 'B12-87', routeKey: null }),
        expect.objectContaining({ auditId: 'B12-88', routeKey: null }),
      ]),
    );
    expect(scenariosFor('core-workflow')).toHaveLength(5);
    expect(routesFor('core-workflow')).toHaveLength(22);
    expect(scenariosFor('resilience-security')).toHaveLength(6);
    expect(routesFor('resilience-security')).toHaveLength(11);
    expect(
      routesFor('core-workflow').filter(
        ({ boundaryType }) =>
          boundaryType === 'controlled_public_read_boundary',
      ),
    ).toHaveLength(4);
    expect(
      [...routesFor('core-workflow'), ...routesFor('resilience-security')]
        .flatMap(({ allowedStages }) => allowedStages)
        .sort(),
    ).toEqual([
      'forbidden-lock-role',
      'lock-audit-unavailable',
      'lock-conflict-latest-locked-touch',
      'lock-conflict-touch',
      'lock-metadata-unsupported',
    ]);
  });

  it('rejects arbitrary CLI values, unsafe scopes, and non-allowlisted Stage extensions', () => {
    expectFixtureCode(
      () =>
        parseB12Command([
          'prepare',
          '--profile',
          'core-workflow',
          '--namespace',
          CORE_NAMESPACE,
        ]),
      'B12_FIXTURE_PREPARE_CONFIRMATION_INVALID',
    );
    expectFixtureCode(
      () =>
        parseB12Command([
          'cleanup',
          '--profile',
          'core-workflow',
          '--namespace',
          CORE_NAMESPACE,
          '--report-id',
          '000000000000000000000000',
          '--confirm-cleanup-b12-namespace',
        ]),
      'B12_FIXTURE_ARGUMENT_INVALID',
    );
    expectFixtureCode(
      () => validateB12Namespace('core-workflow', RESILIENCE_NAMESPACE),
      'B12_FIXTURE_NAMESPACE_INVALID',
    );
    expectFixtureCode(
      () => validateB12RuntimeOutputName('../escape.json'),
      'B12_FIXTURE_RUNTIME_OUTPUT_NAME_INVALID',
    );
    expectFixtureCode(
      () =>
        assertB12StageTarget({
          profile: 'core-workflow',
          scenarioKey: 'conflict',
          routeKey: 'lock-conflict-continue',
          transition: 'arbitrary-script',
          role: 'doctor',
        }),
      'B12_FIXTURE_STAGE_TARGET_NOT_ALLOWED',
    );
  });

  it('prepares independent five-role profiles, exact roots, legal state matrices, and safe manifests', async () => {
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
    expect(() => assertB12SafeManifest(core)).not.toThrow();
    expect(() => assertB12SafeManifest(resilience)).not.toThrow();
    expect(core.resourceCounts).toEqual({
      users: 5,
      patients: 22,
      visits: 22,
      scaleInstances: 22,
      clinicalReports: 22,
      fixtureMarkers: 22,
    });
    expect(resilience.resourceCounts).toEqual({
      users: 5,
      patients: 11,
      visits: 11,
      scaleInstances: 11,
      clinicalReports: 11,
      fixtureMarkers: 11,
    });
    expect(core.reportStateCounts).toEqual({
      draft: 1,
      pending_confirmation: 1,
      confirmed_unlocked: 10,
      confirmed_quality_blocked: 1,
      confirmed_confirmation_missing: 1,
      confirmed_v1_visit_locked: 1,
      confirmed_v1_visit_voided: 1,
      confirmed_locked: 5,
      historical_locked_fallback: 1,
    });
    expect(resilience.reportStateCounts).toEqual(
      reportStateCountsFor('resilience-security'),
    );
    expect(core.roles).toEqual(B12_ROLES);
    expect(resilience.roles).toEqual(B12_ROLES);
    expect(JSON.stringify(core)).not.toMatch(
      /password|cookie|mongodb|navigationPath|metadata|lockNote|patientId|reportId/i,
    );

    const allPatients = await patientModel
      .find({
        'metadata.b12Fixture.namespace': {
          $in: [CORE_NAMESPACE, RESILIENCE_NAMESPACE],
        },
      })
      .exec();
    expect(allPatients).toHaveLength(33);
    expect(new Set(allPatients.map(({ _id }) => _id.toString())).size).toBe(33);
    const allReports = await reportModel
      .find({ patientId: { $in: allPatients.map(({ _id }) => _id) } })
      .exec();
    expect(allReports).toHaveLength(33);
    expect(new Set(allReports.map(({ _id }) => _id.toString())).size).toBe(33);
    expect(allReports.every(({ reportVersion }) => reportVersion === 1)).toBe(
      true,
    );
    expect(
      allReports.every(
        ({ archivedAt, correctionRecords, voidedAt }) =>
          archivedAt === null &&
          correctionRecords.length === 0 &&
          voidedAt === null,
      ),
    ).toBe(true);

    for (const routeValue of routesFor('core-workflow').filter(
      ({ boundaryType }) => boundaryType === 'controlled_public_read_boundary',
    )) {
      const report = await reportFor(
        'core-workflow',
        CORE_NAMESPACE,
        'eligibility-state',
        routeValue.key,
      );
      expect(report.status).toBe('confirmed');
      if (routeValue.preparedState === 'confirmed_locked') {
        expect(report.lockedAt).toBeInstanceOf(Date);
        expect(report.metadata?.a22Lock).toBeDefined();
      } else {
        expect(report.lockedAt).toBeNull();
        expect(report.metadata?.a22Lock).toBeUndefined();
      }
    }
  });

  it('keeps prepared verification read-only and rejects wrong passwords and incomplete post-browser progress', async () => {
    const before = await reportModel
      .find({ 'metadata.b12FixtureOwnership.namespace': CORE_NAMESPACE })
      .sort({ reportCode: 1 })
      .lean()
      .exec();
    await expect(
      manager.verify('core-workflow', CORE_NAMESPACE, testPassword, 'prepared'),
    ).resolves.toMatchObject({ phase: 'prepared' });
    await expect(
      manager.verify(
        'core-workflow',
        CORE_NAMESPACE,
        `${testPassword}-wrong`,
        'prepared',
      ),
    ).rejects.toMatchObject({ code: 'B12_FIXTURE_ACCOUNT_INVALID' });
    await expect(
      manager.verify(
        'core-workflow',
        CORE_NAMESPACE,
        testPassword,
        'post-browser',
      ),
    ).rejects.toBeInstanceOf(B12FixtureError);
    const after = await reportModel
      .find({ 'metadata.b12FixtureOwnership.namespace': CORE_NAMESPACE })
      .sort({ reportCode: 1 })
      .lean()
      .exec();
    expect(after).toEqual(before);
  });

  it('writes only the runtime whitelist and enforces basename, traversal, existing-target, and symlink safety', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'b12-runtime-'));
    try {
      const descriptor = await manager.resolveRuntimeDescriptor({
        profile: 'core-workflow',
        namespace: CORE_NAMESPACE,
        password: testPassword,
        scenarioKey: 'conflict',
        routeKey: 'lock-conflict-latest-locked',
        role: 'doctor',
      });
      expect(() => assertB12RuntimeDescriptor(descriptor)).not.toThrow();
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
      await writeB12RuntimeDescriptor(
        descriptor,
        'b12-runtime-contract.json',
        runtimeRoot,
      );
      const written = JSON.parse(
        await readFile(
          path.join(runtimeRoot, 'b12-runtime-contract.json'),
          'utf8',
        ),
      ) as B12RuntimeDescriptor;
      expect(written).toEqual(descriptor);
      await expect(
        writeB12RuntimeDescriptor(
          descriptor,
          'b12-runtime-contract.json',
          runtimeRoot,
        ),
      ).rejects.toMatchObject({ code: 'B12_FIXTURE_RUNTIME_TARGET_EXISTS' });
      expect(
        await removeB12RuntimeDescriptor(
          'b12-runtime-contract.json',
          runtimeRoot,
        ),
      ).toBe(true);
      expect(
        await removeB12RuntimeDescriptor(
          'b12-runtime-contract.json',
          runtimeRoot,
        ),
      ).toBe(false);
      const realDirectory = path.join(runtimeRoot, 'real-directory');
      const linkedDirectory = path.join(runtimeRoot, 'linked-directory');
      await mkdir(realDirectory);
      await symlink(realDirectory, linkedDirectory, 'junction');
      await expect(
        writeB12RuntimeDescriptor(
          descriptor,
          'b12-runtime-link.json',
          linkedDirectory,
        ),
      ).rejects.toMatchObject({ code: 'B12_FIXTURE_RUNTIME_DIRECTORY_UNSAFE' });
      expect((await lstat(linkedDirectory)).isSymbolicLink()).toBe(true);
    } finally {
      await rm(runtimeRoot, { recursive: true, force: true });
    }
  });

  it('allows only five exact idempotent Stages and restores prepared state through explicit replace', async () => {
    const coreFirst = await stage({
      profile: 'core-workflow',
      namespace: CORE_NAMESPACE,
      scenarioKey: 'conflict',
      routeKey: 'lock-conflict-continue',
      transition: 'lock-conflict-touch',
    });
    const coreSecond = await stage({
      profile: 'core-workflow',
      namespace: CORE_NAMESPACE,
      scenarioKey: 'conflict',
      routeKey: 'lock-conflict-continue',
      transition: 'lock-conflict-touch',
    });
    expect(coreFirst.alreadyStaged).toBe(false);
    expect(coreSecond.alreadyStaged).toBe(true);
    await expect(
      manager.verify('core-workflow', CORE_NAMESPACE, testPassword, 'prepared'),
    ).rejects.toBeInstanceOf(B12FixtureError);
    await manager.replace('core-workflow', CORE_NAMESPACE, testPassword);

    for (const target of [
      {
        scenarioKey: 'error-contract',
        routeKey: 'audit-unavailable',
        transition: 'lock-audit-unavailable',
      },
      {
        scenarioKey: 'error-contract',
        routeKey: 'metadata-unsupported',
        transition: 'lock-metadata-unsupported',
      },
      {
        scenarioKey: 'authorization',
        routeKey: 'forbidden-lock',
        transition: 'forbidden-lock-role',
      },
    ]) {
      const first = await stage({
        profile: 'resilience-security',
        namespace: RESILIENCE_NAMESPACE,
        ...target,
      });
      const second = await stage({
        profile: 'resilience-security',
        namespace: RESILIENCE_NAMESPACE,
        ...target,
      });
      expect(first.alreadyStaged).toBe(false);
      expect(second.alreadyStaged).toBe(true);
      await manager.replace(
        'resilience-security',
        RESILIENCE_NAMESPACE,
        testPassword,
      );
    }
  });

  it('accepts all legal core mutation classes and transition-aware Stage progress', async () => {
    await manager.simulateProductMutationForE2e({
      profile: 'core-workflow',
      namespace: CORE_NAMESPACE,
      password: testPassword,
      scenarioKey: 'success-idempotency',
      routeKey: 'doctor-lock-success',
    });
    await manager.simulateProductMutationForE2e({
      profile: 'core-workflow',
      namespace: CORE_NAMESPACE,
      password: testPassword,
      scenarioKey: 'success-idempotency',
      routeKey: 'admin-lock-success',
    });
    await stage({
      profile: 'core-workflow',
      namespace: CORE_NAMESPACE,
      scenarioKey: 'conflict',
      routeKey: 'lock-conflict-continue',
      transition: 'lock-conflict-touch',
    });
    await manager.simulateProductMutationForE2e({
      profile: 'core-workflow',
      namespace: CORE_NAMESPACE,
      password: testPassword,
      scenarioKey: 'conflict',
      routeKey: 'lock-conflict-continue',
    });
    await stage({
      profile: 'core-workflow',
      namespace: CORE_NAMESPACE,
      scenarioKey: 'conflict',
      routeKey: 'lock-conflict-latest-locked',
      transition: 'lock-conflict-latest-locked-touch',
    });
    await manager.simulateProductMutationForE2e({
      profile: 'core-workflow',
      namespace: CORE_NAMESPACE,
      password: testPassword,
      scenarioKey: 'conflict',
      routeKey: 'lock-conflict-latest-locked',
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

  it('accepts the three resilience fixture-only mutations with zero product lock writes', async () => {
    await stage({
      profile: 'resilience-security',
      namespace: RESILIENCE_NAMESPACE,
      scenarioKey: 'error-contract',
      routeKey: 'audit-unavailable',
      transition: 'lock-audit-unavailable',
    });
    await stage({
      profile: 'resilience-security',
      namespace: RESILIENCE_NAMESPACE,
      scenarioKey: 'error-contract',
      routeKey: 'metadata-unsupported',
      transition: 'lock-metadata-unsupported',
    });
    await stage({
      profile: 'resilience-security',
      namespace: RESILIENCE_NAMESPACE,
      scenarioKey: 'authorization',
      routeKey: 'forbidden-lock',
      transition: 'forbidden-lock-role',
    });
    await expect(
      manager.verify(
        'resilience-security',
        RESILIENCE_NAMESPACE,
        testPassword,
        'post-browser',
      ),
    ).resolves.toMatchObject({ phase: 'post-browser' });
    const reports = await reportModel
      .find({
        patientId: {
          $in: (
            await patientModel
              .find({ 'metadata.b12Fixture.namespace': RESILIENCE_NAMESPACE })
              .select({ _id: 1 })
              .lean()
              .exec()
          ).map(({ _id }) => _id),
        },
      })
      .exec();
    expect(
      reports.filter(
        ({ metadata }) =>
          typeof metadata === 'object' &&
          metadata !== null &&
          'a22Lock' in metadata,
      ),
    ).toHaveLength(0);
  });

  it('rejects missing, extra, wrong-actor, A23-A25, narrative, and root drift without repair', async () => {
    const doctorReport = await reportFor(
      'core-workflow',
      CORE_NAMESPACE,
      'success-idempotency',
      'doctor-lock-success',
    );
    const verifyCore = () =>
      manager.verify(
        'core-workflow',
        CORE_NAMESPACE,
        testPassword,
        'post-browser',
      );
    await withRawReportMutation(
      doctorReport,
      { $set: { 'metadata.a22Lock.lockedByRole': 'admin' } },
      verifyCore,
    );
    await withRawReportMutation(
      doctorReport,
      { $set: { 'metadata.a22Lock.extraAudit': true } },
      verifyCore,
    );
    await withRawReportMutation(
      doctorReport,
      { $set: { 'metadata.a23SourceFreeze': { version: 1 } } },
      verifyCore,
    );
    await withRawReportMutation(
      doctorReport,
      { $set: { 'narrative.chiefSummary': 'drift' } },
      verifyCore,
    );
    const patient = await patientModel.findById(doctorReport.patientId).exec();
    if (!patient) throw new Error('Missing B12 patient');
    const originalPatient = await patientModel.collection.findOne({
      _id: patient._id,
    });
    if (!originalPatient) throw new Error('Missing raw B12 patient');
    try {
      await patientModel.collection.updateOne(
        { _id: patient._id },
        { $set: { status: 'inactive' } },
      );
      await expect(verifyCore()).rejects.toBeInstanceOf(B12FixtureError);
    } finally {
      await patientModel.collection.replaceOne(
        { _id: patient._id },
        originalPatient,
      );
    }
    const visit = await visitModel
      .findById(doctorReport.assessmentVisitId)
      .exec();
    const instance = await instanceModel
      .findOne({ assessmentVisitId: doctorReport.assessmentVisitId })
      .exec();
    if (!visit || !instance) throw new Error('Missing B12 source roots');
    const originalVisit = await visitModel.collection.findOne({
      _id: visit._id,
    });
    const originalInstance = await instanceModel.collection.findOne({
      _id: instance._id,
    });
    if (!originalVisit || !originalInstance) {
      throw new Error('Missing raw B12 source roots');
    }
    try {
      await visitModel.collection.updateOne(
        { _id: visit._id },
        { $set: { notes: 'drift' } },
      );
      await expect(verifyCore()).rejects.toBeInstanceOf(B12FixtureError);
      await visitModel.collection.replaceOne({ _id: visit._id }, originalVisit);
      await instanceModel.collection.updateOne(
        { _id: instance._id },
        { $set: { notes: 'drift' } },
      );
      await expect(verifyCore()).rejects.toBeInstanceOf(B12FixtureError);
    } finally {
      await visitModel.collection.replaceOne({ _id: visit._id }, originalVisit);
      await instanceModel.collection.replaceOne(
        { _id: instance._id },
        originalInstance,
      );
    }
  });

  it('removes Sessions, roots, markers and runtime, preserves seed, and makes cleanup idempotent', async () => {
    const seedBefore = await canonicalSeedSnapshot();
    const agent = request.agent(server);
    await agent
      .post('/auth/login')
      .send({
        accountName: accountNameFor('core-workflow', CORE_NAMESPACE, 'doctor'),
        password: testPassword,
      })
      .expect(201);
    const doctor = await userModel.findOne({
      accountName: accountNameFor('core-workflow', CORE_NAMESPACE, 'doctor'),
    });
    expect(doctor).not.toBeNull();
    expect(
      await sessionModel.countDocuments({ userId: doctor?._id }),
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
        'metadata.b12Fixture.namespace': {
          $in: [CORE_NAMESPACE, RESILIENCE_NAMESPACE],
        },
      }),
    ).toBe(0);
  });

  it('keeps route lookup strict and all mutation classes explicit', () => {
    const productClasses = new Set<string>();
    const fixtureClasses = new Set<string>();
    for (const profile of ['core-workflow', 'resilience-security'] as const) {
      for (const scenario of scenariosFor(profile)) {
        for (const routeValue of scenario.routes) {
          expect(routeFor(profile, scenario.scenarioKey, routeValue.key)).toBe(
            routeValue,
          );
          productClasses.add(routeValue.expectedProductMutationClass);
          fixtureClasses.add(routeValue.expectedFixtureOwnedMutationClass);
        }
      }
    }
    expect(productClasses).toEqual(
      new Set([
        'none',
        'lock_once_doctor',
        'lock_once_admin',
        'already_locked_readonly',
        'fixture_touch_plus_lock_once',
        'fixture_touch_plus_secondary_lock_once',
      ]),
    );
    expect(fixtureClasses).toEqual(
      new Set([
        'none',
        'fixture_conflict_touch_only',
        'fixture_conflict_latest_locked_touch_only',
        'fixture_audit_unavailable_only',
        'fixture_metadata_unsupported_only',
        'fixture_forbidden_role_only',
      ]),
    );
  });
});
