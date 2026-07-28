import 'reflect-metadata';
import type { INestApplicationContext, Type } from '@nestjs/common';
import type { Connection } from 'mongoose';
import {
  DatabaseGateError,
  assertBrowserAcceptancePreImportEnvironment,
  assertBrowserFixtureDatabaseAccess,
} from '../src/config/database-purpose';
import type { B11BrowserFixtureManager } from '../test/support/b11-browser-fixtures/b11-browser-fixtures';
import {
  assertB11PreImportEnvironment,
  assertB11RuntimeTarget,
  assertB11StageTarget,
  requireB11FixturePassword,
  validateB11Namespace,
  validateB11Profile,
  validateB11Role,
} from '../test/support/b11-browser-fixtures/fixture-contract';
import { assertB11SafeOutput } from '../test/support/b11-browser-fixtures/fixture-manifest';
import {
  validateB11RuntimeOutputName,
  writeB11RuntimeDescriptor,
} from '../test/support/b11-browser-fixtures/runtime-descriptor';
import {
  B11FixtureError,
  toB11SafeErrorPayload,
  type B11Profile,
  type B11Role,
  type B11StageTransition,
  type B11VerifyPhase,
} from '../test/support/b11-browser-fixtures/fixture-types';

export type B11Command =
  | 'prepare'
  | 'verify'
  | 'replace'
  | 'stage'
  | 'runtime'
  | 'cleanup';

export type B11ParsedCommand = {
  command: B11Command;
  profile: B11Profile;
  namespace: string;
  phase?: B11VerifyPhase;
  scenarioKey?: string;
  routeKey?: string;
  transition?: B11StageTransition;
  role?: B11Role;
  outputName?: string;
};

type AppModuleExport = { AppModule: Type<unknown> };
type ManagerModuleExport = {
  createB11BrowserFixtureManager: (
    app: INestApplicationContext,
  ) => B11BrowserFixtureManager;
};

function requiredValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new B11FixtureError(
      'B11_FIXTURE_ARGUMENT_VALUE_REQUIRED',
      `${option} requires a value`,
    );
  }
  return value;
}

function setOnce(
  current: string | undefined,
  value: string,
  option: string,
): string {
  if (current !== undefined) {
    throw new B11FixtureError(
      'B11_FIXTURE_ARGUMENT_DUPLICATE',
      `${option} may be supplied only once`,
    );
  }
  return value;
}

export function parseB11Command(argv: string[]): B11ParsedCommand {
  const command = argv[0];
  if (
    command !== 'prepare' &&
    command !== 'verify' &&
    command !== 'replace' &&
    command !== 'stage' &&
    command !== 'runtime' &&
    command !== 'cleanup'
  ) {
    throw new B11FixtureError(
      'B11_FIXTURE_COMMAND_INVALID',
      'Command must be prepare, verify, replace, stage, runtime, or cleanup',
    );
  }
  let rawProfile: string | undefined;
  let rawNamespace: string | undefined;
  let rawPhase: string | undefined;
  let rawScenarioKey: string | undefined;
  let rawRouteKey: string | undefined;
  let rawTransition: string | undefined;
  let rawRole: string | undefined;
  let rawOutputName: string | undefined;
  let confirmReplace = false;
  let confirmStage = false;
  let confirmRuntime = false;
  let confirmCleanup = false;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--profile') {
      rawProfile = setOnce(
        rawProfile,
        requiredValue(argv, index, argument),
        argument,
      );
      index += 1;
      continue;
    }
    if (argument === '--namespace') {
      rawNamespace = setOnce(
        rawNamespace,
        requiredValue(argv, index, argument),
        argument,
      );
      index += 1;
      continue;
    }
    if (argument === '--phase') {
      rawPhase = setOnce(
        rawPhase,
        requiredValue(argv, index, argument),
        argument,
      );
      index += 1;
      continue;
    }
    if (argument === '--scenario') {
      rawScenarioKey = setOnce(
        rawScenarioKey,
        requiredValue(argv, index, argument),
        argument,
      );
      index += 1;
      continue;
    }
    if (argument === '--route') {
      rawRouteKey = setOnce(
        rawRouteKey,
        requiredValue(argv, index, argument),
        argument,
      );
      index += 1;
      continue;
    }
    if (argument === '--transition') {
      rawTransition = setOnce(
        rawTransition,
        requiredValue(argv, index, argument),
        argument,
      );
      index += 1;
      continue;
    }
    if (argument === '--role') {
      rawRole = setOnce(
        rawRole,
        requiredValue(argv, index, argument),
        argument,
      );
      index += 1;
      continue;
    }
    if (argument === '--output-name') {
      rawOutputName = setOnce(
        rawOutputName,
        requiredValue(argv, index, argument),
        argument,
      );
      index += 1;
      continue;
    }
    if (argument === '--confirm-replace-b11-namespace') {
      confirmReplace = true;
      continue;
    }
    if (argument === '--confirm-stage-b11-transition') {
      confirmStage = true;
      continue;
    }
    if (argument === '--confirm-runtime-b11-descriptor') {
      confirmRuntime = true;
      continue;
    }
    if (argument === '--confirm-cleanup-b11-namespace') {
      confirmCleanup = true;
      continue;
    }
    throw new B11FixtureError(
      'B11_FIXTURE_ARGUMENT_INVALID',
      'Unknown argument; IDs, paths, URLs, database fields, JSON, and passwords are not accepted',
    );
  }
  if (!rawProfile || !rawNamespace) {
    throw new B11FixtureError(
      'B11_FIXTURE_SCOPE_REQUIRED',
      'Every command requires explicit --profile and --namespace',
    );
  }
  const profile = validateB11Profile(rawProfile);
  const namespace = validateB11Namespace(profile, rawNamespace);
  const phase =
    rawPhase === 'prepared' || rawPhase === 'post-browser'
      ? rawPhase
      : undefined;
  if (command === 'verify' && !phase) {
    throw new B11FixtureError(
      'B11_FIXTURE_PHASE_REQUIRED',
      'verify requires --phase prepared or --phase post-browser',
      profile,
    );
  }
  if (rawPhase && !phase) {
    throw new B11FixtureError(
      'B11_FIXTURE_PHASE_INVALID',
      '--phase must be prepared or post-browser',
      profile,
    );
  }
  if (command !== 'verify' && rawPhase !== undefined) {
    throw new B11FixtureError(
      'B11_FIXTURE_PHASE_NOT_ALLOWED',
      '--phase is supported only by verify',
      profile,
    );
  }
  if (command === 'replace' ? !confirmReplace : confirmReplace) {
    throw new B11FixtureError(
      'B11_FIXTURE_REPLACE_CONFIRMATION_INVALID',
      'replace alone requires --confirm-replace-b11-namespace',
      profile,
    );
  }
  if (command === 'cleanup' ? !confirmCleanup : confirmCleanup) {
    throw new B11FixtureError(
      'B11_FIXTURE_CLEANUP_CONFIRMATION_INVALID',
      'cleanup alone requires --confirm-cleanup-b11-namespace',
      profile,
    );
  }
  const role = rawRole ? validateB11Role(rawRole) : undefined;
  if (command === 'stage') {
    if (
      !confirmStage ||
      !rawScenarioKey ||
      !rawRouteKey ||
      !rawTransition ||
      !role
    ) {
      throw new B11FixtureError(
        'B11_FIXTURE_STAGE_CONFIRMATION_REQUIRED',
        'stage requires scenario, route, transition, role, and its fixed confirmation',
        profile,
      );
    }
    assertB11StageTarget({
      profile,
      scenarioKey: rawScenarioKey,
      routeKey: rawRouteKey,
      transition: rawTransition,
      role,
    });
  } else if (
    confirmStage ||
    rawTransition !== undefined ||
    (command !== 'runtime' &&
      (rawScenarioKey !== undefined ||
        rawRouteKey !== undefined ||
        rawRole !== undefined))
  ) {
    throw new B11FixtureError(
      'B11_FIXTURE_STAGE_ARGUMENT_NOT_ALLOWED',
      'Stage arguments are supported only by stage',
      profile,
    );
  }
  if (command === 'runtime') {
    if (
      !confirmRuntime ||
      !rawScenarioKey ||
      !rawRouteKey ||
      !role ||
      !rawOutputName
    ) {
      throw new B11FixtureError(
        'B11_FIXTURE_RUNTIME_CONFIRMATION_REQUIRED',
        'runtime requires scenario, route, role, output-name, and its fixed confirmation',
        profile,
      );
    }
    assertB11RuntimeTarget({
      profile,
      scenarioKey: rawScenarioKey,
      routeKey: rawRouteKey,
      role,
    });
  } else if (confirmRuntime || rawOutputName !== undefined) {
    throw new B11FixtureError(
      'B11_FIXTURE_RUNTIME_ARGUMENT_NOT_ALLOWED',
      'Runtime arguments are supported only by runtime',
      profile,
    );
  }
  return {
    command,
    profile,
    namespace,
    ...(phase ? { phase } : {}),
    ...(rawScenarioKey ? { scenarioKey: rawScenarioKey } : {}),
    ...(rawRouteKey ? { routeKey: rawRouteKey } : {}),
    ...(rawTransition
      ? { transition: rawTransition as B11StageTransition }
      : {}),
    ...(role ? { role } : {}),
    ...(rawOutputName
      ? { outputName: validateB11RuntimeOutputName(rawOutputName) }
      : {}),
  };
}

function writeSafeError(error: unknown): void {
  if (error instanceof DatabaseGateError) {
    console.error(
      JSON.stringify({ ok: false, code: error.code, message: error.message }),
    );
    return;
  }
  console.error(JSON.stringify(toB11SafeErrorPayload(error)));
}

function assertNoB10FaultEnvironment(): void {
  if (
    Object.keys(process.env).some((key) =>
      key.startsWith('B10_BROWSER_HTTP_FAULT_'),
    )
  ) {
    throw new B11FixtureError(
      'B11_FIXTURE_ENVIRONMENT_UNSAFE',
      'B10 Browser HTTP fault variables must be cleared for B11 fixture CLI',
    );
  }
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    assertB11PreImportEnvironment(process.env.NODE_ENV);
    assertNoB10FaultEnvironment();
    const parsed = parseB11Command(process.argv.slice(2));
    const password =
      parsed.command === 'cleanup'
        ? undefined
        : requireB11FixturePassword(process.env.B11_FIXTURE_PASSWORD);
    assertBrowserAcceptancePreImportEnvironment({
      nodeEnv: process.env.NODE_ENV,
      purpose: process.env.COGMEMORY_DATABASE_PURPOSE,
      mongoUri: process.env.MONGO_URI,
    });
    const [{ NestFactory }, mongooseModule] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/mongoose'),
    ]);
    // Application modules are loaded only after process and database gates.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as AppModuleExport;
    const managerModule =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../test/support/b11-browser-fixtures/b11-browser-fixtures') as ManagerModuleExport;
    app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: false,
    });
    connection = app.get<Connection>(mongooseModule.getConnectionToken());
    await assertBrowserFixtureDatabaseAccess(connection);
    const manager = managerModule.createB11BrowserFixtureManager(app);
    if (parsed.command === 'prepare') {
      console.log(
        JSON.stringify(
          await manager.prepare(parsed.profile, parsed.namespace, password),
          null,
          2,
        ),
      );
      return;
    }
    if (parsed.command === 'verify') {
      if (!parsed.phase) throw new Error('unreachable phase');
      console.log(
        JSON.stringify(
          await manager.verify(
            parsed.profile,
            parsed.namespace,
            password,
            parsed.phase,
          ),
          null,
          2,
        ),
      );
      return;
    }
    if (parsed.command === 'replace') {
      console.log(
        JSON.stringify(
          await manager.replace(parsed.profile, parsed.namespace, password),
          null,
          2,
        ),
      );
      return;
    }
    if (parsed.command === 'stage') {
      console.log(
        JSON.stringify(
          await manager.stage({
            profile: parsed.profile,
            namespace: parsed.namespace,
            password,
            scenarioKey: parsed.scenarioKey,
            routeKey: parsed.routeKey,
            transition: parsed.transition,
            role: parsed.role,
          }),
          null,
          2,
        ),
      );
      return;
    }
    if (parsed.command === 'runtime') {
      if (
        !parsed.scenarioKey ||
        !parsed.routeKey ||
        !parsed.role ||
        !parsed.outputName
      ) {
        throw new Error('unreachable runtime contract');
      }
      const descriptor = await manager.resolveRuntimeDescriptor({
        profile: parsed.profile,
        namespace: parsed.namespace,
        password,
        scenarioKey: parsed.scenarioKey,
        routeKey: parsed.routeKey,
        role: parsed.role,
      });
      await writeB11RuntimeDescriptor(descriptor, parsed.outputName);
      const summary = {
        version: 1,
        batch: 'B11',
        command: 'runtime',
        profile: parsed.profile,
        scenarioKey: parsed.scenarioKey,
        routeKey: parsed.routeKey,
        primaryRole: parsed.role,
        preparedVerified: true,
        runtimeDescriptorWritten: true,
      } as const;
      assertB11SafeOutput(summary);
      console.log(JSON.stringify(summary));
      return;
    }
    console.log(
      JSON.stringify(
        await manager.cleanup(parsed.profile, parsed.namespace),
        null,
        2,
      ),
    );
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
