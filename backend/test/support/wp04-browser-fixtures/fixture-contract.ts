export const WP04_DEFAULT_NAMESPACE = 'wp04-local';
export const WP04_NAMESPACE_MAX_LENGTH = 32;

export const WP04_ROLES = [
  'doctor',
  'admin',
  'nurse',
  'research_assistant',
  'system',
] as const;

export type Wp04Role = (typeof WP04_ROLES)[number];

export const WP04_SCENARIO_GROUPS = {
  accounts: ['roles'],
  history: [
    'history_empty',
    'history_pagination',
    'history_filters',
    'history_source_matrix',
    'history_report_summary_matrix',
  ],
  reportVersions: [
    'report_versions_none',
    'report_versions_v1',
    'report_versions_v2',
    'report_versions_v3',
    'report_versions_long_chain',
    'report_versions_lineage_invalid',
    'report_versions_incomplete',
  ],
  reportDetails: [
    'report_detail_draft',
    'report_detail_pending_confirmation',
    'report_detail_confirmed',
    'report_detail_archived',
    'report_detail_corrected',
    'report_detail_voided',
    'report_detail_incomplete',
  ],
  trendBasics: ['trend_empty', 'trend_data_status_matrix'],
  trendTotals: [
    'trend_comparable',
    'trend_scale_version_changed',
    'trend_crf_version_changed',
    'trend_scoring_rule_changed',
    'trend_field_encoding_changed',
    'trend_administration_mode_changed',
    'trend_score_range_changed',
    'trend_multiple_reasons',
    'trend_missing_break',
  ],
  trendDomains: [
    'trend_domain_comparable',
    'trend_domain_mapping_version_changed',
    'trend_domain_mapping_source_changed',
    'trend_domain_mapping_mode_changed',
    'trend_domain_set_changed',
    'trend_domain_range_changed',
    'trend_domain_partially_comparable',
    'trend_domain_unavailable',
  ],
  trendRangeAndPatient: [
    'trend_range_exact_100',
    'trend_range_too_large_101',
    'trend_patient_inactive',
    'trend_patient_archived',
    'trend_scale_unavailable',
  ],
} as const;

export type Wp04ScenarioGroup = keyof typeof WP04_SCENARIO_GROUPS;
export type Wp04ScenarioKey =
  (typeof WP04_SCENARIO_GROUPS)[Wp04ScenarioGroup][number];
export type Wp04BusinessScenarioKey = Exclude<Wp04ScenarioKey, 'roles'>;

export type Wp04ScenarioDefinition = {
  scenarioKey: Wp04BusinessScenarioKey;
  ordinal: number;
  group: Exclude<Wp04ScenarioGroup, 'accounts'>;
  purpose: string;
  suggestedRole: Wp04Role;
  expectedPage: 'history' | 'report_versions' | 'report_detail' | 'trend';
};

const PURPOSES: Record<Wp04BusinessScenarioKey, string> = {
  history_empty: 'Patient history empty state',
  history_pagination: 'Stable 105-Visit history pagination at 20, 50, and 100',
  history_filters:
    'History date, type, status, current and legacy scale filters',
  history_source_matrix: 'History Score and Domain source availability matrix',
  history_report_summary_matrix:
    'History report summary none, available, and incomplete matrix',
  report_versions_none: 'Report version list empty state',
  report_versions_v1: 'Valid single-version report lineage',
  report_versions_v2: 'Valid V1 to V2 report lineage',
  report_versions_v3: 'Valid V1 to V3 report lineage',
  report_versions_long_chain: 'Valid V1 to V21 lineage and 20-item pagination',
  report_versions_lineage_invalid:
    'Minimally damaged lineage returning a stable conflict',
  report_versions_incomplete: 'Readable ownership with incomplete report facts',
  report_detail_draft: 'Readable draft historical report detail',
  report_detail_pending_confirmation:
    'Readable pending-confirmation historical report detail',
  report_detail_confirmed: 'Readable confirmed historical report detail',
  report_detail_archived: 'Readable archived historical report detail',
  report_detail_corrected: 'Readable corrected report with a real replacement',
  report_detail_voided: 'Readable voided historical report detail',
  report_detail_incomplete: 'Incomplete historical report detail conflict',
  trend_empty: 'Follow-up trend empty state',
  trend_data_status_matrix: 'All six Visit-preserving trend data statuses',
  trend_comparable: 'Comparable adjacent total scores',
  trend_scale_version_changed: 'Scale version exact-trace mismatch',
  trend_crf_version_changed: 'CRF version exact-trace mismatch',
  trend_scoring_rule_changed: 'Scoring-rule exact-trace mismatch',
  trend_field_encoding_changed: 'Field-encoding exact-trace mismatch',
  trend_administration_mode_changed: 'Administration-mode exact-trace mismatch',
  trend_score_range_changed: 'Total score range mismatch',
  trend_multiple_reasons: 'Stable ordering for multiple exact-trace reasons',
  trend_missing_break: 'Available to missing to available adjacency break',
  trend_domain_comparable: 'Comparable cognitive-domain scores',
  trend_domain_mapping_version_changed: 'Domain mapping-version mismatch',
  trend_domain_mapping_source_changed:
    'Untrusted mapping source safely degrades Domain output',
  trend_domain_mapping_mode_changed:
    'Untrusted mapping mode safely degrades Domain output',
  trend_domain_set_changed: 'Domain code set mismatch',
  trend_domain_range_changed: 'Domain score range mismatch',
  trend_domain_partially_comparable:
    'Mixed comparable and non-comparable Domain items',
  trend_domain_unavailable:
    'Unavailable Domain source without erasing total comparison',
  trend_range_exact_100: 'Exactly 100 Visits accepted at maxPoints 100',
  trend_range_too_large_101: 'Exactly 101 Visits rejected at maxPoints 100',
  trend_patient_inactive: 'Inactive Patient historical trend remains readable',
  trend_patient_archived: 'Archived Patient historical trend remains readable',
  trend_scale_unavailable:
    'Unavailable catalog scale returns a stable not-found result',
};

const GROUP_PAGE: Record<
  Exclude<Wp04ScenarioGroup, 'accounts'>,
  Wp04ScenarioDefinition['expectedPage']
> = {
  history: 'history',
  reportVersions: 'report_versions',
  reportDetails: 'report_detail',
  trendBasics: 'trend',
  trendTotals: 'trend',
  trendDomains: 'trend',
  trendRangeAndPatient: 'trend',
};

export const WP04_BUSINESS_SCENARIOS: readonly Wp04ScenarioDefinition[] = (
  Object.entries(WP04_SCENARIO_GROUPS) as Array<
    [Wp04ScenarioGroup, readonly Wp04ScenarioKey[]]
  >
).flatMap(([group, keys]) =>
  group === 'accounts'
    ? []
    : keys.map((scenarioKey) => ({
        scenarioKey: scenarioKey as Wp04BusinessScenarioKey,
        ordinal:
          Object.values(WP04_SCENARIO_GROUPS).flat().indexOf(scenarioKey) + 1,
        group,
        purpose: PURPOSES[scenarioKey as Wp04BusinessScenarioKey],
        suggestedRole:
          scenarioKey === 'trend_scale_unavailable' ? 'admin' : 'doctor',
        expectedPage: GROUP_PAGE[group],
      })),
);

export type Wp04SafeRoleManifest = {
  role: Wp04Role;
  loginIdentifier: string;
  displayName: string;
};

export type Wp04SafeScenarioManifest = {
  scenarioKey: Wp04ScenarioKey;
  purpose: string;
  route: string;
  suggestedRole: Wp04Role;
  expectedPage: 'login' | Wp04ScenarioDefinition['expectedPage'];
  expectedHttpStatus: number;
  expectedBusinessCode: string | null;
  expectedSummary: string;
  expectedPointCount?: number;
  expectedDataStatusCounts?: Partial<Record<string, number>>;
  expectedComparisonStatus?: string;
  expectedReasons?: string[];
  expectedDomainComparisonStatus?: string;
  expectedDomainReasons?: string[];
  expectedVersionCount?: number;
  expectedLatestVersion?: number;
  expectedReportStatus?: string;
};

export type Wp04SafeManifest = {
  namespace: string;
  databaseName: string;
  roles: Wp04SafeRoleManifest[];
  scenarios: Wp04SafeScenarioManifest[];
  summary: {
    action: 'created' | 'verified';
    roleCount: 5;
    scenarioCount: 44;
    businessScenarioCount: 43;
  };
};

export type Wp04SafeCleanupSummary = {
  namespace: string;
  databaseName: string;
  action: 'cleaned';
  matched: boolean;
  deleted: Record<string, number>;
  residualCount: number;
};

export class Wp04FixtureError extends Error {
  constructor(
    readonly code: string,
    readonly safeMessage: string,
    readonly scenarioKey?: Wp04ScenarioKey,
  ) {
    super(code);
  }
}

export type Wp04RuntimeEnvironment = {
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
const FORBIDDEN_MANIFEST_KEYS = new Set([
  'password',
  'passwordhash',
  'cookie',
  'session',
  'sessiontoken',
  'token',
  'mongodburi',
  'mongouri',
  'patientid',
  'visitid',
  'reportid',
  'scaleinstanceid',
  'itemresponseid',
  'scoreresultid',
  'domainresultid',
  'cognitivedomainresultid',
  'previousreportid',
  'replacementreportid',
  'correctionid',
  'sourcearchiveid',
  'sourcefreezeid',
  'archiveid',
  'freezeid',
  'sourceids',
  'metadata',
  'narrative',
  'rawresponse',
]);

export function validateWp04Namespace(value: string): string {
  const namespace = value.trim();
  if (
    namespace.length < 3 ||
    namespace.length > WP04_NAMESPACE_MAX_LENGTH ||
    !NAMESPACE_PATTERN.test(namespace)
  ) {
    throw new Wp04FixtureError(
      'WP04_FIXTURE_NAMESPACE_INVALID',
      `Namespace must be 3-${WP04_NAMESPACE_MAX_LENGTH} characters using lowercase letters, numbers, and single hyphen separators`,
    );
  }
  return namespace;
}

export function requireWp04FixturePassword(value: string | undefined): string {
  if (!value || value.length > 256) {
    throw new Wp04FixtureError(
      'WP04_FIXTURE_PASSWORD_REQUIRED',
      'WP-04 fixture password environment variable is required and must be at most 256 characters',
    );
  }
  return value;
}

export function assertWp04PreImportEnvironment(
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== 'test') {
    throw new Wp04FixtureError(
      'WP04_FIXTURE_TEST_ENV_REQUIRED',
      'WP-04 browser fixtures are restricted to NODE_ENV=test',
    );
  }
}

export function assertWp04RuntimeEnvironment(
  environment: Wp04RuntimeEnvironment,
): void {
  assertWp04PreImportEnvironment(environment.nodeEnv);
  const databaseName = environment.databaseName.trim();
  if (
    !databaseName ||
    !TEST_DATABASE_PATTERN.test(databaseName) ||
    /(^|[_-])(dev|prod|production)($|[_-])/i.test(databaseName)
  ) {
    throw new Wp04FixtureError(
      'WP04_FIXTURE_TEST_DATABASE_REQUIRED',
      'WP-04 browser fixtures require an isolated database whose name follows the project test naming convention',
    );
  }
  if (
    environment.appEnv !== 'test' ||
    environment.storageDriver !== 'fake' ||
    environment.llmProvider !== 'stub' ||
    environment.smsProvider !== 'stub' ||
    environment.sessionCookieSecure !== false
  ) {
    throw new Wp04FixtureError(
      'WP04_FIXTURE_TEST_RUNTIME_UNSAFE',
      'WP-04 browser fixtures require the test app environment, fake storage, stub providers, and non-production session settings',
    );
  }
}

function scanSafeValue(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (/mongodb(\+srv)?:\/\//i.test(value)) {
      throw new Wp04FixtureError(
        'WP04_FIXTURE_MANIFEST_UNSAFE',
        `Safe manifest contains a forbidden connection value at ${path}`,
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
    if (
      path !== 'manifest.scenarios[].route' &&
      FORBIDDEN_MANIFEST_KEYS.has(normalizedKey)
    ) {
      throw new Wp04FixtureError(
        'WP04_FIXTURE_MANIFEST_UNSAFE',
        `Safe manifest contains a forbidden field at ${path}.${key}`,
      );
    }
    scanSafeValue(
      entry,
      key === 'route' ? 'manifest.scenarios[].route' : `${path}.${key}`,
    );
  }
}

export function assertWp04SafeManifest(value: unknown): void {
  scanSafeValue(value, 'manifest');
}

export function accountNameFor(namespace: string, role: Wp04Role): string {
  return `wp04fx-${namespace}-${role.replace('_', '-')}`;
}

export function displayNameFor(role: Wp04Role): string {
  const names: Record<Wp04Role, string> = {
    doctor: 'WP-04 测试医生',
    admin: 'WP-04 测试管理员',
    nurse: 'WP-04 测试护士',
    research_assistant: 'WP-04 测试科研助理',
    system: 'WP-04 测试系统账号',
  };
  return names[role];
}

export function subjectCodeFor(namespace: string, ordinal: number): string {
  return `WP04-${namespace.toUpperCase()}-${ordinal.toString().padStart(2, '0')}`;
}

export function visitCodeFor(
  namespace: string,
  ordinal: number,
  suffix: string,
): string {
  return `${subjectCodeFor(namespace, ordinal)}-${suffix}`;
}

export function instanceCodeFor(
  namespace: string,
  ordinal: number,
  suffix: string,
): string {
  return `${subjectCodeFor(namespace, ordinal)}-INST-${suffix}`;
}

export function reportCodeFor(
  namespace: string,
  ordinal: number,
  version: number,
): string {
  return `${subjectCodeFor(namespace, ordinal)}-RPT-V${version}`;
}
