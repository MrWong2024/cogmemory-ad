import { mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { AuthenticatedUserContext } from '../../../src/modules/auth/types/auth-user-context.type';
import type {
  AssessmentStatus,
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
import type { ScaleCatalogService } from '../../../src/modules/scales/services/scale-catalog.service';
import {
  B456_BUSINESS_SCENARIOS,
  B456FixtureError,
  scenarioSubjectCodeFor,
  scenarioVisitCodeFor,
  validateB456Namespace,
  type B456BusinessScenarioKey,
  type B456FileInputKey,
  type B456ScaleCode,
  type B456ScenarioDefinition,
} from './fixture-contract';

export type B456FixtureModels = {
  patients: Model<PatientDocument>;
  visits: Model<AssessmentVisitDocument>;
  scaleInstances: Model<ScaleInstanceDocument>;
  itemResponses: Model<ItemResponseDocument>;
  mediaEvidence: Model<MediaEvidenceDocument>;
};

export type B456FixtureWorkflows = {
  scaleCatalog: ScaleCatalogService;
  scaleWorkflow: AssessmentScaleWorkflowService;
  itemDraft: ItemResponseDraftService;
  mediaWorkflow: MediaEvidenceWorkflowService;
  submission: ScaleInstanceSubmissionService;
};

export type B456ScenarioRoot = {
  scenarioKey: B456BusinessScenarioKey;
  ordinal: number;
  patientId: Types.ObjectId;
  visitId: Types.ObjectId;
  scaleInstanceId: Types.ObjectId;
  subjectCode: string;
  visitCode: string;
  scaleCode: B456ScaleCode;
};

const BASE_DATE = new Date('2026-07-20T08:00:00.000Z');
const STALE_DATE = new Date('2020-01-01T00:00:00.000Z');
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const VALID_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==',
  'base64',
);
const VALID_WEBP = Buffer.from(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AA/vuUAAA=',
  'base64',
);
const VALID_TRAJECTORY = Buffer.from(
  JSON.stringify({
    strokes: [
      [
        { x: 12, y: 18, t: 0 },
        { x: 18, y: 24, t: 16 },
        { x: 24, y: 30, t: 32 },
      ],
    ],
  }),
);

function fixtureFailure(
  scenarioKey: B456BusinessScenarioKey,
  safeMessage: string,
): B456FixtureError {
  return new B456FixtureError(
    'B456_FIXTURE_SCENARIO_INVALID',
    safeMessage,
    scenarioKey,
  );
}

export function otherOwnerSubjectCodeFor(namespace: string): string {
  return `${scenarioSubjectCodeFor(namespace, 10)}-OTHER`;
}

export function ownedSubjectCodesFor(namespace: string): string[] {
  return [
    ...B456_BUSINESS_SCENARIOS.map(({ ordinal }) =>
      scenarioSubjectCodeFor(namespace, ordinal),
    ),
    otherOwnerSubjectCodeFor(namespace),
  ];
}

export function b456TempDirectoryFor(namespace: string): string {
  const validated = validateB456Namespace(namespace);
  const base = resolve(tmpdir(), 'cogmemory-b456-fixtures');
  const target = resolve(base, validated);
  if (!target.startsWith(`${base}\\`) && !target.startsWith(`${base}/`)) {
    throw new B456FixtureError(
      'B456_FIXTURE_TEMP_PATH_UNSAFE',
      'Temporary fixture path could not be resolved safely',
    );
  }
  return target;
}

export function b456FilePathsFor(
  namespace: string,
): Record<B456FileInputKey, string> {
  const directory = b456TempDirectoryFor(namespace);
  return {
    jpeg: join(directory, 'synthetic-photo.jpg'),
    png: join(directory, 'synthetic-scan.png'),
    webp: join(directory, 'synthetic-photo.webp'),
    oversized: join(directory, 'synthetic-oversized.png'),
    wrongMime: join(directory, 'synthetic-wrong-mime.txt'),
    invalidImage: join(directory, 'synthetic-invalid.png'),
    handwritingPng: join(directory, 'synthetic-handwriting.png'),
    trajectoryValid: join(directory, 'synthetic-trajectory.json'),
    trajectoryOversized: join(directory, 'synthetic-trajectory-oversized.json'),
  };
}

export async function createB456TemporaryFiles(
  namespace: string,
): Promise<Record<B456FileInputKey, string>> {
  const paths = b456FilePathsFor(namespace);
  await mkdir(b456TempDirectoryFor(namespace), { recursive: true });
  const oversizedTrajectory = Buffer.from(
    JSON.stringify({ strokes: [], padding: 'x'.repeat(2 * 1024 * 1024) }),
  );
  await Promise.all([
    writeFile(paths.jpeg, VALID_JPEG),
    writeFile(paths.png, VALID_PNG),
    writeFile(paths.webp, VALID_WEBP),
    writeFile(paths.oversized, Buffer.alloc(10 * 1024 * 1024 + 1)),
    writeFile(paths.wrongMime, VALID_PNG),
    writeFile(paths.invalidImage, Buffer.from('not-an-image')),
    writeFile(paths.handwritingPng, VALID_PNG),
    writeFile(paths.trajectoryValid, VALID_TRAJECTORY),
    writeFile(paths.trajectoryOversized, oversizedTrajectory),
  ]);
  return paths;
}

function toMemoryFile(
  fieldname: 'file' | 'trajectory',
  buffer: Buffer,
  mimetype: string,
): UploadedMemoryFile {
  return {
    fieldname,
    originalname: `synthetic-${fieldname}`,
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
  };
}

export class B456ScenarioBuilder {
  constructor(
    private readonly namespace: string,
    private readonly models: B456FixtureModels,
    private readonly workflows: B456FixtureWorkflows,
  ) {}

  async buildAll(actor: AuthenticatedUserContext): Promise<void> {
    await Promise.all([
      this.workflows.scaleCatalog.ensureSeedScaleVersionMaterialized('mmse'),
      this.workflows.scaleCatalog.ensureSeedScaleVersionMaterialized('moca'),
      createB456TemporaryFiles(this.namespace),
    ]);
    for (const definition of B456_BUSINESS_SCENARIOS) {
      const root = await this.createRoot(definition, actor);
      await this.configureScenario(root, actor);
    }
  }

  private async createRoot(
    definition: B456ScenarioDefinition,
    actor: AuthenticatedUserContext,
  ): Promise<B456ScenarioRoot> {
    const subjectCode = scenarioSubjectCodeFor(
      this.namespace,
      definition.ordinal,
    );
    const patient = await this.models.patients.create({
      subjectCode,
      displayName: `B4-B6 脱敏受试者 ${definition.ordinal}`,
      sourceType: definition.ordinal % 2 === 0 ? 'research' : 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: 9 + (definition.ordinal % 6),
      handedness: 'unknown',
      status: 'active',
      tags: ['batch-b', 'synthetic'],
      notes: 'Synthetic B4-B6 browser fixture only',
      externalRefs: null,
      metadata: null,
    });
    const visitCode = scenarioVisitCodeFor(this.namespace, definition.ordinal);
    const visit = await this.createVisit(
      patient._id,
      subjectCode,
      visitCode,
      'in_progress',
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
      visitCode,
      scaleCode: definition.scaleCode,
    };
  }

  private async configureScenario(
    root: B456ScenarioRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    switch (root.scenarioKey) {
      case 'scale_execution_load':
        await this.initialize(root.patientId, root.visitId, 'moca', actor);
        return;
      case 'scale_execution_input_types':
        await this.configureInputTypes(root);
        return;
      case 'scale_execution_error_matrix':
        await this.configureScaleErrorMatrix(root, actor);
        return;
      case 'media_requirement_matrix':
        await this.configureMediaRequirementMatrix(root, actor);
        return;
      case 'media_preview_url':
      case 'media_void_reupload':
      case 'media_read_only_matrix':
        await this.uploadFirstEligible(root, actor, 'photo');
        if (root.scenarioKey === 'media_read_only_matrix') {
          const item = await this.findEligibleItem(root, 'photo');
          await this.models.itemResponses
            .updateOne({ _id: item._id }, { $set: { status: 'scored' } })
            .exec();
        }
        return;
      case 'media_error_matrix':
        await this.models.patients
          .updateOne({ _id: root.patientId }, { $set: { status: 'inactive' } })
          .exec();
        return;
      case 'submission_readiness_matrix':
        await this.createReadyCompanion(root, actor);
        return;
      case 'submission_ready_confirm':
      case 'submission_idempotency_concurrency':
      case 'submission_network_final_state':
        await this.completeInstance(root, actor);
        return;
      case 'submission_post_submit_read_only':
        await this.completeInstance(root, actor);
        await this.workflows.submission.submitScaleInstance(
          root.patientId.toString(),
          root.visitId.toString(),
          root.scaleInstanceId.toString(),
          actor,
          { confirm: true },
        );
        return;
      case 'submission_authz_error_matrix':
        await this.models.patients
          .updateOne({ _id: root.patientId }, { $set: { status: 'inactive' } })
          .exec();
        return;
      default:
        return;
    }
  }

  private async configureInputTypes(root: B456ScenarioRoot): Promise<void> {
    const items = await this.itemsFor(root);
    const numberTarget = items.find((item) => item.responseType === 'text');
    const singleChoiceTarget = items.find(
      (item) =>
        item.responseType === 'multi_choice' &&
        item._id.toString() !== numberTarget?._id.toString(),
    );
    const textTarget = items.find(
      (item) =>
        item.responseType === 'multi_choice' &&
        item._id.toString() !== singleChoiceTarget?._id.toString(),
    );
    const answeredTarget = items.find(
      (item) => item.responseType === 'boolean',
    );
    if (
      !numberTarget ||
      !singleChoiceTarget ||
      !textTarget ||
      !answeredTarget
    ) {
      throw fixtureFailure(
        root.scenarioKey,
        'Input type fixture targets are missing',
      );
    }
    await Promise.all([
      this.models.itemResponses
        .updateOne(
          { _id: numberTarget._id },
          { $set: { responseType: 'number' } },
        )
        .exec(),
      this.models.itemResponses
        .updateOne(
          { _id: singleChoiceTarget._id },
          { $set: { responseType: 'single_choice' } },
        )
        .exec(),
      this.models.itemResponses
        .updateOne({ _id: textTarget._id }, { $set: { responseType: 'text' } })
        .exec(),
    ]);
    await this.workflows.itemDraft.saveDraft(
      root.patientId.toString(),
      root.visitId.toString(),
      root.scaleInstanceId.toString(),
      answeredTarget._id.toString(),
      {
        rawResponse: false,
        operatorNote: 'Synthetic non-scoring fixture response',
        markAsAnswered: true,
      },
    );
  }

  private async configureScaleErrorMatrix(
    root: B456ScenarioRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    const items = await this.itemsFor(root);
    for (const [index, status] of ['scored', 'locked', 'voided'].entries()) {
      const item = items[index];
      if (!item)
        throw fixtureFailure(
          root.scenarioKey,
          'Read-only item target is missing',
        );
      await this.models.itemResponses
        .updateOne(
          { _id: item._id },
          {
            $set: {
              status,
              ...(status === 'locked' ? { lockedAt: BASE_DATE } : {}),
              ...(status === 'voided' ? { voidedAt: BASE_DATE } : {}),
            },
          },
        )
        .exec();
    }
    const stale = items[3];
    if (stale) {
      await this.models.itemResponses.collection.updateOne(
        { _id: stale._id },
        { $set: { updatedAt: STALE_DATE } },
      );
    }
    for (const status of ['completed', 'locked', 'voided'] as const) {
      await this.createVisit(
        root.patientId,
        root.subjectCode,
        scenarioVisitCodeFor(
          this.namespace,
          root.ordinal,
          status.toUpperCase(),
        ),
        status,
        'follow_up',
        root.ordinal + status.length,
      );
    }
    const companionId = await this.initialize(
      root.patientId,
      root.visitId,
      'moca',
      actor,
    );
    await this.models.scaleInstances
      .updateOne(
        { _id: companionId },
        { $set: { status: 'locked', lockedAt: BASE_DATE } },
      )
      .exec();
    const voidedVisit = await this.createVisit(
      root.patientId,
      root.subjectCode,
      scenarioVisitCodeFor(this.namespace, root.ordinal, 'INSTANCE-VOIDED'),
      'in_progress',
      'follow_up',
      root.ordinal + 20,
    );
    const voidedInstance = await this.initialize(
      root.patientId,
      voidedVisit._id,
      'mmse',
      actor,
    );
    await this.models.scaleInstances
      .updateOne(
        { _id: voidedInstance },
        { $set: { status: 'voided', voidedAt: BASE_DATE } },
      )
      .exec();
    const foreignPatient = await this.models.patients.create({
      subjectCode: otherOwnerSubjectCodeFor(this.namespace),
      displayName: 'B4-B6 脱敏跨归属受试者',
      sourceType: 'research',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'active',
      tags: ['batch-b', 'synthetic'],
      notes: 'Synthetic ownership boundary',
      externalRefs: null,
      metadata: null,
    });
    const foreignVisit = await this.createVisit(
      foreignPatient._id,
      foreignPatient.subjectCode,
      scenarioVisitCodeFor(this.namespace, root.ordinal, 'OTHER'),
      'in_progress',
      'baseline',
      root.ordinal,
    );
    await this.initialize(foreignPatient._id, foreignVisit._id, 'mmse', actor);
  }

  private async configureMediaRequirementMatrix(
    root: B456ScenarioRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    const eligible = await this.eligibleItems(root, 'photo');
    if (eligible.length < 3) {
      throw fixtureFailure(
        root.scenarioKey,
        'Media lifecycle targets are incomplete',
      );
    }
    const attached = await this.uploadEvidence(
      root,
      eligible[0],
      actor,
      'photo',
    );
    const locked = await this.uploadEvidence(root, eligible[1], actor, 'photo');
    await this.models.mediaEvidence
      .updateOne(
        { _id: locked },
        { $set: { status: 'locked', lockedAt: BASE_DATE } },
      )
      .exec();
    const voided = await this.uploadEvidence(root, eligible[2], actor, 'photo');
    await this.workflows.mediaWorkflow.voidEvidence(
      {
        ...this.mediaParams(root, eligible[2]._id),
        mediaEvidenceId: voided.toString(),
      },
      { reason: 'Synthetic fixture lifecycle change' },
      actor,
    );
    const companionId = await this.initialize(
      root.patientId,
      root.visitId,
      'mmse',
      actor,
    );
    const companion: B456ScenarioRoot = {
      ...root,
      scaleInstanceId: companionId,
      scaleCode: 'mmse',
    };
    const pendingItem = await this.findEligibleItem(companion, 'photo');
    const pending = await this.uploadEvidence(
      companion,
      pendingItem,
      actor,
      'photo',
    );
    await Promise.all([
      this.models.mediaEvidence
        .updateOne(
          { _id: pending },
          { $set: { status: 'pending', storageStatus: 'pending' } },
        )
        .exec(),
      this.models.itemResponses
        .updateOne(
          { _id: pendingItem._id, 'evidenceRefs.evidenceType': 'photo' },
          {
            $set: {
              'evidenceRefs.$.status': 'pending',
              'evidenceRefs.$.mediaEvidenceId': null,
            },
          },
        )
        .exec(),
    ]);
    if (!attached) {
      throw fixtureFailure(
        root.scenarioKey,
        'Attached media target was not created',
      );
    }
  }

  private async createReadyCompanion(
    root: B456ScenarioRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    const visit = await this.createVisit(
      root.patientId,
      root.subjectCode,
      scenarioVisitCodeFor(this.namespace, root.ordinal, 'READY'),
      'in_progress',
      'follow_up',
      root.ordinal + 1,
    );
    const instanceId = await this.initialize(
      root.patientId,
      visit._id,
      'mmse',
      actor,
    );
    await this.completeInstance(
      {
        ...root,
        visitId: visit._id,
        visitCode: visit.visitCode,
        scaleInstanceId: instanceId,
      },
      actor,
    );
  }

  private async completeInstance(
    root: B456ScenarioRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    const items = await this.itemsFor(root);
    for (const item of items) {
      await this.workflows.itemDraft.saveDraft(
        root.patientId.toString(),
        root.visitId.toString(),
        root.scaleInstanceId.toString(),
        item._id.toString(),
        {
          rawResponse: false,
          operatorNote: 'Synthetic readiness fixture note',
          markAsAnswered: true,
        },
      );
      if (item.stepResults.length > 0) {
        await this.workflows.itemDraft.saveDraft(
          root.patientId.toString(),
          root.visitId.toString(),
          root.scaleInstanceId.toString(),
          item._id.toString(),
          {
            stepResponses: item.stepResults.map((step) => ({
              stepCode: step.stepCode,
              actualValue: 0,
            })),
          },
        );
      }
      if (item.itemConfigSnapshot?.supportsPhotoUpload === true) {
        await this.uploadEvidence(root, item, actor, 'photo');
      }
    }
  }

  private async uploadFirstEligible(
    root: B456ScenarioRoot,
    actor: AuthenticatedUserContext,
    type: 'photo' | 'handwriting',
  ): Promise<Types.ObjectId> {
    return this.uploadEvidence(
      root,
      await this.findEligibleItem(root, type),
      actor,
      type,
    );
  }

  private async uploadEvidence(
    root: B456ScenarioRoot,
    item: ItemResponseDocument,
    actor: AuthenticatedUserContext,
    type: 'photo' | 'handwriting',
  ): Promise<Types.ObjectId> {
    const response = await this.workflows.mediaWorkflow.uploadEvidence(
      this.mediaParams(root, item._id),
      type === 'photo'
        ? {
            evidenceType: 'photo',
            captureMode: 'photo_upload',
            imageWidth: 1,
            imageHeight: 1,
          }
        : {
            evidenceType: 'handwriting',
            captureMode: 'tablet_handwriting',
            trajectoryFormat: 'strokes',
            strokeCount: 1,
            canvasWidth: 1200,
            canvasHeight: 800,
            inputTool: 'mouse',
          },
      type === 'photo'
        ? { file: [toMemoryFile('file', VALID_PNG, 'image/png')] }
        : {
            file: [toMemoryFile('file', VALID_PNG, 'image/png')],
            trajectory: [
              toMemoryFile('trajectory', VALID_TRAJECTORY, 'application/json'),
            ],
          },
      actor,
    );
    return new Types.ObjectId(response.mediaEvidence.id);
  }

  private mediaParams(root: B456ScenarioRoot, itemResponseId: Types.ObjectId) {
    return {
      patientId: root.patientId.toString(),
      visitId: root.visitId.toString(),
      scaleInstanceId: root.scaleInstanceId.toString(),
      itemResponseId: itemResponseId.toString(),
    };
  }

  private async findEligibleItem(
    root: B456ScenarioRoot,
    type: 'photo' | 'handwriting',
  ): Promise<ItemResponseDocument> {
    const item = (await this.eligibleItems(root, type))[0];
    if (!item)
      throw fixtureFailure(
        root.scenarioKey,
        `Eligible ${type} target is missing`,
      );
    return item;
  }

  private async eligibleItems(
    root: B456ScenarioRoot,
    type: 'photo' | 'handwriting',
  ): Promise<ItemResponseDocument[]> {
    return (await this.itemsFor(root)).filter((item) =>
      item.evidenceRefs.some((reference) => reference.evidenceType === type),
    );
  }

  private async itemsFor(
    root: B456ScenarioRoot,
  ): Promise<ItemResponseDocument[]> {
    return this.models.itemResponses
      .find({ scaleInstanceId: root.scaleInstanceId })
      .sort({ itemOrder: 1 })
      .exec();
  }

  private async initialize(
    patientId: Types.ObjectId,
    visitId: Types.ObjectId,
    scaleCode: B456ScaleCode,
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
    status: AssessmentStatus,
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
      status,
      assessmentDate,
      startedAt: status === 'draft' ? null : assessmentDate,
      completedAt: ['completed', 'locked'].includes(status)
        ? assessmentDate
        : null,
      lockedAt: status === 'locked' ? assessmentDate : null,
      voidedAt: status === 'voided' ? assessmentDate : null,
      operatorSnapshot: null,
      clinicalContext: null,
      notes: 'Synthetic B4-B6 fixture Visit',
      metadata: null,
    });
  }
}
