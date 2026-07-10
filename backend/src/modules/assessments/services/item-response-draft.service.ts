import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PatientsService } from '../../patients/services/patients.service';
import type {
  UpdateItemResponseDraftDto,
  UpdateItemTimingDraftDto,
  UpdateItemStepDraftDto,
  UpdatePromptResponseDraftDto,
} from '../dto/update-item-response-draft.dto';
import {
  ItemResponseDraftJsonValidationError,
  validateAndCloneDraftJsonValue,
  validateAndCloneStructuredDraft,
} from '../lib/item-response-draft-json';
import {
  ITEM_TIMER_SOURCES,
  ItemResponse,
  type ItemResponseDocument,
} from '../schemas/item-response.schema';
import type { UpdateItemResponseDraftResponse } from '../types/item-response-execution-response.types';
import {
  AssessmentsService,
  type ItemResponseSummary,
  type ItemResponseTimingSummary,
  type ItemStepResultSummary,
  type PromptResponseRecordSummary,
} from './assessments.service';
import { toItemResponseExecutionResponse } from './item-response-execution.mapper';

const EDITABLE_VISIT_STATUSES = new Set(['draft', 'in_progress']);
const EDITABLE_SCALE_INSTANCE_STATUSES = new Set(['draft', 'in_progress']);
const EDITABLE_ITEM_RESPONSE_STATUSES = new Set([
  'not_started',
  'in_progress',
  'answered',
]);

type DraftUpdateDocument = {
  $set?: Record<string, unknown>;
  $unset?: Record<string, 1>;
};

function hasOwn(value: object, propertyName: string): boolean {
  return Object.getOwnPropertyDescriptor(value, propertyName) !== undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

@Injectable()
export class ItemResponseDraftService {
  constructor(
    @InjectModel(ItemResponse.name)
    private readonly itemResponseModel: Model<ItemResponseDocument>,
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
  ) {}

  async saveDraft(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
    itemResponseId: string,
    input: UpdateItemResponseDraftDto,
  ): Promise<UpdateItemResponseDraftResponse> {
    const patient = await this.patientsService.findPatientById(patientId);

    if (!patient) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
      });
    }

    if (patient.status !== 'active') {
      throw new ConflictException({
        code: 'PATIENT_NOT_ACTIVE',
        message: 'Patient is not active',
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

    if (!EDITABLE_VISIT_STATUSES.has(visit.status)) {
      throw new ConflictException({
        code: 'VISIT_NOT_EDITABLE',
        message: 'Assessment visit is not editable',
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

    if (!EDITABLE_SCALE_INSTANCE_STATUSES.has(scaleInstance.status)) {
      throw new ConflictException({
        code: 'SCALE_INSTANCE_NOT_EDITABLE',
        message: 'Scale instance is not editable',
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
        code: 'ITEM_RESPONSE_NOT_FOUND',
        message: 'Item response not found',
      });
    }

    if (!EDITABLE_ITEM_RESPONSE_STATUSES.has(itemResponse.status)) {
      throw new ConflictException({
        code: 'ITEM_RESPONSE_NOT_EDITABLE',
        message: 'Item response is not editable',
      });
    }

    this.assertNonEmptyPatch(input);

    const update = this.buildUpdate(itemResponse, input);

    if (!update.$set && !update.$unset) {
      return {
        itemResponse: toItemResponseExecutionResponse(itemResponse),
        progress:
          await this.assessmentsService.countItemResponseProgress(
            scaleInstanceId,
          ),
      };
    }

    let updatedItemResponse: ItemResponseDocument | null;

    try {
      updatedItemResponse = await this.itemResponseModel
        .findOneAndUpdate(
          {
            _id: itemResponseId,
            assessmentVisitId: visitId,
            scaleInstanceId,
            patientId,
            status: itemResponse.status,
          },
          update,
          { returnDocument: 'after', runValidators: true },
        )
        .exec();
    } catch {
      throw new InternalServerErrorException({
        code: 'ITEM_RESPONSE_SAVE_FAILED',
        message: 'Item response draft could not be saved',
      });
    }

    if (!updatedItemResponse) {
      throw new InternalServerErrorException({
        code: 'ITEM_RESPONSE_SAVE_FAILED',
        message: 'Item response draft could not be saved',
      });
    }

    const summary =
      this.assessmentsService.toItemResponseSummary(updatedItemResponse);

    return {
      itemResponse: toItemResponseExecutionResponse(summary),
      progress:
        await this.assessmentsService.countItemResponseProgress(
          scaleInstanceId,
        ),
    };
  }

  private buildUpdate(
    itemResponse: ItemResponseSummary,
    input: UpdateItemResponseDraftDto,
  ): DraftUpdateDocument {
    const setFields: Record<string, unknown> = {};
    const unsetFields: Record<string, 1> = {};
    let rawResponse = itemResponse.rawResponse;
    let structuredResponse = itemResponse.structuredResponse;
    let responseText = itemResponse.responseText;
    let isMissing = itemResponse.isMissing;
    let missingReason = itemResponse.missingReason;
    let stepResults = itemResponse.stepResults.map((stepResult) => ({
      ...stepResult,
    }));
    let promptResponses = itemResponse.promptResponses.map(
      (promptResponse) => ({ ...promptResponse }),
    );
    let hasDraftMutation = false;
    let submittedMeaningfulAnswer = false;

    if (this.isProvided(input, 'rawResponse')) {
      rawResponse = this.cloneDraftJson(input.rawResponse);
      setFields.rawResponse = rawResponse;
      hasDraftMutation = true;
      submittedMeaningfulAnswer ||= rawResponse !== null;
    }

    if (this.isProvided(input, 'structuredResponse')) {
      structuredResponse = this.cloneStructuredDraft(input.structuredResponse);
      setFields.structuredResponse = structuredResponse;
      hasDraftMutation = true;
      submittedMeaningfulAnswer ||=
        structuredResponse !== null &&
        Object.keys(structuredResponse).length > 0;
    }

    if (this.isProvided(input, 'responseText')) {
      responseText = input.responseText ?? undefined;
      this.setOptionalString(
        'responseText',
        responseText,
        setFields,
        unsetFields,
      );
      hasDraftMutation = true;
      submittedMeaningfulAnswer ||= Boolean(responseText?.trim());
    }

    if (input.stepResponses && input.stepResponses.length > 0) {
      const stepUpdate = this.applyStepUpdates(
        stepResults,
        input.stepResponses,
      );
      stepResults = stepUpdate.stepResults;
      setFields.stepResults = stepResults;
      hasDraftMutation = true;
      submittedMeaningfulAnswer ||= stepUpdate.submittedMeaningfulAnswer;
    }

    if (input.promptResponses && input.promptResponses.length > 0) {
      const promptUpdate = this.applyPromptUpdates(
        promptResponses,
        input.promptResponses,
      );
      promptResponses = promptUpdate.promptResponses;
      setFields.promptResponses = promptResponses;
      hasDraftMutation = true;
      submittedMeaningfulAnswer ||= promptUpdate.submittedMeaningfulAnswer;
    }

    if (this.isProvided(input, 'isMissing')) {
      hasDraftMutation = true;

      if (input.isMissing === true) {
        const normalizedReason = input.missingReason?.trim();

        if (!normalizedReason || !this.isProvided(input, 'missingReason')) {
          throw new BadRequestException({
            code: 'ITEM_RESPONSE_MISSING_REASON_REQUIRED',
            message: 'A missing reason is required',
          });
        }

        isMissing = true;
        missingReason = normalizedReason;
        rawResponse = null;
        structuredResponse = null;
        responseText = undefined;
        stepResults = stepResults.map((stepResult) => ({
          ...stepResult,
          actualValue: null,
        }));
        promptResponses = promptResponses.map((promptResponse) => ({
          ...promptResponse,
          responseAfterPrompt: null,
        }));
        setFields.isMissing = true;
        setFields.missingReason = missingReason;
        setFields.rawResponse = null;
        setFields.structuredResponse = null;
        setFields.stepResults = stepResults;
        setFields.promptResponses = promptResponses;
        delete setFields.responseText;
        unsetFields.responseText = 1;
      } else {
        isMissing = false;
        missingReason = undefined;
        setFields.isMissing = false;
        unsetFields.missingReason = 1;
      }
    } else if (isMissing && submittedMeaningfulAnswer) {
      isMissing = false;
      missingReason = undefined;
      setFields.isMissing = false;
      unsetFields.missingReason = 1;
    } else if (this.isProvided(input, 'missingReason')) {
      if (isMissing) {
        const normalizedReason = input.missingReason?.trim();

        if (!normalizedReason) {
          throw new BadRequestException({
            code: 'ITEM_RESPONSE_MISSING_REASON_REQUIRED',
            message: 'A missing reason is required',
          });
        }

        missingReason = normalizedReason;
        setFields.missingReason = missingReason;
        hasDraftMutation = true;
      } else {
        unsetFields.missingReason = 1;
      }
    }

    if (this.isProvided(input, 'timing')) {
      this.assertTimingAllowed(itemResponse);
      const timing = this.applyTimingUpdate(itemResponse.timing, input.timing);
      setFields.timing = timing;
      hasDraftMutation = true;
    }

    if (this.isProvided(input, 'operatorNote')) {
      this.setOptionalString(
        'operatorNote',
        input.operatorNote ?? undefined,
        setFields,
        unsetFields,
      );
      hasDraftMutation = true;
    }

    if (!isMissing) {
      missingReason = undefined;
      unsetFields.missingReason = 1;
    }

    if (input.markAsAnswered === true) {
      if (
        !this.hasMeaningfulAnswer({
          rawResponse,
          structuredResponse,
          responseText,
          isMissing,
          stepResults,
          promptResponses,
        })
      ) {
        throw new ConflictException({
          code: 'ITEM_RESPONSE_CANNOT_MARK_ANSWERED',
          message: 'Item response has no answer to mark as answered',
        });
      }

      setFields.status = 'answered';
    } else if (itemResponse.status === 'not_started' && hasDraftMutation) {
      setFields.status = 'in_progress';
    }

    return {
      ...(Object.keys(setFields).length > 0 ? { $set: setFields } : {}),
      ...(Object.keys(unsetFields).length > 0 ? { $unset: unsetFields } : {}),
    };
  }

  private applyStepUpdates(
    currentStepResults: ItemStepResultSummary[],
    updates: UpdateItemStepDraftDto[],
  ): {
    stepResults: ItemStepResultSummary[];
    submittedMeaningfulAnswer: boolean;
  } {
    const updateByCode = new Map<string, UpdateItemStepDraftDto>();
    let submittedMeaningfulAnswer = false;

    for (const update of updates) {
      const stepCode = update.stepCode.trim().toLowerCase();

      if (updateByCode.has(stepCode)) {
        throw new BadRequestException({
          code: 'ITEM_RESPONSE_DUPLICATE_STEP',
          message: 'A step response was submitted more than once',
        });
      }

      if (!currentStepResults.some((step) => step.stepCode === stepCode)) {
        throw new BadRequestException({
          code: 'ITEM_RESPONSE_STEP_NOT_FOUND',
          message: 'Item response step was not found',
        });
      }

      updateByCode.set(stepCode, update);
    }

    const stepResults = currentStepResults.map((stepResult) => {
      const update = updateByCode.get(stepResult.stepCode);

      if (!update) {
        return stepResult;
      }

      const nextStep = { ...stepResult };

      if (this.isProvided(update, 'actualValue')) {
        nextStep.actualValue = this.cloneDraftJson(update.actualValue);
        submittedMeaningfulAnswer ||= nextStep.actualValue !== null;
      }

      if (this.isProvided(update, 'note')) {
        if (update.note === null) {
          delete nextStep.note;
        } else {
          nextStep.note = update.note?.trim();
        }
      }

      return nextStep;
    });

    return { stepResults, submittedMeaningfulAnswer };
  }

  private applyPromptUpdates(
    currentPromptResponses: PromptResponseRecordSummary[],
    updates: UpdatePromptResponseDraftDto[],
  ): {
    promptResponses: PromptResponseRecordSummary[];
    submittedMeaningfulAnswer: boolean;
  } {
    const updateByKey = new Map<string, UpdatePromptResponseDraftDto>();
    let submittedMeaningfulAnswer = false;

    for (const update of updates) {
      const key = this.toPromptKey(update.promptType, update.order);

      if (updateByKey.has(key)) {
        throw new BadRequestException({
          code: 'ITEM_RESPONSE_DUPLICATE_PROMPT',
          message: 'A prompt response was submitted more than once',
        });
      }

      if (
        !currentPromptResponses.some(
          (promptResponse) =>
            this.toPromptKey(
              promptResponse.promptType,
              promptResponse.order,
            ) === key,
        )
      ) {
        throw new BadRequestException({
          code: 'ITEM_RESPONSE_PROMPT_NOT_FOUND',
          message: 'Item response prompt was not found',
        });
      }

      updateByKey.set(key, update);
    }

    const promptResponses = currentPromptResponses.map((promptResponse) => {
      const key = this.toPromptKey(
        promptResponse.promptType,
        promptResponse.order,
      );
      const update = updateByKey.get(key);

      if (!update) {
        return promptResponse;
      }

      const nextPrompt = { ...promptResponse };

      if (this.isProvided(update, 'responseAfterPrompt')) {
        nextPrompt.responseAfterPrompt = this.cloneDraftJson(
          update.responseAfterPrompt,
        );
        submittedMeaningfulAnswer ||= nextPrompt.responseAfterPrompt !== null;
      }

      if (this.isProvided(update, 'note')) {
        if (update.note === null) {
          delete nextPrompt.note;
        } else {
          nextPrompt.note = update.note?.trim();
        }
      }

      return nextPrompt;
    });

    return { promptResponses, submittedMeaningfulAnswer };
  }

  private applyTimingUpdate(
    currentTiming: ItemResponseTimingSummary | null,
    update: UpdateItemTimingDraftDto | null | undefined,
  ): ItemResponseTimingSummary | null {
    if (update === null) {
      return null;
    }

    const timing: ItemResponseTimingSummary = {
      startedAt: currentTiming?.startedAt ?? null,
      completedAt: currentTiming?.completedAt ?? null,
      durationMs: currentTiming?.durationMs ?? null,
      timerSource: currentTiming?.timerSource ?? 'none',
    };

    if (update && this.isProvided(update, 'startedAt')) {
      timing.startedAt = this.parseTimingDate(update.startedAt);
    }

    if (update && this.isProvided(update, 'completedAt')) {
      timing.completedAt = this.parseTimingDate(update.completedAt);
    }

    if (update && this.isProvided(update, 'durationMs')) {
      const durationMs = update.durationMs ?? null;

      if (
        durationMs !== null &&
        (!Number.isFinite(durationMs) ||
          !Number.isInteger(durationMs) ||
          durationMs < 0)
      ) {
        this.throwInvalidTiming();
      }

      timing.durationMs = durationMs;
    }

    if (update && this.isProvided(update, 'timerSource')) {
      if (
        !update.timerSource ||
        !(ITEM_TIMER_SOURCES as readonly string[]).includes(update.timerSource)
      ) {
        this.throwInvalidTiming();
      }

      timing.timerSource = update.timerSource;
    }

    if (
      timing.startedAt &&
      timing.completedAt &&
      timing.completedAt.getTime() < timing.startedAt.getTime()
    ) {
      this.throwInvalidTiming();
    }

    return timing;
  }

  private assertTimingAllowed(itemResponse: ItemResponseSummary): void {
    const config = isPlainRecord(itemResponse.itemConfigSnapshot)
      ? itemResponse.itemConfigSnapshot
      : {};
    const evidenceTypes = config.evidenceTypes;
    const allowsTiming =
      config.requiresTimer === true ||
      (Array.isArray(evidenceTypes) && evidenceTypes.includes('duration'));

    if (!allowsTiming) {
      throw new BadRequestException({
        code: 'ITEM_RESPONSE_TIMING_NOT_ALLOWED',
        message: 'Timing is not enabled for this item response',
      });
    }
  }

  private parseTimingDate(value: string | null | undefined): Date | null {
    if (value === null) {
      return null;
    }

    if (typeof value !== 'string' || !value.trim()) {
      this.throwInvalidTiming();
    }

    const parsed = new Date(value);

    if (!Number.isFinite(parsed.getTime())) {
      this.throwInvalidTiming();
    }

    return parsed;
  }

  private hasMeaningfulAnswer(input: {
    rawResponse: unknown;
    structuredResponse: Record<string, unknown> | null;
    responseText?: string;
    isMissing: boolean;
    stepResults: ItemStepResultSummary[];
    promptResponses: PromptResponseRecordSummary[];
  }): boolean {
    return (
      input.isMissing ||
      input.rawResponse !== null ||
      (isPlainRecord(input.structuredResponse) &&
        Object.keys(input.structuredResponse).length > 0) ||
      Boolean(input.responseText?.trim()) ||
      input.stepResults.some((stepResult) => stepResult.actualValue !== null) ||
      input.promptResponses.some(
        (promptResponse) => promptResponse.responseAfterPrompt !== null,
      )
    );
  }

  private assertNonEmptyPatch(input: UpdateItemResponseDraftDto): void {
    const allowedFields = [
      'rawResponse',
      'structuredResponse',
      'responseText',
      'isMissing',
      'missingReason',
      'stepResponses',
      'promptResponses',
      'timing',
      'operatorNote',
      'markAsAnswered',
    ];

    if (!allowedFields.some((field) => this.isProvided(input, field))) {
      throw new BadRequestException({
        code: 'ITEM_RESPONSE_EMPTY_PATCH',
        message: 'At least one item response draft field is required',
      });
    }
  }

  private cloneDraftJson(value: unknown) {
    try {
      return validateAndCloneDraftJsonValue(value);
    } catch (error: unknown) {
      if (error instanceof ItemResponseDraftJsonValidationError) {
        throw new BadRequestException({
          code: 'ITEM_RESPONSE_PAYLOAD_INVALID',
          message: 'Item response draft payload is invalid',
        });
      }

      throw error;
    }
  }

  private cloneStructuredDraft(value: unknown) {
    try {
      return validateAndCloneStructuredDraft(value);
    } catch (error: unknown) {
      if (error instanceof ItemResponseDraftJsonValidationError) {
        throw new BadRequestException({
          code: 'ITEM_RESPONSE_PAYLOAD_INVALID',
          message: 'Item response draft payload is invalid',
        });
      }

      throw error;
    }
  }

  private setOptionalString(
    propertyName: string,
    value: string | undefined,
    setFields: Record<string, unknown>,
    unsetFields: Record<string, 1>,
  ): void {
    if (value === undefined) {
      unsetFields[propertyName] = 1;
      return;
    }

    setFields[propertyName] = value.trim();
  }

  private isProvided(value: object, propertyName: string): boolean {
    if (!hasOwn(value, propertyName)) {
      return false;
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, propertyName);
    return Boolean(
      descriptor && 'value' in descriptor && descriptor.value !== undefined,
    );
  }

  private toPromptKey(promptType: string, order: number): string {
    return `${promptType}:${order}`;
  }

  private throwInvalidTiming(): never {
    throw new BadRequestException({
      code: 'ITEM_RESPONSE_INVALID_TIMING',
      message: 'Item response timing is invalid',
    });
  }
}
