import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import {
  PatientAdministrationSessionService,
  type PatientAdministrationSessionHistoryDeletionPlan,
} from '../../assessments/services/patient-administration-session.service';
import { MediaEvidenceService } from '../../media/services/media-evidence.service';
import { ReportsService } from '../../reports/services/reports.service';
import { STORAGE_SERVICE } from '../../storage/storage.constants';
import type { StorageService } from '../../storage/storage.interface';
import { PatientAdministrationHistoryService } from './patient-administration-history.service';

function readExceptionCode(error: HttpException): string | undefined {
  const response = error.getResponse();
  if (typeof response !== 'object' || response === null) {
    return undefined;
  }
  const code = (response as Record<string, unknown>).code;
  return typeof code === 'string' ? code : undefined;
}

async function expectHttpException(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected an HttpException');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    if (!(error instanceof HttpException)) {
      throw error;
    }
    expect(error.getStatus()).toBe(status);
    expect(readExceptionCode(error)).toBe(code);
  }
}

describe('PatientAdministrationHistoryService', () => {
  const patientId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const assessmentVisitId = new Types.ObjectId('507f1f77bcf86cd799439012');
  const scaleInstanceId = new Types.ObjectId('507f1f77bcf86cd799439013');
  const sessionId = new Types.ObjectId('507f1f77bcf86cd799439014');
  const firstEvidenceId = '507f1f77bcf86cd799439015';
  const secondEvidenceId = '507f1f77bcf86cd799439016';
  let service: PatientAdministrationHistoryService;
  let sessionService: {
    listSessionHistory: jest.Mock;
    prepareHistorySessionDeletion: jest.Mock;
    deleteHistorySession: jest.Mock;
  };
  let mediaEvidenceService: {
    listPatientAdministrationSessionDeletionTargets: jest.Mock;
    deletePatientAdministrationSessionEvidence: jest.Mock;
  };
  let assessmentsService: {
    hasItemResponseEvidenceReferences: jest.Mock;
    deleteItemResponsesForScaleInstance: jest.Mock;
    deleteScaleInstance: jest.Mock;
  };
  let reportsService: { hasMediaEvidenceReferences: jest.Mock };
  let storageService: StorageService & { deleteObject: jest.Mock };

  function deletionPlan(
    status: 'terminated' | 'expired' = 'terminated',
    stepEvidenceIds: string[] = [firstEvidenceId, secondEvidenceId],
  ): PatientAdministrationSessionHistoryDeletionPlan {
    return {
      patientId,
      assessmentVisitId,
      scaleInstanceId,
      sessionId,
      status,
      stepEvidenceIds,
    };
  }

  function mediaTargets() {
    return [
      {
        id: firstEvidenceId,
        status: 'attached' as const,
        lockedAt: null,
        transcriptionStatus: 'succeeded' as const,
        objectKeys: ['history/shared-object', 'history/first-object'],
      },
      {
        id: secondEvidenceId,
        status: 'voided' as const,
        lockedAt: null,
        transcriptionStatus: null,
        objectKeys: ['history/shared-object', 'history/second-object'],
      },
    ];
  }

  beforeEach(async () => {
    sessionService = {
      listSessionHistory: jest.fn().mockResolvedValue([]),
      prepareHistorySessionDeletion: jest
        .fn()
        .mockResolvedValue(deletionPlan()),
      deleteHistorySession: jest.fn().mockResolvedValue(undefined),
    };
    mediaEvidenceService = {
      listPatientAdministrationSessionDeletionTargets: jest
        .fn()
        .mockResolvedValue(mediaTargets()),
      deletePatientAdministrationSessionEvidence: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    assessmentsService = {
      hasItemResponseEvidenceReferences: jest.fn().mockResolvedValue(false),
      deleteItemResponsesForScaleInstance: jest.fn(),
      deleteScaleInstance: jest.fn(),
    };
    reportsService = {
      hasMediaEvidenceReferences: jest.fn().mockResolvedValue(false),
    };
    storageService = {
      driver: 'fake',
      uploadFile: jest.fn(),
      getSignedUrl: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PatientAdministrationHistoryService,
        {
          provide: PatientAdministrationSessionService,
          useValue: sessionService,
        },
        { provide: MediaEvidenceService, useValue: mediaEvidenceService },
        { provide: AssessmentsService, useValue: assessmentsService },
        { provide: ReportsService, useValue: reportsService },
        { provide: STORAGE_SERVICE, useValue: storageService },
      ],
    }).compile();
    service = moduleRef.get(PatientAdministrationHistoryService);
  });

  it('delegates history reads to the session owner', async () => {
    await expect(
      service.listSessions(
        patientId.toString(),
        assessmentVisitId.toString(),
        scaleInstanceId.toString(),
      ),
    ).resolves.toEqual([]);
    expect(sessionService.listSessionHistory).toHaveBeenCalledWith(
      patientId.toString(),
      assessmentVisitId.toString(),
      scaleInstanceId.toString(),
    );
  });

  it.each(['terminated', 'expired'] as const)(
    'deletes an eligible %s session in Storage, Evidence, Session order with deduplicated explicit keys',
    async (status) => {
      const order: string[] = [];
      sessionService.prepareHistorySessionDeletion.mockResolvedValue(
        deletionPlan(status),
      );
      storageService.deleteObject.mockImplementation((objectKey: string) => {
        order.push(`storage:${objectKey}`);
        return Promise.resolve();
      });
      mediaEvidenceService.deletePatientAdministrationSessionEvidence.mockImplementation(
        () => {
          order.push('media');
          return Promise.resolve();
        },
      );
      sessionService.deleteHistorySession.mockImplementation(() => {
        order.push('session');
        return Promise.resolve();
      });

      await service.deleteSession(
        patientId.toString(),
        assessmentVisitId.toString(),
        scaleInstanceId.toString(),
        sessionId.toString(),
      );

      expect(
        mediaEvidenceService.listPatientAdministrationSessionDeletionTargets,
      ).toHaveBeenCalledWith(
        patientId,
        assessmentVisitId,
        scaleInstanceId,
        sessionId,
      );
      expect(order).toEqual([
        'storage:history/shared-object',
        'storage:history/first-object',
        'storage:history/second-object',
        'media',
        'session',
      ]);
      expect(
        mediaEvidenceService.deletePatientAdministrationSessionEvidence,
      ).toHaveBeenCalledWith(
        patientId,
        assessmentVisitId,
        scaleInstanceId,
        sessionId,
        [firstEvidenceId, secondEvidenceId],
      );
      expect(
        assessmentsService.deleteItemResponsesForScaleInstance,
      ).not.toHaveBeenCalled();
      expect(assessmentsService.deleteScaleInstance).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['adopted', 'itemResponse'],
    ['report-referenced', 'report'],
  ] as const)(
    'fails closed for %s evidence',
    async (_label, referenceOwner) => {
      if (referenceOwner === 'itemResponse') {
        assessmentsService.hasItemResponseEvidenceReferences.mockResolvedValue(
          true,
        );
      } else {
        reportsService.hasMediaEvidenceReferences.mockResolvedValue(true);
      }

      await expectHttpException(
        service.deleteSession(
          patientId.toString(),
          assessmentVisitId.toString(),
          scaleInstanceId.toString(),
          sessionId.toString(),
        ),
        409,
        'PATIENT_ADMINISTRATION_SESSION_NOT_DELETABLE',
      );
      expect(storageService.deleteObject).not.toHaveBeenCalled();
      expect(
        mediaEvidenceService.deletePatientAdministrationSessionEvidence,
      ).not.toHaveBeenCalled();
      expect(sessionService.deleteHistorySession).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['locked status', { status: 'locked', lockedAt: null }],
    ['lockedAt', { status: 'attached', lockedAt: new Date() }],
    [
      'processing transcription',
      { status: 'attached', lockedAt: null, transcriptionStatus: 'processing' },
    ],
  ] as const)('fails closed for evidence with %s', async (_label, override) => {
    mediaEvidenceService.listPatientAdministrationSessionDeletionTargets.mockResolvedValue(
      [
        {
          ...mediaTargets()[0],
          ...override,
        },
        mediaTargets()[1],
      ],
    );

    await expectHttpException(
      service.deleteSession(
        patientId.toString(),
        assessmentVisitId.toString(),
        scaleInstanceId.toString(),
        sessionId.toString(),
      ),
      409,
      'PATIENT_ADMINISTRATION_SESSION_NOT_DELETABLE',
    );
    expect(
      assessmentsService.hasItemResponseEvidenceReferences,
    ).not.toHaveBeenCalled();
    expect(storageService.deleteObject).not.toHaveBeenCalled();
  });

  it('fails closed when a session evidence reference is outside the exact provenance result', async () => {
    mediaEvidenceService.listPatientAdministrationSessionDeletionTargets.mockResolvedValue(
      [mediaTargets()[0]],
    );

    await expectHttpException(
      service.deleteSession(
        patientId.toString(),
        assessmentVisitId.toString(),
        scaleInstanceId.toString(),
        sessionId.toString(),
      ),
      409,
      'PATIENT_ADMINISTRATION_SESSION_NOT_DELETABLE',
    );
    expect(storageService.deleteObject).not.toHaveBeenCalled();
  });

  it('returns storage unavailable and does not continue with database deletion', async () => {
    storageService.deleteObject.mockRejectedValueOnce(
      new Error('storage unavailable'),
    );

    await expectHttpException(
      service.deleteSession(
        patientId.toString(),
        assessmentVisitId.toString(),
        scaleInstanceId.toString(),
        sessionId.toString(),
      ),
      503,
      'MEDIA_STORAGE_UNAVAILABLE',
    );
    expect(
      mediaEvidenceService.deletePatientAdministrationSessionEvidence,
    ).not.toHaveBeenCalled();
    expect(sessionService.deleteHistorySession).not.toHaveBeenCalled();
  });

  it('returns the stable 500 code when database deletion fails and keeps Session last', async () => {
    mediaEvidenceService.deletePatientAdministrationSessionEvidence.mockRejectedValueOnce(
      new Error('database failure'),
    );

    await expectHttpException(
      service.deleteSession(
        patientId.toString(),
        assessmentVisitId.toString(),
        scaleInstanceId.toString(),
        sessionId.toString(),
      ),
      500,
      'PATIENT_ADMINISTRATION_SESSION_DELETE_FAILED',
    );
    expect(sessionService.deleteHistorySession).not.toHaveBeenCalled();
  });
});
