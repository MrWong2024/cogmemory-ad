import { resolveB12BrowserEnvironment } from "../b12-env";
import {
  assertNoA21WriteControls,
  assertNoAvailableLockEntry,
  reportNarrativeSections,
  runB12CoreRoute,
} from "../b12-core-support";
import { expect, test } from "../../support/acceptance-test";

const environment = resolveB12BrowserEnvironment();

test.describe("B12 core / locked-readonly", () => {
  test.describe.configure({ timeout: 120_000 });

  test("locked-readonly-semantics owns B12-64 through B12-70", async ({
    roleContexts,
  }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "locked-readonly",
          routeKey: "locked-readonly-semantics",
        },
      },
      async (run) => {
        const session = await run.primary();
        expect(session.latestSafeFacts()).toMatchObject({
          status: "confirmed",
          source: "mixed",
          qualityStatus: "passed",
          isFinal: true,
          confirmationPresent: true,
          lockedAtPresent: true,
          lock: {
            present: true,
            lockIdPresent: true,
            lockedAtPresent: true,
            lockNotePresent: true,
          },
          sourceFreezePresent: false,
          archivedAtPresent: false,
          archivePresent: false,
          voidedAtPresent: false,
        });
        await assertNoA21WriteControls(session.page);
        await assertNoAvailableLockEntry(session.page);
        await expect(
          session.page.getByRole("heading", {
            name: "报告已锁定",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          session.page.getByText("已确认并锁定", { exact: true }).first(),
        ).toBeVisible();
        await expect(
          session.page.getByText("locked", { exact: true }),
        ).toHaveCount(0);
        await expect(reportNarrativeSections(session.page)).toHaveCount(2);
        await expect(
          reportNarrativeSections(session.page).first(),
        ).toBeVisible();
        await expect(
          reportNarrativeSections(session.page).last(),
        ).toBeVisible();
        await expect(
          session.page.getByText(
            "当前报告自身已经确认并锁定，但 sourceFreeze=null 表示报告来源尚未冻结。报告锁定与来源冻结是两个独立阶段；Patient、Visit 与 Storage 未冻结。",
            { exact: true },
          ),
        ).toBeVisible();

        const technical = session.page.locator("details").filter({
          hasText: "查看报告技术信息与历史纳入范围",
        });
        await technical.locator("summary").click();
        await expect(technical).toContainText("status=confirmed");
        await expect(
          technical
            .locator("dt")
            .filter({ hasText: /^锁定时间$/ })
            .locator("..")
            .locator("dd"),
        ).not.toHaveText("—");
        await expect(
          technical
            .locator("dt")
            .filter({ hasText: /^归档时间$/ })
            .locator("..")
            .locator("dd"),
        ).toHaveText("—");
        expect(session.lockRequestEvidence()).toEqual([]);
        await session.assertCapturedActorIdsNotLeaked();
      },
    );
  });
});
