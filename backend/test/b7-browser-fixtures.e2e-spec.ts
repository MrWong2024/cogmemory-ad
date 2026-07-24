import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import type { Connection, Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/services/auth.service';
import {
  ItemResponse,
  type ItemResponseDocument,
} from '../src/modules/assessments/schemas/item-response.schema';
import {
  ScaleInstance,
  type ScaleInstanceDocument,
} from '../src/modules/assessments/schemas/scale-instance.schema';
import {
  Patient,
  type PatientDocument,
} from '../src/modules/patients/schemas/patient.schema';
import {
  User,
  type UserDocument,
} from '../src/modules/users/schemas/user.schema';
import {
  B7_AUDIT_IDS,
  B7_BUSINESS_SCENARIOS,
  B7_ROLES,
  B7FixtureError,
  accountNameFor,
  assertB7Contract,
  assertB7PreImportEnvironment,
  assertB7RuntimeEnvironment,
  assertB7SafeManifest,
  requireB7FixturePassword,
  scenarioSubjectCodeFor,
  toB7SafeErrorPayload,
  validateB7Namespace,
} from './support/b7-browser-fixtures/fixture-contract';
import {
  createB7BrowserFixtureManager,
  type B7BrowserFixtureManager,
} from './support/b7-browser-fixtures/b7-browser-fixtures';

jest.setTimeout(300000);

const PRIMARY_NAMESPACE = 'b7-e2e-main';
const SENTINEL_NAMESPACE = 'b7-e2e-sentinel';

function expectFixtureCode(action: () => void, code: string): void {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(B7FixtureError);
    if (error instanceof B7FixtureError) {
      expect(error.code).toBe(code);
    }
    return;
  }
  throw new Error(`Expected fixture error ${code}`);
}

async function expectAsyncFixtureCode(
  action: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(B7FixtureError);
    if (error instanceof B7FixtureError) {
      expect(error.code).toBe(code);
    }
    return;
  }
  throw new Error(`Expected fixture error ${code}`);
}

describe('B7 browser fixture CLI support (e2e)', () => {
  let app: INestApplicationContext;
  let connection: Connection;
  let manager: B7BrowserFixtureManager;
  let authService: AuthService;
  let userModel: Model<UserDocument>;
  let patientModel: Model<PatientDocument>;
  let instanceModel: Model<ScaleInstanceDocument>;
  let itemModel: Model<ItemResponseDocument>;
  let testPassword: string;

  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      process.env.COGMEMORY_DATABASE_PURPOSE !== 'standard_test'
    ) {
      throw new Error('B7 fixture E2E requires standard_test isolation');
    }
    testPassword = `B7-${randomUUID()}-Aa1!`;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    connection = app.get<Connection>(getConnectionToken());
    const config = app.get(ConfigService);
    assertB7RuntimeEnvironment({
      nodeEnv: process.env.NODE_ENV,
      appEnv: config.get<string>('app.env'),
      databasePurpose: process.env.COGMEMORY_DATABASE_PURPOSE,
      databaseName: connection.name,
      storageDriver: config.get<string>('storage.driver'),
      llmProvider: config.get<string>('llm.provider'),
      smsProvider: config.get<string>('smsAuth.provider'),
      sessionCookieSecure: config.get<boolean>('session.cookieSecure'),
    });
    manager = createB7BrowserFixtureManager(app);
    authService = app.get(AuthService);
    userModel = app.get(getModelToken(User.name));
    patientModel = app.get(getModelToken(Patient.name));
    instanceModel = app.get(getModelToken(ScaleInstance.name));
    itemModel = app.get(getModelToken(ItemResponse.name));
    await manager.cleanup(PRIMARY_NAMESPACE);
    await manager.cleanup(SENTINEL_NAMESPACE);
  });

  afterAll(async () => {
    if (manager) {
      await manager.cleanup(PRIMARY_NAMESPACE);
      await manager.cleanup(SENTINEL_NAMESPACE);
    }
    if (app) {
      await app.close();
    }
    if (connection?.readyState) {
      await connection.close();
    }
  });

  it('enforces the exact contract, namespace, environment, CLI, and manifest gates', () => {
    expect(() => assertB7Contract()).not.toThrow();
    expect(B7_BUSINESS_SCENARIOS).toHaveLength(13);
    expect(B7_AUDIT_IDS).toHaveLength(40);
    const auditIds = B7_BUSINESS_SCENARIOS.flatMap(
      ({ primaryAuditIds }) => primaryAuditIds,
    );
    expect(auditIds).toHaveLength(40);
    expect(new Set(auditIds).size).toBe(40);
    expect(new Set(auditIds)).toEqual(new Set(B7_AUDIT_IDS));
    expect(B7_ROLES).toHaveLength(5);
    expect(() => assertB7PreImportEnvironment('test')).not.toThrow();
    expectFixtureCode(
      () => assertB7PreImportEnvironment('development'),
      'B7_FIXTURE_ENVIRONMENT_UNSAFE',
    );
    expectFixtureCode(
      () => validateB7Namespace('b456-forbidden'),
      'B7_FIXTURE_NAMESPACE_INVALID',
    );
    expectFixtureCode(
      () => validateB7Namespace('B7 Unsafe'),
      'B7_FIXTURE_NAMESPACE_INVALID',
    );
    expectFixtureCode(
      () => requireB7FixturePassword('short'),
      'B7_FIXTURE_PASSWORD_REQUIRED',
    );
    expect(() =>
      assertB7SafeManifest({
        namespace: PRIMARY_NAMESPACE,
        databaseName: 'cogmemory_ad_test',
        expectedSummary: 'safe',
      }),
    ).not.toThrow();
    expectFixtureCode(
      () =>
        assertB7SafeManifest({
          namespace: PRIMARY_NAMESPACE,
          databaseName: 'cogmemory_ad_test',
          passwordHash: 'unsafe',
        }),
      'B7_FIXTURE_MANIFEST_UNSAFE',
    );

    const cli = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-r',
        'tsconfig-paths/register',
        'scripts/b7-browser-fixtures.ts',
        'invalid',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, NODE_ENV: 'test' },
      },
    );
    expect(cli.status).toBe(1);
    expect(cli.stderr).toContain('B7_FIXTURE_COMMAND_INVALID');
    expect(cli.stderr).not.toContain(testPassword);

    const payload = toB7SafeErrorPayload(new Error('internal query details'));
    expect(payload).toEqual({
      ok: false,
      code: 'B7_FIXTURE_OPERATION_FAILED',
      message:
        'B7 browser fixture operation failed without exposing internal details',
    });
  });

  it('prepares and read-only verifies two isolated namespaces', async () => {
    const primary = await manager.prepare(PRIMARY_NAMESPACE, testPassword);
    const sentinel = await manager.prepare(SENTINEL_NAMESPACE, testPassword);
    for (const manifest of [primary, sentinel]) {
      expect(manifest.roles).toHaveLength(5);
      expect(manifest.scenarios).toHaveLength(13);
      expect(
        manifest.scenarios.flatMap(({ primaryAuditIds }) => primaryAuditIds),
      ).toHaveLength(40);
      expect(manifest.expectedSummary).toContain('scenarioKeys=14');
      expect(manifest.expectedSummary).toContain('scoreResults=11');
      expect(() => assertB7SafeManifest(manifest)).not.toThrow();
      expect(JSON.stringify(manifest)).not.toContain(testPassword);
    }
    const doctor = await userModel
      .findOne({ accountName: accountNameFor(PRIMARY_NAMESPACE, 'doctor') })
      .select('+passwordHash')
      .exec();
    expect(doctor).not.toBeNull();
    expect(
      doctor
        ? await authService.verifyPassword(testPassword, doctor.passwordHash)
        : false,
    ).toBe(true);
    expect(
      await patientModel.countDocuments({
        subjectCode: {
          $in: B7_BUSINESS_SCENARIOS.map(({ ordinal }) =>
            scenarioSubjectCodeFor(PRIMARY_NAMESPACE, ordinal),
          ),
        },
      }),
    ).toBe(13);
    const first = await manager.verify(
      PRIMARY_NAMESPACE,
      testPassword,
      'prepared',
    );
    const second = await manager.verify(
      PRIMARY_NAMESPACE,
      testPassword,
      'prepared',
    );
    expect(second).toEqual(first);
    await expectAsyncFixtureCode(
      () => manager.prepare(PRIMARY_NAMESPACE, testPassword),
      'B7_FIXTURE_NAMESPACE_EXISTS',
    );
  });

  it('verifies post-browser facts, real controlled conflict, and corruption detection without repair', async () => {
    await manager.simulateBrowserResultsForE2e(PRIMARY_NAMESPACE);
    const post = await manager.verify(
      PRIMARY_NAMESPACE,
      testPassword,
      'post-browser',
    );
    expect(post.expectedSummary).toContain('scoreResults=13');
    expect(post.expectedSummary).toContain('phase=post-browser');

    const sentinelPatient = await patientModel
      .findOne({ subjectCode: scenarioSubjectCodeFor(SENTINEL_NAMESPACE, 1) })
      .exec();
    const sentinelInstance = sentinelPatient
      ? await instanceModel.findOne({ patientId: sentinelPatient._id }).exec()
      : null;
    const item = sentinelInstance
      ? await itemModel
          .findOne({ scaleInstanceId: sentinelInstance._id })
          .exec()
      : null;
    if (!item) {
      throw new Error('Expected B7 corruption target');
    }
    await itemModel.deleteOne({ _id: item._id }).exec();
    const countBefore = await itemModel.countDocuments({
      scaleInstanceId: sentinelInstance?._id,
    });
    await expectAsyncFixtureCode(
      () => manager.verify(SENTINEL_NAMESPACE, testPassword, 'prepared'),
      'B7_FIXTURE_ITEM_MATRIX_INVALID',
    );
    expect(
      await itemModel.countDocuments({
        scaleInstanceId: sentinelInstance?._id,
      }),
    ).toBe(countBefore);
    expect(await itemModel.findById(item._id).exec()).toBeNull();
  });

  it('keeps cleanup idempotent and namespace-scoped and replace explicit', async () => {
    const sentinelCount = await patientModel.countDocuments({
      subjectCode: {
        $in: B7_BUSINESS_SCENARIOS.map(({ ordinal }) =>
          scenarioSubjectCodeFor(SENTINEL_NAMESPACE, ordinal),
        ),
      },
    });
    const first = await manager.cleanup(PRIMARY_NAMESPACE);
    const second = await manager.cleanup(PRIMARY_NAMESPACE);
    expect(first.expectedSummary).toContain('residualCount=0');
    expect(first.expectedSummary).toContain('matched=true');
    expect(second.expectedSummary).toContain('residualCount=0');
    expect(second.expectedSummary).toContain('matched=false');
    expect(
      await patientModel.countDocuments({
        subjectCode: {
          $in: B7_BUSINESS_SCENARIOS.map(({ ordinal }) =>
            scenarioSubjectCodeFor(SENTINEL_NAMESPACE, ordinal),
          ),
        },
      }),
    ).toBe(sentinelCount);

    const replaced = await manager.replace(PRIMARY_NAMESPACE, testPassword);
    expect(replaced.expectedSummary).toContain('phase=prepared');
    await manager.verify(PRIMARY_NAMESPACE, testPassword, 'prepared');
    expect(
      (await manager.cleanup(PRIMARY_NAMESPACE)).expectedSummary,
    ).toContain('residualCount=0');
    expect(
      (await manager.cleanup(SENTINEL_NAMESPACE)).expectedSummary,
    ).toContain('residualCount=0');
  });
});
