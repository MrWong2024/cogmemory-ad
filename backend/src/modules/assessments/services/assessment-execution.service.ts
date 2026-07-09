// backend/src/modules/assessments/services/assessment-execution.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ASSESSMENT_OPERATOR_ROLES,
  type AssessmentOperatorRole,
} from '../schemas/assessment-visit.schema';
import {
  ItemResponse,
  type ItemEvidenceType,
  type ItemResponseDocument,
} from '../schemas/item-response.schema';
import {
  SCALE_ADMINISTRATION_MODES,
  ScaleInstance,
  type ScaleAdministrationMode,
  type ScaleInstanceDocument,
} from '../schemas/scale-instance.schema';
import { ScaleSeedDataService } from '../../scales/seeds/scale-seed-data.service';
import type {
  ScaleSeedData,
  ScaleSeedItem,
  ScaleSeedRuleConfig,
  ScaleSeedScoreRange,
  ScaleSeedVersion,
} from '../../scales/seeds/scale-seed.types';
import type {
  AssessmentExecutionOperatorSnapshotDraft,
  AssessmentExecutionOperatorSnapshotInput,
  AssessmentExecutionVersionTrace,
  BuildScaleExecutionPlanInput,
  CreatedItemEvidenceRefSummary,
  CreatedItemResponseSummary,
  CreatedItemScoreSummary,
  CreatedScaleInstanceSummary,
  ItemEvidenceRefDraft,
  ItemResponseDraft,
  ItemScoreDraft,
  ItemStepResultDraft,
  PromptResponseDraft,
  ScaleExecutionCreationResult,
  ScaleExecutionPlan,
  ScaleExecutionSeedSummary,
  ScaleInstanceDraft,
} from '../types/assessment-execution.types';

type CreatedScaleInstanceDocumentLike = Omit<
  ScaleInstanceDraft,
  | 'assessmentVisitId'
  | 'patientId'
  | 'scaleDefinitionId'
  | 'scaleVersionId'
  | 'operatorSnapshot'
  | 'versionTrace'
  | 'startedAt'
  | 'completedAt'
  | 'lockedAt'
  | 'voidedAt'
  | 'durationMs'
  | 'progress'
  | 'qualityControlSummary'
  | 'metadata'
> & {
  _id: Types.ObjectId;
  assessmentVisitId: Types.ObjectId;
  patientId: Types.ObjectId;
  scaleDefinitionId: Types.ObjectId;
  scaleVersionId: Types.ObjectId;
  operatorSnapshot?: AssessmentExecutionOperatorSnapshotDraft | null;
  versionTrace?: Omit<AssessmentExecutionVersionTrace, 'scaleVersion'> | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  lockedAt?: Date | null;
  voidedAt?: Date | null;
  durationMs?: number | null;
  progress?: Record<string, unknown> | null;
  qualityControlSummary?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

type CreatedItemScoreDocumentLike = Partial<
  Omit<ItemScoreDraft, 'scoredBy'>
> & {
  scoredBy?: Types.ObjectId | null;
};

type CreatedItemStepResultDocumentLike = Partial<ItemStepResultDraft> & {
  stepCode: string;
  order: number;
};

type CreatedPromptResponseDocumentLike = Partial<PromptResponseDraft> & {
  promptType: PromptResponseDraft['promptType'];
  order: number;
};

type CreatedItemTimingDocumentLike = Partial<
  NonNullable<ItemResponseDraft['timing']>
>;

type CreatedItemEvidenceRefDocumentLike = Partial<ItemEvidenceRefDraft> & {
  evidenceType: ItemEvidenceType;
};

type CreatedItemResponseDocumentLike = Omit<
  ItemResponseDraft,
  | 'assessmentVisitId'
  | 'scaleInstanceId'
  | 'patientId'
  | 'scaleDefinitionId'
  | 'scaleVersionId'
  | 'score'
  | 'rawResponse'
  | 'structuredResponse'
  | 'itemConfigSnapshot'
  | 'versionTrace'
  | 'stepResults'
  | 'promptResponses'
  | 'timing'
  | 'evidenceRefs'
  | 'qualityControlHints'
  | 'metadata'
  | 'lockedAt'
  | 'voidedAt'
> & {
  _id: Types.ObjectId;
  assessmentVisitId: Types.ObjectId;
  scaleInstanceId: Types.ObjectId;
  patientId: Types.ObjectId;
  scaleDefinitionId: Types.ObjectId;
  scaleVersionId: Types.ObjectId;
  score?: CreatedItemScoreDocumentLike | null;
  rawResponse?: unknown;
  structuredResponse?: Record<string, unknown> | null;
  itemConfigSnapshot?: Record<string, unknown> | null;
  versionTrace?: AssessmentExecutionVersionTrace | null;
  stepResults?: CreatedItemStepResultDocumentLike[];
  promptResponses?: CreatedPromptResponseDocumentLike[];
  timing?: CreatedItemTimingDocumentLike | null;
  evidenceRefs?: CreatedItemEvidenceRefDocumentLike[];
  qualityControlHints?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  lockedAt?: Date | null;
  voidedAt?: Date | null;
};

@Injectable()
export class AssessmentExecutionService {
  constructor(
    @InjectModel(ScaleInstance.name)
    private readonly scaleInstanceModel: Model<ScaleInstanceDocument>,
    @InjectModel(ItemResponse.name)
    private readonly itemResponseModel: Model<ItemResponseDocument>,
    private readonly scaleSeedDataService: ScaleSeedDataService,
  ) {}

  normalizeSubjectCode(subjectCode: string): string {
    return subjectCode.trim().toUpperCase();
  }

  normalizeInstanceCode(instanceCode: string): string {
    return instanceCode.trim().toUpperCase();
  }

  normalizeScaleCode(scaleCode: string): string {
    return scaleCode.trim().toLowerCase();
  }

  buildScaleExecutionPlan(
    input: BuildScaleExecutionPlanInput,
  ): ScaleExecutionPlan {
    const normalizedScaleCode = this.normalizeScaleCode(input.scaleCode);
    const scaleVersion = input.scaleVersion.trim();
    const subjectCode = this.normalizeSubjectCode(input.subjectCode);
    const instanceCode = this.normalizeInstanceCode(input.instanceCode);

    if (!normalizedScaleCode) {
      throw new BadRequestException('scaleCode must not be empty');
    }

    if (!scaleVersion) {
      throw new BadRequestException('scaleVersion must not be empty');
    }

    if (!subjectCode) {
      throw new BadRequestException('subjectCode must not be empty');
    }

    if (!instanceCode) {
      throw new BadRequestException('instanceCode must not be empty');
    }

    const versionSeed = this.scaleSeedDataService.getScaleVersionSeed(
      normalizedScaleCode,
      scaleVersion,
    );

    if (!versionSeed) {
      throw new NotFoundException(
        `scale seed version not found: ${normalizedScaleCode}@${scaleVersion}`,
      );
    }

    const seedData = this.getSeedDataForValidation(
      normalizedScaleCode,
      versionSeed,
    );
    const validation = this.scaleSeedDataService.validateScaleSeeds([seedData]);

    if (!validation.valid) {
      throw new BadRequestException(
        `scale seed validation failed: ${validation.errors.join('; ')}`,
      );
    }

    this.assertUniquePlanItemCodes(versionSeed.items);

    const administrationMode = this.normalizeAdministrationMode(
      input.administrationMode,
    );
    const context = {
      assessmentVisitId: this.normalizeRequiredObjectId(
        input.assessmentVisitId,
        'assessmentVisitId',
      ),
      patientId: this.normalizeRequiredObjectId(input.patientId, 'patientId'),
      scaleDefinitionId: this.normalizeRequiredObjectId(
        input.scaleDefinitionId,
        'scaleDefinitionId',
      ),
      scaleVersionId: this.normalizeRequiredObjectId(
        input.scaleVersionId,
        'scaleVersionId',
      ),
      subjectCode,
      scaleCode: normalizedScaleCode,
      scaleVersion,
      instanceCode,
      instanceNo: this.normalizeInstanceNo(input.instanceNo),
      administrationMode,
      operatorSnapshot: this.buildOperatorSnapshot(input.operatorSnapshot),
      startedAt: input.startedAt ?? null,
      metadata: input.metadata ?? null,
    };

    const seedSummary = this.buildSeedSummary(versionSeed);
    const scaleInstanceDraft = this.buildScaleInstanceDraft(
      context,
      versionSeed,
      seedSummary,
    );
    const itemResponseDrafts = versionSeed.items.map((item) =>
      this.buildItemResponseDraft(context, versionSeed, item),
    );

    return {
      scaleInstanceDraft,
      itemResponseDrafts,
      seedSummary,
      validation,
    };
  }

  async createScaleExecutionFromPlan(
    plan: ScaleExecutionPlan,
  ): Promise<ScaleExecutionCreationResult> {
    if (!plan.validation.valid) {
      throw new BadRequestException('scale execution plan validation failed');
    }

    this.assertUniquePlanDraftItemCodes(plan.itemResponseDrafts);

    /*
     * This internal foundation intentionally does not open a Mongo session.
     * A future public workflow that needs atomic ScaleInstance + ItemResponse
     * creation should add a transaction or a compensating cleanup strategy.
     * This stage also does not implement concurrency handling or idempotency.
     */
    const scaleInstance = await this.scaleInstanceModel.create(
      plan.scaleInstanceDraft,
    );
    const scaleInstanceId = scaleInstance._id;
    const itemResponseDrafts = plan.itemResponseDrafts.map((draft) => ({
      ...draft,
      scaleInstanceId,
    }));
    const itemResponses = await this.itemResponseModel.insertMany(
      itemResponseDrafts,
      { ordered: true },
    );

    return {
      scaleInstance: this.mapCreatedScaleInstance(scaleInstance),
      itemResponses: itemResponses.map((itemResponse) =>
        this.mapCreatedItemResponse(itemResponse),
      ),
      createdItemResponseCount: itemResponses.length,
      scaleCode: plan.seedSummary.scaleCode,
      scaleVersion: plan.seedSummary.scaleVersion,
      instanceCode: plan.scaleInstanceDraft.instanceCode,
    };
  }

  async createScaleExecutionFromSeed(
    input: BuildScaleExecutionPlanInput,
  ): Promise<ScaleExecutionCreationResult> {
    const plan = this.buildScaleExecutionPlan(input);
    return this.createScaleExecutionFromPlan(plan);
  }

  private getSeedDataForValidation(
    scaleCode: string,
    versionSeed: ScaleSeedVersion,
  ): ScaleSeedData {
    const seedData = this.scaleSeedDataService.getScaleSeedByCode(scaleCode);

    if (!seedData) {
      throw new NotFoundException(`scale seed not found: ${scaleCode}`);
    }

    return {
      definition: seedData.definition,
      version: versionSeed,
    };
  }

  private buildScaleInstanceDraft(
    context: {
      assessmentVisitId: Types.ObjectId;
      patientId: Types.ObjectId;
      scaleDefinitionId: Types.ObjectId;
      scaleVersionId: Types.ObjectId;
      subjectCode: string;
      scaleCode: string;
      scaleVersion: string;
      instanceCode: string;
      instanceNo: number;
      administrationMode: ScaleAdministrationMode;
      operatorSnapshot: AssessmentExecutionOperatorSnapshotDraft | null;
      startedAt: Date | null;
      metadata: Record<string, unknown> | null;
    },
    versionSeed: ScaleSeedVersion,
    seedSummary: ScaleExecutionSeedSummary,
  ): ScaleInstanceDraft {
    return {
      assessmentVisitId: context.assessmentVisitId,
      patientId: context.patientId,
      subjectCode: context.subjectCode,
      scaleDefinitionId: context.scaleDefinitionId,
      scaleVersionId: context.scaleVersionId,
      scaleCode: context.scaleCode,
      scaleVersion: context.scaleVersion,
      instanceCode: context.instanceCode,
      instanceNo: context.instanceNo,
      status: 'draft',
      administrationMode: context.administrationMode,
      versionTrace: {
        crfVersion: versionSeed.crfVersion,
        scoringRuleVersion: versionSeed.scoringRuleVersion,
        fieldEncodingVersion: versionSeed.fieldEncodingVersion,
        sourceDocument: versionSeed.sourceDocument,
      },
      startedAt: context.startedAt,
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
      durationMs: null,
      operatorSnapshot: context.operatorSnapshot,
      progress: {
        totalItemCount: versionSeed.items.length,
        answeredItemCount: 0,
        source: 'scale_seed',
      },
      qualityControlSummary: null,
      metadata: {
        ...(context.metadata ?? {}),
        initializedFromSeed: true,
        seedSummary,
      },
    };
  }

  private buildItemResponseDraft(
    context: {
      assessmentVisitId: Types.ObjectId;
      patientId: Types.ObjectId;
      scaleDefinitionId: Types.ObjectId;
      scaleVersionId: Types.ObjectId;
      subjectCode: string;
      scaleCode: string;
      scaleVersion: string;
      instanceCode: string;
      administrationMode: ScaleAdministrationMode;
    },
    versionSeed: ScaleSeedVersion,
    item: ScaleSeedItem,
  ): ItemResponseDraft {
    const itemCode = this.normalizeScaleItemCode(item.code);
    const evidenceRefs = this.buildEvidenceRefs(item);

    return {
      assessmentVisitId: context.assessmentVisitId,
      scaleInstanceId: null,
      patientId: context.patientId,
      subjectCode: context.subjectCode,
      scaleDefinitionId: context.scaleDefinitionId,
      scaleVersionId: context.scaleVersionId,
      scaleCode: context.scaleCode,
      scaleVersion: context.scaleVersion,
      instanceCode: context.instanceCode,
      itemCode,
      crfCode: item.crfCode,
      groupCode: item.groupCode,
      itemTitle: item.title,
      itemOrder: item.order,
      responseType: item.responseType,
      countsTowardTotal: item.countsTowardTotal,
      cognitiveDomainCodes: [...item.cognitiveDomainCodes],
      itemConfigSnapshot: this.buildItemConfigSnapshot(item),
      versionTrace: this.buildItemVersionTrace(versionSeed),
      status: 'not_started',
      answerSource: this.buildAnswerSource(context.administrationMode),
      rawResponse: null,
      structuredResponse: null,
      isMissing: false,
      score: this.buildInitialScore(item.scoreRange),
      stepResults: this.buildStepResults(item),
      promptResponses: this.buildPromptResponses(item),
      timing: this.buildTiming(item, evidenceRefs),
      evidenceRefs,
      qualityControlHints: null,
      metadata: {
        initializedFromSeed: true,
        seedScaleCode: context.scaleCode,
        seedScaleVersion: context.scaleVersion,
        seedItemCode: item.code,
        seedItemOrder: item.order,
      },
      lockedAt: null,
      voidedAt: null,
    };
  }

  private buildItemConfigSnapshot(
    item: ScaleSeedItem,
  ): Record<string, unknown> {
    return {
      itemCode: item.code,
      crfCode: item.crfCode,
      groupCode: item.groupCode,
      itemTitle: item.title,
      itemOrder: item.order,
      responseType: item.responseType,
      prompt: item.prompt,
      instruction: item.instruction,
      scoreRange: this.cloneScoreRange(item.scoreRange),
      countsTowardTotal: item.countsTowardTotal,
      cognitiveDomainCodes: [...item.cognitiveDomainCodes],
      scoringRule: this.cloneRuleConfig(item.scoringRule),
      qualityControlRule: this.cloneRuleConfig(item.qualityControlRule),
      reportingRule: this.cloneRuleConfig(item.reportingRule),
      researchExportField: item.researchExportField,
      evidenceTypes: [...item.evidenceTypes],
      requiresTimer: item.requiresTimer,
      supportsPhotoUpload: item.supportsPhotoUpload,
      supportsHandwriting: item.supportsHandwriting,
      requiresOperatorNote: item.requiresOperatorNote,
    };
  }

  private buildItemVersionTrace(
    versionSeed: ScaleSeedVersion,
  ): AssessmentExecutionVersionTrace {
    return {
      scaleVersion: versionSeed.version,
      crfVersion: versionSeed.crfVersion,
      scoringRuleVersion: versionSeed.scoringRuleVersion,
      fieldEncodingVersion: versionSeed.fieldEncodingVersion,
      sourceDocument: versionSeed.sourceDocument,
    };
  }

  private buildInitialScore(scoreRange: ScaleSeedScoreRange): ItemScoreDraft {
    return {
      scoreValue: null,
      maxScore: scoreRange.max,
      minScore: scoreRange.min,
      scoreStatus: 'not_scored',
      scoreSource: 'none',
      scoredAt: null,
      scoredBy: null,
    };
  }

  private buildStepResults(item: ScaleSeedItem): ItemStepResultDraft[] {
    const steps = this.getRuleArray(item.scoringRule, 'steps');

    return steps.map((step, index) => {
      const stepRecord = this.ensureRecord(step);
      const stepCode =
        this.readOptionalString(stepRecord, 'code') ??
        `${item.code}.step_${index + 1}`;
      const expectedValue =
        this.readRecordValue(stepRecord, 'expected') ??
        this.readRecordValue(stepRecord, 'expectedValue');

      return {
        stepCode: this.normalizeScaleItemCode(stepCode),
        crfCode: this.readOptionalString(stepRecord, 'crfCode'),
        label:
          this.readOptionalString(stepRecord, 'label') ??
          this.readOptionalString(stepRecord, 'title'),
        order: index + 1,
        expectedValue: expectedValue ?? null,
        actualValue: null,
        isCorrect: null,
        scoreValue: null,
        countsTowardItemScore:
          this.readOptionalBoolean(stepRecord, 'countsTowardItemScore') ?? true,
      };
    });
  }

  private buildPromptResponses(item: ScaleSeedItem): PromptResponseDraft[] {
    const promptRecords = this.getRuleArray(item.scoringRule, 'promptRecords');
    const promptResponses: PromptResponseDraft[] = [];

    promptRecords.forEach((promptRecord) => {
      const record = this.ensureRecord(promptRecord);
      const word =
        this.readOptionalString(record, 'word') ??
        this.readOptionalString(record, 'code') ??
        'prompt';

      if (this.readOptionalString(record, 'categoryCueRecordField')) {
        promptResponses.push({
          promptType: 'semantic_category',
          promptText: `Category cue: ${word}`,
          responseAfterPrompt: null,
          isCorrect: null,
          countsTowardScore: false,
          order: promptResponses.length + 1,
          note: 'Initialized from seed prompt record.',
        });
      }

      if (this.readOptionalString(record, 'multipleChoiceCueRecordField')) {
        promptResponses.push({
          promptType: 'multiple_choice',
          promptText: `Multiple choice cue: ${word}`,
          responseAfterPrompt: null,
          isCorrect: null,
          countsTowardScore: false,
          order: promptResponses.length + 1,
          note: 'Initialized from seed prompt record.',
        });
      }
    });

    return promptResponses;
  }

  private buildTiming(
    item: ScaleSeedItem,
    evidenceRefs: ItemEvidenceRefDraft[],
  ) {
    const requiresDurationEvidence = evidenceRefs.some(
      (evidenceRef) => evidenceRef.evidenceType === 'duration',
    );

    if (!item.requiresTimer && !requiresDurationEvidence) {
      return null;
    }

    return {
      startedAt: null,
      completedAt: null,
      durationMs: null,
      timerSource: 'none' as const,
    };
  }

  private buildEvidenceRefs(item: ScaleSeedItem): ItemEvidenceRefDraft[] {
    const evidenceTypes = new Set<ItemEvidenceType>();

    item.evidenceTypes.forEach((evidenceType) => {
      evidenceTypes.add(evidenceType);
    });

    if (item.requiresTimer) {
      evidenceTypes.add('duration');
    }

    if (item.supportsPhotoUpload) {
      evidenceTypes.add('photo');
    }

    if (item.supportsHandwriting) {
      evidenceTypes.add('handwriting');
    }

    if (item.requiresOperatorNote) {
      evidenceTypes.add('operator_note');
    }

    return [...evidenceTypes].map((evidenceType) => ({
      evidenceType,
      mediaEvidenceId: null,
      status: 'pending',
      note: 'Initialized from scale seed.',
    }));
  }

  private buildSeedSummary(
    versionSeed: ScaleSeedVersion,
  ): ScaleExecutionSeedSummary {
    return {
      scaleCode: this.normalizeScaleCode(versionSeed.scaleCode),
      scaleVersion: versionSeed.version,
      itemCount: versionSeed.items.length,
      groupCount: versionSeed.groups.length,
      sourceDocument: versionSeed.sourceDocument,
      scoringRuleVersion: versionSeed.scoringRuleVersion,
      fieldEncodingVersion: versionSeed.fieldEncodingVersion,
    };
  }

  private buildAnswerSource(administrationMode: ScaleAdministrationMode) {
    if (administrationMode === 'supervised_patient_input') {
      return 'supervised_patient_input';
    }

    if (administrationMode === 'paper_import') {
      return 'paper_import';
    }

    return 'clinician_recorded';
  }

  private normalizeAdministrationMode(
    administrationMode?: string,
  ): ScaleAdministrationMode {
    const normalizedMode =
      administrationMode?.trim() || 'clinician_administered';

    if (!this.isScaleAdministrationMode(normalizedMode)) {
      throw new BadRequestException(
        `unsupported administrationMode: ${normalizedMode}`,
      );
    }

    return normalizedMode;
  }

  private normalizeInstanceNo(instanceNo?: number): number {
    if (instanceNo === undefined) {
      return 1;
    }

    if (!Number.isInteger(instanceNo) || instanceNo < 1) {
      throw new BadRequestException('instanceNo must be a positive integer');
    }

    return instanceNo;
  }

  private normalizeRequiredObjectId(
    value: Types.ObjectId | string,
    fieldName: string,
  ): Types.ObjectId {
    if (value instanceof Types.ObjectId) {
      return value;
    }

    const normalizedValue = value.trim();

    if (!normalizedValue || !Types.ObjectId.isValid(normalizedValue)) {
      throw new BadRequestException(`${fieldName} must be a valid ObjectId`);
    }

    const objectId = new Types.ObjectId(normalizedValue);

    if (objectId.toString() !== normalizedValue.toLowerCase()) {
      throw new BadRequestException(`${fieldName} must be a valid ObjectId`);
    }

    return objectId;
  }

  private buildOperatorSnapshot(
    input?: AssessmentExecutionOperatorSnapshotInput | null,
  ): AssessmentExecutionOperatorSnapshotDraft | null {
    if (!input) {
      return null;
    }

    const operatorId = this.normalizeOptionalObjectId(
      input.operatorId,
      'operatorSnapshot.operatorId',
    );
    const operatorName = input.operatorName?.trim();
    const operatorRole = this.normalizeOperatorRole(input.operatorRole);

    if (!operatorId && !operatorName && !operatorRole) {
      return null;
    }

    return {
      operatorId,
      operatorName: operatorName || undefined,
      operatorRole,
    };
  }

  private normalizeOptionalObjectId(
    value: Types.ObjectId | string | null | undefined,
    fieldName: string,
  ): Types.ObjectId | null {
    if (value === undefined || value === null) {
      return null;
    }

    return this.normalizeRequiredObjectId(value, fieldName);
  }

  private normalizeOperatorRole(
    role?: string,
  ): AssessmentOperatorRole | undefined {
    const normalizedRole = role?.trim();

    if (!normalizedRole) {
      return undefined;
    }

    if (!this.isAssessmentOperatorRole(normalizedRole)) {
      throw new BadRequestException(
        `unsupported operatorSnapshot.operatorRole: ${normalizedRole}`,
      );
    }

    return normalizedRole;
  }

  private assertUniquePlanItemCodes(items: ScaleSeedItem[]) {
    const seenItemCodes = new Set<string>();

    items.forEach((item) => {
      const itemCode = this.normalizeScaleItemCode(item.code);

      if (!itemCode) {
        throw new BadRequestException('seed itemCode must not be empty');
      }

      if (seenItemCodes.has(itemCode)) {
        throw new BadRequestException(
          `duplicate itemCode in execution plan: ${itemCode}`,
        );
      }

      seenItemCodes.add(itemCode);
    });
  }

  private assertUniquePlanDraftItemCodes(itemDrafts: ItemResponseDraft[]) {
    const seenItemCodes = new Set<string>();

    itemDrafts.forEach((itemDraft) => {
      if (!itemDraft.itemCode) {
        throw new BadRequestException('plan itemCode must not be empty');
      }

      if (seenItemCodes.has(itemDraft.itemCode)) {
        throw new BadRequestException(
          `duplicate itemCode in execution plan: ${itemDraft.itemCode}`,
        );
      }

      seenItemCodes.add(itemDraft.itemCode);
    });
  }

  private normalizeScaleItemCode(itemCode: string): string {
    return itemCode.trim().toLowerCase();
  }

  private getRuleArray(
    rule: ScaleSeedRuleConfig,
    propertyName: string,
  ): unknown[] {
    if (!rule) {
      return [];
    }

    const value = rule[propertyName];
    return Array.isArray(value) ? value : [];
  }

  private ensureRecord(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private readRecordValue(
    record: Record<string, unknown>,
    propertyName: string,
  ): unknown {
    return record[propertyName];
  }

  private readOptionalString(
    record: Record<string, unknown>,
    propertyName: string,
  ): string | undefined {
    const value = record[propertyName];

    if (typeof value !== 'string') {
      return undefined;
    }

    const normalizedValue = value.trim();
    return normalizedValue || undefined;
  }

  private readOptionalBoolean(
    record: Record<string, unknown>,
    propertyName: string,
  ): boolean | undefined {
    const value = record[propertyName];
    return typeof value === 'boolean' ? value : undefined;
  }

  private cloneRuleConfig(
    rule: ScaleSeedRuleConfig,
  ): Record<string, unknown> | null {
    return rule ? structuredClone(rule) : null;
  }

  private cloneScoreRange(
    scoreRange: ScaleSeedScoreRange,
  ): Record<string, unknown> {
    return structuredClone(scoreRange);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isScaleAdministrationMode(
    value: string,
  ): value is ScaleAdministrationMode {
    return (SCALE_ADMINISTRATION_MODES as readonly string[]).includes(value);
  }

  private isAssessmentOperatorRole(
    value: string,
  ): value is AssessmentOperatorRole {
    return (ASSESSMENT_OPERATOR_ROLES as readonly string[]).includes(value);
  }

  private mapCreatedScaleInstance(
    scaleInstance: CreatedScaleInstanceDocumentLike,
  ): CreatedScaleInstanceSummary {
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
      versionTrace: scaleInstance.versionTrace ?? null,
      startedAt: scaleInstance.startedAt ?? null,
      completedAt: scaleInstance.completedAt ?? null,
      lockedAt: scaleInstance.lockedAt ?? null,
      voidedAt: scaleInstance.voidedAt ?? null,
      durationMs: scaleInstance.durationMs ?? null,
      operatorSnapshot: scaleInstance.operatorSnapshot
        ? {
            operatorId:
              scaleInstance.operatorSnapshot.operatorId?.toString() ?? null,
            operatorName: scaleInstance.operatorSnapshot.operatorName,
            operatorRole: scaleInstance.operatorSnapshot.operatorRole,
          }
        : null,
      progress: scaleInstance.progress ?? {},
      qualityControlSummary: scaleInstance.qualityControlSummary ?? null,
      metadata: scaleInstance.metadata ?? null,
    };
  }

  private mapCreatedItemResponse(
    itemResponse: CreatedItemResponseDocumentLike,
  ): CreatedItemResponseSummary {
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
      cognitiveDomainCodes: [...itemResponse.cognitiveDomainCodes],
      itemConfigSnapshot: itemResponse.itemConfigSnapshot ?? {},
      versionTrace: itemResponse.versionTrace ?? {
        scaleVersion: itemResponse.scaleVersion,
      },
      status: itemResponse.status,
      answerSource: itemResponse.answerSource,
      rawResponse: null,
      structuredResponse: null,
      isMissing: itemResponse.isMissing,
      score: this.mapCreatedItemScore(itemResponse.score),
      stepResults: (itemResponse.stepResults ?? []).map((stepResult) =>
        this.mapCreatedStepResult(stepResult),
      ),
      promptResponses: (itemResponse.promptResponses ?? []).map(
        (promptResponse) => this.mapCreatedPromptResponse(promptResponse),
      ),
      timing: this.mapCreatedTiming(itemResponse.timing),
      evidenceRefs: (itemResponse.evidenceRefs ?? []).map((evidenceRef) =>
        this.mapCreatedEvidenceRef(evidenceRef),
      ),
      qualityControlHints: itemResponse.qualityControlHints ?? null,
      metadata: itemResponse.metadata ?? null,
      lockedAt: itemResponse.lockedAt ?? null,
      voidedAt: itemResponse.voidedAt ?? null,
    };
  }

  private mapCreatedItemScore(
    score?: CreatedItemScoreDocumentLike | null,
  ): CreatedItemScoreSummary {
    return {
      scoreValue: score?.scoreValue ?? null,
      maxScore: score?.maxScore ?? null,
      minScore: score?.minScore ?? null,
      scoreStatus: score?.scoreStatus ?? 'not_scored',
      scoreSource: score?.scoreSource ?? 'none',
      scoredAt: score?.scoredAt ?? null,
      scoredBy: score?.scoredBy?.toString() ?? null,
    };
  }

  private mapCreatedStepResult(
    stepResult: CreatedItemStepResultDocumentLike,
  ): ItemStepResultDraft {
    return {
      stepCode: stepResult.stepCode,
      crfCode: stepResult.crfCode,
      label: stepResult.label,
      order: stepResult.order,
      expectedValue: stepResult.expectedValue ?? null,
      actualValue: stepResult.actualValue ?? null,
      isCorrect: stepResult.isCorrect ?? null,
      scoreValue: stepResult.scoreValue ?? null,
      countsTowardItemScore: stepResult.countsTowardItemScore ?? true,
    };
  }

  private mapCreatedPromptResponse(
    promptResponse: CreatedPromptResponseDocumentLike,
  ): PromptResponseDraft {
    return {
      promptType: promptResponse.promptType,
      promptText: promptResponse.promptText,
      responseAfterPrompt: promptResponse.responseAfterPrompt ?? null,
      isCorrect: promptResponse.isCorrect ?? null,
      countsTowardScore: promptResponse.countsTowardScore ?? false,
      order: promptResponse.order,
      note: promptResponse.note,
    };
  }

  private mapCreatedTiming(
    timing?: CreatedItemTimingDocumentLike | null,
  ): ItemResponseDraft['timing'] {
    if (!timing) {
      return null;
    }

    return {
      startedAt: timing.startedAt ?? null,
      completedAt: timing.completedAt ?? null,
      durationMs: timing.durationMs ?? null,
      timerSource: timing.timerSource ?? 'none',
    };
  }

  private mapCreatedEvidenceRef(
    evidenceRef: CreatedItemEvidenceRefDocumentLike,
  ): CreatedItemEvidenceRefSummary {
    return {
      evidenceType: evidenceRef.evidenceType,
      mediaEvidenceId: evidenceRef.mediaEvidenceId?.toString() ?? null,
      status: evidenceRef.status ?? 'pending',
      note: evidenceRef.note,
    };
  }
}
