import type {
  ConfirmScoreResultRequest,
  ProvisionalScoreItem,
  ProvisionalScoreResult,
  ReviewScoreItemRequest,
} from '@/src/features/assessments/types/provisional-scoring';
import type { AssessmentVisitStatus } from '@/src/features/patients/types/patient';

export const SCORE_REVIEW_NOTE_MIN_LENGTH = 3;
export const SCORE_REVIEW_NOTE_MAX_LENGTH = 2000;

export type ManualScoreReviewDraft = {
  itemResponseId: string;
  scoreValue: string;
  reviewNote: string;
  initialScoreValue: string;
  initialReviewNote: string;
  baseUpdatedAt: string;
  stale: boolean;
};

export type ScoreResultConfirmationDraft = {
  reviewNote: string;
  confirmed: boolean;
  baseUpdatedAt: string;
  stale: boolean;
};

export type ScoreConfirmationEligibilityInput = {
  result: ProvisionalScoreResult;
  reviewQueueLength: number;
  instanceStatus: AssessmentVisitStatus;
  visitStatus: AssessmentVisitStatus;
  hasManualReviewDraft: boolean;
  scoreWriteInProgress: boolean;
  submitInProgress: boolean;
  answerWriteCount: number;
  mediaWriteCount: number;
  unsavedAnswerCount: number;
  pendingMediaCount: number;
};

export function hasValidScoreRange(item: ProvisionalScoreItem): boolean {
  return (
    typeof item.minScore === 'number' &&
    Number.isFinite(item.minScore) &&
    typeof item.maxScore === 'number' &&
    Number.isFinite(item.maxScore) &&
    item.minScore <= item.maxScore
  );
}

export function createManualScoreReviewDraft(
  item: ProvisionalScoreItem,
  updatedAt: string,
): ManualScoreReviewDraft | null {
  if (!item.itemResponseId) {
    return null;
  }
  const scoreValue =
    item.scoreStatus === 'manual_scored' &&
    typeof item.provisionalScoreValue === 'number' &&
    Number.isFinite(item.provisionalScoreValue)
      ? String(item.provisionalScoreValue)
      : '';
  const reviewNote =
    item.scoreStatus === 'manual_scored' ? item.manualReview?.reviewNote ?? '' : '';

  return {
    itemResponseId: item.itemResponseId,
    scoreValue,
    reviewNote,
    initialScoreValue: scoreValue,
    initialReviewNote: reviewNote,
    baseUpdatedAt: updatedAt,
    stale: false,
  };
}

export function manualScoreReviewDraftIsDirty(
  draft: ManualScoreReviewDraft | null,
): boolean {
  return Boolean(
    draft &&
      (draft.scoreValue !== draft.initialScoreValue ||
        draft.reviewNote !== draft.initialReviewNote),
  );
}

export function confirmationDraftIsDirty(
  draft: ScoreResultConfirmationDraft | null,
): boolean {
  return Boolean(draft && draft.reviewNote.length > 0);
}

export function buildManualScoreReviewRequest(
  draft: ManualScoreReviewDraft,
  item: ProvisionalScoreItem,
): { ok: true; input: ReviewScoreItemRequest } | { ok: false; message: string } {
  if (!hasValidScoreRange(item)) {
    return { ok: false, message: '该题分值范围配置不可用，当前不能人工评分。' };
  }
  if (draft.scoreValue.trim() === '') {
    return { ok: false, message: '请输入人工分值。' };
  }
  const scoreValue = Number(draft.scoreValue);
  if (!Number.isFinite(scoreValue)) {
    return { ok: false, message: '人工分值必须是有限数值。' };
  }
  if (scoreValue < item.minScore! || scoreValue > item.maxScore!) {
    return { ok: false, message: '人工分值超出该题允许范围。' };
  }
  const reviewNote = draft.reviewNote.trim();
  if (
    reviewNote.length < SCORE_REVIEW_NOTE_MIN_LENGTH ||
    reviewNote.length > SCORE_REVIEW_NOTE_MAX_LENGTH
  ) {
    return { ok: false, message: '人工评分依据需填写 3–2000 个字符。' };
  }
  if (!draft.baseUpdatedAt) {
    return { ok: false, message: '当前评分结果缺少并发版本，请重新加载。' };
  }

  return {
    ok: true,
    input: {
      scoreValue,
      reviewNote,
      expectedUpdatedAt: draft.baseUpdatedAt,
    },
  };
}

export function buildScoreResultConfirmationRequest(
  draft: ScoreResultConfirmationDraft,
):
  | { ok: true; input: ConfirmScoreResultRequest }
  | { ok: false; message: string } {
  const reviewNote = draft.reviewNote.trim();
  if (
    reviewNote.length < SCORE_REVIEW_NOTE_MIN_LENGTH ||
    reviewNote.length > SCORE_REVIEW_NOTE_MAX_LENGTH
  ) {
    return { ok: false, message: '最终确认意见需填写 3–2000 个字符。' };
  }
  if (!draft.confirmed) {
    return { ok: false, message: '请勾选最终确认说明。' };
  }
  if (!draft.baseUpdatedAt) {
    return { ok: false, message: '当前评分结果缺少并发版本，请重新加载。' };
  }

  return {
    ok: true,
    input: {
      confirm: true,
      reviewNote,
      expectedUpdatedAt: draft.baseUpdatedAt,
    },
  };
}

export function getScoreConfirmationBlockReason({
  answerWriteCount,
  hasManualReviewDraft,
  instanceStatus,
  mediaWriteCount,
  pendingMediaCount,
  result,
  reviewQueueLength,
  scoreWriteInProgress,
  submitInProgress,
  unsavedAnswerCount,
  visitStatus,
}: ScoreConfirmationEligibilityInput): string | null {
  if (result.status !== 'computed' || result.isFinal) {
    return '当前评分结果状态不允许最终确认。';
  }
  if (result.review.pendingItemCount > 0 || reviewQueueLength > 0) {
    return '仍有待人工复核项目，暂不能确认。';
  }
  if (!result.totalScore.isComplete) {
    return '服务端标记总分尚未完整，暂不能确认。';
  }
  if (result.computation.warningCodes.length > 0) {
    return '当前评分结果仍存在计算警告，不能忽略后继续确认。';
  }
  if (instanceStatus !== 'completed') {
    return '只有已完成且未锁定、未作废的量表实例可以确认评分。';
  }
  if (!['draft', 'in_progress', 'completed'].includes(visitStatus)) {
    return '当前访视状态不允许确认评分结果。';
  }
  if (!result.updatedAt.trim()) {
    return '当前评分结果缺少并发版本，请重新加载。';
  }
  if (hasManualReviewDraft) {
    return '请先保存或放弃当前人工评分表单。';
  }
  if (scoreWriteInProgress || submitInProgress) {
    return '当前存在评分或提交写请求，请等待完成。';
  }
  if (answerWriteCount > 0 || mediaWriteCount > 0) {
    return '当前仍有题目或媒体写请求，请等待完成。';
  }
  if (unsavedAnswerCount > 0 || pendingMediaCount > 0) {
    return '当前仍有未保存作答或未上传媒体草稿。';
  }
  return null;
}
