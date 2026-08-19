// backend/src/modules/scales/seeds/scale-seed-data.service.ts
import { Injectable } from '@nestjs/common';
import {
  PATIENT_ADMINISTRATION_ADVANCE_BY_VALUES,
  PATIENT_ADMINISTRATION_RESPONSE_MODES,
} from '../schemas/scale-version.schema';
import { MMSE_SCALE_SEED } from './mmse.seed';
import { MOCA_SCALE_SEED } from './moca.seed';
import type {
  ScaleSeedData,
  ScaleSeedItem,
  ScaleSeedRuleConfig,
  ScaleSeedScoreRange,
  ScaleSeedValidationIssue,
  ScaleSeedValidationResult,
  ScaleSeedVersion,
} from './scale-seed.types';

const BUILT_IN_SCALE_SEEDS: ScaleSeedData[] = [
  MMSE_SCALE_SEED,
  MOCA_SCALE_SEED,
];

@Injectable()
export class ScaleSeedDataService {
  normalizeScaleCode(code: string): string {
    return normalizeSeedCode(code);
  }

  getAllScaleSeeds(): ScaleSeedData[] {
    return cloneSeedArray(BUILT_IN_SCALE_SEEDS);
  }

  getScaleSeedByCode(scaleCode: string): ScaleSeedData | null {
    const normalizedCode = this.normalizeScaleCode(scaleCode);

    if (!normalizedCode) {
      return null;
    }

    const seed = BUILT_IN_SCALE_SEEDS.find(
      (item) => normalizeSeedCode(item.definition.code) === normalizedCode,
    );

    return seed ? cloneSeed(seed) : null;
  }

  getScaleVersionSeed(
    scaleCode: string,
    version: string,
  ): ScaleSeedVersion | null {
    const normalizedCode = this.normalizeScaleCode(scaleCode);
    const normalizedVersion = version.trim();

    if (!normalizedCode || !normalizedVersion) {
      return null;
    }

    const seed = BUILT_IN_SCALE_SEEDS.find(
      (item) =>
        normalizeSeedCode(item.version.scaleCode) === normalizedCode &&
        item.version.version.trim() === normalizedVersion,
    );

    return seed ? structuredClone(seed.version) : null;
  }

  listSeedScaleDefinitions() {
    return BUILT_IN_SCALE_SEEDS.map((seed) => structuredClone(seed.definition));
  }

  listSeedScaleVersions(): ScaleSeedVersion[] {
    return BUILT_IN_SCALE_SEEDS.map((seed) => structuredClone(seed.version));
  }

  validateScaleSeeds(
    seeds: ScaleSeedData[] = BUILT_IN_SCALE_SEEDS,
  ): ScaleSeedValidationResult {
    return validateScaleSeeds(seeds);
  }
}

export function validateScaleSeeds(
  seeds: ScaleSeedData[] = BUILT_IN_SCALE_SEEDS,
): ScaleSeedValidationResult {
  const issues: ScaleSeedValidationIssue[] = [];
  const definitionCodes = new Set<string>();
  const versionKeys = new Set<string>();
  const itemCodes = new Set<string>();

  seeds.forEach((seed, seedIndex) => {
    const scaleCode = normalizeSeedCode(seed.definition.code);
    const issueScaleCode = scaleCode || `seed-${seedIndex + 1}`;

    if (!scaleCode) {
      addIssue(issues, 'error', 'scale_definition_code_empty', {
        message: 'scale definition code must not be empty',
        scaleCode: issueScaleCode,
      });
    } else if (definitionCodes.has(scaleCode)) {
      addIssue(issues, 'error', 'scale_definition_code_duplicate', {
        message: `duplicate scale definition code: ${scaleCode}`,
        scaleCode,
      });
    } else {
      definitionCodes.add(scaleCode);
    }

    const versionScaleCode = normalizeSeedCode(seed.version.scaleCode);
    if (!versionScaleCode) {
      addIssue(issues, 'error', 'scale_version_scale_code_empty', {
        message: 'scale version scaleCode must not be empty',
        scaleCode: issueScaleCode,
      });
    }

    if (scaleCode && versionScaleCode && versionScaleCode !== scaleCode) {
      addIssue(issues, 'error', 'scale_version_scale_code_mismatch', {
        message: `scale version scaleCode ${versionScaleCode} does not match definition code ${scaleCode}`,
        scaleCode,
      });
    }

    const version = seed.version.version.trim();
    if (!version) {
      addIssue(issues, 'error', 'scale_version_empty', {
        message: 'scale version must not be empty',
        scaleCode: issueScaleCode,
      });
    }

    if (versionScaleCode && version) {
      const versionKey = `${versionScaleCode}:${version}`;
      if (versionKeys.has(versionKey)) {
        addIssue(issues, 'error', 'scale_version_duplicate', {
          message: `duplicate scale version: ${versionKey}`,
          scaleCode: versionScaleCode,
        });
      } else {
        versionKeys.add(versionKey);
      }
    }

    validateScoreRange(
      seed.version.totalScoreRange,
      'totalScoreRange',
      issues,
      issueScaleCode,
    );

    const groupCodes = collectGroupCodes(seed, issues, issueScaleCode);
    validateItems(seed, groupCodes, itemCodes, issues, issueScaleCode);
    validatePatientAdministration(seed, issues, issueScaleCode);
  });

  const errors = issues
    .filter((issue) => issue.level === 'error')
    .map((issue) => issue.message);
  const warnings = issues
    .filter((issue) => issue.level === 'warning')
    .map((issue) => issue.message);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    issues,
  };
}

function collectGroupCodes(
  seed: ScaleSeedData,
  issues: ScaleSeedValidationIssue[],
  scaleCode: string,
): Set<string> {
  const groupCodes = new Set<string>();

  seed.version.groups.forEach((group) => {
    const groupCode = group.code.trim();

    if (!groupCode) {
      addIssue(issues, 'error', 'scale_group_code_empty', {
        message: `group code must not be empty in scale ${scaleCode}`,
        scaleCode,
      });
      return;
    }

    if (groupCodes.has(groupCode)) {
      addIssue(issues, 'error', 'scale_group_code_duplicate', {
        message: `duplicate group code in scale ${scaleCode}: ${groupCode}`,
        scaleCode,
      });
      return;
    }

    groupCodes.add(groupCode);
  });

  return groupCodes;
}

function validateItems(
  seed: ScaleSeedData,
  groupCodes: Set<string>,
  itemCodes: Set<string>,
  issues: ScaleSeedValidationIssue[],
  scaleCode: string,
) {
  const crfCodes = new Set<string>();

  seed.version.items.forEach((item) => {
    const itemCode = item.code.trim();

    if (!itemCode) {
      addIssue(issues, 'error', 'scale_item_code_empty', {
        message: `item code must not be empty in scale ${scaleCode}`,
        scaleCode,
      });
    } else if (itemCodes.has(itemCode)) {
      addIssue(issues, 'error', 'scale_item_code_duplicate', {
        message: `duplicate item code: ${itemCode}`,
        scaleCode,
        itemCode,
      });
    } else {
      itemCodes.add(itemCode);
    }

    if (item.groupCode && !groupCodes.has(item.groupCode)) {
      addIssue(issues, 'error', 'scale_item_group_missing', {
        message: `item ${itemCode} references missing groupCode: ${item.groupCode}`,
        scaleCode,
        itemCode,
      });
    }

    if (item.crfCode) {
      const crfCode = item.crfCode.trim();
      if (crfCodes.has(crfCode)) {
        addIssue(issues, 'warning', 'scale_item_crf_code_duplicate_risk', {
          message: `duplicate CRF code risk in scale ${scaleCode}: ${crfCode}`,
          scaleCode,
          itemCode,
        });
      } else {
        crfCodes.add(crfCode);
      }
    }

    validateScoreRange(
      item.scoreRange,
      `item ${itemCode}`,
      issues,
      scaleCode,
      itemCode,
    );
    validateEvidenceConsistency(item, issues, scaleCode);
    validateMultiStepCalculation(item, issues, scaleCode);
    validateKnownCorrections(item, issues, scaleCode);
  });
}

function validatePatientAdministration(
  seed: ScaleSeedData,
  issues: ScaleSeedValidationIssue[],
  scaleCode: string,
) {
  const packageKey: unknown = seed.version.presentationPackageKey;
  const steps: unknown = seed.version.patientAdministrationSteps;
  const hasPackageKey = packageKey !== undefined;
  const hasSteps = steps !== undefined;

  if (hasPackageKey !== hasSteps) {
    addIssue(issues, 'error', 'patient_administration_config_incomplete', {
      message: `scale ${scaleCode} must define presentationPackageKey and patientAdministrationSteps together`,
      scaleCode,
    });
    return;
  }

  if (!hasPackageKey && !hasSteps) {
    return;
  }

  if (typeof packageKey !== 'string' || !packageKey.trim()) {
    addIssue(issues, 'error', 'presentation_package_key_empty', {
      message: `scale ${scaleCode} presentationPackageKey must not be empty`,
      scaleCode,
    });
  }

  if (!Array.isArray(steps)) {
    addIssue(issues, 'error', 'patient_administration_steps_not_array', {
      message: `scale ${scaleCode} patientAdministrationSteps must be an array`,
      scaleCode,
    });
    return;
  }

  const administrationSteps: unknown[] = steps;

  const itemCodes = new Set(seed.version.items.map((item) => item.code));
  const stepKeys = new Set<string>();
  const orders = new Set<number>();
  const explicitScoringAnswers = collectExplicitScoringAnswers(
    seed.version.items,
  );

  administrationSteps.forEach((step, index) => {
    if (!isRecord(step)) {
      addIssue(issues, 'error', 'patient_administration_step_invalid', {
        message: `scale ${scaleCode} patient administration step ${index + 1} must be an object`,
        scaleCode,
      });
      return;
    }

    const rawStepKey = step.stepKey;
    const stepKey = typeof rawStepKey === 'string' ? rawStepKey.trim() : '';
    const itemCode = step.itemCode;
    const order = step.order;
    const assetKeys = step.assetKeys;
    const patientText = step.patientText;

    if (!stepKey) {
      addIssue(issues, 'error', 'patient_administration_step_key_empty', {
        message: `scale ${scaleCode} patient administration stepKey must not be empty`,
        scaleCode,
      });
    } else if (stepKeys.has(stepKey)) {
      addIssue(issues, 'error', 'patient_administration_step_key_duplicate', {
        message: `duplicate patient administration stepKey in scale ${scaleCode}: ${stepKey}`,
        scaleCode,
      });
    } else {
      stepKeys.add(stepKey);
    }

    if (!Number.isInteger(order) || (order as number) <= 0) {
      addIssue(issues, 'error', 'patient_administration_order_invalid', {
        message: `patient administration step ${stepKey || index + 1} order must be a positive integer`,
        scaleCode,
      });
    } else if (orders.has(order as number)) {
      addIssue(issues, 'error', 'patient_administration_order_duplicate', {
        message: `duplicate patient administration order in scale ${scaleCode}: ${String(order)}`,
        scaleCode,
      });
    } else {
      orders.add(order as number);
    }

    if (typeof itemCode !== 'string' || !itemCodes.has(itemCode)) {
      addIssue(issues, 'error', 'patient_administration_item_missing', {
        message: `patient administration step ${stepKey || index + 1} references missing itemCode: ${String(itemCode)}`,
        scaleCode,
        itemCode: typeof itemCode === 'string' ? itemCode : undefined,
      });
    }

    if (
      typeof step.responseMode !== 'string' ||
      !PATIENT_ADMINISTRATION_RESPONSE_MODES.includes(
        step.responseMode as (typeof PATIENT_ADMINISTRATION_RESPONSE_MODES)[number],
      )
    ) {
      addIssue(
        issues,
        'error',
        'patient_administration_response_mode_invalid',
        {
          message: `patient administration step ${stepKey || index + 1} has invalid responseMode`,
          scaleCode,
        },
      );
    }

    if (
      typeof step.advanceBy !== 'string' ||
      !PATIENT_ADMINISTRATION_ADVANCE_BY_VALUES.includes(
        step.advanceBy as (typeof PATIENT_ADMINISTRATION_ADVANCE_BY_VALUES)[number],
      )
    ) {
      addIssue(issues, 'error', 'patient_administration_advance_by_invalid', {
        message: `patient administration step ${stepKey || index + 1} has invalid advanceBy`,
        scaleCode,
      });
    }

    if (
      !Array.isArray(assetKeys) ||
      !assetKeys.every((assetKey) => typeof assetKey === 'string')
    ) {
      addIssue(issues, 'error', 'patient_administration_asset_keys_invalid', {
        message: `patient administration step ${stepKey || index + 1} assetKeys must be a string array`,
        scaleCode,
      });
    } else if (new Set(assetKeys).size !== assetKeys.length) {
      addIssue(issues, 'error', 'patient_administration_asset_key_duplicate', {
        message: `patient administration step ${stepKey || index + 1} must not repeat assetKeys`,
        scaleCode,
      });
    }

    if (
      patientText !== undefined &&
      (typeof patientText !== 'string' || !patientText.trim())
    ) {
      addIssue(issues, 'error', 'patient_administration_patient_text_empty', {
        message: `patient administration step ${stepKey || index + 1} patientText must not be empty`,
        scaleCode,
      });
    }

    if (typeof patientText === 'string') {
      const leakedAnswer = explicitScoringAnswers.find((answer) =>
        patientText.includes(answer),
      );

      if (leakedAnswer) {
        addIssue(
          issues,
          'error',
          'patient_administration_scoring_answer_leak',
          {
            message: `patient administration step ${stepKey || index + 1} patientText must not contain an explicit scoring answer`,
            scaleCode,
            itemCode: typeof itemCode === 'string' ? itemCode : undefined,
          },
        );
      }
    }
  });

  const orderedValues = [...orders].sort((left, right) => left - right);
  if (
    orderedValues.length !== administrationSteps.length ||
    orderedValues.some((order, index) => order !== index + 1)
  ) {
    addIssue(issues, 'error', 'patient_administration_order_not_contiguous', {
      message: `scale ${scaleCode} patient administration order must be contiguous from 1`,
      scaleCode,
    });
  }

  if (normalizeSeedCode(seed.version.scaleCode) === 'mmse') {
    validateMmseReadingStep(administrationSteps, issues, scaleCode);
  }
}

function validateMmseReadingStep(
  steps: unknown[],
  issues: ScaleSeedValidationIssue[],
  scaleCode: string,
) {
  const readingStep = steps.find(
    (step): step is Record<string, unknown> =>
      isRecord(step) && step.stepKey === 'mmse-reading-command',
  );

  if (!readingStep) {
    addIssue(issues, 'error', 'mmse_reading_step_missing', {
      message: 'MMSE patient administration must include the reading step',
      scaleCode,
    });
    return;
  }

  if (
    readingStep.patientText !==
    '请您念一念下面这句话，并按照这句话的意思去做：“请闭上您的眼睛”'
  ) {
    addIssue(issues, 'error', 'mmse_reading_patient_text_invalid', {
      message:
        'MMSE reading step patientText must ask the patient to read 请闭上您的眼睛 aloud and follow it',
      scaleCode,
      itemCode: 'mmse.language.reading_command',
    });
  }

  if (!Array.isArray(readingStep.assetKeys) || readingStep.assetKeys.length) {
    addIssue(issues, 'error', 'mmse_reading_asset_keys_invalid', {
      message: 'MMSE reading step must not reference audio or image assets',
      scaleCode,
      itemCode: 'mmse.language.reading_command',
    });
  }

  if (readingStep.responseMode !== 'speech') {
    addIssue(issues, 'error', 'mmse_reading_response_mode_invalid', {
      message: 'MMSE reading step responseMode must be speech',
      scaleCode,
      itemCode: 'mmse.language.reading_command',
    });
  }
}

function collectExplicitScoringAnswers(items: ScaleSeedItem[]): string[] {
  const answers = new Set<string>();

  items.forEach((item) => {
    collectRuleAnswers(item.scoringRule, undefined, answers);
  });

  return [...answers];
}

function collectRuleAnswers(
  value: unknown,
  propertyName: string | undefined,
  answers: Set<string>,
) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectRuleAnswers(entry, propertyName, answers));
    return;
  }

  if (!isRecord(value)) {
    if (
      ['expected', 'text', 'word', 'words'].includes(propertyName ?? '') &&
      (typeof value === 'string' || typeof value === 'number')
    ) {
      const answer = String(value).trim();
      if (answer) {
        answers.add(answer);
      }
    }
    return;
  }

  Object.entries(value).forEach(([key, entry]) => {
    collectRuleAnswers(entry, key, answers);
  });
}

function validateScoreRange(
  scoreRange: ScaleSeedScoreRange,
  label: string,
  issues: ScaleSeedValidationIssue[],
  scaleCode: string,
  itemCode?: string,
) {
  if (!Number.isFinite(scoreRange.min) || !Number.isFinite(scoreRange.max)) {
    addIssue(issues, 'error', 'scale_score_range_not_finite', {
      message: `${label} scoreRange min and max must be finite numbers`,
      scaleCode,
      itemCode,
    });
    return;
  }

  if (scoreRange.max < scoreRange.min) {
    addIssue(issues, 'error', 'scale_score_range_invalid_bounds', {
      message: `${label} scoreRange max must be greater than or equal to min`,
      scaleCode,
      itemCode,
    });
  }

  if (scoreRange.step !== undefined && scoreRange.step <= 0) {
    addIssue(issues, 'error', 'scale_score_range_invalid_step', {
      message: `${label} scoreRange step must be greater than 0`,
      scaleCode,
      itemCode,
    });
  }
}

function validateEvidenceConsistency(
  item: ScaleSeedItem,
  issues: ScaleSeedValidationIssue[],
  scaleCode: string,
) {
  if (item.requiresTimer && !item.evidenceTypes.includes('duration')) {
    addIssue(issues, 'warning', 'scale_item_timer_without_duration', {
      message: `item ${item.code} requires timer but evidenceTypes does not include duration`,
      scaleCode,
      itemCode: item.code,
    });
  }

  if (item.supportsPhotoUpload && !item.evidenceTypes.includes('photo')) {
    addIssue(issues, 'warning', 'scale_item_photo_without_evidence', {
      message: `item ${item.code} supports photo upload but evidenceTypes does not include photo`,
      scaleCode,
      itemCode: item.code,
    });
  }

  if (item.supportsHandwriting && !item.evidenceTypes.includes('handwriting')) {
    addIssue(issues, 'warning', 'scale_item_handwriting_without_evidence', {
      message: `item ${item.code} supports handwriting but evidenceTypes does not include handwriting`,
      scaleCode,
      itemCode: item.code,
    });
  }
}

function validateMultiStepCalculation(
  item: ScaleSeedItem,
  issues: ScaleSeedValidationIssue[],
  scaleCode: string,
) {
  if (item.responseType !== 'multi_step_calculation') {
    return;
  }

  if (!hasNonEmptyArrayRule(item.scoringRule, 'steps')) {
    addIssue(issues, 'error', 'scale_item_multi_step_missing_steps', {
      message: `multi_step_calculation item ${item.code} must include scoringRule.steps`,
      scaleCode,
      itemCode: item.code,
    });
  }

  if (!hasRuleValue(item.scoringRule, 'independentStepScoring', true)) {
    addIssue(issues, 'warning', 'scale_item_multi_step_not_independent', {
      message: `multi_step_calculation item ${item.code} should declare independentStepScoring=true`,
      scaleCode,
      itemCode: item.code,
    });
  }
}

function validateKnownCorrections(
  item: ScaleSeedItem,
  issues: ScaleSeedValidationIssue[],
  scaleCode: string,
) {
  if (
    item.code.startsWith('moca.memory.immediate.') &&
    item.countsTowardTotal !== false
  ) {
    addIssue(issues, 'error', 'moca_immediate_memory_counts_toward_total', {
      message: `MoCA immediate memory item ${item.code} must set countsTowardTotal=false`,
      scaleCode,
      itemCode: item.code,
    });
  }

  if (
    item.code === 'moca.memory.delayed_recall' &&
    !hasNonEmptyArrayRule(item.scoringRule, 'promptRecords')
  ) {
    addIssue(issues, 'error', 'moca_delayed_recall_missing_prompt_records', {
      message:
        'MoCA delayed recall must preserve category cue and multiple choice prompt records',
      scaleCode,
      itemCode: item.code,
    });
  }

  if (item.code === 'moca.abstraction.train_bicycle') {
    validateExpectedCrfCode(
      item,
      'N1.2.12.1',
      'moca_abstraction_train_bicycle_crf_code_invalid',
      issues,
      scaleCode,
    );
  }

  if (item.code === 'moca.abstraction.watch_scale') {
    validateExpectedCrfCode(
      item,
      'N1.2.12.2',
      'moca_abstraction_watch_scale_crf_code_invalid',
      issues,
      scaleCode,
    );
  }

  if (
    item.code.startsWith('moca.abstraction.') &&
    (item.crfCode === 'N1.2.11.1' || item.crfCode === 'N1.2.11.2')
  ) {
    addIssue(issues, 'error', 'moca_abstraction_legacy_crf_code_used', {
      message: `MoCA abstraction item ${item.code} must not use legacy CRF code ${item.crfCode}`,
      scaleCode,
      itemCode: item.code,
    });
  }

  if (item.code === 'mmse.language.writing_sentence') {
    validateExpectedCrfCode(
      item,
      'MMSE.9',
      'mmse_writing_sentence_crf_code_invalid',
      issues,
      scaleCode,
    );
  }

  if (item.code === 'mmse.visuospatial.copy_drawing') {
    validateExpectedCrfCode(
      item,
      'MMSE.10',
      'mmse_copy_drawing_crf_code_invalid',
      issues,
      scaleCode,
    );
  }
}

function validateExpectedCrfCode(
  item: ScaleSeedItem,
  expectedCrfCode: string,
  issueCode: string,
  issues: ScaleSeedValidationIssue[],
  scaleCode: string,
) {
  if (item.crfCode !== expectedCrfCode) {
    addIssue(issues, 'error', issueCode, {
      message: `item ${item.code} must use CRF code ${expectedCrfCode}`,
      scaleCode,
      itemCode: item.code,
    });
  }
}

function hasNonEmptyArrayRule(
  rule: ScaleSeedRuleConfig,
  propertyName: string,
): boolean {
  if (!rule) {
    return false;
  }

  const value = rule[propertyName];
  return Array.isArray(value) && value.length > 0;
}

function hasRuleValue(
  rule: ScaleSeedRuleConfig,
  propertyName: string,
  expectedValue: unknown,
): boolean {
  if (!rule) {
    return false;
  }

  return rule[propertyName] === expectedValue;
}

function addIssue(
  issues: ScaleSeedValidationIssue[],
  level: ScaleSeedValidationIssue['level'],
  code: string,
  issue: {
    message: string;
    scaleCode?: string;
    itemCode?: string;
  },
) {
  issues.push({
    level,
    code,
    message: issue.message,
    scaleCode: issue.scaleCode,
    itemCode: issue.itemCode,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneSeedArray(seeds: ScaleSeedData[]): ScaleSeedData[] {
  return seeds.map((seed) => cloneSeed(seed));
}

function cloneSeed(seed: ScaleSeedData): ScaleSeedData {
  return structuredClone(seed);
}

function normalizeSeedCode(code: string): string {
  return code.trim().toLowerCase();
}
