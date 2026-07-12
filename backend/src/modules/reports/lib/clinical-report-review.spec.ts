import type { ClinicalReportSummary } from '../services/reports.service';
import type { ClinicalReportWorkflowActor } from '../types/clinical-report-review.types';
import {
  ClinicalReportReviewRuleError,
  MAX_A21_EDIT_EVENTS,
  prepareClinicalReportConfirmation,
  prepareClinicalReportDraftEdit,
  prepareClinicalReportSubmission,
  readClinicalReportConfirmation,
  readClinicalReportEditEvents,
  readClinicalReportSubmission,
} from './clinical-report-review';

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
const actor: ClinicalReportWorkflowActor = {
  operatorId: ids.actor,
  operatorName: 'A21 Test Doctor',
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
    subjectCode: 'SUBJ-A21-TEST-001',
    reportCode: 'RPT-A21-TEST-001',
    reportType: 'cognitive_assessment',
    status: 'draft',
    reportVersion: 1,
    source: 'system_draft',
    patientSnapshot: {
      subjectCode: 'SUBJ-A21-TEST-001',
      birthDate: null,
      educationYears: null,
    },
    visitSnapshot: {
      visitCode: 'VISIT-A21-TEST-001',
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
        generationId: 'generation-a21-test',
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
      futureNamespace: { preserved: true },
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function editReport(report = createReport()) {
  return prepareClinicalReportDraftEdit({
    report,
    doctorOpinion: '  脱敏人工意见  ',
    recommendationText: '  通用测试建议  ',
    editNote: '  首次受控编辑  ',
    eventId: 'event-a21-test-001',
    editedAt: now,
    actor,
  });
}

describe('clinical report review rules', () => {
  it('edits only clinician-owned narrative and appends controlled audit', () => {
    const report = createReport();
    const originalNarrative = { ...report.narrative };
    const result = editReport(report);

    expect(result.narrative).toEqual({
      ...originalNarrative,
      doctorOpinion: '脱敏人工意见',
      recommendationText: '通用测试建议',
    });
    expect(result.event).toEqual(
      expect.objectContaining({
        eventId: 'event-a21-test-001',
        editedBy: ids.actor,
        editedByRole: 'doctor',
        changedFields: ['doctorOpinion', 'recommendationText'],
        previousValues: {
          doctorOpinion: null,
          recommendationText: null,
        },
        nextValues: {
          doctorOpinion: '脱敏人工意见',
          recommendationText: '通用测试建议',
        },
        editNote: '首次受控编辑',
      }),
    );
    expect(result.metadata.futureNamespace).toEqual({ preserved: true });
    expect(report.narrative).toEqual(originalNarrative);
    expect(report.metadata).not.toHaveProperty('a21Edits');
  });

  it('preserves all five system summaries and clears recommendation explicitly', () => {
    const first = editReport();
    const report = createReport({
      source: 'mixed',
      narrative: first.narrative,
      metadata: first.metadata,
    });
    const result = prepareClinicalReportDraftEdit({
      report,
      doctorOpinion: '脱敏人工意见修订',
      recommendationText: '   ',
      editNote: '清除通用建议',
      eventId: 'event-a21-test-002',
      editedAt: new Date(now.getTime() + 1000),
      actor,
    });

    expect(result.narrative).toEqual(
      expect.objectContaining({
        chiefSummary: '规则化主摘要',
        scoreSummary: '规则化评分摘要',
        domainSummary: '规则化认知域摘要',
        evidenceSummary: '规则化证据摘要',
        limitations: '规则化限制说明',
        doctorOpinion: '脱敏人工意见修订',
      }),
    );
    expect(result.narrative).not.toHaveProperty('recommendationText');
    expect(readClinicalReportEditEvents(result.metadata)).toHaveLength(2);
  });

  it('rejects whitespace-only changes', () => {
    const first = editReport();
    const report = createReport({
      source: 'mixed',
      narrative: first.narrative,
      metadata: first.metadata,
    });
    expect(() =>
      prepareClinicalReportDraftEdit({
        report,
        doctorOpinion: '  脱敏人工意见  ',
        recommendationText: ' 通用测试建议 ',
        editNote: '不应形成事件',
        eventId: 'unused-event',
        editedAt: now,
        actor,
      }),
    ).toThrow(
      new ClinicalReportReviewRuleError('CLINICAL_REPORT_EDIT_NO_CHANGES'),
    );
  });

  it('rejects unsupported metadata without overwriting it', () => {
    const report = createReport({
      metadata: {
        a20Generation: createReport().metadata?.a20Generation,
        a21Edits: { version: 2, events: [] },
        privateValue: 'must remain',
      },
    });
    expect(() => editReport(report)).toThrow(
      new ClinicalReportReviewRuleError('CLINICAL_REPORT_METADATA_UNSUPPORTED'),
    );
    expect(report.metadata).toHaveProperty('privateValue', 'must remain');
  });

  it('enforces the 200-event audit ceiling', () => {
    const seed = editReport();
    const event = seed.event;
    const report = createReport({
      source: 'mixed',
      narrative: seed.narrative,
      metadata: {
        ...seed.metadata,
        a21Edits: {
          version: 1,
          events: Array.from(
            { length: MAX_A21_EDIT_EVENTS },
            (_value, index) => ({
              ...event,
              eventId: `event-${index}`,
              editedAt: new Date(now.getTime() + index),
            }),
          ),
          lastEditedAt: now,
          lastEditedBy: ids.actor,
        },
      },
    });
    expect(() =>
      prepareClinicalReportDraftEdit({
        report,
        doctorOpinion: '新的脱敏人工意见',
        editNote: '超过审计上限',
        eventId: 'event-over-limit',
        editedAt: now,
        actor,
      }),
    ).toThrow(
      new ClinicalReportReviewRuleError(
        'CLINICAL_REPORT_EDIT_AUDIT_LIMIT_REACHED',
      ),
    );
  });

  it('builds submission and confirmation metadata without changing snapshots', () => {
    const edited = editReport();
    const editedReport = createReport({
      source: 'mixed',
      narrative: edited.narrative,
      metadata: edited.metadata,
    });
    const submission = prepareClinicalReportSubmission({
      report: editedReport,
      submissionId: 'submission-a21-test',
      submittedAt: now,
      actor,
      submissionNote: '  请复核脱敏测试内容  ',
    });
    expect(readClinicalReportSubmission(submission.metadata)).toEqual(
      expect.objectContaining({
        submissionId: 'submission-a21-test',
        submissionNote: '请复核脱敏测试内容',
      }),
    );
    const pending = createReport({
      status: 'pending_confirmation',
      source: 'mixed',
      narrative: edited.narrative,
      metadata: submission.metadata,
    });
    const confirmation = prepareClinicalReportConfirmation({
      report: pending,
      confirmationId: 'confirmation-a21-test',
      confirmedAt: now,
      actor: { ...actor, operatorRole: 'doctor' },
      confirmationNote: '  已完成脱敏测试复核  ',
    });
    expect(readClinicalReportConfirmation(confirmation.metadata)).toEqual(
      expect.objectContaining({
        confirmationId: 'confirmation-a21-test',
        confirmedBy: ids.actor,
        confirmedByRole: 'doctor',
        confirmationNote: '已完成脱敏测试复核',
      }),
    );
    expect(pending.scaleTraces).toEqual(createReport().scaleTraces);
    expect(pending.scoreSnapshots).toEqual(createReport().scoreSnapshots);
    expect(pending.domainSnapshots).toEqual(createReport().domainSnapshots);
  });

  it.each([
    ['system draft', createReport()],
    [
      'failed quality',
      createReport({
        source: 'mixed',
        qualityStatus: 'failed',
        narrative: editReport().narrative,
      }),
    ],
  ])('rejects submission when %s is not ready', (_name, report) => {
    expect(() =>
      prepareClinicalReportSubmission({
        report,
        submissionId: 'submission-not-ready',
        submittedAt: now,
        actor,
        submissionNote: '脱敏提交说明',
      }),
    ).toThrow(
      new ClinicalReportReviewRuleError(
        'CLINICAL_REPORT_NOT_READY_FOR_SUBMISSION',
      ),
    );
  });

  it('rejects confirmation without a valid submission audit', () => {
    const edited = editReport();
    const report = createReport({
      status: 'pending_confirmation',
      source: 'mixed',
      narrative: edited.narrative,
      metadata: edited.metadata,
    });
    expect(() =>
      prepareClinicalReportConfirmation({
        report,
        confirmationId: 'confirmation-not-ready',
        confirmedAt: now,
        actor: { ...actor, operatorRole: 'doctor' },
        confirmationNote: '脱敏确认说明',
      }),
    ).toThrow(
      new ClinicalReportReviewRuleError(
        'CLINICAL_REPORT_NOT_READY_FOR_CONFIRMATION',
      ),
    );
  });
});
