import 'reflect-metadata';
import type { Type } from '@nestjs/common';
import type { Connection } from 'mongoose';
import {
  loadRuntimeEnvironmentFiles,
  prepareIndexSyncEnvironment,
  redactSensitiveText,
  resolveExpectedDatabaseName,
  type SyncIndexesLogger,
} from './sync-indexes';

export type ClearDataMode = 'dry-run' | 'execute';

export type ClearDataArguments = {
  mode: ClearDataMode;
  confirm?: string;
};

type EmptyFilter = Record<string, never>;

export type ClearDataCollection = {
  countDocuments(filter: EmptyFilter): Promise<number>;
  indexes(): Promise<unknown[]>;
  deleteMany(filter: EmptyFilter): Promise<{ deletedCount: number }>;
};

export type ClearDataDatabase = {
  databaseName?: string;
  listCollections(): Promise<Array<{ name: string; type?: string }>>;
  collection(name: string): ClearDataCollection;
};

export type ClearDataContext = {
  database: ClearDataDatabase;
  close(): Promise<void>;
};

type RunClearDataOptions = {
  args?: string[];
  env?: NodeJS.ProcessEnv;
  logger?: SyncIndexesLogger;
  createContext?: () => Promise<ClearDataContext>;
};

type CollectionSnapshot = {
  name: string;
  documentCount: number;
  indexCount: number;
  indexNames: string[];
  indexFingerprint: string;
};

type ClearDataSummary = {
  collectionCount: number;
  beforeDocuments: number;
  deletedDocuments: number;
  residualDocuments: number;
  operationFailures: number;
  verifierFailures: number;
};

export function resolveClearDataArguments(args: string[]): ClearDataArguments {
  let execute = false;
  let confirm: string | undefined;

  for (const argument of args) {
    if (argument === '--execute' && !execute) {
      execute = true;
      continue;
    }

    if (argument.startsWith('--confirm=') && confirm === undefined) {
      confirm = argument.slice('--confirm='.length);
      if (confirm.length === 0) {
        throw new Error('--confirm must contain the expected database name');
      }
      continue;
    }

    throw new Error('Unknown or duplicate clear-data argument');
  }

  if (!execute && confirm !== undefined) {
    throw new Error('--confirm is only valid together with --execute');
  }

  return execute ? { mode: 'execute', confirm } : { mode: 'dry-run' };
}

export function assertExecuteConfirmation(
  options: ClearDataArguments,
  expectedDatabaseName: string,
): void {
  if (options.mode === 'execute' && options.confirm !== expectedDatabaseName) {
    throw new Error(`--execute requires --confirm=${expectedDatabaseName}`);
  }
}

export function resolveClearDataExpectedDatabaseName(input: {
  nodeEnv: string | undefined;
  databasePurpose: string | undefined;
}): string {
  return resolveExpectedDatabaseName(input);
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

function getSafeErrorMessage(error: unknown, env: NodeJS.ProcessEnv): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactSensitiveText(message, env);
}

function normalizeIndexValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeIndexValue);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('base64');
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, normalizeIndexValue(entryValue)]);
    return Object.fromEntries(entries);
  }

  return value;
}

export function fingerprintIndexes(indexes: unknown[]): string {
  return indexes
    .map((index) => JSON.stringify(normalizeIndexValue(index)))
    .sort()
    .join('|');
}

function getIndexNames(indexes: unknown[]): string[] {
  return indexes
    .map((index) => {
      if (
        typeof index === 'object' &&
        index !== null &&
        'name' in index &&
        typeof index.name === 'string'
      ) {
        return index.name;
      }
      return '[unnamed]';
    })
    .sort();
}

async function snapshotCollections(input: {
  database: ClearDataDatabase;
  logger: SyncIndexesLogger;
  phase: 'dry-run' | 'execute-before';
}): Promise<CollectionSnapshot[]> {
  const collectionInfos = await input.database.listCollections();
  const collectionNames = collectionInfos
    .filter(
      ({ name, type }) =>
        !name.startsWith('system.') &&
        (type === undefined || type === 'collection'),
    )
    .map(({ name }) => name)
    .sort();
  const snapshots: CollectionSnapshot[] = [];

  for (const name of collectionNames) {
    const collection = input.database.collection(name);
    const documentCount = await collection.countDocuments({});
    const indexes = await collection.indexes();
    const indexNames = getIndexNames(indexes);
    const snapshot = {
      name,
      documentCount,
      indexCount: indexes.length,
      indexNames,
      indexFingerprint: fingerprintIndexes(indexes),
    };
    snapshots.push(snapshot);
    input.logger.log(
      `[clear-data] phase=${input.phase} collection=${name} documentCount=${documentCount} indexCount=${indexes.length} indexes=${JSON.stringify(indexNames)}`,
    );
  }

  return snapshots;
}

async function verifyCollections(input: {
  database: ClearDataDatabase;
  snapshots: CollectionSnapshot[];
  logger: SyncIndexesLogger;
  env: NodeJS.ProcessEnv;
}): Promise<{ failures: number; residualDocuments: number }> {
  const currentCollectionNames = new Set(
    (await input.database.listCollections())
      .filter(
        ({ name, type }) =>
          !name.startsWith('system.') &&
          (type === undefined || type === 'collection'),
      )
      .map(({ name }) => name),
  );
  let failures = 0;
  let residualDocuments = 0;

  for (const snapshot of input.snapshots) {
    if (!currentCollectionNames.has(snapshot.name)) {
      failures += 1;
      input.logger.error(
        `[clear-data] phase=verifier collection=${snapshot.name} collectionExists=false indexesPreserved=false`,
      );
      continue;
    }

    try {
      const collection = input.database.collection(snapshot.name);
      const residualCount = await collection.countDocuments({});
      const indexes = await collection.indexes();
      const indexesPreserved =
        indexes.length === snapshot.indexCount &&
        fingerprintIndexes(indexes) === snapshot.indexFingerprint;
      const aligned = residualCount === 0 && indexesPreserved;
      residualDocuments += residualCount;
      if (!aligned) {
        failures += 1;
      }
      input.logger.log(
        `[clear-data] phase=verifier collection=${snapshot.name} collectionExists=true residualCount=${residualCount} indexesPreserved=${String(indexesPreserved)} indexCount=${indexes.length} aligned=${String(aligned)}`,
      );
    } catch (error: unknown) {
      failures += 1;
      input.logger.error(
        `[clear-data] phase=verifier collection=${snapshot.name} failed=${getSafeErrorMessage(error, input.env)}`,
      );
    }
  }

  return { failures, residualDocuments };
}

export async function runClearDataOperations(input: {
  database: ClearDataDatabase;
  mode: ClearDataMode;
  logger: SyncIndexesLogger;
  env: NodeJS.ProcessEnv;
}): Promise<ClearDataSummary> {
  const snapshots = await snapshotCollections({
    database: input.database,
    logger: input.logger,
    phase: input.mode === 'dry-run' ? 'dry-run' : 'execute-before',
  });
  const beforeDocuments = snapshots.reduce(
    (total, snapshot) => total + snapshot.documentCount,
    0,
  );

  if (input.mode === 'dry-run') {
    return {
      collectionCount: snapshots.length,
      beforeDocuments,
      deletedDocuments: 0,
      residualDocuments: beforeDocuments,
      operationFailures: 0,
      verifierFailures: 0,
    };
  }

  let deletedDocuments = 0;
  let operationFailures = 0;
  for (const snapshot of snapshots) {
    try {
      const result = await input.database
        .collection(snapshot.name)
        .deleteMany({});
      deletedDocuments += result.deletedCount;
      input.logger.log(
        `[clear-data] phase=execute collection=${snapshot.name} beforeCount=${snapshot.documentCount} deletedCount=${result.deletedCount}`,
      );
    } catch (error: unknown) {
      operationFailures += 1;
      input.logger.error(
        `[clear-data] phase=execute collection=${snapshot.name} failed=${getSafeErrorMessage(error, input.env)}`,
      );
    }
  }

  const verifier = await verifyCollections({
    database: input.database,
    snapshots,
    logger: input.logger,
    env: input.env,
  });

  return {
    collectionCount: snapshots.length,
    beforeDocuments,
    deletedDocuments,
    residualDocuments: verifier.residualDocuments,
    operationFailures,
    verifierFailures: verifier.failures,
  };
}

type AppModuleExport = { AppModule: Type<unknown> };

export async function createClearDataContext(): Promise<ClearDataContext> {
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

  try {
    const connection = app.get<Connection>(mongooseModule.getConnectionToken());
    const db = connection.db;
    if (!db) {
      throw new Error('MongoDB connection is missing database access');
    }

    return {
      database: {
        databaseName: db.databaseName,
        listCollections: () =>
          db.listCollections({}, { nameOnly: true }).toArray(),
        collection: (name) => {
          const collection = db.collection(name);
          return {
            countDocuments: (filter) => collection.countDocuments(filter),
            indexes: () => collection.indexes(),
            deleteMany: (filter) => collection.deleteMany(filter),
          };
        },
      },
      close: () => app.close(),
    };
  } catch (error: unknown) {
    await app.close();
    throw error;
  }
}

export async function runClearDatabaseData(
  options: RunClearDataOptions = {},
): Promise<number> {
  const args = options.args ?? [];
  const env = options.env ?? process.env;
  const logger = options.logger ?? console;
  const createContext = options.createContext ?? createClearDataContext;
  let context: ClearDataContext | undefined;
  let exitCode = 0;

  try {
    const clearOptions = resolveClearDataArguments(args);
    const { nodeEnv, expectedDatabaseName } = prepareIndexSyncEnvironment(env);
    assertExecuteConfirmation(clearOptions, expectedDatabaseName);
    logger.log(
      `[clear-data] mode=${clearOptions.mode} NODE_ENV=${nodeEnv} expectedDatabaseName=${expectedDatabaseName} adminConnection=true autoIndex=false`,
    );

    context = await createContext();
    const actualDatabaseName = context.database.databaseName;
    logger.log(
      `[clear-data] actualDatabaseName=${actualDatabaseName ?? 'unknown'}`,
    );
    assertActualDatabaseName(actualDatabaseName, expectedDatabaseName);

    const summary = await runClearDataOperations({
      database: context.database,
      mode: clearOptions.mode,
      logger,
      env,
    });
    exitCode =
      summary.operationFailures > 0 || summary.verifierFailures > 0 ? 1 : 0;
    logger.log(
      `[clear-data] summary mode=${clearOptions.mode} collections=${summary.collectionCount} beforeDocuments=${summary.beforeDocuments} deletedDocuments=${summary.deletedDocuments} residualDocuments=${summary.residualDocuments} failures=${summary.operationFailures} verifierFailures=${summary.verifierFailures} exitCode=${exitCode}`,
    );
  } catch (error: unknown) {
    exitCode = 1;
    logger.error(`[clear-data] failed=${getSafeErrorMessage(error, env)}`);
  } finally {
    if (context) {
      try {
        await context.close();
      } catch (error: unknown) {
        exitCode = 1;
        logger.error(
          `[clear-data] closeFailed=${getSafeErrorMessage(error, env)}`,
        );
      }
    }
  }

  return exitCode;
}

async function main(): Promise<void> {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (
    nodeEnv !== 'development' &&
    nodeEnv !== 'test' &&
    nodeEnv !== 'production'
  ) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  process.env.NODE_ENV = nodeEnv;
  loadRuntimeEnvironmentFiles(nodeEnv);
  process.exitCode = await runClearDatabaseData({
    args: process.argv.slice(2),
  });
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(
      `[clear-data] failed=${getSafeErrorMessage(error, process.env)}`,
    );
    process.exitCode = 1;
  });
}
