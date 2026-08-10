import { test, expect } from '../support/acceptance-test';
import { runAccessibilityAudit } from '../support/accessibility-audit';
import { auditRuntimeStorage } from '../support/runtime-audit';
import {
  AUDIO_PATTERN,
  AUTH_ME_PATTERN,
  CURRENT_PATTERN,
  EVIDENCE_PATTERN,
  PATIENT_COMPLETE_PATTERN,
  PAUSE_PATTERN,
  REDO_PATTERN,
  RESUME_PATTERN,
  STAFF_ROOT_PATTERN,
  TAKEOVER_PATTERN,
  TERMINATE_PATTERN,
  allowAutoplayIfNeeded,
  assertExactBodyKeys,
  assertF2BrowserAudit,
  assertNoF3Requests,
  completePatientStep,
  completeSyntheticPreparation,
  createF2PatientContext,
  enterPatientDevice,
  installSyntheticMicrophone,
  invariant,
  loginF2Staff,
  openF2Execution,
  readF2Descriptor,
  recordAndSaveSpeech,
  refreshStaff,
  requireF2Secret,
  resolveF2Environment,
  waitForPost,
  waitForStep,
} from './support/wp10-f2-support';

const environment = resolveF2Environment();

async function pauseStaff(page: import('@playwright/test').Page, reason: string) {
  await page.getByLabel('暂停 / 恢复原因（可选，最多 500 字）').fill(reason);
  const responsePromise = waitForPost(page, '/pause');
  await page.getByRole('button', { name: '暂停施测', exact: true }).click();
  expect((await responsePromise).status()).toBe(200);
  await expect(page.getByText('已暂停', { exact: true }).first()).toBeVisible();
}

async function resumeStaff(page: import('@playwright/test').Page, reason: string) {
  await page.getByLabel('暂停 / 恢复原因（可选，最多 500 字）').fill(reason);
  const responsePromise = waitForPost(page, '/resume');
  await page.getByRole('button', { name: '恢复施测', exact: true }).click();
  expect((await responsePromise).status()).toBe(200);
}

test.describe('WP-10 F2-P2 upload recovery after patient reload', () => {
  test.skip(!environment, 'Explicit live Browser acceptance environment is required');

  test('uses server evidence after reload without a duplicate upload', async ({
    browser,
    roleContexts,
  }) => {
    test.setTimeout(120_000);
    invariant(environment, 'Live environment is unavailable');
    const descriptor = await readF2Descriptor('recovery');
    const password = requireF2Secret();
    const staff = await loginF2Staff({
      factory: roleContexts,
      descriptor,
      password,
      environment,
    });
    const staffPage = staff.roleContext.page;
    await openF2Execution({ page: staffPage, descriptor, environment });

    const patientContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await installSyntheticMicrophone(patientContext);
    const patientPage = await patientContext.newPage();
    const patient = await createF2PatientContext({
      context: patientContext,
      page: patientPage,
    });

    try {
      await staffPage.getByRole('radio', { name: /跨设备/ }).check();
      const createResponsePromise = waitForPost(staffPage, '/patient-administration');
      await staffPage.getByRole('button', { name: '创建患者施测会话' }).click();
      expect((await createResponsePromise).status()).toBe(201);
      const code = (
        await staffPage
          .getByTestId('patient-administration-entry-code')
          .innerText()
      ).replace(/\s/g, '');
      invariant(/^\d{6}$/.test(code), 'Patient entry code shape is invalid');
      await enterPatientDevice({ page: patientPage, code, environment });
      await completeSyntheticPreparation(patientPage);
      await refreshStaff(staffPage);
      await staffPage
        .getByRole('checkbox', { name: '患者已当面告知本机准备与不计分练习完成' })
        .check();
      const preparationResponsePromise = waitForPost(
        staffPage,
        '/preparation/confirm',
      );
      await staffPage.getByRole('button', { name: '确认准备与影响因素' }).click();
      expect((await preparationResponsePromise).status()).toBe(200);
      await expect(
        staffPage.getByRole('button', { name: '暂停施测', exact: true }),
      ).toBeVisible();
      const accessibilitySummary = await runAccessibilityAudit(staffPage);
      console.log(
        `WP10_F2_STAFF_AXE_SUMMARY ${JSON.stringify(accessibilitySummary)}`,
      );

      await waitForStep(patientPage, 1);
      await recordAndSaveSpeech(patientPage);
      expect(
        patient.ledger.count({ method: 'POST', safeUrlPattern: EVIDENCE_PATTERN }),
      ).toBe(1);
      await expect(
        patientPage.getByRole('button', { name: '完成本题并继续' }),
      ).toBeEnabled();

      const reloadCurrentPromise = patientPage.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/patient-administration/current' &&
          response.request().method() === 'GET' &&
          response.status() === 200,
      );
      await patientPage.reload({ waitUntil: 'domcontentloaded' });
      const reloadCurrent = await reloadCurrentPromise;
      const reloadBody = (await reloadCurrent.json()) as {
        status?: unknown;
        currentStep?: { order?: unknown } | null;
      };
      expect(reloadBody).toMatchObject({
        status: 'active',
        currentStep: { order: 1 },
      });
      await waitForStep(patientPage, 1);
      expect(
        patient.ledger.count({ method: 'POST', safeUrlPattern: EVIDENCE_PATTERN }),
      ).toBe(1);
      const storageAfterReload = await auditRuntimeStorage(patientPage);
      expect(storageAfterReload.localStorageKeys).toEqual([]);
      expect(storageAfterReload.sessionStorageKeys).toEqual([]);
      expect(storageAfterReload.indexedDbNames).toEqual([]);

      await allowAutoplayIfNeeded(patientPage);
      await expect(
        patientPage.getByRole('button', { name: '完成本题并继续' }),
      ).toBeEnabled({ timeout: 20_000 });
      await completePatientStep(patientPage);
      await waitForStep(patientPage, 2);
      await allowAutoplayIfNeeded(patientPage);
      await expect(
        patientPage.getByRole('button', { name: '开始录音', exact: true }),
      ).toBeEnabled({ timeout: 20_000 });
      expect(
        patient.ledger.count({ method: 'POST', safeUrlPattern: EVIDENCE_PATTERN }),
      ).toBe(1);

      await refreshStaff(staffPage);
      await pauseStaff(staffPage, 'F2 recovery 第2步由医护接管');
      await expect(
        patientPage.getByRole('heading', { name: '施测已暂停，请稍候' }),
      ).toBeVisible({ timeout: 10_000 });
      await staffPage
        .getByLabel('接管原因（必填，最多 500 字）')
        .fill('患者当前需要医护协助');
      await staffPage
        .getByLabel('接管观察（必填，最多 2000 字）')
        .fill('医护已按规范观察并接管第2步');
      const takeoverResponsePromise = waitForPost(staffPage, '/current/takeover');
      await staffPage.getByRole('button', { name: '接管当前步骤' }).click();
      expect((await takeoverResponsePromise).status()).toBe(200);
      await expect(staffPage.getByText(/施测仍保持暂停/)).toBeVisible();
      await resumeStaff(staffPage, '第2步接管完成后继续');

      await waitForStep(patientPage, 3);
      await recordAndSaveSpeech(patientPage);
      await completePatientStep(patientPage);
      await waitForStep(patientPage, 4);
      await allowAutoplayIfNeeded(patientPage);
      await expect(
        patientPage.getByRole('button', { name: '开始录音', exact: true }),
      ).toBeEnabled({ timeout: 20_000 });
      expect(
        patient.ledger.count({ method: 'POST', safeUrlPattern: EVIDENCE_PATTERN }),
      ).toBe(2);

      await refreshStaff(staffPage);
      await pauseStaff(staffPage, 'F2 recovery 第3步需要重做');
      await staffPage
        .getByLabel('重做原因（必填，最多 500 字）')
        .fill('复核后按规范重做上一完成步骤');
      const redoResponsePromise = waitForPost(staffPage, '/redo-last');
      await staffPage.getByRole('button', { name: '重做上一完成步骤' }).click();
      expect((await redoResponsePromise).status()).toBe(200);
      await resumeStaff(staffPage, '已准备重做第3步');

      await waitForStep(patientPage, 3);
      await allowAutoplayIfNeeded(patientPage);
      await expect(
        patientPage.getByRole('button', { name: '开始录音', exact: true }),
      ).toBeEnabled({ timeout: 20_000 });
      expect(
        patient.ledger.count({ method: 'POST', safeUrlPattern: EVIDENCE_PATTERN }),
      ).toBe(2);
      await refreshStaff(staffPage);
      await staffPage
        .getByLabel('终止原因（必填，最多 500 字）')
        .fill('F2 recovery profile完成后收口');
      await staffPage
        .getByRole('checkbox', {
          name: '我确认终止后患者凭证与进入码均不可继续使用',
        })
        .check();
      const terminateResponsePromise = waitForPost(staffPage, '/terminate');
      await staffPage.getByRole('button', { name: '确认终止会话' }).click();
      expect((await terminateResponsePromise).status()).toBe(200);
      await expect(
        patientPage.getByRole('heading', { name: '当前患者施测凭证已失效' }),
      ).toBeVisible({ timeout: 10_000 });
      const unauthorizedCount = () =>
        patient.ledger.entries().filter(
          ({ method, status, safeUrlPattern }) =>
            method === 'GET' &&
            status === 401 &&
            safeUrlPattern === CURRENT_PATTERN,
        ).length;
      expect(unauthorizedCount()).toBe(1);
      await patientPage.waitForTimeout(3_500);
      expect(unauthorizedCount()).toBe(1);

      expect(
        patient.ledger.count({ method: 'POST', safeUrlPattern: EVIDENCE_PATTERN }),
      ).toBe(2);
      expect(
        patient.ledger.count({
          method: 'POST',
          safeUrlPattern: PATIENT_COMPLETE_PATTERN,
        }),
      ).toBe(2);
      expect(
        patient.ledger.count({ method: 'POST', safeUrlPattern: AUDIO_PATTERN }),
      ).toBe(8);
      expect(
        staff.ledger.count({ method: 'POST', safeUrlPattern: PAUSE_PATTERN }),
      ).toBe(2);
      expect(
        staff.ledger.count({ method: 'POST', safeUrlPattern: RESUME_PATTERN }),
      ).toBe(2);
      expect(
        staff.ledger.count({ method: 'POST', safeUrlPattern: TAKEOVER_PATTERN }),
      ).toBe(1);
      expect(
        staff.ledger.count({ method: 'POST', safeUrlPattern: REDO_PATTERN }),
      ).toBe(1);
      expect(
        staff.ledger.count({ method: 'POST', safeUrlPattern: TERMINATE_PATTERN }),
      ).toBe(1);
      assertExactBodyKeys(patient.ledger, PATIENT_COMPLETE_PATTERN, [
        'expectedRevision',
      ]);
      assertNoF3Requests([staff.ledger, patient.ledger]);

      const staffAudit = assertF2BrowserAudit({
        ledger: staff.ledger,
        consoleAudit: staff.consoleAudit,
        expectedHttpFailures: [
          { method: 'GET', status: 401, safeUrlPattern: AUTH_ME_PATTERN },
          { method: 'GET', status: 404, safeUrlPattern: STAFF_ROOT_PATTERN },
        ],
      });
      const patientAudit = assertF2BrowserAudit({
        ledger: patient.ledger,
        consoleAudit: patient.consoleAudit,
        expectedHttpFailures: [
          { method: 'GET', status: 401, safeUrlPattern: CURRENT_PATTERN },
        ],
      });
      expect(staffAudit.unexpectedHttpFailures).toBe(0);
      expect(patientAudit.unexpectedHttpFailures).toBe(0);
      staff.consoleAudit.stop();
      patient.consoleAudit.stop();
    } finally {
      await patientContext.close();
    }
  });
});
