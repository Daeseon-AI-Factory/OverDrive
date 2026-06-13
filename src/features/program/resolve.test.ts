import { defaultDayConfig, defaultWeeklyProgram, slotFromExerciseId } from './defaultProgram';
import { dayDisplayName, resolveProgramDay, slotTargetsById } from './resolve';
import type { ProgramDayConfig, WeeklyProgram } from './types';

const T = (key: string) => `t:${key}`; // identity-ish translate for assertions

describe('slotFromExerciseId', () => {
  it('seeds targets from the exercise catalog', () => {
    expect(slotFromExerciseId('barbell_bench_press')).toEqual({ exerciseId: 'barbell_bench_press', targetSets: 3, repLow: 5, repHigh: 8 });
  });

  it('falls back to generic targets for an unknown exercise', () => {
    expect(slotFromExerciseId('nonexistent_lift')).toEqual({ exerciseId: 'nonexistent_lift', targetSets: 3, repLow: 8, repHigh: 12 });
  });
});

describe('defaultWeeklyProgram', () => {
  const program = defaultWeeklyProgram();

  it('covers all 7 weekdays', () => {
    expect(Object.keys(program).map(Number).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('has an empty rest day (Sunday) and non-empty training days', () => {
    expect(program[0]!.dayType).toBe('rest');
    expect(program[0]!.slots).toHaveLength(0);
    expect(program[1]!.slots.length).toBeGreaterThan(0);
  });

  it('carries the cardio modality on a cardio day', () => {
    expect(program[3]!.dayType).toBe('cardio');
    expect(program[3]!.slots.map((s) => s.exerciseId)).toContain('hiit_intervals');
  });
});

describe('resolveProgramDay', () => {
  it('returns the built-in default when there is no custom program', () => {
    expect(resolveProgramDay(null, 1)).toEqual(defaultDayConfig(1));
  });

  it('returns the custom day when present', () => {
    const custom: WeeklyProgram = {
      1: { dayType: 'upper', label: 'Push', slots: [{ exerciseId: 'barbell_bench_press', targetSets: 4, repLow: 6, repHigh: 10 }] },
    };
    expect(resolveProgramDay(custom, 1)).toBe(custom[1]);
  });

  it('falls back to the default for a weekday missing from the custom program', () => {
    const custom: WeeklyProgram = { 1: { dayType: 'upper', label: null, slots: [] } };
    expect(resolveProgramDay(custom, 2)).toEqual(defaultDayConfig(2));
  });
});

describe('dayDisplayName', () => {
  const base = (over: Partial<ProgramDayConfig>): ProgramDayConfig => ({ dayType: 'upper', label: null, slots: [], ...over });

  it('prefers a user free-text label', () => {
    expect(dayDisplayName(base({ label: 'My Push Day', labelKey: 'program.template.ppl.push' }), T)).toBe('My Push Day');
  });

  it('falls back to the localized labelKey when there is no literal label', () => {
    expect(dayDisplayName(base({ label: null, labelKey: 'program.template.ppl.push' }), T)).toBe('t:program.template.ppl.push');
  });

  it('falls back to the day-type name when neither label nor labelKey is set', () => {
    expect(dayDisplayName(base({ dayType: 'lower', label: null }), T)).toBe('t:program.dayType.lower');
  });

  it('treats a blank/whitespace label as unset', () => {
    expect(dayDisplayName(base({ label: '   ', labelKey: 'program.template.ppl.legs' }), T)).toBe('t:program.template.ppl.legs');
  });

  it('built-in default days carry a labelKey (so a materialized default still localizes)', () => {
    expect(defaultDayConfig(1).labelKey).toBe('program.upperA.title');
  });
});

describe('slotTargetsById', () => {
  it('indexes slots by exercise id', () => {
    const day = { dayType: 'upper' as const, label: null, slots: [
      { exerciseId: 'barbell_bench_press', targetSets: 4, repLow: 6, repHigh: 10 },
      { exerciseId: 'pull_up', targetSets: 3, repLow: 5, repHigh: 12 },
    ] };
    const map = slotTargetsById(day);
    expect(map.barbell_bench_press!.targetSets).toBe(4);
    expect(map.pull_up!.repHigh).toBe(12);
    expect(map.nonexistent).toBeUndefined();
  });
});
