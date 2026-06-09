// WEEKLY BOSS — your own PR as the enemy. Pure picker: given per-exercise stats, choose this week's
// boss (the lift you've trained most recently, rotated weekly for variety) and a beatable target
// just above your best. Defeating it = landing a PR on that exercise this week (derived from
// set_log.is_pr — no extra state). Ties 뽕맛 to REAL progressive overload (실제도움): the dopamine is
// earned, which is what keeps it alive past the ~12-week gamification decay.

import { hash01 } from './rival';

export interface BossCandidate {
  exerciseId: string;
  isBodyweight: boolean;
  bestWeight: number; // weight of the best-scoring set
  bestReps: number;
  bestScore: number;
  sets14d: number; // training frequency, last 14 days
}

export interface WeeklyBoss {
  exerciseId: string;
  isBodyweight: boolean;
  targetWeight: number; // kg (0 for bodyweight)
  targetReps: number;
}

/** Stable numeric key for a week (yyyy-mm-dd of its Monday). */
export function weekSeed(weekStart: string): number {
  return Number(weekStart.replace(/-/g, '')) >>> 0;
}

/**
 * Pick this week's boss: among exercises actually trained (sets14d > 0, with a prior best),
 * rank by frequency then best score, and rotate deterministically among the top 3 by week
 * (variety without storage). Returns null when there's no history yet (no shame, no fake boss).
 */
export function pickWeeklyBoss(cands: BossCandidate[], weekStart: string): WeeklyBoss | null {
  const pool = cands
    .filter((c) => c.sets14d > 0 && c.bestScore > 0 && c.bestReps > 0)
    .sort((a, b) => b.sets14d - a.sets14d || b.bestScore - a.bestScore);
  if (pool.length === 0) return null;
  const top = pool.slice(0, 3);
  const idx = Math.floor(hash01(weekSeed(weekStart), 7) * top.length) % top.length;
  const c = top[idx] ?? top[0];

  if (c.isBodyweight || c.bestWeight <= 0) {
    // bodyweight boss: same load, one more rep
    return { exerciseId: c.exerciseId, isBodyweight: true, targetWeight: 0, targetReps: c.bestReps + 1 };
  }
  // loaded boss: +2.5kg at the same reps (the classic next plate-step)
  return {
    exerciseId: c.exerciseId,
    isBodyweight: false,
    targetWeight: Math.round((c.bestWeight + 2.5) * 2) / 2,
    targetReps: c.bestReps,
  };
}
