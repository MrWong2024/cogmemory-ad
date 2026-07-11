import Link from 'next/link';

import { Button } from '@/src/components/ui/Button';
import {
  compareClinicalReportScaleInstances,
} from '@/src/features/assessments/hooks/useClinicalReport';
import {
  scaleInstanceStatusLabels,
} from '@/src/features/assessments/lib/assessment-execution-display';
import { clinicalReportScopeFixedStatements } from '@/src/features/assessments/lib/clinical-report-display';
import type {
  AvailableScaleOption,
  ScaleInstanceListItem,
} from '@/src/features/assessments/types/assessment-execution';
import { formatDateTime } from '@/src/features/patients/lib/patient-display';

const mongoIdPattern = /^[a-f\d]{24}$/i;
const scaleLinkClassName =
  'inline-flex min-h-9 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-1.5 text-sm font-semibold text-[var(--cma-text-strong)] hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

function getScaleDisplayName(
  instance: ScaleInstanceListItem,
  catalog: AvailableScaleOption[] | null,
): string {
  const scale = catalog?.find(
    (option) =>
      option.code.toLowerCase() === instance.scaleCode.toLowerCase(),
  );
  if (!scale) {
    return instance.scaleCode.toUpperCase();
  }
  return scale.shortName ? `${scale.name}（${scale.shortName}）` : scale.name;
}

function getCandidateMessage(instance: ScaleInstanceListItem): string {
  if (!mongoIdPattern.test(instance.id)) {
    return '实例标识无效，不能纳入报告，请重新加载访视详情。';
  }
  if (instance.status === 'completed' || instance.status === 'locked') {
    return '可作为前端候选；评分最终性、认知域与媒体条件仍由后端生成时校验。';
  }
  if (instance.status === 'draft') {
    return '草稿实例不可纳入报告。';
  }
  if (instance.status === 'in_progress') {
    return '进行中实例不可纳入报告。';
  }
  return '已作废实例不可纳入报告。';
}

export function ClinicalReportScopeSelector({
  catalog,
  generating,
  instances,
  onClearSelection,
  onSelectAll,
  onToggle,
  patientId,
  selectedScaleInstanceIds,
  visitId,
}: {
  catalog: AvailableScaleOption[] | null;
  generating: boolean;
  instances: ScaleInstanceListItem[];
  onClearSelection: () => void;
  onSelectAll: () => void;
  onToggle: (scaleInstanceId: string) => void;
  patientId: string;
  selectedScaleInstanceIds: string[];
  visitId: string;
}) {
  const sortedInstances = [...instances].sort(compareClinicalReportScaleInstances);
  const selectedIds = new Set(selectedScaleInstanceIds);
  const eligibleCount = sortedInstances.filter(
    (instance) =>
      (instance.status === 'completed' || instance.status === 'locked') &&
      mongoIdPattern.test(instance.id),
  ).length;

  return (
    <section aria-labelledby="clinical-report-scope-heading" className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            className="text-xl font-semibold text-[var(--cma-text-strong)]"
            id="clinical-report-scope-heading"
          >
            明确选择报告范围
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            初始不会自动选择。请选择 1–10 个同访视 completed / locked 实例；这只是前端候选资格，不代表全部报告生成条件已经满足。
          </p>
        </div>
        <p className="text-base font-semibold text-[var(--cma-text-strong)]">
          已选择 {selectedScaleInstanceIds.length} / 10
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          disabled={generating || eligibleCount === 0}
          onClick={onSelectAll}
          variant="secondary"
        >
          选择全部可纳入候选项（最多前 10 项）
        </Button>
        <Button
          disabled={generating || selectedScaleInstanceIds.length === 0}
          onClick={onClearSelection}
          variant="ghost"
        >
          清空选择
        </Button>
      </div>

      {sortedInstances.length === 0 ? (
        <p className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4 text-base text-[var(--cma-muted)]">
          当前访视没有量表实例，暂时无法选择报告范围。
        </p>
      ) : (
        <ul className="grid gap-3">
          {sortedInstances.map((instance) => {
            const normalizedId = instance.id.trim().toLowerCase();
            const isSelected = selectedIds.has(normalizedId);
            const isEligible =
              (instance.status === 'completed' ||
                instance.status === 'locked') &&
              mongoIdPattern.test(normalizedId);
            const selectionLimitReached =
              selectedScaleInstanceIds.length >= 10 && !isSelected;

            return (
              <li
                className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4"
                key={instance.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <label
                    className="flex min-w-0 flex-1 items-start gap-3"
                    htmlFor={`clinical-report-scope-${instance.id}`}
                  >
                    <input
                      checked={isSelected}
                      className="mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)]"
                      disabled={
                        generating || !isEligible || selectionLimitReached
                      }
                      id={`clinical-report-scope-${instance.id}`}
                      onChange={() => onToggle(instance.id)}
                      type="checkbox"
                    />
                    <span>
                      <span className="block text-lg font-semibold text-[var(--cma-text-strong)]">
                        {getScaleDisplayName(instance, catalog)}
                      </span>
                      <span className="mt-1 block text-sm text-[var(--cma-muted)]">
                        {instance.scaleCode} · 版本 {instance.scaleVersion} ·{' '}
                        {instance.instanceCode} · 第 {instance.instanceNo} 份
                      </span>
                    </span>
                  </label>
                  <span className="text-sm font-semibold text-[var(--cma-text-strong)]">
                    {scaleInstanceStatusLabels[instance.status]}
                  </span>
                </div>
                <dl className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                      当前进度
                    </dt>
                    <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                      {instance.progress.answeredItemCount} /{' '}
                      {instance.progress.totalItemCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                      完成时间
                    </dt>
                    <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                      {formatDateTime(instance.completedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                      候选说明
                    </dt>
                    <dd className="mt-1 text-sm leading-6 text-[var(--cma-text-strong)]">
                      {getCandidateMessage(instance)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 border-t border-[var(--cma-line)] pt-3">
                  {mongoIdPattern.test(normalizedId) ? (
                    <Link
                      className={scaleLinkClassName}
                      href={`/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/scale-instances/${encodeURIComponent(normalizedId)}`}
                    >
                      查看量表
                    </Link>
                  ) : (
                    <p className="text-sm text-[var(--cma-muted)]">
                      当前实例标识无效，不能提供量表链接。
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] p-4 text-sm leading-6 text-[var(--cma-info)]">
        <h4 className="font-semibold">scope 固定性说明</h4>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {clinicalReportScopeFixedStatements.map((statement) => (
            <li key={statement}>{statement}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
