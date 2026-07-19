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
  getHistoricalClinicalReport,
} from '@/src/features/assessments/api/clinical-report-api';
import { ClinicalReportReadOnlyContent } from '@/src/features/assessments/components/ClinicalReportReadOnlyContent';
import {
  clinicalReportQualityStatusLabels,
  clinicalReportSourceLabels,
  clinicalReportStatusLabels,
  formatClinicalReportDate,
} from '@/src/features/assessments/lib/clinical-report-display';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';

const mongoIdPattern = /^[a-f\d]{24}$/i;
const secondaryLinkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-4 py-2 text-base font-semibold text-[var(--cma-text-strong)] transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

function errorState(error: ClinicalReportApiError): {
  badge: string;
  title: string;
  description: string;
  canRetry: boolean;
} {
  if (error.kind === 'validation') {
    return {
      badge: '链接无效',
      title: '历史报告链接无效',
      description: '患者、访视或报告标识不符合要求，未发送详情请求。',
      canRetry: false,
    };
  }
  if (error.kind === 'forbidden') {
    return {
      badge: '无权限',
      title: '当前账号没有读取历史报告的权限',
      description: '只读权限最终以后端 Guard 校验结果为准。',
      canRetry: false,
    };
  }
  if (error.kind === 'patient_not_found') {
    return {
      badge: '患者不存在',
      title: '未找到该患者档案',
      description: '请返回患者列表重新选择。',
      canRetry: false,
    };
  }
  if (error.kind === 'visit_not_found') {
    return {
      badge: '访视不存在',
      title: '未找到该评估访视',
      description: '该访视可能不存在，或不属于当前患者。',
      canRetry: false,
    };
  }
  if (error.kind === 'clinical_report_not_found') {
    return {
      badge: '报告不存在',
      title: '未找到该临床报告',
      description: '该报告可能不存在，或不属于当前患者和访视。',
      canRetry: false,
    };
  }
  if (error.kind === 'clinical_report_incomplete') {
    return {
      badge: '报告不完整',
      title: '历史报告信息不完整',
      description: '页面不会猜测缺失字段或展示部分报告内容。',
      canRetry: true,
    };
  }
  if (error.kind === 'service_unavailable') {
    return {
      badge: '服务不可用',
      title: '历史报告服务暂时不可用',
      description: '请稍后手工重新加载。',
      canRetry: true,
    };
  }
  return {
    badge: '加载失败',
    title: '暂时无法加载历史报告',
    description: '请稍后手工重新加载。',
    canRetry: true,
  };
}

export function HistoricalClinicalReportDetailPage({
  patientId,
  reportId,
  visitId,
}: {
  patientId: string;
  reportId: string;
  visitId: string;
}) {
  const router = useRouter();
  const idsAreValid =
    mongoIdPattern.test(patientId) &&
    mongoIdPattern.test(visitId) &&
    mongoIdPattern.test(reportId);
  const [report, setReport] = useState<ClinicalReport | null>(null);
  const [error, setError] = useState<ClinicalReportApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!idsAreValid) {
      setReport(null);
      setError(new ClinicalReportApiError('validation', 400));
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    void getHistoricalClinicalReport(patientId, visitId, reportId, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!controller.signal.aborted) setReport(response.report);
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
        setReport(null);
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
  }, [idsAreValid, patientId, reportId, retryKey, router, visitId]);

  const navigation = (
    <div className="flex flex-wrap gap-3">
      <Link
        className={secondaryLinkClassName}
        href={`/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}`}
      >
        返回访视
      </Link>
      <Link
        className={secondaryLinkClassName}
        href={`/patients/${encodeURIComponent(patientId)}/history`}
      >
        返回评估历史
      </Link>
      <Link
        className={secondaryLinkClassName}
        href={`/patients/${encodeURIComponent(patientId)}`}
      >
        返回患者详情
      </Link>
      <Link className={secondaryLinkClassName} href="/dashboard">
        返回工作台
      </Link>
    </div>
  );

  if (isLoading && !report) {
    return (
      <div className="grid gap-5">
        {navigation}
        <Card aria-live="polite" role="status">
          <CardHeader>
            <CardTitle>正在加载历史报告</CardTitle>
            <CardDescription>正在读取指定报告的安全公开详情。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (error || !report) {
    const state = errorState(error ?? new ClinicalReportApiError('unknown'));
    return (
      <div className="grid gap-5">
        {navigation}
        <Card role="alert">
          <CardHeader>
            <Badge tone="warning">{state.badge}</Badge>
            <CardTitle>{state.title}</CardTitle>
            <CardDescription>{state.description}</CardDescription>
          </CardHeader>
          {state.canRetry ? (
            <CardContent>
              <Button onClick={() => setRetryKey((value) => value + 1)}>
                重新加载历史报告
              </Button>
            </CardContent>
          ) : null}
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-[var(--cma-line)] pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">历史报告只读视图</Badge>
            <Badge>{clinicalReportStatusLabels[report.status]}</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-[var(--cma-text-strong)] sm:text-4xl">
            {report.reportCode} / V{report.reportVersion}
          </h1>
          <p className="mt-2 text-lg text-[var(--cma-muted)]">
            本页不提供编辑、提交、确认、锁定、冻结、归档或更正入口。
          </p>
        </div>
        {navigation}
      </header>

      <Card>
        <CardHeader className="border-b border-[var(--cma-line)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>报告公开状态</CardTitle>
              <CardDescription>
                状态和最终性直接采用指定历史报告响应。
              </CardDescription>
            </div>
            {isLoading ? <Badge tone="info">更新中</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="font-semibold text-[var(--cma-muted)]">
                报告编号
              </dt>
              <dd className="mt-1">{report.reportCode}</dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--cma-muted)]">版本</dt>
              <dd className="mt-1">V{report.reportVersion}</dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--cma-muted)]">状态</dt>
              <dd className="mt-1">
                {clinicalReportStatusLabels[report.status]}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--cma-muted)]">来源</dt>
              <dd className="mt-1">
                {clinicalReportSourceLabels[report.source]}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--cma-muted)]">质量</dt>
              <dd className="mt-1">
                {clinicalReportQualityStatusLabels[report.qualityStatus]}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--cma-muted)]">
                最终报告标记
              </dt>
              <dd className="mt-1">{report.isFinal ? '是' : '否'}</dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--cma-muted)]">
                创建时间
              </dt>
              <dd className="mt-1">
                {formatClinicalReportDate(report.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--cma-muted)]">
                更新时间
              </dt>
              <dd className="mt-1">
                {formatClinicalReportDate(report.updatedAt)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>报告只读内容</CardTitle>
          <CardDescription>
            与当前报告共用安全快照和正文展示基础；不挂载报告工作流 Hook。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <ClinicalReportReadOnlyContent report={report} />
        </CardContent>
      </Card>
    </div>
  );
}
