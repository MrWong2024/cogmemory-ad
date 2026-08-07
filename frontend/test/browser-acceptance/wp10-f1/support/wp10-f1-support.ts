import { readFile } from 'node:fs/promises';

import type { BrowserContext, Page, Response } from '@playwright/test';

import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from '../../support/acceptance-env';
import { expect } from '../../support/acceptance-test';
import { NetworkLedger } from '../../support/network-ledger';
import type {
  RoleContext,
  RoleContextFactory,
} from '../../support/role-context-factory';
import { ConsoleAudit } from '../../support/runtime-audit';

export type Profile = 'F1-P1-same-device' | 'F1-P2-cross-device';

export type Descriptor = {
  schemaVersion: 1;
  batch: 'WP10-F1';
  profile: Profile;
  namespace: string;
  accounts: { staff: { loginIdentifier: string } };
  scenario: {
    patientId: string;
    visitId: string;
    scaleInstanceId: string;
    navigationPath: string;
    itemCount: number;
    itemBaselineHash: string;
  };
};

export type EnabledEnvironment = Extract<
  ReturnType<typeof resolveLiveAcceptanceEnvironment>,
  { enabled: true }
>;

export type StaffSession = {
  roleContext: RoleContext;
  ledger: NetworkLedger;
  consoleAudit: ConsoleAudit;
};

export type F1ExpectedHttpFailure = {
  method: string;
  status: number;
  safeUrlPattern: string;
};

export type F1BrowserAuditSummary = {
  expectedHttpFailuresObserved: number;
  ignoredCanceledGets: number;
  unexpectedConsoleErrors: 0;
  pageErrors: 0;
  unexpectedHttpFailures: 0;
  unexpectedTransportFailures: 0;
};

export const STAFF_ROOT_PATTERN =
  '/patients/<id>/visits/<id>/scale-instances/<id>/<id>';
export const PREPARATION_PATTERN = `${STAFF_ROOT_PATTERN}/preparation/confirm`;
export const HANDOFF_PATTERN = `${STAFF_ROOT_PATTERN}/handoff`;
export const PAUSE_PATTERN = `${STAFF_ROOT_PATTERN}/pause`;
export const RESUME_PATTERN = `${STAFF_ROOT_PATTERN}/resume`;
export const REISSUE_PATTERN = `${STAFF_ROOT_PATTERN}/entry-code/reissue`;
export const TERMINATE_PATTERN = `${STAFF_ROOT_PATTERN}/terminate`;
export const ENTER_PATTERN = '/<id>/enter';
export const CURRENT_PATTERN = '/<id>/current';
export const AUTH_ME_PATTERN = '/auth/me';

export function invariant(
  condition: unknown,
  safeMessage: string,
): asserts condition {
  if (!condition) throw new Error(safeMessage);
}

function auditExpectationKey(input: {
  method: string;
  status: number;
  safeUrlPattern: string;
}): string {
  return `${input.method.toUpperCase()}\u0000${input.status}\u0000${input.safeUrlPattern}`;
}

export function assertF1BrowserAudit(input: {
  consoleAudit: ConsoleAudit;
  ledger: NetworkLedger;
  expectedHttpFailures: F1ExpectedHttpFailure[];
}): F1BrowserAuditSummary {
  const entries = input.ledger.entries();
  const expectationKeys = new Set<string>();

  for (const expectation of input.expectedHttpFailures) {
    if (
      expectation.status < 400 ||
      expectation.status >= 500 ||
      !Number.isSafeInteger(expectation.status) ||
      !expectation.safeUrlPattern.startsWith('/')
    ) {
      throw new Error('F1 browser audit expectation is invalid');
    }
    expectationKeys.add(auditExpectationKey(expectation));
  }

  let ignoredCanceledGets = 0;
  for (const entry of entries) {
    if (entry.status !== null && entry.status >= 500) {
      throw new Error('F1 browser audit detected an HTTP 5xx response');
    }
    if (
      entry.status !== null &&
      entry.status >= 400 &&
      !expectationKeys.has(
        auditExpectationKey({
          method: entry.method,
          status: entry.status,
          safeUrlPattern: entry.safeUrlPattern,
        }),
      )
    ) {
      throw new Error('F1 browser audit detected an unexpected HTTP 4xx response');
    }

    if (entry.failureReason === null) {
      continue;
    }
    if (entry.method !== 'GET') {
      throw new Error(
        'F1 browser audit detected a mutation transport failure',
      );
    }
    if (entry.failureReason === 'aborted') {
      ignoredCanceledGets += 1;
      continue;
    }
    throw new Error(
      'F1 browser audit detected a GET timeout or transport failure',
    );
  }

  for (const expectation of input.expectedHttpFailures) {
    const observed = entries.some(
      (entry) =>
        entry.method === expectation.method.toUpperCase() &&
        entry.status === expectation.status &&
        entry.safeUrlPattern === expectation.safeUrlPattern,
    );
    if (!observed) {
      throw new Error(
        'F1 browser audit did not observe a required HTTP failure',
      );
    }
  }

  for (const event of input.consoleAudit.events()) {
    if (event.kind === 'page_error') {
      throw new Error('F1 browser audit detected a page error');
    }
    if (event.category !== 'network') {
      throw new Error('F1 browser audit detected an unexpected Console error');
    }

    if (event.httpStatus !== null) {
      const expectation = input.expectedHttpFailures.find(
        (candidate) =>
          candidate.status === event.httpStatus &&
          candidate.safeUrlPattern === event.safeUrlPattern,
      );
      const responseObserved =
        expectation !== undefined &&
        entries.some(
          (entry) =>
            entry.method === expectation.method.toUpperCase() &&
            entry.status === expectation.status &&
            entry.safeUrlPattern === expectation.safeUrlPattern,
        );
      if (!responseObserved) {
        throw new Error(
          'F1 browser audit detected an unexplained HTTP Console error',
        );
      }
      continue;
    }

    const canceledGetObserved =
      event.safeUrlPattern !== null &&
      entries.some(
        (entry) =>
          entry.method === 'GET' &&
          entry.failureReason === 'aborted' &&
          entry.safeUrlPattern === event.safeUrlPattern,
      );
    if (!canceledGetObserved) {
      throw new Error(
        'F1 browser audit detected an unexplained network Console error',
      );
    }
  }

  return {
    expectedHttpFailuresObserved: expectationKeys.size,
    ignoredCanceledGets,
    unexpectedConsoleErrors: 0,
    pageErrors: 0,
    unexpectedHttpFailures: 0,
    unexpectedTransportFailures: 0,
  };
}

export function resolveEnvironment(): EnabledEnvironment | null {
  assertDatabaseBoundaryIsClear();
  const environment = resolveLiveAcceptanceEnvironment();
  return environment.enabled ? environment : null;
}

export function requireSecret(): string {
  const value = process.env.WP10_F1_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error('WP10_F1_LOGIN_SECRET is required');
  }
  return value;
}

export async function readDescriptor(expectedProfile: Profile): Promise<Descriptor> {
  const runtimePath = process.env.WP10_F1_RUNTIME_PATH;
  if (!runtimePath) throw new Error('WP10_F1_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(runtimePath, 'utf8')) as unknown;
  invariant(value && typeof value === 'object', 'WP-10 F1 descriptor is invalid');
  const descriptor = value as Partial<Descriptor>;
  const scenario = descriptor.scenario;
  invariant(
    descriptor.schemaVersion === 1 &&
      descriptor.batch === 'WP10-F1' &&
      descriptor.profile === expectedProfile &&
      typeof descriptor.namespace === 'string' &&
      /^[a-z0-9][a-z0-9-]{2,19}$/.test(descriptor.namespace) &&
      typeof descriptor.accounts?.staff.loginIdentifier === 'string' &&
      scenario &&
      /^[a-f\d]{24}$/i.test(scenario.patientId) &&
      /^[a-f\d]{24}$/i.test(scenario.visitId) &&
      /^[a-f\d]{24}$/i.test(scenario.scaleInstanceId) &&
      scenario.navigationPath ===
        `/patients/${scenario.patientId}/visits/${scenario.visitId}/scale-instances/${scenario.scaleInstanceId}` &&
      scenario.itemCount > 0 &&
      /^[a-f\d]{64}$/i.test(scenario.itemBaselineHash),
    'WP-10 F1 descriptor contract is invalid',
  );
  return descriptor as Descriptor;
}

function responsePath(response: Response): string {
  return new URL(response.url()).pathname;
}

export async function loginStaff(input: {
  factory: RoleContextFactory;
  account: string;
  password: string;
  environment: EnabledEnvironment;
  viewport: { width: number; height: number };
}): Promise<StaffSession> {
  const roleContext = await input.factory.create('doctor', 'wp10-f1-staff', {
    viewport: input.viewport,
  });
  const { context, page } = roleContext;
  const ledger = new NetworkLedger();
  await ledger.attach(page);
  const consoleAudit = new ConsoleAudit(page);
  consoleAudit.start();
  await page.goto(`${input.environment.frontendOrigin}/login`, {
    waitUntil: 'domcontentloaded',
  });

  const healthResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${input.environment.backendOrigin}/health` &&
      response.request().method() === 'GET',
  );
  const healthStatus = await page.evaluate(async (backendOrigin) => {
    const response = await fetch(`${backendOrigin}/health`, {
      cache: 'no-store',
      credentials: 'include',
    });
    return response.status;
  }, input.environment.backendOrigin);
  const healthResponse = await healthResponsePromise;
  expect(healthStatus).toBe(200);
  expect(healthResponse.headers()['access-control-allow-origin']).toBe(
    input.environment.frontendOrigin,
  );
  expect(healthResponse.headers()['access-control-allow-credentials']).toBe(
    'true',
  );

  const loginResponsePromise = page.waitForResponse(
    (response) =>
      responsePath(response) === '/auth/login' &&
      response.request().method() === 'POST',
  );
  const meResponsePromise = page.waitForResponse(
    (response) =>
      responsePath(response) === '/auth/me' &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  await page.getByLabel('账号').fill(input.account);
  await page.getByLabel('密码').fill(input.password);
  await page.getByRole('button', { name: '登录系统', exact: true }).click();
  const [loginResponse, meResponse] = await Promise.all([
    loginResponsePromise,
    meResponsePromise,
  ]);
  expect(loginResponse.status()).toBe(201);
  expect(await meResponse.json()).toMatchObject({
    authenticated: true,
    user: { roles: ['doctor'] },
  });
  await expect(page).toHaveURL(`${input.environment.frontendOrigin}/dashboard`);
  const cookieMetadata = (await context.cookies(input.environment.backendOrigin)).map(
    ({ name, domain, httpOnly, secure, sameSite, path }) => ({
      name,
      domain,
      httpOnly,
      secure,
      sameSite,
      path,
    }),
  );
  expect(cookieMetadata).toEqual([
    {
      name: 'cogmemory_ad_session',
      domain: 'localhost',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
      path: '/',
    },
  ]);
  return { roleContext, ledger, consoleAudit };
}

export async function openExecution(input: {
  page: Page;
  descriptor: Descriptor;
  environment: EnabledEnvironment;
}): Promise<void> {
  const executionResponsePromise = input.page.waitForResponse(
    (response) =>
      new URL(response.url()).origin === input.environment.backendOrigin &&
      responsePath(response) === input.descriptor.scenario.navigationPath &&
      response.request().method() === 'GET',
  );
  await input.page.goto(
    `${input.environment.frontendOrigin}${input.descriptor.scenario.navigationPath}`,
    { waitUntil: 'domcontentloaded' },
  );
  const executionResponse = await executionResponsePromise;
  expect(executionResponse.status()).toBe(200);
  await expect(
    input.page.getByTestId('patient-administration-staff-panel'),
  ).toBeVisible();
  await expect(input.page.getByText('WP-10 F1 · MMSE 患者施测')).toBeVisible();
  const refreshButton = input.page.getByRole('button', {
    name: '手动刷新',
    exact: true,
  });
  await expect(refreshButton).toBeVisible();
  await expect(refreshButton).toBeEnabled();
  await expect(
    input.page.getByRole('button', { name: '创建患者施测会话', exact: true }),
  ).toBeVisible();
}

export async function completeLocalPreparation(page: Page): Promise<void> {
  await page
    .getByRole('checkbox', { name: '屏幕内容可见，横竖屏方向合适' })
    .check();
  await page
    .getByRole('checkbox', { name: '触摸、鼠标或手写输入可用' })
    .check();
  await page.getByRole('checkbox', { name: '确认使用中文施测' }).check();
  await page.getByRole('checkbox', { name: '已明确这是不计分练习' }).check();

  await page.getByRole('button', { name: '播放本地测试音' }).click();
  await expect(page.getByText('本地短测试音已播放，请确认音量舒适。')).toBeVisible();

  await page.getByRole('button', { name: '开始本地录音检查' }).click();
  await expect(
    page.getByText(/麦克风权限或设备不可用|当前浏览器不支持本地录音/),
  ).toBeVisible();

  const canvas = page.getByLabel('不计分触摸和书写练习画布');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  invariant(bounds, 'Preparation canvas bounds are unavailable');
  await page.mouse.move(bounds.x + 20, bounds.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 100, bounds.y + 80, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText('七项本地准备已完成')).toBeVisible();
}

export async function createPatientContext(input: {
  context: BrowserContext;
  page: Page;
}): Promise<{
  ledger: NetworkLedger;
  consoleAudit: ConsoleAudit;
}> {
  const ledger = new NetworkLedger();
  await ledger.attach(input.page);
  const consoleAudit = new ConsoleAudit(input.page);
  consoleAudit.start();
  return { ledger, consoleAudit };
}

export function assertNoF2F3Requests(ledgers: NetworkLedger[]): void {
  const forbidden = ledgers
    .flatMap((ledger) => ledger.entries())
    .filter(
      ({ method, safeUrlPattern }) =>
        (method !== 'GET' &&
          /\/item-responses\/|\/submit$|\/current\/complete$/.test(
            safeUrlPattern,
          )) ||
        /\/current\/assets\/|\/audio\/.*\/play$|\/evidence|\/takeover$|\/redo-last$|\/replay-authorize$|\/review|transcrib/i.test(
          safeUrlPattern,
        ),
    );
  if (forbidden.length !== 0) {
    throw new Error('WP-10 F1 network ledger detected an F2 or F3 request');
  }
}

export async function bodyContainsAny(page: Page, values: string[]): Promise<boolean> {
  return page.evaluate(
    (forbidden) => forbidden.some((value) => document.body.innerText.includes(value)),
    values,
  );
}
