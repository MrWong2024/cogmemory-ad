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
  B9_AUDIT_IDS,
  B9_AUDIT_MATRIX,
  B9_PROFILES,
  B9_ROLES,
  B9_SCENARIOS,
  B9FixtureError,
  assertB9Contract,
  assertB9PreImportEnvironment,
  assertB9RuntimeEnvironment,
  assertB9SafeManifest,
  auditMatrixFor,
  conflictIndexNameFor,
  mappingUnavailableVersionFor,
  requireB9FixturePassword,
  scenarioDefinitionsFor,
  scenarioSubjectCodeFor,
  scenarioVisitCodeFor,
  toB9SafeErrorPayload,
  validateB9Namespace,
  validateB9Profile,
  type B9BusinessScenarioKey,
  type B9Profile,
} from './support/b9-browser-fixtures/fixture-contract';
import {
  createB9BrowserFixtureManager,
  type B9BrowserFixtureManager,
} from './support/b9-browser-fixtures/b9-browser-fixtures';

jest.setTimeout(600000);

const CORE_NAMESPACE = 'b9c-e2e-core';
const RESILIENCE_NAMESPACE = 'b9r-e2e-resilience';
const B9_MAPPING_VERSION_PATTERN =
  /^b9-b9[cr]-[a-z0-9]+(?:-[a-z0-9]+)*-mapping-unavailable$/;

type RouteRoot = {
  patient: PatientDocument;
  visit: AssessmentVisitDocument;
  instance: ScaleInstanceDocument;
  score: ScoreResultDocument | null;
  domains: CognitiveDomainResultDocument[];
};

function expectFixtureCode(action: () => void, code: string): void {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(B9FixtureError);
    if (error instanceof B9FixtureError) {
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
    expect(error).toBeInstanceOf(B9FixtureError);
    if (error instanceof B9FixtureError) {
      expect(error.code).toBe(code);
    }
    return;
  }
  throw new Error(`Expected fixture error ${code}`);
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

describe('B9 profile-scoped browser fixture support (e2e)', () => {
  let app: INestApplicationContext;
  let connection: Connection;
  let manager: B9BrowserFixtureManager;
  let patientModel: Model<PatientDocument>;
  let visitModel: Model<AssessmentVisitDocument>;
  let instanceModel: Model<ScaleInstanceDocument>;
  let itemModel: Model<ItemResponseDocument>;
  let mediaModel: Model<MediaEvidenceDocument>;
  let scoreModel: Model<ScoreResultDocument>;
  let domainModel: Model<CognitiveDomainResultDocument>;
  let definitionModel: Model<ScaleDefinitionDocument>;
  let versionModel: Model<ScaleVersionDocument>;
  let scaleCatalogService: ScaleCatalogService;
  let testPassword: string;
  let firstReadySeedHash: string;
  let canonicalSeedHash: string;

  async function seedHash(): Promise<string> {
    const [definitions, allVersions] = await Promise.all([
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
    const versions = allVersions.filter(
      ({ version }) => !B9_MAPPING_VERSION_PATTERN.test(version),
    );
    return stableHash(withoutLifecycleTimestamps({ definitions, versions }));
  }

  async function ensureCanonicalSeedReadiness(): Promise<string> {
    for (const scaleCode of ['mmse', 'moca'] as const) {
      await scaleCatalogService.ensureSeedScaleVersionMaterialized(scaleCode);
    }
    return seedHash();
  }

  async function fixtureSeedBaselines(
    profile: B9Profile,
    namespace: string,
  ): Promise<string[]> {
    const subjectCodes = scenarioDefinitionsFor(profile).map(({ ordinal }) =>
      scenarioSubjectCodeFor(profile, namespace, ordinal),
    );
    const patients = await patientModel
      .find({ subjectCode: { $in: subjectCodes } })
      .select({ 'metadata.b9Fixture.seedHash': 1 })
      .lean()
      .exec();
    return patients.map((patient) => {
      const fixture = patient.metadata?.b9Fixture as
        | { seedHash?: unknown }
        | undefined;
      if (typeof fixture?.seedHash !== 'string') {
        throw new Error('Missing B9 fixture seed baseline');
      }
      return fixture.seedHash;
    });
  }

  async function routeRoot(
    profile: B9Profile,
    namespace: string,
    scenarioKey: B9BusinessScenarioKey,
    routeKey: string,
  ): Promise<RouteRoot> {
    const definition = scenarioDefinitionsFor(profile).find(
      (candidate) => candidate.scenarioKey === scenarioKey,
    );
    if (!definition) {
      throw new Error(`Missing B9 scenario ${scenarioKey}`);
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
    const instance = visit
      ? await instanceModel.findOne({ assessmentVisitId: visit._id }).exec()
      : null;
    if (!patient || !visit || !instance) {
      throw new Error(`Missing B9 route ${scenarioKey}/${routeKey}`);
    }
    const [score, domains] = await Promise.all([
      scoreModel.findOne({ scaleInstanceId: instance._id, runNo: 1 }).exec(),
      domainModel
        .find({ scaleInstanceId: instance._id })
        .sort({ runNo: 1, _id: 1 })
        .exec(),
    ]);
    return { patient, visit, instance, score, domains };
  }

  async function profileBusinessHash(
    profile: B9Profile,
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
    const [instances, items, media, scores, domains, mappingVersions, indexes] =
      await Promise.all([
        instanceModel.find(ownership).sort({ _id: 1 }).lean().exec(),
        itemModel.find(ownership).sort({ _id: 1 }).lean().exec(),
        mediaModel.find(ownership).sort({ _id: 1 }).lean().exec(),
        scoreModel.find(ownership).sort({ _id: 1 }).lean().exec(),
        domainModel.find(ownership).sort({ _id: 1 }).lean().exec(),
        versionModel
          .find({ version: mappingUnavailableVersionFor(namespace) })
          .sort({ _id: 1 })
          .lean()
          .exec(),
        domainModel.collection.listIndexes().toArray(),
      ]);
    return stableHash({
      patients,
      visits,
      instances,
      items,
      media,
      scores,
      domains,
      mappingVersions,
      conflictIndexes: indexes.filter(
        ({ name }) => name === conflictIndexNameFor(namespace),
      ),
    });
  }

  async function expectPreparedVerifyFailure(
    profile: B9Profile,
    namespace: string,
  ): Promise<void> {
    await expect(
      manager.verify(profile, namespace, testPassword, 'prepared'),
    ).rejects.toBeInstanceOf(B9FixtureError);
  }

  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      process.env.COGMEMORY_DATABASE_PURPOSE !== 'standard_test'
    ) {
      throw new Error('B9 fixture E2E requires standard_test isolation');
    }
    testPassword = `B9-${randomUUID()}-Aa1!`;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    connection = app.get<Connection>(getConnectionToken());
    const config = app.get(ConfigService);
    assertB9RuntimeEnvironment({
      nodeEnv: process.env.NODE_ENV,
      appEnv: config.get<string>('app.env'),
      databasePurpose: process.env.COGMEMORY_DATABASE_PURPOSE,
      databaseName: connection.name,
      storageDriver: config.get<string>('storage.driver'),
      llmProvider: config.get<string>('llm.provider'),
      smsProvider: config.get<string>('smsAuth.provider'),
      sessionCookieSecure: config.get<boolean>('session.cookieSecure'),
    });
    manager = createB9BrowserFixtureManager(app);
    patientModel = app.get(getModelToken(Patient.name));
    visitModel = app.get(getModelToken(AssessmentVisit.name));
    instanceModel = app.get(getModelToken(ScaleInstance.name));
    itemModel = app.get(getModelToken(ItemResponse.name));
    mediaModel = app.get(getModelToken(MediaEvidence.name));
    scoreModel = app.get(getModelToken(ScoreResult.name));
    domainModel = app.get(getModelToken(CognitiveDomainResult.name));
    definitionModel = app.get(getModelToken(ScaleDefinition.name));
    versionModel = app.get(getModelToken(ScaleVersion.name));
    scaleCatalogService = app.get(ScaleCatalogService);
    await manager.cleanup('core-workflow', CORE_NAMESPACE);
    await manager.cleanup('resilience-security', RESILIENCE_NAMESPACE);
    firstReadySeedHash = await ensureCanonicalSeedReadiness();
    canonicalSeedHash = await ensureCanonicalSeedReadiness();
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

  it('materializes canonical MMSE/MoCA seed readiness idempotently before capturing the protected baseline', async () => {
    expect(canonicalSeedHash).toBe(firstReadySeedHash);
    expect(await ensureCanonicalSeedReadiness()).toBe(canonicalSeedHash);
  });

  it('enforces 52 ordered IDs, exclusive profiles, route semantics, primary owners, CLI gates, and safe manifests', () => {
    expect(() => assertB9Contract()).not.toThrow();
    expect(B9_AUDIT_IDS).toHaveLength(52);
    expect(B9_AUDIT_MATRIX).toHaveLength(52);
    expect(new Set(B9_AUDIT_MATRIX.map(({ auditId }) => auditId)).size).toBe(
      52,
    );
    expect(B9_AUDIT_MATRIX.map(({ auditId }) => auditId)).toEqual(B9_AUDIT_IDS);
    expect(
      B9_AUDIT_MATRIX.slice(0, 38).every(
        ({ profile }) => profile === 'core-workflow',
      ),
    ).toBe(true);
    expect(
      B9_AUDIT_MATRIX.slice(38).every(
        ({ profile }) => profile === 'resilience-security',
      ),
    ).toBe(true);
    expect(B9_PROFILES).toEqual(['core-workflow', 'resilience-security']);
    expect(auditMatrixFor('core-workflow')).toHaveLength(38);
    expect(auditMatrixFor('resilience-security')).toHaveLength(14);
    expect(scenarioDefinitionsFor('core-workflow')).toHaveLength(10);
    expect(scenarioDefinitionsFor('resilience-security')).toHaveLength(10);
    expect(B9_ROLES).toHaveLength(5);
    expect(
      B9_SCENARIOS.every(
        (scenario) =>
          new Set<string>(scenario.auditIds).has(
            scenario.primaryOwnerAuditId,
          ) &&
          B9_AUDIT_MATRIX.some(
            (audit) =>
              audit.auditId === scenario.primaryOwnerAuditId &&
              audit.profile === scenario.profile &&
              audit.scenarioKey === scenario.scenarioKey,
          ) &&
          scenario.routeContracts.every(
            (route) =>
              route.auditIds.length > 0 &&
              route.automaticRetry === false &&
              route.preparedState.length > 0,
          ),
      ),
    ).toBe(true);
    expect(
      B9_AUDIT_MATRIX.filter(({ requiresIndependentSession }) =>
        Boolean(requiresIndependentSession),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      B9_AUDIT_MATRIX.filter(({ requiresNetworkFault }) =>
        Boolean(requiresNetworkFault),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      B9_AUDIT_MATRIX.filter(({ requiresPrivacyVerification }) =>
        Boolean(requiresPrivacyVerification),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      B9_AUDIT_MATRIX.filter(({ requiresViewportVerification }) =>
        Boolean(requiresViewportVerification),
      ),
    ).toHaveLength(1);
    const networkScenario = scenarioDefinitionsFor('resilience-security').find(
      ({ scenarioKey }) => scenarioKey === 'network_failure',
    );
    expect(networkScenario?.routeContracts.map(({ key }) => key)).toEqual([
      'latest',
      'compute',
    ]);
    const localWriteScenario = scenarioDefinitionsFor('core-workflow').find(
      ({ scenarioKey }) => scenarioKey === 'local_write_gate',
    );
    expect(
      localWriteScenario?.routeContracts.map(({ localPrerequisite }) =>
        String(localPrerequisite),
      ),
    ).toEqual([
      'answer-dirty-capable',
      'media-dirty-capable',
      'manual-score-dirty-capable',
      'score-confirm-dirty-capable',
      'score-writing-capable',
    ]);
    expect(() => assertB9PreImportEnvironment('test')).not.toThrow();
    expectFixtureCode(
      () => assertB9PreImportEnvironment('development'),
      'B9_FIXTURE_ENVIRONMENT_UNSAFE',
    );
    expect(validateB9Profile('core-workflow')).toBe('core-workflow');
    expectFixtureCode(
      () => validateB9Profile('combined'),
      'B9_FIXTURE_PROFILE_INVALID',
    );
    expectFixtureCode(
      () => validateB9Namespace('core-workflow', RESILIENCE_NAMESPACE),
      'B9_FIXTURE_NAMESPACE_INVALID',
    );
    expectFixtureCode(
      () => validateB9Namespace('resilience-security', CORE_NAMESPACE),
      'B9_FIXTURE_NAMESPACE_INVALID',
    );
    expectFixtureCode(
      () => requireB9FixturePassword('short'),
      'B9_FIXTURE_PASSWORD_REQUIRED',
    );
    expect(() =>
      assertB9SafeManifest({
        namespace: CORE_NAMESPACE,
        databaseName: 'cogmemory_ad_test',
        profile: 'core-workflow',
        residualCount: 0,
        matched: false,
        expectedSummary: 'safe',
      }),
    ).not.toThrow();
    for (const unsafe of [
      { ...toB9SafeErrorPayload(new Error()), patientId: new Types.ObjectId() },
      { metadata: { hidden: true } },
      { mappingRules: { hidden: true } },
      { id: new Types.ObjectId().toString() },
    ]) {
      expectFixtureCode(
        () => assertB9SafeManifest(unsafe),
        'B9_FIXTURE_MANIFEST_UNSAFE',
      );
    }
    for (const args of [
      ['invalid'],
      ['prepare'],
      ['cleanup', '--profile', 'core-workflow'],
      ['replace', '--profile', 'core-workflow'],
      ['verify', '--profile', 'core-workflow'],
    ]) {
      const cli = spawnSync(
        process.execPath,
        [
          '-r',
          'ts-node/register',
          '-r',
          'tsconfig-paths/register',
          'scripts/b9-browser-fixtures.ts',
          ...args,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: { ...process.env, NODE_ENV: 'test' },
        },
      );
      expect(cli.status).toBe(1);
      expect(cli.stderr).toContain('B9_FIXTURE_');
      expect(cli.stderr).not.toContain(testPassword);
    }
    expect(toB9SafeErrorPayload(new Error('private query details'))).toEqual({
      ok: false,
      code: 'B9_FIXTURE_OPERATION_FAILED',
      message:
        'B9 browser fixture operation failed without exposing internal details',
    });
  });

  it('prepares and read-only verifies independent profiles while rejecting unexecuted post-browser phases', async () => {
    const core = await manager.prepare(
      'core-workflow',
      CORE_NAMESPACE,
      testPassword,
    );
    expect(core.phase).toBe('prepared');
    expect(core.auditMatrix).toHaveLength(38);
    expect(core.scenarios).toHaveLength(10);
    expect(JSON.stringify(core)).not.toMatch(/\b[a-f0-9]{24}\b/i);
    expect(() => assertB9SafeManifest(core)).not.toThrow();
    expect(await seedHash()).toBe(canonicalSeedHash);
    expect(
      new Set(await fixtureSeedBaselines('core-workflow', CORE_NAMESPACE)),
    ).toEqual(new Set([canonicalSeedHash]));
    await expectAsyncFixtureCode(
      () => manager.prepare('core-workflow', CORE_NAMESPACE, testPassword),
      'B9_FIXTURE_NAMESPACE_EXISTS',
    );
    expect(await seedHash()).toBe(canonicalSeedHash);

    const resilience = await manager.prepare(
      'resilience-security',
      RESILIENCE_NAMESPACE,
      testPassword,
    );
    expect(resilience.phase).toBe('prepared');
    expect(resilience.auditMatrix).toHaveLength(14);
    expect(resilience.scenarios).toHaveLength(10);
    expect(JSON.stringify(resilience)).not.toMatch(/\b[a-f0-9]{24}\b/i);
    expect(() => assertB9SafeManifest(resilience)).not.toThrow();
    expect(await seedHash()).toBe(canonicalSeedHash);
    expect(
      new Set(
        await fixtureSeedBaselines('resilience-security', RESILIENCE_NAMESPACE),
      ),
    ).toEqual(new Set([canonicalSeedHash]));

    const coreBefore = await profileBusinessHash(
      'core-workflow',
      CORE_NAMESPACE,
    );
    const resilienceBefore = await profileBusinessHash(
      'resilience-security',
      RESILIENCE_NAMESPACE,
    );
    const coreVerify = await manager.verify(
      'core-workflow',
      CORE_NAMESPACE,
      testPassword,
      'prepared',
    );
    const resilienceVerify = await manager.verify(
      'resilience-security',
      RESILIENCE_NAMESPACE,
      testPassword,
      'prepared',
    );
    expect(coreVerify.phase).toBe('prepared');
    expect(resilienceVerify.phase).toBe('prepared');
    expect(await seedHash()).toBe(canonicalSeedHash);
    expect(await profileBusinessHash('core-workflow', CORE_NAMESPACE)).toBe(
      coreBefore,
    );
    expect(
      await profileBusinessHash('resilience-security', RESILIENCE_NAMESPACE),
    ).toBe(resilienceBefore);
    await expect(
      manager.verify(
        'core-workflow',
        CORE_NAMESPACE,
        testPassword,
        'post-browser',
      ),
    ).rejects.toBeInstanceOf(B9FixtureError);
    await expectAsyncFixtureCode(
      () =>
        manager.verify(
          'resilience-security',
          RESILIENCE_NAMESPACE,
          testPassword,
          'post-browser',
        ),
      'B9_FIXTURE_BROWSER_SESSION_EVIDENCE_MISSING',
    );
    expect(await seedHash()).toBe(canonicalSeedHash);
  });

  it('detects missing, multiple, wrong runNo/source/status/mapping, upstream mutation, cross-profile pollution, and seed drift without repair', async () => {
    const idempotent = await routeRoot(
      'core-workflow',
      CORE_NAMESPACE,
      'idempotent_compute',
      'base',
    );
    const domain = idempotent.domains[0];
    if (!domain || !idempotent.score) {
      throw new Error('Missing idempotent fixture records');
    }
    const rawDomain = await domainModel.collection.findOne({ _id: domain._id });
    if (!rawDomain) {
      throw new Error('Missing raw idempotent domain');
    }

    await domainModel.collection.deleteOne({ _id: domain._id });
    await expectPreparedVerifyFailure('core-workflow', CORE_NAMESPACE);
    await domainModel.collection.insertOne(rawDomain);

    const extraId = new Types.ObjectId();
    await domainModel.collection.insertOne({
      ...rawDomain,
      _id: extraId,
      runNo: 2,
      domainResultCode: `${rawDomain.domainResultCode}-RUN2`,
    });
    await expectPreparedVerifyFailure('core-workflow', CORE_NAMESPACE);
    await domainModel.collection.deleteOne({ _id: extraId });

    await domainModel.collection.updateOne(
      { _id: domain._id },
      { $set: { runNo: 2 } },
    );
    await expectPreparedVerifyFailure('core-workflow', CORE_NAMESPACE);
    await domainModel.collection.replaceOne({ _id: domain._id }, rawDomain);

    const otherScore = await scoreModel.findOne({
      _id: { $ne: idempotent.score._id },
    });
    if (!otherScore) {
      throw new Error('Missing alternate score');
    }
    await domainModel.collection.updateOne(
      { _id: domain._id },
      { $set: { scoreResultId: otherScore._id } },
    );
    await expectPreparedVerifyFailure('core-workflow', CORE_NAMESPACE);
    await domainModel.collection.replaceOne({ _id: domain._id }, rawDomain);

    for (const change of [
      { status: 'confirmed' },
      { mappingMode: 'manual_summary' },
    ]) {
      await domainModel.collection.updateOne(
        { _id: domain._id },
        { $set: change },
      );
      await expectPreparedVerifyFailure('core-workflow', CORE_NAMESPACE);
      await domainModel.collection.replaceOne({ _id: domain._id }, rawDomain);
    }

    const rawScore = await scoreModel.collection.findOne({
      _id: idempotent.score._id,
    });
    if (!rawScore) {
      throw new Error('Missing raw score');
    }
    await scoreModel.collection.updateOne(
      { _id: idempotent.score._id },
      { $set: { operatorNote: 'unexpected B9 E2E mutation' } },
    );
    await expectPreparedVerifyFailure('core-workflow', CORE_NAMESPACE);
    await scoreModel.collection.replaceOne(
      { _id: idempotent.score._id },
      rawScore,
    );

    const item = await itemModel.findOne({
      scaleInstanceId: idempotent.instance._id,
    });
    if (!item) {
      throw new Error('Missing idempotent item');
    }
    const rawItem = await itemModel.collection.findOne({ _id: item._id });
    if (!rawItem) {
      throw new Error('Missing raw item');
    }
    await itemModel.collection.updateOne(
      { _id: item._id },
      { $set: { operatorNote: 'unexpected B9 E2E item mutation' } },
    );
    await expectPreparedVerifyFailure('core-workflow', CORE_NAMESPACE);
    await itemModel.collection.replaceOne({ _id: item._id }, rawItem);

    const media = await mediaModel.findOne({
      patientId: idempotent.patient._id,
    });
    if (!media) {
      throw new Error('Missing idempotent media');
    }
    const rawMedia = await mediaModel.collection.findOne({ _id: media._id });
    if (!rawMedia) {
      throw new Error('Missing raw media');
    }
    await mediaModel.collection.updateOne(
      { _id: media._id },
      { $set: { operatorNote: 'unexpected B9 E2E media mutation' } },
    );
    await expectPreparedVerifyFailure('core-workflow', CORE_NAMESPACE);
    await mediaModel.collection.replaceOne({ _id: media._id }, rawMedia);

    const rawPatient = await patientModel.collection.findOne({
      _id: idempotent.patient._id,
    });
    if (!rawPatient) {
      throw new Error('Missing raw patient');
    }
    await patientModel.collection.updateOne(
      { _id: idempotent.patient._id },
      { $set: { 'metadata.b9Fixture.profile': 'resilience-security' } },
    );
    await expectAsyncFixtureCode(
      () =>
        manager.verify(
          'core-workflow',
          CORE_NAMESPACE,
          testPassword,
          'prepared',
        ),
      'B9_FIXTURE_PROFILE_ISOLATION_INVALID',
    );
    await patientModel.collection.replaceOne(
      { _id: idempotent.patient._id },
      rawPatient,
    );

    const globalVersion = await versionModel.findOne({
      scaleCode: 'mmse',
      version: { $not: B9_MAPPING_VERSION_PATTERN },
    });
    if (!globalVersion) {
      throw new Error('Missing global seed version');
    }
    const rawVersion = await versionModel.collection.findOne({
      _id: globalVersion._id,
    });
    if (!rawVersion) {
      throw new Error('Missing raw seed version');
    }
    await versionModel.collection.updateOne(
      { _id: globalVersion._id },
      { $set: { displayVersion: 'unexpected B9 seed mutation' } },
    );
    expect(await seedHash()).not.toBe(canonicalSeedHash);
    await expectAsyncFixtureCode(
      () =>
        manager.verify(
          'core-workflow',
          CORE_NAMESPACE,
          testPassword,
          'prepared',
        ),
      'B9_FIXTURE_BASELINE_INVALID',
    );
    await versionModel.collection.replaceOne(
      { _id: globalVersion._id },
      rawVersion,
    );

    await expect(
      manager.verify('core-workflow', CORE_NAMESPACE, testPassword, 'prepared'),
    ).resolves.toMatchObject({ phase: 'prepared' });
    expect(await seedHash()).toBe(canonicalSeedHash);
  });

  it('accepts legal profile-scoped post-browser terminal states and rejects cross-profile or idempotency drift', async () => {
    const resilienceBefore = await profileBusinessHash(
      'resilience-security',
      RESILIENCE_NAMESPACE,
    );
    const idempotentBefore = await routeRoot(
      'core-workflow',
      CORE_NAMESPACE,
      'idempotent_compute',
      'base',
    );
    const idempotentHash = stableHash(
      idempotentBefore.domains.map((item) => item.toObject()),
    );

    await manager.simulatePostBrowserForE2e('core-workflow', CORE_NAMESPACE);
    await manager.simulatePostBrowserForE2e(
      'resilience-security',
      RESILIENCE_NAMESPACE,
    );
    expect(await seedHash()).toBe(canonicalSeedHash);

    const coreBeforeVerify = await profileBusinessHash(
      'core-workflow',
      CORE_NAMESPACE,
    );
    const resilienceAfterSimulation = await profileBusinessHash(
      'resilience-security',
      RESILIENCE_NAMESPACE,
    );
    expect(resilienceAfterSimulation).toBe(resilienceBefore);
    const corePost = await manager.verify(
      'core-workflow',
      CORE_NAMESPACE,
      testPassword,
      'post-browser',
    );
    const resiliencePost = await manager.verify(
      'resilience-security',
      RESILIENCE_NAMESPACE,
      testPassword,
      'post-browser',
    );
    expect(corePost.phase).toBe('post-browser');
    expect(resiliencePost.phase).toBe('post-browser');
    expect(await seedHash()).toBe(canonicalSeedHash);
    expect(await profileBusinessHash('core-workflow', CORE_NAMESPACE)).toBe(
      coreBeforeVerify,
    );
    expect(
      await profileBusinessHash('resilience-security', RESILIENCE_NAMESPACE),
    ).toBe(resilienceAfterSimulation);

    const confirmed = await routeRoot(
      'core-workflow',
      CORE_NAMESPACE,
      'confirm_triggers_latest',
      'base',
    );
    const firstCompute = await routeRoot(
      'core-workflow',
      CORE_NAMESPACE,
      'first_compute_success',
      'base',
    );
    const idempotentAfter = await routeRoot(
      'core-workflow',
      CORE_NAMESPACE,
      'idempotent_compute',
      'base',
    );
    expect(confirmed.score?.status).toBe('confirmed');
    expect(confirmed.domains).toHaveLength(0);
    expect(firstCompute.domains).toHaveLength(1);
    expect(firstCompute.domains[0].runNo).toBe(1);
    expect(firstCompute.domains[0].status).toBe('computed');
    expect(
      stableHash(idempotentAfter.domains.map((item) => item.toObject())),
    ).toBe(idempotentHash);

    const idempotentDomain = idempotentAfter.domains[0];
    const rawIdempotentDomain = await domainModel.collection.findOne({
      _id: idempotentDomain._id,
    });
    if (!rawIdempotentDomain) {
      throw new Error('Missing post-browser idempotent domain');
    }
    await domainModel.collection.updateOne(
      { _id: idempotentDomain._id },
      { $set: { status: 'locked' } },
    );
    await expect(
      manager.verify(
        'resilience-security',
        RESILIENCE_NAMESPACE,
        testPassword,
        'post-browser',
      ),
    ).resolves.toMatchObject({ phase: 'post-browser' });
    await expectAsyncFixtureCode(
      () =>
        manager.verify(
          'core-workflow',
          CORE_NAMESPACE,
          testPassword,
          'post-browser',
        ),
      'B9_FIXTURE_SCENARIO_INVALID',
    );
    await domainModel.collection.replaceOne(
      { _id: idempotentDomain._id },
      rawIdempotentDomain,
    );
    await expect(
      manager.verify(
        'core-workflow',
        CORE_NAMESPACE,
        testPassword,
        'post-browser',
      ),
    ).resolves.toMatchObject({ phase: 'post-browser' });
    expect(await seedHash()).toBe(canonicalSeedHash);
  });

  it('keeps replace explicit, cleanup profile-scoped, and second cleanup residualCount=0', async () => {
    await expectAsyncFixtureCode(
      () => manager.prepare('core-workflow', CORE_NAMESPACE, testPassword),
      'B9_FIXTURE_NAMESPACE_EXISTS',
    );
    const resilienceBefore = await profileBusinessHash(
      'resilience-security',
      RESILIENCE_NAMESPACE,
    );
    const replaced = await manager.replace(
      'core-workflow',
      CORE_NAMESPACE,
      testPassword,
    );
    expect(replaced.phase).toBe('prepared');
    expect(await seedHash()).toBe(canonicalSeedHash);
    expect(
      new Set(await fixtureSeedBaselines('core-workflow', CORE_NAMESPACE)),
    ).toEqual(new Set([canonicalSeedHash]));
    expect(
      await profileBusinessHash('resilience-security', RESILIENCE_NAMESPACE),
    ).toBe(resilienceBefore);
    await expect(
      manager.verify('core-workflow', CORE_NAMESPACE, testPassword, 'prepared'),
    ).resolves.toMatchObject({ phase: 'prepared' });
    expect(await seedHash()).toBe(canonicalSeedHash);

    const coreCleanupOne = await manager.cleanup(
      'core-workflow',
      CORE_NAMESPACE,
    );
    const coreCleanupTwo = await manager.cleanup(
      'core-workflow',
      CORE_NAMESPACE,
    );
    expect(coreCleanupOne.residualCount).toBe(0);
    expect(await seedHash()).toBe(canonicalSeedHash);
    expect(coreCleanupTwo.residualCount).toBe(0);
    expect(await seedHash()).toBe(canonicalSeedHash);

    const resilienceCleanupOne = await manager.cleanup(
      'resilience-security',
      RESILIENCE_NAMESPACE,
    );
    const resilienceCleanupTwo = await manager.cleanup(
      'resilience-security',
      RESILIENCE_NAMESPACE,
    );
    expect(resilienceCleanupOne.residualCount).toBe(0);
    expect(await seedHash()).toBe(canonicalSeedHash);
    expect(resilienceCleanupTwo.residualCount).toBe(0);
    expect(await seedHash()).toBe(canonicalSeedHash);
  });
});
