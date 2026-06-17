// JUICE engine tuning dials (spec §6.4). Feel knobs — tune after dogfooding.
// All callouts/assets are OVERDRIVE-original (spec §9 — no borrowed IP).

export const ANTI_SHAME_FLOOR = 0.4; // weakest logged set still pops at least this hard (cranked up — every set should feel good)
export const SOLID_DELTA_REF = 12; // a "solid" set's reference Combat-Power delta (intensity scaling)

export const RIR_SOLID_MIN = 1; // a solid set lands RIR 1–3 (effective, not junk volume)
export const RIR_SOLID_MAX = 3;
export const HARD_SET_RIR = 0; // RIR 0 = failure-adjacent → OVERDRIVE (T3)

// Per-tier base visual intensity (0..1 → uIntensity shader uniform). Cranked for punch: even T1/T2
// (every set) hit hard. T1 base == ANTI_SHAME_FLOOR by design.
export const TIER_BASE_INTENSITY = { 1: 0.4, 2: 0.7, 3: 0.95, 4: 1 } as const;
// Per-tier animation length (ms). §6 철칙: T1–T2 stay ≤0.6s + non-blocking (logging speed > flash);
// only T3 (OVERDRIVE) / T4 (supernova) go big, and those are tap-to-skip.
export const TIER_DURATION_MS = { 1: 480, 2: 600, 3: 1500, 4: 2200 } as const;
// How much the magnitude (deltaCp) can add on top of the tier base.
export const INTENSITY_MAGNITUDE_GAIN = 0.25;

// Original callouts (T4). NO trademarked phrases.
export const ORIGINAL_CALLOUTS = ['OVERDRIVE!', 'REDLINE!', 'MAX POWER!'] as const;
