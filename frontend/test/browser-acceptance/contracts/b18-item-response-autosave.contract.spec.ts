import { expect, test } from '@playwright/test';

import {
  AssessmentExecutionApiError,
  saveItemResponseDraft,
  serializeItemResponseDraftRequest,
} from '@/src/features/assessments/api/assessment-execution-api';
import {
  ITEM_RESPONSE_AUTOSAVE_DEBOUNCE_MS,
  ITEM_RESPONSE_AUTOSAVE_MAX_WAIT_MS,
  ItemResponseAutosaveCoordinator,
  autosaveStateBlocksSubmission,
  autosaveStateBlocksUnload,
  classifyDraftSaveReconciliation,
  draftSaveAttemptFieldsMatchServer,
  getAutosaveScheduleDelay,
  mergeDraftSaveMediaState,
  rebaseItemDraftAfterSave,
  shouldRefreshSubmissionReadinessAfterItemAcceptance,
  type ItemResponseAcceptedMode,
  type ItemResponseAutosaveClock,
  type ItemResponseAutosaveSnapshot,
  type ItemResponseAutosaveState,
  type ItemResponseSaveAttempt,
} from '@/src/features/assessments/lib/item-response-autosave';
import {
  buildItemResponseDraftRequest,
  createItemDraftState,
  getManualObservationRecordConfig,
} from '@/src/features/assessments/lib/item-response-draft';
import type {
  ItemResponseExecution,
  ScaleInstanceExecutionDetailResponse,
  UpdateItemResponseDraftRequest,
  UpdateItemResponseDraftResponse,
} from '@/src/features/assessments/types/item-response-execution';

class FakeClock implements ItemResponseAutosaveClock {
  private current = 0;
  private sequence = 0;
  private readonly tasks = new Map<
    number,
    { callback: () => void; dueAt: number }
  >();

  now = () => this.current;

  setTimeout = (callback: () => void, delayMs: number): number => {
    const handle = ++this.sequence;
    this.tasks.set(handle, {
      callback,
      dueAt: this.current + Math.max(0, delayMs),
    });
    return handle;
  };

  clearTimeout = (handle: unknown): void => {
    if (typeof handle === 'number') {
      this.tasks.delete(handle);
    }
  };

  async advance(ms: number): Promise<void> {
    const target = this.current + ms;

    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.dueAt <= target)
        .sort((left, right) => left[1].dueAt - right[1].dueAt)[0];

      if (!next) {
        break;
      }

      this.tasks.delete(next[0]);
      this.current = next[1].dueAt;
      next[1].callback();
      await settleAsyncWork();
    }

    this.current = target;
    await settleAsyncWork();
  }

  pendingCount(): number {
    return this.tasks.size;
  }
}

async function settleAsyncWork(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolvePromise: ((value: T) => void) | null = null;
  let rejectPromise: ((reason: unknown) => void) | null = null;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
    reject: (reason) => rejectPromise?.(reason),
  };
}

function createItem(
  overrides: Partial<ItemResponseExecution> = {},
): ItemResponseExecution {
  return {
    id: 'item-response-a',
    scaleInstanceId: 'scale-instance-a',
    itemCode: 'ITEM_A',
    groupCode: 'GROUP_A',
    itemTitle: '测试题',
    itemOrder: 1,
    responseType: 'text',
    countsTowardTotal: true,
    cognitiveDomainCodes: [],
    versionTrace: null,
    config: {
      scoreRange: { min: 0, max: 1 },
      evidenceTypes: [],
      requiresTimer: false,
      supportsPhotoUpload: false,
      supportsHandwriting: false,
      requiresOperatorNote: false,
    },
    status: 'in_progress',
    draftRevision: 4,
    draftSavedAt: '2026-08-03T00:00:00.000Z',
    answerSource: 'clinician_recorded',
    rawResponse: null,
    structuredResponse: null,
    responseText: 'server',
    isMissing: false,
    stepResponses: [
      {
        stepCode: 'step-a',
        order: 1,
        actualValue: null,
        countsTowardItemScore: true,
        note: 'server step',
      },
      {
        stepCode: 'step-b',
        order: 2,
        actualValue: null,
        countsTowardItemScore: true,
        note: 'server step b',
      },
    ],
    promptResponses: [
      {
        promptType: 'repeat_instruction',
        order: 1,
        responseAfterPrompt: null,
        countsTowardScore: true,
        note: 'server prompt',
      },
      {
        promptType: 'other',
        order: 2,
        responseAfterPrompt: null,
        countsTowardScore: false,
        note: 'server prompt b',
      },
    ],
    timing: null,
    evidenceRequirements: [
      { evidenceType: 'photo', status: 'pending', attached: false },
    ],
    operatorNote: undefined,
    ...overrides,
  };
}

function applyRequest(
  item: ItemResponseExecution,
  request: UpdateItemResponseDraftRequest,
): ItemResponseExecution {
  return {
    ...item,
    draftRevision: item.draftRevision + 1,
    draftSavedAt: '2026-08-03T00:00:01.000Z',
    ...(request.rawResponse !== undefined
      ? { rawResponse: request.rawResponse }
      : {}),
    ...(request.structuredResponse !== undefined
      ? { structuredResponse: request.structuredResponse }
      : {}),
    ...(request.responseText !== undefined
      ? { responseText: request.responseText ?? undefined }
      : {}),
    ...(request.isMissing !== undefined
      ? { isMissing: request.isMissing }
      : {}),
    ...(request.missingReason !== undefined
      ? { missingReason: request.missingReason ?? undefined }
      : {}),
    ...(request.operatorNote !== undefined
      ? { operatorNote: request.operatorNote ?? undefined }
      : {}),
    ...(request.timing !== undefined ? { timing: request.timing } : {}),
    ...(request.markAsAnswered === true ? { status: 'answered' as const } : {}),
    stepResponses: item.stepResponses.map((step) => {
      const update = request.stepResponses?.find(
        (candidate) => candidate.stepCode === step.stepCode,
      );
      return update
        ? {
            ...step,
            ...(update.actualValue !== undefined
              ? { actualValue: update.actualValue }
              : {}),
            ...(update.note !== undefined
              ? { note: update.note ?? undefined }
              : {}),
          }
        : step;
    }),
    promptResponses: item.promptResponses.map((prompt) => {
      const update = request.promptResponses?.find(
        (candidate) =>
          candidate.promptType === prompt.promptType &&
          candidate.order === prompt.order,
      );
      return update
        ? {
            ...prompt,
            ...(update.responseAfterPrompt !== undefined
              ? { responseAfterPrompt: update.responseAfterPrompt }
              : {}),
            ...(update.note !== undefined
              ? { note: update.note ?? undefined }
              : {}),
          }
        : prompt;
    }),
  };
}

function createSaveResponse(
  item: ItemResponseExecution,
): UpdateItemResponseDraftResponse {
  return {
    itemResponse: item,
    progress: { totalItemCount: 1, answeredItemCount: item.status === 'answered' ? 1 : 0 },
  };
}

function createDetail(
  item: ItemResponseExecution,
): ScaleInstanceExecutionDetailResponse {
  return {
    visit: {
      id: 'visit-a',
      patientId: 'patient-a',
      subjectCode: 'SUBJECT_A',
      visitCode: 'VISIT_A',
      visitType: 'baseline',
      status: 'in_progress',
      assessmentDate: '2026-08-03',
      startedAt: null,
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
      voidedBy: null,
      operatorSnapshot: null,
    },
    scale: { code: 'SCALE_A', name: '测试量表', version: '1.0.0' },
    scaleInstance: {
      id: 'scale-instance-a',
      assessmentVisitId: 'visit-a',
      patientId: 'patient-a',
      subjectCode: 'SUBJECT_A',
      scaleCode: 'SCALE_A',
      scaleVersion: '1.0.0',
      instanceCode: 'INSTANCE_A',
      instanceNo: 1,
      status: 'in_progress',
      administrationMode: 'clinician_administered',
      versionTrace: null,
      startedAt: null,
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
      durationMs: null,
      operatorSnapshot: null,
      progress: { totalItemCount: 1, answeredItemCount: 0 },
    },
    groups: [],
    itemResponses: [item],
  };
}

type Harness = {
  clock: FakeClock;
  coordinator: ItemResponseAutosaveCoordinator;
  requests: UpdateItemResponseDraftRequest[];
  snapshots: () => Record<string, ItemResponseAutosaveSnapshot>;
  setOnline: (value: boolean) => void;
  readCount: () => number;
};

function createHarness(input: {
  item?: ItemResponseExecution;
  online?: boolean;
  isOnline?: () => boolean;
  save?: (
    item: ItemResponseExecution,
    request: UpdateItemResponseDraftRequest,
    callIndex: number,
  ) => Promise<UpdateItemResponseDraftResponse>;
  readLatest?: (signal: AbortSignal) => Promise<ScaleInstanceExecutionDetailResponse>;
  onServerItemAccepted?: (
    item: ItemResponseExecution,
    response: UpdateItemResponseDraftResponse | null,
    acceptedMode: ItemResponseAcceptedMode,
  ) => void;
  onExecutionSummaryRefreshed?: (
    detail: ScaleInstanceExecutionDetailResponse,
  ) => void;
} = {}): Harness {
  const clock = new FakeClock();
  const initialItem = input.item ?? createItem();
  let online = input.online ?? true;
  let currentSnapshots: Record<string, ItemResponseAutosaveSnapshot> = {};
  let reads = 0;
  const requests: UpdateItemResponseDraftRequest[] = [];
  const coordinator = new ItemResponseAutosaveCoordinator({
    clock,
    isOnline: input.isOnline ?? (() => online),
    save: async (_itemResponseId, request) => {
      requests.push(request);
      return input.save
        ? input.save(initialItem, request, requests.length)
        : createSaveResponse(applyRequest(initialItem, request));
    },
    readLatest: async (signal) => {
      reads += 1;
      return input.readLatest
        ? input.readLatest(signal)
        : createDetail(initialItem);
    },
    getErrorKind: (error) =>
      error instanceof AssessmentExecutionApiError ? error.kind : 'unknown',
    onChange: (snapshots) => {
      currentSnapshots = snapshots;
    },
    onServerItemAccepted: input.onServerItemAccepted ?? (() => undefined),
    onExecutionSummaryRefreshed:
      input.onExecutionSummaryRefreshed ?? (() => undefined),
    onUnauthorized: () => undefined,
  });
  coordinator.initialize([initialItem]);

  return {
    clock,
    coordinator,
    requests,
    snapshots: () => currentSnapshots,
    setOnline: (value) => {
      online = value;
    },
    readCount: () => reads,
  };
}

function updateText(harness: Harness, value: string, immediate = false): void {
  const draft = harness.coordinator.getDraft('item-response-a');
  expect(draft).not.toBeNull();
  harness.coordinator.updateDraft(
    'item-response-a',
    { ...draft!, responseText: value },
    { immediate },
  );
}

async function expectState(
  harness: Harness,
  state: ItemResponseAutosaveState,
): Promise<void> {
  await expect
    .poll(() => harness.snapshots()['item-response-a']?.state, {
      timeout: 1_000,
    })
    .toBe(state);
}

function createAttempt(
  request: UpdateItemResponseDraftRequest,
): ItemResponseSaveAttempt {
  return {
    attemptId: 'attempt-a',
    itemResponseId: 'item-response-a',
    expectedRevision: request.expectedRevision,
    request,
    draftSnapshot: createItemDraftState(createItem()),
    generation: 1,
    mediaGeneration: 0,
    mode: 'automatic',
  };
}

test('request construction uses the server revision and automatic saves omit completion', () => {
  const item = createItem({ draftRevision: 17 });
  const draft = { ...createItemDraftState(item), responseText: 'local' };
  const result = buildItemResponseDraftRequest(item, draft, false);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.input).toEqual({ expectedRevision: 17, responseText: 'local' });
  expect(result.input.markAsAnswered).toBeUndefined();
});

test('manual observation config preserves generic boolean behavior and requires all three reading facts to complete', () => {
  const genericBoolean = createItem({
    responseType: 'boolean',
    rawResponse: false,
    responseText: undefined,
  });
  expect(getManualObservationRecordConfig(genericBoolean.config)).toBeNull();

  const genericResult = buildItemResponseDraftRequest(
    genericBoolean,
    createItemDraftState(genericBoolean),
    true,
  );
  expect(genericResult.ok).toBe(true);

  const reading = createItem({
    itemCode: 'server-owned-reading-item',
    responseType: 'boolean',
    rawResponse: null,
    responseText: undefined,
    structuredResponse: null,
    config: {
      scoreRange: { min: 0, max: 1, step: 1 },
      evidenceTypes: [],
      requiresTimer: false,
      supportsPhotoUpload: false,
      supportsHandwriting: false,
      requiresOperatorNote: false,
      binaryManualDecision: { incorrectScore: 0, correctScore: 1 },
      manualObservationRecord: {
        booleanLabel: '闭眼动作',
        trueLabel: '已按要求闭眼',
        falseLabel: '未按要求闭眼',
        responseTextLabel: '患者实际阅读 / 观察',
        responseTextHelp:
          '记录患者实际念出的内容；如未能读出，请记录实际情况。',
        requireBooleanResponse: true,
        requireResponseText: true,
      },
    },
  });
  expect(getManualObservationRecordConfig(reading.config)).toEqual(
    reading.config.manualObservationRecord,
  );

  const incompleteDraft = {
    ...createItemDraftState(reading),
    responseText: '未能读出',
    binaryManualDecision: false,
  };
  expect(
    buildItemResponseDraftRequest(reading, incompleteDraft, true).ok,
  ).toBe(false);

  const completeResult = buildItemResponseDraftRequest(
    reading,
    { ...incompleteDraft, rawResponse: false },
    true,
  );
  expect(completeResult.ok).toBe(true);
  if (!completeResult.ok) return;
  expect(completeResult.input).toEqual({
    expectedRevision: 4,
    rawResponse: false,
    responseText: '未能读出',
    structuredResponse: {
      binaryManualDecision: { isCorrect: false },
    },
    markAsAnswered: true,
  });
});

test('serialization preserves the full six-field timing snapshot and rejects an unsafe revision', () => {
  const timing = {
    timerState: 'running' as const,
    startedAt: '2026-08-03T00:00:00.000Z',
    lastResumedAt: '2026-08-03T00:00:10.000Z',
    completedAt: null,
    durationMs: 10_000,
    timerSource: 'system' as const,
  };
  expect(
    serializeItemResponseDraftRequest({ expectedRevision: 9, timing }),
  ).toEqual({ expectedRevision: 9, timing });
  expect(() =>
    serializeItemResponseDraftRequest({ expectedRevision: -1, responseText: 'x' }),
  ).toThrow(AssessmentExecutionApiError);
});

test('serialization has an explicit allowlist for public draft fields', () => {
  const serialized = serializeItemResponseDraftRequest({
    expectedRevision: 2,
    responseText: 'local',
    operatorNote: 'note',
  });

  expect(Object.keys(serialized).sort()).toEqual([
    'expectedRevision',
    'operatorNote',
    'responseText',
  ]);
  for (const forbiddenKey of [
    'draftRevision',
    'draftSavedAt',
    'score',
    'evidenceRequirements',
    'metadata',
    'submissionWriteBarrier',
    'barrierId',
    'attemptId',
  ]) {
    expect(serialized).not.toHaveProperty(forbiddenKey);
  }
});

test('the API maps direct conflict and uncertain transport results without retrying', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ code: 'ITEM_RESPONSE_DRAFT_CONFLICT' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await expect(
      saveItemResponseDraft('p', 'v', 's', 'i', {
        expectedRevision: 1,
        responseText: 'local',
      }),
    ).rejects.toMatchObject({ kind: 'item_response_draft_conflict' });
    expect(calls).toBe(1);

    globalThis.fetch = async () => {
      calls += 1;
      throw new DOMException('aborted', 'AbortError');
    };
    await expect(
      saveItemResponseDraft('p', 'v', 's', 'i', {
        expectedRevision: 1,
        responseText: 'local',
      }),
    ).rejects.toMatchObject({ kind: 'request_outcome_uncertain' });
    expect(calls).toBe(2);

    globalThis.fetch = async () => {
      calls += 1;
      return new Response(null, { status: 503 });
    };
    await expect(
      saveItemResponseDraft('p', 'v', 's', 'i', {
        expectedRevision: 1,
        responseText: 'local',
      }),
    ).rejects.toMatchObject({ kind: 'request_outcome_uncertain', status: 503 });
    expect(calls).toBe(3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('scheduling uses 800ms debounce and caps continuous editing at 5000ms', () => {
  expect(ITEM_RESPONSE_AUTOSAVE_DEBOUNCE_MS).toBe(800);
  expect(ITEM_RESPONSE_AUTOSAVE_MAX_WAIT_MS).toBe(5_000);
  expect(
    getAutosaveScheduleDelay({ now: 700, firstDirtyAt: 0, lastEditedAt: 700 }),
  ).toBe(800);
  expect(
    getAutosaveScheduleDelay({ now: 4_900, firstDirtyAt: 0, lastEditedAt: 4_900 }),
  ).toBe(100);
});

test('a valid edit waits for debounce and then saves once', async () => {
  const harness = createHarness();
  updateText(harness, 'local');
  expect(harness.snapshots()['item-response-a'].state).toBe('queued');
  await harness.clock.advance(799);
  expect(harness.requests).toHaveLength(0);
  await harness.clock.advance(1);
  expect(harness.requests).toHaveLength(1);
  expect(harness.requests[0].expectedRevision).toBe(4);
});

test('explicit completion cancels debounce and uses the same queue with markAsAnswered', () => {
  const harness = createHarness();
  updateText(harness, 'complete answer');
  expect(harness.clock.pendingCount()).toBe(1);
  harness.coordinator.markAsAnswered('item-response-a');
  expect(harness.clock.pendingCount()).toBe(0);
  expect(harness.requests).toHaveLength(1);
  expect(harness.requests[0]).toEqual({
    expectedRevision: 4,
    responseText: 'complete answer',
    markAsAnswered: true,
  });
});

test('successful automatic, explicit, and mark-as-answered writes report their accepted modes', async () => {
  for (const scenario of [
    {
      expectedMode: 'automatic' as const,
      start: async (harness: Harness) => {
        updateText(harness, 'automatic');
        await harness.clock.advance(ITEM_RESPONSE_AUTOSAVE_DEBOUNCE_MS);
      },
    },
    {
      expectedMode: 'explicit' as const,
      start: (harness: Harness) => {
        updateText(harness, 'explicit');
        harness.coordinator.saveNow('item-response-a');
      },
    },
    {
      expectedMode: 'mark_answered' as const,
      start: (harness: Harness) =>
        harness.coordinator.markAsAnswered('item-response-a'),
    },
  ]) {
    const acceptedModes: ItemResponseAcceptedMode[] = [];
    const harness = createHarness({
      onServerItemAccepted: (_item, _response, acceptedMode) => {
        acceptedModes.push(acceptedMode);
      },
    });

    await scenario.start(harness);
    await expectState(harness, 'clean');
    expect(acceptedModes).toEqual([scenario.expectedMode]);
  }
});

test('an uncertain committed mark-as-answered write preserves its accepted mode', async () => {
  const committed = createItem({
    draftRevision: 5,
    status: 'answered',
  });
  const acceptedModes: ItemResponseAcceptedMode[] = [];
  const harness = createHarness({
    save: async () => {
      throw new AssessmentExecutionApiError('request_outcome_uncertain');
    },
    readLatest: async () => createDetail(committed),
    onServerItemAccepted: (_item, _response, acceptedMode) => {
      acceptedModes.push(acceptedMode);
    },
  });

  harness.coordinator.markAsAnswered('item-response-a');
  await expectState(harness, 'clean');
  expect(harness.requests).toHaveLength(1);
  expect(harness.readCount()).toBe(1);
  expect(acceptedModes).toEqual(['mark_answered']);
});

test('conflict reads and server-only conflict resolution report no accepted write mode', async () => {
  const latest = createItem({ draftRevision: 8, responseText: 'remote' });
  const acceptedModes: ItemResponseAcceptedMode[] = [];
  const harness = createHarness({
    save: async () => {
      throw new AssessmentExecutionApiError(
        'item_response_draft_conflict',
        409,
      );
    },
    readLatest: async () => createDetail(latest),
    onServerItemAccepted: (_item, _response, acceptedMode) => {
      acceptedModes.push(acceptedMode);
    },
  });

  updateText(harness, 'local', true);
  await expectState(harness, 'conflict');
  harness.coordinator.useServerConflictVersion('item-response-a');
  expect(acceptedModes).toEqual([null, null]);
});

test('only a server-accepted mark-as-answered write requests readiness refresh', () => {
  expect(
    shouldRefreshSubmissionReadinessAfterItemAcceptance('mark_answered'),
  ).toBe(true);
  expect(
    shouldRefreshSubmissionReadinessAfterItemAcceptance('automatic'),
  ).toBe(false);
  expect(
    shouldRefreshSubmissionReadinessAfterItemAcceptance('explicit'),
  ).toBe(false);
  expect(
    shouldRefreshSubmissionReadinessAfterItemAcceptance('conflict_local'),
  ).toBe(false);
  expect(shouldRefreshSubmissionReadinessAfterItemAcceptance(null)).toBe(false);
});

test('continuous input cannot move the first save beyond the max wait', async () => {
  const harness = createHarness();
  updateText(harness, '0');
  for (let index = 1; index <= 7; index += 1) {
    await harness.clock.advance(700);
    updateText(harness, String(index));
  }
  expect(harness.requests).toHaveLength(0);
  await harness.clock.advance(100);
  expect(harness.requests).toHaveLength(1);
});

test('one item has at most one active write and later edits form a trailing save', async () => {
  const firstWrite = deferred<UpdateItemResponseDraftResponse>();
  const harness = createHarness({
    save: async (item, request, callIndex) =>
      callIndex === 1
        ? firstWrite.promise
        : createSaveResponse(applyRequest(createItem({ ...item, draftRevision: 5, responseText: 'first' }), request)),
  });
  updateText(harness, 'first');
  await harness.clock.advance(800);
  updateText(harness, 'second');
  await harness.clock.advance(5_000);
  expect(harness.requests).toHaveLength(1);

  firstWrite.resolve(
    createSaveResponse(
      applyRequest(createItem(), harness.requests[0]),
    ),
  );
  await settleAsyncWork();
  await harness.clock.advance(800);
  expect(harness.requests).toHaveLength(2);
  expect(harness.requests[1]).toMatchObject({
    expectedRevision: 5,
    responseText: 'second',
  });
});

test('returning to the server value cancels a queued save', async () => {
  const harness = createHarness();
  updateText(harness, 'local');
  updateText(harness, 'server');
  expect(harness.snapshots()['item-response-a'].state).toBe('clean');
  expect(harness.clock.pendingCount()).toBe(0);
  await harness.clock.advance(5_000);
  expect(harness.requests).toHaveLength(0);
});

test('invalid content does not write and becomes queued after correction', async () => {
  const item = createItem({ responseType: 'number', rawResponse: 1, responseText: undefined });
  const harness = createHarness({ item });
  const draft = harness.coordinator.getDraft(item.id)!;
  harness.coordinator.updateDraft(item.id, {
    ...draft,
    rawResponseInput: 'not-a-number',
    rawResponseTouched: true,
  });
  expect(harness.snapshots()[item.id].state).toBe('invalid');
  await harness.clock.advance(5_000);
  expect(harness.requests).toHaveLength(0);

  harness.coordinator.updateDraft(item.id, {
    ...draft,
    rawResponseInput: '2',
    rawResponseTouched: true,
  });
  expect(harness.snapshots()[item.id].state).toBe('queued');
});

test('success rebase keeps fields edited after dispatch', () => {
  const item = createItem();
  const attemptDraft = { ...createItemDraftState(item), responseText: 'sent' };
  const currentDraft = { ...attemptDraft, operatorNote: 'edited later' };
  const server = createItem({
    draftRevision: 5,
    responseText: 'sent',
    operatorNote: 'server note',
  });
  const rebased = rebaseItemDraftAfterSave({ attemptDraft, currentDraft, serverItem: server });
  expect(rebased.responseText).toBe('sent');
  expect(rebased.operatorNote).toBe('edited later');
});

test('step and prompt rebase follows stable business keys rather than array order', () => {
  const item = createItem();
  const attemptDraft = createItemDraftState(item);
  const currentDraft = {
    ...attemptDraft,
    stepResponses: attemptDraft.stepResponses.map((step) =>
      step.stepCode === 'step-b' ? { ...step, note: 'local step b' } : step,
    ),
    promptResponses: attemptDraft.promptResponses.map((prompt) =>
      prompt.promptType === 'other' ? { ...prompt, note: 'local prompt b' } : prompt,
    ),
  };
  const server = createItem({
    draftRevision: 5,
    stepResponses: [...item.stepResponses].reverse().map((step) => ({ ...step, note: `new ${step.stepCode}` })),
    promptResponses: [...item.promptResponses].reverse().map((prompt) => ({ ...prompt, note: `new ${prompt.promptType}` })),
  });
  const rebased = rebaseItemDraftAfterSave({ attemptDraft, currentDraft, serverItem: server });
  expect(rebased.stepResponses.find((step) => step.stepCode === 'step-b')?.note).toBe('local step b');
  expect(rebased.stepResponses.find((step) => step.stepCode === 'step-a')?.note).toBe('new step-a');
  expect(rebased.promptResponses.find((prompt) => prompt.promptType === 'other')?.note).toBe('local prompt b');
});

test('an earlier epoch response cannot overwrite a reinitialized server baseline', async () => {
  const pendingWrite = deferred<UpdateItemResponseDraftResponse>();
  const harness = createHarness({ save: async () => pendingWrite.promise });
  updateText(harness, 'old attempt', true);
  expect(harness.requests).toHaveLength(1);
  harness.coordinator.initialize([createItem({ draftRevision: 20, responseText: 'new baseline' })]);
  pendingWrite.resolve(createSaveResponse(createItem({ draftRevision: 5, responseText: 'old attempt' })));
  await settleAsyncWork();
  expect(harness.snapshots()['item-response-a'].serverItem.draftRevision).toBe(20);
  expect(harness.snapshots()['item-response-a'].draft.responseText).toBe('new baseline');
});

test('a newer media generation preserves the current evidence requirement', () => {
  const responseItem = createItem({
    draftRevision: 5,
    evidenceRequirements: [{ evidenceType: 'photo', status: 'pending', attached: false }],
  });
  const currentItem = createItem({
    evidenceRequirements: [{ evidenceType: 'photo', status: 'attached', attached: true }],
  });
  expect(
    mergeDraftSaveMediaState({
      responseItem,
      currentServerItem: currentItem,
      attemptMediaGeneration: 0,
      currentMediaGeneration: 1,
    }).evidenceRequirements,
  ).toEqual(currentItem.evidenceRequirements);
});

test('direct conflict reads once, stops writes, and server choice sends no write', async () => {
  const latest = createItem({ draftRevision: 8, responseText: 'remote' });
  const harness = createHarness({
    save: async () => {
      throw new AssessmentExecutionApiError('item_response_draft_conflict', 409);
    },
    readLatest: async () => createDetail(latest),
  });
  updateText(harness, 'local', true);
  await settleAsyncWork();
  expect(harness.readCount()).toBe(1);
  expect(harness.snapshots()[latest.id].state).toBe('conflict');
  expect(harness.snapshots()[latest.id].draft.responseText).toBe('local');
  harness.coordinator.useServerConflictVersion(latest.id);
  expect(harness.requests).toHaveLength(1);
  expect(harness.snapshots()[latest.id].state).toBe('clean');
  expect(harness.snapshots()[latest.id].draft.responseText).toBe('remote');
});

test('local conflict choice writes once with the latest revision and does not loop after another conflict', async () => {
  let latest = createItem({ draftRevision: 8, responseText: 'remote one' });
  const harness = createHarness({
    save: async () => {
      throw new AssessmentExecutionApiError('item_response_draft_conflict', 409);
    },
    readLatest: async () => createDetail(latest),
  });
  updateText(harness, 'local', true);
  await expectState(harness, 'conflict');
  latest = createItem({ draftRevision: 9, responseText: 'remote two' });
  harness.coordinator.useLocalConflictVersion('item-response-a');
  await expectState(harness, 'conflict');
  expect(harness.requests).toHaveLength(2);
  expect(harness.requests[1]).toMatchObject({ expectedRevision: 8, responseText: 'local' });
  expect(harness.snapshots()['item-response-a'].state).toBe('conflict');
  expect(harness.readCount()).toBe(2);
});

test('local conflict choice preserves an explicit mark-as-answered intent', async () => {
  const latest = createItem({ draftRevision: 8, responseText: 'server' });
  let callIndex = 0;
  const harness = createHarness({
    save: async (_item, request) => {
      callIndex += 1;
      if (callIndex === 1) {
        throw new AssessmentExecutionApiError('item_response_draft_conflict', 409);
      }
      return createSaveResponse(applyRequest(latest, request));
    },
    readLatest: async () => createDetail(latest),
  });
  harness.coordinator.markAsAnswered('item-response-a');
  await expectState(harness, 'conflict');
  harness.coordinator.useLocalConflictVersion('item-response-a');
  await expectState(harness, 'clean');
  expect(harness.requests).toHaveLength(2);
  expect(harness.requests[1]).toEqual({
    expectedRevision: 8,
    markAsAnswered: true,
  });
});

test('uncertain reconciliation classifies not committed, committed, and conflict from sent fields only', () => {
  const request = { expectedRevision: 4, responseText: 'sent', operatorNote: 'note' };
  const attempt = createAttempt(request);
  const unchanged = createItem({ draftRevision: 4 });
  const committed = createItem({ draftRevision: 5, responseText: 'sent', operatorNote: 'note' });
  const divergent = createItem({ draftRevision: 5, responseText: 'other', operatorNote: 'note' });
  expect(classifyDraftSaveReconciliation(attempt, unchanged)).toBe('not_committed');
  expect(classifyDraftSaveReconciliation(attempt, committed)).toBe('committed');
  expect(classifyDraftSaveReconciliation(attempt, divergent)).toBe('conflict');
  expect(draftSaveAttemptFieldsMatchServer(attempt, {
    ...committed,
    evidenceRequirements: [{ evidenceType: 'photo', status: 'attached', attached: true }],
    structuredResponse: { ignored: true },
  })).toBe(true);
});

test('a confirmed committed uncertain write is accepted without resending', async () => {
  const committed = createItem({ draftRevision: 5, responseText: 'sent' });
  const harness = createHarness({
    save: async () => {
      throw new AssessmentExecutionApiError('request_outcome_uncertain');
    },
    readLatest: async () => createDetail(committed),
  });
  updateText(harness, 'sent', true);
  await expectState(harness, 'clean');
  expect(harness.requests).toHaveLength(1);
  expect(harness.snapshots()[committed.id].state).toBe('clean');
  expect(harness.snapshots()[committed.id].serverItem.draftRevision).toBe(5);
});

test('an uncertain reconciliation remains operation-level single-flight while its read is pending', async () => {
  const pendingRead = deferred<ScaleInstanceExecutionDetailResponse>();
  const committed = createItem({ draftRevision: 5, responseText: 'sent' });
  let acceptedCount = 0;
  const harness = createHarness({
    save: async () => {
      throw new AssessmentExecutionApiError('request_outcome_uncertain');
    },
    readLatest: async () => pendingRead.promise,
    onServerItemAccepted: () => {
      acceptedCount += 1;
    },
  });

  updateText(harness, 'sent', true);
  await settleAsyncWork();
  expect(harness.readCount()).toBe(1);
  expect(harness.requests).toHaveLength(1);
  expect(harness.snapshots()['item-response-a'].state).toBe('reconciling');

  harness.coordinator.retryServerCheck('item-response-a');
  harness.coordinator.retryServerCheck('item-response-a');
  harness.coordinator.onNetworkChange(true);
  await settleAsyncWork();
  expect(harness.readCount()).toBe(1);

  pendingRead.resolve(createDetail(committed));
  await expectState(harness, 'clean');
  expect(harness.readCount()).toBe(1);
  expect(harness.requests).toHaveLength(1);
  expect(acceptedCount).toBe(1);
  expect(
    harness.snapshots()['item-response-a'].serverItem.draftRevision,
  ).toBe(5);
});

test('a completed failed reconciliation releases single-flight for one later retry', async () => {
  const retryRead = deferred<ScaleInstanceExecutionDetailResponse>();
  const committed = createItem({ draftRevision: 5, responseText: 'sent' });
  let readAttempt = 0;
  let acceptedCount = 0;
  const harness = createHarness({
    save: async () => {
      throw new AssessmentExecutionApiError('request_outcome_uncertain');
    },
    readLatest: async () => {
      readAttempt += 1;
      if (readAttempt === 1) {
        throw new Error('read unavailable');
      }
      return retryRead.promise;
    },
    onServerItemAccepted: () => {
      acceptedCount += 1;
    },
  });

  updateText(harness, 'sent', true);
  await settleAsyncWork();
  expect(harness.readCount()).toBe(1);
  expect(harness.snapshots()['item-response-a'].state).toBe('reconciling');

  harness.coordinator.retryServerCheck('item-response-a');
  await settleAsyncWork();
  expect(harness.readCount()).toBe(2);

  harness.coordinator.retryServerCheck('item-response-a');
  harness.coordinator.retryServerCheck('item-response-a');
  harness.coordinator.onNetworkChange(true);
  await settleAsyncWork();
  expect(harness.readCount()).toBe(2);

  retryRead.resolve(createDetail(committed));
  await expectState(harness, 'clean');
  expect(harness.readCount()).toBe(2);
  expect(harness.requests).toHaveLength(1);
  expect(acceptedCount).toBe(1);
});

test('initialize invalidates a stale reconciliation result and permits a new run', async () => {
  const staleRead = deferred<ScaleInstanceExecutionDetailResponse>();
  const ownedSignals: AbortSignal[] = [];
  let readAttempt = 0;
  let acceptedCount = 0;
  let refreshedCount = 0;
  const replacement = createItem({
    draftRevision: 20,
    responseText: 'replacement baseline',
  });
  const harness = createHarness({
    save: async () => {
      throw new AssessmentExecutionApiError('request_outcome_uncertain');
    },
    readLatest: async (signal) => {
      ownedSignals.push(signal);
      readAttempt += 1;
      if (readAttempt === 1) {
        return staleRead.promise;
      }
      return createDetail(
        createItem({ draftRevision: 21, responseText: 'current edit' }),
      );
    },
    onServerItemAccepted: () => {
      acceptedCount += 1;
    },
    onExecutionSummaryRefreshed: () => {
      refreshedCount += 1;
    },
  });

  updateText(harness, 'stale edit', true);
  await settleAsyncWork();
  expect(harness.readCount()).toBe(1);
  harness.coordinator.initialize([replacement]);
  expect(ownedSignals[0].aborted).toBe(true);

  staleRead.resolve(
    createDetail(createItem({ draftRevision: 5, responseText: 'stale edit' })),
  );
  await settleAsyncWork();
  expect(acceptedCount).toBe(0);
  expect(refreshedCount).toBe(0);
  expect(harness.snapshots()['item-response-a'].state).toBe('clean');
  expect(
    harness.snapshots()['item-response-a'].serverItem.draftRevision,
  ).toBe(20);

  updateText(harness, 'current edit', true);
  await expectState(harness, 'clean');
  expect(harness.readCount()).toBe(2);
  expect(harness.requests).toHaveLength(2);
  expect(acceptedCount).toBe(1);
  expect(refreshedCount).toBe(1);
  expect(
    harness.snapshots()['item-response-a'].serverItem.draftRevision,
  ).toBe(21);
});

test('a confirmed uncommitted uncertain write schedules a new normal save only after the read', async () => {
  const harness = createHarness({
    save: async (_item, request, callIndex) => {
      if (callIndex === 1) {
        throw new AssessmentExecutionApiError('request_outcome_uncertain');
      }
      return createSaveResponse(applyRequest(createItem(), request));
    },
    readLatest: async () => createDetail(createItem({ draftRevision: 4 })),
  });
  updateText(harness, 'sent', true);
  await expectState(harness, 'queued');
  expect(harness.readCount()).toBe(1);
  expect(harness.requests).toHaveLength(1);
  expect(harness.snapshots()['item-response-a'].state).toBe('queued');
  await harness.clock.advance(800);
  expect(harness.requests).toHaveLength(2);
});

test('a failed uncertain read remains reconciling and sends no new write', async () => {
  const harness = createHarness({
    save: async () => {
      throw new AssessmentExecutionApiError('request_outcome_uncertain');
    },
    readLatest: async () => {
      throw new Error('read unavailable');
    },
  });
  updateText(harness, 'sent', true);
  await settleAsyncWork();
  expect(harness.snapshots()['item-response-a'].state).toBe('reconciling');
  expect(harness.requests).toHaveLength(1);
  harness.coordinator.retryServerCheck('item-response-a');
  await settleAsyncWork();
  expect(harness.requests).toHaveLength(1);
  expect(harness.readCount()).toBe(2);
});

test('known offline edits wait and reconnecting queues a normal write', async () => {
  const harness = createHarness({ online: false });
  updateText(harness, 'offline');
  expect(harness.snapshots()['item-response-a'].state).toBe('waiting_for_network');
  await harness.clock.advance(5_000);
  expect(harness.requests).toHaveLength(0);
  harness.setOnline(true);
  harness.coordinator.onNetworkChange(true);
  expect(harness.snapshots()['item-response-a'].state).toBe('queued');
  await harness.clock.advance(800);
  expect(harness.requests).toHaveLength(1);
});

test('an uncertain attempt returning online performs a read before any later write', async () => {
  let online = true;
  let readObserved = false;
  const harness = createHarness({
    isOnline: () => online,
    save: async () => {
      online = false;
      throw new AssessmentExecutionApiError('request_outcome_uncertain');
    },
    readLatest: async () => {
      readObserved = true;
      return createDetail(createItem({ draftRevision: 4 }));
    },
  });
  updateText(harness, 'sent', true);
  await settleAsyncWork();
  expect(readObserved).toBe(false);
  online = true;
  harness.coordinator.onNetworkChange(true);
  await settleAsyncWork();
  expect(readObserved).toBe(true);
  expect(harness.requests).toHaveLength(1);
});

test('all non-clean states block submission and unload with the blocked-state local-difference exception', () => {
  const states: ItemResponseAutosaveState[] = [
    'dirty',
    'invalid',
    'queued',
    'saving',
    'waiting_for_network',
    'reconciling',
    'conflict',
    'blocked',
  ];
  for (const state of states) {
    expect(autosaveStateBlocksSubmission(state, true)).toBe(true);
    expect(autosaveStateBlocksUnload(state, true)).toBe(true);
  }
  expect(autosaveStateBlocksSubmission('clean', false)).toBe(false);
  expect(autosaveStateBlocksSubmission('blocked', false)).toBe(false);
});

test('stop clears scheduled work and aborts an owned reconciliation read', async () => {
  const pendingRead = deferred<ScaleInstanceExecutionDetailResponse>();
  const ownedSignals: AbortSignal[] = [];
  const harness = createHarness({
    save: async () => {
      throw new AssessmentExecutionApiError('request_outcome_uncertain');
    },
    readLatest: async (signal) => {
      ownedSignals.push(signal);
      return pendingRead.promise;
    },
  });
  updateText(harness, 'queued');
  expect(harness.clock.pendingCount()).toBe(1);
  harness.coordinator.saveNow('item-response-a');
  await settleAsyncWork();
  expect(ownedSignals).toHaveLength(1);
  harness.coordinator.stop();
  expect(harness.clock.pendingCount()).toBe(0);
  expect(ownedSignals[0].aborted).toBe(true);
});

test('the coordinator runtime contains no persistent-storage channel for drafts', () => {
  const source = ItemResponseAutosaveCoordinator.toString();
  for (const forbiddenName of [
    `local${'Storage'}`,
    `session${'Storage'}`,
    `indexed${'DB'}`,
    `Cache${'Storage'}`,
  ]) {
    expect(source).not.toContain(forbiddenName);
  }
});
