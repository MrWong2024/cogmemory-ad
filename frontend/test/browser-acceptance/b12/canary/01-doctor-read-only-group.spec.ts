import { runB12ExecutionGroup } from "../execution/b12-execution-group-runner";
import { resolveB12BrowserEnvironment } from "../b12-env";
import { assertNoAvailableLockEntry } from "../b12-core-support";
import {
  B12G3A2CanaryGroupHarness,
  assertCanaryDescriptorIsCore,
  b12G3A2CanaryLogoutTarget,
  runB12G3A2CanaryPhase,
} from "./b12-g3-a2-canary-support";
import {
  b12G3A2CanaryOwnersFor,
  type B12G3A2CanaryExecutionGroup,
} from "./b12-g3-a2-canary-types";
import { b12G3A2CanaryJournalTarget } from "./b12-g3-a2-canary-journal";
import { expect, test } from "../../support/acceptance-test";

const environment = resolveB12BrowserEnvironment();
const executionGroup: B12G3A2CanaryExecutionGroup =
  "eg-canary-doctor-read-only";
const owners = b12G3A2CanaryOwnersFor(executionGroup);

test.describe("B12 G3-A2 canary / doctor read-only group", () => {
  test.describe.configure({ timeout: 240_000 });

  test("runs draft, pending, and finality owners in one doctor Session", async ({
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
        await harness.runOwner(context, async ({ owner, descriptor, scope }) => {
          assertCanaryDescriptorIsCore(descriptor);
          if (owner.auditOwner.endsWith("/finality-inconsistent")) {
            await runB12G3A2CanaryPhase(
              "shared_support",
              "B12_CANARY_FINALITY_INTERCEPT_INSTALL_FAILED",
              () => scope.installFinalityControlledRead(),
            );
          }
          const latest = await runB12G3A2CanaryPhase(
            "shared_support",
            "B12_CANARY_READ_ONLY_NAVIGATION_FAILED",
            () =>
              scope.navigateReadable(
                environment.frontendOrigin,
                descriptor.navigationPath,
              ),
          );
          await runB12G3A2CanaryPhase(
            "owner_assertion",
            "B12_CANARY_READ_ONLY_BUSINESS_ASSERTION_FAILED",
            async () => {
              if (owner.auditOwner.endsWith("/draft-no-entry")) {
                expect(latest).toMatchObject({
                  status: "draft",
                  isFinal: false,
                  lockedAtPresent: false,
                });
                await expect(
                  scope.page.getByText("规则化报告草稿", { exact: true }).first(),
                ).toBeVisible();
              } else if (owner.auditOwner.endsWith("/pending-no-entry")) {
                expect(latest).toMatchObject({
                  status: "pending_confirmation",
                  isFinal: false,
                  lockedAtPresent: false,
                });
                await expect(
                  scope.page.getByText("待医生确认", { exact: true }).first(),
                ).toBeVisible();
              } else {
                expect(latest).toMatchObject({
                  status: "confirmed",
                  qualityStatus: "passed",
                  isFinal: false,
                  lockedAtPresent: false,
                });
                await expect(
                  scope.page
                    .getByText("报告状态与最终性标记不一致，请联系管理员。", {
                      exact: true,
                    })
                    .first(),
                ).toBeVisible();
              }
              await assertNoAvailableLockEntry(scope.page);
              context.markBusinessAssertionsCompleted();
            },
          );
          await runB12G3A2CanaryPhase(
            "route_network",
            "B12_CANARY_READ_ONLY_NETWORK_ASSERTION_FAILED",
            async () => {
              await scope.completeRouteNetwork();
              scope.assertNoProductWrites();
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
