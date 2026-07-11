import type {
  CognitiveDomainItemScoreStatus,
  CognitiveDomainMappingMode,
  CognitiveDomainMappingSource,
  CognitiveDomainQualityStatus,
  CognitiveDomainResultStatus,
  CognitiveDomainReviewStatus,
} from '../schemas/cognitive-domain-result.schema';

export type CognitiveDomainScaleResponse = {
  code: string;
  name: string;
  shortName?: string;
  version: string;
  displayVersion?: string;
};

export type CognitiveDomainScaleInstanceResponse = {
  id: string;
  instanceCode: string;
  scaleCode: string;
  scaleVersion: string;
  status: string;
  completedAt: Date | null;
  lockedAt: Date | null;
  voidedAt: Date | null;
};

export type CognitiveDomainSourceScoreResultResponse = {
  id: string;
  scoreResultCode?: string;
  runNo?: number;
  status?: string;
  confirmedAt?: Date | null;
  updatedAt?: Date;
};

export type CognitiveDomainScoreResponse = {
  domainCode: string;
  domainTitle?: string;
  scoreValue: number | null;
  minScore: number | null;
  maxScore: number | null;
  scorePercent: number | null;
  weightedScore: number | null;
  weightedMaxScore: number | null;
  itemCount: number;
  scoredItemCount: number;
  unscoredItemCount: number;
  missingItemCount: number;
  needsReviewItemCount: number;
  excludedItemCount: number;
};

export type CognitiveDomainItemContributionResponse = {
  itemResponseId: string | null;
  itemCode: string;
  crfCode?: string;
  groupCode?: string;
  itemTitle?: string;
  itemOrder: number;
  domainCode: string;
  domainTitle?: string;
  weight: number;
  countsTowardDomain: boolean;
  scoreValue: number | null;
  maxScore: number | null;
  weightedScore: number | null;
  weightedMaxScore: number | null;
  scoreStatus: CognitiveDomainItemScoreStatus;
  scoreSource?: string;
  isMissing: boolean;
};

export type CognitiveDomainMappingPolicyResponse = {
  strategy: 'full_item_score_per_domain';
  weight: 1;
  deduplicatePerItem: true;
  overlappingDomains: true;
};

export type CognitiveDomainMappingResponse = {
  mappingVersion: string | null;
  mappingSource: CognitiveDomainMappingSource;
  mappingMode: CognitiveDomainMappingMode;
  domainCodes: string[];
  policy: CognitiveDomainMappingPolicyResponse;
  interpretation: {
    attribution: 'overlapping_full_item_scores';
    domainScoresAreScaleTotalPartition: false;
    scorePercentIsDiagnosticProbability: false;
    isDiagnosticConclusion: false;
  };
};

export type CognitiveDomainComputationResponse = {
  computedAt: Date | null;
  ruleSetCode?: string;
  ruleSetVersion?: string;
  engineVersion?: string;
  inputItemCount: number;
  contributionCount: number;
  domainCount: number;
  includedContributionCount: number;
  excludedContributionCount: number;
  warningCount: number;
  warningCodes: string[];
};

export type CognitiveDomainReviewResponse = {
  reviewStatus: CognitiveDomainReviewStatus;
};

export type CognitiveDomainResultResponse = {
  id: string;
  domainResultCode: string;
  runNo: number;
  status: CognitiveDomainResultStatus;
  mappingSource: CognitiveDomainMappingSource;
  mappingMode: CognitiveDomainMappingMode;
  versionTrace: {
    scaleVersion?: string;
    crfVersion?: string;
    scoringRuleVersion?: string;
    fieldEncodingVersion?: string;
    domainMappingVersion?: string;
    sourceDocument?: string;
  } | null;
  domainScores: CognitiveDomainScoreResponse[];
  itemContributions: CognitiveDomainItemContributionResponse[];
  mapping: CognitiveDomainMappingResponse;
  computation: CognitiveDomainComputationResponse;
  review: CognitiveDomainReviewResponse;
  qualityStatus: CognitiveDomainQualityStatus;
  confirmedAt: Date | null;
  lockedAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  isFinal: boolean;
};

export type CognitiveDomainResultDetailResponse = {
  scale: CognitiveDomainScaleResponse;
  scaleInstance: CognitiveDomainScaleInstanceResponse;
  sourceScoreResult: CognitiveDomainSourceScoreResultResponse;
  cognitiveDomainResult: CognitiveDomainResultResponse;
};

export type ComputeCognitiveDomainResultResponse =
  CognitiveDomainResultDetailResponse & {
    alreadyComputed: boolean;
  };
