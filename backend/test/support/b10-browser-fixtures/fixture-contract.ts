export const B10_PROFILES = [
  'generation-workflow',
  'public-surface-security',
] as const;

export type B10Profile = (typeof B10_PROFILES)[number];
export type B10VerifyPhase = 'prepared' | 'post-browser';
export type B10ScaleCode = 'mmse' | 'moca';

export const B10_DEFAULT_NAMESPACES: Record<B10Profile, string> = {
  'generation-workflow': 'b10g-browser-final',
  'public-surface-security': 'b10p-browser-final',
};

export const B10_NAMESPACE_MAX_LENGTH = 30;

export const B10_ROLES = [
  'doctor',
  'admin',
  'nurse',
  'research_assistant',
  'system',
] as const;

export type B10Role = (typeof B10_ROLES)[number];
export type B10AuditId = `B10-${string}`;

function toAuditId(ordinal: number): B10AuditId {
  return `B10-${ordinal.toString().padStart(2, '0')}`;
}

export const B10_AUDIT_IDS: readonly B10AuditId[] = Array.from(
  { length: 95 },
  (_, index) => toAuditId(index + 1),
);

export type B10GenerationScenarioKey =
  | 'latest_lifecycle'
  | 'scope_eligibility'
  | 'first_generate_success'
  | 'idempotent_generate'
  | 'scope_conflict'
  | 'voided_existing_report'
  | 'generation_conflict'
  | 'source_readiness_errors'
  | 'patient_and_report_state'
  | 'static_gate';

export type B10PublicScenarioKey =
  | 'draft_semantics'
  | 'patient_visit_snapshot'
  | 'scale_score_snapshot'
  | 'domain_snapshot'
  | 'evidence_snapshot'
  | 'narrative_generation'
  | 'historical_and_voided'
  | 'capability_boundary'
  | 'auth_and_network'
  | 'client_state'
  | 'responsive_keyboard'
  | 'route_and_fanout'
  | 'deidentified_fixture';

export type B10BusinessScenarioKey =
  | B10GenerationScenarioKey
  | B10PublicScenarioKey;
export type B10ScenarioKey = 'roles' | B10BusinessScenarioKey;

export type B10RequestResource =
  | 'visit-detail'
  | 'scale-catalog'
  | 'latest'
  | 'generate'
  | 'a17-a18-a19'
  | 'page'
  | 'static-gate';

export type B10ExpectedRequest = {
  method: 'GET' | 'POST' | 'none';
  resource: B10RequestResource;
  count: string;
  bodyWhitelist: 'none' | 'confirm,primaryScaleInstanceIds';
  faultMode:
    | 'none'
    | 'abort'
    | 'catalog-failure'
    | 'http-500'
    | 'mutate-response'
    | 'stale-source';
};

export type B10ExpectedRequestStep = {
  routeKey: string;
  request: B10ExpectedRequest;
  expectedHttpStatus: string;
  automaticRetry: false;
};

export type B10ExpectedRequestContract =
  | B10ExpectedRequest
  | { sequence: readonly B10ExpectedRequestStep[] }
  | { branches: readonly B10ExpectedRequestStep[] };

export type B10PostBrowserSideEffect = 'none' | 'create-version-one-draft';

export type B10VerificationFlag =
  | 'independent-session'
  | 'network'
  | 'privacy'
  | 'keyboard'
  | 'viewport';

export type B10TargetArea =
  | 'report-loading'
  | 'scope-selector'
  | 'generation-confirmation'
  | 'report-draft-header'
  | 'patient-visit-snapshot'
  | 'scale-score-snapshot'
  | 'domain-snapshot'
  | 'evidence-snapshot'
  | 'narrative'
  | 'technical-summary'
  | 'a20-capability-boundary'
  | 'auth-network'
  | 'client-state'
  | 'responsive-keyboard'
  | 'route-fanout'
  | 'fixture-privacy'
  | 'static-gate';

export type B10AuditContractEntry = {
  auditId: B10AuditId;
  profile: B10Profile;
  scenarioKey: B10BusinessScenarioKey;
  routeKey: string;
  primaryRole: B10Role;
  targetArea: B10TargetArea;
  preparedState: string;
  expectedRequest: B10ExpectedRequestContract;
  expectedHttpStatus: string;
  postBrowserSideEffect: B10PostBrowserSideEffect;
  requiresIndependentSession: boolean;
  requiresNetworkControl: boolean;
  requiresPrivacyVerification: boolean;
  requiresKeyboardVerification: boolean;
  requiresViewportVerification: boolean;
  verificationFlags: readonly B10VerificationFlag[];
};

export type B10InstanceState =
  | 'draft'
  | 'in_progress'
  | 'voided'
  | 'completed'
  | 'locked'
  | 'final'
  | 'score_not_final'
  | 'domain_missing'
  | 'media_invalid';

export type B10ReportVariant =
  | 'none'
  | 'valid_draft'
  | 'same_scope_draft'
  | 'different_scope_draft'
  | 'voided'
  | 'incomplete'
  | 'rich_draft'
  | 'patient_snapshot_null'
  | 'generation_null'
  | 'confirmed_history'
  | 'pending_confirmation'
  | 'long_content'
  | 'generation_conflict_blocker';

export type B10RoutePreparedContract = {
  key: string;
  auditIds: readonly B10AuditId[];
  preparedState: string;
  patientStatus: 'active' | 'inactive';
  visitStatus: 'draft' | 'in_progress' | 'completed' | 'locked' | 'voided';
  instanceStates: readonly B10InstanceState[];
  reportVariant: B10ReportVariant;
  expectedRequest: B10ExpectedRequestContract;
  expectedHttpStatus: string;
  automaticRetry: false;
  postBrowserSideEffect: B10PostBrowserSideEffect;
};

export type B10ScenarioDefinition = {
  scenarioKey: B10BusinessScenarioKey;
  profile: B10Profile;
  ordinal: number;
  scaleCode: B10ScaleCode;
  primaryOwnerAuditId: B10AuditId;
  auditIds: readonly B10AuditId[];
  preparedState: string;
  routeContracts: readonly B10RoutePreparedContract[];
};

function request(
  method: B10ExpectedRequest['method'],
  resource: B10RequestResource,
  count: string,
  bodyWhitelist: B10ExpectedRequest['bodyWhitelist'] = 'none',
  faultMode: B10ExpectedRequest['faultMode'] = 'none',
): B10ExpectedRequest {
  return { method, resource, count, bodyWhitelist, faultMode };
}

function sequence(
  steps: readonly B10ExpectedRequestStep[],
): B10ExpectedRequestContract {
  return { sequence: steps };
}

function branches(
  steps: readonly B10ExpectedRequestStep[],
): B10ExpectedRequestContract {
  return { branches: steps };
}

const noRequest = request('none', 'page', '0');
const latestOnce = request('GET', 'latest', '1');
const generateOnce = request(
  'POST',
  'generate',
  '1',
  'confirm,primaryScaleInstanceIds',
);
const generateThenLatest = sequence([
  {
    routeKey: 'generate',
    request: generateOnce,
    expectedHttpStatus: '409',
    automaticRetry: false,
  },
  {
    routeKey: 'latest',
    request: latestOnce,
    expectedHttpStatus: '200 or 404 by contract',
    automaticRetry: false,
  },
]);

function entry(
  auditId: B10AuditId,
  profile: B10Profile,
  scenarioKey: B10BusinessScenarioKey,
  routeKey: string,
  primaryRole: B10Role,
  targetArea: B10TargetArea,
  preparedState: string,
  expectedRequest: B10ExpectedRequestContract,
  expectedHttpStatus: string,
  postBrowserSideEffect: B10PostBrowserSideEffect = 'none',
  verificationFlags: readonly B10VerificationFlag[] = [],
): B10AuditContractEntry {
  return {
    auditId,
    profile,
    scenarioKey,
    routeKey,
    primaryRole,
    targetArea,
    preparedState,
    expectedRequest,
    expectedHttpStatus,
    postBrowserSideEffect,
    requiresIndependentSession: verificationFlags.includes(
      'independent-session',
    ),
    requiresNetworkControl: verificationFlags.includes('network'),
    requiresPrivacyVerification: verificationFlags.includes('privacy'),
    requiresKeyboardVerification: verificationFlags.includes('keyboard'),
    requiresViewportVerification: verificationFlags.includes('viewport'),
    verificationFlags,
  };
}

function entries(
  auditIds: readonly B10AuditId[],
  profile: B10Profile,
  scenarioKey: B10BusinessScenarioKey,
  routeKey: string,
  primaryRole: B10Role,
  targetArea: B10TargetArea,
  preparedState: string,
  expectedRequest: B10ExpectedRequestContract,
  expectedHttpStatus: string,
  postBrowserSideEffect: B10PostBrowserSideEffect = 'none',
  verificationFlags: readonly B10VerificationFlag[] = [],
): B10AuditContractEntry[] {
  return auditIds.map((auditId) =>
    entry(
      auditId,
      profile,
      scenarioKey,
      routeKey,
      primaryRole,
      targetArea,
      preparedState,
      expectedRequest,
      expectedHttpStatus,
      postBrowserSideEffect,
      verificationFlags,
    ),
  );
}

const B10_AUDIT_MATRIX_ENTRIES = [
  entry(
    'B10-01',
    'generation-workflow',
    'latest_lifecycle',
    'catalog_failure',
    'doctor',
    'report-loading',
    'visit detail succeeds and the scale catalog is independently failed',
    latestOnce,
    '404 CLINICAL_REPORT_NOT_FOUND',
    'none',
    ['network'],
  ),
  entry(
    'B10-02',
    'generation-workflow',
    'latest_lifecycle',
    'catalog_failure',
    'doctor',
    'report-loading',
    'scale catalog failure companion with a usable visit',
    latestOnce,
    '404 CLINICAL_REPORT_NOT_FOUND',
    'none',
    ['network'],
  ),
  entry(
    'B10-03',
    'generation-workflow',
    'latest_lifecycle',
    'not_found',
    'doctor',
    'report-loading',
    'visit has no report',
    latestOnce,
    '404 CLINICAL_REPORT_NOT_FOUND',
  ),
  entry(
    'B10-04',
    'generation-workflow',
    'latest_lifecycle',
    'latest_failure',
    'doctor',
    'report-loading',
    'visit and instances remain available during a controlled latest failure',
    request('GET', 'latest', '1', 'none', 'http-500'),
    '500',
    'none',
    ['network'],
  ),
  entry(
    'B10-05',
    'generation-workflow',
    'latest_lifecycle',
    'retry_abort',
    'doctor',
    'report-loading',
    'manual retry route with an abortable first latest request',
    request('GET', 'latest', '2', 'none', 'abort'),
    'first aborted; second 404',
    'none',
    ['network'],
  ),
  entry(
    'B10-06',
    'generation-workflow',
    'latest_lifecycle',
    'not_found',
    'doctor',
    'generation-confirmation',
    'no report and no automatic generation',
    latestOnce,
    '404; generate count 0',
  ),
  ...entries(
    ['B10-07', 'B10-08', 'B10-09', 'B10-10', 'B10-11', 'B10-12', 'B10-13'],
    'generation-workflow',
    'scope_eligibility',
    'status_matrix',
    'doctor',
    'scope-selector',
    'draft, in_progress, voided, completed, and locked candidates with no initial selection',
    latestOnce,
    '404',
  ),
  entry(
    'B10-14',
    'generation-workflow',
    'scope_eligibility',
    'one_candidate',
    'doctor',
    'scope-selector',
    'one completed candidate',
    latestOnce,
    '404',
  ),
  ...entries(
    ['B10-15', 'B10-17', 'B10-19'],
    'generation-workflow',
    'scope_eligibility',
    'eleven_candidates',
    'doctor',
    'scope-selector',
    'eleven mixed-code eligible candidates in unstable creation order',
    latestOnce,
    '404',
  ),
  entry(
    'B10-16',
    'generation-workflow',
    'scope_eligibility',
    'invalid_duplicate',
    'admin',
    'scope-selector',
    'eligible candidates for client duplicate and malformed-id defenses',
    noRequest,
    'front-end gate',
    'none',
    ['network'],
  ),
  entry(
    'B10-18',
    'generation-workflow',
    'scope_eligibility',
    'scope_change',
    'doctor',
    'scope-selector',
    'two eligible candidates and an open confirmation-capable state',
    latestOnce,
    '404',
  ),
  entry(
    'B10-20',
    'generation-workflow',
    'scope_eligibility',
    'loaded_report',
    'nurse',
    'scope-selector',
    'a readable existing draft report',
    latestOnce,
    '200',
  ),
  entry(
    'B10-21',
    'generation-workflow',
    'scope_eligibility',
    'visit_locked',
    'doctor',
    'scope-selector',
    'locked visit with no report',
    latestOnce,
    '404',
  ),
  entry(
    'B10-22',
    'generation-workflow',
    'scope_eligibility',
    'visit_voided',
    'doctor',
    'scope-selector',
    'voided visit with no report',
    latestOnce,
    '404',
  ),
  ...entries(
    [
      'B10-23',
      'B10-24',
      'B10-25',
      'B10-26',
      'B10-27',
      'B10-28',
      'B10-29',
      'B10-30',
      'B10-31',
      'B10-32',
      'B10-33',
    ],
    'generation-workflow',
    'first_generate_success',
    'base',
    'doctor',
    'generation-confirmation',
    'one fully ready source chain and no existing report',
    generateOnce,
    '200 alreadyGenerated=false',
    'create-version-one-draft',
  ),
  ...entries(
    ['B10-34', 'B10-35'],
    'generation-workflow',
    'idempotent_generate',
    'base',
    'nurse',
    'generation-confirmation',
    'readable draft with the same stable scope',
    generateOnce,
    '200 alreadyGenerated=true',
  ),
  ...entries(
    ['B10-36', 'B10-37'],
    'generation-workflow',
    'scope_conflict',
    'base',
    'doctor',
    'generation-confirmation',
    'readable draft with a different scope and a second eligible candidate',
    generateThenLatest,
    '409 CLINICAL_REPORT_SCOPE_CONFLICT then 200',
  ),
  entry(
    'B10-38',
    'generation-workflow',
    'voided_existing_report',
    'base',
    'nurse',
    'report-draft-header',
    'readable voided report with public void reason',
    latestOnce,
    '200',
  ),
  entry(
    'B10-39',
    'generation-workflow',
    'generation_conflict',
    'base',
    'doctor',
    'generation-confirmation',
    'ready source plus namespace-owned non-A20 blocker and partial unique index',
    generateThenLatest,
    '409 CLINICAL_REPORT_GENERATION_CONFLICT then 404',
    'none',
    ['independent-session'],
  ),
  entry(
    'B10-40',
    'generation-workflow',
    'source_readiness_errors',
    'scale_not_ready',
    'doctor',
    'generation-confirmation',
    'stale eligible client snapshot backed by a non-ready source',
    request(
      'POST',
      'generate',
      '1',
      'confirm,primaryScaleInstanceIds',
      'stale-source',
    ),
    '409 CLINICAL_REPORT_SOURCE_SCALE_NOT_READY',
    'none',
    ['network'],
  ),
  entry(
    'B10-41',
    'generation-workflow',
    'source_readiness_errors',
    'score_not_final',
    'doctor',
    'generation-confirmation',
    'completed instance with a non-final score',
    generateOnce,
    '409 CLINICAL_REPORT_SOURCE_SCORE_NOT_FINAL',
  ),
  entry(
    'B10-42',
    'generation-workflow',
    'source_readiness_errors',
    'domain_required',
    'doctor',
    'generation-confirmation',
    'completed instance with a final score and no domain result',
    generateOnce,
    '409 CLINICAL_REPORT_SOURCE_DOMAIN_RESULT_REQUIRED',
  ),
  entry(
    'B10-43',
    'generation-workflow',
    'source_readiness_errors',
    'media_invalid',
    'admin',
    'generation-confirmation',
    'otherwise ready source with invalid namespace-owned media metadata',
    generateOnce,
    '409 CLINICAL_REPORT_SOURCE_MEDIA_INVALID',
    'none',
    ['privacy'],
  ),
  entry(
    'B10-44',
    'generation-workflow',
    'patient_and_report_state',
    'patient_inactive',
    'doctor',
    'generation-confirmation',
    'inactive synthetic patient with no report',
    generateOnce,
    '409 PATIENT_NOT_ACTIVE',
  ),
  entry(
    'B10-45',
    'generation-workflow',
    'patient_and_report_state',
    'report_incomplete',
    'admin',
    'report-loading',
    'existing report missing a required public snapshot',
    latestOnce,
    '409 CLINICAL_REPORT_INCOMPLETE',
  ),

  ...entries(
    ['B10-46', 'B10-47', 'B10-49', 'B10-50'],
    'public-surface-security',
    'draft_semantics',
    'base',
    'nurse',
    'report-draft-header',
    'readable system draft with passed workflow quality marker',
    latestOnce,
    '200',
    'none',
    ['privacy'],
  ),
  entry(
    'B10-48',
    'public-surface-security',
    'draft_semantics',
    'status_mismatch',
    'admin',
    'report-draft-header',
    'readable report for controlled status/isFinal response inconsistency',
    request('GET', 'latest', '1', 'none', 'mutate-response'),
    '200 then controlled mismatch',
    'none',
    ['network', 'privacy'],
  ),
  ...entries(
    ['B10-51', 'B10-53'],
    'public-surface-security',
    'patient_visit_snapshot',
    'whitelist',
    'research_assistant',
    'patient-visit-snapshot',
    'rich snapshots containing storage-only private companions',
    latestOnce,
    '200',
    'none',
    ['privacy'],
  ),
  entry(
    'B10-52',
    'public-surface-security',
    'patient_visit_snapshot',
    'patient_null',
    'nurse',
    'patient-visit-snapshot',
    'response companion with patientSnapshot=null',
    request('GET', 'latest', '1', 'none', 'mutate-response'),
    '200 then controlled null companion',
    'none',
    ['network', 'privacy'],
  ),
  ...entries(
    ['B10-54', 'B10-56', 'B10-57', 'B10-58'],
    'public-surface-security',
    'scale_score_snapshot',
    'base',
    'doctor',
    'scale-score-snapshot',
    'rich score snapshot with server percent, null score companion, and safe summaries',
    latestOnce,
    '200',
    'none',
    ['privacy'],
  ),
  entry(
    'B10-55',
    'public-surface-security',
    'scale_score_snapshot',
    'invalid_trace',
    'doctor',
    'scale-score-snapshot',
    'trace response companion containing null and malformed scale-instance identifiers',
    request('GET', 'latest', '1', 'none', 'mutate-response'),
    '200 then controlled invalid identifiers',
    'none',
    ['network', 'privacy'],
  ),
  ...entries(
    ['B10-59', 'B10-60', 'B10-61'],
    'public-surface-security',
    'domain_snapshot',
    'base',
    'doctor',
    'domain-snapshot',
    'overlapping domains with server percentages and a storage-only minScore sentinel',
    latestOnce,
    '200',
    'none',
    ['privacy'],
  ),
  ...entries(
    ['B10-62', 'B10-63'],
    'public-surface-security',
    'evidence_snapshot',
    'base',
    'research_assistant',
    'evidence-snapshot',
    'evidence index with storage-only media, item, and object-key sentinels',
    latestOnce,
    '200',
    'none',
    ['privacy'],
  ),
  ...entries(
    ['B10-64', 'B10-65', 'B10-66', 'B10-67', 'B10-68', 'B10-70'],
    'public-surface-security',
    'narrative_generation',
    'base',
    'doctor',
    'narrative',
    'five long system paragraphs, separate clinician-owned text, and non-AI generation audit',
    latestOnce,
    '200',
    'none',
    ['privacy'],
  ),
  entry(
    'B10-69',
    'public-surface-security',
    'narrative_generation',
    'generation_null',
    'nurse',
    'technical-summary',
    'readable report whose generation metadata is intentionally absent',
    latestOnce,
    '200',
  ),
  ...entries(
    ['B10-71', 'B10-74'],
    'public-surface-security',
    'historical_and_voided',
    'confirmed',
    'doctor',
    'technical-summary',
    'confirmed historical report with safe confirmation',
    latestOnce,
    '200',
    'none',
    ['privacy'],
  ),
  entry(
    'B10-72',
    'public-surface-security',
    'historical_and_voided',
    'confirmation_null',
    'doctor',
    'technical-summary',
    'confirmed response companion with confirmation=null',
    request('GET', 'latest', '1', 'none', 'mutate-response'),
    '200 then controlled null confirmation',
    'none',
    ['network', 'privacy'],
  ),
  entry(
    'B10-73',
    'public-surface-security',
    'historical_and_voided',
    'voided',
    'nurse',
    'report-draft-header',
    'voided report with a de-identified public reason',
    latestOnce,
    '200',
  ),
  ...entries(
    [
      'B10-75',
      'B10-76',
      'B10-77',
      'B10-78',
      'B10-79',
      'B10-80',
      'B10-81',
      'B10-82',
    ],
    'public-surface-security',
    'capability_boundary',
    'base',
    'doctor',
    'a20-capability-boundary',
    'mixed pending-confirmation report where legal B11 sibling controls may coexist',
    latestOnce,
    '200',
    'none',
    ['privacy'],
  ),
  entry(
    'B10-83',
    'public-surface-security',
    'auth_and_network',
    'unauthenticated',
    'doctor',
    'auth-network',
    'readable report targeted by an invalid independent Session',
    latestOnce,
    '401',
    'none',
    ['independent-session', 'privacy'],
  ),
  entry(
    'B10-84',
    'public-surface-security',
    'auth_and_network',
    'forbidden',
    'system',
    'auth-network',
    'readable report protected from a system-role Session',
    latestOnce,
    '403',
    'none',
    ['independent-session', 'privacy'],
  ),
  entry(
    'B10-85',
    'public-surface-security',
    'auth_and_network',
    'network',
    'nurse',
    'auth-network',
    'independent latest and generate network-fault branches',
    branches([
      {
        routeKey: 'latest',
        request: request('GET', 'latest', '1', 'none', 'abort'),
        expectedHttpStatus: 'network-error',
        automaticRetry: false,
      },
      {
        routeKey: 'generate',
        request: request(
          'POST',
          'generate',
          '1',
          'confirm,primaryScaleInstanceIds',
          'abort',
        ),
        expectedHttpStatus: 'network-error',
        automaticRetry: false,
      },
    ]),
    'network-error',
    'none',
    ['independent-session', 'network', 'privacy'],
  ),
  ...entries(
    ['B10-86', 'B10-87'],
    'public-surface-security',
    'client_state',
    'base',
    'doctor',
    'client-state',
    'two eligible candidates and no report',
    latestOnce,
    '404',
    'none',
    ['privacy'],
  ),
  entry(
    'B10-88',
    'public-surface-security',
    'responsive_keyboard',
    'long_report',
    'doctor',
    'responsive-keyboard',
    'long de-identified content with multiple scale traces',
    latestOnce,
    '200',
    'none',
    ['privacy', 'viewport'],
  ),
  entry(
    'B10-89',
    'public-surface-security',
    'responsive_keyboard',
    'long_report',
    'doctor',
    'responsive-keyboard',
    'native checkbox, button, link, and details targets',
    latestOnce,
    '200',
    'none',
    ['privacy', 'keyboard', 'viewport'],
  ),
  entry(
    'B10-90',
    'public-surface-security',
    'route_and_fanout',
    'base',
    'research_assistant',
    'route-fanout',
    'current visit route with report area only',
    latestOnce,
    '200',
    'none',
    ['privacy'],
  ),
  entry(
    'B10-91',
    'public-surface-security',
    'route_and_fanout',
    'base',
    'research_assistant',
    'route-fanout',
    'ready report whose page must not fan out A17/A18/A19',
    request('none', 'a17-a18-a19', '0'),
    'none',
    'none',
    ['privacy'],
  ),
  entry(
    'B10-92',
    'public-surface-security',
    'deidentified_fixture',
    'base',
    'admin',
    'fixture-privacy',
    'manually constructed de-identified data without clinical meaning',
    latestOnce,
    '200',
    'none',
    ['privacy'],
  ),

  entry(
    'B10-93',
    'generation-workflow',
    'static_gate',
    'lint',
    'admin',
    'static-gate',
    'database-free frontend lint gate',
    request('none', 'static-gate', '0'),
    'process exit 0',
  ),
  entry(
    'B10-94',
    'generation-workflow',
    'static_gate',
    'typecheck',
    'admin',
    'static-gate',
    'database-free frontend typecheck gate',
    request('none', 'static-gate', '0'),
    'process exit 0',
  ),
  entry(
    'B10-95',
    'generation-workflow',
    'static_gate',
    'build',
    'admin',
    'static-gate',
    'database-free frontend production build gate',
    request('none', 'static-gate', '0'),
    'process exit 0',
  ),
] as const satisfies readonly B10AuditContractEntry[];

export const B10_AUDIT_MATRIX: readonly B10AuditContractEntry[] = [
  ...B10_AUDIT_MATRIX_ENTRIES,
].sort(
  (left, right) =>
    Number(left.auditId.slice(4)) - Number(right.auditId.slice(4)),
);

function route(
  key: string,
  auditIds: readonly B10AuditId[],
  preparedState: string,
  instanceStates: readonly B10InstanceState[],
  reportVariant: B10ReportVariant,
  expectedRequest: B10ExpectedRequestContract,
  expectedHttpStatus: string,
  postBrowserSideEffect: B10PostBrowserSideEffect = 'none',
  options: {
    patientStatus?: B10RoutePreparedContract['patientStatus'];
    visitStatus?: B10RoutePreparedContract['visitStatus'];
  } = {},
): B10RoutePreparedContract {
  return {
    key,
    auditIds,
    preparedState,
    patientStatus: options.patientStatus ?? 'active',
    visitStatus: options.visitStatus ?? 'in_progress',
    instanceStates,
    reportVariant,
    expectedRequest,
    expectedHttpStatus,
    automaticRetry: false,
    postBrowserSideEffect,
  };
}

function auditRange(start: number, length: number): B10AuditId[] {
  return Array.from({ length }, (_, index) => toAuditId(start + index));
}

const generationScenarios = [
  {
    scenarioKey: 'latest_lifecycle',
    ordinal: 1,
    scaleCode: 'mmse',
    owner: 'B10-01',
    auditIds: ['B10-01', 'B10-02', 'B10-03', 'B10-04', 'B10-05', 'B10-06'],
    routes: [
      route(
        'catalog_failure',
        ['B10-01', 'B10-02'],
        'catalog failure does not block latest',
        ['completed'],
        'none',
        latestOnce,
        '404',
      ),
      route(
        'not_found',
        ['B10-03', 'B10-06'],
        'normal latest not-found',
        ['completed'],
        'none',
        latestOnce,
        '404',
      ),
      route(
        'latest_failure',
        ['B10-04'],
        'controlled latest failure',
        ['completed'],
        'none',
        request('GET', 'latest', '1', 'none', 'http-500'),
        '500',
      ),
      route(
        'retry_abort',
        ['B10-05'],
        'manual retry aborts the superseded request',
        ['completed'],
        'none',
        request('GET', 'latest', '2', 'none', 'abort'),
        'abort then 404',
      ),
    ],
  },
  {
    scenarioKey: 'scope_eligibility',
    ordinal: 2,
    scaleCode: 'moca',
    owner: 'B10-07',
    auditIds: auditRange(7, 16),
    routes: [
      route(
        'status_matrix',
        ['B10-07', 'B10-08', 'B10-09', 'B10-10', 'B10-11', 'B10-12', 'B10-13'],
        'all five instance eligibility states',
        ['draft', 'in_progress', 'voided', 'completed', 'locked'],
        'none',
        latestOnce,
        '404',
      ),
      route(
        'one_candidate',
        ['B10-14'],
        'one eligible candidate',
        ['completed'],
        'none',
        latestOnce,
        '404',
      ),
      route(
        'eleven_candidates',
        ['B10-15', 'B10-17', 'B10-19'],
        'eleven eligible mixed scale candidates',
        Array.from({ length: 11 }, () => 'completed' as const),
        'none',
        latestOnce,
        '404',
      ),
      route(
        'invalid_duplicate',
        ['B10-16'],
        'client-only malformed and duplicate id gate',
        ['completed'],
        'none',
        noRequest,
        'front-end gate',
      ),
      route(
        'scope_change',
        ['B10-18'],
        'two eligible candidates',
        ['completed', 'completed'],
        'none',
        latestOnce,
        '404',
      ),
      route(
        'loaded_report',
        ['B10-20'],
        'existing readable report',
        ['completed'],
        'valid_draft',
        latestOnce,
        '200',
      ),
      route(
        'visit_locked',
        ['B10-21'],
        'locked visit',
        ['completed'],
        'none',
        latestOnce,
        '404',
        'none',
        { visitStatus: 'locked' },
      ),
      route(
        'visit_voided',
        ['B10-22'],
        'voided visit',
        ['voided'],
        'none',
        latestOnce,
        '404',
        'none',
        { visitStatus: 'voided' },
      ),
    ],
  },
  {
    scenarioKey: 'first_generate_success',
    ordinal: 3,
    scaleCode: 'mmse',
    owner: 'B10-23',
    auditIds: auditRange(23, 11),
    routes: [
      route(
        'base',
        auditRange(23, 11),
        'fully ready source and no report',
        ['final'],
        'none',
        generateOnce,
        '200',
        'create-version-one-draft',
      ),
    ],
  },
  {
    scenarioKey: 'idempotent_generate',
    ordinal: 4,
    scaleCode: 'moca',
    owner: 'B10-34',
    auditIds: ['B10-34', 'B10-35'],
    routes: [
      route(
        'base',
        ['B10-34', 'B10-35'],
        'same-scope readable draft',
        ['completed'],
        'same_scope_draft',
        generateOnce,
        '200 alreadyGenerated=true',
      ),
    ],
  },
  {
    scenarioKey: 'scope_conflict',
    ordinal: 5,
    scaleCode: 'mmse',
    owner: 'B10-36',
    auditIds: ['B10-36', 'B10-37'],
    routes: [
      route(
        'base',
        ['B10-36', 'B10-37'],
        'different-scope readable draft',
        ['completed', 'completed'],
        'different_scope_draft',
        generateThenLatest,
        '409 then 200',
      ),
    ],
  },
  {
    scenarioKey: 'voided_existing_report',
    ordinal: 6,
    scaleCode: 'moca',
    owner: 'B10-38',
    auditIds: ['B10-38'],
    routes: [
      route(
        'base',
        ['B10-38'],
        'voided report',
        ['completed'],
        'voided',
        latestOnce,
        '200',
      ),
    ],
  },
  {
    scenarioKey: 'generation_conflict',
    ordinal: 7,
    scaleCode: 'mmse',
    owner: 'B10-39',
    auditIds: ['B10-39'],
    routes: [
      route(
        'base',
        ['B10-39'],
        'deterministic namespace-owned generation conflict',
        ['final'],
        'generation_conflict_blocker',
        generateThenLatest,
        '409 then 404',
      ),
    ],
  },
  {
    scenarioKey: 'source_readiness_errors',
    ordinal: 8,
    scaleCode: 'moca',
    owner: 'B10-40',
    auditIds: ['B10-40', 'B10-41', 'B10-42', 'B10-43'],
    routes: [
      route(
        'scale_not_ready',
        ['B10-40'],
        'non-ready source with stale client companion',
        ['in_progress'],
        'none',
        request(
          'POST',
          'generate',
          '1',
          'confirm,primaryScaleInstanceIds',
          'stale-source',
        ),
        '409',
      ),
      route(
        'score_not_final',
        ['B10-41'],
        'completed source with computed score',
        ['score_not_final'],
        'none',
        generateOnce,
        '409',
      ),
      route(
        'domain_required',
        ['B10-42'],
        'final score without domain result',
        ['domain_missing'],
        'none',
        generateOnce,
        '409',
      ),
      route(
        'media_invalid',
        ['B10-43'],
        'final source with invalid media storage companion',
        ['media_invalid'],
        'none',
        generateOnce,
        '409',
      ),
    ],
  },
  {
    scenarioKey: 'patient_and_report_state',
    ordinal: 9,
    scaleCode: 'mmse',
    owner: 'B10-44',
    auditIds: ['B10-44', 'B10-45'],
    routes: [
      route(
        'patient_inactive',
        ['B10-44'],
        'inactive patient',
        ['completed'],
        'none',
        generateOnce,
        '409',
        'none',
        { patientStatus: 'inactive' },
      ),
      route(
        'report_incomplete',
        ['B10-45'],
        'incomplete existing report',
        ['completed'],
        'incomplete',
        latestOnce,
        '409',
        'none',
        { patientStatus: 'inactive' },
      ),
    ],
  },
  {
    scenarioKey: 'static_gate',
    ordinal: 10,
    scaleCode: 'moca',
    owner: 'B10-93',
    auditIds: ['B10-93', 'B10-94', 'B10-95'],
    routes: [
      route(
        'lint',
        ['B10-93'],
        'frontend lint static gate',
        [],
        'none',
        request('none', 'static-gate', '0'),
        'process exit 0',
      ),
      route(
        'typecheck',
        ['B10-94'],
        'frontend typecheck static gate',
        [],
        'none',
        request('none', 'static-gate', '0'),
        'process exit 0',
      ),
      route(
        'build',
        ['B10-95'],
        'frontend build static gate',
        [],
        'none',
        request('none', 'static-gate', '0'),
        'process exit 0',
      ),
    ],
  },
] as const;

const publicScenarios = [
  {
    scenarioKey: 'draft_semantics',
    ordinal: 1,
    scaleCode: 'mmse',
    owner: 'B10-46',
    auditIds: ['B10-46', 'B10-47', 'B10-48', 'B10-49', 'B10-50'],
    routes: [
      route(
        'base',
        ['B10-46', 'B10-47', 'B10-49', 'B10-50'],
        'rich system draft',
        ['completed'],
        'rich_draft',
        latestOnce,
        '200',
      ),
      route(
        'status_mismatch',
        ['B10-48'],
        'response mismatch companion',
        ['completed'],
        'valid_draft',
        request('GET', 'latest', '1', 'none', 'mutate-response'),
        '200',
      ),
    ],
  },
  {
    scenarioKey: 'patient_visit_snapshot',
    ordinal: 2,
    scaleCode: 'moca',
    owner: 'B10-51',
    auditIds: ['B10-51', 'B10-52', 'B10-53'],
    routes: [
      route(
        'whitelist',
        ['B10-51', 'B10-53'],
        'private storage companions',
        ['completed'],
        'rich_draft',
        latestOnce,
        '200',
      ),
      route(
        'patient_null',
        ['B10-52'],
        'null patient snapshot response companion',
        ['completed'],
        'valid_draft',
        request('GET', 'latest', '1', 'none', 'mutate-response'),
        '200',
      ),
    ],
  },
  {
    scenarioKey: 'scale_score_snapshot',
    ordinal: 3,
    scaleCode: 'mmse',
    owner: 'B10-54',
    auditIds: ['B10-54', 'B10-55', 'B10-56', 'B10-57', 'B10-58'],
    routes: [
      route(
        'base',
        ['B10-54', 'B10-56', 'B10-57', 'B10-58'],
        'rich scale and score snapshots',
        ['completed'],
        'rich_draft',
        latestOnce,
        '200',
      ),
      route(
        'invalid_trace',
        ['B10-55'],
        'invalid trace response companion',
        ['completed'],
        'valid_draft',
        request('GET', 'latest', '1', 'none', 'mutate-response'),
        '200',
      ),
    ],
  },
  {
    scenarioKey: 'domain_snapshot',
    ordinal: 4,
    scaleCode: 'moca',
    owner: 'B10-59',
    auditIds: ['B10-59', 'B10-60', 'B10-61'],
    routes: [
      route(
        'base',
        ['B10-59', 'B10-60', 'B10-61'],
        'overlapping domain snapshots',
        ['completed'],
        'rich_draft',
        latestOnce,
        '200',
      ),
    ],
  },
  {
    scenarioKey: 'evidence_snapshot',
    ordinal: 5,
    scaleCode: 'mmse',
    owner: 'B10-62',
    auditIds: ['B10-62', 'B10-63'],
    routes: [
      route(
        'base',
        ['B10-62', 'B10-63'],
        'private evidence companions',
        ['completed'],
        'rich_draft',
        latestOnce,
        '200',
      ),
    ],
  },
  {
    scenarioKey: 'narrative_generation',
    ordinal: 6,
    scaleCode: 'moca',
    owner: 'B10-64',
    auditIds: [
      'B10-64',
      'B10-65',
      'B10-66',
      'B10-67',
      'B10-68',
      'B10-69',
      'B10-70',
    ],
    routes: [
      route(
        'base',
        ['B10-64', 'B10-65', 'B10-66', 'B10-67', 'B10-68', 'B10-70'],
        'five system paragraphs and clinician text',
        ['completed'],
        'rich_draft',
        latestOnce,
        '200',
      ),
      route(
        'generation_null',
        ['B10-69'],
        'generation null companion',
        ['completed'],
        'generation_null',
        latestOnce,
        '200',
      ),
    ],
  },
  {
    scenarioKey: 'historical_and_voided',
    ordinal: 7,
    scaleCode: 'mmse',
    owner: 'B10-71',
    auditIds: ['B10-71', 'B10-72', 'B10-73', 'B10-74'],
    routes: [
      route(
        'confirmed',
        ['B10-71', 'B10-74'],
        'confirmed history',
        ['completed'],
        'confirmed_history',
        latestOnce,
        '200',
      ),
      route(
        'confirmation_null',
        ['B10-72'],
        'null confirmation response companion',
        ['completed'],
        'confirmed_history',
        request('GET', 'latest', '1', 'none', 'mutate-response'),
        '200',
      ),
      route(
        'voided',
        ['B10-73'],
        'voided report',
        ['completed'],
        'voided',
        latestOnce,
        '200',
      ),
    ],
  },
  {
    scenarioKey: 'capability_boundary',
    ordinal: 8,
    scaleCode: 'moca',
    owner: 'B10-75',
    auditIds: auditRange(75, 8),
    routes: [
      route(
        'base',
        auditRange(75, 8),
        'pending confirmation with legal sibling controls',
        ['completed'],
        'pending_confirmation',
        latestOnce,
        '200',
      ),
    ],
  },
  {
    scenarioKey: 'auth_and_network',
    ordinal: 9,
    scaleCode: 'mmse',
    owner: 'B10-83',
    auditIds: ['B10-83', 'B10-84', 'B10-85'],
    routes: [
      route(
        'unauthenticated',
        ['B10-83'],
        'invalid Session target',
        ['completed'],
        'valid_draft',
        latestOnce,
        '401',
      ),
      route(
        'forbidden',
        ['B10-84'],
        'system role target',
        ['completed'],
        'valid_draft',
        latestOnce,
        '403',
      ),
      route(
        'network',
        ['B10-85'],
        'latest and generate network branches',
        ['final'],
        'none',
        branches([
          {
            routeKey: 'latest',
            request: request('GET', 'latest', '1', 'none', 'abort'),
            expectedHttpStatus: 'network-error',
            automaticRetry: false,
          },
          {
            routeKey: 'generate',
            request: request(
              'POST',
              'generate',
              '1',
              'confirm,primaryScaleInstanceIds',
              'abort',
            ),
            expectedHttpStatus: 'network-error',
            automaticRetry: false,
          },
        ]),
        'network-error',
      ),
    ],
  },
  {
    scenarioKey: 'client_state',
    ordinal: 10,
    scaleCode: 'moca',
    owner: 'B10-86',
    auditIds: ['B10-86', 'B10-87'],
    routes: [
      route(
        'base',
        ['B10-86', 'B10-87'],
        'two eligible candidates and no report',
        ['completed', 'completed'],
        'none',
        latestOnce,
        '404',
      ),
    ],
  },
  {
    scenarioKey: 'responsive_keyboard',
    ordinal: 11,
    scaleCode: 'mmse',
    owner: 'B10-88',
    auditIds: ['B10-88', 'B10-89'],
    routes: [
      route(
        'long_report',
        ['B10-88', 'B10-89'],
        'long report with multiple traces',
        ['completed', 'completed', 'completed'],
        'long_content',
        latestOnce,
        '200',
      ),
    ],
  },
  {
    scenarioKey: 'route_and_fanout',
    ordinal: 12,
    scaleCode: 'moca',
    owner: 'B10-90',
    auditIds: ['B10-90', 'B10-91'],
    routes: [
      route(
        'base',
        ['B10-90', 'B10-91'],
        'current visit report route',
        ['completed'],
        'valid_draft',
        latestOnce,
        '200',
      ),
    ],
  },
  {
    scenarioKey: 'deidentified_fixture',
    ordinal: 13,
    scaleCode: 'mmse',
    owner: 'B10-92',
    auditIds: ['B10-92'],
    routes: [
      route(
        'base',
        ['B10-92'],
        'de-identified manual fixture',
        ['final'],
        'rich_draft',
        latestOnce,
        '200',
      ),
    ],
  },
] as const;

export const B10_SCENARIOS: readonly B10ScenarioDefinition[] = [
  ...generationScenarios.map((scenario) => ({
    scenarioKey: scenario.scenarioKey,
    profile: 'generation-workflow' as const,
    ordinal: scenario.ordinal,
    scaleCode: scenario.scaleCode,
    primaryOwnerAuditId: scenario.owner,
    auditIds: scenario.auditIds,
    preparedState: scenario.routes
      .map(({ preparedState }) => preparedState)
      .join('; '),
    routeContracts: scenario.routes,
  })),
  ...publicScenarios.map((scenario) => ({
    scenarioKey: scenario.scenarioKey,
    profile: 'public-surface-security' as const,
    ordinal: scenario.ordinal,
    scaleCode: scenario.scaleCode,
    primaryOwnerAuditId: scenario.owner,
    auditIds: scenario.auditIds,
    preparedState: scenario.routes
      .map(({ preparedState }) => preparedState)
      .join('; '),
    routeContracts: scenario.routes,
  })),
];

export type B10SafeRoleManifest = {
  role: B10Role;
  loginIdentifier: string;
  displayName: string;
};

export type B10SafeRoute = {
  key: string;
  auditIds: readonly B10AuditId[];
  navigationLabel: string;
  pathTemplate: string;
  preparedState: string;
  expectedRequest: B10ExpectedRequestContract;
  expectedHttpStatus: string;
  postBrowserSideEffect: B10PostBrowserSideEffect;
};

export type B10SafeScenarioManifest = {
  scenarioKey: B10BusinessScenarioKey;
  primaryOwnerAuditId: B10AuditId;
  auditIds: readonly B10AuditId[];
  preparedState: string;
  routes: B10SafeRoute[];
};

export type B10ResourceCounts = {
  roles: number;
  patients: number;
  visits: number;
  instances: number;
  itemResponses: number;
  mediaEvidence: number;
  scoreResults: number;
  cognitiveDomainResults: number;
  clinicalReports: number;
  companionReports: number;
  ownedIndexes: number;
};

export type B10SafeManifest = {
  namespace: string;
  databaseName: string;
  profile: B10Profile;
  phase: B10VerifyPhase;
  roles: B10SafeRoleManifest[];
  scenarios: B10SafeScenarioManifest[];
  auditMatrix: readonly B10AuditContractEntry[];
  resourceCounts: B10ResourceCounts;
  seedHashUnchanged: true;
  expectedSummary: string;
};

export type B10SafeCleanupSummary = {
  namespace: string;
  databaseName: string;
  profile: B10Profile;
  residualCount: number;
  matched: boolean;
  seedHashUnchanged: true;
  expectedSummary: string;
};

export type B10RuntimeEnvironment = {
  nodeEnv: string | undefined;
  appEnv: string | undefined;
  databasePurpose: string | undefined;
  databaseName: string;
  storageDriver: string | undefined;
  llmProvider: string | undefined;
  smsProvider: string | undefined;
  sessionCookieSecure: boolean | undefined;
};

export const B10_VERIFY_STAGES = [
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

export type B10VerifyStage = (typeof B10_VERIFY_STAGES)[number];

export class B10FixtureError extends Error {
  constructor(
    readonly code: string,
    readonly safeMessage: string,
    readonly profile?: B10Profile,
    readonly scenarioKey?: B10ScenarioKey,
    readonly verifyStage?: B10VerifyStage,
    readonly verifyPhase?: B10VerifyPhase,
  ) {
    super(
      scenarioKey
        ? `${code}:${scenarioKey}:${safeMessage}`
        : `${code}:${safeMessage}`,
    );
  }
}

export type B10SafeErrorPayload = {
  ok: false;
  code: string;
  message: string;
  profile?: B10Profile;
  scenarioKey?: B10ScenarioKey;
  stage?: B10VerifyStage;
  phase?: B10VerifyPhase;
};

export function toB10SafeErrorPayload(error: unknown): B10SafeErrorPayload {
  if (error instanceof B10FixtureError) {
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
    code: 'B10_FIXTURE_OPERATION_FAILED',
    message:
      'B10 browser fixture operation failed without exposing internal details',
  };
}

export function scenarioDefinitionsFor(
  profile: B10Profile,
): readonly B10ScenarioDefinition[] {
  return B10_SCENARIOS.filter((scenario) => scenario.profile === profile);
}

export function auditMatrixFor(
  profile: B10Profile,
): readonly B10AuditContractEntry[] {
  return B10_AUDIT_MATRIX.filter(
    (entryValue) => entryValue.profile === profile,
  );
}

export function routeContractFor(
  profile: B10Profile,
  scenarioKey: B10BusinessScenarioKey,
  routeKey: string,
): B10RoutePreparedContract {
  const routeContract = scenarioDefinitionsFor(profile)
    .find((scenario) => scenario.scenarioKey === scenarioKey)
    ?.routeContracts.find((candidate) => candidate.key === routeKey);
  if (!routeContract) {
    throw new B10FixtureError(
      'B10_FIXTURE_ROUTE_CONTRACT_MISSING',
      'The requested route is not part of the fixed B10 profile contract',
      profile,
      scenarioKey,
    );
  }
  return routeContract;
}

export function validateB10Profile(value: string): B10Profile {
  if (value !== 'generation-workflow' && value !== 'public-surface-security') {
    throw new B10FixtureError(
      'B10_FIXTURE_PROFILE_INVALID',
      'Profile must be generation-workflow or public-surface-security',
    );
  }
  return value;
}

function namespacePrefixFor(profile: B10Profile): string {
  return profile === 'generation-workflow' ? 'b10g-' : 'b10p-';
}

export function validateB10Namespace(
  profile: B10Profile,
  value: string,
): string {
  const prefix = namespacePrefixFor(profile);
  if (
    value.length < 8 ||
    value.length > B10_NAMESPACE_MAX_LENGTH ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
    !value.startsWith(prefix)
  ) {
    throw new B10FixtureError(
      'B10_FIXTURE_NAMESPACE_INVALID',
      `Namespace must use the ${prefix} profile prefix and contain only lowercase letters, digits, or single hyphens`,
      profile,
    );
  }
  return value;
}

export function assertB10PreImportEnvironment(
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== 'test') {
    throw new B10FixtureError(
      'B10_FIXTURE_ENVIRONMENT_UNSAFE',
      'B10 fixtures require NODE_ENV=test before application import',
    );
  }
}

export function assertB10RuntimeEnvironment(env: B10RuntimeEnvironment): void {
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
    throw new B10FixtureError(
      'B10_FIXTURE_ENVIRONMENT_UNSAFE',
      'B10 fixtures require the exact isolated test database and fake or stub external services',
    );
  }
}

export function requireB10FixturePassword(value: string | undefined): string {
  if (!value || value.length < 16) {
    throw new B10FixtureError(
      'B10_FIXTURE_PASSWORD_REQUIRED',
      'B10_FIXTURE_PASSWORD must be provided through the process environment',
    );
  }
  return value;
}

function profileCode(profile: B10Profile): 'B10G' | 'B10P' {
  return profile === 'generation-workflow' ? 'B10G' : 'B10P';
}

export function accountNameFor(
  profile: B10Profile,
  namespace: string,
  role: B10Role,
): string {
  const prefix = profile === 'generation-workflow' ? 'b10gfx' : 'b10pfx';
  return `${prefix}-${namespace}-${role.replace('_', '-')}`;
}

export function displayNameFor(profile: B10Profile, role: B10Role): string {
  const profileName =
    profile === 'generation-workflow' ? '生成流程' : '公开安全面';
  const roleNames: Record<B10Role, string> = {
    doctor: '医生',
    admin: '管理员',
    nurse: '护士',
    research_assistant: '科研助理',
    system: '系统账号',
  };
  return `B10 ${profileName}测试${roleNames[role]}`;
}

export function scenarioSubjectCodeFor(
  profile: B10Profile,
  namespace: string,
  ordinal: number,
): string {
  return `${profileCode(profile)}-${namespace.toUpperCase()}-${ordinal
    .toString()
    .padStart(2, '0')}`;
}

export function scenarioVisitCodeFor(
  profile: B10Profile,
  namespace: string,
  ordinal: number,
  routeKey: string,
): string {
  return `${scenarioSubjectCodeFor(profile, namespace, ordinal)}-${routeKey
    .replace(/_/g, '-')
    .toUpperCase()}`;
}

export function conflictIndexNameFor(namespace: string): string {
  return `b10_${namespace.replace(/-/g, '_')}_generation_conflict`;
}

export function assertB10Contract(): void {
  const expectedIds = new Set<string>(B10_AUDIT_IDS);
  const matrixIds = B10_AUDIT_MATRIX.map(({ auditId }) => auditId);
  const scenarioIds = B10_SCENARIOS.flatMap(({ auditIds }) => auditIds);
  const scenarioKeys = B10_SCENARIOS.map(({ scenarioKey }) => scenarioKey);
  const ownersValid = B10_SCENARIOS.every((scenario) => {
    const owner = B10_AUDIT_MATRIX.find(
      ({ auditId }) => auditId === scenario.primaryOwnerAuditId,
    );
    return (
      scenario.auditIds.includes(scenario.primaryOwnerAuditId) &&
      owner?.profile === scenario.profile &&
      owner.scenarioKey === scenario.scenarioKey
    );
  });
  const entriesValid = B10_AUDIT_MATRIX.every((audit) => {
    const scenario = B10_SCENARIOS.find(
      (candidate) =>
        candidate.profile === audit.profile &&
        candidate.scenarioKey === audit.scenarioKey,
    );
    return Boolean(
      scenario?.auditIds.includes(audit.auditId) &&
      scenario.routeContracts.some(
        (routeValue) =>
          routeValue.key === audit.routeKey &&
          routeValue.auditIds.includes(audit.auditId),
      ),
    );
  });
  const routesValid = B10_SCENARIOS.every((scenario) =>
    scenario.routeContracts.every(
      (routeValue) =>
        routeValue.auditIds.length > 0 &&
        routeValue.auditIds.every((auditId) =>
          scenario.auditIds.includes(auditId),
        ) &&
        routeValue.automaticRetry === false,
    ),
  );
  if (
    B10_AUDIT_MATRIX.length !== 95 ||
    matrixIds.length !== new Set(matrixIds).size ||
    matrixIds.some((auditId) => !expectedIds.has(auditId)) ||
    B10_AUDIT_IDS.some((auditId) => !matrixIds.includes(auditId)) ||
    matrixIds.some((auditId, index) => auditId !== B10_AUDIT_IDS[index]) ||
    scenarioIds.length !== 95 ||
    scenarioIds.length !== new Set(scenarioIds).size ||
    scenarioKeys.length !== new Set(scenarioKeys).size ||
    auditMatrixFor('generation-workflow').length !== 48 ||
    auditMatrixFor('public-surface-security').length !== 47 ||
    scenarioDefinitionsFor('generation-workflow').length !== 10 ||
    scenarioDefinitionsFor('public-surface-security').length !== 13 ||
    !ownersValid ||
    !entriesValid ||
    !routesValid ||
    B10_DEFAULT_NAMESPACES['generation-workflow'] ===
      B10_DEFAULT_NAMESPACES['public-surface-security']
  ) {
    throw new B10FixtureError(
      'B10_FIXTURE_CONTRACT_INVALID',
      'The fixed 95-item B10 profile, route, and primary-owner contract is invalid',
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
  'auditMatrix',
  'auditId',
  'primaryRole',
  'targetArea',
  'requiresIndependentSession',
  'requiresNetworkControl',
  'requiresPrivacyVerification',
  'requiresKeyboardVerification',
  'requiresViewportVerification',
  'verificationFlags',
  'resourceCounts',
  'patients',
  'visits',
  'instances',
  'itemResponses',
  'mediaEvidence',
  'scoreResults',
  'cognitiveDomainResults',
  'clinicalReports',
  'companionReports',
  'ownedIndexes',
  'residualCount',
  'matched',
  'seedHashUnchanged',
  'expectedSummary',
]);

const FORBIDDEN_KEY_PATTERN =
  /(^id$|patientId|visitId|scaleInstanceId|scoreResultId|itemResponseId|domainResultId|sourceIds|metadata|rawResponse|reviewNote|objectKey|cookie|sessionToken|password|uri)/i;
const FORBIDDEN_VALUE_PATTERN =
  /(mongodb(?:\+srv)?:\/\/|cookie|session[_-]?token|password|objectid|objectkey|bucket|rawresponse|expectedvalue|scoringrule)/i;

function scanSafeManifest(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (FORBIDDEN_VALUE_PATTERN.test(value) || /^[a-f0-9]{24}$/i.test(value)) {
      throw new B10FixtureError(
        'B10_FIXTURE_MANIFEST_UNSAFE',
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
      throw new B10FixtureError(
        'B10_FIXTURE_MANIFEST_UNSAFE',
        `Safe manifest contains a forbidden field at ${path}.${key}`,
      );
    }
    scanSafeManifest(item, `${path}.${key}`);
  }
}

export function assertB10SafeManifest(value: unknown): void {
  scanSafeManifest(value, 'manifest');
}
