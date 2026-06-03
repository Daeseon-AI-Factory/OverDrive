import { colors } from '@/ui/theme/tokens';

// Coarse, gym-intuitive body regions for the body-map picker (spec: "너무 세부적으로 나누지 마라").
// region is a UI-layer concept; exerciseIds are explicit (PRIMARY mover) so one tap → one list.

export type BodyRegionId = 'chest' | 'shoulders' | 'back' | 'arms' | 'core' | 'legs';
export type RegionSide = 'front' | 'back' | 'both';
export type BodyView = 'front' | 'back';

export interface RegionDef {
  labelKo: string;
  side: RegionSide;
  exerciseIds: string[];
  color: string;
}

export const REGIONS: Record<BodyRegionId, RegionDef> = {
  chest: {
    labelKo: '가슴',
    side: 'front',
    color: colors.magenta,
    exerciseIds: ['barbell_bench_press', 'incline_db_press', 'cable_fly', 'dips'],
  },
  shoulders: {
    labelKo: '어깨',
    side: 'both',
    color: colors.cyan,
    exerciseIds: ['overhead_press', 'lateral_raise', 'face_pull'],
  },
  back: {
    labelKo: '등',
    side: 'back',
    color: colors.magenta,
    exerciseIds: ['pull_up', 'barbell_row', 'lat_pulldown'],
  },
  arms: {
    labelKo: '팔',
    side: 'both',
    color: colors.violet,
    exerciseIds: ['db_curl', 'triceps_pushdown', 'hammer_curl'],
  },
  core: {
    labelKo: '코어',
    side: 'front',
    color: colors.energyLo,
    exerciseIds: ['hanging_leg_raise', 'plank', 'cable_crunch'],
  },
  legs: {
    labelKo: '하체',
    side: 'both',
    color: colors.cyan,
    exerciseIds: [
      'barbell_back_squat',
      'leg_press',
      'bulgarian_split_squat',
      'deadlift',
      'romanian_deadlift',
      'leg_curl',
      'standing_calf_raise',
      'hip_thrust',
    ],
  },
};

// Cardio has no body part to touch → separate chip, not a region on the figure. Logged by
// duration/distance (cardio_log), not sets×reps.
export const CARDIO_EXERCISE_IDS = [
  'outdoor_run',
  'treadmill_run',
  'zone2_run',
  'hiit_intervals',
  'cycling',
  'rowing',
  'jump_rope',
  'incline_walk',
] as const;

// Reverse map exercise id → body region (for the weekly per-region training summary).
// Cardio ids are intentionally absent (they're summarized separately).
export const EXERCISE_TO_REGION: Record<string, BodyRegionId> = Object.fromEntries(
  (Object.entries(REGIONS) as [BodyRegionId, RegionDef][]).flatMap(([rid, def]) =>
    def.exerciseIds.map((id) => [id, rid] as const),
  ),
);

export const VIEW_REGIONS: Record<BodyView, BodyRegionId[]> = {
  front: ['chest', 'shoulders', 'arms', 'core', 'legs'],
  back: ['back', 'shoulders', 'arms', 'legs'],
};

// ---- Humanoid layout (percent of an aspect-locked stage) ----
// A tall figure; positions are % so it scales to any screen. Paired regions (arms/legs) have
// L/R halves that both call the same region. Module-scope constants (React Compiler stability).

export const STAGE_ASPECT = 0.46; // width / height

export interface RegionRect {
  id: string; // unique per tappable block (for React keys)
  region: BodyRegionId;
  left: number;
  top: number;
  width: number;
  height: number;
  rotateDeg?: number;
}

export const FRONT_RECTS: RegionRect[] = [
  { id: 'shoulders', region: 'shoulders', left: 22, top: 14, width: 56, height: 9 },
  { id: 'chest', region: 'chest', left: 30, top: 21, width: 40, height: 14 },
  { id: 'arms-l', region: 'arms', left: 14, top: 20, width: 12, height: 30, rotateDeg: -8 },
  { id: 'arms-r', region: 'arms', left: 74, top: 20, width: 12, height: 30, rotateDeg: 8 },
  { id: 'core', region: 'core', left: 32, top: 35, width: 36, height: 16 },
  { id: 'legs-l', region: 'legs', left: 31, top: 57, width: 17, height: 38 },
  { id: 'legs-r', region: 'legs', left: 52, top: 57, width: 17, height: 38 },
];

export const BACK_RECTS: RegionRect[] = [
  { id: 'shoulders', region: 'shoulders', left: 22, top: 14, width: 56, height: 9 },
  { id: 'back', region: 'back', left: 28, top: 21, width: 44, height: 32 },
  { id: 'arms-l', region: 'arms', left: 14, top: 20, width: 12, height: 30, rotateDeg: -8 },
  { id: 'arms-r', region: 'arms', left: 74, top: 20, width: 12, height: 30, rotateDeg: 8 },
  { id: 'legs-l', region: 'legs', left: 31, top: 57, width: 17, height: 38 },
  { id: 'legs-r', region: 'legs', left: 52, top: 57, width: 17, height: 38 },
];

// Non-interactive decoration (head, hips) drawn behind the Pressable blocks.
export interface DecorRect {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
}
export const DECOR_RECTS: DecorRect[] = [
  { id: 'head', left: 41, top: 2, width: 18, height: 11, radius: 999 },
  { id: 'hips', left: 30, top: 51, width: 40, height: 7, radius: 14 },
];

export function rectsForView(view: BodyView): RegionRect[] {
  return view === 'front' ? FRONT_RECTS : BACK_RECTS;
}

/** number → RN percentage DimensionValue (e.g. 42 → "42%"). */
export const pct = (n: number) => `${n}%` as `${number}%`;
