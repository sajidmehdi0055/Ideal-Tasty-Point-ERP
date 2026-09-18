import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function Card({ title, actions, children, className = '', ...rest }: CardProps) {
  return (
    <div className={`rounded-card border border-line bg-canvas shadow-card ${className}`} {...rest}>
      {title || actions ? (
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          {title ? <h3 className="text-sm font-semibold text-ink">{title}</h3> : <span />}
          {actions}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </div>
  );
}
