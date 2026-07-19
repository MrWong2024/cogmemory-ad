import type {
  AssessmentHistoryScaleInstanceSummary,
  AssessmentHistoryVisitSummary,
} from '../../assessments/services/assessments.service';
import type { AssessmentHistoryCognitiveDomainResultSummary } from '../../cognitive-domains/services/cognitive-domains.service';
import {
  evaluateClinicalReportHistoryLineage,
  readClinicalReportHistoryLifecycle,
} from '../../reports/lib/clinical-report-history-lineage';
import type { ClinicalReportHistoryRecord } from '../../reports/services/reports.service';
import type { AssessmentHistoryScoreResultSummary } from '../../scoring/services/scoring.service';
import {
  evaluateClinicalHistoryDomainSource,
  evaluateClinicalHistoryScoreSource,
  finiteNumber,
  normalizedSourceText,
  readScoreVersionTrace,
  validSourceDate,
} from './clinical-history-source-evaluator';
import type {
  AssessmentHistoryDomainSummaryResponse,
  AssessmentHistoryReportSummaryResponse,
  AssessmentHistoryScaleSummaryResponse,
  AssessmentHistoryScoreSummaryResponse,
  PatientAssessmentHistoryItemResponse,
} from '../types/clinical-history.types';

export function mapAssessmentHistoryScoreSummary(
  instance: AssessmentHistoryScaleInstanceSummary,
  candidates: readonly AssessmentHistoryScoreResultSummary[],
): AssessmentHistoryScoreSummaryResponse | null {
  if (candidates.length === 0) {
    return null;
  }
  const ordered = [...candidates].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const score = ordered[0];
  const qualification = evaluateClinicalHistoryScoreSource(instance, ordered);
  const availability = qualification.availability;
  const available = availability === 'available';
  return {
    availability,
    status: score.status,
    qualityStatus: score.qualityStatus,
    totalScoreValue: available ? score.totalScore!.scoreValue : null,
    totalMinScore: available ? score.totalScore!.minScore : null,
    totalMaxScore: available ? score.totalScore!.maxScore : null,
    scorePercent: available ? score.totalScore!.scorePercent : null,
    confirmedAt: validSourceDate(score.confirmedAt) ? score.confirmedAt : null,
    lockedAt: validSourceDate(score.lockedAt) ? score.lockedAt : null,
    versionTrace: readScoreVersionTrace(score),
  };
}

export function mapAssessmentHistoryDomainSummary(input: {
  instance: AssessmentHistoryScaleInstanceSummary;
  scoreCandidates: readonly AssessmentHistoryScoreResultSummary[];
  scoreSummary: AssessmentHistoryScoreSummaryResponse | null;
  domainCandidates: readonly AssessmentHistoryCognitiveDomainResultSummary[];
}): AssessmentHistoryDomainSummaryResponse | null {
  const scoreSummary = input.scoreSummary;
  if (!scoreSummary || input.domainCandidates.length === 0) {
    return null;
  }
  const ordered = [...input.domainCandidates].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const domain = ordered[0];
  const qualification = evaluateClinicalHistoryDomainSource({
    instance: input.instance,
    scoreCandidates: input.scoreCandidates,
    scoreAvailability: scoreSummary.availability,
    domainCandidates: ordered,
  });
  const availability = qualification.availability;
  return {
    availability,
    status: domain.status,
    qualityStatus: domain.qualityStatus,
    mappingVersion:
      availability === 'available'
        ? normalizedSourceText(domain.versionTrace?.domainMappingVersion)
        : null,
    domainCount:
      availability === 'available'
        ? new Set(
            domain.domainScores.map((score) =>
              score.domainCode.trim().toLowerCase(),
            ),
          ).size
        : 0,
    computedAt: validSourceDate(domain.computation?.computedAt)
      ? domain.computation.computedAt
      : null,
  };
}

function safeLatestPointer(report: ClinicalReportHistoryRecord | undefined) {
  return report &&
    normalizedSourceText(report.id) &&
    normalizedSourceText(report.reportCode) &&
    Number.isSafeInteger(report.reportVersion) &&
    report.reportVersion > 0 &&
    validSourceDate(report.createdAt)
    ? {
        id: report.id,
        reportCode: report.reportCode,
        reportVersion: report.reportVersion,
        status: report.status,
        createdAt: report.createdAt,
      }
    : null;
}

export function mapAssessmentHistoryReportSummary(input: {
  reports: readonly ClinicalReportHistoryRecord[];
  patientId: string;
  assessmentVisitId: string;
}): AssessmentHistoryReportSummaryResponse {
  if (input.reports.length === 0) {
    return {
      status: 'none',
      totalVersions: 0,
      latest: null,
      latestArchivedVersion: null,
    };
  }
  const descending = [...input.reports].sort(
    (left, right) =>
      right.reportVersion - left.reportVersion ||
      (validSourceDate(right.createdAt)
        ? right.createdAt.getTime()
        : -Infinity) -
        (validSourceDate(left.createdAt)
          ? left.createdAt.getTime()
          : -Infinity) ||
      right.id.localeCompare(left.id),
  );
  let status: 'available' | 'incomplete' = 'available';
  try {
    evaluateClinicalReportHistoryLineage(input);
  } catch {
    status = 'incomplete';
  }
  const archived = descending.find((report) => {
    if (!['archived', 'corrected', 'voided'].includes(report.status)) {
      return false;
    }
    try {
      const lifecycle = readClinicalReportHistoryLifecycle(report);
      return Boolean(
        lifecycle.archive?.archiveId && lifecycle.archive.archivedAt,
      );
    } catch {
      return false;
    }
  });
  let latestArchivedVersion: AssessmentHistoryReportSummaryResponse['latestArchivedVersion'] =
    null;
  if (archived) {
    const archive = readClinicalReportHistoryLifecycle(archived).archive!;
    latestArchivedVersion = {
      id: archived.id,
      reportCode: archived.reportCode,
      reportVersion: archived.reportVersion,
      status: archived.status,
      archivedAt: archive.archivedAt,
    };
  }
  return {
    status,
    totalVersions: input.reports.length,
    latest: safeLatestPointer(descending[0]),
    latestArchivedVersion,
  };
}

export function mapPatientAssessmentHistoryItem(input: {
  visit: AssessmentHistoryVisitSummary;
  scaleInstances: readonly AssessmentHistoryScaleInstanceSummary[];
  scoreResults: readonly AssessmentHistoryScoreResultSummary[];
  domainResults: readonly AssessmentHistoryCognitiveDomainResultSummary[];
  reports: readonly ClinicalReportHistoryRecord[];
}): PatientAssessmentHistoryItemResponse {
  const scaleSummaries: AssessmentHistoryScaleSummaryResponse[] = [
    ...input.scaleInstances,
  ]
    .sort(
      (left, right) =>
        left.scaleCode.localeCompare(right.scaleCode) ||
        left.instanceNo - right.instanceNo ||
        left.id.localeCompare(right.id),
    )
    .map((instance) => {
      const scores = input.scoreResults.filter(
        (score) => score.scaleInstanceId === instance.id,
      );
      const scoreSummary = mapAssessmentHistoryScoreSummary(instance, scores);
      const scoreIds = new Set(scores.map((score) => score.id));
      const domains = input.domainResults.filter(
        (domain) =>
          domain.scaleInstanceId === instance.id &&
          scoreIds.has(domain.scoreResultId),
      );
      return {
        scaleInstanceId: instance.id,
        instanceCode: instance.instanceCode,
        scaleCode: instance.scaleCode,
        scaleVersion: instance.scaleVersion,
        status: instance.status,
        administrationMode: instance.administrationMode,
        startedAt: instance.startedAt,
        completedAt: instance.completedAt,
        lockedAt: instance.lockedAt,
        voidedAt: instance.voidedAt,
        durationMs:
          finiteNumber(instance.durationMs) && instance.durationMs >= 0
            ? instance.durationMs
            : null,
        scoreSummary,
        domainSummary: mapAssessmentHistoryDomainSummary({
          instance,
          scoreCandidates: scores,
          scoreSummary,
          domainCandidates: domains,
        }),
      };
    });
  return {
    visit: {
      id: input.visit.id,
      visitCode: input.visit.visitCode,
      visitType: input.visit.visitType,
      status: input.visit.status,
      assessmentDate: input.visit.assessmentDate,
      startedAt: input.visit.startedAt,
      completedAt: input.visit.completedAt,
      lockedAt: input.visit.lockedAt,
      voidedAt: input.visit.voidedAt,
    },
    scaleSummaries,
    reportSummary: mapAssessmentHistoryReportSummary({
      reports: input.reports,
      patientId: input.visit.patientId,
      assessmentVisitId: input.visit.id,
    }),
  };
}
