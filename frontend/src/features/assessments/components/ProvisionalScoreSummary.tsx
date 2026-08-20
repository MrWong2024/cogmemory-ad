import { Badge } from '@/src/components/ui/Badge';
import {
  formatProvisionalScoreNumber,
  formatProvisionalScorePercent,
} from '@/src/features/assessments/lib/provisional-scoring-display';
import type { ProvisionalScoreTotal } from '@/src/features/assessments/types/provisional-scoring';

export function ProvisionalScoreSummary({
  total,
  warningCount,
}: {
  total: ProvisionalScoreTotal;
  warningCount: number;
}) {
  const coreStatistics = [
    { label: '计分项目', value: total.totalItemCount },
    { label: '已评分', value: total.scoredItemCount },
  ];
  const exceptionStatistics = [
    { label: '未评分', value: total.unscoredItemCount },
    { label: '待人工评分', value: total.needsReviewItemCount },
    { label: '缺失', value: total.missingItemCount },
    { label: '计算警告', value: warningCount },
  ].filter((statistic) => statistic.value > 0);
  const scoreLabel = total.isFinal ? '确认得分' : '阶段性得分';

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
            {scoreLabel}：
            {formatProvisionalScoreNumber(total.provisionalScoreValue)} /{' '}
            {formatProvisionalScoreNumber(total.maxScore)}
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            核对总分、分值范围和需要处理的异常项。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={total.isComplete ? 'success' : 'warning'}>
            {total.isComplete ? '评分完整' : '评分待完善'}
          </Badge>
          <Badge tone={total.isFinal ? 'success' : 'info'}>
            {total.isFinal ? '已最终确认' : '待最终确认'}
          </Badge>
        </div>
      </div>

      <div className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4">
        {total.provisionalScoreValue === null ? (
          <p className="text-sm text-[var(--cma-muted)]">
            当前尚无可可靠计算的阶段性得分
          </p>
        ) : null}

        {total.isComplete && total.scorePercent !== null ? (
          <p className="text-sm text-[var(--cma-muted)]">
            得分比例：
            {formatProvisionalScorePercent(total.scorePercent)}
          </p>
        ) : null}

        <p className="mt-2 text-sm text-[var(--cma-muted)]">
          分值范围：
          {formatProvisionalScoreNumber(total.minScore)} 至{' '}
          {formatProvisionalScoreNumber(total.maxScore)}
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        {coreStatistics.map((statistic) => (
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

      {exceptionStatistics.length === 0 ? (
        <p className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-success-soft)] px-4 py-3 text-sm font-semibold text-[var(--cma-success)]">
          {total.scoredItemCount} / {total.totalItemCount} 项已评分 ·
          无需额外人工评分 · 无计算警告
        </p>
      ) : (
        <dl className="flex flex-wrap gap-2">
          {exceptionStatistics.map((statistic) => (
            <div
              className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-3 py-2 text-sm text-[var(--cma-warning)]"
              key={statistic.label}
            >
              <dt className="inline font-semibold">{statistic.label}</dt>
              <dd className="ml-2 inline font-semibold">{statistic.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
