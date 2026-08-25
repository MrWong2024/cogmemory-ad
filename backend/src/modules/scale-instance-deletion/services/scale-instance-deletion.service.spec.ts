import { HttpException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import { CognitiveDomainsService } from '../../cognitive-domains/services/cognitive-domains.service';
import { MediaEvidenceService } from '../../media/services/media-evidence.service';
import { ReportsService } from '../../reports/services/reports.service';
import { ScoringService } from '../../scoring/services/scoring.service';
import { STORAGE_SERVICE } from '../../storage/storage.constants';
import { ScaleInstanceDeletionService } from './scale-instance-deletion.service';

async function expectHttpExceptionCode(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(HttpException);
  if (!(error instanceof HttpException)) {
    throw error;
  }
  expect(error.getStatus()).toBe(status);
  expect(error.getResponse()).toEqual(expect.objectContaining({ code }));
}

describe('ScaleInstanceDeletionService', () => {
  const plan = {
    patientId: new Types.ObjectId(),
    assessmentVisitId: new Types.ObjectId(),
    scaleInstanceId: new Types.ObjectId(),
    patientAdministrationSessionIds: [new Types.ObjectId()],
    itemResponseCount: 11,
  };
  let service: ScaleInstanceDeletionService;
  let assessmentsService: {
    prepareScaleInstanceDeletion: jest.Mock;
    deletePatientAdministrationSessionsForScaleInstance: jest.Mock;
    deleteItemResponsesForScaleInstance: jest.Mock;
    deleteScaleInstance: jest.Mock;
  };
  let mediaEvidenceService: {
    listScaleInstanceDeletionTargets: jest.Mock;
    deleteScaleInstanceEvidence: jest.Mock;
  };
  let scoringService: { findLatestScoreResultByScaleInstanceId: jest.Mock };
  let cognitiveDomainsService: {
    findLatestDomainResultByScaleInstanceId: jest.Mock;
  };
  let reportsService: { listReportsByVisitId: jest.Mock };
  let storageService: { driver: 'fake'; deleteObject: jest.Mock };

  beforeEach(async () => {
    assessmentsService = {
      prepareScaleInstanceDeletion: jest.fn().mockResolvedValue(plan),
      deletePatientAdministrationSessionsForScaleInstance: jest
        .fn()
        .mockResolvedValue(undefined),
      deleteItemResponsesForScaleInstance: jest
        .fn()
        .mockResolvedValue(undefined),
      deleteScaleInstance: jest.fn().mockResolvedValue(undefined),
    };
    mediaEvidenceService = {
      listScaleInstanceDeletionTargets: jest.fn().mockResolvedValue([]),
      deleteScaleInstanceEvidence: jest.fn().mockResolvedValue(undefined),
    };
    scoringService = {
      findLatestScoreResultByScaleInstanceId: jest.fn().mockResolvedValue(null),
    };
    cognitiveDomainsService = {
      findLatestDomainResultByScaleInstanceId: jest
        .fn()
        .mockResolvedValue(null),
    };
    reportsService = {
      listReportsByVisitId: jest.fn().mockResolvedValue([]),
    };
    storageService = {
      driver: 'fake',
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ScaleInstanceDeletionService,
        { provide: AssessmentsService, useValue: assessmentsService },
        { provide: MediaEvidenceService, useValue: mediaEvidenceService },
        { provide: ScoringService, useValue: scoringService },
        {
          provide: CognitiveDomainsService,
          useValue: cognitiveDomainsService,
        },
        { provide: ReportsService, useValue: reportsService },
        { provide: STORAGE_SERVICE, useValue: storageService },
      ],
    }).compile();
    service = moduleRef.get(ScaleInstanceDeletionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deduplicates explicit object keys and deletes ScaleInstance last', async () => {
    const order: string[] = [];
    mediaEvidenceService.listScaleInstanceDeletionTargets.mockResolvedValue([
      {
        id: new Types.ObjectId().toString(),
        status: 'attached',
        lockedAt: null,
        transcriptionStatus: 'succeeded',
        objectKeys: ['owned/main', 'owned/trajectory'],
      },
      {
        id: new Types.ObjectId().toString(),
        status: 'voided',
        lockedAt: null,
        transcriptionStatus: null,
        objectKeys: ['owned/trajectory'],
      },
    ]);
    storageService.deleteObject.mockImplementation((objectKey: string) => {
      order.push(`storage:${objectKey}`);
      return Promise.resolve();
    });
    mediaEvidenceService.deleteScaleInstanceEvidence.mockImplementation(() => {
      order.push('media');
      return Promise.resolve();
    });
    assessmentsService.deletePatientAdministrationSessionsForScaleInstance.mockImplementation(
      () => {
        order.push('sessions');
        return Promise.resolve();
      },
    );
    assessmentsService.deleteItemResponsesForScaleInstance.mockImplementation(
      () => {
        order.push('items');
        return Promise.resolve();
      },
    );
    assessmentsService.deleteScaleInstance.mockImplementation(() => {
      order.push('scale-instance');
      return Promise.resolve();
    });

    await service.deleteScaleInstance(
      plan.patientId.toString(),
      plan.assessmentVisitId.toString(),
      plan.scaleInstanceId.toString(),
    );

    expect(order).toEqual([
      'storage:owned/main',
      'storage:owned/trajectory',
      'media',
      'sessions',
      'items',
      'scale-instance',
    ]);
  });

  it('stops before every database delete when storage deletion fails', async () => {
    mediaEvidenceService.listScaleInstanceDeletionTargets.mockResolvedValue([
      {
        id: new Types.ObjectId().toString(),
        status: 'attached',
        lockedAt: null,
        transcriptionStatus: null,
        objectKeys: ['owned/main'],
      },
    ]);
    storageService.deleteObject.mockRejectedValue(
      new Error('provider failure'),
    );

    await expectHttpExceptionCode(
      service.deleteScaleInstance(
        plan.patientId.toString(),
        plan.assessmentVisitId.toString(),
        plan.scaleInstanceId.toString(),
      ),
      503,
      'MEDIA_STORAGE_UNAVAILABLE',
    );
    expect(
      mediaEvidenceService.deleteScaleInstanceEvidence,
    ).not.toHaveBeenCalled();
    expect(
      assessmentsService.deletePatientAdministrationSessionsForScaleInstance,
    ).not.toHaveBeenCalled();
    expect(
      assessmentsService.deleteItemResponsesForScaleInstance,
    ).not.toHaveBeenCalled();
    expect(assessmentsService.deleteScaleInstance).not.toHaveBeenCalled();
  });

  it.each([
    ['locked evidence', 'locked', null, null],
    ['locked timestamp', 'attached', new Date(), null],
    ['processing transcription', 'attached', null, 'processing'],
  ])(
    'rejects %s before storage deletion',
    async (_name, status, lockedAt, transcriptionStatus) => {
      mediaEvidenceService.listScaleInstanceDeletionTargets.mockResolvedValue([
        {
          id: new Types.ObjectId().toString(),
          status,
          lockedAt,
          transcriptionStatus,
          objectKeys: ['owned/main'],
        },
      ]);

      await expectHttpExceptionCode(
        service.deleteScaleInstance(
          plan.patientId.toString(),
          plan.assessmentVisitId.toString(),
          plan.scaleInstanceId.toString(),
        ),
        409,
        'SCALE_INSTANCE_NOT_DELETABLE',
      );
      expect(storageService.deleteObject).not.toHaveBeenCalled();
    },
  );

  it.each(['score', 'domain', 'report'])(
    'rejects an existing %s fact',
    async (fact) => {
      if (fact === 'score') {
        scoringService.findLatestScoreResultByScaleInstanceId.mockResolvedValue(
          {
            id: new Types.ObjectId().toString(),
          },
        );
      } else if (fact === 'domain') {
        cognitiveDomainsService.findLatestDomainResultByScaleInstanceId.mockResolvedValue(
          { id: new Types.ObjectId().toString() },
        );
      } else {
        reportsService.listReportsByVisitId.mockResolvedValue([
          {
            primaryScaleInstanceIds: [plan.scaleInstanceId.toString()],
            scaleTraces: [],
          },
        ]);
      }

      await expectHttpExceptionCode(
        service.deleteScaleInstance(
          plan.patientId.toString(),
          plan.assessmentVisitId.toString(),
          plan.scaleInstanceId.toString(),
        ),
        409,
        'SCALE_INSTANCE_NOT_DELETABLE',
      );
    },
  );

  it('maps an unexpected database delete failure to the stable 500 code', async () => {
    mediaEvidenceService.deleteScaleInstanceEvidence.mockRejectedValue(
      new Error('database failure'),
    );

    await expectHttpExceptionCode(
      service.deleteScaleInstance(
        plan.patientId.toString(),
        plan.assessmentVisitId.toString(),
        plan.scaleInstanceId.toString(),
      ),
      500,
      'SCALE_INSTANCE_DELETE_FAILED',
    );
    expect(
      assessmentsService.deletePatientAdministrationSessionsForScaleInstance,
    ).not.toHaveBeenCalled();
  });

  it('preserves ownership not-found semantics from Assessments', async () => {
    assessmentsService.prepareScaleInstanceDeletion.mockRejectedValue(
      new NotFoundException({
        code: 'SCALE_INSTANCE_NOT_FOUND',
        message: 'Scale instance not found',
      }),
    );

    await expectHttpExceptionCode(
      service.deleteScaleInstance(
        plan.patientId.toString(),
        plan.assessmentVisitId.toString(),
        plan.scaleInstanceId.toString(),
      ),
      404,
      'SCALE_INSTANCE_NOT_FOUND',
    );
  });
});
