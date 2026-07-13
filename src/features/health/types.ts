/**
 * A read-only snapshot of the user's device health data (Apple Health on iOS; Android Health
 * Connect is a later platform impl). Feeds Combat Power's VERIFIED inputs only — HealthKit data is
 * sensor/watch-confirmed, so it raises the trust multiplier and fitness markers (bonus only, never a
 * penalty — §9). Combat Power and any game-derived numbers are NEVER written back to Health (§4).
 */
export interface HealthSnapshot {
  /** Platform supports health data AND the user has connected it. */
  connected: boolean;
  /** Count of health-platform workouts in the last 7 days (sensor-verified activity). */
  workouts7d: number;
  /** Most recent body mass, kg. */
  bodyMassKg: number | null;
  /** Most recent body-fat fraction (0..1 as Health reports it). */
  bodyFatFraction: number | null;
  /** Most recent VO2 max (cardio fitness). */
  vo2Max: number | null;
}

export const EMPTY_HEALTH_SNAPSHOT: HealthSnapshot = {
  connected: false,
  workouts7d: 0,
  bodyMassKg: null,
  bodyFatFraction: null,
  vo2Max: null,
};
