import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'dark';
export type ButtonSize = 'sm' | 'md';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-action text-on-action hover:bg-action-hover disabled:bg-action-disabled',
  secondary: 'bg-canvas text-ink border border-line hover:bg-canvas-muted disabled:text-ink-muted',
  danger: 'bg-danger-solid text-white hover:bg-danger-solid-hover disabled:bg-danger-50 disabled:text-danger-600',
  ghost: 'bg-transparent text-ink hover:bg-canvas-muted disabled:text-ink-muted',
  // Kept as an alias of `primary`: ERP Shell v2 (owner-approved 2026-09-27)
  // made Charcoal/Slate the single primary action colour everywhere, so the
  // separate slate variant introduced for UI-UOM-001 is no longer distinct.
  dark: 'bg-action text-on-action hover:bg-action-hover disabled:bg-action-disabled',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
};

/**
 * Shared class builder so any element that must look like a button (e.g. a
 * react-router `Link` styled as a primary action) stays visually identical
 * to real <Button>s instead of hand-rolling near-duplicate classes.
 */
export function getButtonClassName(options: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  const { variant = 'primary', size = 'md', className = '' } = options;
  return `inline-flex items-center justify-center rounded-control font-medium transition-colors disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
}

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={getButtonClassName({ variant, size, className })}
    >
      {loading ? <Spinner size="sm" /> : null}
      {children}
    </button>
  );
}
