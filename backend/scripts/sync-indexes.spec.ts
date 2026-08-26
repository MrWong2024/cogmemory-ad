import {
  type IndexConnection,
  type IndexDiff,
  type IndexModel,
  type SyncIndexesLogger,
  prepareIndexSyncEnvironment,
  resolveExpectedDatabaseName,
  resolveSyncIndexesMode,
  runSyncIndexes,
} from './sync-indexes';

const ADMIN_URI =
  'mongodb://admin-user:super-secret@127.0.0.1:27017/cogmemory_ad_test?authSource=cogmemory_ad_test';

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

function createLogger(): SyncIndexesLogger & {
  messages: string[];
} {
  const messages: string[] = [];
  return {
    messages,
    log: (message) => messages.push(message),
    error: (message) => messages.push(message),
  };
}

function alignedDiff(): IndexDiff {
  return { toDrop: [], toCreate: [] };
}

function createModel(): jest.Mocked<IndexModel> {
  return {
    diffIndexes: jest.fn().mockResolvedValue(alignedDiff()),
    syncIndexes: jest.fn().mockResolvedValue([]),
  };
}

function createConnection(
  models: Record<string, IndexModel>,
  databaseName = 'cogmemory_ad_test',
): IndexConnection {
  return {
    db: { databaseName },
    modelNames: () => Object.keys(models),
    model: (name) => models[name],
  };
}

describe('sync-indexes', () => {
  it('defaults to dry-run and only accepts explicit --execute', () => {
    expect(resolveSyncIndexesMode([])).toBe('dry-run');
    expect(resolveSyncIndexesMode(['--execute'])).toBe('execute');
    expect(() => resolveSyncIndexesMode(['--dry-run'])).toThrow(
      'Only the optional --execute argument is supported',
    );
  });

  it.each([
    ['development', undefined, 'cogmemory_ad_dev'],
    ['test', 'standard_test', 'cogmemory_ad_test'],
    ['test', undefined, 'cogmemory_ad_test'],
    ['production', undefined, 'cogmemory_ad'],
  ])(
    'maps NODE_ENV=%s and purpose=%s to %s',
    (nodeEnv, databasePurpose, expectedDatabaseName) => {
      expect(resolveExpectedDatabaseName({ nodeEnv, databasePurpose })).toBe(
        expectedDatabaseName,
      );
    },
  );

  it('rejects browser_acceptance for the test environment', () => {
    expect(() =>
      resolveExpectedDatabaseName({
        nodeEnv: 'test',
        databasePurpose: 'browser_acceptance',
      }),
    ).toThrow('sync-indexes only allows standard_test');
  });

  it('switches the main connection to MONGO_ADMIN_URI and disables autoIndex', () => {
    const env = createEnvironment({
      MONGO_URI:
        'mongodb://app-user:app-secret@127.0.0.1:27017/cogmemory_ad_test',
      MONGO_AUTO_INDEX: 'true',
    });

    prepareIndexSyncEnvironment(env);

    expect(env.MONGO_URI).toBe(ADMIN_URI);
    expect(env.MONGO_ADMIN_URI).toBe(ADMIN_URI);
    expect(env.MONGO_AUTO_INDEX).toBe('false');
  });

  it('fails closed before model operations when actual databaseName mismatches', async () => {
    const model = createModel();
    const close = jest.fn().mockResolvedValue(undefined);

    const exitCode = await runSyncIndexes({
      env: createEnvironment(),
      logger: createLogger(),
      createContext: () =>
        Promise.resolve({
          connection: createConnection(
            { Patient: model },
            'cogmemory_ad_browser_test',
          ),
          close,
        }),
    });

    expect(exitCode).toBe(1);
    expect(model.diffIndexes.mock.calls).toHaveLength(0);
    expect(model.syncIndexes.mock.calls).toHaveLength(0);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('dry-run reports differences without calling syncIndexes and exits zero', async () => {
    const model = createModel();
    model.diffIndexes.mockResolvedValue({
      toDrop: ['legacy_1'],
      toCreate: [{ patientId: 1 }],
    });
    const logger = createLogger();

    const exitCode = await runSyncIndexes({
      env: createEnvironment(),
      logger,
      createContext: () =>
        Promise.resolve({
          connection: createConnection({ Patient: model }),
          close: () => Promise.resolve(),
        }),
    });

    expect(exitCode).toBe(0);
    expect(model.diffIndexes.mock.calls).toHaveLength(1);
    expect(model.syncIndexes.mock.calls).toHaveLength(0);
    expect(logger.messages.join('\n')).toContain('aligned=false');
  });

  it('execute syncs each model and runs the post-sync diff verifier', async () => {
    const model = createModel();

    const exitCode = await runSyncIndexes({
      args: ['--execute'],
      env: createEnvironment(),
      logger: createLogger(),
      createContext: () =>
        Promise.resolve({
          connection: createConnection({ Patient: model }),
          close: () => Promise.resolve(),
        }),
    });

    expect(exitCode).toBe(0);
    expect(model.syncIndexes.mock.calls).toHaveLength(1);
    expect(model.diffIndexes.mock.calls).toHaveLength(1);
    expect(model.syncIndexes.mock.invocationCallOrder[0]).toBeLessThan(
      model.diffIndexes.mock.invocationCallOrder[0],
    );
  });

  it('returns non-zero when a model sync fails', async () => {
    const model = createModel();
    model.syncIndexes.mockRejectedValue(new Error('index command failed'));

    const exitCode = await runSyncIndexes({
      args: ['--execute'],
      env: createEnvironment(),
      logger: createLogger(),
      createContext: () =>
        Promise.resolve({
          connection: createConnection({ Patient: model }),
          close: () => Promise.resolve(),
        }),
    });

    expect(exitCode).toBe(1);
    expect(model.diffIndexes.mock.calls).toHaveLength(1);
  });

  it('returns non-zero when the execute verifier finds a residual diff', async () => {
    const model = createModel();
    model.diffIndexes.mockResolvedValue({
      toDrop: [],
      toCreate: [{ patientId: 1 }],
    });

    const exitCode = await runSyncIndexes({
      args: ['--execute'],
      env: createEnvironment(),
      logger: createLogger(),
      createContext: () =>
        Promise.resolve({
          connection: createConnection({ Patient: model }),
          close: () => Promise.resolve(),
        }),
    });

    expect(exitCode).toBe(1);
  });

  it('redacts URI credentials and secrets from failure logs', async () => {
    const model = createModel();
    model.diffIndexes.mockRejectedValue(
      new Error(`failure for ${ADMIN_URI} admin-user super-secret`),
    );
    const logger = createLogger();

    const exitCode = await runSyncIndexes({
      env: createEnvironment(),
      logger,
      createContext: () =>
        Promise.resolve({
          connection: createConnection({ Patient: model }),
          close: () => Promise.resolve(),
        }),
    });
    const output = logger.messages.join('\n');

    expect(exitCode).toBe(1);
    expect(output).not.toContain(ADMIN_URI);
    expect(output).not.toContain('admin-user');
    expect(output).not.toContain('super-secret');
    expect(output).toContain('[REDACTED');
  });
});
