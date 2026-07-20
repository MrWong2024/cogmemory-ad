export const B456_DEFAULT_NAMESPACE = 'b456-browser-final';
export const B456_NAMESPACE_MAX_LENGTH = 32;

export const B456_ROLES = [
  'doctor',
  'admin',
  'nurse',
  'research_assistant',
  'system',
] as const;

export type B456Role = (typeof B456_ROLES)[number];
export type B456ExecutionClass =
  | 'browser-direct'
  | 'fixture-required'
  | 'mixed';
export type B456FaultMode = 'none' | 'cdp-abort';
export type B456TransitionMode = 'none';
export type B456ScaleCode = 'mmse' | 'moca';

export const B456_DIRECT_AUDIT_IDS = [
  'B5-MV-002',
  'B5-MV-003',
  'B5-MV-010',
  'B5-MV-020',
  'B5-MV-024',
  'B5-MV-026',
  'B5-MV-030',
  'B5-MV-031',
  'B5-MV-032',
  'B5-MV-033',
  'B5-MV-034',
  'B5-MV-035',
  'B5-MV-046',
  'B5-MV-054',
  'B5-MV-057',
] as const;

export const B456_EXCLUDED_AUDIT_IDS = [
  'B5-MV-008',
  'B5-MV-028',
  'B5-MV-029',
  'B5-MV-058',
  'B5-MV-059',
  'B5-MV-060',
  'B5-MV-061',
  'B5-MV-062',
] as const;

export type B456BusinessScenarioKey =
  | 'scale_execution_load'
  | 'scale_execution_input_types'
  | 'scale_execution_serial7'
  | 'scale_execution_delayed_recall'
  | 'scale_execution_missing_reason'
  | 'scale_execution_timing'
  | 'scale_execution_media_boundary'
  | 'scale_execution_save_progress'
  | 'scale_execution_navigation_dirty'
  | 'scale_execution_error_matrix'
  | 'scale_execution_request_boundary'
  | 'media_requirement_matrix'
  | 'media_file_validation'
  | 'media_upload_photo_scan'
  | 'media_preview_url'
  | 'media_void_reupload'
  | 'handwriting_mouse_canvas'
  | 'handwriting_trajectory'
  | 'media_local_draft_navigation'
  | 'media_read_only_matrix'
  | 'media_error_matrix'
  | 'media_concurrency_boundary'
  | 'submission_readiness_matrix'
  | 'submission_dirty_upload_stale'
  | 'submission_issue_navigation'
  | 'submission_ready_confirm'
  | 'submission_idempotency_concurrency'
  | 'submission_post_submit_read_only'
  | 'submission_authz_error_matrix'
  | 'submission_cross_group_navigation'
  | 'submission_network_final_state';

export type B456ScenarioKey = 'roles' | B456BusinessScenarioKey;

export type B456ScenarioDefinition = {
  scenarioKey: B456BusinessScenarioKey;
  ordinal: number;
  purpose: string;
  auditIds: readonly string[];
  scaleCode: B456ScaleCode;
  expectedPage: string;
  expectedStatus: number | null;
  expectedBusinessCode: string | null;
  faultMode: B456FaultMode;
  transitionMode: B456TransitionMode;
  expectedSummary: string;
  fileInputKeys: readonly B456FileInputKey[];
};

function auditRange(batch: 'B4' | 'B5' | 'B6', start: number, end: number) {
  return Array.from(
    { length: end - start + 1 },
    (_, index) => `${batch}-MV-${(start + index).toString().padStart(3, '0')}`,
  );
}

export const B456_BUSINESS_SCENARIOS = [
  {
    scenarioKey: 'scale_execution_load',
    ordinal: 1,
    purpose:
      'Editable MMSE and MoCA execution detail, ordering, safe fields, and progress',
    auditIds: auditRange('B4', 1, 4),
    scaleCode: 'mmse',
    expectedPage: 'scale-execution',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'The root Visit exposes editable MMSE and MoCA instances with real seeded item skeletons',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'scale_execution_input_types',
    ordinal: 2,
    purpose:
      'Boolean, number, text, single-choice, and multi-choice draft editors',
    auditIds: auditRange('B4', 5, 11),
    scaleCode: 'mmse',
    expectedPage: 'scale-execution-input-types',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'A test-only number variant complements real boolean, text, and choice item types without exposing scoring rules',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'scale_execution_serial7',
    ordinal: 3,
    purpose: 'Serial-seven fixed step slots and non-scoring draft input',
    auditIds: auditRange('B4', 12, 13),
    scaleCode: 'mmse',
    expectedPage: 'scale-execution-serial7',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'The real MMSE serial-seven item retains its fixed server-owned step slots',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'scale_execution_delayed_recall',
    ordinal: 4,
    purpose: 'Delayed-recall fixed prompt slots and safe prompt draft input',
    auditIds: auditRange('B4', 14, 15),
    scaleCode: 'moca',
    expectedPage: 'scale-execution-delayed-recall',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'The real MoCA delayed-recall item retains its fixed server-owned prompt slots',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'scale_execution_missing_reason',
    ordinal: 5,
    purpose: 'Missing response, required reason, clearing, and preserved notes',
    auditIds: auditRange('B4', 16, 18),
    scaleCode: 'mmse',
    expectedPage: 'scale-execution-missing',
    expectedStatus: 400,
    expectedBusinessCode: 'ITEM_RESPONSE_MISSING_REASON_REQUIRED',
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'An editable item supports the real missing-reason workflow and side-effect checks',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'scale_execution_timing',
    ordinal: 6,
    purpose: 'Timed-item input and non-timed/invalid timing boundaries',
    auditIds: auditRange('B4', 19, 20),
    scaleCode: 'moca',
    expectedPage: 'scale-execution-timing',
    expectedStatus: 400,
    expectedBusinessCode: 'ITEM_RESPONSE_INVALID_TIMING',
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'Real timed and ordinary MoCA items cover allowed and rejected timing drafts',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'scale_execution_media_boundary',
    ordinal: 7,
    purpose:
      'Drawing, handwriting, and photo item boundaries independent from answer PATCH',
    auditIds: auditRange('B4', 21, 22),
    scaleCode: 'moca',
    expectedPage: 'scale-execution-media-boundary',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'Real seeded drawing and handwriting-capable items keep answer and evidence workflows separate',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'scale_execution_save_progress',
    ordinal: 8,
    purpose: 'Draft persistence, mark-as-answered, progress, and refresh',
    auditIds: auditRange('B4', 23, 29),
    scaleCode: 'mmse',
    expectedPage: 'scale-execution-save-progress',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'Prepared targets are untouched; post-browser verification requires real draft and progress persistence',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'scale_execution_navigation_dirty',
    ordinal: 9,
    purpose: 'Cross-group local draft retention and dirty navigation warning',
    auditIds: auditRange('B4', 30, 31),
    scaleCode: 'mmse',
    expectedPage: 'scale-execution-navigation-dirty',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'A multi-group MMSE instance provides stable server state while Browser owns unsaved local drafts',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'scale_execution_error_matrix',
    ordinal: 10,
    purpose:
      'Read-only statuses, stale timestamp, not-found, ownership, authentication, and authorization',
    auditIds: auditRange('B4', 32, 40),
    scaleCode: 'mmse',
    expectedPage: 'scale-execution-error-matrix',
    expectedStatus: 409,
    expectedBusinessCode: 'ITEM_RESPONSE_NOT_EDITABLE',
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'Completed, locked, voided, scored, ownership, stale, 401, 403, and not-found roots are deterministic',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'scale_execution_request_boundary',
    ordinal: 11,
    purpose: 'GET cancellation, encoded paths, PATCH whitelist, and no retry',
    auditIds: auditRange('B4', 41, 44),
    scaleCode: 'mmse',
    expectedPage: 'scale-execution-request-boundary',
    expectedStatus: null,
    expectedBusinessCode: null,
    faultMode: 'cdp-abort',
    transitionMode: 'none',
    expectedSummary:
      'Browser aborts one request and inspects the real request boundary without fixture mutation',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'media_requirement_matrix',
    ordinal: 12,
    purpose:
      'Pending, attached, locked, and voided evidence requirement states',
    auditIds: auditRange('B5', 1, 5),
    scaleCode: 'moca',
    expectedPage: 'media-requirement-matrix',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'Real item requirements and workflow-created evidence cover all public lifecycle states',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'media_file_validation',
    ordinal: 13,
    purpose: 'JPEG, PNG, WebP, size, MIME, signature, and decode validation',
    auditIds: [...auditRange('B5', 6, 7), ...auditRange('B5', 9, 13)],
    scaleCode: 'moca',
    expectedPage: 'media-file-validation',
    expectedStatus: 400,
    expectedBusinessCode: 'MEDIA_FILE_SIGNATURE_INVALID',
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'Dedicated temporary files cover accepted formats and every rejected file class',
    fileInputKeys: [
      'jpeg',
      'png',
      'webp',
      'oversized',
      'wrongMime',
      'invalidImage',
    ],
  },
  {
    scenarioKey: 'media_upload_photo_scan',
    ordinal: 14,
    purpose:
      'Photo upload, paper scan, page metadata, and requirement synchronization',
    auditIds: auditRange('B5', 14, 19),
    scaleCode: 'moca',
    expectedPage: 'media-upload-photo-scan',
    expectedStatus: 201,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'Two eligible items reserve real Browser upload targets without prepared evidence',
    fileInputKeys: ['jpeg', 'png'],
  },
  {
    scenarioKey: 'media_preview_url',
    ordinal: 15,
    purpose:
      'On-demand primary preview URL, expiry, refresh, and safe rendering',
    auditIds: auditRange('B5', 20, 23),
    scaleCode: 'moca',
    expectedPage: 'media-preview-url',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'An attached workflow-created image supports primary URL refresh and browser preview checks',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'media_void_reupload',
    ordinal: 16,
    purpose:
      'Void reason validation, history retention, pending reset, and re-upload',
    auditIds: auditRange('B5', 24, 27),
    scaleCode: 'moca',
    expectedPage: 'media-void-reupload',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'One attached evidence is reserved for Browser void and replacement through real workflow',
    fileInputKeys: ['jpeg'],
  },
  {
    scenarioKey: 'handwriting_mouse_canvas',
    ordinal: 17,
    purpose: 'Mouse handwriting canvas, local stroke editing, and PNG upload',
    auditIds: auditRange('B5', 30, 37),
    scaleCode: 'moca',
    expectedPage: 'handwriting-mouse-canvas',
    expectedStatus: 201,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'An empty handwriting-capable target and PNG file support desktop mouse-only Browser coverage',
    fileInputKeys: ['handwritingPng'],
  },
  {
    scenarioKey: 'handwriting_trajectory',
    ordinal: 18,
    purpose:
      'Trajectory inclusion, omission, access, point count, and size boundaries',
    auditIds: auditRange('B5', 38, 43),
    scaleCode: 'moca',
    expectedPage: 'handwriting-trajectory',
    expectedStatus: 201,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'Valid and over-limit trajectory files accompany a clean handwriting upload target',
    fileInputKeys: ['handwritingPng', 'trajectoryValid', 'trajectoryOversized'],
  },
  {
    scenarioKey: 'media_local_draft_navigation',
    ordinal: 19,
    purpose:
      'Cross-group local media draft retention, reload clearing, and unload warning',
    auditIds: auditRange('B5', 44, 47),
    scaleCode: 'moca',
    expectedPage: 'media-local-draft-navigation',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'Stable clean server state isolates Browser-local blobs, strokes, and dirty counters',
    fileInputKeys: ['jpeg', 'handwritingPng'],
  },
  {
    scenarioKey: 'media_read_only_matrix',
    ordinal: 20,
    purpose:
      'Read-only Patient, Visit, ScaleInstance, ItemResponse, and evidence access',
    auditIds: auditRange('B5', 48, 49),
    scaleCode: 'mmse',
    expectedPage: 'media-read-only-matrix',
    expectedStatus: 409,
    expectedBusinessCode: 'ITEM_RESPONSE_NOT_EDITABLE',
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'Workflow-created media remains readable across deterministic non-editable root states',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'media_error_matrix',
    ordinal: 21,
    purpose:
      'Patient inactive, storage/network failure, authentication, and authorization errors',
    auditIds: auditRange('B5', 50, 53),
    scaleCode: 'moca',
    expectedPage: 'media-error-matrix',
    expectedStatus: 409,
    expectedBusinessCode: 'PATIENT_NOT_ACTIVE',
    faultMode: 'cdp-abort',
    transitionMode: 'none',
    expectedSummary:
      'An inactive root plus a one-shot network abort covers stable media error handling without server repair',
    fileInputKeys: ['jpeg'],
  },
  {
    scenarioKey: 'media_concurrency_boundary',
    ordinal: 22,
    purpose:
      'Same-item same-type write locking and non-retried upload/void requests',
    auditIds: auditRange('B5', 54, 57),
    scaleCode: 'moca',
    expectedPage: 'media-concurrency-boundary',
    expectedStatus: 409,
    expectedBusinessCode: 'MEDIA_EVIDENCE_ALREADY_ATTACHED',
    faultMode: 'cdp-abort',
    transitionMode: 'none',
    expectedSummary:
      'One clean target supports two-tab collision while database uniqueness prevents duplicate active evidence',
    fileInputKeys: ['jpeg'],
  },
  {
    scenarioKey: 'submission_readiness_matrix',
    ordinal: 23,
    purpose:
      'Ready, blocking, warning, safe statistics, and isolated readiness errors',
    auditIds: auditRange('B6', 1, 7),
    scaleCode: 'mmse',
    expectedPage: 'submission-readiness-matrix',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'A blocking primary instance and a ready warning companion use the real readiness evaluator',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'submission_dirty_upload_stale',
    ordinal: 24,
    purpose:
      'Local dirty answer, pending upload, and readiness stale invalidation',
    auditIds: auditRange('B6', 8, 12),
    scaleCode: 'mmse',
    expectedPage: 'submission-dirty-upload-stale',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'A clean server baseline reserves answer and media writes whose completion must invalidate Browser readiness',
    fileInputKeys: ['jpeg'],
  },
  {
    scenarioKey: 'submission_issue_navigation',
    ordinal: 25,
    purpose:
      'Blocking issue navigation, cross-group focus, and scale-level issue handling',
    auditIds: auditRange('B6', 13, 16),
    scaleCode: 'mmse',
    expectedPage: 'submission-issue-navigation',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'A real incomplete multi-group instance produces item and scale readiness issues',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'submission_ready_confirm',
    ordinal: 26,
    purpose:
      'Ready confirmation, checkbox, write disabling, and successful final submit',
    auditIds: auditRange('B6', 17, 23),
    scaleCode: 'mmse',
    expectedPage: 'submission-ready-confirm',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'A workflow-completed but unsubmitted instance is ready for exactly one Browser submission',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'submission_idempotency_concurrency',
    ordinal: 27,
    purpose: 'Two-session concurrent submit and alreadySubmitted idempotency',
    auditIds: auditRange('B6', 24, 24),
    scaleCode: 'mmse',
    expectedPage: 'submission-idempotency-concurrency',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'A ready instance supports two independent authenticated Browser sessions and one stored submission',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'submission_post_submit_read_only',
    ordinal: 28,
    purpose:
      'Completed refresh, historical reads, frozen answer/media writes, and no unrelated workflow writes',
    auditIds: auditRange('B6', 25, 30),
    scaleCode: 'mmse',
    expectedPage: 'submission-post-submit-read-only',
    expectedStatus: 409,
    expectedBusinessCode: 'SCALE_INSTANCE_NOT_EDITABLE',
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'The real submission workflow creates a completed read-only instance while Visit and downstream results remain unchanged',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'submission_authz_error_matrix',
    ordinal: 29,
    purpose:
      'Patient/Visit restrictions, 401, 403, not-ready, and conflict handling',
    auditIds: auditRange('B6', 31, 35),
    scaleCode: 'mmse',
    expectedPage: 'submission-authz-error-matrix',
    expectedStatus: 409,
    expectedBusinessCode: 'SCALE_INSTANCE_NOT_READY',
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'Inactive, non-editable, unauthenticated, forbidden, not-ready, and ownership roots remain side-effect free',
    fileInputKeys: [],
  },
  {
    scenarioKey: 'submission_cross_group_navigation',
    ordinal: 30,
    purpose:
      'Cross-group issue navigation without losing answer or media drafts',
    auditIds: auditRange('B6', 36, 36),
    scaleCode: 'moca',
    expectedPage: 'submission-cross-group-navigation',
    expectedStatus: 200,
    expectedBusinessCode: null,
    faultMode: 'none',
    transitionMode: 'none',
    expectedSummary:
      'A multi-group MoCA instance keeps server state stable while Browser owns local drafts',
    fileInputKeys: ['handwritingPng'],
  },
  {
    scenarioKey: 'submission_network_final_state',
    ordinal: 31,
    purpose:
      'One interrupted submit response followed by authoritative final-state recovery',
    auditIds: auditRange('B6', 37, 37),
    scaleCode: 'mmse',
    expectedPage: 'submission-network-final-state',
    expectedStatus: null,
    expectedBusinessCode: null,
    faultMode: 'cdp-abort',
    transitionMode: 'none',
    expectedSummary:
      'A ready instance is submitted once while Browser interrupts only the response and then reloads server state',
    fileInputKeys: [],
  },
] as const satisfies readonly B456ScenarioDefinition[];

export const B456_FILE_INPUT_KEYS = [
  'jpeg',
  'png',
  'webp',
  'oversized',
  'wrongMime',
  'invalidImage',
  'handwritingPng',
  'trajectoryValid',
  'trajectoryOversized',
] as const;
export type B456FileInputKey = (typeof B456_FILE_INPUT_KEYS)[number];

export type B456SafeRoleManifest = {
  role: B456Role;
  loginIdentifier: string;
  displayName: string;
};

export type B456SafeScenarioManifest = {
  scenarioKey: B456ScenarioKey;
  auditIds: readonly string[];
  executionClass: B456ExecutionClass;
  route: string;
  expectedPage: string;
  expectedStatus: number | null;
  expectedBusinessCode: string | null;
  testInput: Readonly<
    Record<string, string | number | boolean | readonly string[]>
  > | null;
  fileInputs: Readonly<Partial<Record<B456FileInputKey, string>>> | null;
  faultMode: B456FaultMode;
  transitionMode: B456TransitionMode;
  expectedSummary: string;
};

export type B456SafeManifest = {
  namespace: string;
  databaseName: string;
  roles: B456SafeRoleManifest[];
  scenarios: B456SafeScenarioManifest[];
  expectedSummary: string;
};

export type B456SafeCleanupSummary = {
  namespace: string;
  databaseName: string;
  expectedSummary: string;
};

export type B456RuntimeEnvironment = {
  nodeEnv: string | undefined;
  appEnv: string | undefined;
  databaseName: string;
  storageDriver: string | undefined;
  llmProvider: string | undefined;
  smsProvider: string | undefined;
  sessionCookieSecure: boolean | undefined;
};

export class B456FixtureError extends Error {
  constructor(
    readonly code: string,
    readonly safeMessage: string,
    readonly scenarioKey?: B456ScenarioKey,
  ) {
    super(code);
  }
}

export function validateB456Namespace(value: string): string {
  if (
    value.length < 3 ||
    value.length > B456_NAMESPACE_MAX_LENGTH ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  ) {
    throw new B456FixtureError(
      'B456_FIXTURE_NAMESPACE_INVALID',
      'Namespace must contain 3-32 lowercase letters, digits, or single hyphens',
    );
  }
  return value;
}

export function assertB456PreImportEnvironment(
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== 'test') {
    throw new B456FixtureError(
      'B456_FIXTURE_ENVIRONMENT_UNSAFE',
      'B4-B6 fixtures require NODE_ENV=test before application import',
    );
  }
}

export function assertB456RuntimeEnvironment(
  env: B456RuntimeEnvironment,
): void {
  const databaseName = env.databaseName.toLowerCase();
  if (
    env.nodeEnv !== 'test' ||
    env.appEnv !== 'test' ||
    !databaseName.includes('_test') ||
    databaseName.includes('_dev') ||
    databaseName.includes('_prod') ||
    env.storageDriver !== 'fake' ||
    env.llmProvider !== 'stub' ||
    env.smsProvider !== 'stub' ||
    env.sessionCookieSecure === true
  ) {
    throw new B456FixtureError(
      'B456_FIXTURE_ENVIRONMENT_UNSAFE',
      'B4-B6 fixtures require an isolated test database and fake or stub external services',
    );
  }
}

export function requireB456FixturePassword(value: string | undefined): string {
  if (!value || value.length < 12) {
    throw new B456FixtureError(
      'B456_FIXTURE_PASSWORD_REQUIRED',
      'B456_FIXTURE_PASSWORD must be provided through the process environment',
    );
  }
  return value;
}

export function accountNameFor(namespace: string, role: B456Role): string {
  return `b456fx-${namespace}-${role.replace('_', '-')}`;
}

export function displayNameFor(role: B456Role): string {
  const names: Record<B456Role, string> = {
    doctor: 'B4-B6 测试医生',
    admin: 'B4-B6 测试管理员',
    nurse: 'B4-B6 测试护士',
    research_assistant: 'B4-B6 测试科研助理',
    system: 'B4-B6 测试系统账号',
  };
  return names[role];
}

export function scenarioSubjectCodeFor(
  namespace: string,
  ordinal: number,
): string {
  return `B456-${namespace.toUpperCase()}-${ordinal.toString().padStart(2, '0')}`;
}

export function scenarioVisitCodeFor(
  namespace: string,
  ordinal: number,
  suffix = 'BASE',
): string {
  return `${scenarioSubjectCodeFor(namespace, ordinal)}-${suffix}`;
}

export function executionClassForAuditIds(
  auditIds: readonly string[],
): B456ExecutionClass {
  const direct = new Set<string>(B456_DIRECT_AUDIT_IDS);
  const count = auditIds.filter((auditId) => direct.has(auditId)).length;
  return count === 0
    ? 'fixture-required'
    : count === auditIds.length
      ? 'browser-direct'
      : 'mixed';
}

export function assertB456Contract(): void {
  const keys = [
    'roles',
    ...B456_BUSINESS_SCENARIOS.map(({ scenarioKey }) => scenarioKey),
  ];
  const auditIds = B456_BUSINESS_SCENARIOS.flatMap(({ auditIds: ids }) => [
    ...ids,
  ]);
  const expected = [
    ...auditRange('B4', 1, 44),
    ...auditRange('B5', 1, 62).filter(
      (id) =>
        !B456_EXCLUDED_AUDIT_IDS.includes(
          id as (typeof B456_EXCLUDED_AUDIT_IDS)[number],
        ),
    ),
    ...auditRange('B6', 1, 37),
  ];
  const actual = new Set(auditIds);
  const direct = new Set<string>(B456_DIRECT_AUDIT_IDS);
  if (
    keys.length !== 32 ||
    new Set(keys).size !== 32 ||
    B456_BUSINESS_SCENARIOS.length !== 31 ||
    auditIds.length !== 135 ||
    actual.size !== 135 ||
    expected.some((id) => !actual.has(id)) ||
    actual.size !== expected.length ||
    direct.size !== 15 ||
    [...direct].some((id) => !actual.has(id)) ||
    auditIds.filter((id) => !direct.has(id)).length !== 120
  ) {
    throw new B456FixtureError(
      'B456_FIXTURE_CONTRACT_INVALID',
      'The fixed B4-B6 scenario and audit ownership contract is unbalanced',
    );
  }
}

const ALLOWED_MANIFEST_KEYS = new Set([
  'namespace',
  'databaseName',
  'roles',
  'role',
  'loginIdentifier',
  'displayName',
  'scenarios',
  'scenarioKey',
  'auditIds',
  'executionClass',
  'route',
  'expectedPage',
  'expectedStatus',
  'expectedBusinessCode',
  'testInput',
  'fileInputs',
  'faultMode',
  'transitionMode',
  'expectedSummary',
]);

const FORBIDDEN_VALUE_PATTERN =
  /(mongodb(?:\+srv)?:\/\/|cookie|session[_-]?token|passwordhash|objectkey|bucket)/i;

function scanSafeManifest(
  value: unknown,
  path: string,
  flexible = false,
): void {
  if (typeof value === 'string') {
    if (FORBIDDEN_VALUE_PATTERN.test(value)) {
      throw new B456FixtureError(
        'B456_FIXTURE_MANIFEST_UNSAFE',
        `Safe manifest contains a forbidden value at ${path}`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      scanSafeManifest(entry, `${path}[${index}]`, flexible),
    );
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, entry] of Object.entries(value)) {
    if (!flexible && !ALLOWED_MANIFEST_KEYS.has(key)) {
      throw new B456FixtureError(
        'B456_FIXTURE_MANIFEST_UNSAFE',
        `Safe manifest contains a forbidden field at ${path}.${key}`,
      );
    }
    scanSafeManifest(
      entry,
      `${path}.${key}`,
      flexible || key === 'testInput' || key === 'fileInputs',
    );
  }
}

export function assertB456SafeManifest(value: unknown): void {
  scanSafeManifest(value, 'manifest');
}
