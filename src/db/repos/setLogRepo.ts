import type { SQLiteDatabase } from 'expo-sqlite';
import { detectPr } from '../../features/logging/detectPr';
import { PR_VOLUME_MULT } from '../../features/combat-power/constants';
import { nowIso } from '../../lib/date';
import { newUuid } from '../uuid';
import { LOCAL_USER_ID, type LoggedVia, type SetLogRow } from '../types';

/** Most recent set of an exercise for this user — drives "지난: Xkg×Y" prefill (spec §6.1). */
export async function getLastSetForExercise(
  db: SQLiteDatabase,
  exerciseId: string,
  userId: string = LOCAL_USER_ID,
): Promise<SetLogRow | null> {
  return db.getFirstAsync<SetLogRow>(
    `SELECT sl.* FROM set_log sl
     JOIN workout_session ws ON ws.id = sl.session_id
     WHERE sl.exercise_id = ? AND ws.user_id = ?
     ORDER BY sl.logged_at DESC LIMIT 1`,
    [exerciseId, userId],
  );
}

/** Best (max) performance score for an exercise — PR comparison baseline. */
export async function getBestScoreForExercise(
  db: SQLiteDatabase,
  exerciseId: string,
  userId: string = LOCAL_USER_ID,
): Promise<number | null> {
  const row = await db.getFirstAsync<{ best: number | null }>(
    `SELECT MAX(sl.score) AS best FROM set_log sl
     JOIN workout_session ws ON ws.id = sl.session_id
     WHERE sl.exercise_id = ? AND ws.user_id = ?`,
    [exerciseId, userId],
  );
  return row?.best ?? null;
}

export async function nextOrderIndex(db: SQLiteDatabase, sessionId: string): Promise<number> {
  const row = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM set_log WHERE session_id = ?',
    [sessionId],
  );
  return row?.next ?? 0;
}

/**
 * Insert one set. Runs PR detection against the exercise's prior best, stores is_pr + score.
 * The ONLY awaited write on the logging hot path — JUICE fires AFTER this resolves (never blocks).
 * Returns isPr so the caller can escalate the JUICE tier (PR → T3).
 */
export async function addSet(
  db: SQLiteDatabase,
  input: {
    sessionId: string;
    exerciseId: string;
    weight: number;
    reps: number;
    rir: number | null;
    orderIndex?: number;
    loggedVia?: LoggedVia;
    userId?: string;
  },
): Promise<{ row: SetLogRow; isPr: boolean }> {
  const userId = input.userId ?? LOCAL_USER_ID;
  const prevBest = await getBestScoreForExercise(db, input.exerciseId, userId);
  const { isPr, score } = detectPr({ weight: input.weight, reps: input.reps }, prevBest);
  const orderIndex = input.orderIndex ?? (await nextOrderIndex(db, input.sessionId));

  const row: SetLogRow = {
    id: newUuid(),
    client_uuid: newUuid(),
    session_id: input.sessionId,
    exercise_id: input.exerciseId,
    weight: input.weight,
    reps: input.reps,
    rir: input.rir,
    order_index: orderIndex,
    is_pr: isPr ? 1 : 0,
    score,
    logged_via: input.loggedVia ?? 'manual',
    logged_at: nowIso(),
  };

  await db.runAsync(
    `INSERT INTO set_log
       (id, client_uuid, session_id, exercise_id, weight, reps, rir, order_index, is_pr, score, logged_via, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.client_uuid, row.session_id, row.exercise_id, row.weight, row.reps, row.rir, row.order_index, row.is_pr, row.score, row.logged_via, row.logged_at],
  );
  return { row, isPr };
}

/** Σ(weight·reps), PR sets weighted ×PR_VOLUME_MULT, since `sinceDate`. Fun heuristic per spec §6.3. */
export async function strengthVolumeSince(
  db: SQLiteDatabase,
  sinceDate: string,
  userId: string = LOCAL_USER_ID,
): Promise<number> {
  const row = await db.getFirstAsync<{ vol: number | null }>(
    `SELECT COALESCE(SUM(sl.weight * sl.reps * (CASE WHEN sl.is_pr = 1 THEN ? ELSE 1 END)), 0) AS vol
     FROM set_log sl
     JOIN workout_session ws ON ws.id = sl.session_id
     WHERE ws.user_id = ? AND ws.date >= ?`,
    [PR_VOLUME_MULT, userId, sinceDate],
  );
  return row?.vol ?? 0;
}
