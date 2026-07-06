// ORIGINAL exercise pose-art — animated stick-figure renderer.
//
// One small Skia canvas, exactly TWO draw ops (glow pass + crisp pass) over a single SkPath that
// contains the whole figure (torso, girdles, limb chains, head circle, prop lines). When
// `animated`, a reanimated shared value loops 0→1→0 (~1.2s per direction, ease-in-out) and drives
// `usePathInterpolation` between the two keyframe paths — pure UI-thread work, no per-frame JS,
// no per-frame path allocation (Skia writes into a reused output path). When `animated=false`
// pose A renders statically with ZERO clock (no timing animation is ever started).
//
// Spec guards: §6 — this is decoration, never friction (pointerEvents="none", cheap); §5 — all
// pose data is original (poses.ts).

import {
  BlurMask,
  Canvas,
  Path,
  Skia,
  usePathInterpolation,
  type SkPath,
} from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import {
  cancelAnimation,
  Easing,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSkin } from '@/ui/skins/SkinContext';
import type { Family } from './families';
import { POSES, type Point, type Pose } from './poses';

const REP_MS = 1200; // one direction of the rep (a→b); the loop reverses for b→a
const HEAD_R = 0.034; // head-dot radius, fraction of size
const STROKE_W = 0.05; // limb stroke width, fraction of size
const GLOW_SCALE = 2.2; // glow pass stroke multiplier
const GLOW_OPACITY = 0.35;

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Build the full figure as ONE SkPath in pixel space. Both keyframes of a family go through this
 * same function → identical verb structure → the two paths are always interpolatable.
 */
function buildPosePath(pose: Pose, size: number): SkPath {
  const p = Skia.Path.Make();
  const mv = (pt: Point) => p.moveTo(pt.x * size, pt.y * size);
  const ln = (pt: Point) => p.lineTo(pt.x * size, pt.y * size);

  // Spine: neck (shoulder midpoint) → pelvis (hip midpoint).
  mv(mid(pose.shoulderL, pose.shoulderR));
  ln(mid(pose.hipL, pose.hipR));
  // Shoulder girdle + hip line (in side view these collapse to joint "dots" — intended).
  mv(pose.shoulderL);
  ln(pose.shoulderR);
  mv(pose.hipL);
  ln(pose.hipR);
  // Arms.
  mv(pose.shoulderL);
  ln(pose.elbowL);
  ln(pose.wristL);
  mv(pose.shoulderR);
  ln(pose.elbowR);
  ln(pose.wristR);
  // Legs.
  mv(pose.hipL);
  ln(pose.kneeL);
  ln(pose.ankleL);
  mv(pose.hipR);
  ln(pose.kneeR);
  ln(pose.ankleR);
  // Head (thick stroke over a small circle reads as a filled dot).
  p.addCircle(pose.head.x * size, pose.head.y * size, HEAD_R * size);
  // Props (bar / dumbbells / handles).
  for (const [s, e] of pose.props) {
    mv(s);
    ln(e);
  }
  return p;
}

export interface ExercisePoseProps {
  family: Family;
  /** Canvas is size×size px; pose coordinates are normalized to it. */
  size: number;
  /** Stroke color — defaults to the active skin's accent. */
  accent?: string;
  /** true → loop one rep a→b→a (~2.4s round trip). false → static pose A, zero clock. */
  animated?: boolean;
}

export function ExercisePose({ family, size, accent, animated = false }: ExercisePoseProps) {
  const skin = useSkin();
  const color = accent ?? skin.palette.accent;

  const { a, b } = POSES[family];
  const pathA = useMemo(() => buildPosePath(a, size), [a, size]);
  const pathB = useMemo(() => buildPosePath(b, size), [b, size]);

  // Rep clock — started ONLY when animated (static renders never tick).
  const progress = useSharedValue(0);
  useEffect(() => {
    if (!animated) return;
    progress.value = withRepeat(
      withTiming(1, { duration: REP_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true, // reverse: the eccentric half of the rep
    );
    return () => {
      cancelAnimation(progress);
      progress.value = 0;
    };
  }, [animated, progress]);

  // UI-thread path morph. Safe by construction: buildPosePath gives both frames identical verbs.
  const morphed = usePathInterpolation(progress, [0, 1], [pathA, pathB]);
  const path = animated ? morphed : pathA;

  const strokeW = STROKE_W * size;
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      {/* Soft glow pass under the figure. */}
      <Path
        path={path}
        style="stroke"
        strokeWidth={strokeW * GLOW_SCALE}
        strokeCap="round"
        strokeJoin="round"
        color={color}
        opacity={GLOW_OPACITY}
      >
        <BlurMask blur={Math.max(2, size * 0.03)} style="normal" />
      </Path>
      {/* Crisp figure. */}
      <Path
        path={path}
        style="stroke"
        strokeWidth={strokeW}
        strokeCap="round"
        strokeJoin="round"
        color={color}
      />
    </Canvas>
  );
}
