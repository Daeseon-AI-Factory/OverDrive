// The next-action engine — the ONE brain behind the Today hero card ("손 치는 걸 최소화": the app
// decides, the user confirms). PURE: no stores, no DB, no i18n, no Date.now() — inputs in, ONE
// NextAction out, fully unit-testable (nextAction.test.ts).
//
// Spec guards: §6 — this only DECIDES what to show; every save still goes through the unchanged
// logging hot path. §9 anti-shame — a long idle or an overrun rest is a neutral state here
// ('session_idle', restRemainSec sitting at 0), never a scold; copy lives in the UI layer.

import type { ProgramSlot } from '@/features/program/types';

/** Default strength rest window (matches restTimerStore's DEFAULT_REST_SEC; configurable later). */
export const DEFAULT_REST_TARGET_SEC = 90;
/** No set for this long inside a session → 'session_idle' (gentle continue/wrap-up fork). */
export const IDLE_AFTER_SEC = 600;
/** Conservative PR-chance increment (spec: +2.5kg, never mandatory; configurable later). */
export const PR_STEP_KG = 2.5;
/** Target sets for an exercise trained outside today's program slots. */
export const DEFAULT_TARGET_SETS = 3;

export interface CoachLastSet {
  weightKg: number;
  reps: number;
}

export interface CoachSessionInput {
  active: boolean;
  /** Session start, epoch ms (anchor before the first set). */
  startedAt: number | null;
  /** Most recent logged set/piece today, epoch ms. null = nothing logged yet. */
  lastSetAt: number | null;
  /** Exercise of that most recent set (today). */
  lastExerciseId: string | null;
}

export interface NextActionInput {
  /** Current time, epoch ms — passed in so the engine stays pure. */
  now: number;
  session: CoachSessionInput;
  day: { isRestDay: boolean; slots: ProgramSlot[] };
  /** Sets/pieces logged TODAY per exercise id (strength set counts + cardio piece counts). */
  setsToday: Record<string, number>;
  /** Most recent set per exercise (any day, today's included) — weight/reps prefill source. */
  lastSetByExercise?: Record<string, CoachLastSet | undefined>;
  /** Exercise ids that are cardio modalities (no weight×reps one-tap; UI opens the cardio sheet). */
  cardioExerciseIds?: ReadonlySet<string>;
  restTargetSec?: number;
  idleAfterSec?: number;
  prStepKg?: number;
}

export interface SetSuggestion {
  exerciseId: string;
  isCardio: boolean;
  /** kg (canonical). null = no history to suggest from (UI opens the logger instead of one-tap). */
  weightKg: number | null;
  /** null for cardio, or when nothing is known at all. */
  reps: number | null;
  /** 1-based: the set the user is about to do (setsToday + 1). */
  setNumber: number;
  targetSets: number;
  /** Historical set hit the rep-range top before today's first set → +2.5kg suggested. */
  prChance: boolean;
}

export type NextAction =
  | { kind: 'rest_day' }
  | { kind: 'start_free' }
  | { kind: 'start_program_day'; suggestion: SetSuggestion }
  | {
      kind: 'resting';
      /** null in a free session with nothing logged yet (UI falls back to mic/quicklog hint). */
      suggestion: SetSuggestion | null;
      /** Anchor of the rest window = the last save timestamp. null = no set yet, no ring. */
      restStartedAt: number | null;
      restTargetSec: number;
      /** Sits at 0 once the window elapsed — NEVER a scold (§9), just "ready when you are". */
      restRemainSec: number;
    }
  | { kind: 'session_idle'; suggestion: SetSuggestion | null; idleSec: number }
  | { kind: 'wrap_up'; setsDone: number; sessionActive: boolean };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Next-set arithmetic for ONE strength exercise. Double progression may raise the load only for
 * today's first set, when `last` is historical. Once any set exists today, RIR/fatigue is unknown,
 * so the coach repeats the performed load instead of escalating inside the same session.
 */
function suggestNextSet(
  exerciseId: string,
  input: NextActionInput,
  slot: ProgramSlot | undefined,
  setsDone: number,
): SetSuggestion {
  const targetSets = slot?.targetSets ?? DEFAULT_TARGET_SETS;
  const last = input.lastSetByExercise?.[exerciseId] ?? null;
  if (last == null) {
    // Never trained → nothing to one-tap; the UI opens the prefilled logger instead.
    return {
      exerciseId,
      isCardio: false,
      weightKg: null,
      reps: slot?.repLow ?? null,
      setNumber: setsDone + 1,
      targetSets,
      prChance: false,
    };
  }
  // PR chance only with a programmed rep range AND real load (bodyweight progresses by reps, not +2.5kg).
  if (setsDone === 0 && slot != null && last.weightKg > 0 && last.reps >= slot.repHigh) {
    return {
      exerciseId,
      isCardio: false,
      weightKg: round2(last.weightKg + (input.prStepKg ?? PR_STEP_KG)),
      reps: slot.repLow,
      setNumber: setsDone + 1,
      targetSets,
      prChance: true,
    };
  }
  return {
    exerciseId,
    isCardio: false,
    weightKg: last.weightKg,
    reps: last.reps,
    setNumber: setsDone + 1,
    targetSets,
    prChance: false,
  };
}

/**
 * What set the coach proposes next: the SAME exercise while its target sets aren't done, else the
 * first incomplete program slot (in program order). null = nothing left to suggest.
 */
export function deriveSuggestion(input: NextActionInput): SetSuggestion | null {
  const counts = input.setsToday;
  const slots = input.day.slots;
  const isCardio = (id: string) => input.cardioExerciseIds?.has(id) ?? false;

  // 1) Same exercise, next set — in-session continuation (includes off-program exercises).
  const lastId = input.session.active ? input.session.lastExerciseId : null;
  if (lastId != null && !isCardio(lastId)) {
    const slot = slots.find((s) => s.exerciseId === lastId);
    const done = counts[lastId] ?? 0;
    if (done > 0 && done < (slot?.targetSets ?? DEFAULT_TARGET_SETS)) {
      return suggestNextSet(lastId, input, slot, done);
    }
  }

  // 2) Next programmed exercise: the first slot below its target sets, in program order.
  const next = slots.find((s) => (counts[s.exerciseId] ?? 0) < s.targetSets);
  if (next == null) return null;
  const done = counts[next.exerciseId] ?? 0;
  if (isCardio(next.exerciseId)) {
    return {
      exerciseId: next.exerciseId,
      isCardio: true,
      weightKg: null,
      reps: null,
      setNumber: done + 1,
      targetSets: next.targetSets,
      prChance: false,
    };
  }
  return suggestNextSet(next.exerciseId, input, next, done);
}

/** The ONE decision: session/program/log state in → what the hero card shows out. */
export function computeNextAction(input: NextActionInput): NextAction {
  const { now, session, day } = input;
  const counts = input.setsToday;
  const slots = day.slots;
  const restTargetSec = input.restTargetSec ?? DEFAULT_REST_TARGET_SEC;
  const idleAfterSec = input.idleAfterSec ?? IDLE_AFTER_SEC;

  // 1) Everything programmed today is done → wrap up (finish CTA while the session is open,
  //    a calm "done for today" once it's closed). Needs ≥1 slot (never vacuously true).
  if (slots.length > 0 && slots.every((s) => (counts[s.exerciseId] ?? 0) >= s.targetSets)) {
    const setsDone = slots.reduce((acc, s) => acc + (counts[s.exerciseId] ?? 0), 0);
    return { kind: 'wrap_up', setsDone, sessionActive: session.active };
  }

  // 2) No session → the three start states.
  if (!session.active) {
    if (day.isRestDay) return { kind: 'rest_day' };
    if (slots.length === 0) return { kind: 'start_free' };
    const suggestion = deriveSuggestion(input);
    if (suggestion == null) return { kind: 'start_free' }; // defensive: unreachable with slots
    return { kind: 'start_program_day', suggestion };
  }

  // 3) In session. Anchor = last set (or session start before the first set).
  const anchor = session.lastSetAt ?? session.startedAt ?? now;
  const sinceSec = Math.max(0, Math.floor((now - anchor) / 1000));
  const suggestion = deriveSuggestion(input);

  if (sinceSec > idleAfterSec) return { kind: 'session_idle', suggestion, idleSec: sinceSec };

  return {
    kind: 'resting',
    suggestion,
    restStartedAt: session.lastSetAt,
    restTargetSec,
    restRemainSec: session.lastSetAt != null ? Math.max(0, restTargetSec - sinceSec) : 0,
  };
}
