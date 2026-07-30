import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import {
  B12SafeConsoleDiagnosticListener,
  assertB12SafeConsoleNetworkCorrelation,
  assertReportNarrativeSectionsExcludeText,
  attemptB12BrowserLogout,
  correlateB12SafeConsoleNetworkEvents,
  inspectB12CoreWorkflowNavigationAuthEntries,
  partitionB12AuthLifecycleEntries,
  rethrowAfterB12SessionOpenFailureCleanup,
  resolveB12LogoutDisposition,
  resolveB12SessionOpenMode,
  setB12LoginBoundaryEntryIndex,
  setB12LogoutBoundaryEntryIndex,
  setB12WorkflowNavigationBoundaryEntryIndex,
  setB12WorkflowNavigationCompletedEntryIndex,
  toB12SafeNetworkDiagnosticEntries,
  type B12SafeConsoleDiagnosticEvent,
} from '../b12/b12-core-support';
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
import {
  NetworkLedger,
  type NetworkLedgerEntry,
} from '../support/network-ledger';
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
let scriptedLogoutRequestCount = 0;

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

function b12LifecycleEntry(
  overrides: Partial<NetworkLedgerEntry> = {},
): NetworkLedgerEntry {
  return {
    method: 'GET',
    status: 200,
    resourceType: 'fetch',
    initiator: 'script',
    initiatorSource: 'cdp',
    failureReason: null,
    safeUrlPattern: '/auth/me',
    ...overrides,
    bodyKeys: [...(overrides.bodyKeys ?? [])],
  };
}

function validB12AuthLifecycleEntries(): NetworkLedgerEntry[] {
  return [
    b12LifecycleEntry({
      resourceType: 'document',
      initiator: 'navigation',
      safeUrlPattern: '/login',
    }),
    b12LifecycleEntry({ status: 401 }),
    b12LifecycleEntry({
      resourceType: 'script',
      initiator: 'parser',
      safeUrlPattern: '/_next/static/chunks/login.js',
    }),
    b12LifecycleEntry({
      method: 'POST',
      safeUrlPattern: '/auth/login',
      bodyKeys: ['accountName', '<blocked-key>'],
    }),
    b12LifecycleEntry(),
    b12LifecycleEntry({
      safeUrlPattern:
        '/patients/<id>/visits/<id>/clinical-reports/latest',
    }),
    b12LifecycleEntry({
      method: 'POST',
      status: 204,
      safeUrlPattern: '/auth/logout',
    }),
    b12LifecycleEntry({
      resourceType: 'document',
      initiator: 'navigation',
      safeUrlPattern: '/login',
    }),
    b12LifecycleEntry({ status: 401 }),
    b12LifecycleEntry({
      resourceType: 'script',
      initiator: 'parser',
      safeUrlPattern: '/_next/static/chunks/login.js',
    }),
  ];
}

function captureB12Diagnostic(
  action: () => void,
  category: string,
): unknown {
  let captured: unknown;
  try {
    action();
  } catch (error: unknown) {
    captured = error;
  }
  if (!(captured instanceof Error)) {
    throw new Error('Synthetic B12 diagnostic action did not throw');
  }
  expect(captured.message.startsWith(`${category} `)).toBe(true);
  return JSON.parse(captured.message.slice(category.length + 1)) as unknown;
}

function b12IncompleteNetworkEntries(): NetworkLedgerEntry[] {
  return [
    b12LifecycleEntry({ safeUrlPattern: '/auth/me' }),
    b12LifecycleEntry({ safeUrlPattern: '/dashboard' }),
    b12LifecycleEntry({
      status: 409,
      safeUrlPattern:
        '/patients/<id>/visits/<id>/clinical-reports/latest',
    }),
  ];
}

function b12ConsoleEvent(
  overrides: Partial<B12SafeConsoleDiagnosticEvent> = {},
): B12SafeConsoleDiagnosticEvent {
  return {
    sequence: 1,
    level: 'error',
    category: 'network',
    safeLocationPattern:
      '/patients/<id>/visits/<id>/clinical-reports/latest',
    locationPresent: true,
    ...overrides,
  };
}

function handleRequest(request: IncomingMessage, response: ServerResponse): void {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

  if (requestUrl.pathname === '/logout-fixture') {
    respond(
      response,
      200,
      pageDocument('<main><h1>Forbidden boundary</h1></main>'),
      {
        ...HTML_HEADERS,
        'set-cookie': 'b12_session=synthetic; HttpOnly; SameSite=Lax; Path=/',
      },
    );
    return;
  }

  if (requestUrl.pathname === '/auth/logout' && request.method === 'POST') {
    scriptedLogoutRequestCount += 1;
    respond(response, 200, JSON.stringify({ ok: true, authenticated: false }), {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'set-cookie':
        'b12_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    });
    return;
  }

  if (requestUrl.pathname === '/auth/me') {
    respond(response, 401, JSON.stringify({ message: 'unauthenticated' }), {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    });
    return;
  }

  if (requestUrl.pathname === '/login') {
    respond(
      response,
      200,
      pageDocument(`
        <main><h1>Login boundary</h1></main>
        <script>
          fetch('/auth/me', { credentials: 'include' });
        </script>
      `),
    );
    return;
  }

  if (requestUrl.pathname.startsWith('/narrative')) {
    const first =
      requestUrl.pathname === '/narrative-leak'
        ? 'Synthetic excluded marker'
        : 'System narrative';
    const sections =
      requestUrl.pathname === '/narrative-empty'
        ? ''
        : `<section aria-labelledby="clinical-report-narrative-heading">${first}</section>
           <section aria-labelledby="clinical-report-clinician-narrative-heading">Clinician narrative</section>`;
    respond(response, 200, pageDocument(`<main>${sections}</main>`));
    return;
  }

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

test('keeps B12 readable, forbidden, and incomplete-report open modes route-scoped', () => {
  const deniedRoleTarget = {
    scenarioKey: 'eligibility-state',
    routeKey: 'denied-role-entry',
  } as const;
  const confirmationMissingTarget = {
    scenarioKey: 'eligibility-state',
    routeKey: 'confirmation-missing',
  } as const;
  const ordinaryTarget = {
    scenarioKey: 'eligibility-state',
    routeKey: 'confirmed-doctor-entry',
  } as const;

  expect(resolveB12SessionOpenMode(deniedRoleTarget, 'nurse')).toBe('readable');
  expect(
    resolveB12SessionOpenMode(deniedRoleTarget, 'research_assistant'),
  ).toBe('readable');
  expect(resolveB12SessionOpenMode(deniedRoleTarget, 'system')).toBe(
    'forbidden',
  );
  expect(resolveB12SessionOpenMode(confirmationMissingTarget, 'doctor')).toBe(
    'clinical_report_incomplete',
  );
  expect(resolveB12SessionOpenMode(ordinaryTarget, 'doctor')).toBe('readable');
  expect(() =>
    resolveB12SessionOpenMode(ordinaryTarget, 'system'),
  ).toThrow('B12 system Session is allowed only for B12-08');
  expect(() =>
    resolveB12SessionOpenMode(confirmationMissingTarget, 'nurse'),
  ).toThrow('B12 incomplete-report open is allowed only for B12-14 doctor');
});

test('counts one successful B12 core workflow navigation auth probe only inside its boundaries', () => {
  const entries = validB12AuthLifecycleEntries();
  const inspection = inspectB12CoreWorkflowNavigationAuthEntries(
    entries,
    4,
    6,
  );

  expect(inspection.workflowNavigationEntries).toHaveLength(2);
  expect(inspection.workflowNavigationAuthMeEntries).toHaveLength(1);
  expect(inspection.workflowNavigationAuthMeRequestCount).toBe(1);
  expect(inspection.workflowNavigationAuthMeEntries[0]).toMatchObject({
    method: 'GET',
    status: 200,
    failureReason: null,
    initiator: 'script',
  });
  expect(entries.filter(({ status }) => status === 401)).toHaveLength(2);
});

test('counts two successful core navigation auth probes without treating B12-83 as passed', () => {
  const entries = validB12AuthLifecycleEntries();
  entries.splice(5, 0, b12LifecycleEntry());

  const inspection = inspectB12CoreWorkflowNavigationAuthEntries(
    entries,
    4,
    7,
  );

  expect(inspection.workflowNavigationAuthMeEntries).toHaveLength(2);
  expect(inspection.workflowNavigationAuthMeRequestCount).toBe(2);
});

test('rejects B12 core workflow navigation without an auth probe', () => {
  const entries = [
    b12LifecycleEntry({ safeUrlPattern: '/dashboard' }),
    b12LifecycleEntry({
      safeUrlPattern:
        '/patients/<id>/visits/<id>/clinical-reports/latest',
    }),
  ];

  expect(() =>
    inspectB12CoreWorkflowNavigationAuthEntries(entries, 0, entries.length),
  ).toThrow('B12_WORKFLOW_NAVIGATION_AUTH_PROBE_INVALID');
});

test('rejects invalid B12 core workflow navigation auth probe entries', () => {
  const invalidEntries: NetworkLedgerEntry[] = [
    {
      ...b12LifecycleEntry({ method: 'POST' }),
    },
    {
      ...b12LifecycleEntry({ status: 401 }),
    },
    {
      ...b12LifecycleEntry({
        status: null,
        failureReason: 'failed',
      }),
    },
    {
      ...b12LifecycleEntry({ failureReason: 'failed' }),
    },
    {
      ...b12LifecycleEntry({ initiator: 'other' }),
    },
  ];

  for (const entry of invalidEntries) {
    expect(() =>
      inspectB12CoreWorkflowNavigationAuthEntries([entry], 0, 1),
    ).toThrow('B12_WORKFLOW_NAVIGATION_AUTH_PROBE_INVALID');
  }
});

test('rejects a login transition inside B12 core workflow navigation', () => {
  const entries = [
    b12LifecycleEntry(),
    b12LifecycleEntry({ method: 'POST', safeUrlPattern: '/auth/login' }),
  ];

  expect(() =>
    inspectB12CoreWorkflowNavigationAuthEntries(entries, 0, entries.length),
  ).toThrow('B12 workflow navigation contained a login or logout transition');
});

test('rejects a logout transition inside B12 core workflow navigation', () => {
  const entries = [
    b12LifecycleEntry(),
    b12LifecycleEntry({ method: 'POST', safeUrlPattern: '/auth/logout' }),
  ];

  expect(() =>
    inspectB12CoreWorkflowNavigationAuthEntries(entries, 0, entries.length),
  ).toThrow('B12 workflow navigation contained a login or logout transition');
});

test('rejects unset, invalid, unordered, or out-of-range B12 workflow navigation boundaries', () => {
  const entries = [b12LifecycleEntry(), b12LifecycleEntry()];
  const invalidBoundaries: Array<{
    start: number | null | undefined;
    completed: number | null | undefined;
  }> = [
    { start: null, completed: 1 },
    { start: undefined, completed: 1 },
    { start: 0, completed: null },
    { start: 0, completed: undefined },
    { start: -1, completed: 1 },
    { start: 0, completed: -1 },
    { start: 0.5, completed: 1 },
    { start: 0, completed: 1.5 },
    { start: 1, completed: 1 },
    { start: 2, completed: 1 },
    { start: 0, completed: entries.length + 1 },
  ];

  for (const { start, completed } of invalidBoundaries) {
    expect(() =>
      inspectB12CoreWorkflowNavigationAuthEntries(
        entries,
        start,
        completed,
      ),
    ).toThrow();
  }
});

test('rejects repeated B12 workflow navigation boundary assignment', () => {
  const start = setB12WorkflowNavigationBoundaryEntryIndex(null, 4);
  expect(start).toBe(4);
  expect(() =>
    setB12WorkflowNavigationBoundaryEntryIndex(start, 4),
  ).toThrow('B12 workflow navigation boundary entry index is already set');

  const completed = setB12WorkflowNavigationCompletedEntryIndex(
    null,
    start,
    6,
  );
  expect(completed).toBe(6);
  expect(() =>
    setB12WorkflowNavigationCompletedEntryIndex(completed, start, 6),
  ).toThrow(
    'B12 workflow navigation completed entry index is already set',
  );
  expect(() =>
    setB12WorkflowNavigationCompletedEntryIndex(null, start, start),
  ).toThrow(
    'B12 workflow navigation completed boundary must be after the start boundary',
  );
});

test('does not mutate B12 workflow navigation entries or body keys', () => {
  const entries = [
    b12LifecycleEntry({ bodyKeys: ['original'] }),
    b12LifecycleEntry({ safeUrlPattern: '/dashboard' }),
  ];
  const before = entries.map((entry) => ({
    ...entry,
    bodyKeys: [...entry.bodyKeys],
  }));

  const inspection = inspectB12CoreWorkflowNavigationAuthEntries(
    entries,
    0,
    entries.length,
  );
  inspection.workflowNavigationEntries[0]?.bodyKeys.push('slice-copy-only');
  inspection.workflowNavigationAuthMeEntries[0]?.bodyKeys.push(
    'auth-copy-only',
  );

  expect(entries).toEqual(before);
});

test('partitions the valid B12 authentication lifecycle into five stages', () => {
  const partition = partitionB12AuthLifecycleEntries(
    validB12AuthLifecycleEntries(),
    3,
    6,
  );

  expect(partition.preAuthenticationEntries).toHaveLength(3);
  expect(partition.preLoginAuthMeEntries).toHaveLength(1);
  expect(partition.preLoginAuthMeEntries[0]?.status).toBe(401);
  expect(partition.loginAndAuthenticatedEntries).toHaveLength(3);
  expect(partition.loginEntries).toHaveLength(1);
  expect(partition.loginEntries[0]?.status).toBe(200);
  expect(partition.authenticatedEntries).toHaveLength(2);
  expect(partition.logoutAndPostLogoutEntries).toHaveLength(4);
  expect(partition.authenticatedAuthMeEntries).toHaveLength(1);
  expect(partition.authenticatedAuthMeEntries[0]?.status).toBe(200);
  expect(
    partition.authenticatedEntries.some(({ status }) => status === 401),
  ).toBe(false);
  expect(partition.logoutEntries).toHaveLength(1);
  expect(partition.logoutEntries[0]?.status).toBe(204);
  expect(partition.postLogoutAuthMeEntries).toHaveLength(1);
  expect(partition.postLogoutAuthMeEntries[0]?.status).toBe(401);
  expect(partition.postLogoutBusinessEntries).toHaveLength(0);
});

test('rejects missing or repeated pre-login B12 auth probes', () => {
  const missing = validB12AuthLifecycleEntries();
  missing[1] = b12LifecycleEntry({
    resourceType: 'script',
    initiator: 'parser',
    safeUrlPattern: '/_next/static/chunks/other.js',
  });
  expect(() => partitionB12AuthLifecycleEntries(missing, 3, 6)).toThrow(
    'B12 pre-authentication phase requires exactly one unauthenticated /auth/me',
  );

  const repeated = validB12AuthLifecycleEntries();
  repeated[2] = b12LifecycleEntry({ status: 401 });
  expect(() => partitionB12AuthLifecycleEntries(repeated, 3, 6)).toThrow(
    'B12 pre-authentication phase requires exactly one unauthenticated /auth/me',
  );
});

test('rejects invalid pre-login B12 auth probe statuses and failures', () => {
  for (const status of [200, 403, 409, 500]) {
    const entries = validB12AuthLifecycleEntries();
    entries[1] = b12LifecycleEntry({ status });
    expect(() => partitionB12AuthLifecycleEntries(entries, 3, 6)).toThrow(
      'B12 pre-authentication /auth/me response was not a clean 401',
    );
  }

  const failed = validB12AuthLifecycleEntries();
  failed[1] = b12LifecycleEntry({ status: null, failureReason: 'failed' });
  expect(() => partitionB12AuthLifecycleEntries(failed, 3, 6)).toThrow(
    'B12 pre-authentication /auth/me response was not a clean 401',
  );

  const protectedRequest = validB12AuthLifecycleEntries();
  protectedRequest[2] = b12LifecycleEntry({
    safeUrlPattern: '/patients/<id>',
  });
  expect(() =>
    partitionB12AuthLifecycleEntries(protectedRequest, 3, 6),
  ).toThrow('B12_PRE_AUTHENTICATION_UNEXPECTED_REQUEST');
});

test('rejects missing or repeated B12 login requests', () => {
  const missing = validB12AuthLifecycleEntries();
  missing[3] = b12LifecycleEntry({
    resourceType: 'script',
    initiator: 'parser',
    safeUrlPattern: '/_next/static/chunks/dashboard.js',
  });
  expect(() => partitionB12AuthLifecycleEntries(missing, 3, 6)).toThrow(
    'B12 login transition requires exactly one login request',
  );

  const repeated = validB12AuthLifecycleEntries();
  repeated[5] = b12LifecycleEntry({
    method: 'POST',
    safeUrlPattern: '/auth/login',
  });
  expect(() => partitionB12AuthLifecycleEntries(repeated, 3, 6)).toThrow(
    'B12 login transition requires exactly one login request',
  );
});

test('rejects failed, non-2xx, or non-script B12 login requests', () => {
  const non2xx = validB12AuthLifecycleEntries();
  non2xx[3] = b12LifecycleEntry({
    method: 'POST',
    status: 401,
    safeUrlPattern: '/auth/login',
  });
  expect(() => partitionB12AuthLifecycleEntries(non2xx, 3, 6)).toThrow(
    'B12 login request was not successful',
  );

  const failed = validB12AuthLifecycleEntries();
  failed[3] = b12LifecycleEntry({
    method: 'POST',
    status: null,
    failureReason: 'failed',
    safeUrlPattern: '/auth/login',
  });
  expect(() => partitionB12AuthLifecycleEntries(failed, 3, 6)).toThrow(
    'B12 login request was not successful',
  );

  const nonScript = validB12AuthLifecycleEntries();
  nonScript[3] = b12LifecycleEntry({
    method: 'POST',
    initiator: 'other',
    safeUrlPattern: '/auth/login',
  });
  expect(() => partitionB12AuthLifecycleEntries(nonScript, 3, 6)).toThrow(
    'B12 login request was not initiated by page script',
  );
});

test('rejects a B12 login request after the logout boundary', () => {
  const entries = validB12AuthLifecycleEntries();
  entries[3] = b12LifecycleEntry({
    resourceType: 'script',
    initiator: 'parser',
    safeUrlPattern: '/_next/static/chunks/dashboard.js',
  });
  entries[9] = b12LifecycleEntry({
    method: 'POST',
    safeUrlPattern: '/auth/login',
  });
  expect(() => partitionB12AuthLifecycleEntries(entries, 3, 6)).toThrow(
    'B12 login request occurred after the logout boundary',
  );
});

test('rejects an authenticated B12 auth probe before the login request', () => {
  const entries = validB12AuthLifecycleEntries();
  entries[3] = b12LifecycleEntry();
  entries[4] = b12LifecycleEntry({
    resourceType: 'script',
    initiator: 'parser',
    safeUrlPattern: '/_next/static/chunks/dashboard.js',
  });
  entries[5] = b12LifecycleEntry({
    method: 'POST',
    safeUrlPattern: '/auth/login',
  });
  expect(() => partitionB12AuthLifecycleEntries(entries, 3, 6)).toThrow(
    'B12 authenticated /auth/me preceded the login request',
  );
});

test('rejects missing or non-2xx authenticated B12 auth probes', () => {
  const missing = validB12AuthLifecycleEntries();
  missing[4] = b12LifecycleEntry({
    resourceType: 'script',
    initiator: 'parser',
    safeUrlPattern: '/_next/static/chunks/dashboard.js',
  });
  expect(() => partitionB12AuthLifecycleEntries(missing, 3, 6)).toThrow(
    'B12 authenticated phase omitted /auth/me',
  );

  const non2xx = validB12AuthLifecycleEntries();
  non2xx[4] = b12LifecycleEntry({ status: 401 });
  expect(() => partitionB12AuthLifecycleEntries(non2xx, 3, 6)).toThrow(
    'B12 authenticated /auth/me response was not successful',
  );
});

test('rejects invalid post-logout B12 auth probe statuses and failures', () => {
  for (const status of [200, 403, 409, 500]) {
    const entries = validB12AuthLifecycleEntries();
    entries[8] = b12LifecycleEntry({ status });
    expect(() => partitionB12AuthLifecycleEntries(entries, 3, 6)).toThrow(
      'B12 post-logout /auth/me response was not a clean 401',
    );
  }

  const failed = validB12AuthLifecycleEntries();
  failed[8] = b12LifecycleEntry({ status: null, failureReason: 'failed' });
  expect(() => partitionB12AuthLifecycleEntries(failed, 3, 6)).toThrow(
    'B12 post-logout /auth/me response was not a clean 401',
  );
});

test('rejects missing or repeated post-logout B12 auth probes', () => {
  const missing = validB12AuthLifecycleEntries();
  missing[8] = b12LifecycleEntry({
    resourceType: 'script',
    initiator: 'parser',
    safeUrlPattern: '/_next/static/chunks/other.js',
  });

  expect(() => partitionB12AuthLifecycleEntries(missing, 3, 6)).toThrow(
    'B12 post-logout phase requires exactly one unauthenticated /auth/me',
  );

  const repeated = validB12AuthLifecycleEntries();
  repeated[9] = b12LifecycleEntry({ status: 401 });
  expect(() => partitionB12AuthLifecycleEntries(repeated, 3, 6)).toThrow(
    'B12 post-logout phase requires exactly one unauthenticated /auth/me',
  );
});

test('rejects Patient and ClinicalReport requests after B12 logout', () => {
  for (const safeUrlPattern of [
    '/patients/<id>',
    '/patients/<id>/visits/<id>/clinical-reports/latest',
  ]) {
    const entries = validB12AuthLifecycleEntries();
    entries[9] = b12LifecycleEntry({ safeUrlPattern });

    expect(() => partitionB12AuthLifecycleEntries(entries, 3, 6)).toThrow(
      'B12 protected business request occurred after logout',
    );
  }
});

test('rejects missing, repeated, failed, or non-script B12 logout requests', () => {
  const missing = validB12AuthLifecycleEntries();
  missing[6] = b12LifecycleEntry({
    resourceType: 'document',
    initiator: 'navigation',
    safeUrlPattern: '/login',
  });
  expect(() => partitionB12AuthLifecycleEntries(missing, 3, 6)).toThrow(
    'B12 logout transition requires exactly one logout request',
  );

  const repeated = validB12AuthLifecycleEntries();
  repeated[9] = b12LifecycleEntry({
    method: 'POST',
    status: 204,
    safeUrlPattern: '/auth/logout',
  });
  expect(() => partitionB12AuthLifecycleEntries(repeated, 3, 6)).toThrow(
    'B12 logout transition requires exactly one logout request',
  );

  const failed = validB12AuthLifecycleEntries();
  failed[6] = b12LifecycleEntry({
    method: 'POST',
    status: 500,
    safeUrlPattern: '/auth/logout',
  });
  expect(() => partitionB12AuthLifecycleEntries(failed, 3, 6)).toThrow(
    'B12 logout request was not successful',
  );

  const nonScript = validB12AuthLifecycleEntries();
  nonScript[6] = b12LifecycleEntry({
    method: 'POST',
    status: 204,
    initiator: 'other',
    safeUrlPattern: '/auth/logout',
  });
  expect(() => partitionB12AuthLifecycleEntries(nonScript, 3, 6)).toThrow(
    'B12 logout request was not initiated by page script',
  );

  const beforeBoundary = validB12AuthLifecycleEntries();
  beforeBoundary[5] = b12LifecycleEntry({
    method: 'POST',
    status: 204,
    safeUrlPattern: '/auth/logout',
  });
  expect(() => partitionB12AuthLifecycleEntries(beforeBoundary, 3, 6)).toThrow(
    'B12 logout request occurred before the logout boundary',
  );
});

test('rejects invalid, unordered, or repeated B12 boundary assignment', () => {
  const entries = validB12AuthLifecycleEntries();
  expect(() => partitionB12AuthLifecycleEntries(entries, -1, 6)).toThrow(
    'B12 login boundary entry index is out of range',
  );
  expect(() => partitionB12AuthLifecycleEntries(entries, 3.5, 6)).toThrow(
    'B12 login boundary entry index is out of range',
  );
  expect(() => partitionB12AuthLifecycleEntries(entries, 3, -1)).toThrow(
    'B12 logout boundary entry index is out of range',
  );
  expect(() =>
    partitionB12AuthLifecycleEntries(entries, 3, entries.length + 1),
  ).toThrow('B12 logout boundary entry index is out of range');
  expect(() => partitionB12AuthLifecycleEntries(entries, 6, 6)).toThrow(
    'B12 login boundary must precede the logout boundary',
  );

  const loginBoundary = setB12LoginBoundaryEntryIndex(null, 3);
  expect(loginBoundary).toBe(3);
  expect(() => setB12LoginBoundaryEntryIndex(loginBoundary, 3)).toThrow(
    'B12 login boundary entry index is already set',
  );
  const logoutBoundary = setB12LogoutBoundaryEntryIndex(
    null,
    loginBoundary,
    6,
  );
  expect(logoutBoundary).toBe(6);
  expect(() =>
    setB12LogoutBoundaryEntryIndex(logoutBoundary, loginBoundary, 6),
  ).toThrow(
    'B12 logout boundary entry index is already set',
  );
  expect(() =>
    setB12LogoutBoundaryEntryIndex(null, loginBoundary, loginBoundary),
  ).toThrow('B12 logout boundary must be after the login boundary');
});

test('does not mutate B12 authentication lifecycle input entries', () => {
  const entries = validB12AuthLifecycleEntries();
  const before = entries.map((entry) => ({
    ...entry,
    bodyKeys: [...entry.bodyKeys],
  }));

  const partition = partitionB12AuthLifecycleEntries(entries, 3, 6);
  partition.preAuthenticationEntries[0]?.bodyKeys.push('pre-copy-only');
  partition.loginAndAuthenticatedEntries[0]?.bodyKeys.push('login-copy-only');
  partition.authenticatedEntries[0]?.bodyKeys.push('returned-copy-only');

  expect(entries).toEqual(before);
});

test('keeps the existing B12 pre-authentication public allowlist unchanged', () => {
  const partition = partitionB12AuthLifecycleEntries(
    validB12AuthLifecycleEntries(),
    3,
    6,
  );

  expect(partition.preAuthenticationEntries).toMatchObject([
    { method: 'GET', safeUrlPattern: '/login' },
    { method: 'GET', safeUrlPattern: '/auth/me', status: 401 },
    { method: 'GET', safeUrlPattern: '/_next/static/chunks/login.js' },
  ]);
});

test('reports one unexpected pre-authentication request with ordered safe facts', () => {
  const entries = validB12AuthLifecycleEntries();
  entries[2] = b12LifecycleEntry({
    status: 403,
    safeUrlPattern:
      'http://127.0.0.1/patients/507f1f77bcf86cd799439011?token=blocked#fragment',
  });

  const payload = captureB12Diagnostic(
    () => partitionB12AuthLifecycleEntries(entries, 3, 6),
    'B12_PRE_AUTHENTICATION_UNEXPECTED_REQUEST',
  );
  expect(payload).toMatchObject({
    totalCount: 1,
    truncated: false,
    entries: [
      {
        relativeIndex: 2,
        method: 'GET',
        safeEndpointPattern: '/patients/<id>',
        status: 403,
        resourceType: 'fetch',
        initiator: 'script',
        failureReason: null,
      },
    ],
  });
});

test('preserves every unexpected pre-authentication request in relative order', () => {
  const entries = validB12AuthLifecycleEntries();
  entries.splice(
    2,
    0,
    b12LifecycleEntry({ status: 403, safeUrlPattern: '/patients/<id>' }),
    b12LifecycleEntry({ status: 404, safeUrlPattern: '/patients/<id>' }),
  );

  const payload = captureB12Diagnostic(
    () => partitionB12AuthLifecycleEntries(entries, 5, 8),
    'B12_PRE_AUTHENTICATION_UNEXPECTED_REQUEST',
  );
  expect(payload).toMatchObject({
    totalCount: 2,
    truncated: false,
    entries: [
      { relativeIndex: 2, safeEndpointPattern: '/patients/<id>', status: 403 },
      { relativeIndex: 3, safeEndpointPattern: '/patients/<id>', status: 404 },
    ],
  });
});

test('does not mutate network entries or expose body keys in safe diagnostics', () => {
  const entries = [
    b12LifecycleEntry({
      method: 'POST',
      status: 403,
      safeUrlPattern: '/patients/<id>',
      bodyKeys: ['accountName', '<blocked-key>'],
    }),
  ];
  const before = entries.map((entry) => ({
    ...entry,
    bodyKeys: [...entry.bodyKeys],
  }));

  const diagnostic = toB12SafeNetworkDiagnosticEntries(entries);
  expect(diagnostic.entries[0]).not.toHaveProperty('bodyKeys');
  diagnostic.entries[0]!.safeEndpointPattern = '/copy-only';
  expect(entries).toEqual(before);
});

test('sanitizes and truncates B12 network diagnostics at the fixed limit', () => {
  const rawId = '507f1f77bcf86cd799439011';
  const rawUrl = `http://127.0.0.1/patients/${rawId}?token=blocked#fragment`;
  const entries = Array.from({ length: 22 }, () =>
    b12LifecycleEntry({ safeUrlPattern: rawUrl, bodyKeys: ['secretBodyKey'] }),
  );

  const diagnostic = toB12SafeNetworkDiagnosticEntries(entries);
  expect(diagnostic).toMatchObject({ totalCount: 22, truncated: true });
  expect(diagnostic.entries).toHaveLength(20);
  expect(
    diagnostic.entries.every(
      ({ safeEndpointPattern }) => safeEndpointPattern === '/patients/<id>',
    ),
  ).toBe(true);
  expect(() =>
    safeJsonStringify(diagnostic, [rawId, rawUrl, 'secretBodyKey']),
  ).not.toThrow();
});

test('keeps successful system navigation auth probes strict beside a protected 403', () => {
  const entries = [
    b12LifecycleEntry(),
    b12LifecycleEntry({
      status: 403,
      safeUrlPattern:
        '/patients/<id>/visits/<id>/clinical-reports/latest',
    }),
  ];

  const inspection = inspectB12CoreWorkflowNavigationAuthEntries(
    entries,
    0,
    entries.length,
  );
  expect(inspection.workflowNavigationAuthMeRequestCount).toBe(1);
  expect(inspection.workflowNavigationEntries[1]).toMatchObject({
    status: 403,
    safeUrlPattern:
      '/patients/<id>/visits/<id>/clinical-reports/latest',
  });
});

test('reports a 401 auth probe before its protected 403 with both boundaries', () => {
  const entries = [
    b12LifecycleEntry({ safeUrlPattern: '/dashboard' }),
    b12LifecycleEntry({ status: 401 }),
    b12LifecycleEntry({
      status: 403,
      safeUrlPattern:
        '/patients/<id>/visits/<id>/clinical-reports/latest',
    }),
  ];

  const payload = captureB12Diagnostic(
    () => inspectB12CoreWorkflowNavigationAuthEntries(entries, 1, 3),
    'B12_WORKFLOW_NAVIGATION_AUTH_PROBE_INVALID',
  );
  expect(payload).toMatchObject({
    workflowStartBoundary: 1,
    workflowCompletedBoundary: 3,
    navigationEntryCount: 2,
    authMe: {
      entries: [
        {
          relativeIndex: 0,
          status: 401,
          method: 'GET',
          initiator: 'script',
          failureReason: null,
        },
      ],
    },
    protectedPatientVisitClinicalReportGets: {
      entries: [
        {
          relativeIndex: 1,
          safeEndpointPattern:
            '/patients/<id>/visits/<id>/clinical-reports/latest',
          status: 403,
        },
      ],
    },
    authMeToProtected403Order: {
      entries: [
        {
          authMeRelativeIndex: 0,
          protected403RelativeIndex: 1,
          order: 'auth_me_before_protected_403',
        },
      ],
    },
  });
});

test('reports 403, request failure, and non-script workflow auth probes safely', () => {
  const invalidEntries = [
    b12LifecycleEntry({ status: 403 }),
    b12LifecycleEntry({ status: null, failureReason: 'failed' }),
    b12LifecycleEntry({ initiator: 'other' }),
  ];

  for (const entry of invalidEntries) {
    const payload = captureB12Diagnostic(
      () => inspectB12CoreWorkflowNavigationAuthEntries([entry], 0, 1),
      'B12_WORKFLOW_NAVIGATION_AUTH_PROBE_INVALID',
    );
    expect(payload).toMatchObject({
      authMe: {
        entries: [
          {
            relativeIndex: 0,
            status: entry.status,
            initiator: entry.initiator,
            failureReason: entry.failureReason,
          },
        ],
      },
    });
  }
});

test('keeps workflow diagnostic boundaries and source entries immutable', () => {
  const entries = [
    b12LifecycleEntry({ safeUrlPattern: '/dashboard' }),
    b12LifecycleEntry({ status: 403, bodyKeys: ['original'] }),
    b12LifecycleEntry({ status: 403, safeUrlPattern: '/patients/<id>' }),
  ];
  const before = entries.map((entry) => ({
    ...entry,
    bodyKeys: [...entry.bodyKeys],
  }));

  const payload = captureB12Diagnostic(
    () => inspectB12CoreWorkflowNavigationAuthEntries(entries, 1, 3),
    'B12_WORKFLOW_NAVIGATION_AUTH_PROBE_INVALID',
  );
  expect(payload).toMatchObject({
    workflowStartBoundary: 1,
    workflowCompletedBoundary: 3,
  });
  expect(entries).toEqual(before);
});

test('correlates one exact Console location with the unique latest 409', () => {
  const inspection = correlateB12SafeConsoleNetworkEvents({
    networkEntries: b12IncompleteNetworkEntries(),
    consoleEvents: [b12ConsoleEvent()],
    failurePhaseConsoleSequences: [1],
  });

  expect(inspection).toMatchObject({
    unique409: {
      relativeIndex: 2,
      method: 'GET',
      safeEndpointPattern:
        '/patients/<id>/visits/<id>/clinical-reports/latest',
      status: 409,
    },
    correlations: [
      {
        consoleSequence: 1,
        matchedNetworkRelativeIndex: 2,
        correlation: 'exact_endpoint',
      },
    ],
    exactCount: 1,
    phaseOnlyCount: 0,
    unmatchedCount: 0,
  });
});

test('rejects one exact Console event plus one no-location phase event', () => {
  const payload = captureB12Diagnostic(
    () =>
      assertB12SafeConsoleNetworkCorrelation({
        networkEntries: b12IncompleteNetworkEntries(),
        consoleEvents: [
          b12ConsoleEvent(),
          b12ConsoleEvent({
            sequence: 2,
            safeLocationPattern: null,
            locationPresent: false,
          }),
        ],
        failurePhaseConsoleSequences: [1, 2],
        observedConsoleErrorCount: 2,
        allowedConsoleErrorCount: 1,
      }),
    'B12_CONSOLE_NETWORK_CORRELATION_INVALID',
  );
  expect(payload).toMatchObject({
    counts: { exact: 1, phaseOnly: 1, unmatched: 0 },
    correlations: [
      { correlation: 'exact_endpoint' },
      { correlation: 'same_failure_phase_without_exact_endpoint' },
    ],
  });
});

test('does not allow a frontend bundle Console location by phase proximity', () => {
  const payload = captureB12Diagnostic(
    () =>
      assertB12SafeConsoleNetworkCorrelation({
        networkEntries: b12IncompleteNetworkEntries(),
        consoleEvents: [
          b12ConsoleEvent(),
          b12ConsoleEvent({
            sequence: 2,
            safeLocationPattern: '/_next/static/chunks/app.js',
          }),
        ],
        failurePhaseConsoleSequences: [2],
        observedConsoleErrorCount: 2,
        allowedConsoleErrorCount: 1,
      }),
    'B12_CONSOLE_NETWORK_CORRELATION_INVALID',
  );
  expect(payload).toMatchObject({
    counts: { exact: 1, phaseOnly: 1, unmatched: 0 },
  });
});

test('rejects a Console error that has no endpoint or phase correlation', () => {
  const payload = captureB12Diagnostic(
    () =>
      assertB12SafeConsoleNetworkCorrelation({
        networkEntries: b12IncompleteNetworkEntries(),
        consoleEvents: [
          b12ConsoleEvent({
            safeLocationPattern: '/unrelated/runtime.js',
            category: 'runtime',
          }),
        ],
        failurePhaseConsoleSequences: [],
        observedConsoleErrorCount: 1,
        allowedConsoleErrorCount: 1,
      }),
    'B12_CONSOLE_NETWORK_CORRELATION_INVALID',
  );
  expect(payload).toMatchObject({
    counts: { exact: 0, phaseOnly: 0, unmatched: 1 },
    correlations: [
      { consoleCategory: 'runtime', correlation: 'unmatched' },
    ],
  });
});

test('does not retain Console raw text, complete URLs, or dynamic identifiers', async ({
  page,
}) => {
  const rawId = '507f1f77bcf86cd799439011';
  const rawText =
    `TypeError for http://127.0.0.1/patients/${rawId}?token=blocked`;
  const listener = new B12SafeConsoleDiagnosticListener(page);
  listener.start();
  await page.goto(origin);
  const observed = page.waitForEvent('console', {
    predicate: (message) => message.text() === rawText,
  });
  await page.evaluate((message) => console.error(message), rawText);
  await observed;
  const summary = listener.stop();

  expect(summary.events).toHaveLength(1);
  expect(() =>
    safeJsonStringify(summary.events, [rawText, rawId, origin]),
  ).not.toThrow();
});

test('stops the B12 Console listener idempotently and removes its handler', async ({
  page,
}) => {
  const listener = new B12SafeConsoleDiagnosticListener(page);
  listener.start();
  const firstObserved = page.waitForEvent('console', {
    predicate: (message) => message.text() === 'synthetic first network error',
  });
  await page.evaluate(() => console.error('synthetic first network error'));
  await firstObserved;
  const firstStop = listener.stop();
  const secondStop = listener.stop();
  expect(secondStop).toEqual(firstStop);

  const secondObserved = page.waitForEvent('console', {
    predicate: (message) => message.text() === 'synthetic second network error',
  });
  await page.evaluate(() => console.error('synthetic second network error'));
  await secondObserved;
  expect(listener.summary()).toEqual(firstStop);
});

test('summarizes UI logout success before rethrowing an open failure', async () => {
  const originalError = new Error('synthetic original open failure');
  const lines: string[] = [];
  let contextClosed = false;
  await expect(
    rethrowAfterB12SessionOpenFailureCleanup({
      target: {
        scenarioKey: 'eligibility-state',
        routeKey: 'draft-no-entry',
      },
      role: 'doctor',
      openMode: 'readable',
      originalError,
      cleanupLogout: async () => ({
        result: 'succeeded',
        mechanism: 'ui_control',
      }),
      closeContext: async () => {
        contextClosed = true;
      },
      ledgerDetached: () => true,
      contextClosed: () => contextClosed,
      emit: (line) => lines.push(line),
    }),
  ).rejects.toBe(originalError);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain(
    '"logoutResult":"succeeded","logoutMechanism":"ui_control","ledgerDetached":true,"contextClosed":true',
  );
});

test('summarizes the denied system scripted fallback after an open failure', async () => {
  const originalError = new Error('synthetic system open failure');
  const lines: string[] = [];
  await expect(
    rethrowAfterB12SessionOpenFailureCleanup({
      target: {
        scenarioKey: 'eligibility-state',
        routeKey: 'denied-role-entry',
      },
      role: 'system',
      openMode: 'forbidden',
      originalError,
      cleanupLogout: async () => ({
        result: 'succeeded',
        mechanism: 'scripted_cleanup_fallback',
      }),
      closeContext: async () => undefined,
      ledgerDetached: () => true,
      contextClosed: () => true,
      emit: (line) => lines.push(line),
    }),
  ).rejects.toBe(originalError);
  expect(lines[0]).toContain('"role":"system","openMode":"forbidden"');
  expect(lines[0]).toContain(
    '"logoutResult":"succeeded","logoutMechanism":"scripted_cleanup_fallback"',
  );
});

test('summarizes a failed logout without expanding its internal error', async () => {
  const originalError = new Error('synthetic original assertion');
  const lines: string[] = [];
  await expect(
    rethrowAfterB12SessionOpenFailureCleanup({
      target: {
        scenarioKey: 'eligibility-state',
        routeKey: 'draft-no-entry',
      },
      role: 'doctor',
      openMode: 'readable',
      originalError,
      cleanupLogout: async () => {
        throw new Error('http://127.0.0.1/private?token=blocked');
      },
      closeContext: async () => undefined,
      ledgerDetached: () => true,
      contextClosed: () => true,
      emit: (line) => lines.push(line),
    }),
  ).rejects.toBe(originalError);
  expect(lines[0]).toContain(
    '"logoutResult":"failed","logoutMechanism":null',
  );
  expect(lines[0]).not.toContain('token=blocked');
});

test('records context closure failure after open-failure cleanup', async () => {
  const originalError = new Error('synthetic original assertion');
  const lines: string[] = [];
  await expect(
    rethrowAfterB12SessionOpenFailureCleanup({
      target: {
        scenarioKey: 'eligibility-state',
        routeKey: 'draft-no-entry',
      },
      role: 'doctor',
      openMode: 'readable',
      originalError,
      cleanupLogout: async () => ({
        result: 'failed',
        mechanism: 'ui_control',
      }),
      closeContext: async () => {
        throw new Error('synthetic close failure');
      },
      ledgerDetached: () => false,
      contextClosed: () => false,
      emit: (line) => lines.push(line),
    }),
  ).rejects.toBe(originalError);
  expect(lines[0]).toContain(
    '"ledgerDetached":false,"contextClosed":false',
  );
});

test('rethrows the original open error while emitting only fixed safe fields', async () => {
  const secret = 'synthetic-secret-not-for-output';
  const runtimePath = 'D:/private/runtime/descriptor.json';
  const originalError = new Error(
    `failed at ${runtimePath} with ${secret} and http://127.0.0.1/private`,
  );
  const lines: string[] = [];
  let captured: unknown;
  try {
    await rethrowAfterB12SessionOpenFailureCleanup({
      target: {
        scenarioKey: 'eligibility-state',
        routeKey: 'draft-no-entry',
      },
      role: 'doctor',
      openMode: 'readable',
      originalError,
      cleanupLogout: async () => ({
        result: 'not_authenticated',
        mechanism: null,
      }),
      closeContext: async () => undefined,
      ledgerDetached: () => true,
      contextClosed: () => true,
      forbiddenLiterals: [secret, runtimePath],
      emit: (line) => lines.push(line),
    });
  } catch (error: unknown) {
    captured = error;
  }
  expect(captured).toBe(originalError);
  expect(lines).toHaveLength(1);
  expect(lines[0]).not.toContain(secret);
  expect(lines[0]).not.toContain(runtimePath);
  expect(lines[0]).not.toContain('http://');
});

test('keeps B12 logout fallback restricted to the denied system Session', () => {
  const deniedRoleTarget = {
    scenarioKey: 'eligibility-state',
    routeKey: 'denied-role-entry',
  } as const;
  expect(
    resolveB12LogoutDisposition({
      target: deniedRoleTarget,
      role: 'doctor',
      openMode: 'readable',
      hasHttpOnlySessionCookie: true,
      hasVisibleUiLogout: true,
    }),
  ).toBe('ui_control');
  expect(
    resolveB12LogoutDisposition({
      target: deniedRoleTarget,
      role: 'system',
      openMode: 'forbidden',
      hasHttpOnlySessionCookie: true,
      hasVisibleUiLogout: false,
    }),
  ).toBe('scripted_cleanup_fallback');
  expect(
    resolveB12LogoutDisposition({
      target: deniedRoleTarget,
      role: 'doctor',
      openMode: 'readable',
      hasHttpOnlySessionCookie: true,
      hasVisibleUiLogout: false,
    }),
  ).toBe('unsupported');
  expect(
    resolveB12LogoutDisposition({
      target: {
        scenarioKey: 'eligibility-state',
        routeKey: 'confirmed-doctor-entry',
      },
      role: 'system',
      openMode: 'forbidden',
      hasHttpOnlySessionCookie: true,
      hasVisibleUiLogout: false,
    }),
  ).toBe('unsupported');
  expect(
    resolveB12LogoutDisposition({
      target: deniedRoleTarget,
      role: 'system',
      openMode: 'forbidden',
      hasHttpOnlySessionCookie: false,
      hasVisibleUiLogout: false,
    }),
  ).toBe('not_authenticated');
});

test('executes the denied system Session scripted logout through the page', async ({
  page,
}) => {
  scriptedLogoutRequestCount = 0;
  await page.goto(`${origin}/logout-fixture`);
  expect((await page.context().cookies()).some(({ httpOnly }) => httpOnly)).toBe(
    true,
  );
  const ledger = new NetworkLedger();
  await ledger.attach(page);
  let boundaryCount = 0;
  try {
    const attempt = await attemptB12BrowserLogout({
      page,
      target: {
        scenarioKey: 'eligibility-state',
        routeKey: 'denied-role-entry',
      },
      role: 'system',
      openMode: 'forbidden',
      backendOrigin: origin,
      frontendOrigin: origin,
      contextCookies: () => page.context().cookies(),
      recordBoundary: () => {
        boundaryCount += 1;
      },
    });
    expect({
      attempt,
      path: new URL(page.url()).pathname,
      httpOnlyCookieCount: (await page.context().cookies()).filter(
        ({ httpOnly }) => httpOnly,
      ).length,
      scriptedLogoutRequestCount,
    }).toEqual({
      attempt: {
        result: 'succeeded',
        mechanism: 'scripted_cleanup_fallback',
      },
      path: '/login',
      httpOnlyCookieCount: 0,
      scriptedLogoutRequestCount: 1,
    });
    expect(boundaryCount).toBe(1);
    expect(scriptedLogoutRequestCount).toBe(1);
    expect(page.url()).toBe(`${origin}/login`);
    expect(
      (await page.context().cookies()).some(({ httpOnly }) => httpOnly),
    ).toBe(false);

    const entries = ledger.entries();
    const logoutEntries = entries.filter(
      ({ method, safeUrlPattern }) =>
        method === 'POST' && safeUrlPattern === '/auth/logout',
    );
    expect(logoutEntries).toHaveLength(1);
    expect(logoutEntries[0]).toMatchObject({
      status: 200,
      initiator: 'script',
      failureReason: null,
    });
    const postLogoutAuthMeEntries = entries.filter(
      ({ method, safeUrlPattern }) =>
        method === 'GET' && safeUrlPattern === '/auth/me',
    );
    expect(postLogoutAuthMeEntries).toHaveLength(1);
    expect(postLogoutAuthMeEntries[0]).toMatchObject({
      status: 401,
      failureReason: null,
    });

    const secondAttempt = await attemptB12BrowserLogout({
      page,
      target: {
        scenarioKey: 'eligibility-state',
        routeKey: 'denied-role-entry',
      },
      role: 'system',
      openMode: 'forbidden',
      backendOrigin: origin,
      frontendOrigin: origin,
      contextCookies: () => page.context().cookies(),
      recordBoundary: () => {
        boundaryCount += 1;
      },
    });
    expect(secondAttempt).toEqual({
      result: 'not_authenticated',
      mechanism: null,
    });
    expect(boundaryCount).toBe(1);
    expect(scriptedLogoutRequestCount).toBe(1);
  } finally {
    await ledger.detach();
  }
});

test('checks every B12 narrative section and rejects leaks or empty matches', async ({
  page,
}) => {
  const excludedText = 'Synthetic excluded marker';
  await page.goto(`${origin}/narrative-clean`);
  expect(
    await assertReportNarrativeSectionsExcludeText(page, excludedText),
  ).toBe(2);

  await page.goto(`${origin}/narrative-leak`);
  await expect(
    assertReportNarrativeSectionsExcludeText(page, excludedText),
  ).rejects.toThrow();

  await page.goto(`${origin}/narrative-empty`);
  await expect(
    assertReportNarrativeSectionsExcludeText(page, excludedText),
  ).rejects.toThrow();
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
