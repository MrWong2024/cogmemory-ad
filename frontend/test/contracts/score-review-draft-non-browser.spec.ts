import { expect, test } from '@playwright/test';

import {
  buildManualScoreReviewRequest,
  buildScoreResultConfirmationRequest,
  type ManualScoreReviewDraft,
  type ScoreResultConfirmationDraft,
} from '@/src/features/assessments/lib/score-review-draft';
import type { ProvisionalScoreItem } from '@/src/features/assessments/types/provisional-scoring';

const UPDATED_AT = '2026-08-20T01:02:03.000Z';

function confirmationDraft(
  overrides: Partial<ScoreResultConfirmationDraft> = {},
): ScoreResultConfirmationDraft {
  return {
    reviewNote: '',
    confirmed: true,
    baseUpdatedAt: UPDATED_AT,
    stale: false,
    ...overrides,
  };
}

function manualDraft(reviewNote: string): ManualScoreReviewDraft {
  return {
    itemResponseId: 'item-response-a',
    scoreValue: '1',
    reviewNote,
    initialScoreValue: '',
    initialReviewNote: '',
    baseUpdatedAt: UPDATED_AT,
    stale: false,
  };
}

const manualItem: ProvisionalScoreItem = {
  itemResponseId: 'item-response-a',
  itemCode: 'MANUAL_ITEM',
  itemTitle: '人工评分题目',
  itemOrder: 1,
  countsTowardTotal: true,
  includedInTotal: false,
  provisionalScoreValue: null,
  minScore: 0,
  maxScore: 1,
  scoreStatus: 'needs_review',
  scoreSource: 'none',
  isMissing: false,
  cognitiveDomainCodes: [],
  reviewRequired: true,
};

test('final confirmation accepts an empty trimmed note and keeps the CAS version', () => {
  const result = buildScoreResultConfirmationRequest(
    confirmationDraft({ reviewNote: '   ' }),
  );

  expect(result).toEqual({
    ok: true,
    input: {
      confirm: true,
      reviewNote: '',
      expectedUpdatedAt: UPDATED_AT,
    },
  });
});

test('final confirmation accepts 2000 characters and rejects 2001', () => {
  expect(
    buildScoreResultConfirmationRequest(
      confirmationDraft({ reviewNote: 'a'.repeat(2000) }),
    ).ok,
  ).toBe(true);
  expect(
    buildScoreResultConfirmationRequest(
      confirmationDraft({ reviewNote: 'a'.repeat(2001) }),
    ),
  ).toEqual({
    ok: false,
    message: '最终确认意见最多填写 2000 个字符。',
  });
});

test('final confirmation still requires the explicit checkbox and a CAS version', () => {
  expect(
    buildScoreResultConfirmationRequest(
      confirmationDraft({ confirmed: false }),
    ),
  ).toEqual({ ok: false, message: '请勾选最终确认说明。' });
  expect(
    buildScoreResultConfirmationRequest(
      confirmationDraft({ baseUpdatedAt: '' }),
    ),
  ).toEqual({
    ok: false,
    message: '当前评分结果缺少并发版本，请重新加载。',
  });
});

test('manual item review still requires 3–2000 characters', () => {
  for (const reviewNote of ['', 'a', 'ab']) {
    expect(buildManualScoreReviewRequest(manualDraft(reviewNote), manualItem)).toEqual(
      { ok: false, message: '人工评分依据需填写 3–2000 个字符。' },
    );
  }

  expect(buildManualScoreReviewRequest(manualDraft('abc'), manualItem).ok).toBe(
    true,
  );
  expect(
    buildManualScoreReviewRequest(manualDraft('a'.repeat(2000)), manualItem).ok,
  ).toBe(true);
  expect(
    buildManualScoreReviewRequest(manualDraft('a'.repeat(2001)), manualItem).ok,
  ).toBe(false);
});
