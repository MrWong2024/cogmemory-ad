import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import { PatientsService } from '../../patients/services/patients.service';
import {
  DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
  STORAGE_SERVICE,
} from '../../storage/storage.constants';
import { StorageConfigService } from '../../storage/storage-config.service';
import type { UploadFileInput } from '../../storage/storage.interface';
import type { UploadedMemoryFile } from '../types/uploaded-memory-file.types';
import type { MediaEvidenceMetadata } from '../schemas/media-evidence.schema';
import {
  type CreateMediaEvidenceInput,
  MediaEvidenceService,
} from './media-evidence.service';
import { MediaEvidenceWorkflowService } from './media-evidence-workflow.service';
import { PatientAdministrationReviewService } from './patient-administration-review.service';
import type {
  PatientAdministrationReviewResponse,
  PatientAdministrationReviewRunResponse,
} from '../types/patient-administration-review-response.types';

const ids = {
  patientId: new Types.ObjectId().toString(),
  visitId: new Types.ObjectId().toString(),
  scaleInstanceId: new Types.ObjectId().toString(),
  itemResponseId: new Types.ObjectId().toString(),
  mediaEvidenceId: new Types.ObjectId().toString(),
  definitionId: new Types.ObjectId().toString(),
  versionId: new Types.ObjectId().toString(),
  userId: new Types.ObjectId().toString(),
  sessionId: new Types.ObjectId().toString(),
};

const params = {
  patientId: ids.patientId,
  visitId: ids.visitId,
  scaleInstanceId: ids.scaleInstanceId,
  itemResponseId: ids.itemResponseId,
};

const mediaParams = { ...params, mediaEvidenceId: ids.mediaEvidenceId };

const user = {
  id: ids.userId,
  accountName: 'doctor-a15-test',
  displayName: 'A15 Test Operator',
  roles: ['admin', 'doctor'],
  permissions: [],
};

function memoryFile(
  fieldname: 'file' | 'trajectory',
  buffer: Buffer,
  mimetype: string,
): UploadedMemoryFile {
  return {
    fieldname,
    originalname: `private-client-name-${fieldname}.bin`,
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
  };
}

function primaryFile(): UploadedMemoryFile {
  return memoryFile(
    'file',
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
    'image/png',
  );
}

function itemResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.itemResponseId,
    assessmentVisitId: ids.visitId,
    scaleInstanceId: ids.scaleInstanceId,
    patientId: ids.patientId,
    subjectCode: 'SUBJ-A15-TEST-001',
    scaleDefinitionId: ids.definitionId,
    scaleVersionId: ids.versionId,
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: 'INST-A15-TEST-001',
    itemCode: 'moca.visuospatial.clock',
    crfCode: 'N1.2.3',
    groupCode: 'visuospatial',
    itemTitle: 'Clock drawing',
    itemOrder: 3,
    responseType: 'drawing',
    countsTowardTotal: true,
    cognitiveDomainCodes: ['visuospatial'],
    itemConfigSnapshot: { scoringRule: 'must-not-copy' },
    versionTrace: {
      scaleVersion: '1.0',
      crfVersion: 'crf-1',
      scoringRuleVersion: 'score-1',
      fieldEncodingVersion: 'field-1',
      sourceDocument: 'source.pdf',
    },
    status: 'not_started',
    answerSource: 'clinician_recorded',
    rawResponse: null,
    structuredResponse: null,
    isMissing: false,
    score: null,
    stepResults: [],
    promptResponses: [],
    timing: null,
    evidenceRefs: [
      {
        evidenceType: 'photo',
        mediaEvidenceId: null,
        status: 'pending',
      },
      {
        evidenceType: 'handwriting',
        mediaEvidenceId: null,
        status: 'pending',
      },
    ],
    qualityControlHints: null,
    metadata: null,
    lockedAt: null,
    voidedAt: null,
    ...overrides,
  };
}

function evidence(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-07-10T08:00:00.000Z');
  return {
    id: ids.mediaEvidenceId,
    patientId: ids.patientId,
    assessmentVisitId: ids.visitId,
    scaleInstanceId: ids.scaleInstanceId,
    itemResponseId: ids.itemResponseId,
    subjectCode: 'SUBJ-A15-TEST-001',
    scaleDefinitionId: ids.definitionId,
    scaleVersionId: ids.versionId,
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: 'INST-A15-TEST-001',
    itemCode: 'moca.visuospatial.clock',
    evidenceCode: 'EVD-A15TEST001',
    evidenceType: 'photo',
    captureMode: 'photo_upload',
    status: 'attached',
    storageStatus: 'stored',
    crfCode: 'N1.2.3',
    groupCode: 'visuospatial',
    itemTitle: 'Clock drawing',
    responseType: 'drawing',
    countsTowardTotal: true,
    cognitiveDomainCodes: ['visuospatial'],
    itemSnapshot: { itemCode: 'moca.visuospatial.clock' },
    versionTrace: null,
    storage: {
      storageDriver: 'fake',
      bucket: 'fake-storage',
      objectKey: 'safe-prefix/clinical-evidence/primary.png',
      objectPrefix: 'safe-prefix',
      mimeType: 'image/png',
      fileExtension: 'png',
      sizeBytes: 9,
      checksum: 'checksum',
      checksumAlgorithm: 'sha256',
      storedAt: now,
    },
    imageMetadata: null,
    handwritingTrace: null,
    captureContext: null,
    operatorSnapshot: null,
    qualityStatus: 'unchecked',
    qualityHints: null,
    metadata: null,
    lockedAt: null,
    voidedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function patientAdministrationEvidence(
  overrides: Record<string, unknown> = {},
) {
  return evidence({
    patientAdministrationContext: {
      sessionId: ids.sessionId,
      stepKey: 'mmse-drawing',
      stepRun: 1,
    },
    ...overrides,
  });
}

function patientReview(
  overrides: {
    status?: PatientAdministrationReviewResponse['session']['status'];
    capture?: PatientAdministrationReviewRunResponse['capture'];
    evidence?: PatientAdministrationReviewRunResponse['evidence'];
  } = {},
): PatientAdministrationReviewResponse {
  const capture = Object.prototype.hasOwnProperty.call(overrides, 'capture')
    ? (overrides.capture ?? null)
    : {
        capturedBy: 'patient' as const,
        capturedAt: new Date('2026-07-10T08:00:01.000Z'),
        invalidatedAt: null,
        operatorSnapshot: null,
      };
  const reviewEvidence = overrides.evidence ?? [
    {
      mediaEvidenceId: ids.mediaEvidenceId,
      evidenceType: 'photo',
      captureMode: 'photo_upload',
      status: 'attached',
      storageStatus: 'stored',
      uploadedAt: new Date('2026-07-10T08:00:00.000Z'),
      file: null,
      imageMetadata: null,
      handwritingTrace: null,
      audioMetadata: null,
      transcription: null,
    },
  ];

  return {
    session: {
      status: overrides.status ?? 'completed',
      preparationConfirmedAt: new Date('2026-07-10T07:50:00.000Z'),
      impactFactorCodes: [],
      startedAt: new Date('2026-07-10T07:55:00.000Z'),
      completedAt: new Date('2026-07-10T08:05:00.000Z'),
      terminatedAt: null,
      expiredAt: null,
    },
    reviewEvents: [],
    items: [
      {
        itemResponseId: ids.itemResponseId,
        itemCode: 'moca.visuospatial.clock',
        itemTitle: 'Clock drawing',
        status: 'not_started',
        draftRevision: 0,
        steps: [
          {
            stepKey: 'mmse-drawing',
            order: 19,
            responseMode: 'drawing',
            advanceBy: 'patient',
            structuredFieldCodes: [],
            runs: [{ stepRun: 1, capture, evidence: reviewEvidence }],
          },
        ],
      },
    ],
  };
}

async function expectHttpCode(
  promise: Promise<unknown>,
  status: number,
  code?: string,
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected an HTTP exception');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    const httpError = error as HttpException;
    expect(httpError.getStatus()).toBe(status);
    if (code) {
      expect(httpError.getResponse()).toEqual(
        expect.objectContaining({ code }),
      );
    }
  }
}

describe('MediaEvidenceWorkflowService', () => {
  let service: MediaEvidenceWorkflowService;
  let patients: { findPatientById: jest.Mock };
  let assessments: {
    findVisitByPatientAndId: jest.Mock;
    findScaleInstanceByPatientVisitAndId: jest.Mock;
    findItemResponseByOwnership: jest.Mock;
    attachItemEvidenceReference: jest.Mock;
    clearItemEvidenceReference: jest.Mock;
    restoreItemEvidenceReference: jest.Mock;
  };
  let media: {
    listEvidenceByItemOwnership: jest.Mock;
    findActiveEvidenceByItemAndType: jest.Mock;
    createEvidence: jest.Mock;
    deleteEvidenceForCompensation: jest.Mock;
    findEvidenceByOwnership: jest.Mock;
    markEvidenceVoided: jest.Mock;
  };
  let review: { getReview: jest.Mock };
  let storage: {
    driver: 'fake';
    uploadFile: jest.Mock;
    getSignedUrl: jest.Mock;
    deleteObject: jest.Mock;
  };
  let uploadedInputs: UploadFileInput[];
  let createdInputs: CreateMediaEvidenceInput[];
  let voidMetadataInputs: MediaEvidenceMetadata[];

  beforeEach(async () => {
    uploadedInputs = [];
    createdInputs = [];
    voidMetadataInputs = [];
    patients = {
      findPatientById: jest.fn().mockResolvedValue({
        id: ids.patientId,
        subjectCode: 'SUBJ-A15-TEST-001',
        status: 'active',
      }),
    };
    assessments = {
      findVisitByPatientAndId: jest.fn().mockResolvedValue({
        id: ids.visitId,
        status: 'draft',
      }),
      findScaleInstanceByPatientVisitAndId: jest.fn().mockResolvedValue({
        id: ids.scaleInstanceId,
        status: 'draft',
      }),
      findItemResponseByOwnership: jest.fn().mockResolvedValue(itemResponse()),
      attachItemEvidenceReference: jest
        .fn()
        .mockImplementation(
          (
            _patientId: string,
            _visitId: string,
            _scaleInstanceId: string,
            _itemResponseId: string,
            evidenceType: 'photo' | 'handwriting',
            mediaEvidenceId: string,
          ) =>
            Promise.resolve(
              itemResponse({
                evidenceRefs: [
                  {
                    evidenceType,
                    mediaEvidenceId,
                    status: 'attached',
                  },
                ],
              }),
            ),
        ),
      clearItemEvidenceReference: jest.fn().mockResolvedValue(itemResponse()),
      restoreItemEvidenceReference: jest.fn().mockResolvedValue(itemResponse()),
    };
    media = {
      listEvidenceByItemOwnership: jest.fn().mockResolvedValue([]),
      findActiveEvidenceByItemAndType: jest.fn().mockResolvedValue(null),
      createEvidence: jest
        .fn()
        .mockImplementation((input: CreateMediaEvidenceInput) => {
          createdInputs.push(input);
          return Promise.resolve(evidence());
        }),
      deleteEvidenceForCompensation: jest.fn().mockResolvedValue(true),
      findEvidenceByOwnership: jest
        .fn()
        .mockResolvedValue(patientAdministrationEvidence()),
      markEvidenceVoided: jest
        .fn()
        .mockImplementation(
          (
            _ownership: unknown,
            _mediaEvidenceId: unknown,
            _voidedAt: unknown,
            metadata: MediaEvidenceMetadata,
          ) => {
            voidMetadataInputs.push(metadata);
            return Promise.resolve(
              evidence({
                status: 'voided',
                voidedAt: new Date('2026-07-10T09:00:00.000Z'),
              }),
            );
          },
        ),
    };
    review = { getReview: jest.fn().mockResolvedValue(patientReview()) };
    storage = {
      driver: 'fake',
      uploadFile: jest.fn().mockImplementation((input: UploadFileInput) => {
        uploadedInputs.push(input);
        return Promise.resolve({
          objectKey: input.objectKey,
          bucket: 'fake-storage',
          sizeBytes: input.sizeBytes,
          mimeType: input.mimeType,
        });
      }),
      getSignedUrl: jest.fn().mockResolvedValue({
        url: 'https://fake-storage.local/signed',
        expiresAt: new Date('2026-07-10T09:10:00.000Z'),
      }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MediaEvidenceWorkflowService,
        { provide: PatientsService, useValue: patients },
        { provide: AssessmentsService, useValue: assessments },
        { provide: MediaEvidenceService, useValue: media },
        { provide: PatientAdministrationReviewService, useValue: review },
        { provide: STORAGE_SERVICE, useValue: storage },
        {
          provide: StorageConfigService,
          useValue: { getObjectPrefix: () => 'safe-prefix' },
        },
      ],
    }).compile();

    service = moduleRef.get(MediaEvidenceWorkflowService);
  });

  it('lists historical evidence after the full ownership chain without edit checks', async () => {
    patients.findPatientById.mockResolvedValue({
      id: ids.patientId,
      subjectCode: 'SUBJ-A15-TEST-001',
      status: 'archived',
    });
    assessments.findVisitByPatientAndId.mockResolvedValue({
      id: ids.visitId,
      status: 'completed',
    });
    assessments.findScaleInstanceByPatientVisitAndId.mockResolvedValue({
      id: ids.scaleInstanceId,
      status: 'locked',
    });
    media.listEvidenceByItemOwnership.mockResolvedValue([
      evidence({ status: 'voided' }),
    ]);

    const result = await service.listEvidence(params);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({ status: 'voided' }),
    );
    expect(media.listEvidenceByItemOwnership).toHaveBeenCalledWith({
      patientId: ids.patientId,
      assessmentVisitId: ids.visitId,
      scaleInstanceId: ids.scaleInstanceId,
      itemResponseId: ids.itemResponseId,
    });
  });

  it('creates photo evidence, safe object keys and an attached reference', async () => {
    const result = await service.uploadEvidence(
      params,
      {
        evidenceType: 'photo',
        captureMode: 'paper_scan',
        imageWidth: 1024,
        isColor: false,
      },
      { file: [primaryFile()] },
      user,
    );

    expect(result.evidenceRequirement).toEqual({
      evidenceType: 'photo',
      status: 'attached',
      attached: true,
      mediaEvidenceId: ids.mediaEvidenceId,
    });
    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    const uploadInput = uploadedInputs[0];
    expect(uploadInput.objectKey).toContain(
      `safe-prefix/clinical-evidence/${ids.patientId}/${ids.visitId}/${ids.scaleInstanceId}/${ids.itemResponseId}/`,
    );
    expect(uploadInput.objectKey).not.toContain('private-client-name');

    const createInput = createdInputs[0];
    expect(createInput).toEqual(
      expect.objectContaining({
        status: 'attached',
        storageStatus: 'stored',
        qualityStatus: 'unchecked',
        metadata: null,
      }),
    );
    expect(createInput.itemSnapshot).toEqual({
      itemCode: 'moca.visuospatial.clock',
      crfCode: 'N1.2.3',
      groupCode: 'visuospatial',
      itemTitle: 'Clock drawing',
      responseType: 'drawing',
      evidenceType: 'photo',
    });
    expect(createInput.operatorSnapshot).toEqual(
      expect.objectContaining({ operatorRole: 'doctor' }),
    );
    expect(JSON.stringify(createInput)).not.toContain('private-client-name');
    expect(assessments.attachItemEvidenceReference).toHaveBeenCalledWith(
      ids.patientId,
      ids.visitId,
      ids.scaleInstanceId,
      ids.itemResponseId,
      'photo',
      ids.mediaEvidenceId,
    );
  });

  it('adopts existing patient evidence from one valid completed run without Storage or evidence creation', async () => {
    const result =
      await service.adoptPatientAdministrationEvidence(mediaParams);

    expect(result.mediaEvidence.id).toBe(ids.mediaEvidenceId);
    expect(result.evidenceRequirement).toEqual({
      evidenceType: 'photo',
      status: 'attached',
      attached: true,
      mediaEvidenceId: ids.mediaEvidenceId,
    });
    expect(review.getReview).toHaveBeenCalledWith(mediaParams);
    expect(assessments.attachItemEvidenceReference).toHaveBeenCalledTimes(1);
    expect(assessments.attachItemEvidenceReference).toHaveBeenCalledWith(
      ids.patientId,
      ids.visitId,
      ids.scaleInstanceId,
      ids.itemResponseId,
      'photo',
      ids.mediaEvidenceId,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(media.createEvidence).not.toHaveBeenCalled();
    expect(media.deleteEvidenceForCompensation).not.toHaveBeenCalled();
  });

  it('rejects patient evidence from an invalidated run', async () => {
    review.getReview.mockResolvedValue(
      patientReview({
        capture: {
          capturedBy: 'patient',
          capturedAt: new Date('2026-07-10T08:00:01.000Z'),
          invalidatedAt: new Date('2026-07-10T08:01:00.000Z'),
          invalidatedReason: 'redo requested',
          operatorSnapshot: null,
        },
      }),
    );

    await expectHttpCode(
      service.adoptPatientAdministrationEvidence(mediaParams),
      409,
      'MEDIA_EVIDENCE_NOT_ADOPTABLE',
    );
    expect(assessments.attachItemEvidenceReference).not.toHaveBeenCalled();
  });

  it('rejects an evidence-only run without a valid capture', async () => {
    review.getReview.mockResolvedValue(patientReview({ capture: null }));

    await expectHttpCode(
      service.adoptPatientAdministrationEvidence(mediaParams),
      409,
      'MEDIA_EVIDENCE_NOT_ADOPTABLE',
    );
    expect(assessments.attachItemEvidenceReference).not.toHaveBeenCalled();
  });

  it('rejects evidence without patient administration context', async () => {
    media.findEvidenceByOwnership.mockResolvedValue(evidence());

    await expectHttpCode(
      service.adoptPatientAdministrationEvidence(mediaParams),
      409,
      'MEDIA_EVIDENCE_NOT_ADOPTABLE',
    );
    expect(review.getReview).not.toHaveBeenCalled();
    expect(assessments.attachItemEvidenceReference).not.toHaveBeenCalled();
  });

  it('rejects patient evidence until its latest session is completed', async () => {
    review.getReview.mockResolvedValue(patientReview({ status: 'active' }));

    await expectHttpCode(
      service.adoptPatientAdministrationEvidence(mediaParams),
      409,
      'MEDIA_EVIDENCE_NOT_ADOPTABLE',
    );
    expect(assessments.attachItemEvidenceReference).not.toHaveBeenCalled();
  });

  it('reuses the current item evidence requirement for adoption', async () => {
    assessments.findItemResponseByOwnership.mockResolvedValue(
      itemResponse({ evidenceRefs: [] }),
    );

    await expectHttpCode(
      service.adoptPatientAdministrationEvidence(mediaParams),
      409,
      'ITEM_EVIDENCE_TYPE_NOT_REQUIRED',
    );
    expect(review.getReview).not.toHaveBeenCalled();
    expect(assessments.attachItemEvidenceReference).not.toHaveBeenCalled();
  });

  it('classifies an adoption CAS miss won by an attached reference without compensation', async () => {
    assessments.findItemResponseByOwnership
      .mockResolvedValueOnce(itemResponse())
      .mockResolvedValueOnce(
        itemResponse({
          evidenceRefs: [
            {
              evidenceType: 'photo',
              mediaEvidenceId: ids.mediaEvidenceId,
              status: 'attached',
            },
          ],
        }),
      );
    assessments.attachItemEvidenceReference.mockResolvedValueOnce(null);

    await expectHttpCode(
      service.adoptPatientAdministrationEvidence(mediaParams),
      409,
      'MEDIA_EVIDENCE_ALREADY_ATTACHED',
    );
    expect(media.deleteEvidenceForCompensation).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('revokes patient evidence adoption by clearing only the formal reference', async () => {
    assessments.findItemResponseByOwnership.mockResolvedValue(
      itemResponse({
        evidenceRefs: [
          {
            evidenceType: 'photo',
            mediaEvidenceId: ids.mediaEvidenceId,
            status: 'attached',
          },
        ],
      }),
    );

    const result = await service.revokePatientAdministrationEvidenceAdoption(
      mediaParams,
      user,
    );

    expect(result.mediaEvidence).toEqual(
      expect.objectContaining({
        id: ids.mediaEvidenceId,
        patientAdministrationOrigin: true,
        status: 'attached',
        storageStatus: 'stored',
        voidedAt: null,
      }),
    );
    expect(result.evidenceRequirement).toEqual({
      evidenceType: 'photo',
      status: 'pending',
      attached: false,
      mediaEvidenceId: null,
    });
    expect(assessments.clearItemEvidenceReference).toHaveBeenCalledWith(
      ids.patientId,
      ids.visitId,
      ids.scaleInstanceId,
      ids.itemResponseId,
      'photo',
      ids.mediaEvidenceId,
    );
    expect(media.markEvidenceVoided).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('fails patient evidence adoption revoke closed for auth, provenance, locks and missing formal refs', async () => {
    assessments.findItemResponseByOwnership.mockResolvedValue(
      itemResponse({
        evidenceRefs: [
          {
            evidenceType: 'photo',
            mediaEvidenceId: ids.mediaEvidenceId,
            status: 'attached',
          },
        ],
      }),
    );

    await expectHttpCode(
      service.revokePatientAdministrationEvidenceAdoption(
        mediaParams,
        undefined,
      ),
      401,
    );

    media.findEvidenceByOwnership.mockResolvedValue(evidence());
    await expectHttpCode(
      service.revokePatientAdministrationEvidenceAdoption(mediaParams, user),
      409,
      'MEDIA_EVIDENCE_ADOPTION_NOT_REVOCABLE',
    );

    media.findEvidenceByOwnership.mockResolvedValue(
      patientAdministrationEvidence({ lockedAt: new Date() }),
    );
    await expectHttpCode(
      service.revokePatientAdministrationEvidenceAdoption(mediaParams, user),
      409,
      'MEDIA_EVIDENCE_ADOPTION_NOT_REVOCABLE',
    );

    media.findEvidenceByOwnership.mockResolvedValue(
      patientAdministrationEvidence(),
    );
    assessments.findItemResponseByOwnership.mockResolvedValue(
      itemResponse({
        lockedAt: new Date(),
        evidenceRefs: [
          {
            evidenceType: 'photo',
            mediaEvidenceId: ids.mediaEvidenceId,
            status: 'attached',
          },
        ],
      }),
    );
    await expectHttpCode(
      service.revokePatientAdministrationEvidenceAdoption(mediaParams, user),
      409,
      'ITEM_RESPONSE_NOT_EDITABLE',
    );

    assessments.findItemResponseByOwnership.mockResolvedValue(itemResponse());
    await expectHttpCode(
      service.revokePatientAdministrationEvidenceAdoption(mediaParams, user),
      409,
      'MEDIA_EVIDENCE_ADOPTION_NOT_REVOCABLE',
    );
    expect(assessments.clearItemEvidenceReference).not.toHaveBeenCalled();
    expect(media.markEvidenceVoided).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('rejects patient-origin evidence at the old void action before clearing the formal reference', async () => {
    assessments.findItemResponseByOwnership.mockResolvedValue(
      itemResponse({
        evidenceRefs: [
          {
            evidenceType: 'photo',
            mediaEvidenceId: ids.mediaEvidenceId,
            status: 'attached',
          },
        ],
      }),
    );

    await expectHttpCode(
      service.voidEvidence(mediaParams, { reason: 'legacy client' }, user),
      409,
      'MEDIA_EVIDENCE_PATIENT_ORIGIN_REQUIRES_ADOPTION_REVOKE',
    );
    expect(assessments.clearItemEvidenceReference).not.toHaveBeenCalled();
    expect(media.markEvidenceVoided).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('normalizes and uploads optional handwriting JSON trajectory', async () => {
    const trajectory = memoryFile(
      'trajectory',
      Buffer.from(' { "strokes" : [ [1, 2] ] } '),
      'application/json',
    );

    await service.uploadEvidence(
      params,
      {
        evidenceType: 'handwriting',
        captureMode: 'tablet_handwriting',
        trajectoryFormat: 'strokes',
        strokeCount: 1,
      },
      { file: [primaryFile()], trajectory: [trajectory] },
      user,
    );

    expect(storage.uploadFile).toHaveBeenCalledTimes(2);
    const traceUpload = uploadedInputs[1];
    expect(traceUpload.objectKey).toMatch(/\.trajectory\.json$/);
    expect(traceUpload.mimeType).toBe('application/json');
    expect(traceUpload.buffer.toString('utf8')).toBe('{"strokes":[[1,2]]}');
    const createInput = createdInputs[0];
    expect(createInput.handwritingTrace).toEqual(
      expect.objectContaining({
        hasTrajectory: true,
        trajectoryFormat: 'strokes',
        strokeCount: 1,
      }),
    );
  });

  it('enforces capture mode, evidence requirement, duplicate and edit states', async () => {
    await expectHttpCode(
      service.uploadEvidence(
        params,
        { evidenceType: 'handwriting', captureMode: 'photo_upload' },
        { file: [primaryFile()] },
        user,
      ),
      400,
      'MEDIA_CAPTURE_MODE_INVALID',
    );

    assessments.findItemResponseByOwnership.mockResolvedValue(
      itemResponse({ evidenceRefs: [] }),
    );
    await expectHttpCode(
      service.uploadEvidence(
        params,
        { evidenceType: 'photo', captureMode: 'photo_upload' },
        { file: [primaryFile()] },
        user,
      ),
      409,
      'ITEM_EVIDENCE_TYPE_NOT_REQUIRED',
    );

    assessments.findItemResponseByOwnership.mockResolvedValue(itemResponse());
    media.findActiveEvidenceByItemAndType.mockResolvedValue(evidence());
    await expectHttpCode(
      service.uploadEvidence(
        params,
        { evidenceType: 'photo', captureMode: 'photo_upload' },
        { file: [primaryFile()] },
        user,
      ),
      409,
      'MEDIA_EVIDENCE_ALREADY_ATTACHED',
    );

    media.findActiveEvidenceByItemAndType.mockResolvedValue(null);
    patients.findPatientById.mockResolvedValue({
      id: ids.patientId,
      subjectCode: 'SUBJ-A15-TEST-001',
      status: 'inactive',
    });
    await expectHttpCode(
      service.uploadEvidence(
        params,
        { evidenceType: 'photo', captureMode: 'photo_upload' },
        { file: [primaryFile()] },
        user,
      ),
      409,
      'PATIENT_NOT_ACTIVE',
    );
  });

  it('rejects photo trajectories and invalid primary signatures before Storage', async () => {
    await expectHttpCode(
      service.uploadEvidence(
        params,
        { evidenceType: 'photo', captureMode: 'photo_upload' },
        {
          file: [primaryFile()],
          trajectory: [
            memoryFile('trajectory', Buffer.from('{}'), 'application/json'),
          ],
        },
        user,
      ),
      400,
      'MEDIA_TRAJECTORY_INVALID',
    );
    await expectHttpCode(
      service.uploadEvidence(
        params,
        { evidenceType: 'photo', captureMode: 'photo_upload' },
        {
          file: [memoryFile('file', Buffer.from('%PDF'), 'image/png')],
        },
        user,
      ),
      400,
      'MEDIA_FILE_SIGNATURE_INVALID',
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('compensates only this upload on trajectory, create and attach failures', async () => {
    storage.uploadFile
      .mockImplementationOnce((input: UploadFileInput) =>
        Promise.resolve({
          objectKey: input.objectKey,
          bucket: 'fake-storage',
          sizeBytes: input.sizeBytes,
          mimeType: input.mimeType,
        }),
      )
      .mockRejectedValueOnce(new Error('safe test failure'));
    await expectHttpCode(
      service.uploadEvidence(
        params,
        {
          evidenceType: 'handwriting',
          captureMode: 'tablet_handwriting',
        },
        {
          file: [primaryFile()],
          trajectory: [
            memoryFile('trajectory', Buffer.from('{}'), 'application/json'),
          ],
        },
        user,
      ),
      503,
      'MEDIA_STORAGE_UNAVAILABLE',
    );
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
    expect(media.createEvidence).not.toHaveBeenCalled();

    jest.clearAllMocks();
    storage.uploadFile.mockImplementation((input: UploadFileInput) =>
      Promise.resolve({
        objectKey: input.objectKey,
        bucket: 'fake-storage',
        sizeBytes: input.sizeBytes,
        mimeType: input.mimeType,
      }),
    );
    storage.deleteObject.mockResolvedValue(undefined);
    media.findActiveEvidenceByItemAndType.mockResolvedValue(null);
    media.createEvidence.mockRejectedValue(new Error('safe test failure'));
    await expectHttpCode(
      service.uploadEvidence(
        params,
        { evidenceType: 'photo', captureMode: 'photo_upload' },
        { file: [primaryFile()] },
        user,
      ),
      500,
      'MEDIA_EVIDENCE_CREATE_FAILED',
    );
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);

    media.createEvidence.mockResolvedValue(evidence());
    assessments.attachItemEvidenceReference.mockResolvedValue(null);
    await expectHttpCode(
      service.uploadEvidence(
        params,
        { evidenceType: 'photo', captureMode: 'photo_upload' },
        { file: [primaryFile()] },
        user,
      ),
      409,
      'MEDIA_EVIDENCE_ALREADY_ATTACHED',
    );
    expect(media.deleteEvidenceForCompensation).toHaveBeenCalledWith(
      ids.mediaEvidenceId,
    );
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
  });

  it('compensates exact upload artifacts and reclassifies an attach miss won by a barrier', async () => {
    assessments.findScaleInstanceByPatientVisitAndId
      .mockResolvedValueOnce({ id: ids.scaleInstanceId, status: 'draft' })
      .mockResolvedValueOnce({
        id: ids.scaleInstanceId,
        status: 'draft',
        submissionWriteBarrier: { malformed: true },
      });
    assessments.attachItemEvidenceReference.mockResolvedValueOnce(null);

    await expectHttpCode(
      service.uploadEvidence(
        params,
        { evidenceType: 'photo', captureMode: 'photo_upload' },
        { file: [primaryFile()] },
        user,
      ),
      409,
      'SCALE_INSTANCE_NOT_EDITABLE',
    );

    expect(media.deleteEvidenceForCompensation).toHaveBeenCalledWith(
      ids.mediaEvidenceId,
    );
    expect(uploadedInputs).toHaveLength(1);
    expect(storage.deleteObject).toHaveBeenCalledWith(
      uploadedInputs[0].objectKey,
    );
    expect(media.markEvidenceVoided).not.toHaveBeenCalled();
  });

  it('fails upload and void prechecks closed for malformed item barriers', async () => {
    assessments.findItemResponseByOwnership.mockResolvedValue(
      itemResponse({ submissionWriteBarrier: { malformed: true } }),
    );

    await expectHttpCode(
      service.uploadEvidence(
        params,
        { evidenceType: 'photo', captureMode: 'photo_upload' },
        { file: [primaryFile()] },
        user,
      ),
      409,
      'SCALE_INSTANCE_NOT_EDITABLE',
    );
    await expectHttpCode(
      service.voidEvidence(mediaParams, { reason: 'blocked' }, user),
      409,
      'SCALE_INSTANCE_NOT_EDITABLE',
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(assessments.clearItemEvidenceReference).not.toHaveBeenCalled();
  });

  it('creates fixed-expiry primary and trajectory access URLs safely', async () => {
    const primary = await service.createAccessUrl(mediaParams, {
      asset: 'primary',
    });
    expect(primary).toEqual(
      expect.objectContaining({
        asset: 'primary',
        url: 'https://fake-storage.local/signed',
      }),
    );
    expect(storage.getSignedUrl).toHaveBeenCalledWith(
      'safe-prefix/clinical-evidence/primary.png',
      { expiresInSeconds: DEFAULT_SIGNED_URL_EXPIRES_SECONDS },
    );

    media.findEvidenceByOwnership.mockResolvedValue(
      evidence({
        evidenceType: 'handwriting',
        handwritingTrace: {
          hasTrajectory: true,
          trajectoryObjectKey: 'safe-prefix/trajectory.json',
          trajectoryFormat: 'json',
          strokeCount: null,
          durationMs: null,
          canvasWidth: null,
          canvasHeight: null,
          inputTool: 'unknown',
        },
      }),
    );
    await service.createAccessUrl(mediaParams, { asset: 'trajectory' });
    expect(storage.getSignedUrl).toHaveBeenLastCalledWith(
      'safe-prefix/trajectory.json',
      { expiresInSeconds: DEFAULT_SIGNED_URL_EXPIRES_SECONDS },
    );

    media.findEvidenceByOwnership.mockResolvedValue(
      evidence({ status: 'voided' }),
    );
    await expectHttpCode(
      service.createAccessUrl(mediaParams, { asset: 'primary' }),
      409,
      'MEDIA_EVIDENCE_NOT_ACCESSIBLE',
    );
  });

  it('voids by clearing the reference first without deleting Storage', async () => {
    media.findEvidenceByOwnership.mockResolvedValue(evidence());
    assessments.findItemResponseByOwnership.mockResolvedValue(
      itemResponse({
        evidenceRefs: [
          {
            evidenceType: 'photo',
            mediaEvidenceId: ids.mediaEvidenceId,
            status: 'attached',
          },
        ],
      }),
    );

    const result = await service.voidEvidence(
      mediaParams,
      { reason: 'wrong capture' },
      user,
    );

    expect(result.evidenceRequirement).toEqual({
      evidenceType: 'photo',
      status: 'pending',
      attached: false,
      mediaEvidenceId: null,
    });
    expect(assessments.clearItemEvidenceReference).toHaveBeenCalled();
    expect(media.markEvidenceVoided).toHaveBeenCalled();
    expect(voidMetadataInputs[0]).toEqual(
      expect.objectContaining({
        voidReason: 'wrong capture',
        voidedBy: ids.userId,
      }),
    );
    expect(typeof voidMetadataInputs[0]?.voidedAt).toBe('string');
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('reclassifies a clear miss won by a parent barrier without voiding evidence', async () => {
    media.findEvidenceByOwnership.mockResolvedValue(evidence());
    assessments.findScaleInstanceByPatientVisitAndId
      .mockResolvedValueOnce({ id: ids.scaleInstanceId, status: 'draft' })
      .mockResolvedValueOnce({
        id: ids.scaleInstanceId,
        status: 'draft',
        submissionWriteBarrier: { malformed: true },
      });
    assessments.findItemResponseByOwnership.mockResolvedValue(
      itemResponse({
        evidenceRefs: [
          {
            evidenceType: 'photo',
            mediaEvidenceId: ids.mediaEvidenceId,
            status: 'attached',
          },
        ],
      }),
    );
    assessments.clearItemEvidenceReference.mockResolvedValueOnce(null);

    await expectHttpCode(
      service.voidEvidence(mediaParams, { reason: 'blocked' }, user),
      409,
      'SCALE_INSTANCE_NOT_EDITABLE',
    );
    expect(media.markEvidenceVoided).not.toHaveBeenCalled();
    expect(assessments.restoreItemEvidenceReference).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('restores the reference when marking evidence voided fails', async () => {
    media.findEvidenceByOwnership.mockResolvedValue(evidence());
    assessments.findItemResponseByOwnership.mockResolvedValue(
      itemResponse({
        evidenceRefs: [
          {
            evidenceType: 'photo',
            mediaEvidenceId: ids.mediaEvidenceId,
            status: 'attached',
          },
        ],
      }),
    );
    media.markEvidenceVoided.mockResolvedValue(null);

    await expectHttpCode(
      service.voidEvidence(mediaParams, { reason: 'wrong capture' }, user),
      500,
      'MEDIA_EVIDENCE_VOID_FAILED',
    );
    expect(assessments.restoreItemEvidenceReference).toHaveBeenCalledWith(
      ids.patientId,
      ids.visitId,
      ids.scaleInstanceId,
      ids.itemResponseId,
      'photo',
      ids.mediaEvidenceId,
    );
    expect(storage.deleteObject).not.toHaveBeenCalled();

    assessments.clearItemEvidenceReference.mockRejectedValue(
      new Error('safe test failure'),
    );
    await expectHttpCode(
      service.voidEvidence(mediaParams, { reason: 'wrong capture' }, user),
      500,
      'MEDIA_EVIDENCE_VOID_FAILED',
    );
  });
});
