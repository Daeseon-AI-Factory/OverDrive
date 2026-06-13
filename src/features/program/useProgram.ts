import { useTranslation } from 'react-i18next';
import type { DayType } from '@/db/types';
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
      slots: customDay.slots,
    };
  }

  const meta = BUILTIN_DAY_META[weekday] ?? BUILTIN_DAY_META[0]!;
  const day = defaultDayConfig(weekday);
  return { dayType: day.dayType, title: t(meta.titleKey), focus: t(meta.focusKey), slots: day.slots };
}
