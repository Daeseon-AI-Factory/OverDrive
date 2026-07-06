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

/** Deterministic slug for an ad-hoc exercise name (keeps a-z0-9 + Hangul; '버피'→'버피', 'Farmer Walk'→'farmer_walk'). */
function slugifyExercise(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (s) return s;
  // all-symbol fallback — stable per name
  const sum = Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0);
  return `ex_${sum}`;
}

/**
 * Ensure an exercise exists for an AI-proposed name not in the seed catalog (e.g. "burpees",
 * "farmer's walk"), creating it once. Returns the id so QuickLog can log against it immediately
 * (satisfies the set_log → exercise FK). After creation it shows up in the catalog + recents.
 */
export async function ensureExercise(
  db: SQLiteDatabase,
  input: { name: string; isBodyweight?: boolean },
): Promise<string> {
  const id = slugifyExercise(input.name);
  await db.runAsync(
    `INSERT OR IGNORE INTO exercise (id, name, muscle_group, type, default_sets, rep_low, rep_high, is_bodyweight, created_at)
     VALUES (?, ?, 'other', 'strength', 3, 8, 12, ?, ?)`,
    [id, input.name.trim() || id, input.isBodyweight ? 1 : 0, nowIso()],
  );
  return id;
}

/** Most-recently-logged exercises with their last set — powers the QuickLog one-tap "repeat" chips. */
export async function getRecentExercises(
  db: SQLiteDatabase,
  limit = 6,
  userId: string = LOCAL_USER_ID,
): Promise<{ exerciseId: string; weight: number; reps: number; rir: number | null }[]> {
  // Window function: rank each exercise's sets by recency and take rn=1 (the latest). Explicit and
  // unambiguous — avoids relying on SQLite's bare-column-with-MAX behavior for weight/reps/rir.
  const rows = await db.getAllAsync<{ exercise_id: string; weight: number; reps: number; rir: number | null }>(
    `SELECT exercise_id, weight, reps, rir FROM (
       SELECT sl.exercise_id, sl.weight, sl.reps, sl.rir, sl.logged_at,
              ROW_NUMBER() OVER (PARTITION BY sl.exercise_id ORDER BY sl.logged_at DESC) AS rn
       FROM set_log sl
       JOIN workout_session ws ON ws.id = sl.session_id
       WHERE ws.user_id = ?
     )
     WHERE rn = 1
     ORDER BY logged_at DESC
     LIMIT ?`,
    [userId, limit],
  );
  return rows.map((r) => ({ exerciseId: r.exercise_id, weight: r.weight, reps: r.reps, rir: r.rir }));
}

/** Set counts for the given exercises on a local calendar date — restores Active Workout progress. */
export async function getSetCountsForExercisesOnDate(
  db: SQLiteDatabase,
  exerciseIds: string[],
  date: string,
  userId: string = LOCAL_USER_ID,
): Promise<Record<string, number>> {
  if (exerciseIds.length === 0) return {};
  const rows = await db.getAllAsync<{ exercise_id: string; n: number }>(
    `SELECT sl.exercise_id, COUNT(*) AS n
     FROM set_log sl
     JOIN workout_session ws ON ws.id = sl.session_id
     WHERE ws.user_id = ? AND ws.date = ? AND sl.exercise_id IN (${exerciseIds.map(() => '?').join(',')})
     GROUP BY sl.exercise_id`,
    [userId, date, ...exerciseIds],
  );
  return Object.fromEntries(rows.map((r) => [r.exercise_id, r.n]));
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

/** Delete one logged set (mistake fix). Caller recomputes Combat Power afterwards. */
export async function deleteSet(db: SQLiteDatabase, setId: string): Promise<void> {
  await db.runAsync('DELETE FROM set_log WHERE id = ?', [setId]);
}

/** Set row tagged with its session's local calendar date — feeds the history daily timeline. */
export type SetLogWithDate = SetLogRow & { date: string };

/**
 * READ-ONLY: every set on/after `sinceDate` (local yyyy-mm-dd, from workout_session.date — the
 * day the workout belongs to), newest day first, chronological within a day.
 */
export async function getSetsWithDateSince(
  db: SQLiteDatabase,
  sinceDate: string,
  userId: string = LOCAL_USER_ID,
): Promise<SetLogWithDate[]> {
  return db.getAllAsync<SetLogWithDate>(
    `SELECT sl.*, ws.date AS date FROM set_log sl
     JOIN workout_session ws ON ws.id = sl.session_id
     WHERE ws.user_id = ? AND ws.date >= ?
     ORDER BY ws.date DESC, sl.logged_at ASC`,
    [userId, sinceDate],
  );
}

/** Per-exercise stats for the weekly-boss picker: best-scoring set + recent training frequency. */
export async function bossCandidates(
  db: SQLiteDatabase,
  since14d: string,
  userId: string = LOCAL_USER_ID,
): Promise<
  { exerciseId: string; isBodyweight: boolean; bestWeight: number; bestReps: number; bestScore: number; sets14d: number }[]
> {
  const best = await db.getAllAsync<{
    exercise_id: string;
    weight: number;
    reps: number;
    score: number;
    is_bodyweight: number;
  }>(
    `SELECT exercise_id, weight, reps, score, is_bodyweight FROM (
       SELECT sl.exercise_id, sl.weight, sl.reps, sl.score, e.is_bodyweight,
              ROW_NUMBER() OVER (PARTITION BY sl.exercise_id ORDER BY sl.score DESC, sl.logged_at DESC) AS rn
       FROM set_log sl
       JOIN workout_session ws ON ws.id = sl.session_id
       JOIN exercise e ON e.id = sl.exercise_id
       WHERE ws.user_id = ?
     ) WHERE rn = 1`,
    [userId],
  );
  const freq = await db.getAllAsync<{ exercise_id: string; n: number }>(
    `SELECT sl.exercise_id, COUNT(*) AS n
     FROM set_log sl JOIN workout_session ws ON ws.id = sl.session_id
     WHERE ws.user_id = ? AND ws.date >= ?
     GROUP BY sl.exercise_id`,
    [userId, since14d],
  );
  const freqMap = new Map(freq.map((f) => [f.exercise_id, f.n]));
  return best.map((b) => ({
    exerciseId: b.exercise_id,
    isBodyweight: b.is_bodyweight === 1,
    bestWeight: b.weight,
    bestReps: b.reps,
    bestScore: b.score,
    sets14d: freqMap.get(b.exercise_id) ?? 0,
  }));
}

/** Did a PR land on this exercise since `sinceDate`? (boss-defeated check — derived, no extra state) */
export async function hasPrSince(
  db: SQLiteDatabase,
  exerciseId: string,
  sinceDate: string,
  userId: string = LOCAL_USER_ID,
): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM set_log sl
     JOIN workout_session ws ON ws.id = sl.session_id
     WHERE ws.user_id = ? AND sl.exercise_id = ? AND sl.is_pr = 1 AND ws.date >= ?`,
    [userId, exerciseId, sinceDate],
  );
  return (row?.n ?? 0) > 0;
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
