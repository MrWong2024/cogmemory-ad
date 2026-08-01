import { readFile } from 'node:fs/promises';
import type { Page, Response } from '@playwright/test';

import type { ClinicalReport } from '../../../src/features/assessments/types/clinical-report';
import { assertDatabaseBoundaryIsClear, resolveLiveAcceptanceEnvironment } from '../support/acceptance-env';
import { expect, test } from '../support/acceptance-test';
import { NetworkLedger, type NetworkLedgerEntry } from '../support/network-ledger';
import type { AcceptanceRole, RoleContext, RoleContextFactory } from '../support/role-context-factory';

type Key = 'source-freeze-null' | 'source-freeze-in-progress' | 'source-freeze-completed';
type Descriptor = {
  schemaVersion: 1;
  batch: 'B13';
  profile: 'B13-P1-entry-persisted-states';
  accounts: Record<'doctor' | 'nurse', { loginIdentifier: string }>;
  scenarios: Record<Key, { reportId: string; navigationPath: string }>;
};
type EnabledEnvironment = Extract<ReturnType<typeof resolveLiveAcceptanceEnvironment>, { enabled: true }>;
type Session = { roleContext: RoleContext; ledger: NetworkLedger; authMeRole: AcceptanceRole };

const environment = resolveLiveAcceptanceEnvironment();
const MARKER = 'B13-U01 synthetic readable report marker.';
const IN_PROGRESS_NOTE = 'B13 U01 脱敏未完成来源冻结说明';
const COMPLETED_NOTE = 'B13 U01 脱敏已完成来源冻结说明';
const FREEZE_PATTERN = '/patients/<id>/visits/<id>/clinical-reports/<id>/freeze-sources';
const LATEST_PATTERN = '/patients/<id>/visits/<id>/clinical-reports/latest';

function requireSecret(): string {
  const value = process.env.B13_U01_LOGIN_SECRET;
  if (!value || value.length < 16) throw new Error('B13_U01_LOGIN_SECRET is required');
  return value;
}

async function descriptor(): Promise<Descriptor> {
  const path = process.env.B13_U01_RUNTIME_PATH;
  if (!path) throw new Error('B13_U01_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(path, 'utf8')) as Partial<Descriptor>;
  expect(value).toMatchObject({ schemaVersion: 1, batch: 'B13', profile: 'B13-P1-entry-persisted-states' });
  for (const key of ['source-freeze-null', 'source-freeze-in-progress', 'source-freeze-completed'] as const) {
    expect(value.scenarios?.[key].navigationPath).toMatch(/^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}$/);
  }
  return value as Descriptor;
}

function responsePath(response: Response): string {
  return new URL(response.url()).pathname;
}

async function login(input: {
  factory: RoleContextFactory;
  role: AcceptanceRole;
  label: string;
  account: string;
  password: string;
  environment: EnabledEnvironment;
}): Promise<Session> {
  const roleContext = await input.factory.create(input.role, input.label);
  const { context, page } = roleContext;
  const ledger = new NetworkLedger();
  await ledger.attach(page);
  await page.goto(`${input.environment.frontendOrigin}/login`, { waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => location.origin)).toBe(input.environment.frontendOrigin);
  const loginResponse = page.waitForResponse((response) => responsePath(response) === '/auth/login' && response.request().method() === 'POST');
  const meResponse = page.waitForResponse((response) => responsePath(response) === '/auth/me' && response.request().method() === 'GET' && response.status() === 200);
  await page.getByLabel('账号').fill(input.account);
  await page.getByLabel('密码').fill(input.password);
  await page.getByRole('button', { name: '登录系统', exact: true }).click();
  expect((await loginResponse).status()).toBe(201);
  const me = (await (await meResponse).json()) as { authenticated?: unknown; user?: { roles?: unknown } };
  expect(me).toMatchObject({ authenticated: true, user: { roles: [input.role] } });
  await expect(page).toHaveURL(`${input.environment.frontendOrigin}/dashboard`);
  const cookies = (await context.cookies(input.environment.backendOrigin)).filter((cookie) => cookie.httpOnly);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatchObject({ name: 'cogmemory_ad_session', httpOnly: true, secure: false, sameSite: 'Lax' });
  return { roleContext, ledger, authMeRole: input.role };
}

async function openReport(page: Page, route: { reportId: string; navigationPath: string }, env: EnabledEnvironment) {
  const response = page.waitForResponse((candidate) => responsePath(candidate).endsWith('/clinical-reports/latest') && candidate.request().method() === 'GET' && candidate.status() === 200);
  await page.goto(`${env.frontendOrigin}${route.navigationPath}`, { waitUntil: 'domcontentloaded' });
  const body = (await (await response).json()) as { report: ClinicalReport };
  expect(body.report).toMatchObject({ id: route.reportId, status: 'confirmed', source: 'mixed', qualityStatus: 'passed', isFinal: true });
  expect(body.report).not.toHaveProperty('metadata');
  expect(body.report.sourceFreeze ?? {}).not.toHaveProperty('scope');
  await expect(page.getByText(MARKER, { exact: true })).toBeVisible();
  return body.report;
}

function isReportWrite(entry: NetworkLedgerEntry): boolean {
  return entry.method !== 'GET' && entry.safeUrlPattern !== '/auth/login' && entry.safeUrlPattern.includes('/clinical-reports');
}

function assertNoWrites(ledger: NetworkLedger, start = 0): void {
  expect(ledger.entries().slice(start).filter(isReportWrite)).toHaveLength(0);
  expect(ledger.count({ method: 'POST', safeUrlPattern: FREEZE_PATTERN })).toBe(0);
}

async function close(factory: RoleContextFactory, sessions: Session[]): Promise<void> {
  for (const session of sessions) await session.ledger.detach();
  expect((await factory.closeAll()).activeContextCount).toBe(0);
}

async function expectNoFreezeControls(page: Page): Promise<void> {
  for (const name of ['准备冻结报告来源', '准备继续完成来源冻结', '确认冻结报告来源', '确认继续同一冻结流程']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
}

function assertNoInternalSourceDetails(text: string): void {
  for (const forbidden of ['a23SourceFreeze', 'ItemResponse', 'ScoreResult', 'CognitiveDomainResult', 'MediaEvidence']) {
    expect(text).not.toContain(forbidden);
  }
  expect(text).not.toMatch(/\b[a-f\d]{24}\b/i);
}

function requiredText(value: string | undefined): string {
  expect(value).toEqual(expect.any(String));
  return value ?? '';
}

test.describe('B13-U01 entry, human roles, and persisted source-freeze states', () => {
  test.beforeEach(() => {
    test.skip(!environment.enabled, 'BROWSER_ACCEPTANCE_RUN_LIVE=1 is required');
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test('shows the first source-freeze entry only to the doctor', async ({ roleContexts }) => {
    if (!environment.enabled) return;
    const runtime = await descriptor();
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const doctor = await login({ factory: roleContexts, role: 'doctor', label: 'null-doctor', account: runtime.accounts.doctor.loginIdentifier, password, environment: env });
    const nurse = await login({ factory: roleContexts, role: 'nurse', label: 'null-nurse', account: runtime.accounts.nurse.loginIdentifier, password, environment: env });
    expect(doctor.roleContext.context).not.toBe(nurse.roleContext.context);
    expect([doctor.authMeRole, nurse.authMeRole]).toEqual(['doctor', 'nurse']);
    const route = runtime.scenarios['source-freeze-null'];
    const doctorStart = doctor.ledger.entries().length;
    const report = await openReport(doctor.roleContext.page, route, env);
    expect(report).toMatchObject({ lockedAt: expect.any(String), sourceFreeze: null, archivedAt: null });
    const doctorPage = doctor.roleContext.page;
    for (const text of ['已确认报告', '已锁定', '报告来源尚未冻结。', '报告尚未归档']) {
      await expect(doctorPage.getByText(text, { exact: true }).first()).toBeVisible();
    }
    const prepare = doctorPage.getByRole('button', { name: '准备冻结报告来源', exact: true });
    await expect(prepare).toBeEnabled();
    await prepare.click();
    await expect(doctorPage.getByRole('heading', { name: '二次确认不可逆来源冻结', exact: true })).toBeVisible();
    await expect(doctorPage.getByRole('checkbox')).not.toBeChecked();
    assertNoWrites(doctor.ledger, doctorStart);
    await doctorPage.getByRole('button', { name: '取消', exact: true }).click();
    await expect(prepare).toBeEnabled();

    const nurseStart = nurse.ledger.entries().length;
    await openReport(nurse.roleContext.page, route, env);
    await expect(nurse.roleContext.page.getByText('来源冻结需由医生或管理员执行。', { exact: false })).toBeVisible();
    await expectNoFreezeControls(nurse.roleContext.page);
    assertNoWrites(nurse.ledger, nurseStart);
    await close(roleContexts, [doctor, nurse]);
    console.log('B13_U01_NULL_EVIDENCE doctor=doctor nurse=nurse isolated=true freezePosts=0 reportWrites=0');
  });

  test('shows the formal in-progress recovery and completed read-only states', async ({ roleContexts }) => {
    if (!environment.enabled) return;
    const runtime = await descriptor();
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const doctor = await login({ factory: roleContexts, role: 'doctor', label: 'persisted-doctor', account: runtime.accounts.doctor.loginIdentifier, password, environment: env });
    const nurse = await login({ factory: roleContexts, role: 'nurse', label: 'persisted-nurse', account: runtime.accounts.nurse.loginIdentifier, password, environment: env });
    expect(doctor.roleContext.context).not.toBe(nurse.roleContext.context);
    const doctorStart = doctor.ledger.entries().length;
    const progress = await openReport(doctor.roleContext.page, runtime.scenarios['source-freeze-in-progress'], env);
    expect(progress.sourceFreeze).toMatchObject({ state: 'in_progress', freezeNote: IN_PROGRESS_NOTE, expectedCounts: { scaleInstanceCount: 1, itemResponseCount: 1, scoreResultCount: 1, cognitiveDomainResultCount: 1, mediaEvidenceCount: 0, totalSourceCount: 4 }, previouslyFrozenCounts: { totalSourceCount: 0 }, completedAt: null, completedBy: null, completedCounts: null, newlyFrozenCounts: null });
    const progressFreeze = progress.sourceFreeze!;
    const doctorPage = doctor.roleContext.page;
    for (const text of ['来源冻结流程尚未完成', '部分来源可能已经冻结', '系统未执行自动回滚', '冻结尚未完成（in_progress）', '开始时间', '发起人', '预期数量', progressFreeze.freezeId, requiredText(progressFreeze.startedBy.operatorName), IN_PROGRESS_NOTE, '待完成']) {
      await expect(doctorPage.getByText(text, { exact: false }).first()).toBeVisible();
    }
    assertNoInternalSourceDetails(await doctorPage.locator('body').innerText());
    const resume = doctorPage.getByRole('button', { name: '准备继续完成来源冻结', exact: true });
    await expect(resume).toBeEnabled();
    const latestReads = doctor.ledger.count({ method: 'GET', safeUrlPattern: LATEST_PATTERN });
    const observationEnd = Date.now() + 700;
    await expect.poll(() => Date.now() < observationEnd ? -1 : doctor.ledger.count({ method: 'POST', safeUrlPattern: FREEZE_PATTERN }), { timeout: 2_000, intervals: [150, 200, 250] }).toBe(0);
    expect(doctor.ledger.count({ method: 'GET', safeUrlPattern: LATEST_PATTERN })).toBe(latestReads);
    await resume.click();
    await expect(doctorPage.getByRole('heading', { name: '二次确认继续同一来源冻结流程', exact: true })).toBeVisible();
    await expect(doctorPage.getByText('服务端首次来源冻结流程说明（只读）', { exact: true })).toBeVisible();
    await expect(doctorPage.getByText(progressFreeze.freezeId, { exact: true }).last()).toBeVisible();
    await expect(doctorPage.locator('textarea')).toHaveCount(0);
    await expect(doctorPage.getByRole('checkbox')).not.toBeChecked();
    await doctorPage.getByRole('button', { name: '取消', exact: true }).click();
    await expect(resume).toBeEnabled();
    assertNoWrites(doctor.ledger, doctorStart);

    const nurseStart = nurse.ledger.entries().length;
    await openReport(nurse.roleContext.page, runtime.scenarios['source-freeze-in-progress'], env);
    await expect(nurse.roleContext.page.getByText('等待医生或管理员明确继续完成同一流程。', { exact: false })).toBeVisible();
    await expectNoFreezeControls(nurse.roleContext.page);
    assertNoWrites(nurse.ledger, nurseStart);

    const completed = await openReport(doctorPage, runtime.scenarios['source-freeze-completed'], env);
    expect(completed).toMatchObject({ status: 'confirmed', lockedAt: expect.any(String), archivedAt: null, sourceFreeze: { state: 'completed', freezeNote: COMPLETED_NOTE, expectedCounts: { totalSourceCount: 4 }, completedCounts: { totalSourceCount: 4 }, newlyFrozenCounts: { totalSourceCount: 4 }, previouslyFrozenCounts: { totalSourceCount: 0 } } });
    const completedFreeze = completed.sourceFreeze!;
    for (const text of ['报告来源链冻结已完成', '来源冻结已完成（completed）', '开始时间', '完成时间', '发起人', '完成人', requiredText(completedFreeze.startedBy.operatorName), requiredText(completedFreeze.completedBy?.operatorName), COMPLETED_NOTE, '预期数量', '完成数量', '本次新增冻结', '此前已冻结', '量表实例', '题目记录', '评分结果', '认知域结果', '媒体证据', '已确认报告', '已锁定', '报告尚未归档']) {
      await expect(doctorPage.getByText(text, { exact: true }).first()).toBeVisible();
    }
    assertNoInternalSourceDetails(await doctorPage.locator('body').innerText());
    await expectNoFreezeControls(doctorPage);
    assertNoWrites(doctor.ledger, doctorStart);
    await close(roleContexts, [doctor, nurse]);
    console.log('B13_U01_PERSISTED_EVIDENCE doctor=doctor nurse=nurse inProgress=true completed=true automaticPost=0 reportWrites=0');
  });
});
