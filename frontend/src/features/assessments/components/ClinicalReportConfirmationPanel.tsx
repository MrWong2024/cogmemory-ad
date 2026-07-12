import { Button } from '@/src/components/ui/Button';
import type { UseClinicalReportWorkflowValue } from '@/src/features/assessments/hooks/useClinicalReportWorkflow';
import { clinicalReportWorkflowLimits } from '@/src/features/assessments/lib/clinical-report-workflow-draft';
import {
  formatClinicalReportDate,
  getClinicalReportApiErrorMessage,
} from '@/src/features/assessments/lib/clinical-report-display';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';

export function ClinicalReportConfirmationPanel({
  report,
  workflow,
}: {
  report: ClinicalReport;
  workflow: UseClinicalReportWorkflowValue;
}) {
  if (report.status !== 'pending_confirmation') return null;

  if (!workflow.roleCanConfirm) {
    return (
      <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
        <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
          等待医生或管理员确认
        </h3>
        <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
          当前报告需由医生或管理员确认。护士与研究助理可继续只读查看报告及提交摘要，但不显示可用确认按钮；后端 RolesGuard 仍是最终权限边界。
        </p>
      </section>
    );
  }

  if (workflow.activeMode !== 'confirm' || !workflow.confirmationDraft) {
    return (
      <section className="grid gap-3 rounded-md border border-[var(--cma-line)] p-4">
        <div>
          <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
            医生或管理员最终确认
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            报告已提交待确认。最终确认后当前 A21 报告进入只读，但不表示报告或来源数据已锁定。
          </p>
        </div>
        <Button disabled={!workflow.canConfirm} onClick={workflow.openConfirm}>
          准备确认报告
        </Button>
      </section>
    );
  }

  const draft = workflow.confirmationDraft;
  const isWriting = workflow.writingAction === 'confirm';

  return (
    <section
      aria-labelledby="clinical-report-confirm-heading"
      className="grid gap-5 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface-muted)] p-5"
    >
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-confirm-heading"
        >
          二次确认当前报告
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          当前状态：pending_confirmation；并发基线：{formatClinicalReportDate(draft.baseUpdatedAt)}。
        </p>
      </div>

      <div className="grid gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4">
        <div>
          <p className="text-sm font-semibold text-[var(--cma-muted)]">医生意见</p>
          <p className="mt-1 whitespace-pre-wrap text-base leading-7 text-[var(--cma-text-strong)]">
            {report.narrative?.doctorOpinion?.trim() || '未填写'}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--cma-muted)]">临床人员补充建议</p>
          <p className="mt-1 whitespace-pre-wrap text-base leading-7 text-[var(--cma-text-strong)]">
            {report.narrative?.recommendationText?.trim() || '未填写'}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--cma-muted)]">提交说明</p>
          <p className="mt-1 whitespace-pre-wrap text-base leading-7 text-[var(--cma-text-strong)]">
            {report.submission?.submissionNote?.trim() || '未提供'}
          </p>
        </div>
      </div>

      {draft.stale ? (
        <div
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-[var(--cma-warning)]"
          role="alert"
        >
          <p className="font-semibold">确认表单已过期</p>
          <p className="mt-1 text-sm leading-6">
            最终确认意见已保留，checkbox 已清除，原请求没有自动重发。请重新核对最新报告。
          </p>
          <Button
            className="mt-3"
            disabled={isWriting}
            onClick={workflow.continueConfirmationFromLatest}
            size="sm"
            variant="secondary"
          >
            基于最新报告重新准备确认
          </Button>
        </div>
      ) : null}

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            className="text-base font-semibold text-[var(--cma-text-strong)]"
            htmlFor="clinical-report-confirmation-note"
          >
            最终确认意见（必填）
          </label>
          <span className="text-sm text-[var(--cma-muted)]">
            {draft.confirmationNote.length} / {clinicalReportWorkflowLimits.confirmationNote.max}
          </span>
        </div>
        <textarea
          className="min-h-28 w-full rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-3 text-base leading-7 text-[var(--cma-text-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)] disabled:opacity-60"
          disabled={isWriting}
          id="clinical-report-confirmation-note"
          maxLength={clinicalReportWorkflowLimits.confirmationNote.max}
          onChange={(event) => workflow.updateConfirmationNote(event.target.value)}
          value={draft.confirmationNote}
        />
        <p className="text-sm text-[var(--cma-muted)]">trim 后 3–2000 个字符。</p>
      </div>

      <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--cma-muted)]">
        <li>确认后 status=confirmed，A21 报告不可继续编辑。</li>
        <li>qualityStatus=passed 只表示报告确认流程质量标记通过，不表示患者或认知状态正常。</li>
        <li>confirmed 不等于 locked，不生成签名，也不锁定访视、评分、认知域或媒体。</li>
        <li>本操作不生成 PDF，不调用 AI；系统不解释或改写临床人员文本。</li>
      </ul>

      <label
        className="flex items-start gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4 text-base font-semibold leading-7 text-[var(--cma-text-strong)]"
        htmlFor="clinical-report-confirmation-confirmed"
      >
        <input
          checked={draft.confirmed}
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)]"
          disabled={isWriting || draft.stale}
          id="clinical-report-confirmation-confirmed"
          onChange={(event) =>
            workflow.setConfirmationConfirmed(event.target.checked)
          }
          type="checkbox"
        />
        <span>我已核对当前报告与提交摘要，并明确完成医生或管理员最终确认。</span>
      </label>

      {workflow.confirmationError ? (
        <p
          className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-base text-[var(--cma-danger)]"
          role="alert"
        >
          {workflow.confirmationError.kind === 'forbidden'
            ? '当前账号不具备 doctor / admin 确认权限；报告和确认意见均已保留。'
            : getClinicalReportApiErrorMessage(workflow.confirmationError.kind)}
        </p>
      ) : null}

      {!workflow.confirmationValidation.valid && workflow.confirmationValidation.message ? (
        <p className="text-sm leading-6 text-[var(--cma-muted)]">
          {workflow.confirmationValidation.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          disabled={!workflow.canConfirmReport}
          onClick={() => void workflow.confirmReport()}
        >
          {isWriting ? '正在确认报告' : '确认当前报告'}
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
