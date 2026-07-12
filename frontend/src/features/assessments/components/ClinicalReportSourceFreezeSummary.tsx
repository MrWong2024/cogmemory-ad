import {
  clinicalReportOperatorRoleLabels,
  clinicalReportSourceFreezeCountLabels,
  clinicalReportSourceFreezeStateLabels,
  formatClinicalReportDate,
} from '@/src/features/assessments/lib/clinical-report-display';
import {
  getClinicalReportSourceFreezeConsistencyWarning,
  isSafeClinicalReportSourceFreezeCounts,
} from '@/src/features/assessments/lib/clinical-report-source-freeze-draft';
import type {
  ClinicalReportSourceFreezeResourceCounts,
  ClinicalReportSourceFreezeSummary as SourceFreezeSummary,
  ClinicalReportWorkflowActor,
  FreezeClinicalReportSourcesReceipt,
} from '@/src/features/assessments/types/clinical-report';

const countKeys = [
  'scaleInstanceCount',
  'itemResponseCount',
  'scoreResultCount',
  'cognitiveDomainResultCount',
  'mediaEvidenceCount',
  'totalSourceCount',
] as const;

function actorLabel(actor: ClinicalReportWorkflowActor | null): string {
  if (!actor) return '—';
  const name = actor.operatorName?.trim() || '未提供姓名';
  const role = actor.operatorRole
    ? clinicalReportOperatorRoleLabels[actor.operatorRole]
    : '未提供角色';
  return `${name}（${role}）`;
}

function CountTable({
  completed,
  expected,
  newlyFrozen,
  previouslyFrozen,
}: {
  completed: ClinicalReportSourceFreezeResourceCounts | null;
  expected: ClinicalReportSourceFreezeResourceCounts;
  newlyFrozen: ClinicalReportSourceFreezeResourceCounts | null;
  previouslyFrozen: ClinicalReportSourceFreezeResourceCounts;
}) {
  const safe =
    isSafeClinicalReportSourceFreezeCounts(expected) &&
    isSafeClinicalReportSourceFreezeCounts(previouslyFrozen) &&
    (completed === null ||
      isSafeClinicalReportSourceFreezeCounts(completed)) &&
    (newlyFrozen === null ||
      isSafeClinicalReportSourceFreezeCounts(newlyFrozen)) &&
    ((completed === null && newlyFrozen === null) ||
      (completed !== null &&
        newlyFrozen !== null &&
        countKeys.every(
          (key) =>
            completed[key] === expected[key] &&
            newlyFrozen[key] + previouslyFrozen[key] === expected[key],
        )));

  if (!safe) {
    return (
      <p
        className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-sm leading-6 text-[var(--cma-warning)]"
        role="alert"
      >
        来源冻结计数不是安全非负整数，当前不展示数值，请联系管理员。
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-[var(--cma-line)] px-3 py-2 font-semibold text-[var(--cma-muted)]">来源类型</th>
            <th className="border-b border-[var(--cma-line)] px-3 py-2 font-semibold text-[var(--cma-muted)]">预期数量</th>
            <th className="border-b border-[var(--cma-line)] px-3 py-2 font-semibold text-[var(--cma-muted)]">完成数量</th>
            <th className="border-b border-[var(--cma-line)] px-3 py-2 font-semibold text-[var(--cma-muted)]">本次新增冻结</th>
            <th className="border-b border-[var(--cma-line)] px-3 py-2 font-semibold text-[var(--cma-muted)]">此前已冻结</th>
          </tr>
        </thead>
        <tbody>
          {countKeys.map((key) => (
            <tr key={key}>
              <th className="border-b border-[var(--cma-line)] px-3 py-3 font-semibold text-[var(--cma-text-strong)]">
                {clinicalReportSourceFreezeCountLabels[key]}
              </th>
              <td className="border-b border-[var(--cma-line)] px-3 py-3 text-[var(--cma-text-strong)]">{expected[key]}</td>
              <td className="border-b border-[var(--cma-line)] px-3 py-3 text-[var(--cma-text-strong)]">{completed ? completed[key] : '待完成'}</td>
              <td className="border-b border-[var(--cma-line)] px-3 py-3 text-[var(--cma-text-strong)]">{newlyFrozen ? newlyFrozen[key] : '待完成'}</td>
              <td className="border-b border-[var(--cma-line)] px-3 py-3 text-[var(--cma-text-strong)]">{previouslyFrozen[key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReceiptSummary({
  receipt,
}: {
  receipt: FreezeClinicalReportSourcesReceipt;
}) {
  return (
    <section className="grid gap-4 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-success-soft)] p-4">
      <div>
        <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
          当前页面会话来源冻结回执
        </h4>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          {receipt.alreadyFrozen
            ? '该报告此前已经完成来源冻结，本次未重复写入。'
            : receipt.resumedExisting
              ? '已有来源冻结流程已恢复并完成。'
              : '报告来源链冻结已完成。'}
          回执刷新后消失，持久事实始终来自 report.sourceFreeze。
        </p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="font-semibold text-[var(--cma-muted)]">状态</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{receipt.state}</dd></div>
        <div><dt className="font-semibold text-[var(--cma-muted)]">技术追溯号</dt><dd className="mt-1 break-all text-[var(--cma-text-strong)]">{receipt.freezeId}</dd></div>
        <div><dt className="font-semibold text-[var(--cma-muted)]">开始时间</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(receipt.startedAt)}</dd></div>
        <div><dt className="font-semibold text-[var(--cma-muted)]">来源统一锁定时间</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(receipt.sourceLockedAt)}</dd></div>
        <div><dt className="font-semibold text-[var(--cma-muted)]">发起人</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{actorLabel(receipt.startedBy)}</dd></div>
        <div><dt className="font-semibold text-[var(--cma-muted)]">完成时间</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(receipt.completedAt)}</dd></div>
        <div><dt className="font-semibold text-[var(--cma-muted)]">完成人</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{actorLabel(receipt.completedBy)}</dd></div>
        <div><dt className="font-semibold text-[var(--cma-muted)]">alreadyFrozen</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{String(receipt.alreadyFrozen)}</dd></div>
        <div><dt className="font-semibold text-[var(--cma-muted)]">resumedExisting</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{String(receipt.resumedExisting)}</dd></div>
        <div className="sm:col-span-2 lg:col-span-4"><dt className="font-semibold text-[var(--cma-muted)]">来源冻结流程说明</dt><dd className="mt-1 whitespace-pre-wrap text-[var(--cma-text-strong)]">{receipt.freezeNote}</dd></div>
      </dl>
      <CountTable
        completed={receipt.completedCounts}
        expected={receipt.expectedCounts}
        newlyFrozen={receipt.newlyFrozenCounts}
        previouslyFrozen={receipt.previouslyFrozenCounts}
      />
    </section>
  );
}

export function ClinicalReportSourceFreezeSummary({
  receipt,
  sourceFreeze,
}: {
  receipt: FreezeClinicalReportSourcesReceipt | null;
  sourceFreeze: SourceFreezeSummary | null;
}) {
  if (!sourceFreeze) {
    return (
      <section className="grid gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
        <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
          来源冻结安全摘要
        </h3>
        <p className="text-base leading-7 text-[var(--cma-muted)]">
          报告来源尚未冻结。
        </p>
        {receipt ? <ReceiptSummary receipt={receipt} /> : null}
      </section>
    );
  }

  const warning = getClinicalReportSourceFreezeConsistencyWarning(sourceFreeze);
  return (
    <section
      aria-labelledby="clinical-report-source-freeze-summary-heading"
      className="grid gap-4 rounded-md border border-[var(--cma-line)] p-4"
    >
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-source-freeze-summary-heading"
        >
          来源冻结安全摘要
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          {sourceFreeze.state === 'in_progress'
            ? '来源冻结流程尚未完成，可由医生或管理员继续恢复。部分来源可能已经冻结，系统未执行自动回滚。'
            : '报告来源链冻结已完成。'}
        </p>
      </div>

      {warning ? (
        <p
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-warning)]"
          role="alert"
        >
          来源冻结安全摘要不完整或不一致：{warning} 当前不开放来源冻结写操作，请联系管理员。
        </p>
      ) : null}

      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="font-semibold text-[var(--cma-muted)]">状态</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{clinicalReportSourceFreezeStateLabels[sourceFreeze.state]}（{sourceFreeze.state}）</dd></div>
        <div><dt className="font-semibold text-[var(--cma-muted)]">技术追溯号</dt><dd className="mt-1 break-all text-[var(--cma-muted)]">{sourceFreeze.freezeId}</dd></div>
        <div><dt className="font-semibold text-[var(--cma-muted)]">开始时间</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(sourceFreeze.startedAt)}</dd></div>
        <div><dt className="font-semibold text-[var(--cma-muted)]">来源统一锁定时间</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(sourceFreeze.sourceLockedAt)}</dd></div>
        <div><dt className="font-semibold text-[var(--cma-muted)]">发起人</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{actorLabel(sourceFreeze.startedBy)}</dd></div>
        <div><dt className="font-semibold text-[var(--cma-muted)]">完成时间</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(sourceFreeze.completedAt)}</dd></div>
        <div><dt className="font-semibold text-[var(--cma-muted)]">完成人</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{actorLabel(sourceFreeze.completedBy)}</dd></div>
        <div className="sm:col-span-2 lg:col-span-4"><dt className="font-semibold text-[var(--cma-muted)]">来源冻结流程说明</dt><dd className="mt-1 whitespace-pre-wrap text-[var(--cma-text-strong)]">{sourceFreeze.freezeNote}</dd></div>
      </dl>

      {!warning ? (
        <CountTable
          completed={sourceFreeze.completedCounts}
          expected={sourceFreeze.expectedCounts}
          newlyFrozen={sourceFreeze.newlyFrozenCounts}
          previouslyFrozen={sourceFreeze.previouslyFrozenCounts}
        />
      ) : null}

      {receipt ? <ReceiptSummary receipt={receipt} /> : null}
    </section>
  );
}
