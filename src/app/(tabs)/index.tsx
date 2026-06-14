import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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

/**
 * Today — ONE vertical scroll: Combat Power + the programmed Active Workout up top, then the card
 * stack (arena → daily goals → food → discipline → manual logging). Scroll down to reach everything.
 * Replaced the horizontal snap-paging deck: the primary user kept scrolling DOWN for Daily Goals and
 * the `flex: 1` deck squished each card into a thin strip. A plain vertical stack: nothing hidden
 * behind a sideways swipe, no scroll region competing with a fixed header for height.
 */
export default function TodayScreen() {
  const { t } = useTranslation();
  const score = useCombatPowerStore((s) => s.score);
  const { enter, finish } = useForge();

  const [activeRegion, setActiveRegion] = useState<BodyRegionId | null>(null);
  const [picker, setPicker] = useState<RegionPicker | null>(null);
  const [activeExercise, setActiveExercise] = useState<ExerciseRow | null>(null);

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

  const grade = gradeForScore(score);

  return (
    <Screen>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Muted>{t('today.combatPowerLabel')}</Muted>
          <Text style={styles.cpScore}>{score}</Text>
          <Text style={[styles.grade, { color: colors.cyan }]}>{t(`grade.${grade.key}`)}</Text>
        </View>

        <ActiveWorkoutCard ensureSession={ensureSession} onOpenCardio={(exercise) => setActiveExercise(exercise)} onFinishWorkout={finish} />
        <RestTimerBar />
        <ForgeBar onEnter={enter} onFinish={finish} />

        <ArenaCard />
        <DailyGoalsCard />
        <FoodCard />
        <DisciplineCard />
        <QuickLogBar />
        <MyCharacter activeRegion={activeRegion} onRegionPress={onRegionPress} onCardioPress={onCardioPress} />
      </ScrollView>

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
  scroll: { flex: 1 },
  content: { paddingTop: space.md, paddingBottom: space.xxl },
  header: { alignItems: 'center' },
  cpScore: { color: colors.text, fontFamily: numberFamily, fontSize: fontSize.odometer, lineHeight: fontSize.odometer + 6 },
  grade: { fontFamily: displayFamily, fontSize: fontSize.lg, letterSpacing: 3 },
});
