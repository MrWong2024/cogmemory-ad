import { readFile } from 'node:fs/promises';
import type { Page, Response } from '@playwright/test';

import type { LockClinicalReportResponse } from '../../../src/features/assessments/types/clinical-report';
import { runAccessibilityAudit } from '../support/accessibility-audit';
import { assertDatabaseBoundaryIsClear, resolveLiveAcceptanceEnvironment } from '../support/acceptance-env';
import { expect, test } from '../support/acceptance-test';
import { BeforeUnloadEvidence } from '../support/beforeunload-evidence';
import {
  assertFocusVisible,
  assertTrustedKeyPair,
  clearKeyboardEvidence,
  installKeyboardEvidence,
  pressKeyboardDownUp,
  readKeyboardEvidence,
  tabToLocator,
} from '../support/keyboard-evidence';
import { OneShotRequestAbort } from '../support/network-control';
import { NetworkLedger } from '../support/network-ledger';
import type { RoleContext, RoleContextFactory } from '../support/role-context-factory';
import { assertNoGlobalHorizontalOverflow, auditViewport } from '../support/viewport-audit';

type RuntimeDescriptor = {
  schemaVersion: 1;
  batch: 'B12';
  profile: 'B12-P1-user-entry-readonly';
  accounts: { doctor: { loginIdentifier: string } };
  scenarios: Record<'unlocked-confirmed', { reportId: string; navigationPath: string }>;
};
type EnabledEnvironment = Extract<ReturnType<typeof resolveLiveAcceptanceEnvironment>, { enabled: true }>;
type StorageBoundary = {
  localStorageClear: true;
  sessionStorageClear: true;
  indexedDbClear: true;
  queryClear: true;
  hashClear: true;
};

const environment = resolveLiveAcceptanceEnvironment();
const LOCK_NOTE = 'B12 U03 脱敏未提交锁定说明';
const LOCK_PATTERN = '/patients/<id>/visits/<id>/clinical-reports/<id>/lock';
const LOCK_REGION = 'section[aria-labelledby="clinical-report-lock-heading"]';
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

function requireSecret(): string {
  const value = process.env.B12_U01_LOGIN_SECRET;
  if (!value || value.length < 16) throw new Error('B12_U01_LOGIN_SECRET must be injected for live U03');
  return value;
}

async function readDescriptor(): Promise<RuntimeDescriptor> {
  const runtimePath = process.env.B12_U01_RUNTIME_PATH;
  if (!runtimePath) throw new Error('B12_U01_RUNTIME_PATH is required');
  const candidate = JSON.parse(await readFile(runtimePath, 'utf8')) as Partial<RuntimeDescriptor>;
  expect(candidate).toMatchObject({ schemaVersion: 1, batch: 'B12', profile: 'B12-P1-user-entry-readonly' });
  expect(candidate.accounts?.doctor.loginIdentifier).toBeTruthy();
  expect(candidate.scenarios?.['unlocked-confirmed'].navigationPath).toMatch(/^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}$/);
  return candidate as RuntimeDescriptor;
}

function responsePath(response: Response): string {
  return new URL(response.url()).pathname;
}

async function loginDoctor(input: {
  roleContexts: RoleContextFactory;
  descriptor: RuntimeDescriptor;
  password: string;
  label: string;
  environment: EnabledEnvironment;
  viewport?: { width: number; height: number };
}): Promise<{ roleContext: RoleContext; healthStatus: number }> {
  const roleContext = await input.roleContexts.create('doctor', input.label, input.viewport ? { viewport: input.viewport } : {});
  const { context, page } = roleContext;
  await page.goto(`${input.environment.frontendOrigin}/login`, { waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => window.location.origin)).toBe(input.environment.frontendOrigin);
  const healthPromise = page.waitForResponse((response) => response.url() === `${input.environment.backendOrigin}/health`);
  const healthStatus = await page.evaluate(async (backendOrigin) => {
    const response = await fetch(`${backendOrigin}/health`, { credentials: 'include', cache: 'no-store' });
    return response.status;
  }, input.environment.backendOrigin);
  expect((await healthPromise).status()).toBe(200);
  expect(healthStatus).toBe(200);
  const loginPromise = page.waitForResponse((response) => responsePath(response) === '/auth/login' && response.request().method() === 'POST');
  const mePromise = page.waitForResponse((response) => responsePath(response) === '/auth/me' && response.request().method() === 'GET' && response.status() === 200);
  await page.getByLabel('账号').fill(input.descriptor.accounts.doctor.loginIdentifier);
  await page.getByLabel('密码').fill(input.password);
  await page.getByRole('button', { name: '登录系统', exact: true }).click();
  const [loginResponse, meResponse] = await Promise.all([loginPromise, mePromise]);
  expect(loginResponse.status()).toBe(201);
  expect(new URL(loginResponse.url()).origin).toBe(input.environment.backendOrigin);
  expect(await meResponse.json()).toMatchObject({ authenticated: true, user: { roles: ['doctor'] } });
  const cookies = (await context.cookies(input.environment.backendOrigin)).filter((cookie) => cookie.httpOnly);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatchObject({ name: 'cogmemory_ad_session', domain: 'localhost', httpOnly: true, secure: false, sameSite: 'Lax' });
  await expect(page).toHaveURL(`${input.environment.frontendOrigin}/dashboard`);
  return { roleContext, healthStatus };
}

async function openUnlockedReport(page: Page, scenario: RuntimeDescriptor['scenarios']['unlocked-confirmed'], env: EnabledEnvironment): Promise<void> {
  const latestPromise = page.waitForResponse((response) => responsePath(response).endsWith('/clinical-reports/latest') && response.request().method() === 'GET' && response.status() === 200);
  await page.goto(`${env.frontendOrigin}${scenario.navigationPath}`, { waitUntil: 'domcontentloaded' });
  const body = (await (await latestPromise).json()) as { report: LockClinicalReportResponse['report'] };
  expect(body.report).toMatchObject({ id: scenario.reportId, status: 'confirmed', lockedAt: null, lock: null });
}

async function openAndFillLockForm(page: Page): Promise<void> {
  await page.getByRole('button', { name: '准备锁定报告', exact: true }).click();
  await page.getByLabel('锁定流程说明（必填）').fill(LOCK_NOTE);
  await page.getByLabel(/我已核对当前已确认报告/).check();
  await expect(page.getByRole('button', { name: '确认不可逆锁定', exact: true })).toBeEnabled();
}

async function logoutThroughSiblingPage(page: Page, env: EnabledEnvironment): Promise<number> {
  const sibling = await page.context().newPage();
  try {
    await sibling.goto(`${env.frontendOrigin}/dashboard`, { waitUntil: 'domcontentloaded' });
    const logout = sibling.getByRole('button', { name: '退出登录', exact: true });
    await expect(logout).toBeVisible();
    const responsePromise = sibling.waitForResponse((response) => responsePath(response) === '/auth/logout' && response.request().method() === 'POST');
    await logout.click();
    const response = await responsePromise;
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(300);
    await expect(sibling).toHaveURL(`${env.frontendOrigin}/login`);
    return response.status();
  } finally {
    await sibling.close();
  }
}

async function auditLockDraftStorage(page: Page): Promise<StorageBoundary> {
  const result = await page.evaluate(async (lockNote) => {
    const forbidden = /lockNote|lockDraft|clinicalReportLock|expectedUpdatedAt/i;
    const contains = (value: unknown): boolean => {
      try {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        return forbidden.test(serialized) || serialized.includes(lockNote);
      } catch {
        return true;
      }
    };
    let indexedDbForbidden = false;
    const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
    for (const info of databases) {
      if (!info.name) continue;
      indexedDbForbidden ||= contains(info.name);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(info.name!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const names = [...database.objectStoreNames];
        if (names.length === 0) continue;
        const transaction = database.transaction(names, 'readonly');
        for (const name of names) {
          const values = await new Promise<unknown[]>((resolve, reject) => {
            const request = transaction.objectStore(name).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          indexedDbForbidden ||= contains(name) || values.some(contains);
        }
      } finally {
        database.close();
      }
    }
    return {
      localStorageForbidden: Object.entries(localStorage).some(contains),
      sessionStorageForbidden: Object.entries(sessionStorage).some(contains),
      indexedDbForbidden,
      queryForbidden: contains(window.location.search),
      hashForbidden: contains(window.location.hash),
    };
  }, LOCK_NOTE);
  expect(result).toEqual({ localStorageForbidden: false, sessionStorageForbidden: false, indexedDbForbidden: false, queryForbidden: false, hashForbidden: false });
  return { localStorageClear: true, sessionStorageClear: true, indexedDbClear: true, queryClear: true, hashClear: true };
}

async function assertOneStableLockAttempt(ledger: NetworkLedger): Promise<void> {
  const observationEndsAt = Date.now() + 1_000;
  await expect.poll(() => Date.now() < observationEndsAt ? -1 : ledger.count({ method: 'POST', safeUrlPattern: LOCK_PATTERN }), {
    timeout: 2_500,
    intervals: [200, 250, 300, 400],
  }).toBe(1);
  ledger.assertNoAutomaticRetry({ method: 'POST', safeUrlPattern: LOCK_PATTERN });
}

test.describe('B12-U03 reachable recovery and representative accessibility', () => {
  test.beforeEach(() => {
    test.skip(!environment.enabled, 'BROWSER_ACCEPTANCE_RUN_LIVE=1 is required');
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test('redirects to login after the real session is logged out in a sibling page', async ({ roleContexts }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const password = requireSecret();
    const { roleContext, healthStatus } = await loginDoctor({ roleContexts, descriptor, password, label: 'u03-session-expiry', environment });
    const { page } = roleContext;
    const ledger = new NetworkLedger();
    await ledger.attach(page);
    const scenario = descriptor.scenarios['unlocked-confirmed'];
    await openUnlockedReport(page, scenario, environment);
    await openAndFillLockForm(page);
    const logoutStatus = await logoutThroughSiblingPage(page, environment);
    const lockPath = `${scenario.navigationPath}/clinical-reports/${scenario.reportId}/lock`;
    const responsePromise = page.waitForResponse((response) => responsePath(response) === lockPath && response.request().method() === 'POST');
    await page.getByRole('button', { name: '确认不可逆锁定', exact: true }).click();
    expect((await responsePromise).status()).toBe(401);
    await expect(page).toHaveURL(`${environment.frontendOrigin}/login`);
    await assertOneStableLockAttempt(ledger);
    expect(ledger.count({ method: 'POST', safeUrlPattern: LOCK_PATTERN })).toBe(1);
    await expect(page.getByText('本次锁定回执：', { exact: false })).toHaveCount(0);
    await ledger.detach();
    const closed = await roleContexts.closeAll();
    expect(closed.activeContextCount).toBe(0);
    console.log(`B12_U03_SESSION_EVIDENCE ${JSON.stringify({ doctorContexts: 1, siblingPage: true, healthStatus, logoutStatus, lockPostCount: 1, lockStatus: 401, loginRedirect: true, automaticRetry: 0, successReceipt: false, contextsClosed: true })}`);
  });

  test('keeps the in-memory draft after one aborted lock request and clears it after reload', async ({ roleContexts }) => {
    if (!environment.enabled) return;
    test.setTimeout(60_000);
    const descriptor = await readDescriptor();
    const password = requireSecret();
    const { roleContext, healthStatus } = await loginDoctor({ roleContexts, descriptor, password, label: 'u03-network-recovery', environment, viewport: MOBILE_VIEWPORT });
    const { page } = roleContext;
    const ledger = new NetworkLedger();
    await ledger.attach(page);
    await installKeyboardEvidence(page);
    const scenario = descriptor.scenarios['unlocked-confirmed'];
    await openUnlockedReport(page, scenario, environment);
    const initialViewport = await auditViewport(page, MOBILE_VIEWPORT);
    assertNoGlobalHorizontalOverflow(initialViewport);

    const prepare = page.getByRole('button', { name: '准备锁定报告', exact: true });
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    const prepareTraversal = await tabToLocator(page, prepare, 120);
    await assertFocusVisible(prepare);
    await clearKeyboardEvidence(page);
    await pressKeyboardDownUp(page, 'Enter');
    expect(assertTrustedKeyPair(await readKeyboardEvidence(page), 'Enter', 'button')).toBe(2);

    const note = page.getByLabel('锁定流程说明（必填）');
    const checkbox = page.getByLabel(/我已核对当前已确认报告/);
    const submit = page.getByRole('button', { name: '确认不可逆锁定', exact: true });
    await expect(note).toHaveAccessibleName('锁定流程说明（必填）');
    await expect(checkbox).toHaveAccessibleName('我已核对当前已确认报告，并理解本次锁定不可撤销，且锁定只作用于当前报告文档。');
    await expect(page.locator('label[for="clinical-report-lock-note"]')).toBeVisible();
    await expect(page.locator('label[for="clinical-report-lock-confirmed"]')).toBeVisible();
    const noteTraversal = await tabToLocator(page, note, 20);
    await assertFocusVisible(note);
    await page.keyboard.type(LOCK_NOTE);
    const checkboxTraversal = await tabToLocator(page, checkbox, 10);
    await assertFocusVisible(checkbox);
    await clearKeyboardEvidence(page);
    await pressKeyboardDownUp(page, 'Space');
    await expect(checkbox).toBeChecked();
    expect(assertTrustedKeyPair(await readKeyboardEvidence(page), ' ', 'checkbox')).toBe(2);
    const submitTraversal = await tabToLocator(page, submit, 10);
    await assertFocusVisible(submit);
    await expect(submit).toBeEnabled();

    const axe = await runAccessibilityAudit(page, { include: [LOCK_REGION] });
    expect(axe.violationCount).toBe(0);
    const storageBeforeRequest = await auditLockDraftStorage(page);
    const reportUrl = page.url();
    const dismissEvidence = new BeforeUnloadEvidence(page, 'dismiss');
    dismissEvidence.observe();
    await page.goto(`${environment.frontendOrigin}/dashboard`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    const dismissed = dismissEvidence.stop();
    expect(dismissed).toEqual({ beforeUnloadDialogCount: 1, otherDialogCount: 0, automatedDisposition: 'dismiss' });
    expect(page.url()).toBe(reportUrl);
    await expect(note).toHaveValue(LOCK_NOTE);
    await expect(checkbox).toBeChecked();
    expect(ledger.count({ method: 'POST', safeUrlPattern: LOCK_PATTERN })).toBe(0);

    if (!(await submit.evaluate((node) => node === document.activeElement))) await tabToLocator(page, submit, 20);
    await assertFocusVisible(submit);
    const lockPath = `${scenario.navigationPath}/clinical-reports/${scenario.reportId}/lock`;
    const abort = new OneShotRequestAbort(page, (request) => request.method() === 'POST' && new URL(request.url()).pathname === lockPath);
    await abort.install();
    await clearKeyboardEvidence(page);
    await pressKeyboardDownUp(page, 'Enter');
    await abort.waitForStarted();
    expect(assertTrustedKeyPair(await readKeyboardEvidence(page), 'Enter', 'button')).toBe(2);
    await expect(page.getByText('报告服务暂时不可用，请稍后手工重试。', { exact: true })).toBeVisible();
    const abortSummary = await abort.dispose();
    expect(abortSummary).toEqual({ matchedRequestCount: 1, abortedRequestCount: 1, continuedRequestCount: 0 });
    await assertOneStableLockAttempt(ledger);
    await expect(note).toHaveValue(LOCK_NOTE);
    await expect(checkbox).toBeChecked();
    await expect(submit).toBeEnabled();
    await expect(page.getByText('本次锁定回执：', { exact: false })).toHaveCount(0);
    await expect(page.getByText('报告已锁定', { exact: true })).toHaveCount(0);
    const storageAfterAbort = await auditLockDraftStorage(page);

    const latestPromise = page.waitForResponse((response) => responsePath(response).endsWith('/clinical-reports/latest') && response.request().method() === 'GET' && response.status() === 200);
    const acceptEvidence = new BeforeUnloadEvidence(page, 'accept');
    acceptEvidence.observe();
    await page.reload({ waitUntil: 'domcontentloaded' });
    const refreshed = (await (await latestPromise).json()) as { report: LockClinicalReportResponse['report'] };
    const accepted = acceptEvidence.stop();
    expect(accepted).toEqual({ beforeUnloadDialogCount: 1, otherDialogCount: 0, automatedDisposition: 'accept' });
    expect(refreshed.report).toMatchObject({ status: 'confirmed', lockedAt: null, lock: null });
    await expect(page.getByText(LOCK_NOTE, { exact: true })).toHaveCount(0);
    await expect(note).toHaveCount(0);
    await expect(checkbox).toHaveCount(0);
    await expect(prepare).toBeEnabled();
    await expect(page.getByText('本次锁定回执：', { exact: false })).toHaveCount(0);
    expect(ledger.count({ method: 'POST', safeUrlPattern: LOCK_PATTERN })).toBe(1);
    const storageAfterReload = await auditLockDraftStorage(page);
    const finalViewport = await auditViewport(page, MOBILE_VIEWPORT);
    assertNoGlobalHorizontalOverflow(finalViewport);
    const networkSummary = await ledger.detach();
    const closed = await roleContexts.closeAll();
    expect(closed.activeContextCount).toBe(0);
    console.log(`B12_U03_NETWORK_EVIDENCE ${JSON.stringify({ doctorContexts: 1, healthStatus, viewport: MOBILE_VIEWPORT, keyboard: { prepareTraversal, noteTraversal, checkboxTraversal, submitTraversal, trustedEnter: true, trustedSpace: true, focusVisible: true }, labels: { textarea: true, checkbox: true }, axe: { include: LOCK_REGION, violationCount: axe.violationCount }, beforeUnload: { dismissed, accepted }, abort: abortSummary, lockPostCount: 1, stableError: true, draftRetainedAfterAbort: true, automaticRetry: 0, storage: { beforeRequest: storageBeforeRequest, afterAbort: storageAfterAbort, afterReload: storageAfterReload }, reload: { draftCleared: true, checkboxCleared: true, reportLocked: false, prepareAvailable: true }, horizontalOverflow: false, failedRequestCount: networkSummary.failedRequestCount, contextsClosed: true })}`);
  });
});
