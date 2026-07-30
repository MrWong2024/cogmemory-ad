import { runB12ExecutionGroup } from "../execution/b12-execution-group-runner";
import { resolveB12BrowserEnvironment } from "../b12-env";
import {
  B12G3A2CanaryGroupHarness,
  assertB12G3A2CanaryAuthCrossCuttingEvidence,
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
  "eg-canary-auth-cross-cutting";
const owners = b12G3A2CanaryOwnersFor(executionGroup);

test.describe("B12 G3-A2 canary / auth cross-cutting group", () => {
  test.describe.configure({ timeout: 180_000 });

  test("records auth, logout, CORS, and de-identification as non-closing evidence", async ({
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
      collectValidator: assertB12G3A2CanaryAuthCrossCuttingEvidence,
    });
    const summary = await runB12ExecutionGroup({
      executionGroup,
      owners,
      setupGroup: harness.setupGroup,
      runOwner: async (context) => {
        await harness.runOwner(context, async ({ descriptor, scope }) => {
          expect(descriptor.profile).toBe("resilience-security");
          const latest = await runB12G3A2CanaryPhase(
            "shared_support",
            "B12_CANARY_AUTH_NAVIGATION_FAILED",
            () =>
              scope.navigateReadable(
                environment.frontendOrigin,
                descriptor.navigationPath,
              ),
          );
          await runB12G3A2CanaryPhase(
            "owner_assertion",
            "B12_CANARY_AUTH_BUSINESS_ASSERTION_FAILED",
            async () => {
              expect(latest).toMatchObject({
                status: "confirmed",
                qualityStatus: "passed",
                isFinal: true,
                lockedAtPresent: false,
              });
              await expect(
                scope.page.getByRole("heading", {
                  name: "访视级临床报告",
                  exact: true,
                }),
              ).toBeVisible();
              await scope.inspectPreLogoutLocalSafety();
              context.markBusinessAssertionsCompleted();
            },
          );
          await runB12G3A2CanaryPhase(
            "route_network",
            "B12_CANARY_AUTH_NETWORK_ASSERTION_FAILED",
            async () => {
              await scope.completeRouteNetwork();
              scope.assertNoProductWrites();
              context.markRouteNetworkCompleted();
              context.markSupportingEvidenceCompleted("console_network");
              context.markSupportingEvidenceCompleted("storage_url_privacy");
            },
          );
        });
      },
      minimalCleanup: harness.minimalCleanup,
      cleanupGroup: harness.cleanupGroup,
      onOwnerFinalized: harness.onOwnerFinalized,
    });
    const safeSummary = await harness.finalize(summary);
    expect(safeSummary.logoutMechanism).toBe("ui_control");
    expect(safeSummary.authLifecycleRequestCounts).not.toBeNull();
  });
});
