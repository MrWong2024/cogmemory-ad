import { readFile } from 'node:fs/promises';

import type { Locator, Page, Request, Response } from '@playwright/test';

import {
  clinicalReportOperatorRoleLabels,
  formatClinicalReportDate,
} from '../../../src/features/assessments/lib/clinical-report-display';
import type {
  ArchiveClinicalReportReceipt,
  ArchiveClinicalReportResponse,
  ClinicalReport,
} from '../../../src/features/assessments/types/clinical-report';
import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from '../support/acceptance-env';
import { expect, test } from '../support/acceptance-test';
import { ControlledRequestGate } from '../support/network-control';
import {
  NetworkLedger,
  type NetworkLedgerEntry,
} from '../support/network-ledger';
import type { RoleContextFactory } from '../support/role-context-factory';
import { safeJsonStringify } from '../support/safe-output';

type Scenario = {
  patientId: string;
  visitId: string;
  reportId: string;
  navigationPath: string;
};

type Descriptor = {
  schemaVersion: 1;
  batch: 'B14';
  profile: 'B14-P2-first-archive';
  namespace: string;
  accounts: Record<'doctor' | 'nurse', { loginIdentifier: string }>;
  scenarios: Record<'archive-ready' | 'archive-completed', Scenario>;
};

type EnabledEnvironment = Extract<
  ReturnType<typeof resolveLiveAcceptanceEnvironment>,
  { enabled: true }
>;

type CapturedArchiveRequest = {
  keys: string[];
  confirm: unknown;
  archiveNote: unknown;
  expectedUpdatedAt: unknown;
};

type ArchiveDisplayFacts = Pick<
  ArchiveClinicalReportReceipt,
  | 'archiveId'
  | 'archivedAt'
  | 'archivedBy'
  | 'archiveNote'
  | 'sourceFreezeId'
  | 'sourceFreezeCompletedAt'
>;

const environment = resolveLiveAcceptanceEnvironment();
const REPORT_MARKER = 'B14-U02 synthetic first archive report marker.';
const ARCHIVE_NOTE = 'B14 U02 脱敏首次归档说明';
const ARCHIVE_PATTERN =
  '/patients/<id>/visits/<id>/clinical-reports/<id>/archive';
const LATEST_PATTERN =
  '/patients/<id>/visits/<id>/clinical-reports/latest';
const AUTH_ME_PATTERN = '/auth/me';

function invariant(
  condition: unknown,
  safeMessage: string,
): asserts condition {
  if (!condition) throw new Error(safeMessage);
}

function requireSecret(): string {
  const value = process.env.B14_U02_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error('B14_U02_LOGIN_SECRET is required');
  }
  return value;
}

function requireCapturedArchiveRequest(
  value: CapturedArchiveRequest | null,
): CapturedArchiveRequest {
  if (!value) throw new Error('Archive request was not captured');
  return value;
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/.test(value);
}

function isScenario(value: unknown): value is Scenario {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Scenario>;
  return (
    isObjectId(candidate.patientId) &&
    isObjectId(candidate.visitId) &&
    isObjectId(candidate.reportId) &&
    typeof candidate.navigationPath === 'string' &&
    /^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}$/.test(
      candidate.navigationPath,
    )
  );
}

async function readDescriptor(): Promise<Descriptor> {
  const runtimePath = process.env.B14_U02_RUNTIME_PATH;
  if (!runtimePath) throw new Error('B14_U02_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(runtimePath, 'utf8')) as unknown;
  invariant(value && typeof value === 'object', 'U02 descriptor is invalid');
  const candidate = value as Partial<Descriptor>;
  invariant(candidate.schemaVersion === 1, 'U02 descriptor schema is invalid');
  invariant(candidate.batch === 'B14', 'U02 descriptor batch is invalid');
  invariant(
    candidate.profile === 'B14-P2-first-archive',
    'U02 descriptor profile is invalid',
  );
  invariant(
    typeof candidate.namespace === 'string' &&
      /^[a-z0-9][a-z0-9-]{2,19}$/.test(candidate.namespace),
    'U02 descriptor namespace is invalid',
  );
  invariant(
    typeof candidate.accounts?.doctor.loginIdentifier === 'string' &&
      candidate.accounts.doctor.loginIdentifier.length > 0,
    'U02 doctor account is invalid',
  );
  invariant(
    isScenario(candidate.scenarios?.['archive-ready']) &&
      isScenario(candidate.scenarios?.['archive-completed']),
    'U02 scenarios are invalid',
  );
  invariant(
    candidate.scenarios['archive-ready'].reportId !==
      candidate.scenarios['archive-completed'].reportId,
    'U02 scenarios must be independent',
  );
  return candidate as Descriptor;
}

function responsePath(response: Response): string {
  return new URL(response.url()).pathname;
}

function successfulAuthMeCount(ledger: NetworkLedger): number {
  return ledger
    .entries()
    .filter(
      (entry) =>
        entry.method === 'GET' &&
        entry.safeUrlPattern === AUTH_ME_PATTERN &&
        entry.status === 200,
    ).length;
}

async function login(input: {
  factory: RoleContextFactory;
  account: string;
  password: string;
  environment: EnabledEnvironment;
}) {
  const roleContext = await input.factory.create(
    'doctor',
    'b14-u02-first-archive',
    { viewport: { width: 390, height: 844 } },
  );
  const { context, page } = roleContext;
  const ledger = new NetworkLedger();
  await ledger.attach(page);
  await page.goto(`${input.environment.frontendOrigin}/login`, {
    waitUntil: 'domcontentloaded',
  });
  expect(await page.evaluate(() => window.location.origin)).toBe(
    input.environment.frontendOrigin,
  );
  const healthResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${input.environment.backendOrigin}/health` &&
      response.request().method() === 'GET',
  );
  const healthStatus = await page.evaluate(async (backendOrigin) => {
    const response = await fetch(`${backendOrigin}/health`, {
      cache: 'no-store',
      credentials: 'include',
    });
    return response.status;
  }, input.environment.backendOrigin);
  const healthResponse = await healthResponsePromise;
  expect(healthStatus).toBe(200);
  expect(new URL(healthResponse.url()).origin).toBe(
    input.environment.backendOrigin,
  );
  expect(healthResponse.headers()['access-control-allow-origin']).toBe(
    input.environment.frontendOrigin,
  );

  const loginResponsePromise = page.waitForResponse(
    (response) =>
      responsePath(response) === '/auth/login' &&
      response.request().method() === 'POST',
  );
  const meResponsePromise = page.waitForResponse(
    (response) =>
      responsePath(response) === '/auth/me' &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  await page.getByLabel('账号').fill(input.account);
  await page.getByLabel('密码').fill(input.password);
  await page.getByRole('button', { name: '登录系统', exact: true }).click();
  const [loginResponse, meResponse] = await Promise.all([
    loginResponsePromise,
    meResponsePromise,
  ]);
  expect(loginResponse.status()).toBe(201);
  expect(new URL(loginResponse.url()).origin).toBe(
    input.environment.backendOrigin,
  );
  expect((await loginResponse.request().allHeaders()).origin).toBe(
    input.environment.frontendOrigin,
  );
  const me = (await meResponse.json()) as {
    authenticated?: unknown;
    user?: { roles?: unknown };
  };
  expect(me).toMatchObject({
    authenticated: true,
    user: { roles: ['doctor'] },
  });
  const cookies = (await context.cookies(input.environment.backendOrigin)).filter(
    (cookie) => cookie.httpOnly,
  );
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatchObject({
    name: 'cogmemory_ad_session',
    domain: 'localhost',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  });
  return { roleContext, ledger, healthStatus, cookieCount: cookies.length };
}

async function openReport(input: {
  page: Page;
  scenario: Scenario;
  environment: EnabledEnvironment;
  ledger: NetworkLedger;
  reload?: boolean;
}): Promise<ClinicalReport> {
  const meBefore = successfulAuthMeCount(input.ledger);
  const latestBefore = input.ledger.count({
    method: 'GET',
    safeUrlPattern: LATEST_PATTERN,
  });
  const mePromise = input.page.waitForResponse(
    (response) =>
      responsePath(response) === '/auth/me' &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  const latestPromise = input.page.waitForResponse(
    (response) =>
      responsePath(response).endsWith('/clinical-reports/latest') &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  if (input.reload) {
    await input.page.reload({ waitUntil: 'domcontentloaded' });
  } else {
    await input.page.goto(
      `${input.environment.frontendOrigin}${input.scenario.navigationPath}`,
      { waitUntil: 'domcontentloaded' },
    );
  }
  const [meResponse, latestResponse] = await Promise.all([
    mePromise,
    latestPromise,
  ]);
  expect(new URL(meResponse.url()).origin).toBe(input.environment.backendOrigin);
  expect(new URL(latestResponse.url()).origin).toBe(
    input.environment.backendOrigin,
  );
  expect(successfulAuthMeCount(input.ledger) - meBefore).toBe(1);
  expect(
    input.ledger.count({ method: 'GET', safeUrlPattern: LATEST_PATTERN }) -
      latestBefore,
  ).toBe(1);
  const body = (await latestResponse.json()) as { report: ClinicalReport };
  invariant(
    body.report.id === input.scenario.reportId,
    'Latest report identity mismatch',
  );
  return body.report;
}

function publicProtectedFacts(report: ClinicalReport): string {
  return JSON.stringify({
    lockedAt: report.lockedAt,
    lock: report.lock,
    sourceFreeze: report.sourceFreeze,
    confirmation: report.confirmation,
    narrative: report.narrative,
    scaleTraces: report.scaleTraces,
    scoreSnapshots: report.scoreSnapshots,
    domainSnapshots: report.domainSnapshots,
    evidenceSnapshots: report.evidenceSnapshots,
    generation: report.generation,
    editorial: report.editorial,
    submission: report.submission,
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

function parseArchiveRequest(request: Request): CapturedArchiveRequest {
  const value = request.postDataJSON() as unknown;
  invariant(
    value && typeof value === 'object' && !Array.isArray(value),
    'Archive request body is invalid',
  );
  const body = value as Record<string, unknown>;
  return {
    keys: Object.keys(body).sort(),
    confirm: body.confirm,
    archiveNote: body.archiveNote,
    expectedUpdatedAt: body.expectedUpdatedAt,
  };
}

function reportBusinessWrites(entries: NetworkLedgerEntry[]) {
  return entries.filter(
    (entry) =>
      entry.method !== 'GET' &&
      entry.safeUrlPattern !== '/auth/login' &&
      /\/clinical-reports(?:\/|$)/.test(entry.safeUrlPattern),
  );
}

function adjacentReportBusinessWrites(entries: NetworkLedgerEntry[]) {
  return reportBusinessWrites(entries).filter(
    (entry) => entry.safeUrlPattern !== ARCHIVE_PATTERN,
  );
}

function countForbiddenGeneratedCalls(entries: NetworkLedgerEntry[]): number {
  return entries.filter((entry) =>
    /(?:pdf|print|download|\/ai(?:\/|$)|\/llm(?:\/|$))/i.test(
      entry.safeUrlPattern,
    ),
  ).length;
}

async function expectArchiveDetails(
  scope: Locator,
  archive: ArchiveDisplayFacts,
): Promise<void> {
  const actorName = archive.archivedBy.operatorName?.trim() || '未提供姓名';
  const actorRole = archive.archivedBy.operatorRole
    ? clinicalReportOperatorRoleLabels[archive.archivedBy.operatorRole]
    : '未提供角色';
  const values: readonly [string, string][] = [
    ['归档追溯号', archive.archiveId ?? '未在当前安全响应中提供'],
    ['归档时间', formatClinicalReportDate(archive.archivedAt)],
    ['归档人 / 角色', `${actorName}（${actorRole}）`],
    ['归档流程说明', archive.archiveNote?.trim() || '未在当前安全响应中提供'],
    ['来源冻结锚点', archive.sourceFreezeId ?? '未在当前安全响应中提供'],
    [
      '锚定的来源冻结完成时间',
      formatClinicalReportDate(archive.sourceFreezeCompletedAt),
    ],
  ];
  for (const [label, expectedValue] of values) {
    const detail = scope.getByText(label, { exact: true }).locator('..');
    const matches = await detail
      .locator('dd')
      .evaluate((element, expected) => element.textContent?.trim() === expected, expectedValue);
    expect(matches).toBe(true);
  }
}

async function storageAudit(page: Page) {
  return page.evaluate(async () => {
    const local = Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index) ?? '';
      return [key, localStorage.getItem(key) ?? ''] as const;
    });
    const session = Array.from(
      { length: sessionStorage.length },
      (_, index) => {
        const key = sessionStorage.key(index) ?? '';
        return [key, sessionStorage.getItem(key) ?? ''] as const;
      },
    );
    const databaseInfos =
      typeof indexedDB.databases === 'function'
        ? await indexedDB.databases()
        : [];
    const indexedDb: Array<{
      name: string;
      stores: Array<{ name: string; values: unknown[] }>;
    }> = [];
    for (const info of databaseInfos) {
      if (!info.name) continue;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(info.name as string);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const storeNames = Array.from(database.objectStoreNames);
      const stores = await Promise.all(
        storeNames.map(
          (name) =>
            new Promise<{ name: string; values: unknown[] }>(
              (resolve, reject) => {
                const transaction = database.transaction(name, 'readonly');
                const request = transaction.objectStore(name).getAll();
                request.onsuccess = () =>
                  resolve({ name, values: request.result as unknown[] });
                request.onerror = () => reject(request.error);
              },
            ),
        ),
      );
      indexedDb.push({ name: info.name, stores });
      database.close();
    }
    return {
      local,
      session,
      indexedDb,
      query: window.location.search,
      hash: window.location.hash,
    };
  });
}

test.describe('B14-U02 first real archive', () => {
  test.beforeEach(() => {
    test.skip(!environment.enabled, 'BROWSER_ACCEPTANCE_RUN_LIVE=1 is required');
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test('doctor archives a ready report once and reloads the persistent archive summary', async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const scenario = descriptor.scenarios['archive-ready'];
    const session = await login({
      factory: roleContexts,
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      environment: env,
    });
    const { page } = session.roleContext;
    const initialReport = await openReport({
      page,
      scenario,
      environment: env,
      ledger: session.ledger,
    });
    invariant(initialReport.updatedAt, 'Initial updatedAt is missing');
    invariant(initialReport.lockedAt, 'Initial lock timestamp is missing');
    invariant(initialReport.lock?.lockId, 'Initial lock summary is incomplete');
    invariant(
      initialReport.lock.lockedBy,
      'Initial lock actor summary is incomplete',
    );
    invariant(
      initialReport.sourceFreeze?.state === 'completed' &&
        initialReport.sourceFreeze.freezeId &&
        initialReport.sourceFreeze.completedAt,
      'Initial source freeze summary is incomplete',
    );
    invariant(
      initialReport.confirmation?.confirmationId &&
        initialReport.confirmation.confirmedAt &&
        initialReport.confirmation.confirmedByName &&
        initialReport.confirmation.confirmedByRole === 'doctor',
      'Initial confirmation summary is incomplete',
    );
    expect(initialReport.status).toBe('confirmed');
    expect(initialReport.isFinal).toBe(true);
    expect(initialReport.lock.lockedAt).toBe(initialReport.lockedAt);
    expect(initialReport.lock.lockedBy.operatorRole).toBe('doctor');
    expect(initialReport.archivedAt).toBeNull();
    expect(initialReport.archive).toBeNull();
    const initialProtectedFacts = publicProtectedFacts(initialReport);
    const initialLatestCount = session.ledger.count({
      method: 'GET',
      safeUrlPattern: LATEST_PATTERN,
    });
    await expect(page.getByText(REPORT_MARKER, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: '准备归档报告', exact: true }),
    ).toBeEnabled();
    await expectNoHorizontalOverflow(page);

    await page
      .getByRole('button', { name: '准备归档报告', exact: true })
      .click();
    const form = page.locator(
      'section[aria-labelledby="clinical-report-archive-heading"]',
    );
    await expect(
      form.getByRole('heading', {
        name: '二次确认不可撤销归档',
        exact: true,
      }),
    ).toBeVisible();
    const note = form.getByLabel('归档流程说明（必填）');
    const confirmation = form.getByRole('checkbox', {
      name: '我已核对当前已确认、已锁定且来源冻结完成的报告，并理解归档后不能恢复为已确认状态。',
      exact: true,
    });
    const submit = form.getByRole('button', {
      name: '确认归档报告',
      exact: true,
    });
    const cancel = form.getByRole('button', { name: '取消', exact: true });
    await expect(note).toHaveValue('');
    for (const forbiddenPrefill of [
      initialReport.lock.lockNote,
      initialReport.sourceFreeze.freezeNote,
      initialReport.confirmation.confirmationNote,
      initialReport.narrative?.doctorOpinion,
    ]) {
      if (forbiddenPrefill) {
        expect((await note.inputValue()).includes(forbiddenPrefill)).toBe(false);
      }
    }
    await expect(confirmation).not.toBeChecked();
    await expect(submit).toBeDisabled();

    await note.click();
    await expect(note).toBeFocused();
    await page.keyboard.type('ab');
    await page.keyboard.press('Tab');
    await expect(confirmation).toBeFocused();
    await page.keyboard.press('Space');
    await expect(confirmation).toBeChecked();
    await expect(submit).toBeDisabled();
    await expect(
      form.getByText('归档流程说明需为 3–2000 个字符。', { exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await expect(note).toBeFocused();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(ARCHIVE_NOTE);
    await expect(note).toHaveValue(ARCHIVE_NOTE);
    await expect(confirmation).not.toBeChecked();
    await page.keyboard.press('Tab');
    await expect(confirmation).toBeFocused();
    await page.keyboard.press('Space');
    await expect(confirmation).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(submit).toBeFocused();
    await expect(submit).toBeEnabled();

    const archivePath = `${scenario.navigationPath}/clinical-reports/${scenario.reportId}/archive`;
    let capturedRequest: CapturedArchiveRequest | null = null;
    const gate = new ControlledRequestGate(
      page,
      (request) => {
        const matches =
          request.method() === 'POST' &&
          new URL(request.url()).pathname === archivePath;
        if (matches) capturedRequest = parseArchiveRequest(request);
        return matches;
      },
      10_000,
    );
    await gate.install();
    const archiveResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        responsePath(response) === archivePath,
    );
    await page.keyboard.press('Enter');
    await gate.waitForStarted(5_000);
    expect(gate.summary()).toEqual({
      matchedRequestCount: 1,
      abortedRequestCount: 0,
      continuedRequestCount: 0,
    });
    const requestFacts = requireCapturedArchiveRequest(capturedRequest);
    expect(requestFacts.keys).toEqual([
      'archiveNote',
      'confirm',
      'expectedUpdatedAt',
    ]);
    expect(requestFacts.confirm).toBe(true);
    expect(requestFacts.archiveNote).toBe(ARCHIVE_NOTE);
    expect(requestFacts.expectedUpdatedAt).toBe(initialReport.updatedAt);
    await expect(
      form.getByRole('button', { name: '正在归档报告', exact: true }),
    ).toBeDisabled();
    await expect(note).toBeDisabled();
    await expect(confirmation).toBeDisabled();
    await expect(cancel).toBeDisabled();
    await expect(page.getByText(REPORT_MARKER, { exact: true })).toBeVisible();
    for (const otherWriteEntry of [
      '准备编辑报告',
      '准备提交医生确认',
      '准备确认报告',
      '准备锁定报告',
      '准备冻结报告来源',
      '准备版本化更正',
    ]) {
      await expect(
        page.getByRole('button', { name: otherWriteEntry, exact: true }),
      ).toHaveCount(0);
    }
    await expect(form.getByRole('progressbar')).toHaveCount(0);
    expect(await form.innerText()).not.toMatch(/\b\d{1,3}\s*%/);
    expect(await form.innerText()).not.toMatch(/阶段\s*\d|第[一二三四]阶段/);
    expect(
      session.ledger.count({ method: 'POST', safeUrlPattern: ARCHIVE_PATTERN }),
    ).toBe(1);
    expect(
      session.ledger.count({ method: 'GET', safeUrlPattern: LATEST_PATTERN }),
    ).toBe(initialLatestCount);
    expect(adjacentReportBusinessWrites(session.ledger.entries())).toHaveLength(
      0,
    );
    expect(countForbiddenGeneratedCalls(session.ledger.entries())).toBe(0);

    gate.resume();
    const archiveResponse = await archiveResponsePromise;
    expect(archiveResponse.status()).toBe(200);
    const responseBody =
      (await archiveResponse.json()) as ArchiveClinicalReportResponse;
    const gateSummary = await gate.dispose();
    expect(gateSummary).toEqual({
      matchedRequestCount: 1,
      abortedRequestCount: 0,
      continuedRequestCount: 1,
    });
    invariant(
      responseBody.report.id === scenario.reportId,
      'Archive response report identity mismatch',
    );
    expect(responseBody.report.status).toBe('archived');
    expect(responseBody.report.isFinal).toBe(true);
    expect(responseBody.archiveReceipt.alreadyArchived).toBe(false);
    invariant(
      responseBody.report.archivedAt &&
        responseBody.report.archive?.archiveId &&
        responseBody.archiveReceipt.archiveId,
      'Archive response is missing durable identifiers',
    );
    expect(responseBody.archiveReceipt.archiveNote).toBe(ARCHIVE_NOTE);
    expect(responseBody.archiveReceipt.archivedBy.operatorRole).toBe('doctor');
    invariant(
      responseBody.archiveReceipt.archivedBy.operatorId ===
        responseBody.report.archive.archivedBy.operatorId,
      'Archive actor identity mismatch',
    );
    for (const key of [
      'archiveId',
      'archivedAt',
      'archiveNote',
      'sourceFreezeId',
      'sourceFreezeCompletedAt',
    ] as const) {
      invariant(
        responseBody.report.archive[key] === responseBody.archiveReceipt[key],
        `Archive response ${key} mismatch`,
      );
    }
    invariant(
      responseBody.report.archive.archivedBy.operatorId ===
        responseBody.archiveReceipt.archivedBy.operatorId &&
        responseBody.report.archive.archivedBy.operatorName ===
          responseBody.archiveReceipt.archivedBy.operatorName &&
        responseBody.report.archive.archivedBy.operatorRole ===
          responseBody.archiveReceipt.archivedBy.operatorRole,
      'Archive response actor mismatch',
    );
    invariant(
      responseBody.report.archive.sourceFreezeId ===
        initialReport.sourceFreeze.freezeId &&
        responseBody.report.archive.sourceFreezeCompletedAt ===
          initialReport.sourceFreeze.completedAt,
      'Archive A23 anchor mismatch',
    );
    expect(publicProtectedFacts(responseBody.report)).toBe(
      initialProtectedFacts,
    );
    expect(responseBody.report.updatedAt).not.toBe(initialReport.updatedAt);
    expect(responseBody.report).not.toHaveProperty('metadata');
    expect(responseBody.report).not.toHaveProperty('archivedBy');
    for (const internalField of [
      'primaryScaleInstanceIds',
      'scoreResultIds',
      'cognitiveDomainResultIds',
      'mediaEvidenceIds',
      'scope',
    ]) {
      expect(responseBody.report).not.toHaveProperty(internalField);
    }

    const archiveSummary = page.locator(
      'section[aria-labelledby="clinical-report-archive-summary-heading"]',
    );
    await expect(
      page.getByRole('heading', { name: '报告已归档', exact: true }).first(),
    ).toBeVisible();
    await expect(
      archiveSummary.getByRole('heading', {
        name: '归档安全摘要',
        exact: true,
      }),
    ).toBeVisible();
    const persistentSummary = archiveSummary
      .getByRole('heading', { name: '报告已归档', exact: true })
      .locator('..')
      .locator('..');
    const receiptSummary = archiveSummary
      .getByRole('heading', {
        name: '当前页面会话归档回执',
        exact: true,
      })
      .locator('..')
      .locator('..');
    await expect(receiptSummary).toBeVisible();
    await expect(
      receiptSummary.getByText('报告已完成首次归档。', { exact: false }),
    ).toBeVisible();
    await expect(
      receiptSummary.getByText('alreadyArchived=false', { exact: true }),
    ).toBeVisible();
    await expectArchiveDetails(persistentSummary, responseBody.report.archive);
    await expectArchiveDetails(receiptSummary, responseBody.archiveReceipt);
    await expect(page.getByText(REPORT_MARKER, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: '二次确认不可撤销归档',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: '准备归档报告', exact: true }),
    ).toHaveCount(0);
    expect(
      session.ledger.count({ method: 'POST', safeUrlPattern: ARCHIVE_PATTERN }),
    ).toBe(1);
    expect(
      session.ledger.count({ method: 'GET', safeUrlPattern: LATEST_PATTERN }),
    ).toBe(initialLatestCount);

    const reloadedReport = await openReport({
      page,
      scenario,
      environment: env,
      ledger: session.ledger,
      reload: true,
    });
    expect(reloadedReport.status).toBe('archived');
    expect(reloadedReport.isFinal).toBe(true);
    invariant(
      reloadedReport.archive?.archiveId ===
        responseBody.report.archive.archiveId &&
        reloadedReport.archivedAt === responseBody.report.archivedAt &&
        reloadedReport.archive.archivedBy.operatorId ===
          responseBody.report.archive.archivedBy.operatorId &&
        reloadedReport.archive.archiveNote === ARCHIVE_NOTE &&
        reloadedReport.archive.sourceFreezeId ===
          initialReport.sourceFreeze.freezeId &&
        reloadedReport.archive.sourceFreezeCompletedAt ===
          initialReport.sourceFreeze.completedAt,
      'Reloaded archive summary mismatch',
    );
    expect(publicProtectedFacts(reloadedReport)).toBe(initialProtectedFacts);
    await expect(
      page.getByRole('heading', {
        name: '当前页面会话归档回执',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: '归档安全摘要', exact: true }),
    ).toBeVisible();
    const reloadedPersistentSummary = page
      .getByRole('heading', { name: '报告已归档', exact: true })
      .last()
      .locator('..')
      .locator('..');
    await expectArchiveDetails(
      reloadedPersistentSummary,
      responseBody.report.archive,
    );
    await expect(page.getByText(REPORT_MARKER, { exact: true })).toBeVisible();
    for (const closedEntry of [
      '准备编辑报告',
      '准备提交医生确认',
      '准备确认报告',
      '准备锁定报告',
      '准备冻结报告来源',
      '准备归档报告',
    ]) {
      await expect(
        page.getByRole('button', { name: closedEntry, exact: true }),
      ).toHaveCount(0);
    }
    await expectNoHorizontalOverflow(page);

    const persistedStorage = await storageAudit(page);
    expect(persistedStorage.query).toBe('');
    expect(persistedStorage.hash).toBe('');
    const persistedStorageText = JSON.stringify(persistedStorage);
    expect(persistedStorageText.includes(ARCHIVE_NOTE)).toBe(false);
    expect(
      persistedStorageText.includes(responseBody.report.archive.archiveId),
    ).toBe(false);
    expect(persistedStorageText.includes('当前页面会话归档回执')).toBe(false);

    const entries = session.ledger.entries();
    const archiveEntries = entries.filter(
      (entry) =>
        entry.method === 'POST' && entry.safeUrlPattern === ARCHIVE_PATTERN,
    );
    expect(archiveEntries).toEqual([
      expect.objectContaining({
        status: 200,
        failureReason: null,
        bodyKeys: ['archiveNote', 'confirm', 'expectedUpdatedAt'],
      }),
    ]);
    session.ledger.assertNoAutomaticRetry({
      method: 'POST',
      safeUrlPattern: ARCHIVE_PATTERN,
    });
    session.ledger.assertNoPolling(
      { method: 'GET', safeUrlPattern: LATEST_PATTERN },
      initialLatestCount + 1,
    );
    expect(
      session.ledger.count({ method: 'GET', safeUrlPattern: LATEST_PATTERN }),
    ).toBe(initialLatestCount + 1);
    expect(adjacentReportBusinessWrites(entries)).toHaveLength(0);
    expect(countForbiddenGeneratedCalls(entries)).toBe(0);

    const networkSummary = await session.ledger.detach();
    const closed = await roleContexts.closeAll();
    expect(closed.activeContextCount).toBe(0);
    console.log(
      `B14_U02_EVIDENCE ${safeJsonStringify(
        {
          descriptor: { profile: 'B14-P2-first-archive', scenarios: 2 },
          session: {
            doctorContextCount: 1,
            viewport: '390x844',
            healthStatus: session.healthStatus,
            authMeRole: 'doctor',
            httpOnlyCookieCount: session.cookieCount,
            localhostOrigins: true,
          },
          validation: 'keyboard_two_chars_checkbox_reset_valid_note',
          gate: gateSummary,
          archivePost: {
            count: 1,
            status: archiveEntries[0]?.status,
            bodyKeys: archiveEntries[0]?.bodyKeys,
            expectedUpdatedAtMatched: true,
          },
          pending: 'all_report_writes_disabled_report_readable',
          receipt: 'first_archive_alreadyArchived_false',
          reload: 'receipt_absent_persistent_summary_present',
          storageAndUrl: 'bounded_audit_clear',
          adjacentReportBusinessWrites: 0,
          generatedPdfDownloadAiCalls: 0,
          networkFailedRequestCount: networkSummary.failedRequestCount,
          contextsClosed: true,
        },
        [password, descriptor.accounts.doctor.loginIdentifier],
      )}`,
    );
  });
});
