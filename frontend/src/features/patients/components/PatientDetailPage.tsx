'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Badge, type BadgeTone } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import {
  getPatient,
  listPatientVisits,
  PatientsApiError,
  type PatientsApiErrorKind,
} from '@/src/features/patients/api/patients-api';
import { PaginationControls } from '@/src/features/patients/components/PaginationControls';
import { PatientStatusBadge } from '@/src/features/patients/components/PatientStatusBadge';
import {
  assessmentOperatorRoleLabels,
  assessmentVisitStatuses,
  assessmentVisitStatusLabels,
  assessmentVisitTypeLabels,
  assessmentVisitTypes,
  formatDateTime,
  formatPatientBirthDate,
  isValidDateInput,
  patientHandednessLabels,
  patientSexLabels,
  patientSourceLabels,
  toLocalDayEndIso,
  toLocalDayStartIso,
} from '@/src/features/patients/lib/patient-display';
import type {
  AssessmentVisitListResponse,
  AssessmentVisitStatus,
  AssessmentVisitType,
  ListAssessmentVisitsQuery,
  PatientDetail,
} from '@/src/features/patients/types/patient';

const pageSizes = [20, 50, 100] as const;
const mongoIdPattern = /^[a-f\d]{24}$/i;

const primaryLinkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--cma-primary)] bg-[var(--cma-primary)] px-4 py-2 text-base font-semibold text-white transition-colors hover:bg-[var(--cma-primary-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

const secondaryLinkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-4 py-2 text-base font-semibold text-[var(--cma-text-strong)] transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

const inputClassName =
  'min-h-11 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-base text-[var(--cma-text-strong)] outline-none transition-colors focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)]';

type VisitFilterForm = {
  status: '' | AssessmentVisitStatus;
  visitType: '' | AssessmentVisitType;
  dateFrom: string;
  dateTo: string;
  pageSize: (typeof pageSizes)[number];
};

type VisitUrlState = Omit<ListAssessmentVisitsQuery, 'dateFrom' | 'dateTo'> & {
  page: number;
  pageSize: (typeof pageSizes)[number];
  dateFrom?: string;
  dateTo?: string;
  problem?: string;
};

type VisitLoadError = {
  kind: PatientsApiErrorKind | 'date_validation';
  message: string;
};

const visitStatusTones: Record<AssessmentVisitStatus, BadgeTone> = {
  draft: 'neutral',
  in_progress: 'info',
  completed: 'success',
  locked: 'warning',
  voided: 'warning',
};

function parsePositiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isPageSize(value: number): value is (typeof pageSizes)[number] {
  return pageSizes.some((pageSize) => pageSize === value);
}

function isVisitStatus(value: string | null): value is AssessmentVisitStatus {
  return assessmentVisitStatuses.some((status) => status === value);
}

function isVisitType(value: string | null): value is AssessmentVisitType {
  return assessmentVisitTypes.some((visitType) => visitType === value);
}

function readVisitUrlState(searchKey: string): VisitUrlState {
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
    ...(problem ? { problem } : {}),
  };
}

function getPatientErrorMessage(error: PatientsApiError): {
  title: string;
  description: string;
} {
  if (error.kind === 'validation') {
    return {
      title: '患者链接无效',
      description: '当前地址中的患者标识不符合要求。',
    };
  }

  if (error.kind === 'patient_not_found') {
    return {
      title: '未找到该患者档案',
      description: '该档案可能已不存在，请返回患者列表重新选择。',
    };
  }

  if (error.kind === 'forbidden') {
    return {
      title: '当前账号没有访问患者档案的权限。',
      description: '患者档案访问权限最终以后端校验结果为准。',
    };
  }

  if (error.kind === 'service_unavailable') {
    return {
      title: '患者档案服务暂时不可用',
      description: '请稍后重新加载。',
    };
  }

  return {
    title: '暂时无法加载患者档案',
    description: '请稍后重新加载。',
  };
}

function mapVisitError(error: PatientsApiError): VisitLoadError {
  if (error.kind === 'forbidden') {
    return {
      kind: error.kind,
      message: '当前账号没有访问患者档案的权限。',
    };
  }

  if (error.kind === 'invalid_date_range' || error.kind === 'validation') {
    return {
      kind: error.kind,
      message: '访视筛选条件无效，请检查后重试。',
    };
  }

  if (error.kind === 'service_unavailable') {
    return {
      kind: error.kind,
      message: '评估访视服务暂时不可用，请稍后重试。',
    };
  }

  return {
    kind: error.kind,
    message: '暂时无法加载评估访视，请稍后重试。',
  };
}

export function PatientDetailPage({ patientId }: { patientId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const urlState = useMemo(
    () => readVisitUrlState(searchKey),
    [searchKey],
  );
  const [filters, setFilters] = useState<VisitFilterForm>({
    status: urlState.status ?? '',
    visitType: urlState.visitType ?? '',
    dateFrom: urlState.dateFrom ?? '',
    dateTo: urlState.dateTo ?? '',
    pageSize: urlState.pageSize,
  });
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [patientError, setPatientError] = useState<PatientsApiError | null>(
    null,
  );
  const [isPatientLoading, setIsPatientLoading] = useState(true);
  const [patientRetryKey, setPatientRetryKey] = useState(0);
  const [visits, setVisits] = useState<AssessmentVisitListResponse | null>(null);
  const [visitError, setVisitError] = useState<VisitLoadError | null>(null);
  const [isVisitsLoading, setIsVisitsLoading] = useState(false);
  const [visitRetryKey, setVisitRetryKey] = useState(0);
  const [filterError, setFilterError] = useState<string | null>(
    urlState.problem ?? null,
  );

  useEffect(() => {
    setFilters({
      status: urlState.status ?? '',
      visitType: urlState.visitType ?? '',
      dateFrom: urlState.dateFrom ?? '',
      dateTo: urlState.dateTo ?? '',
      pageSize: urlState.pageSize,
    });
    setFilterError(urlState.problem ?? null);
  }, [
    urlState.dateFrom,
    urlState.dateTo,
    urlState.pageSize,
    urlState.problem,
    urlState.status,
    urlState.visitType,
  ]);

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
        if (controller.signal.aborted) {
          return;
        }

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
        if (!controller.signal.aborted) {
          setIsPatientLoading(false);
        }
      });

    return () => controller.abort();
  }, [patientId, patientRetryKey, router]);

  useEffect(() => {
    if (!patient || urlState.problem) {
      setVisits(null);
      setIsVisitsLoading(false);
      setVisitError(
        urlState.problem
          ? { kind: 'date_validation', message: urlState.problem }
          : null,
      );
      return;
    }

    const controller = new AbortController();
    const dateFrom = urlState.dateFrom
      ? toLocalDayStartIso(urlState.dateFrom)
      : null;
    const dateTo = urlState.dateTo
      ? toLocalDayEndIso(urlState.dateTo)
      : null;
    const query: ListAssessmentVisitsQuery = {
      page: urlState.page,
      pageSize: urlState.pageSize,
      status: urlState.status,
      visitType: urlState.visitType,
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    };

    setIsVisitsLoading(true);
    setVisitError(null);

    void listPatientVisits(patientId, query, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          setVisits(response);
        }
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (requestError instanceof PatientsApiError) {
          if (requestError.kind === 'unauthenticated') {
            router.replace('/login');
            return;
          }

          if (requestError.kind === 'patient_not_found') {
            setPatient(null);
            setPatientError(requestError);
            return;
          }

          setVisitError(mapVisitError(requestError));
        } else {
          setVisitError({
            kind: 'unknown',
            message: '暂时无法加载评估访视，请稍后重试。',
          });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsVisitsLoading(false);
        }
      });

    return () => controller.abort();
  }, [patient, patientId, router, urlState, visitRetryKey]);

  function applyVisitSearchParams(nextValues: {
    page: number;
    pageSize: number;
    status?: AssessmentVisitStatus;
    visitType?: AssessmentVisitType;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const nextSearchParams = new URLSearchParams();
    nextSearchParams.set('page', String(nextValues.page));
    nextSearchParams.set('pageSize', String(nextValues.pageSize));

    if (nextValues.status) {
      nextSearchParams.set('status', nextValues.status);
    }

    if (nextValues.visitType) {
      nextSearchParams.set('visitType', nextValues.visitType);
    }

    if (nextValues.dateFrom) {
      nextSearchParams.set('dateFrom', nextValues.dateFrom);
    }

    if (nextValues.dateTo) {
      nextSearchParams.set('dateTo', nextValues.dateTo);
    }

    router.push(`${pathname}?${nextSearchParams.toString()}`);
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      (filters.dateFrom && !isValidDateInput(filters.dateFrom)) ||
      (filters.dateTo && !isValidDateInput(filters.dateTo))
    ) {
      setFilterError('日期筛选条件无效，请重新选择日期。');
      return;
    }

    if (
      filters.dateFrom &&
      filters.dateTo &&
      filters.dateFrom > filters.dateTo
    ) {
      setFilterError('起始日期不能晚于截止日期。');
      return;
    }

    setFilterError(null);
    applyVisitSearchParams({
      page: 1,
      pageSize: filters.pageSize,
      status: filters.status || undefined,
      visitType: filters.visitType || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
    });
  }

  function handlePageChange(page: number) {
    applyVisitSearchParams({
      page,
      pageSize: urlState.pageSize,
      status: urlState.status,
      visitType: urlState.visitType,
      dateFrom: urlState.dateFrom,
      dateTo: urlState.dateTo,
    });
  }

  if (isPatientLoading && !patient) {
    return (
      <Card aria-live="polite" role="status">
        <CardHeader>
          <CardTitle>正在加载患者档案</CardTitle>
          <CardDescription>正在读取患者公开信息，请稍候。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (patientError || !patient) {
    const state = getPatientErrorMessage(
      patientError ?? new PatientsApiError('unknown'),
    );

    return (
      <Card role="alert">
        <CardHeader>
          <Badge tone="warning">
            {patientError?.kind === 'forbidden' ? '无权限' : '无法访问'}
          </Badge>
          <CardTitle>{state.title}</CardTitle>
          <CardDescription>{state.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {patientError?.kind !== 'validation' &&
          patientError?.kind !== 'patient_not_found' &&
          patientError?.kind !== 'forbidden' ? (
            <Button onClick={() => setPatientRetryKey((value) => value + 1)}>
              重新加载
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
    );
  }

  const hasVisitFilters = Boolean(
    urlState.status ||
      urlState.visitType ||
      urlState.dateFrom ||
      urlState.dateTo,
  );

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-[var(--cma-line)] pb-6">
        <div>
          <Badge tone="info">患者详情</Badge>
          <h1 className="mt-3 text-3xl font-semibold text-[var(--cma-text-strong)] sm:text-4xl">
            {patient.subjectCode}
          </h1>
          <p className="mt-2 text-lg leading-8 text-[var(--cma-muted)]">
            {patient.displayName || '未设置展示名称'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {patient.status === 'active' ? (
            <Link
              className={primaryLinkClassName}
              href={`/patients/${encodeURIComponent(patient.id)}/visits/new`}
            >
              新建访视
            </Link>
          ) : null}
          <Link className={secondaryLinkClassName} href="/patients">
            返回患者列表
          </Link>
          <Link className={secondaryLinkClassName} href="/dashboard">
            返回工作台
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader className="border-b border-[var(--cma-line)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>公开档案信息</CardTitle>
              <CardDescription>仅展示当前公开患者档案字段。</CardDescription>
            </div>
            <PatientStatusBadge status={patient.status} />
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                患者编号
              </dt>
              <dd className="mt-1 text-lg font-semibold text-[var(--cma-text-strong)]">
                {patient.subjectCode}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                展示名称
              </dt>
              <dd className="mt-1 text-lg text-[var(--cma-text-strong)]">
                {patient.displayName || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                数据来源
              </dt>
              <dd className="mt-1 text-lg text-[var(--cma-text-strong)]">
                {patientSourceLabels[patient.sourceType]}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                性别
              </dt>
              <dd className="mt-1 text-lg text-[var(--cma-text-strong)]">
                {patientSexLabels[patient.sex]}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                出生日期
              </dt>
              <dd className="mt-1 text-lg text-[var(--cma-text-strong)]">
                {formatPatientBirthDate(patient.birthDate)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                教育年限
              </dt>
              <dd className="mt-1 text-lg text-[var(--cma-text-strong)]">
                {patient.educationYears === null
                  ? '—'
                  : `${patient.educationYears} 年`}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                利手
              </dt>
              <dd className="mt-1 text-lg text-[var(--cma-text-strong)]">
                {patientHandednessLabels[patient.handedness]}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                状态
              </dt>
              <dd className="mt-2">
                <PatientStatusBadge status={patient.status} />
              </dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                标签
              </dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {patient.tags.length > 0
                  ? patient.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)
                  : '—'}
              </dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                备注
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-base leading-7 text-[var(--cma-text-strong)]">
                {patient.notes || '—'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {patient.status !== 'active' ? (
        <div
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-5 py-4 text-base leading-7 text-[var(--cma-warning)]"
          role="status"
        >
          当前患者状态为“
          {patient.status === 'inactive' ? '停用' : '已归档'}”，不允许创建新的评估访视。
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>评估访视</CardTitle>
          <CardDescription>
            可按访视状态、类型和评估日期范围筛选。当前仅支持查看列表和创建访视。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"
            onSubmit={handleFilterSubmit}
          >
            <div className="grid gap-2">
              <label
                className="font-semibold text-[var(--cma-text-strong)]"
                htmlFor="visit-status"
              >
                访视状态
              </label>
              <select
                className={inputClassName}
                id="visit-status"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value as VisitFilterForm['status'],
                  }))
                }
                value={filters.status}
              >
                <option value="">全部状态</option>
                {assessmentVisitStatuses.map((status) => (
                  <option key={status} value={status}>
                    {assessmentVisitStatusLabels[status]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label
                className="font-semibold text-[var(--cma-text-strong)]"
                htmlFor="visit-type"
              >
                访视类型
              </label>
              <select
                className={inputClassName}
                id="visit-type"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    visitType:
                      event.target.value as VisitFilterForm['visitType'],
                  }))
                }
                value={filters.visitType}
              >
                <option value="">全部类型</option>
                {assessmentVisitTypes.map((visitType) => (
                  <option key={visitType} value={visitType}>
                    {assessmentVisitTypeLabels[visitType]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label
                className="font-semibold text-[var(--cma-text-strong)]"
                htmlFor="visit-date-from"
              >
                起始日期
              </label>
              <input
                className={inputClassName}
                id="visit-date-from"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    dateFrom: event.target.value,
                  }))
                }
                type="date"
                value={filters.dateFrom}
              />
            </div>
            <div className="grid gap-2">
              <label
                className="font-semibold text-[var(--cma-text-strong)]"
                htmlFor="visit-date-to"
              >
                截止日期
              </label>
              <input
                className={inputClassName}
                id="visit-date-to"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    dateTo: event.target.value,
                  }))
                }
                type="date"
                value={filters.dateTo}
              />
            </div>
            <div className="grid gap-2">
              <label
                className="font-semibold text-[var(--cma-text-strong)]"
                htmlFor="visit-page-size"
              >
                每页条数
              </label>
              <select
                className={inputClassName}
                id="visit-page-size"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    pageSize: Number(
                      event.target.value,
                    ) as VisitFilterForm['pageSize'],
                  }))
                }
                value={filters.pageSize}
              >
                {pageSizes.map((pageSize) => (
                  <option key={pageSize} value={pageSize}>
                    {pageSize} 条
                  </option>
                ))}
              </select>
            </div>
            {filterError ? (
              <p
                className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-sm text-[var(--cma-danger)] md:col-span-2 xl:col-span-5"
                role="alert"
              >
                {filterError}
              </p>
            ) : null}
            <div className="flex flex-wrap items-end gap-3 md:col-span-2 xl:col-span-5">
              <Button disabled={isVisitsLoading} type="submit">
                查询
              </Button>
              <Button
                disabled={isVisitsLoading}
                onClick={() => router.push(pathname)}
                variant="secondary"
              >
                重置
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isVisitsLoading && !visits ? (
        <Card aria-live="polite" role="status">
          <CardHeader>
            <CardTitle className="text-xl">正在加载评估访视</CardTitle>
            <CardDescription>正在读取当前患者的访视记录。</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {visitError ? (
        <Card role="alert">
          <CardHeader>
            <Badge tone="warning">
              {visitError.kind === 'forbidden' ? '无权限' : '加载失败'}
            </Badge>
            <CardTitle className="text-xl">{visitError.message}</CardTitle>
            <CardDescription>
              患者公开档案仍保留在本页，可调整筛选条件或稍后重试。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {visitError.kind !== 'forbidden' &&
            visitError.kind !== 'date_validation' ? (
              <Button onClick={() => setVisitRetryKey((value) => value + 1)}>
                重新加载访视
              </Button>
            ) : null}
            <Link className={secondaryLinkClassName} href="/dashboard">
              返回工作台
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {!visitError && visits ? (
        <Card>
          <CardHeader className="border-b border-[var(--cma-line)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xl">访视列表</CardTitle>
                <CardDescription>
                  {isVisitsLoading
                    ? '正在更新访视列表...'
                    : `共找到 ${visits.total} 条访视记录。`}
                </CardDescription>
              </div>
              {isVisitsLoading ? <Badge tone="info">加载中</Badge> : null}
            </div>
          </CardHeader>
          {visits.items.length === 0 ? (
            <CardContent className="py-10 text-center">
              <p className="text-xl font-semibold text-[var(--cma-text-strong)]">
                {hasVisitFilters ? '当前筛选条件下没有访视' : '暂无评估访视'}
              </p>
              <p className="mt-2 text-base text-[var(--cma-muted)]">
                {hasVisitFilters
                  ? '请调整访视状态、类型或评估日期范围。'
                  : patient.status === 'active'
                    ? '可创建首条评估访视。'
                    : '当前患者状态不允许创建新的评估访视。'}
              </p>
              {!hasVisitFilters && patient.status === 'active' ? (
                <Link
                  className={`${primaryLinkClassName} mt-5`}
                  href={`/patients/${encodeURIComponent(patient.id)}/visits/new`}
                >
                  新建访视
                </Link>
              ) : null}
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1160px] w-full border-collapse text-left">
                <thead className="bg-[var(--cma-surface-muted)] text-sm text-[var(--cma-muted)]">
                  <tr>
                    <th className="px-5 py-3 font-semibold">访视编号</th>
                    <th className="px-4 py-3 font-semibold">类型</th>
                    <th className="px-4 py-3 font-semibold">状态</th>
                    <th className="px-4 py-3 font-semibold">评估时间</th>
                    <th className="px-4 py-3 font-semibold">操作者</th>
                    <th className="px-4 py-3 font-semibold">操作者角色</th>
                    <th className="px-4 py-3 font-semibold">开始时间</th>
                    <th className="px-4 py-3 font-semibold">完成时间</th>
                    <th className="px-5 py-3 font-semibold">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.items.map((visit) => (
                    <tr
                      className="border-t border-[var(--cma-line)] align-top"
                      key={visit.id}
                    >
                      <td className="px-5 py-4 font-semibold text-[var(--cma-text-strong)]">
                        {visit.visitCode}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {assessmentVisitTypeLabels[visit.visitType]}
                      </td>
                      <td className="px-4 py-4">
                        <Badge tone={visitStatusTones[visit.status]}>
                          {assessmentVisitStatusLabels[visit.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {formatDateTime(visit.assessmentDate)}
                      </td>
                      <td className="px-4 py-4">
                        {visit.operatorSnapshot?.operatorName || '未记录'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {visit.operatorSnapshot?.operatorRole
                          ? assessmentOperatorRoleLabels[
                              visit.operatorSnapshot.operatorRole
                            ]
                          : '未记录'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {formatDateTime(visit.startedAt)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {formatDateTime(visit.completedAt)}
                      </td>
                      <td className="max-w-72 whitespace-pre-wrap px-5 py-4">
                        {visit.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PaginationControls
            isLoading={isVisitsLoading}
            onPageChange={handlePageChange}
            page={visits.page}
            pageSize={visits.pageSize}
            total={visits.total}
          />
          <p className="border-t border-[var(--cma-line)] px-5 py-4 text-sm leading-6 text-[var(--cma-muted)]">
            量表执行将在后续阶段接入；当前列表不提供访视详情或评估执行入口。
          </p>
        </Card>
      ) : null}
    </div>
  );
}
