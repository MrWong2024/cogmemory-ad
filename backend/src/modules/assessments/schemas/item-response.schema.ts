// backend/src/modules/assessments/schemas/item-response.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { Patient } from '../../patients/schemas/patient.schema';
import { ScaleDefinition } from '../../scales/schemas/scale-definition.schema';
import {
  SCALE_RESPONSE_TYPES,
  ScaleVersion,
  type ScaleResponseType,
} from '../../scales/schemas/scale-version.schema';
import { AssessmentVisit } from './assessment-visit.schema';
import { ScaleInstance } from './scale-instance.schema';

export const ITEM_RESPONSE_STATUSES = [
  'not_started',
  'in_progress',
  'answered',
  'scored',
  'locked',
  'voided',
] as const;
export type ItemResponseStatus = (typeof ITEM_RESPONSE_STATUSES)[number];

export const ITEM_RESPONSE_ANSWER_SOURCES = [
  'clinician_recorded',
  'supervised_patient_input',
  'paper_import',
  'system_generated',
] as const;
export type ItemResponseAnswerSource =
  (typeof ITEM_RESPONSE_ANSWER_SOURCES)[number];

export const ITEM_SCORE_STATUSES = [
  'not_scored',
  'auto_scored',
  'manual_scored',
  'needs_review',
] as const;
export type ItemScoreStatus = (typeof ITEM_SCORE_STATUSES)[number];

export const ITEM_SCORE_SOURCES = [
  'none',
  'auto_rule',
  'operator',
  'imported',
] as const;
export type ItemScoreSource = (typeof ITEM_SCORE_SOURCES)[number];

export const PROMPT_RESPONSE_TYPES = [
  'none',
  'repeat_instruction',
  'semantic_category',
  'multiple_choice',
  'operator_clarification',
  'other',
] as const;
export type PromptResponseType = (typeof PROMPT_RESPONSE_TYPES)[number];

export const ITEM_TIMER_SOURCES = [
  'none',
  'system',
  'manual',
  'imported',
] as const;
export type ItemTimerSource = (typeof ITEM_TIMER_SOURCES)[number];

export const ITEM_EVIDENCE_TYPES = [
  'photo',
  'handwriting',
  'duration',
  'raw_text',
  'operator_note',
  'audio',
  'other',
] as const;
export type ItemEvidenceType = (typeof ITEM_EVIDENCE_TYPES)[number];

export const ITEM_EVIDENCE_STATUSES = [
  'pending',
  'attached',
  'missing',
  'not_required',
] as const;
export type ItemEvidenceStatus = (typeof ITEM_EVIDENCE_STATUSES)[number];

export type ItemConfigSnapshot = Record<string, unknown> | null;
export type ItemRawResponse = unknown;
export type ItemStructuredResponse = Record<string, unknown> | null;
export type ItemStepValue = unknown;
export type PromptResponseValue = unknown;
export type ItemQualityControlHints = Record<string, unknown> | null;
export type ItemResponseMetadata = Record<string, unknown> | null;

@Schema({ _id: false })
export class ItemResponseVersionTrace {
  @Prop({ type: String, trim: true })
  scaleVersion?: string;

  @Prop({ type: String, trim: true })
  crfVersion?: string;

  @Prop({ type: String, trim: true })
  scoringRuleVersion?: string;

  @Prop({ type: String, trim: true })
  fieldEncodingVersion?: string;

  @Prop({ type: String, trim: true })
  sourceDocument?: string;
}

export const ItemResponseVersionTraceSchema = SchemaFactory.createForClass(
  ItemResponseVersionTrace,
);

@Schema({ _id: false })
export class ItemScoreSnapshot {
  @Prop({ type: Number, default: null })
  scoreValue?: number | null;

  @Prop({ type: Number, default: null })
  maxScore?: number | null;

  @Prop({ type: Number, default: null })
  minScore?: number | null;

  @Prop({
    type: String,
    enum: ITEM_SCORE_STATUSES,
    default: 'not_scored',
  })
  scoreStatus!: ItemScoreStatus;

  @Prop({
    type: String,
    enum: ITEM_SCORE_SOURCES,
    default: 'none',
  })
  scoreSource!: ItemScoreSource;

  @Prop({ type: Date, default: null })
  scoredAt?: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  scoredBy?: Types.ObjectId | null;

  @Prop({ type: String, trim: true })
  scoringNote?: string;
}

export const ItemScoreSnapshotSchema =
  SchemaFactory.createForClass(ItemScoreSnapshot);

@Schema({ _id: false })
export class ItemStepResult {
  @Prop({ type: String, required: true, trim: true, lowercase: true })
  stepCode!: string;

  @Prop({ type: String, trim: true })
  crfCode?: string;

  @Prop({ type: String, trim: true })
  label?: string;

  @Prop({ type: Number, required: true })
  order!: number;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  expectedValue?: ItemStepValue;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  actualValue?: ItemStepValue;

  @Prop({ type: Boolean, default: null })
  isCorrect?: boolean | null;

  @Prop({ type: Number, default: null })
  scoreValue?: number | null;

  @Prop({ type: Boolean, default: true })
  countsTowardItemScore!: boolean;

  @Prop({ type: String, trim: true })
  note?: string;
}

export const ItemStepResultSchema =
  SchemaFactory.createForClass(ItemStepResult);

@Schema({ _id: false })
export class PromptResponseRecord {
  @Prop({ type: String, enum: PROMPT_RESPONSE_TYPES, required: true })
  promptType!: PromptResponseType;

  @Prop({ type: String, trim: true })
  promptText?: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  responseAfterPrompt?: PromptResponseValue;

  @Prop({ type: Boolean, default: null })
  isCorrect?: boolean | null;

  @Prop({ type: Boolean, default: false })
  countsTowardScore!: boolean;

  @Prop({ type: Number, required: true })
  order!: number;

  @Prop({ type: String, trim: true })
  note?: string;
}

export const PromptResponseRecordSchema =
  SchemaFactory.createForClass(PromptResponseRecord);

@Schema({ _id: false })
export class ItemTimingSnapshot {
  @Prop({ type: Date, default: null })
  startedAt?: Date | null;

  @Prop({ type: Date, default: null })
  completedAt?: Date | null;

  @Prop({ type: Number, default: null })
  durationMs?: number | null;

  @Prop({ type: String, enum: ITEM_TIMER_SOURCES, default: 'none' })
  timerSource!: ItemTimerSource;
}

export const ItemTimingSnapshotSchema =
  SchemaFactory.createForClass(ItemTimingSnapshot);

@Schema({ _id: false })
export class ItemEvidenceRef {
  @Prop({ type: String, enum: ITEM_EVIDENCE_TYPES, required: true })
  evidenceType!: ItemEvidenceType;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  mediaEvidenceId?: Types.ObjectId | null;

  @Prop({ type: String, enum: ITEM_EVIDENCE_STATUSES, default: 'pending' })
  status!: ItemEvidenceStatus;

  @Prop({ type: String, trim: true })
  note?: string;
}

export const ItemEvidenceRefSchema =
  SchemaFactory.createForClass(ItemEvidenceRef);

@Schema({ timestamps: true, collection: 'item_responses' })
export class ItemResponse {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: AssessmentVisit.name,
    required: true,
  })
  assessmentVisitId!: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: ScaleInstance.name,
    required: true,
  })
  scaleInstanceId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: Patient.name, required: true })
  patientId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, uppercase: true })
  subjectCode!: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: ScaleDefinition.name,
    required: true,
  })
  scaleDefinitionId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: ScaleVersion.name, required: true })
  scaleVersionId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  scaleCode!: string;

  @Prop({ type: String, required: true, trim: true })
  scaleVersion!: string;

  @Prop({ type: String, required: true, trim: true, uppercase: true })
  instanceCode!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  itemCode!: string;

  @Prop({ type: String, trim: true })
  crfCode?: string;

  @Prop({ type: String, trim: true, lowercase: true })
  groupCode?: string;

  @Prop({ type: String, trim: true })
  itemTitle?: string;

  @Prop({ type: Number, required: true })
  itemOrder!: number;

  @Prop({ type: String, enum: SCALE_RESPONSE_TYPES, required: true })
  responseType!: ScaleResponseType;

  @Prop({ type: Boolean, required: true, default: true })
  countsTowardTotal!: boolean;

  @Prop({ type: [{ type: String, trim: true }], default: [] })
  cognitiveDomainCodes!: string[];

  @Prop({ type: SchemaTypes.Mixed, default: null })
  itemConfigSnapshot?: ItemConfigSnapshot;

  @Prop({ type: ItemResponseVersionTraceSchema, default: null })
  versionTrace?: ItemResponseVersionTrace | null;

  @Prop({
    type: String,
    enum: ITEM_RESPONSE_STATUSES,
    default: 'not_started',
  })
  status!: ItemResponseStatus;

  @Prop({
    type: String,
    enum: ITEM_RESPONSE_ANSWER_SOURCES,
    default: 'clinician_recorded',
  })
  answerSource!: ItemResponseAnswerSource;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  rawResponse?: ItemRawResponse;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  structuredResponse?: ItemStructuredResponse;

  @Prop({ type: String, trim: true })
  responseText?: string;

  @Prop({ type: String, trim: true })
  responseSummary?: string;

  @Prop({ type: Boolean, default: false })
  isMissing!: boolean;

  @Prop({ type: String, trim: true })
  missingReason?: string;

  @Prop({ type: ItemScoreSnapshotSchema, default: null })
  score?: ItemScoreSnapshot | null;

  @Prop({ type: [ItemStepResultSchema], default: [] })
  stepResults!: ItemStepResult[];

  @Prop({ type: [PromptResponseRecordSchema], default: [] })
  promptResponses!: PromptResponseRecord[];

  @Prop({ type: ItemTimingSnapshotSchema, default: null })
  timing?: ItemTimingSnapshot | null;

  @Prop({ type: [ItemEvidenceRefSchema], default: [] })
  evidenceRefs!: ItemEvidenceRef[];

  @Prop({ type: String, trim: true })
  operatorNote?: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  qualityControlHints?: ItemQualityControlHints;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  metadata?: ItemResponseMetadata;

  @Prop({ type: Date, default: null })
  lockedAt?: Date | null;

  @Prop({ type: Date, default: null })
  voidedAt?: Date | null;
}

export type ItemResponseDocument = HydratedDocument<ItemResponse> & {
  _id: Types.ObjectId;
};

export const ItemResponseSchema = SchemaFactory.createForClass(ItemResponse);

ItemResponseSchema.index({ scaleInstanceId: 1, itemCode: 1 }, { unique: true });
ItemResponseSchema.index({
  assessmentVisitId: 1,
  scaleInstanceId: 1,
  itemOrder: 1,
});
ItemResponseSchema.index({ patientId: 1, scaleCode: 1, itemCode: 1 });
ItemResponseSchema.index({ scaleCode: 1, itemCode: 1 });
ItemResponseSchema.index({ status: 1, updatedAt: -1 });
ItemResponseSchema.index({ scaleInstanceId: 1, countsTowardTotal: 1 });
