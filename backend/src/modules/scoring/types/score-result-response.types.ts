import type {
  ScoreItemSource,
  ScoreItemStatus,
  ScoreQualityStatus,
  ScoreResultStatus,
  ScoreReviewStatus,
  ScoringMode,
  ScoringSource,
} from '../schemas/score-result.schema';
import type { ScaleInstanceListItemResponse } from '../../assessments/types/assessment-execution-response.types';
import type {
  ScoreComputationWarningCode,
  ScoreReviewReasonCode,
} from './provisional-scoring.types';

export type ProvisionalScoreScaleResponse = {
  code: string;
  name: string;
  shortName?: string;
  version: string;
  displayVersion?: string;
};

export type ProvisionalScoreVersionTraceResponse = {
  scaleVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  sourceDocument?: string;
};

export type ProvisionalScoreTotalResponse = {
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

export type ProvisionalScoreGroupResponse = {
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

export type ProvisionalScoreItemResponse = {
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

export type ProvisionalScoreComputationResponse = {
  computedAt: Date | null;
  engineVersion?: string;
  scoringRuleVersion?: string;
  autoScoredItemCount: number;
  pendingReviewItemCount: number;
  excludedItemCount: number;
  warningCodes: ScoreComputationWarningCode[];
};

export type ProvisionalScoreReviewResponse = {
  status: ScoreReviewStatus;
  pendingItemCount: number;
};

export type ProvisionalScoreResultResponse = {
  id: string;
  scoreResultCode: string;
  runNo: number;
  status: ScoreResultStatus;
  scoringSource: ScoringSource;
  scoringMode: ScoringMode;
  versionTrace: ProvisionalScoreVersionTraceResponse | null;
  totalScore: ProvisionalScoreTotalResponse;
  groupScores: ProvisionalScoreGroupResponse[];
  itemScores: ProvisionalScoreItemResponse[];
  computation: ProvisionalScoreComputationResponse;
  review: ProvisionalScoreReviewResponse;
  qualityStatus: ScoreQualityStatus;
  isFinal: boolean;
};

export type ScoreReviewQueueItemResponse = {
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
  scale: ProvisionalScoreScaleResponse;
  scaleInstance: ScaleInstanceListItemResponse;
  scoreResult: ProvisionalScoreResultResponse;
  reviewQueue: ScoreReviewQueueItemResponse[];
};

export type ComputeScoreResultResponse = ScoreResultDetailResponse & {
  alreadyComputed: boolean;
};
