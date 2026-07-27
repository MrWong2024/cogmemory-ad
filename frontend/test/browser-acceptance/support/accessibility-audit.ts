import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

export type AccessibilityTarget = {
  include?: string[];
  exclude?: string[];
};

export type AccessibilityViolationSummary = {
  ruleId: string;
  impact: string | null;
  nodeCount: number;
};

export type AccessibilityAuditSummary = {
  violationCount: number;
  violations: AccessibilityViolationSummary[];
};

const DEFAULT_WCAG_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
];

export async function runAccessibilityAudit(
  page: Page,
  target: AccessibilityTarget = {},
): Promise<AccessibilityAuditSummary> {
  let builder = new AxeBuilder({ page }).withTags(DEFAULT_WCAG_TAGS);
  for (const selector of target.include ?? []) builder = builder.include(selector);
  for (const selector of target.exclude ?? []) builder = builder.exclude(selector);

  const results = await builder.analyze();
  const violations = results.violations.map((violation) => ({
    ruleId: violation.id,
    impact: violation.impact ?? null,
    nodeCount: violation.nodes.length,
  }));

  return {
    violationCount: violations.length,
    violations,
  };
}
