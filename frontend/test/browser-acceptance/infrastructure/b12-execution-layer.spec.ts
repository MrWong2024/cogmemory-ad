import { readFileSync } from 'node:fs';
import {
  B12CrossCuttingEvidenceRegistry,
  type B12CrossCuttingEvidenceDefinition,
} from '../b12/execution/b12-cross-cutting-evidence';
import {
  runB12ExecutionGroup,
  type B12OwnerRunContext,
} from '../b12/execution/b12-execution-group-runner';
import {
  createB12OwnerExecutionFailure,
  type B12AuditId,
  type B12OwnerDefinition,
} from '../b12/execution/b12-execution-types';
import { B12OwnerResultJournal } from '../b12/execution/b12-owner-result-journal';
import { expect, test } from '../support/acceptance-test';
import { safeJsonStringify } from '../support/safe-output';

const EXECUTION_GROUP = 'eg-synthetic-read-only';
const FIXTURE_CLUSTER = 'fc-synthetic-isolated';
const SENSITIVE_VALUES = [
  'https://example.invalid/private?id=secret',
  'Cookie=synthetic-secret',
  'Session=synthetic-secret',
  'doctor@example.invalid',
  'C:\\runtime\\private\\descriptor.json',
  '507f1f77bcf86cd799439011',
  'SYNTHETIC_CLINICAL_TEXT_FORBIDDEN',
] as const;

function ownerDefinition(
  auditOwner: string,
  auditId: B12AuditId,
): B12OwnerDefinition {
  return {
    auditOwner,
    executionGroup: EXECUTION_GROUP,
    fixtureCluster: FIXTURE_CLUSTER,
    directAuditIds: [auditId],
  };
}

function threeOwners(): readonly B12OwnerDefinition[] {
  return [
    ownerDefinition('synthetic/owner-one', 'B12-01'),
    ownerDefinition('synthetic/owner-two', 'B12-02'),
    ownerDefinition('synthetic/owner-three', 'B12-03'),
  ];
}

function markOwnerSuccessful(
  context: Pick<
    B12OwnerRunContext<B12OwnerDefinition, undefined>,
    'markBusinessAssertionsCompleted' | 'markRouteNetworkCompleted'
  >,
): void {
  context.markBusinessAssertionsCompleted();
  context.markRouteNetworkCompleted();
}

test('finalizes a passing owner only after every required phase', async () => {
  const callbackRecords: string[] = [];
  const journal = new B12OwnerResultJournal(
    [
      {
        ...ownerDefinition('synthetic/normal-owner', 'B12-02'),
        directAuditIds: ['B12-02', 'B12-01'],
      },
    ],
    (record) => {
      expect(record.minimalCleanupCompleted).toBe(true);
      callbackRecords.push(record.auditOwner);
    },
  );

  journal.beginOwner('synthetic/normal-owner');
  journal.markBusinessAssertionsCompleted('synthetic/normal-owner');
  journal.markRouteNetworkCompleted('synthetic/normal-owner');
  journal.markSupportingEvidenceCompleted(
    'synthetic/normal-owner',
    'console_network',
  );
  journal.markMinimalCleanupCompleted('synthetic/normal-owner');
  const finalized = await journal.finalizeOwner(
    'synthetic/normal-owner',
    'pass',
    'none',
  );

  expect(finalized).toEqual({
    auditOwner: 'synthetic/normal-owner',
    executionGroup: EXECUTION_GROUP,
    fixtureCluster: FIXTURE_CLUSTER,
    started: true,
    businessAssertionsCompleted: true,
    routeNetworkCompleted: true,
    minimalCleanupCompleted: true,
    result: 'pass',
    failureCategory: 'none',
    directAuditIds: ['B12-01', 'B12-02'],
    supportingEvidenceCompleted: ['console_network'],
  });
  expect(callbackRecords).toEqual(['synthetic/normal-owner']);
});

test('rejects pass while business or route Network work is incomplete', async () => {
  const missingBusiness = new B12OwnerResultJournal([
    ownerDefinition('synthetic/missing-business', 'B12-01'),
  ]);
  missingBusiness.beginOwner('synthetic/missing-business');
  missingBusiness.markRouteNetworkCompleted('synthetic/missing-business');
  missingBusiness.markMinimalCleanupCompleted('synthetic/missing-business');

  await expect(
    missingBusiness.finalizeOwner(
      'synthetic/missing-business',
      'pass',
      'none',
    ),
  ).rejects.toThrow('B12_EXECUTION_OWNER_PASS_PRECONDITION_FAILED');

  const missingNetwork = new B12OwnerResultJournal([
    ownerDefinition('synthetic/missing-network', 'B12-02'),
  ]);
  missingNetwork.beginOwner('synthetic/missing-network');
  missingNetwork.markBusinessAssertionsCompleted('synthetic/missing-network');
  missingNetwork.markMinimalCleanupCompleted('synthetic/missing-network');

  await expect(
    missingNetwork.finalizeOwner(
      'synthetic/missing-network',
      'pass',
      'none',
    ),
  ).rejects.toThrow('B12_EXECUTION_OWNER_PASS_PRECONDITION_FAILED');
});

test('rejects every mutation after finalize and duplicate minimal cleanup', async () => {
  const journal = new B12OwnerResultJournal([
    ownerDefinition('synthetic/finalized-owner', 'B12-01'),
  ]);
  journal.beginOwner('synthetic/finalized-owner');
  journal.markBusinessAssertionsCompleted('synthetic/finalized-owner');
  journal.markRouteNetworkCompleted('synthetic/finalized-owner');
  journal.markMinimalCleanupCompleted('synthetic/finalized-owner');
  expect(() =>
    journal.markMinimalCleanupCompleted('synthetic/finalized-owner'),
  ).toThrow('B12_EXECUTION_MINIMAL_CLEANUP_ALREADY_COMPLETED');
  await journal.finalizeOwner('synthetic/finalized-owner', 'pass', 'none');

  expect(() => journal.beginOwner('synthetic/finalized-owner')).toThrow(
    'B12_EXECUTION_OWNER_ALREADY_FINALIZED',
  );
  expect(() =>
    journal.markBusinessAssertionsCompleted('synthetic/finalized-owner'),
  ).toThrow('B12_EXECUTION_OWNER_ALREADY_FINALIZED');
  await expect(
    journal.finalizeOwner('synthetic/finalized-owner', 'fail', 'unknown'),
  ).rejects.toThrow('B12_EXECUTION_OWNER_ALREADY_FINALIZED');
});

test('keeps definition inputs and every snapshot layer immutable', () => {
  const auditIds: B12AuditId[] = ['B12-02', 'B12-01'];
  const definitions: B12OwnerDefinition[] = [
    {
      ...ownerDefinition('synthetic/immutable-owner', 'B12-01'),
      directAuditIds: auditIds,
    },
  ];
  const journal = new B12OwnerResultJournal(definitions);
  auditIds.push('B12-03');
  definitions.push(ownerDefinition('synthetic/late-owner', 'B12-04'));

  const snapshot = journal.snapshot();
  expect(snapshot).toHaveLength(1);
  expect(snapshot[0].directAuditIds).toEqual(['B12-01', 'B12-02']);
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot[0])).toBe(true);
  expect(Object.isFrozen(snapshot[0].directAuditIds)).toBe(true);
  expect(journal.snapshot()).not.toBe(snapshot);
});

test('rejects unsafe owner, group, cluster, Audit ID, and safe code inputs', () => {
  expect(
    () =>
      new B12OwnerResultJournal([
        ownerDefinition('https://example.invalid/owner', 'B12-01'),
      ]),
  ).toThrow('B12_EXECUTION_INVALID_AUDIT_OWNER');
  expect(
    () =>
      new B12OwnerResultJournal([
        {
          ...ownerDefinition('synthetic/owner', 'B12-01'),
          executionGroup: 'group-without-prefix',
        },
      ]),
  ).toThrow('B12_EXECUTION_INVALID_EXECUTION_GROUP');
  expect(
    () =>
      new B12OwnerResultJournal([
        {
          ...ownerDefinition('synthetic/owner', 'B12-01'),
          fixtureCluster: '../runtime',
        },
      ]),
  ).toThrow('B12_EXECUTION_INVALID_FIXTURE_CLUSTER');
  expect(
    () =>
      new B12OwnerResultJournal([
        ownerDefinition('synthetic/owner', 'B12-89'),
      ]),
  ).toThrow('B12_EXECUTION_INVALID_AUDIT_ID');
  expect(
    () =>
      new B12OwnerResultJournal([
        {
          ...ownerDefinition('synthetic/owner', 'B12-01'),
          directAuditIds: ['B12-01', 'B12-01'],
        },
      ]),
  ).toThrow('B12_EXECUTION_DUPLICATE_OWNER_AUDIT_ID');
  expect(() =>
    createB12OwnerExecutionFailure('owner_assertion', 'unsafe message'),
  ).toThrow('B12_EXECUTION_INVALID_SAFE_CODE');
});

test('preserves a passing owner when a later owner fails and continues safely', async () => {
  const cleanupCount = new Map<string, number>();
  const summary = await runB12ExecutionGroup({
    executionGroup: EXECUTION_GROUP,
    owners: threeOwners(),
    runOwner: (context) => {
      markOwnerSuccessful(context);
      if (context.owner.auditOwner === 'synthetic/owner-two') {
        throw createB12OwnerExecutionFailure(
          'owner_assertion',
          'SYNTHETIC_OWNER_ASSERTION_FAILED',
        );
      }
    },
    minimalCleanup: ({ owner }) => {
      cleanupCount.set(
        owner.auditOwner,
        (cleanupCount.get(owner.auditOwner) ?? 0) + 1,
      );
    },
  });

  expect(summary.ownerResults.map(({ result }) => result)).toEqual([
    'pass',
    'fail',
    'pass',
  ]);
  expect(summary.ownerResults[0].failureCategory).toBe('none');
  expect(summary.ownerResults[1].failureCategory).toBe('owner_assertion');
  expect(summary.stopReason).toBe('none');
  expect(summary.profileCompletionBlocked).toBe(true);
  expect([...cleanupCount.values()]).toEqual([1, 1, 1]);
});

test('isolates a route Network failure and preserves its completed phases', async () => {
  const owners = threeOwners().slice(0, 2);
  const summary = await runB12ExecutionGroup({
    executionGroup: EXECUTION_GROUP,
    owners,
    runOwner: (context) => {
      context.markBusinessAssertionsCompleted();
      if (context.owner.auditOwner === 'synthetic/owner-one') {
        throw createB12OwnerExecutionFailure(
          'route_network',
          'SYNTHETIC_ROUTE_NETWORK_FAILED',
        );
      }
      context.markRouteNetworkCompleted();
    },
    minimalCleanup: () => undefined,
  });

  expect(summary.ownerResults[0]).toMatchObject({
    result: 'fail',
    failureCategory: 'route_network',
    businessAssertionsCompleted: true,
    routeNetworkCompleted: false,
    minimalCleanupCompleted: true,
  });
  expect(summary.ownerResults[1].result).toBe('pass');
});

test('classifies unknown errors without retaining their message or stack', async () => {
  const summary = await runB12ExecutionGroup({
    executionGroup: EXECUTION_GROUP,
    owners: [ownerDefinition('synthetic/unknown-error', 'B12-01')],
    runOwner: () => {
      throw new Error(SENSITIVE_VALUES.join(' '));
    },
    minimalCleanup: () => undefined,
  });
  const serialized = safeJsonStringify(summary, SENSITIVE_VALUES);

  expect(summary.ownerResults[0]).toMatchObject({
    result: 'fail',
    failureCategory: 'unknown',
    minimalCleanupCompleted: true,
  });
  for (const value of SENSITIVE_VALUES) {
    expect(serialized).not.toContain(value);
  }
  expect(serialized).not.toContain('stack');
});

test('runs minimal cleanup once for started owners and stops on cleanup failure', async () => {
  const cleanupCalls: string[] = [];
  const summary = await runB12ExecutionGroup({
    executionGroup: EXECUTION_GROUP,
    owners: threeOwners(),
    runOwner: markOwnerSuccessful,
    minimalCleanup: ({ owner }) => {
      cleanupCalls.push(owner.auditOwner);
      if (owner.auditOwner === 'synthetic/owner-two') {
        throw new Error('SYNTHETIC_CLEANUP_INTERNAL_DETAIL');
      }
    },
  });

  expect(cleanupCalls).toEqual([
    'synthetic/owner-one',
    'synthetic/owner-two',
  ]);
  expect(summary.stopReason).toBe('owner_cleanup_failed');
  expect(summary.ownerResults[0].result).toBe('pass');
  expect(summary.ownerResults[1]).toMatchObject({
    result: 'fail',
    failureCategory: 'cleanup',
    minimalCleanupCompleted: false,
  });
  expect(summary.ownerResults[2]).toMatchObject({
    started: false,
    result: 'not_executed',
    failureCategory: 'none',
  });
});

test('runs successful group cleanup exactly once', async () => {
  let groupCleanupCount = 0;
  const summary = await runB12ExecutionGroup({
    executionGroup: EXECUTION_GROUP,
    owners: [ownerDefinition('synthetic/group-cleanup', 'B12-01')],
    runOwner: markOwnerSuccessful,
    minimalCleanup: () => undefined,
    cleanupGroup: () => {
      groupCleanupCount += 1;
    },
  });

  expect(groupCleanupCount).toBe(1);
  expect(summary.groupCleanupSucceeded).toBe(true);
  expect(summary.ownerResults[0].result).toBe('pass');
});

test('keeps finalized owner results when group cleanup fails', async () => {
  let groupCleanupCount = 0;
  const summary = await runB12ExecutionGroup({
    executionGroup: EXECUTION_GROUP,
    owners: [ownerDefinition('synthetic/group-cleanup-fail', 'B12-01')],
    runOwner: markOwnerSuccessful,
    minimalCleanup: () => undefined,
    cleanupGroup: () => {
      groupCleanupCount += 1;
      throw new Error(SENSITIVE_VALUES.join(' '));
    },
  });

  expect(groupCleanupCount).toBe(1);
  expect(summary.ownerResults[0].result).toBe('pass');
  expect(summary.groupCleanupSucceeded).toBe(false);
  expect(summary.profileCompletionBlocked).toBe(true);
  safeJsonStringify(summary, SENSITIVE_VALUES);
});

test('blocks every owner on group setup failure and still cleans the group', async () => {
  let ownerRunCount = 0;
  let ownerCleanupCount = 0;
  let groupCleanupCount = 0;
  const summary = await runB12ExecutionGroup({
    executionGroup: EXECUTION_GROUP,
    owners: threeOwners(),
    setupGroup: () => {
      throw new Error(SENSITIVE_VALUES.join(' '));
    },
    runOwner: () => {
      ownerRunCount += 1;
    },
    minimalCleanup: () => {
      ownerCleanupCount += 1;
    },
    cleanupGroup: () => {
      groupCleanupCount += 1;
    },
  });

  expect(ownerRunCount).toBe(0);
  expect(ownerCleanupCount).toBe(0);
  expect(groupCleanupCount).toBe(1);
  expect(summary.groupSetupSucceeded).toBe(false);
  expect(summary.stopReason).toBe('group_setup_failed');
  expect(summary.ownerResults).toHaveLength(3);
  expect(
    summary.ownerResults.every(
      (record) =>
        record.result === 'blocked_by_group_setup' &&
        record.failureCategory === 'group_setup_auth' &&
        !record.started,
    ),
  ).toBe(true);
  safeJsonStringify(summary, SENSITIVE_VALUES);
});

test('stops only after shared support fails for a second owner', async () => {
  const owners = [
    ...threeOwners(),
    ownerDefinition('synthetic/owner-four', 'B12-04'),
  ];
  const cleanupCalls: string[] = [];
  const summary = await runB12ExecutionGroup({
    executionGroup: EXECUTION_GROUP,
    owners,
    runOwner: (context) => {
      markOwnerSuccessful(context);
      if (
        context.owner.auditOwner === 'synthetic/owner-one' ||
        context.owner.auditOwner === 'synthetic/owner-three'
      ) {
        throw createB12OwnerExecutionFailure(
          'shared_support',
          'SYNTHETIC_SHARED_SUPPORT_FAILED',
        );
      }
    },
    minimalCleanup: ({ owner }) => {
      cleanupCalls.push(owner.auditOwner);
    },
  });

  expect(summary.ownerResults.map(({ result }) => result)).toEqual([
    'fail',
    'pass',
    'fail',
    'not_executed',
  ]);
  expect(summary.stopReason).toBe('repeated_shared_support_failure');
  expect(cleanupCalls).toEqual([
    'synthetic/owner-one',
    'synthetic/owner-two',
    'synthetic/owner-three',
  ]);
});

test('awaits each finalized callback before starting the next owner', async () => {
  const events: string[] = [];
  const owners = threeOwners().slice(0, 2);
  const summary = await runB12ExecutionGroup({
    executionGroup: EXECUTION_GROUP,
    owners,
    runOwner: (context) => {
      if (context.owner.auditOwner === 'synthetic/owner-two') {
        expect(events.at(-1)).toBe('callback:synthetic/owner-one:done');
      }
      events.push(`run:${context.owner.auditOwner}`);
      markOwnerSuccessful(context);
    },
    minimalCleanup: ({ owner }) => {
      events.push(`cleanup:${owner.auditOwner}`);
    },
    onOwnerFinalized: async (record) => {
      expect(record.minimalCleanupCompleted).toBe(true);
      events.push(`callback:${record.auditOwner}:start`);
      await Promise.resolve();
      events.push(`callback:${record.auditOwner}:done`);
    },
  });

  expect(summary.ownerResults.map(({ result }) => result)).toEqual([
    'pass',
    'pass',
  ]);
  expect(events).toEqual([
    'run:synthetic/owner-one',
    'cleanup:synthetic/owner-one',
    'callback:synthetic/owner-one:start',
    'callback:synthetic/owner-one:done',
    'run:synthetic/owner-two',
    'cleanup:synthetic/owner-two',
    'callback:synthetic/owner-two:start',
    'callback:synthetic/owner-two:done',
  ]);
});

test('retains memory journal and stops safely when finalized output fails', async () => {
  let groupCleanupCount = 0;
  const summary = await runB12ExecutionGroup({
    executionGroup: EXECUTION_GROUP,
    owners: threeOwners().slice(0, 2),
    runOwner: markOwnerSuccessful,
    minimalCleanup: () => undefined,
    onOwnerFinalized: () => {
      throw new Error(SENSITIVE_VALUES.join(' '));
    },
    cleanupGroup: () => {
      groupCleanupCount += 1;
    },
  });

  expect(groupCleanupCount).toBe(1);
  expect(summary.stopReason).toBe('journal_output_failed');
  expect(summary.profileCompletionBlocked).toBe(true);
  expect(summary.ownerResults[0]).toMatchObject({
    result: 'pass',
    minimalCleanupCompleted: true,
  });
  expect(summary.ownerResults[1].result).toBe('not_executed');
  safeJsonStringify(summary, SENSITIVE_VALUES);
});

test('maps Direct failures only to the owning cross-cutting Direct IDs', () => {
  const registry = new B12CrossCuttingEvidenceRegistry();
  registry.recordDirectResult('auth_lifecycle', 'fail');
  registry.recordSupportingResult('logout_cookie', 'pass');
  const impact = registry.calculateAuditImpact();

  expect(
    impact.directAuditResults.find(({ auditId }) => auditId === 'B12-83'),
  ).toEqual({
    group: 'auth_lifecycle',
    auditId: 'B12-83',
    result: 'fail',
  });
  expect(
    impact.directAuditResults.some(({ auditId }) => auditId === 'B12-59'),
  ).toBe(false);
  expect(
    impact.directAuditResults.filter(({ result }) => result === 'pass'),
  ).toEqual([]);
  expect(impact.profileCompletionBlocked).toBe(true);
});

test('lets Supporting and non-audit failures block profile without failing IDs', () => {
  const registry = new B12CrossCuttingEvidenceRegistry();
  registry.recordSupportingResult('console_network', 'fail');
  registry.recordNonAuditQualityGateResult('logout_cookie', 'fail');
  const snapshot = registry.snapshot();
  const impact = registry.calculateAuditImpact();

  expect(
    impact.directAuditResults.filter(({ result }) => result === 'fail'),
  ).toEqual([]);
  expect(impact.profileCompletionBlocked).toBe(true);
  expect(
    snapshot.find(({ group }) => group === 'console_network'),
  ).toMatchObject({
    supportingResult: 'fail',
    profileCompletionBlocked: true,
  });
  expect(snapshot.find(({ group }) => group === 'logout_cookie')).toMatchObject(
    {
      nonAuditQualityGateResult: 'fail',
      profileCompletionBlocked: true,
    },
  );
});

test('rejects Direct ownership duplication and Direct/Supporting overlap', () => {
  const duplicateDirect: readonly B12CrossCuttingEvidenceDefinition[] = [
    {
      group: 'auth_lifecycle',
      directAuditIds: ['B12-01'],
      supportingAuditIds: [],
      nonAuditQualityGate: false,
    },
    {
      group: 'storage_url_privacy',
      directAuditIds: ['B12-01'],
      supportingAuditIds: [],
      nonAuditQualityGate: false,
    },
  ];
  const overlap: readonly B12CrossCuttingEvidenceDefinition[] = [
    {
      group: 'auth_lifecycle',
      directAuditIds: ['B12-01'],
      supportingAuditIds: ['B12-01'],
      nonAuditQualityGate: false,
    },
  ];

  expect(() => new B12CrossCuttingEvidenceRegistry(duplicateDirect)).toThrow(
    'B12_CROSS_CUTTING_DIRECT_OWNER_DUPLICATED',
  );
  expect(() => new B12CrossCuttingEvidenceRegistry(overlap)).toThrow(
    'B12_CROSS_CUTTING_DIRECT_SUPPORTING_OVERLAP',
  );
});

test('returns immutable cross-cutting snapshots with fixed safe fields', () => {
  const registry = new B12CrossCuttingEvidenceRegistry();
  registry.recordDirectResult('responsive_accessibility', 'pass');
  const snapshot = registry.snapshot();
  const entry = snapshot.find(
    ({ group }) => group === 'responsive_accessibility',
  );

  expect(entry).toBeDefined();
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(entry)).toBe(true);
  expect(Object.isFrozen(entry?.directAuditIds)).toBe(true);
  expect(Object.keys(entry ?? {}).sort()).toEqual(
    [
      'directAuditIds',
      'directResult',
      'group',
      'nonAuditQualityGateResult',
      'profileCompletionBlocked',
      'supportingAuditIds',
      'supportingResult',
    ].sort(),
  );
  safeJsonStringify(snapshot, SENSITIVE_VALUES);
});

test('keeps the runner boundary pure and does not mutate owner input order', async () => {
  const executionFiles = [
    'test/browser-acceptance/b12/execution/b12-execution-types.ts',
    'test/browser-acceptance/b12/execution/b12-owner-result-journal.ts',
    'test/browser-acceptance/b12/execution/b12-execution-group-runner.ts',
    'test/browser-acceptance/b12/execution/b12-cross-cutting-evidence.ts',
  ];
  for (const file of executionFiles) {
    const source = readFileSync(file, 'utf8');
    expect(source).not.toMatch(
      /@playwright|\bPage\b|\bBrowserContext\b|mongodb|mongoose|process\.env/i,
    );
  }

  const owners = Object.freeze(
    threeOwners().map((owner) =>
      Object.freeze({
        ...owner,
        directAuditIds: Object.freeze([...owner.directAuditIds]),
      }),
    ),
  );
  const orderBefore = owners.map(({ auditOwner }) => auditOwner);
  const summary = await runB12ExecutionGroup({
    executionGroup: EXECUTION_GROUP,
    owners,
    runOwner: markOwnerSuccessful,
    minimalCleanup: () => undefined,
  });

  expect(owners.map(({ auditOwner }) => auditOwner)).toEqual(orderBefore);
  expect(summary.ownerResults.map(({ auditOwner }) => auditOwner)).toEqual(
    orderBefore,
  );
  expect(Object.keys(summary).sort()).toEqual(
    [
      'executionGroup',
      'groupCleanupSucceeded',
      'groupSetupSucceeded',
      'ownerResults',
      'profileCompletionBlocked',
      'stopReason',
    ].sort(),
  );
});
