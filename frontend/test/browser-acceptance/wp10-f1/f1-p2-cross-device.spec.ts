import type { Page } from '@playwright/test';

import { test, expect } from '../support/acceptance-test';
import { runAccessibilityAudit } from '../support/accessibility-audit';
import type { NetworkLedger } from '../support/network-ledger';
import { auditRuntimeStorage } from '../support/runtime-audit';
import {
  assertNoGlobalHorizontalOverflow,
  auditViewport,
} from '../support/viewport-audit';
import {
  AUTH_ME_PATTERN,
  CURRENT_PATTERN,
  ENTER_PATTERN,
  PAUSE_PATTERN,
  PREPARATION_PATTERN,
  REISSUE_PATTERN,
  RESUME_PATTERN,
  STAFF_ROOT_PATTERN,
  TERMINATE_PATTERN,
  assertF1BrowserAudit,
  assertNoF2F3Requests,
  bodyContainsAny,
  completeLocalPreparation,
  createPatientContext,
  invariant,
  loginStaff,
  openExecution,
  readDescriptor,
  requireSecret,
  resolveEnvironment,
} from './support/wp10-f1-support';

const environment = resolveEnvironment();

function waitForPost(page: Page, suffix: string) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(suffix) &&
      response.request().method() === 'POST',
  );
}

function countCurrentUnauthorized(ledger: NetworkLedger): number {
  return ledger.entries().filter(
    ({ method, status, safeUrlPattern }) =>
      method === 'GET' &&
      status === 401 &&
      safeUrlPattern === CURRENT_PATTERN,
  ).length;
}

type StaffSessionBody = {
  status?: unknown;
  preparationConfirmedAt?: unknown;
  hasPatientCredential?: unknown;
};

async function enterOnPatientDevice(
  page: Page,
  code: string,
  frontendOrigin: string,
): Promise<void> {
  await page.getByLabel('六位数字进入码').fill(code);
  const enterResponsePromise = waitForPost(page, '/patient-administration/enter');
  await page.getByRole('button', { name: '进入患者施测' }).click();
  expect((await enterResponsePromise).status()).toBe(200);
  await expect(page).toHaveURL(`${frontendOrigin}/patient-administration`);
  expect(new URL(page.url()).search).toBe('');
  expect(new URL(page.url()).hash).toBe('');
}

test.describe('WP-10 F1-P2 cross-device entry and staff control', () => {
  test.skip(!environment, 'Explicit live Browser acceptance environment is required');

  test('keeps isolated patient devices synchronized without F2 or F3 calls', async ({
    browser,
    roleContexts,
  }) => {
    test.setTimeout(120_000);
    invariant(environment, 'Live environment is unavailable');
    const descriptor = await readDescriptor('F1-P2-cross-device');
    const password = requireSecret();
    const staff = await loginStaff({
      factory: roleContexts,
      account: descriptor.accounts.staff.loginIdentifier,
      password,
      environment,
      viewport: { width: 1280, height: 800 },
    });
    const staffPage = staff.roleContext.page;
    await openExecution({ page: staffPage, descriptor, environment });

    const firstPatientContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const secondPatientContext = await browser.newContext({
      viewport: { width: 800, height: 1280 },
    });
    const firstPatientPage = await firstPatientContext.newPage();
    const secondPatientPage = await secondPatientContext.newPage();
    const firstPatient = await createPatientContext({
      context: firstPatientContext,
      page: firstPatientPage,
    });
    const secondPatient = await createPatientContext({
      context: secondPatientContext,
      page: secondPatientPage,
    });

    try {
      await staffPage.getByRole('radio', { name: /跨设备/ }).check();
      const createResponsePromise = waitForPost(staffPage, '/patient-administration');
      await staffPage.getByRole('button', { name: '创建患者施测会话' }).click();
      expect((await createResponsePromise).status()).toBe(201);
      const codeLocator = staffPage.getByTestId('patient-administration-entry-code');
      await expect(codeLocator).toBeVisible();
      const firstCode = (await codeLocator.innerText()).replace(/\s/g, '');
      invariant(/^\d{6}$/.test(firstCode), 'Initial entry code shape is invalid');
      await expect(
        staffPage.getByRole('button', { name: '确认准备与影响因素' }),
      ).toBeDisabled();

      await firstPatientPage.goto(`${environment.frontendOrigin}/`, {
        waitUntil: 'domcontentloaded',
      });
      await firstPatientPage.getByRole('link', { name: '患者施测入口' }).click();
      await expect(firstPatientPage).toHaveURL(
        `${environment.frontendOrigin}/patient-administration/enter`,
      );
      expect((await runAccessibilityAudit(firstPatientPage)).violationCount).toBe(0);
      assertNoGlobalHorizontalOverflow(
        await auditViewport(firstPatientPage, { width: 390, height: 844 }),
      );
      await enterOnPatientDevice(firstPatientPage, firstCode, environment.frontendOrigin);
      await expect(
        firstPatientPage.getByRole('heading', { name: '请先完成本机设备准备' }),
      ).toBeVisible();
      invariant(
        !(await bodyContainsAny(firstPatientPage, [
          descriptor.scenario.patientId,
          descriptor.scenario.visitId,
          descriptor.scenario.scaleInstanceId,
        ])),
        'Prepared patient page rendered an internal identifier',
      );
      await completeLocalPreparation(firstPatientPage);
      await expect(
        firstPatientPage.getByText('本机准备已完成，请告知医护人员确认。'),
      ).toBeVisible();
      const preparedStorage = await auditRuntimeStorage(firstPatientPage);
      expect(preparedStorage.localStorageKeys).toEqual([]);
      expect(preparedStorage.sessionStorageKeys).toEqual([]);
      expect(preparedStorage.indexedDbNames).toEqual([]);
      expect(
        firstPatient.ledger.entries().filter(({ method }) => method !== 'GET').length,
      ).toBe(1);

      await staffPage.getByRole('button', { name: '手动刷新' }).click();
      await expect(staffPage.getByText('患者设备已进入', { exact: true })).toBeVisible({
        timeout: 10_000,
      });
      await expect(codeLocator).toHaveCount(0);

      const executionReloadResponsePromise = staffPage.waitForResponse(
        (response) =>
          new URL(response.url()).origin === environment.backendOrigin &&
          new URL(response.url()).pathname === descriptor.scenario.navigationPath &&
          response.request().method() === 'GET' &&
          response.status() === 200,
      );
      const staffReloadResponsePromise = staffPage.waitForResponse(
        (response) =>
          new URL(response.url()).origin === environment.backendOrigin &&
          new URL(response.url()).pathname ===
            `${descriptor.scenario.navigationPath}/patient-administration` &&
          response.request().method() === 'GET' &&
          response.status() === 200,
      );
      await staffPage.reload({ waitUntil: 'domcontentloaded' });
      await executionReloadResponsePromise;
      const staffReloadResponse = await staffReloadResponsePromise;
      const reloadedSession = (await staffReloadResponse.json()) as StaffSessionBody;
      expect(reloadedSession.status).toBe('prepared');
      expect(reloadedSession.preparationConfirmedAt).toBeNull();
      expect(reloadedSession.hasPatientCredential).toBe(true);
      await expect(
        staffPage.getByTestId('patient-administration-staff-panel'),
      ).toBeVisible();
      await expect(staffPage.getByText('患者设备已进入', { exact: true })).toBeVisible();
      await expect(
        staffPage.getByRole('button', { name: '同一设备准备' }),
      ).toBeDisabled();
      await expect(
        staffPage.getByRole('button', { name: '跨设备准备' }),
      ).toBeEnabled();
      await expect(
        staffPage.getByRole('checkbox', {
          name: '患者已当面告知本机准备与不计分练习完成',
        }),
      ).toBeVisible();
      await expect(
        staffPage.getByRole('button', { name: '确认准备与影响因素' }),
      ).toBeDisabled();

      await staffPage
        .getByRole('checkbox', { name: '环境干扰因素' })
        .check();
      await staffPage
        .getByRole('checkbox', { name: '设备或网络因素' })
        .check();
      await staffPage
        .getByRole('checkbox', {
          name: '患者已当面告知本机准备与不计分练习完成',
        })
        .check();
      const preparationResponsePromise = waitForPost(
        staffPage,
        '/preparation/confirm',
      );
      await staffPage.getByRole('button', { name: '确认准备与影响因素' }).click();
      expect((await preparationResponsePromise).status()).toBe(200);
      await expect(staffPage.getByText('施测进行中', { exact: true })).toBeVisible();
      await expect(
        firstPatientPage.getByRole('heading', { name: '已进入患者施测模式' }),
      ).toBeVisible({ timeout: 10_000 });

      await staffPage
        .getByLabel('暂停 / 恢复原因（可选，最多 500 字）')
        .fill('WP-10 F1 跨设备暂停检查');
      const pauseResponsePromise = waitForPost(staffPage, '/pause');
      await staffPage.getByRole('button', { name: '暂停施测' }).click();
      expect((await pauseResponsePromise).status()).toBe(200);
      await expect(
        firstPatientPage.getByRole('heading', { name: '施测已暂停，请稍候' }),
      ).toBeVisible({ timeout: 10_000 });

      const firstResumeResponsePromise = waitForPost(staffPage, '/resume');
      await staffPage.getByRole('button', { name: '恢复施测' }).click();
      expect((await firstResumeResponsePromise).status()).toBe(200);
      await expect(
        firstPatientPage.getByRole('heading', { name: '已进入患者施测模式' }),
      ).toBeVisible({ timeout: 10_000 });

      await staffPage
        .getByLabel('重新签发原因（必填，最多 500 字）')
        .fill('WP-10 F1 更换患者设备');
      await staffPage
        .getByRole('checkbox', {
          name: '我确认旧患者设备凭证将失效，并需要把新码当面告知患者',
        })
        .check();
      const reissueResponsePromise = waitForPost(staffPage, '/entry-code/reissue');
      await staffPage.getByRole('button', { name: '重新签发进入码' }).click();
      expect((await reissueResponsePromise).status()).toBe(200);
      await expect(staffPage.getByText('已暂停', { exact: true })).toBeVisible();
      const secondCodeLocator = staffPage.getByTestId(
        'patient-administration-entry-code',
      );
      const secondCode = (await secondCodeLocator.innerText()).replace(/\s/g, '');
      invariant(/^\d{6}$/.test(secondCode), 'Reissued entry code shape is invalid');
      invariant(secondCode !== firstCode, 'Reissued entry code was not rotated');
      await expect(
        firstPatientPage.getByRole('heading', {
          name: '当前患者施测凭证已失效',
        }),
      ).toBeVisible({ timeout: 10_000 });
      expect(countCurrentUnauthorized(firstPatient.ledger)).toBe(1);
      await firstPatientPage.waitForTimeout(3_500);
      expect(countCurrentUnauthorized(firstPatient.ledger)).toBe(1);

      await secondPatientPage.goto(
        `${environment.frontendOrigin}/patient-administration/enter`,
        { waitUntil: 'domcontentloaded' },
      );
      await enterOnPatientDevice(secondPatientPage, secondCode, environment.frontendOrigin);
      await expect(
        secondPatientPage.getByRole('heading', { name: '施测已暂停，请稍候' }),
      ).toBeVisible();
      await staffPage.getByRole('button', { name: '手动刷新' }).click();
      await expect(secondCodeLocator).toHaveCount(0);

      const secondResumeResponsePromise = waitForPost(staffPage, '/resume');
      await staffPage.getByRole('button', { name: '恢复施测' }).click();
      expect((await secondResumeResponsePromise).status()).toBe(200);
      await expect(
        secondPatientPage.getByRole('heading', { name: '已进入患者施测模式' }),
      ).toBeVisible({ timeout: 10_000 });
      assertNoGlobalHorizontalOverflow(
        await auditViewport(secondPatientPage, { width: 800, height: 1280 }),
      );
      expect((await runAccessibilityAudit(secondPatientPage)).violationCount).toBe(0);

      await staffPage
        .getByLabel('终止原因（必填，最多 500 字）')
        .fill('WP-10 F1 跨设备终止检查');
      await staffPage
        .getByRole('checkbox', {
          name: '我确认终止后患者凭证与进入码均不可继续使用',
        })
        .check();
      const terminateResponsePromise = waitForPost(staffPage, '/terminate');
      await staffPage.getByRole('button', { name: '确认终止会话' }).click();
      expect((await terminateResponsePromise).status()).toBe(200);
      await expect(staffPage.getByText('已终止', { exact: true })).toBeVisible();
      await expect(
        secondPatientPage.getByRole('heading', {
          name: '当前患者施测凭证已失效',
        }),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        secondPatientPage.getByRole('button', {
          name: '交还设备并由医护人员重新登录',
        }),
      ).toBeVisible();
      expect(countCurrentUnauthorized(secondPatient.ledger)).toBe(1);
      await secondPatientPage.waitForTimeout(3_500);
      expect(countCurrentUnauthorized(secondPatient.ledger)).toBe(1);

      const firstStorage = await auditRuntimeStorage(firstPatientPage);
      const secondStorage = await auditRuntimeStorage(secondPatientPage);
      for (const storage of [firstStorage, secondStorage]) {
        expect(storage.localStorageKeys).toEqual([]);
        expect(storage.sessionStorageKeys).toEqual([]);
        expect(storage.indexedDbNames).toEqual([]);
        expect(storage.forbiddenValueDetected).toBe(false);
        expect(storage.documentCookieEmpty).toBe(true);
        expect(storage.urlHasSensitiveQueryOrHash).toBe(false);
      }
      invariant(
        !(await bodyContainsAny(secondPatientPage, [
          descriptor.scenario.patientId,
          descriptor.scenario.visitId,
          descriptor.scenario.scaleInstanceId,
          firstCode,
          secondCode,
        ])),
        'Patient terminal page rendered an identifier or entry code',
      );

      expect(
        staff.ledger.count({ method: 'POST', safeUrlPattern: STAFF_ROOT_PATTERN }),
      ).toBe(1);
      expect(
        staff.ledger.count({ method: 'POST', safeUrlPattern: PREPARATION_PATTERN }),
      ).toBe(1);
      expect(
        staff.ledger.count({ method: 'POST', safeUrlPattern: PAUSE_PATTERN }),
      ).toBe(1);
      expect(
        staff.ledger.count({ method: 'POST', safeUrlPattern: RESUME_PATTERN }),
      ).toBe(2);
      expect(
        staff.ledger.count({ method: 'POST', safeUrlPattern: REISSUE_PATTERN }),
      ).toBe(1);
      expect(
        staff.ledger.count({ method: 'POST', safeUrlPattern: TERMINATE_PATTERN }),
      ).toBe(1);
      expect(
        firstPatient.ledger.count({ method: 'POST', safeUrlPattern: ENTER_PATTERN }) +
          secondPatient.ledger.count({
            method: 'POST',
            safeUrlPattern: ENTER_PATTERN,
          }),
      ).toBe(2);
      for (const pattern of [
        STAFF_ROOT_PATTERN,
        PREPARATION_PATTERN,
        PAUSE_PATTERN,
        REISSUE_PATTERN,
        TERMINATE_PATTERN,
      ]) {
        staff.ledger.assertNoAutomaticRetry({ method: 'POST', safeUrlPattern: pattern });
      }
      staff.ledger.assertNoAutomaticRetry(
        { method: 'POST', safeUrlPattern: RESUME_PATTERN },
        2,
      );
      firstPatient.ledger.assertNoAutomaticRetry({
        method: 'POST',
        safeUrlPattern: ENTER_PATTERN,
      });
      secondPatient.ledger.assertNoAutomaticRetry({
        method: 'POST',
        safeUrlPattern: ENTER_PATTERN,
      });
      invariant(
        firstPatient.ledger.count({ method: 'GET', safeUrlPattern: CURRENT_PATTERN }) >=
          1 &&
          secondPatient.ledger.count({
            method: 'GET',
            safeUrlPattern: CURRENT_PATTERN,
          }) >= 1,
        'Patient current polling was not observed',
      );
      assertNoF2F3Requests([
        staff.ledger,
        firstPatient.ledger,
        secondPatient.ledger,
      ]);
      const staffAuditSummary = assertF1BrowserAudit({
        ledger: staff.ledger,
        consoleAudit: staff.consoleAudit,
        expectedHttpFailures: [
          { method: 'GET', status: 401, safeUrlPattern: AUTH_ME_PATTERN },
          { method: 'GET', status: 404, safeUrlPattern: STAFF_ROOT_PATTERN },
        ],
      });
      const firstPatientAuditSummary = assertF1BrowserAudit({
        ledger: firstPatient.ledger,
        consoleAudit: firstPatient.consoleAudit,
        expectedHttpFailures: [
          { method: 'GET', status: 401, safeUrlPattern: CURRENT_PATTERN },
        ],
      });
      const secondPatientAuditSummary = assertF1BrowserAudit({
        ledger: secondPatient.ledger,
        consoleAudit: secondPatient.consoleAudit,
        expectedHttpFailures: [
          { method: 'GET', status: 401, safeUrlPattern: CURRENT_PATTERN },
        ],
      });
      expect(staffAuditSummary.expectedHttpFailuresObserved).toBe(2);
      expect(firstPatientAuditSummary.expectedHttpFailuresObserved).toBe(1);
      expect(secondPatientAuditSummary.expectedHttpFailuresObserved).toBe(1);
      for (const summary of [
        staffAuditSummary,
        firstPatientAuditSummary,
        secondPatientAuditSummary,
      ]) {
        expect(summary.unexpectedHttpFailures).toBe(0);
        expect(summary.unexpectedTransportFailures).toBe(0);
        expect(summary.unexpectedConsoleErrors).toBe(0);
        expect(summary.pageErrors).toBe(0);
      }
      staff.consoleAudit.stop();
      firstPatient.consoleAudit.stop();
      secondPatient.consoleAudit.stop();
    } finally {
      await Promise.all([firstPatientContext.close(), secondPatientContext.close()]);
    }
  });
});
