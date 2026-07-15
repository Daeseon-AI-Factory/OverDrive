import { useTranslation } from 'react-i18next';
import type { DayType } from '@/db/types';
import { supportsLegacyCurrentLogger } from '@/features/exercises/catalog/loggingSupport';
import { useSettingsStore } from '@/stores/settingsStore';
import { BUILTIN_DAY_META, defaultDayConfig } from './defaultProgram';
import { dayDisplayName } from './resolve';
import type { ProgramSlot } from './types';

export interface ResolvedToday {
  dayType: DayType;
  /** Display title (custom day label, built-in title, or day-type fallback). */
  title: string;
  /** Display focus line. */
  focus: string;
  slots: ProgramSlot[];
}

/**
 * Today's program, resolved + localized for the UI. Reads customProgram from settingsStore (reactive)
 * so editing the program updates Today without a remount. weekday derived from `now` (default today).
 */
export function useTodayProgram(now: Date = new Date()): ResolvedToday {
  const { t } = useTranslation();
  const custom = useSettingsStore((s) => s.customProgram);
  const weekday = now.getDay();

  const customDay = custom?.[weekday] ?? null;
  if (customDay) {
    return {
      dayType: customDay.dayType,
      title: dayDisplayName(customDay, t), // label > labelKey (localized) > day type
      focus: t(`program.dayType.${customDay.dayType}`),
      slots: currentLoggerSlots(customDay.slots),
    };
  }

  const meta = BUILTIN_DAY_META[weekday] ?? BUILTIN_DAY_META[0]!;
  const day = defaultDayConfig(weekday);
  return {
    dayType: day.dayType,
    title: t(meta.titleKey),
    focus: t(meta.focusKey),
    slots: currentLoggerSlots(day.slots),
  };
}

/**
 * Stored programs can outlive logger capabilities. Filter only the frozen legacy modes whose
 * semantics are known without a catalog lookup; catalog-backed pickers already block new
 * duration/distance strength rows until a matching logger exists.
 */
export function currentLoggerSlots(slots: readonly ProgramSlot[]): ProgramSlot[] {
  return slots.filter((slot) => supportsLegacyCurrentLogger(slot.exerciseId));
}
