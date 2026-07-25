import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import type { Connection, Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  Patient,
  type PatientDocument,
} from '../src/modules/patients/schemas/patient.schema';
import {
  ScaleDefinition,
  type ScaleDefinitionDocument,
} from '../src/modules/scales/schemas/scale-definition.schema';
import {
  ScaleVersion,
  type ScaleVersionDocument,
} from '../src/modules/scales/schemas/scale-version.schema';
import {
  ScoreResult,
  type ScoreResultDocument,
} from '../src/modules/scoring/schemas/score-result.schema';
import {
  B8_AUDIT_IDS,
  B8_AUDIT_MATRIX,
  B8_PROFILES,
  B8_ROLES,
  B8_SCENARIOS,
  B8FixtureError,
  assertB8Contract,
  assertB8PreImportEnvironment,
  assertB8RuntimeEnvironment,
  assertB8SafeManifest,
  auditMatrixFor,
  requireB8FixturePassword,
  scenarioDefinitionsFor,
  scenarioSubjectCodeFor,
  toB8SafeErrorPayload,
  validateB8Namespace,
  validateB8Profile,
  type B8BusinessScenarioKey,
  type B8Profile,
} from './support/b8-browser-fixtures/fixture-contract';
import {
  createB8BrowserFixtureManager,
  type B8BrowserFixtureManager,
} from './support/b8-browser-fixtures/b8-browser-fixtures';

jest.setTimeout(300000);

const CORE_NAMESPACE = 'b8c-e2e-core';
const RESILIENCE_NAMESPACE = 'b8r-e2e-resilience';

function expectFixtureCode(action: () => void, code: string): void {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(B8FixtureError);
    if (error instanceof B8FixtureError) {
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
    expect(error).toBeInstanceOf(B8FixtureError);
    if (error instanceof B8FixtureError) {
      expect(error.code).toBe(code);
    }
    return;
  }
  throw new Error(`Expected fixture error ${code}`);
}

function withoutLifecycleTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => withoutLifecycleTimestamps(entry));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'createdAt' && key !== 'updatedAt')
      .map(([key, entry]) => [key, withoutLifecycleTimestamps(entry)]),
  );
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

describe('B8 profile-scoped browser fixture support (e2e)', () => {
  let app: INestApplicationContext;
  let connection: Connection;
  let manager: B8BrowserFixtureManager;
  let patientModel: Model<PatientDocument>;
  let scoreModel: Model<ScoreResultDocument>;
  let definitionModel: Model<ScaleDefinitionDocument>;
  let versionModel: Model<ScaleVersionDocument>;
  let testPassword: string;
  let preparedSeedHash: string;

  async function seedHash(): Promise<string> {
    const [definitions, versions] = await Promise.all([
      definitionModel
        .find({ code: { $in: ['mmse', 'moca'] } })
        .sort({ code: 1, _id: 1 })
        .lean()
        .exec(),
      versionModel
        .find({ scaleCode: { $in: ['mmse', 'moca'] } })
        .sort({ scaleCode: 1, version: 1, _id: 1 })
        .lean()
        .exec(),
    ]);
    return stableHash(withoutLifecycleTimestamps({ definitions, versions }));
  }

  async function scoreFor(
    profile: B8Profile,
    namespace: string,
    scenarioKey: B8BusinessScenarioKey,
  ): Promise<ScoreResultDocument> {
    const definition = scenarioDefinitionsFor(profile).find(
      (candidate) => candidate.scenarioKey === scenarioKey,
    );
    if (!definition) {
      throw new Error(`Missing scenario ${scenarioKey}`);
    }
    const patient = await patientModel
      .findOne({
        subjectCode: scenarioSubjectCodeFor(
          profile,
          namespace,
          definition.ordinal,
        ),
      })
      .exec();
    const score = patient
      ? await scoreModel.findOne({ patientId: patient._id }).exec()
      : null;
    if (!score) {
      throw new Error(`Missing score for ${scenarioKey}`);
    }
    return score;
  }

  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      process.env.COGMEMORY_DATABASE_PURPOSE !== 'standard_test'
    ) {
      throw new Error('B8 fixture E2E requires standard_test isolation');
    }
    testPassword = `B8-${randomUUID()}-Aa1!`;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    connection = app.get<Connection>(getConnectionToken());
    const config = app.get(ConfigService);
    assertB8RuntimeEnvironment({
      nodeEnv: process.env.NODE_ENV,
      appEnv: config.get<string>('app.env'),
      databasePurpose: process.env.COGMEMORY_DATABASE_PURPOSE,
      databaseName: connection.name,
      storageDriver: config.get<string>('storage.driver'),
      llmProvider: config.get<string>('llm.provider'),
      smsProvider: config.get<string>('smsAuth.provider'),
      sessionCookieSecure: config.get<boolean>('session.cookieSecure'),
    });
    manager = createB8BrowserFixtureManager(app);
    patientModel = app.get(getModelToken(Patient.name));
    scoreModel = app.get(getModelToken(ScoreResult.name));
    definitionModel = app.get(getModelToken(ScaleDefinition.name));
    versionModel = app.get(getModelToken(ScaleVersion.name));
    await manager.cleanup('core-workflow', CORE_NAMESPACE);
    await manager.cleanup('resilience-security', RESILIENCE_NAMESPACE);
  });

  afterAll(async () => {
    if (manager) {
      await manager.cleanup('core-workflow', CORE_NAMESPACE);
      await manager.cleanup('resilience-security', RESILIENCE_NAMESPACE);
    }
    if (app) {
      await app.close();
    }
    if (connection?.readyState) {
      await connection.close();
    }
  });

  it('enforces 60 unique IDs, exclusive profile ownership, primary owners, CLI gates, and safe manifests', () => {
    expect(() => assertB8Contract()).not.toThrow();
    expect(B8_AUDIT_IDS).toHaveLength(60);
    expect(B8_AUDIT_MATRIX).toHaveLength(60);
    expect(new Set(B8_AUDIT_MATRIX.map(({ auditId }) => auditId)).size).toBe(
      60,
    );
    expect(new Set(B8_AUDIT_MATRIX.map(({ auditId }) => auditId))).toEqual(
      new Set(B8_AUDIT_IDS),
    );
    expect(B8_PROFILES).toEqual(['core-workflow', 'resilience-security']);
    expect(auditMatrixFor('core-workflow')).toHaveLength(39);
    expect(auditMatrixFor('resilience-security')).toHaveLength(21);
    expect(scenarioDefinitionsFor('core-workflow')).toHaveLength(9);
    expect(scenarioDefinitionsFor('resilience-security')).toHaveLength(9);
    expect(B8_ROLES).toHaveLength(5);
    expect(
      B8_SCENARIOS.every(
        (scenario) =>
          new Set<string>(scenario.auditIds).has(
            scenario.primaryOwnerAuditId,
          ) &&
          B8_AUDIT_MATRIX.some(
            (audit) =>
              audit.auditId === scenario.primaryOwnerAuditId &&
              audit.profile === scenario.profile &&
              audit.scenarioKey === scenario.scenarioKey,
          ),
      ),
    ).toBe(true);
    expect(
      B8_AUDIT_MATRIX.filter(({ requiresIndependentSession }) =>
        Boolean(requiresIndependentSession),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      B8_AUDIT_MATRIX.filter(({ verificationFlags }) =>
        verificationFlags.includes('privacy'),
      ).length,
    ).toBeGreaterThan(0);
    expect(() => assertB8PreImportEnvironment('test')).not.toThrow();
    expectFixtureCode(
      () => assertB8PreImportEnvironment('development'),
      'B8_FIXTURE_ENVIRONMENT_UNSAFE',
    );
    expect(validateB8Profile('core-workflow')).toBe('core-workflow');
    expectFixtureCode(
      () => validateB8Profile('combined'),
      'B8_FIXTURE_PROFILE_INVALID',
    );
    expectFixtureCode(
      () => validateB8Namespace('core-workflow', RESILIENCE_NAMESPACE),
      'B8_FIXTURE_NAMESPACE_INVALID',
    );
    expectFixtureCode(
      () => validateB8Namespace('resilience-security', CORE_NAMESPACE),
      'B8_FIXTURE_NAMESPACE_INVALID',
    );
    expectFixtureCode(
      () => requireB8FixturePassword('short'),
      'B8_FIXTURE_PASSWORD_REQUIRED',
    );
    expect(() =>
      assertB8SafeManifest({
        namespace: CORE_NAMESPACE,
        databaseName: 'cogmemory_ad_test',
        profile: 'core-workflow',
        residualCount: 0,
        matched: false,
        expectedSummary: 'safe',
      }),
    ).not.toThrow();
    expectFixtureCode(
      () =>
        assertB8SafeManifest({
          namespace: CORE_NAMESPACE,
          databaseName: 'cogmemory_ad_test',
          profile: 'core-workflow',
          passwordHash: 'unsafe',
        }),
      'B8_FIXTURE_MANIFEST_UNSAFE',
    );

    for (const args of [
      ['invalid'],
      ['prepare'],
      ['cleanup', '--profile', 'core-workflow'],
      ['replace', '--profile', 'core-workflow'],
    ]) {
      const cli = spawnSync(
        process.execPath,
        [
          '-r',
          'ts-node/register',
          '-r',
          'tsconfig-paths/register',
          'scripts/b8-browser-fixtures.ts',
          ...args,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: { ...process.env, NODE_ENV: 'test' },
        },
      );
      expect(cli.status).toBe(1);
      expect(cli.stderr).toContain('B8_FIXTURE_');
      expect(cli.stderr).not.toContain(testPassword);
    }
    expect(toB8SafeErrorPayload(new Error('private query details'))).toEqual({
      ok: false,
      code: 'B8_FIXTURE_OPERATION_FAILED',
      message:
        'B8 browser fixture operation failed without exposing internal details',
    });
  });

  it('prepares and read-only verifies independent profile namespaces without accepting the other post-browser phase', async () => {
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
    expect(core.auditMatrix).toHaveLength(39);
    expect(core.scenarios).toHaveLength(9);
    expect(core.expectedSummary).toContain('visits=14');
    expect(core.expectedSummary).toContain('scoreResults=14');
    expect(resilience.auditMatrix).toHaveLength(21);
    expect(resilience.scenarios).toHaveLength(9);
    expect(resilience.expectedSummary).toContain('visits=11');
    expect(resilience.expectedSummary).toContain('scoreResults=11');
    for (const manifest of [core, resilience]) {
      expect(manifest.roles).toHaveLength(5);
      expect(() => assertB8SafeManifest(manifest)).not.toThrow();
      expect(JSON.stringify(manifest)).not.toContain(testPassword);
    }

    const scoreBefore = (
      await scoreFor('core-workflow', CORE_NAMESPACE, 'manual_input_validation')
    ).toObject();
    const verified = await manager.verify(
      'core-workflow',
      CORE_NAMESPACE,
      testPassword,
      'prepared',
    );
    const verifiedAgain = await manager.verify(
      'core-workflow',
      CORE_NAMESPACE,
      testPassword,
      'prepared',
    );
    expect(verifiedAgain).toEqual(verified);
    expect(
      (
        await scoreFor(
          'core-workflow',
          CORE_NAMESPACE,
          'manual_input_validation',
        )
      ).toObject(),
    ).toEqual(scoreBefore);
    await manager.verify(
      'resilience-security',
      RESILIENCE_NAMESPACE,
      testPassword,
      'prepared',
    );
    await expectAsyncFixtureCode(
      () => manager.prepare('core-workflow', CORE_NAMESPACE, testPassword),
      'B8_FIXTURE_NAMESPACE_EXISTS',
    );
    await expectAsyncFixtureCode(
      () =>
        manager.verify(
          'core-workflow',
          CORE_NAMESPACE,
          testPassword,
          'post-browser',
        ),
      'B8_FIXTURE_SCENARIO_INVALID',
    );
    await expectAsyncFixtureCode(
      () =>
        manager.verify(
          'resilience-security',
          RESILIENCE_NAMESPACE,
          testPassword,
          'post-browser',
        ),
      'B8_FIXTURE_SCENARIO_INVALID',
    );
    preparedSeedHash = await seedHash();
  });

  it('accepts only each profile legal post-browser terminal state and detects missing, multiple, wrong updatedAt, status drift, and cross-profile pollution without repair', async () => {
    await manager.simulatePostBrowserForE2e('core-workflow', CORE_NAMESPACE);
    await manager.simulatePostBrowserForE2e(
      'resilience-security',
      RESILIENCE_NAMESPACE,
    );
    const core = await manager.verify(
      'core-workflow',
      CORE_NAMESPACE,
      testPassword,
      'post-browser',
    );
    const resilience = await manager.verify(
      'resilience-security',
      RESILIENCE_NAMESPACE,
      testPassword,
      'post-browser',
    );
    expect(core.expectedSummary).toContain('phase=post-browser');
    expect(resilience.expectedSummary).toContain('phase=post-browser');
    expect(await seedHash()).toBe(preparedSeedHash);

    const multiWrite = await scoreFor(
      'core-workflow',
      CORE_NAMESPACE,
      'manual_input_validation',
    );
    const events = multiWrite.metadata?.a18ManualReview as
      | { events?: unknown[] }
      | undefined;
    if (!Array.isArray(events?.events) || events.events.length === 0) {
      throw new Error('Expected controlled manual-review audit');
    }
    await scoreModel.collection.updateOne(
      { _id: multiWrite._id },
      {
        $set: {
          'metadata.a18ManualReview.events': [
            ...events.events,
            events.events.at(-1),
          ],
        },
      },
    );
    await expectAsyncFixtureCode(
      () =>
        manager.verify(
          'core-workflow',
          CORE_NAMESPACE,
          testPassword,
          'post-browser',
        ),
      'B8_FIXTURE_SCENARIO_INVALID',
    );
    expect(
      (
        (await scoreModel.collection.findOne({ _id: multiWrite._id }))
          ?.metadata as { a18ManualReview?: { events?: unknown[] } }
      ).a18ManualReview?.events,
    ).toHaveLength(events.events.length + 1);
    await scoreModel.collection.updateOne(
      { _id: multiWrite._id },
      { $pop: { 'metadata.a18ManualReview.events': 1 } },
    );

    const wrongUpdatedAt = await scoreFor(
      'core-workflow',
      CORE_NAMESPACE,
      'static_gate',
    );
    const originalUpdatedAt: unknown = wrongUpdatedAt.get('updatedAt');
    await scoreModel.collection.updateOne(
      { _id: wrongUpdatedAt._id },
      { $set: { updatedAt: new Date('2020-01-01T00:00:00.000Z') } },
    );
    await expectAsyncFixtureCode(
      () =>
        manager.verify(
          'core-workflow',
          CORE_NAMESPACE,
          testPassword,
          'post-browser',
        ),
      'B8_FIXTURE_SCENARIO_INVALID',
    );
    expect(
      (await scoreModel.collection.findOne({ _id: wrongUpdatedAt._id }))
        ?.updatedAt,
    ).toEqual(new Date('2020-01-01T00:00:00.000Z'));
    await scoreModel.collection.updateOne(
      { _id: wrongUpdatedAt._id },
      { $set: { updatedAt: originalUpdatedAt } },
    );

    const drifted = await scoreFor(
      'resilience-security',
      RESILIENCE_NAMESPACE,
      'auth_401',
    );
    await scoreModel.collection.updateOne(
      { _id: drifted._id },
      { $set: { status: 'voided' } },
    );
    await expectAsyncFixtureCode(
      () =>
        manager.verify(
          'resilience-security',
          RESILIENCE_NAMESPACE,
          testPassword,
          'post-browser',
        ),
      'B8_FIXTURE_SCENARIO_INVALID',
    );
    expect(
      (await scoreModel.collection.findOne({ _id: drifted._id }))?.status,
    ).toBe('voided');
    await scoreModel.collection.updateOne(
      { _id: drifted._id },
      { $set: { status: 'needs_review' } },
    );

    const resiliencePatient = await patientModel
      .findOne({
        subjectCode: scenarioSubjectCodeFor(
          'resilience-security',
          RESILIENCE_NAMESPACE,
          1,
        ),
      })
      .exec();
    if (!resiliencePatient) {
      throw new Error('Expected resilience profile patient');
    }
    await patientModel.collection.updateOne(
      { _id: resiliencePatient._id },
      { $set: { 'metadata.b8Fixture.profile': 'core-workflow' } },
    );
    await expectAsyncFixtureCode(
      () =>
        manager.verify(
          'resilience-security',
          RESILIENCE_NAMESPACE,
          testPassword,
          'post-browser',
        ),
      'B8_FIXTURE_PROFILE_CROSS_CONTAMINATION',
    );
    const pollutedPatient = await patientModel
      .findById(resiliencePatient._id)
      .exec();
    const pollutedFixture = pollutedPatient?.metadata?.b8Fixture as
      | { profile?: unknown }
      | undefined;
    expect(pollutedFixture?.profile).toBe('core-workflow');
    await patientModel.collection.updateOne(
      { _id: resiliencePatient._id },
      { $set: { 'metadata.b8Fixture.profile': 'resilience-security' } },
    );

    await manager.verify(
      'core-workflow',
      CORE_NAMESPACE,
      testPassword,
      'post-browser',
    );
    await manager.verify(
      'resilience-security',
      RESILIENCE_NAMESPACE,
      testPassword,
      'post-browser',
    );
    expect(await seedHash()).toBe(preparedSeedHash);
  });

  it('keeps replace explicit at the CLI, cleanup profile-scoped, and second cleanup residualCount=0', async () => {
    const resilienceBefore = await patientModel.countDocuments({
      'metadata.b8Fixture.profile': 'resilience-security',
      'metadata.b8Fixture.namespace': RESILIENCE_NAMESPACE,
    });
    const firstCore = await manager.cleanup('core-workflow', CORE_NAMESPACE);
    const secondCore = await manager.cleanup('core-workflow', CORE_NAMESPACE);
    expect(firstCore).toEqual(
      expect.objectContaining({ residualCount: 0, matched: true }),
    );
    expect(secondCore).toEqual(
      expect.objectContaining({ residualCount: 0, matched: false }),
    );
    expect(
      await patientModel.countDocuments({
        'metadata.b8Fixture.profile': 'resilience-security',
        'metadata.b8Fixture.namespace': RESILIENCE_NAMESPACE,
      }),
    ).toBe(resilienceBefore);

    const replaced = await manager.replace(
      'core-workflow',
      CORE_NAMESPACE,
      testPassword,
    );
    expect(replaced.phase).toBe('prepared');
    await manager.verify(
      'core-workflow',
      CORE_NAMESPACE,
      testPassword,
      'prepared',
    );
    expect(await manager.cleanup('core-workflow', CORE_NAMESPACE)).toEqual(
      expect.objectContaining({ residualCount: 0, matched: true }),
    );
    expect(await manager.cleanup('core-workflow', CORE_NAMESPACE)).toEqual(
      expect.objectContaining({ residualCount: 0, matched: false }),
    );
    expect(
      await manager.cleanup('resilience-security', RESILIENCE_NAMESPACE),
    ).toEqual(expect.objectContaining({ residualCount: 0, matched: true }));
    expect(
      await manager.cleanup('resilience-security', RESILIENCE_NAMESPACE),
    ).toEqual(expect.objectContaining({ residualCount: 0, matched: false }));
    expect(await seedHash()).toBe(preparedSeedHash);
  });
});
