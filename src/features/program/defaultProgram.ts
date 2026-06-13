import { EXERCISE_SEED } from '@/db/seed';
import type { DayType } from '@/db/types';
import type { ProgramDayConfig, ProgramSlot, WeeklyProgram } from './types';

// Evidence-based default weekly program (spec §6.2): 각 근육 주2회 · RIR 1–3 · 점진적 과부하 ·
// 인터벌 주2회 · 휴식 1일. Titles/focus are i18n keys (program.*) resolved in the UI.
// JS getDay(): 0=Sun … 6=Sat. This is the BUILT-IN default; a user's customProgram overrides it.

interface BuiltinDay {
  dayType: DayType;
  titleKey: string;
  focusKey: string;
  exerciseIds: string[];
}

export const WEEKLY_PROGRAM: Record<number, BuiltinDay> = {
  1: { dayType: 'upper', titleKey: 'program.upperA.title', focusKey: 'program.upperA.focus', exerciseIds: ['barbell_bench_press', 'pull_up', 'overhead_press', 'barbell_row', 'db_curl', 'triceps_pushdown'] },
  2: { dayType: 'lower', titleKey: 'program.lowerA.title', focusKey: 'program.lowerA.focus', exerciseIds: ['barbell_back_squat', 'romanian_deadlift', 'leg_press', 'standing_calf_raise', 'hanging_leg_raise'] },
  3: { dayType: 'cardio', titleKey: 'program.intervals.title', focusKey: 'program.intervals.focus', exerciseIds: ['hiit_intervals'] },
  4: { dayType: 'upper', titleKey: 'program.upperB.title', focusKey: 'program.upperB.focus', exerciseIds: ['overhead_press', 'lat_pulldown', 'incline_db_press', 'barbell_row', 'lateral_raise', 'db_curl'] },
  5: { dayType: 'lower', titleKey: 'program.lowerB.title', focusKey: 'program.lowerB.focus', exerciseIds: ['deadlift', 'bulgarian_split_squat', 'leg_curl', 'standing_calf_raise', 'plank'] },
  6: { dayType: 'cardio', titleKey: 'program.intervalsZone2.title', focusKey: 'program.intervalsZone2.focus', exerciseIds: ['zone2_run', 'hiit_intervals'] },
  0: { dayType: 'rest', titleKey: 'program.rest.title', focusKey: 'program.rest.focus', exerciseIds: [] },
};

/** i18n title/focus keys for the built-in days (custom days carry a literal label instead). */
export const BUILTIN_DAY_META: Record<number, { titleKey: string; focusKey: string }> = Object.fromEntries(
  Object.entries(WEEKLY_PROGRAM).map(([weekday, day]) => [Number(weekday), { titleKey: day.titleKey, focusKey: day.focusKey }]),
);

const SEED_BY_ID = new Map(EXERCISE_SEED.map((exercise) => [exercise.id, exercise]));

/** A fresh slot seeded from the exercise catalog defaults (used for new and default-program slots). */
export function slotFromExerciseId(exerciseId: string): ProgramSlot {
  const seed = SEED_BY_ID.get(exerciseId);
  return {
    exerciseId,
    targetSets: seed?.default_sets ?? 3,
    repLow: seed?.rep_low ?? 8,
    repHigh: seed?.rep_high ?? 12,
  };
}

export function defaultDayConfig(weekday: number): ProgramDayConfig {
  const day = WEEKLY_PROGRAM[weekday] ?? WEEKLY_PROGRAM[0]!;
  // labelKey (not a baked string) so a materialized default day still localizes on language change.
  return { dayType: day.dayType, label: null, labelKey: day.titleKey, slots: day.exerciseIds.map(slotFromExerciseId) };
}

/** Materialize the full built-in default as a WeeklyProgram (for template/editor starting points). */
export function defaultWeeklyProgram(): WeeklyProgram {
  const program: WeeklyProgram = {};
  for (let weekday = 0; weekday <= 6; weekday += 1) program[weekday] = defaultDayConfig(weekday);
  return program;
}
