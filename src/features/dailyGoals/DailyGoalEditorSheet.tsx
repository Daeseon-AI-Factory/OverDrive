import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GoalUnit } from '@/db/types';
import { Button, Input, Muted, Pill } from '@/ui/primitives';
import { colors, hangulSafeLetterSpacing, radius, space, tracking, typeScale } from '@/ui/theme/tokens';
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
  const insets = useSafeAreaInsets();
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

  const fieldLabel = (text: string) => (
    <Text style={[styles.fieldLabel, { letterSpacing: hangulSafeLetterSpacing(text, tracking.overline) }]}>
      {text}
    </Text>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={resetAndClose}>
      <Pressable style={styles.backdrop} onPress={resetAndClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(space.lg, insets.bottom) }]}>
        <View pointerEvents="none" style={styles.sheetEdge} />
        <View style={styles.grabber} />
        <Text style={styles.title}>{t('goals.editor.title')}</Text>

        {fieldLabel(t('goals.editor.suggest'))}
        <View style={styles.wrapRow}>
          {SUGGESTIONS.map((s) => (
            <Pill
              key={s.key}
              label={t(`goals.suggest.${s.key}`)}
              onPress={() => {
                setLabel(t(`goals.suggest.${s.key}`));
                setUnit(s.unit);
                setTarget(s.target);
              }}
            />
          ))}
        </View>

        {fieldLabel(t('goals.editor.label'))}
        <Input
          value={label}
          onChangeText={setLabel}
          placeholder={t('goals.editor.labelPlaceholder')}
          accessibilityLabel={t('goals.editor.label')}
        />

        {fieldLabel(t('goals.editor.unit'))}
        <View style={styles.wrapRow}>
          {UNITS.map((u) => (
            <Pill key={u} label={t(`goals.unit.${u}`)} active={unit === u} onPress={() => setUnit(u)} />
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

        <Button
          label={t('goals.editor.add')}
          variant="primary"
          disabled={!label.trim()}
          onPress={submit}
          style={{ marginTop: space.xl }}
        />
        <Pressable onPress={resetAndClose} style={styles.closeBtn} hitSlop={8}>
          <Muted>{t('goals.editor.cancel')}</Muted>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  sheet: {
    backgroundColor: colors.surface1,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden',
    paddingHorizontal: space.lg,
  },
  sheetEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: colors.edgeHi },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  title: { ...typeScale.title, color: colors.text },
  fieldLabel: { ...typeScale.overline, marginTop: space.xl, marginBottom: space.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  closeBtn: { alignSelf: 'center', paddingVertical: space.md, marginTop: space.sm },
});
