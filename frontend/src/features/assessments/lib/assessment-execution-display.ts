import type {
  ScaleAdministrationMode,
  ScaleCapabilities,
} from '@/src/features/assessments/types/assessment-execution';
import type { AssessmentExecutionApiErrorKind } from '@/src/features/assessments/api/assessment-execution-api';
import type {
  ItemEvidenceStatus,
  ItemEvidenceType,
  ItemResponseAnswerSource,
  ItemResponseExecution,
  ItemResponseStatus,
  ItemTimerSource,
  PromptResponseType,
  ScaleExecutionGroup,
  ScaleResponseType,
} from '@/src/features/assessments/types/item-response-execution';
import type {
  AssessmentOperatorRole,
  AssessmentVisitStatus,
} from '@/src/features/patients/types/patient';

export const scaleAdministrationModes: readonly ScaleAdministrationMode[] = [
  'clinician_administered',
  'supervised_patient_input',
  'paper_import',
];

export const scaleAdministrationModeLabels: Record<
  ScaleAdministrationMode,
  string
> = {
  clinician_administered: '医护人员施测',
  supervised_patient_input: '监督下患者作答',
  paper_import: '纸笔结果导入',
};

export const scaleInstanceStatusLabels: Record<
  AssessmentVisitStatus,
  string
> = {
  draft: '草稿',
  in_progress: '进行中',
  completed: '已完成',
  locked: '已锁定',
  voided: '已作废',
};

export const assessmentOperatorRoleLabels: Record<
  AssessmentOperatorRole,
  string
> = {
  doctor: '医生',
  nurse: '护士',
  research_assistant: '研究助理',
  admin: '管理员',
  unknown: '未知',
};

export const scaleResponseTypeLabels: Record<ScaleResponseType, string> = {
  boolean: '原始布尔记录',
  single_choice: '单选原始回答转录',
  multi_choice: '多选原始回答转录',
  number: '原始数值记录',
  text: '原始文本记录',
  drawing: '绘图结果文字说明',
  photo_upload: '图片结果文字说明',
  handwriting: '手写结果文字说明',
  timed_task: '计时任务原始记录',
  multi_step_calculation: '分步计算原始记录',
};

export const itemResponseStatusLabels: Record<ItemResponseStatus, string> = {
  not_started: '未开始',
  in_progress: '草稿记录中',
  answered: '本题已完成',
  scored: '已进入计分状态',
  locked: '已锁定',
  voided: '已作废',
};

export const itemResponseAnswerSourceLabels: Record<
  ItemResponseAnswerSource,
  string
> = {
  clinician_recorded: '医护人员记录',
  supervised_patient_input: '监督下患者输入',
  paper_import: '纸笔结果导入',
  system_generated: '系统生成',
};

export const promptResponseTypeLabels: Record<PromptResponseType, string> = {
  none: '无提示',
  repeat_instruction: '重复指导语',
  semantic_category: '分类提示',
  multiple_choice: '多选提示',
  operator_clarification: '操作者澄清',
  other: '其他提示',
};

export const itemTimerSources: readonly ItemTimerSource[] = [
  'none',
  'system',
  'manual',
  'imported',
];

export const itemTimerSourceLabels: Record<ItemTimerSource, string> = {
  none: '未记录来源',
  system: '系统记录',
  manual: '手工记录',
  imported: '导入记录',
};

export const itemEvidenceTypeLabels: Record<ItemEvidenceType, string> = {
  photo: '图片',
  handwriting: '手写',
  duration: '用时',
  raw_text: '原始文本',
  operator_note: '操作者备注',
  audio: '音频',
  other: '其他证据',
};

export const itemEvidenceStatusLabels: Record<ItemEvidenceStatus, string> = {
  pending: '待记录',
  attached: '服务端已关联',
  missing: '缺失',
  not_required: '无需记录',
};

export type ScaleExecutionGroupSection = ScaleExecutionGroup & {
  itemResponses: ItemResponseExecution[];
  isFallback: boolean;
};

export function getScaleCapabilitySummaries(
  capabilities: ScaleCapabilities,
): string[] {
  const summaries: string[] = [];

  if (capabilities.supportsPhotoUpload) {
    summaries.push('量表配置包含图片证据项目');
  }

  if (capabilities.supportsHandwriting) {
    summaries.push('量表配置包含平板手写项目');
  }

  if (capabilities.requiresTimer) {
    summaries.push('量表配置包含计时项目');
  }

  if (capabilities.supportsRawText) {
    summaries.push('量表配置包含原始文本记录');
  }

  if (capabilities.supportsOperatorNote) {
    summaries.push('量表配置包含操作者备注');
  }

  return summaries;
}

export function formatDuration(durationMs: number | null): string {
  if (durationMs === null || durationMs < 0 || !Number.isFinite(durationMs)) {
    return '—';
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    ...(hours > 0 ? [`${hours} 小时`] : []),
    ...(minutes > 0 ? [`${minutes} 分`] : []),
    ...(seconds > 0 || totalSeconds === 0 ? [`${seconds} 秒`] : []),
  ];

  return parts.join(' ');
}

export function canInitializeScaleForVisit(
  status: AssessmentVisitStatus,
): boolean {
  return status === 'draft' || status === 'in_progress';
}

export function buildScaleExecutionGroupSections(
  groups: ScaleExecutionGroup[],
  itemResponses: ItemResponseExecution[],
): ScaleExecutionGroupSection[] {
  const sortedGroups = [...groups].sort(
    (left, right) => left.order - right.order || left.code.localeCompare(right.code),
  );
  const sections = sortedGroups.map<ScaleExecutionGroupSection>((group) => ({
    ...group,
    itemResponses: [],
    isFallback: false,
  }));
  const sectionsByCode = new Map(
    sections.map((section) => [section.code.toLowerCase(), section]),
  );
  const unmatchedItems: ItemResponseExecution[] = [];

  [...itemResponses]
    .sort(
      (left, right) =>
        left.itemOrder - right.itemOrder ||
        left.itemCode.localeCompare(right.itemCode),
    )
    .forEach((item) => {
      const section = item.groupCode
        ? sectionsByCode.get(item.groupCode.toLowerCase())
        : undefined;

      if (section) {
        section.itemResponses.push(item);
      } else {
        unmatchedItems.push(item);
      }
    });

  if (unmatchedItems.length > 0) {
    sections.push({
      code: '__other_items__',
      title: '其他项目',
      order: Number.MAX_SAFE_INTEGER,
      description: '服务端未提供可匹配分组的安全题目。',
      cognitiveDomainCodes: [],
      itemResponses: unmatchedItems,
      isFallback: true,
    });
  }

  return sections;
}

export function isItemResponseProgressComplete(
  status: ItemResponseStatus,
): boolean {
  return status === 'answered' || status === 'scored';
}

export function getScaleExecutionReadOnlyReason(
  visitStatus: AssessmentVisitStatus,
  scaleInstanceStatus: AssessmentVisitStatus,
): string | null {
  if (
    visitStatus === 'completed' ||
    visitStatus === 'locked' ||
    visitStatus === 'voided'
  ) {
    return `当前访视状态为“${scaleInstanceStatusLabels[visitStatus]}”，量表仅供查看。`;
  }

  if (
    scaleInstanceStatus === 'completed' ||
    scaleInstanceStatus === 'locked' ||
    scaleInstanceStatus === 'voided'
  ) {
    return `当前量表实例状态为“${scaleInstanceStatusLabels[scaleInstanceStatus]}”，仅供查看。`;
  }

  return null;
}

export function getItemResponseReadOnlyReason(
  status: ItemResponseStatus,
): string | null {
  if (status === 'scored') {
    return '本题已进入计分状态，当前页面仅供查看。';
  }

  if (status === 'locked') {
    return '本题已锁定，当前页面仅供查看。';
  }

  if (status === 'voided') {
    return '本题已作废，当前页面仅供查看。';
  }

  return null;
}

export function getItemResponseSaveErrorMessage(
  kind: AssessmentExecutionApiErrorKind,
): string {
  const messages: Partial<Record<AssessmentExecutionApiErrorKind, string>> = {
    validation: '作答内容格式无效，请检查后重试。',
    patient_not_active: '当前患者不是活动状态，无法继续修改作答。',
    visit_not_editable: '当前访视状态不允许修改作答。',
    scale_instance_not_found: '未找到该量表实例，或实例不属于当前访视。',
    scale_instance_not_editable: '当前量表实例状态不允许修改作答。',
    scale_instance_configuration_unavailable:
      '该量表实例的版本配置暂时不可用。',
    item_response_not_found: '未找到该题目记录，请重新加载量表。',
    item_response_not_editable: '当前题目状态不允许修改。',
    item_response_empty_patch: '当前没有需要保存的修改。',
    item_response_payload_invalid: '作答内容格式无效，请检查后重试。',
    item_response_missing_reason_required:
      '标记缺失时必须填写缺失原因。',
    item_response_cannot_mark_answered:
      '请先记录有效作答或缺失原因，再标记本题完成。',
    item_response_step_not_found: '分步记录已变化，请重新加载量表。',
    item_response_duplicate_step: '分步记录重复，请检查后重试。',
    item_response_prompt_not_found: '提示记录已变化，请重新加载量表。',
    item_response_duplicate_prompt: '提示记录重复，请检查后重试。',
    item_response_timing_not_allowed: '当前题目不允许记录计时草稿。',
    item_response_invalid_timing:
      '计时信息无效，请检查开始时间、完成时间和用时。',
    item_response_save_failed: '作答草稿保存失败，请稍后重试。',
    forbidden: '当前账号没有保存作答草稿的权限。',
    service_unavailable: '评估服务暂时不可用，请稍后重试。',
  };

  return messages[kind] ?? '作答草稿保存失败，请稍后重试。';
}
