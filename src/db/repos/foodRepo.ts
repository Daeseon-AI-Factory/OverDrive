import type { SQLiteDatabase } from 'expo-sqlite';
import { nowIso, todayLocal } from '../../lib/date';
import { newUuid } from '../uuid';
import { LOCAL_USER_ID } from '../types';

// AI food logging (photo/text/voice → kcal + protein). Reads are resilient to a not-yet-migrated DB
// (pre-v5 dev window) — defaults instead of throwing, same pattern as discipline/dailyGoal repos.

export interface FoodItemInput {
  name: string;
  kcal: number;
  proteinG: number;
}

export type FoodSource = 'text' | 'voice' | 'photo';

export interface FoodMealBatch {
  /** Exact rows in this save; immediate undo never relies on a timestamp collision boundary. */
  ids: string[];
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
  const ids = items.map(() => newUuid());
  const placeholders = items.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params = items.flatMap((item, index) => [
    ids[index],
    userId,
    date,
    item.name.trim() || 'food',
    Math.max(0, item.kcal),
    Math.max(0, item.proteinG),
    source,
    at,
  ]);
  await db.runAsync(
    `INSERT INTO food_log (id, user_id, date, name, kcal, protein_g, source, logged_at)
     VALUES ${placeholders}`,
    params,
  );
  return { ids, items: items.map((item) => ({ ...item })), source, loggedAt: at, date, userId };
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
 * Most recently logged meal. Every row written by one addFoodItems call shares logged_at, so the
 * timestamp is the batch boundary (not just a convenient sort key).
 */
export async function getLatestFoodBatch(
  db: SQLiteDatabase,
  userId: string = LOCAL_USER_ID,
): Promise<FoodMealBatch | null> {
  try {
    const rows = await db.getAllAsync<{
      id: string;
      date: string;
      name: string;
      kcal: number;
      protein_g: number;
      source: FoodSource;
      logged_at: string;
    }>(
      `SELECT id, date, name, kcal, protein_g, source, logged_at
       FROM food_log
       WHERE user_id = ?
         AND logged_at = (SELECT MAX(logged_at) FROM food_log WHERE user_id = ?)
       ORDER BY rowid ASC`,
      [userId, userId],
    );
    if (rows.length === 0) return null;
    return {
      ids: rows.map((row) => row.id),
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
