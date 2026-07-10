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

const ids = {
  patientId: new Types.ObjectId().toString(),
  visitId: new Types.ObjectId().toString(),
  scaleInstanceId: new Types.ObjectId().toString(),
  itemResponseId: new Types.ObjectId().toString(),
  mediaEvidenceId: new Types.ObjectId().toString(),
  definitionId: new Types.ObjectId().toString(),
  versionId: new Types.ObjectId().toString(),
  userId: new Types.ObjectId().toString(),
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

async function expectHttpCode(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected an HTTP exception');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    const httpError = error as HttpException;
    expect(httpError.getStatus()).toBe(status);
    expect(httpError.getResponse()).toEqual(expect.objectContaining({ code }));
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
      attachItemEvidenceReference: jest.fn().mockResolvedValue(
        itemResponse({
          evidenceRefs: [
            {
              evidenceType: 'photo',
              mediaEvidenceId: ids.mediaEvidenceId,
              status: 'attached',
            },
          ],
        }),
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
      findEvidenceByOwnership: jest.fn().mockResolvedValue(evidence()),
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

  it('restores the reference when marking evidence voided fails', async () => {
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
