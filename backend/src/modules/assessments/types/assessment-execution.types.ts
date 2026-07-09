// backend/src/modules/assessments/types/assessment-execution.types.ts
import type { Types } from 'mongoose';
import type {
  AssessmentOperatorRole,
  AssessmentStatus,
} from '../schemas/assessment-visit.schema';
import type {
  ItemEvidenceStatus,
  ItemEvidenceType,
  ItemResponseAnswerSource,
  ItemResponseStatus,
  ItemScoreSource,
  ItemScoreStatus,
  ItemTimerSource,
  PromptResponseType,
} from '../schemas/item-response.schema';
import type { ScaleAdministrationMode } from '../schemas/scale-instance.schema';
import type { ScaleResponseType } from '../../scales/schemas/scale-version.schema';
import type { ScaleSeedValidationResult } from '../../scales/seeds/scale-seed.types';

export type AssessmentExecutionMetadata = Record<string, unknown> | null;
export type AssessmentExecutionMixedRecord = Record<string, unknown> | null;

export type AssessmentExecutionOperatorSnapshotInput = {
  operatorId?: Types.ObjectId | string | null;
  operatorName?: string;
  operatorRole?: string;
};

export type AssessmentExecutionOperatorSnapshotDraft = {
  operatorId?: Types.ObjectId | null;
  operatorName?: string;
  operatorRole?: AssessmentOperatorRole;
};

export type AssessmentExecutionOperatorSnapshotSummary = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: AssessmentOperatorRole;
};

export type BuildScaleExecutionPlanInput = {
  patientId: Types.ObjectId | string;
  assessmentVisitId: Types.ObjectId | string;
  subjectCode: string;
  scaleDefinitionId: Types.ObjectId | string;
  scaleVersionId: Types.ObjectId | string;
  scaleCode: string;
  scaleVersion: string;
  instanceCode: string;
  instanceNo?: number;
  administrationMode?: string;
  operatorSnapshot?: AssessmentExecutionOperatorSnapshotInput | null;
  startedAt?: Date | null;
  metadata?: AssessmentExecutionMetadata;
};

export type AssessmentExecutionVersionTrace = {
  scaleVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  sourceDocument?: string;
};

export type ScaleInstanceDraft = {
  assessmentVisitId: Types.ObjectId;
  patientId: Types.ObjectId;
  subjectCode: string;
  scaleDefinitionId: Types.ObjectId;
  scaleVersionId: Types.ObjectId;
  scaleCode: string;
  scaleVersion: string;
  instanceCode: string;
  instanceNo: number;
  status: AssessmentStatus;
  administrationMode: ScaleAdministrationMode;
  versionTrace: Omit<AssessmentExecutionVersionTrace, 'scaleVersion'> | null;
  startedAt: Date | null;
  completedAt: Date | null;
  lockedAt: Date | null;
  voidedAt: Date | null;
  durationMs: number | null;
  operatorSnapshot: AssessmentExecutionOperatorSnapshotDraft | null;
  progress: Record<string, unknown>;
  qualityControlSummary: AssessmentExecutionMixedRecord;
  metadata: AssessmentExecutionMetadata;
};

export type ItemScoreDraft = {
  scoreValue: number | null;
  maxScore: number | null;
  minScore: number | null;
  scoreStatus: ItemScoreStatus;
  scoreSource: ItemScoreSource;
  scoredAt: Date | null;
  scoredBy: Types.ObjectId | null;
};

export type ItemStepResultDraft = {
  stepCode: string;
  crfCode?: string;
  label?: string;
  order: number;
  expectedValue: unknown;
  actualValue: unknown;
  isCorrect: boolean | null;
  scoreValue: number | null;
  countsTowardItemScore: boolean;
};

export type PromptResponseDraft = {
  promptType: PromptResponseType;
  promptText?: string;
  responseAfterPrompt: unknown;
  isCorrect: boolean | null;
  countsTowardScore: boolean;
  order: number;
  note?: string;
};

export type ItemTimingDraft = {
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  timerSource: ItemTimerSource;
};

export type ItemEvidenceRefDraft = {
  evidenceType: ItemEvidenceType;
  mediaEvidenceId: Types.ObjectId | null;
  status: ItemEvidenceStatus;
  note?: string;
};

export type ItemResponseDraft = {
  assessmentVisitId: Types.ObjectId;
  scaleInstanceId: Types.ObjectId | null;
  patientId: Types.ObjectId;
  subjectCode: string;
  scaleDefinitionId: Types.ObjectId;
  scaleVersionId: Types.ObjectId;
  scaleCode: string;
  scaleVersion: string;
  instanceCode: string;
  itemCode: string;
  crfCode?: string;
  groupCode?: string;
  itemTitle?: string;
  itemOrder: number;
  responseType: ScaleResponseType;
  countsTowardTotal: boolean;
  cognitiveDomainCodes: string[];
  itemConfigSnapshot: Record<string, unknown>;
  versionTrace: AssessmentExecutionVersionTrace;
  status: ItemResponseStatus;
  answerSource: ItemResponseAnswerSource;
  rawResponse: null;
  structuredResponse: null;
  isMissing: boolean;
  score: ItemScoreDraft;
  stepResults: ItemStepResultDraft[];
  promptResponses: PromptResponseDraft[];
  timing: ItemTimingDraft | null;
  evidenceRefs: ItemEvidenceRefDraft[];
  qualityControlHints: AssessmentExecutionMixedRecord;
  metadata: AssessmentExecutionMetadata;
  lockedAt: Date | null;
  voidedAt: Date | null;
};

export type ScaleExecutionSeedSummary = {
  scaleCode: string;
  scaleVersion: string;
  itemCount: number;
  groupCount: number;
  sourceDocument?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
};

export type ScaleExecutionPlan = {
  scaleInstanceDraft: ScaleInstanceDraft;
  itemResponseDrafts: ItemResponseDraft[];
  seedSummary: ScaleExecutionSeedSummary;
  validation: ScaleSeedValidationResult;
};

export type CreatedScaleInstanceSummary = Omit<
  ScaleInstanceDraft,
  | 'assessmentVisitId'
  | 'patientId'
  | 'scaleDefinitionId'
  | 'scaleVersionId'
  | 'operatorSnapshot'
> & {
  id: string;
  assessmentVisitId: string;
  patientId: string;
  scaleDefinitionId: string;
  scaleVersionId: string;
  operatorSnapshot: AssessmentExecutionOperatorSnapshotSummary | null;
};

export type CreatedItemScoreSummary = Omit<ItemScoreDraft, 'scoredBy'> & {
  scoredBy: string | null;
};

export type CreatedItemEvidenceRefSummary = Omit<
  ItemEvidenceRefDraft,
  'mediaEvidenceId'
> & {
  mediaEvidenceId: string | null;
};

export type CreatedItemResponseSummary = Omit<
  ItemResponseDraft,
  | 'assessmentVisitId'
  | 'scaleInstanceId'
  | 'patientId'
  | 'scaleDefinitionId'
  | 'scaleVersionId'
  | 'score'
  | 'evidenceRefs'
> & {
  id: string;
  assessmentVisitId: string;
  scaleInstanceId: string;
  patientId: string;
  scaleDefinitionId: string;
  scaleVersionId: string;
  score: CreatedItemScoreSummary;
  evidenceRefs: CreatedItemEvidenceRefSummary[];
};

export type ScaleExecutionCreationResult = {
  scaleInstance: CreatedScaleInstanceSummary;
  itemResponses: CreatedItemResponseSummary[];
  createdItemResponseCount: number;
  scaleCode: string;
  scaleVersion: string;
  instanceCode: string;
};
