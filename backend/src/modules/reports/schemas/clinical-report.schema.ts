// backend/src/modules/reports/schemas/clinical-report.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { AssessmentVisit } from '../../assessments/schemas/assessment-visit.schema';
import { ItemResponse } from '../../assessments/schemas/item-response.schema';
import { ScaleInstance } from '../../assessments/schemas/scale-instance.schema';
import { CognitiveDomainResult } from '../../cognitive-domains/schemas/cognitive-domain-result.schema';
import { MediaEvidence } from '../../media/schemas/media-evidence.schema';
import { Patient } from '../../patients/schemas/patient.schema';
import { ScoreResult } from '../../scoring/schemas/score-result.schema';

export const CLINICAL_REPORT_TYPES = [
  'cognitive_assessment',
  'follow_up',
  'research_summary',
  'other',
] as const;
export type ClinicalReportType = (typeof CLINICAL_REPORT_TYPES)[number];

export const CLINICAL_REPORT_STATUSES = [
  'draft',
  'pending_confirmation',
  'confirmed',
  'archived',
  'corrected',
  'voided',
] as const;
export type ClinicalReportStatus = (typeof CLINICAL_REPORT_STATUSES)[number];

export const CLINICAL_REPORT_SOURCES = [
  'manual',
  'system_draft',
  'ai_draft',
  'imported',
  'mixed',
] as const;
export type ClinicalReportSource = (typeof CLINICAL_REPORT_SOURCES)[number];

export const REPORT_PATIENT_SEXES = [
  'male',
  'female',
  'other',
  'unknown',
] as const;
export type ReportPatientSex = (typeof REPORT_PATIENT_SEXES)[number];

export const REPORT_VISIT_TYPES = [
  'baseline',
  'follow_up',
  'screening',
  'unscheduled',
  'other',
] as const;
export type ReportVisitType = (typeof REPORT_VISIT_TYPES)[number];

export const REPORT_OPERATOR_ROLES = [
  'doctor',
  'nurse',
  'research_assistant',
  'admin',
  'unknown',
] as const;
export type ReportOperatorRole = (typeof REPORT_OPERATOR_ROLES)[number];

export const REPORT_SCORE_STATUSES = [
  'draft',
  'computed',
  'not_scored',
  'auto_scored',
  'manual_scored',
  'needs_review',
  'confirmed',
  'locked',
  'voided',
] as const;
export type ReportScoreStatus = (typeof REPORT_SCORE_STATUSES)[number];

export const REPORT_QUALITY_STATUSES = [
  'unchecked',
  'passed',
  'needs_review',
  'failed',
] as const;
export type ReportQualityStatus = (typeof REPORT_QUALITY_STATUSES)[number];

export const REPORT_EVIDENCE_TYPES = [
  'photo',
  'handwriting',
  'document_scan',
  'audio',
  'raw_text_snapshot',
  'duration',
  'operator_note',
  'other',
] as const;
export type ReportEvidenceType = (typeof REPORT_EVIDENCE_TYPES)[number];

export const REPORT_CAPTURE_MODES = [
  'photo_upload',
  'tablet_handwriting',
  'paper_scan',
  'system_generated',
  'imported',
  'other',
] as const;
export type ReportCaptureMode = (typeof REPORT_CAPTURE_MODES)[number];

export const REPORT_AI_DRAFT_STATUSES = [
  'not_requested',
  'generated',
  'reviewed',
  'discarded',
] as const;
export type ReportAiDraftStatus = (typeof REPORT_AI_DRAFT_STATUSES)[number];

export const REPORT_CONFIRMATION_ROLES = [
  'doctor',
  'admin',
  'unknown',
] as const;
export type ReportConfirmationRole = (typeof REPORT_CONFIRMATION_ROLES)[number];

export type ReportClinicalContext = Record<string, unknown> | null;
export type ReportScoreDetails = Record<string, unknown> | null;
export type ClinicalReportQualityHints = Record<string, unknown> | null;
export type ClinicalReportMetadata = Record<string, unknown> | null;

@Schema({ _id: false })
export class ReportPatientSnapshot {
  @Prop({ type: String, trim: true })
  subjectCode?: string;

  @Prop({ type: String, trim: true })
  displayName?: string;

  @Prop({ type: String, enum: REPORT_PATIENT_SEXES })
  sex?: ReportPatientSex;

  @Prop({ type: Date, default: null })
  birthDate?: Date | null;

  @Prop({ type: Number, default: null })
  educationYears?: number | null;
}

export const ReportPatientSnapshotSchema = SchemaFactory.createForClass(
  ReportPatientSnapshot,
);

@Schema({ _id: false })
export class ReportVisitSnapshot {
  @Prop({ type: String, trim: true, uppercase: true })
  visitCode?: string;

  @Prop({ type: String, enum: REPORT_VISIT_TYPES })
  visitType?: ReportVisitType;

  @Prop({ type: Date, default: null })
  assessmentDate?: Date | null;

  @Prop({ type: String, trim: true })
  operatorName?: string;

  @Prop({ type: String, enum: REPORT_OPERATOR_ROLES })
  operatorRole?: ReportOperatorRole;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  clinicalContext?: ReportClinicalContext;
}

export const ReportVisitSnapshotSchema =
  SchemaFactory.createForClass(ReportVisitSnapshot);

@Schema({ _id: false })
export class ReportScaleTraceSnapshot {
  @Prop({ type: SchemaTypes.ObjectId, ref: ScaleInstance.name, default: null })
  scaleInstanceId?: Types.ObjectId | null;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  scaleCode!: string;

  @Prop({ type: String, trim: true })
  scaleVersion?: string;

  @Prop({ type: String, trim: true })
  crfVersion?: string;

  @Prop({ type: String, trim: true })
  scoringRuleVersion?: string;

  @Prop({ type: String, trim: true })
  fieldEncodingVersion?: string;

  @Prop({ type: String, trim: true })
  domainMappingVersion?: string;

  @Prop({ type: String, trim: true })
  sourceDocument?: string;
}

export const ReportScaleTraceSnapshotSchema = SchemaFactory.createForClass(
  ReportScaleTraceSnapshot,
);

@Schema({ _id: false })
export class ReportScoreSnapshot {
  @Prop({ type: SchemaTypes.ObjectId, ref: ScoreResult.name, default: null })
  scoreResultId?: Types.ObjectId | null;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  scaleCode!: string;

  @Prop({ type: String, trim: true })
  scaleName?: string;

  @Prop({ type: String, trim: true })
  scaleVersion?: string;

  @Prop({ type: Number, default: null })
  totalScoreValue?: number | null;

  @Prop({ type: Number, default: null })
  totalMaxScore?: number | null;

  @Prop({ type: Number, default: null })
  totalMinScore?: number | null;

  @Prop({ type: Number, default: null })
  scorePercent?: number | null;

  @Prop({ type: String, enum: REPORT_SCORE_STATUSES })
  scoreStatus?: ReportScoreStatus;

  @Prop({ type: String, enum: REPORT_QUALITY_STATUSES })
  qualityStatus?: ReportQualityStatus;

  @Prop({ type: String, trim: true })
  summary?: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  scoreDetails?: ReportScoreDetails;
}

export const ReportScoreSnapshotSchema =
  SchemaFactory.createForClass(ReportScoreSnapshot);

@Schema({ _id: false })
export class ReportDomainSnapshot {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: CognitiveDomainResult.name,
    default: null,
  })
  cognitiveDomainResultId?: Types.ObjectId | null;

  @Prop({ type: String, trim: true, lowercase: true })
  scaleCode?: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  domainCode!: string;

  @Prop({ type: String, trim: true })
  domainTitle?: string;

  @Prop({ type: Number, default: null })
  scoreValue?: number | null;

  @Prop({ type: Number, default: null })
  maxScore?: number | null;

  @Prop({ type: Number, default: null })
  scorePercent?: number | null;

  @Prop({ type: Number, default: null })
  weightedScore?: number | null;

  @Prop({ type: Number, default: null })
  weightedMaxScore?: number | null;

  @Prop({ type: Number, default: null })
  itemCount?: number | null;

  @Prop({ type: Number, default: null })
  needsReviewItemCount?: number | null;

  @Prop({ type: String, trim: true })
  summary?: string;
}

export const ReportDomainSnapshotSchema =
  SchemaFactory.createForClass(ReportDomainSnapshot);

@Schema({ _id: false })
export class ReportEvidenceSnapshot {
  @Prop({ type: SchemaTypes.ObjectId, ref: MediaEvidence.name, default: null })
  mediaEvidenceId?: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: ItemResponse.name, default: null })
  itemResponseId?: Types.ObjectId | null;

  @Prop({ type: String, trim: true, lowercase: true })
  scaleCode?: string;

  @Prop({ type: String, trim: true, lowercase: true })
  itemCode?: string;

  @Prop({ type: String, trim: true })
  itemTitle?: string;

  @Prop({ type: String, enum: REPORT_EVIDENCE_TYPES })
  evidenceType?: ReportEvidenceType;

  @Prop({ type: String, enum: REPORT_CAPTURE_MODES })
  captureMode?: ReportCaptureMode;

  @Prop({ type: String, trim: true })
  storageObjectKey?: string;

  @Prop({ type: String, enum: REPORT_QUALITY_STATUSES })
  qualityStatus?: ReportQualityStatus;

  @Prop({ type: String, trim: true })
  summary?: string;
}

export const ReportEvidenceSnapshotSchema = SchemaFactory.createForClass(
  ReportEvidenceSnapshot,
);

@Schema({ _id: false })
export class ReportNarrativeSnapshot {
  @Prop({ type: String, trim: true })
  chiefSummary?: string;

  @Prop({ type: String, trim: true })
  scoreSummary?: string;

  @Prop({ type: String, trim: true })
  domainSummary?: string;

  @Prop({ type: String, trim: true })
  evidenceSummary?: string;

  @Prop({ type: String, trim: true })
  trendSummary?: string;

  @Prop({ type: String, trim: true })
  recommendationText?: string;

  @Prop({ type: String, trim: true })
  doctorOpinion?: string;

  @Prop({ type: String, trim: true })
  limitations?: string;
}

export const ReportNarrativeSnapshotSchema = SchemaFactory.createForClass(
  ReportNarrativeSnapshot,
);

@Schema({ _id: false })
export class ReportAiDraftSnapshot {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'AiAnalysisResult',
    default: null,
  })
  aiAnalysisResultId?: Types.ObjectId | null;

  @Prop({ type: String, trim: true })
  provider?: string;

  @Prop({ type: String, trim: true })
  model?: string;

  @Prop({ type: Date, default: null })
  generatedAt?: Date | null;

  @Prop({ type: String, trim: true })
  draftText?: string;

  @Prop({
    type: String,
    enum: REPORT_AI_DRAFT_STATUSES,
    default: 'not_requested',
  })
  status!: ReportAiDraftStatus;

  @Prop({ type: Boolean, default: false })
  doctorEdited!: boolean;

  @Prop({ type: String, trim: true })
  note?: string;
}

export const ReportAiDraftSnapshotSchema = SchemaFactory.createForClass(
  ReportAiDraftSnapshot,
);

@Schema({ _id: false })
export class ReportConfirmationSnapshot {
  @Prop({ type: Date, default: null })
  confirmedAt?: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  confirmedBy?: Types.ObjectId | null;

  @Prop({ type: String, trim: true })
  confirmedByName?: string;

  @Prop({ type: String, enum: REPORT_CONFIRMATION_ROLES })
  confirmedByRole?: ReportConfirmationRole;

  @Prop({ type: String, trim: true })
  confirmationNote?: string;

  @Prop({ type: String, trim: true })
  signatureText?: string;
}

export const ReportConfirmationSnapshotSchema = SchemaFactory.createForClass(
  ReportConfirmationSnapshot,
);

@Schema({ _id: false })
export class ReportCorrectionRecord {
  @Prop({ type: Number, required: true })
  correctionNo!: number;

  @Prop({ type: Date, default: null })
  correctedAt?: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  correctedBy?: Types.ObjectId | null;

  @Prop({ type: String, trim: true })
  correctedByName?: string;

  @Prop({ type: String, trim: true })
  reason?: string;

  @Prop({ type: String, trim: true })
  changeSummary?: string;

  @Prop({ type: String, trim: true, uppercase: true })
  previousReportCode?: string;

  @Prop({ type: String, trim: true, uppercase: true })
  replacementReportCode?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'AuditLog', default: null })
  auditLogId?: Types.ObjectId | null;
}

export const ReportCorrectionRecordSchema = SchemaFactory.createForClass(
  ReportCorrectionRecord,
);

@Schema({ timestamps: true, collection: 'clinical_reports' })
export class ClinicalReport {
  @Prop({ type: SchemaTypes.ObjectId, ref: Patient.name, required: true })
  patientId!: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: AssessmentVisit.name,
    required: true,
  })
  assessmentVisitId!: Types.ObjectId;

  @Prop({
    type: [{ type: SchemaTypes.ObjectId, ref: ScaleInstance.name }],
    default: [],
  })
  primaryScaleInstanceIds!: Types.ObjectId[];

  @Prop({
    type: [{ type: SchemaTypes.ObjectId, ref: ScoreResult.name }],
    default: [],
  })
  scoreResultIds!: Types.ObjectId[];

  @Prop({
    type: [{ type: SchemaTypes.ObjectId, ref: CognitiveDomainResult.name }],
    default: [],
  })
  cognitiveDomainResultIds!: Types.ObjectId[];

  @Prop({
    type: [{ type: SchemaTypes.ObjectId, ref: MediaEvidence.name }],
    default: [],
  })
  mediaEvidenceIds!: Types.ObjectId[];

  @Prop({ type: String, required: true, trim: true, uppercase: true })
  subjectCode!: string;

  @Prop({ type: String, required: true, trim: true, uppercase: true })
  reportCode!: string;

  @Prop({ type: String, trim: true })
  reportNo?: string;

  @Prop({
    type: String,
    enum: CLINICAL_REPORT_TYPES,
    required: true,
    default: 'cognitive_assessment',
  })
  reportType!: ClinicalReportType;

  @Prop({
    type: String,
    enum: CLINICAL_REPORT_STATUSES,
    required: true,
    default: 'draft',
  })
  status!: ClinicalReportStatus;

  @Prop({ type: Number, required: true, default: 1 })
  reportVersion!: number;

  @Prop({
    type: String,
    enum: CLINICAL_REPORT_SOURCES,
    required: true,
    default: 'manual',
  })
  source!: ClinicalReportSource;

  @Prop({ type: ReportPatientSnapshotSchema, default: null })
  patientSnapshot?: ReportPatientSnapshot | null;

  @Prop({ type: ReportVisitSnapshotSchema, default: null })
  visitSnapshot?: ReportVisitSnapshot | null;

  @Prop({ type: [ReportScaleTraceSnapshotSchema], default: [] })
  scaleTraces!: ReportScaleTraceSnapshot[];

  @Prop({ type: [ReportScoreSnapshotSchema], default: [] })
  scoreSnapshots!: ReportScoreSnapshot[];

  @Prop({ type: [ReportDomainSnapshotSchema], default: [] })
  domainSnapshots!: ReportDomainSnapshot[];

  @Prop({ type: [ReportEvidenceSnapshotSchema], default: [] })
  evidenceSnapshots!: ReportEvidenceSnapshot[];

  @Prop({ type: ReportNarrativeSnapshotSchema, default: null })
  narrative?: ReportNarrativeSnapshot | null;

  @Prop({ type: ReportAiDraftSnapshotSchema, default: null })
  aiDraft?: ReportAiDraftSnapshot | null;

  @Prop({ type: ReportConfirmationSnapshotSchema, default: null })
  confirmation?: ReportConfirmationSnapshot | null;

  @Prop({ type: Date, default: null })
  lockedAt?: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  lockedBy?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  archivedAt?: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  archivedBy?: Types.ObjectId | null;

  @Prop({ type: [ReportCorrectionRecordSchema], default: [] })
  correctionRecords!: ReportCorrectionRecord[];

  @Prop({ type: Date, default: null })
  voidedAt?: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  voidedBy?: Types.ObjectId | null;

  @Prop({ type: String, trim: true })
  voidReason?: string;

  @Prop({
    type: [{ type: SchemaTypes.ObjectId, ref: 'AuditLog' }],
    default: [],
  })
  auditLogRefs!: Types.ObjectId[];

  @Prop({
    type: String,
    enum: REPORT_QUALITY_STATUSES,
    required: true,
    default: 'unchecked',
  })
  qualityStatus!: ReportQualityStatus;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  qualityHints?: ClinicalReportQualityHints;

  @Prop({ type: String, trim: true })
  operatorNote?: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  metadata?: ClinicalReportMetadata;
}

export type ClinicalReportDocument = HydratedDocument<ClinicalReport> & {
  _id: Types.ObjectId;
};

export const ClinicalReportSchema =
  SchemaFactory.createForClass(ClinicalReport);

ClinicalReportSchema.index({ reportCode: 1 }, { unique: true });
ClinicalReportSchema.index({
  assessmentVisitId: 1,
  reportType: 1,
  reportVersion: -1,
});
ClinicalReportSchema.index({ patientId: 1, createdAt: -1 });
ClinicalReportSchema.index({ subjectCode: 1, createdAt: -1 });
ClinicalReportSchema.index({ status: 1, updatedAt: -1 });
ClinicalReportSchema.index({ reportType: 1, status: 1 });
ClinicalReportSchema.index({ 'scoreSnapshots.scaleCode': 1 });
ClinicalReportSchema.index({ 'domainSnapshots.domainCode': 1 });
ClinicalReportSchema.index({ qualityStatus: 1, updatedAt: -1 });
