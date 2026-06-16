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
import { Card, Muted } from '@/ui/primitives';
import { colors, fontSize, numberFamily, radius, space } from '@/ui/theme/tokens';
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

function AdjustButton({
  label,
  onPress,
  disabled = false,
  a11yLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  a11yLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.adjustBtn, disabled && styles.disabled, pressed && !disabled ? styles.pressed : null]}
      hitSlop={8}
    >
      <Text style={styles.adjustText}>{label}</Text>
    </Pressable>
  );
}

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

  return (
    <Card style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Muted>{t('activeWorkout.eyebrow')}</Muted>
          <Text style={styles.programTitle}>{today.title}</Text>
          <Muted>{today.focus}</Muted>
        </View>
        {exercises.length > 0 ? (
          <View style={styles.progressPill}>
            <Text style={styles.progressText}>
              {activeIndex + 1}/{exercises.length}
            </Text>
          </View>
        ) : null}
      </View>

      {loading ? <Muted style={styles.bodyText}>{t('activeWorkout.loading')}</Muted> : null}
      {loadFailed ? <Muted style={styles.errorText}>{t('activeWorkout.loadFailed')}</Muted> : null}

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
              <Text style={styles.ctaLink}>{t('activeWorkout.editProgram')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!loading && !loadFailed && slots.length > 0 && !current ? (
        <Muted style={styles.errorText}>{t('activeWorkout.missingProgram')}</Muted>
      ) : null}

      {current ? (
        <>
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
              style={({ pressed }) => [styles.skipBtn, activeIndex >= exercises.length - 1 && styles.disabled, pressed ? styles.pressed : null]}
              hitSlop={8}
            >
              <Text style={styles.skipText}>{t('activeWorkout.skip')}</Text>
            </Pressable>
          </View>

          {current.type === 'cardio' ? (
            <View style={styles.cardioBlock}>
              <Muted>{lastCardio ? t('activeWorkout.cardioLast', { summary: describeCardio(lastCardio) }) : t('activeWorkout.cardioBody')}</Muted>
              {lastCardio ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => completeCardio(lastCardio)}
                  style={({ pressed }) => [styles.primaryBtn, busy && styles.disabled, pressed ? styles.primaryPressed : null]}
                >
                  <Text style={styles.primaryText}>{busy ? t('activeWorkout.saving') : t('activeWorkout.repeatCardio')}</Text>
                </Pressable>
              ) : null}

              <View style={styles.presetGrid}>
                {cardioPresetsFor(current.id).map((preset, index) => (
                  <Pressable
                    key={`${preset.key}-${preset.durationSec}-${index}`}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => completeCardio(preset)}
                    style={({ pressed }) => [styles.presetBtn, busy && styles.disabled, pressed ? styles.pressed : null]}
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
                      <AdjustButton label="-" a11yLabel={`${t('activeWorkout.weight')} -`} disabled={busy} onPress={() => setWeight(-1)} />
                      <Text style={styles.valueText}>
                        {compactNumber(draft.weightDisplay, weightPrecision)}
                        <Text style={styles.unitText}> {weightUnit(unitSystem)}</Text>
                      </Text>
                      <AdjustButton label="+" a11yLabel={`${t('activeWorkout.weight')} +`} disabled={busy} onPress={() => setWeight(1)} />
                    </View>
                  </View>
                ) : null}

                <View style={[styles.adjustGroup, isBodyweight ? styles.fullWidth : null]}>
                  <Text style={styles.adjustLabel}>{isBodyweight ? t('logger.field.repsOrTime') : t('activeWorkout.reps')}</Text>
                  <View style={styles.adjustRow}>
                    <AdjustButton label="-" a11yLabel={`${isBodyweight ? t('logger.field.repsOrTime') : t('activeWorkout.reps')} -`} disabled={busy} onPress={() => setReps(-1)} />
                    <Text style={styles.valueText}>{draft.reps}</Text>
                    <AdjustButton label="+" a11yLabel={`${isBodyweight ? t('logger.field.repsOrTime') : t('activeWorkout.reps')} +`} disabled={busy} onPress={() => setReps(1)} />
                  </View>
                </View>
              </View>

              <View style={styles.rirRow}>
                <Text style={styles.rirLabel}>{t('activeWorkout.rir')}</Text>
                {[null, 1, 2, 3].map((value) => (
                  <Pressable
                    key={value ?? 'auto'}
                    accessibilityRole="button"
                    accessibilityState={{ selected: draft.rir === value }}
                    onPress={() => setDraft((currentDraft) => ({ ...currentDraft, rir: value }))}
                    style={[styles.rirPill, draft.rir === value ? styles.rirActive : null]}
                  >
                    <Text style={[styles.rirText, draft.rir === value ? styles.rirTextActive : null]}>
                      {value == null ? t('activeWorkout.rirAuto') : value}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={busy || draft.reps <= 0}
                onPress={completeSet}
                style={({ pressed }) => [styles.primaryBtn, (busy || draft.reps <= 0) && styles.disabled, pressed ? styles.primaryPressed : null]}
              >
                <Text style={styles.primaryText}>{busy ? t('activeWorkout.saving') : t('activeWorkout.completeSet')}</Text>
              </Pressable>

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
            <Pressable accessibilityRole="button" onPress={onFinishWorkout} style={({ pressed }) => [styles.finishBtn, pressed ? styles.primaryPressed : null]}>
              <Text style={styles.finishText}>{t('activeWorkout.finishWorkout')}</Text>
            </Pressable>
          ) : null}

          {saveFailed ? <Muted style={styles.errorText}>{t('activeWorkout.saveFailed')}</Muted> : null}

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
                  style={[styles.exerciseDot, active && styles.exerciseDotActive]}
                  hitSlop={6}
                >
                  <Text style={[styles.exerciseDotText, active && styles.exerciseDotTextActive]}>
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
  card: { marginTop: space.lg, padding: space.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, alignItems: 'flex-start' },
  titleWrap: { flex: 1 },
  programTitle: { color: colors.text, fontSize: fontSize.xl, fontWeight: '900', marginTop: 2 },
  progressPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cyan,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  progressText: { color: colors.cyan, fontWeight: '900' },
  bodyText: { marginTop: space.md },
  errorText: { color: colors.energyLo, marginTop: space.sm },
  emptyBlock: { marginTop: space.lg, gap: space.xs },
  emptyTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '900' },
  ctaLink: { color: colors.cyan, fontSize: fontSize.sm, fontWeight: '800', letterSpacing: 1, marginTop: space.sm },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, marginTop: space.lg },
  exerciseNameWrap: { flex: 1 },
  exerciseName: { color: colors.text, fontSize: fontSize.lg, fontWeight: '900' },
  skipBtn: {
    minWidth: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    alignItems: 'center',
  },
  skipText: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '800' },
  lastSet: { marginTop: space.sm },
  adjustGrid: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  adjustGroup: { flex: 1, minWidth: 0 },
  fullWidth: { flex: 1 },
  adjustLabel: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '800', marginBottom: 6 },
  adjustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  adjustBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.cyan,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustText: { color: colors.cyan, fontSize: 24, fontWeight: '900', lineHeight: 26 },
  valueText: { flex: 1, color: colors.text, fontFamily: numberFamily, fontSize: 28, fontWeight: '900', textAlign: 'center' },
  unitText: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '800' },
  rirRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap', marginTop: space.md },
  rirLabel: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '800', marginRight: space.xs },
  rirPill: {
    minWidth: 46,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    alignItems: 'center',
  },
  rirActive: { backgroundColor: colors.violet, borderColor: colors.violet },
  rirText: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '800' },
  rirTextActive: { color: colors.bg },
  primaryBtn: {
    minHeight: 58,
    borderRadius: radius.md,
    backgroundColor: colors.energyHi,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
    paddingHorizontal: space.md,
  },
  primaryText: { color: colors.flash, fontSize: fontSize.lg, fontWeight: '900', textAlign: 'center' },
  primaryPressed: { opacity: 0.75 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, marginTop: space.sm },
  undoText: { color: colors.cyan, fontSize: fontSize.sm, fontWeight: '900' },
  cardioBlock: { marginTop: space.md },
  presetGrid: { gap: space.sm, marginTop: space.md },
  presetBtn: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  presetTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '900', marginBottom: 2 },
  detailsBtn: { alignSelf: 'center', marginTop: space.md, paddingVertical: space.xs, paddingHorizontal: space.md },
  detailsText: { color: colors.cyan, fontSize: fontSize.sm, fontWeight: '900' },
  finishBtn: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surfaceAlt,
  },
  finishText: { color: colors.cyan, fontSize: fontSize.md, fontWeight: '900', textAlign: 'center' },
  exerciseDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md },
  exerciseDot: {
    minWidth: 42,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.xs,
    paddingVertical: 4,
    alignItems: 'center',
  },
  exerciseDotActive: { borderColor: colors.cyan, backgroundColor: colors.surfaceAlt },
  exerciseDotText: { color: colors.textDim, fontSize: 11, fontWeight: '800' },
  exerciseDotTextActive: { color: colors.cyan },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
});
