export const PATIENT_ADMINISTRATION_COOKIE_NAME =
  'cogmemory_ad_patient_session';
export const PATIENT_ADMINISTRATION_COOKIE_PATH = '/patient-administration';
export const PATIENT_ADMINISTRATION_COOKIE_SAME_SITE = 'lax' as const;

export const PATIENT_ADMINISTRATION_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const PATIENT_ADMINISTRATION_ENTRY_CODE_TTL_MS = 10 * 60 * 1000;
export const PATIENT_ADMINISTRATION_ENTRY_CODE_LENGTH = 6;
export const PATIENT_ADMINISTRATION_ENTRY_CODE_RETRY_LIMIT = 5;

export const PATIENT_ADMINISTRATION_ENTRY_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const PATIENT_ADMINISTRATION_ENTRY_RATE_LIMIT_MAX_FAILURES = 10;

export const PATIENT_ADMINISTRATION_OPEN_STATUSES = [
  'prepared',
  'active',
  'paused',
] as const;

export const PATIENT_ADMINISTRATION_STATUSES = [
  ...PATIENT_ADMINISTRATION_OPEN_STATUSES,
  'completed',
  'terminated',
  'expired',
] as const;

export const PATIENT_ADMINISTRATION_IMPACT_FACTOR_CODES = [
  'sensory',
  'upper_limb',
  'language_culture_education',
  'instruction_comprehension',
  'fatigue_emotion_refusal',
  'environment',
  'device_network',
  'other',
] as const;

export const PATIENT_ADMINISTRATION_CONTROL_EVENT_ACTIONS = [
  'entry_redeemed',
  'same_device_handoff',
  'preparation_confirmed',
  'paused',
  'resumed',
  'device_reissued',
  'terminated',
  'expired',
  'staff_takeover',
  'step_redo',
] as const;

export const PATIENT_ADMINISTRATION_CAPTURED_BY_VALUES = [
  'patient',
  'staff',
] as const;

export type PatientAdministrationStatus =
  (typeof PATIENT_ADMINISTRATION_STATUSES)[number];
export type PatientAdministrationOpenStatus =
  (typeof PATIENT_ADMINISTRATION_OPEN_STATUSES)[number];
export type PatientAdministrationImpactFactorCode =
  (typeof PATIENT_ADMINISTRATION_IMPACT_FACTOR_CODES)[number];
export type PatientAdministrationControlEventAction =
  (typeof PATIENT_ADMINISTRATION_CONTROL_EVENT_ACTIONS)[number];
export type PatientAdministrationCapturedBy =
  (typeof PATIENT_ADMINISTRATION_CAPTURED_BY_VALUES)[number];
