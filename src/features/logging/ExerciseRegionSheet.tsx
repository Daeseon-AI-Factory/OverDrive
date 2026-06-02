import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ExerciseRow } from '@/db/types';
import { Muted } from '@/ui/primitives';
import { colors, fontSize, radius, space } from '@/ui/theme/tokens';

export interface RegionPicker {
  title: string;
  exerciseIds: string[];
}

/** Bottom sheet listing the exercises for a tapped body region (or cardio). Tap → onSelect. */
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
      <View style={styles.sheet}>
        {picker ? (
          <>
            <View style={styles.handle} />
            <Text style={styles.title}>{picker.title}</Text>
            <FlatList
              data={rows}
              keyExtractor={(e) => e.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: space.sm }}
              renderItem={({ item }) => (
                <Pressable style={styles.row} onPress={() => onSelect(item)}>
                  <Text style={styles.exName}>{t(`exercise.${item.id}`)}</Text>
                  <Muted>
                    {item.is_bodyweight ? t('logger.exerciseMeta.bodyweightPrefix') : ''}
                    {t('logger.exerciseMeta.repRange', { low: item.rep_low, high: item.rep_high })}
                  </Muted>
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
  backdrop: { flex: 1, backgroundColor: '#000000AA' },
  sheet: {
    maxHeight: '70%',
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
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '900', marginBottom: space.xs },
  row: {
    minHeight: 56,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: space.sm,
  },
  exName: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  closeBtn: { alignSelf: 'center', paddingVertical: space.md, marginTop: space.sm },
});
