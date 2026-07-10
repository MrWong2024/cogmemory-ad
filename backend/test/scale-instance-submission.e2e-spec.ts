import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model } from 'mongoose';
import request, { type Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import {
  AssessmentVisit,
  AssessmentVisitDocument,
} from '../src/modules/assessments/schemas/assessment-visit.schema';
import {
  ItemResponse,
  ItemResponseDocument,
} from '../src/modules/assessments/schemas/item-response.schema';
import {
  ScaleInstance,
  ScaleInstanceDocument,
} from '../src/modules/assessments/schemas/scale-instance.schema';
import {
  Session,
  SessionDocument,
} from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
import {
  MediaEvidence,
  MediaEvidenceDocument,
} from '../src/modules/media/schemas/media-evidence.schema';
import {
  Patient,
  PatientDocument,
} from '../src/modules/patients/schemas/patient.schema';
import {
  ScaleDefinition,
  ScaleDefinitionDocument,
} from '../src/modules/scales/schemas/scale-definition.schema';
import {
  ScaleVersion,
  ScaleVersionDocument,
} from '../src/modules/scales/schemas/scale-version.schema';
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';

jest.setTimeout(30000);

const DOCTOR_ACCOUNT = 'doctor-a16-test';
const SYSTEM_ACCOUNT = 'system-a16-test';
const PASSWORD = 'A16-Test-Password!';
const SUBJECT_PREFIX = 'SUBJ-A16-TEST-';
const VISIT_PREFIX = 'VISIT-A16-TEST-';
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

type SupertestApp = Parameters<typeof request.agent>[0];
type Fixture = { patientId: string; visitId: string; scaleInstanceId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function body(response: Response): Record<string, unknown> {
  if (!isRecord(response.body)) {
    throw new Error('Expected object response body');
  }
  return response.body;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${label} to be an object`);
  }
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Expected ${label} to be a string`);
  }
  return value;
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an array`);
  }
  return value;
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectKeys(entry, keys));
  } else if (isRecord(value)) {
    Object.entries(value).forEach(([key, nested]) => {
      keys.add(key);
      collectKeys(nested, keys);
    });
  }
  return keys;
}

describe('scale instance submission APIs (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let authService: AuthService;
  let userModel: Model<UserDocument>;
  let sessionModel: Model<SessionDocument>;
  let patientModel: Model<PatientDocument>;
  let visitModel: Model<AssessmentVisitDocument>;
  let instanceModel: Model<ScaleInstanceDocument>;
  let itemModel: Model<ItemResponseDocument>;
  let mediaModel: Model<MediaEvidenceDocument>;
  let definitionModel: Model<ScaleDefinitionDocument>;
  let versionModel: Model<ScaleVersionDocument>;
  let doctorAgent: ReturnType<typeof request.agent>;
  let systemAgent: ReturnType<typeof request.agent>;
  let server: SupertestApp;
  let modelsReady = false;

  function instancePath(fixture: Fixture): string {
    return `/patients/${fixture.patientId}/visits/${fixture.visitId}/scale-instances/${fixture.scaleInstanceId}`;
  }

  function readinessPath(fixture: Fixture): string {
    return `${instancePath(fixture)}/submission-readiness`;
  }

  function submitPath(fixture: Fixture): string {
    return `${instancePath(fixture)}/submit`;
  }

  async function cleanup(): Promise<void> {
    const users = await userModel
      .find({ accountName: { $in: [DOCTOR_ACCOUNT, SYSTEM_ACCOUNT] } })
      .select({ _id: 1 })
      .exec();
    const userIds = users.map((user) => user._id);
    if (userIds.length > 0) {
      await sessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    }

    const visits = await visitModel
      .find({ visitCode: /^VISIT-A16-TEST-/ })
      .select({ _id: 1 })
      .exec();
    const visitIds = visits.map((visit) => visit._id);
    const instances =
      visitIds.length > 0
        ? await instanceModel
            .find({ assessmentVisitId: { $in: visitIds } })
            .select({ _id: 1 })
            .exec()
        : [];
    const instanceIds = instances.map((instance) => instance._id);
    if (instanceIds.length > 0) {
      await mediaModel
        .deleteMany({ scaleInstanceId: { $in: instanceIds } })
        .exec();
      await itemModel
        .deleteMany({ scaleInstanceId: { $in: instanceIds } })
        .exec();
      await instanceModel.deleteMany({ _id: { $in: instanceIds } }).exec();
    }
    if (visitIds.length > 0) {
      await visitModel.deleteMany({ _id: { $in: visitIds } }).exec();
    }
    await patientModel.deleteMany({ subjectCode: /^SUBJ-A16-TEST-/ }).exec();
    await userModel
      .deleteMany({ accountName: { $in: [DOCTOR_ACCOUNT, SYSTEM_ACCOUNT] } })
      .exec();

    const definitions = await definitionModel
      .find({ code: 'mmse' })
      .select({ _id: 1 })
      .exec();
    const definitionIds = definitions.map((definition) => definition._id);
    if (definitionIds.length > 0) {
      await versionModel
        .deleteMany({ scaleDefinitionId: { $in: definitionIds } })
        .exec();
      await definitionModel.deleteMany({ _id: { $in: definitionIds } }).exec();
    }
  }

  async function createFixture(suffix: string): Promise<Fixture> {
    const patientResponse = await doctorAgent
      .post('/patients')
      .send({ subjectCode: `${SUBJECT_PREFIX}${suffix}` })
      .expect(201);
    const patientId = stringValue(body(patientResponse).id, 'patient id');
    const visitResponse = await doctorAgent
      .post(`/patients/${patientId}/visits`)
      .send({
        visitCode: `${VISIT_PREFIX}${suffix}`,
        assessmentDate: '2026-07-01T08:00:00.000Z',
      })
      .expect(201);
    const visitId = stringValue(body(visitResponse).id, 'visit id');
    const instanceResponse = await doctorAgent
      .post(`/patients/${patientId}/visits/${visitId}/scale-instances`)
      .send({ scaleCode: 'mmse' })
      .expect(201);
    const scaleInstance = record(
      body(instanceResponse).scaleInstance,
      'scale instance',
    );
    return {
      patientId,
      visitId,
      scaleInstanceId: stringValue(scaleInstance.id, 'scale instance id'),
    };
  }

  async function completeMmseThroughExistingApis(fixture: Fixture) {
    const detailResponse = await doctorAgent
      .get(instancePath(fixture))
      .expect(200);
    const itemResponses = arrayValue(
      body(detailResponse).itemResponses,
      'item responses',
    );
    let drawingItemId = '';
    const mediaItemIds: string[] = [];

    for (const value of itemResponses) {
      const item = record(value, 'item response');
      const itemId = stringValue(item.id, 'item response id');
      const itemCode = stringValue(item.itemCode, 'item code');
      const stepResponses = arrayValue(
        item.stepResponses,
        'step responses',
      ).map((stepValue) => {
        const step = record(stepValue, 'step response');
        return {
          stepCode: stringValue(step.stepCode, 'step code'),
          actualValue: 0,
        };
      });
      const itemPath = `${instancePath(fixture)}/item-responses/${itemId}`;
      if (stepResponses.length > 0) {
        await doctorAgent
          .patch(itemPath)
          .send({
            rawResponse: false,
            operatorNote: 'A16 de-identified operator note',
            markAsAnswered: true,
          })
          .expect(200);
        const stepReadiness = body(
          await doctorAgent.get(readinessPath(fixture)).expect(200),
        );
        expect(
          arrayValue(stepReadiness.blockingIssues, 'blocking issues').some(
            (issue) =>
              isRecord(issue) && issue.code === 'ITEM_REQUIRED_STEP_MISSING',
          ),
        ).toBe(true);
        await doctorAgent.patch(itemPath).send({ stepResponses }).expect(200);
      } else {
        await doctorAgent
          .patch(itemPath)
          .send({
            rawResponse: false,
            operatorNote: 'A16 de-identified operator note',
            markAsAnswered: true,
          })
          .expect(200);
      }
      if (itemCode === 'mmse.visuospatial.copy_drawing') {
        drawingItemId = itemId;
      }
      const config = record(item.config, 'item config');
      if (config.supportsPhotoUpload === true) {
        mediaItemIds.push(itemId);
      }
    }

    if (!drawingItemId) {
      throw new Error('Expected MMSE drawing item');
    }
    const mediaReadiness = body(
      await doctorAgent.get(readinessPath(fixture)).expect(200),
    );
    const mediaIssue = arrayValue(
      mediaReadiness.blockingIssues,
      'blocking issues',
    ).find(
      (issue) =>
        isRecord(issue) && issue.code === 'ITEM_REQUIRED_MEDIA_MISSING',
    );
    expect(mediaIssue).toBeDefined();
    if (isRecord(mediaIssue)) {
      expect(mediaIssue.requiredEvidenceMode).toBe('one_of');
      expect(mediaIssue.requiredEvidenceTypes).toEqual([
        'photo',
        'handwriting',
      ]);
    }
    let drawingMediaEvidenceId = '';
    for (const itemId of mediaItemIds) {
      const mediaResponse = await doctorAgent
        .post(
          `${instancePath(fixture)}/item-responses/${itemId}/media-evidences`,
        )
        .field('evidenceType', 'photo')
        .field('captureMode', 'photo_upload')
        .field('imageWidth', '1')
        .field('imageHeight', '1')
        .field('isColor', 'false')
        .attach('file', VALID_PNG, {
          filename: 'a16-test.png',
          contentType: 'image/png',
        })
        .expect(201);
      if (itemId === drawingItemId) {
        const mediaEvidence = record(
          body(mediaResponse).mediaEvidence,
          'media evidence',
        );
        drawingMediaEvidenceId = stringValue(
          mediaEvidence.id,
          'media evidence id',
        );
      }
    }
    if (!drawingMediaEvidenceId) {
      throw new Error('Expected drawing media evidence');
    }
    return {
      drawingItemId,
      mediaEvidenceId: drawingMediaEvidenceId,
    };
  }

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('E2E requires NODE_ENV=test');
    }
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    connection = app.get<Connection>(getConnectionToken());
    const databaseName = connection.name.toLowerCase();
    if (
      !databaseName.includes('_test') ||
      databaseName.includes('_dev') ||
      databaseName.includes('_prod')
    ) {
      throw new Error('E2E database isolation is not active');
    }
    const config = app.get(ConfigService);
    if (
      config.get<string>('app.env') !== 'test' ||
      config.get<string>('storage.driver') !== 'fake' ||
      config.get<string>('llm.provider') !== 'stub' ||
      config.get<string>('smsAuth.provider') !== 'stub'
    ) {
      throw new Error('E2E external service isolation is not active');
    }

    authService = app.get(AuthService);
    userModel = app.get(getModelToken(User.name));
    sessionModel = app.get(getModelToken(Session.name));
    patientModel = app.get(getModelToken(Patient.name));
    visitModel = app.get(getModelToken(AssessmentVisit.name));
    instanceModel = app.get(getModelToken(ScaleInstance.name));
    itemModel = app.get(getModelToken(ItemResponse.name));
    mediaModel = app.get(getModelToken(MediaEvidence.name));
    definitionModel = app.get(getModelToken(ScaleDefinition.name));
    versionModel = app.get(getModelToken(ScaleVersion.name));
    modelsReady = true;
    await cleanup();

    const passwordHash = await authService.hashPassword(PASSWORD);
    await userModel.create({
      accountName: DOCTOR_ACCOUNT,
      displayName: 'A16 Doctor Test Operator',
      staffCode: 'STAFF-A16-TEST',
      email: 'doctor-a16-test@example.test',
      passwordHash,
      roles: ['doctor'],
      permissions: [],
      userType: 'doctor',
      status: 'active',
      metadata: null,
    });
    await userModel.create({
      accountName: SYSTEM_ACCOUNT,
      displayName: 'A16 System Test Operator',
      staffCode: 'SYSTEM-A16-TEST',
      email: 'system-a16-test@example.test',
      passwordHash,
      roles: ['system'],
      permissions: [],
      userType: 'system',
      status: 'active',
      metadata: null,
    });

    server = app.getHttpServer() as SupertestApp;
    doctorAgent = request.agent(server);
    systemAgent = request.agent(server);
    await doctorAgent
      .post('/auth/login')
      .send({ accountName: DOCTOR_ACCOUNT, password: PASSWORD })
      .expect(201);
    await systemAgent
      .post('/auth/login')
      .send({ accountName: SYSTEM_ACCOUNT, password: PASSWORD })
      .expect(201);
  });

  afterAll(async () => {
    if (app) {
      if (modelsReady) {
        await cleanup();
      }
      await app.close();
    }
  });

  it('enforces authentication, roles, confirmation and incomplete readiness', async () => {
    const placeholder = {
      patientId: '507f1f77bcf86cd799439011',
      visitId: '507f1f77bcf86cd799439012',
      scaleInstanceId: '507f1f77bcf86cd799439013',
    };
    await request(server).get(readinessPath(placeholder)).expect(401);
    await systemAgent.get(readinessPath(placeholder)).expect(403);

    const fixture = await createFixture('INCOMPLETE');
    const readinessResponse = await doctorAgent
      .get(readinessPath(fixture))
      .expect(200);
    const readiness = body(readinessResponse);
    expect(readiness.ready).toBe(false);
    expect(readiness.canSubmitNow).toBe(false);
    expect(
      arrayValue(readiness.blockingIssues, 'blocking issues').some(
        (issue) => isRecord(issue) && issue.code === 'ITEM_NOT_COMPLETED',
      ),
    ).toBe(true);
    const keys = collectKeys(readiness);
    for (const forbidden of [
      'rawResponse',
      'structuredResponse',
      'responseText',
      'expectedValue',
      'scoringRule',
      'score',
      'isCorrect',
      'scoreValue',
      'mediaEvidenceId',
      'metadata',
    ]) {
      expect(keys.has(forbidden)).toBe(false);
    }

    const detail = body(
      await doctorAgent.get(instancePath(fixture)).expect(200),
    );
    const firstItem = record(
      arrayValue(detail.itemResponses, 'item responses')[0],
      'first item',
    );
    const firstItemPath = `${instancePath(fixture)}/item-responses/${stringValue(
      firstItem.id,
      'first item id',
    )}`;
    const missingReasonRequired = await doctorAgent
      .patch(firstItemPath)
      .send({ isMissing: true, markAsAnswered: true })
      .expect(400);
    expect(body(missingReasonRequired).code).toBe(
      'ITEM_RESPONSE_MISSING_REASON_REQUIRED',
    );
    await doctorAgent
      .patch(firstItemPath)
      .send({
        isMissing: true,
        missingReason: 'A16 de-identified missing reason',
        markAsAnswered: true,
      })
      .expect(200);

    const missing = await doctorAgent
      .post(submitPath(fixture))
      .send({})
      .expect(400);
    expect(body(missing).code).toBe(
      'SCALE_INSTANCE_SUBMISSION_CONFIRMATION_REQUIRED',
    );
    const rejected = await doctorAgent
      .post(submitPath(fixture))
      .send({ confirm: false })
      .expect(400);
    expect(body(rejected).code).toBe(
      'SCALE_INSTANCE_SUBMISSION_CONFIRMATION_REQUIRED',
    );
    const incomplete = await doctorAgent
      .post(submitPath(fixture))
      .send({ confirm: true })
      .expect(409);
    expect(body(incomplete).code).toBe('SCALE_INSTANCE_NOT_READY');
    await doctorAgent
      .post(submitPath(fixture))
      .send({ confirm: true, force: true })
      .expect(400);

    const other = await createFixture('OWNERSHIP');
    const crossPath = `/patients/${fixture.patientId}/visits/${fixture.visitId}/scale-instances/${other.scaleInstanceId}/submission-readiness`;
    expect(body(await doctorAgent.get(crossPath).expect(404)).code).toBe(
      'SCALE_INSTANCE_NOT_FOUND',
    );
  });

  it('completes through A14/A15, freezes edits and repeats idempotently', async () => {
    const fixture = await createFixture('SUCCESS');
    const { drawingItemId, mediaEvidenceId } =
      await completeMmseThroughExistingApis(fixture);
    const beforeVisit = await visitModel
      .findById(fixture.visitId)
      .lean()
      .exec();
    const beforeInstance = await instanceModel
      .findById(fixture.scaleInstanceId)
      .lean()
      .exec();
    const beforeItems = await itemModel
      .find({ scaleInstanceId: fixture.scaleInstanceId })
      .sort({ itemOrder: 1 })
      .lean()
      .exec();

    const readyResponse = await doctorAgent
      .get(readinessPath(fixture))
      .expect(200);
    expect(body(readyResponse)).toEqual(
      expect.objectContaining({ ready: true, canSubmitNow: true }),
    );

    const firstResponse = await doctorAgent
      .post(submitPath(fixture))
      .send({ confirm: true })
      .expect(200);
    const first = body(firstResponse);
    const firstSubmission = record(first.submission, 'submission');
    expect(firstSubmission.alreadySubmitted).toBe(false);
    const stored = await instanceModel.findById(fixture.scaleInstanceId).exec();
    expect(stored?.status).toBe('completed');
    expect(stored?.completedAt).toBeInstanceOf(Date);
    expect(stored?.lockedAt).toBeNull();
    const progress = record(stored?.progress, 'stored progress');
    expect(progress.totalItemCount).toBe(11);
    expect(progress.answeredItemCount).toBe(11);
    expect(progress.source).toBe('submission');
    const metadata = record(stored?.metadata, 'stored metadata');
    expect(metadata.initializedFromSeed).toBe(true);
    expect(isRecord(metadata.seedSummary)).toBe(true);
    const submission = record(metadata.submission, 'stored submission');
    expect(submission.submissionId).toBe(firstSubmission.submissionId);
    expect(submission.submittedByName).toBe('A16 Doctor Test Operator');
    expect(submission.submittedByRole).toBe('doctor');
    const summary = record(
      submission.readinessSummary,
      'stored readiness summary',
    );
    expect(summary.expectedItemCount).toBe(11);
    expect(summary.actualItemCount).toBe(11);
    expect(summary.completedItemCount).toBe(11);
    expect(summary.blockingIssueCount).toBe(0);
    expect(typeof summary.warningCount).toBe('number');
    expect(
      (await visitModel.findById(fixture.visitId).lean().exec())?.status,
    ).toBe(beforeVisit?.status);
    expect(stored?.operatorSnapshot?.operatorId).toEqual(
      beforeInstance?.operatorSnapshot?.operatorId,
    );
    expect(stored?.operatorSnapshot?.operatorName).toBe(
      beforeInstance?.operatorSnapshot?.operatorName,
    );
    expect(
      (
        await itemModel
          .find({ scaleInstanceId: fixture.scaleInstanceId })
          .sort({ itemOrder: 1 })
          .lean()
          .exec()
      ).map((item) => item.status),
    ).toEqual(beforeItems.map((item) => item.status));

    await doctorAgent
      .patch(`${instancePath(fixture)}/item-responses/${drawingItemId}`)
      .send({ rawResponse: true })
      .expect(409);
    await doctorAgent
      .post(
        `${instancePath(fixture)}/item-responses/${drawingItemId}/media-evidences`,
      )
      .field('evidenceType', 'photo')
      .field('captureMode', 'photo_upload')
      .attach('file', VALID_PNG, {
        filename: 'blocked.png',
        contentType: 'image/png',
      })
      .expect(409);
    await doctorAgent
      .post(
        `${instancePath(fixture)}/item-responses/${drawingItemId}/media-evidences/${mediaEvidenceId}/void`,
      )
      .send({ reason: 'must remain frozen' })
      .expect(409);
    await doctorAgent.get(instancePath(fixture)).expect(200);
    await doctorAgent
      .get(
        `${instancePath(fixture)}/item-responses/${drawingItemId}/media-evidences`,
      )
      .expect(200);
    await doctorAgent
      .get(
        `${instancePath(fixture)}/item-responses/${drawingItemId}/media-evidences/${mediaEvidenceId}/access-url`,
      )
      .expect(200);

    const secondResponse = await doctorAgent
      .post(submitPath(fixture))
      .send({ confirm: true })
      .expect(200);
    const secondSubmission = record(
      body(secondResponse).submission,
      'submission',
    );
    expect(secondSubmission.alreadySubmitted).toBe(true);
    expect(secondSubmission.submissionId).toBe(firstSubmission.submissionId);
    const storedAgain = await instanceModel
      .findById(fixture.scaleInstanceId)
      .exec();
    expect(storedAgain?.completedAt).toEqual(stored?.completedAt);
    expect(storedAgain?.durationMs).toBe(stored?.durationMs);

    for (const collectionName of [
      'score_results',
      'cognitive_domain_results',
      'clinical_reports',
    ]) {
      expect(
        await connection.collection(collectionName).countDocuments({
          scaleInstanceId: stored?._id,
        }),
      ).toBe(0);
    }
  });

  it('enforces first-submission patient, visit and instance state boundaries', async () => {
    const inactive = await createFixture('INACTIVE');
    await completeMmseThroughExistingApis(inactive);
    for (const status of ['inactive', 'archived'] as const) {
      await patientModel.updateOne({ _id: inactive.patientId }, { status });
      expect(
        body(
          await doctorAgent
            .post(submitPath(inactive))
            .send({ confirm: true })
            .expect(409),
        ).code,
      ).toBe('PATIENT_NOT_ACTIVE');
    }

    const closedVisit = await createFixture('VISIT-CLOSED');
    await completeMmseThroughExistingApis(closedVisit);
    for (const status of ['completed', 'locked', 'voided'] as const) {
      await visitModel.updateOne({ _id: closedVisit.visitId }, { status });
      expect(
        body(
          await doctorAgent
            .post(submitPath(closedVisit))
            .send({ confirm: true })
            .expect(409),
        ).code,
      ).toBe('VISIT_NOT_EDITABLE');
    }

    for (const status of ['locked', 'voided'] as const) {
      const blocked = await createFixture(`INSTANCE-${status.toUpperCase()}`);
      await instanceModel.updateOne(
        { _id: blocked.scaleInstanceId },
        { status },
      );
      expect(
        body(
          await doctorAgent
            .post(submitPath(blocked))
            .send({ confirm: true })
            .expect(409),
        ).code,
      ).toBe('SCALE_INSTANCE_NOT_SUBMITTABLE');
    }
  });
});
