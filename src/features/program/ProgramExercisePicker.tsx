import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CARDIO_EXERCISE_IDS, REGIONS, type BodyRegionId } from '@/features/character/regions';
import { Muted } from '@/ui/primitives';
import { colors, hangulSafeLetterSpacing, radius, space, tracking, typeScale } from '@/ui/theme/tokens';

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
  const insets = useSafeAreaInsets();
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

  const groupTitle = (label: string) => (
    <Text style={[styles.groupTitle, { letterSpacing: hangulSafeLetterSpacing(label, tracking.overline) }]}>{label}</Text>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('logger.close')} />
      {/* Opaque surface1 sheet (no translucency over scroll content) + top edge-highlight + grabber. */}
      <View style={[styles.sheet, { paddingBottom: Math.max(space.lg, insets.bottom) }]}>
        <View pointerEvents="none" style={styles.sheetEdge} />
        <View style={styles.grabber} />
        <Text style={styles.title}>{t('programEditor.pickerTitle')}</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.lg }}>
          {mode === 'cardio'
            ? CARDIO_EXERCISE_IDS.map((id) => renderRow(id))
            : REGION_ORDER.map((region) => (
                <View key={region} style={styles.group}>
                  {groupTitle(t(`region.${region}`))}
                  {REGIONS[region].exerciseIds.map((id) => renderRow(id))}
                </View>
              ))}
        </ScrollView>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Muted>{t('logger.close')}</Muted>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  sheet: {
    maxHeight: '78%',
    backgroundColor: colors.surface1,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden',
    paddingHorizontal: space.lg,
  },
  // 1pt light falling on the sheet's machined top edge.
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
  title: { ...typeScale.title, color: colors.text, marginBottom: space.sm },
  group: { marginBottom: space.md },
  // letterSpacing applied per-string (Hangul-safe) at the call site.
  groupTitle: { ...typeScale.overline, marginBottom: space.xs },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingVertical: space.sm,
  },
  rowPressed: { opacity: 0.6 },
  rowTaken: { opacity: 0.4 },
  exName: { ...typeScale.body, color: colors.text },
  exNameTaken: { color: colors.text3 },
  // Add affordance is chrome, not signal — monochrome (accent marks what is alive, not what is tappable).
  add: { color: colors.text3, fontSize: 22, fontWeight: '400', lineHeight: 24 },
  closeBtn: { alignSelf: 'center', paddingVertical: space.md, marginTop: space.xs },
});
