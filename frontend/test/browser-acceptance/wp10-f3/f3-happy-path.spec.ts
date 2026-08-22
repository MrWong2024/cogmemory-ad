import { test, expect } from '../support/acceptance-test';
import { auditRuntimeStorage } from '../support/runtime-audit';
import {
  A14_PATTERN,
  ACCESS_PATTERN,
  ADOPT_PATTERN,
  AUTH_ME_PATTERN,
  SCORE_RESULT_PATTERN,
  SUBMIT_PATTERN,
  TRANSCRIBE_PATTERN,
  assertF3BrowserAudit,
  invariant,
  loginF3Staff,
  openF3Execution,
  readF3Descriptor,
  requireF3Secret,
  resolveF3Environment,
  waitForBackendResponse,
} from './support/wp10-f3-support';

const environment = resolveF3Environment();

test.describe('WP-10 F3 normal patient administration review', () => {
  test.skip(!environment, 'Explicit live Browser acceptance environment is required');

  test('reviews, transcribes, adopts, records the observation, and submits through existing chains', async ({
    roleContexts,
  }) => {
    test.setTimeout(120_000);
    invariant(environment, 'Live environment is unavailable');
    const descriptor = await readF3Descriptor();
    const password = requireF3Secret();
    const staff = await loginF3Staff({
      factory: roleContexts,
      descriptor,
      password,
      environment,
    });
    const page = staff.roleContext.page;
    await openF3Execution({ page, descriptor, environment });

    const panel = page.getByTestId('patient-administration-review-panel');
    await expect(panel).toBeVisible();
    const transcribeMutationCountBefore = staff.ledger.count({
      method: 'POST',
      safeUrlPattern: TRANSCRIBE_PATTERN,
    });
    const a14MutationCountBeforeTranscription = staff.ledger.count({
      method: 'PATCH',
      safeUrlPattern: A14_PATTERN,
    });
    expect(
      staff.ledger.count({ method: 'POST', safeUrlPattern: TRANSCRIBE_PATTERN }),
    ).toBe(0);
    expect(
      staff.ledger.count({ method: 'GET', safeUrlPattern: ACCESS_PATTERN }),
    ).toBe(0);
    expect(
      staff.ledger.count({ method: 'POST', safeUrlPattern: ADOPT_PATTERN }),
    ).toBe(0);

    const audioEvidence = panel.getByTestId(
      `patient-administration-review-evidence-${descriptor.scenario.audioEvidenceId}`,
    );
    const transcribeResponsePromise = waitForBackendResponse({
      page,
      method: 'POST',
      pathSuffix: `/${descriptor.scenario.audioEvidenceId}/transcribe`,
    });
    await audioEvidence
      .getByRole('button', { name: '生成辅助转写', exact: true })
      .click();
    expect((await transcribeResponsePromise).status()).toBe(200);
    const transcriptionCandidate = audioEvidence.getByTestId(
      'patient-administration-transcription-candidate',
    );
    await expect(transcriptionCandidate).toBeVisible();
    await expect(transcriptionCandidate).not.toHaveText('尚未请求辅助转写');
    expect(
      staff.ledger.count({ method: 'POST', safeUrlPattern: TRANSCRIBE_PATTERN }),
    ).toBe(transcribeMutationCountBefore + 1);
    expect(
      staff.ledger.count({ method: 'PATCH', safeUrlPattern: A14_PATTERN }),
    ).toBe(a14MutationCountBeforeTranscription);

    const accessResponsePromise = waitForBackendResponse({
      page,
      method: 'GET',
      pathSuffix: `/${descriptor.scenario.audioEvidenceId}/access-url`,
    });
    await audioEvidence
      .getByRole('button', { name: '查看原始证据', exact: true })
      .click();
    expect((await accessResponsePromise).status()).toBe(200);
    const viewer = panel.getByTestId('patient-administration-review-viewer');
    const audio = viewer.getByTestId('patient-administration-review-audio');
    await expect(viewer).toBeVisible();
    await expect(audio).toBeVisible();
    await expect(audio).toHaveAttribute('src', /.+/);
    await viewer.getByRole('button', { name: '关闭查看器', exact: true }).click();
    await expect(viewer).toHaveCount(0);

    const adoptionEvidence = panel.getByTestId(
      `patient-administration-review-evidence-${descriptor.scenario.adoptionEvidenceId}`,
    );
    const imageAccessResponsePromise = waitForBackendResponse({
      page,
      method: 'GET',
      pathSuffix: `/${descriptor.scenario.adoptionEvidenceId}/access-url`,
    });
    await adoptionEvidence
      .getByRole('button', { name: '查看原始证据', exact: true })
      .click();
    expect((await imageAccessResponsePromise).status()).toBe(200);
    await expect(viewer).toBeVisible();
    const image = viewer.getByTestId('patient-administration-review-image');
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('src', /.+/);
    await viewer.getByRole('button', { name: '关闭查看器', exact: true }).click();
    await expect(viewer).toHaveCount(0);

    const adoptMutationCountBefore = staff.ledger.count({
      method: 'POST',
      safeUrlPattern: ADOPT_PATTERN,
    });
    const a14MutationCountBeforeAdoption = staff.ledger.count({
      method: 'PATCH',
      safeUrlPattern: A14_PATTERN,
    });
    const adoptResponsePromise = waitForBackendResponse({
      page,
      method: 'POST',
      pathSuffix: `/${descriptor.scenario.adoptionEvidenceId}/adopt`,
    });
    await adoptionEvidence
      .getByRole('button', {
        name: '采用到正式题目证据',
        exact: true,
      })
      .click();
    expect((await adoptResponsePromise).status()).toBe(200);
    expect(
      staff.ledger.count({ method: 'POST', safeUrlPattern: ADOPT_PATTERN }),
    ).toBe(adoptMutationCountBefore + 1);
    expect(
      staff.ledger.count({ method: 'PATCH', safeUrlPattern: A14_PATTERN }),
    ).toBe(a14MutationCountBeforeAdoption);

    const readingReviewItem = panel.getByTestId(
      'patient-administration-review-item-mmse.language.reading_command',
    );
    await readingReviewItem
      .getByRole('button', { name: '定位正式作答', exact: true })
      .click();
    const readingEditorAnchor = page.locator(
      `#submission-item-${descriptor.scenario.readingItemResponseId}`,
    );
    await expect(readingEditorAnchor).toBeFocused();
    const readingAnswer = readingEditorAnchor.getByLabel('原始布尔记录');
    const markReadingAnswered = readingEditorAnchor.getByRole('button', {
      name: '保存并标记本题完成',
      exact: true,
    });
    await markReadingAnswered.scrollIntoViewIfNeeded();
    await expect(markReadingAnswered).toBeEnabled();
    const a14MutationCountBeforeSave = staff.ledger.count({
      method: 'PATCH',
      safeUrlPattern: A14_PATTERN,
    });
    const a14ResponsePromise = waitForBackendResponse({
      page,
      method: 'PATCH',
      pathSuffix: `/item-responses/${descriptor.scenario.readingItemResponseId}`,
    });
    await readingAnswer.selectOption('true');
    await markReadingAnswered.click();
    expect((await a14ResponsePromise).status()).toBe(200);
    expect(
      staff.ledger.count({ method: 'PATCH', safeUrlPattern: A14_PATTERN }),
    ).toBe(a14MutationCountBeforeSave + 1);

    const readinessResponsePromise = waitForBackendResponse({
      page,
      method: 'GET',
      pathSuffix: '/submission-readiness',
    });
    await page
      .getByRole('button', { name: '检查并准备提交', exact: true })
      .click();
    expect((await readinessResponsePromise).status()).toBe(200);
    await expect(page.getByText('当前可提交：是', { exact: true })).toBeVisible();
    const submissionConfirmation = page.getByLabel(
      '我已核对以上影响，并确认正式提交该量表实例。',
    );
    await expect(submissionConfirmation).toBeEnabled();
    await submissionConfirmation.check();
    const submitButton = page.getByRole('button', {
      name: '确认正式提交',
      exact: true,
    });
    await expect(submitButton).toBeEnabled();
    const submitMutationCountBefore = staff.ledger.count({
      method: 'POST',
      safeUrlPattern: SUBMIT_PATTERN,
    });
    const submitResponsePromise = waitForBackendResponse({
      page,
      method: 'POST',
      pathSuffix: '/submit',
    });
    await submitButton.click();
    expect((await submitResponsePromise).status()).toBe(200);
    expect(
      staff.ledger.count({ method: 'POST', safeUrlPattern: SUBMIT_PATTERN }),
    ).toBe(submitMutationCountBefore + 1);
    await expect(panel).toBeVisible();
    await expect(readingReviewItem).toBeVisible();
    await expect(readingAnswer).toBeDisabled();
    await expect(
      readingEditorAnchor.getByRole('button', { name: /^保存/ }).first(),
    ).toBeDisabled();
    await expect(
      audioEvidence.getByRole('button', { name: '辅助转写已完成', exact: true }),
    ).toBeDisabled();
    await expect(
      adoptionEvidence.getByRole('button', { name: '患者证据已采用', exact: true }),
    ).toBeDisabled();

    staff.ledger.assertNoAutomaticRetry(
      { method: 'POST', safeUrlPattern: TRANSCRIBE_PATTERN },
      transcribeMutationCountBefore + 1,
    );
    staff.ledger.assertNoAutomaticRetry(
      { method: 'POST', safeUrlPattern: ADOPT_PATTERN },
      adoptMutationCountBefore + 1,
    );
    staff.ledger.assertNoAutomaticRetry(
      { method: 'PATCH', safeUrlPattern: A14_PATTERN },
      a14MutationCountBeforeSave + 1,
    );
    staff.ledger.assertNoAutomaticRetry(
      { method: 'POST', safeUrlPattern: SUBMIT_PATTERN },
      submitMutationCountBefore + 1,
    );

    const storage = await auditRuntimeStorage(page);
    expect(storage.forbiddenValueDetected).toBe(false);
    expect(storage.documentCookieForbiddenPatternDetected).toBe(false);
    expect(storage.urlHasSensitiveQueryOrHash).toBe(false);

    const browserAudit = assertF3BrowserAudit({
      ledger: staff.ledger,
      consoleAudit: staff.consoleAudit,
      allowedHttpFailures: [
        { method: 'GET', status: 401, safeUrlPattern: AUTH_ME_PATTERN },
        {
          method: 'GET',
          status: 404,
          safeUrlPattern: SCORE_RESULT_PATTERN,
        },
      ],
    });
    expect(browserAudit.unexpectedConsoleErrors).toBe(0);
    expect(browserAudit.pageErrors).toBe(0);
    expect(browserAudit.unexpectedHttpFailures).toBe(0);
    expect(browserAudit.unexpectedTransportFailures).toBe(0);
    staff.consoleAudit.stop();
  });
});
