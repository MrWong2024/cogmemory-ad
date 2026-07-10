import { Badge, type BadgeTone } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { ItemEvidenceRequirements } from '@/src/features/assessments/components/ItemEvidenceRequirements';
import { ItemPromptEditor } from '@/src/features/assessments/components/ItemPromptEditor';
import { ItemStepEditor } from '@/src/features/assessments/components/ItemStepEditor';
import { ItemTimingEditor } from '@/src/features/assessments/components/ItemTimingEditor';
import {
  getItemResponseReadOnlyReason,
  itemResponseAnswerSourceLabels,
  itemResponseStatusLabels,
  scaleResponseTypeLabels,
} from '@/src/features/assessments/lib/assessment-execution-display';
import {
  itemAllowsTiming,
  setItemDraftMissing,
  type ItemDraftState,
} from '@/src/features/assessments/lib/item-response-draft';
import type {
  ItemResponseExecution,
  ItemResponseStatus,
} from '@/src/features/assessments/types/item-response-execution';
import type { ItemMediaDrafts } from '@/src/features/assessments/types/media-evidence-draft';
import type {
  EvidenceRequirementState,
  SupportedMediaEvidenceType,
} from '@/src/features/assessments/types/media-evidence';

export type ItemSaveFeedback = {
  kind: 'success' | 'error' | 'info';
  message: string;
};

const inputClassName =
  'min-h-11 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-base text-[var(--cma-text-strong)] outline-none transition-colors placeholder:text-[var(--cma-subtle)] focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)] disabled:text-[var(--cma-muted)]';

const itemStatusTones: Record<ItemResponseStatus, BadgeTone> = {
  not_started: 'neutral',
  in_progress: 'info',
  answered: 'success',
  scored: 'success',
  locked: 'warning',
  voided: 'warning',
};

function getResponseTextLabel(item: ItemResponseExecution): string {
  if (
    item.responseType === 'boolean' ||
    item.responseType === 'number'
  ) {
    return '补充原始回答转录（可选）';
  }

  if (
    item.responseType === 'single_choice' ||
    item.responseType === 'multi_choice'
  ) {
    return '原始回答转录';
  }

  if (
    item.responseType === 'drawing' ||
    item.responseType === 'photo_upload' ||
    item.responseType === 'handwriting'
  ) {
    return '结果文字说明 / 原始转录';
  }

  if (item.responseType === 'multi_step_calculation') {
    return '题目整体原始回答（可选）';
  }

  if (item.responseType === 'timed_task') {
    return '计时任务结果原始记录';
  }

  return '原始回答文本';
}

function getBooleanSelectValue(
  value: ItemDraftState['rawResponse'],
): string {
  if (value === true) {
    return 'true';
  }

  if (value === false) {
    return 'false';
  }

  return '';
}

export function ItemResponseEditor({
  draft,
  feedback,
  isDirty,
  isSaving,
  item,
  mediaDrafts,
  mediaWritingTypes,
  onChange,
  onEndMediaWrite,
  onEvidenceRequirementChange,
  onMediaDraftChange,
  onSave,
  onTryBeginMediaWrite,
  pageReadOnlyReason,
  patientId,
  scaleInstanceId,
  visitId,
}: {
  draft: ItemDraftState;
  feedback: ItemSaveFeedback | null;
  isDirty: boolean;
  isSaving: boolean;
  item: ItemResponseExecution;
  mediaDrafts: ItemMediaDrafts;
  mediaWritingTypes: ReadonlySet<SupportedMediaEvidenceType>;
  onChange: (draft: ItemDraftState) => void;
  onEndMediaWrite: (evidenceType: SupportedMediaEvidenceType) => void;
  onEvidenceRequirementChange: (
    requirement: EvidenceRequirementState,
  ) => void;
  onMediaDraftChange: (
    evidenceType: SupportedMediaEvidenceType,
    draft: ItemMediaDrafts[SupportedMediaEvidenceType] | null,
  ) => void;
  onSave: (markAsAnswered: boolean) => Promise<void>;
  onTryBeginMediaWrite: (
    evidenceType: SupportedMediaEvidenceType,
  ) => boolean;
  pageReadOnlyReason: string | null;
  patientId: string;
  scaleInstanceId: string;
  visitId: string;
}) {
  const itemReadOnlyReason = getItemResponseReadOnlyReason(item.status);
  const readOnlyReason = pageReadOnlyReason ?? itemReadOnlyReason;
  const controlsDisabled = Boolean(readOnlyReason) || isSaving;
  const answerInputsDisabled = controlsDisabled || draft.isMissing;
  const hasStructuredResponse =
    item.structuredResponse !== null &&
    Object.keys(item.structuredResponse).length > 0;
  const hasPreservedRawResponse =
    item.rawResponse !== null &&
    item.responseType !== 'boolean' &&
    item.responseType !== 'number';
  const saveDraftLabel = item.status === 'answered' ? '保存修改' : '保存草稿';
  const markAnsweredLabel =
    item.status === 'answered'
      ? '保存并保持本题完成'
      : '保存并标记本题完成';

  function updateDraft(nextDraft: ItemDraftState) {
    onChange(nextDraft);
  }

  return (
    <article
      className="grid gap-5 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-5 shadow-[var(--cma-shadow-soft)]"
      id={`item-${item.id}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--cma-line)] pb-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--cma-primary)]">
            第 {item.itemOrder} 题 · {scaleResponseTypeLabels[item.responseType]}
          </p>
          <h3 className="mt-2 text-2xl font-semibold leading-9 text-[var(--cma-text-strong)]">
            {item.itemTitle || item.itemCode}
          </h3>
          <p className="mt-2 break-words text-sm leading-6 text-[var(--cma-muted)]">
            题目编码：{item.itemCode}
            {item.crfCode ? ` · CRF：${item.crfCode}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isDirty ? <Badge tone="warning">有未保存修改</Badge> : null}
          <Badge tone={itemStatusTones[item.status]}>
            {itemResponseStatusLabels[item.status]}
          </Badge>
        </div>
      </header>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-sm font-semibold text-[var(--cma-muted)]">
            作答类型
          </dt>
          <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
            {scaleResponseTypeLabels[item.responseType]}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-[var(--cma-muted)]">
            是否计入总分
          </dt>
          <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
            {item.countsTowardTotal ? '服务端标识：计入' : '服务端标识：不计入'}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-[var(--cma-muted)]">
            回答来源
          </dt>
          <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
            {itemResponseAnswerSourceLabels[item.answerSource]}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-[var(--cma-muted)]">
            认知域编码
          </dt>
          <dd className="mt-1 break-words text-base text-[var(--cma-text-strong)]">
            {item.cognitiveDomainCodes.length > 0
              ? item.cognitiveDomainCodes.join('、')
              : '—'}
          </dd>
        </div>
      </dl>

      {item.config.prompt ? (
        <section className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] p-4">
          <h4 className="font-semibold text-[var(--cma-info)]">题目提示</h4>
          <p className="mt-2 whitespace-pre-wrap text-lg leading-8 text-[var(--cma-text-strong)]">
            {item.config.prompt}
          </p>
        </section>
      ) : null}

      {item.config.instruction ? (
        <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
          <h4 className="font-semibold text-[var(--cma-text-strong)]">
            操作说明 / 指导语
          </h4>
          <p className="mt-2 whitespace-pre-wrap text-lg leading-8 text-[var(--cma-text-strong)]">
            {item.config.instruction}
          </p>
        </section>
      ) : null}

      <ItemEvidenceRequirements
        drafts={mediaDrafts}
        item={item}
        onDraftChange={onMediaDraftChange}
        onEndWrite={onEndMediaWrite}
        onRequirementChange={onEvidenceRequirementChange}
        onTryBeginWrite={onTryBeginMediaWrite}
        pageReadOnlyReason={pageReadOnlyReason}
        patientId={patientId}
        scaleInstanceId={scaleInstanceId}
        visitId={visitId}
        writingTypes={mediaWritingTypes}
      />

      {readOnlyReason ? (
        <p
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-warning)]"
          role="status"
        >
          {readOnlyReason} 已有安全草稿仍保留展示，但不能编辑或保存。
        </p>
      ) : null}

      {hasStructuredResponse ? (
        <p className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] px-4 py-3 text-sm leading-6 text-[var(--cma-info)]">
          服务端已返回非空结构化草稿记录。本页不展示或编辑原始 JSON，普通保存也不会回传该字段，因此未编辑时由服务端原样保留。
        </p>
      ) : null}

      {hasPreservedRawResponse ? (
        <p className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] px-4 py-3 text-sm leading-6 text-[var(--cma-info)]">
          服务端已返回原始响应值。本页不会输出或任意编辑该值；普通文字保存不回传 rawResponse，因此未编辑时由服务端原样保留。
        </p>
      ) : null}

      <section
        aria-labelledby={`${item.id}-answer-title`}
        className="grid gap-4"
      >
        <div>
          <h4
            className="text-lg font-semibold text-[var(--cma-text-strong)]"
            id={`${item.id}-answer-title`}
          >
            原始作答记录
          </h4>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            本页只保存原始作答草稿，不执行自动匹配、正确性判断或评分。
          </p>
        </div>

        {item.responseType === 'boolean' ? (
          <div className="grid max-w-xl gap-2">
            <label
              className="font-semibold text-[var(--cma-text-strong)]"
              htmlFor={`${item.id}-boolean-response`}
            >
              原始布尔记录
            </label>
            <select
              className={inputClassName}
              disabled={answerInputsDisabled}
              id={`${item.id}-boolean-response`}
              onChange={(event) =>
                updateDraft({
                  ...draft,
                  rawResponse:
                    event.target.value === ''
                      ? null
                      : event.target.value === 'true',
                })
              }
              value={getBooleanSelectValue(draft.rawResponse)}
            >
              <option value="">未记录</option>
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
            <p className="text-sm leading-6 text-[var(--cma-muted)]">
              “是 / 否”仅表示原始布尔记录，不代表正确或错误。
            </p>
          </div>
        ) : null}

        {item.responseType === 'number' ? (
          <div className="grid max-w-xl gap-2">
            <label
              className="font-semibold text-[var(--cma-text-strong)]"
              htmlFor={`${item.id}-number-response`}
            >
              原始数值记录
            </label>
            <input
              className={inputClassName}
              disabled={answerInputsDisabled}
              id={`${item.id}-number-response`}
              inputMode="decimal"
              onChange={(event) =>
                updateDraft({
                  ...draft,
                  rawResponseInput: event.target.value,
                  rawResponseTouched: true,
                })
              }
              step="any"
              type="number"
              value={draft.rawResponseInput}
            />
            <p className="text-sm leading-6 text-[var(--cma-muted)]">
              空值保存为 null；非空值必须是有限 number。本页不据此计算得分。
            </p>
          </div>
        ) : null}

        <div className="grid gap-2">
          <label
            className="font-semibold text-[var(--cma-text-strong)]"
            htmlFor={`${item.id}-response-text`}
          >
            {getResponseTextLabel(item)}
          </label>
          <textarea
            className={`${inputClassName} min-h-32 resize-y`}
            disabled={answerInputsDisabled}
            id={`${item.id}-response-text`}
            maxLength={10000}
            onChange={(event) =>
              updateDraft({ ...draft, responseText: event.target.value })
            }
            value={draft.responseText}
          />
          <p className="text-sm leading-6 text-[var(--cma-muted)]">
            {item.responseType === 'single_choice' ||
            item.responseType === 'multi_choice'
              ? 'A14 未返回选项配置，因此这里只转录原始回答，不生成选项，也不把文本解释为评分结果。'
              : '最多 10000 个字符，仅作为原始文字记录。'}
          </p>
        </div>
      </section>

      <ItemStepEditor
        answerDisabled={answerInputsDisabled}
        disabled={controlsDisabled}
        draft={draft}
        item={item}
        onChange={updateDraft}
      />

      <ItemPromptEditor
        answerDisabled={answerInputsDisabled}
        disabled={controlsDisabled}
        draft={draft}
        item={item}
        onChange={updateDraft}
      />

      {itemAllowsTiming(item) ? (
        <ItemTimingEditor
          disabled={controlsDisabled}
          draft={draft}
          item={item}
          onChange={updateDraft}
        />
      ) : null}

      <section className="grid gap-4 rounded-md border border-[var(--cma-line)] p-4">
        <div className="flex items-start gap-3">
          <input
            checked={draft.isMissing}
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)]"
            disabled={controlsDisabled}
            id={`${item.id}-is-missing`}
            onChange={(event) =>
              updateDraft(setItemDraftMissing(draft, event.target.checked))
            }
            type="checkbox"
          />
          <div>
            <label
              className="font-semibold text-[var(--cma-text-strong)]"
              htmlFor={`${item.id}-is-missing`}
            >
              本题无法完成 / 缺失记录
            </label>
            <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
              开启后会清空本地实际作答、分步实际值和提示后回答；分步 / 提示备注、计时草稿和操作者备注会保留。
            </p>
          </div>
        </div>
        <div className="grid gap-2">
          <label
            className="font-semibold text-[var(--cma-text-strong)]"
            htmlFor={`${item.id}-missing-reason`}
          >
            缺失原因{draft.isMissing ? '（必填）' : ''}
          </label>
          <textarea
            className={`${inputClassName} min-h-24 resize-y`}
            disabled={controlsDisabled || !draft.isMissing}
            id={`${item.id}-missing-reason`}
            maxLength={1000}
            onChange={(event) =>
              updateDraft({ ...draft, missingReason: event.target.value })
            }
            value={draft.missingReason}
          />
        </div>
      </section>

      <section className="grid gap-2">
        <label
          className="font-semibold text-[var(--cma-text-strong)]"
          htmlFor={`${item.id}-operator-note`}
        >
          操作者备注
          {item.config.requiresOperatorNote ? '（量表配置要求记录）' : ''}
        </label>
        <textarea
          className={`${inputClassName} min-h-28 resize-y`}
          disabled={controlsDisabled}
          id={`${item.id}-operator-note`}
          maxLength={4000}
          onChange={(event) =>
            updateDraft({ ...draft, operatorNote: event.target.value })
          }
          value={draft.operatorNote}
        />
        <p className="text-sm leading-6 text-[var(--cma-muted)]">
          {item.config.requiresOperatorNote
            ? '量表配置标识建议记录操作者备注；本阶段不额外强制前端必填。'
            : '可选，最多 4000 个字符。'}
        </p>
      </section>

      {feedback ? (
        <p
          aria-live={feedback.kind === 'success' ? 'polite' : undefined}
          className={
            feedback.kind === 'success'
              ? 'rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-success-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-success)]'
              : feedback.kind === 'info'
                ? 'rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-info)]'
                : 'rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-danger)]'
          }
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      ) : null}

      <footer className="flex flex-wrap gap-3 border-t border-[var(--cma-line)] pt-4">
        <Button
          disabled={controlsDisabled}
          onClick={() => void onSave(false)}
          variant="secondary"
        >
          {isSaving ? '正在保存...' : saveDraftLabel}
        </Button>
        <Button
          disabled={controlsDisabled}
          onClick={() => void onSave(true)}
        >
          {isSaving ? '正在保存...' : markAnsweredLabel}
        </Button>
      </footer>
    </article>
  );
}
