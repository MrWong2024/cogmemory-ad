import { MMSE_SCALE_VERSION_SEED } from '../../scales/seeds/mmse.seed';
import {
  calculateStructuredManualScore,
  isCompleteStructuredManualResponse,
  isValidStructuredManualDraft,
  parseStructuredManualFields,
} from './structured-manual-response';

function requireMmseItem(itemCode: string) {
  const item = MMSE_SCALE_VERSION_SEED.items.find(
    (candidate) => candidate.code === itemCode,
  );
  if (!item) {
    throw new Error(`Expected MMSE item ${itemCode}`);
  }
  return item;
}

describe('structured manual response contract', () => {
  it('normalizes current MMSE subItems and words without item-code branches', () => {
    const expected = [
      ['mmse.orientation.time', 5, 5],
      ['mmse.orientation.place', 5, 5],
      ['mmse.memory.immediate_recall', 3, 3],
      ['mmse.memory.delayed_recall', 3, 3],
      ['mmse.language.naming', 2, 2],
      ['mmse.language.three_step_command', 3, 3],
    ] as const;

    for (const [itemCode, fieldCount, maxScore] of expected) {
      const fields = parseStructuredManualFields(
        requireMmseItem(itemCode).scoringRule,
      );
      expect(fields).toHaveLength(fieldCount);
      expect(fields?.reduce((sum, field) => sum + field.maxScore, 0)).toBe(
        maxScore,
      );
    }

    expect(
      parseStructuredManualFields(
        requireMmseItem('mmse.memory.immediate_recall').scoringRule,
      )?.[0],
    ).toEqual({
      code: 'mmse.memory.immediate_recall.ball',
      label: '皮球',
      maxScore: 1,
      referenceAnswer: '皮球',
    });
    expect(
      parseStructuredManualFields(
        requireMmseItem('mmse.language.naming').scoringRule,
      )?.[0],
    ).toEqual({
      code: 'mmse.language.naming.watch',
      label: '手表',
      maxScore: 1,
      referenceAnswer: '手表',
    });
  });

  it('rejects malformed or duplicate configured fields as non-executable', () => {
    expect(
      parseStructuredManualFields({
        mode: 'structured_manual',
        subItems: [{ code: 'missing-label', maxScore: 1 }],
      }),
    ).toBeNull();
    expect(
      parseStructuredManualFields({
        mode: 'structured_manual',
        subItems: [
          { code: 'duplicate', title: 'First', maxScore: 1 },
          { code: ' DUPLICATE ', title: 'Second', maxScore: 1 },
        ],
      }),
    ).toBeNull();
    expect(
      parseStructuredManualFields({
        mode: 'structured_manual',
        words: [{ code: 'word', text: '' }],
      }),
    ).toBeNull();
  });

  it('allows partial drafts but requires exact complete clinician confirmations', () => {
    const fields = parseStructuredManualFields({
      mode: 'structured_manual',
      subItems: [
        { code: 'year', title: 'Year', maxScore: 1 },
        { code: 'month', expected: 8, maxScore: 1 },
      ],
    });
    if (!fields) {
      throw new Error('Expected executable fields');
    }

    const partial = {
      subItems: {
        year: { responseText: '2026', isCorrect: null },
      },
    };
    expect(isValidStructuredManualDraft(partial, fields)).toBe(true);
    expect(isCompleteStructuredManualResponse(partial, fields)).toBe(false);

    const complete = {
      subItems: {
        year: { responseText: 'not the reference', isCorrect: true },
        month: { responseText: 'August', isCorrect: false },
      },
    };
    expect(isCompleteStructuredManualResponse(complete, fields)).toBe(true);
    expect(calculateStructuredManualScore(complete, fields)).toBe(1);
  });

  it('rejects unknown fields, forged scoring keys and invalid correctness types', () => {
    const fields = parseStructuredManualFields({
      mode: 'structured_manual',
      words: [{ code: 'word', text: 'Word' }],
    });
    if (!fields) {
      throw new Error('Expected executable fields');
    }

    for (const invalid of [
      { subItems: { unknown: { responseText: 'x', isCorrect: true } } },
      {
        subItems: {
          word: { responseText: 'x', isCorrect: true, maxScore: 99 },
        },
      },
      { subItems: { word: { responseText: 'x', isCorrect: 'true' } } },
      { subItems: {}, scoreValue: 1 },
    ]) {
      expect(isValidStructuredManualDraft(invalid, fields)).toBe(false);
    }
  });
});
