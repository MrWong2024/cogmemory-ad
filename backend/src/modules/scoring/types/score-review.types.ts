import type { AssessmentOperatorRole } from '../../assessments/schemas/assessment-visit.schema';
import type {
  ScoreGroupSummary,
  ScoreItemSummary,
  ScoreReviewSummary,
  TotalScoreSummary,
} from '../services/scoring.service';
import type {
  ScoreQualityStatus,
  ScoreResultMetadata,
  ScoreResultStatus,
  ScoringSource,
} from '../schemas/score-result.schema';
import type { ScoreReviewReasonCode } from './provisional-scoring.types';

export type ScoreReviewActor = {
  operatorId: string;
  operatorName: string;
  operatorRole: AssessmentOperatorRole;
};

export type A18ManualReviewEvent = {
  eventId: string;
  itemResponseId: string;
  itemCode: string;
  originalReasonCode: ScoreReviewReasonCode;
  previousScoreValue: number | null;
  scoreValue: number;
  reviewNote: string;
  reviewedAt: Date;
  reviewerId: string;
  reviewerName: string;
  reviewerRole: AssessmentOperatorRole;
};

export type ManualScoreReviewPrepared = {
  itemScores: ScoreItemSummary[];
  metadata: Exclude<ScoreResultMetadata, null>;
  event: A18ManualReviewEvent;
};

export type ManualScoreReviewUpdate = ManualScoreReviewPrepared & {
  totalScore: TotalScoreSummary;
  groupScores: ScoreGroupSummary[];
  status: Extract<ScoreResultStatus, 'computed' | 'needs_review'>;
  scoringSource: Extract<ScoringSource, 'auto_rule' | 'mixed' | 'manual'>;
  review: ScoreReviewSummary;
  qualityStatus: Extract<ScoreQualityStatus, 'unchecked' | 'needs_review'>;
  pendingItemCount: number;
};

export type A18ConfirmationAudit = {
  confirmationId: string;
  confirmedAt: Date;
  confirmedBy: string;
  confirmedByName: string;
  confirmedByRole: AssessmentOperatorRole;
  reviewNote: string;
};
