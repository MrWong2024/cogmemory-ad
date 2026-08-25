import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import { CognitiveDomainsService } from '../../cognitive-domains/services/cognitive-domains.service';
import {
  MediaEvidenceService,
  type ScaleInstanceMediaDeletionTarget,
} from '../../media/services/media-evidence.service';
import { ReportsService } from '../../reports/services/reports.service';
import { ScoringService } from '../../scoring/services/scoring.service';
import { STORAGE_SERVICE } from '../../storage/storage.constants';
import type { StorageService } from '../../storage/storage.interface';

@Injectable()
export class ScaleInstanceDeletionService {
  constructor(
    private readonly assessmentsService: AssessmentsService,
    private readonly mediaEvidenceService: MediaEvidenceService,
    private readonly scoringService: ScoringService,
    private readonly cognitiveDomainsService: CognitiveDomainsService,
    private readonly reportsService: ReportsService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageService,
  ) {}

  async deleteScaleInstance(
    patientId: string,
    assessmentVisitId: string,
    scaleInstanceId: string,
  ): Promise<void> {
    const preparation = await this.prepareDeletion(
      patientId,
      assessmentVisitId,
      scaleInstanceId,
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
      await this.mediaEvidenceService.deleteScaleInstanceEvidence(
        preparation.plan.patientId,
        preparation.plan.assessmentVisitId,
        preparation.plan.scaleInstanceId,
        preparation.mediaTargets.map((target) => target.id),
      );
      await this.assessmentsService.deletePatientAdministrationSessionsForScaleInstance(
        preparation.plan,
      );
      await this.assessmentsService.deleteItemResponsesForScaleInstance(
        preparation.plan,
      );
      await this.assessmentsService.deleteScaleInstance(preparation.plan);
    } catch {
      throw new InternalServerErrorException({
        code: 'SCALE_INSTANCE_DELETE_FAILED',
        message: 'Scale instance could not be physically deleted',
      });
    }
  }

  private async prepareDeletion(
    patientId: string,
    assessmentVisitId: string,
    scaleInstanceId: string,
  ) {
    try {
      const plan = await this.assessmentsService.prepareScaleInstanceDeletion(
        patientId,
        assessmentVisitId,
        scaleInstanceId,
      );
      const [scoreResult, domainResult, reports, mediaTargets] =
        await Promise.all([
          this.scoringService.findLatestScoreResultByScaleInstanceId(
            plan.scaleInstanceId,
          ),
          this.cognitiveDomainsService.findLatestDomainResultByScaleInstanceId(
            plan.scaleInstanceId,
          ),
          this.reportsService.listReportsByVisitId(plan.assessmentVisitId),
          this.mediaEvidenceService.listScaleInstanceDeletionTargets(
            plan.patientId,
            plan.assessmentVisitId,
            plan.scaleInstanceId,
          ),
        ]);
      const mediaEvidenceIds = new Set(
        mediaTargets.map((mediaTarget) => mediaTarget.id),
      );
      const hasReport = reports.some(
        (report) =>
          report.primaryScaleInstanceIds.includes(
            plan.scaleInstanceId.toString(),
          ) ||
          report.scaleTraces.some(
            (trace) =>
              trace.scaleInstanceId === plan.scaleInstanceId.toString(),
          ) ||
          report.mediaEvidenceIds.some((mediaEvidenceId) =>
            mediaEvidenceIds.has(mediaEvidenceId),
          ),
      );
      if (scoreResult || domainResult || hasReport) {
        this.throwNotDeletable();
      }
      this.assertMediaIsDeletable(mediaTargets);

      return { plan, mediaTargets };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        code: 'SCALE_INSTANCE_DELETE_FAILED',
        message: 'Scale instance could not be physically deleted',
      });
    }
  }

  private assertMediaIsDeletable(
    mediaTargets: readonly ScaleInstanceMediaDeletionTarget[],
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
      code: 'SCALE_INSTANCE_NOT_DELETABLE',
      message: 'Scale instance cannot be physically deleted',
    });
  }
}
