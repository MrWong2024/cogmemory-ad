import type { ClinicalReportApiErrorKind } from '@/src/features/assessments/api/clinical-report-api';
import type {
  ClinicalReportCaptureMode,
  ClinicalReport,
  ClinicalReportConfirmationRole,
  ClinicalReportEvidenceType,
  ClinicalReportOperatorRole,
  ClinicalReportPatientSex,
  ClinicalReportQualityStatus,
  ClinicalReportScoreStatus,
  ClinicalReportSource,
  ClinicalReportSourceFreezeState,
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
  mixed: '系统规则内容与临床人员补充并存（非 AI）',
};

export const clinicalReportQualityStatusLabels: Record<
  ClinicalReportQualityStatus,
  string
> = {
  unchecked: '尚未进行进一步质量确认',
  passed: '报告确认流程质量标记已通过',
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

export const clinicalReportSourceFreezeStateLabels: Record<
  ClinicalReportSourceFreezeState,
  string
> = {
  in_progress: '冻结尚未完成',
  completed: '来源冻结已完成',
};

export const clinicalReportSourceFreezeCountLabels = {
  scaleInstanceCount: '量表实例',
  itemResponseCount: '题目记录',
  scoreResultCount: '评分结果',
  cognitiveDomainResultCount: '认知域结果',
  mediaEvidenceCount: '媒体证据',
  totalSourceCount: '合计',
} as const;

export const clinicalReportDraftBoundaryStatements = [
  '本次内容是访视级临床认知评估报告的结构化规则草稿。',
  '系统规则化草稿不等于医生结论；draft 报告尚未经医生确认。',
  '当前 A20 规则化草稿生成流程不调用 AI。',
  'A20 不读取原始作答自由文本生成诊断意见，也不分析图片或手写内容。',
  '系统规则化部分不自动生成医生意见或治疗建议；临床人员可在受控字段中明确补充。',
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

export const clinicalReportLockBoundaryStatements = [
  '当前报告已经确认；锁定后真实 status 仍为 confirmed。',
  '系统通过顶层 lockedAt 和锁定审计摘要表达锁定，不新增 locked 状态。',
  '锁定不可撤销，当前系统不提供 unlock。',
  '锁定只作用于当前 ClinicalReport，不会锁定患者、访视、量表实例、评分、认知域或媒体。',
  '锁定不等于归档，不生成签名，也不生成 PDF 或下载文件。',
  '锁定过程不调用 AI；qualityStatus=passed 不表示患者正常，也不形成新的诊断结论。',
  '锁定流程说明仅用于本次锁定审计，不属于报告正文。',
];

export const clinicalReportSourceFreezeBoundaryStatements = [
  '当前报告已经确认并锁定；报告锁定与来源冻结是两个独立阶段。',
  '冻结范围来自服务端保存的报告来源 scope，前端不能选择、增加、移除或修改。',
  '冻结范围包含报告纳入的量表实例、这些实例下的全部题目记录、报告引用的评分结果、认知域结果持久快照和媒体证据记录。',
  '来源冻结不会读取或修改原始作答、分值或媒体内容。',
  '冻结可能跨多个集合逐步执行，不使用 Mongo transaction。',
  '完成前可能已有部分来源被冻结；系统不会自动解冻或回滚。',
  '中断后必须由 doctor / admin 明确继续同一 freezeId，系统不会自动恢复。',
  '恢复沿用服务端原冻结范围、原说明、发起人和 freezeId，不生成新流程。',
  'completed 后重复请求按幂等成功处理，不会重新冻结来源。',
  'CognitiveDomainResult 的冻结只固定持久快照，不等于独立认知域确认。',
  '本操作不冻结 Patient、AssessmentVisit 或 Storage 文件。',
  '当前不提供 unfreeze、自动回滚、PDF、下载或 AI 操作，也不形成新的诊断结论。',
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

export function isClinicalReportLocked(report: ClinicalReport): boolean {
  return report.lockedAt !== null;
}

export function getClinicalReportLifecycleLabel(
  report: ClinicalReport,
): string {
  if (report.status === 'confirmed') {
    return report.lockedAt === null ? '已确认，尚未锁定' : '已确认并锁定';
  }
  return clinicalReportStatusLabels[report.status];
}

export function getClinicalReportLockConsistencyWarning(
  report: ClinicalReport,
): string | null {
  if (report.lock !== null && report.lockedAt === null) {
    return '报告返回了锁定审计摘要，但顶层 lockedAt 为空；不能据此认定报告已锁定，也不能继续锁定，请联系管理员。';
  }
  if (
    report.lockedAt !== null &&
    !['confirmed', 'archived', 'corrected'].includes(report.status)
  ) {
    return '报告状态与顶层 lockedAt 不一致；当前不能继续报告写操作，请联系管理员。';
  }
  if (report.lockedAt !== null && report.lock === null) {
    return '报告已锁定，但当前安全响应未提供完整锁定审计摘要；系统不会猜测锁定人或说明。';
  }
  if (
    report.lockedAt !== null &&
    report.lock !== null &&
    (report.lock.lockedAt === null || report.lock.lockedBy === null)
  ) {
    return '报告已锁定，但锁定审计摘要不完整；系统不会猜测锁定人、角色或时间。';
  }
  if (
    report.lockedAt !== null &&
    report.lock?.lockedAt !== null &&
    report.lock?.lockedAt !== undefined &&
    report.lock.lockedAt !== report.lockedAt
  ) {
    return '顶层 lockedAt 与锁定审计摘要时间不一致；系统不会自行选择或覆盖时间，请联系管理员。';
  }
  return null;
}

export function getClinicalReportApiErrorMessage(
  kind: ClinicalReportApiErrorKind,
): string {
  const messages: Record<ClinicalReportApiErrorKind, string> = {
    unauthenticated: '登录状态已失效，请重新登录。',
    forbidden: '当前账号无权执行该临床报告操作。',
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
    clinical_report_metadata_unsupported:
      '报告内部审计结构异常，当前不能继续写入，请联系管理员。',
    clinical_report_not_editable: '当前报告状态不允许继续编辑。',
    clinical_report_edit_no_changes:
      '医生意见和建议与当前报告一致，没有需要保存的变化。',
    clinical_report_edit_audit_limit_reached:
      '当前报告已达到编辑审计上限，不能继续修改。',
    clinical_report_edit_conflict:
      '报告已被其他操作更新，请重新核对最新报告后再保存。',
    clinical_report_edit_failed:
      '报告编辑保存失败，请保留当前输入并稍后重试。',
    clinical_report_submission_confirmation_required:
      '请明确确认提交边界后再提交医生确认。',
    clinical_report_not_ready_for_submission:
      '当前报告尚未满足提交待确认条件。',
    clinical_report_submission_conflict:
      '报告在提交前已发生变化，请重新核对最新内容。',
    clinical_report_submission_audit_unavailable:
      '历史提交审计信息不完整，当前不能安全继续确认。',
    clinical_report_submission_failed:
      '报告提交待确认失败，请稍后重试。',
    clinical_report_confirmation_required:
      '请明确确认当前报告内容后再完成医生确认。',
    clinical_report_not_ready_for_confirmation:
      '当前报告尚未进入可确认状态。',
    clinical_report_confirmation_conflict:
      '报告在确认前已发生变化，请重新核对最新报告。',
    clinical_report_confirmation_audit_unavailable:
      '历史确认审计信息不完整，不能安全推断确认记录。',
    clinical_report_confirmation_failed:
      '报告确认失败，请重新加载最新报告后重试。',
    clinical_report_lock_confirmation_required:
      '请明确确认不可逆锁定边界后再锁定报告。',
    clinical_report_not_lockable:
      '当前报告状态或流程信息不满足锁定要求。',
    clinical_report_lock_conflict:
      '报告在锁定前已发生变化，请重新核对最新报告。',
    clinical_report_lock_audit_unavailable:
      '报告锁定审计信息不完整，不能安全推断或重复锁定。',
    clinical_report_lock_failed:
      '报告锁定失败，请保留当前锁定说明并稍后重试。',
    clinical_report_source_freeze_confirmation_required:
      '请明确确认来源冻结的不可逆边界后再继续。',
    clinical_report_not_source_freezable:
      '当前报告尚未满足来源链冻结要求。',
    clinical_report_source_freeze_scope_invalid:
      '报告保存的来源范围不完整或不一致，当前不能安全冻结。',
    clinical_report_source_freeze_input_invalid:
      '报告来源数据状态与冻结审计不一致，请联系管理员处理。',
    clinical_report_source_freeze_conflict:
      '报告在来源冻结开始前已发生变化，请重新核对最新报告。',
    clinical_report_source_freeze_audit_unavailable:
      '来源冻结审计信息不完整，不能安全启动、恢复或确认完成状态。',
    clinical_report_source_freeze_incomplete:
      '来源冻结尚未完整完成；部分来源可能已经冻结，请重新加载并由医生或管理员明确继续恢复。',
    clinical_report_source_freeze_failed:
      '来源冻结操作未完成；请重新加载最新报告，确认是否存在可恢复流程。',
    service_unavailable: '报告服务暂时不可用，请稍后手工重试。',
    unknown: '暂时无法完成报告操作，请稍后手工重新加载最新报告。',
  };
  return messages[kind];
}

export function getClinicalReportLockApiErrorMessage(
  kind: ClinicalReportApiErrorKind,
): string {
  if (kind === 'forbidden') {
    return '当前账号不具备 doctor / admin 锁定权限；报告和本地锁定说明均已保留。';
  }
  if (kind === 'patient_not_active') {
    return '当前患者不是活动状态，不能首次锁定报告。';
  }
  if (kind === 'visit_not_editable') {
    return '当前访视状态不允许首次锁定报告。';
  }
  if (kind === 'clinical_report_metadata_unsupported') {
    return '报告内部审计结构异常，当前不能继续锁定，请联系管理员。';
  }
  return getClinicalReportApiErrorMessage(kind);
}

export function getClinicalReportSourceFreezeApiErrorMessage(
  kind: ClinicalReportApiErrorKind,
): string {
  if (kind === 'forbidden') {
    return '当前账号不具备 doctor / admin 来源冻结权限；报告和本地首次说明均已保留。';
  }
  if (kind === 'patient_not_active') {
    return '当前患者不是活动状态，不能首次发起来源冻结。';
  }
  if (kind === 'visit_not_editable') {
    return '当前访视状态不允许首次发起来源冻结。';
  }
  if (kind === 'clinical_report_metadata_unsupported') {
    return '报告内部审计结构异常，当前不能继续来源冻结，请联系管理员。';
  }
  if (kind === 'service_unavailable' || kind === 'unknown') {
    return '来源冻结请求结果暂不确定；系统不会自动重试，请手工重新加载最新报告核对。';
  }
  return getClinicalReportApiErrorMessage(kind);
}
