import {
  buildItemResponseDraftRequest,
  createItemDraftState,
  type ItemDraftState,
} from '@/src/features/assessments/lib/item-response-draft';
import { createSystemItemTimerCheckpoint } from '@/src/features/assessments/lib/item-response-timer';
import type { ScaleInstanceExecutionDetailResponse } from '@/src/features/assessments/types/item-response-execution';
import type {
  ItemPromptDraft,
  ItemResponseDraftJsonValue,
  ItemResponseExecution,
  ItemStepDraft,
  ItemTimingDraft,
  StructuredManualResponse,
  UpdateItemResponseDraftRequest,
  UpdateItemResponseDraftResponse,
  UpdateItemStepDraftRequest,
  UpdatePromptResponseDraftRequest,
} from '@/src/features/assessments/types/item-response-execution';

export const ITEM_RESPONSE_AUTOSAVE_DEBOUNCE_MS = 800;
export const ITEM_RESPONSE_AUTOSAVE_MAX_WAIT_MS = 5_000;

export type ItemResponseAutosaveState =
  | 'clean'
  | 'dirty'
  | 'invalid'
  | 'queued'
  | 'saving'
  | 'waiting_for_network'
  | 'reconciling'
  | 'conflict'
  | 'blocked';

export type ItemResponseSaveAttempt = Readonly<{
  attemptId: string;
  itemResponseId: string;
  expectedRevision: number;
  request: UpdateItemResponseDraftRequest;
  draftSnapshot: ItemDraftState;
  generation: number;
  mediaGeneration: number;
  mode: 'automatic' | 'explicit' | 'mark_answered' | 'conflict_local';
}>;

export type ItemResponseAcceptedMode =
  | ItemResponseSaveAttempt['mode']
  | null;

export type ItemResponseAutosaveSnapshot = {
  state: ItemResponseAutosaveState;
  draft: ItemDraftState;
  serverItem: ItemResponseExecution;
  hasLocalChanges: boolean;
  validationMessage: string | null;
  message: string | null;
  conflictServerAvailable: boolean;
};

export type ItemResponseAutosaveSummary = {
  stateCounts: Record<ItemResponseAutosaveState, number>;
  unsettledCount: number;
  savingCount: number;
  shouldBlockUnload: boolean;
};

export type ItemResponseAutosaveClock = {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type ItemResponseAutosaveCoordinatorOptions = {
  clock: ItemResponseAutosaveClock;
  isOnline: () => boolean;
  save: (
    itemResponseId: string,
    request: UpdateItemResponseDraftRequest,
  ) => Promise<UpdateItemResponseDraftResponse>;
  readLatest: (
    signal: AbortSignal,
  ) => Promise<ScaleInstanceExecutionDetailResponse>;
  getErrorKind: (error: unknown) => string;
  onChange: (
    snapshots: Record<string, ItemResponseAutosaveSnapshot>,
    summary: ItemResponseAutosaveSummary,
  ) => void;
  onServerItemAccepted: (
    item: ItemResponseExecution,
    response: UpdateItemResponseDraftResponse | null,
    acceptedMode: ItemResponseAcceptedMode,
  ) => void;
  onExecutionSummaryRefreshed: (
    detail: ScaleInstanceExecutionDetailResponse,
  ) => void;
  onUnauthorized: () => void;
};

type PendingExplicitMode =
  | 'explicit'
  | 'mark_answered'
  | 'conflict_local'
  | null;

type ActiveReconciliationRun = {
  attemptId: string;
  promise: Promise<void>;
};

type AutosaveEntry = {
  serverItem: ItemResponseExecution;
  draft: ItemDraftState;
  state: ItemResponseAutosaveState;
  validationMessage: string | null;
  message: string | null;
  generation: number;
  mediaGeneration: number;
  firstDirtyAt: number | null;
  lastEditedAt: number | null;
  timerHandle: unknown | null;
  activeAttempt: ItemResponseSaveAttempt | null;
  uncertainAttempt: ItemResponseSaveAttempt | null;
  activeReconciliation: ActiveReconciliationRun | null;
  conflictServerItem: ItemResponseExecution | null;
  pendingExplicitMode: PendingExplicitMode;
};

export type DraftReconciliationResult =
  | 'not_committed'
  | 'committed'
  | 'conflict';

function jsonValuesEqual(
  left: ItemResponseDraftJsonValue,
  right: ItemResponseDraftJsonValue,
): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) =>
        jsonValuesEqual(value, right[index] ?? null),
      )
    );
  }

  if (
    left !== null &&
    right !== null &&
    typeof left === 'object' &&
    typeof right === 'object' &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(right, key) &&
          jsonValuesEqual(left[key], right[key]),
      )
    );
  }

  return false;
}

function cloneJsonValue(
  value: ItemResponseDraftJsonValue,
): ItemResponseDraftJsonValue {
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cloneJsonValue(child)]),
    );
  }

  return value;
}

function cloneStructuredManualResponse(
  response: StructuredManualResponse | null,
): StructuredManualResponse | null {
  return response
    ? {
        subItems: Object.fromEntries(
          Object.entries(response.subItems).map(([code, subItem]) => [
            code,
            { ...subItem },
          ]),
        ),
      }
    : null;
}

function structuredManualResponsesEqual(
  left: StructuredManualResponse | null,
  right: StructuredManualResponse | null,
): boolean {
  if (left === right) {
    return true;
  }

  if (left === null || right === null) {
    return false;
  }

  const leftCodes = Object.keys(left.subItems);
  const rightCodes = Object.keys(right.subItems);

  return (
    leftCodes.length === rightCodes.length &&
    leftCodes.every((code) => {
      const leftSubItem = left.subItems[code];
      const rightSubItem = right.subItems[code];
      return (
        leftSubItem !== undefined &&
        rightSubItem !== undefined &&
        leftSubItem.responseText === rightSubItem.responseText &&
        leftSubItem.isCorrect === rightSubItem.isCorrect
      );
    })
  );
}

export function cloneItemDraftState(draft: ItemDraftState): ItemDraftState {
  return {
    ...draft,
    rawResponse: cloneJsonValue(draft.rawResponse),
    structuredResponse: cloneStructuredManualResponse(
      draft.structuredResponse,
    ),
    stepResponses: draft.stepResponses.map((step) => ({ ...step })),
    promptResponses: draft.promptResponses.map((prompt) => ({ ...prompt })),
    timing: draft.timing ? { ...draft.timing } : null,
  };
}

function timingsEqual(
  left: ItemTimingDraft | null,
  right: ItemTimingDraft | null,
): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.timerState === right.timerState &&
      left.startedAt === right.startedAt &&
      left.lastResumedAt === right.lastResumedAt &&
      left.completedAt === right.completedAt &&
      left.durationMs === right.durationMs &&
      left.timerSource === right.timerSource)
  );
}

function stepKey(step: Pick<ItemStepDraft, 'stepCode'>): string {
  return step.stepCode;
}

function promptKey(
  prompt: Pick<ItemPromptDraft, 'promptType' | 'order'>,
): string {
  return `${prompt.promptType}:${prompt.order}`;
}

function rawDraftGroupEqual(
  left: ItemDraftState,
  right: ItemDraftState,
): boolean {
  return (
    jsonValuesEqual(left.rawResponse, right.rawResponse) &&
    left.rawResponseInput === right.rawResponseInput &&
    left.rawResponseTouched === right.rawResponseTouched
  );
}

export function rebaseItemDraftAfterSave(input: {
  attemptDraft: ItemDraftState;
  currentDraft: ItemDraftState;
  serverItem: ItemResponseExecution;
}): ItemDraftState {
  const serverDraft = createItemDraftState(input.serverItem);
  const next: ItemDraftState = {
    ...serverDraft,
    ...(rawDraftGroupEqual(input.currentDraft, input.attemptDraft)
      ? {}
      : {
          rawResponse: cloneJsonValue(input.currentDraft.rawResponse),
          rawResponseInput: input.currentDraft.rawResponseInput,
          rawResponseTouched: input.currentDraft.rawResponseTouched,
        }),
    responseText:
      input.currentDraft.responseText === input.attemptDraft.responseText
        ? serverDraft.responseText
        : input.currentDraft.responseText,
    structuredResponse: structuredManualResponsesEqual(
      input.currentDraft.structuredResponse,
      input.attemptDraft.structuredResponse,
    )
      ? serverDraft.structuredResponse
      : cloneStructuredManualResponse(input.currentDraft.structuredResponse),
    isMissing:
      input.currentDraft.isMissing === input.attemptDraft.isMissing
        ? serverDraft.isMissing
        : input.currentDraft.isMissing,
    missingReason:
      input.currentDraft.missingReason === input.attemptDraft.missingReason
        ? serverDraft.missingReason
        : input.currentDraft.missingReason,
    timing: timingsEqual(input.currentDraft.timing, input.attemptDraft.timing)
      ? serverDraft.timing
      : input.currentDraft.timing
        ? { ...input.currentDraft.timing }
        : null,
    operatorNote:
      input.currentDraft.operatorNote === input.attemptDraft.operatorNote
        ? serverDraft.operatorNote
        : input.currentDraft.operatorNote,
    stepResponses: [],
    promptResponses: [],
  };
  const attemptSteps = new Map(
    input.attemptDraft.stepResponses.map((step) => [stepKey(step), step]),
  );
  const currentSteps = new Map(
    input.currentDraft.stepResponses.map((step) => [stepKey(step), step]),
  );
  const rebasedStepKeys = new Set<string>();

  next.stepResponses = serverDraft.stepResponses.map((serverStep) => {
    const key = stepKey(serverStep);
    const attemptStep = attemptSteps.get(key);
    const currentStep = currentSteps.get(key);
    rebasedStepKeys.add(key);

    if (!attemptStep || !currentStep) {
      return serverStep;
    }

    return {
      ...serverStep,
      ...(currentStep.actualValueInput === attemptStep.actualValueInput &&
      currentStep.actualValueTouched === attemptStep.actualValueTouched
        ? {}
        : {
            actualValueInput: currentStep.actualValueInput,
            actualValueTouched: currentStep.actualValueTouched,
          }),
      note:
        currentStep.note === attemptStep.note
          ? serverStep.note
          : currentStep.note,
    };
  });
  input.currentDraft.stepResponses.forEach((step) => {
    if (!rebasedStepKeys.has(stepKey(step))) {
      next.stepResponses.push({ ...step });
    }
  });

  const attemptPrompts = new Map(
    input.attemptDraft.promptResponses.map((prompt) => [
      promptKey(prompt),
      prompt,
    ]),
  );
  const currentPrompts = new Map(
    input.currentDraft.promptResponses.map((prompt) => [
      promptKey(prompt),
      prompt,
    ]),
  );
  const rebasedPromptKeys = new Set<string>();

  next.promptResponses = serverDraft.promptResponses.map((serverPrompt) => {
    const key = promptKey(serverPrompt);
    const attemptPrompt = attemptPrompts.get(key);
    const currentPrompt = currentPrompts.get(key);
    rebasedPromptKeys.add(key);

    if (!attemptPrompt || !currentPrompt) {
      return serverPrompt;
    }

    return {
      ...serverPrompt,
      ...(currentPrompt.responseAfterPromptInput ===
        attemptPrompt.responseAfterPromptInput &&
      currentPrompt.responseAfterPromptTouched ===
        attemptPrompt.responseAfterPromptTouched
        ? {}
        : {
            responseAfterPromptInput: currentPrompt.responseAfterPromptInput,
            responseAfterPromptTouched:
              currentPrompt.responseAfterPromptTouched,
          }),
      note:
        currentPrompt.note === attemptPrompt.note
          ? serverPrompt.note
          : currentPrompt.note,
    };
  });
  input.currentDraft.promptResponses.forEach((prompt) => {
    if (!rebasedPromptKeys.has(promptKey(prompt))) {
      next.promptResponses.push({ ...prompt });
    }
  });

  return next;
}

export function mergeDraftSaveMediaState(input: {
  responseItem: ItemResponseExecution;
  currentServerItem: ItemResponseExecution;
  attemptMediaGeneration: number;
  currentMediaGeneration: number;
}): ItemResponseExecution {
  if (input.attemptMediaGeneration === input.currentMediaGeneration) {
    return input.responseItem;
  }

  return {
    ...input.responseItem,
    evidenceRequirements: input.currentServerItem.evidenceRequirements.map(
      (requirement) => ({ ...requirement }),
    ),
  };
}

function optionalTextMatches(
  request: string | null,
  server: string | undefined,
): boolean {
  return request === (server ?? null);
}

function stepRequestMatchesServer(
  request: UpdateItemStepDraftRequest,
  server: ItemStepDraft,
): boolean {
  return (
    (request.actualValue === undefined ||
      jsonValuesEqual(request.actualValue, server.actualValue)) &&
    (request.note === undefined || optionalTextMatches(request.note, server.note))
  );
}

function promptRequestMatchesServer(
  request: UpdatePromptResponseDraftRequest,
  server: ItemPromptDraft,
): boolean {
  return (
    (request.responseAfterPrompt === undefined ||
      jsonValuesEqual(request.responseAfterPrompt, server.responseAfterPrompt)) &&
    (request.note === undefined || optionalTextMatches(request.note, server.note))
  );
}

export function draftSaveAttemptFieldsMatchServer(
  attempt: ItemResponseSaveAttempt,
  server: ItemResponseExecution,
): boolean {
  const request = attempt.request;

  if (
    (request.rawResponse !== undefined &&
      !jsonValuesEqual(request.rawResponse, server.rawResponse)) ||
    (request.structuredResponse !== undefined &&
      !jsonValuesEqual(
        request.structuredResponse,
        server.structuredResponse,
      )) ||
    (request.responseText !== undefined &&
      !optionalTextMatches(request.responseText, server.responseText)) ||
    (request.isMissing !== undefined &&
      request.isMissing !== server.isMissing) ||
    (request.missingReason !== undefined &&
      !optionalTextMatches(request.missingReason, server.missingReason)) ||
    (request.operatorNote !== undefined &&
      !optionalTextMatches(request.operatorNote, server.operatorNote)) ||
    (request.timing !== undefined &&
      !timingsEqual(request.timing, server.timing)) ||
    (request.markAsAnswered === true &&
      !['answered', 'scored', 'locked'].includes(server.status))
  ) {
    return false;
  }

  if (
    request.stepResponses?.some((step) => {
      const serverStep = server.stepResponses.find(
        (candidate) => candidate.stepCode === step.stepCode,
      );
      return !serverStep || !stepRequestMatchesServer(step, serverStep);
    })
  ) {
    return false;
  }

  return !request.promptResponses?.some((prompt) => {
    const serverPrompt = server.promptResponses.find(
      (candidate) =>
        candidate.promptType === prompt.promptType &&
        candidate.order === prompt.order,
    );
    return !serverPrompt || !promptRequestMatchesServer(prompt, serverPrompt);
  });
}

export function classifyDraftSaveReconciliation(
  attempt: ItemResponseSaveAttempt,
  server: ItemResponseExecution,
): DraftReconciliationResult {
  if (server.draftRevision === attempt.expectedRevision) {
    return 'not_committed';
  }

  if (
    server.draftRevision === attempt.expectedRevision + 1 &&
    draftSaveAttemptFieldsMatchServer(attempt, server)
  ) {
    return 'committed';
  }

  return 'conflict';
}

export function shouldRefreshSubmissionReadinessAfterItemAcceptance(
  acceptedMode: ItemResponseAcceptedMode,
): boolean {
  return acceptedMode === 'mark_answered';
}

export function autosaveStateBlocksSubmission(
  state: ItemResponseAutosaveState,
  hasLocalChanges: boolean,
): boolean {
  return state !== 'clean' && (state !== 'blocked' || hasLocalChanges);
}

export function autosaveStateBlocksUnload(
  state: ItemResponseAutosaveState,
  hasLocalChanges: boolean,
): boolean {
  return autosaveStateBlocksSubmission(state, hasLocalChanges);
}

export function getAutosaveScheduleDelay(input: {
  now: number;
  firstDirtyAt: number;
  lastEditedAt: number;
  debounceMs?: number;
  maxWaitMs?: number;
}): number {
  const debounceAt =
    input.lastEditedAt +
    (input.debounceMs ?? ITEM_RESPONSE_AUTOSAVE_DEBOUNCE_MS);
  const maxWaitAt =
    input.firstDirtyAt +
    (input.maxWaitMs ?? ITEM_RESPONSE_AUTOSAVE_MAX_WAIT_MS);

  return Math.max(0, Math.min(debounceAt, maxWaitAt) - input.now);
}

function cloneRequest(
  request: UpdateItemResponseDraftRequest,
): UpdateItemResponseDraftRequest {
  return {
    ...request,
    ...(request.rawResponse !== undefined
      ? { rawResponse: cloneJsonValue(request.rawResponse) }
      : {}),
    ...(request.structuredResponse !== undefined
      ? {
          structuredResponse:
            request.structuredResponse === null
              ? null
              : (cloneJsonValue(request.structuredResponse) as {
                  [key: string]: ItemResponseDraftJsonValue;
                }),
        }
      : {}),
    ...(request.stepResponses
      ? { stepResponses: request.stepResponses.map((step) => ({ ...step })) }
      : {}),
    ...(request.promptResponses
      ? {
          promptResponses: request.promptResponses.map((prompt) => ({
            ...prompt,
          })),
        }
      : {}),
    ...(request.timing !== undefined
      ? { timing: request.timing ? { ...request.timing } : null }
      : {}),
  };
}

export class ItemResponseAutosaveCoordinator {
  private readonly entries = new Map<string, AutosaveEntry>();
  private readonly readControllers = new Set<AbortController>();
  private stopped = false;
  private writesEnabled = true;
  private attemptSequence = 0;
  private epoch = 0;

  constructor(private readonly options: ItemResponseAutosaveCoordinatorOptions) {}

  initialize(items: ItemResponseExecution[]): void {
    this.clearAllTimers();
    this.abortReads();
    this.epoch += 1;
    this.entries.clear();
    this.stopped = false;

    items.forEach((item) => {
      this.entries.set(item.id, {
        serverItem: item,
        draft: createItemDraftState(item),
        state: 'clean',
        validationMessage: null,
        message: null,
        generation: 0,
        mediaGeneration: 0,
        firstDirtyAt: null,
        lastEditedAt: null,
        timerHandle: null,
        activeAttempt: null,
        uncertainAttempt: null,
        activeReconciliation: null,
        conflictServerItem: null,
        pendingExplicitMode: null,
      });
    });
    this.emit();
  }

  setWritesEnabled(enabled: boolean): void {
    this.writesEnabled = enabled;

    if (!enabled) {
      this.entries.forEach((entry) => {
        this.clearTimer(entry);
        const build = buildItemResponseDraftRequest(
          entry.serverItem,
          entry.draft,
          false,
        );

        if (!entry.activeAttempt && (!build.ok || build.hasChanges)) {
          entry.state = 'blocked';
          entry.message = '当前记录已不可编辑，本地内容仅供查看。';
        }
      });
      this.emit();
    }
  }

  getDraft(itemResponseId: string): ItemDraftState | null {
    const draft = this.entries.get(itemResponseId)?.draft;
    return draft ? cloneItemDraftState(draft) : null;
  }

  getSnapshots(): Record<string, ItemResponseAutosaveSnapshot> {
    return this.createSnapshots();
  }

  updateDraft(
    itemResponseId: string,
    draft: ItemDraftState,
    options: { immediate?: boolean } = {},
  ): void {
    const entry = this.entries.get(itemResponseId);

    if (!entry || this.stopped) {
      return;
    }

    const now = this.options.clock.now();
    entry.draft = cloneItemDraftState(draft);
    entry.generation += 1;
    entry.firstDirtyAt ??= now;
    entry.lastEditedAt = now;
    entry.message = null;
    this.evaluateEntry(entry, options.immediate ? 'explicit' : null);
  }

  saveNow(itemResponseId: string): void {
    this.flush(itemResponseId, 'explicit');
  }

  markAsAnswered(itemResponseId: string): void {
    this.flush(itemResponseId, 'mark_answered');
  }

  flushQueued(itemResponseIds: readonly string[]): void {
    itemResponseIds.forEach((itemResponseId) => {
      const entry = this.entries.get(itemResponseId);

      if (entry && ['dirty', 'queued'].includes(entry.state)) {
        this.flush(itemResponseId, 'explicit');
      }
    });
  }

  notifyMediaRequirement(
    itemResponseId: string,
    requirement: ItemResponseExecution['evidenceRequirements'][number],
    persisted: boolean,
  ): void {
    const entry = this.entries.get(itemResponseId);

    if (!entry) {
      return;
    }

    if (persisted) {
      entry.mediaGeneration += 1;
    }

    entry.serverItem = {
      ...entry.serverItem,
      evidenceRequirements: entry.serverItem.evidenceRequirements.map(
        (current) =>
          current.evidenceType === requirement.evidenceType
            ? { ...requirement }
            : current,
      ),
    };
  }

  onNetworkChange(online: boolean): void {
    if (!online || this.stopped) {
      return;
    }

    this.entries.forEach((entry) => {
      if (entry.state === 'reconciling' && entry.uncertainAttempt) {
        void this.reconcileUncertain(entry);
      } else if (entry.state === 'waiting_for_network') {
        this.evaluateEntry(entry, entry.pendingExplicitMode);
      }
    });
  }

  retryServerCheck(itemResponseId: string): void {
    const entry = this.entries.get(itemResponseId);

    if (!entry || !this.options.isOnline()) {
      return;
    }

    if (entry.uncertainAttempt) {
      void this.reconcileUncertain(entry);
    } else if (entry.state === 'conflict') {
      void this.refreshConflict(entry);
    } else if (entry.state === 'blocked') {
      void this.refreshBlocked(entry);
    }
  }

  useServerConflictVersion(itemResponseId: string): void {
    const entry = this.entries.get(itemResponseId);

    if (!entry?.conflictServerItem || entry.state !== 'conflict') {
      return;
    }

    entry.serverItem = entry.conflictServerItem;
    entry.draft = createItemDraftState(entry.conflictServerItem);
    entry.conflictServerItem = null;
    entry.uncertainAttempt = null;
    entry.pendingExplicitMode = null;
    entry.firstDirtyAt = null;
    entry.lastEditedAt = null;
    entry.validationMessage = null;
    entry.message = '已采用最新服务器版本，未发送保存请求。';
    entry.state = 'clean';
    this.options.onServerItemAccepted(entry.serverItem, null, null);
    this.emit();
  }

  useLocalConflictVersion(itemResponseId: string): void {
    const entry = this.entries.get(itemResponseId);

    if (!entry?.conflictServerItem || entry.state !== 'conflict') {
      return;
    }

    entry.serverItem = entry.conflictServerItem;
    entry.conflictServerItem = null;
    entry.uncertainAttempt = null;
    entry.firstDirtyAt = this.options.clock.now();
    entry.lastEditedAt = entry.firstDirtyAt;
    entry.state = 'dirty';
    this.options.onServerItemAccepted(entry.serverItem, null, null);
    this.evaluateEntry(entry, 'conflict_local');
  }

  checkpointRunningTimers(now: number): void {
    if (!this.writesEnabled || this.stopped) {
      return;
    }

    this.entries.forEach((entry, itemResponseId) => {
      const checkpoint = createSystemItemTimerCheckpoint(
        entry.draft.timing,
        now,
      );

      if (checkpoint) {
        this.updateDraft(
          itemResponseId,
          { ...entry.draft, timing: checkpoint },
          { immediate: true },
        );
      }
    });
  }

  stop(): void {
    this.stopped = true;
    this.clearAllTimers();
    this.abortReads();
    this.entries.clear();
  }

  private flush(itemResponseId: string, mode: Exclude<PendingExplicitMode, null>) {
    const entry = this.entries.get(itemResponseId);

    if (!entry || this.stopped) {
      return;
    }

    this.clearTimer(entry);
    this.evaluateEntry(entry, mode);
  }

  private evaluateEntry(
    entry: AutosaveEntry,
    explicitMode: PendingExplicitMode,
  ): void {
    if (explicitMode) {
      if (
        entry.pendingExplicitMode !== 'mark_answered' ||
        explicitMode === 'mark_answered'
      ) {
        entry.pendingExplicitMode = explicitMode;
      }
    }

    if (
      entry.state === 'conflict' ||
      entry.state === 'reconciling' ||
      (entry.state === 'blocked' && !this.writesEnabled)
    ) {
      this.emit();
      return;
    }

    const markAsAnswered = entry.pendingExplicitMode === 'mark_answered';
    const build = buildItemResponseDraftRequest(
      entry.serverItem,
      entry.draft,
      markAsAnswered,
    );

    if (!build.ok) {
      this.clearTimer(entry);
      entry.validationMessage = build.message;
      entry.state = entry.activeAttempt ? 'saving' : 'invalid';
      this.emit();
      return;
    }

    entry.validationMessage = null;

    if (!build.hasChanges) {
      this.clearTimer(entry);

      if (entry.activeAttempt) {
        entry.state = 'saving';
      } else {
        entry.state = 'clean';
        entry.pendingExplicitMode = null;
        entry.firstDirtyAt = null;
        entry.lastEditedAt = null;
      }

      this.emit();
      return;
    }

    if (!this.writesEnabled) {
      this.clearTimer(entry);
      entry.state = 'blocked';
      entry.message = '当前记录已不可编辑，本地内容仅供查看。';
      this.emit();
      return;
    }

    if (entry.activeAttempt) {
      entry.state = 'saving';
      this.emit();
      return;
    }

    if (!this.options.isOnline()) {
      this.clearTimer(entry);
      entry.state = 'waiting_for_network';
      this.emit();
      return;
    }

    if (entry.pendingExplicitMode) {
      void this.startAttempt(entry, entry.pendingExplicitMode);
      return;
    }

    const now = this.options.clock.now();
    entry.firstDirtyAt ??= now;
    entry.lastEditedAt ??= now;
    entry.state = 'queued';
    this.clearTimer(entry);
    const delay = getAutosaveScheduleDelay({
      now,
      firstDirtyAt: entry.firstDirtyAt,
      lastEditedAt: entry.lastEditedAt,
    });
    entry.timerHandle = this.options.clock.setTimeout(() => {
      entry.timerHandle = null;
      void this.startAttempt(entry, 'automatic');
    }, delay);
    this.emit();
  }

  private async startAttempt(
    entry: AutosaveEntry,
    mode: ItemResponseSaveAttempt['mode'],
  ): Promise<void> {
    if (entry.activeAttempt || this.stopped) {
      return;
    }

    if (!this.options.isOnline()) {
      entry.state = 'waiting_for_network';
      entry.pendingExplicitMode = mode === 'automatic' ? null : mode;
      this.emit();
      return;
    }

    const build = buildItemResponseDraftRequest(
      entry.serverItem,
      entry.draft,
      mode === 'mark_answered',
    );

    if (!build.ok) {
      entry.validationMessage = build.message;
      entry.state = 'invalid';
      this.emit();
      return;
    }

    if (!build.hasChanges) {
      entry.state = 'clean';
      entry.pendingExplicitMode = null;
      entry.firstDirtyAt = null;
      entry.lastEditedAt = null;
      this.emit();
      return;
    }

    const attempt: ItemResponseSaveAttempt = {
      attemptId: `${this.epoch}-${++this.attemptSequence}`,
      itemResponseId: entry.serverItem.id,
      expectedRevision: entry.serverItem.draftRevision,
      request: cloneRequest(build.input),
      draftSnapshot: cloneItemDraftState(entry.draft),
      generation: entry.generation,
      mediaGeneration: entry.mediaGeneration,
      mode,
    };
    const attemptEpoch = this.epoch;
    entry.activeAttempt = attempt;
    entry.pendingExplicitMode = null;
    entry.firstDirtyAt = null;
    entry.lastEditedAt = null;
    entry.state = 'saving';
    entry.message = null;
    this.emit();

    try {
      const response = await this.options.save(
        attempt.itemResponseId,
        cloneRequest(attempt.request),
      );

      if (
        this.stopped ||
        attemptEpoch !== this.epoch ||
        entry.activeAttempt?.attemptId !== attempt.attemptId
      ) {
        return;
      }

      this.acceptCommittedItem(entry, attempt, response.itemResponse, response);
    } catch (error: unknown) {
      if (
        this.stopped ||
        attemptEpoch !== this.epoch ||
        entry.activeAttempt?.attemptId !== attempt.attemptId
      ) {
        return;
      }

      entry.activeAttempt = null;
      const kind = this.options.getErrorKind(error);

      if (kind === 'unauthenticated') {
        entry.state = 'blocked';
        this.options.onUnauthorized();
        this.emit();
      } else if (kind === 'request_outcome_uncertain') {
        entry.uncertainAttempt = attempt;
        entry.state = 'reconciling';
        entry.message = '保存结果尚未确认，正在只读核对服务器。';
        this.emit();
        await this.reconcileUncertain(entry);
      } else if (kind === 'item_response_draft_conflict') {
        if (attempt.mode === 'mark_answered') {
          entry.pendingExplicitMode = 'mark_answered';
        }
        entry.state = 'reconciling';
        entry.message = '服务器版本已变化，正在读取最新事实。';
        this.emit();
        await this.refreshConflict(entry);
      } else if (kind === 'scale_instance_not_editable') {
        this.setWritesEnabled(false);
        entry.state = 'blocked';
        entry.message = '当前记录已不可编辑，本地修改仍被保留。';
        this.emit();
        await this.refreshBlocked(entry);
      } else {
        entry.state = 'blocked';
        entry.message = '草稿未保存，请核对内容或服务器状态后再处理。';
        this.emit();
      }
    }
  }

  private acceptCommittedItem(
    entry: AutosaveEntry,
    attempt: ItemResponseSaveAttempt,
    responseItem: ItemResponseExecution,
    response: UpdateItemResponseDraftResponse | null,
  ): void {
    const mergedItem = mergeDraftSaveMediaState({
      responseItem,
      currentServerItem: entry.serverItem,
      attemptMediaGeneration: attempt.mediaGeneration,
      currentMediaGeneration: entry.mediaGeneration,
    });
    entry.draft = rebaseItemDraftAfterSave({
      attemptDraft: attempt.draftSnapshot,
      currentDraft: entry.draft,
      serverItem: mergedItem,
    });
    entry.serverItem = mergedItem;
    entry.activeAttempt = null;
    entry.uncertainAttempt = null;
    entry.conflictServerItem = null;
    entry.validationMessage = null;
    entry.state = 'dirty';
    entry.message =
      attempt.mode === 'mark_answered'
        ? '本题已由服务器保存并标记完成。'
        : '草稿已由服务器确认保存。';
    this.options.onServerItemAccepted(mergedItem, response, attempt.mode);
    this.evaluateEntry(entry, entry.pendingExplicitMode);
  }

  private reconcileUncertain(entry: AutosaveEntry): Promise<void> {
    const attempt = entry.uncertainAttempt;

    if (!attempt || this.stopped || !this.options.isOnline()) {
      return Promise.resolve();
    }

    if (entry.activeReconciliation?.attemptId === attempt.attemptId) {
      return entry.activeReconciliation.promise;
    }

    const runEpoch = this.epoch;
    const itemResponseId = entry.serverItem.id;
    const run: ActiveReconciliationRun = {
      attemptId: attempt.attemptId,
      promise: Promise.resolve(),
    };
    entry.activeReconciliation = run;
    run.promise = Promise.resolve()
      .then(() =>
        this.runUncertainReconciliation({
          entry,
          attempt,
          run,
          runEpoch,
          itemResponseId,
        }),
      )
      .finally(() => {
        if (entry.activeReconciliation === run) {
          entry.activeReconciliation = null;
        }
      });
    return run.promise;
  }

  private async runUncertainReconciliation(input: {
    entry: AutosaveEntry;
    attempt: ItemResponseSaveAttempt;
    run: ActiveReconciliationRun;
    runEpoch: number;
    itemResponseId: string;
  }): Promise<void> {
    const { entry, attempt, run, runEpoch, itemResponseId } = input;
    entry.state = 'reconciling';
    this.emit();
    const detail = await this.readLatestDetail();

    if (
      !this.isCurrentReconciliationRun({
        entry,
        attempt,
        run,
        runEpoch,
        itemResponseId,
      })
    ) {
      return;
    }

    if (!detail) {
      entry.state = 'reconciling';
      entry.message = '暂时无法核对服务器；不会发送新的保存请求。';
      this.emit();
      return;
    }

    this.options.onExecutionSummaryRefreshed(detail);
    if (
      !this.isCurrentReconciliationRun({
        entry,
        attempt,
        run,
        runEpoch,
        itemResponseId,
      })
    ) {
      return;
    }

    this.integrateCleanItems(detail, itemResponseId, () =>
      this.isCurrentReconciliationRun({
        entry,
        attempt,
        run,
        runEpoch,
        itemResponseId,
      }),
    );
    if (
      !this.isCurrentReconciliationRun({
        entry,
        attempt,
        run,
        runEpoch,
        itemResponseId,
      })
    ) {
      return;
    }

    const latest =
      detail.itemResponses.find((item) => item.id === itemResponseId) ?? null;
    if (!latest) {
      entry.state = 'reconciling';
      entry.message = '暂时无法核对服务器；不会发送新的保存请求。';
      this.emit();
      return;
    }

    const result = classifyDraftSaveReconciliation(attempt, latest);

    if (result === 'committed') {
      this.acceptCommittedItem(entry, attempt, latest, null);
      return;
    }

    if (result === 'not_committed') {
      entry.serverItem = latest;
      entry.uncertainAttempt = null;
      if (attempt.mode === 'mark_answered') {
        entry.pendingExplicitMode = 'mark_answered';
      }
      entry.message = '服务器确认上次请求未提交，已保留本地草稿。';
      entry.firstDirtyAt = this.options.clock.now();
      entry.lastEditedAt = entry.firstDirtyAt;
      entry.state = 'dirty';
      this.options.onServerItemAccepted(latest, null, null);
      this.evaluateEntry(entry, null);
      return;
    }

    entry.serverItem = latest;
    entry.conflictServerItem = latest;
    entry.uncertainAttempt = null;
    if (attempt.mode === 'mark_answered') {
      entry.pendingExplicitMode = 'mark_answered';
    }
    entry.state = 'conflict';
    entry.message = '服务器事实与本次保存尝试不一致，系统没有自动覆盖任何一方。';
    this.options.onServerItemAccepted(latest, null, null);
    this.emit();
  }

  private isCurrentReconciliationRun(input: {
    entry: AutosaveEntry;
    attempt: ItemResponseSaveAttempt;
    run: ActiveReconciliationRun;
    runEpoch: number;
    itemResponseId: string;
  }): boolean {
    const { entry, attempt, run, runEpoch, itemResponseId } = input;
    return (
      !this.stopped &&
      this.epoch === runEpoch &&
      this.entries.get(itemResponseId) === entry &&
      entry.uncertainAttempt?.attemptId === attempt.attemptId &&
      entry.activeReconciliation === run
    );
  }

  private async refreshConflict(entry: AutosaveEntry): Promise<void> {
    const latest = await this.readLatestItem(entry.serverItem.id);

    entry.activeAttempt = null;
    entry.uncertainAttempt = null;
    entry.state = 'conflict';

    if (latest) {
      entry.serverItem = latest;
      entry.conflictServerItem = latest;
      entry.message = '服务器版本已发生变化；本地修改仍被保留，系统不会自动覆盖任何一方。';
      this.options.onServerItemAccepted(latest, null, null);
    } else {
      entry.conflictServerItem = null;
      entry.message = '发现版本冲突，但暂时无法读取最新服务器版本。';
    }

    this.emit();
  }

  private async refreshBlocked(entry: AutosaveEntry): Promise<void> {
    const latest = await this.readLatestItem(entry.serverItem.id);

    if (latest) {
      entry.serverItem = latest;
      this.options.onServerItemAccepted(latest, null, null);
    }

    entry.state = 'blocked';
    entry.message = latest
      ? '服务器确认当前记录已不可编辑，本地内容仍被保留。'
      : '当前记录已不可编辑，且暂时无法刷新服务器事实。';
    this.emit();
  }

  private async readLatestItem(
    itemResponseId: string,
  ): Promise<ItemResponseExecution | null> {
    const detail = await this.readLatestDetail();

    if (!detail) {
      return null;
    }

    this.options.onExecutionSummaryRefreshed(detail);
    this.integrateCleanItems(detail, itemResponseId);
    return (
      detail.itemResponses.find((item) => item.id === itemResponseId) ?? null
    );
  }

  private async readLatestDetail(): Promise<ScaleInstanceExecutionDetailResponse | null> {
    const controller = new AbortController();
    this.readControllers.add(controller);

    try {
      const detail = await this.options.readLatest(controller.signal);

      if (this.stopped || controller.signal.aborted) {
        return null;
      }

      return detail;
    } catch {
      return null;
    } finally {
      this.readControllers.delete(controller);
    }
  }

  private integrateCleanItems(
    detail: ScaleInstanceExecutionDetailResponse,
    excludedItemResponseId: string,
    shouldContinue: () => boolean = () => true,
  ): void {
    detail.itemResponses.forEach((item) => {
      if (!shouldContinue()) {
        return;
      }

      const entry = this.entries.get(item.id);

      if (
        !entry ||
        item.id === excludedItemResponseId ||
        entry.state !== 'clean' ||
        entry.activeAttempt
      ) {
        return;
      }

      entry.serverItem = item;
      entry.draft = createItemDraftState(item);
      this.options.onServerItemAccepted(item, null, null);
    });
  }

  private createSnapshots(): Record<string, ItemResponseAutosaveSnapshot> {
    return Object.fromEntries(
      [...this.entries.entries()].map(([itemResponseId, entry]) => {
        const build = buildItemResponseDraftRequest(
          entry.serverItem,
          entry.draft,
          false,
        );
        const hasLocalChanges = !build.ok || build.hasChanges;

        return [
          itemResponseId,
          {
            state: entry.state,
            draft: cloneItemDraftState(entry.draft),
            serverItem: entry.serverItem,
            hasLocalChanges,
            validationMessage: entry.validationMessage,
            message: entry.message,
            conflictServerAvailable: entry.conflictServerItem !== null,
          },
        ];
      }),
    );
  }

  private emit(): void {
    if (this.stopped) {
      return;
    }

    const snapshots = this.createSnapshots();
    const states: ItemResponseAutosaveState[] = [
      'clean',
      'dirty',
      'invalid',
      'queued',
      'saving',
      'waiting_for_network',
      'reconciling',
      'conflict',
      'blocked',
    ];
    const stateCounts = Object.fromEntries(
      states.map((state) => [state, 0]),
    ) as Record<ItemResponseAutosaveState, number>;
    let unsettledCount = 0;
    let shouldBlockUnload = false;

    Object.values(snapshots).forEach((snapshot) => {
      stateCounts[snapshot.state] += 1;

      if (
        autosaveStateBlocksSubmission(
          snapshot.state,
          snapshot.hasLocalChanges,
        )
      ) {
        unsettledCount += 1;
      }

      if (
        autosaveStateBlocksUnload(snapshot.state, snapshot.hasLocalChanges)
      ) {
        shouldBlockUnload = true;
      }
    });

    this.options.onChange(snapshots, {
      stateCounts,
      unsettledCount,
      savingCount: stateCounts.saving,
      shouldBlockUnload,
    });
  }

  private clearTimer(entry: AutosaveEntry): void {
    if (entry.timerHandle !== null) {
      this.options.clock.clearTimeout(entry.timerHandle);
      entry.timerHandle = null;
    }
  }

  private clearAllTimers(): void {
    this.entries.forEach((entry) => this.clearTimer(entry));
  }

  private abortReads(): void {
    this.readControllers.forEach((controller) => controller.abort());
    this.readControllers.clear();
  }
}
