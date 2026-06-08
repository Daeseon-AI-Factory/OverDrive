import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { GoalUnit } from '@/db/types';
import { Muted, NeonButton, Pill } from '@/ui/primitives';
import { colors, fontSize, radius, space } from '@/ui/theme/tokens';
import { Stepper } from '@/features/logging/Stepper';

const UNITS: GoalUnit[] = ['reps', 'sets', 'sec', 'min', 'm', 'km'];

// Quick-pick suggestions (burpees, farmer's walk, …) — fill label + a sensible unit/target in one tap.
const SUGGESTIONS: { key: string; unit: GoalUnit; target: number }[] = [
  { key: 'burpee', unit: 'reps', target: 50 },
  { key: 'pushup', unit: 'reps', target: 50 },
  { key: 'pullup', unit: 'reps', target: 20 },
  { key: 'squat', unit: 'reps', target: 50 },
  { key: 'lunge', unit: 'reps', target: 40 },
  { key: 'plank', unit: 'sec', target: 60 },
  { key: 'farmersWalk', unit: 'sets', target: 3 },
  { key: 'run', unit: 'km', target: 3 },
];

const stepFor = (u: GoalUnit) => (u === 'sec' || u === 'm' ? 10 : u === 'reps' ? 5 : 1);

export function DailyGoalEditorSheet({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (input: { label: string; unit: GoalUnit; target: number }) => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');
  const [unit, setUnit] = useState<GoalUnit>('reps');
  const [target, setTarget] = useState(20);

  const resetAndClose = () => {
    setLabel('');
    setUnit('reps');
    setTarget(20);
    onClose();
  };

  const submit = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onAdd({ label: trimmed, unit, target: Math.max(1, target) });
    resetAndClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={resetAndClose}>
      <Pressable style={styles.backdrop} onPress={resetAndClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t('goals.editor.title')}</Text>

        <Muted style={{ marginTop: space.xs }}>{t('goals.editor.suggest')}</Muted>
        <View style={styles.wrapRow}>
          {SUGGESTIONS.map((s) => (
            <Pill
              key={s.key}
              label={t(`goals.suggest.${s.key}`)}
              color={colors.violet}
              onPress={() => {
                setLabel(t(`goals.suggest.${s.key}`));
                setUnit(s.unit);
                setTarget(s.target);
              }}
            />
          ))}
        </View>

        <Text style={styles.fieldLabel}>{t('goals.editor.label')}</Text>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder={t('goals.editor.labelPlaceholder')}
          placeholderTextColor={colors.textDim}
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>{t('goals.editor.unit')}</Text>
        <View style={styles.wrapRow}>
          {UNITS.map((u) => (
            <Pill key={u} label={t(`goals.unit.${u}`)} active={unit === u} color={colors.cyan} onPress={() => setUnit(u)} />
          ))}
        </View>

        <Stepper
          label={t('goals.editor.target')}
          value={target}
          step={stepFor(unit)}
          min={1}
          max={100000}
          precision={0}
          unit={t(`goals.unit.${unit}`)}
          onChange={setTarget}
        />

        <NeonButton
          label={t('goals.editor.add')}
          color={colors.energyHi}
          disabled={!label.trim()}
          onPress={submit}
          style={{ marginTop: space.lg }}
        />
        <Pressable onPress={resetAndClose} style={styles.closeBtn} hitSlop={8}>
          <Muted>{t('goals.editor.cancel')}</Muted>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000AA' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    paddingTop: space.sm,
  },
  handle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.md },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '900' },
  fieldLabel: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '700', marginTop: space.lg, marginBottom: 6 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  input: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  closeBtn: { alignSelf: 'center', paddingVertical: space.md, marginTop: space.sm },
});
