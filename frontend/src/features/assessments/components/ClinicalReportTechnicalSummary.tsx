import Link from 'next/link';

import {
  clinicalReportConfirmationRoleLabels,
  clinicalReportOperatorRoleLabels,
  clinicalReportQualityStatusLabels,
  clinicalReportSourceLabels,
  clinicalReportStatusLabels,
  clinicalReportTypeLabels,
  formatClinicalReportDate,
  getClinicalReportFinalityWarning,
  getClinicalReportLifecycleLabel,
  getClinicalReportLockConsistencyWarning,
} from '@/src/features/assessments/lib/clinical-report-display';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';

const mongoIdPattern = /^[a-f\d]{24}$/i;
const scaleLinkClassName =
  'inline-flex min-h-9 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-1.5 text-sm font-semibold text-[var(--cma-text-strong)] hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

function displayValue(value: string | null | undefined): string {
  return value?.trim() || '—';
}

export function ClinicalReportTechnicalSummary({
  patientId,
  report,
  visitId,
}: {
  patientId: string;
  report: ClinicalReport;
  visitId: string;
}) {
  const finalityWarning = getClinicalReportFinalityWarning(
    report.status,
    report.isFinal,
  );
  const lockConsistencyWarning = getClinicalReportLockConsistencyWarning(report);

  return (
    <div className="grid gap-5">
      <section
        aria-labelledby="clinical-report-generation-heading"
        className="rounded-md border border-[var(--cma-line)] p-4"
      >
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-generation-heading"
        >
          生成审计摘要
        </h3>
        {report.generation ? (
          <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                生成时间
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {formatClinicalReportDate(report.generation.generatedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                生成操作者
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {report.generation.generatedBy?.operatorName?.trim() || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                操作者角色
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {report.generation.generatedBy?.operatorRole
                  ? clinicalReportOperatorRoleLabels[
                      report.generation.generatedBy.operatorRole
                    ]
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                规则引擎版本
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {displayValue(report.generation.engineVersion)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                报告范围摘要
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {displayValue(report.generation.reportScope)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                纳入实例 / 评分 / 认知域
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {report.generation.includedScaleInstanceCount} /{' '}
                {report.generation.scoreResultCount} /{' '}
                {report.generation.cognitiveDomainResultCount}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                媒体证据索引数
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {report.generation.mediaEvidenceCount}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                AI 使用标记
              </dt>
              <dd className="mt-1 text-base font-semibold text-[var(--cma-text-strong)]">
                {report.generation.aiUsed
                  ? '公开摘要标记曾使用 AI（本页面不提供 AI 操作）'
                  : '本报告草稿未使用 AI'}
              </dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                技术追溯号
              </dt>
              <dd className="mt-1 break-all text-sm text-[var(--cma-muted)]">
                {displayValue(report.generation.generationId)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-base text-[var(--cma-muted)]">
            当前安全响应未提供完整生成审计摘要；系统不会从其他时间或操作者信息猜测缺失内容，也不会自行断言 AI 使用情况。
          </p>
        )}
      </section>

      <section
        aria-labelledby="clinical-report-confirmation-heading"
        className="rounded-md border border-[var(--cma-line)] p-4"
      >
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-confirmation-heading"
        >
          历史确认摘要
        </h3>
        {report.confirmation ? (
          <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                确认时间
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {formatClinicalReportDate(report.confirmation.confirmedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                确认人
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {displayValue(report.confirmation.confirmedByName)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                确认角色
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {report.confirmation.confirmedByRole
                  ? clinicalReportConfirmationRoleLabels[
                      report.confirmation.confirmedByRole
                    ]
                  : '—'}
              </dd>
            </div>
            <div className="sm:col-span-3">
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                公开确认说明
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-base leading-7 text-[var(--cma-text-strong)]">
                {displayValue(report.confirmation.confirmationNote)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-base text-[var(--cma-muted)]">
            {report.status === 'draft'
              ? '尚未经医生确认。'
              : ['confirmed', 'archived', 'corrected'].includes(report.status)
                ? '当前安全响应未提供完整确认摘要；不会使用访视操作者补齐。'
                : '当前安全响应未提供确认摘要。'}
          </p>
        )}
      </section>

      <details className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
        <summary className="cursor-pointer text-base font-semibold text-[var(--cma-text-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]">
          查看报告技术信息与历史纳入范围
        </summary>
        <div className="mt-4 grid gap-5">
          {finalityWarning ? (
            <p
              className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base text-[var(--cma-warning)]"
              role="alert"
            >
              {finalityWarning}
            </p>
          ) : null}
          {lockConsistencyWarning ? (
            <p
              className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base text-[var(--cma-warning)]"
              role="alert"
            >
              {lockConsistencyWarning}
            </p>
          ) : null}
          <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">报告编号</dt>
              <dd className="mt-1 break-all text-base text-[var(--cma-text-strong)]">{report.reportCode}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">外部报告号</dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">{displayValue(report.reportNo)}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">报告类型</dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">{clinicalReportTypeLabels[report.reportType]}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">报告版本</dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">{report.reportVersion}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">报告状态</dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">{clinicalReportStatusLabels[report.status]}（status={report.status}）</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">锁定状态</dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">{getClinicalReportLifecycleLabel(report)}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">来源</dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">{clinicalReportSourceLabels[report.source]}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">流程质量标记</dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">{clinicalReportQualityStatusLabels[report.qualityStatus]}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">最终性</dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">{report.isFinal ? '服务端标记为最终' : '服务端标记为非最终'}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">创建时间</dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">更新时间</dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.updatedAt)}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">锁定时间</dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.lockedAt)}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">归档时间</dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.archivedAt)}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">作废时间</dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.voidedAt)}</dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">公开作废原因</dt>
              <dd className="mt-1 whitespace-pre-wrap text-base text-[var(--cma-text-strong)]">{displayValue(report.voidReason)}</dd>
            </div>
          </dl>

          <section aria-labelledby="clinical-report-traces-heading">
            <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]" id="clinical-report-traces-heading">
              报告生成时的量表追溯快照
            </h4>
            <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
              A20 version 1 scope 当前不能修改；后续新增量表实例不会自动加入该报告。
            </p>
            {report.scaleTraces.length === 0 ? (
              <p className="mt-3 text-base text-[var(--cma-muted)]">当前安全报告响应未提供量表追溯快照。</p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {[...report.scaleTraces]
                  .sort(
                    (left, right) =>
                      left.scaleCode.localeCompare(right.scaleCode) ||
                      (left.scaleInstanceId ?? '').localeCompare(
                        right.scaleInstanceId ?? '',
                      ),
                  )
                  .map((trace, index) => {
                    const canOpenScale =
                      trace.scaleInstanceId !== null &&
                      mongoIdPattern.test(trace.scaleInstanceId);
                    return (
                      <li className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4" key={`${trace.scaleCode}:${trace.scaleInstanceId ?? index}`}>
                        <h5 className="text-base font-semibold text-[var(--cma-text-strong)]">{trace.scaleCode}</h5>
                        <dl className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                          <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">量表版本</dt><dd className="mt-1 text-sm text-[var(--cma-text-strong)]">{displayValue(trace.scaleVersion)}</dd></div>
                          <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">CRF 版本</dt><dd className="mt-1 text-sm text-[var(--cma-text-strong)]">{displayValue(trace.crfVersion)}</dd></div>
                          <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">评分规则版本</dt><dd className="mt-1 text-sm text-[var(--cma-text-strong)]">{displayValue(trace.scoringRuleVersion)}</dd></div>
                          <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">字段编码版本</dt><dd className="mt-1 text-sm text-[var(--cma-text-strong)]">{displayValue(trace.fieldEncodingVersion)}</dd></div>
                          <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">认知域映射版本</dt><dd className="mt-1 text-sm text-[var(--cma-text-strong)]">{displayValue(trace.domainMappingVersion)}</dd></div>
                          <div><dt className="text-sm font-semibold text-[var(--cma-muted)]">来源文档</dt><dd className="mt-1 break-words text-sm text-[var(--cma-text-strong)]">{displayValue(trace.sourceDocument)}</dd></div>
                        </dl>
                        {canOpenScale ? (
                          <div className="mt-3">
                            <Link className={scaleLinkClassName} href={`/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/scale-instances/${encodeURIComponent(trace.scaleInstanceId ?? '')}`}>
                              查看历史纳入量表
                            </Link>
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-[var(--cma-muted)]">当前快照未提供可安全打开的量表实例标识。</p>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
        </div>
      </details>
    </div>
  );
}
