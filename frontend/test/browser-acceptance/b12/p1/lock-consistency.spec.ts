import { expect, test } from '../../support/acceptance-test';
import {
  annotateAuditIds,
  resolveB12P1Environment,
  withB12P1Session,
} from './p1-support';

const environment = resolveB12P1Environment();

test.describe('B12 P1 F / lock consistency', () => {
  test('B12-16 B12-18 render existing locked facts without a repeat action', async ({
    roleContexts,
  }) => {
    annotateAuditIds('B12-16', 'B12-18');
    test.skip(!environment.enabled, 'live Browser acceptance is required');
    if (!environment.enabled) return;

    await withB12P1Session(
      { environment, profile: 'f', role: 'doctor', roleContexts },
      async (session) => {
        await test.step('B12-16 lockedAt suppresses repeat lock', async () => {
          await session.openScenario({
            frontendOrigin: environment.frontendOrigin,
            profile: 'f',
            scenarioKey: 'already-locked',
          });
          await expect(
            session.page.getByRole('heading', {
              name: '报告已锁定',
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

        await test.step('B12-18 lockedAt without public lock warns about incomplete audit', async () => {
          await session.openScenario({
            frontendOrigin: environment.frontendOrigin,
            profile: 'f',
            scenarioKey: 'locked-at-without-audit',
          });
          await expect(
            session.page
              .getByText(
                '报告已锁定，但当前安全响应未提供完整锁定审计摘要；系统不会猜测锁定人或说明。',
                { exact: true },
              )
              .first(),
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

  test('B12-17 contract gap: lock without lockedAt cannot reach Browser', () => {
    annotateAuditIds('B12-17');
    test.skip(
      true,
      'B12-17 blocked: the real public mapper removes lock when top-level lockedAt is null',
    );
  });

  test('B12-19 contract gap: mismatched lock timestamps cannot reach Browser', () => {
    annotateAuditIds('B12-19');
    test.skip(
      true,
      'B12-19 blocked: the real public mapper removes a lock summary whose lockedAt mismatches the top level',
    );
  });
});
