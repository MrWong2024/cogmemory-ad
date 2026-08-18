const MMSE_1_0_REVIEW_STRUCTURED_FIELD_CODES = {
  'mmse-orientation-year': ['mmse.orientation.year'],
  'mmse-orientation-season': ['mmse.orientation.season'],
  'mmse-orientation-month': ['mmse.orientation.month'],
  'mmse-orientation-date': ['mmse.orientation.date'],
  'mmse-orientation-weekday': ['mmse.orientation.weekday'],
  'mmse-orientation-city': ['mmse.orientation.city'],
  'mmse-orientation-district': ['mmse.orientation.district'],
  'mmse-orientation-street': ['mmse.orientation.street'],
  'mmse-orientation-floor': ['mmse.orientation.floor'],
  'mmse-orientation-place': ['mmse.orientation.location'],
  'mmse-immediate-recall': [
    'mmse.memory.immediate_recall.ball',
    'mmse.memory.immediate_recall.flag',
    'mmse.memory.immediate_recall.tree',
  ],
  'mmse-delayed-recall': [
    'mmse.memory.delayed_recall.ball',
    'mmse.memory.delayed_recall.flag',
    'mmse.memory.delayed_recall.tree',
  ],
  'mmse-naming': ['mmse.language.naming.watch', 'mmse.language.naming.pencil'],
  'mmse-three-step-command': [
    'mmse.language.three_step_command.take_paper',
    'mmse.language.three_step_command.fold_paper',
    'mmse.language.three_step_command.place_on_left_leg',
  ],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export function resolvePatientAdministrationReviewStructuredFieldCodes(
  scaleCode: string,
  scaleVersion: string,
  stepKey: string,
): readonly string[] | null {
  if (scaleCode !== 'mmse' || scaleVersion !== '1.0') {
    return null;
  }

  return (
    MMSE_1_0_REVIEW_STRUCTURED_FIELD_CODES[
      stepKey as keyof typeof MMSE_1_0_REVIEW_STRUCTURED_FIELD_CODES
    ] ?? null
  );
}
