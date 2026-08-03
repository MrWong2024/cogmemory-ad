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
import type { ScaleDefinitionDocument } from '../../../src/modules/scales/schemas/scale-definition.schema';
import type { ScaleVersionDocument } from '../../../src/modules/scales/schemas/scale-version.schema';
import type { ScaleCatalogService } from '../../../src/modules/scales/services/scale-catalog.service';
import type { ScalesService } from '../../../src/modules/scales/services/scales.service';
import type { ScoreResultDocument } from '../../../src/modules/scoring/schemas/score-result.schema';
import type { ProvisionalScoringWorkflowService } from '../../../src/modules/scoring/services/provisional-scoring-workflow.service';
import type { ScoreReviewWorkflowService } from '../../../src/modules/scoring/services/score-review-workflow.service';
import type { ScoringService } from '../../../src/modules/scoring/services/scoring.service';
import {
  B9FixtureError,
  conflictIndexNameFor,
  mappingUnavailableVersionFor,
  scenarioDefinitionsFor,
  scenarioSubjectCodeFor,
  scenarioVisitCodeFor,
  type B9BusinessScenarioKey,
  type B9Profile,
  type B9RoutePreparedContract,
  type B9ScaleCode,
  type B9ScenarioDefinition,
} from './fixture-contract';

export type B9FixtureModels = {
  patients: Model<PatientDocument>;
  visits: Model<AssessmentVisitDocument>;
  scaleInstances: Model<ScaleInstanceDocument>;
  itemResponses: Model<ItemResponseDocument>;
  mediaEvidence: Model<MediaEvidenceDocument>;
  scoreResults: Model<ScoreResultDocument>;
  cognitiveDomainResults: Model<CognitiveDomainResultDocument>;
  scaleDefinitions: Model<ScaleDefinitionDocument>;
  scaleVersions: Model<ScaleVersionDocument>;
};

export type B9FixtureWorkflows = {
  scaleCatalog: ScaleCatalogService;
  scaleWorkflow: AssessmentScaleWorkflowService;
  itemDraft: ItemResponseDraftService;
  mediaWorkflow: MediaEvidenceWorkflowService;
  submission: ScaleInstanceSubmissionService;
  provisionalScoring: ProvisionalScoringWorkflowService;
  scoreReview: ScoreReviewWorkflowService;
  scoring: ScoringService;
  scales: ScalesService;
  cognitiveDomains: CognitiveDomainsService;
};

export type B9ScenarioRouteRoot = {
  scenarioKey: B9BusinessScenarioKey;
  routeKey: string;
  ordinal: number;
  patientId: Types.ObjectId;
  visitId: Types.ObjectId;
  scaleInstanceId: Types.ObjectId;
  subjectCode: string;
  visitCode: string;
  scaleCode: B9ScaleCode;
};

const BASE_DATE = new Date('2026-07-25T08:00:00.000Z');
const MANUAL_REVIEW_NOTE = 'B9 synthetic manual review';
const CONFIRMATION_NOTE = 'B9 synthetic explicit confirmation';
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function fixtureFailure(
  profile: B9Profile,
  scenarioKey: B9BusinessScenarioKey,
  message: string,
): B9FixtureError {
  return new B9FixtureError(
    'B9_FIXTURE_SCENARIO_BUILD_FAILED',
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
    originalname: 'b9-synthetic-image.png',
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
  };
}

function sanitizeCode(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
}

export class B9ScenarioBuilder {
  constructor(
    private readonly profile: B9Profile,
    private readonly namespace: string,
    private readonly models: B9FixtureModels,
    private readonly workflows: B9FixtureWorkflows,
  ) {}

  async buildAll(actor: AuthenticatedUserContext): Promise<void> {
    await this.ensureScalesAvailable();
    for (const definition of scenarioDefinitionsFor(this.profile)) {
      await this.buildScenario(definition, actor);
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

  private async buildScenario(
    definition: B9ScenarioDefinition,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    const subjectCode = scenarioSubjectCodeFor(
      this.profile,
      this.namespace,
      definition.ordinal,
    );
    const patient = await this.models.patients.create({
      subjectCode,
      displayName: `B9 脱敏受试者 ${this.profile} ${definition.ordinal}`,
      sourceType: definition.ordinal % 2 === 0 ? 'research' : 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: 8 + (definition.ordinal % 6),
      handedness: 'unknown',
      status: 'active',
      tags: ['batch-c', 'b9', this.profile, 'synthetic'],
      notes: 'Synthetic B9 browser fixture only',
      externalRefs: null,
      metadata: null,
    });
    for (const routeContract of definition.routeContracts) {
      const visit = await this.createVisit(
        patient._id,
        subjectCode,
        scenarioVisitCodeFor(
          this.profile,
          this.namespace,
          definition.ordinal,
          routeContract.key,
        ),
        definition.ordinal + routeContract.key.length,
      );
      const scaleInstanceId = await this.initialize(
        patient._id,
        visit._id,
        definition.scaleCode,
        actor,
      );
      await this.configureRoute(
        {
          scenarioKey: definition.scenarioKey,
          routeKey: routeContract.key,
          ordinal: definition.ordinal,
          patientId: patient._id,
          visitId: visit._id,
          scaleInstanceId,
          subjectCode,
          visitCode: visit.visitCode,
          scaleCode: definition.scaleCode,
        },
        routeContract,
        actor,
      );
    }
  }

  private async configureRoute(
    root: B9ScenarioRouteRoot,
    contract: B9RoutePreparedContract,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    if (
      contract.localPrerequisite === 'answer-dirty-capable' ||
      contract.localPrerequisite === 'media-dirty-capable'
    ) {
      await this.assertLocalDraftTarget(root, contract.localPrerequisite);
      return;
    }

    if (contract.scoreResult.presence === 'absent') {
      await this.completeSubmitOnly(root, actor);
    } else {
      await this.completeSubmitAndCompute(root, actor);
      if (contract.scoreResult.status !== 'needs_review') {
        await this.resolveManualReviews(root, actor);
      }
      if (
        contract.scoreResult.status === 'confirmed' ||
        contract.scoreResult.status === 'locked' ||
        contract.scoreResult.status === 'voided'
      ) {
        await this.directConfirm(root, actor);
      }
    }

    if (root.scenarioKey === 'mapping_unavailable') {
      await this.bindMappingUnavailableVersion(root);
    }

    if (contract.cognitiveDomainResult.presence === 'required') {
      const resultStatus = contract.cognitiveDomainResult.status;
      if (resultStatus === 'absent' || resultStatus === 'conflict-resource') {
        throw fixtureFailure(
          this.profile,
          root.scenarioKey,
          'A required cognitive-domain result has an invalid status contract',
        );
      }
      if (contract.cognitiveDomainResult.structure === 'complete-rich') {
        await this.createRichDomainResult(root, {
          status: resultStatus,
          warning:
            root.scenarioKey === 'mapping_technical_summary' &&
            root.routeKey === 'base',
          privacy: root.scenarioKey === 'privacy_public_surface',
        });
      } else {
        await this.createDerivedDomainResult(root, resultStatus);
      }
    } else if (
      contract.cognitiveDomainResult.presence === 'conflict-resource-only'
    ) {
      await this.createConflictResources(root, actor);
    }

    if (
      contract.scaleInstanceStatus === 'locked' ||
      contract.scaleInstanceStatus === 'voided'
    ) {
      await this.applyHistoricalStatus(root, contract.scaleInstanceStatus);
    }
  }

  private async completeSubmitOnly(
    root: B9ScenarioRouteRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    await this.fillExecution(root, actor);
    await this.workflows.submission.submitScaleInstance(
      root.patientId.toString(),
      root.visitId.toString(),
      root.scaleInstanceId.toString(),
      actor,
      { confirm: true },
    );
  }

  private async completeSubmitAndCompute(
    root: B9ScenarioRouteRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    await this.completeSubmitOnly(root, actor);
    await this.workflows.provisionalScoring.computeScoreResult(
      root.patientId.toString(),
      root.visitId.toString(),
      root.scaleInstanceId.toString(),
      { confirm: true },
    );
  }

  private async fillExecution(
    root: B9ScenarioRouteRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    const items = await this.models.itemResponses
      .find({ scaleInstanceId: root.scaleInstanceId })
      .sort({ itemOrder: 1 })
      .exec();
    for (const item of items) {
      const saved = await this.workflows.itemDraft.saveDraft(
        root.patientId.toString(),
        root.visitId.toString(),
        root.scaleInstanceId.toString(),
        item._id.toString(),
        {
          expectedRevision: item.draftRevision,
          rawResponse: false,
          operatorNote: 'B9 synthetic supervised assessment note',
          markAsAnswered: true,
          ...(item.itemConfigSnapshot?.requiresTimer === true
            ? {
                timing: {
                  timerState: 'completed' as const,
                  startedAt: null,
                  lastResumedAt: null,
                  completedAt: null,
                  durationMs: 1200,
                  timerSource: 'manual' as const,
                },
              }
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
            expectedRevision: saved.itemResponse.draftRevision,
            stepResponses: item.stepResults.map((step, index) => ({
              stepCode: step.stepCode,
              actualValue: index % 2 === 0,
            })),
          },
        );
      }
      if (item.itemConfigSnapshot?.supportsPhotoUpload === true) {
        await this.uploadPhoto(root, item, actor);
      }
    }
  }

  private async resolveManualReviews(
    root: B9ScenarioRouteRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    let detail = await this.workflows.provisionalScoring.getLatestScoreResult(
      root.patientId.toString(),
      root.visitId.toString(),
      root.scaleInstanceId.toString(),
    );
    while (detail.reviewQueue.length > 0) {
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
    if (detail.scoreResult.status !== 'computed') {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The source score did not reach the computed confirmation-ready state',
      );
    }
  }

  private async directConfirm(
    root: B9ScenarioRouteRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    const score = await this.requireScore(root);
    if (score.status !== 'computed') {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'Only a computed synthetic score can receive the fixture confirmation fact',
      );
    }
    const confirmedAt = new Date(
      BASE_DATE.getTime() + root.ordinal * 60_000 + root.routeKey.length * 1000,
    );
    const metadata =
      score.metadata && typeof score.metadata === 'object'
        ? { ...score.metadata }
        : {};
    metadata.a18Confirmation = {
      confirmationId: `b9-${this.namespace}-${sanitizeCode(
        root.scenarioKey,
      )}-${sanitizeCode(root.routeKey)}`,
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
    root: B9ScenarioRouteRoot,
    status: 'draft' | 'computed' | 'locked' | 'voided',
  ): Promise<void> {
    const [source, version, instance] = await Promise.all([
      this.workflows.scoring.findScoreResultByScaleInstanceAndRunNo(
        root.scaleInstanceId.toString(),
        1,
      ),
      this.workflows.scales.findVersionByScaleCodeAndVersion(
        root.scaleCode,
        (
          await this.models.scaleInstances
            .findById(root.scaleInstanceId)
            .select({ scaleVersion: 1 })
            .lean<{ scaleVersion: string }>()
            .exec()
        )?.scaleVersion ?? '',
      ),
      this.models.scaleInstances.findById(root.scaleInstanceId).exec(),
    ]);
    if (!source || !version || !instance) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'A complete source and bound scale version are required for a derived result',
      );
    }
    const mapped = mapConfirmedScoreToDomainInputs(source, version);
    const summary = this.workflows.cognitiveDomains.summarizeDomainScores(
      mapped.items,
    );
    const computedAt = new Date(
      BASE_DATE.getTime() +
        root.ordinal * 120_000 +
        root.routeKey.length * 1000,
    );
    await this.models.cognitiveDomainResults.create({
      patientId: root.patientId,
      assessmentVisitId: root.visitId,
      scaleInstanceId: root.scaleInstanceId,
      scoreResultId: new Types.ObjectId(source.id),
      subjectCode: root.subjectCode,
      scaleDefinitionId: new Types.ObjectId(source.scaleDefinitionId),
      scaleVersionId: new Types.ObjectId(source.scaleVersionId),
      scaleCode: source.scaleCode,
      scaleVersion: source.scaleVersion,
      instanceCode: instance.instanceCode,
      domainResultCode: this.domainResultCode(root),
      runNo: 1,
      status,
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
      lockedAt: status === 'locked' ? computedAt : null,
      voidedAt: status === 'voided' ? computedAt : null,
      metadata: {
        b9Fixture: {
          profile: this.profile,
          namespace: this.namespace,
          scenarioKey: root.scenarioKey,
          routeKey: root.routeKey,
        },
      },
    });
  }

  private async createRichDomainResult(
    root: B9ScenarioRouteRoot,
    options: {
      status: 'draft' | 'computed' | 'locked' | 'voided';
      warning: boolean;
      privacy: boolean;
    },
  ): Promise<void> {
    const [score, instance, items] = await Promise.all([
      this.requireScore(root),
      this.models.scaleInstances.findById(root.scaleInstanceId).exec(),
      this.models.itemResponses
        .find({ scaleInstanceId: root.scaleInstanceId })
        .sort({ itemOrder: 1 })
        .limit(4)
        .exec(),
    ]);
    if (!instance || items.length < 3) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'A rich domain result requires at least three synthetic item records',
      );
    }
    const computedAt = new Date(
      BASE_DATE.getTime() +
        root.ordinal * 180_000 +
        root.routeKey.length * 1000,
    );
    const contributionRows = [
      {
        itemResponseId: items[0]._id,
        scoreResultId: score._id,
        itemCode: items[0].itemCode,
        crfCode: items[0].crfCode,
        groupCode: items[0].groupCode,
        itemTitle: items[0].itemTitle,
        itemOrder: items[0].itemOrder,
        domainCode: 'memory',
        domainTitle: '记忆',
        weight: 1,
        countsTowardDomain: true,
        scoreValue: 7,
        maxScore: 10,
        weightedScore: 7,
        weightedMaxScore: 10,
        scoreStatus: 'auto_scored' as const,
        scoreSource: 'auto_rule',
        isMissing: false,
      },
      {
        itemResponseId: items[1]._id,
        scoreResultId: score._id,
        itemCode: items[1].itemCode,
        crfCode: items[1].crfCode,
        groupCode: items[1].groupCode,
        itemTitle: items[1].itemTitle,
        itemOrder: items[1].itemOrder,
        domainCode: 'attention',
        domainTitle: '注意',
        weight: 1,
        countsTowardDomain: true,
        scoreValue: 2,
        maxScore: 3,
        weightedScore: 2,
        weightedMaxScore: 3,
        scoreStatus: 'manual_scored' as const,
        scoreSource: 'operator',
        isMissing: false,
      },
      {
        itemResponseId: items[1]._id,
        scoreResultId: score._id,
        itemCode: items[1].itemCode,
        crfCode: items[1].crfCode,
        groupCode: items[1].groupCode,
        itemTitle: items[1].itemTitle,
        itemOrder: items[1].itemOrder,
        domainCode: 'executive_function',
        domainTitle: '执行功能',
        weight: 1,
        countsTowardDomain: true,
        scoreValue: 2,
        maxScore: 4,
        weightedScore: 2,
        weightedMaxScore: 4,
        scoreStatus: 'manual_scored' as const,
        scoreSource: 'operator',
        isMissing: false,
      },
      {
        itemResponseId: items[2]._id,
        scoreResultId: score._id,
        itemCode: items[2].itemCode,
        crfCode: items[2].crfCode,
        groupCode: items[2].groupCode,
        itemTitle: items[2].itemTitle,
        itemOrder: items[2].itemOrder,
        domainCode: 'memory',
        domainTitle: '记忆',
        weight: 1,
        countsTowardDomain: false,
        scoreValue: null,
        maxScore: 2,
        weightedScore: null,
        weightedMaxScore: 2,
        scoreStatus: 'not_scored' as const,
        scoreSource: 'none',
        isMissing: false,
      },
      {
        itemResponseId: null,
        scoreResultId: score._id,
        itemCode: `${items[2].itemCode}-unlocatable`,
        crfCode: items[2].crfCode,
        groupCode: items[2].groupCode,
        itemTitle: '脱敏不可定位过程项',
        itemOrder: items[2].itemOrder + 100,
        domainCode: 'language',
        domainTitle: '语言',
        weight: 1,
        countsTowardDomain: true,
        scoreValue: null,
        maxScore: 5,
        weightedScore: null,
        weightedMaxScore: 5,
        scoreStatus: 'not_scored' as const,
        scoreSource: 'none',
        isMissing: true,
      },
    ];
    await this.models.cognitiveDomainResults.create({
      patientId: root.patientId,
      assessmentVisitId: root.visitId,
      scaleInstanceId: root.scaleInstanceId,
      scoreResultId: score._id,
      subjectCode: root.subjectCode,
      scaleDefinitionId: score.scaleDefinitionId,
      scaleVersionId: score.scaleVersionId,
      scaleCode: score.scaleCode,
      scaleVersion: score.scaleVersion,
      instanceCode: instance.instanceCode,
      domainResultCode: this.domainResultCode(root),
      runNo: 1,
      status: options.status,
      mappingSource: 'scale_config',
      mappingMode: 'item_domain_codes',
      versionTrace: {
        scaleVersion: score.scaleVersion,
        crfVersion: score.versionTrace?.crfVersion,
        scoringRuleVersion: score.versionTrace?.scoringRuleVersion,
        fieldEncodingVersion: score.versionTrace?.fieldEncodingVersion,
        domainMappingVersion: A19_DOMAIN_MAPPING_VERSION,
        sourceDocument: score.versionTrace?.sourceDocument,
      },
      domainScores: [
        {
          domainCode: 'memory',
          domainTitle: '记忆',
          scoreValue: 7,
          minScore: 2,
          maxScore: 10,
          scorePercent: 62.5,
          weightedScore: 7,
          weightedMaxScore: 10,
          itemCount: 2,
          scoredItemCount: 1,
          unscoredItemCount: 1,
          missingItemCount: 0,
          needsReviewItemCount: 0,
          excludedItemCount: 1,
        },
        {
          domainCode: 'language',
          domainTitle: '语言',
          scoreValue: null,
          minScore: 1,
          maxScore: 5,
          scorePercent: null,
          weightedScore: null,
          weightedMaxScore: 5,
          itemCount: 1,
          scoredItemCount: 0,
          unscoredItemCount: 1,
          missingItemCount: 1,
          needsReviewItemCount: 0,
          excludedItemCount: 0,
        },
        {
          domainCode: 'attention',
          domainTitle: '注意',
          scoreValue: 2,
          minScore: 1,
          maxScore: 3,
          scorePercent: 50,
          weightedScore: 2,
          weightedMaxScore: 3,
          itemCount: 1,
          scoredItemCount: 1,
          unscoredItemCount: 0,
          missingItemCount: 0,
          needsReviewItemCount: 0,
          excludedItemCount: 0,
        },
        {
          domainCode: 'executive_function',
          domainTitle: '执行功能',
          scoreValue: 2,
          minScore: 0,
          maxScore: 4,
          scorePercent: 50,
          weightedScore: 2,
          weightedMaxScore: 4,
          itemCount: 1,
          scoredItemCount: 1,
          unscoredItemCount: 0,
          missingItemCount: 0,
          needsReviewItemCount: 0,
          excludedItemCount: 0,
        },
      ],
      itemContributions: contributionRows,
      mappingSnapshot: {
        mappingVersion: A19_DOMAIN_MAPPING_VERSION,
        mappingSource: 'scale_config',
        domainCodes: ['memory', 'language', 'attention', 'executive_function'],
        mappingRules: {
          strategy: 'full_item_score_per_domain',
          weight: 1,
          deduplicatePerItem: true,
          overlappingDomains: true,
          internalFixtureSentinel: options.privacy
            ? 'b9-private-mapping-sentinel'
            : undefined,
        },
        notes: 'Synthetic B9 mapping snapshot',
      },
      computation: {
        computedAt,
        computedBy: options.privacy ? score.computation?.computedBy : null,
        ruleSetCode: 'item-domain-codes',
        ruleSetVersion: A19_DOMAIN_MAPPING_VERSION,
        engineVersion: A19_COGNITIVE_DOMAIN_ENGINE_VERSION,
        inputItemCount: 4,
        contributionCount: 5,
        domainCount: 4,
        includedContributionCount: 4,
        excludedContributionCount: 1,
        warningCount: options.warning ? 1 : 0,
        notes: options.warning
          ? 'warning_codes=COGNITIVE_DOMAIN_COMPUTATION_WARNING'
          : undefined,
      },
      review: {
        reviewStatus: 'not_required',
        reviewNote: options.privacy ? 'b9-private-review-sentinel' : undefined,
      },
      qualityStatus: 'unchecked',
      qualityHints: options.privacy ? { b9PrivateQualitySentinel: true } : null,
      operatorNote: options.privacy
        ? 'b9-private-operator-sentinel'
        : undefined,
      metadata: {
        b9Fixture: {
          profile: this.profile,
          namespace: this.namespace,
          scenarioKey: root.scenarioKey,
          routeKey: root.routeKey,
        },
        ...(options.privacy
          ? {
              b9PrivateMetadataSentinel: 'b9-private-metadata-sentinel',
            }
          : {}),
      },
      confirmedAt: null,
      lockedAt: options.status === 'locked' ? computedAt : null,
      voidedAt: options.status === 'voided' ? computedAt : null,
    });
    if (options.privacy) {
      await this.models.scoreResults.collection.updateOne(
        { _id: score._id },
        {
          $set: {
            'metadata.b9PrivateScoreSentinel': 'b9-private-score-sentinel',
            'itemScores.0.internalExpectedValue': 'b9-private-answer-sentinel',
            'itemScores.0.internalScoringRule': 'b9-private-rule-sentinel',
          },
        },
      );
    }
  }

  private async createConflictResources(
    root: B9ScenarioRouteRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    const [score, instance] = await Promise.all([
      this.requireScore(root),
      this.models.scaleInstances.findById(root.scaleInstanceId).exec(),
    ]);
    if (!instance) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The compute-conflict instance is missing',
      );
    }
    await this.models.cognitiveDomainResults.create({
      patientId: root.patientId,
      assessmentVisitId: root.visitId,
      scaleInstanceId: root.scaleInstanceId,
      scoreResultId: score._id,
      subjectCode: root.subjectCode,
      scaleDefinitionId: score.scaleDefinitionId,
      scaleVersionId: score.scaleVersionId,
      scaleCode: score.scaleCode,
      scaleVersion: score.scaleVersion,
      instanceCode: instance.instanceCode,
      domainResultCode: `${this.domainResultCode(root)}-CONFLICT`,
      runNo: 0,
      status: 'draft',
      mappingSource: 'scale_config',
      mappingMode: 'item_domain_codes',
      versionTrace: {
        scaleVersion: score.scaleVersion,
        domainMappingVersion: A19_DOMAIN_MAPPING_VERSION,
      },
      domainScores: [],
      itemContributions: [],
      mappingSnapshot: {
        mappingVersion: A19_DOMAIN_MAPPING_VERSION,
        mappingSource: 'scale_config',
        domainCodes: [],
        mappingRules: null,
      },
      computation: {
        computedAt: null,
        computedBy: new Types.ObjectId(actor.id),
        inputItemCount: 0,
        contributionCount: 0,
        domainCount: 0,
        includedContributionCount: 0,
        excludedContributionCount: 0,
        warningCount: 0,
      },
      review: { reviewStatus: 'not_required' },
      qualityStatus: 'unchecked',
      metadata: {
        b9FixtureConflictResource: {
          profile: this.profile,
          namespace: this.namespace,
        },
      },
    });
    await this.models.cognitiveDomainResults.collection.createIndex(
      { scaleInstanceId: 1 },
      {
        name: conflictIndexNameFor(this.namespace),
        unique: true,
        partialFilterExpression: { subjectCode: root.subjectCode },
      },
    );
  }

  private async bindMappingUnavailableVersion(
    root: B9ScenarioRouteRoot,
  ): Promise<void> {
    const [instance, sourceVersion, score] = await Promise.all([
      this.models.scaleInstances.findById(root.scaleInstanceId).exec(),
      this.models.scaleVersions.findOne({
        scaleCode: root.scaleCode,
        version: (
          await this.models.scaleInstances
            .findById(root.scaleInstanceId)
            .select({ scaleVersion: 1 })
            .lean<{ scaleVersion: string }>()
            .exec()
        )?.scaleVersion,
      }),
      this.requireScore(root),
    ]);
    if (!instance || !sourceVersion) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The mapping-unavailable route lacks its source version',
      );
    }
    const raw = sourceVersion.toObject();
    const versionName = mappingUnavailableVersionFor(this.namespace);
    const clone = await this.models.scaleVersions.create({
      scaleDefinitionId: raw.scaleDefinitionId,
      scaleCode: raw.scaleCode,
      version: versionName,
      displayVersion: 'B9 synthetic mapping unavailable',
      crfVersion: raw.crfVersion,
      scoringRuleVersion: raw.scoringRuleVersion,
      fieldEncodingVersion: raw.fieldEncodingVersion,
      sourceDocument: 'B9 synthetic namespace-owned mapping fixture',
      status: 'draft',
      totalScoreRange: raw.totalScoreRange,
      groups: raw.groups.map((group) => ({
        ...group,
        cognitiveDomainCodes: [],
      })),
      items: raw.items.map((item) => ({
        ...item,
        cognitiveDomainCodes: [],
      })),
      qualityControlRules: raw.qualityControlRules,
      reportingRules: raw.reportingRules,
      researchExportMappings: raw.researchExportMappings,
      effectiveFrom: raw.effectiveFrom,
      retiredAt: raw.retiredAt,
    });
    await Promise.all([
      this.models.scaleInstances
        .updateOne(
          { _id: instance._id },
          {
            $set: {
              scaleVersionId: clone._id,
              scaleVersion: versionName,
              'versionTrace.scaleVersion': versionName,
              'versionTrace.sourceDocument': clone.sourceDocument,
            },
          },
        )
        .exec(),
      this.models.itemResponses
        .updateMany(
          { scaleInstanceId: instance._id },
          {
            $set: {
              scaleVersionId: clone._id,
              scaleVersion: versionName,
              'versionTrace.scaleVersion': versionName,
              'versionTrace.sourceDocument': clone.sourceDocument,
              'itemConfigSnapshot.cognitiveDomainCodes': [],
            },
          },
        )
        .exec(),
      this.models.scoreResults
        .updateOne(
          { _id: score._id },
          {
            $set: {
              scaleVersionId: clone._id,
              scaleVersion: versionName,
              'versionTrace.scaleVersion': versionName,
              'versionTrace.sourceDocument': clone.sourceDocument,
              'itemScores.$[].cognitiveDomainCodes': [],
            },
          },
        )
        .exec(),
    ]);
  }

  private async applyHistoricalStatus(
    root: B9ScenarioRouteRoot,
    status: 'locked' | 'voided',
  ): Promise<void> {
    const changedAt = new Date(
      BASE_DATE.getTime() +
        root.ordinal * 240_000 +
        root.routeKey.length * 1000,
    );
    const dateField = status === 'locked' ? 'lockedAt' : 'voidedAt';
    await Promise.all([
      this.models.visits
        .updateOne(
          { _id: root.visitId },
          {
            $set: {
              status: 'completed',
              completedAt: changedAt,
            },
          },
        )
        .exec(),
      this.models.scaleInstances
        .updateOne(
          { _id: root.scaleInstanceId },
          { $set: { status, [dateField]: changedAt } },
        )
        .exec(),
      this.models.scoreResults
        .updateOne(
          { scaleInstanceId: root.scaleInstanceId },
          { $set: { status, [dateField]: changedAt } },
        )
        .exec(),
      this.models.cognitiveDomainResults
        .updateMany(
          { scaleInstanceId: root.scaleInstanceId, runNo: 1 },
          { $set: { status, [dateField]: changedAt } },
        )
        .exec(),
    ]);
  }

  private async assertLocalDraftTarget(
    root: B9ScenarioRouteRoot,
    prerequisite: 'answer-dirty-capable' | 'media-dirty-capable',
  ): Promise<void> {
    const items = await this.models.itemResponses
      .find({ scaleInstanceId: root.scaleInstanceId })
      .exec();
    const valid =
      prerequisite === 'answer-dirty-capable'
        ? items.some(
            (item) =>
              ['not_started', 'in_progress', 'answered'].includes(
                item.status,
              ) && item.lockedAt === null,
          )
        : items.some(
            (item) =>
              item.lockedAt === null &&
              (item.itemConfigSnapshot?.supportsPhotoUpload === true ||
                item.itemConfigSnapshot?.supportsHandwriting === true),
          );
    if (!valid) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The local-write route does not expose its legal product prerequisite',
      );
    }
  }

  private async requireScore(
    root: B9ScenarioRouteRoot,
  ): Promise<ScoreResultDocument> {
    const score = await this.models.scoreResults
      .findOne({ scaleInstanceId: root.scaleInstanceId, runNo: 1 })
      .exec();
    if (!score) {
      throw fixtureFailure(
        this.profile,
        root.scenarioKey,
        'The required source ScoreResult is missing',
      );
    }
    return score;
  }

  private domainResultCode(root: B9ScenarioRouteRoot): string {
    return `B9-${this.profile === 'core-workflow' ? 'C' : 'R'}-${sanitizeCode(
      this.namespace,
    )}-${root.ordinal.toString().padStart(2, '0')}-${sanitizeCode(
      root.routeKey,
    )}`.toUpperCase();
  }

  private async uploadPhoto(
    root: B9ScenarioRouteRoot,
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
    scaleCode: B9ScaleCode,
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
      notes: 'Synthetic B9 browser fixture Visit',
      metadata: null,
    });
  }
}
