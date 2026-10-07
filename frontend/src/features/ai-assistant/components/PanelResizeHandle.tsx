import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { clampWidth } from '../../../lib/use-resizable-width';

/**
 * UI-REFRESH-001 (Figma R9 "Panel width", node 136:16856): the desktop panel's
 * left edge can be dragged to set its width between 440 and 760 px;
 * double-click resets it; the width is remembered on this device.
 */
export const AI_PANEL_WIDTH_KEY = 'itp-erp:ai-panel-width';
export const AI_PANEL_MIN_WIDTH = 440;
export const AI_PANEL_MAX_WIDTH = 760;
export const AI_PANEL_DEFAULT_WIDTH = 440;
/** Arrow-key step for keyboard resizing. */
export const AI_PANEL_KEY_STEP = 16;

const TOOLTIP_TEXT = `Drag to resize · ${AI_PANEL_MIN_WIDTH}–${AI_PANEL_MAX_WIDTH} px · double-click to reset`;

interface PanelResizeHandleProps {
  width: number;
  /** While dragging (not saved yet). */
  onPreview: (width: number) => void;
  /** Drag end / keyboard step: save this width. */
  onCommit: (width: number) => void;
  onReset: () => void;
}

export function PanelResizeHandle({ width, onPreview, onCommit, onReset }: PanelResizeHandleProps) {
  const tooltipId = useId();
  const [dragging, setDragging] = useState(false);
  const stopDragRef = useRef<(() => void) | null>(null);

  // Unmounting mid-drag (panel closed by Esc, layout change) must not leave
  // document listeners or the body cursor behind.
  useEffect(() => () => stopDragRef.current?.(), []);

  function handleMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let latest = width;
    const body = document.body;
    const previousCursor = body.style.cursor;
    const previousUserSelect = body.style.userSelect;
    body.style.cursor = 'col-resize';
    body.style.userSelect = 'none';
    setDragging(true);

    // The panel is on the right, so moving the pointer left makes it wider.
    const handleMove = (moveEvent: MouseEvent) => {
      latest = clampWidth(startWidth + (startX - moveEvent.clientX), AI_PANEL_MIN_WIDTH, AI_PANEL_MAX_WIDTH);
      onPreview(latest);
    };
    const stop = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      body.style.cursor = previousCursor;
      body.style.userSelect = previousUserSelect;
      stopDragRef.current = null;
      setDragging(false);
    };
    const handleUp = () => {
      stop();
      onCommit(latest);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    stopDragRef.current = stop;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = width + AI_PANEL_KEY_STEP;
    else if (event.key === 'ArrowRight') next = width - AI_PANEL_KEY_STEP;
    else if (event.key === 'Home') next = AI_PANEL_MIN_WIDTH;
    else if (event.key === 'End') next = AI_PANEL_MAX_WIDTH;
    if (next === null) return;
    event.preventDefault();
    onCommit(next);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize AI Assistant panel"
      aria-valuemin={AI_PANEL_MIN_WIDTH}
      aria-valuemax={AI_PANEL_MAX_WIDTH}
      aria-valuenow={width}
      aria-valuetext={`${width} px`}
      aria-describedby={tooltipId}
      tabIndex={0}
      data-testid="ai-panel-resize"
      data-dragging={dragging ? 'true' : 'false'}
      onMouseDown={handleMouseDown}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      className="group absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize outline-none"
    >
      {/* Edge line + grip: shown on hover, keyboard focus and while dragging. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 transition-colors ${
          dragging ? 'bg-action' : 'bg-transparent group-hover:bg-action group-focus-visible:bg-action'
        }`}
      />
      <span
        aria-hidden="true"
        className={`absolute left-1/2 top-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-action transition-opacity ${
          dragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
        }`}
      />
      <span
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-control bg-action px-2.5 py-1.5 text-xs font-medium text-on-action shadow-dropdown ${
          dragging ? 'hidden' : 'hidden group-hover:block group-focus-visible:block'
        }`}
      >
        {TOOLTIP_TEXT}
      </span>
    </div>
  );
}
