import { readFile } from 'node:fs/promises';

import type { Locator, Page, Response } from '@playwright/test';

import type {
  ClinicalReport,
  ClinicalReportSourceFreezeResourceCounts,
  FreezeClinicalReportSourcesResponse,
} from '../../../src/features/assessments/types/clinical-report';
import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from '../support/acceptance-env';
import { expect, test } from '../support/acceptance-test';
import { OneShotRequestAbort } from '../support/network-control';
import {
  NetworkLedger,
  type NetworkLedgerEntry,
} from '../support/network-ledger';
import type {
  RoleContext,
  RoleContextFactory,
} from '../support/role-context-factory';
import { safeJsonStringify } from '../support/safe-output';

type Scenario = {
  patientId: string;
  visitId: string;
  reportId: string;
  navigationPath: string;
};
type Descriptor = {
  schemaVersion: 1;
  batch: 'B13';
  profile: 'B13-P1-entry-persisted-states';
  accounts: { doctor: { loginIdentifier: string } };
  scenarios: Record<
    'source-freeze-null' | 'source-freeze-in-progress',
    Scenario
  >;
};
type EnabledEnvironment = Extract<
  ReturnType<typeof resolveLiveAcceptanceEnvironment>,
  { enabled: true }
>;
type AuthUser = {
  id: string;
  displayName: string;
  roles: string[];
};
type Session = {
  roleContext: RoleContext;
  ledger: NetworkLedger;
  user: AuthUser;
  healthStatus: number;
};
type CountKey = keyof ClinicalReportSourceFreezeResourceCounts;
type StorageBoundary = {
  localStorageClear: true;
  sessionStorageClear: true;
  indexedDbClear: true;
  queryClear: true;
  hashClear: true;
};

const environment = resolveLiveAcceptanceEnvironment();
const MARKER = 'B13-U01 synthetic readable report marker.';
const LOCAL_NOTE = 'B13 U03 脱敏未提交来源冻结说明';
const UNCERTAIN_MESSAGE =
  '来源冻结请求结果暂不确定；系统不会自动重试，请手工重新加载最新报告核对。';
const FREEZE_PATTERN =
  '/patients/<id>/visits/<id>/clinical-reports/<id>/freeze-sources';
const LATEST_PATTERN =
  '/patients/<id>/visits/<id>/clinical-reports/latest';
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const COUNT_ROWS: readonly [string, CountKey][] = [
  ['量表实例', 'scaleInstanceCount'],
  ['题目记录', 'itemResponseCount'],
  ['评分结果', 'scoreResultCount'],
  ['认知域结果', 'cognitiveDomainResultCount'],
  ['媒体证据', 'mediaEvidenceCount'],
  ['合计', 'totalSourceCount'],
];

function requireSecret(): string {
  const value = process.env.B13_U01_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error('B13_U01_LOGIN_SECRET is required');
  }
  return value;
}

async function readDescriptor(): Promise<Descriptor> {
  const path = process.env.B13_U01_RUNTIME_PATH;
  if (!path) throw new Error('B13_U01_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(path, 'utf8')) as Partial<Descriptor>;
  expect(value).toMatchObject({
    schemaVersion: 1,
    batch: 'B13',
    profile: 'B13-P1-entry-persisted-states',
    accounts: { doctor: { loginIdentifier: expect.any(String) } },
    scenarios: {
      'source-freeze-null': {
        patientId: expect.stringMatching(/^[a-f\d]{24}$/),
        visitId: expect.stringMatching(/^[a-f\d]{24}$/),
        reportId: expect.stringMatching(/^[a-f\d]{24}$/),
      },
      'source-freeze-in-progress': {
        patientId: expect.stringMatching(/^[a-f\d]{24}$/),
        visitId: expect.stringMatching(/^[a-f\d]{24}$/),
        reportId: expect.stringMatching(/^[a-f\d]{24}$/),
      },
    },
  });
  return value as Descriptor;
}

function responsePath(response: Response): string {
  return new URL(response.url()).pathname;
}

async function login(input: {
  factory: RoleContextFactory;
  account: string;
  password: string;
  environment: EnabledEnvironment;
  label: string;
  viewport?: { width: number; height: number };
}): Promise<Session> {
  const roleContext = await input.factory.create(
    'doctor',
    input.label,
    input.viewport ? { viewport: input.viewport } : {},
  );
  const { context, page } = roleContext;
  const ledger = new NetworkLedger();
  await ledger.attach(page);
  const health = await context.request.get(
    `${input.environment.backendOrigin}/health`,
    { timeout: 5_000 },
  );
  expect(health.status()).toBe(200);
  await page.goto(`${input.environment.frontendOrigin}/login`, {
    waitUntil: 'domcontentloaded',
  });
  expect(await page.evaluate(() => location.origin)).toBe(
    input.environment.frontendOrigin,
  );
  const loginResponse = page.waitForResponse(
    (response) =>
      responsePath(response) === '/auth/login' &&
      response.request().method() === 'POST',
  );
  const meResponse = page.waitForResponse(
    (response) =>
      responsePath(response) === '/auth/me' &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  await page.getByLabel('账号').fill(input.account);
  await page.getByLabel('密码').fill(input.password);
  await page.getByRole('button', { name: '登录系统', exact: true }).click();
  expect((await loginResponse).status()).toBe(201);
  const me = (await (await meResponse).json()) as {
    authenticated: boolean;
    user: AuthUser;
  };
  expect(me).toMatchObject({
    authenticated: true,
    user: { id: expect.any(String), roles: ['doctor'] },
  });
  await expect(page).toHaveURL(`${input.environment.frontendOrigin}/dashboard`);
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
  return {
    roleContext,
    ledger,
    user: me.user,
    healthStatus: health.status(),
  };
}

async function openReport(
  page: Page,
  route: Scenario,
  env: EnabledEnvironment,
): Promise<ClinicalReport> {
  const latest = page.waitForResponse(
    (response) =>
      responsePath(response).endsWith('/clinical-reports/latest') &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  await page.goto(`${env.frontendOrigin}${route.navigationPath}`, {
    waitUntil: 'domcontentloaded',
  });
  const body = (await (await latest).json()) as { report: ClinicalReport };
  expect(body.report).toMatchObject({
    id: route.reportId,
    status: 'confirmed',
    source: 'mixed',
    qualityStatus: 'passed',
    isFinal: true,
    lockedAt: expect.any(String),
    archivedAt: null,
  });
  await expect(page.getByText(MARKER, { exact: true })).toBeVisible();
  return body.report;
}

function summaryValue(summary: Locator, label: string): Locator {
  return summary
    .getByText(label, { exact: true })
    .locator('xpath=following-sibling::dd');
}

async function expectCountTable(
  table: Locator,
  receipt: FreezeClinicalReportSourcesResponse['sourceFreezeReceipt'],
): Promise<void> {
  await expect(table.getByRole('columnheader')).toHaveText([
    '来源类型',
    '预期数量',
    '完成数量',
    '本次新增冻结',
    '此前已冻结',
  ]);
  for (const [label, key] of COUNT_ROWS) {
    const row = table.getByRole('row').filter({ hasText: label });
    await expect(row.getByRole('rowheader')).toHaveText(label);
    await expect(row.getByRole('cell')).toHaveText([
      String(receipt.expectedCounts[key]),
      String(receipt.completedCounts[key]),
      String(receipt.newlyFrozenCounts[key]),
      String(receipt.previouslyFrozenCounts[key]),
    ]);
  }
}

function adjacentLifecycleWrites(
  entries: NetworkLedgerEntry[],
): NetworkLedgerEntry[] {
  return entries.filter(
    (entry) =>
      entry.method !== 'GET' &&
      entry.safeUrlPattern !== '/auth/login' &&
      entry.safeUrlPattern !== FREEZE_PATTERN &&
      (/clinical-reports|\/ai(?:\/|$)|\/llm(?:\/|$)/.test(
        entry.safeUrlPattern,
      ) || /pdf|print|download/.test(entry.safeUrlPattern)),
  );
}

async function assertStableNetworkCounts(
  ledger: NetworkLedger,
  expected: { freezePosts: number; latestGets: number },
): Promise<void> {
  const observationEndsAt = Date.now() + 1_000;
  await expect
    .poll(
      () =>
        Date.now() < observationEndsAt
          ? { freezePosts: -1, latestGets: -1 }
          : {
              freezePosts: ledger.count({
                method: 'POST',
                safeUrlPattern: FREEZE_PATTERN,
              }),
              latestGets: ledger.count({
                method: 'GET',
                safeUrlPattern: LATEST_PATTERN,
              }),
            },
      {
        timeout: 2_500,
        intervals: [200, 250, 300, 400],
      },
    )
    .toEqual(expected);
  ledger.assertNoAutomaticRetry({
    method: 'POST',
    safeUrlPattern: FREEZE_PATTERN,
  });
  ledger.assertNoPolling(
    { method: 'GET', safeUrlPattern: LATEST_PATTERN },
    expected.latestGets,
  );
}

async function auditSourceFreezeDraftStorage(
  page: Page,
): Promise<StorageBoundary> {
  const result = await page.evaluate(async (freezeNote) => {
    const forbidden =
      /freezeNote|sourceFreezeDraft|clinicalReportSourceFreeze|expectedUpdatedAt/i;
    const contains = (value: unknown): boolean => {
      try {
        const serialized =
          typeof value === 'string' ? value : JSON.stringify(value);
        return forbidden.test(serialized) || serialized.includes(freezeNote);
      } catch {
        return true;
      }
    };
    let indexedDbForbidden = false;
    const databases =
      typeof indexedDB.databases === 'function'
        ? await indexedDB.databases()
        : [];
    for (const info of databases) {
      if (!info.name) continue;
      indexedDbForbidden ||= contains(info.name);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(info.name!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const names = [...database.objectStoreNames];
        if (names.length === 0) continue;
        const transaction = database.transaction(names, 'readonly');
        for (const name of names) {
          const values = await new Promise<unknown[]>((resolve, reject) => {
            const request = transaction.objectStore(name).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          indexedDbForbidden ||= contains(name) || values.some(contains);
        }
      } finally {
        database.close();
      }
    }
    return {
      localStorageForbidden: Object.entries(localStorage).some(contains),
      sessionStorageForbidden: Object.entries(sessionStorage).some(contains),
      indexedDbForbidden,
      queryForbidden: contains(window.location.search),
      hashForbidden: contains(window.location.hash),
    };
  }, LOCAL_NOTE);
  expect(result).toEqual({
    localStorageForbidden: false,
    sessionStorageForbidden: false,
    indexedDbForbidden: false,
    queryForbidden: false,
    hashForbidden: false,
  });
  return {
    localStorageClear: true,
    sessionStorageClear: true,
    indexedDbClear: true,
    queryClear: true,
    hashClear: true,
  };
}

async function assertNoGlobalHorizontalOverflow(page: Page): Promise<void> {
  const viewport = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth ?? 0,
    ),
  }));
  expect(viewport.innerWidth).toBe(MOBILE_VIEWPORT.width);
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth);
}

test.describe('B13-U03 persisted recovery and uncertain result', () => {
  test.beforeEach(() => {
    test.skip(!environment.enabled, 'BROWSER_ACCEPTANCE_RUN_LIVE=1 is required');
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test('doctor explicitly resumes the persisted in-progress source freeze', async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    test.setTimeout(75_000);
    const runtime = await readDescriptor();
    const env: EnabledEnvironment = environment;
    const route = runtime.scenarios['source-freeze-in-progress'];
    const session = await login({
      factory: roleContexts,
      account: runtime.accounts.doctor.loginIdentifier,
      password: requireSecret(),
      environment: env,
      label: 'u03-resume-doctor',
    });
    const { page } = session.roleContext;
    const initialReport = await openReport(page, route, env);
    expect(initialReport.sourceFreeze).toMatchObject({
      state: 'in_progress',
      freezeId: expect.any(String),
      freezeNote: expect.any(String),
      startedAt: expect.any(String),
      sourceLockedAt: expect.any(String),
      startedBy: { operatorRole: 'doctor' },
      expectedCounts: expect.any(Object),
      completedCounts: null,
      newlyFrozenCounts: null,
      completedAt: null,
      completedBy: null,
    });
    const original = initialReport.sourceFreeze!;
    expect(original.freezeId.length).toBeGreaterThan(0);

    const initialSummary = page.locator(
      'section[aria-labelledby="clinical-report-source-freeze-summary-heading"]',
    );
    const visibleFreezeId = await summaryValue(
      initialSummary,
      '技术追溯号',
    ).innerText();
    const visibleNote = await summaryValue(
      initialSummary,
      '来源冻结流程说明',
    ).innerText();
    const visibleStartedActor = await summaryValue(
      initialSummary,
      '发起人',
    ).innerText();
    const visibleStartedAt = await summaryValue(
      initialSummary,
      '开始时间',
    ).innerText();
    const visibleSourceLockedAt = await summaryValue(
      initialSummary,
      '来源统一锁定时间',
    ).innerText();
    expect(visibleFreezeId).toBe(original.freezeId);
    expect(visibleNote).toBe(original.freezeNote);
    expect(visibleStartedActor).toContain(
      original.startedBy.operatorName ?? '未提供姓名',
    );
    expect(visibleStartedAt).not.toBe('—');
    expect(visibleSourceLockedAt).not.toBe('—');

    await page
      .getByRole('button', {
        name: '准备继续完成来源冻结',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', {
        name: '二次确认继续同一来源冻结流程',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText('原 freezeId', { exact: true })).toBeVisible();
    await expect(
      page.getByText('服务端首次来源冻结流程说明（只读）', {
        exact: true,
      }),
    ).toBeVisible();
    const resumePanel = page.locator(
      'section[aria-labelledby="clinical-report-source-freeze-heading"]',
    );
    await expect(
      resumePanel.getByText(original.freezeNote, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        '恢复不会生成新 freezeId，不会覆盖首次说明或发起人，也不会解冻已冻结来源。请求使用上方服务端只读说明。',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByLabel('来源冻结流程说明（必填）')).toHaveCount(0);

    const confirmation = page.getByRole('checkbox', {
      name: '我理解当前流程可能已部分完成，并确认继续使用原冻结范围和原冻结说明完成同一流程。',
      exact: true,
    });
    const submit = page.getByRole('button', {
      name: '确认继续同一冻结流程',
      exact: true,
    });
    await expect(confirmation).not.toBeChecked();
    await expect(submit).toBeDisabled();
    await confirmation.check();
    await expect(submit).toBeEnabled();

    const freezePath = `/patients/${route.patientId}/visits/${route.visitId}/clinical-reports/${route.reportId}/freeze-sources`;
    const responsePromise = page.waitForResponse(
      (response) =>
        responsePath(response) === freezePath &&
        response.request().method() === 'POST',
    );
    await submit.click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const requestBody = response.request().postDataJSON() as Record<
      string,
      unknown
    >;
    expect(Object.keys(requestBody).sort()).toEqual([
      'confirm',
      'expectedUpdatedAt',
      'freezeNote',
    ]);
    expect(requestBody).toMatchObject({
      confirm: true,
      freezeNote: original.freezeNote,
    });
    const result = (await response.json()) as FreezeClinicalReportSourcesResponse;
    const receipt = result.sourceFreezeReceipt;
    expect(receipt).toMatchObject({
      state: 'completed',
      alreadyFrozen: false,
      resumedExisting: true,
      freezeId: original.freezeId,
      freezeNote: original.freezeNote,
      startedAt: original.startedAt,
      sourceLockedAt: original.sourceLockedAt,
      startedBy: original.startedBy,
      completedAt: expect.any(String),
      completedBy: {
        operatorId: session.user.id,
        operatorName: session.user.displayName,
        operatorRole: 'doctor',
      },
    });
    expect(result.report).toMatchObject({
      id: route.reportId,
      status: 'confirmed',
      lockedAt: initialReport.lockedAt,
      archivedAt: null,
      voidedAt: null,
      sourceFreeze: {
        state: 'completed',
        freezeId: original.freezeId,
        freezeNote: original.freezeNote,
        startedAt: original.startedAt,
        sourceLockedAt: original.sourceLockedAt,
        startedBy: original.startedBy,
      },
    });
    expect(receipt.expectedCounts).toEqual(original.expectedCounts);
    expect(receipt.previouslyFrozenCounts).toEqual(
      original.previouslyFrozenCounts,
    );
    expect(receipt.completedCounts).toEqual(receipt.expectedCounts);
    for (const [, key] of COUNT_ROWS) {
      expect(
        receipt.newlyFrozenCounts[key] + receipt.previouslyFrozenCounts[key],
      ).toBe(receipt.expectedCounts[key]);
    }

    const freezeEntries = session.ledger.entries().filter(
      (entry) =>
        entry.method === 'POST' && entry.safeUrlPattern === FREEZE_PATTERN,
    );
    expect(freezeEntries).toEqual([
      expect.objectContaining({
        status: 200,
        failureReason: null,
        bodyKeys: ['confirm', 'expectedUpdatedAt', 'freezeNote'],
      }),
    ]);
    await expect(
      page.getByText('已有来源冻结流程已恢复并完成。', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('当前页面会话来源冻结回执', { exact: true }),
    ).toBeVisible();
    await expect(summaryValue(page.locator('body'), 'resumedExisting')).toHaveText(
      'true',
    );
    await expect(
      page.getByText('报告来源链冻结已完成。', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText('首次来源冻结完成', { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText('已回滚', { exact: true })).toHaveCount(0);
    await expect(page.getByText('解冻后重新冻结', { exact: true })).toHaveCount(0);
    const completedSummary = page.locator(
      'section[aria-labelledby="clinical-report-source-freeze-summary-heading"]',
    );
    await expect(completedSummary.getByRole('table')).toHaveCount(2);
    await expectCountTable(completedSummary.getByRole('table').nth(0), receipt);
    await expectCountTable(completedSummary.getByRole('table').nth(1), receipt);
    expect(adjacentLifecycleWrites(session.ledger.entries())).toHaveLength(0);
    await assertStableNetworkCounts(session.ledger, {
      freezePosts: 1,
      latestGets: 1,
    });

    const latest = page.waitForResponse(
      (candidate) =>
        responsePath(candidate).endsWith('/clinical-reports/latest') &&
        candidate.request().method() === 'GET' &&
        candidate.status() === 200,
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    const reloaded = (await (await latest).json()) as { report: ClinicalReport };
    expect(reloaded.report).toMatchObject({
      id: route.reportId,
      status: 'confirmed',
      lockedAt: initialReport.lockedAt,
      archivedAt: null,
      sourceFreeze: {
        state: 'completed',
        freezeId: original.freezeId,
        freezeNote: original.freezeNote,
        startedAt: original.startedAt,
        sourceLockedAt: original.sourceLockedAt,
        startedBy: original.startedBy,
      },
    });
    await expect(
      page.getByText('当前页面会话来源冻结回执', { exact: true }),
    ).toHaveCount(0);
    const persistedSummary = page.locator(
      'section[aria-labelledby="clinical-report-source-freeze-summary-heading"]',
    );
    await expect(persistedSummary.getByRole('table')).toHaveCount(1);
    await expectCountTable(persistedSummary.getByRole('table'), receipt);
    await expect(summaryValue(persistedSummary, '技术追溯号')).toHaveText(
      visibleFreezeId,
    );
    await expect(summaryValue(persistedSummary, '来源冻结流程说明')).toHaveText(
      visibleNote,
    );
    await expect(summaryValue(persistedSummary, '发起人')).toHaveText(
      visibleStartedActor,
    );
    await expect(summaryValue(persistedSummary, '开始时间')).toHaveText(
      visibleStartedAt,
    );
    await expect(
      summaryValue(persistedSummary, '来源统一锁定时间'),
    ).toHaveText(visibleSourceLockedAt);
    expect(adjacentLifecycleWrites(session.ledger.entries())).toHaveLength(0);
    await assertStableNetworkCounts(session.ledger, {
      freezePosts: 1,
      latestGets: 2,
    });

    const network = await session.ledger.detach();
    expect((await roleContexts.closeAll()).activeContextCount).toBe(0);
    console.log(
      `B13_U03_RESUME_EVIDENCE ${safeJsonStringify(
        {
          doctorContexts: 1,
          healthStatus: session.healthStatus,
          freezePostCount: 1,
          freezeStatus: 200,
          resumedExisting: true,
          originalFactsPreserved: true,
          completed: true,
          receiptClearedAfterReload: true,
          persistedSummaryAfterReload: true,
          adjacentLifecycleWrites: 0,
          failedRequestCount: network.failedRequestCount,
          contextsClosed: true,
        },
        [original.freezeId, original.freezeNote],
      )}`,
    );
  });

  test('keeps the local note after one aborted request and clears it after reload', async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    test.setTimeout(75_000);
    const runtime = await readDescriptor();
    const env: EnabledEnvironment = environment;
    const route = runtime.scenarios['source-freeze-null'];
    const session = await login({
      factory: roleContexts,
      account: runtime.accounts.doctor.loginIdentifier,
      password: requireSecret(),
      environment: env,
      label: 'u03-uncertain-doctor',
      viewport: MOBILE_VIEWPORT,
    });
    const { page } = session.roleContext;
    const initialReport = await openReport(page, route, env);
    expect(initialReport.sourceFreeze).toBeNull();
    await assertNoGlobalHorizontalOverflow(page);

    await page
      .getByRole('button', { name: '准备冻结报告来源', exact: true })
      .click();
    const note = page.getByLabel('来源冻结流程说明（必填）');
    const confirmation = page.getByRole('checkbox', {
      name: '我已核对当前已确认并锁定的报告，理解来源冻结不可逆，且该操作可能跨多个集合逐步完成。',
      exact: true,
    });
    const submit = page.getByRole('button', {
      name: '确认冻结报告来源',
      exact: true,
    });
    await expect(note).toHaveAccessibleName('来源冻结流程说明（必填）');
    await expect(
      page.locator('label[for="clinical-report-source-freeze-note"]'),
    ).toBeVisible();
    await expect(confirmation).toHaveAccessibleName(
      '我已核对当前已确认并锁定的报告，理解来源冻结不可逆，且该操作可能跨多个集合逐步完成。',
    );
    await note.fill(LOCAL_NOTE);
    await confirmation.check();
    await expect(submit).toBeEnabled();

    const storageBeforeRequest = await auditSourceFreezeDraftStorage(page);
    const latestBeforeSubmit = session.ledger.count({
      method: 'GET',
      safeUrlPattern: LATEST_PATTERN,
    });
    expect(latestBeforeSubmit).toBe(1);
    const freezePath = `/patients/${route.patientId}/visits/${route.visitId}/clinical-reports/${route.reportId}/freeze-sources`;
    const abort = new OneShotRequestAbort(
      page,
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname === freezePath,
    );
    await abort.install();
    await submit.click();
    await abort.waitForStarted();
    const alert = page.getByRole('alert').filter({ hasText: UNCERTAIN_MESSAGE });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(UNCERTAIN_MESSAGE);
    await expect(
      page.getByRole('button', {
        name: '手工重新加载最新报告',
        exact: true,
      }),
    ).toBeVisible();
    const abortSummary = await abort.dispose();
    expect(abortSummary).toEqual({
      matchedRequestCount: 1,
      abortedRequestCount: 1,
      continuedRequestCount: 0,
    });
    await expect
      .poll(() =>
        session.ledger.count({
          method: 'POST',
          safeUrlPattern: FREEZE_PATTERN,
          failureReason: 'aborted',
        }),
      )
      .toBe(1);
    await expect(note).toHaveValue(LOCAL_NOTE);
    await expect(confirmation).not.toBeChecked();
    await expect(submit).toBeDisabled();
    await expect(
      page.getByText('当前页面会话来源冻结回执', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText('报告来源链冻结已完成。', { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText('已回滚', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', {
        name: '准备继续完成来源冻结',
        exact: true,
      }),
    ).toHaveCount(0);
    await assertStableNetworkCounts(session.ledger, {
      freezePosts: 1,
      latestGets: latestBeforeSubmit,
    });
    const storageAfterAbort = await auditSourceFreezeDraftStorage(page);

    const latest = page.waitForResponse(
      (candidate) =>
        responsePath(candidate).endsWith('/clinical-reports/latest') &&
        candidate.request().method() === 'GET' &&
        candidate.status() === 200,
    );
    let beforeUnloadDialogCount = 0;
    let otherDialogCount = 0;
    const dialogActions: Promise<void>[] = [];
    const onDialog = (dialog: import('@playwright/test').Dialog): void => {
      if (dialog.type() === 'beforeunload') {
        beforeUnloadDialogCount += 1;
        dialogActions.push(dialog.accept());
      } else {
        otherDialogCount += 1;
        dialogActions.push(dialog.dismiss());
      }
    };
    page.on('dialog', onDialog);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await Promise.all(dialogActions);
    page.off('dialog', onDialog);
    expect(beforeUnloadDialogCount).toBeLessThanOrEqual(1);
    expect(otherDialogCount).toBe(0);
    const reloaded = (await (await latest).json()) as { report: ClinicalReport };
    expect(reloaded.report).toMatchObject({
      id: route.reportId,
      status: initialReport.status,
      lockedAt: initialReport.lockedAt,
      archivedAt: initialReport.archivedAt,
      updatedAt: initialReport.updatedAt,
      sourceFreeze: null,
    });
    await expect(page.getByText(LOCAL_NOTE, { exact: true })).toHaveCount(0);
    await expect(note).toHaveCount(0);
    await expect(confirmation).toHaveCount(0);
    await expect(
      page.getByRole('button', {
        name: '准备冻结报告来源',
        exact: true,
      }),
    ).toBeEnabled();
    await expect(
      page.getByText('报告来源尚未冻结。', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('当前页面会话来源冻结回执', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', {
        name: '准备继续完成来源冻结',
        exact: true,
      }),
    ).toHaveCount(0);
    await assertNoGlobalHorizontalOverflow(page);
    const storageAfterReload = await auditSourceFreezeDraftStorage(page);
    await assertStableNetworkCounts(session.ledger, {
      freezePosts: 1,
      latestGets: latestBeforeSubmit + 1,
    });
    const freezeEntries = session.ledger.entries().filter(
      (entry) =>
        entry.method === 'POST' && entry.safeUrlPattern === FREEZE_PATTERN,
    );
    expect(freezeEntries).toEqual([
      expect.objectContaining({
        status: null,
        failureReason: 'aborted',
        bodyKeys: ['confirm', 'expectedUpdatedAt', 'freezeNote'],
      }),
    ]);
    expect(adjacentLifecycleWrites(session.ledger.entries())).toHaveLength(0);

    const network = await session.ledger.detach();
    expect((await roleContexts.closeAll()).activeContextCount).toBe(0);
    console.log(
      `B13_U03_UNCERTAIN_EVIDENCE ${safeJsonStringify(
        {
          doctorContexts: 1,
          healthStatus: session.healthStatus,
          viewport: MOBILE_VIEWPORT,
          labels: { textarea: true, checkbox: true },
          abort: abortSummary,
          freezePostCount: 1,
          uncertainAlert: true,
          manualLatestAvailable: true,
          localNoteRetainedAfterAbort: true,
          checkboxRetainedAfterAbort: false,
          automaticPostRetry: 0,
          automaticLatestAfterAbort: 0,
          automaticResume: 0,
          storage: {
            beforeRequest: storageBeforeRequest,
            afterAbort: storageAfterAbort,
            afterReload: storageAfterReload,
          },
          reload: {
            beforeUnloadDialogCount,
            localNoteCleared: true,
            checkboxCleared: true,
            sourceFreezeNull: true,
          },
          adjacentLifecycleWrites: 0,
          horizontalOverflow: false,
          failedRequestCount: network.failedRequestCount,
          contextsClosed: true,
        },
        [LOCAL_NOTE],
      )}`,
    );
  });
});
