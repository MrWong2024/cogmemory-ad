import { expect, test } from '../../support/acceptance-test';
import { resolveB11BrowserEnvironment } from '../b11-env';
import {
  activeB11Region,
  editForm,
  openEditDraft,
  openSubmissionDraft,
  runB11ResilienceRoute,
  submissionForm,
} from '../b11-resilience-support';

const environment = resolveB11BrowserEnvironment();

test.describe('B11 resilience / action-ownership', () => {
  test('unsupported-sibling-actions owns B11-56 through B11-59', async ({
    roleContexts,
  }) => {
    test.skip(
      !environment.enabled,
      'B11_BROWSER_ACCEPTANCE_RUN=1 is required',
    );
    if (!environment.enabled) return;

    await runB11ResilienceRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: 'action-ownership',
          routeKey: 'unsupported-sibling-actions',
        },
      },
      async (run) => {
        const session = await run.primary();
        const page = session.page;

        await openEditDraft(page);
        const edit = editForm(page);
        await expect(
          edit.getByRole('button', {
            name: /退回|拒绝|重新打开|撤回|reject|reopen|withdraw/i,
          }),
        ).toHaveCount(0);
        await expect(
          edit.locator('input[name*="signature" i],textarea[name*="signature" i]'),
        ).toHaveCount(0);
        await expect(
          edit.getByRole('link', { name: /PDF|打印|下载/i }),
        ).toHaveCount(0);
        await expect(
          edit.getByRole('button', { name: /PDF|打印|下载/i }),
        ).toHaveCount(0);
        await page
          .getByRole('button', { name: '放弃本地修改', exact: true })
          .click();

        await openSubmissionDraft(page);
        const submission = submissionForm(page);
        await expect(
          submission.getByRole('button', {
            name: /退回|拒绝|重新打开|撤回|reject|reopen|withdraw/i,
          }),
        ).toHaveCount(0);
        await expect(
          submission.locator(
            'input[name*="signature" i],textarea[name*="signature" i]',
          ),
        ).toHaveCount(0);
        await expect(
          submission.getByRole('link', { name: /PDF|打印|下载/i }),
        ).toHaveCount(0);
        await expect(
          submission.getByRole('button', { name: /PDF|打印|下载/i }),
        ).toHaveCount(0);

        const b11Regions = activeB11Region(page);
        await expect(
          b11Regions.locator(
            'button[data-action="lock"],button[data-action="freeze-sources"],button[data-action="archive"],button[data-action="correction"],button[data-action="void"]',
          ),
        ).toHaveCount(0);
        await expect(
          b11Regions.locator(
            'input[name*="signature" i],textarea[name*="signature" i]',
          ),
        ).toHaveCount(0);

        run.recordEvidence('actionOwnership', {
          unsupportedB11Controls: 0,
          signatureInputs: 0,
          siblingActionsTriggered: 0,
          pdfPrintDownloadEntrypoints: 0,
        });
        session.setFinalContract({
          latest: { minimum: 1, maximum: 1 },
          expectedConsoleErrors: 0,
          logout: 'ui',
        });
      },
    );
  });
});
