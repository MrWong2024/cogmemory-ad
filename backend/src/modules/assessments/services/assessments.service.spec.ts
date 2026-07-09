// backend/src/modules/assessments/services/assessments.service.spec.ts
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import {
  AssessmentVisit,
  AssessmentVisitSchema,
} from '../schemas/assessment-visit.schema';
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

  beforeEach(async () => {
    assessmentVisitModel = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    scaleInstanceModel = {
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
});
