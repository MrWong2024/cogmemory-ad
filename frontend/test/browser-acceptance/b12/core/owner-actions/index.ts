import { conflictOwnerActions } from "./conflict-owner-actions";
import { eligibilityOwnerActions } from "./eligibility-owner-actions";
import { lockFormOwnerActions } from "./lock-form-owner-actions";
import { lockedReadonlyOwnerActions } from "./locked-readonly-owner-actions";
import { successIdempotencyOwnerActions } from "./success-idempotency-owner-actions";
import type {
  B12CoreOwnerAction,
  B12CoreOwnerActionContext,
  B12CoreOwnerActionResult,
} from "./owner-action-types";

const entries: readonly (readonly [string, B12CoreOwnerAction])[] = [
  ...Object.entries(eligibilityOwnerActions),
  ...Object.entries(lockFormOwnerActions),
  ...Object.entries(successIdempotencyOwnerActions),
  ...Object.entries(conflictOwnerActions),
  ...Object.entries(lockedReadonlyOwnerActions),
];

const registry = new Map<string, B12CoreOwnerAction>();
for (const [auditOwner, action] of entries) {
  if (registry.has(auditOwner)) {
    throw new Error("B12_CORE_OWNER_ACTION_DUPLICATE");
  }
  registry.set(auditOwner, action);
}

export const B12_CORE_OWNER_ACTION_KEYS = Object.freeze(
  entries.map(([auditOwner]) => auditOwner),
);

export function b12CoreOwnerAction(auditOwner: string): B12CoreOwnerAction {
  const action = registry.get(auditOwner);
  if (!action) throw new Error("B12_CORE_OWNER_ACTION_NOT_REGISTERED");
  return action;
}

export async function executeB12CoreOwnerAction(
  context: B12CoreOwnerActionContext,
): Promise<B12CoreOwnerActionResult> {
  return b12CoreOwnerAction(context.auditOwner)(context);
}

export function createB12CoreOwnerActionRegistryForSynthetic(
  entriesToRegister: readonly (readonly [string, B12CoreOwnerAction])[],
): ReadonlyMap<string, B12CoreOwnerAction> {
  const synthetic = new Map<string, B12CoreOwnerAction>();
  for (const [auditOwner, action] of entriesToRegister) {
    if (synthetic.has(auditOwner)) {
      throw new Error("B12_CORE_OWNER_ACTION_DUPLICATE");
    }
    synthetic.set(auditOwner, action);
  }
  return synthetic;
}

export type {
  B12CoreOwnerAction,
  B12CoreOwnerActionContext,
  B12CoreOwnerActionResult,
  B12CoreOwnerActionRun,
} from "./owner-action-types";
