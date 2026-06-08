import { computeCombatPower } from './computeCombatPower';
import { ASCENDANT_MIN, BASE_SCALE, CP_FLOOR } from './constants';
import { gradeForScore, GRADES } from './grades';
import type { CombatPowerInput } from './combatPower.types';

const empty: CombatPowerInput = {
  strengthVolume7d: 0,
  sessions7d: 0,
  conditioningUnits7d: 0,
  streakDays: 0,
  discipline: null,
  verifiedRatio: 0,
};

const saturated: CombatPowerInput = {
  strengthVolume7d: 200_000,
  sessions7d: 10,
  conditioningUnits7d: 1000,
  streakDays: 120,
  discipline: { proteinDays: 7, restOkDays: 7 },
  verifiedRatio: 0,
};

const mid: CombatPowerInput = {
  strengthVolume7d: 15_000,
  sessions7d: 4,
  conditioningUnits7d: 90,
  streakDays: 7,
  discipline: { proteinDays: 5, restOkDays: 6 },
  verifiedRatio: 0,
};

describe('computeCombatPower — invariants', () => {
  it('1. empty week → CP_FLOOR (anti-shame, never zero), grade 일반인', () => {
    const r = computeCombatPower(empty);
    expect(r.score).toBe(CP_FLOOR);
    expect(r.grade.label).toBe('일반인');
    expect(r.basket01).toBe(0);
  });

  it('2. self-report is never punished — trustMultiplier is exactly 1.0 at verifiedRatio 0', () => {
    const r = computeCombatPower({ ...mid, verifiedRatio: 0 });
    expect(r.trustMultiplier).toBe(1);
    // score equals the un-bonused basket scaling (no penalty for being unverified)
    expect(r.score).toBe(Math.round(BASE_SCALE * r.basket01 * 1));
  });

  it('3. verified data is additive only and monotonic (0 → 0.5 → 1 ⇒ +0% → +7.5% → +15%)', () => {
    const v0 = computeCombatPower({ ...mid, verifiedRatio: 0 });
    const v05 = computeCombatPower({ ...mid, verifiedRatio: 0.5 });
    const v1 = computeCombatPower({ ...mid, verifiedRatio: 1 });
    expect(v0.trustMultiplier).toBeCloseTo(1.0, 10);
    expect(v05.trustMultiplier).toBeCloseTo(1.075, 10);
    expect(v1.trustMultiplier).toBeCloseTo(1.15, 10);
    expect(v0.score).toBeLessThanOrEqual(v05.score);
    expect(v05.score).toBeLessThanOrEqual(v1.score);
    expect(v1.score).toBeGreaterThan(v0.score); // basket01 > 0 so the bonus shows
  });

  it('4. strength volume is monotonic non-decreasing AND saturating (diminishing returns)', () => {
    const at = (vol: number) => computeCombatPower({ ...mid, strengthVolume7d: vol }).score;
    expect(at(0)).toBeLessThanOrEqual(at(10_000));
    expect(at(10_000)).toBeLessThanOrEqual(at(20_000));
    const earlyGain = at(20_000) - at(10_000);
    const lateGain = at(110_000) - at(100_000);
    expect(earlyGain).toBeGreaterThan(lateGain); // saturation
  });

  it('5. renormalization: absent components impose NO hidden ceiling (reach 9999 with 4 active)', () => {
    // discipline null → only 4 active components; recomp/markers inactive. With breadth unlocked
    // and all active components saturated, the score must still reach the true max, not ~70%.
    const r = computeCombatPower({ ...saturated, discipline: null, verifiedRatio: 1 });
    expect(r.score).toBe(BASE_SCALE);
    expect(r.grade.label).toBe('초월자');
    // active weights renormalize to sum 1
    const activeWeightSum = r.breakdown
      .filter((c) => c.active)
      .reduce((s, c) => s + c.weight, 0);
    expect(activeWeightSum).toBeCloseTo(1, 10);
  });

  it('6. top clamp: enormous inputs + verified → exactly BASE_SCALE, grade 초월자', () => {
    const r = computeCombatPower({ ...saturated, verifiedRatio: 1 });
    expect(r.score).toBe(BASE_SCALE);
    expect(r.grade.label).toBe('초월자');
  });

  it('7. breadth gate: self-report only (no verified, no markers) caps at 괴수 (8199), not 초월자', () => {
    const r = computeCombatPower({ ...saturated, verifiedRatio: 0 });
    expect(r.breadthUnlocked).toBe(false);
    expect(r.score).toBe(ASCENDANT_MIN - 1);
    expect(r.grade.label).toBe('괴수');
  });

  it('8. anti-shame bad day: one light set still beats nothing and stays positive', () => {
    const badDay = computeCombatPower({
      ...empty,
      strengthVolume7d: 800,
      sessions7d: 1,
      streakDays: 1,
    });
    expect(badDay.score).toBeGreaterThan(CP_FLOOR);
    expect(badDay.score).toBeGreaterThan(computeCombatPower(empty).score);
    expect(badDay.grade.label).toBe('일반인'); // a single set isn't a power spike, but it counts
  });

  it('score is always an integer within [CP_FLOOR, BASE_SCALE]', () => {
    for (const input of [empty, mid, saturated, { ...saturated, verifiedRatio: 1 }]) {
      const r = computeCombatPower(input);
      expect(Number.isInteger(r.score)).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(CP_FLOOR);
      expect(r.score).toBeLessThanOrEqual(BASE_SCALE);
    }
  });
});

describe('computeCombatPower — daily goals bonus (multiplier, never a penalty)', () => {
  it('no goals (undefined/null/zero) → goalMultiplier exactly 1, no effect, NO dilution', () => {
    const a = computeCombatPower(mid); // no dailyGoals field
    const b = computeCombatPower({ ...mid, dailyGoals: null });
    const z = computeCombatPower({ ...mid, dailyGoals: { completed7d: 0 } });
    expect(a.goalMultiplier).toBe(1);
    expect(b.score).toBe(a.score);
    // The anti-shame invariant: merely having a goal (0 completions) never LOWERS the score.
    expect(z.score).toBe(a.score);
    expect(z.goalMultiplier).toBe(1);
  });

  it('completing goals is additive-only, monotonic, saturating (+15% cap)', () => {
    const none = computeCombatPower({ ...mid, dailyGoals: { completed7d: 0 } });
    const some = computeCombatPower({ ...mid, dailyGoals: { completed7d: 7 } });
    const more = computeCombatPower({ ...mid, dailyGoals: { completed7d: 14 } });
    const huge = computeCombatPower({ ...mid, dailyGoals: { completed7d: 1000 } });
    expect(some.score).toBeGreaterThan(none.score); // crushing daily goals lifts Combat Power
    expect(more.score).toBeGreaterThanOrEqual(some.score);
    expect(some.goalMultiplier).toBeGreaterThan(1);
    expect(huge.goalMultiplier).toBeLessThanOrEqual(1.15 + 1e-9); // bonus caps at +15%
    const earlyGain = some.score - none.score;
    const lateGain = more.score - some.score;
    expect(earlyGain).toBeGreaterThanOrEqual(lateGain); // diminishing returns (equal 7-day spans)
  });
});

describe('gradeForScore — band boundaries', () => {
  it('maps each boundary to the right grade (inclusive-low)', () => {
    expect(gradeForScore(0).label).toBe('일반인');
    expect(gradeForScore(799).label).toBe('일반인');
    expect(gradeForScore(800).label).toBe('루키');
    expect(gradeForScore(1999).label).toBe('루키');
    expect(gradeForScore(2000).label).toBe('파이터');
    expect(gradeForScore(3499).label).toBe('파이터');
    expect(gradeForScore(3500).label).toBe('워리어');
    expect(gradeForScore(4999).label).toBe('워리어');
    expect(gradeForScore(5000).label).toBe('비스트');
    expect(gradeForScore(6499).label).toBe('비스트');
    expect(gradeForScore(6500).label).toBe('괴수');
    expect(gradeForScore(8199).label).toBe('괴수');
    expect(gradeForScore(8200).label).toBe('초월자');
    expect(gradeForScore(9999).label).toBe('초월자');
  });

  it('is monotonic in score across the whole range', () => {
    let lastMin = -1;
    for (let s = 0; s <= BASE_SCALE; s += 137) {
      const g = gradeForScore(s);
      expect(g.min).toBeGreaterThanOrEqual(lastMin);
      lastMin = g.min;
    }
    expect(GRADES).toHaveLength(7);
  });
});
