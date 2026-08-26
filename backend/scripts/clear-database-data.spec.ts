import {
  type ClearDataCollection,
  type ClearDataDatabase,
  type ClearDataContext,
  assertExecuteConfirmation,
  resolveClearDataArguments,
  resolveClearDataExpectedDatabaseName,
  runClearDatabaseData,
} from './clear-database-data';
import type { SyncIndexesLogger } from './sync-indexes';

const ADMIN_URI =
  'mongodb://admin-user:super-secret@127.0.0.1:27017/cogmemory_ad_test?authSource=cogmemory_ad_test';
const INDEXES = [
  { name: '_id_', key: { _id: 1 }, v: 2 },
  { name: 'marker_1', key: { marker: 1 }, v: 2, unique: true },
];

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

function createContext(database: ClearDataDatabase): ClearDataContext {
  return {
    database,
    close: () => Promise.resolve(),
  };
}

describe('clear-database-data', () => {
  it('defaults to dry-run and rejects unknown arguments', () => {
    expect(resolveClearDataArguments([])).toEqual({ mode: 'dry-run' });
    expect(() => resolveClearDataArguments(['--unknown'])).toThrow(
      'Unknown or duplicate clear-data argument',
    );
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

    const exitCode = await runClearDatabaseData({
      env: createEnvironment(),
      logger: createLogger(),
      createContext: () =>
        Promise.resolve(createContext(createDatabase({ users: collection }))),
    });

    expect(exitCode).toBe(0);
    expect(collection.countDocuments.mock.calls).toEqual([[{}]]);
    expect(collection.deleteMany.mock.calls).toHaveLength(0);
  });

  it('fails closed on actual databaseName mismatch before collection access', async () => {
    const collection = createCollection();
    const database = createDatabase(
      { users: collection },
      undefined,
      'cogmemory_ad_browser_test',
    );

    const exitCode = await runClearDatabaseData({
      args: ['--execute', '--confirm=cogmemory_ad_test'],
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

    const exitCode = await runClearDatabaseData({
      args: ['--execute', '--confirm=cogmemory_ad_test'],
      env: createEnvironment(),
      logger: createLogger(),
      createContext: () => Promise.resolve(createContext(database)),
    });

    expect(exitCode).toBe(0);
    expect(users.deleteMany.mock.calls).toEqual([[{}]]);
    expect(patients.deleteMany.mock.calls).toEqual([[{}]]);
    expect(database.listCollections.mock.calls).toHaveLength(2);
    for (const operation of Object.values(prohibited)) {
      expect(operation.mock.calls).toHaveLength(0);
    }
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
});
