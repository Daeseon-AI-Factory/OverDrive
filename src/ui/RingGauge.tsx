// RingGauge — STATIC Skia arc gauge (value / target) for instrument tiles.
//
// Exactly TWO draw ops: a recess track ring + the progress arc. No clock, no frame callbacks, no
// Reanimated — the canvas repaints only when value/target/size/skin change (§6: instrument chrome
// must never cost the logging path a millisecond). The center slot renders children (digits, a
// pressable, …) absolutely centered inside the ring — the number IS the label.
//
// Color semantics mirror ProgressTrack: fill = skin accent (persona accent without a provider),
// flipping to semantic positive at 100% (completion = achieved status, anti-shame §9).

import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useSkinAccent } from './primitives';
import { useSkinOrNull } from './skins/SkinContext';
import { colors } from './theme/tokens';

export function RingGauge({
  value,
  target,
  size = 72,
  thickness = 7,
  color,
  complete,
  children,
  style,
  accessibilityLabel,
}: {
  /** Current reading (e.g. protein g so far). */
  value: number;
  /** Target for a full ring. `<= 0` renders an empty track (no arc) — "no target set". */
  target: number;
  /** Outer diameter in px. */
  size?: number;
  /** Ring stroke width in px. */
  thickness?: number;
  /** Override the arc color (defaults: skin accent → positive at 100%). */
  color?: string;
  /** Force the complete (positive) arc; defaults to value >= target. */
  complete?: boolean;
  /** Center slot — rendered absolutely centered inside the ring. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const skin = useSkinOrNull();
  const accent = useSkinAccent();
  const progress = target > 0 ? Math.max(0, Math.min(1, value / target)) : 0;
  const done = complete ?? (target > 0 && value >= target);

  // Both paths are pure geometry — rebuilt only when the reading or the box actually changes.
  const geo = useMemo(() => {
    const inset = thickness / 2 + 0.5; // keep the stroke inside the canvas bounds
    const track = Skia.Path.Make();
    track.addCircle(size / 2, size / 2, size / 2 - inset);
    if (progress <= 0) return { track, arc: null };
    const arc = Skia.Path.Make();
    if (progress >= 1) {
      arc.addCircle(size / 2, size / 2, size / 2 - inset); // full ring — addArc(…, 360) is platform-wobbly
    } else {
      arc.addArc(Skia.XYWHRect(inset, inset, size - 2 * inset, size - 2 * inset), -90, progress * 360);
    }
    return { track, arc };
  }, [size, thickness, progress]);

  const trackColor = skin != null ? skin.palette.bg1 : colors.recess;
  const fillColor = color ?? (done ? (skin != null ? skin.palette.positive : colors.positive) : accent.solid);

  return (
    <View style={[{ width: size, height: size }, style]} accessibilityLabel={accessibilityLabel}>
      <Canvas pointerEvents="none" style={{ width: size, height: size }}>
        <Path path={geo.track} style="stroke" strokeWidth={thickness} color={trackColor} />
        {geo.arc != null ? (
          <Path path={geo.arc} style="stroke" strokeWidth={thickness} strokeCap="round" color={fillColor} />
        ) : null}
      </Canvas>
      {children != null ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
