import type { Page } from "@playwright/test";

import {
  B12_NEUTRAL_TEXT,
  assertNoA21WriteControls,
  assertNoAvailableLockEntry,
  assertReportNarrativeSectionsExcludeText,
  reportNarrativeSections,
  type B12BrowserSession,
} from "../../b12-core-support";
import { expect } from "../../../support/acceptance-test";
import {
  B12_CORE_OWNER_ACTION_COMPLETED,
  type B12CoreOwnerAction,
} from "./owner-action-types";

async function openLockForm(page: Page, note: string) {
  await page.getByRole("button", { name: "准备锁定报告", exact: true }).click();
  const noteField = page.getByLabel("锁定流程说明（必填）", { exact: true });
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

async function assertPendingState(page: Page) {
  await expect(
    page.getByRole("button", {
      name: "正在不可逆锁定报告",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("锁定流程说明（必填）", { exact: true }),
  ).toBeDisabled();
  await expect(page.locator("#clinical-report-lock-confirmed")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "取消", exact: true }),
  ).toBeDisabled();
  await assertNoA21WriteControls(page);
  await expect(reportNarrativeSections(page).first()).toBeVisible();
}

async function assertFirstLockSuccess(
  session: B12BrowserSession,
  note: string,
  role: "doctor" | "admin",
) {
  const form = await openLockForm(session.page, `  ${note}  `);
  const result = await session.performLockWithPendingGate(
    () => form.submit.click(),
    () => assertPendingState(session.page),
    {
      expectedRequestNote: note,
      expectedPersistedNote: note,
    },
  );
  expect(result.status).toBe(200);
  expect(result.facts).toMatchObject({
    report: {
      status: "confirmed",
      source: "mixed",
      qualityStatus: "passed",
      isFinal: true,
      lockedAtPresent: true,
      lock: {
        present: true,
        lockIdPresent: true,
        lockedAtPresent: true,
        lockedBy: { operatorNamePresent: true, operatorRole: role },
        lockNotePresent: true,
      },
    },
    receiptPresent: true,
    alreadyLocked: false,
    receiptLockIdPresent: true,
    receiptLockedAtPresent: true,
    receiptLockedBy: { operatorNamePresent: true, operatorRole: role },
    receiptLockNotePresent: true,
    receiptLockNoteMatchesExpected: true,
  });
  await expect(
    session.page.getByText("首次不可逆锁定成功", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    session.page.getByRole("heading", { name: "报告已锁定", exact: true }),
  ).toBeVisible();
  await expect(
    session.page.getByRole("heading", { name: "锁定摘要", exact: true }),
  ).toBeVisible();
  await expect(session.page.getByText(note, { exact: true }).first()).toBeVisible();
  await assertReportNarrativeSectionsExcludeText(session.page, note);
  await assertNoAvailableLockEntry(session.page);

  const lockSummary = session.page
    .getByRole("heading", { name: "锁定摘要", exact: true })
    .locator("..");
  const traceRow = lockSummary
    .getByText("技术追溯号", { exact: true })
    .locator("..");
  const tracePresentation = await traceRow.locator("dd").evaluate((node) => ({
    hasValue: (node.textContent ?? "").trim().length > 0,
    visuallyMuted: node.className.includes("cma-muted"),
  }));
  expect(tracePresentation).toEqual({ hasValue: true, visuallyMuted: true });
  const technical = session.page.getByText("查看报告技术信息与历史纳入范围", {
    exact: true,
  });
  await technical.click();
  await expect(technical.locator("..")).toContainText("status=confirmed");
  await session.assertCapturedActorIdsNotLeaked();
}

export const successIdempotencyOwnerActions = Object.freeze({
  "core-workflow/success-idempotency/doctor-lock-success": async ({ run }) => {
    const session = await run.primary();
    await assertFirstLockSuccess(session, B12_NEUTRAL_TEXT.doctorLock, "doctor");
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
  "core-workflow/success-idempotency/admin-lock-success": async ({ run }) => {
    const session = await run.primary();
    await assertFirstLockSuccess(session, B12_NEUTRAL_TEXT.adminLock, "admin");
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
  "core-workflow/success-idempotency/already-locked-idempotency": async ({
    run,
  }) => {
    const primary = await run.primary();
    const primaryOpeningUpdatedAt = primary.initialUpdatedAt();
    const primaryForm = await openLockForm(
      primary.page,
      B12_NEUTRAL_TEXT.primaryLock,
    );

    const secondary = await run.secondary();
    expect(primary.page.context()).not.toBe(secondary.page.context());
    const secondaryForm = await openLockForm(
      secondary.page,
      B12_NEUTRAL_TEXT.secondaryLock,
    );
    const first = await secondary.performLock(
      () => secondaryForm.submit.click(),
      {
        expectedRequestNote: B12_NEUTRAL_TEXT.secondaryLock,
        expectedPersistedNote: B12_NEUTRAL_TEXT.secondaryLock,
      },
    );
    expect(first.status).toBe(200);
    expect(first.facts).toMatchObject({
      alreadyLocked: false,
      receiptPresent: true,
      receiptLockNoteMatchesExpected: true,
      report: {
        status: "confirmed",
        lockedAtPresent: true,
        lock: { present: true },
      },
    });

    expect(primary.latestCount()).toBe(1);
    expect(primary.latestUpdatedAt()).toBe(primaryOpeningUpdatedAt);
    const repeated = await primary.performLock(
      () => primaryForm.submit.click(),
      {
        expectedRequestNote: B12_NEUTRAL_TEXT.primaryLock,
        expectedPersistedNote: B12_NEUTRAL_TEXT.secondaryLock,
      },
    );
    expect(repeated.status).toBe(200);
    expect(repeated.facts).toMatchObject({
      alreadyLocked: true,
      receiptPresent: true,
      receiptLockNoteMatchesExpected: true,
      report: {
        status: "confirmed",
        qualityStatus: "passed",
        lockedAtPresent: true,
        lock: { present: true },
      },
    });
    expect(primary.latestCount()).toBe(1);
    expect(primary.lockRequestEvidence()).toHaveLength(1);
    expect(secondary.lockRequestEvidence()).toHaveLength(1);
    await expect(
      primary.page.getByText("该报告此前已经锁定，本次未重复写入。", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      primary.page.getByText(B12_NEUTRAL_TEXT.primaryLock, { exact: true }),
    ).toHaveCount(0);
    await expect(
      primary.page
        .getByText(B12_NEUTRAL_TEXT.secondaryLock, { exact: true })
        .first(),
    ).toBeVisible();
    await assertNoAvailableLockEntry(primary.page);
    await assertNoAvailableLockEntry(secondary.page);
    await primary.assertCapturedActorIdsNotLeaked();
    await secondary.assertCapturedActorIdsNotLeaked();
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
} as const satisfies Readonly<Record<string, B12CoreOwnerAction>>);
