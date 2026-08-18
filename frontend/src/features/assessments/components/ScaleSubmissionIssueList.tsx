import { Button } from '@/src/components/ui/Button';
import {
  buildScaleSubmissionIssueDetails,
  getScaleSubmissionIssueDisplay,
  scaleSubmissionSeverityLabels,
} from '@/src/features/assessments/lib/scale-instance-submission-display';
import { buildInlineActionableIssuePresentations } from '@/src/features/assessments/lib/scale-submission-inline-presentation';
import type {
  ScaleSubmissionIssue,
  ScaleSubmissionIssueSeverity,
} from '@/src/features/assessments/types/scale-instance-submission';

export function ScaleSubmissionIssueList({
  compact = false,
  inlineActionable = false,
  issues,
  onLocateIssue,
  severity,
  showLocateActions = true,
  suppressItemIdentity = false,
}: {
  compact?: boolean;
  inlineActionable?: boolean;
  issues: ScaleSubmissionIssue[];
  onLocateIssue: (issue: ScaleSubmissionIssue) => void;
  severity: ScaleSubmissionIssueSeverity;
  showLocateActions?: boolean;
  suppressItemIdentity?: boolean;
}) {
  if (issues.length === 0) {
    return (
      <p className="text-sm leading-6 text-[var(--cma-muted)]">
        当前没有{scaleSubmissionSeverityLabels[severity]}。
      </p>
    );
  }

  const presentations = inlineActionable
    ? buildInlineActionableIssuePresentations(issues)
    : issues.map((issue, index) => {
        const display = getScaleSubmissionIssueDisplay(issue.code);
        return {
          key: `${issue.code}:${issue.itemResponseId ?? 'scale'}:${index}`,
          title: display.title,
          description: display.description,
          details: buildScaleSubmissionIssueDetails(issue, {
            includeItemIdentity: !suppressItemIdentity,
          }),
          sourceIssues: [issue],
        };
      });

  return (
    <ul className={compact ? 'grid gap-1.5' : 'grid gap-3'}>
      {presentations.map((presentation) => {
        const issue = presentation.sourceIssues[0];

        if (!issue) {
          return null;
        }

        return (
          <li
            className={
              compact
                ? severity === 'blocking'
                  ? 'grid gap-1 border-l-2 border-[var(--cma-danger)] py-1 pl-3 pr-1'
                  : 'grid gap-1 border-l-2 border-[var(--cma-warning)] py-1 pl-3 pr-1'
                : severity === 'blocking'
                  ? 'grid gap-3 rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4'
                  : 'grid gap-3 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4'
            }
            key={presentation.key}
          >
            <div>
              <p
                className={
                  severity === 'blocking'
                    ? 'font-semibold text-[var(--cma-danger)]'
                    : 'font-semibold text-[var(--cma-warning)]'
                }
              >
                {presentation.title}
              </p>
              <p
                className={
                  compact
                    ? 'mt-0.5 text-sm leading-5 text-[var(--cma-text-strong)]'
                    : 'mt-1 text-sm leading-6 text-[var(--cma-text-strong)]'
                }
              >
                {presentation.description}
              </p>
            </div>
            {presentation.details.length > 0 ? (
              <ul
                className={
                  severity === 'blocking'
                    ? compact
                      ? 'grid gap-0.5 text-xs leading-5 text-[var(--cma-text-strong)]'
                      : 'grid gap-1 text-sm leading-6 text-[var(--cma-text-strong)]'
                    : compact
                      ? 'grid gap-0.5 text-xs leading-5 text-[var(--cma-warning)]'
                      : 'grid gap-1 text-sm leading-6 text-[var(--cma-warning)]'
                }
              >
                {presentation.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
            {showLocateActions &&
            issue.scope === 'item' &&
            issue.itemResponseId ? (
              <div>
                <Button
                  onClick={() => onLocateIssue(issue)}
                  size="sm"
                  variant="secondary"
                >
                  定位题目
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
