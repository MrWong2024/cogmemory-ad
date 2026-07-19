import type {
  AssessmentStatus,
  AssessmentVisitType,
} from '../../assessments/schemas/assessment-visit.schema';
import type { ScaleAdministrationMode } from '../../assessments/schemas/scale-instance.schema';
import type {
  CognitiveDomainQualityStatus,
  CognitiveDomainResultStatus,
} from '../../cognitive-domains/schemas/cognitive-domain-result.schema';
import type {
  ScoreQualityStatus,
  ScoreResultStatus,
} from '../../scoring/schemas/score-result.schema';
import type { ClinicalReportStatus } from '../../reports/schemas/clinical-report.schema';

export type HistorySourceAvailability =
  | 'available'
  | 'source_not_final'
  | 'source_voided'
  | 'source_incomplete';

export type AssessmentHistoryVersionTraceResponse = {
  scaleVersion: string | null;
  crfVersion: string | null;
  scoringRuleVersion: string | null;
  fieldEncodingVersion: string | null;
};

export type AssessmentHistoryScoreSummaryResponse = {
  availability: HistorySourceAvailability;
  status: ScoreResultStatus;
  qualityStatus: ScoreQualityStatus;
  totalScoreValue: number | null;
  totalMinScore: number | null;
  totalMaxScore: number | null;
  scorePercent: number | null;
  confirmedAt: Date | null;
  lockedAt: Date | null;
  versionTrace: AssessmentHistoryVersionTraceResponse;
};

export type AssessmentHistoryDomainSummaryResponse = {
  availability: HistorySourceAvailability;
  status: CognitiveDomainResultStatus;
  qualityStatus: CognitiveDomainQualityStatus;
  mappingVersion: string | null;
  domainCount: number;
  computedAt: Date | null;
};

export type AssessmentHistoryScaleSummaryResponse = {
  scaleInstanceId: string;
  instanceCode: string;
  scaleCode: string;
  scaleVersion: string;
  status: AssessmentStatus;
  administrationMode: ScaleAdministrationMode;
  startedAt: Date | null;
  completedAt: Date | null;
  lockedAt: Date | null;
  voidedAt: Date | null;
  durationMs: number | null;
  scoreSummary: AssessmentHistoryScoreSummaryResponse | null;
  domainSummary: AssessmentHistoryDomainSummaryResponse | null;
};

export type AssessmentHistoryVisitResponse = {
  id: string;
  visitCode: string;
  visitType: AssessmentVisitType;
  status: AssessmentStatus;
  assessmentDate: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  lockedAt: Date | null;
  voidedAt: Date | null;
};

export type AssessmentHistoryReportPointerResponse = {
  id: string;
  reportCode: string;
  reportVersion: number;
  status: ClinicalReportStatus;
  createdAt: Date;
};

export type AssessmentHistoryArchivedReportPointerResponse = {
  id: string;
  reportCode: string;
  reportVersion: number;
  status: ClinicalReportStatus;
  archivedAt: Date;
};

export type AssessmentHistoryReportSummaryResponse = {
  status: 'none' | 'available' | 'incomplete';
  totalVersions: number;
  latest: AssessmentHistoryReportPointerResponse | null;
  latestArchivedVersion: AssessmentHistoryArchivedReportPointerResponse | null;
};

export type PatientAssessmentHistoryItemResponse = {
  visit: AssessmentHistoryVisitResponse;
  scaleSummaries: AssessmentHistoryScaleSummaryResponse[];
  reportSummary: AssessmentHistoryReportSummaryResponse;
};

export type PatientAssessmentHistoryResponse = {
  items: PatientAssessmentHistoryItemResponse[];
  page: number;
  pageSize: number;
  total: number;
};
