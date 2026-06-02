import { detectPr, epley1RM, setScore } from './detectPr';

describe('epley1RM', () => {
  it('is the 1-rep weight at reps=1 and grows with weight and reps', () => {
    expect(epley1RM(100, 1)).toBeCloseTo(100 * (1 + 1 / 30), 6);
    expect(epley1RM(100, 5)).toBeGreaterThan(epley1RM(100, 1));
    expect(epley1RM(120, 5)).toBeGreaterThan(epley1RM(100, 5));
  });

  it('is 0 for non-positive reps or weight', () => {
    expect(epley1RM(100, 0)).toBe(0);
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(-10, 5)).toBe(0);
  });
});

describe('detectPr — weighted lifts', () => {
  it('first-ever set is NOT a PR (nothing to beat) but returns its score', () => {
    const r = detectPr({ weight: 100, reps: 5 }, null);
    expect(r.isPr).toBe(false);
    expect(r.score).toBeCloseTo(epley1RM(100, 5), 6);
  });

  it('beating the previous best is a PR', () => {
    const prev = epley1RM(100, 5);
    expect(detectPr({ weight: 105, reps: 5 }, prev).isPr).toBe(true);
    expect(detectPr({ weight: 100, reps: 6 }, prev).isPr).toBe(true);
  });

  it('matching the previous best is NOT a PR (must exceed)', () => {
    const prev = epley1RM(100, 5);
    expect(detectPr({ weight: 100, reps: 5 }, prev).isPr).toBe(false);
  });

  it('below the previous best is NOT a PR', () => {
    const prev = epley1RM(100, 5);
    expect(detectPr({ weight: 95, reps: 5 }, prev).isPr).toBe(false);
  });

  it('e1RM crossover: more reps at lower weight can beat fewer reps at higher weight', () => {
    const prev = epley1RM(110, 1); // 110.0
    const r = detectPr({ weight: 100, reps: 5 }, prev); // 116.67 > 110
    expect(r.isPr).toBe(true);
  });
});

describe('detectPr — bodyweight (weight 0 → reps as score)', () => {
  it('uses reps as the score and detects rep PRs', () => {
    expect(setScore(0, 12)).toBe(12);
    expect(detectPr({ weight: 0, reps: 12 }, 10).isPr).toBe(true);
    expect(detectPr({ weight: 0, reps: 10 }, 10).isPr).toBe(false);
    expect(detectPr({ weight: 0, reps: 8 }, 10).isPr).toBe(false);
  });

  it('zero reps is never a PR', () => {
    expect(detectPr({ weight: 0, reps: 0 }, null).isPr).toBe(false);
    expect(detectPr({ weight: 0, reps: 0 }, 5).isPr).toBe(false);
  });
});
