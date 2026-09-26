interface Breadcrumb {
  title: string;
  crumbs: string[];
}

export function getBreadcrumb(pathname: string): Breadcrumb {
  if (pathname === '/items') return { title: 'Item Master', crumbs: ['Inventory', 'Item Master'] };
  if (pathname === '/items/new') return { title: 'New item', crumbs: ['Inventory', 'Item Master', 'New item'] };
  if (/^\/items\/[^/]+\/edit$/.test(pathname)) {
    return { title: 'Edit item', crumbs: ['Inventory', 'Item Master', 'Edit item'] };
  }
  if (pathname === '/catalog-settings') return { title: 'Catalog Settings', crumbs: ['Inventory', 'Catalog Settings'] };
  if (pathname === '/suppliers') return { title: 'Suppliers', crumbs: ['Purchasing', 'Suppliers'] };
  if (pathname === '/purchases') return { title: 'Purchases & Rates', crumbs: ['Purchasing', 'Purchases & Rates'] };
  if (pathname === '/stock/locations') return { title: 'Stock Locations', crumbs: ['Stock', 'Stock Locations'] };
  if (pathname === '/stock/ledger') return { title: 'Stock Ledger', crumbs: ['Stock', 'Stock Ledger'] };
  return { title: 'Ideal Tasty Point ERP', crumbs: [] };
}
