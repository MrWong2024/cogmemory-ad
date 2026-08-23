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
  buildFreezeClinicalReportSourcesRequest,
  continueClinicalReportSourceFreezeDraftWithLatest,
  createClinicalReportSourceFreezeResumeDraft,
  createClinicalReportSourceFreezeStartDraft,
  getClinicalReportSourceFreezeConsistencyWarning,
  getClinicalReportSourceFreezeResumeEligibilityWarning,
  getClinicalReportSourceFreezeStartEligibilityWarning,
  isClinicalReportSourceFreezeDirty,
  isSafeClinicalReportSourceFreezeCounts,
  validateClinicalReportSourceFreezeDraft,
} from '@/src/features/assessments/lib/clinical-report-source-freeze-draft';
import { getClinicalReportLifecycleTarget } from '@/src/features/assessments/lib/clinical-report-lifecycle-target';
import type {
  ClinicalReport,
  ClinicalReportSourceFreezeResourceCounts,
  ClinicalReportSourceFreezeSummary,
} from '@/src/features/assessments/types/clinical-report';

const reportId = '507f1f77bcf86cd799439021';
const latestReportId = '507f1f77bcf86cd799439022';
const updatedAt = '2026-08-02T08:00:00.000Z';
const latestUpdatedAt = '2026-08-02T09:00:00.000Z';
const lockedAt = '2026-08-02T07:30:00.000Z';
const freezeId = 'b13-source-freeze-id';
const persistedFreezeNote = 'B13 persisted source-freeze note';
const expectedCounts: ClinicalReportSourceFreezeResourceCounts = {
  scaleInstanceCount: 1,
  itemResponseCount: 2,
  scoreResultCount: 1,
  cognitiveDomainResultCount: 1,
  mediaEvidenceCount: 1,
  totalSourceCount: 6,
};
const zeroCounts: ClinicalReportSourceFreezeResourceCounts = {
  scaleInstanceCount: 0,
  itemResponseCount: 0,
  scoreResultCount: 0,
  cognitiveDomainResultCount: 0,
  mediaEvidenceCount: 0,
  totalSourceCount: 0,
};

function eligibleLockedReport(overrides: Partial<ClinicalReport> = {}): ClinicalReport {
  return {
    id: reportId,
    reportCode: 'RPT-B13-V1',
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
      confirmationId: 'b13-confirmation',
      confirmedAt: '2026-08-02T07:00:00.000Z',
      confirmedByName: 'B13 Doctor',
      confirmedByRole: 'doctor',
    },
    lockedAt,
    lock: {
      lockId: 'b13-lock',
      lockedAt,
      lockedBy: { operatorId: reportId, operatorName: 'B13 Doctor', operatorRole: 'doctor' },
      lockNote: 'B13 report lock note',
    },
    sourceFreeze: null,
    archivedAt: null,
    archive: null,
    correction: null,
    replacementOf: null,
    voidedAt: null,
    createdAt: '2026-08-02T06:00:00.000Z',
    updatedAt,
    isFinal: true,
    ...overrides,
  };
}

function inProgressSourceFreeze(
  overrides: Partial<ClinicalReportSourceFreezeSummary> = {},
): ClinicalReportSourceFreezeSummary {
  return {
    freezeId,
    state: 'in_progress',
    startedAt: '2026-08-02T08:10:00.000Z',
    sourceLockedAt: '2026-08-02T08:10:00.000Z',
    startedBy: { operatorId: reportId, operatorName: 'B13 Doctor', operatorRole: 'doctor' },
    freezeNote: persistedFreezeNote,
    expectedCounts,
    completedCounts: null,
    newlyFrozenCounts: null,
    previouslyFrozenCounts: zeroCounts,
    completedAt: null,
    completedBy: null,
    ...overrides,
  };
}

function completedSourceFreeze(
  overrides: Partial<ClinicalReportSourceFreezeSummary> = {},
): ClinicalReportSourceFreezeSummary {
  return {
    ...inProgressSourceFreeze(),
    state: 'completed',
    completedCounts: expectedCounts,
    newlyFrozenCounts: expectedCounts,
    completedAt: '2026-08-02T08:11:00.000Z',
    completedBy: { operatorId: reportId, operatorName: 'B13 Doctor', operatorRole: 'doctor' },
    ...overrides,
  };
}

function replacementReport(overrides: Partial<ClinicalReport> = {}): ClinicalReport {
  return eligibleLockedReport({
    reportCode: 'RPT-B13-V2',
    reportVersion: 2,
    replacementOf: {
      correctionId: '0f35b65d-94f2-4bd1-8b51-55ae6e31c307',
      correctionNo: 1,
      previousReportId: latestReportId,
      previousReportCode: 'RPT-B13-V1',
      previousReportVersion: 1,
      replacementReportCode: 'RPT-B13-V2',
      replacementReportVersion: 2,
      createdAt: '2026-08-02T06:30:00.000Z',
      createdBy: { operatorId: reportId, operatorName: 'B13 Admin', operatorRole: 'admin' },
      correctionReason: 'B13 safe correction reason',
      changeSummary: 'B13 safe change summary',
      sourceArchiveId: '376b474a-1329-48e3-ae4d-a17eb87027bb',
      sourceArchivedAt: '2026-08-02T06:10:00.000Z',
      sourceFreezeId: 'c26982a8-0600-444c-b59a-b71d490f643a',
      sourceFreezeCompletedAt: '2026-08-02T06:20:00.000Z',
    },
    ...overrides,
  });
}

test.describe('B13 source-freeze Node-only contracts', () => {
  test('G4 preserves representative start eligibility, lineage, and role boundaries', () => {
    const actionSource = readFileSync(
      resolve(process.cwd(), 'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportSourceFreezeAction.ts'),
      'utf8',
    );
    const roleStart = actionSource.indexOf('const roleCanFreezeSources');
    const roleEnd = actionSource.indexOf('const sourceFreezeDirty', roleStart);
    const rolePredicate = actionSource.slice(roleStart, roleEnd);
    expect(roleStart).toBeGreaterThan(-1);
    expect(roleEnd).toBeGreaterThan(roleStart);
    expect(rolePredicate.match(/role === '(doctor|admin)'/g)).toEqual([
      "role === 'doctor'",
      "role === 'admin'",
    ]);
    expect(rolePredicate).not.toContain("role === 'nurse'");

    expect(getClinicalReportSourceFreezeStartEligibilityWarning(eligibleLockedReport(), 'completed')).toBeNull();
    expect(getClinicalReportSourceFreezeStartEligibilityWarning(
      eligibleLockedReport({ lockedAt: null, lock: null }), 'completed',
    )).not.toBeNull();
    expect(getClinicalReportSourceFreezeStartEligibilityWarning(
      eligibleLockedReport({ sourceFreeze: inProgressSourceFreeze() }), 'completed',
    )).not.toBeNull();
    expect(getClinicalReportSourceFreezeStartEligibilityWarning(
      eligibleLockedReport({ status: 'archived', archivedAt: updatedAt }), 'completed',
    )).not.toBeNull();
    expect(getClinicalReportSourceFreezeStartEligibilityWarning(
      eligibleLockedReport({ status: 'voided', voidedAt: updatedAt }), 'completed',
    )).not.toBeNull();

    const replacement = replacementReport();
    expect(getClinicalReportLifecycleTarget(replacement)).toEqual({ kind: 'replacement', reportVersion: 2 });
    expect(getClinicalReportSourceFreezeStartEligibilityWarning(replacement, 'locked')).toBeNull();
  });

  test('G4 allows safe in-progress resume and keeps completed or unsafe reports read-only', () => {
    const resumable = eligibleLockedReport({ sourceFreeze: inProgressSourceFreeze() });
    expect(getClinicalReportSourceFreezeConsistencyWarning(resumable.sourceFreeze)).toBeNull();
    expect(getClinicalReportSourceFreezeResumeEligibilityWarning(resumable)).toBeNull();
    expect(createClinicalReportSourceFreezeResumeDraft(resumable)).not.toBeNull();
    expect(getClinicalReportSourceFreezeResumeEligibilityWarning(
      eligibleLockedReport({ sourceFreeze: completedSourceFreeze() }),
    )).toContain('已经冻结完成');
    expect(getClinicalReportSourceFreezeResumeEligibilityWarning(eligibleLockedReport({
      status: 'archived', archivedAt: updatedAt, sourceFreeze: inProgressSourceFreeze(),
    }))).not.toBeNull();
    expect(getClinicalReportSourceFreezeResumeEligibilityWarning(eligibleLockedReport({
      status: 'corrected', sourceFreeze: inProgressSourceFreeze(),
    }))).not.toBeNull();
    expect(getClinicalReportSourceFreezeResumeEligibilityWarning(eligibleLockedReport({
      status: 'voided', voidedAt: updatedAt, sourceFreeze: inProgressSourceFreeze(),
    }))).not.toBeNull();

    const unsafe = eligibleLockedReport({ sourceFreeze: inProgressSourceFreeze({ freezeNote: 'x' }) });
    expect(getClinicalReportSourceFreezeResumeEligibilityWarning(unsafe)).not.toBeNull();
    expect(createClinicalReportSourceFreezeResumeDraft(unsafe)).toBeNull();
  });

  test('G4 preserves start and resume draft semantics and validation', () => {
    const start = createClinicalReportSourceFreezeStartDraft(eligibleLockedReport());
    expect(start).toEqual({
      mode: 'start', reportId, baseUpdatedAt: updatedAt, freezeId: null, freezeNote: '',
      confirmed: false, stale: false, usesPersistedNote: false,
    });
    if (!start) throw new Error('Expected a start draft');
    expect(validateClinicalReportSourceFreezeDraft({
      ...start, freezeNote: ' x ', confirmed: true,
    }).valid).toBe(false);
    expect(validateClinicalReportSourceFreezeDraft({ ...start, freezeNote: 'valid note' }).valid).toBe(false);
    expect(validateClinicalReportSourceFreezeDraft({
      ...start, freezeNote: 'valid note', confirmed: true, stale: true,
    }).valid).toBe(false);
    expect(validateClinicalReportSourceFreezeDraft({
      ...start, freezeNote: 'valid note', confirmed: true,
    })).toEqual({ valid: true, message: null });

    const resume = createClinicalReportSourceFreezeResumeDraft(
      eligibleLockedReport({ sourceFreeze: inProgressSourceFreeze() }),
    );
    if (!resume) throw new Error('Expected a resume draft');
    expect(resume.freezeId).toBe(freezeId);
    expect(resume.freezeNote).toBe(persistedFreezeNote);
    expect(resume.usesPersistedNote).toBe(true);
    expect(validateClinicalReportSourceFreezeDraft({ ...resume, confirmed: true })).toEqual({
      valid: true, message: null,
    });
    expect(validateClinicalReportSourceFreezeDraft({
      ...resume, confirmed: true, freezeId: null,
    }).valid).toBe(false);
    expect(validateClinicalReportSourceFreezeDraft({
      ...resume, confirmed: true, usesPersistedNote: false,
    }).valid).toBe(false);
    expect(isClinicalReportSourceFreezeDirty({ ...start, freezeNote: 'local' })).toBe(true);
    expect(isClinicalReportSourceFreezeDirty(resume)).toBe(false);
  });

  test('G4 keeps the request whitelist and safe count composition', () => {
    const start = createClinicalReportSourceFreezeStartDraft(eligibleLockedReport());
    if (!start) throw new Error('Expected a start draft');
    const request = buildFreezeClinicalReportSourcesRequest({
      ...start, freezeNote: '  B13 de-identified note  ', confirmed: true,
    });
    expect(Object.keys(request)).toEqual(['confirm', 'freezeNote', 'expectedUpdatedAt']);
    expect(request).toEqual({
      confirm: true,
      freezeNote: 'B13 de-identified note',
      expectedUpdatedAt: updatedAt,
    });
    expect(isSafeClinicalReportSourceFreezeCounts(expectedCounts)).toBe(true);
    expect(getClinicalReportSourceFreezeConsistencyWarning(completedSourceFreeze())).toBeNull();
    expect(getClinicalReportSourceFreezeConsistencyWarning(completedSourceFreeze({
      expectedCounts: { ...expectedCounts, totalSourceCount: 7 },
    }))).not.toBeNull();
  });

  test('G4 keeps latest continuation faithful for start and resume drafts', () => {
    const start = createClinicalReportSourceFreezeStartDraft(eligibleLockedReport());
    if (!start) throw new Error('Expected a start draft');
    const staleStart = {
      ...start, freezeNote: '  local note remains byte-for-byte  ', confirmed: true, stale: true,
    };
    const continuedStart = continueClinicalReportSourceFreezeDraftWithLatest(
      staleStart,
      eligibleLockedReport({ id: latestReportId, updatedAt: latestUpdatedAt }),
    );
    expect(continuedStart?.reportId).toBe(latestReportId);
    expect(continuedStart?.baseUpdatedAt).toBe(latestUpdatedAt);
    expect(continuedStart?.freezeNote).toBe(staleStart.freezeNote);
    expect(continuedStart?.confirmed).toBe(false);
    expect(continuedStart?.stale).toBe(false);
    expect(continueClinicalReportSourceFreezeDraftWithLatest(
      staleStart, eligibleLockedReport({ sourceFreeze: inProgressSourceFreeze() }),
    )).toBeNull();

    const resume = createClinicalReportSourceFreezeResumeDraft(
      eligibleLockedReport({ sourceFreeze: inProgressSourceFreeze() }),
    );
    if (!resume) throw new Error('Expected a resume draft');
    const continuedResume = continueClinicalReportSourceFreezeDraftWithLatest(
      { ...resume, confirmed: true, stale: true },
      eligibleLockedReport({
        updatedAt: latestUpdatedAt,
        sourceFreeze: inProgressSourceFreeze({ freezeNote: 'B13 latest persisted note' }),
      }),
    );
    expect(continuedResume?.freezeId).toBe(freezeId);
    expect(continuedResume?.freezeNote).toBe('B13 latest persisted note');
    expect(continuedResume?.confirmed).toBe(false);
    expect(continuedResume?.usesPersistedNote).toBe(true);
    expect(continueClinicalReportSourceFreezeDraftWithLatest(
      { ...resume, stale: true },
      eligibleLockedReport({ sourceFreeze: inProgressSourceFreeze({ freezeId: 'changed-freeze-id' }) }),
    )).toBeNull();
    expect(continueClinicalReportSourceFreezeDraftWithLatest(
      { ...resume, stale: true },
      eligibleLockedReport({ sourceFreeze: completedSourceFreeze() }),
    )).toBeNull();
  });

  test('G5 classifies latest refresh and write prohibition without replay', async () => {
    const notFreezable = new ClinicalReportApiError('clinical_report_not_source_freezable');
    const conflict = new ClinicalReportApiError('clinical_report_source_freeze_conflict');
    const incomplete = new ClinicalReportApiError('clinical_report_source_freeze_incomplete');
    const failed = new ClinicalReportApiError('clinical_report_source_freeze_failed');
    expect(shouldRefreshClinicalReportAfterError(notFreezable)).toBe(true);
    expect(shouldRefreshClinicalReportAfterError(conflict)).toBe(true);
    expect(shouldRefreshClinicalReportAfterError(incomplete)).toBe(true);
    expect(shouldRefreshClinicalReportAfterError(failed)).toBe(true);

    let refreshCount = 0;
    const refreshLatest = async () => {
      refreshCount += 1;
      return eligibleLockedReport();
    };
    await refreshClinicalReportLatestAtMostOnce(notFreezable, refreshLatest);
    await refreshClinicalReportLatestAtMostOnce(conflict, refreshLatest);
    await refreshClinicalReportLatestAtMostOnce(incomplete, refreshLatest);
    await refreshClinicalReportLatestAtMostOnce(failed, refreshLatest);
    expect(refreshCount).toBe(4);

    const unavailable = new ClinicalReportApiError('service_unavailable');
    const unknown = new ClinicalReportApiError('unknown');
    expect(shouldRefreshClinicalReportAfterError(unavailable)).toBe(false);
    expect(shouldRefreshClinicalReportAfterError(unknown)).toBe(false);
    await refreshClinicalReportLatestAtMostOnce(unavailable, refreshLatest);
    await refreshClinicalReportLatestAtMostOnce(unknown, refreshLatest);
    expect(refreshCount).toBe(4);

    expect(shouldProhibitClinicalReportWrite('source_freeze', new ClinicalReportApiError(
      'clinical_report_source_freeze_scope_invalid',
    ))).toBe(true);
    expect(shouldProhibitClinicalReportWrite('source_freeze', new ClinicalReportApiError(
      'clinical_report_source_freeze_input_invalid',
    ))).toBe(true);
    expect(shouldProhibitClinicalReportWrite('source_freeze', new ClinicalReportApiError(
      'clinical_report_source_freeze_audit_unavailable',
    ))).toBe(true);
    expect(shouldProhibitClinicalReportWrite('source_freeze', conflict)).toBe(false);
    expect(shouldProhibitClinicalReportWrite('source_freeze', incomplete)).toBe(false);
    expect(shouldProhibitClinicalReportWrite('source_freeze', failed)).toBe(false);
  });

  test('G5 keeps one production POST path and separates automatic and manual recovery', () => {
    const actionSource = readFileSync(
      resolve(process.cwd(), 'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportSourceFreezeAction.ts'),
      'utf8',
    );
    expect(actionSource.match(/\bfreezeClinicalReportSources\s*\(/g)).toHaveLength(1);
    expect(actionSource.match(/\bcoordinator\.execute\s*\(/g)).toHaveLength(1);
    expect(actionSource.match(/\bcoordinator\.refreshAfterError\s*\(error\)/g)).toHaveLength(1);

    const requestStart = actionSource.indexOf('request: () =>');
    const successStart = actionSource.indexOf('onSuccess:', requestStart);
    const requestSource = actionSource.slice(requestStart, successStart);
    expect(requestStart).toBeGreaterThan(-1);
    expect(successStart).toBeGreaterThan(requestStart);
    expect(requestSource.match(/\bfreezeClinicalReportSources\s*\(/g)).toHaveLength(1);

    const manualStart = actionSource.indexOf('const reloadLatestAfterSourceFreezeUncertainty');
    const confirmStart = actionSource.indexOf('const confirmSourceFreeze', manualStart);
    const manualSource = actionSource.slice(manualStart, confirmStart);
    const automaticSource = actionSource.slice(confirmStart);
    expect(manualStart).toBeGreaterThan(-1);
    expect(confirmStart).toBeGreaterThan(manualStart);
    expect(manualSource).toContain('coordinator.refreshLatest()');
    expect(manualSource).not.toContain('refreshAfterError');
    expect(automaticSource).toContain('coordinator.refreshAfterError(error)');
    expect(automaticSource.match(/\bfreezeClinicalReportSources\s*\(/g)).toHaveLength(1);
    expect(automaticSource).not.toMatch(/\bwhile\s*\(|\bfor\s*\(|setInterval\s*\(/);
    expect(automaticSource).not.toMatch(/\bconfirmSourceFreeze\s*\(/);
  });
});
