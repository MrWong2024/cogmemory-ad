import 'reflect-metadata';
import type { INestApplicationContext, Type } from '@nestjs/common';
import type { Connection } from 'mongoose';
import {
  DatabaseGateError,
  assertBrowserAcceptancePreImportEnvironment,
  assertBrowserFixtureDatabaseAccess,
} from '../src/config/database-purpose';
import type { Wp04BrowserFixtureManager } from '../test/support/wp04-browser-fixtures/wp04-browser-fixtures';
import {
  WP04_DEFAULT_NAMESPACE,
  Wp04FixtureError,
  assertWp04PreImportEnvironment,
  requireWp04FixturePassword,
  validateWp04Namespace,
} from '../test/support/wp04-browser-fixtures/fixture-contract';

type Wp04Command = 'prepare' | 'verify' | 'cleanup' | 'replace';

type ParsedCommand = {
  command: Wp04Command;
  namespace: string;
};

type AppModuleExport = { AppModule: Type<unknown> };
type ManagerModuleExport = {
  createWp04BrowserFixtureManager: (
    app: INestApplicationContext,
  ) => Wp04BrowserFixtureManager;
};

function parseCommand(argv: string[]): ParsedCommand {
  const command = argv[0];
  if (
    command !== 'prepare' &&
    command !== 'verify' &&
    command !== 'cleanup' &&
    command !== 'replace'
  ) {
    throw new Wp04FixtureError(
      'WP04_FIXTURE_COMMAND_INVALID',
      'Command must be prepare, verify, cleanup, or replace',
    );
  }
  let namespace = process.env.WP04_FIXTURE_NAMESPACE ?? WP04_DEFAULT_NAMESPACE;
  let confirmCleanup = false;
  let confirmReplace = false;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--namespace') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Wp04FixtureError(
          'WP04_FIXTURE_NAMESPACE_REQUIRED',
          '--namespace requires a value',
        );
      }
      namespace = value;
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
    throw new Wp04FixtureError(
      'WP04_FIXTURE_ARGUMENT_INVALID',
      'Unknown argument; passwords are accepted only through the process environment',
    );
  }
  if (command === 'cleanup' && !confirmCleanup) {
    throw new Wp04FixtureError(
      'WP04_FIXTURE_CLEANUP_CONFIRMATION_REQUIRED',
      'cleanup requires --confirm-cleanup',
    );
  }
  if (command === 'replace' && !confirmReplace) {
    throw new Wp04FixtureError(
      'WP04_FIXTURE_REPLACE_CONFIRMATION_REQUIRED',
      'replace requires --confirm-replace',
    );
  }
  return { command, namespace: validateWp04Namespace(namespace) };
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
  if (error instanceof Wp04FixtureError) {
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
      code: 'WP04_FIXTURE_OPERATION_FAILED',
      message:
        'WP-04 fixture operation failed without exposing internal details',
    }),
  );
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    assertWp04PreImportEnvironment(process.env.NODE_ENV);
    const parsed = parseCommand(process.argv.slice(2));
    const password =
      parsed.command === 'cleanup'
        ? undefined
        : requireWp04FixturePassword(process.env.WP04_FIXTURE_PASSWORD);
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
      require('../test/support/wp04-browser-fixtures/wp04-browser-fixtures') as ManagerModuleExport;
    app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: false,
    });
    connection = app.get<Connection>(mongooseModule.getConnectionToken());
    await assertBrowserFixtureDatabaseAccess(connection);
    const manager = managerModule.createWp04BrowserFixtureManager(app);
    const result =
      parsed.command === 'prepare'
        ? await manager.prepare(parsed.namespace, password)
        : parsed.command === 'verify'
          ? await manager.verify(parsed.namespace, password)
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
