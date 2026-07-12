import { Button } from '@/src/components/ui/Button';
import type { UseClinicalReportWorkflowValue } from '@/src/features/assessments/hooks/useClinicalReportWorkflow';
import {
  clinicalReportWorkflowLimits,
} from '@/src/features/assessments/lib/clinical-report-workflow-draft';
import {
  formatClinicalReportDate,
  getClinicalReportApiErrorMessage,
} from '@/src/features/assessments/lib/clinical-report-display';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';

function CharacterCount({ value, max }: { value: string; max: number }) {
  return (
    <span className="text-sm text-[var(--cma-muted)]">
      {value.length} / {max}
    </span>
  );
}

export function ClinicalReportDraftEditor({
  report,
  workflow,
}: {
  report: ClinicalReport;
  workflow: UseClinicalReportWorkflowValue;
}) {
  if (workflow.activeMode !== 'edit' || !workflow.editDraft) {
    if (!workflow.canEdit) return null;
    return (
      <section className="grid gap-3 rounded-md border border-[var(--cma-line)] p-4">
        <div>
          <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
            补充临床人员内容
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            仅可编辑医生意见与临床人员补充建议；服务端规则化五段摘要和全部快照保持只读。
          </p>
        </div>
        <Button onClick={workflow.openEdit}>编辑临床人员内容</Button>
      </section>
    );
  }

  const draft = workflow.editDraft;
  const isWriting = workflow.writingAction === 'edit';
  const fieldsDisabled = isWriting || report.status !== 'draft';

  return (
    <section
      aria-labelledby="clinical-report-edit-heading"
      className="grid gap-5 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface-muted)] p-5"
    >
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-edit-heading"
        >
          编辑临床人员补充内容
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          乐观并发基线：{formatClinicalReportDate(draft.baseUpdatedAt)}。系统不会自动生成、改写、审核或解释以下文本。
        </p>
      </div>

      {draft.stale ? (
        <div
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-[var(--cma-warning)]"
          role="alert"
        >
          <p className="font-semibold">本地表单已过期</p>
          <p className="mt-1 text-sm leading-6">
            报告已被其他操作更新。本地医生意见、建议与编辑说明均已保留；系统没有自动覆盖或重发保存请求。请核对最新服务端内容后明确继续。
          </p>
          <div className="mt-3 grid gap-2 text-sm leading-6">
            <p>
              最新服务端医生意见：
              {report.narrative?.doctorOpinion?.trim() || '未填写'}
            </p>
            <p>
              最新服务端补充建议：
              {report.narrative?.recommendationText?.trim() || '未填写'}
            </p>
          </div>
          <Button
            className="mt-3"
            disabled={isWriting}
            onClick={workflow.continueEditFromLatest}
            size="sm"
            variant="secondary"
          >
            基于最新报告继续
          </Button>
        </div>
      ) : null}

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            className="text-base font-semibold text-[var(--cma-text-strong)]"
            htmlFor="clinical-report-doctor-opinion"
          >
            医生意见（必填）
          </label>
          <CharacterCount
            max={clinicalReportWorkflowLimits.doctorOpinion.max}
            value={draft.doctorOpinion}
          />
        </div>
        <textarea
          className="min-h-36 w-full rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-3 text-base leading-7 text-[var(--cma-text-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)] disabled:opacity-60"
          disabled={fieldsDisabled}
          id="clinical-report-doctor-opinion"
          maxLength={clinicalReportWorkflowLimits.doctorOpinion.max}
          onChange={(event) =>
            workflow.updateEditDraft('doctorOpinion', event.target.value)
          }
          value={draft.doctorOpinion}
        />
        <p className="text-sm text-[var(--cma-muted)]">trim 后 3–4000 个字符。</p>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            className="text-base font-semibold text-[var(--cma-text-strong)]"
            htmlFor="clinical-report-recommendation"
          >
            临床人员补充建议（可选）
          </label>
          <CharacterCount
            max={clinicalReportWorkflowLimits.recommendationText.max}
            value={draft.recommendationText}
          />
        </div>
        <textarea
          className="min-h-32 w-full rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-3 text-base leading-7 text-[var(--cma-text-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)] disabled:opacity-60"
          disabled={fieldsDisabled}
          id="clinical-report-recommendation"
          maxLength={clinicalReportWorkflowLimits.recommendationText.max}
          onChange={(event) =>
            workflow.updateEditDraft('recommendationText', event.target.value)
          }
          value={draft.recommendationText}
        />
        <p className="text-sm text-[var(--cma-muted)]">
          留空并保存表示清除现有建议；非空时 trim 后 3–4000 个字符。
        </p>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            className="text-base font-semibold text-[var(--cma-text-strong)]"
            htmlFor="clinical-report-edit-note"
          >
            本次编辑审计说明（必填）
          </label>
          <CharacterCount
            max={clinicalReportWorkflowLimits.editNote.max}
            value={draft.editNote}
          />
        </div>
        <textarea
          className="min-h-24 w-full rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-3 py-3 text-base leading-7 text-[var(--cma-text-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)] disabled:opacity-60"
          disabled={fieldsDisabled}
          id="clinical-report-edit-note"
          maxLength={clinicalReportWorkflowLimits.editNote.max}
          onChange={(event) =>
            workflow.updateEditDraft('editNote', event.target.value)
          }
          value={draft.editNote}
        />
        <p className="text-sm text-[var(--cma-muted)]">
          仅用于本次受控编辑审计，不会自动复用历史说明。
        </p>
      </div>

      {workflow.editError ? (
        <p
          className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-base text-[var(--cma-danger)]"
          role="alert"
        >
          {workflow.editError.kind === 'forbidden'
            ? '当前账号无权保存报告编辑；已加载报告和本地输入均已保留。'
            : getClinicalReportApiErrorMessage(workflow.editError.kind)}
        </p>
      ) : null}

      {!workflow.editValidation.valid && workflow.editValidation.message ? (
        <p className="text-sm leading-6 text-[var(--cma-muted)]">
          {workflow.editValidation.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          disabled={!workflow.canSaveEdit}
          onClick={() => void workflow.saveEdit()}
        >
          {isWriting ? '正在保存受控编辑' : '保存受控编辑'}
        </Button>
        <Button
          disabled={isWriting}
          onClick={workflow.cancelActive}
          variant="secondary"
        >
          放弃本地修改
        </Button>
      </div>
    </section>
  );
}
