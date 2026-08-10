import { readFile } from 'node:fs/promises';

import type { Page, Response } from '@playwright/test';

import { expect } from '../../support/acceptance-test';
import type { NetworkLedger } from '../../support/network-ledger';
import type { ConsoleAudit } from '../../support/runtime-audit';
import type { RoleContextFactory } from '../../support/role-context-factory';
import {
  assertF1BrowserAudit,
  invariant,
  loginStaff,
  resolveEnvironment,
  type EnabledEnvironment,
  type F1ExpectedHttpFailure,
  type StaffSession,
} from '../../wp10-f1/support/wp10-f1-support';

export type Descriptor = {
  schemaVersion: 1;
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
    sessionBaselineHash: string;
    mediaWithoutTranscriptionBaselineHash: string;
    unchangedItemsBaselineHash: string;
    adoptionAnswerBaselineHash: string;
    readingEvidenceBaselineHash: string;
    instanceStableBaselineHash: string;
    outsideNamespaceBaselineHash: string;
  };
};

export const AUTH_ME_PATTERN = '/auth/me';
export const EXECUTION_PATTERN =
  '/patients/<id>/visits/<id>/scale-instances/<id>';
// The shared safe-output sanitizer deliberately replaces long opaque-looking
// path segments, including these two static endpoint names, with <id>.
export const REVIEW_PATTERN = `${EXECUTION_PATTERN}/<id>/review`;
export const TRANSCRIBE_PATTERN = `${EXECUTION_PATTERN}/item-responses/<id>/media-evidences/<id>/transcribe`;
export const ACCESS_PATTERN = `${EXECUTION_PATTERN}/item-responses/<id>/media-evidences/<id>/access-url`;
export const ADOPT_PATTERN = `${EXECUTION_PATTERN}/item-responses/<id>/media-evidences/<id>/adopt`;
export const A14_PATTERN = `${EXECUTION_PATTERN}/item-responses/<id>`;
export const READINESS_PATTERN = `${EXECUTION_PATTERN}/<id>`;
export const SUBMIT_PATTERN = `${EXECUTION_PATTERN}/submit`;
export const SCORE_RESULT_PATTERN = `${EXECUTION_PATTERN}/score-results/latest`;

export function resolveF3Environment(): EnabledEnvironment | null {
  return resolveEnvironment();
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
  const hashes = scenario
    ? [
        scenario.sessionBaselineHash,
        scenario.mediaWithoutTranscriptionBaselineHash,
        scenario.unchangedItemsBaselineHash,
        scenario.adoptionAnswerBaselineHash,
        scenario.readingEvidenceBaselineHash,
        scenario.instanceStableBaselineHash,
        scenario.outsideNamespaceBaselineHash,
      ]
    : [];
  invariant(
    descriptor.schemaVersion === 1 &&
      descriptor.batch === 'WP10-F3' &&
      typeof descriptor.namespace === 'string' &&
      /^[a-z0-9][a-z0-9-]{2,19}$/.test(descriptor.namespace) &&
      typeof descriptor.accounts?.staff.loginIdentifier === 'string' &&
      scenario &&
      ids.length === 7 &&
      ids.every((entry) => /^[a-f\d]{24}$/i.test(entry)) &&
      scenario.navigationPath ===
        `/patients/${scenario.patientId}/visits/${scenario.visitId}/scale-instances/${scenario.scaleInstanceId}` &&
      scenario.itemCount === 11 &&
      scenario.stepCount === 19 &&
      hashes.length === 7 &&
      hashes.every((entry) => /^[a-f\d]{64}$/i.test(entry)),
    'WP-10 F3 descriptor contract is invalid',
  );
  return descriptor as Descriptor;
}

export function loginF3Staff(input: {
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
    viewport: { width: 1440, height: 1000 },
  });
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
  await expect(
    input.page.getByRole('heading', { name: '患者施测复核', exact: true }),
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
  expectedHttpFailures: F1ExpectedHttpFailure[];
}) {
  return assertF1BrowserAudit(input);
}

export function assertExactMutationBodyKeys(
  ledger: NetworkLedger,
  safeUrlPattern: string,
  expectedKeys: string[],
): void {
  const matching = ledger.entries().filter(
    (entry) =>
      ['POST', 'PATCH'].includes(entry.method) &&
      entry.safeUrlPattern === safeUrlPattern,
  );
  expect(matching).toHaveLength(1);
  expect(matching[0]?.bodyKeys).toEqual([...expectedKeys].sort());
}

export { invariant };
