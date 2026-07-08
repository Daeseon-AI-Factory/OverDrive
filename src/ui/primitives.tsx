// MONOLITH primitives — a matte-black machined chassis where exactly ONE thing is powered on:
// the persona accent. Depth = surface steps + a 1pt top edge-highlight, never shadows
// (shadowOpacity 0 / elevation 0 everywhere).
//
// SKINS (ui/skins/*): when a SkinProvider is mounted, every primitive reads its chrome (palette +
// panel/bar/cta/hero params) from useSkin — Card delegates to HudPanel's STATIC Skia chrome
// (repaints only on layout/skin change; §6: logging speed > 화려함). WITHOUT a provider (tests,
// unskinned trees) everything falls back to these MONOLITH tokens + persona accent, unchanged.
// Animated Skia still lives exclusively in AmbientAura + JuiceOverlay.

import React, { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { getTheme } from '@/features/theme/themes';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  border,
  colors,
  hangulSafeLetterSpacing,
  makeAccent,
  numType,
  radius,
  space,
  tracking,
  typeScale,
  type Accent,
} from './theme/tokens';
import { CtaSurface, GradientDigits, HudPanel } from './skins/HudPanel';
import { useSkinOrNull } from './skins/SkinContext';

/**
 * The ONE accent of the current view — persona accent (settings.aestheticPref) expanded through
 * the fixed alpha ramp. Resolve once per screen and pass down; primitives call it themselves so
 * existing call sites stay unchanged.
 */
export function useAccent(): Accent {
  const pref = useSettingsStore((s) => s.aestheticPref);
  return useMemo(() => makeAccent(getTheme(pref).accent), [pref]);
}

/**
 * The CHROME accent: the skin accent when a SkinProvider is mounted (skins own chrome — panel
 * geometry, material, glow, bars, CTA), else the persona accent (legacy MONOLITH behavior; tests
 * render without a provider). Personas keep owning JUICE callouts/tier colors — orthogonal.
 */
export function useSkinAccent(): Accent {
  const skin = useSkinOrNull();
  const pref = useSettingsStore((s) => s.aestheticPref);
  return useMemo(() => makeAccent(skin != null ? skin.palette.accent : getTheme(pref).accent), [skin, pref]);
}

/**
 * `background` renders a node (e.g. the Skia AmbientAura) edge-to-edge BEHIND the content: the opaque
 * bg sits on an outer wrapper and the SafeAreaView goes transparent so the layer shows through. Kept
 * as a plain ReactNode prop — NOT a hard Skia import — so this low-level primitive stays dependency-
 * light and unit-testable; the screen that wants the aura owns the Skia/Reanimated dependency.
 */
export function Screen({
  children,
  style,
  background,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  background?: React.ReactNode;
}) {
  const skin = useSkinOrNull();
  return (
    <View style={[styles.root, skin != null && { backgroundColor: skin.palette.bg0 }]}>
      {background}
      <SafeAreaView style={[styles.screen, style]}>{children}</SafeAreaView>
    </View>
  );
}

/** Overline section header — pure text3, no accent, no rules/ticks. Korean strings get ≤0.5 tracking. */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  const skin = useSkinOrNull();
  const letterSpacing =
    typeof children === 'string' ? hangulSafeLetterSpacing(children, tracking.overline) : tracking.overline;
  return (
    <Text style={[styles.section, skin != null && { color: skin.palette.text3 }, { letterSpacing }]}>{children}</Text>
  );
}

/**
 * Card — 3-layer machined panel: surface1 body + 1pt `line` border + 1pt top edge-highlight
 * (light falling on the top edge). `live` marks THE one alive card per screen with a 2pt accent
 * rail and flips the `eyebrow` overline to accent. No shadows, no colored borders.
 *
 * With a SkinProvider mounted, chrome is delegated to HudPanel (skin shape/material/texture/marks
 * — static Skia); `live` becomes the skin's accent edge emphasis.
 */
export function Card({
  children,
  style,
  live = false,
  eyebrow,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** At most ONE live card per screen — 2pt accent rail + accent eyebrow. */
  live?: boolean;
  /** Optional overline rendered inside the card top (text3; accent.solid when live). */
  eyebrow?: string;
}) {
  const skin = useSkinOrNull();
  const accent = useSkinAccent();
  const eyebrowNode =
    eyebrow != null ? (
      <Text
        style={[
          styles.cardEyebrow,
          skin != null && { color: skin.palette.text3 },
          { letterSpacing: hangulSafeLetterSpacing(eyebrow, tracking.overline) },
          live && { color: accent.solid },
        ]}
      >
        {eyebrow}
      </Text>
    ) : null;
  if (skin != null) {
    return (
      <HudPanel live={live} style={[styles.cardPad, style]}>
        {eyebrowNode}
        {children}
      </HudPanel>
    );
  }
  return (
    <View style={[styles.card, style]}>
      <View pointerEvents="none" style={styles.cardEdge} />
      {live ? <View pointerEvents="none" style={[styles.cardRail, { backgroundColor: accent.solid }]} /> : null}
      {eyebrowNode}
      {children}
    </View>
  );
}

/**
 * Chip / filter / RIR selector. Inactive = neutral surface2; active = accent tint-fill (12%) +
 * 40% border + accent label — NEVER solid-filled. The legacy `color` prop is accepted but ignored:
 * the accent always comes from the persona (one accent hue per view, by construction).
 */
export function Pill({
  label,
  active = false,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  /** @deprecated Ignored — active tint always uses the persona accent. */
  color?: string;
}) {
  const skin = useSkinOrNull();
  const accent = useSkinAccent();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled: !onPress }}
      // Compact pill visuals + expanded touch target (30pt tall → ≥44pt per Apple HIG).
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ pressed }) => [
        styles.pill,
        skin != null && { backgroundColor: skin.palette.surface2, borderColor: skin.palette.line },
        active && { backgroundColor: accent.fill, borderColor: accent.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.pillLabel, skin != null && { color: skin.palette.text2 }, active && { color: accent.solid }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/**
 * The button. `primary` (solid accent) is THE one CTA per screen — log set / finish session.
 * `secondary` = accent tint-fill; `ghost` = neutral surface for demote-able actions. Pressed
 * state is a surface-step/opacity change only — no scale/bounce, no shadows.
 *
 * With a skin active, `primary` takes the skin CTA chrome (shape + gradient + textColor from
 * skin.cta; `logWord` is the quicklog CTA's copy only — the label prop always wins here). The
 * chamfer/gradient fill is ONE static Skia canvas; skew is a plain View transform.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  compact = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** 36pt height + 13pt label (e.g. inline submit); default is the full 48pt CTA. */
  compact?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const skin = useSkinOrNull();
  const accent = useSkinAccent();
  const height = compact ? 36 : 48;
  const cta = variant === 'primary' ? skin?.cta : undefined;
  const paintsCanvas = cta != null && (cta.gradient != null || cta.shape === 'chamfer');
  const skewed = cta?.shape === 'skew';
  return (
    <Pressable
      onPress={() => {
        // Fire-and-forget haptic — never awaited, so it can't delay the action (spec: JUICE never blocks).
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        { height },
        cta != null && { borderRadius: cta.shape === 'slab' ? 3 : cta.shape === 'rect' ? radius.md : 0 },
        skewed && styles.buttonSkew,
        variant === 'primary' && { backgroundColor: paintsCanvas ? 'transparent' : accent.solid },
        variant === 'secondary' && {
          backgroundColor: pressed ? accent.fillActive : accent.fill,
          borderWidth: border.thin,
          borderColor: accent.border,
        },
        variant === 'ghost' && {
          backgroundColor:
            skin != null ? skin.palette.surface2 : pressed ? colors.surface3 : colors.surface2,
          borderWidth: border.thin,
          borderColor: skin != null ? skin.palette.line : colors.line,
        },
        skin != null && variant === 'ghost' && pressed && { opacity: 0.8 },
        disabled && { opacity: 0.35 },
        !disabled && pressed && variant === 'primary' && { opacity: 0.85 },
        style,
      ]}
    >
      {paintsCanvas && cta != null ? <CtaSurface shape={cta.shape} gradient={cta.gradient} color={accent.solid} /> : null}
      <View style={skewed ? styles.buttonUnskew : null}>
        <Text
          style={[
            compact ? styles.buttonLabelCompact : styles.buttonLabel,
            {
              color:
                variant === 'primary'
                  ? (cta?.textColor ?? colors.bg0)
                  : variant === 'secondary'
                    ? accent.solid
                    : skin != null
                      ? skin.palette.text2
                      : colors.text2,
            },
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * @deprecated Legacy alias — renders `Button variant="secondary"`. The `color` prop is ignored:
 * accent comes from the persona ramp. Migrate call sites to `Button`.
 */
export function NeonButton(props: {
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Button label={props.label} onPress={props.onPress} variant="secondary" disabled={props.disabled} style={props.style} />
  );
}

/**
 * Square icon button (mic / photo / stepper +−). Neutral machined block; `tone="danger"` is the
 * ONE sanctioned semantic surface (recording/destructive = live status). Glyphs are text — pass
 * U+FE0E text-presentation where applicable; steppers may pass glyphStyle {fontSize:22,
 * fontWeight:'800'} for mid-set tap targets.
 */
export function IconSquare({
  glyph,
  onPress,
  accessibilityLabel,
  compact = false,
  tone = 'neutral',
  busy = false,
  disabled = false,
  glyphStyle,
  style,
}: {
  glyph: string;
  onPress: () => void;
  accessibilityLabel: string;
  /** 44×44 (steppers, inline) instead of the default 48×48. */
  compact?: boolean;
  tone?: 'neutral' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  glyphStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const skin = useSkinOrNull();
  const size = compact ? 44 : 48;
  const blocked = disabled || busy;
  const dangerColor = skin != null ? skin.palette.danger : colors.danger;
  return (
    <Pressable
      onPress={onPress}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: blocked, busy }}
      style={({ pressed }) => [
        styles.iconSquare,
        { width: size, height: size },
        skin != null && { backgroundColor: skin.palette.surface2, borderColor: skin.palette.line },
        tone === 'danger' && { backgroundColor: dangerColor, borderColor: dangerColor },
        pressed &&
          (tone === 'danger'
            ? { opacity: 0.85 }
            : skin != null
              ? { opacity: 0.8 }
              : { backgroundColor: colors.surface3 }),
        busy && { opacity: 0.4 },
        disabled && !busy && { opacity: 0.35 },
        style,
      ]}
    >
      <Text
        style={[
          styles.iconGlyph,
          skin != null && { color: skin.palette.text2 },
          tone === 'danger' && { color: colors.flash },
          glyphStyle,
        ]}
      >
        {glyph}
      </Text>
    </Pressable>
  );
}

/** Text input — a recess: darker than the card it sits in (inputs go DOWN). Focus = accent border, no glow. */
export const Input = React.forwardRef<TextInput, TextInputProps>(function Input(
  { style, onFocus, onBlur, ...rest },
  ref,
) {
  const skin = useSkinOrNull();
  const accent = useSkinAccent();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={skin != null ? skin.palette.text3 : colors.text3}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.input,
        skin != null && {
          backgroundColor: skin.palette.bg1,
          borderColor: skin.palette.line,
          color: skin.palette.text,
        },
        style,
        focused && { borderColor: accent.border },
      ]}
    />
  );
});

/** Segment notch pitch (px) for 'segment'/'skew-segment' bar styles. */
const NOTCH_STEP = 14;

/**
 * 6pt progress bar — recess track, accent fill; the fill flips to semantic green at 100%
 * (completion = achieved status, anti-shame §9).
 *
 * With a skin active the bar takes skin.bar: `heightPx`, and style 'segment' (overlaid bg notches),
 * 'skew-segment' (same + skewX transform), or 'dual' (second 2pt echo track). All plain Views —
 * no Skia, nothing animated.
 */
export function ProgressTrack({
  progress,
  complete,
  style,
}: {
  /** 0..1 (clamped). */
  progress: number;
  /** Force the complete (positive green) fill; defaults to progress >= 1. */
  complete?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const skin = useSkinOrNull();
  const accent = useSkinAccent();
  const [trackW, setTrackW] = useState(0);
  const clamped = Math.max(0, Math.min(1, progress));
  const done = complete ?? clamped >= 1;
  const barKind = skin?.bar.style ?? 'solid';
  const heightPx = skin?.bar.heightPx ?? 6;
  const segmented = barKind === 'segment' || barKind === 'skew-segment';
  const fillColor = done ? (skin != null ? skin.palette.positive : colors.positive) : accent.solid;
  const radiusPx = skin != null ? 2 : 3;

  const notches = useMemo(() => {
    if (!segmented || trackW < NOTCH_STEP * 2) return [];
    const xs: number[] = [];
    for (let x = NOTCH_STEP; x < trackW && xs.length < 48; x += NOTCH_STEP) xs.push(x);
    return xs;
  }, [segmented, trackW]);

  const track = (
    <View
      onLayout={segmented ? (e) => setTrackW(Math.round(e.nativeEvent.layout.width)) : undefined}
      style={[
        styles.track,
        skin != null && { height: heightPx, borderRadius: radiusPx, backgroundColor: skin.palette.bg1 },
        barKind === 'skew-segment' && styles.trackSkew,
        skin == null && style, // legacy contract: style lands on the track itself
      ]}
    >
      <View style={[styles.trackFill, { borderRadius: radiusPx, width: `${clamped * 100}%`, backgroundColor: fillColor }]} />
      {notches.map((x) => (
        <View
          key={x}
          pointerEvents="none"
          style={[styles.trackNotch, { left: x, backgroundColor: skin != null ? skin.palette.bg0 : colors.bg0 }]}
        />
      ))}
    </View>
  );

  if (skin == null) return track;
  return (
    <View style={style}>
      {track}
      {barKind === 'dual' ? (
        <View style={[styles.trackDual, { backgroundColor: skin.palette.bg1 }]}>
          <View style={[styles.trackDualFill, { width: `${clamped * 100}%`, backgroundColor: fillColor }]} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Live indicator — 6×6 accent dot inside a 14×14 fillActive halo (cross-platform fake glow; works
 * on Android where shadowColor does nothing). Pair with an accent overline like '진행 중'.
 * Counts as glow slot 2 of 2 on a screen.
 */
export function LiveDot({ style }: { style?: StyleProp<ViewStyle> }) {
  const accent = useSkinAccent();
  return (
    <View style={[styles.liveHalo, { backgroundColor: accent.fillActive }, style]}>
      <View style={[styles.liveDot, { backgroundColor: accent.solid }]} />
    </View>
  );
}

export type MetricSize = 'heroXL' | 'hero' | 'large' | 'mid' | 'small';

// Fixed paddings that seat the 11pt unit label on the digit baseline per size — a simple flex row,
// deliberately NOT alignItems:'baseline' (inconsistent across RN platforms with custom fonts).
const UNIT_SEAT: Record<MetricSize, { paddingBottom: number; marginLeft: number }> = {
  heroXL: { paddingBottom: 12, marginLeft: space.sm },
  hero: { paddingBottom: 9, marginLeft: space.sm },
  large: { paddingBottom: 4, marginLeft: space.xs },
  mid: { paddingBottom: 2, marginLeft: space.xs },
  small: { paddingBottom: 1, marginLeft: space.xxs + 1 },
};

/**
 * Number + unit micro-label atom — no naked numbers ship. Digits are Orbitron tabular-nums; the
 * unit ('CP', 'KG', 'G', 'KCAL', '%') is an 11pt uppercase Latin micro-label seated on the digit
 * baseline. Hero glow is applied by the caller via valueStyle (heroTextGlow) — Metric stays dumb.
 *
 * With a skin active and skin.hero.numberGradient set, hero-size digits (hero/heroXL, no explicit
 * `color` override) render through a static Skia gradient (GradientDigits — repaints only when
 * the value changes; falls back to plain Text until the font resolves).
 */
export function Metric({
  value,
  unit,
  size = 'mid',
  color,
  unitColor,
  style,
  valueStyle,
  unitStyle,
}: {
  value: string | number;
  unit?: string;
  size?: MetricSize;
  color?: string;
  unitColor?: string;
  style?: StyleProp<ViewStyle>;
  valueStyle?: StyleProp<TextStyle>;
  unitStyle?: StyleProp<TextStyle>;
}) {
  const skin = useSkinOrNull();
  const seat = UNIT_SEAT[size];
  const heroSize = size === 'hero' || size === 'heroXL';
  // Hero digits take the skin's bright hero fill (accentHi — e.g. REACTOR's flat #BFF4FF .num);
  // everything smaller stays plain text so inline stats never read accent-tinted.
  const digitColor =
    color ?? (skin != null ? (heroSize ? (skin.palette.accentHi ?? skin.palette.text) : skin.palette.text) : colors.text);
  const resolvedUnitColor = unitColor ?? (skin != null ? skin.palette.text3 : colors.text3);
  const spec = numType[size];
  // Hero digits ALWAYS render through Skia when the skin wants glow: RN textShadow on new-arch iOS
  // falls back to a rectangular layer shadow (the "box behind the number" from the build-10 sim
  // audit). Glyph-shaped glow needs Skia, so flat-color skins get a 2-stop identity gradient.
  const wantsHero = skin != null && (size === 'hero' || size === 'heroXL') && color == null;
  const heroStops =
    wantsHero && skin.hero.numberGradient != null && skin.hero.numberGradient.length >= 2
      ? skin.hero.numberGradient
      : wantsHero && skin.hero.glowRadius > 0
        ? [digitColor, digitColor]
        : null;
  const hero = heroStops != null ? { colors: heroStops, glow: skin!.hero.glowRadius } : null;
  return (
    <View style={[styles.metricRow, style]}>
      {hero != null ? (
        <GradientDigits
          text={String(value)}
          fontSize={typeof spec.fontSize === 'number' ? spec.fontSize : 17}
          lineHeight={typeof spec.lineHeight === 'number' ? spec.lineHeight : 22}
          colors={hero.colors}
          glowRadius={hero.glow}
          fallbackStyle={[spec, { color: digitColor }, valueStyle]}
        />
      ) : (
        <Text style={[spec, { color: digitColor }, valueStyle]}>{value}</Text>
      )}
      {unit != null ? (
        <Text
          style={[
            styles.metricUnit,
            { color: resolvedUnitColor, paddingBottom: seat.paddingBottom, marginLeft: seat.marginLeft },
            unitStyle,
          ]}
        >
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

export function Muted({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const skin = useSkinOrNull();
  return <Text style={[styles.muted, skin != null && { color: skin.palette.text2 }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  // root holds the opaque bg + ambient layer; screen stays transparent so the aura shows through.
  root: { flex: 1, backgroundColor: colors.bg0 },
  screen: { flex: 1, paddingHorizontal: space.lg },
  section: {
    ...typeScale.overline,
    marginTop: 28,
    marginBottom: 10,
  },
  card: {
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: border.thin,
    borderColor: colors.line,
    overflow: 'hidden',
    padding: space.lg,
  },
  cardEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: colors.edgeHi },
  cardRail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: border.rail },
  cardEyebrow: { ...typeScale.overline, marginBottom: space.sm },
  // Skin-delegated Card: HudPanel owns the chrome, Card only contributes its content padding.
  cardPad: { padding: space.lg },
  button: {
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: 15, fontWeight: '600', letterSpacing: tracking.cta },
  buttonLabelCompact: { ...typeScale.label },
  // Skin CTA 'skew': the surface leans, the label stays upright (counter-transform).
  buttonSkew: { transform: [{ skewX: '-8deg' }] },
  buttonUnskew: { transform: [{ skewX: '8deg' }] },
  // Spacing is owned by the container row (gap: space.sm) — no marginRight here, or gap rows double-space.
  pill: {
    height: 30,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: border.thin,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: { ...typeScale.label, color: colors.text2 },
  iconSquare: {
    borderRadius: radius.md,
    borderWidth: border.thin,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: { fontSize: 18, color: colors.text2 },
  input: {
    height: 46,
    borderRadius: radius.md,
    borderWidth: border.thin,
    borderColor: colors.line,
    backgroundColor: colors.recess,
    paddingHorizontal: space.md,
    fontSize: 15,
    fontWeight: '400',
    color: colors.text,
  },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.recess, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 3 },
  trackSkew: { transform: [{ skewX: '-14deg' }] },
  trackNotch: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  trackDual: { height: 2, marginTop: 3, borderRadius: 1, overflow: 'hidden' },
  trackDualFill: { height: '100%', opacity: 0.55 },
  liveHalo: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  metricRow: { flexDirection: 'row', alignItems: 'flex-end' },
  metricUnit: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    letterSpacing: tracking.overline,
    textTransform: 'uppercase',
  },
  muted: { ...typeScale.caption, color: colors.text2 },
});
