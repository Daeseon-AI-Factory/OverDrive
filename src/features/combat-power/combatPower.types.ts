import type { Grade } from './grades';

/**
 * Pre-aggregated inputs for the Combat Power formula (typically built by the repo layer from
 * the last 7 days of logs + markers). Pure value object — no DB rows here.
 */
export interface CombatPowerInput {
  /** Σ(weight·reps) over the last 7d; PR sets already weighted ×PR_VOLUME_MULT at aggregation. */
  strengthVolume7d: number;
  /** Distinct completed sessions in the last 7d. */
  sessions7d: number;
  /** Conditioning units over 7d: Σ min(minutes,45)·rpeWeight. */
  conditioningUnits7d: number;
  /** Consecutive active days. */
  streakDays: number;
  /** Protein/rest discipline. `null`/omitted = not tracked → component dropped (renormalized). */
  discipline?: { proteinDays: number; restOkDays: number } | null;
  /** Phase 5+: normalized recomposition progress 0..1. `null` = inactive. */
  recomp?: number | null;
  /** Phase 5+: normalized fitness-marker score 0..1. `null` = inactive. */
  fitnessMarkers?: number | null;
  /** Share of inputs from verified sources (watch/import/sensor), 0..1. Bonus only. */
  verifiedRatio: number;
}

export interface CombatPowerComponent {
  key: string;
  label: string;
  /** Whether this component had a data source this period (inactive → weight 0, dropped). */
  active: boolean;
  /** Effective weight after renormalizing over active components (sums to 1 across active). */
  weight: number;
  /** Normalized sub-score 0..1. */
  score01: number;
  /** Contribution to basket01 = weight · score01. */
  points: number;
}

export interface CombatPowerResult {
  /** Final score, CP_FLOOR..BASE_SCALE. FUN self-defined metric — UI must label as non-scientific. */
  score: number;
  grade: Grade;
  /** Weighted-average basket, 0..1, before scaling/trust. */
  basket01: number;
  /** 1 + TRUST_BONUS·verifiedRatio — always >= 1 (anti-shame, never a penalty). */
  trustMultiplier: number;
  verifiedRatio: number;
  /** Whether 초월자 (top grade) is reachable: requires breadth (verified data or markers/recomp). */
  breadthUnlocked: boolean;
  breakdown: CombatPowerComponent[];
}
