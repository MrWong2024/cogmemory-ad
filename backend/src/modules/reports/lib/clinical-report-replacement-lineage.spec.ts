import type { ClinicalReportSummary } from '../services/reports.service';
import {
  assertClinicalReportReplacementLineageLink,
  ClinicalReportReplacementLineageRuleError,
} from './clinical-report-replacement-lineage';

const ids = {
  previous: '507f1f77bcf86cd799439011',
  current: '507f1f77bcf86cd799439012',
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
const lockedAt = new Date('2026-07-15T08:00:00.000Z');
const freezeCompletedAt = new Date('2026-07-15T08:30:00.000Z');
const archivedAt = new Date('2026-07-15T09:00:00.000Z');
const replacementCreatedAt = new Date('2026-07-15T09:10:00.000Z');
const correctedAt = new Date('2026-07-15T09:11:00.000Z');

function counts() {
  return {
    scaleInstanceCount: 1,
    itemResponseCount: 0,
    scoreResultCount: 1,
    cognitiveDomainResultCount: 1,
    mediaEvidenceCount: 0,
    totalSourceCount: 3,
  };
}

function zeroCounts() {
  return {
    scaleInstanceCount: 0,
    itemResponseCount: 0,
    scoreResultCount: 0,
    cognitiveDomainResultCount: 0,
    mediaEvidenceCount: 0,
    totalSourceCount: 0,
  };
}

function baseReport(
  overrides: Partial<ClinicalReportSummary> = {},
): ClinicalReportSummary {
  return {
    id: ids.previous,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    primaryScaleInstanceIds: [ids.instance],
    scoreResultIds: [ids.score],
    cognitiveDomainResultIds: [ids.domain],
    mediaEvidenceIds: [],
    subjectCode: 'SUBJ-A26-TEST-LINEAGE',
    reportCode: 'RPT-A26-PREVIOUS',
    reportType: 'cognitive_assessment',
    status: 'corrected',
    reportVersion: 1,
    source: 'mixed',
    patientSnapshot: null,
    visitSnapshot: null,
    scaleTraces: [],
    scoreSnapshots: [],
    domainSnapshots: [],
    evidenceSnapshots: [],
    narrative: null,
    aiDraft: null,
    confirmation: null,
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
    metadata: null,
    createdAt: new Date('2026-07-15T07:00:00.000Z'),
    updatedAt: correctedAt,
    ...overrides,
  };
}

function createPair(previousVersion = 1) {
  const currentVersion = previousVersion + 1;
  const previousCode = `RPT-A26-V${previousVersion}`;
  const currentCode = `RPT-A26-V${currentVersion}`;
  const correctionNo = currentVersion - 1;
  const freezeAudit = {
    version: 1,
    state: 'completed',
    freezeId,
    startedAt: lockedAt,
    sourceLockedAt: lockedAt,
    startedBy: ids.actor,
    startedByName: 'A26 Test Doctor',
    startedByRole: 'doctor',
    freezeNote: 'A26 de-identified freeze note',
    scope: {
      scaleInstanceIds: [ids.instance],
      itemResponseIds: [],
      scoreResultIds: [ids.score],
      cognitiveDomainResultIds: [ids.domain],
      mediaEvidenceIds: [],
    },
    expectedCounts: counts(),
    completedCounts: counts(),
    newlyFrozenCounts: counts(),
    previouslyFrozenCounts: zeroCounts(),
    completedAt: freezeCompletedAt,
    completedBy: ids.actor,
    completedByName: 'A26 Test Doctor',
    completedByRole: 'doctor',
  };
  const correctionAudit = {
    version: 1,
    state: 'completed',
    correctionId,
    correctionNo,
    startedAt: new Date('2026-07-15T09:05:00.000Z'),
    startedBy: ids.actor,
    startedByName: 'A26 Test Doctor',
    startedByRole: 'doctor',
    correctionReason: 'A26 de-identified correction reason',
    changeSummary: 'A26 de-identified change summary',
    previousReportCode: previousCode,
    previousReportVersion: previousVersion,
    replacementReportCode: currentCode,
    replacementReportVersion: currentVersion,
    sourceArchiveId: archiveId,
    sourceArchivedAt: archivedAt,
    sourceFreezeId: freezeId,
    sourceFreezeCompletedAt: freezeCompletedAt,
    replacementReportId: ids.current,
    replacementCreatedAt,
    completedAt: correctedAt,
    completedBy: ids.actor,
    completedByName: 'A26 Test Doctor',
    completedByRole: 'doctor',
  };
  const previous = baseReport({
    reportCode: previousCode,
    reportVersion: previousVersion,
    correctionRecords: [
      {
        correctionNo,
        correctedAt,
        correctedBy: ids.actor,
        correctedByName: 'A26 Test Doctor',
        reason: 'A26 de-identified correction reason',
        changeSummary: 'A26 de-identified change summary',
        previousReportCode: previousCode,
        replacementReportCode: currentCode,
        auditLogId: null,
      },
    ],
    metadata: {
      a22Lock: {
        version: 1,
        lockId,
        lockedAt,
        lockedBy: ids.actor,
        lockedByName: 'A26 Test Doctor',
        lockedByRole: 'doctor',
        lockNote: 'A26 de-identified lock note',
      },
      a23SourceFreeze: freezeAudit,
      a24Archive: {
        version: 1,
        archiveId,
        archivedAt,
        archivedBy: ids.actor,
        archivedByName: 'A26 Test Doctor',
        archivedByRole: 'doctor',
        archiveNote: 'A26 de-identified archive note',
        sourceFreezeId: freezeId,
        sourceFreezeCompletedAt: freezeCompletedAt,
      },
      a25Correction: correctionAudit,
    },
  });
  const current = baseReport({
    id: ids.current,
    reportCode: currentCode,
    reportVersion: currentVersion,
    status: 'confirmed',
    lockedAt: null,
    lockedBy: null,
    archivedAt: null,
    archivedBy: null,
    correctionRecords: [],
    createdAt: replacementCreatedAt,
    updatedAt: replacementCreatedAt,
    metadata: {
      a25CorrectionReplacement: {
        version: 1,
        correctionId,
        correctionNo,
        previousReportId: ids.previous,
        previousReportCode: previousCode,
        previousReportVersion: previousVersion,
        replacementReportCode: currentCode,
        replacementReportVersion: currentVersion,
        createdAt: replacementCreatedAt,
        createdBy: ids.actor,
        createdByName: 'A26 Test Doctor',
        createdByRole: 'doctor',
        correctionReason: 'A26 de-identified correction reason',
        changeSummary: 'A26 de-identified change summary',
        sourceArchiveId: archiveId,
        sourceArchivedAt: archivedAt,
        sourceFreezeId: freezeId,
        sourceFreezeCompletedAt: freezeCompletedAt,
      },
    },
  });
  return { current, previous };
}

function metadataOf(report: ClinicalReportSummary): Record<string, unknown> {
  if (!report.metadata || Array.isArray(report.metadata)) {
    throw new Error('Expected metadata record');
  }
  return report.metadata;
}

function expectInvalid(operation: () => void): void {
  try {
    operation();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ClinicalReportReplacementLineageRuleError);
    expect((error as ClinicalReportReplacementLineageRuleError).code).toBe(
      'CLINICAL_REPORT_REPLACEMENT_LINEAGE_INVALID',
    );
    return;
  }
  throw new Error('Expected replacement lineage validation to fail');
}

describe('clinical report replacement lifecycle lineage', () => {
  it('accepts legal V2 and V3 links and bypasses V1', () => {
    for (const previousVersion of [1, 2]) {
      const pair = createPair(previousVersion);
      expect(() =>
        assertClinicalReportReplacementLineageLink({
          currentReport: pair.current,
          previousReport: pair.previous,
        }),
      ).not.toThrow();
    }
    expect(() =>
      assertClinicalReportReplacementLineageLink({
        currentReport: baseReport({ status: 'confirmed', metadata: null }),
        previousReport: null,
      }),
    ).not.toThrow();
  });

  it('rejects missing or malformed replacement metadata and versions', () => {
    const pair = createPair();
    expectInvalid(() =>
      assertClinicalReportReplacementLineageLink({
        currentReport: { ...pair.current, metadata: {} },
        previousReport: pair.previous,
      }),
    );
    const lineage = metadataOf(pair.current).a25CorrectionReplacement as Record<
      string,
      unknown
    >;
    expectInvalid(() =>
      assertClinicalReportReplacementLineageLink({
        currentReport: {
          ...pair.current,
          metadata: {
            a25CorrectionReplacement: { ...lineage, version: 2 },
          },
        },
        previousReport: pair.previous,
      }),
    );
    expectInvalid(() =>
      assertClinicalReportReplacementLineageLink({
        currentReport: { ...pair.current, reportVersion: 3 },
        previousReport: pair.previous,
      }),
    );
    expectInvalid(() =>
      assertClinicalReportReplacementLineageLink({
        currentReport: { ...pair.current, reportVersion: 2.5 },
        previousReport: pair.previous,
      }),
    );
  });

  it.each(['patientId', 'assessmentVisitId', 'reportType'] as const)(
    'rejects a %s mismatch',
    (field) => {
      const pair = createPair();
      const replacement =
        field === 'reportType'
          ? { ...pair.current, reportType: 'follow_up' as const }
          : { ...pair.current, [field]: '507f1f77bcf86cd799439099' };
      expectInvalid(() =>
        assertClinicalReportReplacementLineageLink({
          currentReport: replacement,
          previousReport: pair.previous,
        }),
      );
    },
  );

  it('rejects a predecessor that is not corrected or not completed', () => {
    const pair = createPair();
    expectInvalid(() =>
      assertClinicalReportReplacementLineageLink({
        currentReport: pair.current,
        previousReport: { ...pair.previous, status: 'archived' },
      }),
    );
    const previousMetadata = metadataOf(pair.previous);
    const audit = previousMetadata.a25Correction as Record<string, unknown>;
    expectInvalid(() =>
      assertClinicalReportReplacementLineageLink({
        currentReport: pair.current,
        previousReport: {
          ...pair.previous,
          status: 'archived',
          correctionRecords: [],
          metadata: {
            ...previousMetadata,
            a25Correction: {
              ...audit,
              state: 'in_progress',
              replacementReportId: undefined,
              replacementCreatedAt: undefined,
              completedAt: undefined,
              completedBy: undefined,
              completedByName: undefined,
              completedByRole: undefined,
            },
          },
        },
      }),
    );
  });

  it('rejects correction mismatches and forged one-sided relationships', () => {
    const pair = createPair();
    const lineage = metadataOf(pair.current).a25CorrectionReplacement as Record<
      string,
      unknown
    >;
    expectInvalid(() =>
      assertClinicalReportReplacementLineageLink({
        currentReport: {
          ...pair.current,
          metadata: {
            a25CorrectionReplacement: {
              ...lineage,
              correctionId: '55555555-5555-4555-8555-555555555555',
            },
          },
        },
        previousReport: pair.previous,
      }),
    );
    expectInvalid(() =>
      assertClinicalReportReplacementLineageLink({
        currentReport: pair.current,
        previousReport: {
          ...pair.previous,
          metadata: {
            ...metadataOf(pair.previous),
            a25Correction: undefined,
          },
        },
      }),
    );
  });
});
