import type { PatientAdministrationReviewEvidence } from '@/src/features/patient-administration/types/patient-administration';

type ReviewEvidenceStatus = Pick<
  PatientAdministrationReviewEvidence,
  'status' | 'storageStatus'
>;

export function getPatientAdministrationReviewEvidenceStatusLabel(
  evidence: ReviewEvidenceStatus,
): string {
  if (evidence.status === 'deleted' || evidence.storageStatus === 'deleted') {
    return '已删除';
  }
  if (evidence.status === 'voided') {
    return '已作废';
  }
  if (evidence.storageStatus === 'missing') {
    return '文件缺失';
  }
  if (evidence.status === 'pending' || evidence.storageStatus === 'pending') {
    return '待保存';
  }
  if (
    (evidence.status === 'attached' || evidence.status === 'locked') &&
    evidence.storageStatus === 'stored'
  ) {
    return '已保存';
  }
  return '状态异常，请刷新后核对';
}

export function formatPatientAdministrationReviewFileType(
  file: PatientAdministrationReviewEvidence['file'],
): string {
  const extension = file?.fileExtension?.trim().toUpperCase() ?? '';
  const mimeType = file?.mimeType?.trim() ?? '';

  if (extension && mimeType) return `${extension}（${mimeType}）`;
  return extension || mimeType || '未记录';
}

export function formatPatientAdministrationReviewFileSize(
  sizeBytes: number | null | undefined,
): string {
  if (
    typeof sizeBytes !== 'number' ||
    !Number.isFinite(sizeBytes) ||
    sizeBytes < 0
  ) {
    return '未记录';
  }
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatPatientAdministrationReviewDimensions(
  width: number | null | undefined,
  height: number | null | undefined,
): string {
  if (
    typeof width !== 'number' ||
    !Number.isFinite(width) ||
    width <= 0 ||
    typeof height !== 'number' ||
    !Number.isFinite(height) ||
    height <= 0
  ) {
    return '未记录';
  }
  return `${width} × ${height} px`;
}

export const patientAdministrationHandwritingInputToolLabels = {
  stylus: '触控笔',
  finger: '手指',
  mouse: '鼠标',
  unknown: '未记录',
} as const;
