import { readFile } from "node:fs/promises";
import type { Page, Response } from "@playwright/test";

import { resolveLiveAcceptanceEnvironment } from "../support/acceptance-env";
import { expect, test } from "../support/acceptance-test";
import {
  NetworkLedger,
  type NetworkLedgerEntry,
} from "../support/network-ledger";
import type {
  AcceptanceRole,
  RoleContext,
  RoleContextFactory,
} from "../support/role-context-factory";
import { safeJsonStringify } from "../support/safe-output";

type ScenarioKey = "unlocked-confirmed" | "locked-confirmed";

type RuntimeDescriptor = {
  schemaVersion: 1;
  batch: "B12";
  profile: "B12-P1-user-entry-readonly";
  namespace: string;
  accounts: {
    doctor: { loginIdentifier: string };
    nurse: { loginIdentifier: string };
  };
  scenarios: Record<
    ScenarioKey,
    {
      patientId: string;
      visitId: string;
      reportId: string;
      navigationPath: string;
      updatedAt: string;
      reportHash: string;
      sourceHash: string;
    }
  >;
};

type EnabledEnvironment = {
  enabled: true;
  mode: "live";
  frontendOrigin: string;
  backendOrigin: string;
};

type AuthenticatedSession = {
  role: AcceptanceRole;
  roleContext: RoleContext;
  ledger: NetworkLedger;
  loginCors: "passed";
  authMeRole: AcceptanceRole;
  cookie: {
    count: 1;
    name: string;
    httpOnly: true;
    secure: false;
    sameSite: "Lax";
  };
};

type SafeNetworkGroup = Pick<
  NetworkLedgerEntry,
  "method" | "status" | "safeUrlPattern"
> & { count: number };

const environment = resolveLiveAcceptanceEnvironment();
const RUNNER_FORBIDDEN_ENVIRONMENT = [
  /^MONGO(?:DB)?(?:_|$)/i,
  /^DATABASE_URL$/i,
  /^DATABASE_(?:USER|USERNAME|PASSWORD|PURPOSE)$/i,
  /^COGMEMORY_DATABASE_PURPOSE$/i,
  /^BROWSER_ACCEPTANCE_(?:APP|ADMIN)_MONGO_URI$/i,
  /^DB_ADMIN(?:_|$)/i,
  /^B\d+_FIXTURE_PASSWORD$/i,
  /^B\d+_BROWSER_HTTP_FAULT_/i,
];
const REPORT_MARKER = "B12-U01 synthetic readable report marker.";
const WRITE_CONTROL_NAMES = [
  "编辑临床人员内容",
  "准备提交医生确认",
  "准备确认报告",
  "准备锁定报告",
  "确认不可逆锁定",
] as const;

function requireRunnerSecret(): string {
  const secret = process.env.B12_U01_LOGIN_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("B12_U01_LOGIN_SECRET must be injected for live U01");
  }
  return secret;
}

function requireRuntimePath(): string {
  const value = process.env.B12_U01_RUNTIME_PATH;
  if (!value) throw new Error("B12_U01_RUNTIME_PATH is required");
  return value;
}

function assertRunnerDatabaseBoundary(): void {
  const inherited = Object.entries(process.env).filter(
    ([name, value]) =>
      value !== undefined &&
      value !== "" &&
      RUNNER_FORBIDDEN_ENVIRONMENT.some((pattern) => pattern.test(name)),
  );
  expect(inherited).toHaveLength(0);
}

async function readDescriptor(): Promise<RuntimeDescriptor> {
  const value = JSON.parse(
    await readFile(requireRuntimePath(), "utf8"),
  ) as unknown;
  const candidate = value as Partial<RuntimeDescriptor>;
  expect(candidate.schemaVersion).toBe(1);
  expect(candidate.batch).toBe("B12");
  expect(candidate.profile).toBe("B12-P1-user-entry-readonly");
  expect(candidate.namespace).toMatch(/^[a-z0-9][a-z0-9-]{2,31}$/);
  expect(candidate.accounts?.doctor.loginIdentifier).toBeTruthy();
  expect(candidate.accounts?.nurse.loginIdentifier).toBeTruthy();
  expect(candidate.scenarios?.["unlocked-confirmed"].navigationPath).toMatch(
    /^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}$/,
  );
  expect(candidate.scenarios?.["locked-confirmed"].navigationPath).toMatch(
    /^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}$/,
  );
  return candidate as RuntimeDescriptor;
}

function responsePath(response: Response): string {
  return new URL(response.url()).pathname;
}

async function assertCors(
  response: Response,
  frontendOrigin: string,
): Promise<void> {
  const headers = await response.allHeaders();
  expect(headers["access-control-allow-origin"]).toBe(frontendOrigin);
  expect(headers["access-control-allow-credentials"]).toBe("true");
}

async function login(input: {
  roleContexts: RoleContextFactory;
  role: AcceptanceRole;
  label: string;
  loginIdentifier: string;
  password: string;
  environment: EnabledEnvironment;
}): Promise<AuthenticatedSession> {
  const roleContext = await input.roleContexts.create(input.role, input.label);
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
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    return response.status;
  }, input.environment.backendOrigin);
  const healthResponse = await healthResponsePromise;
  expect(healthStatus).toBe(200);
  await assertCors(healthResponse, input.environment.frontendOrigin);

  const loginResponsePromise = page.waitForResponse(
    (response) =>
      responsePath(response) === "/auth/login" &&
      response.request().method() === "POST",
  );
  const authMeResponsePromise = page.waitForResponse(
    (response) =>
      responsePath(response) === "/auth/me" &&
      response.request().method() === "GET" &&
      response.status() === 200,
  );
  await page.getByLabel("账号").fill(input.loginIdentifier);
  await page.getByLabel("密码").fill(input.password);
  await page.getByRole("button", { name: "登录系统", exact: true }).click();
  const [loginResponse, authMeResponse] = await Promise.all([
    loginResponsePromise,
    authMeResponsePromise,
  ]);
  expect(loginResponse.status()).toBe(201);
  const loginRequestHeaders = await loginResponse.request().allHeaders();
  expect(loginRequestHeaders["origin"]).toBe(
    input.environment.frontendOrigin,
  );
  await assertCors(loginResponse, input.environment.frontendOrigin);
  await assertCors(authMeResponse, input.environment.frontendOrigin);
  const meBody = (await authMeResponse.json()) as {
    authenticated?: unknown;
    user?: { roles?: unknown };
  };
  expect(meBody.authenticated).toBe(true);
  expect(meBody.user?.roles).toEqual([input.role]);
  await expect(page).toHaveURL(`${input.environment.frontendOrigin}/dashboard`);

  const cookies = (
    await context.cookies(input.environment.backendOrigin)
  ).filter((cookie) => cookie.httpOnly);
  expect(cookies).toHaveLength(1);
  const sessionCookie = cookies[0]!;
  expect(sessionCookie.name).toBe("cogmemory_ad_session");
  expect(sessionCookie.httpOnly).toBe(true);
  expect(sessionCookie.secure).toBe(false);
  expect(sessionCookie.sameSite).toBe("Lax");
  return {
    role: input.role,
    roleContext,
    ledger,
    loginCors: "passed",
    authMeRole: input.role,
    cookie: {
      count: 1,
      name: sessionCookie.name,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  };
}

async function openReport(
  page: Page,
  navigationPath: string,
  environment: EnabledEnvironment,
): Promise<{
  status: string;
  source: string;
  qualityStatus: string;
  isFinal: boolean;
}> {
  const latestResponsePromise = page.waitForResponse(
    (response) =>
      responsePath(response).endsWith("/clinical-reports/latest") &&
      response.request().method() === "GET" &&
      response.status() === 200,
  );
  await page.goto(`${environment.frontendOrigin}${navigationPath}`, {
    waitUntil: "domcontentloaded",
  });
  const latestResponse = await latestResponsePromise;
  await assertCors(latestResponse, environment.frontendOrigin);
  const body = (await latestResponse.json()) as {
    report?: {
      status?: unknown;
      source?: unknown;
      qualityStatus?: unknown;
      isFinal?: unknown;
    };
  };
  expect(body.report).toMatchObject({
    status: "confirmed",
    source: "mixed",
    qualityStatus: "passed",
    isFinal: true,
  });
  await expect(page.getByText(REPORT_MARKER, { exact: true })).toBeVisible();
  return body.report as {
    status: string;
    source: string;
    qualityStatus: string;
    isFinal: boolean;
  };
}

function isReportWrite(entry: NetworkLedgerEntry): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(entry.method)) return false;
  if (entry.safeUrlPattern === "/auth/login") return false;
  return (
    entry.safeUrlPattern.includes("/clinical-reports") ||
    /(?:source|freeze|archive|correction|void|pdf|print|download|\bai\b|llm)/i.test(
      entry.safeUrlPattern,
    )
  );
}

function assertNoReportWrites(entries: readonly NetworkLedgerEntry[]): void {
  expect(entries.filter(isReportWrite)).toHaveLength(0);
}

function groupNetwork(
  entries: readonly NetworkLedgerEntry[],
): SafeNetworkGroup[] {
  const groups = new Map<string, SafeNetworkGroup>();
  for (const entry of entries.filter(
    (candidate) =>
      candidate.safeUrlPattern === "/auth/login" ||
      candidate.safeUrlPattern === "/auth/me" ||
      candidate.safeUrlPattern.includes("/clinical-reports"),
  )) {
    const group: SafeNetworkGroup = {
      method: entry.method,
      status: entry.status,
      safeUrlPattern: entry.safeUrlPattern,
      count: 1,
    };
    const key = JSON.stringify(group);
    const current = groups.get(key);
    if (current) current.count += 1;
    else groups.set(key, group);
  }
  return [...groups.values()].sort(
    (left, right) =>
      left.safeUrlPattern.localeCompare(right.safeUrlPattern) ||
      left.method.localeCompare(right.method) ||
      (left.status ?? -1) - (right.status ?? -1),
  );
}

function safeSessionSummary(session: AuthenticatedSession): unknown {
  return {
    role: session.role,
    context: "independent",
    loginCors: session.loginCors,
    authMeRole: session.authMeRole,
    cookie: session.cookie,
    network: groupNetwork(session.ledger.entries()),
  };
}

async function closeAndSummarize(
  roleContexts: RoleContextFactory,
  sessions: AuthenticatedSession[],
  summary: Record<string, unknown>,
  forbidden: string[],
): Promise<void> {
  for (const session of sessions) await session.ledger.detach();
  const closed = await roleContexts.closeAll();
  expect(closed.activeContextCount).toBe(0);
  console.log(
    `B12_U01_EVIDENCE ${safeJsonStringify(
      { ...summary, contextsClosed: true },
      forbidden,
    )}`,
  );
}

test.describe("B12-U01 page eligibility, human role, and locked readonly", () => {
  test.beforeEach(() => {
    test.skip(
      !environment.enabled,
      "BROWSER_ACCEPTANCE_RUN_LIVE=1 is required",
    );
    if (!environment.enabled) return;
    assertRunnerDatabaseBoundary();
  });

  test("doctor opens and cancels lock form while nurse remains readonly", async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    const enabledEnvironment: EnabledEnvironment = environment;
    const descriptor = await readDescriptor();
    const password = requireRunnerSecret();
    const doctor = await login({
      roleContexts,
      role: "doctor",
      label: "unlocked-doctor",
      loginIdentifier: descriptor.accounts.doctor.loginIdentifier,
      password,
      environment: enabledEnvironment,
    });
    const nurse = await login({
      roleContexts,
      role: "nurse",
      label: "unlocked-nurse",
      loginIdentifier: descriptor.accounts.nurse.loginIdentifier,
      password,
      environment: enabledEnvironment,
    });
    expect(doctor.roleContext.context).not.toBe(nurse.roleContext.context);
    const [doctorCookie] = await doctor.roleContext.context.cookies(
      enabledEnvironment.backendOrigin,
    );
    const [nurseCookie] = await nurse.roleContext.context.cookies(
      enabledEnvironment.backendOrigin,
    );
    expect(doctorCookie?.value).toBeTruthy();
    expect(nurseCookie?.value).toBeTruthy();
    expect(doctorCookie?.value).not.toBe(nurseCookie?.value);

    const route = descriptor.scenarios["unlocked-confirmed"].navigationPath;
    await openReport(doctor.roleContext.page, route, enabledEnvironment);
    await expect(
      doctor.roleContext.page.getByText("已确认报告", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      doctor.roleContext.page
        .getByText("报告尚未归档", { exact: true })
        .first(),
    ).toBeVisible();
    const doctorBusinessStart = doctor.ledger.entries().length;
    const prepareButton = doctor.roleContext.page.getByRole("button", {
      name: "准备锁定报告",
      exact: true,
    });
    await expect(prepareButton).toBeEnabled();
    await prepareButton.click();
    await expect(
      doctor.roleContext.page.getByRole("heading", {
        name: "二次确认不可逆锁定",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      doctor.ledger.count({
        method: "POST",
        safeUrlPattern: "/patients/<id>/visits/<id>/clinical-reports/<id>/lock",
      }),
    ).toBe(0);
    await doctor.roleContext.page
      .getByRole("button", { name: "取消", exact: true })
      .click();
    await expect(prepareButton).toBeEnabled();
    assertNoReportWrites(doctor.ledger.entries().slice(doctorBusinessStart));

    await openReport(nurse.roleContext.page, route, enabledEnvironment);
    await expect(
      nurse.roleContext.page.getByText(REPORT_MARKER, { exact: true }),
    ).toBeVisible();
    await expect(
      nurse.roleContext.page.getByText(
        "报告锁定需由医生或管理员执行。",
        { exact: false },
      ),
    ).toBeVisible();
    await expect(
      nurse.roleContext.page.getByRole("button", {
        name: "准备锁定报告",
        exact: true,
      }),
    ).toHaveCount(0);
    assertNoReportWrites(nurse.ledger.entries());

    await closeAndSummarize(
      roleContexts,
      [doctor, nurse],
      {
        test: "unlocked-doctor-nurse",
        isolatedContexts: true,
        doctor: safeSessionSummary(doctor),
        nurse: safeSessionSummary(nurse),
        assertions: {
          doctorUnlockedEntry: "passed",
          localLockFormOpened: "passed",
          localLockFormCancelled: "passed",
          nurseReadonlyExplanation: "passed",
          reportWrites: 0,
        },
      },
      [
        password,
        descriptor.accounts.doctor.loginIdentifier,
        descriptor.accounts.nurse.loginIdentifier,
        route,
      ],
    );
  });

  test("doctor reads locked confirmed report without prior write controls", async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    const enabledEnvironment: EnabledEnvironment = environment;
    const descriptor = await readDescriptor();
    const password = requireRunnerSecret();
    const doctor = await login({
      roleContexts,
      role: "doctor",
      label: "locked-doctor",
      loginIdentifier: descriptor.accounts.doctor.loginIdentifier,
      password,
      environment: enabledEnvironment,
    });
    const route = descriptor.scenarios["locked-confirmed"].navigationPath;
    await openReport(doctor.roleContext.page, route, enabledEnvironment);
    const page = doctor.roleContext.page;
    await expect(
      page.getByText("已确认报告", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("已锁定", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("报告尚未归档", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("报告已锁定", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(
        "当前真实 status 仍为 confirmed；锁定事实来自服务端 lockedAt。",
        { exact: false },
      ),
    ).toBeVisible();
    await expect(page.getByText(REPORT_MARKER, { exact: true })).toBeVisible();
    for (const name of WRITE_CONTROL_NAMES) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
        0,
      );
    }
    assertNoReportWrites(doctor.ledger.entries());

    await closeAndSummarize(
      roleContexts,
      [doctor],
      {
        test: "locked-doctor-readonly",
        doctor: safeSessionSummary(doctor),
        assertions: {
          confirmedBadge: "passed",
          lockedBadge: "passed",
          notArchivedBadge: "passed",
          confirmedStatusTerminology: "passed",
          reportReadable: "passed",
          priorWriteControls: 0,
          reportWrites: 0,
        },
      },
      [password, descriptor.accounts.doctor.loginIdentifier, route],
    );
  });
});
