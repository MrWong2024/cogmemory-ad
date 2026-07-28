import type { Page } from '@playwright/test';

import { resolveB11BrowserEnvironment } from '../b11-env';
import {
  B11_NEUTRAL_TEXT,
  runB11CoreRoute,
} from '../b11-core-support';
import { expect, test } from '../../support/acceptance-test';

const environment = resolveB11BrowserEnvironment();

async function openSubmission(page: Page, note: string) {
  await page
    .getByRole('button', { name: '准备提交医生确认', exact: true })
    .click();
  await page
    .getByLabel('提交说明（必填）', { exact: true })
    .fill(note);
}

async function confirmSubmissionCheckbox(page: Page) {
  await page.locator('#clinical-report-submission-confirmed').check();
}

async function openEditAndWrite(page: Page) {
  await page
    .getByRole('button', { name: '编辑临床人员内容', exact: true })
    .click();
  await page
    .getByLabel('医生意见（必填）', { exact: true })
    .fill(B11_NEUTRAL_TEXT.opinionB);
  await page
    .getByLabel('临床人员补充建议（可选）', { exact: true })
    .fill(B11_NEUTRAL_TEXT.recommendationB);
  await page
    .getByLabel('本次编辑审计说明（必填）', { exact: true })
    .fill(B11_NEUTRAL_TEXT.editNoteB);
}

test.describe('B11 core / submission', () => {
  test('submission-success owns B11-28 through B11-32', async ({
    roleContexts,
  }) => {
    test.skip(
      !environment.enabled,
      'B11_BROWSER_ACCEPTANCE_RUN=1 is required',
    );
    if (!environment.enabled) return;

    await runB11CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: 'submission',
          routeKey: 'submission-success',
        },
      },
      async (run) => {
        const session = await run.primary();
        const page = session.page;
        expect(session.latestSafeFacts()).toMatchObject({
          status: 'draft',
          source: 'mixed',
        });
        await page
          .getByRole('button', {
            name: '准备提交医生确认',
            exact: true,
          })
          .click();
        const note = page.getByLabel('提交说明（必填）', { exact: true });
        const checkbox = page.locator('#clinical-report-submission-confirmed');
        const submit = page.getByRole('button', {
          name: '确认提交待医生确认',
          exact: true,
        });
        await note.fill('aa');
        await expect(submit).toBeDisabled();
        await expect(
          page.getByText('提交说明需为 3–2000 个字符。', { exact: true }),
        ).toBeVisible();
        await note.fill(B11_NEUTRAL_TEXT.submissionNoteA);
        await expect(checkbox).not.toBeChecked();
        await expect(submit).toBeDisabled();
        await checkbox.check();
        await expect(submit).toBeEnabled();

        const result = await session.performAction('submit', () =>
          submit.click(),
        );
        expect(result.status).toBe(200);
        expect(result.facts).toMatchObject({
          status: 'pending_confirmation',
          source: 'mixed',
          submissionReceiptPresent: true,
          alreadySubmitted: false,
        });
        expect(session.actionRequestEvidence('submit')).toEqual([
          {
            action: 'submit',
            bodyKeys: ['confirm', 'expectedUpdatedAt', 'submissionNote'],
            expectedUpdatedAtMatchesLatest: true,
            confirmIsTrue: true,
          },
        ]);
        await expect(
          page.getByText('待医生确认', { exact: true }).first(),
        ).toBeVisible();
        await expect(
          page.getByRole('heading', { name: '提交摘要', exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', {
            name: '编辑临床人员内容',
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          page.getByRole('button', {
            name: '准备提交医生确认',
            exact: true,
          }),
        ).toHaveCount(0);
      },
    );
  });

  test('submission-already-submitted owns B11-33 through B11-35', async ({
    roleContexts,
  }) => {
    test.skip(
      !environment.enabled,
      'B11_BROWSER_ACCEPTANCE_RUN=1 is required',
    );
    if (!environment.enabled) return;
    test.setTimeout(90_000);

    await runB11CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: 'submission',
          routeKey: 'submission-already-submitted',
        },
      },
      async (run) => {
        const primary = await run.primary();
        const secondary = await run.secondary();
        expect(primary.page.context()).not.toBe(secondary.page.context());
        await openSubmission(primary.page, B11_NEUTRAL_TEXT.submissionNoteA);
        await confirmSubmissionCheckbox(primary.page);
        await openSubmission(
          secondary.page,
          B11_NEUTRAL_TEXT.submissionNoteB,
        );
        await confirmSubmissionCheckbox(secondary.page);

        const first = await secondary.performAction('submit', () =>
          secondary.page
            .getByRole('button', {
              name: '确认提交待医生确认',
              exact: true,
            })
            .click(),
        );
        expect(first.status).toBe(200);
        expect(first.facts.alreadySubmitted).toBe(false);

        const repeated = await primary.performAction('submit', () =>
          primary.page
            .getByRole('button', {
              name: '确认提交待医生确认',
              exact: true,
            })
            .click(),
        );
        expect(repeated.status).toBe(200);
        expect(repeated.facts).toMatchObject({
          status: 'pending_confirmation',
          submissionReceiptPresent: true,
          alreadySubmitted: true,
        });
        await expect(
          primary.page.getByText(
            '该报告此前已经提交，本次未重复写入。',
            { exact: true },
          ),
        ).toBeVisible();
        expect(primary.actionRequestEvidence('submit')).toHaveLength(1);
        expect(secondary.actionRequestEvidence('submit')).toHaveLength(1);
        await expect(
          primary.page.getByRole('button', {
            name: '准备提交医生确认',
            exact: true,
          }),
        ).toHaveCount(0);
      },
    );
  });

  test('submission-conflict owns B11-36 and B11-37', async ({
    roleContexts,
  }) => {
    test.skip(
      !environment.enabled,
      'B11_BROWSER_ACCEPTANCE_RUN=1 is required',
    );
    if (!environment.enabled) return;
    test.setTimeout(90_000);

    await runB11CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: 'submission',
          routeKey: 'submission-conflict',
        },
      },
      async (run) => {
        const primary = await run.primary();
        const secondary = await run.secondary();
        expect(primary.page.context()).not.toBe(secondary.page.context());
        await openSubmission(primary.page, B11_NEUTRAL_TEXT.submissionNoteA);
        await confirmSubmissionCheckbox(primary.page);
        await openEditAndWrite(secondary.page);

        const edit = await secondary.performAction('edit', () =>
          secondary.page
            .getByRole('button', {
              name: '保存受控编辑',
              exact: true,
            })
            .click(),
        );
        expect(edit.status).toBe(200);

        const conflict = await primary.performAction('submit', () =>
          primary.page
            .getByRole('button', {
              name: '确认提交待医生确认',
              exact: true,
            })
            .click(),
        );
        expect(conflict.status).toBe(409);
        await primary.waitForLatestCount(2);
        await expect(
          primary.page.getByText('提交表单已过期', { exact: true }),
        ).toBeVisible();
        await expect(
          primary.page.getByLabel('提交说明（必填）', { exact: true }),
        ).toHaveValue(B11_NEUTRAL_TEXT.submissionNoteA);
        await expect(
          primary.page.locator('#clinical-report-submission-confirmed'),
        ).not.toBeChecked();
        await expect(
          primary.page.getByRole('button', {
            name: '确认提交待医生确认',
            exact: true,
          }),
        ).toBeDisabled();
        expect(primary.actionRequestEvidence('submit')).toHaveLength(1);
        expect(secondary.actionRequestEvidence('edit')).toHaveLength(1);
        await primary.page
          .getByRole('button', { name: '取消', exact: true })
          .click();
      },
    );
  });
});
