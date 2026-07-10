import {
  itemTimerSourceLabels,
  itemTimerSources,
} from '@/src/features/assessments/lib/assessment-execution-display';
import type { ItemDraftState } from '@/src/features/assessments/lib/item-response-draft';
import type { ItemResponseExecution } from '@/src/features/assessments/types/item-response-execution';

const inputClassName =
  'min-h-11 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-base text-[var(--cma-text-strong)] outline-none transition-colors placeholder:text-[var(--cma-subtle)] focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)] disabled:text-[var(--cma-muted)]';

export function ItemTimingEditor({
  disabled,
  draft,
  item,
  onChange,
}: {
  disabled: boolean;
  draft: ItemDraftState;
  item: ItemResponseExecution;
  onChange: (draft: ItemDraftState) => void;
}) {
  function updateTiming(update: Partial<ItemDraftState['timing']>) {
    onChange({
      ...draft,
      timing: {
        ...draft.timing,
        ...update,
      },
    });
  }

  return (
    <section
      aria-labelledby={`${item.id}-timing-title`}
      className="grid gap-4 rounded-md border border-[var(--cma-line)] p-4"
    >
      <div>
        <h4
          className="text-lg font-semibold text-[var(--cma-text-strong)]"
          id={`${item.id}-timing-title`}
        >
          计时草稿
        </h4>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          这里仅编辑计时草稿，不是正在运行的计时器；页面不提供开始、暂停、继续或结束操作。
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="grid gap-2">
          <label
            className="font-semibold text-[var(--cma-text-strong)]"
            htmlFor={`${item.id}-timing-started-at`}
          >
            开始时间
          </label>
          <input
            className={inputClassName}
            disabled={disabled}
            id={`${item.id}-timing-started-at`}
            onChange={(event) => updateTiming({ startedAt: event.target.value })}
            step="1"
            type="datetime-local"
            value={draft.timing.startedAt}
          />
        </div>
        <div className="grid gap-2">
          <label
            className="font-semibold text-[var(--cma-text-strong)]"
            htmlFor={`${item.id}-timing-completed-at`}
          >
            完成时间
          </label>
          <input
            className={inputClassName}
            disabled={disabled}
            id={`${item.id}-timing-completed-at`}
            onChange={(event) =>
              updateTiming({ completedAt: event.target.value })
            }
            step="1"
            type="datetime-local"
            value={draft.timing.completedAt}
          />
        </div>
        <div className="grid gap-2">
          <label
            className="font-semibold text-[var(--cma-text-strong)]"
            htmlFor={`${item.id}-timing-duration`}
          >
            用时（秒）
          </label>
          <input
            className={inputClassName}
            disabled={disabled}
            id={`${item.id}-timing-duration`}
            inputMode="decimal"
            min="0"
            onChange={(event) =>
              updateTiming({ durationSeconds: event.target.value })
            }
            step="0.001"
            type="number"
            value={draft.timing.durationSeconds}
          />
          <p className="text-sm leading-6 text-[var(--cma-muted)]">
            保存前转换为非负整数毫秒。
          </p>
        </div>
        <div className="grid gap-2">
          <label
            className="font-semibold text-[var(--cma-text-strong)]"
            htmlFor={`${item.id}-timing-source`}
          >
            计时来源
          </label>
          <select
            className={inputClassName}
            disabled={disabled}
            id={`${item.id}-timing-source`}
            onChange={(event) =>
              updateTiming({
                timerSource: event.target
                  .value as ItemDraftState['timing']['timerSource'],
              })
            }
            value={draft.timing.timerSource}
          >
            {itemTimerSources.map((source) => (
              <option key={source} value={source}>
                {itemTimerSourceLabels[source]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
