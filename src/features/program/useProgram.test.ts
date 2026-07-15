import type { ProgramSlot } from './types';
import { currentLoggerSlots } from './useProgram';

const slot = (exerciseId: string): ProgramSlot => ({
  exerciseId,
  targetSets: 3,
  repLow: 8,
  repHigh: 12,
});

describe('current program logger compatibility', () => {
  it('omits a persisted legacy duration slot while preserving reps/cardio order', () => {
    expect(currentLoggerSlots([
      slot('barbell_bench_press'),
      slot('plank'),
      slot('zone2_run'),
    ])).toEqual([
      slot('barbell_bench_press'),
      slot('zone2_run'),
    ]);
  });
});
