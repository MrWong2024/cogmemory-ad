import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import type { Connection, Model } from 'mongoose';
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
import { AppModule } from '../src/app.module';
import {
  MediaEvidence,
  type MediaEvidenceDocument,
} from '../src/modules/media/schemas/media-evidence.schema';
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
  scenarioVisitCodeFor,
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
  let visitModel: Model<AssessmentVisitDocument>;
  let instanceModel: Model<ScaleInstanceDocument>;
  let itemModel: Model<ItemResponseDocument>;
  let mediaModel: Model<MediaEvidenceDocument>;
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

  function targetRouteSuffix(
    routeKey: 'manual' | 'confirmation' | 'execution',
  ): 'BASE' | 'CONFIRMATION' | 'EXECUTION' {
    return routeKey === 'manual'
      ? 'BASE'
      : routeKey === 'confirmation'
        ? 'CONFIRMATION'
        : 'EXECUTION';
  }

  async function targetRoute(
    scenarioKey: 'network_failure' | 'responsive_route_draft',
    routeKey: 'manual' | 'confirmation' | 'execution',
  ): Promise<{
    patient: PatientDocument;
    visit: AssessmentVisitDocument;
    instance: ScaleInstanceDocument;
    score: ScoreResultDocument | null;
    items: ItemResponseDocument[];
  }> {
    const definition = scenarioDefinitionsFor('resilience-security').find(
      (candidate) => candidate.scenarioKey === scenarioKey,
    );
    if (!definition) {
      throw new Error(`Missing target scenario ${scenarioKey}`);
    }
    const patient = await patientModel
      .findOne({
        subjectCode: scenarioSubjectCodeFor(
          'resilience-security',
          RESILIENCE_NAMESPACE,
          definition.ordinal,
        ),
      })
      .exec();
    const visit = patient
      ? await visitModel
          .findOne({
            patientId: patient._id,
            visitCode: scenarioVisitCodeFor(
              'resilience-security',
              RESILIENCE_NAMESPACE,
              definition.ordinal,
              targetRouteSuffix(routeKey),
            ),
          })
          .exec()
      : null;
    const instance = visit
      ? await instanceModel.findOne({ assessmentVisitId: visit._id }).exec()
      : null;
    if (!patient || !visit || !instance) {
      throw new Error(`Missing target route ${scenarioKey}/${routeKey}`);
    }
    const [score, items] = await Promise.all([
      scoreModel.findOne({ scaleInstanceId: instance._id }).exec(),
      itemModel
        .find({ scaleInstanceId: instance._id })
        .sort({ itemOrder: 1 })
        .exec(),
    ]);
    return { patient, visit, instance, score, items };
  }

  async function resilienceBusinessHash(): Promise<string> {
    const subjectCodes = scenarioDefinitionsFor('resilience-security').map(
      ({ ordinal }) =>
        scenarioSubjectCodeFor(
          'resilience-security',
          RESILIENCE_NAMESPACE,
          ordinal,
        ),
    );
    const patients = await patientModel
      .find({ subjectCode: { $in: subjectCodes } })
      .sort({ _id: 1 })
      .lean()
      .exec();
    const patientIds = patients.map(({ _id }) => _id);
    const visits = await visitModel
      .find({ patientId: { $in: patientIds } })
      .sort({ _id: 1 })
      .lean()
      .exec();
    const visitIds = visits.map(({ _id }) => _id);
    const ownership = {
      $or: [
        { patientId: { $in: patientIds } },
        { assessmentVisitId: { $in: visitIds } },
      ],
    };
    const [instances, items, media, scores] = await Promise.all([
      instanceModel.find(ownership).sort({ _id: 1 }).lean().exec(),
      itemModel.find(ownership).sort({ _id: 1 }).lean().exec(),
      mediaModel.find(ownership).sort({ _id: 1 }).lean().exec(),
      scoreModel.find(ownership).sort({ _id: 1 }).lean().exec(),
    ]);
    return stableHash({ patients, visits, instances, items, media, scores });
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
    visitModel = app.get(getModelToken(AssessmentVisit.name));
    instanceModel = app.get(getModelToken(ScaleInstance.name));
    itemModel = app.get(getModelToken(ItemResponse.name));
    mediaModel = app.get(getModelToken(MediaEvidence.name));
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
    expect(
      stableHash({
        audits: auditMatrixFor('core-workflow'),
        scenarios: scenarioDefinitionsFor('core-workflow'),
      }),
    ).toBe('daf68cf55e39fd62fe0f202d5809df5465917423ffe724da74f2ccfa8cdb0a43');
    expect(
      stableHash({
        audits: auditMatrixFor('resilience-security').filter(
          ({ auditId }) => auditId !== 'B8-56' && auditId !== 'B8-59',
        ),
        scenarios: scenarioDefinitionsFor('resilience-security').filter(
          ({ scenarioKey }) =>
            scenarioKey !== 'network_failure' &&
            scenarioKey !== 'responsive_route_draft',
        ),
      }),
    ).toBe('e77c0d9405331158e1b02a6cc6090b2bddce37da0d752a999295b79e97156788');
    const networkScenario = scenarioDefinitionsFor('resilience-security').find(
      ({ scenarioKey }) => scenarioKey === 'network_failure',
    );
    const responsiveScenario = scenarioDefinitionsFor(
      'resilience-security',
    ).find(({ scenarioKey }) => scenarioKey === 'responsive_route_draft');
    expect(networkScenario?.routeKeys).toEqual(['manual', 'confirmation']);
    expect(responsiveScenario?.routeKeys).toEqual([
      'manual',
      'confirmation',
      'execution',
    ]);
    const networkAudit = B8_AUDIT_MATRIX.find(
      ({ auditId }) => auditId === 'B8-56',
    );
    if (!networkAudit || !('branches' in networkAudit.expectedRequest)) {
      throw new Error('Expected B8-56 route request branches');
    }
    expect(
      networkAudit.expectedRequest.branches.map(
        ({ routeKey, request, automaticRetry, postBrowserSideEffect }) => ({
          routeKey,
          method: request.method,
          resource: request.resource,
          count: request.count,
          automaticRetry,
          postBrowserSideEffect,
        }),
      ),
    ).toEqual([
      {
        routeKey: 'manual',
        method: 'PATCH',
        resource: 'manual-review',
        count: '1',
        automaticRetry: false,
        postBrowserSideEffect: 'none',
      },
      {
        routeKey: 'confirmation',
        method: 'POST',
        resource: 'confirm',
        count: '1',
        automaticRetry: false,
        postBrowserSideEffect: 'none',
      },
    ]);
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
    expect(resilience.expectedSummary).toContain('visits=14');
    expect(resilience.expectedSummary).toContain('scoreResults=13');
    const networkRoutes = resilience.scenarios.find(
      ({ scenarioKey }) => scenarioKey === 'network_failure',
    )?.routes;
    expect(
      networkRoutes?.map((route) => ({
        key: route.key,
        visitStatus: route.visitStatus,
        scaleInstanceStatus: route.scaleInstanceStatus,
        scoreStatus: route.scoreResult?.status,
        reviewQueue: route.scoreResult?.reviewQueue,
        warning: route.scoreResult?.warning,
        confirmationReadiness: route.scoreResult?.confirmationReadiness,
        postBrowserSideEffect: route.postBrowserSideEffect,
      })),
    ).toEqual([
      {
        key: 'manual',
        visitStatus: 'in_progress',
        scaleInstanceStatus: 'completed',
        scoreStatus: 'needs_review',
        reviewQueue: 'at-least-one',
        warning: 'none',
        confirmationReadiness: 'blocked',
        postBrowserSideEffect: 'none',
      },
      {
        key: 'confirmation',
        visitStatus: 'in_progress',
        scaleInstanceStatus: 'completed',
        scoreStatus: 'computed',
        reviewQueue: 'empty',
        warning: 'none',
        confirmationReadiness: 'ready',
        postBrowserSideEffect: 'none',
      },
    ]);
    const responsiveRoutes = resilience.scenarios.find(
      ({ scenarioKey }) => scenarioKey === 'responsive_route_draft',
    )?.routes;
    expect(
      responsiveRoutes?.map((route) => ({
        key: route.key,
        visitStatus: route.visitStatus,
        scaleInstanceStatus: route.scaleInstanceStatus,
        scorePresence: route.scoreResult?.presence,
        scoreStatus: route.scoreResult?.status,
        confirmationReadiness: route.scoreResult?.confirmationReadiness,
        itemResponseEditability: route.itemResponseEditability,
        mediaDraftTarget: route.mediaDraftTarget,
        postBrowserSideEffect: route.postBrowserSideEffect,
      })),
    ).toEqual([
      {
        key: 'manual',
        visitStatus: 'in_progress',
        scaleInstanceStatus: 'completed',
        scorePresence: 'required',
        scoreStatus: 'needs_review',
        confirmationReadiness: 'blocked',
        itemResponseEditability: 'read-only',
        mediaDraftTarget: 'not-applicable',
        postBrowserSideEffect: 'none',
      },
      {
        key: 'confirmation',
        visitStatus: 'in_progress',
        scaleInstanceStatus: 'completed',
        scorePresence: 'required',
        scoreStatus: 'computed',
        confirmationReadiness: 'ready',
        itemResponseEditability: 'read-only',
        mediaDraftTarget: 'not-applicable',
        postBrowserSideEffect: 'none',
      },
      {
        key: 'execution',
        visitStatus: 'in_progress',
        scaleInstanceStatus: 'draft',
        scorePresence: 'absent',
        scoreStatus: 'absent',
        confirmationReadiness: 'not-applicable',
        itemResponseEditability: 'editable',
        mediaDraftTarget: 'local-draft-supported',
        postBrowserSideEffect: 'none',
      },
    ]);
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
    const resilienceBeforeVerify = await resilienceBusinessHash();
    const verifiedResilience = await manager.verify(
      'resilience-security',
      RESILIENCE_NAMESPACE,
      testPassword,
      'prepared',
    );
    expect(
      await manager.verify(
        'resilience-security',
        RESILIENCE_NAMESPACE,
        testPassword,
        'prepared',
      ),
    ).toEqual(verifiedResilience);
    expect(await resilienceBusinessHash()).toBe(resilienceBeforeVerify);
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

  it('verifies legal route states and rejects missing routes, status drift, review-queue loss, and warnings without repair', async () => {
    const networkManual = await targetRoute('network_failure', 'manual');
    const networkConfirmation = await targetRoute(
      'network_failure',
      'confirmation',
    );
    const responsiveManual = await targetRoute(
      'responsive_route_draft',
      'manual',
    );
    const responsiveConfirmation = await targetRoute(
      'responsive_route_draft',
      'confirmation',
    );
    const responsiveExecution = await targetRoute(
      'responsive_route_draft',
      'execution',
    );
    for (const route of [networkManual, responsiveManual]) {
      expect(route.visit.status).toBe('in_progress');
      expect(route.instance.status).toBe('completed');
      expect(route.score?.status).toBe('needs_review');
      expect(
        route.score?.itemScores.filter(
          ({ scoreStatus }) => scoreStatus === 'needs_review',
        ).length,
      ).toBeGreaterThan(0);
    }
    for (const route of [networkConfirmation, responsiveConfirmation]) {
      expect(route.visit.status).toBe('in_progress');
      expect(route.instance.status).toBe('completed');
      expect(route.score?.status).toBe('computed');
      expect(
        route.score?.itemScores.filter(
          ({ scoreStatus }) => scoreStatus === 'needs_review',
        ),
      ).toHaveLength(0);
      expect(route.score?.computation?.warningCount ?? 0).toBe(0);
      expect(route.score?.confirmedAt).toBeNull();
      expect(route.score?.lockedAt).toBeNull();
    }
    expect(responsiveExecution.visit.status).toBe('in_progress');
    expect(responsiveExecution.instance.status).toBe('draft');
    expect(responsiveExecution.score).toBeNull();
    expect(
      responsiveExecution.items.some(
        (item) =>
          ['not_started', 'in_progress', 'answered'].includes(item.status) &&
          !(item.lockedAt instanceof Date),
      ),
    ).toBe(true);
    expect(
      responsiveExecution.items.some((item) => {
        const config = item.itemConfigSnapshot;
        return (
          config !== null &&
          typeof config === 'object' &&
          (config.supportsPhotoUpload === true ||
            config.supportsHandwriting === true)
        );
      }),
    ).toBe(true);
    expect(
      await mediaModel.countDocuments({
        scaleInstanceId: responsiveExecution.instance._id,
      }),
    ).toBe(0);

    const originalVisitCode = networkConfirmation.visit.visitCode;
    await visitModel.collection.updateOne(
      { _id: networkConfirmation.visit._id },
      { $set: { visitCode: `${originalVisitCode}-MISSING` } },
    );
    try {
      await expectAsyncFixtureCode(
        () =>
          manager.verify(
            'resilience-security',
            RESILIENCE_NAMESPACE,
            testPassword,
            'prepared',
          ),
        'B8_FIXTURE_SCENARIO_INVALID',
      );
    } finally {
      await visitModel.collection.updateOne(
        { _id: networkConfirmation.visit._id },
        { $set: { visitCode: originalVisitCode } },
      );
    }

    await instanceModel.collection.updateOne(
      { _id: responsiveExecution.instance._id },
      { $set: { status: 'completed' } },
    );
    try {
      await expectAsyncFixtureCode(
        () =>
          manager.verify(
            'resilience-security',
            RESILIENCE_NAMESPACE,
            testPassword,
            'prepared',
          ),
        'B8_FIXTURE_SCENARIO_INVALID',
      );
    } finally {
      await instanceModel.collection.updateOne(
        { _id: responsiveExecution.instance._id },
        { $set: { status: 'draft' } },
      );
    }

    if (!networkManual.score) {
      throw new Error('Expected network manual score');
    }
    const originalItemScores = networkManual.score.toObject().itemScores;
    await scoreModel.collection.updateOne(
      { _id: networkManual.score._id },
      {
        $set: {
          itemScores: originalItemScores.map((item) => ({
            ...item,
            scoreStatus:
              item.scoreStatus === 'needs_review'
                ? 'auto_scored'
                : item.scoreStatus,
          })),
        },
      },
    );
    try {
      await expectAsyncFixtureCode(
        () =>
          manager.verify(
            'resilience-security',
            RESILIENCE_NAMESPACE,
            testPassword,
            'prepared',
          ),
        'B8_FIXTURE_SCENARIO_INVALID',
      );
    } finally {
      await scoreModel.collection.updateOne(
        { _id: networkManual.score._id },
        { $set: { itemScores: originalItemScores } },
      );
    }

    if (!networkConfirmation.score) {
      throw new Error('Expected network confirmation score');
    }
    const originalComputation =
      networkConfirmation.score.toObject().computation;
    await scoreModel.collection.updateOne(
      { _id: networkConfirmation.score._id },
      {
        $set: {
          'computation.warningCount': 1,
          'computation.notes': 'warning_codes=UNKNOWN_GROUP_CONFIGURATION',
        },
      },
    );
    try {
      await expectAsyncFixtureCode(
        () =>
          manager.verify(
            'resilience-security',
            RESILIENCE_NAMESPACE,
            testPassword,
            'prepared',
          ),
        'B8_FIXTURE_SCENARIO_INVALID',
      );
    } finally {
      await scoreModel.collection.updateOne(
        { _id: networkConfirmation.score._id },
        { $set: { computation: originalComputation } },
      );
    }

    await manager.verify(
      'resilience-security',
      RESILIENCE_NAMESPACE,
      testPassword,
      'prepared',
    );
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

    const targetScoredRoutes = [
      { scenarioKey: 'network_failure', routeKey: 'manual' },
      { scenarioKey: 'network_failure', routeKey: 'confirmation' },
      { scenarioKey: 'responsive_route_draft', routeKey: 'manual' },
      { scenarioKey: 'responsive_route_draft', routeKey: 'confirmation' },
    ] as const;
    for (const { scenarioKey, routeKey } of targetScoredRoutes) {
      const route = await targetRoute(scenarioKey, routeKey);
      if (!route.score) {
        throw new Error(`Expected score for ${scenarioKey}/${routeKey}`);
      }
      const originalOperatorNote = route.score.operatorNote;
      await scoreModel.collection.updateOne(
        { _id: route.score._id },
        { $set: { operatorNote: 'B8 unexpected target-route write' } },
      );
      try {
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
      } finally {
        await scoreModel.collection.updateOne(
          { _id: route.score._id },
          originalOperatorNote !== undefined
            ? { $set: { operatorNote: originalOperatorNote } }
            : { $unset: { operatorNote: '' } },
        );
      }
    }

    const execution = await targetRoute('responsive_route_draft', 'execution');
    const executionItem = execution.items[0];
    if (!executionItem) {
      throw new Error('Expected responsive execution item');
    }
    const originalRawResponse: unknown = executionItem.rawResponse;
    await itemModel.collection.updateOne(
      { _id: executionItem._id },
      { $set: { rawResponse: 'B8 unexpected answer write' } },
    );
    try {
      await expectAsyncFixtureCode(
        () =>
          manager.verify(
            'resilience-security',
            RESILIENCE_NAMESPACE,
            testPassword,
            'post-browser',
          ),
        'B8_FIXTURE_SOURCE_HASH_INVALID',
      );
    } finally {
      await itemModel.collection.updateOne(
        { _id: executionItem._id },
        originalRawResponse === undefined
          ? { $unset: { rawResponse: '' } }
          : { $set: { rawResponse: originalRawResponse } },
      );
    }

    const insertedMedia = await mediaModel.collection.insertOne({
      patientId: execution.patient._id,
      assessmentVisitId: execution.visit._id,
      scaleInstanceId: execution.instance._id,
      itemResponseId: executionItem._id,
      status: 'pending',
      b8UnexpectedWrite: true,
    });
    try {
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
    } finally {
      await mediaModel.collection.deleteOne({ _id: insertedMedia.insertedId });
    }
    await manager.verify(
      'resilience-security',
      RESILIENCE_NAMESPACE,
      testPassword,
      'post-browser',
    );

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
    const targetRoutes = await Promise.all([
      targetRoute('network_failure', 'manual'),
      targetRoute('network_failure', 'confirmation'),
      targetRoute('responsive_route_draft', 'manual'),
      targetRoute('responsive_route_draft', 'confirmation'),
      targetRoute('responsive_route_draft', 'execution'),
    ]);
    const targetPatientIds = [
      ...new Map(
        targetRoutes.map(({ patient }) => [
          patient._id.toString(),
          patient._id,
        ]),
      ).values(),
    ];
    const targetVisitIds = targetRoutes.map(({ visit }) => visit._id);
    const targetInstanceIds = targetRoutes.map(({ instance }) => instance._id);
    const targetScoreIds = targetRoutes.flatMap(({ score }) =>
      score ? [score._id] : [],
    );
    const targetItemIds = targetRoutes.flatMap(({ items }) =>
      items.map(({ _id }) => _id),
    );
    const targetMediaIds = await mediaModel.distinct('_id', {
      scaleInstanceId: { $in: targetInstanceIds },
    });
    expect(targetPatientIds).toHaveLength(2);
    expect(targetVisitIds).toHaveLength(5);
    expect(targetInstanceIds).toHaveLength(5);
    expect(targetScoreIds).toHaveLength(4);
    expect(targetItemIds.length).toBeGreaterThan(0);
    const firstResilience = await manager.cleanup(
      'resilience-security',
      RESILIENCE_NAMESPACE,
    );
    expect(firstResilience).toEqual(
      expect.objectContaining({ residualCount: 0, matched: true }),
    );
    expect(
      await patientModel.countDocuments({ _id: { $in: targetPatientIds } }),
    ).toBe(0);
    expect(
      await visitModel.countDocuments({ _id: { $in: targetVisitIds } }),
    ).toBe(0);
    expect(
      await instanceModel.countDocuments({ _id: { $in: targetInstanceIds } }),
    ).toBe(0);
    expect(
      await scoreModel.countDocuments({ _id: { $in: targetScoreIds } }),
    ).toBe(0);
    expect(
      await itemModel.countDocuments({ _id: { $in: targetItemIds } }),
    ).toBe(0);
    expect(
      await mediaModel.countDocuments({ _id: { $in: targetMediaIds } }),
    ).toBe(0);
    expect(
      await manager.cleanup('resilience-security', RESILIENCE_NAMESPACE),
    ).toEqual(expect.objectContaining({ residualCount: 0, matched: false }));
    expect(await seedHash()).toBe(preparedSeedHash);
  });
});
