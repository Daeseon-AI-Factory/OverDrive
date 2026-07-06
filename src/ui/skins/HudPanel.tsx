// HudPanel — skin-driven panel chrome. A STATIC Skia canvas sits BEHIND the children and repaints
// only on layout/skin change: no clock, no frame callbacks, no Reanimated (§6 — panel chrome must
// never cost the logging path a millisecond; ambient motion is a separate opt-in layer keyed off
// skin.motion). Quiet skins (rect shape + no texture/marks/glow) render a plain bordered View —
// zero Skia cost.
//
// Draw-op budget per panel: fill + border + bevel + 1 texture path + marks + glow ≈ ≤8 ops.
// Every texture is built as ONE SkPath (many segments, one draw), capped well under ~40 segments
// where density scales with size.

import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text as RNText,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  BlurMask,
  Canvas,
  LinearGradient,
  Path,
  Rect,
  Skia,
  Text as SkText,
  useFont,
  vec,
  type SkPath,
} from '@shopify/react-native-skia';
import { Orbitron_700Bold } from '@expo-google-fonts/orbitron';
import { useSkin } from './SkinContext';
import type { HudSkin } from './types';

type Panel = HudSkin['panel'];

// ── Shape paths (all inset by borderW/2 so the stroke isn't clipped by the canvas bounds) ──────

/** PRIMAL-style torn-edge profile (normalized from the mockup clip-path) — deterministic, static. */
const JAG_TOP: readonly (readonly [number, number])[] = [
  [0, 10],
  [0.05, 0],
  [0.36, 4],
  [0.41, 10],
  [0.68, 0],
  [1, 7],
];
const JAG_BOTTOM: readonly (readonly [number, number])[] = [
  [1, 0.9],
  [0.95, 1],
  [0.58, 0.95],
  [0.52, 1],
  [0.18, 0.94],
  [0, 1],
];

function buildShapePath(panel: Panel, w: number, h: number): SkPath {
  const p = Skia.Path.Make();
  const i = Math.max(panel.borderW / 2, 0.5);
  switch (panel.shape) {
    case 'chamfer': {
      // TL/BR diagonal cut pair (REACTOR: polygon(14px 0, 100% 0, 100% -14px, -14px 100%, 0 100%, 0 14px)).
      const c = Math.max(2, Math.min(panel.chamferPx ?? 12, w / 3, h / 3));
      p.moveTo(i + c, i);
      p.lineTo(w - i, i);
      p.lineTo(w - i, h - i - c);
      p.lineTo(w - i - c, h - i);
      p.lineTo(i, h - i);
      p.lineTo(i, i + c);
      p.close();
      break;
    }
    case 'skew': {
      // Parallelogram — panel leans, children stay straight (CSS skews container + unskews content).
      const dx = Math.min(Math.tan((Math.abs(panel.skewDeg ?? 7) * Math.PI) / 180) * (h - 2 * i), w / 3);
      p.moveTo(i + dx, i);
      p.lineTo(w - i, i);
      p.lineTo(w - i - dx, h - i);
      p.lineTo(i, h - i);
      p.close();
      break;
    }
    case 'jagged': {
      const jy = (px: number) => Math.min(px, h * 0.12) + i;
      const jx = (fx: number) => i + fx * (w - 2 * i);
      const first = JAG_TOP[0];
      p.moveTo(jx(first[0]), jy(first[1]));
      for (let k = 1; k < JAG_TOP.length; k++) p.lineTo(jx(JAG_TOP[k][0]), jy(JAG_TOP[k][1]));
      for (const [fx, fy] of JAG_BOTTOM) p.lineTo(jx(fx), fy >= 1 ? h - i : fy * h);
      p.close();
      break;
    }
    case 'slab':
      p.addRRect(Skia.RRectXY(Skia.XYWHRect(i, i, w - 2 * i, h - 2 * i), 3, 3));
      break;
    case 'rect':
      p.addRect(Skia.XYWHRect(i, i, w - 2 * i, h - 2 * i));
      break;
  }
  return p;
}

// ── Corner marks ───────────────────────────────────────────────────────────────────────────────

function buildBrackets(w: number, h: number): SkPath {
  // Two 11px L-strokes, TL + BR, 4px inside the edge (REACTOR .brkt).
  const p = Skia.Path.Make();
  const o = 4;
  const l = Math.min(11, w / 4, h / 4);
  p.moveTo(o, o + l);
  p.lineTo(o, o);
  p.lineTo(o + l, o);
  p.moveTo(w - o, h - o - l);
  p.lineTo(w - o, h - o);
  p.lineTo(w - o - l, h - o);
  return p;
}

function buildRivets(w: number, h: number): SkPath {
  const p = Skia.Path.Make();
  const o = 8;
  const r = 2.5;
  p.addCircle(o, o, r);
  p.addCircle(w - o, o, r);
  p.addCircle(o, h - o, r);
  p.addCircle(w - o, h - o, r);
  return p;
}

// ── Textures — each is ONE path (single draw op), density capped for cheapness ────────────────

/** Deterministic 0..1 hash (stars/ink jitter) — layout-stable, never animated. */
function fract01(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function buildTexture(kind: Panel['texture'], w: number, h: number): { stroke: SkPath | null; fill: SkPath | null } {
  switch (kind) {
    case 'scanline': {
      const p = Skia.Path.Make();
      const step = Math.max(4, Math.ceil(h / 36)); // ≤ ~36 lines regardless of panel height
      for (let y = step; y < h - 2; y += step) {
        p.moveTo(1, y);
        p.lineTo(w - 1, y);
      }
      return { stroke: p, fill: null };
    }
    case 'knurl': {
      const p = Skia.Path.Make();
      const step = Math.max(8, Math.ceil((w + h) / 18)); // both diagonal families in one path
      for (let x = -h; x < w; x += step) {
        p.moveTo(x, 0);
        p.lineTo(x + h, h);
        p.moveTo(x, h);
        p.lineTo(x + h, 0);
      }
      return { stroke: p, fill: null };
    }
    case 'ink': {
      // Sparse dry-brush strokes, slight deterministic waver.
      const p = Skia.Path.Make();
      for (let k = 0; k < 5; k++) {
        const y = h * (0.16 + 0.17 * k);
        const bow = (fract01(k + 1) - 0.5) * 8;
        p.moveTo(w * 0.06, y);
        p.quadTo(w * 0.5, y + bow, w * 0.94, y - bow * 0.4);
      }
      return { stroke: p, fill: null };
    }
    case 'speedline': {
      const p = Skia.Path.Make();
      const n = 9;
      for (let k = 0; k < n; k++) {
        const x = ((k + 0.5) / n) * (w + h * 0.35);
        p.moveTo(x, 0);
        p.lineTo(x - h * 0.35, h);
      }
      return { stroke: p, fill: null };
    }
    case 'stars': {
      const p = Skia.Path.Make();
      for (let k = 1; k <= 14; k++) {
        const x = 3 + fract01(k) * (w - 6);
        const y = 3 + fract01(k * 7.31) * (h - 6);
        p.addCircle(x, y, 0.8 + fract01(k * 3.7) * 0.8);
      }
      return { stroke: null, fill: p };
    }
    case 'none':
      return { stroke: null, fill: null };
  }
}

const TEXTURE_OPACITY: Record<Panel['texture'], number> = {
  scanline: 0.05,
  knurl: 0.06,
  ink: 0.05,
  speedline: 0.06,
  stars: 0.4,
  none: 0,
};

interface PanelGeo {
  shape: SkPath;
  bevel: SkPath | null;
  brackets: SkPath | null;
  rivets: SkPath | null;
  textureStroke: SkPath | null;
  textureFill: SkPath | null;
}

function buildGeometry(panel: Panel, w: number, h: number): PanelGeo {
  const texture = buildTexture(panel.texture, w, h);
  let bevel: SkPath | null = null;
  if (panel.shape === 'slab') {
    // Top bevel — light catching the slab's machined top edge (FOUNDRY border-top highlight).
    bevel = Skia.Path.Make();
    bevel.moveTo(4, panel.borderW + 1);
    bevel.lineTo(w - 4, panel.borderW + 1);
  }
  return {
    shape: buildShapePath(panel, w, h),
    bevel,
    brackets: panel.cornerMarks === 'bracket' ? buildBrackets(w, h) : null,
    rivets: panel.cornerMarks === 'rivet' ? buildRivets(w, h) : null,
    textureStroke: texture.stroke,
    textureFill: texture.fill,
  };
}

// ── HudPanel ───────────────────────────────────────────────────────────────────────────────────

/**
 * Skin-driven panel chrome. Children render ABOVE a static Skia canvas (shape fill/stroke, corner
 * marks, glow edge, texture). `live` marks the one alive panel per screen — the border strokes in
 * the skin accent instead of the neutral line. Padding is the caller's (Card passes its own).
 */
export function HudPanel({
  children,
  style,
  live = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  live?: boolean;
}) {
  const skin = useSkin();
  const { panel, palette } = skin;
  const [size, setSize] = useState({ w: 0, h: 0 });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    const h = Math.round(e.nativeEvent.layout.height);
    setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
  }, []);

  const quiet =
    panel.shape === 'rect' && panel.texture === 'none' && panel.cornerMarks === 'none' && panel.glowEdge === 'none';

  const geo = useMemo(
    () => (quiet || size.w < 4 || size.h < 4 ? null : buildGeometry(panel, size.w, size.h)),
    [quiet, panel, size.w, size.h],
  );

  // Quiet skins: plain bordered View — zero Skia.
  if (quiet) {
    return (
      <View
        style={[
          styles.quiet,
          {
            backgroundColor: panel.surfaceGradient?.[0] ?? palette.surface1,
            borderWidth: panel.borderW,
            borderColor: live ? palette.accent : palette.line,
          },
          style,
        ]}
      >
        <View pointerEvents="none" style={[styles.quietEdge, { backgroundColor: palette.edgeHi }]} />
        {children}
      </View>
    );
  }

  const borderColor = live ? palette.accent : palette.line;
  const textureColor = panel.texture === 'scanline' ? (palette.accentHi ?? palette.text) : palette.text;
  const glowY = panel.glowEdge === 'top' ? 1.5 : size.h - 2.5;

  return (
    <View onLayout={onLayout} style={[styles.container, style]}>
      {geo != null ? (
        <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Path path={geo.shape} color={panel.surfaceGradient == null ? palette.surface1 : undefined}>
            {panel.surfaceGradient != null ? (
              <LinearGradient start={vec(0, 0)} end={vec(0, size.h)} colors={panel.surfaceGradient} />
            ) : null}
          </Path>
          <Path path={geo.shape} style="stroke" strokeWidth={panel.borderW} color={borderColor} />
          {geo.bevel != null ? <Path path={geo.bevel} style="stroke" strokeWidth={1} color={palette.lineStrong} /> : null}
          {geo.textureStroke != null ? (
            <Path
              path={geo.textureStroke}
              style="stroke"
              strokeWidth={panel.texture === 'ink' ? 1.5 : 1}
              color={textureColor}
              opacity={TEXTURE_OPACITY[panel.texture]}
            />
          ) : null}
          {geo.textureFill != null ? (
            <Path path={geo.textureFill} color={textureColor} opacity={TEXTURE_OPACITY[panel.texture]} />
          ) : null}
          {geo.brackets != null ? (
            <Path path={geo.brackets} style="stroke" strokeWidth={1.5} color={palette.accent} opacity={0.85} />
          ) : null}
          {geo.rivets != null ? <Path path={geo.rivets} color={palette.lineStrong} /> : null}
          {panel.glowEdge !== 'none' ? (
            <>
              <Rect x={size.w * 0.08} y={glowY - 1} width={size.w * 0.84} height={2.5} opacity={live ? 1 : 0.75}>
                <LinearGradient
                  start={vec(size.w * 0.08, 0)}
                  end={vec(size.w * 0.92, 0)}
                  colors={[`${palette.accent}00`, palette.accent, `${palette.accent}00`]}
                />
                <BlurMask blur={3} style="normal" />
              </Rect>
              <Rect x={size.w * 0.2} y={glowY} width={size.w * 0.6} height={1} opacity={0.9}>
                <LinearGradient
                  start={vec(size.w * 0.2, 0)}
                  end={vec(size.w * 0.8, 0)}
                  colors={[`${palette.accent}00`, palette.accent, `${palette.accent}00`]}
                />
              </Rect>
            </>
          ) : null}
        </Canvas>
      ) : null}
      {children}
    </View>
  );
}

// ── CtaSurface — skin CTA fill for Button (static; only mounts when gradient/chamfer needed) ──

export function CtaSurface({
  shape,
  gradient,
  color,
}: {
  shape: HudSkin['cta']['shape'];
  gradient?: readonly [string, string];
  color: string;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    const h = Math.round(e.nativeEvent.layout.height);
    setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
  }, []);

  const path = useMemo(() => {
    const { w, h } = size;
    if (w < 4 || h < 4) return null;
    const p = Skia.Path.Make();
    if (shape === 'chamfer') {
      // BR-cut CTA blade (REACTOR .go clip-path mirrors the TL-cut input).
      const c = Math.min(10, h / 3);
      p.moveTo(0, 0);
      p.lineTo(w, 0);
      p.lineTo(w, h - c);
      p.lineTo(w - c, h);
      p.lineTo(0, h);
      p.close();
    } else {
      const r = shape === 'rect' ? 10 : shape === 'slab' ? 3 : 2;
      p.addRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, w, h), r, r));
    }
    return p;
  }, [shape, size]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {path != null ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Path path={path} color={gradient == null ? color : undefined}>
            {gradient != null ? (
              <LinearGradient start={vec(0, 0)} end={vec(0, size.h)} colors={[gradient[0], gradient[1]]} />
            ) : null}
          </Path>
        </Canvas>
      ) : null}
    </View>
  );
}

// ── GradientDigits — hero.numberGradient digits (static Skia text; repaints only on value) ────

/**
 * Skia-rendered digits with a vertical gradient + optional soft glow (skin.hero params). Falls
 * back to a plain RN Text until the font resolves — never blocks. No clock, no animation: the
 * canvas repaints only when the value string changes.
 */
export function GradientDigits({
  text,
  fontSize,
  lineHeight,
  colors: stops,
  glowRadius = 0,
  fallbackStyle,
}: {
  text: string;
  fontSize: number;
  lineHeight: number;
  colors: readonly string[];
  glowRadius?: number;
  fallbackStyle?: StyleProp<TextStyle>;
}) {
  const font = useFont(Orbitron_700Bold, fontSize);
  if (font == null || stops.length < 2) {
    return <RNText style={fallbackStyle}>{text}</RNText>;
  }
  const metrics = font.getMetrics();
  const textW = font.measureText(text).width;
  const pad = Math.ceil(glowRadius / 2);
  const baseline = (lineHeight - (metrics.descent - metrics.ascent)) / 2 - metrics.ascent;
  const width = Math.ceil(textW) + pad * 2 + 2;
  const glowColor = stops[Math.min(1, stops.length - 1)];
  return (
    <Canvas style={{ width, height: lineHeight }}>
      {glowRadius > 0 ? (
        <SkText x={pad + 1} y={baseline} text={text} font={font} color={glowColor} opacity={0.55}>
          <BlurMask blur={glowRadius / 2} style="normal" />
        </SkText>
      ) : null}
      <SkText x={pad + 1} y={baseline} text={text} font={font}>
        <LinearGradient start={vec(0, 0)} end={vec(0, lineHeight)} colors={[...stops]} />
      </SkText>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: 'transparent' },
  quiet: { borderRadius: 4, overflow: 'hidden' },
  quietEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
});
