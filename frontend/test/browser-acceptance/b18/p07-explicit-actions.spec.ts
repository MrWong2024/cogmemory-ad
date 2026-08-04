import { readFile } from 'node:fs/promises';

import type { Locator, Page, Request, Response } from '@playwright/test';

import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from '../support/acceptance-env';
import { expect, test } from '../support/acceptance-test';
import { NetworkLedger } from '../support/network-ledger';
import type { RoleContext } from '../support/role-context-factory';
import { safeJsonStringify } from '../support/safe-output';

type ScenarioKey = 'explicit-save-draft' | 'explicit-mark-answered';

type Scenario = {
  patientId: string;
  visitId: string;
  scaleInstanceId: string;
  navigationPath: string;
  scaleCode: 'mmse';
  itemCode: string;
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
  profile: 'B18-P7-explicit-actions';
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

type ExecutionItem = {
  id: string;
  itemCode: string;
  draftRevision: number;
  responseText?: string;
  status: string;
};

type ExecutionBody = {
  scaleInstance: {
    status: string;
    progress: { totalItemCount: number; answeredItemCount: number };
  };
  itemResponses: ExecutionItem[];
};

type CapturedPatch = {
  keys: string[];
  expectedRevision: unknown;
  responseText: unknown;
  markAsAnswered: unknown;
};

const environment = resolveLiveAcceptanceEnvironment();
const EXPLICIT_DRAFT_TEXT = 'B18 U07 explicit draft version';
const PREPARED_COMPLETION_TEXT = 'B18 U07 prepared completion draft';
const PATCH_PATTERN =
  '/patients/<id>/visits/<id>/scale-instances/<id>/item-responses/<id>';

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

function requireSecret(): string {
  const value = process.env.B18_U07_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error('B18_U07_LOGIN_SECRET is required');
  }
  return value;
}

async function readDescriptor(): Promise<Descriptor> {
  const path = process.env.B18_U07_RUNTIME_PATH;
  if (!path) throw new Error('B18_U07_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(path, 'utf8')) as Partial<Descriptor>;
  invariant(
    value.schemaVersion === 1 &&
      value.batch === 'B18' &&
      value.profile === 'B18-P7-explicit-actions' &&
      typeof value.namespace === 'string' &&
      typeof value.accounts?.doctor.loginIdentifier === 'string' &&
      value.scenarios,
    'B18 U07 descriptor is invalid',
  );
  for (const key of [
    'explicit-save-draft',
    'explicit-mark-answered',
  ] as const) {
    const scenario = value.scenarios[key];
    invariant(
      scenario &&
        isObjectId(scenario.patientId) &&
        isObjectId(scenario.visitId) &&
        isObjectId(scenario.scaleInstanceId) &&
        scenario.scaleCode === 'mmse' &&
        typeof scenario.itemCode === 'string' &&
        scenario.prepared.targetRevision >= 0,
      'B18 U07 scenario contract is invalid',
    );
  }
  return value as Descriptor;
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
  expect(await (await meResponse).json()).toMatchObject({
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
  return {
    roleContext: input.roleContext,
    ledger,
    cookieValue: cookies[0]!.value,
  };
}

async function openExecution(input: {
  page: Page;
  scenario: Scenario;
  env: EnabledEnvironment;
  reload?: boolean;
}): Promise<{ body: ExecutionBody; item: ExecutionItem; article: Locator }> {
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
  const body = (await (await responsePromise).json()) as ExecutionBody;
  const item = body.itemResponses.find(
    (candidate) => candidate.itemCode === input.scenario.itemCode,
  );
  invariant(item && isObjectId(item.id), 'B18 U07 target item is missing');
  const article = input.page
    .getByRole('article')
    .filter({ hasText: `题目编码：${input.scenario.itemCode}` });
  await expect(article).toBeVisible();
  return { body, item, article };
}

function capturePatch(request: Request): CapturedPatch {
  const value = request.postDataJSON() as unknown;
  invariant(
    value && typeof value === 'object' && !Array.isArray(value),
    'B18 U07 PATCH body is invalid',
  );
  const body = value as Record<string, unknown>;
  return {
    keys: Object.keys(body).sort(),
    expectedRevision: body.expectedRevision,
    responseText: body.responseText,
    markAsAnswered: body.markAsAnswered,
  };
}

function installPatchMonitor(page: Page, targetPath: string) {
  const patches: CapturedPatch[] = [];
  const active = new Set<Request>();
  let maxActive = 0;
  const isTarget = (request: Request) =>
    request.method() === 'PATCH' &&
    new URL(request.url()).pathname === targetPath;
  const onRequest = (request: Request): void => {
    if (!isTarget(request)) return;
    patches.push(capturePatch(request));
    active.add(request);
    maxActive = Math.max(maxActive, active.size);
  };
  const onSettled = (request: Request): void => {
    if (isTarget(request)) active.delete(request);
  };
  page.on('request', onRequest);
  page.on('requestfinished', onSettled);
  page.on('requestfailed', onSettled);
  return {
    patches,
    maxActiveCount: () => maxActive,
    dispose: () => {
      page.off('request', onRequest);
      page.off('requestfinished', onSettled);
      page.off('requestfailed', onSettled);
    },
  };
}

async function waitPastAutosaveDebounce(page: Page): Promise<void> {
  const deadline = await page.evaluate(() => performance.now() + 1_000);
  await page.waitForFunction(
    (target) => performance.now() >= target,
    deadline,
    { polling: 'raf', timeout: 2_000 },
  );
}

const forbiddenDraftKeys = [
  'draftRevision',
  'draftSavedAt',
  'score',
  'evidenceRequirements',
  'metadata',
  'submissionWriteBarrier',
  'barrierId',
  'attemptId',
];

test.describe('B18 U07 explicit save actions', () => {
  test.beforeEach(() => {
    test.skip(!environment.enabled, 'BROWSER_ACCEPTANCE_RUN_LIVE=1 is required');
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test('explicit-save-draft', async ({ roleContexts }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const scenario = descriptor.scenarios['explicit-save-draft'];
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const roleContext = await roleContexts.create('doctor', 'b18-u07-draft', {
      viewport: { width: 1280, height: 800 },
    });
    const session = await login({
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      env,
      roleContext,
    });
    const { page } = session.roleContext;
    const opened = await openExecution({ page, scenario, env });
    expect(opened.item.draftRevision).toBe(scenario.prepared.targetRevision);
    const targetPath = `${scenario.navigationPath}/item-responses/${opened.item.id}`;
    const monitor = installPatchMonitor(page, targetPath);
    const expectedDraftStatus =
      scenario.prepared.targetStatus === 'not_started'
        ? 'in_progress'
        : scenario.prepared.targetStatus;
    try {
      const answer = opened.article.locator('textarea').first();
      await answer.fill(EXPLICIT_DRAFT_TEXT);
      expect(monitor.patches).toHaveLength(0);
      const saveResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          responsePath(response) === targetPath,
      );
      await opened.article
        .getByRole('button', { name: '保存草稿', exact: true })
        .click();
      const saveResponse = await saveResponsePromise;
      expect(saveResponse.status()).toBe(200);
      expect(await saveResponse.json()).toMatchObject({
        itemResponse: {
          draftRevision: scenario.prepared.targetRevision + 1,
          status: expectedDraftStatus,
        },
        progress: {
          totalItemCount: scenario.prepared.totalItemCount,
          answeredItemCount: scenario.prepared.answeredItemCount,
        },
      });
      await expect(opened.article.getByText(/^已保存：/)).toBeVisible();
      await waitPastAutosaveDebounce(page);
      expect(monitor.patches).toEqual([
        {
          keys: ['expectedRevision', 'responseText'],
          expectedRevision: scenario.prepared.targetRevision,
          responseText: EXPLICIT_DRAFT_TEXT,
          markAsAnswered: undefined,
        },
      ]);
      for (const key of forbiddenDraftKeys) {
        expect(monitor.patches[0]!.keys).not.toContain(key);
      }
      expect(monitor.maxActiveCount()).toBe(1);

      const reloaded = await openExecution({ page, scenario, env, reload: true });
      expect(reloaded.item).toMatchObject({
        draftRevision: scenario.prepared.targetRevision + 1,
        responseText: EXPLICIT_DRAFT_TEXT,
        status: expectedDraftStatus,
      });
      await expect(reloaded.article.locator('textarea').first()).toHaveValue(
        EXPLICIT_DRAFT_TEXT,
      );
      expect(monitor.patches).toHaveLength(1);
      const targetPatches = session.ledger.entries().filter(
        (entry) =>
          entry.method === 'PATCH' && entry.safeUrlPattern === PATCH_PATTERN,
      );
      expect(targetPatches).toHaveLength(1);
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
        `B18_U07_DRAFT_EVIDENCE ${safeJsonStringify(
          {
            action: 'save_draft',
            patchCount: 1,
            requestKeys: monitor.patches[0]?.keys,
            revisionDelta: 1,
            targetStatus: expectedDraftStatus,
            answeredItemCountDelta: 0,
            debounceDuplicatePatch: false,
            reloadMatchedServerFacts: true,
            maxSameItemActivePatchCount: monitor.maxActiveCount(),
            adjacentWrites: 0,
            failedRequestCount: network.failedRequestCount,
            contextsClosed: true,
          },
          [
            password,
            session.cookieValue,
            EXPLICIT_DRAFT_TEXT,
            scenario.patientId,
            scenario.visitId,
            scenario.scaleInstanceId,
          ],
        )}`,
      );
    } finally {
      monitor.dispose();
    }
  });

  test('explicit-mark-answered', async ({ roleContexts }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const scenario = descriptor.scenarios['explicit-mark-answered'];
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const roleContext = await roleContexts.create('doctor', 'b18-u07-complete', {
      viewport: { width: 1280, height: 800 },
    });
    const session = await login({
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      env,
      roleContext,
    });
    const { page } = session.roleContext;
    const opened = await openExecution({ page, scenario, env });
    expect(opened.item).toMatchObject({
      draftRevision: scenario.prepared.targetRevision,
      responseText: PREPARED_COMPLETION_TEXT,
      status: 'in_progress',
    });
    const targetPath = `${scenario.navigationPath}/item-responses/${opened.item.id}`;
    const monitor = installPatchMonitor(page, targetPath);
    try {
      const saveResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          responsePath(response) === targetPath,
      );
      await opened.article
        .getByRole('button', {
          name: '保存并标记本题完成',
          exact: true,
        })
        .click();
      const saveResponse = await saveResponsePromise;
      expect(saveResponse.status()).toBe(200);
      expect(await saveResponse.json()).toMatchObject({
        itemResponse: {
          draftRevision: scenario.prepared.targetRevision + 1,
          status: 'answered',
        },
        progress: {
          totalItemCount: scenario.prepared.totalItemCount,
          answeredItemCount: scenario.prepared.answeredItemCount + 1,
        },
      });
      await expect(
        opened.article.getByText('本题已完成', { exact: true }),
      ).toBeVisible();
      await expect(opened.article.getByText(/^已保存：/)).toBeVisible();
      await waitPastAutosaveDebounce(page);
      expect(monitor.patches).toEqual([
        {
          keys: ['expectedRevision', 'markAsAnswered'],
          expectedRevision: scenario.prepared.targetRevision,
          responseText: undefined,
          markAsAnswered: true,
        },
      ]);
      for (const key of [...forbiddenDraftKeys, 'responseText']) {
        expect(monitor.patches[0]!.keys).not.toContain(key);
      }
      expect(monitor.maxActiveCount()).toBe(1);
      const reloaded = await openExecution({ page, scenario, env, reload: true });
      expect(reloaded.item).toMatchObject({
        draftRevision: scenario.prepared.targetRevision + 1,
        responseText: PREPARED_COMPLETION_TEXT,
        status: 'answered',
      });
      expect(reloaded.body.scaleInstance.progress).toEqual({
        totalItemCount: scenario.prepared.totalItemCount,
        answeredItemCount: scenario.prepared.answeredItemCount + 1,
      });
      expect(monitor.patches).toHaveLength(1);
      const targetPatches = session.ledger.entries().filter(
        (entry) =>
          entry.method === 'PATCH' && entry.safeUrlPattern === PATCH_PATTERN,
      );
      expect(targetPatches).toHaveLength(1);
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
        `B18_U07_COMPLETE_EVIDENCE ${safeJsonStringify(
          {
            action: 'mark_answered',
            patchCount: 1,
            requestKeys: monitor.patches[0]?.keys,
            revisionDelta: 1,
            targetStatus: 'answered',
            answeredItemCountDelta: 1,
            trailingDuplicatePatch: false,
            maxSameItemActivePatchCount: monitor.maxActiveCount(),
            adjacentWrites: 0,
            failedRequestCount: network.failedRequestCount,
            contextsClosed: true,
          },
          [
            password,
            session.cookieValue,
            PREPARED_COMPLETION_TEXT,
            scenario.patientId,
            scenario.visitId,
            scenario.scaleInstanceId,
          ],
        )}`,
      );
    } finally {
      monitor.dispose();
    }
  });
});
