import { readFile } from 'node:fs/promises';

import type { Locator, Page, Response } from '@playwright/test';

import type {
  ClinicalReport,
  ClinicalReportSourceFreezeResourceCounts,
  FreezeClinicalReportSourcesResponse,
} from '../../../src/features/assessments/types/clinical-report';
import { assertDatabaseBoundaryIsClear, resolveLiveAcceptanceEnvironment } from '../support/acceptance-env';
import { expect, test } from '../support/acceptance-test';
import { ControlledRequestGate } from '../support/network-control';
import { NetworkLedger, type NetworkLedgerEntry } from '../support/network-ledger';
import type { RoleContext, RoleContextFactory } from '../support/role-context-factory';

type Descriptor = {
  schemaVersion: 1;
  batch: 'B13';
  profile: 'B13-P1-entry-persisted-states';
  accounts: { doctor: { loginIdentifier: string } };
  scenarios: {
    'source-freeze-null': {
      patientId: string;
      visitId: string;
      reportId: string;
      navigationPath: string;
    };
  };
};
type EnabledEnvironment = Extract<ReturnType<typeof resolveLiveAcceptanceEnvironment>, { enabled: true }>;
type Session = { roleContext: RoleContext; ledger: NetworkLedger };
type CountKey = Exclude<keyof ClinicalReportSourceFreezeResourceCounts, 'totalSourceCount'>;

const environment = resolveLiveAcceptanceEnvironment();
const MARKER = 'B13-U01 synthetic readable report marker.';
const NOTE = 'B13 U02 脱敏首次来源冻结说明';
const FREEZE_PATTERN = '/patients/<id>/visits/<id>/clinical-reports/<id>/freeze-sources';
const LATEST_PATTERN = '/patients/<id>/visits/<id>/clinical-reports/latest';
const COUNT_ROWS: readonly [string, CountKey | 'totalSourceCount'][] = [
  ['量表实例', 'scaleInstanceCount'],
  ['题目记录', 'itemResponseCount'],
  ['评分结果', 'scoreResultCount'],
  ['认知域结果', 'cognitiveDomainResultCount'],
  ['媒体证据', 'mediaEvidenceCount'],
  ['合计', 'totalSourceCount'],
];

function requireSecret(): string {
  const value = process.env.B13_U01_LOGIN_SECRET;
  if (!value || value.length < 16) throw new Error('B13_U01_LOGIN_SECRET is required');
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
}): Promise<Session> {
  const roleContext = await input.factory.create('doctor', 'u02-first-freeze-doctor');
  const { context, page } = roleContext;
  const ledger = new NetworkLedger();
  await ledger.attach(page);
  const health = await context.request.get(`${input.environment.backendOrigin}/health`, { timeout: 5_000 });
  expect(health.status()).toBe(200);
  await page.goto(`${input.environment.frontendOrigin}/login`, { waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => location.origin)).toBe(input.environment.frontendOrigin);
  const loginResponse = page.waitForResponse(
    (response) => responsePath(response) === '/auth/login' && response.request().method() === 'POST',
  );
  const meResponse = page.waitForResponse(
    (response) => responsePath(response) === '/auth/me' && response.request().method() === 'GET' && response.status() === 200,
  );
  await page.getByLabel('账号').fill(input.account);
  await page.getByLabel('密码').fill(input.password);
  await page.getByRole('button', { name: '登录系统', exact: true }).click();
  expect((await loginResponse).status()).toBe(201);
  expect(await (await meResponse).json()).toMatchObject({
    authenticated: true,
    user: { roles: ['doctor'] },
  });
  await expect(page).toHaveURL(`${input.environment.frontendOrigin}/dashboard`);
  const cookies = (await context.cookies(input.environment.backendOrigin)).filter((cookie) => cookie.httpOnly);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatchObject({
    name: 'cogmemory_ad_session',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  });
  return { roleContext, ledger };
}

async function openReport(
  page: Page,
  route: Descriptor['scenarios']['source-freeze-null'],
  env: EnabledEnvironment,
): Promise<ClinicalReport> {
  const latest = page.waitForResponse(
    (response) => responsePath(response).endsWith('/clinical-reports/latest') && response.request().method() === 'GET' && response.status() === 200,
  );
  await page.goto(`${env.frontendOrigin}${route.navigationPath}`, { waitUntil: 'domcontentloaded' });
  const body = (await (await latest).json()) as { report: ClinicalReport };
  expect(body.report).toMatchObject({
    id: route.reportId,
    status: 'confirmed',
    source: 'mixed',
    qualityStatus: 'passed',
    isFinal: true,
    lockedAt: expect.any(String),
    archivedAt: null,
    sourceFreeze: null,
  });
  await expect(page.getByText(MARKER, { exact: true })).toBeVisible();
  return body.report;
}

function counts(receipt: FreezeClinicalReportSourcesResponse['sourceFreezeReceipt']) {
  return [
    receipt.expectedCounts,
    receipt.completedCounts,
    receipt.newlyFrozenCounts,
    receipt.previouslyFrozenCounts,
  ] as const;
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

function adjacentLifecycleWrites(entries: NetworkLedgerEntry[]): NetworkLedgerEntry[] {
  return entries.filter(
    (entry) =>
      entry.method !== 'GET' &&
      entry.safeUrlPattern !== '/auth/login' &&
      entry.safeUrlPattern !== FREEZE_PATTERN &&
      (/clinical-reports|\/ai(?:\/|$)|\/llm(?:\/|$)/.test(entry.safeUrlPattern) ||
        /pdf|print|download/.test(entry.safeUrlPattern)),
  );
}

function expectNoInternalSourceDetails(text: string): void {
  for (const forbidden of ['metadata', 'scope', 'ItemResponse', 'ScoreResult', 'CognitiveDomainResult', 'MediaEvidence']) {
    expect(text).not.toContain(forbidden);
  }
  expect(text).not.toMatch(/\b[a-f\d]{24}\b/i);
}

test.describe('B13-U02 first real source freeze', () => {
  test.beforeEach(() => {
    test.skip(!environment.enabled, 'BROWSER_ACCEPTANCE_RUN_LIVE=1 is required');
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test('doctor completes one real first source freeze and reloads persisted facts', async ({ roleContexts }) => {
    if (!environment.enabled) return;
    const runtime = await readDescriptor();
    const env: EnabledEnvironment = environment;
    const route = runtime.scenarios['source-freeze-null'];
    const session = await login({
      factory: roleContexts,
      account: runtime.accounts.doctor.loginIdentifier,
      password: requireSecret(),
      environment: env,
    });
    const { page } = session.roleContext;
    const initialReport = await openReport(page, route, env);

    await page.getByRole('button', { name: '准备冻结报告来源', exact: true }).click();
    await expect(page.getByRole('heading', { name: '二次确认不可逆来源冻结', exact: true })).toBeVisible();
    for (const coreBoundary of [
      '报告锁定与来源冻结是两个独立阶段',
      '冻结可能跨多个集合逐步执行',
      '系统不会自动解冻或回滚',
      '系统不会自动恢复',
      '当前不提供 unfreeze、自动回滚、PDF、下载或 AI 操作',
    ]) {
      await expect(page.getByText(new RegExp(coreBoundary)).first()).toBeVisible();
    }
    await expect(page.getByText(/不预填 lockNote、confirmationNote，也不属于报告正文/)).toBeVisible();

    const note = page.getByLabel('来源冻结流程说明（必填）');
    const confirmation = page.getByRole('checkbox', { name: /我已核对当前已确认并锁定的报告/ });
    const submit = page.getByRole('button', { name: '确认冻结报告来源', exact: true });
    await expect(note).toHaveValue('');
    await expect(confirmation).not.toBeChecked();
    await expect(submit).toBeDisabled();
    await note.fill('  两字  ');
    await confirmation.check();
    await expect(submit).toBeDisabled();
    await note.fill(NOTE);
    await expect(confirmation).not.toBeChecked();
    await confirmation.check();
    await expect(submit).toBeEnabled();

    const freezePath = `/patients/${route.patientId}/visits/${route.visitId}/clinical-reports/${route.reportId}/freeze-sources`;
    const gate = new ControlledRequestGate(
      page,
      (request) => request.method() === 'POST' && new URL(request.url()).pathname === freezePath,
      10_000,
    );
    await gate.install();
    const freezeResponse = page.waitForResponse(
      (response) => responsePath(response) === freezePath && response.request().method() === 'POST',
    );
    await submit.click();
    await gate.waitForStarted();
    expect(gate.summary()).toMatchObject({ matchedRequestCount: 1 });
    await expect(page.getByRole('button', { name: '正在执行来源链冻结', exact: true })).toBeDisabled();
    await expect(note).toBeDisabled();
    await expect(confirmation).toBeDisabled();
    await expect(page.getByText(MARKER, { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        '该 POST 可能跨多个集合执行；系统不根据耗时猜测阶段，不显示百分比，也不会自动轮询、重试或恢复。',
        { exact: true },
      ),
    ).toBeVisible();
    expect(session.ledger.count({ method: 'POST', safeUrlPattern: FREEZE_PATTERN })).toBe(1);

    gate.resume();
    const response = await freezeResponse;
    expect(response.status()).toBe(200);
    const result = (await response.json()) as FreezeClinicalReportSourcesResponse;
    const receipt = result.sourceFreezeReceipt;
    expect(result.report).toMatchObject({
      id: route.reportId,
      status: 'confirmed',
      lockedAt: initialReport.lockedAt,
      archivedAt: null,
      sourceFreeze: { state: 'completed', freezeNote: NOTE },
    });
    expect(receipt).toMatchObject({
      state: 'completed',
      alreadyFrozen: false,
      resumedExisting: false,
      freezeNote: NOTE,
      startedBy: { operatorRole: 'doctor' },
      completedBy: { operatorRole: 'doctor' },
      startedAt: expect.any(String),
      completedAt: expect.any(String),
      sourceLockedAt: expect.any(String),
      freezeId: expect.any(String),
    });
    expect(receipt.freezeId.length).toBeGreaterThan(0);
    expect(result.report.sourceFreeze?.freezeId).toBe(receipt.freezeId);
    expect(result.report.sourceFreeze && counts(receipt)).toEqual([
      result.report.sourceFreeze?.expectedCounts,
      result.report.sourceFreeze?.completedCounts,
      result.report.sourceFreeze?.newlyFrozenCounts,
      result.report.sourceFreeze?.previouslyFrozenCounts,
    ]);
    expect(await gate.dispose()).toEqual({
      matchedRequestCount: 1,
      continuedRequestCount: 1,
      abortedRequestCount: 0,
    });

    const freezeEntries = session.ledger
      .entries()
      .filter((entry) => entry.method === 'POST' && entry.safeUrlPattern === FREEZE_PATTERN);
    expect(freezeEntries).toEqual([
      expect.objectContaining({
        status: 200,
        failureReason: null,
        bodyKeys: ['confirm', 'expectedUpdatedAt', 'freezeNote'],
      }),
    ]);
    session.ledger.assertNoAutomaticRetry({ method: 'POST', safeUrlPattern: FREEZE_PATTERN });
    expect(adjacentLifecycleWrites(session.ledger.entries())).toHaveLength(0);

    for (const text of [
      '报告来源链冻结已完成。',
      '已确认报告',
      '已锁定',
      '报告尚未归档',
      '当前页面会话来源冻结回执',
      '来源冻结安全摘要',
      NOTE,
      'completed',
      'alreadyFrozen',
      'resumedExisting',
      '开始时间',
      '完成时间',
      '来源统一锁定时间',
    ]) {
      await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
    }
    const summary = page.locator('section[aria-labelledby="clinical-report-source-freeze-summary-heading"]');
    await expect(summary).toBeVisible();
    await expect(summary.getByText(/（医生）/).first()).toBeVisible();
    const tables = summary.getByRole('table');
    await expect(tables).toHaveCount(2);
    await expectCountTable(tables.nth(0), receipt);
    await expectCountTable(tables.nth(1), receipt);
    expectNoInternalSourceDetails(await summary.innerText());
    await expect(page.getByText(MARKER, { exact: true })).toBeVisible();

    const latest = page.waitForResponse(
      (candidate) => responsePath(candidate).endsWith('/clinical-reports/latest') && candidate.request().method() === 'GET' && candidate.status() === 200,
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    const reloaded = (await (await latest).json()) as { report: ClinicalReport };
    expect(reloaded.report).toMatchObject({
      id: route.reportId,
      status: 'confirmed',
      lockedAt: initialReport.lockedAt,
      archivedAt: null,
      sourceFreeze: { state: 'completed', freezeNote: NOTE },
    });
    await expect(page.getByText('当前页面会话来源冻结回执', { exact: true })).toHaveCount(0);
    await expect(page.getByText('来源冻结安全摘要', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(NOTE, { exact: true }).first()).toBeVisible();
    const persistedSummary = page.locator('section[aria-labelledby="clinical-report-source-freeze-summary-heading"]');
    await expect(persistedSummary.getByRole('table')).toHaveCount(1);
    await expectCountTable(persistedSummary.getByRole('table'), receipt);
    expectNoInternalSourceDetails(await persistedSummary.innerText());
    await expect(page.getByText(MARKER, { exact: true })).toBeVisible();
    expect(session.ledger.count({ method: 'POST', safeUrlPattern: FREEZE_PATTERN })).toBe(1);
    session.ledger.assertNoAutomaticRetry({ method: 'POST', safeUrlPattern: FREEZE_PATTERN });
    session.ledger.assertNoPolling({ method: 'GET', safeUrlPattern: LATEST_PATTERN }, 2);
    expect(adjacentLifecycleWrites(session.ledger.entries())).toHaveLength(0);

    await session.ledger.detach();
    expect((await roleContexts.closeAll()).activeContextCount).toBe(0);
    console.log('B13_U02_EVIDENCE doctor_context=1 session_cookie=1 freeze_post=1 gate=1/1/0 reload_persisted=true');
  });
});
