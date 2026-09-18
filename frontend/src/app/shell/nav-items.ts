export interface NavItem {
  to: string;
  label: string;
  pending: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/items', label: 'Item Master', pending: false },
  { to: '/uom', label: 'UOM Master', pending: true },
  { to: '/brands', label: 'Brands', pending: true },
  { to: '/pack-variants', label: 'Pack Variants', pending: true },
];
