import { defaultDayConfig } from './defaultProgram';
import type { ProgramDayConfig, ProgramSlot, WeeklyProgram } from './types';

/**
 * Resolve the config for a weekday: the user's custom day if present, else the built-in default.
 * Pure + synchronous (customProgram is hydrated into settingsStore at boot), so callers stay sync.
 */
export function resolveProgramDay(custom: WeeklyProgram | null, weekday: number): ProgramDayConfig {
  return custom?.[weekday] ?? defaultDayConfig(weekday);
}

/** exerciseId → slot, for O(1) per-exercise target lookup (overrides catalog defaults). */
export function slotTargetsById(day: ProgramDayConfig): Record<string, ProgramSlot> {
  const map: Record<string, ProgramSlot> = {};
  for (const slot of day.slots) map[slot.exerciseId] = slot;
  return map;
}

/**
 * Resolve a day's display name: user free-text label > localized labelKey > generic day-type name.
 * `t` is passed in so this stays a pure helper usable from any layer.
 */
export function dayDisplayName(day: ProgramDayConfig, t: (key: string) => string): string {
  const literal = day.label?.trim();
  if (literal) return literal;
  if (day.labelKey) return t(day.labelKey);
  return t(`program.dayType.${day.dayType}`);
}
