// backend/src/modules/assessments/services/assessment-execution.service.spec.ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ScaleSeedDataService } from '../../scales/seeds/scale-seed-data.service';
import { ItemResponse } from '../schemas/item-response.schema';
import { ScaleInstance } from '../schemas/scale-instance.schema';
import type {
  BuildScaleExecutionPlanInput,
  ItemResponseDraft,
  ScaleInstanceDraft,
} from '../types/assessment-execution.types';
import { AssessmentExecutionService } from './assessment-execution.service';

type PersistableItemResponseDraftForTest = Omit<
  ItemResponseDraft,
  'scaleInstanceId'
> & {
  scaleInstanceId: Types.ObjectId;
};

function buildPlanInput(
  scaleCode: string,
  scaleVersion = '1.0',
): BuildScaleExecutionPlanInput {
  return {
    patientId: new Types.ObjectId(),
    assessmentVisitId: new Types.ObjectId(),
    subjectCode: ' subj-test-a9 ',
    scaleDefinitionId: new Types.ObjectId(),
    scaleVersionId: new Types.ObjectId(),
    scaleCode,
    scaleVersion,
    instanceCode: ` inst-test-a9-${scaleCode} `,
    instanceNo: 1,
    administrationMode: 'clinician_administered',
    operatorSnapshot: {
      operatorId: new Types.ObjectId(),
      operatorName: 'Sample Operator',
      operatorRole: 'research_assistant',
    },
    metadata: { projectCode: 'PROJECT-TEST' },
  };
}

function findItemDraft(
  itemResponseDrafts: ItemResponseDraft[],
  itemCode: string,
): ItemResponseDraft {
  const itemDraft = itemResponseDrafts.find(
    (draft) => draft.itemCode === itemCode,
  );

  if (!itemDraft) {
    throw new Error(`item draft not found: ${itemCode}`);
  }

  return itemDraft;
}

function getRecord(value: unknown): Record<string, unknown> {
  expect(value).toEqual(expect.any(Object));
  expect(Array.isArray(value)).toBe(false);

  return value as Record<string, unknown>;
}

describe('AssessmentExecutionService', () => {
  let service: AssessmentExecutionService;
  let seedDataService: ScaleSeedDataService;
  let scaleInstanceModel: {
    create: jest.Mock;
  };
  let itemResponseModel: {
    insertMany: jest.Mock;
  };

  beforeEach(async () => {
    scaleInstanceModel = {
      create: jest.fn(),
    };
    itemResponseModel = {
      insertMany: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AssessmentExecutionService,
        ScaleSeedDataService,
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

    service = moduleRef.get(AssessmentExecutionService);
    seedDataService = moduleRef.get(ScaleSeedDataService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('builds an MMSE execution plan from seed without writing data', () => {
    const plan = service.buildScaleExecutionPlan(buildPlanInput('mmse'));

    expect(plan.seedSummary).toEqual(
      expect.objectContaining({
        scaleCode: 'mmse',
        scaleVersion: '1.0',
        itemCount: 11,
        groupCount: 6,
        sourceDocument: 'MMSE+MoCA.pdf',
      }),
    );
    expect(plan.scaleInstanceDraft).toEqual(
      expect.objectContaining({
        scaleCode: 'mmse',
        scaleVersion: '1.0',
        subjectCode: 'SUBJ-TEST-A9',
        instanceCode: 'INST-TEST-A9-MMSE',
        status: 'draft',
        administrationMode: 'clinician_administered',
      }),
    );
    expect(plan.scaleInstanceDraft.progress).toEqual({
      totalItemCount: 11,
      answeredItemCount: 0,
      source: 'scale_seed',
    });
    expect(plan.itemResponseDrafts).toHaveLength(11);
    expect(scaleInstanceModel.create).not.toHaveBeenCalled();
    expect(itemResponseModel.insertMany).not.toHaveBeenCalled();
  });

  it('builds a MoCA execution plan from seed without writing data', () => {
    const plan = service.buildScaleExecutionPlan(buildPlanInput('moca'));

    expect(plan.seedSummary).toEqual(
      expect.objectContaining({
        scaleCode: 'moca',
        scaleVersion: '1.0',
        itemCount: 16,
        groupCount: 8,
        sourceDocument: 'MMSE+MoCA.pdf',
      }),
    );
    expect(plan.itemResponseDrafts).toHaveLength(16);
    expect(plan.itemResponseDrafts[0]).toEqual(
      expect.objectContaining({
        itemCode: 'moca.visuospatial.trail_making',
        status: 'not_started',
        rawResponse: null,
        structuredResponse: null,
        isMissing: false,
      }),
    );
    expect(scaleInstanceModel.create).not.toHaveBeenCalled();
    expect(itemResponseModel.insertMany).not.toHaveBeenCalled();
  });

  it('keeps the corrected MMSE writing sentence CRF code', () => {
    const plan = service.buildScaleExecutionPlan(buildPlanInput('mmse'));
    const itemDraft = findItemDraft(
      plan.itemResponseDrafts,
      'mmse.language.writing_sentence',
    );

    expect(itemDraft.crfCode).toBe('MMSE.9');
  });

  it('initializes MMSE copy drawing photo and handwriting evidence placeholders', () => {
    const plan = service.buildScaleExecutionPlan(buildPlanInput('mmse'));
    const itemDraft = findItemDraft(
      plan.itemResponseDrafts,
      'mmse.visuospatial.copy_drawing',
    );

    expect(itemDraft.evidenceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ evidenceType: 'photo', status: 'pending' }),
        expect.objectContaining({
          evidenceType: 'handwriting',
          status: 'pending',
        }),
        expect.objectContaining({
          evidenceType: 'operator_note',
          status: 'pending',
        }),
      ]),
    );
    expect(itemDraft.itemConfigSnapshot).toEqual(
      expect.objectContaining({
        supportsPhotoUpload: true,
        supportsHandwriting: true,
      }),
    );
    expect(itemDraft.itemConfigSnapshot.evidenceTypes).toEqual(
      expect.arrayContaining(['photo', 'handwriting']),
    );
  });

  it('keeps MoCA immediate memory items as non-scored total records', () => {
    const plan = service.buildScaleExecutionPlan(buildPlanInput('moca'));
    const trial1 = findItemDraft(
      plan.itemResponseDrafts,
      'moca.memory.immediate.trial_1',
    );
    const trial2 = findItemDraft(
      plan.itemResponseDrafts,
      'moca.memory.immediate.trial_2',
    );

    expect(trial1.countsTowardTotal).toBe(false);
    expect(trial2.countsTowardTotal).toBe(false);
    expect(trial1.score).toEqual(
      expect.objectContaining({
        minScore: 0,
        maxScore: 0,
        scoreStatus: 'not_scored',
        scoreSource: 'none',
      }),
    );
    expect(trial2.itemConfigSnapshot).toEqual(
      expect.objectContaining({
        countsTowardTotal: false,
      }),
    );
  });

  it('keeps MoCA delayed recall prompt metadata and non-scored cue placeholders', () => {
    const plan = service.buildScaleExecutionPlan(buildPlanInput('moca'));
    const delayedRecall = findItemDraft(
      plan.itemResponseDrafts,
      'moca.memory.delayed_recall',
    );
    const scoringRule = getRecord(delayedRecall.itemConfigSnapshot.scoringRule);
    const promptRecords = scoringRule.promptRecords;

    expect(Array.isArray(promptRecords)).toBe(true);
    expect(promptRecords).toHaveLength(5);
    expect(delayedRecall.promptResponses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          promptType: 'semantic_category',
          countsTowardScore: false,
          responseAfterPrompt: null,
        }),
        expect.objectContaining({
          promptType: 'multiple_choice',
          countsTowardScore: false,
          responseAfterPrompt: null,
        }),
      ]),
    );
  });

  it('initializes MMSE serial sevens step results with expected values', () => {
    const plan = service.buildScaleExecutionPlan(buildPlanInput('mmse'));
    const serialSevens = findItemDraft(
      plan.itemResponseDrafts,
      'mmse.attention.serial_sevens',
    );

    expect(serialSevens.stepResults.map((step) => step.expectedValue)).toEqual([
      93, 86, 79, 72, 65,
    ]);
    expect(serialSevens.stepResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stepCode: 'mmse.attention.serial_sevens.step_1',
          actualValue: null,
          isCorrect: null,
          scoreValue: null,
          countsTowardItemScore: true,
        }),
      ]),
    );
  });

  it('initializes MoCA serial sevens steps and preserves the 0-3 aggregation metadata', () => {
    const plan = service.buildScaleExecutionPlan(buildPlanInput('moca'));
    const serialSevens = findItemDraft(
      plan.itemResponseDrafts,
      'moca.attention.serial_sevens',
    );
    const scoringRule = getRecord(serialSevens.itemConfigSnapshot.scoringRule);

    expect(serialSevens.stepResults.map((step) => step.expectedValue)).toEqual([
      93, 86, 79, 72, 65,
    ]);
    expect(scoringRule.aggregationRule).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ correctStepCount: 0, score: 0 }),
        expect.objectContaining({ correctStepCount: 1, score: 1 }),
        expect.objectContaining({ correctStepCountMin: 2, score: 2 }),
        expect.objectContaining({ correctStepCountMin: 4, score: 3 }),
      ]),
    );
  });

  it('initializes MoCA trail making timer and evidence placeholders', () => {
    const plan = service.buildScaleExecutionPlan(buildPlanInput('moca'));
    const trailMaking = findItemDraft(
      plan.itemResponseDrafts,
      'moca.visuospatial.trail_making',
    );

    expect(trailMaking.itemConfigSnapshot).toEqual(
      expect.objectContaining({ requiresTimer: true }),
    );
    expect(trailMaking.timing).toEqual({
      startedAt: null,
      completedAt: null,
      durationMs: null,
      timerSource: 'none',
    });
    expect(trailMaking.evidenceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ evidenceType: 'photo', status: 'pending' }),
        expect.objectContaining({
          evidenceType: 'handwriting',
          status: 'pending',
        }),
        expect.objectContaining({
          evidenceType: 'duration',
          status: 'pending',
        }),
      ]),
    );
  });

  it('normalizes subject, instance and scale codes', () => {
    expect(service.normalizeSubjectCode(' subj-test-001 ')).toBe(
      'SUBJ-TEST-001',
    );
    expect(service.normalizeInstanceCode(' inst-test-001 ')).toBe(
      'INST-TEST-001',
    );
    expect(service.normalizeScaleCode(' MoCA ')).toBe('moca');
  });

  it('does not create data when the seed or seed version is missing', () => {
    expect(() =>
      service.buildScaleExecutionPlan(buildPlanInput('unknown-scale')),
    ).toThrow(NotFoundException);
    expect(() =>
      service.buildScaleExecutionPlan(buildPlanInput('mmse', '9.9')),
    ).toThrow(NotFoundException);
    expect(scaleInstanceModel.create).not.toHaveBeenCalled();
    expect(itemResponseModel.insertMany).not.toHaveBeenCalled();
  });

  it('does not create data when seed validation fails', () => {
    jest.spyOn(seedDataService, 'validateScaleSeeds').mockReturnValue({
      valid: false,
      errors: ['seed validation failed in unit test'],
      warnings: [],
      issues: [
        {
          level: 'error',
          code: 'unit_test_seed_error',
          message: 'seed validation failed in unit test',
          scaleCode: 'mmse',
        },
      ],
    });

    expect(() =>
      service.buildScaleExecutionPlan(buildPlanInput('mmse')),
    ).toThrow(BadRequestException);
    expect(scaleInstanceModel.create).not.toHaveBeenCalled();
    expect(itemResponseModel.insertMany).not.toHaveBeenCalled();
  });

  it('rejects invalid required inputs before creating data', () => {
    const invalidInput = {
      ...buildPlanInput('mmse'),
      patientId: 'not-a-valid-object-id',
    };

    expect(() => service.buildScaleExecutionPlan(invalidInput)).toThrow(
      BadRequestException,
    );
    expect(() =>
      service.buildScaleExecutionPlan({
        ...buildPlanInput('mmse'),
        subjectCode: '   ',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.buildScaleExecutionPlan({
        ...buildPlanInput('mmse'),
        administrationMode: 'unsupervised_home_self_test',
      }),
    ).toThrow(BadRequestException);
    expect(scaleInstanceModel.create).not.toHaveBeenCalled();
    expect(itemResponseModel.insertMany).not.toHaveBeenCalled();
  });

  it('creates ScaleInstance before ItemResponse drafts and returns mapped summaries', async () => {
    const plan = service.buildScaleExecutionPlan(buildPlanInput('mmse'));
    const scaleInstanceId = new Types.ObjectId();

    scaleInstanceModel.create.mockImplementation((draft: ScaleInstanceDraft) =>
      Promise.resolve({
        _id: scaleInstanceId,
        ...draft,
      }),
    );
    itemResponseModel.insertMany.mockImplementation(
      (drafts: PersistableItemResponseDraftForTest[]) =>
        Promise.resolve(
          drafts.map((draft) => ({
            _id: new Types.ObjectId(),
            ...draft,
          })),
        ),
    );

    const result = await service.createScaleExecutionFromPlan(plan);

    expect(scaleInstanceModel.create).toHaveBeenCalledWith(
      plan.scaleInstanceDraft,
    );
    expect(itemResponseModel.insertMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          scaleInstanceId,
          itemCode: 'mmse.orientation.time',
        }),
      ]),
      { ordered: true },
    );
    expect(scaleInstanceModel.create.mock.invocationCallOrder[0]).toBeLessThan(
      itemResponseModel.insertMany.mock.invocationCallOrder[0],
    );
    expect(result.createdItemResponseCount).toBe(
      plan.itemResponseDrafts.length,
    );
    expect(result.scaleInstance).not.toHaveProperty('_id');
    expect(result.itemResponses[0]).not.toHaveProperty('_id');
    expect(result.scaleInstance.id).toBe(scaleInstanceId.toString());
    expect(result.itemResponses[0].scaleInstanceId).toBe(
      scaleInstanceId.toString(),
    );
  });

  it('creates execution from seed by composing plan and create', async () => {
    const scaleInstanceId = new Types.ObjectId();

    scaleInstanceModel.create.mockImplementation((draft: ScaleInstanceDraft) =>
      Promise.resolve({
        _id: scaleInstanceId,
        ...draft,
      }),
    );
    itemResponseModel.insertMany.mockImplementation(
      (drafts: PersistableItemResponseDraftForTest[]) =>
        Promise.resolve(
          drafts.map((draft) => ({
            _id: new Types.ObjectId(),
            ...draft,
          })),
        ),
    );

    const result = await service.createScaleExecutionFromSeed(
      buildPlanInput('moca'),
    );

    expect(result).toEqual(
      expect.objectContaining({
        createdItemResponseCount: 16,
        scaleCode: 'moca',
        scaleVersion: '1.0',
        instanceCode: 'INST-TEST-A9-MOCA',
      }),
    );
    expect(result.scaleInstance).not.toHaveProperty('_id');
    expect(result.itemResponses[0]).not.toHaveProperty('_id');
    expect(result.itemResponses).toHaveLength(16);
  });
});
