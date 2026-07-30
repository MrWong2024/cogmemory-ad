import {
  assertB12ExecutionGroup,
  isB12OwnerExecutionFailure,
  type B12CrossCuttingGroupKey,
  type B12FailureCategory,
  type B12GroupStopReason,
  type B12OwnerDefinition,
} from './b12-execution-types';
import {
  B12OwnerResultJournal,
  type B12OwnerFinalizedCallback,
  type B12OwnerJournalSnapshot,
} from './b12-owner-result-journal';

export type B12OwnerRunContext<
  TOwner extends B12OwnerDefinition,
  TGroupState,
> = Readonly<{
  owner: Readonly<TOwner>;
  groupState: TGroupState | undefined;
  markBusinessAssertionsCompleted: () => void;
  markRouteNetworkCompleted: () => void;
  markSupportingEvidenceCompleted: (
    group: B12CrossCuttingGroupKey,
  ) => void;
}>;

export type B12OwnerCleanupContext<
  TOwner extends B12OwnerDefinition,
  TGroupState,
> = Readonly<{
  owner: Readonly<TOwner>;
  groupState: TGroupState | undefined;
  ownerFailureCategory: B12FailureCategory;
}>;

export type B12GroupCleanupContext<TGroupState> = Readonly<{
  groupState: TGroupState | undefined;
  groupSetupSucceeded: boolean;
}>;

export type B12ExecutionGroupRunnerOptions<
  TOwner extends B12OwnerDefinition,
  TGroupState = undefined,
> = Readonly<{
  executionGroup: string;
  owners: readonly TOwner[];
  setupGroup?: () => TGroupState | Promise<TGroupState>;
  runOwner: (
    context: B12OwnerRunContext<TOwner, TGroupState>,
  ) => void | Promise<void>;
  minimalCleanup: (
    context: B12OwnerCleanupContext<TOwner, TGroupState>,
  ) => void | Promise<void>;
  cleanupGroup?: (
    context: B12GroupCleanupContext<TGroupState>,
  ) => void | Promise<void>;
  onOwnerFinalized?: B12OwnerFinalizedCallback;
}>;

export type B12ExecutionGroupSummary = Readonly<{
  executionGroup: string;
  stopReason: B12GroupStopReason;
  groupSetupSucceeded: boolean;
  groupCleanupSucceeded: boolean;
  profileCompletionBlocked: boolean;
  ownerResults: B12OwnerJournalSnapshot;
}>;

function isJournalOutputFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === 'B12_EXECUTION_OWNER_FINALIZED_CALLBACK_FAILED'
  );
}

function normalizeOwnerFailure(
  error: unknown,
  fallback: Exclude<B12FailureCategory, 'none'>,
): Exclude<B12FailureCategory, 'none'> {
  if (isB12OwnerExecutionFailure(error)) {
    // Read both fixed fields while deliberately excluding the safe code from output.
    void error.safeCode;
    return error.category;
  }
  return fallback;
}

export async function runB12ExecutionGroup<
  TOwner extends B12OwnerDefinition,
  TGroupState = undefined,
>(
  options: B12ExecutionGroupRunnerOptions<TOwner, TGroupState>,
): Promise<B12ExecutionGroupSummary> {
  assertB12ExecutionGroup(options.executionGroup);
  if (options.owners.length === 0) {
    throw new Error('B12_EXECUTION_GROUP_REQUIRES_OWNER');
  }
  for (const owner of options.owners) {
    if (owner.executionGroup !== options.executionGroup) {
      throw new Error('B12_EXECUTION_OWNER_GROUP_MISMATCH');
    }
  }

  const journal = new B12OwnerResultJournal(
    options.owners,
    options.onOwnerFinalized,
  );
  let groupState: TGroupState | undefined;
  let groupSetupSucceeded = true;
  let groupCleanupSucceeded = true;
  let profileCompletionBlocked = false;
  let stopReason: B12GroupStopReason = 'none';
  let sharedSupportFailureCount = 0;
  let nextOwnerIndex = 0;

  const finalizeOwner = async (
    auditOwner: string,
    result: 'pass' | 'fail' | 'not_executed' | 'blocked_by_group_setup',
    failureCategory: B12FailureCategory,
  ): Promise<boolean> => {
    try {
      await journal.finalizeOwner(auditOwner, result, failureCategory);
      return true;
    } catch (error: unknown) {
      if (!isJournalOutputFailure(error)) {
        throw error;
      }
      profileCompletionBlocked = true;
      stopReason = 'journal_output_failed';
      return false;
    }
  };

  try {
    if (options.setupGroup) {
      try {
        groupState = await options.setupGroup();
      } catch (error: unknown) {
        groupSetupSucceeded = false;
        profileCompletionBlocked = true;
        stopReason = 'group_setup_failed';
        const setupFailureCategory = normalizeOwnerFailure(
          error,
          'group_setup_auth',
        );
        for (const owner of options.owners) {
          await finalizeOwner(
            owner.auditOwner,
            'blocked_by_group_setup',
            setupFailureCategory,
          );
        }
        nextOwnerIndex = options.owners.length;
      }
    }

    while (groupSetupSucceeded && nextOwnerIndex < options.owners.length) {
      if (stopReason !== 'none') {
        break;
      }

      const owner = options.owners[nextOwnerIndex];
      journal.beginOwner(owner.auditOwner);
      let ownerFailureCategory: B12FailureCategory = 'none';

      try {
        await options.runOwner({
          owner,
          groupState,
          markBusinessAssertionsCompleted: () =>
            journal.markBusinessAssertionsCompleted(owner.auditOwner),
          markRouteNetworkCompleted: () =>
            journal.markRouteNetworkCompleted(owner.auditOwner),
          markSupportingEvidenceCompleted: (group) =>
            journal.markSupportingEvidenceCompleted(owner.auditOwner, group),
        });
      } catch (error: unknown) {
        ownerFailureCategory = normalizeOwnerFailure(error, 'unknown');
        profileCompletionBlocked = true;
      }

      try {
        await options.minimalCleanup({
          owner,
          groupState,
          ownerFailureCategory,
        });
        journal.markMinimalCleanupCompleted(owner.auditOwner);
      } catch {
        ownerFailureCategory = 'cleanup';
        profileCompletionBlocked = true;
        stopReason = 'owner_cleanup_failed';
      }

      const result = ownerFailureCategory === 'none' ? 'pass' : 'fail';
      const finalized = await finalizeOwner(
        owner.auditOwner,
        result,
        ownerFailureCategory,
      );
      nextOwnerIndex += 1;

      if (!finalized) {
        break;
      }

      if (ownerFailureCategory === 'shared_support') {
        sharedSupportFailureCount += 1;
        if (sharedSupportFailureCount === 2) {
          stopReason = 'repeated_shared_support_failure';
          profileCompletionBlocked = true;
          break;
        }
      }
    }

    while (nextOwnerIndex < options.owners.length) {
      const owner = options.owners[nextOwnerIndex];
      await finalizeOwner(owner.auditOwner, 'not_executed', 'none');
      nextOwnerIndex += 1;
    }
  } finally {
    if (options.cleanupGroup) {
      try {
        await options.cleanupGroup({
          groupState,
          groupSetupSucceeded,
        });
      } catch {
        groupCleanupSucceeded = false;
        profileCompletionBlocked = true;
      }
    }
  }

  return Object.freeze({
    executionGroup: options.executionGroup,
    stopReason,
    groupSetupSucceeded,
    groupCleanupSucceeded,
    profileCompletionBlocked,
    ownerResults: journal.snapshot(),
  });
}
