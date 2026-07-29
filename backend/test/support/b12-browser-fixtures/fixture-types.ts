export const B12_PROFILES = ['core-workflow', 'resilience-security'] as const;

export type B12Profile = (typeof B12_PROFILES)[number];
export type B12AuditProfile = B12Profile | 'static-gate';
export type B12VerifyPhase = 'prepared' | 'post-browser';

export const B12_ROLES = [
  'doctor',
  'admin',
  'nurse',
  'research_assistant',
  'system',
] as const;

export type B12Role = (typeof B12_ROLES)[number];
export type B12AuditId = `B12-${string}`;
export type B12OwnerType = 'browser_route' | 'static_gate';

export type B12PreparedState =
  | 'draft'
  | 'pending_confirmation'
  | 'confirmed_unlocked'
  | 'confirmed_quality_blocked'
  | 'confirmed_confirmation_missing'
  | 'confirmed_v1_visit_locked'
  | 'confirmed_v1_visit_voided'
  | 'confirmed_locked'
  | 'historical_locked_fallback';

export type B12ControlledPublicResponseVariant =
  | 'none'
  | 'is_final_false'
  | 'top_level_locked_at_null'
  | 'lock_summary_null'
  | 'lock_time_mismatch';

export type B12BoundaryType = 'none' | 'controlled_public_read_boundary';

export type B12ProductMutationClass =
  | 'none'
  | 'lock_once_doctor'
  | 'lock_once_admin'
  | 'already_locked_readonly'
  | 'fixture_touch_plus_lock_once'
  | 'fixture_touch_plus_secondary_lock_once';

export type B12FixtureMutationClass =
  | 'none'
  | 'fixture_conflict_touch_only'
  | 'fixture_conflict_latest_locked_touch_only'
  | 'fixture_audit_unavailable_only'
  | 'fixture_metadata_unsupported_only'
  | 'fixture_forbidden_role_only';

export type B12StageTransition =
  | 'lock-conflict-touch'
  | 'lock-conflict-latest-locked-touch'
  | 'lock-audit-unavailable'
  | 'lock-metadata-unsupported'
  | 'forbidden-lock-role';

export type B12AuditContractEntry = {
  auditId: B12AuditId;
  ownerType: B12OwnerType;
  profile: B12AuditProfile;
  scenarioKey: string;
  routeKey: string | null;
  primaryRole: B12Role | null;
  secondaryRole: B12Role | null;
  preparedState: B12PreparedState | 'static_gate';
  boundaryType: B12BoundaryType;
  controlledPublicResponseVariant: B12ControlledPublicResponseVariant;
  allowedStages: readonly B12StageTransition[];
  expectedProductMutationClass: B12ProductMutationClass | 'static_gate';
  expectedFixtureOwnedMutationClass: B12FixtureMutationClass | 'static_gate';
  postBrowserFinalStateContract: string;
};

export type B12RouteDefinition = {
  key: string;
  primaryAuditIds: readonly B12AuditId[];
  supportingAuditIds: readonly B12AuditId[];
  primaryRole: B12Role;
  secondaryRole: B12Role | null;
  preparedState: B12PreparedState;
  boundaryType: B12BoundaryType;
  controlledPublicResponseVariant: B12ControlledPublicResponseVariant;
  allowedStages: readonly B12StageTransition[];
  expectedProductMutationClass: B12ProductMutationClass;
  expectedFixtureOwnedMutationClass: B12FixtureMutationClass;
  postBrowserFinalStateContract: string;
  requiresIndependentSession: boolean;
  automaticWriteRetry: false;
};

export type B12ScenarioDefinition = {
  profile: B12Profile;
  scenarioKey: string;
  ordinal: number;
  routes: readonly B12RouteDefinition[];
};

export type B12SafeRouteManifest = Omit<B12RouteDefinition, 'key'> & {
  routeKey: string;
};

export type B12SafeScenarioManifest = {
  scenarioKey: string;
  routes: readonly B12SafeRouteManifest[];
};

export type B12ResourceCounts = {
  users: number;
  patients: number;
  visits: number;
  scaleInstances: number;
  clinicalReports: number;
  fixtureMarkers: number;
};

export type B12ReportStateCounts = Record<B12PreparedState, number>;

export type B12SafeManifest = {
  version: 1;
  batch: 'B12';
  profile: B12Profile;
  phase: B12VerifyPhase;
  auditIdCount: number;
  scenarioCount: number;
  routeCount: number;
  roles: readonly B12Role[];
  scenarios: readonly B12SafeScenarioManifest[];
  resourceCounts: B12ResourceCounts;
  reportStateCounts: B12ReportStateCounts;
  preparedHash: string;
  canonicalSeedHash: string;
  uniquePrimaryOwners: true;
  writableReportsIndependent: true;
  canonicalSeedHashUnchanged: true;
};

export type B12SafeCleanupSummary = {
  version: 1;
  batch: 'B12';
  namespace: string;
  databaseName: string;
  profile: B12Profile;
  residualCount: 0;
  matched: boolean;
  runtimeDescriptorsRemoved: number;
  canonicalSeedHashUnchanged: true;
};

export type B12SafeStageSummary = {
  version: 1;
  batch: 'B12';
  profile: B12Profile;
  scenarioKey: string;
  routeKey: string;
  transition: B12StageTransition;
  role: B12Role;
  staged: true;
  alreadyStaged: boolean;
  preStageProgressVerified: boolean;
  canonicalSeedHashUnchanged: true;
};

export type B12RuntimeDescriptor = {
  version: 1;
  batch: 'B12';
  profile: B12Profile;
  scenarioKey: string;
  routeKey: string;
  primaryRole: B12Role;
  secondaryRole?: B12Role;
  loginIdentifier: string;
  secondaryLoginIdentifier?: string;
  navigationPath: string;
};

export type B12RuntimeEnvironment = {
  nodeEnv: string | undefined;
  appEnv: string | undefined;
  databasePurpose: string | undefined;
  databaseName: string;
  storageDriver: string | undefined;
  llmProvider: string | undefined;
  smsProvider: string | undefined;
  sessionCookieSecure: boolean | undefined;
};

export class B12FixtureError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly profile?: B12AuditProfile,
    readonly scenarioKey?: string,
    readonly routeKey?: string,
    readonly phase?: B12VerifyPhase,
  ) {
    super(message);
  }
}

export type B12SafeErrorPayload = {
  ok: false;
  code: string;
  message: string;
  profile?: B12AuditProfile;
  scenarioKey?: string;
  routeKey?: string;
  phase?: B12VerifyPhase;
};

export function toB12SafeErrorPayload(error: unknown): B12SafeErrorPayload {
  if (error instanceof B12FixtureError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      ...(error.profile ? { profile: error.profile } : {}),
      ...(error.scenarioKey ? { scenarioKey: error.scenarioKey } : {}),
      ...(error.routeKey ? { routeKey: error.routeKey } : {}),
      ...(error.phase ? { phase: error.phase } : {}),
    };
  }
  return {
    ok: false,
    code: 'B12_FIXTURE_UNEXPECTED_ERROR',
    message: 'Unexpected B12 fixture failure',
  };
}
