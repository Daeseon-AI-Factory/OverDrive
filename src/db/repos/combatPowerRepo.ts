import type { SQLiteDatabase } from 'expo-sqlite';
import { computeStreak } from '../../features/combat-power/aggregate';
import { computeCombatPower } from '../../features/combat-power/computeCombatPower';
import type { CombatPowerInput, CombatPowerResult } from '../../features/combat-power/combatPower.types';
import { localDateDaysAgo, nowIso, todayLocal } from '../../lib/date';
import { newUuid } from '../uuid';
import { LOCAL_USER_ID, type CombatPowerRow } from '../types';
import { conditioningUnitsSince } from './cardioRepo';
import { dailyGoalsCompletedSince } from './dailyGoalRepo';
import { disciplineCountSince } from './disciplineRepo';
import { countCompletedSessionsSince, getCompletedSessionDates } from './sessionRepo';
import { strengthVolumeSince } from './setLogRepo';

const WINDOW_DAYS = 7;
const STREAK_LOOKBACK_DAYS = 90;

/**
 * Build the Combat Power input from the last 7 days of logs + streak.
 * Phase 1: discipline not tracked (null → dropped+renormalized), all data self-report
 * (verifiedRatio 0 → no bonus, no penalty). recomp/markers arrive in Phase 5.
 */
export async function buildInput(db: SQLiteDatabase, userId: string = LOCAL_USER_ID): Promise<CombatPowerInput> {
  const since = localDateDaysAgo(WINDOW_DAYS - 1);
  const [strengthVolume7d, sessions7d, conditioningUnits7d, streakDates, disc, goals] = await Promise.all([
    strengthVolumeSince(db, since, userId),
    countCompletedSessionsSince(db, since, userId),
    conditioningUnitsSince(db, since, userId),
    getCompletedSessionDates(db, localDateDaysAgo(STREAK_LOOKBACK_DAYS), userId),
    disciplineCountSince(db, since, userId),
    dailyGoalsCompletedSince(db, since, userId),
  ]);
  // Discipline activates only once the user starts tracking it (else renormalized out — anti-shame).
  const discipline = disc.days > 0 ? { proteinDays: disc.proteinDays, restOkDays: disc.restOkDays } : null;
  // Daily-goals component activates only once the user sets at least one target.
  const dailyGoals = goals.hasTargets ? { completed7d: goals.completed } : null;
  return {
    strengthVolume7d,
    sessions7d,
    conditioningUnits7d,
    streakDays: computeStreak(streakDates, todayLocal()),
    discipline,
    dailyGoals,
    verifiedRatio: 0,
  };
}

/** One snapshot per (user, day): upsert. */
export async function upsertSnapshot(
  db: SQLiteDatabase,
  result: CombatPowerResult,
  date: string = todayLocal(),
  userId: string = LOCAL_USER_ID,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO combat_power (id, user_id, date, score, grade_key, breakdown, verified_ratio, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET
       score = excluded.score,
       grade_key = excluded.grade_key,
       breakdown = excluded.breakdown,
       verified_ratio = excluded.verified_ratio,
       created_at = excluded.created_at`,
    [newUuid(), userId, date, result.score, result.grade.key, JSON.stringify(result.breakdown), result.verifiedRatio, nowIso()],
  );
}

export async function getLatest(db: SQLiteDatabase, userId: string = LOCAL_USER_ID): Promise<CombatPowerRow | null> {
  return db.getFirstAsync<CombatPowerRow>(
    'SELECT * FROM combat_power WHERE user_id = ? ORDER BY date DESC LIMIT 1',
    [userId],
  );
}

/** Recompute today's Combat Power from current logs and persist it. Returns the fresh result. */
export async function recomputeAndStore(
  db: SQLiteDatabase,
  userId: string = LOCAL_USER_ID,
): Promise<CombatPowerResult> {
  const input = await buildInput(db, userId);
  const result = computeCombatPower(input);
  await upsertSnapshot(db, result, todayLocal(), userId);
  return result;
}
