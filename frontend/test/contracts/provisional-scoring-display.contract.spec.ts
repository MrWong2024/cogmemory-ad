import { expect, test } from '@playwright/test';

import { formatProvisionalScorePercent } from '@/src/features/assessments/lib/provisional-scoring-display';

test('formats provisional score percentages with at most one decimal place', () => {
  const cases: Array<[number | null | undefined, string]> = [
    [93.33333333333333, '93.3%'],
    [86.66666666666667, '86.7%'],
    [90, '90%'],
    [100, '100%'],
    [null, '—'],
    [undefined, '—'],
    [Number.NaN, '—'],
    [Number.POSITIVE_INFINITY, '—'],
    [Number.NEGATIVE_INFINITY, '—'],
  ];

  for (const [value, expected] of cases) {
    expect(formatProvisionalScorePercent(value)).toBe(expected);
  }
});
