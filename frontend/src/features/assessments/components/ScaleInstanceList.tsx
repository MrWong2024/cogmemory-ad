import { Badge, type BadgeTone } from '@/src/components/ui/Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import {
  assessmentOperatorRoleLabels,
  formatDuration,
  scaleAdministrationModeLabels,
  scaleInstanceStatusLabels,
} from '@/src/features/assessments/lib/assessment-execution-display';
import type {
  AvailableScaleOption,
  ScaleInstanceListItem,
} from '@/src/features/assessments/types/assessment-execution';
import { formatDateTime } from '@/src/features/patients/lib/patient-display';
import type { AssessmentVisitStatus } from '@/src/features/patients/types/patient';

const instanceStatusTones: Record<AssessmentVisitStatus, BadgeTone> = {
  draft: 'neutral',
  in_progress: 'info',
  completed: 'success',
  locked: 'warning',
  voided: 'warning',
};

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

function displayValue(value: string | undefined): string {
  return value || '—';
}

export function ScaleInstanceList({
  catalog,
  instances,
  visitCanInitialize,
}: {
  catalog: AvailableScaleOption[] | null;
  instances: ScaleInstanceListItem[];
  visitCanInitialize: boolean;
}) {
  const sortedInstances = [...instances].sort(
    (left, right) =>
      left.scaleCode.localeCompare(right.scaleCode) ||
      left.instanceNo - right.instanceNo,
  );

  return (
    <Card>
      <CardHeader className="border-b border-[var(--cma-line)]">
        <CardTitle>已初始化量表实例</CardTitle>
        <CardDescription>
          这里仅展示量表实例与进度安全摘要，不读取或展示题目作答记录。
        </CardDescription>
      </CardHeader>
      {sortedInstances.length === 0 ? (
        <CardContent className="py-10 text-center">
          <p className="text-xl font-semibold text-[var(--cma-text-strong)]">
            当前访视尚未初始化认知量表。
          </p>
          <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
            {visitCanInitialize
              ? '可从下方量表目录选择 MMSE 或 MoCA 并初始化实例。'
              : '当前访视状态不允许新增量表实例。'}
          </p>
        </CardContent>
      ) : (
        <CardContent className="grid gap-4 pt-5">
          {sortedInstances.map((instance) => (
            <article
              className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-5"
              key={instance.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
                    {getScaleDisplayName(instance, catalog)}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--cma-muted)]">
                    实例编号：{instance.instanceCode} · 第 {instance.instanceNo}{' '}
                    份
                  </p>
                </div>
                <Badge tone={instanceStatusTones[instance.status]}>
                  {scaleInstanceStatusLabels[instance.status]}
                </Badge>
              </div>

              <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                    量表版本
                  </dt>
                  <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                    {instance.scaleVersion}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                    施测方式
                  </dt>
                  <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                    {scaleAdministrationModeLabels[instance.administrationMode]}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                    当前进度
                  </dt>
                  <dd className="mt-1 text-base font-semibold text-[var(--cma-text-strong)]">
                    {instance.progress.answeredItemCount} /{' '}
                    {instance.progress.totalItemCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                    操作者
                  </dt>
                  <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                    {instance.operatorSnapshot?.operatorName || '未记录'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                    操作者角色
                  </dt>
                  <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                    {instance.operatorSnapshot?.operatorRole
                      ? assessmentOperatorRoleLabels[
                          instance.operatorSnapshot.operatorRole
                        ]
                      : '未记录'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                    开始时间
                  </dt>
                  <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                    {formatDateTime(instance.startedAt)}
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
                    用时
                  </dt>
                  <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                    {formatDuration(instance.durationMs)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                    CRF 版本
                  </dt>
                  <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                    {displayValue(instance.versionTrace?.crfVersion)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                    评分规则版本
                  </dt>
                  <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                    {displayValue(instance.versionTrace?.scoringRuleVersion)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                    字段编码版本
                  </dt>
                  <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                    {displayValue(instance.versionTrace?.fieldEncodingVersion)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                    来源文档
                  </dt>
                  <dd className="mt-1 break-words text-base text-[var(--cma-text-strong)]">
                    {displayValue(instance.versionTrace?.sourceDocument)}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
          <p className="text-sm leading-6 text-[var(--cma-muted)]">
            题目作答页面将在后续阶段接入。
          </p>
        </CardContent>
      )}
    </Card>
  );
}

