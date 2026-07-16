import { Button } from '@/src/components/ui/Button';
import type { UseClinicalReportWorkflowValue } from '@/src/features/assessments/hooks/useClinicalReportWorkflow';
import {
  clinicalReportArchiveBoundaryStatements,
  clinicalReportStatusLabels,
  formatClinicalReportDate,
  getClinicalReportArchiveApiErrorMessage,
} from '@/src/features/assessments/lib/clinical-report-display';
import {
  clinicalReportArchiveLimits,
  isClinicalReportArchived,
} from '@/src/features/assessments/lib/clinical-report-archive-draft';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';

export function ClinicalReportArchivePanel({
  report,
  workflow,
}: {
  report: ClinicalReport;
  workflow: UseClinicalReportWorkflowValue;
}) {
  const draft = workflow.archiveDraft;
  const isActive = workflow.activeMode === 'archive' && draft !== null;
  const targetLabel = `${report.reportCode} / V${report.reportVersion}`;

  if (!isActive) {
    if (isClinicalReportArchived(report)) {
      return (
        <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
          <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
            报告已归档
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            当前操作目标：{targetLabel}
          </p>
          <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
            当前报告只读，不显示再次归档或取消归档入口。归档不等于删除、作废、更正或生成 PDF。
          </p>
        </section>
      );
    }

    if (workflow.archiveConsistencyWarning) {
      return (
        <p
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-warning)]"
          role="alert"
        >
          当前操作目标：{targetLabel}。<br />
          {workflow.archiveConsistencyWarning}
        </p>
      );
    }

    return (
      <section className="grid gap-3 rounded-md border border-[var(--cma-line)] p-4">
        <div>
          <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
            报告归档
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            当前操作目标：{targetLabel}。首次归档只面向已确认、已安全锁定且来源冻结完成的报告；Patient 与 Visit 状态不作为前端归档条件。
          </p>
        </div>
        {workflow.canArchive ? (
          <Button onClick={workflow.openArchive}>准备归档报告</Button>
        ) : (
          <p className="text-sm leading-6 text-[var(--cma-muted)]">
            {workflow.archiveBlockReason}
          </p>
        )}
      </section>
    );
  }

  const isWriting = workflow.writingAction === 'archive';
  const latestArchived = draft.stale && isClinicalReportArchived(report);

  return (
    <section
      aria-labelledby="clinical-report-archive-heading"
      className="grid gap-5 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface-muted)] p-5"
    >
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-archive-heading"
        >
          二次确认不可撤销归档
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          当前操作目标：{targetLabel}；status：
          {clinicalReportStatusLabels[report.status]}（
          {report.status}）；并发基线：
          {formatClinicalReportDate(draft.baseUpdatedAt)}。
        </p>
      </div>

      <div className="grid gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-semibold text-[var(--cma-muted)]">报告状态</p>
          <p className="mt-1 text-[var(--cma-text-strong)]">{report.status}</p>
        </div>
        <div>
          <p className="font-semibold text-[var(--cma-muted)]">报告锁定时间</p>
          <p className="mt-1 text-[var(--cma-text-strong)]">
            {formatClinicalReportDate(report.lockedAt)}
          </p>
        </div>
        <div>
          <p className="font-semibold text-[var(--cma-muted)]">
            来源冻结完成时间
          </p>
          <p className="mt-1 text-[var(--cma-text-strong)]">
            {formatClinicalReportDate(report.sourceFreeze?.completedAt)}
          </p>
        </div>
        <div>
          <p className="font-semibold text-[var(--cma-muted)]">报告更新时间</p>
          <p className="mt-1 text-[var(--cma-text-strong)]">
            {formatClinicalReportDate(report.updatedAt)}
          </p>
        </div>
      </div>

      <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--cma-muted)]">
        {clinicalReportArchiveBoundaryStatements.map((statement) => (
          <li key={statement}>{statement}</li>
        ))}
      </ul>

      {draft.stale ? (
        <div
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-[var(--cma-warning)]"
          role="alert"
        >
          <p className="font-semibold">
            {latestArchived
              ? '报告已由其他操作归档，本地归档说明未提交'
              : '归档草稿已过期'}
          </p>
          <p className="mt-1 text-sm leading-6">
            本地归档说明已保留，checkbox 已清除；原 POST 没有自动重发，也没有覆盖其他操作者的归档结果。
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            {latestArchived ? (
              <Button
                disabled={isWriting}
                onClick={workflow.cancelArchive}
                size="sm"
                variant="secondary"
              >
                关闭并放弃本地说明
              </Button>
            ) : workflow.canContinueArchiveWithLatest ? (
              <Button
                disabled={isWriting}
                onClick={workflow.continueArchiveWithLatest}
                size="sm"
                variant="secondary"
              >
                基于最新报告继续核对
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            className="text-base font-semibold text-[var(--cma-text-strong)]"
            htmlFor="clinical-report-archive-note"
          >
            归档流程说明（必填）
          </label>
          <span className="text-sm text-[var(--cma-muted)]">
            {draft.archiveNote.length} /{' '}
            {clinicalReportArchiveLimits.archiveNote.max}
          </span>
        </div>
        <textarea
          className="min-h-32 w-full rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-3 text-base leading-7 text-[var(--cma-text-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)] disabled:opacity-60"
          disabled={isWriting}
          id="clinical-report-archive-note"
          maxLength={clinicalReportArchiveLimits.archiveNote.max}
          onChange={(event) => workflow.updateArchiveNote(event.target.value)}
          value={draft.archiveNote}
        />
        <p className="text-sm text-[var(--cma-muted)]">
          trim 后 3–2000 个字符；不自动生成，不预填 freezeNote、lockNote、confirmationNote 或医生意见，也不属于报告正文。
        </p>
      </div>

      <label
        className="flex items-start gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4 text-base font-semibold leading-7 text-[var(--cma-text-strong)]"
        htmlFor="clinical-report-archive-confirmed"
      >
        <input
          checked={draft.confirmed}
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)]"
          disabled={isWriting || draft.stale}
          id="clinical-report-archive-confirmed"
          onChange={(event) =>
            workflow.setArchiveConfirmed(event.target.checked)
          }
          type="checkbox"
        />
        <span>
          我已核对当前已确认、已锁定且来源冻结完成的报告，并理解归档后不能恢复为已确认状态。
        </span>
      </label>

      {workflow.archiveError ? (
        <div
          className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-danger)]"
          role="alert"
        >
          <p>
            {getClinicalReportArchiveApiErrorMessage(
              workflow.archiveError.kind,
            )}
          </p>
          {workflow.archiveError.kind === 'service_unavailable' ||
          workflow.archiveError.kind === 'unknown' ? (
            <Button
              className="mt-3"
              disabled={isWriting}
              onClick={() =>
                void workflow.reloadLatestAfterArchiveUncertainty()
              }
              size="sm"
              variant="secondary"
            >
              手工重新加载最新报告
            </Button>
          ) : null}
        </div>
      ) : null}

      {!workflow.archiveValidation.valid &&
      workflow.archiveValidation.message ? (
        <p className="text-sm leading-6 text-[var(--cma-muted)]">
          {workflow.archiveValidation.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          disabled={!workflow.canConfirmArchive}
          onClick={() => void workflow.confirmArchive()}
        >
          {isWriting ? '正在归档报告' : '确认归档报告'}
        </Button>
        <Button
          disabled={isWriting}
          onClick={workflow.cancelArchive}
          variant="secondary"
        >
          取消
        </Button>
      </div>
    </section>
  );
}
