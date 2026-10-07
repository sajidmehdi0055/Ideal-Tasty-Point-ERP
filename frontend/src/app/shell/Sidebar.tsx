import { Fragment, useLayoutEffect, useRef, type Ref } from 'react';
import { NavLink } from 'react-router-dom';
import { NAV_SECTIONS } from './nav-items';
import { Tooltip } from '../../design-system/components/Tooltip';
import {
  ChevronDownIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PinIcon,
  XIcon,
} from '../../design-system/icons';

/**
 * ERP Shell v2 sidebar pieces (owner-approved Figma 2026-09-27, file
 * N9KkqXIQuvCUj9NVAj6Cx4, components section 86:2):
 *  - SidebarRail: the 64px icons-only rail (desktop/tablet default).
 *  - SidebarPanel: the 264px expanded sidebar, in three variants —
 *      `pinned` (in the page flow), `peek` (floats over content, opened by
 *      hover/keyboard on desktop or by tap on touch) and `drawer` (mobile).
 * Open/close behaviour lives in AppShell; these components only render.
 */

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sidebar-text-active';

/** Flat index of each section's first item, so links can be addressed across groups. */
const SECTION_OFFSETS = NAV_SECTIONS.map((_, sectionIndex) =>
  NAV_SECTIONS.slice(0, sectionIndex).reduce((count, section) => count + section.items.length, 0),
);

function groupId(prefix: string, label: string) {
  return `${prefix}-group-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function Brand() {
  return (
    <>
      {/* Placeholder mark: the official Ideal Tasty Point logo goes here unchanged once supplied. */}
      <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-control bg-sidebar-border" />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-bold text-ink">Ideal Tasty Point</span>
        <span className="text-[11px] font-medium text-sidebar-text">ERP</span>
      </span>
    </>
  );
}

export type SidebarPanelVariant = 'pinned' | 'peek' | 'drawer';

interface SidebarPanelProps {
  variant: SidebarPanelVariant;
  navLabel: string;
  collapsedGroups: ReadonlySet<string>;
  onToggleGroup: (group: string) => void;
  onNavigate?: (() => void) | undefined;
  /** peek: keep the sidebar open (becomes `pinned`). */
  onPin?: (() => void) | undefined;
  /** pinned: return to the collapsed rail. */
  onCollapse?: (() => void) | undefined;
  /** drawer: close button. */
  onClose?: (() => void) | undefined;
  /** Flat index (across all groups) of the link to focus when the panel mounts. */
  autoFocusIndex?: number | undefined;
  firstLinkRef?: Ref<HTMLAnchorElement> | undefined;
}

export function SidebarPanel({
  variant,
  navLabel,
  collapsedGroups,
  onToggleGroup,
  onNavigate,
  onPin,
  onCollapse,
  onClose,
  autoFocusIndex,
  firstLinkRef,
}: SidebarPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const autoFocusIndexRef = useRef(autoFocusIndex);

  // Layout effect (not a plain effect): when the peek opens from keyboard
  // focus on the rail, the rail becomes inert in the same commit, so focus
  // must move into the panel before the browser drops it from the rail.
  useLayoutEffect(() => {
    const index = autoFocusIndexRef.current;
    if (index === undefined) return;
    const target = linkRefs.current[index];
    if (target && !target.closest('[hidden]')) {
      target.focus();
      return;
    }
    const fallback = rootRef.current?.querySelector<HTMLElement>('ul:not([hidden]) a, button');
    fallback?.focus();
  }, []);

  return (
    <div
      ref={rootRef}
      className="flex h-full w-[264px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-text"
    >
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
        <Brand />
        {variant === 'drawer' ? (
          <Tooltip content="Close navigation" side="bottom" describe={false}>
            <button
              type="button"
              aria-label="Close navigation"
              onClick={onClose}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-sidebar-text hover:bg-sidebar-item-hover hover:text-ink ${focusRing}`}
            >
              <XIcon className="h-[18px] w-[18px]" />
            </button>
          </Tooltip>
        ) : null}
      </div>

      <nav aria-label={navLabel} className="flex flex-1 flex-col overflow-y-auto px-3 pb-3 pt-1">
        {NAV_SECTIONS.map((section, sectionIndex) => {
          const open = !collapsedGroups.has(section.label);
          const listId = groupId(`sidebar-${variant}`, section.label);
          return (
            <div key={section.label}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => onToggleGroup(section.label)}
                className={`flex w-full items-center justify-between rounded-control px-3 pb-1.5 pt-3.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-section hover:text-sidebar-text ${focusRing}`}
              >
                {section.label}
                <ChevronDownIcon
                  className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`}
                />
              </button>
              <ul id={listId} hidden={!open} className="flex flex-col gap-0.5">
                {section.items.map((item, itemIndex) => {
                  const index = (SECTION_OFFSETS[sectionIndex] ?? 0) + itemIndex;
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        ref={element => {
                          linkRefs.current[index] = element;
                          if (index === 0 && firstLinkRef) {
                            if (typeof firstLinkRef === 'function') firstLinkRef(element);
                            else firstLinkRef.current = element;
                          }
                        }}
                        to={item.to}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          `relative flex h-9 items-center gap-2.5 rounded-control pl-3 pr-2 text-[13px] transition-colors ${focusRing} ${
                            isActive
                              ? 'bg-sidebar-item-active font-semibold text-sidebar-text-active before:absolute before:-left-3 before:top-2 before:h-5 before:w-[3px] before:rounded-r-sm before:bg-sidebar-indicator'
                              : 'font-medium text-sidebar-text hover:bg-sidebar-item-hover hover:text-ink'
                          }`
                        }
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.pending ? (
                          <span className="shrink-0 rounded-sm bg-sidebar-pending-bg px-1.5 py-0.5 text-[10px] font-semibold text-sidebar-pending-text">
                            Pending
                          </span>
                        ) : null}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {variant === 'drawer' ? null : (
        <div className="shrink-0 border-t border-sidebar-border p-3">
          <button
            type="button"
            onClick={variant === 'peek' ? onPin : onCollapse}
            className={`flex h-9 w-full items-center gap-2.5 rounded-control px-3 text-[13px] font-medium text-sidebar-text hover:bg-sidebar-item-hover hover:text-ink ${focusRing}`}
          >
            {variant === 'peek' ? (
              <PinIcon className="h-[18px] w-[18px] shrink-0" />
            ) : (
              <PanelLeftCloseIcon className="h-[18px] w-[18px] shrink-0" />
            )}
            {variant === 'peek' ? 'Pin sidebar' : 'Collapse sidebar'}
          </button>
        </div>
      )}
    </div>
  );
}

interface SidebarRailProps {
  /** Rail's bottom button: pins the sidebar (mouse) or opens it (touch). */
  onExpand: () => void;
  expandLabel: string;
  expandRef?: Ref<HTMLButtonElement> | undefined;
  /** Keyboard focus landed on the rail link at this flat index. */
  onLinkFocus?: ((index: number) => void) | undefined;
}

export function SidebarRail({ onExpand, expandLabel, expandRef, onLinkFocus }: SidebarRailProps) {
  return (
    <div className="flex h-full w-16 flex-col items-center border-r border-sidebar-border bg-sidebar py-3">
      <span aria-hidden="true" className="mt-1 h-8 w-8 shrink-0 rounded-control bg-sidebar-border" />
      {/* No overflow clipping here: the hover tooltips extend past the rail's
          right edge. When the module list outgrows the viewport, move the
          tooltip to a portal before adding overflow-y-auto. */}
      <nav
        aria-label="Primary"
        className="mt-3 flex w-full flex-1 flex-col items-center gap-1 border-t border-sidebar-border pt-3"
      >
        {NAV_SECTIONS.map((section, sectionIndex) => (
          <Fragment key={section.label}>
            {sectionIndex > 0 ? <span aria-hidden="true" className="my-1.5 h-px w-6 shrink-0 bg-sidebar-border" /> : null}
            {section.items.map((item, itemIndex) => {
              const index = (SECTION_OFFSETS[sectionIndex] ?? 0) + itemIndex;
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  aria-label={item.pending ? `${item.label} (pending)` : item.label}
                  onFocus={onLinkFocus ? () => onLinkFocus(index) : undefined}
                  className={({ isActive }) =>
                    `group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-control transition-colors ${focusRing} ${
                      isActive
                        ? 'bg-sidebar-item-active text-sidebar-text-active before:absolute before:-left-3 before:top-2.5 before:h-5 before:w-[3px] before:rounded-r-sm before:bg-sidebar-indicator'
                        : 'text-sidebar-text hover:bg-sidebar-item-hover hover:text-ink'
                    }`
                  }
                >
                  <Icon className="h-5 w-5" />
                  {item.pending ? (
                    <span
                      aria-hidden="true"
                      className="absolute right-[7px] top-[7px] h-1.5 w-1.5 rounded-full bg-sidebar-pending-text"
                    />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-control bg-action px-2.5 py-1.5 text-xs font-medium text-on-action shadow-dropdown can-hover:group-hover:block"
                  >
                    {item.label}
                  </span>
                </NavLink>
              );
            })}
          </Fragment>
        ))}
      </nav>
      <div className="flex w-full shrink-0 justify-center border-t border-sidebar-border pt-2">
        <Tooltip content={expandLabel} side="right" describe={false}>
          <button
            ref={expandRef}
            type="button"
            aria-label={expandLabel}
            onClick={onExpand}
            className={`flex h-10 w-10 items-center justify-center rounded-control text-sidebar-text hover:bg-sidebar-item-hover hover:text-ink ${focusRing}`}
          >
            <PanelLeftOpenIcon className="h-5 w-5" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
