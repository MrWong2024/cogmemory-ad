import { expect, test } from '@playwright/test';

import { ItemResponseAutosaveCoordinator } from '@/src/features/assessments/lib/item-response-autosave';
import {
  buildItemResponseDraftRequest,
  createItemDraftState,
} from '@/src/features/assessments/lib/item-response-draft';
import {
  ITEM_TIMER_CHECKPOINT_MS,
  completeSystemItemTimer,
  createCompletedExternalItemTiming,
  createSystemItemTimerCheckpoint,
  getItemTimerElapsedMs,
  normalizeItemTimerDuration,
  pauseSystemItemTimer,
  resetItemTimer,
  resumeSystemItemTimer,
  startSystemItemTimer,
  validateItemTimingSnapshot,
} from '@/src/features/assessments/lib/item-response-timer';
import type {
  ItemResponseExecution,
  ItemTimingDraft,
  UpdateItemResponseDraftRequest,
} from '@/src/features/assessments/types/item-response-execution';

const startMs = Date.parse('2026-08-03T00:00:00.000Z');

function createIdleTiming(): ItemTimingDraft {
  return {
    timerState: 'idle',
    startedAt: null,
    lastResumedAt: null,
    completedAt: null,
    durationMs: null,
    timerSource: 'none',
  };
}

function createRunningTiming(
  overrides: Partial<ItemTimingDraft> = {},
): ItemTimingDraft {
  return {
    timerState: 'running',
    startedAt: new Date(startMs).toISOString(),
    lastResumedAt: new Date(startMs).toISOString(),
    completedAt: null,
    durationMs: 0,
    timerSource: 'system',
    ...overrides,
  };
}

function createTimedItem(
  timing: ItemTimingDraft | null,
): ItemResponseExecution {
  return {
    id: 'timed-item-response',
    scaleInstanceId: 'scale-instance-timer',
    itemCode: 'TIMED_ITEM',
    groupCode: 'GROUP_TIMER',
    itemTitle: '计时测试题',
    itemOrder: 1,
    responseType: 'timed_task',
    countsTowardTotal: true,
    cognitiveDomainCodes: [],
    versionTrace: null,
    config: {
      scoreRange: { min: 0, max: 1 },
      evidenceTypes: ['duration'],
      requiresTimer: true,
      supportsPhotoUpload: false,
      supportsHandwriting: false,
      requiresOperatorNote: false,
    },
    status: 'in_progress',
    draftRevision: 3,
    draftSavedAt: '2026-08-03T00:00:00.000Z',
    answerSource: 'clinician_recorded',
    rawResponse: null,
    structuredResponse: null,
    responseText: undefined,
    isMissing: false,
    stepResponses: [],
    promptResponses: [],
    timing,
    evidenceRequirements: [
      {
        evidenceType: 'duration',
        status: 'pending',
        attached: false,
        mediaEvidenceId: null,
      },
    ],
    operatorNote: undefined,
  };
}

test('null and idle timing can start a system timer', () => {
  const fromNull = startSystemItemTimer(null, startMs);
  const fromIdle = startSystemItemTimer(createIdleTiming(), startMs);

  expect(fromNull).toEqual({
    ok: true,
    timing: createRunningTiming(),
  });
  expect(fromIdle).toEqual(fromNull);
});

test('completed timing cannot be restarted without a reset', () => {
  const completed: ItemTimingDraft = {
    timerState: 'completed',
    startedAt: new Date(startMs).toISOString(),
    lastResumedAt: null,
    completedAt: new Date(startMs + 1_000).toISOString(),
    durationMs: 1_000,
    timerSource: 'system',
  };
  expect(startSystemItemTimer(completed, startMs + 2_000).ok).toBe(false);
});

test('running pauses by accumulating the wall-clock segment', () => {
  const result = pauseSystemItemTimer(
    createRunningTiming({ durationMs: 2_000 }),
    startMs + 5_000,
  );
  expect(result).toEqual({
    ok: true,
    timing: {
      ...createRunningTiming(),
      timerState: 'paused',
      lastResumedAt: null,
      durationMs: 7_000,
    },
  });
});

test('paused resumes with a new server-persistable anchor', () => {
  const paused: ItemTimingDraft = {
    ...createRunningTiming(),
    timerState: 'paused',
    lastResumedAt: null,
    durationMs: 7_000,
  };
  const result = resumeSystemItemTimer(paused, startMs + 10_000);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.timing).toMatchObject({
    timerState: 'running',
    lastResumedAt: new Date(startMs + 10_000).toISOString(),
    durationMs: 7_000,
    timerSource: 'system',
  });
});

test('running completes after first accumulating its active segment', () => {
  const result = completeSystemItemTimer(
    createRunningTiming({ durationMs: 2_000 }),
    startMs + 5_000,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.timing).toMatchObject({
    timerState: 'completed',
    lastResumedAt: null,
    completedAt: new Date(startMs + 5_000).toISOString(),
    durationMs: 7_000,
    timerSource: 'system',
  });
});

test('paused completes without adding another segment', () => {
  const paused: ItemTimingDraft = {
    ...createRunningTiming(),
    timerState: 'paused',
    lastResumedAt: null,
    durationMs: 7_000,
  };
  const result = completeSystemItemTimer(paused, startMs + 20_000);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.timing.durationMs).toBe(7_000);
  expect(result.timing.completedAt).toBe(
    new Date(startMs + 20_000).toISOString(),
  );
});

test('reset is an explicit null timing snapshot', () => {
  expect(resetItemTimer()).toBeNull();
  const item = createTimedItem(createRunningTiming());
  const result = buildItemResponseDraftRequest(
    item,
    { ...createItemDraftState(item), timing: resetItemTimer() },
    false,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.input).toEqual({ expectedRevision: 3, timing: null });
});

test('running elapsed combines accumulated duration with the current wall-clock segment', () => {
  expect(
    getItemTimerElapsedMs(
      createRunningTiming({ durationMs: 4_000 }),
      startMs + 6_000,
    ),
  ).toBe(10_000);
});

test('a reloaded running timer resumes its display from the persisted last-resumed anchor', () => {
  const serverTiming = createRunningTiming({
    durationMs: 30_000,
    lastResumedAt: new Date(startMs + 20_000).toISOString(),
  });
  expect(getItemTimerElapsedMs(serverTiming, startMs + 25_000)).toBe(35_000);
});

test('clock rollback, invalid values, non-finite values and overflow normalize safely', () => {
  expect(getItemTimerElapsedMs(createRunningTiming({ durationMs: 5_000 }), startMs - 1)).toBe(5_000);
  expect(
    getItemTimerElapsedMs(
      createRunningTiming({ lastResumedAt: 'invalid', durationMs: 5_000 }),
      startMs + 10_000,
    ),
  ).toBe(5_000);
  expect(normalizeItemTimerDuration(Number.NaN)).toBe(0);
  expect(normalizeItemTimerDuration(Number.POSITIVE_INFINITY)).toBe(0);
  expect(
    getItemTimerElapsedMs(
      createRunningTiming({ durationMs: Number.MAX_SAFE_INTEGER - 1 }),
      startMs + 10_000,
    ),
  ).toBe(Number.MAX_SAFE_INTEGER);
});

test('checkpoint waits 15 seconds, then accumulates and moves the anchor', () => {
  const timing = createRunningTiming({ durationMs: 2_000 });
  expect(ITEM_TIMER_CHECKPOINT_MS).toBe(15_000);
  expect(createSystemItemTimerCheckpoint(timing, startMs + 14_999)).toBeNull();
  expect(createSystemItemTimerCheckpoint(timing, startMs + 15_000)).toEqual({
    ...timing,
    lastResumedAt: new Date(startMs + 15_000).toISOString(),
    durationMs: 17_000,
  });
});

test('a delayed checkpoint uses actual elapsed wall-clock time rather than tick count', () => {
  const checkpoint = createSystemItemTimerCheckpoint(
    createRunningTiming({ durationMs: 1_000 }),
    startMs + 47_000,
  );
  expect(checkpoint?.durationMs).toBe(48_000);
  expect(checkpoint?.lastResumedAt).toBe(
    new Date(startMs + 47_000).toISOString(),
  );
});

test('display math is pure and never constructs a save request', () => {
  const item = createTimedItem(createRunningTiming());
  const before = createItemDraftState(item);
  expect(getItemTimerElapsedMs(before.timing, startMs + 1_000)).toBe(1_000);
  expect(createItemDraftState(item)).toEqual(before);
});

test('manual and imported builders only create valid completed snapshots', () => {
  for (const timerSource of ['manual', 'imported'] as const) {
    const result = createCompletedExternalItemTiming({
      currentTiming: null,
      startedAt: null,
      completedAt: null,
      durationMs: 12_345,
      timerSource,
      confirmedSystemReplacement: false,
    });
    expect(result).toEqual({
      ok: true,
      timing: {
        timerState: 'completed',
        startedAt: null,
        lastResumedAt: null,
        completedAt: null,
        durationMs: 12_345,
        timerSource,
      },
    });
  }
});

test('manual and imported duration and timestamp order are validated', () => {
  expect(
    createCompletedExternalItemTiming({
      currentTiming: null,
      startedAt: new Date(startMs + 10_000).toISOString(),
      completedAt: new Date(startMs).toISOString(),
      durationMs: 1,
      timerSource: 'manual',
      confirmedSystemReplacement: false,
    }).ok,
  ).toBe(false);
  expect(
    createCompletedExternalItemTiming({
      currentTiming: null,
      startedAt: null,
      completedAt: null,
      durationMs: Number.POSITIVE_INFINITY,
      timerSource: 'imported',
      confirmedSystemReplacement: false,
    }).ok,
  ).toBe(false);
});

test('active or paused system timing cannot switch source without explicit replacement confirmation', () => {
  for (const timerState of ['running', 'paused'] as const) {
    const currentTiming: ItemTimingDraft = {
      ...createRunningTiming(),
      timerState,
      lastResumedAt:
        timerState === 'running' ? new Date(startMs).toISOString() : null,
    };
    expect(
      createCompletedExternalItemTiming({
        currentTiming,
        startedAt: null,
        completedAt: null,
        durationMs: 1_000,
        timerSource: 'manual',
        confirmedSystemReplacement: false,
      }).ok,
    ).toBe(false);
  }
});

test('full timing validation rejects manual running state and non-null completed anchor', () => {
  expect(
    validateItemTimingSnapshot({
      ...createRunningTiming(),
      timerSource: 'manual',
    }),
  ).not.toBeNull();
  expect(
    validateItemTimingSnapshot({
      timerState: 'completed',
      startedAt: null,
      lastResumedAt: new Date(startMs).toISOString(),
      completedAt: null,
      durationMs: 1,
      timerSource: 'imported',
    }),
  ).not.toBeNull();
});

test('timer operations build timing-only draft writes and never mark the item answered', () => {
  const item = createTimedItem(null);
  const started = startSystemItemTimer(null, startMs);
  expect(started.ok).toBe(true);
  if (!started.ok) return;
  const result = buildItemResponseDraftRequest(
    item,
    { ...createItemDraftState(item), timing: started.timing },
    false,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.input).toEqual({ expectedRevision: 3, timing: started.timing });
  expect(result.input.markAsAnswered).toBeUndefined();
});

test('timer checkpoint enters the same single-item autosave queue', async () => {
  const item = createTimedItem(createRunningTiming());
  const requests: UpdateItemResponseDraftRequest[] = [];
  let latestState = 'clean';
  const coordinator = new ItemResponseAutosaveCoordinator({
    clock: {
      now: () => startMs + 15_000,
      setTimeout: () => 1,
      clearTimeout: () => undefined,
    },
    isOnline: () => true,
    save: async (_itemResponseId, request) => {
      requests.push(request);
      return {
        itemResponse: {
          ...item,
          draftRevision: 4,
          draftSavedAt: new Date(startMs + 15_000).toISOString(),
          timing: request.timing ?? item.timing,
        },
        progress: { totalItemCount: 1, answeredItemCount: 0 },
      };
    },
    readLatest: async () => {
      throw new Error('unexpected read');
    },
    getErrorKind: () => 'unknown',
    onChange: (snapshots) => {
      latestState = snapshots[item.id]?.state ?? 'clean';
    },
    onServerItemAccepted: () => undefined,
    onExecutionSummaryRefreshed: () => undefined,
    onUnauthorized: () => undefined,
  });
  coordinator.initialize([item]);
  coordinator.checkpointRunningTimers(startMs + 15_000);
  await Promise.resolve();
  await Promise.resolve();

  expect(requests).toHaveLength(1);
  expect(requests[0].expectedRevision).toBe(3);
  expect(requests[0].timing).toMatchObject({
    timerState: 'running',
    lastResumedAt: new Date(startMs + 15_000).toISOString(),
    durationMs: 15_000,
  });
  expect(requests[0].markAsAnswered).toBeUndefined();
  expect(['saving', 'clean']).toContain(latestState);
});

test('group changes do not alter running timer math', () => {
  const timing = createRunningTiming({ durationMs: 3_000 });
  const before = getItemTimerElapsedMs(timing, startMs + 5_000);
  const after = getItemTimerElapsedMs({ ...timing }, startMs + 5_000);
  expect(after).toBe(before);
  expect(after).toBe(8_000);
});
