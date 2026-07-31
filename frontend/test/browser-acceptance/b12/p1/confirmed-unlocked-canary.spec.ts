import { expect, test } from '../../support/acceptance-test';
import {
  annotateAuditIds,
  resolveB12P1Environment,
  withB12P1Session,
} from './p1-support';

const environment = resolveB12P1Environment();

test.describe('B12 P1 A / confirmed-unlocked canary', () => {
  test('B12-03 B12-10 B12-11 confirmed-unlocked evidence', async ({
    roleContexts,
  }) => {
    annotateAuditIds('B12-03', 'B12-10', 'B12-11');
    test.skip(!environment.enabled, 'live Browser acceptance is required');
    if (!environment.enabled) return;

    await withB12P1Session(
      { environment, profile: 'a', role: 'doctor', roleContexts },
      async (session) => {
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
      },
    );
  });
});
