import type { AssessmentHistoryScaleInstanceSummary } from '../../assessments/services/assessments.service';
import type { AssessmentHistoryCognitiveDomainResultSummary } from '../../cognitive-domains/services/cognitive-domains.service';
import type { ClinicalReportHistoryRecord } from '../../reports/services/reports.service';
import type { AssessmentHistoryScoreResultSummary } from '../../scoring/services/scoring.service';
import {
  mapAssessmentHistoryDomainSummary,
  mapAssessmentHistoryReportSummary,
  mapAssessmentHistoryScoreSummary,
} from './assessment-history.mapper';

const ids = {
  patient: '507f1f77bcf86cd799439011',
  visit: '507f1f77bcf86cd799439012',
  instance: '507f1f77bcf86cd799439013',
  score: '507f1f77bcf86cd799439014',
  domain: '507f1f77bcf86cd799439015',
  report: '507f1f77bcf86cd799439016',
};
const at = new Date('2026-07-19T08:00:00.000Z');

function instance(): AssessmentHistoryScaleInstanceSummary {
  return {
    id: ids.instance,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    scaleCode: 'moca',
    scaleVersion: '1.0.0',
    instanceCode: 'SI-HISTORY-1',
    instanceNo: 1,
    status: 'locked',
    administrationMode: 'clinician_administered',
    versionTrace: {
      crfVersion: 'crf-1',
      scoringRuleVersion: 'score-1',
      fieldEncodingVersion: 'field-1',
    },
    startedAt: at,
    completedAt: at,
    lockedAt: at,
    voidedAt: null,
    durationMs: 1000,
  };
}

function score(
  overrides: Partial<AssessmentHistoryScoreResultSummary> = {},
): AssessmentHistoryScoreResultSummary {
  return {
    id: ids.score,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    scaleInstanceId: ids.instance,
    scaleCode: 'moca',
    runNo: 1,
    status: 'locked',
    versionTrace: {
      scaleVersion: '1.0.0',
      crfVersion: 'crf-1',
      scoringRuleVersion: 'score-1',
      fieldEncodingVersion: 'field-1',
    },
    totalScore: {
      scoreValue: 24,
      minScore: 0,
      maxScore: 30,
      scorePercent: 80,
      scoredItemCount: 10,
      totalItemCount: 10,
      unscoredItemCount: 0,
      missingItemCount: 0,
      needsReviewItemCount: 0,
    },
    review: {
      reviewStatus: 'reviewed',
      reviewedAt: at,
      reviewerId: null,
    },
    qualityStatus: 'passed',
    confirmedAt: at,
    lockedAt: at,
    voidedAt: null,
    ...overrides,
  };
}

function domain(
  overrides: Partial<AssessmentHistoryCognitiveDomainResultSummary> = {},
): AssessmentHistoryCognitiveDomainResultSummary {
  return {
    id: ids.domain,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    scaleInstanceId: ids.instance,
    scoreResultId: ids.score,
    scaleCode: 'moca',
    runNo: 1,
    status: 'locked',
    mappingSource: 'scale_config',
    mappingMode: 'item_domain_codes',
    versionTrace: {
      scaleVersion: '1.0.0',
      crfVersion: 'crf-1',
      scoringRuleVersion: 'score-1',
      fieldEncodingVersion: 'field-1',
      domainMappingVersion: 'domain-1',
    },
    domainScores: [
      {
        domainCode: 'memory',
        scoreValue: 4,
        minScore: 0,
        maxScore: 5,
        scorePercent: 80,
        weightedScore: null,
        weightedMaxScore: null,
        itemCount: 2,
        scoredItemCount: 2,
        unscoredItemCount: 0,
        missingItemCount: 0,
        needsReviewItemCount: 0,
        excludedItemCount: 0,
      },
    ],
    mappingSnapshot: { mappingVersion: 'domain-1', domainCodes: ['memory'] },
    computation: { computedAt: at, warningCount: 0 },
    qualityStatus: 'passed',
    voidedAt: null,
    ...overrides,
  };
}

function report(
  overrides: Partial<ClinicalReportHistoryRecord> = {},
): ClinicalReportHistoryRecord {
  return {
    id: ids.report,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    reportCode: 'RPT-HISTORY-V1',
    reportType: 'cognitive_assessment',
    status: 'draft',
    reportVersion: 1,
    source: 'system_draft',
    qualityStatus: 'unchecked',
    confirmation: null,
    lockedAt: null,
    lockedBy: null,
    archivedAt: null,
    archivedBy: null,
    correctionRecords: [],
    voidedAt: null,
    metadata: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

describe('assessment history safe mapper', () => {
  it('publishes numeric score data only for a unique eligible source', () => {
    const available = mapAssessmentHistoryScoreSummary(instance(), [score()]);
    expect(available).toMatchObject({
      availability: 'available',
      totalScoreValue: 24,
      totalMinScore: 0,
      totalMaxScore: 30,
      scorePercent: 80,
    });
    const notFinal = mapAssessmentHistoryScoreSummary(instance(), [
      score({ status: 'computed', confirmedAt: null, lockedAt: null }),
    ]);
    expect(notFinal).toMatchObject({
      availability: 'source_not_final',
      totalScoreValue: null,
      totalMinScore: null,
      totalMaxScore: null,
      scorePercent: null,
    });
    expect(
      mapAssessmentHistoryScoreSummary(instance(), [
        score(),
        score({ id: '507f1f77bcf86cd799439099' }),
      ])?.availability,
    ).toBe('source_incomplete');
    expect(
      mapAssessmentHistoryScoreSummary(instance(), [
        score({ status: 'voided', voidedAt: at }),
      ])?.availability,
    ).toBe('source_voided');
  });

  it('keeps an available score when its bound domain is incomplete', () => {
    const scoreSource = score();
    const scoreSummary = mapAssessmentHistoryScoreSummary(instance(), [
      scoreSource,
    ]);
    const domainSummary = mapAssessmentHistoryDomainSummary({
      instance: instance(),
      scoreCandidates: [scoreSource],
      scoreSummary,
      domainCandidates: [
        domain({ computation: { computedAt: at, warningCount: 1 } }),
      ],
    });
    expect(scoreSummary?.availability).toBe('available');
    expect(domainSummary).toMatchObject({
      availability: 'source_incomplete',
      mappingVersion: null,
      domainCount: 0,
    });
    expect(Object.keys(domainSummary ?? {}).sort()).toEqual(
      [
        'availability',
        'computedAt',
        'domainCount',
        'mappingVersion',
        'qualityStatus',
        'status',
      ].sort(),
    );
  });

  it('maps no-report, valid V1, and unsafe report chains without throwing', () => {
    expect(
      mapAssessmentHistoryReportSummary({
        reports: [],
        patientId: ids.patient,
        assessmentVisitId: ids.visit,
      }),
    ).toEqual({
      status: 'none',
      totalVersions: 0,
      latest: null,
      latestArchivedVersion: null,
    });
    expect(
      mapAssessmentHistoryReportSummary({
        reports: [report()],
        patientId: ids.patient,
        assessmentVisitId: ids.visit,
      }),
    ).toMatchObject({ status: 'available', totalVersions: 1 });
    expect(
      mapAssessmentHistoryReportSummary({
        reports: [report({ reportVersion: 2 })],
        patientId: ids.patient,
        assessmentVisitId: ids.visit,
      }),
    ).toMatchObject({ status: 'incomplete', totalVersions: 1 });
  });
});
