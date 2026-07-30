import { resolveB12SessionOpenMode, type B12BrowserSession } from "../b12-core-support";
import type { B12BrowserEnvironment } from "../b12-env";
import { executeB12CoreOwnerAction } from "../core/owner-actions";
import {
  B12BrowserGroupSession,
} from "../execution/b12-browser-group-adapter";
import { runB12ExecutionGroup } from "../execution/b12-execution-group-runner";
import {
  createB12OwnerExecutionFailure,
  type B12FailureCategory,
} from "../execution/b12-execution-types";
import type {
  B12ExecutionGroupSummary,
  B12OwnerCleanupContext,
  B12OwnerRunContext,
} from "../execution/b12-execution-group-runner";
import type { B12OwnerJournalRecord } from "../execution/b12-owner-result-journal";
import { safeJsonStringify } from "../../support/safe-output";
import type { RoleContextFactory } from "../../support/role-context-factory";
import { expect } from "../../support/acceptance-test";
import {
  B12_G3_A3_CORE_GROUPS,
  b12G3A3CoreGroup,
  b12G3A3CoreOwnersFor,
} from "./b12-g3-a3-core-registry";
import {
  B12G3A3CoreAtomicJournal,
  b12G3A3CoreJournalTarget,
} from "./b12-g3-a3-core-journal";
import {
  b12G3A3CoreTarget,
  deleteB12G3A3CoreRuntimeSet,
  readB12G3A3CoreRuntimeSet,
  type B12G3A3CoreRuntimeSet,
} from "./b12-g3-a3-core-runtime";
import {
  B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
  B12_G3_A3_CORE_EVIDENCE_SCOPE,
  B12_G3_A3_CORE_PHASE,
  type B12G3A3CoreExecutionGroup,
  type B12G3A3CoreOwnerDefinition,
  type B12G3A3CoreSafeSummary,
} from "./b12-g3-a3-formal-types";

type EnabledEnvironment = Extract<B12BrowserEnvironment, { enabled: true }>;

type GroupSessionBinding = Readonly<{
  label: "primary" | "secondary" | "system";
  session: B12BrowserGroupSession;
}>;

export type B12G3A3CoreGroupState = Readonly<{
  runtimeSets: ReadonlyMap<string, B12G3A3CoreRuntimeSet>;
  sessions: readonly GroupSessionBinding[];
}>;

class B12G3A3CoreOwnerRun {
  private readonly ownerSessions: B12BrowserSession[] = [];
  private readonly usedBindings: GroupSessionBinding[] = [];

  constructor(
    readonly owner: B12G3A3CoreOwnerDefinition,
    readonly runtimeSet: B12G3A3CoreRuntimeSet,
    private readonly state: B12G3A3CoreGroupState,
    private readonly environment: EnabledEnvironment,
  ) {}

  readonly primary = async (): Promise<B12BrowserSession> =>
    this.begin("primary", this.runtimeSet.primary, this.owner.primaryRole);

  readonly secondary = async (): Promise<B12BrowserSession> => {
    const role = this.owner.secondaryRole;
    if (!role || !this.runtimeSet.primary.secondaryLoginIdentifier) {
      throw new Error("B12_FORMAL_CORE_SECONDARY_SESSION_NOT_ALLOWED");
    }
    return this.begin("secondary", this.runtimeSet.primary, role);
  };

  readonly system = async (): Promise<B12BrowserSession> => {
    if (!this.runtimeSet.system) {
      throw new Error("B12_FORMAL_CORE_SYSTEM_SESSION_NOT_ALLOWED");
    }
    return this.begin("system", this.runtimeSet.system, "system");
  };

  descriptor(): B12G3A3CoreRuntimeSet["primary"] {
    return this.runtimeSet.primary;
  }

  async completeNetwork(): Promise<void> {
    if (this.ownerSessions.length === 0) {
      throw new Error("B12_FORMAL_CORE_OWNER_SESSION_MISSING");
    }
    for (const session of this.ownerSessions) {
      await session.completeGroupedOwnerNetwork();
    }
  }

  async minimalCleanup(runFullCrossCutting: boolean): Promise<Readonly<{
    interceptInstalledCount: number;
    interceptRemovedCount: number;
  }>> {
    let interceptInstalledCount = 0;
    let interceptRemovedCount = 0;
    try {
      for (const session of this.ownerSessions) {
        const summary = await session.minimalCleanupInGroup(
          runFullCrossCutting,
        );
        expect(summary.captureTasksSettled).toBe(true);
        expect(summary.localDraftCleared).toBe(true);
        expect(summary.formClosed).toBe(true);
        interceptInstalledCount += summary.interceptInstalledCount;
        interceptRemovedCount += summary.interceptRemovedCount;
      }
    } finally {
      for (const binding of this.usedBindings) binding.session.endOwner();
    }
    return Object.freeze({
      interceptInstalledCount,
      interceptRemovedCount,
    });
  }

  private async begin(
    label: GroupSessionBinding["label"],
    descriptor: B12G3A3CoreRuntimeSet["primary"],
    role: B12G3A3CoreOwnerDefinition["primaryRole"],
  ): Promise<B12BrowserSession> {
    const existing = this.usedBindings.find((binding) => binding.label === label);
    if (existing) {
      const index = this.usedBindings.indexOf(existing);
      const session = this.ownerSessions[index];
      if (!session) throw new Error("B12_FORMAL_CORE_OWNER_SESSION_MISSING");
      return session;
    }
    const binding = this.state.sessions.find(
      (candidate) => candidate.label === label,
    );
    if (!binding) throw new Error("B12_FORMAL_CORE_GROUP_SESSION_MISSING");
    const session = await binding.session.beginOwner({
      label,
      descriptor,
      target: b12G3A3CoreTarget(this.owner),
      role,
    });
    this.usedBindings.push(binding);
    this.ownerSessions.push(session);
    return session;
  }
}

export class B12G3A3CoreGroupHarness {
  readonly onOwnerFinalized: (record: B12OwnerJournalRecord) => Promise<void>;
  private readonly startedAt = Date.now();
  private readonly runs = new Map<string, B12G3A3CoreOwnerRun>();
  private contextCount = 0;
  private sessionCount = 0;
  private fullCollectCount = 0;
  private minimalCleanupCount = 0;
  private interceptInstalledCount = 0;
  private interceptRemovedCount = 0;

  private constructor(
    readonly executionGroup: B12G3A3CoreExecutionGroup,
    private readonly owners: readonly B12G3A3CoreOwnerDefinition[],
    private readonly environment: EnabledEnvironment,
    private readonly roleContexts: RoleContextFactory,
    private readonly journal: B12G3A3CoreAtomicJournal,
  ) {
    this.onOwnerFinalized = journal.onOwnerFinalized;
  }

  static async create(input: {
    executionGroup: B12G3A3CoreExecutionGroup;
    environment: EnabledEnvironment;
    roleContexts: RoleContextFactory;
  }): Promise<B12G3A3CoreGroupHarness> {
    const owners = b12G3A3CoreOwnersFor(input.executionGroup);
    const journal = await B12G3A3CoreAtomicJournal.create({
      executionGroup: input.executionGroup,
      target: b12G3A3CoreJournalTarget(input.executionGroup),
    });
    return new B12G3A3CoreGroupHarness(
      input.executionGroup,
      owners,
      input.environment,
      input.roleContexts,
      journal,
    );
  }

  readonly setupGroup = async (): Promise<B12G3A3CoreGroupState> => {
    const runtimeSets = new Map<string, B12G3A3CoreRuntimeSet>();
    try {
      for (const owner of this.owners) {
        runtimeSets.set(owner.auditOwner, await readB12G3A3CoreRuntimeSet(owner));
      }
    } catch {
      throw createB12OwnerExecutionFailure(
        "fixture",
        "B12_FORMAL_CORE_RUNTIME_SETUP_FAILED",
      );
    }
    const first = runtimeSets.get(this.owners[0].auditOwner);
    if (!first) {
      throw createB12OwnerExecutionFailure(
        "fixture",
        "B12_FORMAL_CORE_RUNTIME_SETUP_EMPTY",
      );
    }
    const bindings: GroupSessionBinding[] = [];
    const create = async (
      label: GroupSessionBinding["label"],
      role: B12G3A3CoreOwnerDefinition["primaryRole"],
      loginIdentifier: string,
    ): Promise<void> => {
      bindings.push(
        Object.freeze({
          label,
          session: await B12BrowserGroupSession.create({
            role,
            loginIdentifier,
            environment: this.environment,
            roleContexts: this.roleContexts,
            label: `${this.executionGroup}-${label}`,
          }),
        }),
      );
    };
    try {
      await create("primary", first.primary.primaryRole, first.primary.loginIdentifier);
      if (this.executionGroup === "eg-denied-roles") {
        const secondaryIdentifier = first.primary.secondaryLoginIdentifier;
        const system = first.system;
        if (!secondaryIdentifier || !system) {
          throw new Error("B12_FORMAL_CORE_DENIED_RUNTIME_INCOMPLETE");
        }
        await create("secondary", "research_assistant", secondaryIdentifier);
        await create("system", "system", system.loginIdentifier);
      } else if (
        this.executionGroup === "eg-already-locked-idempotency" ||
        this.executionGroup === "eg-lock-conflict-latest-locked"
      ) {
        const secondaryIdentifier = first.primary.secondaryLoginIdentifier;
        if (!secondaryIdentifier) {
          throw new Error("B12_FORMAL_CORE_SECONDARY_RUNTIME_INCOMPLETE");
        }
        await create("secondary", "doctor", secondaryIdentifier);
      }
    } catch {
      throw createB12OwnerExecutionFailure(
        "group_setup_auth",
        "B12_FORMAL_CORE_GROUP_AUTH_SETUP_FAILED",
      );
    }
    const expected = b12G3A3CoreGroup(this.executionGroup);
    this.contextCount = bindings.length;
    this.sessionCount = bindings.length;
    expect(bindings).toHaveLength(expected.sessionCount);
    return Object.freeze({
      runtimeSets,
      sessions: Object.freeze(bindings),
    });
  };

  readonly runOwner = async (
    context: B12OwnerRunContext<
      B12G3A3CoreOwnerDefinition,
      B12G3A3CoreGroupState
    >,
  ): Promise<void> => {
    if (!context.groupState) {
      throw createB12OwnerExecutionFailure(
        "shared_support",
        "B12_FORMAL_CORE_GROUP_STATE_MISSING",
      );
    }
    const runtimeSet = context.groupState.runtimeSets.get(
      context.owner.auditOwner,
    );
    if (!runtimeSet) {
      throw createB12OwnerExecutionFailure(
        "shared_support",
        "B12_FORMAL_CORE_OWNER_RUNTIME_MISSING",
      );
    }
    const run = new B12G3A3CoreOwnerRun(
      context.owner,
      runtimeSet,
      context.groupState,
      this.environment,
    );
    this.runs.set(context.owner.auditOwner, run);
    await runB12G3A3CorePhase(
      "owner_assertion",
      "B12_FORMAL_CORE_OWNER_ACTION_FAILED",
      () =>
        executeB12CoreOwnerAction({
          auditOwner: context.owner.auditOwner,
          descriptor: run.descriptor(),
          run,
        }),
    );
    context.markBusinessAssertionsCompleted();
    await runB12G3A3CorePhase(
      "route_network",
      "B12_FORMAL_CORE_ROUTE_NETWORK_FAILED",
      () => run.completeNetwork(),
    );
    context.markRouteNetworkCompleted();
    if (context.owner.auditOwner === "core-workflow/success-idempotency/doctor-lock-success") {
      context.markSupportingEvidenceCompleted("console_network");
      context.markSupportingEvidenceCompleted("dom_sensitive_data");
    }
  };

  readonly minimalCleanup = async (
    context: B12OwnerCleanupContext<
      B12G3A3CoreOwnerDefinition,
      B12G3A3CoreGroupState
    >,
  ): Promise<void> => {
    const run = this.runs.get(context.owner.auditOwner);
    if (!run) throw new Error("B12_FORMAL_CORE_OWNER_RUN_MISSING");
    const summary = await run.minimalCleanup(
      context.owner.auditOwner ===
        "core-workflow/success-idempotency/doctor-lock-success",
    );
    this.minimalCleanupCount += 1;
    this.interceptInstalledCount += summary.interceptInstalledCount;
    this.interceptRemovedCount += summary.interceptRemovedCount;
    this.runs.delete(context.owner.auditOwner);
  };

  readonly cleanupGroup = async (context: {
    groupState: B12G3A3CoreGroupState | undefined;
    groupSetupSucceeded: boolean;
  }): Promise<void> => {
    let failed = false;
    if (context.groupState) {
      this.fullCollectCount += 1;
      for (const binding of context.groupState.sessions) {
        const owner =
          binding.label === "system"
            ? this.owners.find(({ auditOwner }) =>
                auditOwner.endsWith("/denied-role-entry"),
              )
            : this.owners.at(-1);
        if (!owner) {
          failed = true;
          continue;
        }
        const target = b12G3A3CoreTarget(owner);
        await binding.session
          .collectAndLogout({
            target,
            openMode: resolveB12SessionOpenMode(target, binding.session.role),
          })
          .catch(() => {
            failed = true;
          });
        await binding.session.finishInfrastructureCleanup().catch(() => {
          failed = true;
        });
      }
    }
    const closed = await this.roleContexts
      .closeAll()
      .then(({ activeContextCount }) => activeContextCount === 0)
      .catch(() => false);
    if (!closed) failed = true;
    let removed = 0;
    for (const owner of this.owners) {
      removed += await deleteB12G3A3CoreRuntimeSet(owner).catch(() => 0);
    }
    const expectedRuntimeCount = this.owners.reduce(
      (total, owner) => total + owner.runtimeDescriptorCount,
      0,
    );
    if (context.groupSetupSucceeded && removed !== expectedRuntimeCount) {
      failed = true;
    }
    if (failed) throw new Error("B12_FORMAL_CORE_GROUP_CLEANUP_FAILED");
  };

  async finalize(
    summary: B12ExecutionGroupSummary,
  ): Promise<B12G3A3CoreSafeSummary> {
    await this.journal.finalize();
    const document = await this.journal.read();
    const ownAuditIds = this.owners.flatMap(({ directAuditIds }) => directAuditIds);
    const blockedAuditIds = document.auditClosureSnapshot
      .filter(
        ({ auditId, result }) =>
          ownAuditIds.includes(auditId) && result !== "pass",
      )
      .map(({ auditId }) => auditId);
    const safeSummary: B12G3A3CoreSafeSummary = Object.freeze({
      phase: B12_G3_A3_CORE_PHASE,
      evidenceScope: B12_G3_A3_CORE_EVIDENCE_SCOPE,
      auditClosureAllowed: B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
      executionGroup: this.executionGroup,
      ownerCount: summary.ownerResults.length,
      ownerResults: Object.freeze(
        summary.ownerResults.map((record) =>
          Object.freeze({
            auditOwner: record.auditOwner,
            result: record.result,
            failureCategory: record.failureCategory,
            minimalCleanupCompleted: record.minimalCleanupCompleted,
          }),
        ),
      ),
      directAuditIds: Object.freeze([...ownAuditIds].sort()),
      blockedAuditIds: Object.freeze([...blockedAuditIds].sort()),
      ContextCount: this.contextCount,
      SessionCount: this.sessionCount,
      fullCollectCount: this.fullCollectCount,
      minimalCleanupCount: this.minimalCleanupCount,
      interceptInstalledCount: this.interceptInstalledCount,
      interceptRemovedCount: this.interceptRemovedCount,
      groupSetupSucceeded: summary.groupSetupSucceeded,
      groupCleanupSucceeded: summary.groupCleanupSucceeded,
      profileCompletionBlocked:
        summary.profileCompletionBlocked || blockedAuditIds.length > 0,
      stopReason: summary.stopReason,
      elapsedMs: Date.now() - this.startedAt,
    });
    console.log(`B12_G3_A3_CORE ${safeJsonStringify(safeSummary, [
      this.environment.fixturePassword,
    ])}`);
    const operationallyPassed =
      summary.stopReason === "none" &&
      summary.groupSetupSucceeded &&
      summary.groupCleanupSucceeded &&
      summary.ownerResults.length === this.owners.length &&
      summary.ownerResults.every(
        ({ result, minimalCleanupCompleted }) =>
          result === "pass" && minimalCleanupCompleted,
      );
    if (!operationallyPassed) {
      throw new Error("B12_FORMAL_CORE_GROUP_FAILED");
    }
    return safeSummary;
  }
}

export async function runB12G3A3CorePhase<T>(
  category: Exclude<B12FailureCategory, "none">,
  safeCode: string,
  action: () => T | Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch {
    throw createB12OwnerExecutionFailure(category, safeCode);
  }
}

export async function runB12G3A3CoreGroup(input: {
  executionGroup: B12G3A3CoreExecutionGroup;
  environment: EnabledEnvironment;
  roleContexts: RoleContextFactory;
}): Promise<B12G3A3CoreSafeSummary> {
  const owners = b12G3A3CoreOwnersFor(input.executionGroup);
  const harness = await B12G3A3CoreGroupHarness.create(input);
  const summary = await runB12ExecutionGroup({
    executionGroup: input.executionGroup,
    owners,
    setupGroup: harness.setupGroup,
    runOwner: harness.runOwner,
    minimalCleanup: harness.minimalCleanup,
    cleanupGroup: harness.cleanupGroup,
    onOwnerFinalized: harness.onOwnerFinalized,
  });
  return harness.finalize(summary);
}

export function b12G3A3CoreBudgetTotals(): Readonly<{
  groupCount: number;
  ownerCount: number;
  sessionCount: number;
  runtimeDescriptorCount: number;
}> {
  return Object.freeze({
    groupCount: B12_G3_A3_CORE_GROUPS.length,
    ownerCount: B12_G3_A3_CORE_GROUPS.reduce(
      (total, group) => total + group.ownerKeys.length,
      0,
    ),
    sessionCount: B12_G3_A3_CORE_GROUPS.reduce(
      (total, group) => total + group.sessionCount,
      0,
    ),
    runtimeDescriptorCount: B12_G3_A3_CORE_GROUPS.reduce(
      (total, group) => total + group.runtimeDescriptorCount,
      0,
    ),
  });
}
