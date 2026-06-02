import { clamp, clamp01, ramp, sat } from './curves';
import {
  ASCENDANT_MIN,
  BASE_SCALE,
  COMPONENT_BASE_WEIGHTS,
  CP_FLOOR,
  K_COND,
  K_STREAK,
  K_VOL,
  SESS_CAP,
  TRUST_BONUS,
  type ComponentKey,
} from './constants';
import { gradeForScore } from './grades';
import type {
  CombatPowerComponent,
  CombatPowerInput,
  CombatPowerResult,
} from './combatPower.types';

interface RawComponent {
  key: ComponentKey;
  label: string;
  active: boolean;
  score01: number;
}

/**
 * Combat Power v1 — a FUN, self-defined score (NOT a scientific metric; the UI must say so).
 *
 * Design properties (all unit-tested):
 *  - Bounded [CP_FLOOR, BASE_SCALE], monotonic, integer.
 *  - Anti-shame: an empty/bad week still yields >= CP_FLOOR; unverified data is never penalized
 *    (trustMultiplier >= 1 always); verified data is a bonus only.
 *  - Graceful degradation: components with no data source are dropped and the remaining weights
 *    are renormalized, so absent future data (recomp/markers) never imposes a hidden ceiling.
 *  - Breadth gate: the top grade (초월자) requires breadth — verified data OR markers/recomp.
 *    Phase 1 (self-report, no markers) therefore caps at 괴수. This is a tunable dial.
 */
export function computeCombatPower(input: CombatPowerInput): CombatPowerResult {
  const verifiedRatio = clamp01(input.verifiedRatio ?? 0);

  const disciplineScore = input.discipline
    ? clamp01(
        (clamp01(input.discipline.proteinDays / 7) +
          clamp01(input.discipline.restOkDays / 7)) /
          2,
      )
    : 0;

  const raw: RawComponent[] = [
    { key: 'strengthVolume', label: '근력 볼륨', active: true, score01: sat(input.strengthVolume7d, K_VOL) },
    { key: 'sessions', label: '주간 세션', active: true, score01: ramp(input.sessions7d, SESS_CAP) },
    { key: 'conditioning', label: '컨디셔닝', active: true, score01: sat(input.conditioningUnits7d, K_COND) },
    { key: 'streak', label: '연속', active: true, score01: sat(input.streakDays, K_STREAK) },
    { key: 'discipline', label: '규율(단백질/휴식)', active: input.discipline != null, score01: disciplineScore },
    { key: 'recomp', label: '리컴프', active: input.recomp != null, score01: clamp01(input.recomp ?? 0) },
    { key: 'fitnessMarkers', label: '체력 마커', active: input.fitnessMarkers != null, score01: clamp01(input.fitnessMarkers ?? 0) },
  ];

  const activeBaseSum = raw.reduce(
    (sum, c) => sum + (c.active ? COMPONENT_BASE_WEIGHTS[c.key] : 0),
    0,
  );

  const breakdown: CombatPowerComponent[] = raw.map((c) => {
    const weight = c.active && activeBaseSum > 0 ? COMPONENT_BASE_WEIGHTS[c.key] / activeBaseSum : 0;
    return {
      key: c.key,
      label: c.label,
      active: c.active,
      weight,
      score01: c.score01,
      points: weight * c.score01,
    };
  });

  const basket01 = clamp01(breakdown.reduce((sum, c) => sum + c.points, 0));
  const trustMultiplier = 1 + TRUST_BONUS * verifiedRatio; // >= 1 always
  const breadthUnlocked = verifiedRatio > 0 || input.fitnessMarkers != null || input.recomp != null;
  const maxScore = breadthUnlocked ? BASE_SCALE : ASCENDANT_MIN - 1;

  const score = clamp(Math.round(BASE_SCALE * basket01 * trustMultiplier), CP_FLOOR, maxScore);

  return {
    score,
    grade: gradeForScore(score),
    basket01,
    trustMultiplier,
    verifiedRatio,
    breadthUnlocked,
    breakdown,
  };
}
