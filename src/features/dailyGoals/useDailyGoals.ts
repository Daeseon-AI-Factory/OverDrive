import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import {
  addProgress,
  addTarget,
  getTodayGoals,
  removeTarget,
  resetProgress,
  type TodayGoal,
} from '@/db/repos/dailyGoalRepo';
import type { GoalUnit } from '@/db/types';
import { classifyEvent } from '@/features/juice/classifyEvent';
import { useJuice } from '@/features/juice/JuiceProvider';
import { useCombatPowerStore } from '@/stores/combatPowerStore';

/**
 * Daily training goals: recurring targets you crush each day. Bumping progress is optimistic + local
 * (cheap, never blocks). Completing a goal recomputes Combat Power (the daily-goals component rises →
 * the number is REAL, not fake XP) and fires a solid JUICE pop = earned dopamine. Mirrors DisciplineCard.
 */
export function useDailyGoals() {
  const db = useSQLiteContext();
  const juice = useJuice();
  const [goals, setGoals] = useState<TodayGoal[]>([]);

  const reload = useCallback(async () => {
    setGoals(await getTodayGoals(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const g = await getTodayGoals(db);
        if (alive) setGoals(g);
      })();
      return () => {
        alive = false;
      };
    }, [db]),
  );

  const bump = useCallback(
    async (goal: TodayGoal, amount: number) => {
      const prev = useCombatPowerStore.getState().score;
      const res = await addProgress(db, { targetId: goal.target.id, amount, target: goal.target.target });
      setGoals((gs) =>
        gs.map((g) => (g.target.id === goal.target.id ? { ...g, progress: res.progress, done: res.done } : g)),
      );
      if (res.justCompleted) {
        // Completing a goal moves Combat Power → recompute, then celebrate with the real delta.
        const result = await recomputeAndStore(db);
        useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);
        // rir:2 + hitTargetReps lands the 'solid' T2 tier (a satisfying, earned pop — not a max event).
        juice.fire(
          classifyEvent({ kind: 'set', isPr: false, rir: 2, hitTargetReps: true, deltaCp: result.score - prev }),
        );
      }
    },
    [db, juice],
  );

  const reset = useCallback(
    async (goal: TodayGoal) => {
      await resetProgress(db, goal.target.id);
      setGoals((gs) => gs.map((g) => (g.target.id === goal.target.id ? { ...g, progress: 0, done: false } : g)));
      // Un-completing can lower CP; recompute quietly (no JUICE).
      const result = await recomputeAndStore(db);
      useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);
    },
    [db],
  );

  const add = useCallback(
    async (input: { label: string; unit: GoalUnit; target: number }) => {
      await addTarget(db, input);
      await reload();
    },
    [db, reload],
  );

  const remove = useCallback(
    async (targetId: string) => {
      await removeTarget(db, targetId);
      await reload();
      const result = await recomputeAndStore(db);
      useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);
    },
    [db, reload],
  );

  return { goals, bump, reset, add, remove };
}
