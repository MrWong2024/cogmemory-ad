import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { Locator, Page, Request, Response } from '@playwright/test';

import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from '../support/acceptance-env';
import { expect, test } from '../support/acceptance-test';
import { runAccessibilityAudit } from '../support/accessibility-audit';
import {
  assertFocusVisible,
  clearKeyboardEvidence,
  installKeyboardEvidence,
  readKeyboardEvidence,
  tabToLocator,
} from '../support/keyboard-evidence';
import { ControlledRequestGate } from '../support/network-control';
import { NetworkLedger } from '../support/network-ledger';
import type {
  AcceptanceRole,
  RoleContext,
  RoleContextFactory,
} from '../support/role-context-factory';
import { safeJsonStringify } from '../support/safe-output';
import {
  assertNoGlobalHorizontalOverflow,
  auditViewport,
} from '../support/viewport-audit';

type ScenarioKey =
  | 'conflict-server'
  | 'conflict-local'
  | 'lifecycle-close';

type Scenario = {
  patientId: string;
  visitId: string;
  scaleInstanceId: string;
  navigationPath: string;
  scaleCode: string;
  itemCode: string;
  crfCode: string | null;
  prepared: {
    targetRevision: number;
    targetStatus: string;
    instanceStatus: string;
    totalItemCount: number;
    answeredItemCount: number;
  };
};

type Descriptor = {
  schemaVersion: 1;
  batch: 'B18';
  profile: 'B18-P2-conflict-lifecycle';
  namespace: string;
  accounts: Record<'doctor' | 'nurse', { loginIdentifier: string }>;
  scenarios: Record<ScenarioKey, Scenario>;
};

type EnabledEnvironment = Extract<
  ReturnType<typeof resolveLiveAcceptanceEnvironment>,
  { enabled: true }
>;

type Session = {
  roleContext: RoleContext;
  ledger: NetworkLedger;
  cookieValue: string;
};

type OpenedExecution = {
  article: Locator;
  answer: Locator;
  itemResponseId: string;
  targetPath: string;
};

type CapturedPatch = {
  keys: string[];
  expectedRevision: unknown;
  responseText: unknown;
  markAsAnswered: unknown;
};

const environment = resolveLiveAcceptanceEnvironment();
const SERVER_DOCTOR = 'B18 U02 doctor server version';
const SERVER_NURSE_LOCAL = 'B18 U02 nurse conflict local candidate';
const LOCAL_DOCTOR = 'B18 U02 doctor intermediate version';
const LOCAL_NURSE = 'B18 U02 nurse local version';
const LIFECYCLE_NURSE = 'B18 U02 nurse unsent lifecycle version';
const PATCH_PATTERN =
  '/patients/<id>/visits/<id>/scale-instances/<id>/item-responses/<id>';
const EXECUTION_PATTERN =
  '/patients/<id>/visits/<id>/scale-instances/<id>';
const SUBMIT_PATTERN =
  '/patients/<id>/visits/<id>/scale-instances/<id>/submit';

function invariant(
  condition: unknown,
  safeMessage: string,
): asserts condition {
  if (!condition) throw new Error(safeMessage);
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function requireSecret(): string {
  const value = process.env.B18_U02_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error('B18_U02_LOGIN_SECRET is required');
  }
  return value;
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

async function readDescriptor(): Promise<Descriptor> {
  const runtimePath = process.env.B18_U02_RUNTIME_PATH;
  if (!runtimePath) throw new Error('B18_U02_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(runtimePath, 'utf8')) as unknown;
  invariant(value && typeof value === 'object', 'B18 U02 descriptor is invalid');
  const descriptor = value as Partial<Descriptor>;
  invariant(
    descriptor.schemaVersion === 1 &&
      descriptor.batch === 'B18' &&
      descriptor.profile === 'B18-P2-conflict-lifecycle' &&
      typeof descriptor.namespace === 'string' &&
      /^[a-z0-9][a-z0-9-]{2,19}$/.test(descriptor.namespace) &&
      typeof descriptor.accounts?.doctor.loginIdentifier === 'string' &&
      typeof descriptor.accounts.nurse.loginIdentifier === 'string' &&
      descriptor.accounts.doctor.loginIdentifier !==
        descriptor.accounts.nurse.loginIdentifier,
    'B18 U02 descriptor header is invalid',
  );
  for (const key of [
    'conflict-server',
    'conflict-local',
    'lifecycle-close',
  ] as const) {
    const scenario = descriptor.scenarios?.[key];
    invariant(
      scenario &&
        isObjectId(scenario.patientId) &&
        isObjectId(scenario.visitId) &&
        isObjectId(scenario.scaleInstanceId) &&
        scenario.scaleCode === 'mmse' &&
        typeof scenario.itemCode === 'string' &&
        scenario.itemCode.length > 0 &&
        scenario.prepared.targetRevision >= 0,
      'B18 U02 scenario contract is invalid',
    );
  }
  return descriptor as Descriptor;
}

function responsePath(response: Response): string {
  return new URL(response.url()).pathname;
}

function capturePatch(request: Request): CapturedPatch {
  const value = request.postDataJSON() as unknown;
  invariant(
    value && typeof value === 'object' && !Array.isArray(value),
    'B18 U02 PATCH body is invalid',
  );
  const body = value as Record<string, unknown>;
  return {
    keys: Object.keys(body).sort(),
    expectedRevision: body.expectedRevision,
    responseText: body.responseText,
    markAsAnswered: body.markAsAnswered,
  };
}

async function login(input: {
  factory: RoleContextFactory;
  role: Extract<AcceptanceRole, 'doctor' | 'nurse'>;
  label: string;
  account: string;
  password: string;
  env: EnabledEnvironment;
  viewport?: { width: number; height: number };
}): Promise<Session> {
  const roleContext = await input.factory.create(input.role, input.label, {
    ...(input.viewport ? { viewport: input.viewport } : {}),
  });
  const { context, page } = roleContext;
  const ledger = new NetworkLedger();
  await ledger.attach(page);
  await page.goto(`${input.env.frontendOrigin}/login`, {
    waitUntil: 'domcontentloaded',
  });
  const healthResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${input.env.backendOrigin}/health` &&
      response.request().method() === 'GET',
  );
  const healthStatus = await page.evaluate(async (backendOrigin) => {
    const response = await fetch(`${backendOrigin}/health`, {
      cache: 'no-store',
      credentials: 'include',
    });
    return response.status;
  }, input.env.backendOrigin);
  const healthResponse = await healthResponsePromise;
  expect(healthStatus).toBe(200);
  expect(healthResponse.headers()['access-control-allow-origin']).toBe(
    input.env.frontendOrigin,
  );
  expect(healthResponse.headers()['access-control-allow-credentials']).toBe(
    'true',
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
  expect((await loginResponse.request().allHeaders()).origin).toBe(
    input.env.frontendOrigin,
  );
  expect(await meResponse.json()).toMatchObject({
    authenticated: true,
    user: { roles: [input.role] },
  });
  await expect(page).toHaveURL(`${input.env.frontendOrigin}/dashboard`);
  const cookies = (await context.cookies(input.env.backendOrigin)).filter(
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
  return { roleContext, ledger, cookieValue: cookies[0]!.value };
}

async function openExecution(input: {
  session: Session;
  scenario: Scenario;
  env: EnabledEnvironment;
}): Promise<OpenedExecution> {
  const { page } = input.session.roleContext;
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).origin === input.env.backendOrigin &&
      responsePath(response) === input.scenario.navigationPath &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  await page.goto(`${input.env.frontendOrigin}${input.scenario.navigationPath}`, {
    waitUntil: 'domcontentloaded',
  });
  const body = (await (await responsePromise).json()) as {
    itemResponses?: Array<Record<string, unknown>>;
  };
  const item = body.itemResponses?.find(
    (candidate) => candidate.itemCode === input.scenario.itemCode,
  );
  invariant(item && isObjectId(item.id), 'B18 U02 target identity is missing');
  expect(item.draftRevision).toBe(input.scenario.prepared.targetRevision);
  const article = page
    .getByRole('article')
    .filter({ hasText: `题目编码：${input.scenario.itemCode}` });
  const answer = article.locator('textarea').first();
  await expect(answer).toBeVisible();
  return {
    article,
    answer,
    itemResponseId: item.id,
    targetPath: `${input.scenario.navigationPath}/item-responses/${item.id}`,
  };
}

async function closeSessions(
  roleContexts: RoleContextFactory,
  sessions: Session[],
): Promise<{ failedRequestCount: number }> {
  let failedRequestCount = 0;
  for (const session of sessions) {
    failedRequestCount += (await session.ledger.detach()).failedRequestCount;
  }
  expect((await roleContexts.closeAll()).activeContextCount).toBe(0);
  return { failedRequestCount };
}

function installPatchCapture(
  page: Page,
  targetPath: string,
): { patches: CapturedPatch[]; stop: () => void } {
  const patches: CapturedPatch[] = [];
  const listener = (request: Request): void => {
    if (
      request.method() === 'PATCH' &&
      new URL(request.url()).pathname === targetPath
    ) {
      patches.push(capturePatch(request));
    }
  };
  page.on('request', listener);
  return { patches, stop: () => page.off('request', listener) };
}

async function createConflict(input: {
  doctor: Session;
  nurse: Session;
  doctorExecution: OpenedExecution;
  nurseExecution: OpenedExecution;
  scenario: Scenario;
  doctorText: string;
  nurseText: string;
}): Promise<{
  nursePatches: CapturedPatch[];
  doctorPatches: CapturedPatch[];
  reconciliationGetDelta: number;
  gateSummary: {
    matchedRequestCount: number;
    abortedRequestCount: number;
    continuedRequestCount: number;
  };
  stopCaptures: () => void;
}> {
  expect(input.doctorExecution.itemResponseId).toBe(
    input.nurseExecution.itemResponseId,
  );
  const nurseCapture = installPatchCapture(
    input.nurse.roleContext.page,
    input.nurseExecution.targetPath,
  );
  const doctorCapture = installPatchCapture(
    input.doctor.roleContext.page,
    input.doctorExecution.targetPath,
  );
  const nurseGetsBefore = input.nurse.ledger.count({
    method: 'GET',
    safeUrlPattern: EXECUTION_PATTERN,
  });
  const gate = new ControlledRequestGate(
    input.nurse.roleContext.page,
    (request) =>
      request.method() === 'PATCH' &&
      new URL(request.url()).pathname === input.nurseExecution.targetPath,
    10_000,
  );
  await gate.install();
  let gateDisposed = false;
  try {
    await input.nurseExecution.answer.fill(input.nurseText);
    await gate.waitForStarted(5_000);
    await expect(
      input.nurseExecution.article.getByText('正在保存', { exact: true }),
    ).toBeVisible();
    expect(nurseCapture.patches).toHaveLength(1);
    expect(nurseCapture.patches[0]).toMatchObject({
      keys: ['expectedRevision', 'responseText'],
      expectedRevision: input.scenario.prepared.targetRevision,
      responseText: input.nurseText,
    });

    const doctorResponsePromise = input.doctor.roleContext.page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        responsePath(response) === input.doctorExecution.targetPath,
    );
    await input.doctorExecution.answer.fill(input.doctorText);
    expect((await doctorResponsePromise).status()).toBe(200);
    await expect(
      input.doctorExecution.article.getByText(/^已保存：/),
    ).toBeVisible();
    expect(doctorCapture.patches).toEqual([
      {
        keys: ['expectedRevision', 'responseText'],
        expectedRevision: input.scenario.prepared.targetRevision,
        responseText: input.doctorText,
        markAsAnswered: undefined,
      },
    ]);

    const conflictResponsePromise = input.nurse.roleContext.page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        responsePath(response) === input.nurseExecution.targetPath,
    );
    const reconciliationPromise = input.nurse.roleContext.page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        responsePath(response) === input.scenario.navigationPath,
    );
    gate.resume();
    const conflictResponse = await conflictResponsePromise;
    expect(conflictResponse.status()).toBe(409);
    expect(await conflictResponse.json()).toMatchObject({
      code: 'ITEM_RESPONSE_DRAFT_CONFLICT',
    });
    const gateSummary = await gate.dispose();
    gateDisposed = true;
    expect((await reconciliationPromise).status()).toBe(200);
    await expect(
      input.nurseExecution.article.getByText('发现版本冲突', { exact: true }),
    ).toBeVisible();
    await expect(input.nurseExecution.answer).toHaveValue(input.nurseText);
    expect(
      await input.nurse.roleContext.page.evaluate(
        () => document.activeElement?.tagName ?? 'NONE',
      ),
    ).not.toBe('BODY');
    const reconciliationGetDelta =
      input.nurse.ledger.count({
        method: 'GET',
        safeUrlPattern: EXECUTION_PATTERN,
      }) - nurseGetsBefore;
    expect(reconciliationGetDelta).toBe(1);
    return {
      nursePatches: nurseCapture.patches,
      doctorPatches: doctorCapture.patches,
      reconciliationGetDelta,
      gateSummary,
      stopCaptures: () => {
        nurseCapture.stop();
        doctorCapture.stop();
      },
    };
  } finally {
    gate.resume();
    if (!gateDisposed) await gate.dispose();
  }
}

test.describe('B18 U02 dual-session conflict and lifecycle close', () => {
  test.beforeEach(() => {
    test.skip(!environment.enabled, 'BROWSER_ACCEPTANCE_RUN_LIVE=1 is required');
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test('explicit server choice resolves one real conflict without another write', async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const scenario = descriptor.scenarios['conflict-server'];
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const doctor = await login({
      factory: roleContexts,
      role: 'doctor',
      label: 'b18-u02-conflict-server-doctor',
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      env,
    });
    const nurse = await login({
      factory: roleContexts,
      role: 'nurse',
      label: 'b18-u02-conflict-server-nurse',
      account: descriptor.accounts.nurse.loginIdentifier,
      password,
      env,
      viewport: { width: 390, height: 844 },
    });
    expect(doctor.cookieValue).not.toBe(nurse.cookieValue);
    await installKeyboardEvidence(nurse.roleContext.page);
    const doctorExecution = await openExecution({
      session: doctor,
      scenario,
      env,
    });
    const nurseExecution = await openExecution({
      session: nurse,
      scenario,
      env,
    });
    const conflict = await createConflict({
      doctor,
      nurse,
      doctorExecution,
      nurseExecution,
      scenario,
      doctorText: SERVER_DOCTOR,
      nurseText: SERVER_NURSE_LOCAL,
    });
    const page = nurse.roleContext.page;
    const alert = nurseExecution.article.getByRole('alert');
    await expect(alert).toContainText('发现版本冲突');
    await expect(alert).toContainText('系统不会自动覆盖服务器版本或本地版本');
    const viewport = await auditViewport(page, { width: 390, height: 844 });
    assertNoGlobalHorizontalOverflow(viewport);
    const axe = await runAccessibilityAudit(page, {
      include: ['article section[role="alert"]'],
    });
    const seriousOrCritical = axe.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    );
    expect(seriousOrCritical).toHaveLength(0);

    await clearKeyboardEvidence(page);
    const chooseServer = alert.getByRole('button', {
      name: '使用服务器版本',
      exact: true,
    });
    const firstTraversal = await tabToLocator(page, chooseServer, 80);
    await assertFocusVisible(chooseServer);
    await page.keyboard.press('Enter');
    const confirmation = alert.getByRole('checkbox', {
      name: '我已理解这次版本选择的影响。',
      exact: true,
    });
    const checkboxTraversal = await tabToLocator(page, confirmation, 8);
    await assertFocusVisible(confirmation);
    await page.keyboard.press('Space');
    await expect(confirmation).toBeChecked();
    const confirm = alert.getByRole('button', { name: '确认执行', exact: true });
    const confirmTraversal = await tabToLocator(page, confirm, 4);
    await assertFocusVisible(confirm);
    await page.keyboard.press('Enter');
    await expect(nurseExecution.answer).toHaveValue(SERVER_DOCTOR);
    await expect(nurseExecution.article.getByText(/^已保存：/)).toBeVisible();
    expect(conflict.nursePatches).toHaveLength(1);
    expect(conflict.doctorPatches).toHaveLength(1);
    const keyboardEvents = await readKeyboardEvidence(page);
    const activationEvents = keyboardEvents.filter((event) =>
      ['Enter', ' '].includes(event.key),
    );
    expect(activationEvents).toHaveLength(6);
    expect(
      activationEvents.every((event) => event.isTrusted),
    ).toBe(true);
    conflict.stopCaptures();
    const close = await closeSessions(roleContexts, [doctor, nurse]);
    console.log(
      `B18_U02_SERVER_EVIDENCE ${safeJsonStringify(
        {
          scenario: 'conflict-server',
          contexts: 2,
          sessionsDistinct: true,
          viewport: '390x844',
          horizontalOverflow: viewport.hasGlobalHorizontalOverflow,
          conflictAlert: true,
          nonColorStatusText: true,
          reconciliationGetDelta: conflict.reconciliationGetDelta,
          gate: conflict.gateSummary,
          doctorPatchCount: conflict.doctorPatches.length,
          nursePatchCount: conflict.nursePatches.length,
          finalRevision: scenario.prepared.targetRevision + 1,
          finalDraftHash: hash(SERVER_DOCTOR),
          keyboard: {
            firstTraversal: firstTraversal.pressCount,
            checkboxTraversal: checkboxTraversal.pressCount,
            confirmTraversal: confirmTraversal.pressCount,
            trusted: true,
          },
          axeSeriousCritical: seriousOrCritical.length,
          failedRequestCount: close.failedRequestCount,
          contextsClosed: true,
        },
        [
          password,
          descriptor.accounts.doctor.loginIdentifier,
          descriptor.accounts.nurse.loginIdentifier,
          doctor.cookieValue,
          nurse.cookieValue,
          SERVER_DOCTOR,
          SERVER_NURSE_LOCAL,
          scenario.patientId,
          scenario.visitId,
          scenario.scaleInstanceId,
        ],
      )}`,
    );
  });

  test('explicit local choice writes once at the latest revision without a retry loop', async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const scenario = descriptor.scenarios['conflict-local'];
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const doctor = await login({
      factory: roleContexts,
      role: 'doctor',
      label: 'b18-u02-conflict-local-doctor',
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      env,
    });
    const nurse = await login({
      factory: roleContexts,
      role: 'nurse',
      label: 'b18-u02-conflict-local-nurse',
      account: descriptor.accounts.nurse.loginIdentifier,
      password,
      env,
    });
    expect(doctor.cookieValue).not.toBe(nurse.cookieValue);
    const doctorExecution = await openExecution({
      session: doctor,
      scenario,
      env,
    });
    const nurseExecution = await openExecution({
      session: nurse,
      scenario,
      env,
    });
    const conflict = await createConflict({
      doctor,
      nurse,
      doctorExecution,
      nurseExecution,
      scenario,
      doctorText: LOCAL_DOCTOR,
      nurseText: LOCAL_NURSE,
    });
    const alert = nurseExecution.article.getByRole('alert');
    await alert
      .getByRole('button', {
        name: '使用本地版本重新保存',
        exact: true,
      })
      .click();
    const confirmation = alert.getByRole('checkbox', {
      name: '我已理解这次版本选择的影响。',
      exact: true,
    });
    await confirmation.check();
    const localResponsePromise = nurse.roleContext.page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        responsePath(response) === nurseExecution.targetPath,
    );
    await alert.getByRole('button', { name: '确认执行', exact: true }).click();
    expect((await localResponsePromise).status()).toBe(200);
    await expect(nurseExecution.answer).toHaveValue(LOCAL_NURSE);
    await expect(nurseExecution.article.getByText(/^已保存：/)).toBeVisible();
    expect(conflict.doctorPatches).toHaveLength(1);
    expect(conflict.nursePatches).toEqual([
      {
        keys: ['expectedRevision', 'responseText'],
        expectedRevision: scenario.prepared.targetRevision,
        responseText: LOCAL_NURSE,
        markAsAnswered: undefined,
      },
      {
        keys: ['expectedRevision', 'responseText'],
        expectedRevision: scenario.prepared.targetRevision + 1,
        responseText: LOCAL_NURSE,
        markAsAnswered: undefined,
      },
    ]);
    nurse.ledger.assertNoAutomaticRetry(
      { method: 'PATCH', safeUrlPattern: PATCH_PATTERN },
      2,
    );
    conflict.stopCaptures();
    const close = await closeSessions(roleContexts, [doctor, nurse]);
    console.log(
      `B18_U02_LOCAL_EVIDENCE ${safeJsonStringify(
        {
          scenario: 'conflict-local',
          contexts: 2,
          sessionsDistinct: true,
          reconciliationGetDelta: conflict.reconciliationGetDelta,
          gate: conflict.gateSummary,
          doctorSuccessfulPatchCount: conflict.doctorPatches.length,
          nursePatchAttempts: conflict.nursePatches.length,
          nurseSuccessfulPatchCount: 1,
          automaticRetryLoop: false,
          requestKeys: conflict.nursePatches.map((patch) => patch.keys),
          finalRevision: scenario.prepared.targetRevision + 2,
          finalDraftHash: hash(LOCAL_NURSE),
          failedRequestCount: close.failedRequestCount,
          contextsClosed: true,
        },
        [
          password,
          descriptor.accounts.doctor.loginIdentifier,
          descriptor.accounts.nurse.loginIdentifier,
          doctor.cookieValue,
          nurse.cookieValue,
          LOCAL_DOCTOR,
          LOCAL_NURSE,
          scenario.patientId,
          scenario.visitId,
          scenario.scaleInstanceId,
        ],
      )}`,
    );
  });

  test('a completed instance rejects the other session delayed save and preserves its local view', async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const scenario = descriptor.scenarios['lifecycle-close'];
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const nurse = await login({
      factory: roleContexts,
      role: 'nurse',
      label: 'b18-u02-lifecycle-nurse',
      account: descriptor.accounts.nurse.loginIdentifier,
      password,
      env,
    });
    const doctor = await login({
      factory: roleContexts,
      role: 'doctor',
      label: 'b18-u02-lifecycle-doctor',
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      env,
    });
    expect(doctor.cookieValue).not.toBe(nurse.cookieValue);
    const nurseExecution = await openExecution({ session: nurse, scenario, env });
    const doctorExecution = await openExecution({ session: doctor, scenario, env });
    expect(doctorExecution.itemResponseId).toBe(nurseExecution.itemResponseId);
    await expect(
      doctor.roleContext.page.getByText('完整性：已通过', { exact: true }),
    ).toBeVisible();
    await expect(
      doctor.roleContext.page.getByText('当前可提交：是', { exact: true }),
    ).toBeVisible();

    const nurseGetsBefore = nurse.ledger.count({
      method: 'GET',
      safeUrlPattern: EXECUTION_PATTERN,
    });
    const nurseCapture = installPatchCapture(
      nurse.roleContext.page,
      nurseExecution.targetPath,
    );
    const gate = new ControlledRequestGate(
      nurse.roleContext.page,
      (request) =>
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === nurseExecution.targetPath,
      15_000,
    );
    await gate.install();
    let gateDisposed = false;
    try {
      await nurseExecution.answer.fill(LIFECYCLE_NURSE);
      await gate.waitForStarted(5_000);
      await expect(
        nurseExecution.article.getByText('正在保存', { exact: true }),
      ).toBeVisible();
      await nurse.roleContext.page
        .getByRole('button', { name: '检查并准备提交', exact: true })
        .click();
      await expect(
        nurse.roleContext.page.getByText(
          '服务器检查已更新，但本地仍有尚未保存或正在写入的内容，请先完成保存或上传。',
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        nurse.roleContext.page.getByRole('checkbox', {
          name: '我已核对以上影响，并确认正式提交该量表实例。',
          exact: true,
        }),
      ).toHaveCount(0);
      expect(nurse.ledger.count({ method: 'POST', safeUrlPattern: SUBMIT_PATTERN })).toBe(0);

      await doctor.roleContext.page
        .getByRole('button', { name: '检查并准备提交', exact: true })
        .click();
      const doctorConfirmation = doctor.roleContext.page.getByRole('checkbox', {
        name: '我已核对以上影响，并确认正式提交该量表实例。',
        exact: true,
      });
      await expect(doctorConfirmation).toBeVisible();
      await doctorConfirmation.check();
      const submitResponsePromise = doctor.roleContext.page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          responsePath(response) === `${scenario.navigationPath}/submit`,
      );
      await doctor.roleContext.page
        .getByRole('button', { name: '确认正式提交', exact: true })
        .click();
      const submitResponse = await submitResponsePromise;
      expect(submitResponse.status()).toBe(200);
      await expect(
        doctor.roleContext.page.getByText('提交成功', {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        doctor.roleContext.page.getByText('只读查看', { exact: true }),
      ).toBeVisible();

      const nursePatchResponsePromise = nurse.roleContext.page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          responsePath(response) === nurseExecution.targetPath,
      );
      const nurseRefreshPromise = nurse.roleContext.page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          responsePath(response) === scenario.navigationPath,
      );
      gate.resume();
      const nursePatchResponse = await nursePatchResponsePromise;
      expect(nursePatchResponse.status()).toBe(409);
      expect(await nursePatchResponse.json()).toMatchObject({
        code: 'SCALE_INSTANCE_NOT_EDITABLE',
      });
      const gateSummary = await gate.dispose();
      gateDisposed = true;
      expect((await nurseRefreshPromise).status()).toBe(200);
      await expect(nurseExecution.answer).toHaveValue(LIFECYCLE_NURSE);
      await expect(nurseExecution.answer).toBeDisabled();
      await expect(
        nurseExecution.article.getByText('当前记录已不可编辑', { exact: true }),
      ).toBeVisible();
      await expect(
        nurseExecution.article.getByText(
          '当前记录已不可编辑，本地内容仅供查看。',
          { exact: true },
        ),
      ).toBeVisible();
      expect(
        nurse.ledger.count({ method: 'GET', safeUrlPattern: EXECUTION_PATTERN }) -
          nurseGetsBefore,
      ).toBe(1);
      expect(nurseCapture.patches).toEqual([
        {
          keys: ['expectedRevision', 'responseText'],
          expectedRevision: scenario.prepared.targetRevision,
          responseText: LIFECYCLE_NURSE,
          markAsAnswered: undefined,
        },
      ]);
      nurse.ledger.assertNoAutomaticRetry({
        method: 'PATCH',
        safeUrlPattern: PATCH_PATTERN,
      });
      expect(doctor.ledger.count({ method: 'POST', safeUrlPattern: SUBMIT_PATTERN })).toBe(1);
      const forbiddenAdjacentWrites = [...doctor.ledger.entries(), ...nurse.ledger.entries()].filter(
        (entry) =>
          entry.method !== 'GET' &&
          entry.safeUrlPattern !== '/auth/login' &&
          entry.safeUrlPattern !== PATCH_PATTERN &&
          entry.safeUrlPattern !== SUBMIT_PATTERN,
      );
      expect(forbiddenAdjacentWrites).toHaveLength(0);
      nurseCapture.stop();
      const close = await closeSessions(roleContexts, [doctor, nurse]);
      console.log(
        `B18_U02_LIFECYCLE_EVIDENCE ${safeJsonStringify(
          {
            scenario: 'lifecycle-close',
            contexts: 2,
            sessionsDistinct: true,
            preparedReady: true,
            nurseSubmitPostCount: 0,
            doctorSubmitPostCount: 1,
            doctorCompleted: true,
            nursePatchCount: nurseCapture.patches.length,
            nursePatchStatus: nursePatchResponse.status(),
            nurseRefreshCount: 1,
            nurseLocalViewPreserved: true,
            nurseBlockedReadonly: true,
            gate: gateSummary,
            timerCheckpointPatchCount: 0,
            adjacentWrites: 0,
            failedRequestCount: close.failedRequestCount,
            contextsClosed: true,
          },
          [
            password,
            descriptor.accounts.doctor.loginIdentifier,
            descriptor.accounts.nurse.loginIdentifier,
            doctor.cookieValue,
            nurse.cookieValue,
            LIFECYCLE_NURSE,
            scenario.patientId,
            scenario.visitId,
            scenario.scaleInstanceId,
          ],
        )}`,
      );
    } finally {
      gate.resume();
      if (!gateDisposed) await gate.dispose();
      nurseCapture.stop();
    }
  });
});
