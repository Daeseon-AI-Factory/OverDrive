// "전사 완성도" — the WARRIOR COMPLETION sheet. The north-star feeling (§ product): watching
// yourself get forged into a complete warrior. NOT another endless number — a set of axes that FILL
// toward "complete", fed by REAL data (so it's an honest mirror, not abstract).
//
// Axes (builder-chosen): 근력(strength) + 피지컬(physique) 위주, 규율(discipline)도. Each 0..1.
// Anti-shame (§9): an axis with no data source is INACTIVE (dropped + the rest renormalized) — never
// a hidden 0 dragging you down; the physique/body framing is improvement-toward-your-own-goal only.

import { clamp01 } from '../combat-power/curves';

export type WarriorAxisKey = 'strength' | 'physique' | 'discipline';

/** Raw, real-data inputs. strength01/streak01/discipline01 come straight from the Combat Power
 *  breakdown (already normalized 0..1); physique is derived from body composition + goal weight. */
export interface WarriorInput {
  /** Combat Power `strengthVolume` component score (0..1). */
  strength01: number;
  /** Combat Power `streak` component score (0..1). */
  streak01: number;
  /** Combat Power `discipline` (protein/rest) component score (0..1). */
  discipline01: number;
  /** Whether discipline (protein/rest) is being tracked at all. */
  disciplineTracked: boolean;
  /** Body fat as a FRACTION (0.18 = 18%), or null if unknown. */
  bodyFatFraction: number | null;
  /** Current bodyweight (kg), or null. */
  weightKg: number | null;
  /** Onboarding start weight (kg), or null. */
  startWeightKg: number | null;
  /** Goal weight (kg), or null. */
  targetWeightKg: number | null;
}

export interface WarriorAxis {
  key: WarriorAxisKey;
  /** 0..1 fill toward "complete". */
  fill01: number;
  /** Had a real data source this period. Inactive → excluded from `overall01` (anti-shame). */
  active: boolean;
}

export interface WarriorCompletion {
  axes: WarriorAxis[];
  /** Weighted completion over ACTIVE axes only, 0..1. */
  overall01: number;
  /** The lowest active axis — "what to forge next" (the actionable completion arc). null if all maxed. */
  nextFocus: WarriorAxisKey | null;
}

// 근력+피지컬 위주, 규율도 챙겨서 (builder). Renormalized over active axes.
export const AXIS_WEIGHT: Record<WarriorAxisKey, number> = {
  strength: 0.35,
  physique: 0.35,
  discipline: 0.3,
};

// Body-fat fill band: framed as progress toward a lean-athletic range (health/improvement, §9 —
// never shame). 25%+ → 0, 12% → fully filled. Tunable.
const BF_HIGH = 0.25;
const BF_LOW = 0.12;

/** Physique fill from body composition + goal-weight progress. Returns null when no body data. */
function physiqueFill(input: WarriorInput): number | null {
  const parts: number[] = [];
  // Progress along your OWN start→target weight (self-chosen goal — works for cut or bulk).
  if (
    input.weightKg != null &&
    input.startWeightKg != null &&
    input.targetWeightKg != null &&
    input.startWeightKg !== input.targetWeightKg
  ) {
    const prog = (input.weightKg - input.startWeightKg) / (input.targetWeightKg - input.startWeightKg);
    parts.push(clamp01(prog));
  }
  // Body fat toward a lean-athletic band (bonus signal when available).
  if (input.bodyFatFraction != null) {
    parts.push(clamp01((BF_HIGH - input.bodyFatFraction) / (BF_HIGH - BF_LOW)));
  }
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/** Pure: real data → the three completion axes + weighted overall + next focus. */
export function warriorCompletion(input: WarriorInput): WarriorCompletion {
  const physique = physiqueFill(input);
  const disciplineFill = input.disciplineTracked
    ? (clamp01(input.streak01) + clamp01(input.discipline01)) / 2
    : clamp01(input.streak01); // streak alone until protein/rest is tracked

  const axes: WarriorAxis[] = [
    { key: 'strength', fill01: clamp01(input.strength01), active: true },
    { key: 'physique', fill01: clamp01(physique ?? 0), active: physique != null },
    { key: 'discipline', fill01: disciplineFill, active: true },
  ];

  const activeAxes = axes.filter((a) => a.active);
  const wSum = activeAxes.reduce((s, a) => s + AXIS_WEIGHT[a.key], 0);
  const overall01 = wSum > 0 ? clamp01(activeAxes.reduce((s, a) => s + (AXIS_WEIGHT[a.key] / wSum) * a.fill01, 0)) : 0;

  // "What to forge next" = lowest active axis that isn't basically complete.
  const candidates = activeAxes.filter((a) => a.fill01 < 0.999).sort((a, b) => a.fill01 - b.fill01);
  const nextFocus = candidates.length > 0 ? candidates[0].key : null;

  return { axes, overall01, nextFocus };
}
