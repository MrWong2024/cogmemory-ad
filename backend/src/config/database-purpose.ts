export const DATABASE_PURPOSE_ENV_NAME = 'COGMEMORY_DATABASE_PURPOSE';

export const TEST_DATABASE_NAMES = {
  standard_test: 'cogmemory_ad_test',
  browser_acceptance: 'cogmemory_ad_browser_test',
} as const;

export type TestDatabasePurpose = keyof typeof TEST_DATABASE_NAMES;

const BROWSER_FIXTURE_USERNAME = 'cogmemory_ad_browser_test_db_admin';
const BROWSER_BACKEND_USERNAME = 'cogmemory_ad_browser_test_app';

type RequiredBrowserRole = 'dbOwner' | 'readWrite';

type ConnectionStatusUser = {
  user?: unknown;
  db?: unknown;
};

type ConnectionStatusRole = {
  role?: unknown;
  db?: unknown;
};

type ConnectionStatusResult = {
  authInfo?: {
    authenticatedUsers?: ConnectionStatusUser[];
    authenticatedUserRoles?: ConnectionStatusRole[];
  };
};

export type DatabaseConnectionProbe = {
  name: string;
  db?: {
    command(command: {
      connectionStatus: 1;
      showPrivileges: false;
    }): Promise<unknown>;
  };
};

export class DatabaseGateError extends Error {
  constructor(
    public readonly code: string,
    safeMessage: string,
  ) {
    super(safeMessage);
    this.name = 'DatabaseGateError';
  }
}

export function resolveTestDatabasePurpose(
  nodeEnv: string | undefined,
  value: string | undefined,
): TestDatabasePurpose | undefined {
  if (nodeEnv !== 'test') {
    return undefined;
  }

  if (value === undefined || value.length === 0) {
    return 'standard_test';
  }

  if (value === 'standard_test' || value === 'browser_acceptance') {
    return value;
  }

  throw new DatabaseGateError(
    'DATABASE_PURPOSE_INVALID',
    `${DATABASE_PURPOSE_ENV_NAME} must be standard_test or browser_acceptance in the test environment`,
  );
}

export function getDatabaseNameForPurpose(
  purpose: TestDatabasePurpose,
): string {
  return TEST_DATABASE_NAMES[purpose];
}

export function readDeclaredDatabaseName(
  mongoUri: string | undefined,
): string | undefined {
  if (!mongoUri) {
    return undefined;
  }

  const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^/?#]+)(?:[?#]|$)/i.exec(
    mongoUri,
  );
  if (!match?.[1]) {
    return undefined;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

export function assertDeclaredDatabaseMatchesPurpose(input: {
  nodeEnv: string | undefined;
  purpose: string | undefined;
  mongoUri: string | undefined;
}): void {
  const purpose = resolveTestDatabasePurpose(input.nodeEnv, input.purpose);
  if (!purpose) {
    return;
  }

  const expectedDatabaseName = getDatabaseNameForPurpose(purpose);
  if (readDeclaredDatabaseName(input.mongoUri) !== expectedDatabaseName) {
    throw new DatabaseGateError(
      'DATABASE_DECLARED_NAME_MISMATCH',
      'The configured MongoDB database does not match the project database purpose mapping',
    );
  }
}

export function assertConnectedDatabaseMatchesPurpose(input: {
  nodeEnv: string | undefined;
  purpose: string | undefined;
  databaseName: string;
}): void {
  const purpose = resolveTestDatabasePurpose(input.nodeEnv, input.purpose);
  if (!purpose) {
    return;
  }

  if (input.databaseName !== getDatabaseNameForPurpose(purpose)) {
    throw new DatabaseGateError(
      'DATABASE_CONNECTED_NAME_MISMATCH',
      'The connected MongoDB database does not match the project database purpose mapping',
    );
  }
}

export function assertBrowserAcceptancePreImportEnvironment(input: {
  nodeEnv: string | undefined;
  purpose: string | undefined;
  mongoUri: string | undefined;
}): void {
  if (input.nodeEnv !== 'test') {
    throw new DatabaseGateError(
      'BROWSER_DATABASE_TEST_ENV_REQUIRED',
      'Browser database processes require NODE_ENV=test',
    );
  }

  if (input.purpose !== 'browser_acceptance') {
    throw new DatabaseGateError(
      'BROWSER_DATABASE_PURPOSE_REQUIRED',
      `Browser database processes require ${DATABASE_PURPOSE_ENV_NAME}=browser_acceptance`,
    );
  }

  assertDeclaredDatabaseMatchesPurpose(input);
}

async function assertAuthenticatedDatabaseRole(
  connection: DatabaseConnectionProbe,
  expectedUsername: string,
  expectedRole: RequiredBrowserRole,
): Promise<void> {
  if (!connection.db) {
    throw new DatabaseGateError(
      'DATABASE_AUTHORIZATION_UNAVAILABLE',
      'MongoDB authentication information is unavailable',
    );
  }

  let status: ConnectionStatusResult;
  try {
    status = (await connection.db.command({
      connectionStatus: 1,
      showPrivileges: false,
    })) as ConnectionStatusResult;
  } catch {
    throw new DatabaseGateError(
      'DATABASE_AUTHORIZATION_UNAVAILABLE',
      'MongoDB authentication information could not be verified',
    );
  }

  const databaseName = TEST_DATABASE_NAMES.browser_acceptance;
  const authenticatedUsers = status.authInfo?.authenticatedUsers ?? [];
  const authenticatedUserRoles = status.authInfo?.authenticatedUserRoles ?? [];
  const expectedUserIsExclusive =
    authenticatedUsers.length === 1 &&
    authenticatedUsers[0]?.user === expectedUsername &&
    authenticatedUsers[0]?.db === databaseName;
  const hasExpectedRole = authenticatedUserRoles.some(
    (role) => role.role === expectedRole && role.db === databaseName,
  );

  if (!expectedUserIsExclusive || !hasExpectedRole) {
    throw new DatabaseGateError(
      'DATABASE_AUTHORIZATION_MISMATCH',
      'The authenticated MongoDB user or role does not match the required Browser database process',
    );
  }
}

async function assertBrowserDatabaseAccess(
  connection: DatabaseConnectionProbe,
  expectedUsername: string,
  expectedRole: RequiredBrowserRole,
): Promise<void> {
  assertConnectedDatabaseMatchesPurpose({
    nodeEnv: 'test',
    purpose: 'browser_acceptance',
    databaseName: connection.name,
  });
  await assertAuthenticatedDatabaseRole(
    connection,
    expectedUsername,
    expectedRole,
  );
}

export async function assertBrowserFixtureDatabaseAccess(
  connection: DatabaseConnectionProbe,
): Promise<void> {
  await assertBrowserDatabaseAccess(
    connection,
    BROWSER_FIXTURE_USERNAME,
    'dbOwner',
  );
}

export async function assertBrowserBackendDatabaseAccess(
  connection: DatabaseConnectionProbe,
): Promise<void> {
  await assertBrowserDatabaseAccess(
    connection,
    BROWSER_BACKEND_USERNAME,
    'readWrite',
  );
}
