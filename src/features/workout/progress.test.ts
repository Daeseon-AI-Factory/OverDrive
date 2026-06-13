import { firstIncompleteWorkoutIndex, mergeWorkoutCounts, type WorkoutProgressExercise } from './progress';

const exercises: WorkoutProgressExercise[] = [
  { id: 'bench', type: 'strength', default_sets: 3 },
  { id: 'row', type: 'strength', default_sets: 3 },
  { id: 'zone2', type: 'cardio', default_sets: 1 },
];

describe('workout progress helpers', () => {
  it('merges strength and cardio counts by exercise type', () => {
    expect(mergeWorkoutCounts(exercises, { bench: 2, row: 3, zone2: 99 }, { zone2: 1 })).toEqual({
      bench: 2,
      row: 3,
      zone2: 1,
    });
  });

  it('points at the first incomplete exercise', () => {
    const counts = { bench: 3, row: 1, zone2: 0 };

    expect(firstIncompleteWorkoutIndex(exercises, counts)).toBe(1);
  });

  it('stays on the last exercise when the workout is complete', () => {
    const counts = { bench: 3, row: 3, zone2: 1 };

    expect(firstIncompleteWorkoutIndex(exercises, counts)).toBe(2);
  });
});
