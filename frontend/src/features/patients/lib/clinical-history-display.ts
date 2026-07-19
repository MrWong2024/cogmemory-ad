import type { BadgeTone } from '@/src/components/ui/Badge';
import type {
  ClinicalHistoryAdministrationMode,
  HistorySourceAvailability,
  PatientHistoryQualityStatus,
  PatientHistoryReportStatus,
  PatientHistoryScoreStatus,
  TrendComparisonReasonCode,
  TrendComparisonStatus,
  TrendDataStatus,
  TrendDomainComparisonStatus,
  TrendDomainItemComparisonStatus,
} from '@/src/features/patients/types/clinical-history';

export const historyAvailabilityLabels: Record<
  HistorySourceAvailability,
  string
> = {
  available: '可用',
  source_not_final: '尚未形成最终结果',
  source_voided: '来源已作废',
  source_incomplete: '来源信息不完整',
};

export const historyAvailabilityTones: Record<
  HistorySourceAvailability,
  BadgeTone
> = {
  available: 'success',
  source_not_final: 'neutral',
  source_voided: 'warning',
  source_incomplete: 'warning',
};

export const historyReportSummaryLabels = {
  none: '暂无临床报告',
  available: '报告版本关系可用',
  incomplete: '报告历史关系不完整',
} as const;

export const clinicalHistoryAdministrationModeLabels: Record<
  ClinicalHistoryAdministrationMode,
  string
> = {
  clinician_administered: '临床人员施测',
  supervised_patient_input: '监督下患者录入',
  paper_import: '纸质量表导入',
};

export const patientHistoryScoreStatusLabels: Record<
  PatientHistoryScoreStatus,
  string
> = {
  draft: '草稿',
  computed: '已计算',
  needs_review: '待复核',
  confirmed: '已确认',
  locked: '已锁定',
  voided: '已作废',
};

export const patientHistoryQualityStatusLabels: Record<
  PatientHistoryQualityStatus,
  string
> = {
  unchecked: '未检查',
  passed: '检查通过',
  needs_review: '待复核',
  failed: '完整性检查未通过',
};

export const patientHistoryReportStatusLabels: Record<
  PatientHistoryReportStatus,
  string
> = {
  draft: '草稿',
  pending_confirmation: '待确认',
  confirmed: '已确认',
  archived: '已归档',
  corrected: '已更正',
  voided: '已作废',
};

export const trendDataStatusLabels: Record<TrendDataStatus, string> = {
  available: '数据可用',
  source_missing: '缺少该量表的最终数据',
  source_not_final: '尚未形成最终结果',
  source_voided: '来源已作废',
  source_incomplete: '来源信息不完整',
  source_ambiguous: '存在多份候选量表实例',
};

export const trendDataStatusTones: Record<TrendDataStatus, BadgeTone> = {
  available: 'success',
  source_missing: 'neutral',
  source_not_final: 'neutral',
  source_voided: 'warning',
  source_incomplete: 'warning',
  source_ambiguous: 'warning',
};

export const trendComparisonStatusLabels: Record<
  TrendComparisonStatus,
  string
> = {
  first_point: '首个时间点',
  comparable: '可与紧邻前次比较',
  not_comparable: '与紧邻前次不可比较',
  unavailable: '缺少可比较数据',
};

export const trendDomainComparisonStatusLabels: Record<
  TrendDomainComparisonStatus,
  string
> = {
  comparable: '全部认知域可比较',
  partially_comparable: '部分认知域可比较',
  not_comparable: '认知域不可比较',
  unavailable: '认知域比较不可用',
};

export const trendDomainItemComparisonStatusLabels: Record<
  TrendDomainItemComparisonStatus,
  string
> = {
  comparable: '可与紧邻前次比较',
  not_comparable: '与紧邻前次不可比较',
};

export const trendComparisonReasonLabels: Record<
  TrendComparisonReasonCode,
  string
> = {
  scale_version_changed: '量表版本发生变化',
  crf_version_changed: '病例报告表版本发生变化',
  scoring_rule_version_changed: '评分规则版本发生变化',
  field_encoding_version_changed: '字段编码版本发生变化',
  administration_mode_changed: '施测方式发生变化',
  score_range_changed: '评分范围发生变化',
  version_trace_incomplete: '版本追溯信息不完整',
  source_missing: '存在缺失时间点',
  source_not_final: '存在尚未最终确认的时间点',
  source_voided: '存在已作废时间点',
  source_incomplete: '存在来源信息不完整的时间点',
  source_ambiguous: '存在多份候选来源',
  domain_mapping_version_changed: '认知域映射版本发生变化',
  domain_mapping_source_changed: '认知域映射来源发生变化',
  domain_mapping_mode_changed: '认知域映射方式发生变化',
  domain_set_changed: '认知域集合发生变化',
  domain_range_changed: '认知域评分范围发生变化',
  domain_missing: '部分认知域缺失',
  domain_source_incomplete: '认知域来源信息不完整',
};

export function formatHistoryNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }

  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 4,
  }).format(value);
}

export function formatHistoryPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }

  return `${formatHistoryNumber(value)}%`;
}

export function formatTrendDelta(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }

  return `${value > 0 ? '+' : ''}${formatHistoryNumber(value)}`;
}

export function formatHistoryDuration(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return '—';
  }

  if (value < 1000) {
    return `${formatHistoryNumber(value)} 毫秒`;
  }

  return `${formatHistoryNumber(value / 1000)} 秒`;
}
