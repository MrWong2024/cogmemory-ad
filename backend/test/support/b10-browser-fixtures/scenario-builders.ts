import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { AuthenticatedUserContext } from '../../../src/modules/auth/types/auth-user-context.type';
import type {
  AssessmentVisitDocument,
  AssessmentVisitType,
} from '../../../src/modules/assessments/schemas/assessment-visit.schema';
import type { ItemResponseDocument } from '../../../src/modules/assessments/schemas/item-response.schema';
import type { ScaleInstanceDocument } from '../../../src/modules/assessments/schemas/scale-instance.schema';
import type { AssessmentExecutionService } from '../../../src/modules/assessments/services/assessment-execution.service';
import type { ItemResponseDraftService } from '../../../src/modules/assessments/services/item-response-draft.service';
import type { ScaleInstanceSubmissionService } from '../../../src/modules/assessments/services/scale-instance-submission.service';
import {
  A19_COGNITIVE_DOMAIN_ENGINE_VERSION,
  A19_DOMAIN_MAPPING_VERSION,
  mapConfirmedScoreToDomainInputs,
} from '../../../src/modules/cognitive-domains/lib/confirmed-score-domain-mapping';
import type { CognitiveDomainResultDocument } from '../../../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
import type { CognitiveDomainsService } from '../../../src/modules/cognitive-domains/services/cognitive-domains.service';
import type { MediaEvidenceDocument } from '../../../src/modules/media/schemas/media-evidence.schema';
import type { MediaEvidenceWorkflowService } from '../../../src/modules/media/services/media-evidence-workflow.service';
import type { UploadedMemoryFile } from '../../../src/modules/media/types/uploaded-memory-file.types';
import type { PatientDocument } from '../../../src/modules/patients/schemas/patient.schema';
import type { ClinicalReportDocument } from '../../../src/modules/reports/schemas/clinical-report.schema';
import type { ScaleDefinitionDocument } from '../../../src/modules/scales/schemas/scale-definition.schema';
import type { ScaleVersionDocument } from '../../../src/modules/scales/schemas/scale-version.schema';
import type { ScaleCatalogService } from '../../../src/modules/scales/services/scale-catalog.service';
import type { ScalesService } from '../../../src/modules/scales/services/scales.service';
import type { ScoreResultDocument } from '../../../src/modules/scoring/schemas/score-result.schema';
import type { ProvisionalScoringWorkflowService } from '../../../src/modules/scoring/services/provisional-scoring-workflow.service';
import type { ScoreReviewWorkflowService } from '../../../src/modules/scoring/services/score-review-workflow.service';
import type { ScoringService } from '../../../src/modules/scoring/services/scoring.service';
import {
  B10FixtureError,
  conflictIndexNameFor,
  scenarioDefinitionsFor,
  scenarioSubjectCodeFor,
  scenarioVisitCodeFor,
  type B10BusinessScenarioKey,
  type B10InstanceState,
  type B10Profile,
  type B10ReportVariant,
  type B10RoutePreparedContract,
  type B10ScaleCode,
  type B10ScenarioDefinition,
} from './fixture-contract';

export type B10FixtureModels = {
  patients: Model<PatientDocument>;
  visits: Model<AssessmentVisitDocument>;
  scaleInstances: Model<ScaleInstanceDocument>;
  itemResponses: Model<ItemResponseDocument>;
  mediaEvidence: Model<MediaEvidenceDocument>;
  scoreResults: Model<ScoreResultDocument>;
  cognitiveDomainResults: Model<CognitiveDomainResultDocument>;
  reports: Model<ClinicalReportDocument>;
  scaleDefinitions: Model<ScaleDefinitionDocument>;
  scaleVersions: Model<ScaleVersionDocument>;
};

export type B10FixtureWorkflows = {
  scaleCatalog: ScaleCatalogService;
  assessmentExecution: AssessmentExecutionService;
  itemDraft: ItemResponseDraftService;
  mediaWorkflow: MediaEvidenceWorkflowService;
  submission: ScaleInstanceSubmissionService;
  provisionalScoring: ProvisionalScoringWorkflowService;
  scoreReview: ScoreReviewWorkflowService;
  scoring: ScoringService;
  scales: ScalesService;
  cognitiveDomains: CognitiveDomainsService;
};

export type B10ScenarioRouteRoot = {
  scenarioKey: B10BusinessScenarioKey;
  routeKey: string;
  ordinal: number;
  patientId: Types.ObjectId;
  visitId: Types.ObjectId;
  subjectCode: string;
  visitCode: string;
  scaleCode: B10ScaleCode;
  scaleInstanceIds: Types.ObjectId[];
};

const BASE_DATE = new Date('2026-07-26T02:00:00.000Z');
const MANUAL_REVIEW_NOTE = 'B10 synthetic manual review';
const CONFIRMATION_NOTE = 'B10 synthetic explicit score confirmation';
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function fixtureFailure(
  profile: B10Profile,
  scenarioKey: B10BusinessScenarioKey,
  message: string,
): B10FixtureError {
  return new B10FixtureError(
    'B10_FIXTURE_SCENARIO_BUILD_FAILED',
    message,
    profile,
    scenarioKey,
  );
}

function toMemoryFile(buffer: Buffer): UploadedMemoryFile {
  return {
    fieldname: 'file',
    originalname: 'b10-synthetic-image.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: buffer.length,
    buffer,
  };
}

function sanitizeCode(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
}

export class B10ScenarioBuilder {
  constructor(
    private readonly profile: B10Profile,
    private readonly namespace: string,
    private readonly models: B10FixtureModels,
    private readonly workflows: B10FixtureWorkflows,
  ) {}

  async ensureCanonicalSeedReadiness(): Promise<void> {
    for (const scaleCode of ['mmse', 'moca'] as const) {
      await this.workflows.scaleCatalog.ensureSeedScaleVersionMaterialized(
        scaleCode,
      );
    }
  }

  async buildAll(actor: AuthenticatedUserContext): Promise<void> {
    await this.ensureCanonicalSeedReadiness();
    for (const definition of scenarioDefinitionsFor(this.profile)) {
      await this.buildScenario(definition, actor);
    }
  }

  async createControlledFirstGeneratedReport(
    root: B10ScenarioRouteRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    const existing = await this.models.reports.countDocuments({
      assessmentVisitId: root.visitId,
      reportType: 'cognitive_assessment',
    });
    if (existing !== 0) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'Controlled post-browser simulation requires an empty report slot',
      );
    }
    await this.models.reports.create(
      await this.reportDocument(root, 'valid_draft', actor),
    );
  }

  async stageScopeConflictReport(
    root: B10ScenarioRouteRoot,
    actor: AuthenticatedUserContext,
  ): Promise<boolean> {
    if (
      root.scenarioKey !== 'scope_conflict' ||
      root.routeKey !== 'base' ||
      root.scaleInstanceIds.length !== 2
    ) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The fixed scope-conflict stage root is invalid',
      );
    }
    const existing = await this.models.reports
      .find({ assessmentVisitId: root.visitId })
      .sort({ _id: 1 })
      .exec();
    if (existing.length > 0) {
      if (
        existing.length === 1 &&
        this.isFixedScopeConflictStage(existing[0], root)
      ) {
        return true;
      }
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'Scope-conflict stage requires either the prepared empty slot or its exact staged report',
      );
    }
    const document = await this.reportDocument(
      root,
      'different_scope_draft',
      actor,
    );
    const metadata = document.metadata as Record<string, unknown>;
    document.metadata = {
      ...metadata,
      b10FixtureStage: {
        version: 1,
        profile: this.profile,
        namespace: this.namespace,
        scenarioKey: root.scenarioKey,
        routeKey: root.routeKey,
        transition: 'stage-different-scope-draft',
      },
    };
    await this.models.reports.create(document);
    return false;
  }

  async stageSourceScaleNotReady(root: B10ScenarioRouteRoot): Promise<boolean> {
    if (
      root.scenarioKey !== 'source_readiness_errors' ||
      root.routeKey !== 'scale_not_ready' ||
      root.scaleInstanceIds.length !== 1
    ) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The fixed source-readiness stage root is invalid',
      );
    }
    const instance = await this.models.scaleInstances
      .findById(root.scaleInstanceIds[0])
      .exec();
    if (!instance) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The fixed source-readiness stage instance is missing',
      );
    }
    if (instance.status === 'in_progress') {
      return true;
    }
    if (instance.status !== 'completed') {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'Source-readiness stage requires the prepared completed instance',
      );
    }
    const result = await this.models.scaleInstances.collection.updateOne(
      { _id: instance._id, status: 'completed' },
      { $set: { status: 'in_progress' } },
    );
    if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'Source-readiness stage did not change exactly one namespace-owned instance',
      );
    }
    return false;
  }

  private isFixedScopeConflictStage(
    report: ClinicalReportDocument,
    root: B10ScenarioRouteRoot,
  ): boolean {
    const marker = report.metadata?.b10FixtureStage as
      | Record<string, unknown>
      | undefined;
    return (
      report.reportType === 'cognitive_assessment' &&
      report.reportVersion === 1 &&
      report.status === 'draft' &&
      report.source === 'system_draft' &&
      report.primaryScaleInstanceIds.length === 1 &&
      report.primaryScaleInstanceIds[0]?.toString() ===
        root.scaleInstanceIds[0]?.toString() &&
      marker?.version === 1 &&
      marker.profile === this.profile &&
      marker.namespace === this.namespace &&
      marker.scenarioKey === root.scenarioKey &&
      marker.routeKey === root.routeKey &&
      marker.transition === 'stage-different-scope-draft'
    );
  }

  private async buildScenario(
    definition: B10ScenarioDefinition,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    const subjectCode = scenarioSubjectCodeFor(
      this.profile,
      this.namespace,
      definition.ordinal,
    );
    const patient = await this.models.patients.create({
      subjectCode,
      displayName: `B10 脱敏受试者 ${this.profile} ${definition.ordinal}`,
      sourceType: definition.ordinal % 2 === 0 ? 'research' : 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: 6 + (definition.ordinal % 8),
      handedness: 'unknown',
      status: 'active',
      tags: ['batch-c', 'b10', this.profile, 'synthetic', 'deidentified'],
      notes: 'Synthetic B10 fixture without clinical meaning',
      externalRefs: null,
      metadata: null,
    });

    for (const contract of definition.routeContracts) {
      const visit = await this.createVisit(
        patient._id,
        subjectCode,
        scenarioVisitCodeFor(
          this.profile,
          this.namespace,
          definition.ordinal,
          contract.key,
        ),
        definition.ordinal + contract.key.length,
      );
      const root: B10ScenarioRouteRoot = {
        scenarioKey: definition.scenarioKey,
        routeKey: contract.key,
        ordinal: definition.ordinal,
        patientId: patient._id,
        visitId: visit._id,
        subjectCode,
        visitCode: visit.visitCode,
        scaleCode: definition.scaleCode,
        scaleInstanceIds: [],
      };
      for (const [index, state] of contract.instanceStates.entries()) {
        const scaleCode =
          index % 2 === 0
            ? definition.scaleCode
            : definition.scaleCode === 'mmse'
              ? 'moca'
              : 'mmse';
        const instanceId = await this.initialize(
          root,
          scaleCode,
          index + 1,
          actor,
        );
        root.scaleInstanceIds.push(instanceId);
        await this.configureInstance(root, instanceId, state, actor);
      }
      await this.createReportVariant(root, contract.reportVariant, actor);
      await this.applyRouteStates(root, contract);
    }
    if (
      definition.routeContracts.some(
        ({ patientStatus }) => patientStatus === 'inactive',
      )
    ) {
      await this.models.patients
        .updateOne({ _id: patient._id }, { $set: { status: 'inactive' } })
        .exec();
    }
  }

  private async configureInstance(
    root: B10ScenarioRouteRoot,
    instanceId: Types.ObjectId,
    state: B10InstanceState,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    if (state === 'draft') {
      return;
    }
    if (state === 'in_progress') {
      await this.fillFirstItem(root, instanceId);
      await this.models.scaleInstances
        .updateOne(
          { _id: instanceId },
          { $set: { status: 'in_progress', startedAt: BASE_DATE } },
        )
        .exec();
      return;
    }
    if (state === 'completed' || state === 'locked' || state === 'voided') {
      const changedAt = new Date(
        BASE_DATE.getTime() +
          root.ordinal * 60_000 +
          root.routeKey.length * 1000,
      );
      await this.models.scaleInstances
        .updateOne(
          { _id: instanceId },
          {
            $set: {
              status: state,
              completedAt: state === 'voided' ? null : changedAt,
              lockedAt: state === 'locked' ? changedAt : null,
              voidedAt: state === 'voided' ? changedAt : null,
            },
          },
        )
        .exec();
      return;
    }

    await this.fillAndSubmit(root, instanceId, actor);

    await this.workflows.provisionalScoring.computeScoreResult(
      root.patientId.toString(),
      root.visitId.toString(),
      instanceId.toString(),
      { confirm: true },
    );
    if (state === 'score_not_final') {
      return;
    }
    await this.resolveManualReviews(root, instanceId, actor);
    await this.directConfirm(root, instanceId, actor);
    if (state === 'domain_missing') {
      return;
    }
    await this.createDerivedDomainResult(root, instanceId);
    if (state === 'media_invalid') {
      const media = await this.models.mediaEvidence
        .findOne({ scaleInstanceId: instanceId })
        .exec();
      if (!media) {
        throw fixtureFailure(
          this.profile,
          root.scenarioKey,
          'The media-invalid route requires one synthetic evidence record',
        );
      }
      await this.models.mediaEvidence.collection.updateOne(
        { _id: media._id },
        { $set: { 'storage.objectKey': '' } },
      );
    }
  }

  private async fillFirstItem(
    root: B10ScenarioRouteRoot,
    instanceId: Types.ObjectId,
  ): Promise<void> {
    const item = await this.models.itemResponses
      .findOne({ scaleInstanceId: instanceId })
      .sort({ itemOrder: 1 })
      .exec();
    if (!item) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'An initialized instance has no item response',
      );
    }
    await this.workflows.itemDraft.saveDraft(
      root.patientId.toString(),
      root.visitId.toString(),
      instanceId.toString(),
      item._id.toString(),
      {
        rawResponse: false,
        operatorNote: 'B10 synthetic process note',
        markAsAnswered: true,
      },
    );
  }

  private async fillAndSubmit(
    root: B10ScenarioRouteRoot,
    instanceId: Types.ObjectId,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    const items = await this.models.itemResponses
      .find({ scaleInstanceId: instanceId })
      .sort({ itemOrder: 1 })
      .exec();
    for (const item of items) {
      await this.workflows.itemDraft.saveDraft(
        root.patientId.toString(),
        root.visitId.toString(),
        instanceId.toString(),
        item._id.toString(),
        {
          rawResponse: false,
          operatorNote: 'B10 synthetic supervised process note',
          markAsAnswered: true,
          ...(item.itemConfigSnapshot?.requiresTimer === true
            ? { timing: { durationMs: 900, timerSource: 'manual' as const } }
            : {}),
        },
      );
      if (item.stepResults.length > 0) {
        await this.workflows.itemDraft.saveDraft(
          root.patientId.toString(),
          root.visitId.toString(),
          instanceId.toString(),
          item._id.toString(),
          {
            stepResponses: item.stepResults.map((step, index) => ({
              stepCode: step.stepCode,
              actualValue: index % 2 === 0,
            })),
          },
        );
      }
      if (item.itemConfigSnapshot?.supportsPhotoUpload === true) {
        await this.workflows.mediaWorkflow.uploadEvidence(
          {
            patientId: root.patientId.toString(),
            visitId: root.visitId.toString(),
            scaleInstanceId: instanceId.toString(),
            itemResponseId: item._id.toString(),
          },
          {
            evidenceType: 'photo',
            captureMode: 'photo_upload',
            imageWidth: 1,
            imageHeight: 1,
          },
          { file: [toMemoryFile(VALID_PNG)] },
          actor,
        );
      }
    }
    await this.workflows.submission.submitScaleInstance(
      root.patientId.toString(),
      root.visitId.toString(),
      instanceId.toString(),
      actor,
      { confirm: true },
    );
  }

  private async resolveManualReviews(
    root: B10ScenarioRouteRoot,
    instanceId: Types.ObjectId,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    let detail = await this.workflows.provisionalScoring.getLatestScoreResult(
      root.patientId.toString(),
      root.visitId.toString(),
      instanceId.toString(),
    );
    while (detail.reviewQueue.length > 0) {
      const target = detail.reviewQueue[0];
      const item = detail.scoreResult.itemScores.find(
        (candidate) =>
          candidate.itemResponseId !== null &&
          candidate.itemResponseId === target.itemResponseId,
      );
      if (!target.itemResponseId || !item || item.minScore === null) {
        throw fixtureFailure(
          this.profile,
          root.scenarioKey,
          'A generated review target is not safe for deterministic fixture scoring',
        );
      }
      detail = await this.workflows.scoreReview.reviewScoreItem(
        root.patientId.toString(),
        root.visitId.toString(),
        instanceId.toString(),
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
    if (detail.scoreResult.status !== 'computed') {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The synthetic score did not reach confirmation-ready state',
      );
    }
  }

  private async directConfirm(
    root: B10ScenarioRouteRoot,
    instanceId: Types.ObjectId,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    const score = await this.requireScore(root, instanceId);
    const confirmedAt = new Date(
      BASE_DATE.getTime() +
        root.ordinal * 120_000 +
        root.routeKey.length * 1000,
    );
    const metadata =
      score.metadata && typeof score.metadata === 'object'
        ? { ...score.metadata }
        : {};
    metadata.a18Confirmation = {
      confirmationId: `b10-${this.namespace}-${sanitizeCode(
        root.scenarioKey,
      )}-${sanitizeCode(root.routeKey)}-${instanceId.toString().slice(-4)}`,
      confirmedAt,
      confirmedBy: actor.id,
      confirmedByName: actor.displayName,
      confirmedByRole: 'doctor',
      reviewNote: CONFIRMATION_NOTE,
    };
    await this.models.scoreResults
      .updateOne(
        { _id: score._id, status: 'computed' },
        {
          $set: {
            status: 'confirmed',
            confirmedAt,
            qualityStatus: 'passed',
            'review.reviewStatus': 'reviewed',
            'review.reviewedAt': confirmedAt,
            metadata,
          },
        },
        { runValidators: true },
      )
      .exec();
  }

  private async createDerivedDomainResult(
    root: B10ScenarioRouteRoot,
    instanceId: Types.ObjectId,
  ): Promise<void> {
    const [source, instance] = await Promise.all([
      this.workflows.scoring.findScoreResultByScaleInstanceAndRunNo(
        instanceId.toString(),
        1,
      ),
      this.models.scaleInstances.findById(instanceId).exec(),
    ]);
    if (!instance || !source) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The source instance is missing',
      );
    }
    const version =
      await this.workflows.scales.findVersionByScaleCodeAndVersion(
        instance.scaleCode,
        instance.scaleVersion,
      );
    if (!version) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The bound scale version is missing',
      );
    }
    const mapped = mapConfirmedScoreToDomainInputs(source, version);
    const summary = this.workflows.cognitiveDomains.summarizeDomainScores(
      mapped.items,
    );
    const computedAt = new Date(
      BASE_DATE.getTime() +
        root.ordinal * 180_000 +
        root.routeKey.length * 1000,
    );
    await this.models.cognitiveDomainResults.create({
      patientId: root.patientId,
      assessmentVisitId: root.visitId,
      scaleInstanceId: instanceId,
      scoreResultId: new Types.ObjectId(source.id),
      subjectCode: root.subjectCode,
      scaleDefinitionId: new Types.ObjectId(source.scaleDefinitionId),
      scaleVersionId: new Types.ObjectId(source.scaleVersionId),
      scaleCode: source.scaleCode,
      scaleVersion: source.scaleVersion,
      instanceCode: instance.instanceCode,
      domainResultCode: this.domainResultCode(root, instanceId),
      runNo: 1,
      status: 'computed',
      mappingSource: 'scale_config',
      mappingMode: 'item_domain_codes',
      versionTrace: {
        scaleVersion: source.scaleVersion,
        crfVersion: source.versionTrace?.crfVersion,
        scoringRuleVersion: source.versionTrace?.scoringRuleVersion,
        fieldEncodingVersion: source.versionTrace?.fieldEncodingVersion,
        domainMappingVersion: A19_DOMAIN_MAPPING_VERSION,
        sourceDocument: source.versionTrace?.sourceDocument,
      },
      domainScores: summary.domainScores,
      itemContributions: summary.itemContributions.map((contribution) => ({
        ...contribution,
        scoreResultId: new Types.ObjectId(source.id),
      })),
      mappingSnapshot: mapped.mappingSnapshot,
      computation: {
        computedAt,
        computedBy: null,
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
      confirmedAt: null,
      lockedAt: null,
      voidedAt: null,
      metadata: {
        b10Fixture: {
          profile: this.profile,
          namespace: this.namespace,
          scenarioKey: root.scenarioKey,
          routeKey: root.routeKey,
        },
      },
    });
  }

  private async createReportVariant(
    root: B10ScenarioRouteRoot,
    variant: B10ReportVariant,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    if (variant === 'none') {
      return;
    }
    if (variant === 'generation_conflict_blocker') {
      await this.models.reports.create(
        await this.reportDocument(root, variant, actor),
      );
      await this.models.reports.collection.createIndex(
        { assessmentVisitId: 1 },
        {
          name: conflictIndexNameFor(this.namespace),
          unique: true,
          partialFilterExpression: { subjectCode: root.subjectCode },
        },
      );
      return;
    }
    await this.models.reports.create(
      await this.reportDocument(root, variant, actor),
    );
    if (variant === 'rich_draft' || variant === 'long_pending_confirmation') {
      const report = await this.models.reports
        .findOne({ assessmentVisitId: root.visitId })
        .exec();
      if (report) {
        await this.models.reports.collection.updateOne(
          { _id: report._id },
          {
            $set: {
              'visitSnapshot.clinicalContext': {
                privateSentinel: 'b10-private-clinical-context',
              },
              'domainSnapshots.0.minScore': -99,
              'metadata.b10PrivateSentinel': 'b10-private-metadata',
              qualityHints: {
                privateSentinel: 'b10-private-quality',
              },
            },
          },
        );
      }
    }
  }

  private async reportDocument(
    root: B10ScenarioRouteRoot,
    variant: Exclude<B10ReportVariant, 'none'>,
    actor: AuthenticatedUserContext,
  ): Promise<Record<string, unknown>> {
    const primaryIds =
      variant === 'different_scope_draft' && root.scaleInstanceIds.length > 1
        ? [root.scaleInstanceIds[0]]
        : root.scaleInstanceIds.slice(0, 1);
    const longContent = variant === 'long_pending_confirmation';
    const includedSourceIds = longContent ? root.scaleInstanceIds : primaryIds;
    const firstInstanceId = primaryIds[0] ?? new Types.ObjectId();
    const [scores, domains, evidence, items] = await Promise.all([
      this.models.scoreResults
        .find({ scaleInstanceId: { $in: includedSourceIds } })
        .sort({ _id: 1 })
        .exec(),
      this.models.cognitiveDomainResults
        .find({ scaleInstanceId: { $in: includedSourceIds } })
        .sort({ _id: 1 })
        .exec(),
      this.models.mediaEvidence
        .find({ scaleInstanceId: { $in: includedSourceIds } })
        .sort({ _id: 1 })
        .exec(),
      this.models.itemResponses
        .find({ scaleInstanceId: { $in: includedSourceIds } })
        .sort({ _id: 1 })
        .limit(1)
        .exec(),
    ]);
    const scoreIds = scores.map(({ _id }) => _id);
    const domainIds = domains.map(({ _id }) => _id);
    const evidenceIds = evidence.map(({ _id }) => _id);
    const confirmedAt = new Date(
      BASE_DATE.getTime() +
        root.ordinal * 240_000 +
        root.routeKey.length * 1000,
    );
    const confirmed = variant === 'confirmed_history';
    const pending =
      variant === 'pending_confirmation' ||
      variant === 'long_pending_confirmation';
    const voided = variant === 'voided';
    const incomplete = variant === 'incomplete';
    const generationNull = variant === 'generation_null';
    const blocker = variant === 'generation_conflict_blocker';
    const traces = (
      longContent ? root.scaleInstanceIds : [firstInstanceId]
    ).map((scaleInstanceId, index) => ({
      scaleInstanceId,
      scaleCode:
        index % 2 === 0
          ? root.scaleCode
          : root.scaleCode === 'mmse'
            ? 'moca'
            : 'mmse',
      scaleVersion: 'fixture-bound-version',
      crfVersion: 'fixture-crf-v1',
      scoringRuleVersion: 'fixture-score-v1',
      fieldEncodingVersion: 'fixture-field-v1',
      domainMappingVersion: A19_DOMAIN_MAPPING_VERSION,
      sourceDocument: 'B10 synthetic fixture source',
    }));
    const repeated = longContent
      ? '用于验证长文本换行与纵向可读性。'.repeat(24)
      : '';
    const metadata = generationNull
      ? null
      : {
          a20Generation: {
            version: 1,
            generationId: `b10-${this.namespace}-${sanitizeCode(
              root.scenarioKey,
            )}-${sanitizeCode(root.routeKey)}`,
            generatedAt: confirmedAt,
            generatedBy: actor.id,
            generatedByName: actor.displayName,
            generatedByRole: 'doctor',
            engineVersion: 'a20-rules-v1',
            reportScope: 'selected_scale_instances',
            primaryScaleInstanceIds: primaryIds.map((id) => id.toString()),
            scoreResultIds: scoreIds.map((id) => id.toString()),
            cognitiveDomainResultIds: domainIds.map((id) => id.toString()),
            mediaEvidenceCount: evidenceIds.length,
            aiUsed: false,
          },
          ...(pending
            ? {
                a21Submission: {
                  ...(longContent ? { version: 1 } : {}),
                  submissionId: `b10-${this.namespace}-submission`,
                  submittedAt: confirmedAt,
                  submittedBy: actor.id,
                  submittedByName: actor.displayName,
                  submittedByRole: 'doctor',
                  submissionNote: 'B10 synthetic workflow note',
                },
              }
            : {}),
        };
    return {
      patientId: root.patientId,
      assessmentVisitId: root.visitId,
      primaryScaleInstanceIds: primaryIds,
      scoreResultIds: scoreIds,
      cognitiveDomainResultIds: domainIds,
      mediaEvidenceIds: evidenceIds,
      subjectCode: root.subjectCode,
      reportCode: `B10-${
        this.profile === 'generation-workflow' ? 'G' : 'P'
      }-${sanitizeCode(this.namespace)}-${root.ordinal
        .toString()
        .padStart(2, '0')}-${sanitizeCode(root.routeKey)}`.toUpperCase(),
      reportNo: undefined,
      reportType: blocker ? 'follow_up' : 'cognitive_assessment',
      status: confirmed
        ? 'confirmed'
        : pending
          ? 'pending_confirmation'
          : voided
            ? 'voided'
            : 'draft',
      reportVersion: 1,
      source: pending || confirmed ? 'mixed' : 'system_draft',
      patientSnapshot:
        incomplete || variant === 'patient_snapshot_null'
          ? null
          : {
              subjectCode: root.subjectCode,
              displayName: 'B10 脱敏展示对象',
              sex: 'unknown',
              birthDate: null,
              educationYears: 10,
            },
      visitSnapshot: {
        visitCode: root.visitCode,
        visitType: 'follow_up',
        assessmentDate: confirmedAt,
        operatorName: 'B10 脱敏操作者',
        operatorRole: 'doctor',
        clinicalContext: null,
      },
      scaleTraces: traces,
      scoreSnapshots: [
        {
          scoreResultId: scoreIds[0] ?? null,
          scaleCode: root.scaleCode,
          scaleName: 'B10 人工构造量表快照',
          scaleVersion: 'fixture-bound-version',
          totalScoreValue: 7,
          totalMaxScore: 12,
          totalMinScore: 1,
          scorePercent: 58.25,
          scoreStatus: 'confirmed',
          qualityStatus: 'passed',
          summary: '仅为规则化测试摘要，不表达临床结论。',
          scoreDetails: null,
        },
        ...(variant === 'rich_draft' || longContent
          ? [
              {
                scoreResultId: null,
                scaleCode: root.scaleCode === 'mmse' ? 'moca' : 'mmse',
                scaleName: 'B10 空分值伴随快照',
                scaleVersion: 'fixture-companion-v1',
                totalScoreValue: null,
                totalMaxScore: null,
                totalMinScore: null,
                scorePercent: 41.75,
                scoreStatus: 'confirmed',
                qualityStatus: 'passed',
                summary: '服务端比例伴随项，前端不得补算分值。',
                scoreDetails: null,
              },
            ]
          : []),
      ],
      domainSnapshots: [
        {
          cognitiveDomainResultId: domainIds[0] ?? null,
          scaleCode: root.scaleCode,
          domainCode: 'synthetic_domain_a',
          domainTitle: '人工构造域甲',
          scoreValue: 4,
          maxScore: 6,
          scorePercent: 66.5,
          weightedScore: 4,
          weightedMaxScore: 6,
          itemCount: 2,
          needsReviewItemCount: 0,
          summary: '人工构造域摘要，不表达概率或诊断。',
        },
        {
          cognitiveDomainResultId: domainIds[0] ?? null,
          scaleCode: root.scaleCode,
          domainCode: 'synthetic_domain_b',
          domainTitle: '人工构造域乙',
          scoreValue: 3,
          maxScore: 5,
          scorePercent: 60,
          weightedScore: 3,
          weightedMaxScore: 5,
          itemCount: 2,
          needsReviewItemCount: 0,
          summary: '与域甲存在人工重叠，不得跨域求和。',
        },
      ],
      evidenceSnapshots: [
        {
          mediaEvidenceId: evidenceIds[0] ?? new Types.ObjectId(),
          itemResponseId: items[0]?._id ?? new Types.ObjectId(),
          scaleCode: root.scaleCode,
          itemCode: 'synthetic.item',
          itemTitle: '人工构造证据索引',
          evidenceType: 'photo',
          captureMode: 'photo_upload',
          storageObjectKey: 'b10-private-object-key-sentinel',
          qualityStatus: 'passed',
          summary: '仅说明存在人工构造索引，不提供预览或下载。',
        },
      ],
      narrative: {
        chiefSummary: `这是规则化系统草稿的人工测试概述。${repeated}`,
        scoreSummary: `评分段仅复述人工构造服务端快照。${repeated}`,
        domainSummary: `认知域段说明重叠且不可跨域求和。${repeated}`,
        evidenceSummary: `证据段只描述索引且未读取媒体内容。${repeated}`,
        limitations: `本数据无临床意义，不形成诊断、风险或治疗建议。${repeated}`,
        ...(pending || confirmed
          ? {
              doctorOpinion: 'B10 人工填写的流程测试意见，无临床含义。',
              recommendationText: 'B10 人工填写的流程测试建议，无临床含义。',
            }
          : {}),
      },
      aiDraft: { status: 'not_requested', doctorEdited: false },
      confirmation: confirmed
        ? {
            confirmedAt,
            confirmedBy: new Types.ObjectId(actor.id),
            confirmedByName: actor.displayName,
            confirmedByRole: 'doctor',
            confirmationNote: 'B10 synthetic historical confirmation',
          }
        : null,
      lockedAt: null,
      archivedAt: null,
      correctionRecords: [],
      voidedAt: voided ? confirmedAt : null,
      voidedBy: voided ? new Types.ObjectId(actor.id) : null,
      voidReason: voided ? 'B10 人工作废测试原因，无临床含义。' : undefined,
      auditLogRefs: [],
      qualityStatus: 'passed',
      qualityHints: null,
      operatorNote: 'b10-private-operator-note',
      metadata,
    };
  }

  private async applyRouteStates(
    root: B10ScenarioRouteRoot,
    contract: B10RoutePreparedContract,
  ): Promise<void> {
    const changedAt = new Date(
      BASE_DATE.getTime() +
        root.ordinal * 300_000 +
        root.routeKey.length * 1000,
    );
    if (contract.visitStatus !== 'in_progress') {
      await this.models.visits
        .updateOne(
          { _id: root.visitId },
          {
            $set: {
              status: contract.visitStatus,
              completedAt:
                contract.visitStatus === 'completed' ||
                contract.visitStatus === 'locked'
                  ? changedAt
                  : null,
              lockedAt: contract.visitStatus === 'locked' ? changedAt : null,
              voidedAt: contract.visitStatus === 'voided' ? changedAt : null,
            },
          },
        )
        .exec();
    }
  }

  private async requireScore(
    root: B10ScenarioRouteRoot,
    instanceId: Types.ObjectId,
  ): Promise<ScoreResultDocument> {
    const score = await this.models.scoreResults
      .findOne({ scaleInstanceId: instanceId, runNo: 1 })
      .exec();
    if (!score) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The required synthetic ScoreResult is missing',
      );
    }
    return score;
  }

  private domainResultCode(
    root: B10ScenarioRouteRoot,
    instanceId: Types.ObjectId,
  ): string {
    return `B10-${
      this.profile === 'generation-workflow' ? 'G' : 'P'
    }-${sanitizeCode(this.namespace)}-${root.ordinal
      .toString()
      .padStart(2, '0')}-${sanitizeCode(root.routeKey)}-${instanceId
      .toString()
      .slice(-4)}`.toUpperCase();
  }

  private async initialize(
    root: B10ScenarioRouteRoot,
    scaleCode: B10ScaleCode,
    instanceNo: number,
    actor: AuthenticatedUserContext,
  ): Promise<Types.ObjectId> {
    const materialized =
      await this.workflows.scaleCatalog.ensureSeedScaleVersionMaterialized(
        scaleCode,
      );
    const response =
      await this.workflows.assessmentExecution.createScaleExecutionFromSeed({
        patientId: root.patientId.toString(),
        assessmentVisitId: root.visitId.toString(),
        subjectCode: root.subjectCode,
        scaleDefinitionId: materialized.scaleDefinitionId,
        scaleVersionId: materialized.scaleVersionId,
        scaleCode: materialized.scaleCode,
        scaleVersion: materialized.version,
        instanceCode:
          `B10-${sanitizeCode(this.namespace)}-${root.visitId.toString()}-${scaleCode}-${instanceNo}`.toUpperCase(),
        instanceNo,
        administrationMode: 'clinician_administered',
        operatorSnapshot: {
          operatorId: actor.id,
          operatorName: actor.displayName,
          operatorRole: 'doctor',
        },
        startedAt: null,
        metadata: null,
      });
    return new Types.ObjectId(response.scaleInstance.id);
  }

  private createVisit(
    patientId: Types.ObjectId,
    subjectCode: string,
    visitCode: string,
    dayOffset: number,
    visitType: AssessmentVisitType = 'follow_up',
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
      notes: 'Synthetic B10 browser fixture Visit',
      metadata: null,
    });
  }
}
