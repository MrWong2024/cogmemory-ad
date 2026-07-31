import { expect, test } from '../../support/acceptance-test';
import {
  annotateAuditIds,
  resolveB12P1Environment,
  withB12P1Session,
} from './p1-support';

const environment = resolveB12P1Environment();

test.describe('B12 P1 D / report eligibility gates', () => {
  test('B12-12 B12-13 B12-14 reject incomplete report eligibility', async ({
    roleContexts,
  }) => {
    annotateAuditIds('B12-12', 'B12-13', 'B12-14');
    test.skip(!environment.enabled, 'live Browser acceptance is required');
    if (!environment.enabled) return;

    await withB12P1Session(
      { environment, profile: 'd', role: 'doctor', roleContexts },
      async (session) => {
        await test.step('B12-12 quality is not passed', async () => {
          await session.openScenario({
            frontendOrigin: environment.frontendOrigin,
            profile: 'd',
            scenarioKey: 'quality-needs-review',
          });
          await expect(
            session.page.getByText('报告流程质量标记未通过，不能锁定。', {
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            session.page.getByRole('button', {
              name: '准备锁定报告',
              exact: true,
            }),
          ).toHaveCount(0);
        });

        await test.step('B12-13 isFinal=false remains unlocked', async () => {
          await session.openScenario({
            frontendOrigin: environment.frontendOrigin,
            profile: 'd',
            scenarioKey: 'is-final-false',
          });
          await expect(
            session.page.getByRole('button', {
              name: '准备锁定报告',
              exact: true,
            }),
          ).toHaveCount(0);
          await session.page
            .getByText('查看报告技术信息与历史纳入范围', { exact: true })
            .click();
          await expect(
            session.page.getByText('服务端标记为非最终', { exact: true }),
          ).toBeVisible();
        });

        await test.step('B12-14 confirmation summary is missing', async () => {
          await session.openScenario({
            frontendOrigin: environment.frontendOrigin,
            profile: 'd',
            scenarioKey: 'confirmation-missing',
          });
          await expect(
            session.page.getByText('当前报告缺少完整的医生或管理员确认摘要。', {
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            session.page.getByRole('button', {
              name: '准备锁定报告',
              exact: true,
            }),
          ).toHaveCount(0);
        });
      },
    );
  });
});
