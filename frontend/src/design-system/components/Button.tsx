import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-text' | 'ghost' | 'dark';
/** `xs` = Button/Small in the Direction A Figma (31px tall; row actions such as "Adjust"). */
export type ButtonSize = 'xs' | 'sm' | 'md';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-action text-on-action hover:bg-action-hover disabled:bg-action-disabled',
  secondary: 'bg-canvas text-ink border border-line-strong hover:bg-canvas-hover disabled:text-ink-muted',
  danger: 'bg-danger-solid text-white hover:bg-danger-solid-hover disabled:bg-danger-50 disabled:text-danger-600',
  // Text-only danger action (e.g. "Deactivate" in a row): no fill until hover.
  'danger-text': 'bg-transparent text-danger-600 hover:bg-danger-50 hover:text-danger-700 disabled:text-ink-muted',
  ghost: 'bg-transparent text-ink hover:bg-canvas-hover disabled:text-ink-muted',
  // Kept as an alias of `primary`: ERP Shell v2 (owner-approved 2026-09-27)
  // made Charcoal/Slate the single primary action colour everywhere, so the
  // separate slate variant introduced for UI-UOM-001 is no longer distinct.
  dark: 'bg-action text-on-action hover:bg-action-hover disabled:bg-action-disabled',
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'h-[31px] px-3 text-[12.5px] gap-1',
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-[13px] gap-2',
};

/**
 * Shared class builder so any element that must look like a button (e.g. a
 * react-router `Link` styled as a primary action) stays visually identical
 * to real <Button>s instead of hand-rolling near-duplicate classes.
 */
export function getButtonClassName(options: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  const { variant = 'primary', size = 'md', className = '' } = options;
  return `inline-flex items-center justify-center rounded-control font-semibold transition-colors disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
}

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
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
