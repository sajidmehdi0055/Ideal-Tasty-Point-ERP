import 'dotenv/config';
import { Pool } from 'pg';
import { z } from 'zod';
import { buildApp } from './app.js';
import { PgAiAuditSink } from './ai/audit.js';
import { loadAiConfig } from './ai/config.js';
import { PgItemRepository } from './inventory/persistence/pg-item-repository.js';
import { PgUomRepository } from './inventory/persistence/pg-uom-repository.js';
import { PgBrandRepository } from './inventory/persistence/pg-brand-repository.js';
import { PgPackVariantRepository } from './inventory/persistence/pg-pack-variant-repository.js';
import { PgSupplierRepository } from './inventory/persistence/pg-supplier-repository.js';
import { PgPurchaseRecordRepository } from './inventory/persistence/pg-purchase-record-repository.js';
import { PgStockLocationRepository } from './inventory/persistence/pg-stock-location-repository.js';
import { PgStockRepository } from './inventory/persistence/pg-stock-repository.js';
import { PgGoodsReceiptRepository } from './inventory/persistence/pg-goods-receipt-repository.js';
import { PgPurchaseOrderRepository } from './inventory/persistence/pg-purchase-order-repository.js';
import { PgStockTransferRepository } from './inventory/persistence/pg-stock-transfer-repository.js';

const env = z.object({ DATABASE_URL: z.string().min(1), PORT: z.coerce.number().int().min(1).max(65535).default(3000) }).parse(process.env);
const pool = new Pool({ connectionString: env.DATABASE_URL });
// AI is optional (ADR-0012): disabled unless AI_ENABLED=true; a bad AI setting never stops the ERP.
const aiConfig = loadAiConfig(process.env);
// No development header-to-role shortcut: standalone server denies writes until
// a trusted AuthContext provider is integrated through buildApp's composition boundary.
const app = buildApp({
  repository: new PgItemRepository(pool),
  uomRepository: new PgUomRepository(pool),
  brandRepository: new PgBrandRepository(pool),
  packVariantRepository: new PgPackVariantRepository(pool),
  supplierRepository: new PgSupplierRepository(pool),
  purchaseRecordRepository: new PgPurchaseRecordRepository(pool),
  stockLocationRepository: new PgStockLocationRepository(pool),
  stockRepository: new PgStockRepository(pool),
  goodsReceiptRepository: new PgGoodsReceiptRepository(pool),
  purchaseOrderRepository: new PgPurchaseOrderRepository(pool),
  stockTransferRepository: new PgStockTransferRepository(pool),
  ai: { config: aiConfig, auditSink: new PgAiAuditSink(pool), logError: (details, message) => app.log.error(details, message) },
});
if (aiConfig.state === 'MISCONFIGURED') app.log.warn({ problems: aiConfig.problems }, 'AI is enabled but misconfigured; AI endpoints will answer 503');
app.addHook('onClose', async () => { await pool.end(); });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
await app.listen({ host: '127.0.0.1', port: env.PORT });
