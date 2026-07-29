import {
  B12_PROFILES,
  B12_ROLES,
  B12FixtureError,
  type B12AuditContractEntry,
  type B12AuditId,
  type B12PreparedState,
  type B12Profile,
  type B12Role,
  type B12RouteDefinition,
  type B12RuntimeEnvironment,
  type B12ScenarioDefinition,
  type B12StageTransition,
} from './fixture-types';

export const B12_DEFAULT_NAMESPACES: Record<B12Profile, string> = {
  'core-workflow': 'b12c-fixture-contract',
  'resilience-security': 'b12r-fixture-contract',
};

export const B12_NAMESPACE_MAX_LENGTH = 36;

export const B12_AUDIT_IDS: readonly B12AuditId[] = Array.from(
  { length: 88 },
  (_, index): B12AuditId => `B12-${String(index + 1).padStart(2, '0')}`,
);

function route(
  definition: Omit<
    B12RouteDefinition,
    'automaticWriteRetry' | 'boundaryType' | 'controlledPublicResponseVariant'
  > &
    Partial<
      Pick<
        B12RouteDefinition,
        'boundaryType' | 'controlledPublicResponseVariant'
      >
    >,
): B12RouteDefinition {
  return {
    ...definition,
    boundaryType: definition.boundaryType ?? 'none',
    controlledPublicResponseVariant:
      definition.controlledPublicResponseVariant ?? 'none',
    automaticWriteRetry: false,
  };
}

const CORE_SCENARIOS: readonly B12ScenarioDefinition[] = [
  {
    profile: 'core-workflow',
    scenarioKey: 'eligibility-state',
    ordinal: 1,
    routes: [
      route({
        key: 'draft-no-entry',
        primaryAuditIds: ['B12-01'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'draft',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: 'legal draft remains unchanged',
        requiresIndependentSession: false,
      }),
      route({
        key: 'pending-no-entry',
        primaryAuditIds: ['B12-02'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'pending_confirmation',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'legal pending report remains unchanged and unlocked',
        requiresIndependentSession: false,
      }),
      route({
        key: 'confirmed-doctor-entry',
        primaryAuditIds: ['B12-03', 'B12-04', 'B12-09', 'B12-10', 'B12-11'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'confirmed status and unlocked fact remain unchanged',
        requiresIndependentSession: false,
      }),
      route({
        key: 'confirmed-admin-entry',
        primaryAuditIds: ['B12-05'],
        supportingAuditIds: [],
        primaryRole: 'admin',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: 'admin eligibility produces no write',
        requiresIndependentSession: false,
      }),
      route({
        key: 'denied-role-entry',
        primaryAuditIds: ['B12-06', 'B12-07', 'B12-08'],
        supportingAuditIds: [],
        primaryRole: 'nurse',
        secondaryRole: 'research_assistant',
        preparedState: 'confirmed_unlocked',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'nurse, research assistant, and system role checks produce no write',
        requiresIndependentSession: true,
      }),
      route({
        key: 'quality-not-passed',
        primaryAuditIds: ['B12-12'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_quality_blocked',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'legal non-passed quality report remains unlocked',
        requiresIndependentSession: false,
      }),
      route({
        key: 'finality-inconsistent',
        primaryAuditIds: ['B12-13'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        boundaryType: 'controlled_public_read_boundary',
        controlledPublicResponseVariant: 'is_final_false',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'single initial latest GET may change only public isFinal; database remains exact',
        requiresIndependentSession: false,
      }),
      route({
        key: 'confirmation-missing',
        primaryAuditIds: ['B12-14'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_confirmation_missing',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'confirmed report with missing confirmation remains unlocked',
        requiresIndependentSession: false,
      }),
      route({
        key: 'visit-locked-v1',
        primaryAuditIds: ['B12-15'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_v1_visit_locked',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'ordinary V1 remains unlocked while locked Visit blocks first lock',
        requiresIndependentSession: false,
      }),
      route({
        key: 'visit-voided-v1',
        primaryAuditIds: [],
        supportingAuditIds: ['B12-15'],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_v1_visit_voided',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'ordinary V1 remains unlocked while voided Visit blocks first lock',
        requiresIndependentSession: false,
      }),
      route({
        key: 'already-locked-no-repeat',
        primaryAuditIds: ['B12-16'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_locked',
        allowedStages: [],
        expectedProductMutationClass: 'already_locked_readonly',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'legal A22 lock remains exact with no repeat entry',
        requiresIndependentSession: false,
      }),
      route({
        key: 'lock-without-locked-at-warning',
        primaryAuditIds: ['B12-17'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_locked',
        boundaryType: 'controlled_public_read_boundary',
        controlledPublicResponseVariant: 'top_level_locked_at_null',
        allowedStages: [],
        expectedProductMutationClass: 'already_locked_readonly',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'single initial latest GET may null only public lockedAt; database remains exact',
        requiresIndependentSession: false,
      }),
      route({
        key: 'locked-at-without-lock-warning',
        primaryAuditIds: ['B12-18'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_locked',
        boundaryType: 'controlled_public_read_boundary',
        controlledPublicResponseVariant: 'lock_summary_null',
        allowedStages: [],
        expectedProductMutationClass: 'already_locked_readonly',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'single initial latest GET may null only public lock; database remains exact',
        requiresIndependentSession: false,
      }),
      route({
        key: 'lock-time-mismatch-warning',
        primaryAuditIds: ['B12-19'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_locked',
        boundaryType: 'controlled_public_read_boundary',
        controlledPublicResponseVariant: 'lock_time_mismatch',
        allowedStages: [],
        expectedProductMutationClass: 'already_locked_readonly',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'single initial latest GET may change only public lock.lockedAt; database remains exact',
        requiresIndependentSession: false,
      }),
    ],
  },
  {
    profile: 'core-workflow',
    scenarioKey: 'lock-form-contract',
    ordinal: 2,
    routes: [
      route({
        key: 'irreversible-disclosure',
        primaryAuditIds: [
          'B12-20',
          'B12-21',
          'B12-22',
          'B12-23',
          'B12-24',
          'B12-25',
          'B12-28',
          'B12-29',
        ],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'disclosure inspection produces no write',
        requiresIndependentSession: false,
      }),
      route({
        key: 'validation-request-contract',
        primaryAuditIds: ['B12-26', 'B12-27', 'B12-30', 'B12-31', 'B12-32'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'validation and request inspection produce no write',
        requiresIndependentSession: false,
      }),
    ],
  },
  {
    profile: 'core-workflow',
    scenarioKey: 'success-idempotency',
    ordinal: 3,
    routes: [
      route({
        key: 'doctor-lock-success',
        primaryAuditIds: [
          'B12-33',
          'B12-34',
          'B12-35',
          'B12-36',
          'B12-37',
          'B12-38',
          'B12-39',
          'B12-40',
          'B12-44',
          'B12-46',
          'B12-47',
          'B12-48',
        ],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: [],
        expectedProductMutationClass: 'lock_once_doctor',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'one legal A22 doctor lock and no other mutation',
        requiresIndependentSession: false,
      }),
      route({
        key: 'admin-lock-success',
        primaryAuditIds: ['B12-45'],
        supportingAuditIds: ['B12-35', 'B12-36', 'B12-37', 'B12-38'],
        primaryRole: 'admin',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: [],
        expectedProductMutationClass: 'lock_once_admin',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'one legal A22 admin lock and no other mutation',
        requiresIndependentSession: false,
      }),
      route({
        key: 'already-locked-idempotency',
        primaryAuditIds: ['B12-41', 'B12-42', 'B12-43'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'historical_locked_fallback',
        allowedStages: [],
        expectedProductMutationClass: 'already_locked_readonly',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'historical fallback idempotency produces zero database mutation',
        requiresIndependentSession: false,
      }),
    ],
  },
  {
    profile: 'core-workflow',
    scenarioKey: 'conflict',
    ordinal: 4,
    routes: [
      route({
        key: 'lock-conflict-continue',
        primaryAuditIds: [
          'B12-49',
          'B12-50',
          'B12-51',
          'B12-52',
          'B12-53',
          'B12-54',
        ],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: ['lock-conflict-touch'],
        expectedProductMutationClass: 'fixture_touch_plus_lock_once',
        expectedFixtureOwnedMutationClass: 'fixture_conflict_touch_only',
        postBrowserFinalStateContract:
          'one fixture touch followed by one explicit doctor A22 lock',
        requiresIndependentSession: false,
      }),
      route({
        key: 'lock-conflict-latest-locked',
        primaryAuditIds: ['B12-55'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: 'doctor',
        preparedState: 'confirmed_unlocked',
        allowedStages: ['lock-conflict-latest-locked-touch'],
        expectedProductMutationClass: 'fixture_touch_plus_secondary_lock_once',
        expectedFixtureOwnedMutationClass:
          'fixture_conflict_latest_locked_touch_only',
        postBrowserFinalStateContract:
          'one fixture touch and only the secondary Context A22 lock',
        requiresIndependentSession: true,
      }),
    ],
  },
  {
    profile: 'core-workflow',
    scenarioKey: 'locked-readonly',
    ordinal: 5,
    routes: [
      route({
        key: 'locked-readonly-semantics',
        primaryAuditIds: [
          'B12-64',
          'B12-65',
          'B12-66',
          'B12-67',
          'B12-68',
          'B12-69',
          'B12-70',
        ],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_locked',
        allowedStages: [],
        expectedProductMutationClass: 'already_locked_readonly',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'locked report and orthogonal lifecycle facts remain exact',
        requiresIndependentSession: false,
      }),
    ],
  },
];

const RESILIENCE_SCENARIOS: readonly B12ScenarioDefinition[] = [
  {
    profile: 'resilience-security',
    scenarioKey: 'error-contract',
    ordinal: 1,
    routes: [
      route({
        key: 'audit-unavailable',
        primaryAuditIds: ['B12-56'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: ['lock-audit-unavailable'],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'fixture_audit_unavailable_only',
        postBrowserFinalStateContract:
          'fixed inconsistent fixture fact only; product lock count remains zero',
        requiresIndependentSession: false,
      }),
      route({
        key: 'metadata-unsupported',
        primaryAuditIds: ['B12-57'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: ['lock-metadata-unsupported'],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'fixture_metadata_unsupported_only',
        postBrowserFinalStateContract:
          'fixed unsupported metadata fixture fact only; product lock count remains zero',
        requiresIndependentSession: false,
      }),
    ],
  },
  {
    profile: 'resilience-security',
    scenarioKey: 'authorization',
    ordinal: 2,
    routes: [
      route({
        key: 'forbidden-lock',
        primaryAuditIds: ['B12-58'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: ['forbidden-lock-role'],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'fixture_forbidden_role_only',
        postBrowserFinalStateContract:
          'fixture role change only and report unchanged after 403',
        requiresIndependentSession: false,
      }),
      route({
        key: 'unauthorized-lock',
        primaryAuditIds: ['B12-59'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: '401 produces zero business mutation',
        requiresIndependentSession: false,
      }),
    ],
  },
  {
    profile: 'resilience-security',
    scenarioKey: 'network-failure',
    ordinal: 3,
    routes: [
      route({
        key: 'lock-network-abort',
        primaryAuditIds: ['B12-60'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'aborted lock is not retried and produces zero database mutation',
        requiresIndependentSession: false,
      }),
    ],
  },
  {
    profile: 'resilience-security',
    scenarioKey: 'client-boundary',
    ordinal: 4,
    routes: [
      route({
        key: 'lock-beforeunload',
        primaryAuditIds: ['B12-61'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'beforeunload inspection produces no write',
        requiresIndependentSession: false,
      }),
      route({
        key: 'storage-refresh',
        primaryAuditIds: ['B12-62', 'B12-63'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'Storage and refresh inspection produces no write',
        requiresIndependentSession: false,
      }),
    ],
  },
  {
    profile: 'resilience-security',
    scenarioKey: 'action-ownership',
    ordinal: 5,
    routes: [
      route({
        key: 'unsupported-actions',
        primaryAuditIds: [
          'B12-71',
          'B12-72',
          'B12-73',
          'B12-74',
          'B12-75',
          'B12-76',
          'B12-77',
        ],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'unsupported and orthogonal actions produce zero mutation',
        requiresIndependentSession: false,
      }),
    ],
  },
  {
    profile: 'resilience-security',
    scenarioKey: 'presentation-safety',
    ordinal: 6,
    routes: [
      route({
        key: 'non-diagnostic-language',
        primaryAuditIds: ['B12-78', 'B12-79', 'B12-80'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'presentation language inspection produces no write',
        requiresIndependentSession: false,
      }),
      route({
        key: 'responsive-accessibility',
        primaryAuditIds: ['B12-81', 'B12-82'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'viewport and accessibility inspection produces no write',
        requiresIndependentSession: false,
      }),
      route({
        key: 'auth-route-deidentified',
        primaryAuditIds: ['B12-83', 'B12-84', 'B12-85'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed_unlocked',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'auth, existing route, and de-identification inspection produce no write',
        requiresIndependentSession: false,
      }),
    ],
  },
];

export const B12_SCENARIOS: readonly B12ScenarioDefinition[] = [
  ...CORE_SCENARIOS,
  ...RESILIENCE_SCENARIOS,
];

export function scenariosFor(
  profile: B12Profile,
): readonly B12ScenarioDefinition[] {
  return B12_SCENARIOS.filter((scenario) => scenario.profile === profile);
}

export function routesFor(profile: B12Profile): readonly B12RouteDefinition[] {
  return scenariosFor(profile).flatMap(({ routes }) => routes);
}

export function routeFor(
  profile: B12Profile,
  scenarioKey: string,
  routeKey: string,
): B12RouteDefinition {
  const routeValue = scenariosFor(profile)
    .find((scenario) => scenario.scenarioKey === scenarioKey)
    ?.routes.find((candidate) => candidate.key === routeKey);
  if (!routeValue) {
    throw new B12FixtureError(
      'B12_FIXTURE_ROUTE_NOT_ALLOWED',
      'Scenario and route must match the fixed B12 allowlist',
      profile,
      scenarioKey,
      routeKey,
    );
  }
  return routeValue;
}

const PRIMARY_OWNER_BY_ID = new Map<
  B12AuditId,
  {
    profile: B12Profile;
    scenarioKey: string;
    route: B12RouteDefinition;
  }
>();

for (const scenario of B12_SCENARIOS) {
  for (const routeValue of scenario.routes) {
    for (const auditId of routeValue.primaryAuditIds) {
      if (PRIMARY_OWNER_BY_ID.has(auditId)) {
        throw new Error(`Duplicate B12 primary owner for ${auditId}`);
      }
      PRIMARY_OWNER_BY_ID.set(auditId, {
        profile: scenario.profile,
        scenarioKey: scenario.scenarioKey,
        route: routeValue,
      });
    }
  }
}

const AUDIT_ROLE_OVERRIDES: Partial<Record<B12AuditId, B12Role>> = {
  'B12-06': 'nurse',
  'B12-07': 'research_assistant',
  'B12-08': 'system',
};

const STATIC_GATES: Readonly<Record<B12AuditId, string>> = {
  'B12-86': 'frontend-lint',
  'B12-87': 'frontend-typecheck',
  'B12-88': 'frontend-build',
};

export const B12_AUDIT_MATRIX: readonly B12AuditContractEntry[] =
  B12_AUDIT_IDS.map((auditId) => {
    const staticScenario = STATIC_GATES[auditId];
    if (staticScenario) {
      return {
        auditId,
        ownerType: 'static_gate',
        profile: 'static-gate',
        scenarioKey: staticScenario,
        routeKey: null,
        primaryRole: null,
        secondaryRole: null,
        preparedState: 'static_gate',
        boundaryType: 'none',
        controlledPublicResponseVariant: 'none',
        allowedStages: [],
        expectedProductMutationClass: 'static_gate',
        expectedFixtureOwnedMutationClass: 'static_gate',
        postBrowserFinalStateContract:
          'close only on the final B12 Browser asset code state',
      } satisfies B12AuditContractEntry;
    }
    const owner = PRIMARY_OWNER_BY_ID.get(auditId);
    if (!owner) throw new Error(`Missing B12 primary owner for ${auditId}`);
    return {
      auditId,
      ownerType: 'browser_route',
      profile: owner.profile,
      scenarioKey: owner.scenarioKey,
      routeKey: owner.route.key,
      primaryRole: AUDIT_ROLE_OVERRIDES[auditId] ?? owner.route.primaryRole,
      secondaryRole: owner.route.secondaryRole,
      preparedState: owner.route.preparedState,
      boundaryType: owner.route.boundaryType,
      controlledPublicResponseVariant:
        owner.route.controlledPublicResponseVariant,
      allowedStages: owner.route.allowedStages,
      expectedProductMutationClass: owner.route.expectedProductMutationClass,
      expectedFixtureOwnedMutationClass:
        owner.route.expectedFixtureOwnedMutationClass,
      postBrowserFinalStateContract: owner.route.postBrowserFinalStateContract,
    } satisfies B12AuditContractEntry;
  });

export function auditMatrixFor(
  profile: B12AuditContractEntry['profile'],
): readonly B12AuditContractEntry[] {
  return B12_AUDIT_MATRIX.filter((entry) => entry.profile === profile);
}

export function validateB12Profile(value: string): B12Profile {
  if (!B12_PROFILES.includes(value as B12Profile)) {
    throw new B12FixtureError(
      'B12_FIXTURE_PROFILE_INVALID',
      'Profile must be core-workflow or resilience-security',
    );
  }
  return value as B12Profile;
}

function namespacePrefixFor(profile: B12Profile): string {
  return profile === 'core-workflow' ? 'b12c-' : 'b12r-';
}

export function validateB12Namespace(
  profile: B12Profile,
  value: string,
): string {
  const prefix = namespacePrefixFor(profile);
  if (
    value.length < 9 ||
    value.length > B12_NAMESPACE_MAX_LENGTH ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
    !value.startsWith(prefix)
  ) {
    throw new B12FixtureError(
      'B12_FIXTURE_NAMESPACE_INVALID',
      `Namespace must use the ${prefix} profile prefix and lowercase segments`,
      profile,
    );
  }
  return value;
}

export function validateB12Role(value: string): B12Role {
  if (!B12_ROLES.includes(value as B12Role)) {
    throw new B12FixtureError(
      'B12_FIXTURE_ROLE_INVALID',
      'Role must be one of the five fixed B12 fixture roles',
    );
  }
  return value as B12Role;
}

const STAGE_TARGETS = [
  {
    profile: 'core-workflow',
    scenarioKey: 'conflict',
    routeKey: 'lock-conflict-continue',
    transition: 'lock-conflict-touch',
    role: 'doctor',
  },
  {
    profile: 'core-workflow',
    scenarioKey: 'conflict',
    routeKey: 'lock-conflict-latest-locked',
    transition: 'lock-conflict-latest-locked-touch',
    role: 'doctor',
  },
  {
    profile: 'resilience-security',
    scenarioKey: 'error-contract',
    routeKey: 'audit-unavailable',
    transition: 'lock-audit-unavailable',
    role: 'doctor',
  },
  {
    profile: 'resilience-security',
    scenarioKey: 'error-contract',
    routeKey: 'metadata-unsupported',
    transition: 'lock-metadata-unsupported',
    role: 'doctor',
  },
  {
    profile: 'resilience-security',
    scenarioKey: 'authorization',
    routeKey: 'forbidden-lock',
    transition: 'forbidden-lock-role',
    role: 'doctor',
  },
] as const;

export function assertB12StageTarget(input: {
  profile: B12Profile;
  scenarioKey: string | undefined;
  routeKey: string | undefined;
  transition: string | undefined;
  role: B12Role | undefined;
}): asserts input is {
  profile: B12Profile;
  scenarioKey: string;
  routeKey: string;
  transition: B12StageTransition;
  role: B12Role;
} {
  const matched = STAGE_TARGETS.some(
    (target) =>
      target.profile === input.profile &&
      target.scenarioKey === input.scenarioKey &&
      target.routeKey === input.routeKey &&
      target.transition === input.transition &&
      target.role === input.role,
  );
  if (!matched) {
    throw new B12FixtureError(
      'B12_FIXTURE_STAGE_TARGET_NOT_ALLOWED',
      'Stage must match one of the five fixed B12 transition allowlist entries',
      input.profile,
      input.scenarioKey,
      input.routeKey,
    );
  }
}

function runtimeRolesFor(routeValue: B12RouteDefinition): readonly B12Role[] {
  if (routeValue.key === 'denied-role-entry') {
    return ['nurse', 'research_assistant', 'system'];
  }
  return [
    routeValue.primaryRole,
    ...(routeValue.secondaryRole ? [routeValue.secondaryRole] : []),
  ];
}

export function assertB12RuntimeTarget(input: {
  profile: B12Profile;
  scenarioKey: string;
  routeKey: string;
  role: B12Role;
}): B12RouteDefinition {
  const routeValue = routeFor(input.profile, input.scenarioKey, input.routeKey);
  if (!runtimeRolesFor(routeValue).includes(input.role)) {
    throw new B12FixtureError(
      'B12_FIXTURE_RUNTIME_ROLE_NOT_ALLOWED',
      'Runtime role must match the fixed route role contract',
      input.profile,
      input.scenarioKey,
      input.routeKey,
    );
  }
  return routeValue;
}

export function requireB12FixturePassword(value: string | undefined): string {
  if (!value || value.length < 16) {
    throw new B12FixtureError(
      'B12_FIXTURE_PASSWORD_REQUIRED',
      'B12_FIXTURE_PASSWORD must be provided through the process environment',
    );
  }
  return value;
}

export function assertB12PreImportEnvironment(
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== 'test') {
    throw new B12FixtureError(
      'B12_FIXTURE_ENVIRONMENT_UNSAFE',
      'B12 fixtures require NODE_ENV=test before application import',
    );
  }
}

export function assertB12RuntimeEnvironment(env: B12RuntimeEnvironment): void {
  const databaseMatchesPurpose =
    (env.databasePurpose === 'browser_acceptance' &&
      env.databaseName === 'cogmemory_ad_browser_test') ||
    (env.databasePurpose === 'standard_test' &&
      env.databaseName === 'cogmemory_ad_test');
  if (
    env.nodeEnv !== 'test' ||
    env.appEnv !== 'test' ||
    !databaseMatchesPurpose ||
    env.storageDriver !== 'fake' ||
    env.llmProvider !== 'stub' ||
    env.smsProvider !== 'stub' ||
    env.sessionCookieSecure === true
  ) {
    throw new B12FixtureError(
      'B12_FIXTURE_ENVIRONMENT_UNSAFE',
      'B12 fixtures require the exact isolated test database and fake or stub external services',
    );
  }
}

function roleSegment(role: B12Role): string {
  return role.replace(/_/g, '-');
}

function profileCode(profile: B12Profile): 'b12c' | 'b12r' {
  return profile === 'core-workflow' ? 'b12c' : 'b12r';
}

export function accountNameFor(
  profile: B12Profile,
  namespace: string,
  role: B12Role,
): string {
  return `${profileCode(profile)}-${namespace}-${roleSegment(role)}`;
}

export function displayNameFor(profile: B12Profile, role: B12Role): string {
  return `B12 synthetic ${profileCode(profile)} ${roleSegment(role)}`;
}

export function routeOrdinalFor(
  profile: B12Profile,
  scenarioKey: string,
  routeKey: string,
): number {
  const flattened = scenariosFor(profile).flatMap((scenario) =>
    scenario.routes.map((routeValue) => ({
      scenarioKey: scenario.scenarioKey,
      routeKey: routeValue.key,
    })),
  );
  const index = flattened.findIndex(
    (entry) => entry.scenarioKey === scenarioKey && entry.routeKey === routeKey,
  );
  if (index < 0) {
    throw new B12FixtureError(
      'B12_FIXTURE_ROUTE_NOT_ALLOWED',
      'Route ordinal requires a fixed B12 route',
      profile,
      scenarioKey,
      routeKey,
    );
  }
  return index + 1;
}

function uppercaseNamespace(namespace: string): string {
  return namespace.replace(/-/g, '').toUpperCase();
}

export function subjectCodeFor(
  profile: B12Profile,
  namespace: string,
  scenarioKey: string,
  routeKey: string,
): string {
  return `${profileCode(profile).toUpperCase()}-${uppercaseNamespace(
    namespace,
  )}-${String(routeOrdinalFor(profile, scenarioKey, routeKey)).padStart(2, '0')}`;
}

export function visitCodeFor(
  profile: B12Profile,
  namespace: string,
  scenarioKey: string,
  routeKey: string,
): string {
  return `${subjectCodeFor(profile, namespace, scenarioKey, routeKey)}-V1`;
}

export function instanceCodeFor(
  profile: B12Profile,
  namespace: string,
  scenarioKey: string,
  routeKey: string,
): string {
  return `${subjectCodeFor(profile, namespace, scenarioKey, routeKey)}-MMSE-1`;
}

export function reportCodeFor(
  profile: B12Profile,
  namespace: string,
  scenarioKey: string,
  routeKey: string,
): string {
  return `${subjectCodeFor(profile, namespace, scenarioKey, routeKey)}-REPORT-V1`;
}

export function reportStateCountsFor(
  profile: B12Profile,
): Record<B12PreparedState, number> {
  const states: B12PreparedState[] = [
    'draft',
    'pending_confirmation',
    'confirmed_unlocked',
    'confirmed_quality_blocked',
    'confirmed_confirmation_missing',
    'confirmed_v1_visit_locked',
    'confirmed_v1_visit_voided',
    'confirmed_locked',
    'historical_locked_fallback',
  ];
  const counts = Object.fromEntries(
    states.map((state) => [state, 0]),
  ) as Record<B12PreparedState, number>;
  for (const routeValue of routesFor(profile)) {
    counts[routeValue.preparedState] += 1;
  }
  return counts;
}

export function assertB12Contract(): void {
  const matrixIds = B12_AUDIT_MATRIX.map(({ auditId }) => auditId);
  const browserEntries = B12_AUDIT_MATRIX.filter(
    ({ ownerType }) => ownerType === 'browser_route',
  );
  const staticEntries = B12_AUDIT_MATRIX.filter(
    ({ ownerType }) => ownerType === 'static_gate',
  );
  const allRoutes = B12_SCENARIOS.flatMap((scenario) =>
    scenario.routes.map((routeValue) => ({ scenario, routeValue })),
  );
  const primaryIds = allRoutes.flatMap(
    ({ routeValue }) => routeValue.primaryAuditIds,
  );
  const routeKeys = allRoutes.map(
    ({ scenario, routeValue }) =>
      `${scenario.profile}/${scenario.scenarioKey}/${routeValue.key}`,
  );
  const controlledRoutes = allRoutes
    .filter(
      ({ routeValue }) =>
        routeValue.boundaryType === 'controlled_public_read_boundary',
    )
    .map(({ routeValue }) => routeValue.key)
    .sort();
  const stageTargets = allRoutes.flatMap(({ scenario, routeValue }) =>
    routeValue.allowedStages.map(
      (transition) =>
        `${scenario.profile}/${scenario.scenarioKey}/${routeValue.key}/${transition}`,
    ),
  );
  if (
    B12_AUDIT_IDS.length !== 88 ||
    B12_AUDIT_MATRIX.length !== 88 ||
    matrixIds.length !== new Set(matrixIds).size ||
    matrixIds.some((id, index) => id !== B12_AUDIT_IDS[index]) ||
    browserEntries.length !== 85 ||
    staticEntries.length !== 3 ||
    staticEntries.map(({ auditId }) => auditId).join('|') !==
      'B12-86|B12-87|B12-88' ||
    staticEntries.some(({ routeKey }) => routeKey !== null) ||
    auditMatrixFor('core-workflow').length !== 62 ||
    auditMatrixFor('resilience-security').length !== 23 ||
    primaryIds.length !== 85 ||
    primaryIds.length !== new Set(primaryIds).size ||
    routeKeys.length !== 33 ||
    routeKeys.length !== new Set(routeKeys).size ||
    scenariosFor('core-workflow').length !== 5 ||
    routesFor('core-workflow').length !== 22 ||
    scenariosFor('resilience-security').length !== 6 ||
    routesFor('resilience-security').length !== 11 ||
    controlledRoutes.join('|') !==
      'finality-inconsistent|lock-time-mismatch-warning|lock-without-locked-at-warning|locked-at-without-lock-warning' ||
    stageTargets.length !== 5 ||
    allRoutes.some(
      ({ routeValue }) =>
        routeValue.automaticWriteRetry !== false ||
        (routeValue.boundaryType === 'none' &&
          routeValue.controlledPublicResponseVariant !== 'none') ||
        (routeValue.boundaryType === 'controlled_public_read_boundary' &&
          routeValue.controlledPublicResponseVariant === 'none'),
    ) ||
    B12_DEFAULT_NAMESPACES['core-workflow'] ===
      B12_DEFAULT_NAMESPACES['resilience-security']
  ) {
    throw new B12FixtureError(
      'B12_FIXTURE_CONTRACT_INVALID',
      'The fixed B12 88-ID ownership, profile, route, boundary, and Stage contract is invalid',
    );
  }
}
