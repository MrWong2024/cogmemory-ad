import { expect, test } from '../../support/acceptance-test';
import {
  annotateAuditIds,
  resolveB12P1Environment,
  withB12P1Session,
} from './p1-support';

const environment = resolveB12P1Environment();

test.describe('B12 P1 C / restricted roles', () => {
  test('B12-06 B12-07 B12-08 restricted roles use isolated real sessions', async ({
    roleContexts,
  }) => {
    annotateAuditIds('B12-06', 'B12-07', 'B12-08');
    test.skip(!environment.enabled, 'live Browser acceptance is required');
    if (!environment.enabled) return;

    for (const role of ['nurse', 'research_assistant'] as const) {
      await test.step(
        role === 'nurse' ? 'B12-06 nurse' : 'B12-07 research_assistant',
        async () => {
          await withB12P1Session(
            { environment, profile: 'c', role, roleContexts },
            async (session) => {
              await session.openScenario({
                frontendOrigin: environment.frontendOrigin,
                profile: 'c',
                scenarioKey: 'confirmed-unlocked',
              });
              await expect(
                session.page.getByText(
                  '报告锁定需由医生或管理员执行。当前账号仍可查看报告和已有锁定摘要，后端 RolesGuard 是最终权限边界。',
                  { exact: true },
                ),
              ).toBeVisible();
              await expect(
                session.page.getByRole('button', {
                  name: '准备锁定报告',
                  exact: true,
                }),
              ).toHaveCount(0);
            },
          );
        },
      );
    }

    await test.step('B12-08 system authenticates but receives the real read guard', async () => {
      await withB12P1Session(
        { environment, profile: 'c', role: 'system', roleContexts },
        async (session) => {
          await session.openScenario({
            frontendOrigin: environment.frontendOrigin,
            profile: 'c',
            scenarioKey: 'confirmed-unlocked',
            expectForbidden: true,
          });
          await expect(
            session.page.getByRole('button', {
              name: '准备锁定报告',
              exact: true,
            }),
          ).toHaveCount(0);
        },
      );
    });
  });
});
