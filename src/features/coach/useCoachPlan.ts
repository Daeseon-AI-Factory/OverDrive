import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { getCardioCountsForModalitiesOnDate } from '@/db/repos/cardioRepo';
import { getLastSetForExercise, getSetsWithDateSince } from '@/db/repos/setLogRepo';
import type { ExerciseRow } from '@/db/types';
import { useSessionStore } from '@/features/forge/sessionStore';
import { useTodayProgram } from '@/features/program/useProgram';
import { todayLocal } from '@/lib/date';
import { deriveCoachStrengthSnapshot, type CurrentSessionLastSet } from './coachSnapshot';
import { computeNextAction, type CoachLastSet, type NextAction } from './nextAction';

interface CoachDb {
  loaded: boolean;
  /** Sets/pieces logged TODAY per exercise (strength set_log counts + cardio piece counts). */
  setsToday: Record<string, number>;
  /** Most recent relevant set per exercise (active exercise is pinned to the active session). */
  lastSetByExercise: Record<string, CoachLastSet | undefined>;
  /** Session id used to build currentSessionLastSet; guards against an async stale snapshot. */
  snapshotSessionId: string | null;
  /** Exact active-session set/exercise/rest anchor; completed same-day sessions cannot replace it. */
  currentSessionLastSet: CurrentSessionLastSet | null;
  exerciseById: Map<string, ExerciseRow>;
  cardioExerciseIds: ReadonlySet<string>;
}

const EMPTY: CoachDb = {
  loaded: false,
  setsToday: {},
  lastSetByExercise: {},
  snapshotSessionId: null,
  currentSessionLastSet: null,
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
    const strength = deriveCoachStrengthSnapshot(sets, activeSessionId);
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

    const setsToday: Record<string, number> = { ...cardioCounts, ...strength.setsToday };
    const lastSetByExercise = strength.lastSetByExercise;

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
      snapshotSessionId: activeSessionId,
      currentSessionLastSet: strength.currentSessionLastSet,
      exerciseById,
      cardioExerciseIds: new Set(cardioIds),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slotsKey is the content-stable proxy for slots
  }, [activeSessionId, db, slotsKey]);

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
      const currentSessionLastSet =
        active && state.snapshotSessionId === activeSessionId ? state.currentSessionLastSet : null;
      // Live store anchor (exact save moment) wins over the DB timestamp when newer — covers the
      // window where the post-save re-query hasn't landed yet; a resumed session falls back to DB.
      const dbAnchor = currentSessionLastSet?.loggedAtMs ?? null;
      const lastSetAt =
        storeLastSetAt != null && (dbAnchor == null || storeLastSetAt > dbAnchor) ? storeLastSetAt : dbAnchor;
      return computeNextAction({
        now,
        session: {
          active,
          startedAt,
          lastSetAt: active ? lastSetAt : null,
          lastExerciseId: active ? (currentSessionLastSet?.exerciseId ?? null) : null,
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
