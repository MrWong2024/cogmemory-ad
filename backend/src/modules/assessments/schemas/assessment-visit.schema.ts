// backend/src/modules/assessments/schemas/assessment-visit.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { Patient } from '../../patients/schemas/patient.schema';

export const ASSESSMENT_VISIT_TYPES = [
  'baseline',
  'follow_up',
  'screening',
  'unscheduled',
  'other',
] as const;
export type AssessmentVisitType = (typeof ASSESSMENT_VISIT_TYPES)[number];

export const ASSESSMENT_STATUSES = [
  'draft',
  'in_progress',
  'completed',
  'locked',
  'voided',
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const ASSESSMENT_OPERATOR_ROLES = [
  'doctor',
  'nurse',
  'research_assistant',
  'admin',
  'unknown',
] as const;
export type AssessmentOperatorRole = (typeof ASSESSMENT_OPERATOR_ROLES)[number];

export type AssessmentClinicalContext = Record<string, unknown> | null;
export type AssessmentVisitMetadata = Record<string, unknown> | null;

@Schema({ _id: false })
export class AssessmentOperatorSnapshot {
  @Prop({ type: SchemaTypes.ObjectId, default: null })
  operatorId?: Types.ObjectId | null;

  @Prop({ type: String, trim: true })
  operatorName?: string;

  @Prop({ type: String, enum: ASSESSMENT_OPERATOR_ROLES, trim: true })
  operatorRole?: AssessmentOperatorRole;
}

export const AssessmentOperatorSnapshotSchema = SchemaFactory.createForClass(
  AssessmentOperatorSnapshot,
);

@Schema({ timestamps: true, collection: 'assessment_visits' })
export class AssessmentVisit {
  @Prop({ type: SchemaTypes.ObjectId, ref: Patient.name, required: true })
  patientId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, uppercase: true })
  subjectCode!: string;

  @Prop({ type: String, required: true, trim: true, uppercase: true })
  visitCode!: string;

  @Prop({
    type: String,
    enum: ASSESSMENT_VISIT_TYPES,
    required: true,
    default: 'baseline',
  })
  visitType!: AssessmentVisitType;

  @Prop({
    type: String,
    enum: ASSESSMENT_STATUSES,
    required: true,
    default: 'draft',
  })
  status!: AssessmentStatus;

  @Prop({ type: Date, required: true })
  assessmentDate!: Date;

  @Prop({ type: Date, default: null })
  startedAt?: Date | null;

  @Prop({ type: Date, default: null })
  completedAt?: Date | null;

  @Prop({ type: Date, default: null })
  lockedAt?: Date | null;

  @Prop({ type: Date, default: null })
  voidedAt?: Date | null;

  @Prop({ type: AssessmentOperatorSnapshotSchema, default: null })
  operatorSnapshot?: AssessmentOperatorSnapshot | null;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  clinicalContext?: AssessmentClinicalContext;

  @Prop({ type: String, trim: true })
  notes?: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  metadata?: AssessmentVisitMetadata;
}

export type AssessmentVisitDocument = HydratedDocument<AssessmentVisit> & {
  _id: Types.ObjectId;
};

export const AssessmentVisitSchema =
  SchemaFactory.createForClass(AssessmentVisit);

AssessmentVisitSchema.index({ visitCode: 1 }, { unique: true });
AssessmentVisitSchema.index({ patientId: 1, assessmentDate: -1 });
AssessmentVisitSchema.index({ subjectCode: 1, assessmentDate: -1 });
AssessmentVisitSchema.index({ status: 1, assessmentDate: -1 });
