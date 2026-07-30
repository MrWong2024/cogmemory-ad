import { resolveB12BrowserEnvironment } from "../b12-env";
import { runB12CoreRoute } from "../b12-core-support";
import { executeB12CoreOwnerAction } from "./owner-actions";
import { test } from "../../support/acceptance-test";

const environment = resolveB12BrowserEnvironment();
const target = {
  scenarioKey: "locked-readonly" as const,
  routeKey: "locked-readonly-semantics",
};

test.describe("B12 core / locked-readonly", () => {
  test.describe.configure({ timeout: 120_000 });

  test("locked-readonly-semantics owns B12-64 through B12-70", async ({
    roleContexts,
  }) => {
    test.skip(!environment.enabled, "B12_BROWSER_ACCEPTANCE_RUN=1 is required");
    if (!environment.enabled) return;
    await runB12CoreRoute({ environment, roleContexts, target }, async (run) => {
      await executeB12CoreOwnerAction({
        auditOwner:
          "core-workflow/locked-readonly/locked-readonly-semantics",
        descriptor: run.runtimeDescriptor(),
        run,
      });
    });
  });
});
