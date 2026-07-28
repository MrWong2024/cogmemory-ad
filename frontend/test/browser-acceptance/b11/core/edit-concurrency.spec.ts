import { resolveB11BrowserEnvironment } from '../b11-env';
import {
  B11_NEUTRAL_TEXT,
  assertNoB11WorkflowWriteControls,
  runB11CoreRoute,
} from '../b11-core-support';
import { expect, test } from '../../support/acceptance-test';

const environment = resolveB11BrowserEnvironment();

async function openEditAndFill(
  page: Parameters<typeof assertNoB11WorkflowWriteControls>[0],
  values: {
    opinion: string;
    recommendation: string;
    note: string;
  },
) {
  await page
    .getByRole('button', { name: '编辑临床人员内容', exact: true })
    .click();
  await page
    .getByLabel('医生意见（必填）', { exact: true })
    .fill(values.opinion);
  await page
    .getByLabel('临床人员补充建议（可选）', { exact: true })
    .fill(values.recommendation);
  await page
    .getByLabel('本次编辑审计说明（必填）', { exact: true })
    .fill(values.note);
}

test.describe('B11 core / edit-concurrency', () => {
  test('edit-conflict-continue owns B11-20 through B11-24', async ({
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
          scenarioKey: 'edit-concurrency',
          routeKey: 'edit-conflict-continue',
        },
      },
      async (run) => {
        const primary = await run.primary();
        const secondary = await run.secondary();
        expect(primary.page.context()).not.toBe(secondary.page.context());
        await openEditAndFill(primary.page, {
          opinion: B11_NEUTRAL_TEXT.opinionA,
          recommendation: B11_NEUTRAL_TEXT.recommendationA,
          note: B11_NEUTRAL_TEXT.editNoteA,
        });
        await openEditAndFill(secondary.page, {
          opinion: B11_NEUTRAL_TEXT.opinionB,
          recommendation: B11_NEUTRAL_TEXT.recommendationB,
          note: B11_NEUTRAL_TEXT.editNoteB,
        });

        const secondaryWrite = await secondary.performAction('edit', () =>
          secondary.page
            .getByRole('button', {
              name: '保存受控编辑',
              exact: true,
            })
            .click(),
        );
        expect(secondaryWrite.status).toBe(200);

        const primaryConflict = await primary.performAction('edit', () =>
          primary.page
            .getByRole('button', {
              name: '保存受控编辑',
              exact: true,
            })
            .click(),
        );
        expect(primaryConflict.status).toBe(409);
        await primary.waitForLatestCount(2);
        await expect(
          primary.page.getByText('本地表单已过期', { exact: true }),
        ).toBeVisible();
        await expect(
          primary.page.getByLabel('医生意见（必填）', { exact: true }),
        ).toHaveValue(B11_NEUTRAL_TEXT.opinionA);
        await expect(
          primary.page.getByLabel('临床人员补充建议（可选）', {
            exact: true,
          }),
        ).toHaveValue(B11_NEUTRAL_TEXT.recommendationA);
        await expect(
          primary.page.getByLabel('本次编辑审计说明（必填）', {
            exact: true,
          }),
        ).toHaveValue(B11_NEUTRAL_TEXT.editNoteA);
        await expect(
          primary.page.getByRole('button', {
            name: '保存受控编辑',
            exact: true,
          }),
        ).toBeDisabled();
        expect(primary.actionRequestEvidence('edit')).toHaveLength(1);

        await primary.page
          .getByRole('button', {
            name: '基于最新报告继续',
            exact: true,
          })
          .click();
        await expect(
          primary.page.getByLabel('医生意见（必填）', { exact: true }),
        ).toHaveValue(B11_NEUTRAL_TEXT.opinionA);
        await expect(
          primary.page.getByRole('button', {
            name: '保存受控编辑',
            exact: true,
          }),
        ).toBeEnabled();
        const primaryContinue = await primary.performAction('edit', () =>
          primary.page
            .getByRole('button', {
              name: '保存受控编辑',
              exact: true,
            })
            .click(),
        );
        expect(primaryContinue.status).toBe(200);
        expect(primary.actionRequestEvidence('edit')).toHaveLength(2);
        expect(
          primary
            .actionRequestEvidence('edit')
            .every(({ expectedUpdatedAtMatchesLatest }) =>
              Boolean(expectedUpdatedAtMatchesLatest),
            ),
        ).toBe(true);
        expect(secondary.actionRequestEvidence('edit')).toHaveLength(1);
      },
    );
  });

  test('edit-audit-limit owns B11-25', async ({ roleContexts }) => {
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
          scenarioKey: 'edit-concurrency',
          routeKey: 'edit-audit-limit',
        },
      },
      async (run) => {
        const session = await run.primary();
        const page = session.page;
        await expect(
          page.getByText('200', { exact: true }).first(),
        ).toBeVisible();
        await openEditAndFill(page, {
          opinion: B11_NEUTRAL_TEXT.opinionA,
          recommendation: B11_NEUTRAL_TEXT.recommendationA,
          note: B11_NEUTRAL_TEXT.editNoteA,
        });
        const rejected = await session.performAction('edit', () =>
          page
            .getByRole('button', {
              name: '保存受控编辑',
              exact: true,
            })
            .click(),
        );
        expect(rejected.status).toBe(409);
        await expect(
          page.getByText(
            '报告审计结构或审计上限当前不允许继续安全写入；请保留现有内容并联系管理员处理。',
            { exact: true },
          ),
        ).toBeVisible();
        await page
          .getByRole('button', { name: '放弃本地修改', exact: true })
          .click();
      },
    );
  });

  test('edit-read-only-states owns B11-26 and supports B11-27', async ({
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
          scenarioKey: 'edit-concurrency',
          routeKey: 'edit-read-only-states',
        },
      },
      async (run) => {
        const session = await run.primary();
        await expect(
          session.page.getByText('待医生确认', { exact: true }).first(),
        ).toBeVisible();
        await expect(
          session.page.getByRole('button', {
            name: '编辑临床人员内容',
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          session.page.getByRole('button', {
            name: '准备提交医生确认',
            exact: true,
          }),
        ).toHaveCount(0);
      },
    );
  });
});
