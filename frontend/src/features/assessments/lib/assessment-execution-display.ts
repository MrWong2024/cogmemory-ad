import type {
  ScaleAdministrationMode,
  ScaleCapabilities,
} from '@/src/features/assessments/types/assessment-execution';
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
