import type {
  AssessmentVisitStatus,
  AssessmentVisitType,
} from '@/src/features/patients/types/patient';

export type ClinicalHistoryAdministrationMode =
  | 'clinician_administered'
  | 'supervised_patient_input'
  | 'paper_import';

export type HistorySourceAvailability =
  | 'available'
  | 'source_not_final'
  | 'source_voided'
  | 'source_incomplete';

export type PatientHistoryScoreStatus =
  | 'draft'
  | 'computed'
  | 'needs_review'
  | 'confirmed'
  | 'locked'
  | 'voided';

export type PatientHistoryQualityStatus =
  | 'unchecked'
  | 'passed'
  | 'needs_review'
  | 'failed';

export type PatientHistoryReportStatus =
  | 'draft'
  | 'pending_confirmation'
  | 'confirmed'
  | 'archived'
  | 'corrected'
  | 'voided';

export type PatientHistoryVersionTrace = {
  scaleVersion: string | null;
  crfVersion: string | null;
  scoringRuleVersion: string | null;
  fieldEncodingVersion: string | null;
};

export type PatientHistoryScoreSummary = {
  availability: HistorySourceAvailability;
  status: PatientHistoryScoreStatus;
  qualityStatus: PatientHistoryQualityStatus;
  totalScoreValue: number | null;
  totalMinScore: number | null;
  totalMaxScore: number | null;
  scorePercent: number | null;
  confirmedAt: string | null;
  lockedAt: string | null;
  versionTrace: PatientHistoryVersionTrace;
};

export type PatientHistoryDomainSummary = {
  availability: HistorySourceAvailability;
  status: PatientHistoryScoreStatus;
  qualityStatus: PatientHistoryQualityStatus;
  mappingVersion: string | null;
  domainCount: number;
  computedAt: string | null;
};

export type PatientHistoryScaleSummary = {
  scaleInstanceId: string;
  instanceCode: string;
  scaleCode: string;
  scaleVersion: string;
  status: AssessmentVisitStatus;
  administrationMode: ClinicalHistoryAdministrationMode;
  startedAt: string | null;
  completedAt: string | null;
  lockedAt: string | null;
  voidedAt: string | null;
  durationMs: number | null;
  scoreSummary: PatientHistoryScoreSummary | null;
  domainSummary: PatientHistoryDomainSummary | null;
};

export type PatientHistoryVisitSummary = {
  id: string;
  visitCode: string;
  visitType: AssessmentVisitType;
  status: AssessmentVisitStatus;
  assessmentDate: string;
  startedAt: string | null;
  completedAt: string | null;
  lockedAt: string | null;
  voidedAt: string | null;
};

export type PatientHistoryReportPointer = {
  id: string;
  reportCode: string;
  reportVersion: number;
  status: PatientHistoryReportStatus;
  createdAt: string;
};

export type PatientHistoryArchivedReportPointer = {
  id: string;
  reportCode: string;
  reportVersion: number;
  status: PatientHistoryReportStatus;
  archivedAt: string;
};

export type PatientHistoryReportSummary = {
  status: 'none' | 'available' | 'incomplete';
  totalVersions: number;
  latest: PatientHistoryReportPointer | null;
  latestArchivedVersion: PatientHistoryArchivedReportPointer | null;
};

export type PatientAssessmentHistoryItem = {
  visit: PatientHistoryVisitSummary;
  scaleSummaries: PatientHistoryScaleSummary[];
  reportSummary: PatientHistoryReportSummary;
};

export type PatientAssessmentHistoryResponse = {
  items: PatientAssessmentHistoryItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type ListPatientAssessmentHistoryQuery = {
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
  visitType?: AssessmentVisitType;
  status?: AssessmentVisitStatus;
  scaleCode?: string;
};

export type TrendDataStatus =
  | 'available'
  | 'source_missing'
  | 'source_not_final'
  | 'source_voided'
  | 'source_incomplete'
  | 'source_ambiguous';

export type TrendComparisonStatus =
  | 'first_point'
  | 'comparable'
  | 'not_comparable'
  | 'unavailable';

export type TrendDomainComparisonStatus =
  | 'comparable'
  | 'partially_comparable'
  | 'not_comparable'
  | 'unavailable';

export type TrendDomainItemComparisonStatus =
  | 'comparable'
  | 'not_comparable';

export type TrendComparisonReasonCode =
  | 'scale_version_changed'
  | 'crf_version_changed'
  | 'scoring_rule_version_changed'
  | 'field_encoding_version_changed'
  | 'administration_mode_changed'
  | 'score_range_changed'
  | 'version_trace_incomplete'
  | 'source_missing'
  | 'source_not_final'
  | 'source_voided'
  | 'source_incomplete'
  | 'source_ambiguous'
  | 'domain_mapping_version_changed'
  | 'domain_mapping_source_changed'
  | 'domain_mapping_mode_changed'
  | 'domain_set_changed'
  | 'domain_range_changed'
  | 'domain_missing'
  | 'domain_source_incomplete';

export type TrendVersionTrace = {
  scaleVersion: string | null;
  crfVersion: string | null;
  scoringRuleVersion: string | null;
  fieldEncodingVersion: string | null;
};

export type TrendScaleInstance = {
  id: string;
  instanceCode: string;
  scaleCode: string;
  scaleVersion: string;
  administrationMode: ClinicalHistoryAdministrationMode;
  status: AssessmentVisitStatus;
  durationMs: number | null;
  versionTrace: TrendVersionTrace;
};

export type TrendScore = {
  status: 'confirmed' | 'locked';
  qualityStatus: 'passed';
  totalScoreValue: number;
  totalMinScore: number;
  totalMaxScore: number;
  scorePercent: number;
  confirmedAt: string;
  lockedAt: string | null;
};

export type TrendDomainScore = {
  domainCode: string;
  domainTitle: string | null;
  scoreValue: number;
  minScore: number;
  maxScore: number;
  scorePercent: number;
  weightedScore: number | null;
  weightedMaxScore: number | null;
  itemCount: number;
};

export type TrendDomainItemComparison = {
  domainCode: string;
  status: TrendDomainItemComparisonStatus;
  reasons: TrendComparisonReasonCode[];
  scoreDelta: number | null;
  scorePercentDelta: number | null;
  weightedScoreDelta: number | null;
};

export type TrendDomainComparison = {
  status: TrendDomainComparisonStatus;
  reasons: TrendComparisonReasonCode[];
  items: TrendDomainItemComparison[];
};

export type TrendComparison = {
  status: TrendComparisonStatus;
  reasons: TrendComparisonReasonCode[];
  scoreDelta: number | null;
  scorePercentDelta: number | null;
  domainDeltas: TrendDomainComparison;
};

export type PatientFollowUpTrendPoint = {
  visit: {
    id: string;
    visitCode: string;
    visitType: AssessmentVisitType;
    status: AssessmentVisitStatus;
    assessmentDate: string;
  };
  scaleInstance: TrendScaleInstance | null;
  dataStatus: TrendDataStatus;
  score: TrendScore | null;
  domains: TrendDomainScore[];
  comparisonToPrevious: TrendComparison;
};

export type PatientFollowUpTrendResponse = {
  scale: {
    scaleCode: string;
    displayName: string;
  };
  range: {
    dateFrom: string | null;
    dateTo: string | null;
    pointCount: number;
  };
  comparabilityPolicy: {
    version: 'wp04-exact-trace-v1';
    comparisonDirection: 'current_minus_immediately_previous';
    totalScoreRequiresExactTrace: true;
    domainScoreRequiresExactMapping: true;
    scorePercentIsNotProbability: true;
    noDiagnosticInterpretation: true;
  };
  points: PatientFollowUpTrendPoint[];
};

export type GetPatientFollowUpTrendQuery = {
  scaleCode: string;
  dateFrom?: string;
  dateTo?: string;
  maxPoints?: number;
};
