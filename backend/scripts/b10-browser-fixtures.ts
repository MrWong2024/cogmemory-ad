import 'reflect-metadata';
import type { INestApplicationContext, Type } from '@nestjs/common';
import type { Connection } from 'mongoose';
import {
  DatabaseGateError,
  assertBrowserAcceptancePreImportEnvironment,
  assertBrowserFixtureDatabaseAccess,
} from '../src/config/database-purpose';
import type { B10BrowserFixtureManager } from '../test/support/b10-browser-fixtures/b10-browser-fixtures';
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

type B10Command = 'prepare' | 'verify' | 'cleanup' | 'replace' | 'stage';

type ParsedCommand = {
  command: B10Command;
  profile: B10Profile;
  namespace: string;
  phase: B10VerifyPhase;
  scenarioKey?: string;
  routeKey?: string;
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

function parseCommand(argv: string[]): ParsedCommand {
  const command = argv[0];
  if (
    command !== 'prepare' &&
    command !== 'verify' &&
    command !== 'cleanup' &&
    command !== 'replace' &&
    command !== 'stage'
  ) {
    throw new B10FixtureError(
      'B10_FIXTURE_COMMAND_INVALID',
      'Command must be prepare, verify, cleanup, replace, or stage',
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
      parsed.command === 'stage'
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
              : await manager.cleanup(parsed.profile, parsed.namespace);
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

void run();
