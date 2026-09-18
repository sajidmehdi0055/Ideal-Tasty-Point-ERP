/**
 * Mirrors backend/src/inventory/domain/item.ts and the API contract in
 * backend/README.md on `main` (stable S-01) exactly. Do not add fields the
 * stable backend does not accept — see
 * docs/engineering/inventory-s01-implementation.md for the authoritative
 * contract. In particular `base_uom` is plain text on this stable
 * contract; it only becomes a UOM Master lookup on the unmerged S-02
 * branch, which this frontend slice does not depend on.
 */
export const PRIMARY_ITEM_TYPES = [
  'RAW_MATERIAL',
  'WIP_SEMI_FINISHED',
  'FINISHED_SELLING_PRODUCT',
  'DIRECT_PURCHASE_SALE',
] as const;

export type PrimaryItemType = (typeof PRIMARY_ITEM_TYPES)[number];

export const PRIMARY_ITEM_TYPE_LABELS: Record<PrimaryItemType, string> = {
  RAW_MATERIAL: 'Raw material',
  WIP_SEMI_FINISHED: 'WIP / semi-finished',
  FINISHED_SELLING_PRODUCT: 'Finished selling product',
  DIRECT_PURCHASE_SALE: 'Direct purchase & sale',
};

/** The approved non-branded sentinel value (ADR-0003). */
export const GENERIC_BRAND = 'Generic / No Brand';

export interface ItemInput {
  item_name: string;
  primary_item_type: PrimaryItemType;
  base_uom: string;
  brand: string;
}

export interface Item extends ItemInput {
  id: string;
  item_code: string;
  branch_id: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}
