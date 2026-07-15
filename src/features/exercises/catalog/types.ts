import type { ExerciseRow } from '@/db/types';

export const CATALOG_SCHEMA_VERSION = '1.0.0' as const;
export const CATALOG_SEARCH_NORMALIZATION = 'search-v1' as const;
export const CATALOG_LOCALES = ['en', 'ko', 'es', 'zh-Hans'] as const;
export type CatalogLocale = (typeof CATALOG_LOCALES)[number];

export const CATALOG_BODY_REGIONS = [
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
export type CatalogBodyRegion = (typeof CATALOG_BODY_REGIONS)[number];

export const CATALOG_EQUIPMENT = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'hex_bar',
  'angled_curl_bar',
  'bench',
  'rear_foot_support',
  'upper_back_support',
  'external_resistance',
  'rack',
  'pull_up_bar',
  'dip_bars',
  'cable_machine',
  'lat_pulldown_machine',
  'leg_press_machine',
  'leg_curl_station',
  'leg_extension_machine',
  'sled_squat_machine',
  'chest_press_machine',
  'shoulder_press_machine',
  'chest_fly_machine',
  'dual_fly_machine',
  'calf_raise_machine',
  'step_platform',
  'treadmill',
  'elliptical_machine',
  'stair_climber',
  'bicycle',
  'rowing_machine',
  'pool',
  'jump_rope',
  'mat',
  'weight_plate',
  'resistance_band',
  'bodyweight_space',
  'other',
] as const;
export type CatalogEquipmentId = (typeof CATALOG_EQUIPMENT)[number];

export const CATALOG_MOVEMENT_PATTERNS = [
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'squat',
  'hinge',
  'lunge',
  'hip_extension',
  'hip_flexion',
  'knee_flexion',
  'knee_extension',
  'ankle_plantar_flexion',
  'elbow_flexion',
  'elbow_extension',
  'shoulder_abduction',
  'shoulder_horizontal_adduction',
  'shoulder_external_rotation',
  'trunk_flexion',
  'trunk_anti_extension',
  'trunk_rotation',
  'trunk_anti_rotation',
  'trunk_anti_lateral_flexion',
  'loaded_carry',
  'locomotion_run',
  'locomotion_walk',
  'locomotion_swim',
  'step',
  'cycle',
  'row_erg',
  'jump',
  'interval_mixed',
  'other',
] as const;
export type CatalogMovementPattern = (typeof CATALOG_MOVEMENT_PATTERNS)[number];

export type CatalogExerciseStatus = 'active' | 'deprecated' | 'retired';
export type CatalogExerciseType = 'strength' | 'cardio';
export type CatalogDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type CatalogTrackingMode = 'reps' | 'duration' | 'distance' | 'duration_distance' | 'intervals';
export type CatalogTargetUnit = 'reps' | 'seconds' | 'minutes' | 'meters' | 'kilometers' | 'rounds';
export type CatalogCountingConvention = 'total' | 'per_side' | 'not_applicable';

export interface CatalogLocalization {
  displayName: string;
  aliases: string[];
}

export interface CatalogTarget {
  unit: CatalogTargetUnit;
  low: number;
  high: number;
}

export interface CatalogSource {
  sourceType: 'internal_editorial' | 'official_guideline' | 'peer_reviewed' | 'public_domain' | 'licensed_dataset';
  label: string;
  url: string | null;
  license: string | null;
  accessedAt: string | null;
}

export interface CatalogProvenance {
  classification: 'original_editorial' | 'public_facts' | 'licensed';
  reviewStatus: 'unreviewed' | 'source_checked' | 'human_reviewed';
  reviewMethod: 'none' | 'source_comparison' | 'human_editorial_review';
  reviewedByRole: string | null;
  reviewEvidence: string | null;
  reviewedAt: string | null;
  containsThirdPartyCopy: false;
  sources: CatalogSource[];
}

export interface CatalogExercise {
  id: string;
  recordRevision: number;
  status: CatalogExerciseStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  replacementId: string | null;
  displayOrder: number;
  localizations: Record<CatalogLocale, CatalogLocalization>;
  exerciseType: CatalogExerciseType;
  isBodyweight: boolean;
  equipment: { required: CatalogEquipmentId[]; optional: CatalogEquipmentId[] };
  movementPattern: CatalogMovementPattern;
  difficulty: CatalogDifficulty;
  primaryBodyRegions: CatalogBodyRegion[];
  secondaryBodyRegions: CatalogBodyRegion[];
  defaultPrescription: {
    sets: number;
    trackingMode: CatalogTrackingMode;
    countingConvention: CatalogCountingConvention;
    target: CatalogTarget | null;
  };
  provenance: CatalogProvenance;
}

export interface CatalogSnapshot {
  schemaVersion: typeof CATALOG_SCHEMA_VERSION;
  catalogVersion: string;
  effectiveAt: string;
  defaultLocale: 'en';
  supportedLocales: [...typeof CATALOG_LOCALES];
  searchNormalization: typeof CATALOG_SEARCH_NORMALIZATION;
  exercises: CatalogExercise[];
}

export interface ValidatedCatalogSnapshot {
  snapshot: CatalogSnapshot;
  rawBytes: Uint8Array;
  checksumHex: string;
}

export interface CatalogExerciseView {
  exercise: ExerciseRow;
  catalog: CatalogExercise | null;
}

export interface CatalogExerciseSelection extends CatalogExerciseView {
  localizedName: string;
}

export function appLocaleToCatalogLocale(locale: string): CatalogLocale {
  if (locale.startsWith('ko')) return 'ko';
  if (locale.startsWith('es')) return 'es';
  if (locale.startsWith('zh')) return 'zh-Hans';
  return 'en';
}
