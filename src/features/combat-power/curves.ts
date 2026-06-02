// Pure math curves for the Combat Power formula. No deps, fully unit-testable.

export const clamp = (x: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, x));

export const clamp01 = (x: number): number => clamp(x, 0, 1);

/**
 * Saturating curve. 0 at x<=0, approaches 1 as x→∞, never hard-caps.
 * `k` is the value at which output ≈ 0.632 (1 - 1/e). Gives a "chase forever" feel:
 * early reps move the needle a lot, later reps less — but there is always more.
 */
export const sat = (x: number, k: number): number =>
  x <= 0 || k <= 0 ? 0 : 1 - Math.exp(-x / k);

/** Linear ramp from 0 to 1 over [0, cap], then flat at 1. */
export const ramp = (x: number, cap: number): number =>
  cap <= 0 ? 0 : clamp01(x / cap);
