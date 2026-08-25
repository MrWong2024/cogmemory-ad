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
  draft: '报告草稿',
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
  unchecked: '尚未完成结果确认',
  passed: '结果状态正常',
  needs_review: '报告包含需要进一步复核的内容或作答证据',
  failed: '结果检查未通过',
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
  '当前内容是访视级临床认知评估报告草稿。',
  '报告草稿尚未经医生确认，不能作为最终临床结论。',
  '本报告由系统按照固定规则生成，未使用 AI。',
  '系统不会读取原始作答自由文本、图片或手写内容生成诊断意见。',
  '系统生成的报告内容不会自动给出医生意见或治疗建议；临床人员可在受控字段中明确补充。',
  '认知域结果尚未独立确认，且存在重叠归因，不能跨域求和解释量表总分。',
  '结果必须结合临床访谈、病史和其他检查综合判断。',
];

export const clinicalReportGenerationConfirmationStatements = [
  '本次将基于所选量表实例生成访视级报告。',
  '所选实例必须已经完成最终评分确认和认知域计算，前端候选状态不代表全部条件已经满足。',
  '报告正文由系统固定规则生成；系统不会读取原始作答自由文本生成诊断意见。',
  '系统不会分析图片或手写内容，只在报告中记录相关作答证据的摘要信息。',
  '本次不使用 AI；生成后为报告草稿，尚未经医生确认。',
  '报告不包含诊断阈值、疾病判断或治疗建议。',
  '认知域结果尚未独立确认，认知域之间存在重叠归因，不能跨域求和解释量表总分。',
  '报告生成后，本版报告所依据的评估内容不会直接修改；如需后续补充或更正，请通过报告更正流程处理。当前不生成 PDF 或可下载文件。',
];

export const clinicalReportScopeFixedStatements = [
  '报告将基于当前选择并满足生成条件的评估结果生成。',
  '报告生成后，本版报告所依据的评估内容将被固定，后续新增的量表结果不会自动加入本版报告。',
  '如后续需要补充或更正，请通过系统提供的报告更正流程处理。',
  '请在生成前确认当前评估内容完整、准确。',
];

export const clinicalReportLockBoundaryStatements = [
  '当前报告已经确认；锁定后仍保持已确认状态。',
  '锁定不可撤销，当前系统不提供解锁。',
  '锁定只作用于当前报告，不会锁定患者、访视、量表结果、评分、认知域或媒体。',
  '锁定不等于归档，不生成签名，也不生成 PDF 或下载文件。',
  '锁定过程不调用 AI；结果状态正常不表示患者认知状态正常，也不形成新的诊断结论。',
  '锁定流程说明仅用于本次锁定审计，不属于报告正文。',
];

export const clinicalReportSourceFreezeBoundaryStatements = [
  '当前报告已经确认并锁定；报告锁定与固定报告依据是两个独立阶段。',
  '固定范围来自本版报告所依据的评估资料，不能在当前页面增加、移除或修改。',
  '固定范围包含报告纳入的量表结果、相关题目记录、评分结果、认知域结果和作答证据记录。',
  '固定报告依据不会读取或修改原始作答、分值或媒体内容。',
  '固定过程可能分步完成；中断时部分资料可能已经固定，系统不会自动撤销或回滚。',
  '中断后必须由医生或管理员明确继续同一流程，系统不会自动恢复。',
  '继续处理时沿用首次确定的范围、说明和发起人，不会创建新流程。',
  '完成后重复操作不会再次固定相同资料。',
  '认知域结果仅固定本版报告所依据的记录，不等于独立确认认知域结论。',
  '本操作不会固定患者档案、访视本身或原始存储文件。',
  '当前不提供撤销固定、自动回滚、PDF、下载或 AI 操作，也不形成新的诊断结论。',
];

export const clinicalReportArchiveBoundaryStatements = [
  '归档对象是当前报告；报告必须已经确认并锁定，且报告所依据的评估资料已经固定。',
  '归档成功后不能取消归档，也不能恢复为已确认状态。',
  '归档不会清除报告锁定，也不会撤销或重新固定报告依据。',
  '归档不会修改患者档案、访视或报告所依据的评估资料。',
  '归档不会修改原始作答、评分、认知域结果、媒体、报告正文或报告生成时已记录的内容。',
  '归档不等于删除、作废或更正；后续更正必须通过独立、可追溯的受控流程形成。',
  '归档不生成 PDF、Word、签名、打印件或下载文件，也不调用 AI。',
  '归档流程说明只用于本次归档审计，不属于报告正文或医生确认意见。',
];

export const clinicalReportCorrectionBoundaryStatements = [
  '原归档报告保持不变，系统创建下一报告版本；不允许从旧版本创建分支或跳过版本号。',
  '更正报告初始为草稿；更正不会自动完成编辑、确认、锁定、固定报告依据或归档。',
  '更正不修改原始作答、评分、认知域或媒体，不生成 PDF，也不调用 AI。',
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
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value * 10) / 10}%`;
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
    return '报告的锁定状态与锁定记录不一致；当前不能继续锁定，请联系管理员。';
  }
  if (
    report.lockedAt !== null &&
    !['confirmed', 'archived', 'corrected'].includes(report.status)
  ) {
    return '报告状态与锁定记录不一致；当前不能继续报告操作，请联系管理员。';
  }
  if (report.lockedAt !== null && report.lock === null) {
    return '本版报告已锁定，但未记录完整锁定信息；系统不会猜测锁定人或说明。';
  }
  if (
    report.lockedAt !== null &&
    report.lock !== null &&
    (report.lock.lockedAt === null || report.lock.lockedBy === null)
  ) {
    return '本版报告已锁定，但锁定信息不完整；系统不会猜测锁定人、角色或时间。';
  }
  if (
    report.lockedAt !== null &&
    report.lock?.lockedAt !== null &&
    report.lock?.lockedAt !== undefined &&
    report.lock.lockedAt !== report.lockedAt
  ) {
    return '报告记录的锁定时间不一致；系统不会自行选择或覆盖时间，请联系管理员。';
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
      '请明确确认报告内容和草稿边界后再生成。',
    clinical_report_scope_invalid:
      '纳入报告的评估结果无效，请重新选择 1–10 个当前访视中的可纳入量表。',
    clinical_report_source_scale_not_ready:
      '至少一个所选量表实例尚未达到报告生成要求。',
    clinical_report_source_score_not_final:
      '至少一个所选量表尚未完成最终评分确认。',
    clinical_report_source_domain_result_required:
      '至少一个所选量表尚未生成认知域结果。',
    clinical_report_source_domain_result_invalid:
      '至少一个认知域结果不满足报告生成要求，请重新核对或联系管理员。',
    clinical_report_source_media_invalid:
      '至少一条图片或手写作答证据不满足报告生成要求，请打开量表核对。',
    clinical_report_input_invalid:
      '报告来源数据之间不一致，当前不能安全生成报告，请联系管理员。',
    clinical_report_not_found: '当前访视尚未生成临床报告草稿。',
    clinical_report_incomplete:
      '当前存在不完整的历史报告记录，系统不能自动修复，请联系管理员。',
    clinical_report_history_lineage_invalid:
      '报告版本关系暂时无法安全展示；不会展示部分版本或推测内部关系。',
    clinical_report_voided:
      '当前访视的原报告已作废，不能重新生成同一版报告。',
    clinical_report_scope_conflict:
      '当前访视已存在纳入内容不同的原报告，不能覆盖或重新生成。',
    clinical_report_generation_conflict:
      '报告在并发生成过程中发生变化，请重新加载最新报告。',
    clinical_report_generation_failed:
      '报告草稿生成失败，请保留当前选择并稍后重试。',
    clinical_report_metadata_unsupported:
      '报告记录不完整，当前不能继续操作，请联系管理员。',
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
      '请明确确认固定报告依据的不可逆边界后再继续。',
    clinical_report_not_source_freezable:
      '当前报告尚未满足固定报告依据的要求。',
    clinical_report_source_freeze_scope_invalid:
      '报告所依据的评估资料不完整或不一致，当前不能继续固定。',
    clinical_report_source_freeze_input_invalid:
      '报告所依据的评估资料与处理记录不一致，请联系管理员处理。',
    clinical_report_source_freeze_conflict:
      '报告在固定依据前已发生变化，请重新核对最新报告。',
    clinical_report_source_freeze_audit_unavailable:
      '固定报告依据的操作记录不完整，不能安全启动、继续或确认完成状态。',
    clinical_report_source_freeze_incomplete:
      '报告依据尚未全部固定；部分资料可能已经完成且不会自动撤销，请重新加载并由医生或管理员明确继续。',
    clinical_report_source_freeze_failed:
      '固定报告依据的操作未完成；请重新加载最新报告，确认是否可以继续原有流程。',
    clinical_report_archive_confirmation_required:
      '请明确确认报告归档边界后再继续。',
    clinical_report_not_archivable: '当前报告尚未满足归档要求。',
    clinical_report_archive_conflict:
      '报告在归档前已发生变化，请重新核对最新报告。',
    clinical_report_archive_audit_unavailable:
      '报告归档审计信息不完整，不能安全执行或确认归档状态。',
    clinical_report_archive_failed:
      '报告归档操作未能确认完成，请保留当前归档说明并重新加载最新报告。',
    clinical_report_replacement_lineage_invalid:
      '当前报告版本关系不完整或已发生变化，无法继续执行当前不可逆操作；请重新加载报告或联系管理员核查。',
    clinical_report_correction_confirmation_required:
      '请明确确认版本化更正边界后再继续。',
    clinical_report_not_correctable:
      '当前报告不满足版本化更正要求。',
    clinical_report_correction_not_latest:
      '当前报告不是最新版本，不能从旧版本创建新的分支。',
    clinical_report_correction_conflict:
      '源报告在更正前已发生变化，请重新核对最新报告。',
    clinical_report_correction_audit_unavailable:
      '更正审计信息不完整，不能安全启动、恢复或确认完成状态。',
    clinical_report_correction_replacement_conflict:
      '目标更正版本已存在，但与当前报告的版本关系不一致。',
    clinical_report_correction_incomplete:
      '更正流程尚未完整完成，可重新加载并继续同一流程。',
    clinical_report_correction_failed:
      '更正操作未能确认完成，请重新加载最新报告核对。',
    clinical_report_correction_workflow_forbidden:
      '更正报告的编辑、提交和确认仅允许医生或管理员。',
    service_unavailable: '报告服务暂时不可用，请稍后手工重试。',
    unknown: '暂时无法完成报告操作，请稍后手工重新加载最新报告。',
  };
  return messages[kind];
}

export function getClinicalReportLockApiErrorMessage(
  kind: ClinicalReportApiErrorKind,
): string {
  if (kind === 'forbidden') {
    return '当前账号不具备锁定报告的权限；报告和本地锁定说明均已保留。';
  }
  if (kind === 'patient_not_active') {
    return '当前患者不是活动状态，不能首次锁定报告。';
  }
  if (kind === 'visit_not_editable') {
    return '当前访视状态不允许首次锁定报告。';
  }
  if (kind === 'clinical_report_metadata_unsupported') {
    return '报告记录不完整，当前不能继续锁定，请联系管理员。';
  }
  return getClinicalReportApiErrorMessage(kind);
}

export function getClinicalReportSourceFreezeApiErrorMessage(
  kind: ClinicalReportApiErrorKind,
): string {
  if (kind === 'forbidden') {
    return '当前账号不具备固定报告依据的权限；报告和本地说明均已保留。';
  }
  if (kind === 'patient_not_active') {
    return '当前患者不是活动状态，不能开始固定报告依据。';
  }
  if (kind === 'visit_not_editable') {
    return '当前访视状态不允许开始固定报告依据。';
  }
  if (kind === 'clinical_report_metadata_unsupported') {
    return '报告记录不完整，当前不能继续固定报告依据，请联系管理员。';
  }
  if (kind === 'service_unavailable' || kind === 'unknown') {
    return '固定报告依据的请求结果暂不确定；系统不会自动重试，请手工重新加载最新报告核对。';
  }
  return getClinicalReportApiErrorMessage(kind);
}

export function getClinicalReportArchiveApiErrorMessage(
  kind: ClinicalReportApiErrorKind,
): string {
  if (kind === 'forbidden') {
    return '当前账号不具备归档报告的权限；报告和本地归档说明均已保留。';
  }
  if (kind === 'clinical_report_metadata_unsupported') {
    return '报告记录不完整，当前不能继续归档，请联系管理员。';
  }
  if (kind === 'clinical_report_voided') {
    return '当前报告已作废，不能归档。';
  }
  if (kind === 'service_unavailable' || kind === 'unknown') {
    return '归档请求结果暂不确定；系统不会自动重试，请保留当前归档说明并手工重新加载最新报告核对。';
  }
  return getClinicalReportApiErrorMessage(kind);
}

export function getClinicalReportCorrectionApiErrorMessage(
  kind: ClinicalReportApiErrorKind,
): string {
  if (
    kind === 'forbidden' ||
    kind === 'clinical_report_correction_workflow_forbidden'
  ) {
    return '创建更正版本以及编辑、提交和确认更正报告仅允许医生或管理员；报告和本地输入均已保留。';
  }
  if (kind === 'service_unavailable' || kind === 'unknown') {
    return '更正请求结果暂不确定；系统不会自动重试，请保留本地说明并手工重新加载最新报告核对。';
  }
  return getClinicalReportApiErrorMessage(kind);
}
