// backend/src/modules/scoring/services/scoring.service.spec.ts
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import {
  ScoreGroupSnapshotSchema,
  ScoreItemSnapshotSchema,
  ScoreResult,
  ScoreResultSchema,
  ScoreReviewSnapshotSchema,
  ScoreVersionTraceSchema,
  ScoringComputationSnapshotSchema,
  TotalScoreSnapshotSchema,
} from '../schemas/score-result.schema';
import { ScoringService } from './scoring.service';

function createExecQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createScoreResultFixture(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    patientId: new Types.ObjectId(),
    assessmentVisitId: new Types.ObjectId(),
    scaleInstanceId: new Types.ObjectId(),
    subjectCode: 'SUBJ-TEST-001',
    scaleDefinitionId: new Types.ObjectId(),
    scaleVersionId: new Types.ObjectId(),
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: 'INST-TEST-001',
    scoreResultCode: 'SCR-TEST-001',
    runNo: 1,
    status: 'computed',
    scoringSource: 'auto_rule',
    scoringMode: 'rule_based',
    versionTrace: {
      scaleVersion: '1.0',
      crfVersion: 'crf-test-1',
      scoringRuleVersion: 'score-test-1',
      fieldEncodingVersion: 'field-test-1',
      sourceDocument: 'source-test',
    },
    totalScore: {
      scoreValue: 2,
      maxScore: 3,
      minScore: 0,
      scorePercent: 66.66666666666666,
      scoredItemCount: 2,
      totalItemCount: 3,
      unscoredItemCount: 1,
      missingItemCount: 1,
      needsReviewItemCount: 1,
    },
    itemScores: [
      {
        itemResponseId: new Types.ObjectId(),
        itemCode: 'moca.recall.delayed.free.face',
        crfCode: 'N1.2.13.1',
        groupCode: 'memory',
        itemTitle: 'Delayed recall face sample',
        itemOrder: 13,
        responseType: 'text',
        countsTowardTotal: true,
        includedInTotal: true,
        scoreValue: 1,
        maxScore: 1,
        minScore: 0,
        scoreStatus: 'auto_scored',
        scoreSource: 'auto_rule',
        isMissing: false,
        cognitiveDomainCodes: ['memory'],
        note: 'De-identified item score note',
      },
      {
        itemResponseId: null,
        itemCode: 'moca.memory.immediate.trial_1.face',
        groupCode: 'memory',
        itemOrder: 3,
        responseType: 'text',
        countsTowardTotal: false,
        includedInTotal: false,
        scoreValue: 1,
        maxScore: 1,
        minScore: 0,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        isMissing: false,
        cognitiveDomainCodes: ['memory'],
      },
    ],
    groupScores: [
      {
        groupCode: 'memory',
        groupTitle: 'Memory sample',
        scoreValue: 2,
        maxScore: 2,
        minScore: 0,
        scoredItemCount: 2,
        totalItemCount: 2,
        note: 'De-identified group score note',
      },
    ],
    computation: {
      computedAt: new Date('2026-01-07T08:00:00.000Z'),
      computedBy: new Types.ObjectId(),
      ruleSetCode: 'RULE-TEST-001',
      ruleSetVersion: 'rule-test-1',
      engineVersion: 'scoring-base-test-1',
      inputItemCount: 3,
      includedItemCount: 2,
      excludedItemCount: 1,
      warningCount: 0,
      notes: 'De-identified computation note',
    },
    review: {
      reviewStatus: 'pending',
      reviewedAt: null,
      reviewerId: new Types.ObjectId(),
      reviewerName: 'Sample Reviewer',
      reviewNote: 'De-identified review note',
    },
    qualityStatus: 'passed',
    qualityHints: { needsReview: false },
    operatorNote: 'De-identified operator note',
    metadata: { source: 'unit-test' },
    confirmedAt: null,
    lockedAt: null,
    voidedAt: null,
    internalMarker: 'not returned',
    ...overrides,
  };
}

describe('ScoreResult schema', () => {
  it('defines collection and indexes', () => {
    expect(ScoreResultSchema.get('collection')).toBe('score_results');
    expect(ScoreResultSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ scoreResultCode: 1 }, expect.objectContaining({ unique: true })],
        [
          { scaleInstanceId: 1, runNo: 1 },
          expect.objectContaining({ unique: true }),
        ],
        [{ scaleInstanceId: 1, status: 1, createdAt: -1 }, expect.any(Object)],
        [
          { assessmentVisitId: 1, scaleCode: 1, createdAt: -1 },
          expect.any(Object),
        ],
        [{ patientId: 1, scaleCode: 1, createdAt: -1 }, expect.any(Object)],
        [{ status: 1, updatedAt: -1 }, expect.any(Object)],
        [{ scaleCode: 1, scaleVersion: 1 }, expect.any(Object)],
        [{ qualityStatus: 1, updatedAt: -1 }, expect.any(Object)],
      ]),
    );
  });

  it('defines explicit ObjectId, primitive, nullable and Mixed field types', () => {
    expect(ScoreResultSchema.path('patientId')?.instance).toBe('ObjectId');
    expect(ScoreResultSchema.path('assessmentVisitId')?.instance).toBe(
      'ObjectId',
    );
    expect(ScoreResultSchema.path('scaleInstanceId')?.instance).toBe(
      'ObjectId',
    );
    expect(ScoreResultSchema.path('scaleDefinitionId')?.instance).toBe(
      'ObjectId',
    );
    expect(ScoreResultSchema.path('scaleVersionId')?.instance).toBe('ObjectId');
    expect(ScoreResultSchema.path('scoreResultCode')?.instance).toBe('String');
    expect(ScoreResultSchema.path('runNo')?.instance).toBe('Number');
    expect(ScoreResultSchema.path('status')?.instance).toBe('String');
    expect(ScoreResultSchema.path('scoringSource')?.instance).toBe('String');
    expect(ScoreResultSchema.path('scoringMode')?.instance).toBe('String');
    expect(ScoreResultSchema.path('qualityStatus')?.instance).toBe('String');
    expect(ScoreResultSchema.path('qualityHints')?.instance).toBe('Mixed');
    expect(ScoreResultSchema.path('metadata')?.instance).toBe('Mixed');
    expect(ScoreResultSchema.path('confirmedAt')?.instance).toBe('Date');
    expect(ScoreResultSchema.path('lockedAt')?.instance).toBe('Date');
    expect(ScoreResultSchema.path('voidedAt')?.instance).toBe('Date');

    expect(ScoreVersionTraceSchema.path('scaleVersion')?.instance).toBe(
      'String',
    );
    expect(TotalScoreSnapshotSchema.path('scoreValue')?.instance).toBe(
      'Number',
    );
    expect(TotalScoreSnapshotSchema.path('maxScore')?.instance).toBe('Number');
    expect(TotalScoreSnapshotSchema.path('minScore')?.instance).toBe('Number');
    expect(TotalScoreSnapshotSchema.path('scorePercent')?.instance).toBe(
      'Number',
    );
    expect(TotalScoreSnapshotSchema.path('scoredItemCount')?.instance).toBe(
      'Number',
    );
    expect(ScoreItemSnapshotSchema.path('itemResponseId')?.instance).toBe(
      'ObjectId',
    );
    expect(ScoreItemSnapshotSchema.path('itemOrder')?.instance).toBe('Number');
    expect(ScoreItemSnapshotSchema.path('responseType')?.instance).toBe(
      'String',
    );
    expect(ScoreItemSnapshotSchema.path('countsTowardTotal')?.instance).toBe(
      'Boolean',
    );
    expect(ScoreItemSnapshotSchema.path('includedInTotal')?.instance).toBe(
      'Boolean',
    );
    expect(ScoreItemSnapshotSchema.path('scoreValue')?.instance).toBe('Number');
    expect(ScoreItemSnapshotSchema.path('maxScore')?.instance).toBe('Number');
    expect(ScoreItemSnapshotSchema.path('minScore')?.instance).toBe('Number');
    expect(ScoreItemSnapshotSchema.path('scoreStatus')?.instance).toBe(
      'String',
    );
    expect(ScoreItemSnapshotSchema.path('scoreSource')?.instance).toBe(
      'String',
    );
    expect(ScoreItemSnapshotSchema.path('isMissing')?.instance).toBe('Boolean');
    expect(ScoreGroupSnapshotSchema.path('groupCode')?.instance).toBe('String');
    expect(ScoreGroupSnapshotSchema.path('scoreValue')?.instance).toBe(
      'Number',
    );
    expect(ScoreGroupSnapshotSchema.path('maxScore')?.instance).toBe('Number');
    expect(ScoreGroupSnapshotSchema.path('minScore')?.instance).toBe('Number');
    expect(ScoringComputationSnapshotSchema.path('computedAt')?.instance).toBe(
      'Date',
    );
    expect(ScoringComputationSnapshotSchema.path('computedBy')?.instance).toBe(
      'ObjectId',
    );
    expect(
      ScoringComputationSnapshotSchema.path('inputItemCount')?.instance,
    ).toBe('Number');
    expect(ScoreReviewSnapshotSchema.path('reviewStatus')?.instance).toBe(
      'String',
    );
    expect(ScoreReviewSnapshotSchema.path('reviewedAt')?.instance).toBe('Date');
    expect(ScoreReviewSnapshotSchema.path('reviewerId')?.instance).toBe(
      'ObjectId',
    );
  });

  it('keeps embedded schemas without nested _id fields', () => {
    expect(ScoreVersionTraceSchema.get('_id')).toBe(false);
    expect(TotalScoreSnapshotSchema.get('_id')).toBe(false);
    expect(ScoreItemSnapshotSchema.get('_id')).toBe(false);
    expect(ScoreGroupSnapshotSchema.get('_id')).toBe(false);
    expect(ScoringComputationSnapshotSchema.get('_id')).toBe(false);
    expect(ScoreReviewSnapshotSchema.get('_id')).toBe(false);
  });
});

describe('ScoringService', () => {
  let service: ScoringService;
  let scoreResultModel: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
  };

  beforeEach(async () => {
    scoreResultModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ScoringService,
        {
          provide: getModelToken(ScoreResult.name),
          useValue: scoreResultModel,
        },
      ],
    }).compile();

    service = moduleRef.get(ScoringService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes score result code with trim and uppercase', () => {
    expect(service.normalizeScoreResultCode('  scr-test-001  ')).toBe(
      'SCR-TEST-001',
    );
  });

  it('returns null when score result is not found', async () => {
    scoreResultModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(
      service.findScoreResultByCode('SCR-UNKNOWN-001'),
    ).resolves.toBeNull();
    expect(scoreResultModel.findOne).toHaveBeenCalledWith({
      scoreResultCode: 'SCR-UNKNOWN-001',
    });
  });

  it('maps score result output instead of returning raw documents', async () => {
    const scoreResultId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const itemResponseId = new Types.ObjectId();
    const computedAt = new Date('2026-01-07T08:00:00.000Z');
    const computedBy = new Types.ObjectId();
    const reviewerId = new Types.ObjectId();
    const rawScoreResult = createScoreResultFixture({
      _id: scoreResultId,
      patientId,
      assessmentVisitId: visitId,
      scaleInstanceId,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scoreResultCode: 'SCR-TEST-002',
      itemScores: [
        {
          itemResponseId,
          itemCode: 'moca.recall.delayed.free.face',
          groupCode: 'memory',
          itemOrder: 13,
          responseType: 'text',
          countsTowardTotal: true,
          includedInTotal: true,
          scoreValue: 1,
          maxScore: 1,
          minScore: 0,
          scoreStatus: 'auto_scored',
          scoreSource: 'auto_rule',
          isMissing: false,
          cognitiveDomainCodes: ['memory'],
        },
      ],
      computation: {
        computedAt,
        computedBy,
        ruleSetCode: 'RULE-TEST-002',
        ruleSetVersion: 'rule-test-2',
        engineVersion: 'scoring-base-test-2',
        inputItemCount: 1,
        includedItemCount: 1,
        excludedItemCount: 0,
        warningCount: 0,
      },
      review: {
        reviewStatus: 'reviewed',
        reviewedAt: computedAt,
        reviewerId,
        reviewerName: 'Sample Reviewer',
        reviewNote: 'De-identified review note',
      },
    });
    scoreResultModel.findOne.mockReturnValue(createExecQuery(rawScoreResult));

    const result = await service.findScoreResultByCode(' scr-test-002 ');

    expect(result).toEqual({
      id: scoreResultId.toString(),
      patientId: patientId.toString(),
      assessmentVisitId: visitId.toString(),
      scaleInstanceId: scaleInstanceId.toString(),
      subjectCode: 'SUBJ-TEST-001',
      scaleDefinitionId: definitionId.toString(),
      scaleVersionId: versionId.toString(),
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode: 'INST-TEST-001',
      scoreResultCode: 'SCR-TEST-002',
      runNo: 1,
      status: 'computed',
      scoringSource: 'auto_rule',
      scoringMode: 'rule_based',
      versionTrace: {
        scaleVersion: '1.0',
        crfVersion: 'crf-test-1',
        scoringRuleVersion: 'score-test-1',
        fieldEncodingVersion: 'field-test-1',
        sourceDocument: 'source-test',
      },
      totalScore: {
        scoreValue: 2,
        maxScore: 3,
        minScore: 0,
        scorePercent: 66.66666666666666,
        scoredItemCount: 2,
        totalItemCount: 3,
        unscoredItemCount: 1,
        missingItemCount: 1,
        needsReviewItemCount: 1,
      },
      itemScores: [
        {
          itemResponseId: itemResponseId.toString(),
          itemCode: 'moca.recall.delayed.free.face',
          crfCode: undefined,
          groupCode: 'memory',
          itemTitle: undefined,
          itemOrder: 13,
          responseType: 'text',
          countsTowardTotal: true,
          includedInTotal: true,
          scoreValue: 1,
          maxScore: 1,
          minScore: 0,
          scoreStatus: 'auto_scored',
          scoreSource: 'auto_rule',
          isMissing: false,
          cognitiveDomainCodes: ['memory'],
          note: undefined,
        },
      ],
      groupScores: [
        {
          groupCode: 'memory',
          groupTitle: 'Memory sample',
          scoreValue: 2,
          maxScore: 2,
          minScore: 0,
          scoredItemCount: 2,
          totalItemCount: 2,
          note: 'De-identified group score note',
        },
      ],
      computation: {
        computedAt,
        computedBy: computedBy.toString(),
        ruleSetCode: 'RULE-TEST-002',
        ruleSetVersion: 'rule-test-2',
        engineVersion: 'scoring-base-test-2',
        inputItemCount: 1,
        includedItemCount: 1,
        excludedItemCount: 0,
        warningCount: 0,
        notes: undefined,
      },
      review: {
        reviewStatus: 'reviewed',
        reviewedAt: computedAt,
        reviewerId: reviewerId.toString(),
        reviewerName: 'Sample Reviewer',
        reviewNote: 'De-identified review note',
      },
      qualityStatus: 'passed',
      qualityHints: { needsReview: false },
      operatorNote: 'De-identified operator note',
      metadata: { source: 'unit-test' },
      confirmedAt: null,
      lockedAt: null,
      voidedAt: null,
    });
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('internalMarker');
    expect(scoreResultModel.findOne).toHaveBeenCalledWith({
      scoreResultCode: 'SCR-TEST-002',
    });
  });

  it('finds latest score result by scale instance id ordered by run number and createdAt', async () => {
    const scaleInstanceId = new Types.ObjectId();
    const sort = jest
      .fn()
      .mockReturnValue(
        createExecQuery(
          createScoreResultFixture({ scaleInstanceId, runNo: 2 }),
        ),
      );
    scoreResultModel.findOne.mockReturnValue({ sort });

    const result =
      await service.findLatestScoreResultByScaleInstanceId(scaleInstanceId);

    expect(scoreResultModel.findOne).toHaveBeenCalledWith({ scaleInstanceId });
    expect(sort).toHaveBeenCalledWith({ runNo: -1, createdAt: -1 });
    expect(result).toEqual(
      expect.objectContaining({
        scaleInstanceId: scaleInstanceId.toString(),
        runNo: 2,
      }),
    );
  });

  it('finds a specific run and creates an explicitly controlled score result', async () => {
    const scaleInstanceId = new Types.ObjectId();
    const created = createScoreResultFixture({ scaleInstanceId });
    scoreResultModel.findOne.mockReturnValue(createExecQuery(created));
    scoreResultModel.create.mockResolvedValue(created);

    await expect(
      service.findScoreResultByScaleInstanceAndRunNo(scaleInstanceId, 1),
    ).resolves.toEqual(expect.objectContaining({ runNo: 1 }));
    expect(scoreResultModel.findOne).toHaveBeenCalledWith({
      scaleInstanceId,
      runNo: 1,
    });

    await service.createScoreResult({
      patientId: created.patientId.toString(),
      assessmentVisitId: created.assessmentVisitId.toString(),
      scaleInstanceId: created.scaleInstanceId.toString(),
      subjectCode: created.subjectCode,
      scaleDefinitionId: created.scaleDefinitionId.toString(),
      scaleVersionId: created.scaleVersionId.toString(),
      scaleCode: created.scaleCode,
      scaleVersion: created.scaleVersion,
      instanceCode: created.instanceCode,
      scoreResultCode: created.scoreResultCode,
      runNo: 1,
      status: 'needs_review',
      scoringSource: 'manual',
      scoringMode: 'rule_based',
      versionTrace: { scaleVersion: '1.0' },
      totalScore: created.totalScore,
      itemScores: [],
      groupScores: [],
      computation: {
        computedAt: new Date(),
        inputItemCount: 1,
        includedItemCount: 1,
        excludedItemCount: 0,
        warningCount: 0,
      },
      review: {
        reviewStatus: 'pending',
      },
      qualityStatus: 'needs_review',
    });
    expect(scoreResultModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runNo: 1,
        status: 'needs_review',
      }),
    );
    const createCalls: unknown = scoreResultModel.create.mock.calls;
    if (!Array.isArray(createCalls)) throw new Error('Expected create calls');
    const firstCall: unknown = createCalls[0];
    if (!Array.isArray(firstCall))
      throw new Error('Expected first create call');
    const createArgument: unknown = firstCall[0];
    if (!isRecord(createArgument)) throw new Error('Expected create input');
    expect(createArgument).not.toHaveProperty('confirmedAt');
    expect(createArgument).not.toHaveProperty('lockedAt');
    expect(createArgument).not.toHaveProperty('voidedAt');
    expect(createArgument).not.toHaveProperty('metadata');
    expect(createArgument).not.toHaveProperty('qualityHints');
  });

  it('lists score results by scale instance id ordered by run number and createdAt', async () => {
    const scaleInstanceId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        createScoreResultFixture({
          scaleInstanceId,
          scoreResultCode: 'SCR-TEST-003',
        }),
      ]),
    );
    scoreResultModel.find.mockReturnValue({ sort });

    const result =
      await service.listScoreResultsByScaleInstanceId(scaleInstanceId);

    expect(scoreResultModel.find).toHaveBeenCalledWith({ scaleInstanceId });
    expect(sort).toHaveBeenCalledWith({ runNo: 1, createdAt: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        scaleInstanceId: scaleInstanceId.toString(),
        scoreResultCode: 'SCR-TEST-003',
      }),
    );
    expect(result[0]).not.toHaveProperty('internalMarker');
  });

  it('lists score results by visit id ordered by scale code and createdAt', async () => {
    const assessmentVisitId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        createScoreResultFixture({
          assessmentVisitId,
          scoreResultCode: 'SCR-TEST-004',
        }),
      ]),
    );
    scoreResultModel.find.mockReturnValue({ sort });

    const result = await service.listScoreResultsByVisitId(assessmentVisitId);

    expect(scoreResultModel.find).toHaveBeenCalledWith({ assessmentVisitId });
    expect(sort).toHaveBeenCalledWith({ scaleCode: 1, createdAt: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        assessmentVisitId: assessmentVisitId.toString(),
        scoreResultCode: 'SCR-TEST-004',
      }),
    );
  });

  it('lists score results by patient id ordered by newest createdAt first', async () => {
    const patientId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        createScoreResultFixture({
          patientId,
          scoreResultCode: 'SCR-TEST-005',
        }),
      ]),
    );
    scoreResultModel.find.mockReturnValue({ sort });

    const result = await service.listScoreResultsByPatientId(patientId);

    expect(scoreResultModel.find).toHaveBeenCalledWith({ patientId });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        patientId: patientId.toString(),
        scoreResultCode: 'SCR-TEST-005',
      }),
    );
  });

  it('summarizes item scores without database writes or scale-specific rules', () => {
    const summary = service.summarizeItemScores([
      {
        itemCode: 'MMSE.Attention.Serial_Sevens.Step_1',
        groupCode: 'attention',
        countsTowardTotal: true,
        scoreValue: 0,
        maxScore: 1,
        minScore: 0,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        itemOrder: 1,
        cognitiveDomainCodes: ['attention'],
      },
      {
        itemCode: 'mmse.attention.serial_sevens.step_2',
        groupCode: 'attention',
        countsTowardTotal: true,
        scoreValue: 1,
        maxScore: 1,
        minScore: 0,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        itemOrder: 2,
        cognitiveDomainCodes: ['attention'],
        note: 'Step score remains independent from previous step.',
      },
      {
        itemCode: 'moca.memory.immediate.trial_1.face',
        groupCode: 'memory',
        countsTowardTotal: false,
        scoreValue: 1,
        maxScore: 1,
        minScore: 0,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        itemOrder: 3,
        cognitiveDomainCodes: ['memory'],
      },
      {
        itemCode: 'moca.recall.delayed.free.face',
        groupCode: 'memory',
        countsTowardTotal: true,
        isMissing: true,
        scoreValue: null,
        maxScore: 1,
        minScore: 0,
        scoreStatus: 'needs_review',
        scoreSource: 'none',
        itemOrder: 4,
        cognitiveDomainCodes: ['memory'],
      },
    ]);

    expect(summary.totalScore).toEqual({
      scoreValue: 1,
      maxScore: 3,
      minScore: 0,
      scorePercent: 33.33333333333333,
      scoredItemCount: 3,
      totalItemCount: 4,
      unscoredItemCount: 1,
      missingItemCount: 1,
      needsReviewItemCount: 1,
    });
    expect(summary.inputItemCount).toBe(4);
    expect(summary.includedItemCount).toBe(3);
    expect(summary.excludedItemCount).toBe(1);
    expect(summary.scoredItemCount).toBe(3);
    expect(summary.unscoredItemCount).toBe(1);
    expect(summary.missingItemCount).toBe(1);
    expect(summary.needsReviewItemCount).toBe(1);
    expect(summary.itemScores).toEqual([
      expect.objectContaining({
        itemCode: 'mmse.attention.serial_sevens.step_1',
        countsTowardTotal: true,
        includedInTotal: true,
        scoreValue: 0,
      }),
      expect.objectContaining({
        itemCode: 'mmse.attention.serial_sevens.step_2',
        countsTowardTotal: true,
        includedInTotal: true,
        scoreValue: 1,
      }),
      expect.objectContaining({
        itemCode: 'moca.memory.immediate.trial_1.face',
        countsTowardTotal: false,
        includedInTotal: false,
        scoreValue: 1,
      }),
      expect.objectContaining({
        itemCode: 'moca.recall.delayed.free.face',
        countsTowardTotal: true,
        includedInTotal: false,
        scoreValue: null,
        isMissing: true,
        scoreStatus: 'needs_review',
      }),
    ]);
    expect(summary.groupScores).toEqual([
      {
        groupCode: 'attention',
        scoreValue: 1,
        maxScore: 2,
        minScore: 0,
        scoredItemCount: 2,
        totalItemCount: 2,
      },
      {
        groupCode: 'memory',
        scoreValue: 1,
        maxScore: 2,
        minScore: 0,
        scoredItemCount: 1,
        totalItemCount: 2,
      },
    ]);
    expect(summary.warnings).toEqual([]);
    expect(summary).not.toHaveProperty('cognitiveDomainResults');
    expect(scoreResultModel.find).not.toHaveBeenCalled();
    expect(scoreResultModel.findOne).not.toHaveBeenCalled();
  });

  it('treats non-finite scores as unscored and records warnings', () => {
    const summary = service.summarizeItemScores([
      {
        itemCode: 'moca.recall.delayed.free.face',
        groupCode: 'memory',
        countsTowardTotal: true,
        scoreValue: Number.POSITIVE_INFINITY,
        maxScore: Number.NaN,
        minScore: 0,
        scoreStatus: 'auto_scored',
        scoreSource: 'auto_rule',
      },
    ]);

    expect(summary.totalScore).toEqual({
      scoreValue: null,
      maxScore: null,
      minScore: 0,
      scorePercent: null,
      scoredItemCount: 0,
      totalItemCount: 1,
      unscoredItemCount: 1,
      missingItemCount: 0,
      needsReviewItemCount: 0,
    });
    expect(summary.itemScores[0]).toEqual(
      expect.objectContaining({
        scoreValue: null,
        maxScore: null,
        minScore: 0,
        includedInTotal: false,
      }),
    );
    expect(summary.warnings).toEqual([
      {
        itemCode: 'moca.recall.delayed.free.face',
        field: 'scoreValue',
        message: 'scoreValue is not a finite number.',
      },
      {
        itemCode: 'moca.recall.delayed.free.face',
        field: 'maxScore',
        message: 'maxScore is not a finite number.',
      },
    ]);
  });

  it('supports provisional totals that exclude process items and suppress partial percentages', () => {
    const summary = service.summarizeItemScores(
      [
        {
          itemCode: 'test.auto',
          groupCode: 'group',
          countsTowardTotal: true,
          scoreValue: 1,
          minScore: 0,
          maxScore: 1,
          scoreStatus: 'auto_scored',
          scoreSource: 'auto_rule',
        },
        {
          itemCode: 'test.review',
          groupCode: 'group',
          countsTowardTotal: true,
          scoreValue: null,
          minScore: 0,
          maxScore: 1,
          scoreStatus: 'needs_review',
          scoreSource: 'none',
        },
        {
          itemCode: 'test.process',
          groupCode: 'group',
          countsTowardTotal: false,
          scoreValue: null,
          minScore: 0,
          maxScore: 0,
          scoreStatus: 'not_scored',
          scoreSource: 'none',
        },
      ],
      { provisional: true },
    );

    expect(summary.totalScore).toEqual(
      expect.objectContaining({
        scoreValue: 1,
        totalItemCount: 2,
        scoredItemCount: 1,
        unscoredItemCount: 1,
        needsReviewItemCount: 1,
        scorePercent: null,
      }),
    );
    expect(summary.groupScores[0].totalItemCount).toBe(2);
    expect(summary.excludedItemCount).toBe(1);
  });
});
