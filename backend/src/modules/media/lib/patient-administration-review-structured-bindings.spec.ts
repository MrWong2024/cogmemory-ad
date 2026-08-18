import { resolvePatientAdministrationReviewStructuredFieldCodes } from './patient-administration-review-structured-bindings';

describe('resolvePatientAdministrationReviewStructuredFieldCodes', () => {
  it('contains the complete explicit mmse@1.0 review placement registry', () => {
    const expected = {
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
      'mmse-naming': [
        'mmse.language.naming.watch',
        'mmse.language.naming.pencil',
      ],
      'mmse-three-step-command': [
        'mmse.language.three_step_command.take_paper',
        'mmse.language.three_step_command.fold_paper',
        'mmse.language.three_step_command.place_on_left_leg',
      ],
    } as const;

    expect(
      Object.fromEntries(
        Object.keys(expected).map((stepKey) => [
          stepKey,
          resolvePatientAdministrationReviewStructuredFieldCodes(
            'mmse',
            '1.0',
            stepKey,
          ),
        ]),
      ),
    ).toEqual(expected);
  });

  it.each([
    ['mmse-orientation-year', ['mmse.orientation.year']],
    ['mmse-orientation-place', ['mmse.orientation.location']],
    [
      'mmse-immediate-recall',
      [
        'mmse.memory.immediate_recall.ball',
        'mmse.memory.immediate_recall.flag',
        'mmse.memory.immediate_recall.tree',
      ],
    ],
    [
      'mmse-naming',
      ['mmse.language.naming.watch', 'mmse.language.naming.pencil'],
    ],
    [
      'mmse-three-step-command',
      [
        'mmse.language.three_step_command.take_paper',
        'mmse.language.three_step_command.fold_paper',
        'mmse.language.three_step_command.place_on_left_leg',
      ],
    ],
  ])('resolves the explicit mmse@1.0 binding for %s', (stepKey, expected) => {
    expect(
      resolvePatientAdministrationReviewStructuredFieldCodes(
        'mmse',
        '1.0',
        stepKey,
      ),
    ).toEqual(expected);
  });

  it.each([
    ['mmse', '1.0', 'mmse-attention-calculation'],
    ['mmse', '1.0', 'mmse-repetition'],
    ['mmse', '1.0', 'mmse-reading-command'],
    ['mmse', '1.0', 'mmse-expression'],
    ['mmse', '1.0', 'mmse-drawing'],
    ['mmse', '1.0', 'unknown-step'],
    ['unknown-scale', '1.0', 'mmse-orientation-year'],
    ['mmse', '1.1', 'mmse-orientation-year'],
  ])(
    'returns null for an unregistered exact key %#',
    (scale, version, step) => {
      expect(
        resolvePatientAdministrationReviewStructuredFieldCodes(
          scale,
          version,
          step,
        ),
      ).toBeNull();
    },
  );
});
