import 'reflect-metadata';
import type { INestApplicationContext, Type } from '@nestjs/common';
import type { Connection } from 'mongoose';
import {
  DatabaseGateError,
  assertBrowserAcceptancePreImportEnvironment,
  assertBrowserFixtureDatabaseAccess,
} from '../src/config/database-purpose';
import type { B123BrowserFixtureManager } from '../test/support/b123-browser-fixtures/b123-browser-fixtures';
import {
  B123_DEFAULT_NAMESPACE,
  B123FixtureError,
  assertB123PreImportEnvironment,
  requireB123FixturePassword,
  validateB123Namespace,
  type B123TransitionScenarioKey,
} from '../test/support/b123-browser-fixtures/fixture-contract';

type B123Command = 'prepare' | 'verify' | 'cleanup' | 'replace' | 'transition';
type B123VerifyPhase = 'prepared' | 'post-browser';
type B123TransitionAction = 'arm' | 'restore';

type ParsedCommand = {
  command: B123Command;
  namespace: string;
  phase: B123VerifyPhase;
  scenario?: B123TransitionScenarioKey;
  transitionAction?: B123TransitionAction;
};

type AppModuleExport = { AppModule: Type<unknown> };
type ManagerModuleExport = {
  createB123BrowserFixtureManager: (
    app: INestApplicationContext,
  ) => B123BrowserFixtureManager;
};

function requiredValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new B123FixtureError(
      'B123_FIXTURE_ARGUMENT_VALUE_REQUIRED',
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
    command !== 'transition'
  ) {
    throw new B123FixtureError(
      'B123_FIXTURE_COMMAND_INVALID',
      'Command must be prepare, verify, cleanup, replace, or transition',
    );
  }
  let namespace = B123_DEFAULT_NAMESPACE;
  let phase: B123VerifyPhase = 'prepared';
  let scenario: B123TransitionScenarioKey | undefined;
  let transitionAction: B123TransitionAction | undefined;
  let confirmCleanup = false;
  let confirmReplace = false;
  let confirmTransition = false;
  let phaseProvided = false;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--namespace') {
      namespace = requiredValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--phase') {
      phaseProvided = true;
      const value = requiredValue(argv, index, argument);
      if (value !== 'prepared' && value !== 'post-browser') {
        throw new B123FixtureError(
          'B123_FIXTURE_PHASE_INVALID',
          '--phase must be prepared or post-browser',
        );
      }
      phase = value;
      index += 1;
      continue;
    }
    if (argument === '--scenario') {
      scenario = requiredValue(
        argv,
        index,
        argument,
      ) as B123TransitionScenarioKey;
      index += 1;
      continue;
    }
    if (argument === '--action') {
      const value = requiredValue(argv, index, argument);
      if (value !== 'arm' && value !== 'restore') {
        throw new B123FixtureError(
          'B123_FIXTURE_TRANSITION_ACTION_INVALID',
          '--action must be arm or restore',
        );
      }
      transitionAction = value;
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
    if (argument === '--confirm-transition') {
      confirmTransition = true;
      continue;
    }
    throw new B123FixtureError(
      'B123_FIXTURE_ARGUMENT_INVALID',
      'Unknown argument; passwords are accepted only through the process environment',
    );
  }
  if (command !== 'verify' && phaseProvided) {
    throw new B123FixtureError(
      'B123_FIXTURE_PHASE_NOT_ALLOWED',
      '--phase is supported only by verify',
    );
  }
  if (command === 'cleanup' && !confirmCleanup) {
    throw new B123FixtureError(
      'B123_FIXTURE_CLEANUP_CONFIRMATION_REQUIRED',
      'cleanup requires --confirm-cleanup',
    );
  }
  if (command === 'replace' && !confirmReplace) {
    throw new B123FixtureError(
      'B123_FIXTURE_REPLACE_CONFIRMATION_REQUIRED',
      'replace requires --confirm-replace',
    );
  }
  if (
    command === 'transition' &&
    (!confirmTransition || !scenario || !transitionAction)
  ) {
    throw new B123FixtureError(
      'B123_FIXTURE_TRANSITION_CONFIRMATION_REQUIRED',
      'transition requires --scenario, --action, and --confirm-transition',
    );
  }
  if (
    command !== 'transition' &&
    (confirmTransition || scenario || transitionAction)
  ) {
    throw new B123FixtureError(
      'B123_FIXTURE_TRANSITION_ARGUMENT_NOT_ALLOWED',
      'Transition arguments are supported only by transition',
    );
  }
  return {
    command,
    namespace: validateB123Namespace(namespace),
    phase,
    scenario,
    transitionAction,
  };
}

function writeSafeError(error: unknown): void {
  if (error instanceof DatabaseGateError) {
    console.error(
      JSON.stringify({
        ok: false,
        code: error.code,
        message: error.message,
      }),
    );
    return;
  }
  if (error instanceof B123FixtureError) {
    console.error(
      JSON.stringify({
        ok: false,
        code: error.code,
        message: error.safeMessage,
        ...(error.scenarioKey ? { scenarioKey: error.scenarioKey } : {}),
      }),
    );
    return;
  }
  console.error(
    JSON.stringify({
      ok: false,
      code: 'B123_FIXTURE_OPERATION_FAILED',
      message:
        'B1-B3 browser fixture operation failed without exposing internal details',
    }),
  );
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    assertB123PreImportEnvironment(process.env.NODE_ENV);
    const parsed = parseCommand(process.argv.slice(2));
    const password =
      parsed.command === 'prepare' ||
      parsed.command === 'verify' ||
      parsed.command === 'replace'
        ? requireB123FixturePassword(process.env.B123_FIXTURE_PASSWORD)
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
    // Application modules are deliberately loaded only after the process gate.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as AppModuleExport;
    const managerModule =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../test/support/b123-browser-fixtures/b123-browser-fixtures') as ManagerModuleExport;
    app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: false,
    });
    connection = app.get<Connection>(mongooseModule.getConnectionToken());
    await assertBrowserFixtureDatabaseAccess(connection);
    const manager = managerModule.createB123BrowserFixtureManager(app);
    const result =
      parsed.command === 'prepare'
        ? await manager.prepare(parsed.namespace, password)
        : parsed.command === 'verify'
          ? await manager.verify(parsed.namespace, password, parsed.phase)
          : parsed.command === 'replace'
            ? await manager.replace(parsed.namespace, password)
            : parsed.command === 'transition'
              ? await manager.transition(
                  parsed.namespace,
                  parsed.scenario as B123TransitionScenarioKey,
                  parsed.transitionAction as B123TransitionAction,
                )
              : await manager.cleanup(parsed.namespace);
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
