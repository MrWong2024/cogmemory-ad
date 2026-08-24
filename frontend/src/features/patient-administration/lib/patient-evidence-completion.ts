export type PatientEvidenceUploadResult =
  | 'success'
  | 'failed'
  | 'conflict_or_uncertain';

export type PatientEvidenceCompletionResult =
  | 'complete_attempted'
  | Exclude<PatientEvidenceUploadResult, 'success'>;

type PatientEvidenceCompletionInput = {
  skipUpload: boolean;
  upload: () => Promise<PatientEvidenceUploadResult>;
  complete: () => Promise<void>;
};

export async function runPatientEvidenceCompletion({
  skipUpload,
  upload,
  complete,
}: PatientEvidenceCompletionInput): Promise<PatientEvidenceCompletionResult> {
  if (!skipUpload) {
    const uploadResult = await upload();
    if (uploadResult !== 'success') return uploadResult;
  }

  await complete();
  return 'complete_attempted';
}
