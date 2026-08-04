import { readFile } from 'node:fs/promises';

import type { Locator, Page, Request, Response } from '@playwright/test';

import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from '../support/acceptance-env';
import { expect, test } from '../support/acceptance-test';
import type { RoleContext } from '../support/role-context-factory';
import { safeJsonStringify } from '../support/safe-output';
import { B18ExactRequestAbort } from './support/b18-exact-request-abort';

type Scenario = {
  patientId: string;
  visitId: string;
  scaleInstanceId: string;
  navigationPath: string;
  scaleCode: 'mmse';
  itemCode: string;
  groupCode: string;
  prepared: {
    targetRevision: number;
    targetStatus: string;
    instanceStatus: string;
    totalItemCount: number;
    answeredItemCount: number;
    targetMediaCount: number;
    targetAttachedMediaCount: number;
    targetVoidedMediaCount: number;
  };
};

type Descriptor = {
  schemaVersion: 1;
  batch: 'B18';
  profile: 'B18-P9-media-failure';
  namespace: string;
  accounts: Record<'doctor' | 'nurse', { loginIdentifier: string }>;
  scenarios: { 'media-upload-failure-preserve': Scenario };
};

type EnabledEnvironment = Extract<
  ReturnType<typeof resolveLiveAcceptanceEnvironment>,
  { enabled: true }
>;

type Session = {
  roleContext: RoleContext;
  cookieValue: string;
};

type ExecutionItem = {
  id: string;
  itemCode: string;
  groupCode?: string;
  draftRevision: number;
  responseText?: string;
  status: string;
  evidenceRequirements: Array<{
    evidenceType: string;
    status: string;
    attached: boolean;
  }>;
};

type ExecutionBody = {
  groups: Array<{ code: string; title: string }>;
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
const RETAINED_TEXT = 'B18 U09 retained text draft';
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

function requireSecret(): string {
  const value = process.env.B18_U09_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error('B18_U09_LOGIN_SECRET is required');
  }
  return value;
}

async function readDescriptor(): Promise<Descriptor> {
  const path = process.env.B18_U09_RUNTIME_PATH;
  if (!path) throw new Error('B18_U09_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(path, 'utf8')) as Partial<Descriptor>;
  const scenario = value.scenarios?.['media-upload-failure-preserve'];
  invariant(
    value.schemaVersion === 1 &&
      value.batch === 'B18' &&
      value.profile === 'B18-P9-media-failure' &&
      typeof value.namespace === 'string' &&
      typeof value.accounts?.doctor.loginIdentifier === 'string' &&
      scenario &&
      isObjectId(scenario.patientId) &&
      isObjectId(scenario.visitId) &&
      isObjectId(scenario.scaleInstanceId) &&
      scenario.scaleCode === 'mmse' &&
      typeof scenario.itemCode === 'string' &&
      typeof scenario.groupCode === 'string' &&
      scenario.prepared.targetRevision >= 0 &&
      scenario.prepared.targetMediaCount === 0 &&
      scenario.prepared.targetAttachedMediaCount === 0 &&
      scenario.prepared.targetVoidedMediaCount === 0,
    'B18 U09 descriptor is invalid',
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
  return { roleContext: input.roleContext, cookieValue: cookies[0]!.value };
}

async function openExecution(input: {
  page: Page;
  scenario: Scenario;
  env: EnabledEnvironment;
}): Promise<{ body: ExecutionBody; item: ExecutionItem }> {
  const responsePromise = input.page.waitForResponse(
    (response) =>
      new URL(response.url()).origin === input.env.backendOrigin &&
      responsePath(response) === input.scenario.navigationPath &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
  await input.page.goto(
    `${input.env.frontendOrigin}${input.scenario.navigationPath}`,
    { waitUntil: 'domcontentloaded' },
  );
  const body = (await (await responsePromise).json()) as ExecutionBody;
  const item = body.itemResponses.find(
    (candidate) => candidate.itemCode === input.scenario.itemCode,
  );
  invariant(item && isObjectId(item.id), 'B18 U09 target item is missing');
  return { body, item };
}

async function showTarget(input: {
  page: Page;
  body: ExecutionBody;
  item: ExecutionItem;
  scenario: Scenario;
}): Promise<Locator> {
  const group = input.body.groups.find(
    (candidate) => candidate.code === input.scenario.groupCode,
  );
  invariant(group, 'B18 U09 target group is missing');
  const mediaPath = `${input.scenario.navigationPath}/item-responses/${input.item.id}/media-evidences`;
  const listResponse = input.page.waitForResponse(
    (response) =>
      responsePath(response) === mediaPath &&
      response.request().method() === 'GET',
  );
  await input.page
    .getByRole('navigation', { name: '量表分组导航' })
    .getByRole('button')
    .filter({ hasText: group.title })
    .click();
  expect((await listResponse).status()).toBe(200);
  const article = input.page
    .getByRole('article')
    .filter({ hasText: `题目编码：${input.scenario.itemCode}` });
  await expect(article).toBeVisible();
  await expect(
    article.getByRole('button', {
      name: '重新加载证据列表',
      exact: true,
    }),
  ).toBeEnabled();
  return article;
}

function installWriteMonitor(
  page: Page,
  targetPath: string,
  mediaPath: string,
) {
  const patches: CapturedPatch[] = [];
  const patchStatuses: number[] = [];
  let mediaPostCount = 0;
  let mediaResponseCount = 0;
  let mediaFailedCount = 0;
  const adjacentWrites: Array<{ method: string; path: string }> = [];
  const onRequest = (request: Request): void => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'PATCH' && path === targetPath) {
      const body = request.postDataJSON() as Record<string, unknown>;
      patches.push({
        keys: Object.keys(body).sort(),
        expectedRevision: body.expectedRevision,
        responseText: body.responseText,
        markAsAnswered: body.markAsAnswered,
      });
      return;
    }
    if (request.method() === 'POST' && path === mediaPath) {
      mediaPostCount += 1;
      return;
    }
    if (request.method() !== 'GET' && path !== '/auth/login') {
      adjacentWrites.push({ method: request.method(), path });
    }
  };
  const onResponse = (response: Response): void => {
    const request = response.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'PATCH' && path === targetPath) {
      patchStatuses.push(response.status());
    }
    if (request.method() === 'POST' && path === mediaPath) {
      mediaResponseCount += 1;
    }
  };
  const onFailed = (request: Request): void => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === mediaPath
    ) {
      mediaFailedCount += 1;
    }
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onFailed);
  return {
    patches,
    patchStatuses,
    adjacentWrites,
    mediaPostCount: () => mediaPostCount,
    mediaResponseCount: () => mediaResponseCount,
    mediaFailedCount: () => mediaFailedCount,
    dispose: () => {
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('requestfailed', onFailed);
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

function photoRequirement(item: ExecutionItem) {
  return item.evidenceRequirements.find(
    (requirement) => requirement.evidenceType === 'photo',
  );
}

test.describe('B18 U09 media upload failure preservation', () => {
  test.beforeEach(() => {
    test.skip(!environment.enabled, 'BROWSER_ACCEPTANCE_RUN_LIVE=1 is required');
    if (environment.enabled) assertDatabaseBoundaryIsClear();
  });

  test('media-upload-failure-preserve', async ({ roleContexts }) => {
    test.setTimeout(45_000);
    if (!environment.enabled) return;
    const descriptor = await readDescriptor();
    const scenario = descriptor.scenarios['media-upload-failure-preserve'];
    const password = requireSecret();
    const env: EnabledEnvironment = environment;
    const roleContext = await roleContexts.create('doctor', 'b18-u09-media', {
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
    expect(photoRequirement(opened.item)).toMatchObject({
      status: 'pending',
      attached: false,
    });
    const article = await showTarget({
      page,
      body: opened.body,
      item: opened.item,
      scenario,
    });
    const targetPath = `${scenario.navigationPath}/item-responses/${opened.item.id}`;
    const mediaPath = `${targetPath}/media-evidences`;
    const monitor = installWriteMonitor(page, targetPath, mediaPath);
    let aborter: B18ExactRequestAbort | null = null;
    try {
      const answer = article.locator('textarea[id$="-response-text"]');
      const photoCaptureHeading = article.getByRole('heading', {
        level: 5,
        name: '图片证据采集',
        exact: true,
      });
      await expect(photoCaptureHeading).toBeVisible();
      const photoCaptureSection = article
        .locator('section')
        .filter({
          has: page.getByRole('heading', {
            level: 5,
            name: '图片证据采集',
            exact: true,
          }),
        });
      await expect(photoCaptureSection).toHaveCount(1);
      const evidenceRequirements = article.getByRole('region', {
        name: '证据要求',
        exact: true,
      });
      const photoRequirementItem = evidenceRequirements
        .getByRole('listitem')
        .filter({
          has: evidenceRequirements.getByText('图片', { exact: true }),
        });
      await expect(photoRequirementItem).toHaveCount(1);

      await answer.fill(RETAINED_TEXT);
      await photoCaptureSection
        .getByLabel('选择已有图片', { exact: true })
        .setInputFiles({
          name: 'synthetic-photo.png',
          mimeType: 'image/png',
          buffer: VALID_PNG,
        });
      const preview = photoCaptureSection.getByAltText(
        '待上传图片证据预览',
        { exact: true },
      );
      const uploadButton = photoCaptureSection.getByRole('button', {
        name: '上传图片证据',
        exact: true,
      });
      await expect(preview).toBeVisible();
      await expect(answer).toHaveValue(RETAINED_TEXT);

      aborter = new B18ExactRequestAbort(
        page,
        `${env.backendOrigin}${mediaPath}`,
      );
      await aborter.install();
      await uploadButton.click();
      await aborter.waitForAbort();
      await expect(
        article.getByRole('alert').filter({
          hasText: '媒体证据服务暂时不可用，请稍后重试。',
        }),
      ).toBeVisible();
      await expect(answer).toHaveValue(RETAINED_TEXT);
      await expect(preview).toBeVisible();
      await expect(uploadButton).toBeEnabled();
      await expect(
        photoRequirementItem.getByText('待记录', { exact: true }),
      ).toBeVisible();
      await expect(
        photoRequirementItem.getByText('服务端标识：未关联', {
          exact: true,
        }),
      ).toBeVisible();

      await expect
        .poll(() => monitor.patchStatuses.length, { timeout: 5_000 })
        .toBe(1);
      await expect(article.getByText(/^已保存：/)).toBeVisible();
      await waitPastAutosaveDebounce(page);
      expect(monitor.patches).toEqual([
        {
          keys: ['expectedRevision', 'responseText'],
          expectedRevision: scenario.prepared.targetRevision,
          responseText: RETAINED_TEXT,
          markAsAnswered: undefined,
        },
      ]);
      expect(monitor.patchStatuses).toEqual([200]);
      expect(aborter.summary()).toEqual({
        matchedRequestCount: 1,
        abortedRequestCount: 1,
        continuedRequestCount: 0,
      });
      expect(monitor.mediaPostCount()).toBe(1);
      expect(monitor.mediaResponseCount()).toBe(0);
      expect(monitor.mediaFailedCount()).toBe(1);
      expect(monitor.adjacentWrites).toHaveLength(0);
      const abortSummary = await aborter.dispose();
      expect(abortSummary.abortedRequestCount).toBe(1);
      expect((await roleContexts.closeAll()).activeContextCount).toBe(0);
      console.log(
        `B18_U09_EVIDENCE ${safeJsonStringify(
          {
            uploadRequestCount: monitor.mediaPostCount(),
            uploadAbortCount: abortSummary.abortedRequestCount,
            browserBackendUploadResponseCount: monitor.mediaResponseCount(),
            patchCount: monitor.patches.length,
            patchRequestKeys: monitor.patches[0]?.keys,
            revisionDelta: 1,
            localTextRetained: true,
            localPhotoPreviewRetained: true,
            accessibleFailureFeedback: true,
            uploadRetryEnabled: true,
            photoRequirement: 'pending',
            adjacentWrites: 0,
            contextsClosed: true,
          },
          [
            password,
            session.cookieValue,
            RETAINED_TEXT,
            scenario.patientId,
            scenario.visitId,
            scenario.scaleInstanceId,
          ],
        )}`,
      );
    } finally {
      if (aborter) await aborter.dispose();
      monitor.dispose();
    }
  });
});
