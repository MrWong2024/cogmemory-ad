'use client';

import type { FormEvent } from 'react';

import { Button } from '@/src/components/ui/Button';
import { assessmentOperatorRoleLabels } from '@/src/features/assessments/lib/assessment-execution-display';
import {
  formatProvisionalScoreDate,
  formatProvisionalScoreNumber,
} from '@/src/features/assessments/lib/provisional-scoring-display';
import {
  SCORE_REVIEW_NOTE_MAX_LENGTH,
  type ScoreResultConfirmationDraft,
} from '@/src/features/assessments/lib/score-review-draft';
import type {
  ProvisionalScoreResult,
  ScoreResultConfirmationReceipt,
} from '@/src/features/assessments/types/provisional-scoring';

export function ScoreResultConfirmationPanel({
  blockReason,
  draft,
  error,
  isConfirming,
  onChange,
  onClose,
  onConfirm,
  onPrepare,
  onUseLatest,
  receipt,
  result,
  scaleLabel,
}: {
  blockReason: string | null;
  draft: ScoreResultConfirmationDraft | null;
  error: string | null;
  isConfirming: boolean;
  onChange: (next: ScoreResultConfirmationDraft) => void;
  onClose: () => void;
  onConfirm: () => void;
  onPrepare: () => void;
  onUseLatest: () => void;
  receipt: ScoreResultConfirmationReceipt | null;
  result: ProvisionalScoreResult;
  scaleLabel: string;
}) {
  const isReadOnlyFinal =
    result.status === 'confirmed' || result.status === 'locked' || result.isFinal;
  const confirmationReviewNote = result.confirmation?.reviewNote?.trim() ?? '';
  const receiptReviewNote = receipt?.reviewNote?.trim() ?? '';
  const confirmationId =
    receipt?.confirmationId ?? result.confirmation?.confirmationId ?? null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm();
  }

  if (isReadOnlyFinal) {
    return (
      <section
        aria-labelledby="score-confirmation-title"
        className="grid gap-4 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface-muted)] p-5"
      >
        <div>
          <h3
            className="text-xl font-semibold text-[var(--cma-text-strong)]"
            id="score-confirmation-title"
          >
            {result.status === 'locked' ? '已锁定评分结果' : '已确认评分结果'}
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            {result.status === 'locked'
              ? '评分结果已锁定并进入只读状态。'
              : '评分结果已完成最终确认。'}
          </p>
        </div>

        {result.confirmation ? (
          <dl className="grid gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--cma-muted)]">确认时间</dt>
              <dd>{formatProvisionalScoreDate(result.confirmation.confirmedAt)}</dd>
            </div>
            <div>
              <dt className="text-[var(--cma-muted)]">确认操作者</dt>
              <dd>
                {result.confirmation.confirmedBy.operatorName || '未提供'}
                {result.confirmation.confirmedBy.operatorRole
                  ? `（${assessmentOperatorRoleLabels[result.confirmation.confirmedBy.operatorRole]}）`
                  : ''}
              </dd>
            </div>
            {confirmationReviewNote ? (
              <div className="sm:col-span-2">
                <dt className="text-[var(--cma-muted)]">确认意见</dt>
                <dd className="whitespace-pre-wrap break-words">
                  {result.confirmation.reviewNote}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : !receipt ? (
          <p className="text-sm leading-6 text-[var(--cma-muted)]">
            当前安全查询未提供完整确认审计信息。
          </p>
        ) : null}

        {receipt ? (
          <div
            aria-live="polite"
            className="grid gap-1 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] p-4 text-sm text-[var(--cma-info)]"
          >
            <p className="font-semibold">
              {receipt.alreadyConfirmed
                ? '该评分结果此前已经确认，本次未重复写入。'
                : '评分结果已确认'}
            </p>
            <p>确认时间：{formatProvisionalScoreDate(receipt.confirmedAt)}</p>
            <p>
              确认操作者：{receipt.confirmedBy.operatorName || '未提供'}
              {receipt.confirmedBy.operatorRole
                ? `（${assessmentOperatorRoleLabels[receipt.confirmedBy.operatorRole]}）`
                : ''}
            </p>
            {receiptReviewNote ? (
              <p className="whitespace-pre-wrap break-words">
                确认意见：{receipt.reviewNote}
              </p>
            ) : null}
          </div>
        ) : null}

        {confirmationId ? (
          <details className="rounded-md border border-[var(--cma-line)] p-4 text-sm">
            <summary className="cursor-pointer font-semibold text-[var(--cma-text-strong)]">
              确认技术信息
            </summary>
            <p className="mt-3 break-all text-[var(--cma-muted)]">
              确认记录标识：{confirmationId}
            </p>
          </details>
        ) : null}

        {draft ? (
          <div
            className="grid gap-3 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-sm text-[var(--cma-warning)]"
            role="status"
          >
            <p>
              当前仍保留一份未提交的本地确认内容；评分结果已只读，不会自动提交。
            </p>
            <div>
              <Button onClick={onClose} size="sm" type="button" variant="secondary">
                放弃本地确认意见
              </Button>
            </div>
          </div>
        ) : null}

        <p className="text-sm leading-6 text-[var(--cma-muted)]">
          评分结果仅用于临床辅助，不应脱离临床背景单独作为诊断结论。
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="score-confirmation-title"
      className="grid gap-4 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface-muted)] p-5"
    >
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="score-confirmation-title"
        >
          最终确认评分结果
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          请核对当前评分结果。最终确认后，评分将进入只读状态。
        </p>
      </div>

      {!draft ? (
        <div className="grid gap-3">
          {error ? (
            <p
              className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4 text-[var(--cma-danger)]"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {blockReason ? (
            <p className="text-sm leading-6 text-[var(--cma-muted)]">
              {blockReason}
            </p>
          ) : (
            <>
              <p className="text-sm leading-6 text-[var(--cma-info)]">
                当前评分完整，可以进行最终确认。
              </p>
              <div>
                <Button disabled={isConfirming} onClick={onPrepare} type="button">
                  准备确认评分结果
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-1 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] p-4">
            <p className="text-xl font-semibold text-[var(--cma-text-strong)]">
              {scaleLabel}：
              {formatProvisionalScoreNumber(
                result.totalScore.provisionalScoreValue,
              )}{' '}
              / {formatProvisionalScoreNumber(result.totalScore.maxScore)}
            </p>
            <p className="text-sm leading-6 text-[var(--cma-muted)]">
              {result.totalScore.scoredItemCount} /{' '}
              {result.totalScore.totalItemCount} 项已评分 ·{' '}
              {result.review.pendingItemCount === 0
                ? '无需额外人工评分'
                : `待人工评分 ${result.review.pendingItemCount}`} ·{' '}
              {result.computation.warningCodes.length === 0
                ? '无计算警告'
                : `计算警告 ${result.computation.warningCodes.length}`}
            </p>
          </div>

          <div className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] p-4">
            <ul className="grid gap-1 text-sm leading-6 text-[var(--cma-text-strong)]">
              {!blockReason ? (
                <li>当前评分项目已全部完成，可以进行最终确认。</li>
              ) : null}
              <li>
                确认后，该评分结果将成为最终评分结果，题目分值不能再人工修改。
              </li>
              <li>
                评分结果仅用于临床辅助，不应脱离临床背景单独作为诊断结论。
              </li>
            </ul>
          </div>

          <div className="grid gap-2">
            <label
              className="font-semibold text-[var(--cma-text-strong)]"
              htmlFor="score-result-confirmation-note"
            >
              确认意见（可选）
            </label>
            <textarea
              className="min-h-32 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-2 text-base outline-none focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isConfirming || draft.stale || Boolean(blockReason)}
              id="score-result-confirmation-note"
              maxLength={SCORE_REVIEW_NOTE_MAX_LENGTH}
              onChange={(event) =>
                onChange({ ...draft, reviewNote: event.target.value })
              }
              value={draft.reviewNote}
            />
            <p className="text-sm text-[var(--cma-muted)]">
              可选，最多 2000 个字符；如有特殊情况或补充说明可在此记录。
            </p>
          </div>

          <div className="flex items-start gap-3">
            <input
              checked={draft.confirmed}
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)]"
              disabled={isConfirming || draft.stale || Boolean(blockReason)}
              id="confirm-final-score-result"
              onChange={(event) =>
                onChange({ ...draft, confirmed: event.target.checked })
              }
              type="checkbox"
            />
            <label
              className="font-semibold text-[var(--cma-text-strong)]"
              htmlFor="confirm-final-score-result"
            >
              我已核对当前评分结果，并明确确认其成为最终评分结果。
            </label>
          </div>

          {draft.stale ? (
            <div
              className="grid gap-3 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-[var(--cma-warning)]"
              role="alert"
            >
              <p>
                确认内容基于旧版评分结果，已取消勾选并禁止提交。请重新核对最新结果。
              </p>
              <div>
                <Button onClick={onUseLatest} size="sm" type="button" variant="secondary">
                  基于最新评分结果重新准备确认
                </Button>
              </div>
            </div>
          ) : null}

          {blockReason ? (
            <p
              className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4 text-[var(--cma-danger)]"
              role="alert"
            >
              {blockReason}
            </p>
          ) : null}

          {error ? (
            <p
              className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4 text-[var(--cma-danger)]"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button
              disabled={
                isConfirming ||
                draft.stale ||
                Boolean(blockReason) ||
                !draft.confirmed
              }
              type="submit"
            >
              {isConfirming ? '正在确认评分结果...' : '确认评分结果'}
            </Button>
            <Button disabled={isConfirming} onClick={onClose} type="button" variant="secondary">
              取消
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
