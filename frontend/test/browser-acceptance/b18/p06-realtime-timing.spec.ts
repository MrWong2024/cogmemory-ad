import { readFile } from 'node:fs/promises';

import type {
  BrowserContext,
  Locator,
  Page,
  Request,
  Response,
} from '@playwright/test';

import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from '../support/acceptance-env';
import { runAccessibilityAudit } from '../support/accessibility-audit';
import { expect, test } from '../support/acceptance-test';
import {
  assertFocusVisible,
  assertTrustedKeyPair,
  clearKeyboardEvidence,
  installKeyboardEvidence,
  pressKeyboardDownUp,
  readKeyboardEvidence,
  tabToLocator,
} from '../support/keyboard-evidence';
import { NetworkLedger } from '../support/network-ledger';
import type { RoleContext } from '../support/role-context-factory';
import { safeJsonStringify } from '../support/safe-output';
import {
  assertNoGlobalHorizontalOverflow,
  auditViewport,
} from '../support/viewport-audit';
import { B18ExactRequestGate } from './support/b18-exact-request-gate';

type ScenarioKey = 'system-timer-lifecycle' | 'external-timing-reset';

type Scenario = {
  patientId: string;
  visitId: string;
  scaleInstanceId: string;
  navigationPath: string;
  scaleCode: 'moca';
  itemCode: string;
  crfCode: string | null;
  groupCode: string;
  secondaryItemCode: null;
  secondaryGroupCode: null;
  prepared: { targetRevision: number };
};

type Descriptor = {
  schemaVersion: 1;
  batch: 'B18';
  profile: 'B18-P6-realtime-timing';
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

type Timing = {
  timerState: 'idle' | 'running' | 'paused' | 'completed';
  startedAt: string | null;
  lastResumedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  timerSource: 'none' | 'system' | 'manual' | 'imported';
};

type ExecutionItem = {
  id: string;
  itemCode: string;
  groupCode?: string;
  draftRevision: number;
  timing: Timing | null;
};

type ExecutionBody = {
  groups: Array<{ code: string; title: string }>;
  itemResponses: ExecutionItem[];
};

type CapturedPatch = {
  expectedRevision: unknown;
  timing: unknown;
  keys: string[];
};

type PatchMonitor = {
  patches: CapturedPatch[];
  completedCount: () => number;
  maxActiveCount: () => number;
  statuses: () => number[];
  dispose: () => void;
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
  const value = process.env.B18_U06_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error('B18_U06_LOGIN_SECRET is required');
  }
  return value;
}

async function readDescriptor(): Promise<Descriptor> {
  const path = process.env.B18_U06_RUNTIME_PATH;
  if (!path) throw new Error('B18_U06_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(path, 'utf8')) as Partial<Descriptor>;
  invariant(
    value.schemaVersion === 1 &&
      value.batch === 'B18' &&
      value.profile === 'B18-P6-realtime-timing' &&
      typeof value.namespace === 'string' &&
      typeof value.accounts?.doctor.loginIdentifier === 'string' &&
      value.scenarios,
    'B18 U06 descriptor is invalid',
  );
  for (const key of [
    'system-timer-lifecycle',
    'external-timing-reset',
  ] as const) {
    const scenario = value.scenarios[key];
    invariant(
      scenario &&
        isObjectId(scenario.patientId) &&
        isObjectId(scenario.visitId) &&
        isObjectId(scenario.scaleInstanceId) &&
        scenario.scaleCode === 'moca' &&
        typeof scenario.groupCode === 'string' &&
        scenario.prepared.targetRevision >= 0,
      'B18 U06 scenario contract is invalid',
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
  const { page, context } = input.roleContext;
  const ledger = new NetworkLedger();
  await ledger.attach(page);
  await page.goto(`${input.env.frontendOrigin}/login`, {
    waitUntil: 'domcontentloaded',
  });
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
}): Promise<ExecutionBody> {
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
  return (await (await responsePromise).json()) as ExecutionBody;
}

function article(page: Page, itemCode: string) {
  return page
    .getByRole('article')
    .filter({ hasText: `题目编码：${itemCode}` });
}

function groupButton(page: Page, title: string) {
  return page
    .getByRole('navigation', { name: '量表分组导航' })
    .getByRole('button')
    .filter({ hasText: title });
}

function scenarioFacts(body: ExecutionBody, scenario: Scenario) {
  const item = body.itemResponses.find(
    (candidate) => candidate.itemCode === scenario.itemCode,
  );
  const group = body.groups.find(
    (candidate) => candidate.code === scenario.groupCode,
  );
  invariant(item && group, 'B18 U06 timing target is missing');
  invariant(
    body.groups.some((candidate) => candidate.code !== group.code),
    'B18 U06 adjacent group is missing',
  );
  return {
    item,
    group,
    adjacentGroup: body.groups.find(
      (candidate) => candidate.code !== group.code,
    )!,
  };
}

function installPatchMonitor(page: Page, targetPath: string): PatchMonitor {
  const patches: CapturedPatch[] = [];
  const active = new Set<Request>();
  const responseStatuses: number[] = [];
  let maxActive = 0;
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
    const request = response.request();
    if (!isTarget(request)) return;
    active.delete(request);
    responseStatuses.push(response.status());
  };
  const onRequestFailed = (request: Request): void => {
    if (isTarget(request)) active.delete(request);
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);
  return {
    patches,
    completedCount: () => responseStatuses.length,
    maxActiveCount: () => maxActive,
    statuses: () => [...responseStatuses],
    dispose: () => {
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('requestfailed', onRequestFailed);
    },
  };
}

async function waitForCompleted(monitor: PatchMonitor, count: number) {
  await expect.poll(monitor.completedCount, { timeout: 8_000 }).toBe(count);
  expect(monitor.statuses()).toEqual(Array.from({ length: count }, () => 200));
}

function expectTimingPatch(
  patch: CapturedPatch,
  expectedRevision: number,
  state: Timing['timerState'] | null,
  source: Timing['timerSource'] | null,
) {
  expect(patch.expectedRevision).toBe(expectedRevision);
  if (state === null) {
    expect(patch.timing).toBeNull();
  } else {
    expect(patch.timing).toMatchObject({ timerState: state, timerSource: source });
  }
  expect(patch.keys).toEqual(['expectedRevision', 'timing']);
}

function matchesSystemCheckpoint(
  body: unknown,
  expectedRevision: number,
): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(',') !== 'expectedRevision,timing' ||
    record.expectedRevision !== expectedRevision ||
    !record.timing ||
    typeof record.timing !== 'object' ||
    Array.isArray(record.timing)
  ) {
    return false;
  }
  const timing = record.timing as Record<string, unknown>;
  return (
    timing.timerState === 'running' &&
    timing.timerSource === 'system' &&
    typeof timing.durationMs === 'number' &&
    Number.isSafeInteger(timing.durationMs) &&
    timing.durationMs >= 15_000 &&
    typeof timing.startedAt === 'string' &&
    timing.startedAt.length > 0 &&
    typeof timing.lastResumedAt === 'string' &&
    timing.lastResumedAt.length > 0 &&
    timing.completedAt === null
  );
}

async function displayedDurationSeconds(itemArticle: Locator): Promise<number> {
  const text = await itemArticle
    .getByText('当前显示用时', { exact: true })
    .locator('..')
    .locator('dd')
    .textContent();
  const match =
    text
      ?.trim()
      .match(/^(?:(\d+) 小时 )?(?:(\d+) 分 )?(\d+) 秒$/) ?? null;
  invariant(match, 'B18 U06 displayed duration is invalid');
  return (
    Number(match[1] ?? 0) * 3_600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3])
  );
}

async function auditStorage(
  page: Page,
  context: BrowserContext,
  forbidden: string[],
): Promise<Record<string, boolean>> {
  const facts = await page.evaluate(async (literals) => {
    const contains = (value: unknown): boolean => {
      const serialized =
        typeof value === 'string' ? value : JSON.stringify(value ?? null);
      return literals.some((literal) => literal && serialized.includes(literal));
    };
    let cacheClear = true;
    for (const name of await caches.keys()) {
      cacheClear &&= !contains(name);
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        cacheClear &&= !contains(request.url);
        const response = await cache.match(request);
        if (response) cacheClear &&= !contains(await response.clone().text());
      }
    }
    const databaseNames =
      typeof indexedDB.databases === 'function'
        ? (await indexedDB.databases()).map((entry) => entry.name ?? '')
        : [];
    return {
      localStorageClear: !Object.entries(localStorage).some(contains),
      sessionStorageClear: !Object.entries(sessionStorage).some(contains),
      indexedDbClear: !databaseNames.some(contains),
      cacheStorageClear: cacheClear,
      urlClear: !contains(`${location.search}${location.hash}`),
    };
  }, forbidden);
  const cookieClear = !(await context.cookies()).some((cookie) =>
    forbidden.some((literal) =>
      `${cookie.name}\n${cookie.value}`.includes(literal),
    ),
  );
  const summary = { ...facts, cookieClear };
  expect(Object.values(summary).every(Boolean)).toBe(true);
  return summary;
}

test.describe('B18 U06 real-time timing', () => {
  test.beforeEach(() => {
    test.skip(!environment.enabled, 'BROWSER_ACCEPTANCE_RUN_LIVE=1 is required');
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test('system-timer-lifecycle', async ({ roleContexts }) => {
    test.setTimeout(75_000);
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const scenario = descriptor.scenarios['system-timer-lifecycle'];
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const roleContext = await roleContexts.create('doctor', 'b18-u06-system', {
      viewport: { width: 800, height: 1280 },
    });
    const session = await login({
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      env,
      roleContext,
    });
    const { page, context } = session.roleContext;
    const body = await openExecution({ page, scenario, env });
    const { item, group, adjacentGroup } = scenarioFacts(body, scenario);
    const targetArticle = article(page, scenario.itemCode);
    await expect(targetArticle).toBeVisible();
    const targetPath = `${scenario.navigationPath}/item-responses/${item.id}`;
    const monitor = installPatchMonitor(page, targetPath);
    const startedAtWallClock = Date.now();
    await targetArticle
      .getByRole('button', { name: '开始计时', exact: true })
      .click();
    await waitForCompleted(monitor, 1);
    await expect(targetArticle.getByText('运行中', { exact: true })).toBeVisible();
    expectTimingPatch(
      monitor.patches[0]!,
      scenario.prepared.targetRevision,
      'running',
      'system',
    );
    const initialDisplaySeconds = await displayedDurationSeconds(targetArticle);

    const checkpointGate = new B18ExactRequestGate(
      page,
      `${env.backendOrigin}${targetPath}`,
      (requestBody) =>
        matchesSystemCheckpoint(
          requestBody,
          scenario.prepared.targetRevision + 1,
        ),
      30_000,
    );
    await checkpointGate.install();
    let gateDisposed = false;
    try {
      await groupButton(page, adjacentGroup.title).click();
      await expect(
        page.getByRole('heading', {
          name: adjacentGroup.title,
          level: 2,
          exact: true,
        }),
      ).toBeVisible();
      await checkpointGate.waitForStarted(30_000);
      const checkpointElapsedMs = Date.now() - startedAtWallClock;
      expect(checkpointElapsedMs).toBeGreaterThanOrEqual(15_000);
      expect(monitor.patches).toHaveLength(2);
      expectTimingPatch(
        monitor.patches[1]!,
        scenario.prepared.targetRevision + 1,
        'running',
        'system',
      );
      expect(monitor.maxActiveCount()).toBe(1);

      await groupButton(page, group.title).click();
      const returnedTarget = article(page, scenario.itemCode);
      await expect(returnedTarget.getByText('运行中', { exact: true })).toBeVisible();
      expect(await displayedDurationSeconds(returnedTarget)).toBeGreaterThan(
        initialDisplaySeconds,
      );
      await returnedTarget
        .getByRole('button', { name: '暂停计时', exact: true })
        .click();
      await expect(returnedTarget.getByText('已暂停', { exact: true })).toBeVisible();
      expect(monitor.patches).toHaveLength(2);
      expect(checkpointGate.summary().matchedRequestCount).toBe(1);
      expect(checkpointGate.summary().continuedRequestCount).toBe(0);
      checkpointGate.resume();
      await waitForCompleted(monitor, 3);
      expect(monitor.patches).toHaveLength(3);
      expectTimingPatch(
        monitor.patches[2]!,
        scenario.prepared.targetRevision + 2,
        'paused',
        'system',
      );
      const gateSummary = await checkpointGate.dispose();
      gateDisposed = true;
      expect(gateSummary).toEqual({
        matchedRequestCount: 1,
        abortedRequestCount: 0,
        continuedRequestCount: 1,
      });

      await returnedTarget
        .getByRole('button', { name: '继续计时', exact: true })
        .click();
      await waitForCompleted(monitor, 4);
      expectTimingPatch(
        monitor.patches[3]!,
        scenario.prepared.targetRevision + 3,
        'running',
        'system',
      );
      await returnedTarget
        .getByRole('button', { name: '完成计时', exact: true })
        .click();
      await waitForCompleted(monitor, 5);
      expectTimingPatch(
        monitor.patches[4]!,
        scenario.prepared.targetRevision + 4,
        'completed',
        'system',
      );
      expect(monitor.maxActiveCount()).toBe(1);

      const reloaded = await openExecution({ page, scenario, env, reload: true });
      const reloadedItem = scenarioFacts(reloaded, scenario).item;
      expect(reloadedItem.draftRevision).toBe(
        scenario.prepared.targetRevision + 5,
      );
      expect(reloadedItem.timing).toMatchObject({
        timerState: 'completed',
        timerSource: 'system',
        lastResumedAt: null,
      });
      expect(reloadedItem.timing?.durationMs).toBeGreaterThanOrEqual(15_000);
      const storage = await auditStorage(page, context, [
        scenario.patientId,
        scenario.visitId,
        scenario.scaleInstanceId,
      ]);
      const patches = session.ledger.entries().filter(
        (entry) =>
          entry.method === 'PATCH' && entry.safeUrlPattern === PATCH_PATTERN,
      );
      expect(patches).toHaveLength(5);
      session.ledger.assertNoAutomaticRetry(
        { method: 'PATCH', safeUrlPattern: PATCH_PATTERN },
        5,
      );
      const network = await session.ledger.detach();
      monitor.dispose();
      expect((await roleContexts.closeAll()).activeContextCount).toBe(0);
      console.log(
        `B18_U06_SYSTEM_EVIDENCE ${safeJsonStringify(
          {
            profile: 'B18-P6-realtime-timing',
            patchCount: 5,
            revisionDelta: 5,
            checkpointElapsedMs,
            checkpointHeldBeforeBackend: true,
            pauseQueuedBehindCheckpoint: true,
            maxSameItemActivePatchCount: monitor.maxActiveCount(),
            finalTimerState: 'completed',
            finalTimerSource: 'system',
            gate: gateSummary,
            storage,
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
      checkpointGate.resume();
      if (!gateDisposed) await checkpointGate.dispose();
      monitor.dispose();
    }
  });

  test('external-timing-reset', async ({ roleContexts }) => {
    test.setTimeout(45_000);
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const scenario = descriptor.scenarios['external-timing-reset'];
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const roleContext = await roleContexts.create('doctor', 'b18-u06-external', {
      viewport: { width: 800, height: 1280 },
    });
    const session = await login({
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      env,
      roleContext,
    });
    const { page, context } = session.roleContext;
    await installKeyboardEvidence(page);
    let body = await openExecution({ page, scenario, env });
    let { item } = scenarioFacts(body, scenario);
    const targetPath = `${scenario.navigationPath}/item-responses/${item.id}`;
    const monitor = installPatchMonitor(page, targetPath);
    let targetArticle = article(page, scenario.itemCode);
    await targetArticle
      .getByRole('button', { name: '开始计时', exact: true })
      .click();
    await waitForCompleted(monitor, 1);
    await expect(
      targetArticle.getByRole('button', {
        name: '录入手工完成态',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      targetArticle.getByRole('button', {
        name: '录入导入完成态',
        exact: true,
      }),
    ).toBeDisabled();

    const resetButton = targetArticle.getByRole('button', {
      name: '复位计时',
      exact: true,
    });
    const resetTraversal = await tabToLocator(page, resetButton, 160);
    await assertFocusVisible(resetButton);
    await clearKeyboardEvidence(page);
    await pressKeyboardDownUp(page, 'Enter');
    expect(
      assertTrustedKeyPair(await readKeyboardEvidence(page), 'Enter', 'button'),
    ).toBe(2);

    const resetCheckbox = targetArticle.getByLabel('我确认复位本题计时。');
    const checkboxTraversal = await tabToLocator(page, resetCheckbox, 8);
    await assertFocusVisible(resetCheckbox);
    await clearKeyboardEvidence(page);
    await pressKeyboardDownUp(page, 'Space');
    await expect(resetCheckbox).toBeChecked();
    expect(
      assertTrustedKeyPair(await readKeyboardEvidence(page), ' ', 'checkbox'),
    ).toBe(2);

    const confirmReset = targetArticle.getByRole('button', {
      name: '确认复位',
      exact: true,
    });
    const confirmTraversal = await tabToLocator(page, confirmReset, 8);
    await assertFocusVisible(confirmReset);
    await clearKeyboardEvidence(page);
    await pressKeyboardDownUp(page, 'Enter');
    expect(
      assertTrustedKeyPair(await readKeyboardEvidence(page), 'Enter', 'button'),
    ).toBe(2);
    await waitForCompleted(monitor, 2);

    body = await openExecution({ page, scenario, env, reload: true });
    item = scenarioFacts(body, scenario).item;
    expect(item).toMatchObject({
      draftRevision: scenario.prepared.targetRevision + 2,
      timing: null,
    });
    targetArticle = article(page, scenario.itemCode);
    await targetArticle
      .getByRole('button', { name: '录入手工完成态', exact: true })
      .click();
    await waitForCompleted(monitor, 3);

    body = await openExecution({ page, scenario, env, reload: true });
    item = scenarioFacts(body, scenario).item;
    expect(item.draftRevision).toBe(scenario.prepared.targetRevision + 3);
    expect(item.timing).toMatchObject({
      timerState: 'completed',
      timerSource: 'manual',
      durationMs: 0,
    });
    targetArticle = article(page, scenario.itemCode);
    await targetArticle
      .getByRole('button', { name: '复位计时', exact: true })
      .click();
    await targetArticle.getByLabel('我确认复位本题计时。').check();
    await targetArticle
      .getByRole('button', { name: '确认复位', exact: true })
      .click();
    await waitForCompleted(monitor, 4);

    body = await openExecution({ page, scenario, env, reload: true });
    item = scenarioFacts(body, scenario).item;
    expect(item).toMatchObject({
      draftRevision: scenario.prepared.targetRevision + 4,
      timing: null,
    });
    targetArticle = article(page, scenario.itemCode);
    await targetArticle
      .getByRole('button', { name: '录入导入完成态', exact: true })
      .click();
    await waitForCompleted(monitor, 5);

    body = await openExecution({ page, scenario, env, reload: true });
    item = scenarioFacts(body, scenario).item;
    expect(item.draftRevision).toBe(scenario.prepared.targetRevision + 5);
    expect(item.timing).toMatchObject({
      timerState: 'completed',
      timerSource: 'imported',
      durationMs: 0,
      lastResumedAt: null,
    });
    expect(monitor.patches).toHaveLength(5);
    expectTimingPatch(
      monitor.patches[0]!,
      scenario.prepared.targetRevision,
      'running',
      'system',
    );
    expectTimingPatch(
      monitor.patches[1]!,
      scenario.prepared.targetRevision + 1,
      null,
      null,
    );
    expectTimingPatch(
      monitor.patches[2]!,
      scenario.prepared.targetRevision + 2,
      'completed',
      'manual',
    );
    expectTimingPatch(
      monitor.patches[3]!,
      scenario.prepared.targetRevision + 3,
      null,
      null,
    );
    expectTimingPatch(
      monitor.patches[4]!,
      scenario.prepared.targetRevision + 4,
      'completed',
      'imported',
    );
    expect(monitor.maxActiveCount()).toBe(1);

    const viewport = await auditViewport(page, { width: 800, height: 1280 });
    assertNoGlobalHorizontalOverflow(viewport);
    const focusedAudit = await runAccessibilityAudit(page, {
      include: [`#submission-item-${item.id}`],
    });
    const seriousOrCritical = focusedAudit.violations.filter(
      (violation) =>
        violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(seriousOrCritical).toHaveLength(0);
    const storage = await auditStorage(page, context, [
      scenario.patientId,
      scenario.visitId,
      scenario.scaleInstanceId,
    ]);
    const patches = session.ledger.entries().filter(
      (entry) =>
        entry.method === 'PATCH' && entry.safeUrlPattern === PATCH_PATTERN,
    );
    expect(patches).toHaveLength(5);
    const network = await session.ledger.detach();
    monitor.dispose();
    expect((await roleContexts.closeAll()).activeContextCount).toBe(0);
    console.log(
      `B18_U06_EXTERNAL_EVIDENCE ${safeJsonStringify(
        {
          profile: 'B18-P6-realtime-timing',
          patchCount: 5,
          revisionDelta: 5,
          resetCount: 2,
          finalTimerState: 'completed',
          finalTimerSource: 'imported',
          maxSameItemActivePatchCount: monitor.maxActiveCount(),
          keyboard: {
            resetTraversal,
            checkboxTraversal,
            confirmTraversal,
            trustedEnterPairs: 2,
            trustedSpacePairs: 1,
            focusVisible: true,
          },
          viewport,
          seriousOrCriticalViolationCount: seriousOrCritical.length,
          storage,
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
  });
});
