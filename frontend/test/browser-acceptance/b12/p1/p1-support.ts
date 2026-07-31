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
  return !['/auth/login', '/auth/logout'].includes(safeUrlPattern);
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
      ({ method, safeUrlPattern }) =>
        method === 'POST' &&
        safeUrlPattern.endsWith('/clinical-reports/<id>/lock'),
    ).length,
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
  private readonly ledger = new NetworkLedger();
  private readonly consoleAudit: ConsoleAudit;
  private closed = false;

  private constructor(
    readonly page: Page,
    private readonly closeBrowserContext: () => Promise<void>,
  ) {
    this.consoleAudit = new ConsoleAudit(page);
  }

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
    try {
      await session.ledger.attach(session.page);
      session.consoleAudit.start();
      await session.page.goto(`${input.environment.frontendOrigin}/login`, {
        waitUntil: 'domcontentloaded',
      });
      const account = session.page.getByLabel('账号', { exact: true });
      const password = session.page.getByLabel('密码', { exact: true });
      await expect(account).toBeVisible();
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
      expect(
        (await password.count()) === 0 || (await password.inputValue()) === '',
      ).toBe(true);
      return session;
    } catch (error: unknown) {
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
    const latestResponsePromise = input.expectForbidden
      ? null
      : this.page.waitForResponse(
          (response) =>
            response.request().method() === 'GET' &&
            new URL(response.url()).pathname.endsWith(
              '/clinical-reports/latest',
            ),
        );
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
      return;
    }
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
  }

  async finish(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    const failures: unknown[] = [];
    const consoleSummary = this.consoleAudit.stop();
    const networkSummary = this.ledger.summary();

    try {
      await this.ledger.detach();
    } catch (error: unknown) {
      failures.push(error);
    }

    const businessSummary = summarizeB12P1BusinessPhase(
      consoleSummary,
      networkSummary,
    );
    try {
      expect(businessSummary).toEqual({
        consoleErrorCount: 0,
        pageErrorCount: 0,
        failedRequestCount: 0,
        reportBusinessWriteCount: 0,
        lockPostCount: 0,
      });
    } catch (error: unknown) {
      const diagnostics = summarizeB12P1FailureDiagnostics(
        consoleSummary,
        networkSummary,
      );
      failures.push(
        new AggregateError(
          [error],
          `B12 P1 business audit failed; safe diagnostics=${safeJsonStringify(
            diagnostics,
          )}`,
        ),
      );
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
      'B12 P1 business audit, logout, or BrowserContext cleanup failed',
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
            new URL(response.url()).pathname === '/auth/logout',
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
          method === 'POST' && safeUrlPattern === '/auth/logout',
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
