import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CARDIO_EXERCISE_IDS, REGIONS, type BodyRegionId } from '@/features/character/regions';
import { Muted } from '@/ui/primitives';
import { colors, fontSize, radius, space } from '@/ui/theme/tokens';

const REGION_ORDER: BodyRegionId[] = ['chest', 'shoulders', 'back', 'arms', 'core', 'legs'];

/**
 * Tap-to-add exercise picker for the program editor. Pure (no DB): names come from i18n and the
 * slot targets are seeded from the exercise catalog later. Strength days pick from the body-region
 * groups; cardio days pick from the cardio modalities.
 */
export function ProgramExercisePicker({
  visible,
  mode,
  existingIds,
  onPick,
  onClose,
}: {
  visible: boolean;
  mode: 'strength' | 'cardio';
  existingIds: string[];
  onPick: (exerciseId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const taken = new Set(existingIds);

  const renderRow = (id: string) => {
    const already = taken.has(id);
    return (
      <Pressable
        key={id}
        accessibilityRole="button"
        accessibilityLabel={t(`exercise.${id}`)}
        accessibilityState={{ disabled: already }}
        disabled={already}
        onPress={() => onPick(id)}
        style={({ pressed }) => [styles.row, already && styles.rowTaken, pressed && !already ? styles.rowPressed : null]}
      >
        <Text style={[styles.exName, already && styles.exNameTaken]}>{t(`exercise.${id}`)}</Text>
        {already ? <Muted>{t('programEditor.alreadyAdded')}</Muted> : <Text style={styles.add}>+</Text>}
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('logger.close')} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t('programEditor.pickerTitle')}</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.lg }}>
          {mode === 'cardio'
            ? CARDIO_EXERCISE_IDS.map((id) => renderRow(id))
            : REGION_ORDER.map((region) => (
                <View key={region} style={styles.group}>
                  <Text style={styles.groupTitle}>{t(`region.${region}`)}</Text>
                  {REGIONS[region].exerciseIds.map((id) => renderRow(id))}
                </View>
              ))}
        </ScrollView>
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8} accessibilityRole="button">
          <Muted>{t('logger.close')}</Muted>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000AA' },
  sheet: {
    maxHeight: '78%',
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
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '900', marginBottom: space.sm },
  group: { marginBottom: space.md },
  groupTitle: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: space.xs },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: space.sm,
  },
  rowPressed: { opacity: 0.6 },
  rowTaken: { opacity: 0.4 },
  exName: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  exNameTaken: { color: colors.textDim },
  add: { color: colors.cyan, fontSize: 26, fontWeight: '900', lineHeight: 28 },
  closeBtn: { alignSelf: 'center', paddingVertical: space.md, marginTop: space.xs },
});
