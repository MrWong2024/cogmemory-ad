import type { Page } from "@playwright/test";

import {
  assertNoAvailableLockEntry,
  type B12BrowserSession,
} from "../../b12-core-support";
import { expect } from "../../../support/acceptance-test";
import {
  B12_CORE_OWNER_ACTION_COMPLETED,
  type B12CoreOwnerAction,
} from "./owner-action-types";

async function assertConfirmedUnlocked(session: B12BrowserSession) {
  expect(session.latestSafeFacts()).toMatchObject({
    status: "confirmed",
    source: "mixed",
    qualityStatus: "passed",
    isFinal: true,
    confirmationPresent: true,
    lockedAtPresent: false,
    lock: { present: false },
  });
  await expect(
    session.page.getByText("已确认，尚未锁定", { exact: true }).first(),
  ).toBeVisible();
}

async function openTechnicalSummary(page: Page) {
  const summary = page.getByText("查看报告技术信息与历史纳入范围", {
    exact: true,
  });
  await summary.click();
  return summary.locator("..");
}

async function assertNoProtectedReportSurface(page: Page) {
  for (const ariaLabelledBy of [
    "clinical-report-patient-snapshot-heading",
    "clinical-report-visit-snapshot-heading",
    "clinical-report-narrative-heading",
    "clinical-report-clinician-narrative-heading",
    "clinical-report-workflow-summary-heading",
  ]) {
    await expect(
      page.locator(`section[aria-labelledby="${ariaLabelledBy}"]`),
    ).toHaveCount(0);
  }
  for (const heading of ["报告工作流摘要", "报告锁定", "锁定摘要"]) {
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toHaveCount(0);
  }
  await assertNoAvailableLockEntry(page);
}

export const eligibilityOwnerActions = Object.freeze({
  "core-workflow/eligibility-state/draft-no-entry": async ({ run }) => {
    const session = await run.primary();
    expect(session.latestSafeFacts()).toMatchObject({
      status: "draft",
      isFinal: false,
      lockedAtPresent: false,
    });
    await assertNoAvailableLockEntry(session.page);
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
  "core-workflow/eligibility-state/pending-no-entry": async ({ run }) => {
    const session = await run.primary();
    expect(session.latestSafeFacts()).toMatchObject({
      status: "pending_confirmation",
      isFinal: false,
      lockedAtPresent: false,
    });
    await assertNoAvailableLockEntry(session.page);
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
  "core-workflow/eligibility-state/confirmed-doctor-entry": async ({ run }) => {
    const session = await run.primary();
    await assertConfirmedUnlocked(session);
    await expect(
      session.page.getByRole("button", {
        name: "准备锁定报告",
        exact: true,
      }),
    ).toBeEnabled();
    const technical = await openTechnicalSummary(session.page);
    await expect(technical).toContainText("status=confirmed");
    await expect(technical).toContainText("服务端标记为最终");
    await expect(session.page.getByText("locked", { exact: true })).toHaveCount(
      0,
    );
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
  "core-workflow/eligibility-state/confirmed-admin-entry": async ({ run }) => {
    const session = await run.primary();
    await assertConfirmedUnlocked(session);
    await expect(
      session.page.getByRole("button", {
        name: "准备锁定报告",
        exact: true,
      }),
    ).toBeEnabled();
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
  "core-workflow/eligibility-state/denied-role-entry": async ({ run }) => {
    const readableSessions = [await run.primary(), await run.secondary()];
    const system = await run.system();
    const sessions = [...readableSessions, system];
    expect(new Set(sessions.map(({ role }) => role))).toEqual(
      new Set(["nurse", "research_assistant", "system"]),
    );
    expect(new Set(sessions.map(({ page }) => page.context())).size).toBe(3);
    for (const session of readableSessions) {
      await assertConfirmedUnlocked(session);
      await assertNoAvailableLockEntry(session.page);
      await expect(
        session.page.getByRole("heading", {
          name: "报告锁定",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        session.page.getByText(
          "报告锁定需由医生或管理员执行。当前账号仍可查看报告和已有锁定摘要，后端 RolesGuard 是最终权限边界。",
          { exact: true },
        ),
      ).toBeVisible();
    }
    expect(system.latestCount()).toBe(0);
    expect(system.publicReadEvidence()).toMatchObject({
      method: "GET",
      status: 403,
      errorCategory: "forbidden",
      count: 1,
    });
    await expect(
      system.page.getByRole("heading", {
        name: "当前账号没有访问评估访视的权限",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      system.page.getByText("评估访视访问权限最终以后端校验结果为准。", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      system.page.getByText("患者 / 受试者编号：", { exact: false }),
    ).toHaveCount(0);
    await assertNoProtectedReportSurface(system.page);
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
  "core-workflow/eligibility-state/quality-not-passed": async ({ run }) => {
    const session = await run.primary();
    expect(session.latestSafeFacts()).toMatchObject({
      status: "confirmed",
      qualityStatus: "needs_review",
      isFinal: true,
      lockedAtPresent: false,
    });
    await assertNoAvailableLockEntry(session.page);
    await expect(
      session.page.getByText("报告流程质量标记未通过，不能锁定。", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(session.page.getByText("患者正常", { exact: true })).toHaveCount(
      0,
    );
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
  "core-workflow/eligibility-state/finality-inconsistent": async ({ run }) => {
    const session = await run.primary();
    expect(session.latestSafeFacts()).toMatchObject({
      status: "confirmed",
      qualityStatus: "passed",
      isFinal: false,
      lockedAtPresent: false,
    });
    expect(session.controlledRead()).toMatchObject({
      boundary: "controlled_public_read_boundary",
      variant: "is_final_false",
      requestCount: 1,
      changedPublicFields: ["report.isFinal"],
    });
    await assertNoAvailableLockEntry(session.page);
    await expect(
      session.page
        .getByText("报告状态与最终性标记不一致，请联系管理员。", {
          exact: true,
        })
        .first(),
    ).toBeVisible();
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
  "core-workflow/eligibility-state/confirmation-missing": async ({ run }) => {
    const session = await run.primary();
    expect(session.latestCount()).toBe(0);
    expect(session.publicReadEvidence()).toEqual({
      method: "GET",
      safeEndpointPattern:
        "/patients/<id>/visits/<id>/clinical-reports/latest",
      status: 409,
      errorCategory: "clinical_report_incomplete",
      count: 1,
    });
    await expect(
      session.page.getByText("暂时无法安全加载最新报告", { exact: true }),
    ).toBeVisible();
    await expect(
      session.page.getByText(
        "当前存在不完整的历史报告记录，系统不能自动修复，请联系管理员。",
        { exact: true },
      ),
    ).toBeVisible();
    await assertNoProtectedReportSurface(session.page);
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
  "core-workflow/eligibility-state/visit-locked-v1": async ({ run }) => {
    const session = await run.primary();
    await assertConfirmedUnlocked(session);
    await assertNoAvailableLockEntry(session.page);
    await expect(
      session.page.getByText("当前访视状态不允许首次锁定报告。", {
        exact: true,
      }),
    ).toBeVisible();
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
  "core-workflow/eligibility-state/visit-voided-v1": async ({ run }) => {
    const session = await run.primary();
    await assertConfirmedUnlocked(session);
    await assertNoAvailableLockEntry(session.page);
    await expect(
      session.page.getByText("当前访视状态不允许首次锁定报告。", {
        exact: true,
      }),
    ).toBeVisible();
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
  "core-workflow/eligibility-state/already-locked-no-repeat": async ({ run }) => {
    const session = await run.primary();
    expect(session.latestSafeFacts()).toMatchObject({
      status: "confirmed",
      isFinal: true,
      lockedAtPresent: true,
      lock: {
        present: true,
        lockIdPresent: false,
        lockedAtPresent: true,
        lockedBy: {
          operatorNamePresent: false,
          operatorRole: "unknown",
        },
        lockNotePresent: false,
      },
    });
    await assertNoAvailableLockEntry(session.page);
    await expect(
      session.page.getByRole("heading", {
        name: "报告已锁定",
        exact: true,
      }),
    ).toBeVisible();
    const lockSummary = session.page
      .getByRole("heading", { name: "锁定摘要", exact: true })
      .locator("..");
    await expect(lockSummary).toContainText("未提供姓名（未知角色）");
    await expect(
      lockSummary.getByText("技术追溯号", { exact: true }),
    ).toBeVisible();
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
  "core-workflow/eligibility-state/lock-without-locked-at-warning": async ({
    run,
  }) => {
    const session = await run.primary();
    expect(session.latestSafeFacts()).toMatchObject({
      lockedAtPresent: false,
      lock: { present: true },
    });
    expect(session.controlledRead()?.variant).toBe("top_level_locked_at_null");
    await assertNoAvailableLockEntry(session.page);
    await expect(
      session.page
        .getByText(
          "报告返回了锁定审计摘要，但顶层 lockedAt 为空；不能据此认定报告已锁定，也不能继续锁定，请联系管理员。",
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
  "core-workflow/eligibility-state/locked-at-without-lock-warning": async ({
    run,
  }) => {
    const session = await run.primary();
    expect(session.latestSafeFacts()).toMatchObject({
      lockedAtPresent: true,
      lock: { present: false },
    });
    expect(session.controlledRead()?.variant).toBe("lock_summary_null");
    await assertNoAvailableLockEntry(session.page);
    await expect(
      session.page
        .getByText(
          "报告已锁定，但当前安全响应未提供完整锁定审计摘要；系统不会猜测锁定人或说明。",
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
  "core-workflow/eligibility-state/lock-time-mismatch-warning": async ({
    run,
  }) => {
    const session = await run.primary();
    expect(session.latestSafeFacts()).toMatchObject({
      lockedAtPresent: true,
      lock: { present: true, lockedAtPresent: true },
    });
    expect(session.controlledRead()?.variant).toBe("lock_time_mismatch");
    await assertNoAvailableLockEntry(session.page);
    await expect(
      session.page
        .getByText(
          "顶层 lockedAt 与锁定审计摘要时间不一致；系统不会自行选择或覆盖时间，请联系管理员。",
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    return B12_CORE_OWNER_ACTION_COMPLETED;
  },
} as const satisfies Readonly<Record<string, B12CoreOwnerAction>>);
