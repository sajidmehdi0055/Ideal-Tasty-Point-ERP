import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import type { PurchaseRecordRepository } from '../application/purchase-record-repository.js';
import type {
  PurchaseRecord, PurchaseRecordInput, RateComparisonQuery, RateComparisonResult, SupplierRateBreakdownEntry,
} from '../domain/purchase-record.js';
import { appendPurchaseRecordAudit } from './purchase-record-audit.js';
import { withTransaction } from './transaction.js';

// purchase_date is formatted server-side via to_char(...) rather than left to
// node-postgres's default DATE parsing, to avoid any local-timezone-shift
// ambiguity around midnight -- the API boundary always sees the exact plain
// calendar date that was stored.
const INSERT_RETURNING_COLUMNS =
  `id, supplier_id, item_id, brand_id, pack_variant_id, quantity, rate, to_char(purchase_date, 'YYYY-MM-DD') AS purchase_date, created_at`;
const LIST_COLUMNS =
  `pr.id, pr.supplier_id, pr.item_id, pr.brand_id, pr.pack_variant_id, pr.quantity, pr.rate, to_char(pr.purchase_date, 'YYYY-MM-DD') AS purchase_date, pr.created_at`;

const FOREIGN_KEY_VIOLATION = '23503';

type PurchaseRecordRow = Omit<PurchaseRecord, 'created_at'> & { created_at: Date };

function toPurchaseRecord(row: PurchaseRecordRow): PurchaseRecord {
  return { ...row, created_at: row.created_at.toISOString() };
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export class PgPurchaseRecordRepository implements PurchaseRecordRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: PurchaseRecordInput, auth: AuthContext): Promise<PurchaseRecord | null> {
    try {
      return await withTransaction(this.pool, async (client) => {
        // Purchase Record carries no branch_id of its own; branch ownership is
        // enforced here via the referenced item, exactly like Pack Variant.
        const itemCheck = await client.query<{ branch_id: string }>(
          'SELECT branch_id FROM item_master WHERE id = $1',
          [input.item_id],
        );
        const itemRow = itemCheck.rows[0];
        if (!itemRow || itemRow.branch_id !== auth.branchId) return null;

        // The referenced pack variant must actually belong to the given
        // item_id + brand_id combination -- this is a business-rule check,
        // not merely a foreign key, so it is validated in application code.
        const packVariantCheck = await client.query<{ item_id: string; brand_id: string }>(
          'SELECT item_id, brand_id FROM pack_variant WHERE id = $1',
          [input.pack_variant_id],
        );
        const packVariantRow = packVariantCheck.rows[0];
        if (!packVariantRow || packVariantRow.item_id !== input.item_id || packVariantRow.brand_id !== input.brand_id) {
          throw new AppError(400, 'INVALID_REFERENCE', 'pack_variant_id does not belong to the given item_id/brand_id combination');
        }

        const result = await client.query<PurchaseRecordRow>(
          `INSERT INTO purchase_record (id, supplier_id, item_id, brand_id, pack_variant_id, quantity, rate, purchase_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date) RETURNING ${INSERT_RETURNING_COLUMNS}`,
          [randomUUID(), input.supplier_id, input.item_id, input.brand_id, input.pack_variant_id, input.quantity, input.rate, input.purchase_date],
        );
        const row = result.rows[0];
        if (!row) throw new Error('Purchase record insert did not return a record');
        const record = toPurchaseRecord(row);
        await appendPurchaseRecordAudit(client, auth, record);
        return record;
      });
    } catch (error) {
      if (hasCode(error, FOREIGN_KEY_VIOLATION)) {
        throw new AppError(400, 'INVALID_REFERENCE', 'supplier_id, brand_id or pack_variant_id does not reference an existing row');
      }
      throw error;
    }
  }

  async list(auth: AuthContext): Promise<PurchaseRecord[]> {
    const result = await this.pool.query<PurchaseRecordRow>(
      `SELECT ${LIST_COLUMNS}
       FROM purchase_record pr JOIN item_master im ON im.id = pr.item_id
       WHERE im.branch_id = $1 ORDER BY pr.purchase_date DESC, pr.created_at DESC`,
      [auth.branchId],
    );
    return result.rows.map(toPurchaseRecord);
  }

  async getRateComparison(query: RateComparisonQuery, auth: AuthContext): Promise<RateComparisonResult | null> {
    const itemCheck = await this.pool.query<{ branch_id: string }>(
      'SELECT branch_id FROM item_master WHERE id = $1',
      [query.item_id],
    );
    const itemRow = itemCheck.rows[0];
    if (!itemRow || itemRow.branch_id !== auth.branchId) return null;

    const packVariantCheck = await this.pool.query<{ item_id: string; brand_id: string; conversion_factor: string }>(
      'SELECT item_id, brand_id, conversion_factor FROM pack_variant WHERE id = $1',
      [query.pack_variant_id],
    );
    const packVariantRow = packVariantCheck.rows[0];
    if (!packVariantRow || packVariantRow.item_id !== query.item_id || packVariantRow.brand_id !== query.brand_id) {
      throw new AppError(400, 'INVALID_REFERENCE', 'pack_variant_id does not belong to the given item_id/brand_id combination');
    }

    const recentResult = await this.pool.query<{ rate: string }>(
      `SELECT rate FROM purchase_record
       WHERE item_id = $1 AND brand_id = $2 AND pack_variant_id = $3
       ORDER BY purchase_date DESC, created_at DESC
       LIMIT 3`,
      [query.item_id, query.brand_id, query.pack_variant_id],
    );
    const recentRates = recentResult.rows.map(r => r.rate);
    const currentRate = recentRates[0] ?? null;
    const previousRate = recentRates[1] ?? null;

    let averageRateLast3: string | null = null;
    if (recentRates.length > 0) {
      // Averages the same last-(up to 3) window as above, computed in
      // PostgreSQL with NUMERIC arithmetic (never JS float) end to end.
      const avgResult = await this.pool.query<{ avg_rate: string }>(
        `SELECT round(avg(rate), 6)::text AS avg_rate FROM (
           SELECT rate FROM purchase_record
           WHERE item_id = $1 AND brand_id = $2 AND pack_variant_id = $3
           ORDER BY purchase_date DESC, created_at DESC
           LIMIT 3
         ) recent`,
        [query.item_id, query.brand_id, query.pack_variant_id],
      );
      averageRateLast3 = avgResult.rows[0]?.avg_rate ?? null;
    }

    let currentRatePerBaseUom: string | null = null;
    if (currentRate !== null) {
      const perBaseResult = await this.pool.query<{ per_base: string }>(
        'SELECT round($1::numeric / $2::numeric, 6)::text AS per_base',
        [currentRate, packVariantRow.conversion_factor],
      );
      currentRatePerBaseUom = perBaseResult.rows[0]?.per_base ?? null;
    }

    let percentageChange: string | null = null;
    if (currentRate !== null && previousRate !== null && Number(previousRate) !== 0) {
      const pctResult = await this.pool.query<{ pct: string }>(
        'SELECT round((($1::numeric - $2::numeric) / $2::numeric) * 100, 6)::text AS pct',
        [currentRate, previousRate],
      );
      percentageChange = pctResult.rows[0]?.pct ?? null;
    }

    const breakdownResult = await this.pool.query<{
      supplier_id: string; supplier_name: string; purchase_count: string; latest_rate: string; average_rate: string;
    }>(
      `SELECT s.id AS supplier_id, s.name AS supplier_name,
              count(pr.id)::text AS purchase_count,
              (array_agg(pr.rate ORDER BY pr.purchase_date DESC, pr.created_at DESC))[1] AS latest_rate,
              round(avg(pr.rate), 6)::text AS average_rate
         FROM purchase_record pr
         JOIN supplier_master s ON s.id = pr.supplier_id
        WHERE pr.item_id = $1 AND pr.brand_id = $2 AND pr.pack_variant_id = $3
        GROUP BY s.id, s.name
        ORDER BY s.name`,
      [query.item_id, query.brand_id, query.pack_variant_id],
    );

    const supplierBreakdown: SupplierRateBreakdownEntry[] = breakdownResult.rows.map(r => ({
      supplier_id: r.supplier_id,
      supplier_name: r.supplier_name,
      purchase_count: Number(r.purchase_count),
      latest_rate: r.latest_rate,
      average_rate: r.average_rate,
    }));

    return {
      item_id: query.item_id,
      brand_id: query.brand_id,
      pack_variant_id: query.pack_variant_id,
      records_considered: recentRates.length,
      current_rate: currentRate,
      previous_rate: previousRate,
      average_rate_last_3: averageRateLast3,
      current_rate_per_base_uom: currentRatePerBaseUom,
      percentage_change: percentageChange,
      supplier_breakdown: supplierBreakdown,
    };
  }
}
