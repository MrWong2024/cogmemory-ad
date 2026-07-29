import { expect, test } from '../../support/acceptance-test';
import { B11_NEUTRAL_TEXT } from '../b11-core-support';
import { resolveB11BrowserEnvironment } from '../b11-env';
import {
  actionRequestMatcher,
  assertActionRequestBoundary,
  coordinateForbiddenRoleStage,
  fillConfirmationDraft,
  fillEditDraft,
  openConfirmationDraft,
  openEditDraft,
  runB11ResilienceRoute,
} from '../b11-resilience-support';

const environment = resolveB11BrowserEnvironment();

test.describe('B11 resilience / authorization', () => {
  test.beforeEach(() => {
    test.skip(
      !environment.enabled,
      'B11_BROWSER_ACCEPTANCE_RUN=1 is required',
    );
  });

  test('unauthorized-action owns B11-63', async ({ roleContexts }) => {
    if (!environment.enabled) return;
    await runB11ResilienceRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: 'authorization',
          routeKey: 'unauthorized-action',
        },
      },
      async (run) => {
        const session = await run.primary();
        const page = session.page;
        await openEditDraft(page);
        await fillEditDraft(page);
        const frozenUpdatedAt = session.initialUpdatedAt();
        await session.logoutThroughSiblingPage();

        const requestPromise = page.waitForRequest(actionRequestMatcher('edit'));
        const status = await session.performAction('edit', () =>
          page
            .getByRole('button', { name: '保存受控编辑', exact: true })
            .click(),
        );
        const request = await requestPromise;
        expect(status).toBe(401);
        await assertActionRequestBoundary({
          request,
          expectedKeys: [
            'doctorOpinion',
            'recommendationText',
            'editNote',
            'expectedUpdatedAt',
          ],
          expectedUpdatedAt: frozenUpdatedAt,
        });
        await page.waitForURL(`${environment.frontendOrigin}/login`);
        await expect(page.getByLabel('账号', { exact: true })).toBeVisible();
        const protectedTextRetained = await page.locator('body').evaluate(
          (body, forbidden) =>
            forbidden.some((value) => body.textContent?.includes(value)),
          Object.values(B11_NEUTRAL_TEXT),
        );
        expect(protectedTextRetained).toBe(false);

        run.recordEvidence('unauthorized', {
          login: 'real',
          siblingLogout: 'real_same_context',
          actionStatus: 401,
          redirectedToLogin: true,
          automaticRetry: 0,
          protectedReportRetainedOnLogin: false,
          serverMutation: 0,
        });
        session.setFinalContract({
          latest: { minimum: 1, maximum: 1 },
          actions: {
            edit: {
              count: 1,
              status: 401,
              bodyKeys: [
                'doctorOpinion',
                'recommendationText',
                'editNote',
                'expectedUpdatedAt',
              ],
              aborted: false,
            },
          },
          expectedConsoleErrors: 2,
          logout: 'sibling_already_completed',
        });
      },
    );
  });

  test('forbidden-confirm owns B11-64', async ({ roleContexts }) => {
    if (!environment.enabled) return;
    test.setTimeout(120_000);
    await runB11ResilienceRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: 'authorization',
          routeKey: 'forbidden-confirm',
        },
      },
      async (run) => {
        const session = await run.primary();
        const page = session.page;
        await openConfirmationDraft(page);
        await fillConfirmationDraft(page);
        const frozenUpdatedAt = session.initialUpdatedAt();

        await coordinateForbiddenRoleStage();

        const requestPromise = page.waitForRequest(
          actionRequestMatcher('confirm'),
        );
        const status = await session.performAction('confirm', () =>
          page
            .getByRole('button', { name: '确认当前报告', exact: true })
            .click(),
        );
        const request = await requestPromise;
        expect(status).toBe(403);
        await assertActionRequestBoundary({
          request,
          expectedKeys: ['confirm', 'confirmationNote', 'expectedUpdatedAt'],
          expectedUpdatedAt: frozenUpdatedAt,
          confirm: true,
        });
        await expect(
          page.getByRole('heading', {
            name: '报告工作流摘要',
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByLabel('最终确认意见（必填）', { exact: true }),
        ).toHaveValue(B11_NEUTRAL_TEXT.confirmationNoteA);
        await expect(
          page.locator('#clinical-report-confirmation-confirmed'),
        ).toBeChecked();
        await expect(
          page.getByText(
            '当前账号不具备 doctor / admin 确认权限；报告和确认意见均已保留。',
            { exact: true },
          ),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: '确认当前报告', exact: true }),
        ).toBeEnabled();
        expect(session.latestRequestCount()).toBe(1);

        run.recordEvidence('forbiddenConfirm', {
          loginAndReportLoadedBeforeStage: true,
          localDraftEstablishedBeforeStage: true,
          stage: 'forbidden-confirm-role',
          authUserRetained: true,
          actionStatus: 403,
          reportRetained: true,
          confirmationNoteRetained: true,
          checkboxRetained: true,
          automaticRetry: 0,
          automaticLatest: 0,
          serverMutation: 0,
          fixtureMutationClass: 'fixture_forbidden_role_only',
        });
        session.setFinalContract({
          latest: { minimum: 1, maximum: 1 },
          actions: {
            confirm: {
              count: 1,
              status: 403,
              bodyKeys: [
                'confirm',
                'confirmationNote',
                'expectedUpdatedAt',
              ],
              aborted: false,
            },
          },
          expectedConsoleErrors: 1,
          logout: 'ui',
        });
      },
    );
  });
});
