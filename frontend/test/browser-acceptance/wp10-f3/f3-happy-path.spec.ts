import type { Locator, Page } from '@playwright/test';

import { test, expect } from '../support/acceptance-test';
import { auditRuntimeStorage } from '../support/runtime-audit';
import {
  A14_PATTERN,
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

async function revealEvidence(panel: Locator, evidenceId: string) {
  const evidence = panel.getByTestId(
    `patient-administration-review-evidence-${evidenceId}`,
  );
  const details = evidence.locator('xpath=ancestor::details[1]');
  await expect(details).toHaveCount(1);
  if ((await details.getAttribute('open')) === null) {
    await details.locator('summary').first().click();
  }
  await expect(evidence).toBeVisible();
  return evidence;
}

async function clickFor200(
  page: Page,
  action: Locator,
  method: string,
  pathSuffix: string,
) {
  const response = waitForBackendResponse({ page, method, pathSuffix });
  await action.click();
  expect((await response).status()).toBe(200);
}

async function viewEvidence(
  page: Page,
  panel: Locator,
  evidence: Locator,
  evidenceId: string,
  mediaType: 'audio' | 'image',
) {
  await clickFor200(
    page,
    evidence.getByTestId(`patient-administration-review-view-${evidenceId}`),
    'GET',
    `/${evidenceId}/access-url`,
  );
  const viewer = panel.getByTestId('patient-administration-review-viewer');
  const media = viewer.getByTestId(`patient-administration-review-${mediaType}`);
  await expect(viewer).toBeVisible();
  await expect(media).toBeVisible();
  await expect(media).toHaveAttribute('src', /.+/);
  await viewer.getByTestId('patient-administration-review-viewer-close').click();
  await expect(viewer).toHaveCount(0);
}

test.describe('WP-10 F3 thin Browser golden path', () => {
  test.skip(!environment, 'Explicit live Browser acceptance environment is required');

  test('wires review actions, formal answer, readiness, and A16', async ({ roleContexts }) => {
    test.setTimeout(120_000);
    invariant(environment, 'Live environment is unavailable');
    const descriptor = await readF3Descriptor();
    const { scenario } = descriptor;
    const {
      audioEvidenceId: audioId,
      adoptionEvidenceId: adoptionId,
      readingItemResponseId: readingId,
    } = scenario;
    const staff = await loginF3Staff({
      factory: roleContexts,
      descriptor,
      password: requireF3Secret(),
      environment,
    });
    const page = staff.roleContext.page;
    const { ledger } = staff;
    const mutationCount = (method: 'POST' | 'PATCH', pattern: string) =>
      ledger.count({ method, safeUrlPattern: pattern });
    await openF3Execution({ page, descriptor, environment });
    const panel = page.getByTestId('patient-administration-review-panel');

    const audioEvidence = await revealEvidence(panel, audioId);
    const transcribeAction = audioEvidence.getByTestId(
      `patient-administration-review-transcribe-${audioId}`,
    );
    const candidate = audioEvidence.getByTestId(
      'patient-administration-transcription-candidate',
    );
    await expect(transcribeAction).toBeVisible();
    await expect(transcribeAction).toBeEnabled();
    const candidateBefore = await candidate.textContent();
    const transcribeBefore = mutationCount('POST', TRANSCRIBE_PATTERN);
    const a14BeforeTranscribe = mutationCount('PATCH', A14_PATTERN);
    await clickFor200(
      page,
      transcribeAction,
      'POST',
      `/${audioId}/transcribe`,
    );
    await expect(candidate).toBeVisible();
    const candidateAfter = await candidate.textContent();
    expect(candidateAfter?.trim()).toBeTruthy();
    expect(candidateAfter).not.toBe(candidateBefore);
    expect(mutationCount('POST', TRANSCRIBE_PATTERN)).toBe(transcribeBefore + 1);
    expect(mutationCount('PATCH', A14_PATTERN)).toBe(a14BeforeTranscribe);

    await viewEvidence(page, panel, audioEvidence, audioId, 'audio');

    const adoptionEvidence = await revealEvidence(panel, adoptionId);
    await viewEvidence(page, panel, adoptionEvidence, adoptionId, 'image');

    const adoptAction = adoptionEvidence.getByTestId(
      `patient-administration-review-adopt-${adoptionId}`,
    );
    await expect(adoptAction).toBeVisible();
    await expect(adoptAction).toBeEnabled();
    const adoptBefore = mutationCount('POST', ADOPT_PATTERN);
    const a14BeforeAdopt = mutationCount('PATCH', A14_PATTERN);
    await clickFor200(
      page,
      adoptAction,
      'POST',
      `/${adoptionId}/adopt`,
    );
    expect(mutationCount('POST', ADOPT_PATTERN)).toBe(adoptBefore + 1);
    expect(mutationCount('PATCH', A14_PATTERN)).toBe(a14BeforeAdopt);

    const readingItem = panel.getByTestId(
      'patient-administration-review-item-mmse.language.reading_command',
    );
    await readingItem.scrollIntoViewIfNeeded();
    const editor = readingItem.locator(`#submission-item-${readingId}`);
    await expect(readingItem).toBeVisible();
    await expect(editor).toBeVisible();
    const readingAnswer = editor.getByLabel('原始布尔记录');
    const saveAnswered = editor.getByRole('button', {
      name: '保存并标记本题完成',
      exact: true,
    });
    await readingAnswer.selectOption('true');
    const a14BeforeSave = mutationCount('PATCH', A14_PATTERN);
    await clickFor200(
      page,
      saveAnswered,
      'PATCH',
      `/item-responses/${readingId}`,
    );
    expect(mutationCount('PATCH', A14_PATTERN)).toBe(a14BeforeSave + 1);

    await clickFor200(
      page,
      page.getByTestId('scale-instance-submission-prepare-action'),
      'GET',
      '/submission-readiness',
    );
    const confirmation = page.locator('#confirm-scale-instance-submission');
    await expect(confirmation).toBeEnabled();
    await confirmation.check();
    const submitAction = page.getByTestId('scale-instance-submission-confirm-action');
    await expect(submitAction).toBeEnabled();
    const submitBefore = mutationCount('POST', SUBMIT_PATTERN);
    await clickFor200(page, submitAction, 'POST', '/submit');
    expect(mutationCount('POST', SUBMIT_PATTERN)).toBe(submitBefore + 1);

    await expect(page.getByTestId('scale-instance-submission-receipt')).toBeVisible();
    await expect(panel).toBeVisible();
    await expect(readingItem).toBeVisible();
    await expect(readingAnswer).toBeDisabled();
    await expect(editor.getByRole('button', { name: /^保存/ }).first()).toBeDisabled();

    ledger.assertNoAutomaticRetry({ method: 'POST', safeUrlPattern: TRANSCRIBE_PATTERN }, transcribeBefore + 1);
    ledger.assertNoAutomaticRetry({ method: 'POST', safeUrlPattern: ADOPT_PATTERN }, adoptBefore + 1);
    ledger.assertNoAutomaticRetry({ method: 'PATCH', safeUrlPattern: A14_PATTERN }, a14BeforeSave + 1);
    ledger.assertNoAutomaticRetry({ method: 'POST', safeUrlPattern: SUBMIT_PATTERN }, submitBefore + 1);
    const storage = await auditRuntimeStorage(page);
    expect(storage.forbiddenValueDetected).toBe(false);
    expect(storage.documentCookieForbiddenPatternDetected).toBe(false);
    expect(storage.urlHasSensitiveQueryOrHash).toBe(false);
    expect(assertF3BrowserAudit({
      ledger,
      consoleAudit: staff.consoleAudit,
      allowedHttpFailures: [
        { method: 'GET', status: 401, safeUrlPattern: AUTH_ME_PATTERN },
        { method: 'GET', status: 404, safeUrlPattern: SCORE_RESULT_PATTERN },
      ],
    })).toMatchObject({
      unexpectedConsoleErrors: 0,
      pageErrors: 0,
      unexpectedHttpFailures: 0,
      unexpectedTransportFailures: 0,
    });
    staff.consoleAudit.stop();
  });
});
