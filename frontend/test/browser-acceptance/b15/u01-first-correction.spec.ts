import { readFile } from 'node:fs/promises';

import type { Locator, Page, Request, Response } from '@playwright/test';

import type {
  ClinicalReport,
  CreateClinicalReportCorrectionResponse,
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
import type {
  AcceptanceRole,
  RoleContext,
  RoleContextFactory,
} from '../support/role-context-factory';
import { safeJsonStringify } from '../support/safe-output';

type Scenario = {
  patientId: string;
  visitId: string;
  sourceReportId: string;
  navigationPath: string;
  preparedBaseline: Record<string, string | number>;
};

type Descriptor = {
  schemaVersion: 1;
  batch: 'B15';
  profile: 'B15-P1-first-correction';
  namespace: string;
  accounts: Record<'doctor' | 'nurse', { loginIdentifier: string }>;
  scenarios: Record<'first-correction-ready', Scenario>;
};

type EnabledEnvironment = Extract<
  ReturnType<typeof resolveLiveAcceptanceEnvironment>,
  { enabled: true }
>;

type Session = {
  roleContext: RoleContext;
  ledger: NetworkLedger;
  healthStatus: number;
  cookieValue: string;
  cookieCount: number;
};

type CapturedCorrectionRequest = {
  keys: string[];
  confirm: unknown;
  correctionReason: unknown;
  changeSummary: unknown;
  expectedUpdatedAt: unknown;
};

const environment = resolveLiveAcceptanceEnvironment();
const SOURCE_MARKER = 'B15-U01 synthetic first correction source marker.';
const CORRECTION_REASON = 'B15 U01 脱敏首次更正原因';
const CHANGE_SUMMARY = 'B15 U01 脱敏首次更正摘要';
const CORRECTION_PATTERN =
  '/patients/<id>/visits/<id>/clinical-reports/<id>/corrections';
const LATEST_PATTERN =
  '/patients/<id>/visits/<id>/clinical-reports/latest';
const AUTH_ME_PATTERN = '/auth/me';
const CHECKBOX_NAME =
  '我已核对原归档报告与线性版本边界，并明确确认创建或继续同一替代版本流程。';

function invariant(
  condition: unknown,
  safeMessage: string,
): asserts condition {
  if (!condition) throw new Error(safeMessage);
}

function requireSecret(): string {
  const value = process.env.B15_U01_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error('B15_U01_LOGIN_SECRET is required');
  }
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
    isObjectId(candidate.sourceReportId) &&
    typeof candidate.navigationPath === 'string' &&
    /^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}$/.test(
      candidate.navigationPath,
    ) &&
    Boolean(
      candidate.preparedBaseline &&
        typeof candidate.preparedBaseline === 'object' &&
        Object.keys(candidate.preparedBaseline).length > 0,
    )
  );
}

async function readDescriptor(): Promise<Descriptor> {
  const runtimePath = process.env.B15_U01_RUNTIME_PATH;
  if (!runtimePath) throw new Error('B15_U01_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(runtimePath, 'utf8')) as unknown;
  invariant(value && typeof value === 'object', 'U01 descriptor is invalid');
  const candidate = value as Partial<Descriptor>;
  invariant(candidate.schemaVersion === 1, 'U01 descriptor schema is invalid');
  invariant(candidate.batch === 'B15', 'U01 descriptor batch is invalid');
  invariant(
    candidate.profile === 'B15-P1-first-correction',
    'U01 descriptor profile is invalid',
  );
  invariant(
    typeof candidate.namespace === 'string' &&
      /^[a-z0-9][a-z0-9-]{2,19}$/.test(candidate.namespace),
    'U01 descriptor namespace is invalid',
  );
  invariant(
    typeof candidate.accounts?.doctor.loginIdentifier === 'string' &&
      candidate.accounts.doctor.loginIdentifier.length > 0 &&
      typeof candidate.accounts.nurse.loginIdentifier === 'string' &&
      candidate.accounts.nurse.loginIdentifier.length > 0 &&
      candidate.accounts.doctor.loginIdentifier !==
        candidate.accounts.nurse.loginIdentifier,
    'U01 accounts are invalid',
  );
  invariant(
    isScenario(candidate.scenarios?.['first-correction-ready']),
    'U01 scenario is invalid',
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
  role: Extract<AcceptanceRole, 'doctor' | 'nurse'>;
  label: string;
  account: string;
  password: string;
  environment: EnabledEnvironment;
  viewport?: { width: number; height: number };
}): Promise<Session> {
  const roleContext = await input.factory.create(input.role, input.label, {
    ...(input.viewport ? { viewport: input.viewport } : {}),
  });
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
  expect(await meResponse.json()).toMatchObject({
    authenticated: true,
    user: { roles: [input.role] },
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
    healthStatus,
    cookieValue: cookies[0].value,
    cookieCount: cookies.length,
  };
}

async function openReport(input: {
  page: Page;
  scenario: Scenario;
  environment: EnabledEnvironment;
  ledger: NetworkLedger;
  expectedReportId: string;
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
    body.report.id === input.expectedReportId,
    'Latest report identity mismatch',
  );
  return body.report;
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

function parseCorrectionRequest(request: Request): CapturedCorrectionRequest {
  const value = request.postDataJSON() as unknown;
  invariant(
    value && typeof value === 'object' && !Array.isArray(value),
    'Correction request body is invalid',
  );
  const body = value as Record<string, unknown>;
  return {
    keys: Object.keys(body).sort(),
    confirm: body.confirm,
    correctionReason: body.correctionReason,
    changeSummary: body.changeSummary,
    expectedUpdatedAt: body.expectedUpdatedAt,
  };
}

function requireCapturedCorrectionRequest(
  value: CapturedCorrectionRequest | null,
): CapturedCorrectionRequest {
  if (!value) throw new Error('Correction request was not captured');
  return value;
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
    (entry) => entry.safeUrlPattern !== CORRECTION_PATTERN,
  );
}

function countForbiddenGeneratedCalls(entries: NetworkLedgerEntry[]): number {
  return entries.filter((entry) =>
    /(?:pdf|print|download|\/ai(?:\/|$)|\/llm(?:\/|$))/i.test(
      entry.safeUrlPattern,
    ),
  ).length;
}

function publicProtectedFacts(report: ClinicalReport): string {
  return JSON.stringify({
    reportType: report.reportType,
    source: report.source,
    patientSnapshot: report.patientSnapshot,
    visitSnapshot: report.visitSnapshot,
    scaleTraces: report.scaleTraces,
    scoreSnapshots: report.scoreSnapshots,
    domainSnapshots: report.domainSnapshots,
    evidenceSnapshots: report.evidenceSnapshots,
    narrative: report.narrative,
    generation: report.generation,
  });
}

function assertSafeCorrectionResponse(
  response: CreateClinicalReportCorrectionResponse,
  initialReport: ClinicalReport,
): void {
  const { sourceReport, replacementReport, correctionReceipt } = response;
  const correction = sourceReport.correction;
  const lineage = replacementReport.replacementOf;
  invariant(correction, 'Source correction summary is missing');
  invariant(lineage, 'Replacement lineage summary is missing');
  invariant(initialReport.archive, 'Initial archive summary is missing');
  invariant(
    initialReport.sourceFreeze?.state === 'completed' &&
      initialReport.sourceFreeze.completedAt,
    'Initial source freeze summary is missing',
  );
  expect(correctionReceipt).toMatchObject({
    state: 'completed',
    alreadyCreated: false,
    resumedExisting: false,
    correctionNo: 1,
    correctionReason: CORRECTION_REASON,
    changeSummary: CHANGE_SUMMARY,
    previousReportVersion: 1,
    replacementReportVersion: 2,
  });
  expect(sourceReport).toMatchObject({
    id: initialReport.id,
    status: 'corrected',
    reportVersion: 1,
    reportCode: initialReport.reportCode,
    isFinal: true,
  });
  expect(replacementReport).toMatchObject({
    reportVersion: 2,
    status: 'draft',
    source: 'mixed',
    qualityStatus: 'needs_review',
    isFinal: false,
    confirmation: null,
    lockedAt: null,
    sourceFreeze: null,
    archivedAt: null,
    archive: null,
    correction: null,
  });
  expect(correctionReceipt.sourceReportId).toBe(sourceReport.id);
  expect(correctionReceipt.replacementReportId).toBe(replacementReport.id);
  expect(correctionReceipt.correctionId).toBe(correction.correctionId);
  expect(correctionReceipt.correctionId).toBe(lineage.correctionId);
  expect(correctionReceipt.correctionNo).toBe(correction.correctionNo);
  expect(correctionReceipt.correctionNo).toBe(lineage.correctionNo);
  expect(correctionReceipt.startedAt).toBe(correction.startedAt);
  expect(correctionReceipt.completedAt).toBe(correction.completedAt);
  expect(correctionReceipt.startedBy).toEqual(correction.startedBy);
  expect(correctionReceipt.completedBy).toEqual(correction.completedBy);
  expect(correctionReceipt.startedBy).toEqual(lineage.createdBy);
  expect(correctionReceipt.previousReportCode).toBe(
    correction.previousReportCode,
  );
  expect(correctionReceipt.previousReportCode).toBe(
    lineage.previousReportCode,
  );
  expect(correctionReceipt.replacementReportCode).toBe(
    correction.replacementReportCode,
  );
  expect(correctionReceipt.replacementReportCode).toBe(
    lineage.replacementReportCode,
  );
  expect(lineage.previousReportId).toBe(sourceReport.id);
  expect(lineage.correctionReason).toBe(CORRECTION_REASON);
  expect(lineage.changeSummary).toBe(CHANGE_SUMMARY);
  expect(lineage.sourceArchiveId).toBe(initialReport.archive.archiveId);
  expect(lineage.sourceArchivedAt).toBe(initialReport.archive.archivedAt);
  expect(lineage.sourceFreezeId).toBe(initialReport.sourceFreeze.freezeId);
  expect(lineage.sourceFreezeCompletedAt).toBe(
    initialReport.sourceFreeze.completedAt,
  );
  const serialized = JSON.stringify(response);
  for (const forbiddenKey of [
    'metadata',
    'a25Correction',
    'a25CorrectionReplacement',
    'correctionRecords',
    'auditLogId',
    'auditLogRefs',
    'primaryScaleInstanceIds',
    'scoreResultIds',
    'cognitiveDomainResultIds',
    'mediaEvidenceIds',
    'session',
    'cookie',
    'currentUser',
    'branch',
    '_id',
    '__v',
  ]) {
    expect(serialized.includes(`"${forbiddenKey}"`)).toBe(false);
  }
}

async function expectBusinessTrace(
  scope: Locator,
  response: CreateClinicalReportCorrectionResponse,
): Promise<void> {
  const { sourceReport, replacementReport, correctionReceipt } = response;
  await expect(scope.getByText(CORRECTION_REASON, { exact: true })).toHaveCount(
    2,
  );
  await expect(scope.getByText(CHANGE_SUMMARY, { exact: true })).toHaveCount(2);
  await expect(scope.getByText('更正序号', { exact: true })).toHaveCount(2);
  const sourceVersionReferences = scope.getByText(
    `${sourceReport.reportCode} / V${sourceReport.reportVersion}`,
    { exact: true },
  );
  await expect(sourceVersionReferences).toHaveCount(3);
  await expect(sourceVersionReferences.first()).toBeVisible();
  const replacementVersionReferences = scope.getByText(
    `${replacementReport.reportCode} / V${replacementReport.reportVersion}`,
    { exact: true },
  );
  await expect(replacementVersionReferences).toHaveCount(2);
  await expect(replacementVersionReferences.first()).toBeVisible();
  await expect(scope.getByText('发起人', { exact: true })).toBeVisible();
  await expect(scope.getByText('完成人', { exact: true })).toBeVisible();
  await expect(scope.getByText('创建人', { exact: true })).toBeVisible();
  await expect(
    scope.getByText(String(correctionReceipt.correctionNo), { exact: true }),
  ).toHaveCount(2);
}

async function expectAbsentSessionReceipts(page: Page): Promise<void> {
  for (const receiptText of [
    '本次编辑回执：',
    '本次提交回执：',
    '本次确认回执：',
    '本次锁定回执：',
    '本次来源冻结回执：',
    '本次归档回执：',
    '当前页面会话来源冻结回执',
    '当前页面会话归档回执',
  ]) {
    await expect(page.getByText(new RegExp(receiptText))).toHaveCount(0);
  }
}

async function expectOtherWriteActionsUnavailable(page: Page): Promise<void> {
  for (const action of [
    '准备编辑报告',
    '准备提交医生确认',
    '准备确认报告',
    '准备锁定报告',
    '准备冻结报告来源',
    '准备归档报告',
  ]) {
    const button = page.getByRole('button', { name: action, exact: true });
    if ((await button.count()) > 0) await expect(button).toBeDisabled();
  }
}

test.describe('B15-U01 first real versioned correction', () => {
  test.beforeEach(() => {
    test.skip(!environment.enabled, 'BROWSER_ACCEPTANCE_RUN_LIVE=1 is required');
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test('doctor creates one replacement while nurse remains readonly and reload keeps persistent lineage', async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const scenario = descriptor.scenarios['first-correction-ready'];

    const nurseSession = await login({
      factory: roleContexts,
      role: 'nurse',
      label: 'b15-u01-readonly-nurse',
      account: descriptor.accounts.nurse.loginIdentifier,
      password,
      environment: env,
    });
    const nurseReport = await openReport({
      page: nurseSession.roleContext.page,
      scenario,
      environment: env,
      ledger: nurseSession.ledger,
      expectedReportId: scenario.sourceReportId,
    });
    expect(nurseReport).toMatchObject({
      id: scenario.sourceReportId,
      status: 'archived',
      reportVersion: 1,
      replacementOf: null,
      isFinal: true,
      correction: null,
    });
    await expect(
      nurseSession.roleContext.page.getByText(SOURCE_MARKER, { exact: true }),
    ).toBeVisible();
    await expect(
      nurseSession.roleContext.page.getByText('报告已归档', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      nurseSession.roleContext.page.getByText(
        '版本化更正需由医生或管理员执行。',
        { exact: true },
      ),
    ).toBeVisible();
    for (const forbiddenAction of [
      '准备版本化更正',
      '继续完成版本化更正',
      '确认创建替代版本',
      '确认继续同一更正流程',
    ]) {
      await expect(
        nurseSession.roleContext.page.getByRole('button', {
          name: forbiddenAction,
          exact: true,
        }),
      ).toHaveCount(0);
    }
    expect(reportBusinessWrites(nurseSession.ledger.entries())).toHaveLength(0);
    expect(
      nurseSession.ledger.entries().filter((entry) => entry.status === 403),
    ).toHaveLength(0);
    expect(
      nurseSession.ledger.count({ method: 'GET', safeUrlPattern: LATEST_PATTERN }),
    ).toBe(1);
    expect(successfulAuthMeCount(nurseSession.ledger)).toBe(2);
    const nurseNetwork = await nurseSession.ledger.detach();
    await nurseSession.roleContext.context.close();

    const doctorSession = await login({
      factory: roleContexts,
      role: 'doctor',
      label: 'b15-u01-first-correction-doctor',
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      environment: env,
      viewport: { width: 390, height: 844 },
    });
    expect(doctorSession.cookieValue).not.toBe(nurseSession.cookieValue);
    const { page } = doctorSession.roleContext;
    const initialReport = await openReport({
      page,
      scenario,
      environment: env,
      ledger: doctorSession.ledger,
      expectedReportId: scenario.sourceReportId,
    });
    invariant(initialReport.updatedAt, 'Initial source updatedAt is missing');
    invariant(initialReport.lockedAt, 'Initial source lock is missing');
    invariant(
      initialReport.confirmation?.confirmedAt &&
        initialReport.confirmation.confirmedByRole === 'doctor',
      'Initial source confirmation is incomplete',
    );
    invariant(
      initialReport.sourceFreeze?.state === 'completed' &&
        initialReport.sourceFreeze.completedAt,
      'Initial source freeze is incomplete',
    );
    invariant(
      initialReport.archive?.archiveId && initialReport.archivedAt,
      'Initial source archive is incomplete',
    );
    expect(initialReport).toMatchObject({
      id: scenario.sourceReportId,
      status: 'archived',
      reportVersion: 1,
      replacementOf: null,
      source: 'mixed',
      qualityStatus: 'passed',
      isFinal: true,
      correction: null,
    });
    const initialProtectedFacts = publicProtectedFacts(initialReport);
    const initialLatestCount = doctorSession.ledger.count({
      method: 'GET',
      safeUrlPattern: LATEST_PATTERN,
    });
    await expect(page.getByText(SOURCE_MARKER, { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page
      .getByRole('button', { name: '准备版本化更正', exact: true })
      .click();
    const form = page.locator(
      'section[aria-labelledby="clinical-report-correction-heading"]',
    );
    await expect(
      form.getByRole('heading', {
        name: '二次确认版本化更正',
        exact: true,
      }),
    ).toBeVisible();
    const reason = form.getByLabel('更正原因', { exact: true });
    const summary = form.getByLabel('计划变更摘要', { exact: true });
    const confirmation = form.getByRole('checkbox', {
      name: CHECKBOX_NAME,
      exact: true,
    });
    const submit = form.getByRole('button', {
      name: '确认创建替代版本',
      exact: true,
    });
    const cancel = form.getByRole('button', { name: '取消', exact: true });
    await expect(reason).toHaveValue('');
    await expect(summary).toHaveValue('');
    await expect(form.getByText('0 / 2000', { exact: true })).toBeVisible();
    await expect(form.getByText('0 / 4000', { exact: true })).toBeVisible();
    for (const forbiddenPrefill of [
      initialReport.confirmation.confirmationNote,
      initialReport.lock?.lockNote,
      initialReport.sourceFreeze.freezeNote,
      initialReport.archive.archiveNote,
      initialReport.narrative?.chiefSummary,
      initialReport.narrative?.doctorOpinion,
    ]) {
      if (forbiddenPrefill) {
        expect((await reason.inputValue()).includes(forbiddenPrefill)).toBe(false);
        expect((await summary.inputValue()).includes(forbiddenPrefill)).toBe(false);
      }
    }
    await expect(confirmation).not.toBeChecked();
    await expect(submit).toBeDisabled();

    await reason.click();
    await expect(reason).toBeFocused();
    await page.keyboard.type('ab');
    await page.keyboard.press('Tab');
    await expect(summary).toBeFocused();
    await page.keyboard.type('xy');
    await page.keyboard.press('Tab');
    await expect(confirmation).toBeFocused();
    await page.keyboard.press('Space');
    await expect(confirmation).toBeChecked();
    await expect(submit).toBeDisabled();
    await expect(
      form.getByText('更正原因至少需要 3 个字符。', { exact: true }),
    ).toBeVisible();
    await expect(
      form.getByText('计划变更摘要至少需要 3 个字符。', { exact: true }),
    ).toBeVisible();

    await page.keyboard.press('Shift+Tab');
    await expect(summary).toBeFocused();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(CHANGE_SUMMARY);
    await expect(summary).toHaveValue(CHANGE_SUMMARY);
    await expect(confirmation).not.toBeChecked();
    await page.keyboard.press('Shift+Tab');
    await expect(reason).toBeFocused();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(CORRECTION_REASON);
    await page.keyboard.press('Tab');
    await expect(summary).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(confirmation).toBeFocused();
    await page.keyboard.press('Space');
    await expect(confirmation).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(submit).toBeFocused();
    await expect(submit).toBeEnabled();
    await expect(
      form.getByText(`${CORRECTION_REASON.length} / 2000`, { exact: true }),
    ).toBeVisible();
    await expect(
      form.getByText(`${CHANGE_SUMMARY.length} / 4000`, { exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const correctionPath = `${scenario.navigationPath}/clinical-reports/${scenario.sourceReportId}/corrections`;
    let capturedRequest: CapturedCorrectionRequest | null = null;
    const gate = new ControlledRequestGate(
      page,
      (request) => {
        const matches =
          request.method() === 'POST' &&
          new URL(request.url()).pathname === correctionPath;
        if (matches) capturedRequest = parseCorrectionRequest(request);
        return matches;
      },
      10_000,
    );
    await gate.install();
    const correctionResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        responsePath(response) === correctionPath,
    );
    await page.keyboard.press('Enter');
    await gate.waitForStarted(5_000);
    expect(gate.summary()).toEqual({
      matchedRequestCount: 1,
      abortedRequestCount: 0,
      continuedRequestCount: 0,
    });
    const requestFacts = requireCapturedCorrectionRequest(capturedRequest);
    expect(requestFacts.keys).toEqual(
      ['confirm', 'correctionReason', 'changeSummary', 'expectedUpdatedAt'].sort(),
    );
    expect(requestFacts.confirm).toBe(true);
    expect(requestFacts.correctionReason).toBe(CORRECTION_REASON);
    expect(requestFacts.changeSummary).toBe(CHANGE_SUMMARY);
    expect(requestFacts.expectedUpdatedAt).toBe(initialReport.updatedAt);
    await expect(
      page.getByText(
        '正在创建或恢复版本化更正；系统不会自动重试。',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      form.getByRole('button', {
        name: '正在处理版本化更正',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(reason).toBeDisabled();
    await expect(summary).toBeDisabled();
    await expect(confirmation).toBeDisabled();
    await expect(cancel).toBeDisabled();
    await expect(page.getByText(SOURCE_MARKER, { exact: true })).toBeVisible();
    await expectOtherWriteActionsUnavailable(page);
    await expect(form.getByRole('progressbar')).toHaveCount(0);
    expect(await form.innerText()).not.toMatch(/\b\d{1,3}\s*%/);
    expect(await form.innerText()).not.toMatch(/阶段\s*\d|第[一二三四]阶段/);
    expect(
      doctorSession.ledger.count({
        method: 'POST',
        safeUrlPattern: CORRECTION_PATTERN,
      }),
    ).toBe(1);
    expect(
      doctorSession.ledger.count({
        method: 'GET',
        safeUrlPattern: LATEST_PATTERN,
      }),
    ).toBe(initialLatestCount);
    expect(
      adjacentReportBusinessWrites(doctorSession.ledger.entries()),
    ).toHaveLength(0);
    expect(countForbiddenGeneratedCalls(doctorSession.ledger.entries())).toBe(0);

    gate.resume();
    const correctionResponse = await correctionResponsePromise;
    expect(correctionResponse.status()).toBe(200);
    const responseBody =
      (await correctionResponse.json()) as CreateClinicalReportCorrectionResponse;
    const gateSummary = await gate.dispose();
    expect(gateSummary).toEqual({
      matchedRequestCount: 1,
      abortedRequestCount: 0,
      continuedRequestCount: 1,
    });
    assertSafeCorrectionResponse(responseBody, initialReport);
    expect(publicProtectedFacts(responseBody.sourceReport)).toBe(
      initialProtectedFacts,
    );
    expect(publicProtectedFacts(responseBody.replacementReport)).toBe(
      initialProtectedFacts,
    );

    await expect(page).toHaveURL(
      `${env.frontendOrigin}${scenario.navigationPath}`,
    );
    await expect(
      page.getByText('替代版本 V2', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(SOURCE_MARKER, { exact: true })).toBeVisible();
    await expect(
      page.getByText('版本化更正与线性来源关系', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/更正回执：No\. 1，下一线性版本已经创建。/),
    ).toBeVisible();
    await expect(
      page.getByText('版本化更正已创建，已进入替代报告草稿。', {
        exact: true,
      }),
    ).toBeVisible();
    const correctionSummary = page.locator(
      'section[aria-labelledby="clinical-report-correction-summary-heading"]',
    );
    await expect(
      correctionSummary.getByRole('heading', {
        name: '来源报告',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      correctionSummary.getByRole('heading', {
        name: '当前替代报告',
        exact: true,
      }),
    ).toBeVisible();
    await expectBusinessTrace(correctionSummary, responseBody);
    await expectAbsentSessionReceipts(page);
    expect(await page.locator('body').innerText()).not.toContain(
      responseBody.correctionReceipt.correctionId,
    );
    expect(
      doctorSession.ledger.count({
        method: 'GET',
        safeUrlPattern: LATEST_PATTERN,
      }),
    ).toBe(initialLatestCount);
    expect(
      doctorSession.ledger.count({
        method: 'POST',
        safeUrlPattern: CORRECTION_PATTERN,
      }),
    ).toBe(1);

    await expect(
      page.getByText(/更正回执：No\. 1/),
    ).toBeVisible();
    await expect(
      correctionSummary.getByRole('heading', {
        name: '来源报告',
        exact: true,
      }),
    ).toBeVisible();
    const reloadedReport = await openReport({
      page,
      scenario,
      environment: env,
      ledger: doctorSession.ledger,
      expectedReportId: responseBody.replacementReport.id,
      reload: true,
    });
    expect(reloadedReport).toMatchObject({
      id: responseBody.replacementReport.id,
      reportVersion: 2,
      status: 'draft',
      source: 'mixed',
      qualityStatus: 'needs_review',
      correction: null,
    });
    invariant(reloadedReport.replacementOf, 'Reloaded lineage is missing');
    expect(reloadedReport.replacementOf).toMatchObject({
      previousReportCode: responseBody.sourceReport.reportCode,
      previousReportVersion: 1,
      replacementReportCode: responseBody.replacementReport.reportCode,
      replacementReportVersion: 2,
      correctionNo: 1,
      correctionReason: CORRECTION_REASON,
      changeSummary: CHANGE_SUMMARY,
    });
    await expect(
      page.getByText('替代版本 V2', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(SOURCE_MARKER, { exact: true })).toBeVisible();
    const reloadedSummary = page.locator(
      'section[aria-labelledby="clinical-report-correction-summary-heading"]',
    );
    await expect(
      reloadedSummary.getByRole('heading', {
        name: '当前替代报告',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      reloadedSummary.getByRole('heading', {
        name: '来源报告',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      reloadedSummary.getByText('来源报告 / 版本', { exact: true }),
    ).toBeVisible();
    await expect(
      reloadedSummary.getByText(
        `${responseBody.sourceReport.reportCode} / V1`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      reloadedSummary.getByText(CORRECTION_REASON, { exact: true }),
    ).toBeVisible();
    await expect(
      reloadedSummary.getByText(CHANGE_SUMMARY, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/更正回执：No\./)).toHaveCount(0);
    await expect(page.getByText(/本次更正回执：/)).toHaveCount(0);
    await expect(
      page.getByText('版本化更正已创建，已进入替代报告草稿。', {
        exact: true,
      }),
    ).toHaveCount(0);
    expect(await reloadedSummary.getByRole('link').count()).toBe(0);
    const reloadedDomText = await page.locator('body').innerText();
    expect(reloadedDomText).not.toContain(
      responseBody.correctionReceipt.correctionId,
    );
    expect(page.url()).not.toContain(responseBody.correctionReceipt.correctionId);
    expect(new URL(page.url()).search).toBe('');
    expect(new URL(page.url()).hash).toBe('');
    await expectNoHorizontalOverflow(page);

    const entries = doctorSession.ledger.entries();
    const correctionEntries = entries.filter(
      (entry) =>
        entry.method === 'POST' &&
        entry.safeUrlPattern === CORRECTION_PATTERN,
    );
    expect(correctionEntries).toEqual([
      expect.objectContaining({
        status: 200,
        failureReason: null,
        bodyKeys: [
          'changeSummary',
          'confirm',
          'correctionReason',
          'expectedUpdatedAt',
        ],
      }),
    ]);
    doctorSession.ledger.assertNoAutomaticRetry({
      method: 'POST',
      safeUrlPattern: CORRECTION_PATTERN,
    });
    doctorSession.ledger.assertNoPolling(
      { method: 'GET', safeUrlPattern: LATEST_PATTERN },
      initialLatestCount + 1,
    );
    expect(
      doctorSession.ledger.count({
        method: 'GET',
        safeUrlPattern: LATEST_PATTERN,
      }),
    ).toBe(initialLatestCount + 1);
    expect(successfulAuthMeCount(doctorSession.ledger)).toBe(3);
    expect(adjacentReportBusinessWrites(entries)).toHaveLength(0);
    expect(countForbiddenGeneratedCalls(entries)).toBe(0);

    const doctorNetwork = await doctorSession.ledger.detach();
    const closed = await roleContexts.closeAll();
    expect(closed.activeContextCount).toBe(0);
    console.log(
      `B15_U01_EVIDENCE ${safeJsonStringify(
        {
          descriptor: {
            profile: 'B15-P1-first-correction',
            scenarios: 1,
          },
          sessions: {
            nurseContextCount: 1,
            doctorContextCount: 1,
            roles: ['nurse', 'doctor'],
            distinctHttpOnlyCookies: true,
            localhostOrigins: true,
          },
          nurse: {
            readonlyMessage: true,
            correctionEntryCount: 0,
            reportBusinessWriteCount: 0,
            forbiddenResponseCount: 0,
          },
          doctor: {
            viewport: '390x844',
            keyboard: 'two_invalid_fields_checkbox_reset_focus_submit',
            horizontalOverflow: false,
          },
          gate: gateSummary,
          correctionPost: {
            count: 1,
            status: correctionEntries[0]?.status,
            bodyKeys: correctionEntries[0]?.bodyKeys,
            expectedUpdatedAtMatched: true,
          },
          response: {
            alreadyCreated: false,
            resumedExisting: false,
            source: 'v1_corrected',
            replacement: 'v2_draft',
          },
          currentSession: 'replacement_source_receipt_live_message_preserved',
          reload: 'session_helpers_absent_persistent_lineage_present',
          privacy: 'correction_identifier_absent_from_dom_and_url',
          adjacentReportBusinessWrites: 0,
          generatedPdfDownloadAiCalls: 0,
          nurseNetworkFailedRequestCount: nurseNetwork.failedRequestCount,
          doctorNetworkFailedRequestCount: doctorNetwork.failedRequestCount,
          contextsClosed: true,
        },
        [
          password,
          descriptor.accounts.doctor.loginIdentifier,
          descriptor.accounts.nurse.loginIdentifier,
          nurseSession.cookieValue,
          doctorSession.cookieValue,
          responseBody.correctionReceipt.correctionId,
        ],
      )}`,
    );
  });
});
