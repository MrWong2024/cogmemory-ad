import { lstat, readFile, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';

import type { AcceptanceRole } from '../support/role-context-factory';

export type B11CoreScenarioKey =
  | 'edit-basics'
  | 'edit-concurrency'
  | 'submission'
  | 'confirmation'
  | 'final-readonly';

export type B11CoreRouteTarget = {
  scenarioKey: B11CoreScenarioKey;
  routeKey: string;
};

export type B11ResilienceScenarioKey =
  | 'action-ownership'
  | 'authorization'
  | 'network-failure'
  | 'client-boundary';

export type B11ResilienceRouteTarget = {
  scenarioKey: B11ResilienceScenarioKey;
  routeKey: string;
};

export type B11CoreRuntimeDescriptor = {
  version: 1;
  batch: 'B11';
  profile: 'core-workflow';
  scenarioKey: B11CoreScenarioKey;
  routeKey: string;
  primaryRole: AcceptanceRole;
  secondaryRole?: AcceptanceRole;
  loginIdentifier: string;
  secondaryLoginIdentifier?: string;
  navigationPath: string;
};

export type B11ResilienceRuntimeDescriptor = {
  version: 1;
  batch: 'B11';
  profile: 'resilience-security';
  scenarioKey: B11ResilienceScenarioKey;
  routeKey: string;
  primaryRole: AcceptanceRole;
  loginIdentifier: string;
  navigationPath: string;
};

const ROUTE_ROLES = {
  'edit-basics/system-draft-edit': ['doctor', null],
  'edit-basics/edit-field-validation': ['doctor', null],
  'edit-basics/edit-no-change': ['doctor', null],
  'edit-basics/edit-success': ['doctor', null],
  'edit-concurrency/edit-conflict-continue': ['doctor', 'doctor'],
  'edit-concurrency/edit-audit-limit': ['doctor', null],
  'edit-concurrency/edit-read-only-states': ['doctor', null],
  'submission/submission-success': ['doctor', null],
  'submission/submission-already-submitted': ['doctor', 'doctor'],
  'submission/submission-conflict': ['doctor', 'doctor'],
  'confirmation/confirmation-role-visibility': [
    'nurse',
    'research_assistant',
  ],
  'confirmation/confirmation-doctor-success': ['doctor', null],
  'confirmation/confirmation-admin-success': ['admin', null],
  'confirmation/confirmation-already-confirmed': ['doctor', 'doctor'],
  'confirmation/confirmation-conflict': ['doctor', null],
  'final-readonly/confirmed-readonly': ['doctor', null],
  'final-readonly/archived-readonly': ['doctor', null],
  'final-readonly/corrected-readonly': ['doctor', null],
  'final-readonly/voided-readonly': ['doctor', null],
  'final-readonly/clinician-content-boundary': ['doctor', null],
} as const satisfies Record<
  string,
  readonly [AcceptanceRole, AcceptanceRole | null]
>;
const ROUTE_ROLE_LOOKUP: Readonly<
  Record<string, readonly [AcceptanceRole, AcceptanceRole | null]>
> = ROUTE_ROLES;

const RESILIENCE_ROUTE_ROLES = {
  'action-ownership/unsupported-sibling-actions': 'doctor',
  'authorization/unauthorized-action': 'doctor',
  'authorization/forbidden-confirm': 'doctor',
  'network-failure/edit-network-abort': 'doctor',
  'network-failure/submit-network-abort': 'doctor',
  'network-failure/confirm-network-abort': 'doctor',
  'client-boundary/storage-and-refresh': 'doctor',
  'client-boundary/responsive-accessibility': 'doctor',
  'client-boundary/stale-disabled': 'doctor',
} as const satisfies Record<string, AcceptanceRole>;
const RESILIENCE_ROUTE_ROLE_LOOKUP: Readonly<Record<string, AcceptanceRole>> =
  RESILIENCE_ROUTE_ROLES;

const ALLOWED_BASE_KEYS = [
  'batch',
  'loginIdentifier',
  'navigationPath',
  'primaryRole',
  'profile',
  'routeKey',
  'scenarioKey',
  'version',
];
const SAFE_OUTPUT_NAME = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?\.json$/;

export function b11RuntimeRoot(): string {
  return path.resolve(process.cwd(), '.browser-acceptance-runtime');
}

export function b11RuntimeOutputName(target: B11CoreRouteTarget): string {
  return `b11-${target.scenarioKey}-${target.routeKey}.json`;
}

export function b11ResilienceRuntimeOutputName(
  target: B11ResilienceRouteTarget,
): string {
  return `b11-${target.scenarioKey}-${target.routeKey}.json`;
}

export function b11StageMarkerPath(
  marker: 'request' | 'completed',
): string {
  return path.resolve(
    b11RuntimeRoot(),
    `b11-confirmation-conflict-stage-${marker}.marker`,
  );
}

export function b11ForbiddenRoleStageMarkerPath(
  marker: 'request' | 'completed',
): string {
  return path.resolve(
    b11RuntimeRoot(),
    `b11-forbidden-confirm-role-stage-${marker}.marker`,
  );
}

async function resolveSafeRuntimeFile(
  outputName: string,
): Promise<string> {
  const root = b11RuntimeRoot();
  if (!SAFE_OUTPUT_NAME.test(outputName)) {
    throw new Error('B11 runtime output name is outside the fixed allowlist');
  }
  const resolvedTarget = path.resolve(root, outputName);
  if (path.dirname(resolvedTarget) !== root) {
    throw new Error('B11 runtime file escaped its fixed directory');
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
    throw new Error('B11 runtime file and directory must not use symlinks');
  }
  const [canonicalRoot, canonicalTarget] = await Promise.all([
    realpath(root),
    realpath(resolvedTarget),
  ]);
  if (path.dirname(canonicalTarget) !== canonicalRoot) {
    throw new Error('B11 runtime file escaped its canonical directory');
  }
  return canonicalTarget;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDescriptor(
  value: unknown,
  target: B11CoreRouteTarget,
): B11CoreRuntimeDescriptor {
  const routeContract =
    ROUTE_ROLE_LOOKUP[`${target.scenarioKey}/${target.routeKey}`];
  if (!routeContract || !isRecord(value)) {
    throw new Error('B11 runtime target is not a fixed core route');
  }
  const [primaryRole, secondaryRole] = routeContract;
  const expectedKeys = [
    ...ALLOWED_BASE_KEYS,
    ...(secondaryRole
      ? ['secondaryLoginIdentifier', 'secondaryRole']
      : []),
  ].sort();
  const keys = Object.keys(value).sort();
  if (
    JSON.stringify(keys) !== JSON.stringify(expectedKeys) ||
    value.version !== 1 ||
    value.batch !== 'B11' ||
    value.profile !== 'core-workflow' ||
    value.scenarioKey !== target.scenarioKey ||
    value.routeKey !== target.routeKey ||
    value.primaryRole !== primaryRole ||
    value.secondaryRole !== (secondaryRole ?? undefined) ||
    typeof value.loginIdentifier !== 'string' ||
    !/^b11c-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.loginIdentifier) ||
    (secondaryRole !== null &&
      (typeof value.secondaryLoginIdentifier !== 'string' ||
        !/^b11c-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
          value.secondaryLoginIdentifier,
        ))) ||
    typeof value.navigationPath !== 'string' ||
    !/^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}$/i.test(
      value.navigationPath,
    )
  ) {
    throw new Error('B11 runtime descriptor differs from its fixed target');
  }
  return value as B11CoreRuntimeDescriptor;
}

export async function readB11CoreRuntimeDescriptor(
  target: B11CoreRouteTarget,
): Promise<B11CoreRuntimeDescriptor> {
  const runtimeFile = await resolveSafeRuntimeFile(
    b11RuntimeOutputName(target),
  );
  const source = await readFile(runtimeFile, 'utf8');
  if (Buffer.byteLength(source, 'utf8') > 4096) {
    throw new Error('B11 runtime descriptor exceeds the fixed size limit');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('B11 runtime descriptor is not valid JSON');
  }
  return parseDescriptor(parsed, target);
}

export async function deleteB11CoreRuntimeDescriptor(
  target: B11CoreRouteTarget,
): Promise<boolean> {
  const runtimeFile = await resolveSafeRuntimeFile(
    b11RuntimeOutputName(target),
  );
  await unlink(runtimeFile);
  return true;
}

function parseResilienceDescriptor(
  value: unknown,
  target: B11ResilienceRouteTarget,
): B11ResilienceRuntimeDescriptor {
  const expectedRole =
    RESILIENCE_ROUTE_ROLE_LOOKUP[`${target.scenarioKey}/${target.routeKey}`];
  if (!expectedRole || !isRecord(value)) {
    throw new Error('B11 runtime target is not a fixed resilience route');
  }
  const keys = Object.keys(value).sort();
  if (
    JSON.stringify(keys) !== JSON.stringify([...ALLOWED_BASE_KEYS].sort()) ||
    value.version !== 1 ||
    value.batch !== 'B11' ||
    value.profile !== 'resilience-security' ||
    value.scenarioKey !== target.scenarioKey ||
    value.routeKey !== target.routeKey ||
    value.primaryRole !== expectedRole ||
    typeof value.loginIdentifier !== 'string' ||
    !/^b11r-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.loginIdentifier) ||
    typeof value.navigationPath !== 'string' ||
    !/^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}$/i.test(
      value.navigationPath,
    )
  ) {
    throw new Error('B11 resilience descriptor differs from its fixed target');
  }
  return value as B11ResilienceRuntimeDescriptor;
}

export async function readB11ResilienceRuntimeDescriptor(
  target: B11ResilienceRouteTarget,
): Promise<B11ResilienceRuntimeDescriptor> {
  const runtimeFile = await resolveSafeRuntimeFile(
    b11ResilienceRuntimeOutputName(target),
  );
  const source = await readFile(runtimeFile, 'utf8');
  if (Buffer.byteLength(source, 'utf8') > 4096) {
    throw new Error('B11 runtime descriptor exceeds the fixed size limit');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('B11 runtime descriptor is not valid JSON');
  }
  return parseResilienceDescriptor(parsed, target);
}

export async function deleteB11ResilienceRuntimeDescriptor(
  target: B11ResilienceRouteTarget,
): Promise<boolean> {
  const runtimeFile = await resolveSafeRuntimeFile(
    b11ResilienceRuntimeOutputName(target),
  );
  await unlink(runtimeFile);
  return true;
}
