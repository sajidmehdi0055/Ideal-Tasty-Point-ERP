import type { AiToolCall, AiToolCallStatus } from './types';

/** Approved Figma board 104:3288 — tool name → "ERP data used" chip label. */
const TOOL_LABELS: Record<string, string> = {
  inventory_get_stock_balances: 'Stock balances',
  inventory_get_stock_movements: 'Stock ledger',
  inventory_list_stock_locations: 'Stock locations',
  inventory_list_suppliers: 'Suppliers',
  inventory_list_pack_variants: 'Pack variants',
  inventory_compare_purchase_rates: 'Rate comparison',
  inventory_get_purchase_history: 'Purchase history',
  inventory_list_purchase_orders: 'Purchase orders',
  inventory_get_purchase_order: 'Purchase orders',
  inventory_list_goods_receipts: 'Goods receipts',
};

/** A tool the board does not list (a later slice) shows its raw name rather than a guessed label. */
export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

export type ChipTone = 'success' | 'denied' | 'failed' | 'proposed';

export function chipTone(status: AiToolCallStatus): ChipTone {
  switch (status) {
    case 'SUCCESS':
      return 'success';
    case 'DENIED':
      return 'denied';
    case 'PROPOSED':
      return 'proposed';
    default:
      return 'failed';
  }
}

export interface ToolChip {
  label: string;
  tone: ChipTone;
}

/**
 * One chip per (label, outcome). Two calls of the same tool, or the two
 * purchase-order tools, collapse into one chip; a failed and a successful
 * call of the same tool stay separate so a failure is never hidden.
 */
export function toolChips(calls: readonly AiToolCall[]): ToolChip[] {
  const seen = new Set<string>();
  const chips: ToolChip[] = [];
  for (const call of calls) {
    const chip = { label: toolLabel(call.name), tone: chipTone(call.status) };
    const key = `${chip.label}|${chip.tone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push(chip);
  }
  return chips;
}

/** Status pill / meta-line name for the provider reported by the backend. */
export function providerLabel(provider: string | undefined): string {
  if (!provider) return 'AI model';
  return provider === 'local' ? 'Local model' : 'Cloud model';
}
