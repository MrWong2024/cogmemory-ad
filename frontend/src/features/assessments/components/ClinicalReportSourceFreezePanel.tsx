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
  const targetLabel = `V${report.reportVersion}`;

  if (!isActive) {
    if (report.sourceFreeze?.state === 'completed') {
      return (
        <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
          <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
            报告依据已固定
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            当前操作目标：{targetLabel}
          </p>
          <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
            当前不再显示首次处理或继续入口；重复操作不会再次固定相同的评估资料。
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
          固定报告依据的信息不完整或不一致；当前不开放首次处理或继续操作，请联系管理员。
        </p>
      );
    }

    if (!workflow.roleCanFreezeSources) {
      return (
        <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
          <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
            固定报告依据
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            当前操作目标：{targetLabel}
          </p>
          <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
            {report.sourceFreeze?.state === 'in_progress'
              ? '固定过程尚未完成；部分评估资料可能已经固定。等待医生或管理员明确继续完成同一流程。'
              : '固定报告依据需由医生或管理员执行。当前账号仍可查看已有处理信息，系统权限校验是最终边界。'}
          </p>
        </section>
      );
    }

    return (
      <section className="grid gap-3 rounded-md border border-[var(--cma-line)] p-4">
        <div>
          <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
            {report.sourceFreeze?.state === 'in_progress'
              ? '继续固定报告依据'
              : '不可逆固定报告依据'}
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            当前操作目标：{targetLabel}。
            {report.sourceFreeze?.state === 'in_progress'
              ? '系统将沿用首次确定的说明与范围；继续处理不会生成新流程，也不会撤销已经固定的资料。'
              : '首次发起只面向已确认、已锁定且通过安全资格检查的报告。'}
          </p>
        </div>
        {workflow.canStartSourceFreeze ? (
          <Button onClick={workflow.openSourceFreeze}>
            准备固定报告依据
          </Button>
        ) : workflow.canResumeSourceFreeze ? (
          <Button onClick={workflow.openSourceFreezeResume}>
            准备继续固定报告依据
          </Button>
        ) : (
          <p className="text-sm leading-6 text-[var(--cma-muted)]">
            当前报告尚未满足固定报告依据的条件，请先完成报告确认和锁定，并核对最新状态。
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
            ? '二次确认不可逆固定报告依据'
            : '二次确认继续同一固定流程'}
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          当前报告版本：{targetLabel}；状态：
          {clinicalReportStatusLabels[report.status]}；报告锁定时间：
          {formatClinicalReportDate(report.lockedAt)}。本次操作基于最近加载于{' '}
          {formatClinicalReportDate(draft.baseUpdatedAt)} 的报告内容。
        </p>
      </div>

      {!isStart && report.sourceFreeze ? (
        <div className="grid gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4 text-sm sm:grid-cols-2">
          <div><p className="font-semibold text-[var(--cma-muted)]">流程开始时间</p><p className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.sourceFreeze.startedAt)}</p></div>
          <div><p className="font-semibold text-[var(--cma-muted)]">资料固定时间</p><p className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.sourceFreeze.sourceLockedAt)}</p></div>
          <div className="sm:col-span-2"><p className="font-semibold text-[var(--cma-muted)]">首次流程说明（只读）</p><p className="mt-1 whitespace-pre-wrap text-[var(--cma-text-strong)]">{draft.freezeNote}</p></div>
        </div>
      ) : (
        <div className="grid gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4 text-sm sm:grid-cols-3">
          <div><p className="font-semibold text-[var(--cma-muted)]">报告状态</p><p className="mt-1 text-[var(--cma-text-strong)]">{clinicalReportStatusLabels[report.status]}</p></div>
          <div><p className="font-semibold text-[var(--cma-muted)]">报告锁定时间</p><p className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.lockedAt)}</p></div>
          <div><p className="font-semibold text-[var(--cma-muted)]">最近更新时间</p><p className="mt-1 text-[var(--cma-text-strong)]">{formatClinicalReportDate(report.updatedAt)}</p></div>
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
              ? '系统已存在固定报告依据的流程，本地首次说明尚未提交'
              : latestCompleted
                ? isStart
                  ? '报告依据已由其他操作固定，本地说明未写入'
                  : '报告依据已由其他操作固定，当前继续确认已失效'
                : '当前确认内容已过期'}
          </p>
          <p className="mt-1 text-sm leading-6">
            {latestStartedExisting
              ? '继续处理必须使用首次保存的流程说明；系统不会静默替换或提交当前本地说明。'
              : '确认项已清除，原请求没有自动重新提交，也没有覆盖其他操作者结果。'}
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
              固定报告依据的流程说明（必填）
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
            请输入 3–2000 个字符；系统不会自动生成或预填其他流程说明，此内容不属于报告正文。
          </p>
        </div>
      ) : (
        <p className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] px-4 py-3 text-sm leading-6 text-[var(--cma-muted)]">
          继续处理不会创建新流程，不会覆盖首次说明或发起人，也不会撤销已经固定的评估资料。操作将使用上方只读说明。
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
            ? '我已核对当前已确认并锁定的报告，理解固定报告依据不可逆，且该操作可能分步完成。'
            : '我理解当前流程可能已部分完成，并确认继续使用首次确定的范围和说明完成同一流程。'}
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
            ? '正在固定报告依据'
            : isStart
              ? '确认固定报告依据'
              : '确认继续同一流程'}
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
          该操作可能分步执行；系统不会根据耗时猜测进度，也不会自动轮询、重试或恢复。
        </p>
      ) : null}
    </section>
  );
}
