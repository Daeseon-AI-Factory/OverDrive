// ORIGINAL exercise pose-art — movement-family classification.
//
// Every seeded exercise id (src/db/seed.ts EXERCISE_SEED) maps to exactly ONE of 12 movement
// families. Each family owns a hand-authored 2-keyframe stick-figure animation (poses.ts)
// rendered by <ExercisePose/>. Original IP only (spec §5): the skeleton data is our own — no
// traced assets, no franchise references.

export type Family =
  | 'pressHorizontal' // bench / push-up / chest dips — press away from the chest
  | 'pressVertical' // overhead / shoulder press — press overhead
  | 'squat' // squat / lunge / leg press — knee-dominant lower
  | 'hinge' // deadlift / RDL / hip thrust — hip-dominant posterior chain
  | 'rowHorizontal' // rows / face pull — pull toward the torso
  | 'pullVertical' // pull-up / pulldown — pull from overhead
  | 'curl' // biceps curls — elbow flexion
  | 'extensionTriceps' // pushdown / skullcrusher — elbow extension
  | 'raiseLateral' // lateral/front raises — straight-arm abduction
  | 'fly' // flyes / crossovers — horizontal adduction arc
  | 'core' // plank / crunch / leg raise — trunk work
  | 'cardio'; // run / bike / row-erg / rope — conditioning

export const FAMILIES: readonly Family[] = [
  'pressHorizontal',
  'pressVertical',
  'squat',
  'hinge',
  'rowHorizontal',
  'pullVertical',
  'curl',
  'extensionTriceps',
  'raiseLateral',
  'fly',
  'core',
  'cardio',
];

// Explicit map for every seeded exercise id. The unit test (exercise-art.test.ts) imports
// EXERCISE_SEED and fails the build if a seeded id is missing here — add new seeds to this map.
export const EXERCISE_FAMILY: Record<string, Family> = {
  // Upper push/pull
  barbell_bench_press: 'pressHorizontal',
  incline_db_press: 'pressHorizontal',
  overhead_press: 'pressVertical',
  lateral_raise: 'raiseLateral',
  pull_up: 'pullVertical',
  barbell_row: 'rowHorizontal',
  lat_pulldown: 'pullVertical',
  db_curl: 'curl',
  triceps_pushdown: 'extensionTriceps',
  // Lower
  barbell_back_squat: 'squat',
  deadlift: 'hinge',
  romanian_deadlift: 'hinge',
  leg_press: 'squat', // knee-dominant press → squat silhouette reads correctly
  leg_curl: 'hinge', // hamstring work → posterior-chain family (no dedicated knee-flexion family)
  bulgarian_split_squat: 'squat',
  standing_calf_raise: 'squat', // standing lower-body — closest readable silhouette
  // Core
  hanging_leg_raise: 'core',
  plank: 'core',
  // Region round-out
  cable_fly: 'fly',
  dips: 'pressHorizontal', // chest-lean dips per family spec
  face_pull: 'rowHorizontal', // horizontal pull toward the face
  hammer_curl: 'curl',
  hip_thrust: 'hinge',
  cable_crunch: 'core',
  // Conditioning
  outdoor_run: 'cardio',
  treadmill_run: 'cardio',
  zone2_run: 'cardio',
  hiit_intervals: 'cardio',
  cycling: 'cardio',
  rowing: 'cardio',
  jump_rope: 'cardio',
  incline_walk: 'cardio',
};

// Keyword fallback for ids that are not (yet) in the explicit map — Phase 2 adds LLM fuzzy-matched
// / user-created exercises whose slugs follow the same naming style. ORDER MATTERS: earlier rules
// win (e.g. `leg_raise` must hit core before the generic `raise` rule; `rowing` must hit cardio
// before the `row` rule).
const FALLBACK_RULES: readonly (readonly [RegExp, Family])[] = [
  [/run|jog|walk|sprint|treadmill|rowing|erg|cycl|bike|spin|rope|swim|stair|elliptical|hiit|cardio|condition/, 'cardio'],
  [/plank|crunch|sit_?up|_?abs?_|leg_raise|knee_raise|hollow|dead_?bug|rollout|l_?sit|core/, 'core'],
  [/leg_curl|nordic|ham(string)?_curl/, 'hinge'],
  [/deadlift|rdl|hinge|thrust|swing|good_?morning|back_?ext|glute|bridge|pull_?through/, 'hinge'],
  [/pull_?up|chin_?up|pull_?down/, 'pullVertical'],
  [/row|face_?pull|rear_?delt/, 'rowHorizontal'],
  [/fly|flye|pec_?deck|crossover/, 'fly'],
  [/squat|lunge|leg_press|leg_ext|step_?up|calf|hack/, 'squat'],
  [/push_?down|triceps|skull|kickback/, 'extensionTriceps'],
  [/curl/, 'curl'],
  [/raise|shrug/, 'raiseLateral'],
  [/overhead|shoulder_press|military|ohp|arnold|push_?press/, 'pressVertical'],
  [/bench|push_?up|dip|chest|press/, 'pressHorizontal'],
];

// Last-resort default: the squat silhouette is the most universally readable "exercise" pose.
const DEFAULT_FAMILY: Family = 'squat';

/** Movement family for an exercise id — explicit seed map → keyword heuristic → squat fallback. */
export function exerciseFamily(exerciseId: string): Family {
  const known = EXERCISE_FAMILY[exerciseId];
  if (known) return known;
  const slug = exerciseId.toLowerCase();
  for (const [re, family] of FALLBACK_RULES) {
    if (re.test(slug)) return family;
  }
  return DEFAULT_FAMILY;
}
