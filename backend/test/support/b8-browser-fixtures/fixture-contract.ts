export const B8_PROFILES = ['core-workflow', 'resilience-security'] as const;

export type B8Profile = (typeof B8_PROFILES)[number];
export type B8VerifyPhase = 'prepared' | 'post-browser';
export type B8ScaleCode = 'mmse' | 'moca';

export const B8_DEFAULT_NAMESPACES: Record<B8Profile, string> = {
  'core-workflow': 'b8c-browser-final',
  'resilience-security': 'b8r-browser-final',
};

export const B8_NAMESPACE_MAX_LENGTH = 28;

export const B8_ROLES = [
  'doctor',
  'admin',
  'nurse',
  'research_assistant',
  'system',
] as const;

export type B8Role = (typeof B8_ROLES)[number];

export type B8AuditId = `B8-${string}`;

export const B8_AUDIT_IDS = Array.from(
  { length: 60 },
  (_, index) => `B8-${(index + 1).toString().padStart(2, '0')}`,
);

export type B8BusinessScenarioKey =
  | 'manual_eligibility'
  | 'manual_input_validation'
  | 'manual_submit_success'
  | 'manual_revision'
  | 'final_manual_to_computed'
  | 'confirmation_eligibility'
  | 'confirmation_success'
  | 'confirmed_idempotent_readonly'
  | 'static_gate'
  | 'draft_switch_unload'
  | 'manual_conflict_stale'
  | 'metadata_audit_blocks'
  | 'confirmation_conflict_warning'
  | 'privacy_public_surface'
  | 'auth_401'
  | 'auth_403'
  | 'network_failure'
  | 'responsive_route_draft';

export type B8ScenarioKey = 'roles' | B8BusinessScenarioKey;

export type B8ExpectedRequest = {
  method: 'GET' | 'PATCH' | 'POST' | 'none';
  resource: 'latest' | 'manual-review' | 'confirm' | 'page';
  count: string;
  bodyWhitelist:
    | 'none'
    | 'scoreValue,reviewNote,expectedUpdatedAt'
    | 'confirm,reviewNote,expectedUpdatedAt';
};

export type B8ExpectedRequestBranch = {
  routeKey: string;
  request: B8ExpectedRequest;
  expectedHttpStatus: string;
  automaticRetry: false;
  postBrowserSideEffect: 'none';
};

export type B8ExpectedRequestContract =
  | B8ExpectedRequest
  | {
      branches: readonly B8ExpectedRequestBranch[];
    };

export type B8RoutePreparedContract = {
  key: string;
  preparedState: string;
  visitStatus: 'draft' | 'in_progress' | 'completed';
  scaleInstanceStatus: 'draft' | 'in_progress' | 'completed';
  scoreResult: {
    presence: 'required' | 'absent';
    status: 'needs_review' | 'computed' | 'absent';
    reviewQueue: 'at-least-one' | 'empty' | 'not-applicable';
    warning: 'none' | 'not-applicable';
    confirmationReadiness: 'ready' | 'blocked' | 'not-applicable';
  };
  itemResponseEditability: 'editable' | 'read-only';
  mediaDraftTarget: 'local-draft-supported' | 'not-applicable';
  expectedRequest: B8ExpectedRequest;
  expectedHttpStatus: string;
  automaticRetry: false;
  postBrowserSideEffect: 'none';
};

export type B8VerificationFlag =
  | 'network'
  | 'permission'
  | 'privacy'
  | 'responsive';

export type B8AuditContractEntry = {
  auditId: B8AuditId;
  profile: B8Profile;
  scenarioKey: B8BusinessScenarioKey;
  primaryRole: B8Role;
  preparedState: string;
  expectedRequest: B8ExpectedRequestContract;
  expectedHttpStatus: string;
  postBrowserSideEffect: string;
  requiresIndependentSession: boolean;
  verificationFlags: readonly B8VerificationFlag[];
};

export type B8ScenarioDefinition = {
  scenarioKey: B8BusinessScenarioKey;
  profile: B8Profile;
  ordinal: number;
  scaleCode: B8ScaleCode;
  primaryOwnerAuditId: B8AuditId;
  auditIds: readonly B8AuditId[];
  routeKeys: readonly string[];
  preparedState: string;
  routeContracts?: readonly B8RoutePreparedContract[];
};

function request(
  method: B8ExpectedRequest['method'],
  resource: B8ExpectedRequest['resource'],
  count: string,
  bodyWhitelist: B8ExpectedRequest['bodyWhitelist'] = 'none',
): B8ExpectedRequest {
  return { method, resource, count, bodyWhitelist };
}

function entry(
  auditId: B8AuditId,
  profile: B8Profile,
  scenarioKey: B8BusinessScenarioKey,
  primaryRole: B8Role,
  preparedState: string,
  expectedRequest: B8ExpectedRequestContract,
  expectedHttpStatus: string,
  postBrowserSideEffect: string,
  requiresIndependentSession = false,
  verificationFlags: readonly B8VerificationFlag[] = [],
): B8AuditContractEntry {
  return {
    auditId,
    profile,
    scenarioKey,
    primaryRole,
    preparedState,
    expectedRequest,
    expectedHttpStatus,
    postBrowserSideEffect,
    requiresIndependentSession,
    verificationFlags,
  };
}

const noRequest = request('none', 'page', '0');
const latestOnce = request('GET', 'latest', '1');
const manualOnce = request(
  'PATCH',
  'manual-review',
  '1',
  'scoreValue,reviewNote,expectedUpdatedAt',
);
const confirmOnce = request(
  'POST',
  'confirm',
  '1',
  'confirm,reviewNote,expectedUpdatedAt',
);

function networkFailureBranches(): B8ExpectedRequestContract {
  return {
    branches: [
      {
        routeKey: 'manual',
        request: manualOnce,
        expectedHttpStatus: 'network-error',
        automaticRetry: false,
        postBrowserSideEffect: 'none',
      },
      {
        routeKey: 'confirmation',
        request: confirmOnce,
        expectedHttpStatus: 'network-error',
        automaticRetry: false,
        postBrowserSideEffect: 'none',
      },
    ],
  };
}

export const B8_AUDIT_MATRIX = [
  entry(
    'B8-01',
    'core-workflow',
    'manual_eligibility',
    'doctor',
    'needs_review with an owned review target',
    latestOnce,
    '200',
    'read-only',
  ),
  entry(
    'B8-02',
    'core-workflow',
    'manual_eligibility',
    'doctor',
    'needs_review with auto_scored items',
    latestOnce,
    '200',
    'read-only',
  ),
  entry(
    'B8-03',
    'core-workflow',
    'manual_eligibility',
    'doctor',
    'needs_review with a non-scoring process item',
    latestOnce,
    '200',
    'read-only',
  ),
  entry(
    'B8-04',
    'core-workflow',
    'manual_eligibility',
    'doctor',
    'needs_review companion whose review target is null',
    latestOnce,
    '200',
    'read-only',
  ),
  entry(
    'B8-05',
    'core-workflow',
    'manual_input_validation',
    'doctor',
    'needs_review with a score range containing zero',
    manualOnce,
    '200',
    'one manual-review event; server aggregates replace the prior result',
  ),
  ...(['B8-06', 'B8-07', 'B8-08', 'B8-09'] as const).map((auditId) =>
    entry(
      auditId,
      'core-workflow',
      'manual_input_validation',
      'doctor',
      'needs_review with a finite public min/max range',
      noRequest,
      'none',
      'no write; client validation blocks the request',
    ),
  ),
  entry(
    'B8-10',
    'core-workflow',
    'manual_input_validation',
    'doctor',
    'needs_review whose server scale range has a positive step',
    manualOnce,
    '409',
    'no write; input remains available to the Browser session',
  ),
  ...(['B8-11', 'B8-12'] as const).map((auditId) =>
    entry(
      auditId,
      'core-workflow',
      'manual_input_validation',
      'doctor',
      'needs_review with an empty manual-review draft',
      noRequest,
      'none',
      'no write; client note validation blocks the request',
    ),
  ),
  ...(['B8-13', 'B8-14', 'B8-15', 'B8-16', 'B8-17'] as const).map((auditId) =>
    entry(
      auditId,
      'core-workflow',
      'manual_submit_success',
      'doctor',
      'needs_review with at least two review targets',
      manualOnce,
      '200',
      'one manual-review event; queue, totals, groups, items, updatedAt, and receipt are server facts',
    ),
  ),
  ...(['B8-18', 'B8-19'] as const).map((auditId) =>
    entry(
      auditId,
      'core-workflow',
      'manual_revision',
      'nurse',
      'computed with a manual_scored item and public latest review summary',
      manualOnce,
      '200',
      'one revision event; result remains computed',
    ),
  ),
  ...(['B8-20', 'B8-21'] as const).map((auditId) =>
    entry(
      auditId,
      'resilience-security',
      'draft_switch_unload',
      'doctor',
      'needs_review with empty React-memory drafts',
      noRequest,
      'none',
      'no business write; only local dirty-state behavior is exercised',
      false,
      ['privacy'],
    ),
  ),
  ...(['B8-22', 'B8-23', 'B8-24', 'B8-25', 'B8-26'] as const).map((auditId) =>
    entry(
      auditId,
      'resilience-security',
      'manual_conflict_stale',
      'doctor',
      'exactly one review target opened by two independent sessions',
      manualOnce,
      '200 then 409 then 200',
      'exactly two manual-review events; no automatic retry; final result is computed',
      true,
    ),
  ),
  entry(
    'B8-27',
    'resilience-security',
    'metadata_audit_blocks',
    'admin',
    'needs_review with unsupported internal metadata',
    manualOnce,
    '409',
    'no write and no metadata repair',
    false,
    ['privacy'],
  ),
  entry(
    'B8-28',
    'resilience-security',
    'metadata_audit_blocks',
    'admin',
    'needs_review companion at the 500-event audit boundary',
    manualOnce,
    '409',
    'no write and no audit truncation',
    false,
    ['privacy'],
  ),
  ...(['B8-29', 'B8-30'] as const).map((auditId) =>
    entry(
      auditId,
      'core-workflow',
      'final_manual_to_computed',
      'doctor',
      'needs_review with exactly one remaining review target',
      manualOnce,
      '200',
      'one manual-review event; server returns computed with an empty review queue',
    ),
  ),
  ...(['B8-31', 'B8-32', 'B8-33', 'B8-34'] as const).map((auditId) =>
    entry(
      auditId,
      'core-workflow',
      'confirmation_eligibility',
      'doctor',
      'ready, warning, and pending confirmation variants',
      auditId === 'B8-31' || auditId === 'B8-32' ? latestOnce : noRequest,
      auditId === 'B8-31' || auditId === 'B8-32' ? '200' : 'none',
      'no confirmation write',
    ),
  ),
  ...(['B8-35', 'B8-36', 'B8-37', 'B8-38', 'B8-39', 'B8-40'] as const).map(
    (auditId) =>
      entry(
        auditId,
        'core-workflow',
        'confirmation_success',
        'doctor',
        'computed, warning-free, complete, and confirmation-ready',
        confirmOnce,
        '200',
        'one confirmation audit; status, final flags, quality, totals, and receipt are server facts',
      ),
  ),
  entry(
    'B8-41',
    'core-workflow',
    'confirmed_idempotent_readonly',
    'doctor',
    'already confirmed with a valid confirmation audit',
    confirmOnce,
    '200',
    'no write; alreadyConfirmed=true uses the existing audit',
  ),
  ...(['B8-42', 'B8-43', 'B8-44'] as const).map((auditId) =>
    entry(
      auditId,
      'core-workflow',
      'confirmed_idempotent_readonly',
      'doctor',
      'confirmed, locked, and missing-confirmation read-only variants',
      latestOnce,
      '200',
      'read-only',
      false,
      ['privacy'],
    ),
  ),
  entry(
    'B8-45',
    'resilience-security',
    'confirmation_conflict_warning',
    'doctor',
    'computed result opened for confirm while another session revises a manual score',
    confirmOnce,
    '409',
    'one manual revision event; stale confirm does not write and latest remains computed',
    true,
  ),
  entry(
    'B8-46',
    'resilience-security',
    'confirmation_conflict_warning',
    'doctor',
    'computed companion with a controlled A17 warning',
    confirmOnce,
    '409',
    'no write and no warning removal',
  ),
  ...(['B8-47', 'B8-48', 'B8-49'] as const).map((auditId) =>
    entry(
      auditId,
      'core-workflow',
      'confirmed_idempotent_readonly',
      'doctor',
      'confirmed and locked safe public summaries',
      latestOnce,
      '200',
      'read-only',
    ),
  ),
  ...(['B8-50', 'B8-51', 'B8-52', 'B8-53'] as const).map((auditId) =>
    entry(
      auditId,
      'resilience-security',
      'privacy_public_surface',
      'research_assistant',
      'confirmed result with internal-only synthetic sentinels',
      latestOnce,
      '200',
      'read-only; internal fields remain stored but absent from public surfaces',
      false,
      ['privacy'],
    ),
  ),
  entry(
    'B8-54',
    'resilience-security',
    'auth_401',
    'doctor',
    'needs_review with a logged-out independent session',
    manualOnce,
    '401',
    'no business write',
    true,
    ['permission', 'privacy'],
  ),
  entry(
    'B8-55',
    'resilience-security',
    'auth_403',
    'system',
    'needs_review with an authenticated system-role session',
    manualOnce,
    '403',
    'no business write; existing result and local input remain',
    true,
    ['permission', 'privacy'],
  ),
  entry(
    'B8-56',
    'resilience-security',
    'network_failure',
    'nurse',
    'independent manual-review and confirmation-ready network-failure routes',
    networkFailureBranches(),
    'network-error',
    'no retry and no business write',
    true,
    ['network', 'privacy'],
  ),
  entry(
    'B8-57',
    'resilience-security',
    'draft_switch_unload',
    'doctor',
    'needs_review with unsubmitted React-memory drafts',
    noRequest,
    'none',
    'reload discards local drafts without changing server facts',
    false,
    ['privacy'],
  ),
  entry(
    'B8-58',
    'resilience-security',
    'privacy_public_surface',
    'research_assistant',
    'all records use manually constructed de-identified MMSE/MoCA data',
    latestOnce,
    '200',
    'read-only',
    false,
    ['privacy'],
  ),
  entry(
    'B8-59',
    'resilience-security',
    'responsive_route_draft',
    'doctor',
    'independent manual, confirmation, and editable execution draft routes',
    latestOnce,
    '200',
    'no route mutation and no business write',
    false,
    ['responsive', 'privacy'],
  ),
  entry(
    'B8-60',
    'core-workflow',
    'static_gate',
    'admin',
    'read-only computed result paired with repository static gates',
    noRequest,
    'none',
    'no business write',
  ),
] as const satisfies readonly B8AuditContractEntry[];

export const B8_SCENARIOS = [
  {
    scenarioKey: 'manual_eligibility',
    profile: 'core-workflow',
    ordinal: 1,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B8-01',
    auditIds: ['B8-01', 'B8-02', 'B8-03', 'B8-04'],
    routeKeys: ['base', 'nullTarget'],
    preparedState: 'needs_review eligibility matrix',
  },
  {
    scenarioKey: 'manual_input_validation',
    profile: 'core-workflow',
    ordinal: 2,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B8-05',
    auditIds: [
      'B8-05',
      'B8-06',
      'B8-07',
      'B8-08',
      'B8-09',
      'B8-10',
      'B8-11',
      'B8-12',
    ],
    routeKeys: ['base'],
    preparedState: 'needs_review validation target',
  },
  {
    scenarioKey: 'manual_submit_success',
    profile: 'core-workflow',
    ordinal: 3,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B8-13',
    auditIds: ['B8-13', 'B8-14', 'B8-15', 'B8-16', 'B8-17'],
    routeKeys: ['base'],
    preparedState: 'needs_review with multiple pending targets',
  },
  {
    scenarioKey: 'manual_revision',
    profile: 'core-workflow',
    ordinal: 4,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B8-18',
    auditIds: ['B8-18', 'B8-19'],
    routeKeys: ['base'],
    preparedState: 'computed with manual review history',
  },
  {
    scenarioKey: 'final_manual_to_computed',
    profile: 'core-workflow',
    ordinal: 5,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B8-29',
    auditIds: ['B8-29', 'B8-30'],
    routeKeys: ['base'],
    preparedState: 'exactly one pending review target',
  },
  {
    scenarioKey: 'confirmation_eligibility',
    profile: 'core-workflow',
    ordinal: 6,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B8-31',
    auditIds: ['B8-31', 'B8-32', 'B8-33', 'B8-34'],
    routeKeys: ['base', 'warning', 'pending'],
    preparedState: 'ready, warning, and pending variants',
  },
  {
    scenarioKey: 'confirmation_success',
    profile: 'core-workflow',
    ordinal: 7,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B8-35',
    auditIds: ['B8-35', 'B8-36', 'B8-37', 'B8-38', 'B8-39', 'B8-40'],
    routeKeys: ['base'],
    preparedState: 'computed and confirmation-ready',
  },
  {
    scenarioKey: 'confirmed_idempotent_readonly',
    profile: 'core-workflow',
    ordinal: 8,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B8-41',
    auditIds: ['B8-41', 'B8-42', 'B8-43', 'B8-44', 'B8-47', 'B8-48', 'B8-49'],
    routeKeys: ['base', 'locked', 'missing'],
    preparedState: 'confirmed, locked, and missing-confirmation variants',
  },
  {
    scenarioKey: 'static_gate',
    profile: 'core-workflow',
    ordinal: 9,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B8-60',
    auditIds: ['B8-60'],
    routeKeys: ['base'],
    preparedState: 'computed read-only static-gate anchor',
  },
  {
    scenarioKey: 'draft_switch_unload',
    profile: 'resilience-security',
    ordinal: 1,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B8-20',
    auditIds: ['B8-20', 'B8-21', 'B8-57'],
    routeKeys: ['base'],
    preparedState: 'needs_review local-draft anchor',
  },
  {
    scenarioKey: 'manual_conflict_stale',
    profile: 'resilience-security',
    ordinal: 2,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B8-22',
    auditIds: ['B8-22', 'B8-23', 'B8-24', 'B8-25', 'B8-26'],
    routeKeys: ['base'],
    preparedState: 'one pending target for two independent sessions',
  },
  {
    scenarioKey: 'metadata_audit_blocks',
    profile: 'resilience-security',
    ordinal: 3,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B8-27',
    auditIds: ['B8-27', 'B8-28'],
    routeKeys: ['base', 'auditLimit'],
    preparedState: 'unsupported metadata and audit-limit variants',
  },
  {
    scenarioKey: 'confirmation_conflict_warning',
    profile: 'resilience-security',
    ordinal: 4,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B8-45',
    auditIds: ['B8-45', 'B8-46'],
    routeKeys: ['base', 'warning'],
    preparedState: 'confirmation-ready base and warning companion',
  },
  {
    scenarioKey: 'privacy_public_surface',
    profile: 'resilience-security',
    ordinal: 5,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B8-50',
    auditIds: ['B8-50', 'B8-51', 'B8-52', 'B8-53', 'B8-58'],
    routeKeys: ['base'],
    preparedState: 'confirmed with internal-only synthetic sentinels',
  },
  {
    scenarioKey: 'auth_401',
    profile: 'resilience-security',
    ordinal: 6,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B8-54',
    auditIds: ['B8-54'],
    routeKeys: ['base'],
    preparedState: 'needs_review logged-out target',
  },
  {
    scenarioKey: 'auth_403',
    profile: 'resilience-security',
    ordinal: 7,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B8-55',
    auditIds: ['B8-55'],
    routeKeys: ['base'],
    preparedState: 'needs_review system-role target',
  },
  {
    scenarioKey: 'network_failure',
    profile: 'resilience-security',
    ordinal: 8,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B8-56',
    auditIds: ['B8-56'],
    routeKeys: ['manual', 'confirmation'],
    preparedState:
      'independent needs_review manual and computed confirmation-ready routes',
    routeContracts: [
      {
        key: 'manual',
        preparedState:
          'completed instance with needs_review manual-review target',
        visitStatus: 'in_progress',
        scaleInstanceStatus: 'completed',
        scoreResult: {
          presence: 'required',
          status: 'needs_review',
          reviewQueue: 'at-least-one',
          warning: 'none',
          confirmationReadiness: 'blocked',
        },
        itemResponseEditability: 'read-only',
        mediaDraftTarget: 'not-applicable',
        expectedRequest: manualOnce,
        expectedHttpStatus: 'network-error',
        automaticRetry: false,
        postBrowserSideEffect: 'none',
      },
      {
        key: 'confirmation',
        preparedState:
          'completed instance with computed warning-free confirmation target',
        visitStatus: 'in_progress',
        scaleInstanceStatus: 'completed',
        scoreResult: {
          presence: 'required',
          status: 'computed',
          reviewQueue: 'empty',
          warning: 'none',
          confirmationReadiness: 'ready',
        },
        itemResponseEditability: 'read-only',
        mediaDraftTarget: 'not-applicable',
        expectedRequest: confirmOnce,
        expectedHttpStatus: 'network-error',
        automaticRetry: false,
        postBrowserSideEffect: 'none',
      },
    ],
  },
  {
    scenarioKey: 'responsive_route_draft',
    profile: 'resilience-security',
    ordinal: 9,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B8-59',
    auditIds: ['B8-59'],
    routeKeys: ['manual', 'confirmation', 'execution'],
    preparedState:
      'independent manual, confirmation, and editable execution draft routes',
    routeContracts: [
      {
        key: 'manual',
        preparedState:
          'completed instance with needs_review local manual draft target',
        visitStatus: 'in_progress',
        scaleInstanceStatus: 'completed',
        scoreResult: {
          presence: 'required',
          status: 'needs_review',
          reviewQueue: 'at-least-one',
          warning: 'none',
          confirmationReadiness: 'blocked',
        },
        itemResponseEditability: 'read-only',
        mediaDraftTarget: 'not-applicable',
        expectedRequest: latestOnce,
        expectedHttpStatus: '200',
        automaticRetry: false,
        postBrowserSideEffect: 'none',
      },
      {
        key: 'confirmation',
        preparedState:
          'completed instance with computed warning-free local confirmation draft target',
        visitStatus: 'in_progress',
        scaleInstanceStatus: 'completed',
        scoreResult: {
          presence: 'required',
          status: 'computed',
          reviewQueue: 'empty',
          warning: 'none',
          confirmationReadiness: 'ready',
        },
        itemResponseEditability: 'read-only',
        mediaDraftTarget: 'not-applicable',
        expectedRequest: latestOnce,
        expectedHttpStatus: '200',
        automaticRetry: false,
        postBrowserSideEffect: 'none',
      },
      {
        key: 'execution',
        preparedState:
          'in-progress visit with draft editable item and local media draft target',
        visitStatus: 'in_progress',
        scaleInstanceStatus: 'draft',
        scoreResult: {
          presence: 'absent',
          status: 'absent',
          reviewQueue: 'not-applicable',
          warning: 'not-applicable',
          confirmationReadiness: 'not-applicable',
        },
        itemResponseEditability: 'editable',
        mediaDraftTarget: 'local-draft-supported',
        expectedRequest: noRequest,
        expectedHttpStatus: 'none',
        automaticRetry: false,
        postBrowserSideEffect: 'none',
      },
    ],
  },
] as const satisfies readonly B8ScenarioDefinition[];

export type B8SafeRoleManifest = {
  role: B8Role;
  loginIdentifier: string;
  displayName: string;
};

export type B8SafeRoute = {
  key: string;
  path: string;
  preparedState?: string;
  visitStatus?: B8RoutePreparedContract['visitStatus'];
  scaleInstanceStatus?: B8RoutePreparedContract['scaleInstanceStatus'];
  scoreResult?: B8RoutePreparedContract['scoreResult'];
  itemResponseEditability?: B8RoutePreparedContract['itemResponseEditability'];
  mediaDraftTarget?: B8RoutePreparedContract['mediaDraftTarget'];
  expectedRequest?: B8ExpectedRequest;
  expectedHttpStatus?: string;
  automaticRetry?: false;
  postBrowserSideEffect?: 'none';
};

export type B8SafeScenarioManifest = {
  scenarioKey: B8BusinessScenarioKey;
  primaryOwnerAuditId: B8AuditId;
  auditIds: readonly B8AuditId[];
  preparedState: string;
  routes: B8SafeRoute[];
};

export type B8SafeManifest = {
  namespace: string;
  databaseName: string;
  profile: B8Profile;
  phase: B8VerifyPhase;
  roles: B8SafeRoleManifest[];
  scenarios: B8SafeScenarioManifest[];
  auditMatrix: readonly B8AuditContractEntry[];
  expectedSummary: string;
};

export type B8SafeCleanupSummary = {
  namespace: string;
  databaseName: string;
  profile: B8Profile;
  residualCount: number;
  matched: boolean;
  expectedSummary: string;
};

export type B8RuntimeEnvironment = {
  nodeEnv: string | undefined;
  appEnv: string | undefined;
  databasePurpose: string | undefined;
  databaseName: string;
  storageDriver: string | undefined;
  llmProvider: string | undefined;
  smsProvider: string | undefined;
  sessionCookieSecure: boolean | undefined;
};

export const B8_VERIFY_STAGES = [
  'contract',
  'initial_snapshot',
  'users_and_password',
  'root_matrix',
  'scenario_facts',
  'profile_isolation',
  'global_seed',
  'final_snapshot',
  'safe_manifest',
] as const;

export type B8VerifyStage = (typeof B8_VERIFY_STAGES)[number];

export class B8FixtureError extends Error {
  constructor(
    readonly code: string,
    readonly safeMessage: string,
    readonly profile?: B8Profile,
    readonly scenarioKey?: B8ScenarioKey,
    readonly verifyStage?: B8VerifyStage,
    readonly verifyPhase?: B8VerifyPhase,
  ) {
    super(code);
  }
}

export type B8SafeErrorPayload = {
  ok: false;
  code: string;
  message: string;
  profile?: B8Profile;
  scenarioKey?: B8ScenarioKey;
  stage?: B8VerifyStage;
  phase?: B8VerifyPhase;
};

export function toB8SafeErrorPayload(error: unknown): B8SafeErrorPayload {
  if (error instanceof B8FixtureError) {
    return {
      ok: false,
      code: error.code,
      message: error.safeMessage,
      ...(error.profile ? { profile: error.profile } : {}),
      ...(error.scenarioKey ? { scenarioKey: error.scenarioKey } : {}),
      ...(error.verifyStage ? { stage: error.verifyStage } : {}),
      ...(error.verifyPhase ? { phase: error.verifyPhase } : {}),
    };
  }
  return {
    ok: false,
    code: 'B8_FIXTURE_OPERATION_FAILED',
    message:
      'B8 browser fixture operation failed without exposing internal details',
  };
}

export function scenarioDefinitionsFor(
  profile: B8Profile,
): readonly B8ScenarioDefinition[] {
  return B8_SCENARIOS.filter((scenario) => scenario.profile === profile);
}

export function auditMatrixFor(
  profile: B8Profile,
): readonly B8AuditContractEntry[] {
  return B8_AUDIT_MATRIX.filter((entry) => entry.profile === profile);
}

export function validateB8Profile(value: string): B8Profile {
  if (value !== 'core-workflow' && value !== 'resilience-security') {
    throw new B8FixtureError(
      'B8_FIXTURE_PROFILE_INVALID',
      'Profile must be core-workflow or resilience-security',
    );
  }
  return value;
}

function namespacePrefixFor(profile: B8Profile): string {
  return profile === 'core-workflow' ? 'b8c-' : 'b8r-';
}

export function validateB8Namespace(profile: B8Profile, value: string): string {
  if (
    value.length < 7 ||
    value.length > B8_NAMESPACE_MAX_LENGTH ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
    !value.startsWith(namespacePrefixFor(profile))
  ) {
    throw new B8FixtureError(
      'B8_FIXTURE_NAMESPACE_INVALID',
      `Namespace must use the ${namespacePrefixFor(profile)} profile prefix and contain only lowercase letters, digits, or single hyphens`,
      profile,
    );
  }
  return value;
}

export function assertB8PreImportEnvironment(
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== 'test') {
    throw new B8FixtureError(
      'B8_FIXTURE_ENVIRONMENT_UNSAFE',
      'B8 fixtures require NODE_ENV=test before application import',
    );
  }
}

export function assertB8RuntimeEnvironment(env: B8RuntimeEnvironment): void {
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
    throw new B8FixtureError(
      'B8_FIXTURE_ENVIRONMENT_UNSAFE',
      'B8 fixtures require the exact isolated test database and fake or stub external services',
    );
  }
}

export function requireB8FixturePassword(value: string | undefined): string {
  if (!value || value.length < 12) {
    throw new B8FixtureError(
      'B8_FIXTURE_PASSWORD_REQUIRED',
      'B8_FIXTURE_PASSWORD must be provided through the process environment',
    );
  }
  return value;
}

function profileCode(profile: B8Profile): 'B8C' | 'B8R' {
  return profile === 'core-workflow' ? 'B8C' : 'B8R';
}

export function accountNameFor(
  profile: B8Profile,
  namespace: string,
  role: B8Role,
): string {
  const prefix = profile === 'core-workflow' ? 'b8cfx' : 'b8rfx';
  return `${prefix}-${namespace}-${role.replace('_', '-')}`;
}

export function displayNameFor(profile: B8Profile, role: B8Role): string {
  const profileName = profile === 'core-workflow' ? '核心流程' : '韧性安全';
  const names: Record<B8Role, string> = {
    doctor: '医生',
    admin: '管理员',
    nurse: '护士',
    research_assistant: '科研助理',
    system: '系统账号',
  };
  return `B8 ${profileName}测试${names[role]}`;
}

export function scenarioSubjectCodeFor(
  profile: B8Profile,
  namespace: string,
  ordinal: number,
): string {
  return `${profileCode(profile)}-${namespace.toUpperCase()}-${ordinal
    .toString()
    .padStart(2, '0')}`;
}

export function scenarioVisitCodeFor(
  profile: B8Profile,
  namespace: string,
  ordinal: number,
  suffix = 'BASE',
): string {
  return `${scenarioSubjectCodeFor(profile, namespace, ordinal)}-${suffix}`;
}

export function assertB8Contract(): void {
  const scenarios: readonly B8ScenarioDefinition[] = B8_SCENARIOS;
  const matrixIds = B8_AUDIT_MATRIX.map(({ auditId }) => auditId);
  const scenarioIds = scenarios.flatMap(({ auditIds }) => auditIds);
  const scenarioKeys = scenarios.map(({ scenarioKey }) => scenarioKey);
  const expectedIds = new Set<string>(B8_AUDIT_IDS);
  const matrixIdSet = new Set<string>(matrixIds);
  const coreCount = auditMatrixFor('core-workflow').length;
  const resilienceCount = auditMatrixFor('resilience-security').length;
  const ownersValid = scenarios.every((scenario) => {
    const owner = B8_AUDIT_MATRIX.find(
      ({ auditId }) => auditId === scenario.primaryOwnerAuditId,
    );
    return (
      new Set<string>(scenario.auditIds).has(scenario.primaryOwnerAuditId) &&
      owner?.scenarioKey === scenario.scenarioKey &&
      owner.profile === scenario.profile
    );
  });
  const entriesMatchScenarios = B8_AUDIT_MATRIX.every((audit) => {
    const scenario = scenarios.find(
      ({ scenarioKey }) => scenarioKey === audit.scenarioKey,
    );
    return (
      scenario?.profile === audit.profile &&
      new Set<string>(scenario.auditIds).has(audit.auditId)
    );
  });
  const routeContractsValid = scenarios.every((scenario) => {
    if (!scenario.routeContracts) {
      return true;
    }
    const routeKeys = [...scenario.routeKeys];
    const contractedKeys = scenario.routeContracts.map(({ key }) => key);
    return (
      contractedKeys.length === routeKeys.length &&
      new Set(contractedKeys).size === contractedKeys.length &&
      routeKeys.every((key) => contractedKeys.includes(key)) &&
      scenario.routeContracts.every(
        (route) =>
          route.automaticRetry === false &&
          route.postBrowserSideEffect === 'none',
      )
    );
  });
  const networkAudit = B8_AUDIT_MATRIX.find(
    ({ auditId }) => auditId === 'B8-56',
  );
  const networkScenario = scenarios.find(
    ({ scenarioKey }) => scenarioKey === 'network_failure',
  );
  const responsiveScenario = scenarios.find(
    ({ scenarioKey }) => scenarioKey === 'responsive_route_draft',
  );
  const networkBranches =
    networkAudit && 'branches' in networkAudit.expectedRequest
      ? networkAudit.expectedRequest.branches
      : [];
  const targetContractsValid =
    networkScenario?.routeContracts?.map(({ key }) => key).join(',') ===
      'manual,confirmation' &&
    responsiveScenario?.routeContracts?.map(({ key }) => key).join(',') ===
      'manual,confirmation,execution' &&
    networkBranches.length === 2 &&
    networkBranches.some(
      ({ routeKey, request: expected, automaticRetry }) =>
        routeKey === 'manual' &&
        expected.method === 'PATCH' &&
        expected.resource === 'manual-review' &&
        expected.count === '1' &&
        automaticRetry === false,
    ) &&
    networkBranches.some(
      ({ routeKey, request: expected, automaticRetry }) =>
        routeKey === 'confirmation' &&
        expected.method === 'POST' &&
        expected.resource === 'confirm' &&
        expected.count === '1' &&
        automaticRetry === false,
    );
  if (
    B8_AUDIT_MATRIX.length !== 60 ||
    matrixIds.length !== new Set(matrixIds).size ||
    matrixIds.some((auditId) => !expectedIds.has(auditId)) ||
    B8_AUDIT_IDS.some((auditId) => !matrixIdSet.has(auditId)) ||
    scenarioIds.length !== 60 ||
    scenarioIds.length !== new Set(scenarioIds).size ||
    scenarioKeys.length !== new Set(scenarioKeys).size ||
    !ownersValid ||
    !entriesMatchScenarios ||
    !routeContractsValid ||
    !targetContractsValid ||
    coreCount !== 39 ||
    resilienceCount !== 21 ||
    B8_DEFAULT_NAMESPACES['core-workflow'] ===
      B8_DEFAULT_NAMESPACES['resilience-security']
  ) {
    throw new B8FixtureError(
      'B8_FIXTURE_CONTRACT_INVALID',
      'The fixed 60-item B8 profile and primary-owner contract is invalid',
    );
  }
}

const ALLOWED_MANIFEST_KEYS = new Set([
  'namespace',
  'databaseName',
  'profile',
  'phase',
  'roles',
  'role',
  'loginIdentifier',
  'displayName',
  'scenarios',
  'scenarioKey',
  'primaryOwnerAuditId',
  'auditIds',
  'preparedState',
  'routes',
  'key',
  'path',
  'auditMatrix',
  'auditId',
  'primaryRole',
  'expectedRequest',
  'branches',
  'routeKey',
  'request',
  'method',
  'resource',
  'count',
  'bodyWhitelist',
  'expectedHttpStatus',
  'automaticRetry',
  'postBrowserSideEffect',
  'visitStatus',
  'scaleInstanceStatus',
  'scoreResult',
  'presence',
  'status',
  'reviewQueue',
  'warning',
  'confirmationReadiness',
  'itemResponseEditability',
  'mediaDraftTarget',
  'requiresIndependentSession',
  'verificationFlags',
  'residualCount',
  'matched',
  'expectedSummary',
]);

const FORBIDDEN_VALUE_PATTERN =
  /(mongodb(?:\+srv)?:\/\/|cookie|session[_-]?token|passwordhash|objectkey|bucket|rawresponse|expectedvalue|scoringrule)/i;

function scanSafeManifest(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (FORBIDDEN_VALUE_PATTERN.test(value)) {
      throw new B8FixtureError(
        'B8_FIXTURE_MANIFEST_UNSAFE',
        `Safe manifest contains a forbidden value at ${path}`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSafeManifest(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (!ALLOWED_MANIFEST_KEYS.has(key)) {
      throw new B8FixtureError(
        'B8_FIXTURE_MANIFEST_UNSAFE',
        `Safe manifest contains a forbidden field at ${path}.${key}`,
      );
    }
    scanSafeManifest(item, `${path}.${key}`);
  }
}

export function assertB8SafeManifest(value: unknown): void {
  scanSafeManifest(value, 'manifest');
}
