import type { ButtonHTMLAttributes } from 'react';

const TONES = {
  default: 'text-ink-secondary hover:text-ink',
  strong: 'text-ink',
  danger: 'text-danger-700',
  info: 'text-info-700',
} as const;

interface TextActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: keyof typeof TONES;
}

/** Text-only row action (Rename / Deactivate / History / Adjust in the approved tables). */
export function TextAction({ tone = 'default', className = '', children, ...rest }: TextActionProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`whitespace-nowrap rounded-sm text-[13px] font-medium hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 ${TONES[tone]} ${className}`}
    >
      {children}
    </button>
  );
}
