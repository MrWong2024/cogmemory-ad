import { HttpException, type INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { spawnSync } from 'child_process';
import type { Connection, Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  Session,
  type SessionDocument,
} from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
import {
  AssessmentVisit,
  type AssessmentVisitDocument,
} from '../src/modules/assessments/schemas/assessment-visit.schema';
import {
  ItemResponse,
  type ItemResponseDocument,
} from '../src/modules/assessments/schemas/item-response.schema';
import {
  ScaleInstance,
  type ScaleInstanceDocument,
} from '../src/modules/assessments/schemas/scale-instance.schema';
import { AssessmentScaleWorkflowService } from '../src/modules/assessments/services/assessment-scale-workflow.service';
import { AssessmentsService } from '../src/modules/assessments/services/assessments.service';
import {
  Patient,
  type PatientDocument,
} from '../src/modules/patients/schemas/patient.schema';
import { PatientsService } from '../src/modules/patients/services/patients.service';
import { ScaleCatalogService } from '../src/modules/scales/services/scale-catalog.service';
import {
  User,
  type UserDocument,
} from '../src/modules/users/schemas/user.schema';
import {
  B123_BUSINESS_SCENARIOS,
  B123_DIRECT_AUDIT_IDS,
  B123_EXCLUDED_AUDIT_IDS,
  B123_ROLES,
  B123FixtureError,
  accountNameFor,
  assertB123PreImportEnvironment,
  assertB123RuntimeEnvironment,
  assertB123SafeManifest,
  browserPatientSubjectCodeFor,
  browserVisitCodeFor,
  failedVisitCodeFor,
  scenarioSubjectCodeFor,
  scenarioVisitCodeFor,
  validateB123Namespace,
} from './support/b123-browser-fixtures/fixture-contract';
import {
  B123_MMSE_ITEM_COUNT,
  B123_MOCA_ITEM_COUNT,
  B123_PATIENT_DEFAULT_PAGE_SIZE,
  B123_PATIENT_LIST_EXTRA_COUNT,
  archivedPatientSubjectCodeFor,
} from './support/b123-browser-fixtures/scenario-builders';
import {
  createB123BrowserFixtureManager,
  type B123BrowserFixtureManager,
} from './support/b123-browser-fixtures/b123-browser-fixtures';

jest.setTimeout(240000);

const PRIMARY_NAMESPACE = 'b123-e2e-main';
const SENTINEL_NAMESPACE = 'b123-e2e-sentinel';
const TEST_PASSWORD = 'B123-E2E-Isolated-Temporary!';

function businessCode(error: unknown): string | null {
  if (!(error instanceof HttpException)) return null;
  const response = error.getResponse();
  if (typeof response !== 'object' || response === null) return null;
  const code = (response as Record<string, unknown>).code;
  return typeof code === 'string' ? code : null;
}

async function expectBusinessCode(
  action: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await action();
  } catch (error: unknown) {
    expect(businessCode(error)).toBe(code);
    return;
  }
  throw new Error(`Expected business error ${code}`);
}

function expectFixtureCode(action: () => void, code: string): void {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(B123FixtureError);
    if (error instanceof B123FixtureError) expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected fixture error ${code}`);
}

describe('B1-B3 browser fixture CLI support (e2e)', () => {
  let app: INestApplicationContext;
  let connection: Connection;
  let manager: B123BrowserFixtureManager;
  let authService: AuthService;
  let patientsService: PatientsService;
  let assessmentsService: AssessmentsService;
  let scaleCatalogService: ScaleCatalogService;
  let scaleWorkflow: AssessmentScaleWorkflowService;
  let userModel: Model<UserDocument>;
  let sessionModel: Model<SessionDocument>;
  let patientModel: Model<PatientDocument>;
  let visitModel: Model<AssessmentVisitDocument>;
  let scaleInstanceModel: Model<ScaleInstanceDocument>;
  let itemResponseModel: Model<ItemResponseDocument>;

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('E2E requires NODE_ENV=test');
    }
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    connection = app.get<Connection>(getConnectionToken());
    const config = app.get(ConfigService);
    assertB123RuntimeEnvironment({
      nodeEnv: process.env.NODE_ENV,
      appEnv: config.get<string>('app.env'),
      databaseName: connection.name,
      storageDriver: config.get<string>('storage.driver'),
      llmProvider: config.get<string>('llm.provider'),
      smsProvider: config.get<string>('smsAuth.provider'),
      sessionCookieSecure: config.get<boolean>('session.cookieSecure'),
    });
    manager = createB123BrowserFixtureManager(app);
    authService = app.get(AuthService);
    patientsService = app.get(PatientsService);
    assessmentsService = app.get(AssessmentsService);
    scaleCatalogService = app.get(ScaleCatalogService);
    scaleWorkflow = app.get(AssessmentScaleWorkflowService);
    userModel = app.get(getModelToken(User.name));
    sessionModel = app.get(getModelToken(Session.name));
    patientModel = app.get(getModelToken(Patient.name));
    visitModel = app.get(getModelToken(AssessmentVisit.name));
    scaleInstanceModel = app.get(getModelToken(ScaleInstance.name));
    itemResponseModel = app.get(getModelToken(ItemResponse.name));
    await manager.cleanup(PRIMARY_NAMESPACE);
    await manager.cleanup(SENTINEL_NAMESPACE);
  });

  afterAll(async () => {
    if (manager) {
      await manager.cleanup(PRIMARY_NAMESPACE);
      await manager.cleanup(SENTINEL_NAMESPACE);
    }
    if (app) await app.close();
    if (connection?.readyState) await connection.close();
  });

  it('enforces the exact audit contract and all pre-import safety gates', () => {
    const keys = [
      'roles',
      ...B123_BUSINESS_SCENARIOS.map((scenario) => scenario.scenarioKey),
    ];
    const auditIds = B123_BUSINESS_SCENARIOS.flatMap((scenario) => [
      ...scenario.auditIds,
    ]);
    const excluded = [
      ...B123_EXCLUDED_AUDIT_IDS.covered,
      ...B123_EXCLUDED_AUDIT_IDS.human,
      ...B123_EXCLUDED_AUDIT_IDS.obsolete,
    ];
    expect(keys).toHaveLength(27);
    expect(new Set(keys).size).toBe(27);
    expect(B123_BUSINESS_SCENARIOS).toHaveLength(26);
    expect(auditIds).toHaveLength(58);
    expect(new Set(auditIds).size).toBe(58);
    expect(B123_DIRECT_AUDIT_IDS).toHaveLength(21);
    const direct = new Set<string>(B123_DIRECT_AUDIT_IDS);
    const excludedIds = new Set<string>(excluded);
    expect(auditIds.filter((id) => !direct.has(id))).toHaveLength(37);
    expect(auditIds.filter((id) => excludedIds.has(id))).toEqual([]);

    expect(validateB123Namespace('valid-name-1')).toBe('valid-name-1');
    for (const value of [
      'ab',
      'Upper',
      'bad_name',
      '-bad',
      'bad-',
      'bad--name',
      '../bad',
    ]) {
      expect(() => validateB123Namespace(value)).toThrow(B123FixtureError);
    }
    expectFixtureCode(
      () => assertB123PreImportEnvironment('development'),
      'B123_FIXTURE_TEST_ENV_REQUIRED',
    );
    expectFixtureCode(
      () =>
        assertB123RuntimeEnvironment({
          nodeEnv: 'test',
          appEnv: 'test',
          databaseName: 'cogmemory_ad_prod',
          storageDriver: 'fake',
          llmProvider: 'stub',
          smsProvider: 'stub',
          sessionCookieSecure: false,
        }),
      'B123_FIXTURE_TEST_DATABASE_REQUIRED',
    );
    expectFixtureCode(
      () => assertB123SafeManifest({ passwordHash: 'forbidden' }),
      'B123_FIXTURE_MANIFEST_UNSAFE',
    );
    expect(() =>
      assertB123SafeManifest({
        route: '/patients/64b000000000000000000001',
        testInput: { value: 'safe' },
      }),
    ).not.toThrow();

    const script = 'scripts/b123-browser-fixtures.ts';
    const common = [
      '-r',
      'ts-node/register',
      '-r',
      'tsconfig-paths/register',
      script,
    ];
    const nonTest = spawnSync(process.execPath, [...common, 'prepare'], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'development' },
      encoding: 'utf8',
    });
    expect(nonTest.status).toBe(1);
    expect(nonTest.stderr).toContain('B123_FIXTURE_TEST_ENV_REQUIRED');
    const missingPassword = spawnSync(
      process.execPath,
      [...common, 'prepare', '--namespace', PRIMARY_NAMESPACE],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test', B123_FIXTURE_PASSWORD: '' },
        encoding: 'utf8',
      },
    );
    expect(missingPassword.status).toBe(1);
    expect(missingPassword.stderr).toContain('B123_FIXTURE_PASSWORD_REQUIRED');
    const cleanupWithoutConfirmation = spawnSync(
      process.execPath,
      [...common, 'cleanup', '--namespace', PRIMARY_NAMESPACE],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
        encoding: 'utf8',
      },
    );
    expect(cleanupWithoutConfirmation.status).toBe(1);
    expect(cleanupWithoutConfirmation.stderr).toContain(
      'B123_FIXTURE_CLEANUP_CONFIRMATION_REQUIRED',
    );
    const replaceWithoutConfirmation = spawnSync(
      process.execPath,
      [...common, 'replace', '--namespace', PRIMARY_NAMESPACE],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
        encoding: 'utf8',
      },
    );
    expect(replaceWithoutConfirmation.status).toBe(1);
    expect(replaceWithoutConfirmation.stderr).toContain(
      'B123_FIXTURE_REPLACE_CONFIRMATION_REQUIRED',
    );
    const forbiddenPasswordArgument = spawnSync(
      process.execPath,
      [...common, 'verify', '--password', 'forbidden'],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
        encoding: 'utf8',
      },
    );
    expect(forbiddenPasswordArgument.status).toBe(1);
    expect(forbiddenPasswordArgument.stderr).toContain(
      'B123_FIXTURE_ARGUMENT_INVALID',
    );
  });

  it('prepares two namespaces and read-only verifies roles, pagination, states, and real skeletons', async () => {
    const primary = await manager.prepare(PRIMARY_NAMESPACE, TEST_PASSWORD);
    expect(primary.summary).toEqual({
      action: 'created',
      phase: 'prepared',
      roleCount: 5,
      scenarioCount: 27,
      businessScenarioCount: 26,
      auditIdCount: 58,
      browserDirectCount: 21,
      fixtureRequiredCount: 37,
    });
    expect(primary.roles.map((entry) => entry.role)).toEqual(B123_ROLES);
    expect(
      new Set(primary.scenarios.map((entry) => entry.scenarioKey)).size,
    ).toBe(27);
    expect(primary.scenarios.every((entry) => !('password' in entry))).toBe(
      true,
    );
    assertB123SafeManifest(primary);

    const patientsListScenario = primary.scenarios.find(
      (entry) => entry.scenarioKey === 'patients_list_matrix',
    );
    expect(patientsListScenario).toEqual(
      expect.objectContaining({
        purpose:
          'Patient pagination, keyword, status, source type, and stable ordering',
        auditIds: ['B2-MV-001', 'B2-MV-002', 'B2-MV-024', 'B2-MV-025'],
        expectedSummary:
          'The fixture exceeds the real default page size and provides keyword, status, source type, total, and stable-ordering evidence',
        testInput: {
          defaultPageSize: B123_PATIENT_DEFAULT_PAGE_SIZE,
          preparedListRowCount: B123_PATIENT_LIST_EXTRA_COUNT,
        },
      }),
    );
    expect(patientsListScenario?.testInput).not.toHaveProperty('tagKeyword');

    const patientCreateScenario = primary.scenarios.find(
      (entry) => entry.scenarioKey === 'patient_create_matrix',
    );
    expect(patientCreateScenario?.testInput?.tagsInput).toBe(
      '记忆门诊， 随访\n记忆门诊,研究',
    );
    expect(patientCreateScenario?.testInput?.expectedTags).toEqual([
      '记忆门诊',
      '随访',
      '研究',
    ]);

    const pageOne = await patientsService.listPatients({
      page: 1,
      pageSize: B123_PATIENT_DEFAULT_PAGE_SIZE,
      keyword: `B123-${PRIMARY_NAMESPACE.toUpperCase()}-07-PAGE-`,
    });
    const pageTwo = await patientsService.listPatients({
      page: 2,
      pageSize: B123_PATIENT_DEFAULT_PAGE_SIZE,
      keyword: `B123-${PRIMARY_NAMESPACE.toUpperCase()}-07-PAGE-`,
    });
    expect(pageOne.total).toBe(B123_PATIENT_LIST_EXTRA_COUNT);
    expect(pageOne.items).toHaveLength(B123_PATIENT_DEFAULT_PAGE_SIZE);
    expect(pageTwo.items).toHaveLength(
      B123_PATIENT_LIST_EXTRA_COUNT - B123_PATIENT_DEFAULT_PAGE_SIZE,
    );

    const duplicatePatient = await patientModel
      .findOne({ subjectCode: scenarioSubjectCodeFor(PRIMARY_NAMESPACE, 20) })
      .exec();
    expect(duplicatePatient).not.toBeNull();
    if (!duplicatePatient)
      throw new Error('Duplicate scenario Patient missing');
    const instances = await scaleInstanceModel
      .find({ patientId: duplicatePatient._id })
      .sort({ scaleCode: 1 })
      .exec();
    expect(instances.map((entry) => entry.scaleCode)).toEqual(['mmse', 'moca']);
    const itemCounts = await Promise.all(
      instances.map((entry) =>
        itemResponseModel.countDocuments({ scaleInstanceId: entry._id }),
      ),
    );
    expect(itemCounts).toEqual([B123_MMSE_ITEM_COUNT, B123_MOCA_ITEM_COUNT]);

    const users = await userModel
      .find({
        accountName: {
          $in: B123_ROLES.map((role) =>
            accountNameFor(PRIMARY_NAMESPACE, role),
          ),
        },
      })
      .select({ _id: 1 })
      .lean()
      .exec();
    expect(users).toHaveLength(5);
    expect(
      await sessionModel.countDocuments({
        userId: { $in: users.map((entry) => entry._id) },
      }),
    ).toBe(0);
    const verified = await manager.verify(PRIMARY_NAMESPACE, TEST_PASSWORD);
    expect(verified.summary.action).toBe('verified');
    expect(
      await sessionModel.countDocuments({
        userId: { $in: users.map((entry) => entry._id) },
      }),
    ).toBe(0);
    await expect(
      manager.prepare(PRIMARY_NAMESPACE, TEST_PASSWORD),
    ).rejects.toMatchObject({ code: 'B123_FIXTURE_NAMESPACE_EXISTS' });

    await manager.prepare(SENTINEL_NAMESPACE, TEST_PASSWORD);
    expect(
      await userModel.countDocuments({
        accountName: accountNameFor(SENTINEL_NAMESPACE, 'doctor'),
      }),
    ).toBe(1);
  });

  it('arms and restores only the three controlled real business states', async () => {
    const doctor = await userModel
      .findOne({ accountName: accountNameFor(PRIMARY_NAMESPACE, 'doctor') })
      .exec();
    expect(doctor).not.toBeNull();
    if (!doctor) throw new Error('Doctor fixture account missing');
    const session = await authService.createSessionForUser({
      userId: doctor._id.toString(),
      userAgent: 'b123-e2e',
      ipAddress: '127.0.0.1',
    });
    expect(session).not.toBeNull();
    if (!session) throw new Error('Session fixture could not be created');
    expect(
      await authService.validateSessionToken(session.rawToken),
    ).not.toBeNull();
    const armedSession = await manager.transition(
      PRIMARY_NAMESPACE,
      'dashboard_session_matrix',
      'arm',
    );
    expect(armedSession.changedCount).toBe(1);
    expect(await authService.validateSessionToken(session.rawToken)).toBeNull();
    const restoredSession = await manager.transition(
      PRIMARY_NAMESPACE,
      'dashboard_session_matrix',
      'restore',
    );
    expect(restoredSession.changedCount).toBe(1);
    expect(
      await authService.validateSessionToken(session.rawToken),
    ).not.toBeNull();
    expect(
      (
        await manager.transition(
          PRIMARY_NAMESPACE,
          'dashboard_session_matrix',
          'restore',
        )
      ).changedCount,
    ).toBe(0);

    await manager.transition(PRIMARY_NAMESPACE, 'catalog_error_matrix', 'arm');
    await expectBusinessCode(
      () => scaleCatalogService.ensureSeedScaleVersionMaterialized('mmse'),
      'SCALE_CATALOG_VERSION_CONFLICT',
    );
    await manager.transition(
      PRIMARY_NAMESPACE,
      'catalog_error_matrix',
      'restore',
    );
    expect(
      (
        await manager.transition(
          PRIMARY_NAMESPACE,
          'catalog_error_matrix',
          'restore',
        )
      ).changedCount,
    ).toBe(0);
    await expect(
      scaleCatalogService.ensureSeedScaleVersionMaterialized('mmse'),
    ).resolves.toMatchObject({ scaleCode: 'mmse' });

    await manager.transition(PRIMARY_NAMESPACE, 'scale_unavailable', 'arm');
    await expectBusinessCode(
      () => scaleCatalogService.ensureSeedScaleVersionMaterialized('moca'),
      'SCALE_NOT_ACTIVE',
    );
    await manager.transition(PRIMARY_NAMESPACE, 'scale_unavailable', 'restore');
    expect(
      (
        await manager.transition(
          PRIMARY_NAMESPACE,
          'scale_unavailable',
          'restore',
        )
      ).changedCount,
    ).toBe(0);
    await expect(
      scaleCatalogService.ensureSeedScaleVersionMaterialized('moca'),
    ).resolves.toMatchObject({ scaleCode: 'moca' });
    expect(
      await userModel.countDocuments({
        accountName: accountNameFor(SENTINEL_NAMESPACE, 'doctor'),
      }),
    ).toBe(1);
    await expect(
      manager.verify(PRIMARY_NAMESPACE, TEST_PASSWORD),
    ).resolves.toMatchObject({ summary: { phase: 'prepared' } });
  });

  it('verifies simulated Browser writes, rejects side effects, and cleans or replaces one namespace only', async () => {
    const doctor = await userModel
      .findOne({ accountName: accountNameFor(PRIMARY_NAMESPACE, 'doctor') })
      .exec();
    const visitPatient = await patientModel
      .findOne({ subjectCode: scenarioSubjectCodeFor(PRIMARY_NAMESPACE, 11) })
      .exec();
    const initializationPatient = await patientModel
      .findOne({ subjectCode: scenarioSubjectCodeFor(PRIMARY_NAMESPACE, 19) })
      .exec();
    const initializationVisit = initializationPatient
      ? await visitModel
          .findOne({ patientId: initializationPatient._id })
          .exec()
      : null;
    if (
      !doctor ||
      !visitPatient ||
      !initializationPatient ||
      !initializationVisit
    ) {
      throw new Error('Browser mutation roots are incomplete');
    }
    await patientsService.createPatient({
      subjectCode: browserPatientSubjectCodeFor(PRIMARY_NAMESPACE),
      displayName: 'B1-B3 脱敏新建受试者',
      birthDate: new Date('1980-02-29T00:00:00.000Z'),
      sourceType: 'research',
      sex: 'unknown',
      educationYears: 12,
      handedness: 'right',
      tags: ['记忆门诊', '随访', '研究'],
    });
    await assessmentsService.createVisitForPatient(visitPatient._id, {
      visitCode: browserVisitCodeFor(PRIMARY_NAMESPACE),
      visitType: 'follow_up',
      assessmentDate: new Date('2026-08-15T01:30:00.000Z'),
      operatorSnapshot: {
        operatorId: doctor._id.toString(),
        operatorName: doctor.displayName,
        operatorRole: 'doctor',
      },
    });
    const operator = {
      operatorId: doctor._id.toString(),
      operatorName: doctor.displayName,
      operatorRole: 'doctor' as const,
    };
    await scaleWorkflow.initializeScaleInstance(
      initializationPatient._id.toString(),
      initializationVisit._id.toString(),
      { scaleCode: 'mmse', administrationMode: 'clinician_administered' },
      operator,
    );
    await scaleWorkflow.initializeScaleInstance(
      initializationPatient._id.toString(),
      initializationVisit._id.toString(),
      { scaleCode: 'moca', administrationMode: 'supervised_patient_input' },
      operator,
    );

    await expectBusinessCode(
      () =>
        patientsService.createPatient({
          subjectCode: scenarioSubjectCodeFor(PRIMARY_NAMESPACE, 9),
        }),
      'PATIENT_SUBJECT_CODE_CONFLICT',
    );
    await expectBusinessCode(
      () =>
        assessmentsService.createVisitForPatient(visitPatient._id, {
          visitCode: scenarioVisitCodeFor(PRIMARY_NAMESPACE, 12, 'DUPLICATE'),
          assessmentDate: new Date('2026-08-16T01:30:00.000Z'),
          operatorSnapshot: operator,
        }),
      'VISIT_CODE_CONFLICT',
    );
    await expectBusinessCode(
      () =>
        scaleWorkflow.initializeScaleInstance(
          initializationPatient._id.toString(),
          initializationVisit._id.toString(),
          { scaleCode: 'mmse', administrationMode: 'clinician_administered' },
          operator,
        ),
      'SCALE_INSTANCE_ALREADY_EXISTS',
    );
    const inactivePatient = await patientModel
      .findOne({ subjectCode: scenarioSubjectCodeFor(PRIMARY_NAMESPACE, 13) })
      .exec();
    if (!inactivePatient) throw new Error('Inactive Patient root missing');
    await expectBusinessCode(
      () =>
        assessmentsService.createVisitForPatient(inactivePatient._id, {
          visitCode: failedVisitCodeFor(PRIMARY_NAMESPACE),
          assessmentDate: new Date('2026-08-17T01:30:00.000Z'),
          operatorSnapshot: operator,
        }),
      'PATIENT_NOT_ACTIVE',
    );
    expect(
      await visitModel.countDocuments({
        visitCode: failedVisitCodeFor(PRIMARY_NAMESPACE),
      }),
    ).toBe(0);

    const postBrowser = await manager.verify(
      PRIMARY_NAMESPACE,
      TEST_PASSWORD,
      'post-browser',
    );
    expect(postBrowser.summary.phase).toBe('post-browser');
    expect(
      await patientModel.countDocuments({
        subjectCode: browserPatientSubjectCodeFor(PRIMARY_NAMESPACE),
      }),
    ).toBe(1);
    expect(
      await visitModel.countDocuments({
        visitCode: browserVisitCodeFor(PRIMARY_NAMESPACE),
      }),
    ).toBe(1);

    await manager.transition(PRIMARY_NAMESPACE, 'scale_unavailable', 'arm');
    const firstCleanup = await manager.cleanup(PRIMARY_NAMESPACE);
    expect(firstCleanup).toEqual(
      expect.objectContaining({ matched: true, residualCount: 0 }),
    );
    await expect(
      scaleCatalogService.ensureSeedScaleVersionMaterialized('moca'),
    ).resolves.toMatchObject({ scaleCode: 'moca' });
    const secondCleanup = await manager.cleanup(PRIMARY_NAMESPACE);
    expect(secondCleanup).toEqual(
      expect.objectContaining({ matched: false, residualCount: 0 }),
    );
    expect(
      await patientModel.countDocuments({
        subjectCode: archivedPatientSubjectCodeFor(PRIMARY_NAMESPACE),
      }),
    ).toBe(0);
    expect(
      await userModel.countDocuments({
        accountName: accountNameFor(SENTINEL_NAMESPACE, 'doctor'),
      }),
    ).toBe(1);
    const replaced = await manager.replace(PRIMARY_NAMESPACE, TEST_PASSWORD);
    expect(replaced.summary).toEqual(
      expect.objectContaining({
        phase: 'prepared',
        roleCount: 5,
        scenarioCount: 27,
        businessScenarioCount: 26,
        auditIdCount: 58,
      }),
    );
    expect(
      await userModel.countDocuments({
        accountName: accountNameFor(SENTINEL_NAMESPACE, 'doctor'),
      }),
    ).toBe(1);
  });

  it('verify reports corruption without repairing it', async () => {
    const doctorName = accountNameFor(PRIMARY_NAMESPACE, 'doctor');
    await userModel
      .updateOne({ accountName: doctorName }, { $set: { status: 'disabled' } })
      .exec();
    await expect(
      manager.verify(PRIMARY_NAMESPACE, TEST_PASSWORD),
    ).rejects.toMatchObject({ code: 'B123_FIXTURE_ACCOUNT_INVALID' });
    expect(
      (await userModel.findOne({ accountName: doctorName }).lean().exec())
        ?.status,
    ).toBe('disabled');
    await userModel
      .updateOne({ accountName: doctorName }, { $set: { status: 'active' } })
      .exec();
  });
});
