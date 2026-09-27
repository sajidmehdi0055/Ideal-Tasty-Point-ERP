import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { AuthContext } from '../../src/auth/context.js';
import { PgAiAuditSink } from '../../src/ai/audit.js';
import type { AiAuditEntry } from '../../src/ai/audit.js';
import { PgItemRepository } from '../../src/inventory/persistence/pg-item-repository.js';
import { PgUomRepository } from '../../src/inventory/persistence/pg-uom-repository.js';
import { PgBrandRepository } from '../../src/inventory/persistence/pg-brand-repository.js';
import { PgPackVariantRepository } from '../../src/inventory/persistence/pg-pack-variant-repository.js';
import { PgSupplierRepository } from '../../src/inventory/persistence/pg-supplier-repository.js';
import { PgPurchaseRecordRepository } from '../../src/inventory/persistence/pg-purchase-record-repository.js';
import { PgStockLocationRepository } from '../../src/inventory/persistence/pg-stock-location-repository.js';
import { PgStockRepository } from '../../src/inventory/persistence/pg-stock-repository.js';
import { PgGoodsReceiptRepository } from '../../src/inventory/persistence/pg-goods-receipt-repository.js';
import { PgPurchaseOrderRepository } from '../../src/inventory/persistence/pg-purchase-order-repository.js';
import { answer, callTool, FakeProvider, testAiConfig } from '../helpers/ai-fakes.js';
import { applyRuntimeGrants } from './helpers/runtime-grants.js';
import { runAuthoritativeMigrate } from './helpers/migrate-cli.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required for real PostgreSQL integration tests');

describe('AI-S01 audit log and tools (real PostgreSQL)', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const schema = `ai_s01_test_${suffix}`;
  const role = `ai_s01_app_${suffix}`;
  const admin = new Pool({ connectionString, options: `-c search_path=${schema}` });
  const runtime = new Pool({ connectionString, options: `-c search_path=${schema} -c role=${role}`, max: 6 });
  const items = new PgItemRepository(runtime);
  const locations = new PgStockLocationRepository(runtime);
  const stock = new PgStockRepository(runtime);
  const sink = new PgAiAuditSink(runtime);
  const ownerA: AuthContext = { userId: 'owner-a', role: 'OWNER', branchId: 'branch-a' };
  const managerB: AuthContext = { userId: 'manager-b', role: 'MANAGER', branchId: 'branch-b' };
  const uniq = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

  function buildAiApp(auth: AuthContext, provider: FakeProvider) {
    return buildApp({
      repository: items, uomRepository: new PgUomRepository(runtime), brandRepository: new PgBrandRepository(runtime),
      packVariantRepository: new PgPackVariantRepository(runtime), supplierRepository: new PgSupplierRepository(runtime),
      purchaseRecordRepository: new PgPurchaseRecordRepository(runtime), stockLocationRepository: locations, stockRepository: stock,
      goodsReceiptRepository: new PgGoodsReceiptRepository(runtime), purchaseOrderRepository: new PgPurchaseOrderRepository(runtime),
      authProvider: async () => auth,
      ai: { config: { state: 'READY', config: testAiConfig() }, auditSink: sink, providerFactory: () => provider },
    });
  }

  const entry = (overrides: Partial<AiAuditEntry> = {}): AiAuditEntry => ({
    requestId: randomUUID(), conversationId: null, auth: ownerA, eventType: 'CHAT', provider: 'local', model: 'm', promptVersion: 'erp-ai-v1',
    toolName: null, toolMode: null, toolParams: null, permissionResult: null, approvalStatus: 'NOT_REQUIRED', outcome: 'SUCCESS',
    errorCode: null, durationMs: 12, details: { rounds: 1 }, ...overrides,
  });

  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await runAuthoritativeMigrate(connectionString, schema);
    await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    await applyRuntimeGrants(admin, role, schema);
  });
  afterAll(async () => { await runtime.end(); await admin.end(); });

  it('the runtime role can insert audit rows but cannot read, update or delete them', async () => {
    const requestId = randomUUID();
    await sink.record(entry({ requestId }));
    const rows = (await admin.query('SELECT * FROM ai_audit_log WHERE request_id = $1', [requestId])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_id: 'owner-a', actor_role: 'OWNER', branch_id: 'branch-a', event_type: 'CHAT', outcome: 'SUCCESS', duration_ms: 12, details: { rounds: 1 } });
    await expect(runtime.query('SELECT * FROM ai_audit_log')).rejects.toMatchObject({ code: '42501' });
    await expect(runtime.query('UPDATE ai_audit_log SET outcome = $1', ['ERROR'])).rejects.toMatchObject({ code: '42501' });
    await expect(runtime.query('DELETE FROM ai_audit_log')).rejects.toMatchObject({ code: '42501' });
  });

  it('audit rows are immutable even for the schema owner', async () => {
    await expect(admin.query(`UPDATE ai_audit_log SET outcome = 'ERROR'`)).rejects.toThrow(/append-only/);
    await expect(admin.query('DELETE FROM ai_audit_log')).rejects.toThrow(/append-only/);
    await expect(admin.query('TRUNCATE ai_audit_log')).rejects.toThrow(/append-only/);
  });

  it('model text with NUL characters never breaks the audit insert', async () => {
    const provider = new FakeProvider([{ text: '', toolCalls: [
      { id: 'a', name: 'inventory_list_suppliers', arguments: { name_contains: 'al\u0000i' } },
      { id: 'b', name: 'drop\u0000tables', arguments: {} },
    ] }, answer('ok')]);
    const app = buildAiApp(ownerA, provider);
    try {
      const res = await app.inject({ method: 'POST', url: '/api/ai/chat', payload: { message: 'suppliers' } });
      expect(res.statusCode).toBe(200);
      const rows = (await admin.query(`SELECT tool_name, tool_params, outcome FROM ai_audit_log WHERE request_id = $1 AND event_type = 'TOOL_CALL' ORDER BY occurred_at`, [res.json().metadata.request_id])).rows;
      expect(rows).toEqual([
        { tool_name: 'inventory_list_suppliers', tool_params: { name_contains: 'al i' }, outcome: 'SUCCESS' },
        { tool_name: 'drop tables', tool_params: null, outcome: 'UNKNOWN_TOOL' },
      ]);
    } finally {
      await app.close();
    }
  });

  it('check constraints reject inconsistent rows', async () => {
    await expect(sink.record(entry({ eventType: 'TOOL_CALL', toolName: null }))).rejects.toMatchObject({ code: '23514' });
    await expect(sink.record(entry({ eventType: 'CHAT', toolMode: 'READ' }))).rejects.toMatchObject({ code: '23514' });
    await expect(sink.record(entry({ outcome: 'HACKED' as never }))).rejects.toMatchObject({ code: '23514' });
  });

  it('chat → READ tool → existing repository keeps branch isolation; audit rows written through the real grants', async () => {
    const item = await items.create({ item_name: uniq('Mozzarella'), primary_item_type: 'RAW_MATERIAL', base_uom: 'kg', brand: 'Generic / No Brand' }, ownerA);
    const store = await locations.create({ name: uniq('Store'), location_type: 'STORE' }, ownerA);
    await stock.createOpening({ item_id: item.id, location_id: store.id, quantity: '12.5' }, ownerA);

    const providerA = new FakeProvider([callTool('inventory_get_stock_balances', { item_name_contains: 'mozzarella' }), answer('A')]);
    const appA = buildAiApp(ownerA, providerA);
    const providerB = new FakeProvider([callTool('inventory_get_stock_balances', { item_name_contains: 'mozzarella' }), answer('B')]);
    const appB = buildAiApp(managerB, providerB);
    try {
      const resA = await appA.inject({ method: 'POST', url: '/api/ai/chat', payload: { message: 'Mozzarella?' } });
      expect(resA.statusCode).toBe(200);
      const dataA = JSON.parse((providerA.requests[1]!.messages.at(-1) as { content: string }).content).data;
      expect(dataA.rows).toEqual([expect.objectContaining({ item_id: item.id, quantity: '12.500000' })]);

      const resB = await appB.inject({ method: 'POST', url: '/api/ai/chat', payload: { message: 'Mozzarella?' } });
      expect(resB.statusCode).toBe(200);
      const dataB = JSON.parse((providerB.requests[1]!.messages.at(-1) as { content: string }).content).data;
      expect(dataB.rows.map((row: { item_id: string }) => row.item_id)).not.toContain(item.id);

      const requestId = resA.json().metadata.request_id;
      const audit = (await admin.query('SELECT event_type, tool_name, tool_mode, tool_params, permission_result, outcome, actor_id, branch_id FROM ai_audit_log WHERE request_id = $1 ORDER BY occurred_at', [requestId])).rows;
      expect(audit).toEqual([
        { event_type: 'TOOL_CALL', tool_name: 'inventory_get_stock_balances', tool_mode: 'READ', tool_params: { item_name_contains: 'mozzarella' }, permission_result: 'ALLOWED', outcome: 'SUCCESS', actor_id: 'owner-a', branch_id: 'branch-a' },
        { event_type: 'CHAT', tool_name: null, tool_mode: null, tool_params: null, permission_result: null, outcome: 'SUCCESS', actor_id: 'owner-a', branch_id: 'branch-a' },
      ]);
      const text = JSON.stringify((await admin.query('SELECT * FROM ai_audit_log WHERE request_id = $1', [requestId])).rows);
      expect(text).not.toContain('Mozzarella?');
    } finally {
      await appA.close(); await appB.close();
    }
  });
});
