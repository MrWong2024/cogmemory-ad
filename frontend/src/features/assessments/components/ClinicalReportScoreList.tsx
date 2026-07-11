import {
  clinicalReportQualityStatusLabels,
  clinicalReportScoreStatusLabels,
  formatClinicalReportNumber,
  formatClinicalReportPercent,
} from '@/src/features/assessments/lib/clinical-report-display';
import type { ClinicalReportScoreSnapshot } from '@/src/features/assessments/types/clinical-report';

export function ClinicalReportScoreList({
  snapshots,
}: {
  snapshots: ClinicalReportScoreSnapshot[];
}) {
  const sortedSnapshots = [...snapshots].sort(
    (left, right) =>
      left.scaleCode.localeCompare(right.scaleCode) ||
      (left.scaleVersion ?? '').localeCompare(right.scaleVersion ?? ''),
  );

  return (
    <section aria-labelledby="clinical-report-score-heading" className="grid gap-3">
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-score-heading"
        >
          评分快照
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          仅展示服务端生成报告时保存的分值与规则化安全摘要，不解释诊断阈值或患者状态。
        </p>
      </div>
      {sortedSnapshots.length === 0 ? (
        <p className="text-base text-[var(--cma-muted)]">
          当前安全报告响应未提供评分快照。
        </p>
      ) : (
        <ul className="grid gap-3">
          {sortedSnapshots.map((snapshot, index) => {
            const hasCompleteRange =
              snapshot.totalScoreValue !== null &&
              Number.isFinite(snapshot.totalScoreValue) &&
              snapshot.totalMinScore !== null &&
              Number.isFinite(snapshot.totalMinScore) &&
              snapshot.totalMaxScore !== null &&
              Number.isFinite(snapshot.totalMaxScore);

            return (
              <li
                className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4"
                key={`${snapshot.scaleCode}:${snapshot.scaleVersion ?? ''}:${index}`}
              >
                <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
                  {snapshot.scaleName?.trim() || snapshot.scaleCode}
                </h4>
                <p className="mt-1 text-sm text-[var(--cma-muted)]">
                  {snapshot.scaleCode}
                  {snapshot.scaleVersion ? ` · ${snapshot.scaleVersion}` : ''}
                </p>
                <dl className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                      报告快照分值
                    </dt>
                    <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                      {hasCompleteRange
                        ? `${formatClinicalReportNumber(snapshot.totalScoreValue)}（范围 ${formatClinicalReportNumber(snapshot.totalMinScore)}–${formatClinicalReportNumber(snapshot.totalMaxScore)}）`
                        : '当前快照未提供完整分值范围'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                      服务端比例
                    </dt>
                    <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                      {formatClinicalReportPercent(snapshot.scorePercent)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                      评分状态
                    </dt>
                    <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                      {snapshot.scoreStatus
                        ? clinicalReportScoreStatusLabels[snapshot.scoreStatus]
                        : '未提供'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                      流程质量标记
                    </dt>
                    <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                      {snapshot.qualityStatus
                        ? clinicalReportQualityStatusLabels[
                            snapshot.qualityStatus
                          ]
                        : '未提供'}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 border-t border-[var(--cma-line)] pt-3">
                  <p className="text-sm font-semibold text-[var(--cma-muted)]">
                    服务端规则化安全摘要
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-base leading-7 text-[var(--cma-text-strong)]">
                    {snapshot.summary?.trim() || '当前快照未提供评分摘要。'}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
