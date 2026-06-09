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

export async function addFoodItems(
  db: SQLiteDatabase,
  items: FoodItemInput[],
  source: 'text' | 'voice' | 'photo',
  date: string = todayLocal(),
  userId: string = LOCAL_USER_ID,
): Promise<void> {
  try {
    const at = nowIso();
    for (const it of items) {
      await db.runAsync(
        `INSERT INTO food_log (id, user_id, date, name, kcal, protein_g, source, logged_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [newUuid(), userId, date, it.name.trim() || 'food', Math.max(0, it.kcal), Math.max(0, it.proteinG), source, at],
      );
    }
  } catch {
    // pre-migration window — no-op
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
