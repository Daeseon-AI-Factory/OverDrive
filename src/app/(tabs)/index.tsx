import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { Muted, Screen } from '@/ui/primitives';
import { colors, displayFamily, fontSize, numberFamily, space } from '@/ui/theme/tokens';

/**
 * Today — radically simplified (builder directive: "존나 심플하게"). The default view is just:
 * the Combat Power number + ONE input (QuickLog) + goals + a one-tap food/rest check. The choice-
 * heavy body-map / full logger is tucked behind a "수동" toggle so it never competes for attention.
 */
export default function TodayScreen() {
  const { t } = useTranslation();
  const score = useCombatPowerStore((s) => s.score);
  const { enter, finish } = useForge();

  const [manual, setManual] = useState(false);
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <View style={styles.header}>
          <Muted>{t('today.combatPowerLabel')}</Muted>
          <Text style={styles.cpScore}>{score}</Text>
          <Text style={[styles.grade, { color: colors.cyan }]}>{t(`grade.${grade.key}`)}</Text>
        </View>

        {/* THE one input — type/say "벤치 100 5" or tap a recent lift */}
        <QuickLogBar />
        <RestTimerBar />

        {/* ARENA — rival + weekly boss: the daily stakes */}
        <ArenaCard />

        <ForgeBar onEnter={enter} onFinish={finish} />

        <DailyGoalsCard />

        <FoodCard />

        <DisciplineCard />

        <Pressable onPress={() => setManual((v) => !v)} style={styles.manualToggle} hitSlop={8}>
          <Text style={styles.manualText}>{manual ? t('today.manualHide') : t('today.manualShow')}</Text>
        </Pressable>

        {manual ? (
          <MyCharacter activeRegion={activeRegion} onRegionPress={onRegionPress} onCardioPress={onCardioPress} />
        ) : null}
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
  header: { alignItems: 'center', marginTop: space.lg },
  cpScore: { color: colors.text, fontFamily: numberFamily, fontSize: fontSize.odometer },
  grade: { fontFamily: displayFamily, fontSize: fontSize.xl, letterSpacing: 3 },
  manualToggle: { alignSelf: 'center', paddingVertical: space.lg, marginTop: space.sm },
  manualText: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '700', letterSpacing: 1 },
});
