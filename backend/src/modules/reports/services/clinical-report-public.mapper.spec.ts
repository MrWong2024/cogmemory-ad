import type { ClinicalReportSummary } from './reports.service';
import { ClinicalReportPublicMapper } from './clinical-report-public.mapper';

const id = '507f1f77bcf86cd799439011';
const now = new Date('2026-07-11T09:00:00.000Z');

function createReport(): ClinicalReportSummary {
  return {
    id,
    patientId: '507f1f77bcf86cd799439012',
    assessmentVisitId: '507f1f77bcf86cd799439013',
    primaryScaleInstanceIds: ['507f1f77bcf86cd799439014'],
    scoreResultIds: ['507f1f77bcf86cd799439015'],
    cognitiveDomainResultIds: ['507f1f77bcf86cd799439016'],
    mediaEvidenceIds: ['507f1f77bcf86cd799439017'],
    subjectCode: 'SUBJ-A20-TEST-001',
    reportCode: 'RPT-0123456789ABCDEF01234567',
    reportType: 'cognitive_assessment',
    status: 'draft',
    reportVersion: 1,
    source: 'system_draft',
    patientSnapshot: {
      subjectCode: 'SUBJ-A20-TEST-001',
      displayName: '脱敏受试者',
      sex: 'unknown',
      birthDate: null,
      educationYears: 12,
    },
    visitSnapshot: {
      visitCode: 'VISIT-A20-TEST-001',
      visitType: 'baseline',
      assessmentDate: now,
      operatorName: '脱敏医生',
      operatorRole: 'doctor',
      clinicalContext: { private: true },
    },
    scaleTraces: [
      {
        scaleInstanceId: '507f1f77bcf86cd799439014',
        scaleCode: 'moca',
        scaleVersion: '1.0',
      },
    ],
    scoreSnapshots: [
      {
        scoreResultId: '507f1f77bcf86cd799439015',
        scaleCode: 'moca',
        totalScoreValue: 20,
        totalMaxScore: 30,
        totalMinScore: 0,
        scorePercent: 66.67,
        scoreStatus: 'confirmed',
        qualityStatus: 'passed',
        summary: '安全评分摘要',
        scoreDetails: { private: true },
      },
    ],
    domainSnapshots: [
      {
        cognitiveDomainResultId: '507f1f77bcf86cd799439016',
        scaleCode: 'moca',
        domainCode: 'memory',
        scoreValue: 4,
        maxScore: 5,
        scorePercent: 80,
        weightedScore: 4,
        weightedMaxScore: 5,
        itemCount: 5,
        needsReviewItemCount: 0,
      },
    ],
    evidenceSnapshots: [
      {
        mediaEvidenceId: '507f1f77bcf86cd799439017',
        itemResponseId: '507f1f77bcf86cd799439018',
        scaleCode: 'moca',
        itemCode: 'moca.clock',
        evidenceType: 'handwriting',
        captureMode: 'tablet_handwriting',
        storageObjectKey: 'private/object-key',
        qualityStatus: 'unchecked',
      },
    ],
    narrative: {
      chiefSummary: '规则化草稿',
      scoreSummary: '评分摘要',
      domainSummary: '认知域摘要',
      evidenceSummary: '证据摘要',
      limitations: '限制说明',
      trendSummary: 'private trend',
      recommendationText: 'private recommendation',
      doctorOpinion: 'private opinion',
    },
    aiDraft: {
      aiAnalysisResultId: '507f1f77bcf86cd799439019',
      provider: 'private-provider',
      model: 'private-model',
      generatedAt: now,
      draftText: 'private-ai-text',
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
    qualityHints: { private: true },
    operatorNote: 'private-note',
    metadata: {
      a20Generation: {
        version: 1,
        generationId: 'generation-a20-test',
        generatedAt: now,
        generatedBy: '507f1f77bcf86cd799439020',
        generatedByName: '脱敏医生',
        generatedByRole: 'doctor',
        engineVersion: 'a20-clinical-report-draft-1.0',
        reportScope: 'explicit_primary_scale_instances',
        primaryScaleInstanceIds: ['507f1f77bcf86cd799439014'],
        scoreResultIds: ['507f1f77bcf86cd799439015'],
        cognitiveDomainResultIds: ['507f1f77bcf86cd799439016'],
        mediaEvidenceCount: 1,
        aiUsed: false,
      },
      private: true,
    },
    createdAt: now,
    updatedAt: now,
  };
}

describe('ClinicalReportPublicMapper', () => {
  const mapper = new ClinicalReportPublicMapper();

  it('maps only the explicit public report contract', () => {
    const response = mapper.toPublicReport(createReport());
    expect(response.generation).toEqual(
      expect.objectContaining({
        generationId: 'generation-a20-test',
        includedScaleInstanceCount: 1,
        scoreResultCount: 1,
        cognitiveDomainResultCount: 1,
        mediaEvidenceCount: 1,
        aiUsed: false,
      }),
    );
    expect(response.isFinal).toBe(false);
    expect(response.visitSnapshot).not.toHaveProperty('clinicalContext');
    expect(response.scoreSnapshots[0]).not.toHaveProperty('scoreResultId');
    expect(response.scoreSnapshots[0]).not.toHaveProperty('scoreDetails');
    expect(response.domainSnapshots[0]).not.toHaveProperty(
      'cognitiveDomainResultId',
    );
    expect(response.evidenceSnapshots[0]).not.toHaveProperty('mediaEvidenceId');
    expect(response.evidenceSnapshots[0]).not.toHaveProperty('itemResponseId');
    expect(response.evidenceSnapshots[0]).not.toHaveProperty(
      'storageObjectKey',
    );
    expect(response.narrative).not.toHaveProperty('trendSummary');
    expect(response.narrative).not.toHaveProperty('recommendationText');
    expect(response.narrative).not.toHaveProperty('doctorOpinion');
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('private/object-key');
    expect(serialized).not.toContain('private-ai-text');
    expect(serialized).not.toContain('qualityHints');
    expect(response).not.toHaveProperty('metadata');
    expect(response).not.toHaveProperty('patientId');
    expect(response).not.toHaveProperty('assessmentVisitId');
    expect(response).not.toHaveProperty('primaryScaleInstanceIds');
  });

  it('returns a safe null generation for invalid metadata', () => {
    const report = createReport();
    report.metadata = { a20Generation: { rawSecret: 'must-not-leak' } };
    const response = mapper.toPublicReport(report);
    expect(response.generation).toBeNull();
    expect(JSON.stringify(response)).not.toContain('must-not-leak');
  });

  it('derives finality only for confirmed, archived and corrected reports', () => {
    for (const status of ['confirmed', 'archived', 'corrected'] as const) {
      const report = createReport();
      report.status = status;
      expect(mapper.toPublicReport(report).isFinal).toBe(true);
    }
    const voided = createReport();
    voided.status = 'voided';
    expect(mapper.toPublicReport(voided).isFinal).toBe(false);
  });
});
