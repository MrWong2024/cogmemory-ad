// backend/src/modules/cognitive-domains/services/cognitive-domains.service.spec.ts
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import {
  CognitiveDomainComputationSnapshotSchema,
  CognitiveDomainItemContributionSnapshotSchema,
  CognitiveDomainMappingSnapshotSchema,
  CognitiveDomainResult,
  CognitiveDomainResultSchema,
  CognitiveDomainReviewSnapshotSchema,
  CognitiveDomainScoreSnapshotSchema,
  CognitiveDomainVersionTraceSchema,
} from '../schemas/cognitive-domain-result.schema';
import { CognitiveDomainsService } from './cognitive-domains.service';

function createExecQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

function createDomainResultFixture(overrides: Record<string, unknown> = {}) {
  const scoreResultId = new Types.ObjectId();

  return {
    _id: new Types.ObjectId(),
    patientId: new Types.ObjectId(),
    assessmentVisitId: new Types.ObjectId(),
    scaleInstanceId: new Types.ObjectId(),
    scoreResultId,
    subjectCode: 'SUBJ-TEST-001',
    scaleDefinitionId: new Types.ObjectId(),
    scaleVersionId: new Types.ObjectId(),
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: 'INST-TEST-001',
    domainResultCode: 'CDR-TEST-001',
    runNo: 1,
    status: 'computed',
    mappingSource: 'scale_config',
    mappingMode: 'weighted_mapping',
    versionTrace: {
      scaleVersion: '1.0',
      crfVersion: 'crf-test-1',
      scoringRuleVersion: 'score-test-1',
      fieldEncodingVersion: 'field-test-1',
      domainMappingVersion: 'domain-map-test-1',
      sourceDocument: 'source-test',
    },
    domainScores: [
      {
        domainCode: 'memory',
        domainTitle: 'Memory sample',
        scoreValue: 2,
        maxScore: 3,
        minScore: 0,
        scorePercent: 66.66666666666666,
        weightedScore: 2,
        weightedMaxScore: 3,
        itemCount: 3,
        scoredItemCount: 2,
        unscoredItemCount: 1,
        missingItemCount: 1,
        needsReviewItemCount: 1,
        excludedItemCount: 1,
        note: 'De-identified domain score note',
      },
    ],
    itemContributions: [
      {
        itemResponseId: new Types.ObjectId(),
        scoreResultId,
        itemCode: 'moca.memory.delayed.face',
        crfCode: 'N1.2.13.1',
        groupCode: 'memory',
        itemTitle: 'Delayed recall face sample',
        itemOrder: 13,
        domainCode: 'memory',
        domainTitle: 'Memory sample',
        weight: 1,
        countsTowardDomain: true,
        scoreValue: 1,
        maxScore: 1,
        weightedScore: 1,
        weightedMaxScore: 1,
        scoreStatus: 'auto_scored',
        scoreSource: 'auto_rule',
        isMissing: false,
        note: 'De-identified contribution note',
      },
    ],
    mappingSnapshot: {
      mappingVersion: 'domain-map-test-1',
      mappingSource: 'scale_config',
      domainCodes: ['memory'],
      mappingRules: { source: 'unit-test' },
      notes: 'De-identified mapping note',
    },
    computation: {
      computedAt: new Date('2026-01-08T08:00:00.000Z'),
      computedBy: new Types.ObjectId(),
      ruleSetCode: 'DOMAIN-RULE-TEST-001',
      ruleSetVersion: 'domain-rule-test-1',
      engineVersion: 'domain-summary-test-1',
      inputItemCount: 3,
      contributionCount: 3,
      domainCount: 1,
      includedContributionCount: 2,
      excludedContributionCount: 1,
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

describe('CognitiveDomainResult schema', () => {
  it('defines collection and indexes', () => {
    expect(CognitiveDomainResultSchema.get('collection')).toBe(
      'cognitive_domain_results',
    );
    expect(CognitiveDomainResultSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ domainResultCode: 1 }, expect.objectContaining({ unique: true })],
        [
          { scaleInstanceId: 1, runNo: 1 },
          expect.objectContaining({ unique: true }),
        ],
        [{ scoreResultId: 1, runNo: 1 }, expect.any(Object)],
        [{ scaleInstanceId: 1, status: 1, createdAt: -1 }, expect.any(Object)],
        [
          { assessmentVisitId: 1, scaleCode: 1, createdAt: -1 },
          expect.any(Object),
        ],
        [{ patientId: 1, scaleCode: 1, createdAt: -1 }, expect.any(Object)],
        [{ status: 1, updatedAt: -1 }, expect.any(Object)],
        [{ scaleCode: 1, scaleVersion: 1 }, expect.any(Object)],
        [{ qualityStatus: 1, updatedAt: -1 }, expect.any(Object)],
        [{ 'domainScores.domainCode': 1 }, expect.any(Object)],
      ]),
    );
  });

  it('defines explicit ObjectId, primitive, nullable and Mixed field types', () => {
    expect(CognitiveDomainResultSchema.path('patientId')?.instance).toBe(
      'ObjectId',
    );
    expect(
      CognitiveDomainResultSchema.path('assessmentVisitId')?.instance,
    ).toBe('ObjectId');
    expect(CognitiveDomainResultSchema.path('scaleInstanceId')?.instance).toBe(
      'ObjectId',
    );
    expect(CognitiveDomainResultSchema.path('scoreResultId')?.instance).toBe(
      'ObjectId',
    );
    expect(
      CognitiveDomainResultSchema.path('scaleDefinitionId')?.instance,
    ).toBe('ObjectId');
    expect(CognitiveDomainResultSchema.path('scaleVersionId')?.instance).toBe(
      'ObjectId',
    );
    expect(CognitiveDomainResultSchema.path('domainResultCode')?.instance).toBe(
      'String',
    );
    expect(CognitiveDomainResultSchema.path('runNo')?.instance).toBe('Number');
    expect(CognitiveDomainResultSchema.path('status')?.instance).toBe('String');
    expect(CognitiveDomainResultSchema.path('mappingSource')?.instance).toBe(
      'String',
    );
    expect(CognitiveDomainResultSchema.path('mappingMode')?.instance).toBe(
      'String',
    );
    expect(CognitiveDomainResultSchema.path('qualityStatus')?.instance).toBe(
      'String',
    );
    expect(CognitiveDomainResultSchema.path('qualityHints')?.instance).toBe(
      'Mixed',
    );
    expect(CognitiveDomainResultSchema.path('metadata')?.instance).toBe(
      'Mixed',
    );
    expect(CognitiveDomainResultSchema.path('confirmedAt')?.instance).toBe(
      'Date',
    );
    expect(CognitiveDomainResultSchema.path('lockedAt')?.instance).toBe('Date');
    expect(CognitiveDomainResultSchema.path('voidedAt')?.instance).toBe('Date');

    expect(
      CognitiveDomainVersionTraceSchema.path('domainMappingVersion')?.instance,
    ).toBe('String');
    expect(
      CognitiveDomainScoreSnapshotSchema.path('domainCode')?.instance,
    ).toBe('String');
    expect(
      CognitiveDomainScoreSnapshotSchema.path('scoreValue')?.instance,
    ).toBe('Number');
    expect(CognitiveDomainScoreSnapshotSchema.path('maxScore')?.instance).toBe(
      'Number',
    );
    expect(CognitiveDomainScoreSnapshotSchema.path('minScore')?.instance).toBe(
      'Number',
    );
    expect(
      CognitiveDomainScoreSnapshotSchema.path('scorePercent')?.instance,
    ).toBe('Number');
    expect(
      CognitiveDomainScoreSnapshotSchema.path('weightedScore')?.instance,
    ).toBe('Number');
    expect(
      CognitiveDomainScoreSnapshotSchema.path('weightedMaxScore')?.instance,
    ).toBe('Number');
    expect(CognitiveDomainScoreSnapshotSchema.path('itemCount')?.instance).toBe(
      'Number',
    );
    expect(
      CognitiveDomainItemContributionSnapshotSchema.path('itemResponseId')
        ?.instance,
    ).toBe('ObjectId');
    expect(
      CognitiveDomainItemContributionSnapshotSchema.path('scoreResultId')
        ?.instance,
    ).toBe('ObjectId');
    expect(
      CognitiveDomainItemContributionSnapshotSchema.path('itemOrder')?.instance,
    ).toBe('Number');
    expect(
      CognitiveDomainItemContributionSnapshotSchema.path('domainCode')
        ?.instance,
    ).toBe('String');
    expect(
      CognitiveDomainItemContributionSnapshotSchema.path('weight')?.instance,
    ).toBe('Number');
    expect(
      CognitiveDomainItemContributionSnapshotSchema.path('countsTowardDomain')
        ?.instance,
    ).toBe('Boolean');
    expect(
      CognitiveDomainItemContributionSnapshotSchema.path('scoreValue')
        ?.instance,
    ).toBe('Number');
    expect(
      CognitiveDomainItemContributionSnapshotSchema.path('maxScore')?.instance,
    ).toBe('Number');
    expect(
      CognitiveDomainItemContributionSnapshotSchema.path('weightedScore')
        ?.instance,
    ).toBe('Number');
    expect(
      CognitiveDomainItemContributionSnapshotSchema.path('weightedMaxScore')
        ?.instance,
    ).toBe('Number');
    expect(
      CognitiveDomainItemContributionSnapshotSchema.path('scoreStatus')
        ?.instance,
    ).toBe('String');
    expect(
      CognitiveDomainItemContributionSnapshotSchema.path('scoreSource')
        ?.instance,
    ).toBe('String');
    expect(
      CognitiveDomainItemContributionSnapshotSchema.path('isMissing')?.instance,
    ).toBe('Boolean');
    expect(
      CognitiveDomainMappingSnapshotSchema.path('domainCodes')?.instance,
    ).toBe('Array');
    expect(
      CognitiveDomainMappingSnapshotSchema.path('mappingRules')?.instance,
    ).toBe('Mixed');
    expect(
      CognitiveDomainComputationSnapshotSchema.path('computedAt')?.instance,
    ).toBe('Date');
    expect(
      CognitiveDomainComputationSnapshotSchema.path('computedBy')?.instance,
    ).toBe('ObjectId');
    expect(
      CognitiveDomainComputationSnapshotSchema.path('inputItemCount')?.instance,
    ).toBe('Number');
    expect(
      CognitiveDomainComputationSnapshotSchema.path('contributionCount')
        ?.instance,
    ).toBe('Number');
    expect(
      CognitiveDomainComputationSnapshotSchema.path('domainCount')?.instance,
    ).toBe('Number');
    expect(
      CognitiveDomainReviewSnapshotSchema.path('reviewStatus')?.instance,
    ).toBe('String');
    expect(
      CognitiveDomainReviewSnapshotSchema.path('reviewedAt')?.instance,
    ).toBe('Date');
    expect(
      CognitiveDomainReviewSnapshotSchema.path('reviewerId')?.instance,
    ).toBe('ObjectId');
  });

  it('keeps embedded schemas without nested _id fields', () => {
    expect(CognitiveDomainVersionTraceSchema.get('_id')).toBe(false);
    expect(CognitiveDomainScoreSnapshotSchema.get('_id')).toBe(false);
    expect(CognitiveDomainItemContributionSnapshotSchema.get('_id')).toBe(
      false,
    );
    expect(CognitiveDomainMappingSnapshotSchema.get('_id')).toBe(false);
    expect(CognitiveDomainComputationSnapshotSchema.get('_id')).toBe(false);
    expect(CognitiveDomainReviewSnapshotSchema.get('_id')).toBe(false);
  });
});

describe('CognitiveDomainsService', () => {
  let service: CognitiveDomainsService;
  let cognitiveDomainResultModel: {
    findOne: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(async () => {
    cognitiveDomainResultModel = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CognitiveDomainsService,
        {
          provide: getModelToken(CognitiveDomainResult.name),
          useValue: cognitiveDomainResultModel,
        },
      ],
    }).compile();

    service = moduleRef.get(CognitiveDomainsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes domain result code and domain code', () => {
    expect(service.normalizeDomainResultCode('  cdr-test-001  ')).toBe(
      'CDR-TEST-001',
    );
    expect(service.normalizeDomainCode('  Executive_Function  ')).toBe(
      'executive_function',
    );
  });

  it('returns null when domain result is not found', async () => {
    cognitiveDomainResultModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(
      service.findDomainResultByCode('CDR-UNKNOWN-001'),
    ).resolves.toBeNull();
    expect(cognitiveDomainResultModel.findOne).toHaveBeenCalledWith({
      domainResultCode: 'CDR-UNKNOWN-001',
    });
  });

  it('maps domain result output instead of returning raw documents', async () => {
    const domainResultId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    const scoreResultId = new Types.ObjectId();
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const itemResponseId = new Types.ObjectId();
    const computedAt = new Date('2026-01-08T08:00:00.000Z');
    const computedBy = new Types.ObjectId();
    const reviewerId = new Types.ObjectId();
    const rawDomainResult = createDomainResultFixture({
      _id: domainResultId,
      patientId,
      assessmentVisitId: visitId,
      scaleInstanceId,
      scoreResultId,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      domainResultCode: 'CDR-TEST-002',
      itemContributions: [
        {
          itemResponseId,
          scoreResultId,
          itemCode: 'moca.memory.delayed.face',
          groupCode: 'memory',
          itemOrder: 13,
          domainCode: 'memory',
          domainTitle: 'Memory sample',
          weight: 1,
          countsTowardDomain: true,
          scoreValue: 1,
          maxScore: 1,
          weightedScore: 1,
          weightedMaxScore: 1,
          scoreStatus: 'auto_scored',
          scoreSource: 'auto_rule',
          isMissing: false,
        },
      ],
      computation: {
        computedAt,
        computedBy,
        ruleSetCode: 'DOMAIN-RULE-TEST-002',
        ruleSetVersion: 'domain-rule-test-2',
        engineVersion: 'domain-summary-test-2',
        inputItemCount: 1,
        contributionCount: 1,
        domainCount: 1,
        includedContributionCount: 1,
        excludedContributionCount: 0,
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
    cognitiveDomainResultModel.findOne.mockReturnValue(
      createExecQuery(rawDomainResult),
    );

    const result = await service.findDomainResultByCode(' cdr-test-002 ');

    expect(result).toEqual({
      id: domainResultId.toString(),
      patientId: patientId.toString(),
      assessmentVisitId: visitId.toString(),
      scaleInstanceId: scaleInstanceId.toString(),
      scoreResultId: scoreResultId.toString(),
      subjectCode: 'SUBJ-TEST-001',
      scaleDefinitionId: definitionId.toString(),
      scaleVersionId: versionId.toString(),
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode: 'INST-TEST-001',
      domainResultCode: 'CDR-TEST-002',
      runNo: 1,
      status: 'computed',
      mappingSource: 'scale_config',
      mappingMode: 'weighted_mapping',
      versionTrace: {
        scaleVersion: '1.0',
        crfVersion: 'crf-test-1',
        scoringRuleVersion: 'score-test-1',
        fieldEncodingVersion: 'field-test-1',
        domainMappingVersion: 'domain-map-test-1',
        sourceDocument: 'source-test',
      },
      domainScores: [
        {
          domainCode: 'memory',
          domainTitle: 'Memory sample',
          scoreValue: 2,
          maxScore: 3,
          minScore: 0,
          scorePercent: 66.66666666666666,
          weightedScore: 2,
          weightedMaxScore: 3,
          itemCount: 3,
          scoredItemCount: 2,
          unscoredItemCount: 1,
          missingItemCount: 1,
          needsReviewItemCount: 1,
          excludedItemCount: 1,
          note: 'De-identified domain score note',
        },
      ],
      itemContributions: [
        {
          itemResponseId: itemResponseId.toString(),
          scoreResultId: scoreResultId.toString(),
          itemCode: 'moca.memory.delayed.face',
          crfCode: undefined,
          groupCode: 'memory',
          itemTitle: undefined,
          itemOrder: 13,
          domainCode: 'memory',
          domainTitle: 'Memory sample',
          weight: 1,
          countsTowardDomain: true,
          scoreValue: 1,
          maxScore: 1,
          weightedScore: 1,
          weightedMaxScore: 1,
          scoreStatus: 'auto_scored',
          scoreSource: 'auto_rule',
          isMissing: false,
          note: undefined,
        },
      ],
      mappingSnapshot: {
        mappingVersion: 'domain-map-test-1',
        mappingSource: 'scale_config',
        domainCodes: ['memory'],
        mappingRules: { source: 'unit-test' },
        notes: 'De-identified mapping note',
      },
      computation: {
        computedAt,
        computedBy: computedBy.toString(),
        ruleSetCode: 'DOMAIN-RULE-TEST-002',
        ruleSetVersion: 'domain-rule-test-2',
        engineVersion: 'domain-summary-test-2',
        inputItemCount: 1,
        contributionCount: 1,
        domainCount: 1,
        includedContributionCount: 1,
        excludedContributionCount: 0,
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
    expect(cognitiveDomainResultModel.findOne).toHaveBeenCalledWith({
      domainResultCode: 'CDR-TEST-002',
    });
  });

  it('finds latest domain result by scale instance id ordered by run number and createdAt', async () => {
    const scaleInstanceId = new Types.ObjectId();
    const sort = jest
      .fn()
      .mockReturnValue(
        createExecQuery(
          createDomainResultFixture({ scaleInstanceId, runNo: 2 }),
        ),
      );
    cognitiveDomainResultModel.findOne.mockReturnValue({ sort });

    const result =
      await service.findLatestDomainResultByScaleInstanceId(scaleInstanceId);

    expect(cognitiveDomainResultModel.findOne).toHaveBeenCalledWith({
      scaleInstanceId,
    });
    expect(sort).toHaveBeenCalledWith({ runNo: -1, createdAt: -1 });
    expect(result).toEqual(
      expect.objectContaining({
        scaleInstanceId: scaleInstanceId.toString(),
        runNo: 2,
      }),
    );
  });

  it('lists domain results by scale instance id ordered by run number and createdAt', async () => {
    const scaleInstanceId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        createDomainResultFixture({
          scaleInstanceId,
          domainResultCode: 'CDR-TEST-003',
        }),
      ]),
    );
    cognitiveDomainResultModel.find.mockReturnValue({ sort });

    const result =
      await service.listDomainResultsByScaleInstanceId(scaleInstanceId);

    expect(cognitiveDomainResultModel.find).toHaveBeenCalledWith({
      scaleInstanceId,
    });
    expect(sort).toHaveBeenCalledWith({ runNo: 1, createdAt: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        scaleInstanceId: scaleInstanceId.toString(),
        domainResultCode: 'CDR-TEST-003',
      }),
    );
    expect(result[0]).not.toHaveProperty('internalMarker');
  });

  it('lists domain results by score result id ordered by run number and createdAt', async () => {
    const scoreResultId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        createDomainResultFixture({
          scoreResultId,
          domainResultCode: 'CDR-TEST-004',
        }),
      ]),
    );
    cognitiveDomainResultModel.find.mockReturnValue({ sort });

    const result =
      await service.listDomainResultsByScoreResultId(scoreResultId);

    expect(cognitiveDomainResultModel.find).toHaveBeenCalledWith({
      scoreResultId,
    });
    expect(sort).toHaveBeenCalledWith({ runNo: 1, createdAt: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        scoreResultId: scoreResultId.toString(),
        domainResultCode: 'CDR-TEST-004',
      }),
    );
  });

  it('lists domain results by visit id ordered by scale code and createdAt', async () => {
    const assessmentVisitId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        createDomainResultFixture({
          assessmentVisitId,
          domainResultCode: 'CDR-TEST-005',
        }),
      ]),
    );
    cognitiveDomainResultModel.find.mockReturnValue({ sort });

    const result = await service.listDomainResultsByVisitId(assessmentVisitId);

    expect(cognitiveDomainResultModel.find).toHaveBeenCalledWith({
      assessmentVisitId,
    });
    expect(sort).toHaveBeenCalledWith({ scaleCode: 1, createdAt: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        assessmentVisitId: assessmentVisitId.toString(),
        domainResultCode: 'CDR-TEST-005',
      }),
    );
  });

  it('lists domain results by patient id ordered by newest createdAt first', async () => {
    const patientId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        createDomainResultFixture({
          patientId,
          domainResultCode: 'CDR-TEST-006',
        }),
      ]),
    );
    cognitiveDomainResultModel.find.mockReturnValue({ sort });

    const result = await service.listDomainResultsByPatientId(patientId);

    expect(cognitiveDomainResultModel.find).toHaveBeenCalledWith({ patientId });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        patientId: patientId.toString(),
        domainResultCode: 'CDR-TEST-006',
      }),
    );
  });

  it('summarizes cognitive domain scores from mappings without diagnosis output', () => {
    const itemResponseId = new Types.ObjectId().toString();
    const summary = service.summarizeDomainScores([
      {
        itemCode: 'MMSE.Attention.Serial_Sevens.Step_1',
        itemResponseId,
        crfCode: 'N1.1.5.1',
        groupCode: 'Attention',
        itemTitle: 'Serial sevens step 1',
        itemOrder: 1,
        scoreValue: 1,
        maxScore: 1,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        cognitiveDomainCodes: ['attention', 'Executive_Function'],
      },
      {
        itemCode: 'moca.visuospatial.clock',
        groupCode: 'visuospatial',
        itemOrder: 2,
        scoreValue: 2,
        maxScore: 3,
        scoreStatus: 'auto_scored',
        scoreSource: 'auto_rule',
        domainMappings: [
          {
            domainCode: 'Visuospatial',
            domainTitle: 'Visuospatial sample',
            weight: 2,
          },
          {
            domainCode: 'executive_function',
            weight: 0.5,
          },
        ],
      },
      {
        itemCode: 'moca.memory.immediate.trial_1.face',
        itemOrder: 3,
        scoreValue: 1,
        maxScore: 1,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        domainMappings: [
          {
            domainCode: 'memory',
            countsTowardDomain: false,
          },
        ],
      },
      {
        itemCode: 'moca.memory.delayed.face',
        itemOrder: 4,
        scoreValue: null,
        maxScore: 1,
        scoreStatus: 'needs_review',
        isMissing: true,
        cognitiveDomainCodes: ['memory'],
      },
      {
        itemCode: 'moca.language.naming.lion',
        itemOrder: 5,
        scoreValue: Number.POSITIVE_INFINITY,
        maxScore: Number.NaN,
        scoreStatus: 'auto_scored',
        domainMappings: [
          {
            domainCode: 'language',
            weight: Number.POSITIVE_INFINITY,
          },
          {
            domainCode: 'attention_calculation',
            weight: 2,
          },
        ],
      },
    ]);

    expect(summary.inputItemCount).toBe(5);
    expect(summary.contributionCount).toBe(8);
    expect(summary.domainCount).toBe(6);
    expect(summary.includedContributionCount).toBe(7);
    expect(summary.excludedContributionCount).toBe(1);
    expect(summary.scoredContributionCount).toBe(5);
    expect(summary.unscoredContributionCount).toBe(3);
    expect(summary.missingContributionCount).toBe(1);
    expect(summary.needsReviewContributionCount).toBe(1);
    expect(summary.itemContributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemResponseId,
          scoreResultId: null,
          itemCode: 'mmse.attention.serial_sevens.step_1',
          groupCode: 'attention',
          domainCode: 'attention',
          weight: 1,
          countsTowardDomain: true,
          scoreValue: 1,
          maxScore: 1,
          weightedScore: 1,
          weightedMaxScore: 1,
        }),
        expect.objectContaining({
          itemCode: 'mmse.attention.serial_sevens.step_1',
          domainCode: 'executive_function',
          weight: 1,
        }),
        expect.objectContaining({
          itemCode: 'moca.visuospatial.clock',
          domainCode: 'visuospatial',
          domainTitle: 'Visuospatial sample',
          weight: 2,
          weightedScore: 4,
          weightedMaxScore: 6,
        }),
        expect.objectContaining({
          itemCode: 'moca.memory.immediate.trial_1.face',
          domainCode: 'memory',
          countsTowardDomain: false,
          scoreValue: 1,
          weightedScore: 1,
        }),
        expect.objectContaining({
          itemCode: 'moca.memory.delayed.face',
          domainCode: 'memory',
          scoreValue: null,
          isMissing: true,
          scoreStatus: 'needs_review',
        }),
        expect.objectContaining({
          itemCode: 'moca.language.naming.lion',
          domainCode: 'language',
          weight: 1,
          scoreValue: null,
          maxScore: null,
        }),
      ]),
    );
    expect(summary.domainScores).toEqual([
      expect.objectContaining({
        domainCode: 'attention',
        scoreValue: 1,
        maxScore: 1,
        scorePercent: 100,
        itemCount: 1,
        scoredItemCount: 1,
        excludedItemCount: 0,
      }),
      expect.objectContaining({
        domainCode: 'executive_function',
        scoreValue: 2,
        maxScore: 2.5,
        scorePercent: 80,
        itemCount: 2,
        scoredItemCount: 2,
      }),
      expect.objectContaining({
        domainCode: 'visuospatial',
        domainTitle: 'Visuospatial sample',
        scoreValue: 4,
        maxScore: 6,
        scorePercent: 66.66666666666666,
      }),
      expect.objectContaining({
        domainCode: 'memory',
        scoreValue: null,
        maxScore: 1,
        scorePercent: null,
        itemCount: 2,
        scoredItemCount: 1,
        unscoredItemCount: 1,
        missingItemCount: 1,
        needsReviewItemCount: 1,
        excludedItemCount: 1,
      }),
      expect.objectContaining({
        domainCode: 'language',
        scoreValue: null,
        maxScore: null,
        itemCount: 1,
        unscoredItemCount: 1,
      }),
      expect.objectContaining({
        domainCode: 'attention_calculation',
        scoreValue: null,
        maxScore: null,
        itemCount: 1,
        unscoredItemCount: 1,
      }),
    ]);
    expect(summary.warnings).toEqual([
      {
        itemCode: 'moca.language.naming.lion',
        field: 'scoreValue',
        message: 'scoreValue is not a finite number.',
      },
      {
        itemCode: 'moca.language.naming.lion',
        field: 'maxScore',
        message: 'maxScore is not a finite number.',
      },
      {
        itemCode: 'moca.language.naming.lion',
        domainCode: 'language',
        field: 'weight',
        message: 'weight is not a finite number.',
      },
    ]);
    expect(summary).not.toHaveProperty('diagnosis');
    expect(summary).not.toHaveProperty('riskLevel');
    expect(summary).not.toHaveProperty('diseaseClassification');
    expect(cognitiveDomainResultModel.find).not.toHaveBeenCalled();
    expect(cognitiveDomainResultModel.findOne).not.toHaveBeenCalled();
  });
});
