import type { ClinicalReportApiErrorKind } from '@/src/features/assessments/api/clinical-report-api';
import type {
  ClinicalReportCaptureMode,
  ClinicalReportConfirmationRole,
  ClinicalReportEvidenceType,
  ClinicalReportOperatorRole,
  ClinicalReportPatientSex,
  ClinicalReportQualityStatus,
  ClinicalReportScoreStatus,
  ClinicalReportSource,
  ClinicalReportStatus,
  ClinicalReportType,
  ClinicalReportVisitType,
} from '@/src/features/assessments/types/clinical-report';

export const clinicalReportTypeLabels: Record<ClinicalReportType, string> = {
  cognitive_assessment: '认知评估报告',
  follow_up: '随访报告（历史兼容）',
  research_summary: '研究摘要（历史兼容）',
  other: '其他报告',
};

export const clinicalReportStatusLabels: Record<ClinicalReportStatus, string> = {
  draft: '规则化报告草稿',
  pending_confirmation: '待医生确认',
  confirmed: '已确认报告',
  archived: '已归档报告',
  corrected: '已更正报告',
  voided: '已作废报告',
};

export const clinicalReportSourceLabels: Record<ClinicalReportSource, string> = {
  manual: '人工编制',
  system_draft: '系统规则化草稿',
  ai_draft: '历史 AI 草稿来源',
  imported: '外部导入',
  mixed: '混合来源',
};

export const clinicalReportQualityStatusLabels: Record<
  ClinicalReportQualityStatus,
  string
> = {
  unchecked: '尚未进行进一步质量确认',
  passed: '报告流程质量标记已通过',
  needs_review: '报告包含需要进一步复核的内容或证据索引',
  failed: '报告质量检查未通过',
};

export const clinicalReportPatientSexLabels: Record<
  ClinicalReportPatientSex,
  string
> = {
  male: '男',
  female: '女',
  other: '其他',
  unknown: '未知',
};

export const clinicalReportVisitTypeLabels: Record<
  ClinicalReportVisitType,
  string
> = {
  baseline: '基线访视',
  follow_up: '随访访视',
  screening: '筛查访视',
  unscheduled: '非计划访视',
  other: '其他访视',
};

export const clinicalReportOperatorRoleLabels: Record<
  ClinicalReportOperatorRole,
  string
> = {
  doctor: '医生',
  nurse: '护士',
  research_assistant: '研究助理',
  admin: '管理员',
  unknown: '未知角色',
};

export const clinicalReportConfirmationRoleLabels: Record<
  ClinicalReportConfirmationRole,
  string
> = {
  doctor: '医生',
  admin: '管理员',
  unknown: '未知角色',
};

export const clinicalReportScoreStatusLabels: Record<
  ClinicalReportScoreStatus,
  string
> = {
  draft: '评分草稿',
  computed: '已计算',
  not_scored: '未评分',
  auto_scored: '自动评分',
  manual_scored: '人工评分',
  needs_review: '需要复核',
  confirmed: '已确认',
  locked: '已锁定',
  voided: '已作废',
};

export const clinicalReportEvidenceTypeLabels: Record<
  ClinicalReportEvidenceType,
  string
> = {
  photo: '照片证据',
  handwriting: '手写证据',
  document_scan: '文档扫描索引',
  audio: '音频索引',
  raw_text_snapshot: '文本快照索引',
  duration: '用时记录',
  operator_note: '操作者备注索引',
  other: '其他证据索引',
};

export const clinicalReportCaptureModeLabels: Record<
  ClinicalReportCaptureMode,
  string
> = {
  photo_upload: '照片上传',
  tablet_handwriting: '平板手写',
  paper_scan: '纸张扫描',
  system_generated: '系统生成',
  imported: '外部导入',
  other: '其他采集方式',
};

export const clinicalReportDraftBoundaryStatements = [
  '本次内容是访视级临床认知评估报告的结构化规则草稿。',
  '系统规则化草稿不等于医生结论；draft 报告尚未经医生确认。',
  '当前 A20 规则化草稿生成流程不调用 AI。',
  'A20 不读取原始作答自由文本生成诊断意见，也不分析图片或手写内容。',
  '报告不包含诊断阈值、正常或异常判断、疾病风险等级或治疗建议。',
  '认知域结果尚未独立确认，且存在重叠归因，不能跨域求和解释量表总分。',
  '结果必须结合临床访谈、病史和其他检查综合判断。',
];

export const clinicalReportGenerationConfirmationStatements = [
  '本次将基于所选量表实例生成访视级报告。',
  '所选实例必须已经完成最终评分确认和认知域计算，前端候选状态不代表全部条件已经满足。',
  '报告正文由固定服务端规则生成；系统不会读取原始作答自由文本生成诊断意见。',
  '系统不会分析图片或手写内容，媒体只作为证据索引快照纳入。',
  '本次未使用 AI；生成后状态为 draft，尚未经医生确认。',
  '报告不包含诊断阈值、疾病判断或治疗建议。',
  '认知域结果尚未独立确认，认知域之间存在重叠归因，不能跨域求和解释量表总分。',
  '当前不支持修改 scope、重生成或 version 2，也不生成 PDF 或可下载文件。',
];

export const clinicalReportScopeFixedStatements = [
  'A20 的 reportVersion 固定为 1，同一访视当前只允许一份 cognitive_assessment version 1 报告。',
  '报告生成后 scope 固定，当前前端不能增加、移除或替换已纳入实例。',
  '后续新增量表实例不会自动加入已经生成的 version 1 报告。',
  '当前不支持重生成或 reportVersion 2，请在生成前认真核对范围。',
];

export function formatClinicalReportDate(
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

export function formatClinicalReportDateOnly(
  value: string | null | undefined,
): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '日期暂不可用'
    : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
}

export function formatClinicalReportNumber(
  value: number | null | undefined,
): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : '—';
}

export function formatClinicalReportPercent(
  value: number | null | undefined,
): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value}%`
    : '—';
}

export function getClinicalReportFinalityWarning(
  status: ClinicalReportStatus,
  isFinal: boolean,
): string | null {
  const expectedFinal = ['confirmed', 'archived', 'corrected'].includes(status);
  return expectedFinal === isFinal
    ? null
    : '报告状态与最终性标记不一致，请联系管理员。';
}

export function getClinicalReportApiErrorMessage(
  kind: ClinicalReportApiErrorKind,
): string {
  const messages: Record<ClinicalReportApiErrorKind, string> = {
    unauthenticated: '登录状态已失效，请重新登录。',
    forbidden: '当前账号无权查询或生成临床报告。',
    validation: '报告请求无效，请重新加载页面后再试。',
    patient_not_found: '未找到该患者档案。',
    patient_not_active: '当前患者不是活动状态，不能首次生成报告草稿。',
    visit_not_found: '未找到该评估访视。',
    visit_not_editable: '当前访视状态不允许首次生成报告草稿。',
    scale_instance_not_found:
      '所选量表实例已不存在或不属于当前访视，请重新加载访视详情。',
    scale_instance_configuration_unavailable:
      '所选量表实例的版本配置暂时不可用，请联系管理员核对。',
    clinical_report_generation_confirmation_required:
      '请明确确认报告范围和草稿边界后再生成。',
    clinical_report_scope_invalid:
      '报告范围无效，请重新选择 1–10 个当前访视中的可纳入量表实例。',
    clinical_report_source_scale_not_ready:
      '至少一个所选量表实例尚未达到报告生成要求。',
    clinical_report_source_score_not_final:
      '至少一个所选量表尚未完成最终评分确认。',
    clinical_report_source_domain_result_required:
      '至少一个所选量表尚未生成认知域结果。',
    clinical_report_source_domain_result_invalid:
      '至少一个认知域结果不满足报告生成要求，请重新核对或联系管理员。',
    clinical_report_source_media_invalid:
      '至少一条有效媒体证据索引不满足报告快照要求，请打开量表核对图片或手写证据。',
    clinical_report_input_invalid:
      '报告来源数据之间不一致，当前不能安全生成报告，请联系管理员。',
    clinical_report_not_found: '当前访视尚未生成临床报告草稿。',
    clinical_report_incomplete:
      '当前存在不完整的历史报告记录，系统不能自动修复，请联系管理员。',
    clinical_report_voided:
      '当前访视的 version 1 报告已作废，A20 不支持重新生成。',
    clinical_report_scope_conflict:
      '当前访视已存在范围不同的 version 1 报告，不能覆盖或重新生成。',
    clinical_report_generation_conflict:
      '报告在并发生成过程中发生变化，请重新加载最新报告。',
    clinical_report_generation_failed:
      '规则化报告草稿生成失败，请保留当前选择并稍后重试。',
    service_unavailable: '报告服务暂时不可用，请稍后手工重试。',
    unknown: '暂时无法完成报告操作，请稍后手工重新加载最新报告。',
  };
  return messages[kind];
}
