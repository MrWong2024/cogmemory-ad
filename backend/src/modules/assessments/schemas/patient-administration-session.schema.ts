import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import {
  PATIENT_ADMINISTRATION_CAPTURED_BY_VALUES,
  PATIENT_ADMINISTRATION_CONTROL_EVENT_ACTIONS,
  PATIENT_ADMINISTRATION_IMPACT_FACTOR_CODES,
  PATIENT_ADMINISTRATION_OPEN_STATUSES,
  PATIENT_ADMINISTRATION_STATUSES,
} from '../patient-administration.constants';
import type {
  PatientAdministrationCapturedBy,
  PatientAdministrationControlEventAction,
  PatientAdministrationImpactFactorCode,
  PatientAdministrationStatus,
} from '../patient-administration.constants';
import {
  AssessmentOperatorSnapshot,
  AssessmentOperatorSnapshotSchema,
} from './assessment-visit.schema';
import { ScaleInstance } from './scale-instance.schema';

@Schema({ _id: false })
export class PatientAdministrationControlEvent {
  @Prop({
    type: String,
    enum: PATIENT_ADMINISTRATION_CONTROL_EVENT_ACTIONS,
    required: true,
  })
  action!: PatientAdministrationControlEventAction;

  @Prop({ type: Date, required: true })
  occurredAt!: Date;

  @Prop({ type: AssessmentOperatorSnapshotSchema })
  operatorSnapshot?: AssessmentOperatorSnapshot;

  @Prop({ type: String, trim: true, maxlength: 500 })
  reason?: string;
}

export const PatientAdministrationControlEventSchema =
  SchemaFactory.createForClass(PatientAdministrationControlEvent);

const positiveSafeIntegerValidator = {
  validator: (value: number) => Number.isSafeInteger(value) && value > 0,
  message: 'value must be a positive safe integer',
};

const nonNegativeSafeIntegerValidator = {
  validator: (value: number) => Number.isSafeInteger(value) && value >= 0,
  message: 'value must be a non-negative safe integer',
};

@Schema({ _id: false })
export class PatientAdministrationStepCapture {
  @Prop({ type: String, required: true, trim: true, minlength: 1 })
  stepKey!: string;

  @Prop({
    type: Number,
    required: true,
    min: 1,
    validate: positiveSafeIntegerValidator,
  })
  stepRun!: number;

  @Prop({
    type: String,
    enum: PATIENT_ADMINISTRATION_CAPTURED_BY_VALUES,
    required: true,
  })
  capturedBy!: PatientAdministrationCapturedBy;

  @Prop({ type: String, trim: true, maxlength: 2000 })
  staffObservation?: string;

  @Prop({ type: AssessmentOperatorSnapshotSchema })
  operatorSnapshot?: AssessmentOperatorSnapshot;

  @Prop({ type: Date, required: true })
  capturedAt!: Date;

  @Prop({ type: Date })
  invalidatedAt?: Date;

  @Prop({ type: String, trim: true, maxlength: 500 })
  invalidatedReason?: string;
}

export const PatientAdministrationStepCaptureSchema =
  SchemaFactory.createForClass(PatientAdministrationStepCapture);

@Schema({ _id: false })
export class PatientAdministrationTechnicalReplayAuthorization {
  @Prop({ type: Date, required: true })
  authorizedAt!: Date;

  @Prop({ type: AssessmentOperatorSnapshotSchema, required: true })
  authorizedBy!: AssessmentOperatorSnapshot;

  @Prop({
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 500,
  })
  reason!: string;
}

export const PatientAdministrationTechnicalReplayAuthorizationSchema =
  SchemaFactory.createForClass(
    PatientAdministrationTechnicalReplayAuthorization,
  );

@Schema({ _id: false })
export class PatientAdministrationPlaybackFact {
  @Prop({ type: String, required: true, trim: true, minlength: 1 })
  stepKey!: string;

  @Prop({
    type: Number,
    required: true,
    min: 1,
    validate: positiveSafeIntegerValidator,
  })
  stepRun!: number;

  @Prop({ type: String, required: true, trim: true, minlength: 1 })
  assetKey!: string;

  @Prop({
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: nonNegativeSafeIntegerValidator,
  })
  playCount!: number;

  @Prop({
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: nonNegativeSafeIntegerValidator,
  })
  remainingAuthorizedReplays!: number;

  @Prop({ type: Date })
  lastPlayedAt?: Date;

  @Prop({
    type: [PatientAdministrationTechnicalReplayAuthorizationSchema],
    default: [],
  })
  technicalReplayAuthorizations!: PatientAdministrationTechnicalReplayAuthorization[];
}

export const PatientAdministrationPlaybackFactSchema =
  SchemaFactory.createForClass(PatientAdministrationPlaybackFact);

@Schema({
  timestamps: true,
  collection: 'patient_administration_sessions',
})
export class PatientAdministrationSession {
  @Prop({ type: SchemaTypes.ObjectId, ref: ScaleInstance.name, required: true })
  scaleInstanceId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: PATIENT_ADMINISTRATION_STATUSES,
    required: true,
  })
  status!: PatientAdministrationStatus;

  @Prop({ type: String, required: true, trim: true })
  currentStepKey!: string;

  @Prop({
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: (value: number) => Number.isSafeInteger(value),
      message: 'revision must be a safe integer',
    },
  })
  revision!: number;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: String, select: false })
  entryCodeHash?: string;

  @Prop({ type: Date })
  entryCodeExpiresAt?: Date;

  @Prop({ type: String, select: false })
  sessionTokenHash?: string;

  @Prop({ type: Date })
  preparationConfirmedAt?: Date;

  @Prop({ type: AssessmentOperatorSnapshotSchema })
  preparationConfirmedBy?: AssessmentOperatorSnapshot;

  @Prop({
    type: [{ type: String, enum: PATIENT_ADMINISTRATION_IMPACT_FACTOR_CODES }],
    default: [],
  })
  impactFactorCodes!: PatientAdministrationImpactFactorCode[];

  @Prop({ type: String, trim: true, maxlength: 500 })
  impactFactorNote?: string;

  @Prop({ type: AssessmentOperatorSnapshotSchema, required: true })
  createdBy!: AssessmentOperatorSnapshot;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  pausedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date })
  terminatedAt?: Date;

  @Prop({ type: Date })
  expiredAt?: Date;

  @Prop({ type: [PatientAdministrationControlEventSchema], default: [] })
  controlEvents!: PatientAdministrationControlEvent[];

  @Prop({ type: [PatientAdministrationStepCaptureSchema], default: [] })
  stepCaptures!: PatientAdministrationStepCapture[];

  @Prop({ type: [PatientAdministrationPlaybackFactSchema], default: [] })
  playbackFacts!: PatientAdministrationPlaybackFact[];
}

export type PatientAdministrationSessionDocument =
  HydratedDocument<PatientAdministrationSession> & {
    _id: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
  };

export const PatientAdministrationSessionSchema = SchemaFactory.createForClass(
  PatientAdministrationSession,
);

PatientAdministrationSessionSchema.index(
  { scaleInstanceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: PATIENT_ADMINISTRATION_OPEN_STATUSES },
    },
  },
);
PatientAdministrationSessionSchema.index(
  { entryCodeHash: 1 },
  { unique: true, sparse: true },
);
PatientAdministrationSessionSchema.index(
  { sessionTokenHash: 1 },
  { unique: true, sparse: true },
);
