import type { UseClinicalReportWorkflowValue } from '@/src/features/assessments/hooks/useClinicalReportWorkflow';
import {
  clinicalReportConfirmationRoleLabels,
  clinicalReportOperatorRoleLabels,
  formatClinicalReportDate,
  clinicalReportSourceFreezeStateLabels,
  getClinicalReportLockConsistencyWarning,
} from '@/src/features/assessments/lib/clinical-report-display';
import type {
  ClinicalReport,
  ClinicalReportChangedField,
  ClinicalReportWorkflowActor,
} from '@/src/features/assessments/types/clinical-report';

const changedFieldLabels: Record<ClinicalReportChangedField, string> = {
  doctorOpinion: '医生意见',
  recommendationText: '临床人员补充建议',
};

function actorLabel(actor: ClinicalReportWorkflowActor | null): string {
  if (!actor) return '—';
  const name = actor.operatorName?.trim() || '未提供姓名';
  const role = actor.operatorRole
    ? clinicalReportOperatorRoleLabels[actor.operatorRole]
    : '未提供角色';
  return `${name}（${role}）`;
}

function traceId(value: string | null | undefined): string {
  return value?.trim() || '—';
}

export function ClinicalReportWorkflowSummary({
  report,
  workflow,
}: {
  report: ClinicalReport;
  workflow: UseClinicalReportWorkflowValue;
}) {
  const lockWarning = getClinicalReportLockConsistencyWarning(report);

  return (
    <section
      aria-labelledby="clinical-report-workflow-summary-heading"
      className="grid gap-4 rounded-md border border-[var(--cma-line)] p-4"
    >
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-workflow-summary-heading"
        >
          报告工作流摘要
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          仅展示最新公开摘要与当前页面会话回执，不公开完整编辑历史、前后值、metadata 或签名字段。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
          <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">最新编辑摘要</h4>
          {report.editorial ? (
            <dl className="mt-3 grid gap-3 text-sm">
              <div><dt className="font-semibold text-[var(--cma-muted)]">时间</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.editorial.lastEditedAt)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">编辑人</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{actorLabel(report.editorial.lastEditedBy)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">编辑次数</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{report.editorial.editCount}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">最近变化字段</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{report.editorial.lastChangedFields.map((field) => changedFieldLabels[field]).join('、') || '—'}</dd></div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-[var(--cma-muted)]">尚无公开编辑摘要。</p>
          )}
        </section>

        <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
          <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">提交摘要</h4>
          {report.submission ? (
            <dl className="mt-3 grid gap-3 text-sm">
              <div><dt className="font-semibold text-[var(--cma-muted)]">提交时间</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.submission.submittedAt)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">提交人</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{actorLabel(report.submission.submittedBy)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">提交说明</dt><dd className="mt-1 whitespace-pre-wrap text-[var(--cma-text-strong)]">{report.submission.submissionNote?.trim() || '—'}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">技术追溯号</dt><dd className="mt-1 break-all text-[var(--cma-muted)]">{traceId(report.submission.submissionId)}</dd></div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-[var(--cma-muted)]">尚未提交待确认。</p>
          )}
        </section>

        <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
          <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">确认摘要</h4>
          {report.confirmation ? (
            <dl className="mt-3 grid gap-3 text-sm">
              <div><dt className="font-semibold text-[var(--cma-muted)]">确认时间</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.confirmation.confirmedAt)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">确认人</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{report.confirmation.confirmedByName?.trim() || '—'}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">确认角色</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{report.confirmation.confirmedByRole ? clinicalReportConfirmationRoleLabels[report.confirmation.confirmedByRole] : '—'}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">确认意见</dt><dd className="mt-1 whitespace-pre-wrap text-[var(--cma-text-strong)]">{report.confirmation.confirmationNote?.trim() || '—'}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">技术追溯号</dt><dd className="mt-1 break-all text-[var(--cma-muted)]">{traceId(report.confirmation.confirmationId)}</dd></div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-[var(--cma-muted)]">尚未完成最终确认。</p>
          )}
        </section>

        <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
          <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">锁定摘要</h4>
          {report.lock ? (
            <dl className="mt-3 grid gap-3 text-sm">
              <div><dt className="font-semibold text-[var(--cma-muted)]">锁定时间</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.lock.lockedAt)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">锁定人</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{actorLabel(report.lock.lockedBy)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">锁定流程说明</dt><dd className="mt-1 whitespace-pre-wrap text-[var(--cma-text-strong)]">{report.lock.lockNote?.trim() || '—'}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">技术追溯号</dt><dd className="mt-1 break-all text-[var(--cma-muted)]">{traceId(report.lock.lockId)}</dd></div>
            </dl>
          ) : report.lockedAt ? (
            <p className="mt-3 text-sm leading-6 text-[var(--cma-muted)]">
              报告已锁定，但当前安全响应未提供完整锁定审计摘要；系统不会猜测锁定人或说明。
            </p>
          ) : (
            <p className="mt-3 text-sm text-[var(--cma-muted)]">尚未锁定。</p>
          )}
        </section>

        <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
          <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">来源冻结摘要</h4>
          {report.sourceFreeze ? (
            <dl className="mt-3 grid gap-3 text-sm">
              <div><dt className="font-semibold text-[var(--cma-muted)]">状态</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{clinicalReportSourceFreezeStateLabels[report.sourceFreeze.state]}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">开始 / 完成时间</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.sourceFreeze.startedAt)} / {formatClinicalReportDate(report.sourceFreeze.completedAt)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">发起 / 完成人</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{actorLabel(report.sourceFreeze.startedBy)} / {actorLabel(report.sourceFreeze.completedBy)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">流程说明</dt><dd className="mt-1 whitespace-pre-wrap text-[var(--cma-text-strong)]">{report.sourceFreeze.freezeNote}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">技术追溯号</dt><dd className="mt-1 break-all text-[var(--cma-muted)]">{report.sourceFreeze.freezeId}</dd></div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-[var(--cma-muted)]">报告来源尚未冻结。</p>
          )}
        </section>

        <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
          <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">归档摘要</h4>
          {report.archive ? (
            <dl className="mt-3 grid gap-3 text-sm">
              <div><dt className="font-semibold text-[var(--cma-muted)]">归档时间</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.archive.archivedAt)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">归档人</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{actorLabel(report.archive.archivedBy)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">归档流程说明</dt><dd className="mt-1 whitespace-pre-wrap text-[var(--cma-text-strong)]">{report.archive.archiveNote?.trim() || '—'}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">归档追溯号</dt><dd className="mt-1 break-all text-[var(--cma-muted)]">{traceId(report.archive.archiveId)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">来源冻结锚点</dt><dd className="mt-1 break-all text-[var(--cma-muted)]">{traceId(report.archive.sourceFreezeId)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">锚定完成时间</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.archive.sourceFreezeCompletedAt)}</dd></div>
            </dl>
          ) : report.archivedAt ? (
            <p className="mt-3 text-sm leading-6 text-[var(--cma-muted)]">
              顶层 archivedAt 已存在，但当前安全响应未提供完整归档摘要。
            </p>
          ) : (
            <p className="mt-3 text-sm text-[var(--cma-muted)]">尚未归档。</p>
          )}
        </section>
      </div>

      {lockWarning ? (
        <p
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-sm leading-6 text-[var(--cma-warning)]"
          role="alert"
        >
          {lockWarning}
        </p>
      ) : null}

      {workflow.editReceipt ? (
        <p aria-live="polite" className="text-sm leading-6 text-[var(--cma-muted)]">
          本次编辑回执：{formatClinicalReportDate(workflow.editReceipt.editedAt)}；编辑人 {actorLabel(workflow.editReceipt.editedBy)}；变化字段 {workflow.editReceipt.changedFields.map((field) => changedFieldLabels[field]).join('、')}；技术追溯号 {traceId(workflow.editReceipt.eventId)}；本次审计说明：{workflow.editReceipt.editNote}
        </p>
      ) : null}
      {workflow.submissionReceipt ? (
        <p aria-live="polite" className="text-sm leading-6 text-[var(--cma-muted)]">
          本次提交回执：{workflow.submissionReceipt.alreadySubmitted ? '此前已提交，本次未重复写入' : '首次提交成功'}；{formatClinicalReportDate(workflow.submissionReceipt.submittedAt)}；提交人 {actorLabel(workflow.submissionReceipt.submittedBy)}；提交说明 {workflow.submissionReceipt.submissionNote?.trim() || '—'}；技术追溯号 {traceId(workflow.submissionReceipt.submissionId)}。
        </p>
      ) : null}
      {workflow.confirmationReceipt ? (
        <p aria-live="polite" className="text-sm leading-6 text-[var(--cma-muted)]">
          本次确认回执：{workflow.confirmationReceipt.alreadyConfirmed ? '此前已确认，本次未重复写入' : '首次确认成功'}；{formatClinicalReportDate(workflow.confirmationReceipt.confirmedAt)}；确认人 {actorLabel(workflow.confirmationReceipt.confirmedBy)}；确认意见 {workflow.confirmationReceipt.confirmationNote?.trim() || '—'}；技术追溯号 {traceId(workflow.confirmationReceipt.confirmationId)}。
        </p>
      ) : null}
      {workflow.lockReceipt ? (
        <p aria-live="polite" className="text-sm leading-6 text-[var(--cma-muted)]">
          本次锁定回执：{workflow.lockReceipt.alreadyLocked ? '此前已锁定，本次未重复写入' : '首次不可逆锁定成功'}；{formatClinicalReportDate(workflow.lockReceipt.lockedAt)}；锁定人 {actorLabel(workflow.lockReceipt.lockedBy)}；锁定流程说明 {workflow.lockReceipt.lockNote?.trim() || '—'}；技术追溯号 {traceId(workflow.lockReceipt.lockId)}。
        </p>
      ) : null}
      {workflow.sourceFreezeReceipt ? (
        <p aria-live="polite" className="text-sm leading-6 text-[var(--cma-muted)]">
          本次来源冻结回执：{workflow.sourceFreezeReceipt.alreadyFrozen ? '此前已冻结，本次未重复写入' : workflow.sourceFreezeReceipt.resumedExisting ? '既有流程已恢复并完成' : '首次来源冻结完成'}；开始 {formatClinicalReportDate(workflow.sourceFreezeReceipt.startedAt)}；完成 {formatClinicalReportDate(workflow.sourceFreezeReceipt.completedAt)}；发起人 {actorLabel(workflow.sourceFreezeReceipt.startedBy)}；完成人 {actorLabel(workflow.sourceFreezeReceipt.completedBy)}；技术追溯号 {workflow.sourceFreezeReceipt.freezeId}；expected / completed / newly / previously 合计 {workflow.sourceFreezeReceipt.expectedCounts.totalSourceCount} / {workflow.sourceFreezeReceipt.completedCounts.totalSourceCount} / {workflow.sourceFreezeReceipt.newlyFrozenCounts.totalSourceCount} / {workflow.sourceFreezeReceipt.previouslyFrozenCounts.totalSourceCount}。
        </p>
      ) : null}
      {workflow.archiveReceipt ? (
        <p aria-live="polite" className="text-sm leading-6 text-[var(--cma-muted)]">
          本次归档回执：{workflow.archiveReceipt.alreadyArchived ? '此前已归档，本次未重复写入' : '首次归档成功'}；{formatClinicalReportDate(workflow.archiveReceipt.archivedAt)}；归档人 {actorLabel(workflow.archiveReceipt.archivedBy)}；归档流程说明 {workflow.archiveReceipt.archiveNote?.trim() || '—'}；归档追溯号 {traceId(workflow.archiveReceipt.archiveId)}；来源冻结锚点 {traceId(workflow.archiveReceipt.sourceFreezeId)}；锚定完成时间 {formatClinicalReportDate(workflow.archiveReceipt.sourceFreezeCompletedAt)}；alreadyArchived={workflow.archiveReceipt.alreadyArchived ? 'true' : 'false'}。
        </p>
      ) : null}
    </section>
  );
}
