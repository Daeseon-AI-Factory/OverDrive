import { classifyEvent } from './classifyEvent';
import { ANTI_SHAME_FLOOR } from './constants';
import type { JuiceEvent } from './juice.types';

const set = (over: Partial<Extract<JuiceEvent, { kind: 'set' }>> = {}) =>
  classifyEvent({ kind: 'set', isPr: false, rir: 3, hitTargetReps: true, deltaCp: 6, ...over });

describe('classifyEvent — tier classification', () => {
  it('PR → T3 OVERDRIVE, reason pr, tap-to-skip (even at high RIR)', () => {
    const v = set({ isPr: true, rir: 4 });
    expect(v.tier).toBe(3);
    expect(v.reason).toBe('pr');
    expect(v.dismiss).toBe('tap');
  });

  it('PR takes precedence over hard set', () => {
    const v = set({ isPr: true, rir: 0 });
    expect(v.tier).toBe(3);
    expect(v.reason).toBe('pr');
  });

  it('hard set (RIR 0, not PR) → T3, reason set', () => {
    const v = set({ isPr: false, rir: 0, hitTargetReps: true });
    expect(v.tier).toBe(3);
    expect(v.reason).toBe('set');
  });

  it('solid set (target reps + RIR 1–3) → T2', () => {
    expect(set({ rir: 1, hitTargetReps: true }).tier).toBe(2);
    expect(set({ rir: 3, hitTargetReps: true }).tier).toBe(2);
  });

  it('weak / junk set → T1, but still pops at the anti-shame floor', () => {
    const v = set({ rir: 5, hitTargetReps: false, deltaCp: 0 });
    expect(v.tier).toBe(1);
    expect(v.reason).toBe('set');
    expect(v.intensity01).toBe(ANTI_SHAME_FLOOR); // bad day still gets a guaranteed pop
    expect(v.dismiss).toBe('auto');
  });

  it('set with no RIR recorded → T1 (not assumed solid)', () => {
    expect(set({ rir: null, hitTargetReps: true }).tier).toBe(1);
  });

  it('session complete → T4, reason session, tap', () => {
    const v = classifyEvent({ kind: 'session', deltaCp: 40 });
    expect(v.tier).toBe(4);
    expect(v.reason).toBe('session');
    expect(v.dismiss).toBe('tap');
  });

  it('streak: milestone → T4, non-milestone → T2', () => {
    expect(classifyEvent({ kind: 'streak', streakDays: 7, isMilestone: true, deltaCp: 10 }).tier).toBe(4);
    expect(classifyEvent({ kind: 'streak', streakDays: 3, isMilestone: false, deltaCp: 5 }).tier).toBe(2);
  });

  it('levelup → T4, reason levelup', () => {
    const v = classifyEvent({ kind: 'levelup', deltaCp: 0 });
    expect(v.tier).toBe(4);
    expect(v.reason).toBe('levelup');
  });
});

describe('classifyEvent — intensity & shape invariants', () => {
  it('intensity01 is always within [0,1]; duration > 0; tier in 1..4', () => {
    const events: JuiceEvent[] = [
      { kind: 'set', isPr: false, rir: 5, hitTargetReps: false, deltaCp: 0 },
      { kind: 'set', isPr: false, rir: 2, hitTargetReps: true, deltaCp: 9 },
      { kind: 'set', isPr: true, rir: 0, hitTargetReps: true, deltaCp: 999 },
      { kind: 'session', deltaCp: 1000 },
      { kind: 'levelup', deltaCp: -5 },
    ];
    for (const e of events) {
      const v = classifyEvent(e);
      expect(v.intensity01).toBeGreaterThanOrEqual(0);
      expect(v.intensity01).toBeLessThanOrEqual(1);
      expect(v.durationMs).toBeGreaterThan(0);
      expect(v.tier).toBeGreaterThanOrEqual(1);
      expect(v.tier).toBeLessThanOrEqual(4);
    }
  });

  it('within a tier, bigger deltaCp → not weaker intensity (monotonic), saturating at 1', () => {
    const lo = set({ deltaCp: 1 }).intensity01;
    const hi = set({ deltaCp: 100 }).intensity01;
    expect(hi).toBeGreaterThanOrEqual(lo);
    expect(hi).toBeLessThanOrEqual(1);
  });

  it('higher tiers are at least as intense as lower tiers (same delta)', () => {
    const t1 = set({ rir: 5, hitTargetReps: false, deltaCp: 6 }).intensity01;
    const t2 = set({ rir: 2, hitTargetReps: true, deltaCp: 6 }).intensity01;
    const t3 = set({ isPr: true, deltaCp: 6 }).intensity01;
    expect(t2).toBeGreaterThanOrEqual(t1);
    expect(t3).toBeGreaterThanOrEqual(t2);
  });

  it('dismiss mode: T1–T2 auto, T3–T4 tap', () => {
    expect(set({ rir: 5, hitTargetReps: false }).dismiss).toBe('auto');
    expect(set({ rir: 2, hitTargetReps: true }).dismiss).toBe('auto');
    expect(set({ isPr: true }).dismiss).toBe('tap');
    expect(classifyEvent({ kind: 'session', deltaCp: 1 }).dismiss).toBe('tap');
  });
});
