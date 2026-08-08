import type { PatientAdministrationAdvanceBy } from '@/src/features/patient-administration/types/patient-administration';

export type MmsePatientAdministrationStepMetadata = {
  order: number;
  label: string;
  advanceBy: PatientAdministrationAdvanceBy;
  stimulusAssetKey?: string;
};

export const mmsePatientAdministrationSteps: Readonly<
  Record<string, MmsePatientAdministrationStepMetadata>
> = {
  'mmse-orientation-year': { order: 1, label: '年份定向', advanceBy: 'patient' },
  'mmse-orientation-season': { order: 2, label: '季节定向', advanceBy: 'patient' },
  'mmse-orientation-month': { order: 3, label: '月份定向', advanceBy: 'patient' },
  'mmse-orientation-date': { order: 4, label: '日期定向', advanceBy: 'patient' },
  'mmse-orientation-weekday': { order: 5, label: '星期定向', advanceBy: 'patient' },
  'mmse-orientation-city': { order: 6, label: '城市定向', advanceBy: 'patient' },
  'mmse-orientation-district': { order: 7, label: '城区定向', advanceBy: 'patient' },
  'mmse-orientation-street': { order: 8, label: '街道定向', advanceBy: 'patient' },
  'mmse-orientation-floor': { order: 9, label: '楼层定向', advanceBy: 'patient' },
  'mmse-orientation-place': { order: 10, label: '场所定向', advanceBy: 'patient' },
  'mmse-immediate-recall': {
    order: 11,
    label: '即刻回忆',
    advanceBy: 'patient',
    stimulusAssetKey: 'mmse-immediate-recall-stimulus',
  },
  'mmse-attention-calculation': { order: 12, label: '注意与计算', advanceBy: 'patient' },
  'mmse-delayed-recall': { order: 13, label: '延迟回忆', advanceBy: 'patient' },
  'mmse-naming': { order: 14, label: '物品命名', advanceBy: 'patient' },
  'mmse-repetition': {
    order: 15,
    label: '语句复述',
    advanceBy: 'patient',
    stimulusAssetKey: 'mmse-repetition-stimulus',
  },
  'mmse-reading-command': { order: 16, label: '阅读指令', advanceBy: 'patient' },
  'mmse-three-step-command': {
    order: 17,
    label: '三步指令',
    advanceBy: 'patient',
    stimulusAssetKey: 'mmse-three-step-command-stimulus',
  },
  'mmse-expression': { order: 18, label: '书面表达', advanceBy: 'patient' },
  'mmse-drawing': { order: 19, label: '图形临摹', advanceBy: 'patient' },
};

export function getMmsePatientAdministrationStepMetadata(
  stepKey: string,
): MmsePatientAdministrationStepMetadata | null {
  return mmsePatientAdministrationSteps[stepKey] ?? null;
}
