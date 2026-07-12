import { Injectable } from '@nestjs/common';
import type {
  ReportConfirmationRole,
  ReportOperatorRole,
} from '../schemas/clinical-report.schema';
import {
  readClinicalReportConfirmation,
  readClinicalReportEditEvents,
  readClinicalReportSubmission,
} from '../lib/clinical-report-review';
import { resolveExistingClinicalReportLock } from '../lib/clinical-report-lock';
import { resolveExistingClinicalReportArchive } from '../lib/clinical-report-archive';
import { resolveExistingSourceFreeze } from '../lib/clinical-report-source-freeze';
import {
  resolveClinicalReportReplacementLineage,
  resolveExistingClinicalReportCorrection,
} from '../lib/clinical-report-correction';
import type { ClinicalReportResponse } from '../types/clinical-report-response.types';
import type {
  ClinicalReportSummary,
  ReportDomainSnapshotSummary,
  ReportEvidenceSnapshotSummary,
  ReportScoreSnapshotSummary,
} from './reports.service';

const OPERATOR_ROLES = new Set<ReportOperatorRole>([
  'doctor',
  'nurse',
  'research_assistant',
  'admin',
  'unknown',
]);
const CONFIRMATION_ROLES = new Set<ReportConfirmationRole>([
  'doctor',
  'admin',
  'unknown',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function safeDate(value: unknown): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value
    : null;
}

function safeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const result: string[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== 'string') {
      return null;
    }
    const normalized = item.trim().toLowerCase();
    if (normalized) {
      result.push(normalized);
    }
  }
  return result;
}

@Injectable()
export class ClinicalReportPublicMapper {
  toPublicReport(report: ClinicalReportSummary): ClinicalReportResponse {
    return {
      id: report.id,
      reportCode: report.reportCode,
      reportNo: report.reportNo,
      reportType: report.reportType,
      status: report.status,
      reportVersion: report.reportVersion,
      source: report.source,
      qualityStatus: report.qualityStatus,
      patientSnapshot: report.patientSnapshot
        ? {
            subjectCode: report.patientSnapshot.subjectCode,
            displayName: report.patientSnapshot.displayName,
            sex: report.patientSnapshot.sex,
            birthDate: safeDate(report.patientSnapshot.birthDate),
            educationYears: finiteOrNull(report.patientSnapshot.educationYears),
          }
        : null,
      visitSnapshot: report.visitSnapshot
        ? {
            visitCode: report.visitSnapshot.visitCode,
            visitType: report.visitSnapshot.visitType,
            assessmentDate: safeDate(report.visitSnapshot.assessmentDate),
            operatorName: report.visitSnapshot.operatorName,
            operatorRole: report.visitSnapshot.operatorRole,
          }
        : null,
      scaleTraces: report.scaleTraces
        .map((trace) => ({
          scaleInstanceId: trace.scaleInstanceId,
          scaleCode: trace.scaleCode,
          scaleVersion: trace.scaleVersion,
          crfVersion: trace.crfVersion,
          scoringRuleVersion: trace.scoringRuleVersion,
          fieldEncodingVersion: trace.fieldEncodingVersion,
          domainMappingVersion: trace.domainMappingVersion,
          sourceDocument: trace.sourceDocument,
        }))
        .sort(
          (left, right) =>
            left.scaleCode.localeCompare(right.scaleCode) ||
            (left.scaleInstanceId ?? '').localeCompare(
              right.scaleInstanceId ?? '',
            ),
        ),
      scoreSnapshots: report.scoreSnapshots
        .map((snapshot) => this.mapScoreSnapshot(snapshot))
        .sort(
          (left, right) =>
            left.scaleCode.localeCompare(right.scaleCode) ||
            (left.scaleVersion ?? '').localeCompare(right.scaleVersion ?? ''),
        ),
      domainSnapshots: report.domainSnapshots
        .map((snapshot) => this.mapDomainSnapshot(snapshot))
        .sort(
          (left, right) =>
            (left.scaleCode ?? '').localeCompare(right.scaleCode ?? '') ||
            left.domainCode.localeCompare(right.domainCode),
        ),
      evidenceSnapshots: report.evidenceSnapshots
        .map((snapshot) => this.mapEvidenceSnapshot(snapshot))
        .sort(
          (left, right) =>
            (left.scaleCode ?? '').localeCompare(right.scaleCode ?? '') ||
            (left.itemCode ?? '').localeCompare(right.itemCode ?? '') ||
            (left.evidenceType ?? '').localeCompare(right.evidenceType ?? ''),
        ),
      narrative: report.narrative
        ? {
            chiefSummary: report.narrative.chiefSummary,
            scoreSummary: report.narrative.scoreSummary,
            domainSummary: report.narrative.domainSummary,
            evidenceSummary: report.narrative.evidenceSummary,
            doctorOpinion: report.narrative.doctorOpinion,
            recommendationText: report.narrative.recommendationText,
            limitations: report.narrative.limitations,
          }
        : null,
      generation: this.mapGeneration(report),
      editorial: this.mapEditorial(report),
      submission: this.mapSubmission(report),
      confirmation: report.confirmation
        ? {
            confirmationId:
              readClinicalReportConfirmation(report.metadata)?.confirmationId ??
              null,
            confirmedAt: safeDate(report.confirmation.confirmedAt),
            confirmedByName: report.confirmation.confirmedByName,
            confirmedByRole: this.safeConfirmationRole(
              report.confirmation.confirmedByRole,
            ),
            confirmationNote: report.confirmation.confirmationNote,
          }
        : null,
      lockedAt: safeDate(report.lockedAt),
      lock: this.mapLock(report),
      sourceFreeze: this.mapSourceFreeze(report),
      archivedAt: safeDate(report.archivedAt),
      archive: this.mapArchive(report),
      correction: this.mapCorrection(report),
      replacementOf: this.mapReplacementOf(report),
      voidedAt: safeDate(report.voidedAt),
      voidReason: report.voidReason,
      createdAt: safeDate(report.createdAt),
      updatedAt: safeDate(report.updatedAt),
      isFinal: ['confirmed', 'archived', 'corrected'].includes(report.status),
    };
  }

  private mapScoreSnapshot(snapshot: ReportScoreSnapshotSummary) {
    return {
      scaleCode: snapshot.scaleCode,
      scaleName: snapshot.scaleName,
      scaleVersion: snapshot.scaleVersion,
      totalScoreValue: finiteOrNull(snapshot.totalScoreValue),
      totalMaxScore: finiteOrNull(snapshot.totalMaxScore),
      totalMinScore: finiteOrNull(snapshot.totalMinScore),
      scorePercent: finiteOrNull(snapshot.scorePercent),
      scoreStatus: snapshot.scoreStatus,
      qualityStatus: snapshot.qualityStatus,
      summary: snapshot.summary,
    };
  }

  private mapDomainSnapshot(snapshot: ReportDomainSnapshotSummary) {
    return {
      scaleCode: snapshot.scaleCode,
      domainCode: snapshot.domainCode,
      domainTitle: snapshot.domainTitle,
      scoreValue: finiteOrNull(snapshot.scoreValue),
      maxScore: finiteOrNull(snapshot.maxScore),
      scorePercent: finiteOrNull(snapshot.scorePercent),
      weightedScore: finiteOrNull(snapshot.weightedScore),
      weightedMaxScore: finiteOrNull(snapshot.weightedMaxScore),
      itemCount: finiteOrNull(snapshot.itemCount),
      needsReviewItemCount: finiteOrNull(snapshot.needsReviewItemCount),
      summary: snapshot.summary,
    };
  }

  private mapEvidenceSnapshot(snapshot: ReportEvidenceSnapshotSummary) {
    return {
      scaleCode: snapshot.scaleCode,
      itemCode: snapshot.itemCode,
      itemTitle: snapshot.itemTitle,
      evidenceType: snapshot.evidenceType,
      captureMode: snapshot.captureMode,
      qualityStatus: snapshot.qualityStatus,
      summary: snapshot.summary,
    };
  }

  private mapGeneration(report: ClinicalReportSummary) {
    if (!isRecord(report.metadata)) {
      return null;
    }
    const value = report.metadata.a20Generation;
    if (!isRecord(value) || value.version !== 1 || value.aiUsed !== false) {
      return null;
    }
    const primaryScaleInstanceIds = safeStringArray(
      value.primaryScaleInstanceIds,
    );
    const scoreResultIds = safeStringArray(value.scoreResultIds);
    const cognitiveDomainResultIds = safeStringArray(
      value.cognitiveDomainResultIds,
    );
    if (
      !primaryScaleInstanceIds ||
      !scoreResultIds ||
      !cognitiveDomainResultIds
    ) {
      return null;
    }
    const generatedBy = safeString(value.generatedBy);
    const generatedByName = safeString(value.generatedByName);
    const generatedByRole = this.safeOperatorRole(value.generatedByRole);
    return {
      generationId: safeString(value.generationId) ?? null,
      generatedAt: safeDate(value.generatedAt),
      generatedBy: generatedBy
        ? {
            operatorId: generatedBy,
            operatorName: generatedByName,
            operatorRole: generatedByRole,
          }
        : null,
      engineVersion: safeString(value.engineVersion),
      reportScope: safeString(value.reportScope),
      includedScaleInstanceCount: primaryScaleInstanceIds.length,
      scoreResultCount: scoreResultIds.length,
      cognitiveDomainResultCount: cognitiveDomainResultIds.length,
      mediaEvidenceCount: nonNegativeInteger(value.mediaEvidenceCount),
      aiUsed: false,
    };
  }

  private mapEditorial(report: ClinicalReportSummary) {
    const events = readClinicalReportEditEvents(report.metadata);
    if (!events || events.length === 0) {
      return null;
    }
    const last = events[events.length - 1];
    return {
      lastEditedAt: safeDate(last.editedAt),
      lastEditedBy: {
        operatorId: last.editedBy,
        operatorName: last.editedByName,
        operatorRole: this.safeOperatorRole(last.editedByRole),
      },
      editCount: events.length,
      lastChangedFields: [...last.changedFields],
    };
  }

  private mapSubmission(report: ClinicalReportSummary) {
    const submission = readClinicalReportSubmission(report.metadata);
    if (!submission) {
      return null;
    }
    return {
      submissionId: submission.submissionId,
      submittedAt: safeDate(submission.submittedAt),
      submittedBy: {
        operatorId: submission.submittedBy,
        operatorName: submission.submittedByName,
        operatorRole: this.safeOperatorRole(submission.submittedByRole),
      },
      submissionNote: submission.submissionNote,
    };
  }

  private mapLock(report: ClinicalReportSummary) {
    try {
      const lock = resolveExistingClinicalReportLock(report);
      if (!lock) {
        return null;
      }
      return {
        lockId: lock.lockId,
        lockedAt: new Date(lock.lockedAt.getTime()),
        lockedBy: {
          operatorId: lock.lockedBy.operatorId,
          ...(lock.lockedBy.operatorName
            ? { operatorName: lock.lockedBy.operatorName }
            : {}),
          operatorRole: lock.lockedBy.operatorRole,
        },
        ...(lock.lockNote ? { lockNote: lock.lockNote } : {}),
      };
    } catch {
      return null;
    }
  }

  private mapSourceFreeze(report: ClinicalReportSummary) {
    try {
      const audit = resolveExistingSourceFreeze(report);
      if (!audit) {
        return null;
      }
      const completed = audit.state === 'completed';
      return {
        freezeId: audit.freezeId,
        state: audit.state,
        startedAt: new Date(audit.startedAt.getTime()),
        sourceLockedAt: new Date(audit.sourceLockedAt.getTime()),
        startedBy: {
          operatorId: audit.startedBy,
          operatorName: audit.startedByName,
          operatorRole: audit.startedByRole,
        },
        freezeNote: audit.freezeNote,
        expectedCounts: { ...audit.expectedCounts },
        completedCounts:
          completed && audit.completedCounts
            ? { ...audit.completedCounts }
            : null,
        newlyFrozenCounts:
          completed && audit.newlyFrozenCounts
            ? { ...audit.newlyFrozenCounts }
            : null,
        previouslyFrozenCounts: { ...audit.previouslyFrozenCounts },
        completedAt:
          completed && audit.completedAt
            ? new Date(audit.completedAt.getTime())
            : null,
        completedBy:
          completed &&
          audit.completedBy &&
          audit.completedByName &&
          audit.completedByRole
            ? {
                operatorId: audit.completedBy,
                operatorName: audit.completedByName,
                operatorRole: audit.completedByRole,
              }
            : null,
      };
    } catch {
      return null;
    }
  }

  private mapArchive(report: ClinicalReportSummary) {
    try {
      const archive = resolveExistingClinicalReportArchive(report);
      if (!archive) {
        return null;
      }
      return {
        archiveId: archive.archiveId,
        archivedAt: new Date(archive.archivedAt.getTime()),
        archivedBy: {
          operatorId: archive.archivedBy.operatorId,
          ...(archive.archivedBy.operatorName
            ? { operatorName: archive.archivedBy.operatorName }
            : {}),
          operatorRole: archive.archivedBy.operatorRole,
        },
        ...(archive.archiveNote ? { archiveNote: archive.archiveNote } : {}),
        sourceFreezeId: archive.sourceFreezeId,
        sourceFreezeCompletedAt: archive.sourceFreezeCompletedAt
          ? new Date(archive.sourceFreezeCompletedAt.getTime())
          : null,
      };
    } catch {
      return null;
    }
  }

  private mapCorrection(report: ClinicalReportSummary) {
    try {
      const resolution = resolveExistingClinicalReportCorrection(report);
      if (!resolution) {
        return null;
      }
      const audit = resolution.audit;
      return {
        correctionId: audit.correctionId,
        correctionNo: audit.correctionNo,
        state: audit.state,
        startedAt: new Date(audit.startedAt.getTime()),
        startedBy: {
          operatorId: audit.startedBy,
          operatorName: audit.startedByName,
          operatorRole: audit.startedByRole,
        },
        correctionReason: audit.correctionReason,
        changeSummary: audit.changeSummary,
        previousReportCode: audit.previousReportCode,
        previousReportVersion: audit.previousReportVersion,
        replacementReportId: audit.replacementReportId ?? null,
        replacementReportCode: audit.replacementReportCode,
        replacementReportVersion: audit.replacementReportVersion,
        completedAt: audit.completedAt
          ? new Date(audit.completedAt.getTime())
          : null,
        completedBy:
          audit.completedBy && audit.completedByName && audit.completedByRole
            ? {
                operatorId: audit.completedBy,
                operatorName: audit.completedByName,
                operatorRole: audit.completedByRole,
              }
            : null,
      };
    } catch {
      return null;
    }
  }

  private mapReplacementOf(report: ClinicalReportSummary) {
    try {
      const lineage = resolveClinicalReportReplacementLineage(report);
      if (!lineage) {
        return null;
      }
      return {
        correctionId: lineage.correctionId,
        correctionNo: lineage.correctionNo,
        previousReportId: lineage.previousReportId,
        previousReportCode: lineage.previousReportCode,
        previousReportVersion: lineage.previousReportVersion,
        replacementReportCode: lineage.replacementReportCode,
        replacementReportVersion: lineage.replacementReportVersion,
        createdAt: new Date(lineage.createdAt.getTime()),
        createdBy: {
          operatorId: lineage.createdBy,
          operatorName: lineage.createdByName,
          operatorRole: lineage.createdByRole,
        },
        correctionReason: lineage.correctionReason,
        changeSummary: lineage.changeSummary,
        sourceArchiveId: lineage.sourceArchiveId,
        sourceArchivedAt: new Date(lineage.sourceArchivedAt.getTime()),
        sourceFreezeId: lineage.sourceFreezeId,
        sourceFreezeCompletedAt: new Date(
          lineage.sourceFreezeCompletedAt.getTime(),
        ),
      };
    } catch {
      return null;
    }
  }

  private safeOperatorRole(value: unknown): ReportOperatorRole | undefined {
    return typeof value === 'string' &&
      OPERATOR_ROLES.has(value as ReportOperatorRole)
      ? (value as ReportOperatorRole)
      : undefined;
  }

  private safeConfirmationRole(
    value: ReportConfirmationRole | undefined,
  ): ReportConfirmationRole | undefined {
    return value && CONFIRMATION_ROLES.has(value) ? value : undefined;
  }
}
