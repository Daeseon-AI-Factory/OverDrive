import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRecentExercises } from '@/db/repos/setLogRepo';
import type { ExerciseType } from '@/db/types';
import { readCatalogViews } from '@/features/exercises/catalog/service';
import { supportsCurrentLogger } from '@/features/exercises/catalog/loggingSupport';
import {
  appLocaleToCatalogLocale,
  type CatalogExerciseSelection,
  type CatalogExerciseView,
} from '@/features/exercises/catalog/types';
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
  onSelect: (selection: CatalogExerciseSelection) => void;
  onClose: () => void;
}) {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [catalogViews, setCatalogViews] = useState<CatalogExerciseView[]>([]);
  const [recentSets, setRecentSets] = useState<RecentExerciseSet[]>([]);
  const [query, setQuery] = useState('');
  const pendingSelection = useRef<CatalogExerciseSelection | null>(null);
  const unitSystem = useSettingsStore((state) => state.unitSystem);
  const appLocale = useSettingsStore((state) => state.locale);
  const catalogLocale = appLocaleToCatalogLocale(appLocale);
  const visible = picker != null;
  const rows = useMemo(() => catalogViews.map((view) => view.exercise), [catalogViews]);
  const catalogByExerciseId = useMemo(
    () => new Map(catalogViews.map((view) => [view.exercise.id, view.catalog] as const)),
    [catalogViews],
  );

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    const loadLocal = async () => {
      const result = await readCatalogViews(db);
      const recents = await getRecentExercises(db, Math.max(1, result.views.length));
      if (!alive) return;
      setCatalogViews(result.views);
      setRecentSets(recents);
    };
    void loadLocal()
      .catch(() => {
        // Keep the last known rows on screen. A cache read problem must not turn a usable picker
        // into an empty one merely because fallback work failed. Remote freshness is boot-owned so
        // opening a logger never starts a concurrent catalog write.
      });
    return () => {
      alive = false;
    };
  }, [db, visible]);

  const items = useMemo(
    () =>
      buildExerciseDiscoveryItems(
        rows,
        (exercise) =>
          catalogByExerciseId.get(exercise.id)?.localizations[catalogLocale].displayName ??
          t(`exercise.${exercise.id}`, { defaultValue: exercise.name }),
        recentSets,
        (exercise) => {
          const metadata = catalogByExerciseId.get(exercise.id);
          const regions = metadata
            ? [...metadata.primaryBodyRegions, ...metadata.secondaryBodyRegions]
            : regionsForMuscleGroup(exercise.muscle_group);
          if (regions.length > 0) return regions.map((region) => t(`region.${region}`));
          if (exercise.type === 'cardio') return [t('today.cardioSheetTitle')];
          return [];
        },
        (exercise) => catalogByExerciseId.get(exercise.id) ?? null,
        catalogLocale,
      ),
    [catalogByExerciseId, catalogLocale, recentSets, rows, t],
  );
  const regionRank = useMemo(
    () =>
      picker?.region
        ? rankRegionRecommendations({
            catalog: rows,
            region: picker.region,
            recentSets,
            programExerciseIds: picker.programExerciseIds,
            catalogFor: (exercise) => catalogByExerciseId.get(exercise.id) ?? null,
          })
        : [],
    [catalogByExerciseId, picker, recentSets, rows],
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
        programExerciseIds: picker.programExerciseIds,
      });
    },
    [items, picker, query, regionRank],
  );

  const deliverSelection = useCallback(() => {
    const selection = pendingSelection.current;
    pendingSelection.current = null;
    if (selection) onSelect(selection);
  }, [onSelect]);

  const close = () => {
    pendingSelection.current = null;
    setQuery('');
    onClose();
  };

  const select = (item: ExerciseDiscoveryItem) => {
    if (!supportsCurrentLogger(item.exercise, item.catalog)) return;
    pendingSelection.current = {
      exercise: item.exercise,
      catalog: item.catalog,
      localizedName: item.localizedName,
    };
    setQuery('');
    onClose();
    // iOS reports the end of the native slide animation via onDismiss. Android removes a hidden
    // Modal on the next render, so defer selection one frame there. Either path guarantees the
    // logger Modal never mounts on top of the picker Modal.
    if (Platform.OS !== 'ios') requestAnimationFrame(deliverSelection);
  };

  const exerciseMeta = (item: ExerciseDiscoveryItem): string => {
    if (!supportsCurrentLogger(item.exercise, item.catalog)) {
      return t('exerciseDiscovery.unsupportedTracking');
    }
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
    if ((item.catalog?.exerciseType ?? exercise.type) === 'cardio') return t('exerciseDiscovery.cardioMeta');
    const target = item.catalog?.defaultPrescription.target;
    const low = target?.unit === 'reps' ? target.low : exercise.rep_low;
    const high = target?.unit === 'reps' ? target.high : exercise.rep_high;
    const bodyweight = item.catalog?.isBodyweight ?? exercise.is_bodyweight === 1;
    const meta = `${bodyweight ? t('logger.exerciseMeta.bodyweightPrefix') : ''}${t(
      'logger.exerciseMeta.repRange',
      { low, high },
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
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
                autoFocus={picker.region == null && picker.exerciseIds == null && picker.type == null}
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
                    accessibilityState={{ disabled: !supportsCurrentLogger(item.exercise, item.catalog) }}
                    disabled={!supportsCurrentLogger(item.exercise, item.catalog)}
                    style={({ pressed }) => [
                      styles.row,
                      !supportsCurrentLogger(item.exercise, item.catalog) && styles.rowDisabled,
                      pressed && styles.rowPressed,
                    ]}
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
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
  rowDisabled: { opacity: 0.5 },
  rowBody: { flex: 1, justifyContent: 'center' },
  exName: { ...typeScale.body, color: colors.text },
  chevron: { fontSize: 18, lineHeight: 22, color: colors.text3 },
  closeBtn: { alignSelf: 'center', paddingVertical: space.md, marginTop: space.sm },
});
