import { useId } from 'react';

import {
  getStructuredManualScorePreview,
} from '@/src/features/assessments/lib/item-response-draft';
import type {
  StructuredManualField,
  StructuredManualResponse,
} from '@/src/features/assessments/types/item-response-execution';

const responseInputClassName =
  'min-h-11 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-base text-[var(--cma-text-strong)] outline-none transition-colors placeholder:text-[var(--cma-subtle)] focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)] disabled:text-[var(--cma-muted)]';

function formatReferenceAnswer(value: string | number | boolean): string {
  return String(value);
}

export function StructuredManualResponseEditor({
  completionRequired,
  disabled,
  draft,
  fields,
  onChange,
}: {
  completionRequired: boolean;
  disabled: boolean;
  draft: StructuredManualResponse | null;
  fields: readonly StructuredManualField[];
  onChange: (draft: StructuredManualResponse) => void;
}) {
  const fieldIdPrefix = useId();
  const preview = getStructuredManualScorePreview(fields, draft);

  function updateSubItem(
    code: string,
    update: Partial<StructuredManualResponse['subItems'][string]>,
  ) {
    const current = draft?.subItems[code] ?? {
      responseText: '',
      isCorrect: null,
    };

    onChange({
      subItems: {
        ...(draft?.subItems ?? {}),
        [code]: { ...current, ...update },
      },
    });
  }

  return (
    <section
      aria-labelledby={`${fieldIdPrefix}-title`}
      className="grid gap-4"
    >
      <div className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] p-4">
        <h4
          className="text-lg font-semibold text-[var(--cma-text-strong)]"
          id={`${fieldIdPrefix}-title`}
        >
          逐子项正式作答复核
        </h4>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          逐项记录患者实际回答或观察，并由医护明确确认正确或错误。系统不会自动比较或判分。
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-base font-semibold text-[var(--cma-text-strong)]">
          <span>
            当前确认得分：{preview.score} / {preview.maxScore}
          </span>
          <span>
            已确认 {preview.confirmedCount} / {preview.totalCount} 项
          </span>
        </div>
      </div>

      {fields.map((field, index) => {
        const subItem = draft?.subItems[field.code] ?? {
          responseText: '',
          isCorrect: null,
        };
        const responseId = `${fieldIdPrefix}-response-${index}`;
        const correctId = `${fieldIdPrefix}-correct-${index}`;
        const incorrectId = `${fieldIdPrefix}-incorrect-${index}`;

        return (
          <fieldset
            className="grid gap-4 rounded-md border border-[var(--cma-line)] p-4"
            disabled={disabled}
            key={field.code}
          >
            <legend className="px-1 text-lg font-semibold text-[var(--cma-text-strong)]">
              {field.label}
            </legend>

            {field.referenceAnswer !== undefined ? (
              <p className="text-sm leading-6 text-[var(--cma-muted)]">
                评分参考：
                {formatReferenceAnswer(field.referenceAnswer)}
              </p>
            ) : null}

            <div className="grid gap-2">
              <label
                className="font-semibold text-[var(--cma-text-strong)]"
                htmlFor={responseId}
              >
                患者实际回答 / 观察
              </label>
              <input
                className={responseInputClassName}
                id={responseId}
                onChange={(event) =>
                  updateSubItem(field.code, {
                    responseText: event.target.value,
                  })
                }
                type="text"
                value={subItem.responseText}
              />
            </div>

            <div className="grid gap-2">
              <p className="font-semibold text-[var(--cma-text-strong)]">
                正确性
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <label
                  className="flex min-h-11 items-center gap-2 text-base text-[var(--cma-text-strong)]"
                  htmlFor={correctId}
                >
                  <input
                    checked={subItem.isCorrect === true}
                    className="h-5 w-5 accent-[var(--cma-primary)]"
                    id={correctId}
                    name={`${fieldIdPrefix}-correctness-${index}`}
                    onChange={() =>
                      updateSubItem(field.code, { isCorrect: true })
                    }
                    type="radio"
                  />
                  正确
                </label>
                <label
                  className="flex min-h-11 items-center gap-2 text-base text-[var(--cma-text-strong)]"
                  htmlFor={incorrectId}
                >
                  <input
                    checked={subItem.isCorrect === false}
                    className="h-5 w-5 accent-[var(--cma-primary)]"
                    id={incorrectId}
                    name={`${fieldIdPrefix}-correctness-${index}`}
                    onChange={() =>
                      updateSubItem(field.code, { isCorrect: false })
                    }
                    type="radio"
                  />
                  错误
                </label>
              </div>
              <p className="text-sm leading-6 text-[var(--cma-muted)]">
                当前：
                {subItem.isCorrect === null
                  ? '尚未判断'
                  : subItem.isCorrect
                    ? '正确'
                    : '错误'}
              </p>
            </div>
          </fieldset>
        );
      })}

      {completionRequired && preview.incompleteCount > 0 ? (
        <p
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-sm leading-6 text-[var(--cma-warning)]"
          role="status"
        >
          还需完成 {preview.incompleteCount}{' '}
          个子项的实际回答和正确性确认。
        </p>
      ) : null}
    </section>
  );
}
