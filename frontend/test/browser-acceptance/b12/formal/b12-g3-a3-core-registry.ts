import {
  assertB12AuditId,
  assertB12AuditOwner,
  assertB12ExecutionGroup,
  assertB12FixtureCluster,
  validateB12OwnerDefinition,
  type B12AuditId,
} from "../execution/b12-execution-types";
import {
  B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
  B12_G3_A3_CORE_EVIDENCE_SCOPE,
  B12_G3_A3_CORE_EXECUTION_GROUPS,
  B12_G3_A3_MUTATION_CLASSES,
  B12_G3_A3_SESSION_STRATEGIES,
  type B12G3A3CoreExecutionGroup,
  type B12G3A3CoreGroupDefinition,
  type B12G3A3CoreOwnerDefinition,
} from "./b12-g3-a3-formal-types";

const VISIT_LOCKED = "core-workflow/eligibility-state/visit-locked-v1";
const VISIT_VOIDED = "core-workflow/eligibility-state/visit-voided-v1";
const DOCTOR_LOCK =
  "core-workflow/success-idempotency/doctor-lock-success";
const ADMIN_LOCK = "core-workflow/success-idempotency/admin-lock-success";

function owner(
  definition: B12G3A3CoreOwnerDefinition,
): B12G3A3CoreOwnerDefinition {
  const validated = validateB12OwnerDefinition(definition);
  if (
    definition.profile !== "core-workflow" ||
    definition.evidenceScope !== B12_G3_A3_CORE_EVIDENCE_SCOPE ||
    definition.auditClosureAllowed !== B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED ||
    !B12_G3_A3_CORE_EXECUTION_GROUPS.includes(definition.executionGroup) ||
    !B12_G3_A3_MUTATION_CLASSES.includes(definition.expectedMutationClass) ||
    !B12_G3_A3_SESSION_STRATEGIES.includes(definition.sessionStrategy) ||
    definition.auditOwner !==
      `${definition.profile}/${definition.scenarioKey}/${definition.routeKey}`
  ) {
    throw new Error("B12_FORMAL_CORE_OWNER_DEFINITION_INVALID");
  }
  for (const supportingOwner of definition.mandatorySupportingOwnerKeys) {
    assertB12AuditOwner(supportingOwner);
  }
  for (const auditId of [
    ...definition.formalSupportingAuditIds,
    ...definition.profileVerifierAuditIds,
  ]) {
    assertB12AuditId(auditId);
  }
  return Object.freeze({
    ...definition,
    directAuditIds: validated.directAuditIds,
    mandatorySupportingOwnerKeys: Object.freeze([
      ...definition.mandatorySupportingOwnerKeys,
    ]),
    formalSupportingAuditIds: Object.freeze([
      ...definition.formalSupportingAuditIds,
    ]),
    profileVerifierAuditIds: Object.freeze([
      ...definition.profileVerifierAuditIds,
    ]),
  });
}

const readOnly = {
  expectedMutationClass: "no_product_write" as const,
  requiresStage: false,
  sessionStrategy: "reuse_primary_session" as const,
  runtimeDescriptorCount: 1 as const,
  evidenceScope: B12_G3_A3_CORE_EVIDENCE_SCOPE,
  auditClosureAllowed: B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
  mandatorySupportingOwnerKeys: [] as const,
  formalSupportingAuditIds: [] as const,
  profileVerifierAuditIds: [] as const,
};

export const B12_G3_A3_CORE_OWNERS = Object.freeze([
  owner({ auditOwner: "core-workflow/eligibility-state/draft-no-entry", profile: "core-workflow", scenarioKey: "eligibility-state", routeKey: "draft-no-entry", executionGroup: "eg-doctor-eligibility-read-only", fixtureCluster: "fc-doctor-eligibility-shared", primaryRole: "doctor", secondaryRole: null, directAuditIds: ["B12-01"], ...readOnly }),
  owner({ auditOwner: "core-workflow/eligibility-state/pending-no-entry", profile: "core-workflow", scenarioKey: "eligibility-state", routeKey: "pending-no-entry", executionGroup: "eg-doctor-eligibility-read-only", fixtureCluster: "fc-doctor-eligibility-shared", primaryRole: "doctor", secondaryRole: null, directAuditIds: ["B12-02"], ...readOnly }),
  owner({ auditOwner: "core-workflow/eligibility-state/confirmed-doctor-entry", profile: "core-workflow", scenarioKey: "eligibility-state", routeKey: "confirmed-doctor-entry", executionGroup: "eg-doctor-eligibility-read-only", fixtureCluster: "fc-doctor-eligibility-shared", primaryRole: "doctor", secondaryRole: null, directAuditIds: ["B12-03", "B12-04", "B12-09", "B12-10", "B12-11"], ...readOnly }),
  owner({ auditOwner: "core-workflow/eligibility-state/confirmed-admin-entry", profile: "core-workflow", scenarioKey: "eligibility-state", routeKey: "confirmed-admin-entry", executionGroup: "eg-admin-eligibility-read-only", fixtureCluster: "fc-admin-eligibility-isolated", primaryRole: "admin", secondaryRole: null, directAuditIds: ["B12-05"], ...readOnly, sessionStrategy: "isolated_primary_session" }),
  owner({ auditOwner: "core-workflow/eligibility-state/denied-role-entry", profile: "core-workflow", scenarioKey: "eligibility-state", routeKey: "denied-role-entry", executionGroup: "eg-denied-roles", fixtureCluster: "fc-denied-role-shared-root", primaryRole: "nurse", secondaryRole: "research_assistant", directAuditIds: ["B12-06", "B12-07", "B12-08"], ...readOnly, sessionStrategy: "three_role_contexts", runtimeDescriptorCount: 2 }),
  owner({ auditOwner: "core-workflow/eligibility-state/quality-not-passed", profile: "core-workflow", scenarioKey: "eligibility-state", routeKey: "quality-not-passed", executionGroup: "eg-doctor-eligibility-read-only", fixtureCluster: "fc-doctor-eligibility-shared", primaryRole: "doctor", secondaryRole: null, directAuditIds: ["B12-12"], ...readOnly }),
  owner({ auditOwner: "core-workflow/eligibility-state/finality-inconsistent", profile: "core-workflow", scenarioKey: "eligibility-state", routeKey: "finality-inconsistent", executionGroup: "eg-doctor-eligibility-read-only", fixtureCluster: "fc-doctor-eligibility-shared", primaryRole: "doctor", secondaryRole: null, directAuditIds: ["B12-13"], ...readOnly }),
  owner({ auditOwner: "core-workflow/eligibility-state/confirmation-missing", profile: "core-workflow", scenarioKey: "eligibility-state", routeKey: "confirmation-missing", executionGroup: "eg-doctor-eligibility-read-only", fixtureCluster: "fc-doctor-eligibility-shared", primaryRole: "doctor", secondaryRole: null, directAuditIds: ["B12-14"], ...readOnly }),
  owner({ auditOwner: VISIT_LOCKED, profile: "core-workflow", scenarioKey: "eligibility-state", routeKey: "visit-locked-v1", executionGroup: "eg-doctor-eligibility-read-only", fixtureCluster: "fc-doctor-eligibility-shared", primaryRole: "doctor", secondaryRole: null, directAuditIds: ["B12-15"], ...readOnly, mandatorySupportingOwnerKeys: [VISIT_VOIDED] }),
  owner({ auditOwner: VISIT_VOIDED, profile: "core-workflow", scenarioKey: "eligibility-state", routeKey: "visit-voided-v1", executionGroup: "eg-doctor-eligibility-read-only", fixtureCluster: "fc-doctor-eligibility-shared", primaryRole: "doctor", secondaryRole: null, directAuditIds: [], ...readOnly, formalSupportingAuditIds: ["B12-15"] }),
  owner({ auditOwner: "core-workflow/eligibility-state/already-locked-no-repeat", profile: "core-workflow", scenarioKey: "eligibility-state", routeKey: "already-locked-no-repeat", executionGroup: "eg-doctor-eligibility-read-only", fixtureCluster: "fc-doctor-eligibility-shared", primaryRole: "doctor", secondaryRole: null, directAuditIds: ["B12-16"], ...readOnly }),
  owner({ auditOwner: "core-workflow/eligibility-state/lock-without-locked-at-warning", profile: "core-workflow", scenarioKey: "eligibility-state", routeKey: "lock-without-locked-at-warning", executionGroup: "eg-doctor-eligibility-read-only", fixtureCluster: "fc-doctor-eligibility-shared", primaryRole: "doctor", secondaryRole: null, directAuditIds: ["B12-17"], ...readOnly }),
  owner({ auditOwner: "core-workflow/eligibility-state/locked-at-without-lock-warning", profile: "core-workflow", scenarioKey: "eligibility-state", routeKey: "locked-at-without-lock-warning", executionGroup: "eg-doctor-eligibility-read-only", fixtureCluster: "fc-doctor-eligibility-shared", primaryRole: "doctor", secondaryRole: null, directAuditIds: ["B12-18"], ...readOnly }),
  owner({ auditOwner: "core-workflow/eligibility-state/lock-time-mismatch-warning", profile: "core-workflow", scenarioKey: "eligibility-state", routeKey: "lock-time-mismatch-warning", executionGroup: "eg-doctor-eligibility-read-only", fixtureCluster: "fc-doctor-eligibility-shared", primaryRole: "doctor", secondaryRole: null, directAuditIds: ["B12-19"], ...readOnly }),
  owner({ auditOwner: "core-workflow/lock-form-contract/irreversible-disclosure", profile: "core-workflow", scenarioKey: "lock-form-contract", routeKey: "irreversible-disclosure", executionGroup: "eg-lock-form-read-only", fixtureCluster: "fc-lock-form-shared-patient", primaryRole: "doctor", secondaryRole: null, directAuditIds: ["B12-20", "B12-21", "B12-22", "B12-23", "B12-24", "B12-25", "B12-28", "B12-29"], ...readOnly }),
  owner({ auditOwner: "core-workflow/lock-form-contract/validation-request-contract", profile: "core-workflow", scenarioKey: "lock-form-contract", routeKey: "validation-request-contract", executionGroup: "eg-lock-form-read-only", fixtureCluster: "fc-lock-form-shared-patient", primaryRole: "doctor", secondaryRole: null, directAuditIds: ["B12-26", "B12-27", "B12-30", "B12-31", "B12-32"], ...readOnly, expectedMutationClass: "request_aborted_before_server" }),
  owner({ auditOwner: DOCTOR_LOCK, profile: "core-workflow", scenarioKey: "success-idempotency", routeKey: "doctor-lock-success", executionGroup: "eg-doctor-lock-write", fixtureCluster: "fc-doctor-lock-write", primaryRole: "doctor", secondaryRole: null, directAuditIds: ["B12-33", "B12-34", "B12-35", "B12-36", "B12-37", "B12-38", "B12-39", "B12-40", "B12-44", "B12-46", "B12-47", "B12-48"], ...readOnly, expectedMutationClass: "a22_once", sessionStrategy: "isolated_primary_session", mandatorySupportingOwnerKeys: [ADMIN_LOCK], profileVerifierAuditIds: ["B12-33", "B12-34", "B12-35", "B12-36", "B12-37", "B12-38", "B12-39", "B12-40", "B12-44", "B12-46", "B12-47", "B12-48"] }),
  owner({ auditOwner: ADMIN_LOCK, profile: "core-workflow", scenarioKey: "success-idempotency", routeKey: "admin-lock-success", executionGroup: "eg-admin-lock-write", fixtureCluster: "fc-admin-lock-write", primaryRole: "admin", secondaryRole: null, directAuditIds: ["B12-45"], ...readOnly, expectedMutationClass: "a22_once", sessionStrategy: "isolated_primary_session", formalSupportingAuditIds: ["B12-35", "B12-36", "B12-37", "B12-38"], profileVerifierAuditIds: ["B12-45"] }),
  owner({ auditOwner: "core-workflow/success-idempotency/already-locked-idempotency", profile: "core-workflow", scenarioKey: "success-idempotency", routeKey: "already-locked-idempotency", executionGroup: "eg-already-locked-idempotency", fixtureCluster: "fc-idempotency-concurrency", primaryRole: "doctor", secondaryRole: "doctor", directAuditIds: ["B12-41", "B12-42", "B12-43"], ...readOnly, expectedMutationClass: "secondary_a22_once", sessionStrategy: "two_doctor_contexts", profileVerifierAuditIds: ["B12-41", "B12-42", "B12-43"] }),
  owner({ auditOwner: "core-workflow/conflict/lock-conflict-continue", profile: "core-workflow", scenarioKey: "conflict", routeKey: "lock-conflict-continue", executionGroup: "eg-lock-conflict-continue", fixtureCluster: "fc-conflict-continue", primaryRole: "doctor", secondaryRole: null, directAuditIds: ["B12-49", "B12-50", "B12-51", "B12-52", "B12-53", "B12-54"], ...readOnly, expectedMutationClass: "stage_then_a22_once", requiresStage: true, sessionStrategy: "isolated_primary_session", profileVerifierAuditIds: ["B12-49", "B12-50", "B12-51", "B12-52", "B12-53", "B12-54"] }),
  owner({ auditOwner: "core-workflow/conflict/lock-conflict-latest-locked", profile: "core-workflow", scenarioKey: "conflict", routeKey: "lock-conflict-latest-locked", executionGroup: "eg-lock-conflict-latest-locked", fixtureCluster: "fc-conflict-latest-locked", primaryRole: "doctor", secondaryRole: "doctor", directAuditIds: ["B12-55"], ...readOnly, expectedMutationClass: "stage_then_secondary_a22_once", requiresStage: true, sessionStrategy: "two_doctor_contexts", profileVerifierAuditIds: ["B12-55"] }),
  owner({ auditOwner: "core-workflow/locked-readonly/locked-readonly-semantics", profile: "core-workflow", scenarioKey: "locked-readonly", routeKey: "locked-readonly-semantics", executionGroup: "eg-core-locked-read-only", fixtureCluster: "fc-core-locked-read-only", primaryRole: "doctor", secondaryRole: null, directAuditIds: ["B12-64", "B12-65", "B12-66", "B12-67", "B12-68", "B12-69", "B12-70"], ...readOnly, sessionStrategy: "isolated_primary_session" }),
]);

const ownersByKey = new Map(
  B12_G3_A3_CORE_OWNERS.map((definition) => [definition.auditOwner, definition]),
);

export function validateB12G3A3CoreRegistry(
  definitions: readonly B12G3A3CoreOwnerDefinition[] = B12_G3_A3_CORE_OWNERS,
): void {
  const byKey = new Map<string, B12G3A3CoreOwnerDefinition>();
  const directOwners = new Map<B12AuditId, string>();
  for (const definition of definitions) {
    if (byKey.has(definition.auditOwner)) {
      throw new Error("B12_FORMAL_CORE_DUPLICATE_OWNER");
    }
    byKey.set(definition.auditOwner, definition);
    for (const auditId of definition.directAuditIds) {
      if (directOwners.has(auditId)) {
        throw new Error("B12_FORMAL_CORE_DUPLICATE_DIRECT_OWNER");
      }
      directOwners.set(auditId, definition.auditOwner);
    }
  }
  for (const definition of definitions) {
    for (const supportingOwnerKey of definition.mandatorySupportingOwnerKeys) {
      const supportingOwner = byKey.get(supportingOwnerKey);
      if (!supportingOwner) {
        throw new Error("B12_FORMAL_CORE_SUPPORTING_OWNER_MISSING");
      }
      const overlap = definition.directAuditIds.some((auditId) =>
        supportingOwner.formalSupportingAuditIds.includes(auditId),
      );
      if (!overlap) {
        throw new Error("B12_FORMAL_CORE_SUPPORTING_AUDIT_RELATION_MISSING");
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visiting.has(key)) throw new Error("B12_FORMAL_CORE_SUPPORTING_CYCLE");
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of byKey.get(key)?.mandatorySupportingOwnerKeys ?? []) {
      visit(dependency);
    }
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of byKey.keys()) visit(key);
}

validateB12G3A3CoreRegistry();

export function b12G3A3CoreOwner(
  auditOwner: string,
): B12G3A3CoreOwnerDefinition {
  const definition = ownersByKey.get(auditOwner);
  if (!definition) throw new Error("B12_FORMAL_CORE_OWNER_NOT_REGISTERED");
  return definition;
}

export function b12G3A3CoreOwnersFor(
  executionGroup: B12G3A3CoreExecutionGroup,
): readonly B12G3A3CoreOwnerDefinition[] {
  assertB12ExecutionGroup(executionGroup);
  return B12_G3_A3_CORE_OWNERS.filter(
    (definition) => definition.executionGroup === executionGroup,
  );
}

function group(
  executionGroup: B12G3A3CoreExecutionGroup,
  contextCount: number,
  primaryRole: B12G3A3CoreGroupDefinition["primaryRole"],
): B12G3A3CoreGroupDefinition {
  const owners = b12G3A3CoreOwnersFor(executionGroup);
  return Object.freeze({
    executionGroup,
    ownerKeys: Object.freeze(owners.map(({ auditOwner }) => auditOwner)),
    contextCount,
    sessionCount: contextCount,
    runtimeDescriptorCount: owners.reduce(
      (total, definition) => total + definition.runtimeDescriptorCount,
      0,
    ),
    primaryRole,
    fullCollectCount: 1,
  });
}

export const B12_G3_A3_CORE_GROUPS = Object.freeze([
  group("eg-doctor-eligibility-read-only", 1, "doctor"),
  group("eg-admin-eligibility-read-only", 1, "admin"),
  group("eg-denied-roles", 3, "nurse"),
  group("eg-lock-form-read-only", 1, "doctor"),
  group("eg-doctor-lock-write", 1, "doctor"),
  group("eg-admin-lock-write", 1, "admin"),
  group("eg-already-locked-idempotency", 2, "doctor"),
  group("eg-lock-conflict-continue", 1, "doctor"),
  group("eg-lock-conflict-latest-locked", 2, "doctor"),
  group("eg-core-locked-read-only", 1, "doctor"),
]);

export function b12G3A3CoreGroup(
  executionGroup: B12G3A3CoreExecutionGroup,
): B12G3A3CoreGroupDefinition {
  const definition = B12_G3_A3_CORE_GROUPS.find(
    (candidate) => candidate.executionGroup === executionGroup,
  );
  if (!definition) throw new Error("B12_FORMAL_CORE_GROUP_NOT_REGISTERED");
  return definition;
}

export const B12_G3_A3_CORE_DIRECT_AUDIT_IDS = Object.freeze(
  B12_G3_A3_CORE_OWNERS.flatMap(({ directAuditIds }) => directAuditIds).sort(),
);

export const B12_G3_A3_CORE_PROFILE_VERIFIER_AUDIT_IDS = Object.freeze(
  [...new Set(B12_G3_A3_CORE_OWNERS.flatMap(({ profileVerifierAuditIds }) => profileVerifierAuditIds))].sort(),
);

for (const groupDefinition of B12_G3_A3_CORE_GROUPS) {
  assertB12FixtureCluster(
    b12G3A3CoreOwnersFor(groupDefinition.executionGroup)[0].fixtureCluster,
  );
}
