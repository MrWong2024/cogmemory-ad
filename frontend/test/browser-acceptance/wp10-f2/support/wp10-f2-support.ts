import { readFile } from 'node:fs/promises';

import type { BrowserContext, Page, Response } from '@playwright/test';

import {
  assertDatabaseBoundaryIsClear,
  resolveLiveAcceptanceEnvironment,
} from '../../support/acceptance-env';
import { expect } from '../../support/acceptance-test';
import { NetworkLedger } from '../../support/network-ledger';
import type {
  RoleContext,
  RoleContextFactory,
} from '../../support/role-context-factory';
import { ConsoleAudit } from '../../support/runtime-audit';

export type Profile = 'full' | 'recovery';

export type Descriptor = {
  schemaVersion: 1;
  batch: 'WP10-F2';
  profile: Profile;
  namespace: string;
  accounts: { staff: { loginIdentifier: string } };
  scenario: {
    patientId: string;
    visitId: string;
    scaleInstanceId: string;
    navigationPath: string;
    itemCount: number;
    itemBaselineHash: string;
    scaleInstanceBaselineHash: string;
  };
};

export type EnabledEnvironment = Extract<
  ReturnType<typeof resolveLiveAcceptanceEnvironment>,
  { enabled: true }
>;

export type StaffSession = {
  roleContext: RoleContext;
  ledger: NetworkLedger;
  consoleAudit: ConsoleAudit;
};

export type AllowedHttpFailure = {
  method: string;
  status: number;
  safeUrlPattern: string;
};

export type F2BrowserAuditSummary = {
  allowedHttpFailures: number;
  ignoredCanceledGets: number;
  unexpectedConsoleErrors: 0;
  pageErrors: 0;
  unexpectedHttpFailures: 0;
  unexpectedTransportFailures: 0;
};

export const AUTH_ME_PATTERN = '/auth/me';
export const STAFF_ROOT_PATTERN =
  '/patients/<id>/visits/<id>/scale-instances/<id>/patient-administration';
export const PREPARATION_PATTERN = `${STAFF_ROOT_PATTERN}/preparation/confirm`;
export const PAUSE_PATTERN = `${STAFF_ROOT_PATTERN}/pause`;
export const RESUME_PATTERN = `${STAFF_ROOT_PATTERN}/resume`;
export const TERMINATE_PATTERN = `${STAFF_ROOT_PATTERN}/terminate`;
export const STAFF_COMPLETE_PATTERN = `${STAFF_ROOT_PATTERN}/current/complete`;
export const TAKEOVER_PATTERN = `${STAFF_ROOT_PATTERN}/current/takeover`;
export const REDO_PATTERN = `${STAFF_ROOT_PATTERN}/redo-last`;
export const REPLAY_PATTERN = `${STAFF_ROOT_PATTERN}/current/audio/<id>/replay-authorize`;
export const ENTER_PATTERN = '/patient-administration/enter';
export const CURRENT_PATTERN = '/patient-administration/current';
export const AUDIO_PATTERN = '/patient-administration/current/audio/<id>/play';
export const IMAGE_PATTERN = '/patient-administration/current/assets/<id>';
export const EVIDENCE_PATTERN = '/patient-administration/current/evidence';
export const PATIENT_COMPLETE_PATTERN =
  '/patient-administration/current/complete';

export function invariant(
  condition: unknown,
  safeMessage: string,
): asserts condition {
  if (!condition) throw new Error(safeMessage);
}

export function resolveF2Environment(): EnabledEnvironment | null {
  assertDatabaseBoundaryIsClear();
  const environment = resolveLiveAcceptanceEnvironment();
  return environment.enabled ? environment : null;
}

export function requireF2Secret(): string {
  const value = process.env.WP10_F2_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error('WP10_F2_LOGIN_SECRET is required');
  }
  return value;
}

export async function readF2Descriptor(
  expectedProfile: Profile,
): Promise<Descriptor> {
  const runtimePath = process.env.WP10_F2_RUNTIME_PATH;
  if (!runtimePath) throw new Error('WP10_F2_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(runtimePath, 'utf8')) as unknown;
  invariant(value && typeof value === 'object', 'WP-10 F2 descriptor is invalid');
  const descriptor = value as Partial<Descriptor>;
  const scenario = descriptor.scenario;
  invariant(
    descriptor.schemaVersion === 1 &&
      descriptor.batch === 'WP10-F2' &&
      descriptor.profile === expectedProfile &&
      typeof descriptor.namespace === 'string' &&
      /^[a-z0-9][a-z0-9-]{2,19}$/.test(descriptor.namespace) &&
      typeof descriptor.accounts?.staff.loginIdentifier === 'string' &&
      scenario &&
      /^[a-f\d]{24}$/i.test(scenario.patientId) &&
      /^[a-f\d]{24}$/i.test(scenario.visitId) &&
      /^[a-f\d]{24}$/i.test(scenario.scaleInstanceId) &&
      scenario.navigationPath ===
        `/patients/${scenario.patientId}/visits/${scenario.visitId}/scale-instances/${scenario.scaleInstanceId}` &&
      scenario.itemCount > 0 &&
      /^[a-f\d]{64}$/i.test(scenario.itemBaselineHash) &&
      /^[a-f\d]{64}$/i.test(scenario.scaleInstanceBaselineHash),
    'WP-10 F2 descriptor contract is invalid',
  );
  return descriptor as Descriptor;
}

export async function loginF2Staff(input: {
  factory: RoleContextFactory;
  descriptor: Descriptor;
  password: string;
  environment: EnabledEnvironment;
}): Promise<StaffSession> {
  const roleContext = await input.factory.create(
    'doctor',
    `wp10-f2-${input.descriptor.profile}-staff`,
    { viewport: { width: 1280, height: 800 } },
  );
  const { page } = roleContext;
  const ledger = new NetworkLedger();
  await ledger.attach(page);
  const consoleAudit = new ConsoleAudit(page);
  consoleAudit.start();
  await page.goto(`${input.environment.frontendOrigin}/login`, {
    waitUntil: 'domcontentloaded',
  });

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
  await page
    .getByLabel('账号')
    .fill(input.descriptor.accounts.staff.loginIdentifier);
  await page.getByLabel('密码').fill(input.password);
  await page.getByRole('button', { name: '登录系统', exact: true }).click();
  const [loginResponse, meResponse] = await Promise.all([
    loginResponsePromise,
    meResponsePromise,
  ]);
  expect(loginResponse.status()).toBe(201);
  const meBody = (await meResponse.json()) as {
    authenticated?: unknown;
    user?: { roles?: unknown };
  };
  invariant(
    meBody.authenticated === true &&
      Array.isArray(meBody.user?.roles) &&
      meBody.user.roles.includes('doctor'),
    'WP-10 F2 staff login did not establish the expected identity',
  );
  await expect(page).toHaveURL(`${input.environment.frontendOrigin}/dashboard`);
  return { roleContext, ledger, consoleAudit };
}

function responsePath(response: Response): string {
  return new URL(response.url()).pathname;
}

export async function openF2Execution(input: {
  page: Page;
  descriptor: Descriptor;
  environment: EnabledEnvironment;
}): Promise<void> {
  const executionResponsePromise = input.page.waitForResponse(
    (response) =>
      new URL(response.url()).origin === input.environment.backendOrigin &&
      responsePath(response) === input.descriptor.scenario.navigationPath &&
      response.request().method() === 'GET',
  );
  await input.page.goto(
    `${input.environment.frontendOrigin}${input.descriptor.scenario.navigationPath}`,
    { waitUntil: 'domcontentloaded' },
  );
  expect((await executionResponsePromise).status()).toBe(200);
  await expect(
    input.page.getByTestId('patient-administration-staff-panel'),
  ).toBeVisible();
  await expect(input.page.getByText('MMSE 患者施测', { exact: true })).toBeVisible();
  await expect(
    input.page.getByRole('button', { name: '创建患者施测会话', exact: true }),
  ).toBeVisible();
}

export async function installSyntheticMicrophone(
  context: BrowserContext,
): Promise<void> {
  await context.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices) return;
    mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      if (!constraints?.audio) {
        throw new DOMException('Only the synthetic audio source is available', 'NotFoundError');
      }
      const AudioContextConstructor =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextConstructor) {
        throw new DOMException('AudioContext is unavailable', 'NotSupportedError');
      }
      const audioContext = new AudioContextConstructor();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const destination = audioContext.createMediaStreamDestination();
      oscillator.frequency.value = 440;
      gain.gain.value = 0.03;
      oscillator.connect(gain);
      gain.connect(destination);
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
        } catch {
          void audioContext.close();
          throw new DOMException('AudioContext could not resume', 'NotAllowedError');
        }
      }
      oscillator.start();
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        try {
          oscillator.stop();
        } catch {
          // The source is already stopped.
        }
        void audioContext.close();
      };
      for (const track of destination.stream.getTracks()) {
        const nativeStop = track.stop.bind(track);
        track.stop = () => {
          nativeStop();
          release();
        };
      }
      return destination.stream;
    };
  });
}

export async function completeSyntheticPreparation(page: Page): Promise<void> {
  const screen = page.getByRole('checkbox', {
    name: '屏幕显示与方向已确认',
  });
  const input = page.getByRole('checkbox', {
    name: '触摸、鼠标等基本操作可用',
  });
  const sound = page.getByRole('checkbox', {
    name: '本地测试音已检查',
  });
  const microphone = page.getByRole('checkbox', {
    name: '麦克风录音已验证可用',
  });
  await screen.check();
  await input.check();
  await page
    .getByRole('button', { name: '播放本地测试音', exact: true })
    .click();
  await expect(sound).toBeChecked();
  await page
    .getByRole('button', { name: '开始本地录音检查', exact: true })
    .click();
  const stop = page.getByRole('button', { name: '停止录音', exact: true });
  await expect(stop).toBeVisible();
  await page.waitForTimeout(250);
  await stop.click();
  await expect(microphone).toBeChecked();
  await expect(screen).toBeChecked();
  await expect(input).toBeChecked();
  await expect(sound).toBeChecked();
}

export async function createF2PatientContext(input: {
  context: BrowserContext;
  page: Page;
}): Promise<{
  ledger: NetworkLedger;
  consoleAudit: ConsoleAudit;
}> {
  const ledger = new NetworkLedger();
  await ledger.attach(input.page);
  const consoleAudit = new ConsoleAudit(input.page);
  consoleAudit.start();
  return { ledger, consoleAudit };
}

export async function enterPatientDevice(input: {
  page: Page;
  code: string;
  environment: EnabledEnvironment;
}): Promise<void> {
  await input.page.goto(
    `${input.environment.frontendOrigin}/patient-administration/enter`,
    { waitUntil: 'domcontentloaded' },
  );
  await input.page.getByLabel('六位数字进入码').fill(input.code);
  const responsePromise = input.page.waitForResponse(
    (response) =>
      responsePath(response) === '/patient-administration/enter' &&
      response.request().method() === 'POST',
  );
  await input.page.getByRole('button', { name: '进入患者施测' }).click();
  expect((await responsePromise).status()).toBe(200);
  await expect(input.page).toHaveURL(
    `${input.environment.frontendOrigin}/patient-administration`,
  );
}

export async function waitForStep(page: Page, order: number): Promise<void> {
  await expect(page.getByText(`第 ${order} / 19 步`, { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

export async function allowAutoplayIfNeeded(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const button = page.getByRole('button', { name: '播放题目语音', exact: true });
    if (await button.isVisible().catch(() => false)) await button.click();
    const busyStatus = page.getByText(
      /正在准备本题内容|正在读取本题图形|正在播放本题指导语|正在播放本题测量语音/,
    );
    if (
      !(await button.isVisible().catch(() => false)) &&
      !(await busyStatus.isVisible().catch(() => false))
    ) {
      return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error('Patient audio remained blocked by autoplay policy');
}

function safeEvidenceResponseCode(responseBody: unknown): string {
  if (
    typeof responseBody !== 'object' ||
    responseBody === null ||
    !('code' in responseBody) ||
    typeof responseBody.code !== 'string' ||
    !/^[A-Za-z0-9_.-]{1,80}$/.test(responseBody.code)
  ) {
    return 'unknown';
  }
  return responseBody.code;
}

export async function expectEvidenceUpload(
  page: Page,
  trigger: () => Promise<void>,
): Promise<Response> {
  const responsePromise = page.waitForResponse(
    (response) =>
      responsePath(response) === '/patient-administration/current/evidence' &&
      response.request().method() === 'POST',
  );
  await trigger();
  const response = await responsePromise;
  if (response.status() !== 201) {
    const responseBody: unknown = await response.json().catch(() => null);
    throw new Error(
      `F2 evidence upload failed: status=${response.status()} code=${safeEvidenceResponseCode(responseBody)}`,
    );
  }
  return response;
}

export async function recordAndSaveSpeech(page: Page): Promise<void> {
  const start = page.getByRole('button', { name: '开始录音', exact: true });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const autoplay = page.getByRole('button', {
      name: '播放题目语音',
      exact: true,
    });
    if (await autoplay.isVisible().catch(() => false)) await autoplay.click();
    if (await start.isEnabled().catch(() => false)) break;
    await page.waitForTimeout(100);
  }
  await expect(start).toBeEnabled({ timeout: 20_000 });
  await start.click();
  await expect(page.getByText('正在录音', { exact: true })).toBeVisible();
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: '结束录音', exact: true }).click();
  await expect(page.getByLabel('试听本题回答')).toBeVisible();
  await expectEvidenceUpload(page, () =>
    page.getByRole('button', { name: '保存本题回答', exact: true }).click(),
  );
  await expect(page.getByText('回答已保存', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

export async function completePatientStep(page: Page): Promise<void> {
  const responsePromise = page.waitForResponse(
    (response) =>
      responsePath(response) === '/patient-administration/current/complete' &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '完成本题并继续', exact: true }).click();
  expect((await responsePromise).status()).toBe(200);
}

export async function refreshStaff(page: Page): Promise<void> {
  const responsePromise = page.waitForResponse(
    (response) =>
      responsePath(response).endsWith('/patient-administration') &&
      response.request().method() === 'GET',
  );
  await page.getByRole('button', { name: '手动刷新', exact: true }).click();
  expect((await responsePromise).status()).toBe(200);
  await expect(page.getByRole('button', { name: '手动刷新', exact: true })).toBeEnabled();
}

export function waitForPost(page: Page, suffix: string) {
  return page.waitForResponse(
    (response) =>
      responsePath(response).endsWith(suffix) &&
      response.request().method() === 'POST',
  );
}

export function safeTestPng() {
  return {
    name: 'private-local-source-name.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z8DAwMDAxMDAwMAAAAwAAf9Z3V8AAAAASUVORK5CYII=',
      'base64',
    ),
  };
}

function httpFailureKey(input: {
  method: string;
  status: number;
  safeUrlPattern: string;
}): string {
  return `${input.method.toUpperCase()}\u0000${input.status}\u0000${input.safeUrlPattern}`;
}

export function assertF2BrowserAudit(input: {
  consoleAudit: ConsoleAudit;
  ledger: NetworkLedger;
  allowedHttpFailures: AllowedHttpFailure[];
}): F2BrowserAuditSummary {
  const entries = input.ledger.entries();
  const allowedFailureKeys = new Set<string>();

  for (const allowedFailure of input.allowedHttpFailures) {
    if (
      allowedFailure.status < 400 ||
      allowedFailure.status >= 500 ||
      !Number.isSafeInteger(allowedFailure.status) ||
      !allowedFailure.safeUrlPattern.startsWith('/')
    ) {
      throw new Error('WP-10 F2 browser audit allow entry is invalid');
    }
    allowedFailureKeys.add(httpFailureKey(allowedFailure));
  }

  let ignoredCanceledGets = 0;
  for (const entry of entries) {
    if (entry.status !== null && entry.status >= 500) {
      throw new Error('WP-10 F2 browser audit detected an HTTP 5xx response');
    }
    if (
      entry.status !== null &&
      entry.status >= 400 &&
      !allowedFailureKeys.has(
        httpFailureKey({
          method: entry.method,
          status: entry.status,
          safeUrlPattern: entry.safeUrlPattern,
        }),
      )
    ) {
      throw new Error(
        'WP-10 F2 browser audit detected an unexpected HTTP 4xx response',
      );
    }

    if (entry.failureReason === null) continue;
    if (entry.method === 'GET') {
      if (entry.failureReason === 'aborted') {
        ignoredCanceledGets += 1;
        continue;
      }
      throw new Error(
        'WP-10 F2 browser audit detected a GET timeout or transport failure',
      );
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(entry.method)) {
      throw new Error(
        'WP-10 F2 browser audit detected a mutation transport failure',
      );
    }
    throw new Error(
      'WP-10 F2 browser audit detected another transport failure',
    );
  }

  for (const event of input.consoleAudit.events()) {
    if (event.kind === 'page_error') {
      throw new Error('WP-10 F2 browser audit detected a page error');
    }
    if (event.category !== 'network') {
      throw new Error(
        'WP-10 F2 browser audit detected an unexpected Console error',
      );
    }

    if (event.httpStatus !== null) {
      const responseObserved = input.allowedHttpFailures.some(
        (allowedFailure) =>
          allowedFailure.status === event.httpStatus &&
          allowedFailure.safeUrlPattern === event.safeUrlPattern &&
          entries.some(
            (entry) =>
              entry.method === allowedFailure.method.toUpperCase() &&
              entry.status === allowedFailure.status &&
              entry.safeUrlPattern === allowedFailure.safeUrlPattern,
          ),
      );
      if (!responseObserved) {
        throw new Error(
          'WP-10 F2 browser audit detected an unexplained HTTP Console error',
        );
      }
      continue;
    }

    const canceledGetObserved =
      event.safeUrlPattern !== null &&
      entries.some(
        (entry) =>
          entry.method === 'GET' &&
          entry.failureReason === 'aborted' &&
          entry.safeUrlPattern === event.safeUrlPattern,
      );
    if (!canceledGetObserved) {
      throw new Error(
        'WP-10 F2 browser audit detected an unexplained network Console error',
      );
    }
  }

  return {
    allowedHttpFailures: allowedFailureKeys.size,
    ignoredCanceledGets,
    unexpectedConsoleErrors: 0,
    pageErrors: 0,
    unexpectedHttpFailures: 0,
    unexpectedTransportFailures: 0,
  };
}

export function assertNoF3Requests(ledgers: NetworkLedger[]): void {
  const forbidden = ledgers
    .flatMap((ledger) => ledger.entries())
    .filter(({ safeUrlPattern }) =>
      /\/review|transcrib|\/item-responses\/|\/submit$|\/score-results|\/cognitive-domain|\/reports/.test(
        safeUrlPattern,
      ),
    );
  if (forbidden.length !== 0) {
    throw new Error('WP-10 F2 network ledger detected an F3 or downstream request');
  }
}

export function assertExactBodyKeys(
  ledger: NetworkLedger,
  safeUrlPattern: string,
  expected: string[],
): void {
  const matching = ledger
    .entries()
    .filter(
      (entry) =>
        entry.method === 'POST' && entry.safeUrlPattern === safeUrlPattern,
    );
  for (const entry of matching) {
    expect(entry.bodyKeys).toEqual([...expected].sort());
  }
}
