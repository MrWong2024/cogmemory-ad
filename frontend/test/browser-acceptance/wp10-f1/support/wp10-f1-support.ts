import { readFile } from 'node:fs/promises';

import type { BrowserContext, Page, Response } from '@playwright/test';

import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from '../../support/acceptance-env';
import { expect } from '../../support/acceptance-test';
import {
  NetworkLedger,
  type NetworkLedgerEntry,
} from '../../support/network-ledger';
import type {
  RoleContext,
  RoleContextFactory,
} from '../../support/role-context-factory';
import {
  ConsoleAudit,
  type ConsoleAuditEvent,
} from '../../support/runtime-audit';

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
  auditStartCheckpoint: F1AuditCheckpoint;
};

export type F1AuditCheckpoint = {
  consoleEventCount: number;
  networkEntries: NetworkLedgerEntry[];
};

export type F1ExpectedHttpFailure = {
  method: string;
  status: number;
  safeUrlPattern: string;
  count: number;
};

export type F1AllowedControlledAbort = {
  method: 'GET';
  status: number;
  safeUrlPattern: string;
  count: number;
};

export type F1AuditDeltaSummary = {
  checkpoint: F1AuditCheckpoint;
  expectedHttpConsoleErrors: number;
  expectedHttpFailures: number;
  controlledAborts: number;
  unexpectedConsoleErrors: 0;
  pageErrors: 0;
  unexpectedHttpFailures: 0;
  unexpectedRequestFailures: 0;
  mutationRequestAborts: 0;
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
export const PATIENT_ROUTE_PATTERN = '/patients/<id>';
export const VISIT_ROUTE_PATTERN = '/patients/<id>/visits/<id>';

export function invariant(
  condition: unknown,
  safeMessage: string,
): asserts condition {
  if (!condition) throw new Error(safeMessage);
}

function cloneNetworkEntries(entries: NetworkLedgerEntry[]): NetworkLedgerEntry[] {
  return entries.map((entry) => ({ ...entry, bodyKeys: [...entry.bodyKeys] }));
}

export function captureF1AuditCheckpoint(
  consoleAudit: ConsoleAudit,
  ledger: NetworkLedger,
): F1AuditCheckpoint {
  return {
    consoleEventCount: consoleAudit.events().length,
    networkEntries: cloneNetworkEntries(ledger.entries()),
  };
}

type NetworkEntryChange = {
  entry: NetworkLedgerEntry;
  isNew: boolean;
  statusChanged: boolean;
  failureChanged: boolean;
};

function networkEntryIdentityMatches(
  left: NetworkLedgerEntry,
  right: NetworkLedgerEntry,
): boolean {
  return (
    left.method === right.method &&
    left.safeUrlPattern === right.safeUrlPattern &&
    left.resourceType === right.resourceType &&
    left.initiator === right.initiator &&
    left.initiatorSource === right.initiatorSource &&
    left.bodyKeys.join('\u0000') === right.bodyKeys.join('\u0000')
  );
}

function readNetworkChanges(
  checkpoint: F1AuditCheckpoint,
  currentEntries: NetworkLedgerEntry[],
): NetworkEntryChange[] {
  if (currentEntries.length < checkpoint.networkEntries.length) {
    throw new Error('F1 audit network snapshot moved backwards');
  }

  return currentEntries.flatMap((entry, index): NetworkEntryChange[] => {
    const previous = checkpoint.networkEntries[index];
    if (!previous) {
      return [{ entry, isNew: true, statusChanged: entry.status !== null, failureChanged: entry.failureReason !== null }];
    }
    if (!networkEntryIdentityMatches(previous, entry)) {
      throw new Error('F1 audit network snapshot identity changed');
    }
    if (previous.status !== null && previous.status !== entry.status) {
      throw new Error('F1 audit observed an invalid response status transition');
    }
    if (
      previous.failureReason !== null &&
      previous.failureReason !== entry.failureReason
    ) {
      throw new Error('F1 audit observed an invalid request failure transition');
    }
    const statusChanged = previous.status !== entry.status;
    const failureChanged = previous.failureReason !== entry.failureReason;
    return statusChanged || failureChanged
      ? [{ entry, isNew: false, statusChanged, failureChanged }]
      : [];
  });
}

function auditExpectationKey(input: {
  method: string;
  status: number;
  safeUrlPattern: string;
}): string {
  return `${input.method.toUpperCase()}\u0000${input.status}\u0000${input.safeUrlPattern}`;
}

function buildExpectationCounts(
  expectations: Array<{
    method: string;
    status: number;
    safeUrlPattern: string;
    count: number;
  }>,
  kind: 'http' | 'abort',
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const expectation of expectations) {
    const validStatus =
      kind === 'http'
        ? expectation.status >= 400 && expectation.status < 500
        : expectation.status >= 100 && expectation.status < 500;
    if (
      !Number.isSafeInteger(expectation.count) ||
      expectation.count < 1 ||
      !validStatus ||
      !expectation.safeUrlPattern.startsWith('/') ||
      (kind === 'abort' && expectation.method.toUpperCase() !== 'GET')
    ) {
      throw new Error('F1 audit expectation is invalid');
    }
    const key = auditExpectationKey(expectation);
    counts.set(key, (counts.get(key) ?? 0) + expectation.count);
  }
  return counts;
}

function incrementCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function mapsEqual(left: Map<string, number>, right: Map<string, number>): boolean {
  return (
    left.size === right.size &&
    [...left].every(([key, count]) => right.get(key) === count)
  );
}

function matchConsoleEvent(
  event: ConsoleAuditEvent,
  expectations: F1ExpectedHttpFailure[],
  currentEntries: NetworkLedgerEntry[],
  matchedCounts: Map<string, number>,
): boolean {
  if (
    event.kind !== 'console_error' ||
    event.category !== 'network' ||
    event.httpStatus === null ||
    event.safeUrlPattern === null
  ) {
    return false;
  }

  const match = expectations.find((expectation) => {
    if (
      expectation.status !== event.httpStatus ||
      expectation.safeUrlPattern !== event.safeUrlPattern
    ) {
      return false;
    }
    const key = auditExpectationKey(expectation);
    const responseCount = currentEntries.filter(
      (entry) =>
        entry.method === expectation.method.toUpperCase() &&
        entry.status === expectation.status &&
        entry.safeUrlPattern === expectation.safeUrlPattern,
    ).length;
    return (matchedCounts.get(key) ?? 0) < responseCount;
  });
  if (!match) return false;
  incrementCount(matchedCounts, auditExpectationKey(match));
  return true;
}

export function assertF1AuditDelta(input: {
  consoleAudit: ConsoleAudit;
  ledger: NetworkLedger;
  checkpoint: F1AuditCheckpoint;
  expectedHttpFailures: F1ExpectedHttpFailure[];
  allowedControlledAborts: F1AllowedControlledAbort[];
}): F1AuditDeltaSummary {
  const currentConsoleEvents = input.consoleAudit.events();
  if (currentConsoleEvents.length < input.checkpoint.consoleEventCount) {
    throw new Error('F1 audit console snapshot moved backwards');
  }
  const newConsoleEvents = currentConsoleEvents.slice(
    input.checkpoint.consoleEventCount,
  );
  const currentEntries = input.ledger.entries();
  const changes = readNetworkChanges(input.checkpoint, currentEntries);

  const expectedHttpCounts = buildExpectationCounts(
    input.expectedHttpFailures,
    'http',
  );
  const actualHttpCounts = new Map<string, number>();
  const httpFailures = changes
    .filter(
      ({ entry, isNew, statusChanged }) =>
        (isNew || statusChanged) && entry.status !== null && entry.status >= 400,
    )
    .map(({ entry }) => entry);
  for (const entry of httpFailures) {
    if (entry.status === null || entry.status >= 500) {
      throw new Error('F1 audit detected an unexpected HTTP failure');
    }
    incrementCount(
      actualHttpCounts,
      auditExpectationKey({
        method: entry.method,
        status: entry.status,
        safeUrlPattern: entry.safeUrlPattern,
      }),
    );
  }
  if (!mapsEqual(actualHttpCounts, expectedHttpCounts)) {
    throw new Error('F1 audit HTTP failures did not match the stage contract');
  }

  const allowedAbortCounts = buildExpectationCounts(
    input.allowedControlledAborts,
    'abort',
  );
  const actualAbortCounts = new Map<string, number>();
  const requestFailures = changes
    .filter(
      ({ entry, isNew, failureChanged }) =>
        (isNew || failureChanged) && entry.failureReason !== null,
    )
    .map(({ entry }) => entry);
  for (const entry of requestFailures) {
    if (
      entry.failureReason !== 'aborted' ||
      entry.method !== 'GET' ||
      entry.status === null ||
      entry.status >= 500
    ) {
      throw new Error('F1 audit detected an unsafe request failure');
    }
    const key = auditExpectationKey({
      method: entry.method,
      status: entry.status,
      safeUrlPattern: entry.safeUrlPattern,
    });
    incrementCount(actualAbortCounts, key);
    if ((actualAbortCounts.get(key) ?? 0) > (allowedAbortCounts.get(key) ?? 0)) {
      throw new Error('F1 audit detected an unexplained request abort');
    }
  }

  const matchedConsoleCounts = new Map<string, number>();
  for (const event of newConsoleEvents) {
    if (
      !matchConsoleEvent(
        event,
        input.expectedHttpFailures,
        currentEntries,
        matchedConsoleCounts,
      )
    ) {
      throw new Error('F1 audit detected an unexplained Console or Page error');
    }
  }

  return {
    checkpoint: {
      consoleEventCount: currentConsoleEvents.length,
      networkEntries: cloneNetworkEntries(currentEntries),
    },
    expectedHttpConsoleErrors: newConsoleEvents.length,
    expectedHttpFailures: httpFailures.length,
    controlledAborts: requestFailures.length,
    unexpectedConsoleErrors: 0,
    pageErrors: 0,
    unexpectedHttpFailures: 0,
    unexpectedRequestFailures: 0,
    mutationRequestAborts: 0,
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
  const auditStartCheckpoint = captureF1AuditCheckpoint(consoleAudit, ledger);
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
  return { roleContext, ledger, consoleAudit, auditStartCheckpoint };
}

export async function openExecution(input: {
  page: Page;
  descriptor: Descriptor;
  environment: EnabledEnvironment;
}): Promise<void> {
  const responsePromise = input.page.waitForResponse(
    (response) =>
      new URL(response.url()).origin === input.environment.backendOrigin &&
      responsePath(response) === input.descriptor.scenario.navigationPath &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  await input.page.goto(
    `${input.environment.frontendOrigin}${input.descriptor.scenario.navigationPath}`,
    { waitUntil: 'domcontentloaded' },
  );
  await responsePromise;
  await expect(
    input.page.getByTestId('patient-administration-staff-panel'),
  ).toBeVisible();
  await expect(input.page.getByText('WP-10 F1 · MMSE 患者施测')).toBeVisible();
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
  auditStartCheckpoint: F1AuditCheckpoint;
}> {
  const ledger = new NetworkLedger();
  await ledger.attach(input.page);
  const consoleAudit = new ConsoleAudit(input.page);
  consoleAudit.start();
  return {
    ledger,
    consoleAudit,
    auditStartCheckpoint: captureF1AuditCheckpoint(consoleAudit, ledger),
  };
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
