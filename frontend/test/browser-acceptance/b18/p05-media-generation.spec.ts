import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { BrowserContext, Page, Request, Response } from '@playwright/test';

import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from '../support/acceptance-env';
import { expect, test } from '../support/acceptance-test';
import { NetworkLedger } from '../support/network-ledger';
import type { RoleContext } from '../support/role-context-factory';
import { safeJsonStringify } from '../support/safe-output';
import { B18UpstreamResponseGate } from './support/b18-upstream-response-gate';

type ScenarioKey =
  | 'media-upload-response-race'
  | 'media-void-reupload-response-race';

type Scenario = {
  patientId: string;
  visitId: string;
  scaleInstanceId: string;
  navigationPath: string;
  scaleCode: 'mmse';
  itemCode: string;
  crfCode: string | null;
  groupCode: string;
  secondaryItemCode: null;
  secondaryGroupCode: null;
  prepared: {
    targetRevision: number;
    targetMediaCount: number;
    targetAttachedMediaCount: number;
    targetVoidedMediaCount: number;
  };
};

type Descriptor = {
  schemaVersion: 1;
  batch: 'B18';
  profile: 'B18-P5-media-generation';
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
  evidenceRequirements: Array<{
    evidenceType: string;
    status: string;
    attached: boolean;
  }>;
};

type ExecutionBody = {
  groups: Array<{ code: string; title: string }>;
  itemResponses: ExecutionItem[];
};

type MediaListBody = {
  items: Array<{ status: string; evidenceType: string }>;
};

type CapturedPatch = {
  expectedRevision: unknown;
  responseText: unknown;
  keys: string[];
};

const environment = resolveLiveAcceptanceEnvironment();
const UPLOAD_TEXT = 'B18 U05 upload race answer';
const VOID_REUPLOAD_TEXT = 'B18 U05 void reupload race answer';
const VOID_REASON = 'B18 U05 synthetic replacement';
const PATCH_PATTERN =
  '/patients/<id>/visits/<id>/scale-instances/<id>/item-responses/<id>';
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

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
  const value = process.env.B18_U05_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error('B18_U05_LOGIN_SECRET is required');
  }
  return value;
}

async function readDescriptor(): Promise<Descriptor> {
  const path = process.env.B18_U05_RUNTIME_PATH;
  if (!path) throw new Error('B18_U05_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(path, 'utf8')) as Partial<Descriptor>;
  invariant(
    value.schemaVersion === 1 &&
      value.batch === 'B18' &&
      value.profile === 'B18-P5-media-generation' &&
      typeof value.namespace === 'string' &&
      typeof value.accounts?.doctor.loginIdentifier === 'string' &&
      value.scenarios,
    'B18 U05 descriptor is invalid',
  );
  for (const key of [
    'media-upload-response-race',
    'media-void-reupload-response-race',
  ] as const) {
    const scenario = value.scenarios[key];
    invariant(
      scenario &&
        isObjectId(scenario.patientId) &&
        isObjectId(scenario.visitId) &&
        isObjectId(scenario.scaleInstanceId) &&
        scenario.scaleCode === 'mmse' &&
        typeof scenario.groupCode === 'string' &&
        scenario.prepared.targetRevision >= 0,
      'B18 U05 scenario contract is invalid',
    );
  }
  invariant(
    value.scenarios['media-upload-response-race'].prepared.targetMediaCount ===
      0 &&
      value.scenarios['media-void-reupload-response-race'].prepared
        .targetMediaCount === 1 &&
      value.scenarios['media-void-reupload-response-race'].prepared
        .targetAttachedMediaCount === 1,
    'B18 U05 prepared media contract is invalid',
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
  invariant(item && group, 'B18 U05 execution target is missing');
  return { item, group };
}

async function showTarget(input: {
  page: Page;
  body: ExecutionBody;
  scenario: Scenario;
}): Promise<{
  item: ExecutionItem;
  targetArticle: ReturnType<typeof article>;
  mediaPath: string;
}> {
  const { item, group } = scenarioFacts(input.body, input.scenario);
  const mediaPath = `${input.scenario.navigationPath}/item-responses/${item.id}/media-evidences`;
  const listResponse = input.page.waitForResponse(
    (response) =>
      responsePath(response) === mediaPath &&
      response.request().method() === 'GET',
  );
  await groupButton(input.page, group.title).click();
  expect((await listResponse).status()).toBe(200);
  const targetArticle = article(input.page, input.scenario.itemCode);
  await expect(targetArticle).toBeVisible();
  await expect(
    targetArticle.getByRole('button', {
      name: '重新加载证据列表',
      exact: true,
    }),
  ).toBeEnabled();
  return { item, targetArticle, mediaPath };
}

function captureTargetPatch(page: Page, targetPath: string): {
  patches: CapturedPatch[];
  dispose: () => void;
} {
  const patches: CapturedPatch[] = [];
  const handler = (request: Request): void => {
    if (
      request.method() !== 'PATCH' ||
      new URL(request.url()).pathname !== targetPath
    ) {
      return;
    }
    const body = request.postDataJSON() as Record<string, unknown>;
    patches.push({
      expectedRevision: body.expectedRevision,
      responseText: body.responseText,
      keys: Object.keys(body).sort(),
    });
  };
  page.on('request', handler);
  return { patches, dispose: () => page.off('request', handler) };
}

async function uploadPhoto(targetArticle: ReturnType<typeof article>) {
  await targetArticle.locator('input[type="file"]').first().setInputFiles({
    name: 'synthetic-photo.png',
    mimeType: 'image/png',
    buffer: VALID_PNG,
  });
  await expect(
    targetArticle.getByAltText('待上传图片证据预览'),
  ).toBeVisible();
  await targetArticle
    .getByRole('button', { name: '上传图片证据', exact: true })
    .click();
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

function photoRequirement(item: ExecutionItem) {
  return item.evidenceRequirements.find(
    (requirement) => requirement.evidenceType === 'photo',
  );
}

test.describe('B18 U05 media generation races', () => {
  test.beforeEach(() => {
    test.skip(!environment.enabled, 'BROWSER_ACCEPTANCE_RUN_LIVE=1 is required');
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test('media-upload-response-race', async ({ roleContexts }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const scenario = descriptor.scenarios['media-upload-response-race'];
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const roleContext = await roleContexts.create('doctor', 'b18-u05-upload', {
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
    const { item, targetArticle, mediaPath } = await showTarget({
      page,
      body,
      scenario,
    });
    expect(photoRequirement(item)).toMatchObject({
      attached: false,
      status: 'pending',
    });
    const targetPath = `${scenario.navigationPath}/item-responses/${item.id}`;
    const capture = captureTargetPatch(page, targetPath);
    const gate = new B18UpstreamResponseGate(
      page,
      'PATCH',
      targetPath,
      item.id,
      20_000,
    );
    await gate.install();
    let gateDisposed = false;
    try {
      await targetArticle.locator('textarea').first().fill(UPLOAD_TEXT);
      await gate.waitForUpstreamResponse(5_000);
      expect(gate.summary()).toMatchObject({
        matchedRequestCount: 1,
        upstreamFetchCount: 1,
        upstreamStatus: 200,
        releasedResponseCount: 0,
      });
      await expect(
        targetArticle.getByText('正在保存', { exact: true }),
      ).toBeVisible();

      const uploadResponse = page.waitForResponse(
        (response) =>
          responsePath(response) === mediaPath &&
          response.request().method() === 'POST',
      );
      await uploadPhoto(targetArticle);
      expect((await uploadResponse).status()).toBe(201);
      await expect(
        targetArticle.getByText('图片证据已上传。', { exact: true }),
      ).toBeVisible();
      await expect(
        targetArticle.getByText('服务端标识：已关联', { exact: true }).first(),
      ).toBeVisible();

      const patchResponse = page.waitForResponse(
        (response) =>
          responsePath(response) === targetPath &&
          response.request().method() === 'PATCH',
      );
      gate.release();
      expect((await patchResponse).status()).toBe(200);
      await expect(targetArticle.getByText(/^已保存：/)).toBeVisible();
      await expect(
        targetArticle.getByText('服务端标识：已关联', { exact: true }).first(),
      ).toBeVisible();
      const gateSummary = await gate.dispose();
      gateDisposed = true;
      expect(gateSummary).toEqual({
        matchedRequestCount: 1,
        upstreamFetchCount: 1,
        upstreamStatus: 200,
        releasedResponseCount: 1,
        abortedBrowserResponseCount: 0,
        timedOutCount: 0,
      });
      expect(capture.patches).toEqual([
        expect.objectContaining({
          expectedRevision: scenario.prepared.targetRevision,
          responseText: UPLOAD_TEXT,
        }),
      ]);
      for (const forbidden of ['evidenceRefs', 'draftRevision', 'metadata']) {
        expect(capture.patches[0]!.keys).not.toContain(forbidden);
      }

      const reloaded = await openExecution({ page, scenario, env, reload: true });
      const reloadedItem = scenarioFacts(reloaded, scenario).item;
      expect(reloadedItem).toMatchObject({
        draftRevision: scenario.prepared.targetRevision + 1,
        responseText: UPLOAD_TEXT,
      });
      expect(photoRequirement(reloadedItem)).toMatchObject({
        status: 'attached',
        attached: true,
      });
      const storage = await auditStorage(page, context, [UPLOAD_TEXT]);
      const patches = session.ledger.entries().filter(
        (entry) =>
          entry.method === 'PATCH' && entry.safeUrlPattern === PATCH_PATTERN,
      );
      const uploads = session.ledger
        .entries()
        .filter(
          (entry) =>
            entry.method === 'POST' &&
            entry.status === 201 &&
            entry.safeUrlPattern.endsWith('/media-evidences'),
        );
      expect(patches).toHaveLength(1);
      expect(uploads).toHaveLength(1);
      session.ledger.assertNoAutomaticRetry(
        { method: 'PATCH', safeUrlPattern: PATCH_PATTERN },
        1,
      );
      const network = await session.ledger.detach();
      expect((await roleContexts.closeAll()).activeContextCount).toBe(0);
      console.log(
        `B18_U05_UPLOAD_EVIDENCE ${safeJsonStringify(
          {
            profile: 'B18-P5-media-generation',
            patchCount: 1,
            uploadCount: 1,
            revisionDelta: 1,
            finalDraftHash: hash(UPLOAD_TEXT),
            mediaGenerationPreserved: true,
            gate: gateSummary,
            storage,
            failedRequestCount: network.failedRequestCount,
            contextsClosed: true,
          },
          [
            password,
            session.cookieValue,
            UPLOAD_TEXT,
            scenario.patientId,
            scenario.visitId,
            scenario.scaleInstanceId,
          ],
        )}`,
      );
    } finally {
      capture.dispose();
      gate.release();
      if (!gateDisposed) await gate.dispose();
    }
  });

  test('media-void-reupload-response-race', async ({ roleContexts }) => {
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const scenario = descriptor.scenarios['media-void-reupload-response-race'];
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const roleContext = await roleContexts.create('doctor', 'b18-u05-reupload', {
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
    const { item, targetArticle, mediaPath } = await showTarget({
      page,
      body,
      scenario,
    });
    await expect(
      targetArticle.getByRole('button', { name: '作废此证据', exact: true }),
    ).toBeVisible();
    const targetPath = `${scenario.navigationPath}/item-responses/${item.id}`;
    const capture = captureTargetPatch(page, targetPath);
    const gate = new B18UpstreamResponseGate(
      page,
      'PATCH',
      targetPath,
      item.id,
      25_000,
    );
    await gate.install();
    let gateDisposed = false;
    try {
      await targetArticle.locator('textarea').first().fill(VOID_REUPLOAD_TEXT);
      await gate.waitForUpstreamResponse(5_000);
      expect(gate.summary().upstreamStatus).toBe(200);

      await targetArticle
        .getByRole('button', { name: '作废此证据', exact: true })
        .click();
      await targetArticle.getByLabel('作废原因（必填，3–1000 字符）').fill(VOID_REASON);
      const voidResponse = page.waitForResponse(
        (response) =>
          responsePath(response).startsWith(`${mediaPath}/`) &&
          responsePath(response).endsWith('/void') &&
          response.request().method() === 'POST',
      );
      await targetArticle
        .getByRole('button', { name: '确认作废证据', exact: true })
        .click();
      expect((await voidResponse).status()).toBe(200);
      await expect(
        targetArticle.getByText(
          '媒体证据已作废，历史记录仍保留，现在可以重新上传。',
          { exact: true },
        ),
      ).toBeVisible();

      const uploadResponse = page.waitForResponse(
        (response) =>
          responsePath(response) === mediaPath &&
          response.request().method() === 'POST',
      );
      await uploadPhoto(targetArticle);
      expect((await uploadResponse).status()).toBe(201);
      await expect(
        targetArticle.getByText('图片证据已上传。', { exact: true }),
      ).toBeVisible();
      await expect(
        targetArticle.getByText('服务端标识：已关联', { exact: true }).first(),
      ).toBeVisible();

      const patchResponse = page.waitForResponse(
        (response) =>
          responsePath(response) === targetPath &&
          response.request().method() === 'PATCH',
      );
      gate.release();
      expect((await patchResponse).status()).toBe(200);
      await expect(targetArticle.getByText(/^已保存：/)).toBeVisible();
      await expect(
        targetArticle.getByText('服务端标识：已关联', { exact: true }).first(),
      ).toBeVisible();
      const gateSummary = await gate.dispose();
      gateDisposed = true;
      expect(gateSummary.releasedResponseCount).toBe(1);
      expect(capture.patches).toEqual([
        expect.objectContaining({
          expectedRevision: scenario.prepared.targetRevision,
          responseText: VOID_REUPLOAD_TEXT,
        }),
      ]);

      const reloaded = await openExecution({ page, scenario, env, reload: true });
      const reloadedItem = scenarioFacts(reloaded, scenario).item;
      expect(reloadedItem).toMatchObject({
        draftRevision: scenario.prepared.targetRevision + 1,
        responseText: VOID_REUPLOAD_TEXT,
      });
      expect(photoRequirement(reloadedItem)).toMatchObject({
        status: 'attached',
        attached: true,
      });
      const reloadedTarget = await showTarget({ page, body: reloaded, scenario });
      const listResponse = page.waitForResponse(
        (response) =>
          responsePath(response) === reloadedTarget.mediaPath &&
          response.request().method() === 'GET',
      );
      await reloadedTarget.targetArticle
        .getByRole('button', { name: '重新加载证据列表', exact: true })
        .click();
      const mediaList = (await (await listResponse).json()) as MediaListBody;
      expect(
        mediaList.items.filter(
          (entry) => entry.evidenceType === 'photo' && entry.status === 'attached',
        ),
      ).toHaveLength(1);
      expect(
        mediaList.items.filter(
          (entry) => entry.evidenceType === 'photo' && entry.status === 'voided',
        ),
      ).toHaveLength(1);
      const storage = await auditStorage(page, context, [
        VOID_REUPLOAD_TEXT,
        VOID_REASON,
      ]);
      const entries = session.ledger.entries();
      const patches = entries.filter(
        (entry) =>
          entry.method === 'PATCH' && entry.safeUrlPattern === PATCH_PATTERN,
      );
      const voids = entries.filter(
        (entry) =>
          entry.method === 'POST' && entry.safeUrlPattern.endsWith('/void'),
      );
      const uploads = entries.filter(
        (entry) =>
          entry.method === 'POST' &&
          entry.status === 201 &&
          entry.safeUrlPattern.endsWith('/media-evidences'),
      );
      expect(patches).toHaveLength(1);
      expect(voids).toHaveLength(1);
      expect(uploads).toHaveLength(1);
      const network = await session.ledger.detach();
      expect((await roleContexts.closeAll()).activeContextCount).toBe(0);
      console.log(
        `B18_U05_REUPLOAD_EVIDENCE ${safeJsonStringify(
          {
            profile: 'B18-P5-media-generation',
            patchCount: 1,
            voidCount: 1,
            uploadCount: 1,
            revisionDelta: 1,
            finalDraftHash: hash(VOID_REUPLOAD_TEXT),
            activePhotoCount: 1,
            voidedPhotoCount: 1,
            mediaGenerationPreserved: true,
            gate: gateSummary,
            storage,
            failedRequestCount: network.failedRequestCount,
            contextsClosed: true,
          },
          [
            password,
            session.cookieValue,
            VOID_REUPLOAD_TEXT,
            VOID_REASON,
            scenario.patientId,
            scenario.visitId,
            scenario.scaleInstanceId,
          ],
        )}`,
      );
    } finally {
      capture.dispose();
      gate.release();
      if (!gateDisposed) await gate.dispose();
    }
  });
});
