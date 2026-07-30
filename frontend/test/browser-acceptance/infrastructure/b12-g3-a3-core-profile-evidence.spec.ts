import { lstat, readdir } from "node:fs/promises";
import path from "node:path";

import type { B12ExecutionGroupSummary } from "../b12/execution/b12-execution-group-runner";
import type { B12OwnerJournalRecord } from "../b12/execution/b12-owner-result-journal";
import {
  computeB12CoreAuditClosure,
  type B12G3A3ProfileVerifierResult,
} from "../b12/formal/b12-g3-a3-core-evidence";
import {
  B12_G3_A3_CORE_GROUPS,
  B12_G3_A3_CORE_OWNERS,
  b12G3A3CoreOwner,
  b12G3A3CoreOwnersFor,
} from "../b12/formal/b12-g3-a3-core-registry";
import {
  aggregateB12G3A3CoreProfileEvidence,
  b12G3A3CoreProfileEvidenceRunEnabled,
  readB12G3A3CoreProfileEvidenceArtifact,
  removeB12G3A3CoreProfileEvidenceArtifact,
  validateB12G3A3CoreProfileEvidenceArtifact,
  writeB12G3A3CoreProfileEvidenceArtifact,
  type B12G3A3CoreProfileEvidenceArtifact,
} from "../b12/formal/b12-g3-a3-core-profile-evidence";
import {
  B12G3A3CoreAtomicJournal,
  createB12G3A3CoreGroupOutcome,
  validateB12G3A3CoreJournalDocument,
  type B12G3A3CoreJournalDocument,
} from "../b12/formal/b12-g3-a3-core-journal";
import {
  B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
  B12_G3_A3_CORE_EVIDENCE_SCOPE,
  B12_G3_A3_CORE_JOURNAL_VERSION,
  B12_G3_A3_CORE_PHASE,
  B12_G3_A3_GROUP_PROVISIONAL_CLOSURE_SCOPE,
  type B12G3A3CoreExecutionGroup,
  type B12G3A3CoreGroupOutcome,
} from "../b12/formal/b12-g3-a3-formal-types";
import { safeJsonStringify } from "../support/safe-output";
import { expect, test } from "../support/acceptance-test";

function passedRecord(auditOwner: string): B12OwnerJournalRecord {
  const owner = b12G3A3CoreOwner(auditOwner);
  return Object.freeze({
    auditOwner: owner.auditOwner,
    executionGroup: owner.executionGroup,
    fixtureCluster: owner.fixtureCluster,
    started: true,
    businessAssertionsCompleted: true,
    routeNetworkCompleted: true,
    minimalCleanupCompleted: true,
    result: "pass",
    failureCategory: "none",
    directAuditIds: Object.freeze([...owner.directAuditIds]),
    supportingEvidenceCompleted: Object.freeze([]),
  });
}

function passingSummary(
  executionGroup: B12G3A3CoreExecutionGroup,
  ownerResults: readonly B12OwnerJournalRecord[],
  overrides: Partial<B12ExecutionGroupSummary> = {},
): B12ExecutionGroupSummary {
  return Object.freeze({
    executionGroup,
    stopReason: "none",
    groupSetupSucceeded: true,
    groupCleanupSucceeded: true,
    profileCompletionBlocked: false,
    ownerResults: Object.freeze([...ownerResults]),
    ...overrides,
  });
}

function journalDocument(
  executionGroup: B12G3A3CoreExecutionGroup,
): B12G3A3CoreJournalDocument {
  const ownerRecords = Object.freeze(
    b12G3A3CoreOwnersFor(executionGroup).map(({ auditOwner }) =>
      passedRecord(auditOwner),
    ),
  );
  const groupOutcome = createB12G3A3CoreGroupOutcome(
    executionGroup,
    ownerRecords,
    passingSummary(executionGroup, ownerRecords),
  );
  return Object.freeze({
    version: B12_G3_A3_CORE_JOURNAL_VERSION,
    phase: B12_G3_A3_CORE_PHASE,
    evidenceScope: B12_G3_A3_CORE_EVIDENCE_SCOPE,
    auditClosureAllowed: B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
    executionGroup,
    state: "finalized",
    ownerRecords,
    groupProvisionalClosureSnapshot: Object.freeze({
      closureScope: B12_G3_A3_GROUP_PROVISIONAL_CLOSURE_SCOPE,
      profileVerifierResult: "not_executed",
      auditClosureEntries: computeB12CoreAuditClosure({
        evidenceScope: B12_G3_A3_CORE_EVIDENCE_SCOPE,
        auditClosureAllowed: B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
        ownerRecords,
      }),
    }),
    groupOutcome,
  });
}

function completeJournals(): readonly B12G3A3CoreJournalDocument[] {
  return Object.freeze(
    B12_G3_A3_CORE_GROUPS.map(({ executionGroup }) =>
      journalDocument(executionGroup),
    ),
  );
}

function closureFor(
  auditId: string,
  records: readonly B12OwnerJournalRecord[],
  profileVerifierResult: B12G3A3ProfileVerifierResult = "pass",
) {
  const entry = computeB12CoreAuditClosure(
    {
      evidenceScope: B12_G3_A3_CORE_EVIDENCE_SCOPE,
      auditClosureAllowed: B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
      ownerRecords: records,
    },
    B12_G3_A3_CORE_OWNERS,
    profileVerifierResult,
  ).find((candidate) => candidate.auditId === auditId);
  if (!entry) throw new Error("SYNTHETIC_PROFILE_CLOSURE_MISSING");
  return entry;
}

function withGroupOutcome(
  journal: B12G3A3CoreJournalDocument,
  groupOutcome: B12G3A3CoreGroupOutcome,
): B12G3A3CoreJournalDocument {
  return Object.freeze({ ...journal, groupOutcome });
}

function completeArtifact(
  profileVerifierResult: B12G3A3ProfileVerifierResult = "pass",
): B12G3A3CoreProfileEvidenceArtifact {
  return aggregateB12G3A3CoreProfileEvidence({
    journals: completeJournals(),
    profileVerifierResult,
  });
}

test("keeps appending group journal outcome null", async ({}, testInfo) => {
  const target = testInfo.outputPath("appending-group.json");
  const journal = await B12G3A3CoreAtomicJournal.create({
    executionGroup: "eg-core-locked-read-only",
    target,
  });
  try {
    await journal.onOwnerFinalized(
      passedRecord(
        "core-workflow/locked-readonly/locked-readonly-semantics",
      ),
    );
    const document = await journal.read();
    expect(document.state).toBe("appending");
    expect(document.groupOutcome).toBeNull();
  } finally {
    await journal.remove().catch(() => false);
  }
});

test("requires finalized group journal outcome", () => {
  const journal = journalDocument("eg-core-locked-read-only");
  expect(() =>
    validateB12G3A3CoreJournalDocument({
      ...journal,
      groupOutcome: null,
    }),
  ).toThrow("B12_FORMAL_CORE_GROUP_OUTCOME_STATE_INVALID");
});

test("marks cleanup failure as not operationally passed", () => {
  const group = "eg-core-locked-read-only";
  const records = journalDocument(group).ownerRecords;
  const outcome = createB12G3A3CoreGroupOutcome(
    group,
    records,
    passingSummary(group, records, {
      groupCleanupSucceeded: false,
      profileCompletionBlocked: true,
    }),
  );
  expect(outcome.operationallyPassed).toBe(false);
  expect(outcome.profileCompletionBlockedByGroup).toBe(true);
});

test("marks non-none stop reason as not operationally passed", () => {
  const group = "eg-core-locked-read-only";
  const records = journalDocument(group).ownerRecords;
  const outcome = createB12G3A3CoreGroupOutcome(
    group,
    records,
    passingSummary(group, records, {
      stopReason: "owner_cleanup_failed",
      profileCompletionBlocked: true,
    }),
  );
  expect(outcome.operationallyPassed).toBe(false);
});

test("does not operationally pass when owners are not all finalized", () => {
  const group = "eg-lock-form-read-only";
  const records = journalDocument(group).ownerRecords.slice(0, 1);
  const outcome = createB12G3A3CoreGroupOutcome(
    group,
    records,
    passingSummary(group, records),
  );
  expect(outcome.allOwnersFinalized).toBe(false);
  expect(outcome.operationallyPassed).toBe(false);
});

test("rejects group provisional closure presented as profile closure", () => {
  const journal = journalDocument("eg-core-locked-read-only");
  expect(() =>
    validateB12G3A3CoreJournalDocument({
      ...journal,
      groupProvisionalClosureSnapshot: {
        ...journal.groupProvisionalClosureSnapshot,
        closureScope: "profile_final",
      },
    }),
  ).toThrow("B12_FORMAL_CORE_PROVISIONAL_CLOSURE_INVALID");
});

test("keeps other groups and the profile verifier unresolved in provisional closure", () => {
  const journal = journalDocument("eg-doctor-lock-write");
  const byAuditId = new Map(
    journal.groupProvisionalClosureSnapshot.auditClosureEntries.map((entry) => [
      entry.auditId,
      entry,
    ]),
  );
  expect(byAuditId.get("B12-35")?.result).toBe(
    "blocked_by_supporting_owner",
  );
  expect(byAuditId.get("B12-33")?.result).toBe(
    "blocked_by_profile_verifier",
  );
  expect(byAuditId.get("B12-45")?.result).toBe("not_executed");
});

test("keeps group outcome free of dynamic or sensitive fields", () => {
  const outcome = journalDocument("eg-core-locked-read-only").groupOutcome;
  expect(Object.keys(outcome ?? {}).sort()).toEqual(
    [
      "allMinimalCleanupCompleted",
      "allOwnersFinalized",
      "allOwnersPassed",
      "expectedOwnerCount",
      "groupCleanupSucceeded",
      "groupSetupSucceeded",
      "operationallyPassed",
      "ownerCount",
      "profileCompletionBlockedByGroup",
      "stopReason",
    ].sort(),
  );
  expect(safeJsonStringify(outcome)).not.toMatch(
    /elapsed|namespace|runtime|account|url|cookie|session|patient|visit|report|error|stack/i,
  );
});

test("accepts exactly 10 finalized groups and 22 passed owners", () => {
  const artifact = completeArtifact();
  expect(artifact).toMatchObject({
    groupCount: 10,
    ownerCount: 22,
    profilePassed: true,
  });
});

test("rejects a missing execution group", () => {
  expect(() =>
    aggregateB12G3A3CoreProfileEvidence({
      journals: completeJournals().slice(0, -1),
      profileVerifierResult: "pass",
    }),
  ).toThrow("B12_FORMAL_CORE_PROFILE_GROUP_COUNT_INVALID");
});

test("rejects a duplicate execution group", () => {
  const journals = completeJournals();
  expect(() =>
    aggregateB12G3A3CoreProfileEvidence({
      journals: Object.freeze([...journals.slice(0, -1), journals[0]]),
      profileVerifierResult: "pass",
    }),
  ).toThrow("B12_FORMAL_CORE_PROFILE_GROUP_DUPLICATE");
});

test("rejects a missing owner", () => {
  const journals = completeJournals();
  const first = journals[0];
  const incomplete = Object.freeze({
    ...first,
    ownerRecords: Object.freeze(first.ownerRecords.slice(1)),
  });
  expect(() =>
    aggregateB12G3A3CoreProfileEvidence({
      journals: Object.freeze([incomplete, ...journals.slice(1)]),
      profileVerifierResult: "pass",
    }),
  ).toThrow();
});

test("rejects a duplicate owner", () => {
  const journals = completeJournals();
  const first = journals[0];
  const duplicateOwner = Object.freeze({
    ...first,
    ownerRecords: Object.freeze([
      first.ownerRecords[0],
      first.ownerRecords[0],
      ...first.ownerRecords.slice(2),
    ]),
  });
  expect(() =>
    aggregateB12G3A3CoreProfileEvidence({
      journals: Object.freeze([duplicateOwner, ...journals.slice(1)]),
      profileVerifierResult: "pass",
    }),
  ).toThrow("B12_FORMAL_CORE_PROFILE_OWNER_DUPLICATE");
});

test("rejects an owner assigned to the wrong group", () => {
  const journals = completeJournals();
  const first = journals[0];
  const wrongGroup = Object.freeze({
    ...first.ownerRecords[0],
    executionGroup: "eg-admin-eligibility-read-only",
  });
  const mismatched = Object.freeze({
    ...first,
    ownerRecords: Object.freeze([wrongGroup, ...first.ownerRecords.slice(1)]),
  });
  expect(() =>
    aggregateB12G3A3CoreProfileEvidence({
      journals: Object.freeze([mismatched, ...journals.slice(1)]),
      profileVerifierResult: "pass",
    }),
  ).toThrow("B12_FORMAL_CORE_PROFILE_OWNER_GROUP_MISMATCH");
});

test("rejects an appending journal", () => {
  const journals = completeJournals();
  const appending = Object.freeze({
    ...journals[0],
    state: "appending" as const,
    groupOutcome: null,
  });
  expect(() =>
    aggregateB12G3A3CoreProfileEvidence({
      journals: Object.freeze([appending, ...journals.slice(1)]),
      profileVerifierResult: "pass",
    }),
  ).toThrow("B12_FORMAL_CORE_PROFILE_JOURNAL_NOT_FINALIZED");
});

test("rejects a canary evidence scope", () => {
  const journals = completeJournals();
  const canary = Object.freeze({
    ...journals[0],
    evidenceScope: "canary_only",
    auditClosureAllowed: false,
  });
  expect(() =>
    aggregateB12G3A3CoreProfileEvidence({
      journals: Object.freeze([
        canary as unknown as B12G3A3CoreJournalDocument,
        ...journals.slice(1),
      ]),
      profileVerifierResult: "pass",
    }),
  ).toThrow("B12_FORMAL_CORE_JOURNAL_DOCUMENT_INVALID");
});

test("rejects a finalized group with cleanup failure", () => {
  const journals = completeJournals();
  const first = journals[0];
  const failedOutcome = Object.freeze({
    ...(first.groupOutcome as B12G3A3CoreGroupOutcome),
    groupCleanupSucceeded: false,
    profileCompletionBlockedByGroup: true,
    operationallyPassed: false,
  });
  expect(() =>
    aggregateB12G3A3CoreProfileEvidence({
      journals: Object.freeze([
        withGroupOutcome(first, failedOutcome),
        ...journals.slice(1),
      ]),
      profileVerifierResult: "pass",
    }),
  ).toThrow("B12_FORMAL_CORE_PROFILE_GROUP_OUTCOME_REJECTED");
});

test("passes B12-15 only when locked and voided owners pass", () => {
  const locked = passedRecord(
    "core-workflow/eligibility-state/visit-locked-v1",
  );
  const voided = passedRecord(
    "core-workflow/eligibility-state/visit-voided-v1",
  );
  expect(closureFor("B12-15", [locked, voided]).result).toBe("pass");
});

test("blocks B12-15 when the voided supporting owner is missing", () => {
  const locked = passedRecord(
    "core-workflow/eligibility-state/visit-locked-v1",
  );
  expect(closureFor("B12-15", [locked]).result).toBe(
    "blocked_by_supporting_owner",
  );
});

test("continues B12-35 through B12-38 only when doctor and admin owners pass", () => {
  const doctor = passedRecord(
    "core-workflow/success-idempotency/doctor-lock-success",
  );
  const admin = passedRecord(
    "core-workflow/success-idempotency/admin-lock-success",
  );
  for (const auditId of ["B12-35", "B12-36", "B12-37", "B12-38"]) {
    expect(closureFor(auditId, [doctor, admin], "pass").result).toBe("pass");
  }
});

test("blocks B12-35 through B12-38 when the admin owner is missing", () => {
  const doctor = passedRecord(
    "core-workflow/success-idempotency/doctor-lock-success",
  );
  for (const auditId of ["B12-35", "B12-36", "B12-37", "B12-38"]) {
    expect(closureFor(auditId, [doctor], "pass").result).toBe(
      "blocked_by_supporting_owner",
    );
  }
});

test("blocks database-terminal IDs when verifier is not executed", () => {
  const artifact = completeArtifact("not_executed");
  expect(
    artifact.auditClosureSnapshot.find(({ auditId }) => auditId === "B12-45")
      ?.result,
  ).toBe("blocked_by_profile_verifier");
  expect(artifact.profilePassed).toBe(false);
});

test("does not pass the profile when verifier fails", () => {
  const artifact = completeArtifact("fail");
  expect(artifact.profilePassed).toBe(false);
  expect(artifact.counts.blocked).toBeGreaterThan(0);
});

test("removes verifier blocking only after verifier pass with complete owners", () => {
  const artifact = completeArtifact("pass");
  expect(artifact.counts.blocked).toBe(0);
  expect(artifact.profilePassed).toBe(true);
});

test("does not rewrite pure UI owner journals for any verifier result", () => {
  const journals = completeJournals();
  const before = safeJsonStringify(journals);
  for (const profileVerifierResult of [
    "not_executed",
    "fail",
    "pass",
  ] as const) {
    aggregateB12G3A3CoreProfileEvidence({
      journals,
      profileVerifierResult,
    });
  }
  expect(safeJsonStringify(journals)).toBe(before);
  expect(
    completeArtifact("fail").auditClosureSnapshot.find(
      ({ auditId }) => auditId === "B12-01",
    )?.result,
  ).toBe("pass");
});

test("produces exactly 62 final core closure entries", () => {
  expect(completeArtifact().auditClosureSnapshot).toHaveLength(62);
});

test("produces exactly 62 passes for complete successful evidence", () => {
  expect(completeArtifact().counts).toEqual({
    passed: 62,
    failed: 0,
    blocked: 0,
    notExecuted: 0,
  });
});

test("keeps missing duplicate and non-core Audit ID counts at zero", () => {
  expect(completeArtifact().auditIdIntegrity).toEqual({
    expected: 62,
    actual: 62,
    missing: 0,
    duplicate: 0,
    nonCore: 0,
  });
});

test("does not accept Playwright exit code as owner evidence", () => {
  const journals = completeJournals();
  const first = journals[0];
  const failedOwner = Object.freeze({
    ...first.ownerRecords[0],
    businessAssertionsCompleted: false,
    result: "fail" as const,
    failureCategory: "owner_assertion" as const,
  });
  const failedJournal = Object.freeze({
    ...first,
    ownerRecords: Object.freeze([failedOwner, ...first.ownerRecords.slice(1)]),
  });
  const input = Object.freeze({
    journals: Object.freeze([failedJournal, ...journals.slice(1)]),
    profileVerifierResult: "pass" as const,
    playwrightExitCode: 0,
  });
  expect(() => aggregateB12G3A3CoreProfileEvidence(input)).toThrow(
    "B12_FORMAL_CORE_PROFILE_OWNER_NOT_PASSED",
  );
});

test("atomically writes a profile artifact without temporary residual", async ({}, testInfo) => {
  const target = testInfo.outputPath("atomic-profile-evidence.json");
  try {
    await writeB12G3A3CoreProfileEvidenceArtifact(completeArtifact(), target);
    expect((await lstat(target)).isFile()).toBe(true);
    const prefix = `.${path.basename(target)}.`;
    expect(
      (await readdir(path.dirname(target))).filter(
        (name) => name.startsWith(prefix) && name.endsWith(".tmp"),
      ),
    ).toEqual([]);
  } finally {
    await removeB12G3A3CoreProfileEvidenceArtifact(target).catch(() => false);
  }
});

test("safely reads a persisted profile artifact", async ({}, testInfo) => {
  const target = testInfo.outputPath("read-profile-evidence.json");
  const artifact = completeArtifact();
  try {
    await writeB12G3A3CoreProfileEvidenceArtifact(artifact, target);
    expect(await readB12G3A3CoreProfileEvidenceArtifact(target)).toEqual(
      artifact,
    );
  } finally {
    await removeB12G3A3CoreProfileEvidenceArtifact(target).catch(() => false);
  }
});

test("rejects sensitive values before profile artifact persistence", () => {
  const artifact = completeArtifact();
  expect(() =>
    validateB12G3A3CoreProfileEvidenceArtifact({
      ...artifact,
      password: "fixture-secret",
      url: "http://localhost:3002/private",
      cookie: "session=secret",
    }),
  ).toThrow("B12_FORMAL_CORE_PROFILE_ARTIFACT_INVALID");
  expect(safeJsonStringify(artifact)).not.toMatch(
    /password|localhost|cookie|session=|patientId|visitId|reportId/i,
  );
});

test("rejects raw Error messages and stacks before artifact persistence", () => {
  const artifact = completeArtifact();
  expect(() =>
    validateB12G3A3CoreProfileEvidenceArtifact({
      ...artifact,
      error: "raw product failure",
      stack: "Error: raw product failure at private.ts:1:1",
    }),
  ).toThrow("B12_FORMAL_CORE_PROFILE_ARTIFACT_INVALID");
  expect(safeJsonStringify(artifact)).not.toMatch(/raw product failure|stack/i);
});

test("precisely removes a profile artifact without temporary residual", async ({}, testInfo) => {
  const target = testInfo.outputPath("remove-profile-evidence.json");
  await writeB12G3A3CoreProfileEvidenceArtifact(completeArtifact(), target);
  expect(await removeB12G3A3CoreProfileEvidenceArtifact(target)).toBe(true);
  await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
  const prefix = `.${path.basename(target)}.`;
  expect(
    (await readdir(path.dirname(target))).filter(
      (name) => name.startsWith(prefix) && name.endsWith(".tmp"),
    ),
  ).toEqual([]);
});

test("requires all four profile evidence execution gates", () => {
  const complete = {
    B12_BROWSER_ACCEPTANCE_RUN: "1",
    B12_G3_A3_CORE_RUN: "1",
    B12_G3_A3_CORE_PROFILE_EVIDENCE_RUN: "1",
    B12_G3_A3_CORE_PROFILE_VERIFIER_PASS: "1",
  };
  expect(b12G3A3CoreProfileEvidenceRunEnabled(complete)).toBe(true);
  for (const key of Object.keys(complete)) {
    expect(
      b12G3A3CoreProfileEvidenceRunEnabled({ ...complete, [key]: undefined }),
    ).toBe(false);
  }
});
