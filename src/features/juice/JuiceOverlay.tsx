import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, fontSize, monoFamily } from '../../ui/theme/tokens';
import type { Burst } from './JuiceProvider';
import { calloutAt, TIER_COLOR, TIER_LABEL } from './tierConfig';

/**
 * Global absolute-fill overlay (pointerEvents none) that plays one burst per logged event.
 * This is the Reanimated v0 — flash + "+N" float-up + (T3/T4) callout, all on the UI thread.
 * The SkSL/Skia GPU shader layer (energy aura, particle explosion, chromatic aberration) layers
 * in here later, iterated on-device (spec §6.4 — graphics is the hero).
 */
export function JuiceOverlay({ burst, onDone }: { burst: Burst | null; onDone: () => void }) {
  if (!burst) return null;
  // Keyed → a fresh, self-animating instance per fire. Mounting happens AFTER the DB write, so
  // it never blocks logging.
  return <JuiceBurst key={burst.id} burst={burst} onDone={onDone} />;
}

function JuiceBurst({ burst, onDone }: { burst: Burst; onDone: () => void }) {
  const { verdict, id } = burst;
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = 0;
    p.value = withTiming(
      1,
      { duration: verdict.durationMs, easing: Easing.out(Easing.cubic) },
      (finished) => {
        'worklet';
        if (finished) runOnJS(onDone)();
      },
    );
    // keyed mount → run exactly once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const color = TIER_COLOR[verdict.tier];
  const showCallout = verdict.tier >= 3;
  const label = verdict.tier === 4 ? calloutAt(id) : TIER_LABEL[verdict.tier];

  const flashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.12, 1], [0, 0.5 * verdict.intensity01, 0]),
  }));

  const floatStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.1, 0.75, 1], [0, 1, 1, 0]),
    transform: [
      { translateY: interpolate(p.value, [0, 1], [0, -140 * (0.5 + verdict.intensity01)]) },
      { scale: interpolate(p.value, [0, 0.2, 1], [0.6, 1.15, 1]) },
    ],
  }));

  const calloutStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.08, 0.7, 1], [0, 1, 1, 0]),
    transform: [{ scale: interpolate(p.value, [0, 0.18, 1], [0.7, 1.2, 1]) }],
  }));

  return (
    <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color }, flashStyle]} />

      {showCallout && label ? (
        <Animated.View style={styles.calloutWrap} pointerEvents="none">
          <Animated.Text style={[styles.callout, { color, textShadowColor: color }, calloutStyle]}>
            {label}
          </Animated.Text>
        </Animated.View>
      ) : null}

      <Animated.View style={styles.floatWrap} pointerEvents="none">
        <Animated.Text style={[styles.floatText, { color, textShadowColor: color }, floatStyle]}>
          +{Math.max(0, Math.round(verdict.deltaCp))}
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  floatWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatText: {
    fontFamily: monoFamily,
    fontSize: fontSize.hero,
    fontWeight: '900',
    color: colors.flash,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  calloutWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 180,
  },
  callout: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    letterSpacing: 4,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
});
