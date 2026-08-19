import { resolveManualObservationRecordConfig } from './manual-observation-record';

function resolve(
  overrides: Partial<{
    itemCode: unknown;
    versionTrace: unknown;
    itemConfigSnapshot: unknown;
  }> = {},
) {
  return resolveManualObservationRecordConfig({
    itemCode: 'mmse.language.reading_command',
    versionTrace: { scaleVersion: '1.0' },
    itemConfigSnapshot: {
      responseType: 'boolean',
      scoreRange: { min: 0, max: 1, step: 1 },
      scoringRule: { mode: 'manual_observation' },
    },
    ...overrides,
  });
}

describe('manual observation record config', () => {
  it('resolves only the exact MMSE 1.0 reading-command contract', () => {
    expect(resolve()).toEqual({
      booleanLabel: '闭眼动作',
      trueLabel: '已按要求闭眼',
      falseLabel: '未按要求闭眼',
      responseTextLabel: '患者实际阅读 / 观察',
      responseTextHelp: '记录患者实际念出的内容；如未能读出，请记录实际情况。',
      requireBooleanResponse: true,
      requireResponseText: true,
    });
  });

  it('rejects a different scale version', () => {
    expect(resolve({ versionTrace: { scaleVersion: '1.1' } })).toBeNull();
  });

  it('rejects a different item code', () => {
    expect(resolve({ itemCode: 'mmse.language.repetition' })).toBeNull();
  });

  it.each([
    [
      'response type',
      {
        responseType: 'text',
        scoreRange: { min: 0, max: 1, step: 1 },
        scoringRule: { mode: 'manual_observation' },
      },
    ],
    [
      'scoring mode',
      {
        responseType: 'boolean',
        scoreRange: { min: 0, max: 1, step: 1 },
        scoringRule: { mode: 'manual_exact_match' },
      },
    ],
    [
      'score range',
      {
        responseType: 'boolean',
        scoreRange: { min: 0, max: 2, step: 1 },
        scoringRule: { mode: 'manual_observation' },
      },
    ],
  ])('rejects a changed %s', (_label, itemConfigSnapshot) => {
    expect(resolve({ itemConfigSnapshot })).toBeNull();
  });
});
