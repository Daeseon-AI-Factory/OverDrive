import { colors } from '../../ui/theme/tokens';
import { ORIGINAL_CALLOUTS } from './constants';
import type { Tier } from './juice.types';

// Per-tier visual flavor. SkSL shader work will read uIntensity/uHue from here later; for the
// Reanimated v0 these drive the flash color + callout.
export const TIER_COLOR: Record<Tier, string> = {
  1: colors.cyan,
  2: colors.magenta,
  3: colors.energyHi,
  4: colors.flash,
};

export const TIER_LABEL: Record<Tier, string> = {
  1: '',
  2: '',
  3: 'OVERDRIVE',
  4: '',
};

/** Rotating original callout for T4 (no trademarked phrases). */
export function calloutAt(index: number): string {
  const i = ((index % ORIGINAL_CALLOUTS.length) + ORIGINAL_CALLOUTS.length) % ORIGINAL_CALLOUTS.length;
  return ORIGINAL_CALLOUTS[i] ?? ORIGINAL_CALLOUTS[0];
}
