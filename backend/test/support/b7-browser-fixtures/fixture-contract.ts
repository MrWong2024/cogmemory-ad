export const B7_DEFAULT_NAMESPACE = 'b7-browser-final';
export const B7_NAMESPACE_MAX_LENGTH = 28;

export const B7_ROLES = [
  'doctor',
  'admin',
  'nurse',
  'research_assistant',
  'system',
] as const;

export type B7Role = (typeof B7_ROLES)[number];
export type B7ScaleCode = 'mmse' | 'moca';
export type B7VerifyPhase = 'prepared' | 'post-browser';
export type B7FaultMode =
  | 'none'
  | 'browser-request-abort'
  | 'controlled-transition';
export type B7TransitionMode = 'none' | 'void-result' | 'conflict-index';
export type B7TransitionAction = 'arm' | 'restore';

export const B7_VERIFY_STAGES = [
  'contract',
  'initial_snapshot',
  'users_and_password',
  'root_matrix',
  'scenario_facts',
  'transition_residue',
  'global_seed',
  'final_snapshot',
  'safe_manifest',
] as const;

export type B7VerifyStage = (typeof B7_VERIFY_STAGES)[number];

export const B7_AUDIT_IDS = Array.from(
  { length: 40 },
  (_, index) => `B7-${(index + 1).toString().padStart(2, '0')}`,
);

export type B7BusinessScenarioKey =
  | 'query_state_matrix'
  | 'first_compute_idempotency'
  | 'partial_review_privacy'
  | 'moca_process_group'
  | 'null_review_target'
  | 'historical_read_only'
  | 'noncomputable_no_result'
  | 'incomplete_result'
  | 'voided_transition'
  | 'computation_conflict'
  | 'authz_matrix'
  | 'network_failure'
  | 'responsive_scope_boundary';

export type B7ScenarioKey = 'roles' | B7BusinessScenarioKey;

export type B7ExpectedRequest = {
  method: 'GET' | 'POST' | 'none';
  resource: 'latest' | 'compute' | 'page';
  count: string;
  body: 'none' | 'confirm=true';
};

export type B7ScenarioDefinition = {
  scenarioKey: B7BusinessScenarioKey;
  ordinal: number;
  scaleCode: B7ScaleCode;
  primaryAuditIds: readonly string[];
  fixturePrecondition: string;
  routeKeys: readonly string[];
  expectedRequests: readonly B7ExpectedRequest[];
  expectedSideEffect: string;
  faultMode: B7FaultMode;
  transitionMode: B7TransitionMode;
};

function request(
  method: B7ExpectedRequest['method'],
  resource: B7ExpectedRequest['resource'],
  count: string,
  body: B7ExpectedRequest['body'] = 'none',
): B7ExpectedRequest {
  return { method, resource, count, body };
}

export const B7_BUSINESS_SCENARIOS = [
  {
    scenarioKey: 'query_state_matrix',
    ordinal: 1,
    scaleCode: 'mmse',
    primaryAuditIds: ['B7-01'],
    fixturePrecondition:
      'One draft and one in-progress MMSE instance with no score result',
    routeKeys: ['draft', 'inProgress'],
    expectedRequests: [request('GET', 'latest', '0')],
    expectedSideEffect: 'No score result is created and no source fact changes',
    faultMode: 'none',
    transitionMode: 'none',
  },
  {
    scenarioKey: 'first_compute_idempotency',
    ordinal: 2,
    scaleCode: 'mmse',
    primaryAuditIds: [
      'B7-02',
      'B7-03',
      'B7-04',
      'B7-05',
      'B7-06',
      'B7-07',
      'B7-08',
      'B7-09',
      'B7-10',
      'B7-11',
    ],
    fixturePrecondition:
      'Completed MMSE instance with complete synthetic responses and no score result',
    routeKeys: ['primary'],
    expectedRequests: [
      request('GET', 'latest', 'one per page load'),
      request(
        'POST',
        'compute',
        'one per independent stale page',
        'confirm=true',
      ),
    ],
    expectedSideEffect:
      'Exactly one runNo=1 provisional score result is created; source records remain unchanged',
    faultMode: 'none',
    transitionMode: 'none',
  },
  {
    scenarioKey: 'partial_review_privacy',
    ordinal: 3,
    scaleCode: 'mmse',
    primaryAuditIds: [
      'B7-12',
      'B7-13',
      'B7-14',
      'B7-17',
      'B7-18',
      'B7-20',
      'B7-21',
      'B7-22',
      'B7-23',
      'B7-24',
      'B7-25',
      'B7-37',
    ],
    fixturePrecondition:
      'Completed MMSE instance with a needs-review provisional result and internal-only sentinels',
    routeKeys: ['primary'],
    expectedRequests: [request('GET', 'latest', '1')],
    expectedSideEffect:
      'Read-only; all stored facts and sentinels remain unchanged',
    faultMode: 'none',
    transitionMode: 'none',
  },
  {
    scenarioKey: 'moca_process_group',
    ordinal: 4,
    scaleCode: 'moca',
    primaryAuditIds: ['B7-15', 'B7-16'],
    fixturePrecondition:
      'Completed MoCA instance with a provisional result containing non-scoring process items',
    routeKeys: ['primary'],
    expectedRequests: [request('GET', 'latest', '1')],
    expectedSideEffect: 'Read-only; no score, domain, or report fact changes',
    faultMode: 'none',
    transitionMode: 'none',
  },
  {
    scenarioKey: 'null_review_target',
    ordinal: 5,
    scaleCode: 'mmse',
    primaryAuditIds: ['B7-19'],
    fixturePrecondition:
      'Completed MMSE instance whose first review-queue item has itemResponseId=null',
    routeKeys: ['primary'],
    expectedRequests: [request('GET', 'latest', '1')],
    expectedSideEffect: 'Read-only; no fabricated navigation target is created',
    faultMode: 'none',
    transitionMode: 'none',
  },
  {
    scenarioKey: 'historical_read_only',
    ordinal: 6,
    scaleCode: 'mmse',
    primaryAuditIds: ['B7-26'],
    fixturePrecondition:
      'Completed, locked, and voided historical instances each have an existing result',
    routeKeys: ['completed', 'locked', 'voided'],
    expectedRequests: [request('GET', 'latest', '1 per route')],
    expectedSideEffect:
      'Read-only; no historical result or source record changes',
    faultMode: 'none',
    transitionMode: 'none',
  },
  {
    scenarioKey: 'noncomputable_no_result',
    ordinal: 7,
    scaleCode: 'moca',
    primaryAuditIds: ['B7-27'],
    fixturePrecondition:
      'Locked and voided MoCA instances have no score result',
    routeKeys: ['locked', 'voided'],
    expectedRequests: [request('GET', 'latest', '1 per route')],
    expectedSideEffect: 'No compute request and no score result creation',
    faultMode: 'none',
    transitionMode: 'none',
  },
  {
    scenarioKey: 'incomplete_result',
    ordinal: 8,
    scaleCode: 'mmse',
    primaryAuditIds: ['B7-28'],
    fixturePrecondition:
      'Completed MMSE instance has one deliberately incomplete draft ScoreResult',
    routeKeys: ['primary'],
    expectedRequests: [request('GET', 'latest', '1')],
    expectedSideEffect:
      'Read-only; draft result is neither repaired nor removed',
    faultMode: 'none',
    transitionMode: 'none',
  },
  {
    scenarioKey: 'voided_transition',
    ordinal: 9,
    scaleCode: 'mmse',
    primaryAuditIds: ['B7-29'],
    fixturePrecondition:
      'Completed MMSE instance starts without a result; controlled arm creates a voided result after page load',
    routeKeys: ['primary'],
    expectedRequests: [
      request('GET', 'latest', 'initial 1 plus recovery 1'),
      request('POST', 'compute', '1', 'confirm=true'),
    ],
    expectedSideEffect:
      'One voided runNo=1 result exists; POST is not retried and recovery is GET-only',
    faultMode: 'controlled-transition',
    transitionMode: 'void-result',
  },
  {
    scenarioKey: 'computation_conflict',
    ordinal: 10,
    scaleCode: 'mmse',
    primaryAuditIds: ['B7-30'],
    fixturePrecondition:
      'Target completed MMSE instance has no result; a companion result supports a namespace-scoped conflict index',
    routeKeys: ['primary'],
    expectedRequests: [
      request('GET', 'latest', 'initial 1 plus recovery 1'),
      request('POST', 'compute', '1', 'confirm=true'),
    ],
    expectedSideEffect:
      'Target remains without a result, companion remains unchanged, and the temporary index is restored',
    faultMode: 'controlled-transition',
    transitionMode: 'conflict-index',
  },
  {
    scenarioKey: 'authz_matrix',
    ordinal: 11,
    scaleCode: 'moca',
    primaryAuditIds: ['B7-31', 'B7-32'],
    fixturePrecondition:
      'Completed MoCA instance with an existing result; logged-out and system-role sessions are available',
    routeKeys: ['primary'],
    expectedRequests: [
      request('GET', 'latest', '1 per independent auth state'),
    ],
    expectedSideEffect: 'No business fact changes',
    faultMode: 'none',
    transitionMode: 'none',
  },
  {
    scenarioKey: 'network_failure',
    ordinal: 12,
    scaleCode: 'mmse',
    primaryAuditIds: ['B7-33'],
    fixturePrecondition:
      'Completed MMSE instance with existing result and intact execution/media history',
    routeKeys: ['primary'],
    expectedRequests: [request('GET', 'latest', '1 aborted request')],
    expectedSideEffect: 'No request retry and no business fact changes',
    faultMode: 'browser-request-abort',
    transitionMode: 'none',
  },
  {
    scenarioKey: 'responsive_scope_boundary',
    ordinal: 13,
    scaleCode: 'moca',
    primaryAuditIds: ['B7-34', 'B7-35', 'B7-36', 'B7-38', 'B7-39', 'B7-40'],
    fixturePrecondition:
      'Completed MoCA instance with a read-only provisional result for responsive and scoped boundary checks',
    routeKeys: ['primary'],
    expectedRequests: [
      request('GET', 'latest', 'one per representative viewport'),
    ],
    expectedSideEffect:
      'Read-only; no route, score, domain, report, or source fact changes',
    faultMode: 'none',
    transitionMode: 'none',
  },
] as const satisfies readonly B7ScenarioDefinition[];

export type B7SafeRoleManifest = {
  role: B7Role;
  loginIdentifier: string;
  displayName: string;
};

export type B7SafeRoute = {
  key: string;
  path: string;
};

export type B7SafeScenarioManifest = {
  scenarioKey: B7BusinessScenarioKey;
  primaryAuditIds: readonly string[];
  routes: B7SafeRoute[];
  expectedRequests: readonly B7ExpectedRequest[];
  expectedSideEffect: string;
  faultMode: B7FaultMode;
  transitionMode: B7TransitionMode;
};

export type B7SafeManifest = {
  namespace: string;
  databaseName: string;
  phase: B7VerifyPhase;
  roles: B7SafeRoleManifest[];
  scenarios: B7SafeScenarioManifest[];
  expectedSummary: string;
};

export type B7SafeCleanupSummary = {
  namespace: string;
  databaseName: string;
  expectedSummary: string;
};

export type B7SafeTransitionSummary = {
  namespace: string;
  databaseName: string;
  scenarioKey: 'voided_transition' | 'computation_conflict';
  action: 'armed' | 'restored';
  expectedSummary: string;
};

export type B7RuntimeEnvironment = {
  nodeEnv: string | undefined;
  appEnv: string | undefined;
  databasePurpose: string | undefined;
  databaseName: string;
  storageDriver: string | undefined;
  llmProvider: string | undefined;
  smsProvider: string | undefined;
  sessionCookieSecure: boolean | undefined;
};

export class B7FixtureError extends Error {
  constructor(
    readonly code: string,
    readonly safeMessage: string,
    readonly scenarioKey?: B7ScenarioKey,
    readonly verifyStage?: B7VerifyStage,
    readonly verifyPhase?: B7VerifyPhase,
  ) {
    super(code);
  }
}

export type B7SafeErrorPayload = {
  ok: false;
  code: string;
  message: string;
  scenarioKey?: B7ScenarioKey;
  stage?: B7VerifyStage;
  phase?: B7VerifyPhase;
};

export function toB7SafeErrorPayload(error: unknown): B7SafeErrorPayload {
  if (error instanceof B7FixtureError) {
    return {
      ok: false,
      code: error.code,
      message: error.safeMessage,
      ...(error.scenarioKey ? { scenarioKey: error.scenarioKey } : {}),
      ...(error.verifyStage ? { stage: error.verifyStage } : {}),
      ...(error.verifyPhase ? { phase: error.verifyPhase } : {}),
    };
  }
  return {
    ok: false,
    code: 'B7_FIXTURE_OPERATION_FAILED',
    message:
      'B7 browser fixture operation failed without exposing internal details',
  };
}

export function validateB7Namespace(value: string): string {
  if (
    value.length < 3 ||
    value.length > B7_NAMESPACE_MAX_LENGTH ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
    /^(?:b16|b17|b123|b456)(?:-|$)/.test(value)
  ) {
    throw new B7FixtureError(
      'B7_FIXTURE_NAMESPACE_INVALID',
      'Namespace must be a new B7-safe value containing 3-28 lowercase letters, digits, or single hyphens',
    );
  }
  return value;
}

export function assertB7PreImportEnvironment(
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== 'test') {
    throw new B7FixtureError(
      'B7_FIXTURE_ENVIRONMENT_UNSAFE',
      'B7 fixtures require NODE_ENV=test before application import',
    );
  }
}

export function assertB7RuntimeEnvironment(env: B7RuntimeEnvironment): void {
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
    throw new B7FixtureError(
      'B7_FIXTURE_ENVIRONMENT_UNSAFE',
      'B7 fixtures require the exact Browser test database and fake or stub external services',
    );
  }
}

export function requireB7FixturePassword(value: string | undefined): string {
  if (!value || value.length < 12) {
    throw new B7FixtureError(
      'B7_FIXTURE_PASSWORD_REQUIRED',
      'B7_FIXTURE_PASSWORD must be provided through the process environment',
    );
  }
  return value;
}

export function accountNameFor(namespace: string, role: B7Role): string {
  return `b7fx-${namespace}-${role.replace('_', '-')}`;
}

export function displayNameFor(role: B7Role): string {
  const names: Record<B7Role, string> = {
    doctor: 'B7 测试医生',
    admin: 'B7 测试管理员',
    nurse: 'B7 测试护士',
    research_assistant: 'B7 测试科研助理',
    system: 'B7 测试系统账号',
  };
  return names[role];
}

export function scenarioSubjectCodeFor(
  namespace: string,
  ordinal: number,
): string {
  return `B7-${namespace.toUpperCase()}-${ordinal.toString().padStart(2, '0')}`;
}

export function scenarioVisitCodeFor(
  namespace: string,
  ordinal: number,
  suffix = 'BASE',
): string {
  return `${scenarioSubjectCodeFor(namespace, ordinal)}-${suffix}`;
}

export function conflictIndexNameFor(namespace: string): string {
  return `b7fx_${namespace.replace(/-/g, '_')}_conflict_status`;
}

export function assertB7Contract(): void {
  const auditIds: string[] = B7_BUSINESS_SCENARIOS.flatMap(
    ({ primaryAuditIds }) => [...primaryAuditIds],
  );
  const keys = B7_BUSINESS_SCENARIOS.map(({ scenarioKey }) => scenarioKey);
  if (
    B7_BUSINESS_SCENARIOS.length !== 13 ||
    keys.length !== new Set(keys).size ||
    auditIds.length !== 40 ||
    new Set(auditIds).size !== 40 ||
    B7_AUDIT_IDS.some((auditId) => !auditIds.includes(auditId)) ||
    auditIds.some((auditId) => !new Set<string>(B7_AUDIT_IDS).has(auditId))
  ) {
    throw new B7FixtureError(
      'B7_FIXTURE_CONTRACT_INVALID',
      'The fixed B7 scenario and 40-item primary ownership contract is unbalanced',
    );
  }
}

const ALLOWED_MANIFEST_KEYS = new Set([
  'namespace',
  'databaseName',
  'phase',
  'roles',
  'role',
  'loginIdentifier',
  'displayName',
  'scenarios',
  'scenarioKey',
  'primaryAuditIds',
  'routes',
  'key',
  'path',
  'expectedRequests',
  'method',
  'resource',
  'count',
  'body',
  'expectedSideEffect',
  'faultMode',
  'transitionMode',
  'action',
  'expectedSummary',
]);

const FORBIDDEN_VALUE_PATTERN =
  /(mongodb(?:\+srv)?:\/\/|cookie|session[_-]?token|passwordhash|objectkey|bucket|rawresponse|expectedvalue|scoringrule)/i;

function scanSafeManifest(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (FORBIDDEN_VALUE_PATTERN.test(value)) {
      throw new B7FixtureError(
        'B7_FIXTURE_MANIFEST_UNSAFE',
        `Safe manifest contains a forbidden value at ${path}`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      scanSafeManifest(entry, `${path}[${index}]`),
    );
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (!ALLOWED_MANIFEST_KEYS.has(key)) {
      throw new B7FixtureError(
        'B7_FIXTURE_MANIFEST_UNSAFE',
        `Safe manifest contains a forbidden field at ${path}.${key}`,
      );
    }
    scanSafeManifest(entry, `${path}.${key}`);
  }
}

export function assertB7SafeManifest(value: unknown): void {
  scanSafeManifest(value, 'manifest');
}
