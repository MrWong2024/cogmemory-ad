// backend/src/modules/assessments/schemas/scale-instance.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { Patient } from '../../patients/schemas/patient.schema';
import { ScaleDefinition } from '../../scales/schemas/scale-definition.schema';
import { ScaleVersion } from '../../scales/schemas/scale-version.schema';
import {
  AssessmentOperatorSnapshot,
  AssessmentOperatorSnapshotSchema,
  ASSESSMENT_STATUSES,
} from './assessment-visit.schema';
import type { AssessmentStatus } from './assessment-visit.schema';
import { AssessmentVisit } from './assessment-visit.schema';

export const SCALE_ADMINISTRATION_MODES = [
  'clinician_administered',
  'supervised_patient_input',
  'paper_import',
] as const;
export type ScaleAdministrationMode =
  (typeof SCALE_ADMINISTRATION_MODES)[number];

export type ScaleInstanceProgress = Record<string, unknown> | null;
export type ScaleQualityControlSummary = Record<string, unknown> | null;
export type ScaleInstanceMetadata = Record<string, unknown> | null;

@Schema({ _id: false })
export class ScaleVersionTrace {
  @Prop({ type: String, trim: true })
  crfVersion?: string;

  @Prop({ type: String, trim: true })
  scoringRuleVersion?: string;

  @Prop({ type: String, trim: true })
  fieldEncodingVersion?: string;

  @Prop({ type: String, trim: true })
  sourceDocument?: string;
}

export const ScaleVersionTraceSchema =
  SchemaFactory.createForClass(ScaleVersionTrace);

@Schema({ timestamps: true, collection: 'scale_instances' })
export class ScaleInstance {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: AssessmentVisit.name,
    required: true,
  })
  assessmentVisitId!: Types.ObjectId;

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

  @Prop({ type: Number, default: 1 })
  instanceNo!: number;

  @Prop({
    type: String,
    enum: ASSESSMENT_STATUSES,
    required: true,
    default: 'draft',
  })
  status!: AssessmentStatus;

  @Prop({
    type: String,
    enum: SCALE_ADMINISTRATION_MODES,
    required: true,
    default: 'clinician_administered',
  })
  administrationMode!: ScaleAdministrationMode;

  @Prop({ type: ScaleVersionTraceSchema, default: null })
  versionTrace?: ScaleVersionTrace | null;

  @Prop({ type: Date, default: null })
  startedAt?: Date | null;

  @Prop({ type: Date, default: null })
  completedAt?: Date | null;

  @Prop({ type: Date, default: null })
  lockedAt?: Date | null;

  @Prop({ type: Date, default: null })
  voidedAt?: Date | null;

  @Prop({ type: Number, default: null })
  durationMs?: number | null;

  @Prop({ type: AssessmentOperatorSnapshotSchema, default: null })
  operatorSnapshot?: AssessmentOperatorSnapshot | null;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  progress?: ScaleInstanceProgress;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  qualityControlSummary?: ScaleQualityControlSummary;

  @Prop({ type: String, trim: true })
  notes?: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  metadata?: ScaleInstanceMetadata;
}

export type ScaleInstanceDocument = HydratedDocument<ScaleInstance> & {
  _id: Types.ObjectId;
};

export const ScaleInstanceSchema = SchemaFactory.createForClass(ScaleInstance);

ScaleInstanceSchema.index({ instanceCode: 1 }, { unique: true });
ScaleInstanceSchema.index(
  { assessmentVisitId: 1, scaleCode: 1, instanceNo: 1 },
  { unique: true },
);
ScaleInstanceSchema.index({ patientId: 1, scaleCode: 1, startedAt: -1 });
ScaleInstanceSchema.index({ status: 1, updatedAt: -1 });
ScaleInstanceSchema.index({ scaleCode: 1, scaleVersion: 1 });
