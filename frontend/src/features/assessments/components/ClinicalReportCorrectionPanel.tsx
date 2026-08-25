import { Button } from '@/src/components/ui/Button';
import type { UseClinicalReportWorkflowValue } from '@/src/features/assessments/hooks/useClinicalReportWorkflow';
import {
  clinicalReportCorrectionBoundaryStatements,
  formatClinicalReportDate,
  getClinicalReportCorrectionApiErrorMessage,
} from '@/src/features/assessments/lib/clinical-report-display';
import {
  clinicalReportCorrectionLimits,
  isSafeClinicalReportReplacementLineage,
} from '@/src/features/assessments/lib/clinical-report-correction-draft';
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
  const nextVersionLabel =
    Number.isSafeInteger(report.reportVersion) &&
    report.reportVersion < Number.MAX_SAFE_INTEGER
      ? `V${report.reportVersion + 1}`
      : '下一线性版本';

  if (!isActive) {
    if (report.status === 'corrected') return null;
    return (
      <section className="grid gap-3 rounded-md border border-[var(--cma-line)] p-4">
        <div>
          <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
            版本化更正
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            当前报告版本：V{report.reportVersion}；确认后系统将创建 {nextVersionLabel}。更正会保留原归档报告，并形成可追溯的下一版本。
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
            {workflow.correctionBlockReason ?? '当前报告暂不满足版本化更正条件。'}
          </p>
        )}
      </section>
    );
  }

  const isWriting = workflow.writingAction === 'correction';
  const persisted = draft.mode === 'resume';
  const latestIsCurrentCorrectionReplacement = Boolean(
    draft.stale &&
      report.id !== draft.sourceReportId &&
      isSafeClinicalReportReplacementLineage(report.replacementOf, report) &&
      report.replacementOf.previousReportId === draft.sourceReportId &&
      (draft.correctionId === null ||
        report.replacementOf.correctionId === draft.correctionId),
  );
  const latestIsReplacementOrCorrected = Boolean(
    draft.stale &&
      (latestIsCurrentCorrectionReplacement ||
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
          原报告版本：V{report.reportVersion}。本次操作基于最近加载于{' '}
          {formatClinicalReportDate(draft.baseUpdatedAt)} 的报告内容。
        </p>
        {persisted ? (
          <p className="mt-2 text-sm leading-6 text-[var(--cma-muted)]">
            正在继续系统已保存的同一报告更正流程。原始原因与摘要只读且不会被本页面覆盖。
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
              : '更正确认内容已过期'}
          </p>
          <p className="mt-1 text-sm leading-6">
            本地首次输入已保留，确认项已清除；系统没有自动重新提交请求，也没有覆盖其他操作者结果。
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
                放弃本地说明并继续原有流程
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
          我已核对原归档报告与版本关系，并明确确认创建或继续同一更正版本流程。
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
              : '确认创建更正版本'}
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
