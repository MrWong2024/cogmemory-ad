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
          分组汇总由服务端提供，不代表认知域结果。
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm leading-6 text-[var(--cma-muted)]">
          服务端当前未返回分组得分。
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {sortGroups(groups).map((group) => (
            <article
              className="grid gap-3 rounded-md border border-[var(--cma-line)] p-4"
              key={group.groupCode}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-[var(--cma-text-strong)]">
                    {group.groupTitle || group.groupCode}
                  </h4>
                  <p className="mt-1 text-sm text-[var(--cma-muted)]">
                    分组编码：{group.groupCode}
                  </p>
                </div>
                <Badge tone={group.isComplete ? 'success' : 'warning'}>
                  {group.isComplete ? '本组已全部计算' : '本组仍需复核'}
                </Badge>
              </div>

              <p className="text-xl font-semibold text-[var(--cma-text-strong)]">
                {group.provisionalScoreValue === null
                  ? '本组当前无可靠阶段性分值'
                  : `${isFinal ? '确认分组得分' : '阶段性分值'}：${formatProvisionalScoreNumber(group.provisionalScoreValue)}`}
              </p>
              <p className="text-sm text-[var(--cma-muted)]">
                服务端分值范围：{formatProvisionalScoreNumber(group.minScore)} 至{' '}
                {formatProvisionalScoreNumber(group.maxScore)}
              </p>
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-[var(--cma-muted)]">已计算</dt>
                  <dd className="font-semibold">{group.scoredItemCount}</dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">未评分</dt>
                  <dd className="font-semibold">{group.unscoredItemCount}</dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">待复核</dt>
                  <dd className="font-semibold">
                    {group.needsReviewItemCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">缺失</dt>
                  <dd className="font-semibold">{group.missingItemCount}</dd>
                </div>
              </dl>
              <p className="text-sm text-[var(--cma-muted)]">
                {group.isComplete
                  ? '本组阶段性项目已全部计算。'
                  : '本组仍有待复核或未评分项目。'}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
