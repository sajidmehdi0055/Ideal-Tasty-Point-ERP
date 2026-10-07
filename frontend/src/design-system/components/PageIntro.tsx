import type { ReactNode } from 'react';

interface PageIntroProps {
  title: string;
  /** One line that says what this section is for. */
  description?: ReactNode;
  /** Primary page actions, top-right (wrap below the text on narrow screens). */
  actions?: ReactNode;
}

/** Section title + one-line description + actions, shown at the top of a screen's content. */
export function PageIntro({ title, description, actions }: PageIntroProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
        <h2 className="text-lg leading-[normal] font-bold text-ink">{title}</h2>
        {description ? <p className="text-[13.5px] leading-[normal] text-ink-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
