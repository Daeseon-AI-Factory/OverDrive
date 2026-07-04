import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { deleteCardio, getCardioCountsForModalitiesOnDate, getLastCardioForModality } from '@/db/repos/cardioRepo';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import { deleteSet, getLastSetForExercise, getSetCountsForExercisesOnDate } from '@/db/repos/setLogRepo';
import type { ExerciseRow } from '@/db/types';
import { useLogCardio } from '@/features/logging/useLogCardio';
import { useLogSet } from '@/features/logging/useLogSet';
import type { ProgramSlot } from '@/features/program/types';
import { useTodayProgram } from '@/features/program/useProgram';
import { todayLocal } from '@/lib/date';
import { displayToKg, formatDistance, formatWeight, kgToDisplay, weightStepDisplay, weightUnit } from '@/lib/units';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button, Card, IconSquare, LiveDot, Metric, Muted, Pill, useAccent } from '@/ui/primitives';
import {
  border,
  colors,
  hangulSafeLetterSpacing,
  numType,
  radius,
  space,
  tracking,
  typeScale,
} from '@/ui/theme/tokens';
import { useSessionStore } from '../forge/sessionStore';
import { firstIncompleteWorkoutIndex, mergeWorkoutCounts } from './progress';

interface DraftSet {
  weightDisplay: number;
  reps: number;
  rir: number | null;
  lastSet: { weightKg: number; reps: number; rir: number | null } | null;
}

type LastLoggedEntry =
  | {
      kind: 'set';
      setId: string;
      exerciseId: string;
      exerciseIndex: number;
      weightKg: number;
      reps: number;
      rir: number | null;
    }
  | {
      kind: 'cardio';
      cardioId: string;
      exerciseId: string;
      exerciseIndex: number;
      durationSec: number;
      rounds: number | null;
      rpe: number | null;
      distanceM: number | null;
    };

interface CardioPreset {
  key: 'easy' | 'zone2' | 'hiit';
  durationSec: number;
  rounds?: number | null;
  rpe: number | null;
  distanceM: number | null;
}

interface LastCardio {
  durationSec: number;
  rounds: number | null;
  rpe: number | null;
  distanceM: number | null;
}

const roundTo = (value: number, precision: number) => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function compactNumber(value: number, precision: number) {
  return value.toFixed(precision).replace(/\.0$/, '');
}

function cardioPresetsFor(exerciseId: string): CardioPreset[] {
  if (exerciseId === 'hiit_intervals') {
    return [
      { key: 'hiit', durationSec: 12 * 60, rounds: 8, rpe: 9, distanceM: null },
      { key: 'hiit', durationSec: 16 * 60, rounds: 10, rpe: 9, distanceM: null },
      { key: 'easy', durationSec: 20 * 60, rpe: 7, distanceM: null },
    ];
  }
  if (exerciseId === 'zone2_run') {
    return [
      { key: 'zone2', durationSec: 20 * 60, rpe: 6, distanceM: null },
      { key: 'zone2', durationSec: 30 * 60, rpe: 6, distanceM: null },
      { key: 'zone2', durationSec: 45 * 60, rpe: 6, distanceM: null },
    ];
  }
  return [
    { key: 'easy', durationSec: 20 * 60, rpe: 6, distanceM: null },
    { key: 'zone2', durationSec: 30 * 60, rpe: 6, distanceM: null },
    { key: 'hiit', durationSec: 12 * 60, rounds: 8, rpe: 9, distanceM: null },
  ];
}

/**
 * Today's programmed workout — THE live card on the Today screen (MONOLITH: 2pt accent rail +
 * LiveDot + accent overline mark the one thing that is alive right now). Steppers are machined
 * IconSquares around Orbitron readouts; the complete-set CTA is the screen's single solid-accent
 * primary Button. Everything else recedes into the monochrome ladder.
 */
export function ActiveWorkoutCard({
  ensureSession,
  onOpenCardio,
  onFinishWorkout,
}: {
  ensureSession: () => Promise<string>;
  onOpenCardio: (exercise: ExerciseRow) => void;
  onFinishWorkout: () => void;
}) {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useTranslation();
  const accent = useAccent();
  const logSet = useLogSet();
  const logCardio = useLogCardio();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const weightStepKg = useSettingsStore((s) => s.weightStep);
  const today = useTodayProgram();
  // `today.slots` is a fresh array each render (the default path builds a new one), so derive a
  // content-stable string key and drive effects/memos off THAT — not array identity, which under
  // React Compiler can't be relied on to stay referentially stable across renders.
  const slots = today.slots;
  const slotsKey = slots.map((s) => `${s.exerciseId}:${s.targetSets}:${s.repLow}:${s.repHigh}`).join('|');
  const slotTargets = useMemo(() => {
    const map: Record<string, ProgramSlot> = {};
    for (const slot of slots) map[slot.exerciseId] = slot;
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slotsKey is the content-stable proxy for slots
  }, [slotsKey]);
  const targetSetsFor = (exercise: ExerciseRow) => slotTargets[exercise.id]?.targetSets ?? exercise.default_sets;

  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loggedCounts, setLoggedCounts] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<DraftSet>({ weightDisplay: 0, reps: 0, rir: null, lastSet: null });
  const [busy, setBusy] = useState(false);
  const [lastLogged, setLastLogged] = useState<LastLoggedEntry | null>(null);
  const [lastCardio, setLastCardio] = useState<LastCardio | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const ids = slots.map((slot) => slot.exerciseId);
    const targetByExercise = new Map(slots.map((slot) => [slot.exerciseId, slot.targetSets]));

    (async () => {
      await Promise.resolve();
      if (!alive) return;
      setLoading(true);
      setLoadFailed(false);
      setExercises([]);
      setActiveIndex(0);
      setLoggedCounts({});
      setLastLogged(null);

      if (ids.length === 0) {
        setLoading(false);
        return;
      }

      try {
        const rows = await db.getAllAsync<ExerciseRow>(
          `SELECT * FROM exercise WHERE id IN (${ids.map(() => '?').join(',')})`,
          ids,
        );
        if (!alive) return;
        const byId = new Map(rows.map((row) => [row.id, row]));
        const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as ExerciseRow[];
        // Feed the EFFECTIVE target sets (slot override → catalog default) into progress logic.
        const progressRows = ordered.map((exercise) => ({
          id: exercise.id,
          type: exercise.type,
          default_sets: targetByExercise.get(exercise.id) ?? exercise.default_sets,
        }));
        const strengthIds = ordered.filter((exercise) => exercise.type === 'strength').map((exercise) => exercise.id);
        const cardioIds = ordered.filter((exercise) => exercise.type === 'cardio').map((exercise) => exercise.id);
        const [strengthCounts, cardioCounts] = await Promise.all([
          getSetCountsForExercisesOnDate(db, strengthIds, todayLocal()),
          getCardioCountsForModalitiesOnDate(db, cardioIds, todayLocal()),
        ]);
        if (!alive) return;
        const counts = mergeWorkoutCounts(progressRows, strengthCounts, cardioCounts);
        setExercises(ordered);
        setLoggedCounts(counts);
        setActiveIndex(firstIncompleteWorkoutIndex(progressRows, counts));
      } catch {
        if (alive) setLoadFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on slotsKey (program content), not `slots` identity
  }, [db, slotsKey]);

  const current = exercises[activeIndex] ?? null;
  const currentCount = current ? (loggedCounts[current.id] ?? 0) : 0;
  const currentTarget = current ? targetSetsFor(current) : 0;
  const workoutComplete = exercises.length > 0 && exercises.every((exercise) => (loggedCounts[exercise.id] ?? 0) >= targetSetsFor(exercise));
  const isBodyweight = current?.is_bodyweight === 1;
  const weightStep = weightStepDisplay(unitSystem, weightStepKg);
  const weightPrecision = unitSystem === 'imperial' ? 0 : 1;

  useEffect(() => {
    if (!current || current.type !== 'strength') return;
    let alive = true;

    (async () => {
      const last = await getLastSetForExercise(db, current.id);
      if (!alive) return;
      if (last) {
        setDraft({
          weightDisplay: roundTo(kgToDisplay(last.weight, unitSystem), weightPrecision),
          reps: last.reps,
          rir: last.rir,
          lastSet: { weightKg: last.weight, reps: last.reps, rir: last.rir },
        });
        return;
      }

      setDraft({
        weightDisplay: current.is_bodyweight ? 0 : roundTo(kgToDisplay(20, unitSystem), weightPrecision),
        reps: slots.find((slot) => slot.exerciseId === current.id)?.repLow ?? current.rep_low,
        rir: null,
        lastSet: null,
      });
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slotsKey is the content-stable proxy for slots
  }, [db, current, current?.id, unitSystem, weightPrecision, slotsKey]);

  useEffect(() => {
    let alive = true;

    (async () => {
      await Promise.resolve();
      if (!alive) return;
      if (!current || current.type !== 'cardio') {
        setLastCardio(null);
        return;
      }

      const last = await getLastCardioForModality(db, current.id);
      if (!alive) return;
      setLastCardio(
        last
          ? {
              durationSec: last.duration_sec,
              rounds: last.rounds,
              rpe: last.rpe,
              distanceM: last.distance_m,
            }
          : null,
      );
    })();

    return () => {
      alive = false;
    };
  }, [db, current, current?.id]);

  const describeSet = (set: { weightKg: number; reps: number; rir: number | null }) => {
    const weight = formatWeight(set.weightKg, unitSystem, weightPrecision);
    const core = `${weight ? `${weight} x ` : ''}${set.reps}${set.rir != null ? t('logger.lastSetRir', { rir: set.rir }) : ''}`;
    return core;
  };

  const describeCardio = (cardio: LastCardio | CardioPreset) => {
    const minutes = Math.round(cardio.durationSec / 60);
    const distance = cardio.distanceM ? ` · ${formatDistance(cardio.distanceM, unitSystem)}` : '';
    const rounds = cardio.rounds ? ` · ${t('activeWorkout.cardioRounds', { rounds: cardio.rounds })}` : '';
    const rpe = cardio.rpe ? ` · RPE ${cardio.rpe}` : '';
    return `${minutes} ${t('cardio.min')}${rounds}${rpe}${distance}`;
  };

  const advanceToNext = () => {
    setActiveIndex((index) => Math.min(exercises.length - 1, index + 1));
  };

  const completeSet = async () => {
    if (!current || current.type !== 'strength' || draft.reps <= 0 || busy) return;
    setBusy(true);
    setSaveFailed(false);
    try {
      const sessionId = await ensureSession();
      if (!sessionId) throw new Error('No active session');

      const weightKg = current.is_bodyweight ? 0 : displayToKg(draft.weightDisplay, unitSystem);
      const result = await logSet({
        sessionId,
        exerciseId: current.id,
        weight: weightKg,
        reps: draft.reps,
        rir: draft.rir,
        hitTargetReps: draft.reps >= (slotTargets[current.id]?.repLow ?? current.rep_low),
        loggedVia: 'quick',
      });

      const nextCount = currentCount + 1;
      setLoggedCounts((counts) => ({ ...counts, [current.id]: nextCount }));
      setDraft((value) => ({ ...value, lastSet: { weightKg, reps: value.reps, rir: value.rir } }));
      setLastLogged({
        kind: 'set',
        setId: result.setId,
        exerciseId: current.id,
        exerciseIndex: activeIndex,
        weightKg,
        reps: draft.reps,
        rir: draft.rir,
      });

      if (nextCount >= targetSetsFor(current) && activeIndex < exercises.length - 1) {
        advanceToNext();
      }
    } catch {
      setSaveFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const completeCardio = async (input: CardioPreset | LastCardio) => {
    if (!current || current.type !== 'cardio' || busy) return;
    setBusy(true);
    setSaveFailed(false);
    try {
      const sessionId = await ensureSession();
      if (!sessionId) throw new Error('No active session');

      const result = await logCardio({
        sessionId,
        modality: current.id,
        durationSec: input.durationSec,
        rounds: input.rounds,
        distanceM: input.distanceM,
        rpe: input.rpe,
      });

      const nextCount = currentCount + 1;
      setLoggedCounts((counts) => ({ ...counts, [current.id]: nextCount }));
      setLastCardio({
        durationSec: input.durationSec,
        rounds: input.rounds ?? null,
        rpe: input.rpe,
        distanceM: input.distanceM,
      });
      setLastLogged({
        kind: 'cardio',
        cardioId: result.cardioId,
        exerciseId: current.id,
        exerciseIndex: activeIndex,
        durationSec: input.durationSec,
        rounds: input.rounds ?? null,
        rpe: input.rpe,
        distanceM: input.distanceM,
      });

      if (nextCount >= targetSetsFor(current) && activeIndex < exercises.length - 1) {
        advanceToNext();
      }
    } catch {
      setSaveFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const undoLast = async () => {
    if (!lastLogged || busy) return;
    setBusy(true);
    setSaveFailed(false);
    try {
      if (lastLogged.kind === 'set') {
        await deleteSet(db, lastLogged.setId);
      } else {
        await deleteCardio(db, lastLogged.cardioId);
      }
      const result = await recomputeAndStore(db);
      useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);
      useSessionStore.getState().undoSet(lastLogged.kind === 'set' ? lastLogged.weightKg * lastLogged.reps : 0);
      setLoggedCounts((counts) => ({
        ...counts,
        [lastLogged.exerciseId]: Math.max(0, (counts[lastLogged.exerciseId] ?? 1) - 1),
      }));
      const previousSet = lastLogged.kind === 'set' ? await getLastSetForExercise(db, lastLogged.exerciseId) : null;
      const previousCardio = lastLogged.kind === 'cardio' ? await getLastCardioForModality(db, lastLogged.exerciseId) : null;
      setActiveIndex(lastLogged.exerciseIndex);
      if (lastLogged.kind === 'set') {
        setDraft((value) => ({
          ...value,
          weightDisplay: roundTo(kgToDisplay(lastLogged.weightKg, unitSystem), weightPrecision),
          reps: lastLogged.reps,
          rir: lastLogged.rir,
          lastSet: previousSet ? { weightKg: previousSet.weight, reps: previousSet.reps, rir: previousSet.rir } : null,
        }));
      } else {
        setLastCardio(
          previousCardio
            ? {
                durationSec: previousCardio.duration_sec,
                rounds: previousCardio.rounds,
                rpe: previousCardio.rpe,
                distanceM: previousCardio.distance_m,
              }
            : null,
        );
      }
      setLastLogged(null);
    } catch {
      setSaveFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const setWeight = (direction: 1 | -1) => {
    setDraft((value) => ({
      ...value,
      weightDisplay: roundTo(clamp(value.weightDisplay + direction * weightStep, 0, 2000), weightPrecision),
    }));
  };

  const setReps = (direction: 1 | -1) => {
    setDraft((value) => ({ ...value, reps: clamp(value.reps + direction, 0, 999) }));
  };

  const lastSetText = draft.lastSet ? t('logger.lastSet', { set: describeSet(draft.lastSet) }) : t('logger.firstSet');
  const eyebrowLabel = t('activeWorkout.eyebrow');

  return (
    <Card live style={styles.card}>
      {/* Glow slot 2 of 2 (Today screen): LiveDot + accent overline — this card is what's alive. */}
      <View style={styles.liveRow}>
        <LiveDot />
        <Text
          style={[
            styles.eyebrow,
            { color: accent.solid, letterSpacing: hangulSafeLetterSpacing(eyebrowLabel, tracking.overline) },
          ]}
        >
          {eyebrowLabel}
        </Text>
      </View>

      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.programTitle}>{today.title}</Text>
          <Muted style={styles.focus}>{today.focus}</Muted>
        </View>
        {exercises.length > 0 ? (
          <View style={styles.counterChip}>
            <Text style={styles.counterText}>
              {activeIndex + 1}/{exercises.length}
            </Text>
          </View>
        ) : null}
      </View>

      {loading ? <Muted style={styles.bodyText}>{t('activeWorkout.loading')}</Muted> : null}
      {loadFailed ? <Text style={styles.warnText}>{t('activeWorkout.loadFailed')}</Text> : null}

      {!loading && !loadFailed && slots.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>{today.dayType === 'rest' ? t('activeWorkout.restTitle') : t('activeWorkout.emptyDayTitle')}</Text>
          <Muted>{today.dayType === 'rest' ? t('activeWorkout.restBody') : t('activeWorkout.emptyDayBody')}</Muted>
          {today.dayType !== 'rest' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('activeWorkout.editProgram')}
              onPress={() => router.push('/program')}
              hitSlop={8}
            >
              <Text style={[styles.ctaLink, { color: accent.solid }]}>{t('activeWorkout.editProgram')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!loading && !loadFailed && slots.length > 0 && !current ? (
        <Text style={styles.warnText}>{t('activeWorkout.missingProgram')}</Text>
      ) : null}

      {current ? (
        <>
          <View style={styles.divider} />

          <View style={styles.exerciseHeader}>
            <View style={styles.exerciseNameWrap}>
              <Text style={styles.exerciseName}>{t(`exercise.${current.id}`)}</Text>
              <Muted>{t('activeWorkout.setProgress', { current: Math.min(currentCount + 1, currentTarget), total: currentTarget })}</Muted>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('activeWorkout.skip')}
              disabled={activeIndex >= exercises.length - 1}
              onPress={advanceToNext}
              style={({ pressed }) => [
                styles.skipBtn,
                activeIndex >= exercises.length - 1 && styles.disabled,
                pressed ? styles.pressedSurface : null,
              ]}
              hitSlop={8}
            >
              <Text style={styles.skipText}>{t('activeWorkout.skip')}</Text>
            </Pressable>
          </View>

          {current.type === 'cardio' ? (
            <View style={styles.cardioBlock}>
              <Muted>{lastCardio ? t('activeWorkout.cardioLast', { summary: describeCardio(lastCardio) }) : t('activeWorkout.cardioBody')}</Muted>
              {lastCardio ? (
                // THE one solid-accent primary on the screen when cardio is up (mutually exclusive
                // with the strength complete-set CTA — only one exercise renders at a time).
                <Button
                  label={busy ? t('activeWorkout.saving') : t('activeWorkout.repeatCardio')}
                  onPress={() => void completeCardio(lastCardio)}
                  disabled={busy}
                  style={styles.cardioCta}
                />
              ) : null}

              <View style={styles.presetGrid}>
                {cardioPresetsFor(current.id).map((preset, index) => (
                  <Pressable
                    key={`${preset.key}-${preset.durationSec}-${index}`}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => completeCardio(preset)}
                    style={({ pressed }) => [styles.presetBtn, busy && styles.disabled, pressed ? styles.pressedSurface : null]}
                  >
                    <Text style={styles.presetTitle}>{t(`activeWorkout.cardioPreset.${preset.key}`)}</Text>
                    <Muted>{describeCardio(preset)}</Muted>
                  </Pressable>
                ))}
              </View>

              <Pressable accessibilityRole="button" onPress={() => onOpenCardio(current)} style={styles.detailsBtn} hitSlop={8}>
                <Text style={styles.detailsText}>{t('activeWorkout.cardioDetails')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Muted style={styles.lastSet}>{lastSetText}</Muted>

              <View style={styles.adjustGrid}>
                {!isBodyweight ? (
                  <View style={styles.adjustGroup}>
                    <Text style={styles.adjustLabel}>{t('activeWorkout.weight')}</Text>
                    <View style={styles.adjustRow}>
                      <IconSquare
                        compact
                        glyph="−"
                        glyphStyle={styles.stepperGlyph}
                        accessibilityLabel={`${t('activeWorkout.weight')} -`}
                        disabled={busy}
                        onPress={() => setWeight(-1)}
                      />
                      <Metric
                        value={compactNumber(draft.weightDisplay, weightPrecision)}
                        unit={weightUnit(unitSystem)}
                        size="large"
                        style={styles.valueWrap}
                      />
                      <IconSquare
                        compact
                        glyph="+"
                        glyphStyle={styles.stepperGlyph}
                        accessibilityLabel={`${t('activeWorkout.weight')} +`}
                        disabled={busy}
                        onPress={() => setWeight(1)}
                      />
                    </View>
                  </View>
                ) : null}

                <View style={[styles.adjustGroup, isBodyweight ? styles.fullWidth : null]}>
                  <Text style={styles.adjustLabel}>{isBodyweight ? t('logger.field.repsOrTime') : t('activeWorkout.reps')}</Text>
                  <View style={styles.adjustRow}>
                    <IconSquare
                      compact
                      glyph="−"
                      glyphStyle={styles.stepperGlyph}
                      accessibilityLabel={`${isBodyweight ? t('logger.field.repsOrTime') : t('activeWorkout.reps')} -`}
                      disabled={busy}
                      onPress={() => setReps(-1)}
                    />
                    <Metric value={draft.reps} size="large" style={styles.valueWrap} />
                    <IconSquare
                      compact
                      glyph="+"
                      glyphStyle={styles.stepperGlyph}
                      accessibilityLabel={`${isBodyweight ? t('logger.field.repsOrTime') : t('activeWorkout.reps')} +`}
                      disabled={busy}
                      onPress={() => setReps(1)}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.rirRow}>
                <Text style={styles.rirLabel}>{t('activeWorkout.rir')}</Text>
                {[null, 1, 2, 3].map((value) => (
                  <Pill
                    key={value ?? 'auto'}
                    label={value == null ? t('activeWorkout.rirAuto') : String(value)}
                    active={draft.rir === value}
                    onPress={() => setDraft((currentDraft) => ({ ...currentDraft, rir: value }))}
                  />
                ))}
              </View>

              {/* THE one solid-accent primary Button on the Today screen. */}
              <Button
                label={busy ? t('activeWorkout.saving') : t('activeWorkout.completeSet')}
                onPress={() => void completeSet()}
                disabled={busy || draft.reps <= 0}
                style={styles.cta}
              />

              <View style={styles.footerRow}>
                <Muted>{workoutComplete ? t('activeWorkout.workoutComplete') : t('activeWorkout.autoAdvance')}</Muted>
                {lastLogged ? (
                  <Pressable accessibilityRole="button" onPress={undoLast} disabled={busy} hitSlop={8}>
                    <Text style={styles.undoText}>{t('activeWorkout.undo')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          )}

          {current.type === 'cardio' ? (
            <View style={styles.footerRow}>
              <Muted>{workoutComplete ? t('activeWorkout.workoutComplete') : t('activeWorkout.autoAdvance')}</Muted>
              {lastLogged ? (
                <Pressable accessibilityRole="button" onPress={undoLast} disabled={busy} hitSlop={8}>
                  <Text style={styles.undoText}>{t('activeWorkout.undo')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {workoutComplete ? (
            <Button
              label={t('activeWorkout.finishWorkout')}
              onPress={onFinishWorkout}
              variant="secondary"
              style={styles.finish}
            />
          ) : null}

          {saveFailed ? <Text style={styles.dangerText}>{t('activeWorkout.saveFailed')}</Text> : null}

          <View style={styles.exerciseDots}>
            {exercises.map((exercise, index) => {
              const done = loggedCounts[exercise.id] ?? 0;
              const active = index === activeIndex;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={exercise.id}
                  onPress={() => setActiveIndex(index)}
                  style={[
                    styles.exerciseDot,
                    active && { backgroundColor: accent.fill, borderColor: accent.border },
                  ]}
                  hitSlop={6}
                >
                  <Text style={[styles.exerciseDotText, active && { color: accent.solid }]}>
                    {done}/{targetSetsFor(exercise)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space.lg },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  eyebrow: { ...typeScale.overline },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, alignItems: 'flex-start' },
  titleWrap: { flex: 1 },
  programTitle: { ...typeScale.title, color: colors.text },
  focus: { marginTop: space.xxs },
  counterChip: {
    height: 30,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: border.thin,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterText: { ...numType.small, color: colors.text2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginTop: space.lg },
  bodyText: { marginTop: space.md },
  warnText: { ...typeScale.caption, color: colors.warning, marginTop: space.sm },
  dangerText: { ...typeScale.caption, color: colors.danger, marginTop: space.sm },
  emptyBlock: { marginTop: space.lg, gap: space.xs },
  emptyTitle: { ...typeScale.title, color: colors.text },
  ctaLink: { ...typeScale.label, marginTop: space.sm },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, marginTop: space.lg },
  exerciseNameWrap: { flex: 1 },
  exerciseName: { ...typeScale.body, color: colors.text },
  skipBtn: {
    height: 30,
    minWidth: 56,
    borderRadius: radius.chip,
    borderWidth: border.thin,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: { ...typeScale.label, color: colors.text2 },
  lastSet: { marginTop: space.sm },
  adjustGrid: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  adjustGroup: { flex: 1, minWidth: 0 },
  fullWidth: { flex: 1 },
  adjustLabel: { ...typeScale.label, color: colors.text2, marginBottom: space.sm },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  // BLACKSTEEL graft: 22pt '800' glyphs in the 44×44 squares — mid-set tap targets read at arm's length.
  stepperGlyph: { fontSize: 22, fontWeight: '800' },
  valueWrap: { flex: 1, justifyContent: 'center' },
  rirRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', marginTop: space.lg },
  rirLabel: { ...typeScale.label, color: colors.text2, marginRight: space.xs },
  cta: { marginTop: space.lg },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, marginTop: space.md },
  undoText: { ...typeScale.label, color: colors.text2 },
  cardioBlock: { marginTop: space.md },
  cardioCta: { marginTop: space.md },
  presetGrid: { gap: space.sm, marginTop: space.md },
  presetBtn: {
    borderRadius: radius.md,
    borderWidth: border.thin,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  presetTitle: { ...typeScale.body, color: colors.text, marginBottom: space.xxs },
  detailsBtn: { alignSelf: 'center', marginTop: space.md, paddingVertical: space.xs, paddingHorizontal: space.md },
  detailsText: { ...typeScale.label, color: colors.text2 },
  finish: { marginTop: space.md },
  exerciseDots: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  exerciseDot: {
    minWidth: 44,
    borderRadius: radius.chip,
    borderWidth: border.thin,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    paddingHorizontal: space.xs,
    paddingVertical: space.xs,
    alignItems: 'center',
  },
  exerciseDotText: { ...numType.small, color: colors.text2 },
  disabled: { opacity: 0.4 },
  pressedSurface: { backgroundColor: colors.surface3 },
});
