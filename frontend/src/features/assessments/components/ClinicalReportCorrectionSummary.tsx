import {
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
  return `${name}${actor.operatorRole ? `（${actor.operatorRole}）` : ''}`;
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
          版本化更正与线性来源关系
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          原归档报告保持为独立历史记录；替代报告是下一线性版本，不是覆盖、删除或原地修改。
        </p>
      </div>

      {receipt ? (
        <p
          aria-live="polite"
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-success-soft)] px-4 py-3 text-sm leading-6 text-[var(--cma-success)]"
        >
          更正回执：No. {receipt.correctionNo}，
          {receipt.alreadyCreated
            ? '替代报告此前已经创建，本次未重复写入。'
            : receipt.resumedExisting
              ? '既有更正流程已恢复并完成。'
              : '下一线性版本已经创建。'}
        </p>
      ) : null}

      {source && correction ? (
        <div className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4">
          <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
            来源报告
          </h4>
          <dl className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">报告 / 版本</dt><TraceValue>{`${source.reportCode} / V${source.reportVersion}`}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">状态</dt><TraceValue>{`${clinicalReportStatusLabels[source.status]}（${source.status}）`}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">更正状态</dt><TraceValue>{correction.state}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">更正序号</dt><TraceValue>{correction.correctionNo}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">上一版本</dt><TraceValue>{`${correction.previousReportCode} / V${correction.previousReportVersion}`}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">替代版本</dt><TraceValue>{`${correction.replacementReportCode} / V${correction.replacementReportVersion}`}</TraceValue></div>
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
            当前替代报告
          </h4>
          <dl className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">报告 / 版本</dt><TraceValue>{`${report.reportCode} / V${report.reportVersion}`}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">状态</dt><TraceValue>{`${clinicalReportStatusLabels[report.status]}（${report.status}）`}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">来源报告 / 版本</dt><TraceValue>{`${lineage.previousReportCode} / V${lineage.previousReportVersion}`}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">更正序号</dt><TraceValue>{lineage.correctionNo}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">创建时间</dt><TraceValue>{formatClinicalReportDate(lineage.createdAt)}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">创建人</dt><TraceValue>{actorLabel(lineage.createdBy)}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">来源归档时间</dt><TraceValue>{formatClinicalReportDate(lineage.sourceArchivedAt)}</TraceValue></div>
            <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">来源冻结完成</dt><TraceValue>{formatClinicalReportDate(lineage.sourceFreezeCompletedAt)}</TraceValue></div>
            <div className="sm:col-span-2"><dt className="text-sm font-semibold text-[var(--cma-muted)]">更正原因</dt><TraceValue>{lineage.correctionReason}</TraceValue></div>
            <div className="sm:col-span-2"><dt className="text-sm font-semibold text-[var(--cma-muted)]">计划变更摘要</dt><TraceValue>{lineage.changeSummary}</TraceValue></div>
          </dl>
          <p className="mt-3 text-sm leading-6 text-[var(--cma-muted)]">
            内部关联标识由系统保存，不在页面展示；页面仅呈现临床可理解的版本、时间、操作者、原因与摘要。
          </p>
        </div>
      ) : null}
    </section>
  );
}
