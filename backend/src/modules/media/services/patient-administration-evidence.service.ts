import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import {
  PATIENT_ADMINISTRATION_EVIDENCE_TYPES,
  type PatientAdministrationEvidenceType,
} from '../../assessments/patient-administration.constants';
import { normalizeItemResponseSubmissionWriteBarrier } from '../../assessments/lib/scale-instance-submission-write-barrier';
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
  UploadedFileResult,
} from '../../storage/storage.interface';
import type { UploadPatientAdministrationEvidenceDto } from '../dto/upload-patient-administration-evidence.dto';
import {
  MediaFileValidationError,
  validatePrimaryMediaFile,
  type ValidatedPrimaryMediaFile,
} from '../lib/media-file-validation';
import {
  validatePatientAudioFile,
  type ValidatedPatientAudioFile,
} from '../lib/patient-audio-file-validation';
import type { MediaCaptureMode } from '../schemas/media-evidence.schema';
import {
  MediaEvidenceService,
  type CreateMediaEvidenceInput,
  type MediaEvidenceSummary,
} from './media-evidence.service';
import type { PatientAdministrationEvidenceResponse } from '../types/patient-administration-evidence-response.types';
import type { UploadedMemoryFile } from '../types/uploaded-memory-file.types';

const EDITABLE_ITEM_RESPONSE_STATUSES = new Set([
  'not_started',
  'in_progress',
  'answered',
]);
const CAPTURED_AT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

type ValidatedPatientEvidenceFile =
  | ValidatedPrimaryMediaFile
  | ValidatedPatientAudioFile;

@Injectable()
export class PatientAdministrationEvidenceService {
  private readonly logger = new Logger(
    PatientAdministrationEvidenceService.name,
  );

  constructor(
    private readonly patientAdministrationSessionService: PatientAdministrationSessionService,
    private readonly assessmentsService: AssessmentsService,
    private readonly mediaEvidenceService: MediaEvidenceService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageService,
    private readonly storageConfigService: StorageConfigService,
  ) {}

  async uploadEvidence(
    requestContext: PatientAdministrationRequestContext,
    input: UploadPatientAdministrationEvidenceDto,
    file: UploadedMemoryFile | undefined,
  ): Promise<PatientAdministrationEvidenceResponse> {
    this.assertEvidenceType(input.evidenceType);
    const uploadContext =
      await this.patientAdministrationSessionService.prepareCurrentEvidenceUpload(
        requestContext,
        input.expectedRevision,
        input.evidenceType,
      );
    this.assertDuration(input);
    const capturedAt = this.parseCapturedAt(input.capturedAt);
    const itemResponse =
      await this.assessmentsService.findItemResponseByScaleInstanceAndItemCode(
        uploadContext.scaleInstanceId,
        uploadContext.itemCode,
      );
    this.assertItemResponse(itemResponse, uploadContext);

    if (!file) {
      throw new BadRequestException({
        code: 'MEDIA_PRIMARY_FILE_REQUIRED',
        message: 'A primary media file is required',
      });
    }
    const validatedFile = this.validateFile(file, input.evidenceType);
    const objectPrefix = this.requireSafeObjectPrefix();
    const evidenceCode = `EVD-${randomUUID().replace(/-/g, '').toUpperCase()}`;
    const objectKey = this.createObjectKey(
      objectPrefix,
      uploadContext,
      itemResponse.id,
      evidenceCode,
      validatedFile.fileExtension,
    );
    let uploaded: UploadedFileResult;

    try {
      uploaded = await this.storageService.uploadFile({
        objectKey,
        buffer: validatedFile.sanitizedBuffer,
        sizeBytes: validatedFile.sizeBytes,
        mimeType: validatedFile.detectedMimeType,
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'MEDIA_STORAGE_UNAVAILABLE',
        message: 'Media storage is unavailable',
      });
    }

    const uploadedAt = new Date();
    let evidence: MediaEvidenceSummary;
    try {
      evidence = await this.mediaEvidenceService.createEvidence(
        this.buildCreateInput({
          uploadContext,
          itemResponse,
          input,
          validatedFile,
          uploaded,
          objectPrefix,
          evidenceCode,
          capturedAt,
          uploadedAt,
        }),
      );
    } catch {
      await this.compensateStorage(uploaded.objectKey, evidenceCode);
      throw new InternalServerErrorException({
        code: 'MEDIA_EVIDENCE_CREATE_FAILED',
        message: 'Media evidence could not be created',
      });
    }

    let revision: number;
    try {
      revision =
        await this.patientAdministrationSessionService.attachCurrentStepEvidence(
          {
            uploadContext,
            mediaEvidenceId: evidence.id,
            evidenceType: input.evidenceType,
            uploadedAt,
          },
        );
    } catch (error: unknown) {
      await this.compensateEvidenceAndStorage(
        evidence.id,
        uploaded.objectKey,
        evidenceCode,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        code: 'MEDIA_EVIDENCE_CREATE_FAILED',
        message: 'Media evidence could not be associated',
      });
    }

    return {
      mediaEvidenceId: evidence.id,
      evidenceType: input.evidenceType,
      revision,
      uploadedAt,
    };
  }

  private assertEvidenceType(
    evidenceType: PatientAdministrationEvidenceType,
  ): void {
    if (!PATIENT_ADMINISTRATION_EVIDENCE_TYPES.includes(evidenceType)) {
      throw new ForbiddenException({
        code: 'PATIENT_ADMINISTRATION_EVIDENCE_NOT_ALLOWED',
        message: 'Evidence is not allowed for the current step',
      });
    }
  }

  private assertDuration(input: UploadPatientAdministrationEvidenceDto): void {
    if (input.evidenceType !== 'audio' && input.durationMs !== undefined) {
      throw new ForbiddenException({
        code: 'PATIENT_ADMINISTRATION_EVIDENCE_NOT_ALLOWED',
        message: 'Duration is only allowed for audio evidence',
      });
    }
    if (
      input.durationMs !== undefined &&
      (!Number.isSafeInteger(input.durationMs) ||
        input.durationMs < 1 ||
        input.durationMs > 600000)
    ) {
      throw new BadRequestException({
        code: 'PATIENT_ADMINISTRATION_STEP_INVALID',
        message: 'Audio duration is invalid',
      });
    }
  }

  private parseCapturedAt(value: string | undefined): Date | null {
    if (!value) {
      return null;
    }
    const capturedAt = new Date(value);
    if (
      !Number.isFinite(capturedAt.getTime()) ||
      capturedAt.getTime() > Date.now() + CAPTURED_AT_FUTURE_TOLERANCE_MS
    ) {
      throw new BadRequestException({
        code: 'PATIENT_ADMINISTRATION_STEP_INVALID',
        message: 'Captured time is invalid',
      });
    }
    return capturedAt;
  }

  private assertItemResponse(
    itemResponse: ItemResponseSummary | null,
    context: PatientAdministrationEvidenceUploadContext,
  ): asserts itemResponse is ItemResponseSummary {
    if (
      !itemResponse ||
      itemResponse.scaleInstanceId !== context.scaleInstanceId ||
      itemResponse.patientId !== context.patientId ||
      itemResponse.assessmentVisitId !== context.assessmentVisitId ||
      itemResponse.subjectCode !== context.subjectCode ||
      itemResponse.scaleDefinitionId !== context.scaleDefinitionId ||
      itemResponse.scaleVersionId !== context.scaleVersionId ||
      itemResponse.scaleCode !== context.scaleCode ||
      itemResponse.scaleVersion !== context.scaleVersion ||
      itemResponse.instanceCode !== context.instanceCode ||
      itemResponse.itemCode !== context.itemCode ||
      itemResponse.answerSource !== 'supervised_patient_input' ||
      !EDITABLE_ITEM_RESPONSE_STATUSES.has(itemResponse.status) ||
      itemResponse.lockedAt !== null ||
      itemResponse.voidedAt !== null ||
      normalizeItemResponseSubmissionWriteBarrier(
        itemResponse.submissionWriteBarrier,
      ).kind !== 'open'
    ) {
      throw new ConflictException({
        code: 'PATIENT_ADMINISTRATION_STEP_INVALID',
        message: 'Current patient administration step is invalid',
      });
    }
  }

  private validateFile(
    file: UploadedMemoryFile,
    evidenceType: PatientAdministrationEvidenceType,
  ): ValidatedPatientEvidenceFile {
    try {
      return evidenceType === 'audio'
        ? validatePatientAudioFile(file)
        : validatePrimaryMediaFile(file);
    } catch (error: unknown) {
      if (error instanceof MediaFileValidationError) {
        const response = { code: error.code, message: error.message };
        if (error.statusCode === 413) {
          throw new PayloadTooLargeException(response);
        }
        throw new BadRequestException(response);
      }
      throw error;
    }
  }

  private requireSafeObjectPrefix(): string {
    const prefix = this.storageConfigService
      .getObjectPrefix()
      .trim()
      .replace(/^\/+|\/+$/g, '');
    if (!prefix || prefix.includes('..') || prefix.includes('\\')) {
      throw new ServiceUnavailableException({
        code: 'MEDIA_STORAGE_UNAVAILABLE',
        message: 'Media storage is unavailable',
      });
    }
    return prefix;
  }

  private createObjectKey(
    prefix: string,
    context: PatientAdministrationEvidenceUploadContext,
    itemResponseId: string,
    evidenceCode: string,
    fileExtension: string,
  ): string {
    if (
      !Types.ObjectId.isValid(itemResponseId) ||
      !/^[a-z0-9][a-z0-9._-]*$/i.test(context.currentStepKey) ||
      context.currentStepKey.includes('..')
    ) {
      throw new ConflictException({
        code: 'PATIENT_ADMINISTRATION_STEP_INVALID',
        message: 'Current patient administration step is invalid',
      });
    }
    return [
      prefix,
      'clinical-evidence',
      context.patientId,
      context.assessmentVisitId,
      context.scaleInstanceId,
      itemResponseId,
      'patient-administration',
      context.currentStepKey,
      String(context.stepRun),
      `${evidenceCode}.${fileExtension}`,
    ].join('/');
  }

  private buildCreateInput(args: {
    uploadContext: PatientAdministrationEvidenceUploadContext;
    itemResponse: ItemResponseSummary;
    input: UploadPatientAdministrationEvidenceDto;
    validatedFile: ValidatedPatientEvidenceFile;
    uploaded: UploadedFileResult;
    objectPrefix: string;
    evidenceCode: string;
    capturedAt: Date | null;
    uploadedAt: Date;
  }): CreateMediaEvidenceInput {
    const item = args.itemResponse;
    return {
      patientId: new Types.ObjectId(args.uploadContext.patientId),
      assessmentVisitId: new Types.ObjectId(
        args.uploadContext.assessmentVisitId,
      ),
      scaleInstanceId: new Types.ObjectId(args.uploadContext.scaleInstanceId),
      itemResponseId: new Types.ObjectId(item.id),
      subjectCode: item.subjectCode,
      scaleDefinitionId: new Types.ObjectId(item.scaleDefinitionId),
      scaleVersionId: new Types.ObjectId(item.scaleVersionId),
      scaleCode: item.scaleCode,
      scaleVersion: item.scaleVersion,
      instanceCode: item.instanceCode,
      itemCode: item.itemCode,
      evidenceCode: args.evidenceCode,
      evidenceType: args.input.evidenceType,
      captureMode: this.captureModeFor(args.input.evidenceType),
      status: 'attached',
      storageStatus: 'stored',
      crfCode: item.crfCode,
      groupCode: item.groupCode,
      itemTitle: item.itemTitle,
      responseType: item.responseType,
      countsTowardTotal: item.countsTowardTotal,
      cognitiveDomainCodes: [...item.cognitiveDomainCodes],
      itemSnapshot: {
        itemCode: item.itemCode,
        crfCode: item.crfCode,
        groupCode: item.groupCode,
        itemTitle: item.itemTitle,
        responseType: item.responseType,
        evidenceType: args.input.evidenceType,
      },
      versionTrace: item.versionTrace
        ? {
            scaleVersion: item.versionTrace.scaleVersion,
            crfVersion: item.versionTrace.crfVersion,
            scoringRuleVersion: item.versionTrace.scoringRuleVersion,
            fieldEncodingVersion: item.versionTrace.fieldEncodingVersion,
            sourceDocument: item.versionTrace.sourceDocument,
          }
        : null,
      storage: {
        storageDriver: this.storageService.driver,
        bucket: args.uploaded.bucket,
        objectKey: args.uploaded.objectKey,
        objectPrefix: args.objectPrefix,
        publicUrl: undefined,
        mimeType: args.validatedFile.detectedMimeType,
        fileExtension: args.validatedFile.fileExtension,
        sizeBytes: args.uploaded.sizeBytes,
        checksum: args.validatedFile.checksum,
        checksumAlgorithm: args.validatedFile.checksumAlgorithm,
        originalFilename: undefined,
        storedAt: args.uploadedAt,
      },
      patientAdministrationContext: {
        sessionId: new Types.ObjectId(args.uploadContext.sessionId),
        stepKey: args.uploadContext.currentStepKey,
        stepRun: args.uploadContext.stepRun,
      },
      audioMetadata:
        args.input.evidenceType === 'audio'
          ? { durationMs: args.input.durationMs ?? null }
          : null,
      imageMetadata: null,
      handwritingTrace: null,
      captureContext: {
        capturedAt: args.capturedAt,
        uploadedAt: args.uploadedAt,
        sourceApp: 'patient_administration',
      },
      operatorSnapshot: null,
      qualityStatus: 'unchecked',
      qualityHints: null,
      metadata: null,
      lockedAt: null,
      voidedAt: null,
      deletedAt: null,
    };
  }

  private captureModeFor(
    evidenceType: PatientAdministrationEvidenceType,
  ): MediaCaptureMode {
    if (evidenceType === 'audio') {
      return 'browser_audio_recording';
    }
    return evidenceType === 'handwriting'
      ? 'tablet_handwriting'
      : 'photo_upload';
  }

  private async compensateEvidenceAndStorage(
    mediaEvidenceId: string,
    objectKey: string,
    evidenceCode: string,
  ): Promise<void> {
    let succeeded = false;
    try {
      succeeded =
        await this.mediaEvidenceService.deleteEvidenceForCompensation(
          mediaEvidenceId,
        );
    } catch {
      succeeded = false;
    }
    const storageDeleted = await this.compensateStorage(
      objectKey,
      evidenceCode,
      false,
    );
    if (!succeeded || !storageDeleted) {
      this.logCompensationFailure(evidenceCode);
    }
  }

  private async compensateStorage(
    objectKey: string,
    evidenceCode: string,
    logFailure = true,
  ): Promise<boolean> {
    try {
      await this.storageService.deleteObject(objectKey);
      return true;
    } catch {
      if (logFailure) {
        this.logCompensationFailure(evidenceCode);
      }
      return false;
    }
  }

  private logCompensationFailure(evidenceCode: string): void {
    this.logger.warn(
      `Patient evidence compensation failed; evidenceCode=${evidenceCode}; driver=${this.storageService.driver}; succeeded=false`,
    );
  }
}
