import {
  deleteB12CoreRuntimeDescriptor,
  deleteB12ResilienceCanaryRuntimeDescriptor,
  readB12CoreRuntimeDescriptor,
  readB12ResilienceCanaryRuntimeDescriptor,
  type B12CoreRouteTarget,
  type B12CoreRuntimeDescriptor,
  type B12ResilienceCanaryRuntimeDescriptor,
} from "../b12-runtime-descriptor";
import type { B12G3A2CanaryOwnerDefinition } from "./b12-g3-a2-canary-types";

export type B12G3A2CanaryRuntimeDescriptor =
  | B12CoreRuntimeDescriptor
  | B12ResilienceCanaryRuntimeDescriptor;

type CoreCanaryRuntimeTarget = Readonly<{
  target: B12CoreRouteTarget;
  roleOverride?: "system";
}>;

const CORE_RUNTIME_TARGETS: Readonly<Record<string, CoreCanaryRuntimeTarget>> = {
  "core-workflow/eligibility-state/draft-no-entry": {
    target: {
      scenarioKey: "eligibility-state",
      routeKey: "draft-no-entry",
    },
  },
  "core-workflow/eligibility-state/pending-no-entry": {
    target: {
      scenarioKey: "eligibility-state",
      routeKey: "pending-no-entry",
    },
  },
  "core-workflow/eligibility-state/finality-inconsistent": {
    target: {
      scenarioKey: "eligibility-state",
      routeKey: "finality-inconsistent",
    },
  },
  "core-workflow/eligibility-state/denied-role-entry": {
    target: {
      scenarioKey: "eligibility-state",
      routeKey: "denied-role-entry",
    },
    roleOverride: "system",
  },
  "core-workflow/success-idempotency/doctor-lock-success": {
    target: {
      scenarioKey: "success-idempotency",
      routeKey: "doctor-lock-success",
    },
  },
};

const RESILIENCE_OWNER =
  "resilience-security/presentation-safety/auth-route-deidentified";

export async function readB12G3A2CanaryRuntimeDescriptor(
  owner: B12G3A2CanaryOwnerDefinition,
): Promise<B12G3A2CanaryRuntimeDescriptor> {
  if (owner.auditOwner === RESILIENCE_OWNER) {
    return readB12ResilienceCanaryRuntimeDescriptor();
  }
  const target = CORE_RUNTIME_TARGETS[owner.auditOwner];
  if (!target) throw new Error("B12_CANARY_RUNTIME_OWNER_NOT_ALLOWED");
  return readB12CoreRuntimeDescriptor(target.target, target.roleOverride);
}

export async function deleteB12G3A2CanaryRuntimeDescriptor(
  owner: B12G3A2CanaryOwnerDefinition,
): Promise<boolean> {
  if (owner.auditOwner === RESILIENCE_OWNER) {
    return deleteB12ResilienceCanaryRuntimeDescriptor();
  }
  const target = CORE_RUNTIME_TARGETS[owner.auditOwner];
  if (!target) throw new Error("B12_CANARY_RUNTIME_OWNER_NOT_ALLOWED");
  return deleteB12CoreRuntimeDescriptor(target.target, target.roleOverride);
}

export function assertB12G3A2CanaryRuntimeMatchesOwner(
  owner: B12G3A2CanaryOwnerDefinition,
  descriptor: B12G3A2CanaryRuntimeDescriptor,
): void {
  const segments = owner.auditOwner.split("/");
  if (
    descriptor.profile !== segments[0] ||
    descriptor.scenarioKey !== segments[1] ||
    descriptor.routeKey !== segments[2]
  ) {
    throw new Error("B12_CANARY_RUNTIME_PROFILE_OR_TARGET_MISMATCH");
  }
  if (
    owner.auditOwner ===
      "core-workflow/eligibility-state/denied-role-entry" &&
    descriptor.primaryRole !== "system"
  ) {
    throw new Error("B12_CANARY_SYSTEM_RUNTIME_ROLE_MISMATCH");
  }
}
