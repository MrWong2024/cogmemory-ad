import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import { PatientsService } from '../../patients/services/patients.service';
import { ScalesService } from '../../scales/services/scales.service';
import type { ScoreResultSummary } from '../../scoring/services/scoring.service';
import { ScoringService } from '../../scoring/services/scoring.service';
import { CognitiveDomainResultPublicMapper } from './cognitive-domain-result-public.mapper';
import type {
  CognitiveDomainResultSummary,
  CreateCognitiveDomainResultInput,
} from './cognitive-domains.service';
import { CognitiveDomainsService } from './cognitive-domains.service';
import { CognitiveDomainComputationWorkflowService } from './cognitive-domain-computation-workflow.service';

const PATIENT_ID = '507f1f77bcf86cd799439011';
const VISIT_ID = '507f1f77bcf86cd799439012';
const INSTANCE_ID = '507f1f77bcf86cd799439013';
const DEFINITION_ID = '507f1f77bcf86cd799439014';
const VERSION_ID = '507f1f77bcf86cd799439015';
const ITEM_ID = '507f1f77bcf86cd799439016';
const SCORE_ID = '507f1f77bcf86cd799439017';
const USER_ID = '507f1f77bcf86cd799439018';

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

function scoreFixture(
  status: ScoreResultSummary['status'] = 'confirmed',
): ScoreResultSummary {
  const now = new Date('2026-07-11T03:00:00.000Z');
  return {
    id: SCORE_ID,
    patientId: PATIENT_ID,
    assessmentVisitId: VISIT_ID,
    scaleInstanceId: INSTANCE_ID,
    subjectCode: 'SUBJ-A19-TEST-WORKFLOW',
    scaleDefinitionId: DEFINITION_ID,
    scaleVersionId: VERSION_ID,
    scaleCode: 'test_scale',
    scaleVersion: '1.0',
    instanceCode: 'INST-A19-TEST-WORKFLOW',
    scoreResultCode: 'SCR-A19TESTWORKFLOW',
    runNo: 1,
    status,
    scoringSource: 'manual',
    scoringMode: 'rule_based',
    versionTrace: {
      scaleVersion: '1.0',
      scoringRuleVersion: 'score-rule-1',
    },
    totalScore: {
      scoreValue: 3,
      minScore: 1,
      maxScore: 5,
      scorePercent: 50,
      scoredItemCount: 1,
      totalItemCount: 1,
      unscoredItemCount: 0,
      missingItemCount: 0,
      needsReviewItemCount: 0,
    },
    itemScores: [
      {
        itemResponseId: ITEM_ID,
        itemCode: 'test.item',
        itemOrder: 1,
        countsTowardTotal: true,
        includedInTotal: true,
        scoreValue: 3,
        minScore: 1,
        maxScore: 5,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        isMissing: false,
        cognitiveDomainCodes: ['memory', 'executive_function'],
      },
    ],
    groupScores: [],
    computation: {
      computedAt: now,
      computedBy: null,
      inputItemCount: 1,
      includedItemCount: 1,
      excludedItemCount: 0,
      warningCount: 0,
    },
    review: {
      reviewStatus: 'reviewed',
      reviewedAt: now,
      reviewerId: USER_ID,
    },
    qualityStatus: 'passed',
    qualityHints: null,
    metadata: { shouldRemainUntouched: true },
    confirmedAt: status === 'confirmed' || status === 'locked' ? now : null,
    lockedAt: status === 'locked' ? now : null,
    voidedAt: status === 'voided' ? now : null,
    createdAt: now,
    updatedAt: now,
  };
}

function domainResultFixture(
  status: CognitiveDomainResultSummary['status'] = 'computed',
): CognitiveDomainResultSummary {
  const now = new Date('2026-07-11T04:00:00.000Z');
  return {
    id: '507f1f77bcf86cd799439019',
    patientId: PATIENT_ID,
    assessmentVisitId: VISIT_ID,
    scaleInstanceId: INSTANCE_ID,
    scoreResultId: SCORE_ID,
    subjectCode: 'SUBJ-A19-TEST-WORKFLOW',
    scaleDefinitionId: DEFINITION_ID,
    scaleVersionId: VERSION_ID,
    scaleCode: 'test_scale',
    scaleVersion: '1.0',
    instanceCode: 'INST-A19-TEST-WORKFLOW',
    domainResultCode: 'CDR-A19TESTWORKFLOW',
    runNo: 1,
    status,
    mappingSource: 'scale_config',
    mappingMode: 'item_domain_codes',
    versionTrace: { domainMappingVersion: 'a19-item-domain-codes-1.0' },
    domainScores: [],
    itemContributions: [],
    mappingSnapshot: {
      mappingVersion: 'a19-item-domain-codes-1.0',
      mappingSource: 'scale_config',
      domainCodes: ['executive_function', 'memory'],
      mappingRules: null,
    },
    computation: {
      computedAt: now,
      computedBy: USER_ID,
      inputItemCount: 1,
      contributionCount: 2,
      domainCount: 2,
      includedContributionCount: 2,
      excludedContributionCount: 0,
      warningCount: 0,
    },
    review: {
      reviewStatus: 'not_required',
      reviewedAt: null,
      reviewerId: null,
    },
    qualityStatus: 'unchecked',
    qualityHints: null,
    metadata: null,
    confirmedAt: null,
    lockedAt: null,
    voidedAt: status === 'voided' ? now : null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('CognitiveDomainComputationWorkflowService', () => {
  let service: CognitiveDomainComputationWorkflowService;
  let patients: { findPatientById: jest.Mock };
  let assessments: {
    findVisitByPatientAndId: jest.Mock;
    findScaleInstanceByPatientVisitAndId: jest.Mock;
    toPublicScaleInstanceResponse: jest.Mock;
  };
  let scales: {
    findDefinitionByCode: jest.Mock;
    findVersionByScaleCodeAndVersion: jest.Mock;
  };
  let scoring: { findScoreResultByScaleInstanceAndRunNo: jest.Mock };
  let domains: {
    findDomainResultByScaleInstanceAndRunNo: jest.Mock;
    summarizeDomainScores: jest.Mock;
    createRunOneDomainResult: jest.Mock<
      Promise<CognitiveDomainResultSummary>,
      [CreateCognitiveDomainResultInput]
    >;
  };
  let mapper: { toPublicResult: jest.Mock };

  beforeEach(async () => {
    patients = { findPatientById: jest.fn() };
    assessments = {
      findVisitByPatientAndId: jest.fn(),
      findScaleInstanceByPatientVisitAndId: jest.fn(),
      toPublicScaleInstanceResponse: jest.fn().mockReturnValue({
        id: INSTANCE_ID,
        status: 'completed',
      }),
    };
    scales = {
      findDefinitionByCode: jest.fn(),
      findVersionByScaleCodeAndVersion: jest.fn(),
    };
    scoring = { findScoreResultByScaleInstanceAndRunNo: jest.fn() };
    domains = {
      findDomainResultByScaleInstanceAndRunNo: jest.fn(),
      summarizeDomainScores: jest.fn(),
      createRunOneDomainResult: jest.fn<
        Promise<CognitiveDomainResultSummary>,
        [CreateCognitiveDomainResultInput]
      >(),
    };
    mapper = {
      toPublicResult: jest.fn().mockReturnValue({
        id: 'public-domain-result',
        status: 'computed',
        isFinal: false,
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CognitiveDomainComputationWorkflowService,
        { provide: PatientsService, useValue: patients },
        { provide: AssessmentsService, useValue: assessments },
        { provide: ScalesService, useValue: scales },
        { provide: ScoringService, useValue: scoring },
        { provide: CognitiveDomainsService, useValue: domains },
        { provide: CognitiveDomainResultPublicMapper, useValue: mapper },
      ],
    }).compile();
    service = moduleRef.get(CognitiveDomainComputationWorkflowService);
    prepareValidContext();
  });

  function prepareValidContext(): void {
    patients.findPatientById.mockResolvedValue({
      id: PATIENT_ID,
      subjectCode: 'SUBJ-A19-TEST-WORKFLOW',
      status: 'active',
    });
    assessments.findVisitByPatientAndId.mockResolvedValue({
      id: VISIT_ID,
      patientId: PATIENT_ID,
      status: 'completed',
    });
    assessments.findScaleInstanceByPatientVisitAndId.mockResolvedValue({
      id: INSTANCE_ID,
      patientId: PATIENT_ID,
      assessmentVisitId: VISIT_ID,
      subjectCode: 'SUBJ-A19-TEST-WORKFLOW',
      scaleDefinitionId: DEFINITION_ID,
      scaleVersionId: VERSION_ID,
      scaleCode: 'test_scale',
      scaleVersion: '1.0',
      instanceCode: 'INST-A19-TEST-WORKFLOW',
      status: 'completed',
      versionTrace: {
        crfVersion: 'crf-1',
        scoringRuleVersion: 'score-rule-1',
        fieldEncodingVersion: 'field-1',
        sourceDocument: 'source.pdf',
      },
    });
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
      crfVersion: 'crf-1',
      scoringRuleVersion: 'score-rule-1',
      fieldEncodingVersion: 'field-1',
      sourceDocument: 'source.pdf',
      status: 'active',
      totalScoreRange: { min: 1, max: 5, step: 1 },
      groups: [],
      items: [
        {
          code: 'test.item',
          title: 'Test item',
          order: 1,
          responseType: 'number',
          scoreRange: { min: 1, max: 5, step: 1 },
          countsTowardTotal: true,
          cognitiveDomainCodes: ['memory', 'executive_function'],
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
      qualityControlRules: null,
      reportingRules: null,
      researchExportMappings: null,
      effectiveFrom: null,
      retiredAt: null,
    });
    domains.findDomainResultByScaleInstanceAndRunNo.mockResolvedValue(null);
    scoring.findScoreResultByScaleInstanceAndRunNo.mockResolvedValue(
      scoreFixture(),
    );
    domains.summarizeDomainScores.mockReturnValue({
      domainScores: [
        {
          domainCode: 'memory',
          scoreValue: 3,
          minScore: 1,
          maxScore: 5,
          scorePercent: 50,
          weightedScore: 3,
          weightedMaxScore: 5,
          itemCount: 1,
          scoredItemCount: 1,
          unscoredItemCount: 0,
          missingItemCount: 0,
          needsReviewItemCount: 0,
          excludedItemCount: 0,
        },
      ],
      itemContributions: [],
      inputItemCount: 1,
      contributionCount: 2,
      domainCount: 2,
      includedContributionCount: 2,
      excludedContributionCount: 0,
      scoredContributionCount: 2,
      unscoredContributionCount: 0,
      missingContributionCount: 0,
      needsReviewContributionCount: 0,
      warnings: [],
    });
    domains.createRunOneDomainResult.mockResolvedValue(domainResultFixture());
  }

  const currentUser = {
    id: USER_ID,
    accountName: 'doctor-a19-test',
    displayName: 'A19 Doctor',
    roles: ['doctor'],
    permissions: [],
  };

  it('requires explicit confirmation', async () => {
    await expectErrorCode(
      service.computeDomainResult(
        PATIENT_ID,
        VISIT_ID,
        INSTANCE_ID,
        currentUser,
        {},
      ),
      'COGNITIVE_DOMAIN_COMPUTATION_CONFIRMATION_REQUIRED',
    );
  });

  it.each([
    ['patient', 'PATIENT_NOT_FOUND'],
    ['visit', 'VISIT_NOT_FOUND'],
    ['instance', 'SCALE_INSTANCE_NOT_FOUND'],
  ] as const)('protects %s ownership', async (resource, code) => {
    if (resource === 'patient')
      patients.findPatientById.mockResolvedValue(null);
    if (resource === 'visit')
      assessments.findVisitByPatientAndId.mockResolvedValue(null);
    if (resource === 'instance')
      assessments.findScaleInstanceByPatientVisitAndId.mockResolvedValue(null);
    await expectErrorCode(
      service.getLatestDomainResult(PATIENT_ID, VISIT_ID, INSTANCE_ID),
      code,
    );
  });

  it.each([
    ['inactive patient', 'PATIENT_NOT_ACTIVE'],
    ['locked visit', 'VISIT_NOT_EDITABLE'],
    ['in-progress instance', 'COGNITIVE_DOMAIN_INSTANCE_NOT_COMPUTABLE'],
  ] as const)('enforces first-compute state for %s', async (scenario, code) => {
    if (scenario === 'inactive patient')
      patients.findPatientById.mockResolvedValue({
        id: PATIENT_ID,
        status: 'inactive',
      });
    if (scenario === 'locked visit')
      assessments.findVisitByPatientAndId.mockResolvedValue({
        id: VISIT_ID,
        patientId: PATIENT_ID,
        status: 'locked',
      });
    if (scenario === 'in-progress instance')
      assessments.findScaleInstanceByPatientVisitAndId.mockResolvedValue({
        ...(await assessments.findScaleInstanceByPatientVisitAndId()),
        status: 'in_progress',
      });
    await expectErrorCode(
      service.computeDomainResult(
        PATIENT_ID,
        VISIT_ID,
        INSTANCE_ID,
        currentUser,
        { confirm: true },
      ),
      code,
    );
  });

  it('returns SCORE_RESULT_NOT_FOUND when run one is absent', async () => {
    scoring.findScoreResultByScaleInstanceAndRunNo.mockResolvedValue(null);
    await expectErrorCode(
      service.computeDomainResult(
        PATIENT_ID,
        VISIT_ID,
        INSTANCE_ID,
        currentUser,
        { confirm: true },
      ),
      'SCORE_RESULT_NOT_FOUND',
    );
  });

  it.each([['draft'], ['computed'], ['needs_review'], ['voided']] as const)(
    'rejects non-final source status %s',
    async (status) => {
      scoring.findScoreResultByScaleInstanceAndRunNo.mockResolvedValue(
        scoreFixture(status),
      );
      await expectErrorCode(
        service.computeDomainResult(
          PATIENT_ID,
          VISIT_ID,
          INSTANCE_ID,
          currentUser,
          { confirm: true },
        ),
        'COGNITIVE_DOMAIN_SOURCE_SCORE_NOT_FINAL',
      );
    },
  );

  it.each([
    [
      'confirmedAt',
      (score: ScoreResultSummary) => {
        score.confirmedAt = null;
      },
    ],
    [
      'quality',
      (score: ScoreResultSummary) => {
        score.qualityStatus = 'unchecked';
      },
    ],
    [
      'warning',
      (score: ScoreResultSummary) => {
        if (score.computation) score.computation.warningCount = 1;
      },
    ],
  ])('rejects invalid final source %s', async (_label, mutate) => {
    const score = scoreFixture();
    mutate(score);
    scoring.findScoreResultByScaleInstanceAndRunNo.mockResolvedValue(score);
    await expectErrorCode(
      service.computeDomainResult(
        PATIENT_ID,
        VISIT_ID,
        INSTANCE_ID,
        currentUser,
        { confirm: true },
      ),
      'COGNITIVE_DOMAIN_SOURCE_SCORE_INVALID',
    );
  });

  it('creates a controlled run-one computed result from the confirmed snapshot', async () => {
    const source = scoreFixture('locked');
    scoring.findScoreResultByScaleInstanceAndRunNo.mockResolvedValue(source);

    const response = await service.computeDomainResult(
      PATIENT_ID,
      VISIT_ID,
      INSTANCE_ID,
      currentUser,
      { confirm: true },
    );

    expect(response.alreadyComputed).toBe(false);
    expect(domains.summarizeDomainScores).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          itemCode: 'test.item',
          scoreValue: 3,
          minScore: 1,
          maxScore: 5,
        }),
      ]),
    );
    expect(domains.createRunOneDomainResult).toHaveBeenCalledWith(
      expect.objectContaining({
        runNo: 1,
        status: 'computed',
        mappingSource: 'scale_config',
        mappingMode: 'item_domain_codes',
        qualityStatus: 'unchecked',
        review: { reviewStatus: 'not_required' },
      }),
    );
    expect(domains.createRunOneDomainResult.mock.calls[0]?.[0]).toMatchObject({
      computation: {
        computedBy: USER_ID,
        warningCount: 0,
        contributionCount: 2,
      },
    });
    expect(source.metadata).toEqual({ shouldRemainUntouched: true });
  });

  it('returns an existing result without reading or validating the source score', async () => {
    patients.findPatientById.mockResolvedValue({
      id: PATIENT_ID,
      status: 'archived',
    });
    domains.findDomainResultByScaleInstanceAndRunNo.mockResolvedValue(
      domainResultFixture(),
    );
    const response = await service.computeDomainResult(
      PATIENT_ID,
      VISIT_ID,
      INSTANCE_ID,
      undefined,
      { confirm: true },
    );
    expect(response.alreadyComputed).toBe(true);
    expect(response.sourceScoreResult).toEqual({ id: SCORE_ID });
    expect(
      scoring.findScoreResultByScaleInstanceAndRunNo,
    ).not.toHaveBeenCalled();
  });

  it.each([
    ['draft', 'COGNITIVE_DOMAIN_RESULT_INCOMPLETE'],
    ['voided', 'COGNITIVE_DOMAIN_RESULT_VOIDED'],
  ] as const)('rejects existing %s result on compute', async (status, code) => {
    domains.findDomainResultByScaleInstanceAndRunNo.mockResolvedValue(
      domainResultFixture(status),
    );
    await expectErrorCode(
      service.computeDomainResult(
        PATIENT_ID,
        VISIT_ID,
        INSTANCE_ID,
        currentUser,
        { confirm: true },
      ),
      code,
    );
  });

  it('recovers a duplicate key by re-reading run one', async () => {
    domains.findDomainResultByScaleInstanceAndRunNo
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(domainResultFixture());
    domains.createRunOneDomainResult.mockRejectedValue({ code: 11000 });
    const response = await service.computeDomainResult(
      PATIENT_ID,
      VISIT_ID,
      INSTANCE_ID,
      currentUser,
      { confirm: true },
    );
    expect(response.alreadyComputed).toBe(true);
  });

  it('returns a voided result from latest with safe source trace', async () => {
    domains.findDomainResultByScaleInstanceAndRunNo.mockResolvedValue(
      domainResultFixture('voided'),
    );
    const response = await service.getLatestDomainResult(
      PATIENT_ID,
      VISIT_ID,
      INSTANCE_ID,
    );
    expect(response.sourceScoreResult).toEqual(
      expect.objectContaining({ id: SCORE_ID, status: 'confirmed' }),
    );
    expect(mapper.toPublicResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'voided' }),
    );
  });
});
