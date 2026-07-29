const RUN_FLAG = "B12_BROWSER_ACCEPTANCE_RUN";
const FRONTEND_ORIGIN = "BROWSER_ACCEPTANCE_FRONTEND_ORIGIN";
const BACKEND_ORIGIN = "BROWSER_ACCEPTANCE_BACKEND_ORIGIN";
const FIXTURE_PASSWORD = "B12_FIXTURE_PASSWORD";

const FORBIDDEN_RUNNER_ENVIRONMENT_PATTERNS = [
  /^MONGO(?:DB)?(?:_|$)/i,
  /^DATABASE_URL$/i,
  /^DATABASE_(?:USER|USERNAME|PASSWORD|PURPOSE)$/i,
  /^COGMEMORY_DATABASE_PURPOSE$/i,
  /^BROWSER_ACCEPTANCE_(?:APP|ADMIN)_MONGO_URI$/i,
  /^DB_ADMIN(?:_|$)/i,
  /^B10_BROWSER_HTTP_FAULT_/i,
  /^B11_BROWSER_HTTP_FAULT_/i,
  /^B12_BROWSER_HTTP_FAULT_/i,
  /^B10_(?:FIXTURE_PASSWORD|BROWSER_RUNTIME_)/i,
  /^B11_(?:FIXTURE_PASSWORD|BROWSER_RUNTIME_)/i,
  /^B12_BROWSER_RUNTIME_/i,
];

export type B12BrowserEnvironment =
  | {
      enabled: false;
      skipReason: "explicit_b12_browser_flag_required";
    }
  | {
      enabled: true;
      frontendOrigin: string;
      backendOrigin: string;
      fixturePassword: string;
      databaseBoundaryClear: true;
      workers: 1;
      retries: 0;
    };

function requireValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required for B12 Browser acceptance`);
  }
  return value;
}

function parseLocalOrigin(name: string, value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid localhost origin`);
  }
  const normalizedInput = value.endsWith("/") ? value.slice(0, -1) : value;
  const local =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (
    !local ||
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.origin !== normalizedInput ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    throw new Error(
      `${name} must be an explicit localhost or 127.0.0.1 origin`,
    );
  }
  return parsed.origin;
}

export function resolveB12BrowserEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): B12BrowserEnvironment {
  if (env[RUN_FLAG] !== "1") {
    return {
      enabled: false,
      skipReason: "explicit_b12_browser_flag_required",
    };
  }

  const inheritedForbiddenCount = Object.entries(env).filter(
    ([name, value]) =>
      value !== undefined &&
      value !== "" &&
      (FORBIDDEN_RUNNER_ENVIRONMENT_PATTERNS.some((pattern) =>
        pattern.test(name),
      ) ||
        (/_FIXTURE_PASSWORD$/i.test(name) && name !== FIXTURE_PASSWORD)),
  ).length;
  if (inheritedForbiddenCount > 0) {
    throw new Error(
      "B12 Browser runner inherited database, db_admin, fault, or unrelated fixture configuration",
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
    throw new Error("B12 frontend and backend origins must be distinct");
  }

  const fixturePassword = requireValue(env, FIXTURE_PASSWORD);
  if (fixturePassword.length < 16) {
    throw new Error("B12 fixture password does not satisfy the fixed contract");
  }

  return {
    enabled: true,
    frontendOrigin,
    backendOrigin,
    fixturePassword,
    databaseBoundaryClear: true,
    workers: 1,
    retries: 0,
  };
}
