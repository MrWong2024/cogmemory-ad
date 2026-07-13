import { Button } from '@/src/components/ui/Button';
import type { UseClinicalReportWorkflowValue } from '@/src/features/assessments/hooks/useClinicalReportWorkflow';
import {
  clinicalReportCorrectionBoundaryStatements,
  formatClinicalReportDate,
  getClinicalReportCorrectionApiErrorMessage,
} from '@/src/features/assessments/lib/clinical-report-display';
import { clinicalReportCorrectionLimits } from '@/src/features/assessments/lib/clinical-report-correction-draft';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';

export function ClinicalReportCorrectionPanel({
  report,
  workflow,
}: {
  report: ClinicalReport;
  workflow: UseClinicalReportWorkflowValue;
}) {
  const draft = workflow.correctionDraft;
  const isActive = workflow.activeMode === 'correction' && draft !== null;

  if (!isActive) {
    if (report.replacementOf !== null || report.status === 'corrected') return null;
    if (report.status !== 'archived' && report.correction?.state !== 'in_progress') {
      return null;
    }
    return (
      <section className="grid gap-3 rounded-md border border-[var(--cma-line)] p-4">
        <div>
          <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
            版本化更正
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            更正保留原归档报告，并创建下一线性版本；Patient 与 Visit 状态不作为该流程的前端阻断条件。
          </p>
        </div>
        {workflow.canResumeCorrection ? (
          <Button onClick={workflow.openCorrectionResume}>
            继续完成版本化更正
          </Button>
        ) : workflow.canStartCorrection ? (
          <Button onClick={workflow.openCorrection}>准备版本化更正</Button>
        ) : (
          <p className="text-sm leading-6 text-[var(--cma-muted)]">
            {workflow.correctionBlockReason}
          </p>
        )}
      </section>
    );
  }

  const isWriting = workflow.writingAction === 'correction';
  const persisted = draft.mode === 'resume';
  const latestIsReplacementOrCorrected = Boolean(
    draft.stale &&
      (report.replacementOf !== null ||
        report.status === 'corrected' ||
        report.correction?.state === 'completed'),
  );

  return (
    <section
      aria-labelledby="clinical-report-correction-heading"
      className="grid gap-5 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface-muted)] p-5"
    >
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-correction-heading"
        >
          {persisted ? '继续同一版本化更正流程' : '二次确认版本化更正'}
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          来源报告：{report.reportCode} / V{report.reportVersion}；并发基线：
          {formatClinicalReportDate(draft.baseUpdatedAt)}。
        </p>
        {persisted ? (
          <p className="mt-2 text-sm leading-6 text-[var(--cma-muted)]">
            correctionId：{draft.correctionId}。原始原因与摘要来自服务端，只读且不会被本页面覆盖；本次不会生成新的 correctionId。
          </p>
        ) : null}
      </div>

      <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--cma-muted)]">
        {clinicalReportCorrectionBoundaryStatements.map((statement) => (
          <li key={statement}>{statement}</li>
        ))}
      </ul>

      {draft.stale ? (
        <div
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-[var(--cma-warning)]"
          role="alert"
        >
          <p className="font-semibold">
            {latestIsReplacementOrCorrected
              ? '其他操作已经完成更正，本地说明未写入'
              : '更正草稿基线已过期'}
          </p>
          <p className="mt-1 text-sm leading-6">
            本地首次输入已保留，checkbox 已清除；系统没有自动重发 POST，也没有覆盖其他操作者结果。
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            {workflow.canContinueCorrectionWithLatest ? (
              <Button
                disabled={isWriting}
                onClick={workflow.continueCorrectionWithLatest}
                size="sm"
                variant="secondary"
              >
                基于最新报告继续
              </Button>
            ) : null}
            {workflow.canDiscardLocalCorrectionAndResume ? (
              <Button
                disabled={isWriting}
                onClick={workflow.discardLocalCorrectionAndResume}
                size="sm"
                variant="secondary"
              >
                放弃本地说明并转入服务端恢复
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            className="text-base font-semibold text-[var(--cma-text-strong)]"
            htmlFor="clinical-report-correction-reason"
          >
            更正原因
          </label>
          <span className="text-sm text-[var(--cma-muted)]">
            {draft.correctionReason.length} / {clinicalReportCorrectionLimits.correctionReason.max}
          </span>
        </div>
        <textarea
          className="min-h-28 w-full rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-3 text-base leading-7 text-[var(--cma-text-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)] disabled:opacity-60"
          disabled={isWriting || persisted}
          id="clinical-report-correction-reason"
          maxLength={clinicalReportCorrectionLimits.correctionReason.max}
          onChange={(event) => workflow.updateCorrectionReason(event.target.value)}
          readOnly={persisted}
          value={draft.correctionReason}
        />
        {workflow.correctionValidation.correctionReason ? (
          <p className="text-sm leading-6 text-[var(--cma-muted)]">
            {workflow.correctionValidation.correctionReason}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            className="text-base font-semibold text-[var(--cma-text-strong)]"
            htmlFor="clinical-report-correction-summary"
          >
            计划变更摘要
          </label>
          <span className="text-sm text-[var(--cma-muted)]">
            {draft.changeSummary.length} / {clinicalReportCorrectionLimits.changeSummary.max}
          </span>
        </div>
        <textarea
          className="min-h-32 w-full rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-3 text-base leading-7 text-[var(--cma-text-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)] disabled:opacity-60"
          disabled={isWriting || persisted}
          id="clinical-report-correction-summary"
          maxLength={clinicalReportCorrectionLimits.changeSummary.max}
          onChange={(event) =>
            workflow.updateCorrectionChangeSummary(event.target.value)
          }
          readOnly={persisted}
          value={draft.changeSummary}
        />
        {workflow.correctionValidation.changeSummary ? (
          <p className="text-sm leading-6 text-[var(--cma-muted)]">
            {workflow.correctionValidation.changeSummary}
          </p>
        ) : null}
      </div>

      <label
        className="flex items-start gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4 text-base font-semibold leading-7 text-[var(--cma-text-strong)]"
        htmlFor="clinical-report-correction-confirmed"
      >
        <input
          checked={draft.confirmed}
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)]"
          disabled={isWriting || draft.stale}
          id="clinical-report-correction-confirmed"
          onChange={(event) =>
            workflow.setCorrectionConfirmed(event.target.checked)
          }
          type="checkbox"
        />
        <span>
          我已核对原归档报告与线性版本边界，并明确确认创建或继续同一替代版本流程。
        </span>
      </label>

      {workflow.correctionError ? (
        <div
          className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-danger)]"
          role="alert"
        >
          <p>{getClinicalReportCorrectionApiErrorMessage(workflow.correctionError.kind)}</p>
          {workflow.correctionError.kind === 'service_unavailable' ||
          workflow.correctionError.kind === 'unknown' ? (
            <Button
              className="mt-3"
              disabled={isWriting}
              onClick={() =>
                void workflow.reloadLatestAfterCorrectionUncertainty()
              }
              size="sm"
              variant="secondary"
            >
              手工重新加载最新报告
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          disabled={!workflow.canConfirmCorrection}
          onClick={() => void workflow.confirmCorrection()}
        >
          {isWriting
            ? '正在处理版本化更正'
            : persisted
              ? '确认继续同一更正流程'
              : '确认创建替代版本'}
        </Button>
        <Button
          disabled={isWriting}
          onClick={workflow.cancelCorrection}
          variant="secondary"
        >
          取消
        </Button>
      </div>
    </section>
  );
}
