import { auditMatrixFor, scenariosFor } from './fixture-contract';
import {
  B11FixtureError,
  type B11Profile,
  type B11ResourceCounts,
  type B11SafeManifest,
  type B11SafeRoleManifest,
  type B11VerifyPhase,
} from './fixture-types';

const ALLOWED_MANIFEST_KEYS = new Set([
  'version',
  'batch',
  'namespace',
  'databaseName',
  'profile',
  'phase',
  'auditIdCount',
  'scenarioCount',
  'routeCount',
  'roles',
  'role',
  'loginIdentifier',
  'displayName',
  'scenarios',
  'scenarioKey',
  'routes',
  'routeKey',
  'primaryAuditIds',
  'supportingAuditIds',
  'primaryRole',
  'secondaryRole',
  'preparedState',
  'allowedStages',
  'expectedProductMutationClass',
  'expectedFixtureOwnedMutationClass',
  'postBrowserFinalStateContract',
  'requiresIndependentSession',
  'automaticWriteRetry',
  'resourceCounts',
  'users',
  'patients',
  'visits',
  'scaleInstances',
  'clinicalReports',
  'fixtureMarkers',
  'preparedHash',
  'canonicalSeedHash',
  'uniquePrimaryOwners',
  'writableReportsIndependent',
  'canonicalSeedHashUnchanged',
]);

const FORBIDDEN_SAFE_KEYS = new Set([
  'password',
  'passwordHash',
  'cookie',
  'session',
  'token',
  'uri',
  'patientId',
  'visitId',
  'reportId',
  'userId',
  'navigationPath',
  'metadata',
  'sourceIds',
  'objectKey',
  'doctorOpinion',
  'recommendationText',
  'request',
  'response',
]);

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const DYNAMIC_NAVIGATION_PATTERN = /^\/patients\//;
const URI_PATTERN = /mongodb(?:\+srv)?:\/\//i;

function scanSafeValue(
  value: unknown,
  path: string,
  allowedKeys: ReadonlySet<string> | null,
): void {
  if (typeof value === 'string') {
    if (
      OBJECT_ID_PATTERN.test(value) ||
      DYNAMIC_NAVIGATION_PATTERN.test(value) ||
      URI_PATTERN.test(value)
    ) {
      throw new B11FixtureError(
        'B11_FIXTURE_SAFE_OUTPUT_INVALID',
        `Safe output contains a forbidden value at ${path}`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      scanSafeValue(entry, `${path}[${index}]`, allowedKeys),
    );
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (
      FORBIDDEN_SAFE_KEYS.has(key) ||
      (allowedKeys && !allowedKeys.has(key))
    ) {
      throw new B11FixtureError(
        'B11_FIXTURE_SAFE_OUTPUT_INVALID',
        `Safe output contains a forbidden field at ${path}.${key}`,
      );
    }
    scanSafeValue(entry, `${path}.${key}`, allowedKeys);
  }
}

export function assertB11SafeManifest(value: unknown): void {
  scanSafeValue(value, 'manifest', ALLOWED_MANIFEST_KEYS);
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).version !== 1 ||
    (value as Record<string, unknown>).batch !== 'B11'
  ) {
    throw new B11FixtureError(
      'B11_FIXTURE_SAFE_MANIFEST_INVALID',
      'Safe manifest must match the fixed B11 envelope',
    );
  }
}

export function assertB11SafeOutput(value: unknown): void {
  scanSafeValue(value, 'output', null);
}

export function buildB11SafeManifest(input: {
  namespace: string;
  databaseName: string;
  profile: B11Profile;
  phase: B11VerifyPhase;
  roles: readonly B11SafeRoleManifest[];
  resourceCounts: B11ResourceCounts;
  preparedHash: string;
  canonicalSeedHash: string;
}): B11SafeManifest {
  const definitions = scenariosFor(input.profile);
  const scenarios = definitions.map((scenario) => ({
    scenarioKey: scenario.scenarioKey,
    routes: scenario.routes.map((routeValue) => ({
      routeKey: routeValue.key,
      primaryAuditIds: [...routeValue.primaryAuditIds],
      supportingAuditIds: [...routeValue.supportingAuditIds],
      primaryRole: routeValue.primaryRole,
      secondaryRole: routeValue.secondaryRole,
      preparedState: routeValue.preparedState,
      allowedStages: [...routeValue.allowedStages],
      expectedProductMutationClass: routeValue.expectedProductMutationClass,
      expectedFixtureOwnedMutationClass:
        routeValue.expectedFixtureOwnedMutationClass,
      postBrowserFinalStateContract: routeValue.postBrowserFinalStateContract,
      requiresIndependentSession: routeValue.requiresIndependentSession,
      automaticWriteRetry: false as const,
    })),
  }));
  const manifest: B11SafeManifest = {
    version: 1,
    batch: 'B11',
    namespace: input.namespace,
    databaseName: input.databaseName,
    profile: input.profile,
    phase: input.phase,
    auditIdCount: auditMatrixFor(input.profile).length,
    scenarioCount: definitions.length,
    routeCount: definitions.flatMap(({ routes }) => routes).length,
    roles: input.roles,
    scenarios,
    resourceCounts: input.resourceCounts,
    preparedHash: input.preparedHash,
    canonicalSeedHash: input.canonicalSeedHash,
    uniquePrimaryOwners: true,
    writableReportsIndependent: true,
    canonicalSeedHashUnchanged: true,
  };
  assertB11SafeManifest(manifest);
  return manifest;
}
