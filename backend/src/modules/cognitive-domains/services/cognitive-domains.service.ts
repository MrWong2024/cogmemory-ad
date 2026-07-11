// backend/src/modules/cognitive-domains/services/cognitive-domains.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CognitiveDomainComputationSnapshot,
  CognitiveDomainItemContributionSnapshot,
  CognitiveDomainItemScoreStatus,
  CognitiveDomainMappingMode,
  CognitiveDomainMappingRules,
  CognitiveDomainMappingSnapshot,
  CognitiveDomainMappingSource,
  CognitiveDomainQualityHints,
  CognitiveDomainQualityStatus,
  CognitiveDomainResult,
  CognitiveDomainResultDocument,
  CognitiveDomainResultMetadata,
  CognitiveDomainResultStatus,
  CognitiveDomainReviewSnapshot,
  CognitiveDomainReviewStatus,
  CognitiveDomainScoreSnapshot,
  CognitiveDomainVersionTrace,
} from '../schemas/cognitive-domain-result.schema';

export type CognitiveDomainVersionTraceSummary = {
  scaleVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  domainMappingVersion?: string;
  sourceDocument?: string;
};

export type CognitiveDomainScoreSummary = {
  domainCode: string;
  domainTitle?: string;
  scoreValue: number | null;
  maxScore: number | null;
  minScore: number | null;
  scorePercent: number | null;
  weightedScore: number | null;
  weightedMaxScore: number | null;
  itemCount: number;
  scoredItemCount: number;
  unscoredItemCount: number;
  missingItemCount: number;
  needsReviewItemCount: number;
  excludedItemCount: number;
  note?: string;
};

export type CognitiveDomainItemContributionSummary = {
  itemResponseId?: string | null;
  scoreResultId?: string | null;
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
  note?: string;
};

export type CognitiveDomainMappingSnapshotSummary = {
  mappingVersion?: string;
  mappingSource?: string;
  domainCodes: string[];
  mappingRules: CognitiveDomainMappingRules;
  notes?: string;
};

export type CognitiveDomainComputationSnapshotSummary = {
  computedAt: Date | null;
  computedBy: string | null;
  ruleSetCode?: string;
  ruleSetVersion?: string;
  engineVersion?: string;
  inputItemCount: number;
  contributionCount: number;
  domainCount: number;
  includedContributionCount: number;
  excludedContributionCount: number;
  warningCount: number;
  notes?: string;
};

export type CognitiveDomainReviewSummary = {
  reviewStatus: CognitiveDomainReviewStatus;
  reviewedAt: Date | null;
  reviewerId: string | null;
  reviewerName?: string;
  reviewNote?: string;
};

export type CognitiveDomainResultSummary = {
  id: string;
  patientId: string;
  assessmentVisitId: string;
  scaleInstanceId: string;
  scoreResultId: string;
  subjectCode: string;
  scaleDefinitionId: string;
  scaleVersionId: string;
  scaleCode: string;
  scaleVersion: string;
  instanceCode: string;
  domainResultCode: string;
  runNo: number;
  status: CognitiveDomainResultStatus;
  mappingSource: CognitiveDomainMappingSource;
  mappingMode: CognitiveDomainMappingMode;
  versionTrace: CognitiveDomainVersionTraceSummary | null;
  domainScores: CognitiveDomainScoreSummary[];
  itemContributions: CognitiveDomainItemContributionSummary[];
  mappingSnapshot: CognitiveDomainMappingSnapshotSummary | null;
  computation: CognitiveDomainComputationSnapshotSummary | null;
  review: CognitiveDomainReviewSummary | null;
  qualityStatus: CognitiveDomainQualityStatus;
  qualityHints: CognitiveDomainQualityHints;
  operatorNote?: string;
  metadata: CognitiveDomainResultMetadata;
  confirmedAt: Date | null;
  lockedAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CognitiveDomainMappingInput = {
  domainCode: string;
  domainTitle?: string;
  weight?: number;
  countsTowardDomain?: boolean;
};

export type CognitiveDomainItemInput = {
  itemCode: string;
  itemResponseId?: string;
  crfCode?: string;
  groupCode?: string;
  itemTitle?: string;
  itemOrder?: number;
  scoreValue?: number | null;
  minScore?: number | null;
  maxScore?: number | null;
  scoreStatus?: CognitiveDomainItemScoreStatus;
  scoreSource?: string;
  isMissing?: boolean;
  cognitiveDomainCodes?: string[];
  domainMappings?: CognitiveDomainMappingInput[];
  note?: string;
};

export type CognitiveDomainComputationWarning = {
  itemCode: string;
  domainCode?: string;
  field: 'domainCode' | 'scoreValue' | 'minScore' | 'maxScore' | 'weight';
  message: string;
};

export type CognitiveDomainComputationSummary = {
  domainScores: CognitiveDomainScoreSummary[];
  itemContributions: CognitiveDomainItemContributionSummary[];
  inputItemCount: number;
  contributionCount: number;
  domainCount: number;
  includedContributionCount: number;
  excludedContributionCount: number;
  scoredContributionCount: number;
  unscoredContributionCount: number;
  missingContributionCount: number;
  needsReviewContributionCount: number;
  warnings: CognitiveDomainComputationWarning[];
};

type CognitiveDomainAccumulator = {
  domainCode: string;
  domainTitle?: string;
  scoreValue: number;
  minScore: number;
  maxScore: number;
  hasScoreValue: boolean;
  hasMinScore: boolean;
  hasMaxScore: boolean;
  includedItemCount: number;
  includedMinScoreCount: number;
  includedUnscoredItemCount: number;
  itemCount: number;
  scoredItemCount: number;
  unscoredItemCount: number;
  missingItemCount: number;
  needsReviewItemCount: number;
  excludedItemCount: number;
};

export type CreateCognitiveDomainResultInput = {
  patientId: string;
  assessmentVisitId: string;
  scaleInstanceId: string;
  scoreResultId: string;
  subjectCode: string;
  scaleDefinitionId: string;
  scaleVersionId: string;
  scaleCode: string;
  scaleVersion: string;
  instanceCode: string;
  domainResultCode: string;
  runNo: 1;
  status: Extract<CognitiveDomainResultStatus, 'computed'>;
  mappingSource: Extract<CognitiveDomainMappingSource, 'scale_config'>;
  mappingMode: Extract<CognitiveDomainMappingMode, 'item_domain_codes'>;
  versionTrace: CognitiveDomainVersionTraceSummary;
  domainScores: CognitiveDomainScoreSummary[];
  itemContributions: CognitiveDomainItemContributionSummary[];
  mappingSnapshot: CognitiveDomainMappingSnapshotSummary;
  computation: CognitiveDomainComputationSnapshotSummary;
  review: Pick<CognitiveDomainReviewSummary, 'reviewStatus'>;
  qualityStatus: Extract<CognitiveDomainQualityStatus, 'unchecked'>;
};

@Injectable()
export class CognitiveDomainsService {
  constructor(
    @InjectModel(CognitiveDomainResult.name)
    private readonly cognitiveDomainResultModel: Model<CognitiveDomainResultDocument>,
  ) {}

  normalizeDomainResultCode(domainResultCode: string): string {
    return domainResultCode.trim().toUpperCase();
  }

  normalizeDomainCode(domainCode: string): string {
    return domainCode.trim().toLowerCase();
  }

  async findDomainResultByCode(
    domainResultCode: string,
  ): Promise<CognitiveDomainResultSummary | null> {
    const normalizedCode = this.normalizeDomainResultCode(domainResultCode);

    if (!normalizedCode) {
      return null;
    }

    const domainResult = await this.cognitiveDomainResultModel
      .findOne({ domainResultCode: normalizedCode })
      .exec();

    if (!domainResult) {
      return null;
    }

    return this.mapDomainResult(domainResult);
  }

  async findLatestDomainResultByScaleInstanceId(
    scaleInstanceId: Types.ObjectId | string,
  ): Promise<CognitiveDomainResultSummary | null> {
    const normalizedId = this.normalizeObjectId(scaleInstanceId);

    if (!normalizedId) {
      return null;
    }

    const domainResult = await this.cognitiveDomainResultModel
      .findOne({ scaleInstanceId: normalizedId })
      .sort({ runNo: -1, createdAt: -1 })
      .exec();

    if (!domainResult) {
      return null;
    }

    return this.mapDomainResult(domainResult);
  }

  async findDomainResultByScaleInstanceAndRunNo(
    scaleInstanceId: Types.ObjectId | string,
    runNo: number,
  ): Promise<CognitiveDomainResultSummary | null> {
    const normalizedId = this.normalizeObjectId(scaleInstanceId);
    if (!normalizedId || !Number.isInteger(runNo) || runNo < 1) {
      return null;
    }
    const domainResult = await this.cognitiveDomainResultModel
      .findOne({ scaleInstanceId: normalizedId, runNo })
      .exec();
    return domainResult ? this.mapDomainResult(domainResult) : null;
  }

  async createRunOneDomainResult(
    input: CreateCognitiveDomainResultInput,
  ): Promise<CognitiveDomainResultSummary> {
    const created = await this.cognitiveDomainResultModel.create({
      patientId: new Types.ObjectId(input.patientId),
      assessmentVisitId: new Types.ObjectId(input.assessmentVisitId),
      scaleInstanceId: new Types.ObjectId(input.scaleInstanceId),
      scoreResultId: new Types.ObjectId(input.scoreResultId),
      subjectCode: input.subjectCode,
      scaleDefinitionId: new Types.ObjectId(input.scaleDefinitionId),
      scaleVersionId: new Types.ObjectId(input.scaleVersionId),
      scaleCode: input.scaleCode,
      scaleVersion: input.scaleVersion,
      instanceCode: input.instanceCode,
      domainResultCode: input.domainResultCode,
      runNo: 1,
      status: input.status,
      mappingSource: input.mappingSource,
      mappingMode: input.mappingMode,
      versionTrace: input.versionTrace,
      domainScores: input.domainScores,
      itemContributions: input.itemContributions.map((contribution) => ({
        ...contribution,
        itemResponseId: contribution.itemResponseId
          ? new Types.ObjectId(contribution.itemResponseId)
          : null,
        scoreResultId: new Types.ObjectId(input.scoreResultId),
      })),
      mappingSnapshot: input.mappingSnapshot,
      computation: {
        ...input.computation,
        computedBy: input.computation.computedBy
          ? new Types.ObjectId(input.computation.computedBy)
          : null,
      },
      review: input.review,
      qualityStatus: input.qualityStatus,
    });
    return this.mapDomainResult(created);
  }

  async listDomainResultsByScaleInstanceId(
    scaleInstanceId: Types.ObjectId | string,
  ): Promise<CognitiveDomainResultSummary[]> {
    const normalizedId = this.normalizeObjectId(scaleInstanceId);

    if (!normalizedId) {
      return [];
    }

    const domainResults = await this.cognitiveDomainResultModel
      .find({ scaleInstanceId: normalizedId })
      .sort({ runNo: 1, createdAt: 1 })
      .exec();

    return domainResults.map((domainResult) =>
      this.mapDomainResult(domainResult),
    );
  }

  async listDomainResultsByScoreResultId(
    scoreResultId: Types.ObjectId | string,
  ): Promise<CognitiveDomainResultSummary[]> {
    const normalizedId = this.normalizeObjectId(scoreResultId);

    if (!normalizedId) {
      return [];
    }

    const domainResults = await this.cognitiveDomainResultModel
      .find({ scoreResultId: normalizedId })
      .sort({ runNo: 1, createdAt: 1 })
      .exec();

    return domainResults.map((domainResult) =>
      this.mapDomainResult(domainResult),
    );
  }

  async listDomainResultsByVisitId(
    assessmentVisitId: Types.ObjectId | string,
  ): Promise<CognitiveDomainResultSummary[]> {
    const normalizedId = this.normalizeObjectId(assessmentVisitId);

    if (!normalizedId) {
      return [];
    }

    const domainResults = await this.cognitiveDomainResultModel
      .find({ assessmentVisitId: normalizedId })
      .sort({ scaleCode: 1, createdAt: 1 })
      .exec();

    return domainResults.map((domainResult) =>
      this.mapDomainResult(domainResult),
    );
  }

  async listDomainResultsByPatientId(
    patientId: Types.ObjectId | string,
  ): Promise<CognitiveDomainResultSummary[]> {
    const normalizedId = this.normalizeObjectId(patientId);

    if (!normalizedId) {
      return [];
    }

    const domainResults = await this.cognitiveDomainResultModel
      .find({ patientId: normalizedId })
      .sort({ createdAt: -1 })
      .exec();

    return domainResults.map((domainResult) =>
      this.mapDomainResult(domainResult),
    );
  }

  summarizeDomainScores(
    items: CognitiveDomainItemInput[],
  ): CognitiveDomainComputationSummary {
    const warnings: CognitiveDomainComputationWarning[] = [];
    const domainMap = new Map<string, CognitiveDomainAccumulator>();
    const itemContributions: CognitiveDomainItemContributionSummary[] = [];
    let includedContributionCount = 0;
    let excludedContributionCount = 0;
    let scoredContributionCount = 0;
    let unscoredContributionCount = 0;
    let missingContributionCount = 0;
    let needsReviewContributionCount = 0;

    items.forEach((item, index) => {
      const itemCode = this.normalizeItemCode(item.itemCode);
      const scoreValue = this.toFiniteNumberOrNull(item.scoreValue);
      const minScore = this.toFiniteNumberOrNull(item.minScore);
      const maxScore = this.toFiniteNumberOrNull(item.maxScore);
      const scoreStatus = item.scoreStatus ?? 'not_scored';
      const isMissing = item.isMissing === true;
      const mappings = this.resolveDomainMappings(item);

      if (this.isNonFiniteNumber(item.scoreValue)) {
        warnings.push({
          itemCode,
          field: 'scoreValue',
          message: 'scoreValue is not a finite number.',
        });
      }

      if (this.isNonFiniteNumber(item.maxScore)) {
        warnings.push({
          itemCode,
          field: 'maxScore',
          message: 'maxScore is not a finite number.',
        });
      }

      if (this.isNonFiniteNumber(item.minScore)) {
        warnings.push({
          itemCode,
          field: 'minScore',
          message: 'minScore is not a finite number.',
        });
      }

      mappings.forEach((mapping) => {
        const domainCode = this.normalizeDomainCode(mapping.domainCode);

        if (!domainCode) {
          warnings.push({
            itemCode,
            field: 'domainCode',
            message: 'domainCode is empty after normalization.',
          });
          return;
        }

        const weight = this.resolveWeight(
          itemCode,
          domainCode,
          mapping,
          warnings,
        );
        const countsTowardDomain = mapping.countsTowardDomain !== false;
        const weightedScore = scoreValue !== null ? scoreValue * weight : null;
        const weightedMinScore = minScore !== null ? minScore * weight : null;
        const weightedMaxScore = maxScore !== null ? maxScore * weight : null;

        if (countsTowardDomain) {
          includedContributionCount += 1;
        } else {
          excludedContributionCount += 1;
        }

        if (scoreValue !== null) {
          scoredContributionCount += 1;
        } else {
          unscoredContributionCount += 1;
        }

        if (isMissing) {
          missingContributionCount += 1;
        }

        if (scoreStatus === 'needs_review') {
          needsReviewContributionCount += 1;
        }

        const domain = this.getOrCreateDomainAccumulator(
          domainMap,
          domainCode,
          mapping.domainTitle,
        );
        this.applyContributionToDomain(domain, {
          countsTowardDomain,
          scoreValue,
          minScore,
          maxScore,
          weightedScore,
          weightedMinScore,
          weightedMaxScore,
          scoreStatus,
          isMissing,
        });

        itemContributions.push({
          itemResponseId: this.normalizeOptionalString(item.itemResponseId),
          scoreResultId: null,
          itemCode,
          crfCode: item.crfCode,
          groupCode: this.normalizeOptionalCode(item.groupCode),
          itemTitle: item.itemTitle,
          itemOrder: item.itemOrder ?? index + 1,
          domainCode,
          domainTitle: mapping.domainTitle,
          weight,
          countsTowardDomain,
          scoreValue,
          maxScore,
          weightedScore,
          weightedMaxScore,
          scoreStatus,
          scoreSource: item.scoreSource,
          isMissing,
          note: item.note,
        });
      });
    });

    const domainScores = Array.from(domainMap.values())
      .map((domain) => this.mapDomainAccumulator(domain))
      .sort((left, right) => left.domainCode.localeCompare(right.domainCode));
    itemContributions.sort(
      (left, right) =>
        left.itemOrder - right.itemOrder ||
        left.itemCode.localeCompare(right.itemCode) ||
        left.domainCode.localeCompare(right.domainCode),
    );

    return {
      domainScores,
      itemContributions,
      inputItemCount: items.length,
      contributionCount: itemContributions.length,
      domainCount: domainScores.length,
      includedContributionCount,
      excludedContributionCount,
      scoredContributionCount,
      unscoredContributionCount,
      missingContributionCount,
      needsReviewContributionCount,
      warnings,
    };
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

  private normalizeItemCode(itemCode: string): string {
    return itemCode.trim().toLowerCase();
  }

  private normalizeOptionalCode(code?: string): string | undefined {
    if (!code) {
      return undefined;
    }

    const normalizedCode = code.trim().toLowerCase();

    return normalizedCode || undefined;
  }

  private normalizeOptionalString(value?: string): string | null {
    if (!value) {
      return null;
    }

    const normalizedValue = value.trim();

    return normalizedValue || null;
  }

  private isFiniteNumber(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private toFiniteNumberOrNull(
    value: number | null | undefined,
  ): number | null {
    return this.isFiniteNumber(value) ? value : null;
  }

  private isNonFiniteNumber(value: number | null | undefined): boolean {
    return typeof value === 'number' && !Number.isFinite(value);
  }

  private resolveDomainMappings(
    item: CognitiveDomainItemInput,
  ): CognitiveDomainMappingInput[] {
    if (item.domainMappings !== undefined) {
      return item.domainMappings;
    }

    return (item.cognitiveDomainCodes ?? []).map((domainCode) => ({
      domainCode,
      weight: 1,
      countsTowardDomain: true,
    }));
  }

  private resolveWeight(
    itemCode: string,
    domainCode: string,
    mapping: CognitiveDomainMappingInput,
    warnings: CognitiveDomainComputationWarning[],
  ): number {
    if (this.isFiniteNumber(mapping.weight)) {
      return mapping.weight;
    }

    if (this.isNonFiniteNumber(mapping.weight)) {
      warnings.push({
        itemCode,
        domainCode,
        field: 'weight',
        message: 'weight is not a finite number.',
      });
    }

    return 1;
  }

  private getOrCreateDomainAccumulator(
    domainMap: Map<string, CognitiveDomainAccumulator>,
    domainCode: string,
    domainTitle?: string,
  ): CognitiveDomainAccumulator {
    const existingDomain = domainMap.get(domainCode);

    if (existingDomain) {
      if (!existingDomain.domainTitle && domainTitle) {
        existingDomain.domainTitle = domainTitle;
      }

      return existingDomain;
    }

    const domain = {
      domainCode,
      domainTitle,
      scoreValue: 0,
      minScore: 0,
      maxScore: 0,
      hasScoreValue: false,
      hasMinScore: false,
      hasMaxScore: false,
      includedItemCount: 0,
      includedMinScoreCount: 0,
      includedUnscoredItemCount: 0,
      itemCount: 0,
      scoredItemCount: 0,
      unscoredItemCount: 0,
      missingItemCount: 0,
      needsReviewItemCount: 0,
      excludedItemCount: 0,
    };
    domainMap.set(domainCode, domain);

    return domain;
  }

  private applyContributionToDomain(
    domain: CognitiveDomainAccumulator,
    contribution: {
      countsTowardDomain: boolean;
      scoreValue: number | null;
      minScore: number | null;
      maxScore: number | null;
      weightedScore: number | null;
      weightedMinScore: number | null;
      weightedMaxScore: number | null;
      scoreStatus: CognitiveDomainItemScoreStatus;
      isMissing: boolean;
    },
  ): void {
    domain.itemCount += 1;

    if (contribution.scoreValue !== null) {
      domain.scoredItemCount += 1;
    } else {
      domain.unscoredItemCount += 1;
    }

    if (contribution.isMissing) {
      domain.missingItemCount += 1;
    }

    if (contribution.scoreStatus === 'needs_review') {
      domain.needsReviewItemCount += 1;
    }

    if (!contribution.countsTowardDomain) {
      domain.excludedItemCount += 1;
      return;
    }
    domain.includedItemCount += 1;

    if (contribution.scoreValue === null) {
      domain.includedUnscoredItemCount += 1;
    }

    if (contribution.weightedScore !== null) {
      domain.scoreValue += contribution.weightedScore;
      domain.hasScoreValue = true;
    }

    if (contribution.weightedMaxScore !== null) {
      domain.maxScore += contribution.weightedMaxScore;
      domain.hasMaxScore = true;
    }

    if (contribution.weightedMinScore !== null) {
      domain.minScore += contribution.weightedMinScore;
      domain.hasMinScore = true;
      domain.includedMinScoreCount += 1;
    }
  }

  private mapDomainAccumulator(
    domain: CognitiveDomainAccumulator,
  ): CognitiveDomainScoreSummary {
    const scoreValue = domain.hasScoreValue ? domain.scoreValue : null;
    const minScore = domain.hasMinScore ? domain.minScore : null;
    const maxScore = domain.hasMaxScore ? domain.maxScore : null;
    const completeNewRange =
      domain.includedItemCount > 0 &&
      domain.includedMinScoreCount === domain.includedItemCount;
    const scorePercent =
      scoreValue !== null &&
      maxScore !== null &&
      domain.includedUnscoredItemCount === 0
        ? completeNewRange && minScore !== null && maxScore > minScore
          ? Math.min(
              100,
              Math.max(
                0,
                ((scoreValue - minScore) / (maxScore - minScore)) * 100,
              ),
            )
          : domain.includedMinScoreCount === 0 && maxScore > 0
            ? (scoreValue / maxScore) * 100
            : null
        : null;

    return {
      domainCode: domain.domainCode,
      domainTitle: domain.domainTitle,
      scoreValue,
      maxScore,
      minScore,
      scorePercent,
      weightedScore: scoreValue,
      weightedMaxScore: maxScore,
      itemCount: domain.itemCount,
      scoredItemCount: domain.scoredItemCount,
      unscoredItemCount: domain.unscoredItemCount,
      missingItemCount: domain.missingItemCount,
      needsReviewItemCount: domain.needsReviewItemCount,
      excludedItemCount: domain.excludedItemCount,
    };
  }

  private mapDomainResult(
    domainResult: CognitiveDomainResultDocument,
  ): CognitiveDomainResultSummary {
    return {
      id: domainResult._id.toString(),
      patientId: domainResult.patientId.toString(),
      assessmentVisitId: domainResult.assessmentVisitId.toString(),
      scaleInstanceId: domainResult.scaleInstanceId.toString(),
      scoreResultId: domainResult.scoreResultId.toString(),
      subjectCode: domainResult.subjectCode,
      scaleDefinitionId: domainResult.scaleDefinitionId.toString(),
      scaleVersionId: domainResult.scaleVersionId.toString(),
      scaleCode: domainResult.scaleCode,
      scaleVersion: domainResult.scaleVersion,
      instanceCode: domainResult.instanceCode,
      domainResultCode: domainResult.domainResultCode,
      runNo: domainResult.runNo,
      status: domainResult.status,
      mappingSource: domainResult.mappingSource,
      mappingMode: domainResult.mappingMode,
      versionTrace: this.mapVersionTrace(domainResult.versionTrace),
      domainScores: (domainResult.domainScores ?? []).map((domainScore) =>
        this.mapDomainScore(domainScore),
      ),
      itemContributions: (domainResult.itemContributions ?? []).map(
        (contribution) => this.mapItemContribution(contribution),
      ),
      mappingSnapshot: this.mapMappingSnapshot(domainResult.mappingSnapshot),
      computation: this.mapComputation(domainResult.computation),
      review: this.mapReview(domainResult.review),
      qualityStatus: domainResult.qualityStatus,
      qualityHints: domainResult.qualityHints ?? null,
      operatorNote: domainResult.operatorNote,
      metadata: domainResult.metadata ?? null,
      confirmedAt: domainResult.confirmedAt ?? null,
      lockedAt: domainResult.lockedAt ?? null,
      voidedAt: domainResult.voidedAt ?? null,
      createdAt: this.readTimestamp(domainResult, 'createdAt'),
      updatedAt: this.readTimestamp(domainResult, 'updatedAt'),
    };
  }

  private readTimestamp(
    domainResult: CognitiveDomainResultDocument,
    path: 'createdAt' | 'updatedAt',
  ): Date {
    const candidate = domainResult as CognitiveDomainResultDocument & {
      createdAt?: unknown;
      updatedAt?: unknown;
      get?: (timestampPath: string) => unknown;
    };
    const value: unknown = candidate[path] ?? candidate.get?.(path);
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new Error(`CognitiveDomainResult ${path} is unavailable`);
    }
    return value;
  }

  private mapVersionTrace(
    versionTrace?: CognitiveDomainVersionTrace | null,
  ): CognitiveDomainVersionTraceSummary | null {
    if (!versionTrace) {
      return null;
    }

    return {
      scaleVersion: versionTrace.scaleVersion,
      crfVersion: versionTrace.crfVersion,
      scoringRuleVersion: versionTrace.scoringRuleVersion,
      fieldEncodingVersion: versionTrace.fieldEncodingVersion,
      domainMappingVersion: versionTrace.domainMappingVersion,
      sourceDocument: versionTrace.sourceDocument,
    };
  }

  private mapDomainScore(
    domainScore: CognitiveDomainScoreSnapshot,
  ): CognitiveDomainScoreSummary {
    return {
      domainCode: domainScore.domainCode,
      domainTitle: domainScore.domainTitle,
      scoreValue: domainScore.scoreValue ?? null,
      maxScore: domainScore.maxScore ?? null,
      minScore: domainScore.minScore ?? null,
      scorePercent: domainScore.scorePercent ?? null,
      weightedScore: domainScore.weightedScore ?? null,
      weightedMaxScore: domainScore.weightedMaxScore ?? null,
      itemCount: domainScore.itemCount,
      scoredItemCount: domainScore.scoredItemCount,
      unscoredItemCount: domainScore.unscoredItemCount,
      missingItemCount: domainScore.missingItemCount,
      needsReviewItemCount: domainScore.needsReviewItemCount,
      excludedItemCount: domainScore.excludedItemCount,
      note: domainScore.note,
    };
  }

  private mapItemContribution(
    contribution: CognitiveDomainItemContributionSnapshot,
  ): CognitiveDomainItemContributionSummary {
    return {
      itemResponseId: contribution.itemResponseId?.toString() ?? null,
      scoreResultId: contribution.scoreResultId?.toString() ?? null,
      itemCode: contribution.itemCode,
      crfCode: contribution.crfCode,
      groupCode: contribution.groupCode,
      itemTitle: contribution.itemTitle,
      itemOrder: contribution.itemOrder,
      domainCode: contribution.domainCode,
      domainTitle: contribution.domainTitle,
      weight: contribution.weight,
      countsTowardDomain: contribution.countsTowardDomain,
      scoreValue: contribution.scoreValue ?? null,
      maxScore: contribution.maxScore ?? null,
      weightedScore: contribution.weightedScore ?? null,
      weightedMaxScore: contribution.weightedMaxScore ?? null,
      scoreStatus: contribution.scoreStatus,
      scoreSource: contribution.scoreSource,
      isMissing: contribution.isMissing,
      note: contribution.note,
    };
  }

  private mapMappingSnapshot(
    mappingSnapshot?: CognitiveDomainMappingSnapshot | null,
  ): CognitiveDomainMappingSnapshotSummary | null {
    if (!mappingSnapshot) {
      return null;
    }

    return {
      mappingVersion: mappingSnapshot.mappingVersion,
      mappingSource: mappingSnapshot.mappingSource,
      domainCodes: [...(mappingSnapshot.domainCodes ?? [])],
      mappingRules: mappingSnapshot.mappingRules ?? null,
      notes: mappingSnapshot.notes,
    };
  }

  private mapComputation(
    computation?: CognitiveDomainComputationSnapshot | null,
  ): CognitiveDomainComputationSnapshotSummary | null {
    if (!computation) {
      return null;
    }

    return {
      computedAt: computation.computedAt ?? null,
      computedBy: computation.computedBy?.toString() ?? null,
      ruleSetCode: computation.ruleSetCode,
      ruleSetVersion: computation.ruleSetVersion,
      engineVersion: computation.engineVersion,
      inputItemCount: computation.inputItemCount,
      contributionCount: computation.contributionCount,
      domainCount: computation.domainCount,
      includedContributionCount: computation.includedContributionCount,
      excludedContributionCount: computation.excludedContributionCount,
      warningCount: computation.warningCount,
      notes: computation.notes,
    };
  }

  private mapReview(
    review?: CognitiveDomainReviewSnapshot | null,
  ): CognitiveDomainReviewSummary | null {
    if (!review) {
      return null;
    }

    return {
      reviewStatus: review.reviewStatus,
      reviewedAt: review.reviewedAt ?? null,
      reviewerId: review.reviewerId?.toString() ?? null,
      reviewerName: review.reviewerName,
      reviewNote: review.reviewNote,
    };
  }
}
