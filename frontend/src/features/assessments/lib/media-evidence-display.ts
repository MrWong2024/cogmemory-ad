import type { MediaEvidenceApiErrorKind } from '@/src/features/assessments/api/media-evidence-api';
import type {
  HandwritingInputTool,
  HandwritingTrajectoryFormat,
  MediaCaptureMode,
  MediaEvidence,
  MediaEvidenceAccessAsset,
  MediaEvidenceAccessUrlResponse,
  MediaEvidenceStatus,
  MediaEvidenceType,
  MediaOperatorRole,
  MediaQualityStatus,
  MediaStorageStatus,
} from '@/src/features/assessments/types/media-evidence';

export function buildMediaEvidenceAccessCacheKey(
  mediaEvidenceId: string,
  asset: MediaEvidenceAccessAsset,
): string {
  return `${mediaEvidenceId}:${asset}`;
}

export const mediaEvidenceTypeLabels: Record<MediaEvidenceType, string> = {
  photo: '图片证据',
  handwriting: '手写证据',
  document_scan: '文档扫描',
  audio: '音频证据',
  raw_text_snapshot: '文本快照',
  other: '其他证据',
};

export const mediaCaptureModeLabels: Record<MediaCaptureMode, string> = {
  photo_upload: '本地图片上传',
  tablet_handwriting: '浏览器手写画布',
  paper_scan: '纸笔结果拍摄 / 扫描',
  system_generated: '系统生成',
  imported: '导入',
  other: '其他方式',
};

export const mediaEvidenceStatusLabels: Record<MediaEvidenceStatus, string> = {
  pending: '待关联',
  attached: '当前已关联',
  locked: '已锁定',
  voided: '已作废（历史保留）',
  deleted: '已删除状态',
};

export const mediaStorageStatusLabels: Record<MediaStorageStatus, string> = {
  pending: '存储处理中',
  stored: '已安全存储',
  missing: '存储对象缺失',
  deleted: '存储已删除状态',
};

export const mediaQualityStatusLabels: Record<MediaQualityStatus, string> = {
  unchecked: '未检查',
  acceptable: '可接受',
  needs_review: '需要复核',
  unusable: '不可用',
};

export const handwritingInputToolLabels: Record<
  HandwritingInputTool,
  string
> = {
  stylus: '触控笔',
  finger: '手指',
  mouse: '鼠标',
  unknown: '未知工具',
};

export const handwritingTrajectoryFormatLabels: Record<
  HandwritingTrajectoryFormat,
  string
> = {
  json: 'JSON',
  svg: 'SVG（历史兼容）',
  strokes: '规范化笔迹点',
  unknown: '未知格式',
};

export const mediaOperatorRoleLabels: Record<MediaOperatorRole, string> = {
  doctor: '医生',
  nurse: '护士',
  research_assistant: '研究助理',
  admin: '管理员',
  unknown: '未知角色',
};

export function formatMediaFileSize(sizeBytes: number | null): string {
  if (sizeBytes === null || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return '—';
  }

  if (sizeBytes < 1024) {
    return `${Math.round(sizeBytes)} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KiB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function sortMediaEvidences(items: MediaEvidence[]): MediaEvidence[] {
  return [...items].sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightTime = right.createdAt
      ? new Date(right.createdAt).getTime()
      : 0;
    const safeLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRightTime = Number.isFinite(rightTime) ? rightTime : 0;

    return safeLeftTime - safeRightTime || left.id.localeCompare(right.id);
  });
}

export function isMediaEvidenceActive(evidence: MediaEvidence): boolean {
  return evidence.status === 'attached' || evidence.status === 'locked';
}

export function isAccessUrlReusable(
  access: MediaEvidenceAccessUrlResponse | undefined,
  nowMs = Date.now(),
): boolean {
  if (!access) {
    return false;
  }

  const expiresAtMs = new Date(access.expiresAt).getTime();

  return Number.isFinite(expiresAtMs) && expiresAtMs - nowMs > 30_000;
}

export function getMediaEvidenceErrorMessage(
  kind: MediaEvidenceApiErrorKind,
): string {
  const messages: Partial<Record<MediaEvidenceApiErrorKind, string>> = {
    forbidden: '当前账号没有媒体证据操作权限。',
    validation: '媒体证据请求参数无效，请检查后重试。',
    patient_not_found: '未找到该患者档案，请重新加载量表实例。',
    patient_not_active:
      '当前患者不是活动状态，不能新增或作废媒体证据。',
    visit_not_found: '未找到该访视，请重新加载量表实例。',
    visit_not_editable: '当前访视状态不允许修改媒体证据。',
    scale_instance_not_found:
      '未找到该量表实例，请重新加载量表实例。',
    scale_instance_not_editable:
      '当前量表实例状态不允许修改媒体证据。',
    item_response_not_found:
      '未找到该题目记录，请重新加载量表实例。',
    item_response_not_editable: '当前题目状态不允许修改媒体证据。',
    item_evidence_type_not_required:
      '当前题目未配置该类型的证据要求，请重新加载量表。',
    media_primary_file_required: '请选择或生成需要上传的图片。',
    media_file_empty: '图片内容为空，请重新选择或重新书写。',
    media_file_too_large:
      '处理后的文件仍超过大小限制，请降低图片尺寸或重新拍摄。',
    media_file_type_not_allowed:
      '图片格式不受支持，请使用可由浏览器处理的图片重新生成。',
    media_file_signature_invalid: '图片内容与格式不一致，请重新选择。',
    media_file_embedded_metadata_not_allowed:
      '图片处理结果未通过隐私元数据检查，请重新处理后上传。',
    media_trajectory_invalid:
      '手写轨迹格式无效或超过限制，请简化书写后重试。',
    media_capture_mode_invalid: '当前证据类型与采集方式不匹配。',
    media_evidence_already_attached:
      '当前题目已经存在该类型的有效证据，请先作废原证据。',
    media_evidence_not_found:
      '未找到该媒体证据，或证据不属于当前题目。',
    media_evidence_not_accessible:
      '当前媒体证据无法访问，可能已作废或存储状态异常。',
    media_evidence_not_voidable:
      '当前媒体证据不能作废，请重新加载证据列表。',
    media_trajectory_not_found: '当前手写证据没有可访问的轨迹文件。',
    media_storage_unavailable:
      '媒体存储服务暂时不可用，请稍后手工重试。',
    media_evidence_create_failed: '媒体证据创建失败，请稍后重试。',
    media_evidence_attach_failed:
      '媒体证据关联失败，请重新加载后重试。',
    media_evidence_void_failed:
      '媒体证据作废失败，请重新加载后重试。',
    service_unavailable: '媒体证据服务暂时不可用，请稍后重试。',
  };

  return messages[kind] ?? '媒体证据操作失败，请稍后重试。';
}
