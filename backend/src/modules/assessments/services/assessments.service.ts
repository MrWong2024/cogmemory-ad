// backend/src/modules/assessments/services/assessments.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

@Injectable()
export class AssessmentsService {
  constructor(
    @InjectModel(AssessmentVisit.name)
    private readonly assessmentVisitModel: Model<AssessmentVisitDocument>,
    @InjectModel(ScaleInstance.name)
    private readonly scaleInstanceModel: Model<ScaleInstanceDocument>,
    @InjectModel(ItemResponse.name)
    private readonly itemResponseModel: Model<ItemResponseDocument>,
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
      .sort({ instanceNo: 1, scaleCode: 1 })
      .exec();

    return scaleInstances.map((scaleInstance) =>
      this.mapScaleInstance(scaleInstance),
    );
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

    return this.mapItemResponse(itemResponse);
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
      this.mapItemResponse(itemResponse),
    );
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
      this.mapItemResponse(itemResponse),
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
      this.mapItemResponse(itemResponse),
    );
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

  private mapItemResponse(
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
