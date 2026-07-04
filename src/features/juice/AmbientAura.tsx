import { Canvas, Fill, Shader } from '@shopify/react-native-skia';
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { AppState, StyleSheet, useWindowDimensions } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { GRADES, gradeForScore } from '@/features/combat-power/grades';
import { getTheme } from '@/features/theme/themes';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { burstActive } from './JuiceOverlay';
import { makeAmbientAuraEffect } from './shaders';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

/**
 * The resting-state "living background" (spec §0.7 / §6.4): a continuous, deliberately CHEAP SkSL
 * aura layer that sits BEHIND screen content so the UI breathes between JUICE bursts.
 *
 * Anti-friction guarantees (§6 — logging/UI must never be blocked):
 *   · time is driven by a throttled Reanimated `useFrameCallback` (≈20fps — plenty for a ≈10s
 *     breath) on the UI thread, never the JS/logging path; the callback is fully deactivated while
 *     the app is backgrounded and holds during JUICE bursts (the celebration keeps the GPU budget);
 *     the shader is compiled once (cached module-level) so no per-mount hitch.
 *   · `pointerEvents="none"` + absolute fill → never intercepts a touch.
 *   · only mounts the Canvas when the screen is FOCUSED and intensity ≠ minimal → at most ONE
 *     ambient shader runs at a time (no stacked off-screen tabs burning GPU), and `minimal`
 *     users pay exactly zero (no clock, no canvas, no shader compile).
 */
export function AmbientAura() {
  const juiceIntensity = useSettingsStore((s) => s.juiceIntensity);
  const focused = useIsFocused();

  if (juiceIntensity === 'minimal' || !focused) return null;
  return <AmbientAuraCanvas intensity={juiceIntensity === 'mid' ? 0.5 : 1} />;
}

function AmbientAuraCanvas({ intensity }: { intensity: number }) {
  const { width, height } = useWindowDimensions();
  const aestheticPref = useSettingsStore((s) => s.aestheticPref);
  const score = useCombatPowerStore((s) => s.score);

  // Throttled clock: the aura animates slowly (≈10s breath cycle), so we advance the time uniform
  // only ~20×/sec instead of every display frame (up to 120Hz on ProMotion). The full-screen Fill
  // repaints only when uTime changes → a fraction of the idle GPU/battery cost, visually identical.
  // The per-frame worklet itself is just a cheap timestamp compare on the UI thread and never
  // touches JS/logging. While a JUICE burst is mounted the clock holds (last frame stays painted
  // under the flash) so the celebration gets the full GPU budget.
  const timeSec = useSharedValue(0);
  const lastTickMs = useSharedValue(0);
  const frameCb = useFrameCallback((frame) => {
    'worklet';
    if (burstActive.value) return; // a burst owns the GPU — hold the aura's last frame
    const t = frame.timeSinceFirstFrame;
    if (t - lastTickMs.value >= 50) {
      lastTickMs.value = t;
      timeSec.value = t / 1000;
    }
  });

  // Backgrounded/inactive app → stop the display-link callback entirely (no ticks, no repaints)
  // instead of letting the idle aura keep the render loop warm while nothing is visible.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      frameCb.setActive(state === 'active');
    });
    return () => sub.remove();
  }, [frameCb]);

  const effect = useMemo(() => makeAmbientAuraEffect(), []);
  const rgb = useMemo(() => hexToRgb(getTheme(aestheticPref).accent), [aestheticPref]);
  const resolution = useMemo(() => [width, height], [width, height]);

  // grade index → 0..1 "aliveness". Higher grade = more alive (earned; anti empty-confetti, §6.4).
  const energy = useMemo(() => {
    const gi = GRADES.findIndex((g) => g.key === gradeForScore(score).key);
    return gi <= 0 ? 0 : gi / (GRADES.length - 1);
  }, [score]);

  const uniforms = useDerivedValue(() => ({
    uTime: timeSec.value,
    uResolution: resolution,
    uColor: rgb,
    uIntensity: intensity,
    uEnergy: energy,
  }));

  // A broken shader must be obvious, not a silent crash — compileEffect already warns; fall back to
  // no background (the opaque screen bg still shows) rather than mounting an empty Canvas.
  if (!effect) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill>
        <Shader source={effect} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
