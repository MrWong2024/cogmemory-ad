import { expect, type Locator } from '@playwright/test';

type AriaRole = Parameters<Locator['getByRole']>[0];

export type AriaNodeExpectation = {
  role: AriaRole;
  accessibleName: string | RegExp;
};

export type AriaNodeSummary = {
  roleMatched: boolean;
  accessibleNameMatched: boolean;
};

export type AriaSnapshotSummary = {
  matched: boolean;
  expectedNodeCount: number;
};

export type LiveRegionSummary = {
  live: string | null;
  busyBefore: string | null;
  busyAfter: string | null;
  textUpdated: boolean;
};

export async function assertAriaNode(
  locator: Locator,
  expected: AriaNodeExpectation,
): Promise<AriaNodeSummary> {
  await expect(locator).toHaveRole(expected.role);
  await expect(locator).toHaveAccessibleName(expected.accessibleName);
  return { roleMatched: true, accessibleNameMatched: true };
}

export async function assertAriaSnapshot(
  locator: Locator,
  expectedSnapshot: string,
): Promise<AriaSnapshotSummary> {
  await expect(locator).toMatchAriaSnapshot(expectedSnapshot);
  return {
    matched: true,
    expectedNodeCount: expectedSnapshot
      .split('\n')
      .filter((line) => line.trim().startsWith('- ')).length,
  };
}

export async function observePoliteLiveRegionUpdate(
  locator: Locator,
  trigger: () => Promise<void>,
  expectedText: string | RegExp,
): Promise<LiveRegionSummary> {
  const live = await locator.getAttribute('aria-live');
  const busyBefore = await locator.getAttribute('aria-busy');
  await trigger();
  await expect(locator).toContainText(expectedText);
  const busyAfter = await locator.getAttribute('aria-busy');
  return {
    live,
    busyBefore,
    busyAfter,
    textUpdated: true,
  };
}
