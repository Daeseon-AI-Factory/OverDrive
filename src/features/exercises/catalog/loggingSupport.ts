import type { ExerciseRow } from '@/db/types';
import type { CatalogExercise } from './types';

const EXTERNAL_LOAD_EQUIPMENT = new Set([
  'barbell',
  'dumbbell',
  'kettlebell',
  'hex_bar',
  'angled_curl_bar',
  'weight_plate',
]);

// Frozen rows predate the canonical tracking-mode metadata. Keep this small compatibility list
// until the matching duration logger ships: a catalog/cache failure must never reinterpret seconds
// as repetitions merely because the legacy ExerciseRow is still available offline.
const LEGACY_NON_REP_STRENGTH_IDS = new Set(['plank']);

export function supportsLegacyCurrentLogger(exerciseId: string): boolean {
  return !LEGACY_NON_REP_STRENGTH_IDS.has(exerciseId);
}

/**
 * The current strength logger writes reps/weight set_log rows. New duration/distance strength
 * records must stay discoverable but cannot be selected until a matching logger exists. Identity
 * compatibility never licenses writing duration as a fake rep count; cardio routes separately.
 */
export function supportsCurrentLogger(exercise: ExerciseRow, catalog: CatalogExercise | null): boolean {
  if (!catalog) return exercise.type === 'cardio' || supportsLegacyCurrentLogger(exercise.id);
  if (catalog.exerciseType === 'cardio') return true;
  return catalog.defaultPrescription.trackingMode === 'reps';
}

/** Bodyweight describes the movement, not whether optional added resistance may be recorded. */
export function catalogAllowsExternalLoad(catalog: CatalogExercise | null): boolean {
  return catalog?.equipment.optional.some((item) => EXTERNAL_LOAD_EQUIPMENT.has(item)) ?? false;
}
