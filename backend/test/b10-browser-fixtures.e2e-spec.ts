import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { AppModule } from '../src/app.module';
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

jest.setTimeout(600000);

const GENERATION_NAMESPACE = 'b10g-e2e-contract';
const PUBLIC_NAMESPACE = 'b10p-e2e-contract';

type RouteRoot = {
  patient: PatientDocument;
  visit: AssessmentVisitDocument;
  instances: ScaleInstanceDocument[];
};

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
  let app: INestApplicationContext;
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

  async function expectPreparedFailure(
    profile: B10Profile,
    namespace: string,
  ): Promise<void> {
    await expect(
      manager.verify(profile, namespace, testPassword, 'prepared'),
    ).rejects.toBeInstanceOf(B10FixtureError);
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
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
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
