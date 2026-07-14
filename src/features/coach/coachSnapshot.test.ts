import type { ProgramSlot } from '@/features/program/types';
import { computeNextAction } from './nextAction';
import { deriveCoachStrengthSnapshot, type CoachSetRow } from './coachSnapshot';

const NOW = Date.parse('2026-07-14T18:00:00.000Z');
const MINUTE = 60_000;

function setRow(input: Partial<CoachSetRow> & Pick<CoachSetRow, 'session_id' | 'exercise_id'>): CoachSetRow {
  return {
    weight: 80,
    reps: 8,
    order_index: 0,
    logged_at: new Date(NOW).toISOString(),
    ...input,
  };
}

describe('coach snapshot session integrity', () => {
  it('keeps daily totals but anchors a resumed workout to its own last set', () => {
    const completedSessionSet = setRow({
      session_id: 'completed-session',
      exercise_id: 'bench',
      weight: 100,
      reps: 5,
      logged_at: new Date(NOW - MINUTE).toISOString(),
    });
    const openSessionSet = setRow({
      session_id: 'open-session',
      exercise_id: 'row',
      weight: 82.5,
      reps: 7,
      logged_at: new Date(NOW - 12 * MINUTE).toISOString(),
    });
    const snapshot = deriveCoachStrengthSnapshot([openSessionSet, completedSessionSet], 'open-session');

    expect(snapshot.setsToday).toEqual({ row: 1, bench: 1 });
    expect(snapshot.currentSessionLastSet).toEqual({
      exerciseId: 'row',
      weightKg: 82.5,
      reps: 7,
      loggedAtMs: NOW - 12 * MINUTE,
    });
    const currentSessionLastSet = snapshot.currentSessionLastSet;
    if (currentSessionLastSet == null) throw new Error('missing active-session anchor');

    const slots: ProgramSlot[] = [
      { exerciseId: 'bench', targetSets: 3, repLow: 5, repHigh: 8 },
      { exerciseId: 'row', targetSets: 3, repLow: 6, repHigh: 10 },
    ];
    const action = computeNextAction({
      now: NOW,
      session: {
        active: true,
        startedAt: NOW - 25 * MINUTE,
        lastSetAt: currentSessionLastSet.loggedAtMs,
        lastExerciseId: currentSessionLastSet.exerciseId,
      },
      day: { isRestDay: false, slots },
      setsToday: snapshot.setsToday,
      lastSetByExercise: snapshot.lastSetByExercise,
    });

    expect(action).toMatchObject({
      kind: 'session_idle',
      idleSec: 12 * 60,
      suggestion: { exerciseId: 'row', weightKg: 82.5, reps: 7 },
    });
  });

  it('pins the active session load even if another same-day session logged that exercise later', () => {
    const snapshot = deriveCoachStrengthSnapshot(
      [
        setRow({
          session_id: 'open-session',
          exercise_id: 'row',
          weight: 82.5,
          reps: 7,
          logged_at: new Date(NOW - 12 * MINUTE).toISOString(),
        }),
        setRow({
          session_id: 'completed-session',
          exercise_id: 'row',
          weight: 100,
          reps: 5,
          logged_at: new Date(NOW - MINUTE).toISOString(),
        }),
      ],
      'open-session',
    );

    expect(snapshot.setsToday.row).toBe(2);
    expect(snapshot.lastSetByExercise.row).toEqual({ weightKg: 82.5, reps: 7 });
  });
});
