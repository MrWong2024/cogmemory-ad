import {
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import type { PatientAdministrationEvidenceType } from '../../assessments/patient-administration.constants';
import { PatientAdministrationSessionService } from '../../assessments/services/patient-administration-session.service';
import {
  AssessmentsService,
  type ItemResponseSummary,
} from '../../assessments/services/assessments.service';
import type {
  PatientAdministrationEvidenceUploadContext,
  PatientAdministrationRequestContext,
} from '../../assessments/types/patient-administration-response.types';
import { STORAGE_SERVICE } from '../../storage/storage.constants';
import { StorageConfigService } from '../../storage/storage-config.service';
import type {
  StorageService,
  UploadFileInput,
} from '../../storage/storage.interface';
import type { UploadedMemoryFile } from '../types/uploaded-memory-file.types';
import {
  MediaEvidenceService,
  type CreateMediaEvidenceInput,
  type MediaEvidenceSummary,
} from './media-evidence.service';
import { PatientAdministrationEvidenceService } from './patient-administration-evidence.service';

const ids = {
  sessionId: '507f1f77bcf86cd799439101',
  patientId: '507f1f77bcf86cd799439102',
  visitId: '507f1f77bcf86cd799439103',
  scaleInstanceId: '507f1f77bcf86cd799439104',
  itemResponseId: '507f1f77bcf86cd799439105',
  definitionId: '507f1f77bcf86cd799439106',
  versionId: '507f1f77bcf86cd799439107',
  mediaEvidenceId: '507f1f77bcf86cd799439108',
};

function memoryFile(
  buffer: Buffer,
  mimetype: string,
  originalname = 'patient-name-must-not-leak.bin',
): UploadedMemoryFile {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
  };
}

function webmFile(): UploadedMemoryFile {
  return memoryFile(
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]),
    'audio/webm;codecs=opus',
  );
}

function pngFile(): UploadedMemoryFile {
  return memoryFile(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
    'image/png',
  );
}

function itemResponse(
  overrides: Partial<ItemResponseSummary> = {},
): ItemResponseSummary {
  return {
    id: ids.itemResponseId,
    assessmentVisitId: ids.visitId,
    scaleInstanceId: ids.scaleInstanceId,
    patientId: ids.patientId,
    subjectCode: 'SUBJECT-C1-UNIT-001',
    scaleDefinitionId: ids.definitionId,
    scaleVersionId: ids.versionId,
    scaleCode: 'mmse',
    scaleVersion: '1.0',
    instanceCode: 'MMSE-C1-UNIT-001',
    itemCode: 'mmse.item-1',
    crfCode: 'MMSE.1',
    groupCode: 'orientation',
    itemTitle: 'Unit speech item',
    itemOrder: 1,
    responseType: 'text',
    countsTowardTotal: true,
    cognitiveDomainCodes: ['orientation'],
    itemConfigSnapshot: null,
    versionTrace: {
      scaleVersion: '1.0',
      crfVersion: 'crf-1',
      scoringRuleVersion: 'score-1',
      fieldEncodingVersion: 'field-1',
      sourceDocument: 'source.pdf',
    },
    status: 'not_started',
    answerSource: 'supervised_patient_input',
    rawResponse: null,
    structuredResponse: null,
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
    submissionWriteBarrier: null,
    ...overrides,
  };
}

function evidenceSummary(): MediaEvidenceSummary {
  return { id: ids.mediaEvidenceId } as MediaEvidenceSummary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMockCallArgument(
  mock: jest.Mock,
  argumentIndex: number,
  callIndex = 0,
): unknown {
  const calls: unknown = mock.mock.calls;
  if (!Array.isArray(calls) || !Array.isArray(calls[callIndex])) {
    throw new Error(`Expected mock call ${callIndex + 1}`);
  }
  return calls[callIndex][argumentIndex] as unknown;
}

function readExceptionCode(error: HttpException): string | undefined {
  const response: unknown = error.getResponse();
  if (!isRecord(response)) {
    return undefined;
  }
  const code = response.code;
  return typeof code === 'string' ? code : undefined;
}

async function expectCode(
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

describe('PatientAdministrationEvidenceService', () => {
  const requestContext: PatientAdministrationRequestContext = {
    sessionId: ids.sessionId,
    sessionTokenHash: 'patient-session-token-hash',
    revision: 3,
  };
  let service: PatientAdministrationEvidenceService;
  let sessionService: {
    prepareCurrentEvidenceUpload: jest.Mock;
    attachCurrentStepEvidence: jest.Mock;
  };
  let assessmentsService: {
    findItemResponseByScaleInstanceAndItemCode: jest.Mock;
  };
  let mediaEvidenceService: {
    createEvidence: jest.Mock;
    deleteEvidenceForCompensation: jest.Mock;
  };
  let storageService: StorageService & {
    uploadFile: jest.Mock;
    deleteObject: jest.Mock;
  };
  let storageConfigService: { getObjectPrefix: jest.Mock };

  function uploadContext(
    responseMode: PatientAdministrationEvidenceUploadContext['responseMode'] = 'speech',
  ): PatientAdministrationEvidenceUploadContext {
    return {
      sessionId: ids.sessionId,
      sessionTokenHash: requestContext.sessionTokenHash,
      scaleInstanceId: ids.scaleInstanceId,
      patientId: ids.patientId,
      assessmentVisitId: ids.visitId,
      subjectCode: 'SUBJECT-C1-UNIT-001',
      scaleDefinitionId: ids.definitionId,
      scaleVersionId: ids.versionId,
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      instanceCode: 'MMSE-C1-UNIT-001',
      currentStepKey: 'step-one',
      stepRun: 1,
      itemCode: 'mmse.item-1',
      responseMode,
      expectedRevision: 3,
    };
  }

  beforeEach(async () => {
    sessionService = {
      prepareCurrentEvidenceUpload: jest
        .fn()
        .mockResolvedValue(uploadContext()),
      attachCurrentStepEvidence: jest.fn().mockResolvedValue(4),
    };
    assessmentsService = {
      findItemResponseByScaleInstanceAndItemCode: jest
        .fn()
        .mockResolvedValue(itemResponse()),
    };
    mediaEvidenceService = {
      createEvidence: jest.fn().mockResolvedValue(evidenceSummary()),
      deleteEvidenceForCompensation: jest.fn().mockResolvedValue(true),
    };
    storageService = {
      driver: 'fake',
      uploadFile: jest.fn().mockImplementation((input: UploadFileInput) =>
        Promise.resolve({
          objectKey: input.objectKey,
          bucket: 'fake-storage',
          sizeBytes: input.sizeBytes,
          mimeType: input.mimeType,
        }),
      ),
      getSignedUrl: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    storageConfigService = {
      getObjectPrefix: jest.fn().mockReturnValue('cogmemory_ad'),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PatientAdministrationEvidenceService,
        {
          provide: PatientAdministrationSessionService,
          useValue: sessionService,
        },
        { provide: AssessmentsService, useValue: assessmentsService },
        { provide: MediaEvidenceService, useValue: mediaEvidenceService },
        { provide: STORAGE_SERVICE, useValue: storageService },
        { provide: StorageConfigService, useValue: storageConfigService },
      ],
    }).compile();
    service = moduleRef.get(PatientAdministrationEvidenceService);
  });

  it('uploads speech audio from authoritative context and returns only safe fields', async () => {
    const response = await service.uploadEvidence(
      requestContext,
      {
        expectedRevision: 3,
        evidenceType: 'audio',
        capturedAt: '2026-08-06T00:00:00.000Z',
        durationMs: 2400,
      },
      webmFile(),
    );

    expect(Object.keys(response).sort()).toEqual([
      'evidenceType',
      'mediaEvidenceId',
      'revision',
      'uploadedAt',
    ]);
    expect(response).toEqual(
      expect.objectContaining({
        mediaEvidenceId: ids.mediaEvidenceId,
        evidenceType: 'audio',
        revision: 4,
      }),
    );
    expect(response.uploadedAt).toBeInstanceOf(Date);
    expect(
      assessmentsService.findItemResponseByScaleInstanceAndItemCode,
    ).toHaveBeenCalledWith(ids.scaleInstanceId, 'mmse.item-1');
    const upload = readMockCallArgument(
      storageService.uploadFile,
      0,
    ) as UploadFileInput;
    expect(upload.objectKey).toMatch(
      new RegExp(
        `^cogmemory_ad/clinical-evidence/${ids.patientId}/${ids.visitId}/${ids.scaleInstanceId}/${ids.itemResponseId}/patient-administration/step-one/1/EVD-[A-F0-9]{32}\\.webm$`,
      ),
    );
    expect(upload.objectKey).not.toContain('patient-name');

    const createInput = readMockCallArgument(
      mediaEvidenceService.createEvidence,
      0,
    ) as CreateMediaEvidenceInput;
    expect(createInput.patientId.toString()).toBe(ids.patientId);
    expect(createInput.assessmentVisitId.toString()).toBe(ids.visitId);
    expect(createInput.scaleInstanceId.toString()).toBe(ids.scaleInstanceId);
    expect(createInput.itemResponseId.toString()).toBe(ids.itemResponseId);
    expect(createInput).toEqual(
      expect.objectContaining({
        subjectCode: 'SUBJECT-C1-UNIT-001',
        itemCode: 'mmse.item-1',
        evidenceType: 'audio',
        captureMode: 'browser_audio_recording',
        status: 'attached',
        storageStatus: 'stored',
        audioMetadata: { durationMs: 2400 },
        transcription: { status: 'not_requested' },
        imageMetadata: null,
        handwritingTrace: null,
        operatorSnapshot: null,
      }),
    );
    expect(createInput.patientAdministrationContext).toEqual({
      sessionId: new Types.ObjectId(ids.sessionId),
      stepKey: 'step-one',
      stepRun: 1,
    });
    expect(createInput.captureContext).toEqual({
      capturedAt: new Date('2026-08-06T00:00:00.000Z'),
      uploadedAt: createInput.captureContext.uploadedAt,
      sourceApp: 'patient_administration',
    });
    expect(createInput.captureContext.uploadedAt).toBeInstanceOf(Date);
    expect(createInput.storage.originalFilename).toBeUndefined();
    expect(sessionService.attachCurrentStepEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaEvidenceId: ids.mediaEvidenceId,
        evidenceType: 'audio',
      }),
    );
  });

  it.each([
    ['writing', 'handwriting', 'tablet_handwriting'],
    ['writing', 'photo', 'photo_upload'],
    ['drawing', 'handwriting', 'tablet_handwriting'],
    ['drawing', 'photo', 'photo_upload'],
  ] as const)(
    'maps %s %s to %s without audio metadata',
    async (responseMode, evidenceType, captureMode) => {
      sessionService.prepareCurrentEvidenceUpload.mockResolvedValue(
        uploadContext(responseMode),
      );

      await service.uploadEvidence(
        requestContext,
        { expectedRevision: 3, evidenceType },
        pngFile(),
      );

      const createInput = readMockCallArgument(
        mediaEvidenceService.createEvidence,
        0,
      ) as CreateMediaEvidenceInput;
      expect(createInput.captureMode).toBe(captureMode);
      expect(createInput.audioMetadata).toBeNull();
      expect(createInput.transcription).toBeUndefined();
      expect(createInput.storage.mimeType).toBe('image/png');
    },
  );

  it('propagates observation rejection and rejects invalid evidence before storage', async () => {
    sessionService.prepareCurrentEvidenceUpload.mockRejectedValueOnce(
      new ForbiddenException({
        code: 'PATIENT_ADMINISTRATION_EVIDENCE_NOT_ALLOWED',
        message: 'Evidence is not allowed for the current step',
      }),
    );
    await expectCode(
      service.uploadEvidence(
        requestContext,
        { expectedRevision: 3, evidenceType: 'audio' },
        webmFile(),
      ),
      403,
      'PATIENT_ADMINISTRATION_EVIDENCE_NOT_ALLOWED',
    );

    const invalid = {
      expectedRevision: 3,
      evidenceType: 'document_scan' as PatientAdministrationEvidenceType,
    };
    await expectCode(
      service.uploadEvidence(requestContext, invalid, pngFile()),
      403,
      'PATIENT_ADMINISTRATION_EVIDENCE_NOT_ALLOWED',
    );
    expect(storageService.uploadFile).not.toHaveBeenCalled();
  });

  it.each([
    ['ownership', { patientId: '507f1f77bcf86cd799439199' }],
    ['answer source', { answerSource: 'clinician_recorded' }],
    [
      'write barrier',
      {
        submissionWriteBarrier: {
          version: 1,
          barrierId: 'closed-for-submission',
          startedAt: new Date(),
        },
      },
    ],
  ])(
    'rejects invalid ItemResponse %s before storage',
    async (_label, override) => {
      assessmentsService.findItemResponseByScaleInstanceAndItemCode.mockResolvedValue(
        itemResponse(override as Partial<ItemResponseSummary>),
      );

      await expectCode(
        service.uploadEvidence(
          requestContext,
          { expectedRevision: 3, evidenceType: 'audio' },
          webmFile(),
        ),
        409,
        'PATIENT_ADMINISTRATION_STEP_INVALID',
      );
      expect(storageService.uploadFile).not.toHaveBeenCalled();
    },
  );

  it('rejects duration on non-audio evidence before storage', async () => {
    sessionService.prepareCurrentEvidenceUpload.mockResolvedValue(
      uploadContext('writing'),
    );
    await expectCode(
      service.uploadEvidence(
        requestContext,
        { expectedRevision: 3, evidenceType: 'photo', durationMs: 100 },
        pngFile(),
      ),
      403,
      'PATIENT_ADMINISTRATION_EVIDENCE_NOT_ALLOWED',
    );
    expect(storageService.uploadFile).not.toHaveBeenCalled();
  });

  it('maps storage failures without creating evidence', async () => {
    storageService.uploadFile.mockRejectedValue(new Error('fake unavailable'));

    await expectCode(
      service.uploadEvidence(
        requestContext,
        { expectedRevision: 3, evidenceType: 'audio' },
        webmFile(),
      ),
      503,
      'MEDIA_STORAGE_UNAVAILABLE',
    );
    expect(mediaEvidenceService.createEvidence).not.toHaveBeenCalled();
    expect(sessionService.attachCurrentStepEvidence).not.toHaveBeenCalled();
  });

  it('deletes the exact object when evidence creation fails', async () => {
    mediaEvidenceService.createEvidence.mockRejectedValue(
      new Error('fake database failure'),
    );

    await expectCode(
      service.uploadEvidence(
        requestContext,
        { expectedRevision: 3, evidenceType: 'audio' },
        webmFile(),
      ),
      500,
      'MEDIA_EVIDENCE_CREATE_FAILED',
    );
    const uploadedObjectKey = (
      readMockCallArgument(storageService.uploadFile, 0) as UploadFileInput
    ).objectKey;
    expect(storageService.deleteObject).toHaveBeenCalledTimes(1);
    expect(storageService.deleteObject).toHaveBeenCalledWith(uploadedObjectKey);
    expect(sessionService.attachCurrentStepEvidence).not.toHaveBeenCalled();
  });

  it('deletes the exact evidence and object when session CAS fails', async () => {
    sessionService.attachCurrentStepEvidence.mockRejectedValue(
      new ConflictException({
        code: 'PATIENT_ADMINISTRATION_SESSION_CONFLICT',
        message: 'Patient administration session changed',
      }),
    );

    await expectCode(
      service.uploadEvidence(
        requestContext,
        { expectedRevision: 3, evidenceType: 'audio' },
        webmFile(),
      ),
      409,
      'PATIENT_ADMINISTRATION_SESSION_CONFLICT',
    );
    const uploadedObjectKey = (
      readMockCallArgument(storageService.uploadFile, 0) as UploadFileInput
    ).objectKey;
    expect(
      mediaEvidenceService.deleteEvidenceForCompensation,
    ).toHaveBeenCalledTimes(1);
    expect(
      mediaEvidenceService.deleteEvidenceForCompensation,
    ).toHaveBeenCalledWith(ids.mediaEvidenceId);
    expect(storageService.deleteObject).toHaveBeenCalledTimes(1);
    expect(storageService.deleteObject).toHaveBeenCalledWith(uploadedObjectKey);
  });
});
