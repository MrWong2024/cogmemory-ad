import { readFileSync } from "node:fs";

import {
  B12_CORE_OWNER_ACTION_KEYS,
  b12CoreOwnerAction,
  createB12CoreOwnerActionRegistryForSynthetic,
} from "../b12/core/owner-actions";
import type { B12CoreOwnerAction } from "../b12/core/owner-actions";
import type { B12OwnerJournalRecord } from "../b12/execution/b12-owner-result-journal";
import { safeJsonStringify } from "../support/safe-output";
import {
  B12_G3_A2_CANARY_AUDIT_CLOSURE_ALLOWED,
  B12_G3_A2_CANARY_EVIDENCE_SCOPE,
  B12_G3_A2_CANARY_OWNERS,
} from "../b12/canary/b12-g3-a2-canary-types";
import {
  B12_G3_A3_CORE_DIRECT_AUDIT_IDS,
  B12_G3_A3_CORE_GROUPS,
  B12_G3_A3_CORE_OWNERS,
  b12G3A3CoreGroup,
  b12G3A3CoreOwner,
  validateB12G3A3CoreRegistry,
} from "../b12/formal/b12-g3-a3-core-registry";
import { computeB12CoreAuditClosure } from "../b12/formal/b12-g3-a3-core-evidence";
import {
  B12G3A3CoreAtomicJournal,
} from "../b12/formal/b12-g3-a3-core-journal";
import { b12G3A3CoreBudgetTotals } from "../b12/formal/b12-g3-a3-core-support";
import {
  B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
  B12_G3_A3_CORE_EVIDENCE_SCOPE,
  B12_G3_A3_CORE_EXECUTION_GROUPS,
  B12_G3_A3_CORE_PHASE,
  type B12G3A3CoreOwnerDefinition,
  type B12G3A3CoreSafeSummary,
} from "../b12/formal/b12-g3-a3-formal-types";
import { expect, test } from "../support/acceptance-test";

const EXPECTED_CORE_IDS = [
  ...Array.from({ length: 55 }, (_, index) =>
    `B12-${String(index + 1).padStart(2, "0")}`,
  ),
  ...Array.from({ length: 7 }, (_, index) => `B12-${index + 64}`),
].sort();

function record(
  auditOwner: string,
  result: B12OwnerJournalRecord["result"],
): B12OwnerJournalRecord {
  const owner = b12G3A3CoreOwner(auditOwner);
  const started = result === "pass" || result === "fail";
  return Object.freeze({
    auditOwner,
    executionGroup: owner.executionGroup,
    fixtureCluster: owner.fixtureCluster,
    started,
    businessAssertionsCompleted: result === "pass",
    routeNetworkCompleted: result === "pass",
    minimalCleanupCompleted: started,
    result,
    failureCategory: result === "fail" ? "owner_assertion" : "none",
    directAuditIds: owner.directAuditIds,
    supportingEvidenceCompleted: Object.freeze([]),
  });
}

function snapshot(records: readonly B12OwnerJournalRecord[]) {
  return Object.freeze({
    evidenceScope: B12_G3_A3_CORE_EVIDENCE_SCOPE,
    auditClosureAllowed: B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
    ownerRecords: Object.freeze([...records]),
  });
}

function closureFor(
  auditId: string,
  records: readonly B12OwnerJournalRecord[],
  verifier: "pass" | "fail" | "not_executed" = "pass",
) {
  const entry = computeB12CoreAuditClosure(
    snapshot(records),
    B12_G3_A3_CORE_OWNERS,
    verifier,
  ).find((candidate) => candidate.auditId === auditId);
  if (!entry) throw new Error("SYNTHETIC_AUDIT_CLOSURE_MISSING");
  return entry;
}

test("registers the fixed 10 groups, 22 owners, 62 Direct IDs, 14 Sessions, and 23 runtimes", () => {
  expect(B12_G3_A3_CORE_EXECUTION_GROUPS).toHaveLength(10);
  expect(B12_G3_A3_CORE_GROUPS).toHaveLength(10);
  expect(B12_G3_A3_CORE_OWNERS).toHaveLength(22);
  expect(B12_G3_A3_CORE_DIRECT_AUDIT_IDS).toHaveLength(62);
  expect([...B12_G3_A3_CORE_DIRECT_AUDIT_IDS].sort()).toEqual(
    EXPECTED_CORE_IDS,
  );
  expect(new Set(B12_G3_A3_CORE_DIRECT_AUDIT_IDS).size).toBe(62);
  expect(
    B12_G3_A3_CORE_DIRECT_AUDIT_IDS.some((id) =>
      /B12-(?:5[6-9]|6[0-3]|7[1-9]|8[0-8])/.test(id),
    ),
  ).toBe(false);
  expect(b12G3A3CoreBudgetTotals()).toEqual({
    groupCount: 10,
    ownerCount: 22,
    sessionCount: 14,
    runtimeDescriptorCount: 23,
  });
});

test("preserves the fixed group owner order and recomputable budgets", () => {
  expect(b12G3A3CoreGroup("eg-doctor-eligibility-read-only")).toMatchObject({
    contextCount: 1,
    sessionCount: 1,
    runtimeDescriptorCount: 12,
  });
  expect(
    b12G3A3CoreGroup("eg-doctor-eligibility-read-only").ownerKeys,
  ).toHaveLength(12);
  expect(b12G3A3CoreGroup("eg-denied-roles")).toMatchObject({
    contextCount: 3,
    sessionCount: 3,
    runtimeDescriptorCount: 2,
  });
  expect(b12G3A3CoreGroup("eg-lock-form-read-only")).toMatchObject({
    contextCount: 1,
    sessionCount: 1,
  });
  expect(b12G3A3CoreGroup("eg-lock-form-read-only").ownerKeys).toHaveLength(2);
  for (const group of [
    "eg-already-locked-idempotency",
    "eg-lock-conflict-latest-locked",
  ] as const) {
    expect(b12G3A3CoreGroup(group)).toMatchObject({
      contextCount: 2,
      sessionCount: 2,
    });
  }
});

test("models B12-15 and B12-35 through B12-38 as explicit supporting closures", () => {
  const locked = b12G3A3CoreOwner(
    "core-workflow/eligibility-state/visit-locked-v1",
  );
  const voided = b12G3A3CoreOwner(
    "core-workflow/eligibility-state/visit-voided-v1",
  );
  const doctor = b12G3A3CoreOwner(
    "core-workflow/success-idempotency/doctor-lock-success",
  );
  const admin = b12G3A3CoreOwner(
    "core-workflow/success-idempotency/admin-lock-success",
  );
  expect(voided.directAuditIds).toEqual([]);
  expect(voided.formalSupportingAuditIds).toEqual(["B12-15"]);
  expect(locked.mandatorySupportingOwnerKeys).toEqual([voided.auditOwner]);
  expect(admin.directAuditIds).toEqual(["B12-45"]);
  expect(admin.formalSupportingAuditIds).toEqual([
    "B12-35",
    "B12-36",
    "B12-37",
    "B12-38",
  ]);
  expect(doctor.mandatorySupportingOwnerKeys).toEqual([admin.auditOwner]);
});

test("rejects missing supporting owners and supporting cycles", () => {
  expect(() =>
    validateB12G3A3CoreRegistry(
      B12_G3_A3_CORE_OWNERS.filter(
        ({ routeKey }) => routeKey !== "visit-voided-v1",
      ),
    ),
  ).toThrow("B12_FORMAL_CORE_SUPPORTING_OWNER_MISSING");

  const doctorKey =
    "core-workflow/success-idempotency/doctor-lock-success";
  const adminKey = "core-workflow/success-idempotency/admin-lock-success";
  const cyclic = B12_G3_A3_CORE_OWNERS.map((owner) => {
    if (owner.auditOwner === doctorKey) {
      return Object.freeze({
        ...owner,
        formalSupportingAuditIds: Object.freeze(["B12-45"] as const),
      });
    }
    if (owner.auditOwner === adminKey) {
      return Object.freeze({
        ...owner,
        mandatorySupportingOwnerKeys: Object.freeze([doctorKey]),
      });
    }
    return owner;
  }) as readonly B12G3A3CoreOwnerDefinition[];
  expect(() => validateB12G3A3CoreRegistry(cyclic)).toThrow(
    "B12_FORMAL_CORE_SUPPORTING_CYCLE",
  );
});

test("computes normal Direct pass, fail, not-executed, and group-setup states", () => {
  const owner = "core-workflow/eligibility-state/draft-no-entry";
  expect(closureFor("B12-01", [record(owner, "pass")]).result).toBe("pass");
  expect(closureFor("B12-01", [record(owner, "fail")]).result).toBe("fail");
  expect(closureFor("B12-01", []).result).toBe("not_executed");
  expect(
    closureFor("B12-01", [record(owner, "blocked_by_group_setup")]).result,
  ).toBe("blocked_by_group_setup");
});

test("blocks B12-15 until both primary and supporting routes pass", () => {
  const primary = "core-workflow/eligibility-state/visit-locked-v1";
  const supporting = "core-workflow/eligibility-state/visit-voided-v1";
  expect(
    closureFor("B12-15", [record(primary, "pass")]),
  ).toMatchObject({
    result: "blocked_by_supporting_owner",
    closureBlockedBySupportingOwner: true,
  });
  expect(
    closureFor("B12-15", [
      record(primary, "pass"),
      record(supporting, "pass"),
    ]).result,
  ).toBe("pass");
});

test("blocks B12-35 through B12-38 until doctor and admin routes both pass", () => {
  const doctor = "core-workflow/success-idempotency/doctor-lock-success";
  const admin = "core-workflow/success-idempotency/admin-lock-success";
  for (const auditId of ["B12-35", "B12-36", "B12-37", "B12-38"]) {
    expect(closureFor(auditId, [record(doctor, "pass")])).toMatchObject({
      result: "blocked_by_supporting_owner",
      closureBlockedBySupportingOwner: true,
    });
    expect(
      closureFor(
        auditId,
        [record(doctor, "pass"), record(admin, "pass")],
        "pass",
      ).result,
    ).toBe("pass");
  }
  expect(closureFor("B12-45", [record(admin, "fail")]).result).toBe("fail");
});

test("profile verifier failure blocks only database-terminal Audit IDs", () => {
  const ui = "core-workflow/eligibility-state/draft-no-entry";
  const write = "core-workflow/success-idempotency/admin-lock-success";
  const records = [record(ui, "pass"), record(write, "pass")];
  expect(closureFor("B12-01", records, "fail").result).toBe("pass");
  expect(closureFor("B12-45", records, "fail").result).toBe(
    "blocked_by_profile_verifier",
  );
});

test("closure calculation does not mutate owner records or registry inputs", () => {
  const ownerRecord = record(
    "core-workflow/eligibility-state/draft-no-entry",
    "pass",
  );
  const before = JSON.stringify(ownerRecord);
  computeB12CoreAuditClosure(snapshot([ownerRecord]));
  expect(JSON.stringify(ownerRecord)).toBe(before);
  expect(Object.isFrozen(B12_G3_A3_CORE_OWNERS)).toBe(true);
  expect(Object.isFrozen(B12_G3_A3_CORE_OWNERS[0].directAuditIds)).toBe(true);
});

test("keeps formal and canary evidence scopes isolated", () => {
  expect(B12_G3_A3_CORE_EVIDENCE_SCOPE).toBe("formal_core");
  expect(B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED).toBe(true);
  expect(B12_G3_A3_CORE_DIRECT_AUDIT_IDS.length).toBeGreaterThan(0);
  expect(B12_G3_A2_CANARY_EVIDENCE_SCOPE).toBe("canary_only");
  expect(B12_G3_A2_CANARY_AUDIT_CLOSURE_ALLOWED).toBe(false);
  expect(
    B12_G3_A2_CANARY_OWNERS.every(({ directAuditIds }) =>
      directAuditIds.length === 0,
    ),
  ).toBe(true);
  expect(() =>
    computeB12CoreAuditClosure({
      evidenceScope: B12_G3_A2_CANARY_EVIDENCE_SCOPE,
      auditClosureAllowed: B12_G3_A2_CANARY_AUDIT_CLOSURE_ALLOWED,
      ownerRecords: [],
    } as never),
  ).toThrow("B12_FORMAL_CORE_EVIDENCE_SCOPE_INVALID");
  expect(() =>
    computeB12CoreAuditClosure({
      evidenceScope: "wrong_scope",
      auditClosureAllowed: true,
      ownerRecords: [],
    } as never),
  ).toThrow("B12_FORMAL_CORE_EVIDENCE_SCOPE_INVALID");
});

test("registers exactly one authoritative action for every formal owner", () => {
  expect(B12_CORE_OWNER_ACTION_KEYS).toHaveLength(22);
  expect(new Set(B12_CORE_OWNER_ACTION_KEYS).size).toBe(22);
  expect([...B12_CORE_OWNER_ACTION_KEYS].sort()).toEqual(
    B12_G3_A3_CORE_OWNERS.map(({ auditOwner }) => auditOwner).sort(),
  );
  for (const auditOwner of B12_CORE_OWNER_ACTION_KEYS) {
    expect(typeof b12CoreOwnerAction(auditOwner)).toBe("function");
  }
  expect(() => b12CoreOwnerAction("core-workflow/missing/owner")).toThrow(
    "B12_CORE_OWNER_ACTION_NOT_REGISTERED",
  );
});

test("rejects duplicate owner action registration", () => {
  const action = b12CoreOwnerAction(B12_CORE_OWNER_ACTION_KEYS[0]);
  const duplicate = [
    ["core-workflow/synthetic/owner", action],
    ["core-workflow/synthetic/owner", action],
  ] as const satisfies readonly (readonly [string, B12CoreOwnerAction])[];
  expect(() => createB12CoreOwnerActionRegistryForSynthetic(duplicate)).toThrow(
    "B12_CORE_OWNER_ACTION_DUPLICATE",
  );
});

test("single-route and formal specs both route through the shared owner action registry", () => {
  const singleRouteSpecs = [
    "eligibility-state.spec.ts",
    "lock-form-contract.spec.ts",
    "success-idempotency.spec.ts",
    "conflict.spec.ts",
    "locked-readonly.spec.ts",
  ];
  for (const file of singleRouteSpecs) {
    const source = readFileSync(
      `test/browser-acceptance/b12/core/${file}`,
      "utf8",
    );
    expect(source).toContain("executeB12CoreOwnerAction");
  }
  const formalSupport = readFileSync(
    "test/browser-acceptance/b12/formal/b12-g3-a3-core-support.ts",
    "utf8",
  );
  expect(formalSupport).toContain("executeB12CoreOwnerAction");
  for (const file of [
    "01-eligibility-groups.spec.ts",
    "02-lock-form-group.spec.ts",
    "03-success-groups.spec.ts",
    "04-conflict-groups.spec.ts",
    "05-locked-readonly-group.spec.ts",
  ]) {
    expect(
      readFileSync(
        `test/browser-acceptance/b12/formal/core/${file}`,
        "utf8",
      ),
    ).toContain("runB12G3A3CoreGroup");
  }
});

test("formal safe summaries expose only fixed safe fields", () => {
  const summary = Object.freeze({
    phase: B12_G3_A3_CORE_PHASE,
    evidenceScope: B12_G3_A3_CORE_EVIDENCE_SCOPE,
    auditClosureAllowed: B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
    executionGroup: "eg-core-locked-read-only",
    ownerCount: 1,
    ownerResults: Object.freeze([]),
    directAuditIds: Object.freeze(["B12-64"]),
    blockedAuditIds: Object.freeze(["B12-64"]),
    ContextCount: 1,
    SessionCount: 1,
    fullCollectCount: 1,
    minimalCleanupCount: 1,
    interceptInstalledCount: 0,
    interceptRemovedCount: 0,
    groupSetupSucceeded: true,
    groupCleanupSucceeded: true,
    profileCompletionBlocked: true,
    stopReason: "none",
    elapsedMs: 1,
  } as const satisfies B12G3A3CoreSafeSummary);
  const forbidden = [
    "doctor@example.invalid",
    "http://localhost:3002/patients/private",
    "Cookie=secret",
    "Session=secret",
    "507f1f77bcf86cd799439011",
    "raw lock note",
    "raw error stack",
  ];
  const serialized = safeJsonStringify(summary, forbidden);
  for (const value of forbidden) expect(serialized).not.toContain(value);
  expect(Object.keys(summary).sort()).toEqual(
    [
      "auditClosureAllowed",
      "blockedAuditIds",
      "ContextCount",
      "directAuditIds",
      "elapsedMs",
      "evidenceScope",
      "executionGroup",
      "fullCollectCount",
      "groupCleanupSucceeded",
      "groupSetupSucceeded",
      "interceptInstalledCount",
      "interceptRemovedCount",
      "minimalCleanupCount",
      "ownerCount",
      "ownerResults",
      "phase",
      "profileCompletionBlocked",
      "SessionCount",
      "stopReason",
    ].sort(),
  );
});

test("writes, fsyncs, atomically replaces, finalizes, reads, and removes a safe formal journal", async ({}, testInfo) => {
  const target = testInfo.outputPath("formal-core-journal.json");
  const journal = await B12G3A3CoreAtomicJournal.create({
    executionGroup: "eg-lock-form-read-only",
    target,
  });
  const first = record(
    "core-workflow/lock-form-contract/irreversible-disclosure",
    "pass",
  );
  const second = record(
    "core-workflow/lock-form-contract/validation-request-contract",
    "pass",
  );
  try {
    await journal.onOwnerFinalized(first);
    const afterFirst = await journal.read();
    expect(afterFirst.state).toBe("appending");
    expect(afterFirst.ownerRecords.map(({ auditOwner }) => auditOwner)).toEqual([
      first.auditOwner,
    ]);
    await journal.onOwnerFinalized(second);
    await journal.finalize();
    const finalized = await journal.read();
    expect(finalized).toMatchObject({
      version: 1,
      phase: "G3-A3_CORE",
      evidenceScope: "formal_core",
      auditClosureAllowed: true,
      executionGroup: "eg-lock-form-read-only",
      state: "finalized",
    });
    expect(finalized.ownerRecords.map(({ auditOwner }) => auditOwner)).toEqual([
      first.auditOwner,
      second.auditOwner,
    ]);
    expect(safeJsonStringify(finalized)).not.toMatch(
      /localhost|\\runtime|cookie|session=|password|stack|lockNote/i,
    );
  } finally {
    await journal.remove().catch(() => false);
  }
});
