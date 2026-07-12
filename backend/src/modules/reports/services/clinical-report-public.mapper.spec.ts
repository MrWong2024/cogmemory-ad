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
      a21Edits: {
        version: 1,
        events: [
          {
            eventId: 'event-a21-test',
            editedAt: now,
            editedBy: '507f1f77bcf86cd799439020',
            editedByName: '脱敏医生',
            editedByRole: 'doctor',
            changedFields: ['doctorOpinion', 'recommendationText'],
            previousValues: {
              doctorOpinion: null,
              recommendationText: null,
            },
            nextValues: {
              doctorOpinion: 'private opinion',
              recommendationText: 'private recommendation',
            },
            editNote: 'private edit note',
          },
        ],
        lastEditedAt: now,
        lastEditedBy: '507f1f77bcf86cd799439020',
      },
      a21Submission: {
        version: 1,
        submissionId: 'submission-a21-test',
        submittedAt: now,
        submittedBy: '507f1f77bcf86cd799439020',
        submittedByName: '脱敏医生',
        submittedByRole: 'doctor',
        submissionNote: '脱敏提交说明',
      },
    },
    createdAt: now,
    updatedAt: now,
  };
}

describe('ClinicalReportPublicMapper', () => {
  const mapper = new ClinicalReportPublicMapper();

  it('maps only the explicit public report contract', () => {
    const response = mapper.toPublicReport(createReport());
    expect(response.archive).toBeNull();
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
    expect(response.lock).toBeNull();
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
    expect(response.narrative).toEqual(
      expect.objectContaining({
        recommendationText: 'private recommendation',
        doctorOpinion: 'private opinion',
      }),
    );
    expect(response.editorial).toEqual(
      expect.objectContaining({
        editCount: 1,
        lastChangedFields: ['doctorOpinion', 'recommendationText'],
      }),
    );
    expect(response.submission).toEqual(
      expect.objectContaining({ submissionId: 'submission-a21-test' }),
    );
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('private/object-key');
    expect(serialized).not.toContain('private-ai-text');
    expect(serialized).not.toContain('qualityHints');
    expect(response).not.toHaveProperty('metadata');
    expect(response).not.toHaveProperty('patientId');
    expect(response).not.toHaveProperty('assessmentVisitId');
    expect(response).not.toHaveProperty('primaryScaleInstanceIds');
    expect(response).not.toHaveProperty('editHistory');
    expect(serialized).not.toContain('previousValues');
    expect(serialized).not.toContain('nextValues');
    expect(serialized).not.toContain('private edit note');
  });

  it('returns a safe null generation for invalid metadata', () => {
    const report = createReport();
    report.metadata = { a20Generation: { rawSecret: 'must-not-leak' } };
    const response = mapper.toPublicReport(report);
    expect(response.generation).toBeNull();
    expect(response.editorial).toBeNull();
    expect(response.submission).toBeNull();
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

  it('adds a controlled confirmation id without exposing signature or actor id', () => {
    const report = createReport();
    report.status = 'confirmed';
    report.confirmation = {
      confirmedAt: now,
      confirmedBy: '507f1f77bcf86cd799439020',
      confirmedByName: '脱敏医生',
      confirmedByRole: 'doctor',
      confirmationNote: '脱敏确认说明',
      signatureText: 'must-not-leak',
    };
    if (report.metadata) {
      report.metadata.a21Confirmation = {
        version: 1,
        confirmationId: 'confirmation-a21-test',
        confirmedAt: now,
        confirmedBy: '507f1f77bcf86cd799439020',
        confirmedByName: '脱敏医生',
        confirmedByRole: 'doctor',
        confirmationNote: '脱敏确认说明',
      };
    }
    const response = mapper.toPublicReport(report);
    expect(response.confirmation).toEqual(
      expect.objectContaining({ confirmationId: 'confirmation-a21-test' }),
    );
    expect(JSON.stringify(response)).not.toContain('must-not-leak');
    expect(response.confirmation).not.toHaveProperty('confirmedBy');
  });

  it('maps a safe A22 lock summary and never exposes raw lockedBy', () => {
    const report = createReport();
    report.status = 'confirmed';
    report.lockedAt = now;
    report.lockedBy = '507f1f77bcf86cd799439020';
    if (report.metadata) {
      report.metadata.a22Lock = {
        version: 1,
        lockId: '11111111-1111-4111-8111-111111111111',
        lockedAt: now,
        lockedBy: report.lockedBy,
        lockedByName: 'A22 Test Doctor',
        lockedByRole: 'doctor',
        lockNote: '脱敏锁定说明',
      };
    }
    const response = mapper.toPublicReport(report);
    expect(response.lock).toEqual({
      lockId: '11111111-1111-4111-8111-111111111111',
      lockedAt: now,
      lockedBy: {
        operatorId: report.lockedBy,
        operatorName: 'A22 Test Doctor',
        operatorRole: 'doctor',
      },
      lockNote: '脱敏锁定说明',
    });
    expect(response).not.toHaveProperty('lockedBy');
    expect(response.isFinal).toBe(true);
  });

  it('uses historical fallback and safely ignores invalid A22 metadata', () => {
    const historical = createReport();
    historical.status = 'archived';
    historical.lockedAt = now;
    historical.lockedBy = '507f1f77bcf86cd799439020';
    expect(mapper.toPublicReport(historical).lock).toEqual({
      lockId: null,
      lockedAt: now,
      lockedBy: {
        operatorId: historical.lockedBy,
        operatorRole: 'unknown',
      },
    });

    if (historical.metadata) {
      historical.metadata.a22Lock = { lockNote: 'must-not-leak' };
    }
    const invalid = mapper.toPublicReport(historical);
    expect(invalid.lock).toBeNull();
    expect(JSON.stringify(invalid)).not.toContain('must-not-leak');
  });

  it('maps full A24 archive summary, historical fallback and invalid audit safely', () => {
    const report = createReport();
    const archivedAt = new Date('2026-07-12T10:00:00.000Z');
    const sourceFreezeCompletedAt = new Date('2026-07-12T09:30:00.000Z');
    const archivedBy = '507f1f77bcf86cd799439020';
    const freezeId = '22222222-2222-4222-8222-222222222222';
    report.status = 'archived';
    report.archivedAt = archivedAt;
    report.archivedBy = archivedBy;
    if (report.metadata) {
      report.metadata.a23SourceFreeze = {
        version: 1,
        state: 'completed',
        freezeId,
        startedAt: now,
        sourceLockedAt: now,
        startedBy: archivedBy,
        startedByName: 'A24 Test Doctor',
        startedByRole: 'doctor',
        freezeNote: '脱敏来源冻结说明',
        scope: {
          scaleInstanceIds: [...report.primaryScaleInstanceIds],
          itemResponseIds: ['507f1f77bcf86cd799439018'],
          scoreResultIds: [...report.scoreResultIds],
          cognitiveDomainResultIds: [...report.cognitiveDomainResultIds],
          mediaEvidenceIds: [...report.mediaEvidenceIds],
        },
        expectedCounts: {
          scaleInstanceCount: 1,
          itemResponseCount: 1,
          scoreResultCount: 1,
          cognitiveDomainResultCount: 1,
          mediaEvidenceCount: 1,
          totalSourceCount: 5,
        },
        completedCounts: {
          scaleInstanceCount: 1,
          itemResponseCount: 1,
          scoreResultCount: 1,
          cognitiveDomainResultCount: 1,
          mediaEvidenceCount: 1,
          totalSourceCount: 5,
        },
        newlyFrozenCounts: {
          scaleInstanceCount: 1,
          itemResponseCount: 1,
          scoreResultCount: 1,
          cognitiveDomainResultCount: 1,
          mediaEvidenceCount: 1,
          totalSourceCount: 5,
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
        completedBy: archivedBy,
        completedByName: 'A24 Test Doctor',
        completedByRole: 'doctor',
      };
      report.metadata.a24Archive = {
        version: 1,
        archiveId: '33333333-3333-4333-8333-333333333333',
        archivedAt,
        archivedBy,
        archivedByName: 'A24 Test Doctor',
        archivedByRole: 'doctor',
        archiveNote: '脱敏归档说明',
        sourceFreezeId: freezeId,
        sourceFreezeCompletedAt,
      };
    }

    expect(mapper.toPublicReport(report).archive).toEqual({
      archiveId: '33333333-3333-4333-8333-333333333333',
      archivedAt,
      archivedBy: {
        operatorId: archivedBy,
        operatorName: 'A24 Test Doctor',
        operatorRole: 'doctor',
      },
      archiveNote: '脱敏归档说明',
      sourceFreezeId: freezeId,
      sourceFreezeCompletedAt,
    });

    const historical = createReport();
    historical.status = 'corrected';
    historical.archivedAt = archivedAt;
    historical.archivedBy = archivedBy;
    historical.metadata = null;
    expect(mapper.toPublicReport(historical).archive).toEqual({
      archiveId: null,
      archivedAt,
      archivedBy: { operatorId: archivedBy, operatorRole: 'unknown' },
      sourceFreezeId: null,
      sourceFreezeCompletedAt: null,
    });

    if (report.metadata) {
      report.metadata.a24Archive = { archiveNote: 'must-not-leak' };
    }
    const invalid = mapper.toPublicReport(report);
    expect(invalid.archive).toBeNull();
    expect(invalid.archivedAt).toEqual(archivedAt);
    expect(JSON.stringify(invalid)).not.toContain('must-not-leak');
  });
});
