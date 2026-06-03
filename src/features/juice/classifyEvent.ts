import { clamp01 } from '../combat-power/curves';
import {
  ANTI_SHAME_FLOOR,
  HARD_SET_RIR,
  INTENSITY_MAGNITUDE_GAIN,
  RIR_SOLID_MAX,
  RIR_SOLID_MIN,
  SOLID_DELTA_REF,
  TIER_BASE_INTENSITY,
  TIER_DURATION_MS,
} from './constants';
import type { JuiceEvent, JuiceVerdict, PowerEventReason, Tier } from './juice.types';

function intensityFor(tier: Tier, deltaCp: number): number {
  const magnitude = clamp01(Math.abs(deltaCp) / SOLID_DELTA_REF);
  let intensity = clamp01(TIER_BASE_INTENSITY[tier] + INTENSITY_MAGNITUDE_GAIN * magnitude);
  // Anti-shame: even the weakest logged set gets a guaranteed minimum pop.
  if (tier === 1) intensity = Math.max(intensity, ANTI_SHAME_FLOOR);
  return intensity;
}

function verdict(tier: Tier, reason: PowerEventReason, deltaCp: number): JuiceVerdict {
  return {
    tier,
    reason,
    deltaCp,
    intensity01: intensityFor(tier, deltaCp),
    dismiss: tier >= 3 ? 'tap' : 'auto',
    durationMs: TIER_DURATION_MS[tier],
  };
}

/**
 * Pure, synchronous, <1ms tier classifier (spec §6.4). NEVER awaits, never throws, no I/O.
 * The render layer turns a JuiceVerdict into the actual Skia/Reanimated effect.
 *
 * Set tiers:
 *  - PR                        → T3 (OVERDRIVE), reason 'pr'
 *  - hard set (RIR 0), not PR  → T3 (OVERDRIVE), reason 'set'
 *  - solid set (target reps + RIR 1–3) → T2, reason 'set'
 *  - anything else logged      → T1, reason 'set'  (anti-shame: a logged set always pops)
 */
export function classifyEvent(e: JuiceEvent): JuiceVerdict {
  switch (e.kind) {
    case 'cardio': {
      // Longer / harder conditioning = bigger pop. RPE>=8 or 20min+ → T3.
      const hard = e.durationSec >= 1200 || (e.rpe !== null && e.rpe >= 8);
      return verdict(hard ? 3 : 2, 'set', e.deltaCp);
    }
    case 'session':
      return verdict(4, 'session', e.deltaCp);
    case 'levelup':
      return verdict(4, 'levelup', e.deltaCp);
    case 'streak':
      return verdict(e.isMilestone ? 4 : 2, 'streak', e.deltaCp);
    case 'set': {
      if (e.isPr) return verdict(3, 'pr', e.deltaCp);
      if (e.rir !== null && e.rir <= HARD_SET_RIR) return verdict(3, 'set', e.deltaCp);
      if (e.hitTargetReps && e.rir !== null && e.rir >= RIR_SOLID_MIN && e.rir <= RIR_SOLID_MAX) {
        return verdict(2, 'set', e.deltaCp);
      }
      return verdict(1, 'set', e.deltaCp);
    }
    default: {
      const _exhaustive: never = e;
      return _exhaustive;
    }
  }
}
