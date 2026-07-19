import type { ClinicalReportSummary } from '../services/reports.service';
import type { ClinicalReportCorrectionActor } from '../types/clinical-report-correction.types';
import {
  buildClinicalReportCorrectionCompletion,
  buildClinicalReportCorrectionPlan,
  buildClinicalReportCorrectionReplacementRecordedMetadata,
  buildClinicalReportCorrectionStartMetadata,
  buildClinicalReportReplacement,
  ClinicalReportCorrectionRuleError,
  evaluateClinicalReportCorrectionReadiness,
  resolveExistingClinicalReportCorrection,
  validateClinicalReportReplacement,
} from './clinical-report-correction';

const ids = {
  report: '507f1f77bcf86cd799439011',
  replacement: '507f1f77bcf86cd799439012',
  patient: '507f1f77bcf86cd799439013',
  visit: '507f1f77bcf86cd799439014',
  instance: '507f1f77bcf86cd799439015',
  score: '507f1f77bcf86cd799439016',
  domain: '507f1f77bcf86cd799439017',
  actor: '507f1f77bcf86cd799439018',
};
const lockId = '11111111-1111-4111-8111-111111111111';
const freezeId = '22222222-2222-4222-8222-222222222222';
const archiveId = '33333333-3333-4333-8333-333333333333';
const correctionId = '44444444-4444-4444-8444-444444444444';
const lockedAt = new Date('2026-07-12T08:00:00.000Z');
const freezeCompletedAt = new Date('2026-07-12T08:30:00.000Z');
const archivedAt = new Date('2026-07-12T09:00:00.000Z');
const updatedAt = new Date('2026-07-12T09:10:00.000Z');
const actor: ClinicalReportCorrectionActor = {
  operatorId: ids.actor,
  operatorName: 'A25 Test Doctor',
  operatorRole: 'doctor',
};

function counts(value: number) {
  return {
    scaleInstanceCount: value,
    itemResponseCount: 0,
    scoreResultCount: value,
    cognitiveDomainResultCount: value,
    mediaEvidenceCount: 0,
    totalSourceCount: value * 3,
  };
}

function createSource(
  overrides: Partial<ClinicalReportSummary> = {},
): ClinicalReportSummary {
  const confirmationAt = new Date('2026-07-12T07:30:00.000Z');
  return {
    id: ids.report,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    primaryScaleInstanceIds: [ids.instance],
    scoreResultIds: [ids.score],
    cognitiveDomainResultIds: [ids.domain],
    mediaEvidenceIds: [],
    subjectCode: 'SUBJ-A25-TEST-001',
    reportCode: 'RPT-A25-SOURCE-001',
    reportType: 'cognitive_assessment',
    status: 'archived',
    reportVersion: 1,
    source: 'mixed',
    patientSnapshot: {
      subjectCode: 'SUBJ-A25-TEST-001',
      birthDate: null,
      educationYears: null,
    },
    visitSnapshot: {
      visitCode: 'VISIT-A25-TEST-001',
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
      recommendationText: '脱敏建议',
    },
    aiDraft: {
      aiAnalysisResultId: null,
      generatedAt: null,
      status: 'not_requested',
      doctorEdited: false,
    },
    confirmation: {
      confirmedAt: confirmationAt,
      confirmedBy: ids.actor,
      confirmedByName: actor.operatorName,
      confirmedByRole: 'doctor',
      confirmationNote: '脱敏确认说明',
    },
    lockedAt,
    lockedBy: ids.actor,
    archivedAt,
    archivedBy: ids.actor,
    correctionRecords: [],
    voidedAt: null,
    voidedBy: null,
    auditLogRefs: [],
    qualityStatus: 'passed',
    qualityHints: null,
    metadata: {
      a20Generation: {
        version: 1,
        generationId: 'generation-a25-test',
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
        submissionId: 'submission-a25-test',
        submittedAt: new Date('2026-07-12T07:15:00.000Z'),
        submittedBy: ids.actor,
        submittedByName: actor.operatorName,
        submittedByRole: 'doctor',
        submissionNote: '脱敏提交说明',
      },
      a21Confirmation: {
        version: 1,
        confirmationId: 'confirmation-a25-test',
        confirmedAt: confirmationAt,
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
        expectedCounts: counts(1),
        completedCounts: counts(1),
        newlyFrozenCounts: counts(1),
        previouslyFrozenCounts: counts(0),
        completedAt: freezeCompletedAt,
        completedBy: ids.actor,
        completedByName: actor.operatorName,
        completedByRole: 'doctor',
      },
      a24Archive: {
        version: 1,
        archiveId,
        archivedAt,
        archivedBy: ids.actor,
        archivedByName: actor.operatorName,
        archivedByRole: 'doctor',
        archiveNote: '脱敏归档说明',
        sourceFreezeId: freezeId,
        sourceFreezeCompletedAt: freezeCompletedAt,
      },
    },
    createdAt: new Date('2026-07-12T06:30:00.000Z'),
    updatedAt,
    ...overrides,
  };
}

function buildStartedSource() {
  const source = createSource();
  const plan = buildClinicalReportCorrectionPlan({
    sourceReport: source,
    correctionId,
    startedAt: new Date('2026-07-12T09:20:00.000Z'),
    actor,
    correctionReason: '脱敏更正原因',
    changeSummary: '脱敏计划变更范围',
  });
  return createSource({
    metadata: buildClinicalReportCorrectionStartMetadata({
      sourceReport: source,
      plan,
    }),
  });
}

function createReplacement(source: ClinicalReportSummary) {
  const resolution = resolveExistingClinicalReportCorrection(source);
  if (!resolution) {
    throw new Error('missing correction audit');
  }
  const input = buildClinicalReportReplacement({
    sourceReport: source,
    audit: resolution.audit,
    createdAt: new Date('2026-07-12T09:21:00.000Z'),
  });
  return createSource({
    ...input,
    id: ids.replacement,
    aiDraft: {
      ...input.aiDraft,
      aiAnalysisResultId: null,
      generatedAt: null,
    },
    lockedBy: null,
    archivedBy: null,
    voidedBy: null,
    createdAt: new Date('2026-07-12T09:21:00.000Z'),
    updatedAt: new Date('2026-07-12T09:21:00.000Z'),
  });
}

describe('clinical report correction rules', () => {
  it('accepts only a fully audited latest archived source', () => {
    const source = createSource();
    expect(() =>
      evaluateClinicalReportCorrectionReadiness({
        sourceReport: source,
        latestReport: source,
        expectedUpdatedAt: updatedAt,
      }),
    ).not.toThrow();
    expect(() =>
      evaluateClinicalReportCorrectionReadiness({
        sourceReport: source,
        latestReport: createSource({ id: ids.replacement }),
        expectedUpdatedAt: updatedAt,
      }),
    ).toThrow(
      new ClinicalReportCorrectionRuleError(
        'CLINICAL_REPORT_CORRECTION_NOT_LATEST',
      ),
    );
  });

  it('rejects historical archive fallback and stale optimistic concurrency', () => {
    const source = createSource();
    const metadata = { ...source.metadata };
    delete metadata.a24Archive;
    expect(() =>
      evaluateClinicalReportCorrectionReadiness({
        sourceReport: createSource({ metadata }),
        latestReport: createSource({ metadata }),
        expectedUpdatedAt: updatedAt,
      }),
    ).toThrow();
    expect(() =>
      evaluateClinicalReportCorrectionReadiness({
        sourceReport: source,
        latestReport: source,
        expectedUpdatedAt: new Date('2026-07-12T09:11:00.000Z'),
      }),
    ).toThrow(
      new ClinicalReportCorrectionRuleError(
        'CLINICAL_REPORT_CORRECTION_CONFLICT',
      ),
    );
  });

  it('builds a deterministic linear plan and an immutable start audit', () => {
    const source = createSource();
    const before = structuredClone(source);
    const plan = buildClinicalReportCorrectionPlan({
      sourceReport: source,
      correctionId,
      startedAt: new Date('2026-07-12T09:20:00.000Z'),
      actor,
      correctionReason: '  脱敏更正原因  ',
      changeSummary: '  脱敏计划变更范围  ',
    });
    expect(plan).toMatchObject({
      correctionNo: 1,
      replacementReportVersion: 2,
      correctionReason: '脱敏更正原因',
      changeSummary: '脱敏计划变更范围',
    });
    expect(plan.replacementReportCode).toMatch(/^RPT-[0-9A-F]{24}$/);
    const metadata = buildClinicalReportCorrectionStartMetadata({
      sourceReport: source,
      plan,
    });
    expect(metadata.a25Correction).toMatchObject({
      state: 'in_progress',
      correctionId,
      previousReportVersion: 1,
      replacementReportVersion: 2,
    });
    expect(source).toEqual(before);
  });

  it('copies fixed snapshots and resets every replacement lifecycle fact', () => {
    const source = buildStartedSource();
    const replacement = createReplacement(source);
    expect(replacement).toMatchObject({
      reportVersion: 2,
      status: 'draft',
      source: 'mixed',
      qualityStatus: 'needs_review',
      confirmation: null,
      lockedAt: null,
      lockedBy: null,
      archivedAt: null,
      archivedBy: null,
      voidedAt: null,
      voidedBy: null,
      correctionRecords: [],
      auditLogRefs: [],
    });
    expect(replacement.patientSnapshot).toEqual(source.patientSnapshot);
    expect(replacement.narrative).toEqual(source.narrative);
    expect(replacement.metadata).not.toHaveProperty('a21Submission');
    expect(replacement.metadata).not.toHaveProperty('a22Lock');
    expect(replacement.metadata).not.toHaveProperty('a23SourceFreeze');
    expect(replacement.metadata).not.toHaveProperty('a24Archive');
    const resolution = resolveExistingClinicalReportCorrection(source)!;
    expect(() =>
      validateClinicalReportReplacement({
        sourceReport: source,
        replacementReport: replacement,
        audit: resolution.audit,
      }),
    ).not.toThrow();
  });

  it('records the replacement before completing exactly one correction event', () => {
    const started = buildStartedSource();
    const replacement = createReplacement(started);
    const resolution = resolveExistingClinicalReportCorrection(started)!;
    const recordedMetadata =
      buildClinicalReportCorrectionReplacementRecordedMetadata({
        sourceReport: started,
        audit: resolution.audit,
        replacementReport: replacement,
      });
    const recorded = createSource({ metadata: recordedMetadata });
    const recordedAudit = resolveExistingClinicalReportCorrection(recorded)!;
    expect(recordedAudit.audit.replacementReportId).toBe(ids.replacement);
    const completion = buildClinicalReportCorrectionCompletion({
      sourceReport: recorded,
      replacementReport: replacement,
      audit: recordedAudit.audit,
      completedAt: new Date('2026-07-12T09:30:00.000Z'),
      actor,
    });
    const completed = createSource({
      status: 'corrected',
      metadata: completion.metadata,
      correctionRecords: [completion.correctionRecord],
    });
    expect(resolveExistingClinicalReportCorrection(completed)).toMatchObject({
      completed: true,
      audit: { correctionId, replacementReportId: ids.replacement },
    });
    expect(completion.correctionRecord).toMatchObject({
      correctionNo: 1,
      auditLogId: null,
      previousReportCode: 'RPT-A25-SOURCE-001',
    });
  });

  it('rejects a mismatched replacement instead of overwriting or branching', () => {
    const source = buildStartedSource();
    const replacement = createReplacement(source);
    const resolution = resolveExistingClinicalReportCorrection(source)!;
    expect(() =>
      validateClinicalReportReplacement({
        sourceReport: source,
        replacementReport: {
          ...replacement,
          primaryScaleInstanceIds: ['507f1f77bcf86cd799439099'],
        },
        audit: resolution.audit,
      }),
    ).toThrow(
      new ClinicalReportCorrectionRuleError(
        'CLINICAL_REPORT_CORRECTION_REPLACEMENT_CONFLICT',
      ),
    );
  });
});
