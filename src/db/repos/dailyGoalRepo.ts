import type { SQLiteDatabase } from 'expo-sqlite';
import { nowIso, todayLocal } from '../../lib/date';
import { newUuid } from '../uuid';
import { LOCAL_USER_ID, type DailyTargetLogRow, type DailyTargetRow, type GoalUnit } from '../types';

// Daily training goals: a recurring TARGET template (the things you aim to do every day) + per-day
// PROGRESS (daily_target_log). Reads are resilient to a not-yet-migrated DB (dev hot-reload before
// the v4 migration runs) — they return empty/defaults instead of throwing, so Combat Power recompute
// and the Today screen never break. A full app reload runs MIGRATION_004 and real persistence kicks in.

export interface TodayGoal {
  target: DailyTargetRow;
  progress: number;
  done: boolean;
}

/** The recurring daily target template (active rows), in display order. */
export async function getActiveTargets(
  db: SQLiteDatabase,
  userId: string = LOCAL_USER_ID,
): Promise<DailyTargetRow[]> {
  try {
    return await db.getAllAsync<DailyTargetRow>(
      'SELECT * FROM daily_target WHERE user_id = ? AND active = 1 ORDER BY order_index, created_at',
      [userId],
    );
  } catch {
    return [];
  }
}

/** Active targets joined with today's progress (left join → progress 0 / not done by default). */
export async function getTodayGoals(
  db: SQLiteDatabase,
  date: string = todayLocal(),
  userId: string = LOCAL_USER_ID,
): Promise<TodayGoal[]> {
  try {
    const rows = await db.getAllAsync<DailyTargetRow & { p_progress: number | null; p_done: number | null }>(
      `SELECT t.*, l.progress AS p_progress, l.done AS p_done
         FROM daily_target t
         LEFT JOIN daily_target_log l ON l.target_id = t.id AND l.date = ?
        WHERE t.user_id = ? AND t.active = 1
        ORDER BY t.order_index, t.created_at`,
      [date, userId],
    );
    return rows.map((r) => {
      const { p_progress, p_done, ...target } = r;
      return { target: target as DailyTargetRow, progress: p_progress ?? 0, done: (p_done ?? 0) === 1 };
    });
  } catch {
    return [];
  }
}

export async function addTarget(
  db: SQLiteDatabase,
  input: { label: string; unit: GoalUnit; target: number },
  userId: string = LOCAL_USER_ID,
): Promise<void> {
  try {
    const now = nowIso();
    const row = await db.getFirstAsync<{ max_order: number | null }>(
      'SELECT MAX(order_index) AS max_order FROM daily_target WHERE user_id = ?',
      [userId],
    );
    const order = (row?.max_order ?? -1) + 1;
    await db.runAsync(
      `INSERT INTO daily_target (id, user_id, label, unit, target, order_index, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [newUuid(), userId, input.label.trim(), input.unit, Math.max(1, input.target), order, now, now],
    );
  } catch {
    // table not present yet (pre-migration dev window) — no-op; persists after a full reload
  }
}

/** Remove a target (its per-day logs cascade via FK). */
export async function removeTarget(db: SQLiteDatabase, targetId: string): Promise<void> {
  try {
    await db.runAsync('DELETE FROM daily_target WHERE id = ?', [targetId]);
  } catch {
    /* pre-migration no-op */
  }
}

/**
 * Add progress toward a target for a given day. Upserts the per-day log, clamps progress to [0, target],
 * sets `done` when the target is reached. Returns the new state + whether THIS call completed it
 * (so the caller can fire the JUICE celebration exactly once).
 */
export async function addProgress(
  db: SQLiteDatabase,
  args: { targetId: string; amount: number; target: number },
  date: string = todayLocal(),
  userId: string = LOCAL_USER_ID,
): Promise<{ progress: number; done: boolean; justCompleted: boolean }> {
  try {
    const existing = await db.getFirstAsync<DailyTargetLogRow>(
      'SELECT * FROM daily_target_log WHERE target_id = ? AND date = ?',
      [args.targetId, date],
    );
    const wasDone = (existing?.done ?? 0) === 1;
    const prev = existing?.progress ?? 0;
    const next = Math.max(0, Math.min(args.target, prev + args.amount));
    const done = next >= args.target;
    await db.runAsync(
      `INSERT INTO daily_target_log (id, user_id, target_id, date, progress, done, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(target_id, date) DO UPDATE SET
         progress = excluded.progress, done = excluded.done, updated_at = excluded.updated_at`,
      [newUuid(), userId, args.targetId, date, next, done ? 1 : 0, nowIso()],
    );
    return { progress: next, done, justCompleted: done && !wasDone };
  } catch {
    return { progress: 0, done: false, justCompleted: false };
  }
}

/** Reset today's progress for a target (untick). */
export async function resetProgress(
  db: SQLiteDatabase,
  targetId: string,
  date: string = todayLocal(),
): Promise<void> {
  try {
    await db.runAsync('DELETE FROM daily_target_log WHERE target_id = ? AND date = ?', [targetId, date]);
  } catch {
    /* pre-migration no-op */
  }
}

/** Completed goal-days in a window — feeds the Combat Power "daily goals" component. */
export async function dailyGoalsCompletedSince(
  db: SQLiteDatabase,
  sinceDate: string,
  userId: string = LOCAL_USER_ID,
): Promise<{ completed: number; hasTargets: boolean }> {
  try {
    const [done, targets] = await Promise.all([
      db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM daily_target_log WHERE user_id = ? AND date >= ? AND done = 1',
        [userId, sinceDate],
      ),
      db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM daily_target WHERE user_id = ? AND active = 1',
        [userId],
      ),
    ]);
    return { completed: done?.n ?? 0, hasTargets: (targets?.n ?? 0) > 0 };
  } catch {
    return { completed: 0, hasTargets: false };
  }
}
