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

  it('unambiguous parse carries NO candidates field (existing instant-save path unchanged)', () => {
    const r = parseEntry('벤치 100 5', CATALOG);
    expect(r.ok && r.candidates).toBeUndefined();
  });
});

describe('parseEntry candidates (disambiguation)', () => {
  const AMBIG: ParseCandidate[] = [
    { id: 'barbell_bench_press', name: '바벨 벤치프레스', aliases: ['벤치프레스', '벤치', 'bench'], isBodyweight: false },
    { id: 'incline_bench_press', name: '인클라인 벤치', aliases: ['인클라인 벤치프레스', '벤치', 'incline bench'], isBodyweight: false },
    { id: 'overhead_press', name: '오버헤드 프레스', aliases: ['press', 'ohp'], isBodyweight: false },
    { id: 'leg_press', name: '레그 프레스', aliases: ['press'], isBodyweight: false },
    { id: 'chin_up', name: 'Chin Up', aliases: ['chinup'], isBodyweight: true },
    { id: 'chin_tuck', name: 'Chin Tuck', aliases: ['chin'], isBodyweight: true },
    { id: 'pull_up', name: '풀업', aliases: ['pullup'], isBodyweight: true },
  ];

  it('exact tie on a shared alias → both surface; set still parses as the catalog-order winner', () => {
    const r = parseEntry('벤치 100 5', AMBIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.set).toMatchObject({ exerciseId: 'barbell_bench_press', weightKg: 100, reps: 5 });
    expect(r.candidates?.map((c) => c.id)).toEqual(['barbell_bench_press', 'incline_bench_press']);
  });

  it('tie on a shared alias ("press") lists every tied entry, catalog order', () => {
    const r = parseEntry('press 100 5', AMBIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.set.exerciseId).toBe('overhead_press'); // first tied entry in catalog order
    expect(r.candidates?.map((c) => c.id)).toEqual(['overhead_press', 'leg_press']);
  });

  it('near-tie within 2 normalized chars surfaces the rival', () => {
    // best: chinup (6 chars) — rival: chin (4 chars) → diff 2 = inside the near-tie window
    const r = parseEntry('chinup 10', AMBIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.set.exerciseId).toBe('chin_up');
    expect(r.candidates?.map((c) => c.id)).toEqual(['chin_up', 'chin_tuck']);
  });

  it('clear winner (gap > 2 chars) → no candidates field', () => {
    // best: 벤치프레스 (5 chars) — rival: 벤치 (2 chars) → diff 3 = unambiguous
    const r = parseEntry('벤치프레스 90 8', AMBIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.set.exerciseId).toBe('barbell_bench_press');
    expect(r.candidates).toBeUndefined();
  });

  it('single match → no candidates field', () => {
    const r = parseEntry('풀업 12', AMBIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidates).toBeUndefined();
  });

  it('re-parse against ONLY the tapped candidate resolves cleanly (chip-pick path)', () => {
    const first = parseEntry('벤치 60 8', AMBIG);
    expect(first.ok && first.candidates?.length).toBe(2);
    const incline = AMBIG[1];
    const picked = parseEntry('벤치 60 8', [incline]);
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;
    expect(picked.set).toMatchObject({ exerciseId: 'incline_bench_press', weightKg: 60, reps: 8 });
    expect(picked.candidates).toBeUndefined();
  });
});
