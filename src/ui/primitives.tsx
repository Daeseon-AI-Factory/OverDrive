// MONOLITH primitives — a matte-black machined chassis where exactly ONE thing is powered on:
// the persona accent. Depth = surface steps + a 1pt top edge-highlight, never shadows
// (shadowOpacity 0 / elevation 0 everywhere). NO Skia here — Skia lives exclusively in
// AmbientAura + JuiceOverlay (spec §6: logging speed > 화려함); every primitive is plain Views.

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
  return (
    <View style={styles.root}>
      {background}
      <SafeAreaView style={[styles.screen, style]}>{children}</SafeAreaView>
    </View>
  );
}

/** Overline section header — pure text3, no accent, no rules/ticks. Korean strings get ≤0.5 tracking. */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  const letterSpacing =
    typeof children === 'string' ? hangulSafeLetterSpacing(children, tracking.overline) : tracking.overline;
  return <Text style={[styles.section, { letterSpacing }]}>{children}</Text>;
}

/**
 * Card — 3-layer machined panel: surface1 body + 1pt `line` border + 1pt top edge-highlight
 * (light falling on the top edge). `live` marks THE one alive card per screen with a 2pt accent
 * rail and flips the `eyebrow` overline to accent. No shadows, no colored borders.
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
  const accent = useAccent();
  return (
    <View style={[styles.card, style]}>
      <View pointerEvents="none" style={styles.cardEdge} />
      {live ? <View pointerEvents="none" style={[styles.cardRail, { backgroundColor: accent.solid }]} /> : null}
      {eyebrow != null ? (
        <Text
          style={[
            styles.cardEyebrow,
            { letterSpacing: hangulSafeLetterSpacing(eyebrow, tracking.overline) },
            live && { color: accent.solid },
          ]}
        >
          {eyebrow}
        </Text>
      ) : null}
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
  const accent = useAccent();
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
        active && { backgroundColor: accent.fill, borderColor: accent.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.pillLabel, active && { color: accent.solid }]}>{label}</Text>
    </Pressable>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/**
 * The button. `primary` (solid accent) is THE one CTA per screen — log set / finish session.
 * `secondary` = accent tint-fill; `ghost` = neutral surface for demote-able actions. Pressed
 * state is a surface-step/opacity change only — no scale/bounce, no shadows.
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
  const accent = useAccent();
  const height = compact ? 36 : 48;
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
        variant === 'primary' && { backgroundColor: accent.solid },
        variant === 'secondary' && {
          backgroundColor: pressed ? accent.fillActive : accent.fill,
          borderWidth: border.thin,
          borderColor: accent.border,
        },
        variant === 'ghost' && {
          backgroundColor: pressed ? colors.surface3 : colors.surface2,
          borderWidth: border.thin,
          borderColor: colors.line,
        },
        disabled && { opacity: 0.35 },
        !disabled && pressed && variant === 'primary' && { opacity: 0.85 },
        style,
      ]}
    >
      <Text
        style={[
          compact ? styles.buttonLabelCompact : styles.buttonLabel,
          { color: variant === 'primary' ? colors.bg0 : variant === 'secondary' ? accent.solid : colors.text2 },
        ]}
      >
        {label}
      </Text>
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
  const size = compact ? 44 : 48;
  const blocked = disabled || busy;
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
        tone === 'danger' && { backgroundColor: colors.danger, borderColor: colors.danger },
        pressed && (tone === 'danger' ? { opacity: 0.85 } : { backgroundColor: colors.surface3 }),
        busy && { opacity: 0.4 },
        disabled && !busy && { opacity: 0.35 },
        style,
      ]}
    >
      <Text style={[styles.iconGlyph, tone === 'danger' && { color: colors.flash }, glyphStyle]}>{glyph}</Text>
    </Pressable>
  );
}

/** Text input — a recess: darker than the card it sits in (inputs go DOWN). Focus = accent border, no glow. */
export const Input = React.forwardRef<TextInput, TextInputProps>(function Input(
  { style, onFocus, onBlur, ...rest },
  ref,
) {
  const accent = useAccent();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.text3}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[styles.input, style, focused && { borderColor: accent.border }]}
    />
  );
});

/**
 * 6pt progress bar — recess track, accent fill; the fill flips to semantic green at 100%
 * (completion = achieved status, anti-shame §9).
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
  const accent = useAccent();
  const clamped = Math.max(0, Math.min(1, progress));
  const done = complete ?? clamped >= 1;
  return (
    <View style={[styles.track, style]}>
      <View
        style={[
          styles.trackFill,
          { width: `${clamped * 100}%`, backgroundColor: done ? colors.positive : accent.solid },
        ]}
      />
    </View>
  );
}

/**
 * Live indicator — 6×6 accent dot inside a 14×14 fillActive halo (cross-platform fake glow; works
 * on Android where shadowColor does nothing). Pair with an accent overline like '진행 중'.
 * Counts as glow slot 2 of 2 on a screen.
 */
export function LiveDot({ style }: { style?: StyleProp<ViewStyle> }) {
  const accent = useAccent();
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
 */
export function Metric({
  value,
  unit,
  size = 'mid',
  color = colors.text,
  unitColor = colors.text3,
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
  const seat = UNIT_SEAT[size];
  return (
    <View style={[styles.metricRow, style]}>
      <Text style={[numType[size], { color }, valueStyle]}>{value}</Text>
      {unit != null ? (
        <Text
          style={[
            styles.metricUnit,
            { color: unitColor, paddingBottom: seat.paddingBottom, marginLeft: seat.marginLeft },
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
  return <Text style={[styles.muted, style]}>{children}</Text>;
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
  button: {
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: 15, fontWeight: '600', letterSpacing: tracking.cta },
  buttonLabelCompact: { ...typeScale.label },
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
