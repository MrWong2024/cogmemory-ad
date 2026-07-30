import type { B12OwnerJournalRecord } from "../execution/b12-owner-result-journal";
import type { B12AuditId } from "../execution/b12-execution-types";
import {
  B12_G3_A3_CORE_OWNERS,
  validateB12G3A3CoreRegistry,
} from "./b12-g3-a3-core-registry";
import {
  B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
  B12_G3_A3_CORE_EVIDENCE_SCOPE,
  type B12G3A3AuditClosureEntry,
  type B12G3A3CoreOwnerDefinition,
} from "./b12-g3-a3-formal-types";

export type B12G3A3FormalJournalSnapshot = Readonly<{
  evidenceScope: typeof B12_G3_A3_CORE_EVIDENCE_SCOPE;
  auditClosureAllowed: typeof B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED;
  ownerRecords: readonly B12OwnerJournalRecord[];
}>;

export type B12G3A3ProfileVerifierResult =
  | "pass"
  | "fail"
  | "not_executed";

function ownerRecordMap(
  snapshot: B12G3A3FormalJournalSnapshot,
): ReadonlyMap<string, B12OwnerJournalRecord> {
  if (
    snapshot.evidenceScope !== B12_G3_A3_CORE_EVIDENCE_SCOPE ||
    snapshot.auditClosureAllowed !== true
  ) {
    throw new Error("B12_FORMAL_CORE_EVIDENCE_SCOPE_INVALID");
  }
  const records = new Map<string, B12OwnerJournalRecord>();
  for (const record of snapshot.ownerRecords) {
    if (records.has(record.auditOwner)) {
      throw new Error("B12_FORMAL_CORE_JOURNAL_OWNER_DUPLICATE");
    }
    records.set(record.auditOwner, record);
  }
  return records;
}

function directResult(
  record: B12OwnerJournalRecord | undefined,
): B12G3A3AuditClosureEntry["result"] {
  if (!record || record.result === "not_executed") return "not_executed";
  if (record.result === "blocked_by_group_setup") {
    return "blocked_by_group_setup";
  }
  if (record.result === "fail") return "fail";
  return "pass";
}

function supportingOwnersForAudit(
  directOwner: B12G3A3CoreOwnerDefinition,
  auditId: B12AuditId,
  registryByKey: ReadonlyMap<string, B12G3A3CoreOwnerDefinition>,
): readonly B12G3A3CoreOwnerDefinition[] {
  return directOwner.mandatorySupportingOwnerKeys
    .map((key) => registryByKey.get(key))
    .filter(
      (definition): definition is B12G3A3CoreOwnerDefinition =>
        definition !== undefined &&
        definition.formalSupportingAuditIds.includes(auditId),
    );
}

export function computeB12CoreAuditClosure(
  ownerJournal: B12G3A3FormalJournalSnapshot,
  ownerRegistry: readonly B12G3A3CoreOwnerDefinition[] =
    B12_G3_A3_CORE_OWNERS,
  profileVerifierResult: B12G3A3ProfileVerifierResult = "not_executed",
): readonly B12G3A3AuditClosureEntry[] {
  validateB12G3A3CoreRegistry(ownerRegistry);
  const records = ownerRecordMap(ownerJournal);
  const registryByKey = new Map(
    ownerRegistry.map((definition) => [definition.auditOwner, definition]),
  );
  const entries: B12G3A3AuditClosureEntry[] = [];
  for (const definition of ownerRegistry) {
    const record = records.get(definition.auditOwner);
    for (const auditId of definition.directAuditIds) {
      let result = directResult(record);
      let closureBlockedBySupportingOwner = false;
      if (result === "pass") {
        const supportingOwners = supportingOwnersForAudit(
          definition,
          auditId,
          registryByKey,
        );
        if (
          supportingOwners.some(
            (supportingOwner) =>
              records.get(supportingOwner.auditOwner)?.result !== "pass",
          )
        ) {
          result = "blocked_by_supporting_owner";
          closureBlockedBySupportingOwner = true;
        } else if (
          profileVerifierResult !== "pass" &&
          definition.profileVerifierAuditIds.includes(auditId)
        ) {
          result = "blocked_by_profile_verifier";
        }
      }
      entries.push(
        Object.freeze({
          auditId,
          directOwner: definition.auditOwner,
          result,
          closureBlockedBySupportingOwner,
        }),
      );
    }
  }
  return Object.freeze(entries.sort((left, right) => left.auditId.localeCompare(right.auditId)));
}
