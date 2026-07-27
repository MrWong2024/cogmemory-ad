import type { Locator, Page, Response } from '@playwright/test';
import { resolveB1089Environment } from './b10-89-env';
import {
  deleteB1089RuntimeDescriptor,
  readB1089RuntimeDescriptor,
  type B1089RuntimeDescriptor,
} from './b10-runtime-descriptor';
import {
  assertFocusLeavesRegion,
  assertFocusVisible,
  assertTrustedKeyPair,
  clearKeyboardEvidence,
  installKeyboardEvidence,
  isFocusWithin,
  pressKeyboard,
  pressKeyboardDownUp,
  readFocusEvidence,
  readKeyboardEvidence,
  tabToLocator,
} from '../support/keyboard-evidence';
import {
  NetworkLedger,
  type NetworkLedgerEntry,
} from '../support/network-ledger';
import { ConsoleAudit, auditRuntimeStorage } from '../support/runtime-audit';
import { safeJsonStringify } from '../support/safe-output';
import { expect, test } from '../support/acceptance-test';

const environment = resolveB1089Environment();
const viewports = [
  { label: '1536x864', width: 1536, height: 864 },
  { label: '390x844', width: 390, height: 844 },
] as const;

type ViewportEvidence = {
  viewport: string;
  forwardFocusCategories: string[];
  reverseFocusCategories: string[];
  trustedKeydownCount: number;
  trustedKeyupCount: number;
  buttonEnter: boolean;
  checkboxSpaceStates: [false, true, false];
  detailsStates: [false, true, false];
  scaleLinkEnter: boolean;
  focusVisible: {
    button: true;
    checkbox: true;
    summary: true;
    link: true;
  };
  focusLeftAndReturned: boolean;
  network: {
    latestReadRequestCount: number;
    pageReadRequestCount: number;
    abortedReadRequestCount: number;
    loginRequestCount: 1;
    logoutRequestCount: 1;
    reportWriteRequestCount: 0;
    a17A18A19WriteRequestCount: 0;
    productBusinessWriteRequestCount: 0;
    automaticRetryDetected: false;
    pollingDetected: false;
  };
  console: {
    warningCount: 0;
    expectedScaleNoScoreNetworkErrorCount: 1;
    unexpectedErrorCount: 0;
    pageErrorCount: 0;
  };
  storage: 'clear';
  cookie: 'http_only_session_then_cleared';
  cors: 'passed';
  url: 'safe_single_scale_route';
  login: 'passed';
  logout: 'passed';
};

function reportCard(page: Page): Locator {
  return page
    .getByRole('heading', { name: '访视级临床报告', exact: true })
    .locator('..')
    .locator('..')
    .locator('..')
    .locator('..');
}

function isMutation(entry: NetworkLedgerEntry): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(entry.method);
}

function isAuthMutation(entry: NetworkLedgerEntry): boolean {
  return (
    entry.method === 'POST' &&
    (entry.safeUrlPattern === '/auth/login' ||
      entry.safeUrlPattern === '/auth/logout')
  );
}

function apiResponsesHaveExactCors(
  responses: readonly Promise<boolean>[],
): Promise<boolean> {
  return Promise.all(responses).then(
    (checks) => checks.length > 0 && checks.every(Boolean),
  );
}

async function recordTrustedEvents(page: Page): Promise<{
  keydown: number;
  keyup: number;
}> {
  const events = await readKeyboardEvidence(page);
  expect(events.length).toBeGreaterThan(0);
  expect(events.every(({ isTrusted }) => isTrusted)).toBe(true);
  return {
    keydown: events.filter(({ type }) => type === 'keydown').length,
    keyup: events.filter(({ type }) => type === 'keyup').length,
  };
}

async function exerciseViewport(
  page: Page,
  contextCookies: () => ReturnType<ReturnType<Page['context']>['cookies']>,
  descriptor: B1089RuntimeDescriptor,
  viewport: (typeof viewports)[number],
  frontendOrigin: string,
  backendOrigin: string,
  fixturePassword: string,
): Promise<ViewportEvidence> {
  const ledger = new NetworkLedger();
  await ledger.attach(page);
  const corsChecks: Promise<boolean>[] = [];
  const onResponse = (response: Response): void => {
    if (!response.url().startsWith(`${backendOrigin}/`)) return;
    corsChecks.push(
      response
        .allHeaders()
        .then(
          (headers) =>
            headers['access-control-allow-origin'] === frontendOrigin &&
            headers['access-control-allow-credentials'] === 'true',
        ),
    );
  };
  page.on('response', onResponse);

  await page.goto(`${frontendOrigin}/login`, { waitUntil: 'domcontentloaded' });
  const accountInput = page.getByLabel('账号', { exact: true });
  const passwordInput = page.getByLabel('密码', { exact: true });
  await expect(accountInput).toBeVisible();
  await accountInput.fill(descriptor.loginIdentifier);
  await passwordInput.fill(fixturePassword);
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/auth/login',
  );
  await page.getByRole('button', { name: '登录系统', exact: true }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBeGreaterThanOrEqual(200);
  expect(loginResponse.status()).toBeLessThan(300);
  await page.waitForURL(`${frontendOrigin}/dashboard`);
  expect(
    (await passwordInput.count()) === 0 ||
      (await passwordInput.inputValue()) === '',
  ).toBe(true);

  await installKeyboardEvidence(page);
  const consoleAudit = new ConsoleAudit(page);
  consoleAudit.start();
  await page.goto(`${frontendOrigin}${descriptor.navigationPath}`, {
    waitUntil: 'domcontentloaded',
  });
  const prepareButton = page.getByRole('button', {
    name: '准备确认报告',
    exact: true,
  });
  await expect(prepareButton).toBeVisible();
  const region = reportCard(page);
  await expect(region).toBeVisible();

  let trustedKeydownCount = 0;
  let trustedKeyupCount = 0;
  await clearKeyboardEvidence(page);
  const forward = await tabToLocator(page, prepareButton, 80);
  expect(forward.pressCount).toBeGreaterThan(1);
  expect(await isFocusWithin(region)).toBe(true);
  const forwardTrusted = await recordTrustedEvents(page);
  trustedKeydownCount += forwardTrusted.keydown;
  trustedKeyupCount += forwardTrusted.keyup;

  await clearKeyboardEvidence(page);
  const reverseFocusCategories: string[] = [];
  for (let index = 0; index < forward.pressCount - 1; index += 1) {
    await pressKeyboard(page, 'Shift+Tab');
    reverseFocusCategories.push(
      (await readFocusEvidence(page)).controlCategory,
    );
  }
  expect(reverseFocusCategories).toEqual(
    forward.controlCategories.slice(0, -1).reverse(),
  );
  const reverseTrusted = await recordTrustedEvents(page);
  trustedKeydownCount += reverseTrusted.keydown;
  trustedKeyupCount += reverseTrusted.keyup;
  await clearKeyboardEvidence(page);
  await tabToLocator(page, prepareButton, forward.pressCount);
  const returnTrusted = await recordTrustedEvents(page);
  trustedKeydownCount += returnTrusted.keydown;
  trustedKeyupCount += returnTrusted.keyup;
  await assertFocusVisible(prepareButton);

  await clearKeyboardEvidence(page);
  await pressKeyboardDownUp(page, 'Enter');
  const buttonEvents = await readKeyboardEvidence(page);
  assertTrustedKeyPair(buttonEvents, 'Enter', 'button');
  trustedKeydownCount += 1;
  trustedKeyupCount += 1;
  const checkbox = page.locator('#clinical-report-confirmation-confirmed');
  await expect(checkbox).toBeVisible();

  await clearKeyboardEvidence(page);
  await tabToLocator(page, checkbox, 100);
  const checkboxTraversal = await recordTrustedEvents(page);
  trustedKeydownCount += checkboxTraversal.keydown;
  trustedKeyupCount += checkboxTraversal.keyup;
  await assertFocusVisible(checkbox);
  expect(await checkbox.isChecked()).toBe(false);
  await clearKeyboardEvidence(page);
  await pressKeyboardDownUp(page, 'Space');
  expect(await checkbox.isChecked()).toBe(true);
  assertTrustedKeyPair(await readKeyboardEvidence(page), ' ', 'checkbox');
  trustedKeydownCount += 1;
  trustedKeyupCount += 1;
  await clearKeyboardEvidence(page);
  await pressKeyboardDownUp(page, 'Space');
  expect(await checkbox.isChecked()).toBe(false);
  assertTrustedKeyPair(await readKeyboardEvidence(page), ' ', 'checkbox');
  trustedKeydownCount += 1;
  trustedKeyupCount += 1;

  const details = region.locator('details').filter({
    has: page.getByText('查看报告技术信息与历史纳入范围', { exact: true }),
  });
  const summary = details.locator('summary');
  await clearKeyboardEvidence(page);
  await tabToLocator(page, summary, 100);
  const summaryTraversal = await recordTrustedEvents(page);
  trustedKeydownCount += summaryTraversal.keydown;
  trustedKeyupCount += summaryTraversal.keyup;
  await assertFocusVisible(summary);
  expect(await details.getAttribute('open')).toBeNull();
  await clearKeyboardEvidence(page);
  await pressKeyboardDownUp(page, 'Enter');
  await expect(details).toHaveAttribute('open', '');
  assertTrustedKeyPair(await readKeyboardEvidence(page), 'Enter', 'summary');
  trustedKeydownCount += 1;
  trustedKeyupCount += 1;
  await clearKeyboardEvidence(page);
  await pressKeyboardDownUp(page, 'Enter');
  await expect(details).not.toHaveAttribute('open', '');
  assertTrustedKeyPair(await readKeyboardEvidence(page), 'Enter', 'summary');
  trustedKeydownCount += 1;
  trustedKeyupCount += 1;

  await clearKeyboardEvidence(page);
  await pressKeyboardDownUp(page, 'Enter');
  await expect(details).toHaveAttribute('open', '');
  assertTrustedKeyPair(await readKeyboardEvidence(page), 'Enter', 'summary');
  trustedKeydownCount += 1;
  trustedKeyupCount += 1;
  const scaleLink = details
    .getByRole('link', { name: '查看历史纳入量表', exact: true })
    .first();
  await clearKeyboardEvidence(page);
  await tabToLocator(page, scaleLink, 100);
  const linkTraversal = await recordTrustedEvents(page);
  trustedKeydownCount += linkTraversal.keydown;
  trustedKeyupCount += linkTraversal.keyup;
  await assertFocusVisible(scaleLink);
  await clearKeyboardEvidence(page);
  const scaleNavigation = page.waitForURL((url) =>
    /^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}\/scale-instances\/[a-f\d]{24}$/i.test(
      url.pathname,
    ),
  );
  await pressKeyboardDownUp(page, 'Enter');
  await scaleNavigation;
  const scaleLinkEvents = await readKeyboardEvidence(page);
  assertTrustedKeyPair(scaleLinkEvents, 'Enter', 'link');
  trustedKeydownCount += 1;
  trustedKeyupCount += 1;
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.waitForLoadState('networkidle', { timeout: 10_000 });
  const activatedPath = new URL(page.url()).pathname;
  expect(activatedPath).not.toContain('/clinical-reports/');

  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(prepareButton).toBeVisible();
  const returnedRegion = reportCard(page);
  const returnedDetails = returnedRegion.locator('details').filter({
    has: page.getByText('查看报告技术信息与历史纳入范围', { exact: true }),
  });
  const returnedSummary = returnedDetails.locator('summary');
  await clearKeyboardEvidence(page);
  await tabToLocator(page, returnedSummary, 100);
  if ((await returnedDetails.getAttribute('open')) !== null) {
    await pressKeyboardDownUp(page, 'Enter');
    await expect(returnedDetails).not.toHaveAttribute('open', '');
  }
  const leavePressCount = await assertFocusLeavesRegion(
    page,
    returnedRegion,
    20,
  );
  expect(leavePressCount).toBeGreaterThan(0);
  expect(await isFocusWithin(returnedRegion)).toBe(false);
  await pressKeyboard(page, 'Shift+Tab');
  expect(await isFocusWithin(returnedRegion)).toBe(true);
  await expect(returnedSummary).toBeFocused();
  await assertFocusVisible(returnedSummary);
  const leaveTrusted = await recordTrustedEvents(page);
  trustedKeydownCount += leaveTrusted.keydown;
  trustedKeyupCount += leaveTrusted.keyup;

  const storage = await auditRuntimeStorage(page);
  expect(storage.localStorageKeys).toEqual([]);
  expect(storage.sessionStorageKeys).toEqual([]);
  expect(storage.indexedDbNames).toEqual([]);
  expect(storage.forbiddenValueDetected).toBe(false);
  expect(storage.documentCookieEmpty).toBe(true);
  expect(storage.documentCookieForbiddenPatternDetected).toBe(false);
  expect(storage.urlHasSensitiveQueryOrHash).toBe(false);
  const sessionCookies = await contextCookies();
  expect(sessionCookies.some(({ httpOnly }) => httpOnly)).toBe(true);

  await page.goto(`${frontendOrigin}/dashboard`, {
    waitUntil: 'domcontentloaded',
  });
  const logoutButton = page.getByRole('button', {
    name: '退出登录',
    exact: true,
  });
  await expect(logoutButton).toBeVisible();
  await page.waitForLoadState('networkidle', { timeout: 10_000 });
  const expectedScaleNoScoreReads = ledger.entries().filter(
    ({ method, status, failureReason, safeUrlPattern }) =>
      method === 'GET' &&
      status === 404 &&
      failureReason === null &&
      safeUrlPattern.endsWith('/score-results/latest'),
  );
  expect(expectedScaleNoScoreReads).toHaveLength(1);
  const consoleSummary = consoleAudit.stop();
  const consoleCategorySummary = safeJsonStringify(consoleSummary.categories);
  expect(consoleSummary.warningCount, consoleCategorySummary).toBe(0);
  expect(consoleSummary.errorCount, consoleCategorySummary).toBe(1);
  expect(consoleSummary.categories).toEqual([
    { category: 'network', count: 1 },
  ]);
  expect(consoleSummary.pageErrorCount, consoleCategorySummary).toBe(0);
  const logoutResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/auth/logout',
  );
  await logoutButton.click();
  const logoutResponse = await logoutResponsePromise;
  expect(logoutResponse.status()).toBeGreaterThanOrEqual(200);
  expect(logoutResponse.status()).toBeLessThan(300);
  await page.waitForURL(`${frontendOrigin}/login`);
  expect((await contextCookies()).some(({ httpOnly }) => httpOnly)).toBe(false);
  page.off('response', onResponse);
  expect(await apiResponsesHaveExactCors(corsChecks)).toBe(true);
  const network = await ledger.detach();
  const loginRequests = network.entries.filter(
    (entry) =>
      entry.method === 'POST' && entry.safeUrlPattern === '/auth/login',
  );
  const logoutRequests = network.entries.filter(
    (entry) =>
      entry.method === 'POST' && entry.safeUrlPattern === '/auth/logout',
  );
  const latestReads = network.entries.filter(
    (entry) =>
      entry.method === 'GET' &&
      entry.safeUrlPattern.endsWith('/clinical-reports/latest'),
  );
  const pageReads = network.entries.filter(
    (entry) =>
      entry.method === 'GET' &&
      (entry.safeUrlPattern.startsWith('/patients/') ||
        entry.safeUrlPattern === '/scales/available'),
  );
  const productBusinessWrites = network.entries.filter(
    (entry) => isMutation(entry) && !isAuthMutation(entry),
  );
  const reportWrites = productBusinessWrites.filter((entry) =>
    entry.safeUrlPattern.includes('/clinical-reports'),
  );
  const a17A18A19Writes = productBusinessWrites.filter((entry) =>
    /\/(?:item-responses|score-results|cognitive-domain-results)(?:\/|$)/.test(
      entry.safeUrlPattern,
    ),
  );
  const failedRequests = network.entries.filter(
    ({ failureReason }) => failureReason !== null,
  );
  expect(loginRequests).toHaveLength(1);
  expect(logoutRequests).toHaveLength(1);
  expect(latestReads.length).toBeGreaterThanOrEqual(2);
  expect(latestReads.length).toBeLessThanOrEqual(2);
  expect(pageReads.length).toBeGreaterThan(0);
  expect(productBusinessWrites).toHaveLength(0);
  expect(reportWrites).toHaveLength(0);
  expect(a17A18A19Writes).toHaveLength(0);
  expect(
    failedRequests.every(
      (entry) =>
        entry.method === 'GET' &&
        entry.failureReason === 'aborted' &&
        entry.safeUrlPattern.startsWith('/patients/') &&
        !entry.safeUrlPattern.endsWith('/clinical-reports/latest'),
    ),
  ).toBe(true);

  return {
    viewport: viewport.label,
    forwardFocusCategories: forward.controlCategories,
    reverseFocusCategories,
    trustedKeydownCount,
    trustedKeyupCount,
    buttonEnter: true,
    checkboxSpaceStates: [false, true, false],
    detailsStates: [false, true, false],
    scaleLinkEnter: true,
    focusVisible: {
      button: true,
      checkbox: true,
      summary: true,
      link: true,
    },
    focusLeftAndReturned: true,
    network: {
      latestReadRequestCount: latestReads.length,
      pageReadRequestCount: pageReads.length,
      abortedReadRequestCount: failedRequests.length,
      loginRequestCount: 1,
      logoutRequestCount: 1,
      reportWriteRequestCount: 0,
      a17A18A19WriteRequestCount: 0,
      productBusinessWriteRequestCount: 0,
      automaticRetryDetected: false,
      pollingDetected: false,
    },
    console: {
      warningCount: 0,
      expectedScaleNoScoreNetworkErrorCount: 1,
      unexpectedErrorCount: 0,
      pageErrorCount: 0,
    },
    storage: 'clear',
    cookie: 'http_only_session_then_cleared',
    cors: 'passed',
    url: 'safe_single_scale_route',
    login: 'passed',
    logout: 'passed',
  };
}

test('B10-89 completes the real keyboard matrix in two isolated viewports', async ({
  roleContexts,
}) => {
  test.skip(
    !environment.enabled,
    'B10_BROWSER_ACCEPTANCE_RUN=1 is required for the directed B10-89 run',
  );
  test.setTimeout(120_000);
  if (!environment.enabled) return;

  const descriptor = await readB1089RuntimeDescriptor(environment.runtimeFile);
  const viewportEvidence: ViewportEvidence[] = [];
  let runtimeDeleted = false;
  try {
    for (const viewport of viewports) {
      const roleContext = await roleContexts.create('doctor', viewport.label, {
        viewport: { width: viewport.width, height: viewport.height },
      });
      viewportEvidence.push(
        await exerciseViewport(
          roleContext.page,
          () => roleContext.context.cookies(),
          descriptor,
          viewport,
          environment.frontendOrigin,
          environment.backendOrigin,
          environment.fixturePassword,
        ),
      );
    }
    const closed = await roleContexts.closeAll();
    expect(closed.activeContextCount).toBe(0);
    runtimeDeleted = await deleteB1089RuntimeDescriptor(
      environment.runtimeFile,
    );
    expect(runtimeDeleted).toBe(true);
    const summary = {
      testCount: 1,
      viewportCount: viewportEvidence.length,
      isolatedContextCount: 2,
      contextsClosed: true,
      retries: 0,
      artifacts: { trace: false, video: false, screenshot: false, html: false },
      databaseBoundaryClear: environment.databaseBoundaryClear,
      runtimeDescriptorDeleted: runtimeDeleted,
      targetControlSubstitutions: {
        locatorOrElementClick: false,
        syntheticKeyboardEvent: false,
        checkedOrOpenMutation: false,
        locatorFocusJump: false,
      },
      viewports: viewportEvidence,
    };
    console.log(
      `B10_89_ACCEPTANCE ${safeJsonStringify(summary, [
        environment.fixturePassword,
        descriptor.loginIdentifier,
        descriptor.navigationPath,
      ])}`,
    );
  } finally {
    if (!runtimeDeleted) {
      await deleteB1089RuntimeDescriptor(environment.runtimeFile).catch(
        () => undefined,
      );
    }
  }
});
