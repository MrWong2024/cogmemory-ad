import type { StructuredManualField } from '@/src/features/assessments/types/item-response-execution';
import type { PatientAdministrationReviewStep } from '@/src/features/patient-administration/types/patient-administration';

export type PatientReviewReferenceRouting = {
  fieldSpecificStepsByCode: Readonly<
    Record<string, readonly PatientAdministrationReviewStep[]>
  >;
  sharedSteps: readonly PatientAdministrationReviewStep[];
};

export function routePatientReviewReferences(
  structuredManualFields: readonly Pick<StructuredManualField, 'code'>[] | null,
  steps: readonly PatientAdministrationReviewStep[],
): PatientReviewReferenceRouting {
  if (!structuredManualFields?.length) {
    return {
      fieldSpecificStepsByCode: {},
      sharedSteps: [...steps],
    };
  }

  const formalFieldCodes = new Set(
    structuredManualFields.map((field) => field.code),
  );
  const fieldSpecificStepsByCode: Record<
    string,
    PatientAdministrationReviewStep[]
  > = {};
  const sharedSteps: PatientAdministrationReviewStep[] = [];

  for (const step of steps) {
    const [fieldCode] = step.structuredFieldCodes;
    if (
      step.structuredFieldCodes.length === 1 &&
      fieldCode !== undefined &&
      formalFieldCodes.has(fieldCode)
    ) {
      (fieldSpecificStepsByCode[fieldCode] ??= []).push(step);
    } else {
      sharedSteps.push(step);
    }
  }

  return { fieldSpecificStepsByCode, sharedSteps };
}
