import { expect, test } from '../../support/acceptance-test';
import {
  annotateAuditIds,
  resolveB12P1Environment,
  withB12P1Session,
} from './p1-support';

const environment = resolveB12P1Environment();

test.describe('B12 P1 A / lifecycle state', () => {
  test('B12-01 B12-02 B12-03 B12-10 B12-11 lifecycle state evidence', async ({
    roleContexts,
  }) => {
    annotateAuditIds('B12-01', 'B12-02', 'B12-03', 'B12-10', 'B12-11');
    test.skip(!environment.enabled, 'live Browser acceptance is required');
    if (!environment.enabled) return;

    await withB12P1Session(
      { environment, profile: 'a', role: 'doctor', roleContexts },
      async (session) => {
        await test.step('B12-01 draft has no usable lock entry', async () => {
          await session.openScenario({
            frontendOrigin: environment.frontendOrigin,
            profile: 'a',
            scenarioKey: 'draft',
          });
          await expect(
            session.page.getByRole('button', {
              name: '准备锁定报告',
              exact: true,
            }),
          ).toHaveCount(0);
        });

        await test.step('B12-02 pending_confirmation has no usable lock entry', async () => {
          await session.openScenario({
            frontendOrigin: environment.frontendOrigin,
            profile: 'a',
            scenarioKey: 'pending',
          });
          await expect(
            session.page.getByRole('button', {
              name: '准备锁定报告',
              exact: true,
            }),
          ).toHaveCount(0);
        });

        await test.step('B12-03 B12-10 B12-11 confirmed remains confirmed and explicitly unlocked', async () => {
          await session.openScenario({
            frontendOrigin: environment.frontendOrigin,
            profile: 'a',
            scenarioKey: 'confirmed-unlocked',
          });
          await expect(
            session.page.getByText('已确认，尚未锁定', { exact: true }).first(),
          ).toBeVisible();
          await expect(
            session.page.getByText('尚未锁定。', { exact: true }),
          ).toBeVisible();
          await session.page
            .getByText('查看报告技术信息与历史纳入范围', { exact: true })
            .click();
          await expect(
            session.page.getByText('已确认报告（status=confirmed）', {
              exact: true,
            }),
          ).toBeVisible();
        });
      },
    );
  });
});
