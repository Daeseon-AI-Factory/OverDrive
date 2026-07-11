import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { getCardioCountsForModalitiesOnDate } from '@/db/repos/cardioRepo';
import { getLastSetForExercise, getSetsWithDateSince } from '@/db/repos/setLogRepo';
import type { ExerciseRow } from '@/db/types';
import { useSessionStore } from '@/features/forge/sessionStore';
import { useTodayProgram } from '@/features/program/useProgram';
import { todayLocal } from '@/lib/date';
import { computeNextAction, type CoachLastSet, type NextAction } from './nextAction';

interface CoachDb {
  loaded: boolean;
  /** Sets/pieces logged TODAY per exercise (strength set_log counts + cardio piece counts). */
  setsToday: Record<string, number>;
  /** Most recent set per exercise (today's first, else all-time) — suggestion prefill. */
  lastSetByExercise: Record<string, CoachLastSet | undefined>;
  /** Exercise of today's most recent set (derived from set_log — not mirrored in any store). */
  lastExerciseId: string | null;
  /** logged_at of today's most recent set, epoch ms — the DB-side rest anchor (survives restarts). */
  lastLoggedAtMs: number | null;
  exerciseById: Map<string, ExerciseRow>;
  cardioExerciseIds: ReadonlySet<string>;
}

const EMPTY: CoachDb = {
  loaded: false,
  setsToday: {},
  lastSetByExercise: {},
  lastExerciseId: null,
  lastLoggedAtMs: null,
  exerciseById: new Map(),
  cardioExerciseIds: new Set(),
};

export interface CoachPlan {
  loaded: boolean;
  /** Resolved program-day title ("상체 A" …) — the start-state eyebrow. */
  dayTitle: string;
  exerciseById: Map<string, ExerciseRow>;
  /** Pure engine call at a given clock tick — the card owns the 1s ticker. */
  compute: (now: number) => NextAction;
}

/**
 * Assembles the next-action engine inputs from what already exists — today's program
 * (useTodayProgram), the live session store, and set_log/cardio_log — and re-derives them after
 * every save/undo (sessionStore.setCount is the reactive trigger: EVERY logging path bumps it).
 * All reads are post-hoc queries; nothing here sits on the logging hot path (§6).
 */
export function useCoachPlan(): CoachPlan {
  const db = useSQLiteContext();
  const today = useTodayProgram();
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const startedAt = useSessionStore((s) => s.startedAt);
  const setCount = useSessionStore((s) => s.setCount);
  const logRevision = useSessionStore((s) => s.logRevision);
  const storeLastSetAt = useSessionStore((s) => s.lastSetAt);
  const [state, setState] = useState<CoachDb>(EMPTY);

  // Content-stable key for the program slots (same pattern as ActiveWorkoutCard — `today.slots` is
  // a fresh array each render, so effects key off the CONTENT, not array identity).
  const slots = today.slots;
  const slotsKey = slots.map((s) => `${s.exerciseId}:${s.targetSets}:${s.repLow}:${s.repHigh}`).join('|');

  /** Builds the DB snapshot (no setState — the effects below own state, ActiveWorkoutCard-style). */
  const buildSnapshot = useCallback(async (): Promise<CoachDb> => {
    const date = todayLocal();
    const sets = await getSetsWithDateSince(db, date); // today only, chronological within the day
    const slotIds = slots.map((s) => s.exerciseId);
    const ids = Array.from(new Set([...slotIds, ...sets.map((s) => s.exercise_id)]));

    const rows =
      ids.length > 0
        ? await db.getAllAsync<ExerciseRow>(
            `SELECT * FROM exercise WHERE id IN (${ids.map(() => '?').join(',')})`,
            ids,
          )
        : [];
    const exerciseById = new Map(rows.map((r) => [r.id, r]));
    const cardioIds = ids.filter((id) => exerciseById.get(id)?.type === 'cardio');
    const cardioCounts = await getCardioCountsForModalitiesOnDate(db, cardioIds, date);

    const setsToday: Record<string, number> = { ...cardioCounts };
    const lastSetByExercise: Record<string, CoachLastSet | undefined> = {};
    let lastExerciseId: string | null = null;
    let lastLoggedAtMs: number | null = null;
    for (const s of sets) {
      setsToday[s.exercise_id] = (setsToday[s.exercise_id] ?? 0) + 1;
      lastSetByExercise[s.exercise_id] = { weightKg: s.weight, reps: s.reps }; // chronological → last wins
      const at = Date.parse(s.logged_at);
      if (Number.isFinite(at) && (lastLoggedAtMs == null || at >= lastLoggedAtMs)) {
        lastLoggedAtMs = at;
        lastExerciseId = s.exercise_id;
      }
    }

    // History prefill for programmed strength exercises not yet trained today (≤ slots.length
    // point lookups, only on save/focus/program change — never on the logging path).
    await Promise.all(
      slotIds
        .filter((id) => lastSetByExercise[id] == null && exerciseById.get(id)?.type !== 'cardio')
        .map(async (id) => {
          const last = await getLastSetForExercise(db, id);
          if (last) lastSetByExercise[id] = { weightKg: last.weight, reps: last.reps };
        }),
    );

    return {
      loaded: true,
      setsToday,
      lastSetByExercise,
      lastExerciseId,
      lastLoggedAtMs,
      exerciseById,
      cardioExerciseIds: new Set(cardioIds),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slotsKey is the content-stable proxy for slots
  }, [db, slotsKey]);

  // Re-derive after every save/undo (setCount), session change, and on focus. Failures keep the
  // previous snapshot — the coach card degrades to stale-but-sane rather than erroring.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const next = await buildSnapshot();
        if (alive) setState(next);
      } catch {
        // keep the previous snapshot
      }
    })();
    return () => {
      alive = false;
    };
  }, [buildSnapshot, setCount, logRevision, activeSessionId]);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      buildSnapshot()
        .then((next) => {
          if (alive) setState(next);
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [buildSnapshot]),
  );

  const isRestDay = today.dayType === 'rest';
  const compute = useCallback(
    (now: number): NextAction => {
      const active = activeSessionId != null;
      // Live store anchor (exact save moment) wins over the DB timestamp when newer — covers the
      // window where the post-save re-query hasn't landed yet; a resumed session falls back to DB.
      const dbAnchor = state.lastLoggedAtMs;
      const lastSetAt =
        storeLastSetAt != null && (dbAnchor == null || storeLastSetAt > dbAnchor) ? storeLastSetAt : dbAnchor;
      return computeNextAction({
        now,
        session: {
          active,
          startedAt,
          lastSetAt: active ? lastSetAt : null,
          lastExerciseId: active ? state.lastExerciseId : null,
        },
        day: { isRestDay, slots },
        setsToday: state.setsToday,
        lastSetByExercise: state.lastSetByExercise,
        cardioExerciseIds: state.cardioExerciseIds,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slotsKey is the content-stable proxy for slots
    [activeSessionId, startedAt, storeLastSetAt, state, isRestDay, slotsKey],
  );

  return { loaded: state.loaded, dayTitle: today.title, exerciseById: state.exerciseById, compute };
}
