import type { ItemResponseExecution } from '@/src/features/assessments/types/item-response-execution';
import type {
  ScaleSubmissionIssue,
  ScaleSubmissionReadinessResponse,
} from '@/src/features/assessments/types/scale-instance-submission';

export type RoutedScaleSubmissionItemIssues = {
  blockingIssues: ScaleSubmissionIssue[];
  warnings: ScaleSubmissionIssue[];
};

export type ScaleSubmissionIssueRouting = {
  inlineByItemResponseId: ReadonlyMap<
    string,
    RoutedScaleSubmissionItemIssues
  >;
  globalBlockingIssues: ScaleSubmissionIssue[];
  globalWarnings: ScaleSubmissionIssue[];
};

type FormalItemIdentity = Pick<ItemResponseExecution, 'id' | 'itemCode'>;

function buildUniqueItemCodeIndex(
  items: readonly FormalItemIdentity[],
): ReadonlyMap<string, string> {
  const itemResponseIdsByCode = new Map<string, string | null>();

  items.forEach((item) => {
    if (!itemResponseIdsByCode.has(item.itemCode)) {
      itemResponseIdsByCode.set(item.itemCode, item.id);
      return;
    }

    itemResponseIdsByCode.set(item.itemCode, null);
  });

  return new Map(
    [...itemResponseIdsByCode.entries()].flatMap(([itemCode, itemResponseId]) =>
      itemResponseId ? [[itemCode, itemResponseId] as const] : [],
    ),
  );
}

export function routeScaleSubmissionIssues(
  readiness: Pick<
    ScaleSubmissionReadinessResponse,
    'blockingIssues' | 'warnings'
  >,
  formalItems: readonly FormalItemIdentity[],
): ScaleSubmissionIssueRouting {
  const formalItemIds = new Set(formalItems.map((item) => item.id));
  const uniqueItemCodeIndex = buildUniqueItemCodeIndex(formalItems);
  const inlineByItemResponseId = new Map<
    string,
    RoutedScaleSubmissionItemIssues
  >();
  const globalBlockingIssues: ScaleSubmissionIssue[] = [];
  const globalWarnings: ScaleSubmissionIssue[] = [];

  formalItems.forEach((item) => {
    inlineByItemResponseId.set(item.id, {
      blockingIssues: [],
      warnings: [],
    });
  });

  function routeIssue(
    issue: ScaleSubmissionIssue,
    severity: 'blocking' | 'warning',
  ) {
    const itemResponseId =
      issue.scope === 'item'
        ? issue.itemResponseId
          ? formalItemIds.has(issue.itemResponseId)
            ? issue.itemResponseId
            : null
          : issue.itemCode
            ? (uniqueItemCodeIndex.get(issue.itemCode) ?? null)
            : null
        : null;

    if (itemResponseId) {
      const routed = inlineByItemResponseId.get(itemResponseId);
      if (routed) {
        if (severity === 'blocking') {
          routed.blockingIssues.push(issue);
        } else {
          routed.warnings.push(issue);
        }
        return;
      }
    }

    if (severity === 'blocking') {
      globalBlockingIssues.push(issue);
    } else {
      globalWarnings.push(issue);
    }
  }

  readiness.blockingIssues.forEach((issue) => routeIssue(issue, 'blocking'));
  readiness.warnings.forEach((issue) => routeIssue(issue, 'warning'));

  return {
    inlineByItemResponseId,
    globalBlockingIssues,
    globalWarnings,
  };
}

export function getInlineSubmissionIssueSnapshotLabel(
  readinessStale: boolean,
): string {
  return readinessStale
    ? '上次提交检查结果（已过期）'
    : '最新提交检查结果';
}
