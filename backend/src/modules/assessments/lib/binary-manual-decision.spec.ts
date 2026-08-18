import {
  calculateBinaryManualDecisionScore,
  isBinaryManualDecisionEligible,
  isValidBinaryManualDecisionDraft,
  readCompleteBinaryManualDecision,
} from './binary-manual-decision';

describe('binary manual decision', () => {
  it.each([
    'manual_exact_match',
    'manual_observation',
    'manual_drawing_review',
  ])('enables %s only for an exact 0..1 step-1 range', (mode) => {
    expect(
      isBinaryManualDecisionEligible({ mode }, { min: 0, max: 1, step: 1 }),
    ).toBe(true);
  });

  it.each([
    [{ mode: 'structured_manual' }, { min: 0, max: 1, step: 1 }],
    [{ mode: 'multi_step_manual' }, { min: 0, max: 1, step: 1 }],
    [{ mode: 'manual_observation' }, { min: 0, max: 2, step: 1 }],
    [{ mode: 'manual_observation' }, { min: 0, max: 1, step: 0.5 }],
  ])('does not enable an ineligible rule or range', (rule, range) => {
    expect(isBinaryManualDecisionEligible(rule, range)).toBe(false);
  });

  it('accepts null as a partial draft and maps complete booleans', () => {
    const partial = { binaryManualDecision: { isCorrect: null } };
    const correct = { binaryManualDecision: { isCorrect: true } };
    const incorrect = { binaryManualDecision: { isCorrect: false } };

    expect(isValidBinaryManualDecisionDraft(partial)).toBe(true);
    expect(readCompleteBinaryManualDecision(partial)).toBeNull();
    expect(readCompleteBinaryManualDecision(correct)).toBe(true);
    expect(readCompleteBinaryManualDecision(incorrect)).toBe(false);
    expect(calculateBinaryManualDecisionScore(correct)).toBe(1);
    expect(calculateBinaryManualDecisionScore(incorrect)).toBe(0);
  });

  it.each([
    { binaryManualDecision: { isCorrect: true }, scoreValue: 1 },
    { binaryManualDecision: { isCorrect: true, correctScore: 1 } },
    { binaryManualDecision: { isCorrect: true, maxScore: 1 } },
    { binaryManualDecision: { isCorrect: true, note: 'forged' } },
    { binaryManualDecision: { isCorrect: true, decidedBy: 'operator' } },
    { binaryManualDecision: { isCorrect: 'true' } },
    { binaryManualDecision: {} },
  ])('rejects forged or malformed decision payloads', (value) => {
    expect(isValidBinaryManualDecisionDraft(value)).toBe(false);
    expect(calculateBinaryManualDecisionScore(value)).toBeNull();
  });
});
