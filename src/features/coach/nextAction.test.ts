import type { ProgramSlot } from '@/features/program/types';
import {
  computeNextAction,
  deriveSuggestion,
  DEFAULT_REST_TARGET_SEC,
  DEFAULT_TARGET_SETS,
  type NextActionInput,
} from './nextAction';

const NOW = 1_750_000_000_000;
const SEC = 1000;

const slots: ProgramSlot[] = [
  { exerciseId: 'bench', targetSets: 3, repLow: 8, repHigh: 12 },
  { exerciseId: 'row', targetSets: 3, repLow: 8, repHigh: 12 },
  { exerciseId: 'hiit', targetSets: 1, repLow: 1, repHigh: 1 },
];

const noSession = { active: false, startedAt: null, lastSetAt: null, lastExerciseId: null };

function activeSession(lastSetAgoSec: number | null, lastExerciseId: string | null = null) {
  return {
    active: true,
    startedAt: NOW - 3600 * SEC,
    lastSetAt: lastSetAgoSec != null ? NOW - lastSetAgoSec * SEC : null,
    lastExerciseId,
  };
}

function input(overrides: Partial<NextActionInput>): NextActionInput {
  return {
    now: NOW,
    session: noSession,
    day: { isRestDay: false, slots },
    setsToday: {},
    cardioExerciseIds: new Set(['hiit']),
    ...overrides,
  };
}

describe('computeNextAction — start states', () => {
  it('rest_day: no session on a rest day', () => {
    expect(computeNextAction(input({ day: { isRestDay: true, slots: [] } }))).toEqual({ kind: 'rest_day' });
  });

  it('start_free: no session, training day with an empty program', () => {
    expect(computeNextAction(input({ day: { isRestDay: false, slots: [] } }))).toEqual({ kind: 'start_free' });
  });

  it('start_program_day: suggests the first slot at repLow with no history (no one-tap weight)', () => {
    const action = computeNextAction(input({}));
    expect(action).toEqual({
      kind: 'start_program_day',
      suggestion: {
        exerciseId: 'bench',
        isCardio: false,
        weightKg: null,
        reps: 8,
        setNumber: 1,
        targetSets: 3,
        prChance: false,
      },
    });
  });

  it('start_program_day: prefills last historical weight×reps (below the rep-range top → no PR chance)', () => {
    const action = computeNextAction(input({ lastSetByExercise: { bench: { weightKg: 100, reps: 10 } } }));
    if (action.kind !== 'start_program_day') throw new Error(action.kind);
    expect(action.suggestion).toMatchObject({ exerciseId: 'bench', weightKg: 100, reps: 10, prChance: false });
  });

  it('start_program_day: last set hit the rep-range top → +2.5kg back at repLow, prChance', () => {
    const action = computeNextAction(input({ lastSetByExercise: { bench: { weightKg: 100, reps: 12 } } }));
    if (action.kind !== 'start_program_day') throw new Error(action.kind);
    expect(action.suggestion).toMatchObject({ exerciseId: 'bench', weightKg: 102.5, reps: 8, prChance: true });
  });
});

describe('computeNextAction — resting', () => {
  it('within the rest window: same exercise, next set, remaining seconds derived from the last save', () => {
    const action = computeNextAction(
      input({
        session: activeSession(30, 'bench'),
        setsToday: { bench: 1 },
        lastSetByExercise: { bench: { weightKg: 100, reps: 5 } },
      }),
    );
    expect(action).toEqual({
      kind: 'resting',
      restStartedAt: NOW - 30 * SEC,
      restTargetSec: DEFAULT_REST_TARGET_SEC,
      restRemainSec: 60,
      suggestion: {
        exerciseId: 'bench',
        isCardio: false,
        weightKg: 100,
        reps: 5,
        setNumber: 2,
        targetSets: 3,
        prChance: false,
      },
    });
  });

  it('rest overrun is neutral: remain sits at 0, still resting until the idle threshold (§9)', () => {
    const action = computeNextAction(
      input({
        session: activeSession(600, 'bench'), // exactly the threshold — NOT idle yet
        setsToday: { bench: 1 },
        lastSetByExercise: { bench: { weightKg: 100, reps: 5 } },
      }),
    );
    if (action.kind !== 'resting') throw new Error(action.kind);
    expect(action.restRemainSec).toBe(0);
  });

  it('does not auto-increase inside the same session when fatigue/RIR is unknown', () => {
    const action = computeNextAction(
      input({
        session: activeSession(20, 'bench'),
        setsToday: { bench: 2 },
        lastSetByExercise: { bench: { weightKg: 102.5, reps: 12 } },
      }),
    );
    if (action.kind !== 'resting') throw new Error(action.kind);
    expect(action.suggestion).toMatchObject({ weightKg: 102.5, reps: 12, prChance: false, setNumber: 3 });
  });

  it('keeps the same-session load after app restoration as well', () => {
    const action = computeNextAction(
      input({
        session: activeSession(20, 'bench'),
        setsToday: { bench: 1 },
        lastSetByExercise: { bench: { weightKg: 100, reps: 12 } },
      }),
    );
    if (action.kind !== 'resting') throw new Error(action.kind);
    expect(action.suggestion).toMatchObject({ weightKg: 100, reps: 12, prChance: false, setNumber: 2 });
  });

  it('bodyweight never gets a +2.5kg PR chance (progresses by reps, kept as-is)', () => {
    const action = computeNextAction(
      input({
        session: activeSession(20, 'bench'),
        setsToday: { bench: 1 },
        lastSetByExercise: { bench: { weightKg: 0, reps: 12 } },
      }),
    );
    if (action.kind !== 'resting') throw new Error(action.kind);
    expect(action.suggestion).toMatchObject({ weightKg: 0, reps: 12, prChance: false });
  });

  it('advances to the next program exercise once the current one hits its target sets', () => {
    const action = computeNextAction(
      input({
        session: activeSession(45, 'bench'),
        setsToday: { bench: 3 },
        lastSetByExercise: { bench: { weightKg: 100, reps: 12 }, row: { weightKg: 60, reps: 8 } },
      }),
    );
    if (action.kind !== 'resting') throw new Error(action.kind);
    expect(action.suggestion).toMatchObject({ exerciseId: 'row', weightKg: 60, reps: 8, setNumber: 1, targetSets: 3 });
  });

  it('suggests the cardio slot as isCardio (no weight×reps one-tap payload)', () => {
    const action = computeNextAction(
      input({ session: activeSession(45, 'row'), setsToday: { bench: 3, row: 3 } }),
    );
    if (action.kind !== 'resting') throw new Error(action.kind);
    expect(action.suggestion).toEqual({
      exerciseId: 'hiit',
      isCardio: true,
      weightKg: null,
      reps: null,
      setNumber: 1,
      targetSets: 1,
      prChance: false,
    });
  });

  it('just-started session with no set yet: resting with NO ring anchor (restStartedAt null, remain 0)', () => {
    const action = computeNextAction(
      input({ session: { ...activeSession(null), startedAt: NOW - 30 * SEC } }),
    );
    if (action.kind !== 'resting') throw new Error(action.kind);
    expect(action.restStartedAt).toBeNull();
    expect(action.restRemainSec).toBe(0);
    expect(action.suggestion).toMatchObject({ exerciseId: 'bench' }); // first program slot
  });

  it('off-program exercise: same-exercise continuation with the default target sets', () => {
    const action = computeNextAction(
      input({
        session: activeSession(30, 'weighted_dip'),
        setsToday: { weighted_dip: 1 },
        lastSetByExercise: { weighted_dip: { weightKg: 20, reps: 10 } },
      }),
    );
    if (action.kind !== 'resting') throw new Error(action.kind);
    expect(action.suggestion).toMatchObject({
      exerciseId: 'weighted_dip',
      weightKg: 20,
      reps: 10,
      setNumber: 2,
      targetSets: DEFAULT_TARGET_SETS,
      prChance: false, // no programmed rep range → no PR-chance bump
    });
  });
});

describe('computeNextAction — session_idle', () => {
  it('no set for >10min → session_idle with the elapsed seconds', () => {
    const action = computeNextAction(
      input({
        session: activeSession(660, 'bench'),
        setsToday: { bench: 1 },
        lastSetByExercise: { bench: { weightKg: 100, reps: 5 } },
      }),
    );
    expect(action).toMatchObject({ kind: 'session_idle', idleSec: 660 });
    if (action.kind !== 'session_idle') throw new Error(action.kind);
    expect(action.suggestion).toMatchObject({ exerciseId: 'bench', weightKg: 100, reps: 5 });
  });

  it('free session gone quiet with nothing logged: idle measured from session start, no suggestion', () => {
    const action = computeNextAction(
      input({ session: activeSession(null), day: { isRestDay: false, slots: [] } }),
    );
    expect(action).toEqual({ kind: 'session_idle', suggestion: null, idleSec: 3600 });
  });
});

describe('computeNextAction — wrap_up', () => {
  it('all program-day exercises at target sets → wrap_up with total sets', () => {
    const action = computeNextAction(
      input({ session: activeSession(30, 'hiit'), setsToday: { bench: 3, row: 4, hiit: 1 } }),
    );
    expect(action).toEqual({ kind: 'wrap_up', setsDone: 8, sessionActive: true });
  });

  it('stays wrap_up (calm done state) after the session was finished', () => {
    const action = computeNextAction(input({ setsToday: { bench: 3, row: 3, hiit: 1 } }));
    expect(action).toEqual({ kind: 'wrap_up', setsDone: 7, sessionActive: false });
  });

  it('never wraps up an empty program day (no vacuous completion)', () => {
    const action = computeNextAction(input({ day: { isRestDay: false, slots: [] } }));
    expect(action.kind).toBe('start_free');
  });
});

describe('deriveSuggestion — set-count bookkeeping', () => {
  it('numbers the upcoming set as setsToday + 1', () => {
    const suggestion = deriveSuggestion(
      input({
        session: activeSession(10, 'bench'),
        setsToday: { bench: 2 },
        lastSetByExercise: { bench: { weightKg: 80, reps: 9 } },
      }),
    );
    expect(suggestion).toMatchObject({ setNumber: 3, targetSets: 3 });
  });

  it('skips a completed lead slot when picking the next exercise (no session context)', () => {
    const suggestion = deriveSuggestion(input({ setsToday: { bench: 3 } }));
    expect(suggestion).toMatchObject({ exerciseId: 'row', setNumber: 1 });
  });

  it('returns null when every slot is complete', () => {
    expect(deriveSuggestion(input({ setsToday: { bench: 3, row: 3, hiit: 1 } }))).toBeNull();
  });
});
