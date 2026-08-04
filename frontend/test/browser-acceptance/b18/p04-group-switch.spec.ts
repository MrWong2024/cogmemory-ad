import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { BrowserContext, Page, Request, Response } from '@playwright/test';

import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from '../support/acceptance-env';
import { expect, test } from '../support/acceptance-test';
import { ControlledRequestGate } from '../support/network-control';
import { NetworkLedger } from '../support/network-ledger';
import type { RoleContext } from '../support/role-context-factory';
import { safeJsonStringify } from '../support/safe-output';

type ScenarioKey =
  | 'group-switch-valid-flush'
  | 'group-switch-invalid-preserve';

type Scenario = {
  patientId: string;
  visitId: string;
  scaleInstanceId: string;
  navigationPath: string;
  scaleCode: 'mmse';
  itemCode: string;
  crfCode: string | null;
  groupCode: string;
  secondaryItemCode: string;
  secondaryGroupCode: string;
  prepared: {
    targetRevision: number;
    secondaryRevision: number;
  };
};

type Descriptor = {
  schemaVersion: 1;
  batch: 'B18';
  profile: 'B18-P4-group-switch';
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
  groupCode?: string;
  draftRevision: number;
  responseText?: string;
  isMissing: boolean;
  missingReason?: string;
};

type ExecutionGroup = { code: string; title: string };

type ExecutionBody = {
  groups: ExecutionGroup[];
  itemResponses: ExecutionItem[];
};

type CapturedPatch = {
  itemResponseId: string;
  expectedRevision: unknown;
  responseText: unknown;
  isMissing: unknown;
  missingReason: unknown;
  keys: string[];
};

const environment = resolveLiveAcceptanceEnvironment();
const GROUP_A_TEXT = 'B18 U04 group A version';
const GROUP_B_TEXT = 'B18 U04 group B version';
const MISSING_REASON = 'B18 U04 synthetic missing reason';
const PATCH_PATTERN =
  '/patients/<id>/visits/<id>/scale-instances/<id>/item-responses/<id>';

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

function requireSecret(): string {
  const value = process.env.B18_U04_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error('B18_U04_LOGIN_SECRET is required');
  }
  return value;
}

async function readDescriptor(): Promise<Descriptor> {
  const path = process.env.B18_U04_RUNTIME_PATH;
  if (!path) throw new Error('B18_U04_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(path, 'utf8')) as Partial<Descriptor>;
  const scenarios = value.scenarios;
  invariant(
    value.schemaVersion === 1 &&
      value.batch === 'B18' &&
      value.profile === 'B18-P4-group-switch' &&
      typeof value.namespace === 'string' &&
      typeof value.accounts?.doctor.loginIdentifier === 'string' &&
      scenarios,
    'B18 U04 descriptor is invalid',
  );
  for (const key of [
    'group-switch-valid-flush',
    'group-switch-invalid-preserve',
  ] as const) {
    const scenario = scenarios[key];
    invariant(
      scenario &&
        isObjectId(scenario.patientId) &&
        isObjectId(scenario.visitId) &&
        isObjectId(scenario.scaleInstanceId) &&
        scenario.scaleCode === 'mmse' &&
        typeof scenario.itemCode === 'string' &&
        typeof scenario.secondaryItemCode === 'string' &&
        scenario.groupCode !== scenario.secondaryGroupCode &&
        scenario.prepared.targetRevision >= 0 &&
        scenario.prepared.secondaryRevision >= 0,
      'B18 U04 scenario contract is invalid',
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

function itemArticle(page: Page, itemCode: string) {
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
  const target = body.itemResponses.find(
    (item) => item.itemCode === scenario.itemCode,
  );
  const secondary = body.itemResponses.find(
    (item) => item.itemCode === scenario.secondaryItemCode,
  );
  const targetGroup = body.groups.find(
    (group) => group.code === scenario.groupCode,
  );
  const secondaryGroup = body.groups.find(
    (group) => group.code === scenario.secondaryGroupCode,
  );
  invariant(
    target && secondary && targetGroup && secondaryGroup,
    'B18 U04 execution facts are incomplete',
  );
  return { target, secondary, targetGroup, secondaryGroup };
}

function installPatchCapture(page: Page): {
  patches: CapturedPatch[];
  dispose: () => void;
} {
  const patches: CapturedPatch[] = [];
  const handler = (request: Request): void => {
    if (
      request.method() !== 'PATCH' ||
      !new URL(request.url()).pathname.includes('/item-responses/')
    ) {
      return;
    }
    const body = request.postDataJSON() as Record<string, unknown>;
    patches.push({
      itemResponseId: new URL(request.url()).pathname.split('/').at(-1) ?? '',
      expectedRevision: body.expectedRevision,
      responseText: body.responseText,
      isMissing: body.isMissing,
      missingReason: body.missingReason,
      keys: Object.keys(body).sort(),
    });
  };
  page.on('request', handler);
  return { patches, dispose: () => page.off('request', handler) };
}

async function auditStorage(
  page: Page,
  context: BrowserContext,
  forbidden: string[],
): Promise<Record<string, boolean>> {
  const browser = await page.evaluate(async (literals) => {
    const contains = (value: unknown): boolean => {
      const serialized =
        typeof value === 'string' ? value : JSON.stringify(value ?? null);
      return literals.some((literal) => literal && serialized.includes(literal));
    };
    let indexedDbClear = true;
    for (const databaseInfo of
      typeof indexedDB.databases === 'function'
        ? await indexedDB.databases()
        : []) {
      if (!databaseInfo.name) continue;
      indexedDbClear &&= !contains(databaseInfo.name);
    }
    let cacheStorageClear = true;
    for (const cacheName of await caches.keys()) {
      cacheStorageClear &&= !contains(cacheName);
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) {
        cacheStorageClear &&= !contains(request.url);
        const response = await cache.match(request);
        if (response) cacheStorageClear &&= !contains(await response.clone().text());
      }
    }
    return {
      localStorageClear: !Object.entries(localStorage).some(contains),
      sessionStorageClear: !Object.entries(sessionStorage).some(contains),
      indexedDbClear,
      cacheStorageClear,
      urlClear: !contains(`${location.search}${location.hash}`),
    };
  }, forbidden);
  const cookieClear = !(await context.cookies()).some((cookie) =>
    forbidden.some((literal) =>
      `${cookie.name}\n${cookie.value}`.includes(literal),
    ),
  );
  const summary = { ...browser, cookieClear };
  expect(Object.values(summary).every(Boolean)).toBe(true);
  return summary;
}

test.describe('B18 U04 group switch autosave', () => {
  test.beforeEach(() => {
    test.skip(!environment.enabled, 'BROWSER_ACCEPTANCE_RUN_LIVE=1 is required');
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test('group-switch-valid-flush', async ({ roleContexts }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const scenario = descriptor.scenarios['group-switch-valid-flush'];
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const roleContext = await roleContexts.create('doctor', 'b18-u04-valid', {
      viewport: { width: 1280, height: 800 },
    });
    const session = await login({
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      env,
      roleContext,
    });
    const { page, context } = session.roleContext;
    const body = await openExecution({ page, scenario, env });
    const { target, secondary, targetGroup, secondaryGroup } = scenarioFacts(
      body,
      scenario,
    );
    const targetPath = `${scenario.navigationPath}/item-responses/${target.id}`;
    const secondaryPath = `${scenario.navigationPath}/item-responses/${secondary.id}`;
    const capture = installPatchCapture(page);
    const gate = new ControlledRequestGate(
      page,
      (request) =>
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === targetPath,
      15_000,
    );
    await gate.install();
    let gateDisposed = false;
    try {
      const targetArticle = itemArticle(page, scenario.itemCode);
      await targetArticle.locator('textarea').first().fill(GROUP_A_TEXT);
      await expect(
        targetArticle.getByText('等待自动保存', { exact: true }),
      ).toBeVisible();
      await groupButton(page, secondaryGroup.title).click();
      await gate.waitForStarted(5_000);
      await expect(page.getByRole('heading', { name: secondaryGroup.title })).toBeVisible();
      await expect(targetArticle).toHaveCount(0);
      expect(gate.summary().matchedRequestCount).toBe(1);

      const secondaryArticle = itemArticle(page, scenario.secondaryItemCode);
      await secondaryArticle.locator('textarea').first().fill(GROUP_B_TEXT);
      const secondaryResponse = page.waitForResponse(
        (response) =>
          responsePath(response) === secondaryPath &&
          response.request().method() === 'PATCH',
      );
      await secondaryArticle
        .getByRole('button', { name: '保存草稿', exact: true })
        .click();
      expect((await secondaryResponse).status()).toBe(200);
      await expect(secondaryArticle.getByText(/^已保存：/)).toBeVisible();
      expect(gate.summary().matchedRequestCount).toBe(1);

      await groupButton(page, targetGroup.title).click();
      const returnedTarget = itemArticle(page, scenario.itemCode);
      await expect(returnedTarget.locator('textarea').first()).toHaveValue(
        GROUP_A_TEXT,
      );
      await expect(
        returnedTarget.getByText('正在保存', { exact: true }),
      ).toBeVisible();
      const targetResponse = page.waitForResponse(
        (response) =>
          responsePath(response) === targetPath &&
          response.request().method() === 'PATCH',
      );
      gate.resume();
      expect((await targetResponse).status()).toBe(200);
      await expect(returnedTarget.getByText(/^已保存：/)).toBeVisible();
      const gateSummary = await gate.dispose();
      gateDisposed = true;
      expect(gateSummary).toEqual({
        matchedRequestCount: 1,
        abortedRequestCount: 0,
        continuedRequestCount: 1,
      });

      expect(capture.patches).toHaveLength(2);
      expect(capture.patches).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            itemResponseId: target.id,
            expectedRevision: scenario.prepared.targetRevision,
            responseText: GROUP_A_TEXT,
          }),
          expect.objectContaining({
            itemResponseId: secondary.id,
            expectedRevision: scenario.prepared.secondaryRevision,
            responseText: GROUP_B_TEXT,
          }),
        ]),
      );
      const reloaded = await openExecution({ page, scenario, env, reload: true });
      const reloadedFacts = scenarioFacts(reloaded, scenario);
      expect(reloadedFacts.target).toMatchObject({
        draftRevision: scenario.prepared.targetRevision + 1,
        responseText: GROUP_A_TEXT,
      });
      expect(reloadedFacts.secondary).toMatchObject({
        draftRevision: scenario.prepared.secondaryRevision + 1,
        responseText: GROUP_B_TEXT,
      });
      const storage = await auditStorage(page, context, [
        GROUP_A_TEXT,
        GROUP_B_TEXT,
      ]);
      const patches = session.ledger.entries().filter(
        (entry) =>
          entry.method === 'PATCH' && entry.safeUrlPattern === PATCH_PATTERN,
      );
      expect(patches).toHaveLength(2);
      session.ledger.assertNoAutomaticRetry(
        { method: 'PATCH', safeUrlPattern: PATCH_PATTERN },
        2,
      );
      const network = await session.ledger.detach();
      expect((await roleContexts.closeAll()).activeContextCount).toBe(0);
      console.log(
        `B18_U04_VALID_EVIDENCE ${safeJsonStringify(
          {
            profile: 'B18-P4-group-switch',
            patchCount: patches.length,
            revisionDeltas: [1, 1],
            targetDraftHash: hash(GROUP_A_TEXT),
            secondaryDraftHash: hash(GROUP_B_TEXT),
            targetSavingWhileSecondarySaved: true,
            gate: gateSummary,
            storage,
            failedRequestCount: network.failedRequestCount,
            contextsClosed: true,
          },
          [
            password,
            session.cookieValue,
            GROUP_A_TEXT,
            GROUP_B_TEXT,
            scenario.patientId,
            scenario.visitId,
            scenario.scaleInstanceId,
          ],
        )}`,
      );
    } finally {
      capture.dispose();
      gate.resume();
      if (!gateDisposed) await gate.dispose();
    }
  });

  test('group-switch-invalid-preserve', async ({ roleContexts }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const scenario = descriptor.scenarios['group-switch-invalid-preserve'];
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const roleContext = await roleContexts.create('doctor', 'b18-u04-invalid', {
      viewport: { width: 1280, height: 800 },
    });
    const session = await login({
      account: descriptor.accounts.doctor.loginIdentifier,
      password,
      env,
      roleContext,
    });
    const { page, context } = session.roleContext;
    const body = await openExecution({ page, scenario, env });
    const { target, targetGroup, secondaryGroup } = scenarioFacts(body, scenario);
    const targetPath = `${scenario.navigationPath}/item-responses/${target.id}`;
    const capture = installPatchCapture(page);
    const article = itemArticle(page, scenario.itemCode);
    await article.getByLabel('本题无法完成 / 缺失记录').check();
    await expect(
      article.getByText('内容不完整，尚未保存', { exact: true }),
    ).toBeVisible();
    await groupButton(page, secondaryGroup.title).click();
    await expect(page.getByRole('heading', { name: secondaryGroup.title })).toBeVisible();
    expect(
      session.ledger.count({ method: 'PATCH', safeUrlPattern: PATCH_PATTERN }),
    ).toBe(0);

    await groupButton(page, targetGroup.title).click();
    const returned = itemArticle(page, scenario.itemCode);
    await expect(returned.getByLabel('本题无法完成 / 缺失记录')).toBeChecked();
    await expect(returned.getByLabel('缺失原因（必填）')).toHaveValue('');
    await returned.getByLabel('缺失原因（必填）').fill(MISSING_REASON);
    const saveResponse = page.waitForResponse(
      (response) =>
        responsePath(response) === targetPath &&
        response.request().method() === 'PATCH',
    );
    await groupButton(page, secondaryGroup.title).click();
    expect((await saveResponse).status()).toBe(200);
    expect(capture.patches).toHaveLength(1);
    expect(capture.patches[0]).toMatchObject({
      itemResponseId: target.id,
      expectedRevision: scenario.prepared.targetRevision,
      isMissing: true,
      missingReason: MISSING_REASON,
    });
    for (const forbidden of [
      'draftRevision',
      'draftSavedAt',
      'score',
      'evidenceRefs',
      'metadata',
      'submissionWriteBarrier',
    ]) {
      expect(capture.patches[0]!.keys).not.toContain(forbidden);
    }

    const reloaded = await openExecution({ page, scenario, env, reload: true });
    const reloadedTarget = reloaded.itemResponses.find(
      (item) => item.itemCode === scenario.itemCode,
    );
    expect(reloadedTarget).toMatchObject({
      draftRevision: scenario.prepared.targetRevision + 1,
      isMissing: true,
      missingReason: MISSING_REASON,
    });
    const storage = await auditStorage(page, context, [MISSING_REASON]);
    const patches = session.ledger.entries().filter(
      (entry) =>
        entry.method === 'PATCH' && entry.safeUrlPattern === PATCH_PATTERN,
    );
    expect(patches).toHaveLength(1);
    session.ledger.assertNoAutomaticRetry(
      { method: 'PATCH', safeUrlPattern: PATCH_PATTERN },
      1,
    );
    const network = await session.ledger.detach();
    expect((await roleContexts.closeAll()).activeContextCount).toBe(0);
    console.log(
      `B18_U04_INVALID_EVIDENCE ${safeJsonStringify(
        {
          profile: 'B18-P4-group-switch',
          invalidSwitchPatchCount: 0,
          recoveredSwitchPatchCount: 1,
          revisionDelta: 1,
          missingReasonHash: hash(MISSING_REASON),
          localInvalidDraftRetainedAcrossGroups: true,
          storage,
          failedRequestCount: network.failedRequestCount,
          contextsClosed: true,
        },
        [
          password,
          session.cookieValue,
          MISSING_REASON,
          scenario.patientId,
          scenario.visitId,
          scenario.scaleInstanceId,
        ],
      )}`,
    );
    capture.dispose();
  });
});
