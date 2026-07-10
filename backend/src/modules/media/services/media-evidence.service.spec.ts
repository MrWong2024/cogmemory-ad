// backend/src/modules/media/services/media-evidence.service.spec.ts
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import {
  HandwritingTraceSnapshotSchema,
  MediaCaptureContextSchema,
  MediaEvidence,
  MediaEvidenceSchema,
  MediaEvidenceVersionTraceSchema,
  MediaImageMetadataSchema,
  MediaOperatorSnapshotSchema,
  MediaStorageSnapshotSchema,
} from '../schemas/media-evidence.schema';
import {
  type CreateMediaEvidenceInput,
  MediaEvidenceService,
} from './media-evidence.service';

function createExecQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

function createEvidenceFixture(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    patientId: new Types.ObjectId(),
    assessmentVisitId: new Types.ObjectId(),
    scaleInstanceId: new Types.ObjectId(),
    itemResponseId: new Types.ObjectId(),
    subjectCode: 'SUBJ-TEST-001',
    scaleDefinitionId: new Types.ObjectId(),
    scaleVersionId: new Types.ObjectId(),
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: 'INST-TEST-001',
    itemCode: 'moca.visuospatial.trail_making',
    evidenceCode: 'EVD-TEST-001',
    evidenceType: 'photo',
    captureMode: 'photo_upload',
    status: 'attached',
    storageStatus: 'stored',
    crfCode: 'N1.2.1',
    groupCode: 'visuospatial',
    itemTitle: 'Trail making sample',
    responseType: 'drawing',
    countsTowardTotal: true,
    cognitiveDomainCodes: ['visuospatial'],
    itemSnapshot: { itemCode: 'moca.visuospatial.trail_making' },
    versionTrace: {
      scaleVersion: '1.0',
      crfVersion: 'crf-test-1',
      scoringRuleVersion: 'score-test-1',
      fieldEncodingVersion: 'field-test-1',
      sourceDocument: 'source-test',
    },
    storage: {
      storageDriver: 'fake',
      bucket: 'bucket-test',
      objectKey: 'cogmemory_ad/test/EVD-TEST-001.png',
      objectPrefix: 'cogmemory_ad/test',
      publicUrl: 'public-url-test-placeholder',
      mimeType: 'image/png',
      fileExtension: 'png',
      sizeBytes: 1024,
      checksum: 'checksum-test-001',
      checksumAlgorithm: 'sha256',
      originalFilename: 'test-media-evidence-001.png',
      storedAt: new Date('2026-01-06T08:00:00.000Z'),
    },
    imageMetadata: {
      width: 800,
      height: 600,
      orientation: 'landscape',
      pageNo: 1,
      isColor: true,
      capturedAt: new Date('2026-01-06T08:01:00.000Z'),
    },
    handwritingTrace: {
      hasTrajectory: true,
      trajectoryObjectKey: 'cogmemory_ad/test/EVD-TEST-001.trace.json',
      trajectoryFormat: 'json',
      strokeCount: 12,
      durationMs: 90000,
      canvasWidth: 1024,
      canvasHeight: 768,
      deviceType: 'tablet-test',
      inputTool: 'stylus',
    },
    captureContext: {
      capturedAt: new Date('2026-01-06T08:01:00.000Z'),
      uploadedAt: new Date('2026-01-06T08:02:00.000Z'),
      sourceDevice: 'device-test',
      sourceApp: 'app-test',
      captureNote: 'De-identified capture note',
    },
    operatorSnapshot: {
      operatorId: new Types.ObjectId(),
      operatorName: 'Sample Operator',
      operatorRole: 'research_assistant',
    },
    qualityStatus: 'acceptable',
    qualityHints: { requiresReview: false },
    operatorNote: 'De-identified operator note',
    description: 'De-identified evidence description',
    metadata: { source: 'unit-test' },
    lockedAt: null,
    voidedAt: null,
    deletedAt: null,
    internalMarker: 'not returned',
    ...overrides,
  };
}

describe('MediaEvidence schema', () => {
  it('defines collection and indexes', () => {
    expect(MediaEvidenceSchema.get('collection')).toBe('media_evidences');
    expect(MediaEvidenceSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ evidenceCode: 1 }, expect.objectContaining({ unique: true })],
        [{ itemResponseId: 1, evidenceType: 1, status: 1 }, expect.any(Object)],
        [
          { scaleInstanceId: 1, itemCode: 1, evidenceType: 1 },
          expect.any(Object),
        ],
        [{ assessmentVisitId: 1, createdAt: -1 }, expect.any(Object)],
        [{ patientId: 1, createdAt: -1 }, expect.any(Object)],
        [{ status: 1, updatedAt: -1 }, expect.any(Object)],
        [{ 'storage.objectKey': 1 }, expect.objectContaining({ sparse: true })],
        [{ scaleCode: 1, itemCode: 1, evidenceType: 1 }, expect.any(Object)],
      ]),
    );
  });

  it('defines explicit ObjectId, primitive, nullable and Mixed field types', () => {
    expect(MediaEvidenceSchema.path('patientId')?.instance).toBe('ObjectId');
    expect(MediaEvidenceSchema.path('assessmentVisitId')?.instance).toBe(
      'ObjectId',
    );
    expect(MediaEvidenceSchema.path('scaleInstanceId')?.instance).toBe(
      'ObjectId',
    );
    expect(MediaEvidenceSchema.path('itemResponseId')?.instance).toBe(
      'ObjectId',
    );
    expect(MediaEvidenceSchema.path('scaleDefinitionId')?.instance).toBe(
      'ObjectId',
    );
    expect(MediaEvidenceSchema.path('scaleVersionId')?.instance).toBe(
      'ObjectId',
    );
    expect(MediaEvidenceSchema.path('evidenceType')?.instance).toBe('String');
    expect(MediaEvidenceSchema.path('captureMode')?.instance).toBe('String');
    expect(MediaEvidenceSchema.path('status')?.instance).toBe('String');
    expect(MediaEvidenceSchema.path('storageStatus')?.instance).toBe('String');
    expect(MediaEvidenceSchema.path('responseType')?.instance).toBe('String');
    expect(MediaEvidenceSchema.path('countsTowardTotal')?.instance).toBe(
      'Boolean',
    );
    expect(MediaEvidenceSchema.path('itemSnapshot')?.instance).toBe('Mixed');
    expect(MediaEvidenceSchema.path('qualityStatus')?.instance).toBe('String');
    expect(MediaEvidenceSchema.path('qualityHints')?.instance).toBe('Mixed');
    expect(MediaEvidenceSchema.path('metadata')?.instance).toBe('Mixed');
    expect(MediaEvidenceSchema.path('lockedAt')?.instance).toBe('Date');
    expect(MediaEvidenceSchema.path('voidedAt')?.instance).toBe('Date');
    expect(MediaEvidenceSchema.path('deletedAt')?.instance).toBe('Date');

    expect(MediaEvidenceVersionTraceSchema.path('scaleVersion')?.instance).toBe(
      'String',
    );
    expect(MediaStorageSnapshotSchema.path('storageDriver')?.instance).toBe(
      'String',
    );
    expect(MediaStorageSnapshotSchema.path('sizeBytes')?.instance).toBe(
      'Number',
    );
    expect(MediaStorageSnapshotSchema.path('storedAt')?.instance).toBe('Date');
    expect(MediaImageMetadataSchema.path('width')?.instance).toBe('Number');
    expect(MediaImageMetadataSchema.path('height')?.instance).toBe('Number');
    expect(MediaImageMetadataSchema.path('pageNo')?.instance).toBe('Number');
    expect(MediaImageMetadataSchema.path('isColor')?.instance).toBe('Boolean');
    expect(MediaImageMetadataSchema.path('capturedAt')?.instance).toBe('Date');
    expect(HandwritingTraceSnapshotSchema.path('hasTrajectory')?.instance).toBe(
      'Boolean',
    );
    expect(
      HandwritingTraceSnapshotSchema.path('trajectoryFormat')?.instance,
    ).toBe('String');
    expect(HandwritingTraceSnapshotSchema.path('strokeCount')?.instance).toBe(
      'Number',
    );
    expect(HandwritingTraceSnapshotSchema.path('durationMs')?.instance).toBe(
      'Number',
    );
    expect(HandwritingTraceSnapshotSchema.path('canvasWidth')?.instance).toBe(
      'Number',
    );
    expect(HandwritingTraceSnapshotSchema.path('canvasHeight')?.instance).toBe(
      'Number',
    );
    expect(HandwritingTraceSnapshotSchema.path('inputTool')?.instance).toBe(
      'String',
    );
    expect(MediaCaptureContextSchema.path('capturedAt')?.instance).toBe('Date');
    expect(MediaCaptureContextSchema.path('uploadedAt')?.instance).toBe('Date');
    expect(MediaOperatorSnapshotSchema.path('operatorId')?.instance).toBe(
      'ObjectId',
    );
    expect(MediaOperatorSnapshotSchema.path('operatorRole')?.instance).toBe(
      'String',
    );
  });

  it('keeps embedded schemas without nested _id fields', () => {
    expect(MediaEvidenceVersionTraceSchema.get('_id')).toBe(false);
    expect(MediaStorageSnapshotSchema.get('_id')).toBe(false);
    expect(MediaImageMetadataSchema.get('_id')).toBe(false);
    expect(HandwritingTraceSnapshotSchema.get('_id')).toBe(false);
    expect(MediaCaptureContextSchema.get('_id')).toBe(false);
    expect(MediaOperatorSnapshotSchema.get('_id')).toBe(false);
  });
});

describe('MediaEvidenceService', () => {
  let service: MediaEvidenceService;
  let mediaEvidenceModel: {
    findOne: jest.Mock;
    find: jest.Mock;
    findOneAndUpdate: jest.Mock;
    create: jest.Mock;
    deleteOne: jest.Mock;
  };

  beforeEach(async () => {
    mediaEvidenceModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
      create: jest.fn(),
      deleteOne: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MediaEvidenceService,
        {
          provide: getModelToken(MediaEvidence.name),
          useValue: mediaEvidenceModel,
        },
      ],
    }).compile();

    service = moduleRef.get(MediaEvidenceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes evidence code with trim and uppercase', () => {
    expect(service.normalizeEvidenceCode('  evd-test-001  ')).toBe(
      'EVD-TEST-001',
    );
  });

  it('returns null when evidence is not found', async () => {
    mediaEvidenceModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(
      service.findEvidenceByCode('EVD-UNKNOWN-001'),
    ).resolves.toBeNull();
    expect(mediaEvidenceModel.findOne).toHaveBeenCalledWith({
      evidenceCode: 'EVD-UNKNOWN-001',
    });
  });

  it('maps evidence results instead of returning raw documents', async () => {
    const evidenceId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    const itemResponseId = new Types.ObjectId();
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const operatorId = new Types.ObjectId();
    const storedAt = new Date('2026-01-06T08:00:00.000Z');
    const capturedAt = new Date('2026-01-06T08:01:00.000Z');
    const uploadedAt = new Date('2026-01-06T08:02:00.000Z');
    const rawEvidence = createEvidenceFixture({
      _id: evidenceId,
      patientId,
      assessmentVisitId: visitId,
      scaleInstanceId,
      itemResponseId,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      itemCode: 'moca.visuospatial.clock',
      evidenceCode: 'EVD-TEST-002',
      evidenceType: 'handwriting',
      captureMode: 'tablet_handwriting',
      storage: {
        storageDriver: 'fake',
        bucket: 'bucket-test',
        objectKey: 'cogmemory_ad/test/EVD-TEST-002.png',
        objectPrefix: 'cogmemory_ad/test',
        publicUrl: 'public-url-test-placeholder',
        mimeType: 'image/png',
        fileExtension: 'png',
        sizeBytes: 2048,
        checksum: 'checksum-test-002',
        checksumAlgorithm: 'sha256',
        originalFilename: 'test-media-evidence-002.png',
        storedAt,
      },
      imageMetadata: {
        width: 1024,
        height: 768,
        orientation: 'portrait',
        pageNo: 1,
        isColor: true,
        capturedAt,
      },
      captureContext: {
        capturedAt,
        uploadedAt,
        sourceDevice: 'device-test',
        sourceApp: 'app-test',
        captureNote: 'De-identified capture note',
      },
      operatorSnapshot: {
        operatorId,
        operatorName: 'Sample Operator',
        operatorRole: 'doctor',
      },
    });
    mediaEvidenceModel.findOne.mockReturnValue(createExecQuery(rawEvidence));

    const result = await service.findEvidenceByCode(' evd-test-002 ');

    expect(result).toEqual({
      id: evidenceId.toString(),
      patientId: patientId.toString(),
      assessmentVisitId: visitId.toString(),
      scaleInstanceId: scaleInstanceId.toString(),
      itemResponseId: itemResponseId.toString(),
      subjectCode: 'SUBJ-TEST-001',
      scaleDefinitionId: definitionId.toString(),
      scaleVersionId: versionId.toString(),
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode: 'INST-TEST-001',
      itemCode: 'moca.visuospatial.clock',
      evidenceCode: 'EVD-TEST-002',
      evidenceType: 'handwriting',
      captureMode: 'tablet_handwriting',
      status: 'attached',
      storageStatus: 'stored',
      crfCode: 'N1.2.1',
      groupCode: 'visuospatial',
      itemTitle: 'Trail making sample',
      responseType: 'drawing',
      countsTowardTotal: true,
      cognitiveDomainCodes: ['visuospatial'],
      itemSnapshot: { itemCode: 'moca.visuospatial.trail_making' },
      versionTrace: {
        scaleVersion: '1.0',
        crfVersion: 'crf-test-1',
        scoringRuleVersion: 'score-test-1',
        fieldEncodingVersion: 'field-test-1',
        sourceDocument: 'source-test',
      },
      storage: {
        storageDriver: 'fake',
        bucket: 'bucket-test',
        objectKey: 'cogmemory_ad/test/EVD-TEST-002.png',
        objectPrefix: 'cogmemory_ad/test',
        publicUrl: 'public-url-test-placeholder',
        mimeType: 'image/png',
        fileExtension: 'png',
        sizeBytes: 2048,
        checksum: 'checksum-test-002',
        checksumAlgorithm: 'sha256',
        originalFilename: 'test-media-evidence-002.png',
        storedAt,
      },
      imageMetadata: {
        width: 1024,
        height: 768,
        orientation: 'portrait',
        pageNo: 1,
        isColor: true,
        capturedAt,
      },
      handwritingTrace: {
        hasTrajectory: true,
        trajectoryObjectKey: 'cogmemory_ad/test/EVD-TEST-001.trace.json',
        trajectoryFormat: 'json',
        strokeCount: 12,
        durationMs: 90000,
        canvasWidth: 1024,
        canvasHeight: 768,
        deviceType: 'tablet-test',
        inputTool: 'stylus',
      },
      captureContext: {
        capturedAt,
        uploadedAt,
        sourceDevice: 'device-test',
        sourceApp: 'app-test',
        captureNote: 'De-identified capture note',
      },
      operatorSnapshot: {
        operatorId: operatorId.toString(),
        operatorName: 'Sample Operator',
        operatorRole: 'doctor',
      },
      qualityStatus: 'acceptable',
      qualityHints: { requiresReview: false },
      operatorNote: 'De-identified operator note',
      description: 'De-identified evidence description',
      metadata: { source: 'unit-test' },
      lockedAt: null,
      voidedAt: null,
      deletedAt: null,
      createdAt: null,
      updatedAt: null,
    });
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('internalMarker');
    expect(mediaEvidenceModel.findOne).toHaveBeenCalledWith({
      evidenceCode: 'EVD-TEST-002',
    });
  });

  it('lists evidence by item response id ordered by createdAt ascending', async () => {
    const itemResponseId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        createEvidenceFixture({
          itemResponseId,
          itemCode: 'mmse.language.drawing',
          evidenceCode: 'EVD-TEST-003',
        }),
      ]),
    );
    mediaEvidenceModel.find.mockReturnValue({ sort });

    const result = await service.listEvidenceByItemResponseId(itemResponseId);

    expect(mediaEvidenceModel.find).toHaveBeenCalledWith({ itemResponseId });
    expect(sort).toHaveBeenCalledWith({ createdAt: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        itemResponseId: itemResponseId.toString(),
        itemCode: 'mmse.language.drawing',
        evidenceCode: 'EVD-TEST-003',
      }),
    );
    expect(result[0]).not.toHaveProperty('internalMarker');
  });

  it('lists evidence by scale instance id ordered by item code and createdAt', async () => {
    const scaleInstanceId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        createEvidenceFixture({
          scaleInstanceId,
          itemCode: 'moca.visuospatial.clock',
          evidenceCode: 'EVD-TEST-004',
        }),
      ]),
    );
    mediaEvidenceModel.find.mockReturnValue({ sort });

    const result = await service.listEvidenceByScaleInstanceId(scaleInstanceId);

    expect(mediaEvidenceModel.find).toHaveBeenCalledWith({ scaleInstanceId });
    expect(sort).toHaveBeenCalledWith({ itemCode: 1, createdAt: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        scaleInstanceId: scaleInstanceId.toString(),
        itemCode: 'moca.visuospatial.clock',
        evidenceCode: 'EVD-TEST-004',
      }),
    );
  });

  it('lists evidence by visit id ordered by scale instance, item code and createdAt', async () => {
    const assessmentVisitId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        createEvidenceFixture({
          assessmentVisitId,
          evidenceCode: 'EVD-TEST-005',
        }),
      ]),
    );
    mediaEvidenceModel.find.mockReturnValue({ sort });

    const result = await service.listEvidenceByVisitId(assessmentVisitId);

    expect(mediaEvidenceModel.find).toHaveBeenCalledWith({
      assessmentVisitId,
    });
    expect(sort).toHaveBeenCalledWith({
      scaleInstanceId: 1,
      itemCode: 1,
      createdAt: 1,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        assessmentVisitId: assessmentVisitId.toString(),
        evidenceCode: 'EVD-TEST-005',
      }),
    );
  });

  it('lists evidence by patient id ordered by newest createdAt first', async () => {
    const patientId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        createEvidenceFixture({
          patientId,
          evidenceCode: 'EVD-TEST-006',
        }),
      ]),
    );
    mediaEvidenceModel.find.mockReturnValue({ sort });

    const result = await service.listEvidenceByPatientId(patientId);

    expect(mediaEvidenceModel.find).toHaveBeenCalledWith({ patientId });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        patientId: patientId.toString(),
        evidenceCode: 'EVD-TEST-006',
      }),
    );
  });

  it('lists attached evidence by item response id with attached or locked filter', async () => {
    const itemResponseId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(createExecQuery([]));
    mediaEvidenceModel.find.mockReturnValue({ sort });

    const result =
      await service.listAttachedEvidenceByItemResponseId(itemResponseId);

    expect(mediaEvidenceModel.find).toHaveBeenCalledWith({
      itemResponseId,
      status: { $in: ['attached', 'locked'] },
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: 1 });
    expect(result).toEqual([]);
  });

  it('queries list and single evidence with the complete ownership chain', async () => {
    const ownership = {
      patientId: new Types.ObjectId(),
      assessmentVisitId: new Types.ObjectId(),
      scaleInstanceId: new Types.ObjectId(),
      itemResponseId: new Types.ObjectId(),
    };
    const mediaEvidenceId = new Types.ObjectId();
    const rawEvidence = createEvidenceFixture({
      _id: mediaEvidenceId,
      ...ownership,
    });
    mediaEvidenceModel.findOne.mockReturnValue(createExecQuery(rawEvidence));

    const found = await service.findEvidenceByOwnership(
      ownership,
      mediaEvidenceId,
    );

    expect(found?.id).toBe(mediaEvidenceId.toString());
    expect(mediaEvidenceModel.findOne).toHaveBeenCalledWith({
      _id: mediaEvidenceId,
      ...ownership,
      status: { $ne: 'deleted' },
      deletedAt: null,
    });

    const sort = jest.fn().mockReturnValue(createExecQuery([rawEvidence]));
    mediaEvidenceModel.find.mockReturnValue({ sort });
    await service.listEvidenceByItemOwnership(ownership);
    expect(mediaEvidenceModel.find).toHaveBeenCalledWith({
      ...ownership,
      status: { $ne: 'deleted' },
      deletedAt: null,
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
  });

  it('finds only attached or locked active evidence for the same type', async () => {
    const ownership = {
      patientId: new Types.ObjectId(),
      assessmentVisitId: new Types.ObjectId(),
      scaleInstanceId: new Types.ObjectId(),
      itemResponseId: new Types.ObjectId(),
    };
    const sort = jest.fn().mockReturnValue(createExecQuery(null));
    mediaEvidenceModel.findOne.mockReturnValue({ sort });

    await expect(
      service.findActiveEvidenceByItemAndType(ownership, 'photo'),
    ).resolves.toBeNull();
    expect(mediaEvidenceModel.findOne).toHaveBeenCalledWith({
      ...ownership,
      evidenceType: 'photo',
      status: { $in: ['attached', 'locked'] },
      deletedAt: null,
    });
  });

  it('creates, conditionally voids and deletes only by compensation id', async () => {
    const rawEvidence = createEvidenceFixture();
    mediaEvidenceModel.create.mockResolvedValue(rawEvidence);
    const created = await service.createEvidence(
      rawEvidence as CreateMediaEvidenceInput,
    );
    expect(created.evidenceCode).toBe('EVD-TEST-001');

    const ownership = {
      patientId: rawEvidence.patientId,
      assessmentVisitId: rawEvidence.assessmentVisitId,
      scaleInstanceId: rawEvidence.scaleInstanceId,
      itemResponseId: rawEvidence.itemResponseId,
    };
    mediaEvidenceModel.findOneAndUpdate.mockReturnValue(
      createExecQuery({ ...rawEvidence, status: 'voided' }),
    );
    const voidedAt = new Date('2026-07-10T09:00:00.000Z');
    const metadata = {
      voidReason: 'wrong capture',
      voidedBy: new Types.ObjectId().toString(),
      voidedAt: voidedAt.toISOString(),
    };
    const voided = await service.markEvidenceVoided(
      ownership,
      rawEvidence._id,
      voidedAt,
      metadata,
    );
    expect(voided?.status).toBe('voided');
    expect(mediaEvidenceModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: rawEvidence._id,
        ...ownership,
        status: 'attached',
        deletedAt: null,
      },
      { $set: { status: 'voided', voidedAt, metadata } },
      { returnDocument: 'after', runValidators: true },
    );

    mediaEvidenceModel.deleteOne.mockReturnValue(
      createExecQuery({ deletedCount: 1 }),
    );
    await expect(
      service.deleteEvidenceForCompensation(rawEvidence._id),
    ).resolves.toBe(true);
    expect(mediaEvidenceModel.deleteOne).toHaveBeenCalledWith({
      _id: rawEvidence._id,
    });
  });
});
