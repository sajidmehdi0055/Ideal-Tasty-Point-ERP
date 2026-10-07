import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

const sideClasses: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-1.5 -translate-x-1/2',
  left: 'right-full top-1/2 mr-1.5 -translate-y-1/2',
  right: 'left-full top-1/2 ml-1.5 -translate-y-1/2',
};

/** Hover delay so a pointer merely passing over a row of icons does not flash tooltips. */
const HOVER_DELAY_MS = 150;

interface TooltipProps {
  content: ReactNode;
  /** One focusable element (usually a button). It gets `aria-describedby` pointing at the tooltip. */
  children: ReactElement<{ 'aria-describedby'?: string | undefined }>;
  side?: TooltipSide;
  /**
   * `false` when the tooltip only repeats the trigger's accessible name
   * (icon-only buttons): the tooltip is then visual only, so screen readers
   * do not hear the same words twice. Defaults to `true`.
   */
  describe?: boolean;
}

/**
 * CSS-positioned tooltip (no library). Shows on pointer hover (short delay)
 * and immediately on keyboard focus; hides on mouse leave, blur and Escape.
 * Escape is consumed while the tooltip is visible (WCAG 1.4.13 "dismissible"),
 * so a second Escape is needed to close a surrounding dialog.
 * Note: like any absolutely-positioned popup it is clipped by an ancestor
 * with `overflow: hidden/auto`.
 */
export function Tooltip({ content, children, side = 'top', describe = true }: TooltipProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setVisible(false);
    };
    // Capture phase so the tooltip is dismissed before a surrounding dialog sees the key.
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [visible]);

  const show = (delay: number) => {
    clearTimeout(timer.current);
    if (delay === 0) setVisible(true);
    else timer.current = setTimeout(() => setVisible(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setVisible(false);
  };

  const existing = children.props['aria-describedby'];
  const trigger = describe
    ? cloneElement(children, { 'aria-describedby': existing ? `${existing} ${id}` : id })
    : children;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => show(HOVER_DELAY_MS)}
      onMouseLeave={hide}
      onFocus={() => show(0)}
      onBlur={hide}
    >
      {trigger}
      <span
        id={id}
        role="tooltip"
        hidden={!visible}
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-control bg-ink px-2 py-1 text-xs font-medium text-canvas shadow-dropdown ${sideClasses[side]}`}
      >
        {content}
      </span>
    </span>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  /** Accessible name; also the tooltip text unless `tooltip` is given. Required — an icon alone says nothing. */
  label: string;
  icon: ReactNode;
  /** Tooltip text when it should differ from `label`. */
  tooltip?: string;
  tooltipSide?: TooltipSide;
}

/** 32px square icon-only button. Always has `aria-label` and a tooltip. */
export function IconButton({ label, icon, tooltip, tooltipSide = 'top', className = '', ...rest }: IconButtonProps) {
  const text = tooltip ?? label;
  return (
    <Tooltip content={text} side={tooltipSide} describe={text !== label}>
      <button
        type="button"
        {...rest}
        aria-label={label}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-secondary transition-colors hover:bg-canvas-hover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:h-4 [&>svg]:w-4 ${className}`}
      >
        {icon}
      </button>
    </Tooltip>
  );
}
