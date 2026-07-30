import { lstat, readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";

import type { AcceptanceRole } from "../support/role-context-factory";

export type B12CoreScenarioKey =
  | "eligibility-state"
  | "lock-form-contract"
  | "success-idempotency"
  | "conflict"
  | "locked-readonly";

export type B12CoreRouteTarget = {
  scenarioKey: B12CoreScenarioKey;
  routeKey: string;
};

export type B12ResilienceCanaryRouteTarget = {
  profile: "resilience-security";
  scenarioKey: "presentation-safety";
  routeKey: "auth-route-deidentified";
};

export type B12CoreRuntimeDescriptor = {
  version: 1;
  batch: "B12";
  profile: "core-workflow";
  scenarioKey: B12CoreScenarioKey;
  routeKey: string;
  primaryRole: AcceptanceRole;
  secondaryRole?: AcceptanceRole;
  loginIdentifier: string;
  secondaryLoginIdentifier?: string;
  navigationPath: string;
};

export type B12ResilienceCanaryRuntimeDescriptor = {
  version: 1;
  batch: "B12";
  profile: "resilience-security";
  scenarioKey: "presentation-safety";
  routeKey: "auth-route-deidentified";
  primaryRole: "doctor";
  loginIdentifier: string;
  navigationPath: string;
};

const ROUTE_ROLES = {
  "eligibility-state/draft-no-entry": ["doctor", null],
  "eligibility-state/pending-no-entry": ["doctor", null],
  "eligibility-state/confirmed-doctor-entry": ["doctor", null],
  "eligibility-state/confirmed-admin-entry": ["admin", null],
  "eligibility-state/denied-role-entry": ["nurse", "research_assistant"],
  "eligibility-state/quality-not-passed": ["doctor", null],
  "eligibility-state/finality-inconsistent": ["doctor", null],
  "eligibility-state/confirmation-missing": ["doctor", null],
  "eligibility-state/visit-locked-v1": ["doctor", null],
  "eligibility-state/visit-voided-v1": ["doctor", null],
  "eligibility-state/already-locked-no-repeat": ["doctor", null],
  "eligibility-state/lock-without-locked-at-warning": ["doctor", null],
  "eligibility-state/locked-at-without-lock-warning": ["doctor", null],
  "eligibility-state/lock-time-mismatch-warning": ["doctor", null],
  "lock-form-contract/irreversible-disclosure": ["doctor", null],
  "lock-form-contract/validation-request-contract": ["doctor", null],
  "success-idempotency/doctor-lock-success": ["doctor", null],
  "success-idempotency/admin-lock-success": ["admin", null],
  "success-idempotency/already-locked-idempotency": ["doctor", "doctor"],
  "conflict/lock-conflict-continue": ["doctor", null],
  "conflict/lock-conflict-latest-locked": ["doctor", "doctor"],
  "locked-readonly/locked-readonly-semantics": ["doctor", null],
} as const satisfies Record<
  string,
  readonly [AcceptanceRole, AcceptanceRole | null]
>;

const ROUTE_ROLE_LOOKUP: Readonly<
  Record<string, readonly [AcceptanceRole, AcceptanceRole | null]>
> = ROUTE_ROLES;

const ALLOWED_BASE_KEYS = [
  "batch",
  "loginIdentifier",
  "navigationPath",
  "primaryRole",
  "profile",
  "routeKey",
  "scenarioKey",
  "version",
];
const SAFE_OUTPUT_NAME = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?\.json$/;

export function b12RuntimeRoot(): string {
  return path.resolve(process.cwd(), ".browser-acceptance-runtime");
}

export function b12RuntimeOutputName(
  target: B12CoreRouteTarget,
  role?: "system",
): string {
  return `b12-${target.scenarioKey}-${target.routeKey}${role ? `-${role}` : ""}.json`;
}

export function b12ResilienceCanaryRuntimeOutputName(): string {
  return "b12-resilience-presentation-safety-auth-route-deidentified.json";
}

export function b12StageMarkerPath(
  transition: "lock-conflict-touch" | "lock-conflict-latest-locked-touch",
  marker: "request" | "completed",
): string {
  return path.resolve(
    b12RuntimeRoot(),
    `b12-${transition}-stage-${marker}.marker`,
  );
}

async function resolveSafeRuntimeFile(outputName: string): Promise<string> {
  const root = b12RuntimeRoot();
  if (!SAFE_OUTPUT_NAME.test(outputName)) {
    throw new Error("B12 runtime output name is outside the fixed allowlist");
  }
  const resolvedTarget = path.resolve(root, outputName);
  if (path.dirname(resolvedTarget) !== root) {
    throw new Error("B12 runtime file escaped its fixed directory");
  }
  const [rootStat, targetStat] = await Promise.all([
    lstat(root),
    lstat(resolvedTarget),
  ]);
  if (
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    !targetStat.isFile() ||
    targetStat.isSymbolicLink()
  ) {
    throw new Error("B12 runtime file and directory must not use symlinks");
  }
  const [canonicalRoot, canonicalTarget] = await Promise.all([
    realpath(root),
    realpath(resolvedTarget),
  ]);
  if (path.dirname(canonicalTarget) !== canonicalRoot) {
    throw new Error("B12 runtime file escaped its canonical directory");
  }
  return canonicalTarget;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDescriptor(
  value: unknown,
  target: B12CoreRouteTarget,
  roleOverride?: "system",
): B12CoreRuntimeDescriptor {
  const routeContract =
    ROUTE_ROLE_LOOKUP[`${target.scenarioKey}/${target.routeKey}`];
  if (!routeContract || !isRecord(value)) {
    throw new Error("B12 runtime target is not a fixed core route");
  }
  const primaryRole = roleOverride ?? routeContract[0];
  const secondaryRole = roleOverride ? null : routeContract[1];
  if (
    roleOverride === "system" &&
    `${target.scenarioKey}/${target.routeKey}` !==
      "eligibility-state/denied-role-entry"
  ) {
    throw new Error("B12 system descriptor is allowed only for B12-08");
  }
  const expectedKeys = [
    ...ALLOWED_BASE_KEYS,
    ...(secondaryRole ? ["secondaryLoginIdentifier", "secondaryRole"] : []),
  ].sort();
  if (
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify(expectedKeys) ||
    value.version !== 1 ||
    value.batch !== "B12" ||
    value.profile !== "core-workflow" ||
    value.scenarioKey !== target.scenarioKey ||
    value.routeKey !== target.routeKey ||
    value.primaryRole !== primaryRole ||
    value.secondaryRole !== (secondaryRole ?? undefined) ||
    typeof value.loginIdentifier !== "string" ||
    !/^b12c-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.loginIdentifier) ||
    (secondaryRole !== null &&
      (typeof value.secondaryLoginIdentifier !== "string" ||
        !/^b12c-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
          value.secondaryLoginIdentifier,
        ))) ||
    typeof value.navigationPath !== "string" ||
    !/^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}$/i.test(
      value.navigationPath,
    )
  ) {
    throw new Error("B12 runtime descriptor differs from its fixed target");
  }
  return value as B12CoreRuntimeDescriptor;
}

export function validateB12ResilienceCanaryRuntimeDescriptorValue(
  value: unknown,
): B12ResilienceCanaryRuntimeDescriptor {
  if (!isRecord(value)) {
    throw new Error("B12 resilience canary runtime descriptor is invalid");
  }
  const expectedKeys = ALLOWED_BASE_KEYS;
  if (
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify([...expectedKeys].sort()) ||
    value.version !== 1 ||
    value.batch !== "B12" ||
    value.profile !== "resilience-security" ||
    value.scenarioKey !== "presentation-safety" ||
    value.routeKey !== "auth-route-deidentified" ||
    value.primaryRole !== "doctor" ||
    typeof value.loginIdentifier !== "string" ||
    !/^b12r-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.loginIdentifier) ||
    typeof value.navigationPath !== "string" ||
    !/^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}$/i.test(
      value.navigationPath,
    )
  ) {
    throw new Error(
      "B12 resilience canary runtime descriptor differs from its fixed target",
    );
  }
  return value as B12ResilienceCanaryRuntimeDescriptor;
}

export async function readB12CoreRuntimeDescriptor(
  target: B12CoreRouteTarget,
  roleOverride?: "system",
): Promise<B12CoreRuntimeDescriptor> {
  const runtimeFile = await resolveSafeRuntimeFile(
    b12RuntimeOutputName(target, roleOverride),
  );
  const source = await readFile(runtimeFile, "utf8");
  if (Buffer.byteLength(source, "utf8") > 4096) {
    throw new Error("B12 runtime descriptor exceeds the fixed size limit");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("B12 runtime descriptor is not valid JSON");
  }
  return parseDescriptor(parsed, target, roleOverride);
}

export async function readB12ResilienceCanaryRuntimeDescriptor(): Promise<B12ResilienceCanaryRuntimeDescriptor> {
  const runtimeFile = await resolveSafeRuntimeFile(
    b12ResilienceCanaryRuntimeOutputName(),
  );
  const source = await readFile(runtimeFile, "utf8");
  if (Buffer.byteLength(source, "utf8") > 4096) {
    throw new Error("B12 runtime descriptor exceeds the fixed size limit");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("B12 runtime descriptor is not valid JSON");
  }
  return validateB12ResilienceCanaryRuntimeDescriptorValue(parsed);
}

export async function deleteB12CoreRuntimeDescriptor(
  target: B12CoreRouteTarget,
  roleOverride?: "system",
): Promise<boolean> {
  const runtimeFile = await resolveSafeRuntimeFile(
    b12RuntimeOutputName(target, roleOverride),
  );
  await unlink(runtimeFile);
  return true;
}

export async function deleteB12ResilienceCanaryRuntimeDescriptor(): Promise<boolean> {
  const runtimeFile = await resolveSafeRuntimeFile(
    b12ResilienceCanaryRuntimeOutputName(),
  );
  await unlink(runtimeFile);
  return true;
}
