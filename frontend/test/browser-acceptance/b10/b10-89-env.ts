const RUN_FLAG = 'B10_BROWSER_ACCEPTANCE_RUN';
const FRONTEND_ORIGIN = 'BROWSER_ACCEPTANCE_FRONTEND_ORIGIN';
const BACKEND_ORIGIN = 'BROWSER_ACCEPTANCE_BACKEND_ORIGIN';
const RUNTIME_FILE = 'B10_BROWSER_RUNTIME_FILE';
const FIXTURE_PASSWORD = 'B10_FIXTURE_PASSWORD';

const FORBIDDEN_RUNNER_ENVIRONMENT_PATTERNS = [
  /^MONGO(?:DB)?(?:_|$)/i,
  /^DATABASE_URL$/i,
  /^DATABASE_(?:USER|USERNAME|PASSWORD|PURPOSE)$/i,
  /^COGMEMORY_DATABASE_PURPOSE$/i,
  /^BROWSER_ACCEPTANCE_(?:APP|ADMIN)_MONGO_URI$/i,
  /^DB_ADMIN(?:_|$)/i,
  /^B10_BROWSER_HTTP_FAULT_/i,
];

export type B1089Environment =
  | {
      enabled: false;
      skipReason: 'explicit_b10_browser_flag_required';
    }
  | {
      enabled: true;
      frontendOrigin: string;
      backendOrigin: string;
      runtimeFile: string;
      fixturePassword: string;
      databaseBoundaryClear: true;
    };

function requireValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value)
    throw new Error(`${name} is required for B10-89 Browser acceptance`);
  return value;
}

function parseLocalOrigin(name: string, value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid localhost origin`);
  }
  const normalizedInput = value.endsWith('/') ? value.slice(0, -1) : value;
  const local =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (
    !local ||
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.origin !== normalizedInput ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    throw new Error(
      `${name} must be an explicit localhost or 127.0.0.1 origin`,
    );
  }
  return parsed.origin;
}

export function resolveB1089Environment(
  env: NodeJS.ProcessEnv = process.env,
): B1089Environment {
  if (env[RUN_FLAG] !== '1') {
    return {
      enabled: false,
      skipReason: 'explicit_b10_browser_flag_required',
    };
  }

  const inheritedForbiddenCount = Object.entries(env).filter(
    ([name, value]) =>
      value !== undefined &&
      value !== '' &&
      FORBIDDEN_RUNNER_ENVIRONMENT_PATTERNS.some((pattern) =>
        pattern.test(name),
      ),
  ).length;
  if (inheritedForbiddenCount > 0) {
    throw new Error(
      'B10-89 Browser runner inherited database, db_admin, or fault configuration',
    );
  }

  const frontendOrigin = parseLocalOrigin(
    FRONTEND_ORIGIN,
    requireValue(env, FRONTEND_ORIGIN),
  );
  const backendOrigin = parseLocalOrigin(
    BACKEND_ORIGIN,
    requireValue(env, BACKEND_ORIGIN),
  );
  if (frontendOrigin === backendOrigin) {
    throw new Error('B10-89 frontend and backend origins must be distinct');
  }
  const fixturePassword = requireValue(env, FIXTURE_PASSWORD);
  if (fixturePassword.length < 16) {
    throw new Error(
      'B10_FIXTURE_PASSWORD does not satisfy the fixture contract',
    );
  }

  return {
    enabled: true,
    frontendOrigin,
    backendOrigin,
    runtimeFile: requireValue(env, RUNTIME_FILE),
    fixturePassword,
    databaseBoundaryClear: true,
  };
}
