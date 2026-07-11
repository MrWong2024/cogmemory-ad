import { Badge } from '@/src/components/ui/Badge';
import {
  formatProvisionalScoreDate,
  formatProvisionalScoreNumber,
  getScoreReviewReasonMessage,
  isScoreReviewReasonCode,
  scoreItemSourceLabels,
  scoreItemStatusLabels,
} from '@/src/features/assessments/lib/provisional-scoring-display';
import type { ProvisionalScoreItem } from '@/src/features/assessments/types/provisional-scoring';
import { assessmentOperatorRoleLabels } from '@/src/features/assessments/lib/assessment-execution-display';
import { Button } from '@/src/components/ui/Button';

function sortItems(items: ProvisionalScoreItem[]): ProvisionalScoreItem[] {
  return [...items].sort(
    (left, right) =>
      left.itemOrder - right.itemOrder ||
      left.itemCode.localeCompare(right.itemCode),
  );
}

export function ProvisionalScoreItemList({
  canReviewItem,
  isFinal,
  items,
  onReviewItem,
}: {
  canReviewItem: (item: ProvisionalScoreItem) => boolean;
  isFinal: boolean;
  items: ProvisionalScoreItem[];
  onReviewItem: (itemResponseId: string) => void;
}) {
  return (
    <details className="rounded-md border border-[var(--cma-line)] p-4">
      <summary className="cursor-pointer text-lg font-semibold text-[var(--cma-text-strong)]">
        {isFinal ? '确认项目分值' : '题目级阶段性分值'}（{items.length}）
      </summary>
      <p className="mt-2 text-sm leading-6 text-[var(--cma-muted)]">
        题目分值和状态均来自服务端；本页不根据作答推导或修正。
      </p>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--cma-muted)]">
          服务端当前未返回题目得分。
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {sortItems(items).map((item) => (
            <li
              className="grid gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4"
              key={`${item.itemCode}:${item.itemOrder}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--cma-primary)]">
                    第 {item.itemOrder} 题
                  </p>
                  <h4 className="mt-1 font-semibold text-[var(--cma-text-strong)]">
                    {item.itemTitle || item.itemCode}
                  </h4>
                  <p className="mt-1 break-words text-sm text-[var(--cma-muted)]">
                    题目编码：{item.itemCode}
                    {item.crfCode ? ` · CRF：${item.crfCode}` : ''}
                    {item.groupCode ? ` · 分组：${item.groupCode}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={item.reviewRequired ? 'warning' : 'info'}>
                    {scoreItemStatusLabels[item.scoreStatus] ?? '未知状态'}
                  </Badge>
                  {item.isMissing ? <Badge tone="warning">缺失记录</Badge> : null}
                </div>
              </div>

              <p className="text-lg font-semibold text-[var(--cma-text-strong)]">
                {!item.countsTowardTotal
                  ? '过程记录，不计入总分'
                  : item.provisionalScoreValue !== null
                    ? `${isFinal ? '确认项目分值' : '阶段性题目分值'}：${formatProvisionalScoreNumber(item.provisionalScoreValue)}`
                    : item.reviewRequired
                      ? '待人工复核'
                      : '当前尚未评分'}
              </p>

              <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-[var(--cma-muted)]">作答类型</dt>
                  <dd>{item.responseType || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">计入总分配置</dt>
                  <dd>{item.countsTowardTotal ? '是' : '否'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">本次纳入汇总</dt>
                  <dd>{item.includedInTotal ? '是' : '否'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">评分来源</dt>
                  <dd>{scoreItemSourceLabels[item.scoreSource] ?? '未知状态'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">缺失记录</dt>
                  <dd>{item.isMissing ? '是' : '否'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">需要人工复核</dt>
                  <dd>{item.reviewRequired ? '是' : '否'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--cma-muted)]">分值范围</dt>
                  <dd>
                    {formatProvisionalScoreNumber(item.minScore)} 至{' '}
                    {formatProvisionalScoreNumber(item.maxScore)}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[var(--cma-muted)]">认知域编码</dt>
                  <dd>
                    {item.cognitiveDomainCodes.length > 0
                      ? item.cognitiveDomainCodes.join('、')
                      : '—'}
                  </dd>
                </div>
              </dl>

              {item.reviewRequired ? (
                <div className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-3 text-sm leading-6 text-[var(--cma-warning)]">
                  {isScoreReviewReasonCode(item.reviewReasonCode) ? (
                    <p>复核原因编码：{item.reviewReasonCode}</p>
                  ) : null}
                  <p>{getScoreReviewReasonMessage(item.reviewReasonCode)}</p>
                </div>
              ) : null}

              {item.scoreStatus === 'auto_scored' ? (
                <p className="text-sm leading-6 text-[var(--cma-muted)]">
                  规则自动计算，不允许人工覆盖。
                </p>
              ) : null}

              {item.scoreStatus === 'not_scored' ? (
                <p className="text-sm leading-6 text-[var(--cma-muted)]">
                  过程记录，不计分，不允许人工评分。
                </p>
              ) : null}

              {item.manualReview ? (
                <div className="grid gap-1 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-3 text-sm leading-6">
                  <p className="font-semibold text-[var(--cma-text-strong)]">
                    最新人工评分摘要
                  </p>
                  <p>
                    操作者：{item.manualReview.reviewer.operatorName || '未提供'}
                    {item.manualReview.reviewer.operatorRole
                      ? `（${assessmentOperatorRoleLabels[item.manualReview.reviewer.operatorRole]}）`
                      : ''}
                  </p>
                  <p>
                    时间：{formatProvisionalScoreDate(item.manualReview.reviewedAt)}
                  </p>
                  <p className="whitespace-pre-wrap break-words">
                    评分依据：{item.manualReview.reviewNote}
                  </p>
                </div>
              ) : null}

              {item.itemResponseId && canReviewItem(item) ? (
                <div>
                  <Button
                    onClick={() => onReviewItem(item.itemResponseId!)}
                    size="sm"
                    variant="secondary"
                  >
                    {item.scoreStatus === 'manual_scored'
                      ? '修订人工评分'
                      : '人工评分'}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
