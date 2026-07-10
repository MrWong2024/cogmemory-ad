import { promptResponseTypeLabels } from '@/src/features/assessments/lib/assessment-execution-display';
import { hasNonPrimitiveDraftValue } from '@/src/features/assessments/lib/item-response-draft';
import type {
  ItemDraftState,
  ItemPromptDraftState,
} from '@/src/features/assessments/lib/item-response-draft';
import type { ItemResponseExecution } from '@/src/features/assessments/types/item-response-execution';

const inputClassName =
  'min-h-11 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-base text-[var(--cma-text-strong)] outline-none transition-colors placeholder:text-[var(--cma-subtle)] focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)] disabled:text-[var(--cma-muted)]';

export function ItemPromptEditor({
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
  if (item.promptResponses.length === 0) {
    return null;
  }

  function updatePrompt(
    promptType: ItemPromptDraftState['promptType'],
    order: number,
    update: (prompt: ItemPromptDraftState) => ItemPromptDraftState,
  ) {
    onChange({
      ...draft,
      promptResponses: draft.promptResponses.map((prompt) =>
        prompt.promptType === promptType && prompt.order === order
          ? update(prompt)
          : prompt,
      ),
    });
  }

  return (
    <section
      aria-labelledby={`${item.id}-prompts-title`}
      className="grid gap-4 rounded-md border border-[var(--cma-line)] p-4"
    >
      <div>
        <h4
          className="text-lg font-semibold text-[var(--cma-text-strong)]"
          id={`${item.id}-prompts-title`}
        >
          提示后表现
        </h4>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          仅填写服务端已返回的提示槽位；本页不新增提示，也不推断提示后回答是否正确。
        </p>
      </div>
      {[...item.promptResponses]
        .sort(
          (left, right) =>
            left.order - right.order ||
            left.promptType.localeCompare(right.promptType),
        )
        .map((prompt, index) => {
          const promptDraft = draft.promptResponses.find(
            (candidate) =>
              candidate.promptType === prompt.promptType &&
              candidate.order === prompt.order,
          );

          if (!promptDraft) {
            return null;
          }

          const responseId = `${item.id}-prompt-${index}-response`;
          const noteId = `${item.id}-prompt-${index}-note`;

          return (
            <div
              className="grid gap-4 rounded-md bg-[var(--cma-surface-muted)] p-4 md:grid-cols-2"
              key={`${prompt.promptType}:${prompt.order}`}
            >
              <div className="md:col-span-2">
                <p className="font-semibold text-[var(--cma-text-strong)]">
                  {promptResponseTypeLabels[prompt.promptType]} · 第{' '}
                  {prompt.order} 个槽位
                </p>
                <p className="mt-1 whitespace-pre-wrap text-base leading-7 text-[var(--cma-text-strong)]">
                  {prompt.promptText || '服务端未提供提示文字。'}
                </p>
                <p className="mt-1 text-sm text-[var(--cma-muted)]">
                  服务端计分参与标识：
                  {prompt.countsTowardScore ? '计入' : '不计入'}
                </p>
                {hasNonPrimitiveDraftValue(prompt.responseAfterPrompt) &&
                !promptDraft.responseAfterPromptTouched ? (
                  <p className="mt-2 text-sm text-[var(--cma-info)]">
                    已有非文本提示后草稿；未编辑时将由服务端原样保留。
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <label
                  className="font-semibold text-[var(--cma-text-strong)]"
                  htmlFor={responseId}
                >
                  提示后原始回答
                </label>
                <textarea
                  className={`${inputClassName} min-h-28 resize-y`}
                  disabled={answerDisabled}
                  id={responseId}
                  onChange={(event) =>
                    updatePrompt(
                      prompt.promptType,
                      prompt.order,
                      (current) => ({
                        ...current,
                        responseAfterPromptInput: event.target.value,
                        responseAfterPromptTouched: true,
                      }),
                    )
                  }
                  value={promptDraft.responseAfterPromptInput}
                />
              </div>
              <div className="grid gap-2">
                <label
                  className="font-semibold text-[var(--cma-text-strong)]"
                  htmlFor={noteId}
                >
                  提示槽位备注
                </label>
                <textarea
                  className={`${inputClassName} min-h-28 resize-y`}
                  disabled={disabled}
                  id={noteId}
                  maxLength={2000}
                  onChange={(event) =>
                    updatePrompt(
                      prompt.promptType,
                      prompt.order,
                      (current) => ({
                        ...current,
                        note: event.target.value,
                      }),
                    )
                  }
                  value={promptDraft.note}
                />
              </div>
            </div>
          );
        })}
    </section>
  );
}
