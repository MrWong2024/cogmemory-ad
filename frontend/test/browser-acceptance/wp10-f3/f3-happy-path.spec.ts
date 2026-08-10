import { test, expect } from '../support/acceptance-test';
import { auditRuntimeStorage } from '../support/runtime-audit';
import {
  A14_PATTERN,
  ACCESS_PATTERN,
  ADOPT_PATTERN,
  AUTH_ME_PATTERN,
  READINESS_PATTERN,
  REVIEW_PATTERN,
  SCORE_RESULT_PATTERN,
  SUBMIT_PATTERN,
  TRANSCRIBE_PATTERN,
  assertExactMutationBodyKeys,
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
    await expect(panel.getByText('19 个施测步骤', { exact: true })).toBeVisible();
    await expect(
      panel.getByText('视力、听力或其他感觉因素', { exact: true }),
    ).toBeVisible();
    await expect(panel.getByText('设备或网络因素', { exact: true })).toBeVisible();
    await expect(panel.getByText('患者录音', { exact: true })).toHaveCount(15);
    await expect(panel.getByText('患者照片', { exact: true })).toHaveCount(1);
    await expect(
      panel.getByText('患者手写 / 绘图', { exact: true }),
    ).toHaveCount(1);
    await expect(
      panel.getByTestId(/^patient-administration-review-step-/),
    ).toHaveCount(19);
    await expect(
      panel.getByText(
        '本次正常施测未记录暂停、接管、重做等复核相关控制事件。',
        { exact: true },
      ),
    ).toBeVisible();

    const readingReviewItem = panel.getByTestId(
      'patient-administration-review-item-mmse.language.reading_command',
    );
    await expect(
      readingReviewItem.getByText('医护现场观察', { exact: true }),
    ).toBeVisible();
    await expect(readingReviewItem.getByText('草稿中', { exact: true })).toBeVisible();
    await expect(
      readingReviewItem.getByText('草稿修订 2', { exact: true }),
    ).toBeVisible();
    await expect(
      readingReviewItem.getByText('现场医护观察', { exact: true }),
    ).toHaveCount(0);

    expect(
      staff.ledger.count({ method: 'GET', safeUrlPattern: REVIEW_PATTERN }),
    ).toBe(1);
    expect(
      staff.ledger.count({ method: 'POST', safeUrlPattern: TRANSCRIBE_PATTERN }),
    ).toBe(0);
    expect(
      staff.ledger.count({ method: 'GET', safeUrlPattern: ACCESS_PATTERN }),
    ).toBe(0);
    expect(
      staff.ledger.count({ method: 'POST', safeUrlPattern: ADOPT_PATTERN }),
    ).toBe(0);
    await page.waitForTimeout(1_000);
    expect(
      staff.ledger.count({ method: 'GET', safeUrlPattern: REVIEW_PATTERN }),
    ).toBe(1);

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
    await expect(
      audioEvidence.getByText('测试转写候选', { exact: true }),
    ).toBeVisible();
    await expect(
      audioEvidence.getByText('辅助转写不是正式答案，请由医护人员核对。', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      staff.ledger.count({ method: 'POST', safeUrlPattern: TRANSCRIBE_PATTERN }),
    ).toBe(1);
    expect(staff.ledger.count({ method: 'PATCH', safeUrlPattern: A14_PATTERN })).toBe(
      0,
    );

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
    await expect(audio).toBeVisible();
    await expect(audio).toHaveAttribute('preload', 'none');
    const viewerSource = await audio.getAttribute('src');
    invariant(
      viewerSource?.startsWith('https://fake-storage.local/') === true,
      'Fake storage URL was not bound to the audio viewer',
    );
    expect(
      staff.ledger.count({ method: 'GET', safeUrlPattern: ACCESS_PATTERN }),
    ).toBe(1);
    await viewer.getByRole('button', { name: '关闭查看器', exact: true }).click();
    await expect(viewer).toHaveCount(0);

    const adoptionEvidence = panel.getByTestId(
      `patient-administration-review-evidence-${descriptor.scenario.adoptionEvidenceId}`,
    );
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
    await expect(
      adoptionEvidence.getByText(
        '已采用同一个患者证据并更新正式证据要求；没有复制文件，也没有形成或确认答案。',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByText('检查结果已过期', { exact: true })).toBeVisible();
    expect(
      staff.ledger.count({ method: 'POST', safeUrlPattern: ADOPT_PATTERN }),
    ).toBe(1);
    expect(staff.ledger.count({ method: 'PATCH', safeUrlPattern: A14_PATTERN })).toBe(
      0,
    );

    const drawingReviewItem = panel.getByTestId(
      'patient-administration-review-item-mmse.visuospatial.copy_drawing',
    );
    await drawingReviewItem
      .getByRole('button', { name: '定位正式作答', exact: true })
      .click();
    const drawingEditorAnchor = page.locator(
      `#submission-item-${descriptor.scenario.adoptionItemResponseId}`,
    );
    await expect(drawingEditorAnchor).toBeFocused();
    await expect(
      drawingEditorAnchor.getByText('服务端标识：已关联', { exact: true }),
    ).toBeVisible();

    await readingReviewItem
      .getByRole('button', { name: '定位正式作答', exact: true })
      .click();
    const readingEditorAnchor = page.locator(
      `#submission-item-${descriptor.scenario.readingItemResponseId}`,
    );
    await expect(readingEditorAnchor).toBeFocused();
    await expect(
      page.getByRole('heading', { name: '语言', exact: true }),
    ).toBeVisible();
    const readingAnswer = readingEditorAnchor.getByLabel('原始布尔记录');
    const markReadingAnswered = readingEditorAnchor.getByRole('button', {
      name: '保存并标记本题完成',
      exact: true,
    });
    await markReadingAnswered.scrollIntoViewIfNeeded();
    await expect(markReadingAnswered).toBeEnabled();
    const a14ResponsePromise = waitForBackendResponse({
      page,
      method: 'PATCH',
      pathSuffix: `/item-responses/${descriptor.scenario.readingItemResponseId}`,
    });
    await readingAnswer.selectOption('true');
    await markReadingAnswered.click();
    expect((await a14ResponsePromise).status()).toBe(200);
    await expect(
      readingEditorAnchor.getByText(/^已保存：/),
    ).toBeVisible();
    await expect(
      readingEditorAnchor.getByText('有未保存修改', { exact: true }),
    ).toHaveCount(0);
    expect(staff.ledger.count({ method: 'PATCH', safeUrlPattern: A14_PATTERN })).toBe(
      1,
    );

    const readinessResponsePromise = waitForBackendResponse({
      page,
      method: 'GET',
      pathSuffix: '/submission-readiness',
    });
    await page
      .getByRole('button', { name: '检查并准备提交', exact: true })
      .click();
    expect((await readinessResponsePromise).status()).toBe(200);
    await expect(page.getByText('完整性：已通过', { exact: true })).toBeVisible();
    await expect(page.getByText('当前可提交：是', { exact: true })).toBeVisible();
    await expect(page.getByText('阻断问题（0）', { exact: true })).toBeVisible();
    await expect(
      page.getByText('检查结果为最新', { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel('我已核对以上影响，并确认正式提交该量表实例。')
      .check();
    const submitResponsePromise = waitForBackendResponse({
      page,
      method: 'POST',
      pathSuffix: '/submit',
    });
    const scoreLookupResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/score-results/latest') &&
        response.request().method() === 'GET',
    );
    await page
      .getByRole('button', { name: '确认正式提交', exact: true })
      .click();
    expect((await submitResponsePromise).status()).toBe(200);
    expect((await scoreLookupResponsePromise).status()).toBe(404);
    await expect(page.getByText('提交成功', { exact: true })).toBeVisible();
    await expect(page.getByText('只读查看', { exact: true })).toBeVisible();
    await expect(
      panel.getByRole('heading', { name: '患者施测复核', exact: true }),
    ).toBeVisible();
    await expect(
      audioEvidence.getByRole('button', { name: '辅助转写已完成', exact: true }),
    ).toBeDisabled();
    await expect(
      adoptionEvidence.getByRole('button', { name: '患者证据已采用', exact: true }),
    ).toBeDisabled();
    await expect(
      panel.getByText(/复核摘要和原始证据仍可读取，但辅助转写与证据采用已禁用。/),
    ).toBeVisible();

    staff.ledger.assertNoAutomaticRetry(
      { method: 'POST', safeUrlPattern: TRANSCRIBE_PATTERN },
      1,
    );
    staff.ledger.assertNoAutomaticRetry(
      { method: 'POST', safeUrlPattern: ADOPT_PATTERN },
      1,
    );
    staff.ledger.assertNoPolling(
      { method: 'GET', safeUrlPattern: REVIEW_PATTERN },
      1,
    );
    expect(
      staff.ledger.count({ method: 'GET', safeUrlPattern: REVIEW_PATTERN }),
    ).toBe(1);
    expect(
      staff.ledger.count({ method: 'POST', safeUrlPattern: TRANSCRIBE_PATTERN }),
    ).toBe(1);
    expect(
      staff.ledger.count({ method: 'GET', safeUrlPattern: ACCESS_PATTERN }),
    ).toBe(1);
    expect(
      staff.ledger.count({ method: 'POST', safeUrlPattern: ADOPT_PATTERN }),
    ).toBe(1);
    expect(staff.ledger.count({ method: 'PATCH', safeUrlPattern: A14_PATTERN })).toBe(
      1,
    );
    expect(
      staff.ledger.count({ method: 'POST', safeUrlPattern: SUBMIT_PATTERN }),
    ).toBe(1);
    expect(
      staff.ledger.count({ method: 'GET', safeUrlPattern: READINESS_PATTERN }),
    ).toBeGreaterThanOrEqual(2);
    const unexpectedDownstreamWrites = staff.ledger
      .entries()
      .filter(
        (entry) =>
          ['POST', 'PATCH', 'PUT', 'DELETE'].includes(entry.method) &&
          /\/score-results|\/cognitive-domain|\/reports/.test(
            entry.safeUrlPattern,
          ),
      );
    expect(unexpectedDownstreamWrites).toHaveLength(0);
    assertExactMutationBodyKeys(staff.ledger, TRANSCRIBE_PATTERN, []);
    assertExactMutationBodyKeys(staff.ledger, ADOPT_PATTERN, []);
    assertExactMutationBodyKeys(staff.ledger, A14_PATTERN, [
      'expectedRevision',
      'markAsAnswered',
      'rawResponse',
    ]);
    assertExactMutationBodyKeys(staff.ledger, SUBMIT_PATTERN, ['confirm']);

    const storage = await auditRuntimeStorage(page);
    expect(storage.localStorageKeys).toEqual([]);
    expect(storage.sessionStorageKeys).toEqual([]);
    expect(storage.indexedDbNames).toEqual([]);
    expect(storage.forbiddenValueDetected).toBe(false);
    expect(storage.documentCookieForbiddenPatternDetected).toBe(false);
    expect(storage.urlHasSensitiveQueryOrHash).toBe(false);

    const browserAudit = assertF3BrowserAudit({
      ledger: staff.ledger,
      consoleAudit: staff.consoleAudit,
      expectedHttpFailures: [
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
