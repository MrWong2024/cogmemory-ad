import { Button } from '@/src/components/ui/Button';
import {
  getScoreReviewReasonMessage,
  isScoreReviewReasonCode,
} from '@/src/features/assessments/lib/provisional-scoring-display';
import type { ScoreReviewQueueItem } from '@/src/features/assessments/types/provisional-scoring';

export function ScoreReviewQueue({
  canLocateItem,
  items,
  onLocateItem,
}: {
  canLocateItem: (itemResponseId: string) => boolean;
  items: ScoreReviewQueueItem[];
  onLocateItem: (itemResponseId: string) => void;
}) {
  return (
    <section aria-labelledby="score-review-queue-title" className="grid gap-4">
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="score-review-queue-title"
        >
          待人工复核清单（{items.length}）
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          清单内容和顺序直接来自服务端；“查看原题”仅用于只读核对。
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm leading-6 text-[var(--cma-muted)]">
          当前结果没有待人工复核项目。
        </p>
      ) : (
        <ul className="grid gap-3">
          {items.map((item, index) => {
            const itemResponseId = item.itemResponseId;
            const locatable =
              itemResponseId !== null && canLocateItem(itemResponseId);

            return (
              <li
                className="grid gap-3 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4"
                key={`${item.itemCode}:${item.itemResponseId ?? 'none'}:${index}`}
              >
                <div>
                  <p className="font-semibold text-[var(--cma-text-strong)]">
                    第 {item.itemOrder} 题 · {item.itemTitle || item.itemCode}
                  </p>
                  <p className="mt-1 break-words text-sm text-[var(--cma-muted)]">
                    题目编码：{item.itemCode}
                    {item.crfCode ? ` · CRF：${item.crfCode}` : ''}
                    {item.groupCode ? ` · 分组：${item.groupCode}` : ''}
                    {item.responseType ? ` · 作答类型：${item.responseType}` : ''}
                  </p>
                </div>
                <div className="text-sm leading-6 text-[var(--cma-warning)]">
                  {isScoreReviewReasonCode(item.reasonCode) ? (
                    <p>复核原因编码：{item.reasonCode}</p>
                  ) : null}
                  <p>{getScoreReviewReasonMessage(item.reasonCode)}</p>
                </div>
                {locatable && itemResponseId ? (
                  <div>
                    <Button
                      onClick={() => onLocateItem(itemResponseId)}
                      size="sm"
                      variant="secondary"
                    >
                      查看原题
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--cma-muted)]">
                    当前结果未提供可定位的题目记录。
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
