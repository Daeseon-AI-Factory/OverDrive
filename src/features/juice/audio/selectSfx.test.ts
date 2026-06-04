import type { JuiceVerdict } from '../juice.types';
import { selectSfx } from './selectSfx';

const v = (over: Partial<JuiceVerdict>): JuiceVerdict => ({
  tier: 1,
  reason: 'set',
  deltaCp: 1,
  intensity01: 0.5,
  dismiss: 'auto',
  durationMs: 400,
  ...over,
});

describe('selectSfx', () => {
  it('honors an explicit sfx hint over reason/tier (cardio whoosh)', () => {
    expect(selectSfx(v({ sfx: 'cardio_whoosh', reason: 'set', tier: 3 }))).toBe('cardio_whoosh');
  });

  it('PR → triumphant sting', () => {
    expect(selectSfx(v({ reason: 'pr', tier: 3 }))).toBe('pr_sting');
  });

  it('session finish → supernova', () => {
    expect(selectSfx(v({ reason: 'session', tier: 4 }))).toBe('t4_supernova');
  });

  it('level up → sting', () => {
    expect(selectSfx(v({ reason: 'levelup', tier: 4 }))).toBe('pr_sting');
  });

  it('streak milestone (T4) → supernova, regular streak → punch', () => {
    expect(selectSfx(v({ reason: 'streak', tier: 4 }))).toBe('t4_supernova');
    expect(selectSfx(v({ reason: 'streak', tier: 2 }))).toBe('t2_punch');
  });

  it('plain set maps by tier', () => {
    expect(selectSfx(v({ reason: 'set', tier: 1 }))).toBe('t1_tick');
    expect(selectSfx(v({ reason: 'set', tier: 2 }))).toBe('t2_punch');
    expect(selectSfx(v({ reason: 'set', tier: 3 }))).toBe('t3_overdrive');
    expect(selectSfx(v({ reason: 'set', tier: 4 }))).toBe('t4_supernova');
  });
});
