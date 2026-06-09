import { BASE_SCALE } from '../combat-power/constants';
import { addDays, createRival, daysBetween, rivalCpOn, rivalGainOn, weekStartLocal, type RivalConfig } from './rival';
import { pickWeeklyBoss, type BossCandidate } from './weeklyBoss';

const cfg: RivalConfig = { name: 'KAIROS', epoch: '2026-06-01', cp0: 300, seed: 1234 };

describe('rival curve', () => {
  it('is deterministic and monotonic non-decreasing', () => {
    const a = rivalCpOn(cfg, '2026-06-15');
    const b = rivalCpOn(cfg, '2026-06-15');
    expect(a).toBe(b);
    let prev = cfg.cp0;
    for (let i = 1; i <= 30; i++) {
      const cp = rivalCpOn(cfg, addDays(cfg.epoch, i));
      expect(cp).toBeGreaterThanOrEqual(prev);
      prev = cp;
    }
  });

  it('grows every day (gain >= 6 floor) and is clamped at BASE_SCALE', () => {
    expect(rivalGainOn(cfg, '2026-06-10')).toBeGreaterThanOrEqual(6);
    const far = rivalCpOn(cfg, addDays(cfg.epoch, 3650));
    expect(far).toBeLessThanOrEqual(BASE_SCALE);
  });

  it('on/before epoch → cp0', () => {
    expect(rivalCpOn(cfg, cfg.epoch)).toBe(cfg.cp0);
    expect(rivalCpOn(cfg, '2026-05-20')).toBe(cfg.cp0);
  });

  it('createRival spawns just below the user (user starts ahead — chase framing)', () => {
    const r = createRival(1000, '2026-06-08', () => 0.42);
    expect(r.cp0).toBeLessThan(1000);
    expect(r.cp0).toBeGreaterThan(800);
    expect(r.epoch).toBe('2026-06-08');
    expect(r.name.length).toBeGreaterThan(1);
  });

  it('date helpers: daysBetween + Monday week start', () => {
    expect(daysBetween('2026-06-01', '2026-06-08')).toBe(7);
    expect(weekStartLocal('2026-06-08')).toBe('2026-06-08'); // 2026-06-08 is a Monday
    expect(weekStartLocal('2026-06-14')).toBe('2026-06-08'); // Sunday → same week's Monday
  });
});

describe('weekly boss picker', () => {
  const cands: BossCandidate[] = [
    { exerciseId: 'bench', isBodyweight: false, bestWeight: 100, bestReps: 5, bestScore: 116, sets14d: 9 },
    { exerciseId: 'squat', isBodyweight: false, bestWeight: 140, bestReps: 3, bestScore: 154, sets14d: 6 },
    { exerciseId: 'pull_up', isBodyweight: true, bestWeight: 0, bestReps: 12, bestScore: 12, sets14d: 4 },
    { exerciseId: 'curl', isBodyweight: false, bestWeight: 20, bestReps: 12, bestScore: 28, sets14d: 0 }, // untrained → excluded
  ];

  it('picks deterministically per week from the top-3 trained lifts', () => {
    const a = pickWeeklyBoss(cands, '2026-06-08');
    const b = pickWeeklyBoss(cands, '2026-06-08');
    expect(a).toEqual(b);
    expect(['bench', 'squat', 'pull_up']).toContain(a?.exerciseId);
  });

  it('loaded boss = +2.5kg same reps; bodyweight boss = +1 rep', () => {
    const loaded = pickWeeklyBoss([cands[0]], '2026-06-08');
    expect(loaded).toEqual({ exerciseId: 'bench', isBodyweight: false, targetWeight: 102.5, targetReps: 5 });
    const bw = pickWeeklyBoss([cands[2]], '2026-06-08');
    expect(bw).toEqual({ exerciseId: 'pull_up', isBodyweight: true, targetWeight: 0, targetReps: 13 });
  });

  it('no history → null (no fake boss, no shame)', () => {
    expect(pickWeeklyBoss([], '2026-06-08')).toBeNull();
    expect(pickWeeklyBoss([cands[3]], '2026-06-08')).toBeNull();
  });
});
