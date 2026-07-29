import 'reflect-metadata';
import type { INestApplicationContext, Type } from '@nestjs/common';
import type { Connection } from 'mongoose';
import {
  DatabaseGateError,
  assertBrowserAcceptancePreImportEnvironment,
  assertBrowserFixtureDatabaseAccess,
} from '../src/config/database-purpose';
import type { B12BrowserFixtureManager } from '../test/support/b12-browser-fixtures/b12-browser-fixtures';
import {
  assertB12PreImportEnvironment,
  assertB12RuntimeTarget,
  assertB12StageTarget,
  requireB12FixturePassword,
  validateB12Namespace,
  validateB12Profile,
  validateB12Role,
} from '../test/support/b12-browser-fixtures/fixture-contract';
import { assertB12SafeOutput } from '../test/support/b12-browser-fixtures/fixture-manifest';
import {
  validateB12RuntimeOutputName,
  writeB12RuntimeDescriptor,
} from '../test/support/b12-browser-fixtures/runtime-descriptor';
import {
  B12FixtureError,
  toB12SafeErrorPayload,
  type B12Profile,
  type B12Role,
  type B12StageTransition,
  type B12VerifyPhase,
} from '../test/support/b12-browser-fixtures/fixture-types';

export type B12Command =
  | 'prepare'
  | 'verify'
  | 'replace'
  | 'stage'
  | 'runtime'
  | 'cleanup';

export type B12ParsedCommand = {
  command: B12Command;
  profile: B12Profile;
  namespace: string;
  phase?: B12VerifyPhase;
  scenarioKey?: string;
  routeKey?: string;
  transition?: B12StageTransition;
  role?: B12Role;
  outputName?: string;
};

type AppModuleExport = { AppModule: Type<unknown> };
type ManagerModuleExport = {
  createB12BrowserFixtureManager: (
    app: INestApplicationContext,
  ) => B12BrowserFixtureManager;
};

function requiredValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new B12FixtureError(
      'B12_FIXTURE_ARGUMENT_VALUE_REQUIRED',
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
    throw new B12FixtureError(
      'B12_FIXTURE_ARGUMENT_DUPLICATE',
      `${option} may be supplied only once`,
    );
  }
  return value;
}

export function parseB12Command(argv: string[]): B12ParsedCommand {
  const command = argv[0];
  if (
    command !== 'prepare' &&
    command !== 'verify' &&
    command !== 'replace' &&
    command !== 'stage' &&
    command !== 'runtime' &&
    command !== 'cleanup'
  ) {
    throw new B12FixtureError(
      'B12_FIXTURE_COMMAND_INVALID',
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
  let confirmPrepare = false;
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
    if (argument === '--confirm-prepare-b12-namespace') {
      confirmPrepare = true;
      continue;
    }
    if (argument === '--confirm-replace-b12-namespace') {
      confirmReplace = true;
      continue;
    }
    if (argument === '--confirm-stage-b12-transition') {
      confirmStage = true;
      continue;
    }
    if (argument === '--confirm-runtime-b12-descriptor') {
      confirmRuntime = true;
      continue;
    }
    if (argument === '--confirm-cleanup-b12-namespace') {
      confirmCleanup = true;
      continue;
    }
    throw new B12FixtureError(
      'B12_FIXTURE_ARGUMENT_INVALID',
      'Unknown argument; IDs, paths, URLs, database fields, JSON, and passwords are not accepted',
    );
  }
  if (!rawProfile || !rawNamespace) {
    throw new B12FixtureError(
      'B12_FIXTURE_SCOPE_REQUIRED',
      'Every command requires explicit --profile and --namespace',
    );
  }
  const profile = validateB12Profile(rawProfile);
  const namespace = validateB12Namespace(profile, rawNamespace);
  const phase =
    rawPhase === 'prepared' || rawPhase === 'post-browser'
      ? rawPhase
      : undefined;
  if (command === 'verify' && !phase) {
    throw new B12FixtureError(
      'B12_FIXTURE_PHASE_REQUIRED',
      'verify requires --phase prepared or --phase post-browser',
      profile,
    );
  }
  if (rawPhase && !phase) {
    throw new B12FixtureError(
      'B12_FIXTURE_PHASE_INVALID',
      '--phase must be prepared or post-browser',
      profile,
    );
  }
  if (command !== 'verify' && rawPhase !== undefined) {
    throw new B12FixtureError(
      'B12_FIXTURE_PHASE_NOT_ALLOWED',
      '--phase is supported only by verify',
      profile,
    );
  }
  if (command === 'prepare' ? !confirmPrepare : confirmPrepare) {
    throw new B12FixtureError(
      'B12_FIXTURE_PREPARE_CONFIRMATION_INVALID',
      'prepare alone requires --confirm-prepare-b12-namespace',
      profile,
    );
  }
  if (command === 'replace' ? !confirmReplace : confirmReplace) {
    throw new B12FixtureError(
      'B12_FIXTURE_REPLACE_CONFIRMATION_INVALID',
      'replace alone requires --confirm-replace-b12-namespace',
      profile,
    );
  }
  if (command === 'cleanup' ? !confirmCleanup : confirmCleanup) {
    throw new B12FixtureError(
      'B12_FIXTURE_CLEANUP_CONFIRMATION_INVALID',
      'cleanup alone requires --confirm-cleanup-b12-namespace',
      profile,
    );
  }
  const role = rawRole ? validateB12Role(rawRole) : undefined;
  if (command === 'stage') {
    if (
      !confirmStage ||
      !rawScenarioKey ||
      !rawRouteKey ||
      !rawTransition ||
      !role
    ) {
      throw new B12FixtureError(
        'B12_FIXTURE_STAGE_CONFIRMATION_REQUIRED',
        'stage requires scenario, route, transition, role, and its fixed confirmation',
        profile,
      );
    }
    assertB12StageTarget({
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
    throw new B12FixtureError(
      'B12_FIXTURE_STAGE_ARGUMENT_NOT_ALLOWED',
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
      throw new B12FixtureError(
        'B12_FIXTURE_RUNTIME_CONFIRMATION_REQUIRED',
        'runtime requires scenario, route, role, output-name, and its fixed confirmation',
        profile,
      );
    }
    assertB12RuntimeTarget({
      profile,
      scenarioKey: rawScenarioKey,
      routeKey: rawRouteKey,
      role,
    });
  } else if (confirmRuntime || rawOutputName !== undefined) {
    throw new B12FixtureError(
      'B12_FIXTURE_RUNTIME_ARGUMENT_NOT_ALLOWED',
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
      ? { transition: rawTransition as B12StageTransition }
      : {}),
    ...(role ? { role } : {}),
    ...(rawOutputName
      ? { outputName: validateB12RuntimeOutputName(rawOutputName) }
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
  console.error(JSON.stringify(toB12SafeErrorPayload(error)));
}

function assertNoUnrelatedFaultEnvironment(): void {
  if (
    Object.keys(process.env).some((key) =>
      key.startsWith('B10_BROWSER_HTTP_FAULT_'),
    )
  ) {
    throw new B12FixtureError(
      'B12_FIXTURE_ENVIRONMENT_UNSAFE',
      'Unrelated Browser HTTP fault variables must be cleared for B12 fixture CLI',
    );
  }
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    assertB12PreImportEnvironment(process.env.NODE_ENV);
    assertNoUnrelatedFaultEnvironment();
    const parsed = parseB12Command(process.argv.slice(2));
    const password =
      parsed.command === 'cleanup'
        ? undefined
        : requireB12FixturePassword(process.env.B12_FIXTURE_PASSWORD);
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
      require('../test/support/b12-browser-fixtures/b12-browser-fixtures') as ManagerModuleExport;
    app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: false,
    });
    connection = app.get<Connection>(mongooseModule.getConnectionToken());
    await assertBrowserFixtureDatabaseAccess(connection);
    const manager = managerModule.createB12BrowserFixtureManager(app);
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
      await writeB12RuntimeDescriptor(descriptor, parsed.outputName);
      const summary = {
        version: 1,
        batch: 'B12',
        command: 'runtime',
        profile: parsed.profile,
        scenarioKey: parsed.scenarioKey,
        routeKey: parsed.routeKey,
        primaryRole: parsed.role,
        preparedVerified: true,
        runtimeDescriptorWritten: true,
      } as const;
      assertB12SafeOutput(summary);
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
