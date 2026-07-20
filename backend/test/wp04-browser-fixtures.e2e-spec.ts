import type { INestApplicationContext } from '@nestjs/common';
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
import {
  AssessmentVisit,
  type AssessmentVisitDocument,
} from '../src/modules/assessments/schemas/assessment-visit.schema';
import { ClinicalHistoryQueryService } from '../src/modules/clinical-history/services/clinical-history-query.service';
import {
  Patient,
  type PatientDocument,
} from '../src/modules/patients/schemas/patient.schema';
import {
  User,
  type UserDocument,
} from '../src/modules/users/schemas/user.schema';
import {
  WP04_BUSINESS_SCENARIOS,
  WP04_ROLES,
  Wp04FixtureError,
  accountNameFor,
  assertWp04PreImportEnvironment,
  assertWp04RuntimeEnvironment,
  assertWp04SafeManifest,
  subjectCodeFor,
  validateWp04Namespace,
  visitCodeFor,
} from './support/wp04-browser-fixtures/fixture-contract';
import { WP04_HISTORY_SAME_DAY_VISIT_SUFFIXES } from './support/wp04-browser-fixtures/scenario-builders';
import {
  createWp04BrowserFixtureManager,
  type Wp04BrowserFixtureManager,
} from './support/wp04-browser-fixtures/wp04-browser-fixtures';

jest.setTimeout(240000);

const PRIMARY_NAMESPACE = 'wp04-e2e-main';
const SENTINEL_NAMESPACE = 'wp04-e2e-sentinel';
const CORRUPTION_NAMESPACE = 'wp04-e2e-same-day';
const TEST_PASSWORD = 'WP04-E2E-Isolated-Temporary!';

function historyPaginationDefinition() {
  const definition = WP04_BUSINESS_SCENARIOS.find(
    (scenario) => scenario.scenarioKey === 'history_pagination',
  );
  if (!definition) throw new Error('History pagination contract is missing');
  return definition;
}

function sameDayVisitCodes(namespace: string): string[] {
  const definition = historyPaginationDefinition();
  return WP04_HISTORY_SAME_DAY_VISIT_SUFFIXES.map((suffix) =>
    visitCodeFor(namespace, definition.ordinal, suffix),
  );
}

function expectFixtureCode(action: () => void, code: string): void {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(Wp04FixtureError);
    if (error instanceof Wp04FixtureError) expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected fixture error ${code}`);
}

describe('WP-04 browser fixture CLI support (e2e)', () => {
  let app: INestApplicationContext;
  let connection: Connection;
  let manager: Wp04BrowserFixtureManager;
  let userModel: Model<UserDocument>;
  let sessionModel: Model<SessionDocument>;
  let patientModel: Model<PatientDocument>;
  let visitModel: Model<AssessmentVisitDocument>;
  let historyService: ClinicalHistoryQueryService;

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('E2E requires NODE_ENV=test');
    }
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    connection = app.get<Connection>(getConnectionToken());
    const config = app.get(ConfigService);
    assertWp04RuntimeEnvironment({
      nodeEnv: process.env.NODE_ENV,
      appEnv: config.get<string>('app.env'),
      databaseName: connection.name,
      storageDriver: config.get<string>('storage.driver'),
      llmProvider: config.get<string>('llm.provider'),
      smsProvider: config.get<string>('smsAuth.provider'),
      sessionCookieSecure: config.get<boolean>('session.cookieSecure'),
    });
    manager = createWp04BrowserFixtureManager(app);
    userModel = app.get(getModelToken(User.name));
    sessionModel = app.get(getModelToken(Session.name));
    patientModel = app.get(getModelToken(Patient.name));
    visitModel = app.get(getModelToken(AssessmentVisit.name));
    historyService = app.get(ClinicalHistoryQueryService);
    await manager.cleanup(PRIMARY_NAMESPACE);
    await manager.cleanup(SENTINEL_NAMESPACE);
    await manager.cleanup(CORRUPTION_NAMESPACE);
  });

  afterAll(async () => {
    if (manager) {
      await manager.cleanup(PRIMARY_NAMESPACE);
      await manager.cleanup(SENTINEL_NAMESPACE);
      await manager.cleanup(CORRUPTION_NAMESPACE);
    }
    if (app) await app.close();
    if (connection?.readyState) await connection.close();
  });

  it('rejects unsafe environments, namespaces, CLI arguments, and manifest fields', () => {
    expect(validateWp04Namespace('valid-name-1')).toBe('valid-name-1');
    for (const value of [
      'ab',
      'Upper',
      'bad_name',
      '-bad',
      'bad-',
      'bad--name',
      '../bad',
    ]) {
      expect(() => validateWp04Namespace(value)).toThrow(Wp04FixtureError);
    }
    expectFixtureCode(
      () => assertWp04PreImportEnvironment('development'),
      'WP04_FIXTURE_TEST_ENV_REQUIRED',
    );
    expectFixtureCode(
      () =>
        assertWp04RuntimeEnvironment({
          nodeEnv: 'test',
          appEnv: 'test',
          databaseName: 'cogmemory_ad_dev',
          storageDriver: 'fake',
          llmProvider: 'stub',
          smsProvider: 'stub',
          sessionCookieSecure: false,
        }),
      'WP04_FIXTURE_TEST_DATABASE_REQUIRED',
    );
    expectFixtureCode(
      () => assertWp04SafeManifest({ passwordHash: 'forbidden' }),
      'WP04_FIXTURE_MANIFEST_UNSAFE',
    );

    const script = 'scripts/wp04-browser-fixtures.ts';
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
    expect(nonTest.stderr).toContain('WP04_FIXTURE_TEST_ENV_REQUIRED');
    const noCleanupConfirmation = spawnSync(
      process.execPath,
      [...common, 'cleanup', '--namespace', PRIMARY_NAMESPACE],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
        encoding: 'utf8',
      },
    );
    expect(noCleanupConfirmation.status).toBe(1);
    expect(noCleanupConfirmation.stderr).toContain(
      'WP04_FIXTURE_CLEANUP_CONFIRMATION_REQUIRED',
    );
    const commandLinePassword = spawnSync(
      process.execPath,
      [...common, 'verify', '--password', 'forbidden'],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
        encoding: 'utf8',
      },
    );
    expect(commandLinePassword.status).toBe(1);
    expect(commandLinePassword.stderr).toContain(
      'WP04_FIXTURE_ARGUMENT_INVALID',
    );
  });

  it('prepares and read-only verifies all 5 roles and 44 independent scenario keys', async () => {
    const manifest = await manager.prepare(PRIMARY_NAMESPACE, TEST_PASSWORD);
    expect(manifest.summary).toEqual({
      action: 'created',
      roleCount: 5,
      scenarioCount: 44,
      businessScenarioCount: 43,
    });
    expect(manifest.roles.map((role) => role.role)).toEqual(WP04_ROLES);
    expect(new Set(manifest.scenarios.map((item) => item.scenarioKey))).toEqual(
      new Set([
        'roles',
        ...WP04_BUSINESS_SCENARIOS.map((item) => item.scenarioKey),
      ]),
    );
    assertWp04SafeManifest(manifest);
    const historyDefinition = historyPaginationDefinition();
    const historyPatient = await patientModel
      .findOne({
        subjectCode: subjectCodeFor(
          PRIMARY_NAMESPACE,
          historyDefinition.ordinal,
        ),
      })
      .exec();
    expect(historyPatient).not.toBeNull();
    if (!historyPatient) throw new Error('History pagination patient missing');
    const expectedVisitCodes = sameDayVisitCodes(PRIMARY_NAMESPACE);
    const sameDayPair = await visitModel
      .find({
        patientId: historyPatient._id,
        visitCode: { $in: expectedVisitCodes },
      })
      .exec();
    expect(sameDayPair).toHaveLength(2);
    expect(sameDayPair[0].assessmentDate.getTime()).toBe(
      sameDayPair[1].assessmentDate.getTime(),
    );
    expect(sameDayPair[0]._id.equals(sameDayPair[1]._id)).toBe(false);
    expect(
      sameDayPair.every((visit) => visit.patientId.equals(historyPatient._id)),
    ).toBe(true);
    expect(new Set(sameDayPair.map((visit) => visit.visitCode)).size).toBe(2);
    const firstCreated = sameDayPair.find(
      (visit) => visit.visitCode === expectedVisitCodes[0],
    );
    const secondCreated = sameDayPair.find(
      (visit) => visit.visitCode === expectedVisitCodes[1],
    );
    expect(firstCreated).toBeDefined();
    expect(secondCreated).toBeDefined();
    if (!firstCreated || !secondCreated)
      throw new Error('Same-day Visit identities are incomplete');
    expect(
      secondCreated._id
        .toHexString()
        .localeCompare(firstCreated._id.toHexString()),
    ).toBeGreaterThan(0);
    const page20 = await historyService.listPatientAssessmentHistory(
      historyPatient._id.toString(),
      { page: 1, pageSize: 20 },
    );
    const page50 = await historyService.listPatientAssessmentHistory(
      historyPatient._id.toString(),
      { page: 1, pageSize: 50 },
    );
    const page100 = await historyService.listPatientAssessmentHistory(
      historyPatient._id.toString(),
      { page: 1, pageSize: 100 },
    );
    const page100Remainder = await historyService.listPatientAssessmentHistory(
      historyPatient._id.toString(),
      { page: 2, pageSize: 100 },
    );
    expect(page20).toEqual(
      expect.objectContaining({ total: 105, pageSize: 20 }),
    );
    expect(page20.items).toHaveLength(20);
    expect(page50.items).toHaveLength(50);
    expect(page100.items).toHaveLength(100);
    expect(page100Remainder.items).toHaveLength(5);
    const expectedDescending = [...sameDayPair]
      .sort((left, right) =>
        right._id.toHexString().localeCompare(left._id.toHexString()),
      )
      .map((visit) => visit.visitCode);
    const page20VisitCodes = page20.items.map((item) => item.visit.visitCode);
    const pairIndexes = expectedVisitCodes
      .map((visitCode) => page20VisitCodes.indexOf(visitCode))
      .sort((left, right) => left - right);
    expect(pairIndexes[0]).toBeGreaterThanOrEqual(0);
    expect(pairIndexes[1]).toBe(pairIndexes[0] + 1);
    expect(page20VisitCodes.slice(pairIndexes[0], pairIndexes[1] + 1)).toEqual(
      expectedDescending,
    );
    const source = manifest.scenarios.find(
      (item) => item.scenarioKey === 'trend_domain_mapping_source_changed',
    );
    const mode = manifest.scenarios.find(
      (item) => item.scenarioKey === 'trend_domain_mapping_mode_changed',
    );
    for (const scenario of [source, mode]) {
      expect(scenario).toEqual(
        expect.objectContaining({
          expectedComparisonStatus: 'comparable',
          expectedDomainComparisonStatus: 'unavailable',
          expectedDomainReasons: ['domain_source_incomplete'],
        }),
      );
      expect(scenario?.expectedDomainReasons).not.toContain(
        scenario?.scenarioKey.endsWith('source_changed')
          ? 'domain_mapping_source_changed'
          : 'domain_mapping_mode_changed',
      );
    }
    await expect(
      manager.prepare(PRIMARY_NAMESPACE, TEST_PASSWORD),
    ).rejects.toMatchObject({
      code: 'WP04_FIXTURE_NAMESPACE_EXISTS',
    });
    const verified = await manager.verify(PRIMARY_NAMESPACE, TEST_PASSWORD);
    expect(verified.summary.action).toBe('verified');
    const users = await userModel
      .find({
        accountName: {
          $in: WP04_ROLES.map((role) =>
            accountNameFor(PRIMARY_NAMESPACE, role),
          ),
        },
      })
      .select({ _id: 1 })
      .lean()
      .exec();
    expect(
      await sessionModel.countDocuments({
        userId: { $in: users.map((user) => user._id) },
      }),
    ).toBe(0);
  });

  it('detects a damaged same-day pair without repairing the isolated namespace', async () => {
    try {
      await manager.prepare(CORRUPTION_NAMESPACE, TEST_PASSWORD);
      const definition = historyPaginationDefinition();
      const patient = await patientModel
        .findOne({
          subjectCode: subjectCodeFor(CORRUPTION_NAMESPACE, definition.ordinal),
        })
        .exec();
      expect(patient).not.toBeNull();
      if (!patient) throw new Error('Corruption scenario patient missing');
      const visitCode = sameDayVisitCodes(CORRUPTION_NAMESPACE)[0];
      const visit = await visitModel.findOne({ visitCode }).exec();
      expect(visit).not.toBeNull();
      if (!visit) throw new Error('Corruption scenario Visit missing');
      const damagedTimestamp = new Date(visit.assessmentDate.getTime() - 1);
      await visitModel
        .updateOne(
          { _id: visit._id, patientId: patient._id },
          { $set: { assessmentDate: damagedTimestamp } },
        )
        .exec();
      await expect(
        manager.verify(CORRUPTION_NAMESPACE, TEST_PASSWORD),
      ).rejects.toMatchObject({
        code: 'WP04_HISTORY_SAME_DAY_FIXTURE_MISSING',
        scenarioKey: 'history_pagination',
      });
      const persisted = await visitModel.findOne({ visitCode }).exec();
      expect(persisted?.assessmentDate.getTime()).toBe(
        damagedTimestamp.getTime(),
      );
    } finally {
      const cleanup = await manager.cleanup(CORRUPTION_NAMESPACE);
      expect(cleanup.residualCount).toBe(0);
      const secondCleanup = await manager.cleanup(CORRUPTION_NAMESPACE);
      expect(secondCleanup).toEqual(
        expect.objectContaining({ matched: false, residualCount: 0 }),
      );
    }
  });

  it('does not repair corruption and keeps cleanup and replace namespace-scoped', async () => {
    const doctorName = accountNameFor(PRIMARY_NAMESPACE, 'doctor');
    await userModel
      .updateOne({ accountName: doctorName }, { $set: { status: 'disabled' } })
      .exec();
    await expect(
      manager.verify(PRIMARY_NAMESPACE, TEST_PASSWORD),
    ).rejects.toMatchObject({
      code: 'WP04_FIXTURE_ACCOUNT_INVALID',
    });
    expect(
      (await userModel.findOne({ accountName: doctorName }).lean().exec())
        ?.status,
    ).toBe('disabled');
    await userModel
      .updateOne({ accountName: doctorName }, { $set: { status: 'active' } })
      .exec();
    await manager.prepare(SENTINEL_NAMESPACE, TEST_PASSWORD);
    const firstCleanup = await manager.cleanup(PRIMARY_NAMESPACE);
    expect(firstCleanup.residualCount).toBe(0);
    expect(firstCleanup.matched).toBe(true);
    expect(
      await userModel.countDocuments({
        accountName: accountNameFor(SENTINEL_NAMESPACE, 'doctor'),
      }),
    ).toBe(1);
    const secondCleanup = await manager.cleanup(PRIMARY_NAMESPACE);
    expect(secondCleanup).toEqual(
      expect.objectContaining({ matched: false, residualCount: 0 }),
    );
    const replaced = await manager.replace(PRIMARY_NAMESPACE, TEST_PASSWORD);
    expect(replaced.summary).toEqual(
      expect.objectContaining({
        roleCount: 5,
        scenarioCount: 44,
        businessScenarioCount: 43,
      }),
    );
    expect(
      await userModel.countDocuments({
        accountName: accountNameFor(SENTINEL_NAMESPACE, 'doctor'),
      }),
    ).toBe(1);
  });
});
