import type { INestApplicationContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { randomBytes } from 'crypto';
import type { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  Session,
  type SessionDocument,
} from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
import {
  AssessmentVisit,
  type AssessmentVisitDocument,
} from '../src/modules/assessments/schemas/assessment-visit.schema';
import { isPlainRecord } from '../src/modules/reports/lib/clinical-report-review';
import {
  Patient,
  type PatientDocument,
} from '../src/modules/patients/schemas/patient.schema';
import {
  ClinicalReport,
  type ClinicalReportDocument,
} from '../src/modules/reports/schemas/clinical-report.schema';
import { ClinicalReportLockWorkflowService } from '../src/modules/reports/services/clinical-report-lock-workflow.service';
import { ReportsService } from '../src/modules/reports/services/reports.service';
import {
  User,
  type UserDocument,
} from '../src/modules/users/schemas/user.schema';
import {
  B16_BUSINESS_SCENARIOS,
  B16_ROLES,
  B16FixtureError,
  accountNameFor,
  assertB16PreImportEnvironment,
  assertB16RuntimeEnvironment,
  assertB16SafeManifest,
  requireB16FixturePassword,
  subjectCodeFor,
  validateB16Namespace,
  visitCodeFor,
} from './support/b16-browser-fixtures/fixture-contract';
import {
  B16BrowserFixtureManager,
  createB16BrowserFixtureManager,
} from './support/b16-browser-fixtures/b16-browser-fixtures';

describe('B16 browser fixture CLI support (e2e)', () => {
  jest.setTimeout(300_000);

  const namespaceMain = 'b16-e2e-main';
  const namespaceOther = 'b16-e2e-other';
  const namespaceMissing = 'b16-e2e-missing';
  const sentinelSubjectCode = `OUTSIDE-B16-SENTINEL-${randomBytes(6).toString('hex')}`;
  const originalPassword = process.env.B16_FIXTURE_PASSWORD;
  const fixturePassword = `Aa1!${randomBytes(24).toString('base64url')}`;

  let app: INestApplicationContext;
  let manager: B16BrowserFixtureManager;
  let authService: AuthService;
  let reportsService: ReportsService;
  let lockWorkflow: ClinicalReportLockWorkflowService;
  let userModel: Model<UserDocument>;
  let sessionModel: Model<SessionDocument>;
  let patientModel: Model<PatientDocument>;
  let visitModel: Model<AssessmentVisitDocument>;
  let reportModel: Model<ClinicalReportDocument>;

  beforeAll(async () => {
    process.env.B16_FIXTURE_PASSWORD = fixturePassword;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    manager = createB16BrowserFixtureManager(app);
    authService = app.get(AuthService);
    reportsService = app.get(ReportsService);
    lockWorkflow = app.get(ClinicalReportLockWorkflowService);
    userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
    sessionModel = app.get<Model<SessionDocument>>(getModelToken(Session.name));
    patientModel = app.get<Model<PatientDocument>>(getModelToken(Patient.name));
    visitModel = app.get<Model<AssessmentVisitDocument>>(
      getModelToken(AssessmentVisit.name),
    );
    reportModel = app.get<Model<ClinicalReportDocument>>(
      getModelToken(ClinicalReport.name),
    );
    await manager.cleanup(namespaceMain);
    await manager.cleanup(namespaceOther);
    await manager.cleanup(namespaceMissing);
  });

  afterAll(async () => {
    if (manager) {
      await manager.cleanup(namespaceMain);
      await manager.cleanup(namespaceOther);
      await manager.cleanup(namespaceMissing);
    }
    if (patientModel) {
      await patientModel
        .deleteMany({ subjectCode: sentinelSubjectCode })
        .exec();
    }
    if (originalPassword === undefined) {
      delete process.env.B16_FIXTURE_PASSWORD;
    } else {
      process.env.B16_FIXTURE_PASSWORD = originalPassword;
    }
    if (app) {
      await app.close();
    }
  });

  it('validates namespace, pre-import environment, database gate, password, and safe manifest fields', () => {
    expect(validateB16Namespace('b16-local')).toBe('b16-local');
    for (const invalid of ['B16-local', 'b16_local', 'ab', 'b16--local']) {
      expect(() => validateB16Namespace(invalid)).toThrow(B16FixtureError);
    }
    expect(() => assertB16PreImportEnvironment('development')).toThrow(
      B16FixtureError,
    );
    expect(() =>
      assertB16RuntimeEnvironment({
        nodeEnv: 'test',
        appEnv: 'test',
        databaseName: 'cogmemory_ad_dev',
        storageDriver: 'fake',
        llmProvider: 'stub',
        smsProvider: 'stub',
        sessionCookieSecure: false,
      }),
    ).toThrow(B16FixtureError);
    expect(() => requireB16FixturePassword(undefined)).toThrow(B16FixtureError);
    expect(() =>
      assertB16SafeManifest({ safe: true, passwordHash: 'forbidden' }),
    ).toThrow(B16FixtureError);
  });

  it('prepares, verifies, authenticates, rejects duplicate prepare, isolates namespaces, replaces, and cleans precisely', async () => {
    const sentinel = await patientModel.create({
      subjectCode: sentinelSubjectCode,
      displayName: 'B16 outside sentinel',
      sourceType: 'clinical',
      sex: 'unknown',
      handedness: 'unknown',
      status: 'active',
      tags: [],
      externalRefs: null,
      metadata: null,
    });
    const mainManifest = await manager.prepare(
      namespaceMain,
      process.env.B16_FIXTURE_PASSWORD,
    );
    assertB16SafeManifest(mainManifest);
    expect(mainManifest.roles).toHaveLength(4);
    expect(mainManifest.scenarios).toHaveLength(20);
    expect(
      new Set(mainManifest.scenarios.map((item) => item.scenarioKey)),
    ).toEqual(
      new Set([
        'roles',
        ...B16_BUSINESS_SCENARIOS.map((item) => item.scenarioKey),
      ]),
    );
    const serializedManifest = JSON.stringify(mainManifest);
    for (const forbidden of [
      'passwordHash',
      'mongodb://',
      'previousReportId',
      'replacementReportId',
      'correctionId',
      'sessionToken',
    ]) {
      expect(serializedManifest).not.toContain(forbidden);
    }

    const verifiedManifest = await manager.verify(
      namespaceMain,
      process.env.B16_FIXTURE_PASSWORD,
    );
    expect(verifiedManifest.roles).toEqual(mainManifest.roles);
    expect(verifiedManifest.scenarios).toEqual(mainManifest.scenarios);

    const fixtureUsers = await userModel
      .find({
        accountName: {
          $in: B16_ROLES.map((role) => accountNameFor(namespaceMain, role)),
        },
      })
      .exec();
    expect(fixtureUsers).toHaveLength(4);
    const fixtureUserIds = fixtureUsers.map((user) => user._id);
    for (const role of B16_ROLES) {
      const authentication = await authService.authenticateWithPassword({
        accountName: accountNameFor(namespaceMain, role),
        password: fixturePassword,
        userAgent: 'b16-fixture-e2e',
        ipAddress: '127.0.0.1',
      });
      expect(authentication).not.toBeNull();
      expect(authentication?.user.roles).toEqual([role]);
    }
    expect(
      await sessionModel.countDocuments({ userId: { $in: fixtureUserIds } }),
    ).toBe(4);

    await expect(
      manager.prepare(namespaceMain, process.env.B16_FIXTURE_PASSWORD),
    ).rejects.toMatchObject({ code: 'B16_FIXTURE_NAMESPACE_EXISTS' });

    await thisExpectLineageInvalid409();

    const otherManifest = await manager.prepare(
      namespaceOther,
      process.env.B16_FIXTURE_PASSWORD,
    );
    expect(otherManifest.summary.scenarioCount).toBe(20);
    expect(
      (await manager.verify(namespaceMain, process.env.B16_FIXTURE_PASSWORD))
        .summary.scenarioCount,
    ).toBe(20);

    const cleanedMain = await manager.cleanup(namespaceMain);
    expect(cleanedMain.matched).toBe(true);
    expect(cleanedMain.residualCount).toBe(0);
    expect(cleanedMain.deleted.sessions).toBe(4);
    expect(
      await sessionModel.countDocuments({ userId: { $in: fixtureUserIds } }),
    ).toBe(0);
    expect(await patientModel.exists({ _id: sentinel._id })).not.toBeNull();
    expect(
      (await manager.verify(namespaceOther, process.env.B16_FIXTURE_PASSWORD))
        .summary.scenarioCount,
    ).toBe(20);
    const cleanedMainAgain = await manager.cleanup(namespaceMain);
    expect(cleanedMainAgain.matched).toBe(false);
    expect(cleanedMainAgain.residualCount).toBe(0);

    const replacedOther = await manager.replace(
      namespaceOther,
      process.env.B16_FIXTURE_PASSWORD,
    );
    expect(replacedOther.summary.scenarioCount).toBe(20);
    expect(
      (await manager.verify(namespaceOther, process.env.B16_FIXTURE_PASSWORD))
        .scenarios,
    ).toHaveLength(20);
    expect((await manager.cleanup(namespaceOther)).residualCount).toBe(0);
    expect(await patientModel.exists({ _id: sentinel._id })).not.toBeNull();
    await patientModel.deleteOne({ _id: sentinel._id }).exec();
  });

  it('fails read-only verify for a missing scenario without repairing it', async () => {
    await manager.prepare(namespaceMissing, process.env.B16_FIXTURE_PASSWORD);
    const patient = await patientModel
      .findOne({ subjectCode: subjectCodeFor(namespaceMissing, 1) })
      .exec();
    expect(patient).not.toBeNull();
    if (!patient) {
      throw new Error('fixture patient unavailable');
    }
    const visit = await visitModel
      .findOne({
        patientId: patient._id,
        visitCode: visitCodeFor(namespaceMissing, 1),
      })
      .exec();
    expect(visit).not.toBeNull();
    if (!visit) {
      throw new Error('fixture visit unavailable');
    }
    await reportModel
      .deleteMany({ patientId: patient._id, assessmentVisitId: visit._id })
      .exec();
    await expect(
      manager.verify(namespaceMissing, process.env.B16_FIXTURE_PASSWORD),
    ).rejects.toMatchObject({
      code: 'B16_FIXTURE_SCENARIO_INVALID',
      scenarioKey: 'v1_doctor_ready_lock',
    });
    expect(
      await reportModel.countDocuments({
        patientId: patient._id,
        assessmentVisitId: visit._id,
      }),
    ).toBe(0);
    expect((await manager.cleanup(namespaceMissing)).residualCount).toBe(0);
  });

  async function thisExpectLineageInvalid409(): Promise<void> {
    const definition = B16_BUSINESS_SCENARIOS.find(
      (item) => item.scenarioKey === 'v2_lineage_invalid_internal',
    );
    expect(definition).toBeDefined();
    if (!definition) {
      throw new Error('lineage invalid definition unavailable');
    }
    const patient = await patientModel
      .findOne({
        subjectCode: subjectCodeFor(namespaceMain, definition.ordinal),
      })
      .exec();
    expect(patient).not.toBeNull();
    if (!patient) {
      throw new Error('lineage invalid patient unavailable');
    }
    const visit = await visitModel
      .findOne({
        patientId: patient._id,
        visitCode: visitCodeFor(namespaceMain, definition.ordinal),
      })
      .exec();
    expect(visit).not.toBeNull();
    if (!visit) {
      throw new Error('lineage invalid visit unavailable');
    }
    const report = await reportsService.findLatestReportByVisitId(visit._id);
    const doctor = await userModel
      .findOne({ accountName: accountNameFor(namespaceMain, 'doctor') })
      .exec();
    expect(report).not.toBeNull();
    expect(doctor).not.toBeNull();
    if (!report || !report.updatedAt || !doctor) {
      throw new Error('lineage invalid prerequisites unavailable');
    }
    let rejection: unknown;
    try {
      await lockWorkflow.lockClinicalReport(
        patient._id.toString(),
        visit._id.toString(),
        report.id,
        {
          id: doctor._id.toString(),
          accountName: doctor.accountName,
          displayName: doctor.displayName,
          roles: [...doctor.roles],
          permissions: [...doctor.permissions],
          userType: doctor.userType,
        },
        {
          confirm: true,
          lockNote: 'B16 lineage invalid rejection probe',
          expectedUpdatedAt: report.updatedAt.toISOString(),
        },
      );
    } catch (error: unknown) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(HttpException);
    if (!(rejection instanceof HttpException)) {
      throw new Error('lineage invalid did not raise an HTTP exception');
    }
    expect(rejection.getStatus()).toBe(409);
    const response = rejection.getResponse();
    expect(isPlainRecord(response)).toBe(true);
    if (!isPlainRecord(response)) {
      throw new Error('lineage invalid response was not structured');
    }
    expect(response.code).toBe('CLINICAL_REPORT_REPLACEMENT_LINEAGE_INVALID');
    const unchanged = await reportsService.findLatestReportByVisitId(visit._id);
    expect(unchanged?.lockedAt).toBeNull();
  }
});
