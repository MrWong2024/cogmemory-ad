import { type INestApplicationContext } from '@nestjs/common';
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
import { AssessmentScaleWorkflowService } from '../../../src/modules/assessments/services/assessment-scale-workflow.service';
import { ItemResponseDraftService } from '../../../src/modules/assessments/services/item-response-draft.service';
import { ScaleInstanceSubmissionService } from '../../../src/modules/assessments/services/scale-instance-submission.service';
import {
  A19_COGNITIVE_DOMAIN_ENGINE_VERSION,
  A19_DOMAIN_MAPPING_VERSION,
  mapConfirmedScoreToDomainInputs,
} from '../../../src/modules/cognitive-domains/lib/confirmed-score-domain-mapping';
import {
  CognitiveDomainResult,
  type CognitiveDomainResultDocument,
} from '../../../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
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
import {
  ScoreResult,
  type ScoreResultDocument,
} from '../../../src/modules/scoring/schemas/score-result.schema';
import { readConfirmationAudit } from '../../../src/modules/scoring/lib/manual-score-review';
import { ProvisionalScoringWorkflowService } from '../../../src/modules/scoring/services/provisional-scoring-workflow.service';
import { ScoreReviewWorkflowService } from '../../../src/modules/scoring/services/score-review-workflow.service';
import { ScoringService } from '../../../src/modules/scoring/services/scoring.service';
import {
  User,
  type UserDocument,
} from '../../../src/modules/users/schemas/user.schema';
import {
  B9_ROLES,
  B9FixtureError,
  accountNameFor,
  assertB9Contract,
  assertB9RuntimeEnvironment,
  assertB9SafeManifest,
  auditMatrixFor,
  conflictIndexNameFor,
  displayNameFor,
  mappingUnavailableVersionFor,
  requireB9FixturePassword,
  scenarioDefinitionsFor,
  scenarioSubjectCodeFor,
  scenarioVisitCodeFor,
  validateB9Namespace,
  type B9BusinessScenarioKey,
  type B9PostBrowserSideEffect,
  type B9Profile,
  type B9Role,
  type B9RoutePreparedContract,
  type B9SafeCleanupSummary,
  type B9SafeManifest,
  type B9SafeRoleManifest,
  type B9SafeScenarioManifest,
  type B9VerifyPhase,
  type B9VerifyStage,
} from './fixture-contract';
import {
  B9ScenarioBuilder,
  type B9FixtureModels,
  type B9FixtureWorkflows,
} from './scenario-builders';

type B9Models = B9FixtureModels & {
  users: Model<UserDocument>;
  sessions: Model<SessionDocument>;
  reports: Model<ClinicalReportDocument>;
};

type IdRow = { _id: Types.ObjectId };
type Root = {
  patient: PatientDocument;
  visit: AssessmentVisitDocument;
  instance: ScaleInstanceDocument;
};

type RouteBaseline = {
  routeKey: string;
  visitCode: string;
  scaleInstanceId: string;
  scoreResultId: string | null;
  domainResultIds: string[];
  sourceHash: string;
  scoreHash: string | null;
  scoreInvariantHash: string | null;
  domainHash: string;
  postBrowserSideEffect: B9PostBrowserSideEffect;
};

type FixtureMetadata = {
  version: 1;
  profile: B9Profile;
  namespace: string;
  scenarioKey: B9BusinessScenarioKey;
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

const BASELINE_DATE = new Date('2026-07-25T08:00:00.000Z');
const POST_CONFIRMATION_NOTE = 'B9 controlled E2E confirmation';
const PATH_TEMPLATE =
  '/patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId';
const B9_MAPPING_VERSION_PATTERN =
  /^b9-b9[cr]-[a-z0-9]+(?:-[a-z0-9]+)*-mapping-unavailable$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function expectedCounts(
  profile: B9Profile,
  phase: B9VerifyPhase,
): {
  patients: number;
  visits: number;
  instances: number;
  scoreResults: number;
  domainResults: number;
  auditIds: number;
} {
  const scenarios = scenarioDefinitionsFor(profile);
  const routes = scenarios.flatMap(({ routeContracts }) => routeContracts);
  const preparedDomainCount = routes.filter(
    ({ cognitiveDomainResult }) => cognitiveDomainResult.presence !== 'absent',
  ).length;
  const firstComputeCount =
    phase === 'post-browser'
      ? routes.filter(
          ({ postBrowserSideEffect }) =>
            postBrowserSideEffect === 'create-run-one-domain-result',
        ).length
      : 0;
  return {
    patients: scenarios.length,
    visits: routes.length,
    instances: routes.length,
    scoreResults: routes.filter(
      ({ scoreResult }) => scoreResult.presence === 'required',
    ).length,
    domainResults: preparedDomainCount + firstComputeCount,
    auditIds: auditMatrixFor(profile).length,
  };
}

export async function withB9VerifyStage<T>(
  profile: B9Profile,
  stage: B9VerifyStage,
  phase: B9VerifyPhase,
  action: () => Promise<T> | T,
  scenarioKey?: B9BusinessScenarioKey,
): Promise<T> {
  try {
    return await action();
  } catch (error: unknown) {
    if (error instanceof B9FixtureError) {
      throw error;
    }
    throw new B9FixtureError(
      'B9_FIXTURE_VERIFY_STAGE_FAILED',
      'B9 fixture verification failed in a named read-only stage',
      profile,
      scenarioKey,
      stage,
      phase,
    );
  }
}

export class B9BrowserFixtureManager {
  constructor(
    private readonly databaseName: string,
    private readonly models: B9Models,
    private readonly authService: AuthService,
    private readonly workflows: B9FixtureWorkflows,
  ) {}

  async prepare(
    profile: B9Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B9SafeManifest> {
    const namespace = validateB9Namespace(profile, rawNamespace);
    const password = requireB9FixturePassword(rawPassword);
    assertB9Contract();
    await this.assertNamespaceUnused(profile, namespace);
    try {
      const users = await this.createUsers(profile, namespace, password);
      const doctor = users.get('doctor');
      if (!doctor) {
        throw new B9FixtureError(
          'B9_FIXTURE_ACCOUNT_CREATION_FAILED',
          'The doctor fixture account was not created',
          profile,
        );
      }
      await new B9ScenarioBuilder(
        profile,
        namespace,
        this.models,
        this.workflows,
      ).buildAll(toActor(doctor));
      await this.recordBaselines(profile, namespace);
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
    profile: B9Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B9SafeManifest> {
    const namespace = validateB9Namespace(profile, rawNamespace);
    const password = requireB9FixturePassword(rawPassword);
    await this.cleanup(profile, namespace);
    return this.prepare(profile, namespace, password);
  }

  async verify(
    profile: B9Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
    phase: B9VerifyPhase,
  ): Promise<B9SafeManifest> {
    return this.verifyInternal(
      profile,
      validateB9Namespace(profile, rawNamespace),
      requireB9FixturePassword(rawPassword),
      phase,
    );
  }

  async cleanup(
    profile: B9Profile,
    rawNamespace: string,
  ): Promise<B9SafeCleanupSummary> {
    const namespace = validateB9Namespace(profile, rawNamespace);
    const accountNames = B9_ROLES.map((role) =>
      accountNameFor(profile, namespace, role),
    );
    const subjectCodes = this.subjectCodes(profile, namespace);
    await this.assertNoUnexpectedRoots(
      profile,
      namespace,
      accountNames,
      subjectCodes,
    );
    const [users, patients] = await Promise.all([
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
    const mappingVersion = mappingUnavailableVersionFor(namespace);
    const conflictIndexName = conflictIndexNameFor(namespace);
    const [mappingVersionCount, indexesBefore] = await Promise.all([
      this.models.scaleVersions.countDocuments({ version: mappingVersion }),
      this.models.cognitiveDomainResults.collection.listIndexes().toArray(),
    ]);
    await this.models.scaleVersions
      .deleteMany({ version: mappingVersion })
      .exec();
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
    if (residualCount !== 0) {
      throw new B9FixtureError(
        'B9_FIXTURE_CLEANUP_INCOMPLETE',
        'Fixture cleanup left namespace-owned records or test structures',
        profile,
      );
    }
    const matchedRootCount =
      users.length + patients.length + visits.length + mappingVersionCount;
    const matched =
      matchedRootCount > 0 ||
      indexesBefore.some(({ name }) => name === conflictIndexName);
    const result: B9SafeCleanupSummary = {
      namespace,
      databaseName: this.databaseName,
      profile,
      residualCount,
      matched,
      expectedSummary: `profile=${profile}; residualCount=0; matched=${matched}`,
    };
    assertB9SafeManifest(result);
    return result;
  }

  async simulatePostBrowserForE2e(
    profile: B9Profile,
    rawNamespace: string,
  ): Promise<void> {
    const namespace = validateB9Namespace(profile, rawNamespace);
    await this.createPostBrowserSessionEvidence(profile, namespace);
    if (profile === 'resilience-security') {
      return;
    }
    const confirmationRoot = await this.requireRoot(
      profile,
      namespace,
      'confirm_triggers_latest',
      'base',
    );
    await this.simulateScoreConfirmation(confirmationRoot, namespace);
    const computeRoot = await this.requireRoot(
      profile,
      namespace,
      'first_compute_success',
      'base',
    );
    await this.simulateFirstCompute(computeRoot, namespace);
  }

  private async verifyInternal(
    profile: B9Profile,
    namespace: string,
    password: string,
    phase: B9VerifyPhase,
  ): Promise<B9SafeManifest> {
    await withB9VerifyStage(profile, 'contract', phase, () =>
      assertB9Contract(),
    );
    const before = await withB9VerifyStage(
      profile,
      'initial_snapshot',
      phase,
      () => this.readOnlySnapshot(profile, namespace),
    );
    const roles = await withB9VerifyStage(
      profile,
      'users_and_password',
      phase,
      () => this.verifyUsers(profile, namespace, password),
    );
    await withB9VerifyStage(profile, 'root_matrix', phase, () =>
      this.verifyRootMatrix(profile, namespace, phase),
    );
    await withB9VerifyStage(profile, 'scenario_facts', phase, () =>
      this.verifyScenarioFacts(profile, namespace, phase),
    );
    await withB9VerifyStage(profile, 'post_browser_transitions', phase, () =>
      this.verifyPostBrowserEvidence(profile, namespace, phase),
    );
    await withB9VerifyStage(profile, 'profile_isolation', phase, () =>
      this.verifyProfileIsolation(profile, namespace),
    );
    await withB9VerifyStage(profile, 'global_seed', phase, () =>
      this.verifyBaselines(profile, namespace, phase),
    );
    const scenarios = await withB9VerifyStage(
      profile,
      'safe_manifest',
      phase,
      () => this.buildSafeScenarios(profile, namespace),
    );
    await withB9VerifyStage(profile, 'final_snapshot', phase, async () => {
      const after = await this.readOnlySnapshot(profile, namespace);
      if (after !== before) {
        throw new B9FixtureError(
          'B9_FIXTURE_VERIFY_MUTATED_DATA',
          'Verify must not create, repair, remove, or update fixture data',
          profile,
        );
      }
    });
    const counts = expectedCounts(profile, phase);
    const manifest: B9SafeManifest = {
      namespace,
      databaseName: this.databaseName,
      profile,
      phase,
      roles,
      scenarios,
      auditMatrix: auditMatrixFor(profile),
      expectedSummary:
        `profile=${profile}; phase=${phase}; roles=5; scenarioKeys=${scenarios.length}; ` +
        `auditIds=${counts.auditIds}; patients=${counts.patients}; visits=${counts.visits}; ` +
        `instances=${counts.instances}; scoreResults=${counts.scoreResults}; domainResults=${counts.domainResults}`,
    };
    await withB9VerifyStage(profile, 'safe_manifest', phase, () =>
      assertB9SafeManifest(manifest),
    );
    return manifest;
  }

  private async createUsers(
    profile: B9Profile,
    namespace: string,
    password: string,
  ): Promise<Map<B9Role, UserDocument>> {
    const result = new Map<B9Role, UserDocument>();
    for (const role of B9_ROLES) {
      const user = await this.models.users.create({
        accountName: accountNameFor(profile, namespace, role),
        displayName: displayNameFor(profile, role),
        staffCode: `${
          profile === 'core-workflow' ? 'B9CFX' : 'B9RFX'
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
    profile: B9Profile,
    namespace: string,
    password: string,
  ): Promise<B9SafeRoleManifest[]> {
    const result: B9SafeRoleManifest[] = [];
    for (const role of B9_ROLES) {
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
        throw new B9FixtureError(
          'B9_FIXTURE_ACCOUNT_INVALID',
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
    profile: B9Profile,
    namespace: string,
    phase: B9VerifyPhase,
  ): Promise<void> {
    const counts = expectedCounts(profile, phase);
    const subjectCodes = this.subjectCodes(profile, namespace);
    const patients = await this.models.patients
      .find({ subjectCode: { $in: subjectCodes } })
      .sort({ subjectCode: 1 })
      .exec();
    const patientIds = patients.map(({ _id }) => _id);
    const visits = await this.models.visits
      .find({ patientId: { $in: patientIds } })
      .sort({ visitCode: 1 })
      .exec();
    const visitIds = visits.map(({ _id }) => _id);
    const ownership = this.ownershipFilter(patientIds, visitIds);
    const [instances, scoreCount, domainCount, reportCount] = await Promise.all(
      [
        this.models.scaleInstances.find(ownership).sort({ _id: 1 }).exec(),
        this.models.scoreResults.countDocuments(ownership),
        this.models.cognitiveDomainResults.countDocuments(ownership),
        this.models.reports.countDocuments(ownership),
      ],
    );
    if (
      patients.length !== counts.patients ||
      visits.length !== counts.visits ||
      instances.length !== counts.instances ||
      scoreCount !== counts.scoreResults ||
      domainCount !== counts.domainResults ||
      reportCount !== 0 ||
      patients.some(
        (patient) =>
          !patient.tags.includes('synthetic') ||
          !patient.tags.includes('b9') ||
          !patient.tags.includes(profile) ||
          patient.birthDate !== null ||
          patient.externalRefs !== null,
      )
    ) {
      throw new B9FixtureError(
        'B9_FIXTURE_ROOT_MATRIX_INVALID',
        'The exact synthetic B9 patient, visit, instance, score, and domain matrix is invalid',
        profile,
      );
    }
    for (const instance of instances) {
      const [version, itemCount] = await Promise.all([
        this.models.scaleVersions
          .findById(instance.scaleVersionId)
          .select({ items: 1, version: 1 })
          .lean<{ items: unknown[]; version: string }>()
          .exec(),
        this.models.itemResponses.countDocuments({
          scaleInstanceId: instance._id,
        }),
      ]);
      if (
        !version ||
        version.version !== instance.scaleVersion ||
        itemCount !== version.items.length
      ) {
        throw new B9FixtureError(
          'B9_FIXTURE_ITEM_MATRIX_INVALID',
          'A B9 instance does not match its bound scale-version item set',
          profile,
        );
      }
    }
  }

  private async verifyScenarioFacts(
    profile: B9Profile,
    namespace: string,
    phase: B9VerifyPhase,
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
    const subjectCodes = this.subjectCodes(profile, namespace);
    const patientIds = await this.models.patients.distinct('_id', {
      subjectCode: { $in: subjectCodes },
    });
    const badRunCount = await this.models.cognitiveDomainResults.countDocuments(
      {
        patientId: { $in: patientIds },
        runNo: { $nin: [0, 1] },
      },
    );
    if (badRunCount !== 0) {
      throw new B9FixtureError(
        'B9_FIXTURE_UNEXPECTED_RUN_NUMBER',
        'B9 fixtures must not contain runNo=2 or any uncontracted rerun result',
        profile,
      );
    }
  }

  private async verifyRouteFacts(
    profile: B9Profile,
    namespace: string,
    scenarioKey: B9BusinessScenarioKey,
    root: Root,
    contract: B9RoutePreparedContract,
    phase: B9VerifyPhase,
  ): Promise<void> {
    const expectedVisitStatus =
      contract.scaleInstanceStatus === 'locked' ||
      contract.scaleInstanceStatus === 'voided'
        ? 'completed'
        : contract.visitStatus;
    if (
      root.visit.status !== expectedVisitStatus ||
      root.instance.status !== contract.scaleInstanceStatus
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
    const score = await this.models.scoreResults
      .findOne({ scaleInstanceId: root.instance._id, runNo: 1 })
      .exec();
    const expectedScoreStatus =
      phase === 'post-browser' &&
      contract.postBrowserSideEffect === 'score-confirmation-only'
        ? 'confirmed'
        : contract.scoreResult.status;
    if (contract.scoreResult.presence === 'absent') {
      if (score) {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
    } else if (
      !score ||
      score.status !== expectedScoreStatus ||
      score.patientId.toString() !== root.patient._id.toString() ||
      score.assessmentVisitId.toString() !== root.visit._id.toString() ||
      score.scaleInstanceId.toString() !== root.instance._id.toString() ||
      score.scaleDefinitionId.toString() !==
        root.instance.scaleDefinitionId.toString() ||
      score.scaleVersionId.toString() !==
        root.instance.scaleVersionId.toString() ||
      score.scaleVersion !== root.instance.scaleVersion
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
    if (score) {
      this.assertScoreFacts(profile, scenarioKey, score, contract, phase);
    }
    const domains = await this.models.cognitiveDomainResults
      .find({ scaleInstanceId: root.instance._id })
      .sort({ runNo: 1, _id: 1 })
      .exec();
    const expectsFirstCompute =
      phase === 'post-browser' &&
      contract.postBrowserSideEffect === 'create-run-one-domain-result';
    if (expectsFirstCompute) {
      if (domains.length !== 1 || !score) {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
      this.assertDomainFacts(
        profile,
        scenarioKey,
        domains[0],
        score,
        'complete-derived',
        'computed',
        1,
      );
    } else if (contract.cognitiveDomainResult.presence === 'absent') {
      if (domains.length !== 0) {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
    } else if (
      contract.cognitiveDomainResult.presence === 'conflict-resource-only'
    ) {
      if (
        domains.length !== 1 ||
        !score ||
        domains[0].runNo !== 0 ||
        domains[0].status !== 'draft' ||
        domains[0].metadata?.b9FixtureConflictResource === undefined
      ) {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
    } else {
      if (domains.length !== 1 || !score) {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
      this.assertDomainFacts(
        profile,
        scenarioKey,
        domains[0],
        score,
        contract.cognitiveDomainResult.structure,
        contract.cognitiveDomainResult.status,
        1,
      );
    }
    await this.verifyLocalPrerequisite(profile, scenarioKey, root, contract);
    if (scenarioKey === 'mapping_unavailable') {
      await this.verifyMappingUnavailableRoute(
        profile,
        namespace,
        scenarioKey,
        root,
        score,
      );
    }
    if (scenarioKey === 'compute_conflict') {
      await this.verifyConflictIndex(
        profile,
        namespace,
        root.patient.subjectCode,
      );
    }
    if (scenarioKey === 'privacy_public_surface') {
      const rawDomain =
        await this.models.cognitiveDomainResults.collection.findOne({
          scaleInstanceId: root.instance._id,
          runNo: 1,
        });
      const rawScore = await this.models.scoreResults.collection.findOne({
        scaleInstanceId: root.instance._id,
        runNo: 1,
      });
      const serialized = JSON.stringify({ rawDomain, rawScore });
      if (
        !serialized.includes('b9-private-mapping-sentinel') ||
        !serialized.includes('b9-private-score-sentinel') ||
        !serialized.includes('b9-private-rule-sentinel')
      ) {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
    }
  }

  private assertScoreFacts(
    profile: B9Profile,
    scenarioKey: B9BusinessScenarioKey,
    score: ScoreResultDocument,
    contract: B9RoutePreparedContract,
    phase: B9VerifyPhase,
  ): void {
    const expectedStatus =
      phase === 'post-browser' &&
      contract.postBrowserSideEffect === 'score-confirmation-only'
        ? 'confirmed'
        : contract.scoreResult.status;
    const shouldHaveConfirmation =
      expectedStatus === 'confirmed' ||
      expectedStatus === 'locked' ||
      expectedStatus === 'voided';
    const confirmation = readConfirmationAudit(score.metadata ?? null);
    const isFinal = score.status === 'confirmed' || score.status === 'locked';
    const reviewQueueCount = score.itemScores.filter(
      (item) => item.scoreStatus === 'needs_review',
    ).length;
    if (
      score.runNo !== 1 ||
      isFinal !==
        (phase === 'post-browser' &&
        contract.postBrowserSideEffect === 'score-confirmation-only'
          ? true
          : contract.scoreResult.isFinal) ||
      (shouldHaveConfirmation
        ? !(score.confirmedAt instanceof Date) || confirmation === null
        : score.confirmedAt !== null || confirmation !== null) ||
      (score.status === 'needs_review' && reviewQueueCount === 0) ||
      (score.status === 'computed' && reviewQueueCount !== 0) ||
      ((score.status === 'confirmed' || score.status === 'locked') &&
        (score.qualityStatus !== 'passed' ||
          score.review?.reviewStatus !== 'reviewed' ||
          score.totalScore?.unscoredItemCount !== 0 ||
          score.totalScore?.needsReviewItemCount !== 0 ||
          score.computation?.warningCount !== 0))
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
  }

  private assertDomainFacts(
    profile: B9Profile,
    scenarioKey: B9BusinessScenarioKey,
    domain: CognitiveDomainResultDocument,
    score: ScoreResultDocument,
    structure: B9RoutePreparedContract['cognitiveDomainResult']['structure'],
    status: B9RoutePreparedContract['cognitiveDomainResult']['status'],
    runNo: number,
  ): void {
    if (
      domain.runNo !== runNo ||
      domain.status !== status ||
      domain.scoreResultId.toString() !== score._id.toString() ||
      domain.patientId.toString() !== score.patientId.toString() ||
      domain.assessmentVisitId.toString() !==
        score.assessmentVisitId.toString() ||
      domain.scaleInstanceId.toString() !== score.scaleInstanceId.toString() ||
      domain.scaleDefinitionId.toString() !==
        score.scaleDefinitionId.toString() ||
      domain.scaleVersionId.toString() !== score.scaleVersionId.toString() ||
      domain.scaleVersion !== score.scaleVersion ||
      domain.mappingSource !== 'scale_config' ||
      domain.mappingMode !== 'item_domain_codes'
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
    if (structure === 'incomplete') {
      if (domain.status !== 'draft') {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
      return;
    }
    if (
      !domain.versionTrace ||
      domain.versionTrace.domainMappingVersion !== A19_DOMAIN_MAPPING_VERSION ||
      !domain.mappingSnapshot ||
      domain.mappingSnapshot.mappingVersion !== A19_DOMAIN_MAPPING_VERSION ||
      !domain.computation ||
      domain.review?.reviewStatus !== 'not_required' ||
      domain.qualityStatus !== 'unchecked' ||
      domain.isModified()
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
    if (structure === 'complete-derived') {
      if (
        domain.domainScores.length === 0 ||
        domain.itemContributions.length === 0 ||
        domain.computation.domainCount !== domain.domainScores.length ||
        domain.computation.contributionCount !== domain.itemContributions.length
      ) {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
      return;
    }
    const uniqueContributionKeys = new Set(
      domain.itemContributions.map(
        (item) =>
          `${item.itemResponseId?.toString() ?? 'null'}:${item.itemCode}:${
            item.domainCode
          }`,
      ),
    );
    const multiDomainItem = domain.itemContributions.find((item) =>
      domain.itemContributions.some(
        (candidate) =>
          item.itemResponseId !== null &&
          candidate.itemResponseId?.toString() ===
            item.itemResponseId?.toString() &&
          candidate.domainCode !== item.domainCode,
      ),
    );
    if (
      domain.domainScores.length < 4 ||
      !domain.domainScores.some((item) => item.scoreValue === null) ||
      !domain.domainScores.some(
        (item) =>
          typeof item.minScore === 'number' &&
          item.minScore > 0 &&
          typeof item.scorePercent === 'number',
      ) ||
      uniqueContributionKeys.size !== domain.itemContributions.length ||
      !multiDomainItem ||
      !domain.itemContributions.some(
        (item) => item.countsTowardDomain === false,
      ) ||
      !domain.itemContributions.some((item) => item.itemResponseId === null) ||
      domain.mappingSnapshot.domainCodes.length < 4 ||
      domain.computation.contributionCount !==
        domain.itemContributions.length ||
      domain.computation.domainCount !== domain.domainScores.length
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
  }

  private async verifyLocalPrerequisite(
    profile: B9Profile,
    scenarioKey: B9BusinessScenarioKey,
    root: Root,
    contract: B9RoutePreparedContract,
  ): Promise<void> {
    if (contract.localPrerequisite === 'none') {
      return;
    }
    const items = await this.models.itemResponses
      .find({ scaleInstanceId: root.instance._id })
      .exec();
    const score = await this.models.scoreResults
      .findOne({ scaleInstanceId: root.instance._id, runNo: 1 })
      .exec();
    const valid =
      contract.localPrerequisite === 'answer-dirty-capable'
        ? root.instance.status === 'draft' &&
          items.some((item) => item.lockedAt === null)
        : contract.localPrerequisite === 'media-dirty-capable'
          ? root.instance.status === 'draft' &&
            items.some(
              (item) =>
                item.lockedAt === null &&
                (item.itemConfigSnapshot?.supportsPhotoUpload === true ||
                  item.itemConfigSnapshot?.supportsHandwriting === true),
            )
          : contract.localPrerequisite === 'manual-score-dirty-capable'
            ? score?.status === 'needs_review'
            : score?.status === 'computed';
    if (!valid) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
  }

  private async verifyMappingUnavailableRoute(
    profile: B9Profile,
    namespace: string,
    scenarioKey: B9BusinessScenarioKey,
    root: Root,
    score: ScoreResultDocument | null,
  ): Promise<void> {
    const versionName = mappingUnavailableVersionFor(namespace);
    const version = await this.models.scaleVersions
      .findOne({ version: versionName })
      .exec();
    if (
      !score ||
      !version ||
      root.instance.scaleVersionId.toString() !== version._id.toString() ||
      root.instance.scaleVersion !== versionName ||
      score.scaleVersionId.toString() !== version._id.toString() ||
      score.scaleVersion !== versionName ||
      version.items.length === 0 ||
      version.items.some((item) => item.cognitiveDomainCodes.length !== 0) ||
      score.itemScores.some((item) => item.cognitiveDomainCodes.length !== 0)
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
  }

  private async verifyConflictIndex(
    profile: B9Profile,
    namespace: string,
    subjectCode: string,
  ): Promise<void> {
    const indexes = (await this.models.cognitiveDomainResults.collection
      .listIndexes()
      .toArray()) as IndexDescription[];
    const index = indexes.find(
      ({ name }) => name === conflictIndexNameFor(namespace),
    );
    if (
      profile !== 'resilience-security' ||
      index?.unique !== true ||
      index.key?.scaleInstanceId !== 1 ||
      index.partialFilterExpression?.subjectCode !== subjectCode
    ) {
      throw new B9FixtureError(
        'B9_FIXTURE_CONFLICT_INDEX_INVALID',
        'The namespace-owned deterministic conflict index is missing or unsafe',
        profile,
        'compute_conflict',
      );
    }
  }

  private async verifyPostBrowserEvidence(
    profile: B9Profile,
    namespace: string,
    phase: B9VerifyPhase,
  ): Promise<void> {
    const users = await this.models.users
      .find({
        accountName: {
          $in: B9_ROLES.map((role) => accountNameFor(profile, namespace, role)),
        },
      })
      .select({ _id: 1, userType: 1 })
      .lean<{ _id: Types.ObjectId; userType: string }[]>()
      .exec();
    const userIds = users.map(({ _id }) => _id);
    const sessions = await this.models.sessions
      .find({
        userId: { $in: userIds },
        status: 'active',
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .lean()
      .exec();
    if (phase === 'prepared') {
      if (sessions.length !== 0) {
        throw new B9FixtureError(
          'B9_FIXTURE_PREPARED_SESSION_UNEXPECTED',
          'Prepared fixtures must not pre-create Browser Sessions',
          profile,
        );
      }
      return;
    }
    const requiredRoles = new Set(
      auditMatrixFor(profile)
        .filter(({ auditId }) => auditId !== 'B9-44')
        .map(({ primaryRole }) => primaryRole),
    );
    const sessionUserIds = new Set(
      sessions.map(({ userId }) => userId.toString()),
    );
    const coveredRoles = new Set(
      users
        .filter(({ _id }) => sessionUserIds.has(_id.toString()))
        .map(({ userType }) => userType),
    );
    if ([...requiredRoles].some((role) => !coveredRoles.has(role))) {
      throw new B9FixtureError(
        'B9_FIXTURE_BROWSER_SESSION_EVIDENCE_MISSING',
        'Post-browser verify requires selected-profile Session evidence for every primary role',
        profile,
      );
    }
  }

  private async recordBaselines(
    profile: B9Profile,
    namespace: string,
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
        const [score, domains] = await Promise.all([
          this.models.scoreResults
            .findOne({ scaleInstanceId: root.instance._id, runNo: 1 })
            .exec(),
          this.models.cognitiveDomainResults
            .find({ scaleInstanceId: root.instance._id })
            .sort({ runNo: 1, _id: 1 })
            .exec(),
        ]);
        routeBaselines.push({
          routeKey: contract.key,
          visitCode: root.visit.visitCode,
          scaleInstanceId: root.instance._id.toString(),
          scoreResultId: score?._id.toString() ?? null,
          domainResultIds: domains.map(({ _id }) => _id.toString()),
          sourceHash: await this.sourceHash(root),
          scoreHash: score ? this.scoreHash(score) : null,
          scoreInvariantHash: score ? this.scoreInvariantHash(score) : null,
          domainHash: this.domainHash(domains),
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
          { $set: { metadata: { b9Fixture: metadata } } },
        )
        .exec();
    }
  }

  private async verifyBaselines(
    profile: B9Profile,
    namespace: string,
    phase: B9VerifyPhase,
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
      const fixture = patient?.metadata?.b9Fixture as
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
        throw new B9FixtureError(
          'B9_FIXTURE_BASELINE_INVALID',
          'Namespace ownership or global seed baseline is missing or changed',
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
        if (
          !baseline ||
          baseline.visitCode !== root.visit.visitCode ||
          baseline.scaleInstanceId !== root.instance._id.toString() ||
          baseline.postBrowserSideEffect !== contract.postBrowserSideEffect ||
          baseline.sourceHash !== (await this.sourceHash(root))
        ) {
          throw this.scenarioInvalid(profile, definition.scenarioKey);
        }
        const [score, domains] = await Promise.all([
          this.models.scoreResults
            .findOne({ scaleInstanceId: root.instance._id, runNo: 1 })
            .exec(),
          this.models.cognitiveDomainResults
            .find({ scaleInstanceId: root.instance._id })
            .sort({ runNo: 1, _id: 1 })
            .exec(),
        ]);
        this.assertBaselineTransition(
          profile,
          definition.scenarioKey,
          phase,
          baseline,
          score,
          domains,
        );
      }
    }
  }

  private assertBaselineTransition(
    profile: B9Profile,
    scenarioKey: B9BusinessScenarioKey,
    phase: B9VerifyPhase,
    baseline: RouteBaseline,
    score: ScoreResultDocument | null,
    domains: CognitiveDomainResultDocument[],
  ): void {
    if (phase === 'prepared') {
      if (
        baseline.scoreResultId !== (score?._id.toString() ?? null) ||
        baseline.scoreHash !== (score ? this.scoreHash(score) : null) ||
        baseline.domainHash !== this.domainHash(domains) ||
        baseline.domainResultIds.join(',') !==
          domains.map(({ _id }) => _id.toString()).join(',')
      ) {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
      return;
    }
    if (
      baseline.postBrowserSideEffect === 'none' ||
      baseline.postBrowserSideEffect === 'conflict-resource-unchanged'
    ) {
      if (
        baseline.scoreHash !== (score ? this.scoreHash(score) : null) ||
        baseline.domainHash !== this.domainHash(domains)
      ) {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
      return;
    }
    if (baseline.postBrowserSideEffect === 'score-confirmation-only') {
      if (
        !score ||
        baseline.scoreResultId !== score._id.toString() ||
        baseline.scoreInvariantHash !== this.scoreInvariantHash(score) ||
        score.status !== 'confirmed' ||
        !(score.confirmedAt instanceof Date) ||
        score.qualityStatus !== 'passed' ||
        score.review?.reviewStatus !== 'reviewed' ||
        readConfirmationAudit(score.metadata ?? null) === null ||
        baseline.domainHash !== this.domainHash(domains)
      ) {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
      return;
    }
    if (
      !score ||
      baseline.scoreHash !== this.scoreHash(score) ||
      baseline.domainResultIds.length !== 0 ||
      domains.length !== 1 ||
      domains[0].runNo !== 1 ||
      domains[0].status !== 'computed' ||
      domains[0].scoreResultId.toString() !== score._id.toString()
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
  }

  private async verifyProfileIsolation(
    profile: B9Profile,
    namespace: string,
  ): Promise<void> {
    const subjectCodes = this.subjectCodes(profile, namespace);
    const wrongPrefix = profile === 'core-workflow' ? /^B9R-/i : /^B9C-/i;
    const [wrongMetadata, crossProfileRoots, ownedPatients] = await Promise.all(
      [
        this.models.patients.countDocuments({
          subjectCode: { $in: subjectCodes },
          $or: [
            { 'metadata.b9Fixture.profile': { $ne: profile } },
            { 'metadata.b9Fixture.namespace': { $ne: namespace } },
          ],
        }),
        this.models.patients.countDocuments({
          subjectCode: { $in: subjectCodes, $regex: wrongPrefix },
        }),
        this.models.patients.countDocuments({
          subjectCode: { $in: subjectCodes },
        }),
      ],
    );
    if (
      wrongMetadata !== 0 ||
      crossProfileRoots !== 0 ||
      ownedPatients !== scenarioDefinitionsFor(profile).length
    ) {
      throw new B9FixtureError(
        'B9_FIXTURE_PROFILE_ISOLATION_INVALID',
        'The selected profile contains roots owned by another profile or namespace',
        profile,
      );
    }
  }

  private buildSafeScenarios(
    profile: B9Profile,
    namespace: string,
  ): B9SafeScenarioManifest[] {
    return scenarioDefinitionsFor(profile).map((definition) => ({
      scenarioKey: definition.scenarioKey,
      primaryOwnerAuditId: definition.primaryOwnerAuditId,
      auditIds: definition.auditIds,
      preparedState: definition.preparedState,
      routes: definition.routeContracts.map((contract) => ({
        key: contract.key,
        auditIds: contract.auditIds,
        navigationLabel: `B9 ${definition.scenarioKey} / ${contract.key} / ${namespace}`,
        pathTemplate: PATH_TEMPLATE,
        preparedState: contract.preparedState,
        expectedRequest: contract.expectedRequest,
        expectedHttpStatus: contract.expectedHttpStatus,
        postBrowserSideEffect: contract.postBrowserSideEffect,
        localPrerequisite: contract.localPrerequisite,
      })),
    }));
  }

  private async createPostBrowserSessionEvidence(
    profile: B9Profile,
    namespace: string,
  ): Promise<void> {
    const requiredRoles = new Set(
      auditMatrixFor(profile)
        .filter(({ auditId }) => auditId !== 'B9-44')
        .map(({ primaryRole }) => primaryRole),
    );
    for (const role of requiredRoles) {
      const user = await this.models.users
        .findOne({ accountName: accountNameFor(profile, namespace, role) })
        .exec();
      if (!user) {
        throw new B9FixtureError(
          'B9_FIXTURE_ACCOUNT_INVALID',
          'A controlled post-browser Session user is missing',
          profile,
        );
      }
      await this.models.sessions.create({
        userId: user._id,
        sessionTokenHash: stableHash({
          fixture: 'b9-e2e-post-browser',
          profile,
          namespace,
          role,
        }),
        status: 'active',
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        revokedAt: null,
        lastSeenAt: BASELINE_DATE,
        userAgent: 'B9 controlled E2E Session',
        ipAddress: '127.0.0.1',
        rolesSnapshot: [role],
        permissionsSnapshot: [],
        metadata: {
          b9Fixture: { profile, namespace, controlledE2e: true },
        },
      });
    }
  }

  private async simulateScoreConfirmation(
    root: Root,
    namespace: string,
  ): Promise<void> {
    const score = await this.models.scoreResults
      .findOne({ scaleInstanceId: root.instance._id, runNo: 1 })
      .exec();
    const doctor = await this.models.users
      .findOne({
        accountName: accountNameFor('core-workflow', namespace, 'doctor'),
      })
      .exec();
    if (!score || !doctor || score.status !== 'computed') {
      throw this.scenarioInvalid('core-workflow', 'confirm_triggers_latest');
    }
    const confirmedAt = new Date('2026-07-25T10:00:00.000Z');
    const metadata =
      score.metadata && typeof score.metadata === 'object'
        ? { ...score.metadata }
        : {};
    metadata.a18Confirmation = {
      confirmationId: `b9-${namespace}-controlled-confirmation`,
      confirmedAt,
      confirmedBy: doctor._id.toString(),
      confirmedByName: doctor.displayName,
      confirmedByRole: 'doctor',
      reviewNote: POST_CONFIRMATION_NOTE,
    };
    await this.models.scoreResults
      .updateOne(
        { _id: score._id, status: 'computed' },
        {
          $set: {
            status: 'confirmed',
            confirmedAt,
            qualityStatus: 'passed',
            'review.reviewStatus': 'reviewed',
            'review.reviewedAt': confirmedAt,
            metadata,
          },
        },
        { runValidators: true },
      )
      .exec();
  }

  private async simulateFirstCompute(
    root: Root,
    namespace: string,
  ): Promise<void> {
    const [source, version, score, doctor] = await Promise.all([
      this.workflows.scoring.findScoreResultByScaleInstanceAndRunNo(
        root.instance._id.toString(),
        1,
      ),
      this.workflows.scales.findVersionByScaleCodeAndVersion(
        root.instance.scaleCode,
        root.instance.scaleVersion,
      ),
      this.models.scoreResults
        .findOne({ scaleInstanceId: root.instance._id, runNo: 1 })
        .exec(),
      this.models.users
        .findOne({
          accountName: accountNameFor('core-workflow', namespace, 'doctor'),
        })
        .exec(),
    ]);
    if (!source || !version || !score || !doctor) {
      throw this.scenarioInvalid('core-workflow', 'first_compute_success');
    }
    const mapped = mapConfirmedScoreToDomainInputs(source, version);
    const summary = this.workflows.cognitiveDomains.summarizeDomainScores(
      mapped.items,
    );
    const computedAt = new Date('2026-07-25T10:05:00.000Z');
    await this.models.cognitiveDomainResults.create({
      patientId: root.patient._id,
      assessmentVisitId: root.visit._id,
      scaleInstanceId: root.instance._id,
      scoreResultId: score._id,
      subjectCode: root.patient.subjectCode,
      scaleDefinitionId: root.instance.scaleDefinitionId,
      scaleVersionId: root.instance.scaleVersionId,
      scaleCode: root.instance.scaleCode,
      scaleVersion: root.instance.scaleVersion,
      instanceCode: root.instance.instanceCode,
      domainResultCode: `B9-C-${namespace}-FIRST-COMPUTE`.toUpperCase(),
      runNo: 1,
      status: 'computed',
      mappingSource: 'scale_config',
      mappingMode: 'item_domain_codes',
      versionTrace: {
        scaleVersion: root.instance.scaleVersion,
        crfVersion: source.versionTrace?.crfVersion,
        scoringRuleVersion: source.versionTrace?.scoringRuleVersion,
        fieldEncodingVersion: source.versionTrace?.fieldEncodingVersion,
        domainMappingVersion: A19_DOMAIN_MAPPING_VERSION,
        sourceDocument: source.versionTrace?.sourceDocument,
      },
      domainScores: summary.domainScores,
      itemContributions: summary.itemContributions.map((contribution) => ({
        ...contribution,
        scoreResultId: score._id,
      })),
      mappingSnapshot: mapped.mappingSnapshot,
      computation: {
        computedAt,
        computedBy: doctor._id,
        ruleSetCode: 'item-domain-codes',
        ruleSetVersion: A19_DOMAIN_MAPPING_VERSION,
        engineVersion: A19_COGNITIVE_DOMAIN_ENGINE_VERSION,
        inputItemCount: summary.inputItemCount,
        contributionCount: summary.contributionCount,
        domainCount: summary.domainCount,
        includedContributionCount: summary.includedContributionCount,
        excludedContributionCount: summary.excludedContributionCount,
        warningCount: 0,
      },
      review: { reviewStatus: 'not_required' },
      qualityStatus: 'unchecked',
      confirmedAt: null,
      lockedAt: null,
      voidedAt: null,
      metadata: {
        b9FixtureControlledE2e: { profile: 'core-workflow', namespace },
      },
    });
  }

  private scoreHash(score: ScoreResultDocument): string {
    return stableHash(score.toObject());
  }

  private scoreInvariantHash(score: ScoreResultDocument): string {
    const raw: Record<string, unknown> = { ...score.toObject() };
    const reviewRecord =
      raw.review && typeof raw.review === 'object'
        ? { ...(raw.review as Record<string, unknown>) }
        : null;
    if (reviewRecord) {
      delete reviewRecord.reviewStatus;
      delete reviewRecord.reviewedAt;
    }
    const metadataRecord =
      raw.metadata && typeof raw.metadata === 'object'
        ? { ...(raw.metadata as Record<string, unknown>) }
        : null;
    if (metadataRecord) {
      delete metadataRecord.a18Confirmation;
    }
    return stableHash({
      ...raw,
      status: undefined,
      confirmedAt: undefined,
      qualityStatus: undefined,
      updatedAt: undefined,
      review: reviewRecord ?? raw.review,
      metadata: metadataRecord ?? raw.metadata,
    });
  }

  private domainHash(domains: CognitiveDomainResultDocument[]): string {
    return stableHash(domains.map((domain) => domain.toObject()));
  }

  private patientInvariantHash(patient: PatientDocument): string {
    const raw: Record<string, unknown> = { ...patient.toObject() };
    return stableHash({
      ...raw,
      metadata: undefined,
      updatedAt: undefined,
    });
  }

  private async sourceHash(root: Root): Promise<string> {
    const [visit, instance, items, media] = await Promise.all([
      this.models.visits.findById(root.visit._id).lean().exec(),
      this.models.scaleInstances.findById(root.instance._id).lean().exec(),
      this.models.itemResponses
        .find({ scaleInstanceId: root.instance._id })
        .sort({ _id: 1 })
        .lean()
        .exec(),
      this.models.mediaEvidence
        .find({ scaleInstanceId: root.instance._id })
        .sort({ _id: 1 })
        .lean()
        .exec(),
    ]);
    return stableHash({ visit, instance, items, media });
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
    const versions = allVersions.filter(
      ({ version }) => !B9_MAPPING_VERSION_PATTERN.test(version),
    );
    return stableHash(withoutLifecycleTimestamps({ definitions, versions }));
  }

  private async readOnlySnapshot(
    profile: B9Profile,
    namespace: string,
  ): Promise<string> {
    const accountNames = B9_ROLES.map((role) =>
      accountNameFor(profile, namespace, role),
    );
    const subjectCodes = this.subjectCodes(profile, namespace);
    const [users, patients, mappingVersions, indexes] = await Promise.all([
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
      this.models.scaleVersions
        .find({ version: mappingUnavailableVersionFor(namespace) })
        .sort({ _id: 1 })
        .lean()
        .exec(),
      this.models.cognitiveDomainResults.collection.listIndexes().toArray(),
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
      mappingVersions,
      conflictIndexes: indexes.filter(
        ({ name }) => name === conflictIndexNameFor(namespace),
      ),
    });
  }

  private async requireRoot(
    profile: B9Profile,
    namespace: string,
    scenarioKey: B9BusinessScenarioKey,
    routeKey: string,
  ): Promise<Root> {
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
    const instance = visit
      ? await this.models.scaleInstances
          .findOne({ assessmentVisitId: visit._id })
          .exec()
      : null;
    if (!patient || !visit || !instance) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
    return { patient, visit, instance };
  }

  private scenarioInvalid(
    profile: B9Profile,
    scenarioKey: B9BusinessScenarioKey,
  ): B9FixtureError {
    return new B9FixtureError(
      'B9_FIXTURE_SCENARIO_INVALID',
      'A B9 scenario does not match its selected profile and phase contract',
      profile,
      scenarioKey,
    );
  }

  private ownershipFilter(
    patientIds: Types.ObjectId[],
    visitIds: Types.ObjectId[],
  ) {
    return {
      $or: [
        ...(patientIds.length > 0 ? [{ patientId: { $in: patientIds } }] : []),
        ...(visitIds.length > 0
          ? [{ assessmentVisitId: { $in: visitIds } }]
          : []),
      ],
    };
  }

  private subjectCodes(profile: B9Profile, namespace: string): string[] {
    return scenarioDefinitionsFor(profile).map(({ ordinal }) =>
      scenarioSubjectCodeFor(profile, namespace, ordinal),
    );
  }

  private async assertNamespaceUnused(
    profile: B9Profile,
    namespace: string,
  ): Promise<void> {
    const [users, patients, versions, indexes] = await Promise.all([
      this.models.users.countDocuments({
        accountName: {
          $in: B9_ROLES.map((role) => accountNameFor(profile, namespace, role)),
        },
      }),
      this.models.patients.countDocuments({
        subjectCode: { $in: this.subjectCodes(profile, namespace) },
      }),
      this.models.scaleVersions.countDocuments({
        version: mappingUnavailableVersionFor(namespace),
      }),
      this.models.cognitiveDomainResults.collection.listIndexes().toArray(),
    ]);
    if (
      users !== 0 ||
      patients !== 0 ||
      versions !== 0 ||
      indexes.some(({ name }) => name === conflictIndexNameFor(namespace))
    ) {
      throw new B9FixtureError(
        'B9_FIXTURE_NAMESPACE_EXISTS',
        'The profile namespace exists or contains partial residue; use explicit replace',
        profile,
      );
    }
  }

  private async assertNoUnexpectedRoots(
    profile: B9Profile,
    namespace: string,
    accountNames: string[],
    subjectCodes: string[],
  ): Promise<void> {
    const accountPrefix = profile === 'core-workflow' ? 'b9cfx' : 'b9rfx';
    const subjectPrefix = profile === 'core-workflow' ? 'B9C' : 'B9R';
    const [users, patients, versions, indexes] = await Promise.all([
      this.models.users
        .find({
          accountName: new RegExp(
            `^${accountPrefix}-${escapeRegExp(namespace)}-`,
          ),
        })
        .select({ accountName: 1 })
        .lean<{ accountName: string }[]>()
        .exec(),
      this.models.patients
        .find({
          subjectCode: new RegExp(
            `^${subjectPrefix}-${escapeRegExp(namespace.toUpperCase())}-`,
          ),
        })
        .select({ subjectCode: 1 })
        .lean<{ subjectCode: string }[]>()
        .exec(),
      this.models.scaleVersions
        .find({ version: mappingUnavailableVersionFor(namespace) })
        .select({ version: 1, scaleCode: 1 })
        .lean<{ version: string; scaleCode: string }[]>()
        .exec(),
      this.models.cognitiveDomainResults.collection.listIndexes().toArray(),
    ]);
    const conflictIndex = indexes.find(
      ({ name }) => name === conflictIndexNameFor(namespace),
    ) as IndexDescription | undefined;
    if (
      users.some(({ accountName }) => !accountNames.includes(accountName)) ||
      patients.some(({ subjectCode }) => !subjectCodes.includes(subjectCode)) ||
      versions.some(
        ({ version, scaleCode }) =>
          version !== mappingUnavailableVersionFor(namespace) ||
          scaleCode !== 'mmse',
      ) ||
      (conflictIndex &&
        (conflictIndex.unique !== true ||
          conflictIndex.key?.scaleInstanceId !== 1))
    ) {
      throw new B9FixtureError(
        'B9_FIXTURE_NAMESPACE_OWNERSHIP_UNSAFE',
        'Profile namespace root ownership is ambiguous; cleanup was refused',
        profile,
      );
    }
  }

  private async dropConflictIndex(namespace: string): Promise<void> {
    const name = conflictIndexNameFor(namespace);
    const indexes = (await this.models.cognitiveDomainResults.collection
      .listIndexes()
      .toArray()) as IndexDescription[];
    if (indexes.some((index) => index.name === name)) {
      await this.models.cognitiveDomainResults.collection.dropIndex(name);
    }
  }

  private async countResiduals(
    profile: B9Profile,
    namespace: string,
    accountNames: string[],
    subjectCodes: string[],
    userIds: Types.ObjectId[],
    patientIds: Types.ObjectId[],
    visitIds: Types.ObjectId[],
  ): Promise<number> {
    const ownership = this.ownershipFilter(patientIds, visitIds);
    const indexes = await this.models.cognitiveDomainResults.collection
      .listIndexes()
      .toArray();
    const counts = await Promise.all([
      this.models.users.countDocuments({ accountName: { $in: accountNames } }),
      this.models.patients.countDocuments({
        subjectCode: { $in: subjectCodes },
      }),
      this.models.visits.countDocuments({ _id: { $in: visitIds } }),
      this.models.sessions.countDocuments({ userId: { $in: userIds } }),
      this.models.patients.countDocuments({
        'metadata.b9Fixture.profile': profile,
        'metadata.b9Fixture.namespace': namespace,
      }),
      this.models.scaleVersions.countDocuments({
        version: mappingUnavailableVersionFor(namespace),
      }),
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

export function createB9BrowserFixtureManager(
  app: INestApplicationContext,
): B9BrowserFixtureManager {
  const config = app.get(ConfigService);
  const connection = app.get<Connection>(getConnectionToken());
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
  const models: B9Models = {
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
  const workflows: B9FixtureWorkflows = {
    scaleCatalog: app.get(ScaleCatalogService),
    scaleWorkflow: app.get(AssessmentScaleWorkflowService),
    itemDraft: app.get(ItemResponseDraftService),
    mediaWorkflow: app.get(MediaEvidenceWorkflowService),
    submission: app.get(ScaleInstanceSubmissionService),
    provisionalScoring: app.get(ProvisionalScoringWorkflowService),
    scoreReview: app.get(ScoreReviewWorkflowService),
    scoring: app.get(ScoringService),
    scales: app.get(ScalesService),
    cognitiveDomains: app.get(CognitiveDomainsService),
  };
  return new B9BrowserFixtureManager(
    connection.name,
    models,
    app.get(AuthService),
    workflows,
  );
}
