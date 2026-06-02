// JUICE engine tuning dials (spec §6.4). Feel knobs — tune after dogfooding.
// All callouts/assets are OVERDRIVE-original (spec §9 — no borrowed IP).

export const ANTI_SHAME_FLOOR = 0.18; // weakest logged set still pops at least this hard
export const SOLID_DELTA_REF = 12; // a "solid" set's reference Combat-Power delta (intensity scaling)

export const RIR_SOLID_MIN = 1; // a solid set lands RIR 1–3 (effective, not junk volume)
export const RIR_SOLID_MAX = 3;
export const HARD_SET_RIR = 0; // RIR 0 = failure-adjacent → OVERDRIVE (T3)

// Per-tier base visual intensity (0..1 → uIntensity shader uniform).
// T1 base == ANTI_SHAME_FLOOR by design: the weakest logged set's guaranteed minimum pop.
export const TIER_BASE_INTENSITY = { 1: 0.18, 2: 0.5, 3: 0.82, 4: 1 } as const;
// Per-tier animation length (ms). T1–T2 short & auto-dismiss; T3–T4 bigger, tap-to-skip.
export const TIER_DURATION_MS = { 1: 400, 2: 600, 3: 1200, 4: 1800 } as const;
// How much the magnitude (deltaCp) can add on top of the tier base.
export const INTENSITY_MAGNITUDE_GAIN = 0.18;

// Original callouts (T4). NO trademarked phrases.
export const ORIGINAL_CALLOUTS = ['OVERDRIVE!', 'REDLINE!', 'MAX POWER!'] as const;
