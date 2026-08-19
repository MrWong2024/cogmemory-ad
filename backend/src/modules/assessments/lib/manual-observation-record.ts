import { isPlainRecord } from './item-response-answer-content';

const MMSE_READING_COMMAND_ITEM_CODE = 'mmse.language.reading_command';
const MMSE_READING_COMMAND_SCALE_VERSION = '1.0';

export type ManualObservationRecordConfig = {
  booleanLabel: string;
  trueLabel: string;
  falseLabel: string;
  responseTextLabel: string;
  responseTextHelp: string;
  requireBooleanResponse: boolean;
  requireResponseText: boolean;
};

const MMSE_READING_COMMAND_OBSERVATION_CONFIG: ManualObservationRecordConfig = {
  booleanLabel: '闭眼动作',
  trueLabel: '已按要求闭眼',
  falseLabel: '未按要求闭眼',
  responseTextLabel: '患者实际阅读 / 观察',
  responseTextHelp: '记录患者实际念出的内容；如未能读出，请记录实际情况。',
  requireBooleanResponse: true,
  requireResponseText: true,
};

export function resolveManualObservationRecordConfig(input: {
  itemCode: unknown;
  versionTrace: unknown;
  itemConfigSnapshot: unknown;
}): ManualObservationRecordConfig | null {
  if (
    input.itemCode !== MMSE_READING_COMMAND_ITEM_CODE ||
    !isPlainRecord(input.versionTrace) ||
    input.versionTrace.scaleVersion !== MMSE_READING_COMMAND_SCALE_VERSION ||
    !isPlainRecord(input.itemConfigSnapshot)
  ) {
    return null;
  }

  const scoringRule = input.itemConfigSnapshot.scoringRule;
  const scoreRange = input.itemConfigSnapshot.scoreRange;

  if (
    input.itemConfigSnapshot.responseType !== 'boolean' ||
    !isPlainRecord(scoringRule) ||
    scoringRule.mode !== 'manual_observation' ||
    !isPlainRecord(scoreRange) ||
    scoreRange.min !== 0 ||
    scoreRange.max !== 1 ||
    scoreRange.step !== 1
  ) {
    return null;
  }

  return { ...MMSE_READING_COMMAND_OBSERVATION_CONFIG };
}
