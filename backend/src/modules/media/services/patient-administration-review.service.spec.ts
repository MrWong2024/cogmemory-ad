import type { ScaleInstanceExecutionParamDto } from '../../assessments/dto/scale-instance-execution-param.dto';
import type { PatientAdministrationReviewFacts } from '../../assessments/services/patient-administration-session.service';
import * as structuredBindings from '../lib/patient-administration-review-structured-bindings';
import type { MediaEvidenceSummary } from './media-evidence.service';
import { PatientAdministrationReviewService } from './patient-administration-review.service';

const ids = {
  patientId: '64b000000000000000000001',
  visitId: '64b000000000000000000002',
  scaleInstanceId: '64b000000000000000000003',
  itemResponseId: '64b000000000000000000004',
  evidenceId: '64b000000000000000000005',
  sessionId: '64b000000000000000000006',
  definitionId: '64b000000000000000000007',
  versionId: '64b000000000000000000008',
};
const params: ScaleInstanceExecutionParamDto = {
  patientId: ids.patientId,
  visitId: ids.visitId,
  scaleInstanceId: ids.scaleInstanceId,
};
const now = new Date('2026-08-06T00:00:00.000Z');

function facts(): PatientAdministrationReviewFacts {
  return {
    sessionId: ids.sessionId,
    scaleInstanceId: ids.scaleInstanceId,
    scaleDefinitionId: ids.definitionId,
    scaleVersionId: ids.versionId,
    scaleCode: 'mmse',
    scaleVersion: '1.0',
    status: 'active',
    preparationConfirmedAt: now,
    impactFactorCodes: ['sensory'],
    impactFactorNote: 'safe note',
    startedAt: now,
    completedAt: null,
    terminatedAt: null,
    expiredAt: null,
    reviewEvents: [
      {
        action: 'paused',
        occurredAt: now,
        reason: 'break',
        operatorSnapshot: null,
      },
    ],
    stepCaptures: [
      {
        stepKey: 'speech-1',
        stepRun: 1,
        capturedBy: 'patient',
        capturedAt: now,
        invalidatedAt: new Date(now.getTime() + 1000),
        invalidatedReason: 'redo',
        operatorSnapshot: null,
      },
      {
        stepKey: 'speech-1',
        stepRun: 2,
        capturedBy: 'staff',
        staffObservation: 'manual observation',
        capturedAt: new Date(now.getTime() + 2000),
        invalidatedAt: null,
        operatorSnapshot: {
          operatorId: null,
          operatorName: 'Doctor',
          operatorRole: 'doctor',
        },
      },
    ],
    stepEvidenceRefs: [
      {
        stepKey: 'speech-1',
        stepRun: 1,
        evidenceType: 'audio',
        mediaEvidenceId: ids.evidenceId,
        uploadedAt: now,
      },
    ],
  };
}

function evidence(): MediaEvidenceSummary {
  return {
    id: ids.evidenceId,
    patientId: ids.patientId,
    assessmentVisitId: ids.visitId,
    scaleInstanceId: ids.scaleInstanceId,
    itemResponseId: ids.itemResponseId,
    evidenceType: 'audio',
    captureMode: 'browser_audio_recording',
    status: 'attached',
    storageStatus: 'stored',
    patientAdministrationContext: {
      sessionId: ids.sessionId,
      stepKey: 'speech-1',
      stepRun: 1,
    },
    audioMetadata: { durationMs: 1234 },
    transcription: {
      status: 'not_requested',
      requestedAt: null,
      completedAt: null,
      requestedBy: null,
    },
  } as MediaEvidenceSummary;
}

function createSubject() {
  const sessions = {
    getLatestReviewFacts: jest.fn().mockResolvedValue(facts()),
  };
  const assessments = {
    listItemResponsesByScaleInstanceId: jest.fn().mockResolvedValue([
      {
        id: ids.itemResponseId,
        patientId: ids.patientId,
        assessmentVisitId: ids.visitId,
        scaleInstanceId: ids.scaleInstanceId,
        scaleDefinitionId: ids.definitionId,
        scaleVersionId: ids.versionId,
        scaleCode: 'mmse',
        scaleVersion: '1.0',
        itemCode: 'orientation',
        itemTitle: '定向力',
        status: 'in_progress',
        draftRevision: 3,
      },
    ]),
  };
  const scales = {
    findVersionByScaleCodeAndVersion: jest.fn().mockResolvedValue({
      id: ids.versionId,
      scaleDefinitionId: ids.definitionId,
      items: [{ code: 'orientation', title: '定向力' }],
      patientAdministrationSteps: [
        {
          stepKey: 'speech-1',
          order: 1,
          itemCode: 'orientation',
          patientText: 'must not leak',
          assetKeys: ['must-not-leak'],
          responseMode: 'speech',
          advanceBy: 'patient',
        },
        {
          stepKey: 'observe-2',
          order: 2,
          itemCode: 'orientation',
          patientText: 'must not leak',
          assetKeys: [],
          responseMode: 'staff_observation',
          advanceBy: 'staff',
        },
      ],
    }),
  };
  const media = {
    listMediaEvidenceByIds: jest.fn().mockResolvedValue([evidence()]),
  };
  return {
    service: new PatientAdministrationReviewService(
      sessions as never,
      assessments as never,
      scales as never,
      media as never,
    ),
    sessions,
    assessments,
    scales,
    media,
  };
}

type MappingStep = {
  stepKey: string;
  order: number;
};

function structuredScoringRule(fieldCodes: readonly string[]) {
  return {
    mode: 'structured_manual',
    subItems: fieldCodes.map((code) => ({
      code,
      title: code,
      maxScore: 1,
    })),
  };
}

function createMappingSubject(
  steps: readonly MappingStep[],
  fieldCodes: readonly string[] | null,
) {
  const reviewFacts = facts();
  reviewFacts.stepCaptures = [];
  reviewFacts.stepEvidenceRefs = [];
  const itemCode = 'mapped-item';
  const sessions = {
    getLatestReviewFacts: jest.fn().mockResolvedValue(reviewFacts),
  };
  const assessments = {
    listItemResponsesByScaleInstanceId: jest.fn().mockResolvedValue([
      {
        id: ids.itemResponseId,
        patientId: ids.patientId,
        assessmentVisitId: ids.visitId,
        scaleInstanceId: ids.scaleInstanceId,
        scaleDefinitionId: ids.definitionId,
        scaleVersionId: ids.versionId,
        scaleCode: 'mmse',
        scaleVersion: '1.0',
        itemCode,
        itemTitle: '映射测试题',
        status: 'in_progress',
        draftRevision: 0,
      },
    ]),
  };
  const scales = {
    findVersionByScaleCodeAndVersion: jest.fn().mockResolvedValue({
      id: ids.versionId,
      scaleDefinitionId: ids.definitionId,
      items: [
        {
          code: itemCode,
          title: '映射测试题',
          scoringRule:
            fieldCodes === null
              ? { mode: 'manual' }
              : structuredScoringRule(fieldCodes),
        },
      ],
      patientAdministrationSteps: steps.map((step) => ({
        ...step,
        itemCode,
        patientText: 'must not leak',
        assetKeys: [],
        responseMode: 'speech',
        advanceBy: 'patient',
      })),
    }),
  };
  const media = {
    listMediaEvidenceByIds: jest.fn().mockResolvedValue([]),
  };

  return {
    service: new PatientAdministrationReviewService(
      sessions as never,
      assessments as never,
      scales as never,
      media as never,
    ),
  };
}

describe('PatientAdministrationReviewService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds an ordered safe projection with invalidated and takeover runs', async () => {
    const subject = createSubject();
    const result = await subject.service.getReview(params);
    expect(result.session).toEqual({
      status: 'active',
      preparationConfirmedAt: now,
      impactFactorCodes: ['sensory'],
      impactFactorNote: 'safe note',
      startedAt: now,
      completedAt: null,
      terminatedAt: null,
      expiredAt: null,
    });
    expect(result.reviewEvents).toEqual([
      {
        action: 'paused',
        occurredAt: now,
        reason: 'break',
        operatorSnapshot: null,
      },
    ]);
    expect(result.items[0]).toMatchObject({
      itemResponseId: ids.itemResponseId,
      itemCode: 'orientation',
      itemTitle: '定向力',
      status: 'in_progress',
      draftRevision: 3,
    });
    expect(result.items[0].steps[0]).toMatchObject({
      stepKey: 'speech-1',
      order: 1,
      responseMode: 'speech',
      advanceBy: 'patient',
      structuredFieldCodes: [],
    });
    expect(result.items[0].steps[0].runs).toHaveLength(2);
    expect(result.items[0].steps[0].runs[0]).toMatchObject({
      stepRun: 1,
      capture: { invalidatedReason: 'redo' },
      evidence: [
        {
          mediaEvidenceId: ids.evidenceId,
          captureMode: 'browser_audio_recording',
          audioMetadata: { durationMs: 1234 },
          transcription: { status: 'not_requested' },
        },
      ],
    });
    expect(result.items[0].steps[0].runs[1]).toMatchObject({
      stepRun: 2,
      capture: {
        capturedBy: 'staff',
        staffObservation: 'manual observation',
      },
      evidence: [],
    });
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    expect(JSON.stringify(result)).not.toContain('objectKey');
    expect(JSON.stringify(result)).not.toContain(ids.sessionId);
  });

  it('retains an evidence-only run', async () => {
    const subject = createSubject();
    const reviewFacts = facts();
    reviewFacts.stepCaptures = [];
    subject.sessions.getLatestReviewFacts.mockResolvedValue(reviewFacts);
    const result = await subject.service.getReview(params);
    expect(result.items[0].steps[0].runs).toEqual([
      expect.objectContaining({ stepRun: 1, capture: null }),
    ]);
  });

  it.each([
    { patientId: '64b000000000000000000099' },
    { assessmentVisitId: '64b000000000000000000099' },
    { scaleInstanceId: '64b000000000000000000099' },
    {
      patientAdministrationContext: {
        sessionId: ids.sessionId,
        stepKey: 'wrong-step',
        stepRun: 1,
      },
    },
  ] as Partial<MediaEvidenceSummary>[])(
    'rejects mismatched evidence association %#',
    async (override) => {
      const subject = createSubject();
      subject.media.listMediaEvidenceByIds.mockResolvedValue([
        { ...evidence(), ...override },
      ]);
      await expect(subject.service.getReview(params)).rejects.toMatchObject({
        response: { code: 'PATIENT_ADMINISTRATION_STEP_INVALID' },
      });
    },
  );

  it('rejects a missing referenced evidence instead of hiding it', async () => {
    const subject = createSubject();
    subject.media.listMediaEvidenceByIds.mockResolvedValue([]);
    await expect(subject.service.getReview(params)).rejects.toMatchObject({
      response: { code: 'PATIENT_ADMINISTRATION_STEP_INVALID' },
    });
  });

  it('returns one exact structured field for each time-orientation step', async () => {
    const steps = [
      { stepKey: 'mmse-orientation-year', order: 1 },
      { stepKey: 'mmse-orientation-season', order: 2 },
      { stepKey: 'mmse-orientation-month', order: 3 },
      { stepKey: 'mmse-orientation-date', order: 4 },
      { stepKey: 'mmse-orientation-weekday', order: 5 },
    ];
    const fieldCodes = [
      'mmse.orientation.year',
      'mmse.orientation.season',
      'mmse.orientation.month',
      'mmse.orientation.date',
      'mmse.orientation.weekday',
    ];
    const subject = createMappingSubject(steps, fieldCodes);

    const result = await subject.service.getReview(params);

    expect(
      result.items[0].steps.map((step) => step.structuredFieldCodes),
    ).toEqual(fieldCodes.map((code) => [code]));
  });

  it('returns all three immediate-recall fields on the single shared step', async () => {
    const fieldCodes = [
      'mmse.memory.immediate_recall.ball',
      'mmse.memory.immediate_recall.flag',
      'mmse.memory.immediate_recall.tree',
    ];
    const subject = createMappingSubject(
      [{ stepKey: 'mmse-immediate-recall', order: 1 }],
      fieldCodes,
    );

    const result = await subject.service.getReview(params);

    expect(result.items[0].steps[0].structuredFieldCodes).toEqual(fieldCodes);
  });

  it('returns an empty placement for a non-structured repetition step', async () => {
    const subject = createMappingSubject(
      [{ stepKey: 'mmse-repetition', order: 1 }],
      null,
    );

    const result = await subject.service.getReview(params);

    expect(result.items[0].steps[0].structuredFieldCodes).toEqual([]);
  });

  it('fails the whole item placement safe when a mapped code is absent from the stored rule', async () => {
    const subject = createMappingSubject(
      [{ stepKey: 'mmse-orientation-year', order: 1 }],
      ['mmse.orientation.unexpected'],
    );

    const result = await subject.service.getReview(params);

    expect(result.items[0].steps[0].structuredFieldCodes).toEqual([]);
  });

  it('fails the whole item placement safe when explicit coverage is incomplete', async () => {
    const subject = createMappingSubject(
      [
        { stepKey: 'mmse-orientation-year', order: 1 },
        { stepKey: 'mmse-orientation-season', order: 2 },
        { stepKey: 'mmse-orientation-month', order: 3 },
        { stepKey: 'mmse-orientation-date', order: 4 },
      ],
      [
        'mmse.orientation.year',
        'mmse.orientation.season',
        'mmse.orientation.month',
        'mmse.orientation.date',
        'mmse.orientation.weekday',
      ],
    );

    const result = await subject.service.getReview(params);

    expect(
      result.items[0].steps.map((step) => step.structuredFieldCodes),
    ).toEqual([[], [], [], []]);
  });

  it('fails the whole item placement safe when two steps bind the same field', async () => {
    const originalResolver =
      structuredBindings.resolvePatientAdministrationReviewStructuredFieldCodes;
    jest
      .spyOn(
        structuredBindings,
        'resolvePatientAdministrationReviewStructuredFieldCodes',
      )
      .mockImplementation((scaleCode, scaleVersion, stepKey) =>
        stepKey === 'mmse-orientation-season'
          ? ['mmse.orientation.year']
          : originalResolver(scaleCode, scaleVersion, stepKey),
      );
    const subject = createMappingSubject(
      [
        { stepKey: 'mmse-orientation-year', order: 1 },
        { stepKey: 'mmse-orientation-season', order: 2 },
      ],
      ['mmse.orientation.year', 'mmse.orientation.season'],
    );

    const result = await subject.service.getReview(params);

    expect(
      result.items[0].steps.map((step) => step.structuredFieldCodes),
    ).toEqual([[], []]);
  });
});
