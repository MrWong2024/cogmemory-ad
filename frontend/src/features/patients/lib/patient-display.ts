import type {
  AssessmentOperatorRole,
  AssessmentVisitStatus,
  AssessmentVisitType,
  PatientHandedness,
  PatientSex,
  PatientSourceType,
  PatientStatus,
} from '@/src/features/patients/types/patient';

export const patientSourceTypes: readonly PatientSourceType[] = [
  'clinical',
  'research',
];

export const patientSexes: readonly PatientSex[] = [
  'male',
  'female',
  'other',
  'unknown',
];

export const patientHandednesses: readonly PatientHandedness[] = [
  'right',
  'left',
  'ambidextrous',
  'unknown',
];

export const patientStatuses: readonly PatientStatus[] = [
  'active',
  'inactive',
  'archived',
];

export const assessmentVisitTypes: readonly AssessmentVisitType[] = [
  'baseline',
  'follow_up',
  'screening',
  'unscheduled',
  'other',
];

export const assessmentVisitStatuses: readonly AssessmentVisitStatus[] = [
  'draft',
  'in_progress',
  'completed',
  'locked',
  'voided',
];

export const patientSourceLabels: Record<PatientSourceType, string> = {
  clinical: '临床',
  research: '科研',
};

export const patientSexLabels: Record<PatientSex, string> = {
  male: '男',
  female: '女',
  other: '其他',
  unknown: '未知',
};

export const patientHandednessLabels: Record<PatientHandedness, string> = {
  right: '右利手',
  left: '左利手',
  ambidextrous: '双利手',
  unknown: '未知',
};

export const patientStatusLabels: Record<PatientStatus, string> = {
  active: '活跃',
  inactive: '停用',
  archived: '已归档',
};

export const assessmentVisitTypeLabels: Record<AssessmentVisitType, string> = {
  baseline: '基线',
  follow_up: '随访',
  screening: '筛查',
  unscheduled: '非计划',
  other: '其他',
};

export const assessmentVisitStatusLabels: Record<
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

const dateInputPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function readDateInput(value: string): [number, number, number] | null {
  const match = dateInputPattern.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return [year, month, day];
}

export function formatPatientBirthDate(value: string | null): string {
  if (!value) {
    return '—';
  }

  const datePart = value.slice(0, 10);
  const date = readDateInput(datePart);

  if (!date) {
    return '—';
  }

  const [year, month, day] = date;
  return `${year}年${month}月${day}日`;
}

export function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function toBirthDateIso(value: string): string | null {
  const date = readDateInput(value);

  if (!date) {
    return null;
  }

  const [year, month, day] = date;
  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}

export function toAssessmentDateIso(value: string): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toLocalDayIso(value: string, endOfDay: boolean): string | null {
  const dateParts = readDateInput(value);

  if (!dateParts) {
    return null;
  }

  const [year, month, day] = dateParts;
  const date = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);

  return date.toISOString();
}

export function toLocalDayStartIso(value: string): string | null {
  return toLocalDayIso(value, false);
}

export function toLocalDayEndIso(value: string): string | null {
  return toLocalDayIso(value, true);
}

export function isValidDateInput(value: string): boolean {
  return readDateInput(value) !== null;
}

export function parsePatientTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,，\n\r]+/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}
