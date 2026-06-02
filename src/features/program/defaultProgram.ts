import type { DayType } from '../../db/types';

// Evidence-based default weekly program (spec §6.2): 각 근육 주2회 · RIR 1–3 · 점진적 과부하 ·
// 인터벌 주2회 · 휴식 1일. A code constant, not a DB table (editable later).
// JS getDay(): 0=Sun … 6=Sat.

export interface ProgramDay {
  dayType: DayType;
  title: string;
  focus: string;
  exerciseIds: string[]; // slugs from the exercise seed
}

export const WEEKLY_PROGRAM: Record<number, ProgramDay> = {
  1: { dayType: 'upper', title: '상체 A', focus: '벤치 + 풀업 중심', exerciseIds: ['barbell_bench_press', 'pull_up', 'overhead_press', 'barbell_row', 'db_curl', 'triceps_pushdown'] },
  2: { dayType: 'lower', title: '하체 A', focus: '스쿼트 중심', exerciseIds: ['barbell_back_squat', 'romanian_deadlift', 'leg_press', 'standing_calf_raise', 'hanging_leg_raise'] },
  3: { dayType: 'cardio', title: '인터벌', focus: 'HIIT 컨디셔닝', exerciseIds: ['hiit_intervals'] },
  4: { dayType: 'upper', title: '상체 B', focus: '오버헤드 + 로우 중심', exerciseIds: ['overhead_press', 'lat_pulldown', 'incline_db_press', 'barbell_row', 'lateral_raise', 'db_curl'] },
  5: { dayType: 'lower', title: '하체 B', focus: '데드리프트 중심', exerciseIds: ['deadlift', 'bulgarian_split_squat', 'leg_curl', 'standing_calf_raise', 'plank'] },
  6: { dayType: 'cardio', title: '인터벌 / Zone 2', focus: '유산소', exerciseIds: ['zone2_run', 'hiit_intervals'] },
  0: { dayType: 'rest', title: '휴식', focus: '회복 — 단백질/수면', exerciseIds: [] },
};

export function programForDay(weekday: number): ProgramDay {
  return WEEKLY_PROGRAM[weekday] ?? WEEKLY_PROGRAM[0]!;
}

export function todayProgram(now: Date = new Date()): ProgramDay {
  return programForDay(now.getDay());
}
