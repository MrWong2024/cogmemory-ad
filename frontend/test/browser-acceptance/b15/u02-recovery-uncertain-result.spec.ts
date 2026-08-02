import { readFile } from "node:fs/promises";

import type {
  BrowserContext,
  Dialog,
  Locator,
  Page,
  Request,
  Response,
} from "@playwright/test";

import type {
  ClinicalReport,
  ClinicalReportCorrectionSummary,
  CreateClinicalReportCorrectionResponse,
} from "../../../src/features/assessments/types/clinical-report";
import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from "../support/acceptance-env";
import { expect, test } from "../support/acceptance-test";
import { OneShotRequestAbort } from "../support/network-control";
import {
  NetworkLedger,
  type NetworkLedgerEntry,
} from "../support/network-ledger";
import type {
  RoleContext,
  RoleContextFactory,
} from "../support/role-context-factory";
import { safeJsonStringify } from "../support/safe-output";

type Scenario = {
  patientId: string;
  visitId: string;
  sourceReportId: string;
  navigationPath: string;
  preparedBaseline: Record<string, string | number>;
};

type Descriptor = {
  schemaVersion: 1;
  batch: "B15";
  profile: "B15-P2-recovery-uncertain-result";
  namespace: string;
  accounts: Record<"doctor" | "nurse", { loginIdentifier: string }>;
  scenarios: Record<
    "correction-in-progress" | "correction-network-uncertain",
    Scenario
  >;
};

type EnabledEnvironment = Extract<
  ReturnType<typeof resolveLiveAcceptanceEnvironment>,
  { enabled: true }
>;

type AuthUser = {
  id: string;
  displayName: string;
  roles: string[];
};

type Session = {
  roleContext: RoleContext;
  ledger: NetworkLedger;
  user: AuthUser;
  healthStatus: number;
};

type CapturedCorrectionRequest = {
  keys: string[];
  confirm: unknown;
  correctionReason: unknown;
  changeSummary: unknown;
  expectedUpdatedAt: unknown;
};

type StorageBoundary = {
  localStorageClear: true;
  sessionStorageClear: true;
  indexedDbClear: true;
  queryClear: true;
  hashClear: true;
  cookiesClear: true;
};

const environment = resolveLiveAcceptanceEnvironment();
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const PERSISTED_SOURCE_MARKER =
  "B15-U02 synthetic persisted correction source marker.";
const UNCERTAIN_SOURCE_MARKER =
  "B15-U02 synthetic uncertain correction source marker.";
const PERSISTED_REASON = "B15 U02 脱敏恢复更正原因";
const PERSISTED_SUMMARY = "B15 U02 脱敏恢复更正摘要";
const LOCAL_REASON = "B15 U02 脱敏网络不确定更正原因";
const LOCAL_SUMMARY = "B15 U02 脱敏网络不确定更正摘要";
const UNCERTAIN_MESSAGE =
  "更正请求结果暂不确定；系统不会自动重试，请保留本地说明并手工重新加载最新报告核对。";
const CHECKBOX_NAME =
  "我已核对原归档报告与线性版本边界，并明确确认创建或继续同一替代版本流程。";
const CORRECTION_PATTERN =
  "/patients/<id>/visits/<id>/clinical-reports/<id>/corrections";
const LATEST_PATTERN = "/patients/<id>/visits/<id>/clinical-reports/latest";
const AUTH_ME_PATTERN = "/auth/me";

function invariant(condition: unknown, safeMessage: string): asserts condition {
  if (!condition) throw new Error(safeMessage);
}

function requireSecret(): string {
  const value = process.env.B15_U02_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error("B15_U02_LOGIN_SECRET is required");
  }
  return value;
}

function isObjectId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

function isScenario(value: unknown): value is Scenario {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Scenario>;
  return (
    isObjectId(candidate.patientId) &&
    isObjectId(candidate.visitId) &&
    isObjectId(candidate.sourceReportId) &&
    typeof candidate.navigationPath === "string" &&
    /^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}$/i.test(
      candidate.navigationPath,
    ) &&
    Boolean(
      candidate.preparedBaseline &&
      typeof candidate.preparedBaseline === "object" &&
      Object.keys(candidate.preparedBaseline).length > 0,
    )
  );
}

async function readDescriptor(): Promise<Descriptor> {
  const runtimePath = process.env.B15_U02_RUNTIME_PATH;
  if (!runtimePath) throw new Error("B15_U02_RUNTIME_PATH is required");
  const value = JSON.parse(await readFile(runtimePath, "utf8")) as unknown;
  invariant(value && typeof value === "object", "U02 descriptor is invalid");
  const candidate = value as Partial<Descriptor>;
  invariant(candidate.schemaVersion === 1, "U02 descriptor schema is invalid");
  invariant(candidate.batch === "B15", "U02 descriptor batch is invalid");
  invariant(
    candidate.profile === "B15-P2-recovery-uncertain-result",
    "U02 descriptor profile is invalid",
  );
  invariant(
    typeof candidate.namespace === "string" &&
      /^[a-z0-9][a-z0-9-]{2,19}$/.test(candidate.namespace),
    "U02 descriptor namespace is invalid",
  );
  invariant(
    typeof candidate.accounts?.doctor.loginIdentifier === "string" &&
      candidate.accounts.doctor.loginIdentifier.length > 0 &&
      typeof candidate.accounts.nurse.loginIdentifier === "string" &&
      candidate.accounts.nurse.loginIdentifier.length > 0 &&
      candidate.accounts.doctor.loginIdentifier !==
        candidate.accounts.nurse.loginIdentifier,
    "U02 accounts are invalid",
  );
  const scenarios = candidate.scenarios;
  invariant(
    scenarios &&
      Object.keys(scenarios).sort().join(",") ===
        ["correction-in-progress", "correction-network-uncertain"]
          .sort()
          .join(",") &&
      isScenario(scenarios["correction-in-progress"]) &&
      isScenario(scenarios["correction-network-uncertain"]),
    "U02 scenario set is invalid",
  );
  invariant(
    scenarios["correction-in-progress"].patientId !==
      scenarios["correction-network-uncertain"].patientId &&
      scenarios["correction-in-progress"].visitId !==
        scenarios["correction-network-uncertain"].visitId &&
      scenarios["correction-in-progress"].sourceReportId !==
        scenarios["correction-network-uncertain"].sourceReportId,
    "U02 scenarios are not ownership-isolated",
  );
  return candidate as Descriptor;
}

function responsePath(response: Response): string {
  return new URL(response.url()).pathname;
}

function successfulAuthMeCount(ledger: NetworkLedger): number {
  return ledger
    .entries()
    .filter(
      (entry) =>
        entry.method === "GET" &&
        entry.safeUrlPattern === AUTH_ME_PATTERN &&
        entry.status === 200,
    ).length;
}

async function login(input: {
  factory: RoleContextFactory;
  label: string;
  account: string;
  password: string;
  environment: EnabledEnvironment;
  viewport: { width: number; height: number };
}): Promise<Session> {
  const roleContext = await input.factory.create("doctor", input.label, {
    viewport: input.viewport,
  });
  const { context, page } = roleContext;
  const ledger = new NetworkLedger();
  await ledger.attach(page);
  await page.goto(`${input.environment.frontendOrigin}/login`, {
    waitUntil: "domcontentloaded",
  });
  expect(await page.evaluate(() => window.location.origin)).toBe(
    input.environment.frontendOrigin,
  );

  const healthResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${input.environment.backendOrigin}/health` &&
      response.request().method() === "GET",
  );
  const healthStatus = await page.evaluate(async (backendOrigin) => {
    const response = await fetch(`${backendOrigin}/health`, {
      cache: "no-store",
      credentials: "include",
    });
    return response.status;
  }, input.environment.backendOrigin);
  const healthResponse = await healthResponsePromise;
  expect(healthStatus).toBe(200);
  expect(new URL(healthResponse.url()).origin).toBe(
    input.environment.backendOrigin,
  );
  expect(healthResponse.headers()["access-control-allow-origin"]).toBe(
    input.environment.frontendOrigin,
  );

  const loginResponsePromise = page.waitForResponse(
    (response) =>
      responsePath(response) === "/auth/login" &&
      response.request().method() === "POST",
  );
  const meResponsePromise = page.waitForResponse(
    (response) =>
      responsePath(response) === "/auth/me" &&
      response.request().method() === "GET" &&
      response.status() === 200,
  );
  await page.getByLabel("账号").fill(input.account);
  await page.getByLabel("密码").fill(input.password);
  await page.getByRole("button", { name: "登录系统", exact: true }).click();
  const [loginResponse, meResponse] = await Promise.all([
    loginResponsePromise,
    meResponsePromise,
  ]);
  expect(loginResponse.status()).toBe(201);
  expect(new URL(loginResponse.url()).origin).toBe(
    input.environment.backendOrigin,
  );
  expect((await loginResponse.request().allHeaders()).origin).toBe(
    input.environment.frontendOrigin,
  );
  const me = (await meResponse.json()) as {
    authenticated?: unknown;
    user?: Partial<AuthUser>;
  };
  expect(me).toMatchObject({
    authenticated: true,
    user: { id: expect.any(String), roles: ["doctor"] },
  });
  invariant(
    isObjectId(me.user?.id) &&
      typeof me.user?.displayName === "string" &&
      Array.isArray(me.user.roles),
    "Authenticated doctor response is incomplete",
  );
  await expect(page).toHaveURL(`${input.environment.frontendOrigin}/dashboard`);
  const cookies = (
    await context.cookies(input.environment.backendOrigin)
  ).filter((cookie) => cookie.httpOnly);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatchObject({
    name: "cogmemory_ad_session",
    domain: "localhost",
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
  });
  return {
    roleContext,
    ledger,
    user: me.user as AuthUser,
    healthStatus,
  };
}

async function openReport(input: {
  page: Page;
  scenario: Scenario;
  environment: EnabledEnvironment;
  ledger: NetworkLedger;
  expectedReportId: string;
  reload?: boolean;
}): Promise<ClinicalReport> {
  const meBefore = successfulAuthMeCount(input.ledger);
  const latestBefore = input.ledger.count({
    method: "GET",
    safeUrlPattern: LATEST_PATTERN,
  });
  const mePromise = input.page.waitForResponse(
    (response) =>
      responsePath(response) === "/auth/me" &&
      response.request().method() === "GET" &&
      response.status() === 200,
  );
  const latestPromise = input.page.waitForResponse(
    (response) =>
      responsePath(response).endsWith("/clinical-reports/latest") &&
      response.request().method() === "GET" &&
      response.status() === 200,
  );
  if (input.reload) {
    await input.page.reload({ waitUntil: "domcontentloaded" });
  } else {
    await input.page.goto(
      `${input.environment.frontendOrigin}${input.scenario.navigationPath}`,
      { waitUntil: "domcontentloaded" },
    );
  }
  const [meResponse, latestResponse] = await Promise.all([
    mePromise,
    latestPromise,
  ]);
  expect(new URL(meResponse.url()).origin).toBe(
    input.environment.backendOrigin,
  );
  expect(new URL(latestResponse.url()).origin).toBe(
    input.environment.backendOrigin,
  );
  expect(successfulAuthMeCount(input.ledger) - meBefore).toBe(1);
  expect(
    input.ledger.count({ method: "GET", safeUrlPattern: LATEST_PATTERN }) -
      latestBefore,
  ).toBe(1);
  const body = (await latestResponse.json()) as { report: ClinicalReport };
  invariant(
    body.report.id === input.expectedReportId,
    "Latest report identity mismatch",
  );
  return body.report;
}

function assertArchivedPrerequisites(
  report: ClinicalReport,
  scenario: Scenario,
): void {
  expect(report).toMatchObject({
    id: scenario.sourceReportId,
    status: "archived",
    reportVersion: 1,
    reportType: "cognitive_assessment",
    source: "mixed",
    qualityStatus: "passed",
    isFinal: true,
    replacementOf: null,
    voidedAt: null,
  });
  invariant(
    report.updatedAt &&
      report.confirmation?.confirmedAt &&
      report.confirmation.confirmedByRole === "doctor" &&
      report.lockedAt &&
      report.lock?.lockId &&
      report.sourceFreeze?.state === "completed" &&
      report.sourceFreeze.completedAt &&
      report.archive?.archiveId &&
      report.archivedAt,
    "Archived A21-A24 prerequisites are incomplete",
  );
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const viewport = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth ?? 0,
    ),
  }));
  expect(viewport.innerWidth).toBe(MOBILE_VIEWPORT.width);
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth);
}

function parseCorrectionRequest(request: Request): CapturedCorrectionRequest {
  const value = request.postDataJSON() as unknown;
  invariant(
    value && typeof value === "object" && !Array.isArray(value),
    "Correction request body is invalid",
  );
  const body = value as Record<string, unknown>;
  return {
    keys: Object.keys(body).sort(),
    confirm: body.confirm,
    correctionReason: body.correctionReason,
    changeSummary: body.changeSummary,
    expectedUpdatedAt: body.expectedUpdatedAt,
  };
}

function reportBusinessWrites(entries: NetworkLedgerEntry[]) {
  return entries.filter(
    (entry) =>
      entry.method !== "GET" &&
      entry.safeUrlPattern !== "/auth/login" &&
      /\/clinical-reports(?:\/|$)/.test(entry.safeUrlPattern),
  );
}

function adjacentReportBusinessWrites(entries: NetworkLedgerEntry[]) {
  return reportBusinessWrites(entries).filter(
    (entry) => entry.safeUrlPattern !== CORRECTION_PATTERN,
  );
}

function countForbiddenGeneratedCalls(entries: NetworkLedgerEntry[]): number {
  return entries.filter((entry) =>
    /(?:pdf|print|download|\/ai(?:\/|$)|\/llm(?:\/|$))/i.test(
      entry.safeUrlPattern,
    ),
  ).length;
}

function traceValue(scope: Locator, label: string): Locator {
  return scope
    .locator("dt", { hasText: new RegExp(`^${label}$`) })
    .locator("..")
    .locator("dd");
}

function publicProtectedFacts(report: ClinicalReport): string {
  return JSON.stringify({
    reportType: report.reportType,
    source: report.source,
    patientSnapshot: report.patientSnapshot,
    visitSnapshot: report.visitSnapshot,
    scaleTraces: report.scaleTraces,
    scoreSnapshots: report.scoreSnapshots,
    domainSnapshots: report.domainSnapshots,
    evidenceSnapshots: report.evidenceSnapshots,
    narrative: report.narrative,
    generation: report.generation,
  });
}

async function expectNoCorrectionIdentifier(
  page: Page,
  correctionId: string,
): Promise<void> {
  expect(await page.locator("body").innerText()).not.toContain(correctionId);
  expect(page.url()).not.toContain(correctionId);
}

async function expectStableNetworkCounts(
  ledger: NetworkLedger,
  expected: { correctionPosts: number; latestGets: number },
): Promise<void> {
  await expect
    .poll(
      () => ({
        correctionPosts: ledger.count({
          method: "POST",
          safeUrlPattern: CORRECTION_PATTERN,
        }),
        latestGets: ledger.count({
          method: "GET",
          safeUrlPattern: LATEST_PATTERN,
        }),
      }),
      { timeout: 1_000, intervals: [100, 200, 300] },
    )
    .toEqual(expected);
}

async function auditCorrectionStorage(input: {
  page: Page;
  context: BrowserContext;
  forbiddenLiterals: string[];
}): Promise<StorageBoundary> {
  const result = await input.page.evaluate(async (forbiddenLiterals) => {
    const forbiddenKeys =
      /correctionReason|changeSummary|correctionId|expectedUpdatedAt|correctionDraft|clinicalReportCorrection/i;
    const contains = (value: unknown): boolean => {
      try {
        const serialized =
          typeof value === "string" ? value : JSON.stringify(value);
        return (
          forbiddenKeys.test(serialized) ||
          forbiddenLiterals.some(
            (literal) => literal.length > 0 && serialized.includes(literal),
          )
        );
      } catch {
        return true;
      }
    };

    let indexedDbForbidden = false;
    const databases =
      typeof indexedDB.databases === "function"
        ? await indexedDB.databases()
        : [];
    for (const info of databases) {
      if (!info.name) continue;
      indexedDbForbidden ||= contains(info.name);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(info.name!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const storeNames = [...database.objectStoreNames];
        if (storeNames.length === 0) continue;
        const transaction = database.transaction(storeNames, "readonly");
        for (const storeName of storeNames) {
          const values = await new Promise<unknown[]>((resolve, reject) => {
            const request = transaction.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          indexedDbForbidden ||=
            contains(storeName) || values.some((value) => contains(value));
        }
      } finally {
        database.close();
      }
    }
    return {
      localStorageForbidden: Object.entries(localStorage).some((entry) =>
        contains(entry),
      ),
      sessionStorageForbidden: Object.entries(sessionStorage).some((entry) =>
        contains(entry),
      ),
      indexedDbForbidden,
      queryForbidden: contains(window.location.search),
      hashForbidden: contains(window.location.hash),
    };
  }, input.forbiddenLiterals);
  const cookies = await input.context.cookies();
  const cookieForbidden = cookies.some((cookie) => {
    const serialized = `${cookie.name}\n${cookie.value}`;
    return (
      /correctionReason|changeSummary|correctionId|expectedUpdatedAt|correctionDraft|clinicalReportCorrection/i.test(
        serialized,
      ) ||
      input.forbiddenLiterals.some(
        (literal) => literal.length > 0 && serialized.includes(literal),
      )
    );
  });
  expect(result).toEqual({
    localStorageForbidden: false,
    sessionStorageForbidden: false,
    indexedDbForbidden: false,
    queryForbidden: false,
    hashForbidden: false,
  });
  expect(cookieForbidden).toBe(false);
  return {
    localStorageClear: true,
    sessionStorageClear: true,
    indexedDbClear: true,
    queryClear: true,
    hashClear: true,
    cookiesClear: true,
  };
}

function assertSafeResumeResponse(
  response: CreateClinicalReportCorrectionResponse,
  initialReport: ClinicalReport,
  initialCorrection: ClinicalReportCorrectionSummary,
  doctorId: string,
): void {
  const { sourceReport, replacementReport, correctionReceipt } = response;
  invariant(sourceReport.correction, "Completed source correction is missing");
  invariant(replacementReport.replacementOf, "Replacement lineage is missing");
  expect(correctionReceipt).toMatchObject({
    state: "completed",
    alreadyCreated: false,
    resumedExisting: true,
    correctionNo: initialCorrection.correctionNo,
    correctionReason: PERSISTED_REASON,
    changeSummary: PERSISTED_SUMMARY,
    previousReportVersion: 1,
    replacementReportVersion: 2,
  });
  expect(sourceReport).toMatchObject({
    id: initialReport.id,
    status: "corrected",
    reportVersion: 1,
  });
  expect(replacementReport).toMatchObject({
    reportVersion: 2,
    status: "draft",
    source: "mixed",
    qualityStatus: "needs_review",
    isFinal: false,
    confirmation: null,
    lockedAt: null,
    sourceFreeze: null,
    archivedAt: null,
    archive: null,
    correction: null,
  });
  expect(correctionReceipt.correctionId).toBe(initialCorrection.correctionId);
  expect(sourceReport.correction.correctionId).toBe(
    initialCorrection.correctionId,
  );
  expect(replacementReport.replacementOf.correctionId).toBe(
    initialCorrection.correctionId,
  );
  expect(sourceReport.correction.startedAt).toBe(initialCorrection.startedAt);
  expect(sourceReport.correction.startedBy).toEqual(
    initialCorrection.startedBy,
  );
  expect(sourceReport.correction.correctionReason).toBe(PERSISTED_REASON);
  expect(sourceReport.correction.changeSummary).toBe(PERSISTED_SUMMARY);
  expect(sourceReport.correction.previousReportCode).toBe(
    initialCorrection.previousReportCode,
  );
  expect(sourceReport.correction.replacementReportCode).toBe(
    initialCorrection.replacementReportCode,
  );
  expect(sourceReport.correction.completedBy?.operatorId).toBe(doctorId);
  expect(correctionReceipt.sourceReportId).toBe(sourceReport.id);
  expect(correctionReceipt.replacementReportId).toBe(replacementReport.id);
  expect(replacementReport.replacementOf.previousReportId).toBe(
    sourceReport.id,
  );
  const serialized = JSON.stringify(response);
  for (const forbiddenKey of [
    "metadata",
    "a25Correction",
    "a25CorrectionReplacement",
    "correctionRecords",
    "auditLogId",
    "auditLogRefs",
    "primaryScaleInstanceIds",
    "scoreResultIds",
    "cognitiveDomainResultIds",
    "mediaEvidenceIds",
    "session",
    "cookie",
    "currentUser",
    "branch",
    "_id",
    "__v",
  ]) {
    expect(serialized.includes(`"${forbiddenKey}"`)).toBe(false);
  }
}

test.describe("B15-U02 persisted recovery and uncertain result", () => {
  test.beforeEach(() => {
    test.skip(
      !environment.enabled,
      "BROWSER_ACCEPTANCE_RUN_LIVE=1 is required",
    );
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test("doctor explicitly resumes the persisted correction without replacing its first facts", async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const scenario = descriptor.scenarios["correction-in-progress"];
    const session = await login({
      factory: roleContexts,
      label: "b15-u02-persisted-resume-doctor",
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      environment: env,
      viewport: MOBILE_VIEWPORT,
    });
    const { page } = session.roleContext;
    const initialReport = await openReport({
      page,
      scenario,
      environment: env,
      ledger: session.ledger,
      expectedReportId: scenario.sourceReportId,
    });
    assertArchivedPrerequisites(initialReport, scenario);
    invariant(
      initialReport.correction?.state === "in_progress",
      "Persisted correction summary is missing",
    );
    const initialCorrection = initialReport.correction;
    expect(initialCorrection).toMatchObject({
      correctionNo: 1,
      state: "in_progress",
      startedBy: {
        operatorId: session.user.id,
        operatorRole: "doctor",
      },
      correctionReason: PERSISTED_REASON,
      changeSummary: PERSISTED_SUMMARY,
      previousReportCode: initialReport.reportCode,
      previousReportVersion: 1,
      replacementReportVersion: 2,
      replacementReportId: null,
      completedAt: null,
      completedBy: null,
    });
    const initialProtectedFacts = publicProtectedFacts(initialReport);
    const initialLatestCount = session.ledger.count({
      method: "GET",
      safeUrlPattern: LATEST_PATTERN,
    });
    expect(initialLatestCount).toBe(1);
    await expect(
      page.getByText(PERSISTED_SOURCE_MARKER, { exact: true }),
    ).toBeVisible();
    const initialSummary = page.locator(
      'section[aria-labelledby="clinical-report-correction-summary-heading"]',
    );
    await expect(
      initialSummary.getByRole("heading", {
        name: "版本化更正与线性来源关系",
        exact: true,
      }),
    ).toBeVisible();
    await expect(traceValue(initialSummary, "更正状态")).toHaveText(
      "in_progress",
    );
    await expect(traceValue(initialSummary, "更正序号")).toHaveText("1");
    await expect(traceValue(initialSummary, "上一版本")).toHaveText(
      `${initialCorrection.previousReportCode} / V1`,
    );
    await expect(traceValue(initialSummary, "替代版本")).toHaveText(
      `${initialCorrection.replacementReportCode} / V2`,
    );
    await expect(traceValue(initialSummary, "开始")).not.toHaveText("—");
    await expect(traceValue(initialSummary, "发起人")).toContainText(
      session.user.displayName,
    );
    await expect(
      initialSummary.getByText(PERSISTED_REASON, { exact: true }),
    ).toBeVisible();
    await expect(
      initialSummary.getByText(PERSISTED_SUMMARY, { exact: true }),
    ).toBeVisible();
    await expectNoCorrectionIdentifier(page, initialCorrection.correctionId);
    await expectNoHorizontalOverflow(page);

    await page
      .getByRole("button", {
        name: "继续完成版本化更正",
        exact: true,
      })
      .click();
    const form = page.locator(
      'section[aria-labelledby="clinical-report-correction-heading"]',
    );
    await expect(
      form.getByRole("heading", {
        name: "继续同一版本化更正流程",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      form.getByText(
        "正在继续服务端已保存的同一版本化更正流程。原始原因与摘要只读且不会被本页面覆盖；内部关联标识由系统保存，不在页面展示。",
        { exact: true },
      ),
    ).toBeVisible();
    const reason = form.getByLabel("更正原因", { exact: true });
    const summary = form.getByLabel("计划变更摘要", { exact: true });
    const confirmation = form.getByRole("checkbox", {
      name: CHECKBOX_NAME,
      exact: true,
    });
    const submit = form.getByRole("button", {
      name: "确认继续同一更正流程",
      exact: true,
    });
    await expect(reason).toHaveValue(PERSISTED_REASON);
    await expect(summary).toHaveValue(PERSISTED_SUMMARY);
    await expect(reason).toBeDisabled();
    await expect(summary).toBeDisabled();
    await expect(reason).toHaveAttribute("readonly", "");
    await expect(summary).toHaveAttribute("readonly", "");
    await expect(confirmation).not.toBeChecked();
    await expect(submit).toBeDisabled();
    await confirmation.check();
    await expect(confirmation).toBeChecked();
    await expect(submit).toBeEnabled();
    await expect(reason).toHaveValue(PERSISTED_REASON);
    await expect(summary).toHaveValue(PERSISTED_SUMMARY);
    await expectNoCorrectionIdentifier(page, initialCorrection.correctionId);

    const correctionPath = `${scenario.navigationPath}/clinical-reports/${scenario.sourceReportId}/corrections`;
    const correctionRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === correctionPath,
    );
    const correctionResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        responsePath(response) === correctionPath,
    );
    await submit.click();
    const [correctionRequest, correctionResponse] = await Promise.all([
      correctionRequestPromise,
      correctionResponsePromise,
    ]);
    const requestFacts = parseCorrectionRequest(correctionRequest);
    expect(requestFacts.keys).toEqual(
      [
        "confirm",
        "correctionReason",
        "changeSummary",
        "expectedUpdatedAt",
      ].sort(),
    );
    expect(requestFacts.confirm).toBe(true);
    expect(requestFacts.correctionReason).toBe(PERSISTED_REASON);
    expect(requestFacts.changeSummary).toBe(PERSISTED_SUMMARY);
    expect(requestFacts.expectedUpdatedAt).toBe(initialReport.updatedAt);
    expect(correctionResponse.status()).toBe(200);
    const responseBody =
      (await correctionResponse.json()) as CreateClinicalReportCorrectionResponse;
    assertSafeResumeResponse(
      responseBody,
      initialReport,
      initialCorrection,
      session.user.id,
    );
    expect(publicProtectedFacts(responseBody.sourceReport)).toBe(
      initialProtectedFacts,
    );
    expect(publicProtectedFacts(responseBody.replacementReport)).toBe(
      initialProtectedFacts,
    );

    await expect(page).toHaveURL(
      `${env.frontendOrigin}${scenario.navigationPath}`,
    );
    await expect(
      page.getByText("替代版本 V2", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(PERSISTED_SOURCE_MARKER, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/更正回执：No\. 1/)).toBeVisible();
    await expect(
      page.getByText(/更正回执：No\. 1，既有更正流程已恢复并完成。/),
    ).toBeVisible();
    await expect(
      page.getByText("已有版本化更正流程已恢复并完成。", {
        exact: true,
      }),
    ).toBeVisible();
    const currentSummary = page.locator(
      'section[aria-labelledby="clinical-report-correction-summary-heading"]',
    );
    await expect(
      currentSummary.getByRole("heading", {
        name: "来源报告",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      currentSummary.getByRole("heading", {
        name: "当前替代报告",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      currentSummary.getByText(PERSISTED_REASON, { exact: true }),
    ).toHaveCount(2);
    await expect(
      currentSummary.getByText(PERSISTED_SUMMARY, { exact: true }),
    ).toHaveCount(2);
    await expectNoCorrectionIdentifier(page, initialCorrection.correctionId);
    expect(
      session.ledger.count({
        method: "POST",
        safeUrlPattern: CORRECTION_PATTERN,
      }),
    ).toBe(1);
    expect(
      session.ledger.count({
        method: "GET",
        safeUrlPattern: LATEST_PATTERN,
      }),
    ).toBe(initialLatestCount);
    expect(adjacentReportBusinessWrites(session.ledger.entries())).toHaveLength(
      0,
    );
    expect(countForbiddenGeneratedCalls(session.ledger.entries())).toBe(0);

    const reloadedReport = await openReport({
      page,
      scenario,
      environment: env,
      ledger: session.ledger,
      expectedReportId: responseBody.replacementReport.id,
      reload: true,
    });
    expect(reloadedReport).toMatchObject({
      id: responseBody.replacementReport.id,
      reportVersion: 2,
      status: "draft",
      source: "mixed",
      qualityStatus: "needs_review",
      correction: null,
    });
    invariant(reloadedReport.replacementOf, "Reloaded lineage is missing");
    expect(reloadedReport.replacementOf).toMatchObject({
      correctionNo: 1,
      previousReportCode: responseBody.sourceReport.reportCode,
      previousReportVersion: 1,
      replacementReportCode: responseBody.replacementReport.reportCode,
      replacementReportVersion: 2,
      createdBy: initialCorrection.startedBy,
      correctionReason: PERSISTED_REASON,
      changeSummary: PERSISTED_SUMMARY,
    });
    const reloadedSummary = page.locator(
      'section[aria-labelledby="clinical-report-correction-summary-heading"]',
    );
    await expect(
      reloadedSummary.getByRole("heading", {
        name: "当前替代报告",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      reloadedSummary.getByRole("heading", {
        name: "来源报告",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(page.getByText(/更正回执：No\./)).toHaveCount(0);
    await expect(page.getByText(/本次更正回执：/)).toHaveCount(0);
    await expect(
      page.getByText("已有版本化更正流程已恢复并完成。", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      reloadedSummary.getByText(PERSISTED_REASON, { exact: true }),
    ).toBeVisible();
    await expect(
      reloadedSummary.getByText(PERSISTED_SUMMARY, { exact: true }),
    ).toBeVisible();
    await expectNoCorrectionIdentifier(page, initialCorrection.correctionId);
    expect(new URL(page.url()).search).toBe("");
    expect(new URL(page.url()).hash).toBe("");
    await expectNoHorizontalOverflow(page);

    const entries = session.ledger.entries();
    const correctionEntries = entries.filter(
      (entry) =>
        entry.method === "POST" && entry.safeUrlPattern === CORRECTION_PATTERN,
    );
    expect(correctionEntries).toEqual([
      expect.objectContaining({
        status: 200,
        failureReason: null,
        bodyKeys: [
          "changeSummary",
          "confirm",
          "correctionReason",
          "expectedUpdatedAt",
        ],
      }),
    ]);
    session.ledger.assertNoAutomaticRetry({
      method: "POST",
      safeUrlPattern: CORRECTION_PATTERN,
    });
    session.ledger.assertNoPolling(
      { method: "GET", safeUrlPattern: LATEST_PATTERN },
      initialLatestCount + 1,
    );
    expect(
      session.ledger.count({ method: "GET", safeUrlPattern: LATEST_PATTERN }),
    ).toBe(initialLatestCount + 1);
    expect(successfulAuthMeCount(session.ledger)).toBe(3);
    expect(adjacentReportBusinessWrites(entries)).toHaveLength(0);
    expect(countForbiddenGeneratedCalls(entries)).toBe(0);

    const network = await session.ledger.detach();
    expect((await roleContexts.closeAll()).activeContextCount).toBe(0);
    console.log(
      `B15_U02_RESUME_EVIDENCE ${safeJsonStringify(
        {
          profile: "B15-P2-recovery-uncertain-result",
          scenario: "correction-in-progress",
          doctorContexts: 1,
          healthStatus: session.healthStatus,
          cookieBoundary: "localhost_host_only_http_only",
          viewport: "390x844",
          persistedFields: "readonly",
          correctionPost: {
            count: 1,
            status: correctionEntries[0]?.status,
            bodyKeys: correctionEntries[0]?.bodyKeys,
          },
          response: {
            alreadyCreated: false,
            resumedExisting: true,
            persistedFirstFacts: "matched_in_memory",
            source: "v1_corrected",
            replacement: "unique_v2_draft",
          },
          currentSession: "resume_receipt_source_live_message_present",
          reload: "session_helpers_absent_persistent_lineage_present",
          privacy: "correction_identifier_absent_from_dom_and_url",
          adjacentReportBusinessWrites: 0,
          generatedPdfDownloadAiCalls: 0,
          failedRequestCount: network.failedRequestCount,
          contextsClosed: true,
        },
        [
          password,
          descriptor.accounts.doctor.loginIdentifier,
          initialCorrection.correctionId,
          PERSISTED_REASON,
          PERSISTED_SUMMARY,
        ],
      )}`,
    );
  });

  test("doctor keeps local correction text after one aborted request and clears it on reload", async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const scenario = descriptor.scenarios["correction-network-uncertain"];
    const session = await login({
      factory: roleContexts,
      label: "b15-u02-network-uncertain-doctor",
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      environment: env,
      viewport: MOBILE_VIEWPORT,
    });
    const { context, page } = session.roleContext;
    const initialReport = await openReport({
      page,
      scenario,
      environment: env,
      ledger: session.ledger,
      expectedReportId: scenario.sourceReportId,
    });
    assertArchivedPrerequisites(initialReport, scenario);
    expect(initialReport.correction).toBeNull();
    await expect(
      page.getByText(UNCERTAIN_SOURCE_MARKER, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "准备版本化更正", exact: true }),
    ).toBeEnabled();
    await expectNoHorizontalOverflow(page);

    await page
      .getByRole("button", { name: "准备版本化更正", exact: true })
      .click();
    const form = page.locator(
      'section[aria-labelledby="clinical-report-correction-heading"]',
    );
    const reason = form.getByLabel("更正原因", { exact: true });
    const summary = form.getByLabel("计划变更摘要", { exact: true });
    const confirmation = form.getByRole("checkbox", {
      name: CHECKBOX_NAME,
      exact: true,
    });
    const submit = form.getByRole("button", {
      name: "确认创建替代版本",
      exact: true,
    });
    await reason.fill(LOCAL_REASON);
    await summary.fill(LOCAL_SUMMARY);
    await confirmation.check();
    await expect(reason).toHaveValue(LOCAL_REASON);
    await expect(summary).toHaveValue(LOCAL_SUMMARY);
    await expect(confirmation).toBeChecked();
    await expect(submit).toBeEnabled();
    await expect(page.getByText(/更正回执：No\./)).toHaveCount(0);

    const forbiddenLiterals = [
      LOCAL_REASON,
      LOCAL_SUMMARY,
      initialReport.updatedAt ?? "",
    ];
    const storageBeforeRequest = await auditCorrectionStorage({
      page,
      context,
      forbiddenLiterals,
    });
    const initialLatestCount = session.ledger.count({
      method: "GET",
      safeUrlPattern: LATEST_PATTERN,
    });
    expect(initialLatestCount).toBe(1);
    const correctionPath = `${scenario.navigationPath}/clinical-reports/${scenario.sourceReportId}/corrections`;
    const abort = new OneShotRequestAbort(
      page,
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === correctionPath,
    );
    await abort.install();
    await submit.click();
    await abort.waitForStarted();
    const alert = page
      .getByRole("alert")
      .filter({ hasText: UNCERTAIN_MESSAGE });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(UNCERTAIN_MESSAGE);
    await expect(
      page.getByRole("button", {
        name: "手工重新加载最新报告",
        exact: true,
      }),
    ).toBeVisible();
    const abortSummary = await abort.dispose();
    expect(abortSummary).toEqual({
      matchedRequestCount: 1,
      abortedRequestCount: 1,
      continuedRequestCount: 0,
    });
    await expect
      .poll(() =>
        session.ledger.count({
          method: "POST",
          safeUrlPattern: CORRECTION_PATTERN,
          failureReason: "aborted",
        }),
      )
      .toBe(1);
    await expect(reason).toHaveValue(LOCAL_REASON);
    await expect(summary).toHaveValue(LOCAL_SUMMARY);
    await expect(confirmation).not.toBeChecked();
    await expect(submit).toBeDisabled();
    await expect(
      form.getByText("更正草稿基线已过期", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/更正回执：No\./)).toHaveCount(0);
    await expect(page.getByText(/本次更正回执：/)).toHaveCount(0);
    await expect(
      page.getByText("已有版本化更正流程已恢复并完成。", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(page.getByText(/已回滚/)).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "继续完成版本化更正",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText(UNCERTAIN_SOURCE_MARKER, { exact: true }),
    ).toBeVisible();
    await expectStableNetworkCounts(session.ledger, {
      correctionPosts: 1,
      latestGets: initialLatestCount,
    });
    const storageAfterAbort = await auditCorrectionStorage({
      page,
      context,
      forbiddenLiterals,
    });

    const latestResponsePromise = page.waitForResponse(
      (response) =>
        responsePath(response).endsWith("/clinical-reports/latest") &&
        response.request().method() === "GET" &&
        response.status() === 200,
    );
    let beforeUnloadDialogCount = 0;
    let otherDialogCount = 0;
    const dialogActions: Promise<void>[] = [];
    const onDialog = (dialog: Dialog): void => {
      if (dialog.type() === "beforeunload") {
        beforeUnloadDialogCount += 1;
        dialogActions.push(dialog.accept());
      } else {
        otherDialogCount += 1;
        dialogActions.push(dialog.dismiss());
      }
    };
    page.on("dialog", onDialog);
    await page.reload({ waitUntil: "domcontentloaded" });
    await Promise.all(dialogActions);
    page.off("dialog", onDialog);
    expect(beforeUnloadDialogCount).toBeLessThanOrEqual(1);
    expect(otherDialogCount).toBe(0);
    const reloadedBody = (await (await latestResponsePromise).json()) as {
      report: ClinicalReport;
    };
    expect(reloadedBody.report).toMatchObject({
      id: scenario.sourceReportId,
      status: "archived",
      reportVersion: 1,
      updatedAt: initialReport.updatedAt,
      correction: null,
      replacementOf: null,
    });
    await expect(
      page.getByText(UNCERTAIN_SOURCE_MARKER, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "准备版本化更正", exact: true }),
    ).toBeEnabled();
    await expect(page.getByText(LOCAL_REASON, { exact: true })).toHaveCount(0);
    await expect(page.getByText(LOCAL_SUMMARY, { exact: true })).toHaveCount(0);
    await expect(reason).toHaveCount(0);
    await expect(summary).toHaveCount(0);
    await expect(confirmation).toHaveCount(0);
    await expect(alert).toHaveCount(0);
    await expect(
      page.getByText("更正草稿基线已过期", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(/更正回执：No\./)).toHaveCount(0);
    await expect(page.getByText(/本次更正回执：/)).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "继续完成版本化更正",
        exact: true,
      }),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    const storageAfterReload = await auditCorrectionStorage({
      page,
      context,
      forbiddenLiterals,
    });
    await expectStableNetworkCounts(session.ledger, {
      correctionPosts: 1,
      latestGets: initialLatestCount + 1,
    });

    const correctionEntries = session.ledger
      .entries()
      .filter(
        (entry) =>
          entry.method === "POST" &&
          entry.safeUrlPattern === CORRECTION_PATTERN,
      );
    expect(correctionEntries).toEqual([
      expect.objectContaining({
        status: null,
        failureReason: "aborted",
        bodyKeys: [
          "changeSummary",
          "confirm",
          "correctionReason",
          "expectedUpdatedAt",
        ],
      }),
    ]);
    session.ledger.assertNoAutomaticRetry({
      method: "POST",
      safeUrlPattern: CORRECTION_PATTERN,
    });
    session.ledger.assertNoPolling(
      { method: "GET", safeUrlPattern: LATEST_PATTERN },
      initialLatestCount + 1,
    );
    expect(adjacentReportBusinessWrites(session.ledger.entries())).toHaveLength(
      0,
    );
    expect(countForbiddenGeneratedCalls(session.ledger.entries())).toBe(0);

    const network = await session.ledger.detach();
    expect((await roleContexts.closeAll()).activeContextCount).toBe(0);
    console.log(
      `B15_U02_UNCERTAIN_EVIDENCE ${safeJsonStringify(
        {
          profile: "B15-P2-recovery-uncertain-result",
          scenario: "correction-network-uncertain",
          doctorContexts: 1,
          healthStatus: session.healthStatus,
          cookieBoundary: "localhost_host_only_http_only",
          viewport: "390x844",
          abort: abortSummary,
          correctionPostCount: 1,
          uncertainAlert: true,
          manualLatestAvailable: true,
          localTextRetainedAfterAbort: true,
          checkboxRetainedAfterAbort: false,
          automaticPostRetry: 0,
          automaticLatestAfterAbort: 0,
          automaticReplacement: 0,
          storage: {
            beforeRequest: storageBeforeRequest,
            afterAbort: storageAfterAbort,
            afterReload: storageAfterReload,
          },
          reload: {
            beforeUnloadDialogCount,
            localTextCleared: true,
            checkboxCleared: true,
            errorCleared: true,
            source: "archived_v1_without_correction",
          },
          adjacentReportBusinessWrites: 0,
          generatedPdfDownloadAiCalls: 0,
          failedRequestCount: network.failedRequestCount,
          contextsClosed: true,
        },
        [
          password,
          descriptor.accounts.doctor.loginIdentifier,
          LOCAL_REASON,
          LOCAL_SUMMARY,
        ],
      )}`,
    );
  });
});
