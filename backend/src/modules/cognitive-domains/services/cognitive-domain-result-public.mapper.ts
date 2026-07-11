import { Injectable } from '@nestjs/common';
import { A19_MAPPING_RULES } from '../lib/confirmed-score-domain-mapping';
import type {
  CognitiveDomainItemContributionSummary,
  CognitiveDomainResultSummary,
  CognitiveDomainScoreSummary,
} from './cognitive-domains.service';
import type {
  CognitiveDomainItemContributionResponse,
  CognitiveDomainResultResponse,
  CognitiveDomainScoreResponse,
} from '../types/cognitive-domain-result-response.types';

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegativeInteger(value: number | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

@Injectable()
export class CognitiveDomainResultPublicMapper {
  toPublicResult(
    result: CognitiveDomainResultSummary,
  ): CognitiveDomainResultResponse {
    const domainCodes = [
      ...new Set(
        (result.mappingSnapshot?.domainCodes ?? [])
          .map((code) => code.trim().toLowerCase())
          .filter(Boolean),
      ),
    ].sort((left, right) => left.localeCompare(right));
    const warningCount = nonNegativeInteger(result.computation?.warningCount);
    return {
      id: result.id,
      domainResultCode: result.domainResultCode,
      runNo: result.runNo,
      status: result.status,
      mappingSource: result.mappingSource,
      mappingMode: result.mappingMode,
      versionTrace: result.versionTrace
        ? {
            scaleVersion: result.versionTrace.scaleVersion,
            crfVersion: result.versionTrace.crfVersion,
            scoringRuleVersion: result.versionTrace.scoringRuleVersion,
            fieldEncodingVersion: result.versionTrace.fieldEncodingVersion,
            domainMappingVersion: result.versionTrace.domainMappingVersion,
            sourceDocument: result.versionTrace.sourceDocument,
          }
        : null,
      domainScores: result.domainScores
        .map((score) => this.mapDomainScore(score))
        .sort((left, right) => left.domainCode.localeCompare(right.domainCode)),
      itemContributions: result.itemContributions
        .map((contribution) => this.mapContribution(contribution))
        .sort(
          (left, right) =>
            left.itemOrder - right.itemOrder ||
            left.itemCode.localeCompare(right.itemCode) ||
            left.domainCode.localeCompare(right.domainCode),
        ),
      mapping: {
        mappingVersion: result.mappingSnapshot?.mappingVersion ?? null,
        mappingSource: result.mappingSource,
        mappingMode: result.mappingMode,
        domainCodes,
        policy: { ...A19_MAPPING_RULES },
        interpretation: {
          attribution: 'overlapping_full_item_scores',
          domainScoresAreScaleTotalPartition: false,
          scorePercentIsDiagnosticProbability: false,
          isDiagnosticConclusion: false,
        },
      },
      computation: {
        computedAt: result.computation?.computedAt ?? null,
        ruleSetCode: result.computation?.ruleSetCode,
        ruleSetVersion: result.computation?.ruleSetVersion,
        engineVersion: result.computation?.engineVersion,
        inputItemCount: nonNegativeInteger(result.computation?.inputItemCount),
        contributionCount: nonNegativeInteger(
          result.computation?.contributionCount,
        ),
        domainCount: nonNegativeInteger(result.computation?.domainCount),
        includedContributionCount: nonNegativeInteger(
          result.computation?.includedContributionCount,
        ),
        excludedContributionCount: nonNegativeInteger(
          result.computation?.excludedContributionCount,
        ),
        warningCount,
        warningCodes:
          warningCount > 0 ? ['COGNITIVE_DOMAIN_COMPUTATION_WARNING'] : [],
      },
      review: {
        reviewStatus: result.review?.reviewStatus ?? 'not_required',
      },
      qualityStatus: result.qualityStatus,
      confirmedAt: result.confirmedAt,
      lockedAt: result.lockedAt,
      voidedAt: result.voidedAt,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      isFinal: result.status === 'confirmed' || result.status === 'locked',
    };
  }

  private mapDomainScore(
    score: CognitiveDomainScoreSummary,
  ): CognitiveDomainScoreResponse {
    return {
      domainCode: score.domainCode.trim().toLowerCase(),
      domainTitle: score.domainTitle,
      scoreValue: finiteOrNull(score.scoreValue),
      minScore: finiteOrNull(score.minScore),
      maxScore: finiteOrNull(score.maxScore),
      scorePercent: finiteOrNull(score.scorePercent),
      weightedScore: finiteOrNull(score.weightedScore),
      weightedMaxScore: finiteOrNull(score.weightedMaxScore),
      itemCount: nonNegativeInteger(score.itemCount),
      scoredItemCount: nonNegativeInteger(score.scoredItemCount),
      unscoredItemCount: nonNegativeInteger(score.unscoredItemCount),
      missingItemCount: nonNegativeInteger(score.missingItemCount),
      needsReviewItemCount: nonNegativeInteger(score.needsReviewItemCount),
      excludedItemCount: nonNegativeInteger(score.excludedItemCount),
    };
  }

  private mapContribution(
    contribution: CognitiveDomainItemContributionSummary,
  ): CognitiveDomainItemContributionResponse {
    return {
      itemResponseId: contribution.itemResponseId ?? null,
      itemCode: contribution.itemCode.trim().toLowerCase(),
      crfCode: contribution.crfCode,
      groupCode: contribution.groupCode,
      itemTitle: contribution.itemTitle,
      itemOrder: contribution.itemOrder,
      domainCode: contribution.domainCode.trim().toLowerCase(),
      domainTitle: contribution.domainTitle,
      weight: finiteOrNull(contribution.weight) ?? 1,
      countsTowardDomain: contribution.countsTowardDomain,
      scoreValue: finiteOrNull(contribution.scoreValue),
      maxScore: finiteOrNull(contribution.maxScore),
      weightedScore: finiteOrNull(contribution.weightedScore),
      weightedMaxScore: finiteOrNull(contribution.weightedMaxScore),
      scoreStatus: contribution.scoreStatus,
      scoreSource: contribution.scoreSource,
      isMissing: contribution.isMissing,
    };
  }
}
