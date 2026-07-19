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
  AssessmentExecutionApiError,
  listAvailableScales,
} from '@/src/features/assessments/api/assessment-execution-api';
import type { AvailableScaleOption } from '@/src/features/assessments/types/assessment-execution';
import {
  ClinicalHistoryApiError,
  getPatientFollowUpTrend,
} from '@/src/features/patients/api/clinical-history-api';
import {
  getPatient,
  PatientsApiError,
} from '@/src/features/patients/api/patients-api';
import { FollowUpTrendChart } from '@/src/features/patients/components/FollowUpTrendChart';
import { FollowUpTrendControls } from '@/src/features/patients/components/FollowUpTrendControls';
import type { FollowUpTrendControlValues } from '@/src/features/patients/components/FollowUpTrendControls';
import { FollowUpTrendTable } from '@/src/features/patients/components/FollowUpTrendTable';
import { PatientStatusBadge } from '@/src/features/patients/components/PatientStatusBadge';
import {
  formatDateTime,
  isValidDateInput,
  toLocalDayEndIso,
  toLocalDayStartIso,
} from '@/src/features/patients/lib/patient-display';
import type { PatientFollowUpTrendResponse } from '@/src/features/patients/types/clinical-history';
import type { PatientDetail } from '@/src/features/patients/types/patient';

const mongoIdPattern = /^[a-f\d]{24}$/i;
const secondaryLinkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-4 py-2 text-base font-semibold text-[var(--cma-text-strong)] transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

type TrendUrlState = {
  scaleCode?: string;
  dateFrom?: string;
  dateTo?: string;
  maxPoints: number;
  problem?: string;
};

function readTrendUrlState(searchKey: string): TrendUrlState {
  const searchParams = new URLSearchParams(searchKey);
  const scaleCode = searchParams.get('scaleCode')?.trim().toLowerCase() ?? '';
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';
  const maxPointsValue = searchParams.get('maxPoints');
  const parsedMaxPoints = maxPointsValue === null ? 50 : Number(maxPointsValue);
  let problem: string | undefined;

  if (
    (dateFrom && !isValidDateInput(dateFrom)) ||
    (dateTo && !isValidDateInput(dateTo))
  ) {
    problem = '日期筛选条件无效，请重新选择日期。';
  } else if (dateFrom && dateTo && dateFrom > dateTo) {
    problem = '起始日期不能晚于截止日期。';
  } else if (
    !Number.isInteger(parsedMaxPoints) ||
    parsedMaxPoints < 2 ||
    parsedMaxPoints > 100
  ) {
    problem = '最大访视点数必须是 2–100 之间的整数。';
  }

  return {
    ...(scaleCode ? { scaleCode } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    maxPoints:
      Number.isInteger(parsedMaxPoints) &&
      parsedMaxPoints >= 2 &&
      parsedMaxPoints <= 100
        ? parsedMaxPoints
        : 50,
    ...(problem ? { problem } : {}),
  };
}

function trendErrorMessage(error: ClinicalHistoryApiError): string {
  const messages: Partial<Record<ClinicalHistoryApiError['kind'], string>> = {
    forbidden: '当前账号没有读取患者随访趋势的权限。',
    validation: '趋势查询条件无效，请检查后重试。',
    invalid_date_range: '起始日期不能晚于截止日期。',
    patient_not_found: '未找到该患者档案。',
    scale_not_available: '当前量表暂不可用于随访趋势。',
    follow_up_trend_range_too_large:
      '所选时间范围内访视数量超过上限，请缩小日期范围或调整上限。',
    follow_up_trend_data_invalid:
      '部分历史数据无法安全形成趋势，请联系管理员核查。',
    service_unavailable: '随访趋势服务暂时不可用，请稍后重试。',
  };

  return messages[error.kind] ?? '暂时无法加载随访趋势，请稍后重试。';
}

function catalogErrorMessage(error: AssessmentExecutionApiError): string {
  if (error.kind === 'forbidden') {
    return '当前账号没有读取可用量表目录的权限。';
  }
  if (
    error.kind === 'scale_catalog_invalid' ||
    error.kind === 'service_unavailable'
  ) {
    return '可用量表目录暂时不可用，请稍后重试。';
  }
  return '暂时无法加载可用量表目录。';
}

export function PatientFollowUpTrendPage({
  patientId,
}: {
  patientId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const urlState = useMemo(() => readTrendUrlState(searchKey), [searchKey]);
  const [controls, setControls] = useState<FollowUpTrendControlValues>({
    scaleCode: urlState.scaleCode ?? '',
    dateFrom: urlState.dateFrom ?? '',
    dateTo: urlState.dateTo ?? '',
    maxPoints: String(urlState.maxPoints),
  });
  const [controlError, setControlError] = useState<string | null>(
    urlState.problem ?? null,
  );
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [patientError, setPatientError] = useState<PatientsApiError | null>(
    null,
  );
  const [isPatientLoading, setIsPatientLoading] = useState(true);
  const [patientRetryKey, setPatientRetryKey] = useState(0);
  const [catalog, setCatalog] = useState<AvailableScaleOption[] | null>(null);
  const [catalogError, setCatalogError] =
    useState<AssessmentExecutionApiError | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [catalogRetryKey, setCatalogRetryKey] = useState(0);
  const [trend, setTrend] = useState<PatientFollowUpTrendResponse | null>(null);
  const [trendError, setTrendError] =
    useState<ClinicalHistoryApiError | null>(null);
  const [isTrendLoading, setIsTrendLoading] = useState(false);
  const [trendRetryKey, setTrendRetryKey] = useState(0);

  useEffect(() => {
    setControls({
      scaleCode: urlState.scaleCode ?? '',
      dateFrom: urlState.dateFrom ?? '',
      dateTo: urlState.dateTo ?? '',
      maxPoints: String(urlState.maxPoints),
    });
    setControlError(urlState.problem ?? null);
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
        if (!controller.signal.aborted) setPatient(response);
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
    const controller = new AbortController();
    setIsCatalogLoading(true);
    setCatalogError(null);
    void listAvailableScales({ signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setCatalog(response.items);
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        if (
          requestError instanceof AssessmentExecutionApiError &&
          requestError.kind === 'unauthenticated'
        ) {
          router.replace('/login');
          return;
        }
        setCatalog(null);
        setCatalogError(
          requestError instanceof AssessmentExecutionApiError
            ? requestError
            : new AssessmentExecutionApiError('unknown'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsCatalogLoading(false);
      });
    return () => controller.abort();
  }, [catalogRetryKey, router]);

  useEffect(() => {
    if (!mongoIdPattern.test(patientId)) {
      setTrend(null);
      setTrendError(new ClinicalHistoryApiError('validation', 400));
      setIsTrendLoading(false);
      return;
    }
    if (!urlState.scaleCode || urlState.problem) {
      setTrend(null);
      setTrendError(null);
      setIsTrendLoading(false);
      return;
    }

    const controller = new AbortController();
    const dateFrom = urlState.dateFrom
      ? toLocalDayStartIso(urlState.dateFrom)
      : null;
    const dateTo = urlState.dateTo
      ? toLocalDayEndIso(urlState.dateTo)
      : null;
    setIsTrendLoading(true);
    setTrendError(null);
    void getPatientFollowUpTrend(
      patientId,
      {
        scaleCode: urlState.scaleCode,
        maxPoints: urlState.maxPoints,
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      },
      { signal: controller.signal },
    )
      .then((response) => {
        if (!controller.signal.aborted) setTrend(response);
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
        setTrend(null);
        setTrendError(
          requestError instanceof ClinicalHistoryApiError
            ? requestError
            : new ClinicalHistoryApiError('unknown'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsTrendLoading(false);
      });

    return () => controller.abort();
  }, [patientId, router, trendRetryKey, urlState]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const maxPoints = Number(controls.maxPoints);
    if (!controls.scaleCode.trim()) {
      setControlError('请选择要查询的量表。');
      return;
    }
    if (
      (controls.dateFrom && !isValidDateInput(controls.dateFrom)) ||
      (controls.dateTo && !isValidDateInput(controls.dateTo))
    ) {
      setControlError('日期筛选条件无效，请重新选择日期。');
      return;
    }
    if (
      controls.dateFrom &&
      controls.dateTo &&
      controls.dateFrom > controls.dateTo
    ) {
      setControlError('起始日期不能晚于截止日期。');
      return;
    }
    if (!Number.isInteger(maxPoints) || maxPoints < 2 || maxPoints > 100) {
      setControlError('最大访视点数必须是 2–100 之间的整数。');
      return;
    }

    setControlError(null);
    const nextSearchParams = new URLSearchParams();
    nextSearchParams.set('scaleCode', controls.scaleCode.trim().toLowerCase());
    nextSearchParams.set('maxPoints', String(maxPoints));
    if (controls.dateFrom) nextSearchParams.set('dateFrom', controls.dateFrom);
    if (controls.dateTo) nextSearchParams.set('dateTo', controls.dateTo);
    router.push(`${pathname}?${nextSearchParams.toString()}`);
  }

  return (
    <div className="grid gap-6">
      {patient ? (
        <header className="flex flex-wrap items-start justify-between gap-5 border-b border-[var(--cma-line)] pb-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">随访趋势</Badge>
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
              href={`/patients/${encodeURIComponent(patientId)}/history`}
            >
              打开评估历史
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
            <CardDescription>量表目录与趋势状态独立加载。</CardDescription>
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
            <CardDescription>可返回患者列表或稍后重试。</CardDescription>
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
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>趋势查询</CardTitle>
          <CardDescription>
            选择当前可用量表并明确查询；页面不会自动选择量表或轮询结果。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FollowUpTrendControls
            catalog={catalog}
            error={controlError}
            isCatalogLoading={isCatalogLoading}
            isTrendLoading={isTrendLoading}
            onChange={setControls}
            onReset={() => router.push(pathname)}
            onSubmit={handleSubmit}
            values={controls}
          />
        </CardContent>
      </Card>

      {catalogError ? (
        <Card role="alert">
          <CardHeader>
            <Badge tone="warning">量表目录不可用</Badge>
            <CardTitle>{catalogErrorMessage(catalogError)}</CardTitle>
            <CardDescription>
              患者摘要和已通过 URL 发起的趋势请求不会因此被清除。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {catalogError.kind !== 'forbidden' ? (
              <Button onClick={() => setCatalogRetryKey((value) => value + 1)}>
                重新加载量表目录
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!urlState.scaleCode && !urlState.problem ? (
        <Card>
          <CardHeader>
            <CardTitle>尚未查询趋势</CardTitle>
            <CardDescription>
              请选择量表并点击“查询趋势”；未选择量表时不会请求趋势接口。
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {isTrendLoading && !trend ? (
        <Card aria-live="polite" role="status">
          <CardHeader>
            <CardTitle>正在加载随访趋势</CardTitle>
            <CardDescription>
              新查询已取消此前未完成的趋势请求。
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {trendError ? (
        <Card role="alert">
          <CardHeader>
            <Badge tone="warning">
              {trendError.kind === 'forbidden' ? '无权限' : '趋势不可用'}
            </Badge>
            <CardTitle>{trendErrorMessage(trendError)}</CardTitle>
            <CardDescription>
              页面不从不完整响应推测分数、比较或内部原因，也不会自动重试。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!['forbidden', 'validation', 'invalid_date_range', 'patient_not_found', 'scale_not_available', 'follow_up_trend_range_too_large'].includes(
              trendError.kind,
            ) ? (
              <Button onClick={() => setTrendRetryKey((value) => value + 1)}>
                重新加载随访趋势
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!trendError && trend ? (
        <Card>
          <CardHeader className="border-b border-[var(--cma-line)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>
                  {trend.scale.displayName} 随访趋势
                </CardTitle>
                <CardDescription>
                  {trend.scale.scaleCode} · {trend.range.pointCount} 个访视点 ·{' '}
                  {trend.range.dateFrom
                    ? formatDateTime(trend.range.dateFrom)
                    : '未限制'}{' '}
                  至{' '}
                  {trend.range.dateTo
                    ? formatDateTime(trend.range.dateTo)
                    : '未限制'}
                </CardDescription>
              </div>
              {isTrendLoading ? <Badge tone="info">更新中</Badge> : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 pt-5">
            <section className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] p-4 text-sm leading-6 text-[var(--cma-info)]">
              <p className="font-semibold">
                可比性策略：{trend.comparabilityPolicy.version}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>只比较时间上紧邻的两个访视。</li>
                <li>版本、施测方式或评分范围不同可能不可比较。</li>
                <li>缺失点不会被跳过，也不会显示为 0。</li>
                <li>scorePercent 只是得分比例，不是疾病概率。</li>
                <li>页面不提供诊断、风险、治疗或趋势预测。</li>
              </ul>
            </section>
            {trend.points.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xl font-semibold text-[var(--cma-text-strong)]">
                  所选范围内没有访视
                </p>
                <p className="mt-2 text-[var(--cma-muted)]">
                  可调整日期范围后重新查询。
                </p>
              </div>
            ) : (
              <>
                <FollowUpTrendChart response={trend} />
                <FollowUpTrendTable points={trend.points} />
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
