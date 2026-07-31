import { expect, test } from '../../support/acceptance-test';
import {
  annotateAuditIds,
  resolveB12P1Environment,
  withB12P1Session,
} from './p1-support';

const environment = resolveB12P1Environment();

test.describe('B12 P1 G / locked readonly semantics', () => {
  test('B12-64 B12-65 B12-66 B12-67 B12-68 B12-69 B12-70 locked readonly evidence', async ({
    roleContexts,
  }) => {
    annotateAuditIds(
      'B12-64',
      'B12-65',
      'B12-66',
      'B12-67',
      'B12-68',
      'B12-69',
      'B12-70',
    );
    test.skip(!environment.enabled, 'live Browser acceptance is required');
    if (!environment.enabled) return;

    await withB12P1Session(
      { environment, profile: 'g', role: 'doctor', roleContexts },
      async (session) => {
        await session.openScenario({
          frontendOrigin: environment.frontendOrigin,
          profile: 'g',
          scenarioKey: 'locked-readonly',
        });

        await test.step('B12-64 edit action is unavailable', async () => {
          await expect(
            session.page.getByRole('button', {
              name: '编辑临床人员内容',
              exact: true,
            }),
          ).toHaveCount(0);
        });
        await test.step('B12-65 submit action is unavailable', async () => {
          await expect(
            session.page.getByRole('button', {
              name: '准备提交医生确认',
              exact: true,
            }),
          ).toHaveCount(0);
        });
        await test.step('B12-66 confirm action is unavailable', async () => {
          await expect(
            session.page.getByRole('button', {
              name: '准备确认报告',
              exact: true,
            }),
          ).toHaveCount(0);
        });
        await test.step('B12-67 repeat lock action is unavailable', async () => {
          await expect(
            session.page.getByRole('button', {
              name: '准备锁定报告',
              exact: true,
            }),
          ).toHaveCount(0);
          await expect(
            session.page.getByRole('heading', {
              name: '报告已锁定',
              exact: true,
            }),
          ).toBeVisible();
        });
        await test.step('B12-68 status stays confirmed with separate locked semantics', async () => {
          await session.page
            .getByText('查看报告技术信息与历史纳入范围', { exact: true })
            .click();
          await expect(
            session.page.getByText('已确认报告（status=confirmed）', {
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            session.page.getByText('已确认并锁定', { exact: true }).first(),
          ).toBeVisible();
          await expect(
            session.page.getByText('locked', { exact: true }),
          ).toHaveCount(0);
        });
        await test.step('B12-70 locked time does not imply archive time', async () => {
          await expect(
            session.page.getByText('报告尚未归档', { exact: true }).first(),
          ).toBeVisible();
          await expect(
            session.page.getByText('锁定时间', { exact: true }).first(),
          ).toBeVisible();
          await expect(
            session.page.getByText('归档时间', { exact: true }).first(),
          ).toBeVisible();
        });

        await test.step('B12-68 confirmed unlocked remains a confirmed comparison', async () => {
          await session.openScenario({
            frontendOrigin: environment.frontendOrigin,
            profile: 'g',
            scenarioKey: 'confirmed-unlocked',
          });
          await expect(
            session.page.getByText('已确认，尚未锁定', { exact: true }).first(),
          ).toBeVisible();
          await expect(
            session.page.getByText('已锁定', { exact: true }),
          ).toHaveCount(0);
        });

        await test.step('B12-69 Browser support crosses isFinal values without inventing locked status', async () => {
          await session.openScenario({
            frontendOrigin: environment.frontendOrigin,
            profile: 'g',
            scenarioKey: 'nonfinal-unlocked',
          });
          await session.page
            .getByText('查看报告技术信息与历史纳入范围', { exact: true })
            .click();
          await expect(
            session.page.getByText('服务端标记为非最终', { exact: true }),
          ).toBeVisible();
          await expect(
            session.page.getByText('已锁定', { exact: true }),
          ).toHaveCount(0);
        });
      },
    );
  });
});
