import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import { getSessionActivitySummary } from '@/db/repos/sessionRepo';
import { deleteSets, ensureExercise, getRecentExercises, getSetCountsForExercisesOnDate } from '@/db/repos/setLogRepo';
import type { ExerciseRow } from '@/db/types';
import { useForge } from '@/features/forge/useForge';
import { useSessionStore } from '@/features/forge/sessionStore';
import { useLogSet, useLogSets } from '@/features/logging/useLogSet';
import { useSubscription } from '@/features/subscription/SubscriptionProvider';
import {
  isAttemptLimitError,
  isQuotaError,
  isRemoteAiConsentError,
  isSubscriptionRequiredError,
  AiApiError,
} from '@/features/subscription/workerClient';
import { todayLocal } from '@/lib/date';
import { hasCurrentRemoteAiConsent } from '@/lib/settings';
import { formatWeight } from '@/lib/units';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { QUICKLOG_ENDPOINT } from './config';
import { parseEntry, type ParseCandidate, type ParsedSet } from './parseEntry';
import { parseEntryAI } from './parseEntryAI';

export interface RecentChip {
  exerciseId: string;
  name: string;
  weight: number;
  reps: number;
  rir: number | null;
  isBodyweight: boolean;
}

/** Everything the confirm-as-undo card needs to display and to act on the JUST-saved set. */
export interface SavedQuickSet {
  setId: string;
  sessionId: string;
  exerciseId: string;
  /** Resolved catalog row (null only if a just-created ad-hoc exercise failed to load back). */
  exercise: ExerciseRow | null;
  /** Localized display name (what the user saw echoed). */
  name: string;
  weightKg: number;
  reps: number;
  rir: number | null;
  /** weight×reps — what recordSet fed the Forge session; undo hands it back to undoSet. */
  volumeKg: number;
  /** Sets logged today for this exercise, INCLUDING this one. */
  setCountToday: number;
}

export type QuickSubmitResult =
  | { ok: true; summary: string; saved: SavedQuickSet[] }
  /** Genuinely ambiguous parse — NOTHING was saved; offer `options` for a one-tap submitWith(). */
  | { ok: false; reason: 'ambiguous'; options: ParseCandidate[] }
  | {
      ok: false;
      reason:
        | 'empty'
        | 'no_exercise'
        | 'no_reps'
        | 'no_session'
        | 'ai_offline'
        | 'ai_consent_required'
        | 'subscription_required'
        | 'ai_quota_exhausted';
    };

/**
 * The brain behind the one-input QuickLog: load the exercise catalog (→ parser aliases) + recent
 * lifts (→ one-tap repeat chips), and log either a typed/spoken line or a tapped chip through the
 * unchanged logging hot path (so JUICE fires). First log auto-enters the Forge session.
 * Every save resolves to a SavedQuickSet (id + exercise) so the confirm card can undo/edit it.
 */
export function useQuickLog() {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const logSet = useLogSet();
  const logSets = useLogSets();
  const { enterSilently } = useForge();
  const { requestAiAccess, showAiAccessError } = useSubscription();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const remoteAiAllowed = useSettingsStore((s) => hasCurrentRemoteAiConsent(s.remoteAiConsent));
  const logRevision = useSessionStore((s) => s.logRevision);
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
      // Revision is the cross-instance invalidation signal; reading it makes this focus callback
      // re-run after add/edit/undo even though the loader itself needs no revision argument.
      void logRevision;
      void load().catch(() => {});
    }, [load, logRevision]),
  );

  const ensureSession = useCallback(async (): Promise<string> => {
    return enterSilently();
  }, [enterSilently]);

  /** "벤치프레스  100 kg×5" / "풀업  12" — echoes exactly what got saved (same shape as the chips). */
  const setSummary = useCallback(
    (name: string, weightKg: number, reps: number) => {
      const w = formatWeight(weightKg, unitSystem); // '' for bodyweight
      return `${name}  ${w ? `${w}×` : ''}${reps}`;
    },
    [unitSystem],
  );

  /** Catalog row for an id — exMap cache, else DB (just-created ad-hoc exercises). */
  const getExerciseRow = useCallback(
    async (id: string): Promise<ExerciseRow | null> => {
      const hit = exMap.current.get(id);
      if (hit) return hit;
      const row = await db.getFirstAsync<ExerciseRow>('SELECT * FROM exercise WHERE id = ?', [id]);
      if (row) exMap.current.set(id, row);
      return row ?? null;
    },
    [db],
  );

  /**
   * The ONE save path for every quicklog entry (typed/voice/AI/chip/candidate-pick): unchanged
   * logging hot path first (save → CP → JUICE), then the cheap post-save lookups the confirm card
   * needs (today's set count). Nothing here runs before the durable write.
   */
  const saveParsed = useCallback(
    async (set: ParsedSet): Promise<{ ok: true; summary: string; saved: SavedQuickSet } | { ok: false; reason: 'no_session' }> => {
      const sid = await ensureSession();
      if (!sid) return { ok: false, reason: 'no_session' };
      const ex = exMap.current.get(set.exerciseId) ?? null;
      const { setId } = await logSet({
        sessionId: sid,
        exerciseId: set.exerciseId,
        weight: set.weightKg,
        reps: set.reps,
        rir: set.rir,
        hitTargetReps: ex ? set.reps >= ex.rep_low : true,
        loggedVia: 'quick',
      });
      // Post-save decoration for the confirm card — the set is already durable above.
      let setCountToday = 1;
      try {
        const counts = await getSetCountsForExercisesOnDate(db, [set.exerciseId], todayLocal());
        setCountToday = counts[set.exerciseId] ?? 1;
      } catch {
        // count is cosmetic — never fail a save over it
      }
      return {
        ok: true,
        summary: setSummary(set.exerciseName, set.weightKg, set.reps),
        saved: {
          setId,
          sessionId: sid,
          exerciseId: set.exerciseId,
          exercise: ex,
          name: set.exerciseName,
          weightKg: set.weightKg,
          reps: set.reps,
          rir: set.rir,
          volumeKg: set.weightKg * set.reps,
          setCountToday,
        },
      };
    },
    [db, ensureSession, logSet, setSummary],
  );

  /**
   * Parse + log one free-text line. LOCAL-FIRST (spec: logging speed > flashiness): the on-device
   * rule parser runs FIRST, so a clean "벤치 100 5" is saved + JUICE-fired instantly with zero
   * network wait. A genuinely ambiguous match (near-tie candidates) saves NOTHING and returns
   * 'ambiguous' + options so the UI can offer a one-tap pick (submitWith). Only lines the rules
   * can't read (messy language / multi-set) go to the AI proxy, bounded by a short timeout so
   * logging never hangs on gym LTE.
   */
  const submitText = useCallback(
    async (text: string): Promise<QuickSubmitResult> => {
      // 1) On-device rule parser — instant, offline, the common path.
      const local = parseEntry(text, candidates, unitSystem);
      if (local.ok) {
        if (local.candidates != null && local.candidates.length > 1) {
          return { ok: false, reason: 'ambiguous', options: local.candidates };
        }
        const r = await saveParsed(local.set);
        return r.ok ? { ok: true, summary: r.summary, saved: [r.saved] } : r;
      }

      // 2) AI fallback — only for what the rules couldn't read. Consent defaults OFF, and a
      // stale disclosure version is treated as withdrawn. The local parser above is unaffected.
      if (!remoteAiAllowed) return { ok: false, reason: 'ai_consent_required' };
      if (!QUICKLOG_ENDPOINT) return { ok: false, reason: 'ai_offline' };

      const access = await requestAiAccess('workout_text');
      if (access === 'quota' || access === 'data_deleted') {
        return { ok: false, reason: 'ai_quota_exhausted' };
      }
      if (access === 'unavailable') return { ok: false, reason: 'ai_offline' };
      if (access !== 'allowed') return { ok: false, reason: 'subscription_required' };

      // Remote fallback is also build-config gated.
      if (QUICKLOG_ENDPOINT) {
        let sets: ParsedSet[];
        let retriedAccess = false;
        for (;;) {
          try {
            const ctrl = new AbortController();
            // Worker provider work is capped at 2.8s; leave transport/D1 margin without hanging
            // the gym hot path indefinitely.
            const timer = setTimeout(() => ctrl.abort(), 5_000);
            try {
              sets = await parseEntryAI(text, candidates, unitSystem, QUICKLOG_ENDPOINT, ctrl.signal);
            } finally {
              clearTimeout(timer);
            }
            break;
          } catch (error) {
            if (isRemoteAiConsentError(error)) return { ok: false, reason: 'ai_consent_required' };
            if (isQuotaError(error) || (error instanceof AiApiError && error.code === 'data_deleted_until_reset')) {
              showAiAccessError(error);
              return { ok: false, reason: 'ai_quota_exhausted' };
            }
            if (isAttemptLimitError(error)) {
              showAiAccessError(error);
              return { ok: false, reason: 'ai_offline' };
            }
            if (isSubscriptionRequiredError(error) && !retriedAccess) {
              retriedAccess = true;
              const retryAccess = await requestAiAccess('workout_text');
              if (retryAccess === 'allowed') continue;
              if (retryAccess === 'quota' || retryAccess === 'data_deleted') {
                return { ok: false, reason: 'ai_quota_exhausted' };
              }
              return { ok: false, reason: 'subscription_required' };
            }
            // network / timeout / proxy error — the set was NOT parseable on-device either, so tell
            // the user the AI is unreachable (actionable: use the "name weight reps" format).
            return { ok: false, reason: 'ai_offline' };
          }
        }
        if (sets.length > 0) {
          // Resolve every catalog row before the durable write, then insert the whole command with
          // one SQLite statement. A failure can no longer leave a silent half-saved workout.
          const resolved = await Promise.all(
            sets.map(async (set) => {
              const exerciseId =
                set.exerciseId && exMap.current.has(set.exerciseId)
                  ? set.exerciseId
                  : await ensureExercise(db, { name: set.exerciseName, isBodyweight: set.isBodyweight });
              const exercise = await getExerciseRow(exerciseId);
              return { ...set, exerciseId, exercise };
            }),
          );
          const sessionId = await ensureSession();
          if (!sessionId) return { ok: false, reason: 'no_session' };
          const inserted = await logSets(
            resolved.map((set) => ({
              sessionId,
              exerciseId: set.exerciseId,
              weight: set.weightKg,
              reps: set.reps,
              rir: set.rir,
              hitTargetReps: set.exercise ? set.reps >= set.exercise.rep_low : true,
              loggedVia: 'quick',
            })),
          );
          const counts = await getSetCountsForExercisesOnDate(
            db,
            [...new Set(resolved.map((set) => set.exerciseId))],
            todayLocal(),
          ).catch(() => ({} as Record<string, number>));
          const savedAll: SavedQuickSet[] = resolved.map((set, index) => ({
            setId: inserted[index].setId,
            sessionId,
            exerciseId: set.exerciseId,
            exercise: set.exercise,
            name: set.exerciseName,
            weightKg: set.weightKg,
            reps: set.reps,
            rir: set.rir,
            volumeKg: set.weightKg * set.reps,
            setCountToday: counts[set.exerciseId] ?? 1,
          }));
          const head = setSummary(sets[0].exerciseName, sets[0].weightKg, sets[0].reps);
          return {
            ok: true,
            summary: sets.length > 1 ? `${head}  +${sets.length - 1}` : head,
            saved: savedAll,
          };
        }
      }

      // Neither the rules nor the AI could read it → parse-failure hint (format guidance).
      return { ok: false, reason: local.reason };
    },
    [
      db,
      candidates,
      unitSystem,
      remoteAiAllowed,
      requestAiAccess,
      showAiAccessError,
      saveParsed,
      getExerciseRow,
      ensureSession,
      logSets,
      setSummary,
    ],
  );

  /**
   * Resolve an ambiguous entry with the exercise the user tapped: re-parse the SAME text against
   * only that candidate (so ITS alias is the one stripped before number reading) and save through
   * the identical instant path.
   */
  const submitWith = useCallback(
    async (text: string, option: ParseCandidate): Promise<QuickSubmitResult> => {
      const r = parseEntry(text, [option], unitSystem);
      if (!r.ok) return { ok: false, reason: r.reason };
      const s = await saveParsed(r.set);
      return s.ok ? { ok: true, summary: s.summary, saved: [s.saved] } : s;
    },
    [unitSystem, saveParsed],
  );

  /** One-tap repeat of a recent lift (same weight×reps). Returns the saved set for the confirm card. */
  const repeat = useCallback(
    async (chip: RecentChip): Promise<SavedQuickSet | null> => {
      const r = await saveParsed({
        exerciseId: chip.exerciseId,
        exerciseName: chip.name,
        weightKg: chip.weight,
        reps: chip.reps,
        rir: chip.rir,
      });
      return r.ok ? r.saved : null;
    },
    [saveParsed],
  );

  /**
   * Undo the JUST-saved command (confirm card [취소]): atomically delete every row produced by
   * that command, then reconcile the Forge session counters and Combat Power once.
   */
  const undoSave = useCallback(
    async (saved: SavedQuickSet | SavedQuickSet[]): Promise<void> => {
      const batch = Array.isArray(saved) ? saved : [saved];
      if (batch.length === 0) return;
      const sessionId = batch[0].sessionId;
      if (batch.some((item) => item.sessionId !== sessionId)) throw new Error('batch_session_mismatch');
      if (!useSessionStore.getState().tryBeginLogWrite()) throw new Error('session_finishing');
      try {
        await deleteSets(
          db,
          batch.map((item) => item.setId),
        );
        const summary = await getSessionActivitySummary(db, sessionId);
        useSessionStore.getState().reconcileActivity(sessionId, summary.itemCount, summary.volumeKg);
        const result = await recomputeAndStore(db);
        useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);
      } finally {
        useSessionStore.getState().endLogWrite();
      }
    },
    [db],
  );

  return { candidates, recents, submitText, submitWith, repeat, undoSave };
}
