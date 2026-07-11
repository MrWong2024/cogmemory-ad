import type { AssessmentExecutionApiErrorKind } from '@/src/features/assessments/api/assessment-execution-api';
import type {
  ScaleInstanceSubmissionDurationSource,
  ScaleSubmissionIssue,
  ScaleSubmissionIssueCode,
  ScaleSubmissionIssueSeverity,
  ScaleSubmissionState,
} from '@/src/features/assessments/types/scale-instance-submission';

type IssueDisplay = {
  title: string;
  description: string;
};

export const scaleSubmissionStateLabels: Record<ScaleSubmissionState, string> = {
  editable: '可继续编辑',
  incomplete: '尚未满足提交条件',
  ready: '已满足提交条件',
  completed: '已完成提交',
  locked: '已锁定',
  voided: '已作废',
  patient_inactive: '患者当前不是活动状态',
  visit_not_editable: '访视当前不可编辑',
};

export const scaleSubmissionDurationSourceLabels: Record<
  ScaleInstanceSubmissionDurationSource,
  string
> = {
  existing_instance_start: '使用实例开始时间计算',
  earliest_item_timing: '使用最早题目计时计算',
  unavailable: '无法确定开始时间',
};

export const scaleSubmissionSeverityLabels: Record<
  ScaleSubmissionIssueSeverity,
  string
> = {
  blocking: '阻断问题',
  warning: '警告',
};

const issueDisplays: Record<ScaleSubmissionIssueCode, IssueDisplay> = {
  SCALE_INSTANCE_ITEM_SET_MISMATCH: {
    title: '量表题目集合不一致',
    description:
      '当前量表题目记录与所绑定版本不一致，请重新加载；如仍存在，请联系管理员。',
  },
  SCALE_INSTANCE_DURATION_UNAVAILABLE: {
    title: '整份量表总用时不可确定',
    description: '当前无法确定整份量表的总用时，提交后总用时可能为空。',
  },
  SCALE_INSTANCE_START_TIME_INVALID: {
    title: '量表实例开始时间异常',
    description: '量表实例开始时间异常，当前不能提交。',
  },
  ITEM_NOT_COMPLETED: {
    title: '题目尚未完成',
    description: '本题尚未标记完成。',
  },
  ITEM_ANSWER_CONTENT_MISSING: {
    title: '缺少有效作答内容',
    description: '本题虽已标记完成，但没有有效作答内容。',
  },
  ITEM_MISSING_REASON_REQUIRED: {
    title: '缺失原因未填写',
    description: '本题标记为缺失，但尚未填写缺失原因。',
  },
  ITEM_STALE_MISSING_REASON: {
    title: '仍保留历史缺失原因',
    description: '本题当前不是缺失状态，但仍存在历史缺失原因。',
  },
  ITEM_REQUIRED_STEP_MISSING: {
    title: '必需分步记录不完整',
    description: '本题仍有必需的分步记录未填写。',
  },
  ITEM_REQUIRED_TIMING_MISSING: {
    title: '缺少必需计时记录',
    description: '本题需要计时记录，但尚未填写有效用时。',
  },
  ITEM_INVALID_TIMING: {
    title: '计时记录无效',
    description: '本题的计时信息存在时间顺序或格式问题。',
  },
  ITEM_TIMING_POINTS_INCOMPLETE: {
    title: '计时时间点不完整',
    description: '本题已有用时，但开始时间或完成时间记录不完整。',
  },
  ITEM_REQUIRED_MEDIA_MISSING: {
    title: '缺少必需媒体证据',
    description: '本题缺少要求的图片或手写证据。',
  },
  ITEM_EVIDENCE_REFERENCE_INCONSISTENT: {
    title: '媒体证据状态不一致',
    description: '本题媒体证据状态不一致，请重新加载证据列表。',
  },
  ITEM_EVIDENCE_REQUIREMENT_CONFIGURATION_MISMATCH: {
    title: '媒体证据要求配置不一致',
    description: '本题证据要求与运行时记录不一致，请联系管理员。',
  },
  ITEM_REQUIRED_OPERATOR_NOTE_MISSING: {
    title: '缺少操作者备注',
    description: '本题要求记录操作者备注，但当前备注为空。',
  },
};

export function getScaleSubmissionIssueDisplay(
  code: ScaleSubmissionIssueCode,
): IssueDisplay {
  return issueDisplays[code];
}

export function getRequiredEvidenceModeLabel(mode: 'one_of' | 'all'): string {
  return mode === 'one_of' ? '以下证据至少提供一种' : '以下证据均需提供';
}

export function getRequiredEvidenceTypeLabel(
  evidenceType: 'photo' | 'handwriting',
): string {
  return evidenceType === 'photo' ? '图片' : '平板手写';
}

export function buildScaleSubmissionIssueDetails(
  issue: ScaleSubmissionIssue,
): string[] {
  const details: string[] = [];

  if (issue.itemOrder !== undefined) {
    details.push(`题目顺序：${issue.itemOrder}`);
  }
  if (issue.itemTitle) {
    details.push(`题目：${issue.itemTitle}`);
  }
  if (issue.itemCode) {
    details.push(`题目编码：${issue.itemCode}`);
  }
  if (issue.crfCode) {
    details.push(`CRF：${issue.crfCode}`);
  }
  if (issue.groupCode) {
    details.push(`分组编码：${issue.groupCode}`);
  }
  if (issue.missingItemCodes?.length) {
    details.push(`缺少题目编码：${issue.missingItemCodes.join('、')}`);
  }
  if (issue.unexpectedItemCodes?.length) {
    details.push(`异常题目编码：${issue.unexpectedItemCodes.join('、')}`);
  }
  if (issue.missingStepCodes?.length) {
    details.push(`缺少分步编码：${issue.missingStepCodes.join('、')}`);
  }
  if (issue.requiredEvidenceMode) {
    details.push(getRequiredEvidenceModeLabel(issue.requiredEvidenceMode));
  }
  if (issue.requiredEvidenceTypes?.length) {
    details.push(
      `要求的证据：${issue.requiredEvidenceTypes
        .map(getRequiredEvidenceTypeLabel)
        .join('、')}`,
    );
  }

  return details;
}

export function getScaleSubmissionApiErrorMessage(
  kind: AssessmentExecutionApiErrorKind,
): string {
  const messages: Partial<Record<AssessmentExecutionApiErrorKind, string>> = {
    forbidden: '当前账号没有检查或提交该量表实例的权限。',
    validation: '量表提交请求无效，请重新加载页面后再试。',
    patient_not_found: '未找到该患者档案。',
    patient_not_active: '当前患者不是活动状态，不能提交量表实例。',
    visit_not_found: '未找到该评估访视。',
    visit_not_editable: '当前访视状态不可编辑，不能提交量表实例。',
    scale_instance_not_found: '未找到该量表实例。',
    scale_instance_configuration_unavailable:
      '量表实例版本配置暂时不可用，请重新加载；如仍存在，请联系管理员。',
    scale_instance_not_submittable: '当前量表实例状态不允许正式提交。',
    scale_instance_not_ready: '提交条件已经变化，请重新检查。',
    scale_instance_start_time_invalid: '量表实例开始时间异常，当前不能提交。',
    scale_instance_submission_confirmation_required:
      '正式提交需要明确确认，请重新检查后再试。',
    scale_instance_submission_conflict:
      '量表实例状态已被其他操作更新，请重新检查服务器状态。',
    scale_instance_submission_audit_unavailable:
      '历史提交审计信息不完整，无法确认提交时间或操作者。',
    scale_instance_submission_failed:
      '提交服务失败，当前页面内容已保留，请手工重新检查后再试。',
    service_unavailable: '评估服务暂时不可用，请稍后手工重试。',
  };

  return messages[kind] ?? '暂时无法完成提交操作，请稍后手工重试。';
}
