import { type ReactNode, useId } from 'react';

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
  patientReferenceByFieldCode,
  sharedPatientReference,
}: {
  completionRequired: boolean;
  disabled: boolean;
  draft: StructuredManualResponse | null;
  fields: readonly StructuredManualField[];
  onChange: (draft: StructuredManualResponse) => void;
  patientReferenceByFieldCode?: Readonly<Record<string, ReactNode>>;
  sharedPatientReference?: ReactNode;
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
          逐项记录患者实际回答或观察，并由医护完成评分判断。系统不会自动完成评分判断，仅根据医护确认结果计算得分。
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-base font-semibold text-[var(--cma-text-strong)]">
          <span>
            当前评分判断得分（草稿）：{preview.score} / {preview.maxScore}
          </span>
          <span>
            已判断 {preview.confirmedCount} / {preview.totalCount} 项
          </span>
        </div>
      </div>

      {sharedPatientReference ? (
        <section
          aria-label="共享患者施测参考"
          className="grid gap-2 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4"
        >
          <h5 className="font-semibold text-[var(--cma-text-strong)]">
            共享患者施测参考
          </h5>
          {sharedPatientReference}
        </section>
      ) : null}

      {fields.map((field, index) => {
        const subItem = draft?.subItems[field.code] ?? {
          responseText: '',
          isCorrect: null,
        };
        const responseId = `${fieldIdPrefix}-response-${index}`;
        const undecidedId = `${fieldIdPrefix}-undecided-${index}`;
        const correctId = `${fieldIdPrefix}-correct-${index}`;
        const incorrectId = `${fieldIdPrefix}-incorrect-${index}`;

        return (
          <fieldset
            className="grid gap-4 rounded-md border border-[var(--cma-line)] p-4"
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

            {patientReferenceByFieldCode?.[field.code] ? (
              <div className="grid gap-2">
                <p className="font-semibold text-[var(--cma-text-strong)]">
                  患者施测参考
                </p>
                {patientReferenceByFieldCode[field.code]}
              </div>
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
                disabled={disabled}
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
                评分判断
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <label
                  className="flex min-h-11 items-center gap-2 text-base text-[var(--cma-text-strong)]"
                  htmlFor={undecidedId}
                >
                  <input
                    checked={subItem.isCorrect === null}
                    className="h-5 w-5 accent-[var(--cma-primary)]"
                    disabled={disabled}
                    id={undecidedId}
                    name={`${fieldIdPrefix}-correctness-${index}`}
                    onChange={() =>
                      updateSubItem(field.code, { isCorrect: null })
                    }
                    type="radio"
                  />
                  未判断
                </label>
                <label
                  className="flex min-h-11 items-center gap-2 text-base text-[var(--cma-text-strong)]"
                  htmlFor={correctId}
                >
                  <input
                    checked={subItem.isCorrect === true}
                    className="h-5 w-5 accent-[var(--cma-primary)]"
                    disabled={disabled}
                    id={correctId}
                    name={`${fieldIdPrefix}-correctness-${index}`}
                    onChange={() =>
                      updateSubItem(field.code, { isCorrect: true })
                    }
                    type="radio"
                  />
                  符合评分标准（{field.maxScore} 分）
                </label>
                <label
                  className="flex min-h-11 items-center gap-2 text-base text-[var(--cma-text-strong)]"
                  htmlFor={incorrectId}
                >
                  <input
                    checked={subItem.isCorrect === false}
                    className="h-5 w-5 accent-[var(--cma-primary)]"
                    disabled={disabled}
                    id={incorrectId}
                    name={`${fieldIdPrefix}-correctness-${index}`}
                    onChange={() =>
                      updateSubItem(field.code, { isCorrect: false })
                    }
                    type="radio"
                  />
                  不符合评分标准（0 分）
                </label>
              </div>
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
          个子项的实际回答和评分判断。
        </p>
      ) : null}
    </section>
  );
}
