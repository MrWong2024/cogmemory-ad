import { ConflictException, Injectable } from '@nestjs/common';
import type { ItemResponseSummary } from '../../assessments/services/assessments.service';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import { parseStructuredManualFields } from '../../assessments/lib/structured-manual-response';
import type {
  PatientAdministrationReviewCaptureFact,
  PatientAdministrationReviewEvidenceRefFact,
  PatientAdministrationReviewFacts,
} from '../../assessments/services/patient-administration-session.service';
import { PatientAdministrationSessionService } from '../../assessments/services/patient-administration-session.service';
import type {
  PatientAdministrationStepConfigSummary,
  ScaleItemConfigSummary,
} from '../../scales/services/scales.service';
import { ScalesService } from '../../scales/services/scales.service';
import type { ScaleInstanceExecutionParamDto } from '../../assessments/dto/scale-instance-execution-param.dto';
import { toMediaEvidenceTranscriptionResponse } from './media-evidence-public.mapper';
import {
  MediaEvidenceService,
  type MediaEvidenceSummary,
} from './media-evidence.service';
import type {
  PatientAdministrationReviewCaptureResponse,
  PatientAdministrationReviewEvidenceResponse,
  PatientAdministrationReviewItemResponse,
  PatientAdministrationReviewResponse,
  PatientAdministrationReviewRunResponse,
} from '../types/patient-administration-review-response.types';
import { resolvePatientAdministrationReviewStructuredFieldCodes } from '../lib/patient-administration-review-structured-bindings';

type StepFacts = {
  captures: PatientAdministrationReviewCaptureFact[];
  evidenceRefs: PatientAdministrationReviewEvidenceRefFact[];
};

@Injectable()
export class PatientAdministrationReviewService {
  constructor(
    private readonly patientAdministrationSessionService: PatientAdministrationSessionService,
    private readonly assessmentsService: AssessmentsService,
    private readonly scalesService: ScalesService,
    private readonly mediaEvidenceService: MediaEvidenceService,
  ) {}

  async getReview(
    params: ScaleInstanceExecutionParamDto,
  ): Promise<PatientAdministrationReviewResponse> {
    const facts =
      await this.patientAdministrationSessionService.getLatestReviewFacts(
        params.patientId,
        params.visitId,
        params.scaleInstanceId,
      );
    const scaleVersion =
      await this.scalesService.findVersionByScaleCodeAndVersion(
        facts.scaleCode,
        facts.scaleVersion,
      );
    if (
      !scaleVersion ||
      scaleVersion.id !== facts.scaleVersionId ||
      scaleVersion.scaleDefinitionId !== facts.scaleDefinitionId
    ) {
      this.throwStepInvalid();
    }
    const steps = this.validateSteps(scaleVersion.patientAdministrationSteps);
    const itemResponses =
      await this.assessmentsService.listItemResponsesByScaleInstanceId(
        params.scaleInstanceId,
      );
    const evidenceIds = facts.stepEvidenceRefs.map(
      (reference) => reference.mediaEvidenceId,
    );
    const evidences = evidenceIds.length
      ? await this.mediaEvidenceService.listMediaEvidenceByIds(
          params.patientId,
          params.visitId,
          [params.scaleInstanceId],
          evidenceIds,
        )
      : [];
    const evidenceById = new Map(
      evidences.map((evidence) => [evidence.id, evidence]),
    );
    if (evidenceById.size !== evidenceIds.length) {
      this.throwStepInvalid();
    }

    const responseByItemCode = new Map(
      itemResponses.map((response) => [response.itemCode, response]),
    );
    const expectedItemCodes = new Set(steps.map((step) => step.itemCode));
    if (
      responseByItemCode.size !== itemResponses.length ||
      responseByItemCode.size !== expectedItemCodes.size ||
      itemResponses.some(
        (response) =>
          !expectedItemCodes.has(response.itemCode) ||
          response.patientId !== params.patientId ||
          response.assessmentVisitId !== params.visitId ||
          response.scaleInstanceId !== params.scaleInstanceId ||
          response.scaleDefinitionId !== facts.scaleDefinitionId ||
          response.scaleVersionId !== facts.scaleVersionId ||
          response.scaleCode !== facts.scaleCode ||
          response.scaleVersion !== facts.scaleVersion,
      )
    ) {
      this.throwStepInvalid();
    }
    const stepByKey = new Map(steps.map((step) => [step.stepKey, step]));
    this.validateSessionFacts(
      facts,
      stepByKey,
      responseByItemCode,
      evidenceById,
    );

    const orderedItemCodes = [...new Set(steps.map((step) => step.itemCode))];
    const items = orderedItemCodes.map((itemCode) => {
      const itemResponse = responseByItemCode.get(itemCode);
      if (!itemResponse) {
        return this.throwStepInvalid();
      }
      const itemSteps = steps.filter((step) => step.itemCode === itemCode);
      const itemConfig = scaleVersion.items.find(
        (item) => item.code === itemCode,
      );
      const structuredFieldCodesByStep = this.resolveStructuredFieldCodesByStep(
        facts.scaleCode,
        facts.scaleVersion,
        itemConfig,
        itemSteps,
      );
      return this.buildItem(
        itemResponse,
        itemSteps,
        facts,
        evidenceById,
        itemConfig?.title,
        structuredFieldCodesByStep,
      );
    });

    return {
      session: {
        status: facts.status,
        preparationConfirmedAt: facts.preparationConfirmedAt,
        impactFactorCodes: [...facts.impactFactorCodes],
        impactFactorNote: facts.impactFactorNote,
        startedAt: facts.startedAt,
        completedAt: facts.completedAt,
        terminatedAt: facts.terminatedAt,
        expiredAt: facts.expiredAt,
      },
      reviewEvents: facts.reviewEvents.map((event) => ({ ...event })),
      items,
    };
  }

  private validateSteps(
    steps: PatientAdministrationStepConfigSummary[] | undefined,
  ): PatientAdministrationStepConfigSummary[] {
    if (!steps?.length) {
      this.throwStepInvalid();
    }
    const keys = new Set<string>();
    const orders = new Set<number>();
    for (const step of steps) {
      if (
        !step.stepKey.trim() ||
        !step.itemCode.trim() ||
        !Number.isSafeInteger(step.order) ||
        step.order < 1 ||
        keys.has(step.stepKey) ||
        orders.has(step.order)
      ) {
        this.throwStepInvalid();
      }
      keys.add(step.stepKey);
      orders.add(step.order);
    }
    const ordered = [...steps].sort((left, right) => left.order - right.order);
    if (ordered.some((step, index) => step.order !== index + 1)) {
      this.throwStepInvalid();
    }
    return ordered;
  }

  private validateSessionFacts(
    facts: PatientAdministrationReviewFacts,
    stepByKey: Map<string, PatientAdministrationStepConfigSummary>,
    responseByItemCode: Map<string, ItemResponseSummary>,
    evidenceById: Map<string, MediaEvidenceSummary>,
  ): void {
    const captureKeys = new Set<string>();
    for (const capture of facts.stepCaptures) {
      const step = stepByKey.get(capture.stepKey);
      const key = `${capture.stepKey}:${capture.stepRun}`;
      if (
        !step ||
        !Number.isSafeInteger(capture.stepRun) ||
        capture.stepRun < 1 ||
        captureKeys.has(key)
      ) {
        this.throwStepInvalid();
      }
      captureKeys.add(key);
    }
    for (const reference of facts.stepEvidenceRefs) {
      const step = stepByKey.get(reference.stepKey);
      const evidence = evidenceById.get(reference.mediaEvidenceId);
      const itemResponse = step
        ? responseByItemCode.get(step.itemCode)
        : undefined;
      if (
        !step ||
        !itemResponse ||
        !evidence ||
        evidence.patientId !== itemResponse.patientId ||
        evidence.assessmentVisitId !== itemResponse.assessmentVisitId ||
        evidence.scaleInstanceId !== facts.scaleInstanceId ||
        evidence.itemResponseId !== itemResponse.id ||
        evidence.patientAdministrationContext?.sessionId !== facts.sessionId ||
        evidence.patientAdministrationContext.stepKey !== reference.stepKey ||
        evidence.patientAdministrationContext.stepRun !== reference.stepRun ||
        evidence.evidenceType !== reference.evidenceType
      ) {
        this.throwStepInvalid();
      }
    }
  }

  private buildItem(
    itemResponse: ItemResponseSummary,
    steps: PatientAdministrationStepConfigSummary[],
    facts: PatientAdministrationReviewFacts,
    evidenceById: Map<string, MediaEvidenceSummary>,
    configuredTitle: string | undefined,
    structuredFieldCodesByStep: ReadonlyMap<string, readonly string[]>,
  ): PatientAdministrationReviewItemResponse {
    return {
      itemResponseId: itemResponse.id,
      itemCode: itemResponse.itemCode,
      itemTitle: itemResponse.itemTitle ?? configuredTitle ?? '',
      status: itemResponse.status,
      draftRevision: this.normalizeDraftRevision(itemResponse.draftRevision),
      steps: steps.map((step) => ({
        stepKey: step.stepKey,
        order: step.order,
        responseMode: step.responseMode,
        advanceBy: step.advanceBy,
        structuredFieldCodes: [
          ...(structuredFieldCodesByStep.get(step.stepKey) ?? []),
        ],
        runs: this.buildRuns(step, facts, evidenceById),
      })),
    };
  }

  private resolveStructuredFieldCodesByStep(
    scaleCode: string,
    scaleVersion: string,
    itemConfig: ScaleItemConfigSummary | undefined,
    steps: PatientAdministrationStepConfigSummary[],
  ): ReadonlyMap<string, readonly string[]> {
    const empty = new Map(
      steps.map((step) => [step.stepKey, [] as readonly string[]]),
    );
    const bindings = steps.map((step) => ({
      stepKey: step.stepKey,
      fieldCodes: resolvePatientAdministrationReviewStructuredFieldCodes(
        scaleCode,
        scaleVersion,
        step.stepKey,
      ),
    }));

    if (bindings.every((binding) => binding.fieldCodes === null)) {
      return empty;
    }

    const fields = parseStructuredManualFields(itemConfig?.scoringRule);
    if (!fields) {
      return empty;
    }

    const configuredCodes = new Set(fields.map((field) => field.code));
    const mappedCodes = new Set<string>();
    for (const binding of bindings) {
      if (binding.fieldCodes === null) {
        continue;
      }
      for (const fieldCode of binding.fieldCodes) {
        if (!configuredCodes.has(fieldCode) || mappedCodes.has(fieldCode)) {
          return empty;
        }
        mappedCodes.add(fieldCode);
      }
    }

    if (mappedCodes.size !== configuredCodes.size) {
      return empty;
    }

    return new Map(
      bindings.map((binding) => [
        binding.stepKey,
        binding.fieldCodes ?? ([] as readonly string[]),
      ]),
    );
  }

  private buildRuns(
    step: PatientAdministrationStepConfigSummary,
    facts: PatientAdministrationReviewFacts,
    evidenceById: Map<string, MediaEvidenceSummary>,
  ): PatientAdministrationReviewRunResponse[] {
    const stepFacts: StepFacts = {
      captures: facts.stepCaptures.filter(
        (capture) => capture.stepKey === step.stepKey,
      ),
      evidenceRefs: facts.stepEvidenceRefs.filter(
        (reference) => reference.stepKey === step.stepKey,
      ),
    };
    const runs = new Set([
      ...stepFacts.captures.map((capture) => capture.stepRun),
      ...stepFacts.evidenceRefs.map((reference) => reference.stepRun),
    ]);
    return [...runs]
      .sort((left, right) => left - right)
      .map((stepRun) => ({
        stepRun,
        capture: this.mapCapture(
          stepFacts.captures.find((capture) => capture.stepRun === stepRun),
        ),
        evidence: stepFacts.evidenceRefs
          .filter((reference) => reference.stepRun === stepRun)
          .sort(
            (left, right) =>
              left.uploadedAt.getTime() - right.uploadedAt.getTime() ||
              left.mediaEvidenceId.localeCompare(right.mediaEvidenceId),
          )
          .map((reference) =>
            this.mapEvidence(
              reference,
              evidenceById.get(reference.mediaEvidenceId)!,
            ),
          ),
      }));
  }

  private mapCapture(
    capture: PatientAdministrationReviewCaptureFact | undefined,
  ): PatientAdministrationReviewCaptureResponse | null {
    if (!capture) {
      return null;
    }
    return {
      capturedBy: capture.capturedBy,
      staffObservation: capture.staffObservation,
      capturedAt: capture.capturedAt,
      invalidatedAt: capture.invalidatedAt,
      invalidatedReason: capture.invalidatedReason,
      operatorSnapshot: capture.operatorSnapshot,
    };
  }

  private mapEvidence(
    reference: PatientAdministrationReviewEvidenceRefFact,
    evidence: MediaEvidenceSummary,
  ): PatientAdministrationReviewEvidenceResponse {
    return {
      mediaEvidenceId: evidence.id,
      evidenceType: reference.evidenceType,
      captureMode: evidence.captureMode,
      status: evidence.status,
      storageStatus: evidence.storageStatus,
      uploadedAt: reference.uploadedAt,
      audioMetadata: evidence.audioMetadata
        ? {
            durationMs:
              typeof evidence.audioMetadata.durationMs === 'number' &&
              Number.isFinite(evidence.audioMetadata.durationMs)
                ? evidence.audioMetadata.durationMs
                : null,
          }
        : null,
      transcription: toMediaEvidenceTranscriptionResponse(evidence),
    };
  }

  private normalizeDraftRevision(value: unknown): number {
    return Number.isSafeInteger(value) && (value as number) >= 0
      ? (value as number)
      : 0;
  }

  private throwStepInvalid(): never {
    throw new ConflictException({
      code: 'PATIENT_ADMINISTRATION_STEP_INVALID',
      message: 'Patient administration review facts are inconsistent',
    });
  }
}
