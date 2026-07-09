// backend/src/modules/patients/schemas/patient.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export const PATIENT_SOURCE_TYPES = ['clinical', 'research'] as const;
export type PatientSourceType = (typeof PATIENT_SOURCE_TYPES)[number];

export const PATIENT_SEXES = ['male', 'female', 'other', 'unknown'] as const;
export type PatientSex = (typeof PATIENT_SEXES)[number];

export const PATIENT_HANDEDNESSES = [
  'right',
  'left',
  'ambidextrous',
  'unknown',
] as const;
export type PatientHandedness = (typeof PATIENT_HANDEDNESSES)[number];

export const PATIENT_STATUSES = ['active', 'inactive', 'archived'] as const;
export type PatientStatus = (typeof PATIENT_STATUSES)[number];

export type PatientExternalRefs = Record<string, unknown> | null;
export type PatientMetadata = Record<string, unknown> | null;

@Schema({ timestamps: true, collection: 'patients' })
export class Patient {
  @Prop({
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  })
  subjectCode!: string;

  @Prop({ type: String, trim: true })
  displayName?: string;

  @Prop({
    type: String,
    enum: PATIENT_SOURCE_TYPES,
    required: true,
    default: 'clinical',
  })
  sourceType!: PatientSourceType;

  @Prop({
    type: String,
    enum: PATIENT_SEXES,
    required: true,
    default: 'unknown',
  })
  sex!: PatientSex;

  @Prop({ type: Date, default: null })
  birthDate?: Date | null;

  @Prop({ type: Number, default: null })
  educationYears?: number | null;

  @Prop({
    type: String,
    enum: PATIENT_HANDEDNESSES,
    required: true,
    default: 'unknown',
  })
  handedness!: PatientHandedness;

  @Prop({
    type: String,
    enum: PATIENT_STATUSES,
    required: true,
    default: 'active',
  })
  status!: PatientStatus;

  @Prop({ type: [{ type: String, trim: true }], default: [] })
  tags!: string[];

  @Prop({ type: String, trim: true })
  notes?: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  externalRefs?: PatientExternalRefs;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  metadata?: PatientMetadata;
}

export type PatientDocument = HydratedDocument<Patient> & {
  _id: Types.ObjectId;
};

export const PatientSchema = SchemaFactory.createForClass(Patient);

PatientSchema.index({ subjectCode: 1 }, { unique: true });
PatientSchema.index({ status: 1, subjectCode: 1 });
PatientSchema.index({ sourceType: 1, status: 1 });
