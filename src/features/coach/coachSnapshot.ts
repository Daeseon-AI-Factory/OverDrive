import type { SetLogRow } from '@/db/types';
import type { CoachLastSet } from './nextAction';

export type CoachSetRow = Pick<
  SetLogRow,
  'session_id' | 'exercise_id' | 'weight' | 'reps' | 'order_index' | 'logged_at'
>;

export interface CurrentSessionLastSet extends CoachLastSet {
  exerciseId: string;
  loggedAtMs: number;
}

export interface CoachStrengthSnapshot {
  /** Daily program totals deliberately include every session on the local date. */
  setsToday: Record<string, number>;
  /** Prefills use the latest daily set, except the active exercise is pinned to its own session. */
  lastSetByExercise: Record<string, CoachLastSet | undefined>;
  /** Rest and same-exercise continuation belong only to the active workout session. */
  currentSessionLastSet: CurrentSessionLastSet | null;
}

function isLater(candidate: CoachSetRow, current: CoachSetRow | null): boolean {
  if (current == null) return true;
  const candidateAt = Date.parse(candidate.logged_at);
  const currentAt = Date.parse(current.logged_at);
  if (Number.isFinite(candidateAt) && Number.isFinite(currentAt) && candidateAt !== currentAt) {
    return candidateAt > currentAt;
  }
  return candidate.order_index >= current.order_index;
}

/**
 * Split day-level progress from session-level continuation. A completed workout from the same day
 * still advances today's program, but it can never become an open workout's rest/exercise anchor.
 */
export function deriveCoachStrengthSnapshot(
  sets: readonly CoachSetRow[],
  activeSessionId: string | null,
): CoachStrengthSnapshot {
  const setsToday: Record<string, number> = {};
  const lastRows = new Map<string, CoachSetRow>();
  let currentRow: CoachSetRow | null = null;

  for (const set of sets) {
    setsToday[set.exercise_id] = (setsToday[set.exercise_id] ?? 0) + 1;
    if (isLater(set, lastRows.get(set.exercise_id) ?? null)) lastRows.set(set.exercise_id, set);
    if (activeSessionId != null && set.session_id === activeSessionId && isLater(set, currentRow)) {
      currentRow = set;
    }
  }

  const lastSetByExercise: Record<string, CoachLastSet | undefined> = {};
  for (const [exerciseId, set] of lastRows) {
    lastSetByExercise[exerciseId] = { weightKg: set.weight, reps: set.reps };
  }

  let currentSessionLastSet: CurrentSessionLastSet | null = null;
  if (currentRow != null) {
    const loggedAtMs = Date.parse(currentRow.logged_at);
    if (Number.isFinite(loggedAtMs)) {
      currentSessionLastSet = {
        exerciseId: currentRow.exercise_id,
        weightKg: currentRow.weight,
        reps: currentRow.reps,
        loggedAtMs,
      };
      // If another same-day session logged this exercise later, active-session continuation still
      // repeats the load actually performed in the workout the user is resuming.
      lastSetByExercise[currentRow.exercise_id] = {
        weightKg: currentRow.weight,
        reps: currentRow.reps,
      };
    }
  }

  return { setsToday, lastSetByExercise, currentSessionLastSet };
}
