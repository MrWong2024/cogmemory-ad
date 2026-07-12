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
import type {
  AssessmentVisitSummary,
  ItemResponseSummary,
  ScaleInstanceSummary,
} from '../../assessments/services/assessments.service';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import type { PatientSummary } from '../../patients/services/patients.service';
import { PatientsService } from '../../patients/services/patients.service';
import type { ScoreResultSummary } from '../../scoring/services/scoring.service';
import { ScoringService } from '../../scoring/services/scoring.service';
import type { CognitiveDomainResultSummary } from '../../cognitive-domains/services/cognitive-domains.service';
import { CognitiveDomainsService } from '../../cognitive-domains/services/cognitive-domains.service';
import type { MediaEvidenceSummary } from '../../media/services/media-evidence.service';
import { MediaEvidenceService } from '../../media/services/media-evidence.service';
import type { FreezeClinicalReportSourcesDto } from '../dto/freeze-clinical-report-sources.dto';
import {
  buildClinicalReportSourceFreezeCounts,
  buildClinicalReportSourceFreezeScope,
  buildSourceFreezeCompletionMetadata,
  buildSourceFreezeStartMetadata,
  ClinicalReportSourceFreezeRuleError,
  evaluateClinicalReportSourceFreezeReadiness,
  resolveExistingSourceFreeze,
} from '../lib/clinical-report-source-freeze';
import type {
  ClinicalReportSourceFreezeActor,
  ClinicalReportSourceFreezeMetadata,
  ClinicalReportSourceFreezeResourceCounts,
  ClinicalReportSourceFreezeScope,
} from '../types/clinical-report-source-freeze.types';
import type { FreezeClinicalReportSourcesResponse } from '../types/clinical-report-response.types';
import { ClinicalReportPublicMapper } from './clinical-report-public.mapper';
import type { ClinicalReportSummary } from './reports.service';
import { ReportsService } from './reports.service';

const EDITABLE_VISIT_STATUSES = new Set(['draft', 'in_progress', 'completed']);
const FREEZE_ACTOR_PRIORITY = ['doctor', 'admin'] as const;

type SourceFreezeResources = {
  scaleInstances: ScaleInstanceSummary[];
  itemResponses: ItemResponseSummary[];
  scoreResults: ScoreResultSummary[];
  cognitiveDomainResults: CognitiveDomainResultSummary[];
  mediaEvidence: MediaEvidenceSummary[];
};

type SourceFreezeWorkflowContext = {
  patient: PatientSummary;
  visit: AssessmentVisitSummary;
  report: ClinicalReportSummary;
};

@Injectable()
export class ClinicalReportSourceFreezeWorkflowService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly scoringService: ScoringService,
    private readonly cognitiveDomainsService: CognitiveDomainsService,
    private readonly mediaEvidenceService: MediaEvidenceService,
    private readonly reportsService: ReportsService,
    private readonly publicMapper: ClinicalReportPublicMapper,
  ) {}

  async freezeClinicalReportSources(
    patientId: string,
    visitId: string,
    reportId: string,
    currentUser: AuthenticatedUserContext | undefined,
    input: FreezeClinicalReportSourcesDto,
  ): Promise<FreezeClinicalReportSourcesResponse> {
    if (input.confirm !== true) {
      throw new BadRequestException({
        code: 'CLINICAL_REPORT_SOURCE_FREEZE_CONFIRMATION_REQUIRED',
        message: 'Clinical report source freeze must be explicit',
      });
    }
    const actor = this.buildSourceFreezeActor(currentUser);
    const expectedUpdatedAt = this.parseExpectedUpdatedAt(
      input.expectedUpdatedAt,
    );
    let context = await this.loadSourceFreezeContext(
      patientId,
      visitId,
      reportId,
    );
    const existing = this.resolveExisting(context.report);
    if (existing?.state === 'completed') {
      return this.buildResponse(context.report, existing, true, false);
    }

    let audit: ClinicalReportSourceFreezeMetadata;
    let resumedExisting = existing?.state === 'in_progress';
    if (existing) {
      audit = existing;
    } else {
      this.assertFirstStartResourceState(context);
      this.applyRule(() =>
        evaluateClinicalReportSourceFreezeReadiness({
          report: context.report,
          expectedUpdatedAt,
        }),
      );
      const firstResources = await this.loadInitialResources(context.report);
      const scope = buildClinicalReportSourceFreezeScope(
        context.report,
        firstResources.itemResponses.map((item) => item.id),
      );
      this.validateSourceScope(context.report, scope, firstResources, false);
      const now = new Date();
      const start = this.applyRule(() =>
        buildSourceFreezeStartMetadata({
          report: context.report,
          freezeId: randomUUID(),
          startedAt: now,
          sourceLockedAt: now,
          actor,
          freezeNote: input.freezeNote,
          scope,
          previouslyFrozenCounts: this.countPreviouslyFrozen(firstResources),
        }),
      );
      let started: ClinicalReportSummary | null;
      try {
        started = await this.reportsService.startSourceFreezeIfUnmodified({
          reportId,
          patientId,
          assessmentVisitId: visitId,
          expectedUpdatedAt,
          metadata: start.metadata,
        });
      } catch {
        throw this.failed();
      }
      if (!started) {
        const resolution = await this.resolveStartMiss(
          patientId,
          visitId,
          reportId,
          expectedUpdatedAt,
        );
        if (resolution.audit.state === 'completed') {
          return this.buildResponse(
            resolution.report,
            resolution.audit,
            true,
            false,
          );
        }
        context = { ...context, report: resolution.report };
        audit = resolution.audit;
        resumedExisting = true;
      } else {
        context = { ...context, report: started };
        audit = start.audit;
      }
    }

    const resources = await this.loadResourcesByAudit(audit, context.report);
    this.validateSourceScope(context.report, audit.scope, resources, true);
    const domainStatuses = new Map(
      resources.cognitiveDomainResults.map((item) => [item.id, item.status]),
    );
    await this.freezeSources(audit, context.report);
    const verified = await this.loadResourcesByAudit(audit, context.report);
    this.verifyFrozenSources(context.report, audit, verified, domainStatuses);
    const completedCounts = buildClinicalReportSourceFreezeCounts(audit.scope);
    const newlyFrozenCounts = this.subtractCounts(
      completedCounts,
      audit.previouslyFrozenCounts,
    );
    const completion = this.applyRule(() =>
      buildSourceFreezeCompletionMetadata({
        report: context.report,
        freezeId: audit.freezeId,
        completedAt: new Date(),
        actor,
        completedCounts,
        newlyFrozenCounts,
        previouslyFrozenCounts: audit.previouslyFrozenCounts,
      }),
    );
    let completed: ClinicalReportSummary | null;
    try {
      completed = await this.reportsService.completeSourceFreezeIfMatching({
        reportId,
        patientId,
        assessmentVisitId: visitId,
        freezeId: audit.freezeId,
        metadata: completion.metadata,
      });
    } catch {
      throw this.failed();
    }
    if (!completed) {
      completed = await this.resolveCompletionMiss(
        patientId,
        visitId,
        reportId,
        audit.freezeId,
      );
    }
    const completedAudit = this.resolveExisting(completed);
    if (!completedAudit || completedAudit.state !== 'completed') {
      throw this.incomplete();
    }
    return this.buildResponse(
      completed,
      completedAudit,
      false,
      resumedExisting,
    );
  }

  private async loadSourceFreezeContext(
    patientId: string,
    visitId: string,
    reportId: string,
  ): Promise<SourceFreezeWorkflowContext> {
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

  private assertFirstStartResourceState(
    context: SourceFreezeWorkflowContext,
  ): void {
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

  private async loadInitialResources(
    report: ClinicalReportSummary,
  ): Promise<SourceFreezeResources> {
    const itemResponses =
      await this.assessmentsService.listItemResponsesByScaleInstanceIds(
        report.patientId,
        report.assessmentVisitId,
        report.primaryScaleInstanceIds,
      );
    const scope = buildClinicalReportSourceFreezeScope(
      report,
      itemResponses.map((item) => item.id),
    );
    const resources = await this.loadResources(report, scope);
    return { ...resources, itemResponses };
  }

  private loadResourcesByAudit(
    audit: ClinicalReportSourceFreezeMetadata,
    report: ClinicalReportSummary,
  ): Promise<SourceFreezeResources> {
    return this.loadResourcesFromScope(audit.scope, {
      patientId: report.patientId,
      assessmentVisitId: report.assessmentVisitId,
    });
  }

  private async loadResources(
    report: ClinicalReportSummary,
    scope: ClinicalReportSourceFreezeScope,
  ): Promise<SourceFreezeResources> {
    return this.loadResourcesFromScope(scope, {
      patientId: report.patientId,
      assessmentVisitId: report.assessmentVisitId,
    });
  }

  private async loadResourcesFromScope(
    scope: ClinicalReportSourceFreezeScope,
    ownership: { patientId: string; assessmentVisitId: string },
  ): Promise<SourceFreezeResources> {
    const { patientId, assessmentVisitId } = ownership;
    const [
      scaleInstances,
      itemResponses,
      scoreResults,
      cognitiveDomainResults,
      mediaEvidence,
    ] = await Promise.all([
      this.assessmentsService.listScaleInstancesByIds(
        patientId,
        assessmentVisitId,
        scope.scaleInstanceIds,
      ),
      this.assessmentsService.listItemResponsesByIds(
        patientId,
        assessmentVisitId,
        scope.scaleInstanceIds,
        scope.itemResponseIds,
      ),
      this.scoringService.listScoreResultsByIds(
        patientId,
        assessmentVisitId,
        scope.scaleInstanceIds,
        scope.scoreResultIds,
      ),
      this.cognitiveDomainsService.listCognitiveDomainResultsByIds(
        patientId,
        assessmentVisitId,
        scope.scaleInstanceIds,
        scope.scoreResultIds,
        scope.cognitiveDomainResultIds,
      ),
      this.mediaEvidenceService.listMediaEvidenceByIds(
        patientId,
        assessmentVisitId,
        scope.scaleInstanceIds,
        scope.mediaEvidenceIds,
      ),
    ]);
    return {
      scaleInstances,
      itemResponses,
      scoreResults,
      cognitiveDomainResults,
      mediaEvidence,
    };
  }

  private validateSourceScope(
    report: ClinicalReportSummary,
    scope: ClinicalReportSourceFreezeScope,
    resources: SourceFreezeResources,
    recovering: boolean,
  ): void {
    this.assertExactIds(
      scope.scaleInstanceIds,
      resources.scaleInstances.map((item) => item.id),
    );
    this.assertExactIds(
      scope.itemResponseIds,
      resources.itemResponses.map((item) => item.id),
    );
    this.assertExactIds(
      scope.scoreResultIds,
      resources.scoreResults.map((item) => item.id),
    );
    this.assertExactIds(
      scope.cognitiveDomainResultIds,
      resources.cognitiveDomainResults.map((item) => item.id),
    );
    this.assertExactIds(
      scope.mediaEvidenceIds,
      resources.mediaEvidence.map((item) => item.id),
    );
    const scaleById = new Map(
      resources.scaleInstances.map((item) => [item.id, item]),
    );
    for (const scale of resources.scaleInstances) {
      const validStatus =
        scale.status === 'completed' || scale.status === 'locked';
      if (
        !validStatus ||
        scale.voidedAt !== null ||
        !this.isObjectId(scale.scaleDefinitionId) ||
        !this.isObjectId(scale.scaleVersionId) ||
        (scale.status === 'locked') !== (scale.lockedAt !== null)
      ) {
        this.inputInvalid();
      }
      const trace = report.scaleTraces.find(
        (item) => item.scaleInstanceId === scale.id,
      );
      if (
        !trace ||
        trace.scaleCode !== scale.scaleCode ||
        trace.scaleVersion !== scale.scaleVersion
      ) {
        this.scopeInvalid();
      }
    }
    const itemCodes = new Set<string>();
    const scaleWithItems = new Set<string>();
    for (const item of resources.itemResponses) {
      const key = `${item.scaleInstanceId}:${item.itemCode}`;
      if (
        !scaleById.has(item.scaleInstanceId) ||
        itemCodes.has(key) ||
        !['answered', 'scored', 'locked'].includes(item.status) ||
        item.voidedAt !== null ||
        (item.status === 'locked') !== (item.lockedAt !== null)
      ) {
        this.inputInvalid();
      }
      itemCodes.add(key);
      scaleWithItems.add(item.scaleInstanceId);
    }
    if (resources.scaleInstances.some((item) => !scaleWithItems.has(item.id))) {
      this.inputInvalid();
    }
    const scoreInstances = new Set<string>();
    for (const score of resources.scoreResults) {
      if (
        !scaleById.has(score.scaleInstanceId) ||
        scoreInstances.has(score.scaleInstanceId) ||
        score.runNo !== 1 ||
        !['confirmed', 'locked'].includes(score.status) ||
        score.confirmedAt === null ||
        score.qualityStatus !== 'passed' ||
        score.voidedAt !== null ||
        (score.status === 'locked') !== (score.lockedAt !== null)
      ) {
        this.inputInvalid();
      }
      const snapshot = report.scoreSnapshots.find(
        (item) => item.scoreResultId === score.id,
      );
      if (
        !snapshot ||
        snapshot.scaleCode !== score.scaleCode ||
        snapshot.scaleVersion !== score.scaleVersion
      ) {
        this.scopeInvalid();
      }
      scoreInstances.add(score.scaleInstanceId);
    }
    if (scoreInstances.size !== resources.scaleInstances.length) {
      this.scopeInvalid();
    }
    const scoreIds = new Set(scope.scoreResultIds);
    for (const domain of resources.cognitiveDomainResults) {
      if (
        !scaleById.has(domain.scaleInstanceId) ||
        !scoreIds.has(domain.scoreResultId) ||
        domain.runNo !== 1 ||
        !['computed', 'confirmed', 'locked'].includes(domain.status) ||
        domain.voidedAt !== null ||
        domain.computation?.warningCount !== 0 ||
        (domain.status === 'locked' && domain.lockedAt === null)
      ) {
        this.inputInvalid();
      }
      if (
        !report.domainSnapshots.some(
          (snapshot) =>
            snapshot.cognitiveDomainResultId === domain.id &&
            snapshot.scaleCode === domain.scaleCode,
        )
      ) {
        this.scopeInvalid();
      }
    }
    const itemIds = new Set(scope.itemResponseIds);
    for (const evidence of resources.mediaEvidence) {
      if (
        !scaleById.has(evidence.scaleInstanceId) ||
        !itemIds.has(evidence.itemResponseId) ||
        !['attached', 'locked'].includes(evidence.status) ||
        evidence.storageStatus !== 'stored' ||
        evidence.deletedAt !== null ||
        evidence.voidedAt !== null ||
        !['photo', 'handwriting'].includes(evidence.evidenceType) ||
        (evidence.status === 'locked') !== (evidence.lockedAt !== null) ||
        !evidence.storage?.objectKey
      ) {
        this.inputInvalid();
      }
      const snapshot = report.evidenceSnapshots.find(
        (item) => item.mediaEvidenceId === evidence.id,
      );
      if (
        !snapshot ||
        snapshot.itemResponseId !== evidence.itemResponseId ||
        snapshot.storageObjectKey !== evidence.storage.objectKey
      ) {
        this.scopeInvalid();
      }
    }
    if (recovering) {
      const audit = this.resolveExisting(report);
      if (!audit || audit.state !== 'in_progress') {
        throw new ClinicalReportSourceFreezeRuleError(
          'CLINICAL_REPORT_SOURCE_FREEZE_AUDIT_UNAVAILABLE',
        );
      }
    }
  }

  private async freezeSources(
    audit: ClinicalReportSourceFreezeMetadata,
    report: ClinicalReportSummary,
  ): Promise<void> {
    const patientId = report.patientId;
    const assessmentVisitId = report.assessmentVisitId;
    try {
      const scaleResult =
        await this.assessmentsService.freezeScaleInstancesByIds(
          patientId,
          assessmentVisitId,
          audit.scope.scaleInstanceIds,
          audit.sourceLockedAt,
        );
      this.assertBatchComplete(scaleResult.invalidCount);
      const itemResult = await this.assessmentsService.freezeItemResponsesByIds(
        patientId,
        assessmentVisitId,
        audit.scope.scaleInstanceIds,
        audit.scope.itemResponseIds,
        audit.sourceLockedAt,
      );
      this.assertBatchComplete(itemResult.invalidCount);
      const scoreResult = await this.scoringService.freezeScoreResultsByIds(
        patientId,
        assessmentVisitId,
        audit.scope.scaleInstanceIds,
        audit.scope.scoreResultIds,
        audit.sourceLockedAt,
      );
      this.assertBatchComplete(scoreResult.invalidCount);
      const domainResult =
        await this.cognitiveDomainsService.freezeCognitiveDomainResultsByIds(
          patientId,
          assessmentVisitId,
          audit.scope.scaleInstanceIds,
          audit.scope.scoreResultIds,
          audit.scope.cognitiveDomainResultIds,
          audit.sourceLockedAt,
        );
      this.assertBatchComplete(domainResult.invalidCount);
      const mediaResult =
        await this.mediaEvidenceService.freezeMediaEvidenceByIds(
          patientId,
          assessmentVisitId,
          audit.scope.scaleInstanceIds,
          audit.scope.mediaEvidenceIds,
          audit.sourceLockedAt,
        );
      this.assertBatchComplete(mediaResult.invalidCount);
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw this.failed();
    }
  }

  private verifyFrozenSources(
    report: ClinicalReportSummary,
    audit: ClinicalReportSourceFreezeMetadata,
    resources: SourceFreezeResources,
    domainStatuses: Map<string, CognitiveDomainResultSummary['status']>,
  ): void {
    this.validateSourceScope(report, audit.scope, resources, true);
    if (
      resources.scaleInstances.some(
        (item) => item.status !== 'locked' || item.lockedAt === null,
      ) ||
      resources.itemResponses.some(
        (item) => item.status !== 'locked' || item.lockedAt === null,
      ) ||
      resources.scoreResults.some(
        (item) => item.status !== 'locked' || item.lockedAt === null,
      ) ||
      resources.cognitiveDomainResults.some(
        (item) =>
          item.lockedAt === null || domainStatuses.get(item.id) !== item.status,
      ) ||
      resources.mediaEvidence.some(
        (item) =>
          item.status !== 'locked' ||
          item.lockedAt === null ||
          item.storageStatus !== 'stored' ||
          item.deletedAt !== null ||
          item.voidedAt !== null,
      )
    ) {
      throw this.incomplete();
    }
  }

  private countPreviouslyFrozen(
    resources: SourceFreezeResources,
  ): ClinicalReportSourceFreezeResourceCounts {
    const counts = {
      scaleInstanceCount: resources.scaleInstances.filter(
        (item) => item.status === 'locked' && item.lockedAt !== null,
      ).length,
      itemResponseCount: resources.itemResponses.filter(
        (item) => item.status === 'locked' && item.lockedAt !== null,
      ).length,
      scoreResultCount: resources.scoreResults.filter(
        (item) => item.status === 'locked' && item.lockedAt !== null,
      ).length,
      cognitiveDomainResultCount: resources.cognitiveDomainResults.filter(
        (item) => item.lockedAt !== null,
      ).length,
      mediaEvidenceCount: resources.mediaEvidence.filter(
        (item) => item.status === 'locked' && item.lockedAt !== null,
      ).length,
      totalSourceCount: 0,
    };
    counts.totalSourceCount =
      counts.scaleInstanceCount +
      counts.itemResponseCount +
      counts.scoreResultCount +
      counts.cognitiveDomainResultCount +
      counts.mediaEvidenceCount;
    return counts;
  }

  private subtractCounts(
    total: ClinicalReportSourceFreezeResourceCounts,
    previous: ClinicalReportSourceFreezeResourceCounts,
  ): ClinicalReportSourceFreezeResourceCounts {
    const result = {
      scaleInstanceCount:
        total.scaleInstanceCount - previous.scaleInstanceCount,
      itemResponseCount: total.itemResponseCount - previous.itemResponseCount,
      scoreResultCount: total.scoreResultCount - previous.scoreResultCount,
      cognitiveDomainResultCount:
        total.cognitiveDomainResultCount - previous.cognitiveDomainResultCount,
      mediaEvidenceCount:
        total.mediaEvidenceCount - previous.mediaEvidenceCount,
      totalSourceCount: total.totalSourceCount - previous.totalSourceCount,
    };
    if (Object.values(result).some((value) => value < 0)) {
      throw new ClinicalReportSourceFreezeRuleError(
        'CLINICAL_REPORT_SOURCE_FREEZE_AUDIT_UNAVAILABLE',
      );
    }
    return result;
  }

  private async resolveStartMiss(
    patientId: string,
    visitId: string,
    reportId: string,
    expectedUpdatedAt: Date,
  ): Promise<{
    report: ClinicalReportSummary;
    audit: ClinicalReportSourceFreezeMetadata;
  }> {
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
    const audit = this.resolveExisting(report);
    if (audit) {
      return { report, audit };
    }
    if (
      report.updatedAt &&
      report.updatedAt.getTime() !== expectedUpdatedAt.getTime()
    ) {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_SOURCE_FREEZE_CONFLICT',
        message: 'Clinical report changed after it was read',
      });
    }
    throw new ConflictException({
      code: 'CLINICAL_REPORT_NOT_SOURCE_FREEZABLE',
      message: 'Clinical report is not source-freezable',
    });
  }

  private async resolveCompletionMiss(
    patientId: string,
    visitId: string,
    reportId: string,
    freezeId: string,
  ): Promise<ClinicalReportSummary> {
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
    const audit = this.resolveExisting(report);
    if (audit?.state === 'completed' && audit.freezeId === freezeId) {
      return report;
    }
    if (audit?.freezeId !== freezeId) {
      throw new ConflictException({
        code: 'CLINICAL_REPORT_SOURCE_FREEZE_AUDIT_UNAVAILABLE',
        message: 'Clinical report source freeze audit is unavailable',
      });
    }
    throw new ConflictException({
      code: 'CLINICAL_REPORT_SOURCE_FREEZE_CONFLICT',
      message: 'Clinical report source freeze completion conflicted',
    });
  }

  private buildSourceFreezeActor(
    currentUser: AuthenticatedUserContext | undefined,
  ): ClinicalReportSourceFreezeActor {
    if (!currentUser || !Types.ObjectId.isValid(currentUser.id)) {
      throw new UnauthorizedException();
    }
    const operatorId = new Types.ObjectId(currentUser.id).toString();
    if (operatorId !== currentUser.id.trim().toLowerCase()) {
      throw new UnauthorizedException();
    }
    const operatorRole = FREEZE_ACTOR_PRIORITY.find((role) =>
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

  private buildResponse(
    report: ClinicalReportSummary,
    audit: ClinicalReportSourceFreezeMetadata,
    alreadyFrozen: boolean,
    resumedExisting: boolean,
  ): FreezeClinicalReportSourcesResponse {
    if (
      audit.state !== 'completed' ||
      !audit.completedAt ||
      !audit.completedBy ||
      !audit.completedByName ||
      !audit.completedByRole ||
      !audit.completedCounts ||
      !audit.newlyFrozenCounts
    ) {
      throw this.incomplete();
    }
    return {
      report: this.publicMapper.toPublicReport(report),
      sourceFreezeReceipt: {
        freezeId: audit.freezeId,
        state: 'completed',
        startedAt: new Date(audit.startedAt.getTime()),
        sourceLockedAt: new Date(audit.sourceLockedAt.getTime()),
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
        freezeNote: audit.freezeNote,
        expectedCounts: { ...audit.expectedCounts },
        completedCounts: { ...audit.completedCounts },
        newlyFrozenCounts: { ...audit.newlyFrozenCounts },
        previouslyFrozenCounts: { ...audit.previouslyFrozenCounts },
        alreadyFrozen,
        resumedExisting,
      },
    };
  }

  private resolveExisting(
    report: ClinicalReportSummary,
  ): ClinicalReportSourceFreezeMetadata | null {
    return this.applyRule(() => resolveExistingSourceFreeze(report));
  }

  private assertExactIds(expected: readonly string[], actual: string[]): void {
    const normalizedExpected = [...expected].sort();
    const normalizedActual = [...actual].sort();
    if (
      normalizedExpected.length !== normalizedActual.length ||
      normalizedExpected.some(
        (entry, index) => entry !== normalizedActual[index],
      )
    ) {
      this.scopeInvalid();
    }
  }

  private assertBatchComplete(invalidCount: number): void {
    if (invalidCount !== 0) {
      throw this.incomplete();
    }
  }

  private isObjectId(value: string): boolean {
    return (
      Types.ObjectId.isValid(value) &&
      new Types.ObjectId(value).toString() === value.toLowerCase()
    );
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
      if (error instanceof ClinicalReportSourceFreezeRuleError) {
        throw new ConflictException({
          code: error.code,
          message: 'Clinical report source freeze conflicts with current state',
        });
      }
      throw error;
    }
  }

  private scopeInvalid(): never {
    throw new ConflictException({
      code: 'CLINICAL_REPORT_SOURCE_FREEZE_SCOPE_INVALID',
      message: 'Clinical report source freeze scope is invalid',
    });
  }

  private inputInvalid(): never {
    throw new ConflictException({
      code: 'CLINICAL_REPORT_SOURCE_FREEZE_INPUT_INVALID',
      message: 'Clinical report source freeze input is invalid',
    });
  }

  private incomplete(): ConflictException {
    return new ConflictException({
      code: 'CLINICAL_REPORT_SOURCE_FREEZE_INCOMPLETE',
      message: 'Clinical report source freeze is incomplete',
    });
  }

  private failed(): InternalServerErrorException {
    return new InternalServerErrorException({
      code: 'CLINICAL_REPORT_SOURCE_FREEZE_FAILED',
      message: 'Clinical report source freeze failed',
    });
  }
}
