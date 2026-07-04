import React, { useEffect, useMemo } from 'react';
import { InteractionManager, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  makeMutable,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSettingsStore } from '../../stores/settingsStore';
import { calloutAt, getTheme } from '../theme/themes';
import { colors, displayFamily, fontSize, numberFamily } from '../../ui/theme/tokens';
import type { Burst } from './JuiceProvider';
import { makeEnergyPopEffect, makeOverdriveBurstEffect } from './shaders';
import { SkiaBurst } from './SkiaBurst';

/**
 * True while a burst overlay is mounted. AmbientAura's UI-thread frame callback reads this to hold
 * its own full-screen repaints during the burst, leaving the celebration all the GPU headroom.
 */
export const burstActive = makeMutable(false);

/**
 * Kinetic JUICE overlay — when you log, the NUMBER and CALLOUT explode: punch-scale, RGB chromatic
 * split (cyan/magenta offset layers), glow, rotation. v0 Reanimated (UI thread, non-blocking).
 * SkSL particle/energy shaders layer in next on-device. Combined with screen-shake in JuiceProvider.
 */
export function JuiceOverlay({ burst, onDone }: { burst: Burst | null; onDone: () => void }) {
  const juiceIntensity = useSettingsStore((s) => s.juiceIntensity);
  // Warm the SkSL compiles once, after first interactions settle, so the FIRST burst of a launch
  // never pays the synchronous compile on the JS thread mid-celebration (§6: JUICE never hitches
  // logging). The module-level ??= cache in shaders/index makes the burst-time calls free after.
  // 'minimal' keeps its zero-cost guarantee: no bursts fire, so nothing is compiled.
  useEffect(() => {
    if (juiceIntensity === 'minimal') return;
    const task = InteractionManager.runAfterInteractions(() => {
      makeEnergyPopEffect();
      makeOverdriveBurstEffect();
    });
    return () => task.cancel();
  }, [juiceIntensity]);

  if (!burst) return null;
  return <JuiceBurst key={burst.id} burst={burst} onDone={onDone} />;
}

function JuiceBurst({ burst, onDone }: { burst: Burst; onDone: () => void }) {
  const { verdict, id } = burst;
  const p = useSharedValue(0);
  const intensity = verdict.intensity01;
  const theme = getTheme(useSettingsStore((s) => s.aestheticPref));
  const color = theme.tierColor[verdict.tier];
  const showCallout = verdict.tier >= 3;
  const label = verdict.tier === 4 ? calloutAt(theme, id) : verdict.tier === 3 ? theme.overdriveLabel : '';
  const numText = `+${Math.max(0, Math.round(verdict.deltaCp))}`;
  // GPU shader: overdriveBurst (T3/T4) or energyPop (T1/T2). null if SkSL compile fails → text-only.
  const effect = useMemo(
    () => (verdict.tier >= 3 ? makeOverdriveBurstEffect() : makeEnergyPopEffect()),
    [verdict.tier],
  );

  useEffect(() => {
    // Tell the ambient layer to hold its clock while the burst owns the GPU (cleared on unmount).
    burstActive.value = true;
    p.value = 0;
    p.value = withTiming(1, { duration: verdict.durationMs, easing: Easing.out(Easing.cubic) }, (finished) => {
      'worklet';
      if (finished) runOnJS(onDone)();
    });
    return () => {
      burstActive.value = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.07, 1], [0, 0.5 * intensity, 0]),
  }));

  const floatWrap = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.08, 0.7, 1], [0, 1, 1, 0]),
    transform: [
      { translateY: interpolate(p.value, [0, 1], [16, -180 * (0.6 + intensity)]) },
      { scale: interpolate(p.value, [0, 0.16, 0.4, 1], [0.2, 1 + intensity, 1.12, 0.95]) },
      { rotate: `${interpolate(p.value, [0, 1], [0, (id % 2 ? 1 : -1) * 7])}deg` },
    ],
  }));

  // Chromatic aberration: cyan/magenta layers slide apart at the punch, then snap back.
  const chromaCyan = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(p.value, [0, 0.16, 1], [0, -(5 + 10 * intensity), 0]) }],
  }));
  const chromaMagenta = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(p.value, [0, 0.16, 1], [0, 5 + 10 * intensity, 0]) }],
  }));

  const calloutStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.05, 0.7, 1], [0, 1, 1, 0]),
    transform: [
      { scale: interpolate(p.value, [0, 0.12, 0.28, 1], [0.4, 1 + 0.5 * intensity, 1.06, 1]) },
    ],
  }));

  return (
    <View pointerEvents="none" style={styles.fill}>
      <Animated.View style={[styles.fill, { backgroundColor: color }, flash]} />
      {effect ? <SkiaBurst effect={effect} progress={p} intensity={intensity} color={color} /> : null}

      {showCallout && label ? (
        <View style={styles.calloutWrap}>
          <Animated.View style={calloutStyle}>
            <View style={styles.stack}>
              <Animated.Text style={[styles.callout, styles.abs, { color: colors.cyan }, chromaCyan]}>{label}</Animated.Text>
              <Animated.Text style={[styles.callout, styles.abs, { color: colors.magenta }, chromaMagenta]}>{label}</Animated.Text>
              <Text style={[styles.callout, { color: colors.flash, textShadowColor: color }]}>{label}</Text>
            </View>
          </Animated.View>
        </View>
      ) : null}

      <View style={styles.floatCenter}>
        <Animated.View style={floatWrap}>
          <View style={styles.stack}>
            <Animated.Text style={[styles.bigNum, styles.abs, { color: colors.cyan }, chromaCyan]}>{numText}</Animated.Text>
            <Animated.Text style={[styles.bigNum, styles.abs, { color: colors.magenta }, chromaMagenta]}>{numText}</Animated.Text>
            <Text style={[styles.bigNum, { color: colors.flash, textShadowColor: color }]}>{numText}</Text>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  stack: { alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute', top: 0, left: 0, right: 0, textAlign: 'center' },
  floatCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  bigNum: {
    fontFamily: numberFamily,
    fontSize: fontSize.hero,
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 40,
  },
  calloutWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 200 },
  callout: {
    fontFamily: displayFamily,
    fontSize: fontSize.xl + 8,
    letterSpacing: 3,
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 34,
  },
});
