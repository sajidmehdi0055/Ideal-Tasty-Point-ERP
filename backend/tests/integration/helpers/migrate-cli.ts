import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MIGRATE_BIN = resolve('node_modules/node-pg-migrate/bin/node-pg-migrate.js');

export interface MigrateCliResult { stdout: string; stderr: string }

/**
 * Spawns the real node-pg-migrate CLI binary with the exact same arguments
 * backend/package.json's "migrate" script uses (up -m migrations
 * --no-single-transaction) -- a real child process, not the programmatic
 * runner() API -- so tests can never silently drift from what `npm run
 * migrate` actually does. This is the single source of truth for migration
 * execution behavior in tests; see also `npm run migrate`/`migrate:check`.
 *
 * `upTo`, when given, limits how far to migrate (node-pg-migrate's own `up
 * [migrationName]` positional argument). Tests use this only to establish a
 * realistic starting precondition (e.g. "as if only S-01 had ever been
 * applied") -- never to artificially split the actual S-02 migrations being
 * tested into separate invocations.
 */
export async function runAuthoritativeMigrate(
  connectionString: string, schema: string, upTo?: string,
): Promise<MigrateCliResult> {
  const args = ['up', ...(upTo ? [upTo] : []), '-m', 'migrations', '--no-single-transaction',
    '--schema', schema, '--migrations-schema', schema];
  return execFileAsync(process.execPath, [MIGRATE_BIN, ...args], {
    cwd: resolve('.'),
    env: { ...process.env, DATABASE_URL: connectionString },
  });
}
