import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import {
  Session,
  type SessionDocument,
} from '../../../src/modules/auth/schemas/session.schema';
import { AuthService } from '../../../src/modules/auth/services/auth.service';
import type { AuthenticatedUserContext } from '../../../src/modules/auth/types/auth-user-context.type';
import {
  AssessmentVisit,
  type AssessmentVisitDocument,
} from '../../../src/modules/assessments/schemas/assessment-visit.schema';
import { ItemResponse } from '../../../src/modules/assessments/schemas/item-response.schema';
import {
  ScaleInstance,
  type ScaleInstanceDocument,
} from '../../../src/modules/assessments/schemas/scale-instance.schema';
import { AssessmentExecutionService } from '../../../src/modules/assessments/services/assessment-execution.service';
import { ItemResponseDraftService } from '../../../src/modules/assessments/services/item-response-draft.service';
import { ScaleInstanceSubmissionService } from '../../../src/modules/assessments/services/scale-instance-submission.service';
import { CognitiveDomainResult } from '../../../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
import { CognitiveDomainsService } from '../../../src/modules/cognitive-domains/services/cognitive-domains.service';
import { MediaEvidence } from '../../../src/modules/media/schemas/media-evidence.schema';
import { MediaEvidenceWorkflowService } from '../../../src/modules/media/services/media-evidence-workflow.service';
import {
  Patient,
  type PatientDocument,
} from '../../../src/modules/patients/schemas/patient.schema';
import {
  ClinicalReport,
  type ClinicalReportDocument,
} from '../../../src/modules/reports/schemas/clinical-report.schema';
import { ScaleDefinition } from '../../../src/modules/scales/schemas/scale-definition.schema';
import { ScaleVersion } from '../../../src/modules/scales/schemas/scale-version.schema';
import { ScaleCatalogService } from '../../../src/modules/scales/services/scale-catalog.service';
import { ScalesService } from '../../../src/modules/scales/services/scales.service';
import { ScoreResult } from '../../../src/modules/scoring/schemas/score-result.schema';
import { ProvisionalScoringWorkflowService } from '../../../src/modules/scoring/services/provisional-scoring-workflow.service';
import { ScoreReviewWorkflowService } from '../../../src/modules/scoring/services/score-review-workflow.service';
import { ScoringService } from '../../../src/modules/scoring/services/scoring.service';
import {
  User,
  type UserDocument,
} from '../../../src/modules/users/schemas/user.schema';
import {
  B10_ROLES,
  B10FixtureError,
  accountNameFor,
  assertB10Contract,
  assertB10RuntimeEnvironment,
  assertB10SafeManifest,
  assertB10StageTarget,
  auditMatrixFor,
  conflictIndexNameFor,
  displayNameFor,
  requireB10FixturePassword,
  scenarioDefinitionsFor,
  scenarioSubjectCodeFor,
  scenarioVisitCodeFor,
  validateB10Namespace,
  type B10BusinessScenarioKey,
  type B10FixtureTransition,
  type B10InstanceState,
  type B10PostBrowserSideEffect,
  type B10Profile,
  type B10ReportVariant,
  type B10ResourceCounts,
  type B10Role,
  type B10RoutePreparedContract,
  type B10SafeCleanupSummary,
  type B10SafeManifest,
  type B10SafeRoleManifest,
  type B10SafeScenarioManifest,
  type B10SafeStageSummary,
  type B10VerifyPhase,
  type B10VerifyStage,
} from './fixture-contract';
import {
  B10ScenarioBuilder,
  type B10FixtureModels,
  type B10FixtureWorkflows,
  type B10ScenarioRouteRoot,
} from './scenario-builders';

type B10Models = B10FixtureModels & {
  users: Model<UserDocument>;
  sessions: Model<SessionDocument>;
};

type IdRow = { _id: Types.ObjectId };
type RouteRoot = {
  patient: PatientDocument;
  visit: AssessmentVisitDocument;
  instances: ScaleInstanceDocument[];
};

type RouteBaseline = {
  routeKey: string;
  visitCode: string;
  instanceCount: number;
  sourceHash: string;
  sourceHashWithoutFirstInstanceStatus: string;
  reportHash: string;
  reportCount: number;
  postBrowserSideEffect: B10PostBrowserSideEffect;
};

type RouteFixtureStageState = 'prepared' | 'staged';

type FixtureMetadata = {
  version: 1;
  profile: B10Profile;
  namespace: string;
  scenarioKey: B10BusinessScenarioKey;
  seedHash: string;
  patientInvariantHash: string;
  routeBaselines: RouteBaseline[];
};

type IndexDescription = {
  name?: string;
  key?: Record<string, number>;
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
};

const BASELINE_DATE = new Date('2026-07-26T02:00:00.000Z');
const PATH_TEMPLATE = '/patients/:patient/visits/:visit';

export function isB10ProtectedCanonicalScaleVersion(value: {
  scaleCode?: unknown;
  status?: unknown;
}): boolean {
  return (
    (value.scaleCode === 'mmse' || value.scaleCode === 'moca') &&
    value.status === 'active'
  );
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

function toActor(user: UserDocument): AuthenticatedUserContext {
  return {
    id: user._id.toString(),
    accountName: user.accountName,
    displayName: user.displayName,
    roles: [...user.roles],
    permissions: [...user.permissions],
    userType: user.userType,
  };
}

function expectedInstanceStatus(state: B10InstanceState): string {
  if (
    state === 'final' ||
    state === 'score_not_final' ||
    state === 'domain_missing' ||
    state === 'media_invalid'
  ) {
    return 'completed';
  }
  return state;
}

function preparedReportCount(variant: B10ReportVariant): number {
  return variant === 'none' ? 0 : 1;
}

export async function withB10VerifyStage<T>(
  profile: B10Profile,
  stage: B10VerifyStage,
  phase: B10VerifyPhase,
  action: () => Promise<T> | T,
  scenarioKey?: B10BusinessScenarioKey,
): Promise<T> {
  try {
    return await action();
  } catch (error: unknown) {
    if (error instanceof B10FixtureError) {
      throw error;
    }
    throw new B10FixtureError(
      'B10_FIXTURE_VERIFY_STAGE_FAILED',
      'B10 fixture verification failed in a named read-only stage',
      profile,
      scenarioKey,
      stage,
      phase,
    );
  }
}

export class B10BrowserFixtureManager {
  constructor(
    private readonly databaseName: string,
    private readonly models: B10Models,
    private readonly authService: AuthService,
    private readonly workflows: B10FixtureWorkflows,
  ) {}

  async prepare(
    profile: B10Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B10SafeManifest> {
    const namespace = validateB10Namespace(profile, rawNamespace);
    const password = requireB10FixturePassword(rawPassword);
    assertB10Contract();
    await this.assertNamespaceUnused(profile, namespace);
    const builder = new B10ScenarioBuilder(
      profile,
      namespace,
      this.models,
      this.workflows,
    );
    await builder.ensureCanonicalSeedReadiness();
    const seedHash = await this.globalSeedHash();
    try {
      const users = await this.createUsers(profile, namespace, password);
      const doctor = users.get('doctor');
      if (!doctor) {
        throw new B10FixtureError(
          'B10_FIXTURE_ACCOUNT_CREATION_FAILED',
          'The doctor fixture account was not created',
          profile,
        );
      }
      await builder.buildAll(toActor(doctor));
      if ((await this.globalSeedHash()) !== seedHash) {
        throw new B10FixtureError(
          'B10_FIXTURE_SEED_MUTATED',
          'Fixture preparation changed the protected canonical seed',
          profile,
        );
      }
      await this.recordBaselines(profile, namespace, seedHash);
      return this.verifyInternal(profile, namespace, password, 'prepared');
    } catch (error: unknown) {
      try {
        await this.cleanup(profile, namespace);
      } catch {
        // The original safe error remains authoritative; cleanup is retryable.
      }
      throw error;
    }
  }

  async replace(
    profile: B10Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B10SafeManifest> {
    const namespace = validateB10Namespace(profile, rawNamespace);
    const password = requireB10FixturePassword(rawPassword);
    await this.cleanup(profile, namespace);
    return this.prepare(profile, namespace, password);
  }

  async verify(
    profile: B10Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
    phase: B10VerifyPhase,
  ): Promise<B10SafeManifest> {
    return this.verifyInternal(
      profile,
      validateB10Namespace(profile, rawNamespace),
      requireB10FixturePassword(rawPassword),
      phase,
    );
  }

  async stage(
    profile: B10Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
    rawScenarioKey: string | undefined,
    rawRouteKey: string | undefined,
  ): Promise<B10SafeStageSummary> {
    const namespace = validateB10Namespace(profile, rawNamespace);
    const password = requireB10FixturePassword(rawPassword);
    assertB10StageTarget(profile, rawScenarioKey, rawRouteKey);
    assertB10Contract();
    await this.verifyStageBaseline(profile, namespace, password);
    const seedHash = await this.globalSeedHash();
    const definition = scenarioDefinitionsFor(profile).find(
      ({ scenarioKey }) => scenarioKey === rawScenarioKey,
    );
    if (!definition || !rawRouteKey) {
      throw this.scenarioInvalid(profile, rawScenarioKey);
    }
    const root = await this.requireRoot(
      profile,
      namespace,
      rawScenarioKey,
      rawRouteKey,
    );
    const doctor = await this.models.users
      .findOne({
        accountName: accountNameFor(profile, namespace, 'doctor'),
      })
      .exec();
    if (!doctor) {
      throw new B10FixtureError(
        'B10_FIXTURE_ACCOUNT_INVALID',
        'The fixed stage doctor account is missing',
        profile,
      );
    }
    const builderRoot: B10ScenarioRouteRoot = {
      scenarioKey: rawScenarioKey,
      routeKey: rawRouteKey,
      ordinal: definition.ordinal,
      patientId: root.patient._id,
      visitId: root.visit._id,
      subjectCode: root.patient.subjectCode,
      visitCode: root.visit.visitCode,
      scaleCode: definition.scaleCode,
      scaleInstanceIds: root.instances.map(({ _id }) => _id),
    };
    const builder = new B10ScenarioBuilder(
      profile,
      namespace,
      this.models,
      this.workflows,
    );
    const alreadyStaged =
      rawScenarioKey === 'scope_conflict'
        ? await builder.stageScopeConflictReport(builderRoot, toActor(doctor))
        : await builder.stageSourceScaleNotReady(builderRoot);
    if ((await this.globalSeedHash()) !== seedHash) {
      throw new B10FixtureError(
        'B10_FIXTURE_SEED_MUTATED',
        'Fixture stage changed the protected canonical seed',
        profile,
        rawScenarioKey,
      );
    }
    const stagedStates = await this.verifyStageBaseline(
      profile,
      namespace,
      password,
    );
    if (stagedStates.get(`${rawScenarioKey}/${rawRouteKey}`) !== 'staged') {
      throw this.scenarioInvalid(profile, rawScenarioKey, rawRouteKey);
    }
    const result: B10SafeStageSummary = {
      scenarioKey: rawScenarioKey,
      routeKey: rawRouteKey,
      staged: true,
      alreadyStaged,
      seedHashUnchanged: true,
    };
    assertB10SafeManifest(result);
    return result;
  }

  async cleanup(
    profile: B10Profile,
    rawNamespace: string,
  ): Promise<B10SafeCleanupSummary> {
    const namespace = validateB10Namespace(profile, rawNamespace);
    const seedBefore = await this.globalSeedHash();
    const accountNames = B10_ROLES.map((role) =>
      accountNameFor(profile, namespace, role),
    );
    const subjectCodes = this.subjectCodes(profile, namespace);
    await this.assertNoUnexpectedRoots(profile, namespace, subjectCodes);
    const [users, patients, indexesBefore] = await Promise.all([
      this.models.users
        .find({ accountName: { $in: accountNames } })
        .select({ _id: 1 })
        .lean<IdRow[]>()
        .exec(),
      this.models.patients
        .find({ subjectCode: { $in: subjectCodes } })
        .select({ _id: 1 })
        .lean<IdRow[]>()
        .exec(),
      this.models.reports.collection.listIndexes().toArray(),
    ]);
    const userIds = users.map(({ _id }) => _id);
    const patientIds = patients.map(({ _id }) => _id);
    const visits = patientIds.length
      ? await this.models.visits
          .find({ patientId: { $in: patientIds } })
          .select({ _id: 1 })
          .lean<IdRow[]>()
          .exec()
      : [];
    const visitIds = visits.map(({ _id }) => _id);
    if (userIds.length > 0) {
      await this.models.sessions
        .deleteMany({ userId: { $in: userIds } })
        .exec();
    }
    if (patientIds.length > 0 || visitIds.length > 0) {
      const ownership = this.ownershipFilter(patientIds, visitIds);
      await this.models.reports.deleteMany(ownership).exec();
      await this.models.cognitiveDomainResults.deleteMany(ownership).exec();
      await this.models.scoreResults.deleteMany(ownership).exec();
      await this.models.mediaEvidence.deleteMany(ownership).exec();
      await this.models.itemResponses.deleteMany(ownership).exec();
      await this.models.scaleInstances.deleteMany(ownership).exec();
    }
    if (visitIds.length > 0) {
      await this.models.visits.deleteMany({ _id: { $in: visitIds } }).exec();
    }
    if (patientIds.length > 0) {
      await this.models.patients
        .deleteMany({ _id: { $in: patientIds } })
        .exec();
    }
    await this.dropConflictIndex(namespace);
    if (userIds.length > 0) {
      await this.models.users.deleteMany({ _id: { $in: userIds } }).exec();
    }
    const residualCount = await this.countResiduals(
      profile,
      namespace,
      accountNames,
      subjectCodes,
      userIds,
      patientIds,
      visitIds,
    );
    const seedHashUnchanged = (await this.globalSeedHash()) === seedBefore;
    if (residualCount !== 0 || !seedHashUnchanged) {
      throw new B10FixtureError(
        'B10_FIXTURE_CLEANUP_INCOMPLETE',
        'Fixture cleanup left namespace-owned resources or changed canonical seed',
        profile,
      );
    }
    const indexName = conflictIndexNameFor(namespace);
    const matched =
      users.length + patients.length + visits.length > 0 ||
      indexesBefore.some(({ name }) => name === indexName);
    const result: B10SafeCleanupSummary = {
      namespace,
      databaseName: this.databaseName,
      profile,
      residualCount,
      matched,
      seedHashUnchanged: true,
      expectedSummary: `profile=${profile}; residualCount=0; matched=${matched}; seedHashUnchanged=true`,
    };
    assertB10SafeManifest(result);
    return result;
  }

  async simulatePostBrowserForE2e(
    profile: B10Profile,
    rawNamespace: string,
  ): Promise<void> {
    const namespace = validateB10Namespace(profile, rawNamespace);
    await this.createPostBrowserSessionEvidence(profile, namespace);
    if (profile === 'public-surface-security') {
      return;
    }
    const root = await this.requireRoot(
      profile,
      namespace,
      'first_generate_success',
      'base',
    );
    const doctor = await this.models.users
      .findOne({
        accountName: accountNameFor(profile, namespace, 'doctor'),
      })
      .exec();
    if (!doctor) {
      throw this.scenarioInvalid(profile, 'first_generate_success');
    }
    const builderRoot: B10ScenarioRouteRoot = {
      scenarioKey: 'first_generate_success',
      routeKey: 'base',
      ordinal: 3,
      patientId: root.patient._id,
      visitId: root.visit._id,
      subjectCode: root.patient.subjectCode,
      visitCode: root.visit.visitCode,
      scaleCode: 'mmse',
      scaleInstanceIds: root.instances.map(({ _id }) => _id),
    };
    await new B10ScenarioBuilder(
      profile,
      namespace,
      this.models,
      this.workflows,
    ).createControlledFirstGeneratedReport(builderRoot, toActor(doctor));
  }

  private async verifyInternal(
    profile: B10Profile,
    namespace: string,
    password: string,
    phase: B10VerifyPhase,
  ): Promise<B10SafeManifest> {
    await withB10VerifyStage(profile, 'contract', phase, () =>
      assertB10Contract(),
    );
    const before = await withB10VerifyStage(
      profile,
      'initial_snapshot',
      phase,
      () => this.readOnlySnapshot(profile, namespace),
    );
    const roles = await withB10VerifyStage(
      profile,
      'users_and_password',
      phase,
      () => this.verifyUsers(profile, namespace, password),
    );
    await withB10VerifyStage(profile, 'root_matrix', phase, () =>
      this.verifyRootMatrix(profile, namespace, phase),
    );
    await withB10VerifyStage(profile, 'scenario_facts', phase, () =>
      this.verifyScenarioFacts(profile, namespace, phase),
    );
    await withB10VerifyStage(profile, 'post_browser_transitions', phase, () =>
      this.verifyPostBrowserEvidence(profile, namespace, phase),
    );
    await withB10VerifyStage(profile, 'profile_isolation', phase, () =>
      this.verifyProfileIsolation(profile, namespace),
    );
    await withB10VerifyStage(profile, 'global_seed', phase, () =>
      this.verifyBaselines(profile, namespace, phase),
    );
    const scenarios = await withB10VerifyStage(
      profile,
      'safe_manifest',
      phase,
      () => this.buildSafeScenarios(profile, namespace),
    );
    const resourceCounts = await this.resourceCounts(profile, namespace);
    await withB10VerifyStage(profile, 'final_snapshot', phase, async () => {
      const after = await this.readOnlySnapshot(profile, namespace);
      if (after !== before) {
        throw new B10FixtureError(
          'B10_FIXTURE_VERIFY_MUTATED_DATA',
          'Verify must not create, repair, remove, or update fixture data',
          profile,
        );
      }
    });
    const manifest: B10SafeManifest = {
      namespace,
      databaseName: this.databaseName,
      profile,
      phase,
      roles,
      scenarios,
      auditMatrix: auditMatrixFor(profile),
      resourceCounts,
      seedHashUnchanged: true,
      expectedSummary:
        `profile=${profile}; phase=${phase}; auditIds=${auditMatrixFor(profile).length}; ` +
        `scenarioKeys=${scenarios.length}; routes=${scenarios.flatMap(({ routes }) => routes).length}; ` +
        `patients=${resourceCounts.patients}; visits=${resourceCounts.visits}; instances=${resourceCounts.instances}; ` +
        `scoreResults=${resourceCounts.scoreResults}; cognitiveDomainResults=${resourceCounts.cognitiveDomainResults}; ` +
        `mediaEvidence=${resourceCounts.mediaEvidence}; clinicalReports=${resourceCounts.clinicalReports}; seedHashUnchanged=true`,
    };
    await withB10VerifyStage(profile, 'safe_manifest', phase, () =>
      assertB10SafeManifest(manifest),
    );
    return manifest;
  }

  private async verifyStageBaseline(
    profile: B10Profile,
    namespace: string,
    password: string,
  ): Promise<Map<string, RouteFixtureStageState>> {
    const before = await this.readOnlySnapshot(profile, namespace);
    await this.verifyUsers(profile, namespace, password);
    await this.verifyProfileIsolation(profile, namespace);
    const seedHash = await this.globalSeedHash();
    const definitions = scenarioDefinitionsFor(profile);
    const states = new Map<string, RouteFixtureStageState>();
    for (const definition of definitions) {
      const patient = await this.models.patients
        .findOne({
          subjectCode: scenarioSubjectCodeFor(
            profile,
            namespace,
            definition.ordinal,
          ),
        })
        .exec();
      const fixture = patient?.metadata?.b10Fixture as
        | FixtureMetadata
        | undefined;
      if (
        !patient ||
        !fixture ||
        fixture.version !== 1 ||
        fixture.profile !== profile ||
        fixture.namespace !== namespace ||
        fixture.scenarioKey !== definition.scenarioKey ||
        fixture.seedHash !== seedHash ||
        fixture.patientInvariantHash !== this.patientInvariantHash(patient) ||
        fixture.routeBaselines.length !== definition.routeContracts.length
      ) {
        throw new B10FixtureError(
          'B10_FIXTURE_STAGE_BASELINE_INVALID',
          'Stage requires an intact prepared namespace baseline',
          profile,
          definition.scenarioKey,
        );
      }
      for (const contract of definition.routeContracts) {
        const root = await this.requireRoot(
          profile,
          namespace,
          definition.scenarioKey,
          contract.key,
        );
        const baseline = fixture.routeBaselines.find(
          ({ routeKey }) => routeKey === contract.key,
        );
        if (!baseline) {
          throw this.scenarioInvalid(
            profile,
            definition.scenarioKey,
            contract.key,
          );
        }
        const state = await this.fixtureStageState(
          profile,
          namespace,
          definition.scenarioKey,
          root,
          contract,
        );
        states.set(`${definition.scenarioKey}/${contract.key}`, state);
        const transition =
          state === 'staged'
            ? contract.browserActionPlan.fixtureTransition
            : 'none';
        await this.verifyRouteFacts(
          profile,
          namespace,
          definition.scenarioKey,
          root,
          contract,
          'prepared',
          transition,
        );
        const reports = await this.models.reports
          .find({ assessmentVisitId: root.visit._id })
          .sort({ _id: 1 })
          .exec();
        const sourceMatches =
          transition === 'stage-source-scale-not-ready'
            ? baseline.sourceHashWithoutFirstInstanceStatus ===
              (await this.sourceHash(root, true))
            : baseline.sourceHash === (await this.sourceHash(root));
        const reportMatches =
          transition === 'stage-different-scope-draft'
            ? baseline.reportCount === 0 && reports.length === 1
            : baseline.reportCount === reports.length &&
              baseline.reportHash === this.reportHash(reports);
        if (
          baseline.visitCode !== root.visit.visitCode ||
          baseline.instanceCount !== root.instances.length ||
          baseline.postBrowserSideEffect !== contract.postBrowserSideEffect ||
          !sourceMatches ||
          !reportMatches
        ) {
          throw this.scenarioInvalid(
            profile,
            definition.scenarioKey,
            contract.key,
          );
        }
      }
    }
    const expectedVisits = definitions.flatMap(
      ({ routeContracts }) => routeContracts,
    ).length;
    const expectedInstances = definitions.reduce(
      (sum, definition) =>
        sum +
        definition.routeContracts.reduce(
          (routeSum, contract) => routeSum + contract.instanceStates.length,
          0,
        ),
      0,
    );
    const expectedPreparedReports = definitions.reduce(
      (sum, definition) =>
        sum +
        definition.routeContracts.reduce(
          (routeSum, contract) =>
            routeSum + preparedReportCount(contract.reportVariant),
          0,
        ),
      0,
    );
    const stagedReportCount =
      states.get('scope_conflict/base') === 'staged' ? 1 : 0;
    const counts = await this.resourceCounts(profile, namespace);
    if (
      counts.roles !== B10_ROLES.length ||
      counts.patients !== definitions.length ||
      counts.visits !== expectedVisits ||
      counts.instances !== expectedInstances ||
      counts.clinicalReports !== expectedPreparedReports + stagedReportCount
    ) {
      throw new B10FixtureError(
        'B10_FIXTURE_STAGE_BASELINE_INVALID',
        'Stage requires the exact prepared or allowlisted staged resource matrix',
        profile,
      );
    }
    const after = await this.readOnlySnapshot(profile, namespace);
    if (after !== before) {
      throw new B10FixtureError(
        'B10_FIXTURE_VERIFY_MUTATED_DATA',
        'Stage baseline verification must not mutate fixture data',
        profile,
      );
    }
    return states;
  }

  private async fixtureStageState(
    profile: B10Profile,
    namespace: string,
    scenarioKey: B10BusinessScenarioKey,
    root: RouteRoot,
    contract: B10RoutePreparedContract,
  ): Promise<RouteFixtureStageState> {
    if (contract.browserActionPlan.fixtureTransition === 'none') {
      return 'prepared';
    }
    if (
      contract.browserActionPlan.fixtureTransition ===
      'stage-different-scope-draft'
    ) {
      const reports = await this.models.reports
        .find({ assessmentVisitId: root.visit._id })
        .sort({ _id: 1 })
        .exec();
      if (reports.length === 0) {
        return 'prepared';
      }
      if (reports.length === 1) {
        this.assertFixedScopeConflictStage(
          profile,
          namespace,
          scenarioKey,
          reports[0],
          root,
        );
        return 'staged';
      }
      throw this.scenarioInvalid(profile, scenarioKey, contract.key);
    }
    if (root.instances.length !== 1) {
      throw this.scenarioInvalid(profile, scenarioKey, contract.key);
    }
    if (root.instances[0].status === 'completed') {
      return 'prepared';
    }
    if (root.instances[0].status === 'in_progress') {
      return 'staged';
    }
    throw this.scenarioInvalid(profile, scenarioKey, contract.key);
  }

  private async createUsers(
    profile: B10Profile,
    namespace: string,
    password: string,
  ): Promise<Map<B10Role, UserDocument>> {
    const result = new Map<B10Role, UserDocument>();
    for (const role of B10_ROLES) {
      const user = await this.models.users.create({
        accountName: accountNameFor(profile, namespace, role),
        displayName: displayNameFor(profile, role),
        staffCode: `${
          profile === 'generation-workflow' ? 'B10GFX' : 'B10PFX'
        }-${namespace}-${role}`,
        passwordHash: await this.authService.hashPassword(password),
        passwordChangedAt: BASELINE_DATE,
        roles: [role],
        permissions: [],
        userType: role,
        status: 'active',
        failedLoginCount: 0,
        lockedUntil: null,
        metadata: null,
      });
      result.set(role, user);
    }
    return result;
  }

  private async verifyUsers(
    profile: B10Profile,
    namespace: string,
    password: string,
  ): Promise<B10SafeRoleManifest[]> {
    const result: B10SafeRoleManifest[] = [];
    for (const role of B10_ROLES) {
      const user = await this.models.users
        .findOne({ accountName: accountNameFor(profile, namespace, role) })
        .select('+passwordHash')
        .exec();
      if (
        !user ||
        user.status !== 'active' ||
        user.userType !== role ||
        user.roles.length !== 1 ||
        user.roles[0] !== role ||
        !(await this.authService.verifyPassword(password, user.passwordHash))
      ) {
        throw new B10FixtureError(
          'B10_FIXTURE_ACCOUNT_INVALID',
          `Fixture account for role ${role} is missing or invalid`,
          profile,
          'roles',
        );
      }
      result.push({
        role,
        loginIdentifier: user.accountName,
        displayName: user.displayName,
      });
    }
    return result;
  }

  private async verifyRootMatrix(
    profile: B10Profile,
    namespace: string,
    phase: B10VerifyPhase,
  ): Promise<void> {
    const definitions = scenarioDefinitionsFor(profile);
    const expectedVisits = definitions.flatMap(
      ({ routeContracts }) => routeContracts,
    ).length;
    const expectedInstances = definitions.reduce(
      (sum, definition) =>
        sum +
        definition.routeContracts.reduce(
          (routeSum, routeValue) => routeSum + routeValue.instanceStates.length,
          0,
        ),
      0,
    );
    const expectedPreparedReports = definitions.reduce(
      (sum, definition) =>
        sum +
        definition.routeContracts.reduce(
          (routeSum, routeValue) =>
            routeSum + preparedReportCount(routeValue.reportVariant),
          0,
        ),
      0,
    );
    const expectedReports =
      expectedPreparedReports +
      (phase === 'post-browser' && profile === 'generation-workflow' ? 2 : 0);
    const counts = await this.resourceCounts(profile, namespace);
    if (
      counts.roles !== B10_ROLES.length ||
      counts.patients !== definitions.length ||
      counts.visits !== expectedVisits ||
      counts.instances !== expectedInstances ||
      counts.clinicalReports !== expectedReports
    ) {
      throw new B10FixtureError(
        'B10_FIXTURE_ROOT_MATRIX_INVALID',
        'The exact B10 account, patient, visit, source, and report matrix is invalid',
        profile,
      );
    }
    const subjectCodes = this.subjectCodes(profile, namespace);
    const patients = await this.models.patients
      .find({ subjectCode: { $in: subjectCodes } })
      .exec();
    if (
      patients.some(
        (patient) =>
          !patient.tags.includes('synthetic') ||
          !patient.tags.includes('deidentified') ||
          !patient.tags.includes('b10') ||
          !patient.tags.includes(profile) ||
          patient.birthDate !== null ||
          patient.externalRefs !== null,
      )
    ) {
      throw new B10FixtureError(
        'B10_FIXTURE_DEIDENTIFICATION_INVALID',
        'Every B10 patient root must remain synthetic and de-identified',
        profile,
      );
    }
    const patientIds = patients.map(({ _id }) => _id);
    const instances = await this.models.scaleInstances
      .find({ patientId: { $in: patientIds } })
      .exec();
    for (const instance of instances) {
      const [version, itemCount] = await Promise.all([
        this.models.scaleVersions
          .findById(instance.scaleVersionId)
          .select({ items: 1, version: 1, status: 1 })
          .lean<{ items: unknown[]; version: string; status: string }>()
          .exec(),
        this.models.itemResponses.countDocuments({
          scaleInstanceId: instance._id,
        }),
      ]);
      if (
        !version ||
        version.status !== 'active' ||
        version.version !== instance.scaleVersion ||
        itemCount !== version.items.length
      ) {
        throw new B10FixtureError(
          'B10_FIXTURE_ITEM_MATRIX_INVALID',
          'A B10 instance does not match a canonical published scale version',
          profile,
        );
      }
    }
  }

  private async verifyScenarioFacts(
    profile: B10Profile,
    namespace: string,
    phase: B10VerifyPhase,
  ): Promise<void> {
    for (const definition of scenarioDefinitionsFor(profile)) {
      for (const contract of definition.routeContracts) {
        const root = await this.requireRoot(
          profile,
          namespace,
          definition.scenarioKey,
          contract.key,
        );
        await this.verifyRouteFacts(
          profile,
          namespace,
          definition.scenarioKey,
          root,
          contract,
          phase,
        );
      }
    }
  }

  private async verifyRouteFacts(
    profile: B10Profile,
    namespace: string,
    scenarioKey: B10BusinessScenarioKey,
    root: RouteRoot,
    contract: B10RoutePreparedContract,
    phase: B10VerifyPhase,
    fixtureTransition: B10FixtureTransition = phase === 'post-browser'
      ? contract.browserActionPlan.fixtureTransition
      : 'none',
  ): Promise<void> {
    if (
      root.patient.status !== contract.patientStatus ||
      root.visit.status !== contract.visitStatus ||
      root.instances.length !== contract.instanceStates.length ||
      root.instances.some(
        (instance, index) =>
          instance.status !==
          (fixtureTransition === 'stage-source-scale-not-ready' && index === 0
            ? 'in_progress'
            : expectedInstanceStatus(contract.instanceStates[index])),
      )
    ) {
      throw new B10FixtureError(
        'B10_FIXTURE_SCENARIO_INVALID',
        `B10 route ${contract.key} state mismatch: expected ${contract.patientStatus}/${contract.visitStatus}/${contract.instanceStates
          .map(expectedInstanceStatus)
          .join(
            ',',
          )}; received ${root.patient.status}/${root.visit.status}/${root.instances
          .map(({ status }) => status)
          .join(',')}`,
        profile,
        scenarioKey,
      );
    }
    for (const [index, state] of contract.instanceStates.entries()) {
      const instance = root.instances[index];
      const [scores, domains, media] = await Promise.all([
        this.models.scoreResults
          .find({ scaleInstanceId: instance._id })
          .sort({ runNo: 1 })
          .exec(),
        this.models.cognitiveDomainResults
          .find({ scaleInstanceId: instance._id })
          .sort({ runNo: 1 })
          .exec(),
        this.models.mediaEvidence
          .find({ scaleInstanceId: instance._id })
          .exec(),
      ]);
      const expectsScore = [
        'final',
        'score_not_final',
        'domain_missing',
        'media_invalid',
      ].includes(state);
      const expectsDomain = ['final', 'media_invalid'].includes(state);
      if (
        (expectsScore ? scores.length !== 1 : scores.length !== 0) ||
        (expectsDomain ? domains.length !== 1 : domains.length !== 0)
      ) {
        throw this.scenarioInvalid(profile, scenarioKey, contract.key);
      }
      if (
        (state === 'final' ||
          state === 'domain_missing' ||
          state === 'media_invalid') &&
        (scores[0]?.status !== 'confirmed' ||
          scores[0]?.qualityStatus !== 'passed' ||
          scores[0]?.review?.reviewStatus !== 'reviewed')
      ) {
        throw this.scenarioInvalid(profile, scenarioKey, contract.key);
      }
      if (
        state === 'score_not_final' &&
        (scores[0]?.status === 'confirmed' || scores[0]?.status === 'locked')
      ) {
        throw this.scenarioInvalid(profile, scenarioKey, contract.key);
      }
      if (
        expectsDomain &&
        (domains[0]?.runNo !== 1 ||
          domains[0]?.status !== 'computed' ||
          domains[0]?.domainScores.length === 0 ||
          domains[0]?.itemContributions.length === 0)
      ) {
        throw this.scenarioInvalid(profile, scenarioKey, contract.key);
      }
      if (
        state === 'media_invalid' &&
        (media.length === 0 ||
          media.every((item) => item.storage?.objectKey?.trim()))
      ) {
        throw this.scenarioInvalid(profile, scenarioKey, contract.key);
      }
    }
    await this.verifyReportVariant(
      profile,
      namespace,
      scenarioKey,
      root,
      contract,
      phase,
      fixtureTransition,
    );
  }

  private async verifyReportVariant(
    profile: B10Profile,
    namespace: string,
    scenarioKey: B10BusinessScenarioKey,
    root: RouteRoot,
    contract: B10RoutePreparedContract,
    phase: B10VerifyPhase,
    fixtureTransition: B10FixtureTransition,
  ): Promise<void> {
    const reports = await this.models.reports
      .find({ assessmentVisitId: root.visit._id })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    const firstGenerated =
      phase === 'post-browser' &&
      contract.postBrowserSideEffect === 'create-version-one-draft';
    const stagedScopeConflict =
      fixtureTransition === 'stage-different-scope-draft';
    const expectedCount =
      preparedReportCount(contract.reportVariant) +
      (firstGenerated ? 1 : 0) +
      (stagedScopeConflict ? 1 : 0);
    if (reports.length !== expectedCount) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
    if (firstGenerated) {
      if (reports.length !== 1) {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
      const rawReport = await this.models.reports.collection.findOne(
        { _id: reports[0]._id },
        { projection: { isFinal: 1 } },
      );
      if (rawReport && Object.hasOwn(rawReport, 'isFinal')) {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
      this.assertLegalVersionOneDraft(profile, scenarioKey, reports[0], root);
      return;
    }
    if (stagedScopeConflict) {
      if (reports.length !== 1) {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
      this.assertFixedScopeConflictStage(
        profile,
        namespace,
        scenarioKey,
        reports[0],
        root,
      );
      return;
    }
    const report = reports[0];
    if (!report) {
      return;
    }
    if (contract.reportVariant === 'generation_conflict_blocker') {
      if (report.reportType !== 'follow_up') {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
      await this.verifyConflictIndex(
        profile,
        namespace,
        root.patient.subjectCode,
      );
      return;
    }
    if (
      report.reportType !== 'cognitive_assessment' ||
      report.reportVersion !== 1
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
    if (
      contract.reportVariant === 'incomplete' &&
      report.patientSnapshot !== null
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
    if (
      contract.reportVariant === 'voided' &&
      (report.status !== 'voided' || !report.voidedAt || !report.voidReason)
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
    if (
      contract.reportVariant === 'confirmed_history' &&
      (report.status !== 'confirmed' || !report.confirmation?.confirmedAt)
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
    if (
      contract.reportVariant === 'pending_confirmation' &&
      (report.status !== 'pending_confirmation' || report.source !== 'mixed')
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
    if (
      contract.reportVariant === 'generation_null' &&
      report.metadata !== null
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
  }

  private assertLegalVersionOneDraft(
    profile: B10Profile,
    scenarioKey: B10BusinessScenarioKey,
    report: ClinicalReportDocument,
    root: RouteRoot,
  ): void {
    const generation = report.metadata?.a20Generation as
      | Record<string, unknown>
      | undefined;
    if (
      report.patientId.toString() !== root.patient._id.toString() ||
      report.assessmentVisitId.toString() !== root.visit._id.toString() ||
      report.reportType !== 'cognitive_assessment' ||
      report.reportVersion !== 1 ||
      report.status !== 'draft' ||
      report.source !== 'system_draft' ||
      report.confirmation !== null ||
      report.lockedAt !== null ||
      report.archivedAt !== null ||
      report.voidedAt !== null ||
      !generation ||
      generation.version !== 1 ||
      generation.aiUsed !== false ||
      report.primaryScaleInstanceIds.length !== 1 ||
      report.primaryScaleInstanceIds.some(
        (instanceId, index) =>
          instanceId.toString() !== root.instances[index]?._id.toString(),
      ) ||
      report.scoreResultIds.length !== 1 ||
      report.cognitiveDomainResultIds.length !== 1
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
  }

  private assertFixedScopeConflictStage(
    profile: B10Profile,
    namespace: string,
    scenarioKey: B10BusinessScenarioKey,
    report: ClinicalReportDocument,
    root: RouteRoot,
  ): void {
    const marker = report.metadata?.b10FixtureStage as
      | Record<string, unknown>
      | undefined;
    if (
      scenarioKey !== 'scope_conflict' ||
      root.instances.length !== 2 ||
      marker?.version !== 1 ||
      marker.profile !== profile ||
      marker.namespace !== namespace ||
      marker.scenarioKey !== scenarioKey ||
      marker.routeKey !== 'base' ||
      marker.transition !== 'stage-different-scope-draft'
    ) {
      throw this.scenarioInvalid(profile, scenarioKey, 'base');
    }
    this.assertLegalVersionOneDraft(profile, scenarioKey, report, root);
  }

  private async verifyPostBrowserEvidence(
    profile: B10Profile,
    namespace: string,
    phase: B10VerifyPhase,
  ): Promise<void> {
    const users = await this.models.users
      .find({
        accountName: {
          $in: B10_ROLES.map((role) =>
            accountNameFor(profile, namespace, role),
          ),
        },
      })
      .select({ _id: 1, userType: 1 })
      .lean<{ _id: Types.ObjectId; userType: string }[]>()
      .exec();
    const sessions = await this.models.sessions
      .find({
        userId: { $in: users.map(({ _id }) => _id) },
        status: 'active',
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .lean()
      .exec();
    if (phase === 'prepared') {
      if (sessions.length !== 0) {
        throw new B10FixtureError(
          'B10_FIXTURE_PREPARED_SESSION_UNEXPECTED',
          'Prepared fixtures must not pre-create Browser Sessions',
          profile,
        );
      }
      return;
    }
    const requiredRoles = new Set(
      auditMatrixFor(profile)
        .filter(({ auditId }) => auditId !== 'B10-83')
        .map(({ primaryRole }) => primaryRole),
    );
    const activeUserIds = new Set(
      sessions.map(({ userId }) => userId.toString()),
    );
    const coveredRoles = new Set(
      users
        .filter(({ _id }) => activeUserIds.has(_id.toString()))
        .map(({ userType }) => userType),
    );
    if ([...requiredRoles].some((role) => !coveredRoles.has(role))) {
      throw new B10FixtureError(
        'B10_FIXTURE_BROWSER_SESSION_EVIDENCE_MISSING',
        'Post-browser verify requires selected-profile Session evidence for every primary role',
        profile,
      );
    }
  }

  private async recordBaselines(
    profile: B10Profile,
    namespace: string,
    seedHash: string,
  ): Promise<void> {
    for (const definition of scenarioDefinitionsFor(profile)) {
      const patient = await this.models.patients
        .findOne({
          subjectCode: scenarioSubjectCodeFor(
            profile,
            namespace,
            definition.ordinal,
          ),
        })
        .exec();
      if (!patient) {
        throw this.scenarioInvalid(profile, definition.scenarioKey);
      }
      const routeBaselines: RouteBaseline[] = [];
      for (const contract of definition.routeContracts) {
        const root = await this.requireRoot(
          profile,
          namespace,
          definition.scenarioKey,
          contract.key,
        );
        const reports = await this.models.reports
          .find({ assessmentVisitId: root.visit._id })
          .sort({ _id: 1 })
          .exec();
        routeBaselines.push({
          routeKey: contract.key,
          visitCode: root.visit.visitCode,
          instanceCount: root.instances.length,
          sourceHash: await this.sourceHash(root),
          sourceHashWithoutFirstInstanceStatus: await this.sourceHash(
            root,
            true,
          ),
          reportHash: this.reportHash(reports),
          reportCount: reports.length,
          postBrowserSideEffect: contract.postBrowserSideEffect,
        });
      }
      const metadata: FixtureMetadata = {
        version: 1,
        profile,
        namespace,
        scenarioKey: definition.scenarioKey,
        seedHash,
        patientInvariantHash: this.patientInvariantHash(patient),
        routeBaselines,
      };
      await this.models.patients
        .updateOne(
          { _id: patient._id },
          { $set: { metadata: { b10Fixture: metadata } } },
        )
        .exec();
    }
  }

  private async verifyBaselines(
    profile: B10Profile,
    namespace: string,
    phase: B10VerifyPhase,
  ): Promise<void> {
    const seedHash = await this.globalSeedHash();
    for (const definition of scenarioDefinitionsFor(profile)) {
      const patient = await this.models.patients
        .findOne({
          subjectCode: scenarioSubjectCodeFor(
            profile,
            namespace,
            definition.ordinal,
          ),
        })
        .exec();
      const fixture = patient?.metadata?.b10Fixture as
        | FixtureMetadata
        | undefined;
      if (
        !patient ||
        !fixture ||
        fixture.version !== 1 ||
        fixture.profile !== profile ||
        fixture.namespace !== namespace ||
        fixture.scenarioKey !== definition.scenarioKey ||
        fixture.seedHash !== seedHash ||
        fixture.patientInvariantHash !== this.patientInvariantHash(patient) ||
        fixture.routeBaselines.length !== definition.routeContracts.length
      ) {
        throw new B10FixtureError(
          'B10_FIXTURE_BASELINE_INVALID',
          'Namespace ownership or protected canonical seed baseline is missing or changed',
          profile,
          definition.scenarioKey,
        );
      }
      for (const contract of definition.routeContracts) {
        const baseline = fixture.routeBaselines.find(
          ({ routeKey }) => routeKey === contract.key,
        );
        const root = await this.requireRoot(
          profile,
          namespace,
          definition.scenarioKey,
          contract.key,
        );
        const reports = await this.models.reports
          .find({ assessmentVisitId: root.visit._id })
          .sort({ _id: 1 })
          .exec();
        const stagedTransition =
          phase === 'post-browser'
            ? contract.browserActionPlan.fixtureTransition
            : 'none';
        const sourceHashMatches =
          stagedTransition === 'stage-source-scale-not-ready'
            ? baseline?.sourceHashWithoutFirstInstanceStatus ===
              (await this.sourceHash(root, true))
            : baseline?.sourceHash === (await this.sourceHash(root));
        if (
          !baseline ||
          baseline.visitCode !== root.visit.visitCode ||
          baseline.instanceCount !== root.instances.length ||
          !sourceHashMatches ||
          baseline.postBrowserSideEffect !== contract.postBrowserSideEffect
        ) {
          throw this.scenarioInvalid(profile, definition.scenarioKey);
        }
        if (stagedTransition === 'stage-different-scope-draft') {
          if (baseline.reportCount !== 0 || reports.length !== 1) {
            throw this.scenarioInvalid(profile, definition.scenarioKey);
          }
          this.assertFixedScopeConflictStage(
            profile,
            namespace,
            definition.scenarioKey,
            reports[0],
            root,
          );
        } else if (
          phase === 'prepared' ||
          contract.postBrowserSideEffect === 'none'
        ) {
          if (
            baseline.reportCount !== reports.length ||
            baseline.reportHash !== this.reportHash(reports)
          ) {
            throw this.scenarioInvalid(profile, definition.scenarioKey);
          }
        } else if (
          contract.postBrowserSideEffect === 'create-version-one-draft'
        ) {
          if (baseline.reportCount !== 0 || reports.length !== 1) {
            throw this.scenarioInvalid(profile, definition.scenarioKey);
          }
          this.assertLegalVersionOneDraft(
            profile,
            definition.scenarioKey,
            reports[0],
            root,
          );
        }
      }
    }
  }

  private async verifyProfileIsolation(
    profile: B10Profile,
    namespace: string,
  ): Promise<void> {
    const subjectCodes = this.subjectCodes(profile, namespace);
    const unexpected = await this.models.patients.countDocuments({
      'metadata.b10Fixture.namespace': namespace,
      $or: [
        { subjectCode: { $nin: subjectCodes } },
        { 'metadata.b10Fixture.profile': { $ne: profile } },
      ],
    });
    const oppositePrefix =
      profile === 'generation-workflow' ? /^B10P-/ : /^B10G-/;
    const crossProfileOwned = await this.models.patients.countDocuments({
      subjectCode: { $in: subjectCodes, $regex: oppositePrefix },
    });
    if (unexpected !== 0 || crossProfileOwned !== 0) {
      throw new B10FixtureError(
        'B10_FIXTURE_PROFILE_POLLUTION',
        'The selected profile contains cross-profile or foreign namespace ownership',
        profile,
      );
    }
  }

  private async buildSafeScenarios(
    profile: B10Profile,
    namespace: string,
  ): Promise<B10SafeScenarioManifest[]> {
    const result: B10SafeScenarioManifest[] = [];
    for (const definition of scenarioDefinitionsFor(profile)) {
      const routes: B10SafeScenarioManifest['routes'] = [];
      for (const contract of definition.routeContracts) {
        await this.requireRoot(
          profile,
          namespace,
          definition.scenarioKey,
          contract.key,
        );
        routes.push({
          key: contract.key,
          auditIds: contract.auditIds,
          navigationLabel: `${definition.scenarioKey}/${contract.key}`,
          pathTemplate: PATH_TEMPLATE,
          preparedState: contract.preparedState,
          expectedRequest: contract.expectedRequest,
          expectedHttpStatus: contract.expectedHttpStatus,
          postBrowserSideEffect: contract.postBrowserSideEffect,
          browserActionPlan: contract.browserActionPlan,
        });
      }
      result.push({
        scenarioKey: definition.scenarioKey,
        primaryOwnerAuditId: definition.primaryOwnerAuditId,
        auditIds: definition.auditIds,
        preparedState: definition.preparedState,
        routes,
      });
    }
    return result;
  }

  private async createPostBrowserSessionEvidence(
    profile: B10Profile,
    namespace: string,
  ): Promise<void> {
    const requiredRoles = new Set(
      auditMatrixFor(profile)
        .filter(({ auditId }) => auditId !== 'B10-83')
        .map(({ primaryRole }) => primaryRole),
    );
    for (const role of requiredRoles) {
      const user = await this.models.users
        .findOne({ accountName: accountNameFor(profile, namespace, role) })
        .exec();
      if (!user) {
        throw new B10FixtureError(
          'B10_FIXTURE_ACCOUNT_INVALID',
          'A controlled post-browser Session user is missing',
          profile,
        );
      }
      await this.models.sessions.create({
        userId: user._id,
        sessionTokenHash: stableHash({
          fixture: 'b10-e2e-post-browser',
          profile,
          namespace,
          role,
        }),
        status: 'active',
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        revokedAt: null,
        lastSeenAt: BASELINE_DATE,
        userAgent: 'B10 controlled E2E Session',
        ipAddress: '127.0.0.1',
        rolesSnapshot: [role],
        permissionsSnapshot: [],
        metadata: {
          b10Fixture: { profile, namespace, controlledE2e: true },
        },
      });
    }
  }

  private async resourceCounts(
    profile: B10Profile,
    namespace: string,
  ): Promise<B10ResourceCounts> {
    const accountNames = B10_ROLES.map((role) =>
      accountNameFor(profile, namespace, role),
    );
    const subjectCodes = this.subjectCodes(profile, namespace);
    const patients = await this.models.patients
      .find({ subjectCode: { $in: subjectCodes } })
      .select({ _id: 1 })
      .lean<IdRow[]>()
      .exec();
    const patientIds = patients.map(({ _id }) => _id);
    const visits = await this.models.visits
      .find({ patientId: { $in: patientIds } })
      .select({ _id: 1 })
      .lean<IdRow[]>()
      .exec();
    const visitIds = visits.map(({ _id }) => _id);
    const ownership = this.ownershipFilter(patientIds, visitIds);
    const [
      roles,
      instances,
      itemResponses,
      mediaEvidence,
      scoreResults,
      cognitiveDomainResults,
      clinicalReports,
      companionReports,
      indexes,
    ] = await Promise.all([
      this.models.users.countDocuments({ accountName: { $in: accountNames } }),
      this.models.scaleInstances.countDocuments(ownership),
      this.models.itemResponses.countDocuments(ownership),
      this.models.mediaEvidence.countDocuments(ownership),
      this.models.scoreResults.countDocuments(ownership),
      this.models.cognitiveDomainResults.countDocuments(ownership),
      this.models.reports.countDocuments(ownership),
      this.models.reports.countDocuments({
        ...ownership,
        reportType: { $ne: 'cognitive_assessment' },
      }),
      this.models.reports.collection.listIndexes().toArray(),
    ]);
    return {
      roles,
      patients: patients.length,
      visits: visits.length,
      instances,
      itemResponses,
      mediaEvidence,
      scoreResults,
      cognitiveDomainResults,
      clinicalReports,
      companionReports,
      ownedIndexes: indexes.some(
        ({ name }) => name === conflictIndexNameFor(namespace),
      )
        ? 1
        : 0,
    };
  }

  private async requireRoot(
    profile: B10Profile,
    namespace: string,
    scenarioKey: B10BusinessScenarioKey,
    routeKey: string,
  ): Promise<RouteRoot> {
    const definition = scenarioDefinitionsFor(profile).find(
      (candidate) => candidate.scenarioKey === scenarioKey,
    );
    if (!definition) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
    const patient = await this.models.patients
      .findOne({
        subjectCode: scenarioSubjectCodeFor(
          profile,
          namespace,
          definition.ordinal,
        ),
      })
      .exec();
    const visit = patient
      ? await this.models.visits
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
      throw this.scenarioInvalid(profile, scenarioKey);
    }
    const instances = await this.models.scaleInstances
      .find({ assessmentVisitId: visit._id })
      .sort({ instanceNo: 1, _id: 1 })
      .exec();
    return { patient, visit, instances };
  }

  private async sourceHash(
    root: RouteRoot,
    omitFirstInstanceStatus = false,
  ): Promise<string> {
    const instanceIds = root.instances.map(({ _id }) => _id);
    const [visit, instances, items, media, scores, domains] = await Promise.all(
      [
        this.models.visits.findById(root.visit._id).lean().exec(),
        this.models.scaleInstances
          .find({ _id: { $in: instanceIds } })
          .sort({ _id: 1 })
          .lean()
          .exec(),
        this.models.itemResponses
          .find({ scaleInstanceId: { $in: instanceIds } })
          .sort({ _id: 1 })
          .lean()
          .exec(),
        this.models.mediaEvidence
          .find({ scaleInstanceId: { $in: instanceIds } })
          .sort({ _id: 1 })
          .lean()
          .exec(),
        this.models.scoreResults
          .find({ scaleInstanceId: { $in: instanceIds } })
          .sort({ _id: 1 })
          .lean()
          .exec(),
        this.models.cognitiveDomainResults
          .find({ scaleInstanceId: { $in: instanceIds } })
          .sort({ _id: 1 })
          .lean()
          .exec(),
      ],
    );
    const firstInstanceId = root.instances[0]?._id.toString();
    const normalizedInstances = omitFirstInstanceStatus
      ? instances.map((instance) =>
          instance._id.toString() === firstInstanceId
            ? { ...instance, status: undefined }
            : instance,
        )
      : instances;
    return stableHash({
      visit,
      instances: normalizedInstances,
      items,
      media,
      scores,
      domains,
    });
  }

  private reportHash(reports: ClinicalReportDocument[]): string {
    return stableHash(reports.map((report) => report.toObject()));
  }

  private patientInvariantHash(patient: PatientDocument): string {
    const raw: Record<string, unknown> = { ...patient.toObject() };
    return stableHash({ ...raw, metadata: undefined, updatedAt: undefined });
  }

  private async globalSeedHash(): Promise<string> {
    const [definitions, allVersions] = await Promise.all([
      this.models.scaleDefinitions
        .find({ code: { $in: ['mmse', 'moca'] } })
        .sort({ code: 1, _id: 1 })
        .lean()
        .exec(),
      this.models.scaleVersions
        .find({ scaleCode: { $in: ['mmse', 'moca'] } })
        .sort({ scaleCode: 1, version: 1, _id: 1 })
        .lean()
        .exec(),
    ]);
    const versions = allVersions.filter(isB10ProtectedCanonicalScaleVersion);
    return stableHash(withoutLifecycleTimestamps({ definitions, versions }));
  }

  private async readOnlySnapshot(
    profile: B10Profile,
    namespace: string,
  ): Promise<string> {
    const accountNames = B10_ROLES.map((role) =>
      accountNameFor(profile, namespace, role),
    );
    const subjectCodes = this.subjectCodes(profile, namespace);
    const [users, patients, indexes] = await Promise.all([
      this.models.users
        .find({ accountName: { $in: accountNames } })
        .select('+passwordHash')
        .sort({ _id: 1 })
        .lean()
        .exec(),
      this.models.patients
        .find({ subjectCode: { $in: subjectCodes } })
        .sort({ _id: 1 })
        .lean()
        .exec(),
      this.models.reports.collection.listIndexes().toArray(),
    ]);
    const patientIds = patients.map(({ _id }) => _id);
    const visits = await this.models.visits
      .find({ patientId: { $in: patientIds } })
      .sort({ _id: 1 })
      .lean()
      .exec();
    const visitIds = visits.map(({ _id }) => _id);
    const ownership = this.ownershipFilter(patientIds, visitIds);
    const [instances, items, media, scores, domains, reports, sessions] =
      await Promise.all([
        this.models.scaleInstances
          .find(ownership)
          .sort({ _id: 1 })
          .lean()
          .exec(),
        this.models.itemResponses
          .find(ownership)
          .sort({ _id: 1 })
          .lean()
          .exec(),
        this.models.mediaEvidence
          .find(ownership)
          .sort({ _id: 1 })
          .lean()
          .exec(),
        this.models.scoreResults.find(ownership).sort({ _id: 1 }).lean().exec(),
        this.models.cognitiveDomainResults
          .find(ownership)
          .sort({ _id: 1 })
          .lean()
          .exec(),
        this.models.reports.find(ownership).sort({ _id: 1 }).lean().exec(),
        this.models.sessions
          .find({ userId: { $in: users.map(({ _id }) => _id) } })
          .sort({ _id: 1 })
          .lean()
          .exec(),
      ]);
    return stableHash({
      users,
      patients,
      visits,
      instances,
      items,
      media,
      scores,
      domains,
      reports,
      sessions,
      conflictIndexes: indexes.filter(
        ({ name }) => name === conflictIndexNameFor(namespace),
      ),
    });
  }

  private subjectCodes(profile: B10Profile, namespace: string): string[] {
    return scenarioDefinitionsFor(profile).map(({ ordinal }) =>
      scenarioSubjectCodeFor(profile, namespace, ordinal),
    );
  }

  private ownershipFilter(
    patientIds: Types.ObjectId[],
    visitIds: Types.ObjectId[],
  ): Record<string, unknown> {
    return {
      $or: [
        { patientId: { $in: patientIds } },
        { assessmentVisitId: { $in: visitIds } },
      ],
    };
  }

  private scenarioInvalid(
    profile: B10Profile,
    scenarioKey: B10BusinessScenarioKey,
    routeKey?: string,
  ): B10FixtureError {
    return new B10FixtureError(
      'B10_FIXTURE_SCENARIO_INVALID',
      routeKey
        ? `B10 route ${routeKey} differs from its fixed prepared or post-browser contract`
        : 'A B10 scenario differs from its fixed prepared or post-browser contract',
      profile,
      scenarioKey,
    );
  }

  private async verifyConflictIndex(
    profile: B10Profile,
    namespace: string,
    subjectCode: string,
  ): Promise<void> {
    const indexes = (await this.models.reports.collection
      .listIndexes()
      .toArray()) as IndexDescription[];
    const index = indexes.find(
      ({ name }) => name === conflictIndexNameFor(namespace),
    );
    if (
      profile !== 'generation-workflow' ||
      index?.unique !== true ||
      index.key?.assessmentVisitId !== 1 ||
      index.partialFilterExpression?.subjectCode !== subjectCode
    ) {
      throw new B10FixtureError(
        'B10_FIXTURE_CONFLICT_INDEX_INVALID',
        'The namespace-owned deterministic generation-conflict index is missing or unsafe',
        profile,
        'generation_conflict',
      );
    }
  }

  private async dropConflictIndex(namespace: string): Promise<void> {
    const name = conflictIndexNameFor(namespace);
    const indexes = (await this.models.reports.collection
      .listIndexes()
      .toArray()) as IndexDescription[];
    if (indexes.some((index) => index.name === name)) {
      await this.models.reports.collection.dropIndex(name);
    }
  }

  private async assertNamespaceUnused(
    profile: B10Profile,
    namespace: string,
  ): Promise<void> {
    const accountNames = B10_ROLES.map((role) =>
      accountNameFor(profile, namespace, role),
    );
    const subjectCodes = this.subjectCodes(profile, namespace);
    const [users, patients, indexes] = await Promise.all([
      this.models.users.countDocuments({ accountName: { $in: accountNames } }),
      this.models.patients.countDocuments({
        subjectCode: { $in: subjectCodes },
      }),
      this.models.reports.collection.listIndexes().toArray(),
    ]);
    if (
      users !== 0 ||
      patients !== 0 ||
      indexes.some(({ name }) => name === conflictIndexNameFor(namespace))
    ) {
      throw new B10FixtureError(
        'B10_FIXTURE_NAMESPACE_EXISTS',
        'The selected namespace already exists; use explicit replace',
        profile,
      );
    }
  }

  private async assertNoUnexpectedRoots(
    profile: B10Profile,
    namespace: string,
    subjectCodes: string[],
  ): Promise<void> {
    const patients = await this.models.patients
      .find({ subjectCode: { $in: subjectCodes } })
      .select({ subjectCode: 1, metadata: 1, tags: 1 })
      .lean()
      .exec();
    if (
      patients.some((patient) => {
        const fixture = patient.metadata?.b10Fixture as
          | { profile?: unknown; namespace?: unknown }
          | undefined;
        return (
          !patient.tags?.includes('b10') ||
          !patient.tags?.includes('synthetic') ||
          (fixture !== undefined &&
            (fixture.profile !== profile || fixture.namespace !== namespace))
        );
      })
    ) {
      throw new B10FixtureError(
        'B10_FIXTURE_OWNERSHIP_UNSAFE',
        'Cleanup refused because a matching root lacks exact B10 ownership metadata',
        profile,
      );
    }
  }

  private async countResiduals(
    profile: B10Profile,
    namespace: string,
    accountNames: string[],
    subjectCodes: string[],
    userIds: Types.ObjectId[],
    patientIds: Types.ObjectId[],
    visitIds: Types.ObjectId[],
  ): Promise<number> {
    const ownership = this.ownershipFilter(patientIds, visitIds);
    const indexes = await this.models.reports.collection
      .listIndexes()
      .toArray();
    const counts = await Promise.all([
      this.models.users.countDocuments({ accountName: { $in: accountNames } }),
      this.models.sessions.countDocuments({ userId: { $in: userIds } }),
      this.models.patients.countDocuments({
        subjectCode: { $in: subjectCodes },
      }),
      this.models.patients.countDocuments({
        'metadata.b10Fixture.profile': profile,
        'metadata.b10Fixture.namespace': namespace,
      }),
      this.models.visits.countDocuments({ _id: { $in: visitIds } }),
      ...(patientIds.length > 0 || visitIds.length > 0
        ? [
            this.models.reports.countDocuments(ownership),
            this.models.cognitiveDomainResults.countDocuments(ownership),
            this.models.scoreResults.countDocuments(ownership),
            this.models.mediaEvidence.countDocuments(ownership),
            this.models.itemResponses.countDocuments(ownership),
            this.models.scaleInstances.countDocuments(ownership),
          ]
        : []),
    ]);
    return (
      counts.reduce((sum, count) => sum + count, 0) +
      (indexes.some(({ name }) => name === conflictIndexNameFor(namespace))
        ? 1
        : 0)
    );
  }
}

export function createB10BrowserFixtureManager(
  app: INestApplicationContext,
): B10BrowserFixtureManager {
  const config = app.get(ConfigService);
  const connection = app.get<Connection>(getConnectionToken());
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
  const models: B10Models = {
    users: app.get(getModelToken(User.name)),
    sessions: app.get(getModelToken(Session.name)),
    patients: app.get(getModelToken(Patient.name)),
    visits: app.get(getModelToken(AssessmentVisit.name)),
    scaleInstances: app.get(getModelToken(ScaleInstance.name)),
    itemResponses: app.get(getModelToken(ItemResponse.name)),
    mediaEvidence: app.get(getModelToken(MediaEvidence.name)),
    scoreResults: app.get(getModelToken(ScoreResult.name)),
    cognitiveDomainResults: app.get(getModelToken(CognitiveDomainResult.name)),
    reports: app.get(getModelToken(ClinicalReport.name)),
    scaleDefinitions: app.get(getModelToken(ScaleDefinition.name)),
    scaleVersions: app.get(getModelToken(ScaleVersion.name)),
  };
  const workflows: B10FixtureWorkflows = {
    scaleCatalog: app.get(ScaleCatalogService),
    assessmentExecution: app.get(AssessmentExecutionService),
    itemDraft: app.get(ItemResponseDraftService),
    mediaWorkflow: app.get(MediaEvidenceWorkflowService),
    submission: app.get(ScaleInstanceSubmissionService),
    provisionalScoring: app.get(ProvisionalScoringWorkflowService),
    scoreReview: app.get(ScoreReviewWorkflowService),
    scoring: app.get(ScoringService),
    scales: app.get(ScalesService),
    cognitiveDomains: app.get(CognitiveDomainsService),
  };
  return new B10BrowserFixtureManager(
    connection.name,
    models,
    app.get(AuthService),
    workflows,
  );
}
