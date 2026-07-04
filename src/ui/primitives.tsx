import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, fontSize, radius, space } from './theme/tokens';

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

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function NeonButton({
  label,
  onPress,
  color = colors.cyan,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
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
        { borderColor: color, shadowColor: color, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      <Text style={[styles.buttonLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Pill({
  label,
  active = false,
  onPress,
  color = colors.cyan,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled: !onPress }}
      // Compact pill visuals + expanded touch target: ~31pt tall / ~33pt wide (digit pills) → ≥44pt per Apple HIG.
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ pressed }) => [
        styles.pill,
        {
          borderColor: active ? color : colors.line,
          backgroundColor: active ? color : 'transparent',
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <Text style={[styles.pillLabel, { color: active ? colors.bg : colors.textDim }]}>{label}</Text>
    </Pressable>
  );
}

export function Muted({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  // root holds the opaque bg + ambient layer; screen stays transparent so the aura shows through.
  root: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1, paddingHorizontal: space.lg },
  section: {
    color: colors.textDim,
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
  },
  button: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  buttonLabel: { fontSize: fontSize.md, fontWeight: '800', letterSpacing: 1 },
  // Spacing is owned by the container row (gap: space.sm) — no marginRight here, or gap rows double-space.
  pill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: space.xs + 2,
    paddingHorizontal: space.md,
  },
  pillLabel: { fontSize: fontSize.sm, fontWeight: '700' },
  muted: { color: colors.textDim, fontSize: fontSize.sm },
});
