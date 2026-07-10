import {
  isItemResponseProgressComplete,
  type ScaleExecutionGroupSection,
} from '@/src/features/assessments/lib/assessment-execution-display';

export function ScaleExecutionGroupNavigation({
  activeGroupCode,
  onSelectGroup,
  sections,
}: {
  activeGroupCode: string;
  onSelectGroup: (groupCode: string) => void;
  sections: ScaleExecutionGroupSection[];
}) {
  return (
    <nav aria-label="量表分组导航">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => {
          const completedCount = section.itemResponses.filter((item) =>
            isItemResponseProgressComplete(item.status),
          ).length;
          const isActive = section.code === activeGroupCode;

          return (
            <li key={section.code}>
              <button
                aria-current={isActive ? 'page' : undefined}
                className={
                  isActive
                    ? 'min-h-16 w-full rounded-md border border-[var(--cma-primary)] bg-[var(--cma-primary-soft)] px-4 py-3 text-left text-[var(--cma-text-strong)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--cma-ring)]'
                    : 'min-h-16 w-full rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-4 py-3 text-left text-[var(--cma-text-strong)] outline-none transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:ring-2 focus-visible:ring-[var(--cma-ring)]'
                }
                onClick={() => onSelectGroup(section.code)}
                type="button"
              >
                <span className="block text-base font-semibold">
                  {section.title}
                </span>
                <span className="mt-1 block text-sm text-[var(--cma-muted)]">
                  已完成 {completedCount} / {section.itemResponses.length} 题
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
