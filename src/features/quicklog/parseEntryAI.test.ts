import { normalizeAISets } from './parseEntryAI';

describe('normalizeAISets', () => {
  it('keeps every set with positive reps (catalog + new exercises)', () => {
    const out = normalizeAISets({
      sets: [
        { exerciseId: 'barbell_bench_press', exerciseName: 'Bench', weightKg: 100, reps: 5, rir: 2 },
        { exerciseId: '', exerciseName: 'Burpees', weightKg: 0, reps: 10, isBodyweight: true }, // new exercise
        { exerciseId: 'pull_up', exerciseName: 'Pull-Up', weightKg: 0, reps: 0 }, // drop — reps <= 0
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ exerciseId: 'barbell_bench_press', weightKg: 100, reps: 5, rir: 2 });
    expect(out[1]).toMatchObject({ exerciseId: '', exerciseName: 'Burpees', weightKg: 0, reps: 10, isBodyweight: true });
  });

  it('drops rows that identify nothing', () => {
    const out = normalizeAISets({ sets: [{ exerciseId: '', exerciseName: '', reps: 5 }] });
    expect(out).toEqual([]);
  });

  it('returns [] for missing / malformed shapes', () => {
    expect(normalizeAISets({})).toEqual([]);
    expect(normalizeAISets(null)).toEqual([]);
    expect(normalizeAISets({ sets: 'nope' })).toEqual([]);
  });

  it('rounds weight, coerces reps + rir, normalizes isBodyweight', () => {
    const out = normalizeAISets({ sets: [{ exerciseName: 'Pull-Up', weightKg: 20.567, reps: 8.0, rir: '1' }] });
    expect(out[0].weightKg).toBeCloseTo(20.57, 2);
    expect(out[0].reps).toBe(8);
    expect(out[0].rir).toBe(1);
    expect(out[0].isBodyweight).toBeUndefined();
  });
});
