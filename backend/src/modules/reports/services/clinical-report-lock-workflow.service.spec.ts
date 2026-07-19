import { Test } from '@nestjs/testing';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import { PatientsService } from '../../patients/services/patients.service';
import type { LockClinicalReportInput } from '../types/clinical-report-lock.types';
import type { ClinicalReportSummary } from './reports.service';
import { ClinicalReportLockWorkflowService } from './clinical-report-lock-workflow.service';
import { ClinicalReportPublicMapper } from './clinical-report-public.mapper';
import { ReportsService } from './reports.service';

const ids = {
  report: '507f1f77bcf86cd799439011',
  patient: '507f1f77bcf86cd799439012',
  visit: '507f1f77bcf86cd799439013',
  instance: '507f1f77bcf86cd799439014',
  score: '507f1f77bcf86cd799439015',
  domain: '507f1f77bcf86cd799439016',
  actor: '507f1f77bcf86cd799439017',
};
const now = new Date('2026-07-12T08:00:00.000Z');
const confirmedAt = new Date('2026-07-12T07:00:00.000Z');

function reportFixture(
  overrides: Partial<ClinicalReportSummary> = {},
): ClinicalReportSummary {
  return {
    id: ids.report,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    primaryScaleInstanceIds: [ids.instance],
    scoreResultIds: [ids.score],
    cognitiveDomainResultIds: [ids.domain],
    mediaEvidenceIds: [],
    subjectCode: 'SUBJ-A22-TEST-WORKFLOW',
    reportCode: 'RPT-A22-TEST-WORKFLOW',
    reportType: 'cognitive_assessment',
    status: 'confirmed',
    reportVersion: 1,
    source: 'mixed',
    patientSnapshot: { birthDate: null, educationYears: null },
    visitSnapshot: { assessmentDate: now, clinicalContext: null },
    scaleTraces: [{ scaleInstanceId: ids.instance, scaleCode: 'moca' }],
    scoreSnapshots: [
      {
        scoreResultId: ids.score,
        scaleCode: 'moca',
        totalScoreValue: 20,
        totalMaxScore: 30,
        totalMinScore: 0,
        scorePercent: 66.67,
        scoreDetails: null,
      },
    ],
    domainSnapshots: [
      {
        cognitiveDomainResultId: ids.domain,
        domainCode: 'memory',
        scoreValue: 4,
        maxScore: 5,
        scorePercent: 80,
        weightedScore: 4,
        weightedMaxScore: 5,
        itemCount: 1,
        needsReviewItemCount: 0,
      },
    ],
    evidenceSnapshots: [],
    narrative: {
      chiefSummary: '规则化主摘要',
      scoreSummary: '规则化评分摘要',
      domainSummary: '规则化认知域摘要',
      evidenceSummary: '规则化证据摘要',
      limitations: '规则化限制说明',
      doctorOpinion: '脱敏人工意见',
    },
    aiDraft: {
      aiAnalysisResultId: null,
      generatedAt: null,
      status: 'not_requested',
      doctorEdited: false,
    },
    confirmation: {
      confirmedAt,
      confirmedBy: ids.actor,
      confirmedByName: 'A22 Test Doctor',
      confirmedByRole: 'doctor',
      confirmationNote: '脱敏确认说明',
    },
    lockedAt: null,
    lockedBy: null,
    archivedAt: null,
    archivedBy: null,
    correctionRecords: [],
    voidedAt: null,
    voidedBy: null,
    auditLogRefs: [],
    qualityStatus: 'passed',
    qualityHints: null,
    metadata: {
      a20Generation: {
        version: 1,
        generationId: 'generation-a22-workflow',
        generatedAt: now,
        generatedBy: ids.actor,
        generatedByName: 'A22 Test Doctor',
        generatedByRole: 'doctor',
        engineVersion: 'a20-clinical-report-draft-1.0',
        reportScope: 'explicit_primary_scale_instances',
        primaryScaleInstanceIds: [ids.instance],
        scoreResultIds: [ids.score],
        cognitiveDomainResultIds: [ids.domain],
        mediaEvidenceCount: 0,
        aiUsed: false,
      },
      a21Submission: {
        version: 1,
        submissionId: 'submission-a22-workflow',
        submittedAt: new Date('2026-07-12T06:00:00.000Z'),
        submittedBy: ids.actor,
        submittedByName: 'A22 Test Doctor',
        submittedByRole: 'doctor',
        submissionNote: '脱敏提交说明',
      },
      a21Confirmation: {
        version: 1,
        confirmationId: 'confirmation-a22-workflow',
        confirmedAt,
        confirmedBy: ids.actor,
        confirmedByName: 'A22 Test Doctor',
        confirmedByRole: 'doctor',
        confirmationNote: '脱敏确认说明',
      },
      futureNamespace: { preserved: true },
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function user(roles: string[] = ['doctor']): AuthenticatedUserContext {
  return {
    id: ids.actor,
    accountName: 'a22-test-operator',
    displayName: 'A22 Test Doctor',
    roles,
    permissions: [],
  };
}

const input = {
  confirm: true,
  lockNote: '脱敏不可逆锁定说明',
  expectedUpdatedAt: now.toISOString(),
};

describe('ClinicalReportLockWorkflowService', () => {
  let service: ClinicalReportLockWorkflowService;
  let report: ClinicalReportSummary;
  let patients: { findPatientById: jest.Mock };
  let assessments: { findVisitByPatientAndId: jest.Mock };
  let reports: {
    findReportByOwnership: jest.MockedFunction<
      (input: {
        reportId: string;
        patientId: string;
        assessmentVisitId: string;
      }) => Promise<ClinicalReportSummary | null>
    >;
    hasValidReplacementLifecycleLineage: jest.MockedFunction<
      (report: ClinicalReportSummary) => Promise<boolean>
    >;
    lockReportIfUnmodified: jest.MockedFunction<
      (input: LockClinicalReportInput) => Promise<ClinicalReportSummary | null>
    >;
  };

  beforeEach(async () => {
    report = reportFixture();
    patients = {
      findPatientById: jest
        .fn()
        .mockResolvedValue({ id: ids.patient, status: 'active' }),
    };
    assessments = {
      findVisitByPatientAndId: jest
        .fn()
        .mockResolvedValue({ id: ids.visit, status: 'completed' }),
    };
    reports = {
      findReportByOwnership: jest
        .fn<
          Promise<ClinicalReportSummary | null>,
          [
            input: {
              reportId: string;
              patientId: string;
              assessmentVisitId: string;
            },
          ]
        >()
        .mockImplementation(() => Promise.resolve(report)),
      hasValidReplacementLifecycleLineage: jest
        .fn<Promise<boolean>, [report: ClinicalReportSummary]>()
        .mockResolvedValue(true),
      lockReportIfUnmodified: jest.fn<
        Promise<ClinicalReportSummary | null>,
        [input: LockClinicalReportInput]
      >(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ClinicalReportLockWorkflowService,
        ClinicalReportPublicMapper,
        { provide: PatientsService, useValue: patients },
        { provide: AssessmentsService, useValue: assessments },
        { provide: ReportsService, useValue: reports },
      ],
    }).compile();
    service = moduleRef.get(ClinicalReportLockWorkflowService);
  });

  it('locks a confirmed report with the authenticated doctor actor', async () => {
    reports.lockReportIfUnmodified.mockImplementation((atomicInput) =>
      Promise.resolve({
        ...report,
        lockedAt: atomicInput.lockedAt,
        lockedBy: atomicInput.lockedBy,
        metadata: atomicInput.metadata,
        updatedAt: new Date(now.getTime() + 1000),
      }),
    );
    const response = await service.lockClinicalReport(
      ids.patient,
      ids.visit,
      ids.report,
      user(),
      input,
    );
    expect(response.report.status).toBe('confirmed');
    expect(response.report.qualityStatus).toBe('passed');
    expect(response.report.isFinal).toBe(true);
    expect(response.lockReceipt.alreadyLocked).toBe(false);
    expect(response.lockReceipt.lockNote).toBe(input.lockNote);
    expect(response.lockReceipt.lockedBy).toEqual(
      expect.objectContaining({
        operatorId: ids.actor,
        operatorRole: 'doctor',
      }),
    );
    expect(reports.lockReportIfUnmodified).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: ids.report,
        patientId: ids.patient,
        assessmentVisitId: ids.visit,
        reportVersion: 1,
        lockedBy: ids.actor,
      }),
    );
    const atomicInput = reports.lockReportIfUnmodified.mock.calls[0][0];
    expect(atomicInput.metadata.futureNamespace).toEqual({ preserved: true });
    expect(atomicInput.metadata.a22Lock).toEqual(
      expect.objectContaining({ version: 1, lockNote: input.lockNote }),
    );
  });

  it('allows a valid V2 replacement despite historical patient and visit states', async () => {
    report = reportFixture({ reportVersion: 2 });
    patients.findPatientById.mockResolvedValue({
      id: ids.patient,
      status: 'inactive',
    });
    assessments.findVisitByPatientAndId.mockResolvedValue({
      id: ids.visit,
      status: 'voided',
    });
    reports.lockReportIfUnmodified.mockImplementation((atomicInput) =>
      Promise.resolve({
        ...report,
        lockedAt: atomicInput.lockedAt,
        lockedBy: atomicInput.lockedBy,
        metadata: atomicInput.metadata,
      }),
    );

    await service.lockClinicalReport(
      ids.patient,
      ids.visit,
      ids.report,
      user(),
      input,
    );

    expect(reports.lockReportIfUnmodified).toHaveBeenCalledWith(
      expect.objectContaining({ reportVersion: 2 }),
    );
  });

  it('returns the stable lineage conflict before lifecycle evaluation', async () => {
    report = reportFixture({ reportVersion: 2 });
    reports.hasValidReplacementLifecycleLineage.mockResolvedValue(false);

    await expect(
      service.lockClinicalReport(
        ids.patient,
        ids.visit,
        ids.report,
        user(),
        input,
      ),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_REPLACEMENT_LINEAGE_INVALID' },
    });
    expect(reports.lockReportIfUnmodified).not.toHaveBeenCalled();
  });

  it.each([undefined, false])(
    'requires explicit confirmation before resource access (%s)',
    async (confirm) => {
      await expect(
        service.lockClinicalReport(ids.patient, ids.visit, ids.report, user(), {
          ...input,
          confirm,
        }),
      ).rejects.toMatchObject({
        response: { code: 'CLINICAL_REPORT_LOCK_CONFIRMATION_REQUIRED' },
      });
      expect(patients.findPatientById).not.toHaveBeenCalled();
    },
  );

  it('enforces doctor/admin actors in addition to the route guard', async () => {
    await expect(
      service.lockClinicalReport(
        ids.patient,
        ids.visit,
        ids.report,
        user(['nurse']),
        input,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(patients.findPatientById).not.toHaveBeenCalled();
  });

  it('returns an existing A22 lock idempotently even with old updatedAt', async () => {
    const lockedAt = new Date('2026-07-12T09:00:00.000Z');
    report = reportFixture({
      lockedAt,
      lockedBy: ids.actor,
      updatedAt: new Date('2026-07-12T09:01:00.000Z'),
      metadata: {
        ...report.metadata,
        a22Lock: {
          version: 1,
          lockId: '11111111-1111-4111-8111-111111111111',
          lockedAt,
          lockedBy: ids.actor,
          lockedByName: 'A22 Test Doctor',
          lockedByRole: 'doctor',
          lockNote: '原始脱敏锁定说明',
        },
      },
    });
    const response = await service.lockClinicalReport(
      ids.patient,
      ids.visit,
      ids.report,
      user(['admin']),
      input,
    );
    expect(response.lockReceipt).toEqual(
      expect.objectContaining({
        lockId: '11111111-1111-4111-8111-111111111111',
        lockedAt,
        lockNote: '原始脱敏锁定说明',
        alreadyLocked: true,
      }),
    );
    expect(reports.lockReportIfUnmodified).not.toHaveBeenCalled();
  });

  it.each([
    ['inactive patient', 'PATIENT_NOT_ACTIVE'],
    ['locked visit', 'VISIT_NOT_EDITABLE'],
  ])('rejects first lock for %s', async (scenario, code) => {
    if (scenario === 'inactive patient') {
      patients.findPatientById.mockResolvedValue({
        id: ids.patient,
        status: 'archived',
      });
    } else {
      assessments.findVisitByPatientAndId.mockResolvedValue({
        id: ids.visit,
        status: 'locked',
      });
    }
    await expect(
      service.lockClinicalReport(
        ids.patient,
        ids.visit,
        ids.report,
        user(),
        input,
      ),
    ).rejects.toMatchObject({ response: { code } });
  });

  it('recovers an atomic race as idempotent or a stable conflict', async () => {
    reports.lockReportIfUnmodified.mockResolvedValue(null);
    reports.findReportByOwnership
      .mockResolvedValueOnce(report)
      .mockResolvedValueOnce(
        reportFixture({ updatedAt: new Date(now.getTime() + 1000) }),
      );
    await expect(
      service.lockClinicalReport(
        ids.patient,
        ids.visit,
        ids.report,
        user(),
        input,
      ),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_LOCK_CONFLICT' },
    });
  });

  it('returns stable audit and persistence failures without leaking metadata', async () => {
    report = reportFixture({ lockedAt: now, lockedBy: null });
    await expect(
      service.lockClinicalReport(
        ids.patient,
        ids.visit,
        ids.report,
        user(),
        input,
      ),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE' },
    });

    report = reportFixture();
    reports.lockReportIfUnmodified.mockRejectedValue(new Error('mongo detail'));
    await expect(
      service.lockClinicalReport(
        ids.patient,
        ids.visit,
        ids.report,
        user(),
        input,
      ),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_LOCK_FAILED' },
    });
  });

  it('keeps ownership failures indistinguishable from missing reports', async () => {
    reports.findReportByOwnership.mockResolvedValue(null);
    await expect(
      service.lockClinicalReport(
        ids.patient,
        ids.visit,
        ids.report,
        user(),
        input,
      ),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_NOT_FOUND' },
    });
  });
});
