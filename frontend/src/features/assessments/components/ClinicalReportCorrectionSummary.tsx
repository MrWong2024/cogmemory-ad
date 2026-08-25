import {
  clinicalReportOperatorRoleLabels,
  clinicalReportStatusLabels,
  formatClinicalReportDate,
} from '@/src/features/assessments/lib/clinical-report-display';
import type {
  ClinicalReport,
  ClinicalReportWorkflowActor,
  CreateClinicalReportCorrectionReceipt,
} from '@/src/features/assessments/types/clinical-report';

function actorLabel(actor: ClinicalReportWorkflowActor | null): string {
  if (!actor) return '—';
  const name = actor.operatorName?.trim() || '未提供姓名';
  return `${name}${
    actor.operatorRole
      ? `（${clinicalReportOperatorRoleLabels[actor.operatorRole]}）`
      : ''
  }`;
}

function TraceValue({ children }: { children: string | number | null }) {
  return (
    <dd className="mt-1 break-all text-sm text-[var(--cma-text-strong)]">
      {children ?? '—'}
    </dd>
  );
}

export function ClinicalReportCorrectionSummary({
  report,
  sourceReport,
  receipt,
}: {
  report: ClinicalReport;
  sourceReport: ClinicalReport | null;
  receipt: CreateClinicalReportCorrectionReceipt | null;
}) {
  const source = report.correction ? report : sourceReport;
  const correction = source?.correction ?? null;
  const lineage = report.replacementOf;
  if (!correction && !lineage && !receipt) return null;

  return (
    <section
      aria-labelledby="clinical-report-correction-summary-heading"
      className="grid gap-5 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4"
    >
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-correction-summary-heading"
        >
          报告更正版本
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          原归档报告会作为独立历史记录保留；更正报告形成下一版本，不会覆盖、删除或直接修改原报告。
        </p>
      </div>

      {receipt ? (
        <p
          aria-live="polite"
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-success-soft)] px-4 py-3 text-sm leading-6 text-[var(--cma-success)]"
        >
          第 {receipt.correctionNo} 次更正：
          {receipt.alreadyCreated
            ? '更正版本此前已经创建，本次未重复创建。'
            : receipt.resumedExisting
              ? '原有更正流程已继续并完成。'
              : '下一版本已经创建。'}
        </p>
      ) : null}

      {source && correction ? (
        <div className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4">
          <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
            原报告
          </h4>
          <dl className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">报告版本</dt><TraceValue>{`V${source.reportVersion}`}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">状态</dt><TraceValue>{clinicalReportStatusLabels[source.status]}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">更正状态</dt><TraceValue>{correction.state === 'completed' ? '更正版本已生成' : '更正处理中'}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">更正序号</dt><TraceValue>{correction.correctionNo}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">上一版本</dt><TraceValue>{`V${correction.previousReportVersion}`}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">更正版本</dt><TraceValue>{`V${correction.replacementReportVersion}`}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">开始</dt><TraceValue>{formatClinicalReportDate(correction.startedAt)}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">发起人</dt><TraceValue>{actorLabel(correction.startedBy)}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">完成</dt><TraceValue>{formatClinicalReportDate(correction.completedAt)}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">完成人</dt><TraceValue>{actorLabel(correction.completedBy)}</TraceValue></div>
            <div className="sm:col-span-2"><dt className="text-sm font-semibold text-[var(--cma-muted)]">更正原因</dt><TraceValue>{correction.correctionReason}</TraceValue></div>
            <div className="sm:col-span-2"><dt className="text-sm font-semibold text-[var(--cma-muted)]">计划变更摘要</dt><TraceValue>{correction.changeSummary}</TraceValue></div>
          </dl>
        </div>
      ) : null}

      {lineage ? (
        <div className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4">
          <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
            当前更正报告
          </h4>
          <dl className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">报告版本</dt><TraceValue>{`V${report.reportVersion}`}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">状态</dt><TraceValue>{clinicalReportStatusLabels[report.status]}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">原报告版本</dt><TraceValue>{`V${lineage.previousReportVersion}`}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">更正序号</dt><TraceValue>{lineage.correctionNo}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">创建时间</dt><TraceValue>{formatClinicalReportDate(lineage.createdAt)}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">创建人</dt><TraceValue>{actorLabel(lineage.createdBy)}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">来源归档时间</dt><TraceValue>{formatClinicalReportDate(lineage.sourceArchivedAt)}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">报告依据固定完成</dt><TraceValue>{formatClinicalReportDate(lineage.sourceFreezeCompletedAt)}</TraceValue></div>
            <div className="sm:col-span-2"><dt className="text-sm font-semibold text-[var(--cma-muted)]">更正原因</dt><TraceValue>{lineage.correctionReason}</TraceValue></div>
            <div className="sm:col-span-2"><dt className="text-sm font-semibold text-[var(--cma-muted)]">计划变更摘要</dt><TraceValue>{lineage.changeSummary}</TraceValue></div>
          </dl>
        </div>
      ) : null}
    </section>
  );
}
