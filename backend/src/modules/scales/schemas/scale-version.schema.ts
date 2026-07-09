// backend/src/modules/scales/schemas/scale-version.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { ScaleDefinition, SCALE_STATUSES } from './scale-definition.schema';
import type { ScaleStatus } from './scale-definition.schema';

export const SCALE_RESPONSE_TYPES = [
  'boolean',
  'single_choice',
  'multi_choice',
  'number',
  'text',
  'drawing',
  'photo_upload',
  'handwriting',
  'timed_task',
  'multi_step_calculation',
] as const;
export type ScaleResponseType = (typeof SCALE_RESPONSE_TYPES)[number];

export const SCALE_EVIDENCE_TYPES = [
  'photo',
  'handwriting',
  'duration',
  'raw_text',
  'operator_note',
] as const;
export type ScaleEvidenceType = (typeof SCALE_EVIDENCE_TYPES)[number];

export type ScaleRuleConfig = Record<string, unknown> | null;

@Schema({ _id: false })
export class ScaleScoreRangeConfig {
  @Prop({ type: Number, required: true })
  min!: number;

  @Prop({ type: Number, required: true })
  max!: number;

  @Prop({ type: Number })
  step?: number;
}

export const ScaleScoreRangeConfigSchema = SchemaFactory.createForClass(
  ScaleScoreRangeConfig,
);

@Schema({ _id: false })
export class ScaleGroupConfig {
  @Prop({ type: String, required: true, trim: true })
  code!: string;

  @Prop({ type: String, required: true, trim: true })
  title!: string;

  @Prop({ type: Number, required: true })
  order!: number;

  @Prop({ type: String, trim: true })
  instruction?: string;

  @Prop({ type: String, trim: true })
  description?: string;

  @Prop({ type: [{ type: String, trim: true }], default: [] })
  cognitiveDomainCodes!: string[];
}

export const ScaleGroupConfigSchema =
  SchemaFactory.createForClass(ScaleGroupConfig);

@Schema({ _id: false })
export class ScaleItemConfig {
  @Prop({ type: String, required: true, trim: true })
  code!: string;

  @Prop({ type: String, trim: true })
  crfCode?: string;

  @Prop({ type: String, required: true, trim: true })
  title!: string;

  @Prop({ type: String, trim: true })
  prompt?: string;

  @Prop({ type: String, trim: true })
  instruction?: string;

  @Prop({ type: Number, required: true })
  order!: number;

  @Prop({ type: String, trim: true })
  groupCode?: string;

  @Prop({ type: String, enum: SCALE_RESPONSE_TYPES, required: true })
  responseType!: ScaleResponseType;

  @Prop({ type: ScaleScoreRangeConfigSchema, required: true })
  scoreRange!: ScaleScoreRangeConfig;

  @Prop({ type: Boolean, default: true })
  countsTowardTotal!: boolean;

  @Prop({ type: [{ type: String, trim: true }], default: [] })
  cognitiveDomainCodes!: string[];

  @Prop({
    type: [{ type: String, enum: SCALE_EVIDENCE_TYPES, trim: true }],
    default: [],
  })
  evidenceTypes!: ScaleEvidenceType[];

  @Prop({ type: Boolean, default: false })
  requiresTimer!: boolean;

  @Prop({ type: Boolean, default: false })
  supportsPhotoUpload!: boolean;

  @Prop({ type: Boolean, default: false })
  supportsHandwriting!: boolean;

  @Prop({ type: Boolean, default: false })
  requiresOperatorNote!: boolean;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  scoringRule?: ScaleRuleConfig;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  qualityControlRule?: ScaleRuleConfig;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  reportingRule?: ScaleRuleConfig;

  @Prop({ type: String, trim: true })
  researchExportField?: string;
}

export const ScaleItemConfigSchema =
  SchemaFactory.createForClass(ScaleItemConfig);

@Schema({ timestamps: true, collection: 'scale_versions' })
export class ScaleVersion {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: ScaleDefinition.name,
    required: true,
  })
  scaleDefinitionId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  scaleCode!: string;

  @Prop({ type: String, required: true, trim: true })
  version!: string;

  @Prop({ type: String, trim: true })
  displayVersion?: string;

  @Prop({ type: String, trim: true })
  crfVersion?: string;

  @Prop({ type: String, trim: true })
  scoringRuleVersion?: string;

  @Prop({ type: String, trim: true })
  fieldEncodingVersion?: string;

  @Prop({ type: String, trim: true })
  sourceDocument?: string;

  @Prop({
    type: String,
    enum: SCALE_STATUSES,
    required: true,
    default: 'draft',
  })
  status!: ScaleStatus;

  @Prop({ type: ScaleScoreRangeConfigSchema, required: true })
  totalScoreRange!: ScaleScoreRangeConfig;

  @Prop({ type: [ScaleGroupConfigSchema], default: [] })
  groups!: ScaleGroupConfig[];

  @Prop({ type: [ScaleItemConfigSchema], default: [] })
  items!: ScaleItemConfig[];

  @Prop({ type: SchemaTypes.Mixed, default: null })
  qualityControlRules?: ScaleRuleConfig;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  reportingRules?: ScaleRuleConfig;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  researchExportMappings?: ScaleRuleConfig;

  @Prop({ type: Date, default: null })
  effectiveFrom?: Date | null;

  @Prop({ type: Date, default: null })
  retiredAt?: Date | null;
}

export type ScaleVersionDocument = HydratedDocument<ScaleVersion> & {
  _id: Types.ObjectId;
};

export const ScaleVersionSchema = SchemaFactory.createForClass(ScaleVersion);

ScaleVersionSchema.index(
  { scaleDefinitionId: 1, version: 1 },
  { unique: true },
);
ScaleVersionSchema.index({ scaleCode: 1, version: 1 });
ScaleVersionSchema.index({ scaleCode: 1, status: 1 });
