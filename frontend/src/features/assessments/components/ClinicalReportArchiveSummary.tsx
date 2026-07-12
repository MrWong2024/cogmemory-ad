import {
  clinicalReportOperatorRoleLabels,
  formatClinicalReportDate,
} from '@/src/features/assessments/lib/clinical-report-display';
import {
  getClinicalReportArchiveConsistencyWarning,
  isClinicalReportArchived,
} from '@/src/features/assessments/lib/clinical-report-archive-draft';
import type {
  ArchiveClinicalReportReceipt,
  ClinicalReport,
  ClinicalReportWorkflowActor,
} from '@/src/features/assessments/types/clinical-report';

function actorLabel(actor: ClinicalReportWorkflowActor): string {
  const name = actor.operatorName?.trim() || '未提供姓名';
  const role = actor.operatorRole
    ? clinicalReportOperatorRoleLabels[actor.operatorRole]
    : '未提供角色';
  return `${name}（${role}）`;
}

function displayValue(value: string | null | undefined): string {
  return value?.trim() || '未在当前安全响应中提供';
}

function ArchiveDetails({
  archive,
}: {
  archive: NonNullable<ClinicalReport['archive']>;
}) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <dt className="font-semibold text-[var(--cma-muted)]">归档追溯号</dt>
        <dd className="mt-1 break-all text-[var(--cma-text-strong)]">
          {displayValue(archive.archiveId)}
        </dd>
      </div>
      <div>
        <dt className="font-semibold text-[var(--cma-muted)]">归档时间</dt>
        <dd className="mt-1 text-[var(--cma-text-strong)]">
          {formatClinicalReportDate(archive.archivedAt)}
        </dd>
      </div>
      <div>
        <dt className="font-semibold text-[var(--cma-muted)]">归档人 / 角色</dt>
        <dd className="mt-1 text-[var(--cma-text-strong)]">
          {actorLabel(archive.archivedBy)}
        </dd>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <dt className="font-semibold text-[var(--cma-muted)]">
          归档流程说明
        </dt>
        <dd className="mt-1 whitespace-pre-wrap text-[var(--cma-text-strong)]">
          {displayValue(archive.archiveNote)}
        </dd>
      </div>
      <div>
        <dt className="font-semibold text-[var(--cma-muted)]">来源冻结锚点</dt>
        <dd className="mt-1 break-all text-[var(--cma-text-strong)]">
          {displayValue(archive.sourceFreezeId)}
        </dd>
      </div>
      <div>
        <dt className="font-semibold text-[var(--cma-muted)]">
          锚定的来源冻结完成时间
        </dt>
        <dd className="mt-1 text-[var(--cma-text-strong)]">
          {formatClinicalReportDate(archive.sourceFreezeCompletedAt)}
        </dd>
      </div>
    </dl>
  );
}

function ReceiptSummary({
  receipt,
}: {
  receipt: ArchiveClinicalReportReceipt;
}) {
  return (
    <section className="grid gap-4 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-success-soft)] p-4">
      <div>
        <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
          当前页面会话归档回执
        </h4>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          {receipt.alreadyArchived
            ? '该报告此前已经归档，本次未重复写入。'
            : '报告已完成首次归档。'}
          回执刷新后消失；持久事实始终来自 report.status、report.archivedAt 与 report.archive。
        </p>
      </div>
      <ArchiveDetails archive={receipt} />
      <p className="text-sm font-semibold text-[var(--cma-text-strong)]">
        alreadyArchived={receipt.alreadyArchived ? 'true' : 'false'}
      </p>
    </section>
  );
}

export function ClinicalReportArchiveSummary({
  receipt,
  report,
}: {
  receipt: ArchiveClinicalReportReceipt | null;
  report: ClinicalReport;
}) {
  const warning = getClinicalReportArchiveConsistencyWarning(report);
  const archived = isClinicalReportArchived(report);
  const historical = report.archive?.archiveId === null && archived && !warning;

  return (
    <section
      aria-labelledby="clinical-report-archive-summary-heading"
      className="grid gap-4 rounded-md border border-[var(--cma-line)] p-4"
    >
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-archive-summary-heading"
        >
          归档安全摘要
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          status 是生命周期状态，archivedAt 是顶层归档时间，archive 是安全审计摘要；三者不会互相替代。
        </p>
      </div>

      {warning ? (
        <p
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-warning)]"
          role="alert"
        >
          归档状态或安全审计摘要不完整，请联系管理员核对。{warning}
        </p>
      ) : null}

      {warning && !archived ? (
        <p className="text-base leading-7 text-[var(--cma-muted)]">
          当前不能根据不完整或不一致的 archive 字段单独认定完整归档，也不会自动修复归档事实。
        </p>
      ) : !archived ? (
        <p className="text-base text-[var(--cma-muted)]">报告尚未归档。</p>
      ) : report.archive ? (
        <div className="grid gap-4 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
          <div>
            <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
              {historical ? '历史归档记录' : '报告已归档'}
            </h4>
            {historical ? (
              <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
                部分归档审计字段未在当前安全响应中提供；系统不会猜测归档说明、操作者或来源冻结锚点。
              </p>
            ) : null}
          </div>
          <ArchiveDetails archive={report.archive} />
        </div>
      ) : (
        <p className="text-base leading-7 text-[var(--cma-muted)]">
          报告已存在归档状态与时间，但安全归档摘要不可用；系统不会猜测归档人或追溯信息。
        </p>
      )}

      {receipt ? <ReceiptSummary receipt={receipt} /> : null}
    </section>
  );
}
