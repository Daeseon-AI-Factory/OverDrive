import * as Haptics from 'expo-haptics';
import type { Tier } from './juice.types';

/**
 * Tier-graded haptic. Fire-and-forget: never awaited on the logging path, never throws
 * (haptics may be unavailable on some devices / simulators).
 */
export async function fireHaptic(tier: Tier): Promise<void> {
  try {
    if (tier >= 4) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (tier === 3) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else if (tier === 2) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch {
    // swallow — JUICE must never break logging
  }
}
