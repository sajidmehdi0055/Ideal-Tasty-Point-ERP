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
  if (pathname === '/uom') return { title: 'UOM Master', crumbs: ['Inventory', 'UOM Master'] };
  if (pathname === '/brands') return { title: 'Brands', crumbs: ['Inventory', 'Brands'] };
  if (pathname === '/pack-variants') return { title: 'Pack Variants', crumbs: ['Inventory', 'Pack Variants'] };
  return { title: 'Ideal Tasty Point ERP', crumbs: [] };
}
