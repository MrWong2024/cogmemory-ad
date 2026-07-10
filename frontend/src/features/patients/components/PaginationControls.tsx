import { Button } from '@/src/components/ui/Button';

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  total: number;
  isLoading?: boolean;
  onPageChange: (page: number) => void;
};

export function PaginationControls({
  page,
  pageSize,
  total,
  isLoading = false,
  onPageChange,
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--cma-line)] px-5 py-4">
      <p className="text-base text-[var(--cma-muted)]">
        共 {total} 条，第 {page} / {totalPages} 页
      </p>
      <div className="flex gap-3">
        <Button
          disabled={isLoading || page <= 1}
          onClick={() => onPageChange(page - 1)}
          size="sm"
          variant="secondary"
        >
          上一页
        </Button>
        <Button
          disabled={isLoading || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          size="sm"
          variant="secondary"
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
