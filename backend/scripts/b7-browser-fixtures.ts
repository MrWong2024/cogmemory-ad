import 'reflect-metadata';
import type { INestApplicationContext, Type } from '@nestjs/common';
import type { Connection } from 'mongoose';
import {
  DatabaseGateError,
  assertBrowserAcceptancePreImportEnvironment,
  assertBrowserFixtureDatabaseAccess,
} from '../src/config/database-purpose';
import type { B7BrowserFixtureManager } from '../test/support/b7-browser-fixtures/b7-browser-fixtures';
import {
  B7_DEFAULT_NAMESPACE,
  B7FixtureError,
  assertB7PreImportEnvironment,
  requireB7FixturePassword,
  toB7SafeErrorPayload,
  validateB7Namespace,
  type B7TransitionAction,
  type B7VerifyPhase,
} from '../test/support/b7-browser-fixtures/fixture-contract';

type B7Command = 'prepare' | 'verify' | 'cleanup' | 'replace' | 'transition';

type ParsedCommand = {
  command: B7Command;
  namespace: string;
  phase: B7VerifyPhase;
  scenarioKey?: 'voided_transition' | 'computation_conflict';
  action?: B7TransitionAction;
};

type AppModuleExport = { AppModule: Type<unknown> };
type ManagerModuleExport = {
  createB7BrowserFixtureManager: (
    app: INestApplicationContext,
  ) => B7BrowserFixtureManager;
};

function requiredValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new B7FixtureError(
      'B7_FIXTURE_ARGUMENT_VALUE_REQUIRED',
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
    throw new B7FixtureError(
      'B7_FIXTURE_COMMAND_INVALID',
      'Command must be prepare, verify, cleanup, replace, or transition',
    );
  }
  let namespace = B7_DEFAULT_NAMESPACE;
  let phase: B7VerifyPhase = 'prepared';
  let phaseProvided = false;
  let confirmCleanup = false;
  let confirmReplace = false;
  let scenarioKey: ParsedCommand['scenarioKey'];
  let action: B7TransitionAction | undefined;
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
        throw new B7FixtureError(
          'B7_FIXTURE_PHASE_INVALID',
          '--phase must be prepared or post-browser',
        );
      }
      phase = value;
      index += 1;
      continue;
    }
    if (argument === '--scenario') {
      const value = requiredValue(argv, index, argument);
      if (value !== 'voided_transition' && value !== 'computation_conflict') {
        throw new B7FixtureError(
          'B7_FIXTURE_TRANSITION_INVALID',
          '--scenario must be a fixed B7 transition scenario',
        );
      }
      scenarioKey = value;
      index += 1;
      continue;
    }
    if (argument === '--action') {
      const value = requiredValue(argv, index, argument);
      if (value !== 'arm' && value !== 'restore') {
        throw new B7FixtureError(
          'B7_FIXTURE_TRANSITION_ACTION_INVALID',
          '--action must be arm or restore',
        );
      }
      action = value;
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
    throw new B7FixtureError(
      'B7_FIXTURE_ARGUMENT_INVALID',
      'Unknown argument; passwords are accepted only through the process environment',
    );
  }
  if (command === 'verify' && !phaseProvided) {
    throw new B7FixtureError(
      'B7_FIXTURE_PHASE_REQUIRED',
      'verify requires --phase prepared or --phase post-browser',
    );
  }
  if (command !== 'verify' && phaseProvided) {
    throw new B7FixtureError(
      'B7_FIXTURE_PHASE_NOT_ALLOWED',
      '--phase is supported only by verify',
    );
  }
  if (command === 'cleanup' && !confirmCleanup) {
    throw new B7FixtureError(
      'B7_FIXTURE_CLEANUP_CONFIRMATION_REQUIRED',
      'cleanup requires --confirm-cleanup',
    );
  }
  if (command === 'replace' && !confirmReplace) {
    throw new B7FixtureError(
      'B7_FIXTURE_REPLACE_CONFIRMATION_REQUIRED',
      'replace requires --confirm-replace',
    );
  }
  if (command !== 'cleanup' && confirmCleanup) {
    throw new B7FixtureError(
      'B7_FIXTURE_CLEANUP_ARGUMENT_NOT_ALLOWED',
      '--confirm-cleanup is supported only by cleanup',
    );
  }
  if (command !== 'replace' && confirmReplace) {
    throw new B7FixtureError(
      'B7_FIXTURE_REPLACE_ARGUMENT_NOT_ALLOWED',
      '--confirm-replace is supported only by replace',
    );
  }
  if (command === 'transition' && (!scenarioKey || !action)) {
    throw new B7FixtureError(
      'B7_FIXTURE_TRANSITION_ARGUMENT_REQUIRED',
      'transition requires --scenario and --action',
    );
  }
  if (
    command !== 'transition' &&
    (scenarioKey !== undefined || action !== undefined)
  ) {
    throw new B7FixtureError(
      'B7_FIXTURE_TRANSITION_ARGUMENT_NOT_ALLOWED',
      '--scenario and --action are supported only by transition',
    );
  }
  return {
    command,
    namespace: validateB7Namespace(namespace),
    phase,
    ...(scenarioKey ? { scenarioKey } : {}),
    ...(action ? { action } : {}),
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
  console.error(JSON.stringify(toB7SafeErrorPayload(error)));
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    assertB7PreImportEnvironment(process.env.NODE_ENV);
    const parsed = parseCommand(process.argv.slice(2));
    const password =
      parsed.command === 'prepare' ||
      parsed.command === 'verify' ||
      parsed.command === 'replace'
        ? requireB7FixturePassword(process.env.B7_FIXTURE_PASSWORD)
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
      require('../test/support/b7-browser-fixtures/b7-browser-fixtures') as ManagerModuleExport;
    app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: false,
    });
    connection = app.get<Connection>(mongooseModule.getConnectionToken());
    await assertBrowserFixtureDatabaseAccess(connection);
    const manager = managerModule.createB7BrowserFixtureManager(app);
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
                  parsed.scenarioKey!,
                  parsed.action!,
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
