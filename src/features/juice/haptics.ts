import * as Haptics from 'expo-haptics';
import type { Tier } from './juice.types';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Tier-graded haptic, cranked for punch. Fire-and-forget: never awaited on the logging path, never
 * throws (haptics may be unavailable on some devices / simulators). Higher tiers fire a multi-pulse
 * "boom" pattern — the inter-pulse sleeps run off the logging path (caller does `void fireHaptic`).
 */
export async function fireHaptic(tier: Tier): Promise<void> {
  try {
    if (tier >= 4) {
      // Supernova: triple boom → success ring.
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await sleep(90);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await sleep(90);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (tier === 3) {
      // OVERDRIVE: double heavy thump.
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await sleep(80);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else if (tier === 2) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  } catch {
    // swallow — JUICE must never break logging
  }
}
