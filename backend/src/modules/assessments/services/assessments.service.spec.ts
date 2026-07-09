// backend/src/modules/assessments/services/assessments.service.spec.ts
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import {
  AssessmentVisit,
  AssessmentVisitSchema,
} from '../schemas/assessment-visit.schema';
import {
  ItemEvidenceRefSchema,
  ItemResponse,
  ItemResponseSchema,
  ItemResponseVersionTraceSchema,
  ItemScoreSnapshotSchema,
  ItemStepResultSchema,
  ItemTimingSnapshotSchema,
  PromptResponseRecordSchema,
} from '../schemas/item-response.schema';
import {
  ScaleInstance,
  ScaleInstanceSchema,
} from '../schemas/scale-instance.schema';
import { AssessmentsService } from './assessments.service';

function createExecQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('Assessment schemas', () => {
  it('defines AssessmentVisit collection and indexes', () => {
    expect(AssessmentVisitSchema.get('collection')).toBe('assessment_visits');
    expect(AssessmentVisitSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ visitCode: 1 }, expect.objectContaining({ unique: true })],
        [{ patientId: 1, assessmentDate: -1 }, expect.any(Object)],
        [{ subjectCode: 1, assessmentDate: -1 }, expect.any(Object)],
        [{ status: 1, assessmentDate: -1 }, expect.any(Object)],
      ]),
    );
  });

  it('defines AssessmentVisit explicit ObjectId, primitive, Date and Mixed field types', () => {
    expect(AssessmentVisitSchema.path('patientId')?.instance).toBe('ObjectId');
    expect(AssessmentVisitSchema.path('visitType')?.instance).toBe('String');
    expect(AssessmentVisitSchema.path('status')?.instance).toBe('String');
    expect(AssessmentVisitSchema.path('assessmentDate')?.instance).toBe('Date');
    expect(AssessmentVisitSchema.path('startedAt')?.instance).toBe('Date');
    expect(AssessmentVisitSchema.path('completedAt')?.instance).toBe('Date');
    expect(AssessmentVisitSchema.path('lockedAt')?.instance).toBe('Date');
    expect(AssessmentVisitSchema.path('voidedAt')?.instance).toBe('Date');
    expect(
      AssessmentVisitSchema.path('operatorSnapshot.operatorId')?.instance,
    ).toBe('ObjectId');
    expect(
      AssessmentVisitSchema.path('operatorSnapshot.operatorRole')?.instance,
    ).toBe('String');
    expect(AssessmentVisitSchema.path('clinicalContext')?.instance).toBe(
      'Mixed',
    );
    expect(AssessmentVisitSchema.path('metadata')?.instance).toBe('Mixed');
  });

  it('defines ScaleInstance collection and indexes', () => {
    expect(ScaleInstanceSchema.get('collection')).toBe('scale_instances');
    expect(ScaleInstanceSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ instanceCode: 1 }, expect.objectContaining({ unique: true })],
        [
          { assessmentVisitId: 1, scaleCode: 1, instanceNo: 1 },
          expect.objectContaining({ unique: true }),
        ],
        [{ patientId: 1, scaleCode: 1, startedAt: -1 }, expect.any(Object)],
        [{ status: 1, updatedAt: -1 }, expect.any(Object)],
        [{ scaleCode: 1, scaleVersion: 1 }, expect.any(Object)],
      ]),
    );
  });

  it('defines ScaleInstance explicit ObjectId, primitive, Date, Number and Mixed field types', () => {
    expect(ScaleInstanceSchema.path('assessmentVisitId')?.instance).toBe(
      'ObjectId',
    );
    expect(ScaleInstanceSchema.path('patientId')?.instance).toBe('ObjectId');
    expect(ScaleInstanceSchema.path('scaleDefinitionId')?.instance).toBe(
      'ObjectId',
    );
    expect(ScaleInstanceSchema.path('scaleVersionId')?.instance).toBe(
      'ObjectId',
    );
    expect(ScaleInstanceSchema.path('scaleCode')?.instance).toBe('String');
    expect(ScaleInstanceSchema.path('status')?.instance).toBe('String');
    expect(ScaleInstanceSchema.path('administrationMode')?.instance).toBe(
      'String',
    );
    expect(ScaleInstanceSchema.path('versionTrace.crfVersion')?.instance).toBe(
      'String',
    );
    expect(ScaleInstanceSchema.path('startedAt')?.instance).toBe('Date');
    expect(ScaleInstanceSchema.path('completedAt')?.instance).toBe('Date');
    expect(ScaleInstanceSchema.path('lockedAt')?.instance).toBe('Date');
    expect(ScaleInstanceSchema.path('voidedAt')?.instance).toBe('Date');
    expect(ScaleInstanceSchema.path('durationMs')?.instance).toBe('Number');
    expect(
      ScaleInstanceSchema.path('operatorSnapshot.operatorId')?.instance,
    ).toBe('ObjectId');
    expect(ScaleInstanceSchema.path('progress')?.instance).toBe('Mixed');
    expect(ScaleInstanceSchema.path('qualityControlSummary')?.instance).toBe(
      'Mixed',
    );
    expect(ScaleInstanceSchema.path('metadata')?.instance).toBe('Mixed');
  });

  it('defines ItemResponse collection and indexes', () => {
    expect(ItemResponseSchema.get('collection')).toBe('item_responses');
    expect(ItemResponseSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { scaleInstanceId: 1, itemCode: 1 },
          expect.objectContaining({ unique: true }),
        ],
        [
          { assessmentVisitId: 1, scaleInstanceId: 1, itemOrder: 1 },
          expect.any(Object),
        ],
        [{ patientId: 1, scaleCode: 1, itemCode: 1 }, expect.any(Object)],
        [{ scaleCode: 1, itemCode: 1 }, expect.any(Object)],
        [{ status: 1, updatedAt: -1 }, expect.any(Object)],
        [{ scaleInstanceId: 1, countsTowardTotal: 1 }, expect.any(Object)],
      ]),
    );
  });

  it('defines ItemResponse explicit ObjectId, primitive, nullable and Mixed field types', () => {
    expect(ItemResponseSchema.path('assessmentVisitId')?.instance).toBe(
      'ObjectId',
    );
    expect(ItemResponseSchema.path('scaleInstanceId')?.instance).toBe(
      'ObjectId',
    );
    expect(ItemResponseSchema.path('patientId')?.instance).toBe('ObjectId');
    expect(ItemResponseSchema.path('scaleDefinitionId')?.instance).toBe(
      'ObjectId',
    );
    expect(ItemResponseSchema.path('scaleVersionId')?.instance).toBe(
      'ObjectId',
    );
    expect(ItemResponseSchema.path('scaleCode')?.instance).toBe('String');
    expect(ItemResponseSchema.path('instanceCode')?.instance).toBe('String');
    expect(ItemResponseSchema.path('itemCode')?.instance).toBe('String');
    expect(ItemResponseSchema.path('itemOrder')?.instance).toBe('Number');
    expect(ItemResponseSchema.path('responseType')?.instance).toBe('String');
    expect(ItemResponseSchema.path('countsTowardTotal')?.instance).toBe(
      'Boolean',
    );
    expect(ItemResponseSchema.path('itemConfigSnapshot')?.instance).toBe(
      'Mixed',
    );
    expect(ItemResponseSchema.path('status')?.instance).toBe('String');
    expect(ItemResponseSchema.path('answerSource')?.instance).toBe('String');
    expect(ItemResponseSchema.path('rawResponse')?.instance).toBe('Mixed');
    expect(ItemResponseSchema.path('structuredResponse')?.instance).toBe(
      'Mixed',
    );
    expect(ItemResponseSchema.path('isMissing')?.instance).toBe('Boolean');
    expect(ItemResponseSchema.path('qualityControlHints')?.instance).toBe(
      'Mixed',
    );
    expect(ItemResponseSchema.path('metadata')?.instance).toBe('Mixed');
    expect(ItemResponseSchema.path('lockedAt')?.instance).toBe('Date');
    expect(ItemResponseSchema.path('voidedAt')?.instance).toBe('Date');

    expect(ItemResponseVersionTraceSchema.path('scaleVersion')?.instance).toBe(
      'String',
    );
    expect(ItemScoreSnapshotSchema.path('scoreValue')?.instance).toBe('Number');
    expect(ItemScoreSnapshotSchema.path('maxScore')?.instance).toBe('Number');
    expect(ItemScoreSnapshotSchema.path('minScore')?.instance).toBe('Number');
    expect(ItemScoreSnapshotSchema.path('scoreStatus')?.instance).toBe(
      'String',
    );
    expect(ItemScoreSnapshotSchema.path('scoreSource')?.instance).toBe(
      'String',
    );
    expect(ItemScoreSnapshotSchema.path('scoredAt')?.instance).toBe('Date');
    expect(ItemScoreSnapshotSchema.path('scoredBy')?.instance).toBe('ObjectId');
    expect(ItemStepResultSchema.path('expectedValue')?.instance).toBe('Mixed');
    expect(ItemStepResultSchema.path('actualValue')?.instance).toBe('Mixed');
    expect(ItemStepResultSchema.path('isCorrect')?.instance).toBe('Boolean');
    expect(ItemStepResultSchema.path('scoreValue')?.instance).toBe('Number');
    expect(PromptResponseRecordSchema.path('promptType')?.instance).toBe(
      'String',
    );
    expect(
      PromptResponseRecordSchema.path('responseAfterPrompt')?.instance,
    ).toBe('Mixed');
    expect(PromptResponseRecordSchema.path('isCorrect')?.instance).toBe(
      'Boolean',
    );
    expect(PromptResponseRecordSchema.path('countsTowardScore')?.instance).toBe(
      'Boolean',
    );
    expect(ItemTimingSnapshotSchema.path('startedAt')?.instance).toBe('Date');
    expect(ItemTimingSnapshotSchema.path('completedAt')?.instance).toBe('Date');
    expect(ItemTimingSnapshotSchema.path('durationMs')?.instance).toBe(
      'Number',
    );
    expect(ItemTimingSnapshotSchema.path('timerSource')?.instance).toBe(
      'String',
    );
    expect(ItemEvidenceRefSchema.path('evidenceType')?.instance).toBe('String');
    expect(ItemEvidenceRefSchema.path('mediaEvidenceId')?.instance).toBe(
      'ObjectId',
    );
    expect(ItemEvidenceRefSchema.path('status')?.instance).toBe('String');
  });

  it('keeps ItemResponse embedded schemas without nested _id fields', () => {
    expect(ItemResponseVersionTraceSchema.get('_id')).toBe(false);
    expect(ItemScoreSnapshotSchema.get('_id')).toBe(false);
    expect(ItemStepResultSchema.get('_id')).toBe(false);
    expect(PromptResponseRecordSchema.get('_id')).toBe(false);
    expect(ItemTimingSnapshotSchema.get('_id')).toBe(false);
    expect(ItemEvidenceRefSchema.get('_id')).toBe(false);
  });
});

describe('AssessmentsService', () => {
  let service: AssessmentsService;
  let assessmentVisitModel: {
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let scaleInstanceModel: {
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let itemResponseModel: {
    findOne: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(async () => {
    assessmentVisitModel = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    scaleInstanceModel = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    itemResponseModel = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AssessmentsService,
        {
          provide: getModelToken(AssessmentVisit.name),
          useValue: assessmentVisitModel,
        },
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

    service = moduleRef.get(AssessmentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes visit and instance codes with trim and uppercase', () => {
    expect(service.normalizeVisitCode('  visit-test-001  ')).toBe(
      'VISIT-TEST-001',
    );
    expect(service.normalizeInstanceCode('  inst-test-001  ')).toBe(
      'INST-TEST-001',
    );
    expect(
      service.normalizeItemCode('  MMSE.Attention.Serial_Sevens.Step_1  '),
    ).toBe('mmse.attention.serial_sevens.step_1');
  });

  it('returns null when visit is not found', async () => {
    assessmentVisitModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(
      service.findVisitByCode('VISIT-UNKNOWN-001'),
    ).resolves.toBeNull();
    expect(assessmentVisitModel.findOne).toHaveBeenCalledWith({
      visitCode: 'VISIT-UNKNOWN-001',
    });
  });

  it('maps visit results instead of returning raw documents', async () => {
    const visitId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const operatorId = new Types.ObjectId();
    const assessmentDate = new Date('2026-01-02T08:00:00.000Z');
    const startedAt = new Date('2026-01-02T08:05:00.000Z');
    const rawVisit = {
      _id: visitId,
      patientId,
      subjectCode: 'SUBJ-TEST-001',
      visitCode: 'VISIT-TEST-001',
      visitType: 'baseline',
      status: 'in_progress',
      assessmentDate,
      startedAt,
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
      operatorSnapshot: {
        operatorId,
        operatorName: 'Sample Operator',
        operatorRole: 'research_assistant',
      },
      clinicalContext: { departmentCode: 'DEPT-TEST' },
      notes: 'De-identified visit note',
      metadata: { projectCode: 'PROJECT-TEST' },
      internalMarker: 'not returned',
    };
    assessmentVisitModel.findOne.mockReturnValue(createExecQuery(rawVisit));

    const result = await service.findVisitByCode(' visit-test-001 ');

    expect(result).toEqual({
      id: visitId.toString(),
      patientId: patientId.toString(),
      subjectCode: 'SUBJ-TEST-001',
      visitCode: 'VISIT-TEST-001',
      visitType: 'baseline',
      status: 'in_progress',
      assessmentDate,
      startedAt,
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
      operatorSnapshot: {
        operatorId: operatorId.toString(),
        operatorName: 'Sample Operator',
        operatorRole: 'research_assistant',
      },
      clinicalContext: { departmentCode: 'DEPT-TEST' },
      notes: 'De-identified visit note',
      metadata: { projectCode: 'PROJECT-TEST' },
    });
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('internalMarker');
    expect(assessmentVisitModel.findOne).toHaveBeenCalledWith({
      visitCode: 'VISIT-TEST-001',
    });
  });

  it('lists visits by patient id through mapper output', async () => {
    const visitId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const assessmentDate = new Date('2026-01-03T08:00:00.000Z');
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        {
          _id: visitId,
          patientId,
          subjectCode: 'SUBJ-TEST-001',
          visitCode: 'VISIT-TEST-002',
          visitType: 'follow_up',
          status: 'draft',
          assessmentDate,
          startedAt: null,
          completedAt: null,
          lockedAt: null,
          voidedAt: null,
          operatorSnapshot: null,
          clinicalContext: null,
          metadata: null,
          internalMarker: 'not returned',
        },
      ]),
    );
    assessmentVisitModel.find.mockReturnValue({ sort });

    const result = await service.listVisitsByPatientId(patientId);

    expect(assessmentVisitModel.find).toHaveBeenCalledWith({ patientId });
    expect(sort).toHaveBeenCalledWith({ assessmentDate: -1 });
    expect(result).toEqual([
      {
        id: visitId.toString(),
        patientId: patientId.toString(),
        subjectCode: 'SUBJ-TEST-001',
        visitCode: 'VISIT-TEST-002',
        visitType: 'follow_up',
        status: 'draft',
        assessmentDate,
        startedAt: null,
        completedAt: null,
        lockedAt: null,
        voidedAt: null,
        operatorSnapshot: null,
        clinicalContext: null,
        notes: undefined,
        metadata: null,
      },
    ]);
    expect(result[0]).not.toHaveProperty('internalMarker');
  });

  it('returns null when scale instance is not found', async () => {
    scaleInstanceModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(
      service.findScaleInstanceByCode('INST-UNKNOWN-001'),
    ).resolves.toBeNull();
    expect(scaleInstanceModel.findOne).toHaveBeenCalledWith({
      instanceCode: 'INST-UNKNOWN-001',
    });
  });

  it('maps scale instance results instead of returning raw documents', async () => {
    const instanceId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const operatorId = new Types.ObjectId();
    const startedAt = new Date('2026-01-04T08:00:00.000Z');
    const completedAt = new Date('2026-01-04T08:20:00.000Z');
    const rawInstance = {
      _id: instanceId,
      assessmentVisitId: visitId,
      patientId,
      subjectCode: 'SUBJ-TEST-001',
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      instanceCode: 'INST-TEST-001',
      instanceNo: 1,
      status: 'completed',
      administrationMode: 'clinician_administered',
      versionTrace: {
        crfVersion: 'crf-test-1',
        scoringRuleVersion: 'score-test-1',
        fieldEncodingVersion: 'field-test-1',
        sourceDocument: 'source-test',
      },
      startedAt,
      completedAt,
      lockedAt: null,
      voidedAt: null,
      durationMs: 1200000,
      operatorSnapshot: {
        operatorId,
        operatorName: 'Sample Operator',
        operatorRole: 'doctor',
      },
      progress: { completedItemCount: 0 },
      qualityControlSummary: { reviewed: false },
      notes: 'De-identified scale instance note',
      metadata: { source: 'unit-test' },
      internalMarker: 'not returned',
    };
    scaleInstanceModel.findOne.mockReturnValue(createExecQuery(rawInstance));

    const result = await service.findScaleInstanceByCode(' inst-test-001 ');

    expect(result).toEqual({
      id: instanceId.toString(),
      assessmentVisitId: visitId.toString(),
      patientId: patientId.toString(),
      subjectCode: 'SUBJ-TEST-001',
      scaleDefinitionId: definitionId.toString(),
      scaleVersionId: versionId.toString(),
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      instanceCode: 'INST-TEST-001',
      instanceNo: 1,
      status: 'completed',
      administrationMode: 'clinician_administered',
      versionTrace: {
        crfVersion: 'crf-test-1',
        scoringRuleVersion: 'score-test-1',
        fieldEncodingVersion: 'field-test-1',
        sourceDocument: 'source-test',
      },
      startedAt,
      completedAt,
      lockedAt: null,
      voidedAt: null,
      durationMs: 1200000,
      operatorSnapshot: {
        operatorId: operatorId.toString(),
        operatorName: 'Sample Operator',
        operatorRole: 'doctor',
      },
      progress: { completedItemCount: 0 },
      qualityControlSummary: { reviewed: false },
      notes: 'De-identified scale instance note',
      metadata: { source: 'unit-test' },
    });
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('internalMarker');
    expect(scaleInstanceModel.findOne).toHaveBeenCalledWith({
      instanceCode: 'INST-TEST-001',
    });
  });

  it('lists scale instances by visit id through mapper output', async () => {
    const instanceId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        {
          _id: instanceId,
          assessmentVisitId: visitId,
          patientId,
          subjectCode: 'SUBJ-TEST-001',
          scaleDefinitionId: definitionId,
          scaleVersionId: versionId,
          scaleCode: 'moca',
          scaleVersion: '1.0',
          instanceCode: 'INST-TEST-002',
          instanceNo: 1,
          status: 'draft',
          administrationMode: 'supervised_patient_input',
          versionTrace: null,
          startedAt: null,
          completedAt: null,
          lockedAt: null,
          voidedAt: null,
          durationMs: null,
          operatorSnapshot: null,
          progress: null,
          qualityControlSummary: null,
          metadata: null,
          internalMarker: 'not returned',
        },
      ]),
    );
    scaleInstanceModel.find.mockReturnValue({ sort });

    const result = await service.listScaleInstancesByVisitId(visitId);

    expect(scaleInstanceModel.find).toHaveBeenCalledWith({
      assessmentVisitId: visitId,
    });
    expect(sort).toHaveBeenCalledWith({ instanceNo: 1, scaleCode: 1 });
    expect(result).toEqual([
      {
        id: instanceId.toString(),
        assessmentVisitId: visitId.toString(),
        patientId: patientId.toString(),
        subjectCode: 'SUBJ-TEST-001',
        scaleDefinitionId: definitionId.toString(),
        scaleVersionId: versionId.toString(),
        scaleCode: 'moca',
        scaleVersion: '1.0',
        instanceCode: 'INST-TEST-002',
        instanceNo: 1,
        status: 'draft',
        administrationMode: 'supervised_patient_input',
        versionTrace: null,
        startedAt: null,
        completedAt: null,
        lockedAt: null,
        voidedAt: null,
        durationMs: null,
        operatorSnapshot: null,
        progress: null,
        qualityControlSummary: null,
        notes: undefined,
        metadata: null,
      },
    ]);
    expect(result[0]).not.toHaveProperty('internalMarker');
  });

  it('returns null when item response is not found', async () => {
    const scaleInstanceId = new Types.ObjectId();
    itemResponseModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(
      service.findItemResponseByScaleInstanceAndItemCode(
        scaleInstanceId,
        ' MMSE.Attention.Serial_Sevens.Step_1 ',
      ),
    ).resolves.toBeNull();
    expect(itemResponseModel.findOne).toHaveBeenCalledWith({
      scaleInstanceId,
      itemCode: 'mmse.attention.serial_sevens.step_1',
    });
  });

  it('maps item response results instead of returning raw documents', async () => {
    const itemResponseId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const scoredBy = new Types.ObjectId();
    const startedAt = new Date('2026-01-05T08:00:00.000Z');
    const completedAt = new Date('2026-01-05T08:02:00.000Z');
    const scoredAt = new Date('2026-01-05T08:03:00.000Z');
    const rawItemResponse = {
      _id: itemResponseId,
      assessmentVisitId: visitId,
      scaleInstanceId,
      patientId,
      subjectCode: 'SUBJ-TEST-001',
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      instanceCode: 'INST-TEST-001',
      itemCode: 'mmse.attention.serial_sevens.step_1',
      crfCode: 'N1.1.5.1',
      groupCode: 'attention',
      itemTitle: 'Serial sevens step 1',
      itemOrder: 5,
      responseType: 'multi_step_calculation',
      countsTowardTotal: true,
      cognitiveDomainCodes: ['attention'],
      itemConfigSnapshot: { promptCode: 'serial-sevens' },
      versionTrace: {
        scaleVersion: '1.0',
        crfVersion: 'crf-test-1',
        scoringRuleVersion: 'score-test-1',
        fieldEncodingVersion: 'field-test-1',
        sourceDocument: 'source-test',
      },
      status: 'scored',
      answerSource: 'clinician_recorded',
      rawResponse: { spokenAnswer: '94, 86' },
      structuredResponse: { calculationSteps: ['94', '86'] },
      responseText: '94, 86',
      responseSummary: 'Serial sevens partially correct',
      isMissing: false,
      missingReason: undefined,
      score: {
        scoreValue: 1,
        maxScore: 2,
        minScore: 0,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        scoredAt,
        scoredBy,
        scoringNote: 'Step scores recorded independently.',
      },
      stepResults: [
        {
          stepCode: 'step_1',
          crfCode: 'N1.1.5.1',
          label: '100 - 7',
          order: 1,
          expectedValue: 93,
          actualValue: 94,
          isCorrect: false,
          scoreValue: 0,
          countsTowardItemScore: true,
          note: 'Incorrect first subtraction.',
        },
        {
          stepCode: 'step_2',
          crfCode: 'N1.1.5.2',
          label: '93 - 7',
          order: 2,
          expectedValue: 86,
          actualValue: 86,
          isCorrect: true,
          scoreValue: 1,
          countsTowardItemScore: true,
          note: 'Scored independently from previous step.',
        },
      ],
      promptResponses: [
        {
          promptType: 'semantic_category',
          promptText: 'Category cue',
          responseAfterPrompt: { recalledWord: 'face' },
          isCorrect: true,
          countsTowardScore: false,
          order: 1,
          note: 'Cue response retained but not counted.',
        },
      ],
      timing: {
        startedAt,
        completedAt,
        durationMs: 120000,
        timerSource: 'manual',
      },
      evidenceRefs: [
        {
          evidenceType: 'handwriting',
          mediaEvidenceId: null,
          status: 'pending',
          note: 'Reserved for future media evidence.',
        },
      ],
      operatorNote: 'De-identified operator note',
      qualityControlHints: { needsReview: true },
      metadata: { source: 'unit-test' },
      lockedAt: null,
      voidedAt: null,
      internalMarker: 'not returned',
    };
    itemResponseModel.findOne.mockReturnValue(createExecQuery(rawItemResponse));

    const result = await service.findItemResponseByScaleInstanceAndItemCode(
      scaleInstanceId,
      ' MMSE.Attention.Serial_Sevens.Step_1 ',
    );

    expect(result).toEqual({
      id: itemResponseId.toString(),
      assessmentVisitId: visitId.toString(),
      scaleInstanceId: scaleInstanceId.toString(),
      patientId: patientId.toString(),
      subjectCode: 'SUBJ-TEST-001',
      scaleDefinitionId: definitionId.toString(),
      scaleVersionId: versionId.toString(),
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      instanceCode: 'INST-TEST-001',
      itemCode: 'mmse.attention.serial_sevens.step_1',
      crfCode: 'N1.1.5.1',
      groupCode: 'attention',
      itemTitle: 'Serial sevens step 1',
      itemOrder: 5,
      responseType: 'multi_step_calculation',
      countsTowardTotal: true,
      cognitiveDomainCodes: ['attention'],
      itemConfigSnapshot: { promptCode: 'serial-sevens' },
      versionTrace: {
        scaleVersion: '1.0',
        crfVersion: 'crf-test-1',
        scoringRuleVersion: 'score-test-1',
        fieldEncodingVersion: 'field-test-1',
        sourceDocument: 'source-test',
      },
      status: 'scored',
      answerSource: 'clinician_recorded',
      rawResponse: { spokenAnswer: '94, 86' },
      structuredResponse: { calculationSteps: ['94', '86'] },
      responseText: '94, 86',
      responseSummary: 'Serial sevens partially correct',
      isMissing: false,
      missingReason: undefined,
      score: {
        scoreValue: 1,
        maxScore: 2,
        minScore: 0,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        scoredAt,
        scoredBy: scoredBy.toString(),
        scoringNote: 'Step scores recorded independently.',
      },
      stepResults: [
        {
          stepCode: 'step_1',
          crfCode: 'N1.1.5.1',
          label: '100 - 7',
          order: 1,
          expectedValue: 93,
          actualValue: 94,
          isCorrect: false,
          scoreValue: 0,
          countsTowardItemScore: true,
          note: 'Incorrect first subtraction.',
        },
        {
          stepCode: 'step_2',
          crfCode: 'N1.1.5.2',
          label: '93 - 7',
          order: 2,
          expectedValue: 86,
          actualValue: 86,
          isCorrect: true,
          scoreValue: 1,
          countsTowardItemScore: true,
          note: 'Scored independently from previous step.',
        },
      ],
      promptResponses: [
        {
          promptType: 'semantic_category',
          promptText: 'Category cue',
          responseAfterPrompt: { recalledWord: 'face' },
          isCorrect: true,
          countsTowardScore: false,
          order: 1,
          note: 'Cue response retained but not counted.',
        },
      ],
      timing: {
        startedAt,
        completedAt,
        durationMs: 120000,
        timerSource: 'manual',
      },
      evidenceRefs: [
        {
          evidenceType: 'handwriting',
          mediaEvidenceId: null,
          status: 'pending',
          note: 'Reserved for future media evidence.',
        },
      ],
      operatorNote: 'De-identified operator note',
      qualityControlHints: { needsReview: true },
      metadata: { source: 'unit-test' },
      lockedAt: null,
      voidedAt: null,
    });
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('internalMarker');
    expect(itemResponseModel.findOne).toHaveBeenCalledWith({
      scaleInstanceId,
      itemCode: 'mmse.attention.serial_sevens.step_1',
    });
  });

  it('lists item responses by scale instance id ordered by item order', async () => {
    const itemResponseId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        {
          _id: itemResponseId,
          assessmentVisitId: visitId,
          scaleInstanceId,
          patientId,
          subjectCode: 'SUBJ-TEST-002',
          scaleDefinitionId: definitionId,
          scaleVersionId: versionId,
          scaleCode: 'moca',
          scaleVersion: '1.0',
          instanceCode: 'INST-TEST-002',
          itemCode: 'moca.memory.immediate.trial_1.face',
          itemOrder: 3,
          responseType: 'text',
          countsTowardTotal: false,
          cognitiveDomainCodes: ['memory'],
          itemConfigSnapshot: null,
          versionTrace: null,
          status: 'answered',
          answerSource: 'supervised_patient_input',
          rawResponse: 'face',
          structuredResponse: { wordCode: 'face', recalled: true },
          isMissing: false,
          score: null,
          stepResults: [],
          promptResponses: [],
          timing: null,
          evidenceRefs: [],
          qualityControlHints: null,
          metadata: null,
          lockedAt: null,
          voidedAt: null,
          internalMarker: 'not returned',
        },
      ]),
    );
    itemResponseModel.find.mockReturnValue({ sort });

    const result =
      await service.listItemResponsesByScaleInstanceId(scaleInstanceId);

    expect(itemResponseModel.find).toHaveBeenCalledWith({ scaleInstanceId });
    expect(sort).toHaveBeenCalledWith({ itemOrder: 1 });
    expect(result).toEqual([
      expect.objectContaining({
        id: itemResponseId.toString(),
        scaleInstanceId: scaleInstanceId.toString(),
        itemCode: 'moca.memory.immediate.trial_1.face',
        countsTowardTotal: false,
        score: null,
      }),
    ]);
    expect(result[0]).not.toHaveProperty('internalMarker');
  });

  it('lists scored item responses by scale instance id with scored filter', async () => {
    const scaleInstanceId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(createExecQuery([]));
    itemResponseModel.find.mockReturnValue({ sort });

    const result =
      await service.listScoredItemResponsesByScaleInstanceId(scaleInstanceId);

    expect(itemResponseModel.find).toHaveBeenCalledWith({
      scaleInstanceId,
      $or: [
        { status: 'scored' },
        {
          'score.scoreStatus': {
            $exists: true,
            $ne: 'not_scored',
          },
        },
      ],
    });
    expect(sort).toHaveBeenCalledWith({ itemOrder: 1 });
    expect(result).toEqual([]);
  });

  it('lists item responses by visit id ordered by scale instance and item order', async () => {
    const visitId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(createExecQuery([]));
    itemResponseModel.find.mockReturnValue({ sort });

    const result = await service.listItemResponsesByVisitId(visitId);

    expect(itemResponseModel.find).toHaveBeenCalledWith({
      assessmentVisitId: visitId,
    });
    expect(sort).toHaveBeenCalledWith({ scaleInstanceId: 1, itemOrder: 1 });
    expect(result).toEqual([]);
  });
});
