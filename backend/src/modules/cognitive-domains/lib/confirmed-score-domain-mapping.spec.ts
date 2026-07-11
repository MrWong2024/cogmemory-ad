import { Types } from 'mongoose';
import type { ScaleVersionSummary } from '../../scales/services/scales.service';
import type { ScoreResultSummary } from '../../scoring/services/scoring.service';
import {
  A19_MAPPING_RULES,
  A19_DOMAIN_MAPPING_VERSION,
  ConfirmedScoreDomainMappingError,
  mapConfirmedScoreToDomainInputs,
} from './confirmed-score-domain-mapping';

function expectMappingError(
  callback: () => unknown,
  code: ConfirmedScoreDomainMappingError['code'],
): void {
  try {
    callback();
    throw new Error(`Expected ${code}`);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ConfirmedScoreDomainMappingError);
    if (error instanceof ConfirmedScoreDomainMappingError) {
      expect(error.code).toBe(code);
    }
  }
}

function createVersion(): ScaleVersionSummary {
  return {
    id: new Types.ObjectId().toString(),
    scaleDefinitionId: new Types.ObjectId().toString(),
    scaleCode: 'test-scale',
    version: '1.0',
    status: 'active',
    totalScoreRange: { min: 0, max: 4, step: 1 },
    groups: [],
    items: [
      {
        code: 'item.scored',
        title: 'Scored item',
        order: 2,
        responseType: 'number',
        scoreRange: { min: 1, max: 4, step: 1 },
        countsTowardTotal: true,
        cognitiveDomainCodes: [' Memory ', 'executive_function'],
        evidenceTypes: [],
        requiresTimer: false,
        supportsPhotoUpload: false,
        supportsHandwriting: false,
        requiresOperatorNote: false,
        scoringRule: null,
        qualityControlRule: null,
        reportingRule: null,
      },
      {
        code: 'item.process',
        title: 'Process item',
        order: 1,
        responseType: 'text',
        scoreRange: { min: 0, max: 0 },
        countsTowardTotal: false,
        cognitiveDomainCodes: ['memory'],
        evidenceTypes: [],
        requiresTimer: false,
        supportsPhotoUpload: false,
        supportsHandwriting: false,
        requiresOperatorNote: false,
        scoringRule: null,
        qualityControlRule: null,
        reportingRule: null,
      },
    ],
    qualityControlRules: null,
    reportingRules: null,
    researchExportMappings: null,
    effectiveFrom: null,
    retiredAt: null,
  };
}

function createScore(version: ScaleVersionSummary): ScoreResultSummary {
  const now = new Date('2026-07-11T01:00:00.000Z');
  return {
    id: new Types.ObjectId().toString(),
    patientId: new Types.ObjectId().toString(),
    assessmentVisitId: new Types.ObjectId().toString(),
    scaleInstanceId: new Types.ObjectId().toString(),
    subjectCode: 'SUBJ-A19-TEST-PURE',
    scaleDefinitionId: version.scaleDefinitionId,
    scaleVersionId: version.id,
    scaleCode: version.scaleCode,
    scaleVersion: version.version,
    instanceCode: 'INST-A19-TEST-PURE',
    scoreResultCode: 'SCR-A19-TEST-PURE',
    runNo: 1,
    status: 'confirmed',
    scoringSource: 'mixed',
    scoringMode: 'rule_based',
    versionTrace: null,
    totalScore: {
      scoreValue: 3,
      minScore: 1,
      maxScore: 4,
      scorePercent: 66.66666666666666,
      scoredItemCount: 1,
      totalItemCount: 1,
      unscoredItemCount: 0,
      missingItemCount: 0,
      needsReviewItemCount: 0,
    },
    itemScores: [
      {
        itemResponseId: new Types.ObjectId().toString(),
        itemCode: ' ITEM.SCORED ',
        itemOrder: 2,
        countsTowardTotal: true,
        includedInTotal: true,
        scoreValue: 3,
        minScore: 1,
        maxScore: 4,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        isMissing: false,
        cognitiveDomainCodes: ['memory', ' Executive_Function ', 'MEMORY'],
      },
      {
        itemResponseId: new Types.ObjectId().toString(),
        itemCode: 'item.process',
        itemOrder: 1,
        countsTowardTotal: false,
        includedInTotal: false,
        scoreValue: null,
        minScore: 0,
        maxScore: 0,
        scoreStatus: 'not_scored',
        scoreSource: 'none',
        isMissing: false,
        cognitiveDomainCodes: ['memory'],
      },
    ],
    groupScores: [],
    computation: {
      computedAt: now,
      computedBy: null,
      inputItemCount: 2,
      includedItemCount: 1,
      excludedItemCount: 1,
      warningCount: 0,
    },
    review: {
      reviewStatus: 'reviewed',
      reviewedAt: now,
      reviewerId: new Types.ObjectId().toString(),
    },
    qualityStatus: 'passed',
    qualityHints: null,
    metadata: null,
    confirmedAt: now,
    lockedAt: null,
    voidedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('mapConfirmedScoreToDomainInputs', () => {
  it('deduplicates domains and keeps full overlapping attribution', () => {
    const version = createVersion();
    const score = createScore(version);
    const before = JSON.stringify(score.itemScores);

    const result = mapConfirmedScoreToDomainInputs(score, version);

    expect(result.domainCodes).toEqual(['executive_function', 'memory']);
    expect(result.mappingSnapshot).toEqual({
      mappingVersion: A19_DOMAIN_MAPPING_VERSION,
      mappingSource: 'scale_config',
      domainCodes: ['executive_function', 'memory'],
      mappingRules: A19_MAPPING_RULES,
      notes: result.mappingSnapshot.notes,
    });
    expect(result.mappingSnapshot.notes).toContain('must not be summed');
    expect(result.items[0].domainMappings).toEqual([
      {
        domainCode: 'executive_function',
        weight: 1,
        countsTowardDomain: true,
      },
      { domainCode: 'memory', weight: 1, countsTowardDomain: true },
    ]);
    expect(result.items[0]).toEqual(
      expect.objectContaining({ scoreValue: 3, minScore: 1, maxScore: 4 }),
    );
    expect(result.items[1].domainMappings).toEqual([
      { domainCode: 'memory', weight: 1, countsTowardDomain: false },
    ]);
    expect(JSON.stringify(score.itemScores)).toBe(before);
  });

  it.each([
    ['item set', (score: ScoreResultSummary) => score.itemScores.pop()],
    [
      'countsTowardTotal',
      (score: ScoreResultSummary) => {
        score.itemScores[0].countsTowardTotal = false;
      },
    ],
    [
      'score range',
      (score: ScoreResultSummary) => {
        score.itemScores[0].maxScore = 5;
      },
    ],
    [
      'domain codes',
      (score: ScoreResultSummary) => {
        score.itemScores[0].cognitiveDomainCodes = ['memory'];
      },
    ],
    [
      'finite score',
      (score: ScoreResultSummary) => {
        score.itemScores[0].scoreValue = Number.POSITIVE_INFINITY;
      },
    ],
  ])('rejects invalid %s binding', (_label, mutate) => {
    const version = createVersion();
    const score = createScore(version);
    mutate(score);
    expectMappingError(
      () => mapConfirmedScoreToDomainInputs(score, version),
      'COGNITIVE_DOMAIN_INPUT_INVALID',
    );
  });

  it('uses mapping-unavailable when every scoring item lacks a domain', () => {
    const version = createVersion();
    version.items[0].cognitiveDomainCodes = [];
    const score = createScore(version);
    score.itemScores[0].cognitiveDomainCodes = [];
    expectMappingError(
      () => mapConfirmedScoreToDomainInputs(score, version),
      'COGNITIVE_DOMAIN_MAPPING_UNAVAILABLE',
    );
  });

  it('allows an unmapped non-scoring process item', () => {
    const version = createVersion();
    version.items[1].cognitiveDomainCodes = [];
    const score = createScore(version);
    score.itemScores[1].cognitiveDomainCodes = [];
    const result = mapConfirmedScoreToDomainInputs(score, version);
    expect(result.items[1].domainMappings).toEqual([]);
  });
});
