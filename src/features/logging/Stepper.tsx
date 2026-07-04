import { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, numberFamily, space } from '@/ui/theme/tokens';

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
 */
export function Stepper({ value, step, min = 0, max = 9999, precision = 0, unit, label, onChange }: StepperProps) {
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
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {/* onPress (release) for the single step — onPressIn fired on touch-down, so starting a
            scroll on the button silently changed the value. Hold ramps via onLongPress. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => bump(-1)}
          onLongPress={() => start(-1)}
          onPressOut={stop}
          delayLongPress={250}
          style={styles.btn}
          hitSlop={8}
        >
          <Text style={styles.btnText}>−</Text>
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
              style={styles.valueInput}
            />
            {/* Explicit Done — the iOS numeric pad has no return key, so onSubmitEditing alone is unreachable. */}
            <Pressable accessibilityRole="button" onPress={commitText} style={styles.doneBtn} hitSlop={8}>
              <Text style={styles.doneText}>✓</Text>
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
            <Text style={styles.value}>
              {value.toFixed(precision)}
              {unit ? <Text style={styles.unit}> {unit}</Text> : null}
              <Text style={styles.editHint}> ✎</Text>
            </Text>
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => bump(1)}
          onLongPress={() => start(1)}
          onPressOut={stop}
          delayLongPress={250}
          style={styles.btn}
          hitSlop={8}
        >
          <Text style={styles.btnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.md },
  label: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '700', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btn: {
    width: 56,
    height: 56,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  btnText: { color: colors.cyan, fontSize: 28, fontWeight: '900', lineHeight: 30 },
  valueWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  value: { color: colors.text, fontFamily: numberFamily, fontSize: 40, fontWeight: '900' },
  unit: { color: colors.textDim, fontSize: fontSize.md, fontWeight: '700' },
  editHint: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '700' },
  editRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm },
  valueInput: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontFamily: numberFamily,
    fontSize: 40,
    fontWeight: '900',
    paddingVertical: 0,
  },
  doneBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  doneText: { color: colors.success, fontSize: 20, fontWeight: '900', lineHeight: 22 },
});
