import {
  assertAriaNode,
} from '../../support/aria-live-audit';
import { runAccessibilityAudit } from '../../support/accessibility-audit';
import {
  assertFocusLeavesRegion,
  assertFocusVisible,
  installKeyboardEvidence,
  pressKeyboard,
  tabToLocator,
} from '../../support/keyboard-evidence';
import { expect, test } from '../../support/acceptance-test';
import {
  auditElementBounds,
  auditViewport,
  assertNoGlobalHorizontalOverflow,
  FORMAL_ACCEPTANCE_VIEWPORTS,
} from '../../support/viewport-audit';
import { B11_NEUTRAL_TEXT } from '../b11-core-support';
import { resolveB11BrowserEnvironment } from '../b11-env';
import {
  actionRequestMatcher,
  assertActionRequestBoundary,
  auditDraftStorageBoundary,
  confirmationForm,
  editForm,
  fillEditDraft,
  fillSubmissionDraft,
  installControlledStalePrecursor,
  openConfirmationDraft,
  openEditDraft,
  openSubmissionDraft,
  runB11ResilienceRoute,
  submissionForm,
  type ControlledStalePrecursor,
} from '../b11-resilience-support';

const environment = resolveB11BrowserEnvironment();

test.describe('B11 resilience / client-boundary', () => {
  test.beforeEach(() => {
    test.skip(
      !environment.enabled,
      'B11_BROWSER_ACCEPTANCE_RUN=1 is required',
    );
  });

  test('storage-and-refresh owns B11-66 and B11-67', async ({
    roleContexts,
  }) => {
    if (!environment.enabled) return;
    await runB11ResilienceRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: 'client-boundary',
          routeKey: 'storage-and-refresh',
        },
      },
      async (run) => {
        const session = await run.primary();
        const page = session.page;

        await openEditDraft(page);
        await fillEditDraft(page);
        const editStorage = await auditDraftStorageBoundary(page);
        await page
          .getByRole('button', { name: '放弃本地修改', exact: true })
          .click();

        await openSubmissionDraft(page);
        await fillSubmissionDraft(page);
        const submissionStorage = await auditDraftStorageBoundary(page);
        await expect(submissionForm(page)).toBeVisible();

        await page.reload({ waitUntil: 'domcontentloaded' });
        await session.waitForLatestRequestCount(2);
        await expect(editForm(page)).toHaveCount(0);
        await expect(submissionForm(page)).toHaveCount(0);
        await expect(
          page.getByLabel('医生意见（必填）', { exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByLabel('提交说明（必填）', { exact: true }),
        ).toHaveCount(0);
        await expect(
          page.locator('#clinical-report-submission-confirmed'),
        ).toHaveCount(0);
        await expect(
          page.getByRole('button', {
            name: '编辑临床人员内容',
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', {
            name: '准备提交医生确认',
            exact: true,
          }),
        ).toBeVisible();
        const afterReloadStorage = await auditDraftStorageBoundary(page);

        run.recordEvidence('storageAndRefresh', {
          editStorage,
          submissionStorage,
          afterReloadStorage,
          draftsRestored: false,
          checkboxRestored: false,
          frozenVersionRestored: false,
          automaticSubmit: false,
          latestPerLoad: 1,
        });
        session.setFinalContract({
          latest: { minimum: 2, maximum: 2 },
          expectedConsoleErrors: 0,
          logout: 'ui',
        });
      },
    );
  });

  test('responsive-accessibility owns B11-68', async ({ roleContexts }) => {
    if (!environment.enabled) return;
    test.setTimeout(180_000);
    await runB11ResilienceRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: 'client-boundary',
          routeKey: 'responsive-accessibility',
        },
      },
      async (run) => {
        const session = await run.primary();
        const page = session.page;
        await installKeyboardEvidence(page);
        await openConfirmationDraft(page);

        const form = confirmationForm(page);
        const note = page.getByLabel('最终确认意见（必填）', { exact: true });
        const checkbox = page.locator('#clinical-report-confirmation-confirmed');
        const checkboxLabel = page.locator(
          'label[for="clinical-report-confirmation-confirmed"]',
        );
        const confirmButton = page.getByRole('button', {
          name: '确认当前报告',
          exact: true,
        });
        await assertAriaNode(form, {
          role: 'region',
          accessibleName: '二次确认当前报告',
        });
        await expect(note).toHaveAccessibleName('最终确认意见（必填）');
        await expect(checkbox).toHaveAccessibleName(
          '我已核对当前报告与提交摘要，并明确完成医生或管理员最终确认。',
        );
        await expect(checkboxLabel).toBeVisible();

        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        });
        await tabToLocator(page, note, 250);
        await assertFocusVisible(note);
        await pressKeyboard(page, 'Tab');
        await expect(checkbox).toBeFocused();
        await assertFocusVisible(checkbox);
        const focusLeavePresses = await assertFocusLeavesRegion(page, form, 10);
        await note.fill(B11_NEUTRAL_TEXT.confirmationNoteA);
        await checkbox.check();
        await expect(confirmButton).toBeEnabled();

        const viewportEvidence = [];
        for (const viewport of FORMAL_ACCEPTANCE_VIEWPORTS) {
          const beforeRequestCount = session.networkEntries().length;
          const summary = await auditViewport(page, viewport);
          assertNoGlobalHorizontalOverflow(summary);
          await page.waitForTimeout(50);
          expect(session.networkEntries()).toHaveLength(beforeRequestCount);
          await expect(form).toBeVisible();
          await expect(note).toBeEditable();
          await expect(checkbox).toBeEnabled();
          await expect(confirmButton).toBeEnabled();
          await note.scrollIntoViewIfNeeded();
          await checkbox.scrollIntoViewIfNeeded();
          await confirmButton.scrollIntoViewIfNeeded();
          const bounds = {
            edit: null,
            submit: null,
            confirm: await auditElementBounds(form),
            textarea: await auditElementBounds(note),
            checkbox: await auditElementBounds(checkbox),
            checkboxLabel: await auditElementBounds(checkboxLabel),
            button: await auditElementBounds(confirmButton),
          };
          expect(
            Object.values(bounds)
              .filter((value) => value !== null)
              .every((value) => value.withinViewportHorizontally),
          ).toBe(true);
          const axe = await runAccessibilityAudit(page, {
            include: [
              'section[aria-labelledby="clinical-report-confirm-heading"]',
            ],
          });
          expect(axe.violationCount).toBe(0);
          viewportEvidence.push({
            viewport: summary.viewport,
            document: summary.document,
            main: summary.main,
            globalHorizontalOverflow: false,
            regions: bounds,
            axe,
            resizeRequests: 0,
          });
        }

        const maximized = await run.createSession('maximized-chrome', {
          contextOptions: { viewport: null },
        });
        const maxPage = maximized.page;
        const cdp = await maxPage.context().newCDPSession(maxPage);
        const windowInfo = await cdp.send('Browser.getWindowForTarget');
        await cdp.send('Browser.setWindowBounds', {
          windowId: windowInfo.windowId,
          bounds: { width: 1600, height: 1000 },
        });
        await cdp.send('Browser.setWindowBounds', {
          windowId: windowInfo.windowId,
          bounds: { windowState: 'maximized' },
        });
        const maximumMetrics = await maxPage.evaluate(() => ({
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          zoom: window.visualViewport?.scale ?? 1,
        }));
        await cdp.detach();
        expect(maximumMetrics.zoom).toBe(1);
        expect(maximumMetrics.innerWidth).toBeGreaterThanOrEqual(1440);
        await openConfirmationDraft(maxPage);
        const maximumAxe = await runAccessibilityAudit(maxPage, {
          include: [
            'section[aria-labelledby="clinical-report-confirm-heading"]',
          ],
        });
        expect(maximumAxe.violationCount).toBe(0);

        run.recordEvidence('responsiveAccessibility', {
          formalViewportCount: viewportEvidence.length,
          viewports: viewportEvidence,
          maximumChrome: {
            ...maximumMetrics,
            axe: maximumAxe,
          },
          textareaLabel: 'passed',
          checkboxLabel: 'passed',
          accessibleNames: 'passed',
          focusVisible: 'passed',
          focusTrap: false,
          focusLeavePresses,
          ariaTree: 'passed',
        });
        session.setFinalContract({
          latest: { minimum: 1, maximum: 1 },
          expectedConsoleErrors: 0,
          logout: 'ui',
        });
        maximized.setFinalContract({
          latest: { minimum: 1, maximum: 1 },
          expectedConsoleErrors: 0,
          logout: 'ui',
        });
      },
    );
  });

  test('stale-disabled owns B11-69', async ({ roleContexts }) => {
    if (!environment.enabled) return;
    const precursorHolder: { current: ControlledStalePrecursor | null } = {
      current: null,
    };
    await runB11ResilienceRoute(
      {
        environment,
        roleContexts,
        target: {
          scenarioKey: 'client-boundary',
          routeKey: 'stale-disabled',
        },
      },
      async (run) => {
        const session = await run.primary({
          beforeWorkflowNavigation: async (page) => {
            precursorHolder.current = await installControlledStalePrecursor(page);
          },
        });
        const page = session.page;
        const precursor = precursorHolder.current;
        if (!precursor) {
          throw new Error('Controlled stale precursor was not installed');
        }
        await openEditDraft(page);
        await fillEditDraft(page);
        const requestPromise = page.waitForRequest(actionRequestMatcher('edit'));
        const status = await session.performAction('edit', () =>
          page
            .getByRole('button', { name: '保存受控编辑', exact: true })
            .click(),
        );
        const request = await requestPromise;
        expect(status).toBe(409);
        await assertActionRequestBoundary({
          request,
          expectedKeys: [
            'doctorOpinion',
            'recommendationText',
            'editNote',
            'expectedUpdatedAt',
          ],
          expectedUpdatedAt: session.initialUpdatedAt(),
        });
        await session.waitForLatestRequestCount(2);
        await expect(
          page.getByText('本地表单已过期', { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByLabel('医生意见（必填）', { exact: true }),
        ).toHaveValue(B11_NEUTRAL_TEXT.opinionA);
        await expect(
          page.getByLabel('临床人员补充建议（可选）', { exact: true }),
        ).toHaveValue(B11_NEUTRAL_TEXT.recommendationA);
        await expect(
          page.getByLabel('本次编辑审计说明（必填）', { exact: true }),
        ).toHaveValue(B11_NEUTRAL_TEXT.editNoteA);
        await expect(
          page.getByRole('button', { name: '保存受控编辑', exact: true }),
        ).toBeDisabled();
        await expect(
          page.getByRole('button', {
            name: '基于最新报告继续',
            exact: true,
          }),
        ).toBeEnabled();
        expect(precursor.matchedCount).toBe(1);
        expect(precursor.realStatus).toBe(200);
        await precursor.dispose();

        run.recordEvidence('controlledStale', {
          initialLatestRealStatus: 200,
          controlledPrecursorCount: 1,
          mutatedField: precursor.mutatedField,
          actionResponsesModified: precursor.actionResponsesModified,
          realActionStatus: 409,
          localInputRetained: true,
          saveDisabled: true,
          explicitContinueRequired: true,
          automaticLatestCount: 1,
          automaticRetry: 0,
          serverMutation: 0,
        });
        session.setFinalContract({
          latest: { minimum: 2, maximum: 2 },
          actions: {
            edit: {
              count: 1,
              status: 409,
              bodyKeys: [
                'doctorOpinion',
                'recommendationText',
                'editNote',
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
