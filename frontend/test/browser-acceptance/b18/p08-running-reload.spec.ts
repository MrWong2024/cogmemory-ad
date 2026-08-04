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

type Timing = {
  timerState: 'idle' | 'running' | 'paused' | 'completed';
  startedAt: string | null;
  lastResumedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  timerSource: 'none' | 'system' | 'manual' | 'imported';
};

type Scenario = {
  patientId: string;
  visitId: string;
  scaleInstanceId: string;
  navigationPath: string;
  scaleCode: 'moca';
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
  profile: 'B18-P8-running-reload';
  namespace: string;
  accounts: Record<'doctor' | 'nurse', { loginIdentifier: string }>;
  scenarios: { 'running-reload-checkpoint': Scenario };
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
  status: string;
  timing: Timing | null;
};

type ExecutionBody = {
  scaleInstance: {
    status: string;
    progress: { totalItemCount: number; answeredItemCount: number };
  };
  itemResponses: ExecutionItem[];
};

type CapturedPatch = {
  expectedRevision: unknown;
  timing: unknown;
  keys: string[];
};

const environment = resolveLiveAcceptanceEnvironment();
const PATCH_PATTERN =
  '/patients/<id>/visits/<id>/scale-instances/<id>/item-responses/<id>';

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

function requireSecret(): string {
  const value = process.env.B18_U08_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error('B18_U08_LOGIN_SECRET is required');
  }
  return value;
}

async function readDescriptor(): Promise<Descriptor> {
  const path = process.env.B18_U08_RUNTIME_PATH;
  if (!path) throw new Error('B18_U08_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(path, 'utf8')) as Partial<Descriptor>;
  const scenario = value.scenarios?.['running-reload-checkpoint'];
  invariant(
    value.schemaVersion === 1 &&
      value.batch === 'B18' &&
      value.profile === 'B18-P8-running-reload' &&
      typeof value.namespace === 'string' &&
      typeof value.accounts?.doctor.loginIdentifier === 'string' &&
      scenario &&
      isObjectId(scenario.patientId) &&
      isObjectId(scenario.visitId) &&
      isObjectId(scenario.scaleInstanceId) &&
      scenario.scaleCode === 'moca' &&
      typeof scenario.itemCode === 'string' &&
      scenario.prepared.targetRevision >= 0,
    'B18 U08 descriptor is invalid',
  );
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
  invariant(item && isObjectId(item.id), 'B18 U08 target item is missing');
  const article = input.page
    .getByRole('article')
    .filter({ hasText: `题目编码：${input.scenario.itemCode}` });
  await expect(article).toBeVisible();
  return { body, item, article };
}

function installPatchMonitor(page: Page, targetPath: string) {
  const patches: CapturedPatch[] = [];
  const active = new Set<Request>();
  let maxActive = 0;
  const statuses: number[] = [];
  const isTarget = (request: Request) =>
    request.method() === 'PATCH' &&
    new URL(request.url()).pathname === targetPath;
  const onRequest = (request: Request): void => {
    if (!isTarget(request)) return;
    const body = request.postDataJSON() as Record<string, unknown>;
    patches.push({
      expectedRevision: body.expectedRevision,
      timing: body.timing,
      keys: Object.keys(body).sort(),
    });
    active.add(request);
    maxActive = Math.max(maxActive, active.size);
  };
  const onResponse = (response: Response): void => {
    if (!isTarget(response.request())) return;
    active.delete(response.request());
    statuses.push(response.status());
  };
  const onFailed = (request: Request): void => {
    if (isTarget(request)) active.delete(request);
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onFailed);
  return {
    patches,
    statuses,
    maxActiveCount: () => maxActive,
    dispose: () => {
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('requestfailed', onFailed);
    },
  };
}

function timingFromPatch(patch: CapturedPatch): Timing {
  invariant(
    patch.timing &&
      typeof patch.timing === 'object' &&
      !Array.isArray(patch.timing),
    'B18 U08 timing PATCH is invalid',
  );
  return patch.timing as Timing;
}

function matchesCheckpoint(request: Request, expectedRevision: number): boolean {
  if (request.method() !== 'PATCH') return false;
  const body = request.postDataJSON() as Record<string, unknown>;
  const timing = body.timing as Partial<Timing> | undefined;
  return (
    body.expectedRevision === expectedRevision &&
    timing?.timerState === 'running' &&
    timing.timerSource === 'system' &&
    typeof timing.durationMs === 'number' &&
    Number.isSafeInteger(timing.durationMs) &&
    timing.durationMs >= 15_000
  );
}

async function displayedDurationSeconds(article: Locator): Promise<number> {
  const text = await article
    .getByText('当前显示用时', { exact: true })
    .locator('..')
    .locator('dd')
    .textContent();
  const match =
    text?.trim().match(/^(?:(\d+) 小时 )?(?:(\d+) 分 )?(\d+) 秒$/) ?? null;
  invariant(match, 'B18 U08 displayed duration is invalid');
  return (
    Number(match[1] ?? 0) * 3_600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3])
  );
}

test.describe('B18 U08 running timer reload', () => {
  test.beforeEach(() => {
    test.skip(!environment.enabled, 'BROWSER_ACCEPTANCE_RUN_LIVE=1 is required');
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test('running-reload-checkpoint', async ({ roleContexts }) => {
    test.setTimeout(60_000);
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const scenario = descriptor.scenarios['running-reload-checkpoint'];
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const roleContext = await roleContexts.create('doctor', 'b18-u08-running', {
      viewport: { width: 800, height: 1280 },
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
      timing: {
        timerState: 'idle',
        timerSource: 'none',
        durationMs: null,
        startedAt: null,
        lastResumedAt: null,
        completedAt: null,
      },
    });
    const targetPath = `${scenario.navigationPath}/item-responses/${opened.item.id}`;
    const monitor = installPatchMonitor(page, targetPath);
    const expectedDraftStatus =
      scenario.prepared.targetStatus === 'not_started'
        ? 'in_progress'
        : scenario.prepared.targetStatus;
    try {
      const startResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          responsePath(response) === targetPath,
      );
      await opened.article
        .getByRole('button', { name: '开始计时', exact: true })
        .click();
      const startResponse = await startResponsePromise;
      expect(startResponse.status()).toBe(200);
      const startBody = (await startResponse.json()) as {
        itemResponse: ExecutionItem;
      };
      const serverStart = startBody.itemResponse.timing;
      invariant(
        serverStart?.timerState === 'running' &&
          serverStart.timerSource === 'system' &&
          typeof serverStart.startedAt === 'string' &&
          typeof serverStart.lastResumedAt === 'string',
        'B18 U08 server start timing is invalid',
      );
      expect(monitor.patches).toHaveLength(1);
      expect(monitor.patches[0]).toMatchObject({
        expectedRevision: scenario.prepared.targetRevision,
        keys: ['expectedRevision', 'timing'],
      });
      expect(timingFromPatch(monitor.patches[0]!).timerState).toBe('running');

      const reloaded = await openExecution({ page, scenario, env, reload: true });
      expect(reloaded.item.draftRevision).toBe(
        scenario.prepared.targetRevision + 1,
      );
      expect(reloaded.item.timing).toMatchObject({
        timerState: 'running',
        timerSource: 'system',
        startedAt: serverStart.startedAt,
        lastResumedAt: serverStart.lastResumedAt,
      });
      await expect(
        reloaded.article.getByText('运行中', { exact: true }),
      ).toBeVisible();
      expect(monitor.patches).toHaveLength(1);
      const displayAfterReload = await displayedDurationSeconds(
        reloaded.article,
      );
      const checkpointResponsePromise = page.waitForResponse(
        (response) =>
          responsePath(response) === targetPath &&
          matchesCheckpoint(
            response.request(),
            scenario.prepared.targetRevision + 1,
          ),
        { timeout: 30_000 },
      );
      await expect
        .poll(() => displayedDurationSeconds(reloaded.article), {
          timeout: 5_000,
        })
        .toBeGreaterThan(displayAfterReload);
      const checkpointResponse = await checkpointResponsePromise;
      expect(checkpointResponse.status()).toBe(200);
      const checkpointWallClockMs =
        Date.now() - Date.parse(serverStart.lastResumedAt);
      expect(checkpointWallClockMs).toBeGreaterThanOrEqual(15_000);
      expect(monitor.patches).toHaveLength(2);
      expect(monitor.patches[1]).toMatchObject({
        expectedRevision: scenario.prepared.targetRevision + 1,
        keys: ['expectedRevision', 'timing'],
      });
      const checkpointTiming = timingFromPatch(monitor.patches[1]!);
      expect(checkpointTiming).toMatchObject({
        timerState: 'running',
        timerSource: 'system',
        startedAt: serverStart.startedAt,
        completedAt: null,
      });
      expect(checkpointTiming.durationMs).toBeGreaterThanOrEqual(15_000);

      const pauseResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          responsePath(response) === targetPath &&
          (response.request().postDataJSON() as Record<string, unknown>)
            .expectedRevision ===
            scenario.prepared.targetRevision + 2,
      );
      await reloaded.article
        .getByRole('button', { name: '暂停计时', exact: true })
        .click();
      const pauseResponse = await pauseResponsePromise;
      expect(pauseResponse.status()).toBe(200);
      await expect(
        reloaded.article.getByText('已暂停', { exact: true }),
      ).toBeVisible();
      expect(monitor.patches).toHaveLength(3);
      expect(monitor.patches.map((patch) => patch.expectedRevision)).toEqual([
        scenario.prepared.targetRevision,
        scenario.prepared.targetRevision + 1,
        scenario.prepared.targetRevision + 2,
      ]);
      const pauseTiming = timingFromPatch(monitor.patches[2]!);
      expect(pauseTiming).toMatchObject({
        timerState: 'paused',
        timerSource: 'system',
        startedAt: serverStart.startedAt,
        lastResumedAt: null,
        completedAt: null,
      });
      expect(Number.isSafeInteger(pauseTiming.durationMs)).toBe(true);
      expect(pauseTiming.durationMs).toBeGreaterThanOrEqual(
        checkpointTiming.durationMs ?? 0,
      );
      expect(monitor.statuses).toEqual([200, 200, 200]);
      expect(monitor.maxActiveCount()).toBe(1);

      const finalReload = await openExecution({
        page,
        scenario,
        env,
        reload: true,
      });
      expect(finalReload.item).toMatchObject({
        draftRevision: scenario.prepared.targetRevision + 3,
        status: expectedDraftStatus,
        timing: {
          timerState: 'paused',
          timerSource: 'system',
          startedAt: serverStart.startedAt,
          lastResumedAt: null,
          completedAt: null,
        },
      });
      expect(Number.isSafeInteger(finalReload.item.timing?.durationMs)).toBe(
        true,
      );
      expect(finalReload.item.timing?.durationMs).toBeGreaterThanOrEqual(0);
      expect(finalReload.body.scaleInstance.progress).toEqual({
        totalItemCount: scenario.prepared.totalItemCount,
        answeredItemCount: scenario.prepared.answeredItemCount,
      });
      expect(monitor.patches).toHaveLength(3);
      const patches = session.ledger.entries().filter(
        (entry) =>
          entry.method === 'PATCH' && entry.safeUrlPattern === PATCH_PATTERN,
      );
      expect(patches).toHaveLength(3);
      session.ledger.assertNoAutomaticRetry(
        { method: 'PATCH', safeUrlPattern: PATCH_PATTERN },
        3,
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
        `B18_U08_EVIDENCE ${safeJsonStringify(
          {
            patchCount: 3,
            expectedRevisionSequence: monitor.patches.map(
              (patch) => patch.expectedRevision,
            ),
            startPatchCount: monitor.patches.filter(
              (patch) => timingFromPatch(patch).timerState === 'running' &&
                (timingFromPatch(patch).durationMs ?? 0) < 15_000,
            ).length,
            reloadKeptServerAnchors: true,
            displayContinued: true,
            checkpointWallClockMs,
            checkpointCount: 1,
            finalTimerState: 'paused',
            finalTimerSource: 'system',
            revisionDelta: 3,
            maxSameItemActivePatchCount: monitor.maxActiveCount(),
            adjacentWrites: 0,
            failedRequestCount: network.failedRequestCount,
            contextsClosed: true,
          },
          [
            password,
            session.cookieValue,
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
