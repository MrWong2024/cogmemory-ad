'use client';

import { useId, useState } from 'react';

import { Button } from '@/src/components/ui/Button';
import {
  formatDuration,
  itemTimerSourceLabels,
} from '@/src/features/assessments/lib/assessment-execution-display';
import type { ItemDraftState } from '@/src/features/assessments/lib/item-response-draft';
import {
  completeSystemItemTimer,
  getItemTimerElapsedMs,
  pauseSystemItemTimer,
  resetItemTimer,
  resumeSystemItemTimer,
  startSystemItemTimer,
} from '@/src/features/assessments/lib/item-response-timer';
import type { ItemTimingDraft } from '@/src/features/assessments/types/item-response-execution';
import { formatDateTime } from '@/src/features/patients/lib/patient-display';

const inputClassName =
  'min-h-11 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-base text-[var(--cma-text-strong)] outline-none transition-colors placeholder:text-[var(--cma-subtle)] focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)] disabled:text-[var(--cma-muted)]';

function toDateTimeLocalInput(value: string | null): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`;
}

function fromDateTimeLocalInput(value: string): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function createExternalTiming(
  current: ItemTimingDraft | null,
  source: 'manual' | 'imported',
): ItemTimingDraft {
  return {
    timerState: 'completed',
    startedAt: current?.startedAt ?? null,
    lastResumedAt: null,
    completedAt: current?.completedAt ?? null,
    durationMs: current?.durationMs ?? 0,
    timerSource: source,
  };
}

export function ItemTimingEditor({
  disabled,
  displayNow,
  draft,
  onChange,
}: {
  disabled: boolean;
  displayNow: number;
  draft: ItemDraftState;
  onChange: (draft: ItemDraftState, immediate?: boolean) => void;
}) {
  const fieldIdPrefix = useId();
  const [resetVisible, setResetVisible] = useState(false);
  const [resetConfirmed, setResetConfirmed] = useState(false);
  const timing = draft.timing;
  const systemActive =
    timing?.timerState === 'running' || timing?.timerState === 'paused';
  const externalMode =
    timing?.timerSource === 'manual' || timing?.timerSource === 'imported';

  function applyTiming(nextTiming: ItemTimingDraft | null, immediate = false) {
    onChange({ ...draft, timing: nextTiming }, immediate);
  }

  function applySystemResult(
    result:
      | ReturnType<typeof startSystemItemTimer>
      | ReturnType<typeof pauseSystemItemTimer>,
  ) {
    if (result.ok) {
      applyTiming(result.timing, true);
    }
  }

  function updateExternalTiming(update: Partial<ItemTimingDraft>) {
    if (!timing || !externalMode) {
      return;
    }

    applyTiming({
      ...timing,
      ...update,
      timerState: 'completed',
      lastResumedAt: null,
      timerSource: timing.timerSource,
    });
  }

  return (
    <section
      aria-labelledby={`${fieldIdPrefix}-timing-title`}
      className="grid gap-4 rounded-md border border-[var(--cma-line)] p-4"
    >
      <div>
        <h4
          className="text-lg font-semibold text-[var(--cma-text-strong)]"
          id={`${fieldIdPrefix}-timing-title`}
        >
          题目计时
        </h4>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          页面每秒只刷新显示；运行中每 15 秒将实际 wall-clock 用时作为完整快照进入同一题目保存队列。
        </p>
      </div>

      <dl className="grid gap-3 rounded-md bg-[var(--cma-surface-muted)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-sm font-semibold text-[var(--cma-muted)]">
            当前状态
          </dt>
          <dd className="mt-1 font-semibold text-[var(--cma-text-strong)]">
            {timing?.timerState === 'running'
              ? '运行中'
              : timing?.timerState === 'paused'
                ? '已暂停'
                : timing?.timerState === 'completed'
                  ? '已完成'
                  : '未开始'}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-[var(--cma-muted)]">
            当前显示用时
          </dt>
          <dd className="mt-1 font-semibold text-[var(--cma-text-strong)]">
            {formatDuration(getItemTimerElapsedMs(timing, displayNow))}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-[var(--cma-muted)]">
            计时来源
          </dt>
          <dd className="mt-1 text-[var(--cma-text-strong)]">
            {itemTimerSourceLabels[timing?.timerSource ?? 'none']}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-[var(--cma-muted)]">
            最近继续锚点
          </dt>
          <dd className="mt-1 text-[var(--cma-text-strong)]">
            {timing?.lastResumedAt
              ? formatDateTime(timing.lastResumedAt)
              : '—'}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-3">
        {!timing || timing.timerState === 'idle' ? (
          <Button
            disabled={disabled}
            onClick={() =>
              applySystemResult(startSystemItemTimer(timing, Date.now()))
            }
            size="sm"
          >
            开始计时
          </Button>
        ) : null}
        {timing?.timerState === 'running' ? (
          <Button
            disabled={disabled}
            onClick={() =>
              applySystemResult(pauseSystemItemTimer(timing, Date.now()))
            }
            size="sm"
            variant="secondary"
          >
            暂停计时
          </Button>
        ) : null}
        {timing?.timerState === 'paused' ? (
          <Button
            disabled={disabled}
            onClick={() =>
              applySystemResult(resumeSystemItemTimer(timing, Date.now()))
            }
            size="sm"
          >
            继续计时
          </Button>
        ) : null}
        {systemActive ? (
          <Button
            disabled={disabled}
            onClick={() =>
              applySystemResult(completeSystemItemTimer(timing, Date.now()))
            }
            size="sm"
          >
            完成计时
          </Button>
        ) : null}
        <Button
          disabled={disabled}
          onClick={() => {
            setResetVisible(true);
            setResetConfirmed(false);
          }}
          size="sm"
          variant="secondary"
        >
          复位计时
        </Button>
      </div>

      {resetVisible ? (
        <div className="grid gap-3 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-[var(--cma-warning)]">
          <p className="font-semibold">
            复位只会保存 timing=null，不会修改作答、题目状态或完成标记。
          </p>
          <label className="flex items-start gap-3 text-sm font-semibold leading-6">
            <input
              checked={resetConfirmed}
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)]"
              disabled={disabled}
              onChange={(event) => setResetConfirmed(event.target.checked)}
              type="checkbox"
            />
            我确认复位本题计时。
          </label>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={disabled || !resetConfirmed}
              onClick={() => {
                applyTiming(resetItemTimer(), true);
                setResetVisible(false);
                setResetConfirmed(false);
              }}
              size="sm"
            >
              确认复位
            </Button>
            <Button
              onClick={() => {
                setResetVisible(false);
                setResetConfirmed(false);
              }}
              size="sm"
              variant="ghost"
            >
              取消
            </Button>
          </div>
        </div>
      ) : null}

      <section className="grid gap-3 border-t border-[var(--cma-line)] pt-4">
        <div>
          <h5 className="font-semibold text-[var(--cma-text-strong)]">
            手工 / 导入完成态
          </h5>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            只能录入 completed 快照。系统计时运行中或暂停中时，必须先完成或复位。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={disabled || systemActive}
            onClick={() =>
              applyTiming(createExternalTiming(timing, 'manual'), true)
            }
            size="sm"
            variant="secondary"
          >
            录入手工完成态
          </Button>
          <Button
            disabled={disabled || systemActive}
            onClick={() =>
              applyTiming(createExternalTiming(timing, 'imported'), true)
            }
            size="sm"
            variant="secondary"
          >
            录入导入完成态
          </Button>
        </div>

        {externalMode && timing ? (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <label
                className="font-semibold text-[var(--cma-text-strong)]"
                htmlFor={`${fieldIdPrefix}-timing-started-at`}
              >
                开始时间（可空）
              </label>
              <input
                className={inputClassName}
                disabled={disabled}
                id={`${fieldIdPrefix}-timing-started-at`}
                onChange={(event) =>
                  updateExternalTiming({
                    startedAt: fromDateTimeLocalInput(event.target.value),
                  })
                }
                step="1"
                type="datetime-local"
                value={toDateTimeLocalInput(timing.startedAt)}
              />
            </div>
            <div className="grid gap-2">
              <label
                className="font-semibold text-[var(--cma-text-strong)]"
                htmlFor={`${fieldIdPrefix}-timing-completed-at`}
              >
                完成时间（可空）
              </label>
              <input
                className={inputClassName}
                disabled={disabled}
                id={`${fieldIdPrefix}-timing-completed-at`}
                onChange={(event) =>
                  updateExternalTiming({
                    completedAt: fromDateTimeLocalInput(event.target.value),
                  })
                }
                step="1"
                type="datetime-local"
                value={toDateTimeLocalInput(timing.completedAt)}
              />
            </div>
            <div className="grid gap-2">
              <label
                className="font-semibold text-[var(--cma-text-strong)]"
                htmlFor={`${fieldIdPrefix}-timing-duration`}
              >
                用时（秒，必填）
              </label>
              <input
                className={inputClassName}
                disabled={disabled}
                id={`${fieldIdPrefix}-timing-duration`}
                inputMode="decimal"
                min="0"
                onChange={(event) => {
                  const seconds = event.target.value;
                  const durationMs =
                    seconds === '' ? null : Math.round(Number(seconds) * 1000);
                  updateExternalTiming({
                    durationMs:
                      durationMs !== null &&
                      Number.isSafeInteger(durationMs) &&
                      durationMs >= 0
                        ? durationMs
                        : null,
                  });
                }}
                step="0.001"
                type="number"
                value={
                  timing.durationMs === null ? '' : timing.durationMs / 1000
                }
              />
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
