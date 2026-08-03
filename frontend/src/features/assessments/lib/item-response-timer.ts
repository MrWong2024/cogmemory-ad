import type {
  ItemTimerSource,
  ItemTimingDraft,
} from '@/src/features/assessments/types/item-response-execution';

export const ITEM_TIMER_CHECKPOINT_MS = 15_000;

export type ItemTimerTransitionResult =
  | { ok: true; timing: ItemTimingDraft }
  | { ok: false; message: string };

function safeNow(now: number): number | null {
  return Number.isFinite(now) && now >= 0
    ? Math.min(Math.trunc(now), Number.MAX_SAFE_INTEGER)
    : null;
}

function safeIso(now: number): string | null {
  const normalized = safeNow(now);

  if (normalized === null) {
    return null;
  }

  try {
    return new Date(normalized).toISOString();
  } catch {
    return null;
  }
}

export function parseItemTimerTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : null;
}

export function normalizeItemTimerDuration(value: number | null): number {
  if (!Number.isFinite(value) || value === null || value <= 0) {
    return 0;
  }

  return Math.min(Math.trunc(value), Number.MAX_SAFE_INTEGER);
}

function addSafeDuration(left: number, right: number): number {
  const normalizedLeft = normalizeItemTimerDuration(left);
  const normalizedRight = normalizeItemTimerDuration(right);

  if (normalizedLeft >= Number.MAX_SAFE_INTEGER - normalizedRight) {
    return Number.MAX_SAFE_INTEGER;
  }

  return normalizedLeft + normalizedRight;
}

export function getItemTimerElapsedMs(
  timing: ItemTimingDraft | null,
  displayNow: number,
): number {
  if (!timing) {
    return 0;
  }

  const accumulated = normalizeItemTimerDuration(timing.durationMs);

  if (timing.timerState !== 'running') {
    return accumulated;
  }

  const resumedAt = parseItemTimerTimestamp(timing.lastResumedAt);
  const now = safeNow(displayNow);

  if (resumedAt === null || now === null || now <= resumedAt) {
    return accumulated;
  }

  return addSafeDuration(accumulated, now - resumedAt);
}

export function validateItemTimingSnapshot(
  timing: ItemTimingDraft,
): string | null {
  const startedAt = parseItemTimerTimestamp(timing.startedAt);
  const lastResumedAt = parseItemTimerTimestamp(timing.lastResumedAt);
  const completedAt = parseItemTimerTimestamp(timing.completedAt);
  const durationIsValid =
    timing.durationMs === null ||
    (Number.isSafeInteger(timing.durationMs) && timing.durationMs >= 0);

  if (!durationIsValid) {
    return '用时必须是安全的非负整数毫秒。';
  }

  if (timing.startedAt !== null && startedAt === null) {
    return '开始时间不是有效时间。';
  }

  if (timing.lastResumedAt !== null && lastResumedAt === null) {
    return '最近继续时间不是有效时间。';
  }

  if (timing.completedAt !== null && completedAt === null) {
    return '完成时间不是有效时间。';
  }

  if (
    startedAt !== null &&
    completedAt !== null &&
    completedAt < startedAt
  ) {
    return '完成时间不得早于开始时间。';
  }

  if (
    startedAt !== null &&
    lastResumedAt !== null &&
    lastResumedAt < startedAt
  ) {
    return '最近继续时间不得早于开始时间。';
  }

  if (timing.timerState === 'idle') {
    return timing.timerSource === 'none' &&
      timing.startedAt === null &&
      timing.lastResumedAt === null &&
      timing.completedAt === null &&
      timing.durationMs === null
      ? null
      : '空闲计时不能包含时间、用时或非空来源。';
  }

  if (timing.timerState === 'running') {
    return timing.timerSource === 'system' &&
      startedAt !== null &&
      lastResumedAt !== null &&
      timing.completedAt === null &&
      timing.durationMs !== null
      ? null
      : '运行中计时必须包含系统开始锚点、最近继续锚点和累计用时。';
  }

  if (timing.timerState === 'paused') {
    return timing.timerSource === 'system' &&
      startedAt !== null &&
      timing.lastResumedAt === null &&
      timing.completedAt === null &&
      timing.durationMs !== null
      ? null
      : '暂停计时必须保留系统开始锚点和累计用时。';
  }

  if (timing.lastResumedAt !== null || timing.durationMs === null) {
    return '完成态计时必须清除最近继续锚点并包含累计用时。';
  }

  if (timing.timerSource === 'system') {
    return startedAt !== null && completedAt !== null
      ? null
      : '系统完成态必须包含开始与完成时间。';
  }

  return timing.timerSource === 'manual' || timing.timerSource === 'imported'
    ? null
    : '完成态计时来源必须是系统、手工或导入。';
}

export function startSystemItemTimer(
  timing: ItemTimingDraft | null,
  now: number,
): ItemTimerTransitionResult {
  if (timing && timing.timerState !== 'idle') {
    return {
      ok: false,
      message: '只有未记录或空闲计时可以开始。',
    };
  }

  const timestamp = safeIso(now);

  if (!timestamp) {
    return { ok: false, message: '当前系统时间无效，无法开始计时。' };
  }

  return {
    ok: true,
    timing: {
      timerState: 'running',
      startedAt: timestamp,
      lastResumedAt: timestamp,
      completedAt: null,
      durationMs: 0,
      timerSource: 'system',
    },
  };
}

export function resetItemTimer(): null {
  return null;
}

export function pauseSystemItemTimer(
  timing: ItemTimingDraft | null,
  now: number,
): ItemTimerTransitionResult {
  if (!timing || timing.timerState !== 'running') {
    return { ok: false, message: '只有运行中的计时可以暂停。' };
  }

  return {
    ok: true,
    timing: {
      ...timing,
      timerState: 'paused',
      lastResumedAt: null,
      completedAt: null,
      durationMs: getItemTimerElapsedMs(timing, now),
      timerSource: 'system',
    },
  };
}

export function resumeSystemItemTimer(
  timing: ItemTimingDraft | null,
  now: number,
): ItemTimerTransitionResult {
  if (!timing || timing.timerState !== 'paused') {
    return { ok: false, message: '只有暂停中的计时可以继续。' };
  }

  const startedAt = parseItemTimerTimestamp(timing.startedAt);
  const normalizedNow = safeNow(now);
  const timestamp =
    normalizedNow === null
      ? null
      : safeIso(Math.max(normalizedNow, startedAt ?? normalizedNow));

  if (!timestamp) {
    return { ok: false, message: '当前系统时间无效，无法继续计时。' };
  }

  return {
    ok: true,
    timing: {
      ...timing,
      timerState: 'running',
      lastResumedAt: timestamp,
      completedAt: null,
      durationMs: normalizeItemTimerDuration(timing.durationMs),
      timerSource: 'system',
    },
  };
}

export function completeSystemItemTimer(
  timing: ItemTimingDraft | null,
  now: number,
): ItemTimerTransitionResult {
  if (
    !timing ||
    (timing.timerState !== 'running' && timing.timerState !== 'paused')
  ) {
    return { ok: false, message: '只有运行中或暂停中的计时可以完成。' };
  }

  const startedAt = parseItemTimerTimestamp(timing.startedAt);
  const lastResumedAt = parseItemTimerTimestamp(timing.lastResumedAt);
  const normalizedNow = safeNow(now);
  const timestamp =
    normalizedNow === null
      ? null
      : safeIso(
          Math.max(
            normalizedNow,
            startedAt ?? normalizedNow,
            lastResumedAt ?? normalizedNow,
          ),
        );

  if (!timestamp) {
    return { ok: false, message: '当前系统时间无效，无法完成计时。' };
  }

  return {
    ok: true,
    timing: {
      ...timing,
      timerState: 'completed',
      lastResumedAt: null,
      completedAt: timestamp,
      durationMs:
        timing.timerState === 'running'
          ? getItemTimerElapsedMs(timing, now)
          : normalizeItemTimerDuration(timing.durationMs),
      timerSource: 'system',
    },
  };
}

export function createSystemItemTimerCheckpoint(
  timing: ItemTimingDraft | null,
  checkpointTime: number,
  minimumIntervalMs = ITEM_TIMER_CHECKPOINT_MS,
): ItemTimingDraft | null {
  if (!timing || timing.timerState !== 'running') {
    return null;
  }

  const resumedAt = parseItemTimerTimestamp(timing.lastResumedAt);
  const now = safeNow(checkpointTime);

  if (
    resumedAt === null ||
    now === null ||
    now - resumedAt < Math.max(0, minimumIntervalMs)
  ) {
    return null;
  }

  const timestamp = safeIso(now);

  if (!timestamp) {
    return null;
  }

  return {
    ...timing,
    timerState: 'running',
    lastResumedAt: timestamp,
    completedAt: null,
    durationMs: getItemTimerElapsedMs(timing, now),
    timerSource: 'system',
  };
}

export function createCompletedExternalItemTiming(input: {
  currentTiming: ItemTimingDraft | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number;
  timerSource: Exclude<ItemTimerSource, 'none' | 'system'>;
  confirmedSystemReplacement: boolean;
}): ItemTimerTransitionResult {
  if (
    (input.currentTiming?.timerState === 'running' ||
      input.currentTiming?.timerState === 'paused') &&
    !input.confirmedSystemReplacement
  ) {
    return {
      ok: false,
      message: '请先明确完成或复位当前系统计时，再切换为手工或导入记录。',
    };
  }

  const timing: ItemTimingDraft = {
    timerState: 'completed',
    startedAt: input.startedAt,
    lastResumedAt: null,
    completedAt: input.completedAt,
    durationMs: input.durationMs,
    timerSource: input.timerSource,
  };
  const validationError = validateItemTimingSnapshot(timing);

  return validationError
    ? { ok: false, message: validationError }
    : { ok: true, timing };
}
