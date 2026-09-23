import 'dotenv/config';
import { Pool } from 'pg';
import { z } from 'zod';
import { buildApp } from './app.js';
import { PgItemRepository } from './inventory/persistence/pg-item-repository.js';
import { PgUomRepository } from './inventory/persistence/pg-uom-repository.js';
import { PgBrandRepository } from './inventory/persistence/pg-brand-repository.js';
import { PgPackVariantRepository } from './inventory/persistence/pg-pack-variant-repository.js';

const env = z.object({ DATABASE_URL: z.string().min(1), PORT: z.coerce.number().int().min(1).max(65535).default(3000) }).parse(process.env);
const pool = new Pool({ connectionString: env.DATABASE_URL });
// No development header-to-role shortcut: standalone server denies writes until
// a trusted AuthContext provider is integrated through buildApp's composition boundary.
const app = buildApp({
  repository: new PgItemRepository(pool),
  uomRepository: new PgUomRepository(pool),
  brandRepository: new PgBrandRepository(pool),
  packVariantRepository: new PgPackVariantRepository(pool),
});
app.addHook('onClose', async () => { await pool.end(); });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
await app.listen({ host: '127.0.0.1', port: env.PORT });
