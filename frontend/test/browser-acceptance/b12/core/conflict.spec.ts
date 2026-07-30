import { resolveB12BrowserEnvironment } from "../b12-env";
import { runB12CoreRoute } from "../b12-core-support";
import { executeB12CoreOwnerAction } from "./owner-actions";
import type { B12CoreRouteTarget } from "../b12-runtime-descriptor";
import { test } from "../../support/acceptance-test";

const environment = resolveB12BrowserEnvironment();

const cases = [
  ["lock-conflict-continue owns B12-49 through B12-54", "lock-conflict-continue"],
  ["lock-conflict-latest-locked owns B12-55", "lock-conflict-latest-locked"],
] as const;

test.describe("B12 core / conflict", () => {
  for (const [name, routeKey] of cases) {
    test(name, async ({ roleContexts }) => {
      test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
      if (!environment.enabled) return;
      test.setTimeout(180_000);
      const target: B12CoreRouteTarget = {
        scenarioKey: "conflict",
        routeKey,
      };
      await runB12CoreRoute({ environment, roleContexts, target }, async (run) => {
        await executeB12CoreOwnerAction({
          auditOwner: `core-workflow/conflict/${routeKey}`,
          descriptor: run.runtimeDescriptor(),
          run,
        });
      });
    });
  }
});
