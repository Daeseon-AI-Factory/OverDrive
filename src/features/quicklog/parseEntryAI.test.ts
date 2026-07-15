import { normalizeAISets, parseEntryAI } from './parseEntryAI';

const mockAuthorizedAiFetch = jest.fn();
jest.mock('@/features/subscription/workerClient', () => ({
  authorizedAiFetch: (...args: unknown[]) => mockAuthorizedAiFetch(...args),
}));

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

  it('caps even a hostile worker payload at 30 sets', () => {
    const rows = Array.from({ length: 40 }, (_, index) => ({ exerciseName: `Lift ${index}`, reps: 5 }));
    expect(normalizeAISets({ sets: rows })).toHaveLength(30);
  });

  it('rounds weight, coerces reps + rir, normalizes isBodyweight', () => {
    const out = normalizeAISets({ sets: [{ exerciseName: 'Pull-Up', weightKg: 20.567, reps: 8.0, rir: '1' }] });
    expect(out[0].weightKg).toBeCloseTo(20.57, 2);
    expect(out[0].reps).toBe(8);
    expect(out[0].rir).toBe(1);
    expect(out[0].isBodyweight).toBeUndefined();
  });

  it('drops or neutralizes provider garbage before it can reach durable logging', () => {
    const longName = '운'.repeat(61);
    const out = normalizeAISets({
      sets: [
        { exerciseId: 'valid_press', exerciseName: 'Valid', weightKg: 2000, reps: 999, rir: 4 },
        { exerciseId: 'valid_press', exerciseName: 'Fraction reps', weightKg: 20, reps: 8.4 },
        { exerciseId: 'valid_press', exerciseName: 'Too many reps', weightKg: 20, reps: 1000 },
        { exerciseId: 'valid_press', exerciseName: 'Absurd load', weightKg: 2000.01, reps: 8 },
        { exerciseId: 'INVALID ID', exerciseName: 'Bad id', weightKg: 20, reps: 8 },
        { exerciseId: '', exerciseName: longName, weightKg: 0, reps: 8 },
        { exerciseId: '', exerciseName: 'Control\u0000name', weightKg: 0, reps: 8 },
        { exerciseId: 'valid_press', exerciseName: 'Bad RIR becomes absent', weightKg: 20, reps: 8, rir: 99 },
      ],
    });

    expect(out).toEqual([
      expect.objectContaining({ exerciseId: 'valid_press', weightKg: 2000, reps: 999, rir: 4 }),
      expect.objectContaining({ exerciseName: 'Bad RIR becomes absent', weightKg: 20, reps: 8, rir: null }),
    ]);
  });

  it('sends only 64 canonical candidates/four bounded names and maps canonical ids back to bridges', async () => {
    mockAuthorizedAiFetch.mockResolvedValue({
      json: async () => ({
        sets: [{ exerciseId: 'canonical_0', exerciseName: 'Localized 0', reps: 8, weightKg: 20 }],
      }),
    });
    const candidates = Array.from({ length: 70 }, (_, index) => ({
      id: `catalog_${String(index).padStart(32, '0')}`,
      catalogId: `canonical_${index}`,
      name: `Localized ${index}`,
      aliases: ['one', 'two', 'three', 'four', 'x'.repeat(61)],
      isBodyweight: false,
    }));

    const sets = await parseEntryAI('log it', candidates, 'metric', 'https://example.test');
    const request = mockAuthorizedAiFetch.mock.calls[0][2] as { body: string };
    const payload = JSON.parse(request.body) as { exercises: { id: string; names: string[] }[] };
    expect(payload.exercises).toHaveLength(64);
    expect(payload.exercises.every((exercise) => exercise.names.length <= 4)).toBe(true);
    expect(payload.exercises.every((exercise) => exercise.names.every((name) => [...name].length <= 60))).toBe(true);
    expect(sets[0].exerciseId).toBe(candidates[0].id);
  });

  it('drops hallucinated nonempty canonical ids but preserves explicit name-only ad-hoc proposals', async () => {
    mockAuthorizedAiFetch.mockResolvedValue({
      json: async () => ({
        sets: [
          { exerciseId: 'hallucinated_id', exerciseName: 'Fake', reps: 8 },
          { exerciseId: '', exerciseName: 'User named movement', reps: 10 },
        ],
      }),
    });
    const candidates = [{
      id: 'catalog_00000000000040008000000000000001',
      catalogId: 'known_press',
      name: 'Known Press',
      aliases: [],
      isBodyweight: false,
    }];
    await expect(parseEntryAI('log it', candidates, 'metric', 'https://example.test')).resolves.toEqual([
      expect.objectContaining({ exerciseId: '', exerciseName: 'User named movement', reps: 10 }),
    ]);
  });
});
