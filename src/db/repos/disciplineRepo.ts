import type { SQLiteDatabase } from 'expo-sqlite';
import { nowIso, todayLocal } from '../../lib/date';
import { newUuid } from '../uuid';
import { LOCAL_USER_ID, type DisciplineRow } from '../types';

// Resilient to a not-yet-migrated DB (e.g. dev hot-reload before the v3 migration runs): reads
// return defaults instead of throwing, so Combat Power recompute + logging never break on a missing
// `discipline` table. A full app reload runs the migration and real persistence kicks in.

/** Today's discipline (protein hit / slept well). One-tap, feeds the Combat Power discipline component. */
export async function getDisciplineToday(
  db: SQLiteDatabase,
  date: string = todayLocal(),
  userId: string = LOCAL_USER_ID,
): Promise<{ protein: boolean; rest: boolean }> {
  try {
    const row = await db.getFirstAsync<DisciplineRow>('SELECT * FROM discipline WHERE user_id = ? AND date = ?', [userId, date]);
    return { protein: row?.protein === 1, rest: row?.rest === 1 };
  } catch {
    return { protein: false, rest: false };
  }
}

export async function setDisciplineToday(
  db: SQLiteDatabase,
  value: { protein: boolean; rest: boolean },
  date: string = todayLocal(),
  userId: string = LOCAL_USER_ID,
): Promise<void> {
  try {
    await db.runAsync(
      `INSERT INTO discipline (id, user_id, date, protein, rest, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET
         protein = excluded.protein, rest = excluded.rest, updated_at = excluded.updated_at`,
      [newUuid(), userId, date, value.protein ? 1 : 0, value.rest ? 1 : 0, nowIso()],
    );
  } catch {
    // table not present yet (pre-migration dev window) — no-op; persists after a full reload
  }
}

/** Discipline over a window: protein/rest day counts + how many days were tracked at all. */
export async function disciplineCountSince(
  db: SQLiteDatabase,
  sinceDate: string,
  userId: string = LOCAL_USER_ID,
): Promise<{ proteinDays: number; restOkDays: number; days: number }> {
  try {
    const row = await db.getFirstAsync<{ p: number; r: number; n: number }>(
      `SELECT COALESCE(SUM(protein), 0) AS p, COALESCE(SUM(rest), 0) AS r, COUNT(*) AS n
       FROM discipline WHERE user_id = ? AND date >= ?`,
      [userId, sinceDate],
    );
    return { proteinDays: row?.p ?? 0, restOkDays: row?.r ?? 0, days: row?.n ?? 0 };
  } catch {
    return { proteinDays: 0, restOkDays: 0, days: 0 };
  }
}
