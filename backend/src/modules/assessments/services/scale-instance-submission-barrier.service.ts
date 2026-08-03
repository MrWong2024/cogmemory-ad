import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  buildStableItemResponseScope,
  itemResponseScopesEqual,
  normalizeItemResponseSubmissionWriteBarrier,
  SCALE_INSTANCE_SUBMISSION_BARRIER_VERSION,
  type NormalizedScaleInstanceSubmissionWriteBarrier,
} from '../lib/scale-instance-submission-write-barrier';
import {
  ItemResponse,
  type ItemResponseDocument,
} from '../schemas/item-response.schema';
import {
  ScaleInstance,
  type ScaleInstanceDocument,
} from '../schemas/scale-instance.schema';
import type { ScaleSubmissionReadinessSummaryResponse } from '../types/scale-instance-submission-response.types';

export class ScaleInstanceSubmissionBarrierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ScaleInstanceSubmissionBarrierError.name;
  }
}

export type CreateSubmissionBarrierInput = {
  patientId: string;
  assessmentVisitId: string;
  scaleInstanceId: string;
  barrierId: string;
  startedAt: Date;
  startedBy: string;
  startedByName: string;
  startedByRole: NormalizedScaleInstanceSubmissionWriteBarrier['startedByRole'];
  itemResponseIds: readonly string[];
};

export type CompleteSubmissionBarrierInput = {
  patientId: string;
  assessmentVisitId: string;
  scaleInstanceId: string;
  barrier: NormalizedScaleInstanceSubmissionWriteBarrier;
  completionTime: Date;
  startedAtToSet?: Date;
  durationMs: number | null;
  readinessSummary: Pick<
    ScaleSubmissionReadinessSummaryResponse,
    | 'expectedItemCount'
    | 'actualItemCount'
    | 'completedItemCount'
    | 'blockingIssueCount'
    | 'warningCount'
  >;
};

type NormalizedOwnership = {
  patientId: Types.ObjectId;
  assessmentVisitId: Types.ObjectId;
  scaleInstanceId: Types.ObjectId;
};

@Injectable()
export class ScaleInstanceSubmissionBarrierService {
  constructor(
    @InjectModel(ScaleInstance.name)
    private readonly scaleInstanceModel: Model<ScaleInstanceDocument>,
    @InjectModel(ItemResponse.name)
    private readonly itemResponseModel: Model<ItemResponseDocument>,
  ) {}

  async createParentBarrierIfOpen(
    input: CreateSubmissionBarrierInput,
  ): Promise<boolean> {
    const ownership = this.requireOwnership(input);
    const itemResponseIds = this.requireScope(input.itemResponseIds);
    const startedBy = this.requireObjectId(input.startedBy);

    const result = await this.scaleInstanceModel
      .findOneAndUpdate(
        {
          _id: ownership.scaleInstanceId,
          patientId: ownership.patientId,
          assessmentVisitId: ownership.assessmentVisitId,
          status: { $in: ['draft', 'in_progress'] },
          lockedAt: null,
          $or: [
            { submissionWriteBarrier: null },
            { submissionWriteBarrier: { $exists: false } },
          ],
        },
        {
          $set: {
            submissionWriteBarrier: {
              version: SCALE_INSTANCE_SUBMISSION_BARRIER_VERSION,
              barrierId: input.barrierId,
              state: 'fencing',
              startedAt: input.startedAt,
              fencedAt: null,
              releaseStartedAt: null,
              completedAt: null,
              startedBy,
              startedByName: input.startedByName,
              startedByRole: input.startedByRole,
              itemResponseIds,
              expectedItemCount: itemResponseIds.length,
            },
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    return result !== null;
  }

  async fenceItemResponses(
    patientId: string,
    assessmentVisitId: string,
    scaleInstanceId: string,
    barrier: NormalizedScaleInstanceSubmissionWriteBarrier,
  ): Promise<void> {
    const ownership = this.requireOwnership({
      patientId,
      assessmentVisitId,
      scaleInstanceId,
    });
    const itemResponseIds = this.requireScope(barrier.itemResponseIds);

    await this.itemResponseModel
      .updateMany(
        {
          _id: { $in: itemResponseIds },
          patientId: ownership.patientId,
          assessmentVisitId: ownership.assessmentVisitId,
          scaleInstanceId: ownership.scaleInstanceId,
          $or: [
            { submissionWriteBarrier: null },
            { submissionWriteBarrier: { $exists: false } },
          ],
        },
        {
          $set: {
            submissionWriteBarrier: {
              version: SCALE_INSTANCE_SUBMISSION_BARRIER_VERSION,
              barrierId: barrier.barrierId,
              startedAt: barrier.startedAt,
            },
          },
        },
        { runValidators: true },
      )
      .exec();

    const items = await this.itemResponseModel
      .find({
        _id: { $in: itemResponseIds },
        patientId: ownership.patientId,
        assessmentVisitId: ownership.assessmentVisitId,
        scaleInstanceId: ownership.scaleInstanceId,
      })
      .sort({ _id: 1 })
      .exec();
    const actualScope = items.map((item) => item._id.toString());

    if (
      items.length !== barrier.expectedItemCount ||
      !itemResponseScopesEqual(actualScope, barrier.itemResponseIds) ||
      items.some((item) => {
        const parsed = normalizeItemResponseSubmissionWriteBarrier(
          item.submissionWriteBarrier,
        );
        return (
          parsed.kind !== 'valid' ||
          parsed.value.barrierId !== barrier.barrierId
        );
      })
    ) {
      throw new ScaleInstanceSubmissionBarrierError(
        'Item response submission fencing could not be verified',
      );
    }
  }

  async markParentFenced(
    patientId: string,
    assessmentVisitId: string,
    scaleInstanceId: string,
    barrier: NormalizedScaleInstanceSubmissionWriteBarrier,
    fencedAt: Date,
  ): Promise<boolean> {
    const ownership = this.requireOwnership({
      patientId,
      assessmentVisitId,
      scaleInstanceId,
    });
    const itemResponseIds = this.requireScope(barrier.itemResponseIds);

    const result = await this.scaleInstanceModel
      .findOneAndUpdate(
        {
          _id: ownership.scaleInstanceId,
          patientId: ownership.patientId,
          assessmentVisitId: ownership.assessmentVisitId,
          status: { $in: ['draft', 'in_progress'] },
          lockedAt: null,
          'submissionWriteBarrier.version':
            SCALE_INSTANCE_SUBMISSION_BARRIER_VERSION,
          'submissionWriteBarrier.barrierId': barrier.barrierId,
          'submissionWriteBarrier.state': 'fencing',
          'submissionWriteBarrier.itemResponseIds': itemResponseIds,
          'submissionWriteBarrier.expectedItemCount': itemResponseIds.length,
        },
        {
          $set: {
            'submissionWriteBarrier.state': 'fenced',
            'submissionWriteBarrier.fencedAt': fencedAt,
            'submissionWriteBarrier.releaseStartedAt': null,
            'submissionWriteBarrier.completedAt': null,
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    return result !== null;
  }

  async claimRelease(
    patientId: string,
    assessmentVisitId: string,
    scaleInstanceId: string,
    barrierId: string,
    releaseStartedAt: Date,
  ): Promise<boolean> {
    const ownership = this.requireOwnership({
      patientId,
      assessmentVisitId,
      scaleInstanceId,
    });
    const result = await this.scaleInstanceModel
      .findOneAndUpdate(
        {
          _id: ownership.scaleInstanceId,
          patientId: ownership.patientId,
          assessmentVisitId: ownership.assessmentVisitId,
          'submissionWriteBarrier.version':
            SCALE_INSTANCE_SUBMISSION_BARRIER_VERSION,
          'submissionWriteBarrier.barrierId': barrierId,
          'submissionWriteBarrier.state': { $in: ['fencing', 'fenced'] },
        },
        {
          $set: {
            'submissionWriteBarrier.state': 'releasing',
            'submissionWriteBarrier.releaseStartedAt': releaseStartedAt,
            'submissionWriteBarrier.completedAt': null,
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    return result !== null;
  }

  async releaseItemResponses(
    patientId: string,
    assessmentVisitId: string,
    scaleInstanceId: string,
    barrier: NormalizedScaleInstanceSubmissionWriteBarrier,
  ): Promise<void> {
    const ownership = this.requireOwnership({
      patientId,
      assessmentVisitId,
      scaleInstanceId,
    });
    const itemResponseIds = this.requireScope(barrier.itemResponseIds);

    await this.itemResponseModel
      .updateMany(
        {
          _id: { $in: itemResponseIds },
          patientId: ownership.patientId,
          assessmentVisitId: ownership.assessmentVisitId,
          scaleInstanceId: ownership.scaleInstanceId,
          'submissionWriteBarrier.version':
            SCALE_INSTANCE_SUBMISSION_BARRIER_VERSION,
          'submissionWriteBarrier.barrierId': barrier.barrierId,
        },
        { $set: { submissionWriteBarrier: null } },
        { runValidators: true },
      )
      .exec();

    const items = await this.itemResponseModel
      .find({
        _id: { $in: itemResponseIds },
        patientId: ownership.patientId,
        assessmentVisitId: ownership.assessmentVisitId,
        scaleInstanceId: ownership.scaleInstanceId,
      })
      .sort({ _id: 1 })
      .exec();

    if (
      items.length !== barrier.expectedItemCount ||
      !itemResponseScopesEqual(
        items.map((item) => item._id.toString()),
        barrier.itemResponseIds,
      ) ||
      items.some((item) => {
        const parsed = normalizeItemResponseSubmissionWriteBarrier(
          item.submissionWriteBarrier,
        );
        return parsed.kind !== 'open';
      })
    ) {
      throw new ScaleInstanceSubmissionBarrierError(
        'Item response submission fencing could not be released',
      );
    }
  }

  async clearParentBarrier(
    patientId: string,
    assessmentVisitId: string,
    scaleInstanceId: string,
    barrierId: string,
  ): Promise<boolean> {
    const ownership = this.requireOwnership({
      patientId,
      assessmentVisitId,
      scaleInstanceId,
    });
    const result = await this.scaleInstanceModel
      .findOneAndUpdate(
        {
          _id: ownership.scaleInstanceId,
          patientId: ownership.patientId,
          assessmentVisitId: ownership.assessmentVisitId,
          'submissionWriteBarrier.version':
            SCALE_INSTANCE_SUBMISSION_BARRIER_VERSION,
          'submissionWriteBarrier.barrierId': barrierId,
          'submissionWriteBarrier.state': 'releasing',
        },
        { $set: { submissionWriteBarrier: null } },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    return result !== null;
  }

  async completeScaleInstance(
    input: CompleteSubmissionBarrierInput,
  ): Promise<boolean> {
    const ownership = this.requireOwnership(input);
    const itemResponseIds = this.requireScope(input.barrier.itemResponseIds);
    const submittedBy = this.requireObjectId(input.barrier.startedBy);
    const progress = {
      totalItemCount: input.readinessSummary.actualItemCount,
      answeredItemCount: input.readinessSummary.completedItemCount,
      source: 'submission',
      finalizedAt: input.completionTime,
    };
    const updateFields: Record<string, unknown> = {
      status: 'completed',
      completedAt: input.completionTime,
      durationMs: input.durationMs,
      progress,
      'metadata.submission.submissionId': input.barrier.barrierId,
      'metadata.submission.submittedAt': input.completionTime,
      'metadata.submission.submittedBy': submittedBy,
      'metadata.submission.submittedByName': input.barrier.startedByName,
      'metadata.submission.submittedByRole': input.barrier.startedByRole,
      'metadata.submission.readinessSummary.expectedItemCount':
        input.readinessSummary.expectedItemCount,
      'metadata.submission.readinessSummary.actualItemCount':
        input.readinessSummary.actualItemCount,
      'metadata.submission.readinessSummary.completedItemCount':
        input.readinessSummary.completedItemCount,
      'metadata.submission.readinessSummary.blockingIssueCount':
        input.readinessSummary.blockingIssueCount,
      'metadata.submission.readinessSummary.warningCount':
        input.readinessSummary.warningCount,
      'submissionWriteBarrier.state': 'completed',
      'submissionWriteBarrier.completedAt': input.completionTime,
      'submissionWriteBarrier.releaseStartedAt': null,
    };

    if (input.startedAtToSet) {
      updateFields.startedAt = input.startedAtToSet;
    }

    const completed = await this.scaleInstanceModel
      .findOneAndUpdate(
        {
          _id: ownership.scaleInstanceId,
          patientId: ownership.patientId,
          assessmentVisitId: ownership.assessmentVisitId,
          status: { $in: ['draft', 'in_progress'] },
          lockedAt: null,
          'submissionWriteBarrier.version':
            SCALE_INSTANCE_SUBMISSION_BARRIER_VERSION,
          'submissionWriteBarrier.barrierId': input.barrier.barrierId,
          'submissionWriteBarrier.state': 'fenced',
          'submissionWriteBarrier.itemResponseIds': itemResponseIds,
          'submissionWriteBarrier.expectedItemCount': itemResponseIds.length,
        },
        { $set: updateFields },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    return completed !== null;
  }

  private requireOwnership(input: {
    patientId: string;
    assessmentVisitId: string;
    scaleInstanceId: string;
  }): NormalizedOwnership {
    return {
      patientId: this.requireObjectId(input.patientId),
      assessmentVisitId: this.requireObjectId(input.assessmentVisitId),
      scaleInstanceId: this.requireObjectId(input.scaleInstanceId),
    };
  }

  private requireScope(itemResponseIds: readonly string[]): Types.ObjectId[] {
    const stableScope = buildStableItemResponseScope(itemResponseIds);
    if (
      !stableScope ||
      stableScope.length !== itemResponseIds.length ||
      !stableScope.every(
        (itemResponseId, index) => itemResponseId === itemResponseIds[index],
      )
    ) {
      throw new ScaleInstanceSubmissionBarrierError(
        'Submission barrier scope is invalid',
      );
    }

    return stableScope.map((itemResponseId) =>
      this.requireObjectId(itemResponseId),
    );
  }

  private requireObjectId(value: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new ScaleInstanceSubmissionBarrierError(
        'Submission barrier ownership is invalid',
      );
    }
    return new Types.ObjectId(value);
  }
}
