// Node-only contract spec: production pure functions and bounded source checks only.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { ClinicalReportApiError } from '@/src/features/assessments/api/clinical-report-api';
import {
  refreshClinicalReportLatestAtMostOnce,
  shouldProhibitClinicalReportWrite,
  shouldRefreshClinicalReportAfterError,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow-recovery';
import {
  buildArchiveClinicalReportRequest,
  continueClinicalReportArchiveDraftWithLatest,
  createClinicalReportArchiveDraft,
  getClinicalReportArchiveConsistencyWarning,
  getClinicalReportArchiveEligibilityWarning,
  isClinicalReportArchivable,
  isClinicalReportArchiveDirty,
  isClinicalReportArchived,
  isSafeClinicalReportArchive,
  validateClinicalReportArchiveDraft,
} from '@/src/features/assessments/lib/clinical-report-archive-draft';
import { getClinicalReportLifecycleTarget } from '@/src/features/assessments/lib/clinical-report-lifecycle-target';
import type {
  ClinicalReport,
  ClinicalReportArchiveSummary,
  ClinicalReportSourceFreezeResourceCounts,
  ClinicalReportSourceFreezeSummary,
} from '@/src/features/assessments/types/clinical-report';

const reportId = '507f1f77bcf86cd799439031';
const previousReportId = '507f1f77bcf86cd799439032';
const latestReportId = '507f1f77bcf86cd799439033';
const operatorId = '507f1f77bcf86cd799439034';
const updatedAt = '2026-08-02T10:00:00.000Z';
const lockedAt = '2026-08-02T09:00:00.000Z';
const freezeCompletedAt = '2026-08-02T09:30:00.000Z';
const archivedAt = '2026-08-02T10:30:00.000Z';
const lockId = '11111111-1111-4111-8111-111111111111';
const freezeId = '22222222-2222-4222-8222-222222222222';
const archiveId = '33333333-3333-4333-8333-333333333333';
const zeroCounts: ClinicalReportSourceFreezeResourceCounts = {
  scaleInstanceCount: 0,
  itemResponseCount: 0,
  scoreResultCount: 0,
  cognitiveDomainResultCount: 0,
  mediaEvidenceCount: 0,
  totalSourceCount: 0,
};
const completedCounts: ClinicalReportSourceFreezeResourceCounts = {
  scaleInstanceCount: 1,
  itemResponseCount: 2,
  scoreResultCount: 1,
  cognitiveDomainResultCount: 1,
  mediaEvidenceCount: 1,
  totalSourceCount: 6,
};

function completedSourceFreeze(
  overrides: Partial<ClinicalReportSourceFreezeSummary> = {},
): ClinicalReportSourceFreezeSummary {
  return {
    freezeId,
    state: 'completed',
    startedAt: '2026-08-02T09:15:00.000Z',
    sourceLockedAt: '2026-08-02T09:15:00.000Z',
    startedBy: {
      operatorId,
      operatorName: 'B14 Doctor',
      operatorRole: 'doctor',
    },
    freezeNote: 'B14 de-identified source-freeze note',
    expectedCounts: completedCounts,
    completedCounts,
    newlyFrozenCounts: completedCounts,
    previouslyFrozenCounts: zeroCounts,
    completedAt: freezeCompletedAt,
    completedBy: {
      operatorId,
      operatorName: 'B14 Doctor',
      operatorRole: 'doctor',
    },
    ...overrides,
  };
}

function readyArchiveReport(
  overrides: Partial<ClinicalReport> = {},
): ClinicalReport {
  return {
    id: reportId,
    reportCode: 'RPT-B14-V1',
    reportType: 'cognitive_assessment',
    status: 'confirmed',
    reportVersion: 1,
    source: 'mixed',
    qualityStatus: 'passed',
    patientSnapshot: null,
    visitSnapshot: null,
    scaleTraces: [],
    scoreSnapshots: [],
    domainSnapshots: [],
    evidenceSnapshots: [],
    narrative: null,
    generation: null,
    editorial: null,
    submission: null,
    confirmation: {
      confirmationId: 'b14-confirmation',
      confirmedAt: '2026-08-02T08:30:00.000Z',
      confirmedByName: 'B14 Doctor',
      confirmedByRole: 'doctor',
      confirmationNote: 'B14 de-identified confirmation note',
    },
    lockedAt,
    lock: {
      lockId,
      lockedAt,
      lockedBy: {
        operatorId,
        operatorName: 'B14 Doctor',
        operatorRole: 'doctor',
      },
      lockNote: 'B14 de-identified lock note',
    },
    sourceFreeze: completedSourceFreeze(),
    archivedAt: null,
    archive: null,
    correction: null,
    replacementOf: null,
    voidedAt: null,
    createdAt: '2026-08-02T08:00:00.000Z',
    updatedAt,
    isFinal: true,
    ...overrides,
  };
}

function safeArchiveSummary(
  overrides: Partial<ClinicalReportArchiveSummary> = {},
): ClinicalReportArchiveSummary {
  return {
    archiveId,
    archivedAt,
    archivedBy: {
      operatorId,
      operatorName: 'B14 Doctor',
      operatorRole: 'doctor',
    },
    archiveNote: 'B14 de-identified archive note',
    sourceFreezeId: freezeId,
    sourceFreezeCompletedAt: freezeCompletedAt,
    ...overrides,
  };
}

function safeArchivedReport(
  overrides: Partial<ClinicalReport> = {},
): ClinicalReport {
  return readyArchiveReport({
    status: 'archived',
    archivedAt,
    archive: safeArchiveSummary(),
    updatedAt: archivedAt,
    ...overrides,
  });
}

function replacementArchiveReport(
  overrides: Partial<ClinicalReport> = {},
): ClinicalReport {
  return readyArchiveReport({
    reportCode: 'RPT-B14-V2',
    reportVersion: 2,
    replacementOf: {
      correctionId: '44444444-4444-4444-8444-444444444444',
      correctionNo: 1,
      previousReportId,
      previousReportCode: 'RPT-B14-V1',
      previousReportVersion: 1,
      replacementReportCode: 'RPT-B14-V2',
      replacementReportVersion: 2,
      createdAt: '2026-08-02T07:30:00.000Z',
      createdBy: {
        operatorId,
        operatorName: 'B14 Admin',
        operatorRole: 'admin',
      },
      correctionReason: 'B14 de-identified correction reason',
      changeSummary: 'B14 de-identified change summary',
      sourceArchiveId: '55555555-5555-4555-8555-555555555555',
      sourceArchivedAt: '2026-08-02T07:00:00.000Z',
      sourceFreezeId: '66666666-6666-4666-8666-666666666666',
      sourceFreezeCompletedAt: '2026-08-02T06:30:00.000Z',
    },
    ...overrides,
  });
}

function sourceSection(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing source marker: ${startMarker}`).toBeGreaterThan(-1);
  expect(end, `missing source marker: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

test.describe('B14 archive Node-only contracts', () => {
  test('C12 preserves representative V1 and replacement archive eligibility', () => {
    const ready = readyArchiveReport();
    expect(getClinicalReportArchiveEligibilityWarning(ready)).toBeNull();
    expect(isClinicalReportArchivable(ready)).toBe(true);

    const replacement = replacementArchiveReport();
    expect(getClinicalReportLifecycleTarget(replacement)).toEqual({
      kind: 'replacement',
      reportVersion: 2,
    });
    expect(getClinicalReportArchiveEligibilityWarning(replacement)).toBeNull();
    expect(isClinicalReportArchivable(replacement)).toBe(true);

    const blockedReports = [
      readyArchiveReport({ lockedAt: null, lock: null }),
      readyArchiveReport({
        sourceFreeze: completedSourceFreeze({
          state: 'in_progress',
          completedCounts: null,
          newlyFrozenCounts: null,
          completedAt: null,
          completedBy: null,
        }),
      }),
      safeArchivedReport(),
      readyArchiveReport({ archive: safeArchiveSummary() }),
      readyArchiveReport({ status: 'voided', voidedAt: updatedAt }),
      readyArchiveReport({ id: 'unsafe-report-id' }),
      readyArchiveReport({ updatedAt: 'unsafe-updated-at' }),
    ];
    for (const report of blockedReports) {
      expect(getClinicalReportArchiveEligibilityWarning(report)).not.toBeNull();
      expect(isClinicalReportArchivable(report)).toBe(false);
    }
  });

  test('C12 keeps current, inconsistent, and historical archive summaries distinct', () => {
    const archived = safeArchivedReport();
    expect(isClinicalReportArchived(archived)).toBe(true);
    expect(isSafeClinicalReportArchive(archived)).toBe(true);
    expect(getClinicalReportArchiveConsistencyWarning(archived)).toBeNull();

    const mismatchedAnchor = safeArchivedReport({
      archive: safeArchiveSummary({
        sourceFreezeId: '77777777-7777-4777-8777-777777777777',
      }),
    });
    expect(getClinicalReportArchiveConsistencyWarning(mismatchedAnchor)).toContain(
      '不一致',
    );
    expect(isSafeClinicalReportArchive(mismatchedAnchor)).toBe(false);

    const historical = safeArchivedReport({
      archive: safeArchiveSummary({
        archiveId: null,
        archivedBy: { operatorId: null, operatorRole: 'unknown' },
        archiveNote: undefined,
        sourceFreezeId: null,
        sourceFreezeCompletedAt: null,
      }),
    });
    expect(getClinicalReportArchiveConsistencyWarning(historical)).toBeNull();
    expect(isSafeClinicalReportArchive(historical)).toBe(true);
  });

  test('C12 binds, validates, and dirties the archive draft against server baselines', () => {
    const report = readyArchiveReport();
    const draft = createClinicalReportArchiveDraft(report);
    expect(draft).toEqual({
      reportId,
      baseUpdatedAt: updatedAt,
      baseStatus: 'confirmed',
      baseLockedAt: lockedAt,
      baseLockId: lockId,
      baseSourceFreezeId: freezeId,
      baseSourceFreezeCompletedAt: freezeCompletedAt,
      baseArchivedAt: null,
      archiveNote: '',
      confirmed: false,
      stale: false,
    });
    if (!draft) throw new Error('Expected an archive draft');

    expect(createClinicalReportArchiveDraft(safeArchivedReport())).toBeNull();
    expect(
      validateClinicalReportArchiveDraft(
        { ...draft, archiveNote: 'valid note' },
        report,
      ).valid,
    ).toBe(false);
    expect(
      validateClinicalReportArchiveDraft(
        { ...draft, archiveNote: ' x ', confirmed: true },
        report,
      ).valid,
    ).toBe(false);
    expect(
      validateClinicalReportArchiveDraft(
        { ...draft, archiveNote: 'valid note', confirmed: true, stale: true },
        report,
      ).valid,
    ).toBe(false);
    expect(
      validateClinicalReportArchiveDraft(
        { ...draft, archiveNote: 'valid note', confirmed: true },
        readyArchiveReport({ updatedAt: '2026-08-02T10:01:00.000Z' }),
      ).valid,
    ).toBe(false);
    expect(
      validateClinicalReportArchiveDraft(
        { ...draft, archiveNote: 'valid note', confirmed: true },
        report,
      ),
    ).toEqual({ valid: true, message: null });
    expect(isClinicalReportArchiveDirty({ ...draft, archiveNote: '   ' })).toBe(
      false,
    );
    expect(
      isClinicalReportArchiveDirty({ ...draft, archiveNote: 'local note' }),
    ).toBe(true);
  });

  test('C12 keeps the archive request to the exact client whitelist', () => {
    const draft = createClinicalReportArchiveDraft(readyArchiveReport());
    if (!draft) throw new Error('Expected an archive draft');
    const request = buildArchiveClinicalReportRequest({
      ...draft,
      archiveNote: '  B14 de-identified archive note  ',
      confirmed: true,
    });
    expect(Object.keys(request)).toEqual([
      'confirm',
      'archiveNote',
      'expectedUpdatedAt',
    ]);
    expect(request).toEqual({
      confirm: true,
      archiveNote: 'B14 de-identified archive note',
      expectedUpdatedAt: updatedAt,
    });
    for (const forbiddenKey of [
      'archiveId',
      'archivedAt',
      'archivedBy',
      'status',
      'sourceFreezeId',
      'metadata',
      'actor',
      'force',
      'unarchive',
      'correct',
      'void',
      'createPdf',
    ]) {
      expect(request).not.toHaveProperty(forbiddenKey);
    }
  });

  test('C12 continues only from a safe latest report and replaces every baseline', () => {
    const draft = createClinicalReportArchiveDraft(readyArchiveReport());
    if (!draft) throw new Error('Expected an archive draft');
    const staleDraft = {
      ...draft,
      archiveNote: '  B14 local note remains byte-for-byte  ',
      confirmed: true,
      stale: true,
    };
    const latestLockedAt = '2026-08-02T11:00:00.000Z';
    const latestFreezeCompletedAt = '2026-08-02T11:30:00.000Z';
    const latestLockId = '88888888-8888-4888-8888-888888888888';
    const latestFreezeId = '99999999-9999-4999-8999-999999999999';
    const latest = readyArchiveReport({
      id: latestReportId,
      updatedAt: '2026-08-02T12:00:00.000Z',
      lockedAt: latestLockedAt,
      lock: {
        lockId: latestLockId,
        lockedAt: latestLockedAt,
        lockedBy: {
          operatorId,
          operatorName: 'B14 Admin',
          operatorRole: 'admin',
        },
        lockNote: 'B14 latest lock note',
      },
      sourceFreeze: completedSourceFreeze({
        freezeId: latestFreezeId,
        completedAt: latestFreezeCompletedAt,
      }),
    });
    const continued = continueClinicalReportArchiveDraftWithLatest(
      staleDraft,
      latest,
    );
    expect(continued).toMatchObject({
      reportId: latestReportId,
      baseUpdatedAt: latest.updatedAt,
      baseLockedAt: latestLockedAt,
      baseLockId: latestLockId,
      baseSourceFreezeId: latestFreezeId,
      baseSourceFreezeCompletedAt: latestFreezeCompletedAt,
      archiveNote: staleDraft.archiveNote,
      confirmed: false,
      stale: false,
    });
    expect(continued?.reportId).not.toBe(staleDraft.reportId);
    expect(continued?.baseUpdatedAt).not.toBe(staleDraft.baseUpdatedAt);
    expect(continued?.baseLockId).not.toBe(staleDraft.baseLockId);
    expect(continued?.baseSourceFreezeId).not.toBe(
      staleDraft.baseSourceFreezeId,
    );

    const unsafeLatestReports = [
      safeArchivedReport(),
      safeArchivedReport({ status: 'corrected' }),
      readyArchiveReport({ status: 'voided', voidedAt: updatedAt }),
      readyArchiveReport({
        sourceFreeze: completedSourceFreeze({
          state: 'in_progress',
          completedCounts: null,
          newlyFrozenCounts: null,
          completedAt: null,
          completedBy: null,
        }),
      }),
      readyArchiveReport({
        sourceFreeze: completedSourceFreeze({ freezeId: 'unsafe-anchor' }),
      }),
    ];
    for (const unsafeLatest of unsafeLatestReports) {
      expect(
        continueClinicalReportArchiveDraftWithLatest(
          staleDraft,
          unsafeLatest,
        ),
      ).toBeNull();
    }
  });

  test('C13 classifies latest refresh and archive write prohibition without replay', async () => {
    for (const kind of [
      'clinical_report_not_archivable',
      'clinical_report_archive_conflict',
      'clinical_report_archive_failed',
    ] as const) {
      const error = new ClinicalReportApiError(kind);
      expect(shouldRefreshClinicalReportAfterError(error)).toBe(true);
      let refreshCount = 0;
      await refreshClinicalReportLatestAtMostOnce(error, async () => {
        refreshCount += 1;
        return readyArchiveReport();
      });
      expect(refreshCount).toBe(1);
      expect(shouldProhibitClinicalReportWrite('archive', error)).toBe(false);
    }

    for (const kind of ['service_unavailable', 'unknown'] as const) {
      const error = new ClinicalReportApiError(kind);
      expect(shouldRefreshClinicalReportAfterError(error)).toBe(false);
      let refreshCount = 0;
      await refreshClinicalReportLatestAtMostOnce(error, async () => {
        refreshCount += 1;
        return readyArchiveReport();
      });
      expect(refreshCount).toBe(0);
    }

    expect(
      shouldProhibitClinicalReportWrite(
        'archive',
        new ClinicalReportApiError(
          'clinical_report_archive_audit_unavailable',
        ),
      ),
    ).toBe(true);
    expect(
      shouldProhibitClinicalReportWrite(
        'archive',
        new ClinicalReportApiError('clinical_report_metadata_unsupported'),
      ),
    ).toBe(true);
    expect(
      shouldProhibitClinicalReportWrite(
        'archive',
        new ClinicalReportApiError(
          'clinical_report_replacement_lineage_invalid',
        ),
      ),
    ).toBe(true);
  });

  test('C13 keeps one archive POST boundary and separates success, error, and manual latest', () => {
    const actionSource = readFileSync(
      resolve(
        process.cwd(),
        'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportArchiveAction.ts',
      ),
      'utf8',
    );
    expect(actionSource.match(/\barchiveClinicalReport\s*\(/g)).toHaveLength(1);
    expect(actionSource.match(/\bcoordinator\.execute\s*\(/g)).toHaveLength(1);
    expect(
      actionSource.match(/\bcoordinator\.refreshAfterError\s*\(error\)/g),
    ).toHaveLength(1);

    const requestSource = sourceSection(
      actionSource,
      'request: () =>',
      'onSuccess:',
    );
    expect(requestSource.match(/\barchiveClinicalReport\s*\(/g)).toHaveLength(
      1,
    );

    const successSource = sourceSection(actionSource, 'onSuccess:', 'onError:');
    expect(successSource).toContain(
      'coordinator.applyReportUpdate(response.report)',
    );
    expect(successSource).toContain('coordinator.completeArchive(');

    const errorSource = sourceSection(
      actionSource,
      'onError:',
      '  }, [\n    archiveDraft,',
    );
    expect(errorSource).toContain('setArchiveError(error)');
    expect(errorSource).toContain('coordinator.refreshAfterError(error)');
    expect(errorSource).not.toContain('archiveClinicalReport(');
    expect(errorSource).toMatch(
      /error\.kind === 'service_unavailable'[\s\S]*error\.kind === 'unknown'/,
    );
    expect(errorSource).toMatch(/confirmed: false, stale: true/);

    const manualSource = sourceSection(
      actionSource,
      'const reloadLatestAfterArchiveUncertainty',
      'const confirmArchive',
    );
    expect(manualSource).toContain('coordinator.refreshLatest()');
    expect(manualSource).not.toContain('refreshAfterError');
    expect(manualSource).not.toContain('archiveClinicalReport(');

    const automaticSource = actionSource.slice(
      actionSource.indexOf('const confirmArchive'),
    );
    expect(automaticSource).not.toMatch(
      /\bwhile\s*\(|\bfor\s*\(|setInterval\s*\(|poll(?:ing)?\s*\(/i,
    );
    expect(automaticSource).not.toMatch(/\bconfirmArchive\s*\(/);
  });

  test('C13 keeps role, note confirmation reset, and baseline staleness bounded', () => {
    const actionSource = readFileSync(
      resolve(
        process.cwd(),
        'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportArchiveAction.ts',
      ),
      'utf8',
    );
    const roleSource = sourceSection(
      actionSource,
      'const roleCanArchive',
      'const archiveDirty',
    );
    expect(roleSource.match(/role === '(doctor|admin)'/g)).toEqual([
      "role === 'doctor'",
      "role === 'admin'",
    ]);
    expect(roleSource).not.toContain("role === 'nurse'");

    const noteSource = sourceSection(
      actionSource,
      'const updateArchiveNote',
      'const setArchiveConfirmed',
    );
    expect(noteSource).toContain('archiveNote: value, confirmed: false');

    const staleSource = sourceSection(
      actionSource,
      'useEffect(() =>',
      'const openArchive',
    );
    expect(staleSource).toContain(
      '!clinicalReportArchiveDraftMatchesReport(archiveDraft, report)',
    );
    expect(staleSource).toContain('confirmed: false, stale: true');
  });
});
