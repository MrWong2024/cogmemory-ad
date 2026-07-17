import 'reflect-metadata';
import type { INestApplicationContext, Type } from '@nestjs/common';
import type { Connection } from 'mongoose';
import type { B16BrowserFixtureManager } from '../test/support/b16-browser-fixtures/b16-browser-fixtures';
import {
  B16_DEFAULT_NAMESPACE,
  B16FixtureError,
  assertB16PreImportEnvironment,
  requireB16FixturePassword,
  validateB16Namespace,
} from '../test/support/b16-browser-fixtures/fixture-contract';

type B16Command = 'prepare' | 'verify' | 'cleanup' | 'replace';

type ParsedCommand = {
  command: B16Command;
  namespace: string;
  confirmCleanup: boolean;
  confirmReplace: boolean;
};

type AppModuleExport = { AppModule: Type<unknown> };
type ManagerModuleExport = {
  createB16BrowserFixtureManager: (
    app: INestApplicationContext,
  ) => B16BrowserFixtureManager;
};

function parseCommand(argv: string[]): ParsedCommand {
  const command = argv[0];
  if (
    command !== 'prepare' &&
    command !== 'verify' &&
    command !== 'cleanup' &&
    command !== 'replace'
  ) {
    throw new B16FixtureError(
      'B16_FIXTURE_COMMAND_INVALID',
      'Command must be prepare, verify, cleanup, or replace',
    );
  }
  let namespace = process.env.B16_FIXTURE_NAMESPACE ?? B16_DEFAULT_NAMESPACE;
  let confirmCleanup = false;
  let confirmReplace = false;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--namespace') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new B16FixtureError(
          'B16_FIXTURE_NAMESPACE_REQUIRED',
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
    throw new B16FixtureError(
      'B16_FIXTURE_ARGUMENT_INVALID',
      'Unknown argument; passwords are accepted only through the process environment',
    );
  }
  if (command === 'cleanup' && !confirmCleanup) {
    throw new B16FixtureError(
      'B16_FIXTURE_CLEANUP_CONFIRMATION_REQUIRED',
      'cleanup requires --confirm-cleanup',
    );
  }
  if (command === 'replace' && !confirmReplace) {
    throw new B16FixtureError(
      'B16_FIXTURE_REPLACE_CONFIRMATION_REQUIRED',
      'replace requires --confirm-replace',
    );
  }
  return {
    command,
    namespace: validateB16Namespace(namespace),
    confirmCleanup,
    confirmReplace,
  };
}

function writeSafeError(error: unknown): void {
  if (error instanceof B16FixtureError) {
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
      code: 'B16_FIXTURE_OPERATION_FAILED',
      message: 'B16 fixture operation failed without exposing internal details',
    }),
  );
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    assertB16PreImportEnvironment(process.env.NODE_ENV);
    const parsed = parseCommand(process.argv.slice(2));
    const password =
      parsed.command === 'cleanup'
        ? undefined
        : requireB16FixturePassword(process.env.B16_FIXTURE_PASSWORD);

    const [{ NestFactory }, mongooseModule] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/mongoose'),
    ]);
    // Deliberately load application modules only after the process-level test gate.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as AppModuleExport;
    const managerModule =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../test/support/b16-browser-fixtures/b16-browser-fixtures') as ManagerModuleExport;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    connection = app.get<Connection>(mongooseModule.getConnectionToken());
    const manager = managerModule.createB16BrowserFixtureManager(app);
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
