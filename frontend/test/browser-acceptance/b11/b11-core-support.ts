import {
  access,
  open,
  unlink,
} from 'node:fs/promises';
import type {
  Page,
  Request,
  Response,
} from '@playwright/test';

import type { B11BrowserEnvironment } from './b11-env';
import {
  b11StageMarkerPath,
  deleteB11CoreRuntimeDescriptor,
  readB11CoreRuntimeDescriptor,
  type B11CoreRouteTarget,
  type B11CoreRuntimeDescriptor,
} from './b11-runtime-descriptor';
import { BeforeUnloadEvidence } from '../support/beforeunload-evidence';
import {
  NetworkLedger,
  type NetworkLedgerEntry,
} from '../support/network-ledger';
import {
  ConsoleAudit,
  auditRuntimeStorage,
} from '../support/runtime-audit';
import {
  safeJsonStringify,
  sanitizeBodyKeys,
} from '../support/safe-output';
import type {
  AcceptanceRole,
  RoleContextFactory,
} from '../support/role-context-factory';
import { expect } from '../support/acceptance-test';

type EnabledB11BrowserEnvironment = Extract<
  B11BrowserEnvironment,
  { enabled: true }
>;

export type B11ActionKind = 'edit' | 'submit' | 'confirm';

type SafeReportFacts = {
  status: string | null;
  source: string | null;
  qualityStatus: string | null;
  isFinal: boolean | null;
  editReceiptPresent: boolean;
  submissionReceiptPresent: boolean;
  confirmationReceiptPresent: boolean;
  alreadySubmitted: boolean | null;
  alreadyConfirmed: boolean | null;
  confirmationIdPresent: boolean | null;
};

type LatestFacts = {
  updatedAt: string;
  status: string | null;
  source: string | null;
  qualityStatus: string | null;
  isFinal: boolean | null;
};

type ActionRequestEvidence = {
  action: B11ActionKind;
  bodyKeys: string[];
  expectedUpdatedAtMatchesLatest: boolean;
  confirmIsTrue: boolean | null;
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

type DomPrivacySummary = {
  forbiddenSerializedFieldDetected: false;
  primaryInternalIdDetected: false;
  sensitiveAttributeDetected: false;
};

export type B11SessionSummary = {
  label: string;
  role: AcceptanceRole;
  login: 'passed';
  logout: 'passed';
  workflowAuthMeRequestCount: 1;
  latestFacts: Array<Omit<LatestFacts, 'updatedAt'>>;
  actionResponses: SafeReportFacts[];
  actionRequests: ActionRequestEvidence[];
  network: {
    latestReadCount: number;
    editRequestCount: number;
    submitRequestCount: number;
    confirmRequestCount: number;
    authMeRequestCount: number;
    a22ToA25WriteRequestCount: 0;
    unrelatedOutputRequestCount: 0;
    abortedRequestCount: number;
    automaticRetryDetected: false;
    pollingDetected: false;
    entries: SafeNetworkGroup[];
  };
  console: {
    warningCount: 0;
    errorCount: number;
    pageErrorCount: 0;
    expectedActionFailureCount: number;
    expectedSiblingReadFailureCount: number;
    unexpectedErrorCount: 0;
  };
  storage: 'clear';
  cookie: 'http_only_session_then_cleared';
  cors: 'passed';
  url: 'safe_path_without_query_or_hash';
  domPrivacy: DomPrivacySummary;
};

export const B11_NEUTRAL_TEXT = {
  opinionA: 'B11 neutral opinion alpha with no clinical meaning.',
  opinionB: 'B11 neutral opinion beta with no clinical meaning.',
  opinionC: 'B11 neutral opinion gamma with no clinical meaning.',
  recommendationA: 'B11 neutral recommendation alpha with no clinical meaning.',
  recommendationB: 'B11 neutral recommendation beta with no clinical meaning.',
  recommendationC: 'B11 neutral recommendation gamma with no clinical meaning.',
  editNoteA: 'B11 neutral edit note alpha with no clinical meaning.',
  editNoteB: 'B11 neutral edit note beta with no clinical meaning.',
  editNoteC: 'B11 neutral edit note gamma with no clinical meaning.',
  submissionNoteA:
    'B11 neutral submission note alpha with no clinical meaning.',
  submissionNoteB:
    'B11 neutral submission note beta with no clinical meaning.',
  confirmationNoteA:
    'B11 neutral confirmation note alpha with no clinical meaning.',
  confirmationNoteB:
    'B11 neutral confirmation note beta with no clinical meaning.',
} as const;

const ACTION_SUFFIX: Record<B11ActionKind, string> = {
  edit: '/draft',
  submit: '/submit-confirmation',
  confirm: '/confirm',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function safeBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function requestAction(request: Request): B11ActionKind | null {
  const pathname = new URL(request.url()).pathname;
  if (
    request.method() === 'PATCH' &&
    pathname.includes('/clinical-reports/') &&
    pathname.endsWith(ACTION_SUFFIX.edit)
  ) {
    return 'edit';
  }
  if (
    request.method() === 'POST' &&
    pathname.includes('/clinical-reports/') &&
    pathname.endsWith(ACTION_SUFFIX.submit)
  ) {
    return 'submit';
  }
  if (
    request.method() === 'POST' &&
    pathname.includes('/clinical-reports/') &&
    pathname.endsWith(ACTION_SUFFIX.confirm)
  ) {
    return 'confirm';
  }
  return null;
}

function responseMatchesAction(
  response: Response,
  action: B11ActionKind,
): boolean {
  const request = response.request();
  return requestAction(request) === action;
}

function latestResponse(response: Response): boolean {
  return (
    response.request().method() === 'GET' &&
    new URL(response.url()).pathname.endsWith('/clinical-reports/latest')
  );
}

function mutation(entry: NetworkLedgerEntry): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(entry.method);
}

function a22ToA25Write(entry: NetworkLedgerEntry): boolean {
  return (
    mutation(entry) &&
    /\/clinical-reports\/<id>\/(?:lock|freeze-sources|archive|corrections)$/.test(
      entry.safeUrlPattern,
    )
  );
}

function unrelatedOutputRequest(entry: NetworkLedgerEntry): boolean {
  return /(?:pdf|print|download|signature|\bai\b|llm)/i.test(
    entry.safeUrlPattern,
  );
}

function relevantEntry(entry: NetworkLedgerEntry): boolean {
  return (
    entry.safeUrlPattern === '/auth/me' ||
    entry.safeUrlPattern.includes('/clinical-reports') ||
    unrelatedOutputRequest(entry)
  );
}

function groupNetworkEntries(
  entries: readonly NetworkLedgerEntry[],
): SafeNetworkGroup[] {
  const groups = new Map<string, SafeNetworkGroup>();
  for (const entry of entries.filter(relevantEntry)) {
    const value: SafeNetworkGroup = {
      method: entry.method,
      status: entry.status,
      initiator: entry.initiator,
      initiatorSource: entry.initiatorSource,
      failureReason: entry.failureReason,
      safeUrlPattern: entry.safeUrlPattern,
      bodyKeys: [...entry.bodyKeys],
      count: 1,
    };
    const key = JSON.stringify(value);
    const current = groups.get(key);
    if (current) current.count += 1;
    else groups.set(key, value);
  }
  return [...groups.values()].sort(
    (left, right) =>
      left.safeUrlPattern.localeCompare(right.safeUrlPattern) ||
      left.method.localeCompare(right.method) ||
      (left.status ?? -1) - (right.status ?? -1),
  );
}

async function parseLatestFacts(response: Response): Promise<LatestFacts> {
  const body = (await response.json()) as unknown;
  const report = isRecord(body) && isRecord(body.report) ? body.report : {};
  const updatedAt = safeString(report.updatedAt);
  if (!updatedAt) {
    throw new Error('B11 latest response omitted its server updatedAt fact');
  }
  return {
    updatedAt,
    status: safeString(report.status),
    source: safeString(report.source),
    qualityStatus: safeString(report.qualityStatus),
    isFinal: safeBoolean(report.isFinal),
  };
}

async function parseSafeReportFacts(
  response: Response,
): Promise<SafeReportFacts> {
  if (response.status() < 200 || response.status() >= 300) {
    return {
      status: null,
      source: null,
      qualityStatus: null,
      isFinal: null,
      editReceiptPresent: false,
      submissionReceiptPresent: false,
      confirmationReceiptPresent: false,
      alreadySubmitted: null,
      alreadyConfirmed: null,
      confirmationIdPresent: null,
    };
  }
  const body = (await response.json()) as unknown;
  const envelope = isRecord(body) ? body : {};
  const report = isRecord(envelope.report) ? envelope.report : {};
  const submissionReceipt = isRecord(envelope.submissionReceipt)
    ? envelope.submissionReceipt
    : null;
  const confirmationReceipt = isRecord(envelope.confirmationReceipt)
    ? envelope.confirmationReceipt
    : null;
  return {
    status: safeString(report.status),
    source: safeString(report.source),
    qualityStatus: safeString(report.qualityStatus),
    isFinal: safeBoolean(report.isFinal),
    editReceiptPresent: isRecord(envelope.editReceipt),
    submissionReceiptPresent: submissionReceipt !== null,
    confirmationReceiptPresent: confirmationReceipt !== null,
    alreadySubmitted: submissionReceipt
      ? safeBoolean(submissionReceipt.alreadySubmitted)
      : null,
    alreadyConfirmed: confirmationReceipt
      ? safeBoolean(confirmationReceipt.alreadyConfirmed)
      : null,
    confirmationIdPresent: confirmationReceipt
      ? typeof confirmationReceipt.confirmationId === 'string' &&
        confirmationReceipt.confirmationId.length > 0
      : null,
  };
}

async function auditDomPrivacy(page: Page): Promise<DomPrivacySummary> {
  const result = await page.evaluate(() => {
    const objectId = /\b[a-f\d]{24}\b/i;
    const uuid =
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
    const dynamicId = (value: string) => objectId.test(value) || uuid.test(value);
    const bodyText = document.body.innerText;
    const forbiddenSerializedFieldDetected =
      /previousValues|nextValues|signatureText|["'{\s]metadata\s*[:=]/i.test(
        bodyText,
      );
    const primaryInternalIdDetected = [
      ...document.querySelectorAll(
        'h1,h2,h3,h4,h5,h6,button,label,[role="button"],[role="link"]',
      ),
    ].some((node) => dynamicId(node.textContent ?? ''));
    const sensitiveAttributeDetected = [...document.querySelectorAll('*')].some(
      (node) =>
        [...node.attributes].some(
          (attribute) =>
            (attribute.name === 'title' ||
              attribute.name.startsWith('aria-') ||
              attribute.name.startsWith('data-')) &&
            (dynamicId(attribute.value) ||
              /previousValues|nextValues|signatureText|metadata/i.test(
                attribute.value,
              )),
        ),
    );
    return {
      forbiddenSerializedFieldDetected,
      primaryInternalIdDetected,
      sensitiveAttributeDetected,
    };
  });
  expect(result).toEqual({
    forbiddenSerializedFieldDetected: false,
    primaryInternalIdDetected: false,
    sensitiveAttributeDetected: false,
  });
  return result as DomPrivacySummary;
}

export class B11BrowserSession {
  readonly page: Page;
  private readonly ledger = new NetworkLedger();
  private readonly consoleAudit: ConsoleAudit;
  private readonly corsChecks: Promise<boolean>[] = [];
  private readonly latestFacts: LatestFacts[] = [];
  private readonly captureTasks: Promise<void>[] = [];
  private readonly actionRequests: ActionRequestEvidence[] = [];
  private readonly actionResponses: SafeReportFacts[] = [];
  private readonly actionResponseStatuses: number[] = [];
  private readonly explicitActionCounts: Record<B11ActionKind, number> = {
    edit: 0,
    submit: 0,
    confirm: 0,
  };
  private authMeBeforeWorkflow = 0;
  private authMeAfterWorkflow = 0;
  private collected = false;

  private readonly onRequest = (request: Request): void => {
    const action = requestAction(request);
    if (!action) return;
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = request.postDataJSON();
      if (isRecord(parsed)) body = parsed;
    } catch {
      body = {};
    }
    const latest = this.latestFacts.at(-1);
    this.actionRequests.push({
      action,
      bodyKeys: sanitizeBodyKeys(Object.keys(body)),
      expectedUpdatedAtMatchesLatest:
        typeof body.expectedUpdatedAt === 'string' &&
        body.expectedUpdatedAt === latest?.updatedAt,
      confirmIsTrue:
        action === 'edit' ? null : body.confirm === true,
    });
  };

  private readonly onResponse = (response: Response): void => {
    if (response.url().startsWith(`${this.environment.backendOrigin}/`)) {
      this.corsChecks.push(
        response
          .allHeaders()
          .then(
            (headers) =>
              headers['access-control-allow-origin'] ===
                this.environment.frontendOrigin &&
              headers['access-control-allow-credentials'] === 'true',
          ),
      );
    }
    if (latestResponse(response) && response.status() === 200) {
      this.captureTasks.push(
        parseLatestFacts(response).then((facts) => {
          this.latestFacts.push(facts);
        }),
      );
    }
  };

  private constructor(
    readonly label: string,
    readonly role: AcceptanceRole,
    private readonly loginIdentifier: string,
    private readonly descriptor: B11CoreRuntimeDescriptor,
    private readonly environment: EnabledB11BrowserEnvironment,
    private readonly contextCookies: () => Promise<
      Array<{ httpOnly: boolean }>
    >,
    page: Page,
  ) {
    this.page = page;
    this.consoleAudit = new ConsoleAudit(page);
  }

  static async create(input: {
    label: string;
    role: AcceptanceRole;
    loginIdentifier: string;
    descriptor: B11CoreRuntimeDescriptor;
    environment: EnabledB11BrowserEnvironment;
    roleContexts: RoleContextFactory;
  }): Promise<B11BrowserSession> {
    const roleContext = await input.roleContexts.create(
      input.role,
      input.label,
      { viewport: { width: 1536, height: 864 } },
    );
    const session = new B11BrowserSession(
      input.label,
      input.role,
      input.loginIdentifier,
      input.descriptor,
      input.environment,
      () => roleContext.context.cookies(),
      roleContext.page,
    );
    await session.open();
    return session;
  }

  private async flushCaptures(): Promise<void> {
    while (this.captureTasks.length > 0) {
      const tasks = this.captureTasks.splice(0);
      await Promise.all(tasks);
    }
  }

  private async open(): Promise<void> {
    await this.ledger.attach(this.page);
    this.page.on('request', this.onRequest);
    this.page.on('response', this.onResponse);

    await this.page.goto(`${this.environment.frontendOrigin}/login`, {
      waitUntil: 'domcontentloaded',
    });
    const accountInput = this.page.getByLabel('账号', { exact: true });
    const passwordInput = this.page.getByLabel('密码', { exact: true });
    await expect(accountInput).toBeVisible();
    await accountInput.fill(this.loginIdentifier);
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
    await this.page.waitForLoadState('networkidle', { timeout: 10_000 });

    this.authMeBeforeWorkflow = this.ledger.count({
      method: 'GET',
      safeUrlPattern: '/auth/me',
    });
    this.consoleAudit.start();
    const latestResponsePromise = this.page.waitForResponse(
      (response) => latestResponse(response) && response.status() === 200,
    );
    await this.page.goto(
      `${this.environment.frontendOrigin}${this.descriptor.navigationPath}`,
      { waitUntil: 'domcontentloaded' },
    );
    await latestResponsePromise;
    await this.flushCaptures();
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
    await this.page.waitForLoadState('networkidle', { timeout: 10_000 });
    this.authMeAfterWorkflow = this.ledger.count({
      method: 'GET',
      safeUrlPattern: '/auth/me',
    });
    expect(this.authMeAfterWorkflow - this.authMeBeforeWorkflow).toBe(1);
    expect(this.latestFacts).toHaveLength(1);
  }

  latestCount(): number {
    return this.latestFacts.length;
  }

  initialUpdatedAt(): string {
    const value = this.latestFacts[0]?.updatedAt;
    if (!value) throw new Error('B11 session has no frozen opening updatedAt');
    return value;
  }

  latestUpdatedAt(): string {
    const value = this.latestFacts.at(-1)?.updatedAt;
    if (!value) throw new Error('B11 session has no current updatedAt');
    return value;
  }

  latestSafeFacts(): Omit<LatestFacts, 'updatedAt'> {
    const facts = this.latestFacts.at(-1);
    if (!facts) throw new Error('B11 session has no latest report facts');
    return {
      status: facts.status,
      source: facts.source,
      qualityStatus: facts.qualityStatus,
      isFinal: facts.isFinal,
    };
  }

  async waitForLatestCount(count: number): Promise<void> {
    await expect
      .poll(async () => {
        await this.flushCaptures();
        return this.latestFacts.length;
      })
      .toBe(count);
  }

  async performAction(
    action: B11ActionKind,
    trigger: () => Promise<void>,
  ): Promise<{ status: number; facts: SafeReportFacts }> {
    this.explicitActionCounts[action] += 1;
    const responsePromise = this.page.waitForResponse((response) =>
      responseMatchesAction(response, action),
    );
    await trigger();
    const response = await responsePromise;
    const facts = await parseSafeReportFacts(response);
    this.actionResponseStatuses.push(response.status());
    this.actionResponses.push(facts);
    return { status: response.status(), facts };
  }

  actionRequestEvidence(action: B11ActionKind): ActionRequestEvidence[] {
    return this.actionRequests
      .filter((entry) => entry.action === action)
      .map((entry) => ({ ...entry, bodyKeys: [...entry.bodyKeys] }));
  }

  async collect(): Promise<B11SessionSummary> {
    if (this.collected) throw new Error('B11 session was collected twice');
    this.collected = true;
    await this.flushCaptures();
    const storage = await auditRuntimeStorage(this.page);
    expect(storage.localStorageKeys).toEqual([]);
    expect(storage.sessionStorageKeys).toEqual([]);
    expect(storage.indexedDbNames).toEqual([]);
    expect(storage.forbiddenValueDetected).toBe(false);
    expect(storage.documentCookieEmpty).toBe(true);
    expect(storage.documentCookieForbiddenPatternDetected).toBe(false);
    expect(storage.urlHasSensitiveQueryOrHash).toBe(false);
    const currentUrl = new URL(this.page.url());
    expect(currentUrl.search).toBe('');
    expect(currentUrl.hash).toBe('');
    const domPrivacy = await auditDomPrivacy(this.page);
    expect((await this.contextCookies()).some(({ httpOnly }) => httpOnly)).toBe(
      true,
    );

    const consoleSummary = this.consoleAudit.stop();
    const expectedActionFailureCount = this.actionResponseStatuses.filter(
      (status) => status >= 400,
    ).length;
    const expectedSiblingReadFailureCount = this.ledger
      .entries()
      .filter(
        ({ method, status, failureReason, safeUrlPattern }) =>
          method === 'GET' &&
          status === 404 &&
          failureReason === null &&
          safeUrlPattern.endsWith('/score-results/latest'),
      ).length;
    const expectedNetworkConsoleErrorCount =
      expectedActionFailureCount + expectedSiblingReadFailureCount;
    expect(consoleSummary.warningCount).toBe(0);
    expect(consoleSummary.errorCount).toBe(expectedNetworkConsoleErrorCount);
    expect(consoleSummary.pageErrorCount).toBe(0);
    expect(consoleSummary.categories).toEqual(
      expectedNetworkConsoleErrorCount === 0
        ? []
        : [{ category: 'network', count: expectedNetworkConsoleErrorCount }],
    );

    const logoutResponsePromise = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/auth/logout',
    );
    await this.page
      .getByRole('button', { name: '退出登录', exact: true })
      .click();
    const logoutResponse = await logoutResponsePromise;
    expect(logoutResponse.status()).toBeGreaterThanOrEqual(200);
    expect(logoutResponse.status()).toBeLessThan(300);
    await this.page.waitForURL(`${this.environment.frontendOrigin}/login`);
    expect((await this.contextCookies()).some(({ httpOnly }) => httpOnly)).toBe(
      false,
    );
    await this.page.waitForLoadState('networkidle', { timeout: 10_000 });
    const corsChecks = await Promise.all(this.corsChecks);
    expect(corsChecks.length).toBeGreaterThan(0);
    expect(corsChecks.every(Boolean)).toBe(true);

    this.page.off('request', this.onRequest);
    this.page.off('response', this.onResponse);
    const network = await this.ledger.detach();
    const entries = network.entries;
    const latestReads = entries.filter(
      (entry) =>
        entry.method === 'GET' &&
        entry.safeUrlPattern.endsWith('/clinical-reports/latest'),
    );
    const actionCounts = {
      edit: entries.filter(
        (entry) =>
          entry.method === 'PATCH' &&
          entry.safeUrlPattern.endsWith(ACTION_SUFFIX.edit),
      ).length,
      submit: entries.filter(
        (entry) =>
          entry.method === 'POST' &&
          entry.safeUrlPattern.endsWith(ACTION_SUFFIX.submit),
      ).length,
      confirm: entries.filter(
        (entry) =>
          entry.method === 'POST' &&
          entry.safeUrlPattern.endsWith(ACTION_SUFFIX.confirm),
      ).length,
    };
    expect(actionCounts).toEqual(this.explicitActionCounts);
    expect(latestReads.length).toBeGreaterThanOrEqual(1);
    expect(latestReads.length).toBeLessThanOrEqual(2);
    const forbiddenWrites = entries.filter(a22ToA25Write);
    const unrelatedOutputs = entries.filter(unrelatedOutputRequest);
    expect(forbiddenWrites).toHaveLength(0);
    expect(unrelatedOutputs).toHaveLength(0);
    expect(
      this.actionRequests.every(
        ({ expectedUpdatedAtMatchesLatest, confirmIsTrue }) =>
          expectedUpdatedAtMatchesLatest && confirmIsTrue !== false,
      ),
    ).toBe(true);

    return {
      label: this.label,
      role: this.role,
      login: 'passed',
      logout: 'passed',
      workflowAuthMeRequestCount: 1,
      latestFacts: this.latestFacts.map(
        ({ status, source, qualityStatus, isFinal }) => ({
          status,
          source,
          qualityStatus,
          isFinal,
        }),
      ),
      actionResponses: this.actionResponses,
      actionRequests: this.actionRequests,
      network: {
        latestReadCount: latestReads.length,
        editRequestCount: actionCounts.edit,
        submitRequestCount: actionCounts.submit,
        confirmRequestCount: actionCounts.confirm,
        authMeRequestCount: entries.filter(
          (entry) =>
            entry.method === 'GET' && entry.safeUrlPattern === '/auth/me',
        ).length,
        a22ToA25WriteRequestCount: 0,
        unrelatedOutputRequestCount: 0,
        abortedRequestCount: entries.filter(
          ({ failureReason }) => failureReason !== null,
        ).length,
        automaticRetryDetected: false,
        pollingDetected: false,
        entries: groupNetworkEntries(entries),
      },
      console: {
        warningCount: 0,
        errorCount: expectedNetworkConsoleErrorCount,
        pageErrorCount: 0,
        expectedActionFailureCount,
        expectedSiblingReadFailureCount,
        unexpectedErrorCount: 0,
      },
      storage: 'clear',
      cookie: 'http_only_session_then_cleared',
      cors: 'passed',
      url: 'safe_path_without_query_or_hash',
      domPrivacy,
    };
  }

  async bestEffortLogout(): Promise<void> {
    if (this.collected || this.page.isClosed()) return;
    const logout = this.page.getByRole('button', {
      name: '退出登录',
      exact: true,
    });
    if (await logout.isVisible().catch(() => false)) {
      await logout.click().catch(() => undefined);
      await this.page
        .waitForURL(`${this.environment.frontendOrigin}/login`, {
          timeout: 5_000,
        })
        .catch(() => undefined);
    }
  }
}

export class B11RouteRun {
  private primarySession: B11BrowserSession | null = null;
  private secondarySession: B11BrowserSession | null = null;

  constructor(
    readonly target: B11CoreRouteTarget,
    private readonly descriptor: B11CoreRuntimeDescriptor,
    private readonly environment: EnabledB11BrowserEnvironment,
    private readonly roleContexts: RoleContextFactory,
  ) {}

  async primary(): Promise<B11BrowserSession> {
    if (!this.primarySession) {
      this.primarySession = await B11BrowserSession.create({
        label: 'primary',
        role: this.descriptor.primaryRole,
        loginIdentifier: this.descriptor.loginIdentifier,
        descriptor: this.descriptor,
        environment: this.environment,
        roleContexts: this.roleContexts,
      });
    }
    return this.primarySession;
  }

  async secondary(): Promise<B11BrowserSession> {
    if (
      !this.descriptor.secondaryRole ||
      !this.descriptor.secondaryLoginIdentifier
    ) {
      throw new Error('B11 route does not allow a secondary Session');
    }
    if (!this.secondarySession) {
      this.secondarySession = await B11BrowserSession.create({
        label: 'secondary',
        role: this.descriptor.secondaryRole,
        loginIdentifier: this.descriptor.secondaryLoginIdentifier,
        descriptor: this.descriptor,
        environment: this.environment,
        roleContexts: this.roleContexts,
      });
    }
    return this.secondarySession;
  }

  async collect(): Promise<B11SessionSummary[]> {
    const sessions = [this.primarySession, this.secondarySession].filter(
      (session): session is B11BrowserSession => session !== null,
    );
    const summaries: B11SessionSummary[] = [];
    for (const session of sessions) summaries.push(await session.collect());
    return summaries;
  }

  async cleanupAfterFailure(): Promise<void> {
    await Promise.allSettled(
      [this.primarySession, this.secondarySession]
        .filter(
          (session): session is B11BrowserSession => session !== null,
        )
        .map((session) => session.bestEffortLogout()),
    );
  }
}

export async function runB11CoreRoute(
  input: {
    environment: EnabledB11BrowserEnvironment;
    roleContexts: RoleContextFactory;
    target: B11CoreRouteTarget;
  },
  exercise: (run: B11RouteRun) => Promise<void>,
): Promise<void> {
  const descriptor = await readB11CoreRuntimeDescriptor(input.target);
  const run = new B11RouteRun(
    input.target,
    descriptor,
    input.environment,
    input.roleContexts,
  );
  let completed = false;
  try {
    await exercise(run);
    const sessions = await run.collect();
    const closed = await input.roleContexts.closeAll();
    expect(closed.activeContextCount).toBe(0);
    const runtimeDeleted = await deleteB11CoreRuntimeDescriptor(input.target);
    expect(runtimeDeleted).toBe(true);
    completed = true;
    const summary = {
      profile: 'core-workflow',
      scenarioKey: input.target.scenarioKey,
      routeKey: input.target.routeKey,
      sessionCount: sessions.length,
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
      sessions,
    };
    console.log(
      `B11_CORE_ROUTE ${safeJsonStringify(summary, [
        input.environment.fixturePassword,
        descriptor.loginIdentifier,
        descriptor.secondaryLoginIdentifier ?? '',
        descriptor.navigationPath,
        ...Object.values(B11_NEUTRAL_TEXT),
      ])}`,
    );
  } finally {
    if (!completed) {
      await run.cleanupAfterFailure();
      await input.roleContexts.closeAll().catch(() => undefined);
      await deleteB11CoreRuntimeDescriptor(input.target).catch(() => false);
    }
  }
}

export function reportSystemAndSnapshotSections(page: Page) {
  return page.locator(
    [
      'section[aria-labelledby="clinical-report-patient-snapshot-heading"]',
      'section[aria-labelledby="clinical-report-visit-snapshot-heading"]',
      'section[aria-labelledby="clinical-report-narrative-heading"] > div',
    ].join(','),
  );
}

export async function assertNoB11WorkflowWriteControls(page: Page) {
  await expect(
    page.getByRole('button', { name: '编辑临床人员内容', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '准备提交医生确认', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '准备确认报告', exact: true }),
  ).toHaveCount(0);
}

export async function exerciseBeforeUnload(page: Page): Promise<1> {
  const evidence = new BeforeUnloadEvidence(page, 'accept');
  evidence.observe();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: '报告工作流摘要', exact: true }),
  ).toBeVisible();
  const summary = evidence.stop();
  expect(summary.beforeUnloadDialogCount).toBe(1);
  expect(summary.otherDialogCount).toBe(0);
  return 1;
}

async function markerExists(markerPath: string): Promise<boolean> {
  try {
    await access(markerPath);
    return true;
  } catch {
    return false;
  }
}

export async function coordinateConfirmationConflictStage(): Promise<void> {
  const requestMarker = b11StageMarkerPath('request');
  const completedMarker = b11StageMarkerPath('completed');
  await Promise.all([
    unlink(requestMarker).catch(() => undefined),
    unlink(completedMarker).catch(() => undefined),
  ]);
  const handle = await open(requestMarker, 'wx', 0o600);
  try {
    await handle.writeFile('ready\n', 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  console.log('B11_STAGE_REQUEST_READY');
  try {
    await expect
      .poll(() => markerExists(completedMarker), { timeout: 45_000 })
      .toBe(true);
  } finally {
    await Promise.all([
      unlink(requestMarker).catch(() => undefined),
      unlink(completedMarker).catch(() => undefined),
    ]);
  }
}
