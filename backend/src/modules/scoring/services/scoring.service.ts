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
  createdAt: Date;
  updatedAt: Date;
};

export type AssessmentHistoryScoreResultSummary = Pick<
  ScoreResultSummary,
  | 'id'
  | 'patientId'
  | 'assessmentVisitId'
  | 'scaleInstanceId'
  | 'scaleCode'
  | 'runNo'
  | 'status'
  | 'versionTrace'
  | 'totalScore'
  | 'review'
  | 'qualityStatus'
  | 'confirmedAt'
  | 'lockedAt'
  | 'voidedAt'
>;

type AssessmentHistoryScoreResultLean = {
  _id: Types.ObjectId;
  patientId: Types.ObjectId;
  assessmentVisitId: Types.ObjectId;
  scaleInstanceId: Types.ObjectId;
  scaleCode: string;
  runNo: number;
  status: ScoreResultStatus;
  versionTrace?: ScoreVersionTrace | null;
  totalScore?: TotalScoreSnapshot | null;
  review?: ScoreReviewSnapshot | null;
  qualityStatus: ScoreQualityStatus;
  confirmedAt?: Date | null;
  lockedAt?: Date | null;
  voidedAt?: Date | null;
};

export type ScoreResultSourceFreezeItem = {
  id: string;
  patientId: string;
  assessmentVisitId: string;
  scaleInstanceId: string;
  status: ScoreResultStatus;
  lockedAt: Date | null;
};

export type ScoreResultSourceFreezeBatchResult = {
  requestedCount: number;
  matchedCount: number;
  newlyFrozenCount: number;
  previouslyFrozenCount: number;
  invalidCount: number;
  items: ScoreResultSourceFreezeItem[];
};

export type ScoringItemInput = {
  itemResponseId?: string | null;
  itemCode: string;
  crfCode?: string;
  groupCode?: string;
  itemTitle?: string;
  responseType?: string;
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

export type SummarizeItemScoresOptions = {
  provisional?: boolean;
};

export type CreateScoreResultInput = {
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
  runNo: 1;
  status: Extract<ScoreResultStatus, 'computed' | 'needs_review'>;
  scoringSource: ScoringSource;
  scoringMode: Extract<ScoringMode, 'rule_based'>;
  versionTrace: ScoreVersionTraceSummary;
  totalScore: TotalScoreSummary;
  itemScores: ScoreItemSummary[];
  groupScores: ScoreGroupSummary[];
  computation: Omit<ScoringComputationSnapshotSummary, 'computedBy'>;
  review: Pick<ScoreReviewSummary, 'reviewStatus'>;
  qualityStatus: Extract<ScoreQualityStatus, 'unchecked' | 'needs_review'>;
};

export type ScoreResultOwnershipInput = {
  scoreResultId: string;
  patientId: string;
  assessmentVisitId: string;
  scaleInstanceId: string;
};

export type ReviewScoreItemAtomicInput = ScoreResultOwnershipInput & {
  expectedUpdatedAt: Date;
  itemScores: ScoreItemSummary[];
  groupScores: ScoreGroupSummary[];
  totalScore: TotalScoreSummary;
  status: Extract<ScoreResultStatus, 'computed' | 'needs_review'>;
  scoringSource: Extract<ScoringSource, 'auto_rule' | 'mixed' | 'manual'>;
  review: ScoreReviewSummary;
  qualityStatus: Extract<ScoreQualityStatus, 'unchecked' | 'needs_review'>;
  metadata: Exclude<ScoreResultMetadata, null>;
};

export type ConfirmScoreResultAtomicInput = ScoreResultOwnershipInput & {
  expectedUpdatedAt: Date;
  confirmedAt: Date;
  totalScore: TotalScoreSummary;
  groupScores: ScoreGroupSummary[];
  review: ScoreReviewSummary;
  metadata: Exclude<ScoreResultMetadata, null>;
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

  async findScoreResultByScaleInstanceAndRunNo(
    scaleInstanceId: Types.ObjectId | string,
    runNo: number,
  ): Promise<ScoreResultSummary | null> {
    const normalizedId = this.normalizeObjectId(scaleInstanceId);

    if (!normalizedId || !Number.isInteger(runNo) || runNo < 1) {
      return null;
    }

    const scoreResult = await this.scoreResultModel
      .findOne({ scaleInstanceId: normalizedId, runNo })
      .exec();

    return scoreResult ? this.mapScoreResult(scoreResult) : null;
  }

  async findScoreResultByOwnership(
    input: ScoreResultOwnershipInput,
  ): Promise<ScoreResultSummary | null> {
    const scoreResultId = this.normalizeObjectId(input.scoreResultId);
    const patientId = this.normalizeObjectId(input.patientId);
    const assessmentVisitId = this.normalizeObjectId(input.assessmentVisitId);
    const scaleInstanceId = this.normalizeObjectId(input.scaleInstanceId);
    if (
      !scoreResultId ||
      !patientId ||
      !assessmentVisitId ||
      !scaleInstanceId
    ) {
      return null;
    }
    const scoreResult = await this.scoreResultModel
      .findOne({
        _id: scoreResultId,
        patientId,
        assessmentVisitId,
        scaleInstanceId,
        runNo: 1,
      })
      .exec();
    return scoreResult ? this.mapScoreResult(scoreResult) : null;
  }

  async listScoreResultsByIds(
    patientId: Types.ObjectId | string,
    assessmentVisitId: Types.ObjectId | string,
    scaleInstanceIds: readonly string[],
    scoreResultIds: readonly string[],
  ): Promise<ScoreResultSummary[]> {
    const normalizedPatientId = this.normalizeObjectId(patientId);
    const normalizedVisitId = this.normalizeObjectId(assessmentVisitId);
    const normalizedScaleIds = this.normalizeObjectIds(scaleInstanceIds);
    const normalizedResultIds = this.normalizeObjectIds(scoreResultIds);
    if (
      !normalizedPatientId ||
      !normalizedVisitId ||
      !normalizedScaleIds ||
      !normalizedResultIds
    ) {
      return [];
    }
    const results = await this.scoreResultModel
      .find({
        _id: { $in: normalizedResultIds },
        patientId: normalizedPatientId,
        assessmentVisitId: normalizedVisitId,
        scaleInstanceId: { $in: normalizedScaleIds },
      })
      .sort({ _id: 1 })
      .exec();
    return results.map((result) => this.mapScoreResult(result));
  }

  async listAssessmentHistoryScoreResults(
    patientId: Types.ObjectId | string,
    visitIds: readonly string[],
    scaleInstanceIds: readonly string[],
  ): Promise<AssessmentHistoryScoreResultSummary[]> {
    const normalizedPatientId = this.normalizeObjectId(patientId);
    const normalizedVisitIds = this.normalizeObjectIds(visitIds);
    const normalizedScaleIds = this.normalizeObjectIds(scaleInstanceIds);
    if (
      !normalizedPatientId ||
      !normalizedVisitIds ||
      !normalizedScaleIds ||
      normalizedVisitIds.length === 0 ||
      normalizedScaleIds.length === 0
    ) {
      return [];
    }
    const results = await this.scoreResultModel
      .find({
        patientId: normalizedPatientId,
        assessmentVisitId: { $in: normalizedVisitIds },
        scaleInstanceId: { $in: normalizedScaleIds },
        runNo: 1,
      })
      .select({
        _id: 1,
        patientId: 1,
        assessmentVisitId: 1,
        scaleInstanceId: 1,
        scaleCode: 1,
        runNo: 1,
        status: 1,
        versionTrace: 1,
        totalScore: 1,
        review: 1,
        qualityStatus: 1,
        confirmedAt: 1,
        lockedAt: 1,
        voidedAt: 1,
      })
      .sort({ _id: 1 })
      .lean<AssessmentHistoryScoreResultLean[]>()
      .exec();
    return results.map((result) => ({
      id: result._id.toString(),
      patientId: result.patientId.toString(),
      assessmentVisitId: result.assessmentVisitId.toString(),
      scaleInstanceId: result.scaleInstanceId.toString(),
      scaleCode: result.scaleCode,
      runNo: result.runNo,
      status: result.status,
      versionTrace: result.versionTrace
        ? {
            scaleVersion: result.versionTrace.scaleVersion,
            crfVersion: result.versionTrace.crfVersion,
            scoringRuleVersion: result.versionTrace.scoringRuleVersion,
            fieldEncodingVersion: result.versionTrace.fieldEncodingVersion,
            sourceDocument: result.versionTrace.sourceDocument,
          }
        : null,
      totalScore: result.totalScore
        ? {
            scoreValue: result.totalScore.scoreValue ?? null,
            maxScore: result.totalScore.maxScore ?? null,
            minScore: result.totalScore.minScore ?? null,
            scorePercent: result.totalScore.scorePercent ?? null,
            scoredItemCount: result.totalScore.scoredItemCount,
            totalItemCount: result.totalScore.totalItemCount,
            unscoredItemCount: result.totalScore.unscoredItemCount,
            missingItemCount: result.totalScore.missingItemCount,
            needsReviewItemCount: result.totalScore.needsReviewItemCount,
          }
        : null,
      review: result.review
        ? {
            reviewStatus: result.review.reviewStatus,
            reviewedAt: result.review.reviewedAt ?? null,
            reviewerId: result.review.reviewerId?.toString() ?? null,
            reviewerName: result.review.reviewerName,
            reviewNote: result.review.reviewNote,
          }
        : null,
      qualityStatus: result.qualityStatus,
      confirmedAt: result.confirmedAt ?? null,
      lockedAt: result.lockedAt ?? null,
      voidedAt: result.voidedAt ?? null,
    }));
  }

  async freezeScoreResultsByIds(
    patientId: Types.ObjectId | string,
    assessmentVisitId: Types.ObjectId | string,
    scaleInstanceIds: readonly string[],
    scoreResultIds: readonly string[],
    sourceLockedAt: Date,
  ): Promise<ScoreResultSourceFreezeBatchResult> {
    const normalizedPatientId = this.normalizeObjectId(patientId);
    const normalizedVisitId = this.normalizeObjectId(assessmentVisitId);
    const normalizedScaleIds = this.normalizeObjectIds(scaleInstanceIds);
    const normalizedResultIds = this.normalizeObjectIds(scoreResultIds);
    if (
      !normalizedPatientId ||
      !normalizedVisitId ||
      !normalizedScaleIds ||
      !normalizedResultIds ||
      !Number.isFinite(sourceLockedAt.getTime())
    ) {
      return this.emptySourceFreezeResult(scoreResultIds.length);
    }
    const before = await this.scoreResultModel
      .find({
        _id: { $in: normalizedResultIds },
        patientId: normalizedPatientId,
        assessmentVisitId: normalizedVisitId,
        scaleInstanceId: { $in: normalizedScaleIds },
        runNo: 1,
      })
      .exec();
    const previouslyFrozenCount = before.filter(
      (item) => item.status === 'locked' && item.lockedAt instanceof Date,
    ).length;
    const updateResult = await this.scoreResultModel
      .updateMany(
        {
          _id: { $in: normalizedResultIds },
          patientId: normalizedPatientId,
          assessmentVisitId: normalizedVisitId,
          scaleInstanceId: { $in: normalizedScaleIds },
          runNo: 1,
          status: 'confirmed',
          lockedAt: null,
          voidedAt: null,
        },
        { $set: { status: 'locked', lockedAt: sourceLockedAt } },
        { runValidators: true },
      )
      .exec();
    const after = await this.scoreResultModel
      .find({
        _id: { $in: normalizedResultIds },
        patientId: normalizedPatientId,
        assessmentVisitId: normalizedVisitId,
        scaleInstanceId: { $in: normalizedScaleIds },
        runNo: 1,
      })
      .sort({ _id: 1 })
      .exec();
    const items = after.map((item) => ({
      id: item._id.toString(),
      patientId: item.patientId.toString(),
      assessmentVisitId: item.assessmentVisitId.toString(),
      scaleInstanceId: item.scaleInstanceId.toString(),
      status: item.status,
      lockedAt: item.lockedAt ?? null,
    }));
    const validCount = items.filter(
      (item) => item.status === 'locked' && item.lockedAt !== null,
    ).length;
    return {
      requestedCount: normalizedResultIds.length,
      matchedCount: items.length,
      newlyFrozenCount: updateResult.modifiedCount,
      previouslyFrozenCount,
      invalidCount: normalizedResultIds.length - validCount,
      items,
    };
  }

  async reviewScoreItemIfUnmodified(
    input: ReviewScoreItemAtomicInput,
  ): Promise<ScoreResultSummary | null> {
    const ownership = this.normalizeScoreResultOwnership(input);
    if (!ownership || !Number.isFinite(input.expectedUpdatedAt.getTime())) {
      return null;
    }
    const updated = await this.scoreResultModel
      .findOneAndUpdate(
        {
          ...ownership,
          runNo: 1,
          status: { $in: ['needs_review', 'computed'] },
          lockedAt: null,
          updatedAt: input.expectedUpdatedAt,
        },
        {
          $set: {
            itemScores: input.itemScores.map((item) => ({
              ...item,
              itemResponseId: item.itemResponseId
                ? new Types.ObjectId(item.itemResponseId)
                : null,
            })),
            groupScores: input.groupScores,
            totalScore: input.totalScore,
            status: input.status,
            scoringSource: input.scoringSource,
            review: input.review,
            qualityStatus: input.qualityStatus,
            metadata: input.metadata,
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    return updated ? this.mapScoreResult(updated) : null;
  }

  async confirmScoreResultIfUnmodified(
    input: ConfirmScoreResultAtomicInput,
  ): Promise<ScoreResultSummary | null> {
    const ownership = this.normalizeScoreResultOwnership(input);
    if (!ownership || !Number.isFinite(input.expectedUpdatedAt.getTime())) {
      return null;
    }
    const updated = await this.scoreResultModel
      .findOneAndUpdate(
        {
          ...ownership,
          runNo: 1,
          status: 'computed',
          lockedAt: null,
          updatedAt: input.expectedUpdatedAt,
        },
        {
          $set: {
            status: 'confirmed',
            confirmedAt: input.confirmedAt,
            totalScore: input.totalScore,
            groupScores: input.groupScores,
            review: input.review,
            qualityStatus: 'passed',
            metadata: input.metadata,
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    return updated ? this.mapScoreResult(updated) : null;
  }

  async createScoreResult(
    input: CreateScoreResultInput,
  ): Promise<ScoreResultSummary> {
    const created = await this.scoreResultModel.create({
      patientId: new Types.ObjectId(input.patientId),
      assessmentVisitId: new Types.ObjectId(input.assessmentVisitId),
      scaleInstanceId: new Types.ObjectId(input.scaleInstanceId),
      subjectCode: input.subjectCode,
      scaleDefinitionId: new Types.ObjectId(input.scaleDefinitionId),
      scaleVersionId: new Types.ObjectId(input.scaleVersionId),
      scaleCode: input.scaleCode,
      scaleVersion: input.scaleVersion,
      instanceCode: input.instanceCode,
      scoreResultCode: input.scoreResultCode,
      runNo: input.runNo,
      status: input.status,
      scoringSource: input.scoringSource,
      scoringMode: input.scoringMode,
      versionTrace: input.versionTrace,
      totalScore: input.totalScore,
      itemScores: input.itemScores.map((item) => ({
        ...item,
        itemResponseId: item.itemResponseId
          ? new Types.ObjectId(item.itemResponseId)
          : null,
      })),
      groupScores: input.groupScores,
      computation: input.computation,
      review: input.review,
      qualityStatus: input.qualityStatus,
    });

    return this.mapScoreResult(created);
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

  summarizeItemScores(
    items: ScoringItemInput[],
    options: SummarizeItemScoresOptions = {},
  ): ScoringComputationSummary {
    const provisional = options.provisional === true;
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

      if (hasScoreValue && (!provisional || countsTowardTotal)) {
        scoredItemCount += 1;
      } else if (!provisional || countsTowardTotal) {
        unscoredItemCount += 1;
      }

      if (isMissing && (!provisional || countsTowardTotal)) {
        missingItemCount += 1;
      }

      if (
        scoreStatus === 'needs_review' &&
        (!provisional || countsTowardTotal)
      ) {
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

      if (groupCode && (!provisional || countsTowardTotal)) {
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
        itemResponseId: item.itemResponseId ?? null,
        itemCode,
        crfCode: item.crfCode,
        groupCode,
        itemTitle: item.itemTitle,
        itemOrder: item.itemOrder ?? index + 1,
        responseType: item.responseType,
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
          scoreValue !== null &&
          maxScore !== null &&
          maxScore > 0 &&
          (!provisional ||
            (unscoredItemCount === 0 && needsReviewItemCount === 0))
            ? (scoreValue / maxScore) * 100
            : null,
        scoredItemCount,
        totalItemCount: provisional ? includedItemCount : items.length,
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

  private normalizeObjectIds(ids: readonly string[]): Types.ObjectId[] | null {
    const result: Types.ObjectId[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const normalized = this.normalizeObjectId(id);
      if (!normalized || seen.has(normalized.toString())) {
        return null;
      }
      seen.add(normalized.toString());
      result.push(normalized);
    }
    return result;
  }

  private emptySourceFreezeResult(
    requestedCount: number,
  ): ScoreResultSourceFreezeBatchResult {
    return {
      requestedCount,
      matchedCount: 0,
      newlyFrozenCount: 0,
      previouslyFrozenCount: 0,
      invalidCount: requestedCount,
      items: [],
    };
  }

  private normalizeScoreResultOwnership(input: ScoreResultOwnershipInput): {
    _id: Types.ObjectId;
    patientId: Types.ObjectId;
    assessmentVisitId: Types.ObjectId;
    scaleInstanceId: Types.ObjectId;
  } | null {
    const scoreResultId = this.normalizeObjectId(input.scoreResultId);
    const patientId = this.normalizeObjectId(input.patientId);
    const assessmentVisitId = this.normalizeObjectId(input.assessmentVisitId);
    const scaleInstanceId = this.normalizeObjectId(input.scaleInstanceId);
    return scoreResultId && patientId && assessmentVisitId && scaleInstanceId
      ? {
          _id: scoreResultId,
          patientId,
          assessmentVisitId,
          scaleInstanceId,
        }
      : null;
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
      createdAt: this.readTimestamp(scoreResult, 'createdAt'),
      updatedAt: this.readTimestamp(scoreResult, 'updatedAt'),
    };
  }

  private readTimestamp(
    scoreResult: ScoreResultDocument,
    path: 'createdAt' | 'updatedAt',
  ): Date {
    const candidate = scoreResult as ScoreResultDocument & {
      createdAt?: unknown;
      updatedAt?: unknown;
      get?: (timestampPath: string) => unknown;
    };
    const value: unknown = candidate[path] ?? candidate.get?.(path);
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new Error(`ScoreResult ${path} is unavailable`);
    }
    return value;
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
