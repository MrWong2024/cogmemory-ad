import { resolveB11BrowserEnvironment } from '../b11-env';
import {
  B11_NEUTRAL_TEXT,
  assertB11EditorialPrivacy,
  assertB11EditorialSummary,
  exerciseBeforeUnload,
  reportSystemAndSnapshotSections,
  runB11CoreRoute,
} from '../b11-core-support';
import { expect, test } from '../../support/acceptance-test';

const environment = resolveB11BrowserEnvironment();

test.describe('B11 core / edit-basics', () => {
  test('system-draft-edit owns B11-01 through B11-04', async ({
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
          scenarioKey: 'edit-basics',
          routeKey: 'system-draft-edit',
        },
      },
      async (run) => {
        const session = await run.primary();
        const page = session.page;
        await expect(
          page.getByRole('button', {
            name: '编辑临床人员内容',
            exact: true,
          }),
        ).toBeEnabled();
        await page
          .getByRole('button', {
            name: '编辑临床人员内容',
            exact: true,
          })
          .click();

        const doctorOpinion = page.getByLabel('医生意见（必填）', {
          exact: true,
        });
        const recommendation = page.getByLabel(
          '临床人员补充建议（可选）',
          { exact: true },
        );
        const editNote = page.getByLabel('本次编辑审计说明（必填）', {
          exact: true,
        });
        await expect(doctorOpinion).toBeEditable();
        await expect(recommendation).toBeEditable();
        await expect(editNote).toBeEditable();
        await expect(page.locator('textarea')).toHaveCount(3);
        await expect(
          reportSystemAndSnapshotSections(page).locator(
            'textarea,input,select',
          ),
        ).toHaveCount(0);
        await expect(
          page.getByText(
            '以下五段按普通文本只读展示，由服务端固定规则生成，不是医生意见，也不能在本页面编辑。',
            { exact: true },
          ),
        ).toBeVisible();
      },
    );
  });

  test('edit-field-validation owns B11-05 through B11-09', async ({
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
          scenarioKey: 'edit-basics',
          routeKey: 'edit-field-validation',
        },
      },
      async (run) => {
        const session = await run.primary();
        const page = session.page;
        await page
          .getByRole('button', {
            name: '编辑临床人员内容',
            exact: true,
          })
          .click();
        const doctorOpinion = page.getByLabel('医生意见（必填）', {
          exact: true,
        });
        const recommendation = page.getByLabel(
          '临床人员补充建议（可选）',
          { exact: true },
        );
        const editNote = page.getByLabel('本次编辑审计说明（必填）', {
          exact: true,
        });
        const save = page.getByRole('button', {
          name: '保存受控编辑',
          exact: true,
        });

        await doctorOpinion.fill('aa');
        await editNote.fill(B11_NEUTRAL_TEXT.editNoteA);
        await expect(save).toBeDisabled();
        await expect(
          page.getByText('医生意见需为 3–4000 个字符。', { exact: true }),
        ).toBeVisible();

        await doctorOpinion.fill('x'.repeat(4000));
        await doctorOpinion.press('End');
        await doctorOpinion.press('x');
        expect((await doctorOpinion.inputValue()).length).toBe(4000);
        await expect(doctorOpinion).toHaveAttribute('maxlength', '4000');

        await doctorOpinion.fill(B11_NEUTRAL_TEXT.opinionA);
        await recommendation.fill('');
        await editNote.fill(B11_NEUTRAL_TEXT.editNoteA);
        await expect(save).toBeEnabled();

        await recommendation.fill('aa');
        await expect(save).toBeDisabled();
        await expect(
          page.getByText(
            '临床人员补充建议留空表示清除；非空时需为 3–4000 个字符。',
            { exact: true },
          ),
        ).toBeVisible();
        await recommendation.fill('x'.repeat(4000));
        await recommendation.press('End');
        await recommendation.press('x');
        expect((await recommendation.inputValue()).length).toBe(4000);
        await expect(recommendation).toHaveAttribute('maxlength', '4000');

        await recommendation.fill(B11_NEUTRAL_TEXT.recommendationA);
        await editNote.fill('aa');
        await expect(save).toBeDisabled();
        await expect(
          page.getByText('本次编辑审计说明需为 3–1000 个字符。', {
            exact: true,
          }),
        ).toBeVisible();
        await editNote.fill('x'.repeat(1000));
        await editNote.press('End');
        await editNote.press('x');
        expect((await editNote.inputValue()).length).toBe(1000);
        await expect(editNote).toHaveAttribute('maxlength', '1000');
      },
    );
  });

  test('edit-no-change owns B11-10', async ({ roleContexts }) => {
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
          scenarioKey: 'edit-basics',
          routeKey: 'edit-no-change',
        },
      },
      async (run) => {
        const session = await run.primary();
        const page = session.page;
        await page
          .getByRole('button', {
            name: '编辑临床人员内容',
            exact: true,
          })
          .click();
        await page
          .getByLabel('本次编辑审计说明（必填）', { exact: true })
          .fill(B11_NEUTRAL_TEXT.editNoteA);
        await expect(
          page.getByRole('button', {
            name: '保存受控编辑',
            exact: true,
          }),
        ).toBeDisabled();
        await page
          .getByRole('button', { name: '放弃本地修改', exact: true })
          .click();
      },
    );
  });

  test('edit-success owns B11-11 through B11-19', async ({
    roleContexts,
  }) => {
    test.skip(
      !environment.enabled,
      'B11_BROWSER_ACCEPTANCE_RUN=1 is required',
    );
    if (!environment.enabled) return;
    test.setTimeout(60_000);

    await runB11CoreRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: 'edit-basics',
          routeKey: 'edit-success',
        },
      },
      async (run) => {
        const session = await run.primary();
        const page = session.page;
        const protectedTextBefore =
          await reportSystemAndSnapshotSections(page).allInnerTexts();

        await page
          .getByRole('button', {
            name: '编辑临床人员内容',
            exact: true,
          })
          .click();
        await page
          .getByLabel('医生意见（必填）', { exact: true })
          .fill(B11_NEUTRAL_TEXT.opinionA);
        await page
          .getByLabel('本次编辑审计说明（必填）', { exact: true })
          .fill(B11_NEUTRAL_TEXT.editNoteA);
        expect(await exerciseBeforeUnload(page)).toBe(1);
        await session.waitForLatestCount(2);

        await page
          .getByRole('button', {
            name: '编辑临床人员内容',
            exact: true,
          })
          .click();
        await page
          .getByLabel('医生意见（必填）', { exact: true })
          .fill(B11_NEUTRAL_TEXT.opinionA);
        await page
          .getByLabel('临床人员补充建议（可选）', { exact: true })
          .fill(B11_NEUTRAL_TEXT.recommendationA);
        await page
          .getByLabel('本次编辑审计说明（必填）', { exact: true })
          .fill(B11_NEUTRAL_TEXT.editNoteA);

        const result = await session.performAction('edit', () =>
          page
            .getByRole('button', {
              name: '保存受控编辑',
              exact: true,
            })
            .click(),
        );
        expect(result.status).toBe(200);
        expect(result.facts).toMatchObject({
          status: 'draft',
          source: 'mixed',
          editReceiptPresent: true,
        });
        expect(result.facts.editReceipt).toMatchObject({
          keys: [
            'changedFields',
            'editNote',
            'editedAt',
            'editedBy',
            'eventId',
          ],
          actorKeys: ['operatorId', 'operatorName', 'operatorRole'],
          changedFields: ['doctorOpinion', 'recommendationText'],
          editedBy: {
            operatorRole: 'doctor',
            internalOperatorIdPresent: false,
          },
        });
        expect(result.facts.editorial).toEqual({
          lastEditedAt: result.facts.editReceipt?.editedAt ?? null,
          lastEditedBy: result.facts.editReceipt?.editedBy ?? null,
          editCount: 1,
          lastChangedFields:
            result.facts.editReceipt?.changedFields ?? [],
        });
        expect(session.actionRequestEvidence('edit')).toEqual([
          {
            action: 'edit',
            bodyKeys: [
              'doctorOpinion',
              'editNote',
              'expectedUpdatedAt',
              'recommendationText',
            ],
            expectedUpdatedAtMatchesLatest: true,
            confirmIsTrue: null,
          },
        ]);
        await expect(
          page.getByText('系统规则内容与临床人员补充并存（非 AI）', {
            exact: true,
          }).first(),
        ).toBeVisible();
        await expect(page.getByText(/本次编辑回执：/).first()).toBeVisible();
        await assertB11EditorialSummary(page, result.facts.editorial);
        await assertB11EditorialPrivacy(page, 1);
        expect(
          await reportSystemAndSnapshotSections(page).allInnerTexts(),
        ).toEqual(protectedTextBefore);

        const originalContext = page.context();
        const reopened = await run.reopenPrimaryInFreshContext();
        expect(reopened.page.context()).not.toBe(originalContext);
        expect(reopened.actionRequestEvidence('edit')).toEqual([]);
        expect(reopened.latestEditorialFacts()).toEqual(
          result.facts.editorial,
        );
        await assertB11EditorialSummary(
          reopened.page,
          reopened.latestEditorialFacts(),
        );
        await assertB11EditorialPrivacy(reopened.page, 0);
        await expect(
          reopened.page.locator('p').filter({ hasText: /^本次编辑回执：/ }),
        ).toHaveCount(0);
      },
    );
  });
});
