import type { ClinicalReportHistoryRecord } from '../services/reports.service';
import {
  ClinicalReportHistoryRuleError,
  evaluateClinicalReportHistoryLineage,
} from './clinical-report-history-lineage';

const patientId = '507f1f77bcf86cd799439011';
const visitId = '507f1f77bcf86cd799439012';
const actorId = '507f1f77bcf86cd799439013';
const instanceId = '507f1f77bcf86cd799439014';
const scoreId = '507f1f77bcf86cd799439015';
const domainId = '507f1f77bcf86cd799439016';
const reportIds = [
  '507f1f77bcf86cd799439021',
  '507f1f77bcf86cd799439022',
  '507f1f77bcf86cd799439023',
];

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

function createChain(total: number): ClinicalReportHistoryRecord[] {
  const confirmedAt = new Date('2026-07-19T07:00:00.000Z');
  const reports = Array.from({ length: total }, (_, index) => {
    const version = index + 1;
    const createdAt = new Date(`2026-07-19T0${version}:00:00.000Z`);
    return {
      id: reportIds[index],
      patientId,
      assessmentVisitId: visitId,
      reportCode: `RPT-HISTORY-V${version}`,
      reportType: 'cognitive_assessment' as const,
      status: 'confirmed' as const,
      reportVersion: version,
      source: 'mixed' as const,
      qualityStatus: 'passed' as const,
      confirmation: {
        confirmedAt,
        confirmedBy: actorId,
        confirmedByName: 'History Test Doctor',
        confirmedByRole: 'doctor' as const,
        confirmationNote: 'De-identified confirmation note',
      },
      lockedAt: null,
      lockedBy: null,
      archivedAt: null,
      archivedBy: null,
      correctionRecords: [],
      voidedAt: null,
      metadata: {
        a21Confirmation: {
          version: 1,
          confirmationId: `confirmation-${version}`,
          confirmedAt,
          confirmedBy: actorId,
          confirmedByName: 'History Test Doctor',
          confirmedByRole: 'doctor',
          confirmationNote: 'De-identified confirmation note',
        },
      },
      createdAt,
      updatedAt: createdAt,
    } satisfies ClinicalReportHistoryRecord;
  });
  for (let index = 0; index < reports.length - 1; index += 1) {
    const previous = reports[index];
    const current = reports[index + 1];
    const ordinal = index + 1;
    const lockId = `${ordinal}1111111-1111-4111-8111-111111111111`;
    const freezeId = `${ordinal}2222222-2222-4222-8222-222222222222`;
    const archiveId = `${ordinal}3333333-3333-4333-8333-333333333333`;
    const correctionId = `${ordinal}4444444-4444-4444-8444-444444444444`;
    const lockedAt = new Date(`2026-07-19T1${ordinal}:00:00.000Z`);
    const freezeCompletedAt = new Date(`2026-07-19T1${ordinal}:10:00.000Z`);
    const archivedAt = new Date(`2026-07-19T1${ordinal}:20:00.000Z`);
    const correctedAt = new Date(`2026-07-19T1${ordinal}:30:00.000Z`);
    const correction = {
      version: 1,
      state: 'completed',
      correctionId,
      correctionNo: current.reportVersion - 1,
      startedAt: archivedAt,
      startedBy: actorId,
      startedByName: 'History Test Doctor',
      startedByRole: 'doctor',
      correctionReason: 'De-identified correction reason',
      changeSummary: 'De-identified correction change summary',
      previousReportCode: previous.reportCode,
      previousReportVersion: previous.reportVersion,
      replacementReportCode: current.reportCode,
      replacementReportVersion: current.reportVersion,
      sourceArchiveId: archiveId,
      sourceArchivedAt: archivedAt,
      sourceFreezeId: freezeId,
      sourceFreezeCompletedAt: freezeCompletedAt,
      replacementReportId: current.id,
      replacementCreatedAt: current.createdAt,
      completedAt: correctedAt,
      completedBy: actorId,
      completedByName: 'History Test Doctor',
      completedByRole: 'doctor',
    };
    previous.status = 'corrected';
    previous.lockedAt = lockedAt;
    previous.lockedBy = actorId;
    previous.archivedAt = archivedAt;
    previous.archivedBy = actorId;
    previous.updatedAt = correctedAt;
    previous.correctionRecords = [
      {
        correctionNo: current.reportVersion - 1,
        correctedAt,
        correctedBy: actorId,
        correctedByName: 'History Test Doctor',
        reason: 'De-identified correction reason',
        changeSummary: 'De-identified correction change summary',
        previousReportCode: previous.reportCode,
        replacementReportCode: current.reportCode,
        auditLogId: null,
      },
    ];
    previous.metadata = {
      ...(previous.metadata ?? {}),
      a22Lock: {
        version: 1,
        lockId,
        lockedAt,
        lockedBy: actorId,
        lockedByName: 'History Test Doctor',
        lockedByRole: 'doctor',
        lockNote: 'De-identified lock note',
      },
      a23SourceFreeze: {
        version: 1,
        state: 'completed',
        freezeId,
        startedAt: lockedAt,
        sourceLockedAt: lockedAt,
        startedBy: actorId,
        startedByName: 'History Test Doctor',
        startedByRole: 'doctor',
        freezeNote: 'De-identified source freeze note',
        scope: {
          scaleInstanceIds: [instanceId],
          itemResponseIds: [],
          scoreResultIds: [scoreId],
          cognitiveDomainResultIds: [domainId],
          mediaEvidenceIds: [],
        },
        expectedCounts: counts(),
        completedCounts: counts(),
        newlyFrozenCounts: counts(),
        previouslyFrozenCounts: zeroCounts(),
        completedAt: freezeCompletedAt,
        completedBy: actorId,
        completedByName: 'History Test Doctor',
        completedByRole: 'doctor',
      },
      a24Archive: {
        version: 1,
        archiveId,
        archivedAt,
        archivedBy: actorId,
        archivedByName: 'History Test Doctor',
        archivedByRole: 'doctor',
        archiveNote: 'De-identified archive note',
        sourceFreezeId: freezeId,
        sourceFreezeCompletedAt: freezeCompletedAt,
      },
      a25Correction: correction,
    };
    current.metadata = {
      ...(current.metadata ?? {}),
      a25CorrectionReplacement: {
        version: 1,
        correctionId,
        correctionNo: current.reportVersion - 1,
        previousReportId: previous.id,
        previousReportCode: previous.reportCode,
        previousReportVersion: previous.reportVersion,
        replacementReportCode: current.reportCode,
        replacementReportVersion: current.reportVersion,
        createdAt: current.createdAt,
        createdBy: actorId,
        createdByName: 'History Test Doctor',
        createdByRole: 'doctor',
        correctionReason: 'De-identified correction reason',
        changeSummary: 'De-identified correction change summary',
        sourceArchiveId: archiveId,
        sourceArchivedAt: archivedAt,
        sourceFreezeId: freezeId,
        sourceFreezeCompletedAt: freezeCompletedAt,
      },
    };
  }
  return reports;
}

function evaluate(reports: ClinicalReportHistoryRecord[]) {
  return evaluateClinicalReportHistoryLineage({
    reports,
    patientId,
    assessmentVisitId: visitId,
  });
}

function expectKind(operation: () => unknown, kind: string): void {
  try {
    operation();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ClinicalReportHistoryRuleError);
    expect((error as ClinicalReportHistoryRuleError).kind).toBe(kind);
    return;
  }
  throw new Error('Expected history validation to fail');
}

describe('clinical report full history lineage', () => {
  it('accepts empty, V1, V2 and V3 chains', () => {
    expect(evaluate([])).toMatchObject({
      firstVersion: 0,
      latestVersion: 0,
      totalVersions: 0,
    });
    for (const total of [1, 2, 3]) {
      expect(evaluate(createChain(total))).toMatchObject({
        firstVersion: 1,
        latestVersion: total,
        totalVersions: total,
      });
    }
  });

  it.each([
    [
      'duplicate version',
      (reports: ClinicalReportHistoryRecord[]) => [
        ...reports,
        { ...reports[0], id: '507f1f77bcf86cd799439099' },
      ],
    ],
    [
      'missing V1',
      (reports: ClinicalReportHistoryRecord[]) => [
        { ...reports[0], reportVersion: 2 },
      ],
    ],
    [
      'missing middle',
      (reports: ClinicalReportHistoryRecord[]) => [reports[0], reports[2]],
    ],
    [
      'duplicate code',
      (reports: ClinicalReportHistoryRecord[]) => [
        reports[0],
        { ...reports[1], reportCode: reports[0].reportCode },
      ],
    ],
    [
      'ownership mismatch',
      (reports: ClinicalReportHistoryRecord[]) => [
        { ...reports[0], patientId: '507f1f77bcf86cd799439099' },
      ],
    ],
    [
      'corrected latest',
      (reports: ClinicalReportHistoryRecord[]) => [
        { ...reports[0], status: 'corrected' as const },
      ],
    ],
  ])('rejects %s as lineage invalid', (_label, mutate) => {
    expectKind(() => evaluate(mutate(createChain(3))), 'lineage_invalid');
  });

  it('distinguishes unsafe base and lifecycle data from lineage failures', () => {
    expectKind(
      () => evaluate([{ ...createChain(1)[0], updatedAt: null }]),
      'incomplete',
    );
    const malformed = createChain(1)[0];
    malformed.metadata = {
      ...(malformed.metadata ?? {}),
      a23SourceFreeze: { version: 2 },
    };
    expectKind(() => evaluate([malformed]), 'incomplete');
  });

  it('rejects skipped and one-sided hops without exposing partial lineage', () => {
    const skipped = createChain(3);
    const skippedMetadata = skipped[2].metadata as Record<string, unknown>;
    const skippedIncoming = skippedMetadata.a25CorrectionReplacement as Record<
      string,
      unknown
    >;
    skippedIncoming.previousReportId = skipped[0].id;
    expectKind(() => evaluate(skipped), 'lineage_invalid');

    const oneSided = createChain(2);
    const oneSidedMetadata = oneSided[1].metadata as Record<string, unknown>;
    delete oneSidedMetadata.a25CorrectionReplacement;
    expectKind(() => evaluate(oneSided), 'lineage_invalid');
  });

  it('allows a valid latest version with an in-progress outgoing correction', () => {
    const reports = createChain(3).slice(0, 2);
    const latest = reports[1];
    const metadata = latest.metadata as Record<string, unknown>;
    const completed = metadata.a25Correction as Record<string, unknown>;
    latest.status = 'archived';
    latest.correctionRecords = [];
    metadata.a25Correction = {
      ...completed,
      state: 'in_progress',
      completedAt: undefined,
      completedBy: undefined,
      completedByName: undefined,
      completedByRole: undefined,
    };
    expect(evaluate(reports)).toMatchObject({
      firstVersion: 1,
      latestVersion: 2,
      totalVersions: 2,
    });
  });
});
