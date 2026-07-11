import type { SQLiteDatabase } from 'expo-sqlite';
import { nowIso } from '../../lib/date';
import { newUuid } from '../uuid';
import { LOCAL_USER_ID, type CardioLogRow, type CardioSource } from '../types';

export async function addCardio(
  db: SQLiteDatabase,
  input: {
    sessionId: string;
    modality: string;
    durationSec: number;
    rounds?: number | null;
    rpe?: number | null;
    distanceM?: number | null;
    source?: CardioSource;
  },
): Promise<CardioLogRow> {
  const row: CardioLogRow = {
    id: newUuid(),
    client_uuid: newUuid(),
    session_id: input.sessionId,
    modality: input.modality,
    duration_sec: input.durationSec,
    rounds: input.rounds ?? null,
    rpe: input.rpe ?? null,
    distance_m: input.distanceM ?? null,
    source: input.source ?? 'manual',
    logged_at: nowIso(),
  };
  await db.runAsync(
    `INSERT INTO cardio_log
       (id, client_uuid, session_id, modality, duration_sec, rounds, rpe, distance_m, source, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.client_uuid, row.session_id, row.modality, row.duration_sec, row.rounds, row.rpe, row.distance_m, row.source, row.logged_at],
  );
  return row;
}

export async function deleteCardio(db: SQLiteDatabase, cardioId: string): Promise<CardioLogRow | null> {
  let deleted: CardioLogRow | null = null;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const row = await tx.getFirstAsync<CardioLogRow>('SELECT * FROM cardio_log WHERE id = ?', [cardioId]);
    if (!row) return;
    const result = await tx.runAsync('DELETE FROM cardio_log WHERE id = ?', [cardioId]);
    if (result.changes > 0) deleted = row;
  });
  return deleted;
}

export async function getLastCardioForModality(
  db: SQLiteDatabase,
  modality: string,
  userId: string = LOCAL_USER_ID,
): Promise<CardioLogRow | null> {
  return db.getFirstAsync<CardioLogRow>(
    `SELECT cl.* FROM cardio_log cl
     JOIN workout_session ws ON ws.id = cl.session_id
     WHERE cl.modality = ? AND ws.user_id = ?
     ORDER BY cl.logged_at DESC LIMIT 1`,
    [modality, userId],
  );
}

/** Cardio item counts for the given modalities on a local calendar date — restores Active Workout progress. */
export async function getCardioCountsForModalitiesOnDate(
  db: SQLiteDatabase,
  modalities: string[],
  date: string,
  userId: string = LOCAL_USER_ID,
): Promise<Record<string, number>> {
  if (modalities.length === 0) return {};
  const rows = await db.getAllAsync<{ modality: string; n: number }>(
    `SELECT cl.modality, COUNT(*) AS n
     FROM cardio_log cl
     JOIN workout_session ws ON ws.id = cl.session_id
     WHERE ws.user_id = ? AND ws.date = ? AND cl.modality IN (${modalities.map(() => '?').join(',')})
     GROUP BY cl.modality`,
    [userId, date, ...modalities],
  );
  return Object.fromEntries(rows.map((r) => [r.modality, r.n]));
}

/** Cardio row tagged with its session's local calendar date — feeds the history daily timeline. */
export type CardioLogWithDate = CardioLogRow & { date: string };

/**
 * READ-ONLY: every cardio log on/after `sinceDate` (local yyyy-mm-dd, from workout_session.date),
 * newest day first, chronological within a day.
 */
export async function getCardioWithDateSince(
  db: SQLiteDatabase,
  sinceDate: string,
  userId: string = LOCAL_USER_ID,
): Promise<CardioLogWithDate[]> {
  return db.getAllAsync<CardioLogWithDate>(
    `SELECT cl.*, ws.date AS date FROM cardio_log cl
     JOIN workout_session ws ON ws.id = cl.session_id
     WHERE ws.user_id = ? AND ws.date >= ?
     ORDER BY ws.date DESC, cl.logged_at ASC`,
    [userId, sinceDate],
  );
}

/**
 * Conditioning units since `sinceDate`: Σ min(minutes, 45) · (rpe/6), rpe defaulting to 6.
 * Fun heuristic feeding the Combat Power conditioning sub-score (spec §6.3).
 */
export async function conditioningUnitsSince(
  db: SQLiteDatabase,
  sinceDate: string,
  userId: string = LOCAL_USER_ID,
): Promise<number> {
  const row = await db.getFirstAsync<{ units: number | null }>(
    `SELECT COALESCE(SUM(MIN(cl.duration_sec / 60.0, 45.0) * (COALESCE(cl.rpe, 6) / 6.0)), 0) AS units
     FROM cardio_log cl
     JOIN workout_session ws ON ws.id = cl.session_id
     WHERE ws.user_id = ? AND ws.date >= ?`,
    [userId, sinceDate],
  );
  return row?.units ?? 0;
}
