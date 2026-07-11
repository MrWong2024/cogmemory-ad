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
import type {
  AssessmentVisitSummary,
  ItemResponseSummary,
  ScaleInstanceSummary,
} from '../../assessments/services/assessments.service';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import type { PatientSummary } from '../../patients/services/patients.service';
import { PatientsService } from '../../patients/services/patients.service';
import type {
  ScaleDefinitionSummary,
  ScaleVersionSummary,
} from '../../scales/services/scales.service';
import { ScalesService } from '../../scales/services/scales.service';
import type { ConfirmScoreResultDto } from '../dto/confirm-score-result.dto';
import type { ReviewScoreItemDto } from '../dto/review-score-item.dto';
import {
  evaluateScoreConfirmationReadiness,
  finalizeManualScoreReview,
  prepareManualScoreReview,
  prepareScoreConfirmation,
  readConfirmationAudit,
  ScoreReviewRuleError,
} from '../lib/manual-score-review';
import type {
  ConfirmScoreResultResponse,
  ProvisionalScoreScaleResponse,
  ReviewScoreItemResponse,
  ScoreResultActorResponse,
  ScoreResultConfirmationReceiptResponse,
  ScoreResultDetailResponse,
} from '../types/score-result-response.types';
import type {
  ManualScoreReviewUpdate,
  ScoreReviewActor,
} from '../types/score-review.types';
import { ScoreResultPublicMapper } from './score-result-public.mapper';
import type { ScoreResultSummary } from './scoring.service';
import { ScoringService } from './scoring.service';

const REVIEWABLE_VISIT_STATUSES = new Set([
  'draft',
  'in_progress',
  'completed',
]);

type ScoreReviewContext = {
  patient: PatientSummary;
  visit: AssessmentVisitSummary;
  scaleInstance: ScaleInstanceSummary;
  definition: ScaleDefinitionSummary;
  version: ScaleVersionSummary;
  itemResponses: ItemResponseSummary[];
  result: ScoreResultSummary;
};

@Injectable()
export class ScoreReviewWorkflowService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly scalesService: ScalesService,
    private readonly scoringService: ScoringService,
    private readonly publicMapper: ScoreResultPublicMapper,
  ) {}

  async reviewScoreItem(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    scoreResultId: string,
    itemResponseId: string,
    currentUser: AuthenticatedUserContext | undefined,
    input: ReviewScoreItemDto,
  ): Promise<ReviewScoreItemResponse> {
    const actor = this.requireActor(currentUser);
    const context = await this.loadReviewContext(
      patientId,
      visitId,
      scaleInstanceId,
      scoreResultId,
    );
    this.assertReviewableState(context);
    const scoreItem = context.result.itemScores.find(
      (item) => item.itemResponseId === itemResponseId,
    );
    if (!scoreItem) {
      throw new NotFoundException({
        code: 'SCORE_ITEM_NOT_FOUND',
        message: 'Score item not found',
      });
    }
    const itemResponse =
      await this.assessmentsService.findItemResponseByOwnership(
        patientId,
        visitId,
        scaleInstanceId,
        itemResponseId,
      );
    if (!itemResponse) {
      throw new NotFoundException({
        code: 'SCORE_ITEM_REVIEW_TARGET_UNAVAILABLE',
        message: 'Score item review target is unavailable',
      });
    }
    if (
      itemResponse.itemCode !== scoreItem.itemCode ||
      !context.version.items.some((item) => item.code === itemResponse.itemCode)
    ) {
      throw new ConflictException({
        code: 'SCORE_INPUT_INVALID',
        message: 'Score input is invalid',
      });
    }
    const reviewedAt = new Date();
    const eventId = randomUUID();
    let update: ManualScoreReviewUpdate;
    try {
      const prepared = prepareManualScoreReview({
        result: context.result,
        version: context.version,
        itemResponseId,
        scoreValue: input.scoreValue,
        reviewNote: input.reviewNote,
        reviewedAt,
        eventId,
        actor,
      });
      const summary = this.scoringService.summarizeItemScores(
        prepared.itemScores,
        { provisional: true },
      );
      update = finalizeManualScoreReview({
        prepared,
        version: context.version,
        summary,
        actor,
        reviewedAt,
        reviewNote: input.reviewNote,
      });
    } catch (error: unknown) {
      this.rethrowRuleError(error);
    }

    let updated: ScoreResultSummary | null;
    try {
      updated = await this.scoringService.reviewScoreItemIfUnmodified({
        scoreResultId,
        patientId,
        assessmentVisitId: visitId,
        scaleInstanceId,
        expectedUpdatedAt: new Date(input.expectedUpdatedAt),
        itemScores: update.itemScores,
        groupScores: update.groupScores,
        totalScore: update.totalScore,
        status: update.status,
        scoringSource: update.scoringSource,
        review: update.review,
        qualityStatus: update.qualityStatus,
        metadata: update.metadata,
      });
    } catch {
      throw new InternalServerErrorException({
        code: 'SCORE_RESULT_REVIEW_FAILED',
        message: 'Score review failed',
      });
    }
    if (!updated) {
      return this.handleReviewAtomicMiss(context, input.expectedUpdatedAt);
    }
    return {
      ...this.buildDetailResponse({ ...context, result: updated }, updated),
      reviewUpdate: {
        eventId,
        itemResponseId,
        reviewedAt,
        reviewer: this.toPublicActor(actor),
        pendingItemCount: update.pendingItemCount,
      },
    };
  }

  async confirmScoreResult(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    scoreResultId: string,
    currentUser: AuthenticatedUserContext | undefined,
    input: ConfirmScoreResultDto,
  ): Promise<ConfirmScoreResultResponse> {
    if (input.confirm !== true) {
      throw new BadRequestException({
        code: 'SCORE_RESULT_CONFIRMATION_REQUIRED',
        message: 'Score result confirmation must be explicit',
      });
    }
    const actor = this.requireActor(currentUser);
    const context = await this.loadReviewContext(
      patientId,
      visitId,
      scaleInstanceId,
      scoreResultId,
    );
    if (
      context.result.status === 'confirmed' ||
      context.result.status === 'locked'
    ) {
      return this.buildAlreadyConfirmedResponse(context);
    }
    if (context.result.status === 'voided') {
      throw new ConflictException({
        code: 'SCORE_RESULT_VOIDED',
        message: 'Score result is voided',
      });
    }
    this.assertConfirmationState(context);
    const summary = this.scoringService.summarizeItemScores(
      context.result.itemScores,
      { provisional: true },
    );
    const confirmedAt = new Date();
    const confirmationId = randomUUID();
    let finalized: ReturnType<typeof evaluateScoreConfirmationReadiness>;
    let confirmation: ReturnType<typeof prepareScoreConfirmation>;
    try {
      finalized = evaluateScoreConfirmationReadiness({
        result: context.result,
        version: context.version,
        summary,
      });
      confirmation = prepareScoreConfirmation({
        result: context.result,
        confirmationId,
        confirmedAt,
        actor,
        reviewNote: input.reviewNote,
      });
    } catch (error: unknown) {
      this.rethrowRuleError(error);
    }
    let updated: ScoreResultSummary | null;
    try {
      updated = await this.scoringService.confirmScoreResultIfUnmodified({
        scoreResultId,
        patientId,
        assessmentVisitId: visitId,
        scaleInstanceId,
        expectedUpdatedAt: new Date(input.expectedUpdatedAt),
        confirmedAt,
        totalScore: finalized.totalScore,
        groupScores: finalized.groupScores,
        review: {
          reviewStatus: 'reviewed',
          reviewedAt: confirmedAt,
          reviewerId: actor.operatorId,
          reviewerName: actor.operatorName,
          reviewNote: input.reviewNote,
        },
        metadata: confirmation.metadata,
      });
    } catch {
      throw new InternalServerErrorException({
        code: 'SCORE_RESULT_CONFIRMATION_FAILED',
        message: 'Score result confirmation failed',
      });
    }
    if (!updated) {
      return this.handleConfirmationAtomicMiss(
        context,
        input.expectedUpdatedAt,
      );
    }
    return {
      ...this.buildDetailResponse({ ...context, result: updated }, updated),
      confirmationReceipt: {
        confirmationId,
        confirmedAt,
        confirmedBy: this.toPublicActor(actor),
        reviewNote: input.reviewNote,
        alreadyConfirmed: false,
      },
    };
  }

  private async loadReviewContext(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    scoreResultId: string,
  ): Promise<ScoreReviewContext> {
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
    const result = await this.scoringService.findScoreResultByOwnership({
      scoreResultId,
      patientId,
      assessmentVisitId: visitId,
      scaleInstanceId,
    });
    if (!result) {
      throw new NotFoundException({
        code: 'SCORE_RESULT_NOT_FOUND',
        message: 'Score result not found',
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
      result.scaleDefinitionId !== scaleInstance.scaleDefinitionId ||
      result.scaleVersionId !== scaleInstance.scaleVersionId ||
      result.scaleCode !== scaleInstance.scaleCode ||
      result.scaleVersion !== scaleInstance.scaleVersion ||
      result.instanceCode !== scaleInstance.instanceCode
    ) {
      throw new ConflictException({
        code: 'SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE',
        message: 'Scale instance configuration is unavailable',
      });
    }
    const ownershipMatches = itemResponses.every(
      (item) =>
        item.patientId === patient.id &&
        item.assessmentVisitId === visit.id &&
        item.scaleInstanceId === scaleInstance.id &&
        item.scaleDefinitionId === scaleInstance.scaleDefinitionId &&
        item.scaleVersionId === scaleInstance.scaleVersionId &&
        item.scaleCode === scaleInstance.scaleCode &&
        item.scaleVersion === scaleInstance.scaleVersion,
    );
    if (!ownershipMatches) {
      throw new ConflictException({
        code: 'SCORE_INPUT_INVALID',
        message: 'Score input is invalid',
      });
    }
    return {
      patient,
      visit,
      scaleInstance,
      definition,
      version,
      itemResponses,
      result,
    };
  }

  private assertReviewableState(context: ScoreReviewContext): void {
    this.assertMutableClinicalState(context);
    if (
      context.result.status !== 'needs_review' &&
      context.result.status !== 'computed'
    ) {
      throw new ConflictException({
        code: 'SCORE_RESULT_NOT_REVIEWABLE',
        message: 'Score result is not reviewable',
      });
    }
  }

  private assertConfirmationState(context: ScoreReviewContext): void {
    this.assertMutableClinicalState(context);
    if (context.result.status !== 'computed') {
      throw new ConflictException({
        code: 'SCORE_RESULT_NOT_READY_FOR_CONFIRMATION',
        message: 'Score result is not ready for confirmation',
      });
    }
  }

  private assertMutableClinicalState(context: ScoreReviewContext): void {
    if (context.patient.status !== 'active') {
      throw new ConflictException({
        code: 'PATIENT_NOT_ACTIVE',
        message: 'Patient is not active',
      });
    }
    if (!REVIEWABLE_VISIT_STATUSES.has(context.visit.status)) {
      throw new ConflictException({
        code: 'VISIT_NOT_EDITABLE',
        message: 'Assessment visit is not editable',
      });
    }
    if (context.scaleInstance.status !== 'completed') {
      throw new ConflictException({
        code: 'SCORE_INSTANCE_NOT_COMPUTABLE',
        message: 'Scale instance is not computable',
      });
    }
  }

  private requireActor(
    currentUser: AuthenticatedUserContext | undefined,
  ): ScoreReviewActor {
    if (!currentUser) {
      throw new UnauthorizedException();
    }
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

  private async handleReviewAtomicMiss(
    context: ScoreReviewContext,
    expectedUpdatedAt: string,
  ): Promise<ReviewScoreItemResponse> {
    const current = await this.reloadResult(context);
    if (
      current.status === 'confirmed' ||
      current.status === 'locked' ||
      current.status === 'draft' ||
      current.status === 'voided'
    ) {
      throw new ConflictException({
        code:
          current.status === 'voided'
            ? 'SCORE_RESULT_VOIDED'
            : 'SCORE_RESULT_NOT_REVIEWABLE',
        message: 'Score result is not reviewable',
      });
    }
    if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw new ConflictException({
        code: 'SCORE_RESULT_REVIEW_CONFLICT',
        message: 'Score result changed after it was read',
      });
    }
    throw new InternalServerErrorException({
      code: 'SCORE_RESULT_REVIEW_FAILED',
      message: 'Score review failed',
    });
  }

  private async handleConfirmationAtomicMiss(
    context: ScoreReviewContext,
    expectedUpdatedAt: string,
  ): Promise<ConfirmScoreResultResponse> {
    const current = await this.reloadResult(context);
    if (current.status === 'confirmed' || current.status === 'locked') {
      return this.buildAlreadyConfirmedResponse({
        ...context,
        result: current,
      });
    }
    if (current.status === 'voided') {
      throw new ConflictException({
        code: 'SCORE_RESULT_VOIDED',
        message: 'Score result is voided',
      });
    }
    if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw new ConflictException({
        code: 'SCORE_RESULT_CONFIRMATION_CONFLICT',
        message: 'Score result changed after it was read',
      });
    }
    if (current.status !== 'computed') {
      throw new ConflictException({
        code: 'SCORE_RESULT_NOT_READY_FOR_CONFIRMATION',
        message: 'Score result is not ready for confirmation',
      });
    }
    throw new InternalServerErrorException({
      code: 'SCORE_RESULT_CONFIRMATION_FAILED',
      message: 'Score result confirmation failed',
    });
  }

  private async reloadResult(
    context: ScoreReviewContext,
  ): Promise<ScoreResultSummary> {
    const current = await this.scoringService.findScoreResultByOwnership({
      scoreResultId: context.result.id,
      patientId: context.patient.id,
      assessmentVisitId: context.visit.id,
      scaleInstanceId: context.scaleInstance.id,
    });
    if (!current) {
      throw new NotFoundException({
        code: 'SCORE_RESULT_NOT_FOUND',
        message: 'Score result not found',
      });
    }
    return current;
  }

  private buildAlreadyConfirmedResponse(
    context: ScoreReviewContext,
  ): ConfirmScoreResultResponse {
    const receipt = this.resolveExistingConfirmation(context.result);
    return {
      ...this.buildDetailResponse(context, context.result),
      confirmationReceipt: { ...receipt, alreadyConfirmed: true },
    };
  }

  private resolveExistingConfirmation(
    result: ScoreResultSummary,
  ): Omit<ScoreResultConfirmationReceiptResponse, 'alreadyConfirmed'> {
    if (!result.confirmedAt) {
      throw new ConflictException({
        code: 'SCORE_RESULT_CONFIRMATION_AUDIT_UNAVAILABLE',
        message: 'Score result confirmation audit is unavailable',
      });
    }
    const audit = readConfirmationAudit(result.metadata);
    if (audit) {
      return {
        confirmationId: audit.confirmationId,
        confirmedAt: audit.confirmedAt,
        confirmedBy: {
          operatorId: audit.confirmedBy,
          operatorName: audit.confirmedByName,
          operatorRole: audit.confirmedByRole,
        },
        reviewNote: audit.reviewNote,
      };
    }
    return {
      confirmationId: null,
      confirmedAt: result.confirmedAt,
      confirmedBy: {
        operatorId: result.review?.reviewerId ?? null,
        ...(result.review?.reviewerName
          ? { operatorName: result.review.reviewerName }
          : {}),
        operatorRole: 'unknown',
      },
      ...(result.review?.reviewNote
        ? { reviewNote: result.review.reviewNote }
        : {}),
    };
  }

  private buildDetailResponse(
    context: ScoreReviewContext,
    result: ScoreResultSummary,
  ): ScoreResultDetailResponse {
    const mapped = this.publicMapper.toPublicResult(result, context.version);
    return {
      scale: this.toPublicScale(context),
      scaleInstance: this.assessmentsService.toPublicScaleInstanceResponse(
        context.scaleInstance,
        {
          totalItemCount: context.itemResponses.length,
          answeredItemCount: context.itemResponses.filter(
            (item) => item.status === 'answered' || item.status === 'scored',
          ).length,
        },
      ),
      scoreResult: mapped.scoreResult,
      reviewQueue: mapped.reviewQueue,
    };
  }

  private toPublicScale(
    context: ScoreReviewContext,
  ): ProvisionalScoreScaleResponse {
    return {
      code: context.definition.code,
      name: context.definition.name,
      shortName: context.definition.shortName,
      version: context.version.version,
      displayVersion: context.version.displayVersion,
    };
  }

  private toPublicActor(actor: ScoreReviewActor): ScoreResultActorResponse {
    return {
      operatorId: actor.operatorId,
      operatorName: actor.operatorName,
      operatorRole: actor.operatorRole,
    };
  }

  private rethrowRuleError(error: unknown): never {
    if (!(error instanceof ScoreReviewRuleError)) {
      throw error;
    }
    const message = 'Score review request conflicts with current result';
    if (error.code === 'SCORE_ITEM_NOT_FOUND') {
      throw new NotFoundException({ code: error.code, message });
    }
    throw new ConflictException({ code: error.code, message });
  }
}
