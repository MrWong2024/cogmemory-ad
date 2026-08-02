import { readFile } from 'node:fs/promises';
import type { Locator, Page, Response } from '@playwright/test';

import { formatClinicalReportDate } from '../../../src/features/assessments/lib/clinical-report-display';
import type { ClinicalReport } from '../../../src/features/assessments/types/clinical-report';
import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from '../support/acceptance-env';
import { expect, test } from '../support/acceptance-test';
import {
  NetworkLedger,
  type NetworkLedgerEntry,
} from '../support/network-ledger';
import type {
  AcceptanceRole,
  RoleContext,
  RoleContextFactory,
} from '../support/role-context-factory';
import { safeJsonStringify } from '../support/safe-output';

type Key = 'archive-ready' | 'archive-completed';
type Descriptor = {
  schemaVersion: 1;
  batch: 'B14';
  profile: 'B14-P1-entry-readonly';
  namespace: string;
  accounts: Record<'doctor' | 'nurse', { loginIdentifier: string }>;
  scenarios: Record<
    Key,
    {
      patientId: string;
      visitId: string;
      reportId: string;
      navigationPath: string;
    }
  >;
};
type EnabledEnvironment = Extract<
  ReturnType<typeof resolveLiveAcceptanceEnvironment>,
  { enabled: true }
>;
type Session = {
  roleContext: RoleContext;
  ledger: NetworkLedger;
  authMeRole: AcceptanceRole;
  cookieValue: string;
  cookieBoundary: {
    count: 1;
    name: 'cogmemory_ad_session';
    httpOnly: true;
    secure: false;
    sameSite: 'Lax';
  };
};

const environment = resolveLiveAcceptanceEnvironment();
const MARKER = 'B14-U01 synthetic readable report marker.';
const CONFIRMATION_NOTE = 'B14 脱敏确认说明';
const LOCK_NOTE = 'B14 脱敏锁定说明';
const FREEZE_NOTE = 'B14 脱敏来源冻结说明';
const ARCHIVE_NOTE = 'B14 脱敏归档说明';
const LATEST_PATTERN =
  '/patients/<id>/visits/<id>/clinical-reports/latest';
const ARCHIVE_PATTERN =
  '/patients/<id>/visits/<id>/clinical-reports/<id>/archive';
const OLD_WRITE_CONTROLS = [
  '编辑临床人员内容',
  '准备提交医生确认',
  '准备确认报告',
  '准备锁定报告',
  '确认不可逆锁定',
  '准备冻结报告来源',
  '准备继续完成来源冻结',
  '确认冻结报告来源',
  '确认继续同一冻结流程',
  '准备归档报告',
  '确认归档报告',
] as const;

function requireSecret(): string {
  const value = process.env.B14_U01_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error('B14_U01_LOGIN_SECRET is required');
  }
  return value;
}

async function readDescriptor(): Promise<Descriptor> {
  const path = process.env.B14_U01_RUNTIME_PATH;
  if (!path) throw new Error('B14_U01_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(path, 'utf8')) as Partial<Descriptor>;
  expect(value).toMatchObject({
    schemaVersion: 1,
    batch: 'B14',
    profile: 'B14-P1-entry-readonly',
  });
  expect(value.namespace).toMatch(/^[a-z0-9][a-z0-9-]{2,19}$/);
  expect(value.accounts?.doctor.loginIdentifier).toBeTruthy();
  expect(value.accounts?.nurse.loginIdentifier).toBeTruthy();
  for (const key of ['archive-ready', 'archive-completed'] as const) {
    expect(value.scenarios?.[key]).toMatchObject({
      patientId: expect.stringMatching(/^[a-f\d]{24}$/),
      visitId: expect.stringMatching(/^[a-f\d]{24}$/),
      reportId: expect.stringMatching(/^[a-f\d]{24}$/),
      navigationPath: expect.stringMatching(
        /^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}$/,
      ),
    });
  }
  return value as Descriptor;
}

function responsePath(response: Response): string {
  return new URL(response.url()).pathname;
}

async function assertCors(
  response: Response,
  frontendOrigin: string,
): Promise<void> {
  const headers = await response.allHeaders();
  expect(headers['access-control-allow-origin']).toBe(frontendOrigin);
  expect(headers['access-control-allow-credentials']).toBe('true');
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
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    return response.status;
  }, input.environment.backendOrigin);
  const healthResponse = await healthResponsePromise;
  expect(healthStatus).toBe(200);
  await assertCors(healthResponse, input.environment.frontendOrigin);

  const loginResponsePromise = page.waitForResponse(
    (response) =>
      responsePath(response) === '/auth/login' &&
      response.request().method() === 'POST',
  );
  const authMeResponsePromise = page.waitForResponse(
    (response) =>
      responsePath(response) === '/auth/me' &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  await page.getByLabel('账号').fill(input.account);
  await page.getByLabel('密码').fill(input.password);
  await page.getByRole('button', { name: '登录系统', exact: true }).click();
  const [loginResponse, authMeResponse] = await Promise.all([
    loginResponsePromise,
    authMeResponsePromise,
  ]);
  expect(loginResponse.status()).toBe(201);
  expect((await loginResponse.request().allHeaders()).origin).toBe(
    input.environment.frontendOrigin,
  );
  await assertCors(loginResponse, input.environment.frontendOrigin);
  await assertCors(authMeResponse, input.environment.frontendOrigin);
  const me = (await authMeResponse.json()) as {
    authenticated?: unknown;
    user?: { roles?: unknown };
  };
  expect(me).toMatchObject({
    authenticated: true,
    user: { roles: [input.role] },
  });
  await expect(page).toHaveURL(`${input.environment.frontendOrigin}/dashboard`);
  const cookies = (
    await context.cookies(input.environment.backendOrigin)
  ).filter((cookie) => cookie.httpOnly);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatchObject({
    name: 'cogmemory_ad_session',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  });
  expect(cookies[0]?.value).toBeTruthy();
  return {
    roleContext,
    ledger,
    authMeRole: input.role,
    cookieValue: cookies[0]?.value ?? '',
    cookieBoundary: {
      count: 1,
      name: 'cogmemory_ad_session',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  };
}

async function openReport(
  page: Page,
  route: Descriptor['scenarios'][Key],
  enabledEnvironment: EnabledEnvironment,
): Promise<ClinicalReport> {
  const latestResponsePromise = page.waitForResponse(
    (response) =>
      responsePath(response).endsWith('/clinical-reports/latest') &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  await page.goto(
    `${enabledEnvironment.frontendOrigin}${route.navigationPath}`,
    { waitUntil: 'domcontentloaded' },
  );
  expect(await page.evaluate(() => window.location.origin)).toBe(
    enabledEnvironment.frontendOrigin,
  );
  const latestResponse = await latestResponsePromise;
  await assertCors(latestResponse, enabledEnvironment.frontendOrigin);
  const body = (await latestResponse.json()) as { report: ClinicalReport };
  expect(body.report.id).toBe(route.reportId);
  expect(body.report).not.toHaveProperty('metadata');
  expect(body.report).not.toHaveProperty('primaryScaleInstanceIds');
  expect(body.report).not.toHaveProperty('scoreResultIds');
  expect(body.report).not.toHaveProperty('cognitiveDomainResultIds');
  expect(body.report).not.toHaveProperty('mediaEvidenceIds');
  expect(body.report).not.toHaveProperty('lockedBy');
  expect(body.report).not.toHaveProperty('archivedBy');
  expect(body.report.sourceFreeze ?? {}).not.toHaveProperty('scope');
  await expect(page.getByText(MARKER, { exact: true })).toBeVisible();
  return body.report;
}

function writeCounts(entries: readonly NetworkLedgerEntry[]) {
  const writes = entries.filter(
    (entry) =>
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(entry.method) &&
      entry.safeUrlPattern !== '/auth/login',
  );
  const count = (pattern: RegExp) =>
    writes.filter((entry) => pattern.test(entry.safeUrlPattern)).length;
  return {
    allBusinessWrites: writes.length,
    archive: count(/\/archive$/i),
    editDraft: count(/\/draft$/i),
    submitConfirmation: count(/\/submit-confirmation$/i),
    confirm: count(/\/confirm$/i),
    lock: count(/\/lock$/i),
    freezeSources: count(/\/freeze-sources$/i),
    correction: count(/\/corrections?(?:\/|$)/i),
    voidOrDelete: writes.filter(
      (entry) =>
        entry.method === 'DELETE' || /\/(?:void|delete)(?:\/|$)/i.test(entry.safeUrlPattern),
    ).length,
    pdfPrintDownload: count(/\/(?:pdf|print|download)(?:\/|$)/i),
    aiOrLlm: count(/\/(?:ai|llm)(?:\/|$)/i),
  };
}

function assertNoBusinessWrites(
  ledger: NetworkLedger,
  start = 0,
): ReturnType<typeof writeCounts> {
  const counts = writeCounts(ledger.entries().slice(start));
  expect(counts).toEqual({
    allBusinessWrites: 0,
    archive: 0,
    editDraft: 0,
    submitConfirmation: 0,
    confirm: 0,
    lock: 0,
    freezeSources: 0,
    correction: 0,
    voidOrDelete: 0,
    pdfPrintDownload: 0,
    aiOrLlm: 0,
  });
  expect(
    ledger.count({ method: 'POST', safeUrlPattern: ARCHIVE_PATTERN }),
  ).toBe(0);
  return counts;
}

function requiredString(value: string | null | undefined, label: string) {
  if (!value) throw new Error(`${label} is required`);
  return value;
}

function sectionForHeading(page: Page, name: string): Locator {
  return page
    .getByRole('heading', { name, exact: true })
    .locator('xpath=ancestor::section[1]');
}

async function expectDefinitionValue(
  scope: Locator,
  label: string,
  value: string,
): Promise<void> {
  const term = scope.locator('dt').filter({ hasText: label });
  await expect(term).toHaveCount(1);
  await expect(term.locator('xpath=following-sibling::dd[1]')).toHaveText(
    value,
  );
}

async function expectNoOldWriteControls(page: Page): Promise<void> {
  for (const name of OLD_WRITE_CONTROLS) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(
    page.getByRole('heading', {
      name: '二次确认不可撤销归档',
      exact: true,
    }),
  ).toHaveCount(0);
}

async function closeAndReport(
  factory: RoleContextFactory,
  sessions: Session[],
  summary: Record<string, unknown>,
  forbidden: string[],
): Promise<void> {
  for (const session of sessions) await session.ledger.detach();
  const closed = await factory.closeAll();
  expect(closed.activeContextCount).toBe(0);
  console.log(
    `B14_U01_EVIDENCE ${safeJsonStringify(
      { ...summary, contextsClosed: true, activeContextCount: 0 },
      forbidden,
    )}`,
  );
}

test.describe('B14-U01 report archive entry and archived readonly state', () => {
  test.beforeEach(() => {
    test.skip(
      !environment.enabled,
      'BROWSER_ACCEPTANCE_RUN_LIVE=1 is required',
    );
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test('doctor opens and cancels archive confirmation while nurse remains readonly', async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    const enabledEnvironment: EnabledEnvironment = environment;
    const descriptor = await readDescriptor();
    const password = requireSecret();
    const route = descriptor.scenarios['archive-ready'];
    const doctor = await login({
      factory: roleContexts,
      role: 'doctor',
      label: 'archive-ready-doctor',
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      environment: enabledEnvironment,
    });
    const nurse = await login({
      factory: roleContexts,
      role: 'nurse',
      label: 'archive-ready-nurse',
      account: descriptor.accounts.nurse.loginIdentifier,
      password,
      environment: enabledEnvironment,
    });
    expect(doctor.authMeRole).toBe('doctor');
    expect(nurse.authMeRole).toBe('nurse');
    expect(doctor.roleContext.context).not.toBe(nurse.roleContext.context);
    expect(doctor.cookieValue).not.toBe(nurse.cookieValue);
    expect(roleContexts.summary().activeContextCount).toBe(2);

    const doctorReport = await openReport(
      doctor.roleContext.page,
      route,
      enabledEnvironment,
    );
    expect(doctorReport).toMatchObject({
      id: route.reportId,
      status: 'confirmed',
      source: 'mixed',
      qualityStatus: 'passed',
      isFinal: true,
      archivedAt: null,
      archive: null,
      sourceFreeze: { state: 'completed' },
    });
    expect(doctorReport.lockedAt).toEqual(expect.any(String));
    const doctorPage = doctor.roleContext.page;
    await expect(
      doctorPage.getByText('已确认报告', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      doctorPage.getByText('已锁定', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      doctorPage.getByRole('heading', {
        name: '报告来源链冻结已完成',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      doctorPage.getByText('报告尚未归档。', { exact: true }),
    ).toBeVisible();
    const doctorBusinessStart = doctor.ledger.entries().length;
    const prepare = doctorPage.getByRole('button', {
      name: '准备归档报告',
      exact: true,
    });
    await expect(prepare).toBeEnabled();
    await prepare.click();
    await expect(
      doctorPage.getByRole('heading', {
        name: '二次确认不可撤销归档',
        exact: true,
      }),
    ).toBeVisible();
    const note = doctorPage.getByLabel('归档流程说明（必填）', {
      exact: true,
    });
    await expect(note).toHaveValue('');
    for (const oldText of [
      LOCK_NOTE,
      FREEZE_NOTE,
      CONFIRMATION_NOTE,
      'B14 safe doctor opinion',
    ]) {
      expect(await note.inputValue()).not.toContain(oldText);
    }
    const checkbox = doctorPage.getByRole('checkbox');
    await expect(checkbox).not.toBeChecked();
    await expect(
      doctorPage.getByRole('button', {
        name: '确认归档报告',
        exact: true,
      }),
    ).toBeDisabled();
    expect(
      doctor.ledger.count({ method: 'POST', safeUrlPattern: ARCHIVE_PATTERN }),
    ).toBe(0);
    await doctorPage
      .getByRole('button', { name: '取消', exact: true })
      .click();
    await expect(
      doctorPage.getByRole('heading', {
        name: '二次确认不可撤销归档',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(prepare).toBeEnabled();
    const doctorWrites = assertNoBusinessWrites(
      doctor.ledger,
      doctorBusinessStart,
    );
    doctor.ledger.assertNoPolling(
      { method: 'GET', safeUrlPattern: LATEST_PATTERN },
      1,
    );

    const nurseBusinessStart = nurse.ledger.entries().length;
    const nurseReport = await openReport(
      nurse.roleContext.page,
      route,
      enabledEnvironment,
    );
    expect(nurseReport.id).toBe(route.reportId);
    await expect(
      nurse.roleContext.page.getByText(MARKER, { exact: true }),
    ).toBeVisible();
    await expect(
      nurse.roleContext.page.getByText(
        '报告归档需由医生或管理员执行。',
        { exact: true },
      ),
    ).toBeVisible();
    for (const name of [
      '准备归档报告',
      '确认归档报告',
    ] as const) {
      await expect(
        nurse.roleContext.page.getByRole('button', { name, exact: true }),
      ).toHaveCount(0);
    }
    await expect(
      nurse.roleContext.page.getByRole('heading', {
        name: '二次确认不可撤销归档',
        exact: true,
      }),
    ).toHaveCount(0);
    const nurseWrites = assertNoBusinessWrites(
      nurse.ledger,
      nurseBusinessStart,
    );
    expect(
      nurse.ledger
        .entries()
        .filter(
          (entry) =>
            entry.safeUrlPattern === ARCHIVE_PATTERN && entry.status === 403,
        ),
    ).toHaveLength(0);
    nurse.ledger.assertNoPolling(
      { method: 'GET', safeUrlPattern: LATEST_PATTERN },
      1,
    );

    await closeAndReport(
      roleContexts,
      [doctor, nurse],
      {
        test: 'archive-ready-doctor-nurse',
        independentContexts: true,
        distinctSessionCookies: true,
        roles: { doctor: 'doctor', nurse: 'nurse' },
        cookieBoundary: doctor.cookieBoundary,
        doctor: {
          latestStatus: 200,
          formOpened: true,
          formCancelled: true,
          writes: doctorWrites,
        },
        nurse: {
          latestStatus: 200,
          readonlyExplanation: true,
          archive403: 0,
          writes: nurseWrites,
        },
      },
      [
        password,
        doctor.cookieValue,
        nurse.cookieValue,
        descriptor.accounts.doctor.loginIdentifier,
        descriptor.accounts.nurse.loginIdentifier,
        route.navigationPath,
        route.patientId,
        route.visitId,
        route.reportId,
      ],
    );
  });

  test('doctor reads the archived report with prior write controls closed', async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    const enabledEnvironment: EnabledEnvironment = environment;
    const descriptor = await readDescriptor();
    const password = requireSecret();
    const route = descriptor.scenarios['archive-completed'];
    const doctor = await login({
      factory: roleContexts,
      role: 'doctor',
      label: 'archive-completed-doctor',
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      environment: enabledEnvironment,
    });
    const businessStart = doctor.ledger.entries().length;
    const report = await openReport(
      doctor.roleContext.page,
      route,
      enabledEnvironment,
    );
    expect(report).toMatchObject({
      id: route.reportId,
      status: 'archived',
      source: 'mixed',
      qualityStatus: 'passed',
      isFinal: true,
      sourceFreeze: { state: 'completed' },
    });
    const lockedAt = requiredString(report.lockedAt, 'lockedAt');
    const archivedAt = requiredString(report.archivedAt, 'archivedAt');
    const sourceFreeze = report.sourceFreeze;
    const archive = report.archive;
    expect(sourceFreeze).not.toBeNull();
    expect(archive).not.toBeNull();
    expect(report.lock?.lockedAt).toBe(lockedAt);
    expect(archive?.archivedAt).toBe(archivedAt);
    expect(archive?.archiveId).toEqual(expect.any(String));
    expect(archive?.archivedBy).toMatchObject({
      operatorName: 'B14 测试医生',
      operatorRole: 'doctor',
    });
    expect(archive?.archiveNote).toBe(ARCHIVE_NOTE);
    expect(archive?.sourceFreezeId).toBe(sourceFreeze?.freezeId);
    expect(archive?.sourceFreezeCompletedAt).toBe(sourceFreeze?.completedAt);
    const sourceFreezeCompletedAt = requiredString(
      sourceFreeze?.completedAt,
      'sourceFreeze.completedAt',
    );
    const archiveId = requiredString(archive?.archiveId, 'archive.archiveId');
    const sourceFreezeId = requiredString(
      archive?.sourceFreezeId,
      'archive.sourceFreezeId',
    );
    const page = doctor.roleContext.page;
    await expect(page.getByText(MARKER, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '报告已归档', exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '归档安全摘要', exact: true }),
    ).toBeVisible();

    const lockSummary = sectionForHeading(page, '锁定摘要');
    await expectDefinitionValue(
      lockSummary,
      '锁定时间',
      formatClinicalReportDate(lockedAt),
    );
    const technical = page.locator('details').filter({
      has: page.getByText('查看报告技术信息与历史纳入范围', {
        exact: true,
      }),
    });
    await technical.locator('summary').click();
    await expectDefinitionValue(
      technical,
      '来源冻结完成时间',
      formatClinicalReportDate(sourceFreezeCompletedAt),
    );
    const archiveSummary = sectionForHeading(page, '归档安全摘要');
    await expectDefinitionValue(
      archiveSummary,
      '归档时间',
      formatClinicalReportDate(archivedAt),
    );
    await expectDefinitionValue(archiveSummary, '归档追溯号', archiveId);
    await expectDefinitionValue(
      archiveSummary,
      '归档人 / 角色',
      'B14 测试医生（医生）',
    );
    await expectDefinitionValue(
      archiveSummary,
      '归档流程说明',
      ARCHIVE_NOTE,
    );
    await expectDefinitionValue(
      archiveSummary,
      '来源冻结锚点',
      sourceFreezeId,
    );
    await expectDefinitionValue(
      archiveSummary,
      '锚定的来源冻结完成时间',
      formatClinicalReportDate(sourceFreezeCompletedAt),
    );
    await expect(
      page.getByText('当前页面会话归档回执', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        '当前报告只读，不显示再次归档或取消归档入口。归档不等于删除、作废、更正或生成 PDF。',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /unarchive|恢复.*confirmed/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: /unarchive|恢复.*confirmed/i }),
    ).toHaveCount(0);
    await expectNoOldWriteControls(page);
    const correctionEntryCount = await page
      .getByRole('button', { name: '准备版本化更正', exact: true })
      .count();
    const writes = assertNoBusinessWrites(doctor.ledger, businessStart);
    doctor.ledger.assertNoPolling(
      { method: 'GET', safeUrlPattern: LATEST_PATTERN },
      1,
    );

    await closeAndReport(
      roleContexts,
      [doctor],
      {
        test: 'archive-completed-doctor-readonly',
        role: 'doctor',
        latestStatus: 200,
        persistentArchiveSummary: true,
        distinctLifecycleTimes: {
          reportLock: true,
          sourceFreezeComplete: true,
          reportArchive: true,
        },
        oldWriteControls: 0,
        correctionEntryObservedWithoutClick: correctionEntryCount,
        writes,
      },
      [
        password,
        doctor.cookieValue,
        descriptor.accounts.doctor.loginIdentifier,
        route.navigationPath,
        route.patientId,
        route.visitId,
        route.reportId,
        archiveId,
        sourceFreezeId,
      ],
    );
  });
});
