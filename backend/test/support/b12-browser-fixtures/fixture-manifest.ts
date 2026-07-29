import {
  auditMatrixFor,
  reportStateCountsFor,
  scenariosFor,
} from './fixture-contract';
import {
  B12FixtureError,
  type B12Profile,
  type B12ResourceCounts,
  type B12Role,
  type B12SafeManifest,
  type B12VerifyPhase,
} from './fixture-types';

const ALLOWED_MANIFEST_KEYS = new Set([
  'version',
  'batch',
  'profile',
  'phase',
  'auditIdCount',
  'scenarioCount',
  'routeCount',
  'roles',
  'scenarios',
  'scenarioKey',
  'routes',
  'routeKey',
  'primaryAuditIds',
  'supportingAuditIds',
  'primaryRole',
  'secondaryRole',
  'preparedState',
  'expectedPublicReadOutcome',
  'boundaryType',
  'controlledPublicResponseVariant',
  'allowedStages',
  'expectedProductMutationClass',
  'expectedFixtureOwnedMutationClass',
  'postBrowserFinalStateContract',
  'requiresIndependentSession',
  'automaticWriteRetry',
  'resourceCounts',
  'reportStateCounts',
  'users',
  'patients',
  'visits',
  'scaleInstances',
  'clinicalReports',
  'fixtureMarkers',
  'draft',
  'pending_confirmation',
  'confirmed_unlocked',
  'confirmed_quality_blocked',
  'confirmed_confirmation_missing',
  'confirmed_v1_visit_locked',
  'confirmed_v1_visit_voided',
  'confirmed_locked',
  'historical_locked_fallback',
  'preparedHash',
  'canonicalSeedHash',
  'uniquePrimaryOwners',
  'writableReportsIndependent',
  'canonicalSeedHashUnchanged',
]);

const FORBIDDEN_SAFE_KEYS = new Set([
  'password',
  'passwordhash',
  'cookie',
  'session',
  'token',
  'uri',
  'patientid',
  'visitid',
  'reportid',
  'userid',
  'lockid',
  'navigationpath',
  'metadata',
  'sourceids',
  'objectkey',
  'narrative',
  'doctoropinion',
  'recommendationtext',
  'confirmationnote',
  'locknote',
  'actorid',
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
      throw new B12FixtureError(
        'B12_FIXTURE_SAFE_OUTPUT_INVALID',
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
  if (typeof value !== 'object' || value === null) return;
  for (const [key, entry] of Object.entries(value)) {
    if (
      FORBIDDEN_SAFE_KEYS.has(key.toLowerCase()) ||
      (allowedKeys && !allowedKeys.has(key))
    ) {
      throw new B12FixtureError(
        'B12_FIXTURE_SAFE_OUTPUT_INVALID',
        `Safe output contains a forbidden field at ${path}.${key}`,
      );
    }
    scanSafeValue(entry, `${path}.${key}`, allowedKeys);
  }
}

export function assertB12SafeManifest(value: unknown): void {
  scanSafeValue(value, 'manifest', ALLOWED_MANIFEST_KEYS);
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).version !== 1 ||
    (value as Record<string, unknown>).batch !== 'B12'
  ) {
    throw new B12FixtureError(
      'B12_FIXTURE_SAFE_MANIFEST_INVALID',
      'Safe manifest must match the fixed B12 envelope',
    );
  }
}

export function assertB12SafeOutput(value: unknown): void {
  scanSafeValue(value, 'output', null);
}

export function buildB12SafeManifest(input: {
  profile: B12Profile;
  phase: B12VerifyPhase;
  roles: readonly B12Role[];
  resourceCounts: B12ResourceCounts;
  preparedHash: string;
  canonicalSeedHash: string;
}): B12SafeManifest {
  const definitions = scenariosFor(input.profile);
  const manifest: B12SafeManifest = {
    version: 1,
    batch: 'B12',
    profile: input.profile,
    phase: input.phase,
    auditIdCount: auditMatrixFor(input.profile).length,
    scenarioCount: definitions.length,
    routeCount: definitions.flatMap(({ routes }) => routes).length,
    roles: input.roles,
    scenarios: definitions.map((scenario) => ({
      scenarioKey: scenario.scenarioKey,
      routes: scenario.routes.map((routeValue) => ({
        routeKey: routeValue.key,
        primaryAuditIds: [...routeValue.primaryAuditIds],
        supportingAuditIds: [...routeValue.supportingAuditIds],
        primaryRole: routeValue.primaryRole,
        secondaryRole: routeValue.secondaryRole,
        preparedState: routeValue.preparedState,
        expectedPublicReadOutcome: routeValue.expectedPublicReadOutcome,
        boundaryType: routeValue.boundaryType,
        controlledPublicResponseVariant:
          routeValue.controlledPublicResponseVariant,
        allowedStages: [...routeValue.allowedStages],
        expectedProductMutationClass: routeValue.expectedProductMutationClass,
        expectedFixtureOwnedMutationClass:
          routeValue.expectedFixtureOwnedMutationClass,
        postBrowserFinalStateContract: routeValue.postBrowserFinalStateContract,
        requiresIndependentSession: routeValue.requiresIndependentSession,
        automaticWriteRetry: false,
      })),
    })),
    resourceCounts: input.resourceCounts,
    reportStateCounts: reportStateCountsFor(input.profile),
    preparedHash: input.preparedHash,
    canonicalSeedHash: input.canonicalSeedHash,
    uniquePrimaryOwners: true,
    writableReportsIndependent: true,
    canonicalSeedHashUnchanged: true,
  };
  assertB12SafeManifest(manifest);
  return manifest;
}
