import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { randomUUID } from 'crypto';
import type { AuthenticatedUserContext } from '../../../src/modules/auth/types/auth-user-context.type';
import type {
  AssessmentStatus,
  AssessmentVisitDocument,
  AssessmentVisitType,
} from '../../../src/modules/assessments/schemas/assessment-visit.schema';
import type { ItemResponseDocument } from '../../../src/modules/assessments/schemas/item-response.schema';
import type {
  ScaleAdministrationMode,
  ScaleInstanceDocument,
} from '../../../src/modules/assessments/schemas/scale-instance.schema';
import type {
  CognitiveDomainMappingMode,
  CognitiveDomainMappingSource,
  CognitiveDomainQualityStatus,
  CognitiveDomainResultDocument,
  CognitiveDomainResultStatus,
} from '../../../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
import type { MediaEvidenceDocument } from '../../../src/modules/media/schemas/media-evidence.schema';
import type { PatientDocument } from '../../../src/modules/patients/schemas/patient.schema';
import type { ClinicalReportDocument } from '../../../src/modules/reports/schemas/clinical-report.schema';
import type { ClinicalReportArchiveWorkflowService } from '../../../src/modules/reports/services/clinical-report-archive-workflow.service';
import type { ClinicalReportCorrectionWorkflowService } from '../../../src/modules/reports/services/clinical-report-correction-workflow.service';
import type { ClinicalReportLockWorkflowService } from '../../../src/modules/reports/services/clinical-report-lock-workflow.service';
import type { ClinicalReportReviewWorkflowService } from '../../../src/modules/reports/services/clinical-report-review-workflow.service';
import type { ClinicalReportSourceFreezeWorkflowService } from '../../../src/modules/reports/services/clinical-report-source-freeze-workflow.service';
import type {
  ClinicalReportSummary,
  ReportsService,
} from '../../../src/modules/reports/services/reports.service';
import type {
  ScoreQualityStatus,
  ScoreResultDocument,
  ScoreResultStatus,
} from '../../../src/modules/scoring/schemas/score-result.schema';
import type { Wp04ScenarioDefinition } from './fixture-contract';
import {
  WP04_BUSINESS_SCENARIOS,
  Wp04FixtureError,
  instanceCodeFor,
  subjectCodeFor,
  visitCodeFor,
  type Wp04BusinessScenarioKey,
} from './fixture-contract';

export type Wp04FixtureModels = {
  patients: Model<PatientDocument>;
  visits: Model<AssessmentVisitDocument>;
  scaleInstances: Model<ScaleInstanceDocument>;
  itemResponses: Model<ItemResponseDocument>;
  mediaEvidence: Model<MediaEvidenceDocument>;
  scoreResults: Model<ScoreResultDocument>;
  cognitiveDomainResults: Model<CognitiveDomainResultDocument>;
  reports: Model<ClinicalReportDocument>;
};

export type Wp04FixtureWorkflows = {
  review: ClinicalReportReviewWorkflowService;
  lock: ClinicalReportLockWorkflowService;
  freeze: ClinicalReportSourceFreezeWorkflowService;
  archive: ClinicalReportArchiveWorkflowService;
  correction: ClinicalReportCorrectionWorkflowService;
};

type PatientRoot = {
  patientId: Types.ObjectId;
  subjectCode: string;
  ordinal: number;
};

type ReportRoot = PatientRoot & {
  visitId: Types.ObjectId;
  report: ClinicalReportSummary;
};

type TraceInput = {
  scaleVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
};

type DomainInput = {
  domainCode: string;
  scoreValue: number;
  minScore: number;
  maxScore: number;
  weightedScore?: number | null;
  weightedMaxScore?: number | null;
};

type TrendSourceInput = TraceInput & {
  suffix: string;
  scoreValue?: number;
  scoreMin?: number;
  scoreMax?: number;
  instanceNo?: number;
  instanceStatus?: AssessmentStatus;
  scoreStatus?: ScoreResultStatus;
  scoreQuality?: ScoreQualityStatus;
  administrationMode?: ScaleAdministrationMode;
  withScore?: boolean;
  withDomain?: boolean;
  domainStatus?: CognitiveDomainResultStatus;
  domainQuality?: CognitiveDomainQualityStatus;
  mappingVersion?: string;
  mappingSource?: CognitiveDomainMappingSource;
  mappingMode?: CognitiveDomainMappingMode;
  domains?: DomainInput[];
};

const BASE_DATE = new Date('2026-06-01T08:00:00.000Z');
const HISTORY_SAME_DAY_ASSESSMENT_DATE = new Date('2027-01-15T08:00:00.000Z');

export const WP04_HISTORY_SAME_DAY_VISIT_SUFFIXES = [
  'PAGE-1',
  'PAGE-2',
] as const;

function fixtureFailure(
  scenarioKey: Wp04BusinessScenarioKey,
  safeMessage: string,
): Wp04FixtureError {
  return new Wp04FixtureError(
    'WP04_FIXTURE_SCENARIO_INVALID',
    safeMessage,
    scenarioKey,
  );
}

function reportTimestamp(
  report: ClinicalReportSummary,
  scenarioKey: Wp04BusinessScenarioKey,
): string {
  if (!report.updatedAt) {
    throw fixtureFailure(scenarioKey, 'Required report timestamp is missing');
  }
  return report.updatedAt.toISOString();
}

export class Wp04ScenarioBuilder {
  constructor(
    private readonly namespace: string,
    private readonly models: Wp04FixtureModels,
    private readonly reportsService: ReportsService,
    private readonly workflows: Wp04FixtureWorkflows,
  ) {}

  async buildAll(actor: AuthenticatedUserContext): Promise<void> {
    for (const definition of WP04_BUSINESS_SCENARIOS) {
      await this.build(definition, actor);
    }
  }

  private async build(
    definition: Wp04ScenarioDefinition,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    const root = await this.createPatient(definition);
    const key = definition.scenarioKey;
    if (key === 'history_empty' || key === 'trend_empty') return;
    if (key === 'history_pagination') {
      await this.buildHistoryPagination(root);
      return;
    }
    if (key === 'history_filters') {
      await this.buildHistoryFilters(root);
      return;
    }
    if (key === 'history_source_matrix') {
      await this.buildHistorySourceMatrix(root);
      return;
    }
    if (key === 'history_report_summary_matrix') {
      await this.buildHistoryReportSummaryMatrix(root, actor, key);
      return;
    }
    if (key.startsWith('report_versions_')) {
      await this.buildReportVersionScenario(root, actor, key);
      return;
    }
    if (key.startsWith('report_detail_')) {
      await this.buildReportDetailScenario(root, actor, key);
      return;
    }
    if (key === 'trend_data_status_matrix') {
      await this.buildTrendDataStatusMatrix(root);
      return;
    }
    if (key === 'trend_missing_break') {
      await this.buildMissingBreak(root);
      return;
    }
    if (key === 'trend_range_exact_100') {
      await this.createVisitRange(root, 100);
      return;
    }
    if (key === 'trend_range_too_large_101') {
      await this.createVisitRange(root, 101);
      return;
    }
    if (key === 'trend_scale_unavailable') {
      await this.createVisit(root, 'UNAVAILABLE', BASE_DATE);
      return;
    }
    if (key === 'trend_patient_inactive' || key === 'trend_patient_archived') {
      await this.models.patients
        .updateOne(
          { _id: root.patientId },
          {
            $set: {
              status: key.endsWith('inactive') ? 'inactive' : 'archived',
            },
          },
        )
        .exec();
      await this.buildComparablePair(root);
      return;
    }
    if (key.startsWith('trend_domain_')) {
      await this.buildDomainScenario(root, key);
      return;
    }
    await this.buildTotalScenario(root, key);
  }

  private async createPatient(
    definition: Wp04ScenarioDefinition,
  ): Promise<PatientRoot> {
    const subjectCode = subjectCodeFor(this.namespace, definition.ordinal);
    const patient = await this.models.patients.create({
      subjectCode,
      displayName: `WP-04 脱敏受试者 ${definition.ordinal}`,
      sourceType: 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'active',
      tags: [],
      externalRefs: null,
      metadata: null,
    });
    return { patientId: patient._id, subjectCode, ordinal: definition.ordinal };
  }

  private async createVisit(
    root: PatientRoot,
    suffix: string,
    assessmentDate: Date,
    input: {
      status?: AssessmentStatus;
      visitType?: AssessmentVisitType;
      id?: Types.ObjectId;
    } = {},
  ): Promise<Types.ObjectId> {
    const visit = await this.models.visits.create({
      ...(input.id ? { _id: input.id } : {}),
      patientId: root.patientId,
      subjectCode: root.subjectCode,
      visitCode: visitCodeFor(this.namespace, root.ordinal, suffix),
      visitType: input.visitType ?? 'follow_up',
      status: input.status ?? 'completed',
      assessmentDate,
      startedAt: assessmentDate,
      completedAt:
        input.status === 'draft' || input.status === 'in_progress'
          ? null
          : assessmentDate,
      lockedAt: input.status === 'locked' ? assessmentDate : null,
      voidedAt: input.status === 'voided' ? assessmentDate : null,
      clinicalContext: null,
      metadata: null,
    });
    return visit._id;
  }

  private async createInstanceOnly(
    root: PatientRoot,
    visitId: Types.ObjectId,
    suffix: string,
    scaleCode = 'moca',
  ): Promise<Types.ObjectId> {
    const instance = await this.models.scaleInstances.create({
      patientId: root.patientId,
      assessmentVisitId: visitId,
      subjectCode: root.subjectCode,
      scaleDefinitionId: new Types.ObjectId(),
      scaleVersionId: new Types.ObjectId(),
      scaleCode,
      scaleVersion: '1.0.0',
      instanceCode: instanceCodeFor(this.namespace, root.ordinal, suffix),
      instanceNo: 1,
      status: 'locked',
      administrationMode: 'clinician_administered',
      versionTrace: {
        crfVersion: 'crf-1',
        scoringRuleVersion: 'score-1',
        fieldEncodingVersion: 'field-1',
      },
      completedAt: BASE_DATE,
      lockedAt: BASE_DATE,
      voidedAt: null,
    });
    return instance._id;
  }

  private async createTrendSource(
    root: PatientRoot,
    visitId: Types.ObjectId,
    input: TrendSourceInput,
  ): Promise<{
    instanceId: Types.ObjectId;
    scoreId: Types.ObjectId | null;
    domainId: Types.ObjectId | null;
  }> {
    const instanceId = new Types.ObjectId();
    const scoreId = input.withScore === false ? null : new Types.ObjectId();
    const domainId =
      input.withDomain === false || !scoreId ? null : new Types.ObjectId();
    const scaleVersion = input.scaleVersion ?? '1';
    const crfVersion = input.crfVersion ?? 'crf-1';
    const scoringRuleVersion = input.scoringRuleVersion ?? 'score-1';
    const fieldEncodingVersion = input.fieldEncodingVersion ?? 'field-1';
    const scoreValue = input.scoreValue ?? 20;
    const scoreMin = input.scoreMin ?? 0;
    const scoreMax = input.scoreMax ?? 30;
    const instanceStatus = input.instanceStatus ?? 'locked';
    const scoreStatus = input.scoreStatus ?? 'locked';
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    await this.models.scaleInstances.create({
      _id: instanceId,
      patientId: root.patientId,
      assessmentVisitId: visitId,
      subjectCode: root.subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion,
      instanceCode: instanceCodeFor(this.namespace, root.ordinal, input.suffix),
      instanceNo: input.instanceNo ?? 1,
      status: instanceStatus,
      administrationMode: input.administrationMode ?? 'clinician_administered',
      versionTrace: { crfVersion, scoringRuleVersion, fieldEncodingVersion },
      completedAt: ['completed', 'locked'].includes(instanceStatus)
        ? BASE_DATE
        : null,
      lockedAt: instanceStatus === 'locked' ? BASE_DATE : null,
      voidedAt: instanceStatus === 'voided' ? BASE_DATE : null,
      durationMs: 60000,
    });
    if (!scoreId) return { instanceId, scoreId: null, domainId: null };
    await this.models.scoreResults.create({
      _id: scoreId,
      patientId: root.patientId,
      assessmentVisitId: visitId,
      scaleInstanceId: instanceId,
      subjectCode: root.subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion,
      instanceCode: instanceCodeFor(this.namespace, root.ordinal, input.suffix),
      scoreResultCode: `${subjectCodeFor(this.namespace, root.ordinal)}-SCR-${input.suffix}`,
      runNo: 1,
      status: scoreStatus,
      scoringSource: 'auto_rule',
      scoringMode: 'rule_based',
      versionTrace: {
        scaleVersion,
        crfVersion,
        scoringRuleVersion,
        fieldEncodingVersion,
      },
      totalScore: {
        scoreValue,
        minScore: scoreMin,
        maxScore: scoreMax,
        scorePercent: ((scoreValue - scoreMin) / (scoreMax - scoreMin)) * 100,
      },
      review: { reviewStatus: 'reviewed', reviewedAt: BASE_DATE },
      qualityStatus: input.scoreQuality ?? 'passed',
      confirmedAt: ['confirmed', 'locked'].includes(scoreStatus)
        ? BASE_DATE
        : null,
      lockedAt: scoreStatus === 'locked' ? BASE_DATE : null,
      voidedAt: scoreStatus === 'voided' ? BASE_DATE : null,
    });
    if (!domainId) return { instanceId, scoreId, domainId: null };
    const mappingVersion = input.mappingVersion ?? 'domain-1';
    const domains = input.domains ?? [
      { domainCode: 'memory', scoreValue: 10, minScore: 0, maxScore: 15 },
    ];
    await this.models.cognitiveDomainResults.create({
      _id: domainId,
      patientId: root.patientId,
      assessmentVisitId: visitId,
      scaleInstanceId: instanceId,
      scoreResultId: scoreId,
      subjectCode: root.subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion,
      instanceCode: instanceCodeFor(this.namespace, root.ordinal, input.suffix),
      domainResultCode: `${subjectCodeFor(this.namespace, root.ordinal)}-DOM-${input.suffix}`,
      runNo: 1,
      status: input.domainStatus ?? 'locked',
      mappingSource: input.mappingSource ?? 'scale_config',
      mappingMode: input.mappingMode ?? 'item_domain_codes',
      versionTrace: {
        scaleVersion,
        crfVersion,
        scoringRuleVersion,
        fieldEncodingVersion,
        domainMappingVersion: mappingVersion,
      },
      domainScores: domains.map((domain) => ({
        ...domain,
        scorePercent:
          ((domain.scoreValue - domain.minScore) /
            (domain.maxScore - domain.minScore)) *
          100,
        itemCount: 2,
      })),
      mappingSnapshot: {
        mappingVersion,
        mappingSource: input.mappingSource ?? 'scale_config',
        domainCodes: domains.map((domain) => domain.domainCode),
      },
      computation: { computedAt: BASE_DATE, warningCount: 0 },
      qualityStatus: input.domainQuality ?? 'passed',
      voidedAt: input.domainStatus === 'voided' ? BASE_DATE : null,
      lockedAt: input.domainStatus === 'locked' ? BASE_DATE : null,
    });
    return { instanceId, scoreId, domainId };
  }

  private async buildHistoryPagination(root: PatientRoot): Promise<void> {
    const visits = Array.from({ length: 105 }, (_, index) => {
      const isSameDayVisit =
        index < WP04_HISTORY_SAME_DAY_VISIT_SUFFIXES.length;
      const day = (index % 28) + 1;
      const status = ['draft', 'in_progress', 'completed', 'locked', 'voided'][
        index % 5
      ];
      return {
        patientId: root.patientId,
        subjectCode: root.subjectCode,
        visitCode: visitCodeFor(
          this.namespace,
          root.ordinal,
          `PAGE-${index + 1}`,
        ),
        visitType: index % 2 === 0 ? 'baseline' : 'follow_up',
        status,
        assessmentDate: isSameDayVisit
          ? new Date(HISTORY_SAME_DAY_ASSESSMENT_DATE.getTime())
          : new Date(
              Date.UTC(2025 + Math.floor(index / 84), index % 12, day, 8),
            ),
        completedAt: ['completed', 'locked', 'voided'].includes(status)
          ? BASE_DATE
          : null,
        lockedAt: status === 'locked' ? BASE_DATE : null,
        voidedAt: status === 'voided' ? BASE_DATE : null,
      };
    });
    await this.models.visits.insertMany(visits);
  }

  private async buildHistoryFilters(root: PatientRoot): Promise<void> {
    const statuses = [
      'draft',
      'in_progress',
      'completed',
      'locked',
      'voided',
    ] as const;
    for (let index = 0; index < statuses.length; index += 1) {
      const visitId = await this.createVisit(
        root,
        `FILTER-${index + 1}`,
        new Date(Date.UTC(2026, 0, 5 + index * 10, 8)),
        {
          status: statuses[index],
          visitType: index % 2 === 0 ? 'baseline' : 'follow_up',
        },
      );
      await this.createInstanceOnly(
        root,
        visitId,
        `FILTER-${index + 1}`,
        index === statuses.length - 1 ? 'legacy_wp04' : 'moca',
      );
    }
  }

  private async buildHistorySourceMatrix(root: PatientRoot): Promise<void> {
    const cases: Array<TrendSourceInput | null> = [
      { suffix: 'NULL', withScore: false },
      { suffix: 'AVAILABLE' },
      {
        suffix: 'NOT-FINAL',
        scoreStatus: 'needs_review',
        domainStatus: 'draft',
      },
      { suffix: 'VOIDED', scoreStatus: 'voided', domainStatus: 'voided' },
      { suffix: 'INCOMPLETE', scoreQuality: 'failed', domainQuality: 'failed' },
      { suffix: 'DOMAIN-MISSING', withDomain: false },
      { suffix: 'DOMAIN-NOT-FINAL', domainStatus: 'draft' },
    ];
    for (let index = 0; index < cases.length; index += 1) {
      const visitId = await this.createVisit(
        root,
        `SOURCE-${index + 1}`,
        new Date(Date.UTC(2026, 1, index + 1, 8)),
      );
      await this.createTrendSource(root, visitId, cases[index]!);
    }
  }

  private async buildHistoryReportSummaryMatrix(
    root: PatientRoot,
    actor: AuthenticatedUserContext,
    key: Wp04BusinessScenarioKey,
  ): Promise<void> {
    await this.createVisit(
      root,
      'SUMMARY-NONE',
      new Date('2026-03-01T08:00:00.000Z'),
    );
    const archived = await this.createReportRoot(
      root,
      actor,
      'SUMMARY-ARCHIVED',
      'confirmed',
    );
    await this.archiveReport(archived, actor, key);
    let corrected = await this.createReportRoot(
      root,
      actor,
      'SUMMARY-V2',
      'confirmed',
    );
    corrected = await this.archiveReport(corrected, actor, key);
    await this.createReplacement(corrected, actor, key);
    const incomplete = await this.createReportRoot(
      root,
      actor,
      'SUMMARY-INCOMPLETE',
      'draft',
    );
    await this.models.reports
      .updateOne(
        { _id: new Types.ObjectId(incomplete.report.id) },
        { $set: { status: 'invalid_wp04' } },
      )
      .exec();
  }

  private async buildReportVersionScenario(
    root: PatientRoot,
    actor: AuthenticatedUserContext,
    key: Wp04BusinessScenarioKey,
  ): Promise<void> {
    if (key === 'report_versions_none') {
      await this.createVisit(root, 'VERSIONS', BASE_DATE);
      return;
    }
    let reportRoot = await this.createReportRoot(
      root,
      actor,
      'VERSIONS',
      key === 'report_versions_v1' ? 'draft' : 'confirmed',
    );
    const target =
      key === 'report_versions_v2'
        ? 2
        : key === 'report_versions_v3' ||
            key === 'report_versions_lineage_invalid'
          ? 3
          : key === 'report_versions_long_chain'
            ? 21
            : 1;
    for (let version = 1; version < target; version += 1) {
      reportRoot = await this.archiveReport(reportRoot, actor, key);
      reportRoot = await this.createReplacement(reportRoot, actor, key);
      if (version + 1 < target) {
        reportRoot = await this.confirmReplacement(reportRoot, actor, key);
      }
    }
    if (key === 'report_versions_lineage_invalid') {
      const second = await this.models.reports
        .findOne({ patientId: root.patientId, reportVersion: 2 })
        .exec();
      if (!second) throw fixtureFailure(key, 'Expected V2 was not created');
      await this.models.reports
        .updateOne({ _id: second._id }, { $set: { reportVersion: 4 } })
        .exec();
    }
    if (key === 'report_versions_incomplete') {
      await this.models.reports
        .updateOne(
          { _id: new Types.ObjectId(reportRoot.report.id) },
          { $set: { status: 'invalid_wp04' } },
        )
        .exec();
    }
  }

  private async buildReportDetailScenario(
    root: PatientRoot,
    actor: AuthenticatedUserContext,
    key: Wp04BusinessScenarioKey,
  ): Promise<void> {
    const suffix = key.replace('report_detail_', 'DETAIL-').toUpperCase();
    if (key === 'report_detail_draft') {
      await this.createReportRoot(root, actor, suffix, 'draft');
      return;
    }
    if (key === 'report_detail_pending_confirmation') {
      const reportRoot = await this.createReportRoot(
        root,
        actor,
        suffix,
        'draft',
      );
      await this.workflows.review.updateDraft(
        reportRoot.patientId.toString(),
        reportRoot.visitId.toString(),
        reportRoot.report.id,
        actor,
        {
          doctorOpinion: 'WP-04 pending detail reviewed opinion',
          recommendationText: 'WP-04 pending detail recommendation',
          editNote: 'WP-04 pending detail controlled edit',
          expectedUpdatedAt: reportTimestamp(reportRoot.report, key),
        },
      );
      const edited = await this.reloadReport(reportRoot, key);
      await this.workflows.review.submitForConfirmation(
        edited.patientId.toString(),
        edited.visitId.toString(),
        edited.report.id,
        actor,
        {
          confirm: true,
          submissionNote: 'WP-04 de-identified submission',
          expectedUpdatedAt: reportTimestamp(edited.report, key),
        },
      );
      return;
    }
    let reportRoot = await this.createReportRoot(
      root,
      actor,
      suffix,
      'confirmed',
    );
    if (key === 'report_detail_confirmed') return;
    if (key === 'report_detail_archived' || key === 'report_detail_corrected') {
      reportRoot = await this.archiveReport(reportRoot, actor, key);
      if (key === 'report_detail_corrected')
        await this.createReplacement(reportRoot, actor, key);
      return;
    }
    if (key === 'report_detail_voided') {
      await this.models.reports
        .updateOne(
          { _id: new Types.ObjectId(reportRoot.report.id) },
          {
            $set: {
              status: 'voided',
              voidedAt: BASE_DATE,
              voidedBy: new Types.ObjectId(actor.id),
            },
          },
        )
        .exec();
      return;
    }
    await this.models.reports
      .updateOne(
        { _id: new Types.ObjectId(reportRoot.report.id) },
        {
          $set: { status: 'invalid_wp04' },
          $unset: { narrative: 1 },
        },
      )
      .exec();
  }

  private async buildTrendDataStatusMatrix(root: PatientRoot): Promise<void> {
    const inputs: Array<TrendSourceInput | null> = [
      { suffix: 'AVAILABLE' },
      null,
      {
        suffix: 'NOT-FINAL',
        instanceStatus: 'in_progress',
        scoreStatus: 'needs_review',
      },
      { suffix: 'VOIDED', scoreStatus: 'voided' },
      { suffix: 'INCOMPLETE', scoreQuality: 'failed' },
      { suffix: 'AMBIGUOUS-1', instanceNo: 1 },
    ];
    for (let index = 0; index < inputs.length; index += 1) {
      const visitId = await this.createVisit(
        root,
        `STATUS-${index + 1}`,
        new Date(Date.UTC(2026, 3, index + 1, 8)),
      );
      if (inputs[index])
        await this.createTrendSource(root, visitId, inputs[index]!);
      if (index === 5) {
        await this.createTrendSource(root, visitId, {
          suffix: 'AMBIGUOUS-2',
          instanceNo: 2,
        });
      }
    }
  }

  private async buildComparablePair(root: PatientRoot): Promise<void> {
    const first = await this.createVisit(
      root,
      'PAIR-1',
      new Date('2026-04-01T08:00:00.000Z'),
    );
    const second = await this.createVisit(
      root,
      'PAIR-2',
      new Date('2026-04-02T08:00:00.000Z'),
    );
    await this.createTrendSource(root, first, {
      suffix: 'PAIR-1',
      scoreValue: 20,
    });
    await this.createTrendSource(root, second, {
      suffix: 'PAIR-2',
      scoreValue: 22,
    });
  }

  private async buildTotalScenario(
    root: PatientRoot,
    key: Wp04BusinessScenarioKey,
  ): Promise<void> {
    const first = await this.createVisit(
      root,
      'TOTAL-1',
      new Date('2026-05-01T08:00:00.000Z'),
    );
    const second = await this.createVisit(
      root,
      'TOTAL-2',
      new Date('2026-05-02T08:00:00.000Z'),
    );
    const left: TrendSourceInput = { suffix: 'TOTAL-1', scoreValue: 20 };
    const right: TrendSourceInput = { suffix: 'TOTAL-2', scoreValue: 22 };
    if (key === 'trend_scale_version_changed') right.scaleVersion = '2';
    if (key === 'trend_crf_version_changed') right.crfVersion = 'crf-2';
    if (key === 'trend_scoring_rule_changed')
      right.scoringRuleVersion = 'score-2';
    if (key === 'trend_field_encoding_changed')
      right.fieldEncodingVersion = 'field-2';
    if (key === 'trend_administration_mode_changed')
      right.administrationMode = 'paper_import';
    if (key === 'trend_score_range_changed') right.scoreMax = 40;
    if (key === 'trend_multiple_reasons') {
      right.scaleVersion = '2';
      right.crfVersion = 'crf-2';
      right.scoringRuleVersion = 'score-2';
      right.fieldEncodingVersion = 'field-2';
    }
    await this.createTrendSource(root, first, left);
    await this.createTrendSource(root, second, right);
  }

  private async buildMissingBreak(root: PatientRoot): Promise<void> {
    const first = await this.createVisit(
      root,
      'BREAK-1',
      new Date('2026-05-01T08:00:00.000Z'),
    );
    await this.createVisit(
      root,
      'BREAK-2',
      new Date('2026-05-02T08:00:00.000Z'),
    );
    const third = await this.createVisit(
      root,
      'BREAK-3',
      new Date('2026-05-03T08:00:00.000Z'),
    );
    await this.createTrendSource(root, first, {
      suffix: 'BREAK-1',
      scoreValue: 20,
    });
    await this.createTrendSource(root, third, {
      suffix: 'BREAK-3',
      scoreValue: 24,
    });
  }

  private async buildDomainScenario(
    root: PatientRoot,
    key: Wp04BusinessScenarioKey,
  ): Promise<void> {
    const first = await this.createVisit(
      root,
      'DOMAIN-1',
      new Date('2026-05-01T08:00:00.000Z'),
    );
    const second = await this.createVisit(
      root,
      'DOMAIN-2',
      new Date('2026-05-02T08:00:00.000Z'),
    );
    const left: TrendSourceInput = {
      suffix: 'DOMAIN-1',
      scoreValue: 20,
      domains: [
        { domainCode: 'attention', scoreValue: 4, minScore: 0, maxScore: 5 },
        { domainCode: 'memory', scoreValue: 10, minScore: 0, maxScore: 15 },
      ],
    };
    const right: TrendSourceInput = {
      suffix: 'DOMAIN-2',
      scoreValue: 22,
      domains: [
        { domainCode: 'attention', scoreValue: 4.5, minScore: 0, maxScore: 5 },
        { domainCode: 'memory', scoreValue: 11, minScore: 0, maxScore: 15 },
      ],
    };
    if (key === 'trend_domain_mapping_version_changed')
      right.mappingVersion = 'domain-2';
    if (key === 'trend_domain_mapping_source_changed')
      right.mappingSource = 'manual';
    if (key === 'trend_domain_mapping_mode_changed')
      right.mappingMode = 'weighted_mapping';
    if (key === 'trend_domain_set_changed') right.domains = [right.domains![0]];
    if (key === 'trend_domain_range_changed')
      right.domains![1] = {
        domainCode: 'memory',
        scoreValue: 11,
        minScore: 0,
        maxScore: 20,
      };
    if (key === 'trend_domain_partially_comparable')
      right.domains![1] = {
        domainCode: 'memory',
        scoreValue: 11,
        minScore: 0,
        maxScore: 20,
      };
    if (key === 'trend_domain_unavailable') right.withDomain = false;
    await this.createTrendSource(root, first, left);
    await this.createTrendSource(root, second, right);
  }

  private async createVisitRange(
    root: PatientRoot,
    count: number,
  ): Promise<void> {
    await this.models.visits.insertMany(
      Array.from({ length: count }, (_, index) => ({
        patientId: root.patientId,
        subjectCode: root.subjectCode,
        visitCode: visitCodeFor(
          this.namespace,
          root.ordinal,
          `RANGE-${index + 1}`,
        ),
        visitType: 'follow_up',
        status: 'completed',
        assessmentDate: new Date(
          Date.UTC(2024 + Math.floor(index / 365), 0, index + 1, 8),
        ),
        completedAt: BASE_DATE,
      })),
    );
  }

  private async createReportRoot(
    root: PatientRoot,
    actor: AuthenticatedUserContext,
    suffix: string,
    initialStatus: 'draft' | 'confirmed',
  ): Promise<ReportRoot> {
    const visitId = await this.createVisit(root, suffix, BASE_DATE, {
      status: 'completed',
      visitType: 'baseline',
    });
    const source = await this.createReportSource(root, visitId, actor, suffix);
    const confirmation =
      initialStatus === 'confirmed'
        ? {
            confirmedAt: BASE_DATE,
            confirmedBy: new Types.ObjectId(actor.id),
            confirmedByName: actor.displayName,
            confirmedByRole: 'doctor' as const,
            confirmationNote: 'WP-04 de-identified confirmation',
          }
        : null;
    const metadata: Record<string, unknown> = {
      a20Generation: {
        version: 1,
        generationId: randomUUID(),
        generatedAt: BASE_DATE,
        generatedBy: actor.id,
        generatedByName: actor.displayName,
        generatedByRole: 'doctor',
        engineVersion: 'a20-clinical-report-draft-1.0',
        reportScope: 'explicit_primary_scale_instances',
        primaryScaleInstanceIds: [source.instanceId.toString()],
        scoreResultIds: [source.scoreId.toString()],
        cognitiveDomainResultIds: [source.domainId.toString()],
        mediaEvidenceCount: 1,
        aiUsed: false,
      },
    };
    if (initialStatus === 'confirmed') {
      metadata.a21Submission = {
        version: 1,
        submissionId: randomUUID(),
        submittedAt: BASE_DATE,
        submittedBy: actor.id,
        submittedByName: actor.displayName,
        submittedByRole: 'doctor',
        submissionNote: 'WP-04 de-identified submission',
      };
      metadata.a21Confirmation = {
        version: 1,
        confirmationId: randomUUID(),
        confirmedAt: BASE_DATE,
        confirmedBy: actor.id,
        confirmedByName: actor.displayName,
        confirmedByRole: 'doctor',
        confirmationNote: 'WP-04 de-identified confirmation',
      };
    }
    const report = await this.models.reports.create({
      patientId: root.patientId,
      assessmentVisitId: visitId,
      primaryScaleInstanceIds: [source.instanceId],
      scoreResultIds: [source.scoreId],
      cognitiveDomainResultIds: [source.domainId],
      mediaEvidenceIds: [source.evidenceId],
      subjectCode: root.subjectCode,
      reportCode: `${subjectCodeFor(this.namespace, root.ordinal)}-${suffix}-RPT-V1`,
      reportType: 'cognitive_assessment',
      status: initialStatus,
      reportVersion: 1,
      source: initialStatus === 'confirmed' ? 'mixed' : 'system_draft',
      patientSnapshot: {
        subjectCode: root.subjectCode,
        displayName: 'WP-04 脱敏受试者',
        sex: 'unknown',
      },
      visitSnapshot: {
        visitCode: visitCodeFor(this.namespace, root.ordinal, suffix),
        visitType: 'baseline',
        assessmentDate: BASE_DATE,
        operatorName: actor.displayName,
        operatorRole: 'doctor',
      },
      scaleTraces: [
        {
          scaleInstanceId: source.instanceId,
          scaleCode: 'moca',
          scaleVersion: '1.0',
          crfVersion: 'crf-1',
          scoringRuleVersion: 'score-1',
          fieldEncodingVersion: 'field-1',
          domainMappingVersion: 'domain-1',
        },
      ],
      scoreSnapshots: [
        {
          scoreResultId: source.scoreId,
          scaleCode: 'moca',
          scaleVersion: '1.0',
          totalScoreValue: 20,
          totalMaxScore: 30,
          totalMinScore: 0,
          scorePercent: (20 / 30) * 100,
          scoreStatus: 'confirmed',
          qualityStatus: 'passed',
        },
      ],
      domainSnapshots: [
        {
          cognitiveDomainResultId: source.domainId,
          scaleCode: 'moca',
          domainCode: 'memory',
          scoreValue: 10,
          maxScore: 15,
          scorePercent: (10 / 15) * 100,
          itemCount: 1,
        },
      ],
      evidenceSnapshots: [
        {
          mediaEvidenceId: source.evidenceId,
          itemResponseId: source.itemId,
          scaleCode: 'moca',
          itemCode: 'moca.wp04.fixture.item',
          evidenceType: 'photo',
          captureMode: 'photo_upload',
          qualityStatus: 'passed',
          storageObjectKey: `wp04/${this.namespace}/${root.ordinal}/evidence.png`,
        },
      ],
      narrative: {
        chiefSummary: 'WP-04 de-identified summary',
        scoreSummary: 'WP-04 de-identified score summary',
        domainSummary: 'WP-04 de-identified domain summary',
        evidenceSummary: 'WP-04 de-identified evidence summary',
        trendSummary: 'WP-04 de-identified trend summary',
        recommendationText: 'WP-04 de-identified recommendation',
        doctorOpinion: 'WP-04 de-identified opinion',
        limitations: 'WP-04 de-identified limitations',
      },
      aiDraft: { status: 'not_requested', doctorEdited: false },
      confirmation,
      correctionRecords: [],
      auditLogRefs: [],
      qualityStatus: initialStatus === 'confirmed' ? 'passed' : 'unchecked',
      metadata,
    });
    const summary = await this.reportsService.findReportByOwnership({
      reportId: report._id.toString(),
      patientId: root.patientId.toString(),
      assessmentVisitId: visitId.toString(),
    });
    if (!summary) throw new Error('WP-04 report fixture could not be reloaded');
    return { ...root, visitId, report: summary };
  }

  private async createReportSource(
    root: PatientRoot,
    visitId: Types.ObjectId,
    actor: AuthenticatedUserContext,
    suffix: string,
  ) {
    const instanceId = new Types.ObjectId();
    const itemId = new Types.ObjectId();
    const evidenceId = new Types.ObjectId();
    const scoreId = new Types.ObjectId();
    const domainId = new Types.ObjectId();
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const instanceCode = instanceCodeFor(this.namespace, root.ordinal, suffix);
    await this.models.scaleInstances.create({
      _id: instanceId,
      patientId: root.patientId,
      assessmentVisitId: visitId,
      subjectCode: root.subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode,
      instanceNo: 1,
      status: 'completed',
      administrationMode: 'clinician_administered',
      versionTrace: {
        crfVersion: 'crf-1',
        scoringRuleVersion: 'score-1',
        fieldEncodingVersion: 'field-1',
      },
      completedAt: BASE_DATE,
    });
    await this.models.itemResponses.create({
      _id: itemId,
      patientId: root.patientId,
      assessmentVisitId: visitId,
      scaleInstanceId: instanceId,
      subjectCode: root.subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode,
      itemCode: 'moca.wp04.fixture.item',
      itemOrder: 1,
      responseType: 'text',
      countsTowardTotal: true,
      cognitiveDomainCodes: ['memory'],
      status: 'answered',
      answerSource: 'clinician_recorded',
      rawResponse: 'de-identified fixture response',
      isMissing: false,
      score: {
        scoreValue: 1,
        maxScore: 1,
        minScore: 0,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        scoredAt: BASE_DATE,
        scoredBy: new Types.ObjectId(actor.id),
      },
      evidenceRefs: [],
    });
    await this.models.mediaEvidence.create({
      _id: evidenceId,
      patientId: root.patientId,
      assessmentVisitId: visitId,
      scaleInstanceId: instanceId,
      itemResponseId: itemId,
      subjectCode: root.subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode,
      itemCode: 'moca.wp04.fixture.item',
      evidenceCode: `${subjectCodeFor(this.namespace, root.ordinal)}-EVD-${suffix}`,
      evidenceType: 'photo',
      captureMode: 'photo_upload',
      status: 'attached',
      storageStatus: 'stored',
      countsTowardTotal: true,
      cognitiveDomainCodes: ['memory'],
      itemSnapshot: { itemCode: 'moca.wp04.fixture.item' },
      versionTrace: { scaleVersion: '1.0' },
      storage: {
        storageDriver: 'fake',
        bucket: 'wp04-test',
        objectKey: `wp04/${this.namespace}/${root.ordinal}/evidence.png`,
        objectPrefix: `wp04/${this.namespace}/${root.ordinal}`,
        mimeType: 'image/png',
        fileExtension: 'png',
        sizeBytes: 128,
        checksum: `${this.namespace}-${root.ordinal}`,
        checksumAlgorithm: 'sha256',
        storedAt: BASE_DATE,
      },
      qualityStatus: 'acceptable',
    });
    await this.models.scoreResults.create({
      _id: scoreId,
      patientId: root.patientId,
      assessmentVisitId: visitId,
      scaleInstanceId: instanceId,
      subjectCode: root.subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode,
      scoreResultCode: `${subjectCodeFor(this.namespace, root.ordinal)}-SCR-${suffix}`,
      runNo: 1,
      status: 'confirmed',
      scoringSource: 'manual',
      scoringMode: 'manual_summary',
      versionTrace: {
        scaleVersion: '1.0',
        crfVersion: 'crf-1',
        scoringRuleVersion: 'score-1',
        fieldEncodingVersion: 'field-1',
      },
      totalScore: {
        scoreValue: 20,
        maxScore: 30,
        minScore: 0,
        scorePercent: (20 / 30) * 100,
      },
      itemScores: [],
      groupScores: [],
      computation: {
        computedAt: BASE_DATE,
        computedBy: new Types.ObjectId(actor.id),
        inputItemCount: 1,
        includedItemCount: 1,
        excludedItemCount: 0,
        warningCount: 0,
      },
      review: {
        reviewStatus: 'reviewed',
        reviewedAt: BASE_DATE,
        reviewerId: new Types.ObjectId(actor.id),
        reviewerName: actor.displayName,
      },
      qualityStatus: 'passed',
      confirmedAt: BASE_DATE,
    });
    await this.models.cognitiveDomainResults.create({
      _id: domainId,
      patientId: root.patientId,
      assessmentVisitId: visitId,
      scaleInstanceId: instanceId,
      scoreResultId: scoreId,
      subjectCode: root.subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode,
      domainResultCode: `${subjectCodeFor(this.namespace, root.ordinal)}-DOM-${suffix}`,
      runNo: 1,
      status: 'computed',
      mappingSource: 'scale_config',
      mappingMode: 'item_domain_codes',
      versionTrace: {
        scaleVersion: '1.0',
        crfVersion: 'crf-1',
        scoringRuleVersion: 'score-1',
        fieldEncodingVersion: 'field-1',
        domainMappingVersion: 'domain-1',
      },
      domainScores: [
        {
          domainCode: 'memory',
          scoreValue: 10,
          maxScore: 15,
          minScore: 0,
          scorePercent: (10 / 15) * 100,
          itemCount: 1,
        },
      ],
      itemContributions: [],
      mappingSnapshot: {
        mappingVersion: 'domain-1',
        mappingSource: 'scale_config',
        domainCodes: ['memory'],
      },
      computation: {
        computedAt: BASE_DATE,
        computedBy: new Types.ObjectId(actor.id),
        inputItemCount: 1,
        contributionCount: 1,
        domainCount: 1,
        includedContributionCount: 1,
        excludedContributionCount: 0,
        warningCount: 0,
      },
      review: { reviewStatus: 'not_required' },
      qualityStatus: 'passed',
    });
    return { instanceId, itemId, evidenceId, scoreId, domainId };
  }

  private async reloadReport(
    root: ReportRoot,
    scenarioKey: Wp04BusinessScenarioKey,
  ): Promise<ReportRoot> {
    const report = await this.reportsService.findReportByOwnership({
      reportId: root.report.id,
      patientId: root.patientId.toString(),
      assessmentVisitId: root.visitId.toString(),
    });
    if (!report)
      throw fixtureFailure(scenarioKey, 'Report could not be reloaded');
    return { ...root, report };
  }

  private async archiveReport(
    root: ReportRoot,
    actor: AuthenticatedUserContext,
    key: Wp04BusinessScenarioKey,
  ): Promise<ReportRoot> {
    await this.workflows.lock.lockClinicalReport(
      root.patientId.toString(),
      root.visitId.toString(),
      root.report.id,
      actor,
      {
        confirm: true,
        lockNote: 'WP-04 controlled lock',
        expectedUpdatedAt: reportTimestamp(root.report, key),
      },
    );
    root = await this.reloadReport(root, key);
    await this.workflows.freeze.freezeClinicalReportSources(
      root.patientId.toString(),
      root.visitId.toString(),
      root.report.id,
      actor,
      {
        confirm: true,
        freezeNote: 'WP-04 controlled source freeze',
        expectedUpdatedAt: reportTimestamp(root.report, key),
      },
    );
    root = await this.reloadReport(root, key);
    await this.workflows.archive.archiveClinicalReport(
      root.patientId.toString(),
      root.visitId.toString(),
      root.report.id,
      actor,
      {
        confirm: true,
        archiveNote: 'WP-04 controlled archive',
        expectedUpdatedAt: reportTimestamp(root.report, key),
      },
    );
    return this.reloadReport(root, key);
  }

  private async createReplacement(
    root: ReportRoot,
    actor: AuthenticatedUserContext,
    key: Wp04BusinessScenarioKey,
  ): Promise<ReportRoot> {
    await this.workflows.correction.createClinicalReportCorrection(
      root.patientId.toString(),
      root.visitId.toString(),
      root.report.id,
      actor,
      {
        confirm: true,
        correctionReason: 'WP-04 de-identified correction reason',
        changeSummary: 'WP-04 de-identified change summary',
        expectedUpdatedAt: reportTimestamp(root.report, key),
      },
    );
    const replacement = await this.reportsService.findLatestReportByVisitId(
      root.visitId.toString(),
    );
    if (
      !replacement ||
      replacement.reportVersion !== root.report.reportVersion + 1
    ) {
      throw fixtureFailure(
        key,
        'Replacement version was not created continuously',
      );
    }
    return { ...root, report: replacement };
  }

  private async confirmReplacement(
    root: ReportRoot,
    actor: AuthenticatedUserContext,
    key: Wp04BusinessScenarioKey,
  ): Promise<ReportRoot> {
    const versionLabel = `V${root.report.reportVersion}`;
    await this.workflows.review.updateDraft(
      root.patientId.toString(),
      root.visitId.toString(),
      root.report.id,
      actor,
      {
        doctorOpinion: `WP-04 ${versionLabel} reviewed opinion`,
        recommendationText: `WP-04 ${versionLabel} reviewed recommendation`,
        editNote: `WP-04 ${versionLabel} controlled edit`,
        expectedUpdatedAt: reportTimestamp(root.report, key),
      },
    );
    root = await this.reloadReport(root, key);
    await this.workflows.review.submitForConfirmation(
      root.patientId.toString(),
      root.visitId.toString(),
      root.report.id,
      actor,
      {
        confirm: true,
        submissionNote: 'WP-04 controlled submission',
        expectedUpdatedAt: reportTimestamp(root.report, key),
      },
    );
    root = await this.reloadReport(root, key);
    await this.workflows.review.confirmReport(
      root.patientId.toString(),
      root.visitId.toString(),
      root.report.id,
      actor,
      {
        confirm: true,
        confirmationNote: 'WP-04 controlled confirmation',
        expectedUpdatedAt: reportTimestamp(root.report, key),
      },
    );
    return this.reloadReport(root, key);
  }
}
