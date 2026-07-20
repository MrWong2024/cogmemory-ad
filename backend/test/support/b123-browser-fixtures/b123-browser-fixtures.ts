import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import type { AuthenticatedUserContext } from '../../../src/modules/auth/types/auth-user-context.type';
import {
  Session,
  type SessionDocument,
} from '../../../src/modules/auth/schemas/session.schema';
import { AuthService } from '../../../src/modules/auth/services/auth.service';
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
import {
  CognitiveDomainResult,
  type CognitiveDomainResultDocument,
} from '../../../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
import {
  MediaEvidence,
  type MediaEvidenceDocument,
} from '../../../src/modules/media/schemas/media-evidence.schema';
import {
  Patient,
  type PatientDocument,
} from '../../../src/modules/patients/schemas/patient.schema';
import { PatientsService } from '../../../src/modules/patients/services/patients.service';
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
import { ScaleSeedDataService } from '../../../src/modules/scales/seeds/scale-seed-data.service';
import { ScaleCatalogService } from '../../../src/modules/scales/services/scale-catalog.service';
import {
  ScoreResult,
  type ScoreResultDocument,
} from '../../../src/modules/scoring/schemas/score-result.schema';
import {
  User,
  type UserDocument,
} from '../../../src/modules/users/schemas/user.schema';
import {
  B123_BUSINESS_SCENARIOS,
  B123_DIRECT_AUDIT_IDS,
  B123_ROLES,
  B123_TRANSITION_SCENARIOS,
  B123FixtureError,
  accountNameFor,
  assertB123RuntimeEnvironment,
  assertB123SafeManifest,
  browserPatientSubjectCodeFor,
  browserVisitCodeFor,
  displayNameFor,
  executionClassForAuditIds,
  failedVisitCodeFor,
  noMatchKeywordFor,
  requireB123FixturePassword,
  scenarioSubjectCodeFor,
  scenarioVisitCodeFor,
  validateB123Namespace,
  type B123BusinessScenarioKey,
  type B123Role,
  type B123SafeCleanupSummary,
  type B123SafeManifest,
  type B123SafeRoleManifest,
  type B123SafeScenarioManifest,
  type B123SafeTransitionSummary,
  type B123SafeValue,
  type B123ScenarioDefinition,
  type B123TransitionScenarioKey,
} from './fixture-contract';
import {
  B123_MMSE_ITEM_COUNT,
  B123_MOCA_ITEM_COUNT,
  B123_PATIENT_DEFAULT_PAGE_SIZE,
  B123_PATIENT_LIST_EXTRA_COUNT,
  B123ScenarioBuilder,
  archivedPatientSubjectCodeFor,
  crossOwnedPatientSubjectCodeFor,
  expectedPreparedPatientCount,
  ownedSubjectCodesFor,
  type B123FixtureModels,
} from './scenario-builders';

type B123Models = B123FixtureModels & {
  users: Model<UserDocument>;
  sessions: Model<SessionDocument>;
  mediaEvidence: Model<MediaEvidenceDocument>;
  scoreResults: Model<ScoreResultDocument>;
  cognitiveDomainResults: Model<CognitiveDomainResultDocument>;
  reports: Model<ClinicalReportDocument>;
  scaleDefinitions: Model<ScaleDefinitionDocument>;
  scaleVersions: Model<ScaleVersionDocument>;
};

type TimestampRow = { _id: Types.ObjectId; updatedAt?: Date };
type IdRow = { _id: Types.ObjectId };
type TransitionMetadata = {
  namespace: string;
  scenarioKey: 'dashboard_session_matrix';
  expiresAt: Date;
};

const TRANSITION_TAG_PREFIX = 'b123fx-transition:';
const BROWSER_PATIENT_BIRTH_DATE = new Date('1980-02-29T00:00:00.000Z');
const BROWSER_VISIT_ASSESSMENT_DATE = new Date('2026-08-15T01:30:00.000Z');
const EXPECTED_BROWSER_TAGS = ['记忆门诊', '随访', '研究'] as const;

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

function scenarioFailure(
  key: B123BusinessScenarioKey,
  message: string,
): B123FixtureError {
  return new B123FixtureError('B123_FIXTURE_SCENARIO_INVALID', message, key);
}

function transitionTag(
  namespace: string,
  scenarioKey: Exclude<B123TransitionScenarioKey, 'dashboard_session_matrix'>,
): string {
  return `${TRANSITION_TAG_PREFIX}${namespace}:${scenarioKey}`;
}

function sameStrings(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((entry, index) => entry === expected[index])
  );
}

export class B123BrowserFixtureManager {
  constructor(
    private readonly databaseName: string,
    private readonly models: B123Models,
    private readonly authService: AuthService,
    private readonly patientsService: PatientsService,
    private readonly scaleCatalogService: ScaleCatalogService,
    private readonly scaleSeedDataService: ScaleSeedDataService,
    private readonly scaleWorkflow: AssessmentScaleWorkflowService,
  ) {}

  async prepare(
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B123SafeManifest> {
    const namespace = validateB123Namespace(rawNamespace);
    const password = requireB123FixturePassword(rawPassword);
    await this.assertNamespaceUnused(namespace);
    try {
      const users = await this.createUsers(namespace, password);
      const doctor = users.get('doctor');
      if (!doctor) {
        throw new B123FixtureError(
          'B123_FIXTURE_ACCOUNT_CREATION_FAILED',
          'The doctor fixture account was not created',
        );
      }
      await new B123ScenarioBuilder(
        namespace,
        this.models,
        this.scaleCatalogService,
        this.scaleWorkflow,
      ).buildAll(toActor(doctor));
      return await this.verifyInternal(
        namespace,
        password,
        'prepared',
        'created',
      );
    } catch (error: unknown) {
      try {
        await this.cleanup(namespace);
      } catch {
        // Preserve the original safe error; explicit cleanup can retry.
      }
      throw error;
    }
  }

  async verify(
    rawNamespace: string,
    rawPassword: string | undefined,
    phase: 'prepared' | 'post-browser' = 'prepared',
  ): Promise<B123SafeManifest> {
    const namespace = validateB123Namespace(rawNamespace);
    const password = requireB123FixturePassword(rawPassword);
    return this.verifyInternal(namespace, password, phase, 'verified');
  }

  async replace(
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<B123SafeManifest> {
    const namespace = validateB123Namespace(rawNamespace);
    const password = requireB123FixturePassword(rawPassword);
    await this.cleanup(namespace);
    return this.prepare(namespace, password);
  }

  async transition(
    rawNamespace: string,
    scenarioKey: string,
    action: 'arm' | 'restore',
  ): Promise<B123SafeTransitionSummary> {
    const namespace = validateB123Namespace(rawNamespace);
    if (
      !B123_TRANSITION_SCENARIOS.includes(
        scenarioKey as B123TransitionScenarioKey,
      )
    ) {
      throw new B123FixtureError(
        'B123_FIXTURE_TRANSITION_NOT_ALLOWED',
        'Transition scenario is not on the fixed B1-B3 whitelist',
      );
    }
    await this.assertNamespacePrepared(namespace);
    const key = scenarioKey as B123TransitionScenarioKey;
    const changedCount =
      action === 'arm'
        ? await this.armTransition(namespace, key)
        : await this.restoreTransition(namespace, key);
    const result: B123SafeTransitionSummary = {
      namespace,
      databaseName: this.databaseName,
      action: action === 'arm' ? 'armed' : 'restored',
      scenarioKey: key,
      changedCount,
    };
    assertB123SafeManifest(result);
    return result;
  }

  async cleanup(rawNamespace: string): Promise<B123SafeCleanupSummary> {
    const namespace = validateB123Namespace(rawNamespace);
    await this.restoreAllTransitions(namespace);
    const accountNames = B123_ROLES.map((role) =>
      accountNameFor(namespace, role),
    );
    const subjectCodes = ownedSubjectCodesFor(namespace);
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
    const userIds = users.map((entry) => entry._id);
    const patientIds = patients.map((entry) => entry._id);
    const visits = patientIds.length
      ? await this.models.visits
          .find({ patientId: { $in: patientIds } })
          .select({ _id: 1 })
          .lean<IdRow[]>()
          .exec()
      : [];
    const visitIds = visits.map((entry) => entry._id);
    const matched = userIds.length + patientIds.length + visitIds.length > 0;
    const deleted = {
      sessions: 0,
      reports: 0,
      cognitiveDomainResults: 0,
      scoreResults: 0,
      mediaEvidence: 0,
      itemResponses: 0,
      scaleInstances: 0,
      visits: 0,
      patients: 0,
      users: 0,
    };
    if (userIds.length) {
      deleted.sessions = (
        await this.models.sessions
          .deleteMany({ userId: { $in: userIds } })
          .exec()
      ).deletedCount;
    }
    if (patientIds.length || visitIds.length) {
      const ownership = {
        $or: [
          ...(patientIds.length ? [{ patientId: { $in: patientIds } }] : []),
          ...(visitIds.length
            ? [{ assessmentVisitId: { $in: visitIds } }]
            : []),
        ],
      };
      deleted.reports = (
        await this.models.reports.deleteMany(ownership).exec()
      ).deletedCount;
      deleted.cognitiveDomainResults = (
        await this.models.cognitiveDomainResults.deleteMany(ownership).exec()
      ).deletedCount;
      deleted.scoreResults = (
        await this.models.scoreResults.deleteMany(ownership).exec()
      ).deletedCount;
      deleted.mediaEvidence = (
        await this.models.mediaEvidence.deleteMany(ownership).exec()
      ).deletedCount;
      deleted.itemResponses = (
        await this.models.itemResponses.deleteMany(ownership).exec()
      ).deletedCount;
      deleted.scaleInstances = (
        await this.models.scaleInstances.deleteMany(ownership).exec()
      ).deletedCount;
    }
    if (visitIds.length) {
      deleted.visits = (
        await this.models.visits.deleteMany({ _id: { $in: visitIds } }).exec()
      ).deletedCount;
    }
    if (patientIds.length) {
      deleted.patients = (
        await this.models.patients
          .deleteMany({ _id: { $in: patientIds } })
          .exec()
      ).deletedCount;
    }
    if (userIds.length) {
      deleted.users = (
        await this.models.users.deleteMany({ _id: { $in: userIds } }).exec()
      ).deletedCount;
    }
    const residualCount = await this.countResiduals(
      accountNames,
      subjectCodes,
      userIds,
      patientIds,
      visitIds,
      namespace,
    );
    if (residualCount !== 0) {
      throw new B123FixtureError(
        'B123_FIXTURE_CLEANUP_INCOMPLETE',
        'Fixture cleanup left namespace-owned records or transitions behind',
      );
    }
    const result: B123SafeCleanupSummary = {
      namespace,
      databaseName: this.databaseName,
      action: 'cleaned',
      matched,
      deleted,
      residualCount,
    };
    assertB123SafeManifest(result);
    return result;
  }

  private async createUsers(
    namespace: string,
    password: string,
  ): Promise<Map<B123Role, UserDocument>> {
    const users = new Map<B123Role, UserDocument>();
    for (const role of B123_ROLES) {
      const user = await this.models.users.create({
        accountName: accountNameFor(namespace, role),
        displayName: displayNameFor(role),
        staffCode: `B123FX-${namespace}-${role}`,
        passwordHash: await this.authService.hashPassword(password),
        passwordChangedAt: new Date(),
        roles: [role],
        permissions: [],
        userType: role,
        status: 'active',
        failedLoginCount: 0,
        lockedUntil: null,
        metadata: null,
      });
      users.set(role, user);
    }
    return users;
  }

  private async verifyInternal(
    namespace: string,
    password: string,
    phase: 'prepared' | 'post-browser',
    action: 'created' | 'verified',
  ): Promise<B123SafeManifest> {
    const before = await this.readOnlySnapshot(namespace);
    const roles = await this.verifyUsers(namespace, password);
    await this.verifyCatalogBaseline();
    await this.verifyPatientAndVisitMatrix(namespace, phase);
    await this.verifyInitializationMatrix(namespace, phase);
    await this.assertNoTransitionResidue(namespace);
    const scenarios: B123SafeScenarioManifest[] = [
      {
        scenarioKey: 'roles',
        purpose: 'Five-role login and authorization matrix',
        auditIds: [],
        executionClass: 'fixture-required',
        route: '/login',
        suggestedRole: 'doctor',
        expectedPage: 'login',
        requestCategory: 'auth-write',
        faultMode: 'none',
        transitionMode: 'none',
        expectedHttpStatus: 200,
        expectedBusinessCode: null,
        expectedSummary:
          'Admin, doctor, nurse, and research assistant are allowed; system is reserved for 403 checks',
        testInput: null,
      },
    ];
    for (const definition of B123_BUSINESS_SCENARIOS) {
      scenarios.push(await this.buildSafeScenario(namespace, definition));
    }
    const after = await this.readOnlySnapshot(namespace);
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      throw new B123FixtureError(
        'B123_FIXTURE_VERIFY_MUTATED_DATA',
        'Verify must not create sessions, change timestamps, or modify fixture data',
      );
    }
    const manifest: B123SafeManifest = {
      namespace,
      databaseName: this.databaseName,
      roles,
      scenarios,
      summary: {
        action,
        phase,
        roleCount: roles.length,
        scenarioCount: scenarios.length,
        businessScenarioCount: B123_BUSINESS_SCENARIOS.length,
        auditIdCount: B123_BUSINESS_SCENARIOS.flatMap((entry) => [
          ...entry.auditIds,
        ]).length,
        browserDirectCount: B123_DIRECT_AUDIT_IDS.length,
        fixtureRequiredCount: 37,
      },
    };
    assertB123SafeManifest(manifest);
    return manifest;
  }

  private async verifyUsers(
    namespace: string,
    password: string,
  ): Promise<B123SafeRoleManifest[]> {
    const roles: B123SafeRoleManifest[] = [];
    for (const role of B123_ROLES) {
      const accountName = accountNameFor(namespace, role);
      const user = await this.models.users
        .findOne({ accountName })
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
        throw new B123FixtureError(
          'B123_FIXTURE_ACCOUNT_INVALID',
          `Fixture account for role ${role} is missing or invalid`,
        );
      }
      roles.push({
        role,
        loginIdentifier: accountName,
        displayName: user.displayName,
      });
    }
    return roles;
  }

  private async verifyCatalogBaseline(): Promise<void> {
    const options = this.scaleCatalogService.listAvailableScaleOptions();
    if (
      options.length !== 2 ||
      options[0]?.code !== 'mmse' ||
      options[0]?.itemCount !== B123_MMSE_ITEM_COUNT ||
      options[1]?.code !== 'moca' ||
      options[1]?.itemCount !== B123_MOCA_ITEM_COUNT
    ) {
      throw new B123FixtureError(
        'B123_FIXTURE_CATALOG_INVALID',
        'The real MMSE and MoCA catalog baseline is missing or changed',
      );
    }
    for (const scaleCode of ['mmse', 'moca'] as const) {
      const seed = this.scaleSeedDataService.getScaleSeedByCode(scaleCode);
      const definition = await this.models.scaleDefinitions
        .findOne({ code: scaleCode })
        .exec();
      const version = definition
        ? await this.models.scaleVersions
            .findOne({
              scaleDefinitionId: definition._id,
              version: seed?.version.version,
            })
            .exec()
        : null;
      if (
        !seed ||
        !definition ||
        !version ||
        definition.status !== 'active' ||
        definition.tags.some((tag) => tag.startsWith(TRANSITION_TAG_PREFIX)) ||
        version.status !== 'active' ||
        version.crfVersion !== seed.version.crfVersion ||
        version.scoringRuleVersion !== seed.version.scoringRuleVersion ||
        version.fieldEncodingVersion !== seed.version.fieldEncodingVersion ||
        version.items.length !== seed.version.items.length
      ) {
        throw new B123FixtureError(
          'B123_FIXTURE_CATALOG_INVALID',
          'Stored MMSE or MoCA catalog state does not match the built-in seed',
        );
      }
    }
  }

  private async verifyPatientAndVisitMatrix(
    namespace: string,
    phase: 'prepared' | 'post-browser',
  ): Promise<void> {
    const expectedPatientCount =
      expectedPreparedPatientCount() + (phase === 'post-browser' ? 1 : 0);
    const patients = await this.models.patients
      .find({ subjectCode: { $in: ownedSubjectCodesFor(namespace) } })
      .exec();
    if (patients.length !== expectedPatientCount) {
      throw new B123FixtureError(
        'B123_FIXTURE_PATIENT_MATRIX_INVALID',
        'Patient fixture count does not match the expected phase',
      );
    }
    const listRows = patients.filter((patient) =>
      patient.subjectCode.includes('-07-PAGE-'),
    );
    if (
      listRows.length !== B123_PATIENT_LIST_EXTRA_COUNT ||
      listRows.length <= B123_PATIENT_DEFAULT_PAGE_SIZE ||
      !listRows.some((patient) => patient.status === 'inactive') ||
      !listRows.some((patient) => patient.status === 'archived') ||
      !listRows.some((patient) => patient.sourceType === 'research') ||
      !listRows.some((patient) => patient.sourceType === 'clinical')
    ) {
      throw scenarioFailure(
        'patients_list_matrix',
        'Patient pagination and filter matrix is incomplete',
      );
    }
    const empty = await this.patientsService.listPatients({
      page: 1,
      pageSize: B123_PATIENT_DEFAULT_PAGE_SIZE,
      keyword: noMatchKeywordFor(namespace),
    });
    if (empty.total !== 0 || empty.items.length !== 0) {
      throw scenarioFailure(
        'patients_empty',
        'No-match Patient filter is not empty',
      );
    }
    const inactive = patients.find(
      (patient) =>
        patient.subjectCode === scenarioSubjectCodeFor(namespace, 13),
    );
    const archived = patients.find(
      (patient) =>
        patient.subjectCode === archivedPatientSubjectCodeFor(namespace),
    );
    if (inactive?.status !== 'inactive' || archived?.status !== 'archived') {
      throw scenarioFailure(
        'patient_status_matrix',
        'Inactive and archived Patient roots are incomplete',
      );
    }
    const patientIds = patients.map((patient) => patient._id);
    const visits = await this.models.visits
      .find({ patientId: { $in: patientIds } })
      .exec();
    const detailPatient = patients.find(
      (patient) =>
        patient.subjectCode === scenarioSubjectCodeFor(namespace, 10),
    );
    const detailStatuses = detailPatient
      ? visits
          .filter((visit) => visit.patientId.equals(detailPatient._id))
          .map((visit) => visit.status)
          .sort()
      : [];
    if (
      !sameStrings(detailStatuses, [
        'completed',
        'draft',
        'in_progress',
        'locked',
        'voided',
      ])
    ) {
      throw scenarioFailure(
        'patient_detail_active',
        'Patient detail Visit status matrix is incomplete',
      );
    }
    const expectedVisits: Array<{
      code: string;
      status: AssessmentVisitDocument['status'];
      visitType: AssessmentVisitDocument['visitType'];
    }> = [
      {
        code: scenarioVisitCodeFor(namespace, 10, 'DRAFT'),
        status: 'draft',
        visitType: 'baseline',
      },
      {
        code: scenarioVisitCodeFor(namespace, 10, 'PROGRESS'),
        status: 'in_progress',
        visitType: 'follow_up',
      },
      {
        code: scenarioVisitCodeFor(namespace, 10, 'COMPLETED'),
        status: 'completed',
        visitType: 'screening',
      },
      {
        code: scenarioVisitCodeFor(namespace, 10, 'LOCKED'),
        status: 'locked',
        visitType: 'unscheduled',
      },
      {
        code: scenarioVisitCodeFor(namespace, 10, 'VOIDED'),
        status: 'voided',
        visitType: 'other',
      },
      {
        code: scenarioVisitCodeFor(namespace, 11, 'TARGET'),
        status: 'draft',
        visitType: 'follow_up',
      },
      {
        code: scenarioVisitCodeFor(namespace, 12, 'DUPLICATE'),
        status: 'draft',
        visitType: 'baseline',
      },
      {
        code: scenarioVisitCodeFor(namespace, 16, 'VISIBLE'),
        status: 'draft',
        visitType: 'screening',
      },
      {
        code: scenarioVisitCodeFor(namespace, 18),
        status: 'draft',
        visitType: 'baseline',
      },
      {
        code: scenarioVisitCodeFor(namespace, 19),
        status: 'in_progress',
        visitType: 'baseline',
      },
      {
        code: scenarioVisitCodeFor(namespace, 20),
        status: 'in_progress',
        visitType: 'follow_up',
      },
      {
        code: scenarioVisitCodeFor(namespace, 21, 'COMPLETED'),
        status: 'completed',
        visitType: 'baseline',
      },
      {
        code: scenarioVisitCodeFor(namespace, 21, 'LOCKED'),
        status: 'locked',
        visitType: 'follow_up',
      },
      {
        code: scenarioVisitCodeFor(namespace, 21, 'VOIDED'),
        status: 'voided',
        visitType: 'screening',
      },
      {
        code: scenarioVisitCodeFor(namespace, 22),
        status: 'draft',
        visitType: 'baseline',
      },
      {
        code: scenarioVisitCodeFor(namespace, 23, 'OTHER-OWNER'),
        status: 'draft',
        visitType: 'baseline',
      },
      {
        code: scenarioVisitCodeFor(namespace, 24),
        status: 'draft',
        visitType: 'baseline',
      },
      {
        code: scenarioVisitCodeFor(namespace, 25),
        status: 'draft',
        visitType: 'baseline',
      },
      {
        code: scenarioVisitCodeFor(namespace, 26),
        status: 'draft',
        visitType: 'baseline',
      },
    ];
    if (
      visits.length !==
        expectedVisits.length + (phase === 'post-browser' ? 1 : 0) ||
      expectedVisits.some((expected) => {
        const visit = visits.find(
          (candidate) => candidate.visitCode === expected.code,
        );
        return (
          !visit ||
          visit.status !== expected.status ||
          visit.visitType !== expected.visitType
        );
      }) ||
      new Set(
        visits
          .filter((visit) => visit.patientId.equals(detailPatient?._id))
          .map((visit) => visit.assessmentDate.toISOString()),
      ).size !== 5
    ) {
      throw new B123FixtureError(
        'B123_FIXTURE_VISIT_MATRIX_INVALID',
        'Visit type, status, date, or ownership matrix is incomplete',
      );
    }
    const browserPatient = patients.find(
      (patient) =>
        patient.subjectCode === browserPatientSubjectCodeFor(namespace),
    );
    const browserVisit = visits.find(
      (visit) => visit.visitCode === browserVisitCodeFor(namespace),
    );
    if (phase === 'prepared') {
      if (browserPatient || browserVisit) {
        throw new B123FixtureError(
          'B123_FIXTURE_BROWSER_RESERVATION_USED',
          'Prepared phase requires Browser mutation targets to remain absent',
        );
      }
    } else {
      this.verifyBrowserPatient(namespace, browserPatient);
      await this.verifyBrowserVisit(namespace, browserVisit);
    }
    if (
      visits.some(
        (visit) => visit.visitCode === failedVisitCodeFor(namespace),
      ) ||
      visits.some(
        (visit) =>
          inactive?._id.equals(visit.patientId) ||
          archived?._id.equals(visit.patientId),
      )
    ) {
      throw new B123FixtureError(
        'B123_FIXTURE_FORBIDDEN_SIDE_EFFECT',
        'A failed or forbidden Visit write created a side effect',
      );
    }
    const duplicatePatientCount = await this.models.patients.countDocuments({
      subjectCode: scenarioSubjectCodeFor(namespace, 9),
    });
    const duplicateVisitCount = await this.models.visits.countDocuments({
      visitCode: scenarioVisitCodeFor(namespace, 12, 'DUPLICATE'),
    });
    if (duplicatePatientCount !== 1 || duplicateVisitCount !== 1) {
      throw new B123FixtureError(
        'B123_FIXTURE_DUPLICATE_ROOT_INVALID',
        'Patient or Visit duplicate target is missing or multiplied',
      );
    }
  }

  private verifyBrowserPatient(
    namespace: string,
    patient: PatientDocument | undefined,
  ): void {
    if (
      !patient ||
      patient.displayName !== 'B1-B3 脱敏新建受试者' ||
      patient.birthDate?.toISOString() !==
        BROWSER_PATIENT_BIRTH_DATE.toISOString() ||
      !sameStrings(patient.tags, EXPECTED_BROWSER_TAGS) ||
      patient.status !== 'active'
    ) {
      throw scenarioFailure(
        'patient_create_matrix',
        'Post-browser Patient result is missing or does not match normalized form input',
      );
    }
    if (patient.subjectCode !== browserPatientSubjectCodeFor(namespace)) {
      throw scenarioFailure(
        'patient_create_matrix',
        'Browser Patient ownership is invalid',
      );
    }
  }

  private async verifyBrowserVisit(
    namespace: string,
    visit: AssessmentVisitDocument | undefined,
  ): Promise<void> {
    const doctor = await this.models.users
      .findOne({ accountName: accountNameFor(namespace, 'doctor') })
      .exec();
    const patient = await this.models.patients
      .findOne({ subjectCode: scenarioSubjectCodeFor(namespace, 11) })
      .exec();
    if (
      !visit ||
      !doctor ||
      !patient ||
      !visit.patientId.equals(patient._id) ||
      visit.status !== 'draft' ||
      visit.visitType !== 'follow_up' ||
      visit.assessmentDate.toISOString() !==
        BROWSER_VISIT_ASSESSMENT_DATE.toISOString() ||
      !visit.operatorSnapshot?.operatorId?.equals(doctor._id) ||
      visit.operatorSnapshot.operatorName !== doctor.displayName ||
      visit.operatorSnapshot.operatorRole !== 'doctor' ||
      visit.clinicalContext !== null ||
      visit.metadata !== null
    ) {
      throw scenarioFailure(
        'visit_create_matrix',
        'Post-browser Visit result does not preserve server-owned status and operator fields',
      );
    }
  }

  private async verifyInitializationMatrix(
    namespace: string,
    phase: 'prepared' | 'post-browser',
  ): Promise<void> {
    const duplicatePatient = await this.models.patients
      .findOne({ subjectCode: scenarioSubjectCodeFor(namespace, 20) })
      .exec();
    const duplicateInstances = duplicatePatient
      ? await this.models.scaleInstances
          .find({ patientId: duplicatePatient._id })
          .sort({ scaleCode: 1 })
          .exec()
      : [];
    if (
      duplicateInstances.length !== 2 ||
      !sameStrings(
        duplicateInstances.map((entry) => entry.scaleCode),
        ['mmse', 'moca'],
      )
    ) {
      throw scenarioFailure(
        'scale_duplicate_conflict',
        'Duplicate initialization roots must contain MMSE and MoCA exactly once',
      );
    }
    await this.assertSkeletonCounts(duplicateInstances);
    const initializationPatient = await this.models.patients
      .findOne({ subjectCode: scenarioSubjectCodeFor(namespace, 19) })
      .exec();
    const initializationInstances = initializationPatient
      ? await this.models.scaleInstances
          .find({ patientId: initializationPatient._id })
          .sort({ scaleCode: 1 })
          .exec()
      : [];
    if (phase === 'prepared' && initializationInstances.length !== 0) {
      throw scenarioFailure(
        'scale_initialization_matrix',
        'Prepared Browser initialization targets must be absent',
      );
    }
    if (phase === 'post-browser') {
      if (
        initializationInstances.length !== 2 ||
        !sameStrings(
          initializationInstances.map((entry) => entry.scaleCode),
          ['mmse', 'moca'],
        )
      ) {
        throw scenarioFailure(
          'scale_initialization_matrix',
          'Post-browser MMSE and MoCA instances are missing or duplicated',
        );
      }
      await this.assertSkeletonCounts(initializationInstances);
    }
    const noInstanceOrdinals = [18, 21, 22, 24, 25, 26];
    const forbiddenPatients = await this.models.patients
      .find({
        subjectCode: {
          $in: noInstanceOrdinals.map((ordinal) =>
            scenarioSubjectCodeFor(namespace, ordinal),
          ),
        },
      })
      .select({ _id: 1 })
      .lean<IdRow[]>()
      .exec();
    if (
      (await this.models.scaleInstances.countDocuments({
        patientId: { $in: forbiddenPatients.map((entry) => entry._id) },
      })) !== 0
    ) {
      throw new B123FixtureError(
        'B123_FIXTURE_FORBIDDEN_SIDE_EFFECT',
        'A read-only, unauthorized, unavailable, or rejected scale write created data',
      );
    }
  }

  private async assertSkeletonCounts(
    instances: ScaleInstanceDocument[],
  ): Promise<void> {
    for (const instance of instances) {
      const expected =
        instance.scaleCode === 'mmse'
          ? B123_MMSE_ITEM_COUNT
          : instance.scaleCode === 'moca'
            ? B123_MOCA_ITEM_COUNT
            : -1;
      const items = await this.models.itemResponses
        .find({ scaleInstanceId: instance._id })
        .sort({ itemOrder: 1, _id: 1 })
        .exec();
      if (
        expected < 0 ||
        items.length !== expected ||
        items.some((item, index) => item.itemOrder < index + 1)
      ) {
        throw new B123FixtureError(
          'B123_FIXTURE_SCALE_SKELETON_INVALID',
          'MMSE or MoCA instance skeleton count or ordering is invalid',
        );
      }
    }
  }

  private async buildSafeScenario(
    namespace: string,
    definition: B123ScenarioDefinition,
  ): Promise<B123SafeScenarioManifest> {
    return {
      scenarioKey: definition.scenarioKey,
      purpose: definition.purpose,
      auditIds: [...definition.auditIds],
      executionClass: executionClassForAuditIds(definition.auditIds),
      route: await this.resolveRoute(namespace, definition),
      suggestedRole: definition.suggestedRole,
      expectedPage: definition.expectedPage,
      requestCategory: definition.requestCategory,
      faultMode: definition.faultMode,
      transitionMode: definition.transitionMode,
      expectedHttpStatus: definition.expectedHttpStatus,
      expectedBusinessCode: definition.expectedBusinessCode,
      expectedSummary: definition.expectedSummary,
      testInput: this.testInputFor(namespace, definition.scenarioKey),
    };
  }

  private async resolveRoute(
    namespace: string,
    definition: B123ScenarioDefinition,
  ): Promise<string> {
    if (definition.routeKind === 'login') return '/login';
    if (definition.routeKind === 'dashboard') return '/dashboard';
    if (definition.routeKind === 'home') return '/';
    if (definition.routeKind === 'patients') return '/patients';
    if (definition.routeKind === 'patient-new') return '/patients/new';
    const patient = await this.models.patients
      .findOne({
        subjectCode: scenarioSubjectCodeFor(namespace, definition.ordinal),
      })
      .exec();
    if (!patient) {
      throw scenarioFailure(
        definition.scenarioKey,
        'Scenario Patient route root is missing',
      );
    }
    if (definition.routeKind === 'patient-detail') {
      return `/patients/${patient._id.toString()}`;
    }
    if (definition.routeKind === 'visit-new') {
      return `/patients/${patient._id.toString()}/visits/new`;
    }
    let visit = await this.models.visits
      .findOne({ patientId: patient._id })
      .sort({ assessmentDate: 1, _id: 1 })
      .exec();
    if (definition.scenarioKey === 'visit_not_found_matrix') {
      const other = await this.models.patients
        .findOne({ subjectCode: crossOwnedPatientSubjectCodeFor(namespace) })
        .exec();
      visit = other
        ? await this.models.visits.findOne({ patientId: other._id }).exec()
        : null;
    }
    if (!visit) {
      throw scenarioFailure(
        definition.scenarioKey,
        'Scenario Visit route root is missing',
      );
    }
    return `/patients/${patient._id.toString()}/visits/${visit._id.toString()}`;
  }

  private testInputFor(
    namespace: string,
    key: B123BusinessScenarioKey,
  ): Readonly<Record<string, B123SafeValue>> | null {
    switch (key) {
      case 'auth_login_matrix':
        return { loginIdentifier: accountNameFor(namespace, 'doctor') };
      case 'patients_empty':
        return { keyword: noMatchKeywordFor(namespace) };
      case 'patients_list_matrix':
        return {
          defaultPageSize: B123_PATIENT_DEFAULT_PAGE_SIZE,
          preparedListRowCount: B123_PATIENT_LIST_EXTRA_COUNT,
          tagKeyword: '分页矩阵',
        };
      case 'patient_create_matrix':
        return {
          subjectCode: browserPatientSubjectCodeFor(namespace),
          displayName: 'B1-B3 脱敏新建受试者',
          birthDate: '1980-02-29',
          sourceType: 'research',
          sex: 'unknown',
          educationYears: 12,
          handedness: 'right',
          tagsInput: '记忆门诊， 随访\n记忆门诊,研究',
          expectedTags: EXPECTED_BROWSER_TAGS,
        };
      case 'patient_duplicate_conflict':
        return { subjectCode: scenarioSubjectCodeFor(namespace, 9) };
      case 'visit_create_matrix':
        return {
          patientSubjectCode: scenarioSubjectCodeFor(namespace, 11),
          visitCode: browserVisitCodeFor(namespace),
          visitType: 'follow_up',
          assessmentDate: '2026-08-15T09:30',
        };
      case 'visit_duplicate_conflict':
        return { visitCode: scenarioVisitCodeFor(namespace, 12, 'DUPLICATE') };
      case 'patient_status_matrix':
        return {
          inactiveSubjectCode: scenarioSubjectCodeFor(namespace, 13),
          archivedSubjectCode: archivedPatientSubjectCodeFor(namespace),
        };
      case 'patient_error_matrix':
      case 'visit_not_found_matrix':
        return {
          invalidPathSegment: 'invalid-test-resource',
          missingResourceKind: 'synthetic-not-found',
        };
      case 'visit_write_no_retry':
        return { visitCode: failedVisitCodeFor(namespace) };
      case 'scale_initialization_matrix':
        return {
          scaleCodes: ['mmse', 'moca'],
          administrationModes: [
            'clinician_administered',
            'supervised_patient_input',
          ],
        };
      case 'scale_duplicate_conflict':
        return { scaleCodes: ['mmse', 'moca'] };
      case 'catalog_error_matrix':
        return { scaleCode: 'mmse' };
      case 'scale_unavailable':
        return { scaleCode: 'moca' };
      case 'visit_request_boundary':
        return {
          allowedFields: ['scaleCode', 'scaleVersion', 'administrationMode'],
        };
      default:
        return null;
    }
  }

  private async armTransition(
    namespace: string,
    key: B123TransitionScenarioKey,
  ): Promise<number> {
    if (key === 'dashboard_session_matrix') {
      return this.armSessionTransition(namespace);
    }
    await this.assertNoGlobalCatalogTransition();
    const scaleCode = key === 'catalog_error_matrix' ? 'mmse' : 'moca';
    const seed = this.scaleSeedDataService.getScaleSeedByCode(scaleCode);
    const definition = await this.models.scaleDefinitions
      .findOne({ code: scaleCode })
      .exec();
    if (!seed || !definition || definition.status !== 'active') {
      throw new B123FixtureError(
        'B123_FIXTURE_TRANSITION_BASELINE_INVALID',
        'Catalog transition baseline is missing or not active',
      );
    }
    const tag = transitionTag(namespace, key);
    if (key === 'scale_unavailable') {
      const result = await this.models.scaleDefinitions
        .updateOne(
          { _id: definition._id, status: 'active', tags: { $ne: tag } },
          { $set: { status: 'retired' }, $addToSet: { tags: tag } },
        )
        .exec();
      if (result.modifiedCount !== 1) {
        throw new B123FixtureError(
          'B123_FIXTURE_TRANSITION_BASELINE_INVALID',
          'Scale unavailable transition could not be armed safely',
        );
      }
      return result.modifiedCount;
    }
    const version = await this.models.scaleVersions
      .findOne({
        scaleDefinitionId: definition._id,
        version: seed.version.version,
      })
      .exec();
    if (
      !version ||
      version.scoringRuleVersion !== seed.version.scoringRuleVersion
    ) {
      throw new B123FixtureError(
        'B123_FIXTURE_TRANSITION_BASELINE_INVALID',
        'Catalog version conflict transition baseline is invalid',
      );
    }
    const [definitionResult, versionResult] = await Promise.all([
      this.models.scaleDefinitions
        .updateOne({ _id: definition._id }, { $addToSet: { tags: tag } })
        .exec(),
      this.models.scaleVersions
        .updateOne(
          {
            _id: version._id,
            scoringRuleVersion: seed.version.scoringRuleVersion,
          },
          {
            $set: {
              scoringRuleVersion: `${seed.version.scoringRuleVersion ?? 'none'}-b123-conflict`,
            },
          },
        )
        .exec(),
    ]);
    if (versionResult.modifiedCount !== 1) {
      await this.restoreCatalogTransition(namespace, key);
      throw new B123FixtureError(
        'B123_FIXTURE_TRANSITION_BASELINE_INVALID',
        'Catalog version conflict transition could not be armed safely',
      );
    }
    return definitionResult.modifiedCount + versionResult.modifiedCount;
  }

  private async armSessionTransition(namespace: string): Promise<number> {
    const doctor = await this.models.users
      .findOne({ accountName: accountNameFor(namespace, 'doctor') })
      .exec();
    if (!doctor) {
      throw new B123FixtureError(
        'B123_FIXTURE_TRANSITION_BASELINE_INVALID',
        'Session transition doctor account is missing',
      );
    }
    const sessions = await this.models.sessions
      .find({ userId: doctor._id, status: 'active', metadata: null })
      .exec();
    if (sessions.length === 0) {
      throw new B123FixtureError(
        'B123_FIXTURE_TRANSITION_BASELINE_INVALID',
        'Session transition requires a namespace-owned active Browser session',
      );
    }
    let changedCount = 0;
    for (const session of sessions) {
      const metadata: { b123FixtureTransition: TransitionMetadata } = {
        b123FixtureTransition: {
          namespace,
          scenarioKey: 'dashboard_session_matrix',
          expiresAt: session.expiresAt,
        },
      };
      const result = await this.models.sessions
        .updateOne(
          { _id: session._id, status: 'active', metadata: null },
          {
            $set: {
              status: 'revoked',
              revokedAt: new Date(),
              metadata,
            },
          },
        )
        .exec();
      changedCount += result.modifiedCount;
    }
    if (changedCount !== sessions.length) {
      await this.restoreSessionTransition(namespace);
      throw new B123FixtureError(
        'B123_FIXTURE_TRANSITION_BASELINE_INVALID',
        'Session transition could not be armed atomically',
      );
    }
    return changedCount;
  }

  private async restoreTransition(
    namespace: string,
    key: B123TransitionScenarioKey,
  ): Promise<number> {
    return key === 'dashboard_session_matrix'
      ? this.restoreSessionTransition(namespace)
      : this.restoreCatalogTransition(namespace, key);
  }

  private async restoreSessionTransition(namespace: string): Promise<number> {
    const sessions = await this.models.sessions
      .find({
        'metadata.b123FixtureTransition.namespace': namespace,
        'metadata.b123FixtureTransition.scenarioKey':
          'dashboard_session_matrix',
      })
      .exec();
    let changedCount = 0;
    for (const session of sessions) {
      const rawMetadata = session.metadata as {
        b123FixtureTransition?: TransitionMetadata;
      } | null;
      const expiresAt = rawMetadata?.b123FixtureTransition?.expiresAt;
      if (!(expiresAt instanceof Date)) {
        throw new B123FixtureError(
          'B123_FIXTURE_TRANSITION_STATE_INVALID',
          'Session transition restore metadata is invalid',
        );
      }
      const result = await this.models.sessions
        .updateOne(
          { _id: session._id },
          {
            $set: {
              status: 'active',
              expiresAt,
              revokedAt: null,
              metadata: null,
            },
          },
        )
        .exec();
      changedCount += result.modifiedCount;
    }
    return changedCount;
  }

  private async restoreCatalogTransition(
    namespace: string,
    key: Exclude<B123TransitionScenarioKey, 'dashboard_session_matrix'>,
  ): Promise<number> {
    const scaleCode = key === 'catalog_error_matrix' ? 'mmse' : 'moca';
    const seed = this.scaleSeedDataService.getScaleSeedByCode(scaleCode);
    const tag = transitionTag(namespace, key);
    const definition = await this.models.scaleDefinitions
      .findOne({ code: scaleCode, tags: tag })
      .exec();
    if (!definition) return 0;
    if (!seed) {
      throw new B123FixtureError(
        'B123_FIXTURE_TRANSITION_STATE_INVALID',
        'Catalog transition seed is unavailable during restore',
      );
    }
    let changedCount = 0;
    if (key === 'catalog_error_matrix') {
      const versionResult = await this.models.scaleVersions
        .updateOne(
          { scaleDefinitionId: definition._id, version: seed.version.version },
          { $set: { scoringRuleVersion: seed.version.scoringRuleVersion } },
        )
        .exec();
      changedCount += versionResult.modifiedCount;
    }
    const definitionResult = await this.models.scaleDefinitions
      .updateOne(
        { _id: definition._id },
        {
          $set: { status: seed.definition.status },
          $pull: { tags: tag },
        },
      )
      .exec();
    return changedCount + definitionResult.modifiedCount;
  }

  private async restoreAllTransitions(namespace: string): Promise<void> {
    await this.restoreSessionTransition(namespace);
    await this.restoreCatalogTransition(namespace, 'catalog_error_matrix');
    await this.restoreCatalogTransition(namespace, 'scale_unavailable');
  }

  private async assertNoGlobalCatalogTransition(): Promise<void> {
    const count = await this.models.scaleDefinitions.countDocuments({
      tags: new RegExp(`^${escapeRegExp(TRANSITION_TAG_PREFIX)}`),
    });
    if (count !== 0) {
      throw new B123FixtureError(
        'B123_FIXTURE_TRANSITION_ALREADY_ARMED',
        'A catalog transition is already armed and must be restored first',
      );
    }
  }

  private async assertNoTransitionResidue(namespace: string): Promise<void> {
    const [sessions, definitions] = await Promise.all([
      this.models.sessions.countDocuments({
        'metadata.b123FixtureTransition.namespace': namespace,
      }),
      this.models.scaleDefinitions.countDocuments({
        tags: new RegExp(`^${escapeRegExp(TRANSITION_TAG_PREFIX)}`),
      }),
    ]);
    if (sessions !== 0 || definitions !== 0) {
      throw new B123FixtureError(
        'B123_FIXTURE_TRANSITION_REMAINS_ARMED',
        'Prepared verification requires all controlled transitions to be restored',
      );
    }
  }

  private async assertNamespacePrepared(namespace: string): Promise<void> {
    const count = await this.models.users.countDocuments({
      accountName: {
        $in: B123_ROLES.map((role) => accountNameFor(namespace, role)),
      },
    });
    if (count !== B123_ROLES.length) {
      throw new B123FixtureError(
        'B123_FIXTURE_NAMESPACE_MISSING',
        'Transition requires a complete prepared namespace',
      );
    }
  }

  private async readOnlySnapshot(
    namespace: string,
  ): Promise<Record<string, unknown>> {
    const accountNames = B123_ROLES.map((role) =>
      accountNameFor(namespace, role),
    );
    const subjectCodes = ownedSubjectCodesFor(namespace);
    const [users, patients, definitions, versions] = await Promise.all([
      this.models.users
        .find({ accountName: { $in: accountNames } })
        .select({ _id: 1, updatedAt: 1 })
        .sort({ _id: 1 })
        .lean<TimestampRow[]>()
        .exec(),
      this.models.patients
        .find({ subjectCode: { $in: subjectCodes } })
        .select({ _id: 1, updatedAt: 1 })
        .sort({ _id: 1 })
        .lean<TimestampRow[]>()
        .exec(),
      this.models.scaleDefinitions
        .find({ code: { $in: ['mmse', 'moca'] } })
        .select({ _id: 1, updatedAt: 1 })
        .sort({ _id: 1 })
        .lean<TimestampRow[]>()
        .exec(),
      this.models.scaleVersions
        .find({ scaleCode: { $in: ['mmse', 'moca'] } })
        .select({ _id: 1, updatedAt: 1 })
        .sort({ _id: 1 })
        .lean<TimestampRow[]>()
        .exec(),
    ]);
    const patientIds = patients.map((entry) => entry._id);
    const visits = await this.models.visits
      .find({ patientId: { $in: patientIds } })
      .select({ _id: 1, updatedAt: 1 })
      .sort({ _id: 1 })
      .lean<TimestampRow[]>()
      .exec();
    const visitIds = visits.map((entry) => entry._id);
    const ownership = {
      $or: [
        { patientId: { $in: patientIds } },
        { assessmentVisitId: { $in: visitIds } },
      ],
    };
    const [instances, items, evidence, scores, domains, reports, sessions] =
      await Promise.all([
        this.models.scaleInstances
          .find(ownership)
          .select({ _id: 1, updatedAt: 1 })
          .sort({ _id: 1 })
          .lean<TimestampRow[]>()
          .exec(),
        this.models.itemResponses
          .find(ownership)
          .select({ _id: 1, updatedAt: 1 })
          .sort({ _id: 1 })
          .lean<TimestampRow[]>()
          .exec(),
        this.models.mediaEvidence
          .find(ownership)
          .select({ _id: 1, updatedAt: 1 })
          .sort({ _id: 1 })
          .lean<TimestampRow[]>()
          .exec(),
        this.models.scoreResults
          .find(ownership)
          .select({ _id: 1, updatedAt: 1 })
          .sort({ _id: 1 })
          .lean<TimestampRow[]>()
          .exec(),
        this.models.cognitiveDomainResults
          .find(ownership)
          .select({ _id: 1, updatedAt: 1 })
          .sort({ _id: 1 })
          .lean<TimestampRow[]>()
          .exec(),
        this.models.reports
          .find(ownership)
          .select({ _id: 1, updatedAt: 1 })
          .sort({ _id: 1 })
          .lean<TimestampRow[]>()
          .exec(),
        this.models.sessions.countDocuments({
          userId: { $in: users.map((entry) => entry._id) },
        }),
      ]);
    const normalize = (entries: TimestampRow[]) =>
      entries.map((entry) => ({
        key: entry._id.toString(),
        updatedAt: entry.updatedAt?.toISOString() ?? null,
      }));
    return {
      users: normalize(users),
      patients: normalize(patients),
      visits: normalize(visits),
      instances: normalize(instances),
      items: normalize(items),
      evidence: normalize(evidence),
      scores: normalize(scores),
      domains: normalize(domains),
      reports: normalize(reports),
      definitions: normalize(definitions),
      versions: normalize(versions),
      sessions,
    };
  }

  private async assertNamespaceUnused(namespace: string): Promise<void> {
    const [users, patients] = await Promise.all([
      this.models.users.countDocuments({
        accountName: {
          $in: B123_ROLES.map((role) => accountNameFor(namespace, role)),
        },
      }),
      this.models.patients.countDocuments({
        subjectCode: { $in: ownedSubjectCodesFor(namespace) },
      }),
    ]);
    if (users || patients) {
      throw new B123FixtureError(
        'B123_FIXTURE_NAMESPACE_EXISTS',
        'The namespace already exists or contains partial residue; use explicit replace',
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
          accountName: new RegExp(`^b123fx-${escapeRegExp(namespace)}-`),
        })
        .select({ accountName: 1 })
        .lean()
        .exec(),
      this.models.patients
        .find({
          subjectCode: new RegExp(
            `^B123-${escapeRegExp(namespace.toUpperCase())}-`,
          ),
        })
        .select({ subjectCode: 1 })
        .lean()
        .exec(),
    ]);
    if (
      users.some((user) => !accountNames.includes(user.accountName)) ||
      patients.some((patient) => !subjectCodes.includes(patient.subjectCode))
    ) {
      throw new B123FixtureError(
        'B123_FIXTURE_NAMESPACE_OWNERSHIP_UNSAFE',
        'Namespace root ownership is ambiguous; cleanup was refused',
      );
    }
  }

  private async countResiduals(
    accountNames: string[],
    subjectCodes: string[],
    userIds: Types.ObjectId[],
    patientIds: Types.ObjectId[],
    visitIds: Types.ObjectId[],
    namespace: string,
  ): Promise<number> {
    const ownership = {
      $or: [
        ...(patientIds.length ? [{ patientId: { $in: patientIds } }] : []),
        ...(visitIds.length ? [{ assessmentVisitId: { $in: visitIds } }] : []),
      ],
    };
    const counts = await Promise.all([
      this.models.users.countDocuments({ accountName: { $in: accountNames } }),
      this.models.patients.countDocuments({
        subjectCode: { $in: subjectCodes },
      }),
      this.models.visits.countDocuments({ _id: { $in: visitIds } }),
      this.models.sessions.countDocuments({ userId: { $in: userIds } }),
      this.models.sessions.countDocuments({
        'metadata.b123FixtureTransition.namespace': namespace,
      }),
      this.models.scaleDefinitions.countDocuments({
        tags: new RegExp(
          `^${escapeRegExp(TRANSITION_TAG_PREFIX)}${escapeRegExp(namespace)}:`,
        ),
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

export function createB123BrowserFixtureManager(
  app: INestApplicationContext,
): B123BrowserFixtureManager {
  const config = app.get(ConfigService);
  const connection = app.get<Connection>(getConnectionToken());
  const databaseName = connection.name;
  assertB123RuntimeEnvironment({
    nodeEnv: process.env.NODE_ENV,
    appEnv: config.get<string>('app.env'),
    databaseName,
    storageDriver: config.get<string>('storage.driver'),
    llmProvider: config.get<string>('llm.provider'),
    smsProvider: config.get<string>('smsAuth.provider'),
    sessionCookieSecure: config.get<boolean>('session.cookieSecure'),
  });
  const models: B123Models = {
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
  return new B123BrowserFixtureManager(
    databaseName,
    models,
    app.get(AuthService),
    app.get(PatientsService),
    app.get(ScaleCatalogService),
    app.get(ScaleSeedDataService),
    app.get(AssessmentScaleWorkflowService),
  );
}
