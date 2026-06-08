import { parseEntry, type ParseCandidate } from './parseEntry';

const CATALOG: ParseCandidate[] = [
  { id: 'barbell_bench_press', name: '바벨 벤치프레스', aliases: ['벤치프레스', '벤치', 'bench press', 'bench'], isBodyweight: false },
  { id: 'barbell_back_squat', name: '바벨 백스쿼트', aliases: ['스쿼트', 'squat'], isBodyweight: false },
  { id: 'pull_up', name: '풀업', aliases: ['pull up', 'pullup', '턱걸이'], isBodyweight: true },
  { id: 'deadlift', name: '데드리프트', aliases: ['데드', 'deadlift'], isBodyweight: false },
  { id: 'zone2_run', name: 'Zone 2 Run', aliases: ['zone 2 run', 'zone2'], isBodyweight: true },
];

const set = (r: ReturnType<typeof parseEntry>) => (r.ok ? r.set : null);

describe('parseEntry', () => {
  it('Korean "벤치 100 5" → bench, 100kg × 5', () => {
    expect(set(parseEntry('벤치 100 5', CATALOG))).toEqual({
      exerciseId: 'barbell_bench_press',
      exerciseName: '바벨 벤치프레스',
      weightKg: 100,
      reps: 5,
      rir: null,
    });
  });

  it('English "bench press 100 5"', () => {
    expect(set(parseEntry('bench press 100 5', CATALOG))?.exerciseId).toBe('barbell_bench_press');
  });

  it('units + rir: "스쿼트 80kg 10개 rir 2"', () => {
    expect(set(parseEntry('스쿼트 80kg 10개 rir 2', CATALOG))).toEqual({
      exerciseId: 'barbell_back_squat',
      exerciseName: '바벨 백스쿼트',
      weightKg: 80,
      reps: 10,
      rir: 2,
    });
  });

  it('bodyweight single number is reps, weight 0: "풀업 12"', () => {
    expect(set(parseEntry('풀업 12', CATALOG))).toMatchObject({ exerciseId: 'pull_up', weightKg: 0, reps: 12 });
  });

  it('weighted bodyweight two numbers: "풀업 20 12" → +20kg × 12', () => {
    expect(set(parseEntry('풀업 20 12', CATALOG))).toMatchObject({ exerciseId: 'pull_up', weightKg: 20, reps: 12 });
  });

  it('lb converts to kg: "데드 225 lb 5"', () => {
    const s = set(parseEntry('데드 225 lb 5', CATALOG));
    expect(s?.exerciseId).toBe('deadlift');
    expect(s?.weightKg).toBeCloseTo(102.06, 1);
    expect(s?.reps).toBe(5);
  });

  it('imperial unitSystem interprets a bare weight as lb', () => {
    const s = set(parseEntry('bench 135 5', CATALOG, 'imperial'));
    expect(s?.weightKg).toBeCloseTo(61.23, 1);
    expect(s?.reps).toBe(5);
  });

  it('longest-alias match wins (bench press over bench)', () => {
    expect(set(parseEntry('벤치프레스 90 8', CATALOG))?.exerciseId).toBe('barbell_bench_press');
  });

  it('digit in exercise name is not read as a number: "zone 2 run 30"', () => {
    // the "2" in "Zone 2 Run" must be stripped; only the trailing 30 counts (as reps here)
    const s = set(parseEntry('zone 2 run 30', CATALOG));
    expect(s?.exerciseId).toBe('zone2_run');
    expect(s?.reps).toBe(30);
    expect(s?.weightKg).toBe(0);
  });

  it('unknown exercise → no_exercise', () => {
    const r = parseEntry('블라블라 100 5', CATALOG);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('no_exercise');
  });

  it('no reps → no_reps', () => {
    const r = parseEntry('벤치', CATALOG);
    expect(r.ok === false && r.reason).toBe('no_reps');
  });

  it('empty → empty', () => {
    expect(parseEntry('   ', CATALOG).ok).toBe(false);
  });
});
