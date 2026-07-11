import type { CognitiveDomainResultSummary } from './cognitive-domains.service';
import { CognitiveDomainResultPublicMapper } from './cognitive-domain-result-public.mapper';

function createResult(): CognitiveDomainResultSummary {
  const now = new Date('2026-07-11T02:00:00.000Z');
  return {
    id: '507f1f77bcf86cd799439011',
    patientId: '507f1f77bcf86cd799439012',
    assessmentVisitId: '507f1f77bcf86cd799439013',
    scaleInstanceId: '507f1f77bcf86cd799439014',
    scoreResultId: '507f1f77bcf86cd799439015',
    subjectCode: 'SUBJ-A19-TEST-MAPPER',
    scaleDefinitionId: '507f1f77bcf86cd799439016',
    scaleVersionId: '507f1f77bcf86cd799439017',
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: 'INST-A19-TEST-MAPPER',
    domainResultCode: 'CDR-A19-TEST-MAPPER',
    runNo: 1,
    status: 'computed',
    mappingSource: 'scale_config',
    mappingMode: 'item_domain_codes',
    versionTrace: { domainMappingVersion: 'a19-item-domain-codes-1.0' },
    domainScores: [
      {
        domainCode: 'memory',
        scoreValue: 2,
        minScore: 1,
        maxScore: 3,
        scorePercent: 50,
        weightedScore: 2,
        weightedMaxScore: 3,
        itemCount: 1,
        scoredItemCount: 1,
        unscoredItemCount: 0,
        missingItemCount: 0,
        needsReviewItemCount: 0,
        excludedItemCount: 0,
      },
    ],
    itemContributions: [
      {
        itemResponseId: '507f1f77bcf86cd799439018',
        scoreResultId: '507f1f77bcf86cd799439015',
        itemCode: 'item.b',
        itemOrder: 2,
        domainCode: 'memory',
        weight: 1,
        countsTowardDomain: true,
        scoreValue: 2,
        maxScore: 3,
        weightedScore: 2,
        weightedMaxScore: 3,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        isMissing: false,
        note: 'private internal note',
      },
    ],
    mappingSnapshot: {
      mappingVersion: 'a19-item-domain-codes-1.0',
      mappingSource: 'scale_config',
      domainCodes: ['memory'],
      mappingRules: { forged: 'must not be exposed' },
      notes: 'internal note',
    },
    computation: {
      computedAt: now,
      computedBy: '507f1f77bcf86cd799439019',
      ruleSetCode: 'item-domain-codes',
      ruleSetVersion: 'a19-item-domain-codes-1.0',
      engineVersion: 'a19-cognitive-domain-1.0',
      inputItemCount: 1,
      contributionCount: 1,
      domainCount: 1,
      includedContributionCount: 1,
      excludedContributionCount: 0,
      warningCount: 0,
    },
    review: {
      reviewStatus: 'not_required',
      reviewedAt: null,
      reviewerId: null,
      reviewNote: 'private review note',
    },
    qualityStatus: 'unchecked',
    qualityHints: { private: true },
    operatorNote: 'private operator note',
    metadata: { private: true },
    confirmedAt: null,
    lockedAt: null,
    voidedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('CognitiveDomainResultPublicMapper', () => {
  it('returns controlled mapping semantics and excludes internal fields', () => {
    const mapper = new CognitiveDomainResultPublicMapper();
    const response = mapper.toPublicResult(createResult());
    expect(response.status).toBe('computed');
    expect(response.isFinal).toBe(false);
    expect(response.mapping.policy).toEqual({
      strategy: 'full_item_score_per_domain',
      weight: 1,
      deduplicatePerItem: true,
      overlappingDomains: true,
    });
    expect(response.mapping.interpretation).toEqual({
      attribution: 'overlapping_full_item_scores',
      domainScoresAreScaleTotalPartition: false,
      scorePercentIsDiagnosticProbability: false,
      isDiagnosticConclusion: false,
    });
    const serialized = JSON.stringify(response);
    for (const forbidden of [
      'computedBy',
      'metadata',
      'qualityHints',
      'operatorNote',
      'reviewNote',
      'scoreResultId',
      'forged',
      'rawResponse',
      'scoringRule',
      'expectedValue',
    ]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it('normalizes non-finite numbers and sorts copied arrays', () => {
    const mapper = new CognitiveDomainResultPublicMapper();
    const result = createResult();
    result.domainScores.push({
      ...result.domainScores[0],
      domainCode: 'attention',
      scoreValue: Number.POSITIVE_INFINITY,
    });
    const response = mapper.toPublicResult(result);
    expect(response.domainScores.map((score) => score.domainCode)).toEqual([
      'attention',
      'memory',
    ]);
    expect(response.domainScores[0].scoreValue).toBeNull();
    expect(result.domainScores[0].domainCode).toBe('memory');
  });
});
