import {
  cognitiveDomainMappingModeLabels,
  cognitiveDomainMappingSourceLabels,
  cognitiveDomainReviewStatusLabels,
  formatCognitiveDomainDate,
  getCognitiveDomainWarningMessage,
  isCognitiveDomainInterpretationSafe,
} from '@/src/features/assessments/lib/cognitive-domain-display';
import type { CognitiveDomainResultDetailResponse } from '@/src/features/assessments/types/cognitive-domain-result';

function displayOptional(value: string | number | undefined | null): string {
  return value === undefined || value === null || value === ''
    ? '—'
    : String(value);
}

export function CognitiveDomainMappingSummary({
  detail,
}: {
  detail: CognitiveDomainResultDetailResponse;
}) {
  const { cognitiveDomainResult: result, sourceScoreResult } = detail;
  const interpretationSafe = isCognitiveDomainInterpretationSafe(
    result.mapping.interpretation,
  );

  return (
    <section aria-labelledby="cognitive-domain-mapping-heading">
      <div className="mb-4">
        <h3
          className="text-2xl font-semibold text-[var(--cma-text-strong)]"
          id="cognitive-domain-mapping-heading"
        >
          映射与计算信息
        </h3>
        <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
          这些信息用于追溯服务端映射口径和计算版本，不是临床分级或诊断解释。
        </p>
      </div>

      {!interpretationSafe ? (
        <p
          className="mb-4 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-base leading-7 text-[var(--cma-warning)]"
          role="alert"
        >
          认知域映射解释信息异常。页面仍展示服务端技术性结果，但不扩展这些异常值，也不提供临床解释。
        </p>
      ) : null}

      {result.computation.warningCount > 0 ? (
        <div
          className="mb-4 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-base leading-7 text-[var(--cma-warning)]"
          role="alert"
        >
          <p className="font-semibold">认知域计算存在内部警告</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {result.computation.warningCodes.map((warningCode, index) => (
              <li key={`${index}-${warningCode}`}>
                {getCognitiveDomainWarningMessage(warningCode)}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            这些警告不是患者风险或诊断异常，本阶段不提供忽略、修复或重算能力。
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-[var(--cma-line)] p-4">
          <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
            映射口径
          </h4>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--cma-muted)]">mappingVersion</dt>
              <dd className="font-semibold text-[var(--cma-text-strong)]">
                {displayOptional(result.mapping.mappingVersion)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--cma-muted)]">mappingSource</dt>
              <dd className="font-semibold text-[var(--cma-text-strong)]">
                {cognitiveDomainMappingSourceLabels[result.mapping.mappingSource]}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--cma-muted)]">mappingMode</dt>
              <dd className="font-semibold text-[var(--cma-text-strong)]">
                {cognitiveDomainMappingModeLabels[result.mapping.mappingMode]}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--cma-muted)]">domainCodes</dt>
              <dd className="break-words font-semibold text-[var(--cma-text-strong)]">
                {result.mapping.domainCodes.length > 0
                  ? result.mapping.domainCodes.join('、')
                  : '—'}
              </dd>
            </div>
          </dl>
          <div className="mt-4 rounded-md bg-[var(--cma-surface-muted)] p-3 text-sm leading-6 text-[var(--cma-text-strong)]">
            <p>
              strategy：{result.mapping.policy.strategy}；weight：
              {result.mapping.policy.weight}
            </p>
            <p className="mt-1">
              deduplicatePerItem：
              {result.mapping.policy.deduplicatePerItem ? 'true' : 'false'}；
              overlappingDomains：
              {result.mapping.policy.overlappingDomains ? 'true' : 'false'}
            </p>
            <p className="mt-2 text-[var(--cma-muted)]">
              完整项目分值归入每个映射认知域；同一题目在同一认知域中只计一次；多认知域之间允许重叠。
            </p>
          </div>
        </div>

        <div className="rounded-md border border-[var(--cma-line)] p-4">
          <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
            映射解释
          </h4>
          {interpretationSafe ? (
            <dl className="mt-3 grid gap-3 text-sm">
              <div>
                <dt className="text-[var(--cma-muted)]">attribution</dt>
                <dd className="font-semibold text-[var(--cma-text-strong)]">
                  overlapping_full_item_scores（重叠完整分值归因）
                </dd>
              </div>
              <div>
                <dt className="text-[var(--cma-muted)]">
                  domainScoresAreScaleTotalPartition
                </dt>
                <dd className="font-semibold text-[var(--cma-text-strong)]">
                  false（各认知域不是量表总分的互斥拆分）
                </dd>
              </div>
              <div>
                <dt className="text-[var(--cma-muted)]">
                  scorePercentIsDiagnosticProbability
                </dt>
                <dd className="font-semibold text-[var(--cma-text-strong)]">
                  false（映射项目得分比例不是疾病概率）
                </dd>
              </div>
              <div>
                <dt className="text-[var(--cma-muted)]">
                  isDiagnosticConclusion
                </dt>
                <dd className="font-semibold text-[var(--cma-text-strong)]">
                  false（认知域结果不是诊断结论）
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[var(--cma-muted)]">
              服务端返回值不符合 A19 当前四项安全字面值，页面不将异常值原样扩展为新能力。
            </p>
          )}
        </div>
      </div>

      <details className="mt-4 rounded-md border border-[var(--cma-line)] p-4">
        <summary className="cursor-pointer font-semibold text-[var(--cma-text-strong)]">
          展开技术追溯信息
        </summary>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div>
            <h4 className="font-semibold text-[var(--cma-text-strong)]">
              计算摘要
            </h4>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-[var(--cma-muted)]">computedAt</dt><dd>{formatCognitiveDomainDate(result.computation.computedAt)}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">ruleSetCode</dt><dd>{displayOptional(result.computation.ruleSetCode)}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">ruleSetVersion</dt><dd>{displayOptional(result.computation.ruleSetVersion)}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">engineVersion</dt><dd>{displayOptional(result.computation.engineVersion)}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">inputItemCount</dt><dd>{result.computation.inputItemCount}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">contributionCount</dt><dd>{result.computation.contributionCount}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">domainCount</dt><dd>{result.computation.domainCount}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">includedContributionCount</dt><dd>{result.computation.includedContributionCount}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">excludedContributionCount</dt><dd>{result.computation.excludedContributionCount}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">warningCount</dt><dd>{result.computation.warningCount}</dd></div>
            </dl>
          </div>

          <div>
            <h4 className="font-semibold text-[var(--cma-text-strong)]">
              版本追溯
            </h4>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-[var(--cma-muted)]">scaleVersion</dt><dd>{displayOptional(result.versionTrace?.scaleVersion)}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">crfVersion</dt><dd>{displayOptional(result.versionTrace?.crfVersion)}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">scoringRuleVersion</dt><dd>{displayOptional(result.versionTrace?.scoringRuleVersion)}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">fieldEncodingVersion</dt><dd>{displayOptional(result.versionTrace?.fieldEncodingVersion)}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">domainMappingVersion</dt><dd>{displayOptional(result.versionTrace?.domainMappingVersion)}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">sourceDocument</dt><dd className="break-words">{displayOptional(result.versionTrace?.sourceDocument)}</dd></div>
            </dl>
          </div>

          <div>
            <h4 className="font-semibold text-[var(--cma-text-strong)]">
              来源评分安全摘要
            </h4>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-[var(--cma-muted)]">scoreResultCode</dt><dd>{displayOptional(sourceScoreResult.scoreResultCode)}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">runNo</dt><dd>{displayOptional(sourceScoreResult.runNo)}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">status</dt><dd>{displayOptional(sourceScoreResult.status)}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">confirmedAt</dt><dd>{formatCognitiveDomainDate(sourceScoreResult.confirmedAt)}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">updatedAt</dt><dd>{formatCognitiveDomainDate(sourceScoreResult.updatedAt)}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">来源结果内部 ID</dt><dd className="break-all">{sourceScoreResult.id}</dd></div>
            </dl>
          </div>

          <div>
            <h4 className="font-semibold text-[var(--cma-text-strong)]">
              认知域结果技术摘要
            </h4>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-[var(--cma-muted)]">domainResultCode</dt><dd>{result.domainResultCode}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">runNo</dt><dd>{result.runNo}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">reviewStatus</dt><dd>{cognitiveDomainReviewStatusLabels[result.review.reviewStatus]}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">createdAt</dt><dd>{formatCognitiveDomainDate(result.createdAt)}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">updatedAt</dt><dd>{formatCognitiveDomainDate(result.updatedAt)}</dd></div>
              <div><dt className="text-[var(--cma-muted)]">结果内部 ID</dt><dd className="break-all">{result.id}</dd></div>
            </dl>
          </div>
        </div>
      </details>
    </section>
  );
}
