import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import type { AssessmentVisitSummary } from '../../assessments/services/assessments.service';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import type { PatientSummary } from '../../patients/services/patients.service';
import { PatientsService } from '../../patients/services/patients.service';
import type { ArchiveClinicalReportDto } from '../dto/archive-clinical-report.dto';
import {
  buildClinicalReportArchiveActor,
  buildClinicalReportArchiveMetadata,
  ClinicalReportArchiveRuleError,
  evaluateClinicalReportArchiveReadiness,
  resolveExistingClinicalReportArchive,
} from '../lib/clinical-report-archive';
import type {
  ClinicalReportArchiveActor,
  ExistingClinicalReportArchiveResolution,
} from '../types/clinical-report-archive.types';
import type { ArchiveClinicalReportResponse } from '../types/clinical-report-response.types';
import { ClinicalReportPublicMapper } from './clinical-report-public.mapper';
import type { ClinicalReportSummary } from './reports.service';
import { ReportsService } from './reports.service';

const ARCHIVE_ACTOR_PRIORITY = ['doctor', 'admin'] as const;

type ArchiveWorkflowContext = {
  patient: PatientSummary;
  visit: AssessmentVisitSummary;
  report: ClinicalReportSummary;
};

@Injectable()
export class ClinicalReportArchiveWorkflowService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly reportsService: ReportsService,
    private readonly publicMapper: ClinicalReportPublicMapper,
  ) {}

  async archiveClinicalReport(
    patientId: string,
    visitId: string,
    reportId: string,
    currentUser: AuthenticatedUserContext | undefined,
    input: ArchiveClinicalReportDto,
  ): Promise<ArchiveClinicalReportResponse> {
    if (input.confirm !== true) {
      throw new BadRequestException({
        code: 'CLINICAL_REPORT_ARCHIVE_CONFIRMATION_REQUIRED',
        message: 'Clinical report archive must be explicit',
      });
    }
    const actor = this.buildArchiveActor(currentUser);
    const context = await this.loadArchiveContext(patientId, visitId, reportId);
    if (context.report.status === 'voided') {
      this.throwVoided();
    }
    const existing = this.resolveExistingArchive(context.report);
    if (existing) {
      return this.buildArchiveResponse(context.report, existing, true);
    }
    if (
      !this.reportsService.canTransitionReportStatus(
        context.report.status,
        'archived',
      )
    ) {
      this.throwNotArchivable();
    }
    const expectedUpdatedAt = this.parseExpectedUpdatedAt(
      input.expectedUpdatedAt,
    );
    this.applyArchiveRule(() =>
      evaluateClinicalReportArchiveReadiness({
        report: context.report,
        expectedUpdatedAt,
      }),
    );
    const mutation = this.applyArchiveRule(() =>
      buildClinicalReportArchiveMetadata({
        report: context.report,
        archiveId: randomUUID(),
        archivedAt: new Date(),
        actor,
        archiveNote: input.archiveNote,
      }),
    );
    let updated: ClinicalReportSummary | null;
    try {
      updated = await this.reportsService.archiveReportIfUnmodified({
        reportId,
        patientId,
        assessmentVisitId: visitId,
        expectedUpdatedAt,
        archivedAt: mutation.archivedAt,
        archivedBy: mutation.archivedBy,
        metadata: mutation.metadata,
      });
    } catch {
      throw this.failed();
    }
    if (!updated) {
      return this.resolveArchiveConflict(context, expectedUpdatedAt);
    }
    return this.buildArchiveResponse(
      updated,
      {
        archiveId: mutation.audit.archiveId,
        archivedAt: mutation.audit.archivedAt,
        archivedBy: {
          operatorId: mutation.audit.archivedBy,
          operatorName: mutation.audit.archivedByName,
          operatorRole: mutation.audit.archivedByRole,
        },
        archiveNote: mutation.audit.archiveNote,
        sourceFreezeId: mutation.audit.sourceFreezeId,
        sourceFreezeCompletedAt: mutation.audit.sourceFreezeCompletedAt,
      },
      false,
    );
  }

  private async loadArchiveContext(
    patientId: string,
    visitId: string,
    reportId: string,
  ): Promise<ArchiveWorkflowContext> {
    const patient = await this.patientsService.findPatientById(patientId);
    if (!patient) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
      });
    }
    const visit = await this.assessmentsService.findVisitByPatientAndId(
      patientId,
      visitId,
    );
    if (!visit) {
      throw new NotFoundException({
        code: 'VISIT_NOT_FOUND',
        message: 'Assessment visit not found',
      });
    }
    const report = await this.reportsService.findReportByOwnership({
      reportId,
      patientId,
      assessmentVisitId: visitId,
    });
    if (!report) {
      throw new NotFoundException({
        code: 'CLINICAL_REPORT_NOT_FOUND',
        message: 'Clinical report not found',
      });
    }
    return { patient, visit, report };
  }

  private buildArchiveActor(
    currentUser: AuthenticatedUserContext | undefined,
  ): ClinicalReportArchiveActor {
    if (!currentUser || !Types.ObjectId.isValid(currentUser.id)) {
      throw new UnauthorizedException();
    }
    const operatorId = new Types.ObjectId(currentUser.id).toString();
    if (operatorId !== currentUser.id.trim().toLowerCase()) {
      throw new UnauthorizedException();
    }
    const operatorRole = ARCHIVE_ACTOR_PRIORITY.find((role) =>
      currentUser.roles.includes(role),
    );
    if (!operatorRole) {
      throw new ForbiddenException();
    }
    return this.applyArchiveRule(() =>
      buildClinicalReportArchiveActor({
        operatorId,
        operatorName:
          currentUser.displayName.trim() ||
          currentUser.accountName.trim() ||
          'unknown',
        operatorRole,
      }),
    );
  }

  private resolveExistingArchive(
    report: ClinicalReportSummary,
  ): ExistingClinicalReportArchiveResolution | null {
    return this.applyArchiveRule(() =>
      resolveExistingClinicalReportArchive(report),
    );
  }

  private async resolveArchiveConflict(
    context: ArchiveWorkflowContext,
    expectedUpdatedAt: Date,
  ): Promise<ArchiveClinicalReportResponse> {
    const current = await this.reportsService.findReportByOwnership({
      reportId: context.report.id,
      patientId: context.patient.id,
      assessmentVisitId: context.visit.id,
    });
    if (!current) {
      throw new NotFoundException({
        code: 'CLINICAL_REPORT_NOT_FOUND',
        message: 'Clinical report not found',
      });
    }
    if (current.status === 'voided') {
      this.throwVoided();
    }
    const existing = this.resolveExistingArchive(current);
    if (existing) {
      return this.buildArchiveResponse(current, existing, true);
    }
    if (
      !this.reportsService.canTransitionReportStatus(current.status, 'archived')
    ) {
      this.throwNotArchivable();
    }
    this.applyArchiveRule(() =>
      evaluateClinicalReportArchiveReadiness({
        report: current,
        expectedUpdatedAt,
      }),
    );
    throw this.failed();
  }

  private buildArchiveResponse(
    report: ClinicalReportSummary,
    archive: ExistingClinicalReportArchiveResolution,
    alreadyArchived: boolean,
  ): ArchiveClinicalReportResponse {
    return {
      report: this.publicMapper.toPublicReport(report),
      archiveReceipt: {
        archiveId: archive.archiveId,
        archivedAt: new Date(archive.archivedAt.getTime()),
        archivedBy: {
          operatorId: archive.archivedBy.operatorId,
          ...(archive.archivedBy.operatorName
            ? { operatorName: archive.archivedBy.operatorName }
            : {}),
          operatorRole: archive.archivedBy.operatorRole,
        },
        ...(archive.archiveNote ? { archiveNote: archive.archiveNote } : {}),
        sourceFreezeId: archive.sourceFreezeId,
        sourceFreezeCompletedAt: archive.sourceFreezeCompletedAt
          ? new Date(archive.sourceFreezeCompletedAt.getTime())
          : null,
        alreadyArchived,
      },
    };
  }

  private parseExpectedUpdatedAt(value: string): Date {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'expectedUpdatedAt must be a valid ISO timestamp',
      });
    }
    return parsed;
  }

  private applyArchiveRule<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error: unknown) {
      if (error instanceof ClinicalReportArchiveRuleError) {
        throw new ConflictException({
          code: error.code,
          message: 'Clinical report archive conflicts with current report',
        });
      }
      throw error;
    }
  }

  private throwNotArchivable(): never {
    throw new ConflictException({
      code: 'CLINICAL_REPORT_NOT_ARCHIVABLE',
      message: 'Clinical report is not archivable',
    });
  }

  private throwVoided(): never {
    throw new ConflictException({
      code: 'CLINICAL_REPORT_VOIDED',
      message: 'Clinical report is voided',
    });
  }

  private failed(): InternalServerErrorException {
    return new InternalServerErrorException({
      code: 'CLINICAL_REPORT_ARCHIVE_FAILED',
      message: 'Clinical report archive failed',
    });
  }
}
