import { Button } from '@/src/components/ui/Button';
import {
  cognitiveDomainItemScoreStatusLabels,
  formatCognitiveDomainNumber,
  getCognitiveDomainScoreSourceLabel,
  getCognitiveDomainTitle,
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
  const sortedContributions = [...contributions].sort(
    (left, right) =>
      left.itemOrder - right.itemOrder ||
      left.itemCode.localeCompare(right.itemCode) ||
      left.domainCode.localeCompare(right.domainCode),
  );

  return (
    <section aria-labelledby="cognitive-domain-contribution-heading">
      <div className="mb-4">
        <h3
          className="text-2xl font-semibold text-[var(--cma-text-strong)]"
          id="cognitive-domain-contribution-heading"
        >
          题目贡献记录
        </h3>
        <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
          同一题目映射多个认知域时会保留多条合法记录；每条记录都明确显示目标认知域。
        </p>
      </div>

      {sortedContributions.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-[var(--cma-line)]">
          <table className="min-w-[1180px] border-collapse text-left text-sm">
            <thead className="bg-[var(--cma-surface-muted)] text-[var(--cma-text-strong)]">
              <tr>
                <th className="px-4 py-3" scope="col">
                  题目
                </th>
                <th className="px-4 py-3" scope="col">
                  目标认知域
                </th>
                <th className="px-4 py-3" scope="col">
                  归因
                </th>
                <th className="px-4 py-3" scope="col">
                  分值
                </th>
                <th className="px-4 py-3" scope="col">
                  映射技术值
                </th>
                <th className="px-4 py-3" scope="col">
                  来源状态
                </th>
                <th className="px-4 py-3" scope="col">
                  原题核对
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedContributions.map((contribution, index) => {
                const itemResponseId = contribution.itemResponseId;
                const canLocate =
                  itemResponseId !== null && canLocateItem(itemResponseId);
                return (
                  <tr
                    className="border-t border-[var(--cma-line)] align-top"
                    key={`${contribution.itemResponseId ?? 'none'}-${contribution.itemCode}-${contribution.domainCode}-${index}`}
                  >
                    <td className="px-4 py-4">
                      <p className="font-semibold text-[var(--cma-text-strong)]">
                        第 {contribution.itemOrder} 题 ·{' '}
                        {contribution.itemTitle || contribution.itemCode}
                      </p>
                      <p className="mt-1 text-[var(--cma-muted)]">
                        itemCode：{contribution.itemCode}
                      </p>
                      <p className="mt-1 text-[var(--cma-muted)]">
                        CRF：{contribution.crfCode || '—'} · groupCode：
                        {contribution.groupCode || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-[var(--cma-text-strong)]">
                        {getCognitiveDomainTitle(
                          contribution.domainCode,
                          contribution.domainTitle,
                        )}
                      </p>
                      <p className="mt-1 text-[var(--cma-muted)]">
                        {contribution.domainCode}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-[var(--cma-text-strong)]">
                      {contribution.countsTowardDomain
                        ? '计入本认知域'
                        : '过程记录 / 已排除，不计入本认知域得分'}
                      {contribution.isMissing ? (
                        <p className="mt-2 text-[var(--cma-muted)]">
                          来源项目记录为缺失
                        </p>
                      ) : (
                        <p className="mt-2 text-[var(--cma-muted)]">
                          来源项目未标记缺失
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-[var(--cma-text-strong)]">
                      <p>
                        得分：
                        {contribution.scoreValue === null
                          ? '当前无可用分值'
                          : formatCognitiveDomainNumber(
                              contribution.scoreValue,
                            )}
                      </p>
                      <p className="mt-1">
                        满分：
                        {formatCognitiveDomainNumber(contribution.maxScore)}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-[var(--cma-muted)]">
                      <p>weight：{formatCognitiveDomainNumber(contribution.weight)}</p>
                      <p className="mt-1">
                        weightedScore：
                        {formatCognitiveDomainNumber(
                          contribution.weightedScore,
                        )}
                      </p>
                      <p className="mt-1">
                        weightedMaxScore：
                        {formatCognitiveDomainNumber(
                          contribution.weightedMaxScore,
                        )}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-[var(--cma-text-strong)]">
                      <p>
                        {
                          cognitiveDomainItemScoreStatusLabels[
                            contribution.scoreStatus
                          ]
                        }
                      </p>
                      <p className="mt-1 text-[var(--cma-muted)]">
                        {getCognitiveDomainScoreSourceLabel(
                          contribution.scoreSource,
                        )}
                      </p>
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
                          当前贡献记录未提供可定位的原题。
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
        <p className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-5 text-base text-[var(--cma-muted)]">
          服务端当前未返回题目贡献记录。
        </p>
      )}
    </section>
  );
}
