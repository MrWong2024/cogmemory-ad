import { useCallback, useEffect } from 'react';

import { updateClinicalReportDraft } from '@/src/features/assessments/api/clinical-report-api';
import {
  shouldProhibitClinicalReportWrite,
  shouldRefreshClinicalReportAfterError,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow-recovery';
import type {
  ClinicalReportWorkflowCoordinator,
  UseClinicalReportWorkflowOptions,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.types';
import {
  buildUpdateClinicalReportDraftRequest,
  createClinicalReportEditDraft,
  hasClinicalReportNarrativeChange,
  isClinicalReportEditDirty,
  isSafeClinicalReportWriteIdentity,
  normalizeClinicalReportText,
  validateClinicalReportEditDraft,
} from '@/src/features/assessments/lib/clinical-report-workflow-draft';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';
import {
  canCurrentRolesWriteReplacement,
  isSafeCorrectionReplacement,
  isVersionOneReport,
} from '@/src/features/assessments/lib/clinical-report-correction-draft';

type EditActionOptions = Pick<
  UseClinicalReportWorkflowOptions,
  | 'patientId'
  | 'visitId'
  | 'report'
  | 'reportWriteBlocked'
  | 'currentUserRoles'
> & {
  coordinator: ClinicalReportWorkflowCoordinator;
};

function isEditableDraftReport(
  report: ClinicalReport | null,
  currentUserRoles: readonly string[],
): boolean {
  return Boolean(
    report &&
      report.status === 'draft' &&
      report.reportType === 'cognitive_assessment' &&
      ((isVersionOneReport(report) &&
        (report.source === 'system_draft' || report.source === 'mixed')) ||
        (isSafeCorrectionReplacement(report) &&
          canCurrentRolesWriteReplacement(currentUserRoles))) &&
      report.lockedAt === null &&
      report.lock === null &&
      report.archivedAt === null &&
      report.archive === null &&
      report.voidedAt === null &&
      report.confirmation === null &&
      isSafeClinicalReportWriteIdentity(report.id, report.updatedAt),
  );
}

export function useClinicalReportEditAction({
  patientId,
  visitId,
  report,
  reportWriteBlocked,
  currentUserRoles,
  coordinator,
}: EditActionOptions) {
  const { state, setEditDraft, setEditError } = coordinator;
  const editDraft = state.edit.draft;
  const editDirty = isClinicalReportEditDirty(editDraft);
  const editValidation = editDraft
    ? validateClinicalReportEditDraft(editDraft)
    : { valid: false, message: null };
  const editVersionMatches = Boolean(
    editDraft &&
      report &&
      editDraft.reportId === report.id.trim().toLowerCase() &&
      editDraft.baseUpdatedAt === report.updatedAt,
  );
  const canEdit =
    state.activeMode === 'idle' &&
    state.writingAction === null &&
    !reportWriteBlocked &&
    !state.writeProhibited &&
    isEditableDraftReport(report, currentUserRoles);
  const canSaveEdit = Boolean(
    editDraft &&
      editValidation.valid &&
      hasClinicalReportNarrativeChange(editDraft) &&
      !editDraft.stale &&
      editVersionMatches &&
      state.writingAction === null &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      isEditableDraftReport(report, currentUserRoles),
  );

  useEffect(() => {
    if (
      editDraft &&
      (!report ||
        editDraft.reportId !== report.id.trim().toLowerCase() ||
        editDraft.baseUpdatedAt !== report.updatedAt)
    ) {
      setEditDraft((current) =>
        current && !current.stale ? { ...current, stale: true } : current,
      );
    }
  }, [editDraft, report, setEditDraft]);

  const openEdit = useCallback(() => {
    if (!canEdit || !report) return;
    const draft = createClinicalReportEditDraft(report);
    if (!draft) return;
    coordinator.activateEdit(draft);
  }, [canEdit, coordinator, report]);

  const updateEditDraft = useCallback(
    (
      field: 'doctorOpinion' | 'recommendationText' | 'editNote',
      value: string,
    ) => {
      setEditDraft((current) =>
        current ? { ...current, [field]: value } : current,
      );
      setEditError(null);
    },
    [setEditDraft, setEditError],
  );

  const continueEditFromLatest = useCallback(() => {
    if (
      !report ||
      !isEditableDraftReport(report, currentUserRoles) ||
      !report.updatedAt
    ) return;
    setEditDraft((current) =>
      current
        ? {
            ...current,
            reportId: report.id.trim().toLowerCase(),
            baseUpdatedAt: report.updatedAt ?? current.baseUpdatedAt,
            baseDoctorOpinion: normalizeClinicalReportText(
              report.narrative?.doctorOpinion ?? '',
            ),
            baseRecommendationText: normalizeClinicalReportText(
              report.narrative?.recommendationText ?? '',
            ),
            stale: false,
          }
        : current,
    );
    setEditError(null);
  }, [currentUserRoles, report, setEditDraft, setEditError]);

  const saveEdit = useCallback(async () => {
    if (!editDraft || !canSaveEdit) return;
    await coordinator.execute({
      action: 'edit',
      pendingMessage: '正在保存受控报告编辑。',
      request: () =>
        updateClinicalReportDraft(
          patientId,
          visitId,
          editDraft.reportId,
          buildUpdateClinicalReportDraftRequest(editDraft),
        ),
      onSuccess: (response) => {
        coordinator.applyReportUpdate(response.report);
        coordinator.completeEdit(
          response.editReceipt,
          '医生意见与临床人员建议已保存。',
        );
      },
      onError: async (error) => {
        setEditError(error);
        coordinator.setLiveMessage(null);
        if (shouldProhibitClinicalReportWrite('edit', error)) {
          coordinator.prohibitWrites();
        }
        if (shouldRefreshClinicalReportAfterError(error)) {
          setEditDraft((current) =>
            current ? { ...current, stale: true } : current,
          );
        }
        await coordinator.refreshAfterError(error);
      },
    });
  }, [
    canSaveEdit,
    coordinator,
    editDraft,
    patientId,
    setEditDraft,
    setEditError,
    visitId,
  ]);

  return {
    editDraft,
    editDirty,
    editValidation,
    editError: state.edit.error,
    editReceipt: state.edit.receipt,
    canEdit,
    canSaveEdit,
    openEdit,
    updateEditDraft,
    continueEditFromLatest,
    saveEdit,
  };
}
