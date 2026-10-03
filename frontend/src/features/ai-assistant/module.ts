import type { AiModule } from './types';

const MODULE_LABELS: Record<AiModule, string> = {
  inventory: 'Inventory',
  purchasing: 'Purchasing',
  stock: 'Stock',
};

/**
 * The chat request's `module` hint comes from the screen the user is on
 * (UI-AI-001 decision). Mirrors the sidebar sections (app/shell/nav-items.ts):
 * Item Master + Catalog Settings → inventory, Suppliers + Purchases →
 * purchasing, Stock Locations / Ledger → stock. Any other route sends no hint.
 */
export function moduleForPath(pathname: string): AiModule | undefined {
  if (pathname === '/items' || pathname.startsWith('/items/')) return 'inventory';
  if (pathname === '/catalog-settings') return 'inventory';
  if (pathname === '/suppliers' || pathname === '/purchases') return 'purchasing';
  if (pathname === '/stock' || pathname.startsWith('/stock/')) return 'stock';
  return undefined;
}

export function moduleLabel(module: AiModule): string {
  return MODULE_LABELS[module];
}
