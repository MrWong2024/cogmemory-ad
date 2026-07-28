import type { Page } from '@playwright/test';

import { resolveB11BrowserEnvironment } from '../b11-env';
import {
  B11_NEUTRAL_TEXT,
  coordinateConfirmationConflictStage,
  runB11CoreRoute,
} from '../b11-core-support';
import { expect, test } from '../../support/acceptance-test';

const environment = resolveB11BrowserEnvironment();

async function openConfirmation(page: Page, note: string) {
  await page
    .getByRole('button', { name: '准备确认报告', exact: true })
    .click();
  await page
    .getByLabel('最终确认意见（必填）', { exact: true })
    .fill(note);
}

async function checkConfirmation(page: Page) {
  await page.locator('#clinical-report-confirmation-confirmed').check();
}

async function assertWeakConfirmationTrace(page: Page) {
  const confirmationSummary = page
    .getByRole('heading', { name: '确认摘要', exact: true })
    .locator('..');
  const traceRow = confirmationSummary
    .getByText('技术追溯号', { exact: true })
    .locator('..');
  await expect(traceRow).toBeVisible();
  const tracePresentation = await traceRow.locator('dd').evaluate((node) => ({
    hasValue: (node.textContent ?? '').trim().length > 0,
    visuallyMuted: node.className.includes('cma-muted'),
  }));
  expect(tracePresentation).toEqual({ hasValue: true, visuallyMuted: true });
}

test.describe('B11 core / confirmation', () => {
  test('confirmation-role-visibility owns B11-38 and role evidence for B11-41', async ({
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
          scenarioKey: 'confirmation',
          routeKey: 'confirmation-role-visibility',
        },
      },
      async (run) => {
        const nurse = await run.primary();
        const researchAssistant = await run.secondary();
        expect(nurse.page.context()).not.toBe(
          researchAssistant.page.context(),
        );
        for (const session of [nurse, researchAssistant]) {
          await expect(
            session.page.getByRole('heading', {
              name: '等待医生或管理员确认',
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            session.page.getByRole('button', {
              name: '准备确认报告',
              exact: true,
            }),
          ).toHaveCount(0);
        }
      },
    );
  });

  test('confirmation-doctor-success owns B11-39 and B11-42 through B11-49', async ({
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
          scenarioKey: 'confirmation',
          routeKey: 'confirmation-doctor-success',
        },
      },
      async (run) => {
        const session = await run.primary();
        const page = session.page;
        await expect(
          page.getByRole('button', {
            name: '准备确认报告',
            exact: true,
          }),
        ).toBeEnabled();
        await page
          .getByRole('button', { name: '准备确认报告', exact: true })
          .click();
        const note = page.getByLabel('最终确认意见（必填）', {
          exact: true,
        });
        const checkbox = page.locator(
          '#clinical-report-confirmation-confirmed',
        );
        const confirm = page.getByRole('button', {
          name: '确认当前报告',
          exact: true,
        });
        await expect(note).toHaveAttribute('maxlength', '2000');
        await note.fill('aa');
        await expect(confirm).toBeDisabled();
        await expect(
          page.getByText('最终确认意见需为 3–2000 个字符。', {
            exact: true,
          }),
        ).toBeVisible();
        await note.fill(B11_NEUTRAL_TEXT.confirmationNoteA);
        await expect(checkbox).not.toBeChecked();
        await expect(confirm).toBeDisabled();
        await checkbox.check();
        await expect(confirm).toBeEnabled();

        const result = await session.performAction('confirm', () =>
          confirm.click(),
        );
        expect(result.status).toBe(200);
        expect(result.facts).toMatchObject({
          status: 'confirmed',
          source: 'mixed',
          qualityStatus: 'passed',
          isFinal: true,
          confirmationReceiptPresent: true,
          alreadyConfirmed: false,
          confirmationIdPresent: true,
        });
        expect(session.actionRequestEvidence('confirm')).toEqual([
          {
            action: 'confirm',
            bodyKeys: ['confirm', 'confirmationNote', 'expectedUpdatedAt'],
            expectedUpdatedAtMatchesLatest: true,
            confirmIsTrue: true,
          },
        ]);
        await expect(
          page.getByText('已确认报告', { exact: true }).first(),
        ).toBeVisible();
        await expect(
          page.getByText('报告确认流程质量标记已通过', { exact: true }).first(),
        ).toBeVisible();
        await expect(page.getByText('患者正常', { exact: true })).toHaveCount(
          0,
        );
        await expect(page.getByText('已锁定', { exact: true })).toHaveCount(0);
        await assertWeakConfirmationTrace(page);
      },
    );
  });

  test('confirmation-admin-success owns B11-40 and the admin half of B11-45', async ({
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
          scenarioKey: 'confirmation',
          routeKey: 'confirmation-admin-success',
        },
      },
      async (run) => {
        const session = await run.primary();
        const page = session.page;
        await expect(
          page.getByRole('button', {
            name: '准备确认报告',
            exact: true,
          }),
        ).toBeEnabled();
        await openConfirmation(page, B11_NEUTRAL_TEXT.confirmationNoteA);
        await checkConfirmation(page);
        const result = await session.performAction('confirm', () =>
          page
            .getByRole('button', { name: '确认当前报告', exact: true })
            .click(),
        );
        expect(result.status).toBe(200);
        expect(result.facts).toMatchObject({
          status: 'confirmed',
          qualityStatus: 'passed',
          isFinal: true,
          alreadyConfirmed: false,
        });
        await expect(
          page.getByText('已确认报告', { exact: true }).first(),
        ).toBeVisible();
      },
    );
  });

  test('confirmation-already-confirmed owns B11-50', async ({
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
          scenarioKey: 'confirmation',
          routeKey: 'confirmation-already-confirmed',
        },
      },
      async (run) => {
        const primary = await run.primary();
        const secondary = await run.secondary();
        expect(primary.page.context()).not.toBe(secondary.page.context());
        await openConfirmation(
          primary.page,
          B11_NEUTRAL_TEXT.confirmationNoteA,
        );
        await checkConfirmation(primary.page);
        await openConfirmation(
          secondary.page,
          B11_NEUTRAL_TEXT.confirmationNoteB,
        );
        await checkConfirmation(secondary.page);

        const first = await secondary.performAction('confirm', () =>
          secondary.page
            .getByRole('button', { name: '确认当前报告', exact: true })
            .click(),
        );
        expect(first.status).toBe(200);
        expect(first.facts.alreadyConfirmed).toBe(false);

        const repeated = await primary.performAction('confirm', () =>
          primary.page
            .getByRole('button', { name: '确认当前报告', exact: true })
            .click(),
        );
        expect(repeated.status).toBe(200);
        expect(repeated.facts).toMatchObject({
          status: 'confirmed',
          confirmationReceiptPresent: true,
          alreadyConfirmed: true,
        });
        await expect(
          primary.page.getByText(
            '该报告此前已经确认，本次未重复写入。',
            { exact: true },
          ),
        ).toBeVisible();
        expect(primary.actionRequestEvidence('confirm')).toHaveLength(1);
        expect(secondary.actionRequestEvidence('confirm')).toHaveLength(1);
      },
    );
  });

  test('confirmation-conflict owns B11-51 and B11-52', async ({
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
          scenarioKey: 'confirmation',
          routeKey: 'confirmation-conflict',
        },
      },
      async (run) => {
        const session = await run.primary();
        const page = session.page;
        const frozenUpdatedAt = session.initialUpdatedAt();
        await openConfirmation(page, B11_NEUTRAL_TEXT.confirmationNoteA);
        await checkConfirmation(page);

        await coordinateConfirmationConflictStage();

        const conflict = await session.performAction('confirm', () =>
          page
            .getByRole('button', { name: '确认当前报告', exact: true })
            .click(),
        );
        expect(conflict.status).toBe(409);
        await session.waitForLatestCount(2);
        expect(session.latestUpdatedAt()).not.toBe(frozenUpdatedAt);
        await expect(
          page.getByText('确认表单已过期', { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByLabel('最终确认意见（必填）', { exact: true }),
        ).toHaveValue(B11_NEUTRAL_TEXT.confirmationNoteA);
        await expect(
          page.locator('#clinical-report-confirmation-confirmed'),
        ).not.toBeChecked();
        await expect(
          page.getByRole('button', { name: '确认当前报告', exact: true }),
        ).toBeDisabled();
        expect(session.actionRequestEvidence('confirm')).toHaveLength(1);
        await page
          .getByRole('button', { name: '取消', exact: true })
          .click();
      },
    );
  });
});
