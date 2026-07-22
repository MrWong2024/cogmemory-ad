import {
  DatabaseGateError,
  TEST_DATABASE_NAMES,
  assertBrowserAcceptancePreImportEnvironment,
  assertBrowserBackendDatabaseAccess,
  assertBrowserFixtureDatabaseAccess,
  assertConnectedDatabaseMatchesPurpose,
  assertDeclaredDatabaseMatchesPurpose,
  getDatabaseNameForPurpose,
  readDeclaredDatabaseName,
  resolveTestDatabasePurpose,
  type DatabaseConnectionProbe,
} from './database-purpose';

const STANDARD_URI =
  'mongodb://test-user:test-password@127.0.0.1:27017/cogmemory_ad_test?authSource=cogmemory_ad_test';
const BROWSER_URI =
  'mongodb://browser-user:browser-password@127.0.0.1:27017/cogmemory_ad_browser_test?authSource=cogmemory_ad_browser_test';
const DEVELOPMENT_URI =
  'mongodb://dev-user:dev-password@127.0.0.1:27017/cogmemory_ad_dev?authSource=cogmemory_ad_dev';

function createConnectionProbe(input: {
  databaseName?: string;
  username: string;
  role: 'dbOwner' | 'readWrite';
}): DatabaseConnectionProbe {
  const databaseName =
    input.databaseName ?? TEST_DATABASE_NAMES.browser_acceptance;

  return {
    name: databaseName,
    db: {
      command: () =>
        Promise.resolve({
          authInfo: {
            authenticatedUsers: [
              {
                user: input.username,
                db: TEST_DATABASE_NAMES.browser_acceptance,
              },
            ],
            authenticatedUserRoles: [
              {
                role: input.role,
                db: TEST_DATABASE_NAMES.browser_acceptance,
              },
            ],
          },
        }),
    },
  };
}

describe('database purpose gates', () => {
  it('defaults test processes to standard_test and keeps non-test environments unchanged', () => {
    expect(resolveTestDatabasePurpose('test', undefined)).toBe('standard_test');
    expect(resolveTestDatabasePurpose('test', '')).toBe('standard_test');
    expect(
      resolveTestDatabasePurpose('development', 'browser_acceptance'),
    ).toBe(undefined);
    expect(resolveTestDatabasePurpose('production', 'standard_test')).toBe(
      undefined,
    );
  });

  it('uses only the fixed project database mapping', () => {
    expect(getDatabaseNameForPurpose('standard_test')).toBe(
      'cogmemory_ad_test',
    );
    expect(getDatabaseNameForPurpose('browser_acceptance')).toBe(
      'cogmemory_ad_browser_test',
    );
    expect(() => resolveTestDatabasePurpose('test', 'unexpected')).toThrow(
      DatabaseGateError,
    );
  });

  it('reads only the database declared by a MongoDB URI', () => {
    expect(readDeclaredDatabaseName(STANDARD_URI)).toBe('cogmemory_ad_test');
    expect(readDeclaredDatabaseName(BROWSER_URI)).toBe(
      'cogmemory_ad_browser_test',
    );
    expect(readDeclaredDatabaseName('not-a-mongo-uri')).toBeUndefined();
  });

  it('rejects both directions of a declared database mismatch before connection', () => {
    expect(() =>
      assertDeclaredDatabaseMatchesPurpose({
        nodeEnv: 'test',
        purpose: 'standard_test',
        mongoUri: BROWSER_URI,
      }),
    ).toThrow('project database purpose mapping');
    expect(() =>
      assertDeclaredDatabaseMatchesPurpose({
        nodeEnv: 'test',
        purpose: 'browser_acceptance',
        mongoUri: STANDARD_URI,
      }),
    ).toThrow('project database purpose mapping');
  });

  it('rejects both directions of a connected database mismatch', () => {
    expect(() =>
      assertConnectedDatabaseMatchesPurpose({
        nodeEnv: 'test',
        purpose: 'standard_test',
        databaseName: TEST_DATABASE_NAMES.browser_acceptance,
      }),
    ).toThrow('project database purpose mapping');
    expect(() =>
      assertConnectedDatabaseMatchesPurpose({
        nodeEnv: 'test',
        purpose: 'browser_acceptance',
        databaseName: TEST_DATABASE_NAMES.standard_test,
      }),
    ).toThrow('project database purpose mapping');
  });

  it('does not accept an arbitrary expected database name override', () => {
    const previousExpectedName = process.env.EXPECTED_DATABASE_NAME;
    process.env.EXPECTED_DATABASE_NAME = TEST_DATABASE_NAMES.browser_acceptance;
    try {
      expect(() =>
        assertDeclaredDatabaseMatchesPurpose({
          nodeEnv: 'test',
          purpose: 'standard_test',
          mongoUri: BROWSER_URI,
        }),
      ).toThrow('project database purpose mapping');
    } finally {
      if (previousExpectedName === undefined) {
        delete process.env.EXPECTED_DATABASE_NAME;
      } else {
        process.env.EXPECTED_DATABASE_NAME = previousExpectedName;
      }
    }
  });

  it('requires an explicit Browser purpose and Browser database before AppModule import', () => {
    expect(() =>
      assertBrowserAcceptancePreImportEnvironment({
        nodeEnv: 'test',
        purpose: undefined,
        mongoUri: BROWSER_URI,
      }),
    ).toThrow('browser_acceptance');
    expect(() =>
      assertBrowserAcceptancePreImportEnvironment({
        nodeEnv: 'test',
        purpose: 'browser_acceptance',
        mongoUri: STANDARD_URI,
      }),
    ).toThrow('project database purpose mapping');
    expect(() =>
      assertBrowserAcceptancePreImportEnvironment({
        nodeEnv: 'test',
        purpose: 'browser_acceptance',
        mongoUri: DEVELOPMENT_URI,
      }),
    ).toThrow('project database purpose mapping');
    expect(() =>
      assertBrowserAcceptancePreImportEnvironment({
        nodeEnv: 'test',
        purpose: 'browser_acceptance',
        mongoUri: BROWSER_URI,
      }),
    ).not.toThrow();
  });

  it('accepts only the db_admin user with dbOwner for Browser fixtures', async () => {
    await expect(
      assertBrowserFixtureDatabaseAccess(
        createConnectionProbe({
          username: 'cogmemory_ad_browser_test_db_admin',
          role: 'dbOwner',
        }),
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertBrowserFixtureDatabaseAccess(
        createConnectionProbe({
          username: 'cogmemory_ad_browser_test_app',
          role: 'readWrite',
        }),
      ),
    ).rejects.toThrow('authenticated MongoDB user or role');
  });

  it('accepts only the app user with readWrite for the Browser backend', async () => {
    await expect(
      assertBrowserBackendDatabaseAccess(
        createConnectionProbe({
          username: 'cogmemory_ad_browser_test_app',
          role: 'readWrite',
        }),
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertBrowserBackendDatabaseAccess(
        createConnectionProbe({
          username: 'cogmemory_ad_browser_test_db_admin',
          role: 'dbOwner',
        }),
      ),
    ).rejects.toThrow('authenticated MongoDB user or role');
  });

  it('rejects the wrong actual database before checking Browser roles', async () => {
    await expect(
      assertBrowserBackendDatabaseAccess(
        createConnectionProbe({
          databaseName: TEST_DATABASE_NAMES.standard_test,
          username: 'cogmemory_ad_browser_test_app',
          role: 'readWrite',
        }),
      ),
    ).rejects.toThrow('project database purpose mapping');
  });
});
