import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { recomputeAndStore } from '../../db/repos/combatPowerRepo';
import { appendPowerEvent } from '../../db/repos/powerEventRepo';
import { addSet } from '../../db/repos/setLogRepo';
import type { LoggedVia } from '../../db/types';
import { useSessionStore } from '../forge/sessionStore';
import { useRestTimerStore } from '../rest/restTimerStore';
import { useCombatPowerStore } from '../../stores/combatPowerStore';
import { classifyEvent } from '../juice/classifyEvent';
import { useJuice } from '../juice/JuiceProvider';
import type { JuiceVerdict } from '../juice/juice.types';

export interface LogSetInput {
  sessionId: string;
  exerciseId: string;
  weight: number;
  reps: number;
  rir: number | null;
  hitTargetReps: boolean;
  loggedVia?: LoggedVia;
}

/**
 * The logging hot path (spec §6.1/§6.4). Order is the contract:
 *   1. addSet  — the durable write (with PR detection). The set is SAVED here.
 *   2. recompute Combat Power + update the store (drives the odometer).
 *   3. juice.fire(...) — synchronous, non-blocking celebration (NEVER awaited).
 *   4. appendPowerEvent — fire-and-forget trend/debug log (not awaited).
 * JUICE never gates the write; a haptic/flash failure can't lose a rep.
 */
export function useLogSet() {
  const db = useSQLiteContext();
  const juice = useJuice();

  return useCallback(
    async (input: LogSetInput): Promise<{ setId: string; isPr: boolean; deltaCp: number; verdict: JuiceVerdict }> => {
      const prevScore = useCombatPowerStore.getState().score;

      const { row, isPr } = await addSet(db, {
        sessionId: input.sessionId,
        exerciseId: input.exerciseId,
        weight: input.weight,
        reps: input.reps,
        rir: input.rir,
        loggedVia: input.loggedVia ?? 'manual',
      });
      useSessionStore.getState().recordSet(input.weight * input.reps); // feeds the Forge session summary
      useRestTimerStore.getState().start(); // auto rest countdown (non-blocking; restarts per set)

      const result = await recomputeAndStore(db);
      useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);
      const deltaCp = result.score - prevScore;

      const verdict = classifyEvent({
        kind: 'set',
        isPr,
        rir: input.rir,
        hitTargetReps: input.hitTargetReps,
        deltaCp,
      });
      juice.fire(verdict); // non-blocking

      void appendPowerEvent(db, {
        tier: verdict.tier,
        delta: deltaCp,
        reason: verdict.reason,
        sessionId: input.sessionId,
      });

      return { setId: row.id, isPr, deltaCp, verdict };
    },
    [db, juice],
  );
}
