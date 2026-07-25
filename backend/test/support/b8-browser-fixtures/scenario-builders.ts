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
import type { ScoreReviewWorkflowService } from '../../../src/modules/scoring/services/score-review-workflow.service';
import {
  B8FixtureError,
  scenarioDefinitionsFor,
  scenarioSubjectCodeFor,
  scenarioVisitCodeFor,
  type B8BusinessScenarioKey,
  type B8Profile,
  type B8ScaleCode,
  type B8ScenarioDefinition,
} from './fixture-contract';

export type B8FixtureModels = {
  patients: Model<PatientDocument>;
  visits: Model<AssessmentVisitDocument>;
  scaleInstances: Model<ScaleInstanceDocument>;
  itemResponses: Model<ItemResponseDocument>;
  mediaEvidence: Model<MediaEvidenceDocument>;
  scoreResults: Model<ScoreResultDocument>;
  scaleDefinitions: Model<ScaleDefinitionDocument>;
  scaleVersions: Model<ScaleVersionDocument>;
};

export type B8FixtureWorkflows = {
  scaleCatalog: ScaleCatalogService;
  scaleWorkflow: AssessmentScaleWorkflowService;
  itemDraft: ItemResponseDraftService;
  mediaWorkflow: MediaEvidenceWorkflowService;
  submission: ScaleInstanceSubmissionService;
  provisionalScoring: ProvisionalScoringWorkflowService;
  scoreReview: ScoreReviewWorkflowService;
};

export type B8ScenarioRoot = {
  scenarioKey: B8BusinessScenarioKey;
  ordinal: number;
  patientId: Types.ObjectId;
  visitId: Types.ObjectId;
  scaleInstanceId: Types.ObjectId;
  subjectCode: string;
  visitCode: string;
  scaleCode: B8ScaleCode;
};

const BASE_DATE = new Date('2026-07-23T08:00:00.000Z');
const MANUAL_REVIEW_NOTE = 'B8 synthetic manual review';
const CONFIRMATION_NOTE = 'B8 synthetic explicit confirmation';
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function fixtureFailure(
  profile: B8Profile,
  scenarioKey: B8BusinessScenarioKey,
  message: string,
): B8FixtureError {
  return new B8FixtureError(
    'B8_FIXTURE_SCENARIO_BUILD_FAILED',
    message,
    profile,
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
    originalname: 'b8-synthetic-image.png',
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
  };
}

export class B8ScenarioBuilder {
  constructor(
    private readonly profile: B8Profile,
    private readonly namespace: string,
    private readonly models: B8FixtureModels,
    private readonly workflows: B8FixtureWorkflows,
  ) {}

  async buildAll(actor: AuthenticatedUserContext): Promise<void> {
    await this.ensureScalesAvailable();
    for (const definition of scenarioDefinitionsFor(this.profile)) {
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
    definition: B8ScenarioDefinition,
    actor: AuthenticatedUserContext,
  ): Promise<B8ScenarioRoot> {
    const subjectCode = scenarioSubjectCodeFor(
      this.profile,
      this.namespace,
      definition.ordinal,
    );
    const patient = await this.models.patients.create({
      subjectCode,
      displayName: `B8 脱敏受试者 ${this.profile} ${definition.ordinal}`,
      sourceType: definition.ordinal % 2 === 0 ? 'research' : 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: 9 + (definition.ordinal % 5),
      handedness: 'unknown',
      status: 'active',
      tags: ['batch-c', 'b8', this.profile, 'synthetic'],
      notes: 'Synthetic B8 browser fixture only',
      externalRefs: null,
      metadata: null,
    });
    const visit = await this.createVisit(
      patient._id,
      subjectCode,
      scenarioVisitCodeFor(this.profile, this.namespace, definition.ordinal),
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
    root: B8ScenarioRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    await this.completeSubmitAndCompute(root, actor);
    switch (root.scenarioKey) {
      case 'manual_eligibility': {
        await this.ensureEligibilityStatuses(root);
        const nullTarget = await this.createCompanion(
          root,
          actor,
          'NULLTARGET',
        );
        await this.completeSubmitAndCompute(nullTarget, actor);
        await this.nullFirstReviewTarget(nullTarget);
        return;
      }
      case 'manual_input_validation':
      case 'manual_submit_success':
        await this.requireReviewTargets(root, 2);
        return;
      case 'draft_switch_unload':
      case 'auth_401':
      case 'auth_403':
        await this.requireReviewTargets(root, 1);
        return;
      case 'network_failure': {
        await this.requireReviewTargets(root, 1);
        const confirmation = await this.createCompanion(
          root,
          actor,
          'CONFIRMATION',
        );
        await this.completeSubmitAndCompute(confirmation, actor);
        await this.resolveManualReviews(confirmation, actor, 0);
        return;
      }
      case 'responsive_route_draft': {
        await this.requireReviewTargets(root, 1);
        const confirmation = await this.createCompanion(
          root,
          actor,
          'CONFIRMATION',
        );
        await this.completeSubmitAndCompute(confirmation, actor);
        await this.resolveManualReviews(confirmation, actor, 0);
        const execution = await this.createCompanion(root, actor, 'EXECUTION');
        await this.requireEditableExecutionTargets(execution);
        return;
      }
      case 'manual_revision':
      case 'static_gate':
        await this.resolveManualReviews(root, actor, 0);
        return;
      case 'final_manual_to_computed':
      case 'manual_conflict_stale':
        await this.resolveManualReviews(root, actor, 1);
        return;
      case 'confirmation_eligibility': {
        await this.resolveManualReviews(root, actor, 0);
        const warning = await this.createCompanion(root, actor, 'WARNING');
        await this.completeSubmitAndCompute(warning, actor);
        await this.resolveManualReviews(warning, actor, 0);
        await this.addWarning(warning);
        const pending = await this.createCompanion(root, actor, 'PENDING');
        await this.completeSubmitAndCompute(pending, actor);
        await this.requireReviewTargets(pending, 1);
        return;
      }
      case 'confirmation_success':
        await this.resolveManualReviews(root, actor, 0);
        return;
      case 'confirmed_idempotent_readonly': {
        await this.resolveManualReviews(root, actor, 0);
        await this.confirm(root, actor);
        const locked = await this.createCompanion(root, actor, 'LOCKED');
        await this.completeSubmitAndCompute(locked, actor);
        await this.resolveManualReviews(locked, actor, 0);
        await this.confirm(locked, actor);
        await this.models.scoreResults
          .updateOne(
            { scaleInstanceId: locked.scaleInstanceId },
            { $set: { status: 'locked', lockedAt: BASE_DATE } },
          )
          .exec();
        const missing = await this.createCompanion(root, actor, 'MISSING');
        await this.completeSubmitAndCompute(missing, actor);
        await this.resolveManualReviews(missing, actor, 0);
        await this.confirm(missing, actor);
        await this.models.scoreResults.collection.updateOne(
          { scaleInstanceId: missing.scaleInstanceId },
          {
            $unset: {
              confirmedAt: '',
              'metadata.a18Confirmation': '',
            },
          },
        );
        return;
      }
      case 'metadata_audit_blocks': {
        await this.requireReviewTargets(root, 1);
        await this.models.scoreResults.collection.updateOne(
          { scaleInstanceId: root.scaleInstanceId },
          { $set: { metadata: 'b8-unsupported-metadata' } },
        );
        const auditLimit = await this.createCompanion(
          root,
          actor,
          'AUDITLIMIT',
        );
        await this.completeSubmitAndCompute(auditLimit, actor);
        await this.requireReviewTargets(auditLimit, 1);
        await this.models.scoreResults.collection.updateOne(
          { scaleInstanceId: auditLimit.scaleInstanceId },
          {
            $set: {
              metadata: {
                a18ManualReview: {
                  version: 1,
                  events: Array.from({ length: 500 }, (_, index) => ({
                    eventId: `b8-audit-${index}`,
                  })),
                },
              },
            },
          },
        );
        return;
      }
      case 'confirmation_conflict_warning': {
        await this.resolveManualReviews(root, actor, 0);
        const warning = await this.createCompanion(root, actor, 'WARNING');
        await this.completeSubmitAndCompute(warning, actor);
        await this.resolveManualReviews(warning, actor, 0);
        await this.addWarning(warning);
        return;
      }
      case 'privacy_public_surface':
        await this.resolveManualReviews(root, actor, 0);
        await this.confirm(root, actor);
        await this.addPrivacySentinels(root);
        return;
      default:
        throw fixtureFailure(
          this.profile,
          root.scenarioKey,
          'Unsupported B8 scenario',
        );
    }
  }

  private async createCompanion(
    root: B8ScenarioRoot,
    actor: AuthenticatedUserContext,
    suffix: string,
  ): Promise<B8ScenarioRoot> {
    const visit = await this.createVisit(
      root.patientId,
      root.subjectCode,
      scenarioVisitCodeFor(this.profile, this.namespace, root.ordinal, suffix),
      'follow_up',
      root.ordinal + suffix.length,
    );
    const scaleInstanceId = await this.initialize(
      root.patientId,
      visit._id,
      root.scaleCode,
      actor,
    );
    return {
      ...root,
      visitId: visit._id,
      visitCode: visit.visitCode,
      scaleInstanceId,
    };
  }

  private async completeSubmitAndCompute(
    root: B8ScenarioRoot,
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
          operatorNote: 'B8 synthetic supervised assessment note',
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
              actualValue: index < 2,
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
    await this.workflows.provisionalScoring.computeScoreResult(
      root.patientId.toString(),
      root.visitId.toString(),
      root.scaleInstanceId.toString(),
      { confirm: true },
    );
  }

  private async resolveManualReviews(
    root: B8ScenarioRoot,
    actor: AuthenticatedUserContext,
    remaining: number,
  ): Promise<void> {
    let detail = await this.workflows.provisionalScoring.getLatestScoreResult(
      root.patientId.toString(),
      root.visitId.toString(),
      root.scaleInstanceId.toString(),
    );
    if (detail.reviewQueue.length < remaining) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The generated score result does not contain enough review targets',
      );
    }
    while (detail.reviewQueue.length > remaining) {
      const target = detail.reviewQueue[0];
      const item = detail.scoreResult.itemScores.find(
        (candidate) =>
          candidate.itemResponseId !== null &&
          candidate.itemResponseId === target.itemResponseId,
      );
      if (
        !target.itemResponseId ||
        !item ||
        item.minScore === null ||
        !Number.isFinite(item.minScore)
      ) {
        throw fixtureFailure(
          this.profile,
          root.scenarioKey,
          'A generated review target is not safe for deterministic manual scoring',
        );
      }
      detail = await this.workflows.scoreReview.reviewScoreItem(
        root.patientId.toString(),
        root.visitId.toString(),
        root.scaleInstanceId.toString(),
        detail.scoreResult.id,
        target.itemResponseId,
        actor,
        {
          scoreValue: item.minScore,
          reviewNote: MANUAL_REVIEW_NOTE,
          expectedUpdatedAt: detail.scoreResult.updatedAt.toISOString(),
        },
      );
    }
  }

  private async confirm(
    root: B8ScenarioRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    const detail = await this.workflows.provisionalScoring.getLatestScoreResult(
      root.patientId.toString(),
      root.visitId.toString(),
      root.scaleInstanceId.toString(),
    );
    await this.workflows.scoreReview.confirmScoreResult(
      root.patientId.toString(),
      root.visitId.toString(),
      root.scaleInstanceId.toString(),
      detail.scoreResult.id,
      actor,
      {
        confirm: true,
        reviewNote: CONFIRMATION_NOTE,
        expectedUpdatedAt: detail.scoreResult.updatedAt.toISOString(),
      },
    );
  }

  private async requireReviewTargets(
    root: B8ScenarioRoot,
    minimum: number,
  ): Promise<void> {
    const detail = await this.workflows.provisionalScoring.getLatestScoreResult(
      root.patientId.toString(),
      root.visitId.toString(),
      root.scaleInstanceId.toString(),
    );
    if (detail.reviewQueue.length < minimum) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The generated score result does not satisfy the review-target contract',
      );
    }
  }

  private async requireEditableExecutionTargets(
    root: B8ScenarioRoot,
  ): Promise<void> {
    const [visit, instance, items, scoreCount, mediaCount] = await Promise.all([
      this.models.visits.findById(root.visitId).exec(),
      this.models.scaleInstances.findById(root.scaleInstanceId).exec(),
      this.models.itemResponses
        .find({ scaleInstanceId: root.scaleInstanceId })
        .sort({ itemOrder: 1 })
        .exec(),
      this.models.scoreResults.countDocuments({
        scaleInstanceId: root.scaleInstanceId,
      }),
      this.models.mediaEvidence.countDocuments({
        scaleInstanceId: root.scaleInstanceId,
      }),
    ]);
    const editableItems = items.filter(
      (item) =>
        ['not_started', 'in_progress', 'answered'].includes(item.status) &&
        !(item.lockedAt instanceof Date),
    );
    const hasMediaDraftTarget = editableItems.some((item) => {
      const config = item.itemConfigSnapshot;
      return (
        config !== null &&
        typeof config === 'object' &&
        (config.supportsPhotoUpload === true ||
          config.supportsHandwriting === true)
      );
    });
    if (
      visit?.status !== 'in_progress' ||
      instance?.status !== 'draft' ||
      editableItems.length === 0 ||
      !hasMediaDraftTarget ||
      scoreCount !== 0 ||
      mediaCount !== 0
    ) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The execution variant does not provide legal item and local media draft targets',
      );
    }
  }

  private async nullFirstReviewTarget(root: B8ScenarioRoot): Promise<void> {
    const score = await this.models.scoreResults
      .findOne({ scaleInstanceId: root.scaleInstanceId })
      .exec();
    const reviewIndex =
      score?.itemScores.findIndex(
        (item) => item.scoreStatus === 'needs_review',
      ) ?? -1;
    if (!score || reviewIndex < 0) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'A review target is required for the null-target variant',
      );
    }
    await this.models.scoreResults.collection.updateOne(
      { _id: score._id },
      { $set: { [`itemScores.${reviewIndex}.itemResponseId`]: null } },
    );
  }

  private async ensureEligibilityStatuses(root: B8ScenarioRoot): Promise<void> {
    const score = await this.models.scoreResults
      .findOne({ scaleInstanceId: root.scaleInstanceId })
      .exec();
    if (!score || score.itemScores.length < 3) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The eligibility matrix requires at least three synthetic score items',
      );
    }
    const reviewIndex = score.itemScores.findIndex(
      (item) => item.scoreStatus === 'needs_review',
    );
    const autoIndex = score.itemScores.findIndex(
      (_item, index) => index !== reviewIndex,
    );
    const notScoredIndex = score.itemScores.findIndex(
      (_item, index) => index !== reviewIndex && index !== autoIndex,
    );
    if (reviewIndex < 0 || autoIndex < 0 || notScoredIndex < 0) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The eligibility matrix could not reserve distinct score statuses',
      );
    }
    const autoScore = score.itemScores[autoIndex].minScore ?? 0;
    await this.models.scoreResults.collection.updateOne(
      { _id: score._id },
      {
        $set: {
          status: 'needs_review',
          [`itemScores.${autoIndex}.scoreStatus`]: 'auto_scored',
          [`itemScores.${autoIndex}.scoreSource`]: 'auto_rule',
          [`itemScores.${autoIndex}.scoreValue`]: autoScore,
          [`itemScores.${autoIndex}.includedInTotal`]: true,
          [`itemScores.${notScoredIndex}.scoreStatus`]: 'not_scored',
          [`itemScores.${notScoredIndex}.scoreSource`]: 'none',
          [`itemScores.${notScoredIndex}.scoreValue`]: null,
          [`itemScores.${notScoredIndex}.includedInTotal`]: false,
        },
      },
    );
  }

  private async addWarning(root: B8ScenarioRoot): Promise<void> {
    await this.models.scoreResults
      .updateOne(
        { scaleInstanceId: root.scaleInstanceId },
        {
          $set: {
            'computation.warningCount': 1,
            'computation.notes': 'warning_codes=UNKNOWN_GROUP_CONFIGURATION',
          },
        },
      )
      .exec();
  }

  private async addPrivacySentinels(root: B8ScenarioRoot): Promise<void> {
    await this.models.scoreResults.collection.updateOne(
      { scaleInstanceId: root.scaleInstanceId },
      {
        $set: {
          'metadata.b8InternalAudit': 'private-audit-sentinel',
          'metadata.b8InternalPreviousScore': 99,
          'review.internalReviewer': 'private-reviewer-sentinel',
          'itemScores.0.internalExpectedValue': 'private-answer-sentinel',
          'itemScores.0.internalScoringRule': 'private-rule-sentinel',
        },
      },
    );
  }

  private async uploadPhoto(
    root: B8ScenarioRoot,
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

  private async initialize(
    patientId: Types.ObjectId,
    visitId: Types.ObjectId,
    scaleCode: B8ScaleCode,
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
      notes: 'Synthetic B8 browser fixture Visit',
      metadata: null,
    });
  }
}
