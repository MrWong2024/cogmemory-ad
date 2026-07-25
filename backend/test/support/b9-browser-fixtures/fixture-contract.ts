export const B9_PROFILES = ['core-workflow', 'resilience-security'] as const;

export type B9Profile = (typeof B9_PROFILES)[number];
export type B9VerifyPhase = 'prepared' | 'post-browser';
export type B9ScaleCode = 'mmse' | 'moca';

export const B9_DEFAULT_NAMESPACES: Record<B9Profile, string> = {
  'core-workflow': 'b9c-browser-final',
  'resilience-security': 'b9r-browser-final',
};

export const B9_NAMESPACE_MAX_LENGTH = 28;

export const B9_ROLES = [
  'doctor',
  'admin',
  'nurse',
  'research_assistant',
  'system',
] as const;

export type B9Role = (typeof B9_ROLES)[number];
export type B9AuditId = `B9-${string}`;

export const B9_AUDIT_IDS = Array.from(
  { length: 52 },
  (_, index) => `B9-${(index + 1).toString().padStart(2, '0')}`,
);

export type B9BusinessScenarioKey =
  | 'score_dependency_gate'
  | 'confirmed_latest_not_found'
  | 'confirm_triggers_latest'
  | 'local_write_gate'
  | 'first_compute_success'
  | 'idempotent_compute'
  | 'historical_readonly'
  | 'domain_score_semantics'
  | 'contribution_mapping'
  | 'mapping_technical_summary'
  | 'result_incomplete'
  | 'result_voided'
  | 'compute_conflict'
  | 'source_score_not_final'
  | 'mapping_unavailable'
  | 'auth_401'
  | 'auth_403'
  | 'network_failure'
  | 'privacy_public_surface'
  | 'responsive_result';

export type B9ScenarioKey = 'roles' | B9BusinessScenarioKey;

export type B9ExpectedRequest = {
  method: 'GET' | 'POST' | 'none';
  resource: 'latest' | 'compute' | 'score-confirm' | 'page';
  count: string;
  bodyWhitelist: 'none' | 'confirm' | 'confirm,reviewNote,expectedUpdatedAt';
  faultMode: 'none' | 'abort' | 'mutate-interpretation';
};

export type B9ExpectedRequestStep = {
  routeKey: string;
  request: B9ExpectedRequest;
  expectedHttpStatus: string;
  automaticRetry: false;
};

export type B9ExpectedRequestContract =
  | B9ExpectedRequest
  | { sequence: readonly B9ExpectedRequestStep[] }
  | { branches: readonly B9ExpectedRequestStep[] };

export type B9PostBrowserSideEffect =
  | 'none'
  | 'score-confirmation-only'
  | 'create-run-one-domain-result'
  | 'conflict-resource-unchanged';

export type B9LocalPrerequisite =
  | 'none'
  | 'answer-dirty-capable'
  | 'media-dirty-capable'
  | 'manual-score-dirty-capable'
  | 'score-confirm-dirty-capable'
  | 'score-writing-capable';

export type B9RoutePreparedContract = {
  key: string;
  auditIds: readonly B9AuditId[];
  preparedState: string;
  visitStatus: 'in_progress' | 'completed';
  scaleInstanceStatus: 'draft' | 'completed' | 'locked' | 'voided';
  scoreResult: {
    presence: 'required' | 'absent';
    status:
      | 'needs_review'
      | 'computed'
      | 'confirmed'
      | 'locked'
      | 'voided'
      | 'absent';
    isFinal: boolean;
    confirmationFact: 'required' | 'absent' | 'not-applicable';
    versionBinding: 'exact' | 'not-applicable';
  };
  cognitiveDomainResult: {
    presence: 'required' | 'absent' | 'conflict-resource-only';
    status:
      | 'draft'
      | 'computed'
      | 'locked'
      | 'voided'
      | 'absent'
      | 'conflict-resource';
    runNo: 'one' | 'zero-conflict-resource' | 'absent';
    structure:
      | 'complete-derived'
      | 'complete-rich'
      | 'incomplete'
      | 'absent'
      | 'conflict-resource';
  };
  localPrerequisite: B9LocalPrerequisite;
  expectedRequest: B9ExpectedRequestContract;
  expectedHttpStatus: string;
  automaticRetry: false;
  postBrowserSideEffect: B9PostBrowserSideEffect;
};

export type B9VerificationFlag =
  | 'independent-session'
  | 'network'
  | 'privacy'
  | 'viewport';

export type B9AuditContractEntry = {
  auditId: B9AuditId;
  profile: B9Profile;
  scenarioKey: B9BusinessScenarioKey;
  routeKey: string;
  primaryRole: B9Role;
  preparedState: string;
  expectedRequest: B9ExpectedRequestContract;
  expectedHttpStatus: string;
  postBrowserSideEffect: B9PostBrowserSideEffect;
  requiresIndependentSession: boolean;
  requiresNetworkFault: boolean;
  requiresPrivacyVerification: boolean;
  requiresViewportVerification: boolean;
  verificationFlags: readonly B9VerificationFlag[];
};

export type B9ScenarioDefinition = {
  scenarioKey: B9BusinessScenarioKey;
  profile: B9Profile;
  ordinal: number;
  scaleCode: B9ScaleCode;
  primaryOwnerAuditId: B9AuditId;
  auditIds: readonly B9AuditId[];
  preparedState: string;
  routeContracts: readonly B9RoutePreparedContract[];
};

function request(
  method: B9ExpectedRequest['method'],
  resource: B9ExpectedRequest['resource'],
  count: string,
  bodyWhitelist: B9ExpectedRequest['bodyWhitelist'] = 'none',
  faultMode: B9ExpectedRequest['faultMode'] = 'none',
): B9ExpectedRequest {
  return { method, resource, count, bodyWhitelist, faultMode };
}

const noRequest = request('none', 'page', '0');
const latestOnce = request('GET', 'latest', '1');
const computeOnce = request('POST', 'compute', '1', 'confirm');
const confirmOnce = request(
  'POST',
  'score-confirm',
  '1',
  'confirm,reviewNote,expectedUpdatedAt',
);

function sequence(
  steps: readonly B9ExpectedRequestStep[],
): B9ExpectedRequestContract {
  return { sequence: steps };
}

function branches(
  steps: readonly B9ExpectedRequestStep[],
): B9ExpectedRequestContract {
  return { branches: steps };
}

function entry(
  auditId: B9AuditId,
  profile: B9Profile,
  scenarioKey: B9BusinessScenarioKey,
  routeKey: string,
  primaryRole: B9Role,
  preparedState: string,
  expectedRequest: B9ExpectedRequestContract,
  expectedHttpStatus: string,
  postBrowserSideEffect: B9PostBrowserSideEffect,
  verificationFlags: readonly B9VerificationFlag[] = [],
): B9AuditContractEntry {
  return {
    auditId,
    profile,
    scenarioKey,
    routeKey,
    primaryRole,
    preparedState,
    expectedRequest,
    expectedHttpStatus,
    postBrowserSideEffect,
    requiresIndependentSession: verificationFlags.includes(
      'independent-session',
    ),
    requiresNetworkFault: verificationFlags.includes('network'),
    requiresPrivacyVerification: verificationFlags.includes('privacy'),
    requiresViewportVerification: verificationFlags.includes('viewport'),
    verificationFlags,
  };
}

const confirmThenLatest = sequence([
  {
    routeKey: 'base',
    request: confirmOnce,
    expectedHttpStatus: '200',
    automaticRetry: false,
  },
  {
    routeKey: 'base',
    request: latestOnce,
    expectedHttpStatus: '404',
    automaticRetry: false,
  },
]);

const conflictThenLatest = sequence([
  {
    routeKey: 'base',
    request: computeOnce,
    expectedHttpStatus: '409 COGNITIVE_DOMAIN_COMPUTATION_CONFLICT',
    automaticRetry: false,
  },
  {
    routeKey: 'base',
    request: latestOnce,
    expectedHttpStatus: '404 COGNITIVE_DOMAIN_RESULT_NOT_FOUND',
    automaticRetry: false,
  },
]);

const networkBranches = branches([
  {
    routeKey: 'latest',
    request: request('GET', 'latest', '1', 'none', 'abort'),
    expectedHttpStatus: 'network-error',
    automaticRetry: false,
  },
  {
    routeKey: 'compute',
    request: request('POST', 'compute', '1', 'confirm', 'abort'),
    expectedHttpStatus: 'network-error',
    automaticRetry: false,
  },
]);

export const B9_AUDIT_MATRIX = [
  entry(
    'B9-01',
    'core-workflow',
    'score_dependency_gate',
    'no_score',
    'doctor',
    'completed instance without a ScoreResult',
    noRequest,
    'none',
    'none',
  ),
  entry(
    'B9-02',
    'core-workflow',
    'score_dependency_gate',
    'needs_review',
    'doctor',
    'needs_review and computed-unconfirmed ScoreResult variants',
    noRequest,
    'none',
    'none',
  ),
  entry(
    'B9-03',
    'core-workflow',
    'confirmed_latest_not_found',
    'base',
    'doctor',
    'confirmed final ScoreResult without a cognitive-domain result',
    latestOnce,
    '404 COGNITIVE_DOMAIN_RESULT_NOT_FOUND',
    'none',
  ),
  entry(
    'B9-04',
    'core-workflow',
    'confirm_triggers_latest',
    'base',
    'doctor',
    'computed confirmation-ready ScoreResult',
    confirmThenLatest,
    '200 then 404',
    'score-confirmation-only',
    ['independent-session'],
  ),
  entry(
    'B9-05',
    'core-workflow',
    'confirmed_latest_not_found',
    'base',
    'doctor',
    'confirmed final ScoreResult without a cognitive-domain result',
    latestOnce,
    '404 COGNITIVE_DOMAIN_RESULT_NOT_FOUND',
    'none',
  ),
  entry(
    'B9-06',
    'core-workflow',
    'confirmed_latest_not_found',
    'base',
    'doctor',
    'page load after latest not-found',
    latestOnce,
    '404; compute count remains 0',
    'none',
  ),
  ...(['B9-07', 'B9-08'] as const).map((auditId) =>
    entry(
      auditId,
      'core-workflow',
      'first_compute_success',
      'base',
      'doctor',
      'confirmed final ScoreResult and no cognitive-domain result',
      noRequest,
      'none before explicit confirmation',
      'create-run-one-domain-result',
    ),
  ),
  entry(
    'B9-09',
    'core-workflow',
    'first_compute_success',
    'base',
    'doctor',
    'explicit compute confirmation on an eligible route',
    computeOnce,
    '200',
    'create-run-one-domain-result',
  ),
  entry(
    'B9-10',
    'core-workflow',
    'local_write_gate',
    'answer_dirty',
    'doctor',
    'independent legal local answer, media, manual-score, confirmation, and writing prerequisites',
    noRequest,
    'none',
    'none',
  ),
  ...(['B9-11', 'B9-12'] as const).map((auditId) =>
    entry(
      auditId,
      'core-workflow',
      'first_compute_success',
      'base',
      'doctor',
      'one explicit compute request with a held write lock',
      computeOnce,
      '200',
      'create-run-one-domain-result',
    ),
  ),
  entry(
    'B9-13',
    'core-workflow',
    'idempotent_compute',
    'base',
    'nurse',
    'existing valid computed runNo=1 result',
    computeOnce,
    '200 alreadyComputed=true',
    'none',
  ),
  entry(
    'B9-14',
    'core-workflow',
    'idempotent_compute',
    'base',
    'nurse',
    'existing valid computed runNo=1 result',
    latestOnce,
    '200',
    'none',
  ),
  entry(
    'B9-15',
    'core-workflow',
    'idempotent_compute',
    'base',
    'nurse',
    'existing valid computed runNo=1 result',
    noRequest,
    'none; no rerun control',
    'none',
  ),
  entry(
    'B9-16',
    'core-workflow',
    'historical_readonly',
    'computed',
    'nurse',
    'computed historical result',
    latestOnce,
    '200',
    'none',
  ),
  entry(
    'B9-17',
    'core-workflow',
    'historical_readonly',
    'locked',
    'nurse',
    'locked and voided historical result variants',
    latestOnce,
    '200',
    'none',
  ),
  ...(['B9-18', 'B9-19', 'B9-20', 'B9-21', 'B9-22', 'B9-23'] as const).map(
    (auditId) =>
      entry(
        auditId,
        'core-workflow',
        'domain_score_semantics',
        'base',
        'doctor',
        'rich multi-domain result with null score, non-zero min, and server percentages',
        latestOnce,
        '200',
        'none',
      ),
  ),
  ...(
    [
      'B9-24',
      'B9-25',
      'B9-26',
      'B9-27',
      'B9-28',
      'B9-29',
      'B9-30',
      'B9-31',
      'B9-32',
    ] as const
  ).map((auditId) =>
    entry(
      auditId,
      'core-workflow',
      'contribution_mapping',
      'base',
      'doctor',
      'single-domain, multi-domain, excluded, null-target, and deduplicated contribution result',
      latestOnce,
      '200',
      'none',
    ),
  ),
  ...(['B9-33', 'B9-34'] as const).map((auditId) =>
    entry(
      auditId,
      'core-workflow',
      'mapping_technical_summary',
      'base',
      'admin',
      'complete mapping policy and four interpretation literals',
      latestOnce,
      '200',
      'none',
    ),
  ),
  entry(
    'B9-35',
    'core-workflow',
    'mapping_technical_summary',
    'interpretation_anomaly',
    'admin',
    'complete result used for a Browser-controlled interpretation response mutation',
    request('GET', 'latest', '1', 'none', 'mutate-interpretation'),
    '200 then controlled malformed interpretation',
    'none',
    ['network'],
  ),
  ...(['B9-36', 'B9-37', 'B9-38'] as const).map((auditId) =>
    entry(
      auditId,
      'core-workflow',
      'mapping_technical_summary',
      'base',
      'admin',
      'complete computation, versionTrace, source summary, and warning result',
      latestOnce,
      '200',
      'none',
    ),
  ),
  entry(
    'B9-39',
    'resilience-security',
    'result_incomplete',
    'base',
    'admin',
    'draft runNo=1 cognitive-domain result',
    latestOnce,
    '409 COGNITIVE_DOMAIN_RESULT_INCOMPLETE',
    'none',
  ),
  entry(
    'B9-40',
    'resilience-security',
    'result_voided',
    'base',
    'doctor',
    'voided runNo=1 cognitive-domain result',
    latestOnce,
    '200',
    'none',
  ),
  entry(
    'B9-41',
    'resilience-security',
    'compute_conflict',
    'base',
    'doctor',
    'confirmed source with namespace-owned deterministic conflict resources',
    conflictThenLatest,
    '409 then 404',
    'conflict-resource-unchanged',
    ['independent-session'],
  ),
  entry(
    'B9-42',
    'resilience-security',
    'source_score_not_final',
    'base',
    'doctor',
    'computed unconfirmed source ScoreResult',
    computeOnce,
    '409 COGNITIVE_DOMAIN_SOURCE_SCORE_NOT_FINAL',
    'none',
  ),
  entry(
    'B9-43',
    'resilience-security',
    'mapping_unavailable',
    'base',
    'admin',
    'confirmed source bound to a namespace-owned version with no domain mapping',
    computeOnce,
    '409 COGNITIVE_DOMAIN_MAPPING_UNAVAILABLE',
    'none',
  ),
  entry(
    'B9-44',
    'resilience-security',
    'auth_401',
    'base',
    'doctor',
    'complete result accessed with an invalid independent Session',
    latestOnce,
    '401',
    'none',
    ['independent-session', 'privacy'],
  ),
  entry(
    'B9-45',
    'resilience-security',
    'auth_403',
    'base',
    'system',
    'complete result accessed with a system-role Session',
    latestOnce,
    '403',
    'none',
    ['independent-session', 'privacy'],
  ),
  entry(
    'B9-46',
    'resilience-security',
    'network_failure',
    'latest',
    'nurse',
    'independent complete-result latest and eligible compute routes',
    networkBranches,
    'network-error',
    'none',
    ['independent-session', 'network', 'privacy'],
  ),
  ...(['B9-47', 'B9-48', 'B9-49', 'B9-50'] as const).map((auditId) =>
    entry(
      auditId,
      'resilience-security',
      'privacy_public_surface',
      'base',
      'research_assistant',
      'complete result and source containing internal-only synthetic sentinels',
      latestOnce,
      '200',
      'none',
      ['privacy'],
    ),
  ),
  entry(
    'B9-51',
    'resilience-security',
    'responsive_result',
    'base',
    'doctor',
    'content-complete rich result for three viewport checks',
    latestOnce,
    '200',
    'none',
    ['viewport', 'privacy'],
  ),
  entry(
    'B9-52',
    'resilience-security',
    'privacy_public_surface',
    'base',
    'research_assistant',
    'manually constructed de-identified MMSE/MoCA data only',
    latestOnce,
    '200',
    'none',
    ['privacy'],
  ),
] as const satisfies readonly B9AuditContractEntry[];

function score(
  status: B9RoutePreparedContract['scoreResult']['status'],
  options: {
    isFinal?: boolean;
    confirmationFact?: B9RoutePreparedContract['scoreResult']['confirmationFact'];
    versionBinding?: B9RoutePreparedContract['scoreResult']['versionBinding'];
  } = {},
): B9RoutePreparedContract['scoreResult'] {
  if (status === 'absent') {
    return {
      presence: 'absent',
      status,
      isFinal: false,
      confirmationFact: 'not-applicable',
      versionBinding: 'not-applicable',
    };
  }
  return {
    presence: 'required',
    status,
    isFinal: options.isFinal ?? (status === 'confirmed' || status === 'locked'),
    confirmationFact:
      options.confirmationFact ??
      (status === 'confirmed' || status === 'locked' ? 'required' : 'absent'),
    versionBinding: options.versionBinding ?? 'exact',
  };
}

function domain(
  status: B9RoutePreparedContract['cognitiveDomainResult']['status'],
  structure: B9RoutePreparedContract['cognitiveDomainResult']['structure'] = 'complete-derived',
): B9RoutePreparedContract['cognitiveDomainResult'] {
  if (status === 'absent') {
    return {
      presence: 'absent',
      status,
      runNo: 'absent',
      structure: 'absent',
    };
  }
  if (status === 'conflict-resource') {
    return {
      presence: 'conflict-resource-only',
      status,
      runNo: 'zero-conflict-resource',
      structure: 'conflict-resource',
    };
  }
  return {
    presence: 'required',
    status,
    runNo: 'one',
    structure,
  };
}

function route(
  key: string,
  auditIds: readonly B9AuditId[],
  preparedState: string,
  scoreResult: B9RoutePreparedContract['scoreResult'],
  cognitiveDomainResult: B9RoutePreparedContract['cognitiveDomainResult'],
  expectedRequest: B9ExpectedRequestContract,
  expectedHttpStatus: string,
  postBrowserSideEffect: B9PostBrowserSideEffect,
  options: {
    visitStatus?: B9RoutePreparedContract['visitStatus'];
    scaleInstanceStatus?: B9RoutePreparedContract['scaleInstanceStatus'];
    localPrerequisite?: B9LocalPrerequisite;
  } = {},
): B9RoutePreparedContract {
  return {
    key,
    auditIds,
    preparedState,
    visitStatus: options.visitStatus ?? 'in_progress',
    scaleInstanceStatus: options.scaleInstanceStatus ?? 'completed',
    scoreResult,
    cognitiveDomainResult,
    localPrerequisite: options.localPrerequisite ?? 'none',
    expectedRequest,
    expectedHttpStatus,
    automaticRetry: false,
    postBrowserSideEffect,
  };
}

const richDomain = domain('computed', 'complete-rich');

export const B9_SCENARIOS = [
  {
    scenarioKey: 'score_dependency_gate',
    profile: 'core-workflow',
    ordinal: 1,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B9-01',
    auditIds: ['B9-01', 'B9-02'],
    preparedState: 'score dependency matrix',
    routeContracts: [
      route(
        'no_score',
        ['B9-01'],
        'completed without ScoreResult',
        score('absent'),
        domain('absent'),
        noRequest,
        'none',
        'none',
      ),
      route(
        'needs_review',
        ['B9-02'],
        'needs_review source',
        score('needs_review'),
        domain('absent'),
        noRequest,
        'none',
        'none',
      ),
      route(
        'computed_unconfirmed',
        ['B9-02'],
        'computed unconfirmed source',
        score('computed'),
        domain('absent'),
        noRequest,
        'none',
        'none',
      ),
    ],
  },
  {
    scenarioKey: 'confirmed_latest_not_found',
    profile: 'core-workflow',
    ordinal: 2,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B9-03',
    auditIds: ['B9-03', 'B9-05', 'B9-06'],
    preparedState: 'confirmed source without a domain result',
    routeContracts: [
      route(
        'base',
        ['B9-03', 'B9-05', 'B9-06'],
        'confirmed source and no domain result',
        score('confirmed'),
        domain('absent'),
        latestOnce,
        '404',
        'none',
      ),
    ],
  },
  {
    scenarioKey: 'confirm_triggers_latest',
    profile: 'core-workflow',
    ordinal: 3,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B9-04',
    auditIds: ['B9-04'],
    preparedState: 'computed source ready for one real Browser B8 confirmation',
    routeContracts: [
      route(
        'base',
        ['B9-04'],
        'computed confirmation-ready source and no domain result',
        score('computed'),
        domain('absent'),
        confirmThenLatest,
        '200 then 404',
        'score-confirmation-only',
      ),
    ],
  },
  {
    scenarioKey: 'local_write_gate',
    profile: 'core-workflow',
    ordinal: 4,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B9-10',
    auditIds: ['B9-10'],
    preparedState: 'independent legal local dirty and writing targets',
    routeContracts: [
      route(
        'answer_dirty',
        ['B9-10'],
        'editable answer target',
        score('absent'),
        domain('absent'),
        noRequest,
        'none',
        'none',
        {
          scaleInstanceStatus: 'draft',
          localPrerequisite: 'answer-dirty-capable',
        },
      ),
      route(
        'media_dirty',
        ['B9-10'],
        'editable media target',
        score('absent'),
        domain('absent'),
        noRequest,
        'none',
        'none',
        {
          scaleInstanceStatus: 'draft',
          localPrerequisite: 'media-dirty-capable',
        },
      ),
      route(
        'manual_score_dirty',
        ['B9-10'],
        'needs_review manual-score target',
        score('needs_review'),
        domain('absent'),
        noRequest,
        'none',
        'none',
        { localPrerequisite: 'manual-score-dirty-capable' },
      ),
      route(
        'confirmation_dirty',
        ['B9-10'],
        'computed confirmation-draft target',
        score('computed'),
        domain('absent'),
        noRequest,
        'none',
        'none',
        { localPrerequisite: 'score-confirm-dirty-capable' },
      ),
      route(
        'score_writing',
        ['B9-10'],
        'computed score-writing target',
        score('computed'),
        domain('absent'),
        noRequest,
        'none',
        'none',
        { localPrerequisite: 'score-writing-capable' },
      ),
    ],
  },
  {
    scenarioKey: 'first_compute_success',
    profile: 'core-workflow',
    ordinal: 5,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B9-07',
    auditIds: ['B9-07', 'B9-08', 'B9-09', 'B9-11', 'B9-12'],
    preparedState: 'eligible first compute target',
    routeContracts: [
      route(
        'base',
        ['B9-07', 'B9-08', 'B9-09', 'B9-11', 'B9-12'],
        'confirmed source and no domain result',
        score('confirmed'),
        domain('absent'),
        computeOnce,
        '200',
        'create-run-one-domain-result',
      ),
    ],
  },
  {
    scenarioKey: 'idempotent_compute',
    profile: 'core-workflow',
    ordinal: 6,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B9-13',
    auditIds: ['B9-13', 'B9-14', 'B9-15'],
    preparedState: 'existing valid computed result',
    routeContracts: [
      route(
        'base',
        ['B9-13', 'B9-14', 'B9-15'],
        'confirmed source and existing computed runNo=1 result',
        score('confirmed'),
        domain('computed'),
        computeOnce,
        '200 alreadyComputed=true',
        'none',
      ),
    ],
  },
  {
    scenarioKey: 'historical_readonly',
    profile: 'core-workflow',
    ordinal: 7,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B9-16',
    auditIds: ['B9-16', 'B9-17'],
    preparedState: 'computed, locked, and voided result variants',
    routeContracts: [
      route(
        'computed',
        ['B9-16'],
        'computed historical result',
        score('confirmed'),
        domain('computed'),
        latestOnce,
        '200',
        'none',
      ),
      route(
        'locked',
        ['B9-17'],
        'locked historical result',
        score('locked'),
        domain('locked'),
        latestOnce,
        '200',
        'none',
        { visitStatus: 'completed', scaleInstanceStatus: 'locked' },
      ),
      route(
        'voided',
        ['B9-17'],
        'voided historical result',
        score('voided', { isFinal: false, confirmationFact: 'required' }),
        domain('voided'),
        latestOnce,
        '200',
        'none',
        { visitStatus: 'completed', scaleInstanceStatus: 'voided' },
      ),
    ],
  },
  {
    scenarioKey: 'domain_score_semantics',
    profile: 'core-workflow',
    ordinal: 8,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B9-18',
    auditIds: ['B9-18', 'B9-19', 'B9-20', 'B9-21', 'B9-22', 'B9-23'],
    preparedState: 'rich multi-domain score semantics',
    routeContracts: [
      route(
        'base',
        ['B9-18', 'B9-19', 'B9-20', 'B9-21', 'B9-22', 'B9-23'],
        'rich result with server-authored ordering and percentages',
        score('confirmed'),
        richDomain,
        latestOnce,
        '200',
        'none',
      ),
    ],
  },
  {
    scenarioKey: 'contribution_mapping',
    profile: 'core-workflow',
    ordinal: 9,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B9-24',
    auditIds: [
      'B9-24',
      'B9-25',
      'B9-26',
      'B9-27',
      'B9-28',
      'B9-29',
      'B9-30',
      'B9-31',
      'B9-32',
    ],
    preparedState: 'rich contribution and location matrix',
    routeContracts: [
      route(
        'base',
        [
          'B9-24',
          'B9-25',
          'B9-26',
          'B9-27',
          'B9-28',
          'B9-29',
          'B9-30',
          'B9-31',
          'B9-32',
        ],
        'rich result with single, multi, excluded, null, and deduplicated contributions',
        score('confirmed'),
        richDomain,
        latestOnce,
        '200',
        'none',
      ),
    ],
  },
  {
    scenarioKey: 'mapping_technical_summary',
    profile: 'core-workflow',
    ordinal: 10,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B9-33',
    auditIds: ['B9-33', 'B9-34', 'B9-35', 'B9-36', 'B9-37', 'B9-38'],
    preparedState:
      'complete mapping, interpretation, warning, and trace summary',
    routeContracts: [
      route(
        'base',
        ['B9-33', 'B9-34', 'B9-36', 'B9-37', 'B9-38'],
        'complete rich result with one controlled warning',
        score('confirmed'),
        richDomain,
        latestOnce,
        '200',
        'none',
      ),
      route(
        'interpretation_anomaly',
        ['B9-35'],
        'complete rich result for controlled response mutation',
        score('confirmed'),
        richDomain,
        request('GET', 'latest', '1', 'none', 'mutate-interpretation'),
        '200 then controlled malformed interpretation',
        'none',
      ),
    ],
  },
  {
    scenarioKey: 'result_incomplete',
    profile: 'resilience-security',
    ordinal: 1,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B9-39',
    auditIds: ['B9-39'],
    preparedState: 'draft runNo=1 result',
    routeContracts: [
      route(
        'base',
        ['B9-39'],
        'confirmed source and draft result',
        score('confirmed'),
        domain('draft', 'incomplete'),
        latestOnce,
        '409',
        'none',
      ),
    ],
  },
  {
    scenarioKey: 'result_voided',
    profile: 'resilience-security',
    ordinal: 2,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B9-40',
    auditIds: ['B9-40'],
    preparedState: 'voided read-only result',
    routeContracts: [
      route(
        'base',
        ['B9-40'],
        'voided source and result',
        score('voided', { isFinal: false, confirmationFact: 'required' }),
        domain('voided'),
        latestOnce,
        '200',
        'none',
        { visitStatus: 'completed', scaleInstanceStatus: 'voided' },
      ),
    ],
  },
  {
    scenarioKey: 'compute_conflict',
    profile: 'resilience-security',
    ordinal: 3,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B9-41',
    auditIds: ['B9-41'],
    preparedState: 'deterministic namespace-owned conflict setup',
    routeContracts: [
      route(
        'base',
        ['B9-41'],
        'confirmed source plus runNo=0 blocker and partial unique index',
        score('confirmed'),
        domain('conflict-resource'),
        conflictThenLatest,
        '409 then 404',
        'conflict-resource-unchanged',
      ),
    ],
  },
  {
    scenarioKey: 'source_score_not_final',
    profile: 'resilience-security',
    ordinal: 4,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B9-42',
    auditIds: ['B9-42'],
    preparedState: 'computed unconfirmed source',
    routeContracts: [
      route(
        'base',
        ['B9-42'],
        'computed source and no result',
        score('computed'),
        domain('absent'),
        computeOnce,
        '409',
        'none',
      ),
    ],
  },
  {
    scenarioKey: 'mapping_unavailable',
    profile: 'resilience-security',
    ordinal: 5,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B9-43',
    auditIds: ['B9-43'],
    preparedState: 'namespace-owned no-domain mapping version',
    routeContracts: [
      route(
        'base',
        ['B9-43'],
        'confirmed source exactly bound to a namespace-owned mapping-free version',
        score('confirmed'),
        domain('absent'),
        computeOnce,
        '409',
        'none',
      ),
    ],
  },
  {
    scenarioKey: 'auth_401',
    profile: 'resilience-security',
    ordinal: 6,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B9-44',
    auditIds: ['B9-44'],
    preparedState: 'complete result for invalid Session',
    routeContracts: [
      route(
        'base',
        ['B9-44'],
        'complete result with no prepared Session',
        score('confirmed'),
        richDomain,
        latestOnce,
        '401',
        'none',
      ),
    ],
  },
  {
    scenarioKey: 'auth_403',
    profile: 'resilience-security',
    ordinal: 7,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B9-45',
    auditIds: ['B9-45'],
    preparedState: 'complete result for system-role Session',
    routeContracts: [
      route(
        'base',
        ['B9-45'],
        'complete result protected by clinical role guard',
        score('confirmed'),
        richDomain,
        latestOnce,
        '403',
        'none',
      ),
    ],
  },
  {
    scenarioKey: 'network_failure',
    profile: 'resilience-security',
    ordinal: 8,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B9-46',
    auditIds: ['B9-46'],
    preparedState: 'independent latest and compute abort routes',
    routeContracts: [
      route(
        'latest',
        ['B9-46'],
        'complete result latest abort target',
        score('confirmed'),
        richDomain,
        request('GET', 'latest', '1', 'none', 'abort'),
        'network-error',
        'none',
      ),
      route(
        'compute',
        ['B9-46'],
        'eligible first compute abort target',
        score('confirmed'),
        domain('absent'),
        request('POST', 'compute', '1', 'confirm', 'abort'),
        'network-error',
        'none',
      ),
    ],
  },
  {
    scenarioKey: 'privacy_public_surface',
    profile: 'resilience-security',
    ordinal: 9,
    scaleCode: 'mmse',
    primaryOwnerAuditId: 'B9-47',
    auditIds: ['B9-47', 'B9-48', 'B9-49', 'B9-50', 'B9-52'],
    preparedState: 'rich result with internal-only synthetic sentinels',
    routeContracts: [
      route(
        'base',
        ['B9-47', 'B9-48', 'B9-49', 'B9-50', 'B9-52'],
        'de-identified complete result with private storage-only fields',
        score('confirmed'),
        richDomain,
        latestOnce,
        '200',
        'none',
      ),
    ],
  },
  {
    scenarioKey: 'responsive_result',
    profile: 'resilience-security',
    ordinal: 10,
    scaleCode: 'moca',
    primaryOwnerAuditId: 'B9-51',
    auditIds: ['B9-51'],
    preparedState: 'content-complete rich result',
    routeContracts: [
      route(
        'base',
        ['B9-51'],
        'rich result for 1280x720, 768x900, and 390x844',
        score('confirmed'),
        richDomain,
        latestOnce,
        '200',
        'none',
      ),
    ],
  },
] as const satisfies readonly B9ScenarioDefinition[];

export type B9SafeRoleManifest = {
  role: B9Role;
  loginIdentifier: string;
  displayName: string;
};

export type B9SafeRoute = {
  key: string;
  auditIds: readonly B9AuditId[];
  navigationLabel: string;
  pathTemplate: string;
  preparedState: string;
  expectedRequest: B9ExpectedRequestContract;
  expectedHttpStatus: string;
  postBrowserSideEffect: B9PostBrowserSideEffect;
  localPrerequisite: B9LocalPrerequisite;
};

export type B9SafeScenarioManifest = {
  scenarioKey: B9BusinessScenarioKey;
  primaryOwnerAuditId: B9AuditId;
  auditIds: readonly B9AuditId[];
  preparedState: string;
  routes: B9SafeRoute[];
};

export type B9SafeManifest = {
  namespace: string;
  databaseName: string;
  profile: B9Profile;
  phase: B9VerifyPhase;
  roles: B9SafeRoleManifest[];
  scenarios: B9SafeScenarioManifest[];
  auditMatrix: readonly B9AuditContractEntry[];
  expectedSummary: string;
};

export type B9SafeCleanupSummary = {
  namespace: string;
  databaseName: string;
  profile: B9Profile;
  residualCount: number;
  matched: boolean;
  expectedSummary: string;
};

export type B9RuntimeEnvironment = {
  nodeEnv: string | undefined;
  appEnv: string | undefined;
  databasePurpose: string | undefined;
  databaseName: string;
  storageDriver: string | undefined;
  llmProvider: string | undefined;
  smsProvider: string | undefined;
  sessionCookieSecure: boolean | undefined;
};

export const B9_VERIFY_STAGES = [
  'contract',
  'initial_snapshot',
  'users_and_password',
  'root_matrix',
  'scenario_facts',
  'post_browser_transitions',
  'profile_isolation',
  'global_seed',
  'safe_manifest',
  'final_snapshot',
] as const;

export type B9VerifyStage = (typeof B9_VERIFY_STAGES)[number];

export class B9FixtureError extends Error {
  constructor(
    readonly code: string,
    readonly safeMessage: string,
    readonly profile?: B9Profile,
    readonly scenarioKey?: B9ScenarioKey,
    readonly verifyStage?: B9VerifyStage,
    readonly verifyPhase?: B9VerifyPhase,
  ) {
    super(scenarioKey ? `${code}:${scenarioKey}` : code);
  }
}

export type B9SafeErrorPayload = {
  ok: false;
  code: string;
  message: string;
  profile?: B9Profile;
  scenarioKey?: B9ScenarioKey;
  stage?: B9VerifyStage;
  phase?: B9VerifyPhase;
};

export function toB9SafeErrorPayload(error: unknown): B9SafeErrorPayload {
  if (error instanceof B9FixtureError) {
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
    code: 'B9_FIXTURE_OPERATION_FAILED',
    message:
      'B9 browser fixture operation failed without exposing internal details',
  };
}

export function scenarioDefinitionsFor(
  profile: B9Profile,
): readonly B9ScenarioDefinition[] {
  return B9_SCENARIOS.filter((scenario) => scenario.profile === profile);
}

export function auditMatrixFor(
  profile: B9Profile,
): readonly B9AuditContractEntry[] {
  return B9_AUDIT_MATRIX.filter((entry) => entry.profile === profile);
}

export function routeContractFor(
  profile: B9Profile,
  scenarioKey: B9BusinessScenarioKey,
  routeKey: string,
): B9RoutePreparedContract {
  const scenario = scenarioDefinitionsFor(profile).find(
    (candidate) => candidate.scenarioKey === scenarioKey,
  );
  const routeContract = scenario?.routeContracts.find(
    (candidate) => candidate.key === routeKey,
  );
  if (!routeContract) {
    throw new B9FixtureError(
      'B9_FIXTURE_ROUTE_CONTRACT_MISSING',
      'The requested route is not part of the fixed B9 profile contract',
      profile,
      scenarioKey,
    );
  }
  return routeContract;
}

export function validateB9Profile(value: string): B9Profile {
  if (value !== 'core-workflow' && value !== 'resilience-security') {
    throw new B9FixtureError(
      'B9_FIXTURE_PROFILE_INVALID',
      'Profile must be core-workflow or resilience-security',
    );
  }
  return value;
}

function namespacePrefixFor(profile: B9Profile): string {
  return profile === 'core-workflow' ? 'b9c-' : 'b9r-';
}

export function validateB9Namespace(profile: B9Profile, value: string): string {
  if (
    value.length < 7 ||
    value.length > B9_NAMESPACE_MAX_LENGTH ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
    !value.startsWith(namespacePrefixFor(profile))
  ) {
    throw new B9FixtureError(
      'B9_FIXTURE_NAMESPACE_INVALID',
      `Namespace must use the ${namespacePrefixFor(profile)} profile prefix and contain only lowercase letters, digits, or single hyphens`,
      profile,
    );
  }
  return value;
}

export function assertB9PreImportEnvironment(
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== 'test') {
    throw new B9FixtureError(
      'B9_FIXTURE_ENVIRONMENT_UNSAFE',
      'B9 fixtures require NODE_ENV=test before application import',
    );
  }
}

export function assertB9RuntimeEnvironment(env: B9RuntimeEnvironment): void {
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
    throw new B9FixtureError(
      'B9_FIXTURE_ENVIRONMENT_UNSAFE',
      'B9 fixtures require the exact isolated test database and fake or stub external services',
    );
  }
}

export function requireB9FixturePassword(value: string | undefined): string {
  if (!value || value.length < 12) {
    throw new B9FixtureError(
      'B9_FIXTURE_PASSWORD_REQUIRED',
      'B9_FIXTURE_PASSWORD must be provided through the process environment',
    );
  }
  return value;
}

function profileCode(profile: B9Profile): 'B9C' | 'B9R' {
  return profile === 'core-workflow' ? 'B9C' : 'B9R';
}

export function accountNameFor(
  profile: B9Profile,
  namespace: string,
  role: B9Role,
): string {
  const prefix = profile === 'core-workflow' ? 'b9cfx' : 'b9rfx';
  return `${prefix}-${namespace}-${role.replace('_', '-')}`;
}

export function displayNameFor(profile: B9Profile, role: B9Role): string {
  const profileName = profile === 'core-workflow' ? '核心流程' : '韧性安全';
  const names: Record<B9Role, string> = {
    doctor: '医生',
    admin: '管理员',
    nurse: '护士',
    research_assistant: '科研助理',
    system: '系统账号',
  };
  return `B9 ${profileName}测试${names[role]}`;
}

export function scenarioSubjectCodeFor(
  profile: B9Profile,
  namespace: string,
  ordinal: number,
): string {
  return `${profileCode(profile)}-${namespace.toUpperCase()}-${ordinal
    .toString()
    .padStart(2, '0')}`;
}

export function scenarioVisitCodeFor(
  profile: B9Profile,
  namespace: string,
  ordinal: number,
  routeKey: string,
): string {
  return `${scenarioSubjectCodeFor(profile, namespace, ordinal)}-${routeKey
    .replace(/_/g, '-')
    .toUpperCase()}`;
}

export function mappingUnavailableVersionFor(namespace: string): string {
  return `b9-${namespace}-mapping-unavailable`;
}

export function conflictIndexNameFor(namespace: string): string {
  return `b9_${namespace.replace(/-/g, '_')}_compute_conflict`;
}

export function assertB9Contract(): void {
  const expectedIds = new Set<string>(B9_AUDIT_IDS);
  const matrixIds = B9_AUDIT_MATRIX.map(({ auditId }) => auditId);
  const matrixIdSet = new Set<string>(matrixIds);
  const scenarioIds = B9_SCENARIOS.flatMap(({ auditIds }) => auditIds);
  const scenarioKeys = B9_SCENARIOS.map(({ scenarioKey }) => scenarioKey);
  const routes = B9_SCENARIOS.flatMap((scenario) =>
    scenario.routeContracts.map((routeContract) => ({
      scenario,
      routeContract,
    })),
  );
  const ownersValid = B9_SCENARIOS.every((scenario) => {
    const owner = B9_AUDIT_MATRIX.find(
      ({ auditId }) => auditId === scenario.primaryOwnerAuditId,
    );
    return (
      new Set<string>(scenario.auditIds).has(scenario.primaryOwnerAuditId) &&
      owner?.profile === scenario.profile &&
      owner.scenarioKey === scenario.scenarioKey
    );
  });
  const entriesValid = B9_AUDIT_MATRIX.every((audit) => {
    const scenario = B9_SCENARIOS.find(
      (candidate) =>
        candidate.profile === audit.profile &&
        candidate.scenarioKey === audit.scenarioKey,
    );
    if (!scenario) {
      return false;
    }
    return (
      new Set<string>(scenario.auditIds).has(audit.auditId) &&
      scenario.routeContracts.some(
        (routeContract) =>
          routeContract.key === audit.routeKey &&
          new Set<string>(routeContract.auditIds).has(audit.auditId),
      )
    );
  });
  const routesValid = routes.every(
    ({ scenario, routeContract }) =>
      routeContract.auditIds.length > 0 &&
      routeContract.auditIds.every((auditId) =>
        new Set<string>(scenario.auditIds).has(auditId),
      ) &&
      routeContract.automaticRetry === false,
  );
  const orderedProfileOwnership = B9_AUDIT_MATRIX.every((audit, index) =>
    index < 38
      ? audit.profile === 'core-workflow'
      : audit.profile === 'resilience-security',
  );
  const network = B9_AUDIT_MATRIX.find(({ auditId }) => auditId === 'B9-46');
  const networkContract =
    network && 'branches' in network.expectedRequest
      ? network.expectedRequest.branches
      : [];
  if (
    B9_AUDIT_MATRIX.length !== 52 ||
    matrixIds.length !== matrixIdSet.size ||
    matrixIds.some((auditId) => !expectedIds.has(auditId)) ||
    B9_AUDIT_IDS.some((auditId) => !matrixIdSet.has(auditId)) ||
    scenarioIds.length !== 52 ||
    scenarioIds.length !== new Set(scenarioIds).size ||
    scenarioKeys.length !== new Set(scenarioKeys).size ||
    auditMatrixFor('core-workflow').length !== 38 ||
    auditMatrixFor('resilience-security').length !== 14 ||
    scenarioDefinitionsFor('core-workflow').length !== 10 ||
    scenarioDefinitionsFor('resilience-security').length !== 10 ||
    !ownersValid ||
    !entriesValid ||
    !routesValid ||
    !orderedProfileOwnership ||
    networkContract.length !== 2 ||
    B9_DEFAULT_NAMESPACES['core-workflow'] ===
      B9_DEFAULT_NAMESPACES['resilience-security']
  ) {
    throw new B9FixtureError(
      'B9_FIXTURE_CONTRACT_INVALID',
      'The fixed 52-item B9 profile, route, and primary-owner contract is invalid',
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
  'navigationLabel',
  'pathTemplate',
  'expectedRequest',
  'sequence',
  'branches',
  'routeKey',
  'request',
  'method',
  'resource',
  'count',
  'bodyWhitelist',
  'faultMode',
  'expectedHttpStatus',
  'automaticRetry',
  'postBrowserSideEffect',
  'localPrerequisite',
  'auditMatrix',
  'auditId',
  'primaryRole',
  'requiresIndependentSession',
  'requiresNetworkFault',
  'requiresPrivacyVerification',
  'requiresViewportVerification',
  'verificationFlags',
  'residualCount',
  'matched',
  'expectedSummary',
]);

const FORBIDDEN_KEY_PATTERN =
  /(^id$|patientId|visitId|scaleInstanceId|scoreResultId|itemResponseId|domainResultId|metadata|mappingRules|rawResponse|reviewNote|cookie|sessionToken|passwordHash)/i;
const FORBIDDEN_VALUE_PATTERN =
  /(mongodb(?:\+srv)?:\/\/|cookie|session[_-]?token|passwordhash|objectid|objectkey|bucket|rawresponse|expectedvalue|scoringrule)/i;

function scanSafeManifest(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (FORBIDDEN_VALUE_PATTERN.test(value) || /^[a-f0-9]{24}$/i.test(value)) {
      throw new B9FixtureError(
        'B9_FIXTURE_MANIFEST_UNSAFE',
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
    if (!ALLOWED_MANIFEST_KEYS.has(key) || FORBIDDEN_KEY_PATTERN.test(key)) {
      throw new B9FixtureError(
        'B9_FIXTURE_MANIFEST_UNSAFE',
        `Safe manifest contains a forbidden field at ${path}.${key}`,
      );
    }
    scanSafeManifest(item, `${path}.${key}`);
  }
}

export function assertB9SafeManifest(value: unknown): void {
  scanSafeManifest(value, 'manifest');
}
