import { resolveB12BrowserEnvironment } from "../../b12-env";
import { runB12G3A3CoreGroup } from "../b12-g3-a3-core-support";
import { b12G3A3CoreRunEnabled } from "../b12-g3-a3-core-runtime";
import { test } from "../../../support/acceptance-test";

const environment = resolveB12BrowserEnvironment();
const enabled = b12G3A3CoreRunEnabled();

test.describe("B12 G3-A3 core / lock form group", () => {
  test.describe.configure({ timeout: 300_000 });
  test("runs eg-lock-form-read-only", async ({ roleContexts }) => {
    test.skip(
      !enabled,
      "B12_BROWSER_ACCEPTANCE_RUN=1 and B12_G3_A3_CORE_RUN=1 are required",
    );
    if (!enabled || !environment.enabled) return;
    await runB12G3A3CoreGroup({
      executionGroup: "eg-lock-form-read-only",
      environment,
      roleContexts,
    });
  });
});
