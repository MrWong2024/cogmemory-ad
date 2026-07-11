'use client';

import type { FormEvent } from 'react';

import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import {
  formatProvisionalScoreDate,
  formatProvisionalScoreNumber,
  getScoreReviewReasonMessage,
  scoreItemSourceLabels,
  scoreItemStatusLabels,
} from '@/src/features/assessments/lib/provisional-scoring-display';
import {
  hasValidScoreRange,
  SCORE_REVIEW_NOTE_MAX_LENGTH,
  type ManualScoreReviewDraft,
} from '@/src/features/assessments/lib/score-review-draft';
import { assessmentOperatorRoleLabels } from '@/src/features/assessments/lib/assessment-execution-display';
import type { ProvisionalScoreItem } from '@/src/features/assessments/types/provisional-scoring';

export function ManualScoreReviewForm({
  canLocateItem,
  draft,
  error,
  isDirty,
  isSubmitting,
  item,
  onChange,
  onDiscard,
  onLocateItem,
  onSubmit,
  onUseLatest,
  writeBlockedReason,
}: {
  canLocateItem: boolean;
  draft: ManualScoreReviewDraft;
  error: string | null;
  isDirty: boolean;
  isSubmitting: boolean;
  item: ProvisionalScoreItem;
  onChange: (next: ManualScoreReviewDraft) => void;
  onDiscard: () => void;
  onLocateItem: () => void;
  onSubmit: () => void;
  onUseLatest: () => void;
  writeBlockedReason: string | null;
}) {
  const rangeAvailable = hasValidScoreRange(item);
  const disabled = isSubmitting || draft.stale || Boolean(writeBlockedReason);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <section
      aria-labelledby="manual-score-review-title"
      className="grid gap-4 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface-muted)] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--cma-primary)]">
            第 {item.itemOrder} 题 · {item.itemCode}
          </p>
          <h3
            className="mt-1 text-xl font-semibold text-[var(--cma-text-strong)]"
            id="manual-score-review-title"
          >
            {item.scoreStatus === 'manual_scored' ? '修订人工评分' : '人工评分复核'}
          </h3>
          <p className="mt-1 text-base text-[var(--cma-text-strong)]">
            {item.itemTitle || item.itemCode}
            {item.crfCode ? ` · CRF：${item.crfCode}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">{scoreItemStatusLabels[item.scoreStatus]}</Badge>
          <Badge tone="neutral">{scoreItemSourceLabels[item.scoreSource]}</Badge>
        </div>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[var(--cma-muted)]">服务端分值范围</dt>
          <dd>
            {formatProvisionalScoreNumber(item.minScore)} 至{' '}
            {formatProvisionalScoreNumber(item.maxScore)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--cma-muted)]">当前人工分值</dt>
          <dd>{formatProvisionalScoreNumber(item.provisionalScoreValue)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[var(--cma-muted)]">本次草稿基线</dt>
          <dd>{formatProvisionalScoreDate(draft.baseUpdatedAt)}</dd>
        </div>
      </dl>

      {item.reviewRequired ? (
        <p className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-3 text-sm leading-6 text-[var(--cma-warning)]">
          {getScoreReviewReasonMessage(item.reviewReasonCode)}
        </p>
      ) : null}

      {item.manualReview ? (
        <div className="grid gap-2 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4 text-sm leading-6">
          <p className="font-semibold text-[var(--cma-text-strong)]">
            当前服务端人工评分摘要
          </p>
          <p>
            操作者：{item.manualReview.reviewer.operatorName || '未提供'}
            {item.manualReview.reviewer.operatorRole
              ? `（${assessmentOperatorRoleLabels[item.manualReview.reviewer.operatorRole]}）`
              : ''}
          </p>
          <p>时间：{formatProvisionalScoreDate(item.manualReview.reviewedAt)}</p>
          <p className="whitespace-pre-wrap break-words">
            评分依据：{item.manualReview.reviewNote}
          </p>
        </div>
      ) : null}

      {canLocateItem ? (
        <div>
          <Button onClick={onLocateItem} size="sm" type="button" variant="secondary">
            查看原题
          </Button>
        </div>
      ) : (
        <p className="text-sm text-[var(--cma-muted)]">
          当前评分项目无法定位到安全题目卡片。
        </p>
      )}

      {!rangeAvailable ? (
        <div className="grid gap-3">
          <p
            className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4 text-[var(--cma-danger)]"
            role="alert"
          >
            该题 minScore / maxScore 配置缺失或非法，当前不能开放人工评分表单。
          </p>
          <div>
            <Button onClick={onDiscard} type="button" variant="secondary">
              关闭人工评分区域
            </Button>
          </div>
        </div>
      ) : (
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <label
              className="font-semibold text-[var(--cma-text-strong)]"
              htmlFor={`manual-score-value-${item.itemResponseId}`}
            >
              人工分值
            </label>
            <input
              className="min-h-11 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-2 text-base outline-none focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled}
              id={`manual-score-value-${item.itemResponseId}`}
              max={item.maxScore ?? undefined}
              min={item.minScore ?? undefined}
              onChange={(event) =>
                onChange({ ...draft, scoreValue: event.target.value })
              }
              step="any"
              type="number"
              value={draft.scoreValue}
            />
            <p className="text-sm leading-6 text-[var(--cma-muted)]">
              0 是合法输入。前端不猜测计分步长，步长合法性由服务端量表规则最终校验。
            </p>
          </div>

          <div className="grid gap-2">
            <label
              className="font-semibold text-[var(--cma-text-strong)]"
              htmlFor={`manual-review-note-${item.itemResponseId}`}
            >
              人工评分依据
            </label>
            <textarea
              className="min-h-32 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-2 text-base outline-none focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled}
              id={`manual-review-note-${item.itemResponseId}`}
              maxLength={SCORE_REVIEW_NOTE_MAX_LENGTH}
              onChange={(event) =>
                onChange({ ...draft, reviewNote: event.target.value })
              }
              value={draft.reviewNote}
            />
            <p className="text-sm text-[var(--cma-muted)]">
              trim 后需 3–2000 字符；当前 {draft.reviewNote.length} 字符。
            </p>
          </div>

          {draft.stale ? (
            <div
              className="grid gap-3 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-[var(--cma-warning)]"
              role="alert"
            >
              <p>
                本地输入基于旧版评分结果，已禁止直接提交。请核对最新结果后明确继续。
              </p>
              <div>
                <Button onClick={onUseLatest} size="sm" type="button" variant="secondary">
                  基于最新结果继续
                </Button>
              </div>
            </div>
          ) : null}

          {writeBlockedReason ? (
            <p
              className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4 text-[var(--cma-danger)]"
              role="alert"
            >
              {writeBlockedReason}
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
            <Button disabled={disabled} type="submit">
              {isSubmitting ? '正在保存人工评分...' : '保存人工评分'}
            </Button>
            <Button onClick={onDiscard} type="button" variant="secondary">
              {isDirty ? '放弃本地人工评分输入' : '关闭人工评分表单'}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
