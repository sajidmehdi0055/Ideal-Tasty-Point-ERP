import type { StockLocation } from './types';

export interface LocationRow {
  location: StockLocation;
  /** 0 = store / kitchen, 1 = freezer shown under its parent. */
  depth: 0 | 1;
  parent: StockLocation | undefined;
}

const byName = (a: StockLocation, b: StockLocation) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

/**
 * Stores and kitchens by name, each followed by its freezers (UI-STOCK-001
 * L1). A freezer whose parent is missing from the list (should not happen —
 * the server only allows an active STORE/KITCHEN parent in the same branch)
 * is still shown, at the end, so no location is ever silently hidden.
 */
export function orderLocationTree(locations: StockLocation[]): LocationRow[] {
  const byId = new Map(locations.map(location => [location.id, location]));
  const children = new Map<string, StockLocation[]>();
  const roots: StockLocation[] = [];
  const orphans: StockLocation[] = [];

  for (const location of locations) {
    if (location.parent_id === null) {
      roots.push(location);
    } else if (byId.has(location.parent_id)) {
      const list = children.get(location.parent_id) ?? [];
      list.push(location);
      children.set(location.parent_id, list);
    } else {
      orphans.push(location);
    }
  }

  const rows: LocationRow[] = [];
  for (const root of roots.sort(byName)) {
    rows.push({ location: root, depth: 0, parent: undefined });
    for (const child of (children.get(root.id) ?? []).sort(byName)) {
      rows.push({ location: child, depth: 1, parent: root });
    }
  }
  for (const orphan of orphans.sort(byName)) {
    rows.push({ location: orphan, depth: 1, parent: undefined });
  }
  return rows;
}

/** "Main Store › Freezer 1" for a freezer, the plain name otherwise. */
export function locationPath(location: { name: string; parent_id: string | null }, byId: Map<string, StockLocation>): string {
  const parent = location.parent_id ? byId.get(location.parent_id) : undefined;
  return parent ? `${parent.name} › ${location.name}` : location.name;
}
