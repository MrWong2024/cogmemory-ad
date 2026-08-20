import { Badge } from '@/src/components/ui/Badge';
import { formatProvisionalScoreNumber } from '@/src/features/assessments/lib/provisional-scoring-display';
import type { ProvisionalScoreGroup } from '@/src/features/assessments/types/provisional-scoring';

function sortGroups(groups: ProvisionalScoreGroup[]): ProvisionalScoreGroup[] {
  return [...groups].sort(
    (left, right) =>
      (left.order ?? Number.MAX_SAFE_INTEGER) -
        (right.order ?? Number.MAX_SAFE_INTEGER) ||
      left.groupCode.localeCompare(right.groupCode),
  );
}

export function ProvisionalScoreGroupList({
  groups,
  isFinal,
}: {
  groups: ProvisionalScoreGroup[];
  isFinal: boolean;
}) {
  return (
    <section aria-labelledby="provisional-groups-title" className="grid gap-4">
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="provisional-groups-title"
        >
          {isFinal ? '确认分组得分' : '阶段性分组得分'}
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          按量表分组核对得分；异常项仅在需要处理时显示。
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm leading-6 text-[var(--cma-muted)]">
          当前没有分组得分。
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {sortGroups(groups).map((group) => {
            const exceptions = [
              { label: '未评分', value: group.unscoredItemCount },
              { label: '待人工评分', value: group.needsReviewItemCount },
              { label: '缺失', value: group.missingItemCount },
            ].filter((statistic) => statistic.value > 0);

            return (
              <article
                className="grid gap-3 rounded-md border border-[var(--cma-line)] p-4"
                key={group.groupCode}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h4 className="font-semibold text-[var(--cma-text-strong)]">
                    {group.groupTitle || '未命名分组'}
                  </h4>
                  {!group.isComplete ? (
                    <Badge tone="warning">本组评分待完善</Badge>
                  ) : null}
                </div>

                <p className="text-xl font-semibold text-[var(--cma-text-strong)]">
                  {group.provisionalScoreValue === null
                    ? '当前无可靠分值'
                    : `${formatProvisionalScoreNumber(group.provisionalScoreValue)} / ${formatProvisionalScoreNumber(group.maxScore)}`}
                </p>
                {exceptions.length > 0 ? (
                  <dl className="flex flex-wrap gap-2 text-sm">
                    {exceptions.map((statistic) => (
                      <div
                        className="rounded-md bg-[var(--cma-warning-soft)] px-3 py-2 text-[var(--cma-warning)]"
                        key={statistic.label}
                      >
                        <dt className="inline">{statistic.label}</dt>
                        <dd className="ml-2 inline font-semibold">
                          {statistic.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
