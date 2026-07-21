import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import { readFile, stat } from 'fs/promises';
import type { Connection, Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  Session,
  type SessionDocument,
} from '../src/modules/auth/schemas/session.schema';
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
  B456_AUDIT_EVIDENCE,
  B456_AUTOMATED_BOUNDARY_AUDIT_IDS,
  B456_BUSINESS_SCENARIOS,
  B456_DIRECT_AUDIT_IDS,
  B456_EXCLUDED_AUDIT_IDS,
  B456_ROLES,
  B456FixtureError,
  accountNameFor,
  assertB456Contract,
  assertB456PreImportEnvironment,
  assertB456RuntimeEnvironment,
  assertB456SafeManifest,
  requireB456FixturePassword,
  scenarioSubjectCodeFor,
  toB456SafeErrorPayload,
  validateB456Namespace,
} from './support/b456-browser-fixtures/fixture-contract';
import {
  B456_IMAGE_FILE_EXPECTATIONS,
  B456_MEDIA_FILE_LIMIT_BYTES,
  B456_OVERSIZED_SOURCE_DIMENSIONS,
  B456_PHOTO_MAX_LONG_EDGE,
  b456FilePathsFor,
  inspectB456ImageFixture,
  ownedSubjectCodesFor,
} from './support/b456-browser-fixtures/scenario-builders';
import {
  createB456BrowserFixtureManager,
  withB456VerifyStage,
  type B456BrowserFixtureManager,
} from './support/b456-browser-fixtures/b456-browser-fixtures';

jest.setTimeout(300000);

const PRIMARY_NAMESPACE = 'b456-e2e-main';
const SENTINEL_NAMESPACE = 'b456-e2e-sentinel';

function auditRange(batch: 'B4' | 'B5' | 'B6', start: number, end: number) {
  return Array.from(
    { length: end - start + 1 },
    (_, index) => `${batch}-MV-${(start + index).toString().padStart(3, '0')}`,
  );
}

function expectFixtureCode(action: () => void, code: string): void {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(B456FixtureError);
    if (error instanceof B456FixtureError) expect(error.code).toBe(code);
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
    expect(error).toBeInstanceOf(B456FixtureError);
    if (error instanceof B456FixtureError) expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected fixture error ${code}`);
}

describe('B4-B6 browser fixture CLI support (e2e)', () => {
  let app: INestApplicationContext;
  let connection: Connection;
  let manager: B456BrowserFixtureManager;
  let authService: AuthService;
  let userModel: Model<UserDocument>;
  let sessionModel: Model<SessionDocument>;
  let patientModel: Model<PatientDocument>;
  let instanceModel: Model<ScaleInstanceDocument>;
  let itemModel: Model<ItemResponseDocument>;
  let testPassword: string;

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('E2E requires NODE_ENV=test');
    }
    testPassword = `B456-${randomUUID()}-Aa1!`;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    connection = app.get<Connection>(getConnectionToken());
    const config = app.get(ConfigService);
    assertB456RuntimeEnvironment({
      nodeEnv: process.env.NODE_ENV,
      appEnv: config.get<string>('app.env'),
      databaseName: connection.name,
      storageDriver: config.get<string>('storage.driver'),
      llmProvider: config.get<string>('llm.provider'),
      smsProvider: config.get<string>('smsAuth.provider'),
      sessionCookieSecure: config.get<boolean>('session.cookieSecure'),
    });
    manager = createB456BrowserFixtureManager(app);
    authService = app.get(AuthService);
    userModel = app.get(getModelToken(User.name));
    sessionModel = app.get(getModelToken(Session.name));
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
    if (app) await app.close();
    if (connection?.readyState) await connection.close();
  });

  it('enforces the exact contract, environment, namespace, CLI, and manifest gates', () => {
    expect(() => assertB456Contract()).not.toThrow();
    const keys = [
      'roles',
      ...B456_BUSINESS_SCENARIOS.map(({ scenarioKey }) => scenarioKey),
    ];
    const auditIds = B456_BUSINESS_SCENARIOS.flatMap(({ auditIds: ids }) => [
      ...ids,
    ]);
    expect(keys).toHaveLength(32);
    expect(new Set(keys).size).toBe(32);
    expect(B456_BUSINESS_SCENARIOS).toHaveLength(31);
    expect(auditIds).toHaveLength(135);
    expect(new Set(auditIds).size).toBe(135);
    expect(B456_DIRECT_AUDIT_IDS).toHaveLength(15);
    expect(
      auditIds.filter(
        (auditId) =>
          !B456_DIRECT_AUDIT_IDS.includes(
            auditId as (typeof B456_DIRECT_AUDIT_IDS)[number],
          ),
      ),
    ).toHaveLength(120);
    for (const excluded of B456_EXCLUDED_AUDIT_IDS) {
      expect(auditIds).not.toContain(excluded);
    }
    const expectedAuditIds = [
      ...auditRange('B4', 1, 44),
      ...auditRange('B5', 1, 62).filter(
        (auditId) =>
          !B456_EXCLUDED_AUDIT_IDS.includes(
            auditId as (typeof B456_EXCLUDED_AUDIT_IDS)[number],
          ),
      ),
      ...auditRange('B6', 1, 37),
    ];
    expect(
      expectedAuditIds.filter((auditId) => !auditIds.includes(auditId)),
    ).toEqual([]);
    expect(
      auditIds.filter((auditId) => !expectedAuditIds.includes(auditId)),
    ).toEqual([]);
    expect(auditIds.length - new Set(auditIds).size).toBe(0);

    expect(B456_AUDIT_EVIDENCE).toHaveLength(135);
    expect(
      new Set(B456_AUDIT_EVIDENCE.map(({ auditId }) => auditId)).size,
    ).toBe(135);
    expect(
      B456_AUDIT_EVIDENCE.filter(
        ({ evidenceMode }) => evidenceMode === 'browser',
      ),
    ).toHaveLength(133);
    const automatedBoundaryEvidence = B456_AUDIT_EVIDENCE.filter(
      ({ evidenceMode }) => evidenceMode === 'automated_boundary',
    );
    expect(automatedBoundaryEvidence).toEqual([
      {
        auditId: 'B5-MV-042',
        scenarioKey: 'handwriting_trajectory',
        evidenceMode: 'automated_boundary',
      },
      {
        auditId: 'B5-MV-043',
        scenarioKey: 'handwriting_trajectory',
        evidenceMode: 'automated_boundary',
      },
    ]);
    expect(B456_AUTOMATED_BOUNDARY_AUDIT_IDS).toEqual([
      'B5-MV-042',
      'B5-MV-043',
    ]);

    const mediaFileValidation = B456_BUSINESS_SCENARIOS.find(
      ({ scenarioKey }) => scenarioKey === 'media_file_validation',
    );
    expect(mediaFileValidation).toMatchObject({
      auditIds: [
        'B5-MV-006',
        'B5-MV-007',
        'B5-MV-009',
        'B5-MV-010',
        'B5-MV-011',
        'B5-MV-012',
        'B5-MV-013',
      ],
      expectedStatus: null,
      expectedBusinessCode: null,
    });
    expect(mediaFileValidation?.purpose).toContain('Canvas JPEG re-encoding');
    expect(mediaFileValidation?.expectedSummary).toContain(
      'MIME-mismatched bytes',
    );
    expect(mediaFileValidation?.expectedSummary).toContain(
      'blocked client-side',
    );
    expect(mediaFileValidation?.expectedSummary).toContain('processed Blob');

    expectFixtureCode(
      () => assertB456PreImportEnvironment('development'),
      'B456_FIXTURE_ENVIRONMENT_UNSAFE',
    );
    expectFixtureCode(
      () => validateB456Namespace('Unsafe--Namespace'),
      'B456_FIXTURE_NAMESPACE_INVALID',
    );
    expectFixtureCode(
      () => requireB456FixturePassword(undefined),
      'B456_FIXTURE_PASSWORD_REQUIRED',
    );
    expectFixtureCode(
      () =>
        assertB456RuntimeEnvironment({
          nodeEnv: 'test',
          appEnv: 'test',
          databaseName: 'cogmemory_ad_prod',
          storageDriver: 'fake',
          llmProvider: 'stub',
          smsProvider: 'stub',
          sessionCookieSecure: false,
        }),
      'B456_FIXTURE_ENVIRONMENT_UNSAFE',
    );
    expectFixtureCode(
      () =>
        assertB456SafeManifest({
          namespace: PRIMARY_NAMESPACE,
          metadata: { unsafe: true },
        }),
      'B456_FIXTURE_MANIFEST_UNSAFE',
    );

    const cli = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-r',
        'tsconfig-paths/register',
        'scripts/b456-browser-fixtures.ts',
        'transition',
        '--collection',
        'items',
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
        encoding: 'utf8',
      },
    );
    expect(cli.status).toBe(1);
    expect(cli.stderr).toContain('B456_FIXTURE_COMMAND_INVALID');
    expect(cli.stderr).not.toContain('mongodb');
  });

  it('wraps unknown verify-stage failures without leaking internal error details', async () => {
    const existing = new B456FixtureError(
      'B456_FIXTURE_SCENARIO_INVALID',
      'Existing safe error',
      'handwriting_trajectory',
    );
    await expect(
      withB456VerifyStage('B5', 'post-browser', () => {
        throw existing;
      }),
    ).rejects.toBe(existing);

    let wrapped: unknown;
    try {
      await withB456VerifyStage(
        'B5',
        'post-browser',
        () => {
          throw new Error('internal path, query, and identifier details');
        },
        'handwriting_trajectory',
      );
    } catch (error: unknown) {
      wrapped = error;
    }
    expect(wrapped).toBeInstanceOf(B456FixtureError);
    const payload = toB456SafeErrorPayload(wrapped);
    expect(payload).toEqual({
      ok: false,
      code: 'B456_FIXTURE_VERIFY_STAGE_FAILED',
      message: 'B4-B6 fixture verification failed in a named read-only stage',
      scenarioKey: 'handwriting_trajectory',
      stage: 'B5',
      phase: 'post-browser',
    });
    expect(JSON.stringify(payload)).not.toContain('internal path');
    expect(JSON.stringify(payload)).not.toContain('query');
    expect(JSON.stringify(payload)).not.toContain('identifier');
  });

  it('prepares and read-only verifies two isolated namespaces and temporary files', async () => {
    const primary = await manager.prepare(PRIMARY_NAMESPACE, testPassword);
    const sentinel = await manager.prepare(SENTINEL_NAMESPACE, testPassword);
    for (const manifest of [primary, sentinel]) {
      expect(manifest.roles).toHaveLength(5);
      expect(manifest.scenarios).toHaveLength(32);
      expect(manifest.expectedSummary).toContain('auditIds=135');
      expect(manifest.expectedSummary).toContain('browserDirect=15');
      expect(manifest.expectedSummary).toContain('fixtureRequired=120');
      expect(() => assertB456SafeManifest(manifest)).not.toThrow();
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
        subjectCode: { $in: ownedSubjectCodesFor(PRIMARY_NAMESPACE) },
      }),
    ).toBe(32);
    const filePaths = b456FilePathsFor(PRIMARY_NAMESPACE);
    const fileStats = new Map(
      await Promise.all(
        Object.entries(filePaths).map(
          async ([key, path]) => [key, await stat(path)] as const,
        ),
      ),
    );
    const [jpeg, png, webp, oversized, wrongMime, invalidImage] =
      await Promise.all([
        readFile(filePaths.jpeg),
        readFile(filePaths.png),
        readFile(filePaths.webp),
        readFile(filePaths.oversized),
        readFile(filePaths.wrongMime),
        readFile(filePaths.invalidImage),
      ]);
    const decoded = {
      jpeg: inspectB456ImageFixture(jpeg),
      png: inspectB456ImageFixture(png),
      webp: inspectB456ImageFixture(webp),
      oversized: inspectB456ImageFixture(oversized),
      wrongMime: inspectB456ImageFixture(wrongMime),
      invalidImage: inspectB456ImageFixture(invalidImage),
    };
    expect(decoded.jpeg?.encoding).toBe(
      B456_IMAGE_FILE_EXPECTATIONS.jpeg.encoding,
    );
    expect(decoded.png?.encoding).toBe(
      B456_IMAGE_FILE_EXPECTATIONS.png.encoding,
    );
    expect(decoded.webp?.encoding).toBe(
      B456_IMAGE_FILE_EXPECTATIONS.webp.encoding,
    );
    expect(decoded.wrongMime?.encoding).toBe(
      B456_IMAGE_FILE_EXPECTATIONS.wrongMime.encoding,
    );
    expect(B456_IMAGE_FILE_EXPECTATIONS.wrongMime.declaredMime).not.toBe(
      `image/${decoded.wrongMime?.encoding}`,
    );
    expect(decoded.invalidImage).toBeNull();
    expect(decoded.oversized).toEqual({
      encoding: B456_IMAGE_FILE_EXPECTATIONS.oversized.encoding,
      ...B456_OVERSIZED_SOURCE_DIMENSIONS,
    });
    expect(fileStats.get('oversized')?.size).toBeGreaterThan(
      B456_MEDIA_FILE_LIMIT_BYTES,
    );
    expect(
      Math.max(decoded.oversized?.width ?? 0, decoded.oversized?.height ?? 0),
    ).toBeGreaterThan(B456_PHOTO_MAX_LONG_EDGE);
    const sessionsBefore = await sessionModel.countDocuments({
      userId: {
        $in: await userModel.distinct('_id', {
          accountName: {
            $in: B456_ROLES.map((role) =>
              accountNameFor(PRIMARY_NAMESPACE, role),
            ),
          },
        }),
      },
    });
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
    expect(
      await sessionModel.countDocuments({
        userId: {
          $in: await userModel.distinct('_id', {
            accountName: {
              $in: B456_ROLES.map((role) =>
                accountNameFor(PRIMARY_NAMESPACE, role),
              ),
            },
          }),
        },
      }),
    ).toBe(sessionsBefore);
  });

  it('verifies real simulated Browser draft, media, void, trajectory, and final-submit persistence', async () => {
    await manager.simulateBrowserResultsForE2e(PRIMARY_NAMESPACE);
    const before = await instanceModel
      .find({
        patientId: {
          $in: await patientModel.distinct('_id', {
            subjectCode: { $in: ownedSubjectCodesFor(PRIMARY_NAMESPACE) },
          }),
        },
      })
      .select({ _id: 1, updatedAt: 1 })
      .sort({ _id: 1 })
      .lean()
      .exec();
    const manifest = await manager.verify(
      PRIMARY_NAMESPACE,
      testPassword,
      'post-browser',
    );
    const after = await instanceModel
      .find({ _id: { $in: before.map(({ _id }) => _id) } })
      .select({ _id: 1, updatedAt: 1 })
      .sort({ _id: 1 })
      .lean()
      .exec();
    expect(after).toEqual(before);
    expect(manifest.expectedSummary).toContain('phase=post-browser');
    for (const ordinal of [26, 27, 31]) {
      const patient = await patientModel
        .findOne({
          subjectCode: scenarioSubjectCodeFor(PRIMARY_NAMESPACE, ordinal),
        })
        .exec();
      expect(patient).not.toBeNull();
      expect(
        patient
          ? await instanceModel.countDocuments({
              patientId: patient._id,
              status: 'completed',
            })
          : 0,
      ).toBe(1);
    }
  });

  it('reports isolated corruption without repairing it', async () => {
    const patient = await patientModel
      .findOne({ subjectCode: scenarioSubjectCodeFor(SENTINEL_NAMESPACE, 1) })
      .exec();
    const instance = patient
      ? await instanceModel
          .findOne({ patientId: patient._id, scaleCode: 'mmse' })
          .exec()
      : null;
    const item = instance
      ? await itemModel.findOne({ scaleInstanceId: instance._id }).exec()
      : null;
    if (!item) throw new Error('Expected corruption target');
    await itemModel.deleteOne({ _id: item._id }).exec();
    const countBefore = await itemModel.countDocuments({
      scaleInstanceId: instance?._id,
    });
    await expectAsyncFixtureCode(
      () => manager.verify(SENTINEL_NAMESPACE, testPassword, 'prepared'),
      'B456_FIXTURE_SCENARIO_INVALID',
    );
    expect(
      await itemModel.countDocuments({ scaleInstanceId: instance?._id }),
    ).toBe(countBefore);
    expect(await itemModel.findById(item._id).exec()).toBeNull();
  });

  it('keeps cleanup idempotent and namespace-scoped and replace explicit', async () => {
    const sentinelCount = await patientModel.countDocuments({
      subjectCode: { $in: ownedSubjectCodesFor(SENTINEL_NAMESPACE) },
    });
    const first = await manager.cleanup(PRIMARY_NAMESPACE);
    const second = await manager.cleanup(PRIMARY_NAMESPACE);
    expect(first.expectedSummary).toContain('residualCount=0');
    expect(first.expectedSummary).toContain('matched=true');
    expect(second.expectedSummary).toContain('residualCount=0');
    expect(second.expectedSummary).toContain('matched=false');
    expect(
      await patientModel.countDocuments({
        subjectCode: { $in: ownedSubjectCodesFor(SENTINEL_NAMESPACE) },
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
