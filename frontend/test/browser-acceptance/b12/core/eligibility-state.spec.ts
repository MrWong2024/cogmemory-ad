import type { Page } from "@playwright/test";

import { resolveB12BrowserEnvironment } from "../b12-env";
import {
  assertNoAvailableLockEntry,
  runB12CoreRoute,
  type B12BrowserSession,
} from "../b12-core-support";
import { expect, test } from "../../support/acceptance-test";

const environment = resolveB12BrowserEnvironment();

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

test.describe("B12 core / eligibility-state", () => {
  test.describe.configure({ timeout: 120_000 });

  test("draft-no-entry owns B12-01", async ({ roleContexts }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "eligibility-state",
          routeKey: "draft-no-entry",
        },
      },
      async (run) => {
        const session = await run.primary();
        expect(session.latestSafeFacts()).toMatchObject({
          status: "draft",
          isFinal: false,
          lockedAtPresent: false,
        });
        await assertNoAvailableLockEntry(session.page);
      },
    );
  });

  test("pending-no-entry owns B12-02", async ({ roleContexts }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "eligibility-state",
          routeKey: "pending-no-entry",
        },
      },
      async (run) => {
        const session = await run.primary();
        expect(session.latestSafeFacts()).toMatchObject({
          status: "pending_confirmation",
          isFinal: false,
          lockedAtPresent: false,
        });
        await assertNoAvailableLockEntry(session.page);
      },
    );
  });

  test("confirmed-doctor-entry owns B12-03, B12-04, and B12-09 through B12-11", async ({
    roleContexts,
  }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "eligibility-state",
          routeKey: "confirmed-doctor-entry",
        },
      },
      async (run) => {
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
        await expect(
          session.page.getByText("locked", { exact: true }),
        ).toHaveCount(0);
      },
    );
  });

  test("confirmed-admin-entry owns B12-05", async ({ roleContexts }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "eligibility-state",
          routeKey: "confirmed-admin-entry",
        },
      },
      async (run) => {
        const session = await run.primary();
        await assertConfirmedUnlocked(session);
        await expect(
          session.page.getByRole("button", {
            name: "准备锁定报告",
            exact: true,
          }),
        ).toBeEnabled();
      },
    );
  });

  test("denied-role-entry owns B12-06 through B12-08", async ({
    roleContexts,
  }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    test.setTimeout(90_000);
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "eligibility-state",
          routeKey: "denied-role-entry",
        },
      },
      async (run) => {
        const sessions = [
          await run.primary(),
          await run.secondary(),
          await run.system(),
        ];
        expect(new Set(sessions.map(({ role }) => role))).toEqual(
          new Set(["nurse", "research_assistant", "system"]),
        );
        expect(new Set(sessions.map(({ page }) => page.context())).size).toBe(
          3,
        );
        for (const session of sessions) {
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
      },
    );
  });

  test("quality-not-passed owns B12-12", async ({ roleContexts }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "eligibility-state",
          routeKey: "quality-not-passed",
        },
      },
      async (run) => {
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
        await expect(
          session.page.getByText("患者正常", { exact: true }),
        ).toHaveCount(0);
      },
    );
  });

  test("finality-inconsistent owns B12-13", async ({ roleContexts }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "eligibility-state",
          routeKey: "finality-inconsistent",
        },
      },
      async (run) => {
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
      },
    );
  });

  test("confirmation-missing owns B12-14", async ({ roleContexts }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "eligibility-state",
          routeKey: "confirmation-missing",
        },
      },
      async (run) => {
        const session = await run.primary();
        expect(session.latestSafeFacts()).toMatchObject({
          status: "confirmed",
          confirmationPresent: false,
          lockedAtPresent: false,
        });
        await assertNoAvailableLockEntry(session.page);
        await expect(
          session.page.getByText("当前报告缺少完整的医生或管理员确认摘要。", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          session.page.getByText(
            "当前安全响应未提供完整确认摘要；不会使用访视操作者补齐。",
            { exact: true },
          ),
        ).toBeVisible();
      },
    );
  });

  for (const routeKey of ["visit-locked-v1", "visit-voided-v1"] as const) {
    test(`${routeKey} owns the ${routeKey === "visit-locked-v1" ? "primary" : "supporting"} Browser route for B12-15`, async ({
      roleContexts,
    }) => {
      test.skip(
        !environment.enabled,
        "B12_BROWSER_ACCEPTANCE_RUN=1 is required",
      );
      if (!environment.enabled) return;
      await runB12CoreRoute(
        {
          environment,
          roleContexts,
          target: { scenarioKey: "eligibility-state", routeKey },
        },
        async (run) => {
          const session = await run.primary();
          await assertConfirmedUnlocked(session);
          await assertNoAvailableLockEntry(session.page);
          await expect(
            session.page.getByText("当前访视状态不允许首次锁定报告。", {
              exact: true,
            }),
          ).toBeVisible();
        },
      );
    });
  }

  test("already-locked-no-repeat owns B12-16", async ({ roleContexts }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "eligibility-state",
          routeKey: "already-locked-no-repeat",
        },
      },
      async (run) => {
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
      },
    );
  });

  test("lock-without-locked-at-warning owns B12-17", async ({
    roleContexts,
  }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "eligibility-state",
          routeKey: "lock-without-locked-at-warning",
        },
      },
      async (run) => {
        const session = await run.primary();
        expect(session.latestSafeFacts()).toMatchObject({
          lockedAtPresent: false,
          lock: { present: true },
        });
        expect(session.controlledRead()?.variant).toBe(
          "top_level_locked_at_null",
        );
        await assertNoAvailableLockEntry(session.page);
        await expect(
          session.page
            .getByText(
              "报告返回了锁定审计摘要，但顶层 lockedAt 为空；不能据此认定报告已锁定，也不能继续锁定，请联系管理员。",
              { exact: true },
            )
            .first(),
        ).toBeVisible();
      },
    );
  });

  test("locked-at-without-lock-warning owns B12-18", async ({
    roleContexts,
  }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "eligibility-state",
          routeKey: "locked-at-without-lock-warning",
        },
      },
      async (run) => {
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
      },
    );
  });

  test("lock-time-mismatch-warning owns B12-19", async ({ roleContexts }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "eligibility-state",
          routeKey: "lock-time-mismatch-warning",
        },
      },
      async (run) => {
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
      },
    );
  });
});
