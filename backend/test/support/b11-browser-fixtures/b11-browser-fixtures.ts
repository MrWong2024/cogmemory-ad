import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import {
  Session,
  type SessionDocument,
} from '../../../src/modules/auth/schemas/session.schema';
import { AuthService } from '../../../src/modules/auth/services/auth.service';
import { AssessmentVisit } from '../../../src/modules/assessments/schemas/assessment-visit.schema';
import { ScaleInstance } from '../../../src/modules/assessments/schemas/scale-instance.schema';
import { Patient } from '../../../src/modules/patients/schemas/patient.schema';
import {
  prepareClinicalReportConfirmation,
  prepareClinicalReportDraftEdit,
  prepareClinicalReportSubmission,
} from '../../../src/modules/reports/lib/clinical-report-review';
import { ClinicalReport } from '../../../src/modules/reports/schemas/clinical-report.schema';
import { ClinicalReportPublicMapper } from '../../../src/modules/reports/services/clinical-report-public.mapper';
import { ReportsService } from '../../../src/modules/reports/services/reports.service';
import { ScaleDefinition } from '../../../src/modules/scales/schemas/scale-definition.schema';
import { ScaleVersion } from '../../../src/modules/scales/schemas/scale-version.schema';
import { ScaleCatalogService } from '../../../src/modules/scales/services/scale-catalog.service';
import {
  User,
  type UserDocument,
} from '../../../src/modules/users/schemas/user.schema';
import {
  accountNameFor,
  assertB11Contract,
  assertB11RuntimeEnvironment,
  assertB11RuntimeTarget,
  assertB11StageTarget,
  displayNameFor,
  requireB11FixturePassword,
  routeFor,
  scenariosFor,
  subjectCodeFor,
  validateB11Namespace,
  visitCodeFor,
} from './fixture-contract';
import {
  B11FixtureBuilder,
  type B11FixtureModels,
  type B11RouteRoot,
} from './fixture-builder';
import { assertB11SafeOutput, buildB11SafeManifest } from './fixture-manifest';
import {
  assertB11PreparedReport,
  assertB11RouteAgainstBaseline,
  buildB11RouteBaseline,
  preparedHashForBaselines,
  readB11RouteBaseline,
  stableB11Hash,
  type B11RouteBaseline,
} from './fixture-verifier';
import { cleanupB11RuntimeDescriptors } from './runtime-descriptor';
import {
  B11_ROLES,
  B11FixtureError,
  type B11Profile,
  type B11ResourceCounts,
  type B11Role,
  type B11RuntimeDescriptor,
  type B11SafeCleanupSummary,
  type B11SafeManifest,
  type B11SafeRoleManifest,
  type B11SafeStageSummary,
  type B11StageTransition,
  type B11VerifyPhase,
} from './fixture-types';

type B11Models = B11FixtureModels & {
  users: Model<UserDocument>;
  sessions: Model<SessionDocument>;
};

type IdRow = { _id: Types.ObjectId };
type OwnershipMarker = {
  version: 1;
  profile: B11Profile;
  namespace: string;
  scenarioKey: string;
  routeKey: string;
};

const BASE_DATE = new Date('2026-07-28T02:00:00.000Z');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function workflowRole(
  role: B11Role,
): 'doctor' | 'nurse' | 'research_assistant' | 'admin' | 'unknown' {
  return role === 'system' ? 'unknown' : role;
}

function actorFor(user: UserDocument, role: B11Role) {
  return {
    operatorId: user._id.toString(),
    operatorName: user.displayName,
    operatorRole: workflowRole(role),
  };
}

function canonicalSeedDocument(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalSeedDocument);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => key !== 'createdAt' && key !== 'updatedAt')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalSeedDocument(entry)]),
  );
}

export function isB11ProtectedCanonicalScaleVersion(value: {
  scaleCode?: unknown;
  status?: unknown;
}): boolean {
  return (
    (value.scaleCode === 'mmse' || value.scaleCode === 'moca') &&
    value.status === 'active'
  );
}

export class B11BrowserFixtureManager {
  constructor(
    private readonly databaseName: string,
    private readonly models: B11Models,
    private readonly authService: AuthService,
    private readonly scaleCatalog: ScaleCatalogService,
    private readonly reportsService: ReportsService,
    private readonly publicMapper: ClinicalReportPublicMapper,
  ) {}

  async prepare(
    profile: B11Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B11SafeManifest> {
    const namespace = validateB11Namespace(profile, rawNamespace);
    const password = requireB11FixturePassword(rawPassword);
    assertB11Contract();
    await this.assertNamespaceUnused(profile, namespace);
    await this.ensureCanonicalSeedReadiness();
    const canonicalSeedHash = await this.canonicalSeedHash();
    try {
      const users = await this.createUsers(profile, namespace, password);
      const doctor = users.get('doctor');
      if (!doctor) {
        throw new B11FixtureError(
          'B11_FIXTURE_ACCOUNT_CREATION_FAILED',
          'The fixed doctor fixture account was not created',
          profile,
        );
      }
      await new B11FixtureBuilder(profile, namespace, this.models).buildAll(
        doctor,
      );
      await this.recordBaselines(profile, namespace, canonicalSeedHash);
      if ((await this.canonicalSeedHash()) !== canonicalSeedHash) {
        throw new B11FixtureError(
          'B11_FIXTURE_CANONICAL_SEED_DRIFT',
          'B11 preparation changed the protected canonical seed',
          profile,
        );
      }
      return await this.verifyInternal(
        profile,
        namespace,
        password,
        'prepared',
      );
    } catch (error: unknown) {
      try {
        await this.cleanup(profile, namespace);
      } catch {
        // Preserve the original safe failure; cleanup remains explicitly retryable.
      }
      throw error;
    }
  }

  async replace(
    profile: B11Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B11SafeManifest> {
    const namespace = validateB11Namespace(profile, rawNamespace);
    const password = requireB11FixturePassword(rawPassword);
    await this.cleanup(profile, namespace);
    return this.prepare(profile, namespace, password);
  }

  async verify(
    profile: B11Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
    phase: B11VerifyPhase,
  ): Promise<B11SafeManifest> {
    return this.verifyInternal(
      profile,
      validateB11Namespace(profile, rawNamespace),
      requireB11FixturePassword(rawPassword),
      phase,
    );
  }

  async stage(input: {
    profile: B11Profile;
    namespace: string;
    password: string | undefined;
    scenarioKey: string | undefined;
    routeKey: string | undefined;
    transition: string | undefined;
    role: B11Role | undefined;
  }): Promise<B11SafeStageSummary> {
    const namespace = validateB11Namespace(input.profile, input.namespace);
    const password = requireB11FixturePassword(input.password);
    const stageTarget = {
      profile: input.profile,
      scenarioKey: input.scenarioKey,
      routeKey: input.routeKey,
      transition: input.transition,
      role: input.role,
    };
    assertB11StageTarget(stageTarget);
    const { scenarioKey, routeKey, transition, role } = stageTarget;
    const seedBefore = await this.canonicalSeedHash();
    const alreadyStaged = await this.isExactStageApplied({
      profile: input.profile,
      namespace,
      scenarioKey,
      routeKey,
      transition,
    });
    if (!alreadyStaged) {
      await this.verifyInternal(input.profile, namespace, password, 'prepared');
      if (transition === 'confirmation-conflict-touch') {
        const root = await this.requireRoot(
          input.profile,
          namespace,
          scenarioKey,
          routeKey,
        );
        const result = await this.models.reports.updateOne(
          {
            _id: root.report._id,
            status: 'pending_confirmation',
            confirmation: null,
            'metadata.b11FixtureStage': { $exists: false },
          },
          {
            $set: {
              'metadata.b11FixtureStage': this.stageMarker({
                profile: input.profile,
                namespace,
                scenarioKey,
                routeKey,
                transition,
              }),
            },
            $currentDate: { updatedAt: true },
          },
        );
        if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
          throw new B11FixtureError(
            'B11_FIXTURE_STAGE_PRECONDITION_INVALID',
            'Confirmation conflict Stage requires the exact pending report baseline',
            input.profile,
            scenarioKey,
            routeKey,
          );
        }
      } else {
        const accountName = accountNameFor(input.profile, namespace, 'doctor');
        const result = await this.models.users.updateOne(
          {
            accountName,
            roles: ['doctor'],
            userType: 'doctor',
            'metadata.b11FixtureStage': { $exists: false },
          },
          {
            $set: {
              roles: ['nurse'],
              userType: 'nurse',
              'metadata.b11FixtureStage': this.stageMarker({
                profile: input.profile,
                namespace,
                scenarioKey,
                routeKey,
                transition,
              }),
            },
          },
        );
        if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
          throw new B11FixtureError(
            'B11_FIXTURE_STAGE_PRECONDITION_INVALID',
            'Forbidden confirm Stage requires the exact logged-in doctor account baseline',
            input.profile,
            scenarioKey,
            routeKey,
          );
        }
      }
    }
    await this.verifySingleStageIntegrity({
      profile: input.profile,
      namespace,
      password,
      scenarioKey,
      routeKey,
      transition,
    });
    if ((await this.canonicalSeedHash()) !== seedBefore) {
      throw new B11FixtureError(
        'B11_FIXTURE_CANONICAL_SEED_DRIFT',
        'B11 Stage changed the protected canonical seed',
        input.profile,
        scenarioKey,
        routeKey,
      );
    }
    const summary: B11SafeStageSummary = {
      version: 1,
      batch: 'B11',
      profile: input.profile,
      scenarioKey,
      routeKey,
      transition,
      role,
      staged: true,
      alreadyStaged,
      preparedBaselineVerified: true,
      canonicalSeedHashUnchanged: true,
    };
    assertB11SafeOutput(summary);
    return summary;
  }

  async resolveRuntimeDescriptor(input: {
    profile: B11Profile;
    namespace: string;
    password: string | undefined;
    scenarioKey: string;
    routeKey: string;
    role: B11Role;
  }): Promise<B11RuntimeDescriptor> {
    const namespace = validateB11Namespace(input.profile, input.namespace);
    const password = requireB11FixturePassword(input.password);
    const routeValue = assertB11RuntimeTarget(input);
    await this.verifyInternal(input.profile, namespace, password, 'prepared');
    const root = await this.requireRoot(
      input.profile,
      namespace,
      input.scenarioKey,
      input.routeKey,
    );
    return {
      version: 1,
      batch: 'B11',
      profile: input.profile,
      scenarioKey: input.scenarioKey,
      routeKey: input.routeKey,
      primaryRole: input.role,
      ...(routeValue.secondaryRole
        ? {
            secondaryRole: routeValue.secondaryRole,
            secondaryLoginIdentifier: accountNameFor(
              input.profile,
              namespace,
              routeValue.secondaryRole,
            ),
          }
        : {}),
      loginIdentifier: accountNameFor(input.profile, namespace, input.role),
      navigationPath: `/patients/${root.patient._id.toString()}/visits/${root.visit._id.toString()}`,
    };
  }

  async cleanup(
    profile: B11Profile,
    rawNamespace: string,
  ): Promise<B11SafeCleanupSummary> {
    const namespace = validateB11Namespace(profile, rawNamespace);
    const seedBefore = await this.canonicalSeedHash();
    const accountNames = B11_ROLES.map((role) =>
      accountNameFor(profile, namespace, role),
    );
    const subjectCodes = this.subjectCodes(profile, namespace);
    await this.assertNoUnexpectedRoots(profile, namespace, subjectCodes);
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
      await this.models.sessions.deleteMany({ userId: { $in: userIds } });
    }
    if (patientIds.length > 0 || visitIds.length > 0) {
      const ownership = this.ownershipFilter(patientIds, visitIds);
      await this.models.reports.deleteMany(ownership);
      await this.models.scaleInstances.deleteMany(ownership);
    }
    if (visitIds.length > 0) {
      await this.models.visits.deleteMany({ _id: { $in: visitIds } });
    }
    if (patientIds.length > 0) {
      await this.models.patients.deleteMany({ _id: { $in: patientIds } });
    }
    if (userIds.length > 0) {
      await this.models.users.deleteMany({ _id: { $in: userIds } });
    }
    const runtimeDescriptorsRemoved = await cleanupB11RuntimeDescriptors(
      profile,
      namespace,
    );
    const residualCount = await this.countResiduals({
      profile,
      namespace,
      accountNames,
      subjectCodes,
      userIds,
      patientIds,
      visitIds,
    });
    const seedHashUnchanged = (await this.canonicalSeedHash()) === seedBefore;
    if (residualCount !== 0 || !seedHashUnchanged) {
      throw new B11FixtureError(
        'B11_FIXTURE_CLEANUP_INCOMPLETE',
        'Cleanup left namespace-owned resources or changed canonical seed',
        profile,
      );
    }
    const summary: B11SafeCleanupSummary = {
      version: 1,
      batch: 'B11',
      namespace,
      databaseName: this.databaseName,
      profile,
      residualCount: 0,
      matched:
        users.length + patients.length + visits.length > 0 ||
        runtimeDescriptorsRemoved > 0,
      runtimeDescriptorsRemoved,
      canonicalSeedHashUnchanged: true,
    };
    assertB11SafeOutput(summary);
    return summary;
  }

  async simulatePostBrowserForE2e(
    profile: B11Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<void> {
    const namespace = validateB11Namespace(profile, rawNamespace);
    const password = requireB11FixturePassword(rawPassword);
    const stageRoute = scenariosFor(profile)
      .flatMap((scenario) =>
        scenario.routes.map((routeValue) => ({
          scenarioKey: scenario.scenarioKey,
          routeValue,
        })),
      )
      .find(
        ({ routeValue }) =>
          routeValue.expectedFixtureOwnedMutationClass !== 'none',
      );
    if (stageRoute) {
      const transition = stageRoute.routeValue.allowedStages[0];
      await this.stage({
        profile,
        namespace,
        password,
        scenarioKey: stageRoute.scenarioKey,
        routeKey: stageRoute.routeValue.key,
        transition,
        role: 'doctor',
      });
    }
    for (const scenario of scenariosFor(profile)) {
      for (const routeValue of scenario.routes) {
        if (routeValue.expectedProductMutationClass === 'none') continue;
        await this.simulateProductMutation({
          profile,
          namespace,
          scenarioKey: scenario.scenarioKey,
          routeKey: routeValue.key,
          mutation: routeValue.expectedProductMutationClass,
          role: routeValue.primaryRole === 'admin' ? 'admin' : 'doctor',
        });
      }
    }
  }

  private async simulateProductMutation(input: {
    profile: B11Profile;
    namespace: string;
    scenarioKey: string;
    routeKey: string;
    mutation:
      | 'edit_once'
      | 'edit_twice_after_conflict_continue'
      | 'secondary_edit_only'
      | 'submit_once'
      | 'secondary_submit_only'
      | 'confirm_once'
      | 'secondary_confirm_only';
    role: 'doctor' | 'admin';
  }): Promise<void> {
    const actorUser = await this.models.users
      .findOne({
        accountName: accountNameFor(input.profile, input.namespace, input.role),
      })
      .exec();
    if (!actorUser) {
      throw new B11FixtureError(
        'B11_FIXTURE_ACCOUNT_INVALID',
        'Simulation actor is missing',
        input.profile,
        input.scenarioKey,
        input.routeKey,
      );
    }
    const actor = actorFor(actorUser, input.role);
    const root = await this.requireRoot(
      input.profile,
      input.namespace,
      input.scenarioKey,
      input.routeKey,
    );
    const editTimes =
      input.mutation === 'edit_twice_after_conflict_continue'
        ? 2
        : input.mutation === 'edit_once' ||
            input.mutation === 'secondary_edit_only'
          ? 1
          : 0;
    for (let index = 0; index < editTimes; index += 1) {
      const summary = await this.requireReportSummary(root);
      const update = prepareClinicalReportDraftEdit({
        report: summary,
        doctorOpinion: `B11 synthetic simulated edit ${index + 1} with no clinical meaning.`,
        recommendationText:
          'B11 synthetic simulated recommendation with no clinical meaning.',
        editNote: 'B11 synthetic simulated edit note with no clinical meaning.',
        eventId: `b11-simulated-edit-${root.report._id.toString()}-${index + 1}`,
        editedAt: new Date(BASE_DATE.getTime() + 900_000 + index * 1000),
        actor,
      });
      await this.models.reports.updateOne(
        { _id: root.report._id },
        {
          $set: {
            narrative: update.narrative,
            metadata: update.metadata,
            source: 'mixed',
          },
        },
      );
    }
    if (
      input.mutation === 'submit_once' ||
      input.mutation === 'secondary_submit_only'
    ) {
      const summary = await this.requireReportSummary(root);
      const update = prepareClinicalReportSubmission({
        report: summary,
        submissionId: `b11-simulated-submission-${root.report._id.toString()}`,
        submittedAt: new Date(BASE_DATE.getTime() + 1_000_000),
        actor,
        submissionNote:
          'B11 synthetic simulated submission note with no clinical meaning.',
      });
      await this.models.reports.updateOne(
        { _id: root.report._id },
        { $set: { status: 'pending_confirmation', metadata: update.metadata } },
      );
    }
    if (
      input.mutation === 'confirm_once' ||
      input.mutation === 'secondary_confirm_only'
    ) {
      if (input.role !== 'doctor' && input.role !== 'admin') {
        throw new B11FixtureError(
          'B11_FIXTURE_SIMULATION_ROLE_INVALID',
          'Confirmation simulation requires doctor or admin',
          input.profile,
          input.scenarioKey,
          input.routeKey,
        );
      }
      const summary = await this.requireReportSummary(root);
      const confirmationActor = {
        ...actor,
        operatorRole: input.role,
      };
      const confirmedAt = new Date(BASE_DATE.getTime() + 1_100_000);
      const update = prepareClinicalReportConfirmation({
        report: summary,
        confirmationId: `b11-simulated-confirmation-${root.report._id.toString()}`,
        confirmedAt,
        actor: confirmationActor,
        confirmationNote:
          'B11 synthetic simulated confirmation note with no clinical meaning.',
      });
      await this.models.reports.updateOne(
        { _id: root.report._id },
        {
          $set: {
            status: 'confirmed',
            qualityStatus: 'passed',
            metadata: update.metadata,
            confirmation: {
              confirmedAt,
              confirmedBy: actorUser._id,
              confirmedByName: actorUser.displayName,
              confirmedByRole: input.role,
              confirmationNote:
                'B11 synthetic simulated confirmation note with no clinical meaning.',
            },
          },
        },
      );
    }
  }

  private async verifyInternal(
    profile: B11Profile,
    namespace: string,
    password: string,
    phase: B11VerifyPhase,
  ): Promise<B11SafeManifest> {
    assertB11Contract();
    const before = await this.readOnlySnapshot(profile, namespace);
    const roles = await this.verifyUsers(profile, namespace, password, phase);
    await this.verifyProfileIsolation(profile, namespace);
    const canonicalSeedHash = await this.canonicalSeedHash();
    const roots = await this.requireAllRoots(profile, namespace);
    const baselines: B11RouteBaseline[] = [];
    for (const root of roots) {
      const contract = routeFor(profile, root.scenarioKey, root.routeKey);
      const baseline = readB11RouteBaseline(root, profile, namespace);
      if (baseline.canonicalSeedHash !== canonicalSeedHash) {
        throw new B11FixtureError(
          'B11_FIXTURE_CANONICAL_SEED_DRIFT',
          'Canonical seed differs from the route baseline',
          profile,
          root.scenarioKey,
          root.routeKey,
          phase,
        );
      }
      if (phase === 'prepared') {
        assertB11PreparedReport({
          root,
          profile,
          namespace,
          contract,
          publicIsFinal: await this.publicIsFinal(root),
        });
        const current = buildB11RouteBaseline({
          root,
          profile,
          namespace,
          contract,
          canonicalSeedHash,
        });
        if (stableB11Hash(current) !== stableB11Hash(baseline)) {
          throw new B11FixtureError(
            'B11_FIXTURE_PREPARED_DRIFT',
            'Prepared route differs from its recorded field-level baseline',
            profile,
            root.scenarioKey,
            root.routeKey,
            phase,
          );
        }
      } else {
        assertB11RouteAgainstBaseline({
          root,
          baseline,
          contract,
          profile,
          namespace,
          phase,
        });
      }
      baselines.push(baseline);
    }
    await this.verifyRootCounts(profile, namespace, roots);
    const after = await this.readOnlySnapshot(profile, namespace);
    if (after !== before) {
      throw new B11FixtureError(
        'B11_FIXTURE_VERIFY_MUTATED_DATA',
        'Verifier must not create, repair, remove, or update fixture data',
        profile,
        undefined,
        undefined,
        phase,
      );
    }
    const resourceCounts = await this.resourceCounts(profile, namespace);
    return buildB11SafeManifest({
      namespace,
      databaseName: this.databaseName,
      profile,
      phase,
      roles,
      resourceCounts,
      preparedHash: preparedHashForBaselines(baselines),
      canonicalSeedHash,
    });
  }

  private async recordBaselines(
    profile: B11Profile,
    namespace: string,
    canonicalSeedHash: string,
  ): Promise<void> {
    const roots = await this.requireAllRoots(profile, namespace);
    for (const root of roots) {
      const contract = routeFor(profile, root.scenarioKey, root.routeKey);
      assertB11PreparedReport({
        root,
        profile,
        namespace,
        contract,
        publicIsFinal: await this.publicIsFinal(root),
      });
      const baseline = buildB11RouteBaseline({
        root,
        profile,
        namespace,
        contract,
        canonicalSeedHash,
      });
      const result = await this.models.patients.updateOne(
        {
          _id: root.patient._id,
          'metadata.b11Fixture.baseline': { $exists: false },
        },
        { $set: { 'metadata.b11Fixture.baseline': baseline } },
      );
      if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
        throw new B11FixtureError(
          'B11_FIXTURE_BASELINE_RECORD_FAILED',
          'Each route must record exactly one immutable baseline marker',
          profile,
          root.scenarioKey,
          root.routeKey,
        );
      }
    }
  }

  private async createUsers(
    profile: B11Profile,
    namespace: string,
    password: string,
  ): Promise<Map<B11Role, UserDocument>> {
    const result = new Map<B11Role, UserDocument>();
    for (const role of B11_ROLES) {
      const user = await this.models.users.create({
        accountName: accountNameFor(profile, namespace, role),
        displayName: displayNameFor(profile, role),
        staffCode: `${
          profile === 'core-workflow' ? 'B11CFX' : 'B11RFX'
        }-${namespace}-${role}`,
        passwordHash: await this.authService.hashPassword(password),
        passwordChangedAt: BASE_DATE,
        roles: [role],
        permissions: [],
        userType: role,
        status: 'active',
        failedLoginCount: 0,
        lockedUntil: null,
        metadata: {
          b11Fixture: { version: 1, profile, namespace, role },
        },
      });
      result.set(role, user);
    }
    return result;
  }

  private async verifyUsers(
    profile: B11Profile,
    namespace: string,
    password: string,
    phase: B11VerifyPhase,
  ): Promise<B11SafeRoleManifest[]> {
    const result: B11SafeRoleManifest[] = [];
    for (const role of B11_ROLES) {
      const user = await this.models.users
        .findOne({ accountName: accountNameFor(profile, namespace, role) })
        .select('+passwordHash')
        .exec();
      const forbiddenDoctorStage =
        phase === 'post-browser' &&
        profile === 'resilience-security' &&
        role === 'doctor';
      const stage = isRecord(user?.metadata)
        ? user?.metadata.b11FixtureStage
        : null;
      const exactForbiddenStage =
        forbiddenDoctorStage &&
        isRecord(stage) &&
        stage.version === 1 &&
        stage.profile === profile &&
        stage.namespace === namespace &&
        stage.scenarioKey === 'authorization' &&
        stage.routeKey === 'forbidden-confirm' &&
        stage.transition === 'forbidden-confirm-role';
      if (
        !user ||
        user.status !== 'active' ||
        user.permissions.length !== 0 ||
        !(await this.authService.verifyPassword(password, user.passwordHash)) ||
        (forbiddenDoctorStage
          ? !exactForbiddenStage ||
            user.userType !== 'nurse' ||
            user.roles.length !== 1 ||
            user.roles[0] !== 'nurse'
          : user.userType !== role ||
            user.roles.length !== 1 ||
            user.roles[0] !== role ||
            stage !== undefined)
      ) {
        throw new B11FixtureError(
          'B11_FIXTURE_ACCOUNT_INVALID',
          `Fixture account for role ${role} is missing or invalid`,
          profile,
          'roles',
          role,
          phase,
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

  private async requireAllRoots(
    profile: B11Profile,
    namespace: string,
  ): Promise<B11RouteRoot[]> {
    const roots: B11RouteRoot[] = [];
    for (const scenario of scenariosFor(profile)) {
      for (const routeValue of scenario.routes) {
        roots.push(
          await this.requireRoot(
            profile,
            namespace,
            scenario.scenarioKey,
            routeValue.key,
          ),
        );
      }
    }
    return roots;
  }

  private async requireRoot(
    profile: B11Profile,
    namespace: string,
    scenarioKey: string,
    routeKey: string,
  ): Promise<B11RouteRoot> {
    routeFor(profile, scenarioKey, routeKey);
    const patient = await this.models.patients
      .findOne({
        subjectCode: subjectCodeFor(profile, namespace, scenarioKey, routeKey),
      })
      .exec();
    const visit = patient
      ? await this.models.visits
          .findOne({
            patientId: patient._id,
            visitCode: visitCodeFor(profile, namespace, scenarioKey, routeKey),
          })
          .exec()
      : null;
    const instances = visit
      ? await this.models.scaleInstances
          .find({ assessmentVisitId: visit._id })
          .sort({ _id: 1 })
          .exec()
      : [];
    const reports = visit
      ? await this.models.reports
          .find({ assessmentVisitId: visit._id })
          .sort({ reportVersion: 1, _id: 1 })
          .exec()
      : [];
    if (!patient || !visit || instances.length !== 1 || reports.length !== 1) {
      throw new B11FixtureError(
        'B11_FIXTURE_ROOT_MATRIX_INVALID',
        'Each fixed B11 route requires one independent Patient, Visit, ScaleInstance, and ClinicalReport',
        profile,
        scenarioKey,
        routeKey,
      );
    }
    return {
      scenarioKey,
      routeKey,
      patient,
      visit,
      instance: instances[0],
      report: reports[0],
    };
  }

  private async verifyRootCounts(
    profile: B11Profile,
    namespace: string,
    roots: readonly B11RouteRoot[],
  ): Promise<void> {
    const expectedRoutes = scenariosFor(profile).flatMap(
      ({ routes }) => routes,
    ).length;
    const uniquePatients = new Set(
      roots.map(({ patient }) => patient._id.toString()),
    );
    const uniqueVisits = new Set(
      roots.map(({ visit }) => visit._id.toString()),
    );
    const uniqueInstances = new Set(
      roots.map(({ instance }) => instance._id.toString()),
    );
    const uniqueReports = new Set(
      roots.map(({ report }) => report._id.toString()),
    );
    const counts = await this.resourceCounts(profile, namespace);
    if (
      roots.length !== expectedRoutes ||
      uniquePatients.size !== expectedRoutes ||
      uniqueVisits.size !== expectedRoutes ||
      uniqueInstances.size !== expectedRoutes ||
      uniqueReports.size !== expectedRoutes ||
      counts.users !== 5 ||
      counts.patients !== expectedRoutes ||
      counts.visits !== expectedRoutes ||
      counts.scaleInstances !== expectedRoutes ||
      counts.clinicalReports !== expectedRoutes ||
      counts.fixtureMarkers !== expectedRoutes
    ) {
      throw new B11FixtureError(
        'B11_FIXTURE_RESOURCE_COUNT_INVALID',
        'B11 profile resource counts or writable-report independence differ from contract',
        profile,
      );
    }
  }

  private async resourceCounts(
    profile: B11Profile,
    namespace: string,
  ): Promise<B11ResourceCounts> {
    const accountNames = B11_ROLES.map((role) =>
      accountNameFor(profile, namespace, role),
    );
    const subjectCodes = this.subjectCodes(profile, namespace);
    const patients = await this.models.patients
      .find({ subjectCode: { $in: subjectCodes } })
      .select({ _id: 1 })
      .lean<IdRow[]>()
      .exec();
    const patientIds = patients.map(({ _id }) => _id);
    const visits = patientIds.length
      ? await this.models.visits
          .find({ patientId: { $in: patientIds } })
          .select({ _id: 1 })
          .lean<IdRow[]>()
          .exec()
      : [];
    const visitIds = visits.map(({ _id }) => _id);
    const ownership = this.ownershipFilter(patientIds, visitIds);
    const [users, scaleInstances, clinicalReports, fixtureMarkers] =
      await Promise.all([
        this.models.users.countDocuments({
          accountName: { $in: accountNames },
        }),
        patientIds.length || visitIds.length
          ? this.models.scaleInstances.countDocuments(ownership)
          : 0,
        patientIds.length || visitIds.length
          ? this.models.reports.countDocuments(ownership)
          : 0,
        this.models.patients.countDocuments({
          subjectCode: { $in: subjectCodes },
          'metadata.b11Fixture.profile': profile,
          'metadata.b11Fixture.namespace': namespace,
        }),
      ]);
    return {
      users,
      patients: patients.length,
      visits: visits.length,
      scaleInstances,
      clinicalReports,
      fixtureMarkers,
    };
  }

  private async publicIsFinal(root: B11RouteRoot): Promise<boolean> {
    const summary = await this.requireReportSummary(root);
    return this.publicMapper.toPublicReport(summary).isFinal;
  }

  private async requireReportSummary(root: B11RouteRoot) {
    const summary = await this.reportsService.findReportByOwnership({
      reportId: root.report._id.toString(),
      patientId: root.patient._id.toString(),
      assessmentVisitId: root.visit._id.toString(),
    });
    if (!summary) {
      throw new B11FixtureError(
        'B11_FIXTURE_REPORT_STATE_INVALID',
        'ReportsService could not read the fixture report by ownership',
        undefined,
        root.scenarioKey,
        root.routeKey,
      );
    }
    return summary;
  }

  private async ensureCanonicalSeedReadiness(): Promise<void> {
    for (const scaleCode of ['mmse', 'moca'] as const) {
      await this.scaleCatalog.ensureSeedScaleVersionMaterialized(scaleCode);
    }
  }

  private async canonicalSeedHash(): Promise<string> {
    const [definitions, versions] = await Promise.all([
      this.models.scaleDefinitions
        .find({ code: { $in: ['mmse', 'moca'] } })
        .sort({ code: 1, _id: 1 })
        .lean()
        .exec(),
      this.models.scaleVersions
        .find({
          scaleCode: { $in: ['mmse', 'moca'] },
          status: 'active',
        })
        .sort({ scaleCode: 1, version: 1, _id: 1 })
        .lean()
        .exec(),
    ]);
    return stableB11Hash(
      canonicalSeedDocument({
        definitions,
        versions: versions.filter(isB11ProtectedCanonicalScaleVersion),
      }),
    );
  }

  private async assertNamespaceUnused(
    profile: B11Profile,
    namespace: string,
  ): Promise<void> {
    const counts = await this.resourceCounts(profile, namespace);
    const owned = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const markedUsers = await this.models.users.countDocuments({
      'metadata.b11Fixture.namespace': namespace,
    });
    const markedPatients = await this.models.patients.countDocuments({
      'metadata.b11Fixture.namespace': namespace,
    });
    if (owned + markedUsers + markedPatients !== 0) {
      throw new B11FixtureError(
        'B11_FIXTURE_NAMESPACE_EXISTS',
        'Namespace already contains fixture-owned resources; use explicit replace',
        profile,
      );
    }
  }

  private async verifyProfileIsolation(
    profile: B11Profile,
    namespace: string,
  ): Promise<void> {
    const otherProfile: B11Profile =
      profile === 'core-workflow' ? 'resilience-security' : 'core-workflow';
    const [wrongUsers, wrongPatients, wrongReports] = await Promise.all([
      this.models.users.countDocuments({
        'metadata.b11Fixture.namespace': namespace,
        'metadata.b11Fixture.profile': { $ne: profile },
      }),
      this.models.patients.countDocuments({
        'metadata.b11Fixture.namespace': namespace,
        'metadata.b11Fixture.profile': { $ne: profile },
      }),
      this.models.reports.countDocuments({
        'metadata.b11FixtureOwnership.namespace': namespace,
        'metadata.b11FixtureOwnership.profile': { $ne: profile },
      }),
    ]);
    if (
      wrongUsers + wrongPatients + wrongReports !== 0 ||
      namespace.startsWith(otherProfile === 'core-workflow' ? 'b11c-' : 'b11r-')
    ) {
      throw new B11FixtureError(
        'B11_FIXTURE_PROFILE_ISOLATION_INVALID',
        'Namespace contains cross-profile resources or uses the wrong prefix',
        profile,
      );
    }
  }

  private async readOnlySnapshot(
    profile: B11Profile,
    namespace: string,
  ): Promise<string> {
    const accountNames = B11_ROLES.map((role) =>
      accountNameFor(profile, namespace, role),
    );
    const subjectCodes = this.subjectCodes(profile, namespace);
    const users = await this.models.users
      .find({ accountName: { $in: accountNames } })
      .select({ passwordHash: 0 })
      .sort({ accountName: 1, _id: 1 })
      .lean()
      .exec();
    const userIds = users.map(({ _id }) => _id);
    const patients = await this.models.patients
      .find({ subjectCode: { $in: subjectCodes } })
      .sort({ subjectCode: 1, _id: 1 })
      .lean()
      .exec();
    const patientIds = patients.map(({ _id }) => _id);
    const visits = await this.models.visits
      .find({ patientId: { $in: patientIds } })
      .sort({ visitCode: 1, _id: 1 })
      .lean()
      .exec();
    const visitIds = visits.map(({ _id }) => _id);
    const ownership = this.ownershipFilter(patientIds, visitIds);
    const [sessions, instances, reports] = await Promise.all([
      this.models.sessions
        .find({ userId: { $in: userIds } })
        .select({ tokenHash: 0 })
        .sort({ _id: 1 })
        .lean()
        .exec(),
      patientIds.length || visitIds.length
        ? this.models.scaleInstances
            .find(ownership)
            .sort({ instanceCode: 1, _id: 1 })
            .lean()
            .exec()
        : [],
      patientIds.length || visitIds.length
        ? this.models.reports
            .find(ownership)
            .sort({ reportCode: 1, _id: 1 })
            .lean()
            .exec()
        : [],
    ]);
    return stableB11Hash({
      users,
      sessions,
      patients,
      visits,
      instances,
      reports,
    });
  }

  private subjectCodes(profile: B11Profile, namespace: string): string[] {
    return scenariosFor(profile).flatMap((scenario) =>
      scenario.routes.map((routeValue) =>
        subjectCodeFor(
          profile,
          namespace,
          scenario.scenarioKey,
          routeValue.key,
        ),
      ),
    );
  }

  private ownershipFilter(
    patientIds: readonly Types.ObjectId[],
    visitIds: readonly Types.ObjectId[],
  ) {
    return {
      $or: [
        { patientId: { $in: patientIds } },
        { assessmentVisitId: { $in: visitIds } },
      ],
    };
  }

  private async assertNoUnexpectedRoots(
    profile: B11Profile,
    namespace: string,
    expectedSubjectCodes: readonly string[],
  ): Promise<void> {
    const markedPatients = await this.models.patients
      .find({ 'metadata.b11Fixture.namespace': namespace })
      .select({ subjectCode: 1, metadata: 1 })
      .lean()
      .exec();
    const expected = new Set(expectedSubjectCodes);
    const invalid = markedPatients.some((patient) => {
      const marker = isRecord(patient.metadata)
        ? patient.metadata.b11Fixture
        : null;
      return (
        !expected.has(patient.subjectCode) ||
        !isRecord(marker) ||
        marker.profile !== profile ||
        marker.namespace !== namespace
      );
    });
    if (invalid || markedPatients.length > expectedSubjectCodes.length) {
      throw new B11FixtureError(
        'B11_FIXTURE_CLEANUP_SCOPE_UNSAFE',
        'Cleanup found unexpected namespace ownership and refused broad deletion',
        profile,
      );
    }
  }

  private async countResiduals(input: {
    profile: B11Profile;
    namespace: string;
    accountNames: readonly string[];
    subjectCodes: readonly string[];
    userIds: readonly Types.ObjectId[];
    patientIds: readonly Types.ObjectId[];
    visitIds: readonly Types.ObjectId[];
  }): Promise<number> {
    const ownership = this.ownershipFilter(input.patientIds, input.visitIds);
    const counts = await Promise.all([
      this.models.users.countDocuments({
        $or: [
          { accountName: { $in: input.accountNames } },
          { 'metadata.b11Fixture.namespace': input.namespace },
        ],
      }),
      this.models.sessions.countDocuments({
        userId: { $in: input.userIds },
      }),
      this.models.patients.countDocuments({
        $or: [
          { subjectCode: { $in: input.subjectCodes } },
          { 'metadata.b11Fixture.namespace': input.namespace },
        ],
      }),
      this.models.visits.countDocuments({ _id: { $in: input.visitIds } }),
      this.models.scaleInstances.countDocuments(ownership),
      this.models.reports.countDocuments(ownership),
      this.models.reports.countDocuments({
        'metadata.b11FixtureOwnership.namespace': input.namespace,
        'metadata.b11FixtureOwnership.profile': input.profile,
      }),
    ]);
    return counts.reduce((sum, count) => sum + count, 0);
  }

  private stageMarker(input: {
    profile: B11Profile;
    namespace: string;
    scenarioKey: string;
    routeKey: string;
    transition: B11StageTransition;
  }): OwnershipMarker & { transition: B11StageTransition } {
    return {
      version: 1,
      profile: input.profile,
      namespace: input.namespace,
      scenarioKey: input.scenarioKey,
      routeKey: input.routeKey,
      transition: input.transition,
    };
  }

  private async isExactStageApplied(input: {
    profile: B11Profile;
    namespace: string;
    scenarioKey: string;
    routeKey: string;
    transition: B11StageTransition;
  }): Promise<boolean> {
    if (input.transition === 'confirmation-conflict-touch') {
      const root = await this.requireRoot(
        input.profile,
        input.namespace,
        input.scenarioKey,
        input.routeKey,
      );
      const marker = isRecord(root.report.metadata)
        ? root.report.metadata.b11FixtureStage
        : null;
      return (
        isRecord(marker) &&
        stableB11Hash(marker) === stableB11Hash(this.stageMarker(input))
      );
    }
    const user = await this.models.users
      .findOne({
        accountName: accountNameFor(input.profile, input.namespace, 'doctor'),
      })
      .exec();
    const marker = isRecord(user?.metadata)
      ? user?.metadata.b11FixtureStage
      : null;
    return Boolean(
      user &&
      user.userType === 'nurse' &&
      user.roles.length === 1 &&
      user.roles[0] === 'nurse' &&
      isRecord(marker) &&
      stableB11Hash(marker) === stableB11Hash(this.stageMarker(input)),
    );
  }

  private async verifySingleStageIntegrity(input: {
    profile: B11Profile;
    namespace: string;
    password: string;
    scenarioKey: string;
    routeKey: string;
    transition: B11StageTransition;
  }): Promise<void> {
    const roots = await this.requireAllRoots(input.profile, input.namespace);
    for (const root of roots) {
      const baseline = readB11RouteBaseline(
        root,
        input.profile,
        input.namespace,
      );
      const target =
        root.scenarioKey === input.scenarioKey &&
        root.routeKey === input.routeKey;
      const baseContract = routeFor(
        input.profile,
        root.scenarioKey,
        root.routeKey,
      );
      assertB11RouteAgainstBaseline({
        root,
        baseline,
        contract: {
          ...baseContract,
          expectedProductMutationClass: 'none',
          expectedFixtureOwnedMutationClass:
            target && input.transition === 'confirmation-conflict-touch'
              ? 'fixture_confirmation_conflict_touch_only'
              : 'none',
        },
        profile: input.profile,
        namespace: input.namespace,
        phase: 'post-browser',
      });
    }
    if (input.transition === 'forbidden-confirm-role') {
      await this.verifyUsers(
        input.profile,
        input.namespace,
        input.password,
        'post-browser',
      );
    } else {
      await this.verifyUsers(
        input.profile,
        input.namespace,
        input.password,
        'prepared',
      );
    }
  }
}

export function createB11BrowserFixtureManager(
  app: INestApplicationContext,
): B11BrowserFixtureManager {
  const config = app.get(ConfigService);
  const connection = app.get<Connection>(getConnectionToken());
  assertB11RuntimeEnvironment({
    nodeEnv: process.env.NODE_ENV,
    appEnv: config.get<string>('app.env'),
    databasePurpose: process.env.COGMEMORY_DATABASE_PURPOSE,
    databaseName: connection.name,
    storageDriver: config.get<string>('storage.driver'),
    llmProvider: config.get<string>('llm.provider'),
    smsProvider: config.get<string>('smsAuth.provider'),
    sessionCookieSecure: config.get<boolean>('session.cookieSecure'),
  });
  const models: B11Models = {
    users: app.get(getModelToken(User.name)),
    sessions: app.get(getModelToken(Session.name)),
    patients: app.get(getModelToken(Patient.name)),
    visits: app.get(getModelToken(AssessmentVisit.name)),
    scaleInstances: app.get(getModelToken(ScaleInstance.name)),
    reports: app.get(getModelToken(ClinicalReport.name)),
    scaleDefinitions: app.get(getModelToken(ScaleDefinition.name)),
    scaleVersions: app.get(getModelToken(ScaleVersion.name)),
  };
  return new B11BrowserFixtureManager(
    connection.name,
    models,
    app.get(AuthService),
    app.get(ScaleCatalogService),
    app.get(ReportsService),
    app.get(ClinicalReportPublicMapper),
  );
}
