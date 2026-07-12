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
import type { PatientSummary } from '../../patients/services/patients.service';
import { PatientsService } from '../../patients/services/patients.service';
import type { AssessmentVisitSummary } from '../../assessments/services/assessments.service';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import type { LockClinicalReportDto } from '../dto/lock-clinical-report.dto';
import {
  buildClinicalReportLockMetadata,
  ClinicalReportLockRuleError,
  evaluateClinicalReportLockReadiness,
  resolveExistingClinicalReportLock,
} from '../lib/clinical-report-lock';
import type {
  ClinicalReportLockActor,
  ExistingClinicalReportLockResolution,
} from '../types/clinical-report-lock.types';
import type { LockClinicalReportResponse } from '../types/clinical-report-response.types';
import { ClinicalReportPublicMapper } from './clinical-report-public.mapper';
import type { ClinicalReportSummary } from './reports.service';
import { ReportsService } from './reports.service';

const EDITABLE_VISIT_STATUSES = new Set(['draft', 'in_progress', 'completed']);
const LOCK_ACTOR_PRIORITY = ['doctor', 'admin'] as const;

type LockWorkflowContext = {
  patient: PatientSummary;
  visit: AssessmentVisitSummary;
  report: ClinicalReportSummary;
};

@Injectable()
export class ClinicalReportLockWorkflowService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly reportsService: ReportsService,
    private readonly publicMapper: ClinicalReportPublicMapper,
  ) {}

  async lockClinicalReport(
    patientId: string,
    visitId: string,
    reportId: string,
    currentUser: AuthenticatedUserContext | undefined,
    input: LockClinicalReportDto,
  ): Promise<LockClinicalReportResponse> {
    if (input.confirm !== true) {
      throw new BadRequestException({
        code: 'CLINICAL_REPORT_LOCK_CONFIRMATION_REQUIRED',
        message: 'Clinical report lock must be explicit',
      });
    }
    const actor = this.buildLockActor(currentUser);
    const context = await this.loadLockContext(patientId, visitId, reportId);
    if (context.report.status === 'voided') {
      this.throwVoided();
    }
    const existing = this.resolveExistingLock(context.report);
    if (existing) {
      return this.buildLockResponse(context.report, existing, true);
    }
    this.assertFirstLockResourceState(context);
    const expectedUpdatedAt = this.parseExpectedUpdatedAt(
      input.expectedUpdatedAt,
    );
    this.applyLockRule(() =>
      evaluateClinicalReportLockReadiness({
        report: context.report,
        expectedUpdatedAt,
      }),
    );
    const lockedAt = new Date();
    const lockId = randomUUID();
    const mutation = this.applyLockRule(() =>
      buildClinicalReportLockMetadata({
        report: context.report,
        lockId,
        lockedAt,
        actor,
        lockNote: input.lockNote,
      }),
    );
    let updated: ClinicalReportSummary | null;
    try {
      updated = await this.reportsService.lockReportIfUnmodified({
        reportId,
        patientId,
        assessmentVisitId: visitId,
        expectedUpdatedAt,
        lockedAt: mutation.lockedAt,
        lockedBy: mutation.lockedBy,
        metadata: mutation.metadata,
      });
    } catch {
      throw new InternalServerErrorException({
        code: 'CLINICAL_REPORT_LOCK_FAILED',
        message: 'Clinical report lock failed',
      });
    }
    if (!updated) {
      return this.resolveLockConflict(context, input.expectedUpdatedAt);
    }
    return this.buildLockResponse(
      updated,
      {
        lockId: mutation.audit.lockId,
        lockedAt: mutation.audit.lockedAt,
        lockedBy: {
          operatorId: mutation.audit.lockedBy,
          operatorName: mutation.audit.lockedByName,
          operatorRole: mutation.audit.lockedByRole,
        },
        lockNote: mutation.audit.lockNote,
      },
      false,
    );
  }

  private async loadLockContext(
    patientId: string,
    visitId: string,
    reportId: string,
  ): Promise<LockWorkflowContext> {
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

  private assertFirstLockResourceState(context: LockWorkflowContext): void {
    if (context.patient.status !== 'active') {
      throw new ConflictException({
        code: 'PATIENT_NOT_ACTIVE',
        message: 'Patient is not active',
      });
    }
    if (!EDITABLE_VISIT_STATUSES.has(context.visit.status)) {
      throw new ConflictException({
        code: 'VISIT_NOT_EDITABLE',
        message: 'Assessment visit is not editable',
      });
    }
  }

  private buildLockActor(
    currentUser: AuthenticatedUserContext | undefined,
  ): ClinicalReportLockActor {
    if (!currentUser || !Types.ObjectId.isValid(currentUser.id)) {
      throw new UnauthorizedException();
    }
    const operatorId = new Types.ObjectId(currentUser.id).toString();
    if (operatorId !== currentUser.id.trim().toLowerCase()) {
      throw new UnauthorizedException();
    }
    const operatorRole = LOCK_ACTOR_PRIORITY.find((role) =>
      currentUser.roles.includes(role),
    );
    if (!operatorRole) {
      throw new ForbiddenException();
    }
    return {
      operatorId,
      operatorName:
        currentUser.displayName.trim() ||
        currentUser.accountName.trim() ||
        'unknown',
      operatorRole,
    };
  }

  private resolveExistingLock(
    report: ClinicalReportSummary,
  ): ExistingClinicalReportLockResolution | null {
    return this.applyLockRule(() => resolveExistingClinicalReportLock(report));
  }

  private async resolveLockConflict(
    context: LockWorkflowContext,
    expectedUpdatedAt: string,
  ): Promise<LockClinicalReportResponse> {
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
    const existing = this.resolveExistingLock(current);
    if (existing) {
      return this.buildLockResponse(current, existing, true);
    }
    if (current.status !== 'confirmed') {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_NOT_LOCKABLE',
        message: 'Clinical report is not lockable',
      });
    }
    const expected = this.parseExpectedUpdatedAt(expectedUpdatedAt);
    this.applyLockRule(() =>
      evaluateClinicalReportLockReadiness({
        report: current,
        expectedUpdatedAt: expected,
      }),
    );
    throw new InternalServerErrorException({
      code: 'CLINICAL_REPORT_LOCK_FAILED',
      message: 'Clinical report lock failed',
    });
  }

  private buildLockResponse(
    report: ClinicalReportSummary,
    lock: ExistingClinicalReportLockResolution,
    alreadyLocked: boolean,
  ): LockClinicalReportResponse {
    return {
      report: this.publicMapper.toPublicReport(report),
      lockReceipt: {
        lockId: lock.lockId,
        lockedAt: new Date(lock.lockedAt.getTime()),
        lockedBy: {
          operatorId: lock.lockedBy.operatorId,
          ...(lock.lockedBy.operatorName
            ? { operatorName: lock.lockedBy.operatorName }
            : {}),
          operatorRole: lock.lockedBy.operatorRole,
        },
        ...(lock.lockNote ? { lockNote: lock.lockNote } : {}),
        alreadyLocked,
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

  private applyLockRule<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error: unknown) {
      if (error instanceof ClinicalReportLockRuleError) {
        throw new ConflictException({
          code: error.code,
          message: 'Clinical report lock conflicts with current report',
        });
      }
      throw error;
    }
  }

  private throwVoided(): never {
    throw new ConflictException({
      code: 'CLINICAL_REPORT_VOIDED',
      message: 'Clinical report is voided',
    });
  }
}
