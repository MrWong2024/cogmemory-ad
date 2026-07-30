import { resolveB12BrowserEnvironment } from "../b12-env";
import { runB12CoreRoute } from "../b12-core-support";
import { executeB12CoreOwnerAction } from "./owner-actions";
import type { B12CoreRouteTarget } from "../b12-runtime-descriptor";
import { test } from "../../support/acceptance-test";

const environment = resolveB12BrowserEnvironment();

const cases = [
  [
    "doctor-lock-success owns B12-33 through B12-40, B12-44, and B12-46 through B12-48",
    "doctor-lock-success",
  ],
  [
    "admin-lock-success owns B12-45 and supporting first-lock response evidence",
    "admin-lock-success",
  ],
  [
    "already-locked-idempotency owns B12-41 through B12-43",
    "already-locked-idempotency",
  ],
] as const;

test.describe("B12 core / success-idempotency", () => {
  test.describe.configure({ timeout: 120_000 });

  for (const [name, routeKey] of cases) {
    test(name, async ({ roleContexts }) => {
      test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
      if (!environment.enabled) return;
      test.setTimeout(120_000);
      const target: B12CoreRouteTarget = {
        scenarioKey: "success-idempotency",
        routeKey,
      };
      await runB12CoreRoute({ environment, roleContexts, target }, async (run) => {
        await executeB12CoreOwnerAction({
          auditOwner: `core-workflow/success-idempotency/${routeKey}`,
          descriptor: run.runtimeDescriptor(),
          run,
        });
      });
    });
  }
});
