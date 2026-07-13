import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { recomputeAndStore } from '../../db/repos/combatPowerRepo';
import { appendPowerEvent } from '../../db/repos/powerEventRepo';
import { addSet, addSets } from '../../db/repos/setLogRepo';
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
      if (!useSessionStore.getState().tryBeginLogWrite()) throw new Error('session_finishing');
      try {
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

        let deltaCp = 0;
        let powerUpdated = false;
        try {
          const result = await recomputeAndStore(db);
          useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);
          deltaCp = result.score - prevScore;
          powerUpdated = true;
        } catch {
          // The set row is already durable. A later screen refresh recomputes CP; never invite a
          // duplicate INSERT by reporting the saved set as failed.
        }

        const verdict = classifyEvent({
          kind: 'set',
          isPr,
          rir: input.rir,
          hitTargetReps: input.hitTargetReps,
          deltaCp,
        });
        try {
          juice.fire(verdict); // non-blocking
        } catch {
          // Celebration cannot change the durable logging result.
        }

        if (powerUpdated) {
          void appendPowerEvent(db, {
            tier: verdict.tier,
            delta: deltaCp,
            reason: verdict.reason,
            sessionId: input.sessionId,
          }).catch(() => {});
        }

        return { setId: row.id, isPr, deltaCp, verdict };
      } finally {
        useSessionStore.getState().endLogWrite();
      }
    },
    [db, juice],
  );
}

/**
 * Atomic counterpart for one AI command that expands into several sets. All durable rows land in
 * one SQLite statement, then derived stores/Combat Power/JUICE update once after that boundary.
 */
export function useLogSets() {
  const db = useSQLiteContext();
  const juice = useJuice();

  return useCallback(
    async (inputs: LogSetInput[]): Promise<{ setId: string; isPr: boolean }[]> => {
      if (inputs.length === 0) return [];
      if (!useSessionStore.getState().tryBeginLogWrite()) throw new Error('session_finishing');
      try {
        const prevScore = useCombatPowerStore.getState().score;
        const inserted = await addSets(
          db,
          inputs.map((input) => ({
            sessionId: input.sessionId,
            exerciseId: input.exerciseId,
            weight: input.weight,
            reps: input.reps,
            rir: input.rir,
            loggedVia: input.loggedVia ?? 'quick',
          })),
        );

        for (const input of inputs) {
          useSessionStore.getState().recordSet(input.weight * input.reps);
        }
        useRestTimerStore.getState().start();

        let deltaCp = 0;
        let powerUpdated = false;
        try {
          const result = await recomputeAndStore(db);
          useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);
          deltaCp = result.score - prevScore;
          powerUpdated = true;
        } catch {
          // The whole batch is already durable. A later refresh can restore derived CP.
        }

        const verdicts = inserted.map(({ isPr }, index) =>
          classifyEvent({
            kind: 'set',
            isPr,
            rir: inputs[index].rir,
            hitTargetReps: inputs[index].hitTargetReps,
            deltaCp,
          }),
        );
        const strongest = verdicts.reduce((best, verdict) => (verdict.tier > best.tier ? verdict : best));
        try {
          juice.fire(strongest);
        } catch {
          // Celebration cannot change the durable batch result.
        }
        if (powerUpdated) {
          void appendPowerEvent(db, {
            tier: strongest.tier,
            delta: deltaCp,
            reason: strongest.reason,
            sessionId: inputs[0].sessionId,
          }).catch(() => {});
        }
        return inserted.map(({ row, isPr }) => ({ setId: row.id, isPr }));
      } finally {
        useSessionStore.getState().endLogWrite();
      }
    },
    [db, juice],
  );
}
