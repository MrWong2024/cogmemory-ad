import type { FollowUpTrendSourceEvaluation } from './follow-up-trend-source';
import {
  compareFollowUpTrendSources,
  firstTrendComparison,
  sortTrendReasons,
} from './follow-up-trend-comparability';

const at = new Date('2026-07-19T08:00:00.000Z');

function available(
  scoreValue: number,
  overrides: Partial<FollowUpTrendSourceEvaluation> = {},
): FollowUpTrendSourceEvaluation {
  return {
    dataStatus: 'available',
    scaleInstance: null,
    score: {
      status: 'locked',
      qualityStatus: 'passed',
      totalScoreValue: scoreValue,
      totalMinScore: 0,
      totalMaxScore: 30,
      scorePercent: scoreValue * 3.333,
      confirmedAt: at,
      lockedAt: at,
    },
    domains: [
      {
        domainCode: 'attention',
        domainTitle: 'Attention',
        scoreValue: scoreValue / 2,
        minScore: 0,
        maxScore: 10,
        scorePercent: scoreValue * 5,
        weightedScore: null,
        weightedMaxScore: null,
        itemCount: 2,
      },
      {
        domainCode: 'memory',
        domainTitle: 'Memory',
        scoreValue,
        minScore: 0,
        maxScore: 20,
        scorePercent: scoreValue * 5,
        weightedScore: scoreValue,
        weightedMaxScore: 20,
        itemCount: 4,
      },
    ],
    totalContext: {
      scaleCode: 'moca',
      scaleVersion: '1.0',
      crfVersion: 'crf-1',
      scoringRuleVersion: 'score-1',
      fieldEncodingVersion: 'field-1',
      administrationMode: 'clinician_administered',
      totalMinScore: 0,
      totalMaxScore: 30,
    },
    domainContext: {
      domainMappingVersion: 'domain-1',
      mappingSource: 'scale_config',
      mappingMode: 'item_domain_codes',
    },
    domainSourceAvailable: true,
    sourceReasons: [],
    ...overrides,
  };
}

function unavailable(
  dataStatus: Exclude<FollowUpTrendSourceEvaluation['dataStatus'], 'available'>,
  sourceReasons: FollowUpTrendSourceEvaluation['sourceReasons'] = [],
): FollowUpTrendSourceEvaluation {
  return {
    dataStatus,
    scaleInstance: null,
    score: null,
    domains: [],
    totalContext: null,
    domainContext: null,
    domainSourceAvailable: false,
    sourceReasons,
  };
}

describe('follow-up trend exact comparability', () => {
  it('creates the fixed first-point comparison', () => {
    expect(firstTrendComparison()).toEqual({
      status: 'first_point',
      reasons: [],
      scoreDelta: null,
      scorePercentDelta: null,
      domainDeltas: { status: 'unavailable', reasons: [], items: [] },
    });
  });

  it('computes unrounded current-minus-previous total and domain deltas', () => {
    const result = compareFollowUpTrendSources(available(10), available(12));
    expect(result).toMatchObject({
      status: 'comparable',
      scoreDelta: 2,
      domainDeltas: { status: 'comparable' },
    });
    expect(result.scorePercentDelta).toBeCloseTo(6.666);
    expect(result.domainDeltas.items).toEqual([
      expect.objectContaining({
        domainCode: 'attention',
        status: 'comparable',
        scoreDelta: 1,
        weightedScoreDelta: null,
      }),
      expect.objectContaining({
        domainCode: 'memory',
        status: 'comparable',
        scoreDelta: 2,
        weightedScoreDelta: 2,
      }),
    ]);
  });

  it('returns every exact total mismatch in fixed order', () => {
    const previous = available(10);
    const current = available(12, {
      totalContext: {
        scaleCode: 'moca',
        scaleVersion: '2.0',
        crfVersion: 'crf-2',
        scoringRuleVersion: 'score-2',
        fieldEncodingVersion: 'field-2',
        administrationMode: 'paper_import',
        totalMinScore: 1,
        totalMaxScore: 31,
      },
    });
    const result = compareFollowUpTrendSources(previous, current);
    expect(result.status).toBe('not_comparable');
    expect(result.reasons).toEqual([
      'scale_version_changed',
      'crf_version_changed',
      'scoring_rule_version_changed',
      'field_encoding_version_changed',
      'administration_mode_changed',
      'score_range_changed',
    ]);
    expect(result.scoreDelta).toBeNull();
    expect(result.domainDeltas).toEqual(
      expect.objectContaining({ status: 'not_comparable' }),
    );
  });

  it('maps unavailable adjacent sources without skipping or free text', () => {
    const missing = unavailable('source_missing');
    const incomplete = unavailable('source_incomplete', [
      'version_trace_incomplete',
    ]);
    expect(compareFollowUpTrendSources(available(10), missing)).toMatchObject({
      status: 'unavailable',
      reasons: ['source_missing'],
      scoreDelta: null,
    });
    expect(compareFollowUpTrendSources(missing, incomplete)).toMatchObject({
      status: 'unavailable',
      reasons: [
        'version_trace_incomplete',
        'source_missing',
        'source_incomplete',
      ],
    });
    expect(compareFollowUpTrendSources(incomplete, available(12)).status).toBe(
      'unavailable',
    );
  });

  it('keeps reason de-duplication and order stable', () => {
    expect(
      sortTrendReasons([
        'source_incomplete',
        'scale_version_changed',
        'source_incomplete',
        'version_trace_incomplete',
      ]),
    ).toEqual([
      'scale_version_changed',
      'version_trace_incomplete',
      'source_incomplete',
    ]);
  });

  it('keeps total comparable when either domain source is unavailable', () => {
    const result = compareFollowUpTrendSources(
      available(10),
      available(12, {
        domains: [],
        domainContext: null,
        domainSourceAvailable: false,
      }),
    );
    expect(result.status).toBe('comparable');
    expect(result.domainDeltas).toEqual({
      status: 'unavailable',
      reasons: ['domain_source_incomplete'],
      items: [],
    });
  });

  it('returns all global domain mapping and set changes', () => {
    const current = available(12, {
      domainContext: {
        domainMappingVersion: 'domain-2',
        mappingSource: 'manual',
        mappingMode: 'weighted_mapping',
      },
      domains: [available(12).domains[1]],
    });
    const result = compareFollowUpTrendSources(available(10), current);
    expect(result.status).toBe('comparable');
    expect(result.domainDeltas.status).toBe('not_comparable');
    expect(result.domainDeltas.reasons).toEqual([
      'domain_mapping_version_changed',
      'domain_mapping_source_changed',
      'domain_mapping_mode_changed',
      'domain_set_changed',
    ]);
    expect(result.domainDeltas.items.map((item) => item.domainCode)).toEqual([
      'attention',
      'memory',
    ]);
  });

  it('supports partially comparable domains and weighted null/value semantics', () => {
    const currentBase = available(12);
    const current = available(12, {
      domains: [
        currentBase.domains[0],
        {
          ...currentBase.domains[1],
          maxScore: 21,
          weightedMaxScore: null,
        },
      ],
    });
    const result = compareFollowUpTrendSources(available(10), current);
    expect(result.domainDeltas.status).toBe('partially_comparable');
    expect(result.domainDeltas.reasons).toEqual(['domain_range_changed']);
    expect(result.domainDeltas.items[0].status).toBe('comparable');
    expect(result.domainDeltas.items[1]).toEqual(
      expect.objectContaining({
        status: 'not_comparable',
        reasons: ['domain_range_changed'],
        scoreDelta: null,
      }),
    );
  });
});
