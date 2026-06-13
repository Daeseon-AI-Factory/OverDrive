// Customizable weekly program model (spec §6.2). Phase 1 stores this in UserSettings JSON
// (settings.customProgram); Phase 2 migrates with the settings jsonb. The built-in default lives
// in defaultProgram.ts — customProgram === null means "use the built-in default".

import type { DayType } from '@/db/types';

/**
 * One programmed exercise within a day. targetSets / repLow / repHigh OVERRIDE the exercise
 * catalog defaults (exercise.default_sets / rep_low / rep_high) for this slot only — the catalog
 * value is just the seed used when a slot is first added.
 */
export interface ProgramSlot {
  exerciseId: string;
  targetSets: number;
  repLow: number;
  repHigh: number;
}

export interface ProgramDayConfig {
  dayType: DayType;
  /** User-entered free-text day name. Wins over labelKey when set; null → use labelKey/day type. */
  label: string | null;
  /**
   * i18n key for a template/default-derived day name (e.g. 'program.template.ppl.push'), resolved
   * at render so the name follows language changes. Optional; user free-text (label) overrides it.
   */
  labelKey?: string | null;
  /** Ordered exercises for the day. Empty for a rest day. */
  slots: ProgramSlot[];
}

/** Weekday 0(Sun)..6(Sat) → that day's config. JS Date.getDay() convention. */
export type WeeklyProgram = Record<number, ProgramDayConfig>;
