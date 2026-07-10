import type {
  ScaleInstanceListItem,
  ScaleInstanceProgress,
} from '@/src/features/assessments/types/assessment-execution';
import type { AssessmentVisit } from '@/src/features/patients/types/patient';

export type ItemResponseDraftJsonValue =
  | null
  | string
  | number
  | boolean
  | ItemResponseDraftJsonValue[]
  | { [key: string]: ItemResponseDraftJsonValue };

export type ScaleResponseType =
  | 'boolean'
  | 'single_choice'
  | 'multi_choice'
  | 'number'
  | 'text'
  | 'drawing'
  | 'photo_upload'
  | 'handwriting'
  | 'timed_task'
  | 'multi_step_calculation';

export type ItemResponseStatus =
  | 'not_started'
  | 'in_progress'
  | 'answered'
  | 'scored'
  | 'locked'
  | 'voided';

export type ItemResponseAnswerSource =
  | 'clinician_recorded'
  | 'supervised_patient_input'
  | 'paper_import'
  | 'system_generated';

export type PromptResponseType =
  | 'none'
  | 'repeat_instruction'
  | 'semantic_category'
  | 'multiple_choice'
  | 'operator_clarification'
  | 'other';

export type ItemTimerSource = 'none' | 'system' | 'manual' | 'imported';

export type ItemEvidenceType =
  | 'photo'
  | 'handwriting'
  | 'duration'
  | 'raw_text'
  | 'operator_note'
  | 'audio'
  | 'other';

export type ItemEvidenceStatus =
  | 'pending'
  | 'attached'
  | 'missing'
  | 'not_required';

export type ScaleExecutionIdentity = {
  code: string;
  name: string;
  shortName?: string;
  version: string;
  displayVersion?: string;
  crfVersion?: string;
  sourceDocument?: string;
};

export type ScaleExecutionGroup = {
  code: string;
  title: string;
  order: number;
  instruction?: string;
  description?: string;
  cognitiveDomainCodes: string[];
};

export type ItemExecutionScoreRange = {
  min: number | null;
  max: number | null;
  step?: number;
};

export type ItemExecutionConfig = {
  prompt?: string;
  instruction?: string;
  scoreRange: ItemExecutionScoreRange;
  evidenceTypes: ItemEvidenceType[];
  requiresTimer: boolean;
  supportsPhotoUpload: boolean;
  supportsHandwriting: boolean;
  requiresOperatorNote: boolean;
};

export type ItemResponseVersionTrace = {
  scaleVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  sourceDocument?: string;
};

export type ItemStepDraft = {
  stepCode: string;
  crfCode?: string;
  label?: string;
  order: number;
  actualValue: ItemResponseDraftJsonValue;
  countsTowardItemScore: boolean;
  note?: string;
};

export type ItemPromptDraft = {
  promptType: PromptResponseType;
  promptText?: string;
  responseAfterPrompt: ItemResponseDraftJsonValue;
  countsTowardScore: boolean;
  order: number;
  note?: string;
};

export type ItemTimingDraft = {
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  timerSource: ItemTimerSource;
};

export type ItemEvidenceRequirement = {
  evidenceType: ItemEvidenceType;
  status: ItemEvidenceStatus;
  attached: boolean;
};

export type ItemResponseExecution = {
  id: string;
  scaleInstanceId: string;
  itemCode: string;
  crfCode?: string;
  groupCode?: string;
  itemTitle?: string;
  itemOrder: number;
  responseType: ScaleResponseType;
  countsTowardTotal: boolean;
  cognitiveDomainCodes: string[];
  versionTrace: ItemResponseVersionTrace | null;
  config: ItemExecutionConfig;
  status: ItemResponseStatus;
  answerSource: ItemResponseAnswerSource;
  rawResponse: ItemResponseDraftJsonValue;
  structuredResponse: {
    [key: string]: ItemResponseDraftJsonValue;
  } | null;
  responseText?: string;
  isMissing: boolean;
  missingReason?: string;
  stepResponses: ItemStepDraft[];
  promptResponses: ItemPromptDraft[];
  timing: ItemTimingDraft | null;
  evidenceRequirements: ItemEvidenceRequirement[];
  operatorNote?: string;
};

export type ScaleInstanceExecutionDetailResponse = {
  visit: AssessmentVisit;
  scale: ScaleExecutionIdentity;
  scaleInstance: ScaleInstanceListItem;
  groups: ScaleExecutionGroup[];
  itemResponses: ItemResponseExecution[];
};

export type UpdateItemStepDraftRequest = {
  stepCode: string;
  actualValue?: ItemResponseDraftJsonValue;
  note?: string | null;
};

export type UpdatePromptResponseDraftRequest = {
  promptType: PromptResponseType;
  order: number;
  responseAfterPrompt?: ItemResponseDraftJsonValue;
  note?: string | null;
};

export type UpdateItemTimingDraftRequest = {
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  timerSource?: ItemTimerSource;
};

export type UpdateItemResponseDraftRequest = {
  rawResponse?: ItemResponseDraftJsonValue;
  structuredResponse?: {
    [key: string]: ItemResponseDraftJsonValue;
  } | null;
  responseText?: string | null;
  isMissing?: boolean;
  missingReason?: string | null;
  stepResponses?: UpdateItemStepDraftRequest[];
  promptResponses?: UpdatePromptResponseDraftRequest[];
  timing?: UpdateItemTimingDraftRequest | null;
  operatorNote?: string | null;
  markAsAnswered?: boolean;
};

export type UpdateItemResponseDraftResponse = {
  itemResponse: ItemResponseExecution;
  progress: ScaleInstanceProgress;
};
