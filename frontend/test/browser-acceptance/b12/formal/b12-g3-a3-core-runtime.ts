import {
  deleteB12CoreRuntimeDescriptor,
  readB12CoreRuntimeDescriptor,
  type B12CoreRouteTarget,
  type B12CoreRuntimeDescriptor,
} from "../b12-runtime-descriptor";
import type { B12G3A3CoreOwnerDefinition } from "./b12-g3-a3-formal-types";

export type B12G3A3CoreRuntimeSet = Readonly<{
  primary: B12CoreRuntimeDescriptor;
  system: B12CoreRuntimeDescriptor | null;
}>;

export function b12G3A3CoreTarget(
  owner: B12G3A3CoreOwnerDefinition,
): B12CoreRouteTarget {
  return Object.freeze({
    scenarioKey: owner.scenarioKey,
    routeKey: owner.routeKey,
  });
}

export async function readB12G3A3CoreRuntimeSet(
  owner: B12G3A3CoreOwnerDefinition,
): Promise<B12G3A3CoreRuntimeSet> {
  const target = b12G3A3CoreTarget(owner);
  const primary = await readB12CoreRuntimeDescriptor(target);
  const system =
    owner.auditOwner === "core-workflow/eligibility-state/denied-role-entry"
      ? await readB12CoreRuntimeDescriptor(target, "system")
      : null;
  if (
    primary.profile !== owner.profile ||
    primary.scenarioKey !== owner.scenarioKey ||
    primary.routeKey !== owner.routeKey ||
    primary.primaryRole !== owner.primaryRole ||
    (primary.secondaryRole ?? null) !== owner.secondaryRole ||
    (system !== null && system.primaryRole !== "system")
  ) {
    throw new Error("B12_FORMAL_CORE_RUNTIME_OWNER_MISMATCH");
  }
  return Object.freeze({ primary, system });
}

export async function deleteB12G3A3CoreRuntimeSet(
  owner: B12G3A3CoreOwnerDefinition,
): Promise<number> {
  const target = b12G3A3CoreTarget(owner);
  let count = 0;
  if (await deleteB12CoreRuntimeDescriptor(target)) count += 1;
  if (
    owner.auditOwner === "core-workflow/eligibility-state/denied-role-entry" &&
    (await deleteB12CoreRuntimeDescriptor(target, "system"))
  ) {
    count += 1;
  }
  return count;
}

export function b12G3A3CoreRunEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.B12_BROWSER_ACCEPTANCE_RUN === "1" &&
    env.B12_G3_A3_CORE_RUN === "1"
  );
}
