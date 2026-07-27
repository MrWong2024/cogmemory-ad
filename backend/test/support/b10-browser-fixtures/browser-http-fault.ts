import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  B10FixtureError,
  requireB10FixturePassword,
  validateB10Namespace,
} from './fixture-contract';
import type { B10BrowserHttpFaultTarget } from './b10-browser-fixtures';

const FAULT_ENVIRONMENT_NAMES = [
  'B10_BROWSER_HTTP_FAULT_PROFILE',
  'B10_BROWSER_HTTP_FAULT_NAMESPACE',
  'B10_BROWSER_HTTP_FAULT_SCENARIO',
  'B10_BROWSER_HTTP_FAULT_ROUTE',
  'B10_BROWSER_HTTP_FAULT_ONCE',
] as const;

const FAULT_ENVIRONMENT_PREFIX = 'B10_BROWSER_HTTP_FAULT_';
const SAFE_LATEST_PATH =
  '/patients/:patientId/visits/:visitId/clinical-reports/latest';
const TARGET_PATH_PATTERN =
  /^\/patients\/[a-f\d]{24}\/visits\/[a-f\d]{24}\/clinical-reports\/latest$/;

type B10BrowserHttpFaultEnvironmentName =
  (typeof FAULT_ENVIRONMENT_NAMES)[number];

export type B10BrowserHttpFaultRuntime = {
  nodeEnv: string | undefined;
  databasePurpose: string | undefined;
  databaseName: string;
};

export type B10BrowserHttpFaultConfig = {
  profile: 'generation-workflow';
  namespace: string;
  scenarioKey: 'latest_lifecycle';
  routeKey: 'latest_failure';
  fixturePassword: string;
};

function faultError(code: string, message: string): B10FixtureError {
  return new B10FixtureError(code, message, 'generation-workflow');
}

function requiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: B10BrowserHttpFaultEnvironmentName,
): string {
  const value = environment[name];
  if (!value) {
    throw faultError(
      'B10_BROWSER_HTTP_FAULT_CONFIG_INVALID',
      'The B10 Browser HTTP fault configuration must be complete',
    );
  }
  return value;
}

export function hasB10BrowserHttpFaultEnvironment(
  environment: NodeJS.ProcessEnv,
): boolean {
  return Object.keys(environment).some((name) =>
    name.startsWith(FAULT_ENVIRONMENT_PREFIX),
  );
}

export function resolveB10BrowserHttpFaultConfig(
  environment: NodeJS.ProcessEnv,
  runtime: B10BrowserHttpFaultRuntime,
): B10BrowserHttpFaultConfig | null {
  const providedNames = Object.keys(environment).filter((name) =>
    name.startsWith(FAULT_ENVIRONMENT_PREFIX),
  );
  if (providedNames.length === 0) {
    return null;
  }
  if (
    providedNames.some(
      (name) =>
        !FAULT_ENVIRONMENT_NAMES.includes(
          name as B10BrowserHttpFaultEnvironmentName,
        ),
    )
  ) {
    throw faultError(
      'B10_BROWSER_HTTP_FAULT_ARGUMENT_NOT_ALLOWED',
      'The B10 Browser HTTP fault does not accept custom path, status, body, or other parameters',
    );
  }
  const profile = requiredEnvironmentValue(
    environment,
    'B10_BROWSER_HTTP_FAULT_PROFILE',
  );
  const rawNamespace = requiredEnvironmentValue(
    environment,
    'B10_BROWSER_HTTP_FAULT_NAMESPACE',
  );
  const scenarioKey = requiredEnvironmentValue(
    environment,
    'B10_BROWSER_HTTP_FAULT_SCENARIO',
  );
  const routeKey = requiredEnvironmentValue(
    environment,
    'B10_BROWSER_HTTP_FAULT_ROUTE',
  );
  const once = requiredEnvironmentValue(
    environment,
    'B10_BROWSER_HTTP_FAULT_ONCE',
  );
  if (
    profile !== 'generation-workflow' ||
    scenarioKey !== 'latest_lifecycle' ||
    routeKey !== 'latest_failure' ||
    once !== 'true'
  ) {
    throw faultError(
      'B10_BROWSER_HTTP_FAULT_TARGET_NOT_ALLOWED',
      'The B10 Browser HTTP fault supports only the fixed generation-workflow latest-failure target and one-shot mode',
    );
  }
  if (
    runtime.nodeEnv !== 'test' ||
    runtime.databasePurpose !== 'browser_acceptance' ||
    runtime.databaseName !== 'cogmemory_ad_browser_test'
  ) {
    throw faultError(
      'B10_BROWSER_HTTP_FAULT_ENVIRONMENT_UNSAFE',
      'The B10 Browser HTTP fault requires the isolated Browser acceptance runtime',
    );
  }
  return {
    profile,
    namespace: validateB10Namespace(profile, rawNamespace),
    scenarioKey,
    routeKey,
    fixturePassword: requireB10FixturePassword(
      environment.B10_FIXTURE_PASSWORD,
    ),
  };
}

export function createB10BrowserHttpFaultMiddleware(
  target: B10BrowserHttpFaultTarget,
): RequestHandler {
  if (
    target.profile !== 'generation-workflow' ||
    target.scenarioKey !== 'latest_lifecycle' ||
    target.routeKey !== 'latest_failure' ||
    target.method !== 'GET' ||
    !TARGET_PATH_PATTERN.test(target.path)
  ) {
    throw faultError(
      'B10_BROWSER_HTTP_FAULT_TARGET_INVALID',
      'The internally resolved B10 Browser HTTP fault target is invalid',
    );
  }
  let consumed = false;
  return (request: Request, response: Response, next: NextFunction): void => {
    if (
      consumed ||
      request.method !== target.method ||
      request.originalUrl !== target.path
    ) {
      next();
      return;
    }
    consumed = true;
    response.status(500).json({
      statusCode: 500,
      timestamp: new Date().toISOString(),
      path: SAFE_LATEST_PATH,
      message: 'Internal server error',
    });
  };
}
