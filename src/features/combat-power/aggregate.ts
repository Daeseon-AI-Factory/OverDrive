import { todayLocal } from '../../lib/date';

/** yyyy-mm-dd shifted by `delta` days (local calendar). */
export function shiftDay(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + delta);
  return todayLocal(dt);
}

/**
 * Consecutive-day training streak ending at/around `today` (pure, unit-tested).
 * Counts back from today; if today has no session yet, it anchors on yesterday so an
 * in-progress day doesn't zero a live streak. A real gap (missed full day) breaks it.
 */
export function computeStreak(sessionDates: Iterable<string>, today: string): number {
  const set = new Set(sessionDates);
  let cursor: string;
  if (set.has(today)) {
    cursor = today;
  } else {
    const yesterday = shiftDay(today, -1);
    if (!set.has(yesterday)) return 0;
    cursor = yesterday;
  }
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}
