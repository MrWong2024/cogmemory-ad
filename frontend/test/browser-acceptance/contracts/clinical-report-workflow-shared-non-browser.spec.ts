// Node-only contract spec: production reducer behavior and bounded source checks only.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { ClinicalReportApiError } from '@/src/features/assessments/api/clinical-report-api';
import {
  clinicalReportWorkflowReducer,
  createClinicalReportWorkflowState,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.state';
import type { ClinicalReportWorkflowState } from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.types';
import type { ClinicalReportArchiveDraft } from '@/src/features/assessments/lib/clinical-report-archive-draft';
import type { CorrectionDraft } from '@/src/features/assessments/lib/clinical-report-correction-draft';
import type { ClinicalReportSourceFreezeDraft } from '@/src/features/assessments/lib/clinical-report-source-freeze-draft';
import type {
  ArchiveClinicalReportReceipt,
  CreateClinicalReportCorrectionReceipt,
} from '@/src/features/assessments/types/clinical-report';

const reportId = '507f1f77bcf86cd799439041';
const updatedAt = '2026-08-02T12:00:00.000Z';
const operator = {
  operatorId: '507f1f77bcf86cd799439042',
  operatorName: 'Shared Workflow Doctor',
  operatorRole: 'doctor' as const,
};
const archiveDraft: ClinicalReportArchiveDraft = {
  reportId,
  baseUpdatedAt: updatedAt,
  baseStatus: 'confirmed',
  baseLockedAt: '2026-08-02T10:00:00.000Z',
  baseLockId: '11111111-1111-4111-8111-111111111111',
  baseSourceFreezeId: '22222222-2222-4222-8222-222222222222',
  baseSourceFreezeCompletedAt: '2026-08-02T11:00:00.000Z',
  baseArchivedAt: null,
  archiveNote: 'Shared workflow archive note',
  confirmed: true,
  stale: false,
};
const sourceFreezeDraft: ClinicalReportSourceFreezeDraft = {
  mode: 'start',
  reportId,
  baseUpdatedAt: updatedAt,
  freezeId: null,
  freezeNote: 'Shared workflow source-freeze note',
  confirmed: false,
  stale: false,
  usesPersistedNote: false,
};
const correctionDraft: CorrectionDraft = {
  mode: 'start',
  sourceReportId: reportId,
  baseUpdatedAt: updatedAt,
  correctionId: null,
  correctionReason: 'Shared workflow correction reason',
  changeSummary: 'Shared workflow change summary',
  confirmed: false,
  stale: false,
  usesPersistedContent: false,
};
const archiveReceipt: ArchiveClinicalReportReceipt = {
  archiveId: '33333333-3333-4333-8333-333333333333',
  archivedAt: '2026-08-02T12:30:00.000Z',
  archivedBy: operator,
  archiveNote: 'Shared workflow archive receipt',
  sourceFreezeId: '22222222-2222-4222-8222-222222222222',
  sourceFreezeCompletedAt: '2026-08-02T11:00:00.000Z',
  alreadyArchived: false,
};
const correctionReceipt: CreateClinicalReportCorrectionReceipt = {
  sourceReportId: reportId,
  replacementReportId: '507f1f77bcf86cd799439043',
  correctionId: '44444444-4444-4444-8444-444444444444',
  correctionNo: 1,
  state: 'completed',
  startedAt: '2026-08-02T13:00:00.000Z',
  startedBy: operator,
  completedAt: '2026-08-02T13:01:00.000Z',
  completedBy: operator,
  correctionReason: 'Shared workflow correction reason',
  changeSummary: 'Shared workflow change summary',
  previousReportCode: 'RPT-SHARED-V1',
  previousReportVersion: 1,
  replacementReportCode: 'RPT-SHARED-V2',
  replacementReportVersion: 2,
  alreadyCreated: false,
  resumedExisting: false,
};

function nonEmptyWorkflowState(): ClinicalReportWorkflowState {
  const initial = createClinicalReportWorkflowState();
  return {
    ...initial,
    activeMode: 'correction',
    writingAction: 'archive',
    archive: {
      draft: archiveDraft,
      error: new ClinicalReportApiError('clinical_report_archive_conflict'),
      receipt: archiveReceipt,
    },
    sourceFreeze: {
      draft: sourceFreezeDraft,
      error: new ClinicalReportApiError(
        'clinical_report_source_freeze_conflict',
      ),
      receipt: null,
    },
    correction: {
      draft: correctionDraft,
      error: new ClinicalReportApiError('clinical_report_correction_conflict'),
      receipt: correctionReceipt,
      sourceReport: null,
    },
    liveMessage: 'Shared workflow pending message',
    writeProhibited: true,
  };
}

function sourceSection(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing source marker: ${startMarker}`).toBeGreaterThan(-1);
  expect(end, `missing source marker: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

function readWorkflowSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

test.describe('Clinical report shared workflow Node-only contracts', () => {
  test('C16 starts safely and RESET restores every shared slice', () => {
    const initial = createClinicalReportWorkflowState();
    expect(initial.activeMode).toBe('idle');
    expect(initial.writingAction).toBeNull();
    for (const slice of [
      initial.edit,
      initial.submission,
      initial.confirmation,
      initial.lock,
      initial.sourceFreeze,
      initial.archive,
    ]) {
      expect(slice).toEqual({ draft: null, error: null, receipt: null });
    }
    expect(initial.correction).toEqual({
      draft: null,
      error: null,
      receipt: null,
      sourceReport: null,
    });
    expect(initial.liveMessage).toBeNull();
    expect(initial.writeProhibited).toBe(false);

    expect(
      clinicalReportWorkflowReducer(nonEmptyWorkflowState(), {
        type: 'RESET',
      }),
    ).toEqual(initial);
  });

  test('C16 keeps activeMode and active drafts mutually exclusive', () => {
    const openedArchive = clinicalReportWorkflowReducer(
      nonEmptyWorkflowState(),
      { type: 'OPEN_ARCHIVE', draft: { ...archiveDraft, confirmed: false } },
    );
    expect(openedArchive.activeMode).toBe('archive');
    expect(openedArchive.archive.draft).toEqual({
      ...archiveDraft,
      confirmed: false,
    });
    expect(openedArchive.sourceFreeze.draft).toBeNull();
    expect(openedArchive.correction.draft).toBeNull();
    for (const slice of [
      openedArchive.edit,
      openedArchive.submission,
      openedArchive.confirmation,
      openedArchive.lock,
      openedArchive.sourceFreeze,
      openedArchive.archive,
      openedArchive.correction,
    ]) {
      expect(slice.error).toBeNull();
    }
    expect(openedArchive.archive.receipt).toBe(archiveReceipt);
    expect(openedArchive.correction.receipt).toBe(correctionReceipt);

    const openedSourceFreeze = clinicalReportWorkflowReducer(openedArchive, {
      type: 'OPEN_SOURCE_FREEZE',
      draft: sourceFreezeDraft,
    });
    expect(openedSourceFreeze.activeMode).toBe('source_freeze');
    expect(openedSourceFreeze.archive.draft).toBeNull();
    expect(openedSourceFreeze.sourceFreeze.draft).toBe(sourceFreezeDraft);
    const activeDrafts = [
      openedSourceFreeze.edit.draft,
      openedSourceFreeze.submission.draft,
      openedSourceFreeze.confirmation.draft,
      openedSourceFreeze.lock.draft,
      openedSourceFreeze.sourceFreeze.draft,
      openedSourceFreeze.archive.draft,
      openedSourceFreeze.correction.draft,
    ].filter((draft) => draft !== null);
    expect(activeDrafts).toHaveLength(1);
  });

  test('C16 manages BEGIN/FINISH_WRITE and reducer-level cancellation', () => {
    const begun = clinicalReportWorkflowReducer(nonEmptyWorkflowState(), {
      type: 'BEGIN_WRITE',
      action: 'archive',
      message: 'Archive write pending',
    });
    expect(begun.writingAction).toBe('archive');
    expect(begun.liveMessage).toBe('Archive write pending');
    expect(begun.archive.error).toBeNull();

    const finished = clinicalReportWorkflowReducer(begun, {
      type: 'FINISH_WRITE',
    });
    expect(finished.writingAction).toBeNull();

    const cancelled = clinicalReportWorkflowReducer(
      { ...nonEmptyWorkflowState(), writingAction: null },
      { type: 'CANCEL_ALL' },
    );
    expect(cancelled.activeMode).toBe('idle');
    for (const slice of [
      cancelled.edit,
      cancelled.submission,
      cancelled.confirmation,
      cancelled.lock,
      cancelled.sourceFreeze,
      cancelled.archive,
      cancelled.correction,
    ]) {
      expect(slice.draft).toBeNull();
      expect(slice.error).toBeNull();
    }
    expect(cancelled.liveMessage).toBeNull();
  });

  test('C16 COMPLETE_ARCHIVE retains only the receipt and shared success message', () => {
    const completed = clinicalReportWorkflowReducer(nonEmptyWorkflowState(), {
      type: 'COMPLETE_ARCHIVE',
      receipt: archiveReceipt,
      message: 'Archive completed',
    });
    expect(completed.activeMode).toBe('idle');
    expect(completed.archive).toEqual({
      draft: null,
      error: null,
      receipt: archiveReceipt,
    });
    expect(completed.liveMessage).toBe('Archive completed');
    expect(completed.writeProhibited).toBe(true);
  });

  test('C16 coordinator has one write lock, guarded execute, and unified report/latest paths', () => {
    const coordinatorSource = readWorkflowSource(
      'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportWorkflowCoordinator.ts',
    );
    expect(
      coordinatorSource.match(
        /const writingRef = useRef<ClinicalReportWritingAction>\(null\)/g,
      ),
    ).toHaveLength(1);

    const executeSource = sourceSection(
      coordinatorSource,
      'const execute = useCallback',
      '  return {',
    );
    expect(executeSource).toContain('!mountedRef.current');
    expect(executeSource).toContain('writingRef.current !== null');
    expect(executeSource).toContain(
      'stateRef.current.writingAction !== null',
    );
    expect(executeSource.indexOf('writingRef.current = action')).toBeLessThan(
      executeSource.indexOf("dispatch({ type: 'BEGIN_WRITE'"),
    );
    expect(executeSource).toContain('finally');
    expect(executeSource).toContain('writingRef.current = null');
    expect(executeSource).toContain("dispatch({ type: 'FINISH_WRITE' })");
    expect(
      coordinatorSource.match(
        /if \(writingRef\.current !== null\) return;/g,
      ),
    ).toHaveLength(4);

    const applySource = sourceSection(
      coordinatorSource,
      'const applyReportUpdate',
      'const refreshAfterError',
    );
    expect(applySource.match(/\bonReportUpdated\s*\(/g)).toHaveLength(1);
    expect(applySource).not.toContain('dispatch(');

    const refreshSource = sourceSection(
      coordinatorSource,
      'const refreshAfterError',
      'const execute',
    );
    expect(
      refreshSource.match(/\brefreshClinicalReportLatestAtMostOnce\s*\(/g),
    ).toHaveLength(1);
    expect(refreshSource).toContain('(error, refreshLatest)');
  });

  test('C16 façade shares one coordinator and one beforeunload across seven actions', () => {
    const facadeSource = readWorkflowSource(
      'src/features/assessments/hooks/useClinicalReportWorkflow.ts',
    );
    expect(
      facadeSource.match(/\buseClinicalReportWorkflowCoordinator\s*\(/g),
    ).toHaveLength(1);
    expect(
      facadeSource.match(/\buseClinicalReportBeforeUnload\s*\(/g),
    ).toHaveLength(1);

    for (const actionName of [
      'Edit',
      'Submission',
      'Confirmation',
      'Lock',
      'SourceFreeze',
      'Archive',
      'Correction',
    ]) {
      const actionSource = sourceSection(
        facadeSource,
        `useClinicalReport${actionName}Action({`,
        '  });',
      );
      expect(actionSource).toContain('coordinator,');
    }

    const unloadSource = sourceSection(
      facadeSource,
      'const shouldWarnBeforeUnload',
      '  return {',
    );
    expect(unloadSource).toContain('archive.archiveDirty');

    for (const actionFile of [
      'useClinicalReportEditAction.ts',
      'useClinicalReportSubmissionAction.ts',
      'useClinicalReportConfirmationAction.ts',
      'useClinicalReportLockAction.ts',
      'useClinicalReportSourceFreezeAction.ts',
      'useClinicalReportArchiveAction.ts',
      'useClinicalReportCorrectionAction.ts',
    ]) {
      const actionSource = readWorkflowSource(
        `src/features/assessments/hooks/clinical-report-workflow/${actionFile}`,
      );
      expect(actionSource).not.toContain('useClinicalReportWorkflowCoordinator(');
      expect(actionSource).not.toContain('useClinicalReportBeforeUnload(');
      expect(actionSource).not.toContain(
        'refreshClinicalReportLatestAtMostOnce(',
      );
    }
  });

  test('C16 proves route reset but exposes the missing same-route report identity reset', () => {
    const coordinatorSource = readWorkflowSource(
      'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportWorkflowCoordinator.ts',
    );
    const facadeSource = readWorkflowSource(
      'src/features/assessments/hooks/useClinicalReportWorkflow.ts',
    );
    const routeResetSource = sourceSection(
      coordinatorSource,
      'useEffect(() => {\n    writingRef.current = null;',
      '  const setEditDraft',
    );
    expect(routeResetSource).toContain("dispatch({ type: 'RESET' })");
    expect(routeResetSource).toContain('}, [patientId, visitId]);');

    const coordinatorCall = sourceSection(
      facadeSource,
      'useClinicalReportWorkflowCoordinator({',
      '  });',
    );
    expect(coordinatorCall).toContain('patientId,');
    expect(coordinatorCall).toContain('visitId,');
    expect(coordinatorCall).not.toContain('report');

    for (const actionFile of [
      'useClinicalReportEditAction.ts',
      'useClinicalReportSubmissionAction.ts',
      'useClinicalReportConfirmationAction.ts',
      'useClinicalReportLockAction.ts',
      'useClinicalReportSourceFreezeAction.ts',
      'useClinicalReportArchiveAction.ts',
      'useClinicalReportCorrectionAction.ts',
    ]) {
      const actionSource = readWorkflowSource(
        `src/features/assessments/hooks/clinical-report-workflow/${actionFile}`,
      );
      expect(actionSource).not.toContain("type: 'RESET'");
    }
  });
});
