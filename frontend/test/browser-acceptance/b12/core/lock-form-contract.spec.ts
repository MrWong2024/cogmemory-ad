import { resolveB12BrowserEnvironment } from "../b12-env";
import { B12_NEUTRAL_TEXT, runB12CoreRoute } from "../b12-core-support";
import { expect, test } from "../../support/acceptance-test";

const environment = resolveB12BrowserEnvironment();

async function openLockForm(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "准备锁定报告", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "二次确认不可逆锁定", exact: true }),
  ).toBeVisible();
  return {
    note: page.getByLabel("锁定流程说明（必填）", { exact: true }),
    checkbox: page.locator("#clinical-report-lock-confirmed"),
    submit: page.getByRole("button", {
      name: "确认不可逆锁定",
      exact: true,
    }),
  };
}

test.describe("B12 core / lock-form-contract", () => {
  test.describe.configure({ timeout: 120_000 });

  test("irreversible-disclosure owns B12-20 through B12-25, B12-28, and B12-29", async ({
    roleContexts,
  }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "lock-form-contract",
          routeKey: "irreversible-disclosure",
        },
      },
      async (run) => {
        const session = await run.primary();
        const form = await openLockForm(session.page);
        await expect(form.note).toHaveValue("");
        await expect(form.checkbox).not.toBeChecked();
        await expect(form.submit).toBeDisabled();
        for (const statement of [
          "当前报告已经确认；锁定后真实 status 仍为 confirmed。",
          "系统通过顶层 lockedAt 和锁定审计摘要表达锁定，不新增 locked 状态。",
          "锁定不可撤销，当前系统不提供 unlock。",
          "锁定只作用于当前 ClinicalReport，不会锁定患者、访视、量表实例、评分、认知域或媒体。",
          "锁定不等于归档，不生成签名，也不生成 PDF 或下载文件。",
          "锁定过程不调用 AI；qualityStatus=passed 不表示患者正常，也不形成新的诊断结论。",
          "锁定流程说明仅用于本次锁定审计，不属于报告正文。",
        ]) {
          await expect(
            session.page.getByText(statement, { exact: true }),
          ).toBeVisible();
        }
        await expect(
          session.page.getByText(
            "trim 后 3–2000 个字符；不自动生成，也不预填其他报告意见。",
            { exact: true },
          ),
        ).toBeVisible();
        expect(session.lockRequestEvidence()).toEqual([]);
      },
    );
  });

  test("validation-request-contract owns B12-26, B12-27, and B12-30 through B12-32", async ({
    roleContexts,
  }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    test.setTimeout(60_000);
    await runB12CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: "lock-form-contract",
          routeKey: "validation-request-contract",
        },
      },
      async (run) => {
        const session = await run.primary();
        const frozenUpdatedAt = session.initialUpdatedAt();
        const form = await openLockForm(session.page);
        await expect(form.note).toHaveAttribute("maxlength", "2000");
        await expect(form.note).toHaveValue("");
        await expect(form.checkbox).not.toBeChecked();
        await expect(form.submit).toBeDisabled();

        await form.note.fill(" a ");
        await form.checkbox.check();
        await expect(form.submit).toBeDisabled();
        await expect(
          session.page.getByText("锁定流程说明需为 3–2000 个字符。", {
            exact: true,
          }),
        ).toBeVisible();
        expect(session.lockRequestEvidence()).toEqual([]);

        const boundary = "x".repeat(2000);
        await form.note.fill(boundary);
        await form.checkbox.check();
        await expect(form.submit).toBeEnabled();
        await form.note.press("End");
        await form.note.press("x");
        expect((await form.note.inputValue()).length).toBe(2000);
        expect(await form.note.inputValue()).toBe(boundary);
        expect(session.lockRequestEvidence()).toEqual([]);

        const padded = `  ${B12_NEUTRAL_TEXT.requestInspection}  `;
        await form.note.fill(padded);
        await form.checkbox.check();
        await expect(form.submit).toBeEnabled();
        await session.abortLockRequest(() => form.submit.click(), padded);
        const [request] = session.lockRequestEvidence();
        expect(request).toEqual({
          bodyKeys: ["confirm", "expectedUpdatedAt", "lockNote"],
          confirmIsTrue: true,
          expectedUpdatedAtMatchesLatest: true,
          lockNoteTrimmed: true,
          lockNoteLength: B12_NEUTRAL_TEXT.requestInspection.length,
          lockNoteMatchesExpected: true,
          forbiddenBodyKeyDetected: false,
        });
        expect(session.initialUpdatedAt()).toBe(frozenUpdatedAt);
        expect(session.latestCount()).toBe(1);
      },
    );
  });
});
