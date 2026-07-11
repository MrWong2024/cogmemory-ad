import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import { PatientsService } from '../../patients/services/patients.service';
import { ScalesService } from '../../scales/services/scales.service';
import type { ScoreResultSummary } from './scoring.service';
import { ScoringService } from './scoring.service';
import { ScoreResultPublicMapper } from './score-result-public.mapper';
import { ScoreReviewWorkflowService } from './score-review-workflow.service';

const PATIENT_ID = '507f1f77bcf86cd799439011';
const VISIT_ID = '507f1f77bcf86cd799439012';
const INSTANCE_ID = '507f1f77bcf86cd799439013';
const RESULT_ID = '507f1f77bcf86cd799439014';
const ITEM_ID = '507f1f77bcf86cd799439015';
const DEFINITION_ID = '507f1f77bcf86cd799439016';
const VERSION_ID = '507f1f77bcf86cd799439017';
const USER_ID = '507f1f77bcf86cd799439018';
const UPDATED_AT = new Date('2026-07-11T04:00:00.000Z');

function resultFixture(
  status: ScoreResultSummary['status'] = 'needs_review',
): ScoreResultSummary {
  const completed =
    status === 'computed' || status === 'confirmed' || status === 'locked';
  return {
    id: RESULT_ID,
    patientId: PATIENT_ID,
    assessmentVisitId: VISIT_ID,
    scaleInstanceId: INSTANCE_ID,
    subjectCode: 'SUBJ-A18-TEST-WORKFLOW',
    scaleDefinitionId: DEFINITION_ID,
    scaleVersionId: VERSION_ID,
    scaleCode: 'a18_test',
    scaleVersion: '1.0',
    instanceCode: 'INST-A18-TEST-WORKFLOW',
    scoreResultCode: 'SCR-A18TESTWORKFLOW',
    runNo: 1,
    status,
    scoringSource: 'manual',
    scoringMode: 'rule_based',
    versionTrace: { scaleVersion: '1.0', scoringRuleVersion: 'a18-rule-1' },
    totalScore: {
      scoreValue: completed ? 1 : null,
      minScore: 0,
      maxScore: 1,
      scorePercent: completed ? 100 : null,
      scoredItemCount: completed ? 1 : 0,
      totalItemCount: 1,
      unscoredItemCount: completed ? 0 : 1,
      missingItemCount: 0,
      needsReviewItemCount: completed ? 0 : 1,
    },
    itemScores: [
      {
        itemResponseId: ITEM_ID,
        itemCode: 'manual.item',
        groupCode: 'group_one',
        itemTitle: 'Manual item',
        itemOrder: 1,
        responseType: 'number',
        countsTowardTotal: true,
        includedInTotal: completed,
        scoreValue: completed ? 1 : null,
        maxScore: 1,
        minScore: 0,
        scoreStatus: completed ? 'manual_scored' : 'needs_review',
        scoreSource: completed ? 'operator' : 'none',
        isMissing: false,
        cognitiveDomainCodes: [],
        note: 'MANUAL_SCORING_REQUIRED',
      },
    ],
    groupScores: [
      {
        groupCode: 'group_one',
        groupTitle: 'Group One',
        scoreValue: completed ? 1 : null,
        minScore: 0,
        maxScore: 1,
        scoredItemCount: completed ? 1 : 0,
        totalItemCount: 1,
      },
    ],
    computation: {
      computedAt: UPDATED_AT,
      computedBy: null,
      engineVersion: 'a17-provisional-1.0',
      inputItemCount: 1,
      includedItemCount: 1,
      excludedItemCount: 0,
      warningCount: 0,
    },
    review: {
      reviewStatus: completed ? 'reviewed' : 'pending',
      reviewedAt: completed ? UPDATED_AT : null,
      reviewerId: completed ? USER_ID : null,
      reviewerName: completed ? 'A18 Test Doctor' : undefined,
      reviewNote: completed ? 'manual review complete' : undefined,
    },
    qualityStatus: completed ? 'unchecked' : 'needs_review',
    qualityHints: null,
    metadata: null,
    confirmedAt:
      status === 'confirmed' || status === 'locked' ? UPDATED_AT : null,
    lockedAt: status === 'locked' ? UPDATED_AT : null,
    voidedAt: status === 'voided' ? UPDATED_AT : null,
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function summaryFixture(completed: boolean) {
  return {
    totalScore: {
      scoreValue: completed ? 1 : null,
      minScore: 0,
      maxScore: 1,
      scorePercent: completed ? 100 : null,
      scoredItemCount: completed ? 1 : 0,
      totalItemCount: 1,
      unscoredItemCount: completed ? 0 : 1,
      missingItemCount: 0,
      needsReviewItemCount: completed ? 0 : 1,
    },
    itemScores: resultFixture(completed ? 'computed' : 'needs_review')
      .itemScores,
    groupScores: resultFixture(completed ? 'computed' : 'needs_review')
      .groupScores,
    inputItemCount: 1,
    includedItemCount: 1,
    excludedItemCount: 0,
    scoredItemCount: completed ? 1 : 0,
    unscoredItemCount: completed ? 0 : 1,
    missingItemCount: 0,
    needsReviewItemCount: completed ? 0 : 1,
    warnings: [],
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
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

describe('ScoreReviewWorkflowService', () => {
  let service: ScoreReviewWorkflowService;
  let patients: { findPatientById: jest.Mock };
  let assessments: {
    findVisitByPatientAndId: jest.Mock;
    findScaleInstanceByPatientVisitAndId: jest.Mock;
    listItemResponsesByScaleInstanceId: jest.Mock;
    findItemResponseByOwnership: jest.Mock;
    toPublicScaleInstanceResponse: jest.Mock;
  };
  let scales: {
    findDefinitionByCode: jest.Mock;
    findVersionByScaleCodeAndVersion: jest.Mock;
  };
  let scoring: {
    findScoreResultByOwnership: jest.Mock;
    summarizeItemScores: jest.Mock;
    reviewScoreItemIfUnmodified: jest.Mock;
    confirmScoreResultIfUnmodified: jest.Mock;
  };
  let mapper: { toPublicResult: jest.Mock };

  beforeEach(async () => {
    patients = {
      findPatientById: jest
        .fn()
        .mockResolvedValue({ id: PATIENT_ID, status: 'active' }),
    };
    assessments = {
      findVisitByPatientAndId: jest
        .fn()
        .mockResolvedValue({ id: VISIT_ID, status: 'completed' }),
      findScaleInstanceByPatientVisitAndId: jest.fn().mockResolvedValue({
        id: INSTANCE_ID,
        patientId: PATIENT_ID,
        assessmentVisitId: VISIT_ID,
        subjectCode: 'SUBJ-A18-TEST-WORKFLOW',
        scaleDefinitionId: DEFINITION_ID,
        scaleVersionId: VERSION_ID,
        scaleCode: 'a18_test',
        scaleVersion: '1.0',
        instanceCode: 'INST-A18-TEST-WORKFLOW',
        status: 'completed',
      }),
      listItemResponsesByScaleInstanceId: jest.fn().mockResolvedValue([
        {
          id: ITEM_ID,
          patientId: PATIENT_ID,
          assessmentVisitId: VISIT_ID,
          scaleInstanceId: INSTANCE_ID,
          scaleDefinitionId: DEFINITION_ID,
          scaleVersionId: VERSION_ID,
          scaleCode: 'a18_test',
          scaleVersion: '1.0',
          itemCode: 'manual.item',
          status: 'answered',
        },
      ]),
      findItemResponseByOwnership: jest.fn().mockResolvedValue({
        id: ITEM_ID,
        itemCode: 'manual.item',
      }),
      toPublicScaleInstanceResponse: jest
        .fn()
        .mockReturnValue({ id: INSTANCE_ID }),
    };
    scales = {
      findDefinitionByCode: jest.fn().mockResolvedValue({
        id: DEFINITION_ID,
        code: 'a18_test',
        name: 'A18 Test Scale',
      }),
      findVersionByScaleCodeAndVersion: jest.fn().mockResolvedValue({
        id: VERSION_ID,
        scaleDefinitionId: DEFINITION_ID,
        scaleCode: 'a18_test',
        version: '1.0',
        totalScoreRange: { min: 0, max: 1, step: 1 },
        groups: [
          {
            code: 'group_one',
            title: 'Group One',
            order: 1,
            cognitiveDomainCodes: [],
          },
        ],
        items: [
          {
            code: 'manual.item',
            title: 'Manual item',
            order: 1,
            groupCode: 'group_one',
            responseType: 'number',
            scoreRange: { min: 0, max: 1, step: 1 },
            countsTowardTotal: true,
            cognitiveDomainCodes: [],
            evidenceTypes: [],
            requiresTimer: false,
            supportsPhotoUpload: false,
            supportsHandwriting: false,
            requiresOperatorNote: false,
            scoringRule: null,
            qualityControlRule: null,
            reportingRule: null,
          },
        ],
      }),
    };
    scoring = {
      findScoreResultByOwnership: jest
        .fn()
        .mockResolvedValue(resultFixture()),
      summarizeItemScores: jest.fn().mockReturnValue(summaryFixture(true)),
      reviewScoreItemIfUnmodified: jest
        .fn()
        .mockResolvedValue(resultFixture('computed')),
      confirmScoreResultIfUnmodified: jest
        .fn()
        .mockResolvedValue(resultFixture('confirmed')),
    };
    mapper = {
      toPublicResult: jest
        .fn()
        .mockImplementation((result: ScoreResultSummary) => ({
          scoreResult: {
            id: result.id,
            status: result.status,
            updatedAt: result.updatedAt,
          },
          reviewQueue:
            result.status === 'needs_review'
              ? [{ itemCode: 'manual.item' }]
              : [],
        })),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ScoreReviewWorkflowService,
        { provide: PatientsService, useValue: patients },
        { provide: AssessmentsService, useValue: assessments },
        { provide: ScalesService, useValue: scales },
        { provide: ScoringService, useValue: scoring },
        { provide: ScoreResultPublicMapper, useValue: mapper },
      ],
    }).compile();
    service = moduleRef.get(ScoreReviewWorkflowService);
  });

  const currentUser = {
    id: USER_ID,
    accountName: 'doctor-a18-test',
    displayName: 'A18 Test Doctor',
    roles: ['admin', 'doctor'],
    permissions: [],
  };

  it('reviews the target, derives the result and passes updatedAt to one atomic write', async () => {
    const response = await service.reviewScoreItem(
      PATIENT_ID,
      VISIT_ID,
      INSTANCE_ID,
      RESULT_ID,
      ITEM_ID,
      currentUser,
      {
        scoreValue: 1,
        reviewNote: 'manual review complete',
        expectedUpdatedAt: UPDATED_AT.toISOString(),
      },
    );
    expect(response.reviewUpdate.itemResponseId).toBe(ITEM_ID);
    expect(response.reviewUpdate.pendingItemCount).toBe(0);
    expect(response.reviewUpdate.reviewer.operatorRole).toBe('doctor');
    expect(scoring.reviewScoreItemIfUnmodified).toHaveBeenCalledWith(
      expect.objectContaining({
        scoreResultId: RESULT_ID,
        expectedUpdatedAt: UPDATED_AT,
        status: 'computed',
        scoringSource: 'manual',
      }),
    );
  });

  it('returns an optimistic review conflict and never overwrites a newer result', async () => {
    scoring.reviewScoreItemIfUnmodified.mockResolvedValue(null);
    scoring.findScoreResultByOwnership
      .mockResolvedValueOnce(resultFixture())
      .mockResolvedValueOnce({
        ...resultFixture(),
        updatedAt: new Date('2026-07-11T04:00:01.000Z'),
      });
    await expectCode(
      service.reviewScoreItem(
        PATIENT_ID,
        VISIT_ID,
        INSTANCE_ID,
        RESULT_ID,
        ITEM_ID,
        currentUser,
        {
          scoreValue: 1,
          reviewNote: 'manual review complete',
          expectedUpdatedAt: UPDATED_AT.toISOString(),
        },
      ),
      'SCORE_RESULT_REVIEW_CONFLICT',
    );
    expect(scoring.reviewScoreItemIfUnmodified).toHaveBeenCalledTimes(1);
  });

  it('confirms a complete result and preserves confirmation idempotency', async () => {
    scoring.findScoreResultByOwnership.mockResolvedValue(
      resultFixture('computed'),
    );
    const confirmed = resultFixture('confirmed');
    confirmed.metadata = {
      a18Confirmation: {
        confirmationId: 'confirmation-existing',
        confirmedAt: UPDATED_AT,
        confirmedBy: USER_ID,
        confirmedByName: 'A18 Test Doctor',
        confirmedByRole: 'doctor',
        reviewNote: 'final confirmation',
      },
    };
    scoring.confirmScoreResultIfUnmodified.mockResolvedValue(confirmed);

    const response = await service.confirmScoreResult(
      PATIENT_ID,
      VISIT_ID,
      INSTANCE_ID,
      RESULT_ID,
      currentUser,
      {
        confirm: true,
        reviewNote: 'final confirmation',
        expectedUpdatedAt: UPDATED_AT.toISOString(),
      },
    );
    expect(response.confirmationReceipt.alreadyConfirmed).toBe(false);
    expect(scoring.confirmScoreResultIfUnmodified).toHaveBeenCalledWith(
      expect.objectContaining({
        scoreResultId: RESULT_ID,
        expectedUpdatedAt: UPDATED_AT,
      }),
    );

    scoring.findScoreResultByOwnership.mockResolvedValue(confirmed);
    const repeated = await service.confirmScoreResult(
      PATIENT_ID,
      VISIT_ID,
      INSTANCE_ID,
      RESULT_ID,
      currentUser,
      {
        confirm: true,
        reviewNote: 'ignored repeated note',
        expectedUpdatedAt: UPDATED_AT.toISOString(),
      },
    );
    expect(repeated.confirmationReceipt).toEqual(
      expect.objectContaining({
        confirmationId: 'confirmation-existing',
        alreadyConfirmed: true,
        reviewNote: 'final confirmation',
      }),
    );
    expect(scoring.confirmScoreResultIfUnmodified).toHaveBeenCalledTimes(1);
  });

  it('blocks pending results, computation warnings and missing idempotent audit time', async () => {
    await expectCode(
      service.confirmScoreResult(
        PATIENT_ID,
        VISIT_ID,
        INSTANCE_ID,
        RESULT_ID,
        currentUser,
        {
          confirm: true,
          reviewNote: 'final confirmation',
          expectedUpdatedAt: UPDATED_AT.toISOString(),
        },
      ),
      'SCORE_RESULT_NOT_READY_FOR_CONFIRMATION',
    );

    const warning = resultFixture('computed');
    warning.computation = { ...warning.computation!, warningCount: 1 };
    scoring.findScoreResultByOwnership.mockResolvedValue(warning);
    await expectCode(
      service.confirmScoreResult(
        PATIENT_ID,
        VISIT_ID,
        INSTANCE_ID,
        RESULT_ID,
        currentUser,
        {
          confirm: true,
          reviewNote: 'final confirmation',
          expectedUpdatedAt: UPDATED_AT.toISOString(),
        },
      ),
      'SCORE_RESULT_CONFIRMATION_WARNINGS_PRESENT',
    );

    const missingAudit = resultFixture('locked');
    missingAudit.confirmedAt = null;
    scoring.findScoreResultByOwnership.mockResolvedValue(missingAudit);
    await expectCode(
      service.confirmScoreResult(
        PATIENT_ID,
        VISIT_ID,
        INSTANCE_ID,
        RESULT_ID,
        currentUser,
        {
          confirm: true,
          reviewNote: 'final confirmation',
          expectedUpdatedAt: UPDATED_AT.toISOString(),
        },
      ),
      'SCORE_RESULT_CONFIRMATION_AUDIT_UNAVAILABLE',
    );
  });
});
