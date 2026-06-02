// Progressive-overload / PR detection (spec §6.1). Pure & unit-tested.
// A set is a PR when its performance score beats the previous best for that exercise.
// Score = estimated 1RM (Epley) for weighted lifts; for bodyweight (weight<=0) we fall back to
// reps, since the modality is constant per exercise so reps are comparable. (Bodyweight load
// estimation is a deliberate later refinement — see phase1-plan §7.)

/** Epley estimated 1RM: weight · (1 + reps/30). reps<=0 → 0. */
export function epley1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  return weight * (1 + reps / 30);
}

/** Comparable performance score for one set of a given exercise. */
export function setScore(weight: number, reps: number): number {
  if (weight > 0) return epley1RM(weight, reps);
  return Math.max(0, reps); // bodyweight: more reps = stronger
}

export interface PrResult {
  isPr: boolean;
  /** This set's score — store as the new best when isPr is true. */
  score: number;
}

/**
 * @param current        the set just logged
 * @param previousBest   previous best score for this exercise, or null if first-ever
 *
 * First-ever set is NOT a PR (nothing to beat) but still logs and pops (anti-shame T1/T2).
 * Matching the previous best is not a PR — you must exceed it.
 */
export function detectPr(
  current: { weight: number; reps: number },
  previousBest: number | null,
): PrResult {
  const score = setScore(current.weight, current.reps);
  const isPr = previousBest !== null && score > 0 && score > previousBest;
  return { isPr, score };
}
