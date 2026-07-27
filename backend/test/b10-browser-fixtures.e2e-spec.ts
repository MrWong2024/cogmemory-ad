import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import request, { type Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
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
import {
  CognitiveDomainResult,
  type CognitiveDomainResultDocument,
} from '../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
import {
  MediaEvidence,
  type MediaEvidenceDocument,
} from '../src/modules/media/schemas/media-evidence.schema';
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
  ScoreResult,
  type ScoreResultDocument,
} from '../src/modules/scoring/schemas/score-result.schema';
import {
  B10_AUDIT_IDS,
  B10_AUDIT_MATRIX,
  B10_PROFILES,
  B10_ROLES,
  B10_SCENARIOS,
  B10FixtureError,
  accountNameFor,
  assertB10Contract,
  assertB10PreImportEnvironment,
  assertB10RuntimeEnvironment,
  assertB10SafeManifest,
  auditMatrixFor,
  conflictIndexNameFor,
  requireB10FixturePassword,
  scenarioDefinitionsFor,
  scenarioSubjectCodeFor,
  scenarioVisitCodeFor,
  validateB10Namespace,
  validateB10Profile,
  type B10BusinessScenarioKey,
  type B10Profile,
} from './support/b10-browser-fixtures/fixture-contract';
import {
  createB10BrowserFixtureManager,
  isB10ProtectedCanonicalScaleVersion,
  type B10BrowserFixtureManager,
} from './support/b10-browser-fixtures/b10-browser-fixtures';
import {
  createB10BrowserHttpFaultMiddleware,
  hasB10BrowserHttpFaultEnvironment,
  resolveB10BrowserHttpFaultConfig,
} from './support/b10-browser-fixtures/browser-http-fault';
import { requireInitialized } from './support/e2e-initialization';

jest.setTimeout(600000);

const GENERATION_NAMESPACE = 'b10g-e2e-contract';
const PUBLIC_NAMESPACE = 'b10p-e2e-contract';

type RouteRoot = {
  patient: PatientDocument;
  visit: AssessmentVisitDocument;
  instances: ScaleInstanceDocument[];
};

type SupertestApp = NonNullable<Parameters<typeof request.agent>[0]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function body(response: Response): Record<string, unknown> {
  if (!isRecord(response.body)) {
    throw new Error('Expected response object');
  }
  return response.body;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${label} object`);
  }
  return value;
}

function objectArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${label} object array`);
  }
  return value.map((item: unknown) => {
    if (!isRecord(item)) {
      throw new Error(`Expected ${label} object array`);
    }
    return item;
  });
}

function canonicalMongoId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const candidate = value.trim().toLowerCase();
  if (!Types.ObjectId.isValid(candidate)) {
    return null;
  }
  return new Types.ObjectId(candidate).toString() === candidate
    ? candidate
    : null;
}

function scopeFromLatestPublicTraces(response: Response): string[] {
  const report = record(body(response).report, 'latest report');
  const traces = objectArray(report.scaleTraces, 'latest report traces');
  return [
    ...new Set(
      traces
        .map((trace) => canonicalMongoId(trace.scaleInstanceId))
        .filter((id): id is string => id !== null),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
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

function expectFixtureCode(action: () => void, code: string): void {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(B10FixtureError);
    if (error instanceof B10FixtureError) {
      expect(error.code).toBe(code);
    }
    return;
  }
  throw new Error(`Expected fixture error ${code}`);
}

describe('B10 profile-scoped browser fixture support (e2e)', () => {
  let app: INestApplication;
  let server: SupertestApp;
  let connection: Connection;
  let manager: B10BrowserFixtureManager;
  let patientModel: Model<PatientDocument>;
  let visitModel: Model<AssessmentVisitDocument>;
  let instanceModel: Model<ScaleInstanceDocument>;
  let itemModel: Model<ItemResponseDocument>;
  let mediaModel: Model<MediaEvidenceDocument>;
  let scoreModel: Model<ScoreResultDocument>;
  let domainModel: Model<CognitiveDomainResultDocument>;
  let reportModel: Model<ClinicalReportDocument>;
  let definitionModel: Model<ScaleDefinitionDocument>;
  let versionModel: Model<ScaleVersionDocument>;
  let scaleCatalog: ScaleCatalogService;
  let testPassword: string;
  let canonicalSeedHash: string;

  async function protectedSeedVersions() {
    const versions = await versionModel
      .find({ scaleCode: { $in: ['mmse', 'moca'] } })
      .sort({ scaleCode: 1, version: 1, _id: 1 })
      .lean()
      .exec();
    return versions.filter(isB10ProtectedCanonicalScaleVersion);
  }

  async function seedHash(): Promise<string> {
    const [definitions, versions] = await Promise.all([
      definitionModel
        .find({ code: { $in: ['mmse', 'moca'] } })
        .sort({ code: 1, _id: 1 })
        .lean()
        .exec(),
      protectedSeedVersions(),
    ]);
    return stableHash(withoutLifecycleTimestamps({ definitions, versions }));
  }

  async function ensureSeedReadiness(): Promise<string> {
    for (const scaleCode of ['mmse', 'moca'] as const) {
      await scaleCatalog.ensureSeedScaleVersionMaterialized(scaleCode);
    }
    return seedHash();
  }

  async function routeRoot(
    profile: B10Profile,
    namespace: string,
    scenarioKey: B10BusinessScenarioKey,
    routeKey: string,
  ): Promise<RouteRoot> {
    const definition = scenarioDefinitionsFor(profile).find(
      (candidate) => candidate.scenarioKey === scenarioKey,
    );
    if (!definition) {
      throw new Error(`Missing B10 scenario ${scenarioKey}`);
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
    const visit = patient
      ? await visitModel
          .findOne({
            patientId: patient._id,
            visitCode: scenarioVisitCodeFor(
              profile,
              namespace,
              definition.ordinal,
              routeKey,
            ),
          })
          .exec()
      : null;
    if (!patient || !visit) {
      throw new Error(`Missing B10 route ${scenarioKey}/${routeKey}`);
    }
    const instances = await instanceModel
      .find({ assessmentVisitId: visit._id })
      .sort({ instanceNo: 1, _id: 1 })
      .exec();
    return { patient, visit, instances };
  }

  async function profileBusinessHash(
    profile: B10Profile,
    namespace: string,
  ): Promise<string> {
    const subjectCodes = scenarioDefinitionsFor(profile).map(({ ordinal }) =>
      scenarioSubjectCodeFor(profile, namespace, ordinal),
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
    const [instances, items, media, scores, domains, reports, indexes] =
      await Promise.all([
        instanceModel.find(ownership).sort({ _id: 1 }).lean().exec(),
        itemModel.find(ownership).sort({ _id: 1 }).lean().exec(),
        mediaModel.find(ownership).sort({ _id: 1 }).lean().exec(),
        scoreModel.find(ownership).sort({ _id: 1 }).lean().exec(),
        domainModel.find(ownership).sort({ _id: 1 }).lean().exec(),
        reportModel.find(ownership).sort({ _id: 1 }).lean().exec(),
        reportModel.collection.listIndexes().toArray(),
      ]);
    return stableHash({
      patients,
      visits,
      instances,
      items,
      media,
      scores,
      domains,
      reports,
      conflictIndexes: indexes.filter(
        ({ name }) => name === conflictIndexNameFor(namespace),
      ),
    });
  }

  async function routeBusinessHash(root: RouteRoot): Promise<string> {
    const instanceIds = root.instances.map(({ _id }) => _id);
    const [patient, visit, instances, items, media, scores, domains, reports] =
      await Promise.all([
        patientModel.findById(root.patient._id).lean().exec(),
        visitModel.findById(root.visit._id).lean().exec(),
        instanceModel
          .find({ _id: { $in: instanceIds } })
          .sort({ _id: 1 })
          .lean()
          .exec(),
        itemModel
          .find({ scaleInstanceId: { $in: instanceIds } })
          .sort({ _id: 1 })
          .lean()
          .exec(),
        mediaModel
          .find({ scaleInstanceId: { $in: instanceIds } })
          .sort({ _id: 1 })
          .lean()
          .exec(),
        scoreModel
          .find({ scaleInstanceId: { $in: instanceIds } })
          .sort({ _id: 1 })
          .lean()
          .exec(),
        domainModel
          .find({ scaleInstanceId: { $in: instanceIds } })
          .sort({ _id: 1 })
          .lean()
          .exec(),
        reportModel
          .find({ assessmentVisitId: root.visit._id })
          .sort({ _id: 1 })
          .lean()
          .exec(),
      ]);
    return stableHash({
      patient,
      visit,
      instances,
      items,
      media,
      scores,
      domains,
      reports,
    });
  }

  function visitPath(root: RouteRoot): string {
    return `/patients/${root.patient._id.toString()}/visits/${root.visit._id.toString()}`;
  }

  function reportPath(root: RouteRoot): string {
    return `${visitPath(root)}/clinical-reports`;
  }

  async function expectPreparedFailure(
    profile: B10Profile,
    namespace: string,
  ): Promise<void> {
    await expect(
      manager.verify(profile, namespace, testPassword, 'prepared'),
    ).rejects.toBeInstanceOf(B10FixtureError);
  }

  async function expectStageFailure(): Promise<void> {
    await expect(
      manager.stage(
        'generation-workflow',
        GENERATION_NAMESPACE,
        testPassword,
        'scope_conflict',
        'base',
      ),
    ).rejects.toBeInstanceOf(B10FixtureError);
  }

  async function generateFirstReportThroughHttp(): Promise<RouteRoot> {
    const agent = request.agent(server);
    await agent
      .post('/auth/login')
      .send({
        accountName: accountNameFor(
          'generation-workflow',
          GENERATION_NAMESPACE,
          'doctor',
        ),
        password: testPassword,
      })
      .expect(201);
    const root = await routeRoot(
      'generation-workflow',
      GENERATION_NAMESPACE,
      'first_generate_success',
      'base',
    );
    const response = await agent
      .post(`${reportPath(root)}/generate`)
      .send({
        confirm: true,
        primaryScaleInstanceIds: root.instances.map(({ _id }) =>
          _id.toString(),
        ),
      })
      .expect(200);
    expect(body(response).alreadyGenerated).toBe(false);
    return root;
  }

  async function stageTarget(
    scenarioKey: 'scope_conflict' | 'source_readiness_errors',
  ) {
    return manager.stage(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
      scenarioKey,
      scenarioKey === 'scope_conflict' ? 'base' : 'scale_not_ready',
    );
  }

  async function mutateAndRestore(
    collection: Model<PatientDocument>['collection'],
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    verifyFailure: () => Promise<void>,
  ): Promise<void> {
    const original = await collection.findOne(filter);
    if (!original) {
      throw new Error('Missing mutation target');
    }
    try {
      await collection.updateOne(filter, update);
      await verifyFailure();
    } finally {
      await collection.replaceOne({ _id: original._id }, original);
    }
  }

  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      process.env.COGMEMORY_DATABASE_PURPOSE !== 'standard_test'
    ) {
      throw new Error('B10 fixture E2E requires standard_test isolation');
    }
    testPassword = `B10-${randomUUID()}-Aa1!`;
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
    const config = app.get(ConfigService);
    assertB10RuntimeEnvironment({
      nodeEnv: process.env.NODE_ENV,
      appEnv: config.get<string>('app.env'),
      databasePurpose: process.env.COGMEMORY_DATABASE_PURPOSE,
      databaseName: connection.name,
      storageDriver: config.get<string>('storage.driver'),
      llmProvider: config.get<string>('llm.provider'),
      smsProvider: config.get<string>('smsAuth.provider'),
      sessionCookieSecure: config.get<boolean>('session.cookieSecure'),
    });
    manager = createB10BrowserFixtureManager(app);
    patientModel = app.get(getModelToken(Patient.name));
    visitModel = app.get(getModelToken(AssessmentVisit.name));
    instanceModel = app.get(getModelToken(ScaleInstance.name));
    itemModel = app.get(getModelToken(ItemResponse.name));
    mediaModel = app.get(getModelToken(MediaEvidence.name));
    scoreModel = app.get(getModelToken(ScoreResult.name));
    domainModel = app.get(getModelToken(CognitiveDomainResult.name));
    reportModel = app.get(getModelToken(ClinicalReport.name));
    definitionModel = app.get(getModelToken(ScaleDefinition.name));
    versionModel = app.get(getModelToken(ScaleVersion.name));
    scaleCatalog = app.get(ScaleCatalogService);
    await manager.cleanup('generation-workflow', GENERATION_NAMESPACE);
    await manager.cleanup('public-surface-security', PUBLIC_NAMESPACE);
    canonicalSeedHash = await ensureSeedReadiness();
  });

  afterAll(async () => {
    if (manager) {
      await manager.cleanup('generation-workflow', GENERATION_NAMESPACE);
      await manager.cleanup('public-surface-security', PUBLIC_NAMESPACE);
    }
    if (app) {
      await app.close();
    }
    if (connection?.readyState) {
      await connection.close();
    }
  });

  it('materializes canonical MMSE/MoCA readiness before capturing a stable protected hash', async () => {
    expect(await ensureSeedReadiness()).toBe(canonicalSeedHash);
    expect(await ensureSeedReadiness()).toBe(canonicalSeedHash);
  });

  it('enforces 95 ordered audit IDs, exclusive 48/47 profiles, owners, route contracts, CLI confirmations, and safe manifests', () => {
    expect(() => assertB10Contract()).not.toThrow();
    expect(B10_AUDIT_IDS).toHaveLength(95);
    expect(B10_AUDIT_MATRIX).toHaveLength(95);
    expect(B10_AUDIT_MATRIX.map(({ auditId }) => auditId)).toEqual(
      B10_AUDIT_IDS,
    );
    expect(new Set(B10_AUDIT_MATRIX.map(({ auditId }) => auditId)).size).toBe(
      95,
    );
    expect(auditMatrixFor('generation-workflow')).toHaveLength(48);
    expect(auditMatrixFor('public-surface-security')).toHaveLength(47);
    expect(scenarioDefinitionsFor('generation-workflow')).toHaveLength(10);
    expect(scenarioDefinitionsFor('public-surface-security')).toHaveLength(13);
    expect(
      B10_SCENARIOS.every(
        (scenario) =>
          scenario.auditIds.includes(scenario.primaryOwnerAuditId) &&
          scenario.routeContracts.every(
            (routeValue) =>
              routeValue.automaticRetry === false &&
              routeValue.auditIds.length > 0,
          ),
      ),
    ).toBe(true);
    expect(B10_PROFILES).toEqual([
      'generation-workflow',
      'public-surface-security',
    ]);
    expect(B10_ROLES).toHaveLength(5);
    const stagedRoutes = B10_SCENARIOS.flatMap((scenario) =>
      scenario.routeContracts
        .filter(
          ({ browserActionPlan }) =>
            browserActionPlan.fixtureTransitionRequired,
        )
        .map(({ key, browserActionPlan }) => ({
          profile: scenario.profile,
          scenarioKey: scenario.scenarioKey,
          routeKey: key,
          transition: browserActionPlan.fixtureTransition,
        })),
    );
    expect(stagedRoutes).toEqual([
      {
        profile: 'generation-workflow',
        scenarioKey: 'scope_conflict',
        routeKey: 'base',
        transition: 'stage-different-scope-draft',
      },
      {
        profile: 'generation-workflow',
        scenarioKey: 'source_readiness_errors',
        routeKey: 'scale_not_ready',
        transition: 'stage-source-scale-not-ready',
      },
    ]);
    expectFixtureCode(
      () => validateB10Profile('core-workflow'),
      'B10_FIXTURE_PROFILE_INVALID',
    );
    expectFixtureCode(
      () => validateB10Namespace('generation-workflow', 'b10p-wrong'),
      'B10_FIXTURE_NAMESPACE_INVALID',
    );
    expectFixtureCode(
      () => requireB10FixturePassword('short'),
      'B10_FIXTURE_PASSWORD_REQUIRED',
    );
    expectFixtureCode(
      () => assertB10PreImportEnvironment('development'),
      'B10_FIXTURE_ENVIRONMENT_UNSAFE',
    );
    expect(() =>
      assertB10SafeManifest({
        namespace: 'b10g-safe',
        databaseName: 'cogmemory_ad_test',
        profile: 'generation-workflow',
        phase: 'prepared',
        roles: [],
        scenarios: [],
        auditMatrix: [],
        resourceCounts: {
          roles: 0,
          patients: 0,
          visits: 0,
          instances: 0,
          itemResponses: 0,
          mediaEvidence: 0,
          scoreResults: 0,
          cognitiveDomainResults: 0,
          clinicalReports: 0,
          companionReports: 0,
          ownedIndexes: 0,
        },
        seedHashUnchanged: true,
        expectedSummary: 'safe',
      }),
    ).not.toThrow();
    expectFixtureCode(
      () => assertB10SafeManifest({ metadata: 'forbidden' }),
      'B10_FIXTURE_MANIFEST_UNSAFE',
    );

    const script = 'scripts/b10-browser-fixtures.ts';
    const cleanupWithoutConfirmation = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-r',
        'tsconfig-paths/register',
        script,
        'cleanup',
        '--profile',
        'generation-workflow',
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
        encoding: 'utf8',
        timeout: 30000,
      },
    );
    const replaceWithoutConfirmation = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-r',
        'tsconfig-paths/register',
        script,
        'replace',
        '--profile',
        'generation-workflow',
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
        encoding: 'utf8',
        timeout: 30000,
      },
    );
    expect(cleanupWithoutConfirmation.status).toBe(1);
    expect(cleanupWithoutConfirmation.stderr).toContain(
      'B10_FIXTURE_CLEANUP_CONFIRMATION_REQUIRED',
    );
    expect(replaceWithoutConfirmation.status).toBe(1);
    expect(replaceWithoutConfirmation.stderr).toContain(
      'B10_FIXTURE_REPLACE_CONFIRMATION_REQUIRED',
    );
    const stageWithoutConfirmation = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-r',
        'tsconfig-paths/register',
        script,
        'stage',
        '--profile',
        'generation-workflow',
        '--scenario',
        'scope_conflict',
        '--route',
        'base',
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
        encoding: 'utf8',
        timeout: 30000,
      },
    );
    const stageWrongProfile = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-r',
        'tsconfig-paths/register',
        script,
        'stage',
        '--profile',
        'public-surface-security',
        '--scenario',
        'scope_conflict',
        '--route',
        'base',
        '--confirm-stage',
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
        encoding: 'utf8',
        timeout: 30000,
      },
    );
    const stageArgsOnPrepare = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-r',
        'tsconfig-paths/register',
        script,
        'prepare',
        '--profile',
        'generation-workflow',
        '--scenario',
        'scope_conflict',
        '--route',
        'base',
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
        encoding: 'utf8',
        timeout: 30000,
      },
    );
    expect(stageWithoutConfirmation.status).toBe(1);
    expect(stageWithoutConfirmation.stderr).toContain(
      'B10_FIXTURE_STAGE_CONFIRMATION_REQUIRED',
    );
    expect(stageWrongProfile.status).toBe(1);
    expect(stageWrongProfile.stderr).toContain(
      'B10_FIXTURE_STAGE_TARGET_NOT_ALLOWED',
    );
    expect(stageArgsOnPrepare.status).toBe(1);
    expect(stageArgsOnPrepare.stderr).toContain(
      'B10_FIXTURE_STAGE_ARGUMENT_NOT_ALLOWED',
    );
  });

  it('prepares and read-only verifies independent profiles while refusing overwrite and unexecuted post-browser phases', async () => {
    const generation = await manager.prepare(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
    );
    const publicSurface = await manager.prepare(
      'public-surface-security',
      PUBLIC_NAMESPACE,
      testPassword,
    );
    expect(generation.auditMatrix).toHaveLength(48);
    expect(publicSurface.auditMatrix).toHaveLength(47);
    expect(generation.resourceCounts.patients).toBe(10);
    expect(publicSurface.resourceCounts.patients).toBe(13);
    expect(generation.seedHashUnchanged).toBe(true);
    expect(publicSurface.seedHashUnchanged).toBe(true);
    expect(() => assertB10SafeManifest(generation)).not.toThrow();
    expect(() => assertB10SafeManifest(publicSurface)).not.toThrow();
    await expect(
      manager.prepare(
        'generation-workflow',
        GENERATION_NAMESPACE,
        testPassword,
      ),
    ).rejects.toMatchObject({ code: 'B10_FIXTURE_NAMESPACE_EXISTS' });
    const generationHash = await profileBusinessHash(
      'generation-workflow',
      GENERATION_NAMESPACE,
    );
    await manager.verify(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
      'prepared',
    );
    expect(
      await profileBusinessHash('generation-workflow', GENERATION_NAMESPACE),
    ).toBe(generationHash);
    await expect(
      manager.verify(
        'generation-workflow',
        GENERATION_NAMESPACE,
        testPassword,
        'post-browser',
      ),
    ).rejects.toBeInstanceOf(B10FixtureError);
    await expect(
      manager.verify(
        'public-surface-security',
        PUBLIC_NAMESPACE,
        testPassword,
        'post-browser',
      ),
    ).rejects.toBeInstanceOf(B10FixtureError);
  });

  it('detects upstream source, report, conflict-resource, cross-profile, and canonical seed drift without repair', async () => {
    const source = await routeRoot(
      'generation-workflow',
      GENERATION_NAMESPACE,
      'first_generate_success',
      'base',
    );
    const sourceInstance = source.instances[0];
    const item = await itemModel.findOne({
      scaleInstanceId: sourceInstance._id,
    });
    const media = await mediaModel.findOne({
      scaleInstanceId: sourceInstance._id,
    });
    const score = await scoreModel.findOne({
      scaleInstanceId: sourceInstance._id,
    });
    const domain = await domainModel.findOne({
      scaleInstanceId: sourceInstance._id,
    });
    if (!item || !media || !score || !domain) {
      throw new Error('Missing first-generation source chain');
    }
    for (const [collection, filter, update] of [
      [
        itemModel.collection,
        { _id: item._id },
        { $set: { operatorNote: 'unexpected drift' } },
      ],
      [
        mediaModel.collection,
        { _id: media._id },
        { $set: { qualityStatus: 'needs_review' } },
      ],
      [
        scoreModel.collection,
        { _id: score._id },
        { $set: { qualityStatus: 'needs_review' } },
      ],
      [
        domainModel.collection,
        { _id: domain._id },
        { $set: { qualityStatus: 'passed' } },
      ],
    ] as const) {
      await mutateAndRestore(collection, filter, update, () =>
        expectPreparedFailure('generation-workflow', GENERATION_NAMESPACE),
      );
    }

    const idempotent = await routeRoot(
      'generation-workflow',
      GENERATION_NAMESPACE,
      'idempotent_generate',
      'base',
    );
    const idempotentReport = await reportModel.findOne({
      assessmentVisitId: idempotent.visit._id,
    });
    if (!idempotentReport) {
      throw new Error('Missing idempotent report');
    }
    await mutateAndRestore(
      reportModel.collection,
      { _id: idempotentReport._id },
      { $set: { source: 'mixed' } },
      () => expectPreparedFailure('generation-workflow', GENERATION_NAMESPACE),
    );

    const generationConflict = await routeRoot(
      'generation-workflow',
      GENERATION_NAMESPACE,
      'generation_conflict',
      'base',
    );
    await reportModel.collection.dropIndex(
      conflictIndexNameFor(GENERATION_NAMESPACE),
    );
    await expectPreparedFailure('generation-workflow', GENERATION_NAMESPACE);
    await reportModel.collection.createIndex(
      { assessmentVisitId: 1 },
      {
        name: conflictIndexNameFor(GENERATION_NAMESPACE),
        unique: true,
        partialFilterExpression: {
          subjectCode: generationConflict.patient.subjectCode,
        },
      },
    );

    await mutateAndRestore(
      patientModel.collection,
      { _id: source.patient._id },
      { $set: { 'metadata.b10Fixture.profile': 'public-surface-security' } },
      () => expectPreparedFailure('generation-workflow', GENERATION_NAMESPACE),
    );

    const protectedVersion = await versionModel
      .findOne({ status: 'active', scaleCode: { $in: ['mmse', 'moca'] } })
      .lean()
      .exec();
    if (!protectedVersion) {
      throw new Error('Missing canonical scale version');
    }
    await mutateAndRestore(
      versionModel.collection,
      { _id: protectedVersion._id },
      { $set: { displayVersion: 'B10 controlled seed drift' } },
      () => expectPreparedFailure('generation-workflow', GENERATION_NAMESPACE),
    );
    expect(await seedHash()).toBe(canonicalSeedHash);
    await manager.verify(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
      'prepared',
    );
  });

  it('rejects every non-allowlisted Stage baseline drift and restores each mutation', async () => {
    await manager.replace(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
    );
    const first = await generateFirstReportThroughHttp();
    const firstReport = await reportModel.findOne({
      assessmentVisitId: first.visit._id,
    });
    if (!firstReport) {
      throw new Error('Missing first-generated report');
    }
    await mutateAndRestore(
      reportModel.collection,
      { _id: firstReport._id },
      { $set: { status: 'confirmed' } },
      expectStageFailure,
    );
    const firstRaw = await reportModel.collection.findOne({
      _id: firstReport._id,
    });
    if (!firstRaw) {
      throw new Error('Missing raw first-generated report');
    }
    const duplicate = {
      ...firstRaw,
      _id: new Types.ObjectId(),
      reportCode: `${String(firstRaw.reportCode)}-DUPLICATE`,
    };
    try {
      await reportModel.collection.insertOne(duplicate);
      await expectStageFailure();
    } finally {
      await reportModel.collection.deleteOne({ _id: duplicate._id });
    }

    await manager.replace(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
    );
    const nonTarget = await routeRoot(
      'generation-workflow',
      GENERATION_NAMESPACE,
      'latest_lifecycle',
      'not_found',
    );
    const foreignReport = {
      ...firstRaw,
      _id: new Types.ObjectId(),
      patientId: nonTarget.patient._id,
      assessmentVisitId: nonTarget.visit._id,
      primaryScaleInstanceIds: [nonTarget.instances[0]._id],
      reportCode: `${String(firstRaw.reportCode)}-FOREIGN`,
    };
    try {
      await reportModel.collection.insertOne(foreignReport);
      await expectStageFailure();
    } finally {
      await reportModel.collection.deleteOne({ _id: foreignReport._id });
    }

    await stageTarget('scope_conflict');
    const stagedScope = await routeRoot(
      'generation-workflow',
      GENERATION_NAMESPACE,
      'scope_conflict',
      'base',
    );
    const stagedReport = await reportModel.findOne({
      assessmentVisitId: stagedScope.visit._id,
    });
    if (!stagedReport) {
      throw new Error('Missing staged scope-conflict report');
    }
    await mutateAndRestore(
      reportModel.collection,
      { _id: stagedReport._id },
      { $set: { 'metadata.b10FixtureStage.namespace': 'b10g-wrong' } },
      expectStageFailure,
    );

    await manager.replace(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
    );
    const scaleNotReady = await routeRoot(
      'generation-workflow',
      GENERATION_NAMESPACE,
      'source_readiness_errors',
      'scale_not_ready',
    );
    await stageTarget('source_readiness_errors');
    await mutateAndRestore(
      instanceModel.collection,
      { _id: scaleNotReady.instances[0]._id },
      { $set: { status: 'draft' } },
      expectStageFailure,
    );
    const unrelatedInstance = (
      await routeRoot(
        'generation-workflow',
        GENERATION_NAMESPACE,
        'first_generate_success',
        'base',
      )
    ).instances[0];
    await mutateAndRestore(
      instanceModel.collection,
      { _id: unrelatedInstance._id },
      { $set: { status: 'in_progress' } },
      expectStageFailure,
    );
    const unrelatedItem = await itemModel.findOne({
      scaleInstanceId: unrelatedInstance._id,
    });
    if (!unrelatedItem) {
      throw new Error('Missing unrelated source item');
    }
    await mutateAndRestore(
      itemModel.collection,
      { _id: unrelatedItem._id },
      { $set: { operatorNote: 'unexpected Stage drift' } },
      expectStageFailure,
    );

    const protectedVersion = await versionModel.findOne({
      status: 'active',
      scaleCode: { $in: ['mmse', 'moca'] },
    });
    if (!protectedVersion) {
      throw new Error('Missing protected seed version');
    }
    await mutateAndRestore(
      versionModel.collection,
      { _id: protectedVersion._id },
      { $set: { displayVersion: 'unexpected Stage seed drift' } },
      expectStageFailure,
    );

    await manager.replace(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
    );
    const preparedReport = await reportModel.findOne({
      reportType: 'cognitive_assessment',
      subjectCode: {
        $regex: `^B10G-${GENERATION_NAMESPACE.toUpperCase()}-`,
      },
    });
    if (!preparedReport) {
      throw new Error('Missing prepared report for resource-count drift');
    }
    const preparedRaw = await reportModel.collection.findOne({
      _id: preparedReport._id,
    });
    if (!preparedRaw) {
      throw new Error('Missing raw prepared report');
    }
    try {
      await reportModel.collection.deleteOne({ _id: preparedReport._id });
      await expectStageFailure();
    } finally {
      await reportModel.collection.insertOne(preparedRaw);
    }

    const ownedPatient = await patientModel.findOne({
      'metadata.b10Fixture.namespace': GENERATION_NAMESPACE,
    });
    if (!ownedPatient) {
      throw new Error('Missing owned patient for profile drift');
    }
    await mutateAndRestore(
      patientModel.collection,
      { _id: ownedPatient._id },
      { $set: { 'metadata.b10Fixture.profile': 'public-surface-security' } },
      expectStageFailure,
    );
    expect(await seedHash()).toBe(canonicalSeedHash);
    await manager.verify(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
      'prepared',
    );
  });

  it('accepts all six prepared/first-generate Stage orders and repeated idempotent calls', async () => {
    const results: Array<{
      firstGenerated: boolean;
      order: Array<'scope_conflict' | 'source_readiness_errors'>;
      reports: number;
    }> = [];
    const sequences: Array<{
      firstGenerated: boolean;
      order: Array<'scope_conflict' | 'source_readiness_errors'>;
    }> = [
      { firstGenerated: false, order: ['scope_conflict'] },
      { firstGenerated: false, order: ['source_readiness_errors'] },
      { firstGenerated: true, order: ['scope_conflict'] },
      { firstGenerated: true, order: ['source_readiness_errors'] },
      {
        firstGenerated: true,
        order: ['scope_conflict', 'source_readiness_errors'],
      },
      {
        firstGenerated: true,
        order: ['source_readiness_errors', 'scope_conflict'],
      },
    ];
    for (const sequence of sequences) {
      await manager.replace(
        'generation-workflow',
        GENERATION_NAMESPACE,
        testPassword,
      );
      if (sequence.firstGenerated) {
        await generateFirstReportThroughHttp();
      }
      for (const scenarioKey of sequence.order) {
        const firstStage = await stageTarget(scenarioKey);
        const repeatedStage = await stageTarget(scenarioKey);
        expect(firstStage.alreadyStaged).toBe(false);
        expect(repeatedStage).toEqual({
          ...firstStage,
          alreadyStaged: true,
        });
      }
      results.push({
        ...sequence,
        reports: await reportModel.countDocuments({
          subjectCode: {
            $regex: `^B10G-${GENERATION_NAMESPACE.toUpperCase()}-`,
          },
        }),
      });
    }
    expect(results).toHaveLength(6);
    expect(results.map(({ reports }) => reports)).toEqual([6, 5, 7, 6, 7, 7]);
    expect(await seedHash()).toBe(canonicalSeedHash);
  });

  it('enforces the fixed Browser HTTP fault config and proves one real 500 with zero business writes', async () => {
    await manager.replace(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
    );
    const faultEnvironment: NodeJS.ProcessEnv = {
      B10_BROWSER_HTTP_FAULT_PROFILE: 'generation-workflow',
      B10_BROWSER_HTTP_FAULT_NAMESPACE: GENERATION_NAMESPACE,
      B10_BROWSER_HTTP_FAULT_SCENARIO: 'latest_lifecycle',
      B10_BROWSER_HTTP_FAULT_ROUTE: 'latest_failure',
      B10_BROWSER_HTTP_FAULT_ONCE: 'true',
      B10_FIXTURE_PASSWORD: testPassword,
    };
    const browserRuntime = {
      nodeEnv: 'test',
      databasePurpose: 'browser_acceptance',
      databaseName: 'cogmemory_ad_browser_test',
    };
    expect(hasB10BrowserHttpFaultEnvironment({})).toBe(false);
    expect(resolveB10BrowserHttpFaultConfig({}, browserRuntime)).toBeNull();
    expect(hasB10BrowserHttpFaultEnvironment(faultEnvironment)).toBe(true);
    expect(
      resolveB10BrowserHttpFaultConfig(faultEnvironment, browserRuntime),
    ).toMatchObject({
      profile: 'generation-workflow',
      namespace: GENERATION_NAMESPACE,
      scenarioKey: 'latest_lifecycle',
      routeKey: 'latest_failure',
    });
    for (const environment of [
      { B10_BROWSER_HTTP_FAULT_PROFILE: 'generation-workflow' },
      { ...faultEnvironment, B10_BROWSER_HTTP_FAULT_PROFILE: 'wrong' },
      { ...faultEnvironment, B10_BROWSER_HTTP_FAULT_SCENARIO: 'wrong' },
      { ...faultEnvironment, B10_BROWSER_HTTP_FAULT_ROUTE: 'wrong' },
      { ...faultEnvironment, B10_BROWSER_HTTP_FAULT_ONCE: 'false' },
      { ...faultEnvironment, B10_BROWSER_HTTP_FAULT_PATH: '/custom' },
      { ...faultEnvironment, B10_BROWSER_HTTP_FAULT_STATUS: '503' },
      { ...faultEnvironment, B10_BROWSER_HTTP_FAULT_BODY: 'custom' },
    ]) {
      expect(() =>
        resolveB10BrowserHttpFaultConfig(environment, browserRuntime),
      ).toThrow(B10FixtureError);
    }
    for (const runtime of [
      { ...browserRuntime, nodeEnv: 'development' },
      { ...browserRuntime, databasePurpose: 'standard_test' },
      { ...browserRuntime, databaseName: 'cogmemory_ad_test' },
    ]) {
      expect(() =>
        resolveB10BrowserHttpFaultConfig(faultEnvironment, runtime),
      ).toThrow(B10FixtureError);
    }
    await expect(
      manager.resolveBrowserHttpFaultTarget(
        'generation-workflow',
        GENERATION_NAMESPACE,
        'B10-wrong-password-Aa1!',
      ),
    ).rejects.toMatchObject({ code: 'B10_FIXTURE_ACCOUNT_INVALID' });

    const target = await manager.resolveBrowserHttpFaultTarget(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
    );
    const normalAgent = request.agent(server);
    await normalAgent
      .post('/auth/login')
      .send({
        accountName: accountNameFor(
          'generation-workflow',
          GENERATION_NAMESPACE,
          'doctor',
        ),
        password: testPassword,
      })
      .expect(201);
    await normalAgent.get(target.path).expect(404);

    const before = await profileBusinessHash(
      'generation-workflow',
      GENERATION_NAMESPACE,
    );
    const faultModuleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const faultApp = faultModuleRef.createNestApplication();
    configureApp(faultApp);
    faultApp.use(createB10BrowserHttpFaultMiddleware(target));
    await faultApp.init();
    try {
      const faultServer = requireInitialized<SupertestApp>(
        faultApp.getHttpServer() as SupertestApp | undefined,
        'fault HTTP server',
      );
      const faultAgent = request.agent(faultServer);
      await faultAgent
        .post('/auth/login')
        .send({
          accountName: accountNameFor(
            'generation-workflow',
            GENERATION_NAMESPACE,
            'doctor',
          ),
          password: testPassword,
        })
        .expect(201);
      await faultAgent.post(target.path).expect(404);
      const first = await faultAgent
        .get(target.path)
        .set('Origin', 'http://localhost:3002')
        .expect(500);
      expect(body(first)).toMatchObject({
        statusCode: 500,
        path: '/patients/:patientId/visits/:visitId/clinical-reports/latest',
        message: 'Internal server error',
      });
      expect(typeof body(first).timestamp).toBe('string');
      expect(JSON.stringify(body(first))).not.toMatch(/[a-f\d]{24}/i);
      expect(first.headers['access-control-allow-origin']).toBe(
        'http://localhost:3002',
      );
      expect(first.headers['access-control-allow-credentials']).toBe('true');
      const second = await faultAgent.get(target.path).expect(404);
      expect(body(second).code).toBe('CLINICAL_REPORT_NOT_FOUND');
      const unrelated = await routeRoot(
        'generation-workflow',
        GENERATION_NAMESPACE,
        'latest_lifecycle',
        'not_found',
      );
      const unrelatedResponse = await faultAgent
        .get(`${reportPath(unrelated)}/latest`)
        .expect(404);
      expect(body(unrelatedResponse).code).toBe('CLINICAL_REPORT_NOT_FOUND');
    } finally {
      await faultApp.close();
    }
    expect(
      await profileBusinessHash('generation-workflow', GENERATION_NAMESPACE),
    ).toBe(before);
  });

  it('proves the five remaining routes through real latest/generate HTTP and fixed idempotent stages', async () => {
    await expect(
      manager.stage(
        'public-surface-security',
        PUBLIC_NAMESPACE,
        testPassword,
        'scope_conflict',
        'base',
      ),
    ).rejects.toMatchObject({ code: 'B10_FIXTURE_STAGE_TARGET_NOT_ALLOWED' });
    await expect(
      manager.stage(
        'generation-workflow',
        GENERATION_NAMESPACE,
        testPassword,
        'idempotent_generate',
        'base',
      ),
    ).rejects.toMatchObject({ code: 'B10_FIXTURE_STAGE_TARGET_NOT_ALLOWED' });
    await expect(
      manager.stage(
        'generation-workflow',
        GENERATION_NAMESPACE,
        'short',
        'scope_conflict',
        'base',
      ),
    ).rejects.toMatchObject({ code: 'B10_FIXTURE_PASSWORD_REQUIRED' });

    const doctorAgent = request.agent(server);
    const nurseAgent = request.agent(server);
    await doctorAgent
      .post('/auth/login')
      .send({
        accountName: accountNameFor(
          'generation-workflow',
          GENERATION_NAMESPACE,
          'doctor',
        ),
        password: testPassword,
      })
      .expect(201);
    await nurseAgent
      .post('/auth/login')
      .send({
        accountName: accountNameFor(
          'generation-workflow',
          GENERATION_NAMESPACE,
          'nurse',
        ),
        password: testPassword,
      })
      .expect(201);

    const idempotent = await routeRoot(
      'generation-workflow',
      GENERATION_NAMESPACE,
      'idempotent_generate',
      'base',
    );
    const idempotentLatest = await nurseAgent
      .get(`${reportPath(idempotent)}/latest`)
      .expect(200);
    const idempotentScope = scopeFromLatestPublicTraces(idempotentLatest);
    expect(idempotentScope).toHaveLength(1);
    const idempotentBefore = await routeBusinessHash(idempotent);
    const idempotentGenerate = await nurseAgent
      .post(`${reportPath(idempotent)}/generate`)
      .send({
        confirm: true,
        primaryScaleInstanceIds: idempotentScope,
      })
      .expect(200);
    expect(body(idempotentGenerate).alreadyGenerated).toBe(true);
    expect(await routeBusinessHash(idempotent)).toBe(idempotentBefore);

    const scopeConflict = await routeRoot(
      'generation-workflow',
      GENERATION_NAMESPACE,
      'scope_conflict',
      'base',
    );
    const scopeMissing = await doctorAgent
      .get(`${reportPath(scopeConflict)}/latest`)
      .expect(404);
    expect(body(scopeMissing).code).toBe('CLINICAL_REPORT_NOT_FOUND');
    const scopeDetail = body(
      await doctorAgent.get(visitPath(scopeConflict)).expect(200),
    );
    const scopeCandidates = objectArray(
      scopeDetail.scaleInstances,
      'scope-conflict candidates',
    ).filter(
      (candidate) =>
        (candidate.status === 'completed' || candidate.status === 'locked') &&
        canonicalMongoId(candidate.id) !== null,
    );
    expect(scopeCandidates).toHaveLength(2);
    const selectedScope = canonicalMongoId(
      [...scopeCandidates].sort(
        (left, right) => Number(left.instanceNo) - Number(right.instanceNo),
      )[1].id,
    );
    if (!selectedScope) {
      throw new Error('Missing selected scope-conflict candidate');
    }
    const scopeStageOne = await manager.stage(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
      'scope_conflict',
      'base',
    );
    const scopeStageTwo = await manager.stage(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
      'scope_conflict',
      'base',
    );
    expect(scopeStageOne).toEqual({
      scenarioKey: 'scope_conflict',
      routeKey: 'base',
      staged: true,
      alreadyStaged: false,
      seedHashUnchanged: true,
    });
    expect(scopeStageTwo).toEqual({
      ...scopeStageOne,
      alreadyStaged: true,
    });
    expect(JSON.stringify(scopeStageOne)).not.toMatch(/[a-f\d]{24}/i);
    const stagedScopeReport = await reportModel.findOne({
      assessmentVisitId: scopeConflict.visit._id,
      reportType: 'cognitive_assessment',
    });
    if (!stagedScopeReport) {
      throw new Error('Missing fixed staged scope-conflict report');
    }
    expect(stagedScopeReport.primaryScaleInstanceIds[0]?.toString()).not.toBe(
      selectedScope,
    );
    const stagedScopeHash = stableHash(stagedScopeReport.toObject());
    const scopeConflictResponse = await doctorAgent
      .post(`${reportPath(scopeConflict)}/generate`)
      .send({
        confirm: true,
        primaryScaleInstanceIds: [selectedScope],
      })
      .expect(409);
    expect(body(scopeConflictResponse).code).toBe(
      'CLINICAL_REPORT_SCOPE_CONFLICT',
    );
    const stagedLatest = await doctorAgent
      .get(`${reportPath(scopeConflict)}/latest`)
      .expect(200);
    expect(scopeFromLatestPublicTraces(stagedLatest)).not.toContain(
      selectedScope,
    );
    const scopeReportsAfter = await reportModel.find({
      assessmentVisitId: scopeConflict.visit._id,
    });
    expect(scopeReportsAfter).toHaveLength(1);
    expect(stableHash(scopeReportsAfter[0].toObject())).toBe(stagedScopeHash);

    const generationConflict = await routeRoot(
      'generation-workflow',
      GENERATION_NAMESPACE,
      'generation_conflict',
      'base',
    );
    const generationInitialLatest = await doctorAgent
      .get(`${reportPath(generationConflict)}/latest`)
      .expect(404);
    expect(body(generationInitialLatest).code).toBe(
      'CLINICAL_REPORT_NOT_FOUND',
    );
    const generationDetail = body(
      await doctorAgent.get(visitPath(generationConflict)).expect(200),
    );
    const generationCandidate = canonicalMongoId(
      objectArray(
        generationDetail.scaleInstances,
        'generation-conflict candidates',
      ).find(
        (candidate) =>
          candidate.status === 'completed' || candidate.status === 'locked',
      )?.id,
    );
    if (!generationCandidate) {
      throw new Error('Missing generation-conflict candidate');
    }
    const generationBefore = await routeBusinessHash(generationConflict);
    const indexesBefore: unknown = await reportModel.collection
      .listIndexes()
      .toArray();
    const conflictIndexBefore = objectArray(
      indexesBefore,
      'generation-conflict indexes before',
    ).find(({ name }) => name === conflictIndexNameFor(GENERATION_NAMESPACE));
    const generationResponse = await doctorAgent
      .post(`${reportPath(generationConflict)}/generate`)
      .send({
        confirm: true,
        primaryScaleInstanceIds: [generationCandidate],
      })
      .expect(409);
    expect(body(generationResponse).code).toBe(
      'CLINICAL_REPORT_GENERATION_CONFLICT',
    );
    const generationLatestAfter = await doctorAgent
      .get(`${reportPath(generationConflict)}/latest`)
      .expect(404);
    expect(body(generationLatestAfter).code).toBe('CLINICAL_REPORT_NOT_FOUND');
    expect(await routeBusinessHash(generationConflict)).toBe(generationBefore);
    const indexesAfter: unknown = await reportModel.collection
      .listIndexes()
      .toArray();
    const conflictIndexAfter = objectArray(
      indexesAfter,
      'generation-conflict indexes after',
    ).find(({ name }) => name === conflictIndexNameFor(GENERATION_NAMESPACE));
    expect(conflictIndexAfter).toEqual(conflictIndexBefore);

    const scaleNotReady = await routeRoot(
      'generation-workflow',
      GENERATION_NAMESPACE,
      'source_readiness_errors',
      'scale_not_ready',
    );
    await doctorAgent.get(`${reportPath(scaleNotReady)}/latest`).expect(404);
    const scaleDetail = body(
      await doctorAgent.get(visitPath(scaleNotReady)).expect(200),
    );
    const scaleCandidate = objectArray(
      scaleDetail.scaleInstances,
      'scale-not-ready candidates',
    ).find(
      (candidate) =>
        candidate.status === 'completed' || candidate.status === 'locked',
    );
    const cachedScaleId = canonicalMongoId(scaleCandidate?.id);
    if (!cachedScaleId) {
      throw new Error('Missing initially eligible scale-not-ready candidate');
    }
    const scaleInstanceBefore = await instanceModel
      .findById(scaleNotReady.instances[0]._id)
      .lean()
      .exec();
    if (!scaleInstanceBefore || scaleInstanceBefore.status !== 'completed') {
      throw new Error('Scale-not-ready prepared source is not completed');
    }
    const companionFilter = {
      scaleInstanceId: scaleNotReady.instances[0]._id,
    };
    const companionHashBefore = stableHash(
      await Promise.all([
        itemModel.find(companionFilter).sort({ _id: 1 }).lean().exec(),
        mediaModel.find(companionFilter).sort({ _id: 1 }).lean().exec(),
        scoreModel.find(companionFilter).sort({ _id: 1 }).lean().exec(),
        domainModel.find(companionFilter).sort({ _id: 1 }).lean().exec(),
      ]),
    );
    expect(await scoreModel.countDocuments(companionFilter)).toBe(1);
    expect(await domainModel.countDocuments(companionFilter)).toBe(1);
    const readinessStageOne = await manager.stage(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
      'source_readiness_errors',
      'scale_not_ready',
    );
    const readinessStageTwo = await manager.stage(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
      'source_readiness_errors',
      'scale_not_ready',
    );
    expect(readinessStageOne).toMatchObject({
      scenarioKey: 'source_readiness_errors',
      routeKey: 'scale_not_ready',
      staged: true,
      alreadyStaged: false,
      seedHashUnchanged: true,
    });
    expect(readinessStageTwo).toEqual({
      ...readinessStageOne,
      alreadyStaged: true,
    });
    expect(JSON.stringify(readinessStageOne)).not.toMatch(/[a-f\d]{24}/i);
    const scaleInstanceAfterStage = await instanceModel
      .findById(scaleNotReady.instances[0]._id)
      .lean()
      .exec();
    expect(scaleInstanceAfterStage).toEqual({
      ...scaleInstanceBefore,
      status: 'in_progress',
    });
    expect(
      stableHash(
        await Promise.all([
          itemModel.find(companionFilter).sort({ _id: 1 }).lean().exec(),
          mediaModel.find(companionFilter).sort({ _id: 1 }).lean().exec(),
          scoreModel.find(companionFilter).sort({ _id: 1 }).lean().exec(),
          domainModel.find(companionFilter).sort({ _id: 1 }).lean().exec(),
        ]),
      ),
    ).toBe(companionHashBefore);
    const scaleRouteAfterStage = await routeBusinessHash(
      await routeRoot(
        'generation-workflow',
        GENERATION_NAMESPACE,
        'source_readiness_errors',
        'scale_not_ready',
      ),
    );
    const scaleResponse = await doctorAgent
      .post(`${reportPath(scaleNotReady)}/generate`)
      .send({
        confirm: true,
        primaryScaleInstanceIds: [cachedScaleId],
      })
      .expect(409);
    expect(body(scaleResponse).code).toBe(
      'CLINICAL_REPORT_SOURCE_SCALE_NOT_READY',
    );
    expect(
      await routeBusinessHash(
        await routeRoot(
          'generation-workflow',
          GENERATION_NAMESPACE,
          'source_readiness_errors',
          'scale_not_ready',
        ),
      ),
    ).toBe(scaleRouteAfterStage);
    expect(
      await reportModel.countDocuments({
        assessmentVisitId: scaleNotReady.visit._id,
      }),
    ).toBe(0);
    expect(await seedHash()).toBe(canonicalSeedHash);
  });

  it('accepts the controlled first-generate terminal state and public zero-business-write state while preserving all other routes', async () => {
    const publicBefore = await profileBusinessHash(
      'public-surface-security',
      PUBLIC_NAMESPACE,
    );
    await manager.simulatePostBrowserForE2e(
      'generation-workflow',
      GENERATION_NAMESPACE,
    );
    await manager.simulatePostBrowserForE2e(
      'public-surface-security',
      PUBLIC_NAMESPACE,
    );
    const generation = await manager.verify(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
      'post-browser',
    );
    const publicSurface = await manager.verify(
      'public-surface-security',
      PUBLIC_NAMESPACE,
      testPassword,
      'post-browser',
    );
    expect(generation.resourceCounts.clinicalReports).toBeGreaterThan(0);
    expect(publicSurface.resourceCounts.clinicalReports).toBeGreaterThan(0);
    expect(
      await profileBusinessHash('public-surface-security', PUBLIC_NAMESPACE),
    ).toBe(publicBefore);
    const first = await routeRoot(
      'generation-workflow',
      GENERATION_NAMESPACE,
      'first_generate_success',
      'base',
    );
    const reports = await reportModel.find({
      assessmentVisitId: first.visit._id,
      reportType: 'cognitive_assessment',
    });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      reportVersion: 1,
      status: 'draft',
      source: 'system_draft',
    });
    expect(reports[0].metadata?.a20Generation).toMatchObject({
      version: 1,
      aiUsed: false,
    });
  });

  it('rejects missing, duplicate, wrong scope/version/status/source/finality and snapshot/narrative/generation post-browser drift', async () => {
    const first = await routeRoot(
      'generation-workflow',
      GENERATION_NAMESPACE,
      'first_generate_success',
      'base',
    );
    const report = await reportModel.findOne({
      assessmentVisitId: first.visit._id,
      reportType: 'cognitive_assessment',
    });
    if (!report) {
      throw new Error('Missing simulated first report');
    }
    const original = await reportModel.collection.findOne({ _id: report._id });
    if (!original) {
      throw new Error('Missing raw first report');
    }
    const wrongScopeRoot = await routeRoot(
      'generation-workflow',
      GENERATION_NAMESPACE,
      'scope_eligibility',
      'one_candidate',
    );
    const expectGenerationPostFailure = () =>
      expect(
        manager.verify(
          'generation-workflow',
          GENERATION_NAMESPACE,
          testPassword,
          'post-browser',
        ),
      ).rejects.toBeInstanceOf(B10FixtureError);
    for (const update of [
      { $set: { primaryScaleInstanceIds: [] } },
      { $set: { primaryScaleInstanceIds: [wrongScopeRoot.instances[0]._id] } },
      { $set: { reportVersion: 2 } },
      { $set: { status: 'confirmed' } },
      { $set: { source: 'mixed' } },
      { $set: { isFinal: true } },
      { $set: { 'metadata.a20Generation.aiUsed': true } },
    ]) {
      await mutateAndRestore(
        reportModel.collection,
        { _id: report._id },
        update,
        expectGenerationPostFailure,
      );
    }
    await reportModel.collection.deleteOne({ _id: report._id });
    await expectGenerationPostFailure();
    await reportModel.collection.insertOne(original);
    const duplicate = {
      ...original,
      _id: new Types.ObjectId(),
      reportCode: `${String(original.reportCode)}-EXTRA`,
    };
    await reportModel.collection.insertOne(duplicate);
    await expectGenerationPostFailure();
    await reportModel.collection.deleteOne({ _id: duplicate._id });

    const publicRoot = await routeRoot(
      'public-surface-security',
      PUBLIC_NAMESPACE,
      'narrative_generation',
      'base',
    );
    const publicReport = await reportModel.findOne({
      assessmentVisitId: publicRoot.visit._id,
    });
    if (!publicReport) {
      throw new Error('Missing public report');
    }
    for (const update of [
      { $set: { 'scoreSnapshots.0.scorePercent': 99.9 } },
      { $set: { 'domainSnapshots.0.scorePercent': 99.9 } },
      { $set: { 'evidenceSnapshots.0.summary': 'unexpected drift' } },
      { $set: { 'narrative.chiefSummary': 'unexpected drift' } },
      { $set: { 'metadata.a20Generation.aiUsed': true } },
    ]) {
      await mutateAndRestore(
        reportModel.collection,
        { _id: publicReport._id },
        update,
        () =>
          expect(
            manager.verify(
              'public-surface-security',
              PUBLIC_NAMESPACE,
              testPassword,
              'post-browser',
            ),
          ).rejects.toBeInstanceOf(B10FixtureError),
      );
    }
    await manager.verify(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
      'post-browser',
    );
    await manager.verify(
      'public-surface-security',
      PUBLIC_NAMESPACE,
      testPassword,
      'post-browser',
    );
  });

  it('keeps replace explicit, cleanup profile-scoped, and both cleanup calls idempotent with no seed drift', async () => {
    const publicBefore = await profileBusinessHash(
      'public-surface-security',
      PUBLIC_NAMESPACE,
    );
    const replaced = await manager.replace(
      'generation-workflow',
      GENERATION_NAMESPACE,
      testPassword,
    );
    expect(replaced.phase).toBe('prepared');
    expect(replaced.auditMatrix).toHaveLength(48);
    const restoredScopeConflict = await routeRoot(
      'generation-workflow',
      GENERATION_NAMESPACE,
      'scope_conflict',
      'base',
    );
    const restoredScaleNotReady = await routeRoot(
      'generation-workflow',
      GENERATION_NAMESPACE,
      'source_readiness_errors',
      'scale_not_ready',
    );
    expect(
      await reportModel.countDocuments({
        assessmentVisitId: restoredScopeConflict.visit._id,
      }),
    ).toBe(0);
    expect(restoredScaleNotReady.instances[0]?.status).toBe('completed');
    expect(
      await scoreModel.countDocuments({
        scaleInstanceId: restoredScaleNotReady.instances[0]._id,
      }),
    ).toBe(1);
    expect(
      await domainModel.countDocuments({
        scaleInstanceId: restoredScaleNotReady.instances[0]._id,
      }),
    ).toBe(1);
    expect(
      await profileBusinessHash('public-surface-security', PUBLIC_NAMESPACE),
    ).toBe(publicBefore);
    const generationCleanupOne = await manager.cleanup(
      'generation-workflow',
      GENERATION_NAMESPACE,
    );
    const generationCleanupTwo = await manager.cleanup(
      'generation-workflow',
      GENERATION_NAMESPACE,
    );
    const publicCleanupOne = await manager.cleanup(
      'public-surface-security',
      PUBLIC_NAMESPACE,
    );
    const publicCleanupTwo = await manager.cleanup(
      'public-surface-security',
      PUBLIC_NAMESPACE,
    );
    expect(generationCleanupOne).toMatchObject({
      residualCount: 0,
      matched: true,
      seedHashUnchanged: true,
    });
    expect(generationCleanupTwo).toMatchObject({
      residualCount: 0,
      matched: false,
      seedHashUnchanged: true,
    });
    expect(publicCleanupOne).toMatchObject({
      residualCount: 0,
      matched: true,
      seedHashUnchanged: true,
    });
    expect(publicCleanupTwo).toMatchObject({
      residualCount: 0,
      matched: false,
      seedHashUnchanged: true,
    });
    expect(await seedHash()).toBe(canonicalSeedHash);
  });
});
