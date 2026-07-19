import Link from 'next/link';

import { Badge, type BadgeTone } from '@/src/components/ui/Badge';
import {
  clinicalHistoryAdministrationModeLabels,
  formatHistoryDuration,
  formatHistoryNumber,
  formatHistoryPercent,
  historyAvailabilityLabels,
  historyAvailabilityTones,
  historyReportSummaryLabels,
  patientHistoryQualityStatusLabels,
  patientHistoryReportStatusLabels,
  patientHistoryScoreStatusLabels,
} from '@/src/features/patients/lib/clinical-history-display';
import {
  assessmentVisitStatusLabels,
  assessmentVisitTypeLabels,
  formatDateTime,
} from '@/src/features/patients/lib/patient-display';
import type {
  PatientAssessmentHistoryItem,
  PatientHistoryReportSummary,
  PatientHistoryScaleSummary,
} from '@/src/features/patients/types/clinical-history';
import type { AssessmentVisitStatus } from '@/src/features/patients/types/patient';

const secondaryLinkClassName =
  'inline-flex min-h-9 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-1.5 text-sm font-semibold text-[var(--cma-text-strong)] transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

const visitStatusTones: Record<AssessmentVisitStatus, BadgeTone> = {
  draft: 'neutral',
  in_progress: 'info',
  completed: 'success',
  locked: 'warning',
  voided: 'warning',
};

function ScaleSummary({ summary }: { summary: PatientHistoryScaleSummary }) {
  return (
    <section className="grid gap-4 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
            {summary.scaleCode} / {summary.scaleVersion}
          </h4>
          <p className="mt-1 text-sm text-[var(--cma-muted)]">
            实例编号：{summary.instanceCode}
          </p>
        </div>
        <Badge tone={visitStatusTones[summary.status]}>
          {assessmentVisitStatusLabels[summary.status]}
        </Badge>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">施测方式</dt>
          <dd className="mt-1 text-[var(--cma-text-strong)]">
            {clinicalHistoryAdministrationModeLabels[
              summary.administrationMode
            ]}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">用时</dt>
          <dd className="mt-1 text-[var(--cma-text-strong)]">
            {formatHistoryDuration(summary.durationMs)}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">开始时间</dt>
          <dd className="mt-1 text-[var(--cma-text-strong)]">
            {formatDateTime(summary.startedAt)}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">完成时间</dt>
          <dd className="mt-1 text-[var(--cma-text-strong)]">
            {formatDateTime(summary.completedAt)}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">锁定时间</dt>
          <dd className="mt-1 text-[var(--cma-text-strong)]">
            {formatDateTime(summary.lockedAt)}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">作废时间</dt>
          <dd className="mt-1 text-[var(--cma-text-strong)]">
            {formatDateTime(summary.voidedAt)}
          </dd>
        </div>
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4">
          <h5 className="font-semibold text-[var(--cma-text-strong)]">
            总分摘要
          </h5>
          {summary.scoreSummary ? (
            <div className="mt-3 grid gap-3">
              <Badge
                tone={
                  historyAvailabilityTones[summary.scoreSummary.availability]
                }
              >
                {historyAvailabilityLabels[summary.scoreSummary.availability]}
              </Badge>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">
                    状态 / 质量
                  </dt>
                  <dd className="mt-1">
                    {patientHistoryScoreStatusLabels[
                      summary.scoreSummary.status
                    ]}{' '}
                    /{' '}
                    {patientHistoryQualityStatusLabels[
                      summary.scoreSummary.qualityStatus
                    ]}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">
                    总分 / 范围
                  </dt>
                  <dd className="mt-1">
                    {formatHistoryNumber(
                      summary.scoreSummary.totalScoreValue,
                    )}{' '}
                    / {formatHistoryNumber(summary.scoreSummary.totalMinScore)}–
                    {formatHistoryNumber(summary.scoreSummary.totalMaxScore)}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">
                    得分比例
                  </dt>
                  <dd className="mt-1">
                    {formatHistoryPercent(summary.scoreSummary.scorePercent)}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">
                    确认 / 锁定
                  </dt>
                  <dd className="mt-1">
                    {formatDateTime(summary.scoreSummary.confirmedAt)} /{' '}
                    {formatDateTime(summary.scoreSummary.lockedAt)}
                  </dd>
                </div>
              </dl>
              <p className="text-sm leading-6 text-[var(--cma-muted)]">
                得分比例来自后端最终结果，不是疾病概率。
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--cma-muted)]">
              暂无绑定的总分结果。
            </p>
          )}
        </section>

        <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4">
          <h5 className="font-semibold text-[var(--cma-text-strong)]">
            认知域摘要
          </h5>
          {summary.domainSummary ? (
            <div className="mt-3 grid gap-3">
              <Badge
                tone={
                  historyAvailabilityTones[summary.domainSummary.availability]
                }
              >
                {historyAvailabilityLabels[summary.domainSummary.availability]}
              </Badge>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">
                    状态 / 质量
                  </dt>
                  <dd className="mt-1">
                    {patientHistoryScoreStatusLabels[
                      summary.domainSummary.status
                    ]}{' '}
                    /{' '}
                    {patientHistoryQualityStatusLabels[
                      summary.domainSummary.qualityStatus
                    ]}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">
                    映射版本
                  </dt>
                  <dd className="mt-1">
                    {summary.domainSummary.mappingVersion || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">
                    认知域数量
                  </dt>
                  <dd className="mt-1">
                    {summary.domainSummary.availability === 'available'
                      ? summary.domainSummary.domainCount
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">
                    计算时间
                  </dt>
                  <dd className="mt-1">
                    {formatDateTime(summary.domainSummary.computedAt)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--cma-muted)]">
              暂无精确绑定的认知域结果。
            </p>
          )}
        </section>
      </div>
    </section>
  );
}

function ReportSummary({
  patientId,
  summary,
  visitId,
}: {
  patientId: string;
  summary: PatientHistoryReportSummary;
  visitId: string;
}) {
  const pointersAreSame =
    summary.latest !== null &&
    summary.latestArchivedVersion !== null &&
    summary.latest.id === summary.latestArchivedVersion.id;

  return (
    <section className="grid gap-4 rounded-md border border-[var(--cma-line)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
          临床报告摘要
        </h4>
        <Badge
          tone={
            summary.status === 'available'
              ? 'success'
              : summary.status === 'incomplete'
                ? 'warning'
                : 'neutral'
          }
        >
          {historyReportSummaryLabels[summary.status]}
        </Badge>
      </div>
      <p className="text-sm text-[var(--cma-muted)]">
        报告版本总数：{summary.totalVersions}
      </p>
      {summary.status === 'incomplete' ? (
        <p
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-sm leading-6 text-[var(--cma-warning)]"
          role="status"
        >
          报告历史关系不完整；页面只展示后端已安全确认的公开指针，不推测缺失版本或内部关系。
        </p>
      ) : null}
      {summary.latest ? (
        <div className="grid gap-2 rounded-md bg-[var(--cma-surface-muted)] p-3 text-sm">
          <p className="font-semibold text-[var(--cma-text-strong)]">
            最新版本：{summary.latest.reportCode} / V
            {summary.latest.reportVersion}
          </p>
          <p className="text-[var(--cma-muted)]">
            {patientHistoryReportStatusLabels[summary.latest.status]} · 创建于{' '}
            {formatDateTime(summary.latest.createdAt)}
          </p>
          <Link
            className={secondaryLinkClassName}
            href={`/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/clinical-reports/${encodeURIComponent(summary.latest.id)}`}
          >
            查看最新版本详情
          </Link>
        </div>
      ) : null}
      {summary.latestArchivedVersion && !pointersAreSame ? (
        <div className="grid gap-2 rounded-md bg-[var(--cma-surface-muted)] p-3 text-sm">
          <p className="font-semibold text-[var(--cma-text-strong)]">
            最近正式归档版本：
            {summary.latestArchivedVersion.reportCode} / V
            {summary.latestArchivedVersion.reportVersion}
          </p>
          <p className="text-[var(--cma-muted)]">
            {patientHistoryReportStatusLabels[
              summary.latestArchivedVersion.status
            ]}{' '}
            · 归档于{' '}
            {formatDateTime(summary.latestArchivedVersion.archivedAt)}
          </p>
          <Link
            className={secondaryLinkClassName}
            href={`/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/clinical-reports/${encodeURIComponent(summary.latestArchivedVersion.id)}`}
          >
            查看最近正式归档版本
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function HistoryItem({
  item,
  patientId,
}: {
  item: PatientAssessmentHistoryItem;
  patientId: string;
}) {
  const { visit } = item;

  return (
    <article className="grid gap-5 border-b border-[var(--cma-line)] p-5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
            {visit.visitCode}
          </h3>
          <p className="mt-1 text-sm text-[var(--cma-muted)]">
            {assessmentVisitTypeLabels[visit.visitType]} · 评估时间{' '}
            {formatDateTime(visit.assessmentDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={visitStatusTones[visit.status]}>
            {assessmentVisitStatusLabels[visit.status]}
          </Badge>
          <Link
            className={secondaryLinkClassName}
            href={`/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visit.id)}`}
          >
            打开访视
          </Link>
        </div>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">开始时间</dt>
          <dd className="mt-1">{formatDateTime(visit.startedAt)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">完成时间</dt>
          <dd className="mt-1">{formatDateTime(visit.completedAt)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">锁定时间</dt>
          <dd className="mt-1">{formatDateTime(visit.lockedAt)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--cma-muted)]">作废时间</dt>
          <dd className="mt-1">{formatDateTime(visit.voidedAt)}</dd>
        </div>
      </dl>

      <section className="grid gap-3" aria-label={`${visit.visitCode} 量表摘要`}>
        <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
          量表摘要（{item.scaleSummaries.length}）
        </h4>
        {item.scaleSummaries.length > 0 ? (
          item.scaleSummaries.map((summary) => (
            <ScaleSummary key={summary.scaleInstanceId} summary={summary} />
          ))
        ) : (
          <p className="rounded-md bg-[var(--cma-surface-muted)] p-4 text-sm text-[var(--cma-muted)]">
            该访视没有量表摘要。
          </p>
        )}
      </section>

      <ReportSummary
        patientId={patientId}
        summary={item.reportSummary}
        visitId={visit.id}
      />
    </article>
  );
}

export function AssessmentHistoryList({
  items,
  patientId,
}: {
  items: PatientAssessmentHistoryItem[];
  patientId: string;
}) {
  return (
    <div>
      {items.map((item) => (
        <HistoryItem
          item={item}
          key={item.visit.id}
          patientId={patientId}
        />
      ))}
    </div>
  );
}
