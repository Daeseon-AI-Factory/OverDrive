// Rest countdown bar — DERIVED, purely visual (§6): the fill drains from the last save timestamp
// (anchorMs) to anchor+target on the UI thread. No stored timer, nothing to pause/resync — a
// remount recomputes the fraction from the same timestamps. It never gates anything; logging the
// next set simply moves the anchor (new withTiming from the new fraction).

import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSkinAccent } from '@/ui/primitives';
import { useSkinOrNull } from '@/ui/skins/SkinContext';
import { colors } from '@/ui/theme/tokens';

export function RestCountdownBar({
  anchorMs,
  targetSec,
  style,
}: {
  /** Epoch ms of the last save — the rest window runs [anchorMs, anchorMs + targetSec]. */
  anchorMs: number;
  targetSec: number;
  style?: StyleProp<ViewStyle>;
}) {
  const skin = useSkinOrNull();
  const accent = useSkinAccent();

  const progress = useSharedValue(0); // 0 → 1 over the rest window; fill width = 1 - progress
  useEffect(() => {
    const elapsedMs = Date.now() - anchorMs;
    const windowMs = Math.max(1, targetSec * 1000);
    const frac = Math.max(0, Math.min(1, elapsedMs / windowMs));
    cancelAnimation(progress);
    progress.value = frac;
    if (frac < 1) {
      progress.value = withTiming(1, { duration: windowMs - elapsedMs, easing: Easing.linear });
    }
    return () => cancelAnimation(progress);
  }, [anchorMs, targetSec, progress]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${(1 - progress.value) * 100}%` }));

  return (
    <View style={[styles.track, { backgroundColor: skin != null ? skin.palette.bg1 : colors.recess }, style]}>
      <Animated.View style={[styles.fill, { backgroundColor: accent.solid }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
