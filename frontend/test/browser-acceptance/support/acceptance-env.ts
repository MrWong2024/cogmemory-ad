const LIVE_FLAG = 'BROWSER_ACCEPTANCE_RUN_LIVE';
const FRONTEND_ORIGIN = 'BROWSER_ACCEPTANCE_FRONTEND_ORIGIN';
const BACKEND_ORIGIN = 'BROWSER_ACCEPTANCE_BACKEND_ORIGIN';

const DATABASE_BOUNDARY_PATTERNS = [
  /^MONGO(?:DB)?_/i,
  /^DATABASE_URL$/i,
  /^COGMEMORY_DATABASE_PURPOSE$/i,
  /^BROWSER_ACCEPTANCE_(?:APP|ADMIN)_MONGO_URI$/i,
  /_FIXTURE_PASSWORD$/i,
];

export type LiveAcceptanceEnvironment =
  | {
      enabled: false;
      mode: 'live';
      skipReason: 'explicit_live_flag_required';
    }
  | {
      enabled: true;
      mode: 'live';
      frontendOrigin: string;
      backendOrigin: string;
    };

function parseLocalOrigin(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required when live Browser acceptance is enabled`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid localhost origin`);
  }

  const normalizedInput = value.endsWith('/') ? value.slice(0, -1) : value;
  const isLocalHost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  const isOriginOnly =
    parsed.origin === normalizedInput &&
    parsed.pathname === '/' &&
    parsed.search === '' &&
    parsed.hash === '' &&
    parsed.username === '' &&
    parsed.password === '';

  if (!isLocalHost || !isHttp || !isOriginOnly) {
    throw new Error(`${name} must be an explicit localhost or 127.0.0.1 origin`);
  }

  return parsed.origin;
}

export function resolveLiveAcceptanceEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): LiveAcceptanceEnvironment {
  if (env[LIVE_FLAG] !== '1') {
    return {
      enabled: false,
      mode: 'live',
      skipReason: 'explicit_live_flag_required',
    };
  }

  const frontendOrigin = parseLocalOrigin(FRONTEND_ORIGIN, env[FRONTEND_ORIGIN]);
  const backendOrigin = parseLocalOrigin(BACKEND_ORIGIN, env[BACKEND_ORIGIN]);

  if (frontendOrigin === backendOrigin) {
    throw new Error('Live frontend and backend origins must be distinct');
  }

  return {
    enabled: true,
    mode: 'live',
    frontendOrigin,
    backendOrigin,
  };
}

export type DatabaseBoundarySummary = {
  configuredVariableCount: number;
  clear: boolean;
};

export function auditDatabaseBoundary(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseBoundarySummary {
  const configuredVariableCount = Object.entries(env).filter(
    ([name, value]) =>
      value !== undefined &&
      value !== '' &&
      DATABASE_BOUNDARY_PATTERNS.some((pattern) => pattern.test(name)),
  ).length;

  return {
    configuredVariableCount,
    clear: configuredVariableCount === 0,
  };
}

export function assertDatabaseBoundaryIsClear(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseBoundarySummary {
  const summary = auditDatabaseBoundary(env);
  if (!summary.clear) {
    throw new Error('Browser acceptance runner inherited database or fixture configuration');
  }
  return summary;
}
