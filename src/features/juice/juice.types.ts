export type Tier = 1 | 2 | 3 | 4;

/** Matches PowerEvent.reason in the DB schema (spec §5). */
export type PowerEventReason = 'set' | 'pr' | 'session' | 'streak' | 'levelup';

/**
 * What just happened, fed to the pure tier classifier. The caller builds this AFTER the DB write
 * has resolved — JUICE never blocks logging (spec §6.4 철칙).
 */
export type JuiceEvent =
  | { kind: 'set'; isPr: boolean; rir: number | null; hitTargetReps: boolean; deltaCp: number }
  | { kind: 'session'; deltaCp: number }
  | { kind: 'streak'; streakDays: number; isMilestone: boolean; deltaCp: number }
  | { kind: 'levelup'; deltaCp: number };

export interface JuiceVerdict {
  tier: Tier;
  reason: PowerEventReason;
  /** Combat-Power delta that triggered this (for the "+N" float-up). */
  deltaCp: number;
  /** 0..1 visual intensity → drives the uIntensity shader uniform. */
  intensity01: number;
  /** T1–T2 auto-dismiss; T3–T4 tap-to-skip. */
  dismiss: 'auto' | 'tap';
  durationMs: number;
}
