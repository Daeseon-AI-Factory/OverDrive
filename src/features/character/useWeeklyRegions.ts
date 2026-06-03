import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ramp } from '@/features/combat-power/curves';
import { useSessionStore } from '@/features/forge/sessionStore';
import { localDateDaysAgo } from '@/lib/date';
import { EXERCISE_TO_REGION, type BodyRegionId } from './regions';

export type RegionGlow = Record<BodyRegionId, number>;
const ZERO: RegionGlow = { chest: 0, shoulders: 0, back: 0, arms: 0, core: 0, legs: 0 };
const FULL_GLOW_SETS = 6; // a region hits full glow at ~6 sets this week

/**
 * Per-region "trained this week" glow intensity (0..1), by set count so bodyweight work counts too.
 * Refreshes on screen focus and after each logged set (sessionStore.setCount).
 */
export function useWeeklyRegions(): RegionGlow {
  const db = useSQLiteContext();
  const setCount = useSessionStore((s) => s.setCount);
  const [glow, setGlow] = useState<RegionGlow>(ZERO);

  const load = useCallback(async () => {
    const since = localDateDaysAgo(6);
    const rows = await db.getAllAsync<{ exercise_id: string }>(
      `SELECT sl.exercise_id FROM set_log sl
       JOIN workout_session ws ON ws.id = sl.session_id WHERE ws.date >= ?`,
      [since],
    );
    const counts: RegionGlow = { ...ZERO };
    for (const r of rows) {
      const region = EXERCISE_TO_REGION[r.exercise_id];
      if (region) counts[region] += 1;
    }
    setGlow({
      chest: ramp(counts.chest, FULL_GLOW_SETS),
      shoulders: ramp(counts.shoulders, FULL_GLOW_SETS),
      back: ramp(counts.back, FULL_GLOW_SETS),
      arms: ramp(counts.arms, FULL_GLOW_SETS),
      core: ramp(counts.core, FULL_GLOW_SETS),
      legs: ramp(counts.legs, FULL_GLOW_SETS),
    });
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // Re-query when a set is logged (setCount) so the body-map glow updates live without leaving the
  // screen. Async data load on a dependency change — the set-state rule over-flags this.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, setCount]);

  return glow;
}
