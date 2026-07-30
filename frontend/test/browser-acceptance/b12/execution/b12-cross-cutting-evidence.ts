import {
  B12_CROSS_CUTTING_GROUP_KEYS,
  assertB12AuditId,
  assertB12CrossCuttingGroupKey,
  type B12AuditId,
  type B12CrossCuttingGroupKey,
} from './b12-execution-types';

export const B12_CROSS_CUTTING_RESULTS = [
  'pass',
  'fail',
  'not_executed',
] as const;

export type B12CrossCuttingResult =
  (typeof B12_CROSS_CUTTING_RESULTS)[number];

export type B12CrossCuttingEvidenceDefinition = Readonly<{
  group: B12CrossCuttingGroupKey;
  directAuditIds: readonly B12AuditId[];
  supportingAuditIds: readonly B12AuditId[];
  nonAuditQualityGate: boolean;
}>;

export type B12CrossCuttingEvidenceSnapshotEntry = Readonly<{
  group: B12CrossCuttingGroupKey;
  directAuditIds: readonly B12AuditId[];
  supportingAuditIds: readonly B12AuditId[];
  directResult: B12CrossCuttingResult;
  supportingResult: B12CrossCuttingResult;
  nonAuditQualityGateResult: B12CrossCuttingResult;
  profileCompletionBlocked: boolean;
}>;

export type B12CrossCuttingEvidenceSnapshot =
  readonly B12CrossCuttingEvidenceSnapshotEntry[];

export type B12DirectAuditImpact = Readonly<{
  group: B12CrossCuttingGroupKey;
  auditId: B12AuditId;
  result: B12CrossCuttingResult;
}>;

export type B12CrossCuttingAuditImpact = Readonly<{
  directAuditResults: readonly B12DirectAuditImpact[];
  profileCompletionBlocked: boolean;
}>;

type MutableCrossCuttingEvidence = {
  definition: B12CrossCuttingEvidenceDefinition;
  directResult: B12CrossCuttingResult;
  supportingResult: B12CrossCuttingResult;
  nonAuditQualityGateResult: B12CrossCuttingResult;
};

export const B12_CROSS_CUTTING_EVIDENCE_DEFINITIONS = [
  {
    group: 'auth_lifecycle',
    directAuditIds: ['B12-83'],
    supportingAuditIds: ['B12-58', 'B12-59'],
    nonAuditQualityGate: false,
  },
  {
    group: 'logout_cookie',
    directAuditIds: [],
    supportingAuditIds: ['B12-59', 'B12-83'],
    nonAuditQualityGate: true,
  },
  {
    group: 'storage_url_privacy',
    directAuditIds: ['B12-62', 'B12-63'],
    supportingAuditIds: ['B12-61'],
    nonAuditQualityGate: false,
  },
  {
    group: 'console_network',
    directAuditIds: [],
    supportingAuditIds: [
      'B12-31',
      'B12-32',
      'B12-42',
      'B12-51',
      'B12-52',
      'B12-56',
      'B12-57',
      'B12-58',
      'B12-59',
      'B12-60',
    ],
    nonAuditQualityGate: true,
  },
  {
    group: 'dom_sensitive_data',
    directAuditIds: ['B12-44', 'B12-45', 'B12-46', 'B12-47', 'B12-48'],
    supportingAuditIds: [
      'B12-56',
      'B12-57',
      'B12-78',
      'B12-79',
      'B12-80',
    ],
    nonAuditQualityGate: true,
  },
  {
    group: 'action_ownership',
    directAuditIds: [
      'B12-71',
      'B12-72',
      'B12-73',
      'B12-74',
      'B12-75',
      'B12-76',
      'B12-77',
    ],
    supportingAuditIds: [
      'B12-22',
      'B12-23',
      'B12-24',
      'B12-25',
      'B12-64',
      'B12-65',
      'B12-66',
      'B12-67',
    ],
    nonAuditQualityGate: false,
  },
  {
    group: 'responsive_accessibility',
    directAuditIds: ['B12-81', 'B12-82'],
    supportingAuditIds: [],
    nonAuditQualityGate: false,
  },
  {
    group: 'cors_origin',
    directAuditIds: [],
    supportingAuditIds: ['B12-83'],
    nonAuditQualityGate: true,
  },
  {
    group: 'deidentified_fixture',
    directAuditIds: ['B12-85'],
    supportingAuditIds: [],
    nonAuditQualityGate: false,
  },
  {
    group: 'static_route_gate',
    directAuditIds: ['B12-84'],
    supportingAuditIds: [],
    nonAuditQualityGate: false,
  },
] as const satisfies readonly B12CrossCuttingEvidenceDefinition[];

function failEvidence(code: string): never {
  throw new Error(code);
}

function assertRecordedResult(
  result: string,
): asserts result is Exclude<B12CrossCuttingResult, 'not_executed'> {
  if (result !== 'pass' && result !== 'fail') {
    failEvidence('B12_CROSS_CUTTING_INVALID_RESULT');
  }
}

function validateAuditIds(
  auditIds: readonly B12AuditId[],
  duplicateCode: string,
): readonly B12AuditId[] {
  const copy = [...auditIds];
  const uniqueIds = new Set<string>();
  for (const auditId of copy) {
    assertB12AuditId(auditId);
    if (uniqueIds.has(auditId)) {
      failEvidence(duplicateCode);
    }
    uniqueIds.add(auditId);
  }
  copy.sort();
  return Object.freeze(copy);
}

function copySnapshotEntry(
  state: MutableCrossCuttingEvidence,
): B12CrossCuttingEvidenceSnapshotEntry {
  const profileCompletionBlocked =
    state.directResult === 'fail' ||
    state.supportingResult === 'fail' ||
    state.nonAuditQualityGateResult === 'fail';
  return Object.freeze({
    group: state.definition.group,
    directAuditIds: Object.freeze([...state.definition.directAuditIds]),
    supportingAuditIds: Object.freeze([
      ...state.definition.supportingAuditIds,
    ]),
    directResult: state.directResult,
    supportingResult: state.supportingResult,
    nonAuditQualityGateResult: state.nonAuditQualityGateResult,
    profileCompletionBlocked,
  });
}

export class B12CrossCuttingEvidenceRegistry {
  private readonly groupOrder: B12CrossCuttingGroupKey[];

  private readonly states = new Map<
    B12CrossCuttingGroupKey,
    MutableCrossCuttingEvidence
  >();

  constructor(
    definitions: readonly B12CrossCuttingEvidenceDefinition[] =
      B12_CROSS_CUTTING_EVIDENCE_DEFINITIONS,
  ) {
    const directOwners = new Map<B12AuditId, B12CrossCuttingGroupKey>();
    const registeredGroups = new Set<B12CrossCuttingGroupKey>();
    const validatedDefinitions: B12CrossCuttingEvidenceDefinition[] = [];

    for (const sourceDefinition of definitions) {
      assertB12CrossCuttingGroupKey(sourceDefinition.group);
      if (registeredGroups.has(sourceDefinition.group)) {
        failEvidence('B12_CROSS_CUTTING_DUPLICATE_GROUP');
      }
      registeredGroups.add(sourceDefinition.group);
      if (typeof sourceDefinition.nonAuditQualityGate !== 'boolean') {
        failEvidence('B12_CROSS_CUTTING_INVALID_NON_AUDIT_GATE');
      }

      const directAuditIds = validateAuditIds(
        sourceDefinition.directAuditIds,
        'B12_CROSS_CUTTING_DUPLICATE_DIRECT_ID',
      );
      const supportingAuditIds = validateAuditIds(
        sourceDefinition.supportingAuditIds,
        'B12_CROSS_CUTTING_DUPLICATE_SUPPORTING_ID',
      );
      const supportingSet = new Set(supportingAuditIds);

      for (const auditId of directAuditIds) {
        if (supportingSet.has(auditId)) {
          failEvidence('B12_CROSS_CUTTING_DIRECT_SUPPORTING_OVERLAP');
        }
        if (directOwners.has(auditId)) {
          failEvidence('B12_CROSS_CUTTING_DIRECT_OWNER_DUPLICATED');
        }
        directOwners.set(auditId, sourceDefinition.group);
      }

      validatedDefinitions.push(
        Object.freeze({
          group: sourceDefinition.group,
          directAuditIds,
          supportingAuditIds,
          nonAuditQualityGate: sourceDefinition.nonAuditQualityGate,
        }),
      );
    }

    validatedDefinitions.sort(
      (left, right) =>
        B12_CROSS_CUTTING_GROUP_KEYS.indexOf(left.group) -
        B12_CROSS_CUTTING_GROUP_KEYS.indexOf(right.group),
    );
    this.groupOrder = validatedDefinitions.map((definition) => definition.group);
    for (const definition of validatedDefinitions) {
      this.states.set(definition.group, {
        definition,
        directResult: 'not_executed',
        supportingResult: 'not_executed',
        nonAuditQualityGateResult: 'not_executed',
      });
    }
  }

  recordDirectResult(
    group: B12CrossCuttingGroupKey,
    result: Exclude<B12CrossCuttingResult, 'not_executed'>,
  ): void {
    assertRecordedResult(result);
    const state = this.getState(group);
    if (state.definition.directAuditIds.length === 0) {
      failEvidence('B12_CROSS_CUTTING_DIRECT_IDS_EMPTY');
    }
    if (state.directResult !== 'not_executed') {
      failEvidence('B12_CROSS_CUTTING_DIRECT_ALREADY_RECORDED');
    }
    state.directResult = result;
  }

  recordSupportingResult(
    group: B12CrossCuttingGroupKey,
    result: Exclude<B12CrossCuttingResult, 'not_executed'>,
  ): void {
    assertRecordedResult(result);
    const state = this.getState(group);
    if (state.definition.supportingAuditIds.length === 0) {
      failEvidence('B12_CROSS_CUTTING_SUPPORTING_IDS_EMPTY');
    }
    if (state.supportingResult !== 'not_executed') {
      failEvidence('B12_CROSS_CUTTING_SUPPORTING_ALREADY_RECORDED');
    }
    state.supportingResult = result;
  }

  recordNonAuditQualityGateResult(
    group: B12CrossCuttingGroupKey,
    result: Exclude<B12CrossCuttingResult, 'not_executed'>,
  ): void {
    assertRecordedResult(result);
    const state = this.getState(group);
    if (!state.definition.nonAuditQualityGate) {
      failEvidence('B12_CROSS_CUTTING_NON_AUDIT_GATE_UNDEFINED');
    }
    if (state.nonAuditQualityGateResult !== 'not_executed') {
      failEvidence('B12_CROSS_CUTTING_NON_AUDIT_ALREADY_RECORDED');
    }
    state.nonAuditQualityGateResult = result;
  }

  snapshot(): B12CrossCuttingEvidenceSnapshot {
    return Object.freeze(
      this.groupOrder.map((group) => copySnapshotEntry(this.getState(group))),
    );
  }

  calculateAuditImpact(): B12CrossCuttingAuditImpact {
    const directAuditResults: B12DirectAuditImpact[] = [];
    let profileCompletionBlocked = false;

    for (const group of this.groupOrder) {
      const state = this.getState(group);
      const snapshot = copySnapshotEntry(state);
      profileCompletionBlocked ||= snapshot.profileCompletionBlocked;
      for (const auditId of state.definition.directAuditIds) {
        directAuditResults.push(
          Object.freeze({
            group,
            auditId,
            result: state.directResult,
          }),
        );
      }
    }

    return Object.freeze({
      directAuditResults: Object.freeze(directAuditResults),
      profileCompletionBlocked,
    });
  }

  private getState(
    group: B12CrossCuttingGroupKey,
  ): MutableCrossCuttingEvidence {
    assertB12CrossCuttingGroupKey(group);
    const state = this.states.get(group);
    if (!state) {
      failEvidence('B12_CROSS_CUTTING_GROUP_NOT_REGISTERED');
    }
    return state;
  }
}
