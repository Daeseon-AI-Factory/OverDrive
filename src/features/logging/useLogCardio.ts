import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { addCardio } from '@/db/repos/cardioRepo';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import { appendPowerEvent } from '@/db/repos/powerEventRepo';
import { useSessionStore } from '../forge/sessionStore';
import { classifyEvent } from '../juice/classifyEvent';
import { useJuice } from '../juice/JuiceProvider';
import type { JuiceVerdict } from '../juice/juice.types';
import { useCombatPowerStore } from '../../stores/combatPowerStore';

export interface LogCardioInput {
  sessionId: string;
  modality: string; // exercise id (outdoor_run, cycling, …)
  durationSec: number;
  rounds?: number | null;
  distanceM: number | null;
  rpe: number | null;
}

/** Cardio hot path (parallel to useLogSet). Writes cardio_log → recomputes CP (conditioning) → JUICE. */
export function useLogCardio() {
  const db = useSQLiteContext();
  const juice = useJuice();

  return useCallback(
    async (input: LogCardioInput): Promise<{ cardioId: string; deltaCp: number; verdict: JuiceVerdict }> => {
      if (!useSessionStore.getState().tryBeginLogWrite()) throw new Error('session_finishing');
      try {
        const prevScore = useCombatPowerStore.getState().score;

        const row = await addCardio(db, {
          sessionId: input.sessionId,
          modality: input.modality,
          durationSec: input.durationSec,
          rounds: input.rounds,
          distanceM: input.distanceM,
          rpe: input.rpe,
        });
        useSessionStore.getState().recordSet(0); // counts toward session item count (no strength volume)

        let deltaCp = 0;
        let powerUpdated = false;
        try {
          const result = await recomputeAndStore(db);
          useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);
          deltaCp = result.score - prevScore;
          powerUpdated = true;
        } catch {
          // The cardio row is already durable; derived CP failure must not invite a duplicate log.
        }

        const verdict = classifyEvent({ kind: 'cardio', durationSec: input.durationSec, rpe: input.rpe, deltaCp });
        try {
          juice.fire(verdict);
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

        return { cardioId: row.id, deltaCp, verdict };
      } finally {
        useSessionStore.getState().endLogWrite();
      }
    },
    [db, juice],
  );
}
