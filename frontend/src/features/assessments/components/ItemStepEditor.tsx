import { hasNonPrimitiveDraftValue } from '@/src/features/assessments/lib/item-response-draft';
import type {
  ItemDraftState,
  ItemStepDraftState,
} from '@/src/features/assessments/lib/item-response-draft';
import type { ItemResponseExecution } from '@/src/features/assessments/types/item-response-execution';

const inputClassName =
  'min-h-11 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-base text-[var(--cma-text-strong)] outline-none transition-colors placeholder:text-[var(--cma-subtle)] focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)] disabled:text-[var(--cma-muted)]';

export function ItemStepEditor({
  answerDisabled,
  disabled,
  draft,
  item,
  onChange,
}: {
  answerDisabled: boolean;
  disabled: boolean;
  draft: ItemDraftState;
  item: ItemResponseExecution;
  onChange: (draft: ItemDraftState) => void;
}) {
  if (item.stepResponses.length === 0) {
    return null;
  }

  const useNumber =
    item.responseType === 'number' ||
    item.responseType === 'multi_step_calculation';

  function updateStep(
    stepCode: string,
    update: (step: ItemStepDraftState) => ItemStepDraftState,
  ) {
    onChange({
      ...draft,
      stepResponses: draft.stepResponses.map((step) =>
        step.stepCode === stepCode ? update(step) : step,
      ),
    });
  }

  return (
    <section
      aria-labelledby={`${item.id}-steps-title`}
      className="grid gap-4 rounded-md border border-[var(--cma-line)] p-4"
    >
      <div>
        <h4
          className="text-lg font-semibold text-[var(--cma-text-strong)]"
          id={`${item.id}-steps-title`}
        >
          分步回答
        </h4>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          仅记录每一步的实际回答和备注；本页不显示预期值，也不判断步骤是否正确。
        </p>
      </div>
      {[...item.stepResponses]
        .sort(
          (left, right) =>
            left.order - right.order ||
            left.stepCode.localeCompare(right.stepCode),
        )
        .map((step, index) => {
          const stepDraft = draft.stepResponses.find(
            (candidate) => candidate.stepCode === step.stepCode,
          );

          if (!stepDraft) {
            return null;
          }

          const valueId = `${item.id}-step-${index}-value`;
          const noteId = `${item.id}-step-${index}-note`;

          return (
            <div
              className="grid gap-4 rounded-md bg-[var(--cma-surface-muted)] p-4 md:grid-cols-2"
              key={step.stepCode}
            >
              <div className="md:col-span-2">
                <p className="font-semibold text-[var(--cma-text-strong)]">
                  {step.label || `步骤 ${step.order}`}
                </p>
                <p className="mt-1 text-sm text-[var(--cma-muted)]">
                  步骤编码：{step.stepCode}
                  {step.crfCode ? ` · CRF：${step.crfCode}` : ''} ·
                  服务端参与标识：
                  {step.countsTowardItemScore ? '计入本题' : '不计入本题'}
                </p>
                {hasNonPrimitiveDraftValue(step.actualValue) &&
                !stepDraft.actualValueTouched ? (
                  <p className="mt-2 text-sm text-[var(--cma-info)]">
                    已有非文本槽位草稿；未编辑时将由服务端原样保留。
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <label
                  className="font-semibold text-[var(--cma-text-strong)]"
                  htmlFor={valueId}
                >
                  实际回答
                </label>
                <input
                  className={inputClassName}
                  disabled={answerDisabled}
                  id={valueId}
                  inputMode={useNumber ? 'decimal' : undefined}
                  onChange={(event) =>
                    updateStep(step.stepCode, (current) => ({
                      ...current,
                      actualValueInput: event.target.value,
                      actualValueTouched: true,
                    }))
                  }
                  step={useNumber ? 'any' : undefined}
                  type={useNumber ? 'number' : 'text'}
                  value={stepDraft.actualValueInput}
                />
              </div>
              <div className="grid gap-2">
                <label
                  className="font-semibold text-[var(--cma-text-strong)]"
                  htmlFor={noteId}
                >
                  步骤备注
                </label>
                <input
                  className={inputClassName}
                  disabled={disabled}
                  id={noteId}
                  maxLength={2000}
                  onChange={(event) =>
                    updateStep(step.stepCode, (current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  type="text"
                  value={stepDraft.note}
                />
              </div>
            </div>
          );
        })}
    </section>
  );
}
