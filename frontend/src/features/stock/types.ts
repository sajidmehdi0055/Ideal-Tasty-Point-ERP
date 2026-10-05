// Types mirror the backend contract on main (S-04 + S-05/S-07 movement types,
// ADR-0008): backend/src/inventory/domain/stock-location.ts and stock.ts.
// Quantities are decimal strings in the item's Base UOM — never JSON numbers.

export const LOCATION_TYPES = ['STORE', 'KITCHEN', 'FREEZER'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  STORE: 'Store',
  KITCHEN: 'Kitchen',
  FREEZER: 'Freezer',
};

export interface StockLocation {
  id: string;
  branch_id: string;
  name: string;
  location_type: LocationType;
  parent_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockLocationInput {
  name: string;
  location_type: LocationType;
  parent_id?: string;
}

export interface StockLocationPatch {
  name?: string;
  active?: boolean;
}

export const MOVEMENT_TYPES = [
  'OPENING',
  'ADJUSTMENT',
  'RECEIPT',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'TRANSFER_RETURN',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export interface StockMovement {
  id: string;
  item_id: string;
  location_id: string;
  movement_type: MovementType;
  quantity_delta: string;
  reason: string | null;
  created_at: string;
}

export interface StockBalance {
  item_id: string;
  item_code: string;
  item_name: string;
  base_uom: string;
  location_id: string;
  location_name: string;
  quantity: string;
}

export interface StockQuery {
  item_id?: string;
  location_id?: string;
}

export interface StockAdjustmentInput {
  item_id: string;
  location_id: string;
  quantity_delta: string;
  reason: string;
}
