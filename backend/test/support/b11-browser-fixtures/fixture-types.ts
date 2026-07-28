export const B11_PROFILES = ['core-workflow', 'resilience-security'] as const;

export type B11Profile = (typeof B11_PROFILES)[number];
export type B11AuditProfile = B11Profile | 'static-gate';
export type B11VerifyPhase = 'prepared' | 'post-browser';

export const B11_ROLES = [
  'doctor',
  'admin',
  'nurse',
  'research_assistant',
  'system',
] as const;

export type B11Role = (typeof B11_ROLES)[number];
export type B11AuditId = `B11-${string}`;
export type B11OwnerType = 'browser_route' | 'static_gate';

export type B11PreparedState =
  | 'system_draft'
  | 'mixed_draft'
  | 'audit_limit_draft'
  | 'pending_confirmation'
  | 'confirmed'
  | 'archived'
  | 'corrected'
  | 'voided';

export type B11ProductMutationClass =
  | 'none'
  | 'edit_once'
  | 'edit_twice_after_conflict_continue'
  | 'secondary_edit_only'
  | 'submit_once'
  | 'secondary_submit_only'
  | 'confirm_once'
  | 'secondary_confirm_only';

export type B11FixtureMutationClass =
  | 'none'
  | 'fixture_confirmation_conflict_touch_only'
  | 'fixture_forbidden_role_only';

export type B11MutationClass =
  | B11ProductMutationClass
  | Exclude<B11FixtureMutationClass, 'none'>;

export type B11StageTransition =
  | 'confirmation-conflict-touch'
  | 'forbidden-confirm-role';

export type B11AuditContractEntry = {
  auditId: B11AuditId;
  ownerType: B11OwnerType;
  profile: B11AuditProfile;
  scenarioKey: string;
  routeKey: string | null;
  primaryRole: B11Role | null;
  secondaryRole: B11Role | null;
  preparedState: B11PreparedState | 'static_gate';
  allowedStages: readonly B11StageTransition[];
  expectedProductMutationClass: B11ProductMutationClass | 'static_gate';
  expectedFixtureOwnedMutationClass: B11FixtureMutationClass | 'static_gate';
  postBrowserFinalStateContract: string;
};

export type B11RouteDefinition = {
  key: string;
  primaryAuditIds: readonly B11AuditId[];
  supportingAuditIds: readonly B11AuditId[];
  primaryRole: B11Role;
  secondaryRole: B11Role | null;
  preparedState: B11PreparedState;
  allowedStages: readonly B11StageTransition[];
  expectedProductMutationClass: B11ProductMutationClass;
  expectedFixtureOwnedMutationClass: B11FixtureMutationClass;
  postBrowserFinalStateContract: string;
  requiresIndependentSession: boolean;
  automaticWriteRetry: false;
};

export type B11ScenarioDefinition = {
  profile: B11Profile;
  scenarioKey: string;
  ordinal: number;
  routes: readonly B11RouteDefinition[];
};

export type B11SafeRoleManifest = {
  role: B11Role;
  loginIdentifier: string;
  displayName: string;
};

export type B11SafeRouteManifest = {
  routeKey: string;
  primaryAuditIds: readonly B11AuditId[];
  supportingAuditIds: readonly B11AuditId[];
  primaryRole: B11Role;
  secondaryRole: B11Role | null;
  preparedState: B11PreparedState;
  allowedStages: readonly B11StageTransition[];
  expectedProductMutationClass: B11ProductMutationClass;
  expectedFixtureOwnedMutationClass: B11FixtureMutationClass;
  postBrowserFinalStateContract: string;
  requiresIndependentSession: boolean;
  automaticWriteRetry: false;
};

export type B11SafeScenarioManifest = {
  scenarioKey: string;
  routes: readonly B11SafeRouteManifest[];
};

export type B11ResourceCounts = {
  users: number;
  patients: number;
  visits: number;
  scaleInstances: number;
  clinicalReports: number;
  fixtureMarkers: number;
};

export type B11SafeManifest = {
  version: 1;
  batch: 'B11';
  namespace: string;
  databaseName: string;
  profile: B11Profile;
  phase: B11VerifyPhase;
  auditIdCount: number;
  scenarioCount: number;
  routeCount: number;
  roles: readonly B11SafeRoleManifest[];
  scenarios: readonly B11SafeScenarioManifest[];
  resourceCounts: B11ResourceCounts;
  preparedHash: string;
  canonicalSeedHash: string;
  uniquePrimaryOwners: true;
  writableReportsIndependent: true;
  canonicalSeedHashUnchanged: true;
};

export type B11SafeCleanupSummary = {
  version: 1;
  batch: 'B11';
  namespace: string;
  databaseName: string;
  profile: B11Profile;
  residualCount: 0;
  matched: boolean;
  runtimeDescriptorsRemoved: number;
  canonicalSeedHashUnchanged: true;
};

export type B11SafeStageSummary = {
  version: 1;
  batch: 'B11';
  profile: B11Profile;
  scenarioKey: string;
  routeKey: string;
  transition: B11StageTransition;
  role: B11Role;
  staged: true;
  alreadyStaged: boolean;
  preStageProgressVerified: boolean;
  canonicalSeedHashUnchanged: true;
};

export type B11RuntimeDescriptor = {
  version: 1;
  batch: 'B11';
  profile: B11Profile;
  scenarioKey: string;
  routeKey: string;
  primaryRole: B11Role;
  secondaryRole?: B11Role;
  loginIdentifier: string;
  secondaryLoginIdentifier?: string;
  navigationPath: string;
};

export type B11RuntimeEnvironment = {
  nodeEnv: string | undefined;
  appEnv: string | undefined;
  databasePurpose: string | undefined;
  databaseName: string;
  storageDriver: string | undefined;
  llmProvider: string | undefined;
  smsProvider: string | undefined;
  sessionCookieSecure: boolean | undefined;
};

export class B11FixtureError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly profile?: B11AuditProfile,
    readonly scenarioKey?: string,
    readonly routeKey?: string,
    readonly phase?: B11VerifyPhase,
  ) {
    super(message);
  }
}

export type B11SafeErrorPayload = {
  ok: false;
  code: string;
  message: string;
  profile?: B11AuditProfile;
  scenarioKey?: string;
  routeKey?: string;
  phase?: B11VerifyPhase;
};

export function toB11SafeErrorPayload(error: unknown): B11SafeErrorPayload {
  if (error instanceof B11FixtureError) {
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
    code: 'B11_FIXTURE_UNEXPECTED_ERROR',
    message: 'Unexpected B11 fixture failure',
  };
}
