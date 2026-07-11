import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import { ClinicalReportNarrative } from '@/src/features/assessments/components/ClinicalReportNarrative';
import { ClinicalReportScopeSelector } from '@/src/features/assessments/components/ClinicalReportScopeSelector';
import { ClinicalReportSnapshotSummary } from '@/src/features/assessments/components/ClinicalReportSnapshotSummary';
import { ClinicalReportTechnicalSummary } from '@/src/features/assessments/components/ClinicalReportTechnicalSummary';
import type { UseClinicalReportValue } from '@/src/features/assessments/hooks/useClinicalReport';
import {
  clinicalReportDraftBoundaryStatements,
  clinicalReportGenerationConfirmationStatements,
  clinicalReportQualityStatusLabels,
  clinicalReportSourceLabels,
  clinicalReportStatusLabels,
  getClinicalReportApiErrorMessage,
  getClinicalReportFinalityWarning,
} from '@/src/features/assessments/lib/clinical-report-display';
import type {
  AvailableScaleOption,
  ScaleInstanceListItem,
} from '@/src/features/assessments/types/assessment-execution';

function findSelectedInstances(
  instances: ScaleInstanceListItem[],
  selectedIds: string[],
): ScaleInstanceListItem[] {
  const selected = new Set(selectedIds);
  return [...instances]
    .filter((instance) => selected.has(instance.id.trim().toLowerCase()))
    .sort(
      (left, right) =>
        left.scaleCode.localeCompare(right.scaleCode) ||
        left.instanceNo - right.instanceNo ||
        left.id.localeCompare(right.id),
    );
}

export function ClinicalReportPanel({
  catalog,
  instances,
  onRefreshVisitDetail,
  patientId,
  reportState,
  visitId,
}: {
  catalog: AvailableScaleOption[] | null;
  instances: ScaleInstanceListItem[];
  onRefreshVisitDetail: () => void;
  patientId: string;
  reportState: UseClinicalReportValue;
  visitId: string;
}) {
  const selectedInstances = findSelectedInstances(
    instances,
    reportState.selectedScaleInstanceIds,
  );
  const report = reportState.report;
  const finalityWarning = report
    ? getClinicalReportFinalityWarning(report.status, report.isFinal)
    : null;

  return (
    <Card>
      <CardHeader className="border-b border-[var(--cma-line)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>访视级临床报告</CardTitle>
            <CardDescription>
              查询或生成 A20 规则化 ClinicalReport 草稿；当前不支持编辑、医生确认、PDF、下载、重生成或 AI 操作。
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {report ? (
              <Badge tone={report.status === 'draft' ? 'info' : 'neutral'}>
                {clinicalReportStatusLabels[report.status]}
              </Badge>
            ) : reportState.status === 'not_found' ? (
              <Badge>尚无报告</Badge>
            ) : reportState.status === 'forbidden' ? (
              <Badge tone="warning">无权限</Badge>
            ) : null}
            <Button
              disabled={
                reportState.status === 'idle' ||
                reportState.status === 'loading' ||
                reportState.generating
              }
              onClick={() => void reportState.refreshLatest()}
              size="sm"
              variant="secondary"
            >
              {reportState.status === 'loading'
                ? '正在加载...'
                : '重新加载最新报告'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 pt-5">
        {reportState.liveMessage ? (
          <p
            aria-live="polite"
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-info)]"
          >
            {reportState.liveMessage}
          </p>
        ) : null}

        {reportState.alreadyGeneratedReceipt !== null ? (
          <p
            aria-live="polite"
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-success-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-success)]"
          >
            {reportState.alreadyGeneratedReceipt
              ? '该访视此前已经生成相同范围的报告，本次未重复生成。'
              : '规则化临床报告草稿已生成；当前仍为 draft，尚未经医生确认。'}
          </p>
        ) : null}

        {reportState.generateError ? (
          <div
            className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4 text-[var(--cma-danger)]"
            role="alert"
          >
            <p className="font-semibold">报告生成未完成</p>
            <p className="mt-1 text-base leading-7">
              {getClinicalReportApiErrorMessage(reportState.generateError.kind)}
            </p>
            {reportState.generateError.kind === 'scale_instance_not_found' ? (
              <Button
                className="mt-3"
                onClick={onRefreshVisitDetail}
                size="sm"
                variant="secondary"
              >
                重新加载访视详情
              </Button>
            ) : null}
          </div>
        ) : null}

        {reportState.status === 'idle' ? (
          <p className="text-base text-[var(--cma-muted)]">
            访视详情加载成功后将自动查询最新报告。
          </p>
        ) : null}

        {reportState.status === 'loading' && !report ? (
          <p aria-live="polite" className="text-base text-[var(--cma-muted)]">
            正在加载最新报告，访视与量表实例区域仍可继续查看。
          </p>
        ) : null}

        {reportState.status === 'forbidden' ? (
          <div
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-[var(--cma-warning)]"
            role="alert"
          >
            <p className="font-semibold">当前账号无权查询报告</p>
            <p className="mt-1 text-base leading-7">
              报告区域不会将无权限伪装成尚无报告；访视与量表实例仍可继续查看。
            </p>
          </div>
        ) : null}

        {reportState.status === 'error' ? (
          <div
            className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4 text-[var(--cma-danger)]"
            role="alert"
          >
            <p className="font-semibold">暂时无法安全加载最新报告</p>
            <p className="mt-1 text-base leading-7">
              {reportState.latestError
                ? getClinicalReportApiErrorMessage(reportState.latestError.kind)
                : '请稍后手工重新加载最新报告。'}
            </p>
          </div>
        ) : null}

        {reportState.status === 'not_found' ? (
          <div className="grid gap-5">
            <div className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
              <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
                当前访视尚未生成临床报告草稿
              </h3>
              <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
                页面不会自动生成。请先明确选择 scope，再完成内联二次确认。
              </p>
            </div>

            <ClinicalReportScopeSelector
              catalog={catalog}
              generating={reportState.generating}
              instances={instances}
              onClearSelection={reportState.clearSelection}
              onSelectAll={reportState.selectAllEligible}
              onToggle={reportState.toggleScaleInstance}
              patientId={patientId}
              selectedScaleInstanceIds={
                reportState.selectedScaleInstanceIds
              }
              visitId={visitId}
            />

            {!reportState.confirmationOpen ? (
              <div className="grid gap-2">
                <Button
                  disabled={!reportState.canPrepareGenerate}
                  onClick={reportState.prepareGenerate}
                >
                  准备生成报告草稿
                </Button>
                {reportState.generateBlockReason ? (
                  <p className="text-sm leading-6 text-[var(--cma-muted)]">
                    {reportState.generateBlockReason}
                  </p>
                ) : null}
              </div>
            ) : (
              <section
                aria-labelledby="clinical-report-confirm-generate-heading"
                className="grid gap-4 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface-muted)] p-5"
              >
                <div>
                  <h3
                    className="text-xl font-semibold text-[var(--cma-text-strong)]"
                    id="clinical-report-confirm-generate-heading"
                  >
                    二次确认报告范围与草稿边界
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
                    本次选定的量表实例如下，请再次核对。
                  </p>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-base text-[var(--cma-text-strong)]">
                  {selectedInstances.map((instance) => (
                    <li key={instance.id}>
                      {instance.scaleCode} · {instance.instanceCode} · 第{' '}
                      {instance.instanceNo} 份
                    </li>
                  ))}
                </ul>
                <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--cma-muted)]">
                  {clinicalReportGenerationConfirmationStatements.map(
                    (statement) => (
                      <li key={statement}>{statement}</li>
                    ),
                  )}
                </ul>
                <label
                  className="flex items-start gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4 text-base font-semibold leading-7 text-[var(--cma-text-strong)]"
                  htmlFor="clinical-report-generation-confirmation"
                >
                  <input
                    checked={reportState.confirmationChecked}
                    className="mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)]"
                    disabled={reportState.generating}
                    id="clinical-report-generation-confirmation"
                    onChange={(event) =>
                      reportState.setConfirmationChecked(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    我已核对本次报告范围，并理解这是固定服务端规则生成、未使用 AI、尚未经医生确认且不构成诊断结论的 draft。
                  </span>
                </label>
                <div className="flex flex-wrap gap-3">
                  <Button
                    disabled={
                      reportState.generating ||
                      !reportState.confirmationChecked ||
                      !reportState.canPrepareGenerate
                    }
                    onClick={() => void reportState.confirmGenerate()}
                  >
                    {reportState.generating
                      ? '正在生成规则化报告草稿'
                      : '确认生成报告草稿'}
                  </Button>
                  <Button
                    disabled={reportState.generating}
                    onClick={reportState.cancelGenerate}
                    variant="secondary"
                  >
                    取消
                  </Button>
                </div>
              </section>
            )}
          </div>
        ) : null}

        {report ? (
          <div className="grid gap-6">
            <section className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] p-4 text-[var(--cma-info)]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">
                  {clinicalReportStatusLabels[report.status]}
                </Badge>
                <Badge>{clinicalReportSourceLabels[report.source]}</Badge>
              </div>
              <p className="mt-3 text-base font-semibold">
                {clinicalReportQualityStatusLabels[report.qualityStatus]}
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6">
                {(report.status === 'draft'
                  ? clinicalReportDraftBoundaryStatements
                  : [
                      '当前内容是临床认知评估报告的结构化信息，不得脱离临床背景单独形成诊断。',
                      'B10 对历史状态只读展示，不提供修改、再次确认或其他报告写操作。',
                      '报告不包含诊断阈值、疾病风险等级或治疗建议。',
                      '认知域之间可能重叠，不能跨域求和解释量表总分。',
                    ]
                ).map((statement) => (
                  <li key={statement}>{statement}</li>
                ))}
              </ul>
            </section>

            {finalityWarning ? (
              <p
                className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base text-[var(--cma-warning)]"
                role="alert"
              >
                {finalityWarning}
              </p>
            ) : null}

            <ClinicalReportSnapshotSummary report={report} />
            <ClinicalReportNarrative narrative={report.narrative} />
            <ClinicalReportTechnicalSummary
              patientId={patientId}
              report={report}
              visitId={visitId}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
