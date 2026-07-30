import type { AcceptanceRole } from "../../support/role-context-factory";
import type {
  B12AuditId,
  B12FailureCategory,
  B12GroupStopReason,
  B12OwnerDefinition,
  B12OwnerResult,
} from "../execution/b12-execution-types";

export const B12_G3_A3_CORE_PHASE = "G3-A3_CORE" as const;
export const B12_G3_A3_CORE_EVIDENCE_SCOPE = "formal_core" as const;
export const B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED = true as const;

export const B12_G3_A3_CORE_EXECUTION_GROUPS = [
  "eg-doctor-eligibility-read-only",
  "eg-admin-eligibility-read-only",
  "eg-denied-roles",
  "eg-lock-form-read-only",
  "eg-doctor-lock-write",
  "eg-admin-lock-write",
  "eg-already-locked-idempotency",
  "eg-lock-conflict-continue",
  "eg-lock-conflict-latest-locked",
  "eg-core-locked-read-only",
] as const;

export type B12G3A3CoreExecutionGroup =
  (typeof B12_G3_A3_CORE_EXECUTION_GROUPS)[number];

export const B12_G3_A3_MUTATION_CLASSES = [
  "no_product_write",
  "request_aborted_before_server",
  "a22_once",
  "stage_then_a22_once",
  "secondary_a22_once",
  "stage_then_secondary_a22_once",
] as const;

export type B12G3A3MutationClass =
  (typeof B12_G3_A3_MUTATION_CLASSES)[number];

export const B12_G3_A3_SESSION_STRATEGIES = [
  "reuse_primary_session",
  "isolated_primary_session",
  "three_role_contexts",
  "two_doctor_contexts",
] as const;

export type B12G3A3SessionStrategy =
  (typeof B12_G3_A3_SESSION_STRATEGIES)[number];

export type B12G3A3CoreOwnerDefinition = B12OwnerDefinition &
  Readonly<{
    profile: "core-workflow";
    scenarioKey:
      | "eligibility-state"
      | "lock-form-contract"
      | "success-idempotency"
      | "conflict"
      | "locked-readonly";
    routeKey: string;
    executionGroup: B12G3A3CoreExecutionGroup;
    primaryRole: AcceptanceRole;
    secondaryRole: AcceptanceRole | null;
    directAuditIds: readonly B12AuditId[];
    mandatorySupportingOwnerKeys: readonly string[];
    formalSupportingAuditIds: readonly B12AuditId[];
    expectedMutationClass: B12G3A3MutationClass;
    requiresStage: boolean;
    sessionStrategy: B12G3A3SessionStrategy;
    runtimeDescriptorCount: 1 | 2;
    evidenceScope: typeof B12_G3_A3_CORE_EVIDENCE_SCOPE;
    auditClosureAllowed: typeof B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED;
    profileVerifierAuditIds: readonly B12AuditId[];
  }>;

export type B12G3A3CoreGroupDefinition = Readonly<{
  executionGroup: B12G3A3CoreExecutionGroup;
  ownerKeys: readonly string[];
  contextCount: number;
  sessionCount: number;
  runtimeDescriptorCount: number;
  primaryRole: AcceptanceRole;
  fullCollectCount: 1;
}>;

export const B12_G3_A3_AUDIT_CLOSURE_RESULTS = [
  "pass",
  "fail",
  "not_executed",
  "blocked_by_group_setup",
  "blocked_by_supporting_owner",
  "blocked_by_profile_verifier",
] as const;

export type B12G3A3AuditClosureResult =
  (typeof B12_G3_A3_AUDIT_CLOSURE_RESULTS)[number];

export type B12G3A3AuditClosureEntry = Readonly<{
  auditId: B12AuditId;
  directOwner: string;
  result: B12G3A3AuditClosureResult;
  closureBlockedBySupportingOwner: boolean;
}>;

export type B12G3A3OwnerResultSummary = Readonly<{
  auditOwner: string;
  result: B12OwnerResult;
  failureCategory: B12FailureCategory;
  minimalCleanupCompleted: boolean;
}>;

export type B12G3A3CoreSafeSummary = Readonly<{
  phase: typeof B12_G3_A3_CORE_PHASE;
  evidenceScope: typeof B12_G3_A3_CORE_EVIDENCE_SCOPE;
  auditClosureAllowed: typeof B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED;
  executionGroup: B12G3A3CoreExecutionGroup;
  ownerCount: number;
  ownerResults: readonly B12G3A3OwnerResultSummary[];
  directAuditIds: readonly B12AuditId[];
  blockedAuditIds: readonly B12AuditId[];
  ContextCount: number;
  SessionCount: number;
  fullCollectCount: number;
  minimalCleanupCount: number;
  interceptInstalledCount: number;
  interceptRemovedCount: number;
  groupSetupSucceeded: boolean;
  groupCleanupSucceeded: boolean;
  profileCompletionBlocked: boolean;
  stopReason: B12GroupStopReason;
  elapsedMs: number;
}>;
