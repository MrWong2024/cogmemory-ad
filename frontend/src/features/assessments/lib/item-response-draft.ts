import type {
  ItemExecutionConfig,
  ItemPromptDraft,
  ItemResponseDraftJsonValue,
  ItemResponseExecution,
  ItemStepDraft,
  ItemTimingDraft,
  StructuredManualField,
  StructuredManualResponse,
  UpdateItemResponseDraftRequest,
  UpdateItemStepDraftRequest,
  UpdatePromptResponseDraftRequest,
} from '@/src/features/assessments/types/item-response-execution';
import { validateItemTimingSnapshot } from '@/src/features/assessments/lib/item-response-timer';

export type ItemStepDraftState = {
  stepCode: string;
  actualValueInput: string;
  actualValueTouched: boolean;
  note: string;
};

export type ItemPromptDraftState = {
  promptType: ItemPromptDraft['promptType'];
  order: number;
  responseAfterPromptInput: string;
  responseAfterPromptTouched: boolean;
  note: string;
};

export type ItemDraftState = {
  rawResponse: ItemResponseDraftJsonValue;
  rawResponseInput: string;
  rawResponseTouched: boolean;
  structuredResponse: StructuredManualResponse | null;
  responseText: string;
  isMissing: boolean;
  missingReason: string;
  stepResponses: ItemStepDraftState[];
  promptResponses: ItemPromptDraftState[];
  timing: ItemTimingDraft | null;
  operatorNote: string;
};

export type ItemDraftBuildResult =
  | {
      ok: true;
      hasChanges: boolean;
      input: UpdateItemResponseDraftRequest;
    }
  | {
      ok: false;
      message: string;
    };

type ValueConversionResult =
  | { ok: true; value: ItemResponseDraftJsonValue }
  | { ok: false; message: string };

export type StructuredManualScorePreview = {
  score: number;
  maxScore: number;
  confirmedCount: number;
  totalCount: number;
  incompleteCount: number;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getStructuredManualFields(
  config: ItemExecutionConfig,
): StructuredManualField[] | null {
  return Array.isArray(config.structuredManualFields) &&
    config.structuredManualFields.length > 0
    ? config.structuredManualFields
    : null;
}

export function createStructuredManualDraft(
  fields: readonly StructuredManualField[],
  storedResponse: ItemResponseExecution['structuredResponse'],
): StructuredManualResponse {
  const storedSubItems =
    isPlainRecord(storedResponse) && isPlainRecord(storedResponse.subItems)
      ? storedResponse.subItems
      : {};

  return {
    subItems: Object.fromEntries(
      fields.map((field) => {
        const storedSubItem = storedSubItems[field.code];
        const responseText =
          isPlainRecord(storedSubItem) &&
          typeof storedSubItem.responseText === 'string'
            ? storedSubItem.responseText
            : '';
        const isCorrect =
          isPlainRecord(storedSubItem) &&
          typeof storedSubItem.isCorrect === 'boolean'
            ? storedSubItem.isCorrect
            : null;

        return [field.code, { responseText, isCorrect }];
      }),
    ),
  };
}

export function isStructuredManualDraftComplete(
  fields: readonly StructuredManualField[],
  draft: StructuredManualResponse | null,
): boolean {
  return (
    fields.length > 0 &&
    draft !== null &&
    fields.every((field) => {
      const subItem = draft.subItems[field.code];
      return (
        Boolean(subItem?.responseText.trim()) &&
        typeof subItem?.isCorrect === 'boolean'
      );
    })
  );
}

export function getStructuredManualScorePreview(
  fields: readonly StructuredManualField[],
  draft: StructuredManualResponse | null,
): StructuredManualScorePreview {
  return fields.reduce<StructuredManualScorePreview>(
    (preview, field) => {
      const subItem = draft?.subItems[field.code];
      const isComplete =
        Boolean(subItem?.responseText.trim()) &&
        typeof subItem?.isCorrect === 'boolean';

      return {
        score:
          preview.score +
          (subItem?.isCorrect === true ? field.maxScore : 0),
        maxScore: preview.maxScore + field.maxScore,
        confirmedCount:
          preview.confirmedCount +
          (typeof subItem?.isCorrect === 'boolean' ? 1 : 0),
        totalCount: preview.totalCount + 1,
        incompleteCount: preview.incompleteCount + (isComplete ? 0 : 1),
      };
    },
    {
      score: 0,
      maxScore: 0,
      confirmedCount: 0,
      totalCount: 0,
      incompleteCount: 0,
    },
  );
}

export function serializeStructuredManualDraft(
  fields: readonly StructuredManualField[],
  draft: StructuredManualResponse | null,
): StructuredManualResponse {
  const subItems: StructuredManualResponse['subItems'] = {};

  fields.forEach((field) => {
    const subItem = draft?.subItems[field.code];

    if (
      subItem &&
      (subItem.responseText.trim().length > 0 || subItem.isCorrect !== null)
    ) {
      subItems[field.code] = {
        responseText: subItem.responseText,
        isCorrect: subItem.isCorrect,
      };
    }
  });

  return { subItems };
}

function draftValueToInput(value: ItemResponseDraftJsonValue): string {
  if (value === null || typeof value === 'object') {
    return '';
  }

  return String(value);
}

export function hasNonPrimitiveDraftValue(
  value: ItemResponseDraftJsonValue,
): boolean {
  return value !== null && typeof value === 'object';
}

export function createItemDraftState(
  item: ItemResponseExecution,
): ItemDraftState {
  const structuredManualFields = getStructuredManualFields(item.config);

  return {
    rawResponse: item.rawResponse,
    rawResponseInput: draftValueToInput(item.rawResponse),
    rawResponseTouched: false,
    structuredResponse: structuredManualFields
      ? createStructuredManualDraft(
          structuredManualFields,
          item.structuredResponse,
        )
      : null,
    responseText: item.responseText ?? '',
    isMissing: item.isMissing,
    missingReason: item.missingReason ?? '',
    stepResponses: item.stepResponses.map((step) => ({
      stepCode: step.stepCode,
      actualValueInput: draftValueToInput(step.actualValue),
      actualValueTouched: false,
      note: step.note ?? '',
    })),
    promptResponses: item.promptResponses.map((prompt) => ({
      promptType: prompt.promptType,
      order: prompt.order,
      responseAfterPromptInput: draftValueToInput(
        prompt.responseAfterPrompt,
      ),
      responseAfterPromptTouched: false,
      note: prompt.note ?? '',
    })),
    timing: item.timing ? { ...item.timing } : null,
    operatorNote: item.operatorNote ?? '',
  };
}

export function setItemDraftMissing(
  draft: ItemDraftState,
  isMissing: boolean,
): ItemDraftState {
  if (!isMissing) {
    return {
      ...draft,
      isMissing: false,
      missingReason: '',
    };
  }

  return {
    ...draft,
    rawResponse: null,
    rawResponseInput: '',
    rawResponseTouched: true,
    responseText: '',
    isMissing: true,
    stepResponses: draft.stepResponses.map((step) => ({
      ...step,
      actualValueInput: '',
      actualValueTouched: true,
    })),
    promptResponses: draft.promptResponses.map((prompt) => ({
      ...prompt,
      responseAfterPromptInput: '',
      responseAfterPromptTouched: true,
    })),
  };
}

function areDraftValuesEqual(
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
        areDraftValuesEqual(value, right[index] ?? null),
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
          areDraftValuesEqual(left[key], right[key]),
      )
    );
  }

  return false;
}

function convertInputValue(
  value: string,
  useNumber: boolean,
  fieldLabel: string,
): ValueConversionResult {
  if (value === '') {
    return { ok: true, value: null };
  }

  if (!useNumber) {
    return { ok: true, value };
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return {
      ok: false,
      message: `${fieldLabel}必须是有效的有限数值。`,
    };
  }

  return { ok: true, value: numericValue };
}

function findOriginalStep(
  item: ItemResponseExecution,
  stepCode: string,
): ItemStepDraft | undefined {
  return item.stepResponses.find((step) => step.stepCode === stepCode);
}

function findOriginalPrompt(
  item: ItemResponseExecution,
  promptType: ItemPromptDraft['promptType'],
  order: number,
): ItemPromptDraft | undefined {
  return item.promptResponses.find(
    (prompt) => prompt.promptType === promptType && prompt.order === order,
  );
}

function getCurrentStepValue(
  item: ItemResponseExecution,
  step: ItemStepDraftState,
): ValueConversionResult {
  if (!step.actualValueTouched) {
    return {
      ok: true,
      value: findOriginalStep(item, step.stepCode)?.actualValue ?? null,
    };
  }

  const useNumber =
    item.responseType === 'number' ||
    item.responseType === 'multi_step_calculation';

  return convertInputValue(step.actualValueInput, useNumber, '分步实际回答');
}

function getCurrentPromptValue(
  item: ItemResponseExecution,
  prompt: ItemPromptDraftState,
): ValueConversionResult {
  if (!prompt.responseAfterPromptTouched) {
    return {
      ok: true,
      value:
        findOriginalPrompt(item, prompt.promptType, prompt.order)
          ?.responseAfterPrompt ?? null,
    };
  }

  return convertInputValue(
    prompt.responseAfterPromptInput,
    false,
    '提示后回答',
  );
}

function hasNonEmptyStructuredResponse(item: ItemResponseExecution): boolean {
  return (
    item.structuredResponse !== null &&
    Object.keys(item.structuredResponse).length > 0
  );
}

export function itemDraftHasValidAnswer(
  item: ItemResponseExecution,
  draft: ItemDraftState,
): boolean {
  if (draft.isMissing) {
    return draft.missingReason.trim().length > 0;
  }

  const structuredManualFields = getStructuredManualFields(item.config);

  if (structuredManualFields) {
    return isStructuredManualDraftComplete(
      structuredManualFields,
      draft.structuredResponse,
    );
  }

  if (item.responseType === 'boolean' && draft.rawResponse !== null) {
    return true;
  }

  if (item.responseType === 'number') {
    const rawResponse = draft.rawResponseTouched
      ? convertInputValue(draft.rawResponseInput, true, '数值回答')
      : { ok: true as const, value: draft.rawResponse };

    if (rawResponse.ok && rawResponse.value !== null) {
      return true;
    }
  }

  if (draft.responseText.trim().length > 0) {
    return true;
  }

  if (
    draft.stepResponses.some((step) => {
      const value = getCurrentStepValue(item, step);
      return value.ok && value.value !== null;
    })
  ) {
    return true;
  }

  if (
    draft.promptResponses.some((prompt) => {
      const value = getCurrentPromptValue(item, prompt);
      return value.ok && value.value !== null;
    })
  ) {
    return true;
  }

  return hasNonEmptyStructuredResponse(item);
}

export function itemAllowsTiming(item: ItemResponseExecution): boolean {
  return (
    item.responseType === 'timed_task' ||
    item.config.requiresTimer ||
    item.config.evidenceTypes.includes('duration')
  );
}

function validateTextLengths(draft: ItemDraftState): string | null {
  if (draft.responseText.length > 10000) {
    return '原始回答文本最多 10000 个字符。';
  }

  if (draft.missingReason.length > 1000) {
    return '缺失原因最多 1000 个字符。';
  }

  if (draft.operatorNote.length > 4000) {
    return '操作者备注最多 4000 个字符。';
  }

  if (draft.stepResponses.some((step) => step.note.length > 2000)) {
    return '每条分步备注最多 2000 个字符。';
  }

  if (draft.promptResponses.some((prompt) => prompt.note.length > 2000)) {
    return '每条提示后表现备注最多 2000 个字符。';
  }

  return null;
}

function buildStepRequests(
  item: ItemResponseExecution,
  draft: ItemDraftState,
):
  | { ok: true; requests: UpdateItemStepDraftRequest[] }
  | { ok: false; message: string } {
  const requests: UpdateItemStepDraftRequest[] = [];

  for (const step of draft.stepResponses) {
    const original = findOriginalStep(item, step.stepCode);

    if (!original) {
      continue;
    }

    const request: UpdateItemStepDraftRequest = { stepCode: step.stepCode };

    if (step.actualValueTouched) {
      const actualValue = getCurrentStepValue(item, step);

      if (!actualValue.ok) {
        return actualValue;
      }

      if (!areDraftValuesEqual(actualValue.value, original.actualValue)) {
        request.actualValue = actualValue.value;
      }
    }

    if (step.note !== (original.note ?? '')) {
      request.note = step.note === '' ? null : step.note;
    }

    if (request.actualValue !== undefined || request.note !== undefined) {
      requests.push(request);
    }
  }

  return { ok: true, requests };
}

function buildPromptRequests(
  item: ItemResponseExecution,
  draft: ItemDraftState,
):
  | { ok: true; requests: UpdatePromptResponseDraftRequest[] }
  | { ok: false; message: string } {
  const requests: UpdatePromptResponseDraftRequest[] = [];

  for (const prompt of draft.promptResponses) {
    const original = findOriginalPrompt(item, prompt.promptType, prompt.order);

    if (!original) {
      continue;
    }

    const request: UpdatePromptResponseDraftRequest = {
      promptType: prompt.promptType,
      order: prompt.order,
    };

    if (prompt.responseAfterPromptTouched) {
      const responseAfterPrompt = getCurrentPromptValue(item, prompt);

      if (!responseAfterPrompt.ok) {
        return responseAfterPrompt;
      }

      if (
        !areDraftValuesEqual(
          responseAfterPrompt.value,
          original.responseAfterPrompt,
        )
      ) {
        request.responseAfterPrompt = responseAfterPrompt.value;
      }
    }

    if (prompt.note !== (original.note ?? '')) {
      request.note = prompt.note === '' ? null : prompt.note;
    }

    if (
      request.responseAfterPrompt !== undefined ||
      request.note !== undefined
    ) {
      requests.push(request);
    }
  }

  return { ok: true, requests };
}

function buildTimingRequest(
  item: ItemResponseExecution,
  draft: ItemDraftState,
):
  | { ok: true; request: ItemTimingDraft | null | undefined }
  | { ok: false; message: string } {
  if (!itemAllowsTiming(item)) {
    return { ok: true, request: undefined };
  }

  if (areItemTimingsEqual(item.timing, draft.timing)) {
    return { ok: true, request: undefined };
  }

  if (draft.timing === null) {
    return { ok: true, request: null };
  }

  const validationError = validateItemTimingSnapshot(draft.timing);

  return validationError
    ? { ok: false, message: validationError }
    : { ok: true, request: { ...draft.timing } };
}

function areItemTimingsEqual(
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

export function buildItemResponseDraftRequest(
  item: ItemResponseExecution,
  draft: ItemDraftState,
  markAsAnswered: boolean,
): ItemDraftBuildResult {
  const lengthError = validateTextLengths(draft);

  if (lengthError) {
    return { ok: false, message: lengthError };
  }

  if (draft.isMissing && draft.missingReason.trim().length === 0) {
    return {
      ok: false,
      message: '标记本题无法完成或缺失时，必须填写缺失原因。',
    };
  }

  if (
    !Number.isSafeInteger(item.draftRevision) ||
    item.draftRevision < 0
  ) {
    return {
      ok: false,
      message: '服务器草稿版本无效，请重新加载量表。',
    };
  }

  const input: UpdateItemResponseDraftRequest = {
    expectedRevision: item.draftRevision,
  };
  const structuredManualFields = getStructuredManualFields(item.config);

  if (item.responseType === 'number' && draft.rawResponseTouched) {
    const rawResponse = convertInputValue(
      draft.rawResponseInput,
      true,
      '数值回答',
    );

    if (!rawResponse.ok) {
      return rawResponse;
    }

    if (!areDraftValuesEqual(rawResponse.value, item.rawResponse)) {
      input.rawResponse = rawResponse.value;
    }
  } else if (!areDraftValuesEqual(draft.rawResponse, item.rawResponse)) {
    input.rawResponse = draft.rawResponse;
  }

  if (draft.responseText !== (item.responseText ?? '')) {
    input.responseText = draft.responseText === '' ? null : draft.responseText;
  }

  if (structuredManualFields && !draft.isMissing) {
    const originalStructuredDraft = createStructuredManualDraft(
      structuredManualFields,
      item.structuredResponse,
    );

    if (
      !areDraftValuesEqual(
        draft.structuredResponse,
        originalStructuredDraft,
      )
    ) {
      input.structuredResponse = serializeStructuredManualDraft(
        structuredManualFields,
        draft.structuredResponse,
      );
    }
  }

  if (draft.isMissing !== item.isMissing) {
    input.isMissing = draft.isMissing;
  }

  if (draft.missingReason !== (item.missingReason ?? '')) {
    input.missingReason =
      draft.missingReason === '' ? null : draft.missingReason;
  }

  const stepResponses = buildStepRequests(item, draft);

  if (!stepResponses.ok) {
    return stepResponses;
  }

  if (stepResponses.requests.length > 0) {
    input.stepResponses = stepResponses.requests;
  }

  const promptResponses = buildPromptRequests(item, draft);

  if (!promptResponses.ok) {
    return promptResponses;
  }

  if (promptResponses.requests.length > 0) {
    input.promptResponses = promptResponses.requests;
  }

  const timing = buildTimingRequest(item, draft);

  if (!timing.ok) {
    return timing;
  }

  if (timing.request !== undefined) {
    input.timing = timing.request;
  }

  if (draft.operatorNote !== (item.operatorNote ?? '')) {
    input.operatorNote = draft.operatorNote === '' ? null : draft.operatorNote;
  }

  if (markAsAnswered) {
    if (!itemDraftHasValidAnswer(item, draft)) {
      return {
        ok: false,
        message: '请先记录有效作答或缺失原因，再标记本题完成。',
      };
    }

    input.markAsAnswered = true;
  }

  return {
    ok: true,
    hasChanges: Object.keys(input).some(
      (key) => key !== 'expectedRevision',
    ),
    input,
  };
}

export function itemDraftHasChanges(
  item: ItemResponseExecution,
  draft: ItemDraftState,
): boolean {
  const result = buildItemResponseDraftRequest(item, draft, false);

  if (!result.ok) {
    return true;
  }

  return result.hasChanges;
}
