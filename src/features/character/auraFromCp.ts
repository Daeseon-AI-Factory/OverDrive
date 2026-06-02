import { clamp01 } from '../combat-power/curves';
import { GRADES, gradeForScore, type GradeKey } from '../combat-power/grades';
import { colors } from '@/ui/theme/tokens';

// Maps Combat Power → the character's power-up aura (color + intensity). Pure & unit-tested.
// Intensity = progress THROUGH the current grade band, so grinding visibly charges the aura
// before the grade even flips. Color ramps cool→hot by grade.

const GRADE_AURA_COLOR: Record<GradeKey, string> = {
  ordinary: colors.textDim,
  rookie: colors.cyan,
  fighter: colors.violet,
  warrior: colors.violet,
  beast: colors.magenta,
  monster: colors.energyHi,
  ascendant: colors.flash,
};

export interface Aura {
  color: string;
  /** 0..1 progress through the current grade band → drives opacity/blur/pulse. */
  intensity01: number;
  gradeKey: GradeKey;
}

export function auraFromCp(score: number): Aura {
  const grade = gradeForScore(score);
  const idx = GRADES.findIndex((g) => g.key === grade.key);
  const next = idx >= 0 && idx < GRADES.length - 1 ? GRADES[idx + 1] : null;

  // Top grade (ascendant) has no next band → fully charged.
  const intensity01 = next ? clamp01((score - grade.min) / (next.min - grade.min)) : 1;

  return {
    color: GRADE_AURA_COLOR[grade.key] ?? colors.cyan,
    intensity01,
    gradeKey: grade.key,
  };
}
