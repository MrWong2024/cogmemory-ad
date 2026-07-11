import type { CognitiveDomainApiErrorKind } from '@/src/features/assessments/api/cognitive-domain-api';
import type {
  CognitiveDomainItemScoreStatus,
  CognitiveDomainMappingInterpretation,
  CognitiveDomainMappingMode,
  CognitiveDomainMappingSource,
  CognitiveDomainQualityStatus,
  CognitiveDomainResultStatus,
  CognitiveDomainReviewStatus,
} from '@/src/features/assessments/types/cognitive-domain-result';

const domainLabels: Record<string, string> = {
  abstraction: '抽象能力',
  attention_calculation: '注意与计算',
  executive_function: '执行功能',
  language: '语言',
  memory: '记忆',
  orientation: '定向力',
  visuospatial: '视空间能力',
};

export const cognitiveDomainResultStatusLabels: Record<
  CognitiveDomainResultStatus,
  string
> = {
  draft: '内部认知域结果尚未完成',
  computed: '认知域结果已计算，尚未独立确认',
  needs_review: '认知域结果需要进一步复核（本阶段只读）',
  confirmed: '认知域结果已确认（本阶段只读）',
  locked: '认知域结果已锁定（只读）',
  voided: '认知域结果已作废（只读历史）',
};

export const cognitiveDomainMappingSourceLabels: Record<
  CognitiveDomainMappingSource,
  string
> = {
  scale_config: '量表配置映射',
  manual: '人工映射（历史兼容）',
  imported: '导入映射（历史兼容）',
  mixed: '混合映射（历史兼容）',
};

export const cognitiveDomainMappingModeLabels: Record<
  CognitiveDomainMappingMode,
  string
> = {
  item_domain_codes: '按题目认知域编码映射',
  weighted_mapping: '加权映射（历史兼容，只读）',
  manual_summary: '人工汇总（历史兼容，只读）',
  imported: '导入结果（历史兼容，只读）',
};

export const cognitiveDomainItemScoreStatusLabels: Record<
  CognitiveDomainItemScoreStatus,
  string
> = {
  not_scored: '尚未评分',
  auto_scored: '服务端自动评分',
  manual_scored: '服务端人工评分',
  needs_review: '来源评分需要复核',
};

export const cognitiveDomainReviewStatusLabels: Record<
  CognitiveDomainReviewStatus,
  string
> = {
  not_required: '当前无需独立复核',
  pending: '等待进一步复核',
  reviewed: '服务端标记为已复核',
  rejected: '服务端标记为复核未通过',
};

export const cognitiveDomainQualityStatusLabels: Record<
  CognitiveDomainQualityStatus,
  string
> = {
  unchecked: '尚未进行独立质量确认',
  passed: '认知域结果流程标记已通过',
  needs_review: '认知域结果需要复核',
  failed: '认知域结果质量检查未通过',
};

const scoreSourceLabels: Record<string, string> = {
  auto_rule: '规则自动评分',
  imported: '导入评分',
  none: '暂无评分来源',
  operator: '人工评分记录',
};

const warningMessages: Record<string, string> = {
  COGNITIVE_DOMAIN_COMPUTATION_WARNING:
    '认知域计算包含一项需要管理员核对的内部提示。',
};

export const cognitiveDomainNonDiagnosticStatements = [
  '认知域结果用于展示量表项目在不同认知维度中的映射情况。',
  '结果不能脱离量表、临床访谈和其他检查单独形成诊断。',
  '映射项目得分比例不是正常率、疾病概率或风险值。',
];

export function getCognitiveDomainTitle(
  domainCode: string,
  domainTitle?: string,
): string {
  const returnedTitle = domainTitle?.trim();
  if (returnedTitle) {
    return returnedTitle;
  }

  const normalizedCode = domainCode.trim().toLowerCase();
  return domainLabels[normalizedCode] ?? domainCode;
}

export function getCognitiveDomainScoreSourceLabel(
  scoreSource: string | undefined,
): string {
  if (!scoreSource) {
    return '未提供';
  }

  return scoreSourceLabels[scoreSource] ?? '服务端记录的评分来源';
}

export function getCognitiveDomainWarningMessage(
  warningCode: string,
): string {
  return (
    warningMessages[warningCode] ??
    '认知域计算包含一项需要管理员核对的内部提示。'
  );
}

export function formatCognitiveDomainNumber(
  value: number | null | undefined,
): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : '—';
}

export function formatCognitiveDomainPercent(
  value: number | null | undefined,
): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value}%`
    : '—';
}

export function formatCognitiveDomainDate(
  value: string | null | undefined,
): string {
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

export function isCognitiveDomainInterpretationSafe(
  interpretation: unknown,
): interpretation is CognitiveDomainMappingInterpretation {
  if (
    typeof interpretation !== 'object' ||
    interpretation === null ||
    Array.isArray(interpretation)
  ) {
    return false;
  }

  const value = interpretation as Record<string, unknown>;
  return (
    value.attribution === 'overlapping_full_item_scores' &&
    value.domainScoresAreScaleTotalPartition === false &&
    value.scorePercentIsDiagnosticProbability === false &&
    value.isDiagnosticConclusion === false
  );
}

export function getCognitiveDomainApiErrorMessage(
  kind: CognitiveDomainApiErrorKind,
): string {
  const messages: Record<CognitiveDomainApiErrorKind, string> = {
    unauthenticated: '登录状态已失效，请重新登录。',
    forbidden: '当前账号没有查看或计算认知域结果的权限。',
    validation: '认知域请求无效，请重新加载页面后再试。',
    patient_not_found: '未找到该患者档案。',
    patient_not_active: '当前患者不是活动状态，无法首次计算认知域结果。',
    visit_not_found: '未找到该评估访视。',
    visit_not_editable: '当前访视状态不允许首次计算认知域结果。',
    scale_instance_not_found: '未找到该量表实例，或实例不属于当前访视。',
    scale_instance_configuration_unavailable:
      '量表版本配置暂时不可用，当前无法计算认知域结果。',
    score_result_not_found: '当前尚无可作为认知域来源的评分结果。',
    cognitive_domain_computation_confirmation_required:
      '请明确确认认知域映射口径后再开始计算。',
    cognitive_domain_instance_not_computable:
      '当前量表实例状态不允许首次计算认知域结果。',
    cognitive_domain_source_score_not_final:
      '当前评分结果尚未最终确认，不能计算认知域结果。',
    cognitive_domain_source_score_invalid:
      '当前确认评分未满足认知域计算要求，请重新核对评分结果。',
    cognitive_domain_mapping_unavailable:
      '当前量表没有可用的认知域映射配置。',
    cognitive_domain_input_invalid:
      '认知域输入与量表或评分配置不一致，请联系管理员。',
    cognitive_domain_result_not_found: '当前尚未生成认知域结果。',
    cognitive_domain_result_incomplete:
      '当前存在未完成的内部认知域结果，请联系管理员。',
    cognitive_domain_result_voided:
      '当前认知域结果已作废，A19 不支持重新计算。',
    cognitive_domain_computation_conflict:
      '认知域结果发生并发变化，请重新加载最新结果。',
    cognitive_domain_computation_failed:
      '认知域结果计算失败，请稍后重新查询。',
    service_unavailable: '认知域服务暂时不可用，请稍后重试。',
    unknown: '暂时无法完成认知域操作，请稍后手工重新加载结果。',
  };

  return messages[kind];
}
