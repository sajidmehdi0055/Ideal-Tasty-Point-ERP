import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../../src/auth/context.js';
import { inventoryTools } from '../../src/ai/tools/inventory-tools.js';
import type { AiReadTool, AiTool } from '../../src/ai/tools/tool.js';
import { GoodsReceiptService } from '../../src/inventory/application/goods-receipt-service.js';
import { PackVariantService } from '../../src/inventory/application/pack-variant-service.js';
import { PurchaseOrderService } from '../../src/inventory/application/purchase-order-service.js';
import { PurchaseRecordService } from '../../src/inventory/application/purchase-record-service.js';
import { StockLocationService } from '../../src/inventory/application/stock-location-service.js';
import { StockService } from '../../src/inventory/application/stock-service.js';
import { SupplierService } from '../../src/inventory/application/supplier-service.js';

const manager: AuthContext = { userId: 'm-1', role: 'MANAGER', branchId: 'branch-7' };
const ID = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;

function setup() {
  const repos = {
    locations: { create: vi.fn(), update: vi.fn(), list: vi.fn().mockResolvedValue([{ id: ID(1), active: true, name: 'Store' }, { id: ID(2), active: false, name: 'Old' }]) },
    stock: { createOpening: vi.fn(), createAdjustment: vi.fn(), listBalances: vi.fn().mockResolvedValue([]), listMovements: vi.fn().mockResolvedValue(Array.from({ length: 80 }, (_, i) => ({ id: String(i) }))) },
    suppliers: { create: vi.fn(), update: vi.fn(), findActiveByName: vi.fn(), list: vi.fn().mockResolvedValue([{ id: ID(3), name: 'Ali Traders', active: true }, { id: ID(4), name: 'Bilal', active: true }, { id: ID(5), name: 'Ali Old', active: false }]) },
    packs: { create: vi.fn(), update: vi.fn(), list: vi.fn().mockResolvedValue([{ id: ID(6), item_id: ID(7), active: true }, { id: ID(8), item_id: ID(9), active: true }]) },
    purchases: { create: vi.fn(), getRateComparison: vi.fn().mockResolvedValue({ current_rate: '100.000000' }), list: vi.fn().mockResolvedValue([{ item_id: ID(7), supplier_id: ID(3) }, { item_id: ID(9), supplier_id: ID(3) }]) },
    pos: { create: vi.fn(), update: vi.fn(), cancel: vi.fn(), close: vi.fn(), list: vi.fn().mockResolvedValue([]), get: vi.fn().mockResolvedValue({ id: ID(1) }) },
    receipts: { create: vi.fn(), get: vi.fn(), list: vi.fn().mockResolvedValue([]) },
  };
  const tools = inventoryTools({
    stockLocations: new StockLocationService(repos.locations), stock: new StockService(repos.stock), suppliers: new SupplierService(repos.suppliers),
    packVariants: new PackVariantService(repos.packs), purchaseRecords: new PurchaseRecordService(repos.purchases),
    purchaseOrders: new PurchaseOrderService(repos.pos), goodsReceipts: new GoodsReceiptService(repos.receipts),
  });
  const tool = (name: string) => tools.find((t: AiTool) => t.name === name) as AiReadTool;
  const run = (name: string, args: unknown, auth: AuthContext = manager) => tool(name).execute(tool(name).input.parse(args), auth);
  return { repos, tools, tool, run };
}

describe('Phase 1 inventory AI tools', () => {
  it('are all READ, reuse the existing Owner/Manager guard and describe themselves', () => {
    const { tools } = setup();
    expect(tools).toHaveLength(10);
    for (const t of tools) {
      expect(t.mode).toBe('READ');
      expect(t.authorize({ userId: 'o', role: 'OWNER', branchId: 'b' })).toBe(true);
      expect(t.authorize(manager)).toBe(true);
      expect(t.authorize({ userId: 'c', role: 'CASHIER', branchId: 'b' })).toBe(false);
      expect(t.description.length).toBeGreaterThan(20);
    }
  });

  it('pass the caller\'s AuthContext to the existing repositories (branch scoping stays in the ERP)', async () => {
    const { repos, run } = setup();
    await run('inventory_get_stock_balances', { location_id: ID(1) });
    expect(repos.stock.listBalances).toHaveBeenCalledWith({ location_id: ID(1) }, manager);
    await run('inventory_compare_purchase_rates', { item_id: ID(7), brand_id: ID(2), pack_variant_id: ID(6) });
    expect(repos.purchases.getRateComparison).toHaveBeenCalledWith({ item_id: ID(7), brand_id: ID(2), pack_variant_id: ID(6) }, manager);
    await run('inventory_get_purchase_order', { purchase_order_id: ID(1) });
    expect(repos.pos.get).toHaveBeenCalledWith(ID(1), manager);
    await run('inventory_list_purchase_orders', { status: 'ISSUED' });
    expect(repos.pos.list).toHaveBeenCalledWith({ status: 'ISSUED' }, manager);
  });

  it('only filter and limit lists (no calculations)', async () => {
    const { run } = setup();
    expect(await run('inventory_list_suppliers', { name_contains: 'ALI' })).toMatchObject({ total_matching: 1, rows: [{ name: 'Ali Traders' }] });
    expect(await run('inventory_list_suppliers', { name_contains: 'ali', include_inactive: true })).toMatchObject({ total_matching: 2 });
    expect(await run('inventory_list_stock_locations', {})).toMatchObject({ total_matching: 1 });
    expect(await run('inventory_get_stock_movements', {})).toMatchObject({ total_matching: 80, returned: 50, truncated: true });
    expect(await run('inventory_get_stock_movements', { limit: 5 })).toMatchObject({ returned: 5 });
    expect(await run('inventory_list_pack_variants', { item_id: ID(7) })).toMatchObject({ total_matching: 1, rows: [{ id: ID(6) }] });
    expect(await run('inventory_get_purchase_history', { item_id: ID(9) })).toMatchObject({ total_matching: 1 });
  });

  it('validate arguments strictly', () => {
    const { tool } = setup();
    expect(tool('inventory_get_stock_balances').input.safeParse({ item_id: 'not-a-uuid' }).success).toBe(false);
    expect(tool('inventory_get_stock_balances').input.safeParse({ sql: 'x' }).success).toBe(false);
    expect(tool('inventory_get_stock_movements').input.safeParse({ limit: 1000 }).success).toBe(false);
    expect(tool('inventory_compare_purchase_rates').input.safeParse({ item_id: ID(1) }).success).toBe(false);
  });

  it('still enforce the service guard even if called directly with a non-permitted role', async () => {
    const { run } = setup();
    await expect(run('inventory_list_suppliers', {}, { userId: 'c', role: 'CASHIER', branchId: 'b' })).rejects.toMatchObject({ status: 403 });
  });
});
