import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';

import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from '../../support/acceptance-env';
import { expect, test } from '../../support/acceptance-test';
import { NetworkLedger } from '../../support/network-ledger';
import type {
  AcceptanceRole,
  RoleContextFactory,
} from '../../support/role-context-factory';
import { ConsoleAudit } from '../../support/runtime-audit';

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
    let logoutSucceeded = false;
    try {
      if (
        !this.page.isClosed() &&
        new URL(this.page.url()).pathname !== '/login'
      ) {
        const logout = this.page.getByRole('button', {
          name: '退出登录',
          exact: true,
        });
        if (await logout.isVisible()) {
          const responsePromise = this.page.waitForResponse(
            (response) =>
              response.request().method() === 'POST' &&
              new URL(response.url()).pathname === '/auth/logout',
          );
          await logout.click();
          const response = await responsePromise;
          expect(response.status()).toBeGreaterThanOrEqual(200);
          expect(response.status()).toBeLessThan(300);
          await this.page.waitForURL(/\/login$/);
          logoutSucceeded = true;
        }
      }
      expect(logoutSucceeded).toBe(true);
      const consoleSummary = this.consoleAudit.stop();
      const networkSummary = await this.ledger.detach();
      expect({
        consoleErrorCount: consoleSummary.errorCount,
        pageErrorCount: consoleSummary.pageErrorCount,
        failedRequestCount: networkSummary.failedRequestCount,
      }).toEqual({
        consoleErrorCount: 0,
        pageErrorCount: 0,
        failedRequestCount: 0,
      });
      expect(
        networkSummary.entries.filter(({ method, safeUrlPattern }) =>
          isReportBusinessWrite(method, safeUrlPattern),
        ),
      ).toHaveLength(0);
      expect(
        networkSummary.entries.filter(
          ({ method, safeUrlPattern }) =>
            method === 'POST' &&
            safeUrlPattern.endsWith('/clinical-reports/<id>/lock'),
        ),
      ).toHaveLength(0);
    } finally {
      await this.closeBrowserContext();
    }
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
  try {
    await body(session);
  } finally {
    await session.finish();
  }
}
