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
  buildStableItemResponseScope,
  itemResponseScopesEqual,
  normalizeItemResponseSubmissionWriteBarrier,
  normalizeScaleInstanceSubmissionWriteBarrier,
  type NormalizedScaleInstanceSubmissionWriteBarrier,
} from '../lib/scale-instance-submission-write-barrier';
import {
  evaluateScaleInstanceSubmissionReadiness,
  type ScaleSubmissionReadinessEvaluation,
} from '../lib/scale-instance-submission-readiness';
import type { AssessmentOperatorRole } from '../schemas/assessment-visit.schema';
import type {
  ScaleInstanceSubmissionAuditResponse,
  ScaleSubmissionReadinessResponse,
  SubmitScaleInstanceResponse,
} from '../types/scale-instance-submission-response.types';
import type {
  AssessmentVisitSummary,
  ItemResponseSummary,
  ScaleInstanceSummary,
} from './assessments.service';
import { AssessmentsService } from './assessments.service';
import { ScaleInstanceSubmissionBarrierService } from './scale-instance-submission-barrier.service';

const EDITABLE_STATUSES = new Set(['draft', 'in_progress']);
const MAX_SUBMISSION_STATE_TRANSITIONS = 12;

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
    private readonly barrierService: ScaleInstanceSubmissionBarrierService,
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

    const currentOperator = this.buildSubmissionOperator(currentUser);

    for (
      let transition = 0;
      transition < MAX_SUBMISSION_STATE_TRANSITIONS;
      transition += 1
    ) {
      const context = await this.loadSubmissionContext(
        patientId,
        visitId,
        scaleInstanceId,
      );
      const parsedParent = normalizeScaleInstanceSubmissionWriteBarrier(
        context.scaleInstance.submissionWriteBarrier,
      );

      if (context.scaleInstance.status === 'completed') {
        this.assertCompletedBarrierConsistency(context, parsedParent);
        return this.buildSubmittedResponse(context, true);
      }

      if (parsedParent.kind === 'invalid') {
        this.throwSubmissionFailed();
      }

      if (parsedParent.kind === 'open') {
        this.assertNoItemResponseBarriers(context.itemResponses);
        const lifecycleError = this.getFirstSubmissionStateError(context);
        if (lifecycleError) {
          throw lifecycleError;
        }
        const firstEvaluation = this.evaluateContext(context, new Date());
        const readinessError = this.getReadinessError(firstEvaluation);
        if (readinessError) {
          throw readinessError;
        }
        const scope = buildStableItemResponseScope(
          context.itemResponses.map((itemResponse) => itemResponse.id),
        );
        if (!scope || scope.length !== context.itemResponses.length) {
          this.throwSubmissionFailed();
        }

        try {
          await this.barrierService.createParentBarrierIfOpen({
            patientId,
            assessmentVisitId: visitId,
            scaleInstanceId,
            barrierId: randomUUID(),
            startedAt: new Date(),
            startedBy: currentOperator.operatorId,
            startedByName: currentOperator.operatorName,
            startedByRole: currentOperator.operatorRole,
            itemResponseIds: scope,
          });
        } catch {
          this.throwSubmissionFailed();
        }
        continue;
      }

      const barrier = parsedParent.value;
      if (barrier.state === 'completed') {
        this.throwSubmissionFailed();
      }

      if (barrier.state === 'releasing') {
        await this.finishBarrierRelease(
          patientId,
          visitId,
          scaleInstanceId,
          barrier,
          false,
        );
        continue;
      }

      const lifecycleError = this.getFirstSubmissionStateError(context);
      if (lifecycleError) {
        const completed = await this.finishBarrierRelease(
          patientId,
          visitId,
          scaleInstanceId,
          barrier,
          true,
        );
        if (completed) {
          continue;
        }
        throw lifecycleError;
      }

      if (barrier.state === 'fencing') {
        try {
          await this.barrierService.fenceItemResponses(
            patientId,
            visitId,
            scaleInstanceId,
            barrier,
          );
          await this.barrierService.markParentFenced(
            patientId,
            visitId,
            scaleInstanceId,
            barrier,
            new Date(),
          );
        } catch {
          this.throwSubmissionFailed();
        }
        continue;
      }

      this.assertFencedScope(context, barrier);
      const completionTime = new Date();
      const secondEvaluation = this.evaluateContext(context, completionTime);
      const readinessError = this.getReadinessError(secondEvaluation);
      if (readinessError) {
        const completed = await this.finishBarrierRelease(
          patientId,
          visitId,
          scaleInstanceId,
          barrier,
          true,
        );
        if (completed) {
          continue;
        }
        throw readinessError;
      }

      const existingStartedAt = context.scaleInstance.startedAt;
      const effectiveStartedAt =
        existingStartedAt ?? secondEvaluation.earliestValidItemTimingStart;
      const durationMs = effectiveStartedAt
        ? Math.max(0, completionTime.getTime() - effectiveStartedAt.getTime())
        : null;
      let completed = false;

      try {
        completed = await this.barrierService.completeScaleInstance({
          patientId,
          assessmentVisitId: visitId,
          scaleInstanceId,
          barrier,
          completionTime,
          ...(existingStartedAt === null && effectiveStartedAt
            ? { startedAtToSet: effectiveStartedAt }
            : {}),
          durationMs,
          readinessSummary: {
            expectedItemCount: secondEvaluation.summary.expectedItemCount,
            actualItemCount: secondEvaluation.summary.actualItemCount,
            completedItemCount: secondEvaluation.summary.completedItemCount,
            blockingIssueCount: secondEvaluation.summary.blockingIssueCount,
            warningCount: secondEvaluation.summary.warningCount,
          },
        });
      } catch {
        this.throwSubmissionFailed();
      }

      if (!completed) {
        continue;
      }

      const completedContext = await this.loadSubmissionContext(
        patientId,
        visitId,
        scaleInstanceId,
      );
      const completedParent = normalizeScaleInstanceSubmissionWriteBarrier(
        completedContext.scaleInstance.submissionWriteBarrier,
      );
      this.assertCompletedBarrierConsistency(completedContext, completedParent);
      return this.buildSubmittedResponse(completedContext, false);
    }

    this.throwSubmissionFailed();
  }

  private async finishBarrierRelease(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    barrier: NormalizedScaleInstanceSubmissionWriteBarrier,
    claimRelease: boolean,
  ): Promise<boolean> {
    try {
      if (claimRelease) {
        await this.barrierService.claimRelease(
          patientId,
          visitId,
          scaleInstanceId,
          barrier.barrierId,
          new Date(),
        );
      }

      const current = await this.loadSubmissionContext(
        patientId,
        visitId,
        scaleInstanceId,
      );
      if (current.scaleInstance.status === 'completed') {
        const completedParent = normalizeScaleInstanceSubmissionWriteBarrier(
          current.scaleInstance.submissionWriteBarrier,
        );
        this.assertCompletedBarrierConsistency(current, completedParent);
        return true;
      }

      const parsedParent = normalizeScaleInstanceSubmissionWriteBarrier(
        current.scaleInstance.submissionWriteBarrier,
      );
      if (parsedParent.kind === 'open') {
        return false;
      }
      if (parsedParent.kind !== 'valid') {
        this.throwSubmissionFailed();
      }
      if (parsedParent.value.barrierId !== barrier.barrierId) {
        return false;
      }
      if (parsedParent.value.state !== 'releasing') {
        this.throwSubmissionFailed();
      }

      await this.barrierService.releaseItemResponses(
        patientId,
        visitId,
        scaleInstanceId,
        parsedParent.value,
      );
      const cleared = await this.barrierService.clearParentBarrier(
        patientId,
        visitId,
        scaleInstanceId,
        barrier.barrierId,
      );
      if (!cleared) {
        const after = await this.loadSubmissionContext(
          patientId,
          visitId,
          scaleInstanceId,
        );
        if (after.scaleInstance.status === 'completed') {
          const completedParent = normalizeScaleInstanceSubmissionWriteBarrier(
            after.scaleInstance.submissionWriteBarrier,
          );
          this.assertCompletedBarrierConsistency(after, completedParent);
          return true;
        }
        const afterParent = normalizeScaleInstanceSubmissionWriteBarrier(
          after.scaleInstance.submissionWriteBarrier,
        );
        if (
          afterParent.kind === 'valid' &&
          afterParent.value.barrierId === barrier.barrierId
        ) {
          this.throwSubmissionFailed();
        }
      }
      return false;
    } catch (error: unknown) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      this.throwSubmissionFailed();
    }
  }

  private assertNoItemResponseBarriers(
    itemResponses: readonly ItemResponseSummary[],
  ): void {
    if (
      itemResponses.some(
        (itemResponse) =>
          normalizeItemResponseSubmissionWriteBarrier(
            itemResponse.submissionWriteBarrier,
          ).kind !== 'open',
      )
    ) {
      this.throwSubmissionFailed();
    }
  }

  private assertFencedScope(
    context: SubmissionContext,
    barrier: NormalizedScaleInstanceSubmissionWriteBarrier,
  ): void {
    const actualScope = context.itemResponses.map((itemResponse) =>
      itemResponse.id.toLowerCase(),
    );

    if (
      context.itemResponses.length !== barrier.expectedItemCount ||
      !itemResponseScopesEqual(actualScope, barrier.itemResponseIds) ||
      context.itemResponses.some((itemResponse) => {
        const parsed = normalizeItemResponseSubmissionWriteBarrier(
          itemResponse.submissionWriteBarrier,
        );
        return (
          parsed.kind !== 'valid' ||
          parsed.value.barrierId !== barrier.barrierId
        );
      })
    ) {
      this.throwSubmissionFailed();
    }
  }

  private assertCompletedBarrierConsistency(
    context: SubmissionContext,
    parsedParent: ReturnType<
      typeof normalizeScaleInstanceSubmissionWriteBarrier
    >,
  ): void {
    if (parsedParent.kind === 'open') {
      this.assertNoItemResponseBarriers(context.itemResponses);
      return;
    }
    if (
      parsedParent.kind !== 'valid' ||
      parsedParent.value.state !== 'completed'
    ) {
      this.throwSubmissionFailed();
    }
    this.assertFencedScope(context, parsedParent.value);
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

  private getFirstSubmissionStateError(
    context: SubmissionContext,
  ): ConflictException | null {
    if (
      context.scaleInstance.status === 'locked' ||
      context.scaleInstance.status === 'voided' ||
      context.scaleInstance.lockedAt instanceof Date
    ) {
      return new ConflictException({
        code: 'SCALE_INSTANCE_NOT_SUBMITTABLE',
        message: 'Scale instance is not submittable',
      });
    }
    if (context.patient.status !== 'active') {
      return new ConflictException({
        code: 'PATIENT_NOT_ACTIVE',
        message: 'Patient is not active',
      });
    }
    if (!EDITABLE_STATUSES.has(context.visit.status)) {
      return new ConflictException({
        code: 'VISIT_NOT_EDITABLE',
        message: 'Assessment visit is not editable',
      });
    }
    if (!EDITABLE_STATUSES.has(context.scaleInstance.status)) {
      return new ConflictException({
        code: 'SCALE_INSTANCE_NOT_SUBMITTABLE',
        message: 'Scale instance is not submittable',
      });
    }
    return null;
  }

  private getReadinessError(
    evaluation: ScaleSubmissionReadinessEvaluation,
  ): ConflictException | null {
    if (
      evaluation.blockingIssues.some(
        (issue) => issue.code === 'SCALE_INSTANCE_START_TIME_INVALID',
      )
    ) {
      return new ConflictException({
        code: 'SCALE_INSTANCE_START_TIME_INVALID',
        message: 'Scale instance start time is invalid',
      });
    }
    if (!evaluation.ready) {
      return new ConflictException({
        code: 'SCALE_INSTANCE_NOT_READY',
        message: 'Scale instance is not ready for submission',
      });
    }
    return null;
  }

  private buildSubmissionOperator(
    currentUser: AuthenticatedUserContext,
  ): SubmissionOperator {
    const operatorRole = (
      ['doctor', 'nurse', 'research_assistant', 'admin'] as const
    ).find((role) => currentUser.roles.includes(role));

    return {
      operatorId: currentUser.id,
      operatorName:
        currentUser.displayName.trim() || currentUser.accountName.trim(),
      operatorRole: operatorRole ?? 'unknown',
    };
  }

  private buildSubmittedResponse(
    context: SubmissionContext,
    alreadySubmitted: boolean,
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
        alreadySubmitted,
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

  private throwSubmissionFailed(): never {
    throw new InternalServerErrorException({
      code: 'SCALE_INSTANCE_SUBMISSION_FAILED',
      message: 'Scale instance submission failed',
    });
  }
}
