import {
  access,
  open,
  rm,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import type {
  ConsoleMessage,
  Page,
  Request,
  Response,
} from '@playwright/test';
import { test as playwrightTest } from '@playwright/test';

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
  sanitizeUrlPattern,
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
  editorial: SafeEditorialFacts | null;
  editReceipt: SafeEditReceiptFacts | null;
};

type SafeActorFacts = {
  operatorName: string | null;
  operatorRole: string | null;
  internalOperatorIdPresent: false;
};

type SafeEditorialFacts = {
  lastEditedAt: string | null;
  lastEditedBy: SafeActorFacts | null;
  editCount: number | null;
  lastChangedFields: string[];
};

type SafeEditReceiptFacts = {
  keys: string[];
  actorKeys: string[];
  editedAt: string | null;
  editedBy: SafeActorFacts | null;
  changedFields: string[];
};

type LatestFacts = {
  updatedAt: string;
  status: string | null;
  source: string | null;
  qualityStatus: string | null;
  isFinal: boolean | null;
  editorial: SafeEditorialFacts | null;
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

type B11CollectState =
  | 'open'
  | 'collecting'
  | 'collected'
  | 'failed'
  | 'closing';

type B11LogoutResult = 'succeeded' | 'failed' | 'not_authenticated';

type CaptureFailureCategory = 'response_headers' | 'latest_parse';

type TimedNetworkEvent = {
  occurredAt: number;
  method: string;
  safeEndpointPattern: string;
  status: number | null;
  failureReason: 'aborted' | 'timed_out' | 'failed' | null;
};

type ExpectedNetworkConsoleEvent = Omit<TimedNetworkEvent, 'occurredAt'> & {
  contract: 'explicit_action_failure' | 'allowed_readonly_404_or_409';
  correlationWindowMs: number;
};

export type B11SessionSummary = {
  label: string;
  role: AcceptanceRole;
  login: 'passed';
  logout: 'succeeded';
  workflowAuthMeRequestCount: 1;
  latestFacts: Array<
    Pick<LatestFacts, 'status' | 'source' | 'qualityStatus' | 'isFinal'>
  >;
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
    expectedNetworkEvents: ExpectedNetworkConsoleEvent[];
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

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function parseSafeActor(value: unknown): SafeActorFacts | null {
  if (!isRecord(value)) return null;
  if (typeof value.operatorId === 'string' && value.operatorId.length > 0) {
    throw new Error('B11 public workflow actor exposed an internal operator id');
  }
  return {
    operatorName: safeString(value.operatorName),
    operatorRole: safeString(value.operatorRole),
    internalOperatorIdPresent: false,
  };
}

function parseSafeEditorial(report: Record<string, unknown>): SafeEditorialFacts | null {
  if (!isRecord(report.editorial)) return null;
  return {
    lastEditedAt: safeString(report.editorial.lastEditedAt),
    lastEditedBy: parseSafeActor(report.editorial.lastEditedBy),
    editCount:
      typeof report.editorial.editCount === 'number'
        ? report.editorial.editCount
        : null,
    lastChangedFields: safeStringArray(report.editorial.lastChangedFields),
  };
}

function parseSafeEditReceipt(
  envelope: Record<string, unknown>,
): SafeEditReceiptFacts | null {
  if (!isRecord(envelope.editReceipt)) return null;
  const actor = isRecord(envelope.editReceipt.editedBy)
    ? envelope.editReceipt.editedBy
    : null;
  return {
    keys: Object.keys(envelope.editReceipt).sort(),
    actorKeys: actor ? Object.keys(actor).sort() : [],
    editedAt: safeString(envelope.editReceipt.editedAt),
    editedBy: parseSafeActor(actor),
    changedFields: safeStringArray(envelope.editReceipt.changedFields),
  };
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
    editorial: parseSafeEditorial(report),
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
      editorial: null,
      editReceipt: null,
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
    editorial: parseSafeEditorial(report),
    editReceipt: parseSafeEditReceipt(envelope),
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
  private readonly corsChecks: boolean[] = [];
  private readonly latestFacts: LatestFacts[] = [];
  private readonly captureTasks: Promise<void>[] = [];
  private readonly captureFailures: CaptureFailureCategory[] = [];
  private readonly consoleErrors: Array<{
    occurredAt: number;
    category: 'network' | 'other';
  }> = [];
  private readonly timedNetworkEvents: TimedNetworkEvent[] = [];
  private readonly actionRequests: ActionRequestEvidence[] = [];
  private readonly actionResponses: SafeReportFacts[] = [];
  private readonly explicitActionCounts: Record<B11ActionKind, number> = {
    edit: 0,
    submit: 0,
    confirm: 0,
  };
  private authMeBeforeWorkflow = 0;
  private authMeAfterWorkflow = 0;
  private collectState: B11CollectState = 'open';
  private collectedSummary: B11SessionSummary | null = null;
  private logoutResult: B11LogoutResult | null = null;
  private acceptingCaptures = true;
  private consoleListening = false;
  private ledgerDetached = false;
  private contextClosed = false;

  private registerCapture(
    category: CaptureFailureCategory,
    task: Promise<void>,
  ): void {
    this.captureTasks.push(
      task.catch(() => {
        this.captureFailures.push(category);
      }),
    );
  }

  private readonly onRequest = (request: Request): void => {
    if (!this.acceptingCaptures) return;
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
    if (!this.acceptingCaptures) return;
    const request = response.request();
    this.timedNetworkEvents.push({
      occurredAt: Date.now(),
      method: request.method().toUpperCase(),
      safeEndpointPattern: sanitizeUrlPattern(response.url()),
      status: response.status(),
      failureReason: null,
    });
    if (response.url().startsWith(`${this.environment.backendOrigin}/`)) {
      this.registerCapture(
        'response_headers',
        response
          .allHeaders()
          .then((headers) => {
            this.corsChecks.push(
              headers['access-control-allow-origin'] ===
                this.environment.frontendOrigin &&
                headers['access-control-allow-credentials'] === 'true',
            );
          }),
      );
    }
    if (latestResponse(response) && response.status() === 200) {
      this.registerCapture(
        'latest_parse',
        parseLatestFacts(response).then((facts) => {
          this.latestFacts.push(facts);
        }),
      );
    }
  };

  private readonly onRequestFailed = (request: Request): void => {
    if (!this.acceptingCaptures) return;
    const errorText = request.failure()?.errorText ?? '';
    this.timedNetworkEvents.push({
      occurredAt: Date.now(),
      method: request.method().toUpperCase(),
      safeEndpointPattern: sanitizeUrlPattern(request.url()),
      status: null,
      failureReason: /aborted|blocked_by_client/i.test(errorText)
        ? 'aborted'
        : /timed?out/i.test(errorText)
          ? 'timed_out'
          : 'failed',
    });
  };

  private readonly onConsole = (message: ConsoleMessage): void => {
    if (message.type() !== 'error') return;
    this.consoleErrors.push({
      occurredAt: Date.now(),
      category: /fetch|network|failed to load|http|status of/i.test(
        message.text(),
      )
        ? 'network'
        : 'other',
    });
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
    private readonly closeBrowserContext: () => Promise<void>,
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
      () => roleContext.context.close(),
      roleContext.page,
    );
    try {
      await session.open();
      return session;
    } catch (error: unknown) {
      await session.bestEffortLogout().catch(() => 'failed');
      await session.closeContext().catch(() => undefined);
      throw error;
    }
  }

  private async flushCaptures(): Promise<void> {
    while (this.captureTasks.length > 0) {
      const tasks = this.captureTasks.splice(0);
      await Promise.all(tasks);
    }
  }

  private freezeCaptureListeners(): void {
    if (!this.acceptingCaptures) return;
    this.acceptingCaptures = false;
    this.page.off('request', this.onRequest);
    this.page.off('response', this.onResponse);
    this.page.off('requestfailed', this.onRequestFailed);
  }

  private stopConsoleAudit() {
    if (!this.consoleListening) return this.consoleAudit.summary();
    this.consoleListening = false;
    this.page.off('console', this.onConsole);
    return this.consoleAudit.stop();
  }

  private throwCaptureFailures(): void {
    if (this.captureFailures.length === 0) return;
    const categories = [...new Set(this.captureFailures)].sort().join(',');
    throw new Error(`B11 capture task failed safely: ${categories}`);
  }

  private async open(): Promise<void> {
    await this.ledger.attach(this.page);
    this.page.on('request', this.onRequest);
    this.page.on('response', this.onResponse);
    this.page.on('requestfailed', this.onRequestFailed);

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
    this.page.on('console', this.onConsole);
    this.consoleListening = true;
    const latestResponsePromise = this.page.waitForResponse(
      (response) => latestResponse(response) && response.status() === 200,
    );
    await this.page.goto(
      `${this.environment.frontendOrigin}${this.descriptor.navigationPath}`,
      { waitUntil: 'domcontentloaded' },
    );
    await latestResponsePromise;
    await this.flushCaptures();
    this.throwCaptureFailures();
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

  latestSafeFacts(): Pick<
    LatestFacts,
    'status' | 'source' | 'qualityStatus' | 'isFinal'
  > {
    const facts = this.latestFacts.at(-1);
    if (!facts) throw new Error('B11 session has no latest report facts');
    return {
      status: facts.status,
      source: facts.source,
      qualityStatus: facts.qualityStatus,
      isFinal: facts.isFinal,
    };
  }

  latestEditorialFacts(): SafeEditorialFacts | null {
    const editorial = this.latestFacts.at(-1)?.editorial;
    return editorial
      ? {
          ...editorial,
          lastChangedFields: [...editorial.lastChangedFields],
          lastEditedBy: editorial.lastEditedBy
            ? { ...editorial.lastEditedBy }
            : null,
        }
      : null;
  }

  async waitForLatestCount(count: number): Promise<void> {
    await expect
      .poll(async () => {
        await this.flushCaptures();
        this.throwCaptureFailures();
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
    this.actionResponses.push(facts);
    return { status: response.status(), facts };
  }

  actionRequestEvidence(action: B11ActionKind): ActionRequestEvidence[] {
    return this.actionRequests
      .filter((entry) => entry.action === action)
      .map((entry) => ({ ...entry, bodyKeys: [...entry.bodyKeys] }));
  }

  private correlateExpectedNetworkConsoleEvents(): ExpectedNetworkConsoleEvent[] {
    const correlationWindowMs = 2_500;
    const candidates = this.timedNetworkEvents
      .map((event) => {
        const explicitActionFailure =
          event.status !== null &&
          event.status >= 400 &&
          Object.values(ACTION_SUFFIX).some((suffix) =>
            event.safeEndpointPattern.endsWith(suffix),
          );
        const allowedReadonlyFailure =
          event.method === 'GET' &&
          (event.status === 404 || event.status === 409) &&
          event.failureReason === null &&
          event.safeEndpointPattern.endsWith('/score-results/latest');
        return {
          event,
          contract: explicitActionFailure
            ? ('explicit_action_failure' as const)
            : allowedReadonlyFailure
              ? ('allowed_readonly_404_or_409' as const)
              : null,
        };
      })
      .filter(
        (
          candidate,
        ): candidate is {
          event: TimedNetworkEvent;
          contract: ExpectedNetworkConsoleEvent['contract'];
        } => candidate.contract !== null,
      );
    const used = new Set<number>();
    const matched: ExpectedNetworkConsoleEvent[] = [];
    for (const consoleEvent of this.consoleErrors) {
      if (consoleEvent.category !== 'network') {
        throw new Error('B11 Console error was not a network event');
      }
      const candidate = candidates
        .map((value, index) => ({
          ...value,
          index,
          delta: Math.abs(value.event.occurredAt - consoleEvent.occurredAt),
        }))
        .filter(({ index, delta }) => !used.has(index) && delta <= correlationWindowMs)
        .sort((left, right) => left.delta - right.delta)[0];
      if (!candidate) {
        throw new Error(
          'B11 Console error could not be matched to one allowed network event',
        );
      }
      used.add(candidate.index);
      matched.push({
        method: candidate.event.method,
        safeEndpointPattern: candidate.event.safeEndpointPattern,
        status: candidate.event.status,
        failureReason: candidate.event.failureReason,
        contract: candidate.contract,
        correlationWindowMs,
      });
    }
    for (const event of matched.filter(
      ({ contract }) => contract === 'allowed_readonly_404_or_409',
    )) {
      const attempts = this.timedNetworkEvents.filter(
        (candidate) =>
          candidate.method === event.method &&
          candidate.safeEndpointPattern === event.safeEndpointPattern,
      ).length;
      if (attempts !== 1) {
        throw new Error(
          'B11 expected read-only Console event had retry or polling activity',
        );
      }
    }
    return matched;
  }

  private async attemptLogout(): Promise<B11LogoutResult> {
    if (this.logoutResult) return this.logoutResult;
    if (this.page.isClosed()) {
      this.logoutResult = 'failed';
      return this.logoutResult;
    }
    if (
      new URL(this.page.url()).pathname === '/login' ||
      (await this.page
        .getByRole('button', { name: '登录系统', exact: true })
        .isVisible()
        .catch(() => false))
    ) {
      this.logoutResult = 'not_authenticated';
      return this.logoutResult;
    }
    const logout = this.page.getByRole('button', {
      name: '退出登录',
      exact: true,
    });
    if (!(await logout.isVisible().catch(() => false))) {
      this.logoutResult = 'failed';
      return this.logoutResult;
    }
    try {
      const responsePromise = this.page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/auth/logout',
        { timeout: 5_000 },
      );
      await logout.click();
      const response = await responsePromise;
      await this.page.waitForURL(`${this.environment.frontendOrigin}/login`, {
        timeout: 5_000,
      });
      this.logoutResult =
        response.status() >= 200 && response.status() < 300
          ? 'succeeded'
          : 'failed';
    } catch {
      this.logoutResult = 'failed';
    }
    return this.logoutResult;
  }

  private async detachLedger(): Promise<Awaited<ReturnType<NetworkLedger['detach']>>> {
    if (this.ledgerDetached) return this.ledger.summary();
    const summary = await this.ledger.detach();
    this.ledgerDetached = true;
    return summary;
  }

  async collect(): Promise<B11SessionSummary> {
    if (this.collectState === 'collected' && this.collectedSummary) {
      return this.collectedSummary;
    }
    if (this.collectState !== 'open') {
      throw new Error(`B11 session cannot collect from ${this.collectState}`);
    }
    this.collectState = 'collecting';
    try {
      this.freezeCaptureListeners();
      await this.flushCaptures();
      this.throwCaptureFailures();
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
      expect(
        (await this.contextCookies()).some(({ httpOnly }) => httpOnly),
      ).toBe(true);

      const consoleSummary = this.stopConsoleAudit();
      const expectedNetworkEvents =
        this.correlateExpectedNetworkConsoleEvents();
      const expectedActionFailureCount = expectedNetworkEvents.filter(
        ({ contract }) => contract === 'explicit_action_failure',
      ).length;
      const expectedSiblingReadFailureCount = expectedNetworkEvents.filter(
        ({ contract }) => contract === 'allowed_readonly_404_or_409',
      ).length;
      expect(consoleSummary.warningCount).toBe(0);
      expect(consoleSummary.errorCount).toBe(expectedNetworkEvents.length);
      expect(consoleSummary.pageErrorCount).toBe(0);
      expect(consoleSummary.categories).toEqual(
        expectedNetworkEvents.length === 0
          ? []
          : [{ category: 'network', count: expectedNetworkEvents.length }],
      );

      expect(await this.attemptLogout()).toBe('succeeded');
      expect(
        (await this.contextCookies()).some(({ httpOnly }) => httpOnly),
      ).toBe(false);
      await this.page.waitForLoadState('networkidle', { timeout: 10_000 });
      expect(this.corsChecks.length).toBeGreaterThan(0);
      expect(this.corsChecks.every(Boolean)).toBe(true);

      const network = await this.detachLedger();
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

      const summary: B11SessionSummary = {
        label: this.label,
        role: this.role,
        login: 'passed',
        logout: 'succeeded',
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
          errorCount: expectedNetworkEvents.length,
          pageErrorCount: 0,
          expectedActionFailureCount,
          expectedSiblingReadFailureCount,
          unexpectedErrorCount: 0,
          expectedNetworkEvents,
        },
        storage: 'clear',
        cookie: 'http_only_session_then_cleared',
        cors: 'passed',
        url: 'safe_path_without_query_or_hash',
        domPrivacy,
      };
      this.collectedSummary = summary;
      this.collectState = 'collected';
      return summary;
    } catch (error: unknown) {
      this.collectState = 'failed';
      throw error;
    }
  }

  async bestEffortLogout(): Promise<B11LogoutResult> {
    if (this.collectState !== 'collected') this.collectState = 'closing';
    this.freezeCaptureListeners();
    await this.flushCaptures();
    this.stopConsoleAudit();
    const result = await this.attemptLogout();
    await this.detachLedger().catch(() => undefined);
    return result;
  }

  async closeContext(): Promise<void> {
    if (this.contextClosed) return;
    await this.closeBrowserContext();
    this.contextClosed = true;
  }
}

export class B11RouteRun {
  private primarySession: B11BrowserSession | null = null;
  private secondarySession: B11BrowserSession | null = null;
  private readonly reopenedSessions: B11BrowserSession[] = [];

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

  async reopenPrimaryInFreshContext(): Promise<B11BrowserSession> {
    const current = await this.primary();
    await current.collect();
    await current.closeContext();
    const reopened = await B11BrowserSession.create({
      label: `primary-reopened-${this.reopenedSessions.length + 1}`,
      role: this.descriptor.primaryRole,
      loginIdentifier: this.descriptor.loginIdentifier,
      descriptor: this.descriptor,
      environment: this.environment,
      roleContexts: this.roleContexts,
    });
    this.reopenedSessions.push(reopened);
    return reopened;
  }

  private sessions(): B11BrowserSession[] {
    return [
      this.primarySession,
      this.secondarySession,
      ...this.reopenedSessions,
    ].filter((session): session is B11BrowserSession => session !== null);
  }

  async collect(): Promise<B11SessionSummary[]> {
    const summaries: B11SessionSummary[] = [];
    for (const session of this.sessions()) {
      summaries.push(await session.collect());
    }
    return summaries;
  }

  async cleanupAfterFailure(): Promise<
    Array<{ label: string; logout: B11LogoutResult }>
  > {
    return Promise.all(
      this.sessions().map(async (session) => {
        const logout = await session.bestEffortLogout().catch(
          () => 'failed' as const,
        );
        await session.closeContext().catch(() => undefined);
        return { label: session.label, logout };
      }),
    );
  }
}

async function removeCurrentB11TestOutput(): Promise<boolean> {
  const outputRoot = path.resolve(
    process.cwd(),
    'test-results',
    'browser-acceptance',
  );
  const currentOutput = path.resolve(playwrightTest.info().outputDir);
  const relative = path.relative(outputRoot, currentOutput);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('B11 test output directory is outside the configured root');
  }
  await rm(currentOutput, { recursive: true, force: true });
  return true;
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
      const logout = await run.cleanupAfterFailure();
      const contextsClosed = await input.roleContexts
        .closeAll()
        .then(({ activeContextCount }) => activeContextCount === 0)
        .catch(() => false);
      const runtimeDescriptorDeleted = await deleteB11CoreRuntimeDescriptor(
        input.target,
      ).catch(() => false);
      const failureArtifactsRemoved = await removeCurrentB11TestOutput().catch(
        () => false,
      );
      console.log(
        `B11_CORE_FAILURE_CLEANUP ${safeJsonStringify({
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

export function reportSystemAndSnapshotSections(page: Page) {
  return page.locator(
    [
      'section[aria-labelledby="clinical-report-patient-snapshot-heading"]',
      'section[aria-labelledby="clinical-report-visit-snapshot-heading"]',
      'section[aria-labelledby="clinical-report-narrative-heading"] > div',
    ].join(','),
  );
}

const B11_OPERATOR_ROLE_LABELS: Record<string, string> = {
  doctor: '医生',
  nurse: '护士',
  research_assistant: '研究助理',
  admin: '管理员',
  unknown: '未知角色',
};

function formatB11PublicDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '时间暂不可用'
    : new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function actorLabel(actor: SafeActorFacts | null): string {
  if (!actor) return '—';
  const name = actor.operatorName?.trim() || '未提供姓名';
  const role = actor.operatorRole
    ? (B11_OPERATOR_ROLE_LABELS[actor.operatorRole] ?? '未提供角色')
    : '未提供角色';
  return `${name}（${role}）`;
}

export async function assertB11EditorialSummary(
  page: Page,
  editorial: SafeEditorialFacts | null,
): Promise<void> {
  if (!editorial) throw new Error('B11 response omitted its editorial summary');
  const heading = page.getByRole('heading', {
    name: '最新编辑摘要',
    exact: true,
  });
  await expect(heading).toHaveCount(1);
  const section = page.locator('section').filter({ has: heading });
  await expect(section).toHaveCount(1);
  const valueFor = (label: string) =>
    section.locator('dt', { hasText: label }).locator('..').locator('dd');
  await expect(valueFor('时间')).toHaveText(
    formatB11PublicDate(editorial.lastEditedAt),
  );
  await expect(valueFor('编辑人')).toHaveText(
    actorLabel(editorial.lastEditedBy),
  );
  await expect(valueFor('编辑次数')).toHaveText(
    String(editorial.editCount),
  );
  const changedFieldLabels: Record<string, string> = {
    doctorOpinion: '医生意见',
    recommendationText: '临床人员补充建议',
  };
  await expect(valueFor('最近变化字段')).toHaveText(
    editorial.lastChangedFields
      .map((field) => changedFieldLabels[field] ?? field)
      .join('、') || '—',
  );
  expect(editorial.lastEditedBy?.internalOperatorIdPresent ?? false).toBe(
    false,
  );
}

export async function assertB11EditorialPrivacy(
  page: Page,
  expectedReceiptCount: number,
): Promise<void> {
  const workflow = page.locator(
    'section[aria-labelledby="clinical-report-workflow-summary-heading"]',
  );
  await expect(workflow).toHaveCount(1);
  await expect(
    workflow.getByText(
      '仅展示最新公开摘要与当前页面会话回执，不公开完整编辑历史、前后值、metadata 或签名字段。',
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    workflow.getByRole('heading', { name: '最新编辑摘要', exact: true }),
  ).toHaveCount(1);
  await expect(
    workflow.locator('p').filter({ hasText: /^本次编辑回执：/ }),
  ).toHaveCount(expectedReceiptCount);
  await expect(
    workflow.getByRole('heading', {
      name: /完整编辑历史|审计历史|历史编辑事件/,
    }),
  ).toHaveCount(0);
  await expect(
    workflow
      .locator('table,[role="table"],[role="grid"],ol,ul')
      .filter({ hasText: /previousValue|nextValue|编辑事件数组/ }),
  ).toHaveCount(0);

  const privacy = await page.evaluate(() => {
    const disclosure =
      '仅展示最新公开摘要与当前页面会话回执，不公开完整编辑历史、前后值、metadata 或签名字段。';
    const forbidden =
      /previousValues?|nextValues?|\bprevious\b|\bnext\b|metadata|a21Edits|editEvents|编辑事件数组/i;
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script,style').forEach((node) => node.remove());
    const serializedWithoutDisclosure = clone.outerHTML.replace(disclosure, '');
    const textWithoutDisclosure = document.body.innerText.replace(
      disclosure,
      '',
    );
    const sensitiveAttributeDetected = [...document.querySelectorAll('*')].some(
      (node) =>
        [...node.attributes].some(
          (attribute) =>
            (attribute.name === 'title' ||
              attribute.name.startsWith('aria-') ||
              attribute.name.startsWith('data-')) &&
            forbidden.test(attribute.value),
        ),
    );
    return {
      forbiddenTextDetected: forbidden.test(textWithoutDisclosure),
      forbiddenHtmlDetected: forbidden.test(serializedWithoutDisclosure),
      sensitiveAttributeDetected,
    };
  });
  expect(privacy).toEqual({
    forbiddenTextDetected: false,
    forbiddenHtmlDetected: false,
    sensitiveAttributeDetected: false,
  });
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
