import type { FollowUpTrendVisitSummary } from '../../assessments/services/assessments.service';
import type { AvailableScaleOptionResponse } from '../../scales/types/scale-catalog-response.types';
import type { FollowUpTrendSourceEvaluation } from './follow-up-trend-source';
import {
  FOLLOW_UP_TREND_COMPARABILITY_POLICY,
  mapPatientFollowUpTrendResponse,
} from './follow-up-trend.mapper';

const patientId = '507f1f77bcf86cd799439011';
const at = new Date('2026-07-19T08:00:00.000Z');

function scale(shortName: string | undefined = 'MoCA') {
  return {
    code: 'moca',
    name: 'Montreal Cognitive Assessment',
    shortName,
  } as AvailableScaleOptionResponse;
}

function visit(id: string, assessmentDate = at): FollowUpTrendVisitSummary {
  return {
    id,
    patientId,
    visitCode: `VIS-${id.slice(-2)}`,
    visitType: 'follow_up',
    status: 'completed',
    assessmentDate,
  };
}

function missing(): FollowUpTrendSourceEvaluation {
  return {
    dataStatus: 'source_missing',
    scaleInstance: null,
    score: null,
    domains: [],
    totalContext: null,
    domainContext: null,
    domainSourceAvailable: false,
    sourceReasons: [],
  };
}

function available(value: number): FollowUpTrendSourceEvaluation {
  return {
    dataStatus: 'available',
    scaleInstance: {
      id: '507f1f77bcf86cd799439099',
      instanceCode: 'SI-TREND-MAP',
      scaleCode: 'moca',
      scaleVersion: '1.0',
      administrationMode: 'clinician_administered',
      status: 'locked',
      durationMs: null,
      versionTrace: {
        scaleVersion: '1.0',
        crfVersion: 'crf-1',
        scoringRuleVersion: 'score-1',
        fieldEncodingVersion: 'field-1',
      },
    },
    score: {
      status: 'locked',
      qualityStatus: 'passed',
      totalScoreValue: value,
      totalMinScore: 0,
      totalMaxScore: 30,
      scorePercent: value * 3,
      confirmedAt: at,
      lockedAt: at,
    },
    domains: [
      {
        domainCode: 'memory',
        domainTitle: null,
        scoreValue: value,
        minScore: 0,
        maxScore: 20,
        scorePercent: value * 5,
        weightedScore: null,
        weightedMaxScore: null,
        itemCount: 2,
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
  };
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    Object.entries(value).forEach(([key, nested]) => {
      keys.add(key);
      collectKeys(nested, keys);
    });
  }
  return keys;
}

describe('follow-up trend safe mapper', () => {
  it('maps the fixed policy, preferred display name and nullable range', () => {
    const result = mapPatientFollowUpTrendResponse({
      scale: scale(),
      points: [],
    });
    expect(result).toEqual({
      scale: { scaleCode: 'moca', displayName: 'MoCA' },
      range: { dateFrom: null, dateTo: null, pointCount: 0 },
      comparabilityPolicy: FOLLOW_UP_TREND_COMPARABILITY_POLICY,
      points: [],
    });
    expect(
      mapPatientFollowUpTrendResponse({
        scale: scale('   '),
        points: [],
      }).scale.displayName,
    ).toBe('Montreal Cognitive Assessment');
  });

  it('sorts by assessment date and same-date id before adjacent comparison', () => {
    const lowerId = '507f1f77bcf86cd799439080';
    const higherId = '507f1f77bcf86cd799439081';
    const laterId = '507f1f77bcf86cd799439082';
    const result = mapPatientFollowUpTrendResponse({
      scale: scale(),
      points: [
        {
          visit: visit(laterId, new Date('2026-07-20T00:00:00.000Z')),
          evaluation: available(12),
        },
        { visit: visit(higherId), evaluation: missing() },
        { visit: visit(lowerId), evaluation: available(10) },
      ],
    });
    expect(result.points.map((point) => point.visit.id)).toEqual([
      lowerId,
      higherId,
      laterId,
    ]);
    expect(
      result.points.map((point) => point.comparisonToPrevious.status),
    ).toEqual(['first_point', 'unavailable', 'unavailable']);
    expect(result.range.pointCount).toBe(3);
  });

  it('uses explicit Visit, instance, score and domain field whitelists', () => {
    const result = mapPatientFollowUpTrendResponse({
      scale: scale(),
      dateFrom: at,
      dateTo: at,
      points: [
        {
          visit: visit('507f1f77bcf86cd799439080'),
          evaluation: available(10),
        },
      ],
    });
    expect(Object.keys(result).sort()).toEqual(
      ['scale', 'range', 'comparabilityPolicy', 'points'].sort(),
    );
    expect(Object.keys(result.points[0].visit).sort()).toEqual(
      ['id', 'visitCode', 'visitType', 'status', 'assessmentDate'].sort(),
    );
    expect(Object.keys(result.points[0].scaleInstance ?? {}).sort()).toEqual(
      [
        'id',
        'instanceCode',
        'scaleCode',
        'scaleVersion',
        'administrationMode',
        'status',
        'durationMs',
        'versionTrace',
      ].sort(),
    );
    expect(result.points[0].score).toEqual(
      expect.objectContaining({ totalScoreValue: 10 }),
    );
    expect(result.points[0].domains).toEqual([
      expect.objectContaining({ domainCode: 'memory', domainTitle: null }),
    ]);
    const forbidden = [
      'patientId',
      'subjectCode',
      'instanceNo',
      'scoreResultId',
      'domainResultId',
      'metadata',
      'itemScores',
      'itemContributions',
      'narrative',
      'risk',
      'probability',
      'diagnosis',
    ];
    const keys = collectKeys(result);
    forbidden.forEach((key) => expect(keys.has(key)).toBe(false));
  });
});
