import 'reflect-metadata';
import type { Type } from '@nestjs/common';
import type { Connection } from 'mongoose';
import { STORAGE_SERVICE } from '../src/modules/storage/storage.constants';
import {
  StorageConfigService,
  type OssStorageConfig,
} from '../src/modules/storage/storage-config.service';
import type { StorageService } from '../src/modules/storage/storage.interface';
import { createOssObjectLister, type OssObjectLister } from './clear-data-oss';
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
  confirmOss?: string;
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
  storageService: Pick<StorageService, 'driver' | 'deleteObject'>;
  storageConfigService: Pick<StorageConfigService, 'getOssConfigOrThrow'>;
  close(): Promise<void>;
};

export type RunClearDataOptions = {
  args?: string[];
  env?: NodeJS.ProcessEnv;
  logger?: SyncIndexesLogger;
  createContext?: () => Promise<ClearDataContext>;
  createOssLister?: (config: OssStorageConfig) => OssObjectLister;
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

type OssCleanupStatus =
  | 'skipped'
  | 'dry_run'
  | 'pending_database'
  | 'skipped_due_to_database_failure'
  | 'preflight_failed'
  | 'completed'
  | 'failed';

type StorageCleanupSummary = {
  driver: 'fake' | 'oss' | 'unknown';
  ossCleanup: OssCleanupStatus | 'not_started';
  namespace?: string;
  beforeObjects: number;
  deletedObjects: number;
  residualObjects: number | 'unknown';
  operationFailures: number;
  verifierFailures: number;
};

const EMPTY_DATABASE_SUMMARY: ClearDataSummary = {
  collectionCount: 0,
  beforeDocuments: 0,
  deletedDocuments: 0,
  residualDocuments: 0,
  operationFailures: 0,
  verifierFailures: 0,
};

export function resolveClearDataArguments(args: string[]): ClearDataArguments {
  let execute = false;
  let confirm: string | undefined;
  let confirmOss: string | undefined;

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

    if (argument.startsWith('--confirm-oss=') && confirmOss === undefined) {
      confirmOss = argument.slice('--confirm-oss='.length);
      if (confirmOss.length === 0) {
        throw new Error('--confirm-oss must contain the OSS cleanup namespace');
      }
      continue;
    }

    throw new Error('Unknown or duplicate clear-data argument');
  }

  if (!execute && confirm !== undefined) {
    throw new Error('--confirm is only valid together with --execute');
  }

  if (!execute && confirmOss !== undefined) {
    throw new Error('--confirm-oss is only valid together with --execute');
  }

  return execute
    ? { mode: 'execute', confirm, confirmOss }
    : { mode: 'dry-run' };
}

export function assertExecuteConfirmation(
  options: ClearDataArguments,
  expectedDatabaseName: string,
): void {
  if (options.mode === 'execute' && options.confirm !== expectedDatabaseName) {
    throw new Error(`--execute requires --confirm=${expectedDatabaseName}`);
  }
}

export function resolveOssCleanupNamespace(objectPrefix: string): string {
  const normalizedObjectPrefix = objectPrefix.trim().replace(/^\/+|\/+$/g, '');

  if (!normalizedObjectPrefix) {
    throw new Error('OSS cleanup namespace is not configured');
  }

  return `${normalizedObjectPrefix}/clinical-evidence`;
}

export function assertOssExecuteConfirmation(input: {
  options: ClearDataArguments;
  storageDriver: 'fake' | 'oss';
  cleanupNamespace?: string;
}): void {
  if (input.storageDriver === 'fake') {
    if (input.options.confirmOss !== undefined) {
      throw new Error('--confirm-oss is invalid when STORAGE_DRIVER=fake');
    }
    return;
  }

  if (
    input.options.mode === 'execute' &&
    input.options.confirmOss !== input.cleanupNamespace
  ) {
    throw new Error(
      `--execute with STORAGE_DRIVER=oss requires --confirm-oss=${input.cleanupNamespace ?? '[unavailable]'}`,
    );
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

function getSafeErrorMessage(
  error: unknown,
  env: NodeJS.ProcessEnv,
  objectKeys: string[] = [],
): string {
  const message = error instanceof Error ? error.message : String(error);
  let safeMessage = redactSensitiveText(message, env);
  const bucket = env.OSS_BUCKET?.trim();

  if (bucket) {
    safeMessage = safeMessage.replaceAll(bucket, '[REDACTED_OSS_BUCKET]');
  }
  for (const objectKey of objectKeys) {
    if (objectKey) {
      safeMessage = safeMessage.replaceAll(objectKey, '[REDACTED_OBJECT_KEY]');
    }
  }

  return safeMessage;
}

function logClearDataSummary(input: {
  logger: SyncIndexesLogger;
  mode: ClearDataMode | 'unknown';
  database: ClearDataSummary;
  storage: StorageCleanupSummary;
  exitCode: number;
}): void {
  input.logger.log(
    `[clear-data] summary mode=${input.mode} collections=${input.database.collectionCount} beforeDocuments=${input.database.beforeDocuments} deletedDocuments=${input.database.deletedDocuments} residualDocuments=${input.database.residualDocuments} databaseOperationFailures=${input.database.operationFailures} databaseVerifierFailures=${input.database.verifierFailures} storageDriver=${input.storage.driver} ossCleanup=${input.storage.ossCleanup} namespace=${input.storage.namespace ?? 'skipped'} beforeObjects=${input.storage.beforeObjects} deletedObjects=${input.storage.deletedObjects} residualObjects=${input.storage.residualObjects} storageOperationFailures=${input.storage.operationFailures} storageVerifierFailures=${input.storage.verifierFailures} exitCode=${input.exitCode}`,
  );
}

async function runOssCleanup(input: {
  initialObjectKeys: string[];
  cleanupPrefix: string;
  storageService: Pick<StorageService, 'deleteObject'>;
  ossLister: OssObjectLister;
  logger: SyncIndexesLogger;
}): Promise<StorageCleanupSummary> {
  let deletedObjects = 0;
  let operationFailures = 0;

  for (const [objectIndex, objectKey] of input.initialObjectKeys.entries()) {
    try {
      await input.storageService.deleteObject(objectKey);
      deletedObjects += 1;
    } catch {
      operationFailures += 1;
      input.logger.error(
        `[clear-data] phase=oss-delete objectIndex=${objectIndex + 1} failed=OSS object delete failed`,
      );
    }
  }

  let residualObjects: number | 'unknown' = 'unknown';
  let verifierFailures = 0;
  try {
    residualObjects = (
      await input.ossLister.listObjectKeys(input.cleanupPrefix)
    ).length;
    if (residualObjects > 0) {
      verifierFailures = 1;
    }
    input.logger.log(
      `[clear-data] phase=oss-verifier residualObjects=${residualObjects} aligned=${String(residualObjects === 0)}`,
    );
  } catch {
    verifierFailures = 1;
    input.logger.error(
      '[clear-data] phase=oss-verifier failed=Failed to list OSS cleanup namespace',
    );
  }

  return {
    driver: 'oss',
    ossCleanup:
      operationFailures === 0 && verifierFailures === 0 && residualObjects === 0
        ? 'completed'
        : 'failed',
    beforeObjects: input.initialObjectKeys.length,
    deletedObjects,
    residualObjects,
    operationFailures,
    verifierFailures,
  };
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
  objectKeysToRedact?: string[];
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
        `[clear-data] phase=verifier collection=${snapshot.name} failed=${getSafeErrorMessage(error, input.env, input.objectKeysToRedact)}`,
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
  objectKeysToRedact?: string[];
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
        `[clear-data] phase=execute collection=${snapshot.name} failed=${getSafeErrorMessage(error, input.env, input.objectKeysToRedact)}`,
      );
    }
  }

  const verifier = await verifyCollections({
    database: input.database,
    snapshots,
    logger: input.logger,
    env: input.env,
    objectKeysToRedact: input.objectKeysToRedact,
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
      storageService: app.get<StorageService>(STORAGE_SERVICE),
      storageConfigService: app.get(StorageConfigService),
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
  const createOssLister = options.createOssLister ?? createOssObjectLister;
  let context: ClearDataContext | undefined;
  let exitCode = 0;
  let mode: ClearDataMode | 'unknown' = 'unknown';
  let databaseSummary = { ...EMPTY_DATABASE_SUMMARY };
  let storageSummary: StorageCleanupSummary = {
    driver: 'unknown',
    ossCleanup: 'not_started',
    beforeObjects: 0,
    deletedObjects: 0,
    residualObjects: 'unknown',
    operationFailures: 0,
    verifierFailures: 0,
  };
  let initialObjectKeys: string[] = [];

  try {
    const clearOptions = resolveClearDataArguments(args);
    mode = clearOptions.mode;
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

    const storageDriver = context.storageService.driver;
    logger.log(`[clear-data] storageDriver=${storageDriver}`);

    let ossLister: OssObjectLister | undefined;
    let cleanupPrefix: string | undefined;
    if (storageDriver === 'fake') {
      storageSummary = {
        driver: 'fake',
        ossCleanup: 'skipped',
        beforeObjects: 0,
        deletedObjects: 0,
        residualObjects: 0,
        operationFailures: 0,
        verifierFailures: 0,
      };
      assertOssExecuteConfirmation({
        options: clearOptions,
        storageDriver,
      });
    } else {
      const ossConfig = context.storageConfigService.getOssConfigOrThrow();
      const cleanupNamespace = resolveOssCleanupNamespace(
        ossConfig.objectPrefix,
      );
      cleanupPrefix = `${cleanupNamespace}/`;
      storageSummary = {
        driver: 'oss',
        ossCleanup:
          clearOptions.mode === 'dry-run' ? 'dry_run' : 'pending_database',
        namespace: cleanupNamespace,
        beforeObjects: 0,
        deletedObjects: 0,
        residualObjects: 'unknown',
        operationFailures: 0,
        verifierFailures: 0,
      };
      assertOssExecuteConfirmation({
        options: clearOptions,
        storageDriver,
        cleanupNamespace,
      });

      try {
        ossLister = createOssLister(ossConfig);
        initialObjectKeys = await ossLister.listObjectKeys(cleanupPrefix);
      } catch {
        storageSummary.ossCleanup = 'preflight_failed';
        storageSummary.operationFailures = 1;
        throw new Error('Failed to list OSS cleanup namespace');
      }
      storageSummary.beforeObjects = initialObjectKeys.length;
      storageSummary.residualObjects = initialObjectKeys.length;
      logger.log(
        `[clear-data] phase=oss-inventory namespace=${cleanupNamespace} objectCount=${initialObjectKeys.length}`,
      );
    }

    try {
      databaseSummary = await runClearDataOperations({
        database: context.database,
        mode: clearOptions.mode,
        logger,
        env,
        objectKeysToRedact: initialObjectKeys,
      });
    } catch (error: unknown) {
      if (storageDriver === 'oss' && clearOptions.mode === 'execute') {
        storageSummary.ossCleanup = 'skipped_due_to_database_failure';
      }
      throw error;
    }

    const databaseSucceeded =
      databaseSummary.operationFailures === 0 &&
      databaseSummary.verifierFailures === 0 &&
      (clearOptions.mode === 'dry-run' ||
        databaseSummary.residualDocuments === 0);

    if (clearOptions.mode === 'dry-run') {
      exitCode = databaseSucceeded ? 0 : 1;
    } else if (!databaseSucceeded) {
      exitCode = 1;
      if (storageDriver === 'oss') {
        storageSummary.ossCleanup = 'skipped_due_to_database_failure';
      }
    } else if (storageDriver === 'oss') {
      if (!ossLister || !cleanupPrefix) {
        throw new Error('OSS cleanup context is unavailable');
      }
      storageSummary = {
        ...(await runOssCleanup({
          initialObjectKeys,
          cleanupPrefix,
          storageService: context.storageService,
          ossLister,
          logger,
        })),
        namespace: storageSummary.namespace,
      };
      exitCode =
        storageSummary.operationFailures === 0 &&
        storageSummary.verifierFailures === 0 &&
        storageSummary.residualObjects === 0
          ? 0
          : 1;
    }
  } catch (error: unknown) {
    exitCode = 1;
    logger.error(
      `[clear-data] failed=${getSafeErrorMessage(error, env, initialObjectKeys)}`,
    );
  } finally {
    if (context) {
      try {
        await context.close();
      } catch (error: unknown) {
        exitCode = 1;
        logger.error(
          `[clear-data] closeFailed=${getSafeErrorMessage(error, env, initialObjectKeys)}`,
        );
      }
    }
  }

  logClearDataSummary({
    logger,
    mode,
    database: databaseSummary,
    storage: storageSummary,
    exitCode,
  });

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
