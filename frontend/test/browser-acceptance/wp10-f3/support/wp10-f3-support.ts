import { readFile } from 'node:fs/promises';

import type { Page, Response } from '@playwright/test';

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

export type Descriptor = {
  schemaVersion: 2;
  batch: 'WP10-F3';
  namespace: string;
  accounts: { staff: { loginIdentifier: string } };
  scenario: {
    patientId: string;
    visitId: string;
    scaleInstanceId: string;
    navigationPath: string;
    itemCount: number;
    stepCount: number;
    readingItemResponseId: string;
    adoptionItemResponseId: string;
    audioEvidenceId: string;
    adoptionEvidenceId: string;
    adoptionAnswerBaselineHash: string;
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

export type F3BrowserAuditSummary = {
  allowedHttpFailures: number;
  ignoredCanceledGets: number;
  unexpectedConsoleErrors: 0;
  pageErrors: 0;
  unexpectedHttpFailures: 0;
  unexpectedTransportFailures: 0;
};

export const AUTH_ME_PATTERN = '/auth/me';
export const EXECUTION_PATTERN =
  '/patients/<id>/visits/<id>/scale-instances/<id>';
export const REVIEW_PATTERN = `${EXECUTION_PATTERN}/patient-administration/review`;
export const TRANSCRIBE_PATTERN = `${EXECUTION_PATTERN}/item-responses/<id>/media-evidences/<id>/transcribe`;
export const ACCESS_PATTERN = `${EXECUTION_PATTERN}/item-responses/<id>/media-evidences/<id>/access-url`;
export const ADOPT_PATTERN = `${EXECUTION_PATTERN}/item-responses/<id>/media-evidences/<id>/adopt`;
export const A14_PATTERN = `${EXECUTION_PATTERN}/item-responses/<id>`;
export const READINESS_PATTERN = `${EXECUTION_PATTERN}/submission-readiness`;
export const SUBMIT_PATTERN = `${EXECUTION_PATTERN}/submit`;
export const SCORE_RESULT_PATTERN = `${EXECUTION_PATTERN}/score-results/latest`;

export function invariant(
  condition: unknown,
  safeMessage: string,
): asserts condition {
  if (!condition) throw new Error(safeMessage);
}

export function resolveF3Environment(): EnabledEnvironment | null {
  assertDatabaseBoundaryIsClear();
  const environment = resolveLiveAcceptanceEnvironment();
  return environment.enabled ? environment : null;
}

export function requireF3Secret(): string {
  const value = process.env.WP10_F3_LOGIN_SECRET;
  if (!value || value.length < 16) {
    throw new Error('WP10_F3_LOGIN_SECRET is required');
  }
  return value;
}

export async function readF3Descriptor(): Promise<Descriptor> {
  const runtimePath = process.env.WP10_F3_RUNTIME_PATH;
  if (!runtimePath) throw new Error('WP10_F3_RUNTIME_PATH is required');
  const value = JSON.parse(await readFile(runtimePath, 'utf8')) as unknown;
  invariant(value && typeof value === 'object', 'WP-10 F3 descriptor is invalid');
  const descriptor = value as Partial<Descriptor>;
  const scenario = descriptor.scenario;
  const ids = scenario
    ? [
        scenario.patientId,
        scenario.visitId,
        scenario.scaleInstanceId,
        scenario.readingItemResponseId,
        scenario.adoptionItemResponseId,
        scenario.audioEvidenceId,
        scenario.adoptionEvidenceId,
      ]
    : [];
  invariant(
    descriptor.schemaVersion === 2 &&
      descriptor.batch === 'WP10-F3' &&
      typeof descriptor.namespace === 'string' &&
      /^[a-z0-9][a-z0-9-]{2,19}$/.test(descriptor.namespace) &&
      typeof descriptor.accounts?.staff.loginIdentifier === 'string' &&
      scenario &&
      ids.length === 7 &&
      ids.every((entry) => /^[a-f\d]{24}$/i.test(entry)) &&
      scenario.navigationPath ===
        `/patients/${scenario.patientId}/visits/${scenario.visitId}/scale-instances/${scenario.scaleInstanceId}` &&
      Number.isSafeInteger(scenario.itemCount) &&
      scenario.itemCount > 0 &&
      Number.isSafeInteger(scenario.stepCount) &&
      scenario.stepCount > 0 &&
      /^[a-f\d]{64}$/i.test(scenario.adoptionAnswerBaselineHash),
    'WP-10 F3 descriptor contract is invalid',
  );
  return descriptor as Descriptor;
}

export async function loginF3Staff(input: {
  factory: RoleContextFactory;
  descriptor: Descriptor;
  password: string;
  environment: EnabledEnvironment;
}): Promise<StaffSession> {
  const roleContext = await input.factory.create('doctor', 'wp10-f3-staff', {
    viewport: { width: 1440, height: 1000 },
  });
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
    'WP-10 F3 staff login did not establish the expected identity',
  );
  await expect(page).toHaveURL(`${input.environment.frontendOrigin}/dashboard`);
  return { roleContext, ledger, consoleAudit };
}

function responsePath(response: Response): string {
  return new URL(response.url()).pathname;
}

export async function openF3Execution(input: {
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
  const reviewResponsePromise = input.page.waitForResponse(
    (response) =>
      new URL(response.url()).origin === input.environment.backendOrigin &&
      responsePath(response).endsWith('/patient-administration/review') &&
      response.request().method() === 'GET',
  );
  await input.page.goto(
    `${input.environment.frontendOrigin}${input.descriptor.scenario.navigationPath}`,
    { waitUntil: 'domcontentloaded' },
  );
  expect((await executionResponsePromise).status()).toBe(200);
  expect((await reviewResponsePromise).status()).toBe(200);
  await expect(
    input.page.getByTestId('patient-administration-review-panel'),
  ).toBeVisible();
}

export function waitForBackendResponse(input: {
  page: Page;
  method: string;
  pathSuffix: string;
}): Promise<Response> {
  return input.page.waitForResponse(
    (response) =>
      responsePath(response).endsWith(input.pathSuffix) &&
      response.request().method() === input.method,
  );
}

export function assertF3BrowserAudit(input: {
  consoleAudit: ConsoleAudit;
  ledger: NetworkLedger;
  allowedHttpFailures: AllowedHttpFailure[];
}): F3BrowserAuditSummary {
  const entries = input.ledger.entries();
  const allowedFailureKeys = new Set<string>();

  for (const allowedFailure of input.allowedHttpFailures) {
    if (
      allowedFailure.status < 400 ||
      allowedFailure.status >= 500 ||
      !Number.isSafeInteger(allowedFailure.status) ||
      !allowedFailure.safeUrlPattern.startsWith('/')
    ) {
      throw new Error('WP-10 F3 browser audit allow entry is invalid');
    }
    allowedFailureKeys.add(httpFailureKey(allowedFailure));
  }

  let ignoredCanceledGets = 0;
  for (const entry of entries) {
    if (entry.status !== null && entry.status >= 500) {
      throw new Error('WP-10 F3 browser audit detected an HTTP 5xx response');
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
        'WP-10 F3 browser audit detected an unexpected HTTP 4xx response',
      );
    }

    if (entry.failureReason === null) continue;
    if (entry.method === 'GET') {
      if (entry.failureReason === 'aborted') {
        ignoredCanceledGets += 1;
        continue;
      }
      throw new Error(
        'WP-10 F3 browser audit detected a GET timeout or transport failure',
      );
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(entry.method)) {
      throw new Error(
        'WP-10 F3 browser audit detected a mutation transport failure',
      );
    }
    throw new Error(
      'WP-10 F3 browser audit detected another transport failure',
    );
  }

  for (const event of input.consoleAudit.events()) {
    if (event.kind === 'page_error') {
      throw new Error('WP-10 F3 browser audit detected a page error');
    }
    if (event.category !== 'network') {
      throw new Error(
        'WP-10 F3 browser audit detected an unexpected Console error',
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
          'WP-10 F3 browser audit detected an unexplained HTTP Console error',
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
        'WP-10 F3 browser audit detected an unexplained network Console error',
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

function httpFailureKey(input: AllowedHttpFailure): string {
  return `${input.method.toUpperCase()}\u0000${input.status}\u0000${input.safeUrlPattern}`;
}
