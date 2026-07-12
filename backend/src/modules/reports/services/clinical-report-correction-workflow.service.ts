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
import { AssessmentsService } from '../../assessments/services/assessments.service';
import { PatientsService } from '../../patients/services/patients.service';
import type { CreateClinicalReportCorrectionDto } from '../dto/create-clinical-report-correction.dto';
import {
  buildClinicalReportCorrectionCompletion,
  buildClinicalReportCorrectionPlan,
  buildClinicalReportCorrectionReplacementRecordedMetadata,
  buildClinicalReportCorrectionStartMetadata,
  buildClinicalReportReplacement,
  ClinicalReportCorrectionRuleError,
  evaluateClinicalReportCorrectionReadiness,
  resolveExistingClinicalReportCorrection,
  validateClinicalReportReplacement,
} from '../lib/clinical-report-correction';
import type {
  ClinicalReportCorrectionActor,
  ClinicalReportCorrectionMetadata,
} from '../types/clinical-report-correction.types';
import type { CreateClinicalReportCorrectionResponse } from '../types/clinical-report-response.types';
import { ClinicalReportPublicMapper } from './clinical-report-public.mapper';
import type { ClinicalReportSummary } from './reports.service';
import { ReportsService } from './reports.service';

type CorrectionContext = {
  patientId: string;
  visitId: string;
  sourceReport: ClinicalReportSummary;
};

@Injectable()
export class ClinicalReportCorrectionWorkflowService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly reportsService: ReportsService,
    private readonly publicMapper: ClinicalReportPublicMapper,
  ) {}

  async createClinicalReportCorrection(
    patientId: string,
    visitId: string,
    reportId: string,
    currentUser: AuthenticatedUserContext | undefined,
    input: CreateClinicalReportCorrectionDto,
  ): Promise<CreateClinicalReportCorrectionResponse> {
    if (input.confirm !== true) {
      throw new BadRequestException({
        code: 'CLINICAL_REPORT_CORRECTION_CONFIRMATION_REQUIRED',
        message: 'Clinical report correction must be explicitly confirmed',
      });
    }
    const actor = this.buildCorrectionActor(currentUser);
    const context = await this.loadCorrectionContext(
      patientId,
      visitId,
      reportId,
    );
    const existing = this.resolveExistingCorrection(context.sourceReport);
    if (existing) {
      return this.resumeOrReturnCompleted(context, existing, actor);
    }
    if (context.sourceReport.status === 'corrected') {
      this.throwAuditUnavailable();
    }

    const expectedUpdatedAt = this.parseExpectedUpdatedAt(
      input.expectedUpdatedAt,
    );
    const latestReport =
      await this.reportsService.findLatestReportByVisitId(visitId);
    if (!latestReport) {
      throw new NotFoundException({
        code: 'CLINICAL_REPORT_NOT_FOUND',
        message: 'Clinical report not found',
      });
    }
    this.applyRule(() =>
      evaluateClinicalReportCorrectionReadiness({
        sourceReport: context.sourceReport,
        latestReport,
        expectedUpdatedAt,
      }),
    );
    const nextVersionReports =
      await this.reportsService.listReportsByVisitTypeVersion(
        visitId,
        'cognitive_assessment',
        context.sourceReport.reportVersion + 1,
      );
    if (nextVersionReports.length !== 0) {
      this.throwReplacementConflict();
    }
    const plan = this.applyRule(() =>
      buildClinicalReportCorrectionPlan({
        sourceReport: context.sourceReport,
        correctionId: randomUUID(),
        startedAt: new Date(),
        actor,
        correctionReason: input.correctionReason,
        changeSummary: input.changeSummary,
      }),
    );
    const metadata = this.applyRule(() =>
      buildClinicalReportCorrectionStartMetadata({
        sourceReport: context.sourceReport,
        plan,
      }),
    );
    let started: ClinicalReportSummary | null;
    try {
      started = await this.reportsService.startCorrectionIfUnmodified({
        reportId,
        patientId,
        assessmentVisitId: visitId,
        reportVersion: context.sourceReport.reportVersion,
        reportCode: context.sourceReport.reportCode,
        expectedUpdatedAt,
        metadata,
      });
    } catch {
      this.throwFailed();
    }
    if (!started) {
      const current = await this.reloadSource(context);
      const raced = this.resolveExistingCorrection(current);
      if (raced) {
        return this.resumeOrReturnCompleted(
          { ...context, sourceReport: current },
          raced,
          actor,
        );
      }
      throw new ConflictException({
        code: 'CLINICAL_REPORT_CORRECTION_CONFLICT',
        message: 'Clinical report changed after it was read',
      });
    }
    const resolution = this.resolveExistingCorrection(started);
    if (!resolution || resolution.state !== 'in_progress') {
      this.throwAuditUnavailable();
    }
    return this.continueCorrection(
      { ...context, sourceReport: started },
      resolution,
      actor,
      false,
    );
  }

  private async loadCorrectionContext(
    patientId: string,
    visitId: string,
    reportId: string,
  ): Promise<CorrectionContext> {
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
    const sourceReport = await this.reportsService.findReportByOwnership({
      reportId,
      patientId,
      assessmentVisitId: visitId,
    });
    if (!sourceReport) {
      throw new NotFoundException({
        code: 'CLINICAL_REPORT_NOT_FOUND',
        message: 'Clinical report not found',
      });
    }
    return { patientId: patient.id, visitId: visit.id, sourceReport };
  }

  private resolveExistingCorrection(
    report: ClinicalReportSummary,
  ): ClinicalReportCorrectionMetadata | null {
    const resolution = this.applyRule(() =>
      resolveExistingClinicalReportCorrection(report),
    );
    return resolution?.audit ?? null;
  }

  private async resumeOrReturnCompleted(
    context: CorrectionContext,
    audit: ClinicalReportCorrectionMetadata,
    actor: ClinicalReportCorrectionActor,
  ): Promise<CreateClinicalReportCorrectionResponse> {
    return audit.state === 'completed'
      ? this.buildCompletedResponse(context, audit, true, false)
      : this.continueCorrection(context, audit, actor, true);
  }

  private async continueCorrection(
    context: CorrectionContext,
    audit: ClinicalReportCorrectionMetadata,
    actor: ClinicalReportCorrectionActor,
    resumedExisting: boolean,
  ): Promise<CreateClinicalReportCorrectionResponse> {
    let replacement = await this.reportsService.findCorrectionReplacementByCode(
      audit.replacementReportCode,
    );
    if (!replacement) {
      const collisions =
        await this.reportsService.listReportsByVisitTypeVersion(
          context.visitId,
          'cognitive_assessment',
          audit.replacementReportVersion,
        );
      if (collisions.length !== 0) {
        this.throwReplacementConflict();
      }
      const replacementInput = this.applyRule(() =>
        buildClinicalReportReplacement({
          sourceReport: context.sourceReport,
          audit,
          createdAt: new Date(),
        }),
      );
      try {
        replacement =
          await this.reportsService.createCorrectionReplacement(
            replacementInput,
          );
      } catch (error: unknown) {
        if (!this.reportsService.isDuplicateKeyError(error)) {
          this.throwFailed();
        }
        replacement = await this.reportsService.findCorrectionReplacementByCode(
          audit.replacementReportCode,
        );
        if (!replacement) {
          this.throwReplacementConflict();
        }
      }
    }
    this.applyRule(() =>
      validateClinicalReportReplacement({
        sourceReport: context.sourceReport,
        replacementReport: replacement,
        audit,
      }),
    );
    let completionSource = context.sourceReport;
    let completionAudit = audit;
    if (
      audit.replacementReportId &&
      audit.replacementReportId !== replacement.id
    ) {
      this.throwReplacementConflict();
    }
    if (!audit.replacementReportId) {
      const recordedMetadata = this.applyRule(() =>
        buildClinicalReportCorrectionReplacementRecordedMetadata({
          sourceReport: context.sourceReport,
          audit,
          replacementReport: replacement,
        }),
      );
      let recorded: ClinicalReportSummary | null;
      try {
        recorded =
          await this.reportsService.recordCorrectionReplacementIfMatching({
            reportId: context.sourceReport.id,
            patientId: context.patientId,
            assessmentVisitId: context.visitId,
            reportVersion: context.sourceReport.reportVersion,
            reportCode: context.sourceReport.reportCode,
            correctionId: audit.correctionId,
            replacementReportId: replacement.id,
            replacementReportCode: audit.replacementReportCode,
            replacementReportVersion: audit.replacementReportVersion,
            metadata: recordedMetadata,
          });
      } catch {
        this.throwFailed();
      }
      completionSource = recorded ?? (await this.reloadSource(context));
      const recordedAudit = this.resolveExistingCorrection(completionSource);
      if (
        !recordedAudit ||
        recordedAudit.state !== 'in_progress' ||
        recordedAudit.replacementReportId !== replacement.id
      ) {
        this.throwAuditUnavailable();
      }
      completionAudit = recordedAudit;
    }
    const completion = this.applyRule(() =>
      buildClinicalReportCorrectionCompletion({
        sourceReport: completionSource,
        replacementReport: replacement,
        audit: completionAudit,
        completedAt: new Date(),
        actor,
      }),
    );
    let completed: ClinicalReportSummary | null;
    try {
      completed = await this.reportsService.completeCorrectionIfMatching({
        reportId: context.sourceReport.id,
        patientId: context.patientId,
        assessmentVisitId: context.visitId,
        reportVersion: completionSource.reportVersion,
        reportCode: completionSource.reportCode,
        correctionId: completionAudit.correctionId,
        replacementReportId: replacement.id,
        replacementReportCode: completionAudit.replacementReportCode,
        replacementReportVersion: completionAudit.replacementReportVersion,
        correctionRecord: completion.correctionRecord,
        metadata: completion.metadata,
      });
    } catch {
      this.throwFailed();
    }
    if (!completed) {
      const current = await this.reloadSource(context);
      const currentAudit = this.resolveExistingCorrection(current);
      if (currentAudit?.state === 'completed') {
        return this.buildCompletedResponse(
          { ...context, sourceReport: current },
          currentAudit,
          true,
          false,
        );
      }
      throw new ConflictException({
        code: 'CLINICAL_REPORT_CORRECTION_CONFLICT',
        message: 'Clinical report correction completion conflicted',
      });
    }
    const completedAudit = this.resolveExistingCorrection(completed);
    if (!completedAudit || completedAudit.state !== 'completed') {
      this.throwAuditUnavailable();
    }
    return this.buildCompletedResponse(
      { ...context, sourceReport: completed },
      completedAudit,
      false,
      resumedExisting,
    );
  }

  private async buildCompletedResponse(
    context: CorrectionContext,
    audit: ClinicalReportCorrectionMetadata,
    alreadyCreated: boolean,
    resumedExisting: boolean,
  ): Promise<CreateClinicalReportCorrectionResponse> {
    if (
      audit.state !== 'completed' ||
      !audit.replacementReportId ||
      !audit.completedAt ||
      !audit.completedBy ||
      !audit.completedByName ||
      !audit.completedByRole
    ) {
      this.throwAuditUnavailable();
    }
    const replacement =
      await this.reportsService.findCorrectionReplacementByCode(
        audit.replacementReportCode,
      );
    if (!replacement || replacement.id !== audit.replacementReportId) {
      this.throwReplacementConflict();
    }
    this.applyRule(() =>
      validateClinicalReportReplacement({
        sourceReport: context.sourceReport,
        replacementReport: replacement,
        audit,
      }),
    );
    return {
      sourceReport: this.publicMapper.toPublicReport(context.sourceReport),
      replacementReport: this.publicMapper.toPublicReport(replacement),
      correctionReceipt: {
        sourceReportId: context.sourceReport.id,
        replacementReportId: replacement.id,
        correctionId: audit.correctionId,
        correctionNo: audit.correctionNo,
        state: 'completed',
        startedAt: new Date(audit.startedAt.getTime()),
        startedBy: {
          operatorId: audit.startedBy,
          operatorName: audit.startedByName,
          operatorRole: audit.startedByRole,
        },
        completedAt: new Date(audit.completedAt.getTime()),
        completedBy: {
          operatorId: audit.completedBy,
          operatorName: audit.completedByName,
          operatorRole: audit.completedByRole,
        },
        correctionReason: audit.correctionReason,
        changeSummary: audit.changeSummary,
        previousReportCode: audit.previousReportCode,
        previousReportVersion: audit.previousReportVersion,
        replacementReportCode: audit.replacementReportCode,
        replacementReportVersion: audit.replacementReportVersion,
        alreadyCreated,
        resumedExisting,
      },
    };
  }

  private buildCorrectionActor(
    currentUser: AuthenticatedUserContext | undefined,
  ): ClinicalReportCorrectionActor {
    if (!currentUser || !Types.ObjectId.isValid(currentUser.id)) {
      throw new UnauthorizedException();
    }
    const operatorId = new Types.ObjectId(currentUser.id).toString();
    if (operatorId !== currentUser.id.trim().toLowerCase()) {
      throw new UnauthorizedException();
    }
    const operatorRole = currentUser.roles.includes('doctor')
      ? 'doctor'
      : currentUser.roles.includes('admin')
        ? 'admin'
        : null;
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

  private async reloadSource(
    context: CorrectionContext,
  ): Promise<ClinicalReportSummary> {
    const report = await this.reportsService.findReportByOwnership({
      reportId: context.sourceReport.id,
      patientId: context.patientId,
      assessmentVisitId: context.visitId,
    });
    if (!report) {
      throw new NotFoundException({
        code: 'CLINICAL_REPORT_NOT_FOUND',
        message: 'Clinical report not found',
      });
    }
    return report;
  }

  private applyRule<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error: unknown) {
      if (error instanceof ClinicalReportCorrectionRuleError) {
        throw new ConflictException({
          code: error.code,
          message: 'Clinical report correction conflicts with current state',
        });
      }
      throw error;
    }
  }

  private throwAuditUnavailable(): never {
    throw new ConflictException({
      code: 'CLINICAL_REPORT_CORRECTION_AUDIT_UNAVAILABLE',
      message: 'Clinical report correction audit is unavailable',
    });
  }

  private throwReplacementConflict(): never {
    throw new ConflictException({
      code: 'CLINICAL_REPORT_CORRECTION_REPLACEMENT_CONFLICT',
      message: 'Clinical report correction replacement conflicts',
    });
  }

  private throwFailed(): never {
    throw new InternalServerErrorException({
      code: 'CLINICAL_REPORT_CORRECTION_FAILED',
      message: 'Clinical report correction failed',
    });
  }
}
