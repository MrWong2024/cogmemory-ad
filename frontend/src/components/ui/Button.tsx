// frontend/src/components/ui/Button.tsx
import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/src/lib/class-names';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border-[var(--cma-primary)] bg-[var(--cma-primary)] text-white hover:bg-[var(--cma-primary-strong)]',
  secondary:
    'border-[var(--cma-line-strong)] bg-[var(--cma-surface)] text-[var(--cma-text-strong)] hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)]',
  ghost:
    'border-transparent bg-transparent text-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 py-1.5 text-sm',
  md: 'min-h-11 px-4 py-2 text-base',
  lg: 'min-h-12 px-5 py-2.5 text-lg',
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md border font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)] disabled:pointer-events-none disabled:opacity-55',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      type={type}
      {...props}
    />
  );
}
