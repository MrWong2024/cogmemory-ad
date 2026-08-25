import {
  clinicalReportCaptureModeLabels,
  clinicalReportEvidenceTypeLabels,
  clinicalReportQualityStatusLabels,
} from '@/src/features/assessments/lib/clinical-report-display';
import type { ClinicalReportEvidenceSnapshot } from '@/src/features/assessments/types/clinical-report';

export function ClinicalReportEvidenceList({
  snapshots,
}: {
  snapshots: ClinicalReportEvidenceSnapshot[];
}) {
  const sortedSnapshots = [...snapshots].sort(
    (left, right) =>
      (left.scaleCode ?? '').localeCompare(right.scaleCode ?? '') ||
      (left.itemCode ?? '').localeCompare(right.itemCode ?? '') ||
      (left.evidenceType ?? '').localeCompare(right.evidenceType ?? ''),
  );

  return (
    <section aria-labelledby="clinical-report-evidence-heading" className="grid gap-3">
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-evidence-heading"
        >
          相关作答证据
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          本版报告只记录相关作答证据的摘要信息，不读取或分析媒体内容，也不执行文字识别、图像识别或 AI 判断；此处不提供预览或下载。
        </p>
      </div>
      {sortedSnapshots.length === 0 ? (
        <p className="text-base text-[var(--cma-muted)]">
          本版报告未记录相关作答证据。
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {sortedSnapshots.map((snapshot, index) => (
            <li
              className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4"
              key={`${snapshot.scaleCode ?? ''}:${snapshot.itemCode ?? ''}:${snapshot.evidenceType ?? ''}:${index}`}
            >
              <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
                {snapshot.itemTitle?.trim() || '作答证据'}
              </h4>
              <p className="mt-1 text-sm text-[var(--cma-muted)]">
                {snapshot.scaleCode || '未记录量表名称'}
              </p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                    证据类型
                  </dt>
                  <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                    {snapshot.evidenceType
                      ? clinicalReportEvidenceTypeLabels[snapshot.evidenceType]
                      : '未提供'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                    采集方式
                  </dt>
                  <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                    {snapshot.captureMode
                      ? clinicalReportCaptureModeLabels[snapshot.captureMode]
                      : '未提供'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                    结果状态
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
              <p className="mt-4 whitespace-pre-wrap border-t border-[var(--cma-line)] pt-3 text-base leading-7 text-[var(--cma-text-strong)]">
                {snapshot.summary?.trim() || '本版报告未记录证据摘要。'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
