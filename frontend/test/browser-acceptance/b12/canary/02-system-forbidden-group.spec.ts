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
  "eg-canary-system-forbidden";
const owners = b12G3A2CanaryOwnersFor(executionGroup);

async function assertNoProtectedReportSurface(
  page: Parameters<typeof assertNoAvailableLockEntry>[0],
): Promise<void> {
  for (const ariaLabelledBy of [
    "clinical-report-patient-snapshot-heading",
    "clinical-report-visit-snapshot-heading",
    "clinical-report-narrative-heading",
    "clinical-report-clinician-narrative-heading",
    "clinical-report-workflow-summary-heading",
  ]) {
    await expect(
      page.locator(`section[aria-labelledby="${ariaLabelledBy}"]`),
    ).toHaveCount(0);
  }
  for (const heading of ["报告工作流摘要", "报告锁定", "锁定摘要"]) {
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toHaveCount(0);
  }
  await assertNoAvailableLockEntry(page);
}

test.describe("B12 G3-A2 canary / system forbidden group", () => {
  test.describe.configure({ timeout: 180_000 });

  test("uses a real system 403 and scripted logout fallback", async ({
    roleContexts,
  }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    const harness = await B12G3A2CanaryGroupHarness.create({
      executionGroup,
      owners,
      expectedRole: "system",
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
          const forbiddenResponse = await runB12G3A2CanaryPhase(
            "shared_support",
            "B12_CANARY_SYSTEM_NAVIGATION_FAILED",
            () =>
              scope.navigateForbidden(
                environment.frontendOrigin,
                descriptor.navigationPath,
              ),
          );
          await runB12G3A2CanaryPhase(
            "owner_assertion",
            "B12_CANARY_SYSTEM_BUSINESS_ASSERTION_FAILED",
            async () => {
              expect(forbiddenResponse.status()).toBe(403);
              await expect(
                scope.page.getByRole("heading", {
                  name: "当前账号没有访问评估访视的权限",
                  exact: true,
                }),
              ).toBeVisible();
              await expect(
                scope.page.getByText("患者 / 受试者编号：", { exact: false }),
              ).toHaveCount(0);
              await assertNoProtectedReportSurface(scope.page);
              context.markBusinessAssertionsCompleted();
            },
          );
          await runB12G3A2CanaryPhase(
            "route_network",
            "B12_CANARY_SYSTEM_NETWORK_ASSERTION_FAILED",
            async () => {
              const entries = await scope.completeRouteNetwork();
              expect(
                entries.filter(
                  ({ method, status, safeUrlPattern }) =>
                    method === "GET" &&
                    status === 403 &&
                    safeUrlPattern.startsWith("/patients/"),
                ),
              ).toHaveLength(1);
              expect(
                entries.filter(
                  ({ method, status, safeUrlPattern }) =>
                    method === "GET" &&
                    status === 200 &&
                    safeUrlPattern.endsWith("/clinical-reports/latest"),
                ),
              ).toHaveLength(0);
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
    const safeSummary = await harness.finalize(summary);
    expect(safeSummary.logoutMechanism).toBe("scripted_cleanup_fallback");
  });
});
