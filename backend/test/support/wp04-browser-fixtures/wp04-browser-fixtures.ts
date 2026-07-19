import type { INestApplicationContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
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
import { ScaleInstance } from '../../../src/modules/assessments/schemas/scale-instance.schema';
import { ClinicalHistoryQueryService } from '../../../src/modules/clinical-history/services/clinical-history-query.service';
import type { PatientFollowUpTrendResponse } from '../../../src/modules/clinical-history/types/follow-up-trend.types';
import { CognitiveDomainResult } from '../../../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
import { MediaEvidence } from '../../../src/modules/media/schemas/media-evidence.schema';
import { Patient } from '../../../src/modules/patients/schemas/patient.schema';
import { ClinicalReport } from '../../../src/modules/reports/schemas/clinical-report.schema';
import { ClinicalReportArchiveWorkflowService } from '../../../src/modules/reports/services/clinical-report-archive-workflow.service';
import { ClinicalReportCorrectionWorkflowService } from '../../../src/modules/reports/services/clinical-report-correction-workflow.service';
import { ClinicalReportHistoryQueryService } from '../../../src/modules/reports/services/clinical-report-history-query.service';
import { ClinicalReportLockWorkflowService } from '../../../src/modules/reports/services/clinical-report-lock-workflow.service';
import { ClinicalReportReviewWorkflowService } from '../../../src/modules/reports/services/clinical-report-review-workflow.service';
import { ClinicalReportSourceFreezeWorkflowService } from '../../../src/modules/reports/services/clinical-report-source-freeze-workflow.service';
import { ReportsService } from '../../../src/modules/reports/services/reports.service';
import { ScoreResult } from '../../../src/modules/scoring/schemas/score-result.schema';
import {
  User,
  type UserDocument,
} from '../../../src/modules/users/schemas/user.schema';
import {
  WP04_BUSINESS_SCENARIOS,
  WP04_ROLES,
  WP04_SCENARIO_GROUPS,
  Wp04FixtureError,
  accountNameFor,
  assertWp04RuntimeEnvironment,
  assertWp04SafeManifest,
  displayNameFor,
  requireWp04FixturePassword,
  subjectCodeFor,
  validateWp04Namespace,
  type Wp04BusinessScenarioKey,
  type Wp04Role,
  type Wp04SafeCleanupSummary,
  type Wp04SafeManifest,
  type Wp04SafeRoleManifest,
  type Wp04SafeScenarioManifest,
  type Wp04ScenarioDefinition,
} from './fixture-contract';
import {
  Wp04ScenarioBuilder,
  type Wp04FixtureModels,
  type Wp04FixtureWorkflows,
} from './scenario-builders';

type Wp04Models = Wp04FixtureModels & {
  users: Model<UserDocument>;
  sessions: Model<SessionDocument>;
};

type TimestampRow = { _id: Types.ObjectId; updatedAt?: Date };

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
  key: Wp04BusinessScenarioKey,
  message: string,
): Wp04FixtureError {
  return new Wp04FixtureError('WP04_FIXTURE_SCENARIO_INVALID', message, key);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function httpCode(error: unknown): string | null {
  if (!(error instanceof HttpException)) return null;
  const response = error.getResponse();
  if (typeof response !== 'object' || response === null) return null;
  const code = (response as Record<string, unknown>).code;
  return typeof code === 'string' ? code : null;
}

function statusCounts(
  points: PatientFollowUpTrendResponse['points'],
): Partial<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const point of points)
    counts[point.dataStatus] = (counts[point.dataStatus] ?? 0) + 1;
  return counts;
}

export class Wp04BrowserFixtureManager {
  constructor(
    private readonly databaseName: string,
    private readonly models: Wp04Models,
    private readonly authService: AuthService,
    private readonly reportsService: ReportsService,
    private readonly historyService: ClinicalHistoryQueryService,
    private readonly reportHistoryService: ClinicalReportHistoryQueryService,
    private readonly workflows: Wp04FixtureWorkflows,
  ) {}

  async prepare(
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<Wp04SafeManifest> {
    const namespace = validateWp04Namespace(rawNamespace);
    const password = requireWp04FixturePassword(rawPassword);
    await this.assertNamespaceUnused(namespace);
    try {
      const users = await this.createUsers(namespace, password);
      const doctor = users.get('doctor');
      if (!doctor) {
        throw new Wp04FixtureError(
          'WP04_FIXTURE_ACCOUNT_CREATION_FAILED',
          'The doctor fixture account was not created',
        );
      }
      await new Wp04ScenarioBuilder(
        namespace,
        this.models,
        this.reportsService,
        this.workflows,
      ).buildAll(toActor(doctor));
      return await this.verifyInternal(namespace, password, 'created');
    } catch (error: unknown) {
      try {
        await this.cleanup(namespace);
      } catch {
        // Preserve the original safe failure; explicit cleanup can retry.
      }
      throw error;
    }
  }

  async verify(
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<Wp04SafeManifest> {
    const namespace = validateWp04Namespace(rawNamespace);
    const password = requireWp04FixturePassword(rawPassword);
    return this.verifyInternal(namespace, password, 'verified');
  }

  async replace(
    rawNamespace: string,
    rawPassword: string | undefined,
  ): Promise<Wp04SafeManifest> {
    const namespace = validateWp04Namespace(rawNamespace);
    const password = requireWp04FixturePassword(rawPassword);
    await this.cleanup(namespace);
    return this.prepare(namespace, password);
  }

  async cleanup(rawNamespace: string): Promise<Wp04SafeCleanupSummary> {
    const namespace = validateWp04Namespace(rawNamespace);
    const accountNames = WP04_ROLES.map((role) =>
      accountNameFor(namespace, role),
    );
    const subjectCodes = WP04_BUSINESS_SCENARIOS.map((definition) =>
      subjectCodeFor(namespace, definition.ordinal),
    );
    await this.assertNoUnexpectedRoots(namespace, accountNames, subjectCodes);
    const [users, patients] = await Promise.all([
      this.models.users
        .find({ accountName: { $in: accountNames } })
        .select({ _id: 1 })
        .lean()
        .exec(),
      this.models.patients
        .find({ subjectCode: { $in: subjectCodes } })
        .select({ _id: 1 })
        .lean()
        .exec(),
    ]);
    const userIds = users.map((user) => user._id);
    const patientIds = patients.map((patient) => patient._id);
    const visits = patientIds.length
      ? await this.models.visits
          .find({ patientId: { $in: patientIds } })
          .select({ _id: 1 })
          .lean()
          .exec()
      : [];
    const visitIds = visits.map((visit) => visit._id);
    const matched = userIds.length + patientIds.length + visitIds.length > 0;
    const deleted: Record<string, number> = {
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
    if (visitIds.length)
      deleted.visits = (
        await this.models.visits.deleteMany({ _id: { $in: visitIds } }).exec()
      ).deletedCount;
    if (patientIds.length)
      deleted.patients = (
        await this.models.patients
          .deleteMany({ _id: { $in: patientIds } })
          .exec()
      ).deletedCount;
    if (userIds.length)
      deleted.users = (
        await this.models.users.deleteMany({ _id: { $in: userIds } }).exec()
      ).deletedCount;
    const residualCount = await this.countResiduals(
      accountNames,
      subjectCodes,
      userIds,
      patientIds,
      visitIds,
    );
    if (residualCount !== 0) {
      throw new Wp04FixtureError(
        'WP04_FIXTURE_CLEANUP_INCOMPLETE',
        'Fixture cleanup left namespace-owned records behind',
      );
    }
    const result: Wp04SafeCleanupSummary = {
      namespace,
      databaseName: this.databaseName,
      action: 'cleaned',
      matched,
      deleted,
      residualCount,
    };
    assertWp04SafeManifest(result);
    return result;
  }

  private async createUsers(
    namespace: string,
    password: string,
  ): Promise<Map<Wp04Role, UserDocument>> {
    const users = new Map<Wp04Role, UserDocument>();
    for (const role of WP04_ROLES) {
      const user = await this.models.users.create({
        accountName: accountNameFor(namespace, role),
        displayName: displayNameFor(role),
        staffCode: `WP04FX-${namespace}-${role}`,
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
    action: 'created' | 'verified',
  ): Promise<Wp04SafeManifest> {
    const before = await this.readOnlySnapshot(namespace);
    const roles = await this.verifyUsers(namespace, password);
    const scenarios: Wp04SafeScenarioManifest[] = [
      {
        scenarioKey: 'roles',
        purpose: 'Five-role login and authorization matrix',
        route: '/login',
        suggestedRole: 'doctor',
        expectedPage: 'login',
        expectedHttpStatus: 200,
        expectedBusinessCode: null,
        expectedSummary:
          'Four read roles are allowed and system is reserved for 403 checks',
      },
    ];
    for (const definition of WP04_BUSINESS_SCENARIOS) {
      scenarios.push(await this.verifyScenario(namespace, definition));
    }
    const keys = scenarios.map((scenario) => scenario.scenarioKey);
    if (keys.length !== 44 || new Set(keys).size !== 44) {
      throw new Wp04FixtureError(
        'WP04_FIXTURE_SCENARIO_CONTRACT_INVALID',
        'Scenario contract must contain exactly 44 unique keys',
      );
    }
    const expectedKeys = Object.values(WP04_SCENARIO_GROUPS).flat();
    if (
      expectedKeys.some((key) => !keys.includes(key)) ||
      keys.some((key) => !expectedKeys.includes(key))
    ) {
      throw new Wp04FixtureError(
        'WP04_FIXTURE_SCENARIO_CONTRACT_INVALID',
        'Scenario contract contains a missing, renamed, or unexpected key',
      );
    }
    const after = await this.readOnlySnapshot(namespace);
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      throw new Wp04FixtureError(
        'WP04_FIXTURE_VERIFY_MUTATED_DATA',
        'Verify must not create sessions or change persisted timestamps',
      );
    }
    const manifest: Wp04SafeManifest = {
      namespace,
      databaseName: this.databaseName,
      roles,
      scenarios,
      summary: {
        action,
        roleCount: 5,
        scenarioCount: 44,
        businessScenarioCount: 43,
      },
    };
    assertWp04SafeManifest(manifest);
    return manifest;
  }

  private async verifyUsers(namespace: string, password: string) {
    const roles: Wp04SafeRoleManifest[] = [];
    for (const role of WP04_ROLES) {
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
        throw new Wp04FixtureError(
          'WP04_FIXTURE_ACCOUNT_INVALID',
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

  private async verifyScenario(
    namespace: string,
    definition: Wp04ScenarioDefinition,
  ): Promise<Wp04SafeScenarioManifest> {
    const patient = await this.models.patients
      .findOne({ subjectCode: subjectCodeFor(namespace, definition.ordinal) })
      .exec();
    if (!patient)
      throw scenarioFailure(
        definition.scenarioKey,
        'Scenario patient is missing',
      );
    const patientId = patient._id.toString();
    const visits = await this.models.visits
      .find({ patientId: patient._id })
      .sort({ assessmentDate: 1, _id: 1 })
      .exec();
    const base = {
      scenarioKey: definition.scenarioKey,
      purpose: definition.purpose,
      suggestedRole: definition.suggestedRole,
      expectedPage: definition.expectedPage,
    } as const;
    if (definition.group === 'history') {
      return this.verifyHistoryScenario(base, patientId);
    }
    if (definition.group === 'reportVersions') {
      return this.verifyReportVersionScenario(base, patientId, visits);
    }
    if (definition.group === 'reportDetails') {
      return this.verifyReportDetailScenario(base, patientId, visits);
    }
    return this.verifyTrendScenario(base, patientId, patient.status);
  }

  private async verifyHistoryScenario(
    base: Pick<
      Wp04SafeScenarioManifest,
      'scenarioKey' | 'purpose' | 'suggestedRole' | 'expectedPage'
    >,
    patientId: string,
  ): Promise<Wp04SafeScenarioManifest> {
    const key = base.scenarioKey as Wp04BusinessScenarioKey;
    const history = await this.historyService.listPatientAssessmentHistory(
      patientId,
      {
        page: 1,
        pageSize: 100,
      },
    );
    if (key === 'history_empty' && history.total !== 0)
      throw scenarioFailure(key, 'History empty scenario is not empty');
    if (key === 'history_pagination') {
      const page20 = await this.historyService.listPatientAssessmentHistory(
        patientId,
        { page: 1, pageSize: 20 },
      );
      const page50 = await this.historyService.listPatientAssessmentHistory(
        patientId,
        { page: 2, pageSize: 50 },
      );
      const page100 = await this.historyService.listPatientAssessmentHistory(
        patientId,
        { page: 1, pageSize: 100 },
      );
      const empty = await this.historyService.listPatientAssessmentHistory(
        patientId,
        { page: 99, pageSize: 20 },
      );
      if (
        history.total !== 105 ||
        page20.items.length !== 20 ||
        page50.items.length !== 50 ||
        page100.items.length !== 100 ||
        empty.items.length !== 0
      ) {
        throw scenarioFailure(
          key,
          'History pagination totals or page sizes are invalid',
        );
      }
      const orderedIds = page100.items.map((item) => item.visit.id);
      if (new Set(orderedIds).size !== orderedIds.length)
        throw scenarioFailure(key, 'History pagination ordering is unstable');
    }
    if (key === 'history_filters') {
      for (const status of [
        'draft',
        'in_progress',
        'completed',
        'locked',
        'voided',
      ] as const) {
        const filtered = await this.historyService.listPatientAssessmentHistory(
          patientId,
          { page: 1, pageSize: 20, status },
        );
        if (filtered.total !== 1)
          throw scenarioFailure(
            key,
            `History status filter ${status} is invalid`,
          );
      }
      const current = await this.historyService.listPatientAssessmentHistory(
        patientId,
        { page: 1, pageSize: 20, scaleCode: 'moca' },
      );
      const legacy = await this.historyService.listPatientAssessmentHistory(
        patientId,
        { page: 1, pageSize: 20, scaleCode: 'legacy_wp04' },
      );
      const dates = await this.historyService.listPatientAssessmentHistory(
        patientId,
        {
          page: 1,
          pageSize: 20,
          dateFrom: new Date('2026-01-15T00:00:00.000Z'),
          dateTo: new Date('2026-02-20T23:59:59.999Z'),
        },
      );
      if (current.total !== 4 || legacy.total !== 1 || dates.total < 2)
        throw scenarioFailure(key, 'History scale or date filters are invalid');
    }
    if (key === 'history_source_matrix') {
      const scoreAvailability = new Set<string>();
      const domainAvailability = new Set<string>();
      let nullScore = false;
      let nullDomain = false;
      for (const item of history.items) {
        for (const scale of item.scaleSummaries) {
          if (scale.scoreSummary)
            scoreAvailability.add(scale.scoreSummary.availability);
          else nullScore = true;
          if (scale.domainSummary)
            domainAvailability.add(scale.domainSummary.availability);
          else nullDomain = true;
        }
      }
      const required = [
        'available',
        'source_not_final',
        'source_voided',
        'source_incomplete',
      ];
      if (
        !nullScore ||
        !nullDomain ||
        required.some((value) => !scoreAvailability.has(value)) ||
        required.some((value) => !domainAvailability.has(value))
      ) {
        throw scenarioFailure(
          key,
          'History source availability matrix is incomplete',
        );
      }
    }
    if (key === 'history_report_summary_matrix') {
      const statuses = new Set(
        history.items.map((item) => item.reportSummary.status),
      );
      const hasDraftLatestWithArchive = history.items.some(
        (item) =>
          item.reportSummary.status === 'available' &&
          item.reportSummary.latest?.status === 'draft' &&
          item.reportSummary.latestArchivedVersion !== null,
      );
      if (
        !statuses.has('none') ||
        !statuses.has('available') ||
        !statuses.has('incomplete') ||
        !hasDraftLatestWithArchive
      ) {
        throw scenarioFailure(
          key,
          'History report summary matrix is incomplete',
        );
      }
    }
    return {
      ...base,
      route: `/patients/${patientId}/history`,
      expectedHttpStatus: 200,
      expectedBusinessCode: null,
      expectedSummary: `${history.total} Visit history scenario verified`,
    };
  }

  private async verifyReportVersionScenario(
    base: Pick<
      Wp04SafeScenarioManifest,
      'scenarioKey' | 'purpose' | 'suggestedRole' | 'expectedPage'
    >,
    patientId: string,
    visits: AssessmentVisitDocument[],
  ): Promise<Wp04SafeScenarioManifest> {
    const key = base.scenarioKey as Wp04BusinessScenarioKey;
    const visit = visits[0];
    if (!visit) throw scenarioFailure(key, 'Report version Visit is missing');
    const invalidCode =
      key === 'report_versions_lineage_invalid'
        ? 'CLINICAL_REPORT_HISTORY_LINEAGE_INVALID'
        : key === 'report_versions_incomplete'
          ? 'CLINICAL_REPORT_INCOMPLETE'
          : null;
    if (invalidCode) {
      try {
        await this.reportHistoryService.listVersions(
          patientId,
          visit._id.toString(),
          { page: 1, pageSize: 20 },
        );
        throw scenarioFailure(
          key,
          'Invalid report version scenario unexpectedly succeeded',
        );
      } catch (error: unknown) {
        if (error instanceof Wp04FixtureError) throw error;
        if (httpCode(error) !== invalidCode)
          throw scenarioFailure(
            key,
            'Report version scenario returned the wrong conflict code',
          );
      }
      return {
        ...base,
        route: `/patients/${patientId}/visits/${visit._id.toString()}`,
        expectedHttpStatus: 409,
        expectedBusinessCode: invalidCode,
        expectedSummary: 'Conflict path verified without partial lineage',
      };
    }
    const expected =
      key === 'report_versions_none'
        ? 0
        : key === 'report_versions_v1'
          ? 1
          : key === 'report_versions_v2'
            ? 2
            : key === 'report_versions_v3'
              ? 3
              : 21;
    const first = await this.reportHistoryService.listVersions(
      patientId,
      visit._id.toString(),
      { page: 1, pageSize: 20 },
    );
    if (
      first.total !== expected ||
      first.lineage.latestVersion !== expected ||
      first.items.length !== Math.min(20, expected)
    ) {
      throw scenarioFailure(key, 'Report version count or lineage is invalid');
    }
    if (expected === 21) {
      const second = await this.reportHistoryService.listVersions(
        patientId,
        visit._id.toString(),
        { page: 2, pageSize: 20 },
      );
      if (second.items.length !== 1)
        throw scenarioFailure(key, 'V21 pagination is invalid');
    }
    return {
      ...base,
      route: `/patients/${patientId}/visits/${visit._id.toString()}`,
      expectedHttpStatus: 200,
      expectedBusinessCode: null,
      expectedSummary: `Valid V1 to V${expected} lineage`,
      expectedVersionCount: expected,
      expectedLatestVersion: expected,
    };
  }

  private async verifyReportDetailScenario(
    base: Pick<
      Wp04SafeScenarioManifest,
      'scenarioKey' | 'purpose' | 'suggestedRole' | 'expectedPage'
    >,
    patientId: string,
    visits: AssessmentVisitDocument[],
  ): Promise<Wp04SafeScenarioManifest> {
    const key = base.scenarioKey as Wp04BusinessScenarioKey;
    const visit = visits[0];
    if (!visit) throw scenarioFailure(key, 'Report detail Visit is missing');
    const reports = await this.models.reports
      .find({ patientId: new Types.ObjectId(patientId) })
      .sort({ reportVersion: 1 })
      .exec();
    const report =
      key === 'report_detail_corrected'
        ? reports[0]
        : reports[reports.length - 1];
    if (!report) throw scenarioFailure(key, 'Report detail is missing');
    if (key === 'report_detail_incomplete') {
      try {
        await this.reportHistoryService.getHistoricalReport(
          patientId,
          visit._id.toString(),
          report._id.toString(),
        );
        throw scenarioFailure(
          key,
          'Incomplete report detail unexpectedly succeeded',
        );
      } catch (error: unknown) {
        if (error instanceof Wp04FixtureError) throw error;
        if (httpCode(error) !== 'CLINICAL_REPORT_INCOMPLETE')
          throw scenarioFailure(
            key,
            'Incomplete report detail returned the wrong code',
          );
      }
      return {
        ...base,
        route: `/patients/${patientId}/visits/${visit._id.toString()}/clinical-reports/${report._id.toString()}`,
        expectedHttpStatus: 409,
        expectedBusinessCode: 'CLINICAL_REPORT_INCOMPLETE',
        expectedSummary: 'Incomplete detail conflict verified',
      };
    }
    const detail = await this.reportHistoryService.getHistoricalReport(
      patientId,
      visit._id.toString(),
      report._id.toString(),
    );
    const expectedStatus = key.replace('report_detail_', '');
    if (detail.report.status !== expectedStatus)
      throw scenarioFailure(key, 'Historical report detail status is invalid');
    return {
      ...base,
      route: `/patients/${patientId}/visits/${visit._id.toString()}/clinical-reports/${report._id.toString()}`,
      expectedHttpStatus: 200,
      expectedBusinessCode: null,
      expectedSummary: `${expectedStatus} report detail verified`,
      expectedReportStatus: expectedStatus,
    };
  }

  private async verifyTrendScenario(
    base: Pick<
      Wp04SafeScenarioManifest,
      'scenarioKey' | 'purpose' | 'suggestedRole' | 'expectedPage'
    >,
    patientId: string,
    patientStatus: string,
  ): Promise<Wp04SafeScenarioManifest> {
    const key = base.scenarioKey as Wp04BusinessScenarioKey;
    if (key === 'trend_scale_unavailable') {
      try {
        await this.historyService.getPatientFollowUpTrend(patientId, {
          scaleCode: 'legacy_wp04',
          maxPoints: 100,
        });
        throw scenarioFailure(key, 'Unavailable scale unexpectedly succeeded');
      } catch (error: unknown) {
        if (error instanceof Wp04FixtureError) throw error;
        if (httpCode(error) !== 'SCALE_NOT_AVAILABLE')
          throw scenarioFailure(
            key,
            'Unavailable scale returned the wrong code',
          );
      }
      return {
        ...base,
        route: `/patients/${patientId}/trends?scaleCode=legacy_wp04`,
        expectedHttpStatus: 404,
        expectedBusinessCode: 'SCALE_NOT_AVAILABLE',
        expectedSummary: 'Unavailable catalog scale verified',
      };
    }
    if (key === 'trend_range_too_large_101') {
      try {
        await this.historyService.getPatientFollowUpTrend(patientId, {
          scaleCode: 'moca',
          maxPoints: 100,
        });
        throw scenarioFailure(key, '101-Visit range unexpectedly succeeded');
      } catch (error: unknown) {
        if (error instanceof Wp04FixtureError) throw error;
        if (httpCode(error) !== 'FOLLOW_UP_TREND_RANGE_TOO_LARGE')
          throw scenarioFailure(key, '101-Visit range returned the wrong code');
      }
      return {
        ...base,
        route: `/patients/${patientId}/trends?scaleCode=moca&maxPoints=100`,
        expectedHttpStatus: 409,
        expectedBusinessCode: 'FOLLOW_UP_TREND_RANGE_TOO_LARGE',
        expectedSummary: '101-Visit range conflict verified without truncation',
        expectedPointCount: 101,
      };
    }
    const trend = await this.historyService.getPatientFollowUpTrend(patientId, {
      scaleCode: 'moca',
      maxPoints: 100,
    });
    if (key === 'trend_empty' && trend.points.length !== 0)
      throw scenarioFailure(key, 'Trend empty scenario is not empty');
    if (key === 'trend_data_status_matrix') {
      const expected = [
        'available',
        'source_missing',
        'source_not_final',
        'source_voided',
        'source_incomplete',
        'source_ambiguous',
      ];
      if (
        trend.points.length !== 6 ||
        expected.some(
          (status) =>
            !trend.points.some((point) => point.dataStatus === status),
        )
      ) {
        throw scenarioFailure(key, 'Trend dataStatus matrix is incomplete');
      }
    }
    if (key === 'trend_range_exact_100' && trend.points.length !== 100)
      throw scenarioFailure(key, 'Exact 100-point range is invalid');
    if (
      (key === 'trend_patient_inactive' && patientStatus !== 'inactive') ||
      (key === 'trend_patient_archived' && patientStatus !== 'archived')
    ) {
      throw scenarioFailure(key, 'Historical Patient status is invalid');
    }
    const last = trend.points[trend.points.length - 1];
    const reasonByKey: Partial<Record<Wp04BusinessScenarioKey, string[]>> = {
      trend_scale_version_changed: ['scale_version_changed'],
      trend_crf_version_changed: ['crf_version_changed'],
      trend_scoring_rule_changed: ['scoring_rule_version_changed'],
      trend_field_encoding_changed: ['field_encoding_version_changed'],
      trend_administration_mode_changed: ['administration_mode_changed'],
      trend_score_range_changed: ['score_range_changed'],
      trend_multiple_reasons: [
        'scale_version_changed',
        'crf_version_changed',
        'scoring_rule_version_changed',
        'field_encoding_version_changed',
      ],
    };
    const expectedReasons = reasonByKey[key];
    if (
      expectedReasons &&
      JSON.stringify(last?.comparisonToPrevious.reasons) !==
        JSON.stringify(expectedReasons)
    ) {
      throw scenarioFailure(
        key,
        'Total comparison reasons or order are invalid',
      );
    }
    if (
      key === 'trend_comparable' &&
      last?.comparisonToPrevious.status !== 'comparable'
    )
      throw scenarioFailure(key, 'Comparable total scenario is invalid');
    if (key === 'trend_missing_break') {
      if (
        trend.points.length !== 3 ||
        last?.comparisonToPrevious.status !== 'unavailable' ||
        !last.comparisonToPrevious.reasons.includes('source_missing') ||
        last.comparisonToPrevious.scoreDelta !== null
      ) {
        throw scenarioFailure(key, 'Missing-point adjacency break is invalid');
      }
    }
    const domainExpectations: Partial<
      Record<Wp04BusinessScenarioKey, { status: string; reasons: string[] }>
    > = {
      trend_domain_comparable: { status: 'comparable', reasons: [] },
      trend_domain_mapping_version_changed: {
        status: 'not_comparable',
        reasons: ['domain_mapping_version_changed'],
      },
      trend_domain_mapping_source_changed: {
        status: 'unavailable',
        reasons: ['domain_source_incomplete'],
      },
      trend_domain_mapping_mode_changed: {
        status: 'unavailable',
        reasons: ['domain_source_incomplete'],
      },
      trend_domain_set_changed: {
        status: 'not_comparable',
        reasons: ['domain_set_changed'],
      },
      trend_domain_range_changed: {
        status: 'partially_comparable',
        reasons: ['domain_range_changed'],
      },
      trend_domain_partially_comparable: {
        status: 'partially_comparable',
        reasons: ['domain_range_changed'],
      },
      trend_domain_unavailable: {
        status: 'unavailable',
        reasons: ['domain_source_incomplete'],
      },
    };
    const domainExpected = domainExpectations[key];
    if (domainExpected) {
      const comparison = last?.comparisonToPrevious;
      if (
        comparison?.status !== 'comparable' ||
        comparison.domainDeltas.status !== domainExpected.status ||
        JSON.stringify(comparison.domainDeltas.reasons) !==
          JSON.stringify(domainExpected.reasons)
      ) {
        throw scenarioFailure(
          key,
          'Domain comparison public result is invalid',
        );
      }
      if (
        (key === 'trend_domain_mapping_source_changed' ||
          key === 'trend_domain_mapping_mode_changed') &&
        (comparison.domainDeltas.items.length !== 0 ||
          comparison.domainDeltas.reasons.includes(
            key.endsWith('source_changed')
              ? 'domain_mapping_source_changed'
              : 'domain_mapping_mode_changed',
          ))
      ) {
        throw scenarioFailure(
          key,
          'Domain source or mode scenario exposed a defensive comparator reason',
        );
      }
      if (
        key === 'trend_domain_mapping_source_changed' ||
        key === 'trend_domain_mapping_mode_changed'
      ) {
        const domainResults = await this.models.cognitiveDomainResults
          .find({ patientId: new Types.ObjectId(patientId) })
          .sort({ createdAt: 1, _id: 1 })
          .exec();
        const actualValues = new Set<string>(
          domainResults.map((result) =>
            key === 'trend_domain_mapping_source_changed'
              ? result.mappingSource
              : result.mappingMode,
          ),
        );
        const expectedValues =
          key === 'trend_domain_mapping_source_changed'
            ? ['scale_config', 'manual']
            : ['item_domain_codes', 'weighted_mapping'];
        if (
          domainResults.length !== 2 ||
          expectedValues.some((value) => !actualValues.has(value))
        ) {
          throw scenarioFailure(
            key,
            'Underlying domain source or mode change is missing',
          );
        }
      }
    }
    return {
      ...base,
      route: `/patients/${patientId}/trends?scaleCode=moca&maxPoints=100`,
      expectedHttpStatus: 200,
      expectedBusinessCode: null,
      expectedSummary: `${trend.points.length} Visit-preserving trend points verified`,
      expectedPointCount: trend.points.length,
      expectedDataStatusCounts: statusCounts(trend.points),
      ...(last
        ? {
            expectedComparisonStatus: last.comparisonToPrevious.status,
            expectedReasons: [...last.comparisonToPrevious.reasons],
            expectedDomainComparisonStatus:
              last.comparisonToPrevious.domainDeltas.status,
            expectedDomainReasons: [
              ...last.comparisonToPrevious.domainDeltas.reasons,
            ],
          }
        : {}),
    };
  }

  private async readOnlySnapshot(
    namespace: string,
  ): Promise<Record<string, unknown>> {
    const accountNames = WP04_ROLES.map((role) =>
      accountNameFor(namespace, role),
    );
    const subjectCodes = WP04_BUSINESS_SCENARIOS.map((definition) =>
      subjectCodeFor(namespace, definition.ordinal),
    );
    const [users, patients] = await Promise.all([
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
    ]);
    const patientIds = patients.map((patient) => patient._id);
    const [
      visits,
      instances,
      items,
      evidence,
      scores,
      domains,
      reports,
      sessions,
    ] = await Promise.all([
      this.models.visits
        .find({ patientId: { $in: patientIds } })
        .select({ _id: 1, updatedAt: 1 })
        .sort({ _id: 1 })
        .lean<TimestampRow[]>()
        .exec(),
      this.models.scaleInstances
        .find({ patientId: { $in: patientIds } })
        .select({ _id: 1, updatedAt: 1 })
        .sort({ _id: 1 })
        .lean<TimestampRow[]>()
        .exec(),
      this.models.itemResponses
        .find({ patientId: { $in: patientIds } })
        .select({ _id: 1, updatedAt: 1 })
        .sort({ _id: 1 })
        .lean<TimestampRow[]>()
        .exec(),
      this.models.mediaEvidence
        .find({ patientId: { $in: patientIds } })
        .select({ _id: 1, updatedAt: 1 })
        .sort({ _id: 1 })
        .lean<TimestampRow[]>()
        .exec(),
      this.models.scoreResults
        .find({ patientId: { $in: patientIds } })
        .select({ _id: 1, updatedAt: 1 })
        .sort({ _id: 1 })
        .lean<TimestampRow[]>()
        .exec(),
      this.models.cognitiveDomainResults
        .find({ patientId: { $in: patientIds } })
        .select({ _id: 1, updatedAt: 1 })
        .sort({ _id: 1 })
        .lean<TimestampRow[]>()
        .exec(),
      this.models.reports
        .find({ patientId: { $in: patientIds } })
        .select({ _id: 1, updatedAt: 1 })
        .sort({ _id: 1 })
        .lean<TimestampRow[]>()
        .exec(),
      this.models.sessions.countDocuments({
        userId: { $in: users.map((user) => user._id) },
      }),
    ]);
    const normalize = (entries: TimestampRow[]) =>
      entries.map((entry) => ({
        id: entry._id.toString(),
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
      sessions,
    };
  }

  private async assertNamespaceUnused(namespace: string): Promise<void> {
    const accountNames = WP04_ROLES.map((role) =>
      accountNameFor(namespace, role),
    );
    const subjectCodes = WP04_BUSINESS_SCENARIOS.map((definition) =>
      subjectCodeFor(namespace, definition.ordinal),
    );
    const [users, patients] = await Promise.all([
      this.models.users.countDocuments({ accountName: { $in: accountNames } }),
      this.models.patients.countDocuments({
        subjectCode: { $in: subjectCodes },
      }),
    ]);
    if (users || patients) {
      throw new Wp04FixtureError(
        'WP04_FIXTURE_NAMESPACE_EXISTS',
        'The namespace already exists or contains partial fixture residue; use explicit replace',
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
          accountName: new RegExp(`^wp04fx-${escapeRegExp(namespace)}-`),
        })
        .select({ accountName: 1 })
        .lean()
        .exec(),
      this.models.patients
        .find({
          subjectCode: new RegExp(
            `^WP04-${escapeRegExp(namespace.toUpperCase())}-`,
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
      throw new Wp04FixtureError(
        'WP04_FIXTURE_NAMESPACE_OWNERSHIP_UNSAFE',
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

export function createWp04BrowserFixtureManager(
  app: INestApplicationContext,
): Wp04BrowserFixtureManager {
  const config = app.get(ConfigService);
  const connection = app.get<Connection>(getConnectionToken());
  const databaseName = connection.name;
  assertWp04RuntimeEnvironment({
    nodeEnv: process.env.NODE_ENV,
    appEnv: config.get<string>('app.env'),
    databaseName,
    storageDriver: config.get<string>('storage.driver'),
    llmProvider: config.get<string>('llm.provider'),
    smsProvider: config.get<string>('smsAuth.provider'),
    sessionCookieSecure: config.get<boolean>('session.cookieSecure'),
  });
  const models: Wp04Models = {
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
  };
  const workflows: Wp04FixtureWorkflows = {
    review: app.get(ClinicalReportReviewWorkflowService),
    lock: app.get(ClinicalReportLockWorkflowService),
    freeze: app.get(ClinicalReportSourceFreezeWorkflowService),
    archive: app.get(ClinicalReportArchiveWorkflowService),
    correction: app.get(ClinicalReportCorrectionWorkflowService),
  };
  return new Wp04BrowserFixtureManager(
    databaseName,
    models,
    app.get(AuthService),
    app.get(ReportsService),
    app.get(ClinicalHistoryQueryService),
    app.get(ClinicalReportHistoryQueryService),
    workflows,
  );
}
