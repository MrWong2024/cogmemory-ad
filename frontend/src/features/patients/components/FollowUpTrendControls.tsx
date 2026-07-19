import type { FormEvent } from 'react';

import { Button } from '@/src/components/ui/Button';
import type { AvailableScaleOption } from '@/src/features/assessments/types/assessment-execution';

export type FollowUpTrendControlValues = {
  scaleCode: string;
  dateFrom: string;
  dateTo: string;
  maxPoints: string;
};

const inputClassName =
  'min-h-11 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-base text-[var(--cma-text-strong)] outline-none transition-colors focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)]';

export function FollowUpTrendControls({
  catalog,
  error,
  isCatalogLoading,
  isTrendLoading,
  onChange,
  onReset,
  onSubmit,
  values,
}: {
  catalog: AvailableScaleOption[] | null;
  error: string | null;
  isCatalogLoading: boolean;
  isTrendLoading: boolean;
  onChange: (values: FollowUpTrendControlValues) => void;
  onReset: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  values: FollowUpTrendControlValues;
}) {
  return (
    <form
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      onSubmit={onSubmit}
    >
      <div className="grid gap-2">
        <label className="font-semibold" htmlFor="trend-scale-code">
          量表
        </label>
        <select
          className={inputClassName}
          disabled={isCatalogLoading || !catalog}
          id="trend-scale-code"
          onChange={(event) =>
            onChange({ ...values, scaleCode: event.target.value })
          }
          value={values.scaleCode}
        >
          <option value="">
            {isCatalogLoading ? '正在加载量表目录' : '请选择量表'}
          </option>
          {values.scaleCode &&
          !catalog?.some((scale) => scale.code === values.scaleCode) ? (
            <option value={values.scaleCode}>
              当前目录未列出（{values.scaleCode}）
            </option>
          ) : null}
          {catalog?.map((scale) => (
            <option key={`${scale.code}:${scale.version}`} value={scale.code}>
              {scale.shortName || scale.name}（{scale.code}）
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <label className="font-semibold" htmlFor="trend-date-from">
          起始日期
        </label>
        <input
          className={inputClassName}
          id="trend-date-from"
          onChange={(event) =>
            onChange({ ...values, dateFrom: event.target.value })
          }
          type="date"
          value={values.dateFrom}
        />
      </div>
      <div className="grid gap-2">
        <label className="font-semibold" htmlFor="trend-date-to">
          截止日期
        </label>
        <input
          className={inputClassName}
          id="trend-date-to"
          onChange={(event) =>
            onChange({ ...values, dateTo: event.target.value })
          }
          type="date"
          value={values.dateTo}
        />
      </div>
      <div className="grid gap-2">
        <label className="font-semibold" htmlFor="trend-max-points">
          最大访视点数
        </label>
        <input
          className={inputClassName}
          id="trend-max-points"
          inputMode="numeric"
          max={100}
          min={2}
          onChange={(event) =>
            onChange({ ...values, maxPoints: event.target.value })
          }
          step={1}
          type="number"
          value={values.maxPoints}
        />
      </div>
      {error ? (
        <p
          className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-sm text-[var(--cma-danger)] md:col-span-2 xl:col-span-4"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3 md:col-span-2 xl:col-span-4">
        <Button disabled={isTrendLoading || isCatalogLoading} type="submit">
          {isTrendLoading ? '正在查询趋势' : '查询趋势'}
        </Button>
        <Button
          disabled={isTrendLoading}
          onClick={onReset}
          variant="secondary"
        >
          重置
        </Button>
      </div>
    </form>
  );
}
