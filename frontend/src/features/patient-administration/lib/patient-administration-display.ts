import type { BadgeTone } from '@/src/components/ui/Badge';
import type {
  PatientAdministrationImpactFactorCode,
  PatientAdministrationStatus,
} from '@/src/features/patient-administration/types/patient-administration';

export const patientAdministrationStatusLabels: Record<
  PatientAdministrationStatus,
  string
> = {
  prepared: '等待准备',
  active: '施测进行中',
  paused: '已暂停',
  completed: '已完成',
  terminated: '已终止',
  expired: '已过期',
};

export const patientAdministrationStatusTones: Record<
  PatientAdministrationStatus,
  BadgeTone
> = {
  prepared: 'neutral',
  active: 'info',
  paused: 'warning',
  completed: 'success',
  terminated: 'warning',
  expired: 'warning',
};

export const patientAdministrationImpactFactorLabels: ReadonlyArray<{
  code: PatientAdministrationImpactFactorCode;
  label: string;
}> = [
  { code: 'sensory', label: '视力、听力或其他感觉因素' },
  { code: 'upper_limb', label: '上肢活动或精细操作因素' },
  { code: 'language_culture_education', label: '语言、文化或教育背景因素' },
  { code: 'instruction_comprehension', label: '指令理解因素' },
  { code: 'fatigue_emotion_refusal', label: '疲劳、情绪或拒答因素' },
  { code: 'environment', label: '环境干扰因素' },
  { code: 'device_network', label: '设备或网络因素' },
  { code: 'other', label: '其他因素' },
];

export function formatPatientAdministrationDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
