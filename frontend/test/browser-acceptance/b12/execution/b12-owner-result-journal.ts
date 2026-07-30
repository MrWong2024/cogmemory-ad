import {
  B12_CROSS_CUTTING_GROUP_KEYS,
  assertB12FailureCategory,
  assertB12OwnerResult,
  assertB12CrossCuttingGroupKey,
  type B12AuditId,
  type B12CrossCuttingGroupKey,
  type B12FailureCategory,
  type B12OwnerDefinition,
  type B12OwnerResult,
  type B12ValidatedOwnerDefinition,
  validateB12OwnerDefinition,
} from './b12-execution-types';

export type B12OwnerJournalRecord = Readonly<{
  auditOwner: string;
  executionGroup: string;
  fixtureCluster: string;
  started: boolean;
  businessAssertionsCompleted: boolean;
  routeNetworkCompleted: boolean;
  minimalCleanupCompleted: boolean;
  result: B12OwnerResult;
  failureCategory: B12FailureCategory;
  directAuditIds: readonly B12AuditId[];
  supportingEvidenceCompleted: readonly B12CrossCuttingGroupKey[];
}>;

export type B12OwnerJournalSnapshot = readonly B12OwnerJournalRecord[];

export type B12OwnerFinalizedCallback = (
  record: B12OwnerJournalRecord,
) => void | Promise<void>;

type MutableOwnerRecord = {
  definition: B12ValidatedOwnerDefinition;
  started: boolean;
  businessAssertionsCompleted: boolean;
  routeNetworkCompleted: boolean;
  minimalCleanupCompleted: boolean;
  result: B12OwnerResult;
  failureCategory: B12FailureCategory;
  supportingEvidenceCompleted: Set<B12CrossCuttingGroupKey>;
  finalized: boolean;
};

function failJournal(code: string): never {
  throw new Error(code);
}

function copyRecord(record: MutableOwnerRecord): B12OwnerJournalRecord {
  const supportingEvidenceCompleted = [
    ...record.supportingEvidenceCompleted,
  ].sort(
    (left, right) =>
      B12_CROSS_CUTTING_GROUP_KEYS.indexOf(left) -
      B12_CROSS_CUTTING_GROUP_KEYS.indexOf(right),
  );

  return Object.freeze({
    auditOwner: record.definition.auditOwner,
    executionGroup: record.definition.executionGroup,
    fixtureCluster: record.definition.fixtureCluster,
    started: record.started,
    businessAssertionsCompleted: record.businessAssertionsCompleted,
    routeNetworkCompleted: record.routeNetworkCompleted,
    minimalCleanupCompleted: record.minimalCleanupCompleted,
    result: record.result,
    failureCategory: record.failureCategory,
    directAuditIds: Object.freeze([...record.definition.directAuditIds]),
    supportingEvidenceCompleted: Object.freeze(supportingEvidenceCompleted),
  });
}

export class B12OwnerResultJournal {
  private readonly ownerOrder: string[];

  private readonly records = new Map<string, MutableOwnerRecord>();

  private finalizedCallback: B12OwnerFinalizedCallback | undefined;

  constructor(
    definitions: readonly B12OwnerDefinition[],
    onOwnerFinalized?: B12OwnerFinalizedCallback,
  ) {
    this.ownerOrder = [];
    this.finalizedCallback = onOwnerFinalized;

    for (const sourceDefinition of definitions) {
      const definition = validateB12OwnerDefinition(sourceDefinition);
      if (this.records.has(definition.auditOwner)) {
        failJournal('B12_EXECUTION_DUPLICATE_AUDIT_OWNER');
      }
      this.ownerOrder.push(definition.auditOwner);
      this.records.set(definition.auditOwner, {
        definition,
        started: false,
        businessAssertionsCompleted: false,
        routeNetworkCompleted: false,
        minimalCleanupCompleted: false,
        result: 'not_executed',
        failureCategory: 'none',
        supportingEvidenceCompleted: new Set<B12CrossCuttingGroupKey>(),
        finalized: false,
      });
    }
  }

  beginOwner(auditOwner: string): void {
    const record = this.getMutableRecord(auditOwner);
    this.assertMutable(record);
    if (record.started) {
      failJournal('B12_EXECUTION_OWNER_ALREADY_STARTED');
    }
    record.started = true;
  }

  markBusinessAssertionsCompleted(auditOwner: string): void {
    const record = this.getStartedMutableRecord(auditOwner);
    if (record.businessAssertionsCompleted) {
      failJournal('B12_EXECUTION_BUSINESS_ASSERTIONS_ALREADY_COMPLETED');
    }
    record.businessAssertionsCompleted = true;
  }

  markRouteNetworkCompleted(auditOwner: string): void {
    const record = this.getStartedMutableRecord(auditOwner);
    if (record.routeNetworkCompleted) {
      failJournal('B12_EXECUTION_ROUTE_NETWORK_ALREADY_COMPLETED');
    }
    record.routeNetworkCompleted = true;
  }

  markSupportingEvidenceCompleted(
    auditOwner: string,
    group: B12CrossCuttingGroupKey,
  ): void {
    assertB12CrossCuttingGroupKey(group);
    const record = this.getStartedMutableRecord(auditOwner);
    if (record.supportingEvidenceCompleted.has(group)) {
      failJournal('B12_EXECUTION_SUPPORTING_EVIDENCE_ALREADY_COMPLETED');
    }
    record.supportingEvidenceCompleted.add(group);
  }

  markMinimalCleanupCompleted(auditOwner: string): void {
    const record = this.getStartedMutableRecord(auditOwner);
    if (record.minimalCleanupCompleted) {
      failJournal('B12_EXECUTION_MINIMAL_CLEANUP_ALREADY_COMPLETED');
    }
    record.minimalCleanupCompleted = true;
  }

  async finalizeOwner(
    auditOwner: string,
    result: B12OwnerResult,
    failureCategory: B12FailureCategory,
  ): Promise<B12OwnerJournalRecord> {
    assertB12OwnerResult(result);
    assertB12FailureCategory(failureCategory);
    const record = this.getMutableRecord(auditOwner);
    this.assertMutable(record);
    this.assertFinalizationAllowed(record, result, failureCategory);

    record.result = result;
    record.failureCategory = failureCategory;
    record.finalized = true;
    const finalizedRecord = copyRecord(record);

    const callback = this.finalizedCallback;
    if (callback) {
      try {
        await callback(finalizedRecord);
      } catch {
        this.finalizedCallback = undefined;
        throw new Error('B12_EXECUTION_OWNER_FINALIZED_CALLBACK_FAILED');
      }
    }

    return finalizedRecord;
  }

  isFinalized(auditOwner: string): boolean {
    return this.getMutableRecord(auditOwner).finalized;
  }

  ownerSnapshot(auditOwner: string): B12OwnerJournalRecord {
    return copyRecord(this.getMutableRecord(auditOwner));
  }

  snapshot(): B12OwnerJournalSnapshot {
    return Object.freeze(
      this.ownerOrder.map((auditOwner) =>
        copyRecord(this.getMutableRecord(auditOwner)),
      ),
    );
  }

  private getMutableRecord(auditOwner: string): MutableOwnerRecord {
    const record = this.records.get(auditOwner);
    if (!record) {
      failJournal('B12_EXECUTION_OWNER_NOT_REGISTERED');
    }
    return record;
  }

  private getStartedMutableRecord(auditOwner: string): MutableOwnerRecord {
    const record = this.getMutableRecord(auditOwner);
    this.assertMutable(record);
    if (!record.started) {
      failJournal('B12_EXECUTION_OWNER_NOT_STARTED');
    }
    return record;
  }

  private assertMutable(record: MutableOwnerRecord): void {
    if (record.finalized) {
      failJournal('B12_EXECUTION_OWNER_ALREADY_FINALIZED');
    }
  }

  private assertFinalizationAllowed(
    record: MutableOwnerRecord,
    result: B12OwnerResult,
    failureCategory: B12FailureCategory,
  ): void {
    if (result === 'pass') {
      if (
        !record.started ||
        !record.businessAssertionsCompleted ||
        !record.routeNetworkCompleted ||
        !record.minimalCleanupCompleted ||
        failureCategory !== 'none'
      ) {
        failJournal('B12_EXECUTION_OWNER_PASS_PRECONDITION_FAILED');
      }
      return;
    }

    if (result === 'fail') {
      if (
        !record.started ||
        failureCategory === 'none' ||
        (!record.minimalCleanupCompleted && failureCategory !== 'cleanup')
      ) {
        failJournal('B12_EXECUTION_OWNER_FAIL_PRECONDITION_FAILED');
      }
      return;
    }

    if (result === 'not_executed') {
      if (record.started || failureCategory !== 'none') {
        failJournal('B12_EXECUTION_NOT_EXECUTED_PRECONDITION_FAILED');
      }
      return;
    }

    if (record.started || failureCategory === 'none') {
      failJournal('B12_EXECUTION_GROUP_BLOCK_PRECONDITION_FAILED');
    }
  }
}
