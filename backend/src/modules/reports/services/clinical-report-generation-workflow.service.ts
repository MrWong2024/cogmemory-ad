import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import type {
  AssessmentVisitSummary,
  ScaleInstanceSummary,
} from '../../assessments/services/assessments.service';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import type { CognitiveDomainResultSummary } from '../../cognitive-domains/services/cognitive-domains.service';
import { CognitiveDomainsService } from '../../cognitive-domains/services/cognitive-domains.service';
import type { MediaEvidenceSummary } from '../../media/services/media-evidence.service';
import { MediaEvidenceService } from '../../media/services/media-evidence.service';
import type { PatientSummary } from '../../patients/services/patients.service';
import { PatientsService } from '../../patients/services/patients.service';
import type {
  ScaleDefinitionSummary,
  ScaleVersionSummary,
} from '../../scales/services/scales.service';
import { ScalesService } from '../../scales/services/scales.service';
import type { ScoreResultSummary } from '../../scoring/services/scoring.service';
import { ScoringService } from '../../scoring/services/scoring.service';
import type { GenerateClinicalReportDto } from '../dto/generate-clinical-report.dto';
import { buildClinicalReportDraft } from '../lib/clinical-report-draft-builder';
import { assertReadableClinicalReport } from '../lib/clinical-report-readability';
import type { ReportOperatorRole } from '../schemas/clinical-report.schema';
import type {
  ClinicalReportGenerationActor,
  ClinicalReportSelectedScaleSource,
} from '../types/clinical-report-generation.types';
import type {
  ClinicalReportDetailResponse,
  GenerateClinicalReportResponse,
} from '../types/clinical-report-response.types';
import { ClinicalReportPublicMapper } from './clinical-report-public.mapper';
import type {
  ClinicalReportSummary,
  CreateClinicalReportInput,
} from './reports.service';
import { ReportsService } from './reports.service';

const GENERATABLE_VISIT_STATUSES = new Set([
  'draft',
  'in_progress',
  'completed',
]);
const GENERATABLE_SCALE_STATUSES = new Set(['completed', 'locked']);
const REPORT_EXISTING_STATUSES = new Set([
  'draft',
  'pending_confirmation',
  'confirmed',
  'archived',
  'corrected',
]);
const REPORT_ROLE_PRIORITY: ReportOperatorRole[] = [
  'doctor',
  'nurse',
  'research_assistant',
  'admin',
];

type VisitContext = {
  patient: PatientSummary;
  visit: AssessmentVisitSummary;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

@Injectable()
export class ClinicalReportGenerationWorkflowService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly scalesService: ScalesService,
    private readonly scoringService: ScoringService,
    private readonly cognitiveDomainsService: CognitiveDomainsService,
    private readonly mediaEvidenceService: MediaEvidenceService,
    private readonly reportsService: ReportsService,
    private readonly publicMapper: ClinicalReportPublicMapper,
  ) {}

  async generateClinicalReportDraft(
    patientId: string,
    visitId: string,
    currentUser: AuthenticatedUserContext | undefined,
    input: GenerateClinicalReportDto,
  ): Promise<GenerateClinicalReportResponse> {
    if (input.confirm !== true) {
      throw new BadRequestException({
        code: 'CLINICAL_REPORT_GENERATION_CONFIRMATION_REQUIRED',
        message: 'Clinical report generation must be explicitly confirmed',
      });
    }
    const requestedScope = this.normalizeRequestedScope(
      input.primaryScaleInstanceIds,
    );
    const context = await this.loadVisitContext(patientId, visitId);
    const existing = await this.reportsService.findLatestReportByVisitId(
      context.visit.id,
    );
    if (existing) {
      return this.resolveExistingReport(existing, context, requestedScope);
    }

    this.assertFirstGenerationState(context);
    const actor = this.buildCurrentActor(currentUser);
    const selectedScaleSources = await Promise.all(
      requestedScope.map((scaleInstanceId) =>
        this.loadScaleSourceBundle(context, scaleInstanceId),
      ),
    );
    selectedScaleSources.sort(
      (left, right) =>
        left.scaleInstance.scaleCode.localeCompare(
          right.scaleInstance.scaleCode,
        ) ||
        left.scaleInstance.instanceNo - right.scaleInstance.instanceNo ||
        left.scaleInstance.id.localeCompare(right.scaleInstance.id),
    );
    const mediaEvidence = await this.loadMediaEvidence(
      context,
      selectedScaleSources,
    );

    let createInput: CreateClinicalReportInput;
    try {
      createInput = buildClinicalReportDraft({
        patient: context.patient,
        visit: context.visit,
        selectedScaleSources,
        mediaEvidence,
        generatedAt: new Date(),
        actor,
      });
    } catch {
      throw new InternalServerErrorException({
        code: 'CLINICAL_REPORT_GENERATION_FAILED',
        message: 'Clinical report generation failed',
      });
    }

    try {
      const created =
        await this.reportsService.createVersionOneCognitiveAssessmentReport(
          createInput,
        );
      this.assertReadableReport(created, context);
      return {
        report: this.publicMapper.toPublicReport(created),
        alreadyGenerated: false,
      };
    } catch (error: unknown) {
      if (this.reportsService.isDuplicateKeyError(error)) {
        return this.recoverDuplicateKey(context, requestedScope);
      }
      throw new InternalServerErrorException({
        code: 'CLINICAL_REPORT_GENERATION_FAILED',
        message: 'Clinical report generation failed',
      });
    }
  }

  async getLatestClinicalReport(
    patientId: string,
    visitId: string,
  ): Promise<ClinicalReportDetailResponse> {
    const context = await this.loadVisitContext(patientId, visitId);
    const report = await this.reportsService.findLatestReportByVisitId(
      context.visit.id,
    );
    if (!report) {
      throw new NotFoundException({
        code: 'CLINICAL_REPORT_NOT_FOUND',
        message: 'Clinical report not found',
      });
    }
    this.assertReadableReport(report, context);
    return { report: this.publicMapper.toPublicReport(report) };
  }

  normalizeRequestedScope(value: unknown): string[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
      throw new BadRequestException({
        code: 'CLINICAL_REPORT_SCOPE_INVALID',
        message: 'Clinical report scope is invalid',
      });
    }
    const normalized = value.map((item: unknown) => {
      if (typeof item !== 'string') {
        return null;
      }
      const candidate = item.trim().toLowerCase();
      if (!Types.ObjectId.isValid(candidate)) {
        return null;
      }
      const objectId = new Types.ObjectId(candidate).toString();
      return objectId === candidate ? candidate : null;
    });
    if (normalized.some((item) => item === null)) {
      throw new BadRequestException({
        code: 'CLINICAL_REPORT_SCOPE_INVALID',
        message: 'Clinical report scope is invalid',
      });
    }
    const ids = normalized.filter((item): item is string => item !== null);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException({
        code: 'CLINICAL_REPORT_SCOPE_INVALID',
        message: 'Clinical report scope is invalid',
      });
    }
    return ids.sort((left, right) => left.localeCompare(right));
  }

  private async loadVisitContext(
    patientId: string,
    visitId: string,
  ): Promise<VisitContext> {
    const patient = await this.patientsService.findPatientById(patientId);
    if (!patient) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
      });
    }
    const visit = await this.assessmentsService.findVisitByPatientAndId(
      patient.id,
      visitId,
    );
    if (!visit) {
      throw new NotFoundException({
        code: 'VISIT_NOT_FOUND',
        message: 'Assessment visit not found',
      });
    }
    return { patient, visit };
  }

  private assertFirstGenerationState(context: VisitContext): void {
    if (context.patient.status !== 'active') {
      throw new ConflictException({
        code: 'PATIENT_NOT_ACTIVE',
        message: 'Patient is not active',
      });
    }
    if (!GENERATABLE_VISIT_STATUSES.has(context.visit.status)) {
      throw new ConflictException({
        code: 'VISIT_NOT_EDITABLE',
        message: 'Assessment visit cannot create a clinical report',
      });
    }
  }

  private async loadScaleSourceBundle(
    context: VisitContext,
    scaleInstanceId: string,
  ): Promise<ClinicalReportSelectedScaleSource> {
    const scaleInstance =
      await this.assessmentsService.findScaleInstanceByPatientVisitAndId(
        context.patient.id,
        context.visit.id,
        scaleInstanceId,
      );
    if (!scaleInstance) {
      throw new NotFoundException({
        code: 'SCALE_INSTANCE_NOT_FOUND',
        message: 'Scale instance not found',
      });
    }
    if (!GENERATABLE_SCALE_STATUSES.has(scaleInstance.status)) {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_SOURCE_SCALE_NOT_READY',
        message: 'Source scale instance is not ready',
      });
    }
    const [scaleDefinition, scaleVersion] = await Promise.all([
      this.scalesService.findDefinitionByCode(scaleInstance.scaleCode),
      this.scalesService.findVersionByScaleCodeAndVersion(
        scaleInstance.scaleCode,
        scaleInstance.scaleVersion,
      ),
    ]);
    this.assertScaleConfiguration(scaleInstance, scaleDefinition, scaleVersion);
    if (!scaleDefinition || !scaleVersion) {
      throw new ConflictException({
        code: 'SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE',
        message: 'Scale instance configuration is unavailable',
      });
    }
    const scoreResult =
      await this.scoringService.findScoreResultByScaleInstanceAndRunNo(
        scaleInstance.id,
        1,
      );
    if (!scoreResult) {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_SOURCE_SCORE_NOT_FINAL',
        message: 'Source score result is not final',
      });
    }
    this.assertScoreResult(
      context,
      scaleInstance,
      scaleDefinition,
      scaleVersion,
      scoreResult,
    );
    const cognitiveDomainResult =
      await this.cognitiveDomainsService.findDomainResultByScaleInstanceAndRunNo(
        scaleInstance.id,
        1,
      );
    if (!cognitiveDomainResult) {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_SOURCE_DOMAIN_RESULT_REQUIRED',
        message: 'Source cognitive domain result is required',
      });
    }
    this.assertDomainResult(
      context,
      scaleInstance,
      scaleDefinition,
      scaleVersion,
      scoreResult,
      cognitiveDomainResult,
    );
    return {
      scaleInstance,
      scaleDefinition,
      scaleVersion,
      scoreResult,
      cognitiveDomainResult,
    };
  }

  private assertScaleConfiguration(
    instance: ScaleInstanceSummary,
    definition: ScaleDefinitionSummary | null,
    version: ScaleVersionSummary | null,
  ): asserts definition is ScaleDefinitionSummary {
    if (
      !definition ||
      !version ||
      definition.id !== instance.scaleDefinitionId ||
      definition.code !== instance.scaleCode ||
      version.id !== instance.scaleVersionId ||
      version.scaleDefinitionId !== definition.id ||
      version.scaleCode !== instance.scaleCode ||
      version.version !== instance.scaleVersion
    ) {
      throw new ConflictException({
        code: 'SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE',
        message: 'Scale instance configuration is unavailable',
      });
    }
  }

  private assertScoreResult(
    context: VisitContext,
    instance: ScaleInstanceSummary,
    definition: ScaleDefinitionSummary,
    version: ScaleVersionSummary,
    score: ScoreResultSummary,
  ): void {
    const total = score.totalScore;
    const countingItems = score.itemScores.filter(
      (item) => item.countsTowardTotal,
    );
    const configuredCountingItems = version.items.filter(
      (item) => item.countsTowardTotal,
    );
    const configuredItems = new Map(
      version.items.map((item) => [item.code.trim().toLowerCase(), item]),
    );
    const scoreItemCodes = score.itemScores.map((item) =>
      item.itemCode.trim().toLowerCase(),
    );
    const ownershipInvalid =
      score.runNo !== 1 ||
      score.patientId !== context.patient.id ||
      score.assessmentVisitId !== context.visit.id ||
      score.scaleInstanceId !== instance.id ||
      score.scaleDefinitionId !== definition.id ||
      score.scaleVersionId !== version.id ||
      score.scaleCode !== instance.scaleCode ||
      score.scaleVersion !== instance.scaleVersion ||
      score.instanceCode !== instance.instanceCode;
    const totalInvalid =
      !total ||
      !isFiniteNumber(total.scoreValue) ||
      !isFiniteNumber(total.maxScore) ||
      !isFiniteNumber(total.minScore) ||
      !isFiniteNumber(total.scorePercent) ||
      total.maxScore !== version.totalScoreRange.max ||
      total.minScore !== version.totalScoreRange.min ||
      !isNonNegativeInteger(total.totalItemCount) ||
      total.totalItemCount < 1 ||
      total.unscoredItemCount !== 0 ||
      total.needsReviewItemCount !== 0 ||
      total.scoredItemCount !== total.totalItemCount ||
      countingItems.length !== total.totalItemCount ||
      configuredCountingItems.length !== total.totalItemCount;
    const itemsInvalid =
      score.itemScores.length !== version.items.length ||
      new Set(scoreItemCodes).size !== scoreItemCodes.length ||
      score.itemScores.some((item) => {
        const configured = configuredItems.get(
          item.itemCode.trim().toLowerCase(),
        );
        if (
          !configured ||
          !item.itemResponseId ||
          item.countsTowardTotal !== configured.countsTowardTotal ||
          item.minScore !== configured.scoreRange.min ||
          item.maxScore !== configured.scoreRange.max
        ) {
          return true;
        }
        if (!item.countsTowardTotal) {
          return item.includedInTotal;
        }
        return (
          !item.includedInTotal ||
          (item.scoreStatus !== 'auto_scored' &&
            item.scoreStatus !== 'manual_scored') ||
          !isFiniteNumber(item.scoreValue) ||
          !isFiniteNumber(item.maxScore) ||
          !isFiniteNumber(item.minScore)
        );
      });
    if (
      ownershipInvalid ||
      (score.status !== 'confirmed' && score.status !== 'locked') ||
      !score.confirmedAt ||
      score.qualityStatus !== 'passed' ||
      score.review?.reviewStatus !== 'reviewed' ||
      !score.computation ||
      score.computation.warningCount !== 0 ||
      score.computation.notes?.startsWith('warning_codes=') === true ||
      totalInvalid ||
      itemsInvalid
    ) {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_SOURCE_SCORE_NOT_FINAL',
        message: 'Source score result is not final',
      });
    }
  }

  private assertDomainResult(
    context: VisitContext,
    instance: ScaleInstanceSummary,
    definition: ScaleDefinitionSummary,
    version: ScaleVersionSummary,
    score: ScoreResultSummary,
    domain: CognitiveDomainResultSummary,
  ): void {
    const statuses = new Set(['computed', 'confirmed', 'locked']);
    const reviewStatuses = new Set(['not_required', 'reviewed']);
    const qualityStatuses = new Set(['unchecked', 'passed']);
    const scoreItems = new Map(
      score.itemScores.map((item) => [
        item.itemCode.trim().toLowerCase(),
        item,
      ]),
    );
    const domainScoresInvalid =
      domain.domainScores.length < 1 ||
      domain.domainScores.some(
        (item) =>
          !item.domainCode.trim() ||
          !isFiniteNumber(item.scoreValue) ||
          !isFiniteNumber(item.maxScore) ||
          !isFiniteNumber(item.scorePercent) ||
          !isFiniteNumber(item.weightedScore) ||
          !isFiniteNumber(item.weightedMaxScore) ||
          !isNonNegativeInteger(item.itemCount) ||
          item.itemCount < 1 ||
          item.needsReviewItemCount !== 0,
      );
    const contributionsInvalid =
      domain.itemContributions.length < 1 ||
      domain.itemContributions.some((item) => {
        const sourceItem = scoreItems.get(item.itemCode.trim().toLowerCase());
        if (
          !sourceItem ||
          !item.itemResponseId ||
          item.itemResponseId !== sourceItem.itemResponseId ||
          item.scoreResultId !== score.id ||
          !item.itemCode.trim() ||
          !item.domainCode.trim() ||
          !sourceItem.cognitiveDomainCodes
            .map((code) => code.trim().toLowerCase())
            .includes(item.domainCode.trim().toLowerCase()) ||
          !isFiniteNumber(item.weight) ||
          item.weight <= 0
        ) {
          return true;
        }
        return (
          item.countsTowardDomain &&
          ((item.scoreStatus !== 'auto_scored' &&
            item.scoreStatus !== 'manual_scored') ||
            !isFiniteNumber(item.scoreValue) ||
            !isFiniteNumber(item.maxScore) ||
            !isFiniteNumber(item.weightedScore) ||
            !isFiniteNumber(item.weightedMaxScore) ||
            item.scoreValue !== sourceItem.scoreValue ||
            item.maxScore !== sourceItem.maxScore)
        );
      });
    if (
      domain.runNo !== 1 ||
      domain.patientId !== context.patient.id ||
      domain.assessmentVisitId !== context.visit.id ||
      domain.scaleInstanceId !== instance.id ||
      domain.scoreResultId !== score.id ||
      domain.scaleDefinitionId !== definition.id ||
      domain.scaleVersionId !== version.id ||
      domain.scaleCode !== instance.scaleCode ||
      domain.scaleVersion !== instance.scaleVersion ||
      domain.instanceCode !== instance.instanceCode ||
      !statuses.has(domain.status) ||
      domain.mappingSource !== 'scale_config' ||
      domain.mappingMode !== 'item_domain_codes' ||
      !domain.review ||
      !reviewStatuses.has(domain.review.reviewStatus) ||
      !qualityStatuses.has(domain.qualityStatus) ||
      !domain.computation ||
      domain.computation.warningCount !== 0 ||
      domain.computation.notes?.startsWith('warning_codes=') === true ||
      !domain.versionTrace?.domainMappingVersion ||
      domainScoresInvalid ||
      contributionsInvalid
    ) {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_SOURCE_DOMAIN_RESULT_INVALID',
        message: 'Source cognitive domain result is invalid',
      });
    }
  }

  private async loadMediaEvidence(
    context: VisitContext,
    sources: ClinicalReportSelectedScaleSource[],
  ): Promise<MediaEvidenceSummary[]> {
    const lists = await Promise.all(
      sources.map(({ scaleInstance }) =>
        this.mediaEvidenceService.listEvidenceByScaleInstanceId(
          scaleInstance.id,
        ),
      ),
    );
    const expectedInstances = new Set(
      sources.map(({ scaleInstance }) => scaleInstance.id),
    );
    const sourceByInstanceId = new Map(
      sources.map((source) => [source.scaleInstance.id, source]),
    );
    const included: MediaEvidenceSummary[] = [];
    for (const evidence of lists.flat()) {
      const isSupportedType =
        evidence.evidenceType === 'photo' ||
        evidence.evidenceType === 'handwriting';
      const isAttached =
        evidence.status === 'attached' || evidence.status === 'locked';
      if (!isSupportedType || !isAttached || evidence.deletedAt) {
        continue;
      }
      const source = sourceByInstanceId.get(evidence.scaleInstanceId);
      if (
        !source ||
        evidence.patientId !== context.patient.id ||
        evidence.assessmentVisitId !== context.visit.id ||
        !expectedInstances.has(evidence.scaleInstanceId) ||
        evidence.scaleDefinitionId !== source.scaleDefinition.id ||
        evidence.scaleVersionId !== source.scaleVersion.id ||
        evidence.scaleCode !== source.scaleInstance.scaleCode ||
        evidence.scaleVersion !== source.scaleInstance.scaleVersion ||
        evidence.instanceCode !== source.scaleInstance.instanceCode ||
        !evidence.id ||
        !evidence.itemResponseId ||
        !evidence.scaleInstanceId ||
        !evidence.itemCode.trim() ||
        evidence.storageStatus !== 'stored' ||
        !evidence.storage?.objectKey?.trim() ||
        evidence.qualityStatus === 'unusable'
      ) {
        throw new ConflictException({
          code: 'CLINICAL_REPORT_SOURCE_MEDIA_INVALID',
          message: 'Source media evidence is invalid',
        });
      }
      included.push(evidence);
    }
    return included.sort(
      (left, right) =>
        left.scaleCode.localeCompare(right.scaleCode) ||
        left.itemCode.localeCompare(right.itemCode) ||
        left.evidenceType.localeCompare(right.evidenceType) ||
        left.id.localeCompare(right.id),
    );
  }

  private buildCurrentActor(
    currentUser: AuthenticatedUserContext | undefined,
  ): ClinicalReportGenerationActor {
    if (!currentUser || !Types.ObjectId.isValid(currentUser.id)) {
      throw new UnauthorizedException();
    }
    const id = new Types.ObjectId(currentUser.id).toString();
    if (id !== currentUser.id.trim().toLowerCase()) {
      throw new UnauthorizedException();
    }
    const role =
      REPORT_ROLE_PRIORITY.find((candidate) =>
        currentUser.roles.includes(candidate),
      ) ?? 'unknown';
    return {
      id,
      name:
        currentUser.displayName.trim() ||
        currentUser.accountName.trim() ||
        'unknown',
      role,
    };
  }

  private resolveExistingReport(
    report: ClinicalReportSummary,
    context: VisitContext,
    requestedScope: string[],
  ): GenerateClinicalReportResponse {
    if (report.reportType !== 'cognitive_assessment') {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_SCOPE_CONFLICT',
        message: 'Clinical report scope conflicts with the existing report',
      });
    }
    if (report.status === 'voided') {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_VOIDED',
        message: 'Clinical report is voided',
      });
    }
    const existingScope = this.normalizePersistedScope(
      report.primaryScaleInstanceIds,
    );
    if (!this.sameScope(existingScope, requestedScope)) {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_SCOPE_CONFLICT',
        message: 'Clinical report scope conflicts with the existing report',
      });
    }
    if (!REPORT_EXISTING_STATUSES.has(report.status)) {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_INCOMPLETE',
        message: 'Clinical report is incomplete',
      });
    }
    this.assertReadableReport(report, context);
    return {
      report: this.publicMapper.toPublicReport(report),
      alreadyGenerated: true,
    };
  }

  private normalizePersistedScope(value: string[]): string[] {
    try {
      return this.normalizeRequestedScope(value);
    } catch {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_INCOMPLETE',
        message: 'Clinical report is incomplete',
      });
    }
  }

  private sameScope(left: string[], right: string[]): boolean {
    return (
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }

  private assertReadableReport(
    report: ClinicalReportSummary,
    context: VisitContext,
  ): void {
    assertReadableClinicalReport(report, context.patient.id, context.visit.id);
  }

  private async recoverDuplicateKey(
    context: VisitContext,
    requestedScope: string[],
  ): Promise<GenerateClinicalReportResponse> {
    const report = await this.reportsService.findLatestReportByVisitId(
      context.visit.id,
    );
    if (!report) {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_GENERATION_CONFLICT',
        message: 'Clinical report generation conflicted with another request',
      });
    }
    return this.resolveExistingReport(report, context, requestedScope);
  }
}
