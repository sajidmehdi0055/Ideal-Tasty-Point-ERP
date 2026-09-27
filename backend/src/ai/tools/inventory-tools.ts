import { z } from 'zod';
import type { AuthContext } from '../../auth/context.js';
import { requireItemEditor } from '../../auth/context.js';
import type { GoodsReceiptService } from '../../inventory/application/goods-receipt-service.js';
import type { PackVariantService } from '../../inventory/application/pack-variant-service.js';
import type { PurchaseOrderService } from '../../inventory/application/purchase-order-service.js';
import type { PurchaseRecordService } from '../../inventory/application/purchase-record-service.js';
import type { StockLocationService } from '../../inventory/application/stock-location-service.js';
import type { StockService } from '../../inventory/application/stock-service.js';
import type { SupplierService } from '../../inventory/application/supplier-service.js';
import { PURCHASE_ORDER_STATUSES } from '../../inventory/domain/purchase-order.js';
import type { AiTool } from './tool.js';
import { readTool } from './tool.js';

export interface InventoryToolServices {
  stockLocations: StockLocationService;
  stock: StockService;
  suppliers: SupplierService;
  packVariants: PackVariantService;
  purchaseRecords: PurchaseRecordService;
  purchaseOrders: PurchaseOrderService;
  goodsReceipts: GoodsReceiptService;
}

/**
 * Same rule as every Inventory/Purchasing endpoint today (OWNER or MANAGER):
 * reuses the existing guard instead of re-typing role lists (ADR-0011 D-04).
 * The services called below apply the guard and branch scoping again.
 */
function inventoryReader(auth: AuthContext): boolean {
  try {
    requireItemEditor(auth);
    return true;
  } catch {
    return false;
  }
}

const limitSchema = z.number().int().min(1).max(200).optional().describe('Maximum rows to return (default 50).');
const searchSchema = z.string().trim().min(1).max(100).optional();

/**
 * Presentation-only list shaping for the model: optional case-insensitive text
 * filter and a row limit. No business calculation happens here (ADR-0011 D-06).
 */
function shape<T>(rows: T[], limit: number | undefined, text?: (row: T) => string, needle?: string) {
  const lowered = needle?.toLowerCase();
  const filtered = lowered && text ? rows.filter(row => text(row).toLowerCase().includes(lowered)) : rows;
  const max = limit ?? 50;
  return { total_matching: filtered.length, returned: Math.min(filtered.length, max), truncated: filtered.length > max, rows: filtered.slice(0, max) };
}

export function inventoryTools(services: InventoryToolServices): AiTool[] {
  return [
    readTool({
      name: 'inventory_list_stock_locations',
      description: 'List stock locations (stores, kitchens, freezers) of the user\'s branch with their ids, type, parent and active flag.',
      mode: 'READ',
      input: z.object({ include_inactive: z.boolean().optional() }).strict(),
      authorize: inventoryReader,
      async execute(input, auth) {
        const rows = await services.stockLocations.list(auth);
        return shape(input.include_inactive ? rows : rows.filter(row => row.active), 200);
      },
    }),
    readTool({
      name: 'inventory_get_stock_balances',
      description: 'Current stock quantity per item and location (in each item\'s base UOM), calculated by the ERP from the stock ledger. Filter by item_id, location_id, or part of the item name/code.',
      mode: 'READ',
      input: z.object({
        item_id: z.uuid().optional(),
        location_id: z.uuid().optional(),
        item_name_contains: searchSchema.describe('Case-insensitive part of the item name or item code.'),
        limit: limitSchema,
      }).strict(),
      authorize: inventoryReader,
      async execute(input, auth) {
        const rows = await services.stock.listBalances({ item_id: input.item_id, location_id: input.location_id }, auth);
        return shape(rows, input.limit, row => `${row.item_name} ${row.item_code}`, input.item_name_contains);
      },
    }),
    readTool({
      name: 'inventory_get_stock_movements',
      description: 'Stock ledger entries (OPENING, ADJUSTMENT, RECEIPT), newest first. Filter by item_id and/or location_id.',
      mode: 'READ',
      input: z.object({ item_id: z.uuid().optional(), location_id: z.uuid().optional(), limit: limitSchema }).strict(),
      authorize: inventoryReader,
      async execute(input, auth) {
        const rows = await services.stock.listMovements({ item_id: input.item_id, location_id: input.location_id }, auth);
        return shape(rows, input.limit);
      },
    }),
    readTool({
      name: 'inventory_list_suppliers',
      description: 'List suppliers (id, name, CASH/CREDIT type, active). Optional name search.',
      mode: 'READ',
      input: z.object({ name_contains: searchSchema, include_inactive: z.boolean().optional(), limit: limitSchema }).strict(),
      authorize: inventoryReader,
      async execute(input, auth) {
        const rows = await services.suppliers.list(auth);
        return shape(input.include_inactive ? rows : rows.filter(row => row.active), input.limit, row => row.name, input.name_contains);
      },
    }),
    readTool({
      name: 'inventory_list_pack_variants',
      description: 'Pack variants (item + brand + pack UOM + conversion factor to base UOM). Use it to find the item_id, brand_id and pack_variant_id needed for rate comparison.',
      mode: 'READ',
      input: z.object({ item_id: z.uuid().optional(), include_inactive: z.boolean().optional(), limit: limitSchema }).strict(),
      authorize: inventoryReader,
      async execute(input, auth) {
        const rows = (await services.packVariants.list(auth))
          .filter(row => (input.include_inactive || row.active) && (!input.item_id || row.item_id === input.item_id));
        return shape(rows, input.limit);
      },
    }),
    readTool({
      name: 'inventory_compare_purchase_rates',
      description: 'ERP rate comparison for one item + brand + pack variant: current and previous rate, last-3 average, rate per base UOM, percentage change and per-supplier breakdown.',
      mode: 'READ',
      input: z.object({ item_id: z.uuid(), brand_id: z.uuid(), pack_variant_id: z.uuid() }).strict(),
      authorize: inventoryReader,
      async execute(input, auth) {
        return services.purchaseRecords.rateComparison(input, auth);
      },
    }),
    readTool({
      name: 'inventory_get_purchase_history',
      description: 'Purchase records (supplier, item, brand, pack variant, quantity, rate, purchase date), newest first. Filter by item_id and/or supplier_id.',
      mode: 'READ',
      input: z.object({ item_id: z.uuid().optional(), supplier_id: z.uuid().optional(), limit: limitSchema }).strict(),
      authorize: inventoryReader,
      async execute(input, auth) {
        const rows = (await services.purchaseRecords.list(auth))
          .filter(row => (!input.item_id || row.item_id === input.item_id) && (!input.supplier_id || row.supplier_id === input.supplier_id));
        return shape(rows, input.limit);
      },
    }),
    readTool({
      name: 'inventory_list_purchase_orders',
      description: 'Purchase orders of the branch (PO number, supplier, order date, status, line and receipt counts), newest first. Optional status filter.',
      mode: 'READ',
      input: z.object({ status: z.enum(PURCHASE_ORDER_STATUSES).optional(), limit: limitSchema }).strict(),
      authorize: inventoryReader,
      async execute(input, auth) {
        const rows = await services.purchaseOrders.list(input.status ? { status: input.status } : {}, auth);
        return shape(rows, input.limit);
      },
    }),
    readTool({
      name: 'inventory_get_purchase_order',
      description: 'One purchase order with its lines (ordered, received, pending and excess quantity in packs) and linked goods receipts.',
      mode: 'READ',
      input: z.object({ purchase_order_id: z.uuid() }).strict(),
      authorize: inventoryReader,
      async execute(input, auth) {
        return services.purchaseOrders.get(input.purchase_order_id, auth);
      },
    }),
    readTool({
      name: 'inventory_list_goods_receipts',
      description: 'Goods receipts (supplier, location, receipt date, bill number, linked PO, line count), newest first.',
      mode: 'READ',
      input: z.object({ limit: limitSchema }).strict(),
      authorize: inventoryReader,
      async execute(input, auth) {
        return shape(await services.goodsReceipts.list(auth), input.limit);
      },
    }),
  ];
}
