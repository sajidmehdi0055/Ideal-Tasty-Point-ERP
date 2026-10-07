import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchField } from '../../components/SearchField';
import { stubMatchMedia } from '../../../test/media';
import {
  ColumnsMenu,
  DataCell,
  DataGroupRow,
  DataRow,
  DataTable,
  DataTableToolbar,
  DensityToggle,
  RESIZE_TOOLTIP,
  ResultCount,
  TruncationBanner,
  tableSettingsKey,
  useSlashFocus,
  useTableSettings,
  type ColumnDef,
} from '..';

const COLUMNS: ColumnDef[] = [
  { id: 'time', label: 'Time', minWidth: 60, defaultWidth: 80 },
  { id: 'item', label: 'Item', required: true, minWidth: 160 },
  { id: 'type', label: 'Type', minWidth: 90, defaultWidth: 120, maxWidth: 300 },
  { id: 'reason', label: 'Reason', minWidth: 100, defaultWidth: 160 },
  { id: 'qty', label: 'Quantity', required: true, minWidth: 80, defaultWidth: 110, align: 'right' },
];

function Harness({ screenId = 'test-screen' }: { screenId?: string }) {
  const settings = useTableSettings(screenId, COLUMNS);
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  useSlashFocus(searchRef, { onClear: () => setSearch('') });
  return (
    <div>
      <input aria-label="Other input" />
      <DataTableToolbar
        start={
          <SearchField
            ref={searchRef}
            label="Search items"
            shortcutHint="/"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        }
        end={
          <>
            <ResultCount>2 movements</ResultCount>
            <ColumnsMenu settings={settings} />
            <DensityToggle settings={settings} />
          </>
        }
      />
      <TruncationBanner />
      <DataTable settings={settings} ariaLabel="Movements">
        <DataGroupRow>Today</DataGroupRow>
        {['a', 'b'].map(row => (
          <DataRow key={row} data-testid={`row-${row}`}>
            {settings.visibleColumns.map(column => (
              <DataCell key={column.id} numeric={column.align === 'right'}>
                {column.id}-{row}
              </DataCell>
            ))}
          </DataRow>
        ))}
      </DataTable>
    </div>
  );
}

function stored(screenId = 'test-screen') {
  const text = window.localStorage.getItem(tableSettingsKey(screenId));
  return text ? JSON.parse(text) : null;
}

const colWidth = (id: string) =>
  (document.querySelector(`col[data-column-id="${id}"]`) as HTMLTableColElement | null)?.style.width;
const columnsButton = () => screen.getByRole('button', { name: /^Columns/ });
const handle = (id: string) => document.querySelector(`[data-resize-handle="${id}"]`) as HTMLElement;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DataTable on a desktop (fine pointer, ≥1024px)', () => {
  beforeEach(() => {
    stubMatchMedia({ hover: true });
  });

  it('shrinks default widths to fit a narrow container but keeps widths the user stored', () => {
    // Defaults 80 + 160 (flexible, min) + 120 + 160 + 110 = 630px; container 560px.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(560);
    const { unmount } = render(<Harness />);
    expect(colWidth('time')).toBe('70px');
    expect(colWidth('type')).toBe('105px');
    expect(colWidth('reason')).toBe('130px');
    expect(colWidth('qty')).toBe('95px');
    expect(colWidth('item')).toBe('');
    expect(screen.getByRole('table')).toHaveStyle({ minWidth: '560px' });
    unmount();

    window.localStorage.setItem(
      tableSettingsKey('test-screen'),
      JSON.stringify({ v: 1, density: 'comfortable', widths: { reason: 200 }, hidden: [] }),
    );
    render(<Harness />);
    expect(colWidth('reason')).toBe('200px'); // the user's width wins
    expect(colWidth('time')).toBe('60px');
    expect(colWidth('qty')).toBe('80px');
  });

  it('renders a sticky 40px header and density-aware rows (comfortable by default)', () => {
    render(<Harness />);
    const header = screen.getByRole('columnheader', { name: 'Item' });
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('top-0');
    expect(header.className).toContain('h-row-header');
    expect(screen.getByTestId('row-a').className).toContain('h-row-comfortable');
    expect(screen.getByTestId('row-a').className).toContain('hover:bg-canvas-hover');
    expect(screen.getByText('Today').closest('td')).toHaveAttribute('colspan', '5');
    expect(screen.getByRole('cell', { name: 'qty-a' }).className).toContain('tabular-nums');
  });

  it('switches to compact, persists it, and restores it on remount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Compact' }));
    expect(screen.getByRole('button', { name: 'Compact' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('row-a').className).toContain('h-row-compact');
    expect(stored()).toMatchObject({ v: 1, density: 'compact' });
    unmount();
    render(<Harness />);
    expect(screen.getByTestId('row-a').className).toContain('h-row-compact');
  });

  it('keeps settings separate per screen', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness screenId="screen-a" />);
    await user.click(screen.getByRole('button', { name: 'Compact' }));
    unmount();
    render(<Harness screenId="screen-b" />);
    expect(screen.getByTestId('row-a').className).toContain('h-row-comfortable');
    expect(stored('screen-b')).toBeNull();
    expect(stored('screen-a')).toMatchObject({ density: 'compact' });
  });

  it('hides optional columns, shows "2 hidden", restores on remount, and resets widths + columns', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    expect(columnsButton()).toHaveTextContent(/^Columns$/);
    await user.click(columnsButton());
    const menu = screen.getByRole('dialog', { name: 'Show columns' });
    await user.click(within(menu).getByRole('checkbox', { name: 'Time' }));
    await user.click(within(menu).getByRole('checkbox', { name: 'Reason' }));
    expect(columnsButton()).toHaveTextContent('2 hidden');
    expect(screen.queryByRole('columnheader', { name: 'Time' })).not.toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'reason-a' })).not.toBeInTheDocument();
    expect(screen.getByText('Today').closest('td')).toHaveAttribute('colspan', '3');
    expect(stored()).toMatchObject({ hidden: ['time', 'reason'] });

    unmount();
    window.localStorage.setItem(
      tableSettingsKey('test-screen'),
      JSON.stringify({ ...stored(), widths: { type: 250 } }),
    );
    render(<Harness />);
    expect(columnsButton()).toHaveTextContent('2 hidden');
    expect(colWidth('type')).toBe('250px');

    await user.click(columnsButton());
    await user.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(columnsButton()).toHaveTextContent(/^Columns$/);
    expect(screen.getByRole('columnheader', { name: 'Time' })).toBeInTheDocument();
    expect(colWidth('type')).toBe('120px');
    expect(stored()).toMatchObject({ widths: {}, hidden: [] });
  });

  it('locks required columns: checked, disabled, lock icon, and stored "hidden" values for them are ignored', async () => {
    window.localStorage.setItem(
      tableSettingsKey('test-screen'),
      JSON.stringify({ v: 1, density: 'comfortable', widths: {}, hidden: ['item', 'qty', 'nope'] }),
    );
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole('columnheader', { name: 'Item' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Quantity' })).toBeInTheDocument();
    expect(columnsButton()).toHaveTextContent(/^Columns$/);
    await user.click(columnsButton());
    const item = screen.getByRole('checkbox', { name: 'Item (required, cannot be hidden)' });
    expect(item).toBeChecked();
    expect(item).toBeDisabled();
    expect(screen.getByTestId('lock-item')).toBeInTheDocument();
    expect(screen.queryByTestId('lock-time')).not.toBeInTheDocument();
    await user.click(item);
    expect(screen.getByRole('columnheader', { name: 'Item' })).toBeInTheDocument();
  });

  it('closes the Columns menu on Esc (focus back to the button) and on outside click', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(columnsButton());
    expect(screen.getByRole('checkbox', { name: 'Time' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Show columns' })).not.toBeInTheDocument();
    expect(columnsButton()).toHaveFocus();
    await user.click(columnsButton());
    await user.click(screen.getByText('2 movements'));
    expect(screen.queryByRole('dialog', { name: 'Show columns' })).not.toBeInTheDocument();
  });

  it('ignores corrupt JSON, wrong versions and wrong types', () => {
    window.localStorage.setItem(tableSettingsKey('test-screen'), '{not json');
    const { unmount } = render(<Harness />);
    expect(screen.getByTestId('row-a').className).toContain('h-row-comfortable');
    unmount();
    window.localStorage.setItem(
      tableSettingsKey('test-screen'),
      JSON.stringify({ v: 1, density: 'tiny', widths: { type: 'wide', time: 5, ghost: 300 }, hidden: 'time' }),
    );
    render(<Harness />);
    expect(screen.getByTestId('row-a').className).toContain('h-row-comfortable');
    expect(colWidth('type')).toBe('120px');
    expect(colWidth('time')).toBe('60px'); // clamped to minWidth
    expect(screen.getByRole('columnheader', { name: 'Time' })).toBeInTheDocument();
  });

  it('still works when localStorage throws on read and write', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Compact' }));
    expect(screen.getByTestId('row-a').className).toContain('h-row-compact');
    await user.click(columnsButton());
    await user.click(screen.getByRole('checkbox', { name: 'Time' }));
    expect(columnsButton()).toHaveTextContent('1 hidden');
  });

  it('resizes by dragging the header divider and enforces the minimum width', () => {
    render(<Harness />);
    expect(handle('qty')).toBeNull(); // no divider after the last column
    const typeHandle = handle('type');
    expect(typeHandle).toHaveAttribute('role', 'separator');
    fireEvent.pointerDown(typeHandle, { button: 0, clientX: 500 });
    fireEvent.pointerMove(window, { clientX: 560 });
    expect(colWidth('type')).toBe('180px');
    fireEvent.pointerMove(window, { clientX: 100 });
    expect(colWidth('type')).toBe('90px');
    fireEvent.pointerUp(window, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 900 });
    expect(colWidth('type')).toBe('90px');
    expect(stored()).toMatchObject({ widths: { type: 90 } });
  });

  it('fits a column to its widest content on double-click (clamped to max)', () => {
    render(<Harness />);
    const cells = screen.getAllByRole('cell', { name: /^type-/ });
    Object.defineProperty(cells[0], 'scrollWidth', { configurable: true, value: 210 });
    Object.defineProperty(cells[1], 'scrollWidth', { configurable: true, value: 140 });
    fireEvent.doubleClick(handle('type'));
    expect(colWidth('type')).toBe('210px');
    Object.defineProperty(cells[1], 'scrollWidth', { configurable: true, value: 999 });
    fireEvent.doubleClick(handle('type'));
    expect(colWidth('type')).toBe('300px');
  });

  it('shows the resize tooltip on keyboard focus and supports arrow keys', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    act(() => handle('time').focus());
    expect(screen.getByRole('tooltip')).toHaveTextContent(RESIZE_TOOLTIP);
    await user.keyboard('{ArrowRight}');
    expect(colWidth('time')).toBe('96px');
  });
});

describe('DataTable on touch / tablet / narrow screens', () => {
  it('hides Columns, density and resize, ignores stored widths/hidden/density', () => {
    window.localStorage.setItem(
      tableSettingsKey('test-screen'),
      JSON.stringify({ v: 1, density: 'compact', widths: { type: 250 }, hidden: ['time'] }),
    );
    stubMatchMedia({ hover: false });
    render(<Harness />);
    expect(screen.queryByRole('button', { name: /^Columns/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compact' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-resize-handle]')).toBeNull();
    expect(colWidth('type')).toBe('');
    expect(screen.getByRole('columnheader', { name: 'Time' })).toBeInTheDocument();
    expect(screen.getByTestId('row-a').className).toContain('h-row-comfortable');
    // Stored preferences are kept for when the same browser is used on a desktop.
    expect(stored()).toMatchObject({ density: 'compact', hidden: ['time'] });
  });
});

describe('search shortcuts and banner', () => {
  it('"/" focuses search, but not while typing in another input or with a modifier', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const search = screen.getByRole('searchbox', { name: 'Search items' });
    const other = screen.getByRole('textbox', { name: 'Other input' });
    await user.click(other);
    await user.keyboard('/');
    expect(other).toHaveFocus();
    expect(other).toHaveValue('/');
    act(() => other.blur());
    fireEvent.keyDown(document.body, { key: '/', ctrlKey: true });
    expect(search).not.toHaveFocus();
    await user.keyboard('/');
    expect(search).toHaveFocus();
    expect(search).toHaveValue('');
  });

  it('does not steal "/" while a dialog is open', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <div role="dialog" aria-modal="true" aria-label="Edit" />
      </>,
    );
    await user.keyboard('/');
    expect(screen.getByRole('searchbox', { name: 'Search items' })).not.toHaveFocus();
  });

  it('Esc clears a non-empty search box, then blurs it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const search = screen.getByRole('searchbox', { name: 'Search items' });
    await user.keyboard('/');
    await user.keyboard('flour');
    expect(search).toHaveValue('flour');
    await user.keyboard('{Escape}');
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(search).not.toHaveFocus();
  });

  it('shows the "/" hint chip and the exact truncation text', () => {
    render(<Harness />);
    expect(screen.getByText('/', { selector: 'kbd' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing the first 200 items. Search or choose a location to see the rest.',
    );
  });

  it('accepts custom truncation text', () => {
    render(<TruncationBanner>Showing the first 500 movements.</TruncationBanner>);
    expect(screen.getByRole('status')).toHaveTextContent('Showing the first 500 movements.');
  });
});
