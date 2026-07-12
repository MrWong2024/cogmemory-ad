import type {
  ClinicalReport,
  ConfirmClinicalReportRequest,
  SubmitClinicalReportForConfirmationRequest,
  UpdateClinicalReportDraftRequest,
} from '@/src/features/assessments/types/clinical-report';

export const clinicalReportWorkflowLimits = {
  doctorOpinion: { min: 3, max: 4000 },
  recommendationText: { min: 3, max: 4000 },
  editNote: { min: 3, max: 1000 },
  submissionNote: { min: 3, max: 2000 },
  confirmationNote: { min: 3, max: 2000 },
} as const;

export type ClinicalReportEditDraft = {
  reportId: string;
  baseUpdatedAt: string;
  baseDoctorOpinion: string;
  baseRecommendationText: string;
  doctorOpinion: string;
  recommendationText: string;
  editNote: string;
  stale: boolean;
};

export type ClinicalReportSubmissionDraft = {
  reportId: string;
  baseUpdatedAt: string;
  submissionNote: string;
  confirmed: boolean;
  stale: boolean;
};

export type ClinicalReportConfirmationDraft = {
  reportId: string;
  baseUpdatedAt: string;
  confirmationNote: string;
  confirmed: boolean;
  stale: boolean;
};

export type ClinicalReportWorkflowValidation = {
  valid: boolean;
  message: string | null;
};

const mongoIdPattern = /^[a-f\d]{24}$/;

export function normalizeClinicalReportText(value: string): string {
  return value.trim();
}

export function isSafeClinicalReportWriteIdentity(
  reportId: string,
  updatedAt: string | null,
): updatedAt is string {
  return (
    mongoIdPattern.test(reportId.trim().toLowerCase()) &&
    typeof updatedAt === 'string' &&
    updatedAt.trim().length > 0
  );
}

export function createClinicalReportEditDraft(
  report: ClinicalReport,
): ClinicalReportEditDraft | null {
  if (!isSafeClinicalReportWriteIdentity(report.id, report.updatedAt)) {
    return null;
  }
  const doctorOpinion = report.narrative?.doctorOpinion ?? '';
  const recommendationText = report.narrative?.recommendationText ?? '';
  return {
    reportId: report.id.trim().toLowerCase(),
    baseUpdatedAt: report.updatedAt,
    baseDoctorOpinion: normalizeClinicalReportText(doctorOpinion),
    baseRecommendationText: normalizeClinicalReportText(recommendationText),
    doctorOpinion,
    recommendationText,
    editNote: '',
    stale: false,
  };
}

export function createClinicalReportSubmissionDraft(
  report: ClinicalReport,
): ClinicalReportSubmissionDraft | null {
  if (!isSafeClinicalReportWriteIdentity(report.id, report.updatedAt)) {
    return null;
  }
  return {
    reportId: report.id.trim().toLowerCase(),
    baseUpdatedAt: report.updatedAt,
    submissionNote: '',
    confirmed: false,
    stale: false,
  };
}

export function createClinicalReportConfirmationDraft(
  report: ClinicalReport,
): ClinicalReportConfirmationDraft | null {
  if (!isSafeClinicalReportWriteIdentity(report.id, report.updatedAt)) {
    return null;
  }
  return {
    reportId: report.id.trim().toLowerCase(),
    baseUpdatedAt: report.updatedAt,
    confirmationNote: '',
    confirmed: false,
    stale: false,
  };
}

function validateRequiredText(
  value: string,
  label: string,
  min: number,
  max: number,
): ClinicalReportWorkflowValidation {
  const length = normalizeClinicalReportText(value).length;
  if (length < min || length > max) {
    return {
      valid: false,
      message: `${label}需为 ${min}–${max} 个字符。`,
    };
  }
  return { valid: true, message: null };
}

export function validateClinicalReportEditDraft(
  draft: ClinicalReportEditDraft,
): ClinicalReportWorkflowValidation {
  const opinion = validateRequiredText(
    draft.doctorOpinion,
    '医生意见',
    clinicalReportWorkflowLimits.doctorOpinion.min,
    clinicalReportWorkflowLimits.doctorOpinion.max,
  );
  if (!opinion.valid) return opinion;

  const recommendation = normalizeClinicalReportText(
    draft.recommendationText,
  );
  if (
    recommendation.length > 0 &&
    (recommendation.length <
      clinicalReportWorkflowLimits.recommendationText.min ||
      recommendation.length >
        clinicalReportWorkflowLimits.recommendationText.max)
  ) {
    return {
      valid: false,
      message: '临床人员补充建议留空表示清除；非空时需为 3–4000 个字符。',
    };
  }

  return validateRequiredText(
    draft.editNote,
    '本次编辑审计说明',
    clinicalReportWorkflowLimits.editNote.min,
    clinicalReportWorkflowLimits.editNote.max,
  );
}

export function hasClinicalReportNarrativeChange(
  draft: ClinicalReportEditDraft,
): boolean {
  return (
    normalizeClinicalReportText(draft.doctorOpinion) !==
      draft.baseDoctorOpinion ||
    normalizeClinicalReportText(draft.recommendationText) !==
      draft.baseRecommendationText
  );
}

export function isClinicalReportEditDirty(
  draft: ClinicalReportEditDraft | null,
): boolean {
  return Boolean(
    draft &&
      (hasClinicalReportNarrativeChange(draft) ||
        normalizeClinicalReportText(draft.editNote).length > 0),
  );
}

export function buildUpdateClinicalReportDraftRequest(
  draft: ClinicalReportEditDraft,
): UpdateClinicalReportDraftRequest {
  return {
    doctorOpinion: normalizeClinicalReportText(draft.doctorOpinion),
    recommendationText: normalizeClinicalReportText(
      draft.recommendationText,
    ),
    editNote: normalizeClinicalReportText(draft.editNote),
    expectedUpdatedAt: draft.baseUpdatedAt,
  };
}

export function validateClinicalReportSubmissionDraft(
  draft: ClinicalReportSubmissionDraft,
): ClinicalReportWorkflowValidation {
  return validateRequiredText(
    draft.submissionNote,
    '提交说明',
    clinicalReportWorkflowLimits.submissionNote.min,
    clinicalReportWorkflowLimits.submissionNote.max,
  );
}

export function buildSubmitClinicalReportForConfirmationRequest(
  draft: ClinicalReportSubmissionDraft,
): SubmitClinicalReportForConfirmationRequest {
  return {
    confirm: true,
    submissionNote: normalizeClinicalReportText(draft.submissionNote),
    expectedUpdatedAt: draft.baseUpdatedAt,
  };
}

export function validateClinicalReportConfirmationDraft(
  draft: ClinicalReportConfirmationDraft,
): ClinicalReportWorkflowValidation {
  return validateRequiredText(
    draft.confirmationNote,
    '最终确认意见',
    clinicalReportWorkflowLimits.confirmationNote.min,
    clinicalReportWorkflowLimits.confirmationNote.max,
  );
}

export function buildConfirmClinicalReportRequest(
  draft: ClinicalReportConfirmationDraft,
): ConfirmClinicalReportRequest {
  return {
    confirm: true,
    confirmationNote: normalizeClinicalReportText(draft.confirmationNote),
    expectedUpdatedAt: draft.baseUpdatedAt,
  };
}

export function shouldWarnBeforeClinicalReportUnload({
  editDraft,
  submissionDraft,
  confirmationDraft,
}: {
  editDraft: ClinicalReportEditDraft | null;
  submissionDraft: ClinicalReportSubmissionDraft | null;
  confirmationDraft: ClinicalReportConfirmationDraft | null;
}): boolean {
  return (
    isClinicalReportEditDirty(editDraft) ||
    normalizeClinicalReportText(submissionDraft?.submissionNote ?? '').length >
      0 ||
    normalizeClinicalReportText(confirmationDraft?.confirmationNote ?? '')
      .length > 0
  );
}
