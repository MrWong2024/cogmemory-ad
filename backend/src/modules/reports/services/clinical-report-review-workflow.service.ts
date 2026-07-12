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
import type { ConfirmClinicalReportDto } from '../dto/confirm-clinical-report.dto';
import type { SubmitClinicalReportForConfirmationDto } from '../dto/submit-clinical-report-for-confirmation.dto';
import type { UpdateClinicalReportDraftDto } from '../dto/update-clinical-report-draft.dto';
import {
  ClinicalReportReviewRuleError,
  isPlainRecord,
  prepareClinicalReportConfirmation,
  prepareClinicalReportDraftEdit,
  prepareClinicalReportSubmission,
  readClinicalReportConfirmation,
  readClinicalReportSubmission,
} from '../lib/clinical-report-review';
import type { ReportOperatorRole } from '../schemas/clinical-report.schema';
import type {
  ConfirmClinicalReportResponse,
  ConfirmClinicalReportReceiptResponse,
  SubmitClinicalReportForConfirmationResponse,
  SubmitClinicalReportReceiptResponse,
  UpdateClinicalReportDraftResponse,
} from '../types/clinical-report-response.types';
import type { ClinicalReportWorkflowActor } from '../types/clinical-report-review.types';
import { ClinicalReportPublicMapper } from './clinical-report-public.mapper';
import type { ClinicalReportSummary } from './reports.service';
import { ReportsService } from './reports.service';

const EDITABLE_VISIT_STATUSES = new Set(['draft', 'in_progress', 'completed']);
const REPORT_ACTOR_PRIORITY = [
  'doctor',
  'nurse',
  'research_assistant',
  'admin',
] as const;
const CONFIRM_ACTOR_PRIORITY = ['doctor', 'admin'] as const;

type ReportWorkflowContext = {
  patient: PatientSummary;
  visit: AssessmentVisitSummary;
  report: ClinicalReportSummary;
};

@Injectable()
export class ClinicalReportReviewWorkflowService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly reportsService: ReportsService,
    private readonly publicMapper: ClinicalReportPublicMapper,
  ) {}

  async updateDraft(
    patientId: string,
    visitId: string,
    reportId: string,
    currentUser: AuthenticatedUserContext | undefined,
    input: UpdateClinicalReportDraftDto,
  ): Promise<UpdateClinicalReportDraftResponse> {
    const actor = this.requireWorkflowActor(currentUser);
    const context = await this.loadReportContext(patientId, visitId, reportId);
    this.assertClinicalWriteState(context);
    this.assertDraftEditable(context.report);
    const editedAt = new Date();
    const eventId = randomUUID();
    const prepared = this.applyRule(() =>
      prepareClinicalReportDraftEdit({
        report: context.report,
        doctorOpinion: input.doctorOpinion,
        recommendationText: input.recommendationText,
        editNote: input.editNote,
        eventId,
        editedAt,
        actor,
      }),
    );
    const expectedUpdatedAt = this.parseExpectedUpdatedAt(
      input.expectedUpdatedAt,
    );
    let updated: ClinicalReportSummary | null;
    try {
      updated = await this.reportsService.updateDraftNarrativeIfUnmodified({
        reportId,
        patientId,
        assessmentVisitId: visitId,
        expectedUpdatedAt,
        narrative: prepared.narrative,
        metadata: prepared.metadata,
      });
    } catch {
      throw new InternalServerErrorException({
        code: 'CLINICAL_REPORT_EDIT_FAILED',
        message: 'Clinical report edit failed',
      });
    }
    if (!updated) {
      return this.resolveEditAtomicMiss(context, input.expectedUpdatedAt);
    }
    return {
      report: this.publicMapper.toPublicReport(updated),
      editReceipt: {
        eventId,
        editedAt,
        editedBy: this.toPublicActor(actor),
        changedFields: [...prepared.event.changedFields],
        editNote: prepared.event.editNote,
      },
    };
  }

  async submitForConfirmation(
    patientId: string,
    visitId: string,
    reportId: string,
    currentUser: AuthenticatedUserContext | undefined,
    input: SubmitClinicalReportForConfirmationDto,
  ): Promise<SubmitClinicalReportForConfirmationResponse> {
    if (input.confirm !== true) {
      throw new BadRequestException({
        code: 'CLINICAL_REPORT_SUBMISSION_CONFIRMATION_REQUIRED',
        message: 'Clinical report submission must be explicit',
      });
    }
    const actor = this.requireWorkflowActor(currentUser);
    const context = await this.loadReportContext(patientId, visitId, reportId);
    this.assertClinicalWriteState(context);
    const existing = this.resolveExistingSubmission(context.report);
    if (existing) {
      return existing;
    }
    this.assertDraftForSubmission(context.report);
    const submittedAt = new Date();
    const submissionId = randomUUID();
    const prepared = this.applyRule(() =>
      prepareClinicalReportSubmission({
        report: context.report,
        submissionId,
        submittedAt,
        actor,
        submissionNote: input.submissionNote,
      }),
    );
    const expectedUpdatedAt = this.parseExpectedUpdatedAt(
      input.expectedUpdatedAt,
    );
    let updated: ClinicalReportSummary | null;
    try {
      updated = await this.reportsService.submitForConfirmationIfUnmodified({
        reportId,
        patientId,
        assessmentVisitId: visitId,
        expectedUpdatedAt,
        metadata: prepared.metadata,
      });
    } catch {
      throw new InternalServerErrorException({
        code: 'CLINICAL_REPORT_SUBMISSION_FAILED',
        message: 'Clinical report submission failed',
      });
    }
    if (!updated) {
      return this.resolveSubmissionAtomicMiss(context, input.expectedUpdatedAt);
    }
    return {
      report: this.publicMapper.toPublicReport(updated),
      submissionReceipt: {
        submissionId,
        submittedAt,
        submittedBy: this.toPublicActor(actor),
        submissionNote: prepared.submission.submissionNote,
        alreadySubmitted: false,
      },
    };
  }

  async confirmReport(
    patientId: string,
    visitId: string,
    reportId: string,
    currentUser: AuthenticatedUserContext | undefined,
    input: ConfirmClinicalReportDto,
  ): Promise<ConfirmClinicalReportResponse> {
    if (input.confirm !== true) {
      throw new BadRequestException({
        code: 'CLINICAL_REPORT_CONFIRMATION_REQUIRED',
        message: 'Clinical report confirmation must be explicit',
      });
    }
    const actor = this.requireConfirmationActor(currentUser);
    const context = await this.loadReportContext(patientId, visitId, reportId);
    this.assertClinicalWriteState(context);
    const existing = this.resolveExistingConfirmation(context.report);
    if (existing) {
      return existing;
    }
    if (context.report.status === 'voided') {
      this.throwVoided();
    }
    if (context.report.status !== 'pending_confirmation') {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_NOT_READY_FOR_CONFIRMATION',
        message: 'Clinical report is not ready for confirmation',
      });
    }
    const confirmedAt = new Date();
    const confirmationId = randomUUID();
    const prepared = this.applyRule(() =>
      prepareClinicalReportConfirmation({
        report: context.report,
        confirmationId,
        confirmedAt,
        actor,
        confirmationNote: input.confirmationNote,
      }),
    );
    const expectedUpdatedAt = this.parseExpectedUpdatedAt(
      input.expectedUpdatedAt,
    );
    let updated: ClinicalReportSummary | null;
    try {
      updated = await this.reportsService.confirmReportIfUnmodified({
        reportId,
        patientId,
        assessmentVisitId: visitId,
        expectedUpdatedAt,
        confirmation: prepared.confirmation,
        metadata: prepared.metadata,
      });
    } catch {
      throw new InternalServerErrorException({
        code: 'CLINICAL_REPORT_CONFIRMATION_FAILED',
        message: 'Clinical report confirmation failed',
      });
    }
    if (!updated) {
      return this.resolveConfirmationAtomicMiss(
        context,
        input.expectedUpdatedAt,
      );
    }
    return {
      report: this.publicMapper.toPublicReport(updated),
      confirmationReceipt: {
        confirmationId,
        confirmedAt,
        confirmedBy: this.toPublicActor(actor),
        confirmationNote: prepared.confirmation.confirmationNote,
        alreadyConfirmed: false,
      },
    };
  }

  private async loadReportContext(
    patientId: string,
    visitId: string,
    reportId: string,
  ): Promise<ReportWorkflowContext> {
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

  private assertClinicalWriteState(context: ReportWorkflowContext): void {
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

  private assertDraftEditable(report: ClinicalReportSummary): void {
    if (report.status === 'voided') {
      this.throwVoided();
    }
    if (
      report.status !== 'draft' ||
      !['system_draft', 'mixed'].includes(report.source) ||
      report.confirmation !== null ||
      report.lockedAt !== null ||
      report.archivedAt !== null ||
      report.voidedAt !== null
    ) {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_NOT_EDITABLE',
        message: 'Clinical report is not editable',
      });
    }
  }

  private assertDraftForSubmission(report: ClinicalReportSummary): void {
    if (report.status === 'voided') {
      this.throwVoided();
    }
    if (report.status !== 'draft') {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_NOT_READY_FOR_SUBMISSION',
        message: 'Clinical report is not ready for submission',
      });
    }
  }

  private requireWorkflowActor(
    currentUser: AuthenticatedUserContext | undefined,
  ): ClinicalReportWorkflowActor {
    return this.buildActor(currentUser, REPORT_ACTOR_PRIORITY);
  }

  private requireConfirmationActor(
    currentUser: AuthenticatedUserContext | undefined,
  ): ClinicalReportWorkflowActor & {
    operatorRole: Extract<ReportOperatorRole, 'doctor' | 'admin'>;
  } {
    const actor = this.buildActor(currentUser, CONFIRM_ACTOR_PRIORITY);
    if (actor.operatorRole !== 'doctor' && actor.operatorRole !== 'admin') {
      throw new ForbiddenException();
    }
    return {
      ...actor,
      operatorRole: actor.operatorRole,
    };
  }

  private buildActor(
    currentUser: AuthenticatedUserContext | undefined,
    priority: readonly ReportOperatorRole[],
  ): ClinicalReportWorkflowActor {
    if (!currentUser || !Types.ObjectId.isValid(currentUser.id)) {
      throw new UnauthorizedException();
    }
    const operatorId = new Types.ObjectId(currentUser.id).toString();
    if (operatorId !== currentUser.id.trim().toLowerCase()) {
      throw new UnauthorizedException();
    }
    const operatorRole =
      priority.find((role) => currentUser.roles.includes(role)) ?? 'unknown';
    if (operatorRole === 'unknown') {
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

  private applyRule<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error: unknown) {
      if (error instanceof ClinicalReportReviewRuleError) {
        throw new ConflictException({
          code: error.code,
          message: 'Clinical report workflow conflicts with current report',
        });
      }
      throw error;
    }
  }

  private resolveExistingSubmission(
    report: ClinicalReportSummary,
  ): SubmitClinicalReportForConfirmationResponse | null {
    if (report.status === 'voided') {
      this.throwVoided();
    }
    if (report.status === 'pending_confirmation') {
      const submission = readClinicalReportSubmission(report.metadata);
      if (!submission) {
        throw new ConflictException({
          code: 'CLINICAL_REPORT_SUBMISSION_AUDIT_UNAVAILABLE',
          message: 'Clinical report submission audit is unavailable',
        });
      }
      return this.buildAlreadySubmittedResponse(report, {
        submissionId: submission.submissionId,
        submittedAt: submission.submittedAt,
        submittedBy: {
          operatorId: submission.submittedBy,
          operatorName: submission.submittedByName,
          operatorRole: submission.submittedByRole,
        },
        submissionNote: submission.submissionNote,
        alreadySubmitted: true,
      });
    }
    if (['confirmed', 'archived', 'corrected'].includes(report.status)) {
      if (!report.confirmation?.confirmedAt) {
        throw new ConflictException({
          code: 'CLINICAL_REPORT_SUBMISSION_AUDIT_UNAVAILABLE',
          message: 'Clinical report submission audit is unavailable',
        });
      }
      const submission = readClinicalReportSubmission(report.metadata);
      return this.buildAlreadySubmittedResponse(
        report,
        submission
          ? {
              submissionId: submission.submissionId,
              submittedAt: submission.submittedAt,
              submittedBy: {
                operatorId: submission.submittedBy,
                operatorName: submission.submittedByName,
                operatorRole: submission.submittedByRole,
              },
              submissionNote: submission.submissionNote,
              alreadySubmitted: true,
            }
          : {
              submissionId: null,
              submittedAt: null,
              submittedBy: null,
              alreadySubmitted: true,
            },
      );
    }
    return null;
  }

  private buildAlreadySubmittedResponse(
    report: ClinicalReportSummary,
    receipt: SubmitClinicalReportReceiptResponse,
  ): SubmitClinicalReportForConfirmationResponse {
    return {
      report: this.publicMapper.toPublicReport(report),
      submissionReceipt: receipt,
    };
  }

  private resolveExistingConfirmation(
    report: ClinicalReportSummary,
  ): ConfirmClinicalReportResponse | null {
    if (!['confirmed', 'archived', 'corrected'].includes(report.status)) {
      return null;
    }
    if (!report.confirmation?.confirmedAt) {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_CONFIRMATION_AUDIT_UNAVAILABLE',
        message: 'Clinical report confirmation audit is unavailable',
      });
    }
    const auditNamespace = isPlainRecord(report.metadata)
      ? report.metadata.a21Confirmation
      : undefined;
    const audit = readClinicalReportConfirmation(report.metadata);
    if (auditNamespace !== undefined && !audit) {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_CONFIRMATION_AUDIT_UNAVAILABLE',
        message: 'Clinical report confirmation audit is unavailable',
      });
    }
    const receipt: ConfirmClinicalReportReceiptResponse = audit
      ? {
          confirmationId: audit.confirmationId,
          confirmedAt: audit.confirmedAt,
          confirmedBy: {
            operatorId: audit.confirmedBy,
            operatorName: audit.confirmedByName,
            operatorRole: audit.confirmedByRole,
          },
          confirmationNote: audit.confirmationNote,
          alreadyConfirmed: true,
        }
      : {
          confirmationId: null,
          confirmedAt: report.confirmation.confirmedAt,
          confirmedBy: {
            operatorId: report.confirmation.confirmedBy,
            ...(report.confirmation.confirmedByName
              ? { operatorName: report.confirmation.confirmedByName }
              : {}),
            operatorRole: report.confirmation.confirmedByRole ?? 'unknown',
          },
          ...(report.confirmation.confirmationNote
            ? { confirmationNote: report.confirmation.confirmationNote }
            : {}),
          alreadyConfirmed: true,
        };
    return {
      report: this.publicMapper.toPublicReport(report),
      confirmationReceipt: receipt,
    };
  }

  private async resolveEditAtomicMiss(
    context: ReportWorkflowContext,
    expectedUpdatedAt: string,
  ): Promise<UpdateClinicalReportDraftResponse> {
    const current = await this.reloadReport(context);
    if (current.status === 'voided') {
      this.throwVoided();
    }
    if (current.status !== 'draft') {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_NOT_EDITABLE',
        message: 'Clinical report is not editable',
      });
    }
    if (!this.sameTimestamp(current.updatedAt, expectedUpdatedAt)) {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_EDIT_CONFLICT',
        message: 'Clinical report changed after it was read',
      });
    }
    throw new InternalServerErrorException({
      code: 'CLINICAL_REPORT_EDIT_FAILED',
      message: 'Clinical report edit failed',
    });
  }

  private async resolveSubmissionAtomicMiss(
    context: ReportWorkflowContext,
    expectedUpdatedAt: string,
  ): Promise<SubmitClinicalReportForConfirmationResponse> {
    const current = await this.reloadReport(context);
    const existing = this.resolveExistingSubmission(current);
    if (existing) {
      return existing;
    }
    if (!this.sameTimestamp(current.updatedAt, expectedUpdatedAt)) {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_SUBMISSION_CONFLICT',
        message: 'Clinical report changed after it was read',
      });
    }
    throw new InternalServerErrorException({
      code: 'CLINICAL_REPORT_SUBMISSION_FAILED',
      message: 'Clinical report submission failed',
    });
  }

  private async resolveConfirmationAtomicMiss(
    context: ReportWorkflowContext,
    expectedUpdatedAt: string,
  ): Promise<ConfirmClinicalReportResponse> {
    const current = await this.reloadReport(context);
    const existing = this.resolveExistingConfirmation(current);
    if (existing) {
      return existing;
    }
    if (current.status === 'voided') {
      this.throwVoided();
    }
    if (!this.sameTimestamp(current.updatedAt, expectedUpdatedAt)) {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_CONFIRMATION_CONFLICT',
        message: 'Clinical report changed after it was read',
      });
    }
    if (current.status !== 'pending_confirmation') {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_NOT_READY_FOR_CONFIRMATION',
        message: 'Clinical report is not ready for confirmation',
      });
    }
    throw new InternalServerErrorException({
      code: 'CLINICAL_REPORT_CONFIRMATION_FAILED',
      message: 'Clinical report confirmation failed',
    });
  }

  private async reloadReport(
    context: ReportWorkflowContext,
  ): Promise<ClinicalReportSummary> {
    const report = await this.reportsService.findReportByOwnership({
      reportId: context.report.id,
      patientId: context.patient.id,
      assessmentVisitId: context.visit.id,
    });
    if (!report) {
      throw new NotFoundException({
        code: 'CLINICAL_REPORT_NOT_FOUND',
        message: 'Clinical report not found',
      });
    }
    return report;
  }

  private sameTimestamp(value: Date | null, expected: string): boolean {
    return (
      value !== null &&
      value.getTime() === this.parseExpectedUpdatedAt(expected).getTime()
    );
  }

  private toPublicActor(actor: ClinicalReportWorkflowActor) {
    return {
      operatorId: actor.operatorId,
      operatorName: actor.operatorName,
      operatorRole: actor.operatorRole,
    };
  }

  private throwVoided(): never {
    throw new ConflictException({
      code: 'CLINICAL_REPORT_VOIDED',
      message: 'Clinical report is voided',
    });
  }
}
