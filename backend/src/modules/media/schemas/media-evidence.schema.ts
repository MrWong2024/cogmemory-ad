// backend/src/modules/media/schemas/media-evidence.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { AssessmentVisit } from '../../assessments/schemas/assessment-visit.schema';
import { ItemResponse } from '../../assessments/schemas/item-response.schema';
import { ScaleInstance } from '../../assessments/schemas/scale-instance.schema';
import { Patient } from '../../patients/schemas/patient.schema';
import { ScaleDefinition } from '../../scales/schemas/scale-definition.schema';
import { ScaleVersion } from '../../scales/schemas/scale-version.schema';

export const MEDIA_EVIDENCE_TYPES = [
  'photo',
  'handwriting',
  'document_scan',
  'audio',
  'raw_text_snapshot',
  'other',
] as const;
export type MediaEvidenceType = (typeof MEDIA_EVIDENCE_TYPES)[number];

export const MEDIA_CAPTURE_MODES = [
  'photo_upload',
  'tablet_handwriting',
  'paper_scan',
  'system_generated',
  'imported',
  'other',
] as const;
export type MediaCaptureMode = (typeof MEDIA_CAPTURE_MODES)[number];

export const MEDIA_EVIDENCE_STATUSES = [
  'pending',
  'attached',
  'locked',
  'voided',
  'deleted',
] as const;
export type MediaEvidenceStatus = (typeof MEDIA_EVIDENCE_STATUSES)[number];

export const MEDIA_STORAGE_STATUSES = [
  'pending',
  'stored',
  'missing',
  'deleted',
] as const;
export type MediaStorageStatus = (typeof MEDIA_STORAGE_STATUSES)[number];

export const MEDIA_RESPONSE_TYPES = [
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
export type MediaResponseType = (typeof MEDIA_RESPONSE_TYPES)[number];

export const MEDIA_STORAGE_DRIVERS = [
  'fake',
  'oss',
  'external',
  'unknown',
] as const;
export type MediaStorageDriver = (typeof MEDIA_STORAGE_DRIVERS)[number];

export const HANDWRITING_TRAJECTORY_FORMATS = [
  'json',
  'svg',
  'strokes',
  'unknown',
] as const;
export type HandwritingTrajectoryFormat =
  (typeof HANDWRITING_TRAJECTORY_FORMATS)[number];

export const HANDWRITING_INPUT_TOOLS = [
  'stylus',
  'finger',
  'mouse',
  'unknown',
] as const;
export type HandwritingInputTool = (typeof HANDWRITING_INPUT_TOOLS)[number];

export const MEDIA_OPERATOR_ROLES = [
  'doctor',
  'nurse',
  'research_assistant',
  'admin',
  'unknown',
] as const;
export type MediaOperatorRole = (typeof MEDIA_OPERATOR_ROLES)[number];

export const MEDIA_QUALITY_STATUSES = [
  'unchecked',
  'acceptable',
  'needs_review',
  'unusable',
] as const;
export type MediaQualityStatus = (typeof MEDIA_QUALITY_STATUSES)[number];

export type MediaItemSnapshot = Record<string, unknown> | null;
export type MediaQualityHints = Record<string, unknown> | null;
export type MediaEvidenceMetadata = Record<string, unknown> | null;

@Schema({ _id: false })
export class MediaEvidenceVersionTrace {
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

export const MediaEvidenceVersionTraceSchema = SchemaFactory.createForClass(
  MediaEvidenceVersionTrace,
);

@Schema({ _id: false })
export class MediaStorageSnapshot {
  @Prop({
    type: String,
    enum: MEDIA_STORAGE_DRIVERS,
    required: true,
    default: 'unknown',
  })
  storageDriver!: MediaStorageDriver;

  @Prop({ type: String, trim: true })
  bucket?: string;

  @Prop({ type: String, trim: true })
  objectKey?: string;

  @Prop({ type: String, trim: true })
  objectPrefix?: string;

  @Prop({ type: String, trim: true })
  publicUrl?: string;

  @Prop({ type: String, trim: true })
  mimeType?: string;

  @Prop({ type: String, trim: true })
  fileExtension?: string;

  @Prop({ type: Number, default: null })
  sizeBytes?: number | null;

  @Prop({ type: String, trim: true })
  checksum?: string;

  @Prop({ type: String, trim: true })
  checksumAlgorithm?: string;

  @Prop({ type: String, trim: true })
  originalFilename?: string;

  @Prop({ type: Date, default: null })
  storedAt?: Date | null;
}

export const MediaStorageSnapshotSchema =
  SchemaFactory.createForClass(MediaStorageSnapshot);

@Schema({ _id: false })
export class MediaImageMetadata {
  @Prop({ type: Number, default: null })
  width?: number | null;

  @Prop({ type: Number, default: null })
  height?: number | null;

  @Prop({ type: String, trim: true })
  orientation?: string;

  @Prop({ type: Number, default: null })
  pageNo?: number | null;

  @Prop({ type: Boolean, default: null })
  isColor?: boolean | null;

  @Prop({ type: Date, default: null })
  capturedAt?: Date | null;
}

export const MediaImageMetadataSchema =
  SchemaFactory.createForClass(MediaImageMetadata);

@Schema({ _id: false })
export class HandwritingTraceSnapshot {
  @Prop({ type: Boolean, default: false })
  hasTrajectory!: boolean;

  @Prop({ type: String, trim: true })
  trajectoryObjectKey?: string;

  @Prop({
    type: String,
    enum: HANDWRITING_TRAJECTORY_FORMATS,
    default: 'unknown',
  })
  trajectoryFormat!: HandwritingTrajectoryFormat;

  @Prop({ type: Number, default: null })
  strokeCount?: number | null;

  @Prop({ type: Number, default: null })
  durationMs?: number | null;

  @Prop({ type: Number, default: null })
  canvasWidth?: number | null;

  @Prop({ type: Number, default: null })
  canvasHeight?: number | null;

  @Prop({ type: String, trim: true })
  deviceType?: string;

  @Prop({
    type: String,
    enum: HANDWRITING_INPUT_TOOLS,
    default: 'unknown',
  })
  inputTool!: HandwritingInputTool;
}

export const HandwritingTraceSnapshotSchema = SchemaFactory.createForClass(
  HandwritingTraceSnapshot,
);

@Schema({ _id: false })
export class MediaCaptureContext {
  @Prop({ type: Date, default: null })
  capturedAt?: Date | null;

  @Prop({ type: Date, default: null })
  uploadedAt?: Date | null;

  @Prop({ type: String, trim: true })
  sourceDevice?: string;

  @Prop({ type: String, trim: true })
  sourceApp?: string;

  @Prop({ type: String, trim: true })
  captureNote?: string;
}

export const MediaCaptureContextSchema =
  SchemaFactory.createForClass(MediaCaptureContext);

@Schema({ _id: false })
export class MediaOperatorSnapshot {
  @Prop({ type: SchemaTypes.ObjectId, default: null })
  operatorId?: Types.ObjectId | null;

  @Prop({ type: String, trim: true })
  operatorName?: string;

  @Prop({ type: String, enum: MEDIA_OPERATOR_ROLES, trim: true })
  operatorRole?: MediaOperatorRole;
}

export const MediaOperatorSnapshotSchema = SchemaFactory.createForClass(
  MediaOperatorSnapshot,
);

@Schema({ timestamps: true, collection: 'media_evidences' })
export class MediaEvidence {
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

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: ItemResponse.name,
    required: true,
  })
  itemResponseId!: Types.ObjectId;

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

  @Prop({ type: String, required: true, trim: true, uppercase: true })
  evidenceCode!: string;

  @Prop({ type: String, enum: MEDIA_EVIDENCE_TYPES, required: true })
  evidenceType!: MediaEvidenceType;

  @Prop({ type: String, enum: MEDIA_CAPTURE_MODES, required: true })
  captureMode!: MediaCaptureMode;

  @Prop({
    type: String,
    enum: MEDIA_EVIDENCE_STATUSES,
    required: true,
    default: 'pending',
  })
  status!: MediaEvidenceStatus;

  @Prop({
    type: String,
    enum: MEDIA_STORAGE_STATUSES,
    required: true,
    default: 'pending',
  })
  storageStatus!: MediaStorageStatus;

  @Prop({ type: String, trim: true })
  crfCode?: string;

  @Prop({ type: String, trim: true, lowercase: true })
  groupCode?: string;

  @Prop({ type: String, trim: true })
  itemTitle?: string;

  @Prop({ type: String, enum: MEDIA_RESPONSE_TYPES, trim: true })
  responseType?: MediaResponseType;

  @Prop({ type: Boolean, default: null })
  countsTowardTotal?: boolean | null;

  @Prop({ type: [{ type: String, trim: true }], default: [] })
  cognitiveDomainCodes!: string[];

  @Prop({ type: SchemaTypes.Mixed, default: null })
  itemSnapshot?: MediaItemSnapshot;

  @Prop({ type: MediaEvidenceVersionTraceSchema, default: null })
  versionTrace?: MediaEvidenceVersionTrace | null;

  @Prop({ type: MediaStorageSnapshotSchema, default: null })
  storage?: MediaStorageSnapshot | null;

  @Prop({ type: MediaImageMetadataSchema, default: null })
  imageMetadata?: MediaImageMetadata | null;

  @Prop({ type: HandwritingTraceSnapshotSchema, default: null })
  handwritingTrace?: HandwritingTraceSnapshot | null;

  @Prop({ type: MediaCaptureContextSchema, default: null })
  captureContext?: MediaCaptureContext | null;

  @Prop({ type: MediaOperatorSnapshotSchema, default: null })
  operatorSnapshot?: MediaOperatorSnapshot | null;

  @Prop({
    type: String,
    enum: MEDIA_QUALITY_STATUSES,
    required: true,
    default: 'unchecked',
  })
  qualityStatus!: MediaQualityStatus;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  qualityHints?: MediaQualityHints;

  @Prop({ type: String, trim: true })
  operatorNote?: string;

  @Prop({ type: String, trim: true })
  description?: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  metadata?: MediaEvidenceMetadata;

  @Prop({ type: Date, default: null })
  lockedAt?: Date | null;

  @Prop({ type: Date, default: null })
  voidedAt?: Date | null;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type MediaEvidenceDocument = HydratedDocument<MediaEvidence> & {
  _id: Types.ObjectId;
};

export const MediaEvidenceSchema = SchemaFactory.createForClass(MediaEvidence);

MediaEvidenceSchema.index({ evidenceCode: 1 }, { unique: true });
MediaEvidenceSchema.index({ itemResponseId: 1, evidenceType: 1, status: 1 });
MediaEvidenceSchema.index({
  scaleInstanceId: 1,
  itemCode: 1,
  evidenceType: 1,
});
MediaEvidenceSchema.index({ assessmentVisitId: 1, createdAt: -1 });
MediaEvidenceSchema.index({ patientId: 1, createdAt: -1 });
MediaEvidenceSchema.index({ status: 1, updatedAt: -1 });
MediaEvidenceSchema.index({ 'storage.objectKey': 1 }, { sparse: true });
MediaEvidenceSchema.index({ scaleCode: 1, itemCode: 1, evidenceType: 1 });
