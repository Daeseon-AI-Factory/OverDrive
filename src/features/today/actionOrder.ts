export type TodayActionSurface = 'forge' | 'quicklog' | 'food' | 'character' | 'goals' | 'discipline';

const ACTIVE_ORDER: readonly TodayActionSurface[] = [
  'forge',
  'quicklog',
  'food',
  'character',
  'goals',
  'discipline',
];

const IDLE_ORDER: readonly TodayActionSurface[] = ['food', 'quicklog', 'goals', 'discipline', 'character'];

/** High-frequency actions first; game/progression surfaces stay below this lane. */
export function todayActionOrder(sessionActive: boolean): readonly TodayActionSurface[] {
  return sessionActive ? ACTIVE_ORDER : IDLE_ORDER;
}
