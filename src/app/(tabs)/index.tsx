import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { ExerciseRow } from '@/db/types';
import { ArenaCard } from '@/features/arena/ArenaCard';
import { gradeForScore } from '@/features/combat-power/grades';
import { MyCharacter } from '@/features/character/MyCharacter';
import { CARDIO_EXERCISE_IDS, REGIONS, type BodyRegionId } from '@/features/character/regions';
import { DailyGoalsCard } from '@/features/dailyGoals/DailyGoalsCard';
import { DisciplineCard } from '@/features/discipline/DisciplineCard';
import { FoodCard } from '@/features/food/FoodCard';
import { RestTimerBar } from '@/features/rest/RestTimerBar';
import { ForgeBar } from '@/features/forge/ForgeBar';
import { ForgeRitualOverlay } from '@/features/forge/ForgeRitualOverlay';
import { useSessionStore } from '@/features/forge/sessionStore';
import { useForge } from '@/features/forge/useForge';
import { CardioLoggerSheet } from '@/features/logging/CardioLoggerSheet';
import { ExerciseRegionSheet, type RegionPicker } from '@/features/logging/ExerciseRegionSheet';
import { SetLoggerSheet } from '@/features/logging/SetLoggerSheet';
import { QuickLogBar } from '@/features/quicklog/QuickLogBar';
import { ActiveWorkoutCard } from '@/features/workout/ActiveWorkoutCard';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { Muted, Screen } from '@/ui/primitives';
import { colors, displayFamily, fontSize, numberFamily, space } from '@/ui/theme/tokens';

type PageKey = 'arena' | 'goals' | 'food' | 'discipline' | 'manual';
const PAGES: PageKey[] = ['arena', 'goals', 'food', 'discipline', 'manual'];

/**
 * Today — fixed top (Combat Power + the ONE input + forge), and below it a snap-paging CARD DECK:
 * swipe horizontally and every card (arena/goals/food/discipline/manual) lands in the exact same
 * viewport spot. Builder directive: no more eyes traveling down a stack — one viewing position.
 */
export default function TodayScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const pageW = width - 2 * space.lg; // Screen horizontal padding
  const score = useCombatPowerStore((s) => s.score);
  const { enter, finish } = useForge();

  const [page, setPage] = useState(0);
  const [activeRegion, setActiveRegion] = useState<BodyRegionId | null>(null);
  const [picker, setPicker] = useState<RegionPicker | null>(null);
  const [activeExercise, setActiveExercise] = useState<ExerciseRow | null>(null);
  const listRef = useRef<FlatList<PageKey>>(null);

  const ensureSession = useCallback(async (): Promise<string> => {
    const active = useSessionStore.getState().activeSessionId;
    if (active) return active;
    await enter();
    return useSessionStore.getState().activeSessionId ?? '';
  }, [enter]);

  const onRegionPress = useCallback(
    (region: BodyRegionId) => {
      if (!useSessionStore.getState().activeSessionId) {
        void enter();
        return;
      }
      setActiveRegion(region);
      setPicker({ title: t(`region.${region}`), exerciseIds: REGIONS[region].exerciseIds });
    },
    [enter, t],
  );

  const onCardioPress = useCallback(() => {
    if (!useSessionStore.getState().activeSessionId) {
      void enter();
      return;
    }
    setActiveRegion(null);
    setPicker({ title: t('today.cardioSheetTitle'), exerciseIds: [...CARDIO_EXERCISE_IDS] });
  }, [enter, t]);

  const onPageScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / pageW);
      setPage(Math.max(0, Math.min(PAGES.length - 1, i)));
    },
    [pageW],
  );

  const renderPage = useCallback(
    ({ item }: { item: PageKey }) => (
      <View style={{ width: pageW }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.lg }}>
          {item === 'arena' ? <ArenaCard /> : null}
          {item === 'goals' ? <DailyGoalsCard /> : null}
          {item === 'food' ? <FoodCard /> : null}
          {item === 'discipline' ? <DisciplineCard /> : null}
          {item === 'manual' ? (
            <>
              <QuickLogBar />
              <MyCharacter activeRegion={activeRegion} onRegionPress={onRegionPress} onCardioPress={onCardioPress} />
            </>
          ) : null}
        </ScrollView>
      </View>
    ),
    [pageW, activeRegion, onRegionPress, onCardioPress],
  );

  const grade = gradeForScore(score);

  return (
    <Screen>
      {/* fixed zone — never moves */}
      <View style={styles.header}>
        <Muted>{t('today.combatPowerLabel')}</Muted>
        <Text style={styles.cpScore}>{score}</Text>
        <Text style={[styles.grade, { color: colors.cyan }]}>{t(`grade.${grade.key}`)}</Text>
      </View>

      <ActiveWorkoutCard ensureSession={ensureSession} onOpenCardio={(exercise) => setActiveExercise(exercise)} onFinishWorkout={finish} />
      <RestTimerBar />
      <ForgeBar onEnter={enter} onFinish={finish} />

      {/* card deck — every card snaps to this exact spot */}
      <FlatList
        ref={listRef}
        data={PAGES}
        keyExtractor={(k) => k}
        renderItem={renderPage}
        horizontal
        snapToInterval={pageW}
        decelerationRate="fast"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onPageScrollEnd}
        style={styles.deck}
      />

      <View style={styles.dots}>
        {PAGES.map((k, i) => (
          <View key={k} style={[styles.dot, i === page && styles.dotActive]} />
        ))}
      </View>

      <ExerciseRegionSheet
        picker={picker}
        onSelect={(ex) => {
          setActiveExercise(ex);
          setPicker(null);
        }}
        onClose={() => {
          setPicker(null);
          setActiveRegion(null);
        }}
      />

      <SetLoggerSheet
        key={`s-${activeExercise?.id ?? 'none'}`}
        exercise={activeExercise?.type === 'strength' ? activeExercise : null}
        ensureSession={ensureSession}
        onClose={() => setActiveExercise(null)}
      />
      <CardioLoggerSheet
        key={`c-${activeExercise?.id ?? 'none'}`}
        exercise={activeExercise?.type === 'cardio' ? activeExercise : null}
        ensureSession={ensureSession}
        onClose={() => setActiveExercise(null)}
      />

      <ForgeRitualOverlay />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginTop: space.md },
  cpScore: { color: colors.text, fontFamily: numberFamily, fontSize: fontSize.odometer, lineHeight: fontSize.odometer + 6 },
  grade: { fontFamily: displayFamily, fontSize: fontSize.lg, letterSpacing: 3 },
  deck: { flex: 1, marginTop: space.sm },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: space.sm },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line },
  dotActive: { backgroundColor: colors.cyan, width: 18 },
});
