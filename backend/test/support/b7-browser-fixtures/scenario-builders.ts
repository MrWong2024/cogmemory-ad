import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { AuthenticatedUserContext } from '../../../src/modules/auth/types/auth-user-context.type';
import type {
  AssessmentVisitDocument,
  AssessmentVisitType,
} from '../../../src/modules/assessments/schemas/assessment-visit.schema';
import type { ItemResponseDocument } from '../../../src/modules/assessments/schemas/item-response.schema';
import type { ScaleInstanceDocument } from '../../../src/modules/assessments/schemas/scale-instance.schema';
import type { AssessmentScaleWorkflowService } from '../../../src/modules/assessments/services/assessment-scale-workflow.service';
import type { ItemResponseDraftService } from '../../../src/modules/assessments/services/item-response-draft.service';
import type { ScaleInstanceSubmissionService } from '../../../src/modules/assessments/services/scale-instance-submission.service';
import type { MediaEvidenceDocument } from '../../../src/modules/media/schemas/media-evidence.schema';
import type { MediaEvidenceWorkflowService } from '../../../src/modules/media/services/media-evidence-workflow.service';
import type { UploadedMemoryFile } from '../../../src/modules/media/types/uploaded-memory-file.types';
import type { PatientDocument } from '../../../src/modules/patients/schemas/patient.schema';
import type { ScaleDefinitionDocument } from '../../../src/modules/scales/schemas/scale-definition.schema';
import type { ScaleVersionDocument } from '../../../src/modules/scales/schemas/scale-version.schema';
import type { ScaleCatalogService } from '../../../src/modules/scales/services/scale-catalog.service';
import type { ScoreResultDocument } from '../../../src/modules/scoring/schemas/score-result.schema';
import type { ProvisionalScoringWorkflowService } from '../../../src/modules/scoring/services/provisional-scoring-workflow.service';
import {
  B7_BUSINESS_SCENARIOS,
  B7FixtureError,
  scenarioSubjectCodeFor,
  scenarioVisitCodeFor,
  type B7BusinessScenarioKey,
  type B7ScaleCode,
  type B7ScenarioDefinition,
} from './fixture-contract';

export type B7FixtureModels = {
  patients: Model<PatientDocument>;
  visits: Model<AssessmentVisitDocument>;
  scaleInstances: Model<ScaleInstanceDocument>;
  itemResponses: Model<ItemResponseDocument>;
  mediaEvidence: Model<MediaEvidenceDocument>;
  scoreResults: Model<ScoreResultDocument>;
  scaleDefinitions: Model<ScaleDefinitionDocument>;
  scaleVersions: Model<ScaleVersionDocument>;
};

export type B7FixtureWorkflows = {
  scaleCatalog: ScaleCatalogService;
  scaleWorkflow: AssessmentScaleWorkflowService;
  itemDraft: ItemResponseDraftService;
  mediaWorkflow: MediaEvidenceWorkflowService;
  submission: ScaleInstanceSubmissionService;
  provisionalScoring: ProvisionalScoringWorkflowService;
};

export type B7ScenarioRoot = {
  scenarioKey: B7BusinessScenarioKey;
  ordinal: number;
  patientId: Types.ObjectId;
  visitId: Types.ObjectId;
  scaleInstanceId: Types.ObjectId;
  subjectCode: string;
  visitCode: string;
  scaleCode: B7ScaleCode;
};

const BASE_DATE = new Date('2026-07-22T08:00:00.000Z');
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function fixtureFailure(
  scenarioKey: B7BusinessScenarioKey,
  message: string,
): B7FixtureError {
  return new B7FixtureError(
    'B7_FIXTURE_SCENARIO_BUILD_FAILED',
    message,
    scenarioKey,
  );
}

function toMemoryFile(
  fieldname: string,
  buffer: Buffer,
  mimetype: string,
): UploadedMemoryFile {
  return {
    fieldname,
    originalname: 'b7-synthetic-image.png',
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
  };
}

export class B7ScenarioBuilder {
  constructor(
    private readonly namespace: string,
    private readonly models: B7FixtureModels,
    private readonly workflows: B7FixtureWorkflows,
  ) {}

  async buildAll(actor: AuthenticatedUserContext): Promise<void> {
    await this.ensureScalesAvailable();
    for (const definition of B7_BUSINESS_SCENARIOS) {
      const root = await this.createRoot(definition, actor);
      await this.configureScenario(root, actor);
    }
  }

  private async ensureScalesAvailable(): Promise<void> {
    for (const scaleCode of ['mmse', 'moca'] as const) {
      const [definitionCount, versionCount] = await Promise.all([
        this.models.scaleDefinitions.countDocuments({ code: scaleCode }),
        this.models.scaleVersions.countDocuments({ scaleCode }),
      ]);
      if (definitionCount === 0 || versionCount === 0) {
        await this.workflows.scaleCatalog.ensureSeedScaleVersionMaterialized(
          scaleCode,
        );
      }
    }
  }

  private async createRoot(
    definition: B7ScenarioDefinition,
    actor: AuthenticatedUserContext,
  ): Promise<B7ScenarioRoot> {
    const subjectCode = scenarioSubjectCodeFor(
      this.namespace,
      definition.ordinal,
    );
    const patient = await this.models.patients.create({
      subjectCode,
      displayName: `B7 脱敏受试者 ${definition.ordinal}`,
      sourceType: definition.ordinal % 2 === 0 ? 'research' : 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: 9 + (definition.ordinal % 5),
      handedness: 'unknown',
      status: 'active',
      tags: ['batch-c', 'b7', 'synthetic'],
      notes: 'Synthetic B7 browser fixture only',
      externalRefs: null,
      metadata: null,
    });
    const visit = await this.createVisit(
      patient._id,
      subjectCode,
      scenarioVisitCodeFor(this.namespace, definition.ordinal),
      'baseline',
      definition.ordinal,
    );
    const scaleInstanceId = await this.initialize(
      patient._id,
      visit._id,
      definition.scaleCode,
      actor,
    );
    return {
      scenarioKey: definition.scenarioKey,
      ordinal: definition.ordinal,
      patientId: patient._id,
      visitId: visit._id,
      scaleInstanceId,
      subjectCode,
      visitCode: visit.visitCode,
      scaleCode: definition.scaleCode,
    };
  }

  private async configureScenario(
    root: B7ScenarioRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    switch (root.scenarioKey) {
      case 'query_state_matrix':
        await this.setVisitAndInstanceStatus(root, 'draft');
        await this.setVisitAndInstanceStatus(
          await this.createCompanion(root, actor, 'INPROGRESS', 'mmse'),
          'in_progress',
        );
        return;
      case 'first_compute_idempotency':
      case 'voided_transition':
        await this.completeAndSubmit(root, actor);
        return;
      case 'partial_review_privacy':
        await this.completeSubmitAndCompute(root, actor);
        await this.addPrivacyAndWarningSentinels(root);
        return;
      case 'moca_process_group':
        await this.completeSubmitAndCompute(root, actor);
        return;
      case 'null_review_target':
        await this.completeSubmitAndCompute(root, actor);
        await this.nullFirstReviewTarget(root);
        return;
      case 'historical_read_only':
        await this.completeSubmitAndCompute(root, actor);
        await this.createHistoricalCompanion(root, actor, 'LOCKED', 'locked');
        await this.createHistoricalCompanion(root, actor, 'VOIDED', 'voided');
        return;
      case 'noncomputable_no_result':
        await this.completeAndSubmit(root, actor);
        await this.setVisitAndInstanceStatus(root, 'locked');
        await this.createNoResultHistoricalCompanion(
          root,
          actor,
          'VOIDED',
          'voided',
        );
        return;
      case 'incomplete_result':
        await this.completeSubmitAndCompute(root, actor);
        await this.models.scoreResults
          .updateOne(
            { scaleInstanceId: root.scaleInstanceId },
            { $set: { status: 'draft' } },
          )
          .exec();
        return;
      case 'computation_conflict':
        await this.completeAndSubmit(root, actor);
        await this.createHistoricalCompanion(
          root,
          actor,
          'COMPANION',
          'completed',
        );
        return;
      case 'authz_matrix':
      case 'network_failure':
      case 'responsive_scope_boundary':
        await this.completeSubmitAndCompute(root, actor);
        return;
      default:
        throw fixtureFailure(root.scenarioKey, 'Unsupported B7 scenario');
    }
  }

  private async createCompanion(
    root: B7ScenarioRoot,
    actor: AuthenticatedUserContext,
    suffix: string,
    scaleCode: B7ScaleCode,
  ): Promise<B7ScenarioRoot> {
    const visit = await this.createVisit(
      root.patientId,
      root.subjectCode,
      scenarioVisitCodeFor(this.namespace, root.ordinal, suffix),
      'follow_up',
      root.ordinal + suffix.length,
    );
    const scaleInstanceId = await this.initialize(
      root.patientId,
      visit._id,
      scaleCode,
      actor,
    );
    return {
      ...root,
      visitId: visit._id,
      visitCode: visit.visitCode,
      scaleInstanceId,
      scaleCode,
    };
  }

  private async createHistoricalCompanion(
    root: B7ScenarioRoot,
    actor: AuthenticatedUserContext,
    suffix: string,
    status: 'completed' | 'locked' | 'voided',
  ): Promise<void> {
    const companion = await this.createCompanion(
      root,
      actor,
      suffix,
      root.scaleCode,
    );
    await this.completeSubmitAndCompute(companion, actor);
    if (status !== 'completed') {
      await this.setVisitAndInstanceStatus(companion, status);
      await this.models.scoreResults
        .updateOne(
          { scaleInstanceId: companion.scaleInstanceId },
          {
            $set: {
              status,
              ...(status === 'voided' ? { voidedAt: BASE_DATE } : {}),
            },
          },
        )
        .exec();
    }
  }

  private async createNoResultHistoricalCompanion(
    root: B7ScenarioRoot,
    actor: AuthenticatedUserContext,
    suffix: string,
    status: 'locked' | 'voided',
  ): Promise<void> {
    const companion = await this.createCompanion(
      root,
      actor,
      suffix,
      root.scaleCode,
    );
    await this.completeAndSubmit(companion, actor);
    await this.setVisitAndInstanceStatus(companion, status);
  }

  private async setVisitAndInstanceStatus(
    root: B7ScenarioRoot,
    status: 'draft' | 'in_progress' | 'locked' | 'voided',
  ): Promise<void> {
    const timestampFields =
      status === 'draft'
        ? {
            startedAt: null,
            completedAt: null,
            lockedAt: null,
            voidedAt: null,
          }
        : status === 'in_progress'
          ? {
              startedAt: BASE_DATE,
              completedAt: null,
              lockedAt: null,
              voidedAt: null,
            }
          : status === 'locked'
            ? { lockedAt: BASE_DATE, voidedAt: null }
            : { lockedAt: null, voidedAt: BASE_DATE };
    await Promise.all([
      this.models.visits
        .updateOne(
          { _id: root.visitId },
          { $set: { status, ...timestampFields } },
        )
        .exec(),
      this.models.scaleInstances
        .updateOne(
          { _id: root.scaleInstanceId },
          { $set: { status, ...timestampFields } },
        )
        .exec(),
    ]);
  }

  private async completeSubmitAndCompute(
    root: B7ScenarioRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    await this.completeAndSubmit(root, actor);
    await this.workflows.provisionalScoring.computeScoreResult(
      root.patientId.toString(),
      root.visitId.toString(),
      root.scaleInstanceId.toString(),
      { confirm: true },
    );
  }

  private async completeAndSubmit(
    root: B7ScenarioRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    const items = await this.models.itemResponses
      .find({ scaleInstanceId: root.scaleInstanceId })
      .sort({ itemOrder: 1 })
      .exec();
    for (const item of items) {
      await this.workflows.itemDraft.saveDraft(
        root.patientId.toString(),
        root.visitId.toString(),
        root.scaleInstanceId.toString(),
        item._id.toString(),
        {
          rawResponse: false,
          operatorNote: 'B7 synthetic supervised assessment note',
          markAsAnswered: true,
          ...(item.itemConfigSnapshot?.requiresTimer === true
            ? { timing: { durationMs: 1000, timerSource: 'manual' as const } }
            : {}),
        },
      );
      if (item.stepResults.length > 0) {
        await this.workflows.itemDraft.saveDraft(
          root.patientId.toString(),
          root.visitId.toString(),
          root.scaleInstanceId.toString(),
          item._id.toString(),
          {
            stepResponses: item.stepResults.map((step, index) => ({
              stepCode: step.stepCode,
              actualValue: index < 2 ? true : false,
            })),
          },
        );
      }
      if (item.itemConfigSnapshot?.supportsPhotoUpload === true) {
        await this.uploadPhoto(root, item, actor);
      }
    }
    await this.workflows.submission.submitScaleInstance(
      root.patientId.toString(),
      root.visitId.toString(),
      root.scaleInstanceId.toString(),
      actor,
      { confirm: true },
    );
  }

  private async uploadPhoto(
    root: B7ScenarioRoot,
    item: ItemResponseDocument,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    await this.workflows.mediaWorkflow.uploadEvidence(
      {
        patientId: root.patientId.toString(),
        visitId: root.visitId.toString(),
        scaleInstanceId: root.scaleInstanceId.toString(),
        itemResponseId: item._id.toString(),
      },
      {
        evidenceType: 'photo',
        captureMode: 'photo_upload',
        imageWidth: 1,
        imageHeight: 1,
      },
      { file: [toMemoryFile('file', VALID_PNG, 'image/png')] },
      actor,
    );
  }

  private async addPrivacyAndWarningSentinels(
    root: B7ScenarioRoot,
  ): Promise<void> {
    await this.models.scoreResults.collection.updateOne(
      { scaleInstanceId: root.scaleInstanceId },
      {
        $set: {
          'computation.notes': 'warning_codes=UNKNOWN_GROUP_CONFIGURATION',
          metadata: {
            b7FixtureInternalReviewer: 'internal-reviewer-sentinel',
            b7FixtureRule: 'internal-rule-sentinel',
          },
          'review.reviewerName': 'internal-reviewer-sentinel',
          'itemScores.0.internalExpectedValue': 'internal-answer-sentinel',
          'itemScores.0.internalScoringRule': 'internal-rule-sentinel',
        },
      },
    );
  }

  private async nullFirstReviewTarget(root: B7ScenarioRoot): Promise<void> {
    const score = await this.models.scoreResults
      .findOne({ scaleInstanceId: root.scaleInstanceId })
      .exec();
    const reviewIndex =
      score?.itemScores.findIndex(
        (item) => item.scoreStatus === 'needs_review',
      ) ?? -1;
    if (!score || reviewIndex < 0) {
      throw fixtureFailure(
        root.scenarioKey,
        'A review-queue item is required for the null-target scenario',
      );
    }
    await this.models.scoreResults.collection.updateOne(
      { _id: score._id },
      { $set: { [`itemScores.${reviewIndex}.itemResponseId`]: null } },
    );
  }

  private async initialize(
    patientId: Types.ObjectId,
    visitId: Types.ObjectId,
    scaleCode: B7ScaleCode,
    actor: AuthenticatedUserContext,
  ): Promise<Types.ObjectId> {
    const response = await this.workflows.scaleWorkflow.initializeScaleInstance(
      patientId.toString(),
      visitId.toString(),
      { scaleCode, administrationMode: 'clinician_administered' },
      {
        operatorId: actor.id,
        operatorName: actor.displayName,
        operatorRole: 'doctor',
      },
    );
    return new Types.ObjectId(response.scaleInstance.id);
  }

  private createVisit(
    patientId: Types.ObjectId,
    subjectCode: string,
    visitCode: string,
    visitType: AssessmentVisitType,
    dayOffset: number,
  ): Promise<AssessmentVisitDocument> {
    const assessmentDate = new Date(
      BASE_DATE.getTime() + dayOffset * 24 * 60 * 60 * 1000,
    );
    return this.models.visits.create({
      patientId,
      subjectCode,
      visitCode,
      visitType,
      status: 'in_progress',
      assessmentDate,
      startedAt: assessmentDate,
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
      operatorSnapshot: null,
      clinicalContext: null,
      notes: 'Synthetic B7 browser fixture Visit',
      metadata: null,
    });
  }
}
