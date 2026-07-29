import { OneShotRequestAbort } from '../../support/network-control';
import { expect, test } from '../../support/acceptance-test';
import type { RoleContextFactory } from '../../support/role-context-factory';
import { B11_NEUTRAL_TEXT } from '../b11-core-support';
import { resolveB11BrowserEnvironment } from '../b11-env';
import {
  actionRequestMatcher,
  assertActionRequestBoundary,
  fillConfirmationDraft,
  fillEditDraft,
  fillSubmissionDraft,
  openConfirmationDraft,
  openEditDraft,
  openSubmissionDraft,
  runB11ResilienceRoute,
  type B11ResilienceActionKind,
} from '../b11-resilience-support';

const environment = resolveB11BrowserEnvironment();
const SERVICE_UNAVAILABLE = '报告服务暂时不可用，请稍后手工重试。';

async function runAbortRoute(input: {
  roleContexts: RoleContextFactory;
  routeKey:
    | 'edit-network-abort'
    | 'submit-network-abort'
    | 'confirm-network-abort';
  action: B11ResilienceActionKind;
  openAndFill: (page: Parameters<typeof openEditDraft>[0]) => Promise<void>;
  triggerName: string;
  expectedKeys: string[];
  expectedConsoleErrors: number;
  assertDraftRetained: (page: Parameters<typeof openEditDraft>[0]) => Promise<void>;
}) {
  if (!environment.enabled) return;
  await runB11ResilienceRoute(
    {
      environment,
      roleContexts: input.roleContexts,
      target: {
        scenarioKey: 'network-failure',
        routeKey: input.routeKey,
      },
    },
    async (run) => {
      const session = await run.primary();
      const page = session.page;
      await input.openAndFill(page);
      const requestPromise = page.waitForRequest(actionRequestMatcher(input.action));
      const abort = new OneShotRequestAbort(
        page,
        actionRequestMatcher(input.action),
      );
      await abort.install();
      await page
        .getByRole('button', { name: input.triggerName, exact: true })
        .click();
      await abort.waitForStarted();
      const request = await requestPromise;
      await assertActionRequestBoundary({
        request,
        expectedKeys: input.expectedKeys,
        expectedUpdatedAt: session.initialUpdatedAt(),
        ...(input.action === 'edit' ? {} : { confirm: true as const }),
      });
      await expect(page.getByText(SERVICE_UNAVAILABLE, { exact: true })).toBeVisible();
      await input.assertDraftRetained(page);
      await expect(
        page.getByRole('button', { name: input.triggerName, exact: true }),
      ).toBeEnabled();
      expect(await abort.dispose()).toEqual({
        matchedRequestCount: 1,
        abortedRequestCount: 1,
        continuedRequestCount: 0,
      });
      run.recordEvidence('networkAbort', {
        branch: input.action,
        realUiInitiated: true,
        oneShotAbort: true,
        localDraftRetained: true,
        retry: 0,
        polling: 0,
        serverMutation: 0,
      });
      session.setFinalContract({
        latest: { minimum: 1, maximum: 1 },
        actions: {
          [input.action]: {
            count: 1,
            status: null,
            bodyKeys: input.expectedKeys,
            aborted: true,
          },
        },
        expectedConsoleErrors: input.expectedConsoleErrors,
        logout: 'ui',
      });
    },
  );
}

test.describe('B11 resilience / network-failure', () => {
  test.beforeEach(() => {
    test.skip(
      !environment.enabled,
      'B11_BROWSER_ACCEPTANCE_RUN=1 is required',
    );
  });

  test('edit-network-abort supports B11-65', async ({ roleContexts }) => {
    await runAbortRoute({
      roleContexts,
      routeKey: 'edit-network-abort',
      action: 'edit',
      openAndFill: async (page) => {
        await openEditDraft(page);
        await fillEditDraft(page);
      },
      triggerName: '保存受控编辑',
      expectedKeys: [
        'doctorOpinion',
        'recommendationText',
        'editNote',
        'expectedUpdatedAt',
      ],
      expectedConsoleErrors: 0,
      assertDraftRetained: async (page) => {
        await expect(page.getByLabel('医生意见（必填）', { exact: true })).toHaveValue(
          B11_NEUTRAL_TEXT.opinionA,
        );
        await expect(
          page.getByLabel('临床人员补充建议（可选）', { exact: true }),
        ).toHaveValue(B11_NEUTRAL_TEXT.recommendationA);
        await expect(
          page.getByLabel('本次编辑审计说明（必填）', { exact: true }),
        ).toHaveValue(B11_NEUTRAL_TEXT.editNoteA);
      },
    });
  });

  test('submit-network-abort supports B11-65', async ({ roleContexts }) => {
    await runAbortRoute({
      roleContexts,
      routeKey: 'submit-network-abort',
      action: 'submit',
      openAndFill: async (page) => {
        await openSubmissionDraft(page);
        await fillSubmissionDraft(page);
      },
      triggerName: '确认提交待医生确认',
      expectedKeys: ['confirm', 'submissionNote', 'expectedUpdatedAt'],
      expectedConsoleErrors: 0,
      assertDraftRetained: async (page) => {
        await expect(page.getByLabel('提交说明（必填）', { exact: true })).toHaveValue(
          B11_NEUTRAL_TEXT.submissionNoteA,
        );
        await expect(page.locator('#clinical-report-submission-confirmed')).toBeChecked();
      },
    });
  });

  test('confirm-network-abort supports B11-65', async ({ roleContexts }) => {
    await runAbortRoute({
      roleContexts,
      routeKey: 'confirm-network-abort',
      action: 'confirm',
      openAndFill: async (page) => {
        await openConfirmationDraft(page);
        await fillConfirmationDraft(page);
      },
      triggerName: '确认当前报告',
      expectedKeys: ['confirm', 'confirmationNote', 'expectedUpdatedAt'],
      expectedConsoleErrors: 0,
      assertDraftRetained: async (page) => {
        await expect(
          page.getByLabel('最终确认意见（必填）', { exact: true }),
        ).toHaveValue(B11_NEUTRAL_TEXT.confirmationNoteA);
        await expect(page.locator('#clinical-report-confirmation-confirmed')).toBeChecked();
      },
    });
  });
});
