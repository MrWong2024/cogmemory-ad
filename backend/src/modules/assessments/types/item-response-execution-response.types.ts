import type { ScaleResponseType } from '../../scales/schemas/scale-version.schema';
import type {
  ItemEvidenceStatus,
  ItemEvidenceType,
  ItemResponseAnswerSource,
  ItemResponseStatus,
  ItemTimerSource,
  PromptResponseType,
} from '../schemas/item-response.schema';
import type {
  ScaleInstanceListItemResponse,
  ScaleInstanceProgressResponse,
} from './assessment-execution-response.types';
import type { AssessmentVisitDetailResponse } from './assessment-visit-response.types';

export type ItemResponseDraftJsonValue =
  | null
  | string
  | number
  | boolean
  | ItemResponseDraftJsonValue[]
  | { [key: string]: ItemResponseDraftJsonValue };

export type ScaleExecutionIdentityResponse = {
  code: string;
  name: string;
  shortName?: string;
  version: string;
  displayVersion?: string;
  crfVersion?: string;
  sourceDocument?: string;
};

export type ScaleExecutionGroupResponse = {
  code: string;
  title: string;
  order: number;
  instruction?: string;
  description?: string;
  cognitiveDomainCodes: string[];
};

export type ItemExecutionScoreRangeResponse = {
  min: number | null;
  max: number | null;
  step?: number;
};

export type ItemExecutionConfigResponse = {
  prompt?: string;
  instruction?: string;
  scoreRange: ItemExecutionScoreRangeResponse;
  evidenceTypes: ItemEvidenceType[];
  requiresTimer: boolean;
  supportsPhotoUpload: boolean;
  supportsHandwriting: boolean;
  requiresOperatorNote: boolean;
};

export type ItemResponseVersionTraceResponse = {
  scaleVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  sourceDocument?: string;
};

export type ItemStepDraftResponse = {
  stepCode: string;
  crfCode?: string;
  label?: string;
  order: number;
  actualValue: ItemResponseDraftJsonValue;
  countsTowardItemScore: boolean;
  note?: string;
};

export type ItemPromptDraftResponse = {
  promptType: PromptResponseType;
  promptText?: string;
  responseAfterPrompt: ItemResponseDraftJsonValue;
  countsTowardScore: boolean;
  order: number;
  note?: string;
};

export type ItemTimingDraftResponse = {
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  timerSource: ItemTimerSource;
};

export type ItemEvidenceRequirementResponse = {
  evidenceType: ItemEvidenceType;
  status: ItemEvidenceStatus;
  attached: boolean;
};

export type ItemResponseExecutionResponse = {
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
  versionTrace: ItemResponseVersionTraceResponse | null;
  config: ItemExecutionConfigResponse;
  status: ItemResponseStatus;
  answerSource: ItemResponseAnswerSource;
  rawResponse: ItemResponseDraftJsonValue;
  structuredResponse: { [key: string]: ItemResponseDraftJsonValue } | null;
  responseText?: string;
  isMissing: boolean;
  missingReason?: string;
  stepResponses: ItemStepDraftResponse[];
  promptResponses: ItemPromptDraftResponse[];
  timing: ItemTimingDraftResponse | null;
  evidenceRequirements: ItemEvidenceRequirementResponse[];
  operatorNote?: string;
};

export type ScaleInstanceExecutionDetailResponse = {
  visit: AssessmentVisitDetailResponse;
  scale: ScaleExecutionIdentityResponse;
  scaleInstance: ScaleInstanceListItemResponse;
  groups: ScaleExecutionGroupResponse[];
  itemResponses: ItemResponseExecutionResponse[];
};

export type UpdateItemResponseDraftResponse = {
  itemResponse: ItemResponseExecutionResponse;
  progress: ScaleInstanceProgressResponse;
};
