import { runB12ExecutionGroup } from "../execution/b12-execution-group-runner";
import { resolveB12BrowserEnvironment } from "../b12-env";
import {
  B12_NEUTRAL_TEXT,
  assertNoA21WriteControls,
  assertNoAvailableLockEntry,
  assertReportNarrativeSectionsExcludeText,
  reportNarrativeSections,
} from "../b12-core-support";
import {
  B12G3A2CanaryGroupHarness,
  assertCanaryDescriptorIsCore,
  b12G3A2CanaryLogoutTarget,
  runB12G3A2CanaryPhase,
} from "./b12-g3-a2-canary-support";
import {
  B12_G3_A2_CANARY_LOCK_SAFE_PATTERN,
  parseB12G3A2CanaryLockResponse,
} from "./b12-g3-a2-canary-owner-scope";
import {
  b12G3A2CanaryOwnersFor,
  type B12G3A2CanaryExecutionGroup,
} from "./b12-g3-a2-canary-types";
import { b12G3A2CanaryJournalTarget } from "./b12-g3-a2-canary-journal";
import { expect, test } from "../../support/acceptance-test";

const environment = resolveB12BrowserEnvironment();
const executionGroup: B12G3A2CanaryExecutionGroup =
  "eg-canary-doctor-lock-write";
const owners = b12G3A2CanaryOwnersFor(executionGroup);

test.describe("B12 G3-A2 canary / doctor lock write group", () => {
  test.describe.configure({ timeout: 180_000 });

  test("performs one real doctor A22 behind a pending request gate", async ({
    roleContexts,
  }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    const harness = await B12G3A2CanaryGroupHarness.create({
      executionGroup,
      owners,
      expectedRole: "doctor",
      logoutTarget: b12G3A2CanaryLogoutTarget(executionGroup),
      environment,
      roleContexts,
      journalTarget: b12G3A2CanaryJournalTarget(executionGroup),
    });
    const summary = await runB12ExecutionGroup({
      executionGroup,
      owners,
      setupGroup: harness.setupGroup,
      runOwner: async (context) => {
        await harness.runOwner(context, async ({ descriptor, scope }) => {
          assertCanaryDescriptorIsCore(descriptor);
          const latest = await runB12G3A2CanaryPhase(
            "shared_support",
            "B12_CANARY_LOCK_NAVIGATION_FAILED",
            () =>
              scope.navigateReadable(
                environment.frontendOrigin,
                descriptor.navigationPath,
              ),
          );
          await runB12G3A2CanaryPhase(
            "owner_assertion",
            "B12_CANARY_LOCK_BUSINESS_ASSERTION_FAILED",
            async () => {
              expect(latest).toMatchObject({
                status: "confirmed",
                qualityStatus: "passed",
                isFinal: true,
                lockedAtPresent: false,
                lock: { present: false },
              });
              await scope.page
                .getByRole("button", { name: "准备锁定报告", exact: true })
                .click();
              const noteField = scope.page.getByLabel(
                "锁定流程说明（必填）",
                { exact: true },
              );
              const checkbox = scope.page.locator(
                "#clinical-report-lock-confirmed",
              );
              const submit = scope.page.getByRole("button", {
                name: "确认不可逆锁定",
                exact: true,
              });
              await noteField.fill(`  ${B12_NEUTRAL_TEXT.doctorLock}  `);
              await checkbox.check();
              await expect(submit).toBeEnabled();
              scope.expectNextLockRequest(
                B12_NEUTRAL_TEXT.doctorLock,
                latest.updatedAt,
              );
              const gate = await scope.installLockPendingGate();
              const responsePromise = scope.waitForLockResponse();
              const triggerPromise = submit.click();
              scope.registerPendingTask(triggerPromise);
              await gate.waitForStarted();
              await expect(
                scope.page.getByRole("button", {
                  name: "正在不可逆锁定报告",
                  exact: true,
                }),
              ).toBeDisabled();
              await expect(noteField).toBeDisabled();
              await expect(checkbox).toBeDisabled();
              await expect(
                scope.page.getByRole("button", { name: "取消", exact: true }),
              ).toBeDisabled();
              await assertNoA21WriteControls(scope.page);
              await expect(reportNarrativeSections(scope.page).first()).toBeVisible();
              gate.resume();
              await triggerPromise;
              const response = await responsePromise;
              expect(response.status()).toBe(200);
              const lockFacts = await parseB12G3A2CanaryLockResponse(
                response,
                B12_NEUTRAL_TEXT.doctorLock,
              );
              expect(lockFacts).toMatchObject({
                report: {
                  status: "confirmed",
                  lockedAtPresent: true,
                  lock: {
                    present: true,
                    lockedAtPresent: true,
                    lockNotePresent: true,
                  },
                },
                receiptPresent: true,
                alreadyLocked: false,
                receiptLockedAtPresent: true,
                receiptLockNotePresent: true,
                receiptLockNoteMatchesExpected: true,
              });
              await expect(
                scope.page.getByText("首次不可逆锁定成功", { exact: false }).first(),
              ).toBeVisible();
              await expect(
                scope.page.getByRole("heading", {
                  name: "报告已锁定",
                  exact: true,
                }),
              ).toBeVisible();
              await expect(
                scope.page.getByRole("heading", {
                  name: "锁定摘要",
                  exact: true,
                }),
              ).toBeVisible();
              await assertNoAvailableLockEntry(scope.page);
              await assertReportNarrativeSectionsExcludeText(
                scope.page,
                B12_NEUTRAL_TEXT.doctorLock,
              );
              context.markBusinessAssertionsCompleted();
            },
          );
          await runB12G3A2CanaryPhase(
            "route_network",
            "B12_CANARY_LOCK_NETWORK_ASSERTION_FAILED",
            async () => {
              const entries = await scope.completeRouteNetwork();
              scope.assertSingleLockWithoutRetryOrPolling();
              expect(
                entries.filter(
                  ({ method, safeUrlPattern, status }) =>
                    method === "POST" &&
                    safeUrlPattern === B12_G3_A2_CANARY_LOCK_SAFE_PATTERN &&
                    status === 200,
                ),
              ).toHaveLength(1);
              for (const suffix of [
                "/freeze-sources",
                "/archive",
                "/corrections",
              ]) {
                expect(
                  entries.filter(
                    ({ method, safeUrlPattern }) =>
                      method === "POST" && safeUrlPattern.endsWith(suffix),
                  ),
                ).toHaveLength(0);
              }
              expect(scope.lockRequestFacts()).toEqual([
                {
                  bodyKeys: ["confirm", "expectedUpdatedAt", "lockNote"],
                  confirmIsTrue: true,
                  expectedUpdatedAtMatchesLatest: true,
                  lockNoteTrimmed: true,
                  lockNoteMatchesExpected: true,
                  forbiddenBodyKeyDetected: false,
                },
              ]);
              context.markRouteNetworkCompleted();
              context.markSupportingEvidenceCompleted("console_network");
            },
          );
        });
      },
      minimalCleanup: harness.minimalCleanup,
      cleanupGroup: harness.cleanupGroup,
      onOwnerFinalized: harness.onOwnerFinalized,
    });
    await harness.finalize(summary);
  });
});
