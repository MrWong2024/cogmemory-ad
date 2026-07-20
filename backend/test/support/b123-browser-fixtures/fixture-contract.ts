export const B123_DEFAULT_NAMESPACE = 'b123-browser-final';
export const B123_NAMESPACE_MAX_LENGTH = 32;

export const B123_ROLES = [
  'doctor',
  'admin',
  'nurse',
  'research_assistant',
  'system',
] as const;

export type B123Role = (typeof B123_ROLES)[number];

export const B123_DIRECT_AUDIT_IDS = [
  'B1-MV-001',
  'B1-MV-004',
  'B1-MV-006',
  'B1-MV-007',
  'B1-MV-008',
  'B1-MV-016',
  'B2-MV-001',
  'B2-MV-002',
  'B2-MV-003',
  'B2-MV-004',
  'B2-MV-006',
  'B2-MV-007',
  'B2-MV-008',
  'B2-MV-009',
  'B2-MV-010',
  'B2-MV-011',
  'B2-MV-015',
  'B2-MV-016',
  'B2-MV-018',
  'B2-MV-024',
  'B2-MV-025',
] as const;

export const B123_EXCLUDED_AUDIT_IDS = {
  covered: [
    'B1-MV-005',
    'B1-MV-011',
    'B1-MV-013',
    'B1-MV-014',
    'B1-MV-015',
    'B2-MV-017',
  ],
  human: ['B1-MV-017', 'B1-MV-018'],
  obsolete: ['B1-MV-009'],
} as const;

export type B123ExecutionClass =
  | 'browser-direct'
  | 'fixture-required'
  | 'mixed';
export type B123FaultMode = 'none' | 'cdp-abort' | 'controlled-transition';
export type B123TransitionMode = 'none' | 'arm-restore';
export type B123RequestCategory =
  | 'none'
  | 'auth-read'
  | 'auth-write'
  | 'patient-read'
  | 'patient-write'
  | 'visit-read'
  | 'visit-write'
  | 'catalog-read'
  | 'scale-write';

export type B123BusinessScenarioKey =
  | 'auth_login_matrix'
  | 'auth_service_unavailable'
  | 'dashboard_session_matrix'
  | 'dashboard_request_boundary'
  | 'public_home'
  | 'patients_empty'
  | 'patients_list_matrix'
  | 'patient_create_matrix'
  | 'patient_duplicate_conflict'
  | 'patient_detail_active'
  | 'visit_create_matrix'
  | 'visit_duplicate_conflict'
  | 'patient_status_matrix'
  | 'patient_session_restore'
  | 'patient_error_matrix'
  | 'visit_list_failure_isolated'
  | 'visit_write_no_retry'
  | 'visit_detail_uninitialized'
  | 'scale_initialization_matrix'
  | 'scale_duplicate_conflict'
  | 'visit_read_only_status_matrix'
  | 'visit_authz_matrix'
  | 'visit_not_found_matrix'
  | 'catalog_error_matrix'
  | 'scale_unavailable'
  | 'visit_request_boundary';

export type B123ScenarioKey = 'roles' | B123BusinessScenarioKey;
export type B123TransitionScenarioKey =
  | 'dashboard_session_matrix'
  | 'catalog_error_matrix'
  | 'scale_unavailable';

export type B123ScenarioDefinition = {
  scenarioKey: B123BusinessScenarioKey;
  ordinal: number;
  purpose: string;
  auditIds: readonly string[];
  routeKind:
    | 'login'
    | 'dashboard'
    | 'home'
    | 'patients'
    | 'patient-new'
    | 'patient-detail'
    | 'visit-new'
    | 'visit-detail';
  suggestedRole: B123Role;
  expectedPage: string;
  requestCategory: B123RequestCategory;
  faultMode: B123FaultMode;
  transitionMode: B123TransitionMode;
  expectedHttpStatus: number | null;
  expectedBusinessCode: string | null;
  expectedSummary: string;
};

export const B123_BUSINESS_SCENARIOS = [
  {
    scenarioKey: 'auth_login_matrix',
    ordinal: 1,
    purpose:
      'Login success, invalid credentials, submit state, and safe form boundary',
    auditIds: ['B1-MV-001', 'B1-MV-002', 'B1-MV-004', 'B1-MV-006'],
    routeKind: 'login',
    suggestedRole: 'doctor',
    expectedPage: 'login',
    requestCategory: 'auth-write',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 201,
    expectedBusinessCode: null,
    expectedSummary:
      'Five synthetic accounts support the login and invalid-credential matrix',
  },
  {
    scenarioKey: 'auth_service_unavailable',
    ordinal: 2,
    purpose:
      'Login service network failure with stable UI and no sensitive details',
    auditIds: ['B1-MV-003'],
    routeKind: 'login',
    suggestedRole: 'doctor',
    expectedPage: 'login',
    requestCategory: 'auth-write',
    faultMode: 'cdp-abort',
    transitionMode: 'none',
    expectedHttpStatus: null,
    expectedBusinessCode: null,
    expectedSummary:
      'Abort POST /auth/login once; the write must not be retried',
  },
  {
    scenarioKey: 'dashboard_session_matrix',
    ordinal: 3,
    purpose:
      'Dashboard session restore, public user fields, and controlled session invalidation',
    auditIds: ['B1-MV-007', 'B1-MV-008', 'B1-MV-012'],
    routeKind: 'dashboard',
    suggestedRole: 'doctor',
    expectedPage: 'dashboard',
    requestCategory: 'auth-read',
    faultMode: 'controlled-transition',
    transitionMode: 'arm-restore',
    expectedHttpStatus: 401,
    expectedBusinessCode: null,
    expectedSummary:
      'Arm revokes only namespace-owned active sessions and restore reactivates them',
  },
  {
    scenarioKey: 'dashboard_request_boundary',
    ordinal: 4,
    purpose:
      'Dashboard issues only the authentication probe and no clinical business requests',
    auditIds: ['B1-MV-010'],
    routeKind: 'dashboard',
    suggestedRole: 'doctor',
    expectedPage: 'dashboard',
    requestCategory: 'auth-read',
    faultMode: 'cdp-abort',
    transitionMode: 'none',
    expectedHttpStatus: null,
    expectedBusinessCode: null,
    expectedSummary:
      'Abort GET /auth/me to verify isolated error and manual retry behavior',
  },
  {
    scenarioKey: 'public_home',
    ordinal: 5,
    purpose:
      'Public home remains static and exposes login and dashboard navigation',
    auditIds: ['B1-MV-016'],
    routeKind: 'home',
    suggestedRole: 'doctor',
    expectedPage: 'public-home',
    requestCategory: 'none',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 200,
    expectedBusinessCode: null,
    expectedSummary: 'The public page requires no backend request',
  },
  {
    scenarioKey: 'patients_empty',
    ordinal: 6,
    purpose:
      'Deterministic no-match patient filter distinct from the populated namespace',
    auditIds: ['B2-MV-003'],
    routeKind: 'patients',
    suggestedRole: 'doctor',
    expectedPage: 'patient-list-empty-filter',
    requestCategory: 'patient-read',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 200,
    expectedBusinessCode: null,
    expectedSummary:
      'A reserved no-match keyword produces total zero without cross-namespace assumptions',
  },
  {
    scenarioKey: 'patients_list_matrix',
    ordinal: 7,
    purpose:
      'Patient pagination, keyword, status, source type, and stable ordering',
    auditIds: ['B2-MV-001', 'B2-MV-002', 'B2-MV-024', 'B2-MV-025'],
    routeKind: 'patients',
    suggestedRole: 'doctor',
    expectedPage: 'patient-list',
    requestCategory: 'patient-read',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 200,
    expectedBusinessCode: null,
    expectedSummary:
      'The fixture exceeds the real default page size and provides keyword, status, source type, total, and stable-ordering evidence',
  },
  {
    scenarioKey: 'patient_create_matrix',
    ordinal: 8,
    purpose:
      'Reserved patient creation with safe date and normalized tag expectations',
    auditIds: ['B2-MV-004', 'B2-MV-006', 'B2-MV-007'],
    routeKind: 'patient-new',
    suggestedRole: 'doctor',
    expectedPage: 'patient-create',
    requestCategory: 'patient-write',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 201,
    expectedBusinessCode: null,
    expectedSummary:
      'Prepared phase reserves a missing subjectCode; post-browser verifies the real record',
  },
  {
    scenarioKey: 'patient_duplicate_conflict',
    ordinal: 9,
    purpose: 'Existing patient subject code for a real duplicate conflict',
    auditIds: ['B2-MV-005'],
    routeKind: 'patient-new',
    suggestedRole: 'doctor',
    expectedPage: 'patient-create-conflict',
    requestCategory: 'patient-write',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 409,
    expectedBusinessCode: 'PATIENT_SUBJECT_CODE_CONFLICT',
    expectedSummary: 'The duplicate target exists exactly once',
  },
  {
    scenarioKey: 'patient_detail_active',
    ordinal: 10,
    purpose:
      'Active patient detail with public fields and a multi-status visit list',
    auditIds: ['B2-MV-008', 'B2-MV-009', 'B2-MV-010'],
    routeKind: 'patient-detail',
    suggestedRole: 'doctor',
    expectedPage: 'patient-detail',
    requestCategory: 'patient-read',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 200,
    expectedBusinessCode: null,
    expectedSummary:
      'Patient detail remains available while visits cover filters and date boundaries',
  },
  {
    scenarioKey: 'visit_create_matrix',
    ordinal: 11,
    purpose:
      'Reserved Visit creation with server-owned operator and status fields',
    auditIds: ['B2-MV-011', 'B2-MV-015', 'B2-MV-016'],
    routeKind: 'visit-new',
    suggestedRole: 'doctor',
    expectedPage: 'visit-create',
    requestCategory: 'visit-write',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 201,
    expectedBusinessCode: null,
    expectedSummary:
      'Prepared phase reserves a missing visitCode; post-browser validates authenticated operator ownership',
  },
  {
    scenarioKey: 'visit_duplicate_conflict',
    ordinal: 12,
    purpose: 'Existing Visit code for a real duplicate conflict',
    auditIds: ['B2-MV-012'],
    routeKind: 'visit-new',
    suggestedRole: 'doctor',
    expectedPage: 'visit-create-conflict',
    requestCategory: 'visit-write',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 409,
    expectedBusinessCode: 'VISIT_CODE_CONFLICT',
    expectedSummary: 'The duplicate Visit target exists exactly once',
  },
  {
    scenarioKey: 'patient_status_matrix',
    ordinal: 13,
    purpose: 'Inactive and archived Patient write restrictions',
    auditIds: ['B2-MV-013', 'B2-MV-014'],
    routeKind: 'patient-detail',
    suggestedRole: 'doctor',
    expectedPage: 'patient-status-restricted',
    requestCategory: 'visit-write',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 409,
    expectedBusinessCode: 'PATIENT_NOT_ACTIVE',
    expectedSummary:
      'Both inactive and archived roots are present and have no forbidden writes',
  },
  {
    scenarioKey: 'patient_session_restore',
    ordinal: 14,
    purpose:
      'Patient workspace refresh restores the HttpOnly session through /auth/me',
    auditIds: ['B2-MV-018'],
    routeKind: 'patient-detail',
    suggestedRole: 'doctor',
    expectedPage: 'patient-session-restore',
    requestCategory: 'auth-read',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 200,
    expectedBusinessCode: null,
    expectedSummary:
      'Refresh reuses the server session and does not expose browser-readable credentials',
  },
  {
    scenarioKey: 'patient_error_matrix',
    ordinal: 15,
    purpose:
      'Patient invalid ID, not-found, forbidden, and service failure UI states',
    auditIds: ['B2-MV-019', 'B2-MV-020', 'B2-MV-021', 'B2-MV-022'],
    routeKind: 'patient-detail',
    suggestedRole: 'system',
    expectedPage: 'patient-error-matrix',
    requestCategory: 'patient-read',
    faultMode: 'cdp-abort',
    transitionMode: 'none',
    expectedHttpStatus: 403,
    expectedBusinessCode: null,
    expectedSummary:
      'Synthetic invalid and missing routes plus a CDP abort cover the stable error matrix',
  },
  {
    scenarioKey: 'visit_list_failure_isolated',
    ordinal: 16,
    purpose:
      'Visit list network failure remains isolated from successful patient detail',
    auditIds: ['B2-MV-023'],
    routeKind: 'patient-detail',
    suggestedRole: 'doctor',
    expectedPage: 'patient-detail-visit-error',
    requestCategory: 'visit-read',
    faultMode: 'cdp-abort',
    transitionMode: 'none',
    expectedHttpStatus: null,
    expectedBusinessCode: null,
    expectedSummary:
      'Abort only GET /patients/:id/visits; patient detail remains rendered',
  },
  {
    scenarioKey: 'visit_write_no_retry',
    ordinal: 17,
    purpose:
      'Visit POST network failure produces no automatic retry and no side effect',
    auditIds: ['B2-MV-026'],
    routeKind: 'visit-new',
    suggestedRole: 'doctor',
    expectedPage: 'visit-create-network-error',
    requestCategory: 'visit-write',
    faultMode: 'cdp-abort',
    transitionMode: 'none',
    expectedHttpStatus: null,
    expectedBusinessCode: null,
    expectedSummary:
      'Abort the reserved Visit POST once and verify the target remains absent',
  },
  {
    scenarioKey: 'visit_detail_uninitialized',
    ordinal: 18,
    purpose:
      'Draft Visit detail, real catalog, empty instance list, and safe catalog fields',
    auditIds: [
      'B3-MV-001',
      'B3-MV-002',
      'B3-MV-003',
      'B3-MV-004',
      'B3-MV-005',
      'B3-MV-022',
    ],
    routeKind: 'visit-detail',
    suggestedRole: 'doctor',
    expectedPage: 'visit-detail-uninitialized',
    requestCategory: 'visit-read',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 200,
    expectedBusinessCode: null,
    expectedSummary:
      'The Visit has no instance while MMSE and MoCA safe catalog summaries are available',
  },
  {
    scenarioKey: 'scale_initialization_matrix',
    ordinal: 19,
    purpose: 'Reserved real MMSE and MoCA initialization results',
    auditIds: ['B3-MV-006', 'B3-MV-007', 'B3-MV-010', 'B3-MV-011'],
    routeKind: 'visit-detail',
    suggestedRole: 'doctor',
    expectedPage: 'scale-initialization',
    requestCategory: 'scale-write',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 201,
    expectedBusinessCode: null,
    expectedSummary:
      'Prepared phase has no target instances; post-browser requires both real skeletons',
  },
  {
    scenarioKey: 'scale_duplicate_conflict',
    ordinal: 20,
    purpose:
      'Existing MMSE and MoCA instances for duplicate initialization conflicts',
    auditIds: ['B3-MV-008', 'B3-MV-009'],
    routeKind: 'visit-detail',
    suggestedRole: 'doctor',
    expectedPage: 'scale-duplicate-conflict',
    requestCategory: 'scale-write',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 409,
    expectedBusinessCode: 'SCALE_INSTANCE_ALREADY_EXISTS',
    expectedSummary:
      'Both duplicate targets are materialized through the production workflow',
  },
  {
    scenarioKey: 'visit_read_only_status_matrix',
    ordinal: 21,
    purpose: 'Completed, locked, and voided Visit initialization restrictions',
    auditIds: ['B3-MV-012'],
    routeKind: 'visit-detail',
    suggestedRole: 'doctor',
    expectedPage: 'visit-read-only-status',
    requestCategory: 'scale-write',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 409,
    expectedBusinessCode: 'VISIT_NOT_INITIALIZABLE',
    expectedSummary:
      'Three deterministic Visit states remain read-only and side-effect free',
  },
  {
    scenarioKey: 'visit_authz_matrix',
    ordinal: 22,
    purpose: 'Unauthenticated and system-role Visit access boundaries',
    auditIds: ['B3-MV-013', 'B3-MV-014'],
    routeKind: 'visit-detail',
    suggestedRole: 'system',
    expectedPage: 'visit-authz',
    requestCategory: 'visit-read',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 403,
    expectedBusinessCode: null,
    expectedSummary:
      'Unauthenticated requests return 401 and the system role returns 403',
  },
  {
    scenarioKey: 'visit_not_found_matrix',
    ordinal: 23,
    purpose: 'Patient, Visit, and ownership not-found boundaries',
    auditIds: ['B3-MV-015', 'B3-MV-016', 'B3-MV-017'],
    routeKind: 'visit-detail',
    suggestedRole: 'doctor',
    expectedPage: 'visit-not-found',
    requestCategory: 'visit-read',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 404,
    expectedBusinessCode: 'VISIT_NOT_FOUND',
    expectedSummary:
      'Synthetic missing resources and a cross-owned Visit preserve safe 404 semantics',
  },
  {
    scenarioKey: 'catalog_error_matrix',
    ordinal: 24,
    purpose:
      'Catalog GET network failure and real stored catalog version conflict',
    auditIds: ['B3-MV-018', 'B3-MV-020', 'B3-MV-021'],
    routeKind: 'visit-detail',
    suggestedRole: 'doctor',
    expectedPage: 'catalog-error',
    requestCategory: 'catalog-read',
    faultMode: 'controlled-transition',
    transitionMode: 'arm-restore',
    expectedHttpStatus: 409,
    expectedBusinessCode: 'SCALE_CATALOG_VERSION_CONFLICT',
    expectedSummary:
      'CDP covers GET failure; arm changes one real stored MMSE trace after page load',
  },
  {
    scenarioKey: 'scale_unavailable',
    ordinal: 25,
    purpose:
      'A previously loaded MoCA catalog option becomes unavailable before initialization',
    auditIds: ['B3-MV-019'],
    routeKind: 'visit-detail',
    suggestedRole: 'doctor',
    expectedPage: 'scale-unavailable',
    requestCategory: 'scale-write',
    faultMode: 'controlled-transition',
    transitionMode: 'arm-restore',
    expectedHttpStatus: 409,
    expectedBusinessCode: 'SCALE_NOT_ACTIVE',
    expectedSummary:
      'Arm retires only the real stored MoCA definition after the page loaded its safe catalog',
  },
  {
    scenarioKey: 'visit_request_boundary',
    ordinal: 26,
    purpose:
      'Scale initialization request whitelist, credentials, and no unrelated writes',
    auditIds: ['B3-MV-023'],
    routeKind: 'visit-detail',
    suggestedRole: 'doctor',
    expectedPage: 'visit-request-boundary',
    requestCategory: 'scale-write',
    faultMode: 'none',
    transitionMode: 'none',
    expectedHttpStatus: 400,
    expectedBusinessCode: null,
    expectedSummary:
      'Only scaleCode, scaleVersion, and administrationMode are permitted in the POST body',
  },
] as const satisfies readonly B123ScenarioDefinition[];

export const B123_TRANSITION_SCENARIOS = [
  'dashboard_session_matrix',
  'catalog_error_matrix',
  'scale_unavailable',
] as const satisfies readonly B123TransitionScenarioKey[];

export type B123SafeValue =
  | string
  | number
  | boolean
  | null
  | readonly string[];

export type B123SafeRoleManifest = {
  role: B123Role;
  loginIdentifier: string;
  displayName: string;
};

export type B123SafeScenarioManifest = {
  scenarioKey: B123ScenarioKey;
  purpose: string;
  auditIds: readonly string[];
  executionClass: B123ExecutionClass;
  route: string;
  suggestedRole: B123Role;
  expectedPage: string;
  requestCategory: B123RequestCategory;
  faultMode: B123FaultMode;
  transitionMode: B123TransitionMode;
  expectedHttpStatus: number | null;
  expectedBusinessCode: string | null;
  expectedSummary: string;
  testInput: Readonly<Record<string, B123SafeValue>> | null;
};

export type B123SafeManifest = {
  namespace: string;
  databaseName: string;
  roles: B123SafeRoleManifest[];
  scenarios: B123SafeScenarioManifest[];
  summary: {
    action: 'created' | 'verified';
    phase: 'prepared' | 'post-browser';
    roleCount: number;
    scenarioCount: number;
    businessScenarioCount: number;
    auditIdCount: number;
    browserDirectCount: number;
    fixtureRequiredCount: number;
  };
};

export type B123SafeCleanupSummary = {
  namespace: string;
  databaseName: string;
  action: 'cleaned';
  matched: boolean;
  deleted: {
    sessions: number;
    reports: number;
    cognitiveDomainResults: number;
    scoreResults: number;
    mediaEvidence: number;
    itemResponses: number;
    scaleInstances: number;
    visits: number;
    patients: number;
    users: number;
  };
  residualCount: number;
};

export type B123SafeTransitionSummary = {
  namespace: string;
  databaseName: string;
  action: 'armed' | 'restored';
  scenarioKey: B123TransitionScenarioKey;
  changedCount: number;
};

export class B123FixtureError extends Error {
  constructor(
    readonly code: string,
    readonly safeMessage: string,
    readonly scenarioKey?: B123ScenarioKey,
  ) {
    super(code);
  }
}

export type B123RuntimeEnvironment = {
  nodeEnv: string | undefined;
  appEnv: string | undefined;
  databaseName: string;
  storageDriver: string | undefined;
  llmProvider: string | undefined;
  smsProvider: string | undefined;
  sessionCookieSecure: boolean | undefined;
};

const NAMESPACE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TEST_DATABASE_PATTERN = /(^|[_-])test($|[_-])/i;
const OBJECT_ID_VALUE_PATTERN = /(^|[^a-f0-9])[a-f0-9]{24}([^a-f0-9]|$)/i;
const FORBIDDEN_MANIFEST_KEYS = new Set([
  'id',
  '_id',
  'password',
  'passwordhash',
  'cookie',
  'session',
  'sessionid',
  'sessiontoken',
  'sessiontokenhash',
  'token',
  'mongodburi',
  'mongouri',
  'metadata',
  'operatorsnapshot',
  'patientid',
  'visitid',
  'assessmentvisitid',
  'userid',
  'scaledefinitionid',
  'scaleversionid',
  'scaleinstanceid',
  'itemresponseid',
  'scoreresultid',
  'cognitivedomainresultid',
  'mediaevidenceid',
  'reportid',
]);

export function validateB123Namespace(value: string): string {
  const namespace = value.trim();
  if (
    namespace.length < 3 ||
    namespace.length > B123_NAMESPACE_MAX_LENGTH ||
    !NAMESPACE_PATTERN.test(namespace)
  ) {
    throw new B123FixtureError(
      'B123_FIXTURE_NAMESPACE_INVALID',
      `Namespace must be 3-${B123_NAMESPACE_MAX_LENGTH} characters using lowercase letters, numbers, and single hyphen separators`,
    );
  }
  return namespace;
}

export function requireB123FixturePassword(value: string | undefined): string {
  if (!value || value.length > 256) {
    throw new B123FixtureError(
      'B123_FIXTURE_PASSWORD_REQUIRED',
      'B1-B3 fixture password environment variable is required and must be at most 256 characters',
    );
  }
  return value;
}

export function assertB123PreImportEnvironment(
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== 'test') {
    throw new B123FixtureError(
      'B123_FIXTURE_TEST_ENV_REQUIRED',
      'B1-B3 browser fixtures are restricted to NODE_ENV=test',
    );
  }
}

export function assertB123RuntimeEnvironment(
  environment: B123RuntimeEnvironment,
): void {
  assertB123PreImportEnvironment(environment.nodeEnv);
  const databaseName = environment.databaseName.trim();
  if (
    !databaseName ||
    !TEST_DATABASE_PATTERN.test(databaseName) ||
    /(^|[_-])(dev|prod|production)($|[_-])/i.test(databaseName)
  ) {
    throw new B123FixtureError(
      'B123_FIXTURE_TEST_DATABASE_REQUIRED',
      'B1-B3 browser fixtures require an isolated database whose name follows the project test naming convention',
    );
  }
  if (
    environment.appEnv !== 'test' ||
    environment.storageDriver !== 'fake' ||
    environment.llmProvider !== 'stub' ||
    environment.smsProvider !== 'stub' ||
    environment.sessionCookieSecure !== false
  ) {
    throw new B123FixtureError(
      'B123_FIXTURE_TEST_RUNTIME_UNSAFE',
      'B1-B3 browser fixtures require the test app environment, fake storage, stub providers, and non-production session settings',
    );
  }
}

function scanSafeValue(value: unknown, path: string): void {
  if (path.endsWith('.route')) return;
  if (typeof value === 'string') {
    if (
      /mongodb(\+srv)?:\/\//i.test(value) ||
      OBJECT_ID_VALUE_PATTERN.test(value)
    ) {
      throw new B123FixtureError(
        'B123_FIXTURE_MANIFEST_UNSAFE',
        `Safe manifest contains a forbidden value at ${path}`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanSafeValue(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (FORBIDDEN_MANIFEST_KEYS.has(normalizedKey)) {
      throw new B123FixtureError(
        'B123_FIXTURE_MANIFEST_UNSAFE',
        `Safe manifest contains a forbidden field at ${path}.${key}`,
      );
    }
    scanSafeValue(entry, `${path}.${key}`);
  }
}

export function assertB123SafeManifest(value: unknown): void {
  scanSafeValue(value, 'manifest');
}

export function executionClassForAuditIds(
  auditIds: readonly string[],
): B123ExecutionClass {
  const direct = new Set<string>(B123_DIRECT_AUDIT_IDS);
  const directCount = auditIds.filter((id) => direct.has(id)).length;
  if (directCount === auditIds.length) return 'browser-direct';
  if (directCount === 0) return 'fixture-required';
  return 'mixed';
}

export function assertB123ScenarioContract(): void {
  const scenarioKeys = [
    'roles',
    ...B123_BUSINESS_SCENARIOS.map((scenario) => scenario.scenarioKey),
  ];
  const auditIds = B123_BUSINESS_SCENARIOS.flatMap((scenario) => [
    ...scenario.auditIds,
  ]);
  const uniqueAuditIds = new Set(auditIds);
  const directIds = new Set<string>(B123_DIRECT_AUDIT_IDS);
  const directCount = auditIds.filter((id) => directIds.has(id)).length;
  const excluded = new Set<string>([
    ...B123_EXCLUDED_AUDIT_IDS.covered,
    ...B123_EXCLUDED_AUDIT_IDS.human,
    ...B123_EXCLUDED_AUDIT_IDS.obsolete,
  ]);
  if (
    scenarioKeys.length !== 27 ||
    new Set(scenarioKeys).size !== 27 ||
    B123_BUSINESS_SCENARIOS.length !== 26 ||
    auditIds.length !== 58 ||
    uniqueAuditIds.size !== 58 ||
    directIds.size !== 21 ||
    directCount !== 21 ||
    auditIds.length - directCount !== 37 ||
    auditIds.some((id) => excluded.has(id))
  ) {
    throw new B123FixtureError(
      'B123_FIXTURE_SCENARIO_CONTRACT_INVALID',
      'Scenario contract must contain 27 unique keys, 26 business scenarios, 58 unique primary audit IDs, and a 21/37 execution balance without excluded IDs',
    );
  }
}

export function accountNameFor(namespace: string, role: B123Role): string {
  return `b123fx-${namespace}-${role.replace('_', '-')}`;
}

export function displayNameFor(role: B123Role): string {
  const names: Record<B123Role, string> = {
    doctor: 'B1-B3 测试医生',
    admin: 'B1-B3 测试管理员',
    nurse: 'B1-B3 测试护士',
    research_assistant: 'B1-B3 测试科研助理',
    system: 'B1-B3 测试系统账号',
  };
  return names[role];
}

export function scenarioSubjectCodeFor(
  namespace: string,
  ordinal: number,
  suffix = 'ROOT',
): string {
  return `B123-${namespace.toUpperCase()}-${ordinal.toString().padStart(2, '0')}-${suffix}`;
}

export function scenarioVisitCodeFor(
  namespace: string,
  ordinal: number,
  suffix = 'BASE',
): string {
  return `${scenarioSubjectCodeFor(namespace, ordinal)}-VISIT-${suffix}`;
}

export function browserPatientSubjectCodeFor(namespace: string): string {
  return `B123-${namespace.toUpperCase()}-BROWSER-PATIENT`;
}

export function browserVisitCodeFor(namespace: string): string {
  return `B123-${namespace.toUpperCase()}-BROWSER-VISIT`;
}

export function failedVisitCodeFor(namespace: string): string {
  return `B123-${namespace.toUpperCase()}-FAILED-VISIT`;
}

export function noMatchKeywordFor(namespace: string): string {
  return `B123-NO-MATCH-${namespace.toUpperCase()}`;
}

assertB123ScenarioContract();
