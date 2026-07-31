import { expect, test } from '../../support/acceptance-test';
import {
  annotateAuditIds,
  resolveB12P1Environment,
  withB12P1Session,
} from './p1-support';

const environment = resolveB12P1Environment();

test.describe('B12 P1 B / authorized roles', () => {
  test('B12-04 B12-05 doctor and admin see an enabled lock entry', async ({
    roleContexts,
  }) => {
    annotateAuditIds('B12-04', 'B12-05');
    test.skip(!environment.enabled, 'live Browser acceptance is required');
    if (!environment.enabled) return;

    for (const role of ['doctor', 'admin'] as const) {
      await test.step(
        role === 'doctor' ? 'B12-04 doctor' : 'B12-05 admin',
        async () => {
          await withB12P1Session(
            { environment, profile: 'b', role, roleContexts },
            async (session) => {
              await session.openScenario({
                frontendOrigin: environment.frontendOrigin,
                profile: 'b',
                scenarioKey: 'confirmed-unlocked',
              });
              const lockEntry = session.page.getByRole('button', {
                name: '准备锁定报告',
                exact: true,
              });
              await expect(lockEntry).toBeVisible();
              await expect(lockEntry).toBeEnabled();
            },
          );
        },
      );
    }
  });
});
