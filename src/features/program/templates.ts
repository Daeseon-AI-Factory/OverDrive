import type { DayType } from '@/db/types';
import { defaultWeeklyProgram, slotFromExerciseId } from './defaultProgram';
import type { ProgramDayConfig, WeeklyProgram } from './types';

// Curated starting points for onboarding + the program editor. The user taps one, then tweaks.
// Each build() returns a full 7-day program. Day names are stored as i18n KEYS (labelKey), resolved
// at render, so they follow language changes; the editor's TextInput sets a literal label to override.
// NOTE: DayType is coarse (upper/lower/cardio/rest, per the workout_session CHECK constraint), so
// push/pull both tag as 'upper' and full-body tags as 'upper'. The day NAME carries the nuance.

export interface SplitTemplate {
  key: 'upperLower' | 'ppl' | 'fullBody';
  titleKey: string;
  descKey: string;
  build: () => WeeklyProgram;
}

function strengthDay(dayType: Extract<DayType, 'upper' | 'lower'>, labelKey: string, ids: string[]): ProgramDayConfig {
  return { dayType, label: null, labelKey, slots: ids.map(slotFromExerciseId) };
}
function cardioDay(labelKey: string, ids: string[]): ProgramDayConfig {
  return { dayType: 'cardio', label: null, labelKey, slots: ids.map(slotFromExerciseId) };
}
function restDay(labelKey: string): ProgramDayConfig {
  return { dayType: 'rest', label: null, labelKey, slots: [] };
}

export const SPLIT_TEMPLATES: SplitTemplate[] = [
  {
    key: 'upperLower',
    titleKey: 'program.template.upperLower.title',
    descKey: 'program.template.upperLower.desc',
    // The built-in default IS an upper/lower split; defaultWeeklyProgram already carries labelKeys.
    build: () => defaultWeeklyProgram(),
  },
  {
    key: 'ppl',
    titleKey: 'program.template.ppl.title',
    descKey: 'program.template.ppl.desc',
    build: () => {
      const push = () => ['barbell_bench_press', 'overhead_press', 'incline_db_press', 'lateral_raise', 'triceps_pushdown'];
      const pull = () => ['pull_up', 'barbell_row', 'lat_pulldown', 'face_pull', 'db_curl'];
      const legs = () => ['barbell_back_squat', 'romanian_deadlift', 'leg_press', 'leg_curl', 'standing_calf_raise'];
      return {
        1: strengthDay('upper', 'program.template.ppl.push', push()),
        2: strengthDay('upper', 'program.template.ppl.pull', pull()),
        3: strengthDay('lower', 'program.template.ppl.legs', legs()),
        4: strengthDay('upper', 'program.template.ppl.push', push()),
        5: strengthDay('upper', 'program.template.ppl.pull', pull()),
        6: strengthDay('lower', 'program.template.ppl.legs', legs()),
        0: restDay('program.dayType.rest'),
      };
    },
  },
  {
    key: 'fullBody',
    titleKey: 'program.template.fullBody.title',
    descKey: 'program.template.fullBody.desc',
    build: () => ({
      1: strengthDay('upper', 'program.template.fullBody.dayA', ['barbell_back_squat', 'barbell_bench_press', 'barbell_row', 'overhead_press', 'hanging_leg_raise']),
      2: restDay('program.dayType.rest'),
      3: strengthDay('upper', 'program.template.fullBody.dayB', ['deadlift', 'overhead_press', 'lat_pulldown', 'leg_press', 'hanging_leg_raise']),
      4: restDay('program.dayType.rest'),
      5: strengthDay('upper', 'program.template.fullBody.dayC', ['bulgarian_split_squat', 'incline_db_press', 'barbell_row', 'romanian_deadlift', 'lateral_raise']),
      6: cardioDay('program.dayType.cardio', ['zone2_run']),
      0: restDay('program.dayType.rest'),
    }),
  },
];

export function templateByKey(key: string): SplitTemplate | undefined {
  return SPLIT_TEMPLATES.find((template) => template.key === key);
}
