import { Canvas, Fill, Shader, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { useWindowDimensions } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

/**
 * GPU shader burst — runs an SkSL RuntimeEffect (procedural particles/turbulence) on a full-screen
 * Skia Canvas, driven by the burst progress shared value. Non-interactive overlay behind the text.
 * The actual "explosion" is GPU math — no art assets (spec §6.4).
 */
export function SkiaBurst({
  effect,
  progress,
  intensity,
  color,
}: {
  effect: SkRuntimeEffect;
  progress: SharedValue<number>;
  intensity: number;
  color: string;
}) {
  const { width, height } = useWindowDimensions();
  const rgb = hexToRgb(color);

  const uniforms = useDerivedValue(() => ({
    uTime: progress.value * 6,
    uProgress: progress.value,
    uIntensity: intensity,
    uResolution: [width, height],
    uColor: rgb,
  }));

  return (
    <Canvas style={{ position: 'absolute', top: 0, left: 0, width, height }} pointerEvents="none">
      <Fill>
        <Shader source={effect} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
