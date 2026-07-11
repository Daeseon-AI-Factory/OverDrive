import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import { getSessionActivitySummary } from '@/db/repos/sessionRepo';
import { getLastSetForExercise, updateSet } from '@/db/repos/setLogRepo';
import type { ExerciseRow } from '@/db/types';
import { useSessionStore } from '@/features/forge/sessionStore';
import { useEditIntentStore } from '@/features/quicklog/editIntentStore';
import { displayToKg, formatWeight, kgToDisplay, weightStepDisplay, weightUnit } from '@/lib/units';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button, Muted, Pill } from '@/ui/primitives';
import { colors, hangulSafeLetterSpacing, radius, space, tracking, typeScale } from '@/ui/theme/tokens';
import { Stepper } from './Stepper';
import { useLogSet } from './useLogSet';

/**
 * Low-friction set logger (spec §6.1). Prefilled from the last set; "repeat last set" logs in ONE
 * tap, steppers replace the keyboard. Weight is shown/edited in the user's units (kg/lb) but stored
 * canonical kg. Stays open after logging. Calls the unchanged useLogSet hot path (→ JUICE fires).
 *
 * Opens from TWO sources: the screen-level `exercise` prop (body-map picker) or the quicklog
 * intent store. A new-set intent prefills from history; an edit intent carries the exact saved row
 * and updates it in place. The screen-level prop wins when both are set.
 *
 * MONOLITH sheet chrome: opaque surface1 panel (no bleed-through under stepper digits), edge
 * highlight, lineStrong grabber. The log CTA is THE one solid-accent primary; repeat-last is the
 * tinted secondary.
 */
export function SetLoggerSheet({
  exercise: exerciseProp,
  ensureSession,
  onClose,
}: {
  exercise: ExerciseRow | null;
  ensureSession: () => Promise<string>;
  onClose: () => void;
}) {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const logSet = useLogSet();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const weightStepKg = useSettingsStore((s) => s.weightStep);

  const intent = useEditIntentStore((s) => s.intent);
  // Strength only — cardio has its own sheet; the quicklog card hides [수정] for cardio anyway.
  const exercise = exerciseProp ?? (intent?.exercise.type === 'strength' ? intent.exercise : null);
  const edit = exerciseProp == null && intent?.kind === 'edit' ? intent.saved : null;
  const close = useCallback(() => {
    useEditIntentStore.getState().close();
    onClose();
  }, [onClose]);

  const isBw = exercise?.is_bodyweight === 1;

  // weight is in DISPLAY units (kg or lb); lastSet keeps canonical kg for exact repeats.
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);
  const [rir, setRir] = useState<number | null>(null);
  const [lastSet, setLastSet] = useState<{ weightKg: number; reps: number; rir: number | null } | null>(null);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [weightDirty, setWeightDirty] = useState(false);

  useEffect(() => {
    if (!exercise) return;
    let alive = true;
    (async () => {
      if (edit) {
        setCount(0);
        setWeightDirty(false);
        setLastSet({ weightKg: edit.weightKg, reps: edit.reps, rir: edit.rir });
        setWeight(Math.round(kgToDisplay(edit.weightKg, unitSystem) * 10) / 10);
        setReps(edit.reps);
        setRir(edit.rir);
        return;
      }
      const last = await getLastSetForExercise(db, exercise.id);
      if (!alive) return;
      setCount(0); // fresh per-open counter — the intent path reopens without a key remount
      setWeightDirty(false);
      if (last) {
        setLastSet({ weightKg: last.weight, reps: last.reps, rir: last.rir });
        setWeight(Math.round(kgToDisplay(last.weight, unitSystem) * 10) / 10);
        setReps(last.reps);
        setRir(last.rir);
      } else {
        setLastSet(null);
        setWeight(exercise.is_bodyweight ? 0 : Math.round(kgToDisplay(20, unitSystem)));
        setReps(exercise.rep_low);
        setRir(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [db, edit, exercise, unitSystem]);

  const commitKg = async (weightKg: number, r: number, rv: number | null) => {
    if (!exercise || r <= 0 || busy) return;
    setBusy(true);
    try {
      const finalKg = exercise.is_bodyweight ? 0 : weightKg;
      if (edit) {
        if (!useSessionStore.getState().tryBeginLogWrite()) throw new Error('session_finishing');
        try {
          const result = await updateSet(db, {
            setId: edit.setId,
            weight: finalKg,
            reps: r,
            rir: rv,
          });
          const summary = await getSessionActivitySummary(db, result.row.session_id);
          useSessionStore.getState().reconcileActivity(result.row.session_id, summary.itemCount, summary.volumeKg);
          const power = await recomputeAndStore(db);
          useCombatPowerStore.getState().setSnapshot(power.score, power.grade.key);
          close();
        } finally {
          useSessionStore.getState().endLogWrite();
        }
        return;
      }
      const sid = await ensureSession();
      await logSet({
        sessionId: sid,
        exerciseId: exercise.id,
        weight: finalKg,
        reps: r,
        rir: rv,
        hitTargetReps: r >= exercise.rep_low,
        loggedVia: 'quick',
      });
      setCount((c) => c + 1);
      setLastSet({ weightKg: finalKg, reps: r, rir: rv });
    } finally {
      setBusy(false);
    }
  };

  const lastSetText = (() => {
    if (!lastSet) return t('logger.firstSet');
    const w = formatWeight(lastSet.weightKg, unitSystem); // '' for bodyweight
    const core = `${w ? `${w} × ` : ''}${lastSet.reps}${lastSet.rir != null ? t('logger.lastSetRir', { rir: lastSet.rir }) : ''}`;
    return t('logger.lastSet', { set: core });
  })();

  return (
    <Modal visible={!!exercise} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={[styles.sheet, { paddingBottom: Math.max(space.lg, insets.bottom) }]}>
        <View pointerEvents="none" style={styles.sheetEdge} />
        {exercise ? (
          <>
            <View style={styles.grabber} />
            <Text style={styles.title}>{t(`exercise.${exercise.id}`, { defaultValue: exercise.name })}</Text>
            <Muted style={styles.meta}>
              {lastSetText}
              {count > 0 ? t('logger.sessionSetCount', { count }) : ''}
            </Muted>

            {!isBw ? (
              <Stepper
                label={t('logger.field.weight')}
                value={weight}
                step={weightStepDisplay(unitSystem, weightStepKg)}
                min={0}
                max={2000}
                precision={1}
                unit={weightUnit(unitSystem)}
                onChange={(value) => {
                  setWeight(value);
                  setWeightDirty(true);
                }}
              />
            ) : null}
            <Stepper
              label={isBw ? t('logger.field.repsOrTime') : t('logger.field.reps')}
              value={reps}
              step={1}
              min={0}
              max={999}
              precision={0}
              onChange={setReps}
            />

            <Text
              style={[
                styles.fieldLabel,
                { letterSpacing: hangulSafeLetterSpacing(t('logger.rirLabel'), tracking.overline) },
              ]}
            >
              {t('logger.rirLabel')}
            </Text>
            <View style={styles.rirRow}>
              {[0, 1, 2, 3, 4].map((n) => (
                <Pill
                  key={n}
                  label={n === 4 ? t('logger.rirMaxPill') : String(n)}
                  active={rir === n}
                  onPress={() => setRir(rir === n ? null : n)}
                />
              ))}
            </View>

            {!edit ? (
              <Button
                label={t('logger.repeatLast')}
                variant="secondary"
                disabled={!lastSet || busy}
                onPress={() => lastSet && commitKg(lastSet.weightKg, lastSet.reps, lastSet.rir)}
                style={{ marginTop: space.xl }}
              />
            ) : null}
            <Button
              label={edit ? t('logger.saveChanges') : t('logger.logSet')}
              variant="primary"
              disabled={!reps || busy}
              onPress={() =>
                commitKg(edit && !weightDirty ? edit.weightKg : displayToKg(weight, unitSystem), reps, rir)
              }
              style={{ marginTop: edit ? space.xl : space.sm }}
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
  // Opaque machined panel — logger digits never fight scroll bleed-through.
  sheet: {
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
  title: { ...typeScale.title, color: colors.text },
  meta: { marginTop: space.xxs },
  fieldLabel: { ...typeScale.overline, marginTop: space.xl, marginBottom: space.sm },
  rirRow: { flexDirection: 'row', gap: space.sm },
  closeBtn: { alignSelf: 'center', paddingVertical: space.md, marginTop: space.sm },
});
