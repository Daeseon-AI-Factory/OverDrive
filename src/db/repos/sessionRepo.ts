import type { SQLiteDatabase } from 'expo-sqlite';
import { nowIso, todayLocal } from '../../lib/date';
import { newUuid } from '../uuid';
import { LOCAL_USER_ID, type DayType, type SessionSource, type WorkoutSessionRow } from '../types';

export async function startSession(
  db: SQLiteDatabase,
  input: { dayType: DayType; source?: SessionSource; date?: string; userId?: string },
): Promise<WorkoutSessionRow> {
  const id = newUuid();
  const now = nowIso();
  const row: WorkoutSessionRow = {
    id,
    client_uuid: newUuid(),
    user_id: input.userId ?? LOCAL_USER_ID,
    date: input.date ?? todayLocal(),
    day_type: input.dayType,
    source: input.source ?? 'manual',
    started_at: now,
    completed_at: null,
    created_at: now,
  };
  await db.runAsync(
    `INSERT INTO workout_session (id, client_uuid, user_id, date, day_type, source, started_at, completed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.client_uuid, row.user_id, row.date, row.day_type, row.source, row.started_at, row.completed_at, row.created_at],
  );
  return row;
}

export async function completeSession(db: SQLiteDatabase, sessionId: string): Promise<void> {
  await db.runAsync('UPDATE workout_session SET completed_at = ? WHERE id = ?', [nowIso(), sessionId]);
}

export async function getSession(db: SQLiteDatabase, id: string): Promise<WorkoutSessionRow | null> {
  return db.getFirstAsync<WorkoutSessionRow>('SELECT * FROM workout_session WHERE id = ?', [id]);
}

/** Local dates (yyyy-mm-dd) of completed sessions since `sinceDate`, for streak computation. */
export async function getCompletedSessionDates(
  db: SQLiteDatabase,
  sinceDate: string,
  userId: string = LOCAL_USER_ID,
): Promise<string[]> {
  const rows = await db.getAllAsync<{ date: string }>(
    `SELECT DISTINCT date FROM workout_session
     WHERE user_id = ? AND completed_at IS NOT NULL AND date >= ?
     ORDER BY date DESC`,
    [userId, sinceDate],
  );
  return rows.map((r) => r.date);
}

export async function countCompletedSessionsSince(
  db: SQLiteDatabase,
  sinceDate: string,
  userId: string = LOCAL_USER_ID,
): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(DISTINCT id) AS n FROM workout_session
     WHERE user_id = ? AND completed_at IS NOT NULL AND date >= ?`,
    [userId, sinceDate],
  );
  return row?.n ?? 0;
}
