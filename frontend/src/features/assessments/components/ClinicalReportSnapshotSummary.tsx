import { ClinicalReportDomainList } from '@/src/features/assessments/components/ClinicalReportDomainList';
import { ClinicalReportEvidenceList } from '@/src/features/assessments/components/ClinicalReportEvidenceList';
import { ClinicalReportScoreList } from '@/src/features/assessments/components/ClinicalReportScoreList';
import {
  clinicalReportOperatorRoleLabels,
  clinicalReportPatientSexLabels,
  clinicalReportVisitTypeLabels,
  formatClinicalReportDate,
  formatClinicalReportDateOnly,
  formatClinicalReportNumber,
} from '@/src/features/assessments/lib/clinical-report-display';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';

export function ClinicalReportSnapshotSummary({
  report,
}: {
  report: ClinicalReport;
}) {
  return (
    <div className="grid gap-6">
      <section
        aria-labelledby="clinical-report-patient-snapshot-heading"
        className="rounded-md border border-[var(--cma-line)] p-4"
      >
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-patient-snapshot-heading"
        >
          报告生成时的患者快照
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          这是报告生成时保存的安全快照，不代表当前实时患者档案。
        </p>
        {report.patientSnapshot ? (
          <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                受试者编号
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {report.patientSnapshot.subjectCode?.trim() || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                展示名称
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {report.patientSnapshot.displayName?.trim() || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                性别
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {report.patientSnapshot.sex
                  ? clinicalReportPatientSexLabels[report.patientSnapshot.sex]
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                出生日期
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {formatClinicalReportDateOnly(report.patientSnapshot.birthDate)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                受教育年限
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {formatClinicalReportNumber(
                  report.patientSnapshot.educationYears,
                )}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-base text-[var(--cma-muted)]">
            当前安全报告响应未提供该快照。
          </p>
        )}
      </section>

      <section
        aria-labelledby="clinical-report-visit-snapshot-heading"
        className="rounded-md border border-[var(--cma-line)] p-4"
      >
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-visit-snapshot-heading"
        >
          报告生成时的访视快照
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          这是生成时的访视安全快照，不从当前页面补齐缺失字段。
        </p>
        {report.visitSnapshot ? (
          <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                访视编号
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {report.visitSnapshot.visitCode?.trim() || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                访视类型
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {report.visitSnapshot.visitType
                  ? clinicalReportVisitTypeLabels[
                      report.visitSnapshot.visitType
                    ]
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                评估时间
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {formatClinicalReportDate(
                  report.visitSnapshot.assessmentDate,
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                操作者
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {report.visitSnapshot.operatorName?.trim() || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                操作者角色
              </dt>
              <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                {report.visitSnapshot.operatorRole
                  ? clinicalReportOperatorRoleLabels[
                      report.visitSnapshot.operatorRole
                    ]
                  : '—'}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-base text-[var(--cma-muted)]">
            当前安全报告响应未提供该快照。
          </p>
        )}
      </section>

      <ClinicalReportScoreList snapshots={report.scoreSnapshots} />
      <ClinicalReportDomainList snapshots={report.domainSnapshots} />
      <ClinicalReportEvidenceList snapshots={report.evidenceSnapshots} />
    </div>
  );
}
