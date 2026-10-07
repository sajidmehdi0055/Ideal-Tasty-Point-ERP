import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TdHTMLAttributes,
} from 'react';
import { clampWidth, fitColumnWidths, type ColumnDef, type Density } from './types';
import type { TableSettings } from './useTableSettings';

interface DataTableContextValue {
  density: Density;
  visibleCount: number;
}

const DataTableContext = createContext<DataTableContextValue>({ density: 'comfortable', visibleCount: 1 });

/** Density and visible column count of the surrounding DataTable (for custom cells/rows). */
export function useDataTable(): DataTableContextValue {
  return useContext(DataTableContext);
}

export const RESIZE_TOOLTIP = 'Drag to resize · double-click to fit';
const KEYBOARD_STEP_PX = 16;
/** px-4 on both sides of a header cell plus room for the resize handle. */
const HEADER_FIT_EXTRA_PX = 40;
const TOOLTIP_DELAY_MS = 150;

interface DataTableProps {
  settings: TableSettings;
  /** Accessible name of the table (e.g. "Stock balances"). */
  ariaLabel: string;
  /** Optional caption, announced by screen readers only (the page title is the visible heading). */
  caption?: ReactNode;
  /** Body rows (DataRow / DataGroupRow or plain <tr>). Render cells for `settings.visibleColumns` only. */
  children: ReactNode;
  /** Bounds the scroll container so the sticky header has something to stick in (e.g. "calc(100vh - 320px)"). */
  maxHeight?: CSSProperties['maxHeight'];
  className?: string;
}

/**
 * Table shell: scroll container, <colgroup> from the visible columns, sticky
 * 40px header with resize handles (desktop only), and a <tbody> for the rows
 * the screen renders.
 */
export function DataTable({ settings, ariaLabel, caption, children, maxHeight, className = '' }: DataTableProps) {
  const { visibleColumns, enabled, storedWidthOf, setWidth, density } = settings;
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef(new Map<string, HTMLTableColElement>());
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [available, setAvailable] = useState<number | undefined>(undefined);

  // Width of the scroll container, so default column widths can shrink to fit it (e.g. at 1024px).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;
    const measure = () => setAvailable(el.clientWidth || undefined);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);

  const fitted = enabled ? fitColumnWidths(visibleColumns, storedWidthOf, available) : undefined;
  const widthOf = (id: string) => fitted?.get(id);

  const minTableWidth = fitted
    ? visibleColumns.reduce((sum, column) => sum + (widthOf(column.id) ?? column.minWidth), 0)
    : undefined;

  /** Double-click / Enter: size the column to its widest header or body content. */
  const fitColumn = (column: ColumnDef, index: number) => {
    const table = tableRef.current;
    if (!table) return;
    const col = colRefs.current.get(column.id);
    const previous = col?.style.width ?? '';
    // Shrink first so scrollWidth reports content width, not the current cell width.
    if (col) col.style.width = `${column.minWidth}px`;
    let widest = 0;
    const label = table.tHead?.rows[0]?.cells[index]?.querySelector<HTMLElement>('[data-column-label]');
    if (label) widest = label.scrollWidth + HEADER_FIT_EXTRA_PX;
    for (const body of Array.from(table.tBodies)) {
      for (const row of Array.from(body.rows)) {
        // Rows with colSpan (group headers) do not line up with columns; skip them.
        if (row.cells.length !== visibleColumns.length) continue;
        widest = Math.max(widest, row.cells[index]?.scrollWidth ?? 0);
      }
    }
    if (col) col.style.width = previous;
    setWidth(column.id, clampWidth(column, Math.ceil(widest)));
  };

  const currentWidth = (column: ColumnDef, index: number) => {
    const th = tableRef.current?.tHead?.rows[0]?.cells[index];
    const rendered = th?.getBoundingClientRect().width ?? 0;
    return rendered > 0 ? rendered : (widthOf(column.id) ?? column.defaultWidth ?? column.minWidth);
  };

  return (
    <DataTableContext.Provider value={{ density, visibleCount: visibleColumns.length }}>
      <div ref={scrollRef} className={`overflow-auto ${className}`} style={maxHeight === undefined ? undefined : { maxHeight }}>
        <table
          ref={tableRef}
          aria-label={ariaLabel}
          data-density={density}
          className={`w-full text-left text-sm ${enabled ? 'table-fixed' : ''}`}
          style={minTableWidth === undefined ? undefined : { minWidth: minTableWidth }}
        >
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <colgroup>
            {visibleColumns.map(column => {
              const width = widthOf(column.id);
              return (
                <col
                  key={column.id}
                  data-column-id={column.id}
                  ref={el => {
                    if (el) colRefs.current.set(column.id, el);
                    else colRefs.current.delete(column.id);
                  }}
                  style={width === undefined ? undefined : { width }}
                />
              );
            })}
          </colgroup>
          <thead>
            <tr>
              {visibleColumns.map((column, index) => {
                const canResize = enabled && column.resizable !== false && index < visibleColumns.length - 1;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    // Explicit name so the resize handle inside does not become part of the header name.
                    aria-label={column.label}
                    data-column-id={column.id}
                    className={`sticky top-0 h-row-header bg-canvas-sunken px-4 py-0 align-middle text-[11px] font-semibold uppercase tracking-[0.5px] whitespace-nowrap text-ink-muted shadow-[inset_0_-1px_0_var(--color-line)] ${
                      activeHandle === column.id ? 'z-20' : 'z-10'
                    } ${column.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    <span data-column-label className={`block truncate ${column.hideLabel ? 'sr-only' : ''}`}>
                      {column.label}
                    </span>
                    {canResize ? (
                      <ResizeHandle
                        column={column}
                        width={widthOf(column.id)}
                        tooltipAlign={index < visibleColumns.length / 2 ? 'start' : 'end'}
                        getStartWidth={() => currentWidth(column, index)}
                        onResize={px => setWidth(column.id, px)}
                        onFit={() => fitColumn(column, index)}
                        onActiveChange={active =>
                          setActiveHandle(prev => (active ? column.id : prev === column.id ? null : prev))
                        }
                      />
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">{children}</tbody>
        </table>
      </div>
    </DataTableContext.Provider>
  );
}

interface ResizeHandleProps {
  column: ColumnDef;
  width: number | undefined;
  tooltipAlign: 'start' | 'end';
  getStartWidth: () => number;
  onResize: (px: number) => void;
  onFit: () => void;
  onActiveChange: (active: boolean) => void;
}

/**
 * Divider on a header cell's right edge. Mouse: drag to resize, double-click to
 * fit. Keyboard (optional extra): focus it, ArrowLeft/ArrowRight resize by 16px,
 * Enter fits. Its own tooltip opens BELOW the sticky header, aligned to the
 * divider, so the scroll container does not clip it.
 */
function ResizeHandle({ column, width, tooltipAlign, getStartWidth, onResize, onFit, onActiveChange }: ResizeHandleProps) {
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState(false);
  const [dragging, setDragging] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cleanupDrag = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      cleanupDrag.current?.();
    },
    [],
  );

  const showTooltip = (delay: number) => {
    clearTimeout(timer.current);
    onActiveChange(true);
    if (delay === 0) setTooltip(true);
    else timer.current = setTimeout(() => setTooltip(true), delay);
  };
  const hideTooltip = () => {
    clearTimeout(timer.current);
    setTooltip(false);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    hideTooltip();
    const startX = event.clientX;
    const startWidth = getStartWidth();
    const body = document.body;
    const previousCursor = body.style.cursor;
    const previousSelect = body.style.userSelect;
    body.style.cursor = 'col-resize';
    body.style.userSelect = 'none';
    setDragging(true);
    onActiveChange(true);

    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - startX;
      if (dx !== 0) onResize(startWidth + dx);
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      body.style.cursor = previousCursor;
      body.style.userSelect = previousSelect;
      cleanupDrag.current = null;
      setDragging(false);
      onActiveChange(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    cleanupDrag.current = stop;
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      onResize(getStartWidth() + (event.key === 'ArrowRight' ? KEYBOARD_STEP_PX : -KEYBOARD_STEP_PX));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onFit();
    } else if (event.key === 'Escape' && tooltip) {
      event.preventDefault();
      event.stopPropagation();
      hideTooltip();
    }
  };

  const active = tooltip || dragging;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${column.label} column`}
      aria-describedby={tooltipId}
      aria-valuenow={width}
      aria-valuemin={column.minWidth}
      aria-valuemax={column.maxWidth}
      tabIndex={0}
      data-resize-handle={column.id}
      onPointerDown={onPointerDown}
      onDoubleClick={event => {
        event.preventDefault();
        onFit();
      }}
      onKeyDown={onKeyDown}
      onMouseEnter={() => showTooltip(TOOLTIP_DELAY_MS)}
      onMouseLeave={() => {
        hideTooltip();
        if (!dragging) onActiveChange(false);
      }}
      onFocus={() => showTooltip(0)}
      onBlur={() => {
        hideTooltip();
        onActiveChange(false);
      }}
      className="group absolute top-0 right-0 flex h-full w-2 cursor-col-resize touch-none justify-end outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
    >
      <span
        aria-hidden="true"
        className={`my-auto h-5 w-px transition-colors group-hover:h-full group-hover:w-0.5 group-hover:bg-action ${
          active ? 'h-full w-0.5 bg-action' : 'bg-transparent'
        }`}
      />
      <span
        id={tooltipId}
        role="tooltip"
        hidden={!tooltip}
        className={`pointer-events-none absolute top-full mt-1.5 whitespace-nowrap rounded-control bg-action px-2 py-1 text-xs font-medium tracking-normal normal-case text-on-action shadow-dropdown ${
          tooltipAlign === 'start' ? 'left-0' : 'right-0'
        }`}
      >
        {RESIZE_TOOLTIP}
      </span>
    </div>
  );
}

const focusRing = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus';

interface DataRowProps extends HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
}

/** Body row: 48px (comfortable) or 36px (compact), hover = bg-canvas-hover, focus ring when focused. */
export function DataRow({ children, className = '', ...rest }: DataRowProps) {
  const { density } = useDataTable();
  return (
    <tr
      {...rest}
      className={`${density === 'compact' ? 'h-row-compact' : 'h-row-comfortable'} transition-colors hover:bg-canvas-hover ${focusRing} ${className}`}
    >
      {children}
    </tr>
  );
}

interface DataGroupRowProps extends HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
}

/** Full-width group header row (e.g. a location or a day); spans every visible column. */
export function DataGroupRow({ children, className = '', ...rest }: DataGroupRowProps) {
  const { visibleCount } = useDataTable();
  return (
    <tr {...rest} className={`bg-canvas-sunken ${className}`}>
      <td colSpan={visibleCount} className="h-9 px-4 py-1 text-xs font-semibold text-ink-secondary">
        {children}
      </td>
    </tr>
  );
}

interface DataCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right';
  /** Number cell: right-aligned with tabular figures. */
  numeric?: boolean;
  /** Allow text to wrap instead of truncating with an ellipsis. */
  wrap?: boolean;
}

/** Body cell. Truncates with an ellipsis by default so resized columns never overlap. */
export function DataCell({ align, numeric = false, wrap = false, className = '', children, ...rest }: DataCellProps) {
  const right = numeric || align === 'right';
  return (
    <td
      {...rest}
      className={`px-4 py-0 align-middle text-[13px] text-ink ${wrap ? '' : 'overflow-hidden text-ellipsis whitespace-nowrap'} ${
        right ? 'text-right' : 'text-left'
      } ${numeric ? 'tabular-nums' : ''} ${focusRing} ${className}`}
    >
      {children}
    </td>
  );
}
