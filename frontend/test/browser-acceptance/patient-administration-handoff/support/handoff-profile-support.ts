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
import {
  ConsoleAudit,
  auditRuntimeStorage,
} from '../../support/runtime-audit';

export type Profile = 'same-device' | 'cross-device';

export type Descriptor = {
  schemaVersion: 1;
  batch: 'patient-administration-handoff';
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
    scaleInstanceProtectedBaselineHash: string;
  };
};

export type EnabledEnvironment = Extract<
  ReturnType<typeof resolveLiveAcceptanceEnvironment>,
  { enabled: true }
>;

export type BrowserAudit = {
  ledger: NetworkLedger;
  consoleAudit: ConsoleAudit;
};

export type StaffSession = BrowserAudit & {
  roleContext: RoleContext;
};

export const SYNTHETIC_PASSWORD = '12345678';
export const STAFF_SESSION_COOKIE = 'cogmemory_ad_session';
export const PATIENT_SESSION_COOKIE = 'cogmemory_ad_patient_session';

export function invariant(
  condition: unknown,
  safeMessage: string,
): asserts condition {
  if (!condition) throw new Error(safeMessage);
}

export function resolveHandoffEnvironment(): EnabledEnvironment | null {
  assertDatabaseBoundaryIsClear();
  const environment = resolveLiveAcceptanceEnvironment();
  return environment.enabled ? environment : null;
}

export async function readHandoffDescriptor(
  expectedProfile: Profile,
): Promise<Descriptor> {
  const runtimePath = process.env.PATIENT_ADMIN_HANDOFF_RUNTIME_PATH;
  if (!runtimePath) {
    throw new Error('PATIENT_ADMIN_HANDOFF_RUNTIME_PATH is required');
  }
  const value = JSON.parse(await readFile(runtimePath, 'utf8')) as unknown;
  invariant(value && typeof value === 'object', 'Handoff descriptor is invalid');
  const descriptor = value as Partial<Descriptor>;
  const scenario = descriptor.scenario;
  invariant(
    descriptor.schemaVersion === 1 &&
      descriptor.batch === 'patient-administration-handoff' &&
      descriptor.profile === expectedProfile &&
      typeof descriptor.namespace === 'string' &&
      /^[a-z0-9][a-z0-9-]{2,23}$/.test(descriptor.namespace) &&
      typeof descriptor.accounts?.staff.loginIdentifier === 'string' &&
      scenario &&
      /^[a-f\d]{24}$/i.test(scenario.patientId) &&
      /^[a-f\d]{24}$/i.test(scenario.visitId) &&
      /^[a-f\d]{24}$/i.test(scenario.scaleInstanceId) &&
      scenario.navigationPath ===
        `/patients/${scenario.patientId}/visits/${scenario.visitId}/scale-instances/${scenario.scaleInstanceId}` &&
      scenario.itemCount > 0 &&
      /^[a-f\d]{64}$/i.test(scenario.itemBaselineHash) &&
      /^[a-f\d]{64}$/i.test(
        scenario.scaleInstanceProtectedBaselineHash,
      ),
    'Handoff descriptor contract is invalid',
  );
  return descriptor as Descriptor;
}

function responsePath(response: Response): string {
  return new URL(response.url()).pathname;
}

export function staffAdministrationPath(descriptor: Descriptor): string {
  return `${descriptor.scenario.navigationPath}/patient-administration`;
}

export function waitForPost(page: Page, suffix: string): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      responsePath(response).endsWith(suffix) &&
      response.request().method() === 'POST',
  );
}

export async function installSyntheticMicrophone(
  context: BrowserContext,
): Promise<void> {
  await context.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices) return;
    mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      if (!constraints?.audio) {
        throw new DOMException(
          'Only the synthetic audio source is available',
          'NotFoundError',
        );
      }
      const AudioContextConstructor =
        window.AudioContext ??
        (window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;
      if (!AudioContextConstructor) {
        throw new DOMException(
          'AudioContext is unavailable',
          'NotSupportedError',
        );
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
          throw new DOMException(
            'AudioContext could not resume',
            'NotAllowedError',
          );
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
          // The synthetic source is already stopped.
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

export async function attachBrowserAudit(page: Page): Promise<BrowserAudit> {
  const ledger = new NetworkLedger();
  await ledger.attach(page);
  const consoleAudit = new ConsoleAudit(page);
  consoleAudit.start();
  return { ledger, consoleAudit };
}

export async function loginStaff(input: {
  factory: RoleContextFactory;
  descriptor: Descriptor;
  environment: EnabledEnvironment;
  syntheticMicrophone?: boolean;
}): Promise<StaffSession> {
  const roleContext = await input.factory.create(
    'doctor',
    `${input.descriptor.profile}-staff`,
    { viewport: { width: 1280, height: 800 } },
  );
  const { context, page } = roleContext;
  if (input.syntheticMicrophone) await installSyntheticMicrophone(context);
  const audit = await attachBrowserAudit(page);
  await page.goto(`${input.environment.frontendOrigin}/login`, {
    waitUntil: 'domcontentloaded',
  });
  const healthResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${input.environment.backendOrigin}/health` &&
      response.request().method() === 'GET',
  );
  const healthStatus = await page.evaluate(async (backendOrigin) => {
    const response = await fetch(`${backendOrigin}/health`, {
      cache: 'no-store',
      credentials: 'include',
    });
    return response.status;
  }, input.environment.backendOrigin);
  const healthResponse = await healthResponsePromise;
  expect(healthStatus).toBe(200);
  expect(healthResponse.headers()['access-control-allow-origin']).toBe(
    input.environment.frontendOrigin,
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
  await page
    .getByLabel('账号')
    .fill(input.descriptor.accounts.staff.loginIdentifier);
  await page.getByLabel('密码').fill(SYNTHETIC_PASSWORD);
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
    'Formal staff login did not establish the expected identity',
  );
  await expect(page).toHaveURL(`${input.environment.frontendOrigin}/dashboard`);
  await assertCookieMetadata(context, [STAFF_SESSION_COOKIE]);
  return { roleContext, ...audit };
}

export async function openExecution(input: {
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
  await expect(
    input.page.getByRole('button', {
      name: '创建患者施测会话',
      exact: true,
    }),
  ).toBeVisible();
}

export async function completeRequiredPreparation(page: Page): Promise<void> {
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
}

export async function assertCookieMetadata(
  context: BrowserContext,
  expectedNames: string[],
): Promise<void> {
  const metadata = (await context.cookies())
    .map(({ name, domain, httpOnly, secure, sameSite, path }) => ({
      name,
      domain,
      httpOnly,
      secure,
      sameSite,
      path,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const expected = expectedNames
    .map((name) => ({
      name,
      domain: 'localhost',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax' as const,
      path: name === PATIENT_SESSION_COOKIE ? '/patient-administration' : '/',
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  expect(metadata).toEqual(expected);
}

export async function assertClientCredentialBoundary(input: {
  page: Page;
  forbiddenValues?: string[];
  forbidBodyValues?: boolean;
}): Promise<void> {
  const storage = await auditRuntimeStorage(input.page);
  invariant(
    !storage.forbiddenValueDetected &&
      storage.documentCookieEmpty &&
      !storage.documentCookieForbiddenPatternDetected &&
      !storage.urlHasSensitiveQueryOrHash &&
      storage.indexedDbNames.length === 0,
    'Client credential storage boundary is invalid',
  );
  const boundary = await input.page.evaluate(
    async ({ forbidden, forbidBody }) => {
      const localValues = Object.keys(localStorage).map(
        (key) => localStorage.getItem(key) ?? '',
      );
      const sessionValues = Object.keys(sessionStorage).map(
        (key) => sessionStorage.getItem(key) ?? '',
      );
      const urlValue = `${window.location.search}${window.location.hash}`;
      const bodyValue = forbidBody ? document.body.innerText : '';
      const cacheNames =
        typeof caches === 'undefined' ? [] : await caches.keys();
      return {
        forbiddenValueDetected: forbidden.some((value) =>
          [...localValues, ...sessionValues, urlValue, bodyValue].some(
            (candidate) => candidate.includes(value),
          ),
        ),
        cacheCount: cacheNames.length,
      };
    },
    {
      forbidden: input.forbiddenValues ?? [],
      forbidBody: input.forbidBodyValues ?? false,
    },
  );
  invariant(
    !boundary.forbiddenValueDetected && boundary.cacheCount === 0,
    'A transient credential escaped the allowed in-memory boundary',
  );
}

export function assertNoFormalAnswerRequests(ledgers: NetworkLedger[]): void {
  const forbidden = ledgers
    .flatMap((ledger) => ledger.entries())
    .filter(
      ({ method, safeUrlPattern }) =>
        method !== 'GET' &&
        /item-responses|\/submit$|\/current\/(?:complete|evidence)|transcrib|\/adopt$|revoke-adoption/i.test(
          safeUrlPattern,
        ),
    );
  invariant(
    forbidden.length === 0,
    'Browser profile attempted a formal answer or downstream mutation',
  );
}

export function assertBrowserAudit(
  audits: BrowserAudit[],
  allowedFailures: Array<{
    method: string;
    status: number;
    safeUrlPattern: string;
  }> = [],
): void {
  const allow = new Set(
    allowedFailures.map(
      ({ method, status, safeUrlPattern }) =>
        `${method.toUpperCase()}\u0000${status}\u0000${safeUrlPattern}`,
    ),
  );
  for (const { ledger, consoleAudit } of audits) {
    for (const entry of ledger.entries()) {
      if (entry.status !== null && entry.status >= 500) {
        throw new Error('Browser audit detected an HTTP 5xx response');
      }
      if (
        entry.status !== null &&
        entry.status >= 400 &&
        !allow.has(
          `${entry.method}\u0000${entry.status}\u0000${entry.safeUrlPattern}`,
        )
      ) {
        throw new Error('Browser audit detected an unexpected HTTP 4xx response');
      }
      if (
        entry.failureReason !== null &&
        !(entry.method === 'GET' && entry.failureReason === 'aborted')
      ) {
        throw new Error('Browser audit detected a transport failure');
      }
    }
    const events = consoleAudit.events();
    invariant(
      events.every(
        (event) =>
          event.kind === 'console_error' &&
          event.httpStatus !== null &&
          event.safeUrlPattern !== null &&
          allow.has(
            `GET\u0000${event.httpStatus}\u0000${event.safeUrlPattern}`,
          ),
      ),
      'Browser audit detected an unexpected console or page error',
    );
  }
}

export async function detachBrowserAudit(audit: BrowserAudit): Promise<void> {
  audit.consoleAudit.stop();
  await audit.ledger.detach();
}
