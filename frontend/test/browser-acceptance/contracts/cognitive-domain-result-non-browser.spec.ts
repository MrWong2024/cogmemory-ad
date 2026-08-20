import { expect, test } from '@playwright/test';

import {
  CognitiveDomainApiError,
  computeCognitiveDomainResult,
} from '@/src/features/assessments/api/cognitive-domain-api';
import {
  getCognitiveDomainComputeBlockReason,
  getCognitiveDomainDependencyMessage,
  type UseCognitiveDomainResultValue,
} from '@/src/features/assessments/hooks/useCognitiveDomainResult';
import {
  buildCognitiveDomainSourceScoreSummary,
  cognitiveDomainInterpretationStatements,
  cognitiveDomainNonDiagnosticStatements,
  cognitiveDomainResultStatusBadgeLabels,
  cognitiveDomainResultStatusLabels,
  formatCognitiveDomainSourceScoreSummary,
  getCognitiveDomainContributionPresentation,
  getCognitiveDomainContributionSummary,
  getCognitiveDomainScoreCardPresentation,
  getCognitiveDomainScoreTechnicalValues,
} from '@/src/features/assessments/lib/cognitive-domain-display';
import type {
  CognitiveDomainItemContribution,
  CognitiveDomainScore,
  ComputeCognitiveDomainResultRequest,
} from '@/src/features/assessments/types/cognitive-domain-result';

type LegacyComputeKey = Extract<
  keyof UseCognitiveDomainResultValue,
  | 'confirmationOpen'
  | 'confirmationChecked'
  | 'canPrepareCompute'
  | 'prepareCompute'
  | 'cancelCompute'
  | 'setConfirmationChecked'
  | 'confirmCompute'
>;

const oneStepContractIsPresent: 'canCompute' | 'compute' extends keyof UseCognitiveDomainResultValue
  ? true
  : false = true;
const legacyConfirmationContractIsAbsent: LegacyComputeKey extends never
  ? true
  : false = true;

const validSource = {
  id: 'score-result-a',
  status: 'confirmed' as const,
  isFinal: true,
};

const validDomainScore: CognitiveDomainScore = {
  domainCode: 'attention_calculation',
  domainTitle: '注意与计算',
  scoreValue: 3,
  minScore: 0,
  maxScore: 5,
  scorePercent: 60,
  weightedScore: 3,
  weightedMaxScore: 5,
  itemCount: 2,
  scoredItemCount: 2,
  unscoredItemCount: 0,
  missingItemCount: 0,
  needsReviewItemCount: 0,
  excludedItemCount: 0,
};

function buildContribution(
  overrides: Partial<CognitiveDomainItemContribution> = {},
): CognitiveDomainItemContribution {
  return {
    itemResponseId: 'item-response-a',
    itemCode: 'mmse-05',
    crfCode: 'MMSE_CRF',
    groupCode: 'attention',
    itemTitle: '连续减法',
    itemOrder: 5,
    domainCode: 'attention_calculation',
    domainTitle: '注意与计算',
    weight: 1,
    countsTowardDomain: true,
    scoreValue: 3,
    maxScore: 5,
    weightedScore: 3,
    weightedMaxScore: 5,
    scoreStatus: 'auto_scored',
    scoreSource: 'auto_rule',
    isMissing: false,
    ...overrides,
  };
}

function blockReason(
  overrides: Partial<
    Parameters<typeof getCognitiveDomainComputeBlockReason>[0]
  > = {},
) {
  return getCognitiveDomainComputeBlockReason({
    localBlockReason: null,
    sourceScoreResult: validSource,
    dependencyMessage: '请先完成评分并最终确认评分结果。',
    scaleInstanceStatus: 'completed',
    visitStatus: 'completed',
    status: 'not_found',
    computeProhibitedReason: null,
    ...overrides,
  });
}

test('exposes one-step compute without a local confirmation contract', () => {
  expect(oneStepContractIsPresent).toBe(true);
  expect(legacyConfirmationContractIsAbsent).toBe(true);
});

test('keeps every existing compute eligibility gate', () => {
  expect(blockReason()).toBeNull();
  expect(blockReason({ sourceScoreResult: null })).not.toBeNull();
  expect(
    blockReason({
      sourceScoreResult: { ...validSource, status: 'computed' },
    }),
  ).toBe('来源评分尚未达到可用于认知域分析的最终状态。');
  expect(
    blockReason({ sourceScoreResult: { ...validSource, status: 'voided' } }),
  ).toBe('来源评分已作废，只能查看已有认知域结果。');
  expect(
    blockReason({
      sourceScoreResult: { ...validSource, isFinal: false },
    }),
  ).toBe('来源评分尚未最终确认，不能生成认知域结果。');
  expect(blockReason({ scaleInstanceStatus: 'locked' })).toBe(
    '当前量表实例状态不允许生成新的认知域结果。',
  );
  expect(blockReason({ visitStatus: 'locked' })).toBe(
    '当前访视状态不允许生成认知域结果。',
  );
  expect(blockReason({ status: 'loaded' })).toBe(
    '当前已有认知域结果，现阶段不支持重新生成。',
  );
  expect(blockReason({ localBlockReason: '存在本地未保存作答。' })).toBe(
    '存在本地未保存作答。',
  );
  expect(blockReason({ computeProhibitedReason: '生成被服务端阻止。' })).toBe(
    '生成被服务端阻止。',
  );
});

test('uses doctor-facing dependency messages', () => {
  expect(getCognitiveDomainDependencyMessage(null, 'no_result', 'completed')).toBe(
    '当前尚无来源评分，请先完成评分并最终确认评分结果。',
  );
  expect(
    getCognitiveDomainDependencyMessage(
      { id: 'score-result-a', status: 'computed', isFinal: false },
      'loaded',
      'completed',
    ),
  ).toBe('当前评分结果尚未最终确认，暂不能生成认知域分析。');
});

test('presents computed as generated while preserving historical statuses', () => {
  expect(cognitiveDomainResultStatusLabels.computed).toBe(
    '认知域分析结果已生成',
  );
  expect(cognitiveDomainResultStatusBadgeLabels.computed).toBe('已生成');
  expect(cognitiveDomainResultStatusLabels).toMatchObject({
    draft: '认知域结果尚未完成',
    needs_review: '认知域结果需要进一步核对',
    confirmed: '认知域结果已确认',
    locked: '认知域结果已锁定',
    voided: '认知域结果已作废',
  });
});

test('keeps the core clinical boundary and detailed interpretation rules', () => {
  expect(cognitiveDomainNonDiagnosticStatements).toHaveLength(1);
  const safetyCopy = cognitiveDomainNonDiagnosticStatements.join(' ');
  expect(safetyCopy).toContain('单独形成诊断结论');
  const interpretationCopy = cognitiveDomainInterpretationStatements.join(' ');
  expect(interpretationCopy).toContain('多个认知域');
  expect(interpretationCopy).toContain('完整项目分值');
  expect(interpretationCopy).toContain('不能相加');
  expect(interpretationCopy).toContain('正常率');
  expect(interpretationCopy).toContain('疾病概率');
  expect(interpretationCopy).toContain('风险值');
});

test('builds the source score summary from the loaded score result', () => {
  const sourceSummary = buildCognitiveDomainSourceScoreSummary({
    scale: { name: '简易精神状态检查', shortName: 'MMSE' },
    scoreResult: {
      isFinal: true,
      totalScore: { provisionalScoreValue: 26, maxScore: 30 },
    },
  });

  expect(sourceSummary).toEqual({
    scaleLabel: 'MMSE',
    scoreValue: 26,
    maxScore: 30,
    isFinal: true,
  });
  expect(formatCognitiveDomainSourceScoreSummary(sourceSummary)).toBe(
    '来源评分：MMSE 26 / 30（已最终确认）',
  );
  expect(
    formatCognitiveDomainSourceScoreSummary({
      ...sourceSummary!,
      maxScore: null,
    }),
  ).toBe('来源评分：MMSE（已最终确认）');
  expect(
    formatCognitiveDomainSourceScoreSummary({
      ...sourceSummary!,
      scoreValue: null,
    }),
  ).toBe('来源评分：MMSE（已最终确认）');
  expect(formatCognitiveDomainSourceScoreSummary(null)).toBeNull();
});

test('presents mapped domain scores without normal-view technical fields', () => {
  const presentation =
    getCognitiveDomainScoreCardPresentation(validDomainScore);

  expect(presentation).toEqual({
    title: '注意与计算',
    scoreText: '3 / 5',
    rangeText: null,
    percentText: '60%',
    itemSummary: '映射项目：2 项',
    scoredSummary: '2 / 2 项已评分',
    abnormalSummaries: [],
  });
  expect(presentation).not.toHaveProperty('domainCode');
  expect(presentation).not.toHaveProperty('weightedScore');
  expect(presentation).not.toHaveProperty('weightedMaxScore');
  expect(getCognitiveDomainScoreTechnicalValues(validDomainScore)).toEqual({
    domainCode: 'attention_calculation',
    weightedScore: 3,
    weightedMaxScore: 5,
  });
});

test('suppresses zero anomaly counts and preserves nonzero warnings', () => {
  expect(
    getCognitiveDomainScoreCardPresentation(validDomainScore)
      .abnormalSummaries,
  ).toEqual([]);
  expect(
    getCognitiveDomainScoreCardPresentation({
      ...validDomainScore,
      unscoredItemCount: 1,
      missingItemCount: 2,
      needsReviewItemCount: 3,
      excludedItemCount: 4,
    }).abnormalSummaries,
  ).toEqual(['未评分 1', '缺失 2', '待核对 3', '已排除 4']);
});

test('counts overlapping contributions as separate mapping records', () => {
  const contributions = [
    buildContribution(),
    buildContribution({
      domainCode: 'executive_function',
      domainTitle: '执行功能',
    }),
  ];

  expect(getCognitiveDomainContributionSummary(contributions)).toBe(
    '题目贡献明细（2 条映射记录）',
  );
  expect(
    contributions.map(getCognitiveDomainContributionPresentation),
  ).toHaveLength(2);
});

test('keeps contribution presentation clinical-facing and preserves alerts', () => {
  expect(getCognitiveDomainContributionPresentation(buildContribution())).toEqual(
    {
      itemLabel: '第 5 题 · 连续减法',
      domainLabel: '注意与计算',
      scoreText: '3 / 5',
      scoreNotices: [],
      contributionText: '计入本域：3 / 5',
      contributionNote: null,
    },
  );
  expect(
    getCognitiveDomainContributionPresentation(
      buildContribution({
        countsTowardDomain: false,
        isMissing: true,
        scoreStatus: 'needs_review',
      }),
    ),
  ).toMatchObject({
    scoreNotices: ['来源记录为缺失', '来源评分需核对'],
    contributionText: '不计入本域得分',
    contributionNote: '过程记录 / 已排除',
  });
});

test('compute keeps confirm=true and fails closed before fetch', async () => {
  const originalFetch = globalThis.fetch;
  let requestInit: RequestInit | undefined;
  let fetchCount = 0;
  globalThis.fetch = async (_input, init) => {
    fetchCount += 1;
    requestInit = init;
    return new Response(JSON.stringify({ alreadyComputed: false }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  };

  try {
    await computeCognitiveDomainResult('patient', 'visit', 'instance', {
      confirm: true,
    });
    expect(fetchCount).toBe(1);
    expect(requestInit?.method).toBe('POST');
    expect(JSON.parse(String(requestInit?.body))).toEqual({ confirm: true });

    await expect(
      computeCognitiveDomainResult('patient', 'visit', 'instance', {
        confirm: false,
      } as unknown as ComputeCognitiveDomainResultRequest),
    ).rejects.toBeInstanceOf(CognitiveDomainApiError);
    expect(fetchCount).toBe(1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
