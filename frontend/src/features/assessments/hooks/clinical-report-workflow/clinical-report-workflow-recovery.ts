import {
  ClinicalReportApiError,
  type ClinicalReportApiErrorKind,
} from '@/src/features/assessments/api/clinical-report-api';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';
import type { ClinicalReportWritingAction } from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.types';

const refreshAfterActionErrors = new Set<ClinicalReportApiErrorKind>([
  'clinical_report_not_editable',
  'clinical_report_edit_conflict',
  'clinical_report_submission_conflict',
  'clinical_report_not_ready_for_submission',
  'clinical_report_confirmation_conflict',
  'clinical_report_not_ready_for_confirmation',
  'clinical_report_voided',
  'clinical_report_not_found',
  'clinical_report_not_lockable',
  'clinical_report_lock_conflict',
  'clinical_report_not_source_freezable',
  'clinical_report_source_freeze_conflict',
  'clinical_report_source_freeze_incomplete',
  'clinical_report_source_freeze_failed',
  'clinical_report_not_archivable',
  'clinical_report_archive_conflict',
  'clinical_report_archive_failed',
]);

export function toClinicalReportApiError(
  error: unknown,
): ClinicalReportApiError {
  return error instanceof ClinicalReportApiError
    ? error
    : new ClinicalReportApiError('unknown');
}

export function shouldRefreshClinicalReportAfterError(
  error: ClinicalReportApiError,
): boolean {
  return refreshAfterActionErrors.has(error.kind);
}

export function shouldProhibitClinicalReportWrite(
  action: Exclude<ClinicalReportWritingAction, null>,
  error: ClinicalReportApiError,
): boolean {
  if (error.kind === 'clinical_report_metadata_unsupported') return true;
  switch (action) {
    case 'edit':
      return error.kind === 'clinical_report_edit_audit_limit_reached';
    case 'submit':
    case 'confirm':
      return false;
    case 'lock':
      return error.kind === 'clinical_report_lock_audit_unavailable';
    case 'source_freeze':
      return (
        error.kind === 'clinical_report_source_freeze_scope_invalid' ||
        error.kind === 'clinical_report_source_freeze_input_invalid' ||
        error.kind === 'clinical_report_source_freeze_audit_unavailable'
      );
    case 'archive':
      return error.kind === 'clinical_report_archive_audit_unavailable';
  }
}

export async function refreshClinicalReportLatestAtMostOnce(
  error: ClinicalReportApiError,
  refreshLatest: () => Promise<ClinicalReport | null>,
): Promise<void> {
  if (!shouldRefreshClinicalReportAfterError(error)) return;
  await refreshLatest();
}
