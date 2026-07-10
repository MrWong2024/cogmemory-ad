'use client';

import { useState } from 'react';

import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import type { AssessmentExecutionApiError } from '@/src/features/assessments/api/assessment-execution-api';
import {
  getScaleCapabilitySummaries,
  scaleAdministrationModeLabels,
  scaleAdministrationModes,
} from '@/src/features/assessments/lib/assessment-execution-display';
import type {
  AvailableScaleOption,
  ScaleAdministrationMode,
} from '@/src/features/assessments/types/assessment-execution';

export type InitializationFeedback = {
  kind: 'success' | 'error' | 'info';
  message: string;
};

const selectClassName =
  'min-h-11 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-base text-[var(--cma-text-strong)] outline-none transition-colors focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)] disabled:text-[var(--cma-muted)]';

function getCatalogErrorMessage(error: AssessmentExecutionApiError): string {
  if (error.kind === 'forbidden') {
    return '当前账号没有查看可用量表目录的权限。';
  }

  if (error.kind === 'scale_catalog_invalid') {
    return '量表目录暂时不可用，请联系系统管理员或稍后重试。';
  }

  if (error.kind === 'service_unavailable') {
    return '评估服务暂时不可用，请稍后重试。';
  }

  return '暂时无法加载可用量表目录，请稍后重试。';
}

export function ScaleInitializationPanel({
  catalogError,
  existingScaleCodes,
  feedback,
  initializingScaleCode,
  isCatalogLoading,
  onInitialize,
  onRetryCatalog,
  scales,
  visitCanInitialize,
}: {
  catalogError: AssessmentExecutionApiError | null;
  existingScaleCodes: ReadonlySet<string>;
  feedback: InitializationFeedback | null;
  initializingScaleCode: string | null;
  isCatalogLoading: boolean;
  onInitialize: (
    scale: AvailableScaleOption,
    administrationMode: ScaleAdministrationMode,
  ) => Promise<void>;
  onRetryCatalog: () => void;
  scales: AvailableScaleOption[] | null;
  visitCanInitialize: boolean;
}) {
  const [administrationModes, setAdministrationModes] = useState<
    Record<string, ScaleAdministrationMode>
  >({});

  if (isCatalogLoading && !scales) {
    return (
      <Card aria-live="polite" role="status">
        <CardHeader>
          <CardTitle>正在加载量表目录</CardTitle>
          <CardDescription>
            正在读取当前可用的 MMSE / MoCA 安全摘要。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (catalogError || !scales) {
    return (
      <Card role="alert">
        <CardHeader>
          <Badge tone="warning">
            {catalogError?.kind === 'forbidden' ? '无权限' : '目录加载失败'}
          </Badge>
          <CardTitle>暂时无法显示可用量表</CardTitle>
          <CardDescription>
            {catalogError
              ? getCatalogErrorMessage(catalogError)
              : '暂时无法加载可用量表目录，请稍后重试。'}
          </CardDescription>
        </CardHeader>
        {catalogError?.kind !== 'forbidden' ? (
          <CardContent>
            <Button onClick={onRetryCatalog}>重新加载目录</Button>
          </CardContent>
        ) : null}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="border-b border-[var(--cma-line)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>量表初始化</CardTitle>
            <CardDescription>
              从真实可用目录选择施测方式，并为当前访视初始化量表实例。
            </CardDescription>
          </div>
          {isCatalogLoading ? <Badge tone="info">目录更新中</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 pt-5">
        <div className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] px-4 py-3 text-sm leading-6 text-[var(--cma-info)]">
          图片、手写、计时等标识只表示量表配置包含此类项目。当前可进入量表记录文字说明与计时草稿，但媒体上传、手写轨迹和实时计时器仍未实现。
        </div>

        {!visitCanInitialize ? (
          <p
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-warning)]"
            role="status"
          >
            当前访视状态不允许新增量表实例。只有草稿或进行中的访视可以初始化。
          </p>
        ) : null}

        {feedback ? (
          <p
            aria-live={feedback.kind === 'success' ? 'polite' : undefined}
            className={
              feedback.kind === 'success'
                ? 'rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-success-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-success)]'
                : feedback.kind === 'info'
                  ? 'rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-info)]'
                  : 'rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-danger)]'
            }
            role={feedback.kind === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </p>
        ) : null}

        {scales.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xl font-semibold text-[var(--cma-text-strong)]">
              当前没有可用量表
            </p>
            <p className="mt-2 text-base text-[var(--cma-muted)]">
              请稍后重新加载目录。
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {scales.map((scale) => {
              const normalizedCode = scale.code.toLowerCase();
              const isInitialized = existingScaleCodes.has(normalizedCode);
              const isThisScaleInitializing =
                initializingScaleCode === normalizedCode;
              const isAnyScaleInitializing = initializingScaleCode !== null;
              const administrationMode =
                administrationModes[normalizedCode] ??
                'clinician_administered';
              const capabilitySummaries = getScaleCapabilitySummaries(
                scale.capabilities,
              );
              const controlsDisabled =
                isInitialized ||
                !visitCanInitialize ||
                isAnyScaleInitializing;

              return (
                <article
                  className="grid gap-5 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-5"
                  key={`${scale.code}:${scale.version}`}
                >
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
                          {scale.name}
                        </h3>
                        <p className="mt-1 text-base font-semibold text-[var(--cma-primary)]">
                          {scale.shortName || scale.code.toUpperCase()}
                        </p>
                      </div>
                      <Badge tone={isInitialized ? 'success' : 'neutral'}>
                        {isInitialized ? '已初始化' : '未初始化'}
                      </Badge>
                    </div>
                    {scale.description ? (
                      <p className="mt-3 text-base leading-7 text-[var(--cma-muted)]">
                        {scale.description}
                      </p>
                    ) : null}
                  </div>

                  <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                        版本
                      </dt>
                      <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                        {scale.displayVersion
                          ? `${scale.displayVersion}（${scale.version}）`
                          : scale.version}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                        CRF 版本
                      </dt>
                      <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                        {scale.crfVersion || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                        总分范围
                      </dt>
                      <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                        {scale.totalScoreRange.min}–{scale.totalScoreRange.max}
                        {scale.totalScoreRange.step !== undefined
                          ? `，步长 ${scale.totalScoreRange.step}`
                          : ''}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                        目录分类
                      </dt>
                      <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                        {scale.category}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                        题目数
                      </dt>
                      <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                        {scale.itemCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                        分组数
                      </dt>
                      <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                        {scale.groupCount}
                      </dd>
                    </div>
                  </dl>

                  <div>
                    <h4 className="text-sm font-semibold text-[var(--cma-muted)]">
                      配置能力摘要
                    </h4>
                    {capabilitySummaries.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {capabilitySummaries.map((summary) => (
                          <li key={summary}>
                            <Badge>{summary}</Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-base text-[var(--cma-muted)]">
                        未标记特殊采集要求。
                      </p>
                    )}
                  </div>

                  <div className="grid gap-3 border-t border-[var(--cma-line)] pt-4">
                    <label
                      className="font-semibold text-[var(--cma-text-strong)]"
                      htmlFor={`scale-administration-${normalizedCode}`}
                    >
                      施测方式
                    </label>
                    <select
                      className={selectClassName}
                      disabled={controlsDisabled}
                      id={`scale-administration-${normalizedCode}`}
                      onChange={(event) =>
                        setAdministrationModes((current) => ({
                          ...current,
                          [normalizedCode]: event.target
                            .value as ScaleAdministrationMode,
                        }))
                      }
                      value={administrationMode}
                    >
                      {scaleAdministrationModes.map((mode) => (
                        <option key={mode} value={mode}>
                          {scaleAdministrationModeLabels[mode]}
                        </option>
                      ))}
                    </select>
                    <Button
                      disabled={controlsDisabled}
                      onClick={() =>
                        void onInitialize(scale, administrationMode)
                      }
                    >
                      {isInitialized
                        ? '已初始化'
                        : isThisScaleInitializing
                          ? '正在初始化...'
                          : !visitCanInitialize
                            ? '当前状态不可初始化'
                            : isAnyScaleInitializing
                              ? '等待当前初始化完成'
                              : '初始化量表实例'}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
