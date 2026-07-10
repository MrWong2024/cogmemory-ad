import { Types } from 'mongoose';
import type { MediaEvidenceSummary } from './media-evidence.service';
import { toMediaEvidenceResponse } from './media-evidence-public.mapper';

function fixture(): MediaEvidenceSummary {
  const now = new Date('2026-07-10T08:00:00.000Z');
  return {
    id: new Types.ObjectId().toString(),
    patientId: new Types.ObjectId().toString(),
    assessmentVisitId: new Types.ObjectId().toString(),
    scaleInstanceId: new Types.ObjectId().toString(),
    itemResponseId: new Types.ObjectId().toString(),
    subjectCode: 'SUBJ-A15-TEST-001',
    scaleDefinitionId: new Types.ObjectId().toString(),
    scaleVersionId: new Types.ObjectId().toString(),
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: 'INST-A15-TEST-001',
    itemCode: 'moca.visuospatial.clock',
    evidenceCode: 'EVD-A15TEST001',
    evidenceType: 'handwriting',
    captureMode: 'tablet_handwriting',
    status: 'attached',
    storageStatus: 'stored',
    crfCode: 'N1.2.3',
    groupCode: 'visuospatial',
    itemTitle: 'Clock drawing',
    responseType: 'drawing',
    countsTowardTotal: true,
    cognitiveDomainCodes: ['visuospatial'],
    itemSnapshot: { expectedValue: 'must-not-leak' },
    versionTrace: { scoringRuleVersion: 'must-not-leak' },
    storage: {
      storageDriver: 'fake',
      bucket: 'must-not-leak',
      objectKey: 'must-not-leak',
      objectPrefix: 'must-not-leak',
      publicUrl: 'must-not-leak',
      mimeType: 'image/png',
      fileExtension: 'png',
      sizeBytes: Number.POSITIVE_INFINITY,
      checksum: 'must-not-leak',
      checksumAlgorithm: 'sha256',
      originalFilename: 'must-not-leak.png',
      storedAt: now,
    },
    imageMetadata: {
      width: Number.NaN,
      height: 768,
      orientation: 'portrait',
      pageNo: 1,
      isColor: true,
      capturedAt: now,
    },
    handwritingTrace: {
      hasTrajectory: true,
      trajectoryObjectKey: 'must-not-leak',
      trajectoryFormat: 'strokes',
      strokeCount: 12,
      durationMs: Number.NEGATIVE_INFINITY,
      canvasWidth: 1024,
      canvasHeight: 768,
      deviceType: 'test-tablet',
      inputTool: 'stylus',
    },
    captureContext: {
      capturedAt: now,
      uploadedAt: now,
      sourceDevice: 'test-tablet',
      sourceApp: 'test-app',
      captureNote: 'De-identified capture',
    },
    operatorSnapshot: {
      operatorId: new Types.ObjectId().toString(),
      operatorName: 'A15 Test Operator',
      operatorRole: 'doctor',
    },
    qualityStatus: 'unchecked',
    qualityHints: { mustNotLeak: true },
    operatorNote: 'De-identified note',
    description: 'De-identified evidence',
    metadata: { mustNotLeak: true },
    lockedAt: null,
    voidedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('toMediaEvidenceResponse', () => {
  it('maps only public fields and normalizes non-finite numbers', () => {
    const response = toMediaEvidenceResponse(fixture());

    expect(response.evidenceType).toBe('handwriting');
    expect(response.itemCode).toBe('moca.visuospatial.clock');
    expect(response.file?.mimeType).toBe('image/png');
    expect(response.file?.sizeBytes).toBeNull();
    expect(response.imageMetadata?.width).toBeNull();
    expect(response.imageMetadata?.height).toBe(768);
    expect(response.handwritingTrace?.hasTrajectory).toBe(true);
    expect(response.handwritingTrace?.durationMs).toBeNull();

    const serialized = JSON.stringify(response);
    for (const forbidden of [
      'patientId',
      'assessmentVisitId',
      'scaleInstanceId',
      'itemResponseId',
      'subjectCode',
      'scaleDefinitionId',
      'scaleVersionId',
      'instanceCode',
      'itemSnapshot',
      'versionTrace',
      'qualityHints',
      'metadata',
      'objectKey',
      'trajectoryObjectKey',
      'bucket',
      'objectPrefix',
      'originalFilename',
      'checksum',
      'publicUrl',
      'deletedAt',
      'expectedValue',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
