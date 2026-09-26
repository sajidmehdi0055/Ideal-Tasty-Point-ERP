import type { ComponentType, SVGProps } from 'react';
import {
  BoxesIcon,
  PackageIcon,
  ReceiptTextIcon,
  SlidersHorizontalIcon,
  TruckIcon,
  WarehouseIcon,
} from '../../design-system/icons';

export interface NavItem {
  to: string;
  label: string;
  pending: boolean;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

// UI-UOM-001: sections match the approved Figma sidebar (node 4:2) — Item
// Master and Catalog Settings (UOM Master live, Brands/Pack Variants tabs
// pending) under Inventory, plus placeholder-only Purchasing and Stock
// sections whose screens are not built in this slice.
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Inventory',
    items: [
      { to: '/items', label: 'Item Master', pending: false, icon: PackageIcon },
      { to: '/catalog-settings', label: 'Catalog Settings', pending: false, icon: SlidersHorizontalIcon },
    ],
  },
  {
    label: 'Purchasing',
    items: [
      { to: '/suppliers', label: 'Suppliers', pending: true, icon: TruckIcon },
      { to: '/purchases', label: 'Purchases & Rates', pending: true, icon: ReceiptTextIcon },
    ],
  },
  {
    label: 'Stock',
    items: [
      { to: '/stock/locations', label: 'Stock Locations', pending: true, icon: WarehouseIcon },
      { to: '/stock/ledger', label: 'Stock Ledger', pending: true, icon: BoxesIcon },
    ],
  },
];
