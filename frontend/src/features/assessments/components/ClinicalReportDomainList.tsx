import { getCognitiveDomainTitle } from '@/src/features/assessments/lib/cognitive-domain-display';
import {
  formatClinicalReportNumber,
  formatClinicalReportPercent,
} from '@/src/features/assessments/lib/clinical-report-display';
import type { ClinicalReportDomainSnapshot } from '@/src/features/assessments/types/clinical-report';

export function ClinicalReportDomainList({
  snapshots,
}: {
  snapshots: ClinicalReportDomainSnapshot[];
}) {
  const sortedSnapshots = [...snapshots].sort(
    (left, right) =>
      (left.scaleCode ?? '').localeCompare(right.scaleCode ?? '') ||
      left.domainCode.localeCompare(right.domainCode),
  );

  return (
    <section aria-labelledby="clinical-report-domain-heading" className="grid gap-3">
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-domain-heading"
        >
          认知域快照
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          认知域结果来自题目编码映射，一个项目可能完整归入多个认知域；各域存在重叠，不能跨域求和解释量表总分。结果尚未独立确认，服务端比例不是诊断概率。
        </p>
      </div>
      {sortedSnapshots.length === 0 ? (
        <p className="text-base text-[var(--cma-muted)]">
          当前安全报告响应未提供认知域快照。
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {sortedSnapshots.map((snapshot, index) => (
            <li
              className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4"
              key={`${snapshot.scaleCode ?? ''}:${snapshot.domainCode}:${index}`}
            >
              <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
                {getCognitiveDomainTitle(
                  snapshot.domainCode,
                  snapshot.domainTitle,
                )}
              </h4>
              <p className="mt-1 text-sm text-[var(--cma-muted)]">
                {snapshot.scaleCode ? `${snapshot.scaleCode} · ` : ''}
                {snapshot.domainCode}
              </p>
              <dl className="mt-4 grid gap-x-4 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                    分值 / 上限
                  </dt>
                  <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                    {formatClinicalReportNumber(snapshot.scoreValue)} /{' '}
                    {formatClinicalReportNumber(snapshot.maxScore)}
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
                    加权分值 / 上限
                  </dt>
                  <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                    {formatClinicalReportNumber(snapshot.weightedScore)} /{' '}
                    {formatClinicalReportNumber(snapshot.weightedMaxScore)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                    项目数 / 待复核数
                  </dt>
                  <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                    {formatClinicalReportNumber(snapshot.itemCount)} /{' '}
                    {formatClinicalReportNumber(snapshot.needsReviewItemCount)}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 whitespace-pre-wrap border-t border-[var(--cma-line)] pt-3 text-base leading-7 text-[var(--cma-text-strong)]">
                {snapshot.summary?.trim() || '当前快照未提供认知域摘要。'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
