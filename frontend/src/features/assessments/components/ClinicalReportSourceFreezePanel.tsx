import { Button } from '@/src/components/ui/Button';
import type { UseClinicalReportWorkflowValue } from '@/src/features/assessments/hooks/useClinicalReportWorkflow';
import {
  clinicalReportSourceFreezeBoundaryStatements,
  clinicalReportStatusLabels,
  formatClinicalReportDate,
  getClinicalReportSourceFreezeApiErrorMessage,
} from '@/src/features/assessments/lib/clinical-report-display';
import { clinicalReportSourceFreezeLimits } from '@/src/features/assessments/lib/clinical-report-source-freeze-draft';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';

export function ClinicalReportSourceFreezePanel({
  report,
  workflow,
}: {
  report: ClinicalReport;
  workflow: UseClinicalReportWorkflowValue;
}) {
  const draft = workflow.sourceFreezeDraft;
  const isActive = workflow.activeMode === 'source_freeze' && draft !== null;
  const targetLabel = `${report.reportCode} / V${report.reportVersion}`;

  if (!isActive) {
    if (report.sourceFreeze?.state === 'completed') {
      return (
        <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
          <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
            报告来源链冻结已完成
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            当前操作目标：{targetLabel}
          </p>
          <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
            当前不再显示首次冻结或恢复入口；完成事实来自服务端 sourceFreeze，重复请求不会重新冻结来源。
          </p>
        </section>
      );
    }

    if (workflow.sourceFreezeConsistencyWarning) {
      return (
        <p
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-warning)]"
          role="alert"
        >
          当前操作目标：{targetLabel}。<br />
          来源冻结安全摘要不完整或不一致；当前不开放首次冻结或恢复操作，请联系管理员。
        </p>
      );
    }

    if (!workflow.roleCanFreezeSources) {
      return (
        <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
          <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
            报告来源冻结
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            当前操作目标：{targetLabel}
          </p>
          <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
            {report.sourceFreeze?.state === 'in_progress'
              ? '来源冻结尚未完成；部分来源可能已经冻结。等待医生或管理员明确继续完成同一流程。'
              : '来源冻结需由医生或管理员执行。当前账号可查看持久安全摘要，后端 RolesGuard 是最终权限边界。'}
          </p>
        </section>
      );
    }

    return (
      <section className="grid gap-3 rounded-md border border-[var(--cma-line)] p-4">
        <div>
          <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
            {report.sourceFreeze?.state === 'in_progress'
              ? '继续完成来源冻结'
              : '不可逆冻结报告来源'}
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            当前操作目标：{targetLabel}。
            {report.sourceFreeze?.state === 'in_progress'
              ? '服务端已固化原 freezeId、说明与范围；恢复不会生成新流程，也不会解冻已冻结来源。'
              : '首次发起只面向已确认、已锁定且通过安全资格检查的报告。'}
          </p>
        </div>
        {workflow.canStartSourceFreeze ? (
          <Button onClick={workflow.openSourceFreeze}>
            准备冻结报告来源
          </Button>
        ) : workflow.canResumeSourceFreeze ? (
          <Button onClick={workflow.openSourceFreezeResume}>
            准备继续完成来源冻结
          </Button>
        ) : (
          <p className="text-sm leading-6 text-[var(--cma-muted)]">
            {workflow.sourceFreezeBlockReason}
          </p>
        )}
      </section>
    );
  }

  const isWriting = workflow.writingAction === 'source_freeze';
  const isStart = draft.mode === 'start';
  const latestStartedExisting =
    isStart && draft.stale && report.sourceFreeze?.state === 'in_progress';
  const latestCompleted =
    draft.stale && report.sourceFreeze?.state === 'completed';

  return (
    <section
      aria-labelledby="clinical-report-source-freeze-heading"
      className="grid gap-5 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface-muted)] p-5"
    >
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-source-freeze-heading"
        >
          {isStart
            ? '二次确认不可逆来源冻结'
            : '二次确认继续同一来源冻结流程'}
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          当前操作目标：{targetLabel}；status：
          {clinicalReportStatusLabels[report.status]}（
          {report.status}）；报告锁定时间：
          {formatClinicalReportDate(report.lockedAt)}；并发基线：
          {formatClinicalReportDate(draft.baseUpdatedAt)}。
        </p>
      </div>

      {!isStart && report.sourceFreeze ? (
        <div className="grid gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4 text-sm sm:grid-cols-2">
          <div><p className="font-semibold text-[var(--cma-muted)]">原 freezeId</p><p className="mt-1 break-all text-[var(--cma-text-strong)]">{report.sourceFreeze.freezeId}</p></div>
          <div><p className="font-semibold text-[var(--cma-muted)]">流程开始时间</p><p className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.sourceFreeze.startedAt)}</p></div>
          <div><p className="font-semibold text-[var(--cma-muted)]">来源统一锁定时间</p><p className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.sourceFreeze.sourceLockedAt)}</p></div>
          <div><p className="font-semibold text-[var(--cma-muted)]">当前 report.updatedAt</p><p className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.updatedAt)}</p></div>
          <div className="sm:col-span-2"><p className="font-semibold text-[var(--cma-muted)]">服务端首次来源冻结流程说明（只读）</p><p className="mt-1 whitespace-pre-wrap text-[var(--cma-text-strong)]">{draft.freezeNote}</p></div>
        </div>
      ) : (
        <div className="grid gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4 text-sm sm:grid-cols-3">
          <div><p className="font-semibold text-[var(--cma-muted)]">报告状态</p><p className="mt-1 text-[var(--cma-text-strong)]">{report.status}</p></div>
          <div><p className="font-semibold text-[var(--cma-muted)]">报告锁定时间</p><p className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.lockedAt)}</p></div>
          <div><p className="font-semibold text-[var(--cma-muted)]">报告更新时间</p><p className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.updatedAt)}</p></div>
        </div>
      )}

      <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--cma-muted)]">
        {clinicalReportSourceFreezeBoundaryStatements.map((statement) => (
          <li key={statement}>{statement}</li>
        ))}
      </ul>

      {draft.stale ? (
        <div
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-[var(--cma-warning)]"
          role="alert"
        >
          <p className="font-semibold">
            {latestStartedExisting
              ? '服务端已存在来源冻结流程，本地首次说明尚未提交'
              : latestCompleted
                ? isStart
                  ? '来源冻结已由其他操作完成，本地说明未写入'
                  : '来源冻结已由其他操作完成，当前恢复确认已失效'
                : '来源冻结确认草稿已过期'}
          </p>
          <p className="mt-1 text-sm leading-6">
            {latestStartedExisting
              ? '恢复必须使用服务端首次 freezeNote；系统不会静默替换或提交当前本地说明。'
              : 'checkbox 已清除，原 POST 没有自动重发，也没有覆盖其他操作者结果。'}
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            {latestStartedExisting ? (
              <>
                <Button
                  disabled={isWriting}
                  onClick={workflow.cancelSourceFreeze}
                  size="sm"
                  variant="secondary"
                >
                  关闭并放弃本地说明
                </Button>
                {workflow.canDiscardLocalSourceFreezeAndResume ? (
                  <Button
                    disabled={isWriting}
                    onClick={workflow.discardLocalSourceFreezeAndResume}
                    size="sm"
                  >
                    放弃本地说明并转入恢复现有流程
                  </Button>
                ) : null}
              </>
            ) : latestCompleted ? (
              <Button
                disabled={isWriting}
                onClick={workflow.cancelSourceFreeze}
                size="sm"
                variant="secondary"
              >
                {isStart ? '关闭并放弃本地说明' : '关闭恢复确认'}
              </Button>
            ) : workflow.canContinueSourceFreezeWithLatest ? (
              <Button
                disabled={isWriting}
                onClick={workflow.continueSourceFreezeWithLatest}
                size="sm"
                variant="secondary"
              >
                基于最新报告继续核对
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {isStart ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              className="text-base font-semibold text-[var(--cma-text-strong)]"
              htmlFor="clinical-report-source-freeze-note"
            >
              来源冻结流程说明（必填）
            </label>
            <span className="text-sm text-[var(--cma-muted)]">
              {draft.freezeNote.length} /{' '}
              {clinicalReportSourceFreezeLimits.freezeNote.max}
            </span>
          </div>
          <textarea
            className="min-h-32 w-full rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-3 text-base leading-7 text-[var(--cma-text-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)] disabled:opacity-60"
            disabled={isWriting || draft.stale}
            id="clinical-report-source-freeze-note"
            maxLength={clinicalReportSourceFreezeLimits.freezeNote.max}
            onChange={(event) =>
              workflow.updateSourceFreezeNote(event.target.value)
            }
            value={draft.freezeNote}
          />
          <p className="text-sm text-[var(--cma-muted)]">
            trim 后 3–2000 个字符；不自动生成，不预填 lockNote、confirmationNote，也不属于报告正文。
          </p>
        </div>
      ) : (
        <p className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] px-4 py-3 text-sm leading-6 text-[var(--cma-muted)]">
          恢复不会生成新 freezeId，不会覆盖首次说明或发起人，也不会解冻已冻结来源。请求使用上方服务端只读说明。
        </p>
      )}

      <label
        className="flex items-start gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4 text-base font-semibold leading-7 text-[var(--cma-text-strong)]"
        htmlFor="clinical-report-source-freeze-confirmed"
      >
        <input
          checked={draft.confirmed}
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)]"
          disabled={isWriting || draft.stale}
          id="clinical-report-source-freeze-confirmed"
          onChange={(event) =>
            workflow.setSourceFreezeConfirmed(event.target.checked)
          }
          type="checkbox"
        />
        <span>
          {isStart
            ? '我已核对当前已确认并锁定的报告，理解来源冻结不可逆，且该操作可能跨多个集合逐步完成。'
            : '我理解当前流程可能已部分完成，并确认继续使用原冻结范围和原冻结说明完成同一流程。'}
        </span>
      </label>

      {workflow.sourceFreezeError ? (
        <div
          className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-danger)]"
          role="alert"
        >
          <p>
            {getClinicalReportSourceFreezeApiErrorMessage(
              workflow.sourceFreezeError.kind,
            )}
          </p>
          {workflow.sourceFreezeError.kind === 'service_unavailable' ||
          workflow.sourceFreezeError.kind === 'unknown' ? (
            <Button
              className="mt-3"
              disabled={isWriting}
              onClick={() =>
                void workflow.reloadLatestAfterSourceFreezeUncertainty()
              }
              size="sm"
              variant="secondary"
            >
              手工重新加载最新报告
            </Button>
          ) : null}
        </div>
      ) : null}

      {!workflow.sourceFreezeValidation.valid &&
      workflow.sourceFreezeValidation.message ? (
        <p className="text-sm leading-6 text-[var(--cma-muted)]">
          {workflow.sourceFreezeValidation.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          disabled={!workflow.canConfirmSourceFreeze}
          onClick={() => void workflow.confirmSourceFreeze()}
        >
          {isWriting
            ? '正在执行来源链冻结'
            : isStart
              ? '确认冻结报告来源'
              : '确认继续同一冻结流程'}
        </Button>
        <Button
          disabled={isWriting}
          onClick={workflow.cancelSourceFreeze}
          variant="secondary"
        >
          取消
        </Button>
      </div>

      {isWriting ? (
        <p aria-live="polite" className="text-sm leading-6 text-[var(--cma-muted)]">
          该 POST 可能跨多个集合执行；系统不根据耗时猜测阶段，不显示百分比，也不会自动轮询、重试或恢复。
        </p>
      ) : null}
    </section>
  );
}
