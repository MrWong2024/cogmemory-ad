import {
  ItemResponseTimingValidationError,
  normalizeItemResponseTiming,
  validateItemResponseTimingSnapshot,
  validateItemResponseTimingUpdate,
  type NormalizedItemResponseTiming,
} from './item-response-timing';

const STARTED_AT = '2026-08-03T08:00:00.000Z';
const RESUMED_AT = '2026-08-03T08:00:10.000Z';
const COMPLETED_AT = '2026-08-03T08:01:00.000Z';

function createTiming(
  timerState: NormalizedItemResponseTiming['timerState'],
): Record<string, unknown> {
  switch (timerState) {
    case 'idle':
      return {
        timerState,
        startedAt: null,
        lastResumedAt: null,
        completedAt: null,
        durationMs: 0,
        timerSource: 'none',
      };
    case 'running':
      return {
        timerState,
        startedAt: STARTED_AT,
        lastResumedAt: RESUMED_AT,
        completedAt: null,
        durationMs: 10_000,
        timerSource: 'system',
      };
    case 'paused':
      return {
        timerState,
        startedAt: STARTED_AT,
        lastResumedAt: null,
        completedAt: null,
        durationMs: 20_000,
        timerSource: 'system',
      };
    case 'completed':
      return {
        timerState,
        startedAt: STARTED_AT,
        lastResumedAt: null,
        completedAt: COMPLETED_AT,
        durationMs: 60_000,
        timerSource: 'system',
      };
  }
}

describe('item response timing', () => {
  it('normalizes legacy snapshots without resuming an old system timer', () => {
    expect(
      normalizeItemResponseTiming({
        startedAt: null,
        completedAt: null,
        durationMs: null,
        timerSource: 'none',
      }),
    ).toEqual({
      timerState: 'idle',
      startedAt: null,
      lastResumedAt: null,
      completedAt: null,
      durationMs: null,
      timerSource: 'none',
    });

    expect(
      normalizeItemResponseTiming({
        startedAt: null,
        completedAt: null,
        durationMs: 0,
        timerSource: 'none',
      }),
    ).toEqual({
      timerState: 'idle',
      startedAt: null,
      lastResumedAt: null,
      completedAt: null,
      durationMs: 0,
      timerSource: 'none',
    });

    expect(
      normalizeItemResponseTiming({
        startedAt: new Date(STARTED_AT),
        completedAt: null,
        durationMs: 12_000,
        timerSource: 'system',
      }),
    ).toEqual({
      timerState: 'paused',
      startedAt: new Date(STARTED_AT),
      lastResumedAt: null,
      completedAt: null,
      durationMs: 12_000,
      timerSource: 'system',
    });

    expect(
      normalizeItemResponseTiming({
        startedAt: null,
        completedAt: new Date(COMPLETED_AT),
        durationMs: 60_000,
        timerSource: 'manual',
      }),
    ).toEqual({
      timerState: 'completed',
      startedAt: null,
      lastResumedAt: null,
      completedAt: new Date(COMPLETED_AT),
      durationMs: 60_000,
      timerSource: 'manual',
    });

    expect(
      normalizeItemResponseTiming({
        startedAt: null,
        completedAt: new Date(COMPLETED_AT),
        durationMs: null,
        timerSource: 'none',
      }),
    ).toEqual({
      timerState: 'completed',
      startedAt: null,
      lastResumedAt: null,
      completedAt: new Date(COMPLETED_AT),
      durationMs: 0,
      timerSource: 'imported',
    });
  });

  it('does not expose invalid legacy dates or durations as running facts', () => {
    expect(
      normalizeItemResponseTiming({
        timerState: 'running',
        startedAt: STARTED_AT,
        lastResumedAt: 'invalid',
        completedAt: null,
        durationMs: -1,
        timerSource: 'system',
      }),
    ).toEqual({
      timerState: 'paused',
      startedAt: new Date(STARTED_AT),
      lastResumedAt: null,
      completedAt: null,
      durationMs: 0,
      timerSource: 'system',
    });
    expect(normalizeItemResponseTiming({ timerSource: 'browser' })).toBeNull();
  });

  it.each(['idle', 'running', 'paused', 'completed'] as const)(
    'accepts a complete valid %s snapshot',
    (timerState) => {
      expect(
        validateItemResponseTimingSnapshot(createTiming(timerState)),
      ).toEqual(expect.objectContaining({ timerState }));
    },
  );

  it('accepts a complete snapshot carried by a DTO-like class instance', () => {
    class TimingInput {
      timerState = 'running';
      startedAt = STARTED_AT;
      lastResumedAt = RESUMED_AT;
      completedAt = null;
      durationMs = 10_000;
      timerSource = 'system';
    }

    expect(validateItemResponseTimingSnapshot(new TimingInput())).toEqual(
      expect.objectContaining({ timerState: 'running' }),
    );
  });

  it('accepts completed manual and imported timing with nullable dates', () => {
    for (const timerSource of ['manual', 'imported'] as const) {
      expect(
        validateItemResponseTimingSnapshot({
          timerState: 'completed',
          startedAt: null,
          lastResumedAt: null,
          completedAt: null,
          durationMs: 500,
          timerSource,
        }),
      ).toEqual(
        expect.objectContaining({ timerState: 'completed', timerSource }),
      );
    }
  });

  it.each([
    { ...createTiming('idle'), timerSource: 'system' },
    { ...createTiming('running'), lastResumedAt: null },
    { ...createTiming('running'), timerSource: 'manual' },
    { ...createTiming('paused'), lastResumedAt: RESUMED_AT },
    { ...createTiming('completed'), lastResumedAt: RESUMED_AT },
    {
      ...createTiming('completed'),
      completedAt: STARTED_AT,
      startedAt: COMPLETED_AT,
    },
    { ...createTiming('completed'), durationMs: -1 },
    {
      timerState: 'running',
      startedAt: STARTED_AT,
      lastResumedAt: RESUMED_AT,
      completedAt: null,
      durationMs: 0,
      timerSource: 'imported',
    },
    {
      timerState: 'paused',
      startedAt: STARTED_AT,
      lastResumedAt: null,
      completedAt: null,
      durationMs: 0,
      timerSource: 'none',
    },
  ])('rejects an invalid state invariant', (timing) => {
    expect(() => validateItemResponseTimingSnapshot(timing)).toThrow(
      ItemResponseTimingValidationError,
    );
  });

  it('requires every full snapshot field', () => {
    const incomplete = createTiming('running');
    delete incomplete.lastResumedAt;

    expect(() => validateItemResponseTimingSnapshot(incomplete)).toThrow(
      ItemResponseTimingValidationError,
    );
  });

  it.each([
    [null, 'running'],
    [null, 'completed'],
    ['idle', 'running'],
    ['idle', 'completed'],
    ['running', 'running'],
    ['running', 'paused'],
    ['running', 'completed'],
    ['running', 'idle'],
    ['running', null],
    ['paused', 'running'],
    ['paused', 'completed'],
    ['paused', 'idle'],
    ['paused', null],
    ['completed', 'completed'],
    ['completed', 'idle'],
    ['completed', null],
  ] as const)('accepts transition %s -> %s', (from, to) => {
    const current = from === null ? null : createTiming(from);
    const next = to === null ? null : createTiming(to);

    expect(() => validateItemResponseTimingUpdate(current, next)).not.toThrow();
  });

  it.each([
    [null, 'idle'],
    [null, 'paused'],
    ['idle', 'idle'],
    ['idle', 'paused'],
    ['paused', 'paused'],
    ['completed', 'running'],
    ['completed', 'paused'],
  ] as const)('rejects transition %s -> %s', (from, to) => {
    const current = from === null ? null : createTiming(from);
    const next = createTiming(to);

    expect(() => validateItemResponseTimingUpdate(current, next)).toThrow(
      ItemResponseTimingValidationError,
    );
  });
});
