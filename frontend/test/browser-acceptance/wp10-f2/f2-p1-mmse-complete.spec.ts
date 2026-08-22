import { test, expect } from '../support/acceptance-test';
import { auditRuntimeStorage } from '../support/runtime-audit';
import {
  AUTH_ME_PATTERN,
  CURRENT_PATTERN,
  EVIDENCE_PATTERN,
  STAFF_ROOT_PATTERN,
  allowAutoplayIfNeeded,
  assertF2BrowserAudit,
  assertNoF3Requests,
  completePatientStep,
  completeSyntheticPreparation,
  createF2PatientContext,
  enterPatientDevice,
  expectEvidenceUpload,
  installSyntheticMicrophone,
  invariant,
  loginF2Staff,
  openF2Execution,
  readF2Descriptor,
  recordAndSaveSpeech,
  refreshStaff,
  requireF2Secret,
  resolveF2Environment,
  safeTestPng,
  waitForPost,
  waitForStep,
} from './support/wp10-f2-support';

const environment = resolveF2Environment();

async function completeSpeechStep(
  page: import('@playwright/test').Page,
  order: number,
) {
  await waitForStep(page, order);
  await recordAndSaveSpeech(page);
  await completePatientStep(page);
}

test.describe('WP-10 F2-P1 complete MMSE patient administration', () => {
  test.skip(!environment, 'Explicit live Browser acceptance environment is required');

  test('completes all 19 server-authoritative steps in the normal multimedia flow', async ({
    browser,
    roleContexts,
  }) => {
    test.setTimeout(300_000);
    invariant(environment, 'Live environment is unavailable');
    const descriptor = await readF2Descriptor('full');
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
      const codeLocator = staffPage.getByTestId('patient-administration-entry-code');
      const code = (await codeLocator.innerText()).replace(/\s/g, '');
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

      await waitForStep(patientPage, 1);
      await recordAndSaveSpeech(patientPage);
      await expect(
        patientPage.getByRole('button', { name: '再听一遍指导语' }),
      ).toBeVisible();
      await expect(
        patientPage.getByRole('button', { name: /重播|再听一遍测量语音/ }),
      ).toHaveCount(0);
      await expect(
        patientPage.getByRole('button', {
          name: '播放医护授权的测量语音',
          exact: true,
        }),
      ).toHaveCount(0);
      await completePatientStep(patientPage);

      for (let order = 2; order <= 16; order += 1) {
        await completeSpeechStep(patientPage, order);
      }

      await waitForStep(patientPage, 17);
      await allowAutoplayIfNeeded(patientPage);
      await expect(
        patientPage.getByRole('button', { name: '开始录音' }),
      ).toHaveCount(0);
      const evidenceCountBeforeStep17 = patient.ledger.count({
        method: 'POST',
        safeUrlPattern: EVIDENCE_PATTERN,
      });
      await expect(
        patientPage.getByRole('button', { name: '完成本题并继续' }),
      ).toBeEnabled({
        timeout: 20_000,
      });
      await completePatientStep(patientPage);
      expect(
        patient.ledger.count({ method: 'POST', safeUrlPattern: EVIDENCE_PATTERN }),
      ).toBe(evidenceCountBeforeStep17);

      await patientPage.setViewportSize({ width: 800, height: 1280 });
      await waitForStep(patientPage, 18);
      await allowAutoplayIfNeeded(patientPage);
      const writingCanvas = patientPage.getByLabel('本题书写画布');
      await expect(writingCanvas).toBeVisible({ timeout: 20_000 });
      const writingBounds = await writingCanvas.boundingBox();
      invariant(writingBounds, 'Writing canvas bounds are unavailable');
      await patientPage.mouse.move(writingBounds.x + 40, writingBounds.y + 50);
      await patientPage.mouse.down();
      await patientPage.mouse.move(writingBounds.x + 280, writingBounds.y + 150, {
        steps: 8,
      });
      await patientPage.mouse.up();
      await expectEvidenceUpload(patientPage, () =>
        patientPage.getByRole('button', { name: '保存本题内容' }).click(),
      );
      await completePatientStep(patientPage);

      await waitForStep(patientPage, 19);
      const stimulusImage = patientPage.getByTestId(
        'patient-administration-step-image',
      );
      await expect(stimulusImage).toBeVisible({ timeout: 15_000 });
      const imageShape = await stimulusImage.evaluate((image) => {
        const element = image as HTMLImageElement;
        return {
          naturalRatio: element.naturalWidth / element.naturalHeight,
          renderedRatio: element.getBoundingClientRect().width /
            element.getBoundingClientRect().height,
        };
      });
      expect(Math.abs(imageShape.naturalRatio - imageShape.renderedRatio)).toBeLessThan(
        0.02,
      );
      await allowAutoplayIfNeeded(patientPage);
      await patientPage
        .getByRole('radio', { name: '纸笔完成后选择照片' })
        .check();
      await patientPage.getByLabel('选择本题照片').setInputFiles(safeTestPng());
      const photoEvidenceResponse = await expectEvidenceUpload(
        patientPage,
        () => patientPage.getByRole('button', { name: '保存本题内容' }).click(),
      );
      const photoEvidenceRequest = photoEvidenceResponse.request();
      expect(photoEvidenceRequest.postData() ?? '').not.toContain(
        'private-local-source-name.png',
      );
      await completePatientStep(patientPage);
      await expect(
        patientPage.getByRole('heading', {
          name: '本次作答已完成，请将设备交还医护人员',
        }),
      ).toBeVisible({ timeout: 15_000 });

      const storage = await auditRuntimeStorage(patientPage);
      expect(storage.localStorageKeys).toEqual([]);
      expect(storage.sessionStorageKeys).toEqual([]);
      expect(storage.indexedDbNames).toEqual([]);
      expect(storage.forbiddenValueDetected).toBe(false);
      expect(storage.documentCookieEmpty).toBe(true);
      expect(storage.urlHasSensitiveQueryOrHash).toBe(false);
      const completedBodyText = await patientPage.locator('body').innerText();
      for (const forbidden of [
        descriptor.scenario.patientId,
        descriptor.scenario.visitId,
        descriptor.scenario.scaleInstanceId,
        code,
      ]) {
        expect(completedBodyText).not.toContain(forbidden);
      }
      expect(
        await patientPage.locator('[src^="blob:"]').count(),
      ).toBe(0);
      const patientCookieNames = (
        await patientContext.cookies(environment.backendOrigin)
      ).map(({ name }) => name);
      expect(patientCookieNames).not.toContain('cogmemory_ad_patient_session');

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
        allowedHttpFailures: patient.ledger.entries().some(
          ({ method, status, safeUrlPattern }) =>
            method === 'GET' &&
            status === 401 &&
            safeUrlPattern === CURRENT_PATTERN,
        )
          ? [{ method: 'GET', status: 401, safeUrlPattern: CURRENT_PATTERN }]
          : [],
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
