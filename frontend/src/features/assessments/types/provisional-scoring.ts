import type { ScaleInstanceListItem } from '@/src/features/assessments/types/assessment-execution';

export type ScoreReviewReasonCode =
  | 'MANUAL_SCORING_REQUIRED'
  | 'UNSUPPORTED_SCORING_MODE'
  | 'MISSING_RESPONSE_REQUIRES_REVIEW'
  | 'PREEXISTING_ITEM_SCORE_REQUIRES_REVIEW'
  | 'STEP_CONFIGURATION_INVALID'
  | 'STEP_RESPONSE_MISSING'
  | 'STEP_RESPONSE_TYPE_UNSUPPORTED'
  | 'AGGREGATION_RULE_UNSUPPORTED'
  | 'AGGREGATION_RULE_INVALID'
  | 'ITEM_SCORE_RANGE_INVALID'
  | 'AUTO_SCORE_RESULT_INVALID'
  | 'NON_SCORING_PROCESS_ITEM';

export type ScoreComputationWarningCode =
  | 'NO_SCORING_ITEMS'
  | 'UNKNOWN_GROUP_CONFIGURATION';

export type ScoreResultStatus =
  | 'draft'
  | 'computed'
  | 'needs_review'
  | 'confirmed'
  | 'locked'
  | 'voided';

export type ScoringSource = 'auto_rule' | 'manual' | 'imported' | 'mixed';

export type ScoringMode = 'rule_based' | 'manual_summary' | 'imported';

export type ScoreItemStatus =
  | 'not_scored'
  | 'auto_scored'
  | 'manual_scored'
  | 'needs_review';

export type ScoreItemSource = 'none' | 'auto_rule' | 'operator' | 'imported';

export type ScoreReviewStatus =
  | 'not_required'
  | 'pending'
  | 'reviewed'
  | 'rejected';

export type ScoreQualityStatus =
  | 'unchecked'
  | 'passed'
  | 'needs_review'
  | 'failed';

export type ProvisionalScoreScale = {
  code: string;
  name: string;
  shortName?: string;
  version: string;
  displayVersion?: string;
};

export type ProvisionalScoreVersionTrace = {
  scaleVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  sourceDocument?: string;
};

export type ProvisionalScoreTotal = {
  provisionalScoreValue: number | null;
  minScore: number | null;
  maxScore: number | null;
  scorePercent: number | null;
  totalItemCount: number;
  scoredItemCount: number;
  unscoredItemCount: number;
  needsReviewItemCount: number;
  missingItemCount: number;
  isComplete: boolean;
  isFinal: boolean;
};

export type ProvisionalScoreGroup = {
  groupCode: string;
  groupTitle?: string;
  order?: number;
  provisionalScoreValue: number | null;
  minScore: number | null;
  maxScore: number | null;
  scoredItemCount: number;
  unscoredItemCount: number;
  needsReviewItemCount: number;
  missingItemCount: number;
  isComplete: boolean;
};

export type ProvisionalScoreItem = {
  itemResponseId: string | null;
  itemCode: string;
  crfCode?: string;
  groupCode?: string;
  itemTitle?: string;
  itemOrder: number;
  responseType?: string;
  countsTowardTotal: boolean;
  includedInTotal: boolean;
  provisionalScoreValue: number | null;
  minScore: number | null;
  maxScore: number | null;
  scoreStatus: ScoreItemStatus;
  scoreSource: ScoreItemSource;
  isMissing: boolean;
  cognitiveDomainCodes: string[];
  reviewRequired: boolean;
  reviewReasonCode?: ScoreReviewReasonCode;
  reviewReasonMessage?: string;
};

export type ProvisionalScoreComputation = {
  computedAt: string | null;
  engineVersion?: string;
  scoringRuleVersion?: string;
  autoScoredItemCount: number;
  pendingReviewItemCount: number;
  excludedItemCount: number;
  warningCodes: ScoreComputationWarningCode[];
};

export type ProvisionalScoreReview = {
  status: ScoreReviewStatus;
  pendingItemCount: number;
};

export type ProvisionalScoreResult = {
  id: string;
  scoreResultCode: string;
  runNo: number;
  status: ScoreResultStatus;
  scoringSource: ScoringSource;
  scoringMode: ScoringMode;
  versionTrace: ProvisionalScoreVersionTrace | null;
  totalScore: ProvisionalScoreTotal;
  groupScores: ProvisionalScoreGroup[];
  itemScores: ProvisionalScoreItem[];
  computation: ProvisionalScoreComputation;
  review: ProvisionalScoreReview;
  qualityStatus: ScoreQualityStatus;
  isFinal: boolean;
};

export type ScoreReviewQueueItem = {
  itemResponseId: string | null;
  itemCode: string;
  crfCode?: string;
  groupCode?: string;
  itemTitle?: string;
  itemOrder: number;
  responseType?: string;
  countsTowardTotal: boolean;
  reasonCode: ScoreReviewReasonCode;
  reasonMessage: string;
};

export type ScoreResultDetailResponse = {
  scale: ProvisionalScoreScale;
  scaleInstance: ScaleInstanceListItem;
  scoreResult: ProvisionalScoreResult;
  reviewQueue: ScoreReviewQueueItem[];
};

export type ComputeScoreResultRequest = {
  confirm: true;
};

export type ComputeScoreResultResponse = ScoreResultDetailResponse & {
  alreadyComputed: boolean;
};
