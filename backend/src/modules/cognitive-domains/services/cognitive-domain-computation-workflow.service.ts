import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import type {
  AssessmentVisitSummary,
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
import type { ScoreResultSummary } from '../../scoring/services/scoring.service';
import { ScoringService } from '../../scoring/services/scoring.service';
import type { ComputeCognitiveDomainResultDto } from '../dto/compute-cognitive-domain-result.dto';
import {
  A19_COGNITIVE_DOMAIN_ENGINE_VERSION,
  A19_DOMAIN_MAPPING_VERSION,
  ConfirmedScoreDomainMappingError,
  mapConfirmedScoreToDomainInputs,
} from '../lib/confirmed-score-domain-mapping';
import type {
  CognitiveDomainResultDetailResponse,
  CognitiveDomainScaleResponse,
  CognitiveDomainSourceScoreResultResponse,
  ComputeCognitiveDomainResultResponse,
} from '../types/cognitive-domain-result-response.types';
import { CognitiveDomainResultPublicMapper } from './cognitive-domain-result-public.mapper';
import type {
  CognitiveDomainResultSummary,
  CreateCognitiveDomainResultInput,
} from './cognitive-domains.service';
import { CognitiveDomainsService } from './cognitive-domains.service';

const COMPUTABLE_VISIT_STATUSES = new Set([
  'draft',
  'in_progress',
  'completed',
]);

type BaseContext = {
  patient: PatientSummary;
  visit: AssessmentVisitSummary;
  scaleInstance: ScaleInstanceSummary;
};

type DomainContext = BaseContext & {
  definition: ScaleDefinitionSummary;
  version: ScaleVersionSummary;
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
export class CognitiveDomainComputationWorkflowService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly scalesService: ScalesService,
    private readonly scoringService: ScoringService,
    private readonly cognitiveDomainsService: CognitiveDomainsService,
    private readonly publicMapper: CognitiveDomainResultPublicMapper,
  ) {}

  async computeDomainResult(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    currentUser: AuthenticatedUserContext | undefined,
    input: ComputeCognitiveDomainResultDto,
  ): Promise<ComputeCognitiveDomainResultResponse> {
    if (input.confirm !== true) {
      throw new BadRequestException({
        code: 'COGNITIVE_DOMAIN_COMPUTATION_CONFIRMATION_REQUIRED',
        message: 'Cognitive domain computation must be explicitly confirmed',
      });
    }
    const base = await this.loadBaseContext(
      patientId,
      visitId,
      scaleInstanceId,
    );
    const existing =
      await this.cognitiveDomainsService.findDomainResultByScaleInstanceAndRunNo(
        base.scaleInstance.id,
        1,
      );
    if (existing) {
      const context = await this.loadScaleConfiguration(base);
      this.assertDomainResultOwnership(existing, context);
      return {
        ...this.buildDetailResponse(
          context,
          this.resolveExistingResult(existing),
          { id: existing.scoreResultId },
        ),
        alreadyComputed: true,
      };
    }

    this.assertFirstComputationState(base);
    const computedBy = this.requireComputedBy(currentUser);
    const context = await this.loadScaleConfiguration(base);
    const source =
      await this.scoringService.findScoreResultByScaleInstanceAndRunNo(
        context.scaleInstance.id,
        1,
      );
    if (!source) {
      throw new NotFoundException({
        code: 'SCORE_RESULT_NOT_FOUND',
        message: 'Source score result not found',
      });
    }
    this.assertSourceOwnership(source, context);
    this.assertSourceFinality(source);

    const computedAt = new Date();
    let createInput: CreateCognitiveDomainResultInput;
    try {
      const mapped = mapConfirmedScoreToDomainInputs(source, context.version);
      const summary = this.cognitiveDomainsService.summarizeDomainScores(
        mapped.items,
      );
      if (summary.warnings.length > 0 || summary.domainCount === 0) {
        throw new ConfirmedScoreDomainMappingError(
          'COGNITIVE_DOMAIN_INPUT_INVALID',
        );
      }
      createInput = this.buildCreateInput(
        context,
        source,
        computedBy,
        computedAt,
        mapped.mappingSnapshot,
        summary,
      );
    } catch (error: unknown) {
      if (error instanceof ConfirmedScoreDomainMappingError) {
        throw new ConflictException({
          code: error.code,
          message: 'Cognitive domain computation input is invalid',
        });
      }
      throw new InternalServerErrorException({
        code: 'COGNITIVE_DOMAIN_COMPUTATION_FAILED',
        message: 'Cognitive domain computation failed',
      });
    }

    let created: CognitiveDomainResultSummary;
    try {
      created =
        await this.cognitiveDomainsService.createRunOneDomainResult(
          createInput,
        );
    } catch (error: unknown) {
      if (isMongoDuplicateKeyError(error)) {
        return this.recoverDuplicateKey(context);
      }
      throw new InternalServerErrorException({
        code: 'COGNITIVE_DOMAIN_COMPUTATION_FAILED',
        message: 'Cognitive domain computation failed',
      });
    }
    return {
      ...this.buildDetailResponse(
        context,
        created,
        this.toPublicSourceScoreResult(source),
      ),
      alreadyComputed: false,
    };
  }

  async getLatestDomainResult(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
  ): Promise<CognitiveDomainResultDetailResponse> {
    const base = await this.loadBaseContext(
      patientId,
      visitId,
      scaleInstanceId,
    );
    const context = await this.loadScaleConfiguration(base);
    const result =
      await this.cognitiveDomainsService.findDomainResultByScaleInstanceAndRunNo(
        context.scaleInstance.id,
        1,
      );
    if (!result) {
      throw new NotFoundException({
        code: 'COGNITIVE_DOMAIN_RESULT_NOT_FOUND',
        message: 'Cognitive domain result not found',
      });
    }
    this.assertDomainResultOwnership(result, context);
    const source =
      await this.scoringService.findScoreResultByScaleInstanceAndRunNo(
        context.scaleInstance.id,
        1,
      );
    if (!source) {
      throw new NotFoundException({
        code: 'SCORE_RESULT_NOT_FOUND',
        message: 'Source score result not found',
      });
    }
    this.assertSourceOwnership(source, context, result.scoreResultId);
    return this.buildDetailResponse(
      context,
      this.resolveExistingResult(result, true),
      this.toPublicSourceScoreResult(source),
    );
  }

  private async loadBaseContext(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
  ): Promise<BaseContext> {
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
    return { patient, visit, scaleInstance };
  }

  private async loadScaleConfiguration(
    base: BaseContext,
  ): Promise<DomainContext> {
    const [definition, version] = await Promise.all([
      this.scalesService.findDefinitionByCode(base.scaleInstance.scaleCode),
      this.scalesService.findVersionByScaleCodeAndVersion(
        base.scaleInstance.scaleCode,
        base.scaleInstance.scaleVersion,
      ),
    ]);
    if (
      !definition ||
      !version ||
      definition.id !== base.scaleInstance.scaleDefinitionId ||
      version.id !== base.scaleInstance.scaleVersionId ||
      version.scaleDefinitionId !== definition.id ||
      version.scaleCode !== base.scaleInstance.scaleCode ||
      version.version !== base.scaleInstance.scaleVersion
    ) {
      throw new ConflictException({
        code: 'SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE',
        message: 'Scale instance configuration is unavailable',
      });
    }
    return { ...base, definition, version };
  }

  private assertFirstComputationState(context: BaseContext): void {
    if (context.patient.status !== 'active') {
      throw new ConflictException({
        code: 'PATIENT_NOT_ACTIVE',
        message: 'Patient is not active',
      });
    }
    if (!COMPUTABLE_VISIT_STATUSES.has(context.visit.status)) {
      throw new ConflictException({
        code: 'VISIT_NOT_EDITABLE',
        message: 'Assessment visit cannot create a cognitive domain result',
      });
    }
    if (context.scaleInstance.status !== 'completed') {
      throw new ConflictException({
        code: 'COGNITIVE_DOMAIN_INSTANCE_NOT_COMPUTABLE',
        message: 'Scale instance is not computable',
      });
    }
  }

  private assertSourceOwnership(
    source: ScoreResultSummary,
    context: DomainContext,
    expectedScoreResultId?: string,
  ): void {
    if (
      source.runNo !== 1 ||
      source.patientId !== context.patient.id ||
      source.assessmentVisitId !== context.visit.id ||
      source.scaleInstanceId !== context.scaleInstance.id ||
      source.scaleDefinitionId !== context.definition.id ||
      source.scaleVersionId !== context.version.id ||
      source.scaleCode !== context.scaleInstance.scaleCode ||
      source.scaleVersion !== context.scaleInstance.scaleVersion ||
      source.instanceCode !== context.scaleInstance.instanceCode ||
      (expectedScoreResultId !== undefined &&
        source.id !== expectedScoreResultId)
    ) {
      throw new ConflictException({
        code: 'COGNITIVE_DOMAIN_INPUT_INVALID',
        message: 'Cognitive domain computation input is invalid',
      });
    }
  }

  private assertSourceFinality(source: ScoreResultSummary): void {
    if (source.status !== 'confirmed' && source.status !== 'locked') {
      throw new ConflictException({
        code: 'COGNITIVE_DOMAIN_SOURCE_SCORE_NOT_FINAL',
        message: 'Source score result is not final',
      });
    }
    const total = source.totalScore;
    if (
      !source.confirmedAt ||
      source.qualityStatus !== 'passed' ||
      !total ||
      total.unscoredItemCount !== 0 ||
      total.needsReviewItemCount !== 0 ||
      total.scoredItemCount !== total.totalItemCount ||
      source.review?.reviewStatus !== 'reviewed' ||
      !source.computation ||
      source.computation.warningCount !== 0 ||
      source.computation.notes?.startsWith('warning_codes=') === true
    ) {
      throw new ConflictException({
        code: 'COGNITIVE_DOMAIN_SOURCE_SCORE_INVALID',
        message: 'Source score result is invalid',
      });
    }
  }

  private assertDomainResultOwnership(
    result: CognitiveDomainResultSummary,
    context: DomainContext,
  ): void {
    if (
      result.runNo !== 1 ||
      result.patientId !== context.patient.id ||
      result.assessmentVisitId !== context.visit.id ||
      result.scaleInstanceId !== context.scaleInstance.id ||
      result.scaleDefinitionId !== context.definition.id ||
      result.scaleVersionId !== context.version.id ||
      result.scaleCode !== context.scaleInstance.scaleCode ||
      result.scaleVersion !== context.scaleInstance.scaleVersion ||
      result.instanceCode !== context.scaleInstance.instanceCode
    ) {
      throw new ConflictException({
        code: 'COGNITIVE_DOMAIN_INPUT_INVALID',
        message: 'Cognitive domain result ownership is invalid',
      });
    }
  }

  private resolveExistingResult(
    result: CognitiveDomainResultSummary,
    allowVoided = false,
  ): CognitiveDomainResultSummary {
    if (result.status === 'draft') {
      throw new ConflictException({
        code: 'COGNITIVE_DOMAIN_RESULT_INCOMPLETE',
        message: 'Cognitive domain result is incomplete',
      });
    }
    if (result.status === 'voided' && !allowVoided) {
      throw new ConflictException({
        code: 'COGNITIVE_DOMAIN_RESULT_VOIDED',
        message: 'Cognitive domain result is voided',
      });
    }
    return result;
  }

  private buildCreateInput(
    context: DomainContext,
    source: ScoreResultSummary,
    computedBy: string,
    computedAt: Date,
    mappingSnapshot: CreateCognitiveDomainResultInput['mappingSnapshot'],
    summary: ReturnType<CognitiveDomainsService['summarizeDomainScores']>,
  ): CreateCognitiveDomainResultInput {
    return {
      patientId: context.patient.id,
      assessmentVisitId: context.visit.id,
      scaleInstanceId: context.scaleInstance.id,
      scoreResultId: source.id,
      subjectCode: context.scaleInstance.subjectCode,
      scaleDefinitionId: context.definition.id,
      scaleVersionId: context.version.id,
      scaleCode: context.scaleInstance.scaleCode,
      scaleVersion: context.scaleInstance.scaleVersion,
      instanceCode: context.scaleInstance.instanceCode,
      domainResultCode: `CDR-${randomUUID().replace(/-/g, '').toUpperCase()}`,
      runNo: 1,
      status: 'computed',
      mappingSource: 'scale_config',
      mappingMode: 'item_domain_codes',
      versionTrace: {
        scaleVersion: context.scaleInstance.scaleVersion,
        crfVersion:
          context.scaleInstance.versionTrace?.crfVersion ??
          context.version.crfVersion,
        scoringRuleVersion:
          source.versionTrace?.scoringRuleVersion ??
          context.version.scoringRuleVersion,
        fieldEncodingVersion:
          context.scaleInstance.versionTrace?.fieldEncodingVersion ??
          context.version.fieldEncodingVersion,
        domainMappingVersion: A19_DOMAIN_MAPPING_VERSION,
        sourceDocument:
          context.scaleInstance.versionTrace?.sourceDocument ??
          context.version.sourceDocument,
      },
      domainScores: summary.domainScores,
      itemContributions: summary.itemContributions,
      mappingSnapshot,
      computation: {
        computedAt,
        computedBy,
        ruleSetCode: 'item-domain-codes',
        ruleSetVersion: A19_DOMAIN_MAPPING_VERSION,
        engineVersion: A19_COGNITIVE_DOMAIN_ENGINE_VERSION,
        inputItemCount: summary.inputItemCount,
        contributionCount: summary.contributionCount,
        domainCount: summary.domainCount,
        includedContributionCount: summary.includedContributionCount,
        excludedContributionCount: summary.excludedContributionCount,
        warningCount: 0,
      },
      review: { reviewStatus: 'not_required' },
      qualityStatus: 'unchecked',
    };
  }

  private async recoverDuplicateKey(
    context: DomainContext,
  ): Promise<ComputeCognitiveDomainResultResponse> {
    const result =
      await this.cognitiveDomainsService.findDomainResultByScaleInstanceAndRunNo(
        context.scaleInstance.id,
        1,
      );
    if (!result) {
      throw new ConflictException({
        code: 'COGNITIVE_DOMAIN_COMPUTATION_CONFLICT',
        message: 'Cognitive domain computation conflicted with another request',
      });
    }
    this.assertDomainResultOwnership(result, context);
    return {
      ...this.buildDetailResponse(context, this.resolveExistingResult(result), {
        id: result.scoreResultId,
      }),
      alreadyComputed: true,
    };
  }

  private buildDetailResponse(
    context: DomainContext,
    result: CognitiveDomainResultSummary,
    sourceScoreResult: CognitiveDomainSourceScoreResultResponse,
  ): CognitiveDomainResultDetailResponse {
    return {
      scale: this.toPublicScale(context),
      scaleInstance: {
        id: context.scaleInstance.id,
        instanceCode: context.scaleInstance.instanceCode,
        scaleCode: context.scaleInstance.scaleCode,
        scaleVersion: context.scaleInstance.scaleVersion,
        status: context.scaleInstance.status,
        completedAt: context.scaleInstance.completedAt,
        lockedAt: context.scaleInstance.lockedAt,
        voidedAt: context.scaleInstance.voidedAt,
      },
      sourceScoreResult,
      cognitiveDomainResult: this.publicMapper.toPublicResult(result),
    };
  }

  private toPublicScale(context: DomainContext): CognitiveDomainScaleResponse {
    return {
      code: context.definition.code,
      name: context.definition.name,
      shortName: context.definition.shortName,
      version: context.version.version,
      displayVersion: context.version.displayVersion,
    };
  }

  private toPublicSourceScoreResult(
    source: ScoreResultSummary,
  ): CognitiveDomainSourceScoreResultResponse {
    return {
      id: source.id,
      scoreResultCode: source.scoreResultCode,
      runNo: source.runNo,
      status: source.status,
      confirmedAt: source.confirmedAt,
      updatedAt: source.updatedAt,
    };
  }

  private requireComputedBy(
    currentUser: AuthenticatedUserContext | undefined,
  ): string {
    if (!currentUser || !Types.ObjectId.isValid(currentUser.id)) {
      throw new UnauthorizedException();
    }
    const normalized = new Types.ObjectId(currentUser.id).toString();
    if (normalized !== currentUser.id.toLowerCase()) {
      throw new UnauthorizedException();
    }
    return normalized;
  }
}
