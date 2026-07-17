export const B16_DEFAULT_NAMESPACE = 'b16-local';
export const B16_NAMESPACE_MAX_LENGTH = 32;

export const B16_ROLES = [
  'doctor',
  'admin',
  'nurse',
  'research_assistant',
] as const;

export type B16Role = (typeof B16_ROLES)[number];

export type B16ScenarioStage =
  | 'login'
  | 'a22_lock'
  | 'a23_freeze'
  | 'a23_resume'
  | 'a24_archive'
  | 'a25_correction';

export type B16BusinessScenarioKey =
  | 'v1_doctor_ready_lock'
  | 'v1_admin_ready_lock'
  | 'v1_visit_ineligible'
  | 'archived_v1_for_v2'
  | 'archived_v2_for_v3'
  | 'v2_patient_inactive_ready_lock'
  | 'v2_visit_locked_ready_lock'
  | 'v2_visit_voided_ready_lock'
  | 'v2_ready_freeze'
  | 'v2_freeze_in_progress'
  | 'v2_ready_archive'
  | 'v2_ready_lock_concurrency'
  | 'v2_ready_archive_concurrency'
  | 'v2_already_locked'
  | 'v2_already_frozen'
  | 'v2_already_archived'
  | 'v2_freeze_before_lock'
  | 'v2_archive_before_freeze'
  | 'v2_lineage_invalid_internal';

export type B16ScenarioKey = 'roles' | B16BusinessScenarioKey;

export type B16PreparationTarget =
  | 'v1_ready_lock'
  | 'v1_archived'
  | 'v2_ready_lock'
  | 'v2_ready_freeze'
  | 'v2_freeze_in_progress'
  | 'v2_ready_archive'
  | 'v2_archived';

export type B16BusinessScenarioDefinition = {
  scenarioKey: B16BusinessScenarioKey;
  ordinal: number;
  purpose: string;
  suggestedRole: Extract<B16Role, 'doctor' | 'admin'>;
  expectedStartingStage: Exclude<B16ScenarioStage, 'login'>;
  target: B16PreparationTarget;
  patientStatus?: 'inactive';
  visitStatus?: 'locked' | 'voided';
  lineageInvalid?: true;
};

export const B16_BUSINESS_SCENARIOS = [
  {
    scenarioKey: 'v1_doctor_ready_lock',
    ordinal: 1,
    purpose: 'Doctor V1 lock, freeze, and archive regression chain',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a22_lock',
    target: 'v1_ready_lock',
  },
  {
    scenarioKey: 'v1_admin_ready_lock',
    ordinal: 2,
    purpose: 'Admin V1 lock, freeze, and archive regression chain',
    suggestedRole: 'admin',
    expectedStartingStage: 'a22_lock',
    target: 'v1_ready_lock',
  },
  {
    scenarioKey: 'v1_visit_ineligible',
    ordinal: 3,
    purpose: 'V1 lock remains blocked by an ineligible visit state',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a22_lock',
    target: 'v1_ready_lock',
    visitStatus: 'locked',
  },
  {
    scenarioKey: 'archived_v1_for_v2',
    ordinal: 4,
    purpose: 'Archived V1 ready for creation of a real V2 correction',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a25_correction',
    target: 'v1_archived',
  },
  {
    scenarioKey: 'archived_v2_for_v3',
    ordinal: 5,
    purpose: 'Linear V1 to archived V2 chain ready for creation of V3',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a25_correction',
    target: 'v2_archived',
  },
  {
    scenarioKey: 'v2_patient_inactive_ready_lock',
    ordinal: 6,
    purpose: 'Confirmed V2 remains lockable with historical inactive patient',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a22_lock',
    target: 'v2_ready_lock',
    patientStatus: 'inactive',
  },
  {
    scenarioKey: 'v2_visit_locked_ready_lock',
    ordinal: 7,
    purpose: 'Confirmed V2 remains lockable with historical locked visit',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a22_lock',
    target: 'v2_ready_lock',
    visitStatus: 'locked',
  },
  {
    scenarioKey: 'v2_visit_voided_ready_lock',
    ordinal: 8,
    purpose: 'Confirmed V2 remains lockable with historical voided visit',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a22_lock',
    target: 'v2_ready_lock',
    visitStatus: 'voided',
  },
  {
    scenarioKey: 'v2_ready_freeze',
    ordinal: 9,
    purpose: 'Locked V2 ready for its first A23 source-freeze receipt',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a23_freeze',
    target: 'v2_ready_freeze',
  },
  {
    scenarioKey: 'v2_freeze_in_progress',
    ordinal: 10,
    purpose: 'Recoverable V2 A23 in-progress receipt with durable source facts',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a23_resume',
    target: 'v2_freeze_in_progress',
  },
  {
    scenarioKey: 'v2_ready_archive',
    ordinal: 11,
    purpose: 'V2 with completed A22 and A23 ready for archive',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a24_archive',
    target: 'v2_ready_archive',
  },
  {
    scenarioKey: 'v2_ready_lock_concurrency',
    ordinal: 12,
    purpose: 'Independent V2 for double-click and two-session lock behavior',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a22_lock',
    target: 'v2_ready_lock',
  },
  {
    scenarioKey: 'v2_ready_archive_concurrency',
    ordinal: 13,
    purpose: 'Independent V2 for double-click and two-session archive behavior',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a24_archive',
    target: 'v2_ready_archive',
  },
  {
    scenarioKey: 'v2_already_locked',
    ordinal: 14,
    purpose: 'V2 with a real existing A22 lock receipt',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a22_lock',
    target: 'v2_ready_freeze',
  },
  {
    scenarioKey: 'v2_already_frozen',
    ordinal: 15,
    purpose: 'V2 with real A22 and completed A23 receipts',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a23_freeze',
    target: 'v2_ready_archive',
  },
  {
    scenarioKey: 'v2_already_archived',
    ordinal: 16,
    purpose: 'V2 with real A22, A23, and A24 receipts',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a24_archive',
    target: 'v2_archived',
  },
  {
    scenarioKey: 'v2_freeze_before_lock',
    ordinal: 17,
    purpose: 'Confirmed V2 that must reject freeze before A22',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a23_freeze',
    target: 'v2_ready_lock',
  },
  {
    scenarioKey: 'v2_archive_before_freeze',
    ordinal: 18,
    purpose: 'Locked V2 that must reject archive before completed A23',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a24_archive',
    target: 'v2_ready_freeze',
  },
  {
    scenarioKey: 'v2_lineage_invalid_internal',
    ordinal: 19,
    purpose:
      'Publicly safe V2 whose internal bidirectional lineage must return 409',
    suggestedRole: 'doctor',
    expectedStartingStage: 'a22_lock',
    target: 'v2_ready_lock',
    lineageInvalid: true,
  },
] as const satisfies readonly B16BusinessScenarioDefinition[];

export type B16SafeRoleManifest = {
  role: B16Role;
  loginIdentifier: string;
  displayName: string;
};

export type B16SafeAggregateCounts = {
  expectedSourceCount: number;
  completedSourceCount: number | null;
  newlyFrozenSourceCount: number | null;
  previouslyFrozenSourceCount: number;
};

export type B16SafeScenarioManifest = {
  scenarioKey: B16ScenarioKey;
  purpose: string;
  route: string;
  reportCode: string | null;
  reportVersion: number | null;
  currentStatus: string;
  suggestedRole: B16Role;
  expectedStartingStage: B16ScenarioStage;
  expectedAggregateCounts?: B16SafeAggregateCounts;
};

export type B16SafeManifest = {
  namespace: string;
  databaseName: string;
  roles: B16SafeRoleManifest[];
  scenarios: B16SafeScenarioManifest[];
  summary: {
    action: 'created' | 'verified';
    roleCount: number;
    scenarioCount: number;
    businessScenarioCount: number;
  };
};

export type B16SafeCleanupSummary = {
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

export class B16FixtureError extends Error {
  constructor(
    readonly code: string,
    readonly safeMessage: string,
    readonly scenarioKey?: B16ScenarioKey,
  ) {
    super(code);
  }
}

export type B16RuntimeEnvironment = {
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
  'sessiontoken',
  'sessiontokenhash',
  'mongodburi',
  'mongouri',
  'previousreportid',
  'sourcereportid',
  'replacementreportid',
  'correctionid',
  'freezeid',
  'scaleinstanceid',
  'itemresponseid',
  'scoreresultid',
  'cognitivedomainresultid',
  'mediaevidenceid',
  'reportbody',
]);

export function validateB16Namespace(value: string): string {
  const namespace = value.trim();
  if (
    namespace.length < 3 ||
    namespace.length > B16_NAMESPACE_MAX_LENGTH ||
    !NAMESPACE_PATTERN.test(namespace)
  ) {
    throw new B16FixtureError(
      'B16_FIXTURE_NAMESPACE_INVALID',
      `Namespace must be 3-${B16_NAMESPACE_MAX_LENGTH} characters using lowercase letters, numbers, and single hyphen separators`,
    );
  }
  return namespace;
}

export function requireB16FixturePassword(value: string | undefined): string {
  if (!value || value.length > 256) {
    throw new B16FixtureError(
      'B16_FIXTURE_PASSWORD_REQUIRED',
      'B16 fixture password environment variable is required and must be at most 256 characters',
    );
  }
  return value;
}

export function assertB16PreImportEnvironment(
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== 'test') {
    throw new B16FixtureError(
      'B16_FIXTURE_TEST_ENV_REQUIRED',
      'B16 browser fixtures are restricted to NODE_ENV=test',
    );
  }
}

export function assertB16RuntimeEnvironment(
  environment: B16RuntimeEnvironment,
): void {
  assertB16PreImportEnvironment(environment.nodeEnv);
  const databaseName = environment.databaseName.trim();
  if (
    !databaseName ||
    !TEST_DATABASE_PATTERN.test(databaseName) ||
    /(^|[_-])(dev|prod|production)($|[_-])/i.test(databaseName)
  ) {
    throw new B16FixtureError(
      'B16_FIXTURE_TEST_DATABASE_REQUIRED',
      'B16 browser fixtures require an isolated database whose name follows the project test naming convention',
    );
  }
  if (
    environment.appEnv !== 'test' ||
    environment.storageDriver !== 'fake' ||
    environment.llmProvider !== 'stub' ||
    environment.smsProvider !== 'stub' ||
    environment.sessionCookieSecure !== false
  ) {
    throw new B16FixtureError(
      'B16_FIXTURE_TEST_RUNTIME_UNSAFE',
      'B16 browser fixtures require the test app environment, fake storage, stub providers, and non-production session settings',
    );
  }
}

function scanSafeValue(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (/mongodb(\+srv)?:\/\//i.test(value)) {
      throw new B16FixtureError(
        'B16_FIXTURE_MANIFEST_UNSAFE',
        `Safe manifest contains a forbidden connection value at ${path}`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanSafeValue(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (FORBIDDEN_MANIFEST_KEYS.has(normalizedKey)) {
      throw new B16FixtureError(
        'B16_FIXTURE_MANIFEST_UNSAFE',
        `Safe manifest contains a forbidden field at ${path}.${key}`,
      );
    }
    scanSafeValue(entry, `${path}.${key}`);
  }
}

export function assertB16SafeManifest(value: unknown): void {
  scanSafeValue(value, 'manifest');
}

export function accountNameFor(namespace: string, role: B16Role): string {
  return `b16fx-${namespace}-${role.replace('_', '-')}`;
}

export function displayNameFor(role: B16Role): string {
  const names: Record<B16Role, string> = {
    doctor: 'B16 测试医生',
    admin: 'B16 测试管理员',
    nurse: 'B16 测试护士',
    research_assistant: 'B16 测试科研助理',
  };
  return names[role];
}

export function subjectCodeFor(namespace: string, ordinal: number): string {
  return `B16-${namespace.toUpperCase()}-${ordinal.toString().padStart(2, '0')}`;
}

export function visitCodeFor(namespace: string, ordinal: number): string {
  return `${subjectCodeFor(namespace, ordinal)}-VISIT`;
}

export function baseReportCodeFor(namespace: string, ordinal: number): string {
  return `${subjectCodeFor(namespace, ordinal)}-RPT-V1`;
}
