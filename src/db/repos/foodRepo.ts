import type { SQLiteDatabase } from 'expo-sqlite';
import { nowIso, todayLocal } from '../../lib/date';
import { newUuid } from '../uuid';
import { LOCAL_USER_ID } from '../types';

// Local food ledger. Manual/repeat writes never require remote AI; optional photo/text/voice paths
// converge here only after they return structured values. Reads fail soft during a migration window.

export interface FoodItemInput {
  name: string;
  kcal: number;
  proteinG: number;
}

export type FoodSource = 'manual' | 'text' | 'voice' | 'photo';

export interface FoodMealBatch {
  /** Exact rows in this save; immediate undo never relies on a timestamp collision boundary. */
  ids: string[];
  /** Durable grouping key for local recent-meal history. */
  batchId: string;
  items: FoodItemInput[];
  source: FoodSource;
  loggedAt: string;
  date: string;
  userId: string;
}

export async function addFoodItems(
  db: SQLiteDatabase,
  items: FoodItemInput[],
  source: FoodSource,
  date: string = todayLocal(),
  userId: string = LOCAL_USER_ID,
): Promise<FoodMealBatch | null> {
  if (items.length === 0) return null;

  // One multi-row SQLite statement is atomic by itself. This avoids the shared-connection hazard of
  // withTransactionAsync (unrelated quick-log writes can otherwise join its BEGIN/ROLLBACK window)
  // and uses one native bridge round-trip for the whole meal.
  const at = nowIso();
  const batchId = newUuid();
  const ids = items.map(() => newUuid());
  const storedItems = items.map(normalizeStoredFoodItem);
  const placeholders = storedItems.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params = storedItems.flatMap((item, index) => [
    ids[index],
    batchId,
    userId,
    date,
    item.name,
    item.kcal,
    item.proteinG,
    source,
    at,
  ]);
  await db.runAsync(
    `INSERT INTO food_log (id, batch_id, user_id, date, name, kcal, protein_g, source, logged_at)
     VALUES ${placeholders}`,
    params,
  );
  return { ids, batchId, items: storedItems, source, loggedAt: at, date, userId };
}

/** Edit is deliberately limited to the one-row manual form. AI/recent multi-item batches stay immutable. */
export async function updateManualFoodItem(
  db: SQLiteDatabase,
  batch: FoodMealBatch,
  item: FoodItemInput,
): Promise<FoodMealBatch | null> {
  if (batch.source !== 'manual' || batch.ids.length !== 1) return null;
  const stored = normalizeStoredFoodItem(item);
  const at = nowIso();
  const result = await db.runAsync(
    `UPDATE food_log
     SET name = ?, kcal = ?, protein_g = ?, logged_at = ?
     WHERE id = ? AND batch_id = ? AND user_id = ? AND source = 'manual'`,
    [stored.name, stored.kcal, stored.proteinG, at, batch.ids[0], batch.batchId, batch.userId],
  );
  if (result.changes === 0) return null;
  return { ...batch, items: [stored], loggedAt: at };
}

/**
 * Undo one meal and its auto-completed protein credit in one exclusive transaction. Exact row ids
 * and the original date/user scope make this safe across midnight and idempotent on retry.
 */
export async function undoFoodBatch(
  db: SQLiteDatabase,
  batch: Pick<FoodMealBatch, 'ids' | 'date' | 'userId'>,
  options: { resetProteinIfBelowG: number | null },
): Promise<{ proteinReset: boolean }> {
  if (batch.ids.length === 0) return { proteinReset: false };
  let proteinReset = false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `DELETE FROM food_log WHERE user_id = ? AND id IN (${batch.ids.map(() => '?').join(',')})`,
      [batch.userId, ...batch.ids],
    );
    if (options.resetProteinIfBelowG == null) return;
    const total = await tx.getFirstAsync<{ protein_g: number | null }>(
      `SELECT COALESCE(SUM(protein_g), 0) AS protein_g
       FROM food_log WHERE user_id = ? AND date = ?`,
      [batch.userId, batch.date],
    );
    if ((total?.protein_g ?? 0) >= options.resetProteinIfBelowG) return;
    const result = await tx.runAsync(
      `UPDATE discipline SET protein = 0, updated_at = ?
       WHERE user_id = ? AND date = ? AND protein = 1`,
      [nowIso(), batch.userId, batch.date],
    );
    proteinReset = result.changes > 0;
  });
  return { proteinReset };
}

/**
 * Most recently logged meal. batch_id is the durable boundary; logged_at is ordering only.
 */
export async function getLatestFoodBatch(
  db: SQLiteDatabase,
  userId: string = LOCAL_USER_ID,
): Promise<FoodMealBatch | null> {
  try {
    const rows = await db.getAllAsync<{
      id: string;
      batch_id: string;
      date: string;
      name: string;
      kcal: number;
      protein_g: number;
      source: FoodSource;
      logged_at: string;
    }>(
      `SELECT id, batch_id, date, name, kcal, protein_g, source, logged_at
       FROM food_log
       WHERE user_id = ?
         AND batch_id = (
           SELECT batch_id FROM food_log
           WHERE user_id = ?
           ORDER BY logged_at DESC, rowid DESC
           LIMIT 1
         )
       ORDER BY rowid ASC`,
      [userId, userId],
    );
    if (rows.length === 0) return null;
    return {
      ids: rows.map((row) => row.id),
      batchId: rows[0].batch_id,
      items: rows.map((row) => ({ name: row.name, kcal: row.kcal, proteinG: row.protein_g })),
      source: rows[0].source,
      loggedAt: rows[0].logged_at,
      date: rows[0].date,
      userId,
    };
  } catch {
    // Read-only compatibility for a pre-v5 development database. A full reload runs the migration.
    return null;
  }
}

/** Up to `limit` distinct recent meals, newest first. Entirely local and safe before AI consent. */
export async function getRecentFoodBatches(
  db: SQLiteDatabase,
  limit: number = 3,
  userId: string = LOCAL_USER_ID,
): Promise<FoodMealBatch[]> {
  const take = Math.max(1, Math.min(10, Math.trunc(limit)));
  try {
    const rows = await db.getAllAsync<{
      id: string;
      batch_id: string;
      date: string;
      name: string;
      kcal: number;
      protein_g: number;
      source: FoodSource;
      logged_at: string;
    }>(
      `WITH recent_batches AS (
         SELECT batch_id, MAX(logged_at) AS batch_logged_at
         FROM food_log
         WHERE user_id = ?
         GROUP BY batch_id
         ORDER BY batch_logged_at DESC
         LIMIT ?
       )
       SELECT f.id, f.batch_id, f.date, f.name, f.kcal, f.protein_g, f.source, f.logged_at
       FROM food_log f
       JOIN recent_batches r ON r.batch_id = f.batch_id
       WHERE f.user_id = ?
       ORDER BY r.batch_logged_at DESC, f.rowid ASC`,
      [userId, take * 4, userId],
    );
    const grouped = new Map<string, FoodMealBatch>();
    for (const row of rows) {
      const found = grouped.get(row.batch_id);
      if (found) {
        found.ids.push(row.id);
        found.items.push({ name: row.name, kcal: row.kcal, proteinG: row.protein_g });
      } else {
        grouped.set(row.batch_id, {
          ids: [row.id],
          batchId: row.batch_id,
          items: [{ name: row.name, kcal: row.kcal, proteinG: row.protein_g }],
          source: row.source,
          loggedAt: row.logged_at,
          date: row.date,
          userId,
        });
      }
    }
    const signatures = new Set<string>();
    const distinct: FoodMealBatch[] = [];
    for (const batch of grouped.values()) {
      const signature = batch.items
        .map((item) => `${item.name.trim().toLowerCase()}\u0000${item.kcal}\u0000${item.proteinG}`)
        .join('\u0001');
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      distinct.push(batch);
      if (distinct.length === take) break;
    }
    return distinct;
  } catch {
    return [];
  }
}

/** Today's totals for the food card + protein-target check. */
export async function getFoodToday(
  db: SQLiteDatabase,
  date: string = todayLocal(),
  userId: string = LOCAL_USER_ID,
): Promise<{ kcal: number; proteinG: number; entries: number }> {
  try {
    const row = await db.getFirstAsync<{ kcal: number | null; p: number | null; n: number }>(
      `SELECT SUM(kcal) AS kcal, SUM(protein_g) AS p, COUNT(*) AS n
       FROM food_log WHERE user_id = ? AND date = ?`,
      [userId, date],
    );
    return { kcal: Math.round(row?.kcal ?? 0), proteinG: Math.round(row?.p ?? 0), entries: row?.n ?? 0 };
  } catch {
    return { kcal: 0, proteinG: 0, entries: 0 };
  }
}

function normalizeStoredFoodItem(item: FoodItemInput): FoodItemInput {
  return {
    name: item.name.trim() || 'food',
    kcal: Number.isFinite(item.kcal) ? Math.max(0, item.kcal) : 0,
    proteinG: Number.isFinite(item.proteinG) ? Math.max(0, item.proteinG) : 0,
  };
}
