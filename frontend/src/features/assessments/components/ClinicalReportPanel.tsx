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
import { ClinicalReportSourceFreezeSummary } from '@/src/features/assessments/components/ClinicalReportSourceFreezeSummary';
import { ClinicalReportArchivePanel } from '@/src/features/assessments/components/ClinicalReportArchivePanel';
import { ClinicalReportArchiveSummary } from '@/src/features/assessments/components/ClinicalReportArchiveSummary';
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

  return (
    <Card>
      <CardHeader className="border-b border-[var(--cma-line)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>访视级临床报告</CardTitle>
            <CardDescription>
              支持版本化更正、线性来源追溯及当前安全版本的受控报告工作流；所有写入共享同一写锁与 updatedAt 并发边界。
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
                    ? '来源已冻结'
                    : report.sourceFreeze?.state === 'in_progress'
                      ? '冻结未完成'
                      : '来源未冻结'}
                </Badge>
                {report.replacementOf ? (
                  <Badge tone="info">替代版本 V{report.reportVersion}</Badge>
                ) : report.correction?.state === 'in_progress' ? (
                  <Badge tone="warning">更正待继续</Badge>
                ) : report.correction?.state === 'completed' ? (
                  <Badge tone="success">已由替代版本接续</Badge>
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
                reportState.status === 'loading' ||
                reportState.generating ||
                workflow.writingAction !== null
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

        {workflow.liveMessage ? (
          <p
            aria-live="polite"
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-info)]"
          >
            {workflow.liveMessage}
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
                      'pending_confirmation 只能等待 doctor / admin 确认；confirmed、archived、corrected 与 voided 均只读。',
                      '系统规则化部分不自动生成诊断阈值、疾病风险等级、医生意见或治疗建议。',
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
                来源冻结安全摘要不完整或不一致：
                {sourceFreezeConsistencyWarning}
              </p>
            ) : null}

            {archiveConsistencyWarning ? (
              <p
                className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base text-[var(--cma-warning)]"
                role="alert"
              >
                归档安全摘要不完整或不一致：
                {archiveConsistencyWarning}
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
                <ClinicalReportSourceFreezeSummary
                  receipt={workflow.sourceFreezeReceipt}
                  sourceFreeze={report.sourceFreeze}
                />
                <ClinicalReportArchivePanel report={report} workflow={workflow} />
                <ClinicalReportArchiveSummary
                  receipt={workflow.archiveReceipt}
                  report={report}
                />
              </>
            ) : lifecycleTargetWarning ? (
              <p
                className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-warning)]"
                role="alert"
              >
                {lifecycleTargetWarning}
              </p>
            ) : null}
            <ClinicalReportCorrectionPanel report={report} workflow={workflow} />
            {['confirmed', 'archived', 'corrected', 'voided'].includes(
              report.status,
            ) ? (
              <p className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] px-4 py-3 text-base leading-7 text-[var(--cma-muted)]">
                {lifecycleTarget?.kind === 'replacement'
                  ? `当前是版本化更正形成的 ${report.reportCode} / V${report.reportVersion} 报告。锁定、来源冻结与归档按当前报告自身事实依次开放；每一步均需医生或管理员明确确认，不会自动串联。`
                  : isClinicalReportLocked(report)
                  ? report.status === 'archived'
                    ? '当前报告真实 status=archived，报告自身锁定与 completed 来源冻结事实继续保留。归档不修改 Patient、Visit 或来源对象，不等于删除、作废、更正或生成 PDF；当前不提供 unarchive。'
                    : report.status === 'corrected'
                      ? '当前为已更正的历史来源报告，只读展示归档与更正摘要；替代报告是下一线性版本，不提供取消更正、取消归档、解锁或解冻操作。'
                      : report.sourceFreeze?.state === 'completed'
                    ? '当前报告自身已经确认并锁定，status 仍为 confirmed；其固定 scope 内来源链已完成冻结。归档仍需 doctor / admin 明确执行；Patient、Visit 与来源对象不会被归档操作修改。'
                    : report.sourceFreeze?.state === 'in_progress'
                      ? '当前报告自身已经锁定，但来源冻结尚未完整完成，部分来源可能已经冻结且系统不会自动回滚。Patient、Visit 与 Storage 未冻结；需由医生或管理员明确恢复同一流程。'
                      : '当前报告自身已经确认并锁定，但 sourceFreeze=null 表示报告来源尚未冻结。报告锁定与来源冻结是两个独立阶段；Patient、Visit 与 Storage 未冻结。'
                  : '当前报告为只读状态。confirmed 表示已完成医生或管理员确认，但尚未锁定；也不表示访视、评分、认知域或媒体已锁定，或报告已归档、签名、生成 PDF。'}
              </p>
            ) : null}
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
