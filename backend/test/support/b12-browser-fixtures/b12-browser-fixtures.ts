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
import { buildClinicalReportLockMetadata } from '../../../src/modules/reports/lib/clinical-report-lock';
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
  assertB12Contract,
  assertB12RuntimeEnvironment,
  assertB12RuntimeTarget,
  assertB12StageTarget,
  displayNameFor,
  requireB12FixturePassword,
  routeFor,
  routeOrdinalFor,
  scenariosFor,
  subjectCodeFor,
  validateB12Namespace,
  visitCodeFor,
} from './fixture-contract';
import {
  B12_BASE_DATE,
  B12FixtureBuilder,
  b12RouteDate,
  type B12FixtureModels,
  type B12RouteRoot,
} from './fixture-builder';
import { assertB12SafeOutput, buildB12SafeManifest } from './fixture-manifest';
import {
  assertB12PreparedReport,
  assertB12RouteAgainstBaseline,
  assertB12RouteProgress,
  buildB12RouteBaseline,
  preparedHashForBaselines,
  readB12RouteBaseline,
  stableB12Hash,
  type B12RouteBaseline,
} from './fixture-verifier';
import { cleanupB12RuntimeDescriptors } from './runtime-descriptor';
import {
  B12_ROLES,
  B12FixtureError,
  type B12Profile,
  type B12ProductMutationClass,
  type B12ResourceCounts,
  type B12Role,
  type B12RuntimeDescriptor,
  type B12SafeCleanupSummary,
  type B12SafeManifest,
  type B12SafeStageSummary,
  type B12StageTransition,
  type B12VerifyPhase,
} from './fixture-types';

type B12Models = B12FixtureModels & {
  users: Model<UserDocument>;
  sessions: Model<SessionDocument>;
};

type IdRow = { _id: Types.ObjectId };
type StageMarker = {
  version: 1;
  profile: B12Profile;
  namespace: string;
  scenarioKey: string;
  routeKey: string;
  transition: B12StageTransition;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function actorFor(user: UserDocument, role: 'doctor' | 'admin') {
  return {
    operatorId: user._id.toString(),
    operatorName: user.displayName,
    operatorRole: role,
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

export function isB12ProtectedCanonicalScaleVersion(value: {
  scaleCode?: unknown;
  status?: unknown;
}): boolean {
  return (
    (value.scaleCode === 'mmse' || value.scaleCode === 'moca') &&
    value.status === 'active'
  );
}

export class B12BrowserFixtureManager {
  constructor(
    private readonly databaseName: string,
    private readonly models: B12Models,
    private readonly authService: AuthService,
    private readonly scaleCatalog: ScaleCatalogService,
    private readonly reportsService: ReportsService,
    private readonly publicMapper: ClinicalReportPublicMapper,
  ) {}

  async prepare(
    profile: B12Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B12SafeManifest> {
    const namespace = validateB12Namespace(profile, rawNamespace);
    const password = requireB12FixturePassword(rawPassword);
    assertB12Contract();
    await this.assertNamespaceUnused(profile, namespace);
    await this.ensureCanonicalSeedReadiness();
    const canonicalSeedHash = await this.canonicalSeedHash();
    try {
      const users = await this.createUsers(profile, namespace, password);
      const doctor = users.get('doctor');
      if (!doctor) {
        throw new B12FixtureError(
          'B12_FIXTURE_ACCOUNT_CREATION_FAILED',
          'The fixed doctor fixture account was not created',
          profile,
        );
      }
      await new B12FixtureBuilder(profile, namespace, this.models).buildAll(
        doctor,
      );
      await this.recordBaselines(profile, namespace, canonicalSeedHash);
      if ((await this.canonicalSeedHash()) !== canonicalSeedHash) {
        throw new B12FixtureError(
          'B12_FIXTURE_CANONICAL_SEED_DRIFT',
          'B12 preparation changed the protected canonical seed',
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
    profile: B12Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B12SafeManifest> {
    const namespace = validateB12Namespace(profile, rawNamespace);
    const password = requireB12FixturePassword(rawPassword);
    await this.cleanup(profile, namespace);
    return this.prepare(profile, namespace, password);
  }

  async verify(
    profile: B12Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
    phase: B12VerifyPhase,
  ): Promise<B12SafeManifest> {
    return this.verifyInternal(
      profile,
      validateB12Namespace(profile, rawNamespace),
      requireB12FixturePassword(rawPassword),
      phase,
    );
  }

  async stage(input: {
    profile: B12Profile;
    namespace: string;
    password: string | undefined;
    scenarioKey: string | undefined;
    routeKey: string | undefined;
    transition: string | undefined;
    role: B12Role | undefined;
  }): Promise<B12SafeStageSummary> {
    const namespace = validateB12Namespace(input.profile, input.namespace);
    const password = requireB12FixturePassword(input.password);
    const stageTarget = {
      profile: input.profile,
      scenarioKey: input.scenarioKey,
      routeKey: input.routeKey,
      transition: input.transition,
      role: input.role,
    };
    assertB12StageTarget(stageTarget);
    const { scenarioKey, routeKey, transition, role } = stageTarget;
    const seedBefore = await this.canonicalSeedHash();
    const alreadyStaged = await this.isExactStageApplied({
      profile: input.profile,
      namespace,
      scenarioKey,
      routeKey,
      transition,
    });
    await this.verifyPreStageProgress({
      profile: input.profile,
      namespace,
      password,
      scenarioKey,
      routeKey,
      transition,
      alreadyStaged,
    });
    if (!alreadyStaged) {
      await this.applyStage({
        profile: input.profile,
        namespace,
        scenarioKey,
        routeKey,
        transition,
      });
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
      throw new B12FixtureError(
        'B12_FIXTURE_CANONICAL_SEED_DRIFT',
        'B12 Stage changed the protected canonical seed',
        input.profile,
        scenarioKey,
        routeKey,
      );
    }
    const summary: B12SafeStageSummary = {
      version: 1,
      batch: 'B12',
      profile: input.profile,
      scenarioKey,
      routeKey,
      transition,
      role,
      staged: true,
      alreadyStaged,
      preStageProgressVerified: true,
      canonicalSeedHashUnchanged: true,
    };
    assertB12SafeOutput(summary);
    return summary;
  }

  async resolveRuntimeDescriptor(input: {
    profile: B12Profile;
    namespace: string;
    password: string | undefined;
    scenarioKey: string;
    routeKey: string;
    role: B12Role;
  }): Promise<B12RuntimeDescriptor> {
    const namespace = validateB12Namespace(input.profile, input.namespace);
    const password = requireB12FixturePassword(input.password);
    const routeValue = assertB12RuntimeTarget(input);
    await this.verifyInternal(input.profile, namespace, password, 'prepared');
    const root = await this.requireRoot(
      input.profile,
      namespace,
      input.scenarioKey,
      input.routeKey,
    );
    const includeSecondary =
      routeValue.secondaryRole !== null &&
      routeValue.primaryRole === input.role;
    return {
      version: 1,
      batch: 'B12',
      profile: input.profile,
      scenarioKey: input.scenarioKey,
      routeKey: input.routeKey,
      primaryRole: input.role,
      ...(includeSecondary && routeValue.secondaryRole
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
    profile: B12Profile,
    rawNamespace: string,
  ): Promise<B12SafeCleanupSummary> {
    const namespace = validateB12Namespace(profile, rawNamespace);
    const seedBefore = await this.canonicalSeedHash();
    const accountNames = B12_ROLES.map((role) =>
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
    const runtimeDescriptorsRemoved = await cleanupB12RuntimeDescriptors(
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
      throw new B12FixtureError(
        'B12_FIXTURE_CLEANUP_INCOMPLETE',
        'Cleanup left namespace-owned resources or changed canonical seed',
        profile,
      );
    }
    const summary: B12SafeCleanupSummary = {
      version: 1,
      batch: 'B12',
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
    assertB12SafeOutput(summary);
    return summary;
  }

  async simulatePostBrowserForE2e(
    profile: B12Profile,
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<void> {
    const namespace = validateB12Namespace(profile, rawNamespace);
    const password = requireB12FixturePassword(rawPassword);
    for (const scenario of scenariosFor(profile)) {
      for (const routeValue of scenario.routes) {
        if (routeValue.expectedFixtureOwnedMutationClass !== 'none') {
          await this.stage({
            profile,
            namespace,
            password,
            scenarioKey: scenario.scenarioKey,
            routeKey: routeValue.key,
            transition: routeValue.allowedStages[0],
            role: 'doctor',
          });
        }
        if (
          routeValue.expectedProductMutationClass !== 'none' &&
          routeValue.expectedProductMutationClass !== 'already_locked_readonly'
        ) {
          await this.simulateProductMutation({
            profile,
            namespace,
            scenarioKey: scenario.scenarioKey,
            routeKey: routeValue.key,
            mutation: routeValue.expectedProductMutationClass,
          });
        }
      }
    }
  }

  async simulateProductMutationForE2e(input: {
    profile: B12Profile;
    namespace: string;
    password: string | undefined;
    scenarioKey: string;
    routeKey: string;
  }): Promise<void> {
    const namespace = validateB12Namespace(input.profile, input.namespace);
    requireB12FixturePassword(input.password);
    const contract = routeFor(input.profile, input.scenarioKey, input.routeKey);
    if (
      contract.expectedProductMutationClass === 'none' ||
      contract.expectedProductMutationClass === 'already_locked_readonly'
    ) {
      throw new B12FixtureError(
        'B12_FIXTURE_SIMULATION_TARGET_INVALID',
        'Simulation target must have one fixed product lock mutation contract',
        input.profile,
        input.scenarioKey,
        input.routeKey,
      );
    }
    await this.simulateProductMutation({
      profile: input.profile,
      namespace,
      scenarioKey: input.scenarioKey,
      routeKey: input.routeKey,
      mutation: contract.expectedProductMutationClass,
    });
  }

  private async simulateProductMutation(input: {
    profile: B12Profile;
    namespace: string;
    scenarioKey: string;
    routeKey: string;
    mutation: Exclude<
      B12ProductMutationClass,
      'none' | 'already_locked_readonly'
    >;
  }): Promise<void> {
    const role = input.mutation === 'lock_once_admin' ? 'admin' : 'doctor';
    const contract = routeFor(input.profile, input.scenarioKey, input.routeKey);
    if (
      contract.expectedFixtureOwnedMutationClass !== 'none' &&
      !(await this.isExactStageApplied({
        profile: input.profile,
        namespace: input.namespace,
        scenarioKey: input.scenarioKey,
        routeKey: input.routeKey,
        transition: contract.allowedStages[0],
      }))
    ) {
      throw new B12FixtureError(
        'B12_FIXTURE_SIMULATION_STAGE_REQUIRED',
        'Conflict product simulation requires its exact allowlisted Stage first',
        input.profile,
        input.scenarioKey,
        input.routeKey,
      );
    }
    const actorUser = await this.models.users
      .findOne({
        accountName: accountNameFor(input.profile, input.namespace, role),
      })
      .exec();
    if (!actorUser) {
      throw new B12FixtureError(
        'B12_FIXTURE_ACCOUNT_INVALID',
        'Simulation actor is missing',
        input.profile,
        input.scenarioKey,
        input.routeKey,
      );
    }
    const root = await this.requireRoot(
      input.profile,
      input.namespace,
      input.scenarioKey,
      input.routeKey,
    );
    const report = await this.requireReportSummary(root);
    const ordinal = routeOrdinalFor(
      input.profile,
      input.scenarioKey,
      input.routeKey,
    );
    const lockedAt = b12RouteDate(ordinal, 550_000);
    const mutation = buildClinicalReportLockMetadata({
      report,
      lockId: `10000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`,
      lockedAt,
      actor: actorFor(actorUser, role),
      lockNote:
        'B12 synthetic simulated lock process text with no clinical meaning.',
    });
    const result = await this.models.reports.updateOne(
      {
        _id: root.report._id,
        status: 'confirmed',
        lockedAt: null,
        lockedBy: null,
      },
      {
        $set: {
          lockedAt: mutation.lockedAt,
          lockedBy: actorUser._id,
          metadata: mutation.metadata,
          updatedAt: lockedAt,
        },
      },
      { runValidators: true, timestamps: false },
    );
    if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
      throw new B12FixtureError(
        'B12_FIXTURE_SIMULATION_PRECONDITION_INVALID',
        'Product lock simulation requires exactly one confirmed unlocked report',
        input.profile,
        input.scenarioKey,
        input.routeKey,
      );
    }
  }

  private async verifyInternal(
    profile: B12Profile,
    namespace: string,
    password: string,
    phase: B12VerifyPhase,
  ): Promise<B12SafeManifest> {
    assertB12Contract();
    const before = await this.readOnlySnapshot(profile, namespace);
    const roles = await this.verifyUsers(profile, namespace, password, phase);
    await this.verifyProfileIsolation(profile, namespace);
    const canonicalSeedHash = await this.canonicalSeedHash();
    const roots = await this.requireAllRoots(profile, namespace);
    const baselines: B12RouteBaseline[] = [];
    for (const root of roots) {
      const contract = routeFor(profile, root.scenarioKey, root.routeKey);
      const baseline = readB12RouteBaseline(root, profile, namespace);
      if (baseline.canonicalSeedHash !== canonicalSeedHash) {
        throw new B12FixtureError(
          'B12_FIXTURE_CANONICAL_SEED_DRIFT',
          'Canonical seed differs from the route baseline',
          profile,
          root.scenarioKey,
          root.routeKey,
          phase,
        );
      }
      if (phase === 'prepared') {
        const reportSummary = await this.requireReportSummary(root);
        const publicReport = this.publicMapper.toPublicReport(reportSummary);
        assertB12PreparedReport({
          root,
          reportSummary,
          profile,
          namespace,
          contract,
          publicIsFinal: publicReport.isFinal,
          publicLock: publicReport.lock,
        });
        const current = buildB12RouteBaseline({
          root,
          profile,
          namespace,
          contract,
          canonicalSeedHash,
        });
        if (stableB12Hash(current) !== stableB12Hash(baseline)) {
          throw new B12FixtureError(
            'B12_FIXTURE_PREPARED_DRIFT',
            'Prepared route differs from its recorded field-level baseline',
            profile,
            root.scenarioKey,
            root.routeKey,
            phase,
          );
        }
      } else {
        const reportSummary = await this.requireReportSummary(root);
        assertB12RouteAgainstBaseline({
          root,
          reportSummary,
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
      throw new B12FixtureError(
        'B12_FIXTURE_VERIFY_MUTATED_DATA',
        'Verifier must not create, repair, remove, or update fixture data',
        profile,
        undefined,
        undefined,
        phase,
      );
    }
    return buildB12SafeManifest({
      profile,
      phase,
      roles,
      resourceCounts: await this.resourceCounts(profile, namespace),
      preparedHash: preparedHashForBaselines(baselines),
      canonicalSeedHash,
    });
  }

  private async recordBaselines(
    profile: B12Profile,
    namespace: string,
    canonicalSeedHash: string,
  ): Promise<void> {
    const roots = await this.requireAllRoots(profile, namespace);
    for (const root of roots) {
      const contract = routeFor(profile, root.scenarioKey, root.routeKey);
      const reportSummary = await this.requireReportSummary(root);
      const publicReport = this.publicMapper.toPublicReport(reportSummary);
      assertB12PreparedReport({
        root,
        reportSummary,
        profile,
        namespace,
        contract,
        publicIsFinal: publicReport.isFinal,
        publicLock: publicReport.lock,
      });
      const baseline = buildB12RouteBaseline({
        root,
        profile,
        namespace,
        contract,
        canonicalSeedHash,
      });
      const result = await this.models.patients.updateOne(
        {
          _id: root.patient._id,
          'metadata.b12Fixture.baseline': { $exists: false },
        },
        { $set: { 'metadata.b12Fixture.baseline': baseline } },
        { runValidators: true },
      );
      if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
        throw new B12FixtureError(
          'B12_FIXTURE_BASELINE_RECORD_FAILED',
          'Each route must record exactly one immutable baseline marker',
          profile,
          root.scenarioKey,
          root.routeKey,
        );
      }
    }
  }

  private async createUsers(
    profile: B12Profile,
    namespace: string,
    password: string,
  ): Promise<Map<B12Role, UserDocument>> {
    const result = new Map<B12Role, UserDocument>();
    for (const role of B12_ROLES) {
      const user = await this.models.users.create({
        accountName: accountNameFor(profile, namespace, role),
        displayName: displayNameFor(profile, role),
        staffCode: `${
          profile === 'core-workflow' ? 'B12CFX' : 'B12RFX'
        }-${namespace}-${role}`,
        passwordHash: await this.authService.hashPassword(password),
        passwordChangedAt: B12_BASE_DATE,
        roles: [role],
        permissions: [],
        userType: role,
        status: 'active',
        failedLoginCount: 0,
        lockedUntil: null,
        metadata: {
          b12Fixture: { version: 1, profile, namespace, role },
        },
      });
      result.set(role, user);
    }
    return result;
  }

  private async verifyUsers(
    profile: B12Profile,
    namespace: string,
    password: string,
    phase: B12VerifyPhase,
  ): Promise<B12Role[]> {
    const result: B12Role[] = [];
    for (const role of B12_ROLES) {
      const user = await this.models.users
        .findOne({ accountName: accountNameFor(profile, namespace, role) })
        .select('+passwordHash')
        .exec();
      const forbiddenDoctor =
        phase === 'post-browser' &&
        profile === 'resilience-security' &&
        role === 'doctor';
      if (
        !user ||
        user.status !== 'active' ||
        user.permissions.length !== 0 ||
        !(await this.authService.verifyPassword(password, user.passwordHash)) ||
        (forbiddenDoctor
          ? user.userType !== 'nurse' ||
            user.roles.length !== 1 ||
            user.roles[0] !== 'nurse'
          : user.userType !== role ||
            user.roles.length !== 1 ||
            user.roles[0] !== role)
      ) {
        throw new B12FixtureError(
          'B12_FIXTURE_ACCOUNT_INVALID',
          `Fixture account for role ${role} is missing or invalid`,
          profile,
          'roles',
          role,
          phase,
        );
      }
      result.push(role);
    }
    return result;
  }

  private async requireAllRoots(
    profile: B12Profile,
    namespace: string,
  ): Promise<B12RouteRoot[]> {
    const roots: B12RouteRoot[] = [];
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
    profile: B12Profile,
    namespace: string,
    scenarioKey: string,
    routeKey: string,
  ): Promise<B12RouteRoot> {
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
      throw new B12FixtureError(
        'B12_FIXTURE_ROOT_MATRIX_INVALID',
        'Each fixed B12 route requires one independent Patient, Visit, ScaleInstance, ClinicalReport, and marker',
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
    profile: B12Profile,
    namespace: string,
    roots: readonly B12RouteRoot[],
  ): Promise<void> {
    const expectedRoutes = scenariosFor(profile).flatMap(
      ({ routes }) => routes,
    ).length;
    const counts = await this.resourceCounts(profile, namespace);
    const unique = (values: readonly { _id: Types.ObjectId }[]): number =>
      new Set(values.map(({ _id }) => _id.toString())).size;
    if (
      roots.length !== expectedRoutes ||
      unique(roots.map(({ patient }) => patient)) !== expectedRoutes ||
      unique(roots.map(({ visit }) => visit)) !== expectedRoutes ||
      unique(roots.map(({ instance }) => instance)) !== expectedRoutes ||
      unique(roots.map(({ report }) => report)) !== expectedRoutes ||
      counts.users !== 5 ||
      counts.patients !== expectedRoutes ||
      counts.visits !== expectedRoutes ||
      counts.scaleInstances !== expectedRoutes ||
      counts.clinicalReports !== expectedRoutes ||
      counts.fixtureMarkers !== expectedRoutes
    ) {
      throw new B12FixtureError(
        'B12_FIXTURE_RESOURCE_COUNT_INVALID',
        'B12 profile resource counts or writable-report independence differ from contract',
        profile,
      );
    }
  }

  private async resourceCounts(
    profile: B12Profile,
    namespace: string,
  ): Promise<B12ResourceCounts> {
    const accountNames = B12_ROLES.map((role) =>
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
          'metadata.b12Fixture.profile': profile,
          'metadata.b12Fixture.namespace': namespace,
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

  private async requireReportSummary(root: B12RouteRoot) {
    const summary = await this.reportsService.findReportByOwnership({
      reportId: root.report._id.toString(),
      patientId: root.patient._id.toString(),
      assessmentVisitId: root.visit._id.toString(),
    });
    if (!summary) {
      throw new B12FixtureError(
        'B12_FIXTURE_REPORT_STATE_INVALID',
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
    return stableB12Hash(
      canonicalSeedDocument({
        definitions,
        versions: versions.filter(isB12ProtectedCanonicalScaleVersion),
      }),
    );
  }

  private async assertNamespaceUnused(
    profile: B12Profile,
    namespace: string,
  ): Promise<void> {
    const counts = await this.resourceCounts(profile, namespace);
    const owned = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const markedUsers = await this.models.users.countDocuments({
      'metadata.b12Fixture.namespace': namespace,
    });
    const markedPatients = await this.models.patients.countDocuments({
      'metadata.b12Fixture.namespace': namespace,
    });
    if (owned + markedUsers + markedPatients !== 0) {
      throw new B12FixtureError(
        'B12_FIXTURE_NAMESPACE_EXISTS',
        'Namespace already contains fixture-owned resources; use explicit replace',
        profile,
      );
    }
  }

  private async verifyProfileIsolation(
    profile: B12Profile,
    namespace: string,
  ): Promise<void> {
    const otherPrefix = profile === 'core-workflow' ? 'b12r-' : 'b12c-';
    const [wrongUsers, wrongPatients] = await Promise.all([
      this.models.users.countDocuments({
        'metadata.b12Fixture.namespace': namespace,
        'metadata.b12Fixture.profile': { $ne: profile },
      }),
      this.models.patients.countDocuments({
        'metadata.b12Fixture.namespace': namespace,
        'metadata.b12Fixture.profile': { $ne: profile },
      }),
    ]);
    if (wrongUsers + wrongPatients !== 0 || namespace.startsWith(otherPrefix)) {
      throw new B12FixtureError(
        'B12_FIXTURE_PROFILE_ISOLATION_INVALID',
        'Namespace contains cross-profile resources or uses the wrong prefix',
        profile,
      );
    }
  }

  private async readOnlySnapshot(
    profile: B12Profile,
    namespace: string,
  ): Promise<string> {
    const accountNames = B12_ROLES.map((role) =>
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
    return stableB12Hash({
      users,
      sessions,
      patients,
      visits,
      instances,
      reports,
    });
  }

  private subjectCodes(profile: B12Profile, namespace: string): string[] {
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
    profile: B12Profile,
    namespace: string,
    expectedSubjectCodes: readonly string[],
  ): Promise<void> {
    const markedPatients = await this.models.patients
      .find({ 'metadata.b12Fixture.namespace': namespace })
      .select({ subjectCode: 1, metadata: 1 })
      .lean()
      .exec();
    const expected = new Set(expectedSubjectCodes);
    const invalid = markedPatients.some((patient) => {
      const marker = isRecord(patient.metadata)
        ? patient.metadata.b12Fixture
        : null;
      return (
        !expected.has(patient.subjectCode) ||
        !isRecord(marker) ||
        marker.profile !== profile ||
        marker.namespace !== namespace
      );
    });
    if (invalid || markedPatients.length > expectedSubjectCodes.length) {
      throw new B12FixtureError(
        'B12_FIXTURE_CLEANUP_SCOPE_UNSAFE',
        'Cleanup found unexpected namespace ownership and refused broad deletion',
        profile,
      );
    }
  }

  private async countResiduals(input: {
    profile: B12Profile;
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
          { 'metadata.b12Fixture.namespace': input.namespace },
        ],
      }),
      this.models.sessions.countDocuments({ userId: { $in: input.userIds } }),
      this.models.patients.countDocuments({
        $or: [
          { subjectCode: { $in: input.subjectCodes } },
          { 'metadata.b12Fixture.namespace': input.namespace },
        ],
      }),
      this.models.visits.countDocuments({ _id: { $in: input.visitIds } }),
      this.models.scaleInstances.countDocuments(ownership),
      this.models.reports.countDocuments(ownership),
      this.models.reports.countDocuments({
        'metadata.b12FixtureOwnership.namespace': input.namespace,
        'metadata.b12FixtureOwnership.profile': input.profile,
      }),
    ]);
    return counts.reduce((sum, count) => sum + count, 0);
  }

  private stageMarker(input: {
    profile: B12Profile;
    namespace: string;
    scenarioKey: string;
    routeKey: string;
    transition: B12StageTransition;
  }): StageMarker {
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
    profile: B12Profile;
    namespace: string;
    scenarioKey: string;
    routeKey: string;
    transition: B12StageTransition;
  }): Promise<boolean> {
    const root = await this.requireRoot(
      input.profile,
      input.namespace,
      input.scenarioKey,
      input.routeKey,
    );
    const fixture = isRecord(root.patient.metadata)
      ? root.patient.metadata.b12Fixture
      : null;
    const marker = isRecord(fixture) ? fixture.stage : null;
    if (
      !isRecord(marker) ||
      stableB12Hash(marker) !== stableB12Hash(this.stageMarker(input))
    ) {
      return false;
    }
    const ordinal = routeOrdinalFor(
      input.profile,
      input.scenarioKey,
      input.routeKey,
    );
    const stageTime = b12RouteDate(ordinal, 500_000).getTime();
    const reportUpdatedAt = (
      root.report as typeof root.report & { updatedAt?: Date }
    ).updatedAt;
    if (
      input.transition === 'lock-conflict-touch' ||
      input.transition === 'lock-conflict-latest-locked-touch'
    ) {
      return (
        root.report.lockedAt === null &&
        root.report.lockedBy === null &&
        reportUpdatedAt?.getTime() === stageTime
      );
    }
    if (input.transition === 'lock-audit-unavailable') {
      return (
        root.report.lockedAt?.getTime() === stageTime &&
        root.report.lockedBy === null &&
        reportUpdatedAt?.getTime() === stageTime
      );
    }
    if (input.transition === 'lock-metadata-unsupported') {
      return (
        stableB12Hash(root.report.metadata) ===
          stableB12Hash({
            a20Generation: { b12UnsupportedRoot: true },
          }) && reportUpdatedAt?.getTime() === stageTime
      );
    }
    const doctor = await this.models.users
      .findOne({
        accountName: accountNameFor(input.profile, input.namespace, 'doctor'),
      })
      .exec();
    return Boolean(
      doctor &&
      doctor.userType === 'nurse' &&
      doctor.roles.length === 1 &&
      doctor.roles[0] === 'nurse',
    );
  }

  private async applyStage(input: {
    profile: B12Profile;
    namespace: string;
    scenarioKey: string;
    routeKey: string;
    transition: B12StageTransition;
  }): Promise<void> {
    const root = await this.requireRoot(
      input.profile,
      input.namespace,
      input.scenarioKey,
      input.routeKey,
    );
    const ordinal = routeOrdinalFor(
      input.profile,
      input.scenarioKey,
      input.routeKey,
    );
    const stageTime = b12RouteDate(ordinal, 500_000);
    let reportResult: { matchedCount: number; modifiedCount: number } | null =
      null;
    if (
      input.transition === 'lock-conflict-touch' ||
      input.transition === 'lock-conflict-latest-locked-touch'
    ) {
      reportResult = await this.models.reports.updateOne(
        {
          _id: root.report._id,
          status: 'confirmed',
          qualityStatus: 'passed',
          lockedAt: null,
          lockedBy: null,
        },
        { $set: { updatedAt: stageTime } },
        { runValidators: true, timestamps: false },
      );
    } else if (input.transition === 'lock-audit-unavailable') {
      reportResult = await this.models.reports.updateOne(
        {
          _id: root.report._id,
          status: 'confirmed',
          qualityStatus: 'passed',
          lockedAt: null,
          lockedBy: null,
        },
        {
          $set: {
            lockedAt: stageTime,
            lockedBy: null,
            updatedAt: stageTime,
          },
        },
        { runValidators: true, timestamps: false },
      );
    } else if (input.transition === 'lock-metadata-unsupported') {
      reportResult = await this.models.reports.updateOne(
        {
          _id: root.report._id,
          status: 'confirmed',
          qualityStatus: 'passed',
          lockedAt: null,
          lockedBy: null,
        },
        {
          $set: {
            metadata: {
              a20Generation: { b12UnsupportedRoot: true },
            },
            updatedAt: stageTime,
          },
        },
        { runValidators: true, timestamps: false },
      );
    } else {
      const accountName = accountNameFor(
        input.profile,
        input.namespace,
        'doctor',
      );
      reportResult = { matchedCount: 1, modifiedCount: 1 };
      const userResult = await this.models.users.updateOne(
        {
          accountName,
          roles: ['doctor'],
          userType: 'doctor',
        },
        { $set: { roles: ['nurse'], userType: 'nurse' } },
        { runValidators: true },
      );
      if (userResult.matchedCount !== 1 || userResult.modifiedCount !== 1) {
        throw new B12FixtureError(
          'B12_FIXTURE_STAGE_PRECONDITION_INVALID',
          'Forbidden lock Stage requires the exact logged-in doctor account baseline',
          input.profile,
          input.scenarioKey,
          input.routeKey,
        );
      }
    }
    if (reportResult.matchedCount !== 1 || reportResult.modifiedCount !== 1) {
      throw new B12FixtureError(
        'B12_FIXTURE_STAGE_PRECONDITION_INVALID',
        'Stage requires the exact confirmed unlocked report baseline',
        input.profile,
        input.scenarioKey,
        input.routeKey,
      );
    }
    const markerResult = await this.models.patients.updateOne(
      {
        _id: root.patient._id,
        'metadata.b12Fixture.stage': { $exists: false },
      },
      {
        $set: {
          'metadata.b12Fixture.stage': this.stageMarker(input),
        },
      },
      { runValidators: true, timestamps: false },
    );
    if (markerResult.matchedCount !== 1 || markerResult.modifiedCount !== 1) {
      throw new B12FixtureError(
        'B12_FIXTURE_STAGE_MARKER_FAILED',
        'Stage must record exactly one independent fixture marker',
        input.profile,
        input.scenarioKey,
        input.routeKey,
      );
    }
  }

  private async verifyPreStageProgress(input: {
    profile: B12Profile;
    namespace: string;
    password: string;
    scenarioKey: string;
    routeKey: string;
    transition: B12StageTransition;
    alreadyStaged: boolean;
  }): Promise<void> {
    await this.verifyStageProgressIntegrity({
      ...input,
      targetStaged: input.alreadyStaged,
    });
  }

  private async verifyStageProgressIntegrity(input: {
    profile: B12Profile;
    namespace: string;
    password: string;
    scenarioKey: string;
    routeKey: string;
    transition: B12StageTransition;
    targetStaged: boolean;
  }): Promise<void> {
    assertB12Contract();
    const before = await this.readOnlySnapshot(input.profile, input.namespace);
    await this.verifyUsers(
      input.profile,
      input.namespace,
      input.password,
      input.targetStaged && input.transition === 'forbidden-lock-role'
        ? 'post-browser'
        : 'prepared',
    );
    await this.verifyProfileIsolation(input.profile, input.namespace);
    const canonicalSeedHash = await this.canonicalSeedHash();
    const roots = await this.requireAllRoots(input.profile, input.namespace);
    for (const root of roots) {
      const baseline = readB12RouteBaseline(
        root,
        input.profile,
        input.namespace,
      );
      if (baseline.canonicalSeedHash !== canonicalSeedHash) {
        throw new B12FixtureError(
          'B12_FIXTURE_CANONICAL_SEED_DRIFT',
          'Canonical seed differs from the route baseline during Stage progress verification',
          input.profile,
          root.scenarioKey,
          root.routeKey,
        );
      }
      const target =
        root.scenarioKey === input.scenarioKey &&
        root.routeKey === input.routeKey;
      const state = assertB12RouteProgress({
        root,
        reportSummary: await this.requireReportSummary(root),
        baseline,
        contract: routeFor(input.profile, root.scenarioKey, root.routeKey),
        profile: input.profile,
        namespace: input.namespace,
        target,
        targetStaged: target && input.targetStaged,
      });
      if (
        target &&
        state !== (input.targetStaged ? 'target-staged' : 'prepared')
      ) {
        throw new B12FixtureError(
          'B12_FIXTURE_STAGE_PRECONDITION_INVALID',
          'Stage target differs from its exact required progress state',
          input.profile,
          input.scenarioKey,
          input.routeKey,
        );
      }
    }
    await this.verifyRootCounts(input.profile, input.namespace, roots);
    const after = await this.readOnlySnapshot(input.profile, input.namespace);
    if (after !== before) {
      throw new B12FixtureError(
        'B12_FIXTURE_VERIFY_MUTATED_DATA',
        'Stage progress verification must remain read-only',
        input.profile,
        input.scenarioKey,
        input.routeKey,
      );
    }
  }

  private async verifySingleStageIntegrity(input: {
    profile: B12Profile;
    namespace: string;
    password: string;
    scenarioKey: string;
    routeKey: string;
    transition: B12StageTransition;
  }): Promise<void> {
    await this.verifyStageProgressIntegrity({
      ...input,
      targetStaged: true,
    });
  }
}

export function createB12BrowserFixtureManager(
  app: INestApplicationContext,
): B12BrowserFixtureManager {
  const config = app.get(ConfigService);
  const connection = app.get<Connection>(getConnectionToken());
  assertB12RuntimeEnvironment({
    nodeEnv: process.env.NODE_ENV,
    appEnv: config.get<string>('app.env'),
    databasePurpose: process.env.COGMEMORY_DATABASE_PURPOSE,
    databaseName: connection.name,
    storageDriver: config.get<string>('storage.driver'),
    llmProvider: config.get<string>('llm.provider'),
    smsProvider: config.get<string>('smsAuth.provider'),
    sessionCookieSecure: config.get<boolean>('session.cookieSecure'),
  });
  const models: B12Models = {
    users: app.get(getModelToken(User.name)),
    sessions: app.get(getModelToken(Session.name)),
    patients: app.get(getModelToken(Patient.name)),
    visits: app.get(getModelToken(AssessmentVisit.name)),
    scaleInstances: app.get(getModelToken(ScaleInstance.name)),
    reports: app.get(getModelToken(ClinicalReport.name)),
    scaleDefinitions: app.get(getModelToken(ScaleDefinition.name)),
    scaleVersions: app.get(getModelToken(ScaleVersion.name)),
  };
  return new B12BrowserFixtureManager(
    connection.name,
    models,
    app.get(AuthService),
    app.get(ScaleCatalogService),
    app.get(ReportsService),
    app.get(ClinicalReportPublicMapper),
  );
}
