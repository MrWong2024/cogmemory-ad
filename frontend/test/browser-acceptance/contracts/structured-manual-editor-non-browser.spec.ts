import { expect, test } from '@playwright/test';

import {
  rebaseItemDraftAfterSave,
} from '@/src/features/assessments/lib/item-response-autosave';
import {
  buildItemResponseDraftRequest,
  createItemDraftState,
  createStructuredManualDraft,
  getStructuredManualFields,
  getStructuredManualScorePreview,
  itemDraftHasChanges,
  isStructuredManualDraftComplete,
  serializeStructuredManualDraft,
  setItemDraftMissing,
} from '@/src/features/assessments/lib/item-response-draft';
import type {
  ItemResponseExecution,
  StructuredManualField,
  StructuredManualResponse,
} from '@/src/features/assessments/types/item-response-execution';

const fields: StructuredManualField[] = [
  { code: 'year', label: '年', maxScore: 1, referenceAnswer: 2026 },
  { code: 'season', label: '季节', maxScore: 1 },
  { code: 'month', label: '月份', maxScore: 1 },
  { code: 'date', label: '日期', maxScore: 1 },
  { code: 'weekday', label: '星期', maxScore: 1 },
];

function createItem(
  overrides: Partial<ItemResponseExecution> = {},
): ItemResponseExecution {
  return {
    id: 'item-response-a',
    scaleInstanceId: 'scale-instance-a',
    itemCode: 'CONFIG_DRIVEN_ITEM',
    itemTitle: '配置驱动逐项复核',
    itemOrder: 1,
    responseType: 'multi_choice',
    countsTowardTotal: true,
    cognitiveDomainCodes: [],
    versionTrace: null,
    config: {
      scoreRange: { min: 0, max: 5, step: 1 },
      evidenceTypes: [],
      requiresTimer: false,
      supportsPhotoUpload: false,
      supportsHandwriting: false,
      requiresOperatorNote: false,
      structuredManualFields: fields,
    },
    status: 'in_progress',
    draftRevision: 3,
    draftSavedAt: null,
    answerSource: 'clinician_recorded',
    rawResponse: null,
    structuredResponse: null,
    isMissing: false,
    stepResponses: [],
    promptResponses: [],
    timing: null,
    evidenceRequirements: [],
    ...overrides,
  };
}

function completeDraft(correctness: boolean[]): StructuredManualResponse {
  return {
    subItems: Object.fromEntries(
      fields.map((field, index) => [
        field.code,
        {
          responseText: `实际回答 ${index + 1}`,
          isCorrect: correctness[index] ?? false,
        },
      ]),
    ),
  };
}

test('configured fields initialize as empty three-state draft entries', () => {
  expect(createStructuredManualDraft(fields, null)).toEqual({
    subItems: Object.fromEntries(
      fields.map((field) => [
        field.code,
        { responseText: '', isCorrect: null },
      ]),
    ),
  });
});

test('stored partial values restore while unknown fields stay outside editable state', () => {
  const draft = createStructuredManualDraft(fields, {
    subItems: {
      year: { responseText: '2026', isCorrect: true },
      month: { responseText: '八月', isCorrect: null },
      unknown: { responseText: '历史未知项', isCorrect: false },
    },
  });

  expect(draft.subItems.year).toEqual({
    responseText: '2026',
    isCorrect: true,
  });
  expect(draft.subItems.month).toEqual({
    responseText: '八月',
    isCorrect: null,
  });
  expect(draft.subItems.season).toEqual({
    responseText: '',
    isCorrect: null,
  });
  expect(draft.subItems).not.toHaveProperty('unknown');
});

test('completion requires every response text and every correctness decision', () => {
  const complete = completeDraft([true, true, true, false, true]);
  expect(isStructuredManualDraftComplete(fields, complete)).toBe(true);

  expect(
    isStructuredManualDraftComplete(fields, {
      ...complete,
      subItems: {
        ...complete.subItems,
        year: { responseText: ' ', isCorrect: true },
      },
    }),
  ).toBe(false);
  expect(
    isStructuredManualDraftComplete(fields, {
      ...complete,
      subItems: {
        ...complete.subItems,
        year: { responseText: '2026', isCorrect: null },
      },
    }),
  ).toBe(false);
});

test('score preview sums configured maxScore only from explicit true decisions', () => {
  expect(
    getStructuredManualScorePreview(
      fields,
      completeDraft([true, true, true, false, true]),
    ),
  ).toEqual({
    score: 4,
    maxScore: 5,
    confirmedCount: 5,
    totalCount: 5,
    incompleteCount: 0,
  });

  expect(
    getStructuredManualScorePreview(
      [{ code: 'word', label: '词语', maxScore: 2, referenceAnswer: '皮球' }],
      {
        subItems: {
          word: { responseText: '与参考答案不同', isCorrect: true },
        },
      },
    ).score,
  ).toBe(2);
});

test('serialization keeps only configured answer decisions and no scoring metadata', () => {
  const serialized = serializeStructuredManualDraft(fields, {
    subItems: {
      year: { responseText: '2026', isCorrect: true },
      season: { responseText: '', isCorrect: null },
      month: { responseText: '八月', isCorrect: null },
      unknown: { responseText: '未知项', isCorrect: true },
    },
  });

  expect(serialized).toEqual({
    subItems: {
      year: { responseText: '2026', isCorrect: true },
      month: { responseText: '八月', isCorrect: null },
    },
  });
  expect(JSON.stringify(serialized)).not.toMatch(
    /maxScore|referenceAnswer|label|preview|scoreValue/,
  );
});

test('draft request uses structuredResponse and missing completion bypasses subitem completeness', () => {
  const item = createItem();
  const draft = createItemDraftState(item);
  const partialDraft = {
    ...draft,
    structuredResponse: {
      subItems: {
        ...draft.structuredResponse?.subItems,
        year: { responseText: '2026', isCorrect: true },
      },
    },
  };
  const partialBuild = buildItemResponseDraftRequest(item, partialDraft, false);

  expect(partialBuild.ok).toBe(true);
  if (!partialBuild.ok) return;
  expect(partialBuild.input).toEqual({
    expectedRevision: 3,
    structuredResponse: {
      subItems: {
        year: { responseText: '2026', isCorrect: true },
      },
    },
  });

  const missingDraft = setItemDraftMissing(partialDraft, true);
  expect(missingDraft.structuredResponse).toEqual(
    partialDraft.structuredResponse,
  );
  const missingBuild = buildItemResponseDraftRequest(
    item,
    { ...missingDraft, missingReason: '患者无法继续' },
    true,
  );
  expect(missingBuild.ok).toBe(true);
  if (!missingBuild.ok) return;
  expect(missingBuild.input).toEqual({
    expectedRevision: 3,
    isMissing: true,
    missingReason: '患者无法继续',
    markAsAnswered: true,
  });
});

test('structured edits participate in existing dirty detection and save rebase', () => {
  const item = createItem({
    structuredResponse: {
      subItems: {
        year: { responseText: '2026', isCorrect: true },
        unknown: { responseText: '历史未知项', isCorrect: false },
      },
    },
  });
  const baseline = createItemDraftState(item);
  expect(itemDraftHasChanges(item, baseline)).toBe(false);

  const attemptDraft = {
    ...baseline,
    structuredResponse: {
      subItems: {
        ...baseline.structuredResponse?.subItems,
        month: { responseText: '八月', isCorrect: true },
      },
    },
  };
  expect(itemDraftHasChanges(item, attemptDraft)).toBe(true);

  const currentDraft = {
    ...attemptDraft,
    structuredResponse: {
      subItems: {
        ...attemptDraft.structuredResponse.subItems,
        season: { responseText: '夏季', isCorrect: false },
      },
    },
  };
  const serverItem = createItem({
    draftRevision: 4,
    structuredResponse: serializeStructuredManualDraft(
      fields,
      attemptDraft.structuredResponse,
    ),
  });
  const rebased = rebaseItemDraftAfterSave({
    attemptDraft,
    currentDraft,
    serverItem,
  });

  expect(rebased.structuredResponse?.subItems.month).toEqual({
    responseText: '八月',
    isCorrect: true,
  });
  expect(rebased.structuredResponse?.subItems.season).toEqual({
    responseText: '夏季',
    isCorrect: false,
  });
  expect(rebased.structuredResponse?.subItems).not.toHaveProperty('unknown');
});

test('a config without structuredManualFields does not enable structured draft editing', () => {
  const item = createItem({
    config: {
      scoreRange: { min: 0, max: 5, step: 1 },
      evidenceTypes: [],
      requiresTimer: false,
      supportsPhotoUpload: false,
      supportsHandwriting: false,
      requiresOperatorNote: false,
    },
  });

  expect(getStructuredManualFields(item.config)).toBeNull();
  expect(createItemDraftState(item).structuredResponse).toBeNull();
});
