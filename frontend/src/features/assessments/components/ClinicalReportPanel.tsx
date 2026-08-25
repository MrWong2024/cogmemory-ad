import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import { ClinicalReportReadOnlyContent } from '@/src/features/assessments/components/ClinicalReportReadOnlyContent';
import { ClinicalReportDraftEditor } from '@/src/features/assessments/components/ClinicalReportDraftEditor';
import { ClinicalReportSubmissionPanel } from '@/src/features/assessments/components/ClinicalReportSubmissionPanel';
import { ClinicalReportConfirmationPanel } from '@/src/features/assessments/components/ClinicalReportConfirmationPanel';
import { ClinicalReportWorkflowSummary } from '@/src/features/assessments/components/ClinicalReportWorkflowSummary';
import { ClinicalReportLockPanel } from '@/src/features/assessments/components/ClinicalReportLockPanel';
import { ClinicalReportSourceFreezePanel } from '@/src/features/assessments/components/ClinicalReportSourceFreezePanel';
import { ClinicalReportArchivePanel } from '@/src/features/assessments/components/ClinicalReportArchivePanel';
import { ClinicalReportCorrectionPanel } from '@/src/features/assessments/components/ClinicalReportCorrectionPanel';
import { ClinicalReportCorrectionSummary } from '@/src/features/assessments/components/ClinicalReportCorrectionSummary';
import { ClinicalReportScopeSelector } from '@/src/features/assessments/components/ClinicalReportScopeSelector';
import { ClinicalReportTechnicalSummary } from '@/src/features/assessments/components/ClinicalReportTechnicalSummary';
import type { UseClinicalReportValue } from '@/src/features/assessments/hooks/useClinicalReport';
import type { UseClinicalReportWorkflowValue } from '@/src/features/assessments/hooks/useClinicalReportWorkflow';
import {
  clinicalReportDraftBoundaryStatements,
  clinicalReportGenerationConfirmationStatements,
  clinicalReportQualityStatusLabels,
  clinicalReportSourceLabels,
  clinicalReportStatusLabels,
  getClinicalReportApiErrorMessage,
  getClinicalReportFinalityWarning,
  getClinicalReportLifecycleLabel,
  getClinicalReportLockConsistencyWarning,
  isClinicalReportLocked,
} from '@/src/features/assessments/lib/clinical-report-display';
import { getClinicalReportSourceFreezeConsistencyWarning } from '@/src/features/assessments/lib/clinical-report-source-freeze-draft';
import { getClinicalReportArchiveConsistencyWarning } from '@/src/features/assessments/lib/clinical-report-archive-draft';
import {
  getClinicalReportLifecycleTarget,
  getClinicalReportLifecycleTargetWarning,
} from '@/src/features/assessments/lib/clinical-report-lifecycle-target';
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
  workflow,
}: {
  catalog: AvailableScaleOption[] | null;
  instances: ScaleInstanceListItem[];
  onRefreshVisitDetail: () => void;
  patientId: string;
  reportState: UseClinicalReportValue;
  visitId: string;
  workflow: UseClinicalReportWorkflowValue;
}) {
  const selectedInstances = findSelectedInstances(
    instances,
    reportState.selectedScaleInstanceIds,
  );
  const report = reportState.report;
  const finalityWarning = report
    ? getClinicalReportFinalityWarning(report.status, report.isFinal)
    : null;
  const lockConsistencyWarning = report
    ? getClinicalReportLockConsistencyWarning(report)
    : null;
  const sourceFreezeConsistencyWarning = report
    ? getClinicalReportSourceFreezeConsistencyWarning(report.sourceFreeze)
    : null;
  const archiveConsistencyWarning = report
    ? getClinicalReportArchiveConsistencyWarning(report)
    : null;
  const lifecycleTarget = report
    ? getClinicalReportLifecycleTarget(report)
    : null;
  const lifecycleTargetWarning = report
    ? getClinicalReportLifecycleTargetWarning(report)
    : null;
  const reportLiveMessage =
    reportState.liveMessage === '正在生成规则化报告草稿。'
      ? '正在生成报告草稿。'
      : reportState.liveMessage ===
          '规则化临床报告草稿已生成；当前仍为 draft，尚未经医生确认。'
        ? '临床报告草稿已生成；当前尚未经医生确认。'
        : reportState.liveMessage;
  const workflowLiveMessage =
    workflow.liveMessage ===
    '本地未提交说明已放弃；请重新核对服务端原说明并明确确认恢复。'
      ? '本地未提交说明已放弃；请重新核对原说明并明确确认继续。'
      : workflow.liveMessage ===
          '本地未提交说明已放弃；请核对服务端原始说明并明确确认继续同一更正流程。'
        ? '本地未提交说明已放弃；请核对原说明并明确确认继续同一更正流程。'
        : workflow.liveMessage;

  return (
    <Card>
      <CardHeader className="border-b border-[var(--cma-line)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>访视级临床报告</CardTitle>
            <CardDescription>
              集中查看本次访视的报告内容、处理状态和可用操作；报告更正会保留原版本并形成新的可追溯版本。
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {report ? (
              <>
                <Badge tone={report.status === 'draft' ? 'info' : 'neutral'}>
                  {clinicalReportStatusLabels[report.status]}
                </Badge>
                {isClinicalReportLocked(report) ? (
                  <Badge tone="warning">已锁定</Badge>
                ) : null}
                <Badge
                  tone={
                    report.sourceFreeze?.state === 'completed'
                      ? 'success'
                      : report.sourceFreeze?.state === 'in_progress'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {report.sourceFreeze?.state === 'completed'
                    ? '报告依据已固定'
                    : report.sourceFreeze?.state === 'in_progress'
                      ? '正在固定报告依据'
                      : '报告依据未固定'}
                </Badge>
                {report.replacementOf ? (
                  <Badge tone="info">更正版本 V{report.reportVersion}</Badge>
                ) : report.correction?.state === 'in_progress' ? (
                  <Badge tone="warning">更正待继续</Badge>
                ) : report.correction?.state === 'completed' ? (
                  <Badge tone="success">已生成更正版本</Badge>
                ) : null}
                <Badge
                  tone={
                    report.status === 'archived' ||
                    report.status === 'corrected'
                      ? 'success'
                      : 'neutral'
                  }
                >
                  {report.status === 'archived'
                    ? '报告已归档'
                    : report.status === 'corrected'
                      ? '原报告已归档'
                    : '报告尚未归档'}
                </Badge>
              </>
            ) : reportState.status === 'not_found' ? (
              <Badge>尚无报告</Badge>
            ) : reportState.status === 'forbidden' ? (
              <Badge tone="warning">无权限</Badge>
            ) : null}
            <Button
              disabled={
                reportState.status === 'idle' ||
                reportState.generating ||
                workflow.writingAction !== null
              }
              onClick={() => void reportState.refreshLatest()}
              size="sm"
              variant="secondary"
            >
              {reportState.status === 'loading'
                ? '取消旧请求并重新加载'
                : '重新加载最新报告'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 pt-5">
        {reportLiveMessage ? (
          <p
            aria-live="polite"
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-info)]"
          >
            {reportLiveMessage}
          </p>
        ) : null}

        {workflowLiveMessage ? (
          <p
            aria-live="polite"
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-info)]"
          >
            {workflowLiveMessage}
          </p>
        ) : null}

        {workflow.writeProhibited ? (
          <p
            className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-danger)]"
            role="alert"
          >
            报告审计结构或审计上限当前不允许继续安全写入；请保留现有内容并联系管理员处理。
          </p>
        ) : null}

        {reportState.alreadyGeneratedReceipt !== null ? (
          <p
            aria-live="polite"
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-success-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-success)]"
          >
            {reportState.alreadyGeneratedReceipt
              ? '该访视此前已经生成相同范围的报告，本次未重复生成。'
              : '临床报告草稿已生成；当前尚未经医生确认。'}
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

        {reportState.status === 'not_found' &&
        reportState.canShowInitialGenerate ? (
          <div className="grid gap-5">
            <div className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
              <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
                当前访视尚未生成临床报告草稿
              </h3>
              <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
                页面不会自动生成。请先选择纳入报告的评估结果，再完成确认。
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
                    二次确认报告内容与草稿边界
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
                    本次选定的量表实例如下，请再次核对。
                  </p>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-base text-[var(--cma-text-strong)]">
                  {selectedInstances.map((instance) => (
                    <li key={instance.id}>
                      {instance.scaleCode} · 第 {instance.instanceNo} 份
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
                    我已核对本次纳入报告的评估结果，并理解报告由系统固定规则生成、未使用 AI、尚未经医生确认且不构成诊断结论。
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
                      ? '正在生成报告草稿'
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

        {reportState.status === 'not_found' &&
        !reportState.canShowInitialGenerate ? (
          <section className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface-muted)] p-4">
            <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
              当前访视尚无临床报告草稿
            </h3>
            <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
              {reportState.initialGenerateReadOnlyMessage}
            </p>
          </section>
        ) : null}

        {report ? (
          <div className="grid gap-6">
            <section className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] p-4 text-[var(--cma-info)]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">
                  {clinicalReportStatusLabels[report.status]}
                </Badge>
                <Badge tone={isClinicalReportLocked(report) ? 'warning' : 'neutral'}>
                  {getClinicalReportLifecycleLabel(report)}
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
                      '报告等待确认时，只能由医生或管理员完成确认；完成确认、归档、更正或作废后保持只读。',
                      '系统生成的报告内容不会自动给出诊断阈值、疾病风险等级、医生意见或治疗建议。',
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

            {lockConsistencyWarning ? (
              <p
                className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base text-[var(--cma-warning)]"
                role="alert"
              >
                {lockConsistencyWarning}
              </p>
            ) : null}

            {sourceFreezeConsistencyWarning ? (
              <p
                className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base text-[var(--cma-warning)]"
                role="alert"
              >
                报告所依据的评估资料信息不完整或不一致；为避免误操作，当前不会开放后续处理。
              </p>
            ) : null}

            {archiveConsistencyWarning ? (
              <p
                className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base text-[var(--cma-warning)]"
                role="alert"
              >
                报告归档信息不完整或不一致；为避免误操作，当前不会开放后续处理。
              </p>
            ) : null}

            <ClinicalReportReadOnlyContent report={report} />
            <ClinicalReportWorkflowSummary
              report={report}
              workflow={workflow}
            />
            <ClinicalReportCorrectionSummary
              receipt={workflow.correctionReceipt}
              report={report}
              sourceReport={workflow.correctionSourceReport}
            />
            <ClinicalReportDraftEditor report={report} workflow={workflow} />
            <ClinicalReportSubmissionPanel report={report} workflow={workflow} />
            <ClinicalReportConfirmationPanel
              report={report}
              workflow={workflow}
            />
            {lifecycleTarget ? (
              <>
                <ClinicalReportLockPanel report={report} workflow={workflow} />
                <ClinicalReportSourceFreezePanel
                  report={report}
                  workflow={workflow}
                />
                <ClinicalReportArchivePanel report={report} workflow={workflow} />
              </>
            ) : lifecycleTargetWarning ? (
              <p
                className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-warning)]"
                role="alert"
              >
                当前报告的版本关系信息不完整或不一致；为避免误操作，当前不会开放后续处理。
              </p>
            ) : null}
            <ClinicalReportCorrectionPanel report={report} workflow={workflow} />
            {['confirmed', 'archived', 'corrected', 'voided'].includes(
              report.status,
            ) ? (
              <p className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] px-4 py-3 text-base leading-7 text-[var(--cma-muted)]">
                {lifecycleTarget?.kind === 'replacement'
                  ? `当前为更正生成的 V${report.reportVersion} 报告。确认、锁定、固定报告依据与归档会按当前报告的处理进度依次开放；每一步均需医生或管理员明确确认，不会自动串联。`
                  : isClinicalReportLocked(report)
                  ? report.status === 'archived'
                    ? '当前报告已经归档并保持只读。归档不会修改患者、访视或原始评估资料，也不等于删除、作废、更正或生成可下载文件。'
                    : report.status === 'corrected'
                      ? '当前为已更正的历史报告，只读展示归档与更正摘要；后续版本单独保留，不提供取消更正、取消归档或解除锁定操作。'
                      : report.sourceFreeze?.state === 'completed'
                    ? '当前报告已经确认并锁定，所依据的评估资料也已固定。归档仍需医生或管理员明确执行，患者、访视与原始评估资料不会因此改变。'
                    : report.sourceFreeze?.state === 'in_progress'
                      ? '当前报告已经锁定，但报告依据尚未全部固定；已完成的部分不会自动撤销，需由医生或管理员继续完成同一流程。'
                      : '当前报告已经确认并锁定，但报告依据尚未固定。报告锁定与固定报告依据是两个独立阶段。'
                  : '当前报告已经完成医生或管理员确认并保持只读，但尚未锁定；这不表示访视或原始评估资料已经锁定，也不表示报告已经归档、签名或生成可下载文件。'}
              </p>
            ) : null}
            <ClinicalReportTechnicalSummary
              patientId={patientId}
              report={report}
              visitId={visitId}
              workflow={workflow}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
