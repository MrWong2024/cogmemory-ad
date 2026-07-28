import { resolveB11BrowserEnvironment } from '../b11-env';
import {
  assertNoB11WorkflowWriteControls,
  reportSystemAndSnapshotSections,
  runB11CoreRoute,
} from '../b11-core-support';
import { expect, test } from '../../support/acceptance-test';

const environment = resolveB11BrowserEnvironment();

test.describe('B11 core / final-readonly', () => {
  test('confirmed-readonly owns B11-27 and B11-53', async ({
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
          scenarioKey: 'final-readonly',
          routeKey: 'confirmed-readonly',
        },
      },
      async (run) => {
        const session = await run.primary();
        expect(session.latestSafeFacts()).toEqual({
          status: 'confirmed',
          source: 'mixed',
          qualityStatus: 'passed',
          isFinal: true,
        });
        await expect(
          session.page.getByText('已确认报告', { exact: true }).first(),
        ).toBeVisible();
        await expect(
          session.page.getByText('已确认，尚未锁定', { exact: true }).first(),
        ).toBeVisible();
        await assertNoB11WorkflowWriteControls(session.page);
      },
    );
  });

  test('archived-readonly owns the archived half of B11-54', async ({
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
          scenarioKey: 'final-readonly',
          routeKey: 'archived-readonly',
        },
      },
      async (run) => {
        const session = await run.primary();
        expect(session.latestSafeFacts()).toMatchObject({
          status: 'archived',
          source: 'mixed',
          isFinal: true,
        });
        await expect(
          session.page.getByText('已归档报告', { exact: true }).first(),
        ).toBeVisible();
        await assertNoB11WorkflowWriteControls(session.page);
      },
    );
  });

  test('corrected-readonly supports the corrected half of B11-54', async ({
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
          scenarioKey: 'final-readonly',
          routeKey: 'corrected-readonly',
        },
      },
      async (run) => {
        const session = await run.primary();
        expect(session.latestSafeFacts()).toMatchObject({
          status: 'corrected',
          source: 'mixed',
          isFinal: true,
        });
        await expect(
          session.page.getByText('已更正报告', { exact: true }).first(),
        ).toBeVisible();
        await assertNoB11WorkflowWriteControls(session.page);
      },
    );
  });

  test('voided-readonly owns B11-55', async ({ roleContexts }) => {
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
          scenarioKey: 'final-readonly',
          routeKey: 'voided-readonly',
        },
      },
      async (run) => {
        const session = await run.primary();
        expect(session.latestSafeFacts()).toMatchObject({
          status: 'voided',
          source: 'mixed',
          isFinal: false,
        });
        await expect(
          session.page.getByText('已作废报告', { exact: true }).first(),
        ).toBeVisible();
        await assertNoB11WorkflowWriteControls(session.page);
      },
    );
  });

  test('clinician-content-boundary owns B11-60 through B11-62', async ({
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
          scenarioKey: 'final-readonly',
          routeKey: 'clinician-content-boundary',
        },
      },
      async (run) => {
        const session = await run.primary();
        const page = session.page;
        expect(session.latestSafeFacts()).toMatchObject({
          status: 'draft',
          source: 'mixed',
          isFinal: false,
        });
        await expect(
          page.getByText('系统规则内容与临床人员补充并存（非 AI）', {
            exact: true,
          }).first(),
        ).toBeVisible();
        await expect(page.getByText('AI 内容', { exact: true })).toHaveCount(
          0,
        );
        await expect(
          page.getByRole('heading', {
            name: '临床人员补充建议',
            exact: true,
          }),
        ).toBeVisible();
        const clinicianSection = page.locator(
          'section[aria-labelledby="clinical-report-clinician-narrative-heading"]',
        );
        await expect(clinicianSection).toHaveCount(1);
        const ownershipStatement = clinicianSection
          .locator('p')
          .filter({ hasText: '系统不自动生成' });
        await expect(ownershipStatement).toHaveCount(1);
        await expect(ownershipStatement).toContainText('系统不自动生成');
        await expect(ownershipStatement).toContainText('改写');
        await expect(ownershipStatement).toContainText('审核');
        await expect(ownershipStatement).toContainText('解释');
        await expect(
          reportSystemAndSnapshotSections(page).locator(
            'textarea,input,select',
          ),
        ).toHaveCount(0);
      },
    );
  });
});
