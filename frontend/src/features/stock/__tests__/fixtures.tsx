import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DevSessionProvider, type DevRole } from '../../../lib/session';
import { DEV_IDENTITY_STORAGE_KEY } from '../../../lib/dev-session';
import type { StockBalance, StockLocation, StockMovement } from '../types';

const T = '2026-09-26T00:00:00Z';

export function location(
  id: string,
  name: string,
  type: StockLocation['location_type'],
  parent: string | null = null,
  active = true,
): StockLocation {
  return { id, branch_id: 'branch-main', name, location_type: type, parent_id: parent, active, created_at: T, updated_at: T };
}

export const MAIN = location('loc-main', 'Main Store', 'STORE');
export const FREEZER_1 = location('loc-f1', 'Freezer 1', 'FREEZER', 'loc-main');
export const FREEZER_2 = location('loc-f2', 'Freezer 2', 'FREEZER', 'loc-main');
export const LOWER = location('loc-lower', 'Lower Kitchen', 'KITCHEN');
export const LOWER_FREEZER_B = location('loc-lfb', 'Lower Kitchen Freezer B', 'FREEZER', 'loc-lower', false);
export const OLD_STORE = location('loc-old', 'Old Store', 'STORE', null, false);
export const LOCATIONS = [MAIN, FREEZER_1, FREEZER_2, LOWER, LOWER_FREEZER_B, OLD_STORE];

export function balance(
  itemId: string,
  name: string,
  code: string,
  uom: string,
  loc: StockLocation,
  quantity: string,
): StockBalance {
  return {
    item_id: itemId,
    item_code: code,
    item_name: name,
    base_uom: uom,
    location_id: loc.id,
    location_name: loc.name,
    quantity,
  };
}

export const OIL_MAIN = balance('item-oil', 'Cooking Oil', 'CO-001', 'LITER', MAIN, '72.000000');
export const RICE_MAIN = balance('item-rice', 'Basmati Rice', 'RC-001', 'KG', MAIN, '125.000000');
export const SUGAR_MAIN_ZERO = balance('item-sugar', 'Sugar', 'SG-001', 'KG', MAIN, '0.000000');
export const CHICKEN_F1 = balance('item-chicken', 'Chicken Breast', 'CH-003', 'KG', FREEZER_1, '38.500000');
export const OIL_LOWER = balance('item-oil', 'Cooking Oil', 'CO-001', 'LITER', LOWER, '14.500000');
export const BALANCES = [OIL_MAIN, RICE_MAIN, SUGAR_MAIN_ZERO, CHICKEN_F1, OIL_LOWER];

export function movement(
  id: string,
  itemId: string,
  loc: StockLocation,
  type: StockMovement['movement_type'],
  delta: string,
  reason: string | null,
  createdAt: string,
): StockMovement {
  return { id, item_id: itemId, location_id: loc.id, movement_type: type, quantity_delta: delta, reason, created_at: createdAt };
}

export function setRole(role: DevRole) {
  window.localStorage.setItem(DEV_IDENTITY_STORAGE_KEY, JSON.stringify({ userId: 'u', role, branchId: 'branch-main' }));
}

export function renderWithSession(ui: ReactNode) {
  return render(
    <DevSessionProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </DevSessionProvider>,
  );
}
