import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import { getCognitiveDomainScoreCardPresentation } from '@/src/features/assessments/lib/cognitive-domain-display';
import type { CognitiveDomainScore } from '@/src/features/assessments/types/cognitive-domain-result';

export function CognitiveDomainScoreList({
  scores,
}: {
  scores: CognitiveDomainScore[];
}) {
  return (
    <section
      aria-labelledby="cognitive-domain-score-heading"
      className="min-w-0 max-w-full"
    >
      <div className="mb-4">
        <h3
          className="text-2xl font-semibold text-[var(--cma-text-strong)]"
          id="cognitive-domain-score-heading"
        >
          认知域映射得分
        </h3>
        <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
          以下结果反映本量表项目映射到各认知域后的得分情况，不等同于独立认知功能测验结果。
        </p>
      </div>

      {scores.length > 0 ? (
        <div className="grid min-w-0 max-w-full gap-4 xl:grid-cols-2 [&>*]:min-w-0">
          {scores.map((score) => {
            const presentation = getCognitiveDomainScoreCardPresentation(score);

            return (
              <Card key={score.domainCode}>
                <CardHeader className="border-b border-[var(--cma-line)]">
                  <CardTitle>{presentation.title}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-5 pt-5">
                  <div>
                    <p className="text-sm font-semibold text-[var(--cma-muted)]">
                      本量表映射得分
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-[var(--cma-text-strong)]">
                      {presentation.scoreText}
                    </p>
                    {presentation.rangeText ? (
                      <p className="mt-2 text-sm leading-6 text-[var(--cma-muted)]">
                        映射分值范围：{presentation.rangeText}
                      </p>
                    ) : null}
                    {presentation.percentText ? (
                      <p className="mt-2 text-base text-[var(--cma-text-strong)]">
                        本量表映射得分比例：{presentation.percentText}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--cma-text-strong)]">
                    <span>{presentation.itemSummary}</span>
                    <span>{presentation.scoredSummary}</span>
                  </div>

                  {presentation.abnormalSummaries.length > 0 ? (
                    <div
                      className="flex flex-wrap gap-2 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-3 text-sm font-semibold text-[var(--cma-warning)]"
                      role="status"
                    >
                      {presentation.abnormalSummaries.map((summary) => (
                        <span key={summary}>{summary}</span>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <p className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-5 text-base text-[var(--cma-muted)]">
          当前没有可展示的认知域映射得分记录。
        </p>
      )}
    </section>
  );
}
