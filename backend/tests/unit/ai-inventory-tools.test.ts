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
import { StockTransferService } from '../../src/inventory/application/stock-transfer-service.js';
import { SupplierService } from '../../src/inventory/application/supplier-service.js';

const manager: AuthContext = { userId: 'm-1', role: 'MANAGER', branchId: 'branch-7' };
const ID = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;
// Shape returned by StockTransferRepository.get (NUMERIC values as strings).
const TRANSFER = {
  id: ID(5), transfer_number: 'TRF-000001', branch_id: 'branch-7', from_location_id: ID(1), to_location_id: ID(2), status: 'RECEIVED', status_reason: null,
  created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T12:00:00.000Z',
  lines: [{ id: ID(6), line_no: 1, item_id: ID(7), sent_quantity: '10.000000', out_movement_id: ID(8), received_quantity: '9.500000', variance_quantity: '0.500000', variance_reason: 'spilled', in_movement_id: ID(9), return_movement_id: null }],
};

function setup() {
  const repos = {
    locations: { create: vi.fn(), update: vi.fn(), list: vi.fn().mockResolvedValue([{ id: ID(1), active: true, name: 'Store' }, { id: ID(2), active: false, name: 'Old' }]) },
    stock: { createOpening: vi.fn(), createAdjustment: vi.fn(), listBalances: vi.fn().mockResolvedValue([]), listMovements: vi.fn().mockResolvedValue(Array.from({ length: 80 }, (_, i) => ({ id: String(i) }))) },
    suppliers: { create: vi.fn(), update: vi.fn(), findActiveByName: vi.fn(), list: vi.fn().mockResolvedValue([{ id: ID(3), name: 'Ali Traders', active: true }, { id: ID(4), name: 'Bilal', active: true }, { id: ID(5), name: 'Ali Old', active: false }]) },
    packs: { create: vi.fn(), update: vi.fn(), list: vi.fn().mockResolvedValue([{ id: ID(6), item_id: ID(7), active: true }, { id: ID(8), item_id: ID(9), active: true }]) },
    purchases: { create: vi.fn(), getRateComparison: vi.fn().mockResolvedValue({ current_rate: '100.000000' }), list: vi.fn().mockResolvedValue([{ item_id: ID(7), supplier_id: ID(3) }, { item_id: ID(9), supplier_id: ID(3) }]) },
    pos: { create: vi.fn(), update: vi.fn(), cancel: vi.fn(), close: vi.fn(), list: vi.fn().mockResolvedValue([]), get: vi.fn().mockResolvedValue({ id: ID(1) }) },
    receipts: { create: vi.fn(), get: vi.fn(), list: vi.fn().mockResolvedValue([]) },
    transfers: {
      send: vi.fn(), receive: vi.fn(), cancel: vi.fn(),
      list: vi.fn().mockResolvedValue(Array.from({ length: 60 }, (_, i) => ({ id: String(i), status: 'SENT' }))),
      get: vi.fn().mockResolvedValue(TRANSFER),
    },
  };
  const tools = inventoryTools({
    stockLocations: new StockLocationService(repos.locations), stock: new StockService(repos.stock), suppliers: new SupplierService(repos.suppliers),
    packVariants: new PackVariantService(repos.packs), purchaseRecords: new PurchaseRecordService(repos.purchases),
    purchaseOrders: new PurchaseOrderService(repos.pos), goodsReceipts: new GoodsReceiptService(repos.receipts),
    stockTransfers: new StockTransferService(repos.transfers),
  });
  const tool = (name: string) => tools.find((t: AiTool) => t.name === name) as AiReadTool;
  const run = (name: string, args: unknown, auth: AuthContext = manager) => tool(name).execute(tool(name).input.parse(args), auth);
  return { repos, tools, tool, run };
}

describe('Inventory AI tools (Phase 1 + AI-S03 stock transfers)', () => {
  it('are all READ, reuse the existing Owner/Manager guard and describe themselves', () => {
    const { tools } = setup();
    expect(tools).toHaveLength(12);
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

describe('AI-S03 stock transfer tools', () => {
  const cashier: AuthContext = { userId: 'c', role: 'CASHIER', branchId: 'branch-7' };
  const names = ['inventory_list_stock_transfers', 'inventory_get_stock_transfer'];

  it('exist as READ tools behind the Owner/Manager guard, with descriptions that explain in-transit and variance', () => {
    const { tool } = setup();
    for (const name of names) {
      expect(tool(name).mode).toBe('READ');
      expect(tool(name).authorize({ userId: 'o', role: 'OWNER', branchId: 'b' })).toBe(true);
      expect(tool(name).authorize(manager)).toBe(true);
      expect(tool(name).authorize(cashier)).toBe(false);
      expect(tool(name).authorize(null as never)).toBe(false);
    }
    expect(tool('inventory_list_stock_transfers').description).toMatch(/SENT = dispatched .* in transit/);
    expect(tool('inventory_get_stock_transfer').description).toMatch(/variance_quantity is the shortage .*sent minus received/);
    expect(tool('inventory_get_stock_transfer').description).toMatch(/status_reason \(the cancel reason; set only for CANCELLED\)/);
    expect(tool('inventory_get_stock_transfer').description).toContain('include_inactive: true');
  });

  it('call StockTransferService with the caller\'s AuthContext and return its data unchanged (decimal strings, no recalculation)', async () => {
    const { repos, run } = setup();
    await run('inventory_list_stock_transfers', {});
    expect(repos.transfers.list).toHaveBeenLastCalledWith({}, manager);
    await run('inventory_list_stock_transfers', { status: 'SENT' });
    expect(repos.transfers.list).toHaveBeenLastCalledWith({ status: 'SENT' }, manager);
    const got = await run('inventory_get_stock_transfer', { stock_transfer_id: ID(5) });
    expect(repos.transfers.get).toHaveBeenCalledWith(ID(5), manager);
    expect(got).toEqual(TRANSFER);
    expect(repos.transfers.send).not.toHaveBeenCalled();
    expect(repos.transfers.receive).not.toHaveBeenCalled();
    expect(repos.transfers.cancel).not.toHaveBeenCalled();
  });

  it('only limit the list (default 50, max 200)', async () => {
    const { run } = setup();
    expect(await run('inventory_list_stock_transfers', {})).toMatchObject({ total_matching: 60, returned: 50, truncated: true });
    // Exact output: the tool adds nothing (no derived totals) beyond the list envelope.
    expect(await run('inventory_list_stock_transfers', { status: 'SENT', limit: 3 })).toEqual({
      total_matching: 60, returned: 3, truncated: true, rows: [{ id: '0', status: 'SENT' }, { id: '1', status: 'SENT' }, { id: '2', status: 'SENT' }],
    });
  });

  it('validate arguments strictly', () => {
    const { tool } = setup();
    const list = tool('inventory_list_stock_transfers').input;
    const get = tool('inventory_get_stock_transfer').input;
    expect(list.safeParse({}).success).toBe(true);
    for (const status of ['SENT', 'RECEIVED', 'CANCELLED']) expect(list.safeParse({ status }).success).toBe(true);
    for (const bad of [{ status: 'IN_TRANSIT' }, { status: 'sent' }, { limit: 0 }, { limit: 201 }, { limit: 2.5 }, { branch_id: 'branch-x' }, { location_id: ID(1) }]) {
      expect(list.safeParse(bad).success).toBe(false);
    }
    expect(get.safeParse({ stock_transfer_id: ID(5) }).success).toBe(true);
    for (const bad of [{}, { stock_transfer_id: 'TRF-000001' }, { id: ID(5) }, { stock_transfer_id: ID(5), branch_id: 'branch-x' }]) {
      expect(get.safeParse(bad).success).toBe(false);
    }
  });

  it('a not-found transfer surfaces the service error (no fake result)', async () => {
    const { repos, run } = setup();
    repos.transfers.get.mockResolvedValueOnce(null);
    await expect(run('inventory_get_stock_transfer', { stock_transfer_id: ID(4) })).rejects.toMatchObject({ status: 404, code: 'TRANSFER_NOT_FOUND' });
  });

  it('still enforce the service guard if called directly with a non-permitted role', async () => {
    const { repos, run } = setup();
    await expect(run('inventory_list_stock_transfers', {}, cashier)).rejects.toMatchObject({ status: 403 });
    await expect(run('inventory_get_stock_transfer', { stock_transfer_id: ID(5) }, cashier)).rejects.toMatchObject({ status: 403 });
    expect(repos.transfers.list).not.toHaveBeenCalled();
    expect(repos.transfers.get).not.toHaveBeenCalled();
  });
});
