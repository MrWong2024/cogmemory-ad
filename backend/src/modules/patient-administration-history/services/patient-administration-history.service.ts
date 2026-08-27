import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import { PatientAdministrationSessionService } from '../../assessments/services/patient-administration-session.service';
import type { PatientAdministrationSessionSummaryResponse } from '../../assessments/types/patient-administration-response.types';
import {
  MediaEvidenceService,
  type PatientAdministrationSessionMediaDeletionTarget,
} from '../../media/services/media-evidence.service';
import { ReportsService } from '../../reports/services/reports.service';
import { STORAGE_SERVICE } from '../../storage/storage.constants';
import type { StorageService } from '../../storage/storage.interface';

@Injectable()
export class PatientAdministrationHistoryService {
  constructor(
    private readonly patientAdministrationSessionService: PatientAdministrationSessionService,
    private readonly mediaEvidenceService: MediaEvidenceService,
    private readonly assessmentsService: AssessmentsService,
    private readonly reportsService: ReportsService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageService,
  ) {}

  listSessions(
    patientId: string,
    assessmentVisitId: string,
    scaleInstanceId: string,
  ): Promise<PatientAdministrationSessionSummaryResponse[]> {
    return this.patientAdministrationSessionService.listSessionHistory(
      patientId,
      assessmentVisitId,
      scaleInstanceId,
    );
  }

  async deleteSession(
    patientId: string,
    assessmentVisitId: string,
    scaleInstanceId: string,
    sessionId: string,
  ): Promise<void> {
    const preparation = await this.prepareDeletion(
      patientId,
      assessmentVisitId,
      scaleInstanceId,
      sessionId,
    );
    const objectKeys = [
      ...new Set(
        preparation.mediaTargets.flatMap((target) => target.objectKeys),
      ),
    ];

    for (const objectKey of objectKeys) {
      try {
        await this.storageService.deleteObject(objectKey);
      } catch {
        throw new ServiceUnavailableException({
          code: 'MEDIA_STORAGE_UNAVAILABLE',
          message: 'Media storage is unavailable',
        });
      }
    }

    try {
      await this.mediaEvidenceService.deletePatientAdministrationSessionEvidence(
        preparation.plan.patientId,
        preparation.plan.assessmentVisitId,
        preparation.plan.scaleInstanceId,
        preparation.plan.sessionId,
        preparation.mediaTargets.map((target) => target.id),
      );
      await this.patientAdministrationSessionService.deleteHistorySession(
        preparation.plan,
      );
    } catch {
      throw new InternalServerErrorException({
        code: 'PATIENT_ADMINISTRATION_SESSION_DELETE_FAILED',
        message:
          'Patient administration session could not be physically deleted',
      });
    }
  }

  private async prepareDeletion(
    patientId: string,
    assessmentVisitId: string,
    scaleInstanceId: string,
    sessionId: string,
  ) {
    try {
      const plan =
        await this.patientAdministrationSessionService.prepareHistorySessionDeletion(
          patientId,
          assessmentVisitId,
          scaleInstanceId,
          sessionId,
        );
      const mediaTargets =
        await this.mediaEvidenceService.listPatientAdministrationSessionDeletionTargets(
          plan.patientId,
          plan.assessmentVisitId,
          plan.scaleInstanceId,
          plan.sessionId,
        );
      this.assertSessionEvidenceOwnership(plan.stepEvidenceIds, mediaTargets);
      this.assertMediaIsDeletable(mediaTargets);
      const mediaEvidenceIds = mediaTargets.map((target) => target.id);
      const [hasItemResponseReference, hasReportReference] = await Promise.all([
        this.assessmentsService.hasItemResponseEvidenceReferences(
          mediaEvidenceIds,
        ),
        this.reportsService.hasMediaEvidenceReferences(mediaEvidenceIds),
      ]);
      if (hasItemResponseReference || hasReportReference) {
        this.throwNotDeletable();
      }

      return { plan, mediaTargets };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        code: 'PATIENT_ADMINISTRATION_SESSION_DELETE_FAILED',
        message:
          'Patient administration session could not be physically deleted',
      });
    }
  }

  private assertSessionEvidenceOwnership(
    stepEvidenceIds: readonly string[],
    mediaTargets: readonly PatientAdministrationSessionMediaDeletionTarget[],
  ): void {
    const targetIds = new Set(mediaTargets.map((target) => target.id));
    if (stepEvidenceIds.some((evidenceId) => !targetIds.has(evidenceId))) {
      this.throwNotDeletable();
    }
  }

  private assertMediaIsDeletable(
    mediaTargets: readonly PatientAdministrationSessionMediaDeletionTarget[],
  ): void {
    if (
      mediaTargets.some(
        (target) =>
          target.status === 'locked' ||
          target.lockedAt !== null ||
          target.transcriptionStatus === 'processing',
      )
    ) {
      this.throwNotDeletable();
    }
  }

  private throwNotDeletable(): never {
    throw new ConflictException({
      code: 'PATIENT_ADMINISTRATION_SESSION_NOT_DELETABLE',
      message: 'Patient administration session cannot be physically deleted',
    });
  }
}
