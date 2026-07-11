import { Types } from 'mongoose';
import type { ScaleVersionSummary } from '../../scales/services/scales.service';
import type {
  ScoreItemSummary,
  ScoreResultSummary,
} from '../../scoring/services/scoring.service';
import type {
  CognitiveDomainItemInput,
  CognitiveDomainMappingSnapshotSummary,
} from '../services/cognitive-domains.service';

export const A19_DOMAIN_MAPPING_VERSION = 'a19-item-domain-codes-1.0';
export const A19_COGNITIVE_DOMAIN_ENGINE_VERSION = 'a19-cognitive-domain-1.0';

export const A19_MAPPING_RULES = {
  strategy: 'full_item_score_per_domain',
  weight: 1,
  deduplicatePerItem: true,
  overlappingDomains: true,
} as const;

export const A19_MAPPING_SAFETY_NOTE =
  'Domain scores use overlapping full-item attribution and must not be summed or interpreted as a partition of the scale total.';

export type ConfirmedScoreDomainMappingErrorCode =
  | 'COGNITIVE_DOMAIN_INPUT_INVALID'
  | 'COGNITIVE_DOMAIN_MAPPING_UNAVAILABLE';

export class ConfirmedScoreDomainMappingError extends Error {
  constructor(readonly code: ConfirmedScoreDomainMappingErrorCode) {
    super(code);
    this.name = 'ConfirmedScoreDomainMappingError';
  }
}

export type ConfirmedScoreDomainMappingResult = {
  items: CognitiveDomainItemInput[];
  mappingSnapshot: CognitiveDomainMappingSnapshotSummary;
  domainCodes: string[];
};

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeUniqueCodes(values: string[]): string[] {
  return [...new Set(values.map(normalizeCode).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function sameStringSet(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function validRange(min: number | null, max: number | null): boolean {
  return (
    typeof min === 'number' &&
    Number.isFinite(min) &&
    typeof max === 'number' &&
    Number.isFinite(max) &&
    min <= max
  );
}

function validItemResponseId(
  value: string | null | undefined,
): value is string {
  if (!value || !Types.ObjectId.isValid(value)) {
    return false;
  }
  return new Types.ObjectId(value).toString() === value.toLowerCase();
}

function assertUniqueItemCodes(
  items: { itemCode: string }[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of items) {
    const code = normalizeCode(item.itemCode);
    if (!code || result.has(code)) {
      throw new ConfirmedScoreDomainMappingError(
        'COGNITIVE_DOMAIN_INPUT_INVALID',
      );
    }
    result.set(code, 1);
  }
  return result;
}

function assertVersionItemCodes(
  items: ScaleVersionSummary['items'],
): Map<string, ScaleVersionSummary['items'][number]> {
  const result = new Map<string, ScaleVersionSummary['items'][number]>();
  for (const item of items) {
    const code = normalizeCode(item.code);
    if (!code || result.has(code)) {
      throw new ConfirmedScoreDomainMappingError(
        'COGNITIVE_DOMAIN_INPUT_INVALID',
      );
    }
    result.set(code, item);
  }
  return result;
}

function validateAndMapItem(
  scoreItem: ScoreItemSummary,
  versionItem: ScaleVersionSummary['items'][number],
): {
  item: CognitiveDomainItemInput;
  domainCodes: string[];
  scoringItem: boolean;
} {
  const snapshotDomains = normalizeUniqueCodes(scoreItem.cognitiveDomainCodes);
  const configuredDomains = normalizeUniqueCodes(
    versionItem.cognitiveDomainCodes,
  );
  if (
    scoreItem.cognitiveDomainCodes.some((code) => !normalizeCode(code)) ||
    versionItem.cognitiveDomainCodes.some((code) => !normalizeCode(code)) ||
    !sameStringSet(snapshotDomains, configuredDomains) ||
    scoreItem.countsTowardTotal !== versionItem.countsTowardTotal ||
    !validRange(scoreItem.minScore, scoreItem.maxScore) ||
    !validRange(versionItem.scoreRange.min, versionItem.scoreRange.max) ||
    scoreItem.minScore !== versionItem.scoreRange.min ||
    scoreItem.maxScore !== versionItem.scoreRange.max ||
    !Number.isInteger(scoreItem.itemOrder)
  ) {
    throw new ConfirmedScoreDomainMappingError(
      'COGNITIVE_DOMAIN_INPUT_INVALID',
    );
  }

  const scoringItem =
    scoreItem.countsTowardTotal === true && scoreItem.includedInTotal === true;
  if (scoreItem.countsTowardTotal && !scoreItem.includedInTotal) {
    throw new ConfirmedScoreDomainMappingError(
      'COGNITIVE_DOMAIN_INPUT_INVALID',
    );
  }
  if (
    scoringItem &&
    ((scoreItem.scoreStatus !== 'auto_scored' &&
      scoreItem.scoreStatus !== 'manual_scored') ||
      typeof scoreItem.scoreValue !== 'number' ||
      !Number.isFinite(scoreItem.scoreValue) ||
      scoreItem.scoreValue < versionItem.scoreRange.min ||
      scoreItem.scoreValue > versionItem.scoreRange.max)
  ) {
    throw new ConfirmedScoreDomainMappingError(
      'COGNITIVE_DOMAIN_INPUT_INVALID',
    );
  }
  if (
    snapshotDomains.length > 0 &&
    !validItemResponseId(scoreItem.itemResponseId)
  ) {
    throw new ConfirmedScoreDomainMappingError(
      'COGNITIVE_DOMAIN_INPUT_INVALID',
    );
  }

  return {
    scoringItem,
    domainCodes: snapshotDomains,
    item: {
      itemCode: normalizeCode(scoreItem.itemCode),
      itemResponseId: scoreItem.itemResponseId ?? undefined,
      crfCode: scoreItem.crfCode,
      groupCode: scoreItem.groupCode,
      itemTitle: scoreItem.itemTitle,
      itemOrder: scoreItem.itemOrder,
      scoreValue: scoreItem.scoreValue,
      minScore: scoreItem.minScore,
      maxScore: scoreItem.maxScore,
      scoreStatus: scoreItem.scoreStatus,
      scoreSource: scoreItem.scoreSource,
      isMissing: scoreItem.isMissing,
      domainMappings: snapshotDomains.map((domainCode) => ({
        domainCode,
        weight: 1,
        countsTowardDomain: scoringItem,
      })),
    },
  };
}

export function mapConfirmedScoreToDomainInputs(
  scoreResult: ScoreResultSummary,
  version: ScaleVersionSummary,
): ConfirmedScoreDomainMappingResult {
  const scoreCodes = assertUniqueItemCodes(scoreResult.itemScores);
  const versionItems = assertVersionItemCodes(version.items);
  if (
    scoreCodes.size !== versionItems.size ||
    [...scoreCodes.keys()].some((code) => !versionItems.has(code))
  ) {
    throw new ConfirmedScoreDomainMappingError(
      'COGNITIVE_DOMAIN_INPUT_INVALID',
    );
  }

  const mappedItems = scoreResult.itemScores.map((scoreItem) => {
    const versionItem = versionItems.get(normalizeCode(scoreItem.itemCode));
    if (!versionItem) {
      throw new ConfirmedScoreDomainMappingError(
        'COGNITIVE_DOMAIN_INPUT_INVALID',
      );
    }
    return validateAndMapItem(scoreItem, versionItem);
  });
  const scoringItems = mappedItems.filter((entry) => entry.scoringItem);
  const mappedScoringItems = scoringItems.filter(
    (entry) => entry.domainCodes.length > 0,
  );
  if (scoringItems.length === 0 || mappedScoringItems.length === 0) {
    throw new ConfirmedScoreDomainMappingError(
      'COGNITIVE_DOMAIN_MAPPING_UNAVAILABLE',
    );
  }
  if (mappedScoringItems.length !== scoringItems.length) {
    throw new ConfirmedScoreDomainMappingError(
      'COGNITIVE_DOMAIN_INPUT_INVALID',
    );
  }
  const domainCodes = normalizeUniqueCodes(
    mappedItems.flatMap((entry) => entry.domainCodes),
  );
  return {
    items: mappedItems.map((entry) => entry.item),
    domainCodes,
    mappingSnapshot: {
      mappingVersion: A19_DOMAIN_MAPPING_VERSION,
      mappingSource: 'scale_config',
      domainCodes,
      mappingRules: { ...A19_MAPPING_RULES },
      notes: A19_MAPPING_SAFETY_NOTE,
    },
  };
}
