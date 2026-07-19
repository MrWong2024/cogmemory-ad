import { Badge } from '@/src/components/ui/Badge';
import {
  clinicalHistoryAdministrationModeLabels,
  formatHistoryDuration,
  formatHistoryNumber,
  formatHistoryPercent,
  formatTrendDelta,
  trendComparisonReasonLabels,
  trendComparisonStatusLabels,
  trendDataStatusLabels,
  trendDataStatusTones,
  trendDomainComparisonStatusLabels,
  trendDomainItemComparisonStatusLabels,
} from '@/src/features/patients/lib/clinical-history-display';
import {
  assessmentVisitStatusLabels,
  assessmentVisitTypeLabels,
  formatDateTime,
} from '@/src/features/patients/lib/patient-display';
import type {
  PatientFollowUpTrendPoint,
  TrendComparisonReasonCode,
} from '@/src/features/patients/types/clinical-history';

function Reasons({ reasons }: { reasons: TrendComparisonReasonCode[] }) {
  if (reasons.length === 0) return <span>—</span>;

  return (
    <ul className="list-disc space-y-1 pl-5">
      {reasons.map((reason, index) => (
        <li key={`${reason}:${index}`}>{trendComparisonReasonLabels[reason]}</li>
      ))}
    </ul>
  );
}

function DomainDetails({ point }: { point: PatientFollowUpTrendPoint }) {
  const domainComparison = point.comparisonToPrevious.domainDeltas;

  return (
    <details className="min-w-96 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-3">
      <summary className="cursor-pointer font-semibold text-[var(--cma-text-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]">
        认知域摘要（{point.domains.length}）
      </summary>
      <div className="mt-3 grid gap-3">
        <p className="text-sm font-semibold text-[var(--cma-text-strong)]">
          {trendDomainComparisonStatusLabels[domainComparison.status]}
        </p>
        <Reasons reasons={domainComparison.reasons} />
        {point.domains.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-[1040px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--cma-line)]">
                  <th className="px-2 py-2">认知域</th>
                  <th className="px-2 py-2">得分 / 范围</th>
                  <th className="px-2 py-2">得分比例</th>
                  <th className="px-2 py-2">加权得分</th>
                  <th className="px-2 py-2">题目数</th>
                  <th className="px-2 py-2">相邻比较</th>
                  <th className="px-2 py-2">得分差值</th>
                  <th className="px-2 py-2">比例差值</th>
                  <th className="px-2 py-2">加权差值</th>
                  <th className="px-2 py-2">原因</th>
                </tr>
              </thead>
              <tbody>
                {point.domains.map((domain) => {
                  const comparison = domainComparison.items.find(
                    (item) => item.domainCode === domain.domainCode,
                  );
                  return (
                    <tr
                      className="border-b border-[var(--cma-line)] align-top"
                      key={domain.domainCode}
                    >
                      <th className="px-2 py-3 font-semibold">
                        {domain.domainTitle || '未提供标题'}
                        <span className="mt-1 block font-normal text-[var(--cma-muted)]">
                          {domain.domainCode}
                        </span>
                      </th>
                      <td className="px-2 py-3">
                        {formatHistoryNumber(domain.scoreValue)} /{' '}
                        {formatHistoryNumber(domain.minScore)}–
                        {formatHistoryNumber(domain.maxScore)}
                      </td>
                      <td className="px-2 py-3">
                        {formatHistoryPercent(domain.scorePercent)}
                      </td>
                      <td className="px-2 py-3">
                        {formatHistoryNumber(domain.weightedScore)} /{' '}
                        {formatHistoryNumber(domain.weightedMaxScore)}
                      </td>
                      <td className="px-2 py-3">{domain.itemCount}</td>
                      <td className="px-2 py-3">
                        {comparison
                          ? trendDomainItemComparisonStatusLabels[
                              comparison.status
                            ]
                          : '比较不可用'}
                      </td>
                      <td className="px-2 py-3">
                        {formatTrendDelta(comparison?.scoreDelta ?? null)}
                      </td>
                      <td className="px-2 py-3">
                        {comparison?.scorePercentDelta === null || !comparison
                          ? '—'
                          : `${formatTrendDelta(
                              comparison.scorePercentDelta,
                            )}%`}
                      </td>
                      <td className="px-2 py-3">
                        {formatTrendDelta(
                          comparison?.weightedScoreDelta ?? null,
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <Reasons reasons={comparison?.reasons ?? []} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm leading-6 text-[var(--cma-muted)]">
            当前点没有可安全展示的认知域数值；这不改变可用总分事实。
          </p>
        )}
        <p className="text-sm leading-6 text-[var(--cma-muted)]">
          认知域可能重叠，不跨认知域求和，也不用于生成认知域排名。
        </p>
      </div>
    </details>
  );
}

export function FollowUpTrendTable({
  points,
}: {
  points: PatientFollowUpTrendPoint[];
}) {
  return (
    <section
      aria-labelledby="follow-up-trend-table-heading"
      className="grid gap-3"
    >
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="follow-up-trend-table-heading"
        >
          完整随访趋势表
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          保留后端返回的全部访视和顺序；差值均为当前点减紧邻前一点的后端值。
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border border-[var(--cma-line)]">
        <table className="min-w-[1900px] w-full border-collapse text-left text-sm">
          <thead className="bg-[var(--cma-surface-muted)] text-[var(--cma-muted)]">
            <tr>
              <th className="px-4 py-3">评估时间</th>
              <th className="px-4 py-3">访视</th>
              <th className="px-4 py-3">量表实例</th>
              <th className="px-4 py-3">数据状态</th>
              <th className="px-4 py-3">总分 / 范围</th>
              <th className="px-4 py-3">得分比例</th>
              <th className="px-4 py-3">相邻比较</th>
              <th className="px-4 py-3">总分差值</th>
              <th className="px-4 py-3">比例差值</th>
              <th className="px-4 py-3">比较原因</th>
              <th className="px-4 py-3">认知域</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr
                className="border-t border-[var(--cma-line)] align-top"
                key={point.visit.id}
              >
                <td className="px-4 py-4 whitespace-nowrap">
                  {formatDateTime(point.visit.assessmentDate)}
                </td>
                <td className="px-4 py-4">
                  <p className="font-semibold text-[var(--cma-text-strong)]">
                    {point.visit.visitCode}
                  </p>
                  <p className="mt-1 text-[var(--cma-muted)]">
                    {assessmentVisitTypeLabels[point.visit.visitType]} ·{' '}
                    {assessmentVisitStatusLabels[point.visit.status]}
                  </p>
                </td>
                <td className="px-4 py-4">
                  {point.scaleInstance ? (
                    <div className="grid gap-1">
                      <span className="font-semibold">
                        {point.scaleInstance.instanceCode}
                      </span>
                      <span>
                        {point.scaleInstance.scaleCode} /{' '}
                        {point.scaleInstance.scaleVersion}
                      </span>
                      <span className="text-[var(--cma-muted)]">
                        {
                          clinicalHistoryAdministrationModeLabels[
                            point.scaleInstance.administrationMode
                          ]
                        }{' '}
                        · {formatHistoryDuration(point.scaleInstance.durationMs)}
                      </span>
                    </div>
                  ) : (
                    '无唯一实例'
                  )}
                </td>
                <td className="px-4 py-4">
                  <Badge tone={trendDataStatusTones[point.dataStatus]}>
                    {trendDataStatusLabels[point.dataStatus]}
                  </Badge>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  {point.score
                    ? `${formatHistoryNumber(
                        point.score.totalScoreValue,
                      )} / ${formatHistoryNumber(
                        point.score.totalMinScore,
                      )}–${formatHistoryNumber(point.score.totalMaxScore)}`
                    : '—'}
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  {point.score
                    ? formatHistoryPercent(point.score.scorePercent)
                    : '—'}
                </td>
                <td className="px-4 py-4">
                  {point.comparisonToPrevious.status === 'first_point'
                    ? '首个时间点，无前次差值'
                    : trendComparisonStatusLabels[
                        point.comparisonToPrevious.status
                      ]}
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  {formatTrendDelta(point.comparisonToPrevious.scoreDelta)}
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  {point.comparisonToPrevious.scorePercentDelta === null
                    ? '—'
                    : `${formatTrendDelta(
                        point.comparisonToPrevious.scorePercentDelta,
                      )}%`}
                </td>
                <td className="px-4 py-4">
                  <Reasons reasons={point.comparisonToPrevious.reasons} />
                </td>
                <td className="px-4 py-4">
                  <DomainDetails point={point} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm leading-6 text-[var(--cma-muted)]">
        正负差值仅表示数值方向，不表示临床好坏；得分比例不是疾病概率。
      </p>
    </section>
  );
}
