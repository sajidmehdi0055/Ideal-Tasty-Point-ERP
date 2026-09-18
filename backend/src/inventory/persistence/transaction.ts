import type { Pool, PoolClient } from 'pg';

export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let rollbackFailed = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      rollbackFailed = true;
      throw new AggregateError([error, rollbackError], 'Transaction and rollback failed');
    }
    throw error;
  } finally {
    client.release(rollbackFailed);
  }
}
