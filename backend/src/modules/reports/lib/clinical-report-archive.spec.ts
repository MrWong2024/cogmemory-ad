import type { ClinicalReportSummary } from '../services/reports.service';
import type { ClinicalReportArchiveActor } from '../types/clinical-report-archive.types';
import {
  buildClinicalReportArchiveActor,
  buildClinicalReportArchiveMetadata,
  ClinicalReportArchiveRuleError,
  evaluateClinicalReportArchiveReadiness,
  resolveExistingClinicalReportArchive,
} from './clinical-report-archive';

const ids = {
  report: '507f1f77bcf86cd799439011',
  patient: '507f1f77bcf86cd799439012',
  visit: '507f1f77bcf86cd799439013',
  instance: '507f1f77bcf86cd799439014',
  score: '507f1f77bcf86cd799439015',
  domain: '507f1f77bcf86cd799439016',
  actor: '507f1f77bcf86cd799439017',
};
const lockId = '11111111-1111-4111-8111-111111111111';
const freezeId = '22222222-2222-4222-8222-222222222222';
const archiveId = '33333333-3333-4333-8333-333333333333';
const lockedAt = new Date('2026-07-12T08:00:00.000Z');
const sourceFreezeCompletedAt = new Date('2026-07-12T08:30:00.000Z');
const updatedAt = new Date('2026-07-12T09:00:00.000Z');
const archivedAt = new Date('2026-07-12T09:10:00.000Z');
const actor: ClinicalReportArchiveActor = {
  operatorId: ids.actor,
  operatorName: 'A24 Test Doctor',
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
    subjectCode: 'SUBJ-A24-TEST-001',
    reportCode: 'RPT-A24-TEST-001',
    reportType: 'cognitive_assessment',
    status: 'confirmed',
    reportVersion: 1,
    source: 'mixed',
    patientSnapshot: {
      subjectCode: 'SUBJ-A24-TEST-001',
      birthDate: null,
      educationYears: null,
    },
    visitSnapshot: {
      visitCode: 'VISIT-A24-TEST-001',
      assessmentDate: lockedAt,
      clinicalContext: null,
    },
    scaleTraces: [
      { scaleInstanceId: ids.instance, scaleCode: 'moca', scaleVersion: '1.0' },
    ],
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
        scaleCode: 'moca',
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
      confirmedAt: new Date('2026-07-12T07:30:00.000Z'),
      confirmedBy: ids.actor,
      confirmedByName: actor.operatorName,
      confirmedByRole: 'doctor',
      confirmationNote: '脱敏确认说明',
    },
    lockedAt,
    lockedBy: ids.actor,
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
        generationId: 'generation-a24-test',
        generatedAt: new Date('2026-07-12T07:00:00.000Z'),
        generatedBy: ids.actor,
        generatedByName: actor.operatorName,
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
        submissionId: 'submission-a24-test',
        submittedAt: new Date('2026-07-12T07:15:00.000Z'),
        submittedBy: ids.actor,
        submittedByName: actor.operatorName,
        submittedByRole: 'doctor',
        submissionNote: '脱敏提交说明',
      },
      a21Confirmation: {
        version: 1,
        confirmationId: 'confirmation-a24-test',
        confirmedAt: new Date('2026-07-12T07:30:00.000Z'),
        confirmedBy: ids.actor,
        confirmedByName: actor.operatorName,
        confirmedByRole: 'doctor',
        confirmationNote: '脱敏确认说明',
      },
      a22Lock: {
        version: 1,
        lockId,
        lockedAt,
        lockedBy: ids.actor,
        lockedByName: actor.operatorName,
        lockedByRole: 'doctor',
        lockNote: '脱敏锁定说明',
      },
      a23SourceFreeze: {
        version: 1,
        state: 'completed',
        freezeId,
        startedAt: new Date('2026-07-12T08:10:00.000Z'),
        sourceLockedAt: new Date('2026-07-12T08:10:00.000Z'),
        startedBy: ids.actor,
        startedByName: actor.operatorName,
        startedByRole: 'doctor',
        freezeNote: '脱敏来源冻结说明',
        scope: {
          scaleInstanceIds: [ids.instance],
          itemResponseIds: [],
          scoreResultIds: [ids.score],
          cognitiveDomainResultIds: [ids.domain],
          mediaEvidenceIds: [],
        },
        expectedCounts: {
          scaleInstanceCount: 1,
          itemResponseCount: 0,
          scoreResultCount: 1,
          cognitiveDomainResultCount: 1,
          mediaEvidenceCount: 0,
          totalSourceCount: 3,
        },
        completedCounts: {
          scaleInstanceCount: 1,
          itemResponseCount: 0,
          scoreResultCount: 1,
          cognitiveDomainResultCount: 1,
          mediaEvidenceCount: 0,
          totalSourceCount: 3,
        },
        newlyFrozenCounts: {
          scaleInstanceCount: 1,
          itemResponseCount: 0,
          scoreResultCount: 1,
          cognitiveDomainResultCount: 1,
          mediaEvidenceCount: 0,
          totalSourceCount: 3,
        },
        previouslyFrozenCounts: {
          scaleInstanceCount: 0,
          itemResponseCount: 0,
          scoreResultCount: 0,
          cognitiveDomainResultCount: 0,
          mediaEvidenceCount: 0,
          totalSourceCount: 0,
        },
        completedAt: sourceFreezeCompletedAt,
        completedBy: ids.actor,
        completedByName: actor.operatorName,
        completedByRole: 'doctor',
      },
      futureNamespace: { preserved: true },
    },
    createdAt: new Date('2026-07-12T06:30:00.000Z'),
    updatedAt,
    ...overrides,
  };
}

function expectRuleError(
  operation: () => unknown,
  code: ConstructorParameters<typeof ClinicalReportArchiveRuleError>[0],
): void {
  expect(operation).toThrow(new ClinicalReportArchiveRuleError(code));
}

describe('clinical report archive rules', () => {
  it('accepts only a confirmed, locked and source-frozen report', () => {
    expect(() =>
      evaluateClinicalReportArchiveReadiness({
        report: createReport(),
        expectedUpdatedAt: updatedAt,
      }),
    ).not.toThrow();
  });

  it.each([
    ['draft status', { status: 'draft' }, 'CLINICAL_REPORT_NOT_ARCHIVABLE'],
    [
      'pending status',
      { status: 'pending_confirmation' },
      'CLINICAL_REPORT_NOT_ARCHIVABLE',
    ],
    [
      'missing lock',
      { lockedAt: null, lockedBy: null },
      'CLINICAL_REPORT_NOT_ARCHIVABLE',
    ],
    [
      'quality not passed',
      { qualityStatus: 'needs_review' },
      'CLINICAL_REPORT_NOT_ARCHIVABLE',
    ],
    [
      'missing confirmation',
      { confirmation: null },
      'CLINICAL_REPORT_INCOMPLETE',
    ],
    [
      'existing correction',
      {
        correctionRecords: [
          {
            correctionNo: 1,
            correctedAt: null,
            correctedBy: null,
            auditLogId: null,
          },
        ],
      },
      'CLINICAL_REPORT_NOT_ARCHIVABLE',
    ],
    ['voided fields', { voidedAt: lockedAt }, 'CLINICAL_REPORT_NOT_ARCHIVABLE'],
  ] as Array<
    [
      string,
      Partial<ClinicalReportSummary>,
      ConstructorParameters<typeof ClinicalReportArchiveRuleError>[0],
    ]
  >)('rejects %s', (_label, overrides, expectedCode) => {
    expectRuleError(
      () =>
        evaluateClinicalReportArchiveReadiness({
          report: createReport(overrides),
          expectedUpdatedAt: updatedAt,
        }),
      expectedCode,
    );
  });

  it('rejects missing or in-progress source freeze and stale updatedAt', () => {
    const missing = createReport();
    delete (missing.metadata as Record<string, unknown>).a23SourceFreeze;
    expectRuleError(
      () =>
        evaluateClinicalReportArchiveReadiness({
          report: missing,
          expectedUpdatedAt: updatedAt,
        }),
      'CLINICAL_REPORT_NOT_ARCHIVABLE',
    );
    const inProgress = createReport();
    const freeze = (inProgress.metadata as Record<string, unknown>)
      .a23SourceFreeze as Record<string, unknown>;
    freeze.state = 'in_progress';
    delete freeze.completedCounts;
    delete freeze.newlyFrozenCounts;
    delete freeze.completedAt;
    delete freeze.completedBy;
    delete freeze.completedByName;
    delete freeze.completedByRole;
    expectRuleError(
      () =>
        evaluateClinicalReportArchiveReadiness({
          report: inProgress,
          expectedUpdatedAt: updatedAt,
        }),
      'CLINICAL_REPORT_NOT_ARCHIVABLE',
    );
    expectRuleError(
      () =>
        evaluateClinicalReportArchiveReadiness({
          report: createReport(),
          expectedUpdatedAt: new Date('2026-07-12T09:01:00.000Z'),
        }),
      'CLINICAL_REPORT_ARCHIVE_CONFLICT',
    );
  });

  it('builds one immutable audit while preserving every metadata namespace', () => {
    const report = createReport();
    const originalMetadata = report.metadata;
    const result = buildClinicalReportArchiveMetadata({
      report,
      archiveId,
      archivedAt,
      actor,
      archiveNote: '  脱敏归档说明  ',
    });

    expect(result.audit).toEqual({
      version: 1,
      archiveId,
      archivedAt,
      archivedBy: ids.actor,
      archivedByName: actor.operatorName,
      archivedByRole: 'doctor',
      archiveNote: '脱敏归档说明',
      sourceFreezeId: freezeId,
      sourceFreezeCompletedAt,
    });
    expect(result.metadata).toEqual(
      expect.objectContaining({
        a20Generation: (originalMetadata as Record<string, unknown>)
          .a20Generation,
        a22Lock: (originalMetadata as Record<string, unknown>).a22Lock,
        a23SourceFreeze: (originalMetadata as Record<string, unknown>)
          .a23SourceFreeze,
        futureNamespace: { preserved: true },
        a24Archive: result.audit,
      }),
    );
    expect(result.metadata).not.toBe(originalMetadata);
    expect(
      (originalMetadata as Record<string, unknown>).a24Archive,
    ).toBeUndefined();
  });

  it('builds only a valid doctor or admin actor', () => {
    expect(
      buildClinicalReportArchiveActor({
        operatorId: ids.actor,
        operatorName: '  A24 Admin  ',
        operatorRole: 'admin',
      }),
    ).toEqual({
      operatorId: ids.actor,
      operatorName: 'A24 Admin',
      operatorRole: 'admin',
    });
  });

  it('resolves a controlled archive and historical fallback', () => {
    const mutation = buildClinicalReportArchiveMetadata({
      report: createReport(),
      archiveId,
      archivedAt,
      actor,
      archiveNote: '脱敏归档说明',
    });
    const archived = createReport({
      status: 'archived',
      archivedAt,
      archivedBy: ids.actor,
      metadata: mutation.metadata,
    });
    expect(resolveExistingClinicalReportArchive(archived)).toEqual({
      archiveId,
      archivedAt,
      archivedBy: {
        operatorId: ids.actor,
        operatorName: actor.operatorName,
        operatorRole: 'doctor',
      },
      archiveNote: '脱敏归档说明',
      sourceFreezeId: freezeId,
      sourceFreezeCompletedAt,
    });
    expect(
      resolveExistingClinicalReportArchive(
        createReport({
          status: 'corrected',
          archivedAt,
          archivedBy: ids.actor,
          metadata: null,
        }),
      ),
    ).toEqual({
      archiveId: null,
      archivedAt,
      archivedBy: { operatorId: ids.actor, operatorRole: 'unknown' },
      sourceFreezeId: null,
      sourceFreezeCompletedAt: null,
    });
  });

  it('rejects inconsistent or malformed archive facts', () => {
    expectRuleError(
      () =>
        resolveExistingClinicalReportArchive(
          createReport({ status: 'archived', archivedAt, archivedBy: null }),
        ),
      'CLINICAL_REPORT_ARCHIVE_AUDIT_UNAVAILABLE',
    );
    const mutation = buildClinicalReportArchiveMetadata({
      report: createReport(),
      archiveId,
      archivedAt,
      actor,
      archiveNote: '脱敏归档说明',
    });
    const metadata = { ...mutation.metadata };
    metadata.a24Archive = {
      ...(metadata.a24Archive as Record<string, unknown>),
      sourceFreezeId: 'invalid',
    };
    expectRuleError(
      () =>
        resolveExistingClinicalReportArchive(
          createReport({
            status: 'archived',
            archivedAt,
            archivedBy: ids.actor,
            metadata,
          }),
        ),
      'CLINICAL_REPORT_ARCHIVE_AUDIT_UNAVAILABLE',
    );
  });
});
