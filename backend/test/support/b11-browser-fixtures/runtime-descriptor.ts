import { randomUUID } from 'crypto';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  unlink,
} from 'fs/promises';
import path from 'path';
import {
  defaultB10RuntimeRoot,
  validateB10RuntimeOutputName,
} from '../../../scripts/b10-browser-fixtures';
import { accountNameFor, assertB11RuntimeTarget } from './fixture-contract';
import {
  B11_ROLES,
  B11FixtureError,
  type B11Profile,
  type B11RouteDefinition,
  type B11RuntimeDescriptor,
} from './fixture-types';

export function defaultB11RuntimeRoot(): string {
  return defaultB10RuntimeRoot();
}

export function validateB11RuntimeOutputName(value: string): string {
  try {
    return validateB10RuntimeOutputName(value);
  } catch {
    throw new B11FixtureError(
      'B11_FIXTURE_RUNTIME_OUTPUT_NAME_INVALID',
      'Runtime output name must be a safe lowercase JSON basename',
    );
  }
}

function descriptorKeys(value: B11RuntimeDescriptor): string[] {
  return Object.keys(value).sort();
}

export function assertB11RuntimeDescriptor(value: B11RuntimeDescriptor): void {
  const expectedKeys = [
    'batch',
    'loginIdentifier',
    'navigationPath',
    'primaryRole',
    'profile',
    'routeKey',
    'scenarioKey',
    'version',
    ...(value.secondaryRole
      ? ['secondaryLoginIdentifier', 'secondaryRole']
      : []),
  ].sort();
  let routeValue: B11RouteDefinition | null;
  try {
    routeValue = assertB11RuntimeTarget({
      profile: value.profile,
      scenarioKey: value.scenarioKey,
      routeKey: value.routeKey,
      role: value.primaryRole,
    });
  } catch {
    routeValue = null;
  }
  if (
    JSON.stringify(descriptorKeys(value)) !== JSON.stringify(expectedKeys) ||
    value.version !== 1 ||
    value.batch !== 'B11' ||
    !routeValue ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.loginIdentifier) ||
    !/^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}$/i.test(
      value.navigationPath,
    ) ||
    Boolean(value.secondaryRole) !== Boolean(value.secondaryLoginIdentifier) ||
    (value.secondaryRole !== undefined &&
      (routeValue.secondaryRole !== value.secondaryRole ||
        !value.secondaryLoginIdentifier ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.secondaryLoginIdentifier)))
  ) {
    throw new B11FixtureError(
      'B11_FIXTURE_RUNTIME_DESCRIPTOR_UNSAFE',
      'Runtime descriptor differs from the fixed B11 field and route allowlist',
      value.profile,
      value.scenarioKey,
      value.routeKey,
    );
  }
}

async function ensureSafeRuntimeRoot(runtimeRoot: string): Promise<string> {
  const resolvedRoot = path.resolve(runtimeRoot);
  await mkdir(resolvedRoot, { recursive: true, mode: 0o700 });
  const rootStat = await lstat(resolvedRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new B11FixtureError(
      'B11_FIXTURE_RUNTIME_DIRECTORY_UNSAFE',
      'Runtime descriptor directory must be a real directory',
    );
  }
  const canonicalRoot = await realpath(resolvedRoot);
  if (path.normalize(canonicalRoot) !== path.normalize(resolvedRoot)) {
    throw new B11FixtureError(
      'B11_FIXTURE_RUNTIME_DIRECTORY_UNSAFE',
      'Runtime descriptor directory must not escape through a symbolic link',
    );
  }
  return canonicalRoot;
}

async function existingTargetState(
  target: string,
): Promise<'missing' | 'regular'> {
  try {
    const targetStat = await lstat(target);
    if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
      throw new B11FixtureError(
        'B11_FIXTURE_RUNTIME_TARGET_UNSAFE',
        'Runtime descriptor target must be a regular non-symbolic-link file',
      );
    }
    return 'regular';
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw error;
  }
}

function runtimeTarget(canonicalRoot: string, outputName: string): string {
  const target = path.resolve(canonicalRoot, outputName);
  if (path.dirname(target) !== canonicalRoot) {
    throw new B11FixtureError(
      'B11_FIXTURE_RUNTIME_TARGET_UNSAFE',
      'Runtime descriptor target must stay inside the fixed runtime directory',
    );
  }
  return target;
}

export async function writeB11RuntimeDescriptor(
  descriptor: B11RuntimeDescriptor,
  outputName: string,
  runtimeRoot = defaultB11RuntimeRoot(),
): Promise<void> {
  assertB11RuntimeDescriptor(descriptor);
  const safeOutputName = validateB11RuntimeOutputName(outputName);
  const canonicalRoot = await ensureSafeRuntimeRoot(runtimeRoot);
  const target = runtimeTarget(canonicalRoot, safeOutputName);
  if ((await existingTargetState(target)) !== 'missing') {
    throw new B11FixtureError(
      'B11_FIXTURE_RUNTIME_TARGET_EXISTS',
      'Runtime descriptor target already exists and will not be overwritten',
    );
  }
  const temporaryTarget = runtimeTarget(
    canonicalRoot,
    `.${safeOutputName}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporaryTarget, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(descriptor)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    if ((await existingTargetState(target)) !== 'missing') {
      throw new B11FixtureError(
        'B11_FIXTURE_RUNTIME_TARGET_EXISTS',
        'Runtime descriptor target appeared during atomic creation',
      );
    }
    await rename(temporaryTarget, target);
    await chmod(target, 0o600);
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    await unlink(temporaryTarget).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
  }
}

export async function removeB11RuntimeDescriptor(
  outputName: string,
  runtimeRoot = defaultB11RuntimeRoot(),
): Promise<boolean> {
  const safeOutputName = validateB11RuntimeOutputName(outputName);
  const canonicalRoot = await ensureSafeRuntimeRoot(runtimeRoot);
  const target = runtimeTarget(canonicalRoot, safeOutputName);
  await existingTargetState(target);
  try {
    await unlink(target);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function isOwnedDescriptor(
  value: B11RuntimeDescriptor,
  profile: B11Profile,
  namespace: string,
): boolean {
  if (value.profile !== profile) return false;
  const ownedNames = new Set(
    B11_ROLES.map((role) => accountNameFor(profile, namespace, role)),
  );
  return (
    ownedNames.has(value.loginIdentifier) &&
    (value.secondaryLoginIdentifier === undefined ||
      ownedNames.has(value.secondaryLoginIdentifier))
  );
}

export async function cleanupB11RuntimeDescriptors(
  profile: B11Profile,
  namespace: string,
  runtimeRoot = defaultB11RuntimeRoot(),
): Promise<number> {
  const canonicalRoot = await ensureSafeRuntimeRoot(runtimeRoot);
  const names = await readdir(canonicalRoot);
  let removed = 0;
  for (const name of names) {
    let safeName: string;
    try {
      safeName = validateB11RuntimeOutputName(name);
    } catch {
      continue;
    }
    const target = runtimeTarget(canonicalRoot, safeName);
    try {
      if ((await existingTargetState(target)) !== 'regular') continue;
      const parsed = JSON.parse(await readFile(target, 'utf8')) as unknown;
      assertB11RuntimeDescriptor(parsed as B11RuntimeDescriptor);
      if (
        !isOwnedDescriptor(parsed as B11RuntimeDescriptor, profile, namespace)
      ) {
        continue;
      }
      await unlink(target);
      removed += 1;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      if (error instanceof B11FixtureError || error instanceof SyntaxError) {
        continue;
      }
      throw error;
    }
  }
  return removed;
}
