export type CognitiveDomainResultStatus =
  | 'draft'
  | 'computed'
  | 'needs_review'
  | 'confirmed'
  | 'locked'
  | 'voided';

export type CognitiveDomainMappingSource =
  | 'scale_config'
  | 'manual'
  | 'imported'
  | 'mixed';

export type CognitiveDomainMappingMode =
  | 'item_domain_codes'
  | 'weighted_mapping'
  | 'manual_summary'
  | 'imported';

export type CognitiveDomainItemScoreStatus =
  | 'not_scored'
  | 'auto_scored'
  | 'manual_scored'
  | 'needs_review';

export type CognitiveDomainReviewStatus =
  | 'not_required'
  | 'pending'
  | 'reviewed'
  | 'rejected';

export type CognitiveDomainQualityStatus =
  | 'unchecked'
  | 'passed'
  | 'needs_review'
  | 'failed';

export type CognitiveDomainScale = {
  code: string;
  name: string;
  shortName?: string;
  version: string;
  displayVersion?: string;
};

export type CognitiveDomainScaleInstance = {
  id: string;
  instanceCode: string;
  scaleCode: string;
  scaleVersion: string;
  status: string;
  completedAt: string | null;
  lockedAt: string | null;
  voidedAt: string | null;
};

export type CognitiveDomainSourceScoreResult = {
  id: string;
  scoreResultCode?: string;
  runNo?: number;
  status?: string;
  confirmedAt?: string | null;
  updatedAt?: string;
};

export type CognitiveDomainScore = {
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

export type CognitiveDomainItemContribution = {
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

export type CognitiveDomainMappingPolicy = {
  strategy: 'full_item_score_per_domain';
  weight: 1;
  deduplicatePerItem: true;
  overlappingDomains: true;
};

export type CognitiveDomainMappingInterpretation = {
  attribution: 'overlapping_full_item_scores';
  domainScoresAreScaleTotalPartition: false;
  scorePercentIsDiagnosticProbability: false;
  isDiagnosticConclusion: false;
};

export type CognitiveDomainMapping = {
  mappingVersion: string | null;
  mappingSource: CognitiveDomainMappingSource;
  mappingMode: CognitiveDomainMappingMode;
  domainCodes: string[];
  policy: CognitiveDomainMappingPolicy;
  interpretation: CognitiveDomainMappingInterpretation;
};

export type CognitiveDomainComputation = {
  computedAt: string | null;
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

export type CognitiveDomainReview = {
  reviewStatus: CognitiveDomainReviewStatus;
};

export type CognitiveDomainVersionTrace = {
  scaleVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  domainMappingVersion?: string;
  sourceDocument?: string;
};

export type CognitiveDomainResult = {
  id: string;
  domainResultCode: string;
  runNo: number;
  status: CognitiveDomainResultStatus;
  mappingSource: CognitiveDomainMappingSource;
  mappingMode: CognitiveDomainMappingMode;
  versionTrace: CognitiveDomainVersionTrace | null;
  domainScores: CognitiveDomainScore[];
  itemContributions: CognitiveDomainItemContribution[];
  mapping: CognitiveDomainMapping;
  computation: CognitiveDomainComputation;
  review: CognitiveDomainReview;
  qualityStatus: CognitiveDomainQualityStatus;
  confirmedAt: string | null;
  lockedAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isFinal: boolean;
};

export type CognitiveDomainResultDetailResponse = {
  scale: CognitiveDomainScale;
  scaleInstance: CognitiveDomainScaleInstance;
  sourceScoreResult: CognitiveDomainSourceScoreResult;
  cognitiveDomainResult: CognitiveDomainResult;
};

export type ComputeCognitiveDomainResultRequest = {
  confirm: true;
};

export type ComputeCognitiveDomainResultResponse =
  CognitiveDomainResultDetailResponse & {
    alreadyComputed: boolean;
  };
