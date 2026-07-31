import { createHash } from 'node:crypto';
import type { Page, Response } from '@playwright/test';

import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from '../../support/acceptance-env';
import { expect, test } from '../../support/acceptance-test';
import { NetworkLedger } from '../../support/network-ledger';
import type {
  NetworkLedgerEntry,
  NetworkLedgerSummary,
} from '../../support/network-ledger';
import type {
  AcceptanceRole,
  RoleContextFactory,
} from '../../support/role-context-factory';
import { ConsoleAudit } from '../../support/runtime-audit';
import type { ConsoleAuditSummary } from '../../support/runtime-audit';
import {
  safeJsonStringify,
  sanitizeUrlPattern,
} from '../../support/safe-output';

const SESSION_COOKIE_NAME = 'cogmemory_ad_session';
const AUTH_ME_PATTERN = '/auth/me';
const AUTH_LOGIN_PATTERN = '/auth/login';
const AUTH_LOGOUT_PATTERN = '/auth/logout';

export type B12P1Profile = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';

type B12P1Environment =
  | {
      enabled: false;
      skipReason: string;
    }
  | {
      enabled: true;
      frontendOrigin: string;
      fixturePassword: string;
    };

export function resolveB12P1Environment(): B12P1Environment {
  const live = resolveLiveAcceptanceEnvironment();
  if (!live.enabled) {
    return { enabled: false, skipReason: live.skipReason };
  }
  const boundaryEnvironment = { ...process.env };
  delete boundaryEnvironment.B12_FIXTURE_PASSWORD;
  assertDatabaseBoundaryIsClear(boundaryEnvironment);
  const fixturePassword = process.env.B12_FIXTURE_PASSWORD?.trim();
  if (!fixturePassword || fixturePassword.length > 256) {
    throw new Error('B12 P1 fixture password is unavailable');
  }
  return {
    enabled: true,
    frontendOrigin: live.frontendOrigin,
    fixturePassword,
  };
}

function objectIdFor(
  profile: B12P1Profile,
  scenarioKey: string,
  resource: 'patient' | 'visit',
): string {
  return createHash('sha256')
    .update(`b12-p1:${profile}:${scenarioKey}:${resource}`)
    .digest('hex')
    .slice(0, 24);
}

export function b12P1Route(profile: B12P1Profile, scenarioKey: string): string {
  return `/patients/${objectIdFor(
    profile,
    scenarioKey,
    'patient',
  )}/visits/${objectIdFor(profile, scenarioKey, 'visit')}`;
}

export function annotateAuditIds(...auditIds: string[]): void {
  for (const auditId of auditIds) {
    test.info().annotations.push({ type: 'audit', description: auditId });
  }
}

function accountName(profile: B12P1Profile, role: AcceptanceRole): string {
  return `b12p1-${profile}-${role.replaceAll('_', '-')}`;
}

function isReportBusinessWrite(
  method: string,
  safeUrlPattern: string,
): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return false;
  return ![AUTH_LOGIN_PATTERN, AUTH_LOGOUT_PATTERN].includes(safeUrlPattern);
}

function isLockPost(entry: NetworkLedgerEntry): boolean {
  return (
    entry.method === 'POST' &&
    entry.safeUrlPattern.endsWith('/clinical-reports/<id>/lock')
  );
}

function networkSummaryForEntries(
  entries: NetworkLedgerEntry[],
): NetworkLedgerSummary {
  return {
    requestCount: entries.length,
    failedRequestCount: entries.filter(
      ({ failureReason }) => failureReason !== null,
    ).length,
    entries: entries.map((entry) => ({
      ...entry,
      bodyKeys: [...entry.bodyKeys],
    })),
  };
}

export type B12P1BusinessPhaseSummary = {
  consoleErrorCount: number;
  pageErrorCount: number;
  failedRequestCount: number;
  reportBusinessWriteCount: number;
  lockPostCount: number;
};

export type B12P1FailedNetworkFingerprint = Omit<
  NetworkLedgerEntry,
  'bodyKeys'
> & {
  count: number;
};

export type B12P1FailureDiagnostics = {
  console: Pick<
    ConsoleAuditSummary,
    'errorCount' | 'pageErrorCount' | 'categories'
  >;
  network: B12P1FailedNetworkFingerprint[];
};

export function summarizeB12P1BusinessPhase(
  consoleSummary: ConsoleAuditSummary,
  networkSummary: NetworkLedgerSummary,
): B12P1BusinessPhaseSummary {
  return {
    consoleErrorCount: consoleSummary.errorCount,
    pageErrorCount: consoleSummary.pageErrorCount,
    failedRequestCount: networkSummary.failedRequestCount,
    reportBusinessWriteCount: networkSummary.entries.filter(
      ({ method, safeUrlPattern }) =>
        isReportBusinessWrite(method, safeUrlPattern),
    ).length,
    lockPostCount: networkSummary.entries.filter(
      (entry) => isLockPost(entry),
    ).length,
  };
}

type B12P1PhaseGate = {
  hardFailures: string[];
  reportBusinessWriteCount: number;
  lockPostCount: number;
};

export type B12P1AuthBootstrapSummary = B12P1PhaseGate & {
  authProbeCount: number;
  loginRequestCount: number;
  console: Pick<
    ConsoleAuditSummary,
    'errorCount' | 'pageErrorCount' | 'categories'
  >;
};

export type B12P1ScenarioLoadDiagnostic = B12P1FailedNetworkFingerprint & {
  classification: 'scenario_load_success_response_aborted';
};

export type B12P1ScenarioLoadSummary = B12P1PhaseGate & {
  latestReportResponseCount: number;
  diagnostics: B12P1ScenarioLoadDiagnostic[];
  failureDiagnostics: B12P1FailureDiagnostics;
};

export type B12P1StableEvidenceSummary = B12P1BusinessPhaseSummary & {
  hardFailures: string[];
  diagnostics: B12P1FailureDiagnostics;
};

export type B12P1LifecycleWriteSummary = {
  reportBusinessWriteCount: number;
  lockPostCount: number;
};

function sortedFailures(failures: string[]): string[] {
  return [...new Set(failures)].sort((left, right) =>
    left.localeCompare(right),
  );
}

function appendConsoleFailures(
  failures: string[],
  phase: 'auth_bootstrap' | 'scenario_load',
  consoleSummary: ConsoleAuditSummary,
  allowedNetworkErrorCount: number,
): void {
  if (consoleSummary.pageErrorCount > 0) {
    failures.push(`${phase}_page_error`);
  }
  if (consoleSummary.errorCount > allowedNetworkErrorCount) {
    failures.push(`${phase}_console_error`);
  }
  if (
    consoleSummary.errorCount > 0 &&
    consoleSummary.categories.some(({ category }) => category !== 'network')
  ) {
    failures.push(`${phase}_non_network_console_error`);
  }
}

function safeConsoleSummary(
  consoleSummary: ConsoleAuditSummary,
): Pick<
  ConsoleAuditSummary,
  'errorCount' | 'pageErrorCount' | 'categories'
> {
  return {
    errorCount: consoleSummary.errorCount,
    pageErrorCount: consoleSummary.pageErrorCount,
    categories: consoleSummary.categories
      .map((category) => ({ ...category }))
      .sort((left, right) => left.category.localeCompare(right.category)),
  };
}

export function summarizeB12P1AuthBootstrap(
  consoleSummary: ConsoleAuditSummary,
  networkSummary: NetworkLedgerSummary,
): B12P1AuthBootstrapSummary {
  const failures: string[] = [];
  const authProbeIndexes = networkSummary.entries
    .map((entry, index) => ({ entry, index }))
    .filter(
      ({ entry }) =>
        entry.method === 'GET' && entry.safeUrlPattern === AUTH_ME_PATTERN,
    );
  const loginIndexes = networkSummary.entries
    .map((entry, index) => ({ entry, index }))
    .filter(
      ({ entry }) =>
        entry.method === 'POST' && entry.safeUrlPattern === AUTH_LOGIN_PATTERN,
    );
  const successfulLogin = loginIndexes.find(
    ({ entry }) =>
      entry.failureReason === null &&
      entry.status !== null &&
      entry.status >= 200 &&
      entry.status < 300,
  );
  const onlyAuthProbe =
    authProbeIndexes.length === 1 ? authProbeIndexes[0] : undefined;
  const expectedProbe =
    onlyAuthProbe !== undefined &&
    onlyAuthProbe.entry.status === 401 &&
    onlyAuthProbe.entry.failureReason === null &&
    successfulLogin !== undefined &&
    onlyAuthProbe.index < successfulLogin.index;

  if (!expectedProbe) failures.push('auth_bootstrap_probe_contract');
  if (loginIndexes.length !== 1 || successfulLogin === undefined) {
    failures.push('auth_bootstrap_login_contract');
  }

  networkSummary.entries.forEach((entry, index) => {
    if (entry.failureReason !== null) {
      failures.push(`auth_bootstrap_request_${entry.failureReason}`);
    }
    if (entry.status !== null && entry.status >= 400) {
      const isExpectedProbe =
        expectedProbe && onlyAuthProbe?.index === index;
      if (!isExpectedProbe) failures.push('auth_bootstrap_http_error');
    }
    if (
      entry.method === 'GET' &&
      entry.safeUrlPattern === AUTH_ME_PATTERN &&
      entry.status === 401 &&
      successfulLogin !== undefined &&
      index > successfulLogin.index
    ) {
      failures.push('auth_bootstrap_post_login_unauthorized');
    }
  });

  const lifecycleWrites = summarizeB12P1LifecycleWrites(networkSummary);
  if (lifecycleWrites.reportBusinessWriteCount > 0) {
    failures.push('auth_bootstrap_report_business_write');
  }
  if (lifecycleWrites.lockPostCount > 0) {
    failures.push('auth_bootstrap_lock_post');
  }
  appendConsoleFailures(
    failures,
    'auth_bootstrap',
    consoleSummary,
    expectedProbe ? 1 : 0,
  );

  return {
    hardFailures: sortedFailures(failures),
    authProbeCount: authProbeIndexes.length,
    loginRequestCount: loginIndexes.length,
    console: safeConsoleSummary(consoleSummary),
    ...lifecycleWrites,
  };
}

function isScenarioLoadDiagnostic(
  entry: NetworkLedgerEntry,
  pageReady: boolean,
): boolean {
  return (
    pageReady &&
    entry.method === 'GET' &&
    entry.status !== null &&
    entry.status >= 200 &&
    entry.status < 300 &&
    entry.failureReason === 'aborted' &&
    !isReportBusinessWrite(entry.method, entry.safeUrlPattern) &&
    !isLockPost(entry)
  );
}

function summarizeScenarioLoadDiagnostics(
  entries: NetworkLedgerEntry[],
): B12P1ScenarioLoadDiagnostic[] {
  const fingerprints = new Map<string, B12P1ScenarioLoadDiagnostic>();
  for (const entry of entries) {
    const fingerprint: B12P1ScenarioLoadDiagnostic = {
      method: entry.method,
      status: entry.status,
      resourceType: entry.resourceType,
      initiator: entry.initiator,
      initiatorSource: entry.initiatorSource,
      failureReason: entry.failureReason,
      safeUrlPattern: sanitizeUrlPattern(entry.safeUrlPattern),
      count: 1,
      classification: 'scenario_load_success_response_aborted',
    };
    const key = JSON.stringify(fingerprint, (name, value) =>
      name === 'count' ? undefined : value,
    );
    const existing = fingerprints.get(key);
    if (existing) existing.count += 1;
    else fingerprints.set(key, fingerprint);
  }
  return [...fingerprints.values()].sort(compareNetworkFingerprints);
}

export function summarizeB12P1ScenarioLoad(
  consoleSummary: ConsoleAuditSummary,
  networkSummary: NetworkLedgerSummary,
  input: { pageReady: boolean; expectLatestReport: boolean },
): B12P1ScenarioLoadSummary {
  const failures: string[] = [];
  const latestReportResponses = networkSummary.entries.filter(
    ({ method, safeUrlPattern, status }) =>
      method === 'GET' &&
      safeUrlPattern.endsWith('/clinical-reports/latest') &&
      status === 200,
  );
  const diagnosticEntries = networkSummary.entries.filter((entry) =>
    isScenarioLoadDiagnostic(entry, input.pageReady),
  );

  if (!input.pageReady) failures.push('scenario_load_page_not_ready');
  if (input.expectLatestReport && latestReportResponses.length !== 1) {
    failures.push('scenario_load_latest_report_contract');
  }

  for (const entry of networkSummary.entries) {
    if (
      entry.status !== null &&
      entry.status >= 400
    ) {
      failures.push('scenario_load_http_error');
    }
    if (
      entry.failureReason !== null &&
      !isScenarioLoadDiagnostic(entry, input.pageReady)
    ) {
      failures.push(`scenario_load_request_${entry.failureReason}`);
    }
    if (entry.status === null && entry.failureReason === null) {
      failures.push('scenario_load_missing_response');
    }
    if (entry.method !== 'GET') {
      failures.push('scenario_load_unexpected_non_get');
    }
  }

  const lifecycleWrites = summarizeB12P1LifecycleWrites(networkSummary);
  if (lifecycleWrites.reportBusinessWriteCount > 0) {
    failures.push('scenario_load_report_business_write');
  }
  if (lifecycleWrites.lockPostCount > 0) {
    failures.push('scenario_load_lock_post');
  }
  appendConsoleFailures(
    failures,
    'scenario_load',
    consoleSummary,
    diagnosticEntries.length,
  );

  return {
    hardFailures: sortedFailures(failures),
    latestReportResponseCount: latestReportResponses.length,
    diagnostics: summarizeScenarioLoadDiagnostics(diagnosticEntries),
    failureDiagnostics: summarizeB12P1FailureDiagnostics(
      consoleSummary,
      networkSummary,
    ),
    ...lifecycleWrites,
  };
}

export function summarizeB12P1StableEvidence(
  consoleSummary: ConsoleAuditSummary,
  networkSummary: NetworkLedgerSummary,
): B12P1StableEvidenceSummary {
  const businessSummary = summarizeB12P1BusinessPhase(
    consoleSummary,
    networkSummary,
  );
  const failures: string[] = [];
  if (businessSummary.consoleErrorCount > 0) {
    failures.push('stable_evidence_console_error');
  }
  if (businessSummary.pageErrorCount > 0) {
    failures.push('stable_evidence_page_error');
  }
  if (businessSummary.failedRequestCount > 0) {
    failures.push('stable_evidence_failed_request');
  }
  if (
    networkSummary.entries.some(
      ({ status }) => status !== null && status >= 400,
    )
  ) {
    failures.push('stable_evidence_http_error');
  }
  if (businessSummary.reportBusinessWriteCount > 0) {
    failures.push('stable_evidence_report_business_write');
  }
  if (businessSummary.lockPostCount > 0) {
    failures.push('stable_evidence_lock_post');
  }
  return {
    ...businessSummary,
    hardFailures: sortedFailures(failures),
    diagnostics: summarizeB12P1FailureDiagnostics(
      consoleSummary,
      networkSummary,
    ),
  };
}

export function summarizeB12P1LifecycleWrites(
  networkSummary: NetworkLedgerSummary,
): B12P1LifecycleWriteSummary {
  return {
    reportBusinessWriteCount: networkSummary.entries.filter(
      ({ method, safeUrlPattern }) =>
        isReportBusinessWrite(method, safeUrlPattern),
    ).length,
    lockPostCount: networkSummary.entries.filter((entry) => isLockPost(entry))
      .length,
  };
}

function isNetworkFailure(entry: NetworkLedgerEntry): boolean {
  return (
    entry.failureReason !== null ||
    (entry.status !== null && (entry.status < 200 || entry.status >= 400))
  );
}

function compareNetworkFingerprints(
  left: B12P1FailedNetworkFingerprint,
  right: B12P1FailedNetworkFingerprint,
): number {
  const leftFields = [
    left.method,
    left.status === null ? '' : String(left.status).padStart(3, '0'),
    left.resourceType,
    left.initiator,
    left.initiatorSource,
    left.failureReason ?? '',
    left.safeUrlPattern,
  ];
  const rightFields = [
    right.method,
    right.status === null ? '' : String(right.status).padStart(3, '0'),
    right.resourceType,
    right.initiator,
    right.initiatorSource,
    right.failureReason ?? '',
    right.safeUrlPattern,
  ];
  return leftFields.join('\u0000').localeCompare(rightFields.join('\u0000'));
}

export function summarizeB12P1FailureDiagnostics(
  consoleSummary: ConsoleAuditSummary,
  networkSummary: NetworkLedgerSummary,
): B12P1FailureDiagnostics {
  const fingerprints = new Map<string, B12P1FailedNetworkFingerprint>();
  for (const entry of networkSummary.entries.filter(isNetworkFailure)) {
    const fingerprint: B12P1FailedNetworkFingerprint = {
      method: entry.method,
      status: entry.status,
      resourceType: entry.resourceType,
      initiator: entry.initiator,
      initiatorSource: entry.initiatorSource,
      failureReason: entry.failureReason,
      safeUrlPattern: sanitizeUrlPattern(entry.safeUrlPattern),
      count: 1,
    };
    const key = JSON.stringify(fingerprint, (name, value) =>
      name === 'count' ? undefined : value,
    );
    const existing = fingerprints.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      fingerprints.set(key, fingerprint);
    }
  }

  return {
    console: {
      errorCount: consoleSummary.errorCount,
      pageErrorCount: consoleSummary.pageErrorCount,
      categories: consoleSummary.categories
        .map((category) => ({ ...category }))
        .sort((left, right) => left.category.localeCompare(right.category)),
    },
    network: [...fingerprints.values()].sort(compareNetworkFingerprints),
  };
}

function throwCollectedFailures(
  failures: unknown[],
  message: string,
): void {
  if (failures.length === 0) return;
  if (failures.length === 1) throw failures[0];
  throw new AggregateError(failures, message);
}

export class B12P1BrowserSession {
  private readonly lifecycleLedger = new NetworkLedger();
  private lifecycleLedgerAttached = false;
  private stableConsoleAudit: ConsoleAudit | null = null;
  private stableStartIndex: number | null = null;
  private authPhaseEndIndex = 0;
  private closed = false;

  private constructor(
    readonly page: Page,
    private readonly closeBrowserContext: () => Promise<void>,
  ) {}

  static async login(input: {
    environment: Extract<B12P1Environment, { enabled: true }>;
    profile: B12P1Profile;
    role: AcceptanceRole;
    roleContexts: RoleContextFactory;
  }): Promise<B12P1BrowserSession> {
    const roleContext = await input.roleContexts.create(
      input.role,
      `${input.profile}-${input.role}`,
      { viewport: { width: 1536, height: 864 } },
    );
    const session = new B12P1BrowserSession(roleContext.page, () =>
      roleContext.context.close(),
    );
    const authConsoleAudit = new ConsoleAudit(session.page);
    let authConsoleActive = false;
    try {
      await session.lifecycleLedger.attach(session.page);
      session.lifecycleLedgerAttached = true;
      authConsoleAudit.start();
      authConsoleActive = true;
      const authProbeResponsePromise = session.page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          new URL(response.url()).pathname === AUTH_ME_PATTERN,
      );
      await session.page.goto(`${input.environment.frontendOrigin}/login`, {
        waitUntil: 'domcontentloaded',
      });
      const authProbeResponse = await authProbeResponsePromise;
      expect(authProbeResponse.status()).toBe(401);
      const account = session.page.getByLabel('账号', { exact: true });
      const password = session.page.getByLabel('密码', { exact: true });
      await expect(account).toBeVisible();
      await expect(password).toBeVisible();
      await account.fill(accountName(input.profile, input.role));
      await password.fill(input.environment.fixturePassword);
      const loginResponsePromise = session.page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/auth/login',
      );
      await session.page
        .getByRole('button', { name: '登录系统', exact: true })
        .click();
      const response = await loginResponsePromise;
      expect(response.status()).toBeGreaterThanOrEqual(200);
      expect(response.status()).toBeLessThan(300);
      await session.page.waitForURL(
        `${input.environment.frontendOrigin}/dashboard`,
      );
      await session.page.waitForLoadState('networkidle', { timeout: 10_000 });
      expect(
        (await password.count()) === 0 || (await password.inputValue()) === '',
      ).toBe(true);
      const authConsoleSummary = authConsoleAudit.stop();
      authConsoleActive = false;
      session.authPhaseEndIndex = session.lifecycleLedger.entries().length;
      const authSummary = summarizeB12P1AuthBootstrap(
        authConsoleSummary,
        networkSummaryForEntries(
          session.lifecycleLedger.entries().slice(0, session.authPhaseEndIndex),
        ),
      );
      if (authSummary.hardFailures.length > 0) {
        throw new Error(
          `B12 P1 auth_bootstrap failed; safe summary=${safeJsonStringify(
            authSummary,
          )}`,
        );
      }
      return session;
    } catch (error: unknown) {
      if (authConsoleActive) authConsoleAudit.stop();
      await session.finish().catch(() => undefined);
      throw error;
    }
  }

  async openScenario(input: {
    frontendOrigin: string;
    profile: B12P1Profile;
    scenarioKey: string;
    expectForbidden?: boolean;
  }): Promise<void> {
    const scenarioConsoleAudit = new ConsoleAudit(this.page);
    const scenarioStartIndex = this.authPhaseEndIndex;
    let pageReady = false;
    let readinessFailure: unknown;
    scenarioConsoleAudit.start();
    const latestResponsePromise = input.expectForbidden
      ? null
      : this.page.waitForResponse(
          (response) =>
            response.request().method() === 'GET' &&
            new URL(response.url()).pathname.endsWith(
              '/clinical-reports/latest',
            ),
        );
    try {
      await this.page.goto(
        `${input.frontendOrigin}${b12P1Route(input.profile, input.scenarioKey)}`,
        { waitUntil: 'domcontentloaded' },
      );
      if (input.expectForbidden) {
        await expect(
          this.page.getByRole('heading', {
            name: '当前账号没有访问评估访视的权限',
            exact: true,
          }),
        ).toBeVisible();
        await this.page.waitForLoadState('networkidle', { timeout: 10_000 });
        pageReady = true;
      } else {
        const latestResponse = await latestResponsePromise;
        expect(latestResponse?.status()).toBe(200);
        await expect(
          this.page.getByRole('heading', {
            name: '访视级临床报告',
            exact: true,
          }),
        ).toBeVisible();
        await this.page.waitForLoadState('networkidle', { timeout: 10_000 });
        await expect(
          this.page.getByRole('heading', {
            name: '报告工作流摘要',
            exact: true,
          }),
        ).toBeVisible();
        pageReady = true;
      }
    } catch {
      readinessFailure = new Error('B12 P1 scenario_load page readiness failed');
    }

    const scenarioConsoleSummary = scenarioConsoleAudit.stop();
    const scenarioEndIndex = this.lifecycleLedger.entries().length;
    const scenarioSummary = summarizeB12P1ScenarioLoad(
      scenarioConsoleSummary,
      networkSummaryForEntries(
        this.lifecycleLedger
          .entries()
          .slice(scenarioStartIndex, scenarioEndIndex),
      ),
      { pageReady, expectLatestReport: !input.expectForbidden },
    );
    if (scenarioSummary.diagnostics.length > 0) {
      process.stdout.write(
        `B12_P1_SCENARIO_LOAD_DIAGNOSTICS ${safeJsonStringify({
          diagnostics: scenarioSummary.diagnostics,
        })}\n`,
      );
    }
    const scenarioFailures = [
      ...(readinessFailure === undefined ? [] : [readinessFailure]),
      ...(scenarioSummary.hardFailures.length === 0
        ? []
        : [
            new Error(
              `B12 P1 scenario_load failed; safe summary=${safeJsonStringify(
                scenarioSummary,
              )}`,
            ),
          ]),
    ];
    throwCollectedFailures(
      scenarioFailures,
      'B12 P1 scenario_load readiness or hard gate failed',
    );

    this.stableStartIndex = scenarioEndIndex;
    this.stableConsoleAudit = new ConsoleAudit(this.page);
    this.stableConsoleAudit.start();
  }

  async finish(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    const failures: unknown[] = [];
    if (
      this.stableConsoleAudit !== null &&
      this.stableStartIndex !== null
    ) {
      const stableConsoleSummary = this.stableConsoleAudit.stop();
      const stableNetworkSummary = networkSummaryForEntries(
        this.lifecycleLedger.entries().slice(this.stableStartIndex),
      );
      const stableSummary = summarizeB12P1StableEvidence(
        stableConsoleSummary,
        stableNetworkSummary,
      );
      if (stableSummary.hardFailures.length > 0) {
        failures.push(
          new Error(
            `B12 P1 stable_evidence failed; safe summary=${safeJsonStringify(
              stableSummary,
            )}`,
          ),
        );
      }
    }

    const lifecycleSummary = summarizeB12P1LifecycleWrites(
      this.lifecycleLedger.summary(),
    );
    if (
      lifecycleSummary.reportBusinessWriteCount > 0 ||
      lifecycleSummary.lockPostCount > 0
    ) {
      failures.push(
        new Error(
          `B12 P1 lifecycle write invariant failed; safe summary=${safeJsonStringify(
            lifecycleSummary,
          )}`,
        ),
      );
    }

    if (this.lifecycleLedgerAttached) {
      try {
        await this.lifecycleLedger.detach();
        this.lifecycleLedgerAttached = false;
      } catch (error: unknown) {
        failures.push(error);
      }
    }

    try {
      await this.performLogout();
    } catch (error: unknown) {
      failures.push(error);
    }

    try {
      await this.closeBrowserContext();
    } catch (error: unknown) {
      failures.push(error);
    }

    throwCollectedFailures(
      failures,
      'B12 P1 phased audit, logout, or BrowserContext cleanup failed',
    );
  }

  private async performLogout(): Promise<void> {
    const logoutLedger = new NetworkLedger();
    const failures: unknown[] = [];
    let ledgerAttached = false;
    let logoutResponse: Response | null = null;

    try {
      await logoutLedger.attach(this.page);
      ledgerAttached = true;
    } catch (error: unknown) {
      failures.push(error);
    }

    try {
      expect(this.page.isClosed()).toBe(false);
      expect(new URL(this.page.url()).pathname).not.toBe('/login');
      const logout = this.page.getByRole('button', {
        name: '退出登录',
        exact: true,
      });
      await expect(logout).toBeVisible();
      [logoutResponse] = await Promise.all([
        this.page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname === AUTH_LOGOUT_PATTERN,
        ),
        logout.click(),
      ]);
      expect(logoutResponse.status()).toBeGreaterThanOrEqual(200);
      expect(logoutResponse.status()).toBeLessThan(300);
      await this.page.waitForURL((url) => url.pathname === '/login');
      await expect(
        this.page.getByLabel('账号', { exact: true }),
      ).toBeVisible();
      await expect(
        this.page.getByLabel('密码', { exact: true }),
      ).toBeVisible();
      await expect(
        this.page.getByRole('button', {
          name: '登录系统',
          exact: true,
        }),
      ).toBeVisible();
      await expect(logout).toHaveCount(0);
      const sessionCookieCount = (await this.page.context().cookies()).filter(
        ({ name }) => name === SESSION_COOKIE_NAME,
      ).length;
      expect(sessionCookieCount).toBe(0);
    } catch (error: unknown) {
      failures.push(error);
    }

    const logoutNetworkSummary = logoutLedger.summary();
    if (ledgerAttached) {
      try {
        await logoutLedger.detach();
      } catch (error: unknown) {
        failures.push(error);
      }
    }

    try {
      const logoutRequests = logoutNetworkSummary.entries.filter(
        ({ method, safeUrlPattern }) =>
          method === 'POST' && safeUrlPattern === AUTH_LOGOUT_PATTERN,
      );
      expect(logoutRequests).toHaveLength(1);
      expect(logoutRequests[0]).toMatchObject({
        failureReason: null,
        status: logoutResponse?.status() ?? null,
      });
      expect(
        logoutNetworkSummary.entries.filter(({ method, safeUrlPattern }) =>
          isReportBusinessWrite(method, safeUrlPattern),
        ),
      ).toHaveLength(0);
    } catch (error: unknown) {
      failures.push(error);
    }

    throwCollectedFailures(
      failures,
      'B12 P1 logout lifecycle or listener cleanup failed',
    );
  }
}

export async function withB12P1Session(
  input: {
    environment: Extract<B12P1Environment, { enabled: true }>;
    profile: B12P1Profile;
    role: AcceptanceRole;
    roleContexts: RoleContextFactory;
  },
  body: (session: B12P1BrowserSession) => Promise<void>,
): Promise<void> {
  const session = await B12P1BrowserSession.login(input);
  let bodyFailure: unknown;
  try {
    await body(session);
  } catch (error: unknown) {
    bodyFailure = error;
  }

  try {
    await session.finish();
  } catch (finishFailure: unknown) {
    if (bodyFailure !== undefined) {
      throw new AggregateError(
        [bodyFailure, finishFailure],
        'B12 P1 scenario failed and session cleanup also reported a failure',
      );
    }
    throw finishFailure;
  }

  if (bodyFailure !== undefined) throw bodyFailure;
}
