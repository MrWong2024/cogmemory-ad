// Node-only contract spec: production reducer behavior and bounded source checks only.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { ClinicalReportApiError } from '@/src/features/assessments/api/clinical-report-api';
import {
  clinicalReportWorkflowReducer,
  createClinicalReportWorkflowState,
  isExpectedClinicalReportCorrectionReplacement,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.state';
import type {
  ClinicalReportWorkflowIdentityTransition,
  ClinicalReportWorkflowState,
  ClinicalReportWorkflowStateAction,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.types';
import type { ClinicalReportArchiveDraft } from '@/src/features/assessments/lib/clinical-report-archive-draft';
import type { CorrectionDraft } from '@/src/features/assessments/lib/clinical-report-correction-draft';
import type { ClinicalReportSourceFreezeDraft } from '@/src/features/assessments/lib/clinical-report-source-freeze-draft';
import type {
  ArchiveClinicalReportReceipt,
  ClinicalReport,
  ClinicalReportEditReceipt,
  ConfirmClinicalReportReceipt,
  CreateClinicalReportCorrectionReceipt,
  FreezeClinicalReportSourcesReceipt,
  LockClinicalReportReceipt,
  SubmitClinicalReportReceipt,
} from '@/src/features/assessments/types/clinical-report';

const reportId = '507f1f77bcf86cd799439041';
const replacementReportId = '507f1f77bcf86cd799439043';
const unrelatedReportId = '507f1f77bcf86cd799439044';
const updatedAt = '2026-08-02T12:00:00.000Z';
const operator = {
  operatorId: '507f1f77bcf86cd799439042',
  operatorName: 'Shared Workflow Doctor',
  operatorRole: 'doctor' as const,
};
const reviewActor = {
  operatorName: 'Shared Workflow Doctor',
  operatorRole: 'doctor' as const,
};
const editDraft = {
  reportId,
  baseUpdatedAt: updatedAt,
  baseDoctorOpinion: 'Prior opinion',
  baseRecommendationText: 'Prior recommendation',
  doctorOpinion: 'Updated opinion',
  recommendationText: 'Updated recommendation',
  editNote: 'Shared workflow edit note',
  stale: false,
};
const submissionDraft = {
  reportId,
  baseUpdatedAt: updatedAt,
  submissionNote: 'Shared workflow submission note',
  confirmed: true,
  stale: false,
};
const confirmationDraft = {
  reportId,
  baseUpdatedAt: updatedAt,
  confirmationNote: 'Shared workflow confirmation note',
  confirmed: true,
  stale: false,
};
const lockDraft = {
  reportId,
  baseUpdatedAt: updatedAt,
  lockNote: 'Shared workflow lock note',
  confirmed: true,
  stale: false,
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
const editReceipt: ClinicalReportEditReceipt = {
  eventId: 'shared-edit-event',
  editedAt: '2026-08-02T12:05:00.000Z',
  editedBy: reviewActor,
  changedFields: ['doctorOpinion'],
  editNote: 'Shared workflow edit receipt',
};
const submissionReceipt: SubmitClinicalReportReceipt = {
  submissionId: 'shared-submission',
  submittedAt: '2026-08-02T12:10:00.000Z',
  submittedBy: reviewActor,
  submissionNote: 'Shared workflow submission receipt',
  alreadySubmitted: false,
};
const confirmationReceipt: ConfirmClinicalReportReceipt = {
  confirmationId: 'shared-confirmation',
  confirmedAt: '2026-08-02T12:15:00.000Z',
  confirmedBy: reviewActor,
  confirmationNote: 'Shared workflow confirmation receipt',
  alreadyConfirmed: false,
};
const lockReceipt: LockClinicalReportReceipt = {
  lockId: '11111111-1111-4111-8111-111111111111',
  lockedAt: '2026-08-02T12:20:00.000Z',
  lockedBy: operator,
  lockNote: 'Shared workflow lock receipt',
  alreadyLocked: false,
};
const zeroSourceCounts = {
  scaleInstanceCount: 0,
  itemResponseCount: 0,
  scoreResultCount: 0,
  cognitiveDomainResultCount: 0,
  mediaEvidenceCount: 0,
  totalSourceCount: 0,
};
const sourceFreezeReceipt: FreezeClinicalReportSourcesReceipt = {
  freezeId: '22222222-2222-4222-8222-222222222222',
  state: 'completed',
  startedAt: '2026-08-02T12:20:00.000Z',
  sourceLockedAt: '2026-08-02T12:20:00.000Z',
  startedBy: operator,
  completedAt: '2026-08-02T12:25:00.000Z',
  completedBy: operator,
  freezeNote: 'Shared workflow source-freeze receipt',
  expectedCounts: zeroSourceCounts,
  completedCounts: zeroSourceCounts,
  newlyFrozenCounts: zeroSourceCounts,
  previouslyFrozenCounts: zeroSourceCounts,
  alreadyFrozen: false,
  resumedExisting: false,
};
const correctionReceipt: CreateClinicalReportCorrectionReceipt = {
  sourceReportId: reportId,
  replacementReportId,
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
const correctionSourceReport: ClinicalReport = {
  id: reportId,
  reportCode: 'RPT-SHARED-V1',
  reportType: 'cognitive_assessment',
  status: 'corrected',
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
  confirmation: null,
  lockedAt: null,
  lock: null,
  sourceFreeze: null,
  archivedAt: null,
  archive: null,
  correction: null,
  replacementOf: null,
  voidedAt: null,
  createdAt: '2026-08-02T11:00:00.000Z',
  updatedAt: '2026-08-02T13:01:00.000Z',
  isFinal: true,
};
const expectedCorrectionTransition: ClinicalReportWorkflowIdentityTransition = {
  kind: 'correction_replacement',
  sourceReportId: reportId,
  replacementReportId,
};

function nonEmptyWorkflowState(): ClinicalReportWorkflowState {
  const initial = createClinicalReportWorkflowState();
  return {
    ...initial,
    activeMode: 'correction',
    writingAction: 'archive',
    edit: {
      draft: editDraft,
      error: new ClinicalReportApiError('unknown'),
      receipt: editReceipt,
    },
    submission: {
      draft: submissionDraft,
      error: new ClinicalReportApiError('unknown'),
      receipt: submissionReceipt,
    },
    confirmation: {
      draft: confirmationDraft,
      error: new ClinicalReportApiError('unknown'),
      receipt: confirmationReceipt,
    },
    lock: {
      draft: lockDraft,
      error: new ClinicalReportApiError('unknown'),
      receipt: lockReceipt,
    },
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
      receipt: sourceFreezeReceipt,
    },
    correction: {
      draft: correctionDraft,
      error: new ClinicalReportApiError('clinical_report_correction_conflict'),
      receipt: correctionReceipt,
      sourceReport: correctionSourceReport,
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

  test('C16 fully isolates an unexpected same-route report identity change', () => {
    const reset = clinicalReportWorkflowReducer(nonEmptyWorkflowState(), {
      type: 'REPORT_IDENTITY_CHANGED',
      previousReportId: reportId,
      nextReportId: unrelatedReportId,
      expectedTransition: null,
    });

    expect(reset).toEqual(createClinicalReportWorkflowState());
  });

  test('C16 preserves only a complete expected correction replacement result', () => {
    expect(
      isExpectedClinicalReportCorrectionReplacement(
        reportId,
        replacementReportId,
        expectedCorrectionTransition,
      ),
    ).toBe(true);

    const completedMessage = 'Correction replacement completed';
    const preserved = clinicalReportWorkflowReducer(
      {
        ...nonEmptyWorkflowState(),
        liveMessage: completedMessage,
      },
      {
        type: 'REPORT_IDENTITY_CHANGED',
        previousReportId: reportId,
        nextReportId: replacementReportId,
        expectedTransition: expectedCorrectionTransition,
      },
    );
    const initial = createClinicalReportWorkflowState();

    expect(preserved.activeMode).toBe('idle');
    expect(preserved.writingAction).toBeNull();
    expect(preserved.correction).toEqual({
      draft: null,
      error: null,
      receipt: correctionReceipt,
      sourceReport: correctionSourceReport,
    });
    expect(preserved.liveMessage).toBe(completedMessage);
    expect(preserved.writeProhibited).toBe(false);
    for (const sliceName of [
      'edit',
      'submission',
      'confirmation',
      'lock',
      'sourceFreeze',
      'archive',
    ] as const) {
      expect(preserved[sliceName]).toEqual(initial[sliceName]);
    }
  });

  test('C16 degrades every invalid correction preservation claim to full RESET', () => {
    const populated = nonEmptyWorkflowState();
    const identityAction = (
      overrides: Partial<
        Extract<
          ClinicalReportWorkflowStateAction,
          { type: 'REPORT_IDENTITY_CHANGED' }
        >
      > = {},
    ): Extract<
      ClinicalReportWorkflowStateAction,
      { type: 'REPORT_IDENTITY_CHANGED' }
    > => ({
      type: 'REPORT_IDENTITY_CHANGED',
      previousReportId: reportId,
      nextReportId: replacementReportId,
      expectedTransition: expectedCorrectionTransition,
      ...overrides,
    });
    const invalidCases: Array<{
      state: ClinicalReportWorkflowState;
      action: Extract<
        ClinicalReportWorkflowStateAction,
        { type: 'REPORT_IDENTITY_CHANGED' }
      >;
    }> = [
      {
        state: populated,
        action: identityAction({ previousReportId: unrelatedReportId }),
      },
      {
        state: populated,
        action: identityAction({ nextReportId: unrelatedReportId }),
      },
      {
        state: populated,
        action: identityAction({
          nextReportId: reportId,
          expectedTransition: {
            ...expectedCorrectionTransition,
            replacementReportId: reportId,
          },
        }),
      },
      {
        state: {
          ...populated,
          correction: { ...populated.correction, receipt: null },
        },
        action: identityAction(),
      },
      {
        state: {
          ...populated,
          correction: {
            ...populated.correction,
            receipt: {
              ...correctionReceipt,
              replacementReportId: unrelatedReportId,
            },
          },
        },
        action: identityAction(),
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(
        clinicalReportWorkflowReducer(
          invalidCase.state,
          invalidCase.action,
        ),
      ).toEqual(createClinicalReportWorkflowState());
    }
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
    expect(
      executeSource.indexOf(
        'const executionGeneration = identityGenerationRef.current',
      ),
    ).toBeLessThan(executeSource.indexOf('const response = await request()'));
    expect(executeSource).toMatch(
      /const response = await request\(\)[\s\S]*identityGenerationRef\.current !== executionGeneration[\s\S]*onSuccess\(response\)/,
    );
    expect(executeSource).toMatch(
      /catch \(requestError: unknown\)[\s\S]*identityGenerationRef\.current !== executionGeneration[\s\S]*onUnauthorized\(\)[\s\S]*await onError\(error\)/,
    );
    expect(executeSource).toContain('finally');
    const finallyGenerationCheck = executeSource.lastIndexOf(
      'identityGenerationRef.current !== executionGeneration',
    );
    const finallyWritingClear = executeSource.lastIndexOf(
      'writingRef.current = null',
    );
    expect(finallyGenerationCheck).toBeGreaterThan(
      executeSource.indexOf('finally'),
    );
    expect(finallyGenerationCheck).toBeLessThan(finallyWritingClear);
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
    expect(applySource).toContain(
      'isExpectedClinicalReportCorrectionReplacement(',
    );
    expect(
      applySource.indexOf('expectedIdentityTransitionRef.current ='),
    ).toBeLessThan(applySource.indexOf('onReportUpdated(report)'));

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

  test('C16 wires stable route/report identity with route reset priority and one-shot transition consumption', () => {
    const coordinatorSource = readWorkflowSource(
      'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportWorkflowCoordinator.ts',
    );
    const facadeSource = readWorkflowSource(
      'src/features/assessments/hooks/useClinicalReportWorkflow.ts',
    );
    const identityEffectSource = sourceSection(
      coordinatorSource,
      'useEffect(() => {\n    const previousIdentity',
      '  const setEditDraft',
    );
    expect(identityEffectSource).toContain(
      'if (!routeChanged && !reportIdentityChanged) return;',
    );
    expect(
      identityEffectSource.indexOf('identityGenerationRef.current += 1'),
    ).toBeLessThan(identityEffectSource.indexOf('writingRef.current = null'));
    expect(identityEffectSource).toContain(
      'expectedIdentityTransitionRef.current = null',
    );
    const routeBranch = sourceSection(
      identityEffectSource,
      'if (routeChanged) {',
      "dispatch({\n      type: 'REPORT_IDENTITY_CHANGED'",
    );
    expect(routeBranch).toContain("dispatch({ type: 'RESET' })");
    expect(routeBranch).toContain('return;');
    expect(identityEffectSource).toContain(
      'previousReportId: previousIdentity.reportId',
    );
    expect(identityEffectSource).toContain('nextReportId: reportId');
    expect(identityEffectSource).toContain('expectedTransition,');
    expect(identityEffectSource).toContain(
      '}, [patientId, visitId, reportId]);',
    );

    const coordinatorCall = sourceSection(
      facadeSource,
      'useClinicalReportWorkflowCoordinator({',
      '  });',
    );
    expect(coordinatorCall).toContain('patientId,');
    expect(coordinatorCall).toContain('visitId,');
    expect(coordinatorCall).toContain('reportId: report?.id ?? null');
    expect(identityEffectSource).not.toContain('[patientId, visitId, report]');

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

  test('C16 registers correction identity only from the server receipt', () => {
    const correctionSource = readWorkflowSource(
      'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportCorrectionAction.ts',
    );
    const successSource = sourceSection(
      correctionSource,
      'onSuccess: (response) => {',
      'onError:',
    );
    expect(successSource).toContain(
      'const receipt = response.correctionReceipt',
    );
    expect(successSource).toContain(
      "kind: 'correction_replacement'",
    );
    expect(successSource).toContain('sourceReportId: receipt.sourceReportId');
    expect(successSource).toContain(
      'replacementReportId: receipt.replacementReportId',
    );
    expect(successSource).not.toContain('correctionDraft.sourceReportId');
    expect(
      successSource.indexOf(
        'coordinator.applyReportUpdate(response.replacementReport,',
      ),
    ).toBeLessThan(successSource.indexOf('coordinator.completeCorrection('));

    for (const actionFile of [
      'useClinicalReportEditAction.ts',
      'useClinicalReportSubmissionAction.ts',
      'useClinicalReportConfirmationAction.ts',
      'useClinicalReportLockAction.ts',
      'useClinicalReportSourceFreezeAction.ts',
      'useClinicalReportArchiveAction.ts',
    ]) {
      const actionSource = readWorkflowSource(
        `src/features/assessments/hooks/clinical-report-workflow/${actionFile}`,
      );
      expect(actionSource).not.toContain('identityTransition');
      expect(actionSource).not.toContain("kind: 'correction_replacement'");
    }
  });
});
