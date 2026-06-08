import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getRecentExercises } from '@/db/repos/setLogRepo';
import type { ExerciseRow } from '@/db/types';
import { useForge } from '@/features/forge/useForge';
import { useSessionStore } from '@/features/forge/sessionStore';
import { useLogSet } from '@/features/logging/useLogSet';
import { useSettingsStore } from '@/stores/settingsStore';
import { parseEntry, type ParseCandidate } from './parseEntry';

export interface RecentChip {
  exerciseId: string;
  name: string;
  weight: number;
  reps: number;
  rir: number | null;
  isBodyweight: boolean;
}

/**
 * The brain behind the one-input QuickLog: load the exercise catalog (→ parser aliases) + recent
 * lifts (→ one-tap repeat chips), and log either a typed/spoken line or a tapped chip through the
 * unchanged logging hot path (so JUICE fires). First log auto-enters the Forge session.
 */
export function useQuickLog() {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const logSet = useLogSet();
  const { enter } = useForge();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const [candidates, setCandidates] = useState<ParseCandidate[]>([]);
  const [recents, setRecents] = useState<RecentChip[]>([]);
  const exMap = useRef<Map<string, ExerciseRow>>(new Map());

  const load = useCallback(async () => {
    const rows = await db.getAllAsync<ExerciseRow>('SELECT * FROM exercise');
    exMap.current = new Map(rows.map((r) => [r.id, r]));
    setCandidates(
      rows.map((r) => ({
        id: r.id,
        name: t(`exercise.${r.id}`),
        aliases: [r.name, t(`exercise.${r.id}`), ...r.id.split('_')],
        isBodyweight: r.is_bodyweight === 1,
      })),
    );
    const rec = await getRecentExercises(db, 5);
    setRecents(
      rec.map((x) => {
        const ex = exMap.current.get(x.exerciseId);
        return {
          exerciseId: x.exerciseId,
          name: ex ? t(`exercise.${x.exerciseId}`) : x.exerciseId,
          weight: x.weight,
          reps: x.reps,
          rir: x.rir,
          isBodyweight: ex?.is_bodyweight === 1,
        };
      }),
    );
  }, [db, t]);

  useFocusEffect(
    useCallback(() => {
      void load().catch(() => {});
    }, [load]),
  );

  const ensureSession = useCallback(async (): Promise<string> => {
    const active = useSessionStore.getState().activeSessionId;
    if (active) return active;
    await enter();
    return useSessionStore.getState().activeSessionId ?? '';
  }, [enter]);

  /** Parse + log one free-text line. Returns ok + the matched name, or a failure reason for a hint. */
  const submitText = useCallback(
    async (text: string): Promise<{ ok: boolean; reason?: string; name?: string }> => {
      const r = parseEntry(text, candidates, unitSystem);
      if (!r.ok) return { ok: false, reason: r.reason };
      const sid = await ensureSession();
      if (!sid) return { ok: false, reason: 'no_session' };
      const ex = exMap.current.get(r.set.exerciseId);
      await logSet({
        sessionId: sid,
        exerciseId: r.set.exerciseId,
        weight: r.set.weightKg,
        reps: r.set.reps,
        rir: r.set.rir,
        hitTargetReps: ex ? r.set.reps >= ex.rep_low : true,
        loggedVia: 'quick',
      });
      void load();
      return { ok: true, name: r.set.exerciseName };
    },
    [candidates, unitSystem, ensureSession, logSet, load],
  );

  /** One-tap repeat of a recent lift (same weight×reps). */
  const repeat = useCallback(
    async (chip: RecentChip): Promise<void> => {
      const sid = await ensureSession();
      if (!sid) return;
      const ex = exMap.current.get(chip.exerciseId);
      await logSet({
        sessionId: sid,
        exerciseId: chip.exerciseId,
        weight: chip.weight,
        reps: chip.reps,
        rir: chip.rir,
        hitTargetReps: ex ? chip.reps >= ex.rep_low : true,
        loggedVia: 'quick',
      });
      void load();
    },
    [ensureSession, logSet, load],
  );

  return { candidates, recents, submitText, repeat };
}
