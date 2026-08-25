import { Button } from '@/src/components/ui/Button';
import type { UseClinicalReportWorkflowValue } from '@/src/features/assessments/hooks/useClinicalReportWorkflow';
import {
  clinicalReportConfirmationRoleLabels,
  clinicalReportLockBoundaryStatements,
  clinicalReportStatusLabels,
  formatClinicalReportDate,
  getClinicalReportLockApiErrorMessage,
  getClinicalReportLockConsistencyWarning,
  isClinicalReportLocked,
} from '@/src/features/assessments/lib/clinical-report-display';
import { clinicalReportWorkflowLimits } from '@/src/features/assessments/lib/clinical-report-workflow-draft';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';

export function ClinicalReportLockPanel({
  report,
  workflow,
}: {
  report: ClinicalReport;
  workflow: UseClinicalReportWorkflowValue;
}) {
  const consistencyWarning = getClinicalReportLockConsistencyWarning(report);
  const targetLabel = `V${report.reportVersion}`;

  if (
    isClinicalReportLocked(report) &&
    (workflow.activeMode !== 'lock' || !workflow.lockDraft)
  ) {
    return (
      <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
        <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
          报告已锁定
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          当前操作目标：{targetLabel}
        </p>
        <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
          当前报告保持{clinicalReportStatusLabels[report.status]}状态。本页面不提供再次锁定或解锁入口。
        </p>
      </section>
    );
  }

  if (
    consistencyWarning &&
    (workflow.activeMode !== 'lock' || !workflow.lockDraft)
  ) {
    return (
      <p
        className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-warning)]"
        role="alert"
      >
        当前操作目标：{targetLabel}。<br />
        {consistencyWarning}
      </p>
    );
  }

  if (!workflow.roleCanLock) {
    return (
      <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
        <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
          报告锁定
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          当前操作目标：{targetLabel}
        </p>
        <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
          报告锁定需由医生或管理员执行。当前账号仍可查看报告和已有锁定信息，系统权限校验是最终边界。
        </p>
      </section>
    );
  }

  if (workflow.activeMode !== 'lock' || !workflow.lockDraft) {
    return (
      <section className="grid gap-3 rounded-md border border-[var(--cma-line)] p-4">
        <div>
          <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
            不可逆锁定报告
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            当前操作目标：{targetLabel}。只有已经确认、尚未锁定且满足操作条件的当前报告可以进入二次确认。
          </p>
        </div>
        {workflow.canLock ? (
          <Button onClick={workflow.openLock}>准备锁定报告</Button>
        ) : (
          <p className="text-sm leading-6 text-[var(--cma-muted)]">
            {workflow.lockBlockReason}
          </p>
        )}
      </section>
    );
  }

  const draft = workflow.lockDraft;
  const isWriting = workflow.writingAction === 'lock';
  const latestAlreadyLocked = draft.stale && report.lockedAt !== null;

  return (
    <section
      aria-labelledby="clinical-report-lock-heading"
      className="grid gap-5 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface-muted)] p-5"
    >
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-lock-heading"
        >
          二次确认不可逆锁定
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          当前报告版本：{targetLabel}；状态：
          {clinicalReportStatusLabels[report.status]}；
          {report.isFinal ? '已完成最终确认' : '尚未完成最终确认'}。本次操作基于最近加载于{' '}
          {formatClinicalReportDate(draft.baseUpdatedAt)} 的报告内容。
        </p>
      </div>

      <div className="grid gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4 text-sm">
        <div>
          <p className="font-semibold text-[var(--cma-muted)]">确认时间</p>
          <p className="mt-1 text-[var(--cma-text-strong)]">
            {formatClinicalReportDate(report.confirmation?.confirmedAt)}
          </p>
        </div>
        <div>
          <p className="font-semibold text-[var(--cma-muted)]">确认人</p>
          <p className="mt-1 text-[var(--cma-text-strong)]">
            {report.confirmation?.confirmedByName?.trim() || '—'}
            {report.confirmation?.confirmedByRole
              ? `（${clinicalReportConfirmationRoleLabels[report.confirmation.confirmedByRole]}）`
              : ''}
          </p>
        </div>
        <div>
          <p className="font-semibold text-[var(--cma-muted)]">最近更新时间</p>
          <p className="mt-1 text-[var(--cma-text-strong)]">
            {formatClinicalReportDate(report.updatedAt)}
          </p>
        </div>
      </div>

      <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--cma-muted)]">
        {clinicalReportLockBoundaryStatements.map((statement) => (
          <li key={statement}>{statement}</li>
        ))}
      </ul>

      {draft.stale ? (
        <div
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-[var(--cma-warning)]"
          role="alert"
        >
          <p className="font-semibold">
            {latestAlreadyLocked
              ? '报告已由其他操作锁定，本地说明未提交'
              : '锁定草稿已过期'}
          </p>
          <p className="mt-1 text-sm leading-6">
            锁定流程说明已保留，确认项已清除，原请求没有自动重新提交或覆盖其他操作者结果。
          </p>
          {workflow.canContinueLockWithLatest ? (
            <Button
              className="mt-3"
              disabled={isWriting}
              onClick={workflow.continueLockWithLatest}
              size="sm"
              variant="secondary"
            >
              基于最新报告继续
            </Button>
          ) : null}
        </div>
      ) : null}

      {consistencyWarning ? (
        <p
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-warning)]"
          role="alert"
        >
          {consistencyWarning}
        </p>
      ) : null}

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            className="text-base font-semibold text-[var(--cma-text-strong)]"
            htmlFor="clinical-report-lock-note"
          >
            锁定流程说明（必填）
          </label>
          <span className="text-sm text-[var(--cma-muted)]">
            {draft.lockNote.length} / {clinicalReportWorkflowLimits.lockNote.max}
          </span>
        </div>
        <textarea
          className="min-h-32 w-full rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-3 text-base leading-7 text-[var(--cma-text-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)] disabled:opacity-60"
          disabled={isWriting}
          id="clinical-report-lock-note"
          maxLength={clinicalReportWorkflowLimits.lockNote.max}
          onChange={(event) => workflow.updateLockNote(event.target.value)}
          value={draft.lockNote}
        />
        <p className="text-sm text-[var(--cma-muted)]">
          请输入 3–2000 个字符；系统不会自动生成，也不会预填其他报告意见。
        </p>
      </div>

      <label
        className="flex items-start gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4 text-base font-semibold leading-7 text-[var(--cma-text-strong)]"
        htmlFor="clinical-report-lock-confirmed"
      >
        <input
          checked={draft.confirmed}
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)]"
          disabled={isWriting || draft.stale}
          id="clinical-report-lock-confirmed"
          onChange={(event) => workflow.setLockConfirmed(event.target.checked)}
          type="checkbox"
        />
        <span>
          我已核对当前已确认报告，并理解本次锁定不可撤销，且锁定只作用于当前报告文档。
        </span>
      </label>

      {workflow.lockError ? (
        <p
          className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-danger)]"
          role="alert"
        >
          {getClinicalReportLockApiErrorMessage(workflow.lockError.kind)}
        </p>
      ) : null}

      {!workflow.lockValidation.valid && workflow.lockValidation.message ? (
        <p className="text-sm leading-6 text-[var(--cma-muted)]">
          {workflow.lockValidation.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          disabled={!workflow.canConfirmLock}
          onClick={() => void workflow.confirmLock()}
        >
          {isWriting ? '正在不可逆锁定报告' : '确认不可逆锁定'}
        </Button>
        <Button
          disabled={isWriting}
          onClick={workflow.cancelActive}
          variant="secondary"
        >
          取消
        </Button>
      </div>
    </section>
  );
}
