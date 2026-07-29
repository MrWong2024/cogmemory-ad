import type { Page } from "@playwright/test";

import { resolveB12BrowserEnvironment } from "../b12-env";
import {
  B12_NEUTRAL_TEXT,
  assertNoAvailableLockEntry,
  coordinateB12Stage,
  runB12CoreRoute,
} from "../b12-core-support";
import { expect, test } from "../../support/acceptance-test";

const environment = resolveB12BrowserEnvironment();

async function openLockForm(page: Page, note: string) {
  await page.getByRole("button", { name: "准备锁定报告", exact: true }).click();
  const noteField = page.getByLabel("锁定流程说明（必填）", {
    exact: true,
  });
  const checkbox = page.locator("#clinical-report-lock-confirmed");
  const submit = page.getByRole("button", {
    name: "确认不可逆锁定",
    exact: true,
  });
  await noteField.fill(note);
  await checkbox.check();
  await expect(submit).toBeEnabled();
  return { noteField, checkbox, submit };
}

test.describe("B12 core / conflict", () => {
  test("lock-conflict-continue owns B12-49 through B12-54", async ({
    roleContexts,
  }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    test.setTimeout(180_000);
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "conflict",
          routeKey: "lock-conflict-continue",
        },
      },
      async (run) => {
        const session = await run.primary();
        const initialUpdatedAt = session.initialUpdatedAt();
        const form = await openLockForm(
          session.page,
          B12_NEUTRAL_TEXT.conflictLock,
        );

        await coordinateB12Stage("lock-conflict-touch");
        const conflict = await session.performLock(() => form.submit.click(), {
          expectedRequestNote: B12_NEUTRAL_TEXT.conflictLock,
        });
        expect(conflict).toEqual({ status: 409, facts: null });
        await session.waitForLatestCount(2);
        expect(session.latestUpdatedAt()).not.toBe(initialUpdatedAt);
        await expect(form.noteField).toHaveValue(B12_NEUTRAL_TEXT.conflictLock);
        await expect(form.checkbox).not.toBeChecked();
        await expect(form.submit).toBeDisabled();
        await expect(
          session.page.getByText("锁定草稿已过期", { exact: true }),
        ).toBeVisible();
        expect(session.lockRequestEvidence()).toHaveLength(1);

        await session.page
          .getByRole("button", { name: "基于最新报告继续", exact: true })
          .click();
        await expect(form.noteField).toHaveValue(B12_NEUTRAL_TEXT.conflictLock);
        await expect(form.checkbox).not.toBeChecked();
        await form.checkbox.check();
        await expect(form.submit).toBeEnabled();

        const success = await session.performLock(() => form.submit.click(), {
          expectedRequestNote: B12_NEUTRAL_TEXT.conflictLock,
          expectedPersistedNote: B12_NEUTRAL_TEXT.conflictLock,
        });
        expect(success.status).toBe(200);
        expect(success.facts).toMatchObject({
          alreadyLocked: false,
          receiptPresent: true,
          receiptLockNoteMatchesExpected: true,
          report: {
            status: "confirmed",
            lockedAtPresent: true,
            lock: { present: true },
          },
        });
        expect(session.lockRequestEvidence()).toHaveLength(2);
        await assertNoAvailableLockEntry(session.page);
        await session.assertCapturedActorIdsNotLeaked();
      },
    );
  });

  test("lock-conflict-latest-locked owns B12-55", async ({ roleContexts }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    test.setTimeout(180_000);
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "conflict",
          routeKey: "lock-conflict-latest-locked",
        },
      },
      async (run) => {
        const primary = await run.primary();
        const primaryForm = await openLockForm(
          primary.page,
          B12_NEUTRAL_TEXT.latestLockedPrimary,
        );

        await coordinateB12Stage("lock-conflict-latest-locked-touch");
        const secondary = await run.secondary();
        expect(primary.page.context()).not.toBe(secondary.page.context());
        const secondaryForm = await openLockForm(
          secondary.page,
          B12_NEUTRAL_TEXT.latestLockedSecondary,
        );

        const latestGate = await primary.holdNextLatest();
        const primaryAttempt = primary.performLock(
          () => primaryForm.submit.click(),
          { expectedRequestNote: B12_NEUTRAL_TEXT.latestLockedPrimary },
        );
        await latestGate.waitForStarted();
        const secondarySuccess = await secondary.performLock(
          () => secondaryForm.submit.click(),
          {
            expectedRequestNote: B12_NEUTRAL_TEXT.latestLockedSecondary,
            expectedPersistedNote: B12_NEUTRAL_TEXT.latestLockedSecondary,
          },
        );
        expect(secondarySuccess.status).toBe(200);
        expect(secondarySuccess.facts).toMatchObject({
          alreadyLocked: false,
          report: { status: "confirmed", lockedAtPresent: true },
        });
        latestGate.resume();
        const primaryConflict = await primaryAttempt;
        expect(primaryConflict).toEqual({ status: 409, facts: null });
        await primary.waitForLatestCount(2);
        expect(await latestGate.dispose()).toEqual({
          matchedRequestCount: 1,
          abortedRequestCount: 0,
          continuedRequestCount: 1,
        });

        await expect(primaryForm.noteField).toHaveValue(
          B12_NEUTRAL_TEXT.latestLockedPrimary,
        );
        await expect(primaryForm.checkbox).not.toBeChecked();
        await expect(primaryForm.submit).toBeDisabled();
        await expect(
          primary.page.getByText("报告已由其他操作锁定，本地说明未提交", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          primary.page.getByRole("button", {
            name: "基于最新报告继续",
            exact: true,
          }),
        ).toHaveCount(0);
        expect(primary.lockRequestEvidence()).toHaveLength(1);
        expect(secondary.lockRequestEvidence()).toHaveLength(1);

        await primary.page
          .getByRole("button", { name: "取消", exact: true })
          .click();
        await expect(
          primary.page.getByText(B12_NEUTRAL_TEXT.latestLockedPrimary, {
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          primary.page
            .getByText(B12_NEUTRAL_TEXT.latestLockedSecondary, {
              exact: true,
            })
            .first(),
        ).toBeVisible();
        await assertNoAvailableLockEntry(primary.page);
        await assertNoAvailableLockEntry(secondary.page);
        await primary.assertCapturedActorIdsNotLeaked();
        await secondary.assertCapturedActorIdsNotLeaked();
      },
    );
  });
});
