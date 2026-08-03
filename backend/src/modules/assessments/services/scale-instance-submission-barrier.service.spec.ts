import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import {
  normalizeScaleInstanceSubmissionWriteBarrier,
  type NormalizedScaleInstanceSubmissionWriteBarrier,
} from '../lib/scale-instance-submission-write-barrier';
import { ItemResponse } from '../schemas/item-response.schema';
import { ScaleInstance } from '../schemas/scale-instance.schema';
import {
  ScaleInstanceSubmissionBarrierError,
  ScaleInstanceSubmissionBarrierService,
} from './scale-instance-submission-barrier.service';

function createExecQuery<T>(value: T) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

function createSortExecQuery<T>(value: T) {
  const exec = jest.fn().mockResolvedValue(value);
  return { sort: jest.fn().mockReturnValue({ exec }), exec };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${label} to be an object`);
  }
  return value;
}

function readMockCallArgument(
  mock: jest.Mock,
  argumentIndex: number,
  callIndex = 0,
): unknown {
  const calls: unknown = mock.mock.calls;
  if (!Array.isArray(calls) || !Array.isArray(calls[callIndex])) {
    throw new Error(`Expected mock call ${callIndex + 1}`);
  }
  return calls[callIndex][argumentIndex] as unknown;
}

function stateFilterMatches(filter: unknown, state: string): boolean {
  if (typeof filter === 'string') {
    return filter === state;
  }
  if (!isRecord(filter) || !Array.isArray(filter.$in)) {
    return false;
  }
  return filter.$in.includes(state);
}

function createBarrier(
  overrides: Record<string, unknown> = {},
): NormalizedScaleInstanceSubmissionWriteBarrier {
  const parsed = normalizeScaleInstanceSubmissionWriteBarrier({
    version: 1,
    barrierId: '4b1f52e9-ab39-441a-b799-9a2b9cdadea2',
    state: 'fenced',
    startedAt: new Date('2026-08-03T01:00:00.000Z'),
    fencedAt: new Date('2026-08-03T01:00:01.000Z'),
    releaseStartedAt: null,
    completedAt: null,
    startedBy: '507f1f77bcf86cd799439019',
    startedByName: 'Barrier Operator',
    startedByRole: 'doctor',
    itemResponseIds: ['507f1f77bcf86cd799439016', '507f1f77bcf86cd799439017'],
    expectedItemCount: 2,
    ...overrides,
  });
  if (parsed.kind !== 'valid') {
    throw new Error('Test barrier fixture is invalid');
  }
  return parsed.value;
}

describe('ScaleInstanceSubmissionBarrierService', () => {
  const patientId = '507f1f77bcf86cd799439011';
  const assessmentVisitId = '507f1f77bcf86cd799439012';
  const scaleInstanceId = '507f1f77bcf86cd799439013';
  let scaleInstanceModel: { findOneAndUpdate: jest.Mock };
  let itemResponseModel: {
    updateMany: jest.Mock;
    find: jest.Mock;
  };
  let service: ScaleInstanceSubmissionBarrierService;

  beforeEach(async () => {
    scaleInstanceModel = { findOneAndUpdate: jest.fn() };
    itemResponseModel = { updateMany: jest.fn(), find: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ScaleInstanceSubmissionBarrierService,
        {
          provide: getModelToken(ScaleInstance.name),
          useValue: scaleInstanceModel,
        },
        {
          provide: getModelToken(ItemResponse.name),
          useValue: itemResponseModel,
        },
      ],
    }).compile();
    service = moduleRef.get(ScaleInstanceSubmissionBarrierService);
  });

  it('creates the parent barrier only on the exact editable open owner', async () => {
    const barrier = createBarrier();
    scaleInstanceModel.findOneAndUpdate.mockReturnValue(
      createExecQuery({ _id: new Types.ObjectId(scaleInstanceId) }),
    );

    await expect(
      service.createParentBarrierIfOpen({
        patientId,
        assessmentVisitId,
        scaleInstanceId,
        barrierId: barrier.barrierId,
        startedAt: barrier.startedAt,
        startedBy: barrier.startedBy,
        startedByName: barrier.startedByName,
        startedByRole: barrier.startedByRole,
        itemResponseIds: barrier.itemResponseIds,
      }),
    ).resolves.toBe(true);

    expect(scaleInstanceModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: new Types.ObjectId(scaleInstanceId),
        patientId: new Types.ObjectId(patientId),
        assessmentVisitId: new Types.ObjectId(assessmentVisitId),
        status: { $in: ['draft', 'in_progress'] },
        lockedAt: null,
        $or: [
          { submissionWriteBarrier: null },
          { submissionWriteBarrier: { $exists: false } },
        ],
      }),
      {
        $set: {
          submissionWriteBarrier: {
            version: 1,
            barrierId: barrier.barrierId,
            state: 'fencing',
            startedAt: barrier.startedAt,
            fencedAt: null,
            releaseStartedAt: null,
            completedAt: null,
            startedBy: new Types.ObjectId(barrier.startedBy),
            startedByName: barrier.startedByName,
            startedByRole: barrier.startedByRole,
            itemResponseIds: barrier.itemResponseIds.map(
              (itemResponseId) => new Types.ObjectId(itemResponseId),
            ),
            expectedItemCount: 2,
          },
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('fences only open children and proves the complete same-token scope', async () => {
    const barrier = createBarrier({
      state: 'fencing',
      fencedAt: null,
    });
    itemResponseModel.updateMany.mockReturnValue(createExecQuery({}));
    itemResponseModel.find.mockReturnValue(
      createSortExecQuery(
        barrier.itemResponseIds.map((id) => ({
          _id: new Types.ObjectId(id),
          submissionWriteBarrier: {
            version: 1,
            barrierId: barrier.barrierId,
            startedAt: barrier.startedAt,
          },
        })),
      ),
    );

    await expect(
      service.fenceItemResponses(
        patientId,
        assessmentVisitId,
        scaleInstanceId,
        barrier,
      ),
    ).resolves.toBeUndefined();
    expect(itemResponseModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: [
          { submissionWriteBarrier: null },
          { submissionWriteBarrier: { $exists: false } },
        ],
      }),
      {
        $set: {
          submissionWriteBarrier: {
            version: 1,
            barrierId: barrier.barrierId,
            startedAt: barrier.startedAt,
          },
        },
      },
      { runValidators: true },
    );
  });

  it('fails fencing closed when any child has another token', async () => {
    const barrier = createBarrier({ state: 'fencing', fencedAt: null });
    itemResponseModel.updateMany.mockReturnValue(createExecQuery({}));
    itemResponseModel.find.mockReturnValue(
      createSortExecQuery([
        {
          _id: new Types.ObjectId(barrier.itemResponseIds[0]),
          submissionWriteBarrier: {
            version: 1,
            barrierId: barrier.barrierId,
            startedAt: barrier.startedAt,
          },
        },
        {
          _id: new Types.ObjectId(barrier.itemResponseIds[1]),
          submissionWriteBarrier: {
            version: 1,
            barrierId: 'e90154a6-c6b0-4417-90ea-ad69f2ac05f6',
            startedAt: barrier.startedAt,
          },
        },
      ]),
    );

    await expect(
      service.fenceItemResponses(
        patientId,
        assessmentVisitId,
        scaleInstanceId,
        barrier,
      ),
    ).rejects.toBeInstanceOf(ScaleInstanceSubmissionBarrierError);
  });

  it('uses exact token states for fenced, release claim, and parent clear CAS', async () => {
    const fencing = createBarrier({ state: 'fencing', fencedAt: null });
    const releaseStartedAt = new Date('2026-08-03T01:00:02.000Z');
    const fencedAt = new Date('2026-08-03T01:00:01.000Z');
    scaleInstanceModel.findOneAndUpdate.mockReturnValue(
      createExecQuery({ _id: new Types.ObjectId(scaleInstanceId) }),
    );

    await service.markParentFenced(
      patientId,
      assessmentVisitId,
      scaleInstanceId,
      fencing,
      fencedAt,
    );
    await service.claimRelease(
      patientId,
      assessmentVisitId,
      scaleInstanceId,
      fencing.barrierId,
      releaseStartedAt,
    );
    await service.clearParentBarrier(
      patientId,
      assessmentVisitId,
      scaleInstanceId,
      fencing.barrierId,
    );

    expect(
      readMockCallArgument(scaleInstanceModel.findOneAndUpdate, 0, 0),
    ).toEqual(
      expect.objectContaining({
        'submissionWriteBarrier.barrierId': fencing.barrierId,
        'submissionWriteBarrier.state': 'fencing',
        'submissionWriteBarrier.expectedItemCount': 2,
      }),
    );
    expect(
      readMockCallArgument(scaleInstanceModel.findOneAndUpdate, 0, 1),
    ).toEqual(
      expect.objectContaining({
        'submissionWriteBarrier.barrierId': fencing.barrierId,
        'submissionWriteBarrier.state': { $in: ['fencing', 'fenced'] },
      }),
    );
    expect(
      readMockCallArgument(scaleInstanceModel.findOneAndUpdate, 0, 2),
    ).toEqual(
      expect.objectContaining({
        'submissionWriteBarrier.barrierId': fencing.barrierId,
        'submissionWriteBarrier.state': 'releasing',
      }),
    );
  });

  it('linearizes completion and release claims so only one fenced-state branch wins', async () => {
    const barrier = createBarrier();
    const completionTime = new Date('2026-08-03T01:10:00.000Z');
    let persistedState = 'fenced';
    scaleInstanceModel.findOneAndUpdate.mockImplementation(
      (filter: unknown, update: unknown) => {
        const filterRecord = requireRecord(filter, 'state-race filter');
        const updateRecord = requireRecord(update, 'state-race update');
        const set = requireRecord(updateRecord.$set, 'state-race $set');
        return {
          exec: jest.fn(() => {
            if (
              !stateFilterMatches(
                filterRecord['submissionWriteBarrier.state'],
                persistedState,
              )
            ) {
              return Promise.resolve(null);
            }
            persistedState = String(set['submissionWriteBarrier.state']);
            return Promise.resolve({
              _id: new Types.ObjectId(scaleInstanceId),
            });
          }),
        };
      },
    );
    const completionInput = {
      patientId,
      assessmentVisitId,
      scaleInstanceId,
      barrier,
      completionTime,
      durationMs: 600000,
      readinessSummary: {
        expectedItemCount: 2,
        actualItemCount: 2,
        completedItemCount: 2,
        blockingIssueCount: 0,
        warningCount: 0,
      },
    };

    const completionFirst = service.completeScaleInstance(completionInput);
    const releaseSecond = service.claimRelease(
      patientId,
      assessmentVisitId,
      scaleInstanceId,
      barrier.barrierId,
      completionTime,
    );
    await expect(completionFirst).resolves.toBe(true);
    await expect(releaseSecond).resolves.toBe(false);
    expect(persistedState).toBe('completed');

    persistedState = 'fenced';
    const releaseFirst = service.claimRelease(
      patientId,
      assessmentVisitId,
      scaleInstanceId,
      barrier.barrierId,
      completionTime,
    );
    const completionSecond = service.completeScaleInstance(completionInput);
    await expect(releaseFirst).resolves.toBe(true);
    await expect(completionSecond).resolves.toBe(false);
    expect(persistedState).toBe('releasing');
  });

  it('releases only the claimed token and requires every scoped child open', async () => {
    const barrier = createBarrier({
      state: 'releasing',
      releaseStartedAt: new Date('2026-08-03T01:00:02.000Z'),
    });
    itemResponseModel.updateMany.mockReturnValue(createExecQuery({}));
    itemResponseModel.find.mockReturnValue(
      createSortExecQuery(
        barrier.itemResponseIds.map((id) => ({
          _id: new Types.ObjectId(id),
          submissionWriteBarrier: null,
        })),
      ),
    );

    await expect(
      service.releaseItemResponses(
        patientId,
        assessmentVisitId,
        scaleInstanceId,
        barrier,
      ),
    ).resolves.toBeUndefined();
    expect(itemResponseModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        'submissionWriteBarrier.version': 1,
        'submissionWriteBarrier.barrierId': barrier.barrierId,
      }),
      { $set: { submissionWriteBarrier: null } },
      { runValidators: true },
    );

    itemResponseModel.find.mockReturnValueOnce(
      createSortExecQuery([
        {
          _id: new Types.ObjectId(barrier.itemResponseIds[0]),
          submissionWriteBarrier: null,
        },
        {
          _id: new Types.ObjectId(barrier.itemResponseIds[1]),
          submissionWriteBarrier: {
            version: 1,
            barrierId: 'f6bf4840-17ff-40d3-b4fc-e5eb0fb4f467',
            startedAt: barrier.startedAt,
          },
        },
      ]),
    );
    await expect(
      service.releaseItemResponses(
        patientId,
        assessmentVisitId,
        scaleInstanceId,
        barrier,
      ),
    ).rejects.toBeInstanceOf(ScaleInstanceSubmissionBarrierError);
  });

  it('completes only the exact fenced parent and writes audit from the first actor', async () => {
    const barrier = createBarrier();
    const completionTime = new Date('2026-08-03T01:10:00.000Z');
    scaleInstanceModel.findOneAndUpdate.mockReturnValue(
      createExecQuery({ _id: new Types.ObjectId(scaleInstanceId) }),
    );

    await expect(
      service.completeScaleInstance({
        patientId,
        assessmentVisitId,
        scaleInstanceId,
        barrier,
        completionTime,
        startedAtToSet: barrier.startedAt,
        durationMs: 600000,
        readinessSummary: {
          expectedItemCount: 2,
          actualItemCount: 2,
          completedItemCount: 2,
          blockingIssueCount: 0,
          warningCount: 0,
        },
      }),
    ).resolves.toBe(true);

    expect(scaleInstanceModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: { $in: ['draft', 'in_progress'] },
        lockedAt: null,
        'submissionWriteBarrier.version': 1,
        'submissionWriteBarrier.barrierId': barrier.barrierId,
        'submissionWriteBarrier.state': 'fenced',
        'submissionWriteBarrier.expectedItemCount': 2,
      }),
      expect.anything(),
      { returnDocument: 'after', runValidators: true },
    );
    const completionUpdate = requireRecord(
      readMockCallArgument(scaleInstanceModel.findOneAndUpdate, 1),
      'completion update',
    );
    const completionSet = requireRecord(
      completionUpdate.$set,
      'completion $set',
    );
    expect(completionSet.status).toBe('completed');
    expect(completionSet.completedAt).toBe(completionTime);
    expect(completionSet.startedAt).toBe(barrier.startedAt);
    expect(completionSet['metadata.submission.submissionId']).toBe(
      barrier.barrierId,
    );
    expect(completionSet['metadata.submission.submittedBy']).toEqual(
      new Types.ObjectId(barrier.startedBy),
    );
    expect(completionSet['metadata.submission.submittedByName']).toBe(
      barrier.startedByName,
    );
    expect(completionSet['submissionWriteBarrier.state']).toBe('completed');
    expect(completionSet['submissionWriteBarrier.completedAt']).toBe(
      completionTime,
    );
  });

  it('rejects invalid, duplicated, or unstable scope input before querying', async () => {
    const barrier = createBarrier();

    await expect(
      service.createParentBarrierIfOpen({
        patientId,
        assessmentVisitId,
        scaleInstanceId,
        barrierId: barrier.barrierId,
        startedAt: barrier.startedAt,
        startedBy: barrier.startedBy,
        startedByName: barrier.startedByName,
        startedByRole: barrier.startedByRole,
        itemResponseIds: [
          barrier.itemResponseIds[0],
          barrier.itemResponseIds[0],
        ],
      }),
    ).rejects.toBeInstanceOf(ScaleInstanceSubmissionBarrierError);
    expect(scaleInstanceModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
