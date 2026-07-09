// backend/src/modules/scoring/services/scoring.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ScoreGroupSnapshot,
  ScoreItemSnapshot,
  ScoreItemSource,
  ScoreItemStatus,
  ScoreQualityHints,
  ScoreQualityStatus,
  ScoreResult,
  ScoreResultDocument,
  ScoreResultMetadata,
  ScoreResultStatus,
  ScoreReviewSnapshot,
  ScoreReviewStatus,
  ScoreVersionTrace,
  ScoringComputationSnapshot,
  ScoringMode,
  ScoringSource,
  TotalScoreSnapshot,
} from '../schemas/score-result.schema';

export type ScoreVersionTraceSummary = {
  scaleVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  sourceDocument?: string;
};

export type TotalScoreSummary = {
  scoreValue: number | null;
  maxScore: number | null;
  minScore: number | null;
  scorePercent: number | null;
  scoredItemCount: number;
  totalItemCount: number;
  unscoredItemCount: number;
  missingItemCount: number;
  needsReviewItemCount: number;
};

export type ScoreItemSummary = {
  itemResponseId?: string | null;
  itemCode: string;
  crfCode?: string;
  groupCode?: string;
  itemTitle?: string;
  itemOrder: number;
  responseType?: string;
  countsTowardTotal: boolean;
  includedInTotal: boolean;
  scoreValue: number | null;
  maxScore: number | null;
  minScore: number | null;
  scoreStatus: ScoreItemStatus;
  scoreSource: ScoreItemSource;
  isMissing: boolean;
  cognitiveDomainCodes: string[];
  note?: string;
};

export type ScoreGroupSummary = {
  groupCode: string;
  groupTitle?: string;
  scoreValue: number | null;
  maxScore: number | null;
  minScore: number | null;
  scoredItemCount: number;
  totalItemCount: number;
  note?: string;
};

export type ScoringComputationSnapshotSummary = {
  computedAt: Date | null;
  computedBy: string | null;
  ruleSetCode?: string;
  ruleSetVersion?: string;
  engineVersion?: string;
  inputItemCount: number;
  includedItemCount: number;
  excludedItemCount: number;
  warningCount: number;
  notes?: string;
};

export type ScoreReviewSummary = {
  reviewStatus: ScoreReviewStatus;
  reviewedAt: Date | null;
  reviewerId: string | null;
  reviewerName?: string;
  reviewNote?: string;
};

export type ScoreResultSummary = {
  id: string;
  patientId: string;
  assessmentVisitId: string;
  scaleInstanceId: string;
  subjectCode: string;
  scaleDefinitionId: string;
  scaleVersionId: string;
  scaleCode: string;
  scaleVersion: string;
  instanceCode: string;
  scoreResultCode: string;
  runNo: number;
  status: ScoreResultStatus;
  scoringSource: ScoringSource;
  scoringMode: ScoringMode;
  versionTrace: ScoreVersionTraceSummary | null;
  totalScore: TotalScoreSummary | null;
  itemScores: ScoreItemSummary[];
  groupScores: ScoreGroupSummary[];
  computation: ScoringComputationSnapshotSummary | null;
  review: ScoreReviewSummary | null;
  qualityStatus: ScoreQualityStatus;
  qualityHints: ScoreQualityHints;
  operatorNote?: string;
  metadata: ScoreResultMetadata;
  confirmedAt: Date | null;
  lockedAt: Date | null;
  voidedAt: Date | null;
};

export type ScoringItemInput = {
  itemCode: string;
  groupCode?: string;
  countsTowardTotal: boolean;
  isMissing?: boolean;
  scoreValue?: number | null;
  maxScore?: number | null;
  minScore?: number | null;
  scoreStatus?: ScoreItemStatus;
  scoreSource?: ScoreItemSource;
  itemOrder?: number;
  cognitiveDomainCodes?: string[];
  note?: string;
};

export type ScoringComputationWarning = {
  itemCode: string;
  field: 'scoreValue' | 'maxScore' | 'minScore';
  message: string;
};

export type ScoringComputationSummary = {
  totalScore: TotalScoreSummary;
  itemScores: ScoreItemSummary[];
  groupScores: ScoreGroupSummary[];
  inputItemCount: number;
  includedItemCount: number;
  excludedItemCount: number;
  scoredItemCount: number;
  unscoredItemCount: number;
  missingItemCount: number;
  needsReviewItemCount: number;
  warnings: ScoringComputationWarning[];
};

type ScoreGroupAccumulator = {
  groupCode: string;
  scoreValue: number;
  maxScore: number;
  minScore: number;
  hasScoreValue: boolean;
  hasMaxScore: boolean;
  hasMinScore: boolean;
  scoredItemCount: number;
  totalItemCount: number;
};

@Injectable()
export class ScoringService {
  constructor(
    @InjectModel(ScoreResult.name)
    private readonly scoreResultModel: Model<ScoreResultDocument>,
  ) {}

  normalizeScoreResultCode(scoreResultCode: string): string {
    return scoreResultCode.trim().toUpperCase();
  }

  async findScoreResultByCode(
    scoreResultCode: string,
  ): Promise<ScoreResultSummary | null> {
    const normalizedCode = this.normalizeScoreResultCode(scoreResultCode);

    if (!normalizedCode) {
      return null;
    }

    const scoreResult = await this.scoreResultModel
      .findOne({ scoreResultCode: normalizedCode })
      .exec();

    if (!scoreResult) {
      return null;
    }

    return this.mapScoreResult(scoreResult);
  }

  async findLatestScoreResultByScaleInstanceId(
    scaleInstanceId: Types.ObjectId | string,
  ): Promise<ScoreResultSummary | null> {
    const normalizedId = this.normalizeObjectId(scaleInstanceId);

    if (!normalizedId) {
      return null;
    }

    const scoreResult = await this.scoreResultModel
      .findOne({ scaleInstanceId: normalizedId })
      .sort({ runNo: -1, createdAt: -1 })
      .exec();

    if (!scoreResult) {
      return null;
    }

    return this.mapScoreResult(scoreResult);
  }

  async listScoreResultsByScaleInstanceId(
    scaleInstanceId: Types.ObjectId | string,
  ): Promise<ScoreResultSummary[]> {
    const normalizedId = this.normalizeObjectId(scaleInstanceId);

    if (!normalizedId) {
      return [];
    }

    const scoreResults = await this.scoreResultModel
      .find({ scaleInstanceId: normalizedId })
      .sort({ runNo: 1, createdAt: 1 })
      .exec();

    return scoreResults.map((scoreResult) => this.mapScoreResult(scoreResult));
  }

  async listScoreResultsByVisitId(
    assessmentVisitId: Types.ObjectId | string,
  ): Promise<ScoreResultSummary[]> {
    const normalizedId = this.normalizeObjectId(assessmentVisitId);

    if (!normalizedId) {
      return [];
    }

    const scoreResults = await this.scoreResultModel
      .find({ assessmentVisitId: normalizedId })
      .sort({ scaleCode: 1, createdAt: 1 })
      .exec();

    return scoreResults.map((scoreResult) => this.mapScoreResult(scoreResult));
  }

  async listScoreResultsByPatientId(
    patientId: Types.ObjectId | string,
  ): Promise<ScoreResultSummary[]> {
    const normalizedId = this.normalizeObjectId(patientId);

    if (!normalizedId) {
      return [];
    }

    const scoreResults = await this.scoreResultModel
      .find({ patientId: normalizedId })
      .sort({ createdAt: -1 })
      .exec();

    return scoreResults.map((scoreResult) => this.mapScoreResult(scoreResult));
  }

  summarizeItemScores(items: ScoringItemInput[]): ScoringComputationSummary {
    const warnings: ScoringComputationWarning[] = [];
    const groupMap = new Map<string, ScoreGroupAccumulator>();
    let totalScoreValue = 0;
    let totalMaxScore = 0;
    let totalMinScore = 0;
    let hasTotalScoreValue = false;
    let hasTotalMaxScore = false;
    let hasTotalMinScore = false;
    let includedItemCount = 0;
    let excludedItemCount = 0;
    let scoredItemCount = 0;
    let unscoredItemCount = 0;
    let missingItemCount = 0;
    let needsReviewItemCount = 0;

    const itemScores = items.map((item, index) => {
      const itemCode = this.normalizeItemCode(item.itemCode);
      const groupCode = this.normalizeOptionalGroupCode(item.groupCode);
      const countsTowardTotal = item.countsTowardTotal !== false;
      const isMissing = item.isMissing === true;
      const scoreValue = this.toFiniteNumberOrNull(item.scoreValue);
      const maxScore = this.toFiniteNumberOrNull(item.maxScore);
      const minScore = this.toFiniteNumberOrNull(item.minScore);
      const hasScoreValue = scoreValue !== null;
      const hasMaxScore = maxScore !== null;
      const hasMinScore = minScore !== null;
      const includedInTotal = countsTowardTotal && hasScoreValue;
      const scoreStatus = item.scoreStatus ?? 'not_scored';
      const scoreSource = item.scoreSource ?? 'none';

      if (countsTowardTotal) {
        includedItemCount += 1;
      } else {
        excludedItemCount += 1;
      }

      if (hasScoreValue) {
        scoredItemCount += 1;
      } else {
        unscoredItemCount += 1;
      }

      if (isMissing) {
        missingItemCount += 1;
      }

      if (scoreStatus === 'needs_review') {
        needsReviewItemCount += 1;
      }

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

      if (includedInTotal) {
        totalScoreValue += scoreValue;
        hasTotalScoreValue = true;
      }

      if (countsTowardTotal && hasMaxScore) {
        totalMaxScore += maxScore;
        hasTotalMaxScore = true;
      }

      if (countsTowardTotal && hasMinScore) {
        totalMinScore += minScore;
        hasTotalMinScore = true;
      }

      if (groupCode) {
        const group = this.getOrCreateGroupAccumulator(groupMap, groupCode);
        group.totalItemCount += 1;

        if (hasScoreValue) {
          group.scoreValue += scoreValue;
          group.hasScoreValue = true;
          group.scoredItemCount += 1;
        }

        if (hasMaxScore) {
          group.maxScore += maxScore;
          group.hasMaxScore = true;
        }

        if (hasMinScore) {
          group.minScore += minScore;
          group.hasMinScore = true;
        }
      }

      return {
        itemResponseId: null,
        itemCode,
        groupCode,
        itemOrder: item.itemOrder ?? index + 1,
        countsTowardTotal,
        includedInTotal,
        scoreValue,
        maxScore,
        minScore,
        scoreStatus,
        scoreSource,
        isMissing,
        cognitiveDomainCodes: [...(item.cognitiveDomainCodes ?? [])],
        note: item.note,
      };
    });

    const scoreValue = hasTotalScoreValue ? totalScoreValue : null;
    const maxScore = hasTotalMaxScore ? totalMaxScore : null;
    const minScore = hasTotalMinScore ? totalMinScore : null;

    return {
      totalScore: {
        scoreValue,
        maxScore,
        minScore,
        scorePercent:
          scoreValue !== null && maxScore !== null && maxScore > 0
            ? (scoreValue / maxScore) * 100
            : null,
        scoredItemCount,
        totalItemCount: items.length,
        unscoredItemCount,
        missingItemCount,
        needsReviewItemCount,
      },
      itemScores,
      groupScores: Array.from(groupMap.values()).map((group) => ({
        groupCode: group.groupCode,
        scoreValue: group.hasScoreValue ? group.scoreValue : null,
        maxScore: group.hasMaxScore ? group.maxScore : null,
        minScore: group.hasMinScore ? group.minScore : null,
        scoredItemCount: group.scoredItemCount,
        totalItemCount: group.totalItemCount,
      })),
      inputItemCount: items.length,
      includedItemCount,
      excludedItemCount,
      scoredItemCount,
      unscoredItemCount,
      missingItemCount,
      needsReviewItemCount,
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

  private normalizeOptionalGroupCode(groupCode?: string): string | undefined {
    if (!groupCode) {
      return undefined;
    }

    const normalizedCode = groupCode.trim().toLowerCase();

    return normalizedCode || undefined;
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

  private getOrCreateGroupAccumulator(
    groupMap: Map<string, ScoreGroupAccumulator>,
    groupCode: string,
  ): ScoreGroupAccumulator {
    const existingGroup = groupMap.get(groupCode);

    if (existingGroup) {
      return existingGroup;
    }

    const group = {
      groupCode,
      scoreValue: 0,
      maxScore: 0,
      minScore: 0,
      hasScoreValue: false,
      hasMaxScore: false,
      hasMinScore: false,
      scoredItemCount: 0,
      totalItemCount: 0,
    };
    groupMap.set(groupCode, group);

    return group;
  }

  private mapScoreResult(scoreResult: ScoreResultDocument): ScoreResultSummary {
    return {
      id: scoreResult._id.toString(),
      patientId: scoreResult.patientId.toString(),
      assessmentVisitId: scoreResult.assessmentVisitId.toString(),
      scaleInstanceId: scoreResult.scaleInstanceId.toString(),
      subjectCode: scoreResult.subjectCode,
      scaleDefinitionId: scoreResult.scaleDefinitionId.toString(),
      scaleVersionId: scoreResult.scaleVersionId.toString(),
      scaleCode: scoreResult.scaleCode,
      scaleVersion: scoreResult.scaleVersion,
      instanceCode: scoreResult.instanceCode,
      scoreResultCode: scoreResult.scoreResultCode,
      runNo: scoreResult.runNo,
      status: scoreResult.status,
      scoringSource: scoreResult.scoringSource,
      scoringMode: scoreResult.scoringMode,
      versionTrace: this.mapVersionTrace(scoreResult.versionTrace),
      totalScore: this.mapTotalScore(scoreResult.totalScore),
      itemScores: (scoreResult.itemScores ?? []).map((itemScore) =>
        this.mapItemScore(itemScore),
      ),
      groupScores: (scoreResult.groupScores ?? []).map((groupScore) =>
        this.mapGroupScore(groupScore),
      ),
      computation: this.mapComputation(scoreResult.computation),
      review: this.mapReview(scoreResult.review),
      qualityStatus: scoreResult.qualityStatus,
      qualityHints: scoreResult.qualityHints ?? null,
      operatorNote: scoreResult.operatorNote,
      metadata: scoreResult.metadata ?? null,
      confirmedAt: scoreResult.confirmedAt ?? null,
      lockedAt: scoreResult.lockedAt ?? null,
      voidedAt: scoreResult.voidedAt ?? null,
    };
  }

  private mapVersionTrace(
    versionTrace?: ScoreVersionTrace | null,
  ): ScoreVersionTraceSummary | null {
    if (!versionTrace) {
      return null;
    }

    return {
      scaleVersion: versionTrace.scaleVersion,
      crfVersion: versionTrace.crfVersion,
      scoringRuleVersion: versionTrace.scoringRuleVersion,
      fieldEncodingVersion: versionTrace.fieldEncodingVersion,
      sourceDocument: versionTrace.sourceDocument,
    };
  }

  private mapTotalScore(
    totalScore?: TotalScoreSnapshot | null,
  ): TotalScoreSummary | null {
    if (!totalScore) {
      return null;
    }

    return {
      scoreValue: totalScore.scoreValue ?? null,
      maxScore: totalScore.maxScore ?? null,
      minScore: totalScore.minScore ?? null,
      scorePercent: totalScore.scorePercent ?? null,
      scoredItemCount: totalScore.scoredItemCount,
      totalItemCount: totalScore.totalItemCount,
      unscoredItemCount: totalScore.unscoredItemCount,
      missingItemCount: totalScore.missingItemCount,
      needsReviewItemCount: totalScore.needsReviewItemCount,
    };
  }

  private mapItemScore(itemScore: ScoreItemSnapshot): ScoreItemSummary {
    return {
      itemResponseId: itemScore.itemResponseId?.toString() ?? null,
      itemCode: itemScore.itemCode,
      crfCode: itemScore.crfCode,
      groupCode: itemScore.groupCode,
      itemTitle: itemScore.itemTitle,
      itemOrder: itemScore.itemOrder,
      responseType: itemScore.responseType,
      countsTowardTotal: itemScore.countsTowardTotal,
      includedInTotal: itemScore.includedInTotal,
      scoreValue: itemScore.scoreValue ?? null,
      maxScore: itemScore.maxScore ?? null,
      minScore: itemScore.minScore ?? null,
      scoreStatus: itemScore.scoreStatus,
      scoreSource: itemScore.scoreSource,
      isMissing: itemScore.isMissing,
      cognitiveDomainCodes: [...(itemScore.cognitiveDomainCodes ?? [])],
      note: itemScore.note,
    };
  }

  private mapGroupScore(groupScore: ScoreGroupSnapshot): ScoreGroupSummary {
    return {
      groupCode: groupScore.groupCode,
      groupTitle: groupScore.groupTitle,
      scoreValue: groupScore.scoreValue ?? null,
      maxScore: groupScore.maxScore ?? null,
      minScore: groupScore.minScore ?? null,
      scoredItemCount: groupScore.scoredItemCount,
      totalItemCount: groupScore.totalItemCount,
      note: groupScore.note,
    };
  }

  private mapComputation(
    computation?: ScoringComputationSnapshot | null,
  ): ScoringComputationSnapshotSummary | null {
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
      includedItemCount: computation.includedItemCount,
      excludedItemCount: computation.excludedItemCount,
      warningCount: computation.warningCount,
      notes: computation.notes,
    };
  }

  private mapReview(
    review?: ScoreReviewSnapshot | null,
  ): ScoreReviewSummary | null {
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
