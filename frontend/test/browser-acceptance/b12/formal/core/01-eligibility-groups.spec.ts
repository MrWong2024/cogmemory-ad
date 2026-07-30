import { resolveB12BrowserEnvironment } from "../../b12-env";
import { runB12G3A3CoreGroup } from "../b12-g3-a3-core-support";
import { b12G3A3CoreRunEnabled } from "../b12-g3-a3-core-runtime";
import type { B12G3A3CoreExecutionGroup } from "../b12-g3-a3-formal-types";
import { test } from "../../../support/acceptance-test";

const environment = resolveB12BrowserEnvironment();
const enabled = b12G3A3CoreRunEnabled();

const groups = [
  "eg-doctor-eligibility-read-only",
  "eg-admin-eligibility-read-only",
  "eg-denied-roles",
] as const satisfies readonly B12G3A3CoreExecutionGroup[];

test.describe("B12 G3-A3 core / eligibility groups", () => {
  test.describe.configure({ timeout: 900_000 });
  for (const executionGroup of groups) {
    test(`runs ${executionGroup}`, async ({ roleContexts }) => {
      test.skip(
        !enabled,
        "B12_BROWSER_ACCEPTANCE_RUN=1 and B12_G3_A3_CORE_RUN=1 are required",
      );
      if (!enabled || !environment.enabled) return;
      await runB12G3A3CoreGroup({ executionGroup, environment, roleContexts });
    });
  }
});
