// backend/src/modules/scoring/schemas/score-result.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { AssessmentVisit } from '../../assessments/schemas/assessment-visit.schema';
import { ItemResponse } from '../../assessments/schemas/item-response.schema';
import { ScaleInstance } from '../../assessments/schemas/scale-instance.schema';
import { Patient } from '../../patients/schemas/patient.schema';
import { ScaleDefinition } from '../../scales/schemas/scale-definition.schema';
import { ScaleVersion } from '../../scales/schemas/scale-version.schema';

export const SCORE_RESULT_STATUSES = [
  'draft',
  'computed',
  'needs_review',
  'confirmed',
  'locked',
  'voided',
] as const;
export type ScoreResultStatus = (typeof SCORE_RESULT_STATUSES)[number];

export const SCORING_SOURCES = [
  'auto_rule',
  'manual',
  'imported',
  'mixed',
] as const;
export type ScoringSource = (typeof SCORING_SOURCES)[number];

export const SCORING_MODES = [
  'rule_based',
  'manual_summary',
  'imported',
] as const;
export type ScoringMode = (typeof SCORING_MODES)[number];

export const SCORE_ITEM_STATUSES = [
  'not_scored',
  'auto_scored',
  'manual_scored',
  'needs_review',
] as const;
export type ScoreItemStatus = (typeof SCORE_ITEM_STATUSES)[number];

export const SCORE_ITEM_SOURCES = [
  'none',
  'auto_rule',
  'operator',
  'imported',
] as const;
export type ScoreItemSource = (typeof SCORE_ITEM_SOURCES)[number];

export const SCORE_REVIEW_STATUSES = [
  'not_required',
  'pending',
  'reviewed',
  'rejected',
] as const;
export type ScoreReviewStatus = (typeof SCORE_REVIEW_STATUSES)[number];

export const SCORE_QUALITY_STATUSES = [
  'unchecked',
  'passed',
  'needs_review',
  'failed',
] as const;
export type ScoreQualityStatus = (typeof SCORE_QUALITY_STATUSES)[number];

export type ScoreQualityHints = Record<string, unknown> | null;
export type ScoreResultMetadata = Record<string, unknown> | null;

@Schema({ _id: false })
export class ScoreVersionTrace {
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

export const ScoreVersionTraceSchema =
  SchemaFactory.createForClass(ScoreVersionTrace);

@Schema({ _id: false })
export class TotalScoreSnapshot {
  @Prop({ type: Number, default: null })
  scoreValue?: number | null;

  @Prop({ type: Number, default: null })
  maxScore?: number | null;

  @Prop({ type: Number, default: null })
  minScore?: number | null;

  @Prop({ type: Number, default: null })
  scorePercent?: number | null;

  @Prop({ type: Number, default: 0 })
  scoredItemCount!: number;

  @Prop({ type: Number, default: 0 })
  totalItemCount!: number;

  @Prop({ type: Number, default: 0 })
  unscoredItemCount!: number;

  @Prop({ type: Number, default: 0 })
  missingItemCount!: number;

  @Prop({ type: Number, default: 0 })
  needsReviewItemCount!: number;
}

export const TotalScoreSnapshotSchema =
  SchemaFactory.createForClass(TotalScoreSnapshot);

@Schema({ _id: false })
export class ScoreItemSnapshot {
  @Prop({ type: SchemaTypes.ObjectId, ref: ItemResponse.name, default: null })
  itemResponseId?: Types.ObjectId | null;

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

  @Prop({ type: String, trim: true })
  responseType?: string;

  @Prop({ type: Boolean, default: true })
  countsTowardTotal!: boolean;

  @Prop({ type: Boolean, default: true })
  includedInTotal!: boolean;

  @Prop({ type: Number, default: null })
  scoreValue?: number | null;

  @Prop({ type: Number, default: null })
  maxScore?: number | null;

  @Prop({ type: Number, default: null })
  minScore?: number | null;

  @Prop({
    type: String,
    enum: SCORE_ITEM_STATUSES,
    default: 'not_scored',
  })
  scoreStatus!: ScoreItemStatus;

  @Prop({
    type: String,
    enum: SCORE_ITEM_SOURCES,
    default: 'none',
  })
  scoreSource!: ScoreItemSource;

  @Prop({ type: Boolean, default: false })
  isMissing!: boolean;

  @Prop({ type: [{ type: String, trim: true }], default: [] })
  cognitiveDomainCodes!: string[];

  @Prop({ type: String, trim: true })
  note?: string;
}

export const ScoreItemSnapshotSchema =
  SchemaFactory.createForClass(ScoreItemSnapshot);

@Schema({ _id: false })
export class ScoreGroupSnapshot {
  @Prop({ type: String, required: true, trim: true, lowercase: true })
  groupCode!: string;

  @Prop({ type: String, trim: true })
  groupTitle?: string;

  @Prop({ type: Number, default: null })
  scoreValue?: number | null;

  @Prop({ type: Number, default: null })
  maxScore?: number | null;

  @Prop({ type: Number, default: null })
  minScore?: number | null;

  @Prop({ type: Number, default: 0 })
  scoredItemCount!: number;

  @Prop({ type: Number, default: 0 })
  totalItemCount!: number;

  @Prop({ type: String, trim: true })
  note?: string;
}

export const ScoreGroupSnapshotSchema =
  SchemaFactory.createForClass(ScoreGroupSnapshot);

@Schema({ _id: false })
export class ScoringComputationSnapshot {
  @Prop({ type: Date, default: null })
  computedAt?: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  computedBy?: Types.ObjectId | null;

  @Prop({ type: String, trim: true })
  ruleSetCode?: string;

  @Prop({ type: String, trim: true })
  ruleSetVersion?: string;

  @Prop({ type: String, trim: true })
  engineVersion?: string;

  @Prop({ type: Number, default: 0 })
  inputItemCount!: number;

  @Prop({ type: Number, default: 0 })
  includedItemCount!: number;

  @Prop({ type: Number, default: 0 })
  excludedItemCount!: number;

  @Prop({ type: Number, default: 0 })
  warningCount!: number;

  @Prop({ type: String, trim: true })
  notes?: string;
}

export const ScoringComputationSnapshotSchema = SchemaFactory.createForClass(
  ScoringComputationSnapshot,
);

@Schema({ _id: false })
export class ScoreReviewSnapshot {
  @Prop({
    type: String,
    enum: SCORE_REVIEW_STATUSES,
    default: 'not_required',
  })
  reviewStatus!: ScoreReviewStatus;

  @Prop({ type: Date, default: null })
  reviewedAt?: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  reviewerId?: Types.ObjectId | null;

  @Prop({ type: String, trim: true })
  reviewerName?: string;

  @Prop({ type: String, trim: true })
  reviewNote?: string;
}

export const ScoreReviewSnapshotSchema =
  SchemaFactory.createForClass(ScoreReviewSnapshot);

@Schema({ timestamps: true, collection: 'score_results' })
export class ScoreResult {
  @Prop({ type: SchemaTypes.ObjectId, ref: Patient.name, required: true })
  patientId!: Types.ObjectId;

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

  @Prop({ type: String, required: true, trim: true, uppercase: true })
  scoreResultCode!: string;

  @Prop({ type: Number, required: true, default: 1 })
  runNo!: number;

  @Prop({
    type: String,
    enum: SCORE_RESULT_STATUSES,
    required: true,
    default: 'draft',
  })
  status!: ScoreResultStatus;

  @Prop({
    type: String,
    enum: SCORING_SOURCES,
    required: true,
    default: 'auto_rule',
  })
  scoringSource!: ScoringSource;

  @Prop({
    type: String,
    enum: SCORING_MODES,
    required: true,
    default: 'rule_based',
  })
  scoringMode!: ScoringMode;

  @Prop({ type: ScoreVersionTraceSchema, default: null })
  versionTrace?: ScoreVersionTrace | null;

  @Prop({ type: TotalScoreSnapshotSchema, default: null })
  totalScore?: TotalScoreSnapshot | null;

  @Prop({ type: [ScoreItemSnapshotSchema], default: [] })
  itemScores!: ScoreItemSnapshot[];

  @Prop({ type: [ScoreGroupSnapshotSchema], default: [] })
  groupScores!: ScoreGroupSnapshot[];

  @Prop({ type: ScoringComputationSnapshotSchema, default: null })
  computation?: ScoringComputationSnapshot | null;

  @Prop({ type: ScoreReviewSnapshotSchema, default: null })
  review?: ScoreReviewSnapshot | null;

  @Prop({
    type: String,
    enum: SCORE_QUALITY_STATUSES,
    required: true,
    default: 'unchecked',
  })
  qualityStatus!: ScoreQualityStatus;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  qualityHints?: ScoreQualityHints;

  @Prop({ type: String, trim: true })
  operatorNote?: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  metadata?: ScoreResultMetadata;

  @Prop({ type: Date, default: null })
  confirmedAt?: Date | null;

  @Prop({ type: Date, default: null })
  lockedAt?: Date | null;

  @Prop({ type: Date, default: null })
  voidedAt?: Date | null;
}

export type ScoreResultDocument = HydratedDocument<ScoreResult> & {
  _id: Types.ObjectId;
};

export const ScoreResultSchema = SchemaFactory.createForClass(ScoreResult);

ScoreResultSchema.index({ scoreResultCode: 1 }, { unique: true });
ScoreResultSchema.index({ scaleInstanceId: 1, runNo: 1 }, { unique: true });
ScoreResultSchema.index({ scaleInstanceId: 1, status: 1, createdAt: -1 });
ScoreResultSchema.index({ assessmentVisitId: 1, scaleCode: 1, createdAt: -1 });
ScoreResultSchema.index({ patientId: 1, scaleCode: 1, createdAt: -1 });
ScoreResultSchema.index({ status: 1, updatedAt: -1 });
ScoreResultSchema.index({ scaleCode: 1, scaleVersion: 1 });
ScoreResultSchema.index({ qualityStatus: 1, updatedAt: -1 });
