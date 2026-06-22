import { warriorCompletion, AXIS_WEIGHT, type WarriorInput } from './completion';

const base: WarriorInput = {
  strength01: 0.5,
  streak01: 0.5,
  discipline01: 0.5,
  disciplineTracked: true,
  bodyFatFraction: null,
  weightKg: null,
  startWeightKg: null,
  targetWeightKg: null,
};

describe('warriorCompletion', () => {
  it('physique is INACTIVE with no body data, and overall renormalizes over the rest (anti-shame)', () => {
    const r = warriorCompletion(base);
    const phys = r.axes.find((a) => a.key === 'physique')!;
    expect(phys.active).toBe(false);
    // strength .5 + discipline .5 → overall .5 (physique dropped, not a hidden 0)
    expect(r.overall01).toBeCloseTo(0.5, 5);
  });

  it('inactive physique does NOT drag overall down vs a fully-complete physique-less warrior', () => {
    const r = warriorCompletion({ ...base, strength01: 1, streak01: 1, discipline01: 1 });
    expect(r.overall01).toBeCloseTo(1, 5); // not penalized for missing body data
  });

  it('physique activates from start→target weight progress (cut)', () => {
    const r = warriorCompletion({ ...base, startWeightKg: 90, targetWeightKg: 80, weightKg: 85 });
    const phys = r.axes.find((a) => a.key === 'physique')!;
    expect(phys.active).toBe(true);
    expect(phys.fill01).toBeCloseTo(0.5, 5); // halfway 90→80
  });

  it('weight progress works for a bulk (target above start)', () => {
    const r = warriorCompletion({ ...base, startWeightKg: 70, targetWeightKg: 80, weightKg: 75 });
    expect(r.axes.find((a) => a.key === 'physique')!.fill01).toBeCloseTo(0.5, 5);
  });

  it('body fat fills toward the lean band (18% ~ mid)', () => {
    const r = warriorCompletion({ ...base, bodyFatFraction: 0.18 });
    const phys = r.axes.find((a) => a.key === 'physique')!;
    expect(phys.active).toBe(true);
    expect(phys.fill01).toBeGreaterThan(0.4);
    expect(phys.fill01).toBeLessThan(0.7);
  });

  it('discipline uses streak alone until protein/rest is tracked', () => {
    const tracked = warriorCompletion({ ...base, streak01: 1, discipline01: 0, disciplineTracked: true });
    const untracked = warriorCompletion({ ...base, streak01: 1, discipline01: 0, disciplineTracked: false });
    expect(tracked.axes.find((a) => a.key === 'discipline')!.fill01).toBeCloseTo(0.5, 5); // (1+0)/2
    expect(untracked.axes.find((a) => a.key === 'discipline')!.fill01).toBeCloseTo(1, 5); // streak only
  });

  it('nextFocus = lowest active axis', () => {
    const r = warriorCompletion({ ...base, strength01: 0.2, streak01: 0.9, discipline01: 0.9 });
    expect(r.nextFocus).toBe('strength');
  });

  it('nextFocus is null when every active axis is complete', () => {
    const r = warriorCompletion({ ...base, strength01: 1, streak01: 1, discipline01: 1 });
    expect(r.nextFocus).toBeNull();
  });

  it('overall is weighted (strength/physique heavier than discipline)', () => {
    expect(AXIS_WEIGHT.strength).toBeGreaterThan(AXIS_WEIGHT.discipline);
    expect(AXIS_WEIGHT.physique).toBeGreaterThan(AXIS_WEIGHT.discipline);
    // strength maxed, others 0, all active (give body data so physique active=0)
    const r = warriorCompletion({ ...base, strength01: 1, streak01: 0, discipline01: 0, startWeightKg: 90, targetWeightKg: 80, weightKg: 90 });
    // active weights: s .35, p .35, d .30 → overall = .35*1 = .35
    expect(r.overall01).toBeCloseTo(0.35, 5);
  });
});
