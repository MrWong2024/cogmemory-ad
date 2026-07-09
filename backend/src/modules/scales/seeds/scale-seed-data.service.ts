// backend/src/modules/scales/seeds/scale-seed-data.service.ts
import { Injectable } from '@nestjs/common';
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

function cloneSeedArray(seeds: ScaleSeedData[]): ScaleSeedData[] {
  return seeds.map((seed) => cloneSeed(seed));
}

function cloneSeed(seed: ScaleSeedData): ScaleSeedData {
  return structuredClone(seed);
}

function normalizeSeedCode(code: string): string {
  return code.trim().toLowerCase();
}
