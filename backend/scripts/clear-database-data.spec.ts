import {
  BUSINESS_CLEAR_COLLECTIONS,
  BUSINESS_PRESERVE_COLLECTIONS,
  type ClearDataCollection,
  type ClearDataDatabase,
  type ClearDataContext,
  assertOssExecuteConfirmation,
  assertExecuteConfirmation,
  resolveClearDataArguments,
  resolveClearDataExpectedDatabaseName,
  resolveCollectionAction,
  resolveOssCleanupNamespace,
  runClearDatabaseData,
} from './clear-database-data';
import type { OssObjectLister } from './clear-data-oss';
import type { SyncIndexesLogger } from './sync-indexes';
import type { OssStorageConfig } from '../src/modules/storage/storage-config.service';
import type { StorageService } from '../src/modules/storage/storage.interface';

const ADMIN_URI =
  'mongodb://admin-user:super-secret@127.0.0.1:27017/cogmemory_ad_test?authSource=cogmemory_ad_test';
const INDEXES = [
  { name: '_id_', key: { _id: 1 }, v: 2 },
  { name: 'marker_1', key: { marker: 1 }, v: 2, unique: true },
];
const OSS_PREFIX = 'cogmemory_ad/development';
const OSS_CLEANUP_NAMESPACE = `${OSS_PREFIX}/clinical-evidence`;
const OSS_CLEANUP_PREFIX = `${OSS_CLEANUP_NAMESPACE}/`;
const OSS_CONFIG: OssStorageConfig = {
  region: 'test-region',
  bucket: 'test-bucket',
  internalEndpoint: 'internal-endpoint-test-value',
  publicEndpoint: 'public-endpoint-test-value',
  accessKeyId: 'test-access-key-id',
  accessKeySecret: 'test-access-key-secret',
  objectPrefix: OSS_PREFIX,
};

function createEnvironment(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    COGMEMORY_DATABASE_PURPOSE: 'standard_test',
    MONGO_ADMIN_URI: ADMIN_URI,
    ...overrides,
  };
}

function createLogger(): SyncIndexesLogger & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    log: (message) => messages.push(message),
    error: (message) => messages.push(message),
  };
}

function createCollection(input?: {
  counts?: number[];
  indexes?: unknown[][];
  deletedCount?: number;
}): jest.Mocked<ClearDataCollection> {
  const counts = input?.counts ?? [1, 0];
  const indexes = input?.indexes ?? [INDEXES, INDEXES];
  return {
    countDocuments: jest
      .fn()
      .mockImplementation(() => Promise.resolve(counts.shift() ?? 0)),
    indexes: jest
      .fn()
      .mockImplementation(() => Promise.resolve(indexes.shift() ?? INDEXES)),
    deleteMany: jest
      .fn()
      .mockResolvedValue({ deletedCount: input?.deletedCount ?? 1 }),
  };
}

function createDatabase(
  collections: Record<string, ClearDataCollection>,
  collectionLists?: Array<Array<{ name: string; type?: string }>>,
  databaseName = 'cogmemory_ad_test',
): jest.Mocked<ClearDataDatabase> {
  const lists = collectionLists ?? [
    Object.keys(collections).map((name) => ({ name, type: 'collection' })),
    Object.keys(collections).map((name) => ({ name, type: 'collection' })),
  ];
  return {
    databaseName,
    listCollections: jest
      .fn()
      .mockImplementation(() => Promise.resolve(lists.shift() ?? [])),
    collection: jest.fn((name) => collections[name]),
  };
}

type MockStorageService = jest.Mocked<
  Pick<StorageService, 'driver' | 'deleteObject'>
>;

function createStorageService(
  driver: 'fake' | 'oss' = 'fake',
): MockStorageService {
  return {
    driver,
    deleteObject: jest.fn<Promise<void>, [string]>().mockResolvedValue(),
  };
}

function createOssLister(
  pages: string[][] = [[]],
): jest.Mocked<OssObjectLister> {
  return {
    listObjectKeys: jest
      .fn<Promise<string[]>, [string]>()
      .mockImplementation(() => Promise.resolve(pages.shift() ?? [])),
  };
}

function createContext(
  database: ClearDataDatabase,
  storageService: MockStorageService = createStorageService(),
): ClearDataContext {
  return {
    database,
    storageService,
    storageConfigService: {
      getOssConfigOrThrow: () => OSS_CONFIG,
    },
    close: () => Promise.resolve(),
  };
}

describe('clear-database-data', () => {
  it('defaults to dry-run with all scope and rejects unknown arguments', () => {
    expect(resolveClearDataArguments([])).toEqual({
      mode: 'dry-run',
      scope: 'all',
    });
    expect(() => resolveClearDataArguments(['--unknown'])).toThrow(
      'Unknown or duplicate clear-data argument',
    );
    expect(() => resolveClearDataArguments(['--execute', '--execute'])).toThrow(
      'Unknown or duplicate clear-data argument',
    );
  });

  it('parses all and business scope for dry-run or execute and rejects invalid scope', () => {
    expect(resolveClearDataArguments(['--scope=all'])).toEqual({
      mode: 'dry-run',
      scope: 'all',
    });
    expect(resolveClearDataArguments(['--scope=business'])).toEqual({
      mode: 'dry-run',
      scope: 'business',
    });
    expect(
      resolveClearDataArguments([
        '--scope=business',
        '--execute',
        '--confirm=cogmemory_ad_test',
      ]),
    ).toEqual({
      mode: 'execute',
      scope: 'business',
      confirm: 'cogmemory_ad_test',
      confirmOss: undefined,
    });
    expect(() => resolveClearDataArguments(['--scope='])).toThrow(
      '--scope must be all or business',
    );
    expect(() => resolveClearDataArguments(['--scope=foo'])).toThrow(
      '--scope must be all or business',
    );
    expect(() =>
      resolveClearDataArguments(['--scope=all', '--scope=business']),
    ).toThrow('Unknown or duplicate clear-data argument');
  });

  it('keeps the current business collection classification explicit', () => {
    expect([...BUSINESS_CLEAR_COLLECTIONS].sort()).toEqual(
      [
        'assessment_visits',
        'clinical_reports',
        'cognitive_domain_results',
        'item_responses',
        'media_evidences',
        'patient_administration_sessions',
        'patients',
        'scale_instances',
        'score_results',
        'sessions',
      ].sort(),
    );
    expect([...BUSINESS_PRESERVE_COLLECTIONS].sort()).toEqual(
      ['scale_definitions', 'scale_versions', 'users'].sort(),
    );
    expect(resolveCollectionAction('business', 'sessions')).toBe('delete');
    expect(resolveCollectionAction('business', 'users')).toBe('preserve');
    expect(resolveCollectionAction('business', 'future_system_settings')).toBe(
      'unclassified',
    );
    expect(resolveCollectionAction('all', 'future_system_settings')).toBe(
      'delete',
    );
  });

  it('parses OSS confirmation only for execute and rejects empty or duplicate values', () => {
    expect(
      resolveClearDataArguments([
        '--execute',
        '--confirm=cogmemory_ad_test',
        `--confirm-oss=${OSS_CLEANUP_NAMESPACE}`,
      ]),
    ).toEqual({
      mode: 'execute',
      scope: 'all',
      confirm: 'cogmemory_ad_test',
      confirmOss: OSS_CLEANUP_NAMESPACE,
    });
    expect(() =>
      resolveClearDataArguments([`--confirm-oss=${OSS_CLEANUP_NAMESPACE}`]),
    ).toThrow('--confirm-oss is only valid together with --execute');
    expect(() =>
      resolveClearDataArguments(['--execute', '--confirm-oss=']),
    ).toThrow('--confirm-oss must contain the OSS cleanup namespace');
    expect(() =>
      resolveClearDataArguments([
        '--execute',
        `--confirm-oss=${OSS_CLEANUP_NAMESPACE}`,
        `--confirm-oss=${OSS_CLEANUP_NAMESPACE}`,
      ]),
    ).toThrow('Unknown or duplicate clear-data argument');
  });

  it('normalizes the OSS prefix and requires an exact driver-specific confirmation', () => {
    expect(resolveOssCleanupNamespace(`/${OSS_PREFIX}/`)).toBe(
      OSS_CLEANUP_NAMESPACE,
    );
    expect(() => resolveOssCleanupNamespace('///')).toThrow(
      'OSS cleanup namespace is not configured',
    );
    expect(() =>
      assertOssExecuteConfirmation({
        options: {
          mode: 'execute',
          scope: 'all',
          confirmOss: `${OSS_CLEANUP_NAMESPACE}/`,
        },
        storageDriver: 'oss',
        cleanupNamespace: OSS_CLEANUP_NAMESPACE,
      }),
    ).toThrow(`--confirm-oss=${OSS_CLEANUP_NAMESPACE}`);
    expect(() =>
      assertOssExecuteConfirmation({
        options: {
          mode: 'execute',
          scope: 'all',
          confirmOss: OSS_CLEANUP_NAMESPACE,
        },
        storageDriver: 'fake',
      }),
    ).toThrow('--confirm-oss is invalid when STORAGE_DRIVER=fake');
  });

  it('requires the exact expected database confirmation for execute', () => {
    expect(() =>
      assertExecuteConfirmation(
        resolveClearDataArguments(['--execute']),
        'cogmemory_ad_test',
      ),
    ).toThrow('--execute requires --confirm=cogmemory_ad_test');
    expect(() =>
      assertExecuteConfirmation(
        resolveClearDataArguments([
          '--execute',
          '--confirm=cogmemory_ad_browser_test',
        ]),
        'cogmemory_ad_test',
      ),
    ).toThrow('--execute requires --confirm=cogmemory_ad_test');
  });

  it('maps production to cogmemory_ad and rejects test browser_acceptance', () => {
    expect(
      resolveClearDataExpectedDatabaseName({
        nodeEnv: 'production',
        databasePurpose: undefined,
      }),
    ).toBe('cogmemory_ad');
    expect(() =>
      resolveClearDataExpectedDatabaseName({
        nodeEnv: 'test',
        databasePurpose: 'browser_acceptance',
      }),
    ).toThrow('sync-indexes only allows standard_test');
  });

  it('dry-run reports documents without deleting them', async () => {
    const collection = createCollection({ counts: [2], indexes: [INDEXES] });
    const storage = createStorageService('fake');
    const logger = createLogger();
    const ossListerFactory = jest.fn();

    const exitCode = await runClearDatabaseData({
      env: createEnvironment(),
      logger,
      createContext: () =>
        Promise.resolve(
          createContext(createDatabase({ users: collection }), storage),
        ),
      createOssLister: ossListerFactory,
    });

    expect(exitCode).toBe(0);
    expect(collection.countDocuments.mock.calls).toEqual([[{}]]);
    expect(collection.deleteMany.mock.calls).toHaveLength(0);
    expect(ossListerFactory).not.toHaveBeenCalled();
    expect(storage.deleteObject.mock.calls).toHaveLength(0);
    expect(logger.messages.join('\n')).toContain(
      'storageDriver=fake ossCleanup=skipped',
    );
    expect(logger.messages.join('\n')).toContain(
      'summary mode=dry-run scope=all',
    );
    expect(logger.messages.join('\n')).toContain(
      'collection=users action=delete',
    );
  });

  it('fails closed on actual databaseName mismatch before collection access', async () => {
    const collection = createCollection();
    const database = createDatabase(
      { users: collection },
      undefined,
      'cogmemory_ad_browser_test',
    );

    const exitCode = await runClearDatabaseData({
      args: ['--scope=all', '--execute', '--confirm=cogmemory_ad_test'],
      env: createEnvironment(),
      logger: createLogger(),
      createContext: () => Promise.resolve(createContext(database)),
    });

    expect(exitCode).toBe(1);
    expect(database.listCollections.mock.calls).toHaveLength(0);
    expect(collection.deleteMany.mock.calls).toHaveLength(0);
  });

  it('execute only deletes documents and preserves collections and indexes', async () => {
    const users = createCollection({ counts: [2, 0], deletedCount: 2 });
    const patients = createCollection({ counts: [1, 0], deletedCount: 1 });
    const database = createDatabase({ users, patients });
    const prohibited = {
      dropDatabase: jest.fn(),
      dropCollection: jest.fn(),
      drop: jest.fn(),
      dropIndexes: jest.fn(),
      syncIndexes: jest.fn(),
    };
    const storage = createStorageService('fake');
    const logger = createLogger();
    const ossListerFactory = jest.fn();

    const exitCode = await runClearDatabaseData({
      args: ['--scope=all', '--execute', '--confirm=cogmemory_ad_test'],
      env: createEnvironment(),
      logger,
      createContext: () => Promise.resolve(createContext(database, storage)),
      createOssLister: ossListerFactory,
    });

    expect(exitCode).toBe(0);
    expect(users.deleteMany.mock.calls).toEqual([[{}]]);
    expect(patients.deleteMany.mock.calls).toEqual([[{}]]);
    expect(database.listCollections.mock.calls).toHaveLength(2);
    expect(ossListerFactory).not.toHaveBeenCalled();
    expect(storage.deleteObject.mock.calls).toHaveLength(0);
    expect(logger.messages.join('\n')).toContain(
      'storageDriver=fake ossCleanup=skipped',
    );
    for (const operation of Object.values(prohibited)) {
      expect(operation.mock.calls).toHaveLength(0);
    }
  });

  it('business dry-run reports delete and preserve actions without deleting', async () => {
    const patients = createCollection({ counts: [2] });
    const sessions = createCollection({ counts: [1] });
    const users = createCollection({ counts: [3] });
    const scaleDefinitions = createCollection({ counts: [4] });
    const scaleVersions = createCollection({ counts: [5] });
    const storage = createStorageService('fake');
    const logger = createLogger();

    const exitCode = await runClearDatabaseData({
      args: ['--scope=business'],
      env: createEnvironment(),
      logger,
      createContext: () =>
        Promise.resolve(
          createContext(
            createDatabase({
              patients,
              sessions,
              users,
              scale_definitions: scaleDefinitions,
              scale_versions: scaleVersions,
            }),
            storage,
          ),
        ),
    });

    expect(exitCode).toBe(0);
    expect(patients.deleteMany.mock.calls).toHaveLength(0);
    expect(sessions.deleteMany.mock.calls).toHaveLength(0);
    expect(users.deleteMany.mock.calls).toHaveLength(0);
    expect(scaleDefinitions.deleteMany.mock.calls).toHaveLength(0);
    expect(scaleVersions.deleteMany.mock.calls).toHaveLength(0);
    expect(storage.deleteObject.mock.calls).toHaveLength(0);
    const output = logger.messages.join('\n');
    expect(output).toContain('collection=patients action=delete');
    expect(output).toContain('collection=sessions action=delete');
    expect(output).toContain('collection=users action=preserve');
    expect(output).toContain('collection=scale_definitions action=preserve');
    expect(output).toContain('collection=scale_versions action=preserve');
    expect(output).toContain(
      'summary mode=dry-run scope=business collections=5 targetCollections=2 preservedCollections=3 unclassifiedCollections=0',
    );
    expect(output).toContain(
      'targetDocumentsBefore=3 preservedDocuments=12 deletedDocuments=0 residualDocuments=3',
    );
  });

  it('business execute clears targets and verifies preserved documents and indexes', async () => {
    const patients = createCollection({ counts: [2, 0], deletedCount: 2 });
    const sessions = createCollection({ counts: [1, 0], deletedCount: 1 });
    const users = createCollection({ counts: [3, 3] });
    const scaleDefinitions = createCollection({ counts: [4, 4] });
    const scaleVersions = createCollection({ counts: [5, 5] });
    const logger = createLogger();

    const exitCode = await runClearDatabaseData({
      args: ['--scope=business', '--execute', '--confirm=cogmemory_ad_test'],
      env: createEnvironment(),
      logger,
      createContext: () =>
        Promise.resolve(
          createContext(
            createDatabase({
              patients,
              sessions,
              users,
              scale_definitions: scaleDefinitions,
              scale_versions: scaleVersions,
            }),
          ),
        ),
    });

    expect(exitCode).toBe(0);
    expect(patients.deleteMany.mock.calls).toEqual([[{}]]);
    expect(sessions.deleteMany.mock.calls).toEqual([[{}]]);
    expect(users.deleteMany.mock.calls).toHaveLength(0);
    expect(scaleDefinitions.deleteMany.mock.calls).toHaveLength(0);
    expect(scaleVersions.deleteMany.mock.calls).toHaveLength(0);
    for (const collection of [
      patients,
      sessions,
      users,
      scaleDefinitions,
      scaleVersions,
    ]) {
      expect(collection.indexes.mock.calls).toHaveLength(2);
    }
    const output = logger.messages.join('\n');
    expect(output).toContain(
      'collection=users action=preserve collectionExists=true documentCount=3 expectedDocumentCount=3 indexesPreserved=true',
    );
    expect(output).toContain(
      'summary mode=execute scope=business collections=5 targetCollections=2 preservedCollections=3 unclassifiedCollections=0',
    );
    expect(output).toContain('residualDocuments=0');
  });

  it('business execute fails verification when preserved document count drifts', async () => {
    const patients = createCollection({ counts: [1, 0] });
    const users = createCollection({ counts: [2, 1] });
    const logger = createLogger();

    const exitCode = await runClearDatabaseData({
      args: ['--scope=business', '--execute', '--confirm=cogmemory_ad_test'],
      env: createEnvironment(),
      logger,
      createContext: () =>
        Promise.resolve(createContext(createDatabase({ patients, users }))),
    });

    expect(exitCode).toBe(1);
    expect(patients.deleteMany.mock.calls).toEqual([[{}]]);
    expect(users.deleteMany.mock.calls).toHaveLength(0);
    expect(logger.messages.join('\n')).toContain(
      'collection=users action=preserve collectionExists=true documentCount=1 expectedDocumentCount=2 indexesPreserved=true indexCount=2 aligned=false',
    );
  });

  it('business dry-run fails closed on an unclassified collection', async () => {
    const patients = createCollection({ counts: [1] });
    const futureSettings = createCollection({ counts: [2] });
    const storage = createStorageService('fake');
    const logger = createLogger();

    const exitCode = await runClearDatabaseData({
      args: ['--scope=business'],
      env: createEnvironment(),
      logger,
      createContext: () =>
        Promise.resolve(
          createContext(
            createDatabase({
              patients,
              future_system_settings: futureSettings,
            }),
            storage,
          ),
        ),
    });

    expect(exitCode).toBe(1);
    expect(patients.deleteMany.mock.calls).toHaveLength(0);
    expect(futureSettings.deleteMany.mock.calls).toHaveLength(0);
    expect(storage.deleteObject.mock.calls).toHaveLength(0);
    const output = logger.messages.join('\n');
    expect(output).toContain(
      'collection=future_system_settings action=unclassified',
    );
    expect(output).toContain(
      'phase=classification scope=business unclassifiedCollections=1 allowed=false',
    );
    expect(output).toContain('unclassifiedCollections=1');
    expect(output).toContain('exitCode=1');
  });

  it('rejects OSS confirmation for fake execute before database deletion', async () => {
    const collection = createCollection();
    const database = createDatabase({ users: collection });
    const storage = createStorageService('fake');

    const exitCode = await runClearDatabaseData({
      args: [
        '--execute',
        '--confirm=cogmemory_ad_test',
        `--confirm-oss=${OSS_CLEANUP_NAMESPACE}`,
      ],
      env: createEnvironment(),
      logger: createLogger(),
      createContext: () => Promise.resolve(createContext(database, storage)),
      createOssLister: jest.fn(),
    });

    expect(exitCode).toBe(1);
    expect(database.listCollections.mock.calls).toHaveLength(0);
    expect(collection.deleteMany.mock.calls).toHaveLength(0);
    expect(storage.deleteObject.mock.calls).toHaveLength(0);
  });

  it('OSS dry-run inventories only the current namespace before the database snapshot', async () => {
    const collection = createCollection({ counts: [2], indexes: [INDEXES] });
    const database = createDatabase({ users: collection });
    const storage = createStorageService('oss');
    const lister = createOssLister([
      [
        `${OSS_CLEANUP_PREFIX}one`,
        `${OSS_CLEANUP_PREFIX}two`,
        `${OSS_CLEANUP_PREFIX}three`,
      ],
    ]);
    const createLister = jest.fn(() => lister);
    const logger = createLogger();

    const exitCode = await runClearDatabaseData({
      env: createEnvironment(),
      logger,
      createContext: () => Promise.resolve(createContext(database, storage)),
      createOssLister: createLister,
    });

    expect(exitCode).toBe(0);
    expect(createLister).toHaveBeenCalledWith(OSS_CONFIG);
    expect(lister.listObjectKeys.mock.calls).toEqual([[OSS_CLEANUP_PREFIX]]);
    expect(collection.deleteMany.mock.calls).toHaveLength(0);
    expect(storage.deleteObject.mock.calls).toHaveLength(0);
    expect(logger.messages.join('\n')).toContain(
      `storageDriver=oss ossCleanup=dry_run namespace=${OSS_CLEANUP_NAMESPACE} beforeObjects=3 deletedObjects=0 residualObjects=3`,
    );
  });

  it.each([
    ['missing', undefined],
    ['foreign', 'cogmemory_ad/production/clinical-evidence'],
    ['trailing slash', `${OSS_CLEANUP_NAMESPACE}/`],
  ])(
    'rejects %s OSS execute confirmation before list or database deletion',
    async (_label, confirmOss) => {
      const collection = createCollection();
      const database = createDatabase({ users: collection });
      const storage = createStorageService('oss');
      const createLister = jest.fn(() => createOssLister());
      const args = ['--execute', '--confirm=cogmemory_ad_test'];
      if (confirmOss) {
        args.push(`--confirm-oss=${confirmOss}`);
      }

      const exitCode = await runClearDatabaseData({
        args,
        env: createEnvironment(),
        logger: createLogger(),
        createContext: () => Promise.resolve(createContext(database, storage)),
        createOssLister: createLister,
      });

      expect(exitCode).toBe(1);
      expect(createLister).not.toHaveBeenCalled();
      expect(database.listCollections.mock.calls).toHaveLength(0);
      expect(collection.deleteMany.mock.calls).toHaveLength(0);
      expect(storage.deleteObject.mock.calls).toHaveLength(0);
    },
  );

  it('fails preflight inventory without deleting database or storage data', async () => {
    const collection = createCollection();
    const database = createDatabase({ users: collection });
    const storage = createStorageService('oss');
    const lister = createOssLister();
    const logger = createLogger();
    const providerError = 'provider raw response with sensitive context';
    lister.listObjectKeys.mockRejectedValue(new Error(providerError));

    const exitCode = await runClearDatabaseData({
      args: [
        '--execute',
        '--confirm=cogmemory_ad_test',
        `--confirm-oss=${OSS_CLEANUP_NAMESPACE}`,
      ],
      env: createEnvironment(),
      logger,
      createContext: () => Promise.resolve(createContext(database, storage)),
      createOssLister: () => lister,
    });

    expect(exitCode).toBe(1);
    expect(database.listCollections.mock.calls).toHaveLength(0);
    expect(collection.deleteMany.mock.calls).toHaveLength(0);
    expect(storage.deleteObject.mock.calls).toHaveLength(0);
    expect(logger.messages.join('\n')).not.toContain(providerError);
  });

  it('business execute inventories OSS but blocks every destructive operation for an unclassified collection', async () => {
    const patients = createCollection();
    const futureSettings = createCollection();
    const database = createDatabase({
      patients,
      future_system_settings: futureSettings,
    });
    const storage = createStorageService('oss');
    const lister = createOssLister([[`${OSS_CLEANUP_PREFIX}initial-object`]]);
    const logger = createLogger();

    const exitCode = await runClearDatabaseData({
      args: [
        '--scope=business',
        '--execute',
        '--confirm=cogmemory_ad_test',
        `--confirm-oss=${OSS_CLEANUP_NAMESPACE}`,
      ],
      env: createEnvironment(),
      logger,
      createContext: () => Promise.resolve(createContext(database, storage)),
      createOssLister: () => lister,
    });

    expect(exitCode).toBe(1);
    expect(lister.listObjectKeys.mock.calls).toEqual([[OSS_CLEANUP_PREFIX]]);
    expect(patients.deleteMany.mock.calls).toHaveLength(0);
    expect(futureSettings.deleteMany.mock.calls).toHaveLength(0);
    expect(storage.deleteObject.mock.calls).toHaveLength(0);
    expect(logger.messages.join('\n')).toContain(
      'ossCleanup=skipped_due_to_database_failure',
    );
  });

  it.each([
    ['delete failure', [1, 1], true],
    ['residual documents', [2, 1], false],
  ])(
    'skips OSS deletion after business database %s',
    async (_label, counts, rejectDelete) => {
      const collection = createCollection({
        counts: [...counts],
        deletedCount: rejectDelete ? 0 : 1,
      });
      if (rejectDelete) {
        collection.deleteMany.mockRejectedValue(new Error('delete failed'));
      }
      const storage = createStorageService('oss');
      const lister = createOssLister([[`${OSS_CLEANUP_PREFIX}initial-object`]]);
      const logger = createLogger();

      const exitCode = await runClearDatabaseData({
        args: [
          '--scope=business',
          '--execute',
          '--confirm=cogmemory_ad_test',
          `--confirm-oss=${OSS_CLEANUP_NAMESPACE}`,
        ],
        env: createEnvironment(),
        logger,
        createContext: () =>
          Promise.resolve(
            createContext(createDatabase({ patients: collection }), storage),
          ),
        createOssLister: () => lister,
      });

      expect(exitCode).toBe(1);
      expect(lister.listObjectKeys.mock.calls).toHaveLength(1);
      expect(storage.deleteObject.mock.calls).toHaveLength(0);
      expect(logger.messages.join('\n')).toContain(
        'ossCleanup=skipped_due_to_database_failure',
      );
    },
  );

  it('business execute clears DB targets before deleting only the current OSS snapshot', async () => {
    const patients = createCollection({ counts: [2, 0], deletedCount: 2 });
    const users = createCollection({ counts: [3, 3] });
    const database = createDatabase({ patients, users });
    const storage = createStorageService('oss');
    const initialObjectKeys = [
      `${OSS_CLEANUP_PREFIX}one`,
      `${OSS_CLEANUP_PREFIX}two`,
    ];
    const lister = createOssLister([initialObjectKeys, []]);
    const order: string[] = [];
    patients.deleteMany.mockImplementation(() => {
      order.push('database-delete');
      return Promise.resolve({ deletedCount: 2 });
    });
    storage.deleteObject.mockImplementation(() => {
      order.push('storage-delete');
      return Promise.resolve();
    });

    const exitCode = await runClearDatabaseData({
      args: [
        '--scope=business',
        '--execute',
        '--confirm=cogmemory_ad_test',
        `--confirm-oss=${OSS_CLEANUP_NAMESPACE}`,
      ],
      env: createEnvironment(),
      logger: createLogger(),
      createContext: () => Promise.resolve(createContext(database, storage)),
      createOssLister: () => lister,
    });

    expect(exitCode).toBe(0);
    expect(patients.deleteMany.mock.calls).toEqual([[{}]]);
    expect(users.deleteMany.mock.calls).toHaveLength(0);
    expect(storage.deleteObject.mock.calls).toEqual(
      initialObjectKeys.map((objectKey) => [objectKey]),
    );
    expect(lister.listObjectKeys.mock.calls).toEqual([
      [OSS_CLEANUP_PREFIX],
      [OSS_CLEANUP_PREFIX],
    ]);
    expect(order).toEqual([
      'database-delete',
      'storage-delete',
      'storage-delete',
    ]);
  });

  it('continues after one OSS delete fails and still runs the verifier', async () => {
    const collection = createCollection({ counts: [1, 0] });
    const database = createDatabase({ users: collection });
    const storage = createStorageService('oss');
    const initialObjectKeys = [
      `${OSS_CLEANUP_PREFIX}one`,
      `${OSS_CLEANUP_PREFIX}two`,
    ];
    storage.deleteObject
      .mockRejectedValueOnce(new Error(`failed ${initialObjectKeys[0]}`))
      .mockResolvedValueOnce();
    const lister = createOssLister([initialObjectKeys, [initialObjectKeys[0]]]);

    const exitCode = await runClearDatabaseData({
      args: [
        '--execute',
        '--confirm=cogmemory_ad_test',
        `--confirm-oss=${OSS_CLEANUP_NAMESPACE}`,
      ],
      env: createEnvironment(),
      logger: createLogger(),
      createContext: () => Promise.resolve(createContext(database, storage)),
      createOssLister: () => lister,
    });

    expect(exitCode).toBe(1);
    expect(storage.deleteObject.mock.calls).toEqual(
      initialObjectKeys.map((objectKey) => [objectKey]),
    );
    expect(lister.listObjectKeys.mock.calls).toHaveLength(2);
  });

  it('reports a concurrent residual without deleting it in the verifier phase', async () => {
    const collection = createCollection({ counts: [1, 0] });
    const database = createDatabase({ users: collection });
    const storage = createStorageService('oss');
    const initialObjectKeys = [
      `${OSS_CLEANUP_PREFIX}one`,
      `${OSS_CLEANUP_PREFIX}two`,
    ];
    const concurrentObjectKey = `${OSS_CLEANUP_PREFIX}new-after-snapshot`;
    const lister = createOssLister([initialObjectKeys, [concurrentObjectKey]]);
    const logger = createLogger();

    const exitCode = await runClearDatabaseData({
      args: [
        '--execute',
        '--confirm=cogmemory_ad_test',
        `--confirm-oss=${OSS_CLEANUP_NAMESPACE}`,
      ],
      env: createEnvironment(),
      logger,
      createContext: () => Promise.resolve(createContext(database, storage)),
      createOssLister: () => lister,
    });

    expect(exitCode).toBe(1);
    expect(storage.deleteObject.mock.calls).toEqual(
      initialObjectKeys.map((objectKey) => [objectKey]),
    );
    expect(storage.deleteObject.mock.calls).not.toContainEqual([
      concurrentObjectKey,
    ]);
    expect(logger.messages.join('\n')).toContain('residualObjects=1');
  });

  it('returns non-zero when the final OSS verifier list fails', async () => {
    const collection = createCollection({ counts: [1, 0] });
    const database = createDatabase({ users: collection });
    const storage = createStorageService('oss');
    const lister = createOssLister();
    lister.listObjectKeys
      .mockReset()
      .mockResolvedValueOnce([`${OSS_CLEANUP_PREFIX}one`])
      .mockRejectedValueOnce(new Error('provider verifier failure'));

    const exitCode = await runClearDatabaseData({
      args: [
        '--execute',
        '--confirm=cogmemory_ad_test',
        `--confirm-oss=${OSS_CLEANUP_NAMESPACE}`,
      ],
      env: createEnvironment(),
      logger: createLogger(),
      createContext: () => Promise.resolve(createContext(database, storage)),
      createOssLister: () => lister,
    });

    expect(exitCode).toBe(1);
  });

  it('returns non-zero when residual documents remain', async () => {
    const collection = createCollection({ counts: [2, 1], deletedCount: 1 });

    const exitCode = await runClearDatabaseData({
      args: ['--execute', '--confirm=cogmemory_ad_test'],
      env: createEnvironment(),
      logger: createLogger(),
      createContext: () =>
        Promise.resolve(createContext(createDatabase({ users: collection }))),
    });

    expect(exitCode).toBe(1);
  });

  it('returns non-zero when a collection disappears', async () => {
    const collection = createCollection();
    const database = createDatabase({ users: collection }, [
      [{ name: 'users', type: 'collection' }],
      [],
    ]);

    const exitCode = await runClearDatabaseData({
      args: ['--execute', '--confirm=cogmemory_ad_test'],
      env: createEnvironment(),
      logger: createLogger(),
      createContext: () => Promise.resolve(createContext(database)),
    });

    expect(exitCode).toBe(1);
  });

  it('returns non-zero when index definitions change', async () => {
    const collection = createCollection({
      indexes: [INDEXES, [{ name: '_id_', key: { _id: 1 }, v: 2 }]],
    });

    const exitCode = await runClearDatabaseData({
      args: ['--execute', '--confirm=cogmemory_ad_test'],
      env: createEnvironment(),
      logger: createLogger(),
      createContext: () =>
        Promise.resolve(createContext(createDatabase({ users: collection }))),
    });

    expect(exitCode).toBe(1);
  });

  it('records delete failure, continues verification, and returns non-zero', async () => {
    const collection = createCollection({ counts: [1, 1] });
    collection.deleteMany.mockRejectedValue(new Error('delete failed'));

    const exitCode = await runClearDatabaseData({
      args: ['--execute', '--confirm=cogmemory_ad_test'],
      env: createEnvironment(),
      logger: createLogger(),
      createContext: () =>
        Promise.resolve(createContext(createDatabase({ users: collection }))),
    });

    expect(exitCode).toBe(1);
    expect(collection.countDocuments.mock.calls).toHaveLength(2);
  });

  it('redacts URI credentials and secrets from logs', async () => {
    const collection = createCollection();
    collection.countDocuments.mockRejectedValue(
      new Error(`failure for ${ADMIN_URI} admin-user super-secret`),
    );
    const logger = createLogger();

    const exitCode = await runClearDatabaseData({
      env: createEnvironment(),
      logger,
      createContext: () =>
        Promise.resolve(createContext(createDatabase({ users: collection }))),
    });
    const output = logger.messages.join('\n');

    expect(exitCode).toBe(1);
    expect(output).not.toContain(ADMIN_URI);
    expect(output).not.toContain('admin-user');
    expect(output).not.toContain('super-secret');
  });

  it('redacts OSS identity and full object keys from database failure logs', async () => {
    const objectKey = `${OSS_CLEANUP_PREFIX}private-object`;
    const collection = createCollection();
    collection.countDocuments.mockRejectedValue(
      new Error(
        `failure ${ADMIN_URI} test-bucket test-access-key-id test-access-key-secret ${objectKey}`,
      ),
    );
    const database = createDatabase({ users: collection });
    const storage = createStorageService('oss');
    const lister = createOssLister([[objectKey]]);
    const logger = createLogger();

    const exitCode = await runClearDatabaseData({
      args: [
        '--execute',
        '--confirm=cogmemory_ad_test',
        `--confirm-oss=${OSS_CLEANUP_NAMESPACE}`,
      ],
      env: createEnvironment({
        OSS_BUCKET: 'test-bucket',
        OSS_ACCESS_KEY_ID: 'test-access-key-id',
        OSS_ACCESS_KEY_SECRET: 'test-access-key-secret',
      }),
      logger,
      createContext: () => Promise.resolve(createContext(database, storage)),
      createOssLister: () => lister,
    });
    const output = logger.messages.join('\n');

    expect(exitCode).toBe(1);
    expect(output).not.toContain(ADMIN_URI);
    expect(output).not.toContain('test-bucket');
    expect(output).not.toContain('test-access-key-id');
    expect(output).not.toContain('test-access-key-secret');
    expect(output).not.toContain(objectKey);
    expect(storage.deleteObject.mock.calls).toHaveLength(0);
  });
});
