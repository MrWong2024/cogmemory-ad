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
  cognitiveDomainNonDiagnosticStatements,
  cognitiveDomainResultStatusBadgeLabels,
  cognitiveDomainResultStatusLabels,
} from '@/src/features/assessments/lib/cognitive-domain-display';
import type { ComputeCognitiveDomainResultRequest } from '@/src/features/assessments/types/cognitive-domain-result';

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

test('keeps the two core clinical safety boundaries', () => {
  expect(cognitiveDomainNonDiagnosticStatements).toHaveLength(2);
  const safetyCopy = cognitiveDomainNonDiagnosticStatements.join(' ');
  expect(safetyCopy).toContain('单独形成诊断结论');
  expect(safetyCopy).toContain('认知域之间可能存在重叠');
  expect(safetyCopy).toContain('不可相加');
  expect(safetyCopy).toContain('疾病概率');
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
