import type { DayType } from '../../db/types';

// Evidence-based default weekly program (spec §6.2): 각 근육 주2회 · RIR 1–3 · 점진적 과부하 ·
// 인터벌 주2회 · 휴식 1일. Titles/focus are i18n keys (program.*) resolved in the UI.
// JS getDay(): 0=Sun … 6=Sat.

export interface ProgramDay {
  dayType: DayType;
  titleKey: string;
  focusKey: string;
  exerciseIds: string[];
}

export const WEEKLY_PROGRAM: Record<number, ProgramDay> = {
  1: { dayType: 'upper', titleKey: 'program.upperA.title', focusKey: 'program.upperA.focus', exerciseIds: ['barbell_bench_press', 'pull_up', 'overhead_press', 'barbell_row', 'db_curl', 'triceps_pushdown'] },
  2: { dayType: 'lower', titleKey: 'program.lowerA.title', focusKey: 'program.lowerA.focus', exerciseIds: ['barbell_back_squat', 'romanian_deadlift', 'leg_press', 'standing_calf_raise', 'hanging_leg_raise'] },
  3: { dayType: 'cardio', titleKey: 'program.intervals.title', focusKey: 'program.intervals.focus', exerciseIds: ['hiit_intervals'] },
  4: { dayType: 'upper', titleKey: 'program.upperB.title', focusKey: 'program.upperB.focus', exerciseIds: ['overhead_press', 'lat_pulldown', 'incline_db_press', 'barbell_row', 'lateral_raise', 'db_curl'] },
  5: { dayType: 'lower', titleKey: 'program.lowerB.title', focusKey: 'program.lowerB.focus', exerciseIds: ['deadlift', 'bulgarian_split_squat', 'leg_curl', 'standing_calf_raise', 'plank'] },
  6: { dayType: 'cardio', titleKey: 'program.intervalsZone2.title', focusKey: 'program.intervalsZone2.focus', exerciseIds: ['zone2_run', 'hiit_intervals'] },
  0: { dayType: 'rest', titleKey: 'program.rest.title', focusKey: 'program.rest.focus', exerciseIds: [] },
};

export function programForDay(weekday: number): ProgramDay {
  return WEEKLY_PROGRAM[weekday] ?? WEEKLY_PROGRAM[0]!;
}

export function todayProgram(now: Date = new Date()): ProgramDay {
  return programForDay(now.getDay());
}
