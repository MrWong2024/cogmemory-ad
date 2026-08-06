import {
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import {
  itemResponseSubmissionBarrierBlocksWrites,
  scaleInstanceSubmissionBarrierBlocksWrites,
} from '../../assessments/lib/scale-instance-submission-write-barrier';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import { PatientAdministrationSessionService } from '../../assessments/services/patient-administration-session.service';
import { PatientsService } from '../../patients/services/patients.service';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import {
  DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
  STORAGE_SERVICE,
} from '../../storage/storage.constants';
import type { StorageService } from '../../storage/storage.interface';
import type { MediaEvidenceParamDto } from '../dto/media-evidence-param.dto';
import type { MediaTranscriptionErrorCode } from '../schemas/media-evidence.schema';
import { toTranscriptionResponse } from './media-evidence-public.mapper';
import {
  MediaEvidenceService,
  type MediaEvidenceOwnership,
  type MediaEvidenceSummary,
  type MediaTranscriptionSummary,
} from './media-evidence.service';
import {
  PatientAudioAsrClientService,
  PatientAudioAsrError,
  PatientAudioAsrUnavailableError,
  type PatientAudioFormat,
} from './patient-audio-asr-client.service';
import type { MediaEvidenceTranscriptionActionResponse } from '../types/media-evidence-response.types';

const EDITABLE_STATUSES = new Set(['draft', 'in_progress']);
const EDITABLE_ITEM_RESPONSE_STATUSES = new Set([
  'not_started',
  'in_progress',
  'answered',
]);
const SUPPORTED_AUDIO_FORMATS = new Set<PatientAudioFormat>([
  'webm',
  'ogg',
  'm4a',
  'mp3',
]);
const MAX_ASR_DURATION_MS = 5 * 60 * 1000;

@Injectable()
export class MediaEvidenceTranscriptionService {
  constructor(
    private readonly patientAudioAsrClientService: PatientAudioAsrClientService,
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly mediaEvidenceService: MediaEvidenceService,
    private readonly patientAdministrationSessionService: PatientAdministrationSessionService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageService,
  ) {}

  async transcribe(
    params: MediaEvidenceParamDto,
    currentUser: AuthenticatedUserContext | undefined,
  ): Promise<MediaEvidenceTranscriptionActionResponse> {
    const mode = this.requireMode();
    const chain = await this.requireOwnership(params);
    const requestedBy =
      this.patientAdministrationSessionService.buildOperatorSnapshot(
        currentUser,
      );
    if (
      !currentUser ||
      !currentUser.roles.some((role) =>
        (PATIENT_WORKFLOW_ROLES as readonly string[]).includes(role),
      )
    ) {
      this.throwNotAllowed();
    }
    this.assertEditableChain(chain);

    const ownership: MediaEvidenceOwnership = {
      patientId: params.patientId,
      assessmentVisitId: params.visitId,
      scaleInstanceId: params.scaleInstanceId,
      itemResponseId: params.itemResponseId,
    };
    const evidence =
      await this.mediaEvidenceService.findEvidenceForTranscription(
        ownership,
        params.mediaEvidenceId,
      );
    if (!evidence) {
      throw new NotFoundException({
        code: 'MEDIA_EVIDENCE_NOT_FOUND',
        message: 'Media evidence not found',
      });
    }
    const format = this.requireEligibleEvidence(evidence);
    if (
      evidence.audioMetadata?.durationMs !== null &&
      evidence.audioMetadata?.durationMs !== undefined &&
      evidence.audioMetadata.durationMs > MAX_ASR_DURATION_MS
    ) {
      this.throwNotAllowed();
    }
    if (evidence.transcription?.status === 'succeeded') {
      return this.toResponse(evidence.id, evidence.transcription);
    }

    const claimedAt = new Date();
    const staleBefore = new Date(
      claimedAt.getTime() - Math.max(120000, mode.timeoutMs * 2),
    );
    const claim = await this.mediaEvidenceService.claimTranscription(
      ownership,
      evidence.id,
      requestedBy,
      mode.provider,
      mode.model,
      claimedAt,
      staleBefore,
    );
    if (!claim) {
      this.throwConflict();
    }

    try {
      let signedUrl: string | undefined;
      if (mode.provider === 'bailian') {
        try {
          signedUrl = (
            await this.storageService.getSignedUrl(
              evidence.storage!.objectKey!,
              { expiresInSeconds: DEFAULT_SIGNED_URL_EXPIRES_SECONDS },
            )
          ).url;
        } catch {
          return this.persistFailure(
            ownership,
            evidence.id,
            claim.claimedAt,
            'storage_unavailable',
          );
        }
      }

      const result = await this.patientAudioAsrClientService.transcribe({
        format,
        signedUrl,
      });
      const completed = await this.mediaEvidenceService.completeTranscription(
        ownership,
        evidence.id,
        claim.claimedAt,
        result.text,
        new Date(),
      );
      if (!completed) {
        this.throwConflict();
      }
      return this.toResponse(evidence.id, completed);
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        throw error;
      }
      const errorCode =
        error instanceof PatientAudioAsrError
          ? error.code
          : error instanceof PatientAudioAsrUnavailableError
            ? 'provider_unavailable'
            : 'provider_unavailable';
      return this.persistFailure(
        ownership,
        evidence.id,
        claim.claimedAt,
        errorCode,
      );
    }
  }

  private requireMode() {
    try {
      const mode = this.patientAudioAsrClientService.getMode();
      if (mode.provider === 'disabled') {
        this.throwUnavailable();
      }
      return mode as typeof mode & { provider: 'stub' | 'bailian' };
    } catch (error: unknown) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      this.throwUnavailable();
    }
  }

  private async requireOwnership(params: MediaEvidenceParamDto) {
    const patient = await this.patientsService.findPatientById(
      params.patientId,
    );
    if (!patient) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
      });
    }
    const visit = await this.assessmentsService.findVisitByPatientAndId(
      params.patientId,
      params.visitId,
    );
    if (!visit) {
      throw new NotFoundException({
        code: 'VISIT_NOT_FOUND',
        message: 'Assessment visit not found',
      });
    }
    const scaleInstance =
      await this.assessmentsService.findScaleInstanceByPatientVisitAndId(
        params.patientId,
        params.visitId,
        params.scaleInstanceId,
      );
    if (!scaleInstance) {
      throw new NotFoundException({
        code: 'SCALE_INSTANCE_NOT_FOUND',
        message: 'Scale instance not found',
      });
    }
    const itemResponse =
      await this.assessmentsService.findItemResponseByOwnership(
        params.patientId,
        params.visitId,
        params.scaleInstanceId,
        params.itemResponseId,
      );
    if (!itemResponse) {
      throw new NotFoundException({
        code: 'ITEM_RESPONSE_NOT_FOUND',
        message: 'Item response not found',
      });
    }
    return { patient, visit, scaleInstance, itemResponse };
  }

  private assertEditableChain(
    chain: Awaited<
      ReturnType<MediaEvidenceTranscriptionService['requireOwnership']>
    >,
  ): void {
    if (
      chain.patient.status !== 'active' ||
      !EDITABLE_STATUSES.has(chain.visit.status) ||
      !EDITABLE_STATUSES.has(chain.scaleInstance.status) ||
      chain.scaleInstance.lockedAt !== null ||
      chain.scaleInstance.voidedAt !== null ||
      scaleInstanceSubmissionBarrierBlocksWrites(
        chain.scaleInstance.submissionWriteBarrier,
      ) ||
      !EDITABLE_ITEM_RESPONSE_STATUSES.has(chain.itemResponse.status) ||
      chain.itemResponse.lockedAt !== null ||
      chain.itemResponse.voidedAt !== null ||
      itemResponseSubmissionBarrierBlocksWrites(
        chain.itemResponse.submissionWriteBarrier,
      )
    ) {
      this.throwNotAllowed();
    }
  }

  private requireEligibleEvidence(
    evidence: MediaEvidenceSummary,
  ): PatientAudioFormat {
    const format = evidence.storage?.fileExtension?.trim().toLowerCase();
    if (
      evidence.evidenceType !== 'audio' ||
      evidence.captureMode !== 'browser_audio_recording' ||
      !evidence.patientAdministrationContext ||
      evidence.storageStatus !== 'stored' ||
      !evidence.storage?.objectKey ||
      !format ||
      !SUPPORTED_AUDIO_FORMATS.has(format as PatientAudioFormat) ||
      evidence.status !== 'attached' ||
      evidence.lockedAt !== null ||
      evidence.voidedAt !== null ||
      evidence.deletedAt !== null
    ) {
      this.throwNotAllowed();
    }
    return format as PatientAudioFormat;
  }

  private async persistFailure(
    ownership: MediaEvidenceOwnership,
    mediaEvidenceId: string,
    claimedAt: Date,
    errorCode: MediaTranscriptionErrorCode,
  ): Promise<MediaEvidenceTranscriptionActionResponse> {
    const failed = await this.mediaEvidenceService.failTranscription(
      ownership,
      mediaEvidenceId,
      claimedAt,
      errorCode,
      new Date(),
    );
    if (!failed) {
      this.throwConflict();
    }
    return this.toResponse(mediaEvidenceId, failed);
  }

  private toResponse(
    mediaEvidenceId: string,
    transcription: MediaTranscriptionSummary,
  ): MediaEvidenceTranscriptionActionResponse {
    return {
      mediaEvidenceId,
      transcription: toTranscriptionResponse(transcription),
    };
  }

  private throwNotAllowed(): never {
    throw new ConflictException({
      code: 'MEDIA_TRANSCRIPTION_NOT_ALLOWED',
      message: 'Media transcription is not allowed',
    });
  }

  private throwConflict(): never {
    throw new ConflictException({
      code: 'MEDIA_TRANSCRIPTION_CONFLICT',
      message: 'Media transcription state changed',
    });
  }

  private throwUnavailable(): never {
    throw new ServiceUnavailableException({
      code: 'MEDIA_TRANSCRIPTION_UNAVAILABLE',
      message: 'Media transcription is unavailable',
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
    });
  }
}
