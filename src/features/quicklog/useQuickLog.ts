import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ensureExercise, getRecentExercises } from '@/db/repos/setLogRepo';
import type { ExerciseRow } from '@/db/types';
import { useForge } from '@/features/forge/useForge';
import { useSessionStore } from '@/features/forge/sessionStore';
import { useLogSet } from '@/features/logging/useLogSet';
import { formatWeight } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { QUICKLOG_ENDPOINT } from './config';
import { parseEntry, type ParseCandidate } from './parseEntry';
import { parseEntryAI } from './parseEntryAI';

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
        name: t(`exercise.${r.id}`, { defaultValue: r.name }), // fall back to stored name (ad-hoc exercises)
        aliases: [r.name, t(`exercise.${r.id}`, { defaultValue: r.name }), ...r.id.split('_')],
        isBodyweight: r.is_bodyweight === 1,
      })),
    );
    const rec = await getRecentExercises(db, 5);
    setRecents(
      rec.map((x) => {
        const ex = exMap.current.get(x.exerciseId);
        return {
          exerciseId: x.exerciseId,
          name: ex ? t(`exercise.${x.exerciseId}`, { defaultValue: ex.name }) : x.exerciseId,
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

  /** "벤치프레스  100 kg×5" / "풀업  12" — echoes exactly what got saved (same shape as the chips). */
  const setSummary = useCallback(
    (name: string, weightKg: number, reps: number) => {
      const w = formatWeight(weightKg, unitSystem); // '' for bodyweight
      return `${name}  ${w ? `${w}×` : ''}${reps}`;
    },
    [unitSystem],
  );

  /**
   * Parse + log one free-text line. LOCAL-FIRST (spec: logging speed > flashiness): the on-device
   * rule parser runs FIRST, so a clean "벤치 100 5" is saved + JUICE-fired instantly with zero
   * network wait. Only lines the rules can't read (messy language / multi-set) go to the AI proxy,
   * bounded by a short timeout so logging never hangs on gym LTE. Returns ok + a summary of what
   * was saved, or a reason for a hint ('ai_offline' = AI unreachable, distinct from parse failures).
   */
  const submitText = useCallback(
    async (text: string): Promise<{ ok: boolean; reason?: string; summary?: string }> => {
      // 1) On-device rule parser — instant, offline, the common path.
      const local = parseEntry(text, candidates, unitSystem);
      if (local.ok) {
        const sid = await ensureSession();
        if (!sid) return { ok: false, reason: 'no_session' };
        const ex = exMap.current.get(local.set.exerciseId);
        await logSet({
          sessionId: sid,
          exerciseId: local.set.exerciseId,
          weight: local.set.weightKg,
          reps: local.set.reps,
          rir: local.set.rir,
          hitTargetReps: ex ? local.set.reps >= ex.rep_low : true,
          loggedVia: 'quick',
        });
        void load();
        return { ok: true, summary: setSummary(local.set.exerciseName, local.set.weightKg, local.set.reps) };
      }

      // 2) AI fallback — only for what the rules couldn't read (and only if an endpoint is configured).
      if (QUICKLOG_ENDPOINT) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 3500); // never hang logging on a slow network
          let sets;
          try {
            sets = await parseEntryAI(text, candidates, unitSystem, QUICKLOG_ENDPOINT, ctrl.signal);
          } finally {
            clearTimeout(timer);
          }
          if (sets.length > 0) {
            const sid = await ensureSession();
            if (sid) {
              for (const s of sets) {
                // catalog match, or create the exercise on the fly (burpees, farmer's walk, …)
                const exId =
                  s.exerciseId && exMap.current.has(s.exerciseId)
                    ? s.exerciseId
                    : await ensureExercise(db, { name: s.exerciseName, isBodyweight: s.isBodyweight });
                const ex = exMap.current.get(exId);
                await logSet({
                  sessionId: sid,
                  exerciseId: exId,
                  weight: s.weightKg,
                  reps: s.reps,
                  rir: s.rir,
                  hitTargetReps: ex ? s.reps >= ex.rep_low : true,
                  loggedVia: 'quick',
                });
              }
              void load();
              const head = setSummary(sets[0].exerciseName, sets[0].weightKg, sets[0].reps);
              return { ok: true, summary: sets.length > 1 ? `${head}  +${sets.length - 1}` : head };
            }
          }
        } catch {
          // network / timeout / proxy error — the set was NOT parseable on-device either, so tell
          // the user the AI is unreachable (actionable: use the "name weight reps" format).
          return { ok: false, reason: 'ai_offline' };
        }
      }

      // Neither the rules nor the AI could read it → parse-failure hint (format guidance).
      return { ok: false, reason: local.reason };
    },
    [db, candidates, unitSystem, ensureSession, logSet, load, setSummary],
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
