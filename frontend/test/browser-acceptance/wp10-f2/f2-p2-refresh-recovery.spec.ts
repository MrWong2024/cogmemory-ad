import { test, expect } from '../support/acceptance-test';
import { auditRuntimeStorage } from '../support/runtime-audit';
import {
  AUTH_ME_PATTERN,
  EVIDENCE_PATTERN,
  STAFF_ROOT_PATTERN,
  allowAutoplayIfNeeded,
  assertF2BrowserAudit,
  assertNoF3Requests,
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
        .getByRole('checkbox', { name: '我已确认患者设备的必要检查已完成' })
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

      const currentStep = {
        stepKey: 'mmse-orientation-year',
        order: 1,
      } as const;
      await waitForStep(patientPage, currentStep.order);
      const evidencePostBaseline = patient.ledger.count({
        method: 'POST',
        safeUrlPattern: EVIDENCE_PATTERN,
      });
      await recordAndSaveSpeech(patientPage);
      expect(
        patient.ledger.count({ method: 'POST', safeUrlPattern: EVIDENCE_PATTERN }),
      ).toBe(evidencePostBaseline + 1);
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
        currentStep?: { stepKey?: unknown; order?: unknown } | null;
      };
      expect(reloadBody).toMatchObject({
        status: 'active',
        currentStep,
      });
      await waitForStep(patientPage, currentStep.order);
      expect(
        patient.ledger.count({ method: 'POST', safeUrlPattern: EVIDENCE_PATTERN }),
      ).toBe(evidencePostBaseline + 1);
      const storageAfterReload = await auditRuntimeStorage(patientPage);
      expect(storageAfterReload.localStorageKeys).toEqual([]);
      expect(storageAfterReload.sessionStorageKeys).toEqual([]);
      expect(storageAfterReload.indexedDbNames).toEqual([]);

      await allowAutoplayIfNeeded(patientPage);
      await expect(
        patientPage.getByRole('button', { name: '完成本题并继续' }),
      ).toBeEnabled({ timeout: 20_000 });
      assertNoF3Requests([staff.ledger, patient.ledger]);

      const staffAudit = assertF2BrowserAudit({
        ledger: staff.ledger,
        consoleAudit: staff.consoleAudit,
        allowedHttpFailures: [
          { method: 'GET', status: 401, safeUrlPattern: AUTH_ME_PATTERN },
          { method: 'GET', status: 404, safeUrlPattern: STAFF_ROOT_PATTERN },
        ],
      });
      const patientAudit = assertF2BrowserAudit({
        ledger: patient.ledger,
        consoleAudit: patient.consoleAudit,
        allowedHttpFailures: [],
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
