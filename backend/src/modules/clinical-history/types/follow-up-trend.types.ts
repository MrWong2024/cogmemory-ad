import type {
  AssessmentStatus,
  AssessmentVisitType,
} from '../../assessments/schemas/assessment-visit.schema';
import type { ScaleAdministrationMode } from '../../assessments/schemas/scale-instance.schema';
import type { ScoreResultStatus } from '../../scoring/schemas/score-result.schema';

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

export type TrendDomainItemComparisonStatus = 'comparable' | 'not_comparable';

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

export type TrendVersionTraceResponse = {
  scaleVersion: string | null;
  crfVersion: string | null;
  scoringRuleVersion: string | null;
  fieldEncodingVersion: string | null;
};

export type TrendScaleInstanceResponse = {
  id: string;
  instanceCode: string;
  scaleCode: string;
  scaleVersion: string;
  administrationMode: ScaleAdministrationMode;
  status: AssessmentStatus;
  durationMs: number | null;
  versionTrace: TrendVersionTraceResponse;
};

export type TrendScoreResponse = {
  status: Extract<ScoreResultStatus, 'confirmed' | 'locked'>;
  qualityStatus: 'passed';
  totalScoreValue: number;
  totalMinScore: number;
  totalMaxScore: number;
  scorePercent: number;
  confirmedAt: Date;
  lockedAt: Date | null;
};

export type TrendDomainScoreResponse = {
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

export type TrendDomainItemComparisonResponse = {
  domainCode: string;
  status: TrendDomainItemComparisonStatus;
  reasons: TrendComparisonReasonCode[];
  scoreDelta: number | null;
  scorePercentDelta: number | null;
  weightedScoreDelta: number | null;
};

export type TrendDomainComparisonResponse = {
  status: TrendDomainComparisonStatus;
  reasons: TrendComparisonReasonCode[];
  items: TrendDomainItemComparisonResponse[];
};

export type TrendComparisonResponse = {
  status: TrendComparisonStatus;
  reasons: TrendComparisonReasonCode[];
  scoreDelta: number | null;
  scorePercentDelta: number | null;
  domainDeltas: TrendDomainComparisonResponse;
};

export type PatientFollowUpTrendPoint = {
  visit: {
    id: string;
    visitCode: string;
    visitType: AssessmentVisitType;
    status: AssessmentStatus;
    assessmentDate: Date;
  };
  scaleInstance: TrendScaleInstanceResponse | null;
  dataStatus: TrendDataStatus;
  score: TrendScoreResponse | null;
  domains: TrendDomainScoreResponse[];
  comparisonToPrevious: TrendComparisonResponse;
};

export type PatientFollowUpTrendResponse = {
  scale: {
    scaleCode: string;
    displayName: string;
  };
  range: {
    dateFrom: Date | null;
    dateTo: Date | null;
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
