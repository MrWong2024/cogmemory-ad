import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import type { PatientSummary } from '../../patients/services/patients.service';
import { PatientsService } from '../../patients/services/patients.service';
import type {
  ScaleDefinitionSummary,
  ScaleVersionSummary,
} from '../../scales/services/scales.service';
import { ScalesService } from '../../scales/services/scales.service';
import type { SubmitScaleInstanceDto } from '../dto/submit-scale-instance.dto';
import {
  evaluateScaleInstanceSubmissionReadiness,
  type ScaleSubmissionReadinessEvaluation,
} from '../lib/scale-instance-submission-readiness';
import type { AssessmentOperatorRole } from '../schemas/assessment-visit.schema';
import type {
  AssessmentVisitSummary,
  ItemResponseSummary,
  ScaleInstanceSummary,
} from './assessments.service';
import { AssessmentsService } from './assessments.service';
import type {
  ScaleInstanceSubmissionAuditResponse,
  ScaleInstanceSubmissionOperatorResponse,
  ScaleSubmissionReadinessResponse,
  SubmitScaleInstanceResponse,
} from '../types/scale-instance-submission-response.types';

const EDITABLE_STATUSES = new Set(['draft', 'in_progress']);

type SubmissionContext = {
  patient: PatientSummary;
  visit: AssessmentVisitSummary;
  scaleInstance: ScaleInstanceSummary;
  definition: ScaleDefinitionSummary;
  version: ScaleVersionSummary;
  itemResponses: ItemResponseSummary[];
};

type SubmissionOperator = {
  operatorId: string;
  operatorName: string;
  operatorRole: AssessmentOperatorRole;
};

@Injectable()
export class ScaleInstanceSubmissionService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly scalesService: ScalesService,
  ) {}

  async getSubmissionReadiness(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
  ): Promise<ScaleSubmissionReadinessResponse> {
    const context = await this.loadSubmissionContext(
      patientId,
      visitId,
      scaleInstanceId,
    );
    const evaluation = this.evaluateContext(context, new Date());
    return this.toReadinessResponse(context.scaleInstance, evaluation);
  }

  async submitScaleInstance(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    currentUser: AuthenticatedUserContext | undefined,
    input: SubmitScaleInstanceDto,
  ): Promise<SubmitScaleInstanceResponse> {
    if (input.confirm !== true) {
      throw new BadRequestException({
        code: 'SCALE_INSTANCE_SUBMISSION_CONFIRMATION_REQUIRED',
        message: 'Scale instance submission must be explicitly confirmed',
      });
    }

    if (!currentUser) {
      throw new UnauthorizedException();
    }

    const operator = this.buildSubmissionOperator(currentUser);
    const firstContext = await this.loadSubmissionContext(
      patientId,
      visitId,
      scaleInstanceId,
    );

    if (firstContext.scaleInstance.status === 'completed') {
      return this.buildAlreadySubmittedResponse(firstContext);
    }

    this.assertFirstSubmissionState(firstContext);
    const firstEvaluation = this.evaluateContext(firstContext, new Date());
    this.assertReadyForSubmission(firstEvaluation);

    const completionTime = new Date();
    const secondContext = await this.loadSubmissionContext(
      patientId,
      visitId,
      scaleInstanceId,
    );

    if (secondContext.scaleInstance.status === 'completed') {
      return this.buildAlreadySubmittedResponse(secondContext);
    }

    this.assertFirstSubmissionState(secondContext);
    const secondEvaluation = this.evaluateContext(
      secondContext,
      completionTime,
    );
    this.assertReadyForSubmission(secondEvaluation);

    const existingStartedAt = secondContext.scaleInstance.startedAt;
    const effectiveStartedAt =
      existingStartedAt ?? secondEvaluation.earliestValidItemTimingStart;
    const durationMs = effectiveStartedAt
      ? Math.max(0, completionTime.getTime() - effectiveStartedAt.getTime())
      : null;
    const submissionId = randomUUID();
    let completed: ScaleInstanceSummary | null;

    try {
      completed = await this.assessmentsService.completeScaleInstanceIfEditable(
        patientId,
        visitId,
        scaleInstanceId,
        {
          submissionId,
          completionTime,
          ...(existingStartedAt === null && effectiveStartedAt
            ? { startedAtToSet: effectiveStartedAt }
            : {}),
          durationMs,
          submittedBy: operator.operatorId,
          submittedByName: operator.operatorName,
          submittedByRole: operator.operatorRole,
          readinessSummary: {
            expectedItemCount: secondEvaluation.summary.expectedItemCount,
            actualItemCount: secondEvaluation.summary.actualItemCount,
            completedItemCount: secondEvaluation.summary.completedItemCount,
            blockingIssueCount: secondEvaluation.summary.blockingIssueCount,
            warningCount: secondEvaluation.summary.warningCount,
          },
        },
      );
    } catch {
      throw new InternalServerErrorException({
        code: 'SCALE_INSTANCE_SUBMISSION_FAILED',
        message: 'Scale instance submission failed',
      });
    }

    if (!completed) {
      return this.handleAtomicCompletionMiss(
        patientId,
        visitId,
        scaleInstanceId,
      );
    }

    const completedEvaluation = evaluateScaleInstanceSubmissionReadiness({
      patientStatus: secondContext.patient.status,
      visitStatus: secondContext.visit.status,
      scaleInstance: completed,
      versionItems: secondContext.version.items,
      itemResponses: secondContext.itemResponses,
      checkedAt: completionTime,
    });

    return {
      scaleInstance: this.assessmentsService.toPublicScaleInstanceResponse(
        completed,
        {
          totalItemCount: completedEvaluation.summary.actualItemCount,
          answeredItemCount: completedEvaluation.summary.completedItemCount,
        },
      ),
      submission: {
        submissionId,
        submittedAt: completionTime,
        submittedBy: this.toPublicOperator(operator),
        alreadySubmitted: false,
        durationSource: existingStartedAt
          ? 'existing_instance_start'
          : effectiveStartedAt
            ? 'earliest_item_timing'
            : 'unavailable',
      },
      readiness: this.toReadinessResponse(completed, completedEvaluation),
    };
  }

  private async loadSubmissionContext(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
  ): Promise<SubmissionContext> {
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

    const scaleInstance =
      await this.assessmentsService.findScaleInstanceByPatientVisitAndId(
        patientId,
        visitId,
        scaleInstanceId,
      );
    if (!scaleInstance) {
      throw new NotFoundException({
        code: 'SCALE_INSTANCE_NOT_FOUND',
        message: 'Scale instance not found',
      });
    }

    const [definition, version, itemResponses] = await Promise.all([
      this.scalesService.findDefinitionByCode(scaleInstance.scaleCode),
      this.scalesService.findVersionByScaleCodeAndVersion(
        scaleInstance.scaleCode,
        scaleInstance.scaleVersion,
      ),
      this.assessmentsService.listItemResponsesByScaleInstanceId(
        scaleInstance.id,
      ),
    ]);

    if (
      !definition ||
      !version ||
      definition.id !== scaleInstance.scaleDefinitionId ||
      version.id !== scaleInstance.scaleVersionId ||
      version.scaleDefinitionId !== definition.id ||
      version.scaleCode !== scaleInstance.scaleCode ||
      version.version !== scaleInstance.scaleVersion ||
      itemResponses.some(
        (item) =>
          item.patientId !== patient.id ||
          item.assessmentVisitId !== visit.id ||
          item.scaleInstanceId !== scaleInstance.id ||
          item.scaleDefinitionId !== scaleInstance.scaleDefinitionId ||
          item.scaleVersionId !== scaleInstance.scaleVersionId ||
          item.scaleCode !== scaleInstance.scaleCode ||
          item.scaleVersion !== scaleInstance.scaleVersion,
      )
    ) {
      throw new ConflictException({
        code: 'SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE',
        message: 'Scale instance configuration is unavailable',
      });
    }

    return {
      patient,
      visit,
      scaleInstance,
      definition,
      version,
      itemResponses,
    };
  }

  private evaluateContext(
    context: SubmissionContext,
    checkedAt: Date,
  ): ScaleSubmissionReadinessEvaluation {
    return evaluateScaleInstanceSubmissionReadiness({
      patientStatus: context.patient.status,
      visitStatus: context.visit.status,
      scaleInstance: context.scaleInstance,
      versionItems: context.version.items,
      itemResponses: context.itemResponses,
      checkedAt,
    });
  }

  private toReadinessResponse(
    scaleInstance: ScaleInstanceSummary,
    evaluation: ScaleSubmissionReadinessEvaluation,
  ): ScaleSubmissionReadinessResponse {
    return {
      scaleInstance: this.assessmentsService.toPublicScaleInstanceResponse(
        scaleInstance,
        {
          totalItemCount: evaluation.summary.actualItemCount,
          answeredItemCount: evaluation.summary.completedItemCount,
        },
      ),
      checkedAt: evaluation.checkedAt,
      ready: evaluation.ready,
      canSubmitNow: evaluation.canSubmitNow,
      submissionState: evaluation.submissionState,
      ...(evaluation.stateReason
        ? { stateReason: evaluation.stateReason }
        : {}),
      summary: evaluation.summary,
      blockingIssues: evaluation.blockingIssues,
      warnings: evaluation.warnings,
    };
  }

  private assertFirstSubmissionState(context: SubmissionContext): void {
    if (
      context.scaleInstance.status === 'locked' ||
      context.scaleInstance.status === 'voided'
    ) {
      throw new ConflictException({
        code: 'SCALE_INSTANCE_NOT_SUBMITTABLE',
        message: 'Scale instance is not submittable',
      });
    }
    if (context.patient.status !== 'active') {
      throw new ConflictException({
        code: 'PATIENT_NOT_ACTIVE',
        message: 'Patient is not active',
      });
    }
    if (!EDITABLE_STATUSES.has(context.visit.status)) {
      throw new ConflictException({
        code: 'VISIT_NOT_EDITABLE',
        message: 'Assessment visit is not editable',
      });
    }
    if (!EDITABLE_STATUSES.has(context.scaleInstance.status)) {
      throw new ConflictException({
        code: 'SCALE_INSTANCE_NOT_SUBMITTABLE',
        message: 'Scale instance is not submittable',
      });
    }
  }

  private assertReadyForSubmission(
    evaluation: ScaleSubmissionReadinessEvaluation,
  ): void {
    if (
      evaluation.blockingIssues.some(
        (issue) => issue.code === 'SCALE_INSTANCE_START_TIME_INVALID',
      )
    ) {
      throw new ConflictException({
        code: 'SCALE_INSTANCE_START_TIME_INVALID',
        message: 'Scale instance start time is invalid',
      });
    }
    if (!evaluation.ready) {
      throw new ConflictException({
        code: 'SCALE_INSTANCE_NOT_READY',
        message: 'Scale instance is not ready for submission',
      });
    }
  }

  private buildSubmissionOperator(
    currentUser: AuthenticatedUserContext,
  ): SubmissionOperator {
    const operatorRole = (
      ['doctor', 'nurse', 'research_assistant', 'admin'] as const
    ).find((role) => currentUser.roles.includes(role));

    return {
      operatorId: currentUser.id,
      operatorName: currentUser.displayName.trim(),
      operatorRole: operatorRole ?? 'unknown',
    };
  }

  private toPublicOperator(
    operator: SubmissionOperator,
  ): ScaleInstanceSubmissionOperatorResponse {
    return {
      operatorId: operator.operatorId,
      operatorName: operator.operatorName,
      operatorRole: operator.operatorRole,
    };
  }

  private buildAlreadySubmittedResponse(
    context: SubmissionContext,
  ): SubmitScaleInstanceResponse {
    const completedAt = context.scaleInstance.completedAt;
    if (!completedAt) {
      throw new ConflictException({
        code: 'SCALE_INSTANCE_SUBMISSION_AUDIT_UNAVAILABLE',
        message: 'Scale instance submission audit is unavailable',
      });
    }

    const evaluation = this.evaluateContext(context, new Date());
    const audit = this.assessmentsService.readScaleInstanceSubmissionAudit(
      context.scaleInstance,
    );
    const submittedBy = audit?.submittedBy
      ? {
          operatorId: audit.submittedBy,
          ...(audit.submittedByName
            ? { operatorName: audit.submittedByName }
            : {}),
          ...(audit.submittedByRole
            ? { operatorRole: audit.submittedByRole }
            : {}),
        }
      : null;

    return {
      scaleInstance: this.assessmentsService.toPublicScaleInstanceResponse(
        context.scaleInstance,
        {
          totalItemCount: evaluation.summary.actualItemCount,
          answeredItemCount: evaluation.summary.completedItemCount,
        },
      ),
      submission: {
        submissionId: audit?.submissionId ?? null,
        submittedAt: audit?.submittedAt ?? completedAt,
        submittedBy,
        alreadySubmitted: true,
        durationSource: this.deriveExistingDurationSource(context, evaluation),
      },
      readiness: this.toReadinessResponse(context.scaleInstance, evaluation),
    };
  }

  private deriveExistingDurationSource(
    context: SubmissionContext,
    evaluation: ScaleSubmissionReadinessEvaluation,
  ): ScaleInstanceSubmissionAuditResponse['durationSource'] {
    const startedAt = context.scaleInstance.startedAt;
    if (!startedAt) {
      return 'unavailable';
    }

    return evaluation.earliestValidItemTimingStart?.getTime() ===
      startedAt.getTime()
      ? 'earliest_item_timing'
      : 'existing_instance_start';
  }

  private async handleAtomicCompletionMiss(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
  ): Promise<SubmitScaleInstanceResponse> {
    const current =
      await this.assessmentsService.findScaleInstanceByPatientVisitAndId(
        patientId,
        visitId,
        scaleInstanceId,
      );

    if (current?.status === 'completed') {
      const context = await this.loadSubmissionContext(
        patientId,
        visitId,
        scaleInstanceId,
      );
      return this.buildAlreadySubmittedResponse(context);
    }
    if (current?.status === 'locked' || current?.status === 'voided') {
      throw new ConflictException({
        code: 'SCALE_INSTANCE_NOT_SUBMITTABLE',
        message: 'Scale instance is not submittable',
      });
    }

    throw new ConflictException({
      code: 'SCALE_INSTANCE_SUBMISSION_CONFLICT',
      message: 'Scale instance submission conflicted with another update',
    });
  }
}
