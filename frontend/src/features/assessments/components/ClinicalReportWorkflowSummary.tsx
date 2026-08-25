import type { UseClinicalReportWorkflowValue } from '@/src/features/assessments/hooks/useClinicalReportWorkflow';
import {
  clinicalReportConfirmationRoleLabels,
  clinicalReportOperatorRoleLabels,
  formatClinicalReportDate,
  getClinicalReportLockConsistencyWarning,
} from '@/src/features/assessments/lib/clinical-report-display';
import { getClinicalReportLifecycleTarget } from '@/src/features/assessments/lib/clinical-report-lifecycle-target';
import type {
  ClinicalReport,
  ClinicalReportChangedField,
  ClinicalReportReviewActor,
} from '@/src/features/assessments/types/clinical-report';

const changedFieldLabels: Record<ClinicalReportChangedField, string> = {
  doctorOpinion: '医生意见',
  recommendationText: '临床人员补充建议',
};

function actorLabel(actor: ClinicalReportReviewActor | null): string {
  if (!actor) return '—';
  const name = actor.operatorName?.trim() || '未提供姓名';
  const role = actor.operatorRole
    ? clinicalReportOperatorRoleLabels[actor.operatorRole]
    : '未提供角色';
  return `${name}（${role}）`;
}

export function ClinicalReportWorkflowSummary({
  report,
  workflow,
}: {
  report: ClinicalReport;
  workflow: UseClinicalReportWorkflowValue;
}) {
  const lockWarning = getClinicalReportLockConsistencyWarning(report);
  const lifecycleTarget = getClinicalReportLifecycleTarget(report);

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
          报告处理摘要
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          当前为 V{report.reportVersion} 报告。这里展示医护人员需要了解的处理状态和本次操作结果。
        </p>
      </div>

      {report.replacementOf ? (
        <p className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] px-4 py-3 text-sm leading-6 text-[var(--cma-muted)]">
          {lifecycleTarget?.kind === 'replacement'
            ? `当前为更正生成的 V${report.reportVersion} 报告；下方编辑、提交、确认、锁定、固定报告依据和归档状态均属于当前版本。每个不可逆阶段仍按自身前置条件开放。`
            : '当前报告的版本关系信息不完整或不一致；为避免误操作，当前不会开放不可逆处理。'}
        </p>
      ) : null}

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
            </dl>
          ) : report.lockedAt ? (
            <p className="mt-3 text-sm leading-6 text-[var(--cma-muted)]">
              报告已锁定，但当前没有完整的锁定操作摘要；系统不会猜测锁定人或说明。
            </p>
          ) : (
            <p className="mt-3 text-sm text-[var(--cma-muted)]">尚未锁定。</p>
          )}
        </section>

        <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
          <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">报告依据固定摘要</h4>
          {report.sourceFreeze ? (
            <dl className="mt-3 grid gap-3 text-sm">
              <div><dt className="font-semibold text-[var(--cma-muted)]">状态</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{report.sourceFreeze.state === 'completed' ? '报告依据已固定' : '正在固定报告依据'}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">开始 / 完成时间</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.sourceFreeze.startedAt)} / {formatClinicalReportDate(report.sourceFreeze.completedAt)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">发起 / 完成人</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{actorLabel(report.sourceFreeze.startedBy)} / {actorLabel(report.sourceFreeze.completedBy)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">处理说明</dt><dd className="mt-1 whitespace-pre-wrap text-[var(--cma-text-strong)]">{report.sourceFreeze.freezeNote}</dd></div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-[var(--cma-muted)]">报告所依据的评估资料尚未固定。</p>
          )}
        </section>

        <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
          <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">归档摘要</h4>
          {report.archive ? (
            <dl className="mt-3 grid gap-3 text-sm">
              <div><dt className="font-semibold text-[var(--cma-muted)]">归档时间</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.archive.archivedAt)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">归档人</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{actorLabel(report.archive.archivedBy)}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">归档说明</dt><dd className="mt-1 whitespace-pre-wrap text-[var(--cma-text-strong)]">{report.archive.archiveNote?.trim() || '—'}</dd></div>
              <div><dt className="font-semibold text-[var(--cma-muted)]">报告依据固定完成时间</dt><dd className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.archive.sourceFreezeCompletedAt)}</dd></div>
            </dl>
          ) : report.archivedAt ? (
            <p className="mt-3 text-sm leading-6 text-[var(--cma-muted)]">
              报告已经归档，但当前没有完整的归档操作摘要。
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
          本次编辑已保存：{formatClinicalReportDate(workflow.editReceipt.editedAt)}；编辑人 {actorLabel(workflow.editReceipt.editedBy)}；修改内容 {workflow.editReceipt.changedFields.map((field) => changedFieldLabels[field]).join('、')}；编辑说明：{workflow.editReceipt.editNote}
        </p>
      ) : null}
      {workflow.submissionReceipt ? (
        <p aria-live="polite" className="text-sm leading-6 text-[var(--cma-muted)]">
          本次提交结果：{workflow.submissionReceipt.alreadySubmitted ? '此前已提交，本次未重复提交' : '提交成功'}；{formatClinicalReportDate(workflow.submissionReceipt.submittedAt)}；提交人 {actorLabel(workflow.submissionReceipt.submittedBy)}；提交说明 {workflow.submissionReceipt.submissionNote?.trim() || '—'}。
        </p>
      ) : null}
      {workflow.confirmationReceipt ? (
        <p aria-live="polite" className="text-sm leading-6 text-[var(--cma-muted)]">
          本次确认结果：{workflow.confirmationReceipt.alreadyConfirmed ? '此前已确认，本次未重复确认' : '确认成功'}；{formatClinicalReportDate(workflow.confirmationReceipt.confirmedAt)}；确认人 {actorLabel(workflow.confirmationReceipt.confirmedBy)}；确认意见 {workflow.confirmationReceipt.confirmationNote?.trim() || '—'}。
        </p>
      ) : null}
      {workflow.lockReceipt ? (
        <p aria-live="polite" className="text-sm leading-6 text-[var(--cma-muted)]">
          本次锁定结果：{workflow.lockReceipt.alreadyLocked ? '此前已锁定，本次未重复锁定' : '报告已锁定'}；{formatClinicalReportDate(workflow.lockReceipt.lockedAt)}；锁定人 {actorLabel(workflow.lockReceipt.lockedBy)}；锁定说明 {workflow.lockReceipt.lockNote?.trim() || '—'}。
        </p>
      ) : null}
      {workflow.sourceFreezeReceipt ? (
        <p aria-live="polite" className="text-sm leading-6 text-[var(--cma-muted)]">
          本次固定报告依据结果：{workflow.sourceFreezeReceipt.alreadyFrozen ? '此前已完成，本次未重复处理' : workflow.sourceFreezeReceipt.resumedExisting ? '已继续并完成原有流程' : '处理完成'}；开始 {formatClinicalReportDate(workflow.sourceFreezeReceipt.startedAt)}；完成 {formatClinicalReportDate(workflow.sourceFreezeReceipt.completedAt)}；发起人 {actorLabel(workflow.sourceFreezeReceipt.startedBy)}；完成人 {actorLabel(workflow.sourceFreezeReceipt.completedBy)}。
        </p>
      ) : null}
      {workflow.archiveReceipt ? (
        <p aria-live="polite" className="text-sm leading-6 text-[var(--cma-muted)]">
          本次归档结果：{workflow.archiveReceipt.alreadyArchived ? '此前已归档，本次未重复归档' : '归档成功'}；{formatClinicalReportDate(workflow.archiveReceipt.archivedAt)}；归档人 {actorLabel(workflow.archiveReceipt.archivedBy)}；归档说明 {workflow.archiveReceipt.archiveNote?.trim() || '—'}。
        </p>
      ) : null}
      {workflow.correctionReceipt ? (
        <p aria-live="polite" className="text-sm leading-6 text-[var(--cma-muted)]">
          本次更正结果：{workflow.correctionReceipt.alreadyCreated ? '更正版本此前已创建，本次未重复创建' : workflow.correctionReceipt.resumedExisting ? '已继续并完成原有更正流程' : '下一版本已创建'}；原版本 V{workflow.correctionReceipt.previousReportVersion}；更正版本 V{workflow.correctionReceipt.replacementReportVersion}。
        </p>
      ) : null}
    </section>
  );
}
