import { normalizeAISets } from './parseEntryAI';

const ids = new Set(['barbell_bench_press', 'pull_up']);

describe('normalizeAISets', () => {
  it('keeps valid sets, drops unknown ids + non-positive reps', () => {
    const out = normalizeAISets(
      {
        sets: [
          { exerciseId: 'barbell_bench_press', exerciseName: 'Bench', weightKg: 100, reps: 5, rir: 2 },
          { exerciseId: 'unknown_x', weightKg: 50, reps: 5 }, // drop — not in catalog (anti-hallucination)
          { exerciseId: 'pull_up', weightKg: 0, reps: 12 }, // keep — bodyweight
          { exerciseId: 'pull_up', weightKg: 0, reps: 0 }, // drop — reps <= 0
        ],
      },
      ids,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ exerciseId: 'barbell_bench_press', exerciseName: 'Bench', weightKg: 100, reps: 5, rir: 2 });
    expect(out[1]).toMatchObject({ exerciseId: 'pull_up', weightKg: 0, reps: 12, rir: null });
  });

  it('returns [] for missing / malformed shapes', () => {
    expect(normalizeAISets({}, ids)).toEqual([]);
    expect(normalizeAISets(null, ids)).toEqual([]);
    expect(normalizeAISets({ sets: 'nope' }, ids)).toEqual([]);
  });

  it('rounds weight, coerces reps + rir', () => {
    const out = normalizeAISets({ sets: [{ exerciseId: 'pull_up', weightKg: 20.567, reps: 8.0, rir: '1' }] }, ids);
    expect(out[0].weightKg).toBeCloseTo(20.57, 2);
    expect(out[0].reps).toBe(8);
    expect(out[0].rir).toBe(1);
  });
});
