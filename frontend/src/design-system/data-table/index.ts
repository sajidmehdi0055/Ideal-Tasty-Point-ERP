/**
 * design-system/data-table — list-screen table with per-screen settings
 * (UI-REFRESH-001, Figma R1/R4/R7/R8 + "Behaviour notes").
 *
 * 1. Define columns once (module constant or useMemo — must be stable):
 *      const COLUMNS: ColumnDef[] = [
 *        { id: 'item', label: 'Item', required: true, minWidth: 200 },            // no defaultWidth → flexes
 *        { id: 'qty', label: 'Quantity', required: true, minWidth: 96, defaultWidth: 140, align: 'right' },
 *        { id: 'actions', label: 'Actions', required: true, minWidth: 120, defaultWidth: 140, resizable: false },
 *      ];
 * 2. const settings = useTableSettings('stock-balances', COLUMNS);
 *    Remembered in localStorage key `itp-erp:table:<screenId>` as
 *    {"v":1,"density":…,"widths":{id:px},"hidden":[ids]} — invalid/unknown data is ignored,
 *    required columns can never be hidden, storage errors are silent.
 *    `settings.enabled` is false on touch/tablet/mobile (no `(hover: hover) and (pointer: fine)`
 *    or < 1024px): density is then always 'comfortable', every column shows, stored widths are
 *    not applied, and DensityToggle / ColumnsMenu / resize handles render nothing.
 * 3. Render:
 *      <DataTableToolbar start={<SearchField ref={searchRef} shortcutHint="/" … />}
 *        end={<><ResultCount>8 balances · 3 zero hidden</ResultCount><ColumnsMenu settings={settings} /><DensityToggle settings={settings} /></>} />
 *      {truncated ? <TruncationBanner /> : null}
 *      <DataTable settings={settings} ariaLabel="Stock balances" maxHeight="calc(100vh - 320px)">
 *        <DataGroupRow>Main Store</DataGroupRow>            // spans all visible columns
 *        <DataRow key={id}>
 *          {settings.isVisible('item') && <DataCell>…</DataCell>}   // only visible columns, in COLUMNS order
 *          <DataCell numeric>125 kg</DataCell>
 *        </DataRow>
 *      </DataTable>
 *    Compact density: `settings.density === 'compact'` → put the item code on the name's line.
 *    useDataTable() gives { density, visibleCount } to custom rows/cells.
 * 4. useSlashFocus(searchRef, { onClear: () => setSearch('') }): "/" focuses search, Esc clears then blurs.
 * Do not wrap the toolbar in `overflow: hidden` (the Columns popover would be clipped).
 */
export type { ColumnDef, Density } from './types';
export { clampWidth, DEFAULT_MAX_COLUMN_WIDTH, fitColumnWidths } from './types';
export { useTableSettings, TABLE_SETTINGS_MEDIA_QUERY } from './useTableSettings';
export type { TableSettings } from './useTableSettings';
export { tableSettingsKey, TABLE_SETTINGS_VERSION } from './storage';
export { DataTable, DataRow, DataGroupRow, DataCell, useDataTable, RESIZE_TOOLTIP } from './DataTable';
export { DataTableToolbar, ResultCount, TruncationBanner, DensityToggle, TRUNCATION_MESSAGE } from './Toolbar';
export { ColumnsMenu } from './ColumnsMenu';
export { useSlashFocus } from './useSlashFocus';
