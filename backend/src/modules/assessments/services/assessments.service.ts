// backend/src/modules/assessments/services/assessments.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PatientsService } from '../../patients/services/patients.service';
import type { CreateAssessmentVisitDto } from '../dto/create-assessment-visit.dto';
import type { ListAssessmentVisitsQueryDto } from '../dto/list-assessment-visits-query.dto';
import {
  AssessmentClinicalContext,
  AssessmentOperatorRole,
  AssessmentOperatorSnapshot,
  AssessmentStatus,
  AssessmentVisit,
  AssessmentVisitDocument,
  AssessmentVisitMetadata,
  AssessmentVisitType,
} from '../schemas/assessment-visit.schema';
import {
  ItemConfigSnapshot,
  ItemEvidenceRef,
  ItemEvidenceStatus,
  ItemEvidenceType,
  ItemQualityControlHints,
  ItemRawResponse,
  ItemResponse,
  ItemResponseAnswerSource,
  ItemResponseDocument,
  ItemResponseMetadata,
  ItemResponseStatus,
  ItemResponseVersionTrace,
  ItemScoreSnapshot,
  ItemScoreSource,
  ItemScoreStatus,
  ItemStepResult,
  ItemStepValue,
  ItemStructuredResponse,
  ItemTimerSource,
  ItemTimingSnapshot,
  PromptResponseRecord,
  PromptResponseType,
  PromptResponseValue,
} from '../schemas/item-response.schema';
import {
  ScaleAdministrationMode,
  ScaleInstance,
  ScaleInstanceDocument,
  ScaleInstanceMetadata,
  ScaleInstanceProgress,
  ScaleQualityControlSummary,
  ScaleVersionTrace,
} from '../schemas/scale-instance.schema';
import { ScaleResponseType } from '../../scales/schemas/scale-version.schema';
import type {
  AssessmentVisitExecutionDetailResponse,
  ScaleInstanceListItemResponse,
  ScaleInstanceProgressResponse,
} from '../types/assessment-execution-response.types';
import type { ScaleSubmissionReadinessSummaryResponse } from '../types/scale-instance-submission-response.types';
import type {
  AssessmentVisitDetailResponse,
  AssessmentVisitListItemResponse,
  AssessmentVisitListResponse,
} from '../types/assessment-visit-response.types';

export type AssessmentOperatorSnapshotSummary = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: AssessmentOperatorRole;
};

export type AssessmentVisitSummary = {
  id: string;
  patientId: string;
  subjectCode: string;
  visitCode: string;
  visitType: AssessmentVisitType;
  status: AssessmentStatus;
  assessmentDate: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  lockedAt: Date | null;
  voidedAt: Date | null;
  operatorSnapshot: AssessmentOperatorSnapshotSummary | null;
  clinicalContext: AssessmentClinicalContext;
  notes?: string;
  metadata: AssessmentVisitMetadata;
};

export type CreateVisitOperatorSnapshot = {
  operatorId: string;
  operatorName: string;
  operatorRole: AssessmentOperatorRole;
};

export type CreateVisitForPatientInput = CreateAssessmentVisitDto & {
  operatorSnapshot: CreateVisitOperatorSnapshot;
};

type MongoDuplicateKeyError = {
  code: number;
};

type AssessmentVisitListFilter = {
  assessmentDate?: {
    $gte?: Date;
    $lte?: Date;
  };
  patientId: Types.ObjectId;
  status?: AssessmentStatus;
  visitType?: AssessmentVisitType;
};

type ItemResponseOwnershipFilter = {
  _id: Types.ObjectId;
  assessmentVisitId: Types.ObjectId;
  scaleInstanceId: Types.ObjectId;
  patientId: Types.ObjectId;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMongoDuplicateKeyError(
  error: unknown,
): error is MongoDuplicateKeyError {
  return isRecord(error) && error.code === 11000;
}

export type ScaleVersionTraceSummary = {
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  sourceDocument?: string;
};

export type ScaleInstanceSummary = {
  id: string;
  assessmentVisitId: string;
  patientId: string;
  subjectCode: string;
  scaleDefinitionId: string;
  scaleVersionId: string;
  scaleCode: string;
  scaleVersion: string;
  instanceCode: string;
  instanceNo: number;
  status: AssessmentStatus;
  administrationMode: ScaleAdministrationMode;
  versionTrace: ScaleVersionTraceSummary | null;
  startedAt: Date | null;
  completedAt: Date | null;
  lockedAt: Date | null;
  voidedAt: Date | null;
  durationMs: number | null;
  operatorSnapshot: AssessmentOperatorSnapshotSummary | null;
  progress: ScaleInstanceProgress;
  qualityControlSummary: ScaleQualityControlSummary;
  notes?: string;
  metadata: ScaleInstanceMetadata;
};

export type CompleteScaleInstanceInput = {
  submissionId: string;
  completionTime: Date;
  startedAtToSet?: Date;
  durationMs: number | null;
  submittedBy: string;
  submittedByName: string;
  submittedByRole: AssessmentOperatorRole;
  readinessSummary: Pick<
    ScaleSubmissionReadinessSummaryResponse,
    | 'expectedItemCount'
    | 'actualItemCount'
    | 'completedItemCount'
    | 'blockingIssueCount'
    | 'warningCount'
  >;
};

export type ScaleInstanceSubmissionAuditSummary = {
  submissionId: string | null;
  submittedAt: Date | null;
  submittedBy: string | null;
  submittedByName?: string;
  submittedByRole?: AssessmentOperatorRole;
};

export type ItemResponseVersionTraceSummary = {
  scaleVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  sourceDocument?: string;
};

export type ItemScoreSummary = {
  scoreValue: number | null;
  maxScore: number | null;
  minScore: number | null;
  scoreStatus: ItemScoreStatus;
  scoreSource: ItemScoreSource;
  scoredAt: Date | null;
  scoredBy: string | null;
  scoringNote?: string;
};

export type ItemStepResultSummary = {
  stepCode: string;
  crfCode?: string;
  label?: string;
  order: number;
  expectedValue: ItemStepValue;
  actualValue: ItemStepValue;
  isCorrect: boolean | null;
  scoreValue: number | null;
  countsTowardItemScore: boolean;
  note?: string;
};

export type PromptResponseRecordSummary = {
  promptType: PromptResponseType;
  promptText?: string;
  responseAfterPrompt: PromptResponseValue;
  isCorrect: boolean | null;
  countsTowardScore: boolean;
  order: number;
  note?: string;
};

export type ItemResponseTimingSummary = {
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  timerSource: ItemTimerSource;
};

export type ItemEvidenceRefSummary = {
  evidenceType: ItemEvidenceType;
  mediaEvidenceId: string | null;
  status: ItemEvidenceStatus;
  note?: string;
};

export type ItemResponseSummary = {
  id: string;
  assessmentVisitId: string;
  scaleInstanceId: string;
  patientId: string;
  subjectCode: string;
  scaleDefinitionId: string;
  scaleVersionId: string;
  scaleCode: string;
  scaleVersion: string;
  instanceCode: string;
  itemCode: string;
  crfCode?: string;
  groupCode?: string;
  itemTitle?: string;
  itemOrder: number;
  responseType: ScaleResponseType;
  countsTowardTotal: boolean;
  cognitiveDomainCodes: string[];
  itemConfigSnapshot: ItemConfigSnapshot;
  versionTrace: ItemResponseVersionTraceSummary | null;
  status: ItemResponseStatus;
  answerSource: ItemResponseAnswerSource;
  rawResponse: ItemRawResponse;
  structuredResponse: ItemStructuredResponse;
  responseText?: string;
  responseSummary?: string;
  isMissing: boolean;
  missingReason?: string;
  score: ItemScoreSummary | null;
  stepResults: ItemStepResultSummary[];
  promptResponses: PromptResponseRecordSummary[];
  timing: ItemResponseTimingSummary | null;
  evidenceRefs: ItemEvidenceRefSummary[];
  operatorNote?: string;
  qualityControlHints: ItemQualityControlHints;
  metadata: ItemResponseMetadata;
  lockedAt: Date | null;
  voidedAt: Date | null;
};

export type AssessmentSourceFreezeItem = {
  id: string;
  patientId: string;
  assessmentVisitId: string;
  scaleInstanceId?: string;
  status: string;
  lockedAt: Date | null;
};

export type AssessmentSourceFreezeBatchResult = {
  requestedCount: number;
  matchedCount: number;
  newlyFrozenCount: number;
  previouslyFrozenCount: number;
  invalidCount: number;
  items: AssessmentSourceFreezeItem[];
};

@Injectable()
export class AssessmentsService {
  constructor(
    @InjectModel(AssessmentVisit.name)
    private readonly assessmentVisitModel: Model<AssessmentVisitDocument>,
    @InjectModel(ScaleInstance.name)
    private readonly scaleInstanceModel: Model<ScaleInstanceDocument>,
    @InjectModel(ItemResponse.name)
    private readonly itemResponseModel: Model<ItemResponseDocument>,
    private readonly patientsService: PatientsService,
  ) {}

  normalizeVisitCode(visitCode: string): string {
    return visitCode.trim().toUpperCase();
  }

  normalizeInstanceCode(instanceCode: string): string {
    return instanceCode.trim().toUpperCase();
  }

  normalizeItemCode(itemCode: string): string {
    return itemCode.trim().toLowerCase();
  }

  normalizeScaleCode(scaleCode: string): string {
    return scaleCode.trim().toLowerCase();
  }

  async findVisitByCode(
    visitCode: string,
  ): Promise<AssessmentVisitSummary | null> {
    const normalizedCode = this.normalizeVisitCode(visitCode);

    if (!normalizedCode) {
      return null;
    }

    const visit = await this.assessmentVisitModel
      .findOne({ visitCode: normalizedCode })
      .exec();

    if (!visit) {
      return null;
    }

    return this.mapVisit(visit);
  }

  async findVisitById(
    visitId: Types.ObjectId | string,
  ): Promise<AssessmentVisitSummary | null> {
    const normalizedId = this.normalizeObjectId(visitId);

    if (!normalizedId) {
      return null;
    }

    const visit = await this.assessmentVisitModel
      .findOne({ _id: normalizedId })
      .exec();

    return visit ? this.mapVisit(visit) : null;
  }

  async findVisitByPatientAndId(
    patientId: Types.ObjectId | string,
    visitId: Types.ObjectId | string,
  ): Promise<AssessmentVisitSummary | null> {
    const normalizedPatientId = this.normalizeObjectId(patientId);
    const normalizedVisitId = this.normalizeObjectId(visitId);

    if (!normalizedPatientId || !normalizedVisitId) {
      return null;
    }

    const visit = await this.assessmentVisitModel
      .findOne({ _id: normalizedVisitId, patientId: normalizedPatientId })
      .exec();

    return visit ? this.mapVisit(visit) : null;
  }

  async getVisitExecutionDetail(
    patientId: Types.ObjectId | string,
    visitId: Types.ObjectId | string,
  ): Promise<AssessmentVisitExecutionDetailResponse> {
    const normalizedPatientId = this.requireObjectId(patientId, 'patientId');
    const normalizedVisitId = this.requireObjectId(visitId, 'visitId');
    await this.requirePatient(normalizedPatientId);
    const visit = await this.findVisitByPatientAndId(
      normalizedPatientId,
      normalizedVisitId,
    );

    if (!visit) {
      throw new NotFoundException({
        code: 'VISIT_NOT_FOUND',
        message: 'Assessment visit not found',
      });
    }

    const scaleInstances =
      await this.listScaleInstancesByVisitId(normalizedVisitId);

    const publicScaleInstances = await Promise.all(
      scaleInstances.map(async (scaleInstance) => {
        const progress = await this.countItemResponseProgress(scaleInstance.id);
        return this.toPublicScaleInstanceResponse(scaleInstance, progress);
      }),
    );

    return {
      visit: this.toAssessmentVisitDetailResponse(visit),
      scaleInstances: publicScaleInstances,
    };
  }

  async listVisitsByPatientId(
    patientId: Types.ObjectId | string,
  ): Promise<AssessmentVisitSummary[]> {
    const normalizedId = this.normalizeObjectId(patientId);

    if (!normalizedId) {
      return [];
    }

    const visits = await this.assessmentVisitModel
      .find({ patientId: normalizedId })
      .sort({ assessmentDate: -1 })
      .exec();

    return visits.map((visit) => this.mapVisit(visit));
  }

  async listVisitsByPatientIdPaginated(
    patientId: Types.ObjectId | string,
    query: ListAssessmentVisitsQueryDto,
  ): Promise<AssessmentVisitListResponse> {
    const normalizedId = this.requireObjectId(patientId, 'patientId');
    await this.requirePatient(normalizedId);
    this.assertValidDateRange(query.dateFrom, query.dateTo);

    const filter: AssessmentVisitListFilter = {
      patientId: normalizedId,
    };

    if (query.status) {
      filter.status = query.status;
    }

    if (query.visitType) {
      filter.visitType = query.visitType;
    }

    if (query.dateFrom || query.dateTo) {
      filter.assessmentDate = {
        ...(query.dateFrom ? { $gte: query.dateFrom } : {}),
        ...(query.dateTo ? { $lte: query.dateTo } : {}),
      };
    }

    const skip = (query.page - 1) * query.pageSize;
    const [visits, total] = await Promise.all([
      this.assessmentVisitModel
        .find(filter)
        .sort({ assessmentDate: -1, _id: -1 })
        .skip(skip)
        .limit(query.pageSize)
        .exec(),
      this.assessmentVisitModel.countDocuments(filter).exec(),
    ]);

    return {
      items: visits.map((visit) =>
        this.toAssessmentVisitListItemResponse(this.mapVisit(visit)),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async createVisitForPatient(
    patientId: Types.ObjectId | string,
    input: CreateVisitForPatientInput,
  ): Promise<AssessmentVisitDetailResponse> {
    const normalizedPatientId = this.requireObjectId(patientId, 'patientId');
    const patient = await this.requirePatient(normalizedPatientId);

    if (patient.status !== 'active') {
      throw new ConflictException({
        code: 'PATIENT_NOT_ACTIVE',
        message: 'Patient is not active',
      });
    }

    const visitCode = this.normalizeVisitCode(input.visitCode);
    const existingVisit = await this.assessmentVisitModel
      .findOne({ visitCode })
      .exec();

    if (existingVisit) {
      this.throwVisitCodeConflict();
    }

    const operatorId = this.requireObjectId(
      input.operatorSnapshot.operatorId,
      'operatorSnapshot.operatorId',
    );

    try {
      const visit = await this.assessmentVisitModel.create({
        patientId: normalizedPatientId,
        subjectCode: patient.subjectCode,
        visitCode,
        visitType: input.visitType ?? 'baseline',
        status: 'draft',
        assessmentDate: input.assessmentDate,
        startedAt: null,
        completedAt: null,
        lockedAt: null,
        voidedAt: null,
        operatorSnapshot: {
          operatorId,
          operatorName: input.operatorSnapshot.operatorName.trim(),
          operatorRole: input.operatorSnapshot.operatorRole,
        },
        clinicalContext: null,
        notes: input.notes?.trim() || undefined,
        metadata: null,
      });

      return this.toAssessmentVisitDetailResponse(this.mapVisit(visit));
    } catch (error: unknown) {
      if (isMongoDuplicateKeyError(error)) {
        this.throwVisitCodeConflict();
      }

      throw error;
    }
  }

  toAssessmentVisitListItemResponse(
    visit: AssessmentVisitSummary,
  ): AssessmentVisitListItemResponse {
    return {
      id: visit.id,
      patientId: visit.patientId,
      subjectCode: visit.subjectCode,
      visitCode: visit.visitCode,
      visitType: visit.visitType,
      status: visit.status,
      assessmentDate: visit.assessmentDate,
      startedAt: visit.startedAt,
      completedAt: visit.completedAt,
      lockedAt: visit.lockedAt,
      voidedAt: visit.voidedAt,
      operatorSnapshot: visit.operatorSnapshot
        ? { ...visit.operatorSnapshot }
        : null,
      notes: visit.notes,
    };
  }

  toAssessmentVisitDetailResponse(
    visit: AssessmentVisitSummary,
  ): AssessmentVisitDetailResponse {
    return this.toAssessmentVisitListItemResponse(visit);
  }

  async findScaleInstanceByCode(
    instanceCode: string,
  ): Promise<ScaleInstanceSummary | null> {
    const normalizedCode = this.normalizeInstanceCode(instanceCode);

    if (!normalizedCode) {
      return null;
    }

    const scaleInstance = await this.scaleInstanceModel
      .findOne({ instanceCode: normalizedCode })
      .exec();

    if (!scaleInstance) {
      return null;
    }

    return this.mapScaleInstance(scaleInstance);
  }

  async listScaleInstancesByVisitId(
    assessmentVisitId: Types.ObjectId | string,
  ): Promise<ScaleInstanceSummary[]> {
    const normalizedId = this.normalizeObjectId(assessmentVisitId);

    if (!normalizedId) {
      return [];
    }

    const scaleInstances = await this.scaleInstanceModel
      .find({ assessmentVisitId: normalizedId })
      .sort({ scaleCode: 1, instanceNo: 1 })
      .exec();

    return scaleInstances.map((scaleInstance) =>
      this.mapScaleInstance(scaleInstance),
    );
  }

  async findScaleInstanceByVisitAndScaleCode(
    assessmentVisitId: Types.ObjectId | string,
    scaleCode: string,
  ): Promise<ScaleInstanceSummary | null> {
    const normalizedVisitId = this.normalizeObjectId(assessmentVisitId);
    const normalizedScaleCode = this.normalizeScaleCode(scaleCode);

    if (!normalizedVisitId || !normalizedScaleCode) {
      return null;
    }

    const scaleInstance = await this.scaleInstanceModel
      .findOne({
        assessmentVisitId: normalizedVisitId,
        scaleCode: normalizedScaleCode,
      })
      .exec();

    return scaleInstance ? this.mapScaleInstance(scaleInstance) : null;
  }

  async findScaleInstanceByPatientVisitAndId(
    patientId: Types.ObjectId | string,
    assessmentVisitId: Types.ObjectId | string,
    scaleInstanceId: Types.ObjectId | string,
  ): Promise<ScaleInstanceSummary | null> {
    const normalizedPatientId = this.normalizeObjectId(patientId);
    const normalizedVisitId = this.normalizeObjectId(assessmentVisitId);
    const normalizedScaleInstanceId = this.normalizeObjectId(scaleInstanceId);

    if (
      !normalizedPatientId ||
      !normalizedVisitId ||
      !normalizedScaleInstanceId
    ) {
      return null;
    }

    const scaleInstance = await this.scaleInstanceModel
      .findOne({
        _id: normalizedScaleInstanceId,
        assessmentVisitId: normalizedVisitId,
        patientId: normalizedPatientId,
      })
      .exec();

    return scaleInstance ? this.mapScaleInstance(scaleInstance) : null;
  }

  async listScaleInstancesByIds(
    patientId: Types.ObjectId | string,
    assessmentVisitId: Types.ObjectId | string,
    scaleInstanceIds: readonly string[],
  ): Promise<ScaleInstanceSummary[]> {
    const normalizedPatientId = this.normalizeObjectId(patientId);
    const normalizedVisitId = this.normalizeObjectId(assessmentVisitId);
    const normalizedIds = this.normalizeObjectIds(scaleInstanceIds);
    if (!normalizedPatientId || !normalizedVisitId || !normalizedIds) {
      return [];
    }
    const instances = await this.scaleInstanceModel
      .find({
        _id: { $in: normalizedIds },
        patientId: normalizedPatientId,
        assessmentVisitId: normalizedVisitId,
      })
      .sort({ _id: 1 })
      .exec();
    return instances.map((instance) => this.mapScaleInstance(instance));
  }

  async freezeScaleInstancesByIds(
    patientId: Types.ObjectId | string,
    assessmentVisitId: Types.ObjectId | string,
    scaleInstanceIds: readonly string[],
    sourceLockedAt: Date,
  ): Promise<AssessmentSourceFreezeBatchResult> {
    const normalizedPatientId = this.normalizeObjectId(patientId);
    const normalizedVisitId = this.normalizeObjectId(assessmentVisitId);
    const normalizedIds = this.normalizeObjectIds(scaleInstanceIds);
    if (
      !normalizedPatientId ||
      !normalizedVisitId ||
      !normalizedIds ||
      !Number.isFinite(sourceLockedAt.getTime())
    ) {
      return this.emptyAssessmentFreezeResult(scaleInstanceIds.length);
    }
    const before = await this.scaleInstanceModel
      .find({
        _id: { $in: normalizedIds },
        patientId: normalizedPatientId,
        assessmentVisitId: normalizedVisitId,
      })
      .exec();
    const previouslyFrozenCount = before.filter(
      (item) => item.status === 'locked' && item.lockedAt instanceof Date,
    ).length;
    const updateResult = await this.scaleInstanceModel
      .updateMany(
        {
          _id: { $in: normalizedIds },
          patientId: normalizedPatientId,
          assessmentVisitId: normalizedVisitId,
          status: 'completed',
          lockedAt: null,
          voidedAt: null,
        },
        { $set: { status: 'locked', lockedAt: sourceLockedAt } },
        { runValidators: true },
      )
      .exec();
    const after = await this.scaleInstanceModel
      .find({
        _id: { $in: normalizedIds },
        patientId: normalizedPatientId,
        assessmentVisitId: normalizedVisitId,
      })
      .sort({ _id: 1 })
      .exec();
    const items = after.map((item) => ({
      id: item._id.toString(),
      patientId: item.patientId.toString(),
      assessmentVisitId: item.assessmentVisitId.toString(),
      status: item.status,
      lockedAt: item.lockedAt ?? null,
    }));
    const validCount = items.filter(
      (item) => item.status === 'locked' && item.lockedAt !== null,
    ).length;
    return {
      requestedCount: normalizedIds.length,
      matchedCount: items.length,
      newlyFrozenCount: updateResult.modifiedCount,
      previouslyFrozenCount,
      invalidCount: normalizedIds.length - validCount,
      items,
    };
  }

  async completeScaleInstanceIfEditable(
    patientId: Types.ObjectId | string,
    assessmentVisitId: Types.ObjectId | string,
    scaleInstanceId: Types.ObjectId | string,
    input: CompleteScaleInstanceInput,
  ): Promise<ScaleInstanceSummary | null> {
    const normalizedPatientId = this.normalizeObjectId(patientId);
    const normalizedVisitId = this.normalizeObjectId(assessmentVisitId);
    const normalizedScaleInstanceId = this.normalizeObjectId(scaleInstanceId);
    const submittedBy = this.normalizeObjectId(input.submittedBy);

    if (
      !normalizedPatientId ||
      !normalizedVisitId ||
      !normalizedScaleInstanceId ||
      !submittedBy
    ) {
      return null;
    }

    const progress = {
      totalItemCount: input.readinessSummary.actualItemCount,
      answeredItemCount: input.readinessSummary.completedItemCount,
      source: 'submission',
      finalizedAt: input.completionTime,
    };
    const updateFields: Record<string, unknown> = {
      status: 'completed',
      completedAt: input.completionTime,
      durationMs: input.durationMs,
      progress,
      'metadata.submission.submissionId': input.submissionId,
      'metadata.submission.submittedAt': input.completionTime,
      'metadata.submission.submittedBy': submittedBy,
      'metadata.submission.submittedByName': input.submittedByName,
      'metadata.submission.submittedByRole': input.submittedByRole,
      'metadata.submission.readinessSummary.expectedItemCount':
        input.readinessSummary.expectedItemCount,
      'metadata.submission.readinessSummary.actualItemCount':
        input.readinessSummary.actualItemCount,
      'metadata.submission.readinessSummary.completedItemCount':
        input.readinessSummary.completedItemCount,
      'metadata.submission.readinessSummary.blockingIssueCount':
        input.readinessSummary.blockingIssueCount,
      'metadata.submission.readinessSummary.warningCount':
        input.readinessSummary.warningCount,
    };

    if (input.startedAtToSet) {
      updateFields.startedAt = input.startedAtToSet;
    }

    const completed = await this.scaleInstanceModel
      .findOneAndUpdate(
        {
          _id: normalizedScaleInstanceId,
          patientId: normalizedPatientId,
          assessmentVisitId: normalizedVisitId,
          status: { $in: ['draft', 'in_progress'] },
          lockedAt: null,
        },
        { $set: updateFields },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    return completed ? this.mapScaleInstance(completed) : null;
  }

  readScaleInstanceSubmissionAudit(
    scaleInstance: ScaleInstanceSummary,
  ): ScaleInstanceSubmissionAuditSummary | null {
    if (!isRecord(scaleInstance.metadata)) {
      return null;
    }

    const submission = scaleInstance.metadata.submission;
    if (!isRecord(submission)) {
      return null;
    }

    return {
      submissionId:
        typeof submission.submissionId === 'string' &&
        submission.submissionId.trim()
          ? submission.submissionId
          : null,
      submittedAt: this.readAuditDate(submission.submittedAt),
      submittedBy: this.readAuditObjectId(submission.submittedBy),
      submittedByName:
        typeof submission.submittedByName === 'string' &&
        submission.submittedByName.trim()
          ? submission.submittedByName
          : undefined,
      submittedByRole: this.readAssessmentOperatorRole(
        submission.submittedByRole,
      ),
    };
  }

  toPublicScaleInstanceResponse(
    scaleInstance: ScaleInstanceSummary,
    actualProgress?: ScaleInstanceProgressResponse,
  ): ScaleInstanceListItemResponse {
    return {
      id: scaleInstance.id,
      assessmentVisitId: scaleInstance.assessmentVisitId,
      patientId: scaleInstance.patientId,
      subjectCode: scaleInstance.subjectCode,
      scaleCode: scaleInstance.scaleCode,
      scaleVersion: scaleInstance.scaleVersion,
      instanceCode: scaleInstance.instanceCode,
      instanceNo: scaleInstance.instanceNo,
      status: scaleInstance.status,
      administrationMode: scaleInstance.administrationMode,
      versionTrace: scaleInstance.versionTrace
        ? {
            crfVersion: scaleInstance.versionTrace.crfVersion,
            scoringRuleVersion: scaleInstance.versionTrace.scoringRuleVersion,
            fieldEncodingVersion:
              scaleInstance.versionTrace.fieldEncodingVersion,
            sourceDocument: scaleInstance.versionTrace.sourceDocument,
          }
        : null,
      startedAt: scaleInstance.startedAt,
      completedAt: scaleInstance.completedAt,
      lockedAt: scaleInstance.lockedAt,
      voidedAt: scaleInstance.voidedAt,
      durationMs: scaleInstance.durationMs,
      operatorSnapshot: scaleInstance.operatorSnapshot
        ? {
            operatorId: scaleInstance.operatorSnapshot.operatorId,
            operatorName: scaleInstance.operatorSnapshot.operatorName,
            operatorRole: scaleInstance.operatorSnapshot.operatorRole,
          }
        : null,
      progress:
        actualProgress ??
        this.toPublicScaleInstanceProgress(scaleInstance.progress),
    };
  }

  async findItemResponseByScaleInstanceAndItemCode(
    scaleInstanceId: Types.ObjectId | string,
    itemCode: string,
  ): Promise<ItemResponseSummary | null> {
    const normalizedId = this.normalizeObjectId(scaleInstanceId);
    const normalizedCode = this.normalizeItemCode(itemCode);

    if (!normalizedId || !normalizedCode) {
      return null;
    }

    const itemResponse = await this.itemResponseModel
      .findOne({ scaleInstanceId: normalizedId, itemCode: normalizedCode })
      .exec();

    if (!itemResponse) {
      return null;
    }

    return this.toItemResponseSummary(itemResponse);
  }

  async findItemResponseByOwnership(
    patientId: Types.ObjectId | string,
    assessmentVisitId: Types.ObjectId | string,
    scaleInstanceId: Types.ObjectId | string,
    itemResponseId: Types.ObjectId | string,
  ): Promise<ItemResponseSummary | null> {
    const normalizedPatientId = this.normalizeObjectId(patientId);
    const normalizedVisitId = this.normalizeObjectId(assessmentVisitId);
    const normalizedScaleInstanceId = this.normalizeObjectId(scaleInstanceId);
    const normalizedItemResponseId = this.normalizeObjectId(itemResponseId);

    if (
      !normalizedPatientId ||
      !normalizedVisitId ||
      !normalizedScaleInstanceId ||
      !normalizedItemResponseId
    ) {
      return null;
    }

    const itemResponse = await this.itemResponseModel
      .findOne({
        _id: normalizedItemResponseId,
        assessmentVisitId: normalizedVisitId,
        scaleInstanceId: normalizedScaleInstanceId,
        patientId: normalizedPatientId,
      })
      .exec();

    return itemResponse ? this.toItemResponseSummary(itemResponse) : null;
  }

  async attachItemEvidenceReference(
    patientId: Types.ObjectId | string,
    assessmentVisitId: Types.ObjectId | string,
    scaleInstanceId: Types.ObjectId | string,
    itemResponseId: Types.ObjectId | string,
    evidenceType: ItemEvidenceType,
    mediaEvidenceId: Types.ObjectId | string,
  ): Promise<ItemResponseSummary | null> {
    const ownership = this.normalizeItemResponseOwnership(
      patientId,
      assessmentVisitId,
      scaleInstanceId,
      itemResponseId,
    );
    const normalizedMediaEvidenceId = this.normalizeObjectId(mediaEvidenceId);

    if (!ownership || !normalizedMediaEvidenceId) {
      return null;
    }

    const itemResponse = await this.itemResponseModel
      .findOneAndUpdate(
        {
          ...ownership,
          status: { $in: ['not_started', 'in_progress', 'answered'] },
          lockedAt: null,
          evidenceRefs: {
            $elemMatch: {
              evidenceType,
              mediaEvidenceId: null,
              status: { $in: ['pending', 'missing'] },
            },
          },
        },
        {
          $set: {
            'evidenceRefs.$[evidenceRef].mediaEvidenceId':
              normalizedMediaEvidenceId,
            'evidenceRefs.$[evidenceRef].status': 'attached',
          },
        },
        {
          arrayFilters: [
            {
              'evidenceRef.evidenceType': evidenceType,
              'evidenceRef.mediaEvidenceId': null,
              'evidenceRef.status': { $in: ['pending', 'missing'] },
            },
          ],
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .exec();

    return itemResponse ? this.toItemResponseSummary(itemResponse) : null;
  }

  async clearItemEvidenceReference(
    patientId: Types.ObjectId | string,
    assessmentVisitId: Types.ObjectId | string,
    scaleInstanceId: Types.ObjectId | string,
    itemResponseId: Types.ObjectId | string,
    evidenceType: ItemEvidenceType,
    mediaEvidenceId: Types.ObjectId | string,
  ): Promise<ItemResponseSummary | null> {
    const ownership = this.normalizeItemResponseOwnership(
      patientId,
      assessmentVisitId,
      scaleInstanceId,
      itemResponseId,
    );
    const normalizedMediaEvidenceId = this.normalizeObjectId(mediaEvidenceId);

    if (!ownership || !normalizedMediaEvidenceId) {
      return null;
    }

    const itemResponse = await this.itemResponseModel
      .findOneAndUpdate(
        {
          ...ownership,
          status: { $in: ['not_started', 'in_progress', 'answered'] },
          lockedAt: null,
          evidenceRefs: {
            $elemMatch: {
              evidenceType,
              mediaEvidenceId: normalizedMediaEvidenceId,
              status: 'attached',
            },
          },
        },
        {
          $set: {
            'evidenceRefs.$[evidenceRef].mediaEvidenceId': null,
            'evidenceRefs.$[evidenceRef].status': 'pending',
          },
        },
        {
          arrayFilters: [
            {
              'evidenceRef.evidenceType': evidenceType,
              'evidenceRef.mediaEvidenceId': normalizedMediaEvidenceId,
              'evidenceRef.status': 'attached',
            },
          ],
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .exec();

    return itemResponse ? this.toItemResponseSummary(itemResponse) : null;
  }

  async restoreItemEvidenceReference(
    patientId: Types.ObjectId | string,
    assessmentVisitId: Types.ObjectId | string,
    scaleInstanceId: Types.ObjectId | string,
    itemResponseId: Types.ObjectId | string,
    evidenceType: ItemEvidenceType,
    mediaEvidenceId: Types.ObjectId | string,
  ): Promise<ItemResponseSummary | null> {
    const ownership = this.normalizeItemResponseOwnership(
      patientId,
      assessmentVisitId,
      scaleInstanceId,
      itemResponseId,
    );
    const normalizedMediaEvidenceId = this.normalizeObjectId(mediaEvidenceId);

    if (!ownership || !normalizedMediaEvidenceId) {
      return null;
    }

    const itemResponse = await this.itemResponseModel
      .findOneAndUpdate(
        {
          ...ownership,
          lockedAt: null,
          evidenceRefs: {
            $elemMatch: {
              evidenceType,
              mediaEvidenceId: null,
              status: 'pending',
            },
          },
        },
        {
          $set: {
            'evidenceRefs.$[evidenceRef].mediaEvidenceId':
              normalizedMediaEvidenceId,
            'evidenceRefs.$[evidenceRef].status': 'attached',
          },
        },
        {
          arrayFilters: [
            {
              'evidenceRef.evidenceType': evidenceType,
              'evidenceRef.mediaEvidenceId': null,
              'evidenceRef.status': 'pending',
            },
          ],
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .exec();

    return itemResponse ? this.toItemResponseSummary(itemResponse) : null;
  }

  async listItemResponsesByScaleInstanceId(
    scaleInstanceId: Types.ObjectId | string,
  ): Promise<ItemResponseSummary[]> {
    const normalizedId = this.normalizeObjectId(scaleInstanceId);

    if (!normalizedId) {
      return [];
    }

    const itemResponses = await this.itemResponseModel
      .find({ scaleInstanceId: normalizedId })
      .sort({ itemOrder: 1 })
      .exec();

    return itemResponses.map((itemResponse) =>
      this.toItemResponseSummary(itemResponse),
    );
  }

  async listItemResponsesByScaleInstanceIds(
    patientId: Types.ObjectId | string,
    assessmentVisitId: Types.ObjectId | string,
    scaleInstanceIds: readonly string[],
  ): Promise<ItemResponseSummary[]> {
    const normalizedPatientId = this.normalizeObjectId(patientId);
    const normalizedVisitId = this.normalizeObjectId(assessmentVisitId);
    const normalizedScaleIds = this.normalizeObjectIds(scaleInstanceIds);
    if (!normalizedPatientId || !normalizedVisitId || !normalizedScaleIds) {
      return [];
    }
    const responses = await this.itemResponseModel
      .find({
        patientId: normalizedPatientId,
        assessmentVisitId: normalizedVisitId,
        scaleInstanceId: { $in: normalizedScaleIds },
      })
      .sort({ scaleInstanceId: 1, itemOrder: 1, _id: 1 })
      .exec();
    return responses.map((response) => this.toItemResponseSummary(response));
  }

  async listItemResponsesByIds(
    patientId: Types.ObjectId | string,
    assessmentVisitId: Types.ObjectId | string,
    scaleInstanceIds: readonly string[],
    itemResponseIds: readonly string[],
  ): Promise<ItemResponseSummary[]> {
    const normalizedPatientId = this.normalizeObjectId(patientId);
    const normalizedVisitId = this.normalizeObjectId(assessmentVisitId);
    const normalizedScaleIds = this.normalizeObjectIds(scaleInstanceIds);
    const normalizedItemIds = this.normalizeObjectIds(itemResponseIds);
    if (
      !normalizedPatientId ||
      !normalizedVisitId ||
      !normalizedScaleIds ||
      !normalizedItemIds
    ) {
      return [];
    }
    const responses = await this.itemResponseModel
      .find({
        _id: { $in: normalizedItemIds },
        patientId: normalizedPatientId,
        assessmentVisitId: normalizedVisitId,
        scaleInstanceId: { $in: normalizedScaleIds },
      })
      .sort({ _id: 1 })
      .exec();
    return responses.map((response) => this.toItemResponseSummary(response));
  }

  async freezeItemResponsesByIds(
    patientId: Types.ObjectId | string,
    assessmentVisitId: Types.ObjectId | string,
    scaleInstanceIds: readonly string[],
    itemResponseIds: readonly string[],
    sourceLockedAt: Date,
  ): Promise<AssessmentSourceFreezeBatchResult> {
    const normalizedPatientId = this.normalizeObjectId(patientId);
    const normalizedVisitId = this.normalizeObjectId(assessmentVisitId);
    const normalizedScaleIds = this.normalizeObjectIds(scaleInstanceIds);
    const normalizedItemIds = this.normalizeObjectIds(itemResponseIds);
    if (
      !normalizedPatientId ||
      !normalizedVisitId ||
      !normalizedScaleIds ||
      !normalizedItemIds ||
      !Number.isFinite(sourceLockedAt.getTime())
    ) {
      return this.emptyAssessmentFreezeResult(itemResponseIds.length);
    }
    const before = await this.itemResponseModel
      .find({
        _id: { $in: normalizedItemIds },
        patientId: normalizedPatientId,
        assessmentVisitId: normalizedVisitId,
        scaleInstanceId: { $in: normalizedScaleIds },
      })
      .exec();
    const previouslyFrozenCount = before.filter(
      (item) => item.status === 'locked' && item.lockedAt instanceof Date,
    ).length;
    const updateResult = await this.itemResponseModel
      .updateMany(
        {
          _id: { $in: normalizedItemIds },
          patientId: normalizedPatientId,
          assessmentVisitId: normalizedVisitId,
          scaleInstanceId: { $in: normalizedScaleIds },
          status: { $in: ['answered', 'scored'] },
          lockedAt: null,
          voidedAt: null,
        },
        { $set: { status: 'locked', lockedAt: sourceLockedAt } },
        { runValidators: true },
      )
      .exec();
    const after = await this.itemResponseModel
      .find({
        _id: { $in: normalizedItemIds },
        patientId: normalizedPatientId,
        assessmentVisitId: normalizedVisitId,
        scaleInstanceId: { $in: normalizedScaleIds },
      })
      .sort({ _id: 1 })
      .exec();
    const items = after.map((item) => ({
      id: item._id.toString(),
      patientId: item.patientId.toString(),
      assessmentVisitId: item.assessmentVisitId.toString(),
      scaleInstanceId: item.scaleInstanceId.toString(),
      status: item.status,
      lockedAt: item.lockedAt ?? null,
    }));
    const validCount = items.filter(
      (item) => item.status === 'locked' && item.lockedAt !== null,
    ).length;
    return {
      requestedCount: normalizedItemIds.length,
      matchedCount: items.length,
      newlyFrozenCount: updateResult.modifiedCount,
      previouslyFrozenCount,
      invalidCount: normalizedItemIds.length - validCount,
      items,
    };
  }

  async listScoredItemResponsesByScaleInstanceId(
    scaleInstanceId: Types.ObjectId | string,
  ): Promise<ItemResponseSummary[]> {
    const normalizedId = this.normalizeObjectId(scaleInstanceId);

    if (!normalizedId) {
      return [];
    }

    const itemResponses = await this.itemResponseModel
      .find({
        scaleInstanceId: normalizedId,
        $or: [
          { status: 'scored' },
          {
            'score.scoreStatus': {
              $exists: true,
              $ne: 'not_scored',
            },
          },
        ],
      })
      .sort({ itemOrder: 1 })
      .exec();

    return itemResponses.map((itemResponse) =>
      this.toItemResponseSummary(itemResponse),
    );
  }

  async listItemResponsesByVisitId(
    assessmentVisitId: Types.ObjectId | string,
  ): Promise<ItemResponseSummary[]> {
    const normalizedId = this.normalizeObjectId(assessmentVisitId);

    if (!normalizedId) {
      return [];
    }

    const itemResponses = await this.itemResponseModel
      .find({ assessmentVisitId: normalizedId })
      .sort({ scaleInstanceId: 1, itemOrder: 1 })
      .exec();

    return itemResponses.map((itemResponse) =>
      this.toItemResponseSummary(itemResponse),
    );
  }

  async countItemResponseProgress(
    scaleInstanceId: Types.ObjectId | string,
  ): Promise<ScaleInstanceProgressResponse> {
    const normalizedId = this.normalizeObjectId(scaleInstanceId);

    if (!normalizedId) {
      return { totalItemCount: 0, answeredItemCount: 0 };
    }

    const [totalItemCount, answeredItemCount] = await Promise.all([
      this.itemResponseModel
        .countDocuments({ scaleInstanceId: normalizedId })
        .exec(),
      this.itemResponseModel
        .countDocuments({
          scaleInstanceId: normalizedId,
          status: { $in: ['answered', 'scored'] },
        })
        .exec(),
    ]);

    return { totalItemCount, answeredItemCount };
  }

  private normalizeObjectId(
    id: Types.ObjectId | string,
  ): Types.ObjectId | null {
    if (id instanceof Types.ObjectId) {
      return id;
    }

    const normalizedId = id.trim();

    if (!normalizedId || !Types.ObjectId.isValid(normalizedId)) {
      return null;
    }

    const objectId = new Types.ObjectId(normalizedId);

    if (objectId.toString() !== normalizedId.toLowerCase()) {
      return null;
    }

    return objectId;
  }

  private normalizeObjectIds(ids: readonly string[]): Types.ObjectId[] | null {
    const result: Types.ObjectId[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const normalized = this.normalizeObjectId(id);
      if (!normalized || seen.has(normalized.toString())) {
        return null;
      }
      seen.add(normalized.toString());
      result.push(normalized);
    }
    return result;
  }

  private emptyAssessmentFreezeResult(
    requestedCount: number,
  ): AssessmentSourceFreezeBatchResult {
    return {
      requestedCount,
      matchedCount: 0,
      newlyFrozenCount: 0,
      previouslyFrozenCount: 0,
      invalidCount: requestedCount,
      items: [],
    };
  }

  private normalizeItemResponseOwnership(
    patientId: Types.ObjectId | string,
    assessmentVisitId: Types.ObjectId | string,
    scaleInstanceId: Types.ObjectId | string,
    itemResponseId: Types.ObjectId | string,
  ): ItemResponseOwnershipFilter | null {
    const normalizedPatientId = this.normalizeObjectId(patientId);
    const normalizedVisitId = this.normalizeObjectId(assessmentVisitId);
    const normalizedScaleInstanceId = this.normalizeObjectId(scaleInstanceId);
    const normalizedItemResponseId = this.normalizeObjectId(itemResponseId);

    if (
      !normalizedPatientId ||
      !normalizedVisitId ||
      !normalizedScaleInstanceId ||
      !normalizedItemResponseId
    ) {
      return null;
    }

    return {
      _id: normalizedItemResponseId,
      assessmentVisitId: normalizedVisitId,
      scaleInstanceId: normalizedScaleInstanceId,
      patientId: normalizedPatientId,
    };
  }

  private requireObjectId(
    id: Types.ObjectId | string,
    fieldName: string,
  ): Types.ObjectId {
    const objectId = this.normalizeObjectId(id);

    if (!objectId) {
      throw new BadRequestException(`${fieldName} must be a valid ObjectId`);
    }

    return objectId;
  }

  private async requirePatient(patientId: Types.ObjectId) {
    const patient = await this.patientsService.findPatientById(patientId);

    if (!patient) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
      });
    }

    return patient;
  }

  private assertValidDateRange(dateFrom?: Date, dateTo?: Date): void {
    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'dateFrom must not be later than dateTo',
      });
    }
  }

  private throwVisitCodeConflict(): never {
    throw new ConflictException({
      code: 'VISIT_CODE_CONFLICT',
      message: 'Assessment visit code already exists',
    });
  }

  private toPublicScaleInstanceProgress(
    progress: ScaleInstanceProgress,
  ): ScaleInstanceProgressResponse {
    return {
      totalItemCount: this.readNonNegativeInteger(progress, 'totalItemCount'),
      answeredItemCount: this.readNonNegativeInteger(
        progress,
        'answeredItemCount',
      ),
    };
  }

  private readNonNegativeInteger(value: unknown, propertyName: string): number {
    if (!isRecord(value)) {
      return 0;
    }

    const propertyValue = value[propertyName];

    return typeof propertyValue === 'number' &&
      Number.isFinite(propertyValue) &&
      Number.isInteger(propertyValue) &&
      propertyValue >= 0
      ? propertyValue
      : 0;
  }

  private readAuditDate(value: unknown): Date | null {
    if (value instanceof Date && Number.isFinite(value.getTime())) {
      return new Date(value.getTime());
    }

    return null;
  }

  private readAuditObjectId(value: unknown): string | null {
    if (value instanceof Types.ObjectId) {
      return value.toString();
    }

    return typeof value === 'string' && Types.ObjectId.isValid(value)
      ? new Types.ObjectId(value).toString()
      : null;
  }

  private readAssessmentOperatorRole(
    value: unknown,
  ): AssessmentOperatorRole | undefined {
    return typeof value === 'string' &&
      ['doctor', 'nurse', 'research_assistant', 'admin', 'unknown'].includes(
        value,
      )
      ? (value as AssessmentOperatorRole)
      : undefined;
  }

  private mapVisit(visit: AssessmentVisitDocument): AssessmentVisitSummary {
    return {
      id: visit._id.toString(),
      patientId: visit.patientId.toString(),
      subjectCode: visit.subjectCode,
      visitCode: visit.visitCode,
      visitType: visit.visitType,
      status: visit.status,
      assessmentDate: visit.assessmentDate,
      startedAt: visit.startedAt ?? null,
      completedAt: visit.completedAt ?? null,
      lockedAt: visit.lockedAt ?? null,
      voidedAt: visit.voidedAt ?? null,
      operatorSnapshot: this.mapOperatorSnapshot(visit.operatorSnapshot),
      clinicalContext: visit.clinicalContext ?? null,
      notes: visit.notes,
      metadata: visit.metadata ?? null,
    };
  }

  private mapScaleInstance(
    scaleInstance: ScaleInstanceDocument,
  ): ScaleInstanceSummary {
    return {
      id: scaleInstance._id.toString(),
      assessmentVisitId: scaleInstance.assessmentVisitId.toString(),
      patientId: scaleInstance.patientId.toString(),
      subjectCode: scaleInstance.subjectCode,
      scaleDefinitionId: scaleInstance.scaleDefinitionId.toString(),
      scaleVersionId: scaleInstance.scaleVersionId.toString(),
      scaleCode: scaleInstance.scaleCode,
      scaleVersion: scaleInstance.scaleVersion,
      instanceCode: scaleInstance.instanceCode,
      instanceNo: scaleInstance.instanceNo,
      status: scaleInstance.status,
      administrationMode: scaleInstance.administrationMode,
      versionTrace: this.mapVersionTrace(scaleInstance.versionTrace),
      startedAt: scaleInstance.startedAt ?? null,
      completedAt: scaleInstance.completedAt ?? null,
      lockedAt: scaleInstance.lockedAt ?? null,
      voidedAt: scaleInstance.voidedAt ?? null,
      durationMs: scaleInstance.durationMs ?? null,
      operatorSnapshot: this.mapOperatorSnapshot(
        scaleInstance.operatorSnapshot,
      ),
      progress: scaleInstance.progress ?? null,
      qualityControlSummary: scaleInstance.qualityControlSummary ?? null,
      notes: scaleInstance.notes,
      metadata: scaleInstance.metadata ?? null,
    };
  }

  toItemResponseSummary(
    itemResponse: ItemResponseDocument,
  ): ItemResponseSummary {
    return {
      id: itemResponse._id.toString(),
      assessmentVisitId: itemResponse.assessmentVisitId.toString(),
      scaleInstanceId: itemResponse.scaleInstanceId.toString(),
      patientId: itemResponse.patientId.toString(),
      subjectCode: itemResponse.subjectCode,
      scaleDefinitionId: itemResponse.scaleDefinitionId.toString(),
      scaleVersionId: itemResponse.scaleVersionId.toString(),
      scaleCode: itemResponse.scaleCode,
      scaleVersion: itemResponse.scaleVersion,
      instanceCode: itemResponse.instanceCode,
      itemCode: itemResponse.itemCode,
      crfCode: itemResponse.crfCode,
      groupCode: itemResponse.groupCode,
      itemTitle: itemResponse.itemTitle,
      itemOrder: itemResponse.itemOrder,
      responseType: itemResponse.responseType,
      countsTowardTotal: itemResponse.countsTowardTotal,
      cognitiveDomainCodes: [...(itemResponse.cognitiveDomainCodes ?? [])],
      itemConfigSnapshot: itemResponse.itemConfigSnapshot ?? null,
      versionTrace: this.mapItemResponseVersionTrace(itemResponse.versionTrace),
      status: itemResponse.status,
      answerSource: itemResponse.answerSource,
      rawResponse: itemResponse.rawResponse ?? null,
      structuredResponse: itemResponse.structuredResponse ?? null,
      responseText: itemResponse.responseText,
      responseSummary: itemResponse.responseSummary,
      isMissing: itemResponse.isMissing,
      missingReason: itemResponse.missingReason,
      score: this.mapItemScore(itemResponse.score),
      stepResults: (itemResponse.stepResults ?? []).map((stepResult) =>
        this.mapItemStepResult(stepResult),
      ),
      promptResponses: (itemResponse.promptResponses ?? []).map(
        (promptResponse) => this.mapPromptResponse(promptResponse),
      ),
      timing: this.mapItemTiming(itemResponse.timing),
      evidenceRefs: (itemResponse.evidenceRefs ?? []).map((evidenceRef) =>
        this.mapItemEvidenceRef(evidenceRef),
      ),
      operatorNote: itemResponse.operatorNote,
      qualityControlHints: itemResponse.qualityControlHints ?? null,
      metadata: itemResponse.metadata ?? null,
      lockedAt: itemResponse.lockedAt ?? null,
      voidedAt: itemResponse.voidedAt ?? null,
    };
  }

  private mapOperatorSnapshot(
    operatorSnapshot?: AssessmentOperatorSnapshot | null,
  ): AssessmentOperatorSnapshotSummary | null {
    if (!operatorSnapshot) {
      return null;
    }

    return {
      operatorId: operatorSnapshot.operatorId?.toString() ?? null,
      operatorName: operatorSnapshot.operatorName,
      operatorRole: operatorSnapshot.operatorRole,
    };
  }

  private mapVersionTrace(
    versionTrace?: ScaleVersionTrace | null,
  ): ScaleVersionTraceSummary | null {
    if (!versionTrace) {
      return null;
    }

    return {
      crfVersion: versionTrace.crfVersion,
      scoringRuleVersion: versionTrace.scoringRuleVersion,
      fieldEncodingVersion: versionTrace.fieldEncodingVersion,
      sourceDocument: versionTrace.sourceDocument,
    };
  }

  private mapItemResponseVersionTrace(
    versionTrace?: ItemResponseVersionTrace | null,
  ): ItemResponseVersionTraceSummary | null {
    if (!versionTrace) {
      return null;
    }

    return {
      scaleVersion: versionTrace.scaleVersion,
      crfVersion: versionTrace.crfVersion,
      scoringRuleVersion: versionTrace.scoringRuleVersion,
      fieldEncodingVersion: versionTrace.fieldEncodingVersion,
      sourceDocument: versionTrace.sourceDocument,
    };
  }

  private mapItemScore(
    score?: ItemScoreSnapshot | null,
  ): ItemScoreSummary | null {
    if (!score) {
      return null;
    }

    return {
      scoreValue: score.scoreValue ?? null,
      maxScore: score.maxScore ?? null,
      minScore: score.minScore ?? null,
      scoreStatus: score.scoreStatus,
      scoreSource: score.scoreSource,
      scoredAt: score.scoredAt ?? null,
      scoredBy: score.scoredBy?.toString() ?? null,
      scoringNote: score.scoringNote,
    };
  }

  private mapItemStepResult(stepResult: ItemStepResult): ItemStepResultSummary {
    return {
      stepCode: stepResult.stepCode,
      crfCode: stepResult.crfCode,
      label: stepResult.label,
      order: stepResult.order,
      expectedValue: stepResult.expectedValue ?? null,
      actualValue: stepResult.actualValue ?? null,
      isCorrect: stepResult.isCorrect ?? null,
      scoreValue: stepResult.scoreValue ?? null,
      countsTowardItemScore: stepResult.countsTowardItemScore,
      note: stepResult.note,
    };
  }

  private mapPromptResponse(
    promptResponse: PromptResponseRecord,
  ): PromptResponseRecordSummary {
    return {
      promptType: promptResponse.promptType,
      promptText: promptResponse.promptText,
      responseAfterPrompt: promptResponse.responseAfterPrompt ?? null,
      isCorrect: promptResponse.isCorrect ?? null,
      countsTowardScore: promptResponse.countsTowardScore,
      order: promptResponse.order,
      note: promptResponse.note,
    };
  }

  private mapItemTiming(
    timing?: ItemTimingSnapshot | null,
  ): ItemResponseTimingSummary | null {
    if (!timing) {
      return null;
    }

    return {
      startedAt: timing.startedAt ?? null,
      completedAt: timing.completedAt ?? null,
      durationMs: timing.durationMs ?? null,
      timerSource: timing.timerSource,
    };
  }

  private mapItemEvidenceRef(
    evidenceRef: ItemEvidenceRef,
  ): ItemEvidenceRefSummary {
    return {
      evidenceType: evidenceRef.evidenceType,
      mediaEvidenceId: evidenceRef.mediaEvidenceId?.toString() ?? null,
      status: evidenceRef.status,
      note: evidenceRef.note,
    };
  }
}
