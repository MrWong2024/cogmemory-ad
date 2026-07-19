import type { AssessmentStatus } from '../../assessments/schemas/assessment-visit.schema';
import type { ScaleAdministrationMode } from '../../assessments/schemas/scale-instance.schema';
import type { AssessmentHistoryCognitiveDomainResultSummary } from '../../cognitive-domains/services/cognitive-domains.service';
import type { AssessmentHistoryScoreResultSummary } from '../../scoring/services/scoring.service';
import type {
  AssessmentHistoryVersionTraceResponse,
  HistorySourceAvailability,
} from '../types/clinical-history.types';

export type ClinicalHistoryScaleInstanceSource = {
  id: string;
  patientId: string;
  assessmentVisitId: string;
  scaleCode: string;
  scaleVersion: string;
  instanceCode: string;
  status: AssessmentStatus;
  administrationMode: ScaleAdministrationMode;
  versionTrace: {
    crfVersion?: string;
    scoringRuleVersion?: string;
    fieldEncodingVersion?: string;
  } | null;
  voidedAt: Date | null;
  durationMs: number | null;
};

export function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validSourceDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function normalizedSourceText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function readScoreVersionTrace(
  score: AssessmentHistoryScoreResultSummary,
): AssessmentHistoryVersionTraceResponse {
  return {
    scaleVersion: normalizedSourceText(score.versionTrace?.scaleVersion),
    crfVersion: normalizedSourceText(score.versionTrace?.crfVersion),
    scoringRuleVersion: normalizedSourceText(
      score.versionTrace?.scoringRuleVersion,
    ),
    fieldEncodingVersion: normalizedSourceText(
      score.versionTrace?.fieldEncodingVersion,
    ),
  };
}

export function scoreSourceOwnershipMatches(
  instance: ClinicalHistoryScaleInstanceSource,
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

export function scoreSourceTraceMatches(
  instance: ClinicalHistoryScaleInstanceSource,
  score: AssessmentHistoryScoreResultSummary,
): boolean {
  const instanceTrace: AssessmentHistoryVersionTraceResponse = {
    scaleVersion: normalizedSourceText(instance.scaleVersion),
    crfVersion: normalizedSourceText(instance.versionTrace?.crfVersion),
    scoringRuleVersion: normalizedSourceText(
      instance.versionTrace?.scoringRuleVersion,
    ),
    fieldEncodingVersion: normalizedSourceText(
      instance.versionTrace?.fieldEncodingVersion,
    ),
  };
  const scoreTrace = readScoreVersionTrace(score);
  return (
    Object.values(instanceTrace).every((value) => value !== null) &&
    Object.keys(instanceTrace).every(
      (key) =>
        instanceTrace[key as keyof AssessmentHistoryVersionTraceResponse] ===
        scoreTrace[key as keyof AssessmentHistoryVersionTraceResponse],
    )
  );
}

export type ClinicalHistoryScoreSourceQualification = {
  availability: HistorySourceAvailability;
  source: AssessmentHistoryScoreResultSummary | null;
  versionTrace: AssessmentHistoryVersionTraceResponse;
  traceIncomplete: boolean;
};

export function evaluateClinicalHistoryScoreSource(
  instance: ClinicalHistoryScaleInstanceSource,
  candidates: readonly AssessmentHistoryScoreResultSummary[],
): ClinicalHistoryScoreSourceQualification {
  const score = candidates[0] ?? null;
  const versionTrace = score
    ? readScoreVersionTrace(score)
    : {
        scaleVersion: null,
        crfVersion: null,
        scoringRuleVersion: null,
        fieldEncodingVersion: null,
      };
  const traceIncomplete = score
    ? !scoreSourceTraceMatches(instance, score)
    : false;
  if (candidates.length !== 1 || !score) {
    return {
      availability: 'source_incomplete',
      source: score,
      versionTrace,
      traceIncomplete,
    };
  }
  if (!scoreSourceOwnershipMatches(instance, score)) {
    return {
      availability: 'source_incomplete',
      source: score,
      versionTrace,
      traceIncomplete,
    };
  }
  if (score.status === 'voided') {
    return {
      availability: 'source_voided',
      source: score,
      versionTrace,
      traceIncomplete,
    };
  }
  if (score.status !== 'confirmed' && score.status !== 'locked') {
    return {
      availability: 'source_not_final',
      source: score,
      versionTrace,
      traceIncomplete,
    };
  }
  const total = score.totalScore;
  const complete =
    score.qualityStatus === 'passed' &&
    (score.review?.reviewStatus === 'reviewed' ||
      score.review?.reviewStatus === 'not_required') &&
    validSourceDate(score.confirmedAt) &&
    (score.status !== 'locked' || validSourceDate(score.lockedAt)) &&
    score.voidedAt === null &&
    Boolean(total) &&
    finiteNumber(total?.scoreValue) &&
    finiteNumber(total?.minScore) &&
    finiteNumber(total?.maxScore) &&
    finiteNumber(total?.scorePercent) &&
    total.minScore <= total.scoreValue &&
    total.scoreValue <= total.maxScore &&
    total.minScore < total.maxScore &&
    total.scorePercent >= 0 &&
    total.scorePercent <= 100 &&
    !traceIncomplete;
  return {
    availability: complete ? 'available' : 'source_incomplete',
    source: score,
    versionTrace,
    traceIncomplete,
  };
}

export function domainSourceOwnershipMatches(
  instance: ClinicalHistoryScaleInstanceSource,
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

export function domainSourceTraceMatches(
  instance: ClinicalHistoryScaleInstanceSource,
  score: AssessmentHistoryScoreResultSummary,
  domain: AssessmentHistoryCognitiveDomainResultSummary,
): boolean {
  const instanceValues = [
    normalizedSourceText(instance.scaleVersion),
    normalizedSourceText(instance.versionTrace?.crfVersion),
    normalizedSourceText(instance.versionTrace?.scoringRuleVersion),
    normalizedSourceText(instance.versionTrace?.fieldEncodingVersion),
  ];
  const scoreValues = [
    normalizedSourceText(score.versionTrace?.scaleVersion),
    normalizedSourceText(score.versionTrace?.crfVersion),
    normalizedSourceText(score.versionTrace?.scoringRuleVersion),
    normalizedSourceText(score.versionTrace?.fieldEncodingVersion),
  ];
  const domainValues = [
    normalizedSourceText(domain.versionTrace?.scaleVersion),
    normalizedSourceText(domain.versionTrace?.crfVersion),
    normalizedSourceText(domain.versionTrace?.scoringRuleVersion),
    normalizedSourceText(domain.versionTrace?.fieldEncodingVersion),
  ];
  return instanceValues.every(
    (value, index) =>
      value !== null &&
      value === scoreValues[index] &&
      value === domainValues[index],
  );
}

export function hasValidClinicalHistoryDomainScores(
  domain: AssessmentHistoryCognitiveDomainResultSummary,
): boolean {
  if (domain.domainScores.length === 0) {
    return false;
  }
  const codes = new Set<string>();
  for (const score of domain.domainScores) {
    const code = normalizedSourceText(score.domainCode)?.toLowerCase() ?? null;
    const weightedPairValid =
      (score.weightedScore === null && score.weightedMaxScore === null) ||
      (finiteNumber(score.weightedScore) &&
        finiteNumber(score.weightedMaxScore) &&
        score.weightedMaxScore >= 0);
    if (
      !code ||
      codes.has(code) ||
      !finiteNumber(score.scoreValue) ||
      !finiteNumber(score.minScore) ||
      !finiteNumber(score.maxScore) ||
      !finiteNumber(score.scorePercent) ||
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

export type ClinicalHistoryDomainSourceQualification = {
  availability: HistorySourceAvailability;
  source: AssessmentHistoryCognitiveDomainResultSummary | null;
  mappingVersion: string | null;
};

export function evaluateClinicalHistoryDomainSource(input: {
  instance: ClinicalHistoryScaleInstanceSource;
  scoreCandidates: readonly AssessmentHistoryScoreResultSummary[];
  scoreAvailability: HistorySourceAvailability;
  domainCandidates: readonly AssessmentHistoryCognitiveDomainResultSummary[];
}): ClinicalHistoryDomainSourceQualification {
  const domain = input.domainCandidates[0] ?? null;
  const mappingVersion = normalizedSourceText(
    domain?.versionTrace?.domainMappingVersion,
  );
  if (
    input.scoreCandidates.length !== 1 ||
    input.domainCandidates.length !== 1 ||
    !domain
  ) {
    return {
      availability: 'source_incomplete',
      source: domain,
      mappingVersion,
    };
  }
  const score = input.scoreCandidates[0];
  if (!domainSourceOwnershipMatches(input.instance, score, domain)) {
    return {
      availability: 'source_incomplete',
      source: domain,
      mappingVersion,
    };
  }
  if (domain.status === 'voided') {
    return {
      availability: 'source_voided',
      source: domain,
      mappingVersion,
    };
  }
  if (!['computed', 'confirmed', 'locked'].includes(domain.status)) {
    return {
      availability: 'source_not_final',
      source: domain,
      mappingVersion,
    };
  }
  const complete =
    input.scoreAvailability === 'available' &&
    domain.qualityStatus === 'passed' &&
    domain.voidedAt === null &&
    domain.mappingSource === 'scale_config' &&
    domain.mappingMode === 'item_domain_codes' &&
    Boolean(domain.computation) &&
    domain.computation?.warningCount === 0 &&
    domainSourceTraceMatches(input.instance, score, domain) &&
    Boolean(mappingVersion) &&
    mappingVersion ===
      normalizedSourceText(domain.mappingSnapshot?.mappingVersion) &&
    hasValidClinicalHistoryDomainScores(domain);
  return {
    availability: complete ? 'available' : 'source_incomplete',
    source: domain,
    mappingVersion,
  };
}
