import {
  B11_PROFILES,
  B11_ROLES,
  B11FixtureError,
  type B11AuditContractEntry,
  type B11AuditId,
  type B11Profile,
  type B11Role,
  type B11RouteDefinition,
  type B11RuntimeEnvironment,
  type B11ScenarioDefinition,
  type B11StageTransition,
} from './fixture-types';

export const B11_DEFAULT_NAMESPACES: Record<B11Profile, string> = {
  'core-workflow': 'b11c-fixture-contract',
  'resilience-security': 'b11r-fixture-contract',
};

export const B11_NAMESPACE_MAX_LENGTH = 36;

export const B11_AUDIT_IDS: readonly B11AuditId[] = Array.from(
  { length: 70 },
  (_, index): B11AuditId => `B11-${String(index + 1).padStart(2, '0')}`,
);

function route(
  definition: Omit<B11RouteDefinition, 'automaticWriteRetry'>,
): B11RouteDefinition {
  return { ...definition, automaticWriteRetry: false };
}

const CORE_SCENARIOS: readonly B11ScenarioDefinition[] = [
  {
    profile: 'core-workflow',
    scenarioKey: 'edit-basics',
    ordinal: 1,
    routes: [
      route({
        key: 'system-draft-edit',
        primaryAuditIds: ['B11-01', 'B11-02', 'B11-03', 'B11-04'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'system_draft',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: 'unchanged system draft',
        requiresIndependentSession: false,
      }),
      route({
        key: 'edit-field-validation',
        primaryAuditIds: ['B11-05', 'B11-06', 'B11-07', 'B11-08', 'B11-09'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'system_draft',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: 'validation produces no write',
        requiresIndependentSession: false,
      }),
      route({
        key: 'edit-no-change',
        primaryAuditIds: ['B11-10'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'mixed_draft',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: 'no-change draft remains unchanged',
        requiresIndependentSession: false,
      }),
      route({
        key: 'edit-success',
        primaryAuditIds: [
          'B11-11',
          'B11-12',
          'B11-13',
          'B11-14',
          'B11-15',
          'B11-16',
          'B11-17',
          'B11-18',
          'B11-19',
        ],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'system_draft',
        allowedStages: [],
        expectedProductMutationClass: 'edit_once',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: 'one A21 edit and mixed draft',
        requiresIndependentSession: false,
      }),
    ],
  },
  {
    profile: 'core-workflow',
    scenarioKey: 'edit-concurrency',
    ordinal: 2,
    routes: [
      route({
        key: 'edit-conflict-continue',
        primaryAuditIds: ['B11-20', 'B11-21', 'B11-22', 'B11-23', 'B11-24'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: 'doctor',
        preparedState: 'mixed_draft',
        allowedStages: [],
        expectedProductMutationClass: 'edit_twice_after_conflict_continue',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'two real A21 edits after explicit continue',
        requiresIndependentSession: true,
      }),
      route({
        key: 'edit-audit-limit',
        primaryAuditIds: ['B11-25'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'audit_limit_draft',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: 'exactly 200 edit audits and no write',
        requiresIndependentSession: false,
      }),
      route({
        key: 'edit-read-only-states',
        primaryAuditIds: ['B11-26'],
        supportingAuditIds: ['B11-27'],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'pending_confirmation',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: 'pending report remains read-only',
        requiresIndependentSession: false,
      }),
    ],
  },
  {
    profile: 'core-workflow',
    scenarioKey: 'submission',
    ordinal: 3,
    routes: [
      route({
        key: 'submission-success',
        primaryAuditIds: ['B11-28', 'B11-29', 'B11-30', 'B11-31', 'B11-32'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'mixed_draft',
        allowedStages: [],
        expectedProductMutationClass: 'submit_once',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: 'one A21 submission and pending status',
        requiresIndependentSession: false,
      }),
      route({
        key: 'submission-already-submitted',
        primaryAuditIds: ['B11-33', 'B11-34', 'B11-35'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: 'doctor',
        preparedState: 'mixed_draft',
        allowedStages: [],
        expectedProductMutationClass: 'secondary_submit_only',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: 'secondary Session submits exactly once',
        requiresIndependentSession: true,
      }),
      route({
        key: 'submission-conflict',
        primaryAuditIds: ['B11-36', 'B11-37'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: 'doctor',
        preparedState: 'mixed_draft',
        allowedStages: [],
        expectedProductMutationClass: 'secondary_edit_only',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: 'secondary edit only and no submission',
        requiresIndependentSession: true,
      }),
    ],
  },
  {
    profile: 'core-workflow',
    scenarioKey: 'confirmation',
    ordinal: 4,
    routes: [
      route({
        key: 'confirmation-role-visibility',
        primaryAuditIds: ['B11-38', 'B11-39', 'B11-40', 'B11-41'],
        supportingAuditIds: [],
        primaryRole: 'nurse',
        secondaryRole: 'research_assistant',
        preparedState: 'pending_confirmation',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: 'role visibility produces no write',
        requiresIndependentSession: true,
      }),
      route({
        key: 'confirmation-doctor-success',
        primaryAuditIds: [
          'B11-42',
          'B11-43',
          'B11-44',
          'B11-46',
          'B11-47',
          'B11-48',
          'B11-49',
        ],
        supportingAuditIds: ['B11-45'],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'pending_confirmation',
        allowedStages: [],
        expectedProductMutationClass: 'confirm_once',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'one doctor confirmation and server finality',
        requiresIndependentSession: false,
      }),
      route({
        key: 'confirmation-admin-success',
        primaryAuditIds: ['B11-45'],
        supportingAuditIds: [],
        primaryRole: 'admin',
        secondaryRole: null,
        preparedState: 'pending_confirmation',
        allowedStages: [],
        expectedProductMutationClass: 'confirm_once',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'one admin confirmation and confirmed status',
        requiresIndependentSession: false,
      }),
      route({
        key: 'confirmation-already-confirmed',
        primaryAuditIds: ['B11-50'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: 'doctor',
        preparedState: 'pending_confirmation',
        allowedStages: [],
        expectedProductMutationClass: 'secondary_confirm_only',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'secondary Session confirms exactly once',
        requiresIndependentSession: true,
      }),
      route({
        key: 'confirmation-conflict',
        primaryAuditIds: ['B11-51', 'B11-52'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'pending_confirmation',
        allowedStages: ['confirmation-conflict-touch'],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass:
          'fixture_confirmation_conflict_touch_only',
        postBrowserFinalStateContract: 'fixture touch only and no confirmation',
        requiresIndependentSession: false,
      }),
    ],
  },
  {
    profile: 'core-workflow',
    scenarioKey: 'final-readonly',
    ordinal: 5,
    routes: [
      route({
        key: 'confirmed-readonly',
        primaryAuditIds: ['B11-27', 'B11-53'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'confirmed',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'confirmed report remains unlocked and read-only',
        requiresIndependentSession: false,
      }),
      route({
        key: 'archived-readonly',
        primaryAuditIds: ['B11-54'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'archived',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: 'archived report remains read-only',
        requiresIndependentSession: false,
      }),
      route({
        key: 'corrected-readonly',
        primaryAuditIds: [],
        supportingAuditIds: ['B11-54'],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'corrected',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: 'corrected report remains read-only',
        requiresIndependentSession: false,
      }),
      route({
        key: 'voided-readonly',
        primaryAuditIds: ['B11-55'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'voided',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: 'voided report remains read-only',
        requiresIndependentSession: false,
      }),
      route({
        key: 'clinician-content-boundary',
        primaryAuditIds: ['B11-60', 'B11-61', 'B11-62'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'mixed_draft',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'clinician content remains separately owned',
        requiresIndependentSession: false,
      }),
    ],
  },
];

const RESILIENCE_SCENARIOS: readonly B11ScenarioDefinition[] = [
  {
    profile: 'resilience-security',
    scenarioKey: 'action-ownership',
    ordinal: 1,
    routes: [
      route({
        key: 'unsupported-sibling-actions',
        primaryAuditIds: ['B11-56', 'B11-57', 'B11-58', 'B11-59'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'mixed_draft',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'B11 actions do not initiate A22-A25 or unrelated output actions',
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
        key: 'unauthorized-action',
        primaryAuditIds: ['B11-63'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'mixed_draft',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: '401 produces zero business mutation',
        requiresIndependentSession: false,
      }),
      route({
        key: 'forbidden-confirm',
        primaryAuditIds: ['B11-64'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'pending_confirmation',
        allowedStages: ['forbidden-confirm-role'],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'fixture_forbidden_role_only',
        postBrowserFinalStateContract:
          'fixture role change only and report unchanged after 403',
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
        key: 'edit-network-abort',
        primaryAuditIds: ['B11-65'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'mixed_draft',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'aborted edit is not retried and writes nothing',
        requiresIndependentSession: false,
      }),
      route({
        key: 'submit-network-abort',
        primaryAuditIds: [],
        supportingAuditIds: ['B11-65'],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'mixed_draft',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'aborted submit is not retried and writes nothing',
        requiresIndependentSession: false,
      }),
      route({
        key: 'confirm-network-abort',
        primaryAuditIds: [],
        supportingAuditIds: ['B11-65'],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'pending_confirmation',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'aborted confirm is not retried and writes nothing',
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
        key: 'storage-and-refresh',
        primaryAuditIds: ['B11-66', 'B11-67'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'mixed_draft',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'storage and refresh checks produce no write',
        requiresIndependentSession: false,
      }),
      route({
        key: 'responsive-accessibility',
        primaryAuditIds: ['B11-68'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'pending_confirmation',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract:
          'viewport and accessibility checks produce no write',
        requiresIndependentSession: false,
      }),
      route({
        key: 'stale-disabled',
        primaryAuditIds: ['B11-69'],
        supportingAuditIds: [],
        primaryRole: 'doctor',
        secondaryRole: null,
        preparedState: 'mixed_draft',
        allowedStages: [],
        expectedProductMutationClass: 'none',
        expectedFixtureOwnedMutationClass: 'none',
        postBrowserFinalStateContract: 'stale disabled state produces no write',
        requiresIndependentSession: false,
      }),
    ],
  },
];

export const B11_SCENARIOS: readonly B11ScenarioDefinition[] = [
  ...CORE_SCENARIOS,
  ...RESILIENCE_SCENARIOS,
];

export function scenariosFor(
  profile: B11Profile,
): readonly B11ScenarioDefinition[] {
  return B11_SCENARIOS.filter((scenario) => scenario.profile === profile);
}

export function routesFor(profile: B11Profile): readonly B11RouteDefinition[] {
  return scenariosFor(profile).flatMap(({ routes }) => routes);
}

export function routeFor(
  profile: B11Profile,
  scenarioKey: string,
  routeKey: string,
): B11RouteDefinition {
  const routeValue = scenariosFor(profile)
    .find((scenario) => scenario.scenarioKey === scenarioKey)
    ?.routes.find((candidate) => candidate.key === routeKey);
  if (!routeValue) {
    throw new B11FixtureError(
      'B11_FIXTURE_ROUTE_NOT_ALLOWED',
      'Scenario and route must match the fixed B11 allowlist',
      profile,
      scenarioKey,
      routeKey,
    );
  }
  return routeValue;
}

const PRIMARY_OWNER_BY_ID = new Map<
  B11AuditId,
  {
    profile: B11Profile;
    scenarioKey: string;
    route: B11RouteDefinition;
  }
>();

for (const scenario of B11_SCENARIOS) {
  for (const routeValue of scenario.routes) {
    for (const auditId of routeValue.primaryAuditIds) {
      if (PRIMARY_OWNER_BY_ID.has(auditId)) {
        throw new Error(`Duplicate B11 primary owner for ${auditId}`);
      }
      PRIMARY_OWNER_BY_ID.set(auditId, {
        profile: scenario.profile,
        scenarioKey: scenario.scenarioKey,
        route: routeValue,
      });
    }
  }
}

export const B11_AUDIT_MATRIX: readonly B11AuditContractEntry[] =
  B11_AUDIT_IDS.map((auditId) => {
    if (auditId === 'B11-70') {
      return {
        auditId,
        ownerType: 'static_gate',
        profile: 'static-gate',
        scenarioKey: 'static-gate',
        routeKey: null,
        primaryRole: null,
        secondaryRole: null,
        preparedState: 'static_gate',
        allowedStages: [],
        expectedProductMutationClass: 'static_gate',
        expectedFixtureOwnedMutationClass: 'static_gate',
        postBrowserFinalStateContract:
          'rerun frontend lint, typecheck, and build on the final Browser code state',
      } satisfies B11AuditContractEntry;
    }
    const owner = PRIMARY_OWNER_BY_ID.get(auditId);
    if (!owner) {
      throw new Error(`Missing B11 primary owner for ${auditId}`);
    }
    return {
      auditId,
      ownerType: 'browser_route',
      profile: owner.profile,
      scenarioKey: owner.scenarioKey,
      routeKey: owner.route.key,
      primaryRole: owner.route.primaryRole,
      secondaryRole: owner.route.secondaryRole,
      preparedState: owner.route.preparedState,
      allowedStages: owner.route.allowedStages,
      expectedProductMutationClass: owner.route.expectedProductMutationClass,
      expectedFixtureOwnedMutationClass:
        owner.route.expectedFixtureOwnedMutationClass,
      postBrowserFinalStateContract: owner.route.postBrowserFinalStateContract,
    } satisfies B11AuditContractEntry;
  });

export function auditMatrixFor(
  profile: B11Profile,
): readonly B11AuditContractEntry[] {
  return B11_AUDIT_MATRIX.filter((entry) => entry.profile === profile);
}

export function validateB11Profile(value: string): B11Profile {
  if (!B11_PROFILES.includes(value as B11Profile)) {
    throw new B11FixtureError(
      'B11_FIXTURE_PROFILE_INVALID',
      'Profile must be core-workflow or resilience-security',
    );
  }
  return value as B11Profile;
}

function namespacePrefixFor(profile: B11Profile): string {
  return profile === 'core-workflow' ? 'b11c-' : 'b11r-';
}

export function validateB11Namespace(
  profile: B11Profile,
  value: string,
): string {
  const prefix = namespacePrefixFor(profile);
  if (
    value.length < 9 ||
    value.length > B11_NAMESPACE_MAX_LENGTH ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
    !value.startsWith(prefix)
  ) {
    throw new B11FixtureError(
      'B11_FIXTURE_NAMESPACE_INVALID',
      `Namespace must use the ${prefix} profile prefix and lowercase segments`,
      profile,
    );
  }
  return value;
}

export function validateB11Role(value: string): B11Role {
  if (!B11_ROLES.includes(value as B11Role)) {
    throw new B11FixtureError(
      'B11_FIXTURE_ROLE_INVALID',
      'Role must be one of the five fixed B11 fixture roles',
    );
  }
  return value as B11Role;
}

export function assertB11StageTarget(input: {
  profile: B11Profile;
  scenarioKey: string | undefined;
  routeKey: string | undefined;
  transition: string | undefined;
  role: B11Role | undefined;
}): asserts input is {
  profile: B11Profile;
  scenarioKey: string;
  routeKey: string;
  transition: B11StageTransition;
  role: B11Role;
} {
  const confirmationTouch =
    input.profile === 'core-workflow' &&
    input.scenarioKey === 'confirmation' &&
    input.routeKey === 'confirmation-conflict' &&
    input.transition === 'confirmation-conflict-touch' &&
    input.role === 'doctor';
  const forbiddenRole =
    input.profile === 'resilience-security' &&
    input.scenarioKey === 'authorization' &&
    input.routeKey === 'forbidden-confirm' &&
    input.transition === 'forbidden-confirm-role' &&
    input.role === 'doctor';
  if (!confirmationTouch && !forbiddenRole) {
    throw new B11FixtureError(
      'B11_FIXTURE_STAGE_TARGET_NOT_ALLOWED',
      'Stage must match one of the two fixed B11 transition allowlist entries',
      input.profile,
      input.scenarioKey,
      input.routeKey,
    );
  }
}

export function assertB11RuntimeTarget(input: {
  profile: B11Profile;
  scenarioKey: string;
  routeKey: string;
  role: B11Role;
}): B11RouteDefinition {
  const routeValue = routeFor(input.profile, input.scenarioKey, input.routeKey);
  if (
    routeValue.primaryRole !== input.role &&
    routeValue.secondaryRole !== input.role
  ) {
    throw new B11FixtureError(
      'B11_FIXTURE_RUNTIME_ROLE_NOT_ALLOWED',
      'Runtime role must match the fixed route role contract',
      input.profile,
      input.scenarioKey,
      input.routeKey,
    );
  }
  return routeValue;
}

export function requireB11FixturePassword(value: string | undefined): string {
  if (!value || value.length < 16) {
    throw new B11FixtureError(
      'B11_FIXTURE_PASSWORD_REQUIRED',
      'B11_FIXTURE_PASSWORD must be provided through the process environment',
    );
  }
  return value;
}

export function assertB11PreImportEnvironment(
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== 'test') {
    throw new B11FixtureError(
      'B11_FIXTURE_ENVIRONMENT_UNSAFE',
      'B11 fixtures require NODE_ENV=test before application import',
    );
  }
}

export function assertB11RuntimeEnvironment(env: B11RuntimeEnvironment): void {
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
    throw new B11FixtureError(
      'B11_FIXTURE_ENVIRONMENT_UNSAFE',
      'B11 fixtures require the exact isolated test database and fake or stub external services',
    );
  }
}

function roleSegment(role: B11Role): string {
  return role.replace(/_/g, '-');
}

function profileCode(profile: B11Profile): 'b11c' | 'b11r' {
  return profile === 'core-workflow' ? 'b11c' : 'b11r';
}

export function accountNameFor(
  profile: B11Profile,
  namespace: string,
  role: B11Role,
): string {
  return `${profileCode(profile)}-${namespace}-${roleSegment(role)}`;
}

export function displayNameFor(profile: B11Profile, role: B11Role): string {
  return `B11 synthetic ${profileCode(profile)} ${roleSegment(role)}`;
}

export function routeOrdinalFor(
  profile: B11Profile,
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
    throw new B11FixtureError(
      'B11_FIXTURE_ROUTE_NOT_ALLOWED',
      'Route ordinal requires a fixed B11 route',
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
  profile: B11Profile,
  namespace: string,
  scenarioKey: string,
  routeKey: string,
): string {
  return `${profileCode(profile).toUpperCase()}-${uppercaseNamespace(
    namespace,
  )}-${String(routeOrdinalFor(profile, scenarioKey, routeKey)).padStart(
    2,
    '0',
  )}`;
}

export function visitCodeFor(
  profile: B11Profile,
  namespace: string,
  scenarioKey: string,
  routeKey: string,
): string {
  return `${subjectCodeFor(profile, namespace, scenarioKey, routeKey)}-V1`;
}

export function instanceCodeFor(
  profile: B11Profile,
  namespace: string,
  scenarioKey: string,
  routeKey: string,
): string {
  return `${subjectCodeFor(profile, namespace, scenarioKey, routeKey)}-MMSE-1`;
}

export function reportCodeFor(
  profile: B11Profile,
  namespace: string,
  scenarioKey: string,
  routeKey: string,
): string {
  return `${subjectCodeFor(
    profile,
    namespace,
    scenarioKey,
    routeKey,
  )}-REPORT-V1`;
}

export function assertB11Contract(): void {
  const matrixIds = B11_AUDIT_MATRIX.map(({ auditId }) => auditId);
  const browserEntries = B11_AUDIT_MATRIX.filter(
    ({ ownerType }) => ownerType === 'browser_route',
  );
  const staticEntries = B11_AUDIT_MATRIX.filter(
    ({ ownerType }) => ownerType === 'static_gate',
  );
  const core = auditMatrixFor('core-workflow');
  const resilience = auditMatrixFor('resilience-security');
  const allRoutes = B11_SCENARIOS.flatMap((scenario) =>
    scenario.routes.map((routeValue) => ({ scenario, routeValue })),
  );
  const primaryIds = allRoutes.flatMap(
    ({ routeValue }) => routeValue.primaryAuditIds,
  );
  const stageTargets = allRoutes
    .filter(({ routeValue }) => routeValue.allowedStages.length > 0)
    .map(
      ({ scenario, routeValue }) =>
        `${scenario.profile}/${scenario.scenarioKey}/${routeValue.key}/${routeValue.allowedStages.join(',')}`,
    );
  const routeKeys = allRoutes.map(
    ({ scenario, routeValue }) =>
      `${scenario.profile}/${scenario.scenarioKey}/${routeValue.key}`,
  );
  const entriesResolve = browserEntries.every((entry) => {
    if (!entry.routeKey) return false;
    const owner = PRIMARY_OWNER_BY_ID.get(entry.auditId);
    return (
      owner?.profile === entry.profile &&
      owner.scenarioKey === entry.scenarioKey &&
      owner.route.key === entry.routeKey
    );
  });
  if (
    B11_AUDIT_IDS.length !== 70 ||
    B11_AUDIT_MATRIX.length !== 70 ||
    matrixIds.length !== new Set(matrixIds).size ||
    matrixIds.some((id, index) => id !== B11_AUDIT_IDS[index]) ||
    browserEntries.length !== 69 ||
    staticEntries.length !== 1 ||
    staticEntries[0]?.auditId !== 'B11-70' ||
    staticEntries[0]?.routeKey !== null ||
    core.length !== 58 ||
    resilience.length !== 11 ||
    primaryIds.length !== 69 ||
    primaryIds.length !== new Set(primaryIds).size ||
    routeKeys.length !== 29 ||
    routeKeys.length !== new Set(routeKeys).size ||
    scenariosFor('core-workflow').length !== 5 ||
    scenariosFor('resilience-security').length !== 4 ||
    !entriesResolve ||
    allRoutes.some(
      ({ routeValue }) =>
        routeValue.automaticWriteRetry !== false ||
        routeValue.primaryAuditIds.some((id) =>
          routeValue.supportingAuditIds.includes(id),
        ),
    ) ||
    stageTargets.join('|') !==
      'core-workflow/confirmation/confirmation-conflict/confirmation-conflict-touch|resilience-security/authorization/forbidden-confirm/forbidden-confirm-role' ||
    B11_DEFAULT_NAMESPACES['core-workflow'] ===
      B11_DEFAULT_NAMESPACES['resilience-security']
  ) {
    throw new B11FixtureError(
      'B11_FIXTURE_CONTRACT_INVALID',
      'The fixed B11 70-ID ownership, profile, route, and Stage contract is invalid',
    );
  }
}
