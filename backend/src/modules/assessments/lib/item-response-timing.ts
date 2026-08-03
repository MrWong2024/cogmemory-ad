export const ITEM_TIMER_SOURCES = [
  'none',
  'system',
  'manual',
  'imported',
] as const;
export type ItemTimerSource = (typeof ITEM_TIMER_SOURCES)[number];

export const ITEM_TIMER_STATES = [
  'idle',
  'running',
  'paused',
  'completed',
] as const;
export type ItemTimerState = (typeof ITEM_TIMER_STATES)[number];

export type NormalizedItemResponseTiming = {
  timerState: ItemTimerState;
  startedAt: Date | null;
  lastResumedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  timerSource: ItemTimerSource;
};

export class ItemResponseTimingValidationError extends Error {
  constructor() {
    super('Item response timing is invalid');
    this.name = 'ItemResponseTimingValidationError';
  }
}

function isTimingRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function hasOwn(value: Record<string, unknown>, propertyName: string): boolean {
  return Object.getOwnPropertyDescriptor(value, propertyName) !== undefined;
}

function isTimerSource(value: unknown): value is ItemTimerSource {
  return (
    typeof value === 'string' &&
    (ITEM_TIMER_SOURCES as readonly string[]).includes(value)
  );
}

function isTimerState(value: unknown): value is ItemTimerState {
  return (
    typeof value === 'string' &&
    (ITEM_TIMER_STATES as readonly string[]).includes(value)
  );
}

function toValidDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function toValidDuration(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null;
}

function hasValidChronology(
  startedAt: Date | null,
  completedAt: Date | null,
): boolean {
  return (
    !startedAt || !completedAt || completedAt.getTime() >= startedAt.getTime()
  );
}

function isValidSnapshot(value: NormalizedItemResponseTiming): boolean {
  switch (value.timerState) {
    case 'idle':
      return (
        value.timerSource === 'none' &&
        value.startedAt === null &&
        value.lastResumedAt === null &&
        value.completedAt === null &&
        (value.durationMs === null || value.durationMs === 0)
      );
    case 'running':
      return (
        value.timerSource === 'system' &&
        value.startedAt !== null &&
        value.lastResumedAt !== null &&
        value.completedAt === null &&
        value.durationMs !== null &&
        value.lastResumedAt.getTime() >= value.startedAt.getTime()
      );
    case 'paused':
      return (
        value.timerSource === 'system' &&
        value.startedAt !== null &&
        value.lastResumedAt === null &&
        value.completedAt === null &&
        value.durationMs !== null
      );
    case 'completed':
      if (
        value.lastResumedAt !== null ||
        value.durationMs === null ||
        !hasValidChronology(value.startedAt, value.completedAt)
      ) {
        return false;
      }

      if (value.timerSource === 'system') {
        return value.startedAt !== null && value.completedAt !== null;
      }

      return value.timerSource === 'manual' || value.timerSource === 'imported';
  }
}

function buildCandidate(
  record: Record<string, unknown>,
): NormalizedItemResponseTiming | null {
  if (!isTimerState(record.timerState) || !isTimerSource(record.timerSource)) {
    return null;
  }

  const candidate: NormalizedItemResponseTiming = {
    timerState: record.timerState,
    startedAt: toValidDate(record.startedAt),
    lastResumedAt: toValidDate(record.lastResumedAt),
    completedAt: toValidDate(record.completedAt),
    durationMs: toValidDuration(record.durationMs),
    timerSource: record.timerSource,
  };

  return isValidSnapshot(candidate) ? candidate : null;
}

export function normalizeItemResponseTiming(
  value: unknown,
): NormalizedItemResponseTiming | null {
  if (!isTimingRecord(value)) {
    return null;
  }

  const explicitCandidate = buildCandidate(value);

  if (explicitCandidate) {
    return explicitCandidate;
  }

  const timerSource = isTimerSource(value.timerSource)
    ? value.timerSource
    : null;
  const startedAt = toValidDate(value.startedAt);
  const completedAt = toValidDate(value.completedAt);
  const durationMs = toValidDuration(value.durationMs);

  if (
    timerSource === 'none' &&
    startedAt === null &&
    completedAt === null &&
    (durationMs === null || durationMs === 0)
  ) {
    return {
      timerState: 'idle',
      startedAt: null,
      lastResumedAt: null,
      completedAt: null,
      durationMs,
      timerSource: 'none',
    };
  }

  if (completedAt) {
    if (timerSource === 'system' && startedAt) {
      if (!hasValidChronology(startedAt, completedAt)) {
        return null;
      }

      return {
        timerState: 'completed',
        startedAt,
        lastResumedAt: null,
        completedAt,
        durationMs: durationMs ?? 0,
        timerSource,
      };
    }

    if (timerSource === 'manual' || timerSource === 'imported') {
      return {
        timerState: 'completed',
        startedAt:
          startedAt && hasValidChronology(startedAt, completedAt)
            ? startedAt
            : null,
        lastResumedAt: null,
        completedAt,
        durationMs: durationMs ?? 0,
        timerSource,
      };
    }

    return {
      timerState: 'completed',
      startedAt:
        startedAt && hasValidChronology(startedAt, completedAt)
          ? startedAt
          : null,
      lastResumedAt: null,
      completedAt,
      durationMs: durationMs ?? 0,
      timerSource: 'imported',
    };
  }

  if (timerSource === 'system' && startedAt) {
    return {
      timerState: 'paused',
      startedAt,
      lastResumedAt: null,
      completedAt: null,
      durationMs: durationMs ?? 0,
      timerSource,
    };
  }

  if (
    (timerSource === 'manual' || timerSource === 'imported') &&
    (startedAt !== null || durationMs !== null)
  ) {
    return {
      timerState: 'completed',
      startedAt,
      lastResumedAt: null,
      completedAt: null,
      durationMs: durationMs ?? 0,
      timerSource,
    };
  }

  return null;
}

export function validateItemResponseTimingSnapshot(
  value: unknown,
): NormalizedItemResponseTiming {
  if (!isTimingRecord(value)) {
    throw new ItemResponseTimingValidationError();
  }

  for (const field of [
    'timerState',
    'startedAt',
    'lastResumedAt',
    'completedAt',
    'durationMs',
    'timerSource',
  ]) {
    if (!hasOwn(value, field)) {
      throw new ItemResponseTimingValidationError();
    }
  }

  if (!isTimerState(value.timerState) || !isTimerSource(value.timerSource)) {
    throw new ItemResponseTimingValidationError();
  }

  const dateFields = ['startedAt', 'lastResumedAt', 'completedAt'] as const;
  const dates: Record<(typeof dateFields)[number], Date | null> = {
    startedAt: null,
    lastResumedAt: null,
    completedAt: null,
  };

  for (const field of dateFields) {
    if (value[field] !== null) {
      const parsed = toValidDate(value[field]);

      if (!parsed) {
        throw new ItemResponseTimingValidationError();
      }

      dates[field] = parsed;
    }
  }

  const durationMs =
    value.durationMs === null ? null : toValidDuration(value.durationMs);

  if (value.durationMs !== null && durationMs === null) {
    throw new ItemResponseTimingValidationError();
  }

  const snapshot: NormalizedItemResponseTiming = {
    timerState: value.timerState,
    startedAt: dates.startedAt,
    lastResumedAt: dates.lastResumedAt,
    completedAt: dates.completedAt,
    durationMs,
    timerSource: value.timerSource,
  };

  if (!isValidSnapshot(snapshot)) {
    throw new ItemResponseTimingValidationError();
  }

  return snapshot;
}

export function validateItemResponseTimingUpdate(
  currentValue: unknown,
  nextValue: unknown,
): NormalizedItemResponseTiming | null {
  const currentState = normalizeItemResponseTiming(currentValue)?.timerState;
  const nextTiming =
    nextValue === null ? null : validateItemResponseTimingSnapshot(nextValue);
  const nextState = nextTiming?.timerState ?? null;

  const allowed =
    currentState === undefined || currentState === 'idle'
      ? nextState === 'running' || nextState === 'completed'
      : currentState === 'running'
        ? nextState === 'running' ||
          nextState === 'paused' ||
          nextState === 'completed' ||
          nextState === 'idle' ||
          nextState === null
        : currentState === 'paused'
          ? nextState === 'running' ||
            nextState === 'completed' ||
            nextState === 'idle' ||
            nextState === null
          : nextState === 'completed' ||
            nextState === 'idle' ||
            nextState === null;

  if (!allowed) {
    throw new ItemResponseTimingValidationError();
  }

  return nextTiming;
}
