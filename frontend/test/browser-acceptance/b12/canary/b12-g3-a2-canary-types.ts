import type {
  B12CrossCuttingEvidenceDefinition,
  B12CrossCuttingResult,
} from "../execution/b12-cross-cutting-evidence";
import {
  assertB12AuditId,
  type B12AuditId,
  type B12FailureCategory,
  type B12OwnerDefinition,
  type B12OwnerResult,
} from "../execution/b12-execution-types";
import type { B12LogoutMechanism } from "../b12-core-support";

export const B12_G3_A2_CANARY_PHASE = "G3-A2_CANARY" as const;
export const B12_G3_A2_CANARY_EVIDENCE_SCOPE = "canary_only" as const;
export const B12_G3_A2_CANARY_AUDIT_CLOSURE_ALLOWED = false as const;

export const B12_G3_A2_CANARY_EXECUTION_GROUPS = [
  "eg-canary-doctor-read-only",
  "eg-canary-system-forbidden",
  "eg-canary-auth-cross-cutting",
  "eg-canary-doctor-lock-write",
] as const;

export type B12G3A2CanaryExecutionGroup =
  (typeof B12_G3_A2_CANARY_EXECUTION_GROUPS)[number];

export type B12G3A2CanaryOwnerDefinition = B12OwnerDefinition &
  Readonly<{
    formalTargetAuditIds: readonly B12AuditId[];
  }>;

function canaryOwner(
  definition: B12G3A2CanaryOwnerDefinition,
): B12G3A2CanaryOwnerDefinition {
  if (definition.directAuditIds.length !== 0) {
    throw new Error("B12_CANARY_DIRECT_AUDIT_IDS_MUST_BE_EMPTY");
  }
  const formalTargetAuditIds = [...definition.formalTargetAuditIds];
  const uniqueIds = new Set<string>();
  for (const auditId of formalTargetAuditIds) {
    assertB12AuditId(auditId);
    if (uniqueIds.has(auditId)) {
      throw new Error("B12_CANARY_DUPLICATE_FORMAL_TARGET_AUDIT_ID");
    }
    uniqueIds.add(auditId);
  }
  return Object.freeze({
    ...definition,
    directAuditIds: Object.freeze([]),
    formalTargetAuditIds: Object.freeze(formalTargetAuditIds),
  });
}

export const B12_G3_A2_CANARY_OWNERS = Object.freeze([
  canaryOwner({
    auditOwner: "core-workflow/eligibility-state/draft-no-entry",
    executionGroup: "eg-canary-doctor-read-only",
    fixtureCluster: "fc-canary-core-draft-root",
    directAuditIds: [],
    formalTargetAuditIds: ["B12-01"],
  }),
  canaryOwner({
    auditOwner: "core-workflow/eligibility-state/pending-no-entry",
    executionGroup: "eg-canary-doctor-read-only",
    fixtureCluster: "fc-canary-core-pending-root",
    directAuditIds: [],
    formalTargetAuditIds: ["B12-02"],
  }),
  canaryOwner({
    auditOwner: "core-workflow/eligibility-state/finality-inconsistent",
    executionGroup: "eg-canary-doctor-read-only",
    fixtureCluster: "fc-canary-core-finality-root",
    directAuditIds: [],
    formalTargetAuditIds: ["B12-13"],
  }),
  canaryOwner({
    auditOwner: "core-workflow/eligibility-state/denied-role-entry",
    executionGroup: "eg-canary-system-forbidden",
    fixtureCluster: "fc-canary-core-denied-system-root",
    directAuditIds: [],
    formalTargetAuditIds: ["B12-08"],
  }),
  canaryOwner({
    auditOwner:
      "resilience-security/presentation-safety/auth-route-deidentified",
    executionGroup: "eg-canary-auth-cross-cutting",
    fixtureCluster: "fc-canary-resilience-auth-root",
    directAuditIds: [],
    formalTargetAuditIds: ["B12-83", "B12-84", "B12-85"],
  }),
  canaryOwner({
    auditOwner: "core-workflow/success-idempotency/doctor-lock-success",
    executionGroup: "eg-canary-doctor-lock-write",
    fixtureCluster: "fc-canary-core-doctor-lock-root",
    directAuditIds: [],
    formalTargetAuditIds: [
      "B12-33",
      "B12-34",
      "B12-35",
      "B12-36",
      "B12-37",
      "B12-38",
      "B12-39",
      "B12-40",
      "B12-44",
      "B12-46",
      "B12-47",
      "B12-48",
    ],
  }),
]);

export function b12G3A2CanaryOwnersFor(
  executionGroup: B12G3A2CanaryExecutionGroup,
): readonly B12G3A2CanaryOwnerDefinition[] {
  return B12_G3_A2_CANARY_OWNERS.filter(
    (owner) => owner.executionGroup === executionGroup,
  );
}

export function b12G3A2CanaryOwner(
  auditOwner: string,
): B12G3A2CanaryOwnerDefinition {
  const owner = B12_G3_A2_CANARY_OWNERS.find(
    (candidate) => candidate.auditOwner === auditOwner,
  );
  if (!owner) throw new Error("B12_CANARY_OWNER_NOT_REGISTERED");
  return owner;
}

export const B12_G3_A2_CANARY_CROSS_CUTTING_DEFINITIONS = Object.freeze([
  {
    group: "auth_lifecycle",
    directAuditIds: [],
    supportingAuditIds: ["B12-83"],
    nonAuditQualityGate: false,
  },
  {
    group: "logout_cookie",
    directAuditIds: [],
    supportingAuditIds: ["B12-83"],
    nonAuditQualityGate: true,
  },
  {
    group: "cors_origin",
    directAuditIds: [],
    supportingAuditIds: ["B12-83"],
    nonAuditQualityGate: true,
  },
  {
    group: "deidentified_fixture",
    directAuditIds: [],
    supportingAuditIds: ["B12-85"],
    nonAuditQualityGate: true,
  },
] as const satisfies readonly B12CrossCuttingEvidenceDefinition[]);

export type B12G3A2CanaryOwnerResultSummary = Readonly<{
  auditOwner: string;
  result: B12OwnerResult;
  failureCategory: B12FailureCategory;
  minimalCleanupCompleted: boolean;
}>;

export type B12G3A2CanarySafeSummary = Readonly<{
  phase: typeof B12_G3_A2_CANARY_PHASE;
  evidenceScope: typeof B12_G3_A2_CANARY_EVIDENCE_SCOPE;
  auditClosureAllowed: typeof B12_G3_A2_CANARY_AUDIT_CLOSURE_ALLOWED;
  executionGroup: B12G3A2CanaryExecutionGroup;
  ownerCount: number;
  ownerResults: readonly B12G3A2CanaryOwnerResultSummary[];
  contextCount: number;
  sessionCount: number;
  fullCollectCount: number;
  minimalCleanupCount: number;
  interceptInstalledCount: number;
  interceptRemovedCount: number;
  logoutMechanism: B12LogoutMechanism | "not_completed";
  groupSetupSucceeded: boolean;
  groupCleanupSucceeded: boolean;
  profileCompletionBlocked: boolean;
  databaseTerminalEvidence: "not_applicable_to_canary";
  authLifecycleRequestCounts: Readonly<{
    preAuthenticationAuthMe: number;
    login: number;
    authenticatedAuthMe: number;
    workflowNavigationAuthMe: number;
    logout: number;
    postLogoutAuthMe: number;
  }> | null;
  elapsedMs: number;
}>;

export type B12G3A2CanaryCrossCuttingResult = Readonly<{
  group: "auth_lifecycle" | "logout_cookie" | "cors_origin" | "deidentified_fixture";
  supportingResult: B12CrossCuttingResult;
  nonAuditQualityGateResult: B12CrossCuttingResult;
}>;
