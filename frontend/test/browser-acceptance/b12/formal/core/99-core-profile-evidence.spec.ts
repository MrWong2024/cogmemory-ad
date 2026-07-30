import { expect, test } from "@playwright/test";

import { safeJsonStringify } from "../../../support/safe-output";
import {
  aggregateB12G3A3CoreProfileEvidence,
  b12G3A3CoreProfileEvidenceRunEnabled,
  b12G3A3CoreProfileEvidenceTarget,
  readB12G3A3CoreProfileEvidenceArtifact,
  readB12G3A3CoreProfileJournals,
  writeB12G3A3CoreProfileEvidenceArtifact,
} from "../b12-g3-a3-core-profile-evidence";

const enabled = b12G3A3CoreProfileEvidenceRunEnabled();

test.describe("B12 G3-A3 core / profile evidence", () => {
  test("aggregates the finalized core profile evidence without Browser fixtures", async () => {
    test.skip(
      !enabled,
      "B12_BROWSER_ACCEPTANCE_RUN=1, B12_G3_A3_CORE_RUN=1, B12_G3_A3_CORE_PROFILE_EVIDENCE_RUN=1, and B12_G3_A3_CORE_PROFILE_VERIFIER_PASS=1 are required",
    );
    if (!enabled) return;

    const journals = await readB12G3A3CoreProfileJournals();
    const artifact = aggregateB12G3A3CoreProfileEvidence({
      journals,
      profileVerifierResult: "pass",
    });
    expect(artifact.groupCount).toBe(10);
    expect(artifact.ownerCount).toBe(22);
    expect(artifact.auditClosureSnapshot).toHaveLength(62);
    expect(artifact.auditIdIntegrity).toEqual({
      expected: 62,
      actual: 62,
      missing: 0,
      duplicate: 0,
      nonCore: 0,
    });
    expect(artifact.counts).toEqual({
      passed: 62,
      failed: 0,
      blocked: 0,
      notExecuted: 0,
    });
    expect(artifact.profilePassed).toBe(true);

    const target = await writeB12G3A3CoreProfileEvidenceArtifact(
      artifact,
      b12G3A3CoreProfileEvidenceTarget(),
    );
    const persisted = await readB12G3A3CoreProfileEvidenceArtifact(target);
    expect(persisted).toEqual(artifact);
    console.log(
      `B12_G3_A3_CORE_PROFILE ${safeJsonStringify({
        phase: persisted.phase,
        evidenceScope: persisted.evidenceScope,
        closureScope: persisted.closureScope,
        profileVerifierResult: persisted.profileVerifierResult,
        groupCount: persisted.groupCount,
        ownerCount: persisted.ownerCount,
        auditCount: persisted.auditClosureSnapshot.length,
        counts: persisted.counts,
        profilePassed: persisted.profilePassed,
      })}`,
    );
  });
});
