import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRecentExercises } from '@/db/repos/setLogRepo';
import type { ExerciseRow, ExerciseType } from '@/db/types';
import {
  buildExerciseDiscoveryItems,
  discoverExercises,
  type ExerciseDiscoveryItem,
  type RecentExerciseSet,
} from '@/features/exercises/discovery';
import {
  rankRegionRecommendations,
  regionsForMuscleGroup,
  type RegionRecommendationReason,
  type TrainingRegion,
} from '@/features/exercises/regionRecommendations';
import { formatWeight } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { Input, Muted } from '@/ui/primitives';
import { colors, radius, space, typeScale } from '@/ui/theme/tokens';

export interface RegionPicker {
  title: string;
  /** Curated empty-state order. Search intentionally expands beyond this list. */
  exerciseIds?: readonly string[];
  /** Optional hard boundary; inferred from exerciseIds for existing body-map callers. */
  type?: ExerciseType;
  /** Avatar body region. Empty-query results become today → recent → full regional catalog. */
  region?: TrainingRegion;
  /** Today's program order, used only when region is present. */
  programExerciseIds?: readonly string[];
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
  const [recentSets, setRecentSets] = useState<RecentExerciseSet[]>([]);
  const [query, setQuery] = useState('');
  const pendingSelection = useRef<ExerciseRow | null>(null);
  const unitSystem = useSettingsStore((state) => state.unitSystem);
  const visible = picker != null;

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    (async () => {
      const catalog = await db.getAllAsync<ExerciseRow>('SELECT * FROM exercise');
      const recents = await getRecentExercises(db, Math.max(1, catalog.length));
      if (!alive) return;
      setRows(catalog);
      setRecentSets(recents);
    })().catch(() => {
      if (!alive) return;
      setRows([]);
      setRecentSets([]);
    });
    return () => {
      alive = false;
    };
  }, [db, visible]);

  const items = useMemo(
    () =>
      buildExerciseDiscoveryItems(
        rows,
        (exercise) => t(`exercise.${exercise.id}`, { defaultValue: exercise.name }),
        recentSets,
        (exercise) => {
          const regions = regionsForMuscleGroup(exercise.muscle_group);
          if (regions.length > 0) return regions.map((region) => t(`region.${region}`));
          if (exercise.type === 'cardio') return [t('today.cardioSheetTitle')];
          return [];
        },
      ),
    [recentSets, rows, t],
  );
  const regionRank = useMemo(
    () =>
      picker?.region
        ? rankRegionRecommendations({
            catalog: rows,
            region: picker.region,
            recentSets,
            programExerciseIds: picker.programExerciseIds,
          })
        : [],
    [picker, recentSets, rows],
  );
  const recommendationReason = useMemo(
    () => new Map(regionRank.map(({ exercise, reason }) => [exercise.id, reason] as const)),
    [regionRank],
  );
  const visibleItems = useMemo(
    () => {
      if (!picker) return [];
      if (picker.region && query.trim().length === 0) {
        const byId = new Map(items.map((item) => [item.exercise.id, item] as const));
        return regionRank.flatMap(({ exercise }) => {
          const item = byId.get(exercise.id);
          return item ? [item] : [];
        });
      }
      return discoverExercises(items, {
        query,
        explicitIds: picker.exerciseIds,
        type: picker.type,
      });
    },
    [items, picker, query, regionRank],
  );

  const deliverSelection = useCallback(() => {
    const exercise = pendingSelection.current;
    pendingSelection.current = null;
    if (exercise) onSelect(exercise);
  }, [onSelect]);

  const close = () => {
    pendingSelection.current = null;
    setQuery('');
    onClose();
  };

  const select = (item: ExerciseDiscoveryItem) => {
    pendingSelection.current = item.exercise;
    setQuery('');
    onClose();
    // iOS reports the end of the native slide animation via onDismiss. Android removes a hidden
    // Modal on the next render, so defer selection one frame there. Either path guarantees the
    // logger Modal never mounts on top of the picker Modal.
    if (Platform.OS !== 'ios') requestAnimationFrame(deliverSelection);
  };

  const exerciseMeta = (item: ExerciseDiscoveryItem): string => {
    const reason = recommendationReason.get(item.exercise.id);
    const reasonPrefix = (value: RegionRecommendationReason | undefined): string | null => {
      if (value === 'today') return t('exerciseDiscovery.reason.today');
      if (value === 'recent') return t('exerciseDiscovery.reason.recent');
      return null;
    };
    if (item.recentSet) {
      const weight = formatWeight(item.recentSet.weight, unitSystem);
      const set = `${weight ? `${weight} × ` : ''}${item.recentSet.reps}`;
      const meta = t('logger.lastSet', { set });
      const prefix = reasonPrefix(reason);
      return prefix ? `${prefix} · ${meta}` : meta;
    }
    const exercise = item.exercise;
    if (exercise.type === 'cardio') return t('exerciseDiscovery.cardioMeta');
    const meta = `${exercise.is_bodyweight ? t('logger.exerciseMeta.bodyweightPrefix') : ''}${t(
      'logger.exerciseMeta.repRange',
      { low: exercise.rep_low, high: exercise.rep_high },
    )}`;
    const prefix = reasonPrefix(reason);
    return prefix ? `${prefix} · ${meta}` : meta;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      onDismiss={deliverSelection}
    >
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={[styles.sheet, { paddingBottom: Math.max(space.lg, insets.bottom) }]}>
        <View pointerEvents="none" style={styles.sheetEdge} />
        {picker ? (
          <>
            <View style={styles.grabber} />
            <Text style={styles.title}>{picker.title}</Text>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder={t('exerciseDiscovery.searchPlaceholder')}
              accessibilityLabel={t('exerciseDiscovery.searchPlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus={picker.exerciseIds == null && picker.type == null}
              returnKeyType="search"
              style={styles.search}
            />
            <FlatList
              data={visibleItems}
              keyExtractor={(item) => item.exercise.id}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingVertical: space.sm }}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.localizedName}. ${exerciseMeta(item)}`}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  onPress={() => select(item)}
                >
                  <View style={styles.rowBody}>
                    <Text style={styles.exName}>{item.localizedName}</Text>
                    <Muted>{exerciseMeta(item)}</Muted>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Muted style={{ paddingVertical: space.lg }}>{t('logger.exerciseListEmpty')}</Muted>}
            />
            <Pressable onPress={close} style={styles.closeBtn} hitSlop={8}>
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
  search: { marginTop: space.sm, marginBottom: space.xs },
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
