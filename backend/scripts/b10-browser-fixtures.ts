import 'reflect-metadata';
import type { INestApplicationContext, Type } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  chmod,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  unlink,
} from 'fs/promises';
import type { Connection } from 'mongoose';
import path from 'path';
import {
  DatabaseGateError,
  assertBrowserAcceptancePreImportEnvironment,
  assertBrowserFixtureDatabaseAccess,
} from '../src/config/database-purpose';
import type {
  B10BrowserFixtureManager,
  B10KeyboardRuntimeDescriptor,
} from '../test/support/b10-browser-fixtures/b10-browser-fixtures';
import {
  B10_DEFAULT_NAMESPACES,
  B10FixtureError,
  assertB10PreImportEnvironment,
  assertB10StageTarget,
  requireB10FixturePassword,
  toB10SafeErrorPayload,
  validateB10Namespace,
  validateB10Profile,
  type B10Profile,
  type B10VerifyPhase,
} from '../test/support/b10-browser-fixtures/fixture-contract';

export type B10Command =
  | 'prepare'
  | 'verify'
  | 'cleanup'
  | 'replace'
  | 'stage'
  | 'runtime';

export type ParsedCommand = {
  command: B10Command;
  profile: B10Profile;
  namespace: string;
  phase: B10VerifyPhase;
  scenarioKey?: string;
  routeKey?: string;
  outputName?: string;
};

export type B10RuntimeWriteSummary = {
  ok: true;
  command: 'runtime';
  profile: 'public-surface-security';
  scenarioKey: 'responsive_keyboard';
  routeKey: 'long_report';
  role: 'doctor';
  preparedVerified: true;
  runtimeDescriptorWritten: true;
};

type AppModuleExport = { AppModule: Type<unknown> };
type ManagerModuleExport = {
  createB10BrowserFixtureManager: (
    app: INestApplicationContext,
  ) => B10BrowserFixtureManager;
};

function requiredValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new B10FixtureError(
      'B10_FIXTURE_ARGUMENT_VALUE_REQUIRED',
      `${option} requires a value`,
    );
  }
  return value;
}

export function validateB10RuntimeOutputName(value: string): string {
  if (
    value !== path.basename(value) ||
    value.length > 80 ||
    !/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?\.json$/.test(value)
  ) {
    throw new B10FixtureError(
      'B10_FIXTURE_RUNTIME_OUTPUT_NAME_INVALID',
      'Runtime output name must be a safe lowercase JSON basename',
      'public-surface-security',
    );
  }
  return value;
}

function assertKeyboardRuntimeDescriptor(
  value: B10KeyboardRuntimeDescriptor,
): void {
  const keys = Object.keys(value).sort();
  const allowedKeys = [
    'loginIdentifier',
    'navigationPath',
    'profile',
    'role',
    'routeKey',
    'scenarioKey',
    'version',
  ];
  if (
    JSON.stringify(keys) !== JSON.stringify(allowedKeys) ||
    value.version !== 1 ||
    value.profile !== 'public-surface-security' ||
    value.scenarioKey !== 'responsive_keyboard' ||
    value.routeKey !== 'long_report' ||
    value.role !== 'doctor' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.loginIdentifier) ||
    !/^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}$/i.test(
      value.navigationPath,
    )
  ) {
    throw new B10FixtureError(
      'B10_FIXTURE_RUNTIME_DESCRIPTOR_UNSAFE',
      'Runtime descriptor differs from the fixed B10-89 field and target allowlist',
      'public-surface-security',
    );
  }
}

function sourceBackendRoot(): string {
  const directParent = path.resolve(__dirname, '..');
  return path.basename(directParent) === 'backend'
    ? directParent
    : path.resolve(directParent, '..');
}

export function defaultB10RuntimeRoot(): string {
  return path.resolve(
    sourceBackendRoot(),
    '..',
    'frontend',
    '.browser-acceptance-runtime',
  );
}

async function assertSafeRuntimeRoot(runtimeRoot: string): Promise<string> {
  const resolvedRoot = path.resolve(runtimeRoot);
  await mkdir(resolvedRoot, { recursive: true, mode: 0o700 });
  const rootStat = await lstat(resolvedRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new B10FixtureError(
      'B10_FIXTURE_RUNTIME_DIRECTORY_UNSAFE',
      'Runtime descriptor directory must be a real directory',
      'public-surface-security',
    );
  }
  const canonicalRoot = await realpath(resolvedRoot);
  if (path.normalize(canonicalRoot) !== path.normalize(resolvedRoot)) {
    throw new B10FixtureError(
      'B10_FIXTURE_RUNTIME_DIRECTORY_UNSAFE',
      'Runtime descriptor directory must not escape through a symbolic link',
      'public-surface-security',
    );
  }
  return canonicalRoot;
}

async function assertSafeExistingRuntimeTarget(target: string): Promise<void> {
  try {
    const targetStat = await lstat(target);
    if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
      throw new B10FixtureError(
        'B10_FIXTURE_RUNTIME_TARGET_UNSAFE',
        'Runtime descriptor target must be a regular non-symbolic-link file',
        'public-surface-security',
      );
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function writeB10RuntimeDescriptor(
  descriptor: B10KeyboardRuntimeDescriptor,
  outputName: string,
  runtimeRoot = defaultB10RuntimeRoot(),
): Promise<string> {
  assertKeyboardRuntimeDescriptor(descriptor);
  const safeOutputName = validateB10RuntimeOutputName(outputName);
  const canonicalRoot = await assertSafeRuntimeRoot(runtimeRoot);
  const target = path.resolve(canonicalRoot, safeOutputName);
  if (path.dirname(target) !== canonicalRoot) {
    throw new B10FixtureError(
      'B10_FIXTURE_RUNTIME_TARGET_UNSAFE',
      'Runtime descriptor target must stay inside the fixed runtime directory',
      'public-surface-security',
    );
  }
  await assertSafeExistingRuntimeTarget(target);
  const temporaryTarget = path.resolve(
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
    await assertSafeExistingRuntimeTarget(target);
    await rename(temporaryTarget, target);
    await chmod(target, 0o600);
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    await unlink(temporaryTarget).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
  }
  return target;
}

export async function removeB10RuntimeDescriptor(
  outputName: string,
  runtimeRoot = defaultB10RuntimeRoot(),
): Promise<boolean> {
  const safeOutputName = validateB10RuntimeOutputName(outputName);
  const canonicalRoot = await assertSafeRuntimeRoot(runtimeRoot);
  const target = path.resolve(canonicalRoot, safeOutputName);
  await assertSafeExistingRuntimeTarget(target);
  try {
    await unlink(target);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export function b10RuntimeWriteSummary(): B10RuntimeWriteSummary {
  return {
    ok: true,
    command: 'runtime',
    profile: 'public-surface-security',
    scenarioKey: 'responsive_keyboard',
    routeKey: 'long_report',
    role: 'doctor',
    preparedVerified: true,
    runtimeDescriptorWritten: true,
  };
}

export function parseCommand(argv: string[]): ParsedCommand {
  const command = argv[0];
  if (
    command !== 'prepare' &&
    command !== 'verify' &&
    command !== 'cleanup' &&
    command !== 'replace' &&
    command !== 'stage' &&
    command !== 'runtime'
  ) {
    throw new B10FixtureError(
      'B10_FIXTURE_COMMAND_INVALID',
      'Command must be prepare, verify, cleanup, replace, stage, or runtime',
    );
  }
  let rawProfile: string | undefined;
  let rawNamespace: string | undefined;
  let phase: B10VerifyPhase = 'prepared';
  let phaseProvided = false;
  let confirmCleanup = false;
  let confirmReplace = false;
  let rawScenarioKey: string | undefined;
  let rawRouteKey: string | undefined;
  let confirmStage = false;
  let confirmRuntime = false;
  let rawOutputName: string | undefined;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--profile') {
      rawProfile = requiredValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--namespace') {
      rawNamespace = requiredValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--phase') {
      phaseProvided = true;
      const value = requiredValue(argv, index, argument);
      if (value !== 'prepared' && value !== 'post-browser') {
        throw new B10FixtureError(
          'B10_FIXTURE_PHASE_INVALID',
          '--phase must be prepared or post-browser',
        );
      }
      phase = value;
      index += 1;
      continue;
    }
    if (argument === '--scenario') {
      rawScenarioKey = requiredValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--route') {
      rawRouteKey = requiredValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--confirm-cleanup') {
      confirmCleanup = true;
      continue;
    }
    if (argument === '--confirm-replace') {
      confirmReplace = true;
      continue;
    }
    if (argument === '--confirm-stage') {
      confirmStage = true;
      continue;
    }
    if (argument === '--confirm-runtime') {
      confirmRuntime = true;
      continue;
    }
    if (argument === '--output-name') {
      rawOutputName = requiredValue(argv, index, argument);
      index += 1;
      continue;
    }
    throw new B10FixtureError(
      'B10_FIXTURE_ARGUMENT_INVALID',
      'Unknown argument; passwords are accepted only through the process environment',
    );
  }
  if (!rawProfile) {
    throw new B10FixtureError(
      'B10_FIXTURE_PROFILE_REQUIRED',
      'Every B10 fixture command requires --profile',
    );
  }
  const profile = validateB10Profile(rawProfile);
  if (command === 'runtime' && profile !== 'public-surface-security') {
    throw new B10FixtureError(
      'B10_FIXTURE_RUNTIME_TARGET_NOT_ALLOWED',
      'runtime is limited to the fixed public-surface-security B10-89 target',
      profile,
    );
  }
  if (command === 'verify' && !phaseProvided) {
    throw new B10FixtureError(
      'B10_FIXTURE_PHASE_REQUIRED',
      'verify requires --phase prepared or --phase post-browser',
      profile,
    );
  }
  if (command !== 'verify' && phaseProvided) {
    throw new B10FixtureError(
      'B10_FIXTURE_PHASE_NOT_ALLOWED',
      '--phase is supported only by verify',
      profile,
    );
  }
  if (command === 'cleanup' && !confirmCleanup) {
    throw new B10FixtureError(
      'B10_FIXTURE_CLEANUP_CONFIRMATION_REQUIRED',
      'cleanup requires --confirm-cleanup',
      profile,
    );
  }
  if (command === 'replace' && !confirmReplace) {
    throw new B10FixtureError(
      'B10_FIXTURE_REPLACE_CONFIRMATION_REQUIRED',
      'replace requires --confirm-replace',
      profile,
    );
  }
  if (
    command === 'stage' &&
    (!confirmStage || !rawScenarioKey || !rawRouteKey)
  ) {
    throw new B10FixtureError(
      'B10_FIXTURE_STAGE_CONFIRMATION_REQUIRED',
      'stage requires --scenario, --route, and --confirm-stage',
      profile,
    );
  }
  if (command !== 'cleanup' && confirmCleanup) {
    throw new B10FixtureError(
      'B10_FIXTURE_CLEANUP_ARGUMENT_NOT_ALLOWED',
      '--confirm-cleanup is supported only by cleanup',
      profile,
    );
  }
  if (command !== 'replace' && confirmReplace) {
    throw new B10FixtureError(
      'B10_FIXTURE_REPLACE_ARGUMENT_NOT_ALLOWED',
      '--confirm-replace is supported only by replace',
      profile,
    );
  }
  if (command !== 'stage' && (confirmStage || rawScenarioKey || rawRouteKey)) {
    throw new B10FixtureError(
      'B10_FIXTURE_STAGE_ARGUMENT_NOT_ALLOWED',
      'Stage arguments are supported only by stage',
      profile,
    );
  }
  if (command === 'runtime' && (!confirmRuntime || !rawOutputName)) {
    throw new B10FixtureError(
      'B10_FIXTURE_RUNTIME_CONFIRMATION_REQUIRED',
      'runtime requires --confirm-runtime and --output-name',
      profile,
    );
  }
  if (command !== 'runtime' && (confirmRuntime || rawOutputName)) {
    throw new B10FixtureError(
      'B10_FIXTURE_RUNTIME_ARGUMENT_NOT_ALLOWED',
      'Runtime arguments are supported only by runtime',
      profile,
    );
  }
  if (command === 'stage') {
    assertB10StageTarget(profile, rawScenarioKey, rawRouteKey);
  }
  return {
    command,
    profile,
    namespace: validateB10Namespace(
      profile,
      rawNamespace ?? B10_DEFAULT_NAMESPACES[profile],
    ),
    phase,
    scenarioKey: rawScenarioKey,
    routeKey: rawRouteKey,
    outputName:
      command === 'runtime' && rawOutputName
        ? validateB10RuntimeOutputName(rawOutputName)
        : undefined,
  };
}

function writeSafeError(error: unknown): void {
  if (error instanceof DatabaseGateError) {
    console.error(
      JSON.stringify({ ok: false, code: error.code, message: error.message }),
    );
    return;
  }
  console.error(JSON.stringify(toB10SafeErrorPayload(error)));
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    assertB10PreImportEnvironment(process.env.NODE_ENV);
    const parsed = parseCommand(process.argv.slice(2));
    const password =
      parsed.command === 'prepare' ||
      parsed.command === 'verify' ||
      parsed.command === 'replace' ||
      parsed.command === 'stage' ||
      parsed.command === 'runtime'
        ? requireB10FixturePassword(process.env.B10_FIXTURE_PASSWORD)
        : undefined;
    assertBrowserAcceptancePreImportEnvironment({
      nodeEnv: process.env.NODE_ENV,
      purpose: process.env.COGMEMORY_DATABASE_PURPOSE,
      mongoUri: process.env.MONGO_URI,
    });
    const [{ NestFactory }, mongooseModule] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/mongoose'),
    ]);
    // Application modules are loaded only after the process and database gates.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as AppModuleExport;
    const managerModule =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../test/support/b10-browser-fixtures/b10-browser-fixtures') as ManagerModuleExport;
    app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: false,
    });
    connection = app.get<Connection>(mongooseModule.getConnectionToken());
    await assertBrowserFixtureDatabaseAccess(connection);
    const manager = managerModule.createB10BrowserFixtureManager(app);
    const result =
      parsed.command === 'prepare'
        ? await manager.prepare(parsed.profile, parsed.namespace, password)
        : parsed.command === 'verify'
          ? await manager.verify(
              parsed.profile,
              parsed.namespace,
              password,
              parsed.phase,
            )
          : parsed.command === 'replace'
            ? await manager.replace(parsed.profile, parsed.namespace, password)
            : parsed.command === 'stage'
              ? await manager.stage(
                  parsed.profile,
                  parsed.namespace,
                  password,
                  parsed.scenarioKey,
                  parsed.routeKey,
                )
              : parsed.command === 'runtime'
                ? await manager.resolveKeyboardRuntimeDescriptor(
                    parsed.profile,
                    parsed.namespace,
                    password,
                  )
                : await manager.cleanup(parsed.profile, parsed.namespace);
    if (parsed.command === 'runtime') {
      if (!parsed.outputName) {
        throw new B10FixtureError(
          'B10_FIXTURE_RUNTIME_OUTPUT_NAME_INVALID',
          'Runtime output name is missing',
          parsed.profile,
        );
      }
      await writeB10RuntimeDescriptor(
        result as B10KeyboardRuntimeDescriptor,
        parsed.outputName,
      );
      console.log(JSON.stringify(b10RuntimeWriteSummary()));
      return;
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error: unknown) {
    process.exitCode = 1;
    writeSafeError(error);
  } finally {
    if (app) {
      try {
        await app.close();
      } catch {
        process.exitCode = 1;
      }
    }
    if (connection?.readyState) {
      try {
        await connection.close();
      } catch {
        process.exitCode = 1;
      }
    }
  }
}

if (require.main === module) {
  void run();
}
