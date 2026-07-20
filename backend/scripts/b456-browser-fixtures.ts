import 'reflect-metadata';
import type { INestApplicationContext, Type } from '@nestjs/common';
import type { Connection } from 'mongoose';
import type { B456BrowserFixtureManager } from '../test/support/b456-browser-fixtures/b456-browser-fixtures';
import {
  B456_DEFAULT_NAMESPACE,
  B456FixtureError,
  assertB456PreImportEnvironment,
  requireB456FixturePassword,
  validateB456Namespace,
} from '../test/support/b456-browser-fixtures/fixture-contract';

type B456Command = 'prepare' | 'verify' | 'cleanup' | 'replace';
type B456VerifyPhase = 'prepared' | 'post-browser';

type ParsedCommand = {
  command: B456Command;
  namespace: string;
  phase: B456VerifyPhase;
};

type AppModuleExport = { AppModule: Type<unknown> };
type ManagerModuleExport = {
  createB456BrowserFixtureManager: (
    app: INestApplicationContext,
  ) => B456BrowserFixtureManager;
};

function requiredValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new B456FixtureError(
      'B456_FIXTURE_ARGUMENT_VALUE_REQUIRED',
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
    command !== 'replace'
  ) {
    throw new B456FixtureError(
      'B456_FIXTURE_COMMAND_INVALID',
      'Command must be prepare, verify, cleanup, or replace',
    );
  }
  let namespace = B456_DEFAULT_NAMESPACE;
  let phase: B456VerifyPhase = 'prepared';
  let phaseProvided = false;
  let confirmCleanup = false;
  let confirmReplace = false;
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
        throw new B456FixtureError(
          'B456_FIXTURE_PHASE_INVALID',
          '--phase must be prepared or post-browser',
        );
      }
      phase = value;
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
    throw new B456FixtureError(
      'B456_FIXTURE_ARGUMENT_INVALID',
      'Unknown argument; passwords are accepted only through the process environment',
    );
  }
  if (command === 'verify' && !phaseProvided) {
    throw new B456FixtureError(
      'B456_FIXTURE_PHASE_REQUIRED',
      'verify requires --phase prepared or --phase post-browser',
    );
  }
  if (command !== 'verify' && phaseProvided) {
    throw new B456FixtureError(
      'B456_FIXTURE_PHASE_NOT_ALLOWED',
      '--phase is supported only by verify',
    );
  }
  if (command === 'cleanup' && !confirmCleanup) {
    throw new B456FixtureError(
      'B456_FIXTURE_CLEANUP_CONFIRMATION_REQUIRED',
      'cleanup requires --confirm-cleanup',
    );
  }
  if (command === 'replace' && !confirmReplace) {
    throw new B456FixtureError(
      'B456_FIXTURE_REPLACE_CONFIRMATION_REQUIRED',
      'replace requires --confirm-replace',
    );
  }
  if (command !== 'cleanup' && confirmCleanup) {
    throw new B456FixtureError(
      'B456_FIXTURE_CLEANUP_ARGUMENT_NOT_ALLOWED',
      '--confirm-cleanup is supported only by cleanup',
    );
  }
  if (command !== 'replace' && confirmReplace) {
    throw new B456FixtureError(
      'B456_FIXTURE_REPLACE_ARGUMENT_NOT_ALLOWED',
      '--confirm-replace is supported only by replace',
    );
  }
  return {
    command,
    namespace: validateB456Namespace(namespace),
    phase,
  };
}

function writeSafeError(error: unknown): void {
  if (error instanceof B456FixtureError) {
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
      code: 'B456_FIXTURE_OPERATION_FAILED',
      message:
        'B4-B6 browser fixture operation failed without exposing internal details',
    }),
  );
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    assertB456PreImportEnvironment(process.env.NODE_ENV);
    const parsed = parseCommand(process.argv.slice(2));
    const password =
      parsed.command === 'cleanup'
        ? undefined
        : requireB456FixturePassword(process.env.B456_FIXTURE_PASSWORD);
    const [{ NestFactory }, mongooseModule] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/mongoose'),
    ]);
    // Application modules are deliberately loaded only after the process gate.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as AppModuleExport;
    const managerModule =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../test/support/b456-browser-fixtures/b456-browser-fixtures') as ManagerModuleExport;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    connection = app.get<Connection>(mongooseModule.getConnectionToken());
    const manager = managerModule.createB456BrowserFixtureManager(app);
    const result =
      parsed.command === 'prepare'
        ? await manager.prepare(parsed.namespace, password)
        : parsed.command === 'verify'
          ? await manager.verify(parsed.namespace, password, parsed.phase)
          : parsed.command === 'replace'
            ? await manager.replace(parsed.namespace, password)
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
