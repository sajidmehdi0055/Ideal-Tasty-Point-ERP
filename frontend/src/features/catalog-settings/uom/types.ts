/**
 * Mirrors backend/src/inventory/domain/uom.ts and the API contract in
 * backend/README.md's "UOM Master" section exactly (S-02, live on main).
 */
export const UNIT_TYPES = ['WEIGHT', 'VOLUME', 'COUNT', 'PACKAGING'] as const;

export type UnitType = (typeof UNIT_TYPES)[number];

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  WEIGHT: 'Weight',
  VOLUME: 'Volume',
  COUNT: 'Count',
  PACKAGING: 'Packaging',
};

export interface UomInput {
  name: string;
  unit_type: UnitType;
}

export interface Uom extends UomInput {
  id: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}
