import type { ExerciseRow } from '@/db/types';
import { exerciseFixture } from './testFixture';
import { catalogAllowsExternalLoad, supportsCurrentLogger } from './loggingSupport';

const row = (id: string): ExerciseRow => ({
  id,
  name: id,
  muscle_group: 'core',
  type: 'strength',
  default_sets: 3,
  rep_low: 0,
  rep_high: 0,
  is_bodyweight: 1,
  created_at: '2026-07-14T00:00:00.000Z',
});

describe('catalog logger compatibility', () => {
  it('blocks new non-reps strength rows from the reps/weight logger', () => {
    const catalog = {
      ...exerciseFixture('side_plank', 33),
      defaultPrescription: {
        sets: 3,
        trackingMode: 'duration' as const,
        countingConvention: 'total' as const,
        target: { unit: 'seconds' as const, low: 20, high: 60 },
      },
    };
    expect(supportsCurrentLogger(row('catalog_00000000000040008000000000000001'), catalog)).toBe(false);
  });

  it('allows new reps strength and cardio but blocks frozen duration metadata too', () => {
    expect(supportsCurrentLogger(row('catalog_00000000000040008000000000000001'), exerciseFixture('new_press', 33))).toBe(true);
    const cardio = exerciseFixture('ski_erg', 33, 'cardio');
    expect(supportsCurrentLogger({ ...row('catalog_00000000000040008000000000000002'), type: 'cardio' }, cardio)).toBe(true);
    const frozen = {
      ...exerciseFixture('plank', 18),
      defaultPrescription: {
        sets: 3,
        trackingMode: 'duration' as const,
        countingConvention: 'total' as const,
        target: { unit: 'seconds' as const, low: 30, high: 60 },
      },
    };
    expect(supportsCurrentLogger(row('plank'), frozen)).toBe(false);
  });

  it('fails closed for a frozen duration row when catalog metadata is unavailable', () => {
    expect(supportsCurrentLogger(row('plank'), null)).toBe(false);
    expect(supportsCurrentLogger(row('barbell_bench_press'), null)).toBe(true);
    expect(supportsCurrentLogger({ ...row('zone2_run'), type: 'cardio' }, null)).toBe(true);
  });

  it('opens kg logging only for optional equipment with a measurable mass', () => {
    const base = exerciseFixture('glute_bridge', 54);
    expect(catalogAllowsExternalLoad({
      ...base,
      isBodyweight: true,
      equipment: { required: ['bodyweight_space'], optional: ['weight_plate'] },
    })).toBe(true);
    expect(catalogAllowsExternalLoad({
      ...base,
      isBodyweight: true,
      equipment: { required: ['bodyweight_space'], optional: ['resistance_band'] },
    })).toBe(false);
    expect(catalogAllowsExternalLoad({
      ...base,
      isBodyweight: true,
      equipment: { required: ['bodyweight_space'], optional: ['external_resistance'] },
    })).toBe(false);
  });
});
