'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

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
  ClinicalHistoryApiError,
  listPatientAssessmentHistory,
} from '@/src/features/patients/api/clinical-history-api';
import {
  getPatient,
  PatientsApiError,
} from '@/src/features/patients/api/patients-api';
import { AssessmentHistoryFilters } from '@/src/features/patients/components/AssessmentHistoryFilters';
import type { AssessmentHistoryFilterValues } from '@/src/features/patients/components/AssessmentHistoryFilters';
import { assessmentHistoryPageSizes } from '@/src/features/patients/components/AssessmentHistoryFilters';
import { AssessmentHistoryList } from '@/src/features/patients/components/AssessmentHistoryList';
import { PaginationControls } from '@/src/features/patients/components/PaginationControls';
import { PatientStatusBadge } from '@/src/features/patients/components/PatientStatusBadge';
import {
  assessmentVisitStatuses,
  assessmentVisitTypes,
  isValidDateInput,
  toLocalDayEndIso,
  toLocalDayStartIso,
} from '@/src/features/patients/lib/patient-display';
import type {
  ListPatientAssessmentHistoryQuery,
  PatientAssessmentHistoryResponse,
} from '@/src/features/patients/types/clinical-history';
import type {
  AssessmentVisitStatus,
  AssessmentVisitType,
  PatientDetail,
} from '@/src/features/patients/types/patient';

const mongoIdPattern = /^[a-f\d]{24}$/i;
const secondaryLinkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-4 py-2 text-base font-semibold text-[var(--cma-text-strong)] transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

type HistoryUrlState = {
  page: number;
  pageSize: (typeof assessmentHistoryPageSizes)[number];
  status?: AssessmentVisitStatus;
  visitType?: AssessmentVisitType;
  dateFrom?: string;
  dateTo?: string;
  scaleCode?: string;
  problem?: string;
};

function parsePositiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isPageSize(
  value: number,
): value is (typeof assessmentHistoryPageSizes)[number] {
  return assessmentHistoryPageSizes.some((pageSize) => pageSize === value);
}

function isVisitStatus(value: string | null): value is AssessmentVisitStatus {
  return assessmentVisitStatuses.some((status) => status === value);
}

function isVisitType(value: string | null): value is AssessmentVisitType {
  return assessmentVisitTypes.some((visitType) => visitType === value);
}

function readHistoryUrlState(searchKey: string): HistoryUrlState {
  const searchParams = new URLSearchParams(searchKey);
  const page = parsePositiveInteger(searchParams.get('page'), 1);
  const requestedPageSize = parsePositiveInteger(
    searchParams.get('pageSize'),
    20,
  );
  const status = searchParams.get('status');
  const visitType = searchParams.get('visitType');
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';
  const scaleCode = searchParams.get('scaleCode')?.trim().toLowerCase() ?? '';
  let problem: string | undefined;

  if (
    (dateFrom && !isValidDateInput(dateFrom)) ||
    (dateTo && !isValidDateInput(dateTo))
  ) {
    problem = '日期筛选条件无效，请重新选择日期。';
  } else if (dateFrom && dateTo && dateFrom > dateTo) {
    problem = '起始日期不能晚于截止日期。';
  }

  return {
    page,
    pageSize: isPageSize(requestedPageSize) ? requestedPageSize : 20,
    ...(isVisitStatus(status) ? { status } : {}),
    ...(isVisitType(visitType) ? { visitType } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(scaleCode ? { scaleCode } : {}),
    ...(problem ? { problem } : {}),
  };
}

function historyErrorMessage(error: ClinicalHistoryApiError): string {
  const messages: Partial<Record<ClinicalHistoryApiError['kind'], string>> = {
    forbidden: '当前账号没有读取患者评估历史的权限。',
    validation: '评估历史筛选条件无效，请检查后重试。',
    invalid_date_range: '起始日期不能晚于截止日期。',
    patient_not_found: '未找到该患者档案。',
    service_unavailable: '患者评估历史服务暂时不可用，请稍后重试。',
  };

  return messages[error.kind] ?? '暂时无法加载患者评估历史，请稍后重试。';
}

export function PatientAssessmentHistoryPage({
  patientId,
}: {
  patientId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const urlState = useMemo(
    () => readHistoryUrlState(searchKey),
    [searchKey],
  );
  const [filters, setFilters] = useState<AssessmentHistoryFilterValues>({
    status: urlState.status ?? '',
    visitType: urlState.visitType ?? '',
    dateFrom: urlState.dateFrom ?? '',
    dateTo: urlState.dateTo ?? '',
    scaleCode: urlState.scaleCode ?? '',
    pageSize: urlState.pageSize,
  });
  const [filterError, setFilterError] = useState<string | null>(
    urlState.problem ?? null,
  );
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [patientError, setPatientError] = useState<PatientsApiError | null>(
    null,
  );
  const [isPatientLoading, setIsPatientLoading] = useState(true);
  const [patientRetryKey, setPatientRetryKey] = useState(0);
  const [history, setHistory] =
    useState<PatientAssessmentHistoryResponse | null>(null);
  const [historyError, setHistoryError] =
    useState<ClinicalHistoryApiError | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyRetryKey, setHistoryRetryKey] = useState(0);

  useEffect(() => {
    setFilters({
      status: urlState.status ?? '',
      visitType: urlState.visitType ?? '',
      dateFrom: urlState.dateFrom ?? '',
      dateTo: urlState.dateTo ?? '',
      scaleCode: urlState.scaleCode ?? '',
      pageSize: urlState.pageSize,
    });
    setFilterError(urlState.problem ?? null);
  }, [urlState]);

  useEffect(() => {
    if (!mongoIdPattern.test(patientId)) {
      setPatient(null);
      setPatientError(new PatientsApiError('validation', 400));
      setIsPatientLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsPatientLoading(true);
    setPatientError(null);

    void getPatient(patientId, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          setPatient(response);
        }
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        if (
          requestError instanceof PatientsApiError &&
          requestError.kind === 'unauthenticated'
        ) {
          router.replace('/login');
          return;
        }
        setPatient(null);
        setPatientError(
          requestError instanceof PatientsApiError
            ? requestError
            : new PatientsApiError('unknown'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsPatientLoading(false);
      });

    return () => controller.abort();
  }, [patientId, patientRetryKey, router]);

  useEffect(() => {
    if (!mongoIdPattern.test(patientId)) {
      setHistory(null);
      setHistoryError(new ClinicalHistoryApiError('validation', 400));
      setIsHistoryLoading(false);
      return;
    }

    if (urlState.problem) {
      setHistory(null);
      setHistoryError(null);
      setIsHistoryLoading(false);
      return;
    }

    const controller = new AbortController();
    const dateFrom = urlState.dateFrom
      ? toLocalDayStartIso(urlState.dateFrom)
      : null;
    const dateTo = urlState.dateTo
      ? toLocalDayEndIso(urlState.dateTo)
      : null;
    const query: ListPatientAssessmentHistoryQuery = {
      page: urlState.page,
      pageSize: urlState.pageSize,
      status: urlState.status,
      visitType: urlState.visitType,
      scaleCode: urlState.scaleCode,
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    };

    setIsHistoryLoading(true);
    setHistoryError(null);

    void listPatientAssessmentHistory(patientId, query, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!controller.signal.aborted) setHistory(response);
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        if (
          requestError instanceof ClinicalHistoryApiError &&
          requestError.kind === 'unauthenticated'
        ) {
          router.replace('/login');
          return;
        }
        setHistoryError(
          requestError instanceof ClinicalHistoryApiError
            ? requestError
            : new ClinicalHistoryApiError('unknown'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsHistoryLoading(false);
      });

    return () => controller.abort();
  }, [historyRetryKey, patientId, router, urlState]);

  function applySearchParams(next: HistoryUrlState) {
    const nextSearchParams = new URLSearchParams();
    nextSearchParams.set('page', String(next.page));
    nextSearchParams.set('pageSize', String(next.pageSize));
    if (next.status) nextSearchParams.set('status', next.status);
    if (next.visitType) nextSearchParams.set('visitType', next.visitType);
    if (next.dateFrom) nextSearchParams.set('dateFrom', next.dateFrom);
    if (next.dateTo) nextSearchParams.set('dateTo', next.dateTo);
    if (next.scaleCode) nextSearchParams.set('scaleCode', next.scaleCode);
    router.push(`${pathname}?${nextSearchParams.toString()}`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      (filters.dateFrom && !isValidDateInput(filters.dateFrom)) ||
      (filters.dateTo && !isValidDateInput(filters.dateTo))
    ) {
      setFilterError('日期筛选条件无效，请重新选择日期。');
      return;
    }
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      setFilterError('起始日期不能晚于截止日期。');
      return;
    }

    setFilterError(null);
    applySearchParams({
      page: 1,
      pageSize: filters.pageSize,
      status: filters.status || undefined,
      visitType: filters.visitType || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      scaleCode: filters.scaleCode.trim().toLowerCase() || undefined,
    });
  }

  const hasFilters = Boolean(
    urlState.status ||
      urlState.visitType ||
      urlState.dateFrom ||
      urlState.dateTo ||
      urlState.scaleCode,
  );

  return (
    <div className="grid gap-6">
      {patient ? (
        <header className="flex flex-wrap items-start justify-between gap-5 border-b border-[var(--cma-line)] pb-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">评估历史</Badge>
              <PatientStatusBadge status={patient.status} />
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-[var(--cma-text-strong)] sm:text-4xl">
              {patient.subjectCode}
            </h1>
            <p className="mt-2 text-lg text-[var(--cma-muted)]">
              {patient.displayName || '未设置展示名称'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className={secondaryLinkClassName}
              href={`/patients/${encodeURIComponent(patientId)}`}
            >
              返回患者详情
            </Link>
            <Link
              className={secondaryLinkClassName}
              href={`/patients/${encodeURIComponent(patientId)}/trends`}
            >
              打开随访趋势
            </Link>
            <Link className={secondaryLinkClassName} href="/patients">
              返回患者列表
            </Link>
            <Link className={secondaryLinkClassName} href="/dashboard">
              返回工作台
            </Link>
          </div>
        </header>
      ) : isPatientLoading ? (
        <Card aria-live="polite" role="status">
          <CardHeader>
            <CardTitle>正在加载患者摘要</CardTitle>
            <CardDescription>评估历史将独立加载。</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card role="alert">
          <CardHeader>
            <Badge tone="warning">患者摘要不可用</Badge>
            <CardTitle>
              {patientError?.kind === 'patient_not_found'
                ? '未找到该患者档案'
                : patientError?.kind === 'forbidden'
                  ? '当前账号没有读取患者摘要的权限'
                  : '暂时无法加载患者摘要'}
            </CardTitle>
            <CardDescription>
              评估历史使用独立请求；可返回患者列表或稍后重试摘要。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {patientError?.kind !== 'validation' &&
            patientError?.kind !== 'patient_not_found' &&
            patientError?.kind !== 'forbidden' ? (
              <Button onClick={() => setPatientRetryKey((value) => value + 1)}>
                重新加载患者摘要
              </Button>
            ) : null}
            <Link className={secondaryLinkClassName} href="/patients">
              返回患者列表
            </Link>
            <Link className={secondaryLinkClassName} href="/dashboard">
              返回工作台
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>评估历史筛选</CardTitle>
          <CardDescription>
            筛选条件保存在当前 URL；历史量表编码允许输入已退出当前目录的 code。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AssessmentHistoryFilters
            error={filterError}
            isLoading={isHistoryLoading}
            onChange={setFilters}
            onReset={() => router.push(pathname)}
            onSubmit={handleSubmit}
            values={filters}
          />
        </CardContent>
      </Card>

      {isHistoryLoading && !history ? (
        <Card aria-live="polite" role="status">
          <CardHeader>
            <CardTitle>正在加载评估历史</CardTitle>
            <CardDescription>正在读取后端已排序的历史摘要。</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {historyError ? (
        <Card role="alert">
          <CardHeader>
            <Badge tone="warning">
              {historyError.kind === 'forbidden' ? '无权限' : '历史不可用'}
            </Badge>
            <CardTitle>{historyErrorMessage(historyError)}</CardTitle>
            <CardDescription>
              已加载的患者摘要仍保留；页面不会自动重试。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!['forbidden', 'validation', 'invalid_date_range', 'patient_not_found'].includes(
              historyError.kind,
            ) ? (
              <Button onClick={() => setHistoryRetryKey((value) => value + 1)}>
                重新加载评估历史
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!historyError && history ? (
        <Card>
          <CardHeader className="border-b border-[var(--cma-line)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>患者评估历史</CardTitle>
                <CardDescription>
                  {isHistoryLoading
                    ? '正在更新历史列表...'
                    : `共 ${history.total} 条访视记录，保持后端排序。`}
                </CardDescription>
              </div>
              {isHistoryLoading ? <Badge tone="info">加载中</Badge> : null}
            </div>
          </CardHeader>
          {history.items.length > 0 ? (
            <AssessmentHistoryList items={history.items} patientId={patientId} />
          ) : (
            <CardContent className="py-10 text-center">
              <p className="text-xl font-semibold text-[var(--cma-text-strong)]">
                {hasFilters ? '当前筛选条件下没有评估历史' : '暂无评估历史'}
              </p>
              <p className="mt-2 text-[var(--cma-muted)]">
                {hasFilters ? '请调整筛选条件后重新查询。' : '当前患者暂无访视记录。'}
              </p>
            </CardContent>
          )}
          <PaginationControls
            isLoading={isHistoryLoading}
            onPageChange={(page) =>
              applySearchParams({ ...urlState, page, problem: undefined })
            }
            page={history.page}
            pageSize={history.pageSize}
            total={history.total}
          />
        </Card>
      ) : null}
    </div>
  );
}
