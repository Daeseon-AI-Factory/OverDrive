// Combat Power v1 tuning dials. ALL of these are deliberate "feel" knobs, not science.
// Combat Power is a FUN, self-defined score — NOT a scientific fitness metric. The UI must
// label it as such (spec §6.3 / §11.4). Tune freely after dogfooding.

export const BASE_SCALE = 9999; // max raw scale before clamping
export const CP_FLOOR = 50; // anti-shame: showing up at all is always > 0
export const TRUST_BONUS = 0.15; // verified data adds up to +15% (bonus only, never a penalty)
export const GOAL_BONUS = 0.15; // crushing daily goals adds up to +15% (bonus only, never dilutes/penalizes)
export const ASCENDANT_MIN = 8200; // 초월자 threshold; gated by breadth (see computeCombatPower)

// Sub-score shaping constants
export const K_VOL = 15000; // strength volume (Σ weight·reps over 7d) at ~63% saturation
export const SESS_CAP = 5; // weekly sessions that ramp to full credit
export const K_COND = 90; // conditioning units (Σ min(min,45)·rpeWeight) at ~63% saturation
export const K_STREAK = 10; // streak days at ~63% saturation
export const K_GOALS = 14; // completed daily goal-days over 7d (~2/day) at ~63% saturation

// Applied at AGGREGATION time (in the repo), documented here: a PR set's volume counts ×1.15
// toward strengthVolume7d. computeCombatPower receives the already-weighted total.
export const PR_VOLUME_MULT = 1.15;

// Base weights per basket component (spec §6.3). Inactive components (no data source yet) are
// dropped and the remaining weights are renormalized — so missing future data never imposes a
// hidden ceiling on the score. recomp + fitnessMarkers arrive in Phase 5.
export const COMPONENT_BASE_WEIGHTS = {
  strengthVolume: 0.3,
  sessions: 0.15,
  conditioning: 0.15,
  streak: 0.1,
  discipline: 0.1,
  recomp: 0.08, // Phase 5+
  fitnessMarkers: 0.12, // Phase 5+
} as const;

export type ComponentKey = keyof typeof COMPONENT_BASE_WEIGHTS;
