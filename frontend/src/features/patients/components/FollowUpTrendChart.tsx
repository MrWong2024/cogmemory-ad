'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  formatHistoryPercent,
  trendComparisonStatusLabels,
  trendDataStatusLabels,
} from '@/src/features/patients/lib/clinical-history-display';
import type {
  PatientFollowUpTrendPoint,
  PatientFollowUpTrendResponse,
} from '@/src/features/patients/types/clinical-history';

type TrendMetric = 'total' | `domain:${string}`;

const inputClassName =
  'min-h-11 rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-base text-[var(--cma-text-strong)] outline-none focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)]';

function domainCodeFromMetric(metric: TrendMetric): string | null {
  return metric === 'total' ? null : metric.slice('domain:'.length);
}

function metricValue(
  point: PatientFollowUpTrendPoint,
  metric: TrendMetric,
): number | null {
  const domainCode = domainCodeFromMetric(metric);
  if (domainCode === null) return point.score?.scorePercent ?? null;
  return (
    point.domains.find((domain) => domain.domainCode === domainCode)
      ?.scorePercent ?? null
  );
}

function canConnectToPrevious(
  points: PatientFollowUpTrendPoint[],
  index: number,
  metric: TrendMetric,
): boolean {
  if (index < 1) return false;
  if (
    metricValue(points[index - 1], metric) === null ||
    metricValue(points[index], metric) === null
  ) {
    return false;
  }

  if (metric === 'total') {
    return points[index].comparisonToPrevious.status === 'comparable';
  }

  const domainCode = domainCodeFromMetric(metric);
  return points[index].comparisonToPrevious.domainDeltas.items.some(
    (item) => item.domainCode === domainCode && item.status === 'comparable',
  );
}

function dateLabel(value: string): string {
  const datePart = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : '日期不可用';
}

export function FollowUpTrendChart({
  response,
}: {
  response: PatientFollowUpTrendResponse;
}) {
  const domainOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ code: string; title: string }> = [];

    response.points.forEach((point) => {
      point.domains.forEach((domain) => {
        if (!seen.has(domain.domainCode)) {
          seen.add(domain.domainCode);
          options.push({
            code: domain.domainCode,
            title: domain.domainTitle || domain.domainCode,
          });
        }
      });
    });

    return options;
  }, [response.points]);
  const [metric, setMetric] = useState<TrendMetric>('total');

  useEffect(() => {
    const domainCode = domainCodeFromMetric(metric);
    if (
      domainCode !== null &&
      !domainOptions.some((option) => option.code === domainCode)
    ) {
      setMetric('total');
    }
  }, [domainOptions, metric]);

  const points = response.points;
  const width = Math.max(680, 100 + points.length * 104);
  const height = 390;
  const left = 58;
  const right = 28;
  const top = 28;
  const plotHeight = 230;
  const statusY = top + plotHeight + 28;
  const plotWidth = width - left - right;
  const xFor = (index: number) =>
    points.length <= 1
      ? left + plotWidth / 2
      : left + (index / (points.length - 1)) * plotWidth;
  const yFor = (value: number) =>
    top + ((100 - Math.max(0, Math.min(100, value))) / 100) * plotHeight;
  const selectedDomainCode = domainCodeFromMetric(metric);
  const selectedDomainTitle =
    domainOptions.find((option) => option.code === selectedDomainCode)?.title ??
    selectedDomainCode;
  const title =
    metric === 'total'
      ? '总分得分比例（不是疾病概率）'
      : `${selectedDomainTitle}得分比例（不是疾病概率）`;

  return (
    <section
      aria-labelledby="follow-up-trend-chart-heading"
      className="grid gap-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3
            className="text-xl font-semibold text-[var(--cma-text-strong)]"
            id="follow-up-trend-chart-heading"
          >
            随访趋势图
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            图表是辅助视图；下方明细表保留全部后端事实。
          </p>
        </div>
        <label className="grid gap-2 font-semibold" htmlFor="trend-metric">
          图表指标
          <select
            className={inputClassName}
            id="trend-metric"
            onChange={(event) => setMetric(event.target.value as TrendMetric)}
            value={metric}
          >
            <option value="total">总分得分比例</option>
            {domainOptions.map((domain) => (
              <option key={domain.code} value={`domain:${domain.code}`}>
                {domain.title}（{domain.code}）
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-md border border-[var(--cma-line)] bg-white p-3">
        <svg
          aria-labelledby="follow-up-trend-svg-title follow-up-trend-svg-desc"
          className="block h-auto max-w-none"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
        >
          <title id="follow-up-trend-svg-title">{title}</title>
          <desc id="follow-up-trend-svg-desc">
            每个访视保留一个横轴位置。只有后端判定当前点可与紧邻前一点比较时才绘制连线；缺失和不可比较点不会被跨越。
          </desc>

          {[0, 25, 50, 75, 100].map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line
                  stroke="var(--cma-line)"
                  strokeWidth="1"
                  x1={left}
                  x2={width - right}
                  y1={y}
                  y2={y}
                />
                <text
                  fill="var(--cma-muted)"
                  fontSize="12"
                  textAnchor="end"
                  x={left - 10}
                  y={y + 4}
                >
                  {tick}%
                </text>
              </g>
            );
          })}

          {points.map((point, index) => {
            if (!canConnectToPrevious(points, index, metric)) return null;
            const previousValue = metricValue(points[index - 1], metric);
            const currentValue = metricValue(point, metric);
            if (previousValue === null || currentValue === null) return null;

            return (
              <line
                key={`segment:${point.visit.id}`}
                stroke="var(--cma-primary)"
                strokeLinecap="round"
                strokeWidth="3"
                x1={xFor(index - 1)}
                x2={xFor(index)}
                y1={yFor(previousValue)}
                y2={yFor(currentValue)}
              />
            );
          })}

          {points.map((point, index) => {
            const value = metricValue(point, metric);
            const x = xFor(index);
            const comparisonLabel =
              metric === 'total'
                ? trendComparisonStatusLabels[
                    point.comparisonToPrevious.status
                  ]
                : point.comparisonToPrevious.domainDeltas.items.find(
                    (item) => item.domainCode === selectedDomainCode,
                  )?.status === 'comparable'
                  ? '该认知域可与紧邻前次比较'
                  : '该认知域未形成可连接的相邻比较';
            const ariaLabel = `${dateLabel(point.visit.assessmentDate)}，${point.visit.visitCode}，${
              value === null
                ? trendDataStatusLabels[point.dataStatus]
                : formatHistoryPercent(value)
            }，${comparisonLabel}`;

            return (
              <g key={point.visit.id}>
                <line
                  stroke="var(--cma-line-strong)"
                  strokeWidth="1"
                  x1={x}
                  x2={x}
                  y1={top}
                  y2={statusY}
                />
                {value === null ? (
                  <rect
                    aria-label={ariaLabel}
                    fill="var(--cma-warning-soft)"
                    height="14"
                    role="img"
                    stroke="var(--cma-warning)"
                    tabIndex={0}
                    width="14"
                    x={x - 7}
                    y={statusY - 7}
                  />
                ) : (
                  <circle
                    aria-label={ariaLabel}
                    cx={x}
                    cy={yFor(value)}
                    fill="white"
                    r="6"
                    role="img"
                    stroke="var(--cma-primary)"
                    strokeWidth="3"
                    tabIndex={0}
                  />
                )}
                <text
                  fill="var(--cma-text-strong)"
                  fontSize="12"
                  textAnchor="middle"
                  x={x}
                  y={statusY + 26}
                >
                  {point.visit.visitCode}
                </text>
                <text
                  fill="var(--cma-muted)"
                  fontSize="11"
                  textAnchor="middle"
                  x={x}
                  y={statusY + 44}
                >
                  {dateLabel(point.visit.assessmentDate)}
                </text>
              </g>
            );
          })}

          <text
            fill="var(--cma-text-strong)"
            fontSize="13"
            fontWeight="600"
            x={left}
            y={height - 12}
          >
            得分比例（不是疾病概率） · 方形标记表示该指标在此访视无可绘制数值
          </text>
        </svg>
      </div>

      <ul className="grid gap-1 text-sm leading-6 text-[var(--cma-muted)] sm:grid-cols-2">
        <li>圆点表示后端返回的可用得分比例，方形表示缺失状态。</li>
        <li>连线只连接后端判定可比较的相邻访视。</li>
        <li>不可比较点仍保留独立标记，不跨点补线。</li>
        <li>颜色只辅助区分，形状、文字和明细表提供完整状态。</li>
      </ul>
    </section>
  );
}
