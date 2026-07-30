import { resolveB12BrowserEnvironment } from "../b12-env";
import { runB12CoreRoute } from "../b12-core-support";
import { executeB12CoreOwnerAction } from "./owner-actions";
import type { B12CoreRouteTarget } from "../b12-runtime-descriptor";
import { test } from "../../support/acceptance-test";

const environment = resolveB12BrowserEnvironment();

const cases = [
  [
    "irreversible-disclosure owns B12-20 through B12-25, B12-28, and B12-29",
    "irreversible-disclosure",
  ],
  [
    "validation-request-contract owns B12-26, B12-27, and B12-30 through B12-32",
    "validation-request-contract",
  ],
] as const;

test.describe("B12 core / lock-form-contract", () => {
  test.describe.configure({ timeout: 120_000 });

  for (const [name, routeKey] of cases) {
    test(name, async ({ roleContexts }) => {
      test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
      if (!environment.enabled) return;
      if (routeKey === "validation-request-contract") test.setTimeout(60_000);
      const target: B12CoreRouteTarget = {
        scenarioKey: "lock-form-contract",
        routeKey,
      };
      await runB12CoreRoute({ environment, roleContexts, target }, async (run) => {
        await executeB12CoreOwnerAction({
          auditOwner: `core-workflow/lock-form-contract/${routeKey}`,
          descriptor: run.runtimeDescriptor(),
          run,
        });
      });
    });
  }
});
