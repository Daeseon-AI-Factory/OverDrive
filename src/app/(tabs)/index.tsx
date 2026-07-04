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
import { AmbientAura } from '@/features/juice/AmbientAura';
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
import { WarriorCard } from '@/features/warrior/WarriorCard';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { Metric, Screen, useAccent } from '@/ui/primitives';
import {
  colors,
  displayGrade,
  hangulSafeLetterSpacing,
  hasHangul,
  heroTextGlow,
  space,
  tracking,
  typeScale,
} from '@/ui/theme/tokens';

/**
 * Today — ONE vertical scroll: Combat Power + the programmed Active Workout up top, then the card
 * stack (arena → daily goals → food → discipline → manual logging). Scroll down to reach everything.
 * Replaced the horizontal snap-paging deck: the primary user kept scrolling DOWN for Daily Goals and
 * the `flex: 1` deck squished each card into a thin strip. A plain vertical stack: nothing hidden
 * behind a sideways swipe, no scroll region competing with a fixed header for height.
 */
export default function TodayScreen() {
  const { t } = useTranslation();
  // The ONE accent of this view — persona ramp, resolved once at screen level (MONOLITH).
  const accent = useAccent();
  const score = useCombatPowerStore((s) => s.score);
  const { enter, finish } = useForge();
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  const [activeRegion, setActiveRegion] = useState<BodyRegionId | null>(null);
  const [picker, setPicker] = useState<RegionPicker | null>(null);
  const [activeExercise, setActiveExercise] = useState<ExerciseRow | null>(null);

  // Implicit session start (first set / body-map tap): skip the 1.6s enter ritual so the gesture
  // completes immediately — JUICE must never block logging (spec §6). The ritual stays for an
  // explicit forge entry.
  const enterSilently = useCallback(async () => {
    useSessionStore.getState().setSilentStart(true);
    try {
      await enter();
    } finally {
      useSessionStore.getState().setSilentStart(false);
    }
  }, [enter]);

  const ensureSession = useCallback(async (): Promise<string> => {
    const active = useSessionStore.getState().activeSessionId;
    if (active) return active;
    await enterSilently();
    return useSessionStore.getState().activeSessionId ?? '';
  }, [enterSilently]);

  const onRegionPress = useCallback(
    (region: BodyRegionId) => {
      // Open the picker in this SAME gesture; the session auto-starts silently in the background.
      if (!useSessionStore.getState().activeSessionId) void enterSilently();
      setActiveRegion(region);
      setPicker({ title: t(`region.${region}`), exerciseIds: REGIONS[region].exerciseIds });
    },
    [enterSilently, t],
  );

  const onCardioPress = useCallback(() => {
    if (!useSessionStore.getState().activeSessionId) void enterSilently();
    setActiveRegion(null);
    setPicker({ title: t('today.cardioSheetTitle'), exerciseIds: [...CARDIO_EXERCISE_IDS] });
  }, [enterSilently, t]);

  const grade = gradeForScore(score);
  const cpLabel = t('today.combatPowerLabel');
  const gradeWord = t(`grade.${grade.key}`);

  return (
    <Screen background={<AmbientAura />}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* Shrine header — floats directly on the aura, no card chrome. Glow slot 1 of 2: the CP
            number's textShadow. Grade word is Anton (Latin only) — Korean grades fall back to the
            system font (Anton renders Hangul as tofu). Disclaimer = spec §8 fun-score label. */}
        <View style={styles.header}>
          <Text style={[styles.overline, { letterSpacing: hangulSafeLetterSpacing(cpLabel, tracking.overline) }]}>
            {cpLabel}
          </Text>
          <Metric value={score} unit="CP" size="hero" valueStyle={heroTextGlow(accent)} />
          <Text style={[hasHangul(gradeWord) ? styles.gradeHangul : styles.grade, { color: accent.solid }]}>
            {gradeWord}
          </Text>
          <Text style={styles.disclaimer}>{t('power.disclaimer')}</Text>
        </View>

        <WarriorCard />

        <ActiveWorkoutCard ensureSession={ensureSession} onOpenCardio={(exercise) => setActiveExercise(exercise)} onFinishWorkout={finish} />
        <RestTimerBar />
        {/* Active-session bar only (timer · sets · 수련 완료). The idle '용광로 진입' button competed
            with ActiveWorkoutCard's own primary CTA and its hint claimed a false precondition —
            sessions auto-start on the first log / body-map tap. */}
        {activeSessionId ? <ForgeBar onEnter={enter} onFinish={finish} /> : null}

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
  content: { paddingTop: space.md, paddingBottom: space.xxxl },
  header: { alignItems: 'center', marginTop: space.sm },
  overline: { ...typeScale.overline, marginBottom: space.xs },
  grade: { ...displayGrade, marginTop: space.xs },
  // System-font fallback for Hangul grade words (Anton is Latin/digits only).
  gradeHangul: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: tracking.hangulMax, marginTop: space.xs },
  disclaimer: { ...typeScale.caption, color: colors.text3, marginTop: space.xs },
});
