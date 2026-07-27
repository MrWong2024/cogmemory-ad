import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { runAccessibilityAudit } from '../support/accessibility-audit';
import {
  assertAriaNode,
  assertAriaSnapshot,
  observePoliteLiveRegionUpdate,
} from '../support/aria-live-audit';
import { assertDatabaseBoundaryIsClear } from '../support/acceptance-env';
import { BeforeUnloadEvidence } from '../support/beforeunload-evidence';
import {
  assertFocusLeavesRegion,
  assertFocusVisible,
  clearKeyboardEvidence,
  installKeyboardEvidence,
  isFocusWithin,
  pressAndObserveBooleanStateChange,
  pressKeyboard,
  readKeyboardEvidence,
} from '../support/keyboard-evidence';
import {
  ControlledRequestGate,
  OneShotRequestAbort,
} from '../support/network-control';
import { NetworkLedger } from '../support/network-ledger';
import { ConsoleAudit, auditRuntimeStorage } from '../support/runtime-audit';
import { assertSafeSummary, safeJsonStringify } from '../support/safe-output';
import { expect, test } from '../support/acceptance-test';
import {
  FORMAL_ACCEPTANCE_VIEWPORTS,
  assertNoGlobalHorizontalOverflow,
  auditLocalScrollContainer,
  auditViewport,
} from '../support/viewport-audit';

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
};

const evidence = {
  chromiumLaunchClose: false,
  trustedKeyboardEventCount: 0,
  contextIsolation: false,
  oneShotAbort: false,
  controlledRequestResume: false,
  networkSafeSummary: false,
  formalViewportCount: 0,
  localScrollDetected: false,
  axeCompliantViolationCount: -1,
  axeIntentionalViolationCount: -1,
  ariaSnapshotMatched: false,
  liveRegionObserved: false,
  beforeUnloadDialogCount: 0,
  runtimeSafeSummary: false,
};

let origin = '';
let server: ReturnType<typeof createServer>;

function pageDocument(body: string, title = 'Acceptance fixture'): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      * { box-sizing: border-box; }
      :focus-visible { outline: 3px solid #000; outline-offset: 2px; }
      body { margin: 0; color: #111; background: #fff; }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

function respond(
  response: ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string> = HTML_HEADERS,
): void {
  response.writeHead(status, headers);
  response.end(body);
}

function handleRequest(request: IncomingMessage, response: ServerResponse): void {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

  if (requestUrl.pathname === '/keyboard') {
    respond(
      response,
      200,
      pageDocument(`
        <main>
          <h1>Keyboard boundary</h1>
          <button id="before" type="button">Before region</button>
          <section id="control-region" aria-label="Control region">
            <button id="action-button" type="button">Run action</button>
            <a id="action-link" href="#activated">Open target</a>
            <label><input id="native-checkbox" type="checkbox"> Native option</label>
            <details id="native-details"><summary>More information</summary><p>Visible detail.</p></details>
          </section>
          <button id="after" type="button">After region</button>
        </main>
        <script>
          document.querySelector('#action-button').addEventListener('click', (event) => {
            event.currentTarget.dataset.activated = 'true';
          });
        </script>
      `),
    );
    return;
  }

  if (requestUrl.pathname === '/viewport') {
    respond(
      response,
      200,
      pageDocument(`
        <main style="width:100%;max-width:100%;padding:16px;overflow:visible">
          <h1>Viewport boundary</h1>
          <div id="local-scroll" style="width:100%;overflow-x:auto">
            <div style="width:1000px;height:40px">Locally scrollable content</div>
          </div>
        </main>
      `),
    );
    return;
  }

  if (requestUrl.pathname === '/axe') {
    respond(
      response,
      200,
      pageDocument(`
        <main>
          <section id="compliant" aria-labelledby="compliant-heading">
            <h1 id="compliant-heading">Accessible boundary</h1>
            <button type="button">Continue</button>
          </section>
          <section id="violation" aria-label="Intentional scanner fixture">
            <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
          </section>
        </main>
      `),
    );
    return;
  }

  if (requestUrl.pathname === '/aria') {
    respond(
      response,
      200,
      pageDocument(`
        <main id="aria-tree">
          <h1>ARIA boundary</h1>
          <button id="live-trigger" type="button" aria-label="Update status">Update</button>
          <div id="live-region" role="status" aria-live="polite" aria-busy="false">Waiting</div>
        </main>
        <script>
          document.querySelector('#live-trigger').addEventListener('click', () => {
            const region = document.querySelector('#live-region');
            region.setAttribute('aria-busy', 'true');
            setTimeout(() => {
              region.textContent = 'Updated';
              region.setAttribute('aria-busy', 'false');
            }, 20);
          });
        </script>
      `),
    );
    return;
  }

  if (requestUrl.pathname === '/beforeunload') {
    respond(
      response,
      200,
      pageDocument(`
        <main><h1>Unload boundary</h1><button type="button">Enable interaction</button></main>
        <script>
          window.addEventListener('beforeunload', (event) => {
            event.preventDefault();
            event.returnValue = '';
          });
        </script>
      `),
    );
    return;
  }

  if (requestUrl.pathname === '/api/items/507f1f77bcf86cd799439011') {
    request.resume();
    request.on('end', () => respond(response, 204, '', { 'cache-control': 'no-store' }));
    return;
  }

  if (requestUrl.pathname === '/api/abort') {
    respond(response, 204, '', { 'cache-control': 'no-store' });
    return;
  }

  respond(
    response,
    200,
    pageDocument('<main><h1>Infrastructure boundary</h1></main>'),
  );
}

test.beforeAll(async () => {
  assertDatabaseBoundaryIsClear();
  server = createServer(handleRequest);
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 1_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections();
  });
  console.log(`BROWSER_ACCEPTANCE_INFRA ${safeJsonStringify(evidence)}`);
});

test('launches and closes an explicit Chromium instance', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(origin);
    await expect(page.getByRole('heading')).toHaveText('Infrastructure boundary');
  } finally {
    await browser.close();
  }
  evidence.chromiumLaunchClose = true;
});

test('uses trusted keyboard events for natural focus and native activation', async ({
  page,
}) => {
  await installKeyboardEvidence(page);
  await page.goto(`${origin}/keyboard`);
  const before = page.locator('#before');
  const region = page.locator('#control-region');
  const button = page.locator('#action-button');
  const link = page.locator('#action-link');
  const checkbox = page.locator('#native-checkbox');
  const details = page.locator('#native-details');

  await before.focus();
  await clearKeyboardEvidence(page);
  await pressKeyboard(page, 'Tab');
  await expect(button).toBeFocused();
  await assertFocusVisible(button);
  expect(await isFocusWithin(region)).toBe(true);

  await pressKeyboard(page, 'Shift+Tab');
  await expect(before).toBeFocused();
  await pressKeyboard(page, 'Tab');
  await pressKeyboard(page, 'Enter');
  await expect(button).toHaveAttribute('data-activated', 'true');

  await pressKeyboard(page, 'Tab');
  await expect(link).toBeFocused();
  await pressKeyboard(page, 'Enter');
  await expect(page).toHaveURL(/#activated$/);

  await pressKeyboard(page, 'Tab');
  await expect(checkbox).toBeFocused();
  const checkboxChange = await pressAndObserveBooleanStateChange(
    page,
    'Space',
    () => checkbox.isChecked(),
  );
  expect(checkboxChange.changed).toBe(true);
  expect(checkboxChange.after).toBe(true);

  await pressKeyboard(page, 'Tab');
  await expect(details.locator('summary')).toBeFocused();
  const detailsChange = await pressAndObserveBooleanStateChange(
    page,
    'Enter',
    () => details.getAttribute('open').then((value) => value !== null),
  );
  expect(detailsChange.changed).toBe(true);
  expect(detailsChange.after).toBe(true);
  expect(await assertFocusLeavesRegion(page, region, 2)).toBe(1);
  await expect(page.locator('#after')).toBeFocused();

  const keyboardEvents = await readKeyboardEvidence(page);
  const trustedEvents = keyboardEvents.filter(({ isTrusted }) => isTrusted);
  expect(trustedEvents.length).toBe(keyboardEvents.length);
  expect(trustedEvents.some(({ key }) => key === 'Enter')).toBe(true);
  expect(trustedEvents.some(({ key }) => key === ' ')).toBe(true);
  evidence.trustedKeyboardEventCount = trustedEvents.length;
});

test('isolates cookies, storage, pages, and permissions by BrowserContext', async ({
  roleContexts,
}) => {
  const doctor = await roleContexts.create('doctor');
  const nurse = await roleContexts.create('nurse');
  await Promise.all([doctor.page.goto(origin), nurse.page.goto(origin)]);

  await doctor.page.evaluate(() => {
    document.cookie = 'context_marker=doctor; SameSite=Lax';
    localStorage.setItem('context-marker', 'doctor');
    sessionStorage.setItem('context-marker', 'doctor');
  });
  await doctor.context.grantPermissions(['geolocation'], { origin });

  const nurseState = await nurse.page.evaluate(async () => ({
    cookieEmpty: document.cookie === '',
    localMissing: localStorage.getItem('context-marker') === null,
    sessionMissing: sessionStorage.getItem('context-marker') === null,
    geolocationPermission: (
      await navigator.permissions.query({ name: 'geolocation' })
    ).state,
  }));
  const doctorCookieNames = (await doctor.context.cookies()).map(({ name }) => name);
  const nurseCookieCount = (await nurse.context.cookies()).length;

  expect(doctorCookieNames).toEqual(['context_marker']);
  expect(nurseCookieCount).toBe(0);
  expect(nurseState.cookieEmpty).toBe(true);
  expect(nurseState.localMissing).toBe(true);
  expect(nurseState.sessionMissing).toBe(true);
  expect(nurseState.geolocationPermission).not.toBe('granted');
  expect(doctor.page).not.toBe(nurse.page);
  evidence.contextIsolation = true;
});

test('aborts one request exactly once without an automatic retry', async ({ page }) => {
  await page.goto(origin);
  const ledger = new NetworkLedger();
  await ledger.attach(page);
  const control = new OneShotRequestAbort(page, '/api/abort');
  await control.install();
  try {
    const request = page.evaluate(() =>
      fetch('/api/abort').then(
        () => true,
        () => false,
      ),
    );
    await control.waitForStarted();
    expect(await request).toBe(false);
    ledger.assertNoAutomaticRetry({
      method: 'GET',
      safeUrlPattern: '/api/abort',
    });
    expect(ledger.count({ method: 'GET', safeUrlPattern: '/api/abort' })).toBe(1);
    const manualSecondRequestSucceeded = await page.evaluate(() =>
      fetch('/api/abort').then(({ ok }) => ok),
    );
    expect(manualSecondRequestSucceeded).toBe(true);
    const controlSummary = control.summary();
    expect(controlSummary.abortedRequestCount).toBe(1);
    expect(controlSummary.matchedRequestCount).toBe(2);
    expect(controlSummary.continuedRequestCount).toBe(1);
    evidence.oneShotAbort = true;
  } finally {
    await control.dispose();
    await ledger.detach();
  }
});

test('holds a started request and resumes it explicitly', async ({ page }) => {
  await page.goto(origin);
  const gate = new ControlledRequestGate(page, '/api/gate');
  await gate.install();
  try {
    const request = page.evaluate(() =>
      fetch('/api/gate').then(({ ok }) => ok),
    );
    await gate.waitForStarted();
    expect(gate.summary()).toEqual({
      matchedRequestCount: 1,
      abortedRequestCount: 0,
      continuedRequestCount: 0,
    });
    gate.resume();
    expect(await request).toBe(true);
    expect(gate.summary().continuedRequestCount).toBe(1);
    evidence.controlledRequestResume = true;
  } finally {
    await gate.dispose();
  }
});

test('records only safe network patterns and write body keys', async ({ page }) => {
  const dynamicId = '507f1f77bcf86cd799439011';
  const bodyValue = 'PRIVATE_BODY_VALUE';
  const queryValue = 'PRIVATE_QUERY_VALUE';
  await page.goto(origin);
  const ledger = new NetworkLedger();
  await ledger.attach(page);
  try {
    await page.evaluate(
      async ({ id, secretBody, secretQuery }) => {
        await fetch(`/api/items/${id}?token=${secretQuery}#hidden`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            answer: secretBody,
            metadata: secretBody,
            password: secretBody,
          }),
        });
      },
      { id: dynamicId, secretBody: bodyValue, secretQuery: queryValue },
    );
    const summary = ledger.summary();
    expect(summary.requestCount).toBe(1);
    expect(summary.entries[0]?.safeUrlPattern).toBe('/api/items/<id>');
    expect(summary.entries[0]?.bodyKeys).toEqual(['<blocked-key>', 'answer']);
    assertSafeSummary(summary, [dynamicId, bodyValue, queryValue]);
    evidence.networkSafeSummary = true;
  } finally {
    await ledger.detach();
  }
});

test('audits all formal viewports and distinguishes local scrolling', async ({ page }) => {
  await page.goto(`${origin}/viewport`);
  for (const viewport of FORMAL_ACCEPTANCE_VIEWPORTS) {
    const summary = await auditViewport(page, viewport);
    expect(summary.viewport).toEqual({
      innerWidth: viewport.width,
      innerHeight: viewport.height,
    });
    assertNoGlobalHorizontalOverflow(summary);
  }
  await auditViewport(page, FORMAL_ACCEPTANCE_VIEWPORTS[0]);
  const localScroll = await auditLocalScrollContainer(
    page.locator('#local-scroll'),
  );
  expect(localScroll.hasHorizontalOverflow).toBe(true);
  evidence.formalViewportCount = FORMAL_ACCEPTANCE_VIEWPORTS.length;
  evidence.localScrollDetected = true;
});

test('returns zero Axe violations for the compliant example', async ({ page }) => {
  await page.goto(`${origin}/axe`);
  const summary = await runAccessibilityAudit(page, { include: ['#compliant'] });
  expect(summary.violationCount).toBe(0);
  evidence.axeCompliantViolationCount = summary.violationCount;
});

test('detects the intentional Axe violation', async ({ page }) => {
  await page.goto(`${origin}/axe`);
  const summary = await runAccessibilityAudit(page, { include: ['#violation'] });
  expect(summary.violationCount).toBeGreaterThan(0);
  expect(summary.violations.some(({ ruleId }) => ruleId === 'image-alt')).toBe(true);
  evidence.axeIntentionalViolationCount = summary.violationCount;
});

test('matches an ARIA snapshot and observes a polite live-region update', async ({
  page,
}) => {
  await page.goto(`${origin}/aria`);
  const tree = page.locator('#aria-tree');
  const trigger = page.locator('#live-trigger');
  const region = page.locator('#live-region');
  const nodeSummary = await assertAriaNode(trigger, {
    role: 'button',
    accessibleName: 'Update status',
  });
  expect(nodeSummary).toEqual({
    roleMatched: true,
    accessibleNameMatched: true,
  });
  const snapshot = await assertAriaSnapshot(
    tree,
    `- main:\n  - heading "ARIA boundary" [level=1]\n  - button "Update status"\n  - status: Waiting`,
  );
  const liveSummary = await observePoliteLiveRegionUpdate(
    region,
    async () => {
      await trigger.focus();
      await page.keyboard.press('Enter');
    },
    'Updated',
  );
  expect(snapshot.matched).toBe(true);
  expect(liveSummary.live).toBe('polite');
  expect(liveSummary.busyBefore).toBe('false');
  expect(liveSummary.busyAfter).toBe('false');
  expect(liveSummary.textUpdated).toBe(true);
  evidence.ariaSnapshotMatched = true;
  evidence.liveRegionObserved = true;
});

test('observes a real beforeunload dialog with an explicit automated disposition', async ({
  page,
}) => {
  await page.goto(`${origin}/beforeunload`);
  await page.keyboard.press('Tab');
  const observer = new BeforeUnloadEvidence(page, 'accept');
  observer.observe();
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => observer.summary().beforeUnloadDialogCount).toBe(1);
  const summary = observer.stop();
  expect(summary.otherDialogCount).toBe(0);
  expect(summary.automatedDisposition).toBe('accept');
  evidence.beforeUnloadDialogCount = summary.beforeUnloadDialogCount;
});

test('summarizes console, storage, cookie, URL, and runtime evidence without values', async ({
  page,
}) => {
  const storageValue = 'PRIVATE_STORAGE_VALUE';
  const cookieValue = 'PRIVATE_COOKIE_VALUE';
  const consoleValue = 'PRIVATE_CONSOLE_VALUE';
  await page.goto(origin);
  const consoleAudit = new ConsoleAudit(page);
  consoleAudit.start();
  await page.evaluate(
    async ({ stored, cookie, logged }) => {
      localStorage.setItem('safe-key', stored);
      sessionStorage.setItem('runtime-state', stored);
      document.cookie = `runtime_cookie=${cookie}; SameSite=Lax`;
      history.replaceState(null, '', '#token=runtime-marker');
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('acceptance-db', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('items');
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(new Error('Synthetic IndexedDB open failed'));
      });
      console.warn(logged);
      console.error(logged);
    },
    { stored: storageValue, cookie: cookieValue, logged: consoleValue },
  );

  const runtimeSummary = await auditRuntimeStorage(page);
  const consoleSummary = consoleAudit.stop();
  expect(consoleSummary.warningCount).toBe(1);
  expect(consoleSummary.errorCount).toBe(1);
  expect(runtimeSummary.localStorageKeys).toEqual(['safe-key']);
  expect(runtimeSummary.sessionStorageKeys).toEqual(['runtime-state']);
  expect(runtimeSummary.indexedDbNames).toEqual(['acceptance-db']);
  expect(runtimeSummary.forbiddenValueDetected).toBe(false);
  expect(runtimeSummary.documentCookieEmpty).toBe(false);
  expect(runtimeSummary.documentCookieForbiddenPatternDetected).toBe(true);
  expect(runtimeSummary.urlHasSensitiveQueryOrHash).toBe(true);
  assertSafeSummary(
    { consoleSummary, runtimeSummary },
    [storageValue, cookieValue, consoleValue, 'runtime-marker'],
  );
  evidence.runtimeSafeSummary = true;
});
