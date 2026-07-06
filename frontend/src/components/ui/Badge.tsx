// frontend/src/components/ui/Badge.tsx
import type { HTMLAttributes } from 'react';

import { cn } from '@/src/lib/class-names';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

const toneClasses: Record<BadgeTone, string> = {
  neutral:
    'border-[var(--cma-line)] bg-[var(--cma-surface-muted)] text-[var(--cma-muted)]',
  info: 'border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] text-[var(--cma-info)]',
  success:
    'border-[var(--cma-line-strong)] bg-[var(--cma-success-soft)] text-[var(--cma-success)]',
  warning:
    'border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] text-[var(--cma-warning)]',
};

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-md border px-2.5 py-1 text-sm font-semibold leading-none',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
