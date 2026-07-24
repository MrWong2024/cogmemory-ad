import { HttpException, type INestApplicationContext } from '@nestjs/common';
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
  CognitiveDomainResult,
  type CognitiveDomainResultDocument,
} from '../../../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
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
import {
  ScaleDefinition,
  type ScaleDefinitionDocument,
} from '../../../src/modules/scales/schemas/scale-definition.schema';
import {
  ScaleVersion,
  type ScaleVersionDocument,
} from '../../../src/modules/scales/schemas/scale-version.schema';
import { ScaleCatalogService } from '../../../src/modules/scales/services/scale-catalog.service';
import {
  ScoreResult,
  type ScoreResultDocument,
} from '../../../src/modules/scoring/schemas/score-result.schema';
import { ProvisionalScoringWorkflowService } from '../../../src/modules/scoring/services/provisional-scoring-workflow.service';
import {
  User,
  type UserDocument,
} from '../../../src/modules/users/schemas/user.schema';
import {
  B7_BUSINESS_SCENARIOS,
  B7_ROLES,
  B7FixtureError,
  accountNameFor,
  assertB7Contract,
  assertB7RuntimeEnvironment,
  assertB7SafeManifest,
  conflictIndexNameFor,
  displayNameFor,
  requireB7FixturePassword,
  scenarioSubjectCodeFor,
  scenarioVisitCodeFor,
  validateB7Namespace,
  type B7BusinessScenarioKey,
  type B7Role,
  type B7SafeCleanupSummary,
  type B7SafeManifest,
  type B7SafeRoleManifest,
  type B7SafeRoute,
  type B7SafeScenarioManifest,
  type B7SafeTransitionSummary,
  type B7TransitionAction,
  type B7VerifyPhase,
  type B7VerifyStage,
} from './fixture-contract';
import {
  B7ScenarioBuilder,
  type B7FixtureModels,
  type B7FixtureWorkflows,
} from './scenario-builders';

type B7Models = B7FixtureModels & {
  users: Model<UserDocument>;
  sessions: Model<SessionDocument>;
  cognitiveDomainResults: Model<CognitiveDomainResultDocument>;
  reports: Model<ClinicalReportDocument>;
  scaleDefinitions: Model<ScaleDefinitionDocument>;
  scaleVersions: Model<ScaleVersionDocument>;
};

type IdRow = { _id: Types.ObjectId };
type TimestampRow = { _id: Types.ObjectId; updatedAt?: Date };
type IndexRow = { name?: string };
type Root = {
  patient: PatientDocument;
  visit: AssessmentVisitDocument;
  instance: ScaleInstanceDocument;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

export async function withB7VerifyStage<T>(
  stage: B7VerifyStage,
  phase: B7VerifyPhase,
  action: () => Promise<T> | T,
  scenarioKey?: B7BusinessScenarioKey,
): Promise<T> {
  try {
    return await action();
  } catch (error: unknown) {
    if (error instanceof B7FixtureError) {
      throw error;
    }
    throw new B7FixtureError(
      'B7_FIXTURE_VERIFY_STAGE_FAILED',
      'B7 fixture verification failed in a named read-only stage',
      scenarioKey,
      stage,
      phase,
    );
  }
}

export class B7BrowserFixtureManager {
  constructor(
    private readonly databaseName: string,
    private readonly models: B7Models,
    private readonly authService: AuthService,
    private readonly workflows: B7FixtureWorkflows,
  ) {}

  async prepare(
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B7SafeManifest> {
    const namespace = validateB7Namespace(rawNamespace);
    const password = requireB7FixturePassword(rawPassword);
    assertB7Contract();
    await this.assertNamespaceUnused(namespace);
    try {
      const users = await this.createUsers(namespace, password);
      const doctor = users.get('doctor');
      if (!doctor) {
        throw new B7FixtureError(
          'B7_FIXTURE_ACCOUNT_CREATION_FAILED',
          'The doctor fixture account was not created',
        );
      }
      await new B7ScenarioBuilder(
        namespace,
        this.models,
        this.workflows,
      ).buildAll(toActor(doctor));
      await this.recordBaselineHashes(namespace);
      return this.verifyInternal(namespace, password, 'prepared');
    } catch (error: unknown) {
      try {
        await this.cleanup(namespace);
      } catch {
        // The original safe error remains authoritative; cleanup is retryable.
      }
      throw error;
    }
  }

  async verify(
    rawNamespace: string,
    rawPassword: string | undefined,
    phase: B7VerifyPhase,
  ): Promise<B7SafeManifest> {
    return this.verifyInternal(
      validateB7Namespace(rawNamespace),
      requireB7FixturePassword(rawPassword),
      phase,
    );
  }

  async replace(
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B7SafeManifest> {
    const namespace = validateB7Namespace(rawNamespace);
    const password = requireB7FixturePassword(rawPassword);
    await this.cleanup(namespace);
    return this.prepare(namespace, password);
  }

  async transition(
    rawNamespace: string,
    rawScenarioKey: string,
    action: B7TransitionAction,
  ): Promise<B7SafeTransitionSummary> {
    const namespace = validateB7Namespace(rawNamespace);
    if (
      rawScenarioKey !== 'voided_transition' &&
      rawScenarioKey !== 'computation_conflict'
    ) {
      throw new B7FixtureError(
        'B7_FIXTURE_TRANSITION_INVALID',
        'Transition is supported only for the two fixed B7 transition scenarios',
      );
    }
    if (rawScenarioKey === 'voided_transition') {
      if (action === 'arm') {
        await this.armVoidedResult(namespace);
      } else {
        await this.restoreVoidedResult(namespace);
      }
    } else if (action === 'arm') {
      await this.armConflictIndex(namespace);
    } else {
      await this.restoreConflictIndex(namespace);
    }
    const result: B7SafeTransitionSummary = {
      namespace,
      databaseName: this.databaseName,
      scenarioKey: rawScenarioKey,
      action: action === 'arm' ? 'armed' : 'restored',
      expectedSummary:
        action === 'arm'
          ? 'controlled transition armed for one namespace-owned scenario'
          : 'controlled transition restored without namespace residue',
    };
    assertB7SafeManifest(result);
    return result;
  }

  async cleanup(rawNamespace: string): Promise<B7SafeCleanupSummary> {
    const namespace = validateB7Namespace(rawNamespace);
    await this.restoreConflictIndex(namespace);
    const accountNames = B7_ROLES.map((role) =>
      accountNameFor(namespace, role),
    );
    const subjectCodes = this.subjectCodes(namespace);
    await this.assertNoUnexpectedRoots(namespace, accountNames, subjectCodes);
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
    if (userIds.length) {
      await this.models.sessions
        .deleteMany({ userId: { $in: userIds } })
        .exec();
    }
    if (patientIds.length || visitIds.length) {
      const ownership = this.ownershipFilter(patientIds, visitIds);
      await this.models.reports.deleteMany(ownership).exec();
      await this.models.cognitiveDomainResults.deleteMany(ownership).exec();
      await this.models.scoreResults.deleteMany(ownership).exec();
      await this.models.mediaEvidence.deleteMany(ownership).exec();
      await this.models.itemResponses.deleteMany(ownership).exec();
      await this.models.scaleInstances.deleteMany(ownership).exec();
    }
    if (visitIds.length) {
      await this.models.visits.deleteMany({ _id: { $in: visitIds } }).exec();
    }
    if (patientIds.length) {
      await this.models.patients
        .deleteMany({ _id: { $in: patientIds } })
        .exec();
    }
    if (userIds.length) {
      await this.models.users.deleteMany({ _id: { $in: userIds } }).exec();
    }
    const residualCount = await this.countResiduals(
      namespace,
      accountNames,
      subjectCodes,
      userIds,
      patientIds,
      visitIds,
    );
    if (residualCount !== 0) {
      throw new B7FixtureError(
        'B7_FIXTURE_CLEANUP_INCOMPLETE',
        'Fixture cleanup left namespace-owned records or a controlled index behind',
      );
    }
    const result: B7SafeCleanupSummary = {
      namespace,
      databaseName: this.databaseName,
      expectedSummary: `residualCount=0; matched=${
        users.length + patients.length + visits.length > 0
      }`,
    };
    assertB7SafeManifest(result);
    return result;
  }

  async simulateBrowserResultsForE2e(rawNamespace: string): Promise<void> {
    const namespace = validateB7Namespace(rawNamespace);
    const first = await this.requireRoot(
      namespace,
      'first_compute_idempotency',
      'BASE',
    );
    await this.workflows.provisionalScoring.computeScoreResult(
      first.patient._id.toString(),
      first.visit._id.toString(),
      first.instance._id.toString(),
      { confirm: true },
    );
    await this.armVoidedResult(namespace);
    await this.armConflictIndex(namespace);
    const conflict = await this.requireRoot(
      namespace,
      'computation_conflict',
      'BASE',
    );
    let conflictObserved = false;
    try {
      await this.workflows.provisionalScoring.computeScoreResult(
        conflict.patient._id.toString(),
        conflict.visit._id.toString(),
        conflict.instance._id.toString(),
        { confirm: true },
      );
    } catch (error: unknown) {
      const response =
        error instanceof HttpException ? error.getResponse() : undefined;
      conflictObserved =
        typeof response === 'object' &&
        response !== null &&
        'code' in response &&
        response.code === 'SCORE_COMPUTATION_CONFLICT';
    } finally {
      await this.restoreConflictIndex(namespace);
    }
    if (!conflictObserved) {
      throw new B7FixtureError(
        'B7_FIXTURE_CONFLICT_NOT_OBSERVED',
        'The controlled conflict transition did not produce the contracted business code',
        'computation_conflict',
      );
    }
  }

  private async verifyInternal(
    namespace: string,
    password: string,
    phase: B7VerifyPhase,
  ): Promise<B7SafeManifest> {
    await withB7VerifyStage('contract', phase, () => assertB7Contract());
    const before = await withB7VerifyStage('initial_snapshot', phase, () =>
      this.readOnlySnapshot(namespace),
    );
    const roles = await withB7VerifyStage('users_and_password', phase, () =>
      this.verifyUsers(namespace, password),
    );
    await withB7VerifyStage('root_matrix', phase, () =>
      this.verifyRootMatrix(namespace),
    );
    await withB7VerifyStage('scenario_facts', phase, () =>
      this.verifyScenarioFacts(namespace, phase),
    );
    await withB7VerifyStage('transition_residue', phase, () =>
      this.assertNoConflictIndex(namespace),
    );
    await withB7VerifyStage('global_seed', phase, () =>
      this.verifyBaselineHashes(namespace),
    );
    const scenarios = await withB7VerifyStage('safe_manifest', phase, () =>
      this.buildSafeScenarios(namespace),
    );
    await withB7VerifyStage('final_snapshot', phase, async () => {
      const after = await this.readOnlySnapshot(namespace);
      if (JSON.stringify(after) !== JSON.stringify(before)) {
        throw new B7FixtureError(
          'B7_FIXTURE_VERIFY_MUTATED_DATA',
          'Verify must not create, repair, remove, or update fixture data',
        );
      }
    });
    const expectedScoreResults = phase === 'prepared' ? 11 : 13;
    const manifest: B7SafeManifest = {
      namespace,
      databaseName: this.databaseName,
      phase,
      roles,
      scenarios,
      expectedSummary:
        `phase=${phase}; roles=5; scenarioKeys=14; businessScenarios=13; ` +
        `auditIds=40; patients=13; visits=18; instances=18; scoreResults=${expectedScoreResults}`,
    };
    await withB7VerifyStage('safe_manifest', phase, () =>
      assertB7SafeManifest(manifest),
    );
    return manifest;
  }

  private async createUsers(
    namespace: string,
    password: string,
  ): Promise<Map<B7Role, UserDocument>> {
    const result = new Map<B7Role, UserDocument>();
    for (const role of B7_ROLES) {
      const user = await this.models.users.create({
        accountName: accountNameFor(namespace, role),
        displayName: displayNameFor(role),
        staffCode: `B7FX-${namespace}-${role}`,
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
    namespace: string,
    password: string,
  ): Promise<B7SafeRoleManifest[]> {
    const roles: B7SafeRoleManifest[] = [];
    for (const role of B7_ROLES) {
      const user = await this.models.users
        .findOne({ accountName: accountNameFor(namespace, role) })
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
        throw new B7FixtureError(
          'B7_FIXTURE_ACCOUNT_INVALID',
          `Fixture account for role ${role} is missing or invalid`,
        );
      }
      roles.push({
        role,
        loginIdentifier: user.accountName,
        displayName: user.displayName,
      });
    }
    return roles;
  }

  private async verifyRootMatrix(namespace: string): Promise<void> {
    const subjectCodes = this.subjectCodes(namespace);
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
    const instances = await this.models.scaleInstances
      .find({ assessmentVisitId: { $in: visitIds } })
      .sort({ instanceCode: 1 })
      .exec();
    if (
      patients.length !== 13 ||
      visits.length !== 18 ||
      instances.length !== 18 ||
      patients.some(
        (patient) =>
          !patient.tags.includes('synthetic') ||
          patient.birthDate !== null ||
          patient.externalRefs !== null,
      )
    ) {
      throw new B7FixtureError(
        'B7_FIXTURE_ROOT_MATRIX_INVALID',
        'The exact synthetic B7 patient, visit, and instance matrix is invalid',
      );
    }
    for (const instance of instances) {
      const [version, itemCount] = await Promise.all([
        this.models.scaleVersions
          .findById(instance.scaleVersionId)
          .select({ items: 1 })
          .lean<{ items: unknown[] }>()
          .exec(),
        this.models.itemResponses.countDocuments({
          scaleInstanceId: instance._id,
        }),
      ]);
      if (!version || itemCount !== version.items.length) {
        throw new B7FixtureError(
          'B7_FIXTURE_ITEM_MATRIX_INVALID',
          'A B7 instance does not match its materialized scale-version item set',
        );
      }
    }
  }

  private async verifyScenarioFacts(
    namespace: string,
    phase: B7VerifyPhase,
  ): Promise<void> {
    const stateDraft = await this.requireRoot(
      namespace,
      'query_state_matrix',
      'BASE',
    );
    const stateInProgress = await this.requireRoot(
      namespace,
      'query_state_matrix',
      'INPROGRESS',
    );
    this.assertStatus(stateDraft, 'draft', 'query_state_matrix');
    this.assertStatus(stateInProgress, 'in_progress', 'query_state_matrix');
    await this.expectScoreCount(stateDraft, 0);
    await this.expectScoreCount(stateInProgress, 0);

    const first = await this.requireRoot(
      namespace,
      'first_compute_idempotency',
      'BASE',
    );
    this.assertStatus(first, 'completed', 'first_compute_idempotency', false);
    await this.expectScoreCount(first, phase === 'prepared' ? 0 : 1);

    const partial = await this.requireRoot(
      namespace,
      'partial_review_privacy',
      'BASE',
    );
    const partialScore = await this.requireScore(partial);
    if (
      partialScore.status !== 'needs_review' ||
      partialScore.totalScore?.scorePercent !== null ||
      (partialScore.totalScore?.unscoredItemCount ?? 0) < 1 ||
      (partialScore.totalScore?.needsReviewItemCount ?? 0) < 1 ||
      !partialScore.computation?.notes?.includes(
        'UNKNOWN_GROUP_CONFIGURATION',
      ) ||
      partialScore.review?.reviewerName !== 'internal-reviewer-sentinel'
    ) {
      throw this.scenarioInvalid('partial_review_privacy');
    }

    const moca = await this.requireRoot(
      namespace,
      'moca_process_group',
      'BASE',
    );
    const mocaScore = await this.requireScore(moca);
    if (
      !mocaScore.itemScores.some(
        (item) =>
          item.countsTowardTotal === false && item.scoreStatus === 'not_scored',
      ) ||
      mocaScore.groupScores.length === 0
    ) {
      throw this.scenarioInvalid('moca_process_group');
    }

    const nullTarget = await this.requireRoot(
      namespace,
      'null_review_target',
      'BASE',
    );
    const nullScore = await this.requireScore(nullTarget);
    if (
      !nullScore.itemScores.some(
        (item) =>
          item.scoreStatus === 'needs_review' &&
          (item.itemResponseId === null || item.itemResponseId === undefined),
      )
    ) {
      throw this.scenarioInvalid('null_review_target');
    }

    for (const [suffix, status] of [
      ['BASE', 'completed'],
      ['LOCKED', 'locked'],
      ['VOIDED', 'voided'],
    ] as const) {
      const root = await this.requireRoot(
        namespace,
        'historical_read_only',
        suffix,
      );
      this.assertStatus(
        root,
        status,
        'historical_read_only',
        status !== 'completed',
      );
      const score = await this.requireScore(root);
      if (status !== 'completed' && score.status !== status) {
        throw this.scenarioInvalid('historical_read_only');
      }
    }

    for (const [suffix, status] of [
      ['BASE', 'locked'],
      ['VOIDED', 'voided'],
    ] as const) {
      const root = await this.requireRoot(
        namespace,
        'noncomputable_no_result',
        suffix,
      );
      this.assertStatus(root, status, 'noncomputable_no_result');
      await this.expectScoreCount(root, 0);
    }

    const incomplete = await this.requireRoot(
      namespace,
      'incomplete_result',
      'BASE',
    );
    if ((await this.requireScore(incomplete)).status !== 'draft') {
      throw this.scenarioInvalid('incomplete_result');
    }

    const voided = await this.requireRoot(
      namespace,
      'voided_transition',
      'BASE',
    );
    if (phase === 'prepared') {
      await this.expectScoreCount(voided, 0);
    } else if ((await this.requireScore(voided)).status !== 'voided') {
      throw this.scenarioInvalid('voided_transition');
    }

    const conflictTarget = await this.requireRoot(
      namespace,
      'computation_conflict',
      'BASE',
    );
    const conflictCompanion = await this.requireRoot(
      namespace,
      'computation_conflict',
      'COMPANION',
    );
    await this.expectScoreCount(conflictTarget, 0);
    await this.expectScoreCount(conflictCompanion, 1);

    for (const key of [
      'authz_matrix',
      'network_failure',
      'responsive_scope_boundary',
    ] as const) {
      await this.requireScore(await this.requireRoot(namespace, key, 'BASE'));
    }

    const subjectCodes = this.subjectCodes(namespace);
    const patientIds = await this.models.patients.distinct('_id', {
      subjectCode: { $in: subjectCodes },
    });
    const ownership = { patientId: { $in: patientIds } };
    const [scoreCount, domainCount, reportCount] = await Promise.all([
      this.models.scoreResults.countDocuments(ownership),
      this.models.cognitiveDomainResults.countDocuments(ownership),
      this.models.reports.countDocuments(ownership),
    ]);
    if (
      scoreCount !== (phase === 'prepared' ? 11 : 13) ||
      domainCount !== 0 ||
      reportCount !== 0
    ) {
      throw new B7FixtureError(
        'B7_FIXTURE_SIDE_EFFECT_COUNT_INVALID',
        'B7 score, domain, or report counts do not match the phase contract',
      );
    }
  }

  private assertStatus(
    root: Root,
    status: 'draft' | 'in_progress' | 'completed' | 'locked' | 'voided',
    scenarioKey: B7BusinessScenarioKey,
    requireVisitMatch = true,
  ): void {
    if (
      root.instance.status !== status ||
      (requireVisitMatch && root.visit.status !== status)
    ) {
      throw this.scenarioInvalid(scenarioKey);
    }
  }

  private scenarioInvalid(scenarioKey: B7BusinessScenarioKey): B7FixtureError {
    return new B7FixtureError(
      'B7_FIXTURE_SCENARIO_INVALID',
      'A fixed B7 scenario is missing, corrupted, or in the wrong phase state',
      scenarioKey,
    );
  }

  private async expectScoreCount(root: Root, expected: number): Promise<void> {
    if (
      (await this.models.scoreResults.countDocuments({
        scaleInstanceId: root.instance._id,
      })) !== expected
    ) {
      throw this.scenarioInvalid(rootScenarioKey(root.patient.subjectCode));
    }
  }

  private async requireScore(root: Root): Promise<ScoreResultDocument> {
    const score = await this.models.scoreResults
      .findOne({ scaleInstanceId: root.instance._id })
      .exec();
    if (!score) {
      throw this.scenarioInvalid(rootScenarioKey(root.patient.subjectCode));
    }
    return score;
  }

  private async buildSafeScenarios(
    namespace: string,
  ): Promise<B7SafeScenarioManifest[]> {
    const result: B7SafeScenarioManifest[] = [];
    for (const definition of B7_BUSINESS_SCENARIOS) {
      const routes: B7SafeRoute[] = [];
      for (const key of definition.routeKeys) {
        const suffix = this.routeSuffix(definition.scenarioKey, key);
        const root = await this.requireRoot(
          namespace,
          definition.scenarioKey,
          suffix,
        );
        routes.push({
          key,
          path: `/patients/${root.patient._id.toString()}/visits/${root.visit._id.toString()}/scale-instances/${root.instance._id.toString()}`,
        });
      }
      result.push({
        scenarioKey: definition.scenarioKey,
        primaryAuditIds: definition.primaryAuditIds,
        routes,
        expectedRequests: definition.expectedRequests,
        expectedSideEffect: definition.expectedSideEffect,
        faultMode: definition.faultMode,
        transitionMode: definition.transitionMode,
      });
    }
    return result;
  }

  private routeSuffix(scenarioKey: B7BusinessScenarioKey, key: string): string {
    if (scenarioKey === 'query_state_matrix') {
      return key === 'draft' ? 'BASE' : 'INPROGRESS';
    }
    if (scenarioKey === 'historical_read_only') {
      return key === 'completed' ? 'BASE' : key.toUpperCase();
    }
    if (scenarioKey === 'noncomputable_no_result') {
      return key === 'locked' ? 'BASE' : 'VOIDED';
    }
    return 'BASE';
  }

  private async requireRoot(
    namespace: string,
    scenarioKey: B7BusinessScenarioKey,
    suffix: string,
  ): Promise<Root> {
    const definition = B7_BUSINESS_SCENARIOS.find(
      (candidate) => candidate.scenarioKey === scenarioKey,
    );
    if (!definition) {
      throw this.scenarioInvalid(scenarioKey);
    }
    const patient = await this.models.patients
      .findOne({
        subjectCode: scenarioSubjectCodeFor(namespace, definition.ordinal),
      })
      .exec();
    const visit = patient
      ? await this.models.visits
          .findOne({
            patientId: patient._id,
            visitCode: scenarioVisitCodeFor(
              namespace,
              definition.ordinal,
              suffix,
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
      throw this.scenarioInvalid(scenarioKey);
    }
    return { patient, visit, instance };
  }

  private async armVoidedResult(namespace: string): Promise<void> {
    const root = await this.requireRoot(namespace, 'voided_transition', 'BASE');
    if (
      (await this.models.scoreResults.countDocuments({
        scaleInstanceId: root.instance._id,
      })) !== 0
    ) {
      throw new B7FixtureError(
        'B7_FIXTURE_TRANSITION_ALREADY_ARMED',
        'The voided-result transition already has a result',
        'voided_transition',
      );
    }
    await this.workflows.provisionalScoring.computeScoreResult(
      root.patient._id.toString(),
      root.visit._id.toString(),
      root.instance._id.toString(),
      { confirm: true },
    );
    await this.models.scoreResults
      .updateOne(
        { scaleInstanceId: root.instance._id },
        {
          $set: {
            status: 'voided',
            voidedAt: BASELINE_DATE,
            metadata: {
              b7FixtureTransition: {
                namespace,
                scenarioKey: 'voided_transition',
              },
            },
          },
        },
      )
      .exec();
  }

  private async restoreVoidedResult(namespace: string): Promise<void> {
    await this.models.scoreResults
      .deleteMany({
        'metadata.b7FixtureTransition.namespace': namespace,
        'metadata.b7FixtureTransition.scenarioKey': 'voided_transition',
      })
      .exec();
  }

  private async armConflictIndex(namespace: string): Promise<void> {
    await this.assertNoConflictIndex(namespace);
    const root = await this.requireRoot(
      namespace,
      'computation_conflict',
      'BASE',
    );
    const companion = await this.requireRoot(
      namespace,
      'computation_conflict',
      'COMPANION',
    );
    await this.expectScoreCount(root, 0);
    const companionScore = await this.requireScore(companion);
    await this.models.scoreResults.collection.createIndex(
      { status: 1 },
      {
        name: conflictIndexNameFor(namespace),
        unique: true,
        partialFilterExpression: {
          subjectCode: root.patient.subjectCode,
          status: companionScore.status,
        },
      },
    );
  }

  private async restoreConflictIndex(namespace: string): Promise<void> {
    const name = conflictIndexNameFor(namespace);
    const indexes = (await this.models.scoreResults.collection
      .listIndexes()
      .toArray()) as IndexRow[];
    if (indexes.some((index) => index.name === name)) {
      await this.models.scoreResults.collection.dropIndex(name);
    }
  }

  private async assertNoConflictIndex(namespace: string): Promise<void> {
    const name = conflictIndexNameFor(namespace);
    const indexes = (await this.models.scoreResults.collection
      .listIndexes()
      .toArray()) as IndexRow[];
    if (indexes.some((index) => index.name === name)) {
      throw new B7FixtureError(
        'B7_FIXTURE_TRANSITION_REMAINS_ARMED',
        'The namespace-scoped conflict index must be restored before verification',
        'computation_conflict',
      );
    }
  }

  private async recordBaselineHashes(namespace: string): Promise<void> {
    const seedHash = await this.globalSeedHash();
    for (const definition of B7_BUSINESS_SCENARIOS) {
      const patient = await this.models.patients
        .findOne({
          subjectCode: scenarioSubjectCodeFor(namespace, definition.ordinal),
        })
        .select({ _id: 1 })
        .exec();
      if (!patient) {
        throw this.scenarioInvalid(definition.scenarioKey);
      }
      const sourceHash = await this.sourceHash(patient._id);
      await this.models.patients
        .updateOne(
          { _id: patient._id },
          {
            $set: {
              metadata: {
                b7Fixture: {
                  namespace,
                  scenarioKey: definition.scenarioKey,
                  sourceHash,
                  seedHash,
                },
              },
            },
          },
        )
        .exec();
    }
  }

  private async verifyBaselineHashes(namespace: string): Promise<void> {
    const seedHash = await this.globalSeedHash();
    for (const definition of B7_BUSINESS_SCENARIOS) {
      const patient = await this.models.patients
        .findOne({
          subjectCode: scenarioSubjectCodeFor(namespace, definition.ordinal),
        })
        .exec();
      const fixture = patient?.metadata?.b7Fixture as
        | {
            namespace?: unknown;
            scenarioKey?: unknown;
            sourceHash?: unknown;
            seedHash?: unknown;
          }
        | undefined;
      if (
        !patient ||
        fixture?.namespace !== namespace ||
        fixture.scenarioKey !== definition.scenarioKey
      ) {
        throw new B7FixtureError(
          'B7_FIXTURE_BASELINE_METADATA_INVALID',
          'Namespace baseline ownership metadata is missing or invalid',
          definition.scenarioKey,
        );
      }
      if (fixture.seedHash !== seedHash) {
        throw new B7FixtureError(
          'B7_FIXTURE_SEED_HASH_INVALID',
          'The global MMSE/MoCA seed changed after B7 preparation',
          definition.scenarioKey,
        );
      }
      if (fixture.sourceHash !== (await this.sourceHash(patient._id))) {
        throw new B7FixtureError(
          'B7_FIXTURE_SOURCE_HASH_INVALID',
          'A namespace-owned source fact changed outside the B7 side-effect contract',
          definition.scenarioKey,
        );
      }
    }
  }

  private async sourceHash(patientId: Types.ObjectId): Promise<string> {
    const visits = await this.models.visits
      .find({ patientId })
      .sort({ _id: 1 })
      .lean()
      .exec();
    const visitIds = visits.map(({ _id }) => _id);
    const [instances, items, media] = await Promise.all([
      this.models.scaleInstances
        .find({ patientId })
        .sort({ _id: 1 })
        .lean()
        .exec(),
      this.models.itemResponses
        .find({ patientId })
        .sort({ _id: 1 })
        .lean()
        .exec(),
      this.models.mediaEvidence
        .find({
          $or: [{ patientId }, { assessmentVisitId: { $in: visitIds } }],
        })
        .sort({ _id: 1 })
        .lean()
        .exec(),
    ]);
    return stableHash({ visits, instances, items, media });
  }

  private async globalSeedHash(): Promise<string> {
    const [definitions, versions] = await Promise.all([
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
    return stableHash(withoutLifecycleTimestamps({ definitions, versions }));
  }

  private async readOnlySnapshot(
    namespace: string,
  ): Promise<Record<string, unknown>> {
    const accountNames = B7_ROLES.map((role) =>
      accountNameFor(namespace, role),
    );
    const subjectCodes = this.subjectCodes(namespace);
    const [users, patients, definitions, versions] = await Promise.all([
      this.timestampRows(this.models.users, {
        accountName: { $in: accountNames },
      }),
      this.timestampRows(this.models.patients, {
        subjectCode: { $in: subjectCodes },
      }),
      this.timestampRows(this.models.scaleDefinitions, {
        code: { $in: ['mmse', 'moca'] },
      }),
      this.timestampRows(this.models.scaleVersions, {
        scaleCode: { $in: ['mmse', 'moca'] },
      }),
    ]);
    const patientIds = patients.map(({ _id }) => _id);
    const visits = await this.timestampRows(this.models.visits, {
      patientId: { $in: patientIds },
    });
    const visitIds = visits.map(({ _id }) => _id);
    const ownership = this.ownershipFilter(patientIds, visitIds);
    const [
      instances,
      items,
      media,
      scores,
      domains,
      reports,
      sessions,
      indexes,
    ] = await Promise.all([
      this.timestampRows(this.models.scaleInstances, ownership),
      this.timestampRows(this.models.itemResponses, ownership),
      this.timestampRows(this.models.mediaEvidence, ownership),
      this.timestampRows(this.models.scoreResults, ownership),
      this.timestampRows(this.models.cognitiveDomainResults, ownership),
      this.timestampRows(this.models.reports, ownership),
      this.models.sessions.countDocuments({
        userId: { $in: users.map(({ _id }) => _id) },
      }),
      this.models.scoreResults.collection.listIndexes().toArray(),
    ]);
    const normalize = (rows: TimestampRow[]) =>
      rows.map(({ _id, updatedAt }) => ({
        key: _id.toString(),
        updatedAt: updatedAt?.toISOString() ?? null,
      }));
    return {
      users: normalize(users),
      patients: normalize(patients),
      visits: normalize(visits),
      instances: normalize(instances),
      items: normalize(items),
      media: normalize(media),
      scores: normalize(scores),
      domains: normalize(domains),
      reports: normalize(reports),
      definitions: normalize(definitions),
      versions: normalize(versions),
      sessions,
      indexes: (indexes as IndexRow[]).map(({ name }) => name ?? '').sort(),
    };
  }

  private timestampRows<T>(
    model: Model<T>,
    filter: Record<string, unknown>,
  ): Promise<TimestampRow[]> {
    return model
      .find(filter)
      .select({ _id: 1, updatedAt: 1 })
      .sort({ _id: 1 })
      .lean<TimestampRow[]>()
      .exec();
  }

  private ownershipFilter(
    patientIds: Types.ObjectId[],
    visitIds: Types.ObjectId[],
  ) {
    return {
      $or: [
        ...(patientIds.length ? [{ patientId: { $in: patientIds } }] : []),
        ...(visitIds.length ? [{ assessmentVisitId: { $in: visitIds } }] : []),
      ],
    };
  }

  private subjectCodes(namespace: string): string[] {
    return B7_BUSINESS_SCENARIOS.map(({ ordinal }) =>
      scenarioSubjectCodeFor(namespace, ordinal),
    );
  }

  private async assertNamespaceUnused(namespace: string): Promise<void> {
    const [users, patients, indexCount] = await Promise.all([
      this.models.users.countDocuments({
        accountName: {
          $in: B7_ROLES.map((role) => accountNameFor(namespace, role)),
        },
      }),
      this.models.patients.countDocuments({
        subjectCode: { $in: this.subjectCodes(namespace) },
      }),
      this.countConflictIndex(namespace),
    ]);
    if (users !== 0 || patients !== 0 || indexCount !== 0) {
      throw new B7FixtureError(
        'B7_FIXTURE_NAMESPACE_EXISTS',
        'The namespace exists or contains partial residue; use explicit replace',
      );
    }
  }

  private async assertNoUnexpectedRoots(
    namespace: string,
    accountNames: string[],
    subjectCodes: string[],
  ): Promise<void> {
    const [users, patients] = await Promise.all([
      this.models.users
        .find({
          accountName: new RegExp(`^b7fx-${escapeRegExp(namespace)}-`),
        })
        .select({ accountName: 1 })
        .lean<{ accountName: string }[]>()
        .exec(),
      this.models.patients
        .find({
          subjectCode: new RegExp(
            `^B7-${escapeRegExp(namespace.toUpperCase())}-`,
          ),
        })
        .select({ subjectCode: 1 })
        .lean<{ subjectCode: string }[]>()
        .exec(),
    ]);
    if (
      users.some(({ accountName }) => !accountNames.includes(accountName)) ||
      patients.some(({ subjectCode }) => !subjectCodes.includes(subjectCode))
    ) {
      throw new B7FixtureError(
        'B7_FIXTURE_NAMESPACE_OWNERSHIP_UNSAFE',
        'Namespace root ownership is ambiguous; cleanup was refused',
      );
    }
  }

  private async countConflictIndex(namespace: string): Promise<number> {
    const name = conflictIndexNameFor(namespace);
    const indexes = (await this.models.scoreResults.collection
      .listIndexes()
      .toArray()) as IndexRow[];
    return indexes.some((index) => index.name === name) ? 1 : 0;
  }

  private async countResiduals(
    namespace: string,
    accountNames: string[],
    subjectCodes: string[],
    userIds: Types.ObjectId[],
    patientIds: Types.ObjectId[],
    visitIds: Types.ObjectId[],
  ): Promise<number> {
    const ownership = this.ownershipFilter(patientIds, visitIds);
    const counts = await Promise.all([
      this.models.users.countDocuments({ accountName: { $in: accountNames } }),
      this.models.patients.countDocuments({
        subjectCode: { $in: subjectCodes },
      }),
      this.models.visits.countDocuments({ _id: { $in: visitIds } }),
      this.models.sessions.countDocuments({ userId: { $in: userIds } }),
      this.countConflictIndex(namespace),
      ...(patientIds.length || visitIds.length
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
    return counts.reduce((sum, count) => sum + count, 0);
  }
}

const BASELINE_DATE = new Date('2026-07-22T08:00:00.000Z');

function rootScenarioKey(subjectCode: string): B7BusinessScenarioKey {
  const suffix = Number(subjectCode.slice(-2));
  const definition = B7_BUSINESS_SCENARIOS.find(
    ({ ordinal }) => ordinal === suffix,
  );
  if (!definition) {
    throw new B7FixtureError(
      'B7_FIXTURE_SCENARIO_INVALID',
      'A B7 subject code does not map to a fixed scenario',
    );
  }
  return definition.scenarioKey;
}

export function createB7BrowserFixtureManager(
  app: INestApplicationContext,
): B7BrowserFixtureManager {
  const config = app.get(ConfigService);
  const connection = app.get<Connection>(getConnectionToken());
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
  const models: B7Models = {
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
  const workflows: B7FixtureWorkflows = {
    scaleCatalog: app.get(ScaleCatalogService),
    scaleWorkflow: app.get(AssessmentScaleWorkflowService),
    itemDraft: app.get(ItemResponseDraftService),
    mediaWorkflow: app.get(MediaEvidenceWorkflowService),
    submission: app.get(ScaleInstanceSubmissionService),
    provisionalScoring: app.get(ProvisionalScoringWorkflowService),
  };
  return new B7BrowserFixtureManager(
    connection.name,
    models,
    app.get(AuthService),
    workflows,
  );
}
