import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ramp } from '@/features/combat-power/curves';
import { regionsForMuscleGroup, TRAINING_REGIONS, type TrainingRegion } from '@/features/exercises/regionRecommendations';
import { useSessionStore } from '@/features/forge/sessionStore';
import { localDateDaysAgo } from '@/lib/date';

export type RegionGlow = Record<TrainingRegion, number>;
const ZERO: RegionGlow = {
  chest: 0,
  shoulders: 0,
  back: 0,
  biceps: 0,
  triceps: 0,
  core: 0,
  glutes: 0,
  quads: 0,
  hamstrings: 0,
  calves: 0,
};
const FULL_GLOW_SETS = 6;

/** Per-region weekly glow. DB muscle groups, not a seed-ID allowlist, drive the body. */
export function useWeeklyRegions(): RegionGlow {
  const db = useSQLiteContext();
  const setCount = useSessionStore((s) => s.setCount);
  const [glow, setGlow] = useState<RegionGlow>(ZERO);

  const load = useCallback(async () => {
    const since = localDateDaysAgo(6);
    const rows = await db.getAllAsync<{ muscle_group: string }>(
      `SELECT e.muscle_group FROM set_log sl
       JOIN workout_session ws ON ws.id = sl.session_id
       JOIN exercise e ON e.id = sl.exercise_id
       WHERE ws.date >= ?`,
      [since],
    );
    const counts: RegionGlow = { ...ZERO };
    for (const row of rows) {
      for (const region of regionsForMuscleGroup(row.muscle_group)) counts[region] += 1;
    }
    const next: RegionGlow = { ...ZERO };
    for (const region of TRAINING_REGIONS) next[region] = ramp(counts[region], FULL_GLOW_SETS);
    setGlow(next);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, setCount]);

  return glow;
}
