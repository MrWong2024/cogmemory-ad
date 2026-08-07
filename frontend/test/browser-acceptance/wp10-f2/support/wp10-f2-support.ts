import { readFile } from 'node:fs/promises';

import type { BrowserContext, Page, Response } from '@playwright/test';

import { expect } from '../../support/acceptance-test';
import type { NetworkLedger } from '../../support/network-ledger';
import type { ConsoleAudit } from '../../support/runtime-audit';
import type { RoleContextFactory } from '../../support/role-context-factory';
import {
  assertF1BrowserAudit,
  createPatientContext,
  invariant,
  loginStaff,
  resolveEnvironment,
  type EnabledEnvironment,
  type F1ExpectedHttpFailure,
  type StaffSession,
} from '../../wp10-f1/support/wp10-f1-support';

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

export const AUTH_ME_PATTERN = '/auth/me';
export const STAFF_ROOT_PATTERN =
  '/patients/<id>/visits/<id>/scale-instances/<id>/<id>';
export const PREPARATION_PATTERN = `${STAFF_ROOT_PATTERN}/preparation/confirm`;
export const PAUSE_PATTERN = `${STAFF_ROOT_PATTERN}/pause`;
export const RESUME_PATTERN = `${STAFF_ROOT_PATTERN}/resume`;
export const TERMINATE_PATTERN = `${STAFF_ROOT_PATTERN}/terminate`;
export const STAFF_COMPLETE_PATTERN = `${STAFF_ROOT_PATTERN}/current/complete`;
export const TAKEOVER_PATTERN = `${STAFF_ROOT_PATTERN}/current/takeover`;
export const REDO_PATTERN = `${STAFF_ROOT_PATTERN}/redo-last`;
export const REPLAY_PATTERN = `${STAFF_ROOT_PATTERN}/current/audio/<id>/replay-authorize`;
export const ENTER_PATTERN = '/<id>/enter';
export const CURRENT_PATTERN = '/<id>/current';
export const AUDIO_PATTERN = '/<id>/current/audio/<id>/play';
export const IMAGE_PATTERN = '/<id>/current/assets/<id>';
export const EVIDENCE_PATTERN = '/<id>/current/evidence';
export const PATIENT_COMPLETE_PATTERN = '/<id>/current/complete';

export function resolveF2Environment(): EnabledEnvironment | null {
  return resolveEnvironment();
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
  return loginStaff({
    factory: input.factory,
    account: input.descriptor.accounts.staff.loginIdentifier,
    password: input.password,
    environment: input.environment,
    viewport: { width: 1280, height: 800 },
  });
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
  await page.getByRole('checkbox', { name: '屏幕内容可见，横竖屏方向合适' }).check();
  await page.getByRole('checkbox', { name: '触摸、鼠标或手写输入可用' }).check();
  await page.getByRole('checkbox', { name: '确认使用中文施测' }).check();
  await page.getByRole('checkbox', { name: '已明确这是不计分练习' }).check();
  await page.getByRole('button', { name: '播放本地测试音' }).click();
  await expect(page.getByText('本地短测试音已播放，请确认音量舒适。')).toBeVisible();
  await page.getByRole('button', { name: '开始本地录音检查' }).click();
  await expect(page.getByRole('button', { name: '停止录音' })).toBeVisible();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: '停止录音' }).click();
  await expect(page.getByText('本地录音已完成，可在本设备回放检查。')).toBeVisible();
  const canvas = page.getByLabel('不计分触摸和书写练习画布');
  const bounds = await canvas.boundingBox();
  invariant(bounds, 'Preparation canvas bounds are unavailable');
  await page.mouse.move(bounds.x + 20, bounds.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 110, bounds.y + 90, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText('七项本地准备已完成')).toBeVisible();
}

export async function createF2PatientContext(input: {
  context: BrowserContext;
  page: Page;
}) {
  return createPatientContext(input);
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
  await page.getByRole('button', { name: '保存本题回答', exact: true }).click();
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

export function assertF2BrowserAudit(input: {
  consoleAudit: ConsoleAudit;
  ledger: NetworkLedger;
  expectedHttpFailures: F1ExpectedHttpFailure[];
}) {
  return assertF1BrowserAudit(input);
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

export { invariant };
