import { readFile } from "node:fs/promises";
import type { Locator, Page, Response } from "@playwright/test";

import type { LockClinicalReportResponse } from "../../../src/features/assessments/types/clinical-report";
import { assertDatabaseBoundaryIsClear, resolveLiveAcceptanceEnvironment } from "../support/acceptance-env";
import { expect, test } from "../support/acceptance-test";
import { ControlledRequestGate } from "../support/network-control";
import { NetworkLedger, type NetworkLedgerEntry } from "../support/network-ledger";
import { safeJsonStringify } from "../support/safe-output";

type RuntimeDescriptor = {
  schemaVersion: 1;
  batch: "B12";
  profile: "B12-P1-user-entry-readonly";
  accounts: { doctor: { loginIdentifier: string } };
  scenarios: Record<"unlocked-confirmed", { reportId: string; navigationPath: string }>;
};

type EnabledEnvironment = Extract<ReturnType<typeof resolveLiveAcceptanceEnvironment>, { enabled: true }>;

const environment = resolveLiveAcceptanceEnvironment();
const REPORT_MARKER = "B12-U01 synthetic readable report marker.";
const LOCK_NOTE = "B12 U02 脱敏首次锁定说明";
const LOCK_PATTERN = "/patients/<id>/visits/<id>/clinical-reports/<id>/lock";

function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 16) {
    throw new Error(`${name} must be injected for live U02`);
  }
  return value;
}

async function readDescriptor(): Promise<RuntimeDescriptor> {
  const runtimePath = process.env.B12_U01_RUNTIME_PATH;
  if (!runtimePath) throw new Error("B12_U01_RUNTIME_PATH is required");
  const value = JSON.parse(await readFile(runtimePath, "utf8")) as unknown;
  const candidate = value as Partial<RuntimeDescriptor>;
  expect(candidate.schemaVersion).toBe(1);
  expect(candidate.batch).toBe("B12");
  expect(candidate.profile).toBe("B12-P1-user-entry-readonly");
  expect(candidate.accounts?.doctor.loginIdentifier).toBeTruthy();
  expect(candidate.scenarios?.["unlocked-confirmed"].navigationPath)
    .toMatch(/^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}$/);
  return candidate as RuntimeDescriptor;
}

function responsePath(response: Response): string {
  return new URL(response.url()).pathname;
}

function isAdjacentLifecycleRequest(entry: NetworkLedgerEntry): boolean {
  const path = entry.safeUrlPattern;
  return /\/(?:draft|submit-confirmation|confirm|freeze-sources|archive|corrections|void)$/.test(path)
    || /(?:pdf|print|download|\bai\b|llm)/i.test(path);
}

async function openReport(
  page: Page,
  navigationPath: string,
  environment: EnabledEnvironment,
  reload = false,
): Promise<LockClinicalReportResponse["report"]> {
  const latestPromise = page.waitForResponse(
    (response) =>
      responsePath(response).endsWith("/clinical-reports/latest") &&
      response.request().method() === "GET" &&
      response.status() === 200,
  );
  if (reload) await page.reload({ waitUntil: "domcontentloaded" });
  else {
    await page.goto(`${environment.frontendOrigin}${navigationPath}`, {
      waitUntil: "domcontentloaded",
    });
  }
  const latest = await latestPromise;
  return ((await latest.json()) as { report: LockClinicalReportResponse["report"] }).report;
}

async function readVisibleLockFacts(locator: Locator) {
  return locator.evaluate((element, expectedNote) => {
    const text = element.textContent ?? "";
    const trace = text.match(/技术追溯号\s*([^。]+)/)?.[1]?.trim();
    return {
      firstLock: text.includes("首次不可逆锁定成功"),
      doctor: text.includes("B12 测试医生（医生）"),
      note: text.includes(expectedNote),
      timePresent: !text.includes("锁定时间—"),
      tracePresent: Boolean(trace && trace !== "—"),
    };
  }, LOCK_NOTE);
}

test.describe("B12-U02 first lock", () => {
  test.beforeEach(() => {
    test.skip(!environment.enabled, "BROWSER_ACCEPTANCE_RUN_LIVE=1 is required");
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test("doctor completes one real first lock and reloads persisted facts", async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const password = requireSecret("B12_U01_LOGIN_SECRET");
    const doctor = await roleContexts.create("doctor", "u02-first-lock");
    const { context, page } = doctor;
    const ledger = new NetworkLedger();
    await ledger.attach(page);

    await page.goto(`${environment.frontendOrigin}/login`, { waitUntil: "domcontentloaded" });
    expect(await page.evaluate(() => window.location.origin)).toBe(
      environment.frontendOrigin,
    );
    const healthPromise = page.waitForResponse((response) =>
      response.url() === `${environment.backendOrigin}/health`
      && response.request().method() === "GET");
    const healthStatus = await page.evaluate(async (backendOrigin) => {
      const response = await fetch(`${backendOrigin}/health`, {
        credentials: "include",
        cache: "no-store",
      });
      return response.status;
    }, environment.backendOrigin);
    const healthResponse = await healthPromise;
    expect(healthStatus).toBe(200);
    expect(new URL(healthResponse.url()).origin).toBe(environment.backendOrigin);

    const loginPromise = page.waitForResponse((response) =>
      responsePath(response) === "/auth/login" && response.request().method() === "POST");
    const mePromise = page.waitForResponse((response) =>
      responsePath(response) === "/auth/me"
      && response.request().method() === "GET" && response.status() === 200);
    await page.getByLabel("账号").fill(descriptor.accounts.doctor.loginIdentifier);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录系统", exact: true }).click();
    const [loginResponse, meResponse] = await Promise.all([loginPromise, mePromise]);
    expect(loginResponse.status()).toBe(201);
    expect(new URL(loginResponse.url()).origin).toBe(environment.backendOrigin);
    expect((await loginResponse.request().allHeaders())["origin"]).toBe(
      environment.frontendOrigin,
    );
    const me = (await meResponse.json()) as {
      authenticated?: unknown;
      user?: { roles?: unknown };
    };
    expect(me).toMatchObject({ authenticated: true, user: { roles: ["doctor"] } });
    const httpOnlyCookies = (await context.cookies(environment.backendOrigin))
      .filter((cookie) => cookie.httpOnly);
    expect(httpOnlyCookies).toHaveLength(1);
    expect(httpOnlyCookies[0]).toMatchObject({
      name: "cogmemory_ad_session",
      domain: new URL(environment.backendOrigin).hostname,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    });

    const scenario = descriptor.scenarios["unlocked-confirmed"];
    const initialReport = await openReport(page, scenario.navigationPath, environment);
    expect(initialReport).toMatchObject({
      id: scenario.reportId,
      status: "confirmed",
      lockedAt: null,
      lock: null,
      archivedAt: null,
      sourceFreeze: null,
    });
    await expect(page.getByText(REPORT_MARKER, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "准备锁定报告", exact: true }).click();
    await expect(page.getByRole("heading", { name: "二次确认不可逆锁定", exact: true }))
      .toBeVisible();
    for (const statement of [
      "锁定不可撤销，当前系统不提供 unlock。",
      "锁定只作用于当前 ClinicalReport，不会锁定患者、访视、量表实例、评分、认知域或媒体。",
      "锁定不等于归档，不生成签名，也不生成 PDF 或下载文件。",
      "锁定过程不调用 AI；qualityStatus=passed 不表示患者正常，也不形成新的诊断结论。",
      "锁定流程说明仅用于本次锁定审计，不属于报告正文。",
    ]) {
      await expect(page.getByText(statement, { exact: true })).toBeVisible();
    }
    const note = page.getByLabel("锁定流程说明（必填）");
    const checkbox = page.getByLabel(/我已核对当前已确认报告/);
    const submit = page.getByRole("button", {
      name: "确认不可逆锁定",
      exact: true,
    });
    await expect(note).toHaveValue("");
    await expect(checkbox).not.toBeChecked();
    await expect(submit).toBeDisabled();
    await note.fill(" 甲乙 ");
    await checkbox.check();
    await expect(submit).toBeDisabled();
    await note.fill(LOCK_NOTE);
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(submit).toBeEnabled();

    const lockPath = `${scenario.navigationPath}/clinical-reports/${scenario.reportId}/lock`;
    const gate = new ControlledRequestGate(
      page,
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === lockPath,
      8_000,
    );
    await gate.install();
    const lockResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        responsePath(response) === lockPath,
    );
    await submit.click();
    await gate.waitForStarted(5_000);
    expect(gate.summary()).toMatchObject({ matchedRequestCount: 1 });
    const pendingButton = page.getByRole("button", {
      name: "正在不可逆锁定报告",
      exact: true,
    });
    await expect(pendingButton).toBeDisabled();
    await expect(note).toBeDisabled();
    await expect(checkbox).toBeDisabled();
    await expect(page.getByText(REPORT_MARKER, { exact: true })).toBeVisible();
    expect(ledger.count({ method: "POST", safeUrlPattern: LOCK_PATTERN })).toBe(1);

    gate.resume();
    const lockResponse = await lockResponsePromise;
    const responseBody = (await lockResponse.json()) as LockClinicalReportResponse;
    expect(lockResponse.status()).toBe(200);
    const gateSummary = await gate.dispose();
    expect(gateSummary).toEqual({
      matchedRequestCount: 1,
      abortedRequestCount: 0,
      continuedRequestCount: 1,
    });
    const lockEntries = ledger
      .entries()
      .filter(
        (entry) =>
          entry.method === "POST" && entry.safeUrlPattern === LOCK_PATTERN,
      );
    expect(lockEntries).toHaveLength(1);
    expect(lockEntries[0]).toMatchObject({
      status: 200,
      bodyKeys: ["confirm", "expectedUpdatedAt", "lockNote"],
      failureReason: null,
    });
    ledger.assertNoAutomaticRetry({ method: "POST", safeUrlPattern: LOCK_PATTERN });
    expect(responseBody).toMatchObject({
      report: {
        id: scenario.reportId,
        status: "confirmed",
        archivedAt: null,
        archive: null,
        sourceFreeze: null,
        voidedAt: null,
      },
      lockReceipt: { alreadyLocked: false, lockNote: LOCK_NOTE },
    });
    expect(responseBody.report.lockedAt).toBeTruthy();
    expect(responseBody.report.lock?.lockId).toBeTruthy();
    expect(responseBody.report.lock?.lockNote).toBe(LOCK_NOTE);
    expect(responseBody.report.lock?.lockedBy).toMatchObject({ operatorRole: "doctor" });
    expect(responseBody.lockReceipt.lockId).toBeTruthy();
    expect(responseBody.lockReceipt.lockedAt).toBeTruthy();
    expect(responseBody.lockReceipt.lockedBy).toMatchObject({ operatorRole: "doctor" });
    expect(responseBody.report.narrative?.chiefSummary).toBe(REPORT_MARKER);

    for (const text of [
      "报告已确认并完成不可逆锁定。",
      "已确认报告",
      "已锁定",
      "报告尚未归档",
    ]) {
      await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
    }
    const receipt = page.getByText("本次锁定回执：", { exact: false });
    const receiptFacts = await readVisibleLockFacts(receipt);
    expect(receiptFacts).toMatchObject({
      firstLock: true,
      doctor: true,
      note: true,
      tracePresent: true,
    });
    const lockSummary = page
      .getByRole("heading", { name: "锁定摘要", exact: true })
      .locator("..");
    const summaryFacts = await readVisibleLockFacts(lockSummary);
    expect(summaryFacts).toMatchObject({
      timePresent: true,
      doctor: true,
      note: true,
      tracePresent: true,
    });
    await expect(page.getByText(REPORT_MARKER, { exact: true })).toBeVisible();
    expect(ledger.entries().filter(isAdjacentLifecycleRequest)).toHaveLength(0);

    const reloaded = await openReport(page, scenario.navigationPath, environment, true);
    await expect(receipt).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "锁定摘要", exact: true })).toBeVisible();
    await expect(page.getByText(LOCK_NOTE, { exact: true }).first()).toBeVisible();
    for (const text of ["已确认报告", "已锁定", "报告尚未归档"]) {
      await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText("报告来源尚未冻结。", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(REPORT_MARKER, { exact: true })).toBeVisible();
    expect(reloaded).toMatchObject({
      status: "confirmed",
      archivedAt: null,
      sourceFreeze: null,
      narrative: { chiefSummary: REPORT_MARKER },
    });
    expect(reloaded.lockedAt).toBeTruthy();
    expect(reloaded.lock?.lockNote).toBe(LOCK_NOTE);
    expect(ledger.count({ method: "POST", safeUrlPattern: LOCK_PATTERN })).toBe(1);
    expect(ledger.entries().filter(isAdjacentLifecycleRequest)).toHaveLength(0);

    const networkSummary = await ledger.detach();
    const closed = await roleContexts.closeAll();
    expect(closed.activeContextCount).toBe(0);
    console.log(
      `B12_U02_EVIDENCE ${safeJsonStringify(
        {
          session: { doctorContextCount: 1, healthStatus, authMeRole: "doctor", httpOnlyCookieCount: 1 },
          validation: "trimmed_two_blocked_checkbox_reset",
          gate: gateSummary,
          lockPost: { count: 1, status: 200, bodyKeys: lockEntries[0]?.bodyKeys },
          pending: "controls_disabled_report_readable",
          receipt: "first_lock_complete_with_weak_trace",
          adjacentLifecycleRequests: 0,
          reload: "receipt_absent_persisted_confirmed_lock_only",
          networkFailedRequestCount: networkSummary.failedRequestCount,
          contextsClosed: true,
        },
        [password, descriptor.accounts.doctor.loginIdentifier],
      )}`,
    );
  });
});
