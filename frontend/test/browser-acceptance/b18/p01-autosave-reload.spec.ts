import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { BrowserContext, Dialog, Page, Request, Response } from '@playwright/test';

import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from '../support/acceptance-env';
import { expect, test } from '../support/acceptance-test';
import { BeforeUnloadEvidence } from '../support/beforeunload-evidence';
import { ControlledRequestGate } from '../support/network-control';
import { NetworkLedger } from '../support/network-ledger';
import type { RoleContext } from '../support/role-context-factory';
import { safeJsonStringify } from '../support/safe-output';

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
  profile: 'B18-P1-autosave-reload';
  namespace: string;
  accounts: Record<'doctor' | 'nurse', { loginIdentifier: string }>;
  scenarios: Record<'autosave-reload', Scenario>;
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

type CapturedPatch = {
  keys: string[];
  expectedRevision: unknown;
  responseText: unknown;
  markAsAnswered: unknown;
};

const environment = resolveLiveAcceptanceEnvironment();
const VERSION_A = 'B18 U01 autosave first version A';
const VERSION_B = 'B18 U01 autosave trailing version B';
const PATCH_PATTERN =
  '/patients/<id>/visits/<id>/scale-instances/<id>/item-responses/<id>';

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
  const value = process.env.B18_U01_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error('B18_U01_LOGIN_SECRET is required');
  }
  return value;
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

async function readDescriptor(): Promise<Descriptor> {
  const runtimePath = process.env.B18_U01_RUNTIME_PATH;
  if (!runtimePath) throw new Error('B18_U01_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(runtimePath, 'utf8')) as unknown;
  invariant(value && typeof value === 'object', 'B18 U01 descriptor is invalid');
  const descriptor = value as Partial<Descriptor>;
  const scenario = descriptor.scenarios?.['autosave-reload'];
  invariant(
    descriptor.schemaVersion === 1 &&
      descriptor.batch === 'B18' &&
      descriptor.profile === 'B18-P1-autosave-reload' &&
      typeof descriptor.namespace === 'string' &&
      /^[a-z0-9][a-z0-9-]{2,19}$/.test(descriptor.namespace) &&
      typeof descriptor.accounts?.doctor.loginIdentifier === 'string' &&
      typeof descriptor.accounts.nurse.loginIdentifier === 'string' &&
      descriptor.accounts.doctor.loginIdentifier !==
        descriptor.accounts.nurse.loginIdentifier &&
      scenario &&
      isObjectId(scenario.patientId) &&
      isObjectId(scenario.visitId) &&
      isObjectId(scenario.scaleInstanceId) &&
      scenario.scaleCode === 'mmse' &&
      typeof scenario.itemCode === 'string' &&
      scenario.itemCode.length > 0 &&
      scenario.prepared.targetRevision >= 0,
    'B18 U01 descriptor contract is invalid',
  );
  return descriptor as Descriptor;
}

function responsePath(response: Response): string {
  return new URL(response.url()).pathname;
}

async function login(input: {
  account: string;
  password: string;
  env: EnabledEnvironment;
  roleContext: RoleContext;
}): Promise<Session> {
  const { context, page } = input.roleContext;
  const ledger = new NetworkLedger();
  await ledger.attach(page);
  await page.goto(`${input.env.frontendOrigin}/login`, {
    waitUntil: 'domcontentloaded',
  });
  expect(await page.evaluate(() => window.location.origin)).toBe(
    input.env.frontendOrigin,
  );
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
  return { roleContext: input.roleContext, ledger, cookieValue: cookies[0]!.value };
}

async function openExecution(input: {
  page: Page;
  scenario: Scenario;
  env: EnabledEnvironment;
  reload?: boolean;
}): Promise<Record<string, unknown>> {
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
  return (await (await responsePromise).json()) as Record<string, unknown>;
}

function capturePatch(request: Request): CapturedPatch {
  const value = request.postDataJSON() as unknown;
  invariant(
    value && typeof value === 'object' && !Array.isArray(value),
    'B18 U01 PATCH body is invalid',
  );
  const body = value as Record<string, unknown>;
  return {
    keys: Object.keys(body).sort(),
    expectedRevision: body.expectedRevision,
    responseText: body.responseText,
    markAsAnswered: body.markAsAnswered,
  };
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

test.describe('B18 U01 autosave and reload', () => {
  test.beforeEach(() => {
    test.skip(!environment.enabled, 'BROWSER_ACCEPTANCE_RUN_LIVE=1 is required');
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test('serial autosave preserves the trailing edit and reloads only server facts', async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const scenario = descriptor.scenarios['autosave-reload'];
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const roleContext = await roleContexts.create('doctor', 'b18-u01-doctor', {
      viewport: { width: 1280, height: 800 },
    });
    const session = await login({
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      env,
      roleContext,
    });
    const { context, page } = session.roleContext;
    const initialBody = await openExecution({ page, scenario, env });
    const initialItems = (initialBody.itemResponses ?? []) as Array<
      Record<string, unknown>
    >;
    const initialTarget = initialItems.find(
      (item) => item.itemCode === scenario.itemCode,
    );
    invariant(
      initialTarget && isObjectId(initialTarget.id),
      'B18 U01 target identity is missing',
    );
    const article = page
      .getByRole('article')
      .filter({ hasText: `题目编码：${scenario.itemCode}` });
    const answer = article.locator('textarea').first();
    await expect(answer).toBeVisible();
    await expect(article.getByText(/^当前没有未保存修改|^已保存：/)).toBeVisible();
    const targetPath = `${scenario.navigationPath}/item-responses/${initialTarget.id}`;
    const capturedPatches: CapturedPatch[] = [];
    const onTargetPatch = (request: Request): void => {
      if (
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === targetPath
      ) {
        capturedPatches.push(capturePatch(request));
      }
    };
    page.on('request', onTargetPatch);
    const gate = new ControlledRequestGate(
      page,
      (request) =>
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === targetPath,
      10_000,
    );
    await gate.install();
    let gateDisposed = false;
    try {
      await answer.fill(VERSION_A);
      await expect(article.getByText('等待自动保存', { exact: true })).toBeVisible();
      expect(session.ledger.count({ method: 'PATCH', safeUrlPattern: PATCH_PATTERN })).toBe(0);
      await gate.waitForStarted(5_000);
      expect(gate.summary().matchedRequestCount).toBe(1);
      const firstPatch = capturedPatches[0];
      invariant(firstPatch, 'B18 U01 target PATCH was not captured');
      expect(firstPatch.keys).toEqual(['expectedRevision', 'responseText']);
      expect(firstPatch.expectedRevision).toBe(scenario.prepared.targetRevision);
      expect(firstPatch.responseText).toBe(VERSION_A);
      expect(firstPatch.markAsAnswered).not.toBe(true);
      for (const forbiddenKey of [
        'draftRevision',
        'draftSavedAt',
        'score',
        'evidenceRefs',
        'metadata',
        'submissionWriteBarrier',
        'barrierId',
        'attemptId',
      ]) {
        expect(firstPatch.keys).not.toContain(forbiddenKey);
      }

      await expect(article.getByText('正在保存', { exact: true })).toBeVisible();
      await answer.fill(VERSION_B);
      await expect(answer).toHaveValue(VERSION_B);
      await expect(page.getByText('未收口作答：1 题', { exact: true }).first()).toBeVisible();
      expect(session.ledger.count({ method: 'PATCH', safeUrlPattern: PATCH_PATTERN })).toBe(1);

      const unload = new BeforeUnloadEvidence(page, 'dismiss');
      unload.observe();
      const executionUrl = page.url();
      await page
        .goto(`${env.frontendOrigin}/dashboard`, {
          waitUntil: 'domcontentloaded',
        })
        .catch(() => undefined);
      const dirtyUnload = unload.stop();
      expect(dirtyUnload).toEqual({
        beforeUnloadDialogCount: 1,
        otherDialogCount: 0,
        automatedDisposition: 'dismiss',
      });
      expect(page.url()).toBe(executionUrl);
      await expect(answer).toHaveValue(VERSION_B);
      expect(session.ledger.count({ method: 'PATCH', safeUrlPattern: PATCH_PATTERN })).toBe(1);

      gate.resume();
      await expect(article.getByText(/^已保存：/)).toBeVisible();
      const gateSummary = await gate.dispose();
      gateDisposed = true;
      expect(gateSummary).toEqual({
        matchedRequestCount: 2,
        abortedRequestCount: 0,
        continuedRequestCount: 2,
      });
      expect(capturedPatches).toHaveLength(2);
      expect(capturedPatches[1]).toEqual({
        keys: ['expectedRevision', 'responseText'],
        expectedRevision: scenario.prepared.targetRevision + 1,
        responseText: VERSION_B,
        markAsAnswered: undefined,
      });
      await expect(article.getByText(/^已保存：/)).toBeVisible();
      await expect(answer).toHaveValue(VERSION_B);
      await expect(page.getByText('未收口作答：0 题', { exact: true }).first()).toBeVisible();
      expect(session.ledger.count({ method: 'PATCH', safeUrlPattern: PATCH_PATTERN })).toBe(2);

      const storageBeforeReload = await auditDraftStorage(page, context, [
        VERSION_A,
        VERSION_B,
      ]);
      let cleanDialogCount = 0;
      const onCleanDialog = async (dialog: Dialog): Promise<void> => {
        cleanDialogCount += 1;
        await dialog.dismiss();
      };
      page.on('dialog', onCleanDialog);
      const reloadedBody = await openExecution({
        page,
        scenario,
        env,
        reload: true,
      });
      page.off('dialog', onCleanDialog);
      expect(cleanDialogCount).toBe(0);
      const bodyItems = (reloadedBody.itemResponses ?? []) as Array<
        Record<string, unknown>
      >;
      const target = bodyItems.find((item) => item.itemCode === scenario.itemCode);
      invariant(target, 'B18 U01 reloaded target is missing');
      expect(target.draftRevision).toBe(scenario.prepared.targetRevision + 2);
      expect(target.responseText).toBe(VERSION_B);
      expect(typeof target.draftSavedAt).toBe('string');
      const reloadedArticle = page
        .getByRole('article')
        .filter({ hasText: `题目编码：${scenario.itemCode}` });
      await expect(reloadedArticle.locator('textarea').first()).toHaveValue(VERSION_B);
      await expect(reloadedArticle.getByText(/^已保存：/)).toBeVisible();
      const storageAfterReload = await auditDraftStorage(page, context, [
        VERSION_A,
        VERSION_B,
      ]);

      const patches = session.ledger.entries().filter(
        (entry) =>
          entry.method === 'PATCH' && entry.safeUrlPattern === PATCH_PATTERN,
      );
      expect(patches).toEqual([
        expect.objectContaining({
          status: 200,
          failureReason: null,
          bodyKeys: ['expectedRevision', 'responseText'],
        }),
        expect.objectContaining({
          status: 200,
          failureReason: null,
          bodyKeys: ['expectedRevision', 'responseText'],
        }),
      ]);
      session.ledger.assertNoAutomaticRetry(
        { method: 'PATCH', safeUrlPattern: PATCH_PATTERN },
        2,
      );
      const adjacentWrites = session.ledger.entries().filter(
        (entry) =>
          entry.method !== 'GET' &&
          entry.safeUrlPattern !== '/auth/login' &&
          entry.safeUrlPattern !== PATCH_PATTERN,
      );
      expect(adjacentWrites).toHaveLength(0);
      const network = await session.ledger.detach();
      expect((await roleContexts.closeAll()).activeContextCount).toBe(0);
      console.log(
        `B18_U01_EVIDENCE ${safeJsonStringify(
          {
            profile: 'B18-P1-autosave-reload',
            contexts: 1,
            viewport: '1280x800',
            patchCount: patches.length,
            patchStatuses: patches.map((entry) => entry.status),
            patchBodyKeys: patches.map((entry) => entry.bodyKeys),
            revisions: [
              scenario.prepared.targetRevision,
              scenario.prepared.targetRevision + 1,
              scenario.prepared.targetRevision + 2,
            ],
            firstPatchExpectedRevisionMatched: true,
            trailingPatchExpectedRevisionMatched: true,
            parallelPatchCountWhileHeld: 1,
            dirtyUnload,
            cleanReloadDialogCount: cleanDialogCount,
            finalDraftHash: hash(VERSION_B),
            storageBeforeReload,
            storageAfterReload,
            adjacentWrites: 0,
            failedRequestCount: network.failedRequestCount,
            contextsClosed: true,
          },
          [
            password,
            descriptor.accounts.doctor.loginIdentifier,
            descriptor.accounts.nurse.loginIdentifier,
            session.cookieValue,
            VERSION_A,
            VERSION_B,
            scenario.patientId,
            scenario.visitId,
            scenario.scaleInstanceId,
          ],
        )}`,
      );
      page.off('request', onTargetPatch);
    } finally {
      gate.resume();
      if (!gateDisposed) await gate.dispose();
      page.off('request', onTargetPatch);
    }
  });
});
