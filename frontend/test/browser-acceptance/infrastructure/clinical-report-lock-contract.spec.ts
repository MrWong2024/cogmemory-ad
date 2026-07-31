import {
  existsSync,
  readFileSync,
  readdirSync,
  type Dirent,
} from 'node:fs';
import {
  dirname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { expect, test } from '@playwright/test';

import { lockClinicalReport } from '@/src/features/assessments/api/clinical-report-api';
import {
  buildLockClinicalReportRequest,
  createClinicalReportLockDraft,
} from '@/src/features/assessments/lib/clinical-report-workflow-draft';
import { isClinicalReportLocked } from '@/src/features/assessments/lib/clinical-report-display';
import type {
  ClinicalReport,
  LockClinicalReportRequest,
} from '@/src/features/assessments/types/clinical-report';
import {
  summarizeB12P1AuthBootstrap,
  summarizeB12P1BusinessPhase,
  summarizeB12P1FailureDiagnostics,
  summarizeB12P1LifecycleWrites,
  summarizeB12P1ScenarioLoad,
  summarizeB12P1StableEvidence,
} from '../b12/p1/p1-support';
import type {
  NetworkLedgerEntry,
  NetworkLedgerSummary,
} from '../support/network-ledger';
import type { ConsoleAuditSummary } from '../support/runtime-audit';

const PATIENT_ID = '507f1f77bcf86cd799439011';
const VISIT_ID = '507f1f77bcf86cd799439012';
const REPORT_ID = '507F1F77BCF86CD799439013';
const NORMALIZED_REPORT_ID = REPORT_ID.toLowerCase();
const REPORT_UPDATED_AT = '2026-07-31T01:02:03.000Z';
const TEST_LOCK_NOTE = 'TEST DE-IDENTIFIED clinical report lock note';
const originalFetch = globalThis.fetch;

const EMPTY_CONSOLE_SUMMARY: ConsoleAuditSummary = {
  warningCount: 0,
  errorCount: 0,
  pageErrorCount: 0,
  categories: [],
};

function ledgerEntry(
  input: Partial<NetworkLedgerEntry> &
    Pick<NetworkLedgerEntry, 'method' | 'safeUrlPattern'>,
): NetworkLedgerEntry {
  return {
    status: 200,
    resourceType: 'fetch',
    initiator: 'script',
    initiatorSource: 'playwright',
    failureReason: null,
    bodyKeys: [],
    ...input,
    method: input.method.toUpperCase(),
  };
}

function ledgerSummary(entries: NetworkLedgerEntry[]): NetworkLedgerSummary {
  return {
    requestCount: entries.length,
    failedRequestCount: entries.filter(
      ({ failureReason }) => failureReason !== null,
    ).length,
    entries,
  };
}

type RouteEntry = {
  kind: 'page' | 'route';
  route: string;
  segments: string[];
};

function createTestReport(): ClinicalReport {
  return {
    id: ` ${REPORT_ID} `,
    reportCode: 'TEST-CLINICAL-REPORT',
    reportType: 'cognitive_assessment',
    status: 'confirmed',
    reportVersion: 1,
    source: 'mixed',
    qualityStatus: 'passed',
    patientSnapshot: null,
    visitSnapshot: null,
    scaleTraces: [],
    scoreSnapshots: [],
    domainSnapshots: [],
    evidenceSnapshots: [],
    narrative: null,
    generation: null,
    editorial: null,
    submission: null,
    confirmation: null,
    lockedAt: null,
    lock: null,
    sourceFreeze: null,
    archivedAt: null,
    archive: null,
    correction: null,
    replacementOf: null,
    voidedAt: null,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: REPORT_UPDATED_AT,
    isFinal: true,
  };
}

function findAppRouterRoot(): string {
  const candidates = [resolve('src/app'), resolve('app')].filter((candidate) =>
    existsSync(candidate),
  );
  expect(candidates).toHaveLength(1);
  return candidates[0]!;
}

function enumerateRouteEntries(appRouterRoot: string): RouteEntry[] {
  const routeFiles = new Set(['page.tsx', 'page.ts', 'route.ts', 'route.tsx']);
  const entries: RouteEntry[] = [];

  function visit(directory: string): void {
    const children = readdirSync(directory, {
      withFileTypes: true,
    }) as Dirent[];
    for (const child of children) {
      const absolutePath = join(directory, child.name);
      if (child.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!child.isFile() || !routeFiles.has(child.name)) continue;

      const segments = relative(appRouterRoot, dirname(absolutePath))
        .split(sep)
        .filter(
          (segment) =>
            segment.length > 0 &&
            !(segment.startsWith('(') && segment.endsWith(')')),
        );
      entries.push({
        kind: child.name.startsWith('page.') ? 'page' : 'route',
        route: segments.length > 0 ? `/${segments.join('/')}` : '/',
        segments,
      });
    }
  }

  visit(appRouterRoot);
  return entries;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  expect(globalThis.fetch).toBe(originalFetch);
});

test('serializes only the clinical report lock request contract from the current report timestamp', async () => {
  const report = createTestReport();
  const draft = createClinicalReportLockDraft(report);
  expect(draft).not.toBeNull();
  if (!draft) throw new Error('Expected a valid TEST clinical report lock draft');

  expect(draft.reportId).toBe(NORMALIZED_REPORT_ID);
  expect(draft.baseUpdatedAt).toBe(report.updatedAt);

  draft.lockNote = `  ${TEST_LOCK_NOTE}  `;
  draft.confirmed = true;
  draft.stale = false;
  const request = buildLockClinicalReportRequest(draft);
  expect(request).toEqual({
    confirm: true,
    lockNote: TEST_LOCK_NOTE,
    expectedUpdatedAt: report.updatedAt,
  });

  const runtimeInput = Object.assign({}, request, {
    status: 'confirmed',
    lockedBy: 'TEST-DE-IDENTIFIED-OPERATOR',
    metadata: { source: 'TEST-DE-IDENTIFIED' },
    extraField: 'TEST-EXTRA-FIELD',
  }) as LockClinicalReportRequest & Record<string, unknown>;
  const capturedRequests: Array<{ url: string; init: RequestInit }> = [];

  try {
    globalThis.fetch = async (input, init) => {
      capturedRequests.push({
        url: String(input),
        init: init ?? {},
      });
      return new Response(
        JSON.stringify({
          report,
          lockReceipt: {
            lockId: 'TEST-LOCK-RECEIPT',
            lockedAt: '2026-07-31T01:02:04.000Z',
            lockedBy: {
              id: '507f1f77bcf86cd799439014',
              name: 'TEST DE-IDENTIFIED OPERATOR',
              role: 'doctor',
            },
            lockNote: TEST_LOCK_NOTE,
            alreadyLocked: false,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    };

    await lockClinicalReport(
      PATIENT_ID,
      VISIT_ID,
      draft.reportId,
      runtimeInput,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  expect(capturedRequests).toHaveLength(1);
  const captured = capturedRequests[0];
  if (!captured) {
    throw new Error('Expected the TEST fetch stub to capture one request');
  }

  const body = JSON.parse(String(captured.init.body)) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual([
    'confirm',
    'expectedUpdatedAt',
    'lockNote',
  ]);
  expect(body).toEqual({
    confirm: true,
    lockNote: TEST_LOCK_NOTE,
    expectedUpdatedAt: report.updatedAt,
  });
  expect(body).not.toHaveProperty('status');
  expect(body).not.toHaveProperty('lockedBy');
  expect(body).not.toHaveProperty('metadata');
  expect(body).not.toHaveProperty('extraField');
  expect(captured.init.method).toBe('POST');
  expect(new Headers(captured.init.headers).get('content-type')).toBe(
    'application/json',
  );
  expect(captured.init.credentials).toBe('include');
  expect(new URL(captured.url).pathname).toBe(
    `/patients/${PATIENT_ID}/visits/${VISIT_ID}/clinical-reports/${NORMALIZED_REPORT_ID}/lock`,
  );
});

test('keeps the lock workflow on the existing visit detail route without a dedicated route segment', () => {
  const appRouterRoot = findAppRouterRoot();
  const routes = enumerateRouteEntries(appRouterRoot);
  expect(
    routes.some(
      ({ kind, route }) =>
        kind === 'page' &&
        route === '/patients/[patientId]/visits/[visitId]',
    ),
  ).toBe(true);

  const forbiddenSegments = new Set([
    'lock',
    'locks',
    'report-lock',
    'clinical-report-lock',
    'a22',
  ]);
  expect(
    routes.filter(({ segments }) =>
      segments.some((segment) =>
        forbiddenSegments.has(segment.toLowerCase()),
      ),
    ),
  ).toEqual([]);

  const visitPageSource = readFileSync(
    join(
      appRouterRoot,
      'patients',
      '[patientId]',
      'visits',
      '[visitId]',
      'page.tsx',
    ),
    'utf8',
  );
  expect(visitPageSource).toContain(
    "import { AssessmentVisitExecutionPage } from '@/src/features/assessments/components/AssessmentVisitExecutionPage';",
  );
  expect(visitPageSource).toContain('<AssessmentVisitExecutionPage');

  const executionPageSource = readFileSync(
    resolve(
      'src/features/assessments/components/AssessmentVisitExecutionPage.tsx',
    ),
    'utf8',
  ).replace(/\s+/g, ' ');
  expect(executionPageSource).toContain(
    'const reportWorkflow = useClinicalReportWorkflow({ patientId, visitId, report: reportState.report,',
  );
  expect(executionPageSource).toContain(
    '<ClinicalReportPanel catalog={scales} instances={detail.scaleInstances} onRefreshVisitDetail={handleRefreshVisitDetail} patientId={patientId} reportState={reportState} visitId={visitId} workflow={reportWorkflow}',
  );

  const lockPanelSource = readFileSync(
    resolve(
      'src/features/assessments/components/ClinicalReportLockPanel.tsx',
    ),
    'utf8',
  );
  expect(lockPanelSource).toContain('onClick={workflow.openLock}');
  expect(lockPanelSource).toContain(
    'onClick={() => void workflow.confirmLock()}',
  );

  const lockHookSource = readFileSync(
    resolve(
      'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportLockAction.ts',
    ),
    'utf8',
  ).replace(/\s+/g, ' ');
  expect(lockHookSource).toContain(
    'const draft = createClinicalReportLockDraft(report);',
  );
  expect(lockHookSource).toContain(
    'lockClinicalReport( patientId, visitId, lockDraft.reportId, buildLockClinicalReportRequest(lockDraft),',
  );
});

test('B12-69: derives locked read-only semantics from lockedAt and never from isFinal', () => {
  const unlockedFinal = { ...createTestReport(), isFinal: true };
  const unlockedNonFinal = { ...createTestReport(), isFinal: false };
  const lockedFinal = {
    ...createTestReport(),
    lockedAt: '2026-07-31T01:03:00.000Z',
    isFinal: true,
  };
  const lockedNonFinal = { ...lockedFinal, isFinal: false };

  expect(isClinicalReportLocked(unlockedFinal)).toBe(false);
  expect(isClinicalReportLocked(unlockedNonFinal)).toBe(false);
  expect(isClinicalReportLocked(lockedFinal)).toBe(true);
  expect(isClinicalReportLocked(lockedNonFinal)).toBe(true);
});

test('orders B12 P1 phase audits around one lifecycle ledger and independent logout', () => {
  const businessSummary = summarizeB12P1BusinessPhase(
    {
      warningCount: 0,
      errorCount: 1,
      pageErrorCount: 1,
      categories: [{ category: 'network', count: 2 }],
    },
    {
      requestCount: 3,
      failedRequestCount: 1,
      entries: [
        {
          method: 'GET',
          status: null,
          resourceType: 'fetch',
          initiator: 'script',
          initiatorSource: 'playwright',
          failureReason: 'aborted',
          safeUrlPattern: '/patients/<id>/visits/<id>',
          bodyKeys: [],
        },
        {
          method: 'POST',
          status: 200,
          resourceType: 'fetch',
          initiator: 'script',
          initiatorSource: 'playwright',
          failureReason: null,
          safeUrlPattern: '/auth/logout',
          bodyKeys: [],
        },
        {
          method: 'POST',
          status: 200,
          resourceType: 'fetch',
          initiator: 'script',
          initiatorSource: 'playwright',
          failureReason: null,
          safeUrlPattern:
            '/patients/<id>/visits/<id>/clinical-reports/<id>/lock',
          bodyKeys: ['confirm', 'expectedUpdatedAt', 'lockNote'],
        },
      ],
    },
  );

  expect(businessSummary).toEqual({
    consoleErrorCount: 1,
    pageErrorCount: 1,
    failedRequestCount: 1,
    reportBusinessWriteCount: 1,
    lockPostCount: 1,
  });

  const supportSource = readFileSync(
    resolve('test/browser-acceptance/b12/p1/p1-support.ts'),
    'utf8',
  );
  const finishSource = supportSource.slice(
    supportSource.indexOf('async finish(): Promise<void>'),
    supportSource.indexOf('private async performLogout(): Promise<void>'),
  );
  expect(supportSource).toContain(
    'private readonly lifecycleLedger = new NetworkLedger()',
  );
  expect(supportSource.indexOf('authConsoleAudit.start()')).toBeLessThan(
    supportSource.indexOf('scenarioConsoleAudit.start()'),
  );
  expect(supportSource.indexOf('scenarioConsoleAudit.start()')).toBeLessThan(
    supportSource.indexOf('this.stableConsoleAudit.start()'),
  );
  expect(
    finishSource.indexOf('this.stableConsoleAudit.stop()'),
  ).toBeGreaterThan(-1);
  expect(
    finishSource.indexOf('await this.lifecycleLedger.detach()'),
  ).toBeGreaterThan(
    finishSource.indexOf('this.stableConsoleAudit.stop()'),
  );
  expect(finishSource.indexOf('await this.performLogout()')).toBeGreaterThan(
    finishSource.indexOf('await this.lifecycleLedger.detach()'),
  );
});

test('accepts only the pre-login GET /auth/me 401 authentication contract', () => {
  const summary = summarizeB12P1AuthBootstrap(
    {
      warningCount: 0,
      errorCount: 1,
      pageErrorCount: 0,
      categories: [{ category: 'network', count: 1 }],
    },
    ledgerSummary([
      ledgerEntry({
        method: 'GET',
        safeUrlPattern: '/auth/me',
        status: 401,
      }),
      ledgerEntry({
        method: 'POST',
        safeUrlPattern: '/auth/login',
        status: 201,
      }),
    ]),
  );

  expect(summary).toMatchObject({
    hardFailures: [],
    authProbeCount: 1,
    loginRequestCount: 1,
    reportBusinessWriteCount: 0,
    lockPostCount: 0,
  });
});

test('rejects GET /auth/me 401 after successful login', () => {
  const summary = summarizeB12P1AuthBootstrap(
    EMPTY_CONSOLE_SUMMARY,
    ledgerSummary([
      ledgerEntry({
        method: 'GET',
        safeUrlPattern: '/auth/me',
        status: 401,
      }),
      ledgerEntry({
        method: 'POST',
        safeUrlPattern: '/auth/login',
        status: 200,
      }),
      ledgerEntry({
        method: 'GET',
        safeUrlPattern: '/auth/me',
        status: 401,
      }),
    ]),
  );

  expect(summary.hardFailures).toContain(
    'auth_bootstrap_post_login_unauthorized',
  );
  expect(summary.hardFailures).toContain('auth_bootstrap_http_error');
});

test('classifies only ready scenario-load GET 2xx aborted requests as diagnostics', () => {
  const summary = summarizeB12P1ScenarioLoad(
    {
      warningCount: 0,
      errorCount: 1,
      pageErrorCount: 0,
      categories: [{ category: 'network', count: 1 }],
    },
    ledgerSummary([
      ledgerEntry({
        method: 'GET',
        safeUrlPattern:
          '/api/proxy/patients/<id>/visits/<id>/clinical-reports/latest',
      }),
      ledgerEntry({
        method: 'GET',
        safeUrlPattern: '/unexpected/safe-read',
        failureReason: 'aborted',
      }),
    ]),
    { pageReady: true, expectLatestReport: true },
  );

  expect(summary.hardFailures).toEqual([]);
  expect(summary.diagnostics).toEqual([
    expect.objectContaining({
      method: 'GET',
      status: 200,
      failureReason: 'aborted',
      safeUrlPattern: '/unexpected/safe-read',
      classification: 'scenario_load_success_response_aborted',
      count: 1,
    }),
  ]);
});

test('keeps scenario-load HTTP errors, timed out, and ordinary failed requests hard', () => {
  const summary = summarizeB12P1ScenarioLoad(
    EMPTY_CONSOLE_SUMMARY,
    ledgerSummary([
      ledgerEntry({
        method: 'GET',
        safeUrlPattern:
          '/api/proxy/patients/<id>/visits/<id>/clinical-reports/latest',
      }),
      ledgerEntry({ method: 'GET', safeUrlPattern: '/read/a', status: 404 }),
      ledgerEntry({ method: 'GET', safeUrlPattern: '/read/b', status: 503 }),
      ledgerEntry({
        method: 'GET',
        safeUrlPattern: '/read/c',
        status: null,
        failureReason: 'timed_out',
      }),
      ledgerEntry({
        method: 'GET',
        safeUrlPattern: '/read/d',
        status: null,
        failureReason: 'failed',
      }),
    ]),
    { pageReady: true, expectLatestReport: true },
  );

  expect(summary.hardFailures).toEqual(
    expect.arrayContaining([
      'scenario_load_http_error',
      'scenario_load_request_failed',
      'scenario_load_request_timed_out',
    ]),
  );
});

test('keeps every stable-evidence aborted request as a hard failure', () => {
  const summary = summarizeB12P1StableEvidence(
    EMPTY_CONSOLE_SUMMARY,
    ledgerSummary([
      ledgerEntry({
        method: 'GET',
        safeUrlPattern: '/stable/read',
        failureReason: 'aborted',
      }),
    ]),
  );

  expect(summary.failedRequestCount).toBe(1);
  expect(summary.hardFailures).toContain('stable_evidence_failed_request');
});

test('captures writes from scenario-load and stable-evidence in one lifecycle invariant', () => {
  const scenarioEntries = [
    ledgerEntry({
      method: 'PATCH',
      safeUrlPattern: '/api/proxy/clinical-reports/<id>',
    }),
  ];
  const stableEntries = [
    ledgerEntry({
      method: 'POST',
      safeUrlPattern: '/api/proxy/clinical-reports/<id>/lock',
    }),
  ];
  const summary = summarizeB12P1LifecycleWrites(
    ledgerSummary([
      ledgerEntry({ method: 'POST', safeUrlPattern: '/auth/login' }),
      ...scenarioEntries,
      ...stableEntries,
      ledgerEntry({ method: 'POST', safeUrlPattern: '/auth/logout' }),
    ]),
  );

  expect(summary).toEqual({
    reportBusinessWriteCount: 2,
    lockPostCount: 1,
  });
});

test('does not use a patient route or aborted text as a broad scenario-load allowlist', () => {
  const summary = summarizeB12P1ScenarioLoad(
    EMPTY_CONSOLE_SUMMARY,
    ledgerSummary([
      ledgerEntry({
        method: 'GET',
        safeUrlPattern:
          '/api/proxy/patients/<id>/visits/<id>/clinical-reports/latest',
      }),
      ledgerEntry({
        method: 'GET',
        safeUrlPattern: '/not-a-patient-route',
        failureReason: 'aborted',
      }),
      ledgerEntry({
        method: 'POST',
        safeUrlPattern: '/patients/<id>',
        failureReason: 'aborted',
      }),
    ]),
    { pageReady: true, expectLatestReport: true },
  );

  expect(summary.diagnostics).toHaveLength(1);
  expect(summary.diagnostics[0]?.safeUrlPattern).toBe('/not-a-patient-route');
  expect(summary.hardFailures).toEqual(
    expect.arrayContaining([
      'scenario_load_request_aborted',
      'scenario_load_unexpected_non_get',
      'scenario_load_report_business_write',
    ]),
  );
});

test('groups and sanitizes B12 P1 failure diagnostics without raw request or console data', () => {
  const diagnostics = summarizeB12P1FailureDiagnostics(
    {
      warningCount: 4,
      errorCount: 2,
      pageErrorCount: 1,
      categories: [
        { category: 'runtime', count: 1 },
        { category: 'network', count: 2 },
      ],
    },
    {
      requestCount: 4,
      failedRequestCount: 2,
      entries: [
        {
          method: 'POST',
          status: null,
          resourceType: 'document',
          initiator: 'navigation',
          initiatorSource: 'cdp',
          failureReason: 'aborted',
          safeUrlPattern:
            'https://browser.invalid/patients/507f1f77bcf86cd799439011?token=blocked-one',
          bodyKeys: ['password'],
        },
        {
          method: 'POST',
          status: null,
          resourceType: 'document',
          initiator: 'navigation',
          initiatorSource: 'cdp',
          failureReason: 'aborted',
          safeUrlPattern:
            'https://browser.invalid/patients/507f1f77bcf86cd799439012#blocked-two',
          bodyKeys: ['cookie'],
        },
        {
          method: 'GET',
          status: 503,
          resourceType: 'fetch',
          initiator: 'script',
          initiatorSource: 'playwright',
          failureReason: null,
          safeUrlPattern: '/api/proxy/clinical-reports/latest',
          bodyKeys: [],
        },
        {
          method: 'GET',
          status: 200,
          resourceType: 'fetch',
          initiator: 'script',
          initiatorSource: 'playwright',
          failureReason: null,
          safeUrlPattern: '/dashboard',
          bodyKeys: [],
        },
      ],
    },
  );

  expect(diagnostics).toEqual({
    console: {
      errorCount: 2,
      pageErrorCount: 1,
      categories: [
        { category: 'network', count: 2 },
        { category: 'runtime', count: 1 },
      ],
    },
    network: [
      {
        method: 'GET',
        status: 503,
        resourceType: 'fetch',
        initiator: 'script',
        initiatorSource: 'playwright',
        failureReason: null,
        safeUrlPattern: '/api/proxy/clinical-reports/latest',
        count: 1,
      },
      {
        method: 'POST',
        status: null,
        resourceType: 'document',
        initiator: 'navigation',
        initiatorSource: 'cdp',
        failureReason: 'aborted',
        safeUrlPattern: '/patients/<id>',
        count: 2,
      },
    ],
  });
  expect(JSON.stringify(diagnostics)).not.toMatch(
    /blocked-one|blocked-two|password|cookie|507f1f77bcf86cd79943901[12]/,
  );
});
