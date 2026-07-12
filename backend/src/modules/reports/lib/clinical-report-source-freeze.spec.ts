import type { ClinicalReportSummary } from '../services/reports.service';
import type { ClinicalReportSourceFreezeActor } from '../types/clinical-report-source-freeze.types';
import {
  buildClinicalReportSourceFreezeScope,
  buildSourceFreezeCompletionMetadata,
  buildSourceFreezeStartMetadata,
  ClinicalReportSourceFreezeRuleError,
  compareSourceFreezeScope,
  evaluateClinicalReportSourceFreezeReadiness,
  resolveExistingSourceFreeze,
} from './clinical-report-source-freeze';

const ids = {
  report: '507f1f77bcf86cd799439011',
  patient: '507f1f77bcf86cd799439012',
  visit: '507f1f77bcf86cd799439013',
  instance: '507f1f77bcf86cd799439014',
  item: '507f1f77bcf86cd799439015',
  score: '507f1f77bcf86cd799439016',
  domain: '507f1f77bcf86cd799439017',
  actor: '507f1f77bcf86cd799439018',
};
const now = new Date('2026-07-12T08:00:00.000Z');
const confirmedAt = new Date('2026-07-12T07:00:00.000Z');
const freezeId = '11111111-1111-4111-8111-111111111111';
const lockId = '22222222-2222-4222-8222-222222222222';
const actor: ClinicalReportSourceFreezeActor = {
  operatorId: ids.actor,
  operatorName: 'A23 Test Doctor',
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
    subjectCode: 'SUBJ-A23-TEST-001',
    reportCode: 'RPT-A23-TEST-001',
    reportType: 'cognitive_assessment',
    status: 'confirmed',
    reportVersion: 1,
    source: 'mixed',
    patientSnapshot: {
      subjectCode: 'SUBJ-A23-TEST-001',
      birthDate: null,
      educationYears: null,
    },
    visitSnapshot: {
      visitCode: 'VISIT-A23-TEST-001',
      assessmentDate: now,
      clinicalContext: null,
    },
    scaleTraces: [
      {
        scaleInstanceId: ids.instance,
        scaleCode: 'moca',
        scaleVersion: '1.0',
      },
    ],
    scoreSnapshots: [
      {
        scoreResultId: ids.score,
        scaleCode: 'moca',
        scaleVersion: '1.0',
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
      confirmedAt,
      confirmedBy: ids.actor,
      confirmedByName: actor.operatorName,
      confirmedByRole: 'doctor',
      confirmationNote: '脱敏确认说明',
    },
    lockedAt: now,
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
        generationId: 'generation-a23-test',
        generatedAt: now,
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
        submissionId: 'submission-a23-test',
        submittedAt: new Date('2026-07-12T06:00:00.000Z'),
        submittedBy: ids.actor,
        submittedByName: actor.operatorName,
        submittedByRole: 'doctor',
        submissionNote: '脱敏提交说明',
      },
      a21Confirmation: {
        version: 1,
        confirmationId: 'confirmation-a23-test',
        confirmedAt,
        confirmedBy: ids.actor,
        confirmedByName: actor.operatorName,
        confirmedByRole: 'doctor',
        confirmationNote: '脱敏确认说明',
      },
      a22Lock: {
        version: 1,
        lockId,
        lockedAt: now,
        lockedBy: ids.actor,
        lockedByName: actor.operatorName,
        lockedByRole: 'doctor',
        lockNote: '脱敏锁定说明',
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
  code: ConstructorParameters<typeof ClinicalReportSourceFreezeRuleError>[0],
): void {
  expect(operation).toThrow(new ClinicalReportSourceFreezeRuleError(code));
}

describe('clinical report source freeze rules', () => {
  it('accepts only a complete locked report with the current updatedAt', () => {
    expect(() =>
      evaluateClinicalReportSourceFreezeReadiness({
        report: createReport(),
        expectedUpdatedAt: now,
      }),
    ).not.toThrow();
    expectRuleError(
      () =>
        evaluateClinicalReportSourceFreezeReadiness({
          report: createReport(),
          expectedUpdatedAt: new Date(now.getTime() - 1),
        }),
      'CLINICAL_REPORT_SOURCE_FREEZE_CONFLICT',
    );
    expectRuleError(
      () =>
        evaluateClinicalReportSourceFreezeReadiness({
          report: createReport({ lockedAt: null, lockedBy: null }),
          expectedUpdatedAt: now,
        }),
      'CLINICAL_REPORT_NOT_SOURCE_FREEZABLE',
    );
  });

  it('normalizes stable scope and rejects duplicate IDs', () => {
    const report = createReport();
    const scope = buildClinicalReportSourceFreezeScope(report, [ids.item]);
    expect(scope.itemResponseIds).toEqual([ids.item]);
    expect(compareSourceFreezeScope(scope, { ...scope })).toBe(true);
    expectRuleError(
      () => buildClinicalReportSourceFreezeScope(report, [ids.item, ids.item]),
      'CLINICAL_REPORT_SOURCE_FREEZE_SCOPE_INVALID',
    );
  });

  it('builds immutable in-progress and completed audit while preserving metadata', () => {
    const report = createReport();
    const scope = buildClinicalReportSourceFreezeScope(report, [ids.item]);
    const originalMetadata = report.metadata;
    const zeroCounts = {
      scaleInstanceCount: 0,
      itemResponseCount: 0,
      scoreResultCount: 0,
      cognitiveDomainResultCount: 0,
      mediaEvidenceCount: 0,
      totalSourceCount: 0,
    };
    const start = buildSourceFreezeStartMetadata({
      report,
      freezeId,
      startedAt: now,
      sourceLockedAt: now,
      actor,
      freezeNote: '  脱敏来源冻结说明  ',
      scope,
      previouslyFrozenCounts: zeroCounts,
    });
    expect(start.audit.state).toBe('in_progress');
    expect(start.audit.freezeNote).toBe('脱敏来源冻结说明');
    expect(start.metadata.futureNamespace).toEqual({ preserved: true });
    expect(report.metadata).toBe(originalMetadata);
    const startedReport = createReport({ metadata: start.metadata });
    expect(resolveExistingSourceFreeze(startedReport)?.freezeId).toBe(freezeId);

    const completedCounts = {
      scaleInstanceCount: 1,
      itemResponseCount: 1,
      scoreResultCount: 1,
      cognitiveDomainResultCount: 1,
      mediaEvidenceCount: 0,
      totalSourceCount: 4,
    };
    const completion = buildSourceFreezeCompletionMetadata({
      report: startedReport,
      freezeId,
      completedAt: new Date(now.getTime() + 1000),
      actor,
      completedCounts,
      newlyFrozenCounts: completedCounts,
      previouslyFrozenCounts: zeroCounts,
    });
    const completed = resolveExistingSourceFreeze(
      createReport({ metadata: completion.metadata }),
    );
    expect(completed).toEqual(
      expect.objectContaining({ state: 'completed', freezeId }),
    );
    expect(completed?.scope.itemResponseIds).toEqual([ids.item]);
  });

  it('rejects malformed or drifted A23 audit', () => {
    const report = createReport();
    const malformed = createReport({
      metadata: { ...report.metadata, a23SourceFreeze: { version: 1 } },
    });
    expectRuleError(
      () => resolveExistingSourceFreeze(malformed),
      'CLINICAL_REPORT_SOURCE_FREEZE_AUDIT_UNAVAILABLE',
    );
  });
});
