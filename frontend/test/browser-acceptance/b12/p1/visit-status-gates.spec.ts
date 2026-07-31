import { expect, test } from '../../support/acceptance-test';
import {
  annotateAuditIds,
  resolveB12P1Environment,
  withB12P1Session,
} from './p1-support';

const environment = resolveB12P1Environment();

test.describe('B12 P1 E / Visit status gates', () => {
  test('B12-15 rejects both locked and voided Visit variants', async ({
    roleContexts,
  }) => {
    annotateAuditIds('B12-15');
    test.skip(!environment.enabled, 'live Browser acceptance is required');
    if (!environment.enabled) return;

    await withB12P1Session(
      { environment, profile: 'e', role: 'doctor', roleContexts },
      async (session) => {
        for (const scenarioKey of ['visit-locked', 'visit-voided'] as const) {
          await test.step(scenarioKey, async () => {
            await session.openScenario({
              frontendOrigin: environment.frontendOrigin,
              profile: 'e',
              scenarioKey,
            });
            await expect(
              session.page.getByText('当前访视状态不允许首次锁定报告。', {
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
        }
      },
    );
  });
});
