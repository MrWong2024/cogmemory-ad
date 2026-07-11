import { Badge } from '@/src/components/ui/Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import {
  formatCognitiveDomainNumber,
  formatCognitiveDomainPercent,
  getCognitiveDomainTitle,
} from '@/src/features/assessments/lib/cognitive-domain-display';
import type { CognitiveDomainScore } from '@/src/features/assessments/types/cognitive-domain-result';

export function CognitiveDomainScoreList({
  scores,
}: {
  scores: CognitiveDomainScore[];
}) {
  const sortedScores = [...scores].sort((left, right) =>
    left.domainCode.localeCompare(right.domainCode),
  );

  return (
    <section aria-labelledby="cognitive-domain-score-heading">
      <div className="mb-4">
        <h3
          className="text-2xl font-semibold text-[var(--cma-text-strong)]"
          id="cognitive-domain-score-heading"
        >
          认知域得分总览
        </h3>
        <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
          按认知域编码升序展示服务端结果，不按得分高低排名，也不生成跨域总分。
        </p>
      </div>

      {sortedScores.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {sortedScores.map((score) => (
            <Card key={score.domainCode}>
              <CardHeader className="border-b border-[var(--cma-line)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      {getCognitiveDomainTitle(
                        score.domainCode,
                        score.domainTitle,
                      )}
                    </CardTitle>
                    <CardDescription>
                      domainCode：{score.domainCode}
                    </CardDescription>
                  </div>
                  <Badge tone="info">服务端认知域结果</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5 pt-5">
                <div>
                  <p className="text-sm font-semibold text-[var(--cma-muted)]">
                    认知域得分
                  </p>
                  {score.scoreValue === null ? (
                    <p className="mt-1 text-lg font-semibold text-[var(--cma-text-strong)]">
                      当前无可用认知域得分
                    </p>
                  ) : (
                    <p className="mt-1 text-2xl font-semibold text-[var(--cma-text-strong)]">
                      {formatCognitiveDomainNumber(score.scoreValue)}
                    </p>
                  )}
                  <p className="mt-2 text-sm leading-6 text-[var(--cma-muted)]">
                    服务端范围：{formatCognitiveDomainNumber(score.minScore)}–
                    {formatCognitiveDomainNumber(score.maxScore)}
                  </p>
                  {score.scorePercent !== null ? (
                    <p className="mt-2 text-base text-[var(--cma-text-strong)]">
                      映射项目得分比例：
                      {formatCognitiveDomainPercent(score.scorePercent)}
                    </p>
                  ) : null}
                </div>

                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-sm text-[var(--cma-muted)]">项目数</dt>
                    <dd className="font-semibold text-[var(--cma-text-strong)]">
                      {score.itemCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-[var(--cma-muted)]">已评分</dt>
                    <dd className="font-semibold text-[var(--cma-text-strong)]">
                      {score.scoredItemCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-[var(--cma-muted)]">未评分</dt>
                    <dd className="font-semibold text-[var(--cma-text-strong)]">
                      {score.unscoredItemCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-[var(--cma-muted)]">缺失</dt>
                    <dd className="font-semibold text-[var(--cma-text-strong)]">
                      {score.missingItemCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-[var(--cma-muted)]">待复核</dt>
                    <dd className="font-semibold text-[var(--cma-text-strong)]">
                      {score.needsReviewItemCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-[var(--cma-muted)]">已排除</dt>
                    <dd className="font-semibold text-[var(--cma-text-strong)]">
                      {score.excludedItemCount}
                    </dd>
                  </div>
                </dl>

                <div className="rounded-md bg-[var(--cma-surface-muted)] p-3 text-sm leading-6 text-[var(--cma-muted)]">
                  映射技术值：weightedScore ={' '}
                  {formatCognitiveDomainNumber(score.weightedScore)}；
                  weightedMaxScore ={' '}
                  {formatCognitiveDomainNumber(score.weightedMaxScore)}。这些值直接来自服务端，前端未重新计算。
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-5 text-base text-[var(--cma-muted)]">
          服务端当前未返回认知域得分记录。
        </p>
      )}
    </section>
  );
}
