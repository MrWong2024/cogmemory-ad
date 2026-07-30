export const B12_OWNER_RESULTS = [
  'pass',
  'fail',
  'not_executed',
  'blocked_by_group_setup',
] as const;

export type B12OwnerResult = (typeof B12_OWNER_RESULTS)[number];

export const B12_FAILURE_CATEGORIES = [
  'none',
  'product',
  'owner_assertion',
  'route_network',
  'group_setup_auth',
  'shared_support',
  'fixture',
  'cross_cutting',
  'cleanup',
  'unknown',
] as const;

export type B12FailureCategory = (typeof B12_FAILURE_CATEGORIES)[number];

export const B12_GROUP_STOP_REASONS = [
  'none',
  'group_setup_failed',
  'repeated_shared_support_failure',
  'owner_cleanup_failed',
  'journal_output_failed',
] as const;

export type B12GroupStopReason = (typeof B12_GROUP_STOP_REASONS)[number];

export const B12_CROSS_CUTTING_GROUP_KEYS = [
  'auth_lifecycle',
  'logout_cookie',
  'storage_url_privacy',
  'console_network',
  'dom_sensitive_data',
  'action_ownership',
  'responsive_accessibility',
  'cors_origin',
  'deidentified_fixture',
  'static_route_gate',
] as const;

export type B12CrossCuttingGroupKey =
  (typeof B12_CROSS_CUTTING_GROUP_KEYS)[number];

export type B12AuditId = `B12-${string}`;

export type B12OwnerDefinition = Readonly<{
  auditOwner: string;
  executionGroup: string;
  fixtureCluster: string;
  directAuditIds: readonly B12AuditId[];
}>;

export type B12ValidatedOwnerDefinition = Readonly<{
  auditOwner: string;
  executionGroup: string;
  fixtureCluster: string;
  directAuditIds: readonly B12AuditId[];
}>;

export type B12OwnerExecutionFailure = Readonly<{
  kind: 'b12_owner_execution_failure';
  category: Exclude<B12FailureCategory, 'none'>;
  safeCode: string;
}>;

const AUDIT_ID_PATTERN = /^B12-(?:0[1-9]|[1-7][0-9]|8[0-8])$/;
const OWNER_KEY_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const EXECUTION_GROUP_PATTERN = /^eg-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FIXTURE_CLUSTER_PATTERN = /^fc-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
const MONGO_ID_PATTERN = /^[a-f\d]{24}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

function failValidation(code: string): never {
  throw new Error(code);
}

function isDynamicIdentifier(value: string): boolean {
  return (
    MONGO_ID_PATTERN.test(value) ||
    UUID_PATTERN.test(value) ||
    ULID_PATTERN.test(value)
  );
}

function containsDynamicIdentifier(value: string, prefix = ''): boolean {
  const withoutPrefix = prefix && value.startsWith(prefix)
    ? value.slice(prefix.length)
    : value;
  return withoutPrefix.split('/').some((segment) => {
    if (isDynamicIdentifier(segment)) {
      return true;
    }
    return segment.split('-').some(isDynamicIdentifier);
  });
}

export function assertB12AuditId(value: string): asserts value is B12AuditId {
  if (!AUDIT_ID_PATTERN.test(value)) {
    failValidation('B12_EXECUTION_INVALID_AUDIT_ID');
  }
}

export function assertB12AuditOwner(value: string): void {
  if (!OWNER_KEY_PATTERN.test(value) || containsDynamicIdentifier(value)) {
    failValidation('B12_EXECUTION_INVALID_AUDIT_OWNER');
  }
}

export function assertB12ExecutionGroup(value: string): void {
  if (
    !EXECUTION_GROUP_PATTERN.test(value) ||
    containsDynamicIdentifier(value, 'eg-')
  ) {
    failValidation('B12_EXECUTION_INVALID_EXECUTION_GROUP');
  }
}

export function assertB12FixtureCluster(value: string): void {
  if (
    !FIXTURE_CLUSTER_PATTERN.test(value) ||
    containsDynamicIdentifier(value, 'fc-')
  ) {
    failValidation('B12_EXECUTION_INVALID_FIXTURE_CLUSTER');
  }
}

export function assertB12OwnerResult(
  value: string,
): asserts value is B12OwnerResult {
  if (!(B12_OWNER_RESULTS as readonly string[]).includes(value)) {
    failValidation('B12_EXECUTION_INVALID_OWNER_RESULT');
  }
}

export function assertB12FailureCategory(
  value: string,
): asserts value is B12FailureCategory {
  if (!(B12_FAILURE_CATEGORIES as readonly string[]).includes(value)) {
    failValidation('B12_EXECUTION_INVALID_FAILURE_CATEGORY');
  }
}

export function assertB12CrossCuttingGroupKey(
  value: string,
): asserts value is B12CrossCuttingGroupKey {
  if (!(B12_CROSS_CUTTING_GROUP_KEYS as readonly string[]).includes(value)) {
    failValidation('B12_EXECUTION_INVALID_CROSS_CUTTING_GROUP');
  }
}

export function assertB12SafeCode(value: string): void {
  if (!SAFE_CODE_PATTERN.test(value)) {
    failValidation('B12_EXECUTION_INVALID_SAFE_CODE');
  }
}

export function createB12OwnerExecutionFailure(
  category: Exclude<B12FailureCategory, 'none'>,
  safeCode: string,
): B12OwnerExecutionFailure {
  const categoryValue: string = category;
  if (
    categoryValue === 'none' ||
    !(B12_FAILURE_CATEGORIES as readonly string[]).includes(categoryValue)
  ) {
    failValidation('B12_EXECUTION_INVALID_FAILURE_CATEGORY');
  }
  assertB12SafeCode(safeCode);
  return Object.freeze({
    kind: 'b12_owner_execution_failure' as const,
    category,
    safeCode,
  });
}

export function isB12OwnerExecutionFailure(
  value: unknown,
): value is B12OwnerExecutionFailure {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as {
    kind?: unknown;
    category?: unknown;
    safeCode?: unknown;
  };
  return (
    candidate.kind === 'b12_owner_execution_failure' &&
    typeof candidate.category === 'string' &&
    candidate.category !== 'none' &&
    (B12_FAILURE_CATEGORIES as readonly string[]).includes(
      candidate.category,
    ) &&
    typeof candidate.safeCode === 'string' &&
    SAFE_CODE_PATTERN.test(candidate.safeCode)
  );
}

export function validateB12OwnerDefinition(
  definition: B12OwnerDefinition,
): B12ValidatedOwnerDefinition {
  assertB12AuditOwner(definition.auditOwner);
  assertB12ExecutionGroup(definition.executionGroup);
  assertB12FixtureCluster(definition.fixtureCluster);

  const directAuditIds = [...definition.directAuditIds];
  const uniqueAuditIds = new Set<string>();
  for (const auditId of directAuditIds) {
    assertB12AuditId(auditId);
    if (uniqueAuditIds.has(auditId)) {
      failValidation('B12_EXECUTION_DUPLICATE_OWNER_AUDIT_ID');
    }
    uniqueAuditIds.add(auditId);
  }

  directAuditIds.sort();
  return Object.freeze({
    auditOwner: definition.auditOwner,
    executionGroup: definition.executionGroup,
    fixtureCluster: definition.fixtureCluster,
    directAuditIds: Object.freeze(directAuditIds),
  });
}
