import type { ExerciseRow } from '@/db/types';

export const TRAINING_REGIONS = [
  'chest',
  'shoulders',
  'back',
  'biceps',
  'triceps',
  'core',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
] as const;

export type TrainingRegion = (typeof TRAINING_REGIONS)[number];
export type RegionRecommendationReason = 'today' | 'recent' | 'catalog';

/**
 * A muscle group can intentionally feed more than one tappable region. The current catalog's
 * `posterior_chain` bucket, for example, cannot distinguish glute-dominant from hamstring-dominant
 * lifts. Unknown groups stay unassigned instead of leaking an exercise into an unrelated region.
 */
export const MUSCLE_GROUP_TO_REGIONS: Readonly<Record<string, readonly TrainingRegion[]>> = {
  chest: ['chest'],
  pectorals: ['chest'],
  pecs: ['chest'],
  shoulder: ['shoulders'],
  shoulders: ['shoulders'],
  delts: ['shoulders'],
  back: ['back'],
  lats: ['back'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  arms: ['biceps', 'triceps'],
  core: ['core'],
  abs: ['core'],
  abdominals: ['core'],
  glute: ['glutes'],
  glutes: ['glutes'],
  posterior_chain: ['glutes', 'hamstrings'],
  quad: ['quads'],
  quads: ['quads'],
  quadriceps: ['quads'],
  hamstring: ['hamstrings'],
  hamstrings: ['hamstrings'],
  calf: ['calves'],
  calves: ['calves'],
  legs: ['glutes', 'quads', 'hamstrings', 'calves'],
  conditioning: [],
  other: [],
};

export interface RecentSetReference {
  exerciseId: string;
  weight?: number;
  reps?: number;
  rir?: number | null;
}

export interface RegionRecommendation {
  exercise: ExerciseRow;
  reason: RegionRecommendationReason;
}

export interface RegionRecommendationInput {
  catalog: readonly ExerciseRow[];
  region: TrainingRegion;
  /** Most recent first. Additional set fields are allowed and ignored by this pure ranker. */
  recentSets: readonly RecentSetReference[];
  /** Today's program order. */
  programExerciseIds?: readonly string[];
}

function normalizeMuscleGroup(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s-]+/g, '_');
}

export function regionsForMuscleGroup(muscleGroup: string): readonly TrainingRegion[] {
  return MUSCLE_GROUP_TO_REGIONS[normalizeMuscleGroup(muscleGroup)] ?? [];
}

function compareExerciseName(a: ExerciseRow, b: ExerciseRow): number {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

/**
 * Ranks the selected region without a seed-ID allowlist, so DB/user-created exercises participate
 * as soon as they carry a supported muscle_group. Each exercise appears once at its best reason:
 * today's program, then recent history, then the remaining alphabetical catalog.
 */
export function rankRegionRecommendations({
  catalog,
  region,
  recentSets,
  programExerciseIds = [],
}: RegionRecommendationInput): RegionRecommendation[] {
  const catalogById = new Map<string, ExerciseRow>();
  for (const exercise of catalog) {
    if (
      !catalogById.has(exercise.id) &&
      regionsForMuscleGroup(exercise.muscle_group).includes(region)
    ) {
      catalogById.set(exercise.id, exercise);
    }
  }

  const ranked: RegionRecommendation[] = [];
  const emitted = new Set<string>();

  const append = (exerciseId: string, reason: RegionRecommendationReason) => {
    if (emitted.has(exerciseId)) return;
    const exercise = catalogById.get(exerciseId);
    if (!exercise) return;
    emitted.add(exerciseId);
    ranked.push({ exercise, reason });
  };

  for (const exerciseId of programExerciseIds) append(exerciseId, 'today');
  for (const set of recentSets) append(set.exerciseId, 'recent');

  const remaining = [...catalogById.values()]
    .filter((exercise) => !emitted.has(exercise.id))
    .sort(compareExerciseName);
  for (const exercise of remaining) append(exercise.id, 'catalog');

  return ranked;
}
