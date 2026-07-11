import type { ProvisionalScoringApiErrorKind } from '@/src/features/assessments/api/provisional-scoring-api';
import type {
  ScoreComputationWarningCode,
  ScoreItemSource,
  ScoreItemStatus,
  ScoreQualityStatus,
  ScoreResultStatus,
  ScoreReviewReasonCode,
  ScoreReviewStatus,
  ScoringMode,
  ScoringSource,
} from '@/src/features/assessments/types/provisional-scoring';

export const scoreResultStatusLabels: Record<ScoreResultStatus, string> = {
  draft: '评分结果尚未完成',
  computed: '阶段性评分已计算，尚未最终确认',
  needs_review: '阶段性计算已完成，存在待人工复核项目',
  confirmed: '已确认评分结果（本页只读）',
  locked: '已锁定评分结果（本页只读）',
  voided: '评分结果已作废（本页只读）',
};

export const scoringSourceLabels: Record<ScoringSource, string> = {
  auto_rule: '规则自动计算',
  manual: '当前项目需人工评分',
  imported: '导入评分',
  mixed: '自动计算与人工复核并存',
};

export const scoringModeLabels: Record<ScoringMode, string> = {
  rule_based: '规则评分',
  manual_summary: '人工汇总',
  imported: '导入评分',
};

export const scoreItemStatusLabels: Record<ScoreItemStatus, string> = {
  not_scored: '尚未评分',
  auto_scored: '已自动计算阶段性分值',
  manual_scored: '服务端已有人工分值',
  needs_review: '待人工复核',
};

export const scoreItemSourceLabels: Record<ScoreItemSource, string> = {
  none: '暂无评分来源',
  auto_rule: '规则自动计算',
  operator: '操作者记录',
  imported: '导入记录',
};

export const scoreReviewStatusLabels: Record<ScoreReviewStatus, string> = {
  not_required: '当前无需人工复核',
  pending: '等待人工复核',
  reviewed: '服务端标记为已复核',
  rejected: '服务端标记为复核未通过',
};

export const scoreQualityStatusLabels: Record<ScoreQualityStatus, string> = {
  unchecked: '尚未进行进一步质量确认',
  passed: '评分复核流程已通过',
  needs_review: '结果需要复核',
  failed: '服务端标记为质量检查未通过',
};

const reasonMessages: Record<ScoreReviewReasonCode, string> = {
  MANUAL_SCORING_REQUIRED: '本题需要由专业人员进行人工评分复核。',
  UNSUPPORTED_SCORING_MODE:
    '当前评分模式暂不支持可靠自动计算，需要人工复核。',
  MISSING_RESPONSE_REQUIRES_REVIEW:
    '本题记录为缺失，不能自动按零分处理，需要人工复核。',
  PREEXISTING_ITEM_SCORE_REQUIRES_REVIEW:
    '本题存在既有评分记录，需要人工核对后再确认。',
  STEP_CONFIGURATION_INVALID:
    '本题分步评分配置不完整或不一致，需要人工复核。',
  STEP_RESPONSE_MISSING:
    '本题缺少自动评分所需的分步记录，需要人工复核。',
  STEP_RESPONSE_TYPE_UNSUPPORTED:
    '本题分步作答类型无法安全自动计算，需要人工复核。',
  AGGREGATION_RULE_UNSUPPORTED:
    '本题聚合规则暂不支持可靠自动计算，需要人工复核。',
  AGGREGATION_RULE_INVALID: '本题聚合规则配置异常，需要人工复核。',
  ITEM_SCORE_RANGE_INVALID: '本题分值范围配置异常，需要人工复核。',
  AUTO_SCORE_RESULT_INVALID:
    '自动计算结果未通过安全校验，需要人工复核。',
  NON_SCORING_PROCESS_ITEM: '本题属于过程记录，不计入总分。',
};

const warningMessages: Record<ScoreComputationWarningCode, string> = {
  NO_SCORING_ITEMS: '当前量表结果没有可计分项目，请核对量表配置。',
  UNKNOWN_GROUP_CONFIGURATION:
    '部分题目的分组配置无法完整匹配，分组汇总可能不完整。',
};

export function isScoreReviewReasonCode(
  reasonCode: unknown,
): reasonCode is ScoreReviewReasonCode {
  return typeof reasonCode === 'string' && reasonCode in reasonMessages;
}

export function isScoreComputationWarningCode(
  warningCode: unknown,
): warningCode is ScoreComputationWarningCode {
  return typeof warningCode === 'string' && warningCode in warningMessages;
}

export function getScoreReviewReasonMessage(reasonCode: unknown): string {
  return isScoreReviewReasonCode(reasonCode)
    ? reasonMessages[reasonCode]
    : '本题需要人工评分复核。';
}

export function getScoreComputationWarningMessage(
  warningCode: unknown,
): string {
  return isScoreComputationWarningCode(warningCode)
    ? warningMessages[warningCode]
    : '评分计算包含一项需要管理员核对的配置提示。';
}

export function formatProvisionalScoreNumber(
  value: number | null | undefined,
): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : '—';
}

export function formatProvisionalScorePercent(
  value: number | null | undefined,
): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value}%`
    : '—';
}

export function formatProvisionalScoreDate(value: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '时间暂不可用'
    : new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

export function getProvisionalScoringApiErrorMessage(
  kind: ProvisionalScoringApiErrorKind,
): string {
  const messages: Record<ProvisionalScoringApiErrorKind, string> = {
    unauthenticated: '登录状态已失效，请重新登录。',
    forbidden: '当前账号没有查看或计算阶段性评分的权限。',
    validation: '评分请求无效，请重新加载页面后再试。',
    patient_not_found: '未找到该患者档案。',
    patient_not_active: '当前患者不是活动状态，无法首次生成评分结果。',
    visit_not_found: '未找到该评估访视。',
    visit_not_editable: '当前访视状态不允许首次生成评分结果。',
    scale_instance_not_found: '未找到该量表实例，或实例不属于当前访视。',
    scale_instance_configuration_unavailable:
      '量表版本配置暂时不可用，当前无法计算评分。',
    score_computation_confirmation_required:
      '请确认理解阶段性评分的性质后再开始计算。',
    score_instance_not_computable:
      '当前量表实例尚未正式完成，不能计算评分。',
    score_input_invalid:
      '评分输入与量表版本不一致，请联系管理员核对数据。',
    score_result_not_found: '当前尚未生成阶段性评分。',
    score_result_incomplete:
      '当前存在未完成的内部评分记录，系统不能自动修复，请联系管理员。',
    score_result_voided: '当前评分结果已作废，现阶段不支持重新计算。',
    score_result_not_reviewable: '当前评分结果状态不允许继续人工复核。',
    score_item_not_found: '未找到该评分项目，请重新加载评分结果。',
    score_item_not_reviewable:
      '当前项目不允许人工评分；自动评分和过程记录不能被人工覆盖。',
    score_item_review_target_unavailable:
      '当前评分项目无法关联到原题，请重新加载或联系管理员。',
    score_manual_value_out_of_range: '人工分值超出该题允许范围。',
    score_manual_value_step_invalid:
      '人工分值不符合该题的计分步长，请按量表规则调整。',
    score_result_metadata_unsupported:
      '评分审计数据结构异常，当前不能继续写入，请联系管理员。',
    score_review_audit_limit_reached:
      '当前评分结果已达到人工修订审计上限，不能继续修改。',
    score_result_review_conflict:
      '评分结果已被其他操作更新，请重新核对最新结果后再提交。',
    score_result_review_failed: '人工评分保存失败，请保留当前输入并稍后重试。',
    score_result_confirmation_required: '请明确勾选确认后再提交评分确认。',
    score_result_not_ready_for_confirmation:
      '当前仍有项目未完成评分，暂不能确认。',
    score_result_confirmation_warnings_present:
      '当前评分结果仍存在计算警告，不能完成最终确认。',
    score_result_confirmation_conflict:
      '评分结果已发生变化，请重新核对最新结果后再确认。',
    score_result_confirmation_audit_unavailable:
      '历史确认审计信息不完整，不能安全推断确认记录。',
    score_result_confirmation_failed:
      '评分结果确认失败，请重新加载最新结果后重试。',
    score_computation_conflict:
      '评分状态发生并发变化，请重新加载最新结果。',
    score_computation_failed:
      '阶段性评分计算失败，请稍后重新查询结果。',
    service_unavailable: '评分服务暂时不可用，请稍后重试。',
    unknown: '暂时无法完成评分操作，请稍后手工重新加载结果。',
  };

  return messages[kind];
}
