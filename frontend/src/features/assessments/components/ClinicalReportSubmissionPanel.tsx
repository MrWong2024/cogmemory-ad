import { Button } from '@/src/components/ui/Button';
import type { UseClinicalReportWorkflowValue } from '@/src/features/assessments/hooks/useClinicalReportWorkflow';
import { clinicalReportWorkflowLimits } from '@/src/features/assessments/lib/clinical-report-workflow-draft';
import { getClinicalReportApiErrorMessage } from '@/src/features/assessments/lib/clinical-report-display';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';

export function ClinicalReportSubmissionPanel({
  report,
  workflow,
}: {
  report: ClinicalReport;
  workflow: UseClinicalReportWorkflowValue;
}) {
  if (report.status !== 'draft' && workflow.activeMode !== 'submit') return null;

  if (workflow.activeMode !== 'submit' || !workflow.submissionDraft) {
    return (
      <section className="grid gap-3 rounded-md border border-[var(--cma-line)] p-4">
        <div>
          <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
            提交待医生确认
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            保存合规的医生意见后，报告可由用户明确提交为 pending_confirmation。提交不等于最终确认。
          </p>
        </div>
        <Button disabled={!workflow.canSubmit} onClick={workflow.openSubmit}>
          准备提交医生确认
        </Button>
        {!workflow.canSubmit ? (
          <p className="text-sm leading-6 text-[var(--cma-muted)]">
            当前需先保存 3–4000 字符的医生意见，且报告来源应为 mixed、质量状态不能为 failed，并且没有其他本地草稿或写请求。
          </p>
        ) : null}
      </section>
    );
  }

  const draft = workflow.submissionDraft;
  const isWriting = workflow.writingAction === 'submit';
  const fieldsDisabled = isWriting || report.status !== 'draft';

  return (
    <section
      aria-labelledby="clinical-report-submit-heading"
      className="grid gap-5 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface-muted)] p-5"
    >
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-submit-heading"
        >
          二次确认提交待医生确认
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          请再次核对以下临床人员文本；系统不会改写或解释原文。
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
      </div>

      {draft.stale ? (
        <div
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-[var(--cma-warning)]"
          role="alert"
        >
          <p className="font-semibold">提交表单已过期</p>
          <p className="mt-1 text-sm leading-6">
            提交说明已保留，checkbox 已清除，原请求没有自动重发。请重新核对最新报告后明确继续。
          </p>
          <Button
            className="mt-3"
            disabled={isWriting}
            onClick={workflow.continueSubmissionFromLatest}
            size="sm"
            variant="secondary"
          >
            基于最新报告重新准备提交
          </Button>
        </div>
      ) : null}

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            className="text-base font-semibold text-[var(--cma-text-strong)]"
            htmlFor="clinical-report-submission-note"
          >
            提交说明（必填）
          </label>
          <span className="text-sm text-[var(--cma-muted)]">
            {draft.submissionNote.length} / {clinicalReportWorkflowLimits.submissionNote.max}
          </span>
        </div>
        <textarea
          className="min-h-28 w-full rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-3 text-base leading-7 text-[var(--cma-text-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)] disabled:opacity-60"
          disabled={fieldsDisabled}
          id="clinical-report-submission-note"
          maxLength={clinicalReportWorkflowLimits.submissionNote.max}
          onChange={(event) => workflow.updateSubmissionNote(event.target.value)}
          value={draft.submissionNote}
        />
        <p className="text-sm text-[var(--cma-muted)]">trim 后 3–2000 个字符。</p>
      </div>

      <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--cma-muted)]">
        <li>提交后状态进入 pending_confirmation，当前没有退回 draft 的公开能力。</li>
        <li>提交后不能继续编辑，且只有 doctor / admin 可以最终确认。</li>
        <li>提交不等于确认，也不锁定报告、访视、评分、认知域或媒体。</li>
        <li>本操作不生成 PDF，不调用 AI。</li>
      </ul>

      <label
        className="flex items-start gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4 text-base font-semibold leading-7 text-[var(--cma-text-strong)]"
        htmlFor="clinical-report-submission-confirmed"
      >
        <input
          checked={draft.confirmed}
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)]"
          disabled={fieldsDisabled || draft.stale}
          id="clinical-report-submission-confirmed"
          onChange={(event) =>
            workflow.setSubmissionConfirmed(event.target.checked)
          }
          type="checkbox"
        />
        <span>我已核对当前报告内容，并理解提交后将不能继续编辑，且提交不等于最终确认。</span>
      </label>

      {workflow.submissionError ? (
        <p
          className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-base text-[var(--cma-danger)]"
          role="alert"
        >
          {workflow.submissionError.kind === 'forbidden'
            ? '当前账号无权提交该报告；已加载报告和提交说明均已保留。'
            : getClinicalReportApiErrorMessage(workflow.submissionError.kind)}
        </p>
      ) : null}

      {!workflow.submissionValidation.valid && workflow.submissionValidation.message ? (
        <p className="text-sm leading-6 text-[var(--cma-muted)]">
          {workflow.submissionValidation.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          disabled={!workflow.canConfirmSubmission}
          onClick={() => void workflow.submitForConfirmation()}
        >
          {isWriting ? '正在提交待确认' : '确认提交待医生确认'}
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
