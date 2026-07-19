'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import {
  ClinicalReportApiError,
  listClinicalReportVersions,
} from '@/src/features/assessments/api/clinical-report-api';
import {
  clinicalReportQualityStatusLabels,
  clinicalReportSourceLabels,
  clinicalReportStatusLabels,
} from '@/src/features/assessments/lib/clinical-report-display';
import type {
  ClinicalReportVersionListItem,
  ClinicalReportVersionListResponse,
} from '@/src/features/assessments/types/clinical-report-history';
import { PaginationControls } from '@/src/features/patients/components/PaginationControls';
import { formatDateTime } from '@/src/features/patients/lib/patient-display';

const mongoIdPattern = /^[a-f\d]{24}$/i;
const secondaryLinkClassName =
  'inline-flex min-h-9 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-1.5 text-sm font-semibold text-[var(--cma-text-strong)] transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

const sourceFreezeLabels: Record<
  ClinicalReportVersionListItem['sourceFreezeStatus'],
  string
> = {
  none: '来源未冻结',
  in_progress: '来源冻结进行中',
  completed: '来源冻结已完成',
};

function errorMessage(error: ClinicalReportApiError): string {
  const messages: Partial<Record<ClinicalReportApiError['kind'], string>> = {
    forbidden: '当前账号没有读取临床报告版本的权限。',
    validation: '患者或访视链接无效。',
    patient_not_found: '未找到该患者档案。',
    visit_not_found: '未找到该评估访视。',
    clinical_report_history_lineage_invalid:
      '报告版本关系暂时无法安全展示。',
    clinical_report_incomplete: '报告版本信息不完整。',
    service_unavailable: '临床报告版本服务暂时不可用。',
  };

  return messages[error.kind] ?? '暂时无法加载临床报告版本。';
}

function VersionItem({
  item,
  patientId,
  visitId,
}: {
  item: ClinicalReportVersionListItem;
  patientId: string;
  visitId: string;
}) {
  return (
    <article className="grid gap-4 border-b border-[var(--cma-line)] p-5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xl font-semibold text-[var(--cma-text-strong)]">
              V{item.reportVersion} · {item.reportCode}
            </h4>
            {item.isLatestVersion ? <Badge tone="info">最新版本</Badge> : null}
            <Badge>{clinicalReportStatusLabels[item.status]}</Badge>
          </div>
          <p className="mt-2 text-sm text-[var(--cma-muted)]">
            {clinicalReportSourceLabels[item.source]} ·{' '}
            {clinicalReportQualityStatusLabels[item.qualityStatus]} ·{' '}
            {item.isFinal ? '后端标记为最终报告' : '后端未标记为最终报告'}
          </p>
        </div>
        <Link
          className={secondaryLinkClassName}
          href={`/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/clinical-reports/${encodeURIComponent(item.id)}`}
        >
          查看只读详情
        </Link>
      </div>

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">创建 / 更新</dt>
          <dd className="mt-1">
            {formatDateTime(item.createdAt)} / {formatDateTime(item.updatedAt)}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">确认 / 锁定</dt>
          <dd className="mt-1">
            {formatDateTime(item.confirmedAt)} / {formatDateTime(item.lockedAt)}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">来源冻结</dt>
          <dd className="mt-1">
            {sourceFreezeLabels[item.sourceFreezeStatus]} ·{' '}
            {formatDateTime(item.sourceFreezeCompletedAt)}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">归档时间</dt>
          <dd className="mt-1">{formatDateTime(item.archivedAt)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">更正时间</dt>
          <dd className="mt-1">{formatDateTime(item.correctedAt)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">作废时间</dt>
          <dd className="mt-1">{formatDateTime(item.voidedAt)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">前一版本</dt>
          <dd className="mt-1">
            {item.previous
              ? `${item.previous.reportCode} / V${item.previous.reportVersion}`
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">替代版本</dt>
          <dd className="mt-1">
            {item.replacement
              ? `${item.replacement.reportCode} / V${item.replacement.reportVersion}`
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">更正序号</dt>
          <dd className="mt-1">{item.correctionNo ?? '—'}</dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="font-semibold text-[var(--cma-muted)]">
            更正原因 / 变更摘要
          </dt>
          <dd className="mt-1 whitespace-pre-wrap">
            {item.correctionReason || '—'} / {item.changeSummary || '—'}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function ClinicalReportVersionPanel({
  patientId,
  visitId,
}: {
  patientId: string;
  visitId: string;
}) {
  const router = useRouter();
  const idsAreValid =
    mongoIdPattern.test(patientId) && mongoIdPattern.test(visitId);
  const [page, setPage] = useState(1);
  const [versions, setVersions] =
    useState<ClinicalReportVersionListResponse | null>(null);
  const [error, setError] = useState<ClinicalReportApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!idsAreValid) {
      setVersions(null);
      setError(new ClinicalReportApiError('validation', 400));
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    void listClinicalReportVersions(
      patientId,
      visitId,
      { page, pageSize: 20 },
      { signal: controller.signal },
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        if (response.lineage.status !== 'valid') {
          setVersions(null);
          setError(
            new ClinicalReportApiError(
              'clinical_report_history_lineage_invalid',
              409,
            ),
          );
          return;
        }
        setVersions(response);
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        if (
          requestError instanceof ClinicalReportApiError &&
          requestError.kind === 'unauthenticated'
        ) {
          router.replace('/login');
          return;
        }
        setVersions(null);
        setError(
          requestError instanceof ClinicalReportApiError
            ? requestError
            : new ClinicalReportApiError('unknown'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [idsAreValid, page, patientId, retryKey, router, visitId]);

  return (
    <Card>
      <CardHeader className="border-b border-[var(--cma-line)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>临床报告版本</CardTitle>
            <CardDescription>
              独立只读加载；失败不会影响访视、量表实例或当前报告工作流。
            </CardDescription>
          </div>
          <Button
            disabled={isLoading}
            onClick={() => setRetryKey((value) => value + 1)}
            size="sm"
            variant="secondary"
          >
            {isLoading ? '正在加载...' : '重新加载版本'}
          </Button>
        </div>
      </CardHeader>

      {isLoading && !versions ? (
        <CardContent aria-live="polite" className="pt-5" role="status">
          正在加载报告版本列表。
        </CardContent>
      ) : null}

      {error ? (
        <CardContent className="grid gap-3 pt-5" role="alert">
          <Badge tone="warning">
            {error.kind === 'clinical_report_history_lineage_invalid'
              ? '关系不可安全展示'
              : error.kind === 'clinical_report_incomplete'
                ? '版本信息不完整'
                : error.kind === 'forbidden'
                  ? '无权限'
                  : '版本不可用'}
          </Badge>
          <p className="text-lg font-semibold text-[var(--cma-text-strong)]">
            {errorMessage(error)}
          </p>
          <p className="text-sm leading-6 text-[var(--cma-muted)]">
            页面不会展示部分版本、拼接关系或公开内部关联字段；当前报告工作流保持独立可用。
          </p>
        </CardContent>
      ) : null}

      {!error && versions ? (
        <>
          <CardContent className="grid gap-4 pt-5">
            <dl className="grid gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  关系状态
                </dt>
                <dd className="mt-1">有效</dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  首版
                </dt>
                <dd className="mt-1">V{versions.lineage.firstVersion}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  最新版
                </dt>
                <dd className="mt-1">V{versions.lineage.latestVersion}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  版本总数
                </dt>
                <dd className="mt-1">{versions.lineage.totalVersions}</dd>
              </div>
            </dl>
          </CardContent>
          {versions.items.length > 0 ? (
            <div>
              {versions.items.map((item) => (
                <VersionItem
                  item={item}
                  key={item.id}
                  patientId={patientId}
                  visitId={visitId}
                />
              ))}
            </div>
          ) : (
            <CardContent className="py-8 text-center">
              <p className="text-lg font-semibold text-[var(--cma-text-strong)]">
                当前访视暂无临床报告版本
              </p>
              <p className="mt-2 text-sm text-[var(--cma-muted)]">
                空版本链由后端标记为有效，不表示请求失败。
              </p>
            </CardContent>
          )}
          <PaginationControls
            isLoading={isLoading}
            onPageChange={setPage}
            page={versions.page}
            pageSize={versions.pageSize}
            total={versions.total}
          />
        </>
      ) : null}
    </Card>
  );
}
