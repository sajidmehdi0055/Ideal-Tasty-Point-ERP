import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

/**
 * Executes the shipped scripts/runtime-grants.sql against a test schema/role,
 * substituting its psql `:"runtime_role"`/`:"schema_name"` variables the same
 * way `psql -v` would. This is the single authoritative grant source for both
 * real deployment and integration tests -- tests must never re-type grant
 * statements independently of this file, or the two can silently drift apart.
 */
export async function applyRuntimeGrants(admin: Pool, runtimeRole: string, schemaName: string): Promise<void> {
  const sql = readFileSync(resolve('scripts/runtime-grants.sql'), 'utf8')
    .replaceAll(':"runtime_role"', quoteIdentifier(runtimeRole))
    .replaceAll(':"schema_name"', quoteIdentifier(schemaName));
  await admin.query(sql);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
