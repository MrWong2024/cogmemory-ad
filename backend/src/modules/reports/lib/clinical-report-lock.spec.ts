import type { ClinicalReportSummary } from '../services/reports.service';
import type { ClinicalReportLockActor } from '../types/clinical-report-lock.types';
import {
  buildClinicalReportLockMetadata,
  ClinicalReportLockRuleError,
  evaluateClinicalReportLockReadiness,
  resolveExistingClinicalReportLock,
} from './clinical-report-lock';

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
const lockId = '11111111-1111-4111-8111-111111111111';
const actor: ClinicalReportLockActor = {
  operatorId: ids.actor,
  operatorName: 'A22 Test Doctor',
  operatorRole: 'doctor',
};

function createReport(
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
    subjectCode: 'SUBJ-A22-TEST-001',
    reportCode: 'RPT-A22-TEST-001',
    reportType: 'cognitive_assessment',
    status: 'confirmed',
    reportVersion: 1,
    source: 'mixed',
    patientSnapshot: {
      subjectCode: 'SUBJ-A22-TEST-001',
      birthDate: null,
      educationYears: null,
    },
    visitSnapshot: {
      visitCode: 'VISIT-A22-TEST-001',
      assessmentDate: now,
      clinicalContext: null,
    },
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
        generationId: 'generation-a22-test',
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
        submissionId: 'submission-a22-test',
        submittedAt: new Date('2026-07-12T06:00:00.000Z'),
        submittedBy: ids.actor,
        submittedByName: 'A22 Test Doctor',
        submittedByRole: 'doctor',
        submissionNote: '脱敏提交说明',
      },
      a21Confirmation: {
        version: 1,
        confirmationId: 'confirmation-a22-test',
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

function expectRuleError(
  operation: () => unknown,
  code: ConstructorParameters<typeof ClinicalReportLockRuleError>[0],
): void {
  expect(operation).toThrow(new ClinicalReportLockRuleError(code));
}

describe('clinical report lock rules', () => {
  it('accepts a complete confirmed report and detects stale updatedAt', () => {
    expect(() =>
      evaluateClinicalReportLockReadiness({
        report: createReport(),
        expectedUpdatedAt: now,
      }),
    ).not.toThrow();
    expectRuleError(
      () =>
        evaluateClinicalReportLockReadiness({
          report: createReport(),
          expectedUpdatedAt: new Date(now.getTime() - 1),
        }),
      'CLINICAL_REPORT_LOCK_CONFLICT',
    );
  });

  it.each(['draft', 'pending_confirmation', 'archived', 'corrected'] as const)(
    'rejects an unlocked %s report',
    (status) => {
      expectRuleError(
        () =>
          evaluateClinicalReportLockReadiness({
            report: createReport({ status }),
            expectedUpdatedAt: now,
          }),
        'CLINICAL_REPORT_NOT_LOCKABLE',
      );
    },
  );

  it('distinguishes voided and incomplete reports', () => {
    expectRuleError(
      () =>
        evaluateClinicalReportLockReadiness({
          report: createReport({ status: 'voided' }),
          expectedUpdatedAt: now,
        }),
      'CLINICAL_REPORT_VOIDED',
    );
    expectRuleError(
      () =>
        evaluateClinicalReportLockReadiness({
          report: createReport({ scoreSnapshots: [] }),
          expectedUpdatedAt: now,
        }),
      'CLINICAL_REPORT_INCOMPLETE',
    );
    expectRuleError(
      () =>
        evaluateClinicalReportLockReadiness({
          report: createReport({ qualityStatus: 'needs_review' }),
          expectedUpdatedAt: now,
        }),
      'CLINICAL_REPORT_NOT_LOCKABLE',
    );
  });

  it('requires supported A20/A21 metadata and consistent confirmation audit', () => {
    const missingSubmission = createReport();
    delete missingSubmission.metadata?.a21Submission;
    expectRuleError(
      () =>
        evaluateClinicalReportLockReadiness({
          report: missingSubmission,
          expectedUpdatedAt: now,
        }),
      'CLINICAL_REPORT_INCOMPLETE',
    );
    expectRuleError(
      () =>
        evaluateClinicalReportLockReadiness({
          report: createReport({ metadata: null }),
          expectedUpdatedAt: now,
        }),
      'CLINICAL_REPORT_METADATA_UNSUPPORTED',
    );
    expectRuleError(
      () =>
        evaluateClinicalReportLockReadiness({
          report: createReport({
            confirmation: {
              ...createReport().confirmation!,
              confirmationNote: '不一致确认说明',
            },
          }),
          expectedUpdatedAt: now,
        }),
      'CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE',
    );
  });

  it('builds one immutable audit namespace while preserving existing metadata', () => {
    const report = createReport();
    const originalMetadata = report.metadata;
    const mutation = buildClinicalReportLockMetadata({
      report,
      lockId,
      lockedAt: now,
      actor,
      lockNote: '  脱敏锁定说明  ',
    });
    expect(mutation.audit).toEqual({
      version: 1,
      lockId,
      lockedAt: now,
      lockedBy: ids.actor,
      lockedByName: 'A22 Test Doctor',
      lockedByRole: 'doctor',
      lockNote: '脱敏锁定说明',
    });
    expect(mutation.metadata).not.toBe(originalMetadata);
    expect(mutation.metadata.futureNamespace).toEqual({ preserved: true });
    expect(mutation.metadata.a20Generation).toBe(
      originalMetadata?.a20Generation,
    );
    expect(originalMetadata).not.toHaveProperty('a22Lock');
  });

  it('resolves A22 audit idempotently and supports a controlled history fallback', () => {
    const mutation = buildClinicalReportLockMetadata({
      report: createReport(),
      lockId,
      lockedAt: now,
      actor,
      lockNote: '脱敏锁定说明',
    });
    const locked = createReport({
      lockedAt: now,
      lockedBy: ids.actor,
      metadata: mutation.metadata,
    });
    expect(resolveExistingClinicalReportLock(locked)).toEqual({
      lockId,
      lockedAt: now,
      lockedBy: {
        operatorId: ids.actor,
        operatorName: 'A22 Test Doctor',
        operatorRole: 'doctor',
      },
      lockNote: '脱敏锁定说明',
    });
    expect(
      resolveExistingClinicalReportLock(
        createReport({ lockedAt: now, lockedBy: ids.actor, metadata: null }),
      ),
    ).toEqual({
      lockId: null,
      lockedAt: now,
      lockedBy: { operatorId: ids.actor, operatorRole: 'unknown' },
    });
  });

  it('refuses partial or inconsistent lock audit facts', () => {
    expectRuleError(
      () =>
        resolveExistingClinicalReportLock(
          createReport({ lockedAt: now, lockedBy: null }),
        ),
      'CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE',
    );
    const mutation = buildClinicalReportLockMetadata({
      report: createReport(),
      lockId,
      lockedAt: now,
      actor,
      lockNote: '脱敏锁定说明',
    });
    expectRuleError(
      () =>
        resolveExistingClinicalReportLock(
          createReport({
            lockedAt: new Date(now.getTime() + 1),
            lockedBy: ids.actor,
            metadata: mutation.metadata,
          }),
        ),
      'CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE',
    );
  });
});
