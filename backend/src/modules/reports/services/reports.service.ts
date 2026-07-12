// backend/src/modules/reports/services/reports.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ClinicalReport,
  ClinicalReportDocument,
  ClinicalReportMetadata,
  ClinicalReportQualityHints,
  ClinicalReportSource,
  ClinicalReportStatus,
  ClinicalReportType,
  CLINICAL_REPORT_STATUSES,
  ReportAiDraftSnapshot,
  ReportAiDraftStatus,
  ReportCaptureMode,
  ReportClinicalContext,
  ReportConfirmationRole,
  ReportConfirmationSnapshot,
  ReportCorrectionRecord,
  ReportDomainSnapshot,
  ReportEvidenceSnapshot,
  ReportEvidenceType,
  ReportNarrativeSnapshot,
  ReportOperatorRole,
  ReportPatientSex,
  ReportPatientSnapshot,
  ReportQualityStatus,
  ReportScaleTraceSnapshot,
  ReportScoreDetails,
  ReportScoreSnapshot,
  ReportScoreStatus,
  ReportVisitSnapshot,
  ReportVisitType,
} from '../schemas/clinical-report.schema';
import type { ClinicalReportConfirmationMetadata } from '../types/clinical-report-review.types';
import type { LockClinicalReportInput } from '../types/clinical-report-lock.types';

export type ReportPatientSnapshotSummary = {
  subjectCode?: string;
  displayName?: string;
  sex?: ReportPatientSex;
  birthDate: Date | null;
  educationYears: number | null;
};

export type ReportVisitSnapshotSummary = {
  visitCode?: string;
  visitType?: ReportVisitType;
  assessmentDate: Date | null;
  operatorName?: string;
  operatorRole?: ReportOperatorRole;
  clinicalContext: ReportClinicalContext;
};

export type ReportScaleTraceSummary = {
  scaleInstanceId: string | null;
  scaleCode: string;
  scaleVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  domainMappingVersion?: string;
  sourceDocument?: string;
};

export type ReportScoreSnapshotSummary = {
  scoreResultId: string | null;
  scaleCode: string;
  scaleName?: string;
  scaleVersion?: string;
  totalScoreValue: number | null;
  totalMaxScore: number | null;
  totalMinScore: number | null;
  scorePercent: number | null;
  scoreStatus?: ReportScoreStatus;
  qualityStatus?: ReportQualityStatus;
  summary?: string;
  scoreDetails: ReportScoreDetails;
};

export type ReportDomainSnapshotSummary = {
  cognitiveDomainResultId: string | null;
  scaleCode?: string;
  domainCode: string;
  domainTitle?: string;
  scoreValue: number | null;
  maxScore: number | null;
  scorePercent: number | null;
  weightedScore: number | null;
  weightedMaxScore: number | null;
  itemCount: number | null;
  needsReviewItemCount: number | null;
  summary?: string;
};

export type ReportEvidenceSnapshotSummary = {
  mediaEvidenceId: string | null;
  itemResponseId: string | null;
  scaleCode?: string;
  itemCode?: string;
  itemTitle?: string;
  evidenceType?: ReportEvidenceType;
  captureMode?: ReportCaptureMode;
  storageObjectKey?: string;
  qualityStatus?: ReportQualityStatus;
  summary?: string;
};

export type ReportNarrativeSummary = {
  chiefSummary?: string;
  scoreSummary?: string;
  domainSummary?: string;
  evidenceSummary?: string;
  trendSummary?: string;
  recommendationText?: string;
  doctorOpinion?: string;
  limitations?: string;
};

export type ReportAiDraftSummary = {
  aiAnalysisResultId: string | null;
  provider?: string;
  model?: string;
  generatedAt: Date | null;
  draftText?: string;
  status: ReportAiDraftStatus;
  doctorEdited: boolean;
  note?: string;
};

export type ReportConfirmationSummary = {
  confirmedAt: Date | null;
  confirmedBy: string | null;
  confirmedByName?: string;
  confirmedByRole?: ReportConfirmationRole;
  confirmationNote?: string;
  signatureText?: string;
};

export type ReportCorrectionSummary = {
  correctionNo: number;
  correctedAt: Date | null;
  correctedBy: string | null;
  correctedByName?: string;
  reason?: string;
  changeSummary?: string;
  previousReportCode?: string;
  replacementReportCode?: string;
  auditLogId: string | null;
};

export type ClinicalReportSummary = {
  id: string;
  patientId: string;
  assessmentVisitId: string;
  primaryScaleInstanceIds: string[];
  scoreResultIds: string[];
  cognitiveDomainResultIds: string[];
  mediaEvidenceIds: string[];
  subjectCode: string;
  reportCode: string;
  reportNo?: string;
  reportType: ClinicalReportType;
  status: ClinicalReportStatus;
  reportVersion: number;
  source: ClinicalReportSource;
  patientSnapshot: ReportPatientSnapshotSummary | null;
  visitSnapshot: ReportVisitSnapshotSummary | null;
  scaleTraces: ReportScaleTraceSummary[];
  scoreSnapshots: ReportScoreSnapshotSummary[];
  domainSnapshots: ReportDomainSnapshotSummary[];
  evidenceSnapshots: ReportEvidenceSnapshotSummary[];
  narrative: ReportNarrativeSummary | null;
  aiDraft: ReportAiDraftSummary | null;
  confirmation: ReportConfirmationSummary | null;
  lockedAt: Date | null;
  lockedBy: string | null;
  archivedAt: Date | null;
  archivedBy: string | null;
  correctionRecords: ReportCorrectionSummary[];
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason?: string;
  auditLogRefs: string[];
  qualityStatus: ReportQualityStatus;
  qualityHints: ClinicalReportQualityHints;
  operatorNote?: string;
  metadata: ClinicalReportMetadata;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type ClinicalReportGenerationMetadata = {
  version: 1;
  generationId: string;
  generatedAt: Date;
  generatedBy: string;
  generatedByName: string;
  generatedByRole: ReportOperatorRole;
  engineVersion: string;
  reportScope: string;
  primaryScaleInstanceIds: string[];
  scoreResultIds: string[];
  cognitiveDomainResultIds: string[];
  mediaEvidenceCount: number;
  aiUsed: false;
};

export type CreateClinicalReportInput = {
  patientId: string;
  assessmentVisitId: string;
  primaryScaleInstanceIds: string[];
  scoreResultIds: string[];
  cognitiveDomainResultIds: string[];
  mediaEvidenceIds: string[];
  subjectCode: string;
  reportCode: string;
  reportType: Extract<ClinicalReportType, 'cognitive_assessment'>;
  status: Extract<ClinicalReportStatus, 'draft'>;
  reportVersion: 1;
  source: Extract<ClinicalReportSource, 'system_draft'>;
  patientSnapshot: ReportPatientSnapshotSummary;
  visitSnapshot: ReportVisitSnapshotSummary;
  scaleTraces: ReportScaleTraceSummary[];
  scoreSnapshots: ReportScoreSnapshotSummary[];
  domainSnapshots: ReportDomainSnapshotSummary[];
  evidenceSnapshots: ReportEvidenceSnapshotSummary[];
  narrative: ReportNarrativeSummary;
  aiDraft: Pick<ReportAiDraftSummary, 'status' | 'doctorEdited'>;
  confirmation: null;
  lockedAt: null;
  archivedAt: null;
  correctionRecords: [];
  voidedAt: null;
  auditLogRefs: [];
  qualityStatus: Extract<ReportQualityStatus, 'unchecked' | 'needs_review'>;
  qualityHints: null;
  metadata: { a20Generation: ClinicalReportGenerationMetadata };
};

type ClinicalReportOwnershipInput = {
  reportId: string;
  patientId: string;
  assessmentVisitId: string;
};

export type UpdateClinicalReportDraftInput = ClinicalReportOwnershipInput & {
  expectedUpdatedAt: Date;
  narrative: ReportNarrativeSummary;
  metadata: Record<string, unknown>;
};

export type SubmitClinicalReportInput = ClinicalReportOwnershipInput & {
  expectedUpdatedAt: Date;
  metadata: Record<string, unknown>;
};

export type ConfirmClinicalReportInput = ClinicalReportOwnershipInput & {
  expectedUpdatedAt: Date;
  confirmation: ClinicalReportConfirmationMetadata;
  metadata: Record<string, unknown>;
};

const REPORT_STATUS_TRANSITIONS = {
  draft: ['pending_confirmation', 'voided'],
  pending_confirmation: ['draft', 'confirmed', 'voided'],
  confirmed: ['archived', 'corrected', 'voided'],
  archived: ['corrected'],
  corrected: [],
  voided: [],
} satisfies Record<ClinicalReportStatus, readonly ClinicalReportStatus[]>;

const CLINICAL_REPORT_STATUS_SET = new Set<string>(CLINICAL_REPORT_STATUSES);
const CONFIRMED_REPORT_STATUSES: ClinicalReportStatus[] = [
  'confirmed',
  'archived',
  'corrected',
];

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(ClinicalReport.name)
    private readonly clinicalReportModel: Model<ClinicalReportDocument>,
  ) {}

  normalizeReportCode(reportCode: string): string {
    return reportCode.trim().toUpperCase();
  }

  async findReportByCode(
    reportCode: string,
  ): Promise<ClinicalReportSummary | null> {
    const normalizedCode = this.normalizeReportCode(reportCode);

    if (!normalizedCode) {
      return null;
    }

    const report = await this.clinicalReportModel
      .findOne({ reportCode: normalizedCode })
      .exec();

    if (!report) {
      return null;
    }

    return this.mapReport(report);
  }

  async findLatestReportByVisitId(
    assessmentVisitId: Types.ObjectId | string,
  ): Promise<ClinicalReportSummary | null> {
    const normalizedId = this.normalizeObjectId(assessmentVisitId);

    if (!normalizedId) {
      return null;
    }

    const report = await this.clinicalReportModel
      .findOne({ assessmentVisitId: normalizedId })
      .sort({ reportVersion: -1, createdAt: -1 })
      .exec();

    if (!report) {
      return null;
    }

    return this.mapReport(report);
  }

  async findReportByVisitTypeVersion(
    assessmentVisitId: Types.ObjectId | string,
    reportType: ClinicalReportType,
    reportVersion: number,
  ): Promise<ClinicalReportSummary | null> {
    const normalizedId = this.normalizeObjectId(assessmentVisitId);
    if (
      !normalizedId ||
      !Number.isInteger(reportVersion) ||
      reportVersion < 1
    ) {
      return null;
    }
    const report = await this.clinicalReportModel
      .findOne({
        assessmentVisitId: normalizedId,
        reportType,
        reportVersion,
      })
      .sort({ createdAt: -1 })
      .exec();
    return report ? this.mapReport(report) : null;
  }

  async findReportByOwnership(
    input: ClinicalReportOwnershipInput,
  ): Promise<ClinicalReportSummary | null> {
    const ownership = this.normalizeClinicalReportOwnership(input);
    if (!ownership) {
      return null;
    }
    const report = await this.clinicalReportModel
      .findOne({
        ...ownership,
        reportType: 'cognitive_assessment',
        reportVersion: 1,
      })
      .exec();
    return report ? this.mapReport(report) : null;
  }

  async updateDraftNarrativeIfUnmodified(
    input: UpdateClinicalReportDraftInput,
  ): Promise<ClinicalReportSummary | null> {
    const ownership = this.normalizeClinicalReportOwnership(input);
    if (!ownership || !Number.isFinite(input.expectedUpdatedAt.getTime())) {
      return null;
    }
    const updated = await this.clinicalReportModel
      .findOneAndUpdate(
        {
          ...ownership,
          reportType: 'cognitive_assessment',
          reportVersion: 1,
          status: 'draft',
          updatedAt: input.expectedUpdatedAt,
        },
        {
          $set: {
            narrative: input.narrative,
            source: 'mixed',
            metadata: input.metadata,
          },
        },
        { new: true, runValidators: true },
      )
      .exec();
    return updated ? this.mapReport(updated) : null;
  }

  async submitForConfirmationIfUnmodified(
    input: SubmitClinicalReportInput,
  ): Promise<ClinicalReportSummary | null> {
    const ownership = this.normalizeClinicalReportOwnership(input);
    if (!ownership || !Number.isFinite(input.expectedUpdatedAt.getTime())) {
      return null;
    }
    const updated = await this.clinicalReportModel
      .findOneAndUpdate(
        {
          ...ownership,
          reportType: 'cognitive_assessment',
          reportVersion: 1,
          status: 'draft',
          updatedAt: input.expectedUpdatedAt,
        },
        { $set: { status: 'pending_confirmation', metadata: input.metadata } },
        { new: true, runValidators: true },
      )
      .exec();
    return updated ? this.mapReport(updated) : null;
  }

  async confirmReportIfUnmodified(
    input: ConfirmClinicalReportInput,
  ): Promise<ClinicalReportSummary | null> {
    const ownership = this.normalizeClinicalReportOwnership(input);
    if (!ownership || !Number.isFinite(input.expectedUpdatedAt.getTime())) {
      return null;
    }
    const updated = await this.clinicalReportModel
      .findOneAndUpdate(
        {
          ...ownership,
          reportType: 'cognitive_assessment',
          reportVersion: 1,
          status: 'pending_confirmation',
          updatedAt: input.expectedUpdatedAt,
        },
        {
          $set: {
            status: 'confirmed',
            confirmation: {
              confirmedAt: input.confirmation.confirmedAt,
              confirmedBy: new Types.ObjectId(input.confirmation.confirmedBy),
              confirmedByName: input.confirmation.confirmedByName,
              confirmedByRole: input.confirmation.confirmedByRole,
              confirmationNote: input.confirmation.confirmationNote,
            },
            qualityStatus: 'passed',
            metadata: input.metadata,
          },
        },
        { new: true, runValidators: true },
      )
      .exec();
    return updated ? this.mapReport(updated) : null;
  }

  async lockReportIfUnmodified(
    input: LockClinicalReportInput,
  ): Promise<ClinicalReportSummary | null> {
    const ownership = this.normalizeClinicalReportOwnership(input);
    if (
      !ownership ||
      !Number.isFinite(input.expectedUpdatedAt.getTime()) ||
      !Number.isFinite(input.lockedAt.getTime())
    ) {
      return null;
    }
    const lockedBy = this.normalizeObjectId(input.lockedBy);
    if (!lockedBy) {
      return null;
    }
    const updated = await this.clinicalReportModel
      .findOneAndUpdate(
        {
          ...ownership,
          reportType: 'cognitive_assessment',
          reportVersion: 1,
          status: 'confirmed',
          source: 'mixed',
          qualityStatus: 'passed',
          lockedAt: null,
          lockedBy: null,
          archivedAt: null,
          archivedBy: null,
          voidedAt: null,
          voidedBy: null,
          correctionRecords: { $size: 0 },
          updatedAt: input.expectedUpdatedAt,
        },
        {
          $set: {
            lockedAt: input.lockedAt,
            lockedBy,
            metadata: input.metadata,
          },
        },
        { new: true, runValidators: true },
      )
      .exec();
    return updated ? this.mapReport(updated) : null;
  }

  async createClinicalReport(
    input: CreateClinicalReportInput,
  ): Promise<ClinicalReportSummary> {
    const created = await this.clinicalReportModel.create({
      patientId: new Types.ObjectId(input.patientId),
      assessmentVisitId: new Types.ObjectId(input.assessmentVisitId),
      primaryScaleInstanceIds: this.toObjectIds(input.primaryScaleInstanceIds),
      scoreResultIds: this.toObjectIds(input.scoreResultIds),
      cognitiveDomainResultIds: this.toObjectIds(
        input.cognitiveDomainResultIds,
      ),
      mediaEvidenceIds: this.toObjectIds(input.mediaEvidenceIds),
      subjectCode: input.subjectCode,
      reportCode: input.reportCode,
      reportType: input.reportType,
      status: input.status,
      reportVersion: input.reportVersion,
      source: input.source,
      patientSnapshot: input.patientSnapshot,
      visitSnapshot: input.visitSnapshot,
      scaleTraces: input.scaleTraces.map((trace) => ({
        ...trace,
        scaleInstanceId: trace.scaleInstanceId
          ? new Types.ObjectId(trace.scaleInstanceId)
          : null,
      })),
      scoreSnapshots: input.scoreSnapshots.map((snapshot) => ({
        ...snapshot,
        scoreResultId: snapshot.scoreResultId
          ? new Types.ObjectId(snapshot.scoreResultId)
          : null,
      })),
      domainSnapshots: input.domainSnapshots.map((snapshot) => ({
        ...snapshot,
        cognitiveDomainResultId: snapshot.cognitiveDomainResultId
          ? new Types.ObjectId(snapshot.cognitiveDomainResultId)
          : null,
      })),
      evidenceSnapshots: input.evidenceSnapshots.map((snapshot) => ({
        ...snapshot,
        mediaEvidenceId: snapshot.mediaEvidenceId
          ? new Types.ObjectId(snapshot.mediaEvidenceId)
          : null,
        itemResponseId: snapshot.itemResponseId
          ? new Types.ObjectId(snapshot.itemResponseId)
          : null,
      })),
      narrative: input.narrative,
      aiDraft: input.aiDraft,
      confirmation: null,
      lockedAt: null,
      archivedAt: null,
      correctionRecords: [],
      voidedAt: null,
      auditLogRefs: [],
      qualityStatus: input.qualityStatus,
      qualityHints: null,
      metadata: input.metadata,
    });
    return this.mapReport(created);
  }

  async createVersionOneCognitiveAssessmentReport(
    input: CreateClinicalReportInput,
  ): Promise<ClinicalReportSummary> {
    return this.createClinicalReport(input);
  }

  isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }

  async listReportsByVisitId(
    assessmentVisitId: Types.ObjectId | string,
  ): Promise<ClinicalReportSummary[]> {
    const normalizedId = this.normalizeObjectId(assessmentVisitId);

    if (!normalizedId) {
      return [];
    }

    const reports = await this.clinicalReportModel
      .find({ assessmentVisitId: normalizedId })
      .sort({ reportVersion: 1, createdAt: 1 })
      .exec();

    return reports.map((report) => this.mapReport(report));
  }

  async listReportsByPatientId(
    patientId: Types.ObjectId | string,
  ): Promise<ClinicalReportSummary[]> {
    const normalizedId = this.normalizeObjectId(patientId);

    if (!normalizedId) {
      return [];
    }

    const reports = await this.clinicalReportModel
      .find({ patientId: normalizedId })
      .sort({ createdAt: -1 })
      .exec();

    return reports.map((report) => this.mapReport(report));
  }

  async listReportsByStatus(status: string): Promise<ClinicalReportSummary[]> {
    const normalizedStatus = this.normalizeReportStatus(status);

    if (!normalizedStatus) {
      return [];
    }

    const reports = await this.clinicalReportModel
      .find({ status: normalizedStatus })
      .sort({ updatedAt: -1 })
      .exec();

    return reports.map((report) => this.mapReport(report));
  }

  async listConfirmedReportsByPatientId(
    patientId: Types.ObjectId | string,
  ): Promise<ClinicalReportSummary[]> {
    const normalizedId = this.normalizeObjectId(patientId);

    if (!normalizedId) {
      return [];
    }

    const reports = await this.clinicalReportModel
      .find({
        patientId: normalizedId,
        status: { $in: CONFIRMED_REPORT_STATUSES },
      })
      .sort({ createdAt: -1 })
      .exec();

    return reports.map((report) => this.mapReport(report));
  }

  canTransitionReportStatus(
    from: ClinicalReportStatus,
    to: ClinicalReportStatus,
  ): boolean {
    return REPORT_STATUS_TRANSITIONS[from].some((status) => status === to);
  }

  getAllowedReportStatusTransitions(
    from: ClinicalReportStatus,
  ): ClinicalReportStatus[] {
    return [...REPORT_STATUS_TRANSITIONS[from]];
  }

  private normalizeObjectId(
    id: Types.ObjectId | string,
  ): Types.ObjectId | null {
    if (id instanceof Types.ObjectId) {
      return id;
    }

    const normalizedId = id.trim();

    if (!normalizedId || !Types.ObjectId.isValid(normalizedId)) {
      return null;
    }

    const objectId = new Types.ObjectId(normalizedId);

    if (objectId.toString() !== normalizedId.toLowerCase()) {
      return null;
    }

    return objectId;
  }

  private normalizeClinicalReportOwnership(
    input: ClinicalReportOwnershipInput,
  ): {
    _id: Types.ObjectId;
    patientId: Types.ObjectId;
    assessmentVisitId: Types.ObjectId;
  } | null {
    const reportId = this.normalizeObjectId(input.reportId);
    const patientId = this.normalizeObjectId(input.patientId);
    const assessmentVisitId = this.normalizeObjectId(input.assessmentVisitId);
    return reportId && patientId && assessmentVisitId
      ? { _id: reportId, patientId, assessmentVisitId }
      : null;
  }

  private toObjectIds(ids: string[]): Types.ObjectId[] {
    return ids.map((id) => new Types.ObjectId(id));
  }

  private normalizeReportStatus(status: string): ClinicalReportStatus | null {
    const normalizedStatus = status.trim().toLowerCase();

    if (!CLINICAL_REPORT_STATUS_SET.has(normalizedStatus)) {
      return null;
    }

    return normalizedStatus as ClinicalReportStatus;
  }

  private mapReport(report: ClinicalReportDocument): ClinicalReportSummary {
    return {
      id: report._id.toString(),
      patientId: report.patientId.toString(),
      assessmentVisitId: report.assessmentVisitId.toString(),
      primaryScaleInstanceIds: this.mapObjectIds(
        report.primaryScaleInstanceIds,
      ),
      scoreResultIds: this.mapObjectIds(report.scoreResultIds),
      cognitiveDomainResultIds: this.mapObjectIds(
        report.cognitiveDomainResultIds,
      ),
      mediaEvidenceIds: this.mapObjectIds(report.mediaEvidenceIds),
      subjectCode: report.subjectCode,
      reportCode: report.reportCode,
      reportNo: report.reportNo,
      reportType: report.reportType,
      status: report.status,
      reportVersion: report.reportVersion,
      source: report.source,
      patientSnapshot: this.mapPatientSnapshot(report.patientSnapshot),
      visitSnapshot: this.mapVisitSnapshot(report.visitSnapshot),
      scaleTraces: (report.scaleTraces ?? []).map((trace) =>
        this.mapScaleTrace(trace),
      ),
      scoreSnapshots: (report.scoreSnapshots ?? []).map((snapshot) =>
        this.mapScoreSnapshot(snapshot),
      ),
      domainSnapshots: (report.domainSnapshots ?? []).map((snapshot) =>
        this.mapDomainSnapshot(snapshot),
      ),
      evidenceSnapshots: (report.evidenceSnapshots ?? []).map((snapshot) =>
        this.mapEvidenceSnapshot(snapshot),
      ),
      narrative: this.mapNarrative(report.narrative),
      aiDraft: this.mapAiDraft(report.aiDraft),
      confirmation: this.mapConfirmation(report.confirmation),
      lockedAt: report.lockedAt ?? null,
      lockedBy: this.mapOptionalObjectId(report.lockedBy),
      archivedAt: report.archivedAt ?? null,
      archivedBy: this.mapOptionalObjectId(report.archivedBy),
      correctionRecords: (report.correctionRecords ?? []).map((record) =>
        this.mapCorrectionRecord(record),
      ),
      voidedAt: report.voidedAt ?? null,
      voidedBy: this.mapOptionalObjectId(report.voidedBy),
      voidReason: report.voidReason,
      auditLogRefs: this.mapObjectIds(report.auditLogRefs),
      qualityStatus: report.qualityStatus,
      qualityHints: report.qualityHints ?? null,
      operatorNote: report.operatorNote,
      metadata: report.metadata ?? null,
      createdAt: this.readTimestamp(report, 'createdAt'),
      updatedAt: this.readTimestamp(report, 'updatedAt'),
    };
  }

  private readTimestamp(
    report: ClinicalReportDocument,
    field: 'createdAt' | 'updatedAt',
  ): Date | null {
    const timestamped = report as ClinicalReportDocument & {
      createdAt?: unknown;
      updatedAt?: unknown;
    };
    const value: unknown = timestamped[field];
    return value instanceof Date && Number.isFinite(value.getTime())
      ? value
      : null;
  }

  private mapObjectIds(ids?: Types.ObjectId[]): string[] {
    return (ids ?? []).map((id) => id.toString());
  }

  private mapOptionalObjectId(id?: Types.ObjectId | null): string | null {
    return id?.toString() ?? null;
  }

  private mapPatientSnapshot(
    snapshot?: ReportPatientSnapshot | null,
  ): ReportPatientSnapshotSummary | null {
    if (!snapshot) {
      return null;
    }

    return {
      subjectCode: snapshot.subjectCode,
      displayName: snapshot.displayName,
      sex: snapshot.sex,
      birthDate: snapshot.birthDate ?? null,
      educationYears: snapshot.educationYears ?? null,
    };
  }

  private mapVisitSnapshot(
    snapshot?: ReportVisitSnapshot | null,
  ): ReportVisitSnapshotSummary | null {
    if (!snapshot) {
      return null;
    }

    return {
      visitCode: snapshot.visitCode,
      visitType: snapshot.visitType,
      assessmentDate: snapshot.assessmentDate ?? null,
      operatorName: snapshot.operatorName,
      operatorRole: snapshot.operatorRole,
      clinicalContext: snapshot.clinicalContext ?? null,
    };
  }

  private mapScaleTrace(
    trace: ReportScaleTraceSnapshot,
  ): ReportScaleTraceSummary {
    return {
      scaleInstanceId: this.mapOptionalObjectId(trace.scaleInstanceId),
      scaleCode: trace.scaleCode,
      scaleVersion: trace.scaleVersion,
      crfVersion: trace.crfVersion,
      scoringRuleVersion: trace.scoringRuleVersion,
      fieldEncodingVersion: trace.fieldEncodingVersion,
      domainMappingVersion: trace.domainMappingVersion,
      sourceDocument: trace.sourceDocument,
    };
  }

  private mapScoreSnapshot(
    snapshot: ReportScoreSnapshot,
  ): ReportScoreSnapshotSummary {
    return {
      scoreResultId: this.mapOptionalObjectId(snapshot.scoreResultId),
      scaleCode: snapshot.scaleCode,
      scaleName: snapshot.scaleName,
      scaleVersion: snapshot.scaleVersion,
      totalScoreValue: snapshot.totalScoreValue ?? null,
      totalMaxScore: snapshot.totalMaxScore ?? null,
      totalMinScore: snapshot.totalMinScore ?? null,
      scorePercent: snapshot.scorePercent ?? null,
      scoreStatus: snapshot.scoreStatus,
      qualityStatus: snapshot.qualityStatus,
      summary: snapshot.summary,
      scoreDetails: snapshot.scoreDetails ?? null,
    };
  }

  private mapDomainSnapshot(
    snapshot: ReportDomainSnapshot,
  ): ReportDomainSnapshotSummary {
    return {
      cognitiveDomainResultId: this.mapOptionalObjectId(
        snapshot.cognitiveDomainResultId,
      ),
      scaleCode: snapshot.scaleCode,
      domainCode: snapshot.domainCode,
      domainTitle: snapshot.domainTitle,
      scoreValue: snapshot.scoreValue ?? null,
      maxScore: snapshot.maxScore ?? null,
      scorePercent: snapshot.scorePercent ?? null,
      weightedScore: snapshot.weightedScore ?? null,
      weightedMaxScore: snapshot.weightedMaxScore ?? null,
      itemCount: snapshot.itemCount ?? null,
      needsReviewItemCount: snapshot.needsReviewItemCount ?? null,
      summary: snapshot.summary,
    };
  }

  private mapEvidenceSnapshot(
    snapshot: ReportEvidenceSnapshot,
  ): ReportEvidenceSnapshotSummary {
    return {
      mediaEvidenceId: this.mapOptionalObjectId(snapshot.mediaEvidenceId),
      itemResponseId: this.mapOptionalObjectId(snapshot.itemResponseId),
      scaleCode: snapshot.scaleCode,
      itemCode: snapshot.itemCode,
      itemTitle: snapshot.itemTitle,
      evidenceType: snapshot.evidenceType,
      captureMode: snapshot.captureMode,
      storageObjectKey: snapshot.storageObjectKey,
      qualityStatus: snapshot.qualityStatus,
      summary: snapshot.summary,
    };
  }

  private mapNarrative(
    narrative?: ReportNarrativeSnapshot | null,
  ): ReportNarrativeSummary | null {
    if (!narrative) {
      return null;
    }

    return {
      chiefSummary: narrative.chiefSummary,
      scoreSummary: narrative.scoreSummary,
      domainSummary: narrative.domainSummary,
      evidenceSummary: narrative.evidenceSummary,
      trendSummary: narrative.trendSummary,
      recommendationText: narrative.recommendationText,
      doctorOpinion: narrative.doctorOpinion,
      limitations: narrative.limitations,
    };
  }

  private mapAiDraft(
    aiDraft?: ReportAiDraftSnapshot | null,
  ): ReportAiDraftSummary | null {
    if (!aiDraft) {
      return null;
    }

    return {
      aiAnalysisResultId: this.mapOptionalObjectId(aiDraft.aiAnalysisResultId),
      provider: aiDraft.provider,
      model: aiDraft.model,
      generatedAt: aiDraft.generatedAt ?? null,
      draftText: aiDraft.draftText,
      status: aiDraft.status,
      doctorEdited: aiDraft.doctorEdited ?? false,
      note: aiDraft.note,
    };
  }

  private mapConfirmation(
    confirmation?: ReportConfirmationSnapshot | null,
  ): ReportConfirmationSummary | null {
    if (!confirmation) {
      return null;
    }

    return {
      confirmedAt: confirmation.confirmedAt ?? null,
      confirmedBy: this.mapOptionalObjectId(confirmation.confirmedBy),
      confirmedByName: confirmation.confirmedByName,
      confirmedByRole: confirmation.confirmedByRole,
      confirmationNote: confirmation.confirmationNote,
      signatureText: confirmation.signatureText,
    };
  }

  private mapCorrectionRecord(
    record: ReportCorrectionRecord,
  ): ReportCorrectionSummary {
    return {
      correctionNo: record.correctionNo,
      correctedAt: record.correctedAt ?? null,
      correctedBy: this.mapOptionalObjectId(record.correctedBy),
      correctedByName: record.correctedByName,
      reason: record.reason,
      changeSummary: record.changeSummary,
      previousReportCode: record.previousReportCode,
      replacementReportCode: record.replacementReportCode,
      auditLogId: this.mapOptionalObjectId(record.auditLogId),
    };
  }
}
