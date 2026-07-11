import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import { PatientsService } from '../../patients/services/patients.service';
import { ScalesService } from '../../scales/services/scales.service';
import type { ScoreResultSummary } from './scoring.service';
import { ScoringService } from './scoring.service';
import { ScoreResultPublicMapper } from './score-result-public.mapper';
import { ProvisionalScoringWorkflowService } from './provisional-scoring-workflow.service';

const PATIENT_ID = '507f1f77bcf86cd799439011';
const VISIT_ID = '507f1f77bcf86cd799439012';
const INSTANCE_ID = '507f1f77bcf86cd799439013';
const DEFINITION_ID = '507f1f77bcf86cd799439014';
const VERSION_ID = '507f1f77bcf86cd799439015';
const ITEM_ID = '507f1f77bcf86cd799439016';

function resultFixture(
  status: ScoreResultSummary['status'] = 'needs_review',
): ScoreResultSummary {
  return {
    id: '507f1f77bcf86cd799439017',
    patientId: PATIENT_ID,
    assessmentVisitId: VISIT_ID,
    scaleInstanceId: INSTANCE_ID,
    subjectCode: 'SUBJ-A17-TEST-WORKFLOW',
    scaleDefinitionId: DEFINITION_ID,
    scaleVersionId: VERSION_ID,
    scaleCode: 'test_scale',
    scaleVersion: '1.0',
    instanceCode: 'INST-A17-TEST-WORKFLOW',
    scoreResultCode: 'SCR-A17TESTWORKFLOW',
    runNo: 1,
    status,
    scoringSource: 'manual',
    scoringMode: 'rule_based',
    versionTrace: { scaleVersion: '1.0', scoringRuleVersion: 'test-rule-1' },
    totalScore: {
      scoreValue: null,
      maxScore: 1,
      minScore: 0,
      scorePercent: null,
      scoredItemCount: 0,
      totalItemCount: 1,
      unscoredItemCount: 1,
      missingItemCount: 0,
      needsReviewItemCount: 1,
    },
    itemScores: [],
    groupScores: [],
    computation: {
      computedAt: new Date('2026-07-11T01:00:00.000Z'),
      computedBy: null,
      engineVersion: 'a17-provisional-1.0',
      inputItemCount: 1,
      includedItemCount: 1,
      excludedItemCount: 0,
      warningCount: 0,
    },
    review: {
      reviewStatus: 'pending',
      reviewedAt: null,
      reviewerId: null,
    },
    qualityStatus: 'needs_review',
    qualityHints: null,
    metadata: null,
    confirmedAt: null,
    lockedAt: null,
    voidedAt: status === 'voided' ? new Date() : null,
  };
}

async function expectErrorCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    if (error instanceof HttpException) {
      expect(error.getResponse()).toEqual(expect.objectContaining({ code }));
    }
  }
}

describe('ProvisionalScoringWorkflowService', () => {
  let service: ProvisionalScoringWorkflowService;
  let patients: { findPatientById: jest.Mock };
  let assessments: {
    findVisitByPatientAndId: jest.Mock;
    findScaleInstanceByPatientVisitAndId: jest.Mock;
    listItemResponsesByScaleInstanceId: jest.Mock;
    toPublicScaleInstanceResponse: jest.Mock;
  };
  let scales: {
    findDefinitionByCode: jest.Mock;
    findVersionByScaleCodeAndVersion: jest.Mock;
  };
  let scoring: {
    findLatestScoreResultByScaleInstanceId: jest.Mock;
    summarizeItemScores: jest.Mock;
    createScoreResult: jest.Mock;
  };
  let mapper: { toPublicResult: jest.Mock };

  beforeEach(async () => {
    patients = { findPatientById: jest.fn() };
    assessments = {
      findVisitByPatientAndId: jest.fn(),
      findScaleInstanceByPatientVisitAndId: jest.fn(),
      listItemResponsesByScaleInstanceId: jest.fn(),
      toPublicScaleInstanceResponse: jest
        .fn()
        .mockReturnValue({ id: INSTANCE_ID }),
    };
    scales = {
      findDefinitionByCode: jest.fn(),
      findVersionByScaleCodeAndVersion: jest.fn(),
    };
    scoring = {
      findLatestScoreResultByScaleInstanceId: jest.fn(),
      summarizeItemScores: jest.fn(),
      createScoreResult: jest.fn(),
    };
    mapper = {
      toPublicResult: jest.fn().mockReturnValue({
        scoreResult: { id: 'public-result' },
        reviewQueue: [],
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProvisionalScoringWorkflowService,
        { provide: PatientsService, useValue: patients },
        { provide: AssessmentsService, useValue: assessments },
        { provide: ScalesService, useValue: scales },
        { provide: ScoringService, useValue: scoring },
        { provide: ScoreResultPublicMapper, useValue: mapper },
      ],
    }).compile();
    service = moduleRef.get(ProvisionalScoringWorkflowService);
    prepareValidContext();
  });

  function prepareValidContext(): void {
    patients.findPatientById.mockResolvedValue({
      id: PATIENT_ID,
      subjectCode: 'SUBJ-A17-TEST-WORKFLOW',
      status: 'active',
    });
    assessments.findVisitByPatientAndId.mockResolvedValue({
      id: VISIT_ID,
      patientId: PATIENT_ID,
      status: 'draft',
    });
    assessments.findScaleInstanceByPatientVisitAndId.mockResolvedValue(
      scaleInstanceFixture(),
    );
    scales.findDefinitionByCode.mockResolvedValue({
      id: DEFINITION_ID,
      code: 'test_scale',
      name: 'Test Scale',
      status: 'active',
    });
    scales.findVersionByScaleCodeAndVersion.mockResolvedValue({
      id: VERSION_ID,
      scaleDefinitionId: DEFINITION_ID,
      scaleCode: 'test_scale',
      version: '1.0',
      scoringRuleVersion: 'test-rule-1',
      status: 'active',
      totalScoreRange: { min: 0, max: 1, step: 1 },
      groups: [],
      items: [
        {
          code: 'test.manual',
          title: 'Manual item',
          order: 1,
          responseType: 'text',
          scoreRange: { min: 0, max: 1, step: 1 },
          countsTowardTotal: true,
          cognitiveDomainCodes: [],
          evidenceTypes: [],
          requiresTimer: false,
          supportsPhotoUpload: false,
          supportsHandwriting: false,
          requiresOperatorNote: false,
          scoringRule: { mode: 'manual_exact_match' },
          qualityControlRule: null,
          reportingRule: null,
        },
      ],
      qualityControlRules: null,
      reportingRules: null,
      researchExportMappings: null,
      effectiveFrom: null,
      retiredAt: null,
    });
    assessments.listItemResponsesByScaleInstanceId.mockResolvedValue([
      {
        id: ITEM_ID,
        patientId: PATIENT_ID,
        assessmentVisitId: VISIT_ID,
        scaleInstanceId: INSTANCE_ID,
        scaleDefinitionId: DEFINITION_ID,
        scaleVersionId: VERSION_ID,
        scaleCode: 'test_scale',
        scaleVersion: '1.0',
        itemCode: 'test.manual',
        itemOrder: 1,
        responseType: 'text',
        countsTowardTotal: true,
        cognitiveDomainCodes: [],
        status: 'answered',
        isMissing: false,
        score: null,
        stepResults: [],
      },
    ]);
    scoring.findLatestScoreResultByScaleInstanceId.mockResolvedValue(null);
    scoring.summarizeItemScores.mockReturnValue({
      totalScore: {
        scoreValue: null,
        maxScore: 1,
        minScore: 0,
        scorePercent: null,
        scoredItemCount: 0,
        totalItemCount: 1,
        unscoredItemCount: 1,
        missingItemCount: 0,
        needsReviewItemCount: 1,
      },
      itemScores: [],
      groupScores: [],
      inputItemCount: 1,
      includedItemCount: 1,
      excludedItemCount: 0,
      scoredItemCount: 0,
      unscoredItemCount: 1,
      missingItemCount: 0,
      needsReviewItemCount: 1,
      warnings: [],
    });
    scoring.createScoreResult.mockResolvedValue(resultFixture());
  }

  function scaleInstanceFixture(status = 'completed') {
    return {
      id: INSTANCE_ID,
      patientId: PATIENT_ID,
      assessmentVisitId: VISIT_ID,
      subjectCode: 'SUBJ-A17-TEST-WORKFLOW',
      scaleDefinitionId: DEFINITION_ID,
      scaleVersionId: VERSION_ID,
      scaleCode: 'test_scale',
      scaleVersion: '1.0',
      instanceCode: 'INST-A17-TEST-WORKFLOW',
      status,
    };
  }

  it('requires explicit confirmation before loading protected resources', async () => {
    await expect(
      service.computeScoreResult(PATIENT_ID, VISIT_ID, INSTANCE_ID, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(patients.findPatientById).not.toHaveBeenCalled();
  });

  it('creates a single run-one provisional result without assessment writes', async () => {
    const response = await service.computeScoreResult(
      PATIENT_ID,
      VISIT_ID,
      INSTANCE_ID,
      { confirm: true },
    );
    expect(response.alreadyComputed).toBe(false);
    expect(scoring.summarizeItemScores).toHaveBeenCalledWith(
      expect.any(Array),
      { provisional: true },
    );
    expect(scoring.createScoreResult).toHaveBeenCalledWith(
      expect.objectContaining({
        runNo: 1,
        status: 'needs_review',
        scoringSource: 'manual',
        scoringMode: 'rule_based',
        qualityStatus: 'needs_review',
      }),
    );
    expect(assessments).not.toHaveProperty('completeScaleInstanceIfEditable');
  });

  it.each(['computed', 'needs_review', 'confirmed', 'locked'] as const)(
    'returns an existing %s result idempotently before mutable-state checks',
    async (status) => {
      patients.findPatientById.mockResolvedValue({
        id: PATIENT_ID,
        status: 'archived',
      });
      assessments.findVisitByPatientAndId.mockResolvedValue({
        id: VISIT_ID,
        status: 'voided',
      });
      scoring.findLatestScoreResultByScaleInstanceId.mockResolvedValue(
        resultFixture(status),
      );
      const response = await service.computeScoreResult(
        PATIENT_ID,
        VISIT_ID,
        INSTANCE_ID,
        { confirm: true },
      );
      expect(response.alreadyComputed).toBe(true);
      expect(scoring.createScoreResult).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['draft', 'SCORE_RESULT_INCOMPLETE'],
    ['voided', 'SCORE_RESULT_VOIDED'],
  ] as const)('rejects an existing %s result with %s', async (status, code) => {
    scoring.findLatestScoreResultByScaleInstanceId.mockResolvedValue(
      resultFixture(status),
    );
    await expectErrorCode(
      service.computeScoreResult(PATIENT_ID, VISIT_ID, INSTANCE_ID, {
        confirm: true,
      }),
      code,
    );
  });

  it('enforces patient, visit and completed-instance boundaries on first compute', async () => {
    patients.findPatientById.mockResolvedValue({
      id: PATIENT_ID,
      status: 'inactive',
    });
    await expectErrorCode(
      service.computeScoreResult(PATIENT_ID, VISIT_ID, INSTANCE_ID, {
        confirm: true,
      }),
      'PATIENT_NOT_ACTIVE',
    );
    prepareValidContext();
    assessments.findVisitByPatientAndId.mockResolvedValue({
      id: VISIT_ID,
      status: 'locked',
    });
    await expectErrorCode(
      service.computeScoreResult(PATIENT_ID, VISIT_ID, INSTANCE_ID, {
        confirm: true,
      }),
      'VISIT_NOT_EDITABLE',
    );
    prepareValidContext();
    assessments.findScaleInstanceByPatientVisitAndId.mockResolvedValue(
      scaleInstanceFixture('in_progress'),
    );
    await expectErrorCode(
      service.computeScoreResult(PATIENT_ID, VISIT_ID, INSTANCE_ID, {
        confirm: true,
      }),
      'SCORE_INSTANCE_NOT_COMPUTABLE',
    );
  });

  it('rejects missing ownership, configuration and item-set mismatches safely', async () => {
    patients.findPatientById.mockResolvedValue(null);
    await expect(
      service.getLatestScoreResult(PATIENT_ID, VISIT_ID, INSTANCE_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    prepareValidContext();
    scales.findVersionByScaleCodeAndVersion.mockResolvedValue(null);
    await expectErrorCode(
      service.getLatestScoreResult(PATIENT_ID, VISIT_ID, INSTANCE_ID),
      'SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE',
    );
    prepareValidContext();
    assessments.listItemResponsesByScaleInstanceId.mockResolvedValue([]);
    await expectErrorCode(
      service.computeScoreResult(PATIENT_ID, VISIT_ID, INSTANCE_ID, {
        confirm: true,
      }),
      'SCORE_INPUT_INVALID',
    );
  });

  it('recovers a duplicate key by rereading the immutable result', async () => {
    scoring.createScoreResult.mockRejectedValue({ code: 11000 });
    scoring.findLatestScoreResultByScaleInstanceId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(resultFixture('computed'));
    const response = await service.computeScoreResult(
      PATIENT_ID,
      VISIT_ID,
      INSTANCE_ID,
      { confirm: true },
    );
    expect(response.alreadyComputed).toBe(true);
  });

  it('returns not found for latest without a result and allows voided history', async () => {
    await expectErrorCode(
      service.getLatestScoreResult(PATIENT_ID, VISIT_ID, INSTANCE_ID),
      'SCORE_RESULT_NOT_FOUND',
    );
    scoring.findLatestScoreResultByScaleInstanceId.mockResolvedValue(
      resultFixture('voided'),
    );
    await expect(
      service.getLatestScoreResult(PATIENT_ID, VISIT_ID, INSTANCE_ID),
    ).resolves.toEqual(expect.objectContaining({ reviewQueue: [] }));
  });
});
