// backend/src/modules/media/services/media-evidence.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  HandwritingInputTool,
  HandwritingTraceSnapshot,
  HandwritingTrajectoryFormat,
  MediaCaptureContext,
  MediaCaptureMode,
  MediaEvidence,
  MediaEvidenceDocument,
  MediaEvidenceMetadata,
  MediaEvidenceStatus,
  MediaEvidenceType,
  MediaEvidenceVersionTrace,
  MediaImageMetadata,
  MediaItemSnapshot,
  MediaOperatorRole,
  MediaOperatorSnapshot,
  MediaQualityHints,
  MediaQualityStatus,
  MediaResponseType,
  MediaStorageDriver,
  MediaStorageSnapshot,
  MediaStorageStatus,
} from '../schemas/media-evidence.schema';

export type MediaEvidenceVersionTraceSummary = {
  scaleVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  sourceDocument?: string;
};

export type MediaStorageSummary = {
  storageDriver: MediaStorageDriver;
  bucket?: string;
  objectKey?: string;
  objectPrefix?: string;
  publicUrl?: string;
  mimeType?: string;
  fileExtension?: string;
  sizeBytes: number | null;
  checksum?: string;
  checksumAlgorithm?: string;
  originalFilename?: string;
  storedAt: Date | null;
};

export type MediaImageMetadataSummary = {
  width: number | null;
  height: number | null;
  orientation?: string;
  pageNo: number | null;
  isColor: boolean | null;
  capturedAt: Date | null;
};

export type HandwritingTraceSummary = {
  hasTrajectory: boolean;
  trajectoryObjectKey?: string;
  trajectoryFormat: HandwritingTrajectoryFormat;
  strokeCount: number | null;
  durationMs: number | null;
  canvasWidth: number | null;
  canvasHeight: number | null;
  deviceType?: string;
  inputTool: HandwritingInputTool;
};

export type MediaCaptureContextSummary = {
  capturedAt: Date | null;
  uploadedAt: Date | null;
  sourceDevice?: string;
  sourceApp?: string;
  captureNote?: string;
};

export type MediaOperatorSnapshotSummary = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: MediaOperatorRole;
};

export type MediaEvidenceSummary = {
  id: string;
  patientId: string;
  assessmentVisitId: string;
  scaleInstanceId: string;
  itemResponseId: string;
  subjectCode: string;
  scaleDefinitionId: string;
  scaleVersionId: string;
  scaleCode: string;
  scaleVersion: string;
  instanceCode: string;
  itemCode: string;
  evidenceCode: string;
  evidenceType: MediaEvidenceType;
  captureMode: MediaCaptureMode;
  status: MediaEvidenceStatus;
  storageStatus: MediaStorageStatus;
  crfCode?: string;
  groupCode?: string;
  itemTitle?: string;
  responseType?: MediaResponseType;
  countsTowardTotal: boolean | null;
  cognitiveDomainCodes: string[];
  itemSnapshot: MediaItemSnapshot;
  versionTrace: MediaEvidenceVersionTraceSummary | null;
  storage: MediaStorageSummary | null;
  imageMetadata: MediaImageMetadataSummary | null;
  handwritingTrace: HandwritingTraceSummary | null;
  captureContext: MediaCaptureContextSummary | null;
  operatorSnapshot: MediaOperatorSnapshotSummary | null;
  qualityStatus: MediaQualityStatus;
  qualityHints: MediaQualityHints;
  operatorNote?: string;
  description?: string;
  metadata: MediaEvidenceMetadata;
  lockedAt: Date | null;
  voidedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type MediaEvidenceSourceFreezeItem = {
  id: string;
  patientId: string;
  assessmentVisitId: string;
  scaleInstanceId: string;
  itemResponseId: string;
  status: MediaEvidenceStatus;
  storageStatus: MediaStorageStatus;
  lockedAt: Date | null;
  voidedAt: Date | null;
  deletedAt: Date | null;
};

export type MediaEvidenceSourceFreezeBatchResult = {
  requestedCount: number;
  matchedCount: number;
  newlyFrozenCount: number;
  previouslyFrozenCount: number;
  invalidCount: number;
  items: MediaEvidenceSourceFreezeItem[];
};

export type MediaEvidenceOwnership = {
  patientId: Types.ObjectId | string;
  assessmentVisitId: Types.ObjectId | string;
  scaleInstanceId: Types.ObjectId | string;
  itemResponseId: Types.ObjectId | string;
};

export type CreateMediaEvidenceInput = {
  patientId: Types.ObjectId;
  assessmentVisitId: Types.ObjectId;
  scaleInstanceId: Types.ObjectId;
  itemResponseId: Types.ObjectId;
  subjectCode: string;
  scaleDefinitionId: Types.ObjectId;
  scaleVersionId: Types.ObjectId;
  scaleCode: string;
  scaleVersion: string;
  instanceCode: string;
  itemCode: string;
  evidenceCode: string;
  evidenceType: MediaEvidenceType;
  captureMode: MediaCaptureMode;
  status: MediaEvidenceStatus;
  storageStatus: MediaStorageStatus;
  crfCode?: string;
  groupCode?: string;
  itemTitle?: string;
  responseType?: MediaResponseType;
  countsTowardTotal: boolean;
  cognitiveDomainCodes: string[];
  itemSnapshot: MediaItemSnapshot;
  versionTrace: MediaEvidenceVersionTrace | null;
  storage: MediaStorageSnapshot;
  imageMetadata: MediaImageMetadata;
  handwritingTrace: HandwritingTraceSnapshot | null;
  captureContext: MediaCaptureContext;
  operatorSnapshot: MediaOperatorSnapshot;
  qualityStatus: MediaQualityStatus;
  qualityHints: MediaQualityHints;
  operatorNote?: string;
  description?: string;
  metadata: MediaEvidenceMetadata;
  lockedAt: Date | null;
  voidedAt: Date | null;
  deletedAt: Date | null;
};

type NormalizedMediaEvidenceOwnership = {
  patientId: Types.ObjectId;
  assessmentVisitId: Types.ObjectId;
  scaleInstanceId: Types.ObjectId;
  itemResponseId: Types.ObjectId;
};

@Injectable()
export class MediaEvidenceService {
  constructor(
    @InjectModel(MediaEvidence.name)
    private readonly mediaEvidenceModel: Model<MediaEvidenceDocument>,
  ) {}

  normalizeEvidenceCode(evidenceCode: string): string {
    return evidenceCode.trim().toUpperCase();
  }

  async findEvidenceByCode(
    evidenceCode: string,
  ): Promise<MediaEvidenceSummary | null> {
    const normalizedCode = this.normalizeEvidenceCode(evidenceCode);

    if (!normalizedCode) {
      return null;
    }

    const evidence = await this.mediaEvidenceModel
      .findOne({ evidenceCode: normalizedCode })
      .exec();

    if (!evidence) {
      return null;
    }

    return this.mapEvidence(evidence);
  }

  async listEvidenceByItemResponseId(
    itemResponseId: Types.ObjectId | string,
  ): Promise<MediaEvidenceSummary[]> {
    const normalizedId = this.normalizeObjectId(itemResponseId);

    if (!normalizedId) {
      return [];
    }

    const evidences = await this.mediaEvidenceModel
      .find({ itemResponseId: normalizedId })
      .sort({ createdAt: 1 })
      .exec();

    return evidences.map((evidence) => this.mapEvidence(evidence));
  }

  async listEvidenceByScaleInstanceId(
    scaleInstanceId: Types.ObjectId | string,
  ): Promise<MediaEvidenceSummary[]> {
    const normalizedId = this.normalizeObjectId(scaleInstanceId);

    if (!normalizedId) {
      return [];
    }

    const evidences = await this.mediaEvidenceModel
      .find({ scaleInstanceId: normalizedId })
      .sort({ itemCode: 1, createdAt: 1 })
      .exec();

    return evidences.map((evidence) => this.mapEvidence(evidence));
  }

  async listEvidenceByVisitId(
    assessmentVisitId: Types.ObjectId | string,
  ): Promise<MediaEvidenceSummary[]> {
    const normalizedId = this.normalizeObjectId(assessmentVisitId);

    if (!normalizedId) {
      return [];
    }

    const evidences = await this.mediaEvidenceModel
      .find({ assessmentVisitId: normalizedId })
      .sort({ scaleInstanceId: 1, itemCode: 1, createdAt: 1 })
      .exec();

    return evidences.map((evidence) => this.mapEvidence(evidence));
  }

  async listEvidenceByPatientId(
    patientId: Types.ObjectId | string,
  ): Promise<MediaEvidenceSummary[]> {
    const normalizedId = this.normalizeObjectId(patientId);

    if (!normalizedId) {
      return [];
    }

    const evidences = await this.mediaEvidenceModel
      .find({ patientId: normalizedId })
      .sort({ createdAt: -1 })
      .exec();

    return evidences.map((evidence) => this.mapEvidence(evidence));
  }

  async listAttachedEvidenceByItemResponseId(
    itemResponseId: Types.ObjectId | string,
  ): Promise<MediaEvidenceSummary[]> {
    const normalizedId = this.normalizeObjectId(itemResponseId);

    if (!normalizedId) {
      return [];
    }

    const evidences = await this.mediaEvidenceModel
      .find({
        itemResponseId: normalizedId,
        status: { $in: ['attached', 'locked'] },
      })
      .sort({ createdAt: 1 })
      .exec();

    return evidences.map((evidence) => this.mapEvidence(evidence));
  }

  async findEvidenceByOwnership(
    ownership: MediaEvidenceOwnership,
    mediaEvidenceId: Types.ObjectId | string,
  ): Promise<MediaEvidenceSummary | null> {
    const normalizedOwnership = this.normalizeOwnership(ownership);
    const normalizedEvidenceId = this.normalizeObjectId(mediaEvidenceId);

    if (!normalizedOwnership || !normalizedEvidenceId) {
      return null;
    }

    const evidence = await this.mediaEvidenceModel
      .findOne({
        _id: normalizedEvidenceId,
        ...normalizedOwnership,
        status: { $ne: 'deleted' },
        deletedAt: null,
      })
      .exec();

    return evidence ? this.mapEvidence(evidence) : null;
  }

  async listMediaEvidenceByIds(
    patientId: Types.ObjectId | string,
    assessmentVisitId: Types.ObjectId | string,
    scaleInstanceIds: readonly string[],
    mediaEvidenceIds: readonly string[],
  ): Promise<MediaEvidenceSummary[]> {
    const normalizedPatientId = this.normalizeObjectId(patientId);
    const normalizedVisitId = this.normalizeObjectId(assessmentVisitId);
    const normalizedScaleIds = this.normalizeObjectIds(scaleInstanceIds);
    const normalizedEvidenceIds = this.normalizeObjectIds(mediaEvidenceIds);
    if (
      !normalizedPatientId ||
      !normalizedVisitId ||
      !normalizedScaleIds ||
      !normalizedEvidenceIds
    ) {
      return [];
    }
    const evidence = await this.mediaEvidenceModel
      .find({
        _id: { $in: normalizedEvidenceIds },
        patientId: normalizedPatientId,
        assessmentVisitId: normalizedVisitId,
        scaleInstanceId: { $in: normalizedScaleIds },
      })
      .sort({ _id: 1 })
      .exec();
    return evidence.map((item) => this.mapEvidence(item));
  }

  async freezeMediaEvidenceByIds(
    patientId: Types.ObjectId | string,
    assessmentVisitId: Types.ObjectId | string,
    scaleInstanceIds: readonly string[],
    mediaEvidenceIds: readonly string[],
    sourceLockedAt: Date,
  ): Promise<MediaEvidenceSourceFreezeBatchResult> {
    const normalizedPatientId = this.normalizeObjectId(patientId);
    const normalizedVisitId = this.normalizeObjectId(assessmentVisitId);
    const normalizedScaleIds = this.normalizeObjectIds(scaleInstanceIds);
    const normalizedEvidenceIds = this.normalizeObjectIds(mediaEvidenceIds);
    if (
      !normalizedPatientId ||
      !normalizedVisitId ||
      !normalizedScaleIds ||
      !normalizedEvidenceIds ||
      !Number.isFinite(sourceLockedAt.getTime())
    ) {
      return this.emptySourceFreezeResult(mediaEvidenceIds.length);
    }
    const ownership = {
      _id: { $in: normalizedEvidenceIds },
      patientId: normalizedPatientId,
      assessmentVisitId: normalizedVisitId,
      scaleInstanceId: { $in: normalizedScaleIds },
    };
    const before = await this.mediaEvidenceModel.find(ownership).exec();
    const previouslyFrozenCount = before.filter(
      (item) => item.status === 'locked' && item.lockedAt instanceof Date,
    ).length;
    const updateResult = await this.mediaEvidenceModel
      .updateMany(
        {
          ...ownership,
          status: 'attached',
          storageStatus: 'stored',
          lockedAt: null,
          voidedAt: null,
          deletedAt: null,
        },
        { $set: { status: 'locked', lockedAt: sourceLockedAt } },
        { runValidators: true },
      )
      .exec();
    const after = await this.mediaEvidenceModel
      .find(ownership)
      .sort({ _id: 1 })
      .exec();
    const items = after.map((item) => ({
      id: item._id.toString(),
      patientId: item.patientId.toString(),
      assessmentVisitId: item.assessmentVisitId.toString(),
      scaleInstanceId: item.scaleInstanceId.toString(),
      itemResponseId: item.itemResponseId.toString(),
      status: item.status,
      storageStatus: item.storageStatus,
      lockedAt: item.lockedAt ?? null,
      voidedAt: item.voidedAt ?? null,
      deletedAt: item.deletedAt ?? null,
    }));
    const validCount = items.filter(
      (item) =>
        item.status === 'locked' &&
        item.storageStatus === 'stored' &&
        item.lockedAt !== null &&
        item.voidedAt === null &&
        item.deletedAt === null,
    ).length;
    return {
      requestedCount: normalizedEvidenceIds.length,
      matchedCount: items.length,
      newlyFrozenCount: updateResult.modifiedCount,
      previouslyFrozenCount,
      invalidCount: normalizedEvidenceIds.length - validCount,
      items,
    };
  }

  async listEvidenceByItemOwnership(
    ownership: MediaEvidenceOwnership,
  ): Promise<MediaEvidenceSummary[]> {
    const normalizedOwnership = this.normalizeOwnership(ownership);

    if (!normalizedOwnership) {
      return [];
    }

    const evidences = await this.mediaEvidenceModel
      .find({
        ...normalizedOwnership,
        status: { $ne: 'deleted' },
        deletedAt: null,
      })
      .sort({ createdAt: 1, _id: 1 })
      .exec();

    return evidences.map((evidence) => this.mapEvidence(evidence));
  }

  async findActiveEvidenceByItemAndType(
    ownership: MediaEvidenceOwnership,
    evidenceType: MediaEvidenceType,
  ): Promise<MediaEvidenceSummary | null> {
    const normalizedOwnership = this.normalizeOwnership(ownership);

    if (!normalizedOwnership) {
      return null;
    }

    const evidence = await this.mediaEvidenceModel
      .findOne({
        ...normalizedOwnership,
        evidenceType,
        status: { $in: ['attached', 'locked'] },
        deletedAt: null,
      })
      .sort({ createdAt: 1, _id: 1 })
      .exec();

    return evidence ? this.mapEvidence(evidence) : null;
  }

  async createEvidence(
    input: CreateMediaEvidenceInput,
  ): Promise<MediaEvidenceSummary> {
    const evidence = await this.mediaEvidenceModel.create(input);
    return this.mapEvidence(evidence);
  }

  async markEvidenceVoided(
    ownership: MediaEvidenceOwnership,
    mediaEvidenceId: Types.ObjectId | string,
    voidedAt: Date,
    metadata: MediaEvidenceMetadata,
  ): Promise<MediaEvidenceSummary | null> {
    const normalizedOwnership = this.normalizeOwnership(ownership);
    const normalizedEvidenceId = this.normalizeObjectId(mediaEvidenceId);

    if (!normalizedOwnership || !normalizedEvidenceId) {
      return null;
    }

    const evidence = await this.mediaEvidenceModel
      .findOneAndUpdate(
        {
          _id: normalizedEvidenceId,
          ...normalizedOwnership,
          status: 'attached',
          lockedAt: null,
          voidedAt: null,
          deletedAt: null,
        },
        {
          $set: {
            status: 'voided',
            voidedAt,
            metadata,
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    return evidence ? this.mapEvidence(evidence) : null;
  }

  async deleteEvidenceForCompensation(
    mediaEvidenceId: Types.ObjectId | string,
  ): Promise<boolean> {
    const normalizedEvidenceId = this.normalizeObjectId(mediaEvidenceId);

    if (!normalizedEvidenceId) {
      return false;
    }

    const result = await this.mediaEvidenceModel
      .deleteOne({ _id: normalizedEvidenceId })
      .exec();

    return result.deletedCount === 1;
  }

  private normalizeOwnership(
    ownership: MediaEvidenceOwnership,
  ): NormalizedMediaEvidenceOwnership | null {
    const patientId = this.normalizeObjectId(ownership.patientId);
    const assessmentVisitId = this.normalizeObjectId(
      ownership.assessmentVisitId,
    );
    const scaleInstanceId = this.normalizeObjectId(ownership.scaleInstanceId);
    const itemResponseId = this.normalizeObjectId(ownership.itemResponseId);

    if (
      !patientId ||
      !assessmentVisitId ||
      !scaleInstanceId ||
      !itemResponseId
    ) {
      return null;
    }

    return { patientId, assessmentVisitId, scaleInstanceId, itemResponseId };
  }

  private normalizeObjectId(
    id: Types.ObjectId | string,
  ): Types.ObjectId | null {
    if (id instanceof Types.ObjectId) {
      return id;
    }

    const normalizedId = id.trim();

    if (!normalizedId || !Types.ObjectId.isValid(normalizedId)) {
      return null;
    }

    const objectId = new Types.ObjectId(normalizedId);

    if (objectId.toString() !== normalizedId.toLowerCase()) {
      return null;
    }

    return objectId;
  }

  private normalizeObjectIds(ids: readonly string[]): Types.ObjectId[] | null {
    const result: Types.ObjectId[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const normalized = this.normalizeObjectId(id);
      if (!normalized || seen.has(normalized.toString())) {
        return null;
      }
      seen.add(normalized.toString());
      result.push(normalized);
    }
    return result;
  }

  private emptySourceFreezeResult(
    requestedCount: number,
  ): MediaEvidenceSourceFreezeBatchResult {
    return {
      requestedCount,
      matchedCount: 0,
      newlyFrozenCount: 0,
      previouslyFrozenCount: 0,
      invalidCount: requestedCount,
      items: [],
    };
  }

  private mapEvidence(evidence: MediaEvidenceDocument): MediaEvidenceSummary {
    return {
      id: evidence._id.toString(),
      patientId: evidence.patientId.toString(),
      assessmentVisitId: evidence.assessmentVisitId.toString(),
      scaleInstanceId: evidence.scaleInstanceId.toString(),
      itemResponseId: evidence.itemResponseId.toString(),
      subjectCode: evidence.subjectCode,
      scaleDefinitionId: evidence.scaleDefinitionId.toString(),
      scaleVersionId: evidence.scaleVersionId.toString(),
      scaleCode: evidence.scaleCode,
      scaleVersion: evidence.scaleVersion,
      instanceCode: evidence.instanceCode,
      itemCode: evidence.itemCode,
      evidenceCode: evidence.evidenceCode,
      evidenceType: evidence.evidenceType,
      captureMode: evidence.captureMode,
      status: evidence.status,
      storageStatus: evidence.storageStatus,
      crfCode: evidence.crfCode,
      groupCode: evidence.groupCode,
      itemTitle: evidence.itemTitle,
      responseType: evidence.responseType,
      countsTowardTotal: evidence.countsTowardTotal ?? null,
      cognitiveDomainCodes: [...(evidence.cognitiveDomainCodes ?? [])],
      itemSnapshot: evidence.itemSnapshot ?? null,
      versionTrace: this.mapVersionTrace(evidence.versionTrace),
      storage: this.mapStorage(evidence.storage),
      imageMetadata: this.mapImageMetadata(evidence.imageMetadata),
      handwritingTrace: this.mapHandwritingTrace(evidence.handwritingTrace),
      captureContext: this.mapCaptureContext(evidence.captureContext),
      operatorSnapshot: this.mapOperatorSnapshot(evidence.operatorSnapshot),
      qualityStatus: evidence.qualityStatus,
      qualityHints: evidence.qualityHints ?? null,
      operatorNote: evidence.operatorNote,
      description: evidence.description,
      metadata: evidence.metadata ?? null,
      lockedAt: evidence.lockedAt ?? null,
      voidedAt: evidence.voidedAt ?? null,
      deletedAt: evidence.deletedAt ?? null,
      createdAt: this.readDocumentDate(evidence, 'createdAt'),
      updatedAt: this.readDocumentDate(evidence, 'updatedAt'),
    };
  }

  private readDocumentDate(
    evidence: MediaEvidenceDocument,
    propertyName: 'createdAt' | 'updatedAt',
  ): Date | null {
    const value: unknown =
      typeof evidence.get === 'function'
        ? evidence.get(propertyName)
        : Object.getOwnPropertyDescriptor(evidence, propertyName)?.value;
    return value instanceof Date ? value : null;
  }

  private mapVersionTrace(
    versionTrace?: MediaEvidenceVersionTrace | null,
  ): MediaEvidenceVersionTraceSummary | null {
    if (!versionTrace) {
      return null;
    }

    return {
      scaleVersion: versionTrace.scaleVersion,
      crfVersion: versionTrace.crfVersion,
      scoringRuleVersion: versionTrace.scoringRuleVersion,
      fieldEncodingVersion: versionTrace.fieldEncodingVersion,
      sourceDocument: versionTrace.sourceDocument,
    };
  }

  private mapStorage(
    storage?: MediaStorageSnapshot | null,
  ): MediaStorageSummary | null {
    if (!storage) {
      return null;
    }

    return {
      storageDriver: storage.storageDriver,
      bucket: storage.bucket,
      objectKey: storage.objectKey,
      objectPrefix: storage.objectPrefix,
      publicUrl: storage.publicUrl,
      mimeType: storage.mimeType,
      fileExtension: storage.fileExtension,
      sizeBytes: storage.sizeBytes ?? null,
      checksum: storage.checksum,
      checksumAlgorithm: storage.checksumAlgorithm,
      originalFilename: storage.originalFilename,
      storedAt: storage.storedAt ?? null,
    };
  }

  private mapImageMetadata(
    imageMetadata?: MediaImageMetadata | null,
  ): MediaImageMetadataSummary | null {
    if (!imageMetadata) {
      return null;
    }

    return {
      width: imageMetadata.width ?? null,
      height: imageMetadata.height ?? null,
      orientation: imageMetadata.orientation,
      pageNo: imageMetadata.pageNo ?? null,
      isColor: imageMetadata.isColor ?? null,
      capturedAt: imageMetadata.capturedAt ?? null,
    };
  }

  private mapHandwritingTrace(
    handwritingTrace?: HandwritingTraceSnapshot | null,
  ): HandwritingTraceSummary | null {
    if (!handwritingTrace) {
      return null;
    }

    return {
      hasTrajectory: handwritingTrace.hasTrajectory,
      trajectoryObjectKey: handwritingTrace.trajectoryObjectKey,
      trajectoryFormat: handwritingTrace.trajectoryFormat,
      strokeCount: handwritingTrace.strokeCount ?? null,
      durationMs: handwritingTrace.durationMs ?? null,
      canvasWidth: handwritingTrace.canvasWidth ?? null,
      canvasHeight: handwritingTrace.canvasHeight ?? null,
      deviceType: handwritingTrace.deviceType,
      inputTool: handwritingTrace.inputTool,
    };
  }

  private mapCaptureContext(
    captureContext?: MediaCaptureContext | null,
  ): MediaCaptureContextSummary | null {
    if (!captureContext) {
      return null;
    }

    return {
      capturedAt: captureContext.capturedAt ?? null,
      uploadedAt: captureContext.uploadedAt ?? null,
      sourceDevice: captureContext.sourceDevice,
      sourceApp: captureContext.sourceApp,
      captureNote: captureContext.captureNote,
    };
  }

  private mapOperatorSnapshot(
    operatorSnapshot?: MediaOperatorSnapshot | null,
  ): MediaOperatorSnapshotSummary | null {
    if (!operatorSnapshot) {
      return null;
    }

    return {
      operatorId: operatorSnapshot.operatorId?.toString() ?? null,
      operatorName: operatorSnapshot.operatorName,
      operatorRole: operatorSnapshot.operatorRole,
    };
  }
}
