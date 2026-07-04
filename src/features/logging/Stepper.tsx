import { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Metric, useAccent } from '@/ui/primitives';
import {
  border,
  colors,
  hangulSafeLetterSpacing,
  liveTextGlow,
  numType,
  radius,
  space,
  tracking,
  typeScale,
} from '@/ui/theme/tokens';

interface StepperProps {
  value: number;
  step: number;
  min?: number;
  max?: number;
  precision?: number;
  unit?: string;
  label: string;
  onChange: (v: number) => void;
}

const roundTo = (v: number, precision: number) => {
  const f = 10 ** precision;
  return Math.round(v * f) / f;
};

/**
 * +/- stepper with long-press acceleration — the core of "kill the keyboard". Tap = one step
 * (fires on release, so a scroll that starts on a button never mutates the value); hold = ramps
 * faster and doubles the step, so 20→100kg is a short hold, not 16 taps.
 * Tap the center value (✎) to type it in directly; ✓ or blur commits — needed because the iOS
 * numeric pad has no return key.
 *
 * MONOLITH: +/− are 44×44 machined icon-squares (styled locally, not the IconSquare primitive,
 * because acceleration needs onLongPress/onPressOut); the value is an Orbitron numLarge Metric
 * with a seated unit micro-label. While typing, the value takes the soft accent glow — the ONE
 * sanctioned live-stepper glow (slot 2 of the screen's budget).
 */
export function Stepper({ value, step, min = 0, max = 9999, precision = 0, unit, label, onChange }: StepperProps) {
  const accent = useAccent();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticks = useRef(0);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const bump = (dir: 1 | -1) => {
    ticks.current += 1;
    const mult = ticks.current > 10 ? 2 : 1;
    onChange(clamp(roundTo(valueRef.current + dir * step * mult, precision)));
    if (ticks.current % 3 === 0) {
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    ticks.current = 0;
  };

  const start = (dir: 1 | -1) => {
    stop();
    bump(dir);
    const schedule = () => {
      const t = ticks.current;
      const delay = t < 5 ? 340 : t < 10 ? 200 : t < 18 ? 120 : 80;
      timer.current = setTimeout(() => {
        bump(dir);
        schedule();
      }, delay);
    };
    schedule();
  };

  useEffect(() => stop, []);

  const commitText = () => {
    const n = Number(text);
    // Empty string coerces to 0 — never commit it (it would slam the value to `min`).
    if (text.trim() !== '' && Number.isFinite(n)) onChange(clamp(roundTo(n, precision)));
    setEditing(false);
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { letterSpacing: hangulSafeLetterSpacing(label, tracking.overline) }]}>
        {label}
      </Text>
      <View style={styles.row}>
        {/* onPress (release) for the single step — onPressIn fired on touch-down, so starting a
            scroll on the button silently changed the value. Hold ramps via onLongPress. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => bump(-1)}
          onLongPress={() => start(-1)}
          onPressOut={stop}
          delayLongPress={250}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          hitSlop={8}
        >
          <Text style={styles.btnGlyph}>−</Text>
        </Pressable>

        {editing ? (
          <View style={styles.editRow}>
            <TextInput
              autoFocus
              accessibilityLabel={label}
              value={text}
              onChangeText={setText}
              onBlur={commitText}
              onSubmitEditing={commitText}
              keyboardType="numeric"
              style={[styles.valueInput, liveTextGlow(accent)]}
            />
            {/* Explicit Done — the iOS numeric pad has no return key, so onSubmitEditing alone is unreachable. */}
            <Pressable
              accessibilityRole="button"
              onPress={commitText}
              style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
              hitSlop={8}
            >
              <Text style={styles.btnGlyph}>✓</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => {
              setText(value.toFixed(precision));
              setEditing(true);
            }}
            style={styles.valueWrap}
          >
            <Metric
              value={value.toFixed(precision)}
              unit={unit}
              size="large"
              unitStyle={
                unit ? { letterSpacing: hangulSafeLetterSpacing(unit, tracking.overline) } : undefined
              }
            />
            <Text style={styles.editHint}>✎</Text>
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => bump(1)}
          onLongPress={() => start(1)}
          onPressOut={stop}
          delayLongPress={250}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          hitSlop={8}
        >
          <Text style={styles.btnGlyph}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.lg },
  label: { ...typeScale.overline, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Local IconSquare visuals (44×44 machined block) — pressed = surface-step, never scale/bounce.
  btn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: border.thin,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: { backgroundColor: colors.surface3 },
  // 22pt glyph for mid-set taps (sanctioned stepper-glyph exception to the 400/600 rule).
  btnGlyph: { fontSize: 22, fontWeight: '800', lineHeight: 26, color: colors.text2 },
  valueWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  editHint: { ...typeScale.caption, color: colors.text3, marginLeft: space.xs },
  editRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm },
  valueInput: {
    flex: 1,
    textAlign: 'center',
    ...numType.large,
    color: colors.text,
    paddingVertical: 0,
  },
});
