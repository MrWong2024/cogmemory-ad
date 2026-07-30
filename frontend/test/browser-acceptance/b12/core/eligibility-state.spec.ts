import { resolveB12BrowserEnvironment } from "../b12-env";
import { runB12CoreRoute } from "../b12-core-support";
import { executeB12CoreOwnerAction } from "./owner-actions";
import type { B12CoreRouteTarget } from "../b12-runtime-descriptor";
import { test } from "../../support/acceptance-test";

const environment = resolveB12BrowserEnvironment();

const cases = [
  ["draft-no-entry owns B12-01", "draft-no-entry"],
  ["pending-no-entry owns B12-02", "pending-no-entry"],
  [
    "confirmed-doctor-entry owns B12-03, B12-04, and B12-09 through B12-11",
    "confirmed-doctor-entry",
  ],
  ["confirmed-admin-entry owns B12-05", "confirmed-admin-entry"],
  ["denied-role-entry owns B12-06 through B12-08", "denied-role-entry"],
  ["quality-not-passed owns B12-12", "quality-not-passed"],
  ["finality-inconsistent owns B12-13", "finality-inconsistent"],
  ["confirmation-missing owns B12-14", "confirmation-missing"],
  ["visit-locked-v1 owns the primary Browser route for B12-15", "visit-locked-v1"],
  ["visit-voided-v1 owns the supporting Browser route for B12-15", "visit-voided-v1"],
  ["already-locked-no-repeat owns B12-16", "already-locked-no-repeat"],
  [
    "lock-without-locked-at-warning owns B12-17",
    "lock-without-locked-at-warning",
  ],
  [
    "locked-at-without-lock-warning owns B12-18",
    "locked-at-without-lock-warning",
  ],
  ["lock-time-mismatch-warning owns B12-19", "lock-time-mismatch-warning"],
] as const;

test.describe("B12 core / eligibility-state", () => {
  test.describe.configure({ timeout: 120_000 });

  for (const [name, routeKey] of cases) {
    test(name, async ({ roleContexts }) => {
      test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
      if (!environment.enabled) return;
      if (routeKey === "denied-role-entry") test.setTimeout(90_000);
      const target: B12CoreRouteTarget = {
        scenarioKey: "eligibility-state",
        routeKey,
      };
      await runB12CoreRoute({ environment, roleContexts, target }, async (run) => {
        await executeB12CoreOwnerAction({
          auditOwner: `core-workflow/eligibility-state/${routeKey}`,
          descriptor: run.runtimeDescriptor(),
          run,
        });
      });
    });
  }
});
