import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ComputeScoreResultDto } from '../dto/compute-score-result.dto';
import {
  evaluateProvisionalItems,
  finalizeProvisionalScoring,
  toScoringItemInputs,
} from '../lib/provisional-scoring-engine';
import type { PatientSummary } from '../../patients/services/patients.service';
import { PatientsService } from '../../patients/services/patients.service';
import type {
  AssessmentVisitSummary,
  ItemResponseSummary,
  ScaleInstanceSummary,
} from '../../assessments/services/assessments.service';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import type {
  ScaleDefinitionSummary,
  ScaleVersionSummary,
} from '../../scales/services/scales.service';
import { ScalesService } from '../../scales/services/scales.service';
import {
  PROVISIONAL_SCORING_ENGINE_VERSION,
  type ProvisionalScoringResult,
} from '../types/provisional-scoring.types';
import type {
  ComputeScoreResultResponse,
  ProvisionalScoreScaleResponse,
  ScoreResultDetailResponse,
} from '../types/score-result-response.types';
import type {
  CreateScoreResultInput,
  ScoreResultSummary,
} from './scoring.service';
import { ScoringService } from './scoring.service';
import { ScoreResultPublicMapper } from './score-result-public.mapper';

const COMPUTABLE_VISIT_STATUSES = new Set([
  'draft',
  'in_progress',
  'completed',
]);

type ScoringContext = {
  patient: PatientSummary;
  visit: AssessmentVisitSummary;
  scaleInstance: ScaleInstanceSummary;
  definition: ScaleDefinitionSummary;
  version: ScaleVersionSummary;
  itemResponses: ItemResponseSummary[];
};

type MongoDuplicateKeyError = { code: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMongoDuplicateKeyError(
  error: unknown,
): error is MongoDuplicateKeyError {
  return isRecord(error) && error.code === 11000;
}

@Injectable()
export class ProvisionalScoringWorkflowService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly scalesService: ScalesService,
    private readonly scoringService: ScoringService,
    private readonly publicMapper: ScoreResultPublicMapper,
  ) {}

  async computeScoreResult(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    input: ComputeScoreResultDto,
  ): Promise<ComputeScoreResultResponse> {
    if (input.confirm !== true) {
      throw new BadRequestException({
        code: 'SCORE_COMPUTATION_CONFIRMATION_REQUIRED',
        message: 'Score computation must be explicitly confirmed',
      });
    }

    const context = await this.loadScoringContext(
      patientId,
      visitId,
      scaleInstanceId,
    );
    const existing =
      await this.scoringService.findLatestScoreResultByScaleInstanceId(
        context.scaleInstance.id,
      );
    if (existing) {
      this.assertValidScoringInput(
        context.patient,
        context.visit,
        context.scaleInstance,
        context.version,
        context.itemResponses,
      );
      return {
        ...this.buildDetailResponse(
          context,
          this.resolveReadableResult(existing),
        ),
        alreadyComputed: true,
      };
    }

    this.assertFirstComputationState(context);
    this.assertValidScoringInput(
      context.patient,
      context.visit,
      context.scaleInstance,
      context.version,
      context.itemResponses,
    );
    const computedAt = new Date();
    let provisional: ProvisionalScoringResult;
    try {
      const evaluation = evaluateProvisionalItems(
        context.version.items,
        context.itemResponses,
      );
      const summary = this.scoringService.summarizeItemScores(
        toScoringItemInputs(evaluation),
        { provisional: true },
      );
      provisional = finalizeProvisionalScoring(
        context.version,
        evaluation,
        summary,
      );
    } catch {
      throw new InternalServerErrorException({
        code: 'SCORE_COMPUTATION_FAILED',
        message: 'Score computation failed',
      });
    }

    const createInput = this.buildCreateInput(context, provisional, computedAt);
    let created: ScoreResultSummary;
    try {
      created = await this.scoringService.createScoreResult(createInput);
    } catch (error: unknown) {
      if (isMongoDuplicateKeyError(error)) {
        return this.recoverDuplicateKey(context);
      }
      throw new InternalServerErrorException({
        code: 'SCORE_COMPUTATION_FAILED',
        message: 'Score computation failed',
      });
    }

    return {
      ...this.buildDetailResponse(context, created),
      alreadyComputed: false,
    };
  }

  async getLatestScoreResult(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
  ): Promise<ScoreResultDetailResponse> {
    const context = await this.loadScoringContext(
      patientId,
      visitId,
      scaleInstanceId,
    );
    const result =
      await this.scoringService.findLatestScoreResultByScaleInstanceId(
        context.scaleInstance.id,
      );
    if (!result) {
      throw new NotFoundException({
        code: 'SCORE_RESULT_NOT_FOUND',
        message: 'Score result not found',
      });
    }
    this.assertValidScoringInput(
      context.patient,
      context.visit,
      context.scaleInstance,
      context.version,
      context.itemResponses,
    );
    return this.buildDetailResponse(
      context,
      this.resolveReadableResult(result, true),
    );
  }

  private async loadScoringContext(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
  ): Promise<ScoringContext> {
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
      version.version !== scaleInstance.scaleVersion
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

  private assertValidScoringInput(
    patient: PatientSummary,
    visit: AssessmentVisitSummary,
    scaleInstance: ScaleInstanceSummary,
    version: ScaleVersionSummary,
    itemResponses: ItemResponseSummary[],
  ): void {
    const versionCodes = version.items.map((item) => item.code);
    const responseCodes = itemResponses.map((item) => item.itemCode);
    const uniqueVersionCodes = new Set(versionCodes);
    const uniqueResponseCodes = new Set(responseCodes);
    const totalRange = version.totalScoreRange;
    const itemSetMatches =
      uniqueVersionCodes.size === versionCodes.length &&
      uniqueResponseCodes.size === responseCodes.length &&
      uniqueVersionCodes.size === uniqueResponseCodes.size &&
      versionCodes.every((code) => uniqueResponseCodes.has(code));
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
    const scoredItemsAreComplete = itemResponses.every(
      (item) =>
        !item.countsTowardTotal ||
        item.status === 'answered' ||
        item.status === 'scored',
    );
    const totalRangeValid =
      Number.isFinite(totalRange.min) &&
      Number.isFinite(totalRange.max) &&
      totalRange.min <= totalRange.max &&
      (totalRange.step === undefined ||
        (Number.isFinite(totalRange.step) && totalRange.step > 0));
    if (
      !itemSetMatches ||
      !ownershipMatches ||
      !scoredItemsAreComplete ||
      !totalRangeValid
    ) {
      throw new ConflictException({
        code: 'SCORE_INPUT_INVALID',
        message: 'Score input is invalid',
      });
    }
  }

  private assertFirstComputationState(context: ScoringContext): void {
    if (context.patient.status !== 'active') {
      throw new ConflictException({
        code: 'PATIENT_NOT_ACTIVE',
        message: 'Patient is not active',
      });
    }
    if (!COMPUTABLE_VISIT_STATUSES.has(context.visit.status)) {
      throw new ConflictException({
        code: 'VISIT_NOT_EDITABLE',
        message: 'Assessment visit cannot create a score result',
      });
    }
    if (context.scaleInstance.status !== 'completed') {
      throw new ConflictException({
        code: 'SCORE_INSTANCE_NOT_COMPUTABLE',
        message: 'Scale instance is not computable',
      });
    }
  }

  private resolveReadableResult(
    result: ScoreResultSummary,
    allowVoided = false,
  ): ScoreResultSummary {
    if (result.status === 'draft') {
      throw new ConflictException({
        code: 'SCORE_RESULT_INCOMPLETE',
        message: 'Score result is incomplete',
      });
    }
    if (result.status === 'voided' && !allowVoided) {
      throw new ConflictException({
        code: 'SCORE_RESULT_VOIDED',
        message: 'Score result is voided',
      });
    }
    return result;
  }

  private buildCreateInput(
    context: ScoringContext,
    provisional: ProvisionalScoringResult,
    computedAt: Date,
  ): CreateScoreResultInput {
    return {
      patientId: context.patient.id,
      assessmentVisitId: context.visit.id,
      scaleInstanceId: context.scaleInstance.id,
      subjectCode: context.scaleInstance.subjectCode,
      scaleDefinitionId: context.scaleInstance.scaleDefinitionId,
      scaleVersionId: context.scaleInstance.scaleVersionId,
      scaleCode: context.scaleInstance.scaleCode,
      scaleVersion: context.scaleInstance.scaleVersion,
      instanceCode: context.scaleInstance.instanceCode,
      scoreResultCode: `SCR-${randomUUID().replace(/-/g, '').toUpperCase()}`,
      runNo: 1,
      status: provisional.resultStatus,
      scoringSource: provisional.scoringSource,
      scoringMode: 'rule_based',
      versionTrace: {
        scaleVersion: context.version.version,
        crfVersion: context.version.crfVersion,
        scoringRuleVersion: context.version.scoringRuleVersion,
        fieldEncodingVersion: context.version.fieldEncodingVersion,
        sourceDocument: context.version.sourceDocument,
      },
      totalScore: provisional.totalScore,
      itemScores: provisional.itemScores,
      groupScores: provisional.groupScores,
      computation: {
        computedAt,
        ruleSetCode: 'A17_PROVISIONAL',
        ruleSetVersion: context.version.scoringRuleVersion,
        engineVersion: PROVISIONAL_SCORING_ENGINE_VERSION,
        inputItemCount: context.itemResponses.length,
        includedItemCount: provisional.itemScores.filter(
          (item) => item.countsTowardTotal,
        ).length,
        excludedItemCount: provisional.excludedItemCount,
        warningCount: provisional.warningCodes.length,
        notes:
          provisional.warningCodes.length > 0
            ? `warning_codes=${provisional.warningCodes.join(',')}`
            : undefined,
      },
      review: {
        reviewStatus: provisional.reviewStatus,
      },
      qualityStatus: provisional.qualityStatus,
    };
  }

  private async recoverDuplicateKey(
    context: ScoringContext,
  ): Promise<ComputeScoreResultResponse> {
    const result =
      await this.scoringService.findLatestScoreResultByScaleInstanceId(
        context.scaleInstance.id,
      );
    if (!result) {
      throw new ConflictException({
        code: 'SCORE_COMPUTATION_CONFLICT',
        message: 'Score computation conflicted with another request',
      });
    }
    return {
      ...this.buildDetailResponse(context, this.resolveReadableResult(result)),
      alreadyComputed: true,
    };
  }

  private buildDetailResponse(
    context: ScoringContext,
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
    context: ScoringContext,
  ): ProvisionalScoreScaleResponse {
    return {
      code: context.definition.code,
      name: context.definition.name,
      shortName: context.definition.shortName,
      version: context.version.version,
      displayVersion: context.version.displayVersion,
    };
  }
}
