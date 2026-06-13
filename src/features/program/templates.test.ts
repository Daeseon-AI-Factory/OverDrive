import { EXERCISE_SEED } from '@/db/seed';
import type { DayType } from '@/db/types';
import { SPLIT_TEMPLATES, templateByKey } from './templates';

const TYPE_BY_ID = new Map(EXERCISE_SEED.map((e) => [e.id, e.type]));
const VALID_DAY_TYPES: DayType[] = ['upper', 'lower', 'cardio', 'rest'];

describe('split templates', () => {
  it.each(SPLIT_TEMPLATES.map((t) => [t.key, t] as const))('%s builds a valid 7-day program', (_key, template) => {
    const program = template.build();

    // All 7 weekdays present.
    expect(Object.keys(program).map(Number).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);

    for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
      const day = program[weekday]!;
      expect(VALID_DAY_TYPES).toContain(day.dayType);

      if (day.dayType === 'rest') {
        expect(day.slots).toHaveLength(0);
        continue;
      }

      expect(day.slots.length).toBeGreaterThan(0);
      for (const slot of day.slots) {
        // Every programmed exercise exists in the catalog.
        expect(TYPE_BY_ID.has(slot.exerciseId)).toBe(true);
        // Strength days hold strength lifts; cardio days hold cardio modalities.
        const expectedType = day.dayType === 'cardio' ? 'cardio' : 'strength';
        expect(TYPE_BY_ID.get(slot.exerciseId)).toBe(expectedType);
        // Sane targets.
        expect(slot.targetSets).toBeGreaterThanOrEqual(1);
        expect(slot.repLow).toBeLessThanOrEqual(slot.repHigh);
      }
    }
  });

  it('resolves a template by key (and returns undefined for unknown)', () => {
    expect(templateByKey('ppl')?.key).toBe('ppl');
    expect(templateByKey('does_not_exist')).toBeUndefined();
  });
});
