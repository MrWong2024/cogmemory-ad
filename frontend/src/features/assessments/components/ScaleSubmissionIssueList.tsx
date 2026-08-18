import { Button } from '@/src/components/ui/Button';
import {
  buildScaleSubmissionIssueDetails,
  getScaleSubmissionIssueDisplay,
  scaleSubmissionSeverityLabels,
} from '@/src/features/assessments/lib/scale-instance-submission-display';
import type {
  ScaleSubmissionIssue,
  ScaleSubmissionIssueSeverity,
} from '@/src/features/assessments/types/scale-instance-submission';

export function ScaleSubmissionIssueList({
  issues,
  onLocateIssue,
  severity,
  showLocateActions = true,
}: {
  issues: ScaleSubmissionIssue[];
  onLocateIssue: (issue: ScaleSubmissionIssue) => void;
  severity: ScaleSubmissionIssueSeverity;
  showLocateActions?: boolean;
}) {
  if (issues.length === 0) {
    return (
      <p className="text-sm leading-6 text-[var(--cma-muted)]">
        当前没有{scaleSubmissionSeverityLabels[severity]}。
      </p>
    );
  }

  return (
    <ul className="grid gap-3">
      {issues.map((issue, index) => {
        const display = getScaleSubmissionIssueDisplay(issue.code);
        const details = buildScaleSubmissionIssueDetails(issue);

        return (
          <li
            className={
              severity === 'blocking'
                ? 'grid gap-3 rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4'
                : 'grid gap-3 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4'
            }
            key={`${issue.code}:${issue.itemResponseId ?? 'scale'}:${index}`}
          >
            <div>
              <p
                className={
                  severity === 'blocking'
                    ? 'font-semibold text-[var(--cma-danger)]'
                    : 'font-semibold text-[var(--cma-warning)]'
                }
              >
                {display.title}
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--cma-text-strong)]">
                {display.description}
              </p>
            </div>
            {details.length > 0 ? (
              <ul
                className={
                  severity === 'blocking'
                    ? 'grid gap-1 text-sm leading-6 text-[var(--cma-text-strong)]'
                    : 'grid gap-1 text-sm leading-6 text-[var(--cma-warning)]'
                }
              >
                {details.map((detail) => (
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
