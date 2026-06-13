import type { ExerciseType } from '@/db/types';

export interface WorkoutProgressExercise {
  id: string;
  type: ExerciseType;
  default_sets: number;
}

export function mergeWorkoutCounts(
  exercises: WorkoutProgressExercise[],
  strengthCounts: Record<string, number>,
  cardioCounts: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    exercises.map((exercise) => [
      exercise.id,
      exercise.type === 'cardio' ? (cardioCounts[exercise.id] ?? 0) : (strengthCounts[exercise.id] ?? 0),
    ]),
  );
}

export function firstIncompleteWorkoutIndex(
  exercises: WorkoutProgressExercise[],
  counts: Record<string, number>,
): number {
  if (exercises.length === 0) return 0;
  const index = exercises.findIndex((exercise) => (counts[exercise.id] ?? 0) < exercise.default_sets);
  return index === -1 ? exercises.length - 1 : index;
}
