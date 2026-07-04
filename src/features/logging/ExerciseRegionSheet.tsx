import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ExerciseRow } from '@/db/types';
import { Muted } from '@/ui/primitives';
import { colors, radius, space, typeScale } from '@/ui/theme/tokens';

export interface RegionPicker {
  title: string;
  exerciseIds: string[];
}

/**
 * Bottom sheet listing the exercises for a tapped body region (or cardio). Tap → onSelect.
 * MONOLITH: 52pt body-text rows, hairline separators, text3 chevron; pressed = surface-step.
 */
export function ExerciseRegionSheet({
  picker,
  onSelect,
  onClose,
}: {
  picker: RegionPicker | null;
  onSelect: (exercise: ExerciseRow) => void;
  onClose: () => void;
}) {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<ExerciseRow[]>([]);
  const idsKey = picker ? picker.exerciseIds.join(',') : '';

  useEffect(() => {
    if (!picker || picker.exerciseIds.length === 0) {
      return; // modal hidden when picker is null; stale rows aren't shown
    }
    let alive = true;
    const ids = picker.exerciseIds;
    (async () => {
      const r = await db.getAllAsync<ExerciseRow>(
        `SELECT * FROM exercise WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids,
      );
      if (!alive) return;
      // preserve the explicit region order
      setRows(ids.map((id) => r.find((x) => x.id === id)).filter(Boolean) as ExerciseRow[]);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, idsKey]);

  return (
    <Modal visible={!!picker} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(space.lg, insets.bottom) }]}>
        <View pointerEvents="none" style={styles.sheetEdge} />
        {picker ? (
          <>
            <View style={styles.grabber} />
            <Text style={styles.title}>{picker.title}</Text>
            <FlatList
              data={rows}
              keyExtractor={(e) => e.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: space.sm }}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  onPress={() => onSelect(item)}
                >
                  <View style={styles.rowBody}>
                    <Text style={styles.exName}>{t(`exercise.${item.id}`)}</Text>
                    <Muted>
                      {item.is_bodyweight ? t('logger.exerciseMeta.bodyweightPrefix') : ''}
                      {t('logger.exerciseMeta.repRange', { low: item.rep_low, high: item.rep_high })}
                    </Muted>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Muted style={{ paddingVertical: space.lg }}>{t('logger.exerciseListEmpty')}</Muted>}
            />
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Muted>{t('logger.close')}</Muted>
            </Pressable>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  sheet: {
    maxHeight: '70%',
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
  title: { ...typeScale.title, color: colors.text, marginBottom: space.xs },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingVertical: space.sm,
  },
  rowPressed: { backgroundColor: colors.surface2 },
  rowBody: { flex: 1, justifyContent: 'center' },
  exName: { ...typeScale.body, color: colors.text },
  chevron: { fontSize: 18, lineHeight: 22, color: colors.text3 },
  closeBtn: { alignSelf: 'center', paddingVertical: space.md, marginTop: space.sm },
});
