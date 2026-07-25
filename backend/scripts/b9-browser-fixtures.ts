import 'reflect-metadata';
import type { INestApplicationContext, Type } from '@nestjs/common';
import type { Connection } from 'mongoose';
import {
  DatabaseGateError,
  assertBrowserAcceptancePreImportEnvironment,
  assertBrowserFixtureDatabaseAccess,
} from '../src/config/database-purpose';
import type { B9BrowserFixtureManager } from '../test/support/b9-browser-fixtures/b9-browser-fixtures';
import {
  B9_DEFAULT_NAMESPACES,
  B9FixtureError,
  assertB9PreImportEnvironment,
  requireB9FixturePassword,
  toB9SafeErrorPayload,
  validateB9Namespace,
  validateB9Profile,
  type B9Profile,
  type B9VerifyPhase,
} from '../test/support/b9-browser-fixtures/fixture-contract';

type B9Command = 'prepare' | 'verify' | 'cleanup' | 'replace';

type ParsedCommand = {
  command: B9Command;
  profile: B9Profile;
  namespace: string;
  phase: B9VerifyPhase;
};

type AppModuleExport = { AppModule: Type<unknown> };
type ManagerModuleExport = {
  createB9BrowserFixtureManager: (
    app: INestApplicationContext,
  ) => B9BrowserFixtureManager;
};

function requiredValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new B9FixtureError(
      'B9_FIXTURE_ARGUMENT_VALUE_REQUIRED',
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
    throw new B9FixtureError(
      'B9_FIXTURE_COMMAND_INVALID',
      'Command must be prepare, verify, cleanup, or replace',
    );
  }
  let rawProfile: string | undefined;
  let rawNamespace: string | undefined;
  let phase: B9VerifyPhase = 'prepared';
  let phaseProvided = false;
  let confirmCleanup = false;
  let confirmReplace = false;
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
        throw new B9FixtureError(
          'B9_FIXTURE_PHASE_INVALID',
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
    throw new B9FixtureError(
      'B9_FIXTURE_ARGUMENT_INVALID',
      'Unknown argument; passwords are accepted only through the process environment',
    );
  }
  if (!rawProfile) {
    throw new B9FixtureError(
      'B9_FIXTURE_PROFILE_REQUIRED',
      'Every B9 fixture command requires --profile',
    );
  }
  const profile = validateB9Profile(rawProfile);
  if (command === 'verify' && !phaseProvided) {
    throw new B9FixtureError(
      'B9_FIXTURE_PHASE_REQUIRED',
      'verify requires --phase prepared or --phase post-browser',
      profile,
    );
  }
  if (command !== 'verify' && phaseProvided) {
    throw new B9FixtureError(
      'B9_FIXTURE_PHASE_NOT_ALLOWED',
      '--phase is supported only by verify',
      profile,
    );
  }
  if (command === 'cleanup' && !confirmCleanup) {
    throw new B9FixtureError(
      'B9_FIXTURE_CLEANUP_CONFIRMATION_REQUIRED',
      'cleanup requires --confirm-cleanup',
      profile,
    );
  }
  if (command === 'replace' && !confirmReplace) {
    throw new B9FixtureError(
      'B9_FIXTURE_REPLACE_CONFIRMATION_REQUIRED',
      'replace requires --confirm-replace',
      profile,
    );
  }
  if (command !== 'cleanup' && confirmCleanup) {
    throw new B9FixtureError(
      'B9_FIXTURE_CLEANUP_ARGUMENT_NOT_ALLOWED',
      '--confirm-cleanup is supported only by cleanup',
      profile,
    );
  }
  if (command !== 'replace' && confirmReplace) {
    throw new B9FixtureError(
      'B9_FIXTURE_REPLACE_ARGUMENT_NOT_ALLOWED',
      '--confirm-replace is supported only by replace',
      profile,
    );
  }
  return {
    command,
    profile,
    namespace: validateB9Namespace(
      profile,
      rawNamespace ?? B9_DEFAULT_NAMESPACES[profile],
    ),
    phase,
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
  console.error(JSON.stringify(toB9SafeErrorPayload(error)));
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;
  let connection: Connection | null = null;
  try {
    assertB9PreImportEnvironment(process.env.NODE_ENV);
    const parsed = parseCommand(process.argv.slice(2));
    const password =
      parsed.command === 'prepare' ||
      parsed.command === 'verify' ||
      parsed.command === 'replace'
        ? requireB9FixturePassword(process.env.B9_FIXTURE_PASSWORD)
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
      require('../test/support/b9-browser-fixtures/b9-browser-fixtures') as ManagerModuleExport;
    app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: false,
    });
    connection = app.get<Connection>(mongooseModule.getConnectionToken());
    await assertBrowserFixtureDatabaseAccess(connection);
    const manager = managerModule.createB9BrowserFixtureManager(app);
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
