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
    };
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
