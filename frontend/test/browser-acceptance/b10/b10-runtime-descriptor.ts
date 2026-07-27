import { lstat, readFile, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';

export type B1089RuntimeDescriptor = {
  version: 1;
  profile: 'public-surface-security';
  scenarioKey: 'responsive_keyboard';
  routeKey: 'long_report';
  role: 'doctor';
  loginIdentifier: string;
  navigationPath: string;
};

const ALLOWED_KEYS = [
  'loginIdentifier',
  'navigationPath',
  'profile',
  'role',
  'routeKey',
  'scenarioKey',
  'version',
];
const SAFE_OUTPUT_NAME = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?\.json$/;

function runtimeRoot(): string {
  return path.resolve(process.cwd(), '.browser-acceptance-runtime');
}

async function resolveSafeRuntimeFile(runtimeFile: string): Promise<string> {
  const root = runtimeRoot();
  const target = path.resolve(runtimeFile);
  if (
    path.dirname(target) !== root ||
    !SAFE_OUTPUT_NAME.test(path.basename(target))
  ) {
    throw new Error(
      'B10-89 runtime file must be a safe direct child of the runtime directory',
    );
  }
  const [rootStat, targetStat] = await Promise.all([
    lstat(root),
    lstat(target),
  ]);
  if (
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    !targetStat.isFile() ||
    targetStat.isSymbolicLink()
  ) {
    throw new Error(
      'B10-89 runtime file and directory must not use symbolic links',
    );
  }
  const [canonicalRoot, canonicalTarget] = await Promise.all([
    realpath(root),
    realpath(target),
  ]);
  if (path.dirname(canonicalTarget) !== canonicalRoot) {
    throw new Error('B10-89 runtime file escaped its fixed directory');
  }
  return canonicalTarget;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDescriptor(value: unknown): B1089RuntimeDescriptor {
  if (
    !isRecord(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(ALLOWED_KEYS)
  ) {
    throw new Error('B10-89 runtime descriptor has an invalid field allowlist');
  }
  if (
    value.version !== 1 ||
    value.profile !== 'public-surface-security' ||
    value.scenarioKey !== 'responsive_keyboard' ||
    value.routeKey !== 'long_report' ||
    value.role !== 'doctor' ||
    typeof value.loginIdentifier !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.loginIdentifier) ||
    typeof value.navigationPath !== 'string' ||
    !/^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}$/i.test(
      value.navigationPath,
    )
  ) {
    throw new Error('B10-89 runtime descriptor differs from its fixed target');
  }
  return value as B1089RuntimeDescriptor;
}

export async function readB1089RuntimeDescriptor(
  runtimeFile: string,
): Promise<B1089RuntimeDescriptor> {
  const target = await resolveSafeRuntimeFile(runtimeFile);
  const source = await readFile(target, 'utf8');
  if (Buffer.byteLength(source, 'utf8') > 4096) {
    throw new Error('B10-89 runtime descriptor exceeds the fixed size limit');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('B10-89 runtime descriptor is not valid JSON');
  }
  return parseDescriptor(parsed);
}

export async function deleteB1089RuntimeDescriptor(
  runtimeFile: string,
): Promise<boolean> {
  const target = await resolveSafeRuntimeFile(runtimeFile);
  await unlink(target);
  return true;
}
