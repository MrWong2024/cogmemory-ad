import type {
  ScoreItemSource,
  ScoreItemStatus,
  ScoreQualityStatus,
  ScoreResultStatus,
  ScoreReviewStatus,
  ScoringSource,
} from '../schemas/score-result.schema';
import type {
  ScoreGroupSummary,
  ScoreItemSummary,
  TotalScoreSummary,
} from '../services/scoring.service';

export const PROVISIONAL_SCORING_ENGINE_VERSION = 'a17-provisional-1.0';

export const SCORE_REVIEW_REASON_CODES = [
  'MANUAL_SCORING_REQUIRED',
  'UNSUPPORTED_SCORING_MODE',
  'MISSING_RESPONSE_REQUIRES_REVIEW',
  'PREEXISTING_ITEM_SCORE_REQUIRES_REVIEW',
  'STEP_CONFIGURATION_INVALID',
  'STEP_RESPONSE_MISSING',
  'STEP_RESPONSE_TYPE_UNSUPPORTED',
  'AGGREGATION_RULE_UNSUPPORTED',
  'AGGREGATION_RULE_INVALID',
  'ITEM_SCORE_RANGE_INVALID',
  'AUTO_SCORE_RESULT_INVALID',
  'NON_SCORING_PROCESS_ITEM',
] as const;

export type ScoreReviewReasonCode = (typeof SCORE_REVIEW_REASON_CODES)[number];

export const SCORE_COMPUTATION_WARNING_CODES = [
  'NO_SCORING_ITEMS',
  'UNKNOWN_GROUP_CONFIGURATION',
] as const;

export type ScoreComputationWarningCode =
  (typeof SCORE_COMPUTATION_WARNING_CODES)[number];

export type ProvisionalItemScore = ScoreItemSummary & {
  scoreStatus: ScoreItemStatus;
  scoreSource: ScoreItemSource;
  note: ScoreReviewReasonCode | undefined;
};

export type ProvisionalItemEvaluation = {
  itemScores: ProvisionalItemScore[];
  warningCodes: ScoreComputationWarningCode[];
};

export type ProvisionalScoringResult = {
  itemScores: ProvisionalItemScore[];
  groupScores: ScoreGroupSummary[];
  totalScore: TotalScoreSummary;
  resultStatus: Extract<ScoreResultStatus, 'computed' | 'needs_review'>;
  scoringSource: ScoringSource;
  reviewStatus: Extract<ScoreReviewStatus, 'not_required' | 'pending'>;
  qualityStatus: Extract<ScoreQualityStatus, 'unchecked' | 'needs_review'>;
  warningCodes: ScoreComputationWarningCode[];
  autoScoredItemCount: number;
  pendingReviewItemCount: number;
  excludedItemCount: number;
};
