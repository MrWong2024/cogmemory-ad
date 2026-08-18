import {
  buildScaleSubmissionIssueDetails,
  getScaleSubmissionIssueDisplay,
} from '@/src/features/assessments/lib/scale-instance-submission-display';
import type { ScaleSubmissionIssue } from '@/src/features/assessments/types/scale-instance-submission';

export type InlineActionableIssuePresentation = {
  key: string;
  title: string;
  description: string;
  details: string[];
  sourceIssues: ScaleSubmissionIssue[];
};

const COMMON_INCOMPLETE_CODES = new Set([
  'ITEM_ANSWER_CONTENT_MISSING',
  'ITEM_NOT_COMPLETED',
]);

function buildDetails(issues: readonly ScaleSubmissionIssue[]): string[] {
  return [
    ...new Set(
      issues.flatMap((issue) =>
        buildScaleSubmissionIssueDetails(issue, {
          includeItemIdentity: false,
        }),
      ),
    ),
  ];
}

function toPresentation(
  issues: readonly ScaleSubmissionIssue[],
  title: string,
  description: string,
): InlineActionableIssuePresentation {
  return {
    key: issues
      .map((issue) => `${issue.code}:${issue.itemResponseId ?? 'item'}`)
      .join('|'),
    title,
    description,
    details: buildDetails(issues),
    sourceIssues: issues.map((issue) => ({ ...issue })),
  };
}

function toDefaultPresentation(
  issue: ScaleSubmissionIssue,
): InlineActionableIssuePresentation {
  const display = getScaleSubmissionIssueDisplay(issue.code);
  return toPresentation([issue], display.title, display.description);
}

export function buildInlineActionableIssuePresentations(
  issues: readonly ScaleSubmissionIssue[],
): InlineActionableIssuePresentation[] {
  const remaining = [...issues];
  const presentations: InlineActionableIssuePresentation[] = [];

  function extract(codes: ReadonlySet<string>): ScaleSubmissionIssue[] {
    const extracted: ScaleSubmissionIssue[] = [];

    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const issue = remaining[index];
      if (issue && codes.has(issue.code)) {
        extracted.unshift(issue);
        remaining.splice(index, 1);
      }
    }

    return extracted;
  }

  if (
    remaining.some(
      (issue) => issue.code === 'ITEM_STRUCTURED_SUBITEMS_INCOMPLETE',
    )
  ) {
    const grouped = extract(
      new Set([
        'ITEM_STRUCTURED_SUBITEMS_INCOMPLETE',
        ...COMMON_INCOMPLETE_CODES,
      ]),
    );
    presentations.push(
      toPresentation(
        grouped,
        '本题结构化复核尚未完成',
        '请补齐各子项的患者实际回答和正确性确认，然后标记本题完成。',
      ),
    );
  }

  if (
    remaining.some(
      (issue) => issue.code === 'ITEM_BINARY_MANUAL_DECISION_INCOMPLETE',
    )
  ) {
    const grouped = extract(
      new Set([
        'ITEM_BINARY_MANUAL_DECISION_INCOMPLETE',
        ...COMMON_INCOMPLETE_CODES,
      ]),
    );
    presentations.push(
      toPresentation(
        grouped,
        '本题人工评分判断尚未完成',
        '请补充本题原始回答或观察，确认是否符合评分标准，然后标记本题完成。',
      ),
    );
  }

  if (
    COMMON_INCOMPLETE_CODES.size ===
    [...COMMON_INCOMPLETE_CODES].filter((code) =>
      remaining.some((issue) => issue.code === code),
    ).length
  ) {
    const grouped = extract(COMMON_INCOMPLETE_CODES);
    presentations.push(
      toPresentation(
        grouped,
        '本题尚未完成',
        '请补充有效作答内容并标记本题完成。',
      ),
    );
  }

  return [
    ...presentations,
    ...remaining.map((issue) => toDefaultPresentation(issue)),
  ];
}
