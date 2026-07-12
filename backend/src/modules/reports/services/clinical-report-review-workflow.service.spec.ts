import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import { ClinicalReportPublicMapper } from './clinical-report-public.mapper';
import { ClinicalReportReviewWorkflowService } from './clinical-report-review-workflow.service';
import type { ClinicalReportSummary } from './reports.service';

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

type Ownership = {
  reportId: string;
  patientId: string;
  assessmentVisitId: string;
};
type AtomicInput = Ownership & {
  reportVersion: number;
  expectedUpdatedAt: Date;
  metadata: Record<string, unknown>;
  narrative?: ClinicalReportSummary['narrative'];
  confirmation?: {
    version: 1;
    confirmationId: string;
    confirmedAt: Date;
    confirmedBy: string;
    confirmedByName: string;
    confirmedByRole: 'doctor' | 'admin';
    confirmationNote: string;
  };
};

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
    subjectCode: 'SUBJ-A21-TEST-WORKFLOW',
    reportCode: 'RPT-A21-TEST-WORKFLOW',
    reportType: 'cognitive_assessment',
    status: 'draft',
    reportVersion: 1,
    source: 'system_draft',
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
    },
    aiDraft: {
      aiAnalysisResultId: null,
      generatedAt: null,
      status: 'not_requested',
      doctorEdited: false,
    },
    confirmation: null,
    lockedAt: null,
    lockedBy: null,
    archivedAt: null,
    archivedBy: null,
    correctionRecords: [],
    voidedAt: null,
    voidedBy: null,
    auditLogRefs: [],
    qualityStatus: 'unchecked',
    qualityHints: null,
    metadata: {
      a20Generation: {
        version: 1,
        generationId: 'generation-a21-workflow',
        generatedAt: now,
        generatedBy: ids.actor,
        generatedByName: 'A21 Test Doctor',
        generatedByRole: 'doctor',
        engineVersion: 'a20-clinical-report-draft-1.0',
        reportScope: 'explicit_primary_scale_instances',
        primaryScaleInstanceIds: [ids.instance],
        scoreResultIds: [ids.score],
        cognitiveDomainResultIds: [ids.domain],
        mediaEvidenceCount: 0,
        aiUsed: false,
      },
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function user(roles: string[] = ['doctor']): AuthenticatedUserContext {
  return {
    id: ids.actor,
    accountName: 'a21-test-operator',
    displayName: 'A21 Test Doctor',
    roles,
    permissions: [],
  };
}

function mocksFixture() {
  return {
    patients: {
      findPatientById: jest
        .fn<(id: string) => Promise<{ id: string; status: string } | null>>()
        .mockResolvedValue({ id: ids.patient, status: 'active' }),
    },
    assessments: {
      findVisitByPatientAndId: jest
        .fn<
          (
            patientId: string,
            visitId: string,
          ) => Promise<{ id: string; status: string } | null>
        >()
        .mockResolvedValue({ id: ids.visit, status: 'completed' }),
    },
    reports: {
      findReportByOwnership:
        jest.fn<(input: Ownership) => Promise<ClinicalReportSummary | null>>(),
      updateDraftNarrativeIfUnmodified:
        jest.fn<
          (input: AtomicInput) => Promise<ClinicalReportSummary | null>
        >(),
      submitForConfirmationIfUnmodified:
        jest.fn<
          (input: AtomicInput) => Promise<ClinicalReportSummary | null>
        >(),
      confirmReportIfUnmodified:
        jest.fn<
          (input: AtomicInput) => Promise<ClinicalReportSummary | null>
        >(),
    },
  };
}

describe('ClinicalReportReviewWorkflowService', () => {
  let report: ClinicalReportSummary;
  let mocks: ReturnType<typeof mocksFixture>;
  let service: ClinicalReportReviewWorkflowService;

  beforeEach(() => {
    report = reportFixture();
    mocks = mocksFixture();
    mocks.reports.findReportByOwnership.mockImplementation(() =>
      Promise.resolve(report),
    );
    service = new ClinicalReportReviewWorkflowService(
      mocks.patients,
      mocks.assessments,
      mocks.reports,
      new ClinicalReportPublicMapper(),
    );
  });

  it('edits draft and reports stale updatedAt conflicts', async () => {
    mocks.reports.updateDraftNarrativeIfUnmodified.mockImplementation(
      (input: AtomicInput) =>
        Promise.resolve({
          ...report,
          source: 'mixed',
          narrative: input.narrative ?? null,
          metadata: input.metadata,
        }),
    );
    const response = await service.updateDraft(
      ids.patient,
      ids.visit,
      ids.report,
      user(['nurse']),
      {
        doctorOpinion: '脱敏测试意见',
        editNote: '脱敏修改依据',
        expectedUpdatedAt: now.toISOString(),
      },
    );
    expect(response.report.source).toBe('mixed');
    expect(response.editReceipt.editedBy.operatorRole).toBe('nurse');

    mocks.reports.updateDraftNarrativeIfUnmodified.mockResolvedValue(null);
    mocks.reports.findReportByOwnership
      .mockResolvedValueOnce(report)
      .mockResolvedValueOnce(
        reportFixture({ updatedAt: new Date(now.getTime() + 1000) }),
      );
    await expect(
      service.updateDraft(ids.patient, ids.visit, ids.report, user(), {
        doctorOpinion: '第二次脱敏意见',
        editNote: '脱敏并发依据',
        expectedUpdatedAt: now.toISOString(),
      }),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_EDIT_CONFLICT' },
    });
  });

  it.each([
    ['pending_confirmation', 'CLINICAL_REPORT_NOT_EDITABLE'],
    ['confirmed', 'CLINICAL_REPORT_NOT_EDITABLE'],
    ['voided', 'CLINICAL_REPORT_VOIDED'],
  ] as const)('rejects %s edit state', async (status, code) => {
    report = reportFixture({ status });
    await expect(
      service.updateDraft(ids.patient, ids.visit, ids.report, user(), {
        doctorOpinion: '脱敏测试意见',
        editNote: '脱敏修改依据',
        expectedUpdatedAt: now.toISOString(),
      }),
    ).rejects.toMatchObject({ response: { code } });
  });

  it('submits once and returns the stable existing receipt', async () => {
    report = reportFixture({
      source: 'mixed',
      narrative: {
        ...reportFixture().narrative,
        doctorOpinion: '脱敏测试意见',
      },
    });
    let persisted = report;
    mocks.reports.submitForConfirmationIfUnmodified.mockImplementation(
      (input: AtomicInput) => {
        persisted = {
          ...report,
          status: 'pending_confirmation',
          metadata: input.metadata,
        };
        return Promise.resolve(persisted);
      },
    );
    const first = await service.submitForConfirmation(
      ids.patient,
      ids.visit,
      ids.report,
      user(),
      {
        confirm: true,
        submissionNote: '脱敏提交说明',
        expectedUpdatedAt: now.toISOString(),
      },
    );
    report = persisted;
    const repeated = await service.submitForConfirmation(
      ids.patient,
      ids.visit,
      ids.report,
      user(),
      {
        confirm: true,
        submissionNote: '不会覆盖原说明',
        expectedUpdatedAt: now.toISOString(),
      },
    );
    expect(repeated.submissionReceipt.alreadySubmitted).toBe(true);
    expect(repeated.submissionReceipt.submissionId).toBe(
      first.submissionReceipt.submissionId,
    );
    expect(
      mocks.reports.submitForConfirmationIfUnmodified,
    ).toHaveBeenCalledTimes(1);
  });

  it('requires doctor/admin and confirms without locking', async () => {
    await expect(
      service.confirmReport(
        ids.patient,
        ids.visit,
        ids.report,
        user(['research_assistant']),
        {
          confirm: true,
          confirmationNote: '无权限',
          expectedUpdatedAt: now.toISOString(),
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    report = reportFixture({
      status: 'pending_confirmation',
      source: 'mixed',
      narrative: {
        ...reportFixture().narrative,
        doctorOpinion: '脱敏测试意见',
      },
      metadata: {
        ...reportFixture().metadata,
        a21Submission: {
          version: 1,
          submissionId: 'submission-a21-workflow',
          submittedAt: now,
          submittedBy: ids.actor,
          submittedByName: 'A21 Test Doctor',
          submittedByRole: 'doctor',
          submissionNote: '脱敏提交说明',
        },
      },
    });
    let persisted = report;
    mocks.reports.confirmReportIfUnmodified.mockImplementation(
      (input: AtomicInput) => {
        const confirmation = input.confirmation;
        if (!confirmation) {
          return Promise.resolve(null);
        }
        persisted = {
          ...report,
          status: 'confirmed',
          confirmation: {
            confirmedAt: confirmation.confirmedAt,
            confirmedBy: confirmation.confirmedBy,
            confirmedByName: confirmation.confirmedByName,
            confirmedByRole: confirmation.confirmedByRole,
            confirmationNote: confirmation.confirmationNote,
          },
          qualityStatus: 'passed',
          metadata: input.metadata,
        };
        return Promise.resolve(persisted);
      },
    );
    const first = await service.confirmReport(
      ids.patient,
      ids.visit,
      ids.report,
      user(),
      {
        confirm: true,
        confirmationNote: '脱敏确认说明',
        expectedUpdatedAt: now.toISOString(),
      },
    );
    expect(first.report.qualityStatus).toBe('passed');
    expect(first.report.lockedAt).toBeNull();
    report = persisted;
    const repeated = await service.confirmReport(
      ids.patient,
      ids.visit,
      ids.report,
      user(['admin']),
      {
        confirm: true,
        confirmationNote: '不会覆盖原说明',
        expectedUpdatedAt: now.toISOString(),
      },
    );
    expect(repeated.confirmationReceipt.alreadyConfirmed).toBe(true);
    expect(repeated.confirmationReceipt.confirmationId).toBe(
      first.confirmationReceipt.confirmationId,
    );
  });

  it('rejects inactive patients and locked visits', async () => {
    mocks.patients.findPatientById.mockResolvedValue({
      id: ids.patient,
      status: 'inactive',
    });
    await expect(
      service.updateDraft(ids.patient, ids.visit, ids.report, user(), {
        doctorOpinion: '脱敏测试意见',
        editNote: '脱敏修改依据',
        expectedUpdatedAt: now.toISOString(),
      }),
    ).rejects.toMatchObject({ response: { code: 'PATIENT_NOT_ACTIVE' } });

    mocks.patients.findPatientById.mockResolvedValue({
      id: ids.patient,
      status: 'active',
    });
    mocks.assessments.findVisitByPatientAndId.mockResolvedValue({
      id: ids.visit,
      status: 'locked',
    });
    await expect(
      service.updateDraft(ids.patient, ids.visit, ids.report, user(), {
        doctorOpinion: '脱敏测试意见',
        editNote: '脱敏修改依据',
        expectedUpdatedAt: now.toISOString(),
      }),
    ).rejects.toMatchObject({ response: { code: 'VISIT_NOT_EDITABLE' } });
  });

  it('restricts a valid replacement to doctor/admin and exempts historical states', async () => {
    const lineage = {
      version: 1,
      correctionId: '44444444-4444-4444-8444-444444444444',
      correctionNo: 1,
      previousReportId: '507f1f77bcf86cd799439099',
      previousReportCode: 'RPT-A25-SOURCE',
      previousReportVersion: 1,
      replacementReportCode: 'RPT-A25-REPLACEMENT',
      replacementReportVersion: 2,
      createdAt: now,
      createdBy: ids.actor,
      createdByName: 'A21 Test Doctor',
      createdByRole: 'doctor',
      correctionReason: '脱敏更正原因',
      changeSummary: '脱敏计划变更范围',
      sourceArchiveId: '33333333-3333-4333-8333-333333333333',
      sourceArchivedAt: now,
      sourceFreezeId: '22222222-2222-4222-8222-222222222222',
      sourceFreezeCompletedAt: now,
    };
    report = reportFixture({
      reportCode: lineage.replacementReportCode,
      reportVersion: 2,
      source: 'mixed',
      qualityStatus: 'needs_review',
      metadata: {
        ...(report.metadata ?? {}),
        a25CorrectionReplacement: lineage,
      },
    });
    mocks.patients.findPatientById.mockResolvedValue({
      id: ids.patient,
      status: 'inactive',
    });
    mocks.assessments.findVisitByPatientAndId.mockResolvedValue({
      id: ids.visit,
      status: 'voided',
    });
    await expect(
      service.updateDraft(ids.patient, ids.visit, ids.report, user(['nurse']), {
        doctorOpinion: '脱敏 replacement 意见',
        editNote: '脱敏 replacement 修改依据',
        expectedUpdatedAt: now.toISOString(),
      }),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_CORRECTION_WORKFLOW_FORBIDDEN' },
    });
    mocks.reports.updateDraftNarrativeIfUnmodified.mockImplementation(
      (input: AtomicInput) =>
        Promise.resolve({
          ...report,
          narrative: input.narrative ?? null,
          metadata: input.metadata,
        }),
    );
    const response = await service.updateDraft(
      ids.patient,
      ids.visit,
      ids.report,
      user(['doctor']),
      {
        doctorOpinion: '脱敏 replacement 意见',
        editNote: '脱敏 replacement 修改依据',
        expectedUpdatedAt: now.toISOString(),
      },
    );
    expect(response.report.reportVersion).toBe(2);
    expect(response.report.replacementOf).not.toBeNull();
    expect(
      mocks.reports.updateDraftNarrativeIfUnmodified,
    ).toHaveBeenLastCalledWith(expect.objectContaining({ reportVersion: 2 }));
  });
});
