import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Type } from '@nestjs/common';
import type { Connection } from 'mongoose';
import { readDeclaredDatabaseName } from '../src/config/database-purpose';

const EXPECTED_DATABASE_NAMES = {
  development: 'cogmemory_ad_dev',
  test: 'cogmemory_ad_test',
  production: 'cogmemory_ad',
} as const;

type SupportedNodeEnvironment = keyof typeof EXPECTED_DATABASE_NAMES;
export type SyncIndexesMode = 'dry-run' | 'execute';

export type IndexDiff = {
  toDrop: unknown[];
  toCreate: unknown[];
};

export type IndexModel = {
  diffIndexes(): Promise<IndexDiff>;
  syncIndexes(): Promise<string[]>;
};

export type IndexConnection = {
  db?: {
    databaseName?: string;
  };
  modelNames(): string[];
  model(name: string): IndexModel;
};

export type IndexContext = {
  connection: IndexConnection;
  close(): Promise<void>;
};

export type SyncIndexesLogger = {
  log(message: string): void;
  error(message: string): void;
};

type RunSyncIndexesOptions = {
  args?: string[];
  env?: NodeJS.ProcessEnv;
  logger?: SyncIndexesLogger;
  createContext?: () => Promise<IndexContext>;
};

type IndexRunSummary = {
  modelCount: number;
  operationFailures: number;
  residualDiffs: number;
};

function resolveNodeEnvironment(
  value: string | undefined,
): SupportedNodeEnvironment {
  const nodeEnv = value ?? 'development';

  if (
    nodeEnv === 'development' ||
    nodeEnv === 'test' ||
    nodeEnv === 'production'
  ) {
    return nodeEnv;
  }

  throw new Error('NODE_ENV must be development, test, or production');
}

export function resolveSyncIndexesMode(args: string[]): SyncIndexesMode {
  if (args.length === 0) {
    return 'dry-run';
  }

  if (args.length === 1 && args[0] === '--execute') {
    return 'execute';
  }

  throw new Error('Only the optional --execute argument is supported');
}

export function resolveExpectedDatabaseName(input: {
  nodeEnv: string | undefined;
  databasePurpose: string | undefined;
}): string {
  const nodeEnv = resolveNodeEnvironment(input.nodeEnv);

  if (nodeEnv === 'test') {
    const purpose = input.databasePurpose || 'standard_test';
    if (purpose !== 'standard_test') {
      throw new Error(
        'sync-indexes only allows standard_test when NODE_ENV=test',
      );
    }
  }

  return EXPECTED_DATABASE_NAMES[nodeEnv];
}

export function loadRuntimeEnvironmentFiles(
  nodeEnv: SupportedNodeEnvironment,
  workingDirectory = process.cwd(),
): void {
  for (const fileName of [`.env.${nodeEnv}`, '.env']) {
    const filePath = resolve(workingDirectory, fileName);
    if (existsSync(filePath)) {
      process.loadEnvFile(filePath);
    }
  }
}

export function prepareIndexSyncEnvironment(env: NodeJS.ProcessEnv): {
  nodeEnv: SupportedNodeEnvironment;
  expectedDatabaseName: string;
} {
  const nodeEnv = resolveNodeEnvironment(env.NODE_ENV);
  const expectedDatabaseName = resolveExpectedDatabaseName({
    nodeEnv,
    databasePurpose: env.COGMEMORY_DATABASE_PURPOSE,
  });
  const adminUri = env.MONGO_ADMIN_URI?.trim();

  if (!adminUri || !/^mongodb(?:\+srv)?:\/\/\S+$/i.test(adminUri)) {
    throw new Error('A valid MONGO_ADMIN_URI is required');
  }

  if (readDeclaredDatabaseName(adminUri) !== expectedDatabaseName) {
    throw new Error(
      'MONGO_ADMIN_URI does not match the expected database for NODE_ENV',
    );
  }

  env.NODE_ENV = nodeEnv;
  if (nodeEnv === 'test') {
    env.COGMEMORY_DATABASE_PURPOSE = 'standard_test';
  }
  env.MONGO_ADMIN_URI = adminUri;
  env.MONGO_URI = adminUri;
  env.MONGO_AUTO_INDEX = 'false';

  return { nodeEnv, expectedDatabaseName };
}

function assertActualDatabaseName(
  actualDatabaseName: string | undefined,
  expectedDatabaseName: string,
): asserts actualDatabaseName is string {
  if (!actualDatabaseName || actualDatabaseName !== expectedDatabaseName) {
    throw new Error(
      `Connected database mismatch: expected ${expectedDatabaseName}, received ${actualDatabaseName ?? 'unknown'}`,
    );
  }
}

function isAligned(diff: IndexDiff): boolean {
  return diff.toDrop.length === 0 && diff.toCreate.length === 0;
}

function stringifyIndexDetails(value: unknown[]): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

function collectSensitiveValues(env: NodeJS.ProcessEnv): string[] {
  const values = new Set<string>();
  const sensitiveKeyPattern =
    /(URI|PASSWORD|SECRET|TOKEN|COOKIE|ACCESS_KEY|API_KEY)/i;

  for (const [key, value] of Object.entries(env)) {
    if (value && value.length >= 4 && sensitiveKeyPattern.test(key)) {
      values.add(value);
    }
  }

  for (const uri of [env.MONGO_URI, env.MONGO_ADMIN_URI]) {
    const credentials = /^mongodb(?:\+srv)?:\/\/([^/@]+)@/i.exec(
      uri ?? '',
    )?.[1];
    if (!credentials) {
      continue;
    }

    values.add(credentials);
    for (const credential of credentials.split(':')) {
      if (credential.length >= 4) {
        values.add(credential);
        try {
          values.add(decodeURIComponent(credential));
        } catch {
          // The encoded credential is still redacted.
        }
      }
    }
  }

  return [...values].sort((left, right) => right.length - left.length);
}

export function redactSensitiveText(
  text: string,
  env: NodeJS.ProcessEnv,
): string {
  let safeText = text.replace(
    /mongodb(?:\+srv)?:\/\/[^\s"'`]+/gi,
    '[REDACTED_MONGODB_URI]',
  );

  for (const value of collectSensitiveValues(env)) {
    safeText = safeText.replaceAll(value, '[REDACTED]');
  }

  return safeText;
}

function getSafeErrorMessage(error: unknown, env: NodeJS.ProcessEnv): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactSensitiveText(message, env);
}

async function diffAllModels(input: {
  connection: IndexConnection;
  logger: SyncIndexesLogger;
  env: NodeJS.ProcessEnv;
  phase: 'dry-run' | 'verifier';
}): Promise<{ failures: number; residualDiffs: number }> {
  let failures = 0;
  let residualDiffs = 0;

  for (const modelName of input.connection.modelNames()) {
    try {
      const diff = await input.connection.model(modelName).diffIndexes();
      const aligned = isAligned(diff);
      if (!aligned) {
        residualDiffs += 1;
      }
      input.logger.log(
        `[sync-indexes] phase=${input.phase} model=${modelName} toDrop=${stringifyIndexDetails(diff.toDrop)} toCreate=${stringifyIndexDetails(diff.toCreate)} aligned=${String(aligned)}`,
      );
    } catch (error: unknown) {
      failures += 1;
      input.logger.error(
        `[sync-indexes] phase=${input.phase} model=${modelName} failed=${getSafeErrorMessage(error, input.env)}`,
      );
    }
  }

  return { failures, residualDiffs };
}

export async function runIndexOperations(input: {
  connection: IndexConnection;
  mode: SyncIndexesMode;
  logger: SyncIndexesLogger;
  env: NodeJS.ProcessEnv;
}): Promise<IndexRunSummary> {
  const modelNames = input.connection.modelNames();
  if (modelNames.length === 0) {
    throw new Error('No registered Mongoose models were found');
  }

  if (input.mode === 'dry-run') {
    const diff = await diffAllModels({
      connection: input.connection,
      logger: input.logger,
      env: input.env,
      phase: 'dry-run',
    });
    return {
      modelCount: modelNames.length,
      operationFailures: diff.failures,
      residualDiffs: diff.residualDiffs,
    };
  }

  let operationFailures = 0;
  for (const modelName of modelNames) {
    try {
      const droppedIndexes = await input.connection
        .model(modelName)
        .syncIndexes();
      input.logger.log(
        `[sync-indexes] phase=execute model=${modelName} synced=true dropped=${stringifyIndexDetails(droppedIndexes)}`,
      );
    } catch (error: unknown) {
      operationFailures += 1;
      input.logger.error(
        `[sync-indexes] phase=execute model=${modelName} failed=${getSafeErrorMessage(error, input.env)}`,
      );
    }
  }

  const verifier = await diffAllModels({
    connection: input.connection,
    logger: input.logger,
    env: input.env,
    phase: 'verifier',
  });

  return {
    modelCount: modelNames.length,
    operationFailures: operationFailures + verifier.failures,
    residualDiffs: verifier.residualDiffs,
  };
}

type AppModuleExport = { AppModule: Type<unknown> };

export async function createNestIndexContext(): Promise<IndexContext> {
  const [{ NestFactory }, mongooseModule] = await Promise.all([
    import('@nestjs/core'),
    import('@nestjs/mongoose'),
  ]);
  // AppModule must not be evaluated until the admin connection gate is set.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('../src/app.module') as AppModuleExport;
  const app = await NestFactory.createApplicationContext(AppModule, {
    abortOnError: false,
    logger: false,
  });
  const connection = app.get<Connection>(mongooseModule.getConnectionToken());

  return {
    connection,
    close: () => app.close(),
  };
}

export async function runSyncIndexes(
  options: RunSyncIndexesOptions = {},
): Promise<number> {
  const args = options.args ?? [];
  const env = options.env ?? process.env;
  const logger = options.logger ?? console;
  const createContext = options.createContext ?? createNestIndexContext;
  let context: IndexContext | undefined;
  let exitCode = 0;

  try {
    const mode = resolveSyncIndexesMode(args);
    const { nodeEnv, expectedDatabaseName } = prepareIndexSyncEnvironment(env);
    logger.log(
      `[sync-indexes] mode=${mode} NODE_ENV=${nodeEnv} expectedDatabaseName=${expectedDatabaseName} adminConnection=true autoIndex=false`,
    );

    context = await createContext();
    const actualDatabaseName = context.connection.db?.databaseName;
    logger.log(
      `[sync-indexes] actualDatabaseName=${actualDatabaseName ?? 'unknown'}`,
    );
    assertActualDatabaseName(actualDatabaseName, expectedDatabaseName);

    const summary = await runIndexOperations({
      connection: context.connection,
      mode,
      logger,
      env,
    });
    exitCode =
      summary.operationFailures > 0 ||
      (mode === 'execute' && summary.residualDiffs > 0)
        ? 1
        : 0;
    logger.log(
      `[sync-indexes] summary mode=${mode} models=${summary.modelCount} failures=${summary.operationFailures} residualDiffs=${summary.residualDiffs} exitCode=${exitCode}`,
    );
  } catch (error: unknown) {
    exitCode = 1;
    logger.error(`[sync-indexes] failed=${getSafeErrorMessage(error, env)}`);
  } finally {
    if (context) {
      try {
        await context.close();
      } catch (error: unknown) {
        exitCode = 1;
        logger.error(
          `[sync-indexes] closeFailed=${getSafeErrorMessage(error, env)}`,
        );
      }
    }
  }

  return exitCode;
}

async function main(): Promise<void> {
  const nodeEnv = resolveNodeEnvironment(process.env.NODE_ENV);
  process.env.NODE_ENV = nodeEnv;
  loadRuntimeEnvironmentFiles(nodeEnv);
  process.exitCode = await runSyncIndexes({
    args: process.argv.slice(2),
  });
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(
      `[sync-indexes] failed=${getSafeErrorMessage(error, process.env)}`,
    );
    process.exitCode = 1;
  });
}
