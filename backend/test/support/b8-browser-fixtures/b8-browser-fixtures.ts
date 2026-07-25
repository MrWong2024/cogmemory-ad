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
import { ScaleDefinition } from '../../../src/modules/scales/schemas/scale-definition.schema';
import { ScaleVersion } from '../../../src/modules/scales/schemas/scale-version.schema';
import { ScaleCatalogService } from '../../../src/modules/scales/services/scale-catalog.service';
import {
  ScoreResult,
  type ScoreResultDocument,
  type ScoreResultStatus,
} from '../../../src/modules/scoring/schemas/score-result.schema';
import {
  readConfirmationAudit,
  readManualReviewEvents,
} from '../../../src/modules/scoring/lib/manual-score-review';
import { ProvisionalScoringWorkflowService } from '../../../src/modules/scoring/services/provisional-scoring-workflow.service';
import { ScoreReviewWorkflowService } from '../../../src/modules/scoring/services/score-review-workflow.service';
import {
  User,
  type UserDocument,
} from '../../../src/modules/users/schemas/user.schema';
import {
  B8_ROLES,
  B8FixtureError,
  accountNameFor,
  assertB8Contract,
  assertB8RuntimeEnvironment,
  assertB8SafeManifest,
  auditMatrixFor,
  displayNameFor,
  requireB8FixturePassword,
  scenarioDefinitionsFor,
  scenarioSubjectCodeFor,
  scenarioVisitCodeFor,
  validateB8Namespace,
  type B8BusinessScenarioKey,
  type B8Profile,
  type B8Role,
  type B8RoutePreparedContract,
  type B8SafeCleanupSummary,
  type B8SafeManifest,
  type B8SafeRoleManifest,
  type B8SafeRoute,
  type B8SafeScenarioManifest,
  type B8VerifyPhase,
  type B8VerifyStage,
} from './fixture-contract';
import {
  B8ScenarioBuilder,
  type B8FixtureModels,
  type B8FixtureWorkflows,
} from './scenario-builders';

type B8Models = B8FixtureModels & {
  users: Model<UserDocument>;
  sessions: Model<SessionDocument>;
  cognitiveDomainResults: Model<CognitiveDomainResultDocument>;
  reports: Model<ClinicalReportDocument>;
};

type IdRow = { _id: Types.ObjectId };
type Root = {
  patient: PatientDocument;
  visit: AssessmentVisitDocument;
  instance: ScaleInstanceDocument;
};

type ScoreBaseline = {
  routeKey: string;
  scoreResultId: string;
  updatedAt: string;
  status: ScoreResultStatus;
  reviewQueueCount: number;
  manualEventCount: number;
  hasConfirmation: boolean;
  scoreHash: string;
};

type FixtureMetadata = {
  version: 1;
  profile: B8Profile;
  namespace: string;
  scenarioKey: B8BusinessScenarioKey;
  sourceHash: string;
  seedHash: string;
  scoreBaselines: ScoreBaseline[];
};

const BASELINE_DATE = new Date('2026-07-23T08:00:00.000Z');
const E2E_REVIEW_NOTE = 'B8 controlled E2E manual review';
const E2E_CONFIRMATION_NOTE = 'B8 controlled E2E confirmation';

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

function expectedCounts(profile: B8Profile): {
  patients: number;
  visits: number;
  instances: number;
  scoreResults: number;
  auditIds: number;
} {
  return profile === 'core-workflow'
    ? {
        patients: 9,
        visits: 14,
        instances: 14,
        scoreResults: 14,
        auditIds: 39,
      }
    : {
        patients: 9,
        visits: 14,
        instances: 14,
        scoreResults: 13,
        auditIds: 21,
      };
}

function responseCode(error: unknown): string | undefined {
  if (!(error instanceof HttpException)) {
    return undefined;
  }
  const response = error.getResponse();
  return typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    typeof response.code === 'string'
    ? response.code
    : undefined;
}

export async function withB8VerifyStage<T>(
  profile: B8Profile,
  stage: B8VerifyStage,
  phase: B8VerifyPhase,
  action: () => Promise<T> | T,
  scenarioKey?: B8BusinessScenarioKey,
): Promise<T> {
  try {
    return await action();
  } catch (error: unknown) {
    if (error instanceof B8FixtureError) {
      throw error;
    }
    throw new B8FixtureError(
      'B8_FIXTURE_VERIFY_STAGE_FAILED',
      'B8 fixture verification failed in a named read-only stage',
      profile,
      scenarioKey,
      stage,
      phase,
    );
  }
}

export class B8BrowserFixtureManager {
  constructor(
    private readonly databaseName: string,
    private readonly models: B8Models,
    private readonly authService: AuthService,
    private readonly workflows: B8FixtureWorkflows,
  ) {}

  async prepare(
    profile: B8Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B8SafeManifest> {
    const namespace = validateB8Namespace(profile, rawNamespace);
    const password = requireB8FixturePassword(rawPassword);
    assertB8Contract();
    await this.assertNamespaceUnused(profile, namespace);
    try {
      const users = await this.createUsers(profile, namespace, password);
      const doctor = users.get('doctor');
      if (!doctor) {
        throw new B8FixtureError(
          'B8_FIXTURE_ACCOUNT_CREATION_FAILED',
          'The doctor fixture account was not created',
          profile,
        );
      }
      await new B8ScenarioBuilder(
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
    profile: B8Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B8SafeManifest> {
    const namespace = validateB8Namespace(profile, rawNamespace);
    const password = requireB8FixturePassword(rawPassword);
    await this.cleanup(profile, namespace);
    return this.prepare(profile, namespace, password);
  }

  async verify(
    profile: B8Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
    phase: B8VerifyPhase,
  ): Promise<B8SafeManifest> {
    return this.verifyInternal(
      profile,
      validateB8Namespace(profile, rawNamespace),
      requireB8FixturePassword(rawPassword),
      phase,
    );
  }

  async cleanup(
    profile: B8Profile,
    rawNamespace: string,
  ): Promise<B8SafeCleanupSummary> {
    const namespace = validateB8Namespace(profile, rawNamespace);
    const accountNames = B8_ROLES.map((role) =>
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
      profile,
      namespace,
      accountNames,
      subjectCodes,
      userIds,
      patientIds,
      visitIds,
    );
    if (residualCount !== 0) {
      throw new B8FixtureError(
        'B8_FIXTURE_CLEANUP_INCOMPLETE',
        'Fixture cleanup left namespace-owned records',
        profile,
      );
    }
    const matched = users.length + patients.length + visits.length > 0;
    const result: B8SafeCleanupSummary = {
      namespace,
      databaseName: this.databaseName,
      profile,
      residualCount,
      matched,
      expectedSummary: `profile=${profile}; residualCount=0; matched=${matched}`,
    };
    assertB8SafeManifest(result);
    return result;
  }

  async simulatePostBrowserForE2e(
    profile: B8Profile,
    rawNamespace: string,
  ): Promise<void> {
    const namespace = validateB8Namespace(profile, rawNamespace);
    const actor = await this.requireActor(profile, namespace, 'doctor');
    if (profile === 'core-workflow') {
      for (const scenarioKey of [
        'manual_input_validation',
        'manual_submit_success',
        'manual_revision',
        'final_manual_to_computed',
      ] as const) {
        const root = await this.requireRoot(
          profile,
          namespace,
          scenarioKey,
          'BASE',
        );
        await this.performManualReview(root, actor);
      }
      const confirmation = await this.requireRoot(
        profile,
        namespace,
        'confirmation_success',
        'BASE',
      );
      await this.performConfirmation(confirmation, actor);
      const idempotent = await this.requireRoot(
        profile,
        namespace,
        'confirmed_idempotent_readonly',
        'BASE',
      );
      const repeated = await this.performConfirmation(idempotent, actor);
      if (!repeated) {
        throw new B8FixtureError(
          'B8_FIXTURE_IDEMPOTENCY_NOT_OBSERVED',
          'The controlled E2E confirmation did not return alreadyConfirmed=true',
          profile,
          'confirmed_idempotent_readonly',
        );
      }
      return;
    }

    const conflict = await this.requireRoot(
      profile,
      namespace,
      'manual_conflict_stale',
      'BASE',
    );
    const staleDetail =
      await this.workflows.provisionalScoring.getLatestScoreResult(
        conflict.patient._id.toString(),
        conflict.visit._id.toString(),
        conflict.instance._id.toString(),
      );
    const firstTarget = staleDetail.reviewQueue[0]?.itemResponseId;
    if (!firstTarget) {
      throw this.scenarioInvalid(profile, 'manual_conflict_stale');
    }
    await this.performManualReview(conflict, actor, firstTarget);
    let reviewConflictObserved = false;
    try {
      await this.workflows.scoreReview.reviewScoreItem(
        conflict.patient._id.toString(),
        conflict.visit._id.toString(),
        conflict.instance._id.toString(),
        staleDetail.scoreResult.id,
        firstTarget,
        actor,
        {
          scoreValue: this.reviewValue(staleDetail, firstTarget),
          reviewNote: E2E_REVIEW_NOTE,
          expectedUpdatedAt: staleDetail.scoreResult.updatedAt.toISOString(),
        },
      );
    } catch (error: unknown) {
      reviewConflictObserved =
        responseCode(error) === 'SCORE_RESULT_REVIEW_CONFLICT';
    }
    if (!reviewConflictObserved) {
      throw new B8FixtureError(
        'B8_FIXTURE_REVIEW_CONFLICT_NOT_OBSERVED',
        'The controlled E2E stale review did not return the contracted conflict',
        profile,
        'manual_conflict_stale',
      );
    }
    await this.performManualReview(conflict, actor, firstTarget);

    const confirmation = await this.requireRoot(
      profile,
      namespace,
      'confirmation_conflict_warning',
      'BASE',
    );
    const staleConfirmation =
      await this.workflows.provisionalScoring.getLatestScoreResult(
        confirmation.patient._id.toString(),
        confirmation.visit._id.toString(),
        confirmation.instance._id.toString(),
      );
    const revisionTarget = staleConfirmation.scoreResult.itemScores.find(
      (item) =>
        item.scoreStatus === 'manual_scored' &&
        item.itemResponseId !== null &&
        item.minScore !== null,
    )?.itemResponseId;
    if (!revisionTarget) {
      throw this.scenarioInvalid(profile, 'confirmation_conflict_warning');
    }
    await this.performManualReview(confirmation, actor, revisionTarget);
    let confirmationConflictObserved = false;
    try {
      await this.workflows.scoreReview.confirmScoreResult(
        confirmation.patient._id.toString(),
        confirmation.visit._id.toString(),
        confirmation.instance._id.toString(),
        staleConfirmation.scoreResult.id,
        actor,
        {
          confirm: true,
          reviewNote: E2E_CONFIRMATION_NOTE,
          expectedUpdatedAt:
            staleConfirmation.scoreResult.updatedAt.toISOString(),
        },
      );
    } catch (error: unknown) {
      confirmationConflictObserved =
        responseCode(error) === 'SCORE_RESULT_CONFIRMATION_CONFLICT';
    }
    if (!confirmationConflictObserved) {
      throw new B8FixtureError(
        'B8_FIXTURE_CONFIRMATION_CONFLICT_NOT_OBSERVED',
        'The controlled E2E stale confirmation did not return the contracted conflict',
        profile,
        'confirmation_conflict_warning',
      );
    }
  }

  private async verifyInternal(
    profile: B8Profile,
    namespace: string,
    password: string,
    phase: B8VerifyPhase,
  ): Promise<B8SafeManifest> {
    await withB8VerifyStage(profile, 'contract', phase, () =>
      assertB8Contract(),
    );
    const before = await withB8VerifyStage(
      profile,
      'initial_snapshot',
      phase,
      () => this.readOnlySnapshot(profile, namespace),
    );
    const roles = await withB8VerifyStage(
      profile,
      'users_and_password',
      phase,
      () => this.verifyUsers(profile, namespace, password),
    );
    await withB8VerifyStage(profile, 'root_matrix', phase, () =>
      this.verifyRootMatrix(profile, namespace),
    );
    await withB8VerifyStage(profile, 'scenario_facts', phase, () =>
      this.verifyScenarioFacts(profile, namespace, phase),
    );
    await withB8VerifyStage(profile, 'profile_isolation', phase, () =>
      this.verifyProfileIsolation(profile, namespace),
    );
    await withB8VerifyStage(profile, 'global_seed', phase, () =>
      this.verifyBaselines(profile, namespace, phase),
    );
    const scenarios = await withB8VerifyStage(
      profile,
      'safe_manifest',
      phase,
      () => this.buildSafeScenarios(profile, namespace),
    );
    await withB8VerifyStage(profile, 'final_snapshot', phase, async () => {
      const after = await this.readOnlySnapshot(profile, namespace);
      if (after !== before) {
        throw new B8FixtureError(
          'B8_FIXTURE_VERIFY_MUTATED_DATA',
          'Verify must not create, repair, remove, or update fixture data',
          profile,
        );
      }
    });
    const counts = expectedCounts(profile);
    const manifest: B8SafeManifest = {
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
        `instances=${counts.instances}; scoreResults=${counts.scoreResults}`,
    };
    await withB8VerifyStage(profile, 'safe_manifest', phase, () =>
      assertB8SafeManifest(manifest),
    );
    return manifest;
  }

  private async createUsers(
    profile: B8Profile,
    namespace: string,
    password: string,
  ): Promise<Map<B8Role, UserDocument>> {
    const result = new Map<B8Role, UserDocument>();
    for (const role of B8_ROLES) {
      const user = await this.models.users.create({
        accountName: accountNameFor(profile, namespace, role),
        displayName: displayNameFor(profile, role),
        staffCode: `${profile === 'core-workflow' ? 'B8CFX' : 'B8RFX'}-${namespace}-${role}`,
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
    profile: B8Profile,
    namespace: string,
    password: string,
  ): Promise<B8SafeRoleManifest[]> {
    const result: B8SafeRoleManifest[] = [];
    for (const role of B8_ROLES) {
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
        throw new B8FixtureError(
          'B8_FIXTURE_ACCOUNT_INVALID',
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
    profile: B8Profile,
    namespace: string,
  ): Promise<void> {
    const counts = expectedCounts(profile);
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
    const instances = await this.models.scaleInstances
      .find({ assessmentVisitId: { $in: visitIds } })
      .sort({ instanceCode: 1 })
      .exec();
    const scores = await this.models.scoreResults.countDocuments(
      this.ownershipFilter(patientIds, visitIds),
    );
    if (
      patients.length !== counts.patients ||
      visits.length !== counts.visits ||
      instances.length !== counts.instances ||
      scores !== counts.scoreResults ||
      patients.some(
        (patient) =>
          !patient.tags.includes('synthetic') ||
          !patient.tags.includes(profile) ||
          patient.birthDate !== null ||
          patient.externalRefs !== null,
      )
    ) {
      throw new B8FixtureError(
        'B8_FIXTURE_ROOT_MATRIX_INVALID',
        'The exact synthetic B8 patient, visit, instance, and score matrix is invalid',
        profile,
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
        throw new B8FixtureError(
          'B8_FIXTURE_ITEM_MATRIX_INVALID',
          'A B8 instance does not match its materialized scale-version item set',
          profile,
        );
      }
    }
  }

  private async verifyScenarioFacts(
    profile: B8Profile,
    namespace: string,
    phase: B8VerifyPhase,
  ): Promise<void> {
    if (profile === 'core-workflow') {
      await this.verifyCoreFacts(namespace, phase);
    } else {
      await this.verifyResilienceFacts(namespace, phase);
    }
    await this.verifyContractedRouteFacts(profile, namespace);
    const subjectCodes = this.subjectCodes(profile, namespace);
    const patientIds = await this.models.patients.distinct('_id', {
      subjectCode: { $in: subjectCodes },
    });
    const ownership = { patientId: { $in: patientIds } };
    const counts = expectedCounts(profile);
    const [scoreCount, domainCount, reportCount] = await Promise.all([
      this.models.scoreResults.countDocuments(ownership),
      this.models.cognitiveDomainResults.countDocuments(ownership),
      this.models.reports.countDocuments(ownership),
    ]);
    if (
      scoreCount !== counts.scoreResults ||
      domainCount !== 0 ||
      reportCount !== 0
    ) {
      throw new B8FixtureError(
        'B8_FIXTURE_SIDE_EFFECT_COUNT_INVALID',
        'B8 score, domain, or report counts do not match the selected profile contract',
        profile,
      );
    }
  }

  private async verifyCoreFacts(
    namespace: string,
    phase: B8VerifyPhase,
  ): Promise<void> {
    const profile = 'core-workflow';
    const eligibility = await this.requireScore(
      await this.requireRoot(profile, namespace, 'manual_eligibility', 'BASE'),
    );
    if (
      eligibility.status !== 'needs_review' ||
      !eligibility.itemScores.some(
        (item) => item.scoreStatus === 'auto_scored',
      ) ||
      !eligibility.itemScores.some(
        (item) => item.scoreStatus === 'not_scored' || !item.countsTowardTotal,
      )
    ) {
      throw this.scenarioInvalid(profile, 'manual_eligibility');
    }
    const nullTarget = await this.requireScore(
      await this.requireRoot(
        profile,
        namespace,
        'manual_eligibility',
        'NULLTARGET',
      ),
    );
    if (
      !nullTarget.itemScores.some(
        (item) =>
          item.scoreStatus === 'needs_review' && item.itemResponseId === null,
      )
    ) {
      throw this.scenarioInvalid(profile, 'manual_eligibility');
    }
    await this.assertScoreState(
      profile,
      namespace,
      'manual_input_validation',
      'BASE',
      phase === 'prepared' ? 'needs_review' : 'needs_review',
      phase === 'prepared' ? undefined : 1,
    );
    await this.assertScoreState(
      profile,
      namespace,
      'manual_submit_success',
      'BASE',
      'needs_review',
      phase === 'prepared' ? undefined : 1,
    );
    await this.assertScoreState(
      profile,
      namespace,
      'manual_revision',
      'BASE',
      'computed',
      phase === 'prepared' ? undefined : 1,
    );
    await this.assertScoreState(
      profile,
      namespace,
      'final_manual_to_computed',
      'BASE',
      phase === 'prepared' ? 'needs_review' : 'computed',
      phase === 'prepared' ? undefined : 1,
    );
    for (const [suffix, status] of [
      ['BASE', 'computed'],
      ['WARNING', 'computed'],
      ['PENDING', 'needs_review'],
    ] as const) {
      await this.assertScoreState(
        profile,
        namespace,
        'confirmation_eligibility',
        suffix,
        status,
      );
    }
    const warning = await this.requireScore(
      await this.requireRoot(
        profile,
        namespace,
        'confirmation_eligibility',
        'WARNING',
      ),
    );
    if (
      warning.computation?.notes !== 'warning_codes=UNKNOWN_GROUP_CONFIGURATION'
    ) {
      throw this.scenarioInvalid(profile, 'confirmation_eligibility');
    }
    await this.assertScoreState(
      profile,
      namespace,
      'confirmation_success',
      'BASE',
      phase === 'prepared' ? 'computed' : 'confirmed',
    );
    for (const [suffix, status] of [
      ['BASE', 'confirmed'],
      ['LOCKED', 'locked'],
      ['MISSING', 'confirmed'],
    ] as const) {
      await this.assertScoreState(
        profile,
        namespace,
        'confirmed_idempotent_readonly',
        suffix,
        status,
      );
    }
    const missing = await this.requireScore(
      await this.requireRoot(
        profile,
        namespace,
        'confirmed_idempotent_readonly',
        'MISSING',
      ),
    );
    if (
      missing.confirmedAt !== null ||
      this.confirmationAudit(missing) !== null
    ) {
      throw this.scenarioInvalid(profile, 'confirmed_idempotent_readonly');
    }
    await this.assertScoreState(
      profile,
      namespace,
      'static_gate',
      'BASE',
      'computed',
    );
  }

  private async verifyResilienceFacts(
    namespace: string,
    phase: B8VerifyPhase,
  ): Promise<void> {
    const profile = 'resilience-security';
    for (const scenarioKey of [
      'draft_switch_unload',
      'auth_401',
      'auth_403',
    ] as const) {
      await this.assertScoreState(
        profile,
        namespace,
        scenarioKey,
        'BASE',
        'needs_review',
      );
    }
    await this.assertScoreState(
      profile,
      namespace,
      'manual_conflict_stale',
      'BASE',
      phase === 'prepared' ? 'needs_review' : 'computed',
      phase === 'prepared' ? undefined : 2,
    );
    const invalidMetadata = await this.requireScore(
      await this.requireRoot(
        profile,
        namespace,
        'metadata_audit_blocks',
        'BASE',
      ),
    );
    const auditLimit = await this.requireScore(
      await this.requireRoot(
        profile,
        namespace,
        'metadata_audit_blocks',
        'AUDITLIMIT',
      ),
    );
    const auditNamespace = auditLimit.metadata?.a18ManualReview as
      | { events?: unknown }
      | undefined;
    const rawInvalidMetadata =
      await this.models.scoreResults.collection.findOne({
        _id: invalidMetadata._id,
      });
    if (
      rawInvalidMetadata?.metadata !== 'b8-unsupported-metadata' ||
      !Array.isArray(auditNamespace?.events) ||
      auditNamespace.events.length !== 500
    ) {
      throw this.scenarioInvalid(profile, 'metadata_audit_blocks');
    }
    await this.assertScoreState(
      profile,
      namespace,
      'confirmation_conflict_warning',
      'BASE',
      'computed',
      phase === 'prepared' ? undefined : 1,
    );
    const warning = await this.requireScore(
      await this.requireRoot(
        profile,
        namespace,
        'confirmation_conflict_warning',
        'WARNING',
      ),
    );
    if (
      warning.status !== 'computed' ||
      warning.computation?.notes !== 'warning_codes=UNKNOWN_GROUP_CONFIGURATION'
    ) {
      throw this.scenarioInvalid(profile, 'confirmation_conflict_warning');
    }
    const privacyRoot = await this.requireRoot(
      profile,
      namespace,
      'privacy_public_surface',
      'BASE',
    );
    const privacy = await this.requireScore(privacyRoot);
    const rawPrivacy = await this.models.scoreResults.collection.findOne({
      _id: privacy._id,
    });
    const serialized = JSON.stringify(rawPrivacy);
    if (
      privacy.status !== 'confirmed' ||
      !serialized.includes('private-audit-sentinel') ||
      !serialized.includes('private-answer-sentinel') ||
      !serialized.includes('private-rule-sentinel')
    ) {
      throw this.scenarioInvalid(profile, 'privacy_public_surface');
    }
  }

  private async verifyContractedRouteFacts(
    profile: B8Profile,
    namespace: string,
  ): Promise<void> {
    for (const definition of scenarioDefinitionsFor(profile)) {
      for (const contract of definition.routeContracts ?? []) {
        const root = await this.requireRoot(
          profile,
          namespace,
          definition.scenarioKey,
          this.routeSuffix(definition.scenarioKey, contract.key),
        );
        const score = await this.models.scoreResults
          .findOne({ scaleInstanceId: root.instance._id })
          .exec();
        if (
          root.visit.status !== contract.visitStatus ||
          root.instance.status !== contract.scaleInstanceStatus
        ) {
          throw this.scenarioInvalid(profile, definition.scenarioKey);
        }
        if (contract.scoreResult.presence === 'absent') {
          if (score) {
            throw this.scenarioInvalid(profile, definition.scenarioKey);
          }
        } else {
          if (
            !score ||
            score.status !== contract.scoreResult.status ||
            !this.scoreMatchesRouteContract(score, contract)
          ) {
            throw this.scenarioInvalid(profile, definition.scenarioKey);
          }
        }
        await this.verifyRouteEditability(
          profile,
          definition.scenarioKey,
          root,
          contract,
        );
      }
    }
  }

  private scoreMatchesRouteContract(
    score: ScoreResultDocument,
    contract: B8RoutePreparedContract,
  ): boolean {
    const reviewQueueCount = this.reviewQueueCount(score);
    const warningCount = score.computation?.warningCount ?? 0;
    const hasWarning =
      warningCount > 0 ||
      (score.computation?.notes?.includes('warning_codes=') ?? false);
    const reviewQueueMatches =
      contract.scoreResult.reviewQueue === 'at-least-one'
        ? reviewQueueCount >= 1
        : contract.scoreResult.reviewQueue === 'empty'
          ? reviewQueueCount === 0
          : true;
    const warningMatches =
      contract.scoreResult.warning === 'none' ? !hasWarning : true;
    const confirmationReady =
      score.status === 'computed' &&
      reviewQueueCount === 0 &&
      !hasWarning &&
      score.totalScore !== null &&
      score.totalScore !== undefined &&
      score.totalScore.unscoredItemCount === 0 &&
      score.totalScore.needsReviewItemCount === 0 &&
      score.confirmedAt === null &&
      score.lockedAt === null &&
      this.confirmationAudit(score) === null;
    const confirmationMatches =
      contract.scoreResult.confirmationReadiness === 'ready'
        ? confirmationReady
        : contract.scoreResult.confirmationReadiness === 'blocked'
          ? !confirmationReady
          : true;
    return reviewQueueMatches && warningMatches && confirmationMatches;
  }

  private async verifyRouteEditability(
    profile: B8Profile,
    scenarioKey: B8BusinessScenarioKey,
    root: Root,
    contract: B8RoutePreparedContract,
  ): Promise<void> {
    const items = await this.models.itemResponses
      .find({ scaleInstanceId: root.instance._id })
      .exec();
    const editableItems = items.filter(
      (item) =>
        ['not_started', 'in_progress', 'answered'].includes(item.status) &&
        !(item.lockedAt instanceof Date),
    );
    const routeIsEditable =
      ['draft', 'in_progress'].includes(root.visit.status) &&
      ['draft', 'in_progress'].includes(root.instance.status) &&
      !(root.instance.lockedAt instanceof Date) &&
      editableItems.length > 0;
    if (
      (contract.itemResponseEditability === 'editable' && !routeIsEditable) ||
      (contract.itemResponseEditability === 'read-only' && routeIsEditable)
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
    if (contract.mediaDraftTarget === 'local-draft-supported') {
      const supportsLocalMediaDraft = editableItems.some((item) => {
        const config = item.itemConfigSnapshot;
        return (
          config !== null &&
          typeof config === 'object' &&
          (config.supportsPhotoUpload === true ||
            config.supportsHandwriting === true)
        );
      });
      const mediaCount = await this.models.mediaEvidence.countDocuments({
        scaleInstanceId: root.instance._id,
      });
      if (!routeIsEditable || !supportsLocalMediaDraft || mediaCount !== 0) {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
    }
  }

  private async assertScoreState(
    profile: B8Profile,
    namespace: string,
    scenarioKey: B8BusinessScenarioKey,
    suffix: string,
    status: ScoreResultStatus,
    expectedManualDelta?: number,
  ): Promise<void> {
    const root = await this.requireRoot(
      profile,
      namespace,
      scenarioKey,
      suffix,
    );
    const score = await this.requireScore(root);
    if (score.status !== status) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
    if (expectedManualDelta !== undefined) {
      const baseline = this.requireScoreBaseline(
        root.patient,
        scenarioKey,
        this.routeKeyForSuffix(scenarioKey, suffix),
      );
      if (
        this.manualEventCount(score) !==
        baseline.manualEventCount + expectedManualDelta
      ) {
        throw this.scenarioInvalid(profile, scenarioKey);
      }
    }
  }

  private async verifyProfileIsolation(
    profile: B8Profile,
    namespace: string,
  ): Promise<void> {
    const subjectCodes = this.subjectCodes(profile, namespace);
    const unexpectedOwnedPatients = await this.models.patients.countDocuments({
      'metadata.b8Fixture.namespace': namespace,
      $or: [
        { 'metadata.b8Fixture.profile': { $ne: profile } },
        { subjectCode: { $nin: subjectCodes } },
      ],
    });
    const wrongPrefix = profile === 'core-workflow' ? /^B8R-/i : /^B8C-/i;
    const crossProfileRoots = await this.models.patients.countDocuments({
      subjectCode: wrongPrefix,
      'metadata.b8Fixture.namespace': namespace,
    });
    if (unexpectedOwnedPatients !== 0 || crossProfileRoots !== 0) {
      throw new B8FixtureError(
        'B8_FIXTURE_PROFILE_CROSS_CONTAMINATION',
        'The selected profile contains roots owned by another profile or namespace contract',
        profile,
      );
    }
  }

  private async recordBaselines(
    profile: B8Profile,
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
      const scoreBaselines: ScoreBaseline[] = [];
      for (const routeKey of definition.routeKeys) {
        const root = await this.requireRoot(
          profile,
          namespace,
          definition.scenarioKey,
          this.routeSuffix(definition.scenarioKey, routeKey),
        );
        const routeContract = definition.routeContracts?.find(
          ({ key }) => key === routeKey,
        );
        const score = await this.models.scoreResults
          .findOne({ scaleInstanceId: root.instance._id })
          .exec();
        if (routeContract?.scoreResult.presence === 'absent') {
          if (score) {
            throw this.scenarioInvalid(profile, definition.scenarioKey);
          }
          continue;
        }
        if (!score) {
          throw this.scenarioInvalid(profile, definition.scenarioKey);
        }
        scoreBaselines.push(this.toScoreBaseline(routeKey, score));
      }
      const metadata: FixtureMetadata = {
        version: 1,
        profile,
        namespace,
        scenarioKey: definition.scenarioKey,
        sourceHash: await this.sourceHash(patient._id),
        seedHash,
        scoreBaselines,
      };
      await this.models.patients
        .updateOne(
          { _id: patient._id },
          { $set: { metadata: { b8Fixture: metadata } } },
        )
        .exec();
    }
  }

  private async verifyBaselines(
    profile: B8Profile,
    namespace: string,
    phase: B8VerifyPhase,
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
      const fixture = this.readFixtureMetadata(patient);
      if (
        !patient ||
        !fixture ||
        fixture.profile !== profile ||
        fixture.namespace !== namespace ||
        fixture.scenarioKey !== definition.scenarioKey ||
        fixture.version !== 1
      ) {
        throw new B8FixtureError(
          'B8_FIXTURE_BASELINE_METADATA_INVALID',
          'Namespace baseline ownership metadata is missing or invalid',
          profile,
          definition.scenarioKey,
        );
      }
      if (fixture.seedHash !== seedHash) {
        throw new B8FixtureError(
          'B8_FIXTURE_SEED_HASH_INVALID',
          'The global MMSE/MoCA seed changed after B8 preparation',
          profile,
          definition.scenarioKey,
        );
      }
      if (fixture.sourceHash !== (await this.sourceHash(patient._id))) {
        throw new B8FixtureError(
          'B8_FIXTURE_SOURCE_HASH_INVALID',
          'A namespace-owned source fact changed outside the B8 side-effect contract',
          profile,
          definition.scenarioKey,
        );
      }
      const expectedScoreRouteKeys = definition.routeKeys.filter(
        (routeKey) =>
          definition.routeContracts?.find(({ key }) => key === routeKey)
            ?.scoreResult.presence !== 'absent',
      );
      const baselineRouteKeys = fixture.scoreBaselines.map(
        ({ routeKey }) => routeKey,
      );
      if (
        expectedScoreRouteKeys.length !== baselineRouteKeys.length ||
        expectedScoreRouteKeys.some(
          (routeKey) => !baselineRouteKeys.includes(routeKey),
        )
      ) {
        throw new B8FixtureError(
          'B8_FIXTURE_BASELINE_METADATA_INVALID',
          'Namespace route baseline coverage is missing or invalid',
          profile,
          definition.scenarioKey,
        );
      }
      for (const baseline of fixture.scoreBaselines) {
        const root = await this.requireRoot(
          profile,
          namespace,
          definition.scenarioKey,
          this.routeSuffix(definition.scenarioKey, baseline.routeKey),
        );
        const score = await this.requireScore(root);
        if (score._id.toString() !== baseline.scoreResultId) {
          throw this.scenarioInvalid(profile, definition.scenarioKey);
        }
        if (phase === 'prepared') {
          this.assertPreparedScore(
            profile,
            definition.scenarioKey,
            score,
            baseline,
          );
        } else {
          this.assertPostBrowserScore(
            profile,
            definition.scenarioKey,
            baseline.routeKey,
            score,
            baseline,
          );
        }
      }
    }
  }

  private assertPreparedScore(
    profile: B8Profile,
    scenarioKey: B8BusinessScenarioKey,
    score: ScoreResultDocument,
    baseline: ScoreBaseline,
  ): void {
    if (
      this.updatedAtFor(score).toISOString() !== baseline.updatedAt ||
      score.status !== baseline.status ||
      this.reviewQueueCount(score) !== baseline.reviewQueueCount ||
      this.manualEventCount(score) !== baseline.manualEventCount ||
      (this.confirmationAudit(score) !== null) !== baseline.hasConfirmation ||
      this.scoreHash(score) !== baseline.scoreHash
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
  }

  private assertPostBrowserScore(
    profile: B8Profile,
    scenarioKey: B8BusinessScenarioKey,
    routeKey: string,
    score: ScoreResultDocument,
    baseline: ScoreBaseline,
  ): void {
    const transition = this.postBrowserTransition(
      profile,
      scenarioKey,
      routeKey,
    );
    if (!transition) {
      this.assertPreparedScore(profile, scenarioKey, score, baseline);
      return;
    }
    const updatedAt = this.updatedAtFor(score).getTime();
    const baselineUpdatedAt = new Date(baseline.updatedAt).getTime();
    const expectedReviewQueueCount =
      transition.reviewQueueCount === 'baseline-minus-one'
        ? baseline.reviewQueueCount - 1
        : transition.reviewQueueCount;
    if (
      !Number.isFinite(updatedAt) ||
      updatedAt <= baselineUpdatedAt ||
      score.status !== transition.status ||
      this.manualEventCount(score) !==
        baseline.manualEventCount + transition.manualEventDelta ||
      this.reviewQueueCount(score) !== expectedReviewQueueCount ||
      (this.confirmationAudit(score) !== null) !== transition.hasConfirmation
    ) {
      throw this.scenarioInvalid(profile, scenarioKey);
    }
  }

  private postBrowserTransition(
    profile: B8Profile,
    scenarioKey: B8BusinessScenarioKey,
    routeKey: string,
  ):
    | {
        status: ScoreResultStatus;
        manualEventDelta: number;
        reviewQueueCount: number | 'baseline-minus-one';
        hasConfirmation: boolean;
      }
    | undefined {
    if (routeKey !== 'base') {
      return undefined;
    }
    if (profile === 'core-workflow') {
      if (
        scenarioKey === 'manual_input_validation' ||
        scenarioKey === 'manual_submit_success'
      ) {
        return {
          status: 'needs_review',
          manualEventDelta: 1,
          reviewQueueCount: 'baseline-minus-one',
          hasConfirmation: false,
        };
      }
      if (
        scenarioKey === 'manual_revision' ||
        scenarioKey === 'final_manual_to_computed'
      ) {
        return {
          status: 'computed',
          manualEventDelta: 1,
          reviewQueueCount: 0,
          hasConfirmation: false,
        };
      }
      if (scenarioKey === 'confirmation_success') {
        return {
          status: 'confirmed',
          manualEventDelta: 0,
          reviewQueueCount: 0,
          hasConfirmation: true,
        };
      }
      return undefined;
    }
    if (scenarioKey === 'manual_conflict_stale') {
      return {
        status: 'computed',
        manualEventDelta: 2,
        reviewQueueCount: 0,
        hasConfirmation: false,
      };
    }
    if (scenarioKey === 'confirmation_conflict_warning') {
      return {
        status: 'computed',
        manualEventDelta: 1,
        reviewQueueCount: 0,
        hasConfirmation: false,
      };
    }
    return undefined;
  }

  private toScoreBaseline(
    routeKey: string,
    score: ScoreResultDocument,
  ): ScoreBaseline {
    return {
      routeKey,
      scoreResultId: score._id.toString(),
      updatedAt: this.updatedAtFor(score).toISOString(),
      status: score.status,
      reviewQueueCount: this.reviewQueueCount(score),
      manualEventCount: this.manualEventCount(score),
      hasConfirmation: this.confirmationAudit(score) !== null,
      scoreHash: this.scoreHash(score),
    };
  }

  private scoreHash(score: ScoreResultDocument): string {
    return stableHash(withoutLifecycleTimestamps(score.toObject()));
  }

  private updatedAtFor(score: ScoreResultDocument): Date {
    const updatedAt: unknown = score.get('updatedAt');
    if (!(updatedAt instanceof Date)) {
      throw new B8FixtureError(
        'B8_FIXTURE_UPDATED_AT_INVALID',
        'A B8 score result has no valid server updatedAt fact',
      );
    }
    return updatedAt;
  }

  private manualEventCount(score: ScoreResultDocument): number {
    return readManualReviewEvents(score.metadata ?? null).length;
  }

  private confirmationAudit(
    score: ScoreResultDocument,
  ): ReturnType<typeof readConfirmationAudit> {
    return readConfirmationAudit(score.metadata ?? null);
  }

  private reviewQueueCount(score: ScoreResultDocument): number {
    return score.itemScores.filter(
      (item) => item.scoreStatus === 'needs_review',
    ).length;
  }

  private readFixtureMetadata(
    patient: PatientDocument | null,
  ): FixtureMetadata | undefined {
    return patient?.metadata?.b8Fixture as FixtureMetadata | undefined;
  }

  private requireScoreBaseline(
    patient: PatientDocument,
    scenarioKey: B8BusinessScenarioKey,
    routeKey: string,
  ): ScoreBaseline {
    const fixture = this.readFixtureMetadata(patient);
    const baseline = fixture?.scoreBaselines.find(
      (candidate) => candidate.routeKey === routeKey,
    );
    if (!baseline) {
      throw this.scenarioInvalid(
        fixture?.profile ?? 'core-workflow',
        scenarioKey,
      );
    }
    return baseline;
  }

  private async buildSafeScenarios(
    profile: B8Profile,
    namespace: string,
  ): Promise<B8SafeScenarioManifest[]> {
    const result: B8SafeScenarioManifest[] = [];
    for (const definition of scenarioDefinitionsFor(profile)) {
      const routes: B8SafeRoute[] = [];
      for (const key of definition.routeKeys) {
        const root = await this.requireRoot(
          profile,
          namespace,
          definition.scenarioKey,
          this.routeSuffix(definition.scenarioKey, key),
        );
        const routeContract = definition.routeContracts?.find(
          (candidate) => candidate.key === key,
        );
        routes.push({
          key,
          path: `/patients/${root.patient._id.toString()}/visits/${root.visit._id.toString()}/scale-instances/${root.instance._id.toString()}`,
          ...(routeContract
            ? {
                preparedState: routeContract.preparedState,
                visitStatus: routeContract.visitStatus,
                scaleInstanceStatus: routeContract.scaleInstanceStatus,
                scoreResult: routeContract.scoreResult,
                itemResponseEditability: routeContract.itemResponseEditability,
                mediaDraftTarget: routeContract.mediaDraftTarget,
                expectedRequest: routeContract.expectedRequest,
                expectedHttpStatus: routeContract.expectedHttpStatus,
                automaticRetry: routeContract.automaticRetry,
                postBrowserSideEffect: routeContract.postBrowserSideEffect,
              }
            : {}),
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

  private routeSuffix(
    scenarioKey: B8BusinessScenarioKey,
    routeKey: string,
  ): string {
    if (
      routeKey === 'base' ||
      (routeKey === 'manual' &&
        (scenarioKey === 'network_failure' ||
          scenarioKey === 'responsive_route_draft'))
    ) {
      return 'BASE';
    }
    const suffixes: Partial<
      Record<B8BusinessScenarioKey, Record<string, string>>
    > = {
      manual_eligibility: { nullTarget: 'NULLTARGET' },
      confirmation_eligibility: {
        warning: 'WARNING',
        pending: 'PENDING',
      },
      confirmed_idempotent_readonly: {
        locked: 'LOCKED',
        missing: 'MISSING',
      },
      metadata_audit_blocks: { auditLimit: 'AUDITLIMIT' },
      confirmation_conflict_warning: { warning: 'WARNING' },
      network_failure: { confirmation: 'CONFIRMATION' },
      responsive_route_draft: {
        confirmation: 'CONFIRMATION',
        execution: 'EXECUTION',
      },
    };
    const suffix = suffixes[scenarioKey]?.[routeKey];
    if (!suffix) {
      throw this.scenarioInvalid('core-workflow', scenarioKey);
    }
    return suffix;
  }

  private routeKeyForSuffix(
    scenarioKey: B8BusinessScenarioKey,
    suffix: string,
  ): string {
    const definition = [
      'BASE',
      'NULLTARGET',
      'WARNING',
      'PENDING',
      'LOCKED',
      'MISSING',
      'AUDITLIMIT',
      'CONFIRMATION',
      'EXECUTION',
    ].includes(suffix)
      ? suffix
      : 'BASE';
    if (definition === 'BASE') {
      return scenarioKey === 'network_failure' ||
        scenarioKey === 'responsive_route_draft'
        ? 'manual'
        : 'base';
    }
    const entries: Record<string, string> = {
      NULLTARGET: 'nullTarget',
      WARNING: 'warning',
      PENDING: 'pending',
      LOCKED: 'locked',
      MISSING: 'missing',
      AUDITLIMIT: 'auditLimit',
      CONFIRMATION: 'confirmation',
      EXECUTION: 'execution',
    };
    const routeKey = entries[definition];
    if (!routeKey) {
      throw this.scenarioInvalid('core-workflow', scenarioKey);
    }
    return routeKey;
  }

  private async requireRoot(
    profile: B8Profile,
    namespace: string,
    scenarioKey: B8BusinessScenarioKey,
    suffix: string,
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
      throw this.scenarioInvalid(profile, scenarioKey);
    }
    return { patient, visit, instance };
  }

  private async requireScore(root: Root): Promise<ScoreResultDocument> {
    const score = await this.models.scoreResults
      .findOne({ scaleInstanceId: root.instance._id })
      .exec();
    if (!score) {
      throw this.scenarioInvalid(
        this.profileFromSubjectCode(root.patient.subjectCode),
        this.scenarioFromSubjectCode(root.patient.subjectCode),
      );
    }
    return score;
  }

  private scenarioInvalid(
    profile: B8Profile,
    scenarioKey: B8BusinessScenarioKey,
  ): B8FixtureError {
    return new B8FixtureError(
      'B8_FIXTURE_SCENARIO_INVALID',
      'A fixed B8 scenario is missing, corrupted, over-written, or in the wrong phase state',
      profile,
      scenarioKey,
    );
  }

  private async requireActor(
    profile: B8Profile,
    namespace: string,
    role: B8Role,
  ): Promise<AuthenticatedUserContext> {
    const user = await this.models.users
      .findOne({ accountName: accountNameFor(profile, namespace, role) })
      .exec();
    if (!user) {
      throw new B8FixtureError(
        'B8_FIXTURE_ACCOUNT_INVALID',
        'A required fixture actor is missing',
        profile,
        'roles',
      );
    }
    return toActor(user);
  }

  private async performManualReview(
    root: Root,
    actor: AuthenticatedUserContext,
    requestedItemResponseId?: string,
  ): Promise<void> {
    const detail = await this.workflows.provisionalScoring.getLatestScoreResult(
      root.patient._id.toString(),
      root.visit._id.toString(),
      root.instance._id.toString(),
    );
    const itemResponseId =
      requestedItemResponseId ??
      detail.reviewQueue[0]?.itemResponseId ??
      detail.scoreResult.itemScores.find(
        (item) =>
          item.scoreStatus === 'manual_scored' &&
          item.itemResponseId !== null &&
          item.minScore !== null,
      )?.itemResponseId;
    if (!itemResponseId) {
      throw this.scenarioInvalid(
        this.profileFromSubjectCode(root.patient.subjectCode),
        this.scenarioFromSubjectCode(root.patient.subjectCode),
      );
    }
    await this.workflows.scoreReview.reviewScoreItem(
      root.patient._id.toString(),
      root.visit._id.toString(),
      root.instance._id.toString(),
      detail.scoreResult.id,
      itemResponseId,
      actor,
      {
        scoreValue: this.reviewValue(detail, itemResponseId),
        reviewNote: E2E_REVIEW_NOTE,
        expectedUpdatedAt: detail.scoreResult.updatedAt.toISOString(),
      },
    );
  }

  private reviewValue(
    detail: Awaited<
      ReturnType<ProvisionalScoringWorkflowService['getLatestScoreResult']>
    >,
    itemResponseId: string,
  ): number {
    const item = detail.scoreResult.itemScores.find(
      (candidate) => candidate.itemResponseId === itemResponseId,
    );
    if (
      !item ||
      typeof item.minScore !== 'number' ||
      !Number.isFinite(item.minScore)
    ) {
      throw new B8FixtureError(
        'B8_FIXTURE_REVIEW_VALUE_INVALID',
        'A controlled E2E review target has no deterministic finite minimum',
      );
    }
    return item.minScore;
  }

  private async performConfirmation(
    root: Root,
    actor: AuthenticatedUserContext,
  ): Promise<boolean> {
    const detail = await this.workflows.provisionalScoring.getLatestScoreResult(
      root.patient._id.toString(),
      root.visit._id.toString(),
      root.instance._id.toString(),
    );
    const response = await this.workflows.scoreReview.confirmScoreResult(
      root.patient._id.toString(),
      root.visit._id.toString(),
      root.instance._id.toString(),
      detail.scoreResult.id,
      actor,
      {
        confirm: true,
        reviewNote: E2E_CONFIRMATION_NOTE,
        expectedUpdatedAt: detail.scoreResult.updatedAt.toISOString(),
      },
    );
    return response.confirmationReceipt.alreadyConfirmed;
  }

  private profileFromSubjectCode(subjectCode: string): B8Profile {
    return subjectCode.startsWith('B8C-')
      ? 'core-workflow'
      : 'resilience-security';
  }

  private scenarioFromSubjectCode(subjectCode: string): B8BusinessScenarioKey {
    const profile = this.profileFromSubjectCode(subjectCode);
    const ordinal = Number(subjectCode.slice(-2));
    const scenario = scenarioDefinitionsFor(profile).find(
      (candidate) => candidate.ordinal === ordinal,
    );
    if (!scenario) {
      throw new B8FixtureError(
        'B8_FIXTURE_SCENARIO_INVALID',
        'A B8 subject code does not map to a fixed profile scenario',
        profile,
      );
    }
    return scenario.scenarioKey;
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
    profile: B8Profile,
    namespace: string,
  ): Promise<string> {
    const accountNames = B8_ROLES.map((role) =>
      accountNameFor(profile, namespace, role),
    );
    const subjectCodes = this.subjectCodes(profile, namespace);
    const [users, patients, definitions, versions] = await Promise.all([
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
      definitions,
      versions,
    });
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

  private subjectCodes(profile: B8Profile, namespace: string): string[] {
    return scenarioDefinitionsFor(profile).map(({ ordinal }) =>
      scenarioSubjectCodeFor(profile, namespace, ordinal),
    );
  }

  private async assertNamespaceUnused(
    profile: B8Profile,
    namespace: string,
  ): Promise<void> {
    const [users, patients] = await Promise.all([
      this.models.users.countDocuments({
        accountName: {
          $in: B8_ROLES.map((role) => accountNameFor(profile, namespace, role)),
        },
      }),
      this.models.patients.countDocuments({
        subjectCode: { $in: this.subjectCodes(profile, namespace) },
      }),
    ]);
    if (users !== 0 || patients !== 0) {
      throw new B8FixtureError(
        'B8_FIXTURE_NAMESPACE_EXISTS',
        'The profile namespace exists or contains partial residue; use explicit replace',
        profile,
      );
    }
  }

  private async assertNoUnexpectedRoots(
    profile: B8Profile,
    namespace: string,
    accountNames: string[],
    subjectCodes: string[],
  ): Promise<void> {
    const accountPrefix = profile === 'core-workflow' ? 'b8cfx' : 'b8rfx';
    const subjectPrefix = profile === 'core-workflow' ? 'B8C' : 'B8R';
    const [users, patients] = await Promise.all([
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
    ]);
    if (
      users.some(({ accountName }) => !accountNames.includes(accountName)) ||
      patients.some(({ subjectCode }) => !subjectCodes.includes(subjectCode))
    ) {
      throw new B8FixtureError(
        'B8_FIXTURE_NAMESPACE_OWNERSHIP_UNSAFE',
        'Profile namespace root ownership is ambiguous; cleanup was refused',
        profile,
      );
    }
  }

  private async countResiduals(
    profile: B8Profile,
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
      this.models.patients.countDocuments({
        'metadata.b8Fixture.profile': profile,
        'metadata.b8Fixture.namespace': namespace,
      }),
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

export function createB8BrowserFixtureManager(
  app: INestApplicationContext,
): B8BrowserFixtureManager {
  const config = app.get(ConfigService);
  const connection = app.get<Connection>(getConnectionToken());
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
  const models: B8Models = {
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
  const workflows: B8FixtureWorkflows = {
    scaleCatalog: app.get(ScaleCatalogService),
    scaleWorkflow: app.get(AssessmentScaleWorkflowService),
    itemDraft: app.get(ItemResponseDraftService),
    mediaWorkflow: app.get(MediaEvidenceWorkflowService),
    submission: app.get(ScaleInstanceSubmissionService),
    provisionalScoring: app.get(ProvisionalScoringWorkflowService),
    scoreReview: app.get(ScoreReviewWorkflowService),
  };
  return new B8BrowserFixtureManager(
    connection.name,
    models,
    app.get(AuthService),
    workflows,
  );
}
