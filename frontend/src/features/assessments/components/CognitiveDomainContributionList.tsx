import { Button } from '@/src/components/ui/Button';
import {
  getCognitiveDomainContributionPresentation,
  getCognitiveDomainContributionSummary,
} from '@/src/features/assessments/lib/cognitive-domain-display';
import type { CognitiveDomainItemContribution } from '@/src/features/assessments/types/cognitive-domain-result';

export function CognitiveDomainContributionList({
  contributions,
  canLocateItem,
  onLocateItem,
}: {
  contributions: CognitiveDomainItemContribution[];
  canLocateItem: (itemResponseId: string) => boolean;
  onLocateItem: (itemResponseId: string) => void;
}) {
  return (
    <details className="min-w-0 max-w-full rounded-md border border-[var(--cma-line)] p-4">
      <summary
        className="cursor-pointer text-lg font-semibold text-[var(--cma-text-strong)]"
        id="cognitive-domain-contribution-heading"
      >
        {getCognitiveDomainContributionSummary(contributions)}
      </summary>
      <p className="mt-3 text-base leading-7 text-[var(--cma-muted)]">
        展开后可按服务端记录追踪题目、映射认知域、题目得分与本域贡献；同一题目映射多个认知域时保留多条记录。
      </p>

      {contributions.length > 0 ? (
        <div className="mt-4 min-w-0 max-w-full overflow-x-auto rounded-md border border-[var(--cma-line)]">
          <table className="min-w-[920px] border-collapse text-left text-sm">
            <thead className="bg-[var(--cma-surface-muted)] text-[var(--cma-text-strong)]">
              <tr>
                <th className="px-4 py-3" scope="col">
                  题目
                </th>
                <th className="px-4 py-3" scope="col">
                  映射认知域
                </th>
                <th className="px-4 py-3" scope="col">
                  题目得分
                </th>
                <th className="px-4 py-3" scope="col">
                  本域贡献
                </th>
                <th className="px-4 py-3" scope="col">
                  原题核对
                </th>
              </tr>
            </thead>
            <tbody>
              {contributions.map((contribution, index) => {
                const itemResponseId = contribution.itemResponseId;
                const canLocate =
                  itemResponseId !== null && canLocateItem(itemResponseId);
                const presentation =
                  getCognitiveDomainContributionPresentation(contribution);

                return (
                  <tr
                    className="border-t border-[var(--cma-line)] align-top"
                    key={`${contribution.itemResponseId ?? 'none'}-${contribution.itemCode}-${contribution.domainCode}-${index}`}
                  >
                    <td className="px-4 py-4">
                      <p className="font-semibold text-[var(--cma-text-strong)]">
                        {presentation.itemLabel}
                      </p>
                    </td>
                    <td className="px-4 py-4 font-semibold text-[var(--cma-text-strong)]">
                      {presentation.domainLabel}
                    </td>
                    <td className="px-4 py-4 text-[var(--cma-text-strong)]">
                      <p>{presentation.scoreText}</p>
                      {presentation.scoreNotices.map((notice) => (
                        <p
                          className="mt-1 font-semibold text-[var(--cma-warning)]"
                          key={notice}
                        >
                          {notice}
                        </p>
                      ))}
                    </td>
                    <td className="px-4 py-4 text-[var(--cma-text-strong)]">
                      <p>{presentation.contributionText}</p>
                      {presentation.contributionNote ? (
                        <p className="mt-1 text-[var(--cma-muted)]">
                          {presentation.contributionNote}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      {canLocate && itemResponseId ? (
                        <Button
                          onClick={() => onLocateItem(itemResponseId)}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          查看原题
                        </Button>
                      ) : (
                        <p className="max-w-52 text-[var(--cma-muted)]">
                          当前无法定位原题。
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-md bg-[var(--cma-surface-muted)] p-4 text-base text-[var(--cma-muted)]">
          当前没有可展示的题目贡献记录。
        </p>
      )}
    </details>
  );
}
