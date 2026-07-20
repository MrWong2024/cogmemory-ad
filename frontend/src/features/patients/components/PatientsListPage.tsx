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
  listPatients,
  PatientsApiError,
} from '@/src/features/patients/api/patients-api';
import { PaginationControls } from '@/src/features/patients/components/PaginationControls';
import { PatientStatusBadge } from '@/src/features/patients/components/PatientStatusBadge';
import {
  formatPatientBirthDate,
  patientHandednessLabels,
  patientSexLabels,
  patientSourceLabels,
  patientSourceTypes,
  patientStatusLabels,
  patientStatuses,
} from '@/src/features/patients/lib/patient-display';
import type {
  ListPatientsQuery,
  PatientListResponse,
  PatientSourceType,
  PatientStatus,
} from '@/src/features/patients/types/patient';

const pageSizes = [20, 50, 100] as const;

const primaryLinkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--cma-primary)] bg-[var(--cma-primary)] px-4 py-2 text-base font-semibold text-white transition-colors hover:bg-[var(--cma-primary-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

const secondaryLinkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-4 py-2 text-base font-semibold text-[var(--cma-text-strong)] transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

const inputClassName =
  'min-h-11 min-w-0 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-base text-[var(--cma-text-strong)] outline-none transition-colors focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)]';

type PatientFilterForm = {
  keyword: string;
  status: '' | PatientStatus;
  sourceType: '' | PatientSourceType;
  pageSize: (typeof pageSizes)[number];
};

function parsePositiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isPatientStatus(value: string | null): value is PatientStatus {
  return patientStatuses.some((status) => status === value);
}

function isPatientSourceType(value: string | null): value is PatientSourceType {
  return patientSourceTypes.some((sourceType) => sourceType === value);
}

function isPageSize(value: number): value is (typeof pageSizes)[number] {
  return pageSizes.some((pageSize) => pageSize === value);
}

function readListQuery(searchKey: string): ListPatientsQuery & {
  page: number;
  pageSize: (typeof pageSizes)[number];
} {
  const searchParams = new URLSearchParams(searchKey);
  const page = parsePositiveInteger(searchParams.get('page'), 1);
  const requestedPageSize = parsePositiveInteger(
    searchParams.get('pageSize'),
    20,
  );
  const status = searchParams.get('status');
  const sourceType = searchParams.get('sourceType');
  const keyword = searchParams.get('keyword')?.trim();

  return {
    page,
    pageSize: isPageSize(requestedPageSize) ? requestedPageSize : 20,
    ...(keyword ? { keyword } : {}),
    ...(isPatientStatus(status) ? { status } : {}),
    ...(isPatientSourceType(sourceType) ? { sourceType } : {}),
  };
}

function getListErrorMessage(error: PatientsApiError): string {
  if (error.kind === 'forbidden') {
    return '当前账号没有访问患者档案的权限。';
  }

  if (error.kind === 'validation') {
    return '当前筛选条件无效，请重置后重试。';
  }

  if (error.kind === 'service_unavailable') {
    return '患者档案服务暂时不可用，请稍后重试。';
  }

  return '暂时无法加载患者档案，请稍后重试。';
}

export function PatientsListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const query = useMemo(() => readListQuery(searchKey), [searchKey]);
  const [filters, setFilters] = useState<PatientFilterForm>({
    keyword: query.keyword ?? '',
    status: query.status ?? '',
    sourceType: query.sourceType ?? '',
    pageSize: query.pageSize,
  });
  const [data, setData] = useState<PatientListResponse | null>(null);
  const [error, setError] = useState<PatientsApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setFilters({
      keyword: query.keyword ?? '',
      status: query.status ?? '',
      sourceType: query.sourceType ?? '',
      pageSize: query.pageSize,
    });
  }, [query.keyword, query.pageSize, query.sourceType, query.status]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    void listPatients(query, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          setData(response);
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

        setError(
          requestError instanceof PatientsApiError
            ? requestError
            : new PatientsApiError('unknown'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [query, retryKey, router]);

  function applySearchParams(nextValues: {
    page: number;
    keyword?: string;
    status?: PatientStatus;
    sourceType?: PatientSourceType;
    pageSize: number;
  }) {
    const nextSearchParams = new URLSearchParams();
    nextSearchParams.set('page', String(nextValues.page));
    nextSearchParams.set('pageSize', String(nextValues.pageSize));

    if (nextValues.keyword) {
      nextSearchParams.set('keyword', nextValues.keyword);
    }

    if (nextValues.status) {
      nextSearchParams.set('status', nextValues.status);
    }

    if (nextValues.sourceType) {
      nextSearchParams.set('sourceType', nextValues.sourceType);
    }

    router.push(`${pathname}?${nextSearchParams.toString()}`);
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applySearchParams({
      page: 1,
      pageSize: filters.pageSize,
      keyword: filters.keyword.trim() || undefined,
      status: filters.status || undefined,
      sourceType: filters.sourceType || undefined,
    });
  }

  function handlePageChange(page: number) {
    applySearchParams({
      page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      status: query.status,
      sourceType: query.sourceType,
    });
  }

  const hasFilters = Boolean(query.keyword || query.status || query.sourceType);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-5 border-b border-[var(--cma-line)] pb-6">
        <div className="min-w-0">
          <Badge tone="info">患者与访视</Badge>
          <h1 className="mt-3 text-3xl font-semibold text-[var(--cma-text-strong)] sm:text-4xl">
            患者档案
          </h1>
          <p className="mt-2 max-w-3xl text-lg leading-8 text-[var(--cma-muted)]">
            用于查看患者 / 受试者档案并进入评估访视记录。
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-3">
          <Link className={primaryLinkClassName} href="/patients/new">
            新建患者
          </Link>
          <Link className={secondaryLinkClassName} href="/dashboard">
            返回工作台
          </Link>
        </div>
      </header>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-xl">筛选患者档案</CardTitle>
          <CardDescription>
            关键词由后端检索患者编号或展示名称；筛选条件会保留在当前地址中。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-5"
            onSubmit={handleFilterSubmit}
          >
            <div className="grid min-w-0 gap-2 xl:col-span-2">
              <label
                className="font-semibold text-[var(--cma-text-strong)]"
                htmlFor="patient-keyword"
              >
                关键词
              </label>
              <input
                className={inputClassName}
                id="patient-keyword"
                maxLength={100}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    keyword: event.target.value,
                  }))
                }
                placeholder="输入患者编号或展示名称"
                type="search"
                value={filters.keyword}
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <label
                className="font-semibold text-[var(--cma-text-strong)]"
                htmlFor="patient-status"
              >
                患者状态
              </label>
              <select
                className={inputClassName}
                id="patient-status"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value as PatientFilterForm['status'],
                  }))
                }
                value={filters.status}
              >
                <option value="">全部状态</option>
                {patientStatuses.map((status) => (
                  <option key={status} value={status}>
                    {patientStatusLabels[status]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid min-w-0 gap-2">
              <label
                className="font-semibold text-[var(--cma-text-strong)]"
                htmlFor="patient-source"
              >
                数据来源
              </label>
              <select
                className={inputClassName}
                id="patient-source"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    sourceType:
                      event.target.value as PatientFilterForm['sourceType'],
                  }))
                }
                value={filters.sourceType}
              >
                <option value="">全部来源</option>
                {patientSourceTypes.map((sourceType) => (
                  <option key={sourceType} value={sourceType}>
                    {patientSourceLabels[sourceType]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid min-w-0 gap-2">
              <label
                className="font-semibold text-[var(--cma-text-strong)]"
                htmlFor="patient-page-size"
              >
                每页条数
              </label>
              <select
                className={inputClassName}
                id="patient-page-size"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    pageSize: Number(
                      event.target.value,
                    ) as PatientFilterForm['pageSize'],
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
            <div className="flex min-w-0 flex-wrap items-end gap-3 md:col-span-2 xl:col-span-5">
              <Button disabled={isLoading} type="submit">
                查询
              </Button>
              <Button
                disabled={isLoading}
                onClick={() => router.push('/patients')}
                variant="secondary"
              >
                重置
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isLoading && !data ? (
        <Card aria-live="polite" className="min-w-0" role="status">
          <CardHeader>
            <CardTitle className="text-xl">正在加载患者档案</CardTitle>
            <CardDescription>正在读取当前页数据，请稍候。</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {error ? (
        <Card className="min-w-0" role="alert">
          <CardHeader>
            <Badge tone="warning">
              {error.kind === 'forbidden' ? '无权限' : '加载失败'}
            </Badge>
            <CardTitle className="text-xl">{getListErrorMessage(error)}</CardTitle>
            <CardDescription>
              患者档案访问权限最终以后端校验结果为准。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {error.kind !== 'forbidden' ? (
              <Button onClick={() => setRetryKey((value) => value + 1)}>
                重新加载
              </Button>
            ) : null}
            <Link className={secondaryLinkClassName} href="/dashboard">
              返回工作台
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {!error && data ? (
        <Card className="min-w-0">
          <CardHeader className="border-b border-[var(--cma-line)]">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-xl">档案列表</CardTitle>
                <CardDescription>
                  {isLoading ? '正在更新列表...' : `共找到 ${data.total} 条记录。`}
                </CardDescription>
              </div>
              {isLoading ? <Badge tone="info">加载中</Badge> : null}
            </div>
          </CardHeader>
          {data.items.length === 0 ? (
            <CardContent className="py-10 text-center">
              <p className="text-xl font-semibold text-[var(--cma-text-strong)]">
                {hasFilters ? '当前筛选条件下没有结果' : '暂无患者档案'}
              </p>
              <p className="mt-2 text-base text-[var(--cma-muted)]">
                {hasFilters
                  ? '请调整关键词、状态或数据来源后重新查询。'
                  : '可从“新建患者”开始建立首份档案。'}
              </p>
            </CardContent>
          ) : (
            <div className="max-w-full min-w-0 overflow-x-auto">
              <table className="min-w-[1120px] w-full border-collapse text-left">
                <thead className="bg-[var(--cma-surface-muted)] text-sm text-[var(--cma-muted)]">
                  <tr>
                    <th className="px-5 py-3 font-semibold">患者编号</th>
                    <th className="px-4 py-3 font-semibold">展示名称</th>
                    <th className="px-4 py-3 font-semibold">来源</th>
                    <th className="px-4 py-3 font-semibold">性别</th>
                    <th className="px-4 py-3 font-semibold">出生日期</th>
                    <th className="px-4 py-3 font-semibold">教育年限</th>
                    <th className="px-4 py-3 font-semibold">利手</th>
                    <th className="px-4 py-3 font-semibold">状态</th>
                    <th className="px-4 py-3 font-semibold">标签</th>
                    <th className="px-5 py-3 font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((patient) => (
                    <tr
                      className="border-t border-[var(--cma-line)] align-top"
                      key={patient.id}
                    >
                      <td className="px-5 py-4 font-semibold text-[var(--cma-text-strong)]">
                        {patient.subjectCode}
                      </td>
                      <td className="px-4 py-4">
                        {patient.displayName || '—'}
                      </td>
                      <td className="px-4 py-4">
                        {patientSourceLabels[patient.sourceType]}
                      </td>
                      <td className="px-4 py-4">
                        {patientSexLabels[patient.sex]}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {formatPatientBirthDate(patient.birthDate)}
                      </td>
                      <td className="px-4 py-4">
                        {patient.educationYears === null
                          ? '—'
                          : `${patient.educationYears} 年`}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {patientHandednessLabels[patient.handedness]}
                      </td>
                      <td className="px-4 py-4">
                        <PatientStatusBadge status={patient.status} />
                      </td>
                      <td className="px-4 py-4">
                        {patient.tags.length > 0 ? (
                          <div className="flex max-w-56 flex-wrap gap-1.5">
                            {patient.tags.map((tag) => (
                              <Badge key={tag}>{tag}</Badge>
                            ))}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          className="font-semibold text-[var(--cma-primary)] underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]"
                          href={`/patients/${encodeURIComponent(patient.id)}`}
                        >
                          查看
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PaginationControls
            isLoading={isLoading}
            onPageChange={handlePageChange}
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
          />
        </Card>
      ) : null}
    </div>
  );
}
