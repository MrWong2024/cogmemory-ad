import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type {
  BrowserContext,
  Dialog,
  Locator,
  Page,
  Request,
  Response,
} from '@playwright/test';

import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from '../support/acceptance-env';
import { expect, test } from '../support/acceptance-test';
import { BeforeUnloadEvidence } from '../support/beforeunload-evidence';
import { NetworkLedger } from '../support/network-ledger';
import type {
  RoleContext,
  RoleContextFactory,
} from '../support/role-context-factory';
import { safeJsonStringify } from '../support/safe-output';
import { B18ResponseLossControl } from './support/b18-response-loss-control';

type ScenarioKey = 'offline-recovery' | 'response-loss';

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
  profile: 'B18-P3-network-reconciliation';
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
  responseBody: Record<string, unknown>;
};

type CapturedPatch = {
  keys: string[];
  expectedRevision: unknown;
  responseText: unknown;
  markAsAnswered: unknown;
};

type NetworkEventEvidence = {
  offline: number;
  online: number;
  navigatorOnline: boolean;
};

const environment = resolveLiveAcceptanceEnvironment();
const OFFLINE_TEXT = 'B18 U03 offline recovered version';
const RESPONSE_LOSS_TEXT = 'B18 U03 committed response loss version';
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
  const value = process.env.B18_U03_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error('B18_U03_LOGIN_SECRET is required');
  }
  return value;
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

async function readDescriptor(): Promise<Descriptor> {
  const runtimePath = process.env.B18_U03_RUNTIME_PATH;
  if (!runtimePath) throw new Error('B18_U03_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(runtimePath, 'utf8')) as unknown;
  invariant(value && typeof value === 'object', 'B18 U03 descriptor is invalid');
  const descriptor = value as Partial<Descriptor>;
  invariant(
    descriptor.schemaVersion === 1 &&
      descriptor.batch === 'B18' &&
      descriptor.profile === 'B18-P3-network-reconciliation' &&
      typeof descriptor.namespace === 'string' &&
      /^[a-z0-9][a-z0-9-]{2,19}$/.test(descriptor.namespace) &&
      typeof descriptor.accounts?.doctor.loginIdentifier === 'string' &&
      typeof descriptor.accounts.nurse.loginIdentifier === 'string' &&
      descriptor.accounts.doctor.loginIdentifier !==
        descriptor.accounts.nurse.loginIdentifier,
    'B18 U03 descriptor header is invalid',
  );
  for (const key of ['offline-recovery', 'response-loss'] as const) {
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
      'B18 U03 scenario contract is invalid',
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
    'B18 U03 PATCH body is invalid',
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
  account: string;
  password: string;
  env: EnabledEnvironment;
  label: string;
}): Promise<Session> {
  const roleContext = await input.factory.create('doctor', input.label, {
    viewport: { width: 1280, height: 800 },
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
    user: { roles: ['doctor'] },
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
  page: Page;
  scenario: Scenario;
  env: EnabledEnvironment;
  reload?: boolean;
}): Promise<OpenedExecution> {
  const responsePromise = input.page.waitForResponse(
    (response) =>
      new URL(response.url()).origin === input.env.backendOrigin &&
      responsePath(response) === input.scenario.navigationPath &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  if (input.reload) {
    await input.page.reload({ waitUntil: 'domcontentloaded' });
  } else {
    await input.page.goto(
      `${input.env.frontendOrigin}${input.scenario.navigationPath}`,
      { waitUntil: 'domcontentloaded' },
    );
  }
  const responseBody = (await (await responsePromise).json()) as Record<
    string,
    unknown
  >;
  const items = (responseBody.itemResponses ?? []) as Array<
    Record<string, unknown>
  >;
  const target = items.find(
    (candidate) => candidate.itemCode === input.scenario.itemCode,
  );
  invariant(target && isObjectId(target.id), 'B18 U03 target identity is missing');
  const article = input.page
    .getByRole('article')
    .filter({ hasText: `题目编码：${input.scenario.itemCode}` });
  const answer = article.locator('textarea').first();
  await expect(answer).toBeVisible();
  return {
    article,
    answer,
    itemResponseId: target.id,
    targetPath: `${input.scenario.navigationPath}/item-responses/${target.id}`,
    responseBody,
  };
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

async function installNetworkEventEvidence(page: Page): Promise<void> {
  const install = (): void => {
    const browserWindow = window as Window & {
      __b18NetworkEvents?: { offline: number; online: number };
      __b18NetworkEventsInstalled?: boolean;
    };
    browserWindow.__b18NetworkEvents ??= { offline: 0, online: 0 };
    if (browserWindow.__b18NetworkEventsInstalled) return;
    browserWindow.__b18NetworkEventsInstalled = true;
    window.addEventListener('offline', () => {
      browserWindow.__b18NetworkEvents!.offline += 1;
    });
    window.addEventListener('online', () => {
      browserWindow.__b18NetworkEvents!.online += 1;
    });
  };
  await page.addInitScript(install);
  await page.evaluate(install);
}

async function readNetworkEventEvidence(
  page: Page,
): Promise<NetworkEventEvidence> {
  return page.evaluate(() => {
    const browserWindow = window as Window & {
      __b18NetworkEvents?: { offline: number; online: number };
    };
    return {
      offline: browserWindow.__b18NetworkEvents?.offline ?? 0,
      online: browserWindow.__b18NetworkEvents?.online ?? 0,
      navigatorOnline: navigator.onLine,
    };
  });
}

async function auditDraftStorage(
  page: Page,
  context: BrowserContext,
  forbiddenLiterals: string[],
): Promise<Record<string, boolean>> {
  const browserFacts = await page.evaluate(async (literals) => {
    const contains = (value: unknown): boolean => {
      const serialized =
        typeof value === 'string' ? value : JSON.stringify(value ?? null);
      return literals.some(
        (literal) => literal.length > 0 && serialized.includes(literal),
      );
    };
    let indexedDbForbidden = false;
    for (const info of
      typeof indexedDB.databases === 'function'
        ? await indexedDB.databases()
        : []) {
      if (!info.name) continue;
      indexedDbForbidden ||= contains(info.name);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(info.name!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const stores = [...database.objectStoreNames];
        if (stores.length > 0) {
          const transaction = database.transaction(stores, 'readonly');
          for (const store of stores) {
            const values = await new Promise<unknown[]>((resolve, reject) => {
              const request = transaction.objectStore(store).getAll();
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            indexedDbForbidden ||= contains(store) || values.some(contains);
          }
        }
      } finally {
        database.close();
      }
    }
    let cacheForbidden = false;
    for (const cacheName of await caches.keys()) {
      cacheForbidden ||= contains(cacheName);
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) {
        cacheForbidden ||= contains(request.url);
        const response = await cache.match(request);
        if (response) cacheForbidden ||= contains(await response.clone().text());
      }
    }
    return {
      localStorageClear: !Object.entries(localStorage).some(contains),
      sessionStorageClear: !Object.entries(sessionStorage).some(contains),
      indexedDbClear: !indexedDbForbidden,
      cacheStorageClear: !cacheForbidden,
      urlClear: !contains(`${window.location.search}${window.location.hash}`),
    };
  }, forbiddenLiterals);
  const cookieClear = !(await context.cookies()).some((cookie) =>
    forbiddenLiterals.some(
      (literal) =>
        literal.length > 0 && `${cookie.name}\n${cookie.value}`.includes(literal),
    ),
  );
  const result = { ...browserFacts, cookieClear };
  expect(result).toEqual({
    localStorageClear: true,
    sessionStorageClear: true,
    indexedDbClear: true,
    cacheStorageClear: true,
    urlClear: true,
    cookieClear: true,
  });
  return result;
}

async function closeSession(
  roleContexts: RoleContextFactory,
  session: Session,
): Promise<{ failedRequestCount: number }> {
  const network = await session.ledger.detach();
  expect((await roleContexts.closeAll()).activeContextCount).toBe(0);
  return { failedRequestCount: network.failedRequestCount };
}

function findTarget(
  body: Record<string, unknown>,
  scenario: Scenario,
): Record<string, unknown> {
  const items = (body.itemResponses ?? []) as Array<Record<string, unknown>>;
  const target = items.find((item) => item.itemCode === scenario.itemCode);
  invariant(target, 'B18 U03 reloaded target is missing');
  return target;
}

test.describe('B18 U03 network reconciliation', () => {
  test.beforeEach(() => {
    test.skip(!environment.enabled, 'BROWSER_ACCEPTANCE_RUN_LIVE=1 is required');
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test('actual browser offline and online events preserve one draft and save it once', async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const scenario = descriptor.scenarios['offline-recovery'];
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const session = await login({
      factory: roleContexts,
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      env,
      label: 'b18-u03-offline-doctor',
    });
    const { context, page } = session.roleContext;
    const execution = await openExecution({ page, scenario, env });
    await installNetworkEventEvidence(page);
    const capture = installPatchCapture(page, execution.targetPath);
    try {
      await context.setOffline(true);
      await expect
        .poll(() => readNetworkEventEvidence(page))
        .toMatchObject({ offline: 1, online: 0, navigatorOnline: false });
      await execution.answer.fill(OFFLINE_TEXT);
      await expect(
        execution.article.getByText('离线，等待联网', { exact: true }),
      ).toBeVisible();
      await expect(execution.answer).toHaveValue(OFFLINE_TEXT);
      await expect(
        page.getByText('未收口作答：1 题', { exact: true }).first(),
      ).toBeVisible();
      expect(capture.patches).toHaveLength(0);
      expect(
        session.ledger.count({ method: 'PATCH', safeUrlPattern: PATCH_PATTERN }),
      ).toBe(0);
      expect(
        session.ledger.count({ method: 'POST', safeUrlPattern: SUBMIT_PATTERN }),
      ).toBe(0);
      await expect(
        page.getByRole('checkbox', {
          name: '我已核对以上影响，并确认正式提交该量表实例。',
          exact: true,
        }),
      ).toHaveCount(0);

      const unload = new BeforeUnloadEvidence(page, 'dismiss');
      unload.observe();
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
      const dirtyUnload = unload.stop();
      expect(dirtyUnload).toEqual({
        beforeUnloadDialogCount: 1,
        otherDialogCount: 0,
        automatedDisposition: 'dismiss',
      });
      await expect(execution.answer).toHaveValue(OFFLINE_TEXT);
      expect(capture.patches).toHaveLength(0);

      const patchResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          responsePath(response) === execution.targetPath,
      );
      await context.setOffline(false);
      await expect
        .poll(() => readNetworkEventEvidence(page))
        .toMatchObject({ offline: 1, online: 1, navigatorOnline: true });
      const networkEvents = await readNetworkEventEvidence(page);
      expect((await patchResponsePromise).status()).toBe(200);
      await expect(execution.article.getByText(/^已保存：/)).toBeVisible();
      await expect(execution.answer).toHaveValue(OFFLINE_TEXT);
      expect(capture.patches).toEqual([
        {
          keys: ['expectedRevision', 'responseText'],
          expectedRevision: scenario.prepared.targetRevision,
          responseText: OFFLINE_TEXT,
          markAsAnswered: undefined,
        },
      ]);
      session.ledger.assertNoAutomaticRetry(
        { method: 'PATCH', safeUrlPattern: PATCH_PATTERN },
        1,
      );
      const storageBeforeReload = await auditDraftStorage(page, context, [
        OFFLINE_TEXT,
      ]);
      let cleanDialogCount = 0;
      const onCleanDialog = async (dialog: Dialog): Promise<void> => {
        cleanDialogCount += 1;
        await dialog.dismiss();
      };
      page.on('dialog', onCleanDialog);
      const reloaded = await openExecution({
        page,
        scenario,
        env,
        reload: true,
      });
      page.off('dialog', onCleanDialog);
      expect(cleanDialogCount).toBe(0);
      const target = findTarget(reloaded.responseBody, scenario);
      expect(target.responseText).toBe(OFFLINE_TEXT);
      expect(target.draftRevision).toBe(scenario.prepared.targetRevision + 1);
      await expect(reloaded.answer).toHaveValue(OFFLINE_TEXT);
      await expect(reloaded.article.getByText(/^已保存：/)).toBeVisible();
      expect(capture.patches).toHaveLength(1);
      const storageAfterReload = await auditDraftStorage(page, context, [
        OFFLINE_TEXT,
      ]);
      const close = await closeSession(roleContexts, session);
      console.log(
        `B18_U03_OFFLINE_EVIDENCE ${safeJsonStringify(
          {
            scenario: 'offline-recovery',
            contextOfflineUsed: true,
            offlineEventCount: networkEvents.offline,
            onlineEventCount: networkEvents.online,
            navigatorOnline: networkEvents.navigatorOnline,
            patchCountWhileOffline: 0,
            patchCountAfterOnline: capture.patches.length,
            patchStatus: 200,
            requestKeys: capture.patches[0]?.keys,
            dirtyUnload,
            cleanReloadDialogCount: cleanDialogCount,
            finalRevision: scenario.prepared.targetRevision + 1,
            finalDraftHash: hash(OFFLINE_TEXT),
            storageBeforeReload,
            storageAfterReload,
            submitPostCount: 0,
            failedRequestCount: close.failedRequestCount,
            contextsClosed: true,
          },
          [
            password,
            descriptor.accounts.doctor.loginIdentifier,
            descriptor.accounts.nurse.loginIdentifier,
            session.cookieValue,
            OFFLINE_TEXT,
            scenario.patientId,
            scenario.visitId,
            scenario.scaleInstanceId,
          ],
        )}`,
      );
    } finally {
      capture.stop();
      if (!page.isClosed()) await context.setOffline(false);
    }
  });

  test('a committed PATCH with a lost browser response reconciles by read without replay', async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const scenario = descriptor.scenarios['response-loss'];
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const session = await login({
      factory: roleContexts,
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      env,
      label: 'b18-u03-response-loss-doctor',
    });
    const { context, page } = session.roleContext;
    const execution = await openExecution({ page, scenario, env });
    const capture = installPatchCapture(page, execution.targetPath);
    const executionGetsBefore = session.ledger.count({
      method: 'GET',
      safeUrlPattern: EXECUTION_PATTERN,
    });
    const responseLoss = new B18ResponseLossControl(
      page,
      execution.targetPath,
      scenario.navigationPath,
    );
    await responseLoss.install();
    try {
      await execution.answer.fill(RESPONSE_LOSS_TEXT);
      await Promise.all([
        responseLoss.waitForUpstreamPatch(),
        responseLoss.waitForReconciliationAbort(),
      ]);
      await expect(
        execution.article.getByText('正在核对服务器', { exact: true }),
      ).toBeVisible();
      await expect(
        execution.article.getByText(
          '暂时无法核对服务器；不会发送新的保存请求。',
          { exact: true },
        ),
      ).toBeVisible();
      await expect(execution.answer).toHaveValue(RESPONSE_LOSS_TEXT);
      const summaryBeforeManualCheck = responseLoss.summary();
      expect(summaryBeforeManualCheck).toEqual({
        upstreamPatchCount: 1,
        upstreamPatchStatus: 200,
        browserPatchAbortCount: 1,
        reconciliationGetAbortCount: 1,
        fulfilledBusinessResponseCount: 0,
      });
      expect(capture.patches).toEqual([
        {
          keys: ['expectedRevision', 'responseText'],
          expectedRevision: scenario.prepared.targetRevision,
          responseText: RESPONSE_LOSS_TEXT,
          markAsAnswered: undefined,
        },
      ]);
      expect(
        session.ledger.count({ method: 'PATCH', safeUrlPattern: PATCH_PATTERN }),
      ).toBe(1);
      expect(
        session.ledger.count({ method: 'GET', safeUrlPattern: EXECUTION_PATTERN }) -
          executionGetsBefore,
      ).toBe(1);

      const manualReadPromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          responsePath(response) === scenario.navigationPath,
      );
      await execution.article
        .getByRole('button', { name: '重新核对服务器', exact: true })
        .click();
      expect((await manualReadPromise).status()).toBe(200);
      await expect(execution.article.getByText(/^已保存：/)).toBeVisible();
      await expect(execution.answer).toHaveValue(RESPONSE_LOSS_TEXT);
      expect(capture.patches).toHaveLength(1);
      expect(
        session.ledger.count({ method: 'GET', safeUrlPattern: EXECUTION_PATTERN }) -
          executionGetsBefore,
      ).toBe(2);
      session.ledger.assertNoAutomaticRetry(
        { method: 'PATCH', safeUrlPattern: PATCH_PATTERN },
        1,
      );
      const responseLossSummary = await responseLoss.dispose();
      const storageBeforeReload = await auditDraftStorage(page, context, [
        RESPONSE_LOSS_TEXT,
      ]);
      const reloaded = await openExecution({
        page,
        scenario,
        env,
        reload: true,
      });
      const target = findTarget(reloaded.responseBody, scenario);
      expect(target.responseText).toBe(RESPONSE_LOSS_TEXT);
      expect(target.draftRevision).toBe(scenario.prepared.targetRevision + 1);
      await expect(reloaded.answer).toHaveValue(RESPONSE_LOSS_TEXT);
      await expect(reloaded.article.getByText(/^已保存：/)).toBeVisible();
      expect(capture.patches).toHaveLength(1);
      const storageAfterReload = await auditDraftStorage(page, context, [
        RESPONSE_LOSS_TEXT,
      ]);
      const targetPatchEntries = session.ledger.entries().filter(
        (entry) =>
          entry.method === 'PATCH' && entry.safeUrlPattern === PATCH_PATTERN,
      );
      expect(targetPatchEntries).toHaveLength(1);
      expect(targetPatchEntries[0]).toMatchObject({
        failureReason: 'aborted',
        bodyKeys: ['expectedRevision', 'responseText'],
      });
      const close = await closeSession(roleContexts, session);
      console.log(
        `B18_U03_RESPONSE_LOSS_EVIDENCE ${safeJsonStringify(
          {
            scenario: 'response-loss',
            upstreamPatchCount: responseLossSummary.upstreamPatchCount,
            upstreamPatchStatus: responseLossSummary.upstreamPatchStatus,
            browserPatchAbortCount:
              responseLossSummary.browserPatchAbortCount,
            firstReconciliationGetAbortCount:
              responseLossSummary.reconciliationGetAbortCount,
            manualReconciliationGetCount: 1,
            fulfilledBusinessResponseCount:
              responseLossSummary.fulfilledBusinessResponseCount,
            browserPatchAttemptCount: capture.patches.length,
            automaticPatchReplay: false,
            finalRevision: scenario.prepared.targetRevision + 1,
            finalDraftHash: hash(RESPONSE_LOSS_TEXT),
            storageBeforeReload,
            storageAfterReload,
            failedRequestCount: close.failedRequestCount,
            contextsClosed: true,
          },
          [
            password,
            descriptor.accounts.doctor.loginIdentifier,
            descriptor.accounts.nurse.loginIdentifier,
            session.cookieValue,
            RESPONSE_LOSS_TEXT,
            scenario.patientId,
            scenario.visitId,
            scenario.scaleInstanceId,
          ],
        )}`,
      );
    } finally {
      capture.stop();
      await responseLoss.dispose();
    }
  });
});
