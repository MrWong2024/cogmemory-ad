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
import type {
  AssessmentHistoryDomainSummaryResponse,
  AssessmentHistoryReportSummaryResponse,
  AssessmentHistoryScaleSummaryResponse,
  AssessmentHistoryScoreSummaryResponse,
  AssessmentHistoryVersionTraceResponse,
  HistorySourceAvailability,
  PatientAssessmentHistoryItemResponse,
} from '../types/clinical-history.types';

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function scoreTrace(
  score: AssessmentHistoryScoreResultSummary,
): AssessmentHistoryVersionTraceResponse {
  return {
    scaleVersion: text(score.versionTrace?.scaleVersion),
    crfVersion: text(score.versionTrace?.crfVersion),
    scoringRuleVersion: text(score.versionTrace?.scoringRuleVersion),
    fieldEncodingVersion: text(score.versionTrace?.fieldEncodingVersion),
  };
}

function traceMatches(
  instance: AssessmentHistoryScaleInstanceSummary,
  score: AssessmentHistoryScoreResultSummary,
): boolean {
  const instanceTrace = {
    scaleVersion: text(instance.scaleVersion),
    crfVersion: text(instance.versionTrace?.crfVersion),
    scoringRuleVersion: text(instance.versionTrace?.scoringRuleVersion),
    fieldEncodingVersion: text(instance.versionTrace?.fieldEncodingVersion),
  };
  const resultTrace = scoreTrace(score);
  return (
    Object.values(instanceTrace).every((value) => value !== null) &&
    Object.keys(instanceTrace).every(
      (key) =>
        instanceTrace[key as keyof typeof instanceTrace] ===
        resultTrace[key as keyof typeof resultTrace],
    )
  );
}

function scoreOwnershipMatches(
  instance: AssessmentHistoryScaleInstanceSummary,
  score: AssessmentHistoryScoreResultSummary,
): boolean {
  return (
    score.patientId === instance.patientId &&
    score.assessmentVisitId === instance.assessmentVisitId &&
    score.scaleInstanceId === instance.id &&
    score.scaleCode === instance.scaleCode &&
    score.runNo === 1
  );
}

function scoreAvailability(
  instance: AssessmentHistoryScaleInstanceSummary,
  candidates: readonly AssessmentHistoryScoreResultSummary[],
): HistorySourceAvailability {
  if (candidates.length !== 1) {
    return 'source_incomplete';
  }
  const score = candidates[0];
  if (!scoreOwnershipMatches(instance, score)) {
    return 'source_incomplete';
  }
  if (score.status === 'voided') {
    return 'source_voided';
  }
  if (score.status !== 'confirmed' && score.status !== 'locked') {
    return 'source_not_final';
  }
  const total = score.totalScore;
  if (
    score.qualityStatus !== 'passed' ||
    (score.review?.reviewStatus !== 'reviewed' &&
      score.review?.reviewStatus !== 'not_required') ||
    !validDate(score.confirmedAt) ||
    (score.status === 'locked' && !validDate(score.lockedAt)) ||
    score.voidedAt !== null ||
    !total ||
    !finite(total.scoreValue) ||
    !finite(total.minScore) ||
    !finite(total.maxScore) ||
    !finite(total.scorePercent) ||
    total.minScore > total.scoreValue ||
    total.scoreValue > total.maxScore ||
    total.minScore >= total.maxScore ||
    total.scorePercent < 0 ||
    total.scorePercent > 100 ||
    !traceMatches(instance, score)
  ) {
    return 'source_incomplete';
  }
  return 'available';
}

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
  const availability = scoreAvailability(instance, ordered);
  const available = availability === 'available';
  return {
    availability,
    status: score.status,
    qualityStatus: score.qualityStatus,
    totalScoreValue: available ? score.totalScore!.scoreValue : null,
    totalMinScore: available ? score.totalScore!.minScore : null,
    totalMaxScore: available ? score.totalScore!.maxScore : null,
    scorePercent: available ? score.totalScore!.scorePercent : null,
    confirmedAt: validDate(score.confirmedAt) ? score.confirmedAt : null,
    lockedAt: validDate(score.lockedAt) ? score.lockedAt : null,
    versionTrace: scoreTrace(score),
  };
}

function domainOwnershipMatches(
  instance: AssessmentHistoryScaleInstanceSummary,
  score: AssessmentHistoryScoreResultSummary,
  domain: AssessmentHistoryCognitiveDomainResultSummary,
): boolean {
  return (
    domain.patientId === instance.patientId &&
    domain.assessmentVisitId === instance.assessmentVisitId &&
    domain.scaleInstanceId === instance.id &&
    domain.scoreResultId === score.id &&
    domain.scaleCode === instance.scaleCode &&
    domain.runNo === 1
  );
}

function domainTraceMatches(
  instance: AssessmentHistoryScaleInstanceSummary,
  score: AssessmentHistoryScoreResultSummary,
  domain: AssessmentHistoryCognitiveDomainResultSummary,
): boolean {
  const instanceValues = [
    text(instance.scaleVersion),
    text(instance.versionTrace?.crfVersion),
    text(instance.versionTrace?.scoringRuleVersion),
    text(instance.versionTrace?.fieldEncodingVersion),
  ];
  const scoreValues = [
    text(score.versionTrace?.scaleVersion),
    text(score.versionTrace?.crfVersion),
    text(score.versionTrace?.scoringRuleVersion),
    text(score.versionTrace?.fieldEncodingVersion),
  ];
  const domainValues = [
    text(domain.versionTrace?.scaleVersion),
    text(domain.versionTrace?.crfVersion),
    text(domain.versionTrace?.scoringRuleVersion),
    text(domain.versionTrace?.fieldEncodingVersion),
  ];
  return instanceValues.every(
    (value, index) =>
      value !== null &&
      value === scoreValues[index] &&
      value === domainValues[index],
  );
}

function validDomainScores(
  domain: AssessmentHistoryCognitiveDomainResultSummary,
): boolean {
  if (domain.domainScores.length === 0) {
    return false;
  }
  const codes = new Set<string>();
  for (const score of domain.domainScores) {
    const code = text(score.domainCode)?.toLowerCase() ?? null;
    const weightedPairValid =
      (score.weightedScore === null && score.weightedMaxScore === null) ||
      (finite(score.weightedScore) &&
        finite(score.weightedMaxScore) &&
        score.weightedMaxScore >= 0);
    if (
      !code ||
      codes.has(code) ||
      !finite(score.scoreValue) ||
      !finite(score.minScore) ||
      !finite(score.maxScore) ||
      !finite(score.scorePercent) ||
      score.minScore > score.scoreValue ||
      score.scoreValue > score.maxScore ||
      score.minScore >= score.maxScore ||
      score.scorePercent < 0 ||
      score.scorePercent > 100 ||
      !Number.isInteger(score.itemCount) ||
      score.itemCount < 0 ||
      !weightedPairValid
    ) {
      return false;
    }
    codes.add(code);
  }
  return true;
}

function domainAvailability(input: {
  instance: AssessmentHistoryScaleInstanceSummary;
  scoreCandidates: readonly AssessmentHistoryScoreResultSummary[];
  scoreSummary: AssessmentHistoryScoreSummaryResponse;
  domainCandidates: readonly AssessmentHistoryCognitiveDomainResultSummary[];
}): HistorySourceAvailability {
  if (
    input.scoreCandidates.length !== 1 ||
    input.domainCandidates.length !== 1
  ) {
    return 'source_incomplete';
  }
  const score = input.scoreCandidates[0];
  const domain = input.domainCandidates[0];
  if (!domainOwnershipMatches(input.instance, score, domain)) {
    return 'source_incomplete';
  }
  if (domain.status === 'voided') {
    return 'source_voided';
  }
  if (!['computed', 'confirmed', 'locked'].includes(domain.status)) {
    return 'source_not_final';
  }
  const mappingVersion = text(domain.versionTrace?.domainMappingVersion);
  if (
    input.scoreSummary.availability !== 'available' ||
    domain.qualityStatus !== 'passed' ||
    domain.voidedAt !== null ||
    domain.mappingSource !== 'scale_config' ||
    domain.mappingMode !== 'item_domain_codes' ||
    !domain.computation ||
    domain.computation.warningCount !== 0 ||
    !domainTraceMatches(input.instance, score, domain) ||
    !mappingVersion ||
    mappingVersion !== text(domain.mappingSnapshot?.mappingVersion) ||
    !validDomainScores(domain)
  ) {
    return 'source_incomplete';
  }
  return 'available';
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
  const availability = domainAvailability({
    ...input,
    scoreSummary,
    domainCandidates: ordered,
  });
  return {
    availability,
    status: domain.status,
    qualityStatus: domain.qualityStatus,
    mappingVersion:
      availability === 'available'
        ? text(domain.versionTrace?.domainMappingVersion)
        : null,
    domainCount:
      availability === 'available'
        ? new Set(
            domain.domainScores.map((score) =>
              score.domainCode.trim().toLowerCase(),
            ),
          ).size
        : 0,
    computedAt: validDate(domain.computation?.computedAt)
      ? domain.computation.computedAt
      : null,
  };
}

function safeLatestPointer(report: ClinicalReportHistoryRecord | undefined) {
  return report &&
    text(report.id) &&
    text(report.reportCode) &&
    Number.isSafeInteger(report.reportVersion) &&
    report.reportVersion > 0 &&
    validDate(report.createdAt)
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
      (validDate(right.createdAt) ? right.createdAt.getTime() : -Infinity) -
        (validDate(left.createdAt) ? left.createdAt.getTime() : -Infinity) ||
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
          finite(instance.durationMs) && instance.durationMs >= 0
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
