import { buildDaySections, clockSpan, dayLabel, displayNum, formatClock } from './timeline';
import type { TimelineCardioInput, TimelineSetInput } from './timeline';

const set = (over: Partial<TimelineSetInput>): TimelineSetInput => ({
  id: 'set-1',
  date: '2026-07-05',
  exercise_id: 'barbell_bench_press',
  weight: 100,
  reps: 5,
  rir: null,
  is_pr: 0,
  logged_at: '2026-07-05T05:00:00.000Z',
  ...over,
});

const cardio = (over: Partial<TimelineCardioInput>): TimelineCardioInput => ({
  id: 'cardio-1',
  date: '2026-07-05',
  modality: 'outdoor_run',
  duration_sec: 1200,
  distance_m: null,
  logged_at: '2026-07-05T06:00:00.000Z',
  ...over,
});

describe('buildDaySections', () => {
  it('returns empty for no data', () => {
    expect(buildDaySections([], [])).toEqual([]);
  });

  it('orders sections newest day first', () => {
    const sections = buildDaySections(
      [set({ id: 'a', date: '2026-07-03' }), set({ id: 'b', date: '2026-07-05' })],
      [],
    );
    expect(sections.map((s) => s.date)).toEqual(['2026-07-05', '2026-07-03']);
  });

  it('sums the day summary: sets, volume, PR count, cardio minutes, first/last time', () => {
    const [day] = buildDaySections(
      [
        set({ id: 'a', weight: 100, reps: 5, logged_at: '2026-07-05T05:00:00.000Z' }),
        set({ id: 'b', weight: 105, reps: 3, is_pr: 1, logged_at: '2026-07-05T05:10:00.000Z' }),
      ],
      [cardio({ duration_sec: 1230, logged_at: '2026-07-05T05:40:00.000Z' })],
    );
    expect(day.totalSets).toBe(2);
    expect(day.totalVolumeKg).toBe(100 * 5 + 105 * 3);
    expect(day.prCount).toBe(1);
    expect(day.cardioMinutes).toBe(21); // 1230s → 20.5min → rounds to 21
    expect(day.firstAt).toBe('2026-07-05T05:00:00.000Z');
    expect(day.lastAt).toBe('2026-07-05T05:40:00.000Z');
  });

  it('groups sets by exercise (returning exercise merges) and interleaves cardio chronologically', () => {
    const [day] = buildDaySections(
      [
        set({ id: 'bench1', exercise_id: 'barbell_bench_press', logged_at: '2026-07-05T05:00:00.000Z' }),
        set({ id: 'squat1', exercise_id: 'barbell_back_squat', logged_at: '2026-07-05T05:20:00.000Z' }),
        // back to bench AFTER squats — must merge into the earlier bench group, in time order
        set({ id: 'bench2', exercise_id: 'barbell_bench_press', logged_at: '2026-07-05T05:40:00.000Z' }),
      ],
      [cardio({ id: 'run', logged_at: '2026-07-05T05:10:00.000Z' })],
    );
    expect(
      day.items.map((i) => (i.kind === 'exercise' ? i.exerciseId : i.modality)),
    ).toEqual(['barbell_bench_press', 'outdoor_run', 'barbell_back_squat']);
    const bench = day.items[0];
    if (bench.kind !== 'exercise') throw new Error('expected exercise group');
    expect(bench.sets.map((s) => s.id)).toEqual(['bench1', 'bench2']);
    expect(bench.firstLoggedAt).toBe('2026-07-05T05:00:00.000Z');
  });

  it('marks PR chips and keeps bodyweight sets at 0 volume', () => {
    const [day] = buildDaySections(
      [
        set({ id: 'pu', exercise_id: 'pull_up', weight: 0, reps: 12, is_pr: 1 }),
      ],
      [],
    );
    expect(day.totalVolumeKg).toBe(0);
    const group = day.items[0];
    if (group.kind !== 'exercise') throw new Error('expected exercise group');
    expect(group.sets[0].isPr).toBe(true);
  });

  it('builds cardio-only days (0 sets) with the cardio entry carrying duration/distance', () => {
    const [day] = buildDaySections([], [cardio({ duration_sec: 1800, distance_m: 5000 })]);
    expect(day.totalSets).toBe(0);
    expect(day.cardioMinutes).toBe(30);
    const entry = day.items[0];
    if (entry.kind !== 'cardio') throw new Error('expected cardio entry');
    expect(entry.distanceM).toBe(5000);
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 6, 5); // 2026-07-05 local

  it('labels today / yesterday / older dates', () => {
    expect(dayLabel('2026-07-05', now)).toEqual({ kind: 'today' });
    expect(dayLabel('2026-07-04', now)).toEqual({ kind: 'yesterday' });
    expect(dayLabel('2026-06-28', now)).toEqual({ kind: 'date', month: 6, day: 28 });
  });
});

describe('clocks', () => {
  // Build ISO from a LOCAL wall time so the assertion is timezone-independent.
  const iso = (h: number, m: number) => new Date(2026, 6, 5, h, m).toISOString();

  it('formats local HH:MM zero-padded', () => {
    expect(formatClock(iso(9, 5))).toBe('09:05');
  });

  it('renders a span, collapsing to one time for a single-minute day', () => {
    expect(clockSpan(iso(14, 5), iso(15, 12))).toBe('14:05-15:12');
    expect(clockSpan(iso(14, 5), iso(14, 5))).toBe('14:05');
  });
});

describe('displayNum', () => {
  it('trims trailing .0 and keeps one decimal', () => {
    expect(displayNum(100)).toBe('100');
    expect(displayNum(102.5)).toBe('102.5');
    expect(displayNum(220.462)).toBe('220.5');
  });
});
