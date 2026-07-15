import { Fragment, useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CatalogExerciseSelection } from '@/features/exercises/catalog/types';
import { ArenaCard } from '@/features/arena/ArenaCard';
import { gradeForScore } from '@/features/combat-power/grades';
import type { BodyHitRegionId } from '@/features/character/bodyHitMap';
import { MyCharacter } from '@/features/character/MyCharacter';
import { CARDIO_EXERCISE_IDS } from '@/features/character/regions';
import { CoachCard } from '@/features/coach/CoachCard';
import { MicDock } from '@/features/coach/MicDock';
import { DailyGoalsCard } from '@/features/dailyGoals/DailyGoalsCard';
import { DisciplineCard } from '@/features/discipline/DisciplineCard';
import { FoodCard } from '@/features/food/FoodCard';
import { AmbientAura } from '@/features/juice/AmbientAura';
import { ForgeBar } from '@/features/forge/ForgeBar';
import { ForgeRitualOverlay } from '@/features/forge/ForgeRitualOverlay';
import { useSessionStore } from '@/features/forge/sessionStore';
import { useForge } from '@/features/forge/useForge';
import { CardioLoggerSheet } from '@/features/logging/CardioLoggerSheet';
import { ExerciseRegionSheet, type RegionPicker } from '@/features/logging/ExerciseRegionSheet';
import { SetLoggerSheet } from '@/features/logging/SetLoggerSheet';
import { useTodayProgram } from '@/features/program/useProgram';
import { QuickLogBar } from '@/features/quicklog/QuickLogBar';
import { todayActionOrder, type TodayActionSurface } from '@/features/today/actionOrder';
import { ActiveWorkoutCard } from '@/features/workout/ActiveWorkoutCard';
import { WarriorCard } from '@/features/warrior/WarriorCard';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { Metric, Screen, useAccent } from '@/ui/primitives';
import {
  colors,
  displayGrade,
  hangulSafeLetterSpacing,
  hasHangul,
  space,
  tracking,
  typeScale,
} from '@/ui/theme/tokens';

/**
 * Today — context first, decoration second. CoachCard always leads. While training, the live
 * session strip + manual/recent logging + body map stay together before any CP/game surfaces. When
 * idle, FoodCard takes the second slot so a meal is reachable without scrolling. Everything remains
 * in one vertical scroll; this is a priority change, not feature removal. MicDock stays floating in
 * the thumb zone and CoachCard owns the rest countdown.
 */
export default function TodayScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  // The ONE accent of this view — persona ramp, resolved once at screen level (MONOLITH).
  const accent = useAccent();
  const score = useCombatPowerStore((s) => s.score);
  const { enter, enterSilently, finish } = useForge();
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const todayProgram = useTodayProgram();

  const [activeRegion, setActiveRegion] = useState<BodyHitRegionId | null>(null);
  const [picker, setPicker] = useState<RegionPicker | null>(null);
  const [activeExercise, setActiveExercise] = useState<CatalogExerciseSelection | null>(null);
  const [showDetail, setShowDetail] = useState(false); // ActiveWorkoutCard behind CoachCard's '자세히'

  const ensureSession = useCallback(async (): Promise<string> => {
    const active = useSessionStore.getState().activeSessionId;
    if (active) return active;
    return enterSilently();
  }, [enterSilently]);

  const legacySelection = useCallback((exercise: CatalogExerciseSelection['exercise']): CatalogExerciseSelection => ({
    exercise,
    catalog: null,
    localizedName: t(`exercise.${exercise.id}`, { defaultValue: exercise.name }),
  }), [t]);

  const onRegionPress = useCallback(
    (region: BodyHitRegionId) => {
      setActiveRegion(region);
      setPicker({
        title: t(`region.${region}`),
        type: 'strength',
        region,
        programExerciseIds: todayProgram.slots.map((slot) => slot.exerciseId),
      });
    },
    [t, todayProgram.slots],
  );

  const onCardioPress = useCallback(() => {
    setActiveRegion(null);
    setPicker({ title: t('today.cardioSheetTitle'), exerciseIds: [...CARDIO_EXERCISE_IDS] });
  }, [t]);

  const grade = gradeForScore(score);
  const cpLabel = t('today.combatPowerLabel');
  const gradeWord = t(`grade.${grade.key}`);

  const renderActionSurface = (surface: TodayActionSurface) => {
    switch (surface) {
      case 'forge':
        return <ForgeBar onEnter={enter} onFinish={finish} />;
      case 'quicklog':
        return <QuickLogBar />;
      case 'food':
        return <FoodCard />;
      case 'character':
        return (
          <MyCharacter
            activeRegion={activeRegion}
            onRegionPress={onRegionPress}
            onCardioPress={onCardioPress}
          />
        );
      case 'goals':
        return <DailyGoalsCard />;
      case 'discipline':
        return <DisciplineCard />;
    }
  };

  return (
    <Screen background={<AmbientAura />}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* THE hero surface — one glance, one button (next set / start / finish). ActiveWorkoutCard
            stays reachable as the detail view behind the card's '자세히' toggle. */}
        <CoachCard
          ensureSession={ensureSession}
          onOpenExercise={setActiveExercise}
          onFinishWorkout={finish}
          detailOpen={showDetail}
          onToggleDetail={() => setShowDetail((v) => !v)}
        />
        {showDetail ? (
          <ActiveWorkoutCard ensureSession={ensureSession} onOpenCardio={(exercise) => setActiveExercise(legacySelection(exercise))} onFinishWorkout={finish} />
        ) : null}

        {/* The high-frequency lane changes with context. Stable keys preserve typed input and
            confirmations when a first log flips the screen from idle → in-session. */}
        <View>
          {todayActionOrder(activeSessionId != null).map((surface) => (
            <Fragment key={surface}>{renderActionSurface(surface)}</Fragment>
          ))}
        </View>

        {/* Shrine header — floats directly on the aura, no card chrome. Glow slot 1 of 2: the CP
            number's textShadow. Grade word is Anton (Latin only) — Korean grades fall back to the
            system font (Anton renders Hangul as tofu). Disclaimer = spec §8 fun-score label. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tabs.power')}
          onPress={() => router.push('/power')}
          style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        >
          <Text style={[styles.overline, { letterSpacing: hangulSafeLetterSpacing(cpLabel, tracking.overline) }]}>
            {cpLabel}
          </Text>
          <Metric value={score} unit="CP" size="hero" />
          <Text style={[hasHangul(gradeWord) ? styles.gradeHangul : styles.grade, { color: accent.solid }]}>
            {gradeWord}
          </Text>
          <Text style={styles.disclaimer}>{t('power.disclaimer')}</Text>
        </Pressable>

        <WarriorCard />
        <ArenaCard />
      </ScrollView>

      {/* Floating voice log — one thumb tap from anywhere in the scroll (same instant save path). */}
      <MicDock />

      <ExerciseRegionSheet
        picker={picker}
        onSelect={(ex) => {
          setActiveExercise(ex);
        }}
        onClose={() => {
          setPicker(null);
          setActiveRegion(null);
        }}
      />

      <SetLoggerSheet
        key={`s-${activeExercise?.exercise.id ?? 'none'}`}
        exercise={(activeExercise?.catalog?.exerciseType ?? activeExercise?.exercise.type) === 'strength' ? activeExercise?.exercise ?? null : null}
        catalog={activeExercise?.catalog ?? null}
        displayName={activeExercise?.localizedName}
        ensureSession={ensureSession}
        onClose={() => setActiveExercise(null)}
      />
      <CardioLoggerSheet
        key={`c-${activeExercise?.exercise.id ?? 'none'}`}
        exercise={(activeExercise?.catalog?.exerciseType ?? activeExercise?.exercise.type) === 'cardio' ? activeExercise?.exercise ?? null : null}
        catalog={activeExercise?.catalog ?? null}
        displayName={activeExercise?.localizedName}
        ensureSession={ensureSession}
        onClose={() => setActiveExercise(null)}
      />

      <ForgeRitualOverlay />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingTop: space.md, paddingBottom: space.xxxl },
  header: { alignItems: 'center', marginTop: space.sm },
  headerPressed: { opacity: 0.72 },
  overline: { ...typeScale.overline, marginBottom: space.xs },
  grade: { ...displayGrade, marginTop: space.xs },
  // System-font fallback for Hangul grade words (Anton is Latin/digits only).
  gradeHangul: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: tracking.hangulMax, marginTop: space.xs },
  disclaimer: { ...typeScale.caption, color: colors.text3, marginTop: space.xs },
});
