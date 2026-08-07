import { test, expect } from '../support/acceptance-test';
import { runAccessibilityAudit } from '../support/accessibility-audit';
import { auditRuntimeStorage } from '../support/runtime-audit';
import {
  assertNoGlobalHorizontalOverflow,
  auditViewport,
} from '../support/viewport-audit';
import {
  AUDIO_PATTERN,
  AUTH_ME_PATTERN,
  CURRENT_PATTERN,
  EVIDENCE_PATTERN,
  IMAGE_PATTERN,
  PATIENT_COMPLETE_PATTERN,
  PAUSE_PATTERN,
  REDO_PATTERN,
  REPLAY_PATTERN,
  RESUME_PATTERN,
  STAFF_COMPLETE_PATTERN,
  STAFF_ROOT_PATTERN,
  TAKEOVER_PATTERN,
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
  safeTestPng,
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

  test('completes all 19 server-authoritative steps with multimedia and staff controls', async ({
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
        .getByRole('checkbox', { name: '患者已当面告知本机准备与不计分练习完成' })
        .check();
      const preparationResponsePromise = waitForPost(
        staffPage,
        '/preparation/confirm',
      );
      await staffPage.getByRole('button', { name: '确认准备与影响因素' }).click();
      expect((await preparationResponsePromise).status()).toBe(200);

      await waitForStep(patientPage, 1);
      expect((await runAccessibilityAudit(patientPage)).violationCount).toBe(0);
      assertNoGlobalHorizontalOverflow(
        await auditViewport(patientPage, { width: 390, height: 844 }),
      );
      await recordAndSaveSpeech(patientPage);
      await expect(
        patientPage.getByRole('button', { name: '再听一遍指导语' }),
      ).toBeVisible();
      await expect(
        patientPage.getByRole('button', { name: /重播|再听一遍测量语音/ }),
      ).toHaveCount(0);
      await completePatientStep(patientPage);

      await waitForStep(patientPage, 2);
      await allowAutoplayIfNeeded(patientPage);
      await expect(
        patientPage.getByRole('button', { name: '开始录音', exact: true }),
      ).toBeEnabled({ timeout: 20_000 });
      await refreshStaff(staffPage);
      await pauseStaff(staffPage, 'F2 第2步由医护接管');
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

      await completeSpeechStep(patientPage, 3);
      await waitForStep(patientPage, 4);
      await allowAutoplayIfNeeded(patientPage);
      await expect(
        patientPage.getByRole('button', { name: '开始录音', exact: true }),
      ).toBeEnabled({ timeout: 20_000 });
      await refreshStaff(staffPage);
      await pauseStaff(staffPage, 'F2 第3步需要重做');
      await staffPage
        .getByLabel('重做原因（必填，最多 500 字）')
        .fill('复核后按规范重做上一完成步骤');
      const redoResponsePromise = waitForPost(staffPage, '/redo-last');
      await staffPage.getByRole('button', { name: '重做上一完成步骤' }).click();
      expect((await redoResponsePromise).status()).toBe(200);
      await resumeStaff(staffPage, '已准备重做第3步');
      await completeSpeechStep(patientPage, 3);

      for (let order = 4; order <= 10; order += 1) {
        await completeSpeechStep(patientPage, order);
      }

      await waitForStep(patientPage, 11);
      await allowAutoplayIfNeeded(patientPage);
      await expect(
        patientPage.getByRole('button', { name: '开始录音', exact: true }),
      ).toBeEnabled({ timeout: 20_000 });
      await refreshStaff(staffPage);
      await pauseStaff(staffPage, '即刻回忆测量语音技术中断');
      await staffPage
        .getByLabel('技术重播原因（必填，最多 500 字）')
        .fill('扬声器短暂中断，需要授权一次技术重播');
      const replayResponsePromise = waitForPost(
        staffPage,
        '/replay-authorize',
      );
      await staffPage.getByRole('button', { name: '授权技术重播' }).click();
      expect((await replayResponsePromise).status()).toBe(200);
      await expect(staffPage.getByText('技术重播已授权，请恢复施测。')).toBeVisible();
      await resumeStaff(staffPage, '技术重播已授权');
      await waitForStep(patientPage, 11);
      await recordAndSaveSpeech(patientPage);
      await completePatientStep(patientPage);

      await completeSpeechStep(patientPage, 12);
      await completeSpeechStep(patientPage, 13);

      await waitForStep(patientPage, 14);
      await recordAndSaveSpeech(patientPage);
      await expect(
        patientPage.getByRole('button', { name: '完成本题并继续' }),
      ).toHaveCount(0);
      await refreshStaff(staffPage);
      await staffPage
        .getByLabel('医护观察（必填，最多 2000 字）')
        .fill('已观察患者完成物品命名');
      let staffCompleteResponsePromise = waitForPost(
        staffPage,
        '/current/complete',
      );
      await staffPage.getByRole('button', { name: '确认医护观察并继续' }).click();
      expect((await staffCompleteResponsePromise).status()).toBe(200);

      await completeSpeechStep(patientPage, 15);

      const audioCountBeforeReading = patient.ledger.count({
        method: 'POST',
        safeUrlPattern: AUDIO_PATTERN,
      });
      await waitForStep(patientPage, 16);
      await expect(
        patientPage.getByRole('heading', { name: '请闭上您的眼睛' }),
      ).toBeVisible();
      await expect(
        patientPage.getByRole('button', { name: '开始录音' }),
      ).toHaveCount(0);
      expect(
        patient.ledger.count({ method: 'POST', safeUrlPattern: AUDIO_PATTERN }),
      ).toBe(audioCountBeforeReading);
      await refreshStaff(staffPage);
      await staffPage
        .getByLabel('医护观察（必填，最多 2000 字）')
        .fill('已观察患者阅读并执行闭眼指令');
      staffCompleteResponsePromise = waitForPost(
        staffPage,
        '/current/complete',
      );
      await staffPage.getByRole('button', { name: '确认医护观察并继续' }).click();
      expect((await staffCompleteResponsePromise).status()).toBe(200);

      const evidenceCountBeforeStep17 = patient.ledger.count({
        method: 'POST',
        safeUrlPattern: EVIDENCE_PATTERN,
      });
      await waitForStep(patientPage, 17);
      await allowAutoplayIfNeeded(patientPage);
      await expect(patientPage.getByText(/等待医护人员完成本步骤/)).toBeVisible({
        timeout: 20_000,
      });
      expect(
        patient.ledger.count({ method: 'POST', safeUrlPattern: EVIDENCE_PATTERN }),
      ).toBe(evidenceCountBeforeStep17);
      await refreshStaff(staffPage);
      await staffPage
        .getByLabel('医护观察（必填，最多 2000 字）')
        .fill('已观察患者完成三步指令');
      staffCompleteResponsePromise = waitForPost(
        staffPage,
        '/current/complete',
      );
      await staffPage.getByRole('button', { name: '确认医护观察并继续' }).click();
      expect((await staffCompleteResponsePromise).status()).toBe(200);

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
      await patientPage.getByRole('button', { name: '保存本题内容' }).click();
      await expect(patientPage.getByText('本题内容已保存')).toBeVisible({
        timeout: 15_000,
      });
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
      const photoEvidenceRequestPromise = patientPage.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === '/patient-administration/current/evidence' &&
          request.method() === 'POST',
      );
      await patientPage.getByRole('button', { name: '保存本题内容' }).click();
      const photoEvidenceRequest = await photoEvidenceRequestPromise;
      expect(photoEvidenceRequest.postData() ?? '').not.toContain(
        'private-local-source-name.png',
      );
      await expect(patientPage.getByText('本题内容已保存')).toBeVisible({
        timeout: 15_000,
      });
      await completePatientStep(patientPage);
      await expect(
        patientPage.getByRole('heading', {
          name: '本次作答已完成，请将设备交还医护人员',
        }),
      ).toBeVisible({ timeout: 15_000 });

      expect((await runAccessibilityAudit(patientPage)).violationCount).toBe(0);
      assertNoGlobalHorizontalOverflow(
        await auditViewport(patientPage, { width: 800, height: 1280 }),
      );
      expect((await runAccessibilityAudit(staffPage)).violationCount).toBe(0);
      assertNoGlobalHorizontalOverflow(
        await auditViewport(staffPage, { width: 1280, height: 800 }),
      );
      const storage = await auditRuntimeStorage(patientPage);
      expect(storage.localStorageKeys).toEqual([]);
      expect(storage.sessionStorageKeys).toEqual([]);
      expect(storage.indexedDbNames).toEqual([]);
      expect(storage.forbiddenValueDetected).toBe(false);
      expect(storage.documentCookieEmpty).toBe(true);
      expect(storage.urlHasSensitiveQueryOrHash).toBe(false);
      const patientText = await patientPage.locator('body').innerText();
      for (const forbidden of [
        descriptor.scenario.patientId,
        descriptor.scenario.visitId,
        descriptor.scenario.scaleInstanceId,
        code,
      ]) {
        expect(patientText).not.toContain(forbidden);
      }
      expect(
        await patientPage.locator('[src^="blob:"]').count(),
      ).toBe(0);
      const patientCookieNames = (
        await patientContext.cookies(environment.backendOrigin)
      ).map(({ name }) => name);
      expect(patientCookieNames).not.toContain('cogmemory_ad_patient_session');

      expect(
        patient.ledger.count({ method: 'POST', safeUrlPattern: AUDIO_PATTERN }),
      ).toBe(24);
      expect(
        patient.ledger.count({ method: 'GET', safeUrlPattern: IMAGE_PATTERN }),
      ).toBe(1);
      expect(
        patient.ledger.count({ method: 'POST', safeUrlPattern: EVIDENCE_PATTERN }),
      ).toBe(17);
      expect(
        patient.ledger.count({
          method: 'POST',
          safeUrlPattern: PATIENT_COMPLETE_PATTERN,
        }),
      ).toBe(16);
      expect(
        staff.ledger.count({ method: 'POST', safeUrlPattern: PAUSE_PATTERN }),
      ).toBe(3);
      expect(
        staff.ledger.count({ method: 'POST', safeUrlPattern: RESUME_PATTERN }),
      ).toBe(3);
      expect(
        staff.ledger.count({ method: 'POST', safeUrlPattern: TAKEOVER_PATTERN }),
      ).toBe(1);
      expect(
        staff.ledger.count({ method: 'POST', safeUrlPattern: REDO_PATTERN }),
      ).toBe(1);
      expect(
        staff.ledger.count({ method: 'POST', safeUrlPattern: REPLAY_PATTERN }),
      ).toBe(1);
      expect(
        staff.ledger.count({
          method: 'POST',
          safeUrlPattern: STAFF_COMPLETE_PATTERN,
        }),
      ).toBe(3);
      assertExactBodyKeys(patient.ledger, AUDIO_PATTERN, ['expectedRevision']);
      assertExactBodyKeys(patient.ledger, PATIENT_COMPLETE_PATTERN, [
        'expectedRevision',
      ]);
      const evidenceEntries = patient.ledger.entries().filter(
        ({ method, safeUrlPattern }) =>
          method === 'POST' && safeUrlPattern === EVIDENCE_PATTERN,
      );
      expect(
        evidenceEntries.filter(({ bodyKeys }) => bodyKeys.includes('durationMs')),
      ).toHaveLength(15);
      expect(
        evidenceEntries.every(({ bodyKeys }) =>
          bodyKeys.every((key) =>
            ['capturedAt', 'durationMs', 'evidenceType', 'expectedRevision', 'file'].includes(
              key,
            ),
          ),
        ),
      ).toBe(true);
      assertNoF3Requests([staff.ledger, patient.ledger]);

      const staffAudit = assertF2BrowserAudit({
        ledger: staff.ledger,
        consoleAudit: staff.consoleAudit,
        expectedHttpFailures: [
          { method: 'GET', status: 401, safeUrlPattern: AUTH_ME_PATTERN },
          { method: 'GET', status: 404, safeUrlPattern: STAFF_ROOT_PATTERN },
        ],
      });
      const patientCurrentUnauthorized = patient.ledger.count({
        method: 'GET',
        safeUrlPattern: CURRENT_PATTERN,
      });
      const patientAudit = assertF2BrowserAudit({
        ledger: patient.ledger,
        consoleAudit: patient.consoleAudit,
        expectedHttpFailures: patient.ledger.entries().some(
          ({ method, status, safeUrlPattern }) =>
            method === 'GET' &&
            status === 401 &&
            safeUrlPattern === CURRENT_PATTERN,
        )
          ? [{ method: 'GET', status: 401, safeUrlPattern: CURRENT_PATTERN }]
          : [],
      });
      invariant(patientCurrentUnauthorized >= 1, 'Patient current polling was not observed');
      expect(staffAudit.unexpectedHttpFailures).toBe(0);
      expect(patientAudit.unexpectedHttpFailures).toBe(0);
      staff.consoleAudit.stop();
      patient.consoleAudit.stop();
    } finally {
      await patientContext.close();
    }
  });
});
