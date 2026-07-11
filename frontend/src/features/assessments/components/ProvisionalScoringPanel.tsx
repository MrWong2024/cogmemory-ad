'use client';

import { useEffect, useState } from 'react';

import { Badge, type BadgeTone } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import { ProvisionalScoreGroupList } from '@/src/features/assessments/components/ProvisionalScoreGroupList';
import { ProvisionalScoreItemList } from '@/src/features/assessments/components/ProvisionalScoreItemList';
import { ProvisionalScoreSummary } from '@/src/features/assessments/components/ProvisionalScoreSummary';
import { ScoreReviewQueue } from '@/src/features/assessments/components/ScoreReviewQueue';
import {
  formatProvisionalScoreDate,
  getScoreComputationWarningMessage,
  isScoreComputationWarningCode,
  scoreQualityStatusLabels,
  scoreResultStatusLabels,
  scoreReviewStatusLabels,
  scoringModeLabels,
  scoringSourceLabels,
} from '@/src/features/assessments/lib/provisional-scoring-display';
import type { ScoreResultDetailResponse } from '@/src/features/assessments/types/provisional-scoring';
import type { AssessmentVisitStatus } from '@/src/features/patients/types/patient';

export type ProvisionalScoreQueryStatus =
  | 'idle'
  | 'loading'
  | 'no_result'
  | 'loaded'
  | 'forbidden'
  | 'error';

const resultStatusTones: Record<string, BadgeTone> = {
  draft: 'neutral',
  computed: 'info',
  needs_review: 'warning',
  confirmed: 'success',
  locked: 'warning',
  voided: 'warning',
};

export function ProvisionalScoringPanel({
  alreadyComputed,
  canCompute,
  canLocateItem,
  computationError,
  computationStatus,
  computeBlockReason,
  confirmationVisible,
  instanceStatus,
  onConfirmCompute,
  onLocateItem,
  onPrepareCompute,
  onRefresh,
  queryError,
  queryStatus,
  result,
  statusMessage,
  visitStatus,
}: {
  alreadyComputed: boolean | null;
  canCompute: boolean;
  canLocateItem: (itemResponseId: string) => boolean;
  computationError: string | null;
  computationStatus: 'idle' | 'computing';
  computeBlockReason: string | null;
  confirmationVisible: boolean;
  instanceStatus: AssessmentVisitStatus;
  onConfirmCompute: () => void;
  onLocateItem: (itemResponseId: string) => void;
  onPrepareCompute: () => void;
  onRefresh: () => void;
  queryError: string | null;
  queryStatus: ProvisionalScoreQueryStatus;
  result: ScoreResultDetailResponse | null;
  statusMessage: string | null;
  visitStatus: AssessmentVisitStatus;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const isQueryable = ['completed', 'locked', 'voided'].includes(instanceStatus);
  const isComputing = computationStatus === 'computing';

  useEffect(() => {
    setConfirmed(false);
  }, [
    canCompute,
    confirmationVisible,
    instanceStatus,
    isComputing,
    queryStatus,
    visitStatus,
  ]);

  return (
    <Card>
      <CardHeader className="border-b border-[var(--cma-line)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>阶段性评分与待人工复核</CardTitle>
            <CardDescription>
              查询既有结果；无结果时仅在明确确认后生成一次阶段性评分。
            </CardDescription>
          </div>
          {result ? (
            <Badge tone={resultStatusTones[result.scoreResult.status] ?? 'neutral'}>
              {scoreResultStatusLabels[result.scoreResult.status] ?? '未知状态'}
            </Badge>
          ) : queryStatus === 'no_result' ? (
            <Badge tone="neutral">尚未计算</Badge>
          ) : (
            <Badge tone={queryStatus === 'forbidden' ? 'warning' : 'neutral'}>
              {queryStatus === 'loading' ? '正在查询' : '暂无评分结果'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="grid gap-5 pt-5">
        <div className="grid gap-1 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] p-4 text-sm leading-6 text-[var(--cma-info)]">
          <p className="font-semibold">阶段性评分，尚未最终确认</p>
          <p>不得单独作为诊断结论。</p>
          <p>待人工复核项目尚未计入最终得分。</p>
        </div>

        {!isQueryable ? (
          <p className="text-base leading-7 text-[var(--cma-muted)]">
            请先完成并正式提交量表实例。题目、媒体和提交功能仍可继续使用。
          </p>
        ) : null}

        {queryStatus === 'loading' ? (
          <p aria-live="polite" className="text-[var(--cma-info)]" role="status">
            正在加载阶段性评分结果...
          </p>
        ) : null}

        {queryStatus === 'forbidden' ? (
          <div
            className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4 text-[var(--cma-danger)]"
            role="alert"
          >
            当前账号没有查看阶段性评分结果的权限。量表题目与媒体历史仍可查看。
          </div>
        ) : null}

        {queryStatus === 'error' && queryError ? (
          <div
            className="grid gap-3 rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4 text-[var(--cma-danger)]"
            role="alert"
          >
            <p>{queryError}</p>
            <div>
              <Button onClick={onRefresh} size="sm" variant="secondary">
                重试加载评分结果
              </Button>
            </div>
          </div>
        ) : null}

        {queryStatus === 'no_result' ? (
          <section className="grid gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
            <div>
              <h3 className="font-semibold text-[var(--cma-text-strong)]">
                尚未计算阶段性评分
              </h3>
              <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
                页面加载不会自动计算。当前结果一旦生成，现阶段不支持重新计算。
              </p>
            </div>
            {instanceStatus === 'locked' ? (
              <p className="text-sm text-[var(--cma-muted)]">
                该实例已锁定，不能首次计算。
              </p>
            ) : instanceStatus === 'voided' ? (
              <p className="text-sm text-[var(--cma-muted)]">
                该实例已作废，不能首次计算。
              </p>
            ) : computeBlockReason ? (
              <p className="text-sm leading-6 text-[var(--cma-warning)]" role="status">
                {computeBlockReason}
              </p>
            ) : null}
            {canCompute ? (
              <div>
                <Button disabled={isComputing} onClick={onPrepareCompute}>
                  准备计算阶段性评分
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        {confirmationVisible ? (
          <section
            aria-labelledby="score-computation-confirmation-title"
            className="grid gap-4 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4"
          >
            <div>
              <h3
                className="text-lg font-semibold text-[var(--cma-warning)]"
                id="score-computation-confirmation-title"
              >
                确认计算阶段性评分
              </h3>
              <ul className="mt-2 grid gap-1 text-sm leading-6 text-[var(--cma-text-strong)]">
                <li>本次只生成阶段性、未确认评分。</li>
                <li>部分项目可能只能进入人工复核。</li>
                <li>阶段性部分得分不得作为最终临床结论。</li>
                <li>本阶段不会生成认知域结果、报告或诊断。</li>
                <li>计算结果在现阶段不支持重新计算。</li>
              </ul>
            </div>
            <div className="flex items-start gap-3">
              <input
                checked={confirmed}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)]"
                disabled={!canCompute || isComputing}
                id="confirm-provisional-score-computation"
                onChange={(event) => setConfirmed(event.target.checked)}
                type="checkbox"
              />
              <label
                className="font-semibold text-[var(--cma-text-strong)]"
                htmlFor="confirm-provisional-score-computation"
              >
                我已理解以上阶段性边界，并确认开始计算。
              </label>
            </div>
            <div>
              <Button
                disabled={!confirmed || !canCompute || isComputing}
                onClick={onConfirmCompute}
              >
                {isComputing ? '正在计算阶段性评分...' : '确认计算'}
              </Button>
            </div>
          </section>
        ) : null}

        {isComputing ? (
          <p aria-live="polite" className="font-semibold text-[var(--cma-info)]" role="status">
            正在计算阶段性评分，请勿重复操作...
          </p>
        ) : null}

        {computationError ? (
          <p
            className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4 text-[var(--cma-danger)]"
            role="alert"
          >
            {computationError}
          </p>
        ) : null}

        {statusMessage ? (
          <p
            aria-live="polite"
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] p-4 text-[var(--cma-info)]"
            role="status"
          >
            {statusMessage}
          </p>
        ) : null}

        {alreadyComputed !== null ? (
          <p
            aria-live="polite"
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-success-soft)] p-4 text-[var(--cma-success)]"
            role="status"
          >
            {alreadyComputed
              ? '该实例此前已经生成阶段性评分，本次未重复计算。'
              : '阶段性评分计算完成，结果仍未最终确认。'}
          </p>
        ) : null}

        {result ? (
          <div className="grid gap-6">
            <ProvisionalScoreSummary total={result.scoreResult.totalScore} />
            <ProvisionalScoreGroupList groups={result.scoreResult.groupScores} />
            <ScoreReviewQueue
              canLocateItem={canLocateItem}
              items={result.reviewQueue}
              onLocateItem={onLocateItem}
            />
            <ProvisionalScoreItemList items={result.scoreResult.itemScores} />

            <details className="rounded-md border border-[var(--cma-line)] p-4">
              <summary className="cursor-pointer font-semibold text-[var(--cma-text-strong)]">
                技术信息 / 计算记录
              </summary>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-[var(--cma-muted)]">评分结果状态</dt>
                  <dd>
                    {scoreResultStatusLabels[result.scoreResult.status] ??
                      '未知状态'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">评分来源</dt>
                  <dd>
                    {scoringSourceLabels[result.scoreResult.scoringSource] ??
                      '未知状态'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">评分模式</dt>
                  <dd>
                    {scoringModeLabels[result.scoreResult.scoringMode] ??
                      '未知状态'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">人工复核状态</dt>
                  <dd>
                    {scoreReviewStatusLabels[result.scoreResult.review.status] ??
                      '未知状态'}
                    {' · '}待处理 {result.scoreResult.review.pendingItemCount} 项
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">计算质量状态</dt>
                  <dd>
                    {scoreQualityStatusLabels[result.scoreResult.qualityStatus] ??
                      '未知状态'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">计算时间</dt>
                  <dd>
                    {formatProvisionalScoreDate(
                      result.scoreResult.computation.computedAt,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">服务端最终性</dt>
                  <dd>
                    {result.scoreResult.isFinal
                      ? '服务端标记为最终'
                      : '服务端标记为尚未最终确认'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">自动计算项目</dt>
                  <dd>{result.scoreResult.computation.autoScoredItemCount}</dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">待复核项目</dt>
                  <dd>{result.scoreResult.computation.pendingReviewItemCount}</dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">排除项目</dt>
                  <dd>{result.scoreResult.computation.excludedItemCount}</dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">计算引擎版本</dt>
                  <dd>{result.scoreResult.computation.engineVersion || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">评分规则版本</dt>
                  <dd>
                    {result.scoreResult.computation.scoringRuleVersion || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">内部结果摘要</dt>
                  <dd className="break-all">
                    {result.scoreResult.scoreResultCode} · run {result.scoreResult.runNo}
                  </dd>
                </div>
              </dl>

              <dl className="mt-4 grid gap-3 border-t border-[var(--cma-line)] pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-[var(--cma-muted)]">量表版本</dt>
                  <dd>{result.scoreResult.versionTrace?.scaleVersion || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">CRF 版本</dt>
                  <dd>{result.scoreResult.versionTrace?.crfVersion || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">规则版本追溯</dt>
                  <dd>
                    {result.scoreResult.versionTrace?.scoringRuleVersion || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">字段编码版本</dt>
                  <dd>
                    {result.scoreResult.versionTrace?.fieldEncodingVersion || '—'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[var(--cma-muted)]">来源文档</dt>
                  <dd className="break-words">
                    {result.scoreResult.versionTrace?.sourceDocument || '—'}
                  </dd>
                </div>
              </dl>

              {result.scoreResult.computation.warningCodes.length > 0 ? (
                <section className="mt-4 border-t border-[var(--cma-line)] pt-4">
                  <h4 className="font-semibold text-[var(--cma-text-strong)]">
                    计算配置提示
                  </h4>
                  <ul className="mt-2 grid gap-2 text-sm leading-6 text-[var(--cma-warning)]">
                    {result.scoreResult.computation.warningCodes.map(
                      (warningCode, index) => (
                        <li key={`${warningCode}:${index}`}>
                          {isScoreComputationWarningCode(warningCode)
                            ? `${warningCode}：`
                            : ''}
                          {getScoreComputationWarningMessage(warningCode)}
                        </li>
                      ),
                    )}
                  </ul>
                </section>
              ) : null}
            </details>
          </div>
        ) : null}

        {isQueryable ? (
          <div className="border-t border-[var(--cma-line)] pt-4">
            <Button
              disabled={queryStatus === 'loading' || isComputing}
              onClick={onRefresh}
              variant="secondary"
            >
              {queryStatus === 'loading'
                ? '正在加载评分结果...'
                : '重新加载评分结果'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
