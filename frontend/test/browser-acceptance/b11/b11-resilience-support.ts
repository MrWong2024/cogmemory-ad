import { lstat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  expect,
  type BrowserContextOptions,
  type Page,
  type Request,
  type Response,
  type Route,
} from '@playwright/test';

import {
  auditRuntimeStorage,
  ConsoleAudit,
} from '../support/runtime-audit';
import {
  NetworkLedger,
  type NetworkLedgerEntry,
} from '../support/network-ledger';
import type { RoleContextFactory } from '../support/role-context-factory';
import { safeJsonStringify } from '../support/safe-output';
import {
  auditB11DomPrivacy,
  B11_NEUTRAL_TEXT,
  removeCurrentB11TestOutput,
} from './b11-core-support';
import type { B11BrowserEnvironment } from './b11-env';
import {
  b11ForbiddenRoleStageMarkerPath,
  b11RuntimeRoot,
  deleteB11ResilienceRuntimeDescriptor,
  readB11ResilienceRuntimeDescriptor,
  type B11ResilienceRouteTarget,
  type B11ResilienceRuntimeDescriptor,
} from './b11-runtime-descriptor';

type EnabledB11BrowserEnvironment = Extract<
  B11BrowserEnvironment,
  { enabled: true }
>;

export type B11ResilienceActionKind = 'edit' | 'submit' | 'confirm';

type ActionFinalContract = {
  count: number;
  status: number | null;
  bodyKeys: string[];
  aborted: boolean;
};

type SessionFinalContract = {
  latest: { minimum: number; maximum: number };
  actions?: Partial<Record<B11ResilienceActionKind, ActionFinalContract>>;
  expectedConsoleErrors: number;
  logout: 'ui' | 'sibling_already_completed';
};

type SafeNetworkGroup = Pick<
  NetworkLedgerEntry,
  | 'method'
  | 'status'
  | 'initiator'
  | 'initiatorSource'
  | 'failureReason'
  | 'safeUrlPattern'
  | 'bodyKeys'
> & { count: number };

const ACTION_METHOD: Record<B11ResilienceActionKind, string> = {
  edit: 'PATCH',
  submit: 'POST',
  confirm: 'POST',
};

const ACTION_SUFFIX: Record<B11ResilienceActionKind, string> = {
  edit: '/draft',
  submit: '/submit-confirmation',
  confirm: '/confirm',
};

const AUDIT_IDS: Readonly<Record<string, readonly string[]>> = {
  'action-ownership/unsupported-sibling-actions': [
    'B11-56',
    'B11-57',
    'B11-58',
    'B11-59',
  ],
  'authorization/unauthorized-action': ['B11-63'],
  'authorization/forbidden-confirm': ['B11-64'],
  'network-failure/edit-network-abort': ['B11-65'],
  'network-failure/submit-network-abort': ['B11-65'],
  'network-failure/confirm-network-abort': ['B11-65'],
  'client-boundary/storage-and-refresh': ['B11-66', 'B11-67'],
  'client-boundary/responsive-accessibility': ['B11-68'],
  'client-boundary/stale-disabled': ['B11-69'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function actionForRequest(request: Request): B11ResilienceActionKind | null {
  const pathname = new URL(request.url()).pathname;
  return (Object.keys(ACTION_SUFFIX) as B11ResilienceActionKind[]).find(
    (action) =>
      request.method() === ACTION_METHOD[action] &&
      pathname.endsWith(ACTION_SUFFIX[action]),
  ) ?? null;
}

function actionEntries(
  entries: readonly NetworkLedgerEntry[],
  action: B11ResilienceActionKind,
): NetworkLedgerEntry[] {
  return entries.filter(
    (entry) =>
      entry.method === ACTION_METHOD[action] &&
      entry.safeUrlPattern.endsWith(ACTION_SUFFIX[action]),
  );
}

function relevantNetworkEntry(entry: NetworkLedgerEntry): boolean {
  return (
    entry.safeUrlPattern === '/auth/me' ||
    entry.safeUrlPattern === '/auth/logout' ||
    entry.safeUrlPattern.includes('/clinical-reports') ||
    /(?:pdf|print|download|signature|\/ai(?:\/|$)|llm)/i.test(
      entry.safeUrlPattern,
    )
  );
}

function groupNetworkEntries(
  entries: readonly NetworkLedgerEntry[],
): SafeNetworkGroup[] {
  const groups = new Map<string, SafeNetworkGroup>();
  for (const entry of entries.filter(relevantNetworkEntry)) {
    const candidate: SafeNetworkGroup = {
      method: entry.method,
      status: entry.status,
      initiator: entry.initiator,
      initiatorSource: entry.initiatorSource,
      failureReason: entry.failureReason,
      safeUrlPattern: entry.safeUrlPattern,
      bodyKeys: [...entry.bodyKeys],
      count: 1,
    };
    const key = JSON.stringify(candidate);
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, candidate);
  }
  return [...groups.values()].sort(
    (left, right) =>
      left.safeUrlPattern.localeCompare(right.safeUrlPattern) ||
      left.method.localeCompare(right.method) ||
      (left.status ?? -1) - (right.status ?? -1),
  );
}

function isSiblingWrite(entry: NetworkLedgerEntry): boolean {
  return (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(entry.method) &&
    /\/clinical-reports\/<id>\/(?:lock|freeze-sources|archive|corrections)$/.test(
      entry.safeUrlPattern,
    )
  );
}

function isUnrelatedOutput(entry: NetworkLedgerEntry): boolean {
  return /(?:pdf|print|download|signature|\/ai(?:\/|$)|llm)/i.test(
    entry.safeUrlPattern,
  );
}

function latestEntries(entries: readonly NetworkLedgerEntry[]) {
  return entries.filter(
    (entry) =>
      entry.method === 'GET' &&
      entry.safeUrlPattern.endsWith('/clinical-reports/latest'),
  );
}

async function readUpdatedAt(response: Response): Promise<string> {
  const body = (await response.json()) as unknown;
  const report = isRecord(body) && isRecord(body.report) ? body.report : null;
  if (!report || typeof report.updatedAt !== 'string') {
    throw new Error('B11 latest response omitted its updatedAt boundary');
  }
  return report.updatedAt;
}

export function actionRequestMatcher(action: B11ResilienceActionKind) {
  return (request: Request): boolean => actionForRequest(request) === action;
}

export function actionRequestEntries(
  session: B11ResilienceSession,
  action: B11ResilienceActionKind,
): NetworkLedgerEntry[] {
  return actionEntries(session.networkEntries(), action);
}

export async function assertActionRequestBoundary(input: {
  request: Request;
  expectedKeys: readonly string[];
  expectedUpdatedAt: string;
  confirm?: true;
}): Promise<void> {
  const body = input.request.postDataJSON() as unknown;
  expect(isRecord(body)).toBe(true);
  if (!isRecord(body)) return;
  expect(Object.keys(body).sort()).toEqual([...input.expectedKeys].sort());
  expect(body.expectedUpdatedAt).toBe(input.expectedUpdatedAt);
  if (input.confirm) expect(body.confirm).toBe(true);
}

export function activeB11Region(page: Page) {
  return page.locator(
    [
      'section[aria-labelledby="clinical-report-workflow-summary-heading"]',
      'section[aria-labelledby="clinical-report-edit-heading"]',
      'section[aria-labelledby="clinical-report-submit-heading"]',
      'section[aria-labelledby="clinical-report-confirm-heading"]',
    ].join(','),
  );
}

export function editForm(page: Page) {
  return page.locator(
    'section[aria-labelledby="clinical-report-edit-heading"]',
  );
}

export function submissionForm(page: Page) {
  return page.locator(
    'section[aria-labelledby="clinical-report-submit-heading"]',
  );
}

export function confirmationForm(page: Page) {
  return page.locator(
    'section[aria-labelledby="clinical-report-confirm-heading"]',
  );
}

export async function openEditDraft(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: '编辑临床人员内容', exact: true })
    .click();
  await expect(editForm(page)).toBeVisible();
}

export async function fillEditDraft(page: Page): Promise<void> {
  await page
    .getByLabel('医生意见（必填）', { exact: true })
    .fill(B11_NEUTRAL_TEXT.opinionA);
  await page
    .getByLabel('临床人员补充建议（可选）', { exact: true })
    .fill(B11_NEUTRAL_TEXT.recommendationA);
  await page
    .getByLabel('本次编辑审计说明（必填）', { exact: true })
    .fill(B11_NEUTRAL_TEXT.editNoteA);
}

export async function openSubmissionDraft(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: '准备提交医生确认', exact: true })
    .click();
  await expect(submissionForm(page)).toBeVisible();
}

export async function fillSubmissionDraft(page: Page): Promise<void> {
  await page
    .getByLabel('提交说明（必填）', { exact: true })
    .fill(B11_NEUTRAL_TEXT.submissionNoteA);
  await page.locator('#clinical-report-submission-confirmed').check();
}

export async function openConfirmationDraft(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: '准备确认报告', exact: true })
    .click();
  await expect(confirmationForm(page)).toBeVisible();
}

export async function fillConfirmationDraft(page: Page): Promise<void> {
  await page
    .getByLabel('最终确认意见（必填）', { exact: true })
    .fill(B11_NEUTRAL_TEXT.confirmationNoteA);
  await page.locator('#clinical-report-confirmation-confirmed').check();
}

export async function auditDraftStorageBoundary(
  page: Page,
): Promise<{
  localStorageClear: true;
  sessionStorageClear: true;
  indexedDbClear: true;
  queryAndHashClear: true;
}> {
  const forbiddenLiterals = Object.values(B11_NEUTRAL_TEXT);
  const result = await page.evaluate(async (literals) => {
    const forbiddenKey =
      /doctorOpinion|recommendationText|editNote|submissionNote|confirmationNote|expectedUpdatedAt|editReceipt|submissionReceipt|confirmationReceipt|workflowDraft|confirmed/i;
    const containsForbidden = (value: unknown): boolean => {
      let serialized = '';
      try {
        serialized = typeof value === 'string' ? value : JSON.stringify(value);
      } catch {
        return true;
      }
      return (
        forbiddenKey.test(serialized) ||
        literals.some((literal) => serialized.includes(literal))
      );
    };
    const localEntries = Object.entries(localStorage);
    const sessionEntries = Object.entries(sessionStorage);
    let indexedDbForbidden = false;
    const databases =
      typeof indexedDB.databases === 'function'
        ? await indexedDB.databases()
        : [];
    for (const databaseInfo of databases) {
      if (!databaseInfo.name) continue;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseInfo.name as string);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const storeNames = [...database.objectStoreNames];
        if (storeNames.length === 0) continue;
        const transaction = database.transaction(storeNames, 'readonly');
        for (const storeName of storeNames) {
          const values = await new Promise<unknown[]>((resolve, reject) => {
            const request = transaction.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          indexedDbForbidden ||=
            containsForbidden(storeName) || values.some(containsForbidden);
        }
      } finally {
        database.close();
      }
    }
    return {
      localStorageForbidden:
        localEntries.some(([key, value]) =>
          containsForbidden({ key, value }),
        ),
      sessionStorageForbidden:
        sessionEntries.some(([key, value]) =>
          containsForbidden({ key, value }),
        ),
      indexedDbForbidden,
      queryAndHashForbidden: containsForbidden(
        `${window.location.search}${window.location.hash}`,
      ),
    };
  }, forbiddenLiterals);
  expect(result).toEqual({
    localStorageForbidden: false,
    sessionStorageForbidden: false,
    indexedDbForbidden: false,
    queryAndHashForbidden: false,
  });
  return {
    localStorageClear: true,
    sessionStorageClear: true,
    indexedDbClear: true,
    queryAndHashClear: true,
  };
}

export type ControlledStalePrecursor = {
  matchedCount: number;
  realStatus: number | null;
  mutatedField: 'updatedAt';
  actionResponsesModified: false;
  dispose: () => Promise<void>;
};

export async function installControlledStalePrecursor(
  page: Page,
): Promise<ControlledStalePrecursor> {
  const audit: ControlledStalePrecursor = {
    matchedCount: 0,
    realStatus: null,
    mutatedField: 'updatedAt',
    actionResponsesModified: false,
    dispose: async () => undefined,
  };
  const handler = async (route: Route): Promise<void> => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (
      audit.matchedCount !== 0 ||
      request.method() !== 'GET' ||
      !pathname.endsWith('/clinical-reports/latest')
    ) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    audit.realStatus = response.status();
    expect(response.status()).toBe(200);
    const body = (await response.json()) as unknown;
    if (!isRecord(body) || !isRecord(body.report)) {
      throw new Error('Controlled stale precursor received an invalid latest response');
    }
    audit.matchedCount = 1;
    await route.fulfill({
      response,
      json: {
        ...body,
        report: {
          ...body.report,
          updatedAt: '2000-01-01T00:00:00.000Z',
        },
      },
    });
  };
  await page.route('**/*', handler);
  audit.dispose = async () => {
    await page.unroute('**/*', handler);
  };
  return audit;
}

export class B11ResilienceSession {
  readonly page: Page;
  private readonly ledger = new NetworkLedger();
  private readonly consoleAudit: ConsoleAudit;
  private readonly corsTasks: Array<Promise<void>> = [];
  private readonly corsChecks: boolean[] = [];
  private readonly supplementalEntries: NetworkLedgerEntry[] = [];
  private finalContract: SessionFinalContract | null = null;
  private initialUpdatedAtValue: string | null = null;
  private siblingLogoutCompleted = false;
  private ledgerDetached = false;
  private consoleStopped = false;

  private readonly onResponse = (response: Response): void => {
    if (!response.url().startsWith(`${this.environment.backendOrigin}/`)) {
      return;
    }
    this.corsTasks.push(
      response.allHeaders().then((headers) => {
        this.corsChecks.push(
          headers['access-control-allow-origin'] ===
            this.environment.frontendOrigin &&
            headers['access-control-allow-credentials'] === 'true',
        );
      }),
    );
  };

  private constructor(
    readonly label: string,
    private readonly descriptor: B11ResilienceRuntimeDescriptor,
    private readonly environment: EnabledB11BrowserEnvironment,
    private readonly contextCookies: () => Promise<Array<{ httpOnly: boolean }>>,
    page: Page,
  ) {
    this.page = page;
    this.consoleAudit = new ConsoleAudit(page);
  }

  static async create(input: {
    label: string;
    descriptor: B11ResilienceRuntimeDescriptor;
    environment: EnabledB11BrowserEnvironment;
    roleContexts: RoleContextFactory;
    contextOptions?: BrowserContextOptions;
    beforeWorkflowNavigation?: (page: Page) => Promise<void>;
  }): Promise<B11ResilienceSession> {
    const roleContext = await input.roleContexts.create(
      input.descriptor.primaryRole,
      input.label,
      input.contextOptions ?? { viewport: { width: 1536, height: 864 } },
    );
    const session = new B11ResilienceSession(
      input.label,
      input.descriptor,
      input.environment,
      () => roleContext.context.cookies(),
      roleContext.page,
    );
    await session.open(input.beforeWorkflowNavigation);
    return session;
  }

  private async open(
    beforeWorkflowNavigation?: (page: Page) => Promise<void>,
  ): Promise<void> {
    await this.ledger.attach(this.page);
    this.page.on('response', this.onResponse);
    await this.page.goto(`${this.environment.frontendOrigin}/login`, {
      waitUntil: 'domcontentloaded',
    });
    const accountInput = this.page.getByLabel('账号', { exact: true });
    const passwordInput = this.page.getByLabel('密码', { exact: true });
    await accountInput.fill(this.descriptor.loginIdentifier);
    await passwordInput.fill(this.environment.fixturePassword);
    const loginResponsePromise = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/auth/login',
    );
    await this.page
      .getByRole('button', { name: '登录系统', exact: true })
      .click();
    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBeGreaterThanOrEqual(200);
    expect(loginResponse.status()).toBeLessThan(300);
    await this.page.waitForURL(`${this.environment.frontendOrigin}/dashboard`);
    expect(
      (await passwordInput.count()) === 0 ||
        (await passwordInput.inputValue()) === '',
    ).toBe(true);

    this.consoleAudit.start();
    await beforeWorkflowNavigation?.(this.page);
    const latestResponsePromise = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname.endsWith('/clinical-reports/latest') &&
        response.status() === 200,
    );
    await this.page.goto(
      `${this.environment.frontendOrigin}${this.descriptor.navigationPath}`,
      { waitUntil: 'domcontentloaded' },
    );
    const latestResponse = await latestResponsePromise;
    this.initialUpdatedAtValue = await readUpdatedAt(latestResponse);
    await expect(
      this.page.getByRole('heading', {
        name: '访视级临床报告',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      this.page.getByRole('heading', {
        name: '报告工作流摘要',
        exact: true,
      }),
    ).toBeVisible();
  }

  initialUpdatedAt(): string {
    if (!this.initialUpdatedAtValue) {
      throw new Error('B11 resilience session has no frozen updatedAt');
    }
    return this.initialUpdatedAtValue;
  }

  networkEntries(): NetworkLedgerEntry[] {
    return [...this.ledger.entries(), ...this.supplementalEntries].map(
      (entry) => ({ ...entry, bodyKeys: [...entry.bodyKeys] }),
    );
  }

  latestRequestCount(): number {
    return latestEntries(this.networkEntries()).length;
  }

  async waitForLatestRequestCount(count: number): Promise<void> {
    await expect.poll(() => this.latestRequestCount()).toBe(count);
  }

  async performAction(
    action: B11ResilienceActionKind,
    trigger: () => Promise<void>,
  ): Promise<number> {
    const responsePromise = this.page.waitForResponse(
      (response) => actionForRequest(response.request()) === action,
    );
    await trigger();
    return (await responsePromise).status();
  }

  setFinalContract(contract: SessionFinalContract): void {
    if (this.finalContract) {
      throw new Error('B11 resilience final contract was already set');
    }
    this.finalContract = contract;
  }

  async logoutThroughSiblingPage(): Promise<number> {
    const sibling = await this.page.context().newPage();
    const siblingLedger = new NetworkLedger();
    await siblingLedger.attach(sibling);
    try {
      await sibling.goto(`${this.environment.frontendOrigin}/dashboard`, {
        waitUntil: 'domcontentloaded',
      });
      const logoutButton = sibling.getByRole('button', {
        name: '退出登录',
        exact: true,
      });
      await expect(logoutButton).toBeVisible();
      const responsePromise = sibling.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/auth/logout',
      );
      await logoutButton.click();
      const response = await responsePromise;
      await sibling.waitForURL(`${this.environment.frontendOrigin}/login`);
      expect(response.status()).toBeGreaterThanOrEqual(200);
      expect(response.status()).toBeLessThan(300);
      this.siblingLogoutCompleted = true;
      return response.status();
    } finally {
      const summary = await siblingLedger.detach();
      this.supplementalEntries.push(...summary.entries);
      await sibling.close();
    }
  }

  private async logoutViaUi(): Promise<'succeeded'> {
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/auth/logout',
    );
    await this.page
      .getByRole('button', { name: '退出登录', exact: true })
      .click();
    const response = await responsePromise;
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(300);
    await this.page.waitForURL(`${this.environment.frontendOrigin}/login`);
    return 'succeeded';
  }

  private stopConsole() {
    if (this.consoleStopped) return this.consoleAudit.summary();
    this.consoleStopped = true;
    return this.consoleAudit.stop();
  }

  private async detachLedger() {
    if (this.ledgerDetached) return this.ledger.summary();
    this.page.off('response', this.onResponse);
    this.ledgerDetached = true;
    return this.ledger.detach();
  }

  async collect(): Promise<Record<string, unknown>> {
    if (!this.finalContract) {
      throw new Error('B11 resilience session omitted its final contract');
    }
    const runtimeStorage = await auditRuntimeStorage(this.page);
    expect(runtimeStorage.localStorageKeys).toEqual([]);
    expect(runtimeStorage.sessionStorageKeys).toEqual([]);
    expect(runtimeStorage.indexedDbNames).toEqual([]);
    expect(runtimeStorage.forbiddenValueDetected).toBe(false);
    expect(runtimeStorage.documentCookieEmpty).toBe(true);
    expect(runtimeStorage.documentCookieForbiddenPatternDetected).toBe(false);
    expect(runtimeStorage.urlHasSensitiveQueryOrHash).toBe(false);
    const currentUrl = new URL(this.page.url());
    expect(currentUrl.search).toBe('');
    expect(currentUrl.hash).toBe('');
    const domPrivacy = await auditB11DomPrivacy(this.page);

    const consoleSummary = this.stopConsole();
    expect(consoleSummary.warningCount).toBe(0);
    expect(consoleSummary.errorCount).toBe(
      this.finalContract.expectedConsoleErrors,
    );
    expect(consoleSummary.pageErrorCount).toBe(0);
    expect(consoleSummary.categories).toEqual(
      this.finalContract.expectedConsoleErrors === 0
        ? []
        : [
            {
              category: 'network',
              count: this.finalContract.expectedConsoleErrors,
            },
          ],
    );

    const cookiesBeforeLogout = await this.contextCookies();
    if (this.finalContract.logout === 'ui') {
      expect(cookiesBeforeLogout.some(({ httpOnly }) => httpOnly)).toBe(true);
      await this.logoutViaUi();
    } else {
      expect(this.siblingLogoutCompleted).toBe(true);
      expect(cookiesBeforeLogout.some(({ httpOnly }) => httpOnly)).toBe(false);
      await expect(
        this.page.getByLabel('账号', { exact: true }),
      ).toBeVisible();
    }
    expect(
      (await this.contextCookies()).some(({ httpOnly }) => httpOnly),
    ).toBe(false);

    await Promise.all(this.corsTasks);
    expect(this.corsChecks.length).toBeGreaterThan(0);
    expect(this.corsChecks.every(Boolean)).toBe(true);

    await this.detachLedger();
    const entries = this.networkEntries();
    const latest = latestEntries(entries);
    expect(latest.length).toBeGreaterThanOrEqual(
      this.finalContract.latest.minimum,
    );
    expect(latest.length).toBeLessThanOrEqual(
      this.finalContract.latest.maximum,
    );

    const actionSummary: Record<string, unknown> = {};
    for (const action of Object.keys(ACTION_SUFFIX) as B11ResilienceActionKind[]) {
      const actionContract = this.finalContract.actions?.[action] ?? {
        count: 0,
        status: null,
        bodyKeys: [],
        aborted: false,
      };
      const matching = actionEntries(entries, action);
      expect(matching).toHaveLength(actionContract.count);
      if (actionContract.count > 0) {
        expect(matching.map(({ bodyKeys }) => bodyKeys)).toEqual(
          Array.from({ length: actionContract.count }, () =>
            [...actionContract.bodyKeys].sort(),
          ),
        );
        expect(matching.map(({ status }) => status)).toEqual(
          Array.from({ length: actionContract.count }, () =>
            actionContract.status,
          ),
        );
        expect(
          matching.every(({ failureReason }) =>
            actionContract.aborted
              ? failureReason === 'aborted'
              : failureReason === null,
          ),
        ).toBe(true);
      }
      actionSummary[action] = {
        count: matching.length,
        status: matching[0]?.status ?? null,
        initiator: matching[0]?.initiator ?? null,
        bodyKeys: matching[0]?.bodyKeys ?? [],
        abort: matching.some(({ failureReason }) =>
          failureReason === 'aborted'),
        retry: false,
      };
    }
    expect(entries.filter(isSiblingWrite)).toHaveLength(0);
    expect(entries.filter(isUnrelatedOutput)).toHaveLength(0);

    return {
      label: this.label,
      role: this.descriptor.primaryRole,
      login: 'passed',
      logout: 'succeeded',
      latest: {
        count: latest.length,
        polling: false,
      },
      actions: actionSummary,
      authMe: {
        count: entries.filter(
          (entry) =>
            entry.method === 'GET' && entry.safeUrlPattern === '/auth/me',
        ).length,
      },
      logoutRequests: entries.filter(
        (entry) =>
          entry.method === 'POST' &&
          entry.safeUrlPattern === '/auth/logout',
      ).length,
      a22ToA25WriteRequestCount: 0,
      outputSignatureAiRequestCount: 0,
      network: groupNetworkEntries(entries),
      console: {
        warningCount: 0,
        errorCount: this.finalContract.expectedConsoleErrors,
        pageErrorCount: 0,
        correlation: 'expected_network_events_only',
      },
      storage: 'clear',
      cookie: 'http_only_session_then_cleared',
      cors: 'passed',
      url: 'safe_path_without_query_or_hash',
      domPrivacy,
    };
  }

  async bestEffortLogout(): Promise<'succeeded' | 'not_authenticated' | 'failed'> {
    try {
      if (this.siblingLogoutCompleted) return 'not_authenticated';
      if (
        await this.page
          .getByRole('button', { name: '退出登录', exact: true })
          .isVisible()
          .catch(() => false)
      ) {
        await this.logoutViaUi();
        return 'succeeded';
      }
      return 'not_authenticated';
    } catch {
      return 'failed';
    } finally {
      this.stopConsole();
      await this.detachLedger().catch(() => undefined);
    }
  }
}

export class B11ResilienceRouteRun {
  private readonly sessions: B11ResilienceSession[] = [];
  private readonly evidence: Record<string, unknown> = {};

  constructor(
    readonly target: B11ResilienceRouteTarget,
    private readonly descriptor: B11ResilienceRuntimeDescriptor,
    private readonly environment: EnabledB11BrowserEnvironment,
    private readonly roleContexts: RoleContextFactory,
  ) {}

  async primary(input: {
    contextOptions?: BrowserContextOptions;
    beforeWorkflowNavigation?: (page: Page) => Promise<void>;
  } = {}): Promise<B11ResilienceSession> {
    if (this.sessions.some(({ label }) => label === 'primary')) {
      throw new Error('B11 resilience primary Session already exists');
    }
    return this.createSession('primary', input);
  }

  async createSession(
    label: string,
    input: {
      contextOptions?: BrowserContextOptions;
      beforeWorkflowNavigation?: (page: Page) => Promise<void>;
    } = {},
  ): Promise<B11ResilienceSession> {
    const session = await B11ResilienceSession.create({
      label,
      descriptor: this.descriptor,
      environment: this.environment,
      roleContexts: this.roleContexts,
      ...input,
    });
    this.sessions.push(session);
    return session;
  }

  recordEvidence(key: string, value: unknown): void {
    if (Object.hasOwn(this.evidence, key)) {
      throw new Error('B11 resilience evidence key was already recorded');
    }
    this.evidence[key] = value;
  }

  async collect() {
    const summaries: Array<Record<string, unknown>> = [];
    for (const session of this.sessions) summaries.push(await session.collect());
    return { sessions: summaries, evidence: this.evidence };
  }

  async cleanupAfterFailure() {
    return Promise.all(
      this.sessions.map(async (session) => ({
        logout: await session.bestEffortLogout(),
      })),
    );
  }
}

export async function coordinateForbiddenRoleStage(): Promise<void> {
  const root = b11RuntimeRoot();
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('B11 runtime root failed the Stage marker safety gate');
  }
  const request = b11ForbiddenRoleStageMarkerPath('request');
  const completed = b11ForbiddenRoleStageMarkerPath('completed');
  if (path.dirname(request) !== root || path.dirname(completed) !== root) {
    throw new Error('B11 Stage marker escaped its fixed runtime root');
  }
  await writeFile(request, 'ready\n', { encoding: 'utf8', flag: 'wx' });
  console.log('B11_FORBIDDEN_STAGE_REQUEST_READY');
  try {
    await expect
      .poll(
        async () =>
          lstat(completed)
            .then((stat) => stat.isFile() && !stat.isSymbolicLink())
            .catch(() => false),
        { timeout: 60_000 },
      )
      .toBe(true);
  } finally {
    await unlink(request).catch(() => undefined);
    await unlink(completed).catch(() => undefined);
  }
}

export async function runB11ResilienceRoute(
  input: {
    environment: EnabledB11BrowserEnvironment;
    roleContexts: RoleContextFactory;
    target: B11ResilienceRouteTarget;
  },
  exercise: (run: B11ResilienceRouteRun) => Promise<void>,
): Promise<void> {
  const descriptor = await readB11ResilienceRuntimeDescriptor(input.target);
  const routeKey = `${input.target.scenarioKey}/${input.target.routeKey}`;
  const auditIds = AUDIT_IDS[routeKey];
  if (!auditIds) throw new Error('B11 resilience route has no audit mapping');
  const run = new B11ResilienceRouteRun(
    input.target,
    descriptor,
    input.environment,
    input.roleContexts,
  );
  let completed = false;
  try {
    await exercise(run);
    const result = await run.collect();
    const closed = await input.roleContexts.closeAll();
    expect(closed.activeContextCount).toBe(0);
    expect(await deleteB11ResilienceRuntimeDescriptor(input.target)).toBe(true);
    completed = true;
    console.log(
      `B11_RESILIENCE_ROUTE ${safeJsonStringify(
        {
          profile: 'resilience-security',
          scenarioKey: input.target.scenarioKey,
          routeKey: input.target.routeKey,
          auditIds,
          mutationClass: 'none',
          sessionCount: result.sessions.length,
          isolatedContexts: true,
          contextsClosed: true,
          runtimeDescriptorDeleted: true,
          workers: 1,
          retries: 0,
          artifacts: {
            trace: false,
            video: false,
            screenshot: false,
            html: false,
          },
          databaseBoundaryClear: input.environment.databaseBoundaryClear,
          ...result,
        },
        [
          input.environment.fixturePassword,
          descriptor.loginIdentifier,
          descriptor.navigationPath,
          ...Object.values(B11_NEUTRAL_TEXT),
        ],
      )}`,
    );
  } finally {
    if (!completed) {
      const logout = await run.cleanupAfterFailure();
      const contextsClosed = await input.roleContexts
        .closeAll()
        .then(({ activeContextCount }) => activeContextCount === 0)
        .catch(() => false);
      const runtimeDescriptorDeleted =
        await deleteB11ResilienceRuntimeDescriptor(input.target).catch(
          () => false,
        );
      const failureArtifactsRemoved = await removeCurrentB11TestOutput().catch(
        () => false,
      );
      console.log(
        `B11_RESILIENCE_FAILURE_CLEANUP ${safeJsonStringify({
          logout,
          contextsClosed,
          runtimeDescriptorDeleted,
          failureArtifactsRemoved,
        })}`,
      );
    } else {
      await removeCurrentB11TestOutput().catch(() => false);
    }
  }
}
