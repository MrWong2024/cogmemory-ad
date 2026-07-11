import { Badge } from '@/src/components/ui/Badge';
import {
  formatProvisionalScoreNumber,
  formatProvisionalScorePercent,
} from '@/src/features/assessments/lib/provisional-scoring-display';
import type { ProvisionalScoreTotal } from '@/src/features/assessments/types/provisional-scoring';

export function ProvisionalScoreSummary({
  total,
}: {
  total: ProvisionalScoreTotal;
}) {
  const statistics = [
    { label: '计分项目总数', value: total.totalItemCount },
    { label: '已可靠计算', value: total.scoredItemCount },
    { label: '尚未评分', value: total.unscoredItemCount },
    { label: '需要复核', value: total.needsReviewItemCount },
    { label: '缺失记录', value: total.missingItemCount },
  ];

  return (
    <section
      aria-labelledby="provisional-total-title"
      className="grid gap-4 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface-muted)] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            className="text-xl font-semibold text-[var(--cma-text-strong)]"
            id="provisional-total-title"
          >
            阶段性总分摘要
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            以下数值直接来自服务端，本页不重新求和或补算比例。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={total.isComplete ? 'success' : 'warning'}>
            {total.isComplete ? '阶段性计算完整' : '阶段性计算不完整'}
          </Badge>
          <Badge tone={total.isFinal ? 'success' : 'info'}>
            {total.isFinal ? '服务端标记为最终' : '尚未最终确认'}
          </Badge>
        </div>
      </div>

      <div className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4">
        {total.provisionalScoreValue === null ? (
          <p className="text-xl font-semibold text-[var(--cma-text-strong)]">
            当前尚无可可靠计算的阶段性得分
          </p>
        ) : total.isComplete ? (
          <p className="text-2xl font-semibold text-[var(--cma-text-strong)]">
            阶段性计算得分：
            {formatProvisionalScoreNumber(total.provisionalScoreValue)} /{' '}
            {formatProvisionalScoreNumber(total.maxScore)}
          </p>
        ) : (
          <div>
            <p className="text-2xl font-semibold text-[var(--cma-text-strong)]">
              当前已可靠计算：
              {formatProvisionalScoreNumber(total.provisionalScoreValue)} 分
            </p>
            <p className="mt-2 text-base text-[var(--cma-warning)]">
              仍有 {total.unscoredItemCount} 个计分项目待复核或未评分
            </p>
          </div>
        )}

        {total.isComplete && total.scorePercent !== null ? (
          <p className="mt-2 text-sm text-[var(--cma-muted)]">
            服务端阶段性比例：
            {formatProvisionalScorePercent(total.scorePercent)}
          </p>
        ) : null}

        <p className="mt-2 text-sm text-[var(--cma-muted)]">
          服务端分值范围：
          {formatProvisionalScoreNumber(total.minScore)} 至{' '}
          {formatProvisionalScoreNumber(total.maxScore)}
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {statistics.map((statistic) => (
          <div
            className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-3"
            key={statistic.label}
          >
            <dt className="text-sm font-semibold text-[var(--cma-muted)]">
              {statistic.label}
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-[var(--cma-text-strong)]">
              {statistic.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
