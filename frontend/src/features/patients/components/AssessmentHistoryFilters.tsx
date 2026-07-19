import type { FormEvent } from 'react';

import { Button } from '@/src/components/ui/Button';
import {
  assessmentVisitStatuses,
  assessmentVisitStatusLabels,
  assessmentVisitTypeLabels,
  assessmentVisitTypes,
} from '@/src/features/patients/lib/patient-display';
import type {
  AssessmentVisitStatus,
  AssessmentVisitType,
} from '@/src/features/patients/types/patient';

export const assessmentHistoryPageSizes = [20, 50, 100] as const;

export type AssessmentHistoryFilterValues = {
  status: '' | AssessmentVisitStatus;
  visitType: '' | AssessmentVisitType;
  dateFrom: string;
  dateTo: string;
  scaleCode: string;
  pageSize: (typeof assessmentHistoryPageSizes)[number];
};

const inputClassName =
  'min-h-11 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-base text-[var(--cma-text-strong)] outline-none transition-colors focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)]';

export function AssessmentHistoryFilters({
  error,
  isLoading,
  onChange,
  onReset,
  onSubmit,
  values,
}: {
  error: string | null;
  isLoading: boolean;
  onChange: (values: AssessmentHistoryFilterValues) => void;
  onReset: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  values: AssessmentHistoryFilterValues;
}) {
  return (
    <form
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"
      onSubmit={onSubmit}
    >
      <div className="grid gap-2">
        <label className="font-semibold" htmlFor="history-status">
          访视状态
        </label>
        <select
          className={inputClassName}
          id="history-status"
          onChange={(event) =>
            onChange({
              ...values,
              status: event.target.value as AssessmentHistoryFilterValues['status'],
            })
          }
          value={values.status}
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
        <label className="font-semibold" htmlFor="history-visit-type">
          访视类型
        </label>
        <select
          className={inputClassName}
          id="history-visit-type"
          onChange={(event) =>
            onChange({
              ...values,
              visitType:
                event.target.value as AssessmentHistoryFilterValues['visitType'],
            })
          }
          value={values.visitType}
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
        <label className="font-semibold" htmlFor="history-date-from">
          起始日期
        </label>
        <input
          className={inputClassName}
          id="history-date-from"
          onChange={(event) =>
            onChange({ ...values, dateFrom: event.target.value })
          }
          type="date"
          value={values.dateFrom}
        />
      </div>
      <div className="grid gap-2">
        <label className="font-semibold" htmlFor="history-date-to">
          截止日期
        </label>
        <input
          className={inputClassName}
          id="history-date-to"
          onChange={(event) =>
            onChange({ ...values, dateTo: event.target.value })
          }
          type="date"
          value={values.dateTo}
        />
      </div>
      <div className="grid gap-2">
        <label className="font-semibold" htmlFor="history-scale-code">
          历史量表编码
        </label>
        <input
          autoComplete="off"
          className={inputClassName}
          id="history-scale-code"
          onChange={(event) =>
            onChange({ ...values, scaleCode: event.target.value })
          }
          placeholder="例如 moca"
          value={values.scaleCode}
        />
      </div>
      <div className="grid gap-2">
        <label className="font-semibold" htmlFor="history-page-size">
          每页条数
        </label>
        <select
          className={inputClassName}
          id="history-page-size"
          onChange={(event) =>
            onChange({
              ...values,
              pageSize: Number(
                event.target.value,
              ) as AssessmentHistoryFilterValues['pageSize'],
            })
          }
          value={values.pageSize}
        >
          {assessmentHistoryPageSizes.map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              {pageSize} 条
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p
          className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-sm text-[var(--cma-danger)] md:col-span-2 xl:col-span-6"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3 md:col-span-2 xl:col-span-6">
        <Button disabled={isLoading} type="submit">
          查询
        </Button>
        <Button disabled={isLoading} onClick={onReset} variant="secondary">
          重置
        </Button>
      </div>
    </form>
  );
}
