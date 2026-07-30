import type { B12CoreRuntimeDescriptor } from "../../b12-runtime-descriptor";
import type { B12BrowserSession } from "../../b12-core-support";

export type B12CoreOwnerActionRun = Readonly<{
  primary: () => Promise<B12BrowserSession>;
  secondary: () => Promise<B12BrowserSession>;
  system: () => Promise<B12BrowserSession>;
}>;

export type B12CoreOwnerActionContext = Readonly<{
  auditOwner: string;
  descriptor: Readonly<B12CoreRuntimeDescriptor>;
  run: B12CoreOwnerActionRun;
}>;

export type B12CoreOwnerActionResult = Readonly<{
  outcome: "business_assertions_completed";
}>;

export type B12CoreOwnerAction = (
  context: B12CoreOwnerActionContext,
) => Promise<B12CoreOwnerActionResult>;

export const B12_CORE_OWNER_ACTION_COMPLETED = Object.freeze({
  outcome: "business_assertions_completed" as const,
});
